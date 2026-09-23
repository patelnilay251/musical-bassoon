// The renderer: sun shadow map, mirrored pool reflection, visibility
// buffer, then one shading call per sample. Supersampled tiles are
// averaged into a float RGB image; toRGBA() turns that into 8-bit pixels.

import { ScreenTris, projectPerspective, projectOrtho, rasterize } from './raster.js';
import { BVH } from './bvh.js';
import { CAST, DOUBLE, SMOOTH, UNDERWATER, NOREFLECT, DISTANT } from './mesh.js';
import { skyState, skyColor, seaColor, SEA_LEVEL } from './sky.js';
import { LOOKS, DEFAULT_LOOK, lookOf } from './looks.js';
import { DEG, clamp, lerp, smoothstep, hash2, hex, valueNoise, normalize, cross, sub, mat4LookAt, mat4Perspective, mat4Mul, rgbToHsv, hsvToRgb } from './math.js';

export const KIND = {
  diffuse: 0,
  foliage: 1,
  glass: 2,
  chrome: 3,
  paint: 4,
  water: 5, // a pool: refracted basin + mirrored reflection
  lamp: 6,
  distant: 7,
  harbor: 8, // open water: deep body + mirrored reflection
  neon: 9, // tubes by day, burning past white by night
};

export const PATTERN = {
  none: 0,
  deck: 1, // square stone pavers, world xz
  lawn: 2, // mowing stripes running along world x
  tile: 3, // small mosaic grid, face uv
  trunk: 4, // palm trunk rings, uv v
  stripes: 5, // fabric stripes, uv u, color2
  road: 6, // asphalt: tar patches, and lane wear where the material has lanes
  segments: 7, // alternating color2 by uv u (umbrella, float)
  planks: 8, // board seams along world x (docks, piers), color2 unused
  frond: 9, // palm leaves: darker at the crown, lighter toward the tips
  sand: 10, // dry sand: soft drifts, and wind ripples with crests along z
};

const TILE = 64; // output pixels per tile edge

// Shared scratch colors (no allocation in the sample loop).
const C = new Float64Array(3);
const T = new Float64Array(3);
const SH = new Float64Array(3);

// A painter's shadow of local color c under the shade tone A, written to
// out[o..o+2], for looks that mix their shade ('painted'). Whites and
// grays take the sky's tone; colored surfaces keep their own hue, deeper,
// richer and turned a little toward the sky's, the way a painter mixes a
// shadow instead of graying it (a pink wall goes coral in shade, not mauve).
function paintShade(c, A, out, o) {
  const [hc, sc, vc] = rgbToHsv(c[0], c[1], c[2]);
  const [ha, , va] = rgbToHsv(A[0], A[1], A[2]);
  // Warm colors turn by way of red; the rest straight toward the sky.
  const h = hc < 70 ? hc - 9 : hc < ha ? hc + Math.min(9, ha - hc) : hc - Math.min(9, hc - ha);
  const [pr, pg, pb] = hsvToRgb(h, Math.min(1, sc * 1.15 + 0.04), vc * va * 0.9);
  const w = (1 - sc) ** 3;
  out[o] = pr + (A[0] * vc - pr) * w;
  out[o + 1] = pg + (A[1] * vc - pg) * w;
  out[o + 2] = pb + (A[2] * vc - pb) * w;
}

export class Renderer {
  // shadowRays: trace exact shadows through a BVH instead of the shadow
  // map. Slower, perfectly crisp; meant for print-quality frames.
  // reflScale: resolution of the mirrored pass relative to the frame
  // (ripples blur it anyway, so interactive use can go lower).
  constructor(world, { shadowSize = 4096, shadowRays = false, reflScale = 1 } = {}) {
    this.world = world;
    // How to paint it: the look the place was built in (looks.js).
    this.look = lookOf(world.look);
    this.painted = this.look.shade === 'painted';
    const mesh = (this.mesh = world.mesh);
    const mats = world.materials;
    const nm = mats.length;
    this.mKind = new Uint8Array(nm);
    this.mPat = new Uint8Array(nm);
    this.mCol = new Float64Array(nm * 3);
    this.mCol2 = new Float64Array(nm * 3);
    this.mEmit = new Float64Array(nm * 3);
    this.mScale = new Float64Array(nm);
    this.mAO = new Uint8Array(nm);
    this.mShade = new Float64Array(nm * 9); // shade for up, side, down faces
    this.mCurtain = new Uint8Array(nm);
    this.mSwitch = new Uint8Array(nm);
    // Lanes worn into a road: { ax, az } the unit vector across it, and
    // the lane centers along that axis.
    this.mLanes = mats.map((m) => (m.lanes ? { ax: m.lanes.ax, az: m.lanes.az, centers: Float64Array.from(m.lanes.centers) } : null));
    mats.forEach((m, i) => {
      this.mKind[i] = KIND[m.kind ?? 'diffuse'];
      this.mCurtain[i] = m.curtains ? 1 : 0;
      this.mSwitch[i] = m.switched ? 1 : 0;
      this.mPat[i] = PATTERN[m.pattern ?? 'none'];
      const c = hex(m.color ?? '#ff00ff');
      const c2 = hex(m.color2 ?? m.color ?? '#ff00ff');
      const e = hex(m.emit ?? '#000000');
      for (let k = 0; k < 3; k++) {
        this.mCol[i * 3 + k] = c[k];
        this.mCol2[i * 3 + k] = c2[k];
        this.mEmit[i * 3 + k] = e[k];
      }
      this.mScale[i] = m.scale ?? 1;
      this.mAO[i] = m.ao ? 1 : 0;
    });
    const n = mesh.count;
    this.triLit = new Float32Array(n * 3);
    this.triShade = new Float32Array(n * 3);
    this.triNdl = new Float32Array(n);
    this.st = new ScreenTris(n + 1024);
    this.rst = new ScreenTris(n + 1024);
    this.sst = new ScreenTris(n + 1024);
    this.shadowSize = shadowSize;
    this.shadowDepth = null;
    this.shadowOn = false;
    this.hours = null;
    this.tileDepth = new Float32Array(0);
    this.tileIds = new Int32Array(0);
    this.refl = null;
    this.reflOn = false;
    this.reflScale = reflScale;
    this.bvh = shadowRays ? new BVH(mesh) : null;
    this.seaLevel = world.seaLevel ?? SEA_LEVEL;
    this.mirror = world.mirror || (world.pool ? { y: world.pool.waterY, rect: world.pool } : null);
    // Power to lamps and neon by material name (1 = as the hour says): a
    // sign can flicker off at sunrise while the rest of the town stays lit.
    // Light pools tagged with a material follow it.
    const power = world.emitScale ?? {};
    this.mEmitK = new Float64Array(nm).fill(1);
    mats.forEach((m, i) => {
      if (power[m.name] !== undefined) this.mEmitK[i] = power[m.name];
    });
    this.lightK = Float64Array.from(world.lights ?? [], (L) => (L.emit && power[L.emit] !== undefined ? power[L.emit] : 1));
  }

  // ---------------------------------------------------------------- setup

  // `t`: seconds on a clock of its own for the water, so a film can let
  // ripples run in real time while the sun crawls. Stills tie it to the hour.
  setTime(hours, t) {
    this.ripple_t = t ?? hours * 0.35;
    if (this.hours === hours && this.S) return;
    this.hours = hours;
    this.S = skyState(hours, this.world.sky || { clouds: this.world.clouds }, this.look);
    this.computeTriColors();
    this.shadowValid = false;
    this.reflValid = false;
  }

  // Each material's painted shade, facing up (the ground's cast shadows,
  // deepest and bluest), sideways (walls, lightest) and down (soffits).
  computeShades() {
    const { S, mShade } = this;
    const up = [S.amb[0] * 0.82, S.amb[1] * 0.84, S.amb[2] * 0.92];
    const c = [0, 0, 0];
    for (let m = 0; m < this.mKind.length; m++) {
      c[0] = this.mCol[m * 3];
      c[1] = this.mCol[m * 3 + 1];
      c[2] = this.mCol[m * 3 + 2];
      paintShade(c, up, mShade, m * 9);
      paintShade(c, S.amb, mShade, m * 9 + 3);
      paintShade(c, S.ground, mShade, m * 9 + 6);
    }
  }

  // The painted shade of material m on a face whose normal has height ny.
  shadeAt(m, ny, out) {
    const o = m * 9 + (ny >= 0 ? 0 : 6);
    const k = ny >= 0 ? ny : -ny;
    const M = this.mShade;
    out[0] = M[m * 9 + 3] + (M[o] - M[m * 9 + 3]) * k;
    out[1] = M[m * 9 + 4] + (M[o + 1] - M[m * 9 + 4]) * k;
    out[2] = M[m * 9 + 5] + (M[o + 2] - M[m * 9 + 5]) * k;
    return out;
  }

  // Flat faces have one lit tone and one shaded tone for the whole moment:
  // compute both up front, per triangle.
  computeTriColors() {
    const { mesh, S, painted } = this;
    const { fn, mat, count } = mesh;
    const [lx, ly, lz] = S.keyDir;
    const [kr, kg, kb] = S.key;
    const [ar, ag, ab] = S.amb;
    const [gr, gg, gb] = S.ground;
    if (painted) this.computeShades();
    for (let t = 0; t < count; t++) {
      const m = mat[t];
      const nx = fn[t * 3];
      const ny = fn[t * 3 + 1];
      const nz = fn[t * 3 + 2];
      const ndl = nx * lx + ny * ly + nz * lz;
      // Hemisphere ambient: faces that look up see more sky.
      const h = 0.5 + 0.5 * ny;
      const ambR = gr + (ar - gr) * h;
      const ambG = gg + (ag - gg) * h;
      const ambB = gb + (ab - gb) * h;
      // Three painted values for planes that face the light: full, a
      // step down for oblique faces, another for grazing ones.
      const lit = ndl > 0.5 ? 1 : ndl > 0.18 ? 0.84 : ndl > 0 ? 0.66 : 0;
      const cr = this.mCol[m * 3];
      const cg = this.mCol[m * 3 + 1];
      const cb = this.mCol[m * 3 + 2];
      if (painted) {
        this.shadeAt(m, ny, SH);
        this.triShade[t * 3] = SH[0];
        this.triShade[t * 3 + 1] = SH[1];
        this.triShade[t * 3 + 2] = SH[2];
        this.triLit[t * 3] = SH[0] + (cr * (ambR + kr) - SH[0]) * lit;
        this.triLit[t * 3 + 1] = SH[1] + (cg * (ambG + kg) - SH[1]) * lit;
        this.triLit[t * 3 + 2] = SH[2] + (cb * (ambB + kb) - SH[2]) * lit;
      } else {
        this.triShade[t * 3] = cr * ambR;
        this.triShade[t * 3 + 1] = cg * ambG;
        this.triShade[t * 3 + 2] = cb * ambB;
        this.triLit[t * 3] = cr * (ambR + kr * lit);
        this.triLit[t * 3 + 1] = cg * (ambG + kg * lit);
        this.triLit[t * 3 + 2] = cb * (ambB + kb * lit);
      }
      this.triNdl[t] = ndl;
    }
  }

  // `shift` slides the frame vertically, like the rising front of a view
  // camera: the eye can look level (so verticals stay vertical) while the
  // horizon sits low in the picture. The horizon lands at y_ndc = -shift.
  setCamera({ eye, target, fovY = 45, shift = 0 }, W, H, ss = 1) {
    this.W = W;
    this.H = H;
    this.ss = ss;
    this.eye = eye;
    this.target = target;
    this.fovY = fovY;
    this.shift = shift;
    const view = mat4LookAt(eye, target);
    const proj = mat4Perspective(fovY * DEG, W / H, 0.05, 30000);
    proj[9] = shift;
    this.cam = { eye, vp: mat4Mul(proj, view), near: 0.05 };
    this.proj = proj;
    this.basis = makeBasis(eye, target, fovY, W / H, shift);
    projectPerspective(this.mesh, this.cam, W * ss, H * ss, 0, 0, this.st);
    this.reflValid = false;
    // Angular size of one sample, for distance-aware pattern filtering.
    this.pixelAngle = (2 * Math.tan((fovY * DEG) / 2)) / (H * ss);
  }

  // ---------------------------------------------------------------- shadows

  buildShadow() {
    const { S, mesh } = this;
    this.shadowValid = true;
    this.shadowOn = S.keyOn;
    if (!S.keyOn) return;
    const d = S.keyDir;
    const up0 = Math.abs(d[1]) > 0.995 ? [0, 0, 1] : [0, 1, 0];
    const right = normalize(cross(d, up0));
    const up = cross(right, d);
    const { min, max } = this.world.shadowBox;
    let umin = Infinity;
    let umax = -Infinity;
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
      const u = p[0] * right[0] + p[1] * right[1] + p[2] * right[2];
      const v = p[0] * up[0] + p[1] * up[1] + p[2] * up[2];
      umin = Math.min(umin, u);
      umax = Math.max(umax, u);
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
    }
    const N = this.shadowSize;
    const L = { right, up, dir: d, u0: umin, v1: vmax, sx: N / (umax - umin), sy: N / (vmax - vmin) };
    if (!this.shadowDepth || this.shadowDepth.length !== N * N) this.shadowDepth = new Float32Array(N * N);
    this.shadowDepth.fill(-Infinity);
    projectOrtho(mesh, L, N, N, CAST, DISTANT, this.sst);
    rasterize(this.sst, 0, 0, N, N, this.shadowDepth, null);
    this.L = L;
    this.shadowTexel = Math.max(1 / L.sx, 1 / L.sy);
  }

  // Fraction of the key light reaching point p (0..1). The shadow map is
  // read with bilinear PCF; with shadowRays on, the map only classifies:
  // where a 4x4 neighborhood agrees the answer is certain, and anywhere
  // else (edges, contact points, thin casters) a ray through the BVH
  // decides exactly.
  shadow(px, py, pz, nx, ny, nz) {
    if (!this.shadowOn) return 0;
    const L = this.L;
    const off = this.shadowTexel * 1.6;
    const x = px + nx * off;
    const y = py + ny * off;
    const z = pz + nz * off;
    const r = L.right;
    const u = L.up;
    const d = L.dir;
    const fu = (r[0] * x + r[1] * y + r[2] * z - L.u0) * L.sx - 0.5;
    const fv = (L.v1 - (u[0] * x + u[1] * y + u[2] * z)) * L.sy - 0.5;
    const depth = d[0] * x + d[1] * y + d[2] * z + 0.015;
    const N = this.shadowSize;
    const i0 = Math.floor(fu);
    const j0 = Math.floor(fv);
    const D = this.shadowDepth;
    if (this.bvh) {
      // Acne only ever produces false shadow, so "all lit" is always
      // trusted, but "all shadowed" only on faces that meet the light
      // squarely; grazing faces always get a ray.
      if (i0 >= 1 && j0 >= 1 && i0 + 2 < N && j0 + 2 < N) {
        let lit = 0;
        for (let j = -1; j <= 2; j++) {
          const row = (j0 + j) * N + i0;
          for (let i = -1; i <= 2; i++) if (!(D[row + i] > depth)) lit++;
        }
        if (lit === 16) return 1;
        if (lit === 0 && nx * d[0] + ny * d[1] + nz * d[2] > 0.35) return 0;
      }
      return this.bvh.occluded(px + nx * 0.004 + d[0] * 0.002, py + ny * 0.004 + d[1] * 0.002, pz + nz * 0.004 + d[2] * 0.002, d[0], d[1], d[2])
        ? 0
        : 1;
    }
    if (i0 < 0 || j0 < 0 || i0 + 1 >= N || j0 + 1 >= N) return 1;
    const a = fu - i0;
    const b = fv - j0;
    const k = j0 * N + i0;
    const s00 = D[k] > depth ? 0 : 1;
    const s10 = D[k + 1] > depth ? 0 : 1;
    const s01 = D[k + N] > depth ? 0 : 1;
    const s11 = D[k + N + 1] > depth ? 0 : 1;
    return (s00 + (s10 - s00) * a) * (1 - b) + (s01 + (s11 - s01) * a) * b;
  }

  // ---------------------------------------------------------------- reflection

  // Render everything above the water from a camera mirrored in its
  // surface. A pool limits the work to the part of the frame it can occupy;
  // open water mirrors the whole frame.
  buildReflection() {
    this.reflValid = true;
    this.reflOn = false;
    const mirror = this.mirror;
    if (!mirror) return;
    const h = mirror.y;
    const e = this.eye;
    if (e[1] <= h) return;
    const tg = this.target;
    const me = [e[0], 2 * h - e[1], e[2]];
    const mt = [tg[0], 2 * h - tg[1], tg[2]];
    const view = mat4LookAt(me, mt);
    const vp = mat4Mul(this.proj, view);
    const k = this.reflScale;
    const W = Math.max(8, Math.round(this.W * k));
    const H = Math.max(8, Math.round(this.H * k));
    let x0 = 0;
    let y0 = 0;
    let x1 = W;
    let y1 = H;
    const rect = mirror.rect;
    const band = rect ? null : this.reflectionBand(H);
    if (band) [y0, y1] = band;
    if (rect) {
      x0 = Infinity;
      y0 = Infinity;
      x1 = -Infinity;
      y1 = -Infinity;
      let behind = false;
      for (const [px, pz] of [
        [rect.x0, rect.z0],
        [rect.x1, rect.z0],
        [rect.x0, rect.z1],
        [rect.x1, rect.z1],
      ]) {
        const cx = vp[0] * px + vp[4] * h + vp[8] * pz + vp[12];
        const cy = vp[1] * px + vp[5] * h + vp[9] * pz + vp[13];
        const cw = vp[3] * px + vp[7] * h + vp[11] * pz + vp[15];
        if (cw < 0.05) {
          behind = true;
          break;
        }
        const sx = (cx / cw + 1) * 0.5 * W;
        const sy = (1 - cy / cw) * 0.5 * H;
        x0 = Math.min(x0, sx);
        y0 = Math.min(y0, sy);
        x1 = Math.max(x1, sx);
        y1 = Math.max(y1, sy);
      }
      if (behind) {
        x0 = 0;
        y0 = 0;
        x1 = W;
        y1 = H;
      }
    }
    const pad = 24;
    const rx0 = Math.max(0, Math.floor(x0) - pad);
    const ry0 = Math.max(0, Math.floor(y0) - pad);
    const rx1 = Math.min(W, Math.ceil(x1) + pad);
    const ry1 = Math.min(H, Math.ceil(y1) + pad);
    if (rx0 >= rx1 || ry0 >= ry1) return;
    this.rcam = { eye: me, vp, near: 0.05 };
    this.reflW = W;
    this.reflH = H;
    projectPerspective(this.mesh, this.rcam, W, H, 0, UNDERWATER | NOREFLECT, this.rst);
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    const depth = new Float32Array(rw * rh).fill(-Infinity);
    const ids = new Int32Array(rw * rh).fill(-1);
    rasterize(this.rst, rx0, ry0, rx1, ry1, depth, ids);
    if (!this.refl || this.refl.length !== W * H * 3) this.refl = new Float32Array(W * H * 3);
    const B = makeBasis(me, mt, this.fovY, W / H, this.shift);
    for (let y = ry0; y < ry1; y++) {
      for (let x = rx0; x < rx1; x++) {
        const nx = ((x + 0.5) / W) * 2 - 1;
        const ny = 1 - ((y + 0.5) / H) * 2 + B.sh;
        let dx = B.f[0] + B.r[0] * nx * B.tx + B.u[0] * ny * B.ty;
        let dy = B.f[1] + B.r[1] * nx * B.tx + B.u[1] * ny * B.ty;
        let dz = B.f[2] + B.r[2] * nx * B.tx + B.u[2] * ny * B.ty;
        const l = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= l;
        dy *= l;
        dz *= l;
        const id = ids[(y - ry0) * rw + (x - rx0)];
        if (id < 0) this.background(me[0], me[1], me[2], dx, dy, dz, C);
        else this.shadeHit(id, me[0], me[1], me[2], dx, dy, dz, C, true);
        const o = (y * W + x) * 3;
        this.refl[o] = C[0];
        this.refl[o + 1] = C[1];
        this.refl[o + 2] = C[2];
      }
    }
    this.reflRect = [rx0, ry0, rx1, ry1];
    this.reflOn = true;
  }

  // Rows of the mirrored frame that open water can ever look up. For a
  // level camera, frame row y (NDC) sees its mirror image at -y - 2 shift,
  // so only a band of it is needed; leave room for the ripples. Null means
  // the whole frame (a tilted camera).
  reflectionBand(H) {
    if (Math.abs(this.basis.f[1]) >= 1e-3) return null;
    const sh = this.shift;
    return [Math.max(0, ((sh - 0.08) * H) | 0), Math.min(H, Math.ceil(((1 + sh + 0.16) / 2) * H))];
  }

  // Mirrored color seen along the reflected ray from water point p whose
  // normal is tilted by (nx, nz). Returns false if there is no mirror image.
  sampleReflection(px, py, pz, dx, dy, dz, nx, nz, reach, out) {
    if (!this.reflOn) return false;
    // Tilting the normal by (nx, nz) turns the reflected ray by roughly
    // dR = -2[(D.dn) up + D.y dn]; look up the mirrored image at the point
    // that perturbed ray reaches a few meters on.
    const dn = dx * nx + dz * nz;
    const qx = px - 2 * dy * nx * reach;
    const qy = py - 2 * dn * reach;
    const qz = pz - 2 * dy * nz * reach;
    const vp = this.rcam.vp;
    const cx = vp[0] * qx + vp[4] * qy + vp[8] * qz + vp[12];
    const cy = vp[1] * qx + vp[5] * qy + vp[9] * qz + vp[13];
    const cw = Math.max(0.05, vp[3] * qx + vp[7] * qy + vp[11] * qz + vp[15]);
    const [x0, y0, x1, y1] = this.reflRect;
    const sx = clamp((cx / cw + 1) * 0.5 * this.reflW - 0.5, x0, x1 - 1.001);
    const sy = clamp((1 - cy / cw) * 0.5 * this.reflH - 0.5, y0, y1 - 1.001);
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);
    const fx = sx - ix;
    const fy = sy - iy;
    const R = this.refl;
    const W = this.reflW;
    const o00 = (iy * W + ix) * 3;
    const o10 = o00 + 3;
    const o01 = o00 + W * 3;
    const o11 = o01 + 3;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    out[0] = R[o00] * w00 + R[o10] * w10 + R[o01] * w01 + R[o11] * w11;
    out[1] = R[o00 + 1] * w00 + R[o10 + 1] * w10 + R[o01 + 1] * w01 + R[o11 + 1] * w11;
    out[2] = R[o00 + 2] * w00 + R[o10 + 2] * w10 + R[o01 + 2] * w01 + R[o11 + 2] * w11;
    return true;
  }

  // ---------------------------------------------------------------- frame

  prepare() {
    if (!this.shadowValid) this.buildShadow();
    if (!this.reflValid) this.buildReflection();
  }

  // Render the whole frame. Glow is laid over the finished image.
  render(out = new Float32Array(this.W * this.H * 3), { glow = true } = {}) {
    this.prepare();
    for (let y = 0; y < this.H; y += TILE) {
      for (let x = 0; x < this.W; x += TILE) {
        this.renderTile(x, y, Math.min(this.W, x + TILE), Math.min(this.H, y + TILE), out);
      }
    }
    if (glow) bloom(out, this.W, this.H);
    return out;
  }

  // Tiles in the order a progressive viewer should draw them.
  tiles() {
    const list = [];
    for (let y = 0; y < this.H; y += TILE) {
      for (let x = 0; x < this.W; x += TILE) {
        list.push([x, y, Math.min(this.W, x + TILE), Math.min(this.H, y + TILE)]);
      }
    }
    // Center first: the eye goes there before the edges.
    const cx = this.W / 2;
    const cy = this.H / 2;
    const d = (t) => Math.hypot((t[0] + t[2]) / 2 - cx, ((t[1] + t[3]) / 2 - cy) * 1.4);
    return list.sort((a, b) => d(a) - d(b));
  }

  // Render output pixels [px0, px1) x [py0, py1) into `out`: a full frame
  // by default, or with `local` a buffer just the size of the tile.
  renderTile(px0, py0, px1, py1, out, local = false) {
    const ss = this.ss;
    const W = this.W;
    const stride = local ? px1 - px0 : W;
    const ox = local ? px0 : 0;
    const oy = local ? py0 : 0;
    const SW = W * ss;
    const SH = this.H * ss;
    const sx0 = px0 * ss;
    const sy0 = py0 * ss;
    const sx1 = px1 * ss;
    const sy1 = py1 * ss;
    const tw = sx1 - sx0;
    const th = sy1 - sy0;
    if (this.tileDepth.length < tw * th) {
      this.tileDepth = new Float32Array(tw * th);
      this.tileIds = new Int32Array(tw * th);
    }
    const depth = this.tileDepth;
    const ids = this.tileIds;
    depth.fill(-Infinity, 0, tw * th);
    ids.fill(-1, 0, tw * th);
    rasterize(this.st, sx0, sy0, sx1, sy1, depth, ids);
    for (let y = py0; y < py1; y++) out.fill(0, ((y - oy) * stride + px0 - ox) * 3, ((y - oy) * stride + px1 - ox) * 3);
    const inv = 1 / (ss * ss);
    const B = this.basis;
    const [ex, ey, ez] = this.eye;
    for (let y = sy0; y < sy1; y++) {
      const ny = 1 - ((y + 0.5) / SH) * 2;
      const vy = ny + B.sh;
      const row = (((y / ss) | 0) - oy) * stride - ox;
      for (let x = sx0; x < sx1; x++) {
        const nx = ((x + 0.5) / SW) * 2 - 1;
        let dx = B.f[0] + B.r[0] * nx * B.tx + B.u[0] * vy * B.ty;
        let dy = B.f[1] + B.r[1] * nx * B.tx + B.u[1] * vy * B.ty;
        let dz = B.f[2] + B.r[2] * nx * B.tx + B.u[2] * vy * B.ty;
        const l = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
        dx *= l;
        dy *= l;
        dz *= l;
        const id = ids[(y - sy0) * tw + (x - sx0)];
        if (id < 0) {
          this.background(ex, ey, ez, dx, dy, dz, C);
          // The airbrush is heaviest at the top of the board: every frame
          // deepens toward its upper edge, whatever the camera's pitch.
          if (dy > 0 && ny > 0.1) {
            const k = 0.22 * smoothstep(0.1, 1, ny);
            const Z = this.S.zenith;
            C[0] += (Z[0] * 0.9 - C[0]) * k;
            C[1] += (Z[1] * 0.9 - C[1]) * k;
            C[2] += (Z[2] * 0.95 - C[2]) * k;
          }
        } else this.shadeHit(id, ex, ey, ez, dx, dy, dz, C, false);
        const o = (row + ((x / ss) | 0)) * 3;
        out[o] += C[0] * inv;
        out[o + 1] += C[1] * inv;
        out[o + 2] += C[2] * inv;
      }
    }
  }

  background(ox, oy, oz, dx, dy, dz, out) {
    if (dy < -1e-4 && oy > this.seaLevel) seaColor(this.S, this.seaLevel, ox, oy, oz, dx, dy, dz, out, this.pixelAngle);
    else skyColor(this.S, dx, dy, dz, out, true);
  }

  // ---------------------------------------------------------------- shading

  shadeHit(t, ox, oy, oz, dx, dy, dz, out, mirrored) {
    const mesh = this.mesh;
    const fn = mesh.fn;
    let nx = fn[t * 3];
    let ny = fn[t * 3 + 1];
    let nz = fn[t * 3 + 2];
    const denom = nx * dx + ny * dy + nz * dz;
    let dist = (mesh.fd[t] - (nx * ox + ny * oy + nz * oz)) / (Math.abs(denom) > 1e-12 ? denom : 1e-12);
    if (!(dist > 0)) dist = 0.05;
    const px = ox + dx * dist;
    const py = oy + dy * dist;
    const pz = oz + dz * dist;
    const m = mesh.mat[t];
    const kind = this.mKind[m];
    const flags = mesh.flags[t];
    const S = this.S;
    let r;
    let g;
    let b;

    if (kind === KIND.water) {
      this.shadeWater(px, py, pz, dx, dy, dz, dist, out);
      return;
    }
    if (kind === KIND.harbor) {
      this.shadeHarbor(px, py, pz, dx, dy, dz, dist, out);
      return;
    }

    // Normal for lighting: interpolated for smooth surfaces, flipped toward
    // the viewer for two-sided ones.
    let u = 0;
    let v = 0;
    const smooth = flags & SMOOTH;
    const pat = this.mPat[m];
    if (smooth || pat === PATTERN.trunk || pat === PATTERN.stripes || pat === PATTERN.segments || pat === PATTERN.tile || pat === PATTERN.frond) {
      const q = t * 10;
      const B = mesh.bary;
      const o = t * 9;
      const vx = px - mesh.pos[o];
      const vy = py - mesh.pos[o + 1];
      const vz = pz - mesh.pos[o + 2];
      const d20 = vx * B[q] + vy * B[q + 1] + vz * B[q + 2];
      const d21 = vx * B[q + 3] + vy * B[q + 4] + vz * B[q + 5];
      const wb = (B[q + 8] * d20 - B[q + 7] * d21) * B[q + 9];
      const wc = (B[q + 6] * d21 - B[q + 7] * d20) * B[q + 9];
      const wa = 1 - wb - wc;
      const uv = mesh.uv;
      const k = t * 6;
      u = wa * uv[k] + wb * uv[k + 2] + wc * uv[k + 4];
      v = wa * uv[k + 1] + wb * uv[k + 3] + wc * uv[k + 5];
      if (smooth) {
        const N = mesh.nrm;
        let sx = wa * N[o] + wb * N[o + 3] + wc * N[o + 6];
        let sy = wa * N[o + 1] + wb * N[o + 4] + wc * N[o + 7];
        let sz = wa * N[o + 2] + wb * N[o + 5] + wc * N[o + 8];
        const l = 1 / Math.sqrt(sx * sx + sy * sy + sz * sz);
        sx *= l;
        sy *= l;
        sz *= l;
        nx = sx;
        ny = sy;
        nz = sz;
      }
    }
    if (flags & DOUBLE && nx * dx + ny * dy + nz * dz > 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    const cr = this.mCol[m * 3];
    const cg = this.mCol[m * 3 + 1];
    const cb = this.mCol[m * 3 + 2];
    const [lx, ly, lz] = S.keyDir;
    const [kr, kg, kb] = S.key;
    const h = 0.5 + 0.5 * ny;
    const ar = S.ground[0] + (S.amb[0] - S.ground[0]) * h;
    const ag = S.ground[1] + (S.amb[1] - S.ground[1]) * h;
    const ab = S.ground[2] + (S.amb[2] - S.ground[2]) * h;

    if (kind === KIND.diffuse || kind === KIND.distant) {
      let lit = 0;
      if (!smooth && !(flags & DOUBLE)) {
        // A plane: one of the precomputed painted values.
        lit = this.triNdl[t] > 0 && !(flags & DISTANT) ? this.shadow(px, py, pz, nx, ny, nz) : 0;
        const i3 = t * 3;
        r = this.triShade[i3] + (this.triLit[i3] - this.triShade[i3]) * lit;
        g = this.triShade[i3 + 1] + (this.triLit[i3 + 1] - this.triShade[i3 + 1]) * lit;
        b = this.triShade[i3 + 2] + (this.triLit[i3 + 2] - this.triShade[i3 + 2]) * lit;
      } else {
        // A curved form, airbrushed: a soft terminator and a sprayed sheen.
        const ndl = nx * lx + ny * ly + nz * lz;
        lit = smoothstep(-0.08, 0.42, ndl);
        if (lit > 0) lit *= this.shadow(px, py, pz, nx, ny, nz);
        const sheen = ndl > 0.7 ? 0.07 * smoothstep(0.7, 0.95, ndl) * lit : 0;
        if (this.painted) {
          this.shadeAt(m, ny, SH);
          r = SH[0] + (cr * (ar + kr * 0.95) - SH[0]) * lit + sheen;
          g = SH[1] + (cg * (ag + kg * 0.95) - SH[1]) * lit + sheen;
          b = SH[2] + (cb * (ab + kb * 0.95) - SH[2]) * lit + sheen;
        } else {
          r = cr * (ar + kr * lit * 0.95) + sheen;
          g = cg * (ag + kg * lit * 0.95) + sheen;
          b = cb * (ab + kb * lit * 0.95) + sheen;
        }
      }
      if (pat !== PATTERN.none) {
        const f = this.pattern(pat, m, px, py, pz, u, v, dist, dx, dy, dz);
        if (f < 0) {
          // Negative means "use color2", keeping the lighting ratio.
          const k = -f;
          r *= (this.mCol2[m * 3] / Math.max(cr, 1e-3)) * k;
          g *= (this.mCol2[m * 3 + 1] / Math.max(cg, 1e-3)) * k;
          b *= (this.mCol2[m * 3 + 2] / Math.max(cb, 1e-3)) * k;
        } else {
          r *= f;
          g *= f;
          b *= f;
        }
      }
      if (!(flags & DISTANT)) {
        if (ny < 0.35 && ny > -0.35) {
          // Walls are airbrushed top to bottom: lit walls brighten upward,
          // walls in shade pick up warm bounce light near the ground.
          const hh = clamp(py / 7, 0, 1);
          if (lit > 0.5) {
            const f = 1 + 0.07 * (hh - 0.45);
            r *= f;
            g *= f;
            b *= f;
          } else {
            const f = 1 - 0.1 * (hh - 0.45);
            r *= f * (1 + 0.03 * (1 - hh));
            g *= f;
            b *= f * (1 - 0.02 * (1 - hh));
          }
        }
        if (this.mAO[m]) {
          // A soft seam where walls meet the ground.
          const a = 0.9 + 0.1 * smoothstep(0, 0.9, py);
          r *= a;
          g *= a;
          b *= a;
        }
      }
    } else if (kind === KIND.foliage) {
      const ndl = nx * lx + ny * ly + nz * lz;
      if (ndl > 0) {
        const vis = this.shadow(px, py, pz, nx, ny, nz);
        const lit = (ndl > 0.4 ? 1 : 0.8) * vis;
        if (this.painted) {
          // Foliage is painted as dark masses with the sunlit leaves picked
          // out bright: its shade is much deeper than a wall's.
          this.shadeAt(m, ny, SH);
          SH[0] *= 0.38;
          SH[1] *= 0.38;
          SH[2] *= 0.42;
          r = SH[0] + (cr * (ar + kr) - SH[0]) * lit;
          g = SH[1] + (cg * (ag + kg) - SH[1]) * lit;
          b = SH[2] + (cb * (ab + kb) - SH[2]) * lit;
        } else {
          r = cr * (ar + kr * lit);
          g = cg * (ag + kg * lit);
          b = cb * (ab + kb * lit);
        }
      } else {
        // Seen from the dark side, a leaf glows faintly yellow-green.
        const vis = this.shadow(px, py, pz, -nx, -ny, -nz);
        const k = 0.24 * vis;
        if (this.painted) {
          this.shadeAt(m, -ny, SH);
          SH[0] *= 0.38;
          SH[1] *= 0.38;
          SH[2] *= 0.42;
          r = SH[0] + (cr * (ar + kr * 1.1) - SH[0]) * k;
          g = SH[1] + (cg * (ag + kg * 1.15) - SH[1]) * k;
          b = SH[2] + (cb * (ab + kb * 0.6) - SH[2]) * k;
        } else {
          r = cr * (ar + kr * k * 1.1);
          g = cg * (ag + kg * k * 1.15);
          b = cb * (ab + kb * k * 0.6);
        }
      }
      if (pat === PATTERN.frond) {
        // Deep at the crown, lighter and warmer toward the tips of the
        // leaves: in cobalt the two-tone way palms are painted.
        const F = this.look.frond;
        const f = F.base + F.tip * u + F.across * v;
        r *= f * (F.warm + F.warmTip * u);
        g *= f;
        b *= f * (1.02 - 0.08 * u);
      }
    } else if (kind === KIND.glass) {
      this.shadeGlass(t, m, px, py, pz, nx, ny, nz, dx, dy, dz, out);
      r = out[0];
      g = out[1];
      b = out[2];
    } else if (kind === KIND.chrome) {
      const c = -(nx * dx + ny * dy + nz * dz);
      const rx = dx + 2 * c * nx;
      const ry = dy + 2 * c * ny;
      const rz = dz + 2 * c * nz;
      if (ry > 0) {
        skyColor(S, rx, ry, rz, T, false);
        r = T[0] * 1.08;
        g = T[1] * 1.08;
        b = T[2] * 1.08;
      } else {
        // Chrome's hard horizon: the ground below reads dark and warm.
        r = S.ground[0] * 0.55 + 0.04;
        g = S.ground[1] * 0.5 + 0.04;
        b = S.ground[2] * 0.45 + 0.05;
      }
      const ndl = nx * lx + ny * ly + nz * lz;
      if (ndl > 0) {
        const hx = lx - dx;
        const hy = ly - dy;
        const hz = lz - dz;
        const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        if ((nx * hx + ny * hy + nz * hz) / hl > 0.985) {
          // Flat chrome catches the sun whole; the moon only a little.
          const vis = this.shadow(px, py, pz, nx, ny, nz) * S.keyStrength;
          r += (1.2 - r) * vis;
          g += (1.2 - g) * vis;
          b += (1.15 - b) * vis;
        }
      }
    } else if (kind === KIND.paint) {
      // Lacquer: an airbrushed body color, a clear coat of sky, a hot glint.
      const ndl = nx * lx + ny * ly + nz * lz;
      let lit = smoothstep(0.0, 0.35, ndl);
      if (lit > 0) lit *= this.shadow(px, py, pz, nx, ny, nz);
      if (this.painted) {
        this.shadeAt(m, ny, SH);
        r = SH[0] + (cr * (ar + kr) - SH[0]) * lit;
        g = SH[1] + (cg * (ag + kg) - SH[1]) * lit;
        b = SH[2] + (cb * (ab + kb) - SH[2]) * lit;
      } else {
        r = cr * (ar + kr * lit);
        g = cg * (ag + kg * lit);
        b = cb * (ab + kb * lit);
      }
      const c = -(nx * dx + ny * dy + nz * dz);
      const fres = 0.06 + 0.5 * Math.pow(1 - Math.max(0, c), 4);
      const rx = dx + 2 * c * nx;
      const ry = dy + 2 * c * ny;
      const rz = dz + 2 * c * nz;
      if (ry > 0.02) {
        skyColor(S, rx, ry, rz, T, false);
        r += (T[0] - r) * fres;
        g += (T[1] - g) * fres;
        b += (T[2] - b) * fres;
      }
      const hx = lx - dx;
      const hy = ly - dy;
      const hz = lz - dz;
      const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      if (lit > 0 && (nx * hx + ny * hy + nz * hz) / hl > 0.99) {
        const k = 0.85 * S.keyStrength;
        r = r + (1.15 - r) * k;
        g = g + (1.15 - g) * k;
        b = b + (1.1 - b) * k;
      }
    } else if (kind === KIND.lamp || kind === KIND.neon) {
      const ndl = nx * lx + ny * ly + nz * lz;
      const lit = ndl > 0 ? (0.6 + 0.4 * ndl) * this.shadow(px, py, pz, nx, ny, nz) : 0;
      if (this.painted) {
        this.shadeAt(m, ny, SH);
        r = SH[0] + (cr * (ar + kr) - SH[0]) * lit;
        g = SH[1] + (cg * (ag + kg) - SH[1]) * lit;
        b = SH[2] + (cb * (ab + kb) - SH[2]) * lit;
      } else {
        r = cr * (ar + kr * lit);
        g = cg * (ag + kg * lit);
        b = cb * (ab + kb * lit);
      }
      // Neon burns past white so the glow pass picks it up.
      const kE = this.mEmitK[m];
      const on = S.lights * (kind === KIND.neon ? 1.9 : 1.15) * kE;
      const mix = Math.min(1, S.lights * 1.2 * Math.min(1, kE));
      r += (this.mEmit[m * 3] * on - r) * mix;
      g += (this.mEmit[m * 3 + 1] * on - g) * mix;
      b += (this.mEmit[m * 3 + 2] * on - b) * mix;
    } else {
      r = cr;
      g = cg;
      b = cb;
    }

    // Warm pools of artificial light after dusk.
    if (S.lights > 0 && kind !== KIND.lamp && kind !== KIND.neon && kind !== KIND.glass && !(flags & DISTANT)) {
      const lights = this.world.lights;
      let lr = 0;
      let lg = 0;
      let lb = 0;
      for (let i = 0; i < lights.length; i++) {
        const Lt = lights[i];
        const qx = Lt.p[0] - px;
        const qy = Lt.p[1] - py;
        const qz = Lt.p[2] - pz;
        const d2 = qx * qx + qy * qy + qz * qz;
        const rr = Lt.r * Lt.r;
        if (d2 > rr * 16) continue;
        const dl = Math.sqrt(d2) || 1;
        const cos = (qx * nx + qy * ny + qz * nz) / dl;
        if (cos <= 0) continue;
        const k = ((Lt.k * cos) / (1 + d2 / rr)) * this.lightK[i];
        lr += Lt.c[0] * k;
        lg += Lt.c[1] * k;
        lb += Lt.c[2] * k;
      }
      const on = S.lights;
      r += cr * lr * on;
      g += cg * lg * on;
      b += cb * lb * on;
    }

    // Aerial perspective: distance lays a veil of horizon color over things,
    // gently near, heavily for far scenery; how much is the look's.
    if (dist > 30) {
      skyColor(S, dx, 0.0001, dz, T, false);
      const Z = this.look.haze;
      const k = flags & DISTANT ? 1 - Math.exp(-dist / Z.far) : Z.near * smoothstep(Z.from, Z.to, dist) + (1 - Z.near) * (1 - Math.exp(-Math.max(0, dist - Z.to) / Z.depth));
      r += (T[0] - r) * k;
      g += (T[1] - g) * k;
      b += (T[2] - b) * k;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  // How much ground one sample covers across bands that vary along the
  // horizontal direction (gx, gz): seen at a grazing angle, the ground is
  // stretched along the line of sight, so bands facing the eye blur first.
  footAcross(foot, dx, dy, dz, gx, gz) {
    const c = (gx * dx + gz * dz) / (Math.sqrt(dx * dx + dz * dz) || 1);
    const k = 1 / Math.max(Math.abs(dy), 0.03);
    return foot * Math.sqrt(c * c * k * k + 1 - c * c);
  }

  // Brightness factor for a procedural pattern (negative: use color2).
  // Patterns are kept faint: a painter suggests joints, never draws them all.
  pattern(pat, m, px, py, pz, u, v, dist, dx, dy, dz) {
    const s = this.mScale[m];
    const foot = dist * this.pixelAngle * 1.5;
    if (pat === PATTERN.sand) {
      // Broad soft drifts, and near the eye the ripples the sea wind
      // leaves: crests up and down the beach, each with a shaded lee.
      let f = 1 + 0.05 * (valueNoise(px * 0.07 + 11.3, pz * 0.07) - 0.5);
      const fade = 1 - smoothstep(0.02, 0.07, this.footAcross(foot, dx, dy, dz, 1, 0));
      if (fade > 0) {
        // Crests wander, and break off and start again.
        const w = (px + 0.3 * Math.sin(pz * 0.55 + 2 * Math.sin(pz * 0.13 + px * 0.05)) + 0.08 * Math.sin(pz * 2.1 + px * 1.3)) / (0.26 * s);
        const r = w - Math.floor(w);
        const lee = r < 0.22 ? -0.07 * (1 - r / 0.22) : 0.012;
        f += lee * fade * smoothstep(0.2, 0.7, valueNoise(px * 0.9 + 3.3, pz * 0.7));
      }
      return f;
    }
    if (pat === PATTERN.lawn) {
      // Mowing stripes a mower's width apart, the grass laid one way and
      // then the other, and a little unevenness in the green.
      const fade = 1 - smoothstep(0.15, 0.5, this.footAcross(foot, dx, dy, dz, 0, 1));
      const sq = Math.max(-1, Math.min(1, 3 * Math.sin((Math.PI * pz) / (0.9 * s))));
      return 1 + 0.045 * sq * fade + 0.05 * (valueNoise(px * 0.23 + 5.1, pz * 0.23) - 0.5);
    }
    if (pat === PATTERN.road) {
      // Asphalt: soft patches of older and newer tar, and in each lane a
      // darker oil stripe between the paler, polished tracks of the tires.
      let f = 1 + 0.06 * (valueNoise(px * 0.08 + 3.1, pz * 0.08 - 1.7) - 0.5) + 0.03 * (valueNoise(px * 0.45, pz * 0.45) - 0.5);
      const L = this.mLanes[m];
      if (L) {
        const fade = 1 - smoothstep(0.1, 0.35, this.footAcross(foot, dx, dy, dz, L.ax, L.az));
        if (fade > 0) {
          const a = px * L.ax + pz * L.az;
          const along = px * L.az - pz * L.ax;
          let w = 0;
          for (let i = 0; i < L.centers.length; i++) {
            const d = a - L.centers[i];
            if (d > 1.8 || d < -1.8) continue;
            const e = Math.abs(d) - 0.8;
            w += -0.12 * Math.exp(-(d * d) / 0.2) + 0.05 * Math.exp(-(e * e) / 0.07);
          }
          f += w * fade * (0.65 + 0.7 * valueNoise(along * 0.035, a * 0.2 + 9.7));
        }
      }
      return f;
    }
    if (pat === PATTERN.deck) {
      const w = 0.012;
      const fx = (px / s) % 1;
      const fz = (pz / s) % 1;
      const ax = fx < 0 ? fx + 1 : fx;
      const az = fz < 0 ? fz + 1 : fz;
      const line = ax < w || ax > 1 - w || az < w || az > 1 - w;
      const fade = 1 - smoothstep(s * 0.03, s * 0.1, foot);
      return line ? 1 - 0.045 * fade : 1;
    }
    if (pat === PATTERN.planks) {
      const f = (px / (0.24 * s)) % 1;
      const a = f < 0 ? f + 1 : f;
      const fade = 1 - smoothstep(0.012, 0.05, foot);
      return a < 0.07 ? 1 - 0.12 * fade : 1 - 0.03 * hash2(Math.floor(px / (0.24 * s)), 3) * fade;
    }
    if (pat === PATTERN.tile) {
      const w = 0.06;
      const fu = u / (0.2 * s) - Math.floor(u / (0.2 * s));
      const fv = v / (0.2 * s) - Math.floor(v / (0.2 * s));
      const fade = 1 - smoothstep(0.004, 0.02, foot);
      return fu < w || fv < w ? 1 - 0.08 * fade : 1;
    }
    if (pat === PATTERN.trunk) {
      const f = v / (0.22 * s) - Math.floor(v / (0.22 * s));
      const fade = 1 - smoothstep(0.02, 0.06, foot);
      return f < 0.18 ? 1 - 0.08 * fade : 1;
    }
    if (pat === PATTERN.stripes) {
      const k = Math.floor(u / (0.12 * s)) & 1;
      return k ? -1 : 1;
    }
    if (pat === PATTERN.segments) {
      const k = Math.floor(u * s + 1e-6) & 1;
      return k ? -1 : 1;
    }
    return 1;
  }

  // Glass, painted the way an illustrator paints it: deep ultramarine at
  // the foot of each floor, lifting toward the sky's color at the top, with
  // two diagonal bands of reflected light sweeping across whole facades.
  shadeGlass(t, m, px, py, pz, nx, ny, nz, dx, dy, dz, out) {
    const S = this.S;
    if (nx * dx + ny * dy + nz * dz > 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    // Reflected sky, taken a little above the horizon.
    const c = -(nx * dx + ny * dy + nz * dz);
    const rx = dx + 2 * c * nx;
    const rz = dz + 2 * c * nz;
    const rl = Math.hypot(rx, rz) || 1;
    skyColor(S, (rx / rl) * 0.96, 0.28, (rz / rl) * 0.96, T, false);
    const hh = (py - 0.15) / 3.3 - Math.floor((py - 0.15) / 3.3);
    const k = 0.18 + 0.62 * Math.pow(hh, 1.35);
    const deepR = 0.05 + S.amb[0] * 0.16;
    const deepG = 0.09 + S.amb[1] * 0.2;
    const deepB = 0.22 + S.amb[2] * 0.34;
    let r = deepR + (T[0] - deepR) * k;
    let g = deepG + (T[1] - deepG) * k;
    let b = deepB + (T[2] - deepB) * k;
    // Diagonal light bands in the plane of the glass.
    let tx = -nz;
    let tz = nx;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const along = px * tx + pz * tz;
    const d = (along * 0.55 + py) / 2.6 + 0.3;
    const f = d - Math.floor(d);
    const band = f > 0.1 && f < 0.26 ? 0.3 : f > 0.34 && f < 0.39 ? 0.2 : 0;
    const day = 1 - S.night;
    if (band > 0) {
      r += (T[0] * 1.1 + 0.08 - r) * band * day;
      g += (T[1] * 1.1 + 0.08 - g) * band * day;
      b += (T[2] * 1.05 + 0.06 - b) * band * day;
    }
    // By night most rooms are lit; some are not. A switched window is lit
    // when its power says so, whatever the chances.
    const obj = this.mesh.obj[t];
    const e = this.mEmit;
    let on = 0;
    if (e[m * 3] + e[m * 3 + 1] + e[m * 3 + 2] > 0) on = S.lights * (this.mSwitch[m] ? 0.1 + 0.9 * clamp(this.mEmitK[m], 0, 1) : hash2(obj, 7) < 0.72 ? 1 : 0.1);
    if (on > 0) {
      let warm = 0.9 + 0.1 * (1 - hh);
      // Drawn curtains: soft uneven folds with the lamp behind them.
      if (this.mCurtain[m]) {
        const u = along / 0.23 + 0.4 * Math.sin(along * 1.7 + obj);
        warm *= 0.8 + 0.2 * (0.5 + 0.5 * Math.cos(u * 2 * Math.PI));
      }
      r += (e[m * 3] * warm * 1.22 - r) * on;
      g += (e[m * 3 + 1] * warm * 1.22 - g) * on;
      b += (e[m * 3 + 2] * warm * 1.22 - b) * on;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  // Ripple field shared by both kinds of water: analytic derivatives give
  // the normal tilt, and the phase gives painted bands and crest lines.
  ripple(waves, px, pz, tm) {
    let hx = 0;
    let hz = 0;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      const c = Math.cos(w.kx * px + w.kz * pz + w.w * tm + w.p) * w.a;
      hx += c * w.kx;
      hz += c * w.kz;
    }
    const w0 = waves[0];
    const w1 = waves[1];
    const w2 = waves[2];
    const phase =
      w0.kx * px + w0.kz * pz + w0.w * tm + w0.p +
      0.9 * Math.sin(w1.kx * px + w1.kz * pz + w1.w * tm + w1.p) +
      0.45 * Math.sin(w2.kx * px + w2.kz * pz + w2.w * tm + w2.p);
    RIP[0] = -hx;
    RIP[1] = -hz;
    RIP[2] = phase;
    RIP[3] = Math.hypot(w0.kx, w0.kz);
    RIP[4] = (-w0.kz * px + w0.kx * pz) / RIP[3];
  }

  // Painted bands and white crest lines over a water color.
  paintWater(r, g, b, dist, strength, out) {
    const phase = RIP[2];
    const k0 = RIP[3];
    const along = RIP[4];
    const S = this.S;
    const wave = Math.sin(phase);
    // Broad marbled bands: a lighter and a deeper tone.
    if (wave > 0.62) {
      const a = 0.1 * strength * smoothstep(0.62, 0.72, wave);
      r += (r * 1.25 + 0.03 - r) * a * 1.6;
      g += (g * 1.18 + 0.04 - g) * a * 1.6;
      b += (b * 1.08 + 0.04 - b) * a * 1.6;
    } else if (wave < -0.7) {
      const a = 0.08 * strength * smoothstep(-0.7, -0.8, wave);
      r *= 1 - a * 1.4;
      g *= 1 - a * 1.1;
      b *= 1 - a * 0.7;
    }
    // Thin white lines riding the crests, broken into long dashes.
    const f = phase / (Math.PI * 2);
    const fr = Math.abs(f - Math.floor(f) - 0.5);
    const foot = dist * this.pixelAngle * 1.5;
    const lw = ((0.03 + foot) * k0) / (Math.PI * 2);
    if (fr < lw) {
      const dash = Math.sin(along * 1.6 + 2.2 * Math.sin(along * 0.55 + f * 1.7));
      if (dash > -0.15) {
        const a = (1 - fr / lw) * 0.6 * strength * (S.keyOn ? 1 : 0.4) * (1 - smoothstep(0.03, 0.12, foot)) * smoothstep(-0.15, 0.25, dash);
        r += (0.97 - r) * a;
        g += (1.02 - g) * a;
        b += (1.02 - b) * a;
      }
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  }

  // The pool: refraction into a flat-tiled basin with depth absorption, a
  // mirrored reflection, then painted bands and crest lines on top.
  shadeWater(px, py, pz, dx, dy, dz, dist, out) {
    const S = this.S;
    const pool = this.world.pool;
    const tm = this.ripple_t;
    this.ripple(pool.waves, px, pz, tm);
    let nx = RIP[0];
    let ny = 1;
    let nz = RIP[1];
    const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx *= nl;
    ny *= nl;
    nz *= nl;
    const cosi = Math.max(0, -(nx * dx + ny * dy + nz * dz));
    // Stylized Fresnel: reflections never swamp the turquoise.
    const fres = 0.04 + 0.58 * Math.pow(1 - cosi, 4);
    let rr;
    let rg;
    let rb;
    if (this.sampleReflection(px, py, pz, dx, dy, dz, nx, nz, 7, T)) {
      // Reflections take on the water's own tint.
      rr = T[0] * 0.8;
      rg = T[1] * 0.95;
      rb = T[2];
    } else {
      skyColor(S, dx + 2 * cosi * nx, Math.abs(dy + 2 * cosi * ny), dz + 2 * cosi * nz, T, false);
      rr = T[0];
      rg = T[1];
      rb = T[2];
    }
    // Refraction into the basin (Snell, n = 1.333).
    const eta = 1 / 1.333;
    const kk = Math.sqrt(Math.max(0, 1 - eta * eta * (1 - cosi * cosi)));
    let tx = eta * dx + (eta * cosi - kk) * nx;
    let ty = eta * dy + (eta * cosi - kk) * ny;
    let tz = eta * dz + (eta * cosi - kk) * nz;
    const tl = 1 / Math.sqrt(tx * tx + ty * ty + tz * tz);
    tx *= tl;
    ty *= tl;
    tz *= tl;
    if (ty > -0.02) ty = -0.02;
    let tHit = (pool.floorY - py) / ty;
    let face = 0; // 0 floor, 1 x-wall, 2 z-wall
    let fnx = 0;
    let fnz = 0;
    if (tx !== 0) {
      const tw = ((tx > 0 ? pool.x1 : pool.x0) - px) / tx;
      if (tw > 0 && tw < tHit) {
        tHit = tw;
        face = 1;
        fnx = tx > 0 ? -1 : 1;
      }
    }
    if (tz !== 0) {
      const tw = ((tz > 0 ? pool.z1 : pool.z0) - pz) / tz;
      if (tw > 0 && tw < tHit) {
        tHit = tw;
        face = 2;
        fnx = 0;
        fnz = tz > 0 ? -1 : 1;
      }
    }
    const qx = px + tx * tHit;
    const qy = py + ty * tHit;
    const qz = pz + tz * tHit;
    const fny = face === 0 ? 1 : 0;
    if (face === 1) fnz = 0;
    let tr = pool.tile[0];
    let tg = pool.tile[1];
    let tb = pool.tile[2];
    if (face === 0) {
      const lane = Math.abs(qz - (pool.z0 + pool.z1) * 0.5);
      if (lane < 0.16 && qx > pool.x0 + 1.2 && qx < pool.x1 - 1.2) {
        tr = pool.lane[0];
        tg = pool.lane[1];
        tb = pool.lane[2];
      }
    }
    const [lx, ly, lz] = S.keyDir;
    const ndl = fnx * lx + fny * ly + fnz * lz;
    const vis = ndl > 0 ? this.shadow(qx, qy, qz, fnx, fny, fnz) : 0;
    const q = (0.55 + 0.45 * Math.max(0, ndl)) * vis;
    let ir = tr * (S.amb[0] * 0.92 + S.key[0] * q);
    let ig = tg * (S.amb[1] * 0.92 + S.key[1] * q);
    let ib = tb * (S.amb[2] * 0.92 + S.key[2] * q);
    // Underwater lights at night.
    if (S.lights > 0) {
      const glow = S.lights * (0.55 + 0.45 * Math.exp(-Math.abs(qy - pool.floorY - 0.9) * 0.8));
      ir += pool.glow[0] * glow;
      ig += pool.glow[1] * glow;
      ib += pool.glow[2] * glow;
    }
    // Absorption along the path from surface to basin.
    const ar = Math.exp(-tHit * 0.6);
    const ag = Math.exp(-tHit * 0.13);
    const ab = Math.exp(-tHit * 0.075);
    const wr = pool.water[0] * (S.amb[0] + S.key[0] * 0.6 + S.lights * 0.7);
    const wg = pool.water[1] * (S.amb[1] + S.key[1] * 0.6 + S.lights * 0.7);
    const wb = pool.water[2] * (S.amb[2] + S.key[2] * 0.6 + S.lights * 0.7);
    ir = ir * ar + wr * (1 - ar);
    ig = ig * ag + wg * (1 - ag);
    ib = ib * ab + wb * (1 - ab);
    let wr2 = ir + (rr - ir) * fres;
    let wg2 = ig + (rg - ig) * fres;
    let wb2 = ib + (rb - ib) * fres;
    const P = this.look.pool;
    if (P.flecks) {
      // The sun on the ripples, as painters dab it: a mosaic of small
      // bright flecks, squashed flat by the distance.
      const fl = this.flecks(px, pz, tm, dist, dy) * (S.keyOn ? 0.85 : 0.25 + 0.35 * S.lights);
      wr2 += (0.9 - wr2) * fl;
      wg2 += (0.97 - wg2) * fl;
      wb2 += (1.02 - wb2) * fl;
    }
    this.paintWater(wr2, wg2, wb2, dist, P.strokes, out);
  }

  // Coverage of the pool's flecks at (px, pz): an ellipse jittered into
  // every cell of a fine grid, each breathing in and out with the ripples.
  // Too small to draw at a distance, they become an even lightening.
  flecks(px, pz, tm, dist, dy) {
    const G = 0.42;
    const foot = (dist * this.pixelAngle * 1.5) / Math.max(0.08, Math.abs(dy));
    const far = smoothstep(0.03, 0.09, foot);
    if (far >= 1) return 0.1;
    const ci = Math.floor(px / G);
    const cj = Math.floor(pz / G);
    let cov = 0;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const h1 = hash2(i * 3 + 11, j * 7 - 5);
        if (h1 < 0.18) continue; // some cells have none
        const cx = (i + 0.15 + 0.7 * hash2(i, j + 41)) * G;
        const cz = (j + 0.15 + 0.7 * hash2(i + 17, j)) * G;
        const breathe = 0.65 + 0.35 * Math.sin(tm * 1.7 + h1 * 40);
        const rx = G * (0.1 + 0.14 * hash2(i - 9, j + 3)) * breathe;
        const rz = rx * (0.4 + 0.35 * hash2(i + 5, j - 13));
        const ex = (px - cx) / rx;
        const ez = (pz - cz) / rz;
        const d = ex * ex + ez * ez;
        if (d < 1.4) cov = Math.max(cov, smoothstep(1.4, 0.7, d));
      }
    }
    return cov * (1 - far) + 0.1 * far;
  }

  // Open water: a deep body color that cools with distance, the mirrored
  // world on top, broad painted bands and a scatter of crest lines.
  shadeHarbor(px, py, pz, dx, dy, dz, dist, out) {
    const S = this.S;
    const W = this.world.water;
    this.ripple(W.waves, px, pz, this.ripple_t);
    let nx = RIP[0];
    let ny = 1;
    let nz = RIP[1];
    const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx *= nl;
    ny *= nl;
    nz *= nl;
    const cosi = Math.max(0, -(nx * dx + ny * dy + nz * dz));
    const fres = 0.1 + 0.62 * Math.pow(1 - cosi, 3);
    const k = 1 - Math.exp(-dist / (W.falloff ?? 160));
    let wr = W.near[0] + (W.far[0] - W.near[0]) * k;
    let wg = W.near[1] + (W.far[1] - W.near[1]) * k;
    let wb = W.near[2] + (W.far[2] - W.near[2]) * k;
    const sh = W.shallow;
    if (sh) {
      // Shallows over sand: aqua at the shore, deepening offshore.
      const depth = sh.a[0] * px + sh.a[1] * pz - sh.d;
      const a = Math.exp(-Math.max(0, depth) / sh.w);
      wr += (sh.color[0] - wr) * a;
      wg += (sh.color[1] - wg) * a;
      wb += (sh.color[2] - wb) * a;
    }
    let br = wr * (S.amb[0] + S.key[0] * 0.55);
    let bg = wg * (S.amb[1] + S.key[1] * 0.55);
    let bb = wb * (S.amb[2] + S.key[2] * 0.55);
    if (this.sampleReflection(px, py, pz, dx, dy, dz, nx, nz, 12, T)) {
      br += (T[0] * 0.85 - br) * fres;
      bg += (T[1] * 0.95 - bg) * fres;
      bb += (T[2] - bb) * fres;
    } else {
      skyColor(S, dx, -dy, dz, T, false);
      br += (T[0] - br) * fres;
      bg += (T[1] - bg) * fres;
      bb += (T[2] - bb) * fres;
    }
    // A low sun lays a path of broken dashes across the water.
    const sd = S.sunDir;
    if (S.keyOn && sd[1] > -0.02 && sd[1] < 0.55) {
      const c = dx * sd[0] - dy * sd[1] + dz * sd[2];
      const spread = 0.955 + 0.035 * smoothstep(0, 0.5, sd[1]);
      if (c > spread) {
        const nse = valueNoise(px * 0.09 + RIP[2] * 0.08, pz * 0.9 + px * 0.02);
        const dash = smoothstep(0.5, 0.6, nse);
        const kk = dash * smoothstep(spread, 0.999, c) * (1 - smoothstep(0.3, 0.55, sd[1]));
        const warm = smoothstep(15, 0, S.sunEl);
        br += (1.08 - br) * kk;
        bg += (lerp(1.02, 0.84, warm) - bg) * kk;
        bb += (lerp(0.92, 0.58, warm) - bb) * kk;
      }
    }
    this.paintWater(br, bg, bb, dist, 0.7, out);
  }
}

// Scratch for the ripple field: tilt x, tilt z, phase, |k0|, along-crest.
const RIP = new Float64Array(5);

function makeBasis(eye, target, fovY, aspect, shift = 0) {
  const f = normalize(sub(target, eye));
  let r = cross(f, [0, 1, 0]);
  if (Math.hypot(r[0], r[1], r[2]) < 1e-9) r = cross(f, [0, 0, 1]);
  r = normalize(r);
  const u = cross(r, f);
  const ty = Math.tan((fovY * DEG) / 2);
  return { f, r, u, ty, tx: ty * aspect, sh: shift };
}

// Sprayed glow: whatever burns past white (the sun, neon, lamps, lit
// windows) bleeds softly into its surroundings. Three box blurs at half
// resolution approximate a gaussian.
export function bloom(img, W, H, { threshold = 1.1, strength = 0.9, radius = 0.012 } = {}) {
  const w = Math.max(1, W >> 1);
  const h = Math.max(1, H >> 1);
  let a = new Float32Array(w * h * 3);
  let any = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            const xx = Math.min(W - 1, x * 2 + i);
            const yy = Math.min(H - 1, y * 2 + j);
            s += Math.max(0, img[(yy * W + xx) * 3 + c] - threshold);
          }
        }
        a[o + c] = s * 0.25;
        if (s > 0) any = true;
      }
    }
  }
  if (!any) return img;
  let b = new Float32Array(a.length);
  const R = Math.max(1, Math.round(radius * H * 0.5));
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(a, b, w, h, R, true);
    boxBlur(b, a, w, h, R, false);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1.001, Math.max(0, x / 2 - 0.25));
      const fy = Math.min(h - 1.001, Math.max(0, y / 2 - 0.25));
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const ax = fx - ix;
      const ay = fy - iy;
      const o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        const v00 = a[(iy * w + ix) * 3 + c];
        const v10 = a[(iy * w + ix + 1) * 3 + c];
        const v01 = a[((iy + 1) * w + ix) * 3 + c];
        const v11 = a[((iy + 1) * w + ix + 1) * 3 + c];
        img[o + c] += ((v00 * (1 - ax) + v10 * ax) * (1 - ay) + (v01 * (1 - ax) + v11 * ax) * ay) * strength * 2.2;
      }
    }
  }
  return img;
}

function boxBlur(src, dst, w, h, R, horizontal) {
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const inv = 1 / (2 * R + 1);
  for (let l = 0; l < lines; l++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      const at = (i) => {
        const k = Math.min(n - 1, Math.max(0, i));
        return horizontal ? (l * w + k) * 3 + c : (k * w + l) * 3 + c;
      };
      for (let i = -R; i <= R; i++) acc += src[at(i)];
      for (let i = 0; i < n; i++) {
        dst[at(i)] = acc * inv;
        acc += src[at(i + R + 1)] - src[at(i - R)];
      }
    }
  }
}

// Soft shoulder above 0.82 so highlights roll off instead of clipping.
function shoulder(x) {
  if (x <= 0.82) return x < 0 ? 0 : x;
  return 0.82 + 0.18 * (1 - Math.exp(-(x - 0.82) / 0.18));
}

/**
 * Float RGB -> RGBA8, optionally just for the rect [x0, x1) x [y0, y1).
 * A fine, fixed grain stands in for the tooth of acrylic sprayed on board;
 * it is strongest in the midtones so whites stay clean. It also dithers.
 * How much grain is the look's: pass `renderer.look.grain`.
 */
export function toRGBA(img, W, H, rgba = new Uint8ClampedArray(W * H * 4), x0 = 0, y0 = 0, x1 = W, y1 = H, grain = LOOKS[DEFAULT_LOOK].grain) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const r = shoulder(img[i * 3]);
      const g = shoulder(img[i * 3 + 1]);
      const b = shoulder(img[i * 3 + 2]);
      const l = 0.3 * r + 0.55 * g + 0.15 * b;
      const n = (hash2(x * 7 + 13, y * 11 + 5) + hash2(x * 3 - 71, y * 5 + 29) - 1) * grain * (0.3 + 2.8 * l * (1 - l));
      rgba[i * 4] = (r + n) * 255;
      rgba[i * 4 + 1] = (g + n) * 255;
      rgba[i * 4 + 2] = (b + n) * 255;
      rgba[i * 4 + 3] = 255;
    }
  }
  return rgba;
}
