// The land behind the coast road, live only: the rest of Paloma Bay, which
// the postcards never turn round to see. The hills rise inland (ground.js)
// and on them:
//
// - side streets of bungalows climbing the slope behind the harbor and
//   behind the beach, stucco in the town's colors under tile roofs, with
//   lawns, drives, a car or two and a tree in every yard;
// - a gas station on the coast road across from the marina;
// - a water tower on the hill with the town's name on it;
// - power poles down the inland side of the coast road, their wires
//   swinging from pole to pole;
// - eucalyptus windbreaks across the fields north and south, groves on
//   the hills, sage scrub over the open ground, and ice plant and agave
//   along the road's edge.
//
// Built in town axes on the fields' own heights, kept off the places, the
// road and each other.

import { MeshBuilder, CAST, SMOOTH, DOUBLE } from '../mesh.js';
import { Rng, hashInts } from '../math.js';
import { addText } from '../world/font.js';
import { addFanPalm } from '../world/fanpalm.js';
import { addEucalyptus, addCypress, addRoundTree, addAgave, addScrub, addIcePlant } from '../world/trees.js';
import { parkedCar } from '../world/cars.js';
import { lampPost } from '../world/common.js';
import { addBoard } from '../world/signs.js';
import { LAYOUT, BOULEVARD, inside, roadY, STREETS, FARM_ROAD, STREET } from './town.js';
import { fieldHeight } from './ground.js';

const SEED = 19861990;
const WALLS = ['stucco', 'salmon', 'mint', 'butter', 'lilac', 'skyBlue', 'stucco', 'butter', 'stucco'];
const DOORS = ['doorRed', 'doorYellow', 'doorBlue', 'doorGreen', 'doorPink'];
// Streets lie a little above the fields they cross, so no field shows
// through them; the sidewalks a curb above that.
const LIFT = 0.12;
const CURB = 0.15;
const { half: HALF, walk: WALK } = STREET;

export function buildHinterland(town) {
  const b = new MeshBuilder();
  const M = town.M;
  const H = fieldHeight();
  const sub = (salt) => new Rng(hashInts(SEED, 100 + salt));
  const lights = [];
  // What is built, as rectangles [x0, x1, z0, z1]: nothing else goes there.
  const taken = [];
  const clearOf = (x, z, r) => !taken.some(([x0, x1, z0, z1]) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r);
  const offPlaces = (x, z, r) => x > 10.5 + r && !Object.values(LAYOUT).some((L) => inside(L.ground, x, z, r)) && !inside(BOULEVARD.footOutline, x, z, r);
  const free = (x, z, r) => offPlaces(x, z, r) && clearOf(x, z, r);

  // ---- streets, and the houses along them
  for (const s of STREETS) street(b, M, H, s, STREETS, taken, lights);
  street(b, M, H, FARM_ROAD, [], taken, lights);
  const hr = sub(1);
  let n = 0;
  for (const s of [...STREETS, FARM_ROAD]) {
    const alongX = s[1] === s[3];
    const len = alongX ? s[2] - s[0] : s[3] - s[1];
    const farm = s === FARM_ROAD;
    const pitch = farm ? 70 : 27;
    for (const side of [-1, 1]) {
      for (let t = 22; t < len - 12; t += pitch + hr.range(-3, 3)) {
        const depth = hr.range(9, 12);
        const off = HALF + WALK + hr.range(6, 9) + depth / 2;
        const cx = alongX ? s[0] + t : s[0] + side * off;
        const cz = alongX ? s[1] + side * off : s[1] + t;
        // The house's front faces the street.
        const face = alongX ? (side < 0 ? 0 : Math.PI) : side < 0 ? Math.PI / 2 : -Math.PI / 2;
        if (!free(cx, cz, 7)) continue;
        const r = hr.fork(++n);
        const house = bungalow(b, r, M, cx, cz, face, depth, H, lights);
        taken.push(house.rect);
        yard(b, r, M, house, H);
      }
    }
  }

  // ---- the gas station, across the road from the marina
  gasStation(b, sub(2), M, H, lights, taken);

  // ---- the water tower on the hill
  waterTower(b, M, H, 318, -214);
  taken.push([308, 328, -224, -204]);

  // ---- power poles down the inland side of the coast road, past the
  // places (not through the motel's front)
  const mouths = STREETS.filter((q) => q[1] === q[3] && q[0] <= 10.01).map((q) => q[1]);
  const poleOk = (x, z) => !Object.values(LAYOUT).some((L) => inside(L.ground, x, z, 1.5)) && !inside(BOULEVARD.footOutline, x, z, 1.5) && !mouths.some((m) => Math.abs(z - m) < HALF + 1.5);
  powerLine(b, M, H, (x, z) => poleOk(x, z) || z > 720);

  // ---- along the road's edge: ice plant and agave in the gaps
  const er = sub(3);
  for (let z = -1580; z < 1680; z += er.range(9, 16)) {
    const x = er.range(13, 17);
    if (!free(x, z, 3)) continue;
    if (er.chance(0.55)) addIcePlant(b, er.fork(Math.round(z * 10)), M, x, z, { w: er.range(3, 6), d: er.range(1.8, 3), ground: H(x, z) });
    else addAgave(b, er.fork(Math.round(z * 10)), M, x, z, { ground: H(x, z) });
  }

  // ---- eucalyptus windbreaks across the fields, and groves on the hills
  const wr = sub(4);
  const row = (x0, z0, x1, z1, gap) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 0; t < len; t += gap + wr.range(-1.5, 1.5)) {
      const x = x0 + ((x1 - x0) * t) / len + wr.range(-1, 1);
      const z = z0 + ((z1 - z0) * t) / len + wr.range(-1, 1);
      if (wr.chance(0.12) || !free(x, z, 4)) continue;
      addEucalyptus(b, wr.fork(Math.round(x * 7 + z * 13)), M, x, z, { ground: H(x, z) - 0.1, lod: x < 200 ? 0.5 : 0.3 });
      taken.push([x - 2, x + 2, z - 2, z + 2]);
    }
  };
  row(130, -1560, 130, -520, 13);
  row(420, -1560, 420, -560, 15);
  row(80, 880, 720, 880, 14);
  row(300, 760 + 14, 300, 1640, 15);
  for (let g = 0; g < 11; g++) {
    const cx = wr.range(380, 1250);
    const cz = wr.range(-1450, 1550);
    const k = wr.int(3, 7);
    for (let i = 0; i < k; i++) {
      const x = cx + wr.range(-22, 22);
      const z = cz + wr.range(-22, 22);
      if (!free(x, z, 5)) continue;
      addEucalyptus(b, wr.fork(1000 + g * 20 + i), M, x, z, { ground: H(x, z) - 0.1, lod: 0.3 });
      taken.push([x - 2, x + 2, z - 2, z + 2]);
    }
  }

  // ---- sage scrub over the open ground, in patches
  const sr = sub(5);
  for (let z = -1580; z < 1690; z += 23) {
    for (let x = 18; x < 1250; x += x < 300 ? 21 : 36) {
      const px = x + sr.range(-9, 9);
      const pz = z + sr.range(-9, 9);
      // Patches: where the ground folds, and thinning out far off.
      const patch = Math.sin(px / 57 + Math.sin(pz / 83)) + Math.sin(pz / 41 - px / 97);
      if (patch < 0.45 || sr.chance(x > 600 ? 0.55 : 0.3) || !free(px, pz, 2.5)) continue;
      addScrub(b, sr.fork(Math.round(px * 3 + pz * 11)), M, px, pz, { ground: H(px, pz), lod: x < 250 ? 1 : 0.3, r: sr.range(0.6, 1.4) * (x < 250 ? 1 : 1.3) });
    }
  }
  return { builder: b, lights };
}

// ---------------------------------------------------------------- streets

// A street along x or along z from (x0, z0) to (x1, z1): asphalt on the
// fields, raised sidewalks with curbs, broken where another street
// crosses; its lamps. Streets running along z sit a centimeter and a half
// higher, so crossings never flicker.
function street(b, M, H, s, all, taken, lights) {
  const [x0, z0, x1, z1] = s;
  const alongX = z0 === z1;
  const lift = LIFT + (alongX ? 0 : 0.015);
  const len = alongX ? x1 - x0 : z1 - z0;
  const at = (t, w) => (alongX ? [x0 + t, z0 + w] : [x0 + w, z0 + t]);
  // A street off the coast road runs on across the road's sidewalk to its
  // asphalt (ground.js leaves the gap), coming down to meet it.
  const mouth = alongX && x0 <= 10.01;
  const y = (t, w) => {
    const [x, z] = at(t, w);
    const own = H(x, z) + lift;
    if (!mouth || x > 16) return own;
    const u = Math.max(0, Math.min(1, (x - 7) / 9));
    return roadY(z) + 0.01 + (own - roadY(z) - 0.01) * u * u * (3 - 2 * u);
  };
  const step = 6;
  // Where other streets cross this one's sidewalks.
  const gaps = [];
  for (const o of all) {
    if (o === s) continue;
    const oAlongX = o[1] === o[3];
    if (oAlongX === alongX) continue;
    const c = alongX ? o[0] - x0 : o[1] - z0;
    const lo = alongX ? Math.min(o[1], o[3]) - z0 : Math.min(o[0], o[2]) - x0;
    const hi = alongX ? Math.max(o[1], o[3]) - z0 : Math.max(o[0], o[2]) - x0;
    if (c < -HALF - WALK || c > len + HALF + WALK || hi < -HALF - WALK || lo > HALF + WALK) continue;
    gaps.push([c - HALF - WALK, c + HALF + WALK]);
  }
  const quadAt = (mat, t0, t1, w0, w1, dy) => {
    const P = [at(t0, w0), at(t1, w0), at(t1, w1), at(t0, w1)].map(([x, z], k) => [x, y([t0, t1, t1, t0][k], [w0, w0, w1, w1][k]) + dy, z]);
    b.use(mat, dy > 0 ? CAST : 0);
    // Up-facing whichever way the street runs.
    if (alongX) b.quad(P[0], P[3], P[2], P[1], [P[0][0], P[0][2], P[3][0], P[3][2], P[2][0], P[2][2], P[1][0], P[1][2]]);
    else b.quad(P[0], P[1], P[2], P[3], [P[0][0], P[0][2], P[1][0], P[1][2], P[2][0], P[2][2], P[3][0], P[3][2]]);
  };
  if (mouth) quadAt(M.asphalt, 7 - x0, 0, -HALF, HALF, 0);
  for (let t = 0; t < len; t += step) {
    const t1 = Math.min(len, t + step);
    quadAt(M.asphalt, t, t1, -HALF, HALF, 0);
    const mid = (t + t1) / 2;
    if (gaps.some(([a, c]) => mid > a && mid < c)) continue;
    for (const sd of [-1, 1]) {
      const w0 = sd < 0 ? -HALF - WALK : HALF;
      const w1 = sd < 0 ? -HALF : HALF + WALK;
      quadAt(M.sidewalk, t, t1, w0, w1, CURB);
      // The curb face, toward the asphalt.
      const wc = sd < 0 ? -HALF : HALF;
      const A = at(t, wc);
      const C = at(t1, wc);
      const pa = [A[0], y(t, wc), A[1]];
      const pc = [C[0], y(t1, wc), C[1]];
      b.use(M.curb, CAST);
      const quad = [pa, pc, [pc[0], pc[1] + CURB, pc[2]], [pa[0], pa[1] + CURB, pa[2]]];
      // Facing the street's middle.
      const flip = (alongX ? sd < 0 : sd > 0) ? 1 : 0;
      if (flip) b.quad(quad[0], quad[1], quad[2], quad[3]);
      else b.quad(quad[1], quad[0], quad[3], quad[2]);
    }
  }
  // Lamps down one side.
  for (let t = 18; t < len - 6; t += 52) {
    const [x, z] = at(t, HALF + 0.6);
    lights.push(lampPost(b, M, x, z, y(t, HALF + 0.6) + CURB, { height: 4.4, reach: 7 }));
  }
  const [ax, az] = at(0, -HALF - WALK);
  const [bx, bz] = at(len, HALF + WALK);
  taken.push([Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz)]);
}

// ---------------------------------------------------------------- houses

// A bungalow centered at (cx, cz), its front facing along `face` (the
// angle rotateY turns +z to), `depth` deep: stucco walls on a plinth that
// takes up the slope, a tile roof (hipped, gabled or flat behind a
// parapet), a door, windows, now and then a garage.
function bungalow(b, rng, M, cx, cz, face, depth, H, lights) {
  const w = rng.range(10, 15);
  const d = depth;
  const tall = rng.chance(0.22);
  const h = tall ? 5.9 : 3.1;
  const fx = Math.sin(face);
  const fz = Math.cos(face);
  // Across the front, left to right seen from the street.
  const rx = Math.cos(face);
  const rz = -Math.sin(face);
  const corners = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([u, v]) => [cx + rx * u + fx * v, cz + rz * u + fz * v]);
  const ys = corners.map(([x, z]) => H(x, z));
  const lo = Math.min(...ys);
  const floor = Math.max(...ys) + 0.3;
  const wall = M[rng.pick(WALLS)];
  b.object();
  b.push();
  b.translate(cx, floor, cz);
  b.rotateY(face);
  // The plinth, down into the slope.
  b.use(M.boundary, CAST);
  b.box(-w / 2 - 0.1, lo - floor - 0.5, -d / 2 - 0.1, w / 2 + 0.1, 0, d / 2 + 0.1, 'ny');
  b.use(wall, CAST);
  b.box(-w / 2, 0, -d / 2, w / 2, h, d / 2, 'ny');
  const roof = rng.pick(['hip', 'hip', 'gable', 'flat']);
  roofOf(b, M, roof, w, d, h, rng);
  // The front: a door with a stoop, windows either side, maybe a garage.
  const garage = rng.chance(0.45);
  const door = M[rng.pick(DOORS)];
  const dxo = garage ? -w / 2 + 2.2 : rng.range(-1.2, 1.2);
  b.use(door, CAST);
  b.box(dxo - 0.5, 0.02, d / 2, dxo + 0.5, 2.15, d / 2 + 0.05);
  b.use(M.trim, CAST);
  b.box(dxo - 0.8, -0.3, d / 2, dxo + 0.8, 0.02, d / 2 + 1.1);
  const glass = M.glass;
  const windowAt = (u, y0, y1, ww, zface, dir) => {
    b.use(glass, CAST);
    if (dir === 'front') b.box(u - ww / 2, y0, zface, u + ww / 2, y1, zface + 0.04);
    else b.box(zface, y0, u - ww / 2, zface + 0.04, y1, u + ww / 2);
    b.use(M.trim, CAST);
    if (dir === 'front') b.box(u - ww / 2 - 0.12, y0 - 0.12, zface, u + ww / 2 + 0.12, y0, zface + 0.1);
    else b.box(zface, y0 - 0.12, u - ww / 2 - 0.12, zface + 0.1, y0, u + ww / 2 + 0.12);
  };
  if (garage) {
    b.use(M.frame, CAST);
    b.box(w / 2 - 3.6, 0.02, d / 2, w / 2 - 0.6, 2.3, d / 2 + 0.05);
    windowAt(dxo + 2.3, 0.9, 2.1, 1.6, d / 2, 'front');
  } else {
    windowAt(dxo - 2.6, 0.9, 2.1, 1.8, d / 2, 'front');
    windowAt(dxo + 2.6, 0.9, 2.1, 1.8, d / 2, 'front');
  }
  if (tall) {
    for (const u of [-w / 4, w / 4]) windowAt(u, 3.7, 4.9, 1.6, d / 2, 'front');
  }
  // A window down each side, and one at the back.
  for (const s of [-1, 1]) windowAt(rng.range(-d / 4, d / 4), 0.9, 2.0, 1.4, s < 0 ? -w / 2 - 0.04 : w / 2, 'side');
  b.use(glass, CAST);
  b.box(-1, 0.9, -d / 2 - 0.04, 1, 2.0, -d / 2);
  b.pop();
  // A porch light by the door.
  const px = cx + rx * (dxo + 0.8) + fx * (d / 2 + 0.2);
  const pz = cz + rz * (dxo + 0.8) + fz * (d / 2 + 0.2);
  lights.push({ p: [px, floor + 2.3, pz], c: [1.0, 0.82, 0.55], r: 2.2, k: 0.6 });
  // The lot it takes, and where its front and drive are.
  const pad = 2;
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return {
    rect: [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad],
    cx,
    cz,
    fx,
    fz,
    rx,
    rz,
    w,
    d,
    floor,
    garage,
    wall,
  };
}

function roofOf(b, M, kind, w, d, h, rng) {
  const o = 0.45; // the eaves
  const x0 = -w / 2 - o;
  const x1 = w / 2 + o;
  const z0 = -d / 2 - o;
  const z1 = d / 2 + o;
  if (kind === 'flat') {
    b.use(M.trim, CAST);
    b.box(-w / 2 - 0.1, h, -d / 2 - 0.1, w / 2 + 0.1, h + 0.55, d / 2 + 0.1);
    return;
  }
  const rise = Math.min(w, d) * rng.range(0.18, 0.24);
  const top = h + rise;
  b.use(M.roofTile, CAST);
  // The tiles' rows run along the eaves (uv.x down the slope).
  const slope = (a, c, e, f) => {
    const run = Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
    b.quad(a, c, e, f, [run, 0, run, Math.hypot(c[0] - a[0], c[2] - a[2]), 0, Math.hypot(c[0] - a[0], c[2] - a[2]), 0, 0]);
  };
  if (kind === 'gable') {
    // The ridge along the longer side.
    if (w >= d) {
      slope([x0, h, z1], [x1, h, z1], [x1, top, 0], [x0, top, 0]);
      slope([x1, h, z0], [x0, h, z0], [x0, top, 0], [x1, top, 0]);
      b.use(M.trim, CAST);
      b.tri([-w / 2, h, d / 2], [-w / 2, top - 0.05, 0], [-w / 2, h, -d / 2]);
      b.tri([w / 2, h, -d / 2], [w / 2, top - 0.05, 0], [w / 2, h, d / 2]);
    } else {
      slope([x1, h, z1], [x1, h, z0], [0, top, z0], [0, top, z1]);
      slope([x0, h, z0], [x0, h, z1], [0, top, z1], [0, top, z0]);
      b.use(M.trim, CAST);
      b.tri([w / 2, h, d / 2], [0, top - 0.05, d / 2], [-w / 2, h, d / 2]);
      b.tri([-w / 2, h, -d / 2], [0, top - 0.05, -d / 2], [w / 2, h, -d / 2]);
    }
    return;
  }
  // Hipped: a short ridge along the longer side, four slopes.
  const r = Math.abs(w - d) / 2;
  const rxa = w >= d ? -r : 0;
  const rxb = w >= d ? r : 0;
  const rza = w >= d ? 0 : -r;
  const rzb = w >= d ? 0 : r;
  slope([x0, h, z1], [x1, h, z1], [rxb, top, rzb], [rxa, top, rzb]);
  slope([x1, h, z0], [x0, h, z0], [rxa, top, rza], [rxb, top, rza]);
  slope([x1, h, z1], [x1, h, z0], [rxb, top, rza], [rxb, top, rzb]);
  slope([x0, h, z0], [x0, h, z1], [rxa, top, rzb], [rxa, top, rza]);
}

// The yard in front: a lawn, the drive, a car in it now and then, a tree
// or a palm, a hedge along the front, a pair of cypress by the drive.
function yard(b, rng, M, house, H) {
  const { cx, cz, fx, fz, rx, rz, w, d, garage } = house;
  const setback = 7;
  const P = (u, v) => [cx + rx * u + fx * v, cz + rz * u + fz * v];
  const quad = (mat, u0, u1, v0, v1, lift) => {
    const pts = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)].map(([x, z]) => [x, H(x, z) + lift, z]);
    b.use(mat, 0);
    // Up-facing: (u, v) is a right-handed frame seen from above only if
    // the corners turn one way; test and wind to face up.
    const n = (pts[1][0] - pts[0][0]) * (pts[3][2] - pts[0][2]) - (pts[1][2] - pts[0][2]) * (pts[3][0] - pts[0][0]);
    if (n < 0) b.quad(pts[0], pts[1], pts[2], pts[3]);
    else b.quad(pts[0], pts[3], pts[2], pts[1]);
  };
  b.object();
  quad(M.lawnTown, -w / 2 - 1, w / 2 + 1, d / 2, d / 2 + setback, 0.06);
  if (garage) {
    quad(M.drive, w / 2 - 3.8, w / 2 - 0.4, d / 2, d / 2 + setback + 0.8, 0.09);
    if (rng.chance(0.35)) {
      const [x, z] = P(w / 2 - 2.1, d / 2 + 3.2);
      b.push();
      b.translate(x, H(x, z) + 0.09, z);
      b.rotateY(Math.atan2(fx, fz) + Math.PI / 2 + rng.range(-0.05, 0.05));
      parkedCar(b, M, rng, { lod: 0.3 });
      b.pop();
    }
    if (rng.chance(0.25)) {
      for (const u of [w / 2 - 4.5, w / 2 + 0.3]) {
        const [x, z] = P(u, d / 2 + setback - 0.6);
        addCypress(b, rng.fork(Math.round(u * 10)), M, x, z, { height: rng.range(6, 9), ground: H(x, z), lod: 0.5 });
      }
    }
  } else {
    // A path to the door.
    quad(M.deck, -0.7, 0.7, d / 2 + 1, d / 2 + setback + 0.8, 0.09);
  }
  if (rng.chance(0.3)) {
    b.use(M.hedge, CAST | SMOOTH);
    const [x0, z0] = P(-w / 2 - 1, d / 2 + setback - 0.4);
    const [x1, z1] = P(garage ? w / 2 - 4.2 : -1, d / 2 + setback - 0.4);
    const y0 = H(x0, z0);
    b.tube([[x0, y0 + 0.35, z0], [x1, H(x1, z1) + 0.35, z1]], [0.45, 0.45], 6);
  }
  const t = rng.float();
  const [tx, tz] = P(rng.range(-w / 2, -1.5), d / 2 + setback * 0.55);
  if (t < 0.45) addRoundTree(b, rng.fork(3), M, tx, tz, { ground: H(tx, tz), lod: 0.5 });
  else if (t < 0.7) addFanPalm(b, rng.fork(4), M, tx, tz, { height: rng.range(11, 17), ground: H(tx, tz), lod: 0.45 });
  else if (t < 0.8) addAgave(b, rng.fork(5), M, tx, tz, { ground: H(tx, tz) + 0.06 });
}

// ---------------------------------------------------------------- the gas station

function gasStation(b, rng, M, H, lights, taken) {
  const x0 = 12;
  const x1 = 64;
  const z0 = -240;
  const z1 = -192;
  let top = -Infinity;
  for (const x of [x0, x1]) for (const z of [z0, z1]) top = Math.max(top, H(x, z));
  const y = top + LIFT;
  b.object();
  // The forecourt, level, a curb down to the fields round it.
  b.use(M.lot, 0);
  b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, z0, x0, z1, x1, z1, x1, z0]);
  b.use(M.curb, CAST);
  b.box(x0, y - 1.2, z0 - 0.25, x1, y + 0.12, z0);
  b.box(x0, y - 1.2, z1, x1, y + 0.12, z1 + 0.25);
  b.box(x1, y - 1.2, z0 - 0.25, x1 + 0.25, y + 0.12, z1 + 0.25);
  // The canopy over two islands of pumps, lit underneath.
  const cx0 = 18;
  const cx1 = 40;
  const cz0 = -228;
  const cz1 = -206;
  const ch = 5.2;
  b.use(M.post, CAST);
  for (const x of [cx0 + 2, cx1 - 2]) for (const z of [cz0 + 3, cz1 - 3]) b.box(x - 0.25, y, z - 0.25, x + 0.25, y + ch, z + 0.25);
  b.use(M.trim, CAST);
  b.box(cx0, y + ch, cz0, cx1, y + ch + 0.25, cz1);
  b.use(M.awningRed, CAST);
  b.box(cx0 - 0.05, y + ch + 0.25, cz0 - 0.05, cx1 + 0.05, y + ch + 1.15, cz1 + 0.05, 'ny');
  b.use(M.lamp, 0);
  for (const x of [cx0 + 5, cx1 - 5]) {
    for (const z of [cz0 + 5, (cz0 + cz1) / 2, cz1 - 5]) {
      b.box(x - 0.6, y + ch - 0.04, z - 0.15, x + 0.6, y + ch, z + 0.15);
      lights.push({ p: [x, y + ch - 0.3, z], c: [1.0, 0.96, 0.88], r: 5.5, k: 0.9 });
    }
  }
  for (const z of [cz0 + 7, cz1 - 7]) {
    b.use(M.trim, CAST);
    b.box(cx0 + 4, y, z - 0.9, cx1 - 4, y + 0.2, z + 0.9);
    for (const x of [cx0 + 8, cx1 - 8]) {
      b.use(M.signCream, CAST);
      b.box(x - 0.4, y + 0.2, z - 0.35, x + 0.4, y + 1.9, z + 0.35);
      b.use(M.signRed, CAST);
      b.box(x - 0.42, y + 1.3, z - 0.37, x + 0.42, y + 1.75, z + 0.37);
    }
  }
  // The shop behind, glass along the front.
  const sx0 = 46;
  const sx1 = 60;
  const sz0 = -232;
  const sz1 = -212;
  b.use(M.stucco, CAST);
  b.box(sx0, y, sz0, sx1, y + 4, sz1);
  b.use(M.glass, CAST);
  b.box(sx0 - 0.05, y + 0.4, sz0 + 2, sx0, y + 3, sz1 - 2);
  b.use(M.awningRed, CAST);
  b.box(sx0 - 0.1, y + 4, sz0 - 0.1, sx1 + 0.1, y + 4.7, sz1 + 0.1);
  // The sign by the road, and palms.
  b.push();
  b.translate(15, y, -196);
  b.use(M.post, CAST);
  b.box(-0.2, 0, -0.2, 0.2, 7.5, 0.2);
  b.translate(0, 7.5, 0);
  // Lettered both ways, back to back.
  for (const a of [-Math.PI / 2, Math.PI / 2]) {
    b.push();
    b.rotateY(a);
    b.translate(0, 0, 0.07);
    addBoard(b, M, 'GAS', { size: 1.4, board: M.signCream, paint: M.signRed, neon: M.neonRed, pad: 0.4 });
    b.pop();
  }
  b.pop();
  lights.push({ p: [14, y + 8.3, -196], c: [1.0, 0.42, 0.36], r: 3.5, k: 0.5 });
  for (const [x, z] of [
    [13.5, -237],
    [62, -237],
    [62, -195],
    [44, -195],
  ]) addFanPalm(b, rng.fork(Math.round(x * 3 + z)), M, x, z, { height: rng.range(14, 19), ground: y, lod: 0.6 });
  // A car at a pump, one by the shop.
  for (const [x, z, a] of [
    [cx0 + 8, cz0 + 4.4, 0],
    [sx0 - 4, sz1 + 5, Math.PI / 2],
  ]) {
    b.push();
    b.translate(x, y, z);
    b.rotateY(a);
    parkedCar(b, M, rng, { lod: 0.6 });
    b.pop();
  }
  taken.push([x0 - 2, x1 + 2, z0 - 2, z1 + 2]);
}

// ---------------------------------------------------------------- the water tower

function waterTower(b, M, H, x, z) {
  const g = H(x, z);
  const legs = 17;
  const R = 5.4;
  b.object();
  b.use(M.post, CAST | SMOOTH);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = Math.cos(a);
    const lz = Math.sin(a);
    b.tube([[x + lx * R * 1.05, g - 0.5, z + lz * R * 1.05], [x + lx * R * 0.72, g + legs, z + lz * R * 0.72]], [0.28, 0.2], 6);
  }
  b.use(M.post, CAST);
  for (const y of [g + 6, g + 12]) {
    const k = 1.05 - ((y - g) / legs) * 0.33;
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const a1 = a0 + Math.PI / 2;
      b.tube([[x + Math.cos(a0) * R * k, y, z + Math.sin(a0) * R * k], [x + Math.cos(a1) * R * k, y, z + Math.sin(a1) * R * k]], [0.08, 0.08], 4);
    }
  }
  // The tank, banded, under a shallow cone.
  b.push();
  b.translate(x, g + legs, z);
  b.use(M.trim, CAST | SMOOTH);
  b.cylinder(R, R, 0, 2.6, 24);
  b.use(M.skyBlue, CAST | SMOOTH);
  b.cylinder(R + 0.01, R + 0.01, 2.6, 4.6, 24, { caps: false });
  b.use(M.trim, CAST | SMOOTH);
  b.cylinder(R, R, 4.6, 6.4, 24);
  b.cylinder(R + 0.3, 0.3, 6.4, 8.4, 24);
  b.pop();
  // The town's name round the band, facing the coast.
  b.use(M.signNavy, CAST);
  const word = 'PALOMA BAY';
  const size = 1.3;
  const da = 0.155;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === ' ') continue;
    const a = -Math.PI / 2 + (i - (word.length - 1) / 2) * da;
    b.push();
    b.translate(x + Math.sin(a) * (R + 0.02), g + legs + 2.95, z + Math.cos(a) * (R + 0.02));
    b.rotateY(a);
    addText(b, ch, { size, depth: 0.05, stroke: 0.2, align: 'center' });
    b.pop();
  }
}

// ---------------------------------------------------------------- the power line

// Wooden poles down the inland side of the coast road, a crossarm with
// three insulators each, and the wires between, sagging.
function powerLine(b, M, H, ok) {
  const X = 11.6;
  const poles = [];
  for (let z = -1570; z < 1690; z += 44) poles.push(ok(X, z) ? { z, g: H(X, z) } : null);
  b.object();
  const top = 10.2;
  const arms = [-1.1, 0, 1.1];
  for (const p of poles) {
    if (!p) continue;
    b.use(M.timber, CAST | SMOOTH);
    b.tube([[X, p.g - 0.3, p.z], [X, p.g + top + 0.3, p.z]], [0.14, 0.11], 6);
    b.use(M.timber, CAST);
    b.box(X - 1.35, p.g + top - 0.55, p.z - 0.07, X + 1.35, p.g + top - 0.4, p.z + 0.07);
    b.use(M.globe, CAST);
    for (const a of arms) b.box(X + a - 0.05, p.g + top - 0.4, p.z - 0.05, X + a + 0.05, p.g + top - 0.2, p.z + 0.05);
  }
  b.use(M.wire, CAST);
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i];
    const c = poles[i + 1];
    if (!a || !c) continue;
    for (const off of arms) {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const sag = 0.7 * 4 * t * (1 - t);
        pts.push([X + off, a.g + (c.g - a.g) * t + top - 0.2 - sag, a.z + (c.z - a.z) * t]);
      }
      b.tube(pts, pts.map(() => 0.02), 3);
    }
  }
}
