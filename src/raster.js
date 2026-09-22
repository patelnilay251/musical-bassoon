// Triangle setup and a span rasterizer that writes a visibility buffer:
// for every sample, the id of the nearest triangle and its depth. Shading
// happens afterwards, exactly once per visible sample, so overdraw costs
// almost nothing.
//
// Depth is any quantity that is affine in screen space and grows toward the
// viewer: 1/w for perspective cameras, distance toward the sun for the
// orthographic shadow camera.

import { DOUBLE } from './mesh.js';

export class ScreenTris {
  constructor(cap = 1024) {
    this.cap = cap;
    this.v = new Float64Array(cap * 9); // (sx, sy, depth) x 3
    this.id = new Int32Array(cap);
    this.bb = new Int32Array(cap * 4); // minX, minY, maxX, maxY (max exclusive)
    this.count = 0;
  }

  grow() {
    const cap = this.cap * 2;
    const v = new Float64Array(cap * 9);
    v.set(this.v);
    const id = new Int32Array(cap);
    id.set(this.id);
    const bb = new Int32Array(cap * 4);
    bb.set(this.bb);
    this.cap = cap;
    this.v = v;
    this.id = id;
    this.bb = bb;
  }

  emit(id, ax, ay, ad, bx, by, bd, cx, cy, cd, W, H) {
    const minSx = Math.min(ax, bx, cx);
    const maxSx = Math.max(ax, bx, cx);
    const minSy = Math.min(ay, by, cy);
    const maxSy = Math.max(ay, by, cy);
    // Samples sit at pixel centers: pixel x is a candidate if x + 0.5 is in range.
    const x0 = Math.max(0, Math.ceil(minSx - 0.5));
    const x1 = Math.min(W - 1, Math.floor(maxSx - 0.5));
    const y0 = Math.max(0, Math.ceil(minSy - 0.5));
    const y1 = Math.min(H - 1, Math.floor(maxSy - 0.5));
    if (x0 > x1 || y0 > y1) return;
    if (this.count >= this.cap) this.grow();
    const n = this.count++;
    const o = n * 9;
    const v = this.v;
    v[o] = ax;
    v[o + 1] = ay;
    v[o + 2] = ad;
    v[o + 3] = bx;
    v[o + 4] = by;
    v[o + 5] = bd;
    v[o + 6] = cx;
    v[o + 7] = cy;
    v[o + 8] = cd;
    this.id[n] = id;
    const b = n * 4;
    this.bb[b] = x0;
    this.bb[b + 1] = y0;
    this.bb[b + 2] = x1 + 1;
    this.bb[b + 3] = y1 + 1;
  }
}

// Scratch polygon for near-plane clipping: up to 4 vertices of (x, y, w).
const clipIn = new Float64Array(12);
const clipOut = new Float64Array(15);

/**
 * Perspective setup. cam = { vp, eye, near }. Triangles are kept when
 * (flags & include) === include and (flags & exclude) === 0.
 */
export function projectPerspective(mesh, cam, W, H, include, exclude, out) {
  const { pos, flags, fn, fd } = mesh;
  const m = cam.vp;
  const near = cam.near;
  const ex = cam.eye[0];
  const ey = cam.eye[1];
  const ez = cam.eye[2];
  const hw = W * 0.5;
  const hh = H * 0.5;
  out.count = 0;
  for (let t = 0; t < mesh.count; t++) {
    const f = flags[t];
    if ((f & include) !== include || (f & exclude) !== 0) continue;
    if (!(f & DOUBLE)) {
      const side = fn[t * 3] * ex + fn[t * 3 + 1] * ey + fn[t * 3 + 2] * ez - fd[t];
      if (side <= 0) continue;
    }
    const o = t * 9;
    const x0 = pos[o];
    const y0 = pos[o + 1];
    const z0 = pos[o + 2];
    const x1 = pos[o + 3];
    const y1 = pos[o + 4];
    const z1 = pos[o + 5];
    const x2 = pos[o + 6];
    const y2 = pos[o + 7];
    const z2 = pos[o + 8];
    const cx0 = m[0] * x0 + m[4] * y0 + m[8] * z0 + m[12];
    const cy0 = m[1] * x0 + m[5] * y0 + m[9] * z0 + m[13];
    const cw0 = m[3] * x0 + m[7] * y0 + m[11] * z0 + m[15];
    const cx1 = m[0] * x1 + m[4] * y1 + m[8] * z1 + m[12];
    const cy1 = m[1] * x1 + m[5] * y1 + m[9] * z1 + m[13];
    const cw1 = m[3] * x1 + m[7] * y1 + m[11] * z1 + m[15];
    const cx2 = m[0] * x2 + m[4] * y2 + m[8] * z2 + m[12];
    const cy2 = m[1] * x2 + m[5] * y2 + m[9] * z2 + m[13];
    const cw2 = m[3] * x2 + m[7] * y2 + m[11] * z2 + m[15];
    // Trivial rejects against the side planes.
    if (cx0 > cw0 && cx1 > cw1 && cx2 > cw2) continue;
    if (cx0 < -cw0 && cx1 < -cw1 && cx2 < -cw2) continue;
    if (cy0 > cw0 && cy1 > cw1 && cy2 > cw2) continue;
    if (cy0 < -cw0 && cy1 < -cw1 && cy2 < -cw2) continue;
    const in0 = cw0 >= near;
    const in1 = cw1 >= near;
    const in2 = cw2 >= near;
    if (!in0 && !in1 && !in2) continue;
    if (in0 && in1 && in2) {
      const i0 = 1 / cw0;
      const i1 = 1 / cw1;
      const i2 = 1 / cw2;
      out.emit(
        t,
        (cx0 * i0 + 1) * hw,
        (1 - cy0 * i0) * hh,
        i0,
        (cx1 * i1 + 1) * hw,
        (1 - cy1 * i1) * hh,
        i1,
        (cx2 * i2 + 1) * hw,
        (1 - cy2 * i2) * hh,
        i2,
        W,
        H,
      );
      continue;
    }
    // Sutherland-Hodgman against w = near.
    clipIn[0] = cx0;
    clipIn[1] = cy0;
    clipIn[2] = cw0;
    clipIn[3] = cx1;
    clipIn[4] = cy1;
    clipIn[5] = cw1;
    clipIn[6] = cx2;
    clipIn[7] = cy2;
    clipIn[8] = cw2;
    let n = 0;
    for (let k = 0; k < 3; k++) {
      const a = k * 3;
      const b = ((k + 1) % 3) * 3;
      const wa = clipIn[a + 2];
      const wb = clipIn[b + 2];
      const ina = wa >= near;
      const inb = wb >= near;
      if (ina) {
        clipOut[n * 3] = clipIn[a];
        clipOut[n * 3 + 1] = clipIn[a + 1];
        clipOut[n * 3 + 2] = wa;
        n++;
      }
      if (ina !== inb) {
        const s = (wa - near) / (wa - wb);
        clipOut[n * 3] = clipIn[a] + (clipIn[b] - clipIn[a]) * s;
        clipOut[n * 3 + 1] = clipIn[a + 1] + (clipIn[b + 1] - clipIn[a + 1]) * s;
        clipOut[n * 3 + 2] = near;
        n++;
      }
    }
    const sx0 = (clipOut[0] / clipOut[2] + 1) * hw;
    const sy0 = (1 - clipOut[1] / clipOut[2]) * hh;
    const d0 = 1 / clipOut[2];
    for (let k = 1; k + 1 < n; k++) {
      const a = k * 3;
      const b = (k + 1) * 3;
      out.emit(
        t,
        sx0,
        sy0,
        d0,
        (clipOut[a] / clipOut[a + 2] + 1) * hw,
        (1 - clipOut[a + 1] / clipOut[a + 2]) * hh,
        1 / clipOut[a + 2],
        (clipOut[b] / clipOut[b + 2] + 1) * hw,
        (1 - clipOut[b + 1] / clipOut[b + 2]) * hh,
        1 / clipOut[b + 2],
        W,
        H,
      );
    }
  }
}

/**
 * Orthographic setup for the sun's shadow camera.
 * L = { right, up, dir, u0, v1, sx, sy } maps a world point to
 * pixel (dot(P, right) - u0) * sx, (v1 - dot(P, up)) * sy with depth dot(P, dir).
 */
export function projectOrtho(mesh, L, W, H, include, exclude, out) {
  const { pos, flags } = mesh;
  const [rx, ry, rz] = L.right;
  const [ux, uy, uz] = L.up;
  const [dx, dy, dz] = L.dir;
  const { u0, v1, sx, sy } = L;
  out.count = 0;
  for (let t = 0; t < mesh.count; t++) {
    const f = flags[t];
    if ((f & include) !== include || (f & exclude) !== 0) continue;
    const o = t * 9;
    const x0 = pos[o];
    const y0 = pos[o + 1];
    const z0 = pos[o + 2];
    const x1 = pos[o + 3];
    const y1 = pos[o + 4];
    const z1 = pos[o + 5];
    const x2 = pos[o + 6];
    const y2 = pos[o + 7];
    const z2 = pos[o + 8];
    out.emit(
      t,
      (rx * x0 + ry * y0 + rz * z0 - u0) * sx,
      (v1 - (ux * x0 + uy * y0 + uz * z0)) * sy,
      dx * x0 + dy * y0 + dz * z0,
      (rx * x1 + ry * y1 + rz * z1 - u0) * sx,
      (v1 - (ux * x1 + uy * y1 + uz * z1)) * sy,
      dx * x1 + dy * y1 + dz * z1,
      (rx * x2 + ry * y2 + rz * z2 - u0) * sx,
      (v1 - (ux * x2 + uy * y2 + uz * z2)) * sy,
      dx * x2 + dy * y2 + dz * z2,
      W,
      H,
    );
  }
}

/**
 * Rasterize every screen triangle overlapping the region [x0, x1) x [y0, y1)
 * into depth/ids buffers laid out with stride (x1 - x0). A sample is inside
 * when all three edge functions are >= 0; shared edges may be claimed twice,
 * which the depth test resolves, but never zero times.
 */
export function rasterize(st, x0, y0, x1, y1, depth, ids) {
  const stride = x1 - x0;
  const V = st.v;
  const BB = st.bb;
  const ID = st.id;
  for (let t = 0; t < st.count; t++) {
    const b4 = t * 4;
    let minX = BB[b4];
    let minY = BB[b4 + 1];
    let maxX = BB[b4 + 2];
    let maxY = BB[b4 + 3];
    if (maxX <= x0 || minX >= x1 || maxY <= y0 || minY >= y1) continue;
    if (minX < x0) minX = x0;
    if (minY < y0) minY = y0;
    if (maxX > x1) maxX = x1;
    if (maxY > y1) maxY = y1;
    const o = t * 9;
    const ax = V[o];
    const ay = V[o + 1];
    const ad = V[o + 2];
    let bx = V[o + 3];
    let by = V[o + 4];
    let bd = V[o + 5];
    let cx = V[o + 6];
    let cy = V[o + 7];
    let cd = V[o + 8];
    let area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!(area !== 0) || !Number.isFinite(area)) continue;
    if (area < 0) {
      let s = bx;
      bx = cx;
      cx = s;
      s = by;
      by = cy;
      cy = s;
      s = bd;
      bd = cd;
      cd = s;
      area = -area;
    }
    const inv = 1 / area;
    // Per-pixel steps of the three edge functions (weights of c, a, b).
    const sab = ay - by;
    const sbc = by - cy;
    const sca = cy - ay;
    const ddx = (ad * sbc + bd * sca + cd * sab) * inv;
    const id = ID[t];
    const fx = minX + 0.5;
    for (let y = minY; y < maxY; y++) {
      const py = y + 0.5;
      let eab = (bx - ax) * (py - ay) - (by - ay) * (fx - ax);
      let ebc = (cx - bx) * (py - by) - (cy - by) * (fx - bx);
      let eca = (ax - cx) * (py - cy) - (ay - cy) * (fx - cx);
      // Narrow the row to the span where all edges can be >= 0, with a
      // one-pixel safety margin; the per-sample test below stays exact.
      let xs = minX;
      let xe = maxX;
      if (sab > 0) {
        if (eab < 0) xs = Math.max(xs, minX + Math.ceil(-eab / sab) - 1);
      } else if (sab < 0) {
        if (eab < 0) continue;
        xe = Math.min(xe, minX + Math.floor(eab / -sab) + 2);
      } else if (eab < 0) continue;
      if (sbc > 0) {
        if (ebc < 0) xs = Math.max(xs, minX + Math.ceil(-ebc / sbc) - 1);
      } else if (sbc < 0) {
        if (ebc < 0) continue;
        xe = Math.min(xe, minX + Math.floor(ebc / -sbc) + 2);
      } else if (ebc < 0) continue;
      if (sca > 0) {
        if (eca < 0) xs = Math.max(xs, minX + Math.ceil(-eca / sca) - 1);
      } else if (sca < 0) {
        if (eca < 0) continue;
        xe = Math.min(xe, minX + Math.floor(eca / -sca) + 2);
      } else if (eca < 0) continue;
      if (xs >= xe) continue;
      const skip = xs - minX;
      eab += sab * skip;
      ebc += sbc * skip;
      eca += sca * skip;
      let d = (ad * ebc + bd * eca + cd * eab) * inv;
      let i = (y - y0) * stride + (xs - x0);
      for (let x = xs; x < xe; x++, i++) {
        if (eab >= 0 && ebc >= 0 && eca >= 0 && d > depth[i]) {
          depth[i] = d;
          ids[i] = id;
        }
        eab += sab;
        ebc += sbc;
        eca += sca;
        d += ddx;
      }
    }
  }
}
