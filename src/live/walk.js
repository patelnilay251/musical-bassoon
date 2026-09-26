// Walking through a place: where the ground is and what stands in the way,
// read from the place's own triangles into a grid of small cells. Each
// cell keeps the heights of the floors in it (faces that look up) and the
// spans of height its other faces fill. A walker can step up a curb or a
// stair, not through a wall, and never onto water.

import { KIND } from '../render.js';
import { DISTANT } from '../mesh.js';

const FLOORS = 4; // floor heights kept per cell
const SPANS = 4; // blocked height spans kept per cell
const TOP = 9; // nothing above this height matters to a walker

export const WALKER = { radius: 0.3, height: 1.7, eye: 1.6, step: 0.36 };

/** Grid over the place's shadow box (plus `margin`), cells `cell` meters. */
export function buildWalk(world, { cell = 0.25, margin = 30 } = {}) {
  const box = world.shadowBox;
  const x0 = box.min[0] - margin;
  const z0 = box.min[2] - margin;
  const nx = Math.ceil((box.max[0] + margin - x0) / cell);
  const nz = Math.ceil((box.max[2] + margin - z0) / cell);
  const floors = new Float32Array(nx * nz * FLOORS).fill(NaN);
  const spans = new Float32Array(nx * nz * SPANS * 2).fill(NaN);
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
    // Full: keep the highest floors.
    let lo = 0;
    for (let k = 1; k < FLOORS; k++) if (floors[o + k] < floors[o + lo]) lo = k;
    if (y > floors[o + lo]) floors[o + lo] = y;
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
      const d = Math.max(0, spans[o + k * 2] - b, a - spans[o + k * 2 + 1]);
      if (d < gap) {
        gap = d;
        best = k;
      }
    }
    spans[o + best * 2] = Math.min(spans[o + best * 2], a);
    spans[o + best * 2 + 1] = Math.max(spans[o + best * 2 + 1], b);
  };

  const poly = [];
  const clipped = [];
  for (let t = 0; t < mesh.count; t++) {
    if (mesh.flags[t] & DISTANT) continue;
    const p = mesh.pos;
    const o = t * 9;
    const ymin = Math.min(p[o + 1], p[o + 4], p[o + 7]);
    if (ymin > TOP) continue;
    const kind = kinds[mesh.mat[t]];
    const xa = Math.min(p[o], p[o + 3], p[o + 6]);
    const xb = Math.max(p[o], p[o + 3], p[o + 6]);
    const za = Math.min(p[o + 2], p[o + 5], p[o + 8]);
    const zb = Math.max(p[o + 2], p[o + 5], p[o + 8]);
    const i0 = Math.max(0, Math.floor((xa - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((xb - x0) / cell));
    const j0 = Math.max(0, Math.floor((za - z0) / cell));
    const j1 = Math.min(nz - 1, Math.floor((zb - z0) / cell));
    if (i0 > i1 || j0 > j1) continue;
    const ny = mesh.fn[t * 3 + 1];
    const water = kind === KIND.water || kind === KIND.harbor;
    const floor = !water && ny > 0.7;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * nx + i;
        // The part of the triangle over this cell.
        poly.length = 0;
        for (let k = 0; k < 3; k++) poly.push([p[o + k * 3], p[o + k * 3 + 1], p[o + k * 3 + 2]]);
        const cx0 = x0 + i * cell;
        const cz0 = z0 + j * cell;
        const part = clipRect(poly, cx0, cz0, cx0 + cell, cz0 + cell, clipped);
        if (part.length === 0) continue;
        let lo = Infinity;
        let hi = -Infinity;
        for (const q of part) {
          lo = Math.min(lo, q[1]);
          hi = Math.max(hi, q[1]);
        }
        if (water) addSpan(c, lo - 2, hi + 2);
        else if (floor) {
          addFloor(c, hi);
          addSpan(c, lo - 0.01, hi - 0.005);
        } else addSpan(c, lo, hi);
      }
    }
  }
  return { x0, z0, nx, nz, cell, floors, spans };
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

// The highest floor under (x, z) no higher than `below`, or NaN.
export function floorAt(W, x, z, below) {
  const i = Math.floor((x - W.x0) / W.cell);
  const j = Math.floor((z - W.z0) / W.cell);
  if (i < 0 || j < 0 || i >= W.nx || j >= W.nz) return NaN;
  const o = (j * W.nx + i) * FLOORS;
  let best = NaN;
  for (let k = 0; k < FLOORS; k++) {
    const v = W.floors[o + k];
    if (v <= below && !(v <= best)) best = v;
  }
  return best;
}

// Does anything fill heights (a, b) within `r` of (x, z)?
export function blocked(W, x, z, a, b, r) {
  const i0 = Math.floor((x - r - W.x0) / W.cell);
  const i1 = Math.floor((x + r - W.x0) / W.cell);
  const j0 = Math.floor((z - r - W.z0) / W.cell);
  const j1 = Math.floor((z + r - W.z0) / W.cell);
  if (i0 < 0 || j0 < 0 || i1 >= W.nx || j1 >= W.nz) return true;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      // Only the cells that touch the walker's circle.
      const cx = Math.max(W.x0 + i * W.cell, Math.min(x, W.x0 + (i + 1) * W.cell));
      const cz = Math.max(W.z0 + j * W.cell, Math.min(z, W.z0 + (j + 1) * W.cell));
      if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
      const o = (j * W.nx + i) * SPANS * 2;
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
    if (blocked(W, nx, nz, f + w.step, f + w.height, w.radius)) return null;
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

/** Where a walker standing near (x, z) would stand, or null. */
export function standAt(W, x, z, from = 50, w = WALKER) {
  const f = floorAt(W, x, z, from);
  if (Number.isNaN(f)) return null;
  return { x, y: f, z };
}
