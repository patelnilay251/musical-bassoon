// Late-seventies cars, nose along local +x, standing on y = 0: the open
// convertible the visitor drives, and the hardtops and wagons parked
// around town. One body profile, extruded, with the cabin swapped out.

import { CAST, DOUBLE, SMOOTH } from '../mesh.js';

const XF = 1.42; // front axle
const XR = -1.48; // rear axle
const RA = 0.43; // wheel arch radius
const HALF = 0.92; // half width

function arch(xc) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    pts.push([xc + RA * Math.cos(a), 0.34 + RA * Math.sin(a)]);
  }
  return pts;
}

// Side profile. The convertible has an open tub between the doors;
// hardtops are solid to the belt line.
function bodyProfile(open) {
  const top = open
    ? [
        [-2.32, 0.86],
        [-1.0, 0.9],
        [-1.0, 0.62],
        [0.9, 0.62],
        [0.9, 0.9],
      ]
    : [
        [-2.32, 0.86],
        [-1.0, 0.9],
        [0.9, 0.9],
      ];
  return [
    [-2.3, 0.3],
    [-2.38, 0.62],
    ...top,
    [2.1, 0.84],
    [2.36, 0.74],
    [2.4, 0.34],
    [2.2, 0.22],
    [XF + RA, 0.22],
    ...arch(XF),
    [XF - RA, 0.22],
    [XR + RA, 0.22],
    ...arch(XR),
    [XR - RA, 0.22],
    [-2.1, 0.22],
  ];
}

// lit: headlights and taillights on (a car being driven after dark).
export function addCar(b, M, { paint = M.paint, type = 'convertible', lit = false } = {}) {
  b.object();
  const open = type === 'convertible';
  b.use(paint, CAST);
  b.profile(bodyProfile(open), -HALF, HALF);
  if (open) openCabin(b, M, paint);
  else closedCabin(b, M, paint, type === 'wagon');
  wheelsAndTrim(b, M, lit);
}

function openCabin(b, M, paint) {
  // Doors rise above the tub to the belt line. The tub starts behind the
  // rear arch (which tops out at y = 0.77) so the side profile stays simple.
  b.use(paint, CAST);
  b.box(-1.0, 0.62, HALF - 0.11, 0.9, 0.9, HALF);
  b.box(-1.0, 0.62, -HALF, 0.9, 0.9, -HALF + 0.11);
  // Cream interior.
  b.use(M.leather, CAST);
  b.box(-1.0, 0.62, -HALF + 0.11, 0.9, 0.66, HALF - 0.11, 'ny');
  for (const zc of [-0.42, 0.42]) {
    b.box(-0.4, 0.66, zc - 0.3, 0.15, 0.8, zc + 0.3);
    b.push();
    b.translate(-0.42, 0.66, zc);
    b.rotateZ(0.18);
    b.box(-0.12, 0, -0.29, 0.02, 0.56, 0.29);
    b.pop();
  }
  b.box(-0.98, 0.66, -0.7, -0.66, 0.76, 0.7);
  b.box(-1.0, 0.66, -0.7, -0.9, 0.98, 0.7);
  // Windshield: chrome frame, tinted glass.
  b.use(M.chrome, CAST | SMOOTH);
  for (const zc of [-0.8, 0.8]) b.tube([[0.9, 0.9, zc], [0.62, 1.33, zc]], [0.025, 0.025], 6);
  b.tube([[0.62, 1.33, -0.8], [0.62, 1.33, 0.8]], [0.025, 0.025], 6);
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
      const z0 = s > 0 ? HALF : -HALF - 0.012;
      const z1 = s > 0 ? HALF + 0.012 : -HALF;
      b.box(-2.2, 0.46, z0, 1.1, 0.8, z1);
    }
  }
}

function wheelsAndTrim(b, M, lit) {
  // Wheels with chrome hubcaps.
  for (const xc of [XF, XR]) {
    for (const side of [-1, 1]) {
      b.push();
      b.translate(xc, 0.34, side * (HALF - 0.12));
      b.rotateX((side * Math.PI) / 2);
      b.use(M.tire, CAST | SMOOTH);
      b.cylinder(0.34, 0.34, -0.12, 0.12, 16);
      b.use(M.chrome, CAST);
      b.cylinder(0.19, 0.17, 0.12, 0.14, 12);
      b.pop();
    }
  }
  // Bumpers, lights, grille.
  b.use(M.chrome, CAST);
  b.box(2.36, 0.26, -HALF + 0.04, 2.48, 0.4, HALF - 0.04);
  b.box(-2.48, 0.26, -HALF + 0.04, -2.34, 0.4, HALF - 0.04);
  b.box(2.37, 0.44, -0.42, 2.41, 0.6, 0.42);
  b.use(lit ? M.headlightLit : M.headlight, CAST | SMOOTH);
  for (const zc of [-0.66, 0.66]) {
    b.push();
    b.translate(2.37, 0.62, zc);
    b.rotateZ(-Math.PI / 2);
    b.cylinder(0.1, 0.1, 0, 0.04, 12);
    b.pop();
  }
  b.use(lit ? M.taillightLit : M.taillight, CAST);
  for (const s of [-1, 1]) b.box(-2.41, 0.6, s > 0 ? 0.5 : -0.82, -2.36, 0.72, s > 0 ? 0.82 : -0.5);
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

export function parkedCar(b, M, rng) {
  const [paint, type] = rng.pick(PARKED);
  addCar(b, M, { paint: M[paint], type });
}
