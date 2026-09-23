// The small change of a street: parking meters, fire hydrants, newspaper
// boxes. Each stands on y = 0 in its own frame, its face toward local +z
// (the street); the scene turns it to face the road.

import { CAST, SMOOTH } from '../mesh.js';

// A single-head parking meter: a thin post, a rounded head, a window.
export function addMeter(b, M) {
  b.object();
  b.use(M.meterPost, CAST | SMOOTH);
  b.cylinder(0.032, 0.032, 0, 1.02, 6, { caps: false });
  b.use(M.meterPost, CAST);
  b.cylinder(0.07, 0.07, 0, 0.03, 8);
  b.use(M.meter, CAST);
  b.box(-0.075, 1.0, -0.06, 0.075, 1.24, 0.06);
  // The dome: a cylinder across the head, its lower half inside it.
  b.use(M.meter, CAST | SMOOTH);
  b.push();
  b.translate(0, 1.24, 0);
  b.rotateX(Math.PI / 2);
  b.cylinder(0.075, 0.075, -0.06, 0.06, 10);
  b.pop();
  b.use(M.carGlass, 0);
  b.quad([-0.05, 1.11, 0.061], [0.05, 1.11, 0.061], [0.05, 1.21, 0.061], [-0.05, 1.21, 0.061]);
  b.use(M.meterFlag, 0);
  b.quad([-0.035, 1.05, 0.061], [0.035, 1.05, 0.061], [0.035, 1.08, 0.061], [-0.035, 1.08, 0.061]);
}

// A fire hydrant: red barrel, white bonnet, a nozzle each side and the
// big pumper nozzle toward the street.
export function addHydrant(b, M) {
  b.object();
  b.use(M.paintRed, CAST | SMOOTH);
  b.cylinder(0.16, 0.16, 0, 0.06, 10);
  b.cylinder(0.12, 0.12, 0.06, 0.52, 10, { caps: false });
  b.use(M.paintWhite, CAST | SMOOTH);
  b.cylinder(0.145, 0.145, 0.52, 0.58, 10);
  b.push();
  b.translate(0, 0.58, 0);
  b.sphere(0.105, 10, 6);
  b.pop();
  b.cylinder(0.03, 0.03, 0.66, 0.72, 5);
  b.use(M.paintRed, CAST | SMOOTH);
  for (const s of [-1, 1]) {
    b.push();
    b.translate(s * 0.14, 0.38, 0);
    b.rotateZ(Math.PI / 2);
    b.cylinder(0.045, 0.045, -0.05, 0.05, 8);
    b.pop();
  }
  b.push();
  b.translate(0, 0.34, 0.12);
  b.rotateX(Math.PI / 2);
  b.cylinder(0.065, 0.065, -0.045, 0.045, 10);
  b.pop();
}

// A coin-operated newspaper box on short legs.
export function addNewsBox(b, M, paint) {
  b.object();
  b.use(M.meterPost, CAST);
  for (const x of [-0.2, 0.2]) for (const z of [-0.16, 0.16]) b.box(x - 0.02, 0, z - 0.02, x + 0.02, 0.36, z + 0.02);
  b.use(paint, CAST);
  b.box(-0.24, 0.36, -0.21, 0.24, 0.98, 0.21);
  b.box(-0.2, 0.98, -0.12, 0.2, 1.06, 0.1);
  b.use(M.carGlass, 0);
  b.quad([-0.18, 0.62, 0.211], [0.18, 0.62, 0.211], [0.18, 0.9, 0.211], [-0.18, 0.9, 0.211]);
  b.use(M.pages, 0);
  b.quad([-0.14, 0.64, 0.205], [0.14, 0.64, 0.205], [0.14, 0.8, 0.205], [-0.14, 0.8, 0.205]);
}
