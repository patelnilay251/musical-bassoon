import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { mat4LookAt, mat4Perspective, mat4Mul, mat4Invert, transformPoint, Rng } from '../src/math.js';
import { ScreenTris, rasterize, projectPerspective } from '../src/raster.js';
import { MeshBuilder, finalizeMesh, triangulate, shoelace, CAST } from '../src/mesh.js';
import { crc32, encodePNG } from '../src/png.js';
import { BVH } from '../src/bvh.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('mat4Invert undoes a view-projection', () => {
  const m = mat4Mul(mat4Perspective(0.8, 1.5, 0.1, 100), mat4LookAt([3, 2, 5], [0, 1, 0]));
  const id = mat4Mul(mat4Invert(m), m);
  for (let i = 0; i < 16; i++) close(id[i], i % 5 === 0 ? 1 : 0, 1e-9);
});

test('lookAt puts the target straight ahead on -z', () => {
  const v = mat4LookAt([3, 2, 5], [0, 1, 0]);
  const p = transformPoint(v, [0, 1, 0]);
  close(p[0], 0);
  close(p[1], 0);
  assert.ok(p[2] < 0);
});

test('Rng is deterministic per seed and forks independently', () => {
  const a = new Rng(7);
  const b = new Rng(7);
  for (let i = 0; i < 100; i++) assert.equal(a.float(), b.float());
  assert.notEqual(new Rng(7).float(), new Rng(8).float());
});

test('rasterizer covers every sample of a two-triangle quad exactly once or more, never zero', () => {
  // Awkward, non-axis-aligned shared edge.
  const W = 97;
  const H = 61;
  const st = new ScreenTris(4);
  st.emit(0, 0, 0, 1, W, 0, 1, 13.3, H, 1, W, H);
  st.emit(1, W, 0, 2, W, H, 2, 13.3, H, 2, W, H);
  st.emit(2, 0, 0, 3, 13.3, H, 3, 0, H, 3, W, H);
  const depth = new Float32Array(W * H).fill(-Infinity);
  const ids = new Int32Array(W * H).fill(-1);
  rasterize(st, 0, 0, W, H, depth, ids);
  assert.equal(ids.indexOf(-1), -1, 'a sample fell through a shared edge');
  // Nearest (largest depth) wins where triangles overlap.
  const d2 = new Float32Array(W * H).fill(-Infinity);
  const i2 = new Int32Array(W * H).fill(-1);
  const st2 = new ScreenTris(2);
  st2.emit(0, 0, 0, 1, W, 0, 1, 0, H, 1, W, H);
  st2.emit(1, 0, 0, 5, W, 0, 5, 0, H, 5, W, H);
  rasterize(st2, 0, 0, W, H, d2, i2);
  assert.ok(i2.every((v) => v === 1 || v === -1));
});

test('tiled rasterization matches a single full-frame pass', () => {
  const b = new MeshBuilder();
  b.use(0, CAST);
  const rng = new Rng(3);
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-4, 4);
    const y = rng.range(0, 3);
    const z = rng.range(-4, 4);
    b.box(x, y, z, x + rng.range(0.2, 2), y + rng.range(0.2, 2), z + rng.range(0.2, 2));
  }
  const mesh = finalizeMesh(b);
  const W = 120;
  const H = 80;
  const vp = mat4Mul(mat4Perspective(0.9, W / H, 0.05, 100), mat4LookAt([7, 5, 9], [0, 1, 0]));
  const st = new ScreenTris(mesh.count + 64);
  projectPerspective(mesh, { vp, eye: [7, 5, 9], near: 0.05 }, W, H, 0, 0, st);
  const full = new Int32Array(W * H).fill(-1);
  rasterize(st, 0, 0, W, H, new Float32Array(W * H).fill(-Infinity), full);
  for (const [x0, y0] of [
    [0, 0],
    [64, 0],
    [0, 40],
    [64, 40],
  ]) {
    const x1 = Math.min(W, x0 + 64);
    const y1 = Math.min(H, y0 + 40);
    const tw = x1 - x0;
    const tile = new Int32Array(tw * (y1 - y0)).fill(-1);
    rasterize(st, x0, y0, x1, y1, new Float32Array(tile.length).fill(-Infinity), tile);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) assert.equal(tile[(y - y0) * tw + (x - x0)], full[y * W + x]);
  }
});

test('ear clipping triangulates a concave outline with the right area', () => {
  const L = [
    [0, 0],
    [0, 4],
    [4, 4],
    [4, 3],
    [1, 3],
    [1, 0],
  ];
  const tris = triangulate(shoelace(L) > 0 ? L.slice().reverse() : L);
  const p = shoelace(L) > 0 ? L.slice().reverse() : L;
  const area = tris.reduce((s, [a, b, c]) => s + Math.abs(shoelace([p[a], p[b], p[c]])), 0);
  close(area, 7);
  assert.equal(tris.length, 4);
});

test('box faces point outward', () => {
  const b = new MeshBuilder();
  b.box(-1, -1, -1, 1, 1, 1);
  const m = finalizeMesh(b);
  for (let t = 0; t < m.count; t++) {
    const o = t * 9;
    const cx = (m.pos[o] + m.pos[o + 3] + m.pos[o + 6]) / 3;
    const cy = (m.pos[o + 1] + m.pos[o + 4] + m.pos[o + 7]) / 3;
    const cz = (m.pos[o + 2] + m.pos[o + 5] + m.pos[o + 8]) / 3;
    assert.ok(cx * m.fn[t * 3] + cy * m.fn[t * 3 + 1] + cz * m.fn[t * 3 + 2] > 0);
  }
});

test('BVH any-hit agrees with brute force', () => {
  const b = new MeshBuilder();
  b.use(0, CAST);
  const rng = new Rng(11);
  for (let i = 0; i < 300; i++) {
    const x = rng.range(-20, 20);
    const y = rng.range(0, 8);
    const z = rng.range(-20, 20);
    b.box(x, y, z, x + rng.range(0.05, 3), y + rng.range(0.05, 3), z + rng.range(0.05, 3));
  }
  const mesh = finalizeMesh(b);
  const bvh = new BVH(mesh);
  const brute = (o, d) => {
    for (let t = 0; t < mesh.count; t++) {
      const p = mesh.pos;
      const q = t * 9;
      const e1 = [p[q + 3] - p[q], p[q + 4] - p[q + 1], p[q + 5] - p[q + 2]];
      const e2 = [p[q + 6] - p[q], p[q + 7] - p[q + 1], p[q + 8] - p[q + 2]];
      const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-12) continue;
      const tv = [o[0] - p[q], o[1] - p[q + 1], o[2] - p[q + 2]];
      const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
      if (u < 0 || u > 1) continue;
      const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
      const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
      if (v < 0 || u + v > 1) continue;
      if ((e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det > 1e-4) return true;
    }
    return false;
  };
  let hits = 0;
  for (let i = 0; i < 1500; i++) {
    const o = [rng.range(-25, 25), rng.range(-1, 10), rng.range(-25, 25)];
    let d = [rng.range(-1, 1), rng.range(-0.3, 1), rng.range(-1, 1)];
    const l = Math.hypot(...d);
    d = d.map((c) => c / l);
    const expect = brute(o, d);
    assert.equal(bvh.occluded(o[0], o[1], o[2], d[0], d[1], d[2]), expect, `ray ${i}`);
    if (expect) hits++;
  }
  assert.ok(hits > 100 && hits < 1400, 'test rays should both hit and miss');
});

test('png: CRC matches the reference and pixels round-trip', () => {
  assert.equal(crc32(Buffer.from('IEND', 'ascii')), 0xae426082);
  const W = 23;
  const H = 17;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const rng = new Rng(5);
  for (let i = 0; i < rgba.length; i++) rgba[i] = i % 4 === 3 ? 255 : Math.floor(rng.float() * 256);
  const png = encodePNG(rgba, W, H);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // Decode: find IDAT, inflate, undo filters.
  let o = 8;
  let idat = Buffer.alloc(0);
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    assert.equal(png.readUInt32BE(o + 8 + len), crc32(png, o + 4, o + 8 + len), `${type} crc`);
    if (type === 'IDAT') idat = Buffer.concat([idat, png.subarray(o + 8, o + 8 + len)]);
    o += 12 + len;
  }
  const raw = inflateSync(idat);
  const stride = W * 3;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const row = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? row[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      row[i] = (row[i] + pred) & 255;
    }
    for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) assert.equal(row[x * 3 + k], rgba[(y * W + x) * 4 + k]);
    prev = row;
  }
});
