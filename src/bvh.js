// Bounding volume hierarchy over shadow-casting triangles, for exact
// ray-traced sun shadows. Used for print-quality frames: shadow maps are
// fast but stair-step at close range; a shadow ray is always crisp.
//
// Build: recursive median split on the longest centroid axis, 4 triangles
// per leaf. Query: any-hit traversal with slab tests and Moller-Trumbore.

import { CAST, DISTANT } from './mesh.js';

const LEAF = 4;

export class BVH {
  constructor(mesh, include = CAST, exclude = DISTANT) {
    const { pos, flags } = mesh;
    const ids = [];
    for (let t = 0; t < mesh.count; t++) {
      if ((flags[t] & include) === include && (flags[t] & exclude) === 0) ids.push(t);
    }
    const n = ids.length;
    const cen = new Float64Array(n * 3);
    const bmin = new Float64Array(n * 3);
    const bmax = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = ids[i] * 9;
      for (let c = 0; c < 3; c++) {
        const a = pos[o + c];
        const b = pos[o + 3 + c];
        const d = pos[o + 6 + c];
        bmin[i * 3 + c] = Math.min(a, b, d);
        bmax[i * 3 + c] = Math.max(a, b, d);
        cen[i * 3 + c] = (a + b + d) / 3;
      }
    }
    const order = Int32Array.from({ length: n }, (_, i) => i);
    // Median splits leave 2-4 triangles per leaf, so size for the worst
    // case (one per leaf): writes past a typed array's end vanish silently.
    const maxNodes = Math.max(1, 2 * n);
    this.nb = new Float64Array(maxNodes * 6);
    this.na = new Int32Array(maxNodes); // left child, or first triangle for leaves
    this.nc = new Int32Array(maxNodes); // right child, or -count for leaves
    this.count = 0;
    const build = (lo, hi) => {
      const node = this.count++;
      let x0 = Infinity;
      let y0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let z1 = -Infinity;
      let cx0 = Infinity;
      let cy0 = Infinity;
      let cz0 = Infinity;
      let cx1 = -Infinity;
      let cy1 = -Infinity;
      let cz1 = -Infinity;
      for (let i = lo; i < hi; i++) {
        const k = order[i] * 3;
        x0 = Math.min(x0, bmin[k]);
        y0 = Math.min(y0, bmin[k + 1]);
        z0 = Math.min(z0, bmin[k + 2]);
        x1 = Math.max(x1, bmax[k]);
        y1 = Math.max(y1, bmax[k + 1]);
        z1 = Math.max(z1, bmax[k + 2]);
        cx0 = Math.min(cx0, cen[k]);
        cy0 = Math.min(cy0, cen[k + 1]);
        cz0 = Math.min(cz0, cen[k + 2]);
        cx1 = Math.max(cx1, cen[k]);
        cy1 = Math.max(cy1, cen[k + 1]);
        cz1 = Math.max(cz1, cen[k + 2]);
      }
      const b = node * 6;
      this.nb[b] = x0;
      this.nb[b + 1] = y0;
      this.nb[b + 2] = z0;
      this.nb[b + 3] = x1;
      this.nb[b + 4] = y1;
      this.nb[b + 5] = z1;
      if (hi - lo <= LEAF) {
        this.na[node] = lo;
        this.nc[node] = -(hi - lo);
        return node;
      }
      const ex = cx1 - cx0;
      const ey = cy1 - cy0;
      const ez = cz1 - cz0;
      const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
      const part = Array.from(order.subarray(lo, hi)).sort((a, c) => cen[a * 3 + axis] - cen[c * 3 + axis]);
      order.set(part, lo);
      const mid = (lo + hi) >> 1;
      this.na[node] = build(lo, mid);
      this.nc[node] = build(mid, hi);
      return node;
    };
    if (n > 0) build(0, n);
    if (this.count > maxNodes) throw new Error('BVH node overflow');
    // Triangles in leaf order as (v0, e1, e2) for Moller-Trumbore.
    this.tri = new Float64Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = ids[order[i]] * 9;
      const q = i * 9;
      this.tri[q] = pos[o];
      this.tri[q + 1] = pos[o + 1];
      this.tri[q + 2] = pos[o + 2];
      for (let c = 0; c < 3; c++) {
        this.tri[q + 3 + c] = pos[o + 3 + c] - pos[o + c];
        this.tri[q + 6 + c] = pos[o + 6 + c] - pos[o + c];
      }
    }
    this.size = n;
    this.stack = new Int32Array(128);
  }

  // True if the ray (o, d) hits any triangle at t > tmin.
  occluded(ox, oy, oz, dx, dy, dz, tmin = 1e-4) {
    if (!this.size) return false;
    const nb = this.nb;
    const na = this.na;
    const nc = this.nc;
    const T = this.tri;
    const stack = this.stack;
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    let sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const node = stack[--sp];
      const b = node * 6;
      let t0 = (nb[b] - ox) * ix;
      let t1 = (nb[b + 3] - ox) * ix;
      let lo = t0 < t1 ? t0 : t1;
      let hi = t0 < t1 ? t1 : t0;
      t0 = (nb[b + 1] - oy) * iy;
      t1 = (nb[b + 4] - oy) * iy;
      if (t0 > t1) {
        const s = t0;
        t0 = t1;
        t1 = s;
      }
      if (t0 > lo) lo = t0;
      if (t1 < hi) hi = t1;
      t0 = (nb[b + 2] - oz) * iz;
      t1 = (nb[b + 5] - oz) * iz;
      if (t0 > t1) {
        const s = t0;
        t0 = t1;
        t1 = s;
      }
      if (t0 > lo) lo = t0;
      if (t1 < hi) hi = t1;
      if (hi < lo || hi < tmin) continue;
      const c = nc[node];
      if (c >= 0) {
        stack[sp++] = na[node];
        stack[sp++] = c;
        continue;
      }
      const first = na[node];
      const last = first - c;
      for (let i = first; i < last; i++) {
        const q = i * 9;
        const e1x = T[q + 3];
        const e1y = T[q + 4];
        const e1z = T[q + 5];
        const e2x = T[q + 6];
        const e2y = T[q + 7];
        const e2z = T[q + 8];
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-12 && det < 1e-12) continue;
        const inv = 1 / det;
        const tx = ox - T[q];
        const ty = oy - T[q + 1];
        const tz = oz - T[q + 2];
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > tmin) return true;
      }
    }
    return false;
  }
}
