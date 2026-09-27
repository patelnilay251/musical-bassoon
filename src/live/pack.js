// A place packed for the live painter: its triangles as one vertex buffer,
// its materials, lights, pool, clouds and road lanes as flat arrays laid
// out the way src/live/wgsl.js reads them, and each moment of the day as
// one block of uniforms. Plain data and no GPU calls, so it runs in Node.

import { KIND, PATTERN, paintShade } from '../render.js';
import { hex, mat4LookAt, mat4Mul, normalize, cross, DEG } from '../math.js';
import { skyState, SEA_LEVEL } from '../sky.js';
import { lookOf } from '../looks.js';
import { CAST, DOUBLE, DISTANT } from '../mesh.js';

// One vertex: position (3 floats), normal (3), uv (2), then two words:
// material | flags << 16, and the object id.
export const VERTEX_BYTES = 40;
export const MATERIAL_FLOATS = 24;
export const LIGHT_FLOATS = 8;
export const FRAME_FLOATS = 208;
export const WATER_FLOATS = 240;

// Big triangles (the highway and its painted lines run for kilometers) are
// cut along a grid of GRID-meter squares where they pass through `zone`,
// the part of a place (or of the town) a camera can be. Across a triangle
// that size a GPU sets up depth too coarsely where it passes the camera,
// and lines laid a centimeter above the asphalt sink under it. Every big
// triangle is cut on the same lines, so neighbors still meet corner to
// corner.
const MAX_EDGE = 40;
const GRID = 28;
const MARGIN = 150;

// `paneOf` (from packPanes) rides in the top half of each triangle's
// object id: the pane of glass it belongs to, counted from 1. With `bin`,
// the triangles are laid out square by square of ground (`bin` meters on
// a side), each run in `parts` with its bounds, so a renderer can leave
// out what a camera cannot see; the open water (materials in `sea`) in
// runs of its own, marked, so it knows whether any is in view.
export function packMesh(mesh, zone = null, paneOf = null, { bin = 0, sea = null } = {}) {
  const out = [];
  const Z = zone ? [zone.min[0] - MARGIN, zone.max[0] + MARGIN, zone.min[2] - MARGIN, zone.max[2] + MARGIN] : [-Infinity, Infinity, -Infinity, Infinity];
  const emit = (poly, ids, obj) => {
    for (let k = 1; k + 1 < poly.length; k++) {
      const V = [poly[0], poly[k], poly[k + 1]];
      out.push(
        V.map((v) => v.p),
        V.map((v) => v.n),
        V.map((v) => v.t),
        ids,
        obj,
      );
    }
  };
  const tri = (P, N, T, ids, obj) => {
    let best = 0;
    for (let e = 0; e < 3; e++) {
      const a = P[e];
      const b = P[(e + 1) % 3];
      best = Math.max(best, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    if (best <= MAX_EDGE || (ids >>> 16) & DISTANT) {
      out.push(P, N, T, ids, obj);
      return;
    }
    // What lies outside the zone stays in big pieces; what lies in it is
    // cut square by square.
    let poly = [0, 1, 2].map((k) => ({ p: P[k], n: N[k], t: T[k] }));
    for (const [axis, v, keep] of [
      [0, Z[0], 1],
      [0, Z[1], -1],
      [2, Z[2], 1],
      [2, Z[3], -1],
    ]) {
      if (!Number.isFinite(v)) continue;
      const [inside, outside] = split(poly, axis, v, keep);
      if (outside.length >= 3) emit(outside, ids, obj);
      poly = inside;
      if (poly.length < 3) return;
    }
    let xa = Infinity;
    let xb = -Infinity;
    for (const v of poly) {
      xa = Math.min(xa, v.p[0]);
      xb = Math.max(xb, v.p[0]);
    }
    for (let i = Math.floor(xa / GRID); i * GRID < xb; i++) {
      const col = split(split(poly, 0, i * GRID, 1)[0], 0, (i + 1) * GRID, -1)[0];
      if (col.length < 3) continue;
      let za = Infinity;
      let zb = -Infinity;
      for (const v of col) {
        za = Math.min(za, v.p[2]);
        zb = Math.max(zb, v.p[2]);
      }
      for (let j = Math.floor(za / GRID); j * GRID < zb; j++) {
        const sq = split(split(col, 2, j * GRID, 1)[0], 2, (j + 1) * GRID, -1)[0];
        if (sq.length >= 3) emit(sq, ids, obj);
      }
    }
  };
  for (let t = 0; t < mesh.count; t++) {
    const P = [0, 1, 2].map((k) => [mesh.pos[t * 9 + k * 3], mesh.pos[t * 9 + k * 3 + 1], mesh.pos[t * 9 + k * 3 + 2]]);
    const N = [0, 1, 2].map((k) => [mesh.nrm[t * 9 + k * 3], mesh.nrm[t * 9 + k * 3 + 1], mesh.nrm[t * 9 + k * 3 + 2]]);
    const T = [0, 1, 2].map((k) => [mesh.uv[t * 6 + k * 2], mesh.uv[t * 6 + k * 2 + 1]]);
    if (mesh.obj[t] > 0xffff) throw new Error('too many objects for the live painter');
    tri(P, N, T, mesh.mat[t] | (mesh.flags[t] << 16), mesh.obj[t] | ((paneOf ? paneOf[t] : 0) << 16));
  }
  // One-sided triangles first, then two-sided ones: the painter culls the
  // back faces of all but the two-sided (raster.js), and so will the GPU.
  // Within each, square by square; what spans many squares (the sea to the
  // horizon) goes in a square of its own.
  const tris = out.length / 5;
  const key = new Float64Array(tris);
  for (let t = 0; t < tris; t++) {
    const P = out[t * 5];
    const dbl = (out[t * 5 + 3] >>> 16) & DOUBLE ? 1 : 0;
    let k = 0;
    if (bin > 0) {
      const x0 = Math.min(P[0][0], P[1][0], P[2][0]);
      const x1 = Math.max(P[0][0], P[1][0], P[2][0]);
      const z0 = Math.min(P[0][2], P[1][2], P[2][2]);
      const z1 = Math.max(P[0][2], P[1][2], P[2][2]);
      k = x1 - x0 > bin * 2 || z1 - z0 > bin * 2 ? -1 : (Math.floor((x0 + x1) / 2 / bin) + 32768) * 65536 + Math.floor((z0 + z1) / 2 / bin) + 32768;
    }
    const wet = sea && sea.has(out[t * 5 + 3] & 0xffff) ? 1 : 0;
    key[t] = dbl * 2 ** 41 + wet * 2 ** 40 + k;
  }
  const order = Array.from({ length: tris }, (_, t) => t).sort((a, b) => key[a] - key[b] || a - b);
  let single = 0;
  while (single < tris && !((out[order[single] * 5 + 3] >>> 16) & DOUBLE)) single++;
  const parts = [];
  for (let i = 0; i < tris; i++) {
    const t = order[i];
    let part = parts[parts.length - 1];
    if (!part || part.key !== key[t]) {
      const wet = Boolean(sea && sea.has(out[t * 5 + 3] & 0xffff));
      parts.push((part = { key: key[t], first: i * 3, count: 0, double: i >= single, sea: wet, box: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] } }));
    }
    part.count += 3;
    for (const v of out[t * 5]) {
      for (let c = 0; c < 3; c++) {
        if (v[c] < part.box.min[c]) part.box.min[c] = v[c];
        if (v[c] > part.box.max[c]) part.box.max[c] = v[c];
      }
    }
  }
  const n = tris * 3;
  const buf = new ArrayBuffer(n * VERTEX_BYTES);
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);
  for (let t = 0; t < tris; t++) {
    const src = order[t];
    const [P, N, T, ids, obj] = out.slice(src * 5, src * 5 + 5);
    for (let k = 0; k < 3; k++) {
      const o = (t * 3 + k) * 10;
      f[o] = P[k][0];
      f[o + 1] = P[k][1];
      f[o + 2] = P[k][2];
      f[o + 3] = N[k][0];
      f[o + 4] = N[k][1];
      f[o + 5] = N[k][2];
      f[o + 6] = T[k][0];
      f[o + 7] = T[k][1];
      u[o + 8] = ids;
      u[o + 9] = obj;
    }
  }
  return { data: buf, count: n, single: single * 3, parts: parts.map(({ key: _, ...p }) => p) };
}

// A convex polygon of { p, n, t } corners cut by the plane where coordinate
// `axis` is v: [the part on the `keep` side (+1: above v), the rest], with
// normals and texture coordinates carried along the cut.
function split(poly, axis, v, keep) {
  const a = [];
  const b = [];
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k];
    const Q = poly[(k + 1) % poly.length];
    const dp = (P.p[axis] - v) * keep;
    const dq = (Q.p[axis] - v) * keep;
    (dp >= 0 ? a : b).push(P);
    if (dp >= 0 !== dq >= 0) {
      const s = dp / (dp - dq);
      const mix = (x, y) => x.map((c, i) => c + (y[i] - c) * s);
      const p = mix(P.p, Q.p);
      // Exactly on the line, whichever side it was reached from.
      p[axis] = v;
      const cut = { p, n: mix(P.n, Q.n), t: mix(P.t, Q.t) };
      a.push(cut);
      b.push(cut);
    }
  }
  return [a, b];
}

// Panes of glass a walker can look into (wgsl.js interior()): the upright
// glass of each object, face by face, with its extent along the face and
// up it. The glass of cars and boats stays glass.
export const PANE_FLOATS = 8;
const ROOM_GLASS = new Set(['glass', 'roomGlass']);

export function packPanes(world) {
  const mesh = world.mesh;
  const paneOf = new Uint32Array(mesh.count);
  const groups = new Map();
  for (let t = 0; t < mesh.count; t++) {
    const m = world.materials[mesh.mat[t]];
    if (!ROOM_GLASS.has(m.name) || mesh.flags[t] & DISTANT) continue;
    const nx = mesh.fn[t * 3];
    const nz = mesh.fn[t * 3 + 2];
    const h = Math.hypot(nx, nz);
    if (h < 0.98) continue;
    const key = `${mesh.obj[t]} ${Math.round((nx / h) * 24)} ${Math.round((nz / h) * 24)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { tris: [], nx: 0, nz: 0 }));
    g.tris.push(t);
    g.nx += nx / h;
    g.nz += nz / h;
  }
  const data = [];
  for (const g of groups.values()) {
    const l = Math.hypot(g.nx, g.nz);
    const nx = g.nx / l;
    const nz = g.nz / l;
    let a0 = Infinity;
    let a1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let w = 0;
    for (const t of g.tris) {
      for (let k = 0; k < 3; k++) {
        const x = mesh.pos[t * 9 + k * 3];
        const y = mesh.pos[t * 9 + k * 3 + 1];
        const z = mesh.pos[t * 9 + k * 3 + 2];
        const a = -nz * x + nx * z;
        a0 = Math.min(a0, a);
        a1 = Math.max(a1, a);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        w += nx * x + nz * z;
      }
    }
    const n = data.length / PANE_FLOATS + 1;
    if (n > 0xffff) break;
    for (const t of g.tris) paneOf[t] = n;
    // What is inside: a motel room, a shop on the boulevard, or a lounge.
    const mat = world.materials[mesh.mat[g.tris[0]]];
    const style = mat.name === 'roomGlass' ? 0 : (mat.place ?? world.id) === 'boulevard' ? 1 : 2;
    // Last, how far along its normal the pane's plane lies.
    data.push(a0, a1, y0, y1, nx, nz, style, w / (g.tris.length * 3));
  }
  return { data: Float32Array.from(data.length ? data : new Array(PANE_FLOATS).fill(0)), paneOf, count: data.length / PANE_FLOATS };
}

// Materials, with the power the world gives each lamp and sign, and the
// road lanes their tar is worn by.
// The grain a walker sees at arm's length and a painting never shows
// (wgsl.js detail()), by material: live only, and faded out long before
// the distances the painted views are taken from.
export const DETAIL = { none: 0, stucco: 1, asphalt: 2, concrete: 3, bark: 4, sand: 5, wood: 6, grass: 7, leaves: 8 };
const DETAIL_OF = {
  stucco: 'stucco',
  wall: 'stucco',
  accent: 'stucco',
  trim: 'stucco',
  boundary: 'stucco',
  salmon: 'stucco',
  mint: 'stucco',
  butter: 'stucco',
  lilac: 'stucco',
  skyBlue: 'stucco',
  asphalt: 'asphalt',
  road: 'asphalt',
  lot: 'asphalt',
  drive: 'asphalt',
  sidewalk: 'concrete',
  deck: 'concrete',
  coping: 'concrete',
  curb: 'concrete',
  trunk: 'bark',
  fanTrunk: 'bark',
  sand: 'sand',
  wetSand: 'sand',
  planks: 'wood',
  teak: 'wood',
  lawn: 'grass',
  lawnTown: 'grass',
  field: 'grass',
  hedge: 'leaves',
  bush: 'leaves',
  shrub: 'leaves',
  bark: 'bark',
  eucalyptus: 'leaves',
  cypress: 'leaves',
  canopy: 'leaves',
  scrub: 'leaves',
  icePlant: 'leaves',
  fanLeafLight: 'leaves',
  fanLeafOld: 'leaves',
};

export function packMaterials(world) {
  const mats = world.materials;
  const power = world.emitScale ?? {};
  const buf = new ArrayBuffer(Math.max(1, mats.length) * MATERIAL_FLOATS * 4);
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);
  const lanes = [];
  mats.forEach((m, i) => {
    const o = i * MATERIAL_FLOATS;
    const c = hex(m.color ?? '#ff00ff');
    const c2 = hex(m.color2 ?? m.color ?? '#ff00ff');
    const e = hex(m.emit ?? '#000000');
    f.set(c, o);
    u[o + 3] = KIND[m.kind ?? 'diffuse'];
    f.set(c2, o + 4);
    u[o + 7] = PATTERN[m.pattern ?? 'none'];
    f.set(e, o + 8);
    f[o + 11] = m.scale ?? 1;
    f[o + 12] = m.power ?? power[m.name] ?? 1;
    u[o + 13] = m.ao ? 1 : 0;
    u[o + 14] = m.curtains ? 1 : 0;
    u[o + 15] = m.switched ? 1 : 0;
    if (m.lanes) {
      f[o + 16] = m.lanes.ax;
      f[o + 17] = m.lanes.az;
      u[o + 18] = lanes.length;
      u[o + 19] = m.lanes.centers.length;
      lanes.push(...m.lanes.centers);
    }
    u[o + 20] = DETAIL[DETAIL_OF[m.name] ?? 'none'];
    // In the town, where the material's place stands (town.js).
    if (m.origin) f.set(m.origin, o + 21);
  });
  return { data: buf, count: mats.length, lanes: Float32Array.from(lanes.length ? lanes : [0]) };
}

// Pools of lamplight, each dimmed or not by the power to its material.
export function packLights(world, list = world.lights ?? []) {
  const power = world.emitScale ?? {};
  const f = new Float32Array(Math.max(1, list.length) * LIGHT_FLOATS);
  list.forEach((L, i) => {
    const o = i * LIGHT_FLOATS;
    f.set(L.p, o);
    f[o + 3] = L.r;
    f.set(L.c, o + 4);
    f[o + 7] = L.k * (L.emit && power[L.emit] !== undefined ? power[L.emit] : 1);
  });
  return { data: f, count: list.length };
}

// Which lamps can light where: the ground cut into squares `cell` meters
// on a side, each listing the lamps (by their place in packLights' list)
// whose light can fall in it. A lamp lights nothing farther than four of
// its radii (wgsl.js), so every point sees exactly the lamps it would if
// it asked them all. Laid out as u32s: x0, z0, cell (as f32 bits), the
// squares across and down, three spare; each square's first index and
// count; then the indices.
export const LAMP_CELL = 16;

export function packLampGrid(list = [], cell = LAMP_CELL) {
  if (!list.length) return new Uint32Array(8 + 2);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const L of list) {
    const r = L.r * 4;
    x0 = Math.min(x0, L.p[0] - r);
    z0 = Math.min(z0, L.p[2] - r);
    x1 = Math.max(x1, L.p[0] + r);
    z1 = Math.max(z1, L.p[2] + r);
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const cells = Array.from({ length: nx * nz }, () => []);
  list.forEach((L, k) => {
    const r = L.r * 4;
    const i0 = Math.max(0, Math.floor((L.p[0] - r - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((L.p[0] + r - x0) / cell));
    const j0 = Math.max(0, Math.floor((L.p[2] - r - z0) / cell));
    const j1 = Math.min(nz - 1, Math.floor((L.p[2] + r - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * nx + i].push(k);
  });
  const total = cells.reduce((n, c) => n + c.length, 0);
  const u = new Uint32Array(8 + nx * nz * 2 + total);
  const f = new Float32Array(u.buffer);
  f[0] = x0;
  f[1] = z0;
  f[2] = cell;
  u[3] = nx;
  u[4] = nz;
  let at = 8 + nx * nz * 2;
  cells.forEach((c, i) => {
    u[8 + i * 2] = at;
    u[8 + i * 2 + 1] = c.length;
    for (const k of c) u[at++] = k;
  });
  return u;
}

// The sky's cast: clouds (with their puffs), streaks and gulls.
export function packSky(sky = {}) {
  const clouds = sky.clouds ?? [];
  const streaks = sky.streaks ?? [];
  const gulls = sky.gulls ?? [];
  const c0 = 2;
  const s0 = c0 + clouds.length * 2;
  const g0 = s0 + streaks.length;
  const p0 = g0 + gulls.length * 2;
  const puffs = clouds.reduce((n, c) => n + c.puffs.length, 0);
  const f = new Float32Array((p0 + puffs + 1) * 4);
  f.set([clouds.length, streaks.length, gulls.length, 0], 0);
  f.set([c0, s0, g0, p0], 4);
  let p = p0;
  clouds.forEach((c, i) => {
    f.set([c.az, c.base, c.top, c.half], (c0 + i * 2) * 4);
    f.set([p, c.puffs.length, 0, 0], (c0 + i * 2 + 1) * 4);
    for (const q of c.puffs) f.set([q.x, q.y, q.r, 0], p++ * 4);
  });
  streaks.forEach((s, i) => f.set([s.az, s.el, s.w, s.h], (s0 + i) * 4));
  gulls.forEach((g, i) => {
    f.set([g.az, g.el, g.s, g.a], (g0 + i * 2) * 4);
    f.set([g.flap ?? 1, g.w ?? 1, 0, 0], (g0 + i * 2 + 1) * 4);
  });
  return f;
}

// A place's water: its pools, if it has any, and its open water (a harbor,
// the sea off the beach), if it has that. In the town the sea's waves are
// the beach's and the harbor's the marina's, each laid from its place's
// origin, as a pool's are.
export function packWater(world) {
  const f = new Float32Array(WATER_FLOATS);
  const pools = (world.pools ?? (world.pool ? [world.pool] : [])).slice(0, 2);
  pools.forEach((pool, i) => {
    const o = i * 44;
    const [ox, oz] = pool.origin ?? [0, 0];
    f.set([pool.x0, pool.x1, pool.z0, pool.z1], o);
    f.set([pool.waterY, pool.floorY, Math.min(4, pool.waves.length), ox], o + 4);
    f.set([...pool.tile.slice(0, 3), oz], o + 8);
    f.set(pool.lane, o + 12);
    f.set(pool.water, o + 16);
    f.set(pool.glow, o + 20);
    pool.waves.slice(0, 4).forEach((w, k) => {
      f.set([w.kx, w.kz, w.w, w.p], o + 24 + k * 4);
      f[o + 40 + k] = w.a;
    });
  });
  f[88] = pools.length;
  // No harbor unless there is one: an empty rectangle.
  f.set([1e9, -1e9, 1e9, -1e9], 128);
  f.set([1, 0, 0, 0], 132);
  const water = world.water;
  if (water) {
    const waves = (list, at, amps) =>
      list.slice(0, 4).forEach((w, k) => {
        f.set([w.kx, w.kz, w.w, w.p], at + k * 4);
        f[amps + k] = w.a;
      });
    f[90] = Math.min(4, water.waves.length);
    waves(water.waves, 92, 108);
    f.set([...water.near, water.falloff ?? 160], 112);
    f.set([...water.far, water.shallow ? 1 : 0], 116);
    f.set([...water.near, water.falloff ?? 160], 136);
    f.set([...water.far, 0], 140);
    f.set([...(water.origin ?? [0, 0]), 0, 0], 228);
    if (water.shallow) {
      // The waterline, point by point; a place's straight shallows line
      // (the beach's, along x = -d) as two.
      const coast = water.coast ?? [
        [-1e6, -water.shallow.d, 1],
        [1e6, -water.shallow.d, 1],
      ];
      f[120] = water.shallow.w;
      f[122] = Math.min(16, coast.length);
      f.set([...water.shallow.color, 0], 124);
      coast.slice(0, 16).forEach(([z, x, sand], k) => f.set([z, x, sand, 0], 144 + k * 4));
    }
    const H = water.harbor;
    if (H) {
      f.set([H.x0, H.x1, H.z0, H.z1], 128);
      f.set([H.edge, 0, 0, 0], 132);
      f.set([...H.near, H.falloff ?? 260], 136);
      f.set([...H.far, 0], 140);
      waves(H.waves, 208, 224);
      f.set(H.origin ?? [0, 0], 230);
      f[232] = Math.min(4, H.waves.length);
    }
  }
  return f;
}

// Each material's painted shade (up, side, down), for looks that mix
// their shade; the same numbers Renderer.computeShades makes.
export function packShades(world, S) {
  const mats = world.materials;
  const f = new Float32Array(Math.max(1, mats.length) * 12);
  const up = [S.amb[0] * 0.82, S.amb[1] * 0.84, S.amb[2] * 0.92];
  const tmp = new Float64Array(9);
  mats.forEach((m, i) => {
    const c = hex(m.color ?? '#ff00ff');
    paintShade(c, up, tmp, 0);
    paintShade(c, S.amb, tmp, 3);
    paintShade(c, S.ground, tmp, 6);
    for (let k = 0; k < 3; k++) f.set([tmp[k * 3], tmp[k * 3 + 1], tmp[k * 3 + 2], 0], i * 12 + k * 4);
  });
  return f;
}

// ------------------------------------------------------------------ cameras

// A projection for WebGPU with the painter's lens shift: infinite far
// plane, reversed depth (1 at the near plane, 0 at infinity).
export function projection(fovY, aspect, shift, near = 0.05) {
  const f = 1 / Math.tan((fovY * DEG) / 2);
  const m = new Float64Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[9] = shift;
  m[11] = -1;
  m[14] = near;
  return m;
}

export function basis(eye, target) {
  const fw = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  let r = cross(fw, [0, 1, 0]);
  if (Math.hypot(r[0], r[1], r[2]) < 1e-9) r = cross(fw, [0, 0, 1]);
  r = normalize(r);
  return { f: fw, r, u: cross(r, fw) };
}

// The sun's (or moon's) orthographic view over the place's shadow box, as
// Renderer.buildShadow lays it: depth runs away from the light, 0 to 1.
export function shadowMatrix(S, box) {
  const d = S.keyDir;
  const up0 = Math.abs(d[1]) > 0.995 ? [0, 0, 1] : [0, 1, 0];
  const right = normalize(cross(d, up0));
  const up = cross(right, d);
  let umin = Infinity;
  let umax = -Infinity;
  let vmin = Infinity;
  let vmax = -Infinity;
  let dmin = Infinity;
  let dmax = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]];
    const u = p[0] * right[0] + p[1] * right[1] + p[2] * right[2];
    const v = p[0] * up[0] + p[1] * up[1] + p[2] * up[2];
    const w = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
    umin = Math.min(umin, u);
    umax = Math.max(umax, u);
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
    dmin = Math.min(dmin, w);
    dmax = Math.max(dmax, w);
  }
  // Leave room for casters just outside the box toward the light.
  dmax += 60;
  const su = 2 / (umax - umin);
  const sv = 2 / (vmax - vmin);
  const sd = 1 / (dmax - dmin);
  const m = new Float64Array(16);
  // clip.x = (p.right - umin) * su - 1, clip.y likewise, clip.z = (dmax - p.d) * sd
  m[0] = right[0] * su;
  m[4] = right[1] * su;
  m[8] = right[2] * su;
  m[12] = -umin * su - 1;
  m[1] = up[0] * sv;
  m[5] = up[1] * sv;
  m[9] = up[2] * sv;
  m[13] = -vmin * sv - 1;
  m[2] = -d[0] * sd;
  m[6] = -d[1] * sd;
  m[10] = -d[2] * sd;
  m[14] = dmax * sd;
  m[15] = 1;
  return { m, depthScale: sd, texel: Math.max((umax - umin), (vmax - vmin)) };
}

/**
 * A second, tight shadow map around a walker: `size` meters square in the
 * light's view, centered on `center` and snapped to whole texels of a
 * `mapSize` map (so shadows hold still as it follows), deep enough for
 * every caster in the box. Near the walker the whole-box map is coarse:
 * ten centimeters a texel on the boulevard.
 */
export function nearShadowMatrix(S, box, center, size, mapSize) {
  const d = S.keyDir;
  const up0 = Math.abs(d[1]) > 0.995 ? [0, 0, 1] : [0, 1, 0];
  const right = normalize(cross(d, up0));
  const up = cross(right, d);
  let dmin = Infinity;
  let dmax = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]];
    const w = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
    dmin = Math.min(dmin, w);
    dmax = Math.max(dmax, w);
  }
  dmax += 60;
  const texel = size / mapSize;
  const cu = Math.round((center[0] * right[0] + center[1] * right[1] + center[2] * right[2]) / texel) * texel;
  const cv = Math.round((center[0] * up[0] + center[1] * up[1] + center[2] * up[2]) / texel) * texel;
  const s = 2 / size;
  const sd = 1 / (dmax - dmin);
  const m = new Float64Array(16);
  m[0] = right[0] * s;
  m[4] = right[1] * s;
  m[8] = right[2] * s;
  m[12] = -cu * s;
  m[1] = up[0] * s;
  m[5] = up[1] * s;
  m[9] = up[2] * s;
  m[13] = -cv * s;
  m[2] = -d[0] * sd;
  m[6] = -d[1] * sd;
  m[10] = -d[2] * sd;
  m[14] = dmax * sd;
  m[15] = 1;
  return { m, depthScale: sd, texel: size };
}

/**
 * Everything a frame's shaders need, as FRAME_FLOATS numbers:
 * cam = { eye, target, fovY, shift }, W x H the target, S = skyState(),
 * shadow = shadowMatrix() and its map size, and a few switches.
 */
export function packFrame({ cam, W, H, S, look, shadow, shadowSize, near = null, nearSize = 1, mid = null, midSize = 1, rippleT, starT = -1, lightCount, hasPool, mirror = false, reflection = false, mirrorVP = null, seaLevel = SEA_LEVEL, pixelAngle, mirrorY = 0, reflRect = [0, 0, 1, 1], mirrored = -1 }) {
  const L = lookOf(look);
  const f = new Float32Array(FRAME_FLOATS);
  const eye = cam.eye;
  const view = mat4LookAt(eye, cam.target);
  const proj = projection(cam.fovY, W / H, cam.shift ?? 0);
  f.set(mat4Mul(proj, view), 0);
  if (mirrorVP) f.set(mirrorVP, 16);
  if (shadow) f.set(shadow.m, 32);
  const B = basis(eye, cam.target);
  const ty = Math.tan((cam.fovY * DEG) / 2);
  // The angular size of one sample, for filtering patterns by distance;
  // the mirrored pass keeps the main camera's.
  f.set([eye[0], eye[1], eye[2], pixelAngle ?? (2 * ty) / H], 48);
  f.set([...B.f, ty * (W / H)], 52);
  f.set([...B.r, ty], 56);
  f.set([...B.u, cam.shift ?? 0], 60);
  f.set([W, H, rippleT, starT], 64);
  f.set([...S.zenith, 0], 68);
  f.set([...S.mid, 0], 72);
  f.set([...S.horizon, 0], 76);
  f.set([...S.sunSide, 0], 80);
  f.set([...S.glow, S.glowK], 84);
  f.set([...S.amb, 0], 88);
  f.set([...S.ground, 0], 92);
  f.set([...S.key, S.keyOn ? 1 : 0], 96);
  f.set([...S.keyDir, S.keyStrength], 100);
  f.set([...S.sunDir, S.sunEl], 104);
  f.set([...S.moonDir, S.moonUp], 108);
  f.set([...S.cloudLit, 0], 112);
  f.set([...S.cloudShade, 0], 116);
  f.set([...S.seaNear, 0], 120);
  f.set([...S.seaFar, 0], 124);
  f.set([S.night, S.lights, S.stars, S.sunAz], 128);
  f.set([L.sky.mist, L.sky.deep[0], L.sky.deep[1], L.sky.deep[2]], 132);
  f.set([L.sky.uneven, L.sky.lowSunStreaks ? 1 : 0, seaLevel, mirror ? 1 : 0], 136);
  f.set([L.haze.far, L.haze.near, L.haze.from, L.haze.to], 140);
  f.set([L.haze.depth, L.shade === 'painted' ? 1 : 0, lightCount, L.pool.strokes], 144);
  f.set([L.frond.base, L.frond.tip, L.frond.across, L.frond.warm], 148);
  f.set([L.frond.warmTip, L.pool.flecks ? 1 : 0, hasPool ? 1 : 0, reflection ? 1 : 0], 152);
  if (shadow) {
    // Renderer.shadow: a nudge of 1.6 texels along the normal, 0.015 m toward the light.
    f.set([shadow.texel / shadowSize, S.keyOn ? 1 : 0, 0.015 * shadow.depthScale], 156);
  }
  f[159] = mirrorY;
  f.set(reflRect, 160);
  if (shadow && near) {
    f.set(near.m, 164);
    f.set([near.texel / nearSize, 1, 0.015 * near.depthScale, 1 / nearSize], 180);
  }
  if (shadow && mid) {
    f.set(mid.m, 184);
    f.set([mid.texel / midSize, 1, 0.015 * mid.depthScale, 1 / midSize], 200);
  }
  // Which water the mirrored pass painted: a pool's index, or -1 the sea.
  f[204] = mirrored;
  return f;
}

// Could any of the box be inside the frame of this view-projection (or a
// shadow map's), or inside `rect` of it ([x0, x1, y0, y1] in -1..1)? Only
// boxes wholly beyond one side are left out.
export function boxInView(vp, b, rect = [-1, 1, -1, 1]) {
  let left = 0;
  let right = 0;
  let below = 0;
  let above = 0;
  let behind = 0;
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? b.max[0] : b.min[0];
    const y = i & 2 ? b.max[1] : b.min[1];
    const z = i & 4 ? b.max[2] : b.min[2];
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cx < rect[0] * cw) left++;
    if (cx > rect[1] * cw) right++;
    if (cy < rect[2] * cw) below++;
    if (cy > rect[3] * cw) above++;
    if (cw < 0.05) behind++;
  }
  return left < 8 && right < 8 && below < 8 && above < 8 && behind < 8;
}

// The camera mirrored in a horizontal plane at height h.
export function mirrorCamera(cam, h) {
  return { ...cam, eye: [cam.eye[0], 2 * h - cam.eye[1], cam.eye[2]], target: [cam.target[0], 2 * h - cam.target[1], cam.target[2]] };
}

export function viewProj(cam, aspect) {
  return mat4Mul(projection(cam.fovY, aspect, cam.shift ?? 0), mat4LookAt(cam.eye, cam.target));
}

export { skyState, CAST, DISTANT };
