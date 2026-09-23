// Mexican fan palms: very tall, very thin, a shaggy skirt of dead fronds
// under a small ragged crown of fan leaves. The boulevard palm.
//
// Each leaf is a fan of narrow segments split from a common center; past
// the middle every segment breaks and hangs, so from a distance the crown
// reads as a starburst with a fringe, which is how these palms are drawn.

import { CAST, DOUBLE, SMOOTH } from '../mesh.js';
import { normalize, cross, madd, sub } from '../math.js';
import { motion, phase } from './motion.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function addFanPalm(b, rng, M, x, z, { height = rng.range(15, 22), ground = 0, lod = 1 } = {}) {
  const lean = rng.range(0, 0.9);
  const la = rng.range(0, Math.PI * 2);
  const near = lod > 0.5;
  const segs = near ? 14 : 6;
  const pts = [];
  const radii = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const bend = Math.pow(t, 2) * lean;
    pts.push([x + Math.cos(la) * bend, ground + height * t, z + Math.sin(la) * bend]);
    radii.push(0.18 * (1 - 0.22 * t) + 0.17 * Math.exp(-t * 22));
  }
  b.object();
  b.use(M.fanTrunk, CAST | SMOOTH);
  b.tube(pts, radii, near ? 8 : 5);
  const top = pts[segs];
  const axis = normalize(sub(top, pts[segs - 1]));

  // The skirt: two overlapping rings of dead fronds, a cone that narrows
  // as it hangs, with a ragged hem.
  const skirtLen = rng.range(1.8, 3.0);
  const sN = near ? 18 : 9;
  b.use(M.skirt, CAST | DOUBLE);
  const S = madd(top, axis, -0.15);
  for (const [ring, r0, r1, off] of [
    [0, 0.66, 0.3, 0],
    [1, 0.55, 0.26, 0.5],
  ]) {
    for (let i = 0; i < sN; i++) {
      const a0 = ((i + off) / sN) * Math.PI * 2;
      const a1 = ((i + off + 1.25) / sN) * Math.PI * 2;
      const drop = skirtLen * rng.range(0.7, 1.05) * (ring ? 0.85 : 1);
      const am = (a0 + a1) / 2;
      const p0 = [S[0] + Math.cos(a0) * r0, S[1], S[2] + Math.sin(a0) * r0];
      const p1 = [S[0] + Math.cos(a1) * r0, S[1], S[2] + Math.sin(a1) * r0];
      const q0 = [S[0] + Math.cos(a0) * r1, S[1] - drop * 0.88, S[2] + Math.sin(a0) * r1];
      const q1 = [S[0] + Math.cos(a1) * r1, S[1] - drop * 0.88, S[2] + Math.sin(a1) * r1];
      const tip = [S[0] + Math.cos(am) * r1 * 0.9, S[1] - drop, S[2] + Math.sin(am) * r1 * 0.9];
      b.quad(p0, q0, q1, p1, [0, 0, 0, 1, 1, 1, 1, 0]);
      b.tri(q0, tip, q1);
    }
  }

  // The crown: young leaves stand up, mature ones spread, old ones hang.
  const leaves = near ? rng.int(22, 30) : 11;
  const K = near ? 13 : 6;
  const az0 = rng.range(0, Math.PI * 2);
  b.use(M.fanLeaf, CAST | DOUBLE);
  for (let i = 0; i < leaves; i++) {
    let az = az0 + i * GOLDEN + rng.range(-0.2, 0.2);
    const age = rng.float();
    let el = age < 0.28 ? rng.range(0.85, 1.3) : age < 0.8 ? rng.range(-0.15, 0.6) : rng.range(-0.85, -0.3);
    if (motion.wind > 0) {
      const ph = phase(i, x, z);
      az += motion.wind * 0.08 * Math.sin(1.2 * motion.t + ph);
      el += motion.wind * 0.07 * Math.sin(1.9 * motion.t + ph * 1.4);
    }
    const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const stalk = rng.range(0.6, 1.2) * (age < 0.28 ? 0.8 : 1);
    const base = madd(madd(top, axis, 0.15), d, stalk);
    b.tube([madd(top, axis, 0.1), base], [0.035, 0.022], 3);
    fanLeaf(b, rng, base, d, rng.range(0.95, 1.35), K);
  }
  return { top, height };
}

// One leaf at `o`, facing along `d`: K segments fanned across ~140
// degrees, each a wedge out to mid-radius and a drooping tip beyond it.
function fanLeaf(b, rng, o, d, R, K) {
  let side = cross(d, [0, 1, 0]);
  const sl = Math.hypot(side[0], side[1], side[2]);
  side = sl < 1e-6 ? [1, 0, 0] : [side[0] / sl, side[1] / sl, side[2] / sl];
  const up = cross(side, d); // the leaf's own "up", normal to the fan
  const spread = 1.2;
  const R1 = R * 0.56;
  const R2 = R * 0.5;
  const hw = R1 * Math.sin(spread / K) * 0.95;
  for (let k = 0; k < K; k++) {
    const t = K > 1 ? (k / (K - 1)) * 2 - 1 : 0;
    const a = t * spread + rng.range(-0.04, 0.04);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Segment direction in the fan plane, cupped slightly upward.
    const v = normalize([d[0] * ca + side[0] * sa + up[0] * 0.12, d[1] * ca + side[1] * sa + up[1] * 0.12, d[2] * ca + side[2] * sa + up[2] * 0.12]);
    const p = [side[0] * ca - d[0] * sa, side[1] * ca - d[1] * sa, side[2] * ca - d[2] * sa];
    const m = madd(o, v, R1);
    const mL = madd(m, p, -hw);
    const mR = madd(m, p, hw);
    // Outer segments hang further than the middle ones.
    const droop = 0.55 + 0.5 * Math.abs(t) + rng.range(-0.1, 0.15);
    const tipDir = normalize([v[0] * Math.cos(droop) - up[0] * Math.sin(droop), v[1] * Math.cos(droop) - up[1] * Math.sin(droop) - 0.35, v[2] * Math.cos(droop) - up[2] * Math.sin(droop)]);
    const tip = madd(m, tipDir, R2 * rng.range(0.85, 1.1));
    b.tri(o, mL, mR, [0, 0.5, 0.56, 0, 0.56, 1]);
    b.tri(mL, tip, mR, [0.56, 0, 1, 0.5, 0.56, 1]);
  }
}
