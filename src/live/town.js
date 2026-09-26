// Paloma Bay, all of it: the five places laid along one stretch of coast
// the way they already face, the sea to the west and the sunset over it.
// North to south: the house on its bluff, the marina and its harbor, the
// beach, the boulevard coming down to the coast road, the motel.
//
// Live only. Each place is built exactly as the painted town builds it
// (with the live town's close-up detail), moved into the town's axes, and
// cut to its own ground. Its own sea, hills and horizon give way to the
// town's; the ground between the places is the town's own (ground.js).
//
// Town axes: +x east, +y up, +z south, as every place's own. The sea is
// at y = 0; the coast road runs down x = 0.

import { buildPlace, PLACES } from '../scenes/index.js';
import { propsAt } from '../visitor.js';
import { finalizeMesh, DISTANT } from '../mesh.js';
import { DEG, Rng, hashInts, hex } from '../math.js';
import { makeMaterials } from '../world/materials.js';
import { makeSky } from '../sky.js';
import { lookOf } from '../looks.js';
import { addDetail } from './detail.js';

// The boulevard's road frame: x runs down the avenue to the sea, turned so
// the midsummer sun sets straight down it (scenes/boulevard.js).
const BR = -(292 - 270) * DEG;
const road = (x, z) => [x * Math.cos(BR) + z * Math.sin(BR), -x * Math.sin(BR) + z * Math.cos(BR)];

// Where each place goes: `at` is added to its own coordinates (no place is
// turned: the light of every postcard depends on which way it faces), and
// `ground` is the outline of what it keeps, in town axes, counterclockwise
// seen from above. Heights put every place's own sea at the town's.
const BOULEVARD_AT = [7 - road(-280, 62)[0], 14.8, 528.8 - road(-280, 62)[1]];
const corridor = [
  [-280, -62],
  [-280, 62],
  [365, 62],
  [365, -62],
].map(([x, z]) => {
  const [wx, wz] = road(x, z);
  return [wx + BOULEVARD_AT[0], wz + BOULEVARD_AT[2]];
});

// The boulevard in town axes, for its foot (ground.js): its road frame,
// the cut across it, its ground at the cut and on up its slope.
const toTownB = (xr, zr) => {
  const [wx, wz] = road(xr, zr);
  return [wx + BOULEVARD_AT[0], wz + BOULEVARD_AT[2]];
};
const CUT = -280;
const footOutline = keepEast(
  [
    [CUT - 120, -62],
    [CUT - 120, 62],
    [CUT, 62],
    [CUT, -62],
  ].map(([x, z]) => toTownB(x, z)),
  7,
);
export const BOULEVARD = {
  cut: CUT,
  level: 0.04 * CUT + BOULEVARD_AT[1],
  toTown: toTownB,
  // Its ground (before the slabs on it) at a town point, on its slope.
  groundAt(x, z) {
    const wx = x - BOULEVARD_AT[0];
    const wz = z - BOULEVARD_AT[2];
    const xr = wx * Math.cos(BR) - wz * Math.sin(BR);
    return 0.04 * Math.max(CUT, xr) + BOULEVARD_AT[1];
  },
  // Where it comes down to the coast road: its outline below the cut, and
  // the stretch of the road's east side it takes.
  footOutline,
  foot: [Math.min(...footOutline.filter((p) => p[0] < 7.01).map((p) => p[1])), Math.max(...footOutline.filter((p) => p[0] < 7.01).map((p) => p[1]))],
};

// A convex outline kept east of x = x0.
function keepEast(poly, x0) {
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
  // No corner twice (an edge of no length has no side).
  return out.filter((p, k) => {
    const q = out[(k + 1) % out.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
  });
}

export const LAYOUT = {
  // On its point, six meters over the sea; the drive meets the coast road.
  house: { at: [-42.5, 6, -470], ground: rect(-72.9, -9.9, -498.4, -441.6) },
  // The harbor opens to the south, the breakwater along its west side.
  marina: { at: [-60, 0, -220], ground: rect(-300, -10, -380, -80) },
  // The beach's street is the coast road.
  beach: { at: [-91, 0, 170], ground: rect(-181, 34, -20, 370) },
  // Cut a little below its shops, where the coast road now crosses it.
  boulevard: { at: BOULEVARD_AT, ground: corridor },
  // Its highway is the coast road, on south to the horizon.
  motel: { at: [39, 4, 620], ground: rect(-27.6, 64, 560, 7000) },
};

function rect(x0, x1, z0, z1) {
  return [
    [x0, z0],
    [x0, z1],
    [x1, z1],
    [x1, z0],
  ];
}

const FAR = 25000;

// The coast road's height along its length, meeting each place's own.
const ROAD = [
  [-FAR, 6],
  [-441.6, 6], // the house
  [-380, 1.4], // the marina
  [-80, 1.4],
  [-20, 3.42], // the beach's street
  [370, 3.42],
  [395, 3.6], // the boulevard's foot, level across
  [529, 3.6],
  [560, 4], // the motel's highway
  [FAR, 4],
];
export function roadY(z) {
  for (let i = 1; i < ROAD.length; i++) {
    const [z1, y1] = ROAD[i];
    if (z <= z1) {
      const [z0, y0] = ROAD[i - 1];
      const u = Math.max(0, Math.min(1, (z - z0) / (z1 - z0)));
      return y0 + (y1 - y0) * u * u * (3 - 2 * u);
    }
  }
  return ROAD[ROAD.length - 1][1];
}

// Where the water meets the land, north to south: [z, x, kind], the kind
// saying what the sea finds there (sand, a wall, rocks or a quay). The
// shallows follow the sand (packPool).
export const COAST = [
  [-FAR, -28, 'wall'],
  [-498.4, -28, 'wall'], // north of the house, a sea wall
  [-441.6, -60, 'rock'], // down from the house to the harbor
  [-380, -60, 'quay'], // the marina's quay
  [-80, -60, 'quay'],
  [-20, -91, 'sand'], // the cove and the beach
  [370, -91, 'sand'],
  [480, -62, 'sand'], // the beach narrows to a groyne
  [480.01, -60, 'wall'],
  [560, -27.4, 'wall'], // the sea wall on to the motel's
  [FAR, -27.4, 'wall'],
];
export function coastX(z) {
  for (let i = 1; i < COAST.length; i++) {
    const [z1, x1] = COAST[i];
    if (z <= z1) {
      const [z0, x0] = COAST[i - 1];
      return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0);
    }
  }
  return COAST[COAST.length - 1][1];
}

// Small things (a palm's fronds, a parked car, a door knob) are kept or
// left whole, by where their middle is, within this much of the ground's
// edge; only big faces are cut along it.
const SMALL = 3;
const REACH = 4;
const TOWN_SEED = 19861990;

// The harbor, calm inside its breakwater: its water, in town axes.
export const HARBOR = { x0: LAYOUT.marina.at[0] - 215, x1: LAYOUT.marina.at[0], z0: LAYOUT.marina.at[2] - 160, z1: LAYOUT.marina.at[2] + 118 };

/**
 * Paloma Bay, piece by piece. The town's own materials, sky and sea come
 * first, and its ground (ground.js, added with setGround); each place is a
 * piece of its own (addPlace), built again when its traces change with the
 * hour without touching the rest. The live renderer and walker take it
 * like any place: materials, pieces (`chunks`), lights, pools, the sky.
 */
export class Town {
  constructor(look) {
    this.id = 'town';
    this.name = 'Paloma Bay';
    this.look = lookOf(look);
    const { list } = makeMaterials(new Rng(hashInts(TOWN_SEED, 1)), this.look);
    this.materials = list.map((m) => ({ ...m, place: 'town' }));
    const T = {};
    this.materials.forEach((m, i) => (T[m.name] = i));
    // The coast road wears where the motel's highway did; the boulevard's
    // lanes carry on down its foot.
    this.materials[T.road] = { ...this.materials[T.road], lanes: { ax: 1, az: 0, centers: [-42.27 + 39, -35.85 + 39] } };
    const ax = Math.sin(BR);
    const az = Math.cos(BR);
    T.footRoad = this.materials.length;
    this.materials.push({ ...this.materials[T.road], name: 'footRoad', lanes: { ax, az, centers: [-7.9, -3.13, 3.13, 7.9].map((c) => c + ax * BOULEVARD_AT[0] + az * BOULEVARD_AT[2]) } });
    this.M = T;
    // The beach's sky and sea, and inside the breakwater the marina's own
    // calm water, each laid where its place has it (so its ripples fall
    // just as in the place's own pictures): the waves as beach.js and
    // marina.js make them.
    this.sky = makeSky(new Rng(hashInts(1983, 10)), { clouds: this.look.clouds.beach, gulls: [2, 5] }, this.look);
    const wr = new Rng(hashInts(1983, 9));
    const hr = new Rng(hashInts(1986, 8));
    this.water = {
      waves: [
        { kx: 0.33, kz: 0.02, w: 0.9, p: wr.range(0, 6.28), a: 0.05 },
        { kx: 0.52, kz: -0.14, w: 1.3, p: wr.range(0, 6.28), a: 0.028 },
        { kx: 1.3, kz: 0.8, w: 2.1, p: wr.range(0, 6.28), a: 0.012 },
        { kx: 2.4, kz: -1.5, w: 2.9, p: wr.range(0, 6.28), a: 0.006 },
      ],
      origin: [LAYOUT.beach.at[0], LAYOUT.beach.at[2]],
      near: hex('#2a8fd0'),
      far: hex('#0f3f98'),
      falloff: 420,
      shallow: { w: 14, color: hex('#66d9cf') },
      coast: COAST.map(([z, x, kind]) => [z, x, kind === 'sand' ? 1 : 0]),
      harbor: {
        ...HARBOR,
        edge: 25,
        waves: [
          { kx: 0.9, kz: 0.35, w: 0.8, p: hr.range(0, 6.28), a: 0.011 },
          { kx: -0.4, kz: 1.3, w: 1.1, p: hr.range(0, 6.28), a: 0.007 },
          { kx: 2.1, kz: -1.2, w: 1.9, p: hr.range(0, 6.28), a: 0.004 },
          { kx: 3.4, kz: 1.9, w: 2.6, p: hr.range(0, 6.28), a: 0.0025 },
        ],
        origin: [LAYOUT.marina.at[0], LAYOUT.marina.at[2]],
        near: hex('#1c72bc'),
        far: hex('#10408f'),
        falloff: 260,
      },
    };
    // What is mirrored, frame by frame: the nearest pool, else the sea
    // (renderer.js).
    this.seaLevel = 0;
    // Where a camera can be, all the land drawn in detail: the depth the
    // shadow maps take in, and where big triangles are cut small (pack.js).
    this.shadowBox = { min: [-320, -2, -1600], max: [700, 60, 1700] };
    this.chunks = new Map();
    this.blocks = {}; // place -> the index of its first material
    this.views = {};
    this.places = {};
    this.version = 0;
  }

  /** The town's own ground, from ground.js: { builder, lights }. */
  setGround({ builder, lights }) {
    this.chunks.set('ground', { id: 'ground', mesh: finalizeMesh(builder), lights, pool: null });
    this.version++;
  }

  /** Build a place (again) as it stands at `hours`. */
  addPlace(id, hours) {
    const world = addDetail(buildPlace(id, propsAt(id, hours), this.look));
    const { at, ground } = LAYOUT[id];
    if (this.blocks[id] === undefined) {
      this.blocks[id] = this.materials.length;
      // Each keeps where its place stands: its patterns (and a road's wear
      // along its lanes) are laid from there, as in the place's pictures.
      for (const m of world.materials) this.materials.push({ ...m, place: id, origin: at, power: world.emitScale?.[m.name] ?? m.power });
    } else {
      // The same look, the same paints; only the power of a lamp may change.
      world.materials.forEach((m, i) => (this.materials[this.blocks[id] + i].power = world.emitScale?.[m.name] ?? m.power));
    }
    const out = sink();
    const sea = new Set(world.materials.flatMap((m, i) => (m.kind === 'harbor' ? [i] : [])));
    const mesh = world.mesh;
    const whole = wholeObjects(mesh, at, ground);
    for (let t = 0; t < mesh.count; t++) {
      if (mesh.flags[t] & DISTANT || sea.has(mesh.mat[t]) || whole[t] === DROP) continue;
      out.add(mesh, t, at, ground, this.blocks[id], whole[t] === KEEP);
    }
    const lights = world.lights.map((L) => {
      const power = L.emit && world.emitScale?.[L.emit] !== undefined ? world.emitScale[L.emit] : 1;
      return { p: [L.p[0] + at[0], L.p[1] + at[1], L.p[2] + at[2]], c: L.c, r: L.r, k: L.k * power };
    });
    for (const [name, v] of Object.entries(world.views)) this.views[`${id}:${name}`] = moveView(v, at);
    this.places[id] = {
      id,
      name: PLACES[id].NAME,
      ground,
      at,
      start: `${id}:${PLACES[id].START ?? PLACES[id].VIEWS[0]}`,
      hero: `${id}:${PLACES[id].VIEWS[0]}`,
    };
    const chunk = { id, mesh: finalizeMesh(out), lights, pool: world.pool ? movePool(world.pool, at) : null, props: JSON.stringify(world.props) };
    this.chunks.set(id, chunk);
    this.version++;
    return chunk;
  }

  /** Would the place look any different at `hours`? */
  stale(id, hours) {
    const c = this.chunks.get(id);
    return !c || c.props !== JSON.stringify({ ...PLACES[id].DEFAULT_PROPS, ...propsAt(id, hours) });
  }

  get lights() {
    return [...this.chunks.values()].flatMap((c) => c.lights);
  }

  get pools() {
    return [...this.chunks.values()].flatMap((c) => (c.pool ? [c.pool] : []));
  }
}

/** Which place (x, z) is in, or null between them. */
export function placeAt(x, z) {
  for (const [id, L] of Object.entries(LAYOUT)) if (inside(L.ground, x, z, 0)) return id;
  return null;
}

// A pool moved into the town; its ripples are still laid from its place's
// own origin.
function movePool(p, at) {
  return { ...p, x0: p.x0 + at[0], x1: p.x1 + at[0], z0: p.z0 + at[2], z1: p.z1 + at[2], waterY: p.waterY + at[1], floorY: p.floorY + at[1], origin: [at[0], at[2]] };
}

function moveView(v, at) {
  return { ...v, eye: v.eye.map((c, k) => c + at[k]), target: v.target.map((c, k) => c + at[k]) };
}

// How far (x, z) is inside the edge a -> b of an outline listed as rect()
// lists its corners (north-west, south-west, south-east, north-east):
// positive inside, in meters.
export function side(ax, az, bx, bz, x, z) {
  const ex = bx - ax;
  const ez = bz - az;
  return (ez * (x - ax) - ex * (z - az)) / Math.hypot(ex, ez);
}

// Is (x, z) inside the convex outline, or within `reach` of it?
export function inside(poly, x, z, reach = 0) {
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    if (side(ax, az, bx, bz, x, z) < -reach) return false;
  }
  return true;
}

// Triangles gathered into the town: a MeshBuilder's arrays, so the one
// mesh can be finished like any other.
function sink() {
  const b = { pos: [], nrm: [], uv: [], mat: [], flags: [], obj: [] };
  const V = (mesh, t, k, at) => ({
    p: [mesh.pos[t * 9 + k * 3] + at[0], mesh.pos[t * 9 + k * 3 + 1] + at[1], mesh.pos[t * 9 + k * 3 + 2] + at[2]],
    n: [mesh.nrm[t * 9 + k * 3], mesh.nrm[t * 9 + k * 3 + 1], mesh.nrm[t * 9 + k * 3 + 2]],
    u: [mesh.uv[t * 6 + k * 2], mesh.uv[t * 6 + k * 2 + 1]],
  });
  const emit = (a, c, d, mat, flags, obj) => {
    b.pos.push(...a.p, ...c.p, ...d.p);
    b.nrm.push(...a.n, ...c.n, ...d.n);
    b.uv.push(...a.u, ...c.u, ...d.u);
    b.mat.push(mat);
    b.flags.push(flags);
    b.obj.push(obj);
  };
  b.add = (mesh, t, at, ground, matBase, keep = false) => {
    const vs = [V(mesh, t, 0, at), V(mesh, t, 1, at), V(mesh, t, 2, at)];
    const mat = mesh.mat[t] + matBase;
    const flags = mesh.flags[t];
    // A place keeps its own object ids: its lit windows fall as painted.
    const obj = mesh.obj[t];
    if (keep) {
      emit(vs[0], vs[1], vs[2], mat, flags, obj);
      return;
    }
    let edge = 0;
    for (let k = 0; k < 3; k++) {
      const [p, q] = [vs[k].p, vs[(k + 1) % 3].p];
      edge = Math.max(edge, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
    }
    if (edge < SMALL) {
      const cx = (vs[0].p[0] + vs[1].p[0] + vs[2].p[0]) / 3;
      const cz = (vs[0].p[2] + vs[1].p[2] + vs[2].p[2]) / 3;
      if (inside(ground, cx, cz, REACH)) emit(vs[0], vs[1], vs[2], mat, flags, obj);
      return;
    }
    const poly = clip(vs, ground);
    for (let k = 1; k + 1 < poly.length; k++) emit(poly[0], poly[k], poly[k + 1], mat, flags, obj);
  };
  return b;
}

// Things that stand (a shop, a palm, a parked car) go into the town whole
// or not at all, by where their middle is: cut along a place's edge, a
// building would stand open to the street. Only the ground, roads and
// long walls are cut. A thing is its triangles joined corner to corner,
// with the other pieces of the same object that touch it (object ids are
// not always one thing: a row of shops may share one). Per triangle: CLIP
// (the usual rule), KEEP or DROP.
const CLIP = 0;
const KEEP = 1;
const DROP = 2;
const WHOLE = 60; // meters across, at most, to be kept whole
const FLAT = 1; // meters high, at least, to count as standing

function wholeObjects(mesh, at, ground) {
  const n = mesh.count;
  const up = new Int32Array(n).map((_, i) => i);
  const find = (i) => {
    while (up[i] !== i) i = up[i] = up[up[i]];
    return i;
  };
  const join = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) up[b] = a;
  };
  // Corners shared, within an object.
  const seen = new Map();
  const p = mesh.pos;
  for (let t = 0; t < n; t++) {
    if (mesh.flags[t] & DISTANT) continue;
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      const key = `${mesh.obj[t]} ${Math.round(p[o] * 1000)} ${Math.round(p[o + 1] * 1000)} ${Math.round(p[o + 2] * 1000)}`;
      const s = seen.get(key);
      if (s === undefined) seen.set(key, t);
      else join(s, t);
    }
  }
  // Each piece's box.
  const box = new Map();
  for (let t = 0; t < n; t++) {
    if (mesh.flags[t] & DISTANT) continue;
    const r = find(t);
    let b = box.get(r);
    if (!b) box.set(r, (b = { obj: mesh.obj[t], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
    for (let k = 0; k < 9; k++) {
      const v = p[t * 9 + k];
      const c = k % 3;
      if (v < b.lo[c]) b.lo[c] = v;
      if (v > b.hi[c]) b.hi[c] = v;
    }
  }
  // Pieces of one object that touch are one thing.
  const byObj = new Map();
  for (const [r, b] of box) {
    if (!byObj.has(b.obj)) byObj.set(b.obj, []);
    byObj.get(b.obj).push([r, b]);
  }
  const E = 0.25;
  for (const list of byObj.values()) {
    list.sort((a, b) => a[1].lo[0] - b[1].lo[0]);
    for (let i = 0; i < list.length; i++) {
      const A = list[i][1];
      for (let j = i + 1; j < list.length && list[j][1].lo[0] <= A.hi[0] + E; j++) {
        const B = list[j][1];
        if (B.lo[1] <= A.hi[1] + E && A.lo[1] <= B.hi[1] + E && B.lo[2] <= A.hi[2] + E && A.lo[2] <= B.hi[2] + E) join(list[i][0], list[j][0]);
      }
    }
  }
  const thing = new Map();
  for (const [r, b] of box) {
    const g = find(r);
    const T = thing.get(g);
    if (!T) thing.set(g, { lo: [...b.lo], hi: [...b.hi] });
    else
      for (let c = 0; c < 3; c++) {
        T.lo[c] = Math.min(T.lo[c], b.lo[c]);
        T.hi[c] = Math.max(T.hi[c], b.hi[c]);
      }
  }
  const verdict = new Map();
  for (const [g, T] of thing) {
    const across = Math.max(T.hi[0] - T.lo[0], T.hi[2] - T.lo[2]);
    if (across >= WHOLE || T.hi[1] - T.lo[1] < FLAT) verdict.set(g, CLIP);
    else verdict.set(g, inside(ground, (T.lo[0] + T.hi[0]) / 2 + at[0], (T.lo[2] + T.hi[2]) / 2 + at[2], 0) ? KEEP : DROP);
  }
  const out = new Uint8Array(n);
  for (let t = 0; t < n; t++) if (!(mesh.flags[t] & DISTANT)) out[t] = verdict.get(find(t));
  return out;
}

// A triangle cut to a convex outline in x-z (Sutherland-Hodgman); heights,
// normals and texture coordinates carried along the cut.
function clip(vs, poly) {
  let cur = vs;
  for (let i = 0; i < poly.length && cur.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const next = [];
    for (let k = 0; k < cur.length; k++) {
      const a = cur[k];
      const c = cur[(k + 1) % cur.length];
      const da = side(ax, az, bx, bz, a.p[0], a.p[2]);
      const dc = side(ax, az, bx, bz, c.p[0], c.p[2]);
      if (da >= 0) next.push(a);
      if (da >= 0 !== dc >= 0) {
        const s = da / (da - dc);
        const mix = (x, y) => x.map((v, j) => v + (y[j] - v) * s);
        const n = mix(a.n, c.n);
        const nl = Math.hypot(...n) || 1;
        next.push({ p: mix(a.p, c.p), n: n.map((v) => v / nl), u: mix(a.u, c.u) });
      }
    }
    cur = next;
  }
  return cur;
}
