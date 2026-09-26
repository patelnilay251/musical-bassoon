import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlace } from '../src/scenes/index.js';
import { propsAt } from '../src/visitor.js';
import { Renderer, KIND } from '../src/render.js';
import { skyState } from '../src/sky.js';
import { packMesh, packMaterials, packShades, packFrame, shadowMatrix, VERTEX_BYTES, MATERIAL_FLOATS, FRAME_FLOATS } from '../src/live/pack.js';
import { buildWalk, walk, standAt, floorAt, WALKER } from '../src/live/walk.js';
import { SCENE_WGSL, POST_WGSL } from '../src/live/wgsl.js';

const motel = buildPlace('motel', propsAt('motel', 16.2), 'cobalt');

function area(P) {
  const e0 = [P[3] - P[0], P[4] - P[1], P[5] - P[2]];
  const e1 = [P[6] - P[0], P[7] - P[1], P[8] - P[2]];
  return Math.hypot(e0[1] * e1[2] - e0[2] * e1[1], e0[2] * e1[0] - e0[0] * e1[2], e0[0] * e1[1] - e0[1] * e1[0]) / 2;
}

test('the live mesh is the painted mesh, with big triangles cut small where a camera can go', () => {
  const box = motel.shadowBox;
  const { data, count } = packMesh(motel.mesh, box);
  assert.equal(data.byteLength, count * VERTEX_BYTES);
  assert.equal(count % 3, 0);
  const f = new Float32Array(data);
  const u = new Uint32Array(data);
  let packed = 0;
  let original = 0;
  const mats = new Set();
  for (let t = 0; t < count / 3; t++) {
    const P = [];
    for (let k = 0; k < 3; k++) P.push(f[(t * 3 + k) * 10], f[(t * 3 + k) * 10 + 1], f[(t * 3 + k) * 10 + 2]);
    packed += area(P);
    mats.add(u[t * 30 + 8] & 0xffff);
    // Inside the zone, nothing longer than 40 m is left.
    const inside = [0, 3, 6].every((o) => P[o] > box.min[0] && P[o] < box.max[0] && P[o + 2] > box.min[2] && P[o + 2] < box.max[2]);
    if (inside) {
      for (let e = 0; e < 3; e++) {
        const a = e * 3;
        const b = ((e + 1) % 3) * 3;
        assert.ok(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]) <= 40.001);
      }
    }
  }
  for (let t = 0; t < motel.mesh.count; t++) original += area(Array.from(motel.mesh.pos.subarray(t * 9, t * 9 + 9)));
  assert.ok(Math.abs(packed - original) / original < 1e-4, 'cutting triangles lost or gained area');
  assert.equal(mats.size, new Set(motel.mesh.mat).size);
});

test('materials go to the GPU with their kinds, patterns, power and road lanes', () => {
  const { data, count, lanes } = packMaterials(motel);
  const f = new Float32Array(data);
  const u = new Uint32Array(data);
  assert.equal(count, motel.materials.length);
  motel.materials.forEach((m, i) => {
    assert.equal(u[i * MATERIAL_FLOATS + 3], KIND[m.kind ?? 'diffuse'], m.name);
  });
  const road = motel.materials.findIndex((m) => m.name === 'road');
  assert.equal(u[road * MATERIAL_FLOATS + 19], 2);
  assert.deepEqual(Array.from(lanes.subarray(u[road * MATERIAL_FLOATS + 18], u[road * MATERIAL_FLOATS + 18] + 2)), motel.materials[road].lanes.centers.map(Math.fround));
  const visitor = motel.materials.findIndex((m) => m.name === 'visitorGlass');
  assert.equal(f[visitor * MATERIAL_FLOATS + 12], motel.emitScale.visitorGlass);
});

test("the live painter mixes shade with the painter's own numbers", () => {
  const S = skyState(16.2, motel.sky, 'cobalt');
  const live = packShades(motel, S);
  const r = new Renderer(motel, { shadowSize: 64 });
  r.setTime(16.2);
  for (let m = 0; m < motel.materials.length; m++) {
    for (let k = 0; k < 3; k++) {
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(live[m * 12 + k * 4 + c] - r.mShade[m * 9 + k * 3 + c]) < 1e-6);
    }
  }
});

test('the sun sees the whole shadow box, and a frame is one block of uniforms', () => {
  const S = skyState(16.2, motel.sky, 'cobalt');
  const sh = shadowMatrix(S, motel.shadowBox);
  const { min, max } = motel.shadowBox;
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    const m = sh.m;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    assert.ok(x >= -1.000001 && x <= 1.000001 && y >= -1.000001 && y <= 1.000001 && z >= 0 && z <= 1, `corner ${i}`);
  }
  const cam = { eye: [-56, 1.6, 1.5], target: [-46, 1.6, 1.5], fovY: 30, shift: 0.4 };
  const frame = (look, mirror) => packFrame({ cam, W: 300, H: 200, S: skyState(16.2, motel.sky, look), look, shadow: sh, shadowSize: 4096, rippleT: 1, lightCount: 32, hasPool: true, mirror });
  const f = frame('cobalt', false);
  assert.equal(f.length, FRAME_FLOATS);
  assert.deepEqual(Array.from(f.subarray(48, 51)), cam.eye.map(Math.fround));
  assert.equal(f[145], 1, 'cobalt mixes its shade');
  assert.equal(frame('pastel', false)[145], 0, 'pastel does not');
  assert.equal(frame('cobalt', true)[139], 1, 'the mirrored pass knows it');
  assert.ok(SCENE_WGSL.includes('fn fs_main') && SCENE_WGSL.includes('fn vs_shadow') && POST_WGSL.includes('fn fs_final'));
});

test('a walker can climb the motel stairs, but not walk through walls or into the pool', () => {
  const W = buildWalk(motel);
  const B = motel.layout.block;
  // From the parking lot up the stairs at the north end to the walkway.
  let p = standAt(W, -1, B.z0 - 6);
  assert.ok(p && p.y < 0.5);
  for (let i = 0; i < 60; i++) p = walk(W, p, 0, 0.25);
  assert.ok(Math.abs(p.y - B.F1) < 0.05, `walkway at ${B.F1}, walker at ${p.y}`);
  // Along the ground floor, straight at the rooms: stopped by the wall.
  let q = standAt(W, -3, 0);
  for (let i = 0; i < 40; i++) q = walk(W, q, 0.25, 0);
  assert.ok(q.x < -WALKER.radius + 0.05, `walked into the rooms (x ${q.x})`);
  // At the pool: never onto the water.
  const pool = motel.pool;
  let r = standAt(W, pool.x0 - 1.5, (pool.z0 + pool.z1) / 2);
  for (let i = 0; i < 40; i++) r = walk(W, r, 0.25, 0);
  assert.ok(r.x < pool.x0, 'walked into the pool');
  assert.ok(Number.isNaN(floorAt(W, 1e6, 0, 10)), 'off the map there is no floor');
});
