// Walking through a place: where the ground is and what stands in the way,
// read from the place's own triangles into a grid of small cells. Each
// cell keeps the heights of the floors in it (faces that look up), the
// spans of height its other faces fill, and the top of any water. A walker
// can step up a curb or a stair, not through a wall, and never stands
// below the water.

import { KIND } from '../render.js';
import { DISTANT, DOUBLE } from '../mesh.js';

const FLOORS = 3; // floor heights kept per cell
const SPANS = 3; // blocked height spans kept per cell
const TOP = 9; // nothing this far above a cell's lowest floor matters to a walker
const MAX_CELLS = 1.2e6; // big places get coarser cells

export const WALKER = { radius: 0.3, height: 1.7, eye: 1.6, step: 0.36 };

/**
 * Grid over the place's shadow box (plus `margin`), cells about `cell`
 * meters (coarser if the place is big). Or over `rect` ({ x0, z0, x1, z1 }),
 * from `parts` ([{ mesh, tris }], the triangles of each mesh to read, with
 * the world's materials): a tile of the town (TownWalk).
 */
export function buildWalk(world, { cell: want = 0.25, margin = 12, rect = null, parts = null } = {}) {
  const box = world.shadowBox;
  const R = rect ?? { x0: box.min[0] - margin, z0: box.min[2] - margin, x1: box.max[0] + margin, z1: box.max[2] + margin };
  const x0 = R.x0;
  const z0 = R.z0;
  const w = R.x1 - x0;
  const d = R.z1 - z0;
  const cell = Math.max(want, Math.sqrt((w * d) / MAX_CELLS));
  const nx = Math.ceil(w / cell);
  const nz = Math.ceil(d / cell);
  const floors = new Float32Array(nx * nz * FLOORS).fill(NaN);
  const spans = new Float32Array(nx * nz * SPANS * 2).fill(NaN);
  const wet = new Float32Array(nx * nz).fill(NaN);
  const kinds = world.materials.map((m) => KIND[m.kind ?? 'diffuse']);
  const sources = parts ?? [{ mesh: world.mesh, tris: null }];

  const addFloor = (c, y) => {
    const o = c * FLOORS;
    for (let k = 0; k < FLOORS; k++) {
      const v = floors[o + k];
      if (Number.isNaN(v)) {
        floors[o + k] = y;
        return;
      }
      if (Math.abs(v - y) < 0.05) {
        floors[o + k] = Math.max(v, y);
        return;
      }
    }
    // Full: drop the floor with the least headroom, which nobody can stand
    // on anyway (the lawn under a deck); if all have room, the highest.
    const all = [floors[o], floors[o + 1], floors[o + 2], y];
    let drop = -1;
    let least = WALKER.height;
    for (let k = 0; k < all.length; k++) {
      let room = Infinity;
      for (const v of all) if (v > all[k] + 0.05) room = Math.min(room, v - all[k]);
      if (room < least) {
        least = room;
        drop = k;
      }
    }
    if (drop < 0) for (let k = 0; k < all.length; k++) if (drop < 0 || all[k] > all[drop]) drop = k;
    if (drop < FLOORS) floors[o + drop] = y;
  };
  const addSpan = (c, a, b) => {
    const o = c * SPANS * 2;
    // Merge with any span it touches, then store.
    for (let k = 0; k < SPANS; k++) {
      const s0 = spans[o + k * 2];
      if (Number.isNaN(s0)) continue;
      const s1 = spans[o + k * 2 + 1];
      if (a <= s1 + 0.02 && b >= s0 - 0.02) {
        a = Math.min(a, s0);
        b = Math.max(b, s1);
        spans[o + k * 2] = NaN;
        spans[o + k * 2 + 1] = NaN;
      }
    }
    for (let k = 0; k < SPANS; k++) {
      if (Number.isNaN(spans[o + k * 2])) {
        spans[o + k * 2] = a;
        spans[o + k * 2 + 1] = b;
        return;
      }
    }
    // Full: widen the nearest span to cover it (errs toward blocking).
    let best = 0;
    let gap = Infinity;
    for (let k = 0; k < SPANS; k++) {
      const g = Math.max(0, spans[o + k * 2] - b, a - spans[o + k * 2 + 1]);
      if (g < gap) {
        gap = g;
        best = k;
      }
    }
    spans[o + best * 2] = Math.min(spans[o + best * 2], a);
    spans[o + best * 2 + 1] = Math.max(spans[o + best * 2 + 1], b);
  };

  // Each triangle read once to find the lowest floor in every cell (what is
  // "too high to matter" is measured from there: the town climbs thirty
  // meters up the boulevard), then again for everything.
  const low = new Float32Array(nx * nz).fill(Infinity);
  const clipped = [];
  const T = tri();
  for (const { mesh, tris } of sources) {
    const n = tris ? tris.length : mesh.count;
    for (let k = 0; k < n; k++) {
      if (!T.read(mesh, tris ? tris[k] : k, kinds) || !T.floor) continue;
      cover(T, x0, z0, cell, nx, nz, (c, cx, cz) => {
        const y = T.plane(cx, cz);
        if (y < low[c]) low[c] = y;
      });
    }
  }
  // A cell with no floor of its own (under a thin wall) goes by its
  // neighbors'; with none near, nothing in it is too high.
  const top = new Float32Array(nx * nz);
  let highest = -Infinity;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      let v = low[c];
      if (v === Infinity) {
        for (let b = Math.max(0, j - 1); b <= Math.min(nz - 1, j + 1); b++) {
          for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) v = Math.min(v, low[b * nx + a]);
        }
      }
      top[c] = v + TOP;
      if (top[c] > highest) highest = top[c];
    }
  }
  for (const { mesh, tris } of sources) {
    const n = tris ? tris.length : mesh.count;
    for (let k = 0; k < n; k++) {
      if (!T.read(mesh, tris ? tris[k] : k, kinds) || T.ymin > highest) continue;
      const P = T.P;
      cover(T, x0, z0, cell, nx, nz, (c, cx, cz) => {
        if (T.ymin > top[c]) return;
        if (T.water) {
          const y = T.plane(cx, cz);
          if (!(wet[c] >= y)) wet[c] = y;
          return;
        }
        if (T.upright) {
          // A wall: the heights it fills over this cell, exactly.
          const part = clipRect(P, cx - cell / 2, cz - cell / 2, cx + cell / 2, cz + cell / 2, clipped);
          if (part.length === 0) return;
          let lo = Infinity;
          let hi = -Infinity;
          for (const q of part) {
            lo = Math.min(lo, q[1]);
            hi = Math.max(hi, q[1]);
          }
          addSpan(c, lo, hi);
          return;
        }
        if (T.floor) {
          const y = T.plane(cx, cz);
          addFloor(c, y);
          addSpan(c, y - 0.01, y - 0.005);
          return;
        }
        // A slope or a ceiling: the heights its plane takes over the cell.
        const h = cell / 2;
        const ys = [T.plane(cx - h, cz - h), T.plane(cx + h, cz - h), T.plane(cx - h, cz + h), T.plane(cx + h, cz + h)];
        addSpan(c, Math.min(...ys), Math.max(...ys));
      });
    }
  }
  bridge(floors, spans, nx, nz, addFloor, addSpan);
  return { x0, z0, nx, nz, cell, floors, spans, wet };
}

// A crack one cell wide between two floors a step apart (a gateway where
// the drive stops short of the fields, a seam where a place meets the
// town's ground) is floored across, as a walker would stride over it.
function bridge(floors, spans, nx, nz, addFloor, addSpan) {
  const before = floors.slice();
  const add = [];
  for (let j = 1; j + 1 < nz; j++) {
    for (let i = 1; i + 1 < nx; i++) {
      const c = j * nx + i;
      if (!Number.isNaN(before[c * FLOORS])) continue;
      for (const [a, b] of [
        [c - 1, c + 1],
        [c - nx, c + nx],
      ]) {
        let best = NaN;
        for (let k = 0; k < FLOORS; k++) {
          const fa = before[a * FLOORS + k];
          if (Number.isNaN(fa)) continue;
          for (let l = 0; l < FLOORS; l++) {
            const fb = before[b * FLOORS + l];
            if (Math.abs(fa - fb) <= WALKER.step && !(Math.max(fa, fb) <= best)) best = Math.max(fa, fb);
          }
        }
        if (!Number.isNaN(best)) {
          add.push([c, best]);
          break;
        }
      }
    }
  }
  for (const [c, y] of add) {
    addFloor(c, y);
    addSpan(c, y - 0.01, y - 0.005);
  }
}

// One triangle as the grid reads it: its corners, its plane, what it is.
function tri() {
  const T = {
    P: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    read(mesh, t, kinds) {
      if (mesh.flags[t] & DISTANT) return false;
      const p = mesh.pos;
      const o = t * 9;
      const P = T.P;
      for (let k = 0; k < 3; k++) {
        P[k][0] = p[o + k * 3];
        P[k][1] = p[o + k * 3 + 1];
        P[k][2] = p[o + k * 3 + 2];
      }
      T.ymin = Math.min(P[0][1], P[1][1], P[2][1]);
      T.ymax = Math.max(P[0][1], P[1][1], P[2][1]);
      const kind = kinds[mesh.mat[t]];
      T.fx = mesh.fn[t * 3];
      T.fy = mesh.fn[t * 3 + 1];
      T.fz = mesh.fn[t * 3 + 2];
      T.fd = mesh.fd[t];
      T.water = kind === KIND.water || kind === KIND.harbor;
      // A two-sided plank can be wound either way up. Leaves are never floors.
      T.floor = !T.water && kind !== KIND.foliage && (T.fy > 0.7 || (mesh.flags[t] & DOUBLE && T.fy < -0.7));
      T.upright = Math.abs(T.fy) < 0.05;
      return true;
    },
    // Height of the triangle's plane at (x, z), held to its own heights.
    plane: (x, z) => Math.min(T.ymax, Math.max(T.ymin, (T.fd - T.fx * x - T.fz * z) / T.fy)),
  };
  return T;
}

// Call fn(cell, x, z) (the cell's middle) for each cell the triangle takes.
// Floors and water take the cells they cover, not the ones they only touch
// along an edge; walls take both.
function cover(T, x0, z0, cell, nx, nz, fn) {
  const P = T.P;
  const E = T.upright ? 0 : 1e-3;
  const za = Math.min(P[0][2], P[1][2], P[2][2]);
  const zb = Math.max(P[0][2], P[1][2], P[2][2]);
  const j0 = Math.max(0, Math.floor((za + E - z0) / cell));
  const j1 = Math.min(nz - 1, Math.floor((zb - E - z0) / cell));
  for (let j = j0; j <= j1; j++) {
    // The triangle's reach in x across this row of cells.
    const ra = z0 + j * cell;
    const rb = ra + cell;
    let xa = Infinity;
    let xb = -Infinity;
    for (let k = 0; k < 3; k++) {
      const a = P[k];
      const b = P[(k + 1) % 3];
      if (a[2] >= ra && a[2] <= rb) {
        xa = Math.min(xa, a[0]);
        xb = Math.max(xb, a[0]);
      }
      for (const zz of [ra, rb]) {
        if ((a[2] - zz) * (b[2] - zz) < 0) {
          const x = a[0] + ((b[0] - a[0]) * (zz - a[2])) / (b[2] - a[2]);
          xa = Math.min(xa, x);
          xb = Math.max(xb, x);
        }
      }
    }
    xa += E;
    xb -= E;
    if (xa > xb) continue;
    const i0 = Math.max(0, Math.floor((xa - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((xb - x0) / cell));
    for (let i = i0; i <= i1; i++) fn(j * nx + i, x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
  }
}

// Sutherland-Hodgman against an axis-aligned rectangle in x and z; the
// points carry their heights along.
function clipRect(poly, xa, za, xb, zb, scratch) {
  let cur = poly;
  const edges = [
    [0, xa, 1],
    [0, xb, -1],
    [2, za, 1],
    [2, zb, -1],
  ];
  for (const [axis, v, sign] of edges) {
    const out = [];
    for (let k = 0; k < cur.length; k++) {
      const a = cur[k];
      const b = cur[(k + 1) % cur.length];
      const da = (a[axis] - v) * sign;
      const db = (b[axis] - v) * sign;
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    cur = out;
    if (cur.length === 0) break;
  }
  scratch.length = 0;
  return cur;
}

// The highest floor under (x, z) no higher than `below`, or NaN. A floor
// under water does not count: the walker stays dry.
export function floorAt(W, x, z, below) {
  if (W.tileAt) W = W.tileAt(x, z);
  if (!W) return NaN;
  const i = Math.floor((x - W.x0) / W.cell);
  const j = Math.floor((z - W.z0) / W.cell);
  if (i < 0 || j < 0 || i >= W.nx || j >= W.nz) return NaN;
  return floorIn(W, j * W.nx + i, below);
}

function floorIn(W, c, below) {
  const o = c * FLOORS;
  let best = NaN;
  for (let k = 0; k < FLOORS; k++) {
    const v = W.floors[o + k];
    if (v <= below && !(v <= best)) best = v;
  }
  return best < W.wet[c] ? NaN : best;
}

/**
 * Does anything stand in the body of a walker whose feet are at `f` over
 * (x, z)? Each cell the walker's circle touches is judged from its own
 * floor, where that is higher: what rises less than a step above the
 * ground it stands on is stepped over, even on a slope.
 */
export function blocked(W, x, z, f, w = WALKER) {
  if (W.tileAt) W = W.tileAt(x, z);
  if (!W) return true;
  const r = w.radius;
  const i0 = Math.floor((x - r - W.x0) / W.cell);
  const i1 = Math.floor((x + r - W.x0) / W.cell);
  const j0 = Math.floor((z - r - W.z0) / W.cell);
  const j1 = Math.floor((z + r - W.z0) / W.cell);
  if (i0 < 0 || j0 < 0 || i1 >= W.nx || j1 >= W.nz) return true;
  const b = f + w.height;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      // Only the cells that touch the walker's circle.
      const cx = Math.max(W.x0 + i * W.cell, Math.min(x, W.x0 + (i + 1) * W.cell));
      const cz = Math.max(W.z0 + j * W.cell, Math.min(z, W.z0 + (j + 1) * W.cell));
      if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
      const c = j * W.nx + i;
      const g = floorIn(W, c, f + w.step);
      const a = (g > f ? g : f) + w.step;
      const o = c * SPANS * 2;
      for (let k = 0; k < SPANS; k++) {
        const s0 = W.spans[o + k * 2];
        if (Number.isNaN(s0)) continue;
        if (s0 < b && W.spans[o + k * 2 + 1] > a) return true;
      }
    }
  }
  return false;
}

/**
 * Move a walker { x, y (feet), z } by (dx, dz): step up what is low
 * enough, slide along walls, drop down steps, never into empty space.
 * Returns the new position.
 */
export function walk(W, pos, dx, dz, w = WALKER) {
  let { x, y, z } = pos;
  const tryMove = (nx, nz) => {
    const f = floorAt(W, nx, nz, y + w.step);
    if (Number.isNaN(f) || f < y - 3) return null;
    // Anything lower than a step can be stepped over (or onto): only what
    // fills the walker's body above that stops them.
    if (blocked(W, nx, nz, f, w)) return null;
    return { x: nx, y: f, z: nz };
  };
  // Small substeps so a fast walker cannot pass through a thin wall.
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (W.cell * 0.5)));
  for (let s = 0; s < n; s++) {
    const sx = dx / n;
    const sz = dz / n;
    const next = tryMove(x + sx, z + sz) ?? tryMove(x + sx, z) ?? tryMove(x, z + sz);
    if (!next) break;
    ({ x, y, z } = next);
  }
  return { x, y, z };
}

/**
 * Where a walker standing near (x, z), on the highest floor no higher than
 * `from`, would stand, or null. If that spot is inside something (a
 * railing, a bush), the nearest clear spot on the same level within two
 * meters.
 */
export function standAt(W, x, z, from = 50, w = WALKER) {
  const f = floorAt(W, x, z, from);
  if (Number.isNaN(f)) return null;
  if (!blocked(W, x, z, f, w)) return { x, y: f, z };
  for (let r = 0.2; r <= 2.001; r += 0.2) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const cx = x + r * Math.cos(a);
      const cz = z + r * Math.sin(a);
      const g = floorAt(W, cx, cz, f + w.step);
      if (Math.abs(g - f) < 0.5 && !blocked(W, cx, cz, g, w)) return { x: cx, y: g, z: cz };
    }
  }
  return { x, y: f, z };
}

/**
 * Walking in the whole town (town.js): the same grid, built a tile at a
 * time as the walker comes near, from an index of which triangles of which
 * piece lie over which tile. Each tile is TILE meters square and reads a
 * margin around it, so a walker inside it never reaches past its grid.
 * floorAt, blocked, walk and standAt take it as they take a place's grid.
 */
export const TILE = 48;
const TILE_MARGIN = 2;
const KEEP = 40; // tiles kept built

export class TownWalk {
  constructor(town, { cell = 0.25 } = {}) {
    this.town = town;
    this.cell = cell;
    const B = town.shadowBox;
    this.i0 = Math.floor(B.min[0] / TILE);
    this.j0 = Math.floor(B.min[2] / TILE);
    this.ni = Math.floor(B.max[0] / TILE) - this.i0 + 1;
    this.nj = Math.floor(B.max[2] / TILE) - this.j0 + 1;
    this.index = new Map(); // piece id -> { mesh, start, tris }
    this.tiles = new Map(); // tile -> its grid
    this.sync();
  }

  /** Take up pieces added or built again; true if any were. */
  sync() {
    let changed = false;
    for (const [id, ix] of this.index) {
      const c = this.town.chunks.get(id);
      if (!c || c.mesh !== ix.mesh) {
        this.forget(ix.box);
        this.index.delete(id);
        changed = true;
      }
    }
    for (const [id, c] of this.town.chunks) {
      if (this.index.has(id)) continue;
      const ix = this.bucket(c.mesh);
      this.index.set(id, ix);
      this.forget(ix.box);
      changed = true;
    }
    return changed;
  }

  // Which tiles each triangle lies over (counted, then listed).
  bucket(mesh) {
    const n = this.ni * this.nj;
    const count = new Int32Array(n + 1);
    const p = mesh.pos;
    const range = (t) => {
      const o = t * 9;
      const xa = Math.min(p[o], p[o + 3], p[o + 6]) - TILE_MARGIN;
      const xb = Math.max(p[o], p[o + 3], p[o + 6]) + TILE_MARGIN;
      const za = Math.min(p[o + 2], p[o + 5], p[o + 8]) - TILE_MARGIN;
      const zb = Math.max(p[o + 2], p[o + 5], p[o + 8]) + TILE_MARGIN;
      const ia = Math.max(0, Math.floor(xa / TILE) - this.i0);
      const ib = Math.min(this.ni - 1, Math.floor(xb / TILE) - this.i0);
      const ja = Math.max(0, Math.floor(za / TILE) - this.j0);
      const jb = Math.min(this.nj - 1, Math.floor(zb / TILE) - this.j0);
      return [ia, ib, ja, jb];
    };
    const box = [Infinity, -Infinity, Infinity, -Infinity];
    for (let t = 0; t < mesh.count; t++) {
      if (mesh.flags[t] & DISTANT) continue;
      const [ia, ib, ja, jb] = range(t);
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) count[j * this.ni + i + 1]++;
      if (ia <= ib && ja <= jb) {
        box[0] = Math.min(box[0], ia);
        box[1] = Math.max(box[1], ib);
        box[2] = Math.min(box[2], ja);
        box[3] = Math.max(box[3], jb);
      }
    }
    for (let k = 0; k < n; k++) count[k + 1] += count[k];
    const start = count.slice();
    const tris = new Int32Array(count[n]);
    for (let t = 0; t < mesh.count; t++) {
      if (mesh.flags[t] & DISTANT) continue;
      const [ia, ib, ja, jb] = range(t);
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) tris[count[j * this.ni + i]++] = t;
    }
    return { mesh, start, tris, box };
  }

  // Tiles a piece lies over are built again when next needed.
  forget([ia, ib, ja, jb]) {
    for (const k of [...this.tiles.keys()]) {
      const i = k % this.ni;
      const j = Math.floor(k / this.ni);
      if (i >= ia && i <= ib && j >= ja && j <= jb) this.tiles.delete(k);
    }
  }

  key(x, z) {
    const i = Math.floor(x / TILE) - this.i0;
    const j = Math.floor(z / TILE) - this.j0;
    return i < 0 || j < 0 || i >= this.ni || j >= this.nj ? -1 : j * this.ni + i;
  }

  /** The grid of the tile (x, z) lies in, built if need be; null off the map. */
  tileAt(x, z) {
    const k = this.key(x, z);
    if (k < 0) return null;
    if (k === this.lastKey && this.tiles.has(k)) return this.lastTile;
    this.lastKey = k;
    let W = this.tiles.get(k);
    this.lastTile = W;
    if (W) {
      // Most recently used last.
      this.tiles.delete(k);
      this.tiles.set(k, W);
      return W;
    }
    W = this.build(k);
    this.lastTile = W;
    this.tiles.set(k, W);
    while (this.tiles.size > KEEP) this.tiles.delete(this.tiles.keys().next().value);
    return W;
  }

  build(k) {
    const i = (k % this.ni) + this.i0;
    const j = Math.floor(k / this.ni) + this.j0;
    const parts = [];
    for (const ix of this.index.values()) {
      const tris = ix.tris.subarray(ix.start[k], ix.start[k + 1]);
      if (tris.length) parts.push({ mesh: ix.mesh, tris });
    }
    const rect = { x0: i * TILE - TILE_MARGIN, z0: j * TILE - TILE_MARGIN, x1: (i + 1) * TILE + TILE_MARGIN, z1: (j + 1) * TILE + TILE_MARGIN };
    return buildWalk({ materials: this.town.materials }, { cell: this.cell, rect, parts });
  }

  /** Build one tile around (x, z) not yet built, if any: a little each frame. */
  prefetch(x, z) {
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const k = this.key(x + dx * TILE, z + dz * TILE);
      if (k >= 0 && !this.tiles.has(k)) {
        this.tileAt(x + dx * TILE, z + dz * TILE);
        return true;
      }
    }
    return false;
  }
}
