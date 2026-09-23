// Things on a beach: a lifeguard tower on stilts, surfboards, a towel, a
// pier on pilings, and the foam that draws the waterline.

import { CAST, DOUBLE, SMOOTH, NOREFLECT } from '../mesh.js';
import { railing } from './common.js';
import { motion } from './motion.js';

// Lifeguard tower facing -x (the sea), foot at the origin. A square cabin
// glazed on three sides, a deck in front, a ramp down the back, a flag.
export function addLifeguardTower(b, M) {
  const F = 2.3; // floor height
  const S = 1.5; // cabin half-size
  b.object();
  // Stilts and braces.
  b.use(M.trim, CAST);
  for (const x of [-S + 0.1, S - 0.1]) for (const z of [-S + 0.1, S - 0.1]) b.box(x - 0.1, -0.3, z - 0.1, x + 0.1, F, z + 0.1);
  b.use(M.trim, CAST | SMOOTH);
  for (const z of [-S + 0.1, S - 0.1]) {
    b.tube([[-S + 0.1, 0.3, z], [S - 0.1, F - 0.2, z]], [0.04, 0.04], 4);
    b.tube([[S - 0.1, 0.3, z], [-S + 0.1, F - 0.2, z]], [0.04, 0.04], 4);
  }
  // Floor platform, with the deck out front.
  b.use(M.planks, CAST);
  b.box(-S - 1.3, F - 0.18, -S - 0.1, S + 0.1, F, S + 0.1);
  // The cabin: solid below the windows, glass band, solid frieze.
  const y0 = F;
  const y1 = F + 0.95;
  const y2 = F + 2.05;
  const y3 = F + 2.4;
  b.use(M.towerBlue, CAST);
  b.box(-S, y0, -S, S, y1, S);
  b.box(-S, y2, -S, S, y3, S);
  b.box(S - 0.12, y1, -S, S, y2, S); // back wall
  for (const [z0, z1] of [
    [-S, -S + 0.12],
    [S - 0.12, S],
  ]) {
    b.box(-S, y1, z0, -S + 0.12, y2, z1);
    b.box(S - 0.5, y1, z0, S - 0.12, y2, z1);
  }
  b.object();
  b.use(M.glass, CAST);
  b.quad([-S + 0.06, y1, S], [-S + 0.06, y2, S], [-S + 0.06, y2, -S], [-S + 0.06, y1, -S]);
  b.quad([S - 0.5, y1, -S + 0.06], [-S, y1, -S + 0.06], [-S, y2, -S + 0.06], [S - 0.5, y2, -S + 0.06]);
  b.quad([-S, y1, S - 0.06], [S - 0.5, y1, S - 0.06], [S - 0.5, y2, S - 0.06], [-S, y2, S - 0.06]);
  b.use(M.trim, CAST);
  b.box(-S - 0.05, y1 - 0.06, -S - 0.05, S + 0.05, y1, S + 0.05);
  for (const z of [-S / 3, S / 3]) b.box(-S - 0.02, y1, z - 0.04, -S + 0.08, y2, z + 0.04);
  // Roof: a shallow hip with a deep eave.
  const E = 0.45;
  const ry = y3 + 0.08;
  const apex = [0, ry + 0.75, 0];
  const c = [
    [-S - E, ry, -S - E],
    [S + E, ry, -S - E],
    [S + E, ry, S + E],
    [-S - E, ry, S + E],
  ];
  b.use(M.trim, CAST);
  b.box(-S - E, y3, -S - E, S + E, ry, S + E);
  b.use(M.signCream, CAST);
  for (let i = 0; i < 4; i++) b.tri(c[i], apex, c[(i + 1) % 4]);
  // Railing round the deck.
  railing(b, M.trim, [[-S + 0.02, F, -S - 0.05], [-S - 1.25, F, -S - 0.05], [-S - 1.25, F, S + 0.05], [-S + 0.02, F, S + 0.05]], { h: 0.9, pitch: 0.9, r: 0.03 });
  // Ramp down the back to the sand.
  const run = 5.4;
  b.use(M.planks, CAST | DOUBLE);
  b.quad([S + 0.05, F - 0.05, -0.55], [S + 0.05, F - 0.05, 0.55], [S + run, -0.05, 0.55], [S + run, -0.05, -0.55]);
  for (const z of [-0.6, 0.6]) railing(b, M.trim, [[S + 0.05, F, z], [S + run - 0.3, 0.05, z]], { h: 0.85, pitch: 1.6, r: 0.028, mid: false });
  // Flag on the roof.
  b.use(M.trim, CAST | SMOOTH);
  b.tube([[0, ry + 0.7, 0], [0, ry + 2.3, 0]], [0.03, 0.025], 5);
  b.use(M.signRed, CAST | DOUBLE);
  const fl = motion.wind > 0 ? motion.wind : 0; // the flag's free edge flutters
  const fx = fl * 0.09 * Math.sin(3.3 * motion.t);
  const fz = fl * 0.05 * Math.sin(2.6 * motion.t + 1);
  b.quad([0, ry + 2.25, 0], [0, ry + 1.75, 0], [-0.05 + fx, ry + 1.8, 0.75 + fz], [-0.05 - fx, ry + 2.2, 0.72 - fz]);
  return { floor: F, top: ry + 0.75 };
}

// A surfboard standing on its tail: outline in the local xy plane (width
// along x, length up y), a few centimeters thick.
export function addSurfboard(b, mat, L = 2.3, W = 0.56) {
  const n = 9;
  const right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = (W / 2) * Math.pow(Math.sin(Math.PI * (0.22 + 0.72 * t)), 0.55) * (1 - Math.pow(t, 7));
    right.push([Math.max(w, 0.004), t * L]);
  }
  // Tail to nose up the right rail, back down the left.
  const outline = [...right, ...right.slice(0, n).reverse().map(([x, y]) => [-x, y])];
  b.use(mat, CAST);
  b.profile(outline, -0.035, 0.035);
}

// A rack of boards: two posts and a bar, boards leaning on it.
export function addBoardRack(b, M, mats) {
  b.object();
  b.use(M.trim, CAST);
  b.box(-0.05, 0, -1.4, 0.05, 1.3, -1.3);
  b.box(-0.05, 0, 1.3, 0.05, 1.3, 1.4);
  b.box(-0.06, 1.18, -1.4, 0.06, 1.3, 1.4);
  mats.forEach((m, i) => {
    if (m === null) return;
    b.push();
    b.translate(-0.21, 0, -1.0 + i * 0.66);
    b.rotateY(Math.PI / 2 + 0.06 * (i % 2 ? 1 : -1));
    b.rotateX(0.14);
    addSurfboard(b, m, 2.2 + (i % 2) * 0.25);
    b.pop();
  });
}

// A striped towel, flat on the sand along local z.
export function addTowel(b, M, mat = M.towel) {
  b.object();
  b.use(mat, CAST);
  b.box(-0.45, 0, -0.9, 0.45, 0.025, 0.9);
}

// Someone's footprints along a path of [x, z] points: left and right feet
// half a stride apart, pressed into the sand at ground(x), darker where
// the sand is wet (x below wet(z)), and gone where the swash reaches
// (x below swash).
export function addFootprints(b, M, rng, pts, { ground, wet, swash = 1, stride = 1.44, gauge = 0.1 }) {
  // Round the corners (twice cut), then walk it.
  let p = pts;
  for (let n = 0; n < 2; n++) {
    const q = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  b.object();
  let side = 1;
  let next = 0.3;
  let walked = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const [ax, az] = p[i];
    const [bx, bz] = p[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const tx = (bx - ax) / len;
    const tz = (bz - az) / len;
    while (next <= walked + len) {
      const u = next - walked;
      const x = ax + tx * u - tz * side * gauge + rng.range(-0.02, 0.02);
      const z = az + tz * u + tx * side * gauge + rng.range(-0.02, 0.02);
      next += stride / 2 + rng.range(-0.05, 0.05);
      side = -side;
      if (x < swash) continue;
      b.use(x < wet(z) ? M.printWet : M.print, 0);
      footprint(b, x, ground(x) + 0.007, z, Math.atan2(tz, tx) + side * 0.12 + rng.range(-0.06, 0.06));
    }
    walked += len;
  }
}

// One print, heel to toe along heading `a` (radians from +x toward +z):
// a narrow heel and a wider ball, as a flat fan facing up.
function footprint(b, x, y, z, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const n = 12;
  const pt = (i) => {
    const th = (i / n) * Math.PI * 2;
    const u = Math.cos(th) * 0.13; // along the foot
    const w = -Math.sin(th) * 0.045 * (1 + 0.35 * Math.cos(th)); // across: wider at the toe
    return [x + u * c - w * s, y, z + u * s + w * c];
  };
  const mid = [x + 0.015 * c, y, z + 0.015 * s];
  for (let i = 0; i < n; i++) b.tri(mid, pt(i), pt(i + 1));
}

// Pier from x = x0 (land) to x = x1 (sea) along z = zc, deck at `deck`,
// on rows of pilings. Returns the lights of its lamps.
export function addPier(b, M, { x0, x1, zc, deck = 6.5, half = 4.5, bay = 7, bed = -3 }) {
  const lights = [];
  b.object();
  b.use(M.planks, CAST);
  b.box(x1, deck - 0.3, zc - half, x0, deck, zc + half);
  const rows = Math.floor((x0 - x1) / bay);
  for (let i = 0; i <= rows; i++) {
    const x = x1 + i * bay + 0.5;
    b.use(M.piling, CAST);
    b.box(x - 0.2, deck - 0.75, zc - half, x + 0.2, deck - 0.3, zc + half);
    b.use(M.piling, CAST | SMOOTH);
    for (const off of [-half + 0.5, -1.5, 1.5, half - 0.5]) {
      b.push();
      b.translate(x, bed, zc + off);
      b.cylinder(0.24, 0.22, 0, deck - 0.75 - bed, 8, { caps: false });
      b.pop();
    }
  }
  for (const s of [-1, 1]) {
    railing(b, M.rail, [[x0, deck, zc + s * (half - 0.08)], [x1 + 0.1, deck, zc + s * (half - 0.08)]], { h: 1.05, pitch: 2.4, r: 0.035 });
  }
  // Lamps down both sides.
  for (let x = x0 - 14; x > x1 + 6; x -= 28) {
    for (const s of [-1, 1]) {
      b.object();
      b.use(M.post, CAST | SMOOTH);
      b.push();
      b.translate(x, deck, zc + s * (half - 0.35));
      b.cylinder(0.06, 0.05, 0, 3.4, 8, { caps: false });
      b.use(M.globe, CAST | SMOOTH);
      b.translate(0, 3.6, 0);
      b.sphere(0.2, 10, 7);
      b.pop();
      lights.push({ p: [x, deck + 3.6, zc + s * (half - 0.35)], c: [1.0, 0.8, 0.52], r: 4, k: 0.9 });
    }
  }
  // A pavilion at the end.
  const px = x1 + 2;
  b.use(M.stucco, CAST);
  b.box(px, deck, zc - 3.4, px + 7, deck + 3, zc + 3.4);
  b.object();
  b.use(M.glass, CAST);
  b.quad([px + 7.01, deck + 0.9, zc - 2.6], [px + 7.01, deck + 2.3, zc - 2.6], [px + 7.01, deck + 2.3, zc + 2.6], [px + 7.01, deck + 0.9, zc + 2.6]);
  b.use(M.trim, CAST);
  b.box(px - 0.6, deck + 3, zc - 4, px + 7.6, deck + 3.25, zc + 4);
  b.use(M.salmon, CAST);
  const ry = deck + 3.25;
  const r = [
    [px - 0.6, ry, zc - 4],
    [px + 7.6, ry, zc - 4],
    [px + 7.6, ry, zc + 4],
    [px - 0.6, ry, zc + 4],
  ];
  const ridgeA = [px + 1.5, ry + 1.7, zc];
  const ridgeB = [px + 5.5, ry + 1.7, zc];
  b.quad(r[0], ridgeA, ridgeB, r[1]);
  b.quad(r[2], ridgeB, ridgeA, r[3]);
  b.tri(r[1], ridgeB, r[2]);
  b.tri(r[3], ridgeA, r[0]);
  lights.push({ p: [px + 7.8, deck + 1.8, zc], c: [1, 0.78, 0.5], r: 3, k: 0.8 });
  return lights;
}

// A band of foam lying on the water: from x = xa(z) to x = xb(z).
export function addFoam(b, M, { z0, z1, step = 1.5, xa, xb, y = 0.012, mat = M.foam }) {
  b.use(mat, NOREFLECT);
  for (let z = z0; z < z1; z += step) {
    const zb = Math.min(z1, z + step);
    b.quad([xa(z), y, z], [xa(zb), y, zb], [xb(zb), y, zb], [xb(z), y, z]);
  }
}

// A line of breaking waves parallel to the shore, painted as a chain of
// long tapered strokes with gaps, each riding a little in or out.
// surge: how far (m) the line runs in and back with the swell, once every
// `period` seconds, `lag` radians behind the line further out.
export function addBreakers(b, M, rng, { x, z0, z1, width = 0.8, len = [6, 22], gap = [2, 9], y = 0.012, mat = M.foam, surge = 0, period = 7.5, lag = 0 }) {
  b.use(mat, NOREFLECT);
  const sw = motion.wind > 0 ? surge : 0;
  let z = z0 + rng.range(0, gap[1]);
  while (z < z1) {
    const L = rng.range(len[0], len[1]);
    const ph = ((2 * Math.PI) / period) * motion.t - lag - z * 0.012;
    const W = width * rng.range(0.5, 1.2) * (sw ? 1 + 0.35 * Math.sin(ph + 1.2) : 1);
    const xc = x + rng.range(-1.2, 1.2) + sw * Math.sin(ph);
    const bow = rng.range(-0.6, 0.6);
    const n = Math.max(4, Math.round(L / 1.2));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const zz = z + L * t;
      const mid = xc + bow * Math.sin(Math.PI * t);
      // Thick at the crest's leading third, thinning to a point both ends.
      const w = W * Math.pow(Math.sin(Math.PI * t), 0.6) * (1.15 - 0.3 * t);
      const cur = [
        [mid - w * 0.75, y, zz],
        [mid + w * 0.25, y, zz],
      ];
      if (prev) b.quad(prev[0], cur[0], cur[1], prev[1]);
      prev = cur;
    }
    z += L + rng.range(gap[0], gap[1]);
  }
}
