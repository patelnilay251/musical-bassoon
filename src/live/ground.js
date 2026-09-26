// The town's own ground: what lies between the places and around them.
// One sea for the whole coast, the coast road where no place brings its
// own, the land along the water from each place to the next, the foot of
// the boulevard carried down to the road, the fields behind, and the
// hills. Built in the town's axes (town.js) from the places' own
// materials, so the joins are painted as the places are.

import { MeshBuilder, CAST, DOUBLE, NOREFLECT } from '../mesh.js';
import { Rng, hashInts } from '../math.js';
import { hills, lampPost, railing } from '../world/common.js';
import { addFanPalm } from '../world/fanpalm.js';
import { LAYOUT, BOULEVARD, side, roadY, coastX } from './town.js';

const SEED = 19861990;
const FAR = 25000;
const NORTH = -1600; // the land drawn in detail, north and south
const SOUTH = 1700;

/**
 * The ground for a Town (town.js): a MeshBuilder's triangles, and
 * the lamps along the road (added to the town's lights).
 */
export function buildGround(town) {
  const b = new MeshBuilder();
  // The town's own paints (town.js), the places' own in all but name.
  const M = town.M;
  const B = town.M;
  const Bv = { ...town.M, road: town.M.footRoad };
  const H = town.M;
  const sub = (salt) => new Rng(hashInts(SEED, salt));
  const lights = [];

  // ---- one sea, from the coast to the horizon
  b.use(B.sea, 0);
  b.quad([-FAR, 0, -FAR], [-FAR, 0, FAR], [12, 0, FAR], [12, 0, -FAR]);

  // ---- the coast road, where no place brings its own
  const roads = [
    [NORTH, -20],
    [370, 560],
  ];
  for (const [z0, z1] of roads) coastRoad(b, M, z0, z1, sub(10 + z0), lights, town);
  // Beyond the detail, on to the horizon north, one long piece.
  flat(b, M.road, -7, 7, -FAR, NORTH, () => roadY(NORTH));
  flat(b, M.sidewalk, -10, -7, -FAR, NORTH, () => roadY(NORTH) + 0.15);
  flat(b, M.sidewalk, 7, 10, -FAR, NORTH, () => roadY(NORTH) + 0.15);

  // ---- along the water, place to place
  northShore(b, M, sub(20));
  houseToHarbor(b, M, H, sub(21));
  harborToBeach(b, M, B, H, sub(22));
  beachToMotel(b, M, B, sub(23));
  boulevardFoot(b, Bv);

  // ---- the fields behind the town, meeting every place at its own height
  fields(b, M, town);

  // ---- the hills behind the town, and headlands up and down the coast
  hills(b, sub(1), M.scenery, { n: 9, az: [15, 165], dist: [1800, 6000], height: [160, 520], at: [150, 150] });
  hills(b, sub(2), M.headland, { n: 2, az: [320, 345], dist: [2600, 5200], height: [120, 320], at: [0, -400] });
  hills(b, sub(3), M.headland, { n: 2, az: [195, 220], dist: [2600, 5200], height: [90, 260], at: [0, 1400] });

  return { builder: b, lights };
}

// A level-ish strip from z0 to z1 between x0 and x1, its height y(x, z),
// cut into pieces along z short enough to follow it.
function flat(b, mat, x0, x1, z0, z1, y, { step = 6, flags = 0 } = {}) {
  b.use(mat, flags);
  const n = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * i) / n;
    const zb = z0 + ((z1 - z0) * (i + 1)) / n;
    const X0 = typeof x0 === 'function' ? [x0(za), x0(zb)] : [x0, x0];
    const X1 = typeof x1 === 'function' ? [x1(za), x1(zb)] : [x1, x1];
    b.quad([X0[0], y(X0[0], za), za], [X0[1], y(X0[1], zb), zb], [X1[1], y(X1[1], zb), zb], [X1[0], y(X1[0], za), za]);
  }
}

// An upright face along z at x(z) (east-facing if `east`), from the height
// lo(z) up to hi(z).
function face(b, mat, x, z0, z1, lo, hi, east, { step = 6, flags = CAST } = {}) {
  b.use(mat, flags);
  const X = typeof x === 'function' ? x : () => x;
  const n = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * i) / n;
    const zb = z0 + ((z1 - z0) * (i + 1)) / n;
    const a = [X(za), lo(za), za];
    const c = [X(zb), lo(zb), zb];
    const d = [X(zb), hi(zb), zb];
    const e = [X(za), hi(za), za];
    if (east) b.quad(a, e, d, c);
    else b.quad(a, c, d, e);
  }
}

// ---------------------------------------------------------------- the road

// The coast road as the motel's highway is laid: fourteen meters of it,
// a double yellow line, white edges, sidewalks either side, fan palms and
// lamps along the way. Where the boulevard comes in, its east side is
// the boulevard's own.
function coastRoad(b, M, z0, z1, rng, lights, town) {
  const y = (x, z) => roadY(z);
  const walk = (x, z) => roadY(z) + 0.15;
  flat(b, M.road, -7, 7, z0, z1, y);
  b.use(M.lineYellow, 0);
  for (const x of [-0.2, 0.08]) flat(b, M.lineYellow, x, x + 0.12, z0, z1, (xx, z) => roadY(z) + 0.012);
  for (const x of [-6.35, 6.23]) flat(b, M.lineWhite, x, x + 0.12, z0, z1, (xx, z) => roadY(z) + 0.012);
  // Sidewalks: tops, and the curb faces the road sees.
  const foot = BOULEVARD.foot;
  const eastParts = z0 < foot[1] && z1 > foot[0] ? [[z0, foot[0]], [foot[1], z1]] : [[z0, z1]];
  // (A face's heights go by z alone.)
  const curbLo = (z) => roadY(z);
  const curbHi = (z) => roadY(z) + 0.15;
  // Each sidewalk's back edge, down to below the ground beside it, so no
  // seam shows where the ground there is a little lower.
  const backLo = (z) => roadY(z) - 0.4;
  flat(b, M.sidewalk, -10, -7, z0, z1, walk, { flags: CAST });
  face(b, M.sidewalk, -7, z0, z1, curbLo, curbHi, true);
  face(b, M.sidewalk, -10, z0, z1, backLo, curbHi, false);
  for (const [a, c] of eastParts) {
    if (c <= a) continue;
    flat(b, M.sidewalk, 7, 10, a, c, walk, { flags: CAST });
    face(b, M.sidewalk, 7, a, c, curbLo, curbHi, false);
    face(b, M.sidewalk, 10, a, c, backLo, curbHi, true);
    // The boulevard's north side comes in at a slant: the sidewalk runs on
    // to meet it.
    if (c === foot[0]) {
      const [[, ], [nx, nz], [tx, tz]] = BOULEVARD.footOutline;
      const ze = tz + ((nz - tz) * (10 - tx)) / (nx - tx);
      b.use(M.sidewalk, CAST);
      b.tri([7, walk(0, c), c], [10, walk(0, ze), ze], [10, walk(0, c), c]);
    }
  }
  // Fan palms on both sidewalks, lamps between them.
  const onEast = (z) => eastParts.some(([a, c]) => z > a + 3 && z < c - 3);
  for (let z = z0 + 11; z < z1 - 4; z += 24) {
    if (!nearPlace(town, -8.5, z)) addFanPalm(b, rng.fork(Math.round(z)), M, -8.5, z, { height: rng.range(14, 20), ground: walk(0, z) });
    if (onEast(z + 12) && !nearPlace(town, 8.5, z + 12)) addFanPalm(b, rng.fork(Math.round(z) + 7), M, 8.5, z + 12, { height: rng.range(15, 21), ground: walk(0, z + 12) });
  }
  for (let z = z0 + 23; z < z1 - 4; z += 48) {
    if (!nearPlace(town, -8.9, z)) lights.push(lampPost(b, M, -8.9, z, walk(0, z), { height: 4.6, reach: 7 }));
  }
}

// Is (x, z) inside (or right at the edge of) any place's own ground?
function nearPlace(town, x, z) {
  return Object.values(LAYOUT).some((L) => L.ground && insideOf(L.ground, x, z, 3));
}

function insideOf(poly, x, z, reach) {
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    if (side(ax, az, bx, bz, x, z) < -reach) return false;
  }
  return true;
}

// ---------------------------------------------------------------- the shore

// A sea wall along x(z) from z0 to z1: the land at top(z), a stucco wall
// with a coping, and the face below it down to the water.
function seaWall(b, M, x, z0, z1, top, { step = 6 } = {}) {
  const X = typeof x === 'function' ? x : () => x;
  // The wall stands on the land's edge; the cliff below falls to the sea.
  face(b, M.cliff, (z) => X(z) - 0.4, z0, z1, () => -0.5, top, false, { step, flags: 0 });
  b.use(M.stucco, CAST);
  const n = Math.max(1, Math.ceil((z1 - z0) / step));
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * i) / n;
    const zb = z0 + ((z1 - z0) * (i + 1)) / n;
    const xa = X(za);
    const xb = X(zb);
    const ya = top(za);
    const yb = top(zb);
    // A slab 0.4 thick and 0.85 high, following the edge.
    const q = (p0, p1, p2, p3) => b.quad(p0, p1, p2, p3);
    q([xa - 0.4, ya, za], [xb - 0.4, yb, zb], [xb - 0.4, yb + 0.85, zb], [xa - 0.4, ya + 0.85, za]);
    q([xb, yb, zb], [xa, ya, za], [xa, ya + 0.85, za], [xb, yb + 0.85, zb]);
    b.use(M.trim, CAST);
    q([xa - 0.5, ya + 0.92, za], [xb - 0.5, yb + 0.92, zb], [xb + 0.1, yb + 0.92, zb], [xa + 0.1, ya + 0.92, za]);
    q([xa - 0.5, ya + 0.85, za], [xb - 0.5, yb + 0.85, zb], [xb - 0.5, yb + 0.92, zb], [xa - 0.5, ya + 0.92, za]);
    b.use(M.stucco, CAST);
    q([xa - 0.4, ya + 0.85, za], [xb - 0.4, yb + 0.85, zb], [xb, yb + 0.85, zb], [xa, ya + 0.85, za]);
  }
}

// North of the house: a strip of dry grass behind a sea wall, on up the
// coast.
function northShore(b, M, rng) {
  const y = () => roadY(-500);
  flat(b, M.field, -28, -10, NORTH, -498.4, y, { step: 60 });
  flat(b, M.field, -28, -10, -FAR, NORTH, y, { step: FAR });
  seaWall(b, M, -28, NORTH, -498.4, y, { step: 40 });
}

// From the house down to the harbor: the land falls with the road to the
// marina's level and ends at the water in a rock face. A mound of rubble
// closes the harbor's north side and carries a walkway out to the
// breakwater, so a walker can go out to the lighthouse.
function houseToHarbor(b, M, H, rng) {
  const z0 = -441.6;
  const z1 = -380;
  const y = (x, z) => roadY(z);
  flat(b, M.field, -60, -10, z0, z1, y, { step: 4 });
  face(b, H.rock ?? M.cliff, -60, z0, z1, () => -0.5, (z) => roadY(z), false, { step: 4, flags: CAST });
  // The mound: rubble either side of a walkway three meters up, from the
  // breakwater's end to the shore, where the walkway comes down to the land.
  const BW = LAYOUT.marina.at[0] - 215;
  // Its walkway's south edge is where the breakwater was cut.
  const zm = z1 - 2.5;
  const top = 3.0;
  const land = roadY(z1);
  const walkY = (x) => (x < -80 ? top : top + ((land - top) * (x + 80)) / 20);
  b.use(H.rock ?? M.cliff, CAST);
  for (let x = BW - 9; x < -60; x += 5) {
    const xa = x;
    const xb = Math.min(-60, x + 5);
    b.quad([xa, walkY(xa), zm - 2.5], [xb, walkY(xb), zm - 2.5], [xb, -2, zm - 9], [xa, -2, zm - 9]);
    b.quad([xa, -2, zm + 9], [xb, -2, zm + 9], [xb, walkY(xb), zm + 2.5], [xa, walkY(xa), zm + 2.5]);
  }
  b.use(H.sidewalk ?? M.sidewalk, CAST);
  for (let x = BW - 2.5; x < -60; x += 5) {
    const xa = x;
    const xb = Math.min(-60, x + 5);
    const ya = walkY(Math.max(xa, BW + 2.5));
    const yb = walkY(xb);
    b.quad([xa, ya + 0.05, zm - 2.5], [xa, ya + 0.05, zm + 2.5], [xb, yb + 0.05, zm + 2.5], [xb, yb + 0.05, zm - 2.5]);
    b.quad([xa, ya + 0.05, zm + 2.5], [xa, ya - 0.3, zm + 2.5], [xb, yb - 0.3, zm + 2.5], [xb, yb + 0.05, zm + 2.5]);
    b.quad([xb, yb + 0.05, zm - 2.5], [xb, yb - 0.3, zm - 2.5], [xa, ya - 0.3, zm - 2.5], [xa, ya + 0.05, zm - 2.5]);
  }
  // Boulders along both flanks, as on the breakwater.
  b.use(H.rock ?? M.cliff, CAST);
  for (let x = BW + 4; x < -64; x += rng.range(1.6, 3.2)) {
    for (const s of [-1, 1]) {
      const d = rng.range(3.2, 7.5);
      b.push();
      b.translate(x, walkY(x) - (d - 2.5) * 0.77 + rng.range(-0.3, 0.5), zm + s * d);
      b.rotateY(rng.range(0, 6.28));
      b.rotateX(rng.range(-0.4, 0.4));
      b.scale(rng.range(1.1, 2.0), rng.range(0.7, 1.2), rng.range(1.0, 1.8));
      b.sphere(1, 6, 3);
      b.pop();
    }
  }
}

// From the harbor to the beach: the beach begins where the quay ends, a
// cove of sand widening south, its promenade coming down to the marina's
// sidewalk.
function harborToBeach(b, M, B, H, rng) {
  const z0 = -80;
  const z1 = -20;
  const u = (z) => (z - z0) / (z1 - z0);
  const promY = (z) => 1.4 + (3.42 - 1.4) * u(z);
  const wallX = (z) => -60 + (-19 - -60) * u(z) * 1; // the promenade's sea wall
  const sandTop = (x, z) => Math.max(0, (x - coastX(z)) * 0.035);
  // The sand, from under the water up to the promenade's wall.
  flat(b, B.wetSand, (z) => coastX(z) - 30, (z) => coastX(z) + 7, z0, z1, (x, z) => (x - coastX(z)) * 0.035, { step: 3 });
  flat(b, B.sand, (z) => coastX(z) + 7, (z) => Math.max(coastX(z) + 7.01, wallX(z)), z0, z1, sandTop, { step: 3 });
  // The promenade and its wall, meeting the marina's sidewalk.
  flat(b, B.sidewalk, wallX, -10, z0, z1, (x, z) => promY(z), { step: 3, flags: CAST });
  face(b, B.stucco, wallX, z0, z1, (z) => sandTop(wallX(z), z) - 0.3, promY, false, { step: 3 });
  // The quay's end, closed.
  b.use(H.stucco ?? M.stucco, CAST);
  b.quad([-60, -1.5, z0], [-59.4, -1.5, z0], [-59.4, 1.4, z0], [-60, 1.4, z0]);
  // Waves come in on the new sand as on the beach.
  surf(b, B, rng, z0, z1);
}

// From the beach to the motel: the beach runs on, narrowing to a groyne
// of rocks; past it the land stands on a sea wall that bends out to meet
// the motel's.
function beachToMotel(b, M, B, rng) {
  const z0 = 370;
  const zg = 480;
  const z1 = 560;
  const promY = (z) => roadY(z);
  const sandTop = (x, z) => Math.max(0, (x - coastX(z)) * 0.035);
  // The beach, on to the groyne.
  flat(b, B.wetSand, (z) => coastX(z) - 30, (z) => coastX(z) + 7, z0, zg, (x, z) => (x - coastX(z)) * 0.035, { step: 3 });
  flat(b, B.sand, (z) => coastX(z) + 7, -19, z0, zg, sandTop, { step: 3 });
  flat(b, B.sidewalk, -19, -10, z0, zg, (x, z) => promY(z), { step: 3, flags: CAST });
  face(b, B.stucco, -19, z0, zg, (z) => sandTop(-19, z) - 0.3, promY, false, { step: 3 });
  b.use(B.trim, CAST);
  b.box(-19.1, promY(z0), z0, -18.7, promY(z0) + 0.08, zg);
  railing(b, B.rail, [[-18.8, promY(z0) + 0.08, z0], [-18.8, promY(zg) + 0.08, zg]], { h: 0.95, posts: false });
  surf(b, B, rng, z0, zg);
  // The groyne: rubble from the promenade out past the surf.
  b.use(B.rock ?? M.cliff, CAST);
  for (let x = -18; x > -78; x -= rng.range(1.4, 2.6)) {
    for (const s of [-1, 0, 1]) {
      b.push();
      b.translate(x, sandTop(x, zg) + rng.range(-0.2, 0.6), zg + s * rng.range(1.2, 2.6));
      b.rotateY(rng.range(0, 6.28));
      b.scale(rng.range(1.1, 1.9), rng.range(0.7, 1.3), rng.range(1.0, 1.7));
      b.sphere(1, 6, 3);
      b.pop();
    }
  }
  // Past the groyne: the land on its wall, sand on top as at the motel.
  flat(b, M.sand, coastX, -10, zg, z1, (x, z) => promY(z), { step: 4 });
  seaWall(b, M, coastX, zg, z1, promY, { step: 4 });
  // The groyne's side of that land, down to the beach.
  b.use(M.cliff, CAST);
  b.quad([-19, -0.5, zg], [-60, -0.5, zg], [-60, promY(zg), zg], [-19, promY(zg), zg]);
}

// The surf on a stretch of the town's own sand, as the beach has it: a
// scalloped swash at the waterline and broken lines of foam offshore,
// following the coast as it bends.
function surf(b, B, rng, z0, z1) {
  b.use(B.foam, NOREFLECT);
  for (let z = z0; z < z1; z += 1.25) {
    const za = z;
    const zb = Math.min(z1, z + 1.25);
    const lip = (zz) => coastX(zz) - 0.12 - 0.22 * Math.abs(Math.sin(zz * 0.11));
    b.quad([lip(za), 0.012, za], [lip(zb), 0.012, zb], [coastX(zb) + 0.3, 0.012, zb], [coastX(za) + 0.3, 0.012, za]);
  }
  for (const [off, width, len, gap, mat] of [
    [-0.9, 1.1, [2, 9], [0.4, 3], B.lace],
    [-6, 0.45, [3, 12], [1.5, 7], B.foam],
    [-15, 0.9, [6, 26], [2, 10], B.foam],
    [-31, 1.2, [8, 30], [4, 16], B.foam],
  ]) {
    breakers(b, mat, rng.fork(Math.round(-off * 10)), { off, z0, z1, width, len, gap });
  }
}

// Lines of breaking foam `off` meters out from the waterline (shore.js
// addBreakers, along a bending coast).
function breakers(b, mat, rng, { off, z0, z1, width, len, gap }) {
  b.use(mat, NOREFLECT);
  let z = z0 + rng.range(0, gap[1]);
  while (z < z1) {
    const L = Math.min(rng.range(len[0], len[1]), z1 - z);
    const W = width * rng.range(0.5, 1.2);
    const jit = rng.range(-1.2, 1.2);
    const bow = rng.range(-0.6, 0.6);
    const n = Math.max(4, Math.round(L / 1.2));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const zz = z + L * t;
      const mid = coastX(zz) + off + jit + bow * Math.sin(Math.PI * t);
      const w = W * Math.pow(Math.sin(Math.PI * t), 0.6) * (1.15 - 0.3 * t);
      const cur = [
        [mid - w * 0.75, 0.012, zz],
        [mid + w * 0.25, 0.012, zz],
      ];
      if (prev) b.quad(prev[0], cur[0], cur[1], prev[1]);
      prev = cur;
    }
    z += L + rng.range(gap[0], gap[1]);
  }
}

// The foot of the boulevard: its roadway, sidewalks and lots carried on
// from where the boulevard was cut, level, down to the coast road.
function boulevardFoot(b, Bv) {
  const { toTown, cut, level } = BOULEVARD;
  const strips = [
    [-12, 12, Bv.road, 0],
    [-16.5, -12, Bv.sidewalk, 0.15],
    [12, 16.5, Bv.sidewalk, 0.15],
    [-60, -16.5, Bv.lot, 0.15],
    [16.5, 60, Bv.lot, 0.15],
    [-62, -60, Bv.field, 0.15],
    [60, 62, Bv.field, 0.15],
  ];
  for (const [za, zb, mat, lift] of strips) {
    // The strip in the road frame, from the cut on down the hill, then
    // trimmed at the coast road's edge.
    const poly = [
      [cut - 120, za],
      [cut - 120, zb],
      [cut, zb],
      [cut, za],
    ].map(([x, z]) => toTown(x, z));
    const kept = trim(poly, 7);
    if (kept.length < 3) continue;
    b.use(mat, lift ? CAST : 0);
    const y = level + lift;
    for (let k = 1; k + 1 < kept.length; k++) b.tri([kept[0][0], y, kept[0][1]], [kept[k][0], y, kept[k][1]], [kept[k + 1][0], y, kept[k + 1][1]]);
    // The curb faces where a raised strip meets the roadway: at the coast
    // road's edge, and along the boulevard's own curbs.
    if (lift) {
      for (let k = 0; k < kept.length; k++) {
        const p = kept[k];
        const q = kept[(k + 1) % kept.length];
        if (Math.abs(p[0] - 7) < 1e-6 && Math.abs(q[0] - 7) < 1e-6) {
          b.use(mat, CAST);
          b.quad([p[0], level, p[1]], [q[0], level, q[1]], [q[0], y, q[1]], [p[0], y, p[1]]);
        }
      }
      for (const zc of [za, zb]) {
        if (Math.abs(zc) !== 12) continue;
        const seg = trimSegment(toTown(cut - 120, zc), toTown(cut, zc), 7);
        if (!seg) continue;
        // Facing the roadway.
        const [P, Q] = seg;
        const mid = toTown(cut - 60, 0);
        const toward = (mid[0] - P[0]) * (Q[1] - P[1]) - (mid[1] - P[1]) * (Q[0] - P[0]);
        const [A, B] = toward > 0 ? [Q, P] : [P, Q];
        b.use(mat, CAST);
        b.quad([A[0], level, A[1]], [B[0], level, B[1]], [B[0], y, B[1]], [A[0], y, A[1]]);
      }
    }
  }
  // The boulevard's markings on down to the corner.
  const line = (mat, z) => {
    const poly = [
      [cut - 120, z - 0.07],
      [cut - 120, z + 0.07],
      [cut, z + 0.07],
      [cut, z - 0.07],
    ].map(([x, zz]) => toTown(x, zz));
    const kept = trim(poly, 7.5);
    if (kept.length < 3) return;
    b.use(mat, 0);
    const y = level + 0.012;
    for (let k = 1; k + 1 < kept.length; k++) b.tri([kept[0][0], y, kept[0][1]], [kept[k][0], y, kept[k][1]], [kept[k + 1][0], y, kept[k + 1][1]]);
  };
  for (const s of [-1, 1]) {
    line(Bv.lineYellow, s * 0.16);
    line(Bv.lineWhite, s * 9.7);
  }
}

// The part of the segment P-Q east of x = x0, or null.
function trimSegment(P, Q, x0) {
  if (P[0] < x0 && Q[0] < x0) return null;
  const cut = (A, B) => {
    const s = (x0 - A[0]) / (B[0] - A[0]);
    return [x0, A[1] + (B[1] - A[1]) * s];
  };
  if (P[0] < x0) return [cut(P, Q), Q];
  if (Q[0] < x0) return [P, cut(Q, P)];
  return [P, Q];
}

// A convex outline in town axes, kept east of x = x0.
function trim(poly, x0) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const c = poly[(k + 1) % poly.length];
    if (a[0] >= x0) out.push(a);
    if (a[0] >= x0 !== c[0] >= x0) {
      const s = (x0 - a[0]) / (c[0] - a[0]);
      out.push([x0, a[1] + (c[1] - a[1]) * s]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the fields

// Dry grass east of the road to the hills, in a grid of cells cut around
// every place's own ground and the boulevard's foot. Its height meets
// each place at its edge, the road at the curb, and rises slowly inland.
function fields(b, M, town) {
  const holes = [LAYOUT.beach.ground, LAYOUT.boulevard.ground, LAYOUT.motel.ground, BOULEVARD.footOutline];
  const heightAt = fieldHeight();
  b.use(M.field, 0);
  const xs = [];
  for (let x = 10; x < 1600; x += x < 300 ? 10 : x < 700 ? 25 : 60) xs.push(x);
  xs.push(1600);
  const zs = [];
  for (let z = NORTH; z < SOUTH; z += 12) zs.push(z);
  zs.push(SOUTH);
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      let pieces = [
        [
          [xs[i], zs[j]],
          [xs[i], zs[j + 1]],
          [xs[i + 1], zs[j + 1]],
          [xs[i + 1], zs[j]],
        ],
      ];
      for (const hole of holes) pieces = pieces.flatMap((p) => subtract(p, hole));
      for (const p of pieces) {
        const pts = p.map(([x, z]) => [x, heightAt(x, z), z]);
        for (let k = 1; k + 1 < pts.length; k++) b.tri(pts[0], pts[k], pts[k + 1]);
      }
    }
  }
  // On to the horizon: east, north and south of the grid.
  const far = (x, z) => heightAt(Math.min(x, 1600), Math.max(NORTH, Math.min(SOUTH, z)));
  b.quad([1600, far(1600, NORTH), NORTH], [1600, far(1600, SOUTH), SOUTH], [FAR, far(1600, SOUTH), SOUTH], [FAR, far(1600, NORTH), NORTH]);
  b.quad([10, far(10, -FAR), -FAR], [10, far(10, NORTH), NORTH], [FAR, far(FAR, NORTH), NORTH], [FAR, far(FAR, -FAR), -FAR]);
  b.quad([64, far(64, SOUTH), SOUTH], [64, far(64, FAR), FAR], [FAR, far(FAR, FAR), FAR], [FAR, far(FAR, SOUTH), SOUTH]);
}

// The fields' height: each place's own at its edge, the road's at the
// curb, the boulevard's slope along its sides, blended by distance.
function fieldHeight() {
  const beach = LAYOUT.beach.ground;
  const motel = LAYOUT.motel.ground;
  const bv = LAYOUT.boulevard.ground;
  const { groundAt } = BOULEVARD;
  return (x, z) => {
    const anchors = [
      [Math.max(0, x - 10), roadY(z) + 0.15],
      [outside(beach, x, z), 3.57],
      [outside(motel, x, z), 4],
      [outside(bv, x, z), groundAt(x, z) + 0.15],
      [400, 3.6 + 0.025 * Math.max(0, x - 10)],
    ];
    let sw = 0;
    let sh = 0;
    for (const [d, h] of anchors) {
      const w = 1 / (d + 1) ** 3;
      sw += w;
      sh += w * h;
    }
    return sh / sw;
  };
}

// How far (x, z) is outside a convex outline (0 inside), roughly: the
// largest distance past any one edge.
function outside(poly, x, z) {
  let d = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    d = Math.max(d, -side(ax, az, bx, bz, x, z));
  }
  return d;
}

// The parts of convex outline p outside convex outline hole, as convex
// outlines: for each of the hole's edges in turn, what lies beyond it is
// kept and the rest goes on to the next edge.
export function subtract(p, hole) {
  const out = [];
  let rest = p;
  for (let i = 0; i < hole.length && rest.length >= 3; i++) {
    const [ax, az] = hole[i];
    const [bx, bz] = hole[(i + 1) % hole.length];
    const f = (v) => side(ax, az, bx, bz, v[0], v[1]);
    const beyond = cut(rest, (v) => -f(v));
    const within = cut(rest, f);
    if (beyond.length >= 3 && area(beyond) > 1e-6) out.push(beyond);
    rest = within;
  }
  return out;
}

// Outline p kept where f >= 0.
function cut(p, f) {
  const out = [];
  for (let k = 0; k < p.length; k++) {
    const a = p[k];
    const c = p[(k + 1) % p.length];
    const fa = f(a);
    const fc = f(c);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fc >= 0) {
      const s = fa / (fa - fc);
      out.push([a[0] + (c[0] - a[0]) * s, a[1] + (c[1] - a[1]) * s]);
    }
  }
  return out;
}

function area(p) {
  let s = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[k];
    const c = p[(k + 1) % p.length];
    s += a[0] * c[1] - c[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export { DOUBLE };
