// Roadside signs. Letters are painted channel letters with a neon tube laid
// in every stroke: readable by day, burning by night. Signs are modeled
// facing +z with their foot at the origin; lights come back in world space.

import { CAST, SMOOTH } from '../mesh.js';
import { addText, textWidth } from './font.js';

// Painted letters with neon tubes on top, in the plane z = 0 facing +z.
// `neon` null leaves the tubes dark (a sign switched off).
export function neonWord(b, M, text, { size, paint, neon, stroke = size * 0.2, align = 'center', dark = M.signCream } = {}) {
  b.use(paint, CAST);
  addText(b, text, { size, mode: 'box', stroke, depth: 0.04, align });
  b.use(neon ?? dark, CAST);
  addText(b, text, { size, mode: 'tube', stroke: stroke * 0.36, depth: 0.075, align });
}

// Letters stacked top to bottom, centered on x = 0, first one at `top`.
function stacked(b, M, text, top, size, gap, opts) {
  let y = top - size;
  for (const ch of text) {
    b.push();
    b.translate(0, y, 0);
    neonWord(b, M, ch, { size, ...opts });
    b.pop();
    y -= size + gap;
  }
}

// A five-pointed star, flat, in the xy plane, `r` to the points.
function starPoly(r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.44 : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

/**
 * The motel pylon: two posts, a tall panel with the word stacked down it,
 * a star on top, and a VACANCY box whose NO lights up when the house is
 * full. Double-faced. Returns the lights it throws after dark.
 */
export function addMotelSign(b, M, { word = 'MOTEL', noVacancy = false } = {}) {
  const lights = [];
  const pw = 1.5;
  const pt = 10.5;
  const pb = 4.4;
  const pz = 0.2;
  b.object();
  b.use(M.trim, CAST);
  for (const x of [-0.42, 0.42]) b.box(x - 0.11, 0, -0.11, x + 0.11, pt + 0.35, 0.11);
  b.use(M.signTeal, CAST);
  b.box(-pw / 2, pb, -pz, pw / 2, pt, pz);
  b.use(M.signCream, CAST);
  b.box(-pw / 2 - 0.08, pt, -pz - 0.04, pw / 2 + 0.08, pt + 0.14, pz + 0.04);
  b.box(-pw / 2 - 0.08, pb - 0.14, -pz - 0.04, pw / 2 + 0.08, pb, pz + 0.04);
  for (const s of [1, -1]) {
    b.push();
    if (s < 0) b.rotateY(Math.PI);
    b.translate(0, 0, pz);
    stacked(b, M, word, pt - 0.32, 0.9, 0.24, { paint: M.signCream, neon: M.neonPink, stroke: 0.19 });
    b.pop();
    lights.push({ p: b.xf([0, (pt + pb) / 2, s * 1.4]), c: [1.0, 0.36, 0.66], r: 5, k: 1.1 });
  }
  // The star on a short mast.
  b.use(M.trim, CAST | SMOOTH);
  b.tube([[0, pt + 0.14, 0], [0, pt + 0.9, 0]], [0.06, 0.05], 6);
  b.push();
  b.translate(0, pt + 1.55, 0);
  b.use(M.butter, CAST);
  b.profile(starPoly(0.75), -0.09, 0.09);
  b.use(M.neonWhite, CAST);
  const star = starPoly(0.62);
  for (const s of [1, -1]) {
    const pts = star.map(([x, y]) => [x, y, s * 0.12]);
    pts.push(pts[0]);
    b.tube(pts, pts.map(() => 0.035), 5);
  }
  b.pop();
  lights.push({ p: b.xf([0, pt + 1.55, 0.8]), c: [1.0, 0.9, 0.7], r: 3, k: 0.7 });
  // VACANCY, and the NO beside it.
  const vy0 = 3.15;
  const vy1 = 3.95;
  const vw = 3.1;
  b.use(M.signCream, CAST);
  b.box(-vw / 2, vy0, -0.14, vw / 2, vy1, 0.14);
  b.box(-vw / 2 - 1.05, vy0, -0.14, -vw / 2 - 0.1, vy1, 0.14);
  b.use(M.signRed, CAST);
  b.box(-vw / 2 - 1.12, vy0 - 0.08, -0.16, vw / 2 + 0.07, vy0, 0.16);
  for (const s of [1, -1]) {
    b.push();
    if (s < 0) b.rotateY(Math.PI);
    b.push();
    b.translate(0, vy0 + 0.2, 0.14);
    neonWord(b, M, 'VACANCY', { size: 0.42, paint: M.signRed, neon: M.neonRed, stroke: 0.085 });
    b.pop();
    b.push();
    b.translate(s * (-vw / 2 - 0.575), vy0 + 0.2, 0.14);
    // Unpainted: by day the NO is only a pale tube, by night it burns
    // only when the house is full.
    neonWord(b, M, 'NO', { size: 0.42, paint: M.signCream, neon: noVacancy ? M.neonRed : null, dark: M.signCream, stroke: 0.085 });
    b.pop();
    b.pop();
    lights.push({ p: b.xf([0, 3.5, s * 1.1]), c: [1.0, 0.3, 0.22], r: 3.2, k: 0.9 });
  }
  return lights;
}

// A painted sign board with a word on it, facing +z, centered on x = 0.
export function addBoard(b, M, text, { size = 0.5, board = M.signCream, paint = M.signRed, neon = null, pad = 0.25, depth = 0.12 } = {}) {
  const w = (textWidth(text) * size) / 6 + pad * 2;
  const h = size + pad * 2;
  b.use(board, CAST);
  b.box(-w / 2, 0, -depth, w / 2, h, 0);
  b.push();
  b.translate(0, pad, 0);
  neonWord(b, M, text, { size, paint, neon });
  b.pop();
  return { w, h };
}
