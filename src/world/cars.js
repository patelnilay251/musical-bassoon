// Late-seventies cars, nose along local +x, standing on y = 0: the open
// convertible the visitor drives, and the hardtops and wagons parked
// around town.
//
// The body is lofted, like the boats' hulls: a cross-section at every
// station along the car, with a crowned hood and deck, a rounded shoulder,
// a waist line where the sides are widest and a rocker that tucks under.
// The sides stop short over the wheels, so the arches are cut in rather
// than drawn on. Chrome goes where a car of the time had it: wrap-around
// bumpers, the grille, a strip along the belt, the hubcaps.

import { CAST, DOUBLE, SMOOTH } from '../mesh.js';
import { normalize, cross, sub } from '../math.js';

const XF = 1.42; // front axle
const XR = -1.48; // rear axle
const RA = 0.43; // wheel arch radius
const HALF = 0.92; // half width
const X0 = -2.44; // tail
const X1 = 2.46; // nose
const CAB0 = -1.0; // the open car's cockpit, from the rear deck...
const CAB1 = 0.9; // ...to the cowl
const SHOULDER = 0.09;
const CROWN = 0.035;

const lerpPts = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [xa, ya] = pts[i - 1];
      const [xb, yb] = pts[i];
      const u = (x - xa) / (xb - xa);
      return ya + (yb - ya) * u * u * (3 - 2 * u);
    }
  }
  return pts[pts.length - 1][1];
};

// Side view: the top line (deck, belt, hood) and the bottom line (valances,
// sills, and the arches over the wheels).
const TOP = [
  [X0, 0.64],
  [-2.3, 0.84],
  [-1.05, 0.88],
  [0.9, 0.9],
  [2.1, 0.84],
  [2.36, 0.78],
  [X1, 0.7],
];
function bottom(x) {
  let y = lerpPts(
    [
      [X0, 0.32],
      [-2.25, 0.25],
      [2.28, 0.25],
      [X1, 0.3],
    ],
    x,
  );
  for (const xc of [XF, XR]) {
    const d = x - xc;
    const r = RA + 0.04;
    if (Math.abs(d) < r) y = Math.max(y, 0.34 + Math.sqrt(r * r - d * d));
  }
  return y;
}
// Plan view: full width, rounded in at the corners.
function halfWidth(x) {
  const f = Math.max(0, (x - 2.08) / (X1 - 2.08));
  const r = Math.max(0, (-2.2 - x) / (-2.2 - X0));
  return HALF - 0.17 * f ** 1.6 - 0.12 * r ** 1.6;
}

// One side's cross-section at station x, from the top center down to the
// rocker: [z, y] pairs. In the open car's cockpit the top is cut away to
// the door's inner edge.
function section(x, open) {
  const top = lerpPts(TOP, x);
  const w = halfWidth(x);
  const bot = bottom(x);
  const pts = [];
  if (open) {
    const zi = w - 0.11;
    pts.push([zi, top], [zi, top], [zi, top], [w - SHOULDER, top]);
  } else {
    for (const f of [0, 0.35, 0.7]) pts.push([f * w, top + CROWN * (1 - f * f)]);
    pts.push([w - SHOULDER, top + CROWN * (1 - ((w - SHOULDER) / w) ** 2)]);
  }
  for (const a of [30, 60, 90]) {
    const t = (a * Math.PI) / 180;
    pts.push([w - SHOULDER + SHOULDER * Math.sin(t), top - SHOULDER + SHOULDER * Math.cos(t)]);
  }
  const waist = Math.min(0.58, top - SHOULDER - 0.05);
  pts.push([w, Math.max(waist, bot + 0.1)]);
  pts.push([w - 0.025, bot + 0.07]);
  pts.push([w - 0.06, bot]);
  return pts;
}

function loftBody(b, M, paint, open, lod) {
  const n = lod >= 1 ? 34 : 12;
  const xs = [];
  for (let i = 0; i <= n; i++) xs.push(X0 + ((X1 - X0) * i) / n);
  // The cockpit's edges are sharp: a station on each side of each edge.
  if (open) {
    for (const xc of [CAB0, CAB1]) xs.push(xc - 1e-4, xc + 1e-4);
    xs.sort((a, c) => a - c);
  }
  const isOpen = (x) => open && x > CAB0 && x < CAB1;
  const grid = xs.map((x) => section(x, isOpen(x)).map(([z, y]) => [x, y, z]));
  const J = grid[0].length;
  // Normals by differences along the car and around the section (skipping
  // the doubled stations at the cockpit's edges).
  const step = (i, d) => {
    let k = i + d;
    while (k >= 0 && k < xs.length && Math.abs(xs[k] - xs[i]) < 1e-3) k += d;
    return Math.max(0, Math.min(xs.length - 1, k));
  };
  const nrm = (i, j, s) => {
    const a = grid[step(i, -1)][j];
    const c = grid[step(i, 1)][j];
    const d = grid[i][Math.max(0, j - 1)];
    const e = grid[i][Math.min(J - 1, j + 1)];
    const nn = normalize(cross(sub(e, d), sub(c, a)));
    return Number.isFinite(nn[0]) ? [nn[0], nn[1], nn[2] * s] : [0, 1, 0];
  };
  b.use(paint, CAST | SMOOTH);
  for (const s of [1, -1]) {
    const P = (i, j) => [grid[i][j][0], grid[i][j][1], grid[i][j][2] * s];
    for (let i = 0; i + 1 < grid.length; i++) {
      if (xs[i + 1] - xs[i] < 1e-3) continue;
      for (let j = 0; j + 1 < J; j++) {
        const q = [P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)];
        const nq = [nrm(i, j, s), nrm(i, j + 1, s), nrm(i + 1, j + 1, s), nrm(i + 1, j, s)];
        if (s > 0) b.quad(q[0], q[1], q[2], q[3], null, nq);
        else b.quad(q[3], q[2], q[1], q[0], null, [nq[3], nq[2], nq[1], nq[0]]);
      }
    }
  }
  // Tail and nose.
  b.use(paint, CAST);
  const cap = (i, facing) => {
    const sec = grid[i];
    const mid = [xs[i], (sec[0][1] + sec[J - 1][1]) / 2, 0];
    const ring = [...sec.map((p) => [p[0], p[1], p[2]]), [xs[i], sec[J - 1][1], 0], ...sec.map((p) => [p[0], p[1], -p[2]]).reverse()];
    for (let k = 0; k + 1 < ring.length; k++) {
      if (facing > 0) b.tri(mid, ring[k], ring[k + 1]);
      else b.tri(mid, ring[k + 1], ring[k]);
    }
  };
  cap(0, -1);
  cap(grid.length - 1, 1);
  // In the open car, the faces behind the dash and behind the rear seat:
  // from the cockpit floor up to the crowned top of the hood and the deck.
  if (open) {
    for (const [xc, facing] of [
      [CAB0, 1],
      [CAB1, -1],
    ]) {
      const top = lerpPts(TOP, xc);
      const w = halfWidth(xc);
      const zi = w - 0.11;
      for (let k = 0; k < 8; k++) {
        const za = -zi + (2 * zi * k) / 8;
        const zb = -zi + (2 * zi * (k + 1)) / 8;
        const ya = top + CROWN * (1 - (za / w) ** 2);
        const yb = top + CROWN * (1 - (zb / w) ** 2);
        const q = [
          [xc, 0.62, za],
          [xc, 0.62, zb],
          [xc, yb, zb],
          [xc, ya, za],
        ];
        if (facing > 0) b.quad(q[3], q[2], q[1], q[0]);
        else b.quad(q[0], q[1], q[2], q[3]);
      }
    }
  }
  // Wheel wells, and a dark belly so nothing shows through underneath.
  b.use(M.tire, CAST);
  for (const xc of [XF, XR]) {
    const r = RA + 0.04;
    const w = HALF - 0.08;
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * Math.PI;
      const a1 = ((k + 1) / 10) * Math.PI;
      const p0 = [xc + r * Math.cos(a0), 0.34 + r * Math.sin(a0)];
      const p1 = [xc + r * Math.cos(a1), 0.34 + r * Math.sin(a1)];
      b.quad([p0[0], p0[1], w], [p1[0], p1[1], w], [p1[0], p1[1], -w], [p0[0], p0[1], -w]);
    }
  }
  b.box(X0 + 0.15, 0.24, -HALF + 0.08, X1 - 0.2, 0.26, HALF - 0.08, 'py');
}

// lit: headlights and taillights on (a car being driven after dark).
// lod below 1: fewer stations and no small parts, for cars far off.
export function addCar(b, M, { paint = M.paint, type = 'convertible', lit = false, lod = 1 } = {}) {
  b.object();
  const open = type === 'convertible';
  loftBody(b, M, paint, open, lod);
  if (open) openCabin(b, M, paint, lod);
  else closedCabin(b, M, paint, type === 'wagon');
  trim(b, M, lit, lod);
}

function openCabin(b, M, paint, lod) {
  const zi = HALF - 0.11;
  // The inner faces of the doors, and the cockpit floor.
  b.use(paint, CAST);
  for (const s of [1, -1]) {
    const z = s * zi;
    const q = [
      [CAB0, 0.64, z],
      [CAB1, 0.64, z],
      [CAB1, 0.9, z],
      [CAB0, 0.88, z],
    ];
    if (s > 0) b.quad(q[3], q[2], q[1], q[0]);
    else b.quad(q[0], q[1], q[2], q[3]);
  }
  b.use(M.leather, CAST);
  b.box(CAB0, 0.6, -zi, CAB1, 0.64, zi, 'ny');
  // Bucket seats in front, a bench behind, pleated.
  b.use(M.leatherPleat, CAST);
  for (const zc of [-0.42, 0.42]) {
    b.box(-0.35, 0.64, zc - 0.29, 0.18, 0.8, zc + 0.29);
    b.push();
    b.translate(-0.37, 0.64, zc);
    b.rotateZ(0.2);
    b.box(-0.12, 0, -0.28, 0.02, 0.58, 0.28);
    b.pop();
  }
  b.box(-0.98, 0.64, -0.72, -0.62, 0.78, 0.72);
  b.box(-1.0, 0.64, -0.72, -0.88, 1.0, 0.72);
  // The top, folded down behind the rear seat under its boot.
  b.use(M.canvasTop, CAST | SMOOTH);
  b.tube([[-1.18, 0.95, -0.74], [-1.18, 0.97, 0], [-1.18, 0.95, 0.74]], [0.11, 0.13, 0.11], 8);
  // Dashboard, padded, with a strip of chrome.
  b.use(M.tire, CAST);
  b.box(0.7, 0.8, -zi, 0.9, 0.92, zi);
  b.use(M.chrome, CAST);
  if (lod >= 1) b.box(0.69, 0.84, -zi + 0.05, 0.71, 0.86, zi - 0.05);
  // Windshield: chrome frame, tinted glass, a mirror at the top.
  b.use(M.chrome, CAST | SMOOTH);
  for (const zc of [-0.8, 0.8]) b.tube([[0.9, 0.9, zc], [0.62, 1.33, zc]], [0.025, 0.025], 6);
  b.tube([[0.62, 1.33, -0.8], [0.62, 1.33, 0.8]], [0.025, 0.025], 6);
  if (lod >= 1) {
    b.use(M.chrome, CAST);
    b.box(0.58, 1.24, -0.12, 0.62, 1.3, 0.12);
  }
  b.object();
  b.use(M.carGlass, DOUBLE);
  b.quad([0.9, 0.9, -0.78], [0.9, 0.9, 0.78], [0.63, 1.32, 0.78], [0.63, 1.32, -0.78]);
  // Steering wheel.
  b.use(M.tire, CAST | SMOOTH);
  const ring = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ring.push([0.55 + 0.05 * Math.sin(a), 1.0 + 0.17 * Math.sin(a), -0.42 + 0.17 * Math.cos(a)]);
  }
  b.tube(ring, ring.map(() => 0.016), 5);
}

// A glass greenhouse under a painted roof, with the thick rear pillar
// these cars were drawn with.
function closedCabin(b, M, paint, wagon) {
  const xb = wagon ? -2.18 : -1.2; // where the cabin meets the rear deck
  const xr = wagon ? -2.1 : -0.76; // rear edge of the roof
  const w = 0.8;
  b.object();
  b.use(M.carGlass, CAST);
  b.profile(
    [
      [xb, 0.87],
      [0.9, 0.87],
      [0.44, 1.33],
      [xr, 1.35],
    ],
    -w + 0.02,
    w - 0.02,
  );
  b.use(paint, CAST);
  b.box(xr - 0.02, 1.33, -w, 0.47, 1.39, w);
  for (const s of [-1, 1]) {
    const z0 = s > 0 ? w - 0.03 : -w;
    const z1 = s > 0 ? w : -w + 0.03;
    // Rear pillar.
    b.profile(
      [
        [xb, 0.9],
        [xb + 0.42, 0.9],
        [xr + 0.26, 1.34],
        [xr, 1.34],
      ],
      z0,
      z1,
    );
    // Door pillar, and on wagons a second one over the rear door.
    for (const xc of wagon ? [-0.2, -1.2] : [-0.2]) b.box(xc - 0.05, 0.9, z0, xc + 0.05, 1.34, z1);
    // Windshield pillar.
    b.tube([[0.88, 0.9, s * (w - 0.02)], [0.44, 1.34, s * (w - 0.02)]], [0.035, 0.035], 5);
  }
  if (wagon) {
    // Wood-grain side panels, as a family car should have.
    b.use(M.teak, CAST);
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? HALF - 0.02 : -HALF - 0.012;
      const z1 = s > 0 ? HALF + 0.012 : -HALF + 0.02;
      b.box(-2.1, 0.46, z0, 1.1, 0.78, z1);
    }
  }
}

function trim(b, M, lit, lod) {
  // Wheels: black tires with white walls, chrome hubcaps.
  for (const xc of [XF, XR]) {
    for (const side of [-1, 1]) {
      b.push();
      b.translate(xc, 0.34, side * (HALF - 0.14));
      b.rotateX((side * Math.PI) / 2);
      b.use(M.tire, CAST | SMOOTH);
      b.cylinder(0.34, 0.34, -0.11, 0.11, lod >= 1 ? 16 : 8);
      b.use(M.chrome, CAST | SMOOTH);
      b.cylinder(0.19, 0.16, 0.11, 0.13, lod >= 1 ? 12 : 6, { caps: lod >= 1 });
      if (lod >= 1) {
        b.use(M.whitewall, CAST);
        ring(b, 0.2, 0.28, 0.112, 16);
        b.use(M.chrome, CAST);
        b.cylinder(0.06, 0.05, 0.13, 0.16, 8);
      }
      b.pop();
    }
  }
  // Wrap-around bumpers.
  b.use(M.chrome, CAST | SMOOTH);
  const bumper = (x, dir, y) => {
    const pts = [
      [x - dir * 0.22, y, -HALF - 0.01],
      [x - dir * 0.03, y, -HALF + 0.1],
      [x + dir * 0.03, y, -0.5],
      [x + dir * 0.04, y, 0],
      [x + dir * 0.03, y, 0.5],
      [x - dir * 0.03, y, HALF - 0.1],
      [x - dir * 0.22, y, HALF + 0.01],
    ];
    b.tube(pts, pts.map(() => 0.075), 8);
  };
  bumper(X1 + 0.02, 1, 0.36);
  bumper(X0 - 0.02, -1, 0.38);
  // Grille: a dark recess barred with chrome.
  b.use(M.tire, CAST);
  b.box(X1 - 0.05, 0.44, -0.46, X1 + 0.005, 0.64, 0.46);
  if (lod >= 1) {
    b.use(M.chrome, CAST);
    for (const y of [0.47, 0.53, 0.59]) b.box(X1 - 0.02, y, -0.44, X1 + 0.02, y + 0.018, 0.44);
    b.box(X1 - 0.02, 0.44, -0.47, X1 + 0.02, 0.645, -0.45);
    b.box(X1 - 0.02, 0.44, 0.45, X1 + 0.02, 0.645, 0.47);
  }
  // Headlights in chrome bezels.
  for (const zc of [-0.66, 0.66]) {
    b.push();
    b.translate(X1 - 0.06, 0.56, zc);
    b.rotateZ(-Math.PI / 2);
    b.use(M.chrome, CAST | SMOOTH);
    b.cylinder(0.12, 0.12, 0, 0.05, 14);
    b.use(lit ? M.headlightLit : M.headlight, CAST | SMOOTH);
    b.cylinder(0.095, 0.095, 0.05, 0.07, 14);
    b.pop();
  }
  // Taillights across the tail.
  b.use(lit ? M.taillightLit : M.taillight, CAST);
  for (const s of [-1, 1]) b.box(X0 - 0.02, 0.5, s > 0 ? 0.42 : -0.84, X0 + 0.02, 0.62, s > 0 ? 0.84 : -0.42);
  // A plate on the tail.
  b.use(M.plate, CAST);
  b.box(X0 - 0.025, 0.46, -0.16, X0, 0.58, 0.16);
  if (lod < 1) return;
  // A thin strip of chrome along the belt, and a mirror on the door.
  b.use(M.chrome, CAST | SMOOTH);
  for (const s of [-1, 1]) {
    const pts = [];
    for (let x = -2.2; x <= 2.2 + 1e-9; x += 0.1) {
      const y = lerpPts(TOP, x) - SHOULDER * 0.72;
      pts.push([x, y, s * (halfWidth(x) - SHOULDER + SHOULDER * Math.sin(Math.acos(Math.min(1, (y - lerpPts(TOP, x) + SHOULDER) / SHOULDER))) + 0.014)]);
    }
    b.tube(pts, pts.map(() => 0.017), 6);
    b.tube([[0.74, 0.9, s * (HALF - 0.02)], [0.74, 0.99, s * (HALF + 0.05)]], [0.012, 0.012], 4);
    b.push();
    b.translate(0.74, 1.02, s * (HALF + 0.07));
    b.scale(0.07, 0.05, 0.035);
    b.sphere(1, 8, 5);
    b.pop();
  }
}

// A flat ring facing +y (before the wheel is turned), between radii.
function ring(b, r0, r1, y, segs) {
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    b.quad([r0 * Math.cos(a0), y, -r0 * Math.sin(a0)], [r1 * Math.cos(a0), y, -r1 * Math.sin(a0)], [r1 * Math.cos(a1), y, -r1 * Math.sin(a1)], [r0 * Math.cos(a1), y, -r0 * Math.sin(a1)]);
  }
}

// Paint and body for the n-th parked car in a lot: varied, repeatable.
const PARKED = [
  ['paintRed', 'coupe'],
  ['paintCream', 'wagon'],
  ['paintBlue', 'coupe'],
  ['paintTeal', 'convertible'],
  ['paintWhite', 'coupe'],
  ['paintPink', 'coupe'],
  ['paintCream', 'coupe'],
  ['paintBlue', 'wagon'],
];

export function parkedCar(b, M, rng, { lod = 1 } = {}) {
  const [paint, type] = rng.pick(PARKED);
  addCar(b, M, { paint: M[paint], type, lod });
}
