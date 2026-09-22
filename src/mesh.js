// Triangle soup builder with a transform stack and a handful of primitives.
// Everything the renderer draws is a triangle with a material, a set of
// flags and an object id. Primitives wind counter-clockwise when seen from
// outside, so face normals (b - a) x (c - a) point outwards.

import {
  mat4Identity,
  mat4Mul,
  mat4Translate,
  mat4RotateX,
  mat4RotateY,
  mat4RotateZ,
  mat4Scale,
  cross,
  sub,
  normalize,
} from './math.js';

export const CAST = 1; // casts sun shadows
export const DOUBLE = 2; // visible from both sides
export const SMOOTH = 4; // interpolate vertex normals when shading
export const UNDERWATER = 8; // pool basin: skipped by the mirrored camera
export const NOREFLECT = 16; // never drawn into the pool reflection
export const DISTANT = 32; // far scenery: no shadow lookups, heavy haze

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.mat = [];
    this.flags = [];
    this.obj = [];
    this.stack = [mat4Identity()];
    this.curMat = 0;
    this.curFlags = CAST;
    this.curObj = 0;
    this.objCount = 1;
  }

  get m() {
    return this.stack[this.stack.length - 1];
  }

  // Matrices are never mutated in place, so push can share the reference.
  push() {
    this.stack.push(this.m);
    return this;
  }

  pop() {
    this.stack.pop();
    return this;
  }

  apply(t) {
    this.stack[this.stack.length - 1] = mat4Mul(this.m, t);
    return this;
  }

  translate(x, y, z) {
    return this.apply(mat4Translate(x, y, z));
  }

  rotateX(a) {
    return this.apply(mat4RotateX(a));
  }

  rotateY(a) {
    return this.apply(mat4RotateY(a));
  }

  rotateZ(a) {
    return this.apply(mat4RotateZ(a));
  }

  scale(x, y = x, z = x) {
    return this.apply(mat4Scale(x, y, z));
  }

  use(mat, flags) {
    this.curMat = mat;
    if (flags !== undefined) this.curFlags = flags;
    return this;
  }

  // Start a new object id (used for per-window lighting and similar).
  object() {
    this.curObj = this.objCount++;
    return this.curObj;
  }

  xf(p) {
    const m = this.m;
    const x = p[0];
    const y = p[1];
    const z = p[2];
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
  }

  xn(n) {
    const m = this.m;
    return normalize([
      m[0] * n[0] + m[4] * n[1] + m[8] * n[2],
      m[1] * n[0] + m[5] * n[1] + m[9] * n[2],
      m[2] * n[0] + m[6] * n[1] + m[10] * n[2],
    ]);
  }

  tri(a, b, c, uv, normals) {
    const A = this.xf(a);
    const B = this.xf(b);
    const C = this.xf(c);
    const n = cross(sub(B, A), sub(C, A));
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-12) return;
    this.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    if (normals && this.curFlags & SMOOTH) {
      for (const v of normals) {
        const t = this.xn(v);
        this.nrm.push(t[0], t[1], t[2]);
      }
    } else {
      const fx = n[0] / l;
      const fy = n[1] / l;
      const fz = n[2] / l;
      this.nrm.push(fx, fy, fz, fx, fy, fz, fx, fy, fz);
    }
    if (uv) this.uv.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]);
    else this.uv.push(0, 0, 0, 0, 0, 0);
    this.mat.push(this.curMat);
    this.flags.push(this.curFlags);
    this.obj.push(this.curObj);
  }

  // a-b-c-d counter-clockwise. uv4 = [ua, va, ub, vb, uc, vc, ud, vd].
  quad(a, b, c, d, uv4, n4) {
    const u = uv4 || [0, 0, 1, 0, 1, 1, 0, 1];
    this.tri(a, b, c, [u[0], u[1], u[2], u[3], u[4], u[5]], n4 && [n4[0], n4[1], n4[2]]);
    this.tri(a, c, d, [u[0], u[1], u[4], u[5], u[6], u[7]], n4 && [n4[0], n4[2], n4[3]]);
  }

  // Axis-aligned box in local space. `skip` omits faces: px nx py ny pz nz.
  // Face UVs are local coordinates in meters so patterns stay in scale.
  box(x0, y0, z0, x1, y1, z1, skip = '') {
    if (!skip.includes('px'))
      this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [z0, y0, z0, y1, z1, y1, z1, y0]);
    if (!skip.includes('nx'))
      this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [z1, y0, z1, y1, z0, y1, z0, y0]);
    if (!skip.includes('py'))
      this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, z0, x0, z1, x1, z1, x1, z0]);
    if (!skip.includes('ny'))
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, z0, x1, z0, x1, z1, x0, z1]);
    if (!skip.includes('pz'))
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, x1, y0, x1, y1, x0, y1]);
    if (!skip.includes('nz'))
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, x0, y0, x0, y1, x1, y1]);
  }

  // Vertical extrusion of a simple polygon given as [[x, z], ...].
  prism(poly, y0, y1, { top = true, bottom = true, sides = true } = {}) {
    let p = poly;
    // Top faces up (+y) when the shoelace area in (x, z) is negative.
    if (shoelace(p) > 0) p = p.slice().reverse();
    const n = p.length;
    if (sides) {
      for (let i = 0; i < n; i++) {
        const a = p[i];
        const b = p[(i + 1) % n];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [0, y0, len, y0, len, y1, 0, y1]);
      }
    }
    if (top || bottom) {
      const tris = triangulate(p);
      for (const [i, j, k] of tris) {
        const a = p[i];
        const b = p[j];
        const c = p[k];
        if (top) this.tri([a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], [a[0], a[1], b[0], b[1], c[0], c[1]]);
        if (bottom) this.tri([a[0], y0, a[1]], [c[0], y0, c[1]], [b[0], y0, b[1]], [a[0], a[1], c[0], c[1], b[0], b[1]]);
      }
    }
  }

  // Extrude a profile drawn in the local xy-plane along z, from z0 to z1.
  profile(poly, z0, z1, opts) {
    this.push();
    this.rotateX(-Math.PI / 2); // prism (x, h, z) -> local (x, z, -h)
    this.prism(poly, -z1, -z0, opts);
    this.pop();
  }

  // Cylinder along local +y. Smooth normals when the SMOOTH flag is set.
  cylinder(r0, r1, y0, y1, segs, { caps = true, matFor } = {}) {
    const ny = (r0 - r1) / (y1 - y0);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      if (matFor) this.curMat = matFor(i);
      const n0 = normalize([c0, ny, -s0]);
      const n1 = normalize([c1, ny, -s1]);
      this.quad(
        [r0 * c0, y0, -r0 * s0],
        [r0 * c1, y0, -r0 * s1],
        [r1 * c1, y1, -r1 * s1],
        [r1 * c0, y1, -r1 * s0],
        [i / segs, y0, (i + 1) / segs, y0, (i + 1) / segs, y1, i / segs, y1],
        [n0, n1, n1, n0],
      );
      if (caps) {
        if (r1 > 0) this.tri([0, y1, 0], [r1 * c0, y1, -r1 * s0], [r1 * c1, y1, -r1 * s1]);
        if (r0 > 0) this.tri([0, y0, 0], [r0 * c1, y0, -r0 * s1], [r0 * c0, y0, -r0 * s0]);
      }
    }
  }

  // Sweep a circle along a polyline. radii[i] per point; parallel-transport
  // frames keep the tube from twisting. uv = (around, distance along path).
  tube(points, radii, segs, { closed = false, capEnd = false } = {}) {
    const n = points.length;
    const tangents = [];
    for (let i = 0; i < n; i++) {
      const a = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      tangents.push(normalize(sub(b, a)));
    }
    let ref = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let nrm = normalize(cross(cross(tangents[0], ref), tangents[0]));
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = tangents[i];
      // Remove the tangent component: transports the previous normal.
      const d = nrm[0] * t[0] + nrm[1] * t[1] + nrm[2] * t[2];
      nrm = normalize([nrm[0] - t[0] * d, nrm[1] - t[1] * d, nrm[2] - t[2] * d]);
      frames.push([nrm, cross(t, nrm)]);
    }
    const ring = (i) => {
      const [u, v] = frames[i];
      const p = points[i];
      const r = radii[i];
      const out = [];
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const dir = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
        out.push({ p: [p[0] + dir[0] * r, p[1] + dir[1] * r, p[2] + dir[2] * r], n: dir });
      }
      return out;
    };
    let dist = 0;
    let prev = ring(0);
    const last = closed ? n : n - 1;
    for (let i = 1; i <= last; i++) {
      const idx = i % n;
      const cur = ring(idx);
      const seg = Math.hypot(...sub(points[idx], points[i - 1]));
      for (let k = 0; k < segs; k++) {
        const a = prev[k];
        const b = prev[k + 1];
        const c = cur[k + 1];
        const d = cur[k];
        this.quad(
          a.p,
          b.p,
          c.p,
          d.p,
          [k / segs, dist, (k + 1) / segs, dist, (k + 1) / segs, dist + seg, k / segs, dist + seg],
          [a.n, b.n, c.n, d.n],
        );
      }
      dist += seg;
      prev = cur;
    }
    if (capEnd && !closed) {
      const c = points[n - 1];
      for (let k = 0; k < segs; k++) this.tri(c, prev[k].p, prev[k + 1].p);
    }
  }

  sphere(r, segs = 10, rings = 6) {
    for (let j = 0; j < rings; j++) {
      const t0 = (j / rings) * Math.PI;
      const t1 = ((j + 1) / rings) * Math.PI;
      for (let i = 0; i < segs; i++) {
        const p0 = (i / segs) * Math.PI * 2;
        const p1 = ((i + 1) / segs) * Math.PI * 2;
        const v = (t, p) => [Math.sin(t) * Math.cos(p), Math.cos(t), -Math.sin(t) * Math.sin(p)];
        const a = v(t0, p0);
        const b = v(t1, p0);
        const c = v(t1, p1);
        const d = v(t0, p1);
        const s = (q) => [q[0] * r, q[1] * r, q[2] * r];
        if (j === 0) this.tri(s(a), s(b), s(c), null, [a, b, c]);
        else if (j === rings - 1) this.tri(s(a), s(b), s(d), null, [a, b, d]);
        else this.quad(s(a), s(b), s(c), s(d), null, [a, b, c, d]);
      }
    }
  }
}

export function shoelace(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    a += q[0] * r[1] - r[0] * q[1];
  }
  return a / 2;
}

// Ear clipping for simple polygons with negative shoelace area.
// Returns index triples wound the same way as the input.
export function triangulate(p) {
  const idx = p.map((_, i) => i);
  const out = [];
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (pt, a, b, c) => cr(a, b, pt) <= 0 && cr(b, c, pt) <= 0 && cr(c, a, pt) <= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = p[ia];
      const b = p[ib];
      const c = p[ic];
      if (cr(a, b, c) >= 0) continue; // reflex (or flat) for this winding
      let ear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(p[j], a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate input: bail out with what we have
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

// Freeze a builder into typed arrays plus per-triangle helpers the renderer
// needs: plane equations and barycentric setup.
export function finalizeMesh(b) {
  const n = b.mat.length;
  const pos = Float64Array.from(b.pos);
  const fn = new Float64Array(n * 3);
  const fd = new Float64Array(n);
  const bary = new Float64Array(n * 10);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = pos[o];
    const ay = pos[o + 1];
    const az = pos[o + 2];
    const e0x = pos[o + 3] - ax;
    const e0y = pos[o + 4] - ay;
    const e0z = pos[o + 5] - az;
    const e1x = pos[o + 6] - ax;
    const e1y = pos[o + 7] - ay;
    const e1z = pos[o + 8] - az;
    let nx = e0y * e1z - e0z * e1y;
    let ny = e0z * e1x - e0x * e1z;
    let nz = e0x * e1y - e0y * e1x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    fn[t * 3] = nx;
    fn[t * 3 + 1] = ny;
    fn[t * 3 + 2] = nz;
    fd[t] = nx * ax + ny * ay + nz * az;
    const d00 = e0x * e0x + e0y * e0y + e0z * e0z;
    const d01 = e0x * e1x + e0y * e1y + e0z * e1z;
    const d11 = e1x * e1x + e1y * e1y + e1z * e1z;
    const den = d00 * d11 - d01 * d01;
    const q = t * 10;
    bary[q] = e0x;
    bary[q + 1] = e0y;
    bary[q + 2] = e0z;
    bary[q + 3] = e1x;
    bary[q + 4] = e1y;
    bary[q + 5] = e1z;
    bary[q + 6] = d00;
    bary[q + 7] = d01;
    bary[q + 8] = d11;
    bary[q + 9] = den !== 0 ? 1 / den : 0;
    for (let k = 0; k < 3; k++) {
      for (let c = 0; c < 3; c++) {
        const v = pos[o + k * 3 + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
  }
  return {
    count: n,
    pos,
    nrm: Float32Array.from(b.nrm),
    uv: Float32Array.from(b.uv),
    mat: Uint16Array.from(b.mat),
    flags: Uint8Array.from(b.flags),
    obj: Uint32Array.from(b.obj),
    fn,
    fd,
    bary,
    bounds: { min, max },
  };
}
