// Boats, bow along local +x, waterline at y = 0. A hull is lofted from a
// row of stations: a plan shape that is squared at the transom and fine at
// the bow, a sheer that rises forward, sides that flare out above water.
// Then a sailboat gets a cabin, a mast, a boom under a blue cover and its
// rigging; a motor yacht gets a deckhouse and a flybridge.

import { CAST, DOUBLE, SMOOTH } from '../mesh.js';

// Half-beam (fraction of B/2) along the hull, t = 0 transom, t = 1 bow.
function plan(t) {
  if (t < 0.38) return 0.82 + 0.18 * Math.sin((t / 0.38) * (Math.PI / 2));
  const u = (t - 0.38) / 0.62;
  return Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.1 * u);
}

/**
 * Loft a hull. Returns sampling helpers for the deck: `at(t)` gives the
 * station x, half-beam and sheer height.
 */
export function hull(b, M, { L, B, F, paint, boot, stripe = null }) {
  const N = 14;
  const DRAFT = -0.35;
  const BOOT = 0.16;
  const st = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const xs = -L / 2 + L * t; // at the sheer
    // Overhangs: the stem rakes forward and the transom aft, so the
    // waterline is shorter than the deck.
    const xw = xs - 0.1 * L * Math.pow(t, 7) + 0.035 * L * Math.pow(1 - t, 7);
    const w = (B / 2) * Math.max(0.02, plan(t));
    // The sheer dips just aft of amidships and sweeps up to the bow.
    const u = (t - 0.42) / 0.58;
    const sheer = F * (0.88 + 0.12 * u * u * (t > 0.42 ? 2.3 : 0.6));
    st.push({ t, xs, xw, w, sheer, wl: w * 0.84 });
  }
  // A point on a station's side at height y, between waterline and sheer.
  const side = (q, y, s, flare = 1) => {
    const k = (y - DRAFT) / (q.sheer - DRAFT);
    return [q.xw + (q.xs - q.xw) * k, y, s * (q.wl + (q.w - q.wl) * Math.pow(k, 0.7)) * flare];
  };
  const sides = (s) => {
    const quad = (p0, p1, p2, p3) => (s > 0 ? b.quad(p0, p1, p2, p3) : b.quad(p3, p2, p1, p0));
    for (let i = 0; i < N; i++) {
      const a = st[i];
      const c = st[i + 1];
      const top = (q) => (stripe ? q.sheer - 0.14 : q.sheer);
      // Below the boot top: the boot stripe; above: the topsides.
      b.use(boot, CAST);
      quad(side(a, DRAFT, s, 0.97), side(c, DRAFT, s, 0.97), side(c, BOOT, s), side(a, BOOT, s));
      b.use(paint, CAST);
      quad(side(a, BOOT, s), side(c, BOOT, s), side(c, top(c), s), side(a, top(a), s));
      if (stripe) {
        b.use(stripe, CAST);
        quad(side(a, a.sheer - 0.14, s), side(c, c.sheer - 0.14, s), side(c, c.sheer, s), side(a, a.sheer, s));
      }
    }
  };
  b.object();
  sides(1);
  sides(-1);
  // Transom.
  const s0 = st[0];
  b.use(paint, CAST);
  b.quad(side(s0, DRAFT, -1, 0.97), side(s0, DRAFT, 1, 0.97), side(s0, s0.sheer, 1), side(s0, s0.sheer, -1));
  // Deck, laid over the stations.
  b.use(M.teak, CAST);
  for (let i = 0; i < N; i++) {
    const a = st[i];
    const c = st[i + 1];
    b.quad([a.xs, a.sheer, a.w], [c.xs, c.sheer, c.w], [c.xs, c.sheer, -c.w], [a.xs, a.sheer, -a.w]);
  }
  // Toe rail: a thin white lip along the sheer.
  b.use(M.trim, CAST);
  for (const s of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const a = st[i];
      const c = st[i + 1];
      const q = (p0, p1, p2, p3) => (s > 0 ? b.quad(p0, p1, p2, p3) : b.quad(p3, p2, p1, p0));
      q([a.xs, a.sheer, s * a.w], [c.xs, c.sheer, s * c.w], [c.xs, c.sheer + 0.07, s * c.w], [a.xs, a.sheer + 0.07, s * a.w]);
    }
  }
  const at = (t) => {
    const f = Math.min(N - 1e-9, Math.max(0, t * N));
    const i = Math.floor(f);
    const k = f - i;
    const a = st[i];
    const c = st[i + 1];
    return { x: a.xs + (c.xs - a.xs) * k, w: a.w + (c.w - a.w) * k, sheer: a.sheer + (c.sheer - a.sheer) * k };
  };
  const end = (q) => ({ x: q.xs, w: q.w, sheer: q.sheer });
  return { at, bow: end(st[N]), stern: end(st[0]) };
}

// A cruising sailboat, L meters overall.
// sails: 0 leaves the mainsail furled under its cover; above that, the
// fraction of the way both sails are hoisted, with the boom swung out
// `boom` radians (positive to starboard, -z).
export function addSailboat(b, M, rng, { L = rng.range(9, 12.5), paint = M.hull, boot = M.bootStripe, cover = M.sailCover, sails = 0, boom = 0 } = {}) {
  const B = L * 0.33;
  const F = 0.95 + L * 0.02;
  const H = hull(b, M, { L, B, F, paint, boot, stripe: rng.chance(0.5) ? boot : null });
  // Coachroof with a band of dark windows.
  const c0 = H.at(0.3);
  const c1 = H.at(0.64);
  const cw = Math.min(c0.w, c1.w) * 0.62;
  const cy = c0.sheer;
  const ch = 0.55;
  b.use(M.trim, CAST);
  b.profile(
    [
      [c0.x, cy - 0.1],
      [c1.x, cy - 0.1],
      [c1.x - 0.5, cy + ch],
      [c0.x + 0.15, cy + ch],
    ],
    -cw,
    cw,
  );
  b.object();
  b.use(M.carGlass, CAST);
  for (const s of [-1, 1]) {
    const z = s * (cw + 0.005);
    const pts = [
      [c0.x + 0.6, cy + 0.18, z],
      [c1.x - 0.9, cy + 0.18, z],
      [c1.x - 1.0, cy + 0.36, z],
      [c0.x + 0.7, cy + 0.36, z],
    ];
    if (s > 0) b.quad(...pts);
    else b.quad(pts[3], pts[2], pts[1], pts[0]);
  }
  // Mast, boom and the sail, furled under its cover or set.
  const mx = H.at(0.62).x;
  const mh = L * 1.32;
  b.use(M.mast, CAST | SMOOTH);
  b.tube([[mx, cy + ch, 0], [mx, cy + mh, 0]], [0.075, 0.05], 6);
  const by = cy + ch + 0.95;
  const bx = H.at(0.14).x;
  const top = [mx, cy + mh - 0.1, 0];
  const bow = H.bow;
  const stern = H.stern;
  if (sails > 0) {
    const bl = mx - bx;
    const clew = [mx - bl * Math.cos(boom), by, -bl * Math.sin(boom)];
    b.tube([[mx, by, 0], clew], [0.05, 0.05], 5);
    // Both sails belly out to leeward, the side the boom is on.
    const lee = boom >= 0 ? -1 : 1;
    b.use(M.sail, CAST | DOUBLE);
    sail(b, [mx - 0.08, by + 0.06, 0], [mx - 0.08, by + (top[1] - 0.3 - by) * sails, 0], [clew[0], by + 0.06, clew[2]], lee, 0.1);
    const tack = [bow.x - 0.2, bow.sheer + 0.12, 0];
    const head = [tack[0] + (top[0] - tack[0]) * 0.8 * sails, tack[1] + (top[1] - tack[1]) * 0.8 * sails, 0];
    sail(b, tack, head, [mx - 0.5, by - 0.45, lee * (0.6 + 0.9 * sails)], lee, 0.12);
  } else {
    b.tube([[mx, by, 0], [bx, by, 0]], [0.05, 0.05], 5);
    b.use(cover, CAST | SMOOTH);
    b.tube([[mx - 0.1, by + 0.12, 0], [(mx + bx) / 2, by + 0.16, 0], [bx + 0.5, by + 0.1, 0]], [0.2, 0.17, 0.08], 7);
  }
  // Standing rigging: forestay, backstay, shrouds.
  b.use(M.rope, CAST | SMOOTH);
  const r = [0.012, 0.012];
  b.tube([top, [bow.x - 0.1, bow.sheer + 0.05, 0]], r, 3);
  b.tube([top, [stern.x + 0.1, stern.sheer + 0.05, 0]], r, 3);
  const sh = H.at(0.58);
  for (const s of [-1, 1]) b.tube([[mx, cy + mh * 0.82, 0], [sh.x, sh.sheer + 0.07, s * sh.w * 0.95]], r, 3);
  // Pulpit and pushpit rails.
  b.use(M.chrome, CAST | SMOOTH);
  const p0 = H.at(0.93);
  b.tube([[p0.x, p0.sheer, -p0.w * 0.8], [p0.x + 0.2, p0.sheer + 0.6, -p0.w * 0.55], [bow.x - 0.15, bow.sheer + 0.62, 0], [p0.x + 0.2, p0.sheer + 0.6, p0.w * 0.55], [p0.x, p0.sheer, p0.w * 0.8]], [0.018, 0.018, 0.018, 0.018, 0.018], 4);
  return { L, mast: [mx, cy + mh], H };
}

// A triangular sail from tack up the luff to the head and out along the
// foot to the clew, cambered: it bellies out `belly` of its chord toward
// side `lee` (+1 = +z).
function sail(b, tack, head, clew, lee, belly) {
  const NU = 4;
  const NV = 5;
  const chord = Math.hypot(clew[0] - tack[0], clew[2] - tack[2]);
  const at = (u, v) => {
    const k = (1 - v) * u;
    const p = [tack[0] + (head[0] - tack[0]) * v + (clew[0] - tack[0]) * k, tack[1] + (head[1] - tack[1]) * v + (clew[1] - tack[1]) * k, tack[2] + (head[2] - tack[2]) * v + (clew[2] - tack[2]) * k];
    p[2] += lee * belly * chord * (1 - v) * 4 * u * (1 - u);
    return p;
  };
  for (let i = 0; i < NV; i++) {
    for (let j = 0; j < NU; j++) {
      const v0 = i / NV;
      const v1 = (i + 1) / NV;
      const u0 = j / NU;
      const u1 = (j + 1) / NU;
      if (i === NV - 1) b.tri(at(u0, v0), at(u1, v0), at(0, 1));
      else b.quad(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1));
    }
  }
}

// A motor yacht: high topsides, a deckhouse wrapped in dark glass, a
// flybridge with its windscreen, a short radar mast.
export function addMotorYacht(b, M, rng, { L = rng.range(12, 17), paint = M.hull, boot = M.hullNavy } = {}) {
  const B = L * 0.3;
  const F = 1.5 + L * 0.02;
  const H = hull(b, M, { L, B, F, paint, boot, stripe: boot });
  const d0 = H.at(0.18);
  const d1 = H.at(0.66);
  const w = Math.min(d0.w, d1.w) * 0.86;
  const y0 = d0.sheer;
  const hh = 2.0;
  b.use(paint, CAST);
  b.profile(
    [
      [d0.x, y0 - 0.2],
      [d1.x, y0 - 0.2],
      [d1.x - 1.3, y0 + hh],
      [d0.x + 0.2, y0 + hh],
    ],
    -w,
    w,
  );
  b.object();
  b.use(M.glass, CAST);
  for (const s of [-1, 1]) {
    const z = s * (w + 0.005);
    const pts = [
      [d0.x + 0.9, y0 + 0.75, z],
      [d1.x - 0.75, y0 + 0.75, z],
      [d1.x - 1.25, y0 + 1.6, z],
      [d0.x + 0.9, y0 + 1.6, z],
    ];
    if (s > 0) b.quad(...pts);
    else b.quad(pts[3], pts[2], pts[1], pts[0]);
  }
  // Windscreen across the front of the deckhouse.
  const fx0 = d1.x - 0.05;
  const fx1 = d1.x - 1.25;
  b.quad([fx1 + 0.1, y0 + 1.75, -w * 0.9], [fx1 + 0.1, y0 + 1.75, w * 0.9], [fx0 - 0.4, y0 + 0.75, w * 0.9], [fx0 - 0.4, y0 + 0.75, -w * 0.9]);
  // Flybridge.
  const f0 = H.at(0.26);
  const f1 = H.at(0.55);
  const fy = y0 + hh;
  b.use(paint, CAST);
  b.box(f0.x, fy, -w * 0.8, f1.x, fy + 0.45, w * 0.8);
  b.use(M.carGlass, CAST | DOUBLE);
  b.quad([f1.x, fy + 0.45, -w * 0.7], [f1.x, fy + 0.45, w * 0.7], [f1.x - 0.35, fy + 0.9, w * 0.6], [f1.x - 0.35, fy + 0.9, -w * 0.6]);
  b.use(M.chrome, CAST | SMOOTH);
  b.tube([[f0.x + 0.2, fy + 0.45, -w * 0.78], [f0.x + 0.2, fy + 1.3, -w * 0.78], [f0.x + 0.2, fy + 1.3, w * 0.78], [f0.x + 0.2, fy + 0.45, w * 0.78]], [0.02, 0.02, 0.02, 0.02], 4);
  b.use(M.mast, CAST | SMOOTH);
  b.tube([[f0.x + 0.9, fy + 0.45, 0], [f0.x + 0.75, fy + 2.8, 0]], [0.05, 0.035], 5);
  b.use(M.rail, CAST);
  b.box(f0.x + 0.55, fy + 2.1, -0.35, f0.x + 1.0, fy + 2.22, 0.35);
  return { L, H };
}

// A lighthouse on a round concrete footing: a tapered white tower with a
// red band, a gallery, a glass lantern and a red cap. Its beacon burns at
// night. Returns { lamp, top }.
export function addLighthouse(b, M, { h = 13 } = {}) {
  b.object();
  b.use(M.curb, CAST | SMOOTH);
  b.cylinder(3.2, 3.4, 0, 1.2, 20);
  b.use(M.lighthouse ?? M.stucco, CAST | SMOOTH);
  b.cylinder(1.7, 1.25, 1.2, h * 0.62, 18, { caps: false });
  b.use(M.lhRed, CAST | SMOOTH);
  b.cylinder(1.25, 1.12, h * 0.62, h * 0.82, 18, { caps: false });
  b.use(M.stucco, CAST | SMOOTH);
  b.cylinder(1.12, 1.05, h * 0.82, h, 18, { caps: false });
  // Door and a little window.
  b.use(M.doorBlue, CAST);
  b.box(1.5, 1.2, -0.45, 1.72, 3.2, 0.45);
  b.object();
  b.use(M.carGlass, CAST);
  b.box(1.26, h * 0.5, -0.25, 1.52, h * 0.5 + 0.8, 0.25);
  // Gallery and railing.
  b.use(M.trim, CAST | SMOOTH);
  b.cylinder(1.75, 1.75, h, h + 0.22, 20);
  const ring = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    ring.push([Math.cos(a) * 1.68, h + 1.05, Math.sin(a) * 1.68]);
  }
  b.use(M.rope, CAST | SMOOTH);
  b.tube(ring, ring.map(() => 0.03), 4);
  for (let i = 0; i < 20; i += 2) b.tube([[ring[i][0], h + 0.22, ring[i][2]], ring[i]], [0.022, 0.022], 3);
  // Lantern: glass between a sill and the cap; the beacon inside.
  b.use(M.lhRed, CAST | SMOOTH);
  b.cylinder(0.95, 0.95, h + 0.22, h + 0.5, 14);
  b.object();
  b.use(M.beacon, CAST | SMOOTH);
  b.cylinder(0.82, 0.82, h + 0.5, h + 1.95, 14, { caps: false });
  b.use(M.lhRed, CAST | SMOOTH);
  b.cylinder(1.05, 0.2, h + 1.95, h + 2.75, 14);
  b.use(M.rope, CAST | SMOOTH);
  b.tube([[0, h + 2.7, 0], [0, h + 3.3, 0]], [0.035, 0.02], 4);
  return { lamp: [0, h + 1.2, 0], top: h + 3.3 };
}
