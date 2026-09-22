// Coconut palms, grown rather than drawn.
//
// The trunk rises straight and then gives in to its lean (bend ~ t^1.8),
// tapering from a flared foot. Fronds leave the crown in three tiers; each
// rib is a ballistic arc (droop * s^2), and leaflets are single tapered
// triangles that fold down into a V and sweep toward the tip, which is
// what makes the comb-like silhouette and the dappled shadow.

import { CAST, DOUBLE, SMOOTH } from '../mesh.js';
import { normalize, cross, sub, madd } from '../math.js';

export function addPalm(b, rng, M, x, z, opts = {}) {
  const height = opts.height ?? rng.range(7, 11);
  const lean = opts.lean ?? rng.range(0.6, 2.4);
  const leanAz = opts.leanAz ?? rng.range(0, Math.PI * 2);
  const ground = opts.ground ?? 0;
  const lx = Math.cos(leanAz);
  const lz = Math.sin(leanAz);
  const phase = rng.range(0, Math.PI * 2);
  const segs = 16;
  const pts = [];
  const radii = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const bend = Math.pow(t, 1.8) * lean;
    const s = Math.sin(t * Math.PI * 1.5 + phase) * 0.12 * t; // a subtle S
    pts.push([x + lx * bend - lz * s, ground + height * t, z + lz * bend + lx * s]);
    radii.push(0.2 * (1 - 0.3 * t) + 0.14 * Math.exp(-t * 16));
  }
  b.object();
  b.use(M.trunk, CAST | SMOOTH);
  b.tube(pts, radii, 9);
  const top = pts[segs];
  const axis = normalize(sub(top, pts[segs - 1]));
  // Crown shaft: the boots of old fronds.
  b.use(M.boot, CAST | SMOOTH);
  b.tube([madd(top, axis, -0.5), madd(top, axis, 0.1), madd(top, axis, 0.32)], [0.19, 0.25, 0.1], 8, { capEnd: true });
  b.use(M.nut, CAST | SMOOTH);
  const nuts = rng.int(2, 5);
  for (let i = 0; i < nuts; i++) {
    const a = rng.range(0, Math.PI * 2);
    b.push();
    b.translate(top[0] + Math.cos(a) * 0.25, top[1] - 0.22 - rng.range(0, 0.15), top[2] + Math.sin(a) * 0.25);
    b.sphere(0.12, 6, 4);
    b.pop();
  }
  const n = opts.fronds ?? rng.int(13, 17);
  const az0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const tier = i % 3;
    const az = az0 + (i / n) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const el = [0.62, 0.2, -0.22][tier] + rng.range(-0.12, 0.12);
    const len = rng.range(3.3, 4.5) * [0.8, 1, 1.03][tier] * (opts.frondScale ?? 1);
    const droop = rng.range(1.1, 1.8) * [0.75, 1, 1.3][tier];
    addFrond(b, rng, madd(top, axis, 0.2), az, el, len, droop, rng.chance(0.45) ? M.frondDark : M.frond);
  }
  return { top, height };
}

function addFrond(b, rng, o, az, el, len, droop, mat) {
  const ce = Math.cos(el);
  const dx = ce * Math.cos(az);
  const dy = Math.sin(el);
  const dz = ce * Math.sin(az);
  const at = (s) => [o[0] + dx * len * s, o[1] + dy * len * s - droop * s * s, o[2] + dz * len * s];
  const tan = (s) => normalize([dx * len, dy * len - 2 * droop * s, dz * len]);
  const N = 15;
  const maxLeaf = len * rng.range(0.25, 0.31);
  b.object();
  b.use(mat, CAST | DOUBLE);
  let prev = o;
  for (let j = 1; j <= N; j++) {
    const s = j / N;
    const p = at(s);
    const t = tan(s);
    let side = cross(t, [0, 1, 0]);
    const sl = Math.hypot(side[0], side[1], side[2]);
    side = sl < 1e-6 ? [1, 0, 0] : [side[0] / sl, side[1] / sl, side[2] / sl];
    const up = cross(side, t);
    // The rib: a thin ribbon.
    b.quad(prev, p, madd(p, up, 0.04), madd(prev, up, 0.04));
    prev = p;
    if (s < 0.08) continue;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + s)), 0.7);
    const ll = maxLeaf * env * (1 - 0.3 * s) * rng.range(0.85, 1.1);
    if (ll < 0.05) continue;
    const sweep = 0.55;
    const fold = 0.5 + 0.35 * s;
    const w = 0.05 + 0.06 * env;
    for (const sign of [-1, 1]) {
      const d = normalize([
        side[0] * sign * Math.cos(sweep) + t[0] * Math.sin(sweep) - up[0] * fold,
        side[1] * sign * Math.cos(sweep) + t[1] * Math.sin(sweep) - up[1] * fold,
        side[2] * sign * Math.cos(sweep) + t[2] * Math.sin(sweep) - up[2] * fold,
      ]);
      const tip = [p[0] + d[0] * ll, p[1] + d[1] * ll - ll * 0.16, p[2] + d[2] * ll];
      b.tri(madd(p, t, -w), madd(p, t, w), tip);
    }
  }
}
