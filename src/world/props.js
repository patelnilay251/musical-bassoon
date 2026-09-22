// Things people leave behind: loungers, a towel, a book, an umbrella, a
// pool float, a car. Each is modeled in its own local frame; the world
// places it with the builder's transform stack.

import { CAST, DOUBLE, SMOOTH } from '../mesh.js';

// Lounger: length along local +z (head at z = 0), standing on y = 0.
export function addLounger(b, M, { towel = false, book = false } = {}) {
  b.object();
  b.use(M.loungerFrame, CAST);
  for (const [x, z] of [
    [-0.3, 0.12],
    [0.3, 0.12],
    [-0.3, 1.84],
    [0.3, 1.84],
  ]) {
    b.box(x - 0.03, 0, z - 0.03, x + 0.03, 0.3, z + 0.03);
  }
  b.box(-0.34, 0.27, 0, -0.29, 0.35, 1.95);
  b.box(0.29, 0.27, 0, 0.34, 0.35, 1.95);
  b.box(-0.29, 0.29, 0.62, 0.29, 0.34, 1.95);
  b.use(M.cushion, CAST);
  b.box(-0.3, 0.34, 0.66, 0.3, 0.42, 1.93);
  b.push();
  b.translate(0, 0.37, 0.66);
  b.rotateX(0.75);
  b.box(-0.3, -0.04, -0.74, 0.3, 0.05, 0);
  b.pop();
  if (towel) {
    b.object();
    b.use(M.towel, CAST);
    b.box(-0.27, 0.42, 0.92, 0.27, 0.445, 1.78);
    b.box(0.27, 0.16, 1.1, 0.29, 0.445, 1.62); // the end that slid over the side
  }
  if (book) {
    b.object();
    b.use(M.book, CAST);
    b.push();
    b.translate(-0.05, 0.445, 1.3);
    b.rotateY(0.5);
    b.box(-0.09, 0, -0.12, 0.09, 0.035, 0.12);
    b.use(M.pages, CAST);
    b.box(-0.085, 0.004, -0.115, 0.085, 0.031, 0.115, 'py ny');
    b.pop();
  }
}

export function addSideTable(b, M, { glass = false } = {}) {
  b.object();
  b.use(M.table, CAST | SMOOTH);
  b.cylinder(0.24, 0.24, 0.44, 0.48, 14);
  b.cylinder(0.04, 0.04, 0.02, 0.44, 8, { caps: false });
  b.cylinder(0.16, 0.16, 0, 0.03, 12);
  if (glass) {
    b.use(M.glassware, CAST | SMOOTH);
    b.push();
    b.translate(0.06, 0.48, -0.04);
    b.cylinder(0.035, 0.042, 0, 0.13, 10);
    b.pop();
  }
}

export function addUmbrella(b, M, open = true) {
  b.object();
  b.use(M.pole, CAST);
  b.cylinder(0.28, 0.24, 0, 0.08, 12);
  b.use(M.pole, CAST | SMOOTH);
  b.cylinder(0.025, 0.025, 0.08, 2.5, 8, { caps: false });
  const n = 8;
  if (open) {
    const R = 1.45;
    const apex = 2.62;
    const rim = 2.16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [R * Math.cos(a0), rim, -R * Math.sin(a0)];
      const p1 = [R * Math.cos(a1), rim, -R * Math.sin(a1)];
      b.use(i % 2 ? M.canvasA : M.canvasB, CAST | DOUBLE);
      b.tri([0, apex, 0], p0, p1);
      b.quad(p0, [p0[0], rim - 0.15, p0[2]], [p1[0], rim - 0.15, p1[2]], p1);
    }
    b.use(M.pole, CAST | SMOOTH);
    b.push();
    b.translate(0, apex, 0);
    b.sphere(0.05, 6, 4);
    b.pop();
  } else {
    b.use(M.canvasA, CAST | SMOOTH);
    b.cylinder(0.03, 0.15, 1.3, 2.45, n, { caps: false, matFor: (i) => (i % 2 ? M.canvasA : M.canvasB) });
    b.use(M.canvasB, CAST);
    b.cylinder(0.15, 0.0, 2.45, 2.62, n, { caps: false });
  }
}

// Torus float with red and white segments, lying flat.
export function addFloat(b, M, R = 0.48, r = 0.16) {
  b.object();
  const U = 16;
  const V = 8;
  const pt = (i, j) => {
    const th = (i / U) * Math.PI * 2;
    const ph = (j / V) * Math.PI * 2;
    const n = [Math.cos(ph) * Math.cos(th), Math.sin(ph), -Math.cos(ph) * Math.sin(th)];
    return { p: [R * Math.cos(th) + n[0] * r, n[1] * r, -R * Math.sin(th) + n[2] * r], n };
  };
  for (let i = 0; i < U; i++) {
    b.use(Math.floor(i / 2) % 2 ? M.floatA : M.floatB, CAST | SMOOTH);
    for (let j = 0; j < V; j++) {
      const a = pt(i, j);
      const c = pt(i + 1, j);
      const d = pt(i + 1, j + 1);
      const e = pt(i, j + 1);
      b.quad(a.p, c.p, d.p, e.p, null, [a.n, c.n, d.n, e.n]);
    }
  }
}

// Chrome pool ladder at an edge point; (ix, iz) points into the pool.
export function addLadder(b, M, x, z, ix, iz, deck, water) {
  b.object();
  b.use(M.chrome, CAST | SMOOTH);
  const lx = -iz;
  const lz = ix;
  for (const s of [-0.28, 0.28]) {
    const at = (out, y) => [x - ix * out + lx * s, y, z - iz * out + lz * s];
    const path = [
      at(0.5, deck),
      at(0.5, deck + 0.72),
      at(0.4, deck + 0.93),
      at(0.18, deck + 1.0),
      at(-0.04, deck + 0.9),
      at(-0.12, deck + 0.62),
      at(-0.14, deck + 0.2),
      at(-0.14, water - 0.8),
    ];
    b.tube(path, path.map(() => 0.024), 7);
  }
}

export function addDivingBoard(b, M) {
  b.object();
  b.use(M.board, CAST);
  b.box(-0.28, 0.45, -1.9, 0.28, 0.52, 0.9);
  b.use(M.trim, CAST);
  b.box(-0.24, 0, 0.3, 0.24, 0.45, 0.95);
}

export function addLamp(b, M, x, z, base = 0) {
  b.object();
  b.use(M.post, CAST | SMOOTH);
  b.push();
  b.translate(x, base, z);
  b.cylinder(0.06, 0.045, 0, 2.5, 8, { caps: false });
  b.cylinder(0.14, 0.12, 0, 0.18, 10);
  b.use(M.globe, CAST | SMOOTH);
  b.translate(0, 2.7, 0);
  b.sphere(0.21, 10, 7);
  b.pop();
  return { p: [x, base + 2.7, z], c: [1.0, 0.8, 0.52], r: 3.4, k: 0.95 };
}

// A late-seventies convertible, nose along local +x.
export function addCar(b, M) {
  b.object();
  const xf = 1.42;
  const xr = -1.48;
  const Ra = 0.43;
  const arch = (xc, fromFront) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = fromFront ? (i / 8) * Math.PI : Math.PI - (i / 8) * Math.PI;
      pts.push([xc + Ra * Math.cos(a), 0.34 + Ra * Math.sin(a)]);
    }
    return pts;
  };
  const profile = [
    [-2.3, 0.3],
    [-2.38, 0.62],
    [-2.32, 0.86],
    [-1.0, 0.9],
    [-1.0, 0.62],
    [0.9, 0.62],
    [0.9, 0.9],
    [2.1, 0.84],
    [2.36, 0.74],
    [2.4, 0.34],
    [2.2, 0.22],
    [xf + Ra, 0.22],
    ...arch(xf, true),
    [xf - Ra, 0.22],
    [xr + Ra, 0.22],
    ...arch(xr, true),
    [xr - Ra, 0.22],
    [-2.1, 0.22],
  ];
  const half = 0.92;
  b.use(M.paint, CAST);
  b.profile(profile, -half, half);
  // Doors rise above the tub to the belt line. The tub starts behind the
  // rear arch (which tops out at y = 0.77) so the side profile stays simple.
  b.box(-1.0, 0.62, half - 0.11, 0.9, 0.9, half);
  b.box(-1.0, 0.62, -half, 0.9, 0.9, -half + 0.11);
  // Cream interior.
  b.use(M.leather, CAST);
  b.box(-1.0, 0.62, -half + 0.11, 0.9, 0.66, half - 0.11, 'ny');
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
  b.use(M.glass, DOUBLE);
  b.quad([0.9, 0.9, -0.78], [0.9, 0.9, 0.78], [0.63, 1.32, 0.78], [0.63, 1.32, -0.78]);
  // Steering wheel.
  b.use(M.tire, CAST | SMOOTH);
  const ring = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ring.push([0.55 + 0.05 * Math.sin(a), 1.0 + 0.17 * Math.sin(a), -0.42 + 0.17 * Math.cos(a)]);
  }
  b.tube(ring, ring.map(() => 0.016), 5);
  // Wheels with chrome hubcaps.
  for (const xc of [xf, xr]) {
    for (const side of [-1, 1]) {
      b.push();
      b.translate(xc, 0.34, side * (half - 0.12));
      b.rotateX(side * Math.PI / 2);
      b.use(M.tire, CAST | SMOOTH);
      b.cylinder(0.34, 0.34, -0.12, 0.12, 16);
      b.use(M.chrome, CAST);
      b.cylinder(0.19, 0.17, 0.12, 0.14, 12);
      b.pop();
    }
  }
  // Bumpers, lights, grille.
  b.use(M.chrome, CAST);
  b.box(2.36, 0.26, -half + 0.04, 2.48, 0.4, half - 0.04);
  b.box(-2.48, 0.26, -half + 0.04, -2.34, 0.4, half - 0.04);
  b.box(2.37, 0.44, -0.42, 2.41, 0.6, 0.42);
  b.use(M.headlight, CAST | SMOOTH);
  for (const zc of [-0.66, 0.66]) {
    b.push();
    b.translate(2.37, 0.62, zc);
    b.rotateZ(-Math.PI / 2);
    b.cylinder(0.1, 0.1, 0, 0.04, 12);
    b.pop();
  }
  b.use(M.taillight, CAST);
  for (const s of [-1, 1]) b.box(-2.41, 0.6, s > 0 ? 0.5 : -0.82, -2.36, 0.72, s > 0 ? 0.82 : -0.5);
}
