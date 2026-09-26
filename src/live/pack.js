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
export const MATERIAL_FLOATS = 20;
export const LIGHT_FLOATS = 8;
export const FRAME_FLOATS = 164;
export const POOL_FLOATS = 80;

// Big triangles (the highway and its painted lines run for kilometers) are
// cut into pieces at most MAX_EDGE long where they pass through `zone`,
// the part of a place a camera can be. Across a triangle that size a GPU
// sets up depth too coarsely where it passes the camera, and lines laid
// a centimeter above the asphalt sink under it.
const MAX_EDGE = 40;
const MARGIN = 150;

export function packMesh(mesh, zone = null) {
  const out = [];
  const near = (P) => {
    if (!zone) return true;
    for (let c = 0; c < 3; c += 2) {
      const lo = Math.min(P[0][c], P[1][c], P[2][c]);
      const hi = Math.max(P[0][c], P[1][c], P[2][c]);
      if (hi < zone.min[c] - MARGIN || lo > zone.max[c] + MARGIN) return false;
    }
    return true;
  };
  const tri = (P, N, T, ids, obj) => {
    let k = 0;
    let best = -1;
    for (let e = 0; e < 3; e++) {
      const a = P[e];
      const b = P[(e + 1) % 3];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (l > best) {
        best = l;
        k = e;
      }
    }
    if (best > MAX_EDGE && !((ids >>> 16) & DISTANT) && near(P)) {
      // Halve the longest edge.
      const i = k;
      const j = (k + 1) % 3;
      const o = (k + 2) % 3;
      const mid = (A, B) => A.map((v, c) => (v + B[c]) / 2);
      const pm = mid(P[i], P[j]);
      const nm = mid(N[i], N[j]);
      const tm = mid(T[i], T[j]);
      tri([P[i], pm, P[o]], [N[i], nm, N[o]], [T[i], tm, T[o]], ids, obj);
      tri([pm, P[j], P[o]], [nm, N[j], N[o]], [tm, T[j], T[o]], ids, obj);
      return;
    }
    out.push(P, N, T, ids, obj);
  };
  for (let t = 0; t < mesh.count; t++) {
    const P = [0, 1, 2].map((k) => [mesh.pos[t * 9 + k * 3], mesh.pos[t * 9 + k * 3 + 1], mesh.pos[t * 9 + k * 3 + 2]]);
    const N = [0, 1, 2].map((k) => [mesh.nrm[t * 9 + k * 3], mesh.nrm[t * 9 + k * 3 + 1], mesh.nrm[t * 9 + k * 3 + 2]]);
    const T = [0, 1, 2].map((k) => [mesh.uv[t * 6 + k * 2], mesh.uv[t * 6 + k * 2 + 1]]);
    tri(P, N, T, mesh.mat[t] | (mesh.flags[t] << 16), mesh.obj[t]);
  }
  // One-sided triangles first, then two-sided ones: the painter culls the
  // back faces of all but the two-sided (raster.js), and so will the GPU.
  const tris = out.length / 5;
  const order = [];
  for (let t = 0; t < tris; t++) if (!((out[t * 5 + 3] >>> 16) & DOUBLE)) order.push(t);
  const single = order.length;
  for (let t = 0; t < tris; t++) if ((out[t * 5 + 3] >>> 16) & DOUBLE) order.push(t);
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
  return { data: buf, count: n, single: single * 3 };
}

// Materials, with the power the world gives each lamp and sign, and the
// road lanes their tar is worn by.
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
    f[o + 12] = power[m.name] ?? 1;
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
  });
  return { data: buf, count: mats.length, lanes: Float32Array.from(lanes.length ? lanes : [0]) };
}

// Pools of lamplight, each dimmed or not by the power to its material.
export function packLights(world) {
  const list = world.lights ?? [];
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

// A place's water: its pool, if it has one, and its open water (a harbor,
// the sea off the beach), if it has that.
export function packPool(pool, water = null) {
  const f = new Float32Array(POOL_FLOATS);
  if (pool) {
    f.set([pool.x0, pool.x1, pool.z0, pool.z1], 0);
    f.set([pool.waterY, pool.floorY, Math.min(4, pool.waves.length)], 4);
    f.set(pool.tile, 8);
    f.set(pool.lane, 12);
    f.set(pool.water, 16);
    f.set(pool.glow, 20);
    pool.waves.slice(0, 4).forEach((w, i) => {
      f.set([w.kx, w.kz, w.w, w.p], 24 + i * 4);
      f[40 + i] = w.a;
    });
  }
  if (water) {
    f[7] = Math.min(4, water.waves.length);
    water.waves.slice(0, 4).forEach((w, i) => {
      f.set([w.kx, w.kz, w.w, w.p], 44 + i * 4);
      f[60 + i] = w.a;
    });
    f.set([...water.near, water.falloff ?? 160], 64);
    f.set([...water.far, water.shallow ? 1 : 0], 68);
    if (water.shallow) {
      f.set([water.shallow.a[0], water.shallow.a[1], water.shallow.d, water.shallow.w], 72);
      f.set([...water.shallow.color, 0], 76);
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
 * Everything a frame's shaders need, as FRAME_FLOATS numbers:
 * cam = { eye, target, fovY, shift }, W x H the target, S = skyState(),
 * shadow = shadowMatrix() and its map size, and a few switches.
 */
export function packFrame({ cam, W, H, S, look, shadow, shadowSize, rippleT, starT = -1, lightCount, hasPool, mirror = false, reflection = false, mirrorVP = null, seaLevel = SEA_LEVEL, pixelAngle, mirrorY = 0, reflRect = [0, 0, 1, 1] }) {
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
  return f;
}

// The camera mirrored in a horizontal plane at height h.
export function mirrorCamera(cam, h) {
  return { ...cam, eye: [cam.eye[0], 2 * h - cam.eye[1], cam.eye[2]], target: [cam.target[0], 2 * h - cam.target[1], cam.target[2]] };
}

export function viewProj(cam, aspect) {
  return mat4Mul(projection(cam.fovY, aspect, cam.shift ?? 0), mat4LookAt(cam.eye, cam.target));
}

export { skyState, CAST, DISTANT };
