// Scenery shared by every place in town: faceted hills, pipe railings,
// lamp posts, and a planter that keeps things out of each other's way.

import { CAST, DOUBLE, SMOOTH, DISTANT } from '../mesh.js';
import { DEG } from '../math.js';

// A faceted ridge: a row of peaks between two ground lines, flat shaded so
// each slope reads as one tone. `alongX` turns it to run east-west.
export function ridge(b, rng, x, z, width, depth, height, base, alongX = false) {
  const n = rng.int(3, 5);
  const peaks = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const env = Math.sin(Math.PI * (0.08 + 0.84 * t));
    peaks.push(base + height * env * rng.range(0.6, 1.0));
  }
  const pt = (along, across, y) => (alongX ? [x + along, y, z + across] : [x + across, y, z + along]);
  for (let k = 0; k < n; k++) {
    const a0 = -width / 2 + (width * k) / n;
    const a1 = -width / 2 + (width * (k + 1)) / n;
    const off = rng.range(-0.15, 0.15) * depth;
    const P0 = pt(a0, off, peaks[k]);
    const P1 = pt(a1, off, peaks[k + 1]);
    const F0 = pt(a0, -depth / 2, base);
    const F1 = pt(a1, -depth / 2, base);
    const B0 = pt(a0, depth / 2, base);
    const B1 = pt(a1, depth / 2, base);
    // Wind both slopes outward whichever way the ridge runs.
    if (alongX) {
      b.quad(F0, P0, P1, F1);
      b.quad(P0, B0, B1, P1);
    } else {
      b.quad(F0, F1, P1, P0);
      b.quad(P0, P1, B1, B0);
    }
  }
  b.use(b.curMat, DISTANT | DOUBLE);
  b.tri(pt(-width / 2, -depth / 2, base), pt(-width / 2, depth / 2, base), pt(-width / 2, 0, peaks[0]));
  b.tri(pt(width / 2, -depth / 2, base), pt(width / 2, depth / 2, base), pt(width / 2, 0, peaks[n]));
  b.use(b.curMat, DISTANT);
}

// Distant hills in a sector of the compass (degrees clockwise from north),
// each ridge turned roughly square to the line of sight.
export function hills(b, rng, mat, { n = 6, az = [0, 360], dist = [1500, 4000], height = [150, 500], base = 0, at = [0, 0] } = {}) {
  b.use(mat, DISTANT);
  for (let i = 0; i < n; i++) {
    const a = rng.range(az[0], az[1]) * DEG;
    const d = rng.range(dist[0], dist[1]);
    b.push();
    b.translate(at[0] + Math.sin(a) * d, 0, at[1] - Math.cos(a) * d);
    // Local z runs across the line of sight.
    b.rotateY(Math.PI / 2 - a);
    ridge(b, rng, 0, 0, d * rng.range(0.35, 0.8), d * rng.range(0.12, 0.25), rng.range(height[0], height[1]), base, false);
    b.pop();
  }
}

// A pipe railing along a polyline of base points: posts every `pitch`,
// a top rail and (optionally) a mid rail.
export function railing(b, mat, pts, { h = 1.0, pitch = 1.6, r = 0.028, mid = true, posts = true } = {}) {
  b.use(mat, CAST | SMOOTH);
  const lift = (y) => pts.map((p) => [p[0], p[1] + y, p[2]]);
  b.tube(lift(h), pts.map(() => r), 6);
  if (mid) b.tube(lift(h * 0.5), pts.map(() => r * 0.8), 5);
  if (!posts) return;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const c = pts[i + 1];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = Math.max(1, Math.round(len / pitch));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const x = a[0] + (c[0] - a[0]) * t;
      const y = a[1] + (c[1] - a[1]) * t;
      const z = a[2] + (c[2] - a[2]) * t;
      b.tube([[x, y, z], [x, y + h, z]], [r, r], 5);
    }
  }
}

// A lamp post with a globe; returns the light it throws after dark.
export function lampPost(b, M, x, z, base = 0, { height = 3.6, globe = 0.22, color = [1.0, 0.8, 0.52], reach = 4 } = {}) {
  b.object();
  b.use(M.post, CAST | SMOOTH);
  b.push();
  b.translate(x, base, z);
  b.cylinder(0.07, 0.05, 0, height, 8, { caps: false });
  b.cylinder(0.16, 0.13, 0, 0.22, 10);
  b.use(M.globe, CAST | SMOOTH);
  b.translate(0, height + globe * 0.9, 0);
  b.sphere(globe, 10, 7);
  b.pop();
  return { p: [x, base + height + globe, z], c: color, r: reach, k: 0.95 };
}

// Rejection sampling with spacing: tries points in `zone` = [x0, x1, z0,
// z1] until `n` pass `ok` and sit at least `gap` from each other.
export function scatter(rng, n, zone, gap, ok = () => true, placed = [], tries = 400) {
  const out = [];
  let t = 0;
  while (out.length < n && t++ < tries) {
    const x = rng.range(zone[0], zone[1]);
    const z = rng.range(zone[2], zone[3]);
    if (!ok(x, z)) continue;
    let clear = true;
    for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < gap) clear = false;
    for (const p of out) if (Math.hypot(p.x - x, p.z - z) < gap) clear = false;
    if (clear) out.push({ x, z });
  }
  return out;
}
