// Mexican fan palms: very tall, very thin, a shaggy skirt of dead fronds
// under a ragged crown of fan leaves. The boulevard palm.
//
// Each leaf is a pleated fan: its segments fold up and down in turn, as a
// paper fan does, so the sun picks out every other one; past the middle
// every segment breaks and hangs, so from a distance the crown reads as a
// starburst with a fringe, which is how these palms are drawn. Young
// leaves stand up in the middle of the crown in a lighter green, the old
// ones hang yellowing under it, and under them hangs the skirt of dead
// ones, or, on a palm the town keeps trimmed, a short boot of old leaf
// bases. `lod` (0.3 far to 1 near) sets how finely all of it is cut.

import { CAST, DOUBLE, SMOOTH } from '../mesh.js';
import { normalize, cross, madd, sub } from '../math.js';
import { motion, phase } from './motion.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function addFanPalm(b, rng, M, x, z, { height = rng.range(15, 22), ground = 0, lod = 1 } = {}) {
  const q = (Math.max(0.3, Math.min(1, lod)) - 0.3) / 0.7; // 0 far .. 1 near
  const lean = rng.range(0, 0.9);
  const la = rng.range(0, Math.PI * 2);
  // A slight bow in some trunks, across the lean; never a curl.
  const bow = rng.range(-0.3, 0.3);
  const segs = Math.round(6 + 10 * q);
  const pts = [];
  const radii = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const bend = Math.pow(t, 2) * lean;
    const s = Math.sin(t * Math.PI) * bow;
    pts.push([x + Math.cos(la) * bend - Math.sin(la) * s, ground + height * t, z + Math.sin(la) * bend + Math.cos(la) * s]);
    // Slender all the way up, from a foot that flares into the ground.
    radii.push(0.18 * (1 - 0.24 * t) + 0.2 * Math.exp(-t * 20));
  }
  b.object();
  b.use(M.fanTrunk, CAST | SMOOTH);
  b.tube(pts, radii, q > 0.7 ? 8 : q > 0.3 ? 6 : 5);
  const top = pts[segs];
  const axis = normalize(sub(top, pts[segs - 1]));

  const trimmed = rng.chance(0.2);
  if (trimmed) {
    // A short boot of old leaf bases, a little wider than the trunk.
    const bootLen = rng.range(0.9, 1.6);
    b.use(M.skirt, CAST | SMOOTH);
    b.tube([madd(top, axis, -bootLen), madd(top, axis, -bootLen * 0.5), madd(top, axis, 0.15)], [0.2, 0.27, 0.24], q > 0.5 ? 8 : 5, { capEnd: true });
  } else {
    // The skirt: two overlapping rings of dead fronds, a cone that
    // narrows as it hangs, with a ragged hem; striped where the fronds
    // lie side by side.
    const skirtLen = rng.range(1.6, 3.2);
    const sN = Math.round(9 + 11 * q);
    b.use(M.skirt, CAST | DOUBLE);
    const S = madd(top, axis, -0.15);
    for (const [ring, r0, r1, off] of [
      [0, 0.7, 0.32, 0],
      [1, 0.58, 0.27, 0.5],
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
        b.tri(q0, tip, q1, [0, 1, 0.5, 1, 1, 1]);
      }
    }
  }

  // The crown: young leaves stand up, mature ones spread, old ones hang.
  const leaves = Math.round(12 + 14 * q);
  const K = Math.round(7 + 9 * q);
  const az0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < leaves; i++) {
    let az = az0 + i * GOLDEN + rng.range(-0.2, 0.2);
    const age = rng.float();
    const young = age < 0.26;
    const old = age > 0.9;
    let el = young ? rng.range(0.85, 1.3) : old ? rng.range(-1.2, -0.7) : rng.range(-0.12, 0.52);
    if (motion.wind > 0) {
      const ph = phase(i, x, z);
      az += motion.wind * 0.08 * Math.sin(1.2 * motion.t + ph);
      el += motion.wind * 0.07 * Math.sin(1.9 * motion.t + ph * 1.4);
    }
    const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const stalk = rng.range(0.7, 1.2) * (young ? 0.75 : old ? 0.6 : 1);
    const base = madd(madd(top, axis, 0.15), d, stalk);
    b.use(M.fanLeaf, CAST | DOUBLE);
    b.tube([madd(top, axis, 0.1), base], [0.04, 0.024], 3);
    b.use(young ? M.fanLeafLight : old ? M.fanLeafOld : M.fanLeaf, CAST | DOUBLE);
    fanLeaf(b, rng, base, d, rng.range(0.95, 1.3) * (young ? 0.8 : old ? 0.8 : 1), K, old ? 0.03 : 0.045, rng.range(-0.5, 0.5));
  }
  return { top, height };
}

// One leaf at `o`, facing along `d` and turned `roll` about it: K
// segments fanned across ~150 degrees, pleated (`pleat`: how high each
// fold stands, as a fraction of the radius): a broad blade out to two
// thirds of the radius, where the segments split, and a drooping tip.
function fanLeaf(b, rng, o, d, R, K, pleat, roll) {
  let side0 = cross(d, [0, 1, 0]);
  const sl = Math.hypot(side0[0], side0[1], side0[2]);
  side0 = sl < 1e-6 ? [1, 0, 0] : [side0[0] / sl, side0[1] / sl, side0[2] / sl];
  const up0 = cross(side0, d);
  // Each blade turned a little about its stalk, as the wind leaves them.
  const side = [side0[0] * Math.cos(roll) + up0[0] * Math.sin(roll), side0[1] * Math.cos(roll) + up0[1] * Math.sin(roll), side0[2] * Math.cos(roll) + up0[2] * Math.sin(roll)];
  const up = cross(side, d); // the leaf's own "up", normal to the fan
  const spread = 1.32;
  const R1 = R * 0.68;
  const R2 = R * 0.4;
  // The folds between segments, raised and lowered in turn, cupped a
  // little upward: shared by the segments either side, so the fan is one
  // folded sheet.
  const folds = [];
  for (let j = 0; j <= K; j++) {
    const t = (j / K) * 2 - 1;
    const a = t * spread + (j > 0 && j < K ? rng.range(-0.03, 0.03) : 0);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const v = normalize([d[0] * ca + side[0] * sa + up[0] * 0.12, d[1] * ca + side[1] * sa + up[1] * 0.12, d[2] * ca + side[2] * sa + up[2] * 0.12]);
    folds.push(madd(madd(o, v, R1), up, (j % 2 ? 1 : -1) * pleat * R1));
  }
  for (let k = 0; k < K; k++) {
    const t = ((k + 0.5) / K) * 2 - 1;
    const mL = folds[k];
    const mR = folds[k + 1];
    const m = [(mL[0] + mR[0]) / 2, (mL[1] + mR[1]) / 2, (mL[2] + mR[2]) / 2];
    const v = normalize(sub(m, o));
    // Outer segments hang further than the middle ones.
    const droop = 0.55 + 0.5 * Math.abs(t) + rng.range(-0.1, 0.15);
    const tipDir = normalize([v[0] * Math.cos(droop) - up[0] * Math.sin(droop), v[1] * Math.cos(droop) - up[1] * Math.sin(droop) - 0.35, v[2] * Math.cos(droop) - up[2] * Math.sin(droop)]);
    const tip = madd(m, tipDir, R2 * rng.range(0.85, 1.1));
    b.tri(o, mL, mR, [0, 0.5, 0.68, 0, 0.68, 1]);
    b.tri(mL, tip, mR, [0.68, 0, 1, 0.5, 0.68, 1]);
  }
}
