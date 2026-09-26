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
const TOP = 9; // nothing above this height matters to a walker
const MAX_CELLS = 1.2e6; // big places get coarser cells

export const WALKER = { radius: 0.3, height: 1.7, eye: 1.6, step: 0.36 };

/**
 * Grid over the place's shadow box (plus `margin`), cells about `cell`
 * meters (coarser if the place is big).
 */
export function buildWalk(world, { cell: want = 0.25, margin = 12 } = {}) {
  const box = world.shadowBox;
  const x0 = box.min[0] - margin;
  const z0 = box.min[2] - margin;
  const w = box.max[0] + margin - x0;
  const d = box.max[2] + margin - z0;
  const cell = Math.max(want, Math.sqrt((w * d) / MAX_CELLS));
  const nx = Math.ceil(w / cell);
  const nz = Math.ceil(d / cell);
  const floors = new Float32Array(nx * nz * FLOORS).fill(NaN);
  const spans = new Float32Array(nx * nz * SPANS * 2).fill(NaN);
  const wet = new Float32Array(nx * nz).fill(NaN);
  const mesh = world.mesh;
  const kinds = world.materials.map((m) => KIND[m.kind ?? 'diffuse']);

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

  const P = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const clipped = [];
  for (let t = 0; t < mesh.count; t++) {
    if (mesh.flags[t] & DISTANT) continue;
    const p = mesh.pos;
    const o = t * 9;
    for (let k = 0; k < 3; k++) {
      P[k][0] = p[o + k * 3];
      P[k][1] = p[o + k * 3 + 1];
      P[k][2] = p[o + k * 3 + 2];
    }
    const ymin = Math.min(P[0][1], P[1][1], P[2][1]);
    const ymax = Math.max(P[0][1], P[1][1], P[2][1]);
    if (ymin > TOP) continue;
    const kind = kinds[mesh.mat[t]];
    const fx = mesh.fn[t * 3];
    const fy = mesh.fn[t * 3 + 1];
    const fz = mesh.fn[t * 3 + 2];
    const fd = mesh.fd[t];
    const water = kind === KIND.water || kind === KIND.harbor;
    // A two-sided plank can be wound either way up. Leaves are never floors.
    const floor = !water && kind !== KIND.foliage && (fy > 0.7 || (mesh.flags[t] & DOUBLE && fy < -0.7));
    const upright = Math.abs(fy) < 0.05;
    // Floors and water take the cells they cover, not the ones they only
    // touch along an edge; walls take both.
    const E = upright ? 0 : 1e-3;
    const za = Math.min(P[0][2], P[1][2], P[2][2]);
    const zb = Math.max(P[0][2], P[1][2], P[2][2]);
    const j0 = Math.max(0, Math.floor((za + E - z0) / cell));
    const j1 = Math.min(nz - 1, Math.floor((zb - E - z0) / cell));
    // Height of the triangle's plane at (x, z), held to its own heights.
    const plane = (x, z) => Math.min(ymax, Math.max(ymin, (fd - fx * x - fz * z) / fy));
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
      for (let i = i0; i <= i1; i++) {
        const c = j * nx + i;
        const cx = x0 + (i + 0.5) * cell;
        const cz = z0 + (j + 0.5) * cell;
        if (water) {
          const y = plane(cx, cz);
          if (!(wet[c] >= y)) wet[c] = y;
          continue;
        }
        if (upright) {
          // A wall: the heights it fills over this cell, exactly.
          const part = clipRect(P, cx - cell / 2, cz - cell / 2, cx + cell / 2, cz + cell / 2, clipped);
          if (part.length === 0) continue;
          let lo = Infinity;
          let hi = -Infinity;
          for (const q of part) {
            lo = Math.min(lo, q[1]);
            hi = Math.max(hi, q[1]);
          }
          addSpan(c, lo, hi);
          continue;
        }
        if (floor) {
          const y = plane(cx, cz);
          addFloor(c, y);
          addSpan(c, y - 0.01, y - 0.005);
          continue;
        }
        // A slope or a ceiling: the heights its plane takes over the cell.
        const h = cell / 2;
        const ys = [plane(cx - h, cz - h), plane(cx + h, cz - h), plane(cx - h, cz + h), plane(cx + h, cz + h)];
        addSpan(c, Math.min(...ys), Math.max(...ys));
      }
    }
  }
  return { x0, z0, nx, nz, cell, floors, spans, wet };
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
