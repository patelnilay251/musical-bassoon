// A modernist villa from a handful of rules on a one-meter grid:
// - a ground floor glazed toward the pool, the glass recessed under a lintel
// - an upper floor that may cantilever toward the water, but only as far as
//   a row of columns can carry it
// - thin roof slabs with deep eaves, so every facade gets one hard shadow line
// - one loud accent (a colored volume, wall, or stair tower) and one
//   shadow-making feature (a pergola or vertical fins)
//
// The front faces west (-x), toward the pool and the sea.

import { CAST, SMOOTH } from '../mesh.js';

export function addVilla(b, rng, M, DECK) {
  const F = rng.int(16, 22); // facade width along z
  const D = rng.int(9, 12); // depth along x
  const H0 = 3.3;
  const H1 = 3.1;
  const SLAB = 0.3;
  const z0 = -F / 2;
  const z1 = F / 2;
  const TOP0 = DECK + H0;
  const U0 = TOP0 + SLAB;
  const U1 = U0 + H1;
  const eaveF = 0.9; // ground-floor roof overhang at the front

  const F1 = F - rng.int(3, 7);
  const align = rng.pick([-1, 0, 1]);
  const uz0 = align < 0 ? z0 : align > 0 ? z1 - F1 : -F1 / 2;
  const uz1 = uz0 + F1;
  const cant = rng.pick([0, 2, 2.5, 3]);
  const ux0 = -cant;
  const ux1 = D - rng.int(1, 3);
  const accentMode = rng.pick(['upper', 'endwall', 'tower', 'wall']);
  const feature = rng.pick(['pergola', 'fins', 'pergola', 'none']);
  const wallMat = (isAccent) => (isAccent ? M.accent : M.wall);
  const lights = [];
  const footprint = [[ux0 - 1, D + 0.5, z0 - 0.6, z1 + 0.6]];

  // ---- ground floor
  const endW = rng.pick([1.2, 1.8, 2.4]);
  const endAccent = accentMode === 'endwall' ? rng.pick([0, 1]) : -1;
  b.use(M.wall, CAST);
  b.box(0.6, 0, z0, D, TOP0, z1);
  b.use(wallMat(endAccent === 0), CAST);
  b.box(0, 0, z0, 0.6, TOP0, z0 + endW);
  b.use(wallMat(endAccent === 1), CAST);
  b.box(0, 0, z1 - endW, 0.6, TOP0, z1);
  b.use(M.wall, CAST);
  b.box(0, TOP0 - 0.45, z0 + endW, 0.6, TOP0, z1 - endW, 'px');
  glazing(b, M, 0.58, z0 + endW, z1 - endW, DECK, TOP0 - 0.45, 2.4, lights, DECK);
  // Side windows and a sill each.
  for (const side of [-1, 1]) {
    const zf = side < 0 ? z0 - 0.01 : z1 + 0.01;
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const xc = D * ((i + 1) / (n + 1)) + 0.3;
      sideWindow(b, M, xc, zf, side, DECK + 1.0, DECK + 2.4, 0.8);
    }
  }
  // Back: an accent door and two windows facing the drive.
  b.object();
  b.use(M.door, CAST);
  b.quad([D + 0.02, 0, -0.6], [D + 0.02, 2.4, -0.6], [D + 0.02, 2.4, 0.6], [D + 0.02, 0, 0.6]);
  b.use(M.trim, CAST);
  b.box(D, 2.5, -1.4, D + 1.4, 2.7, 1.4); // entrance canopy
  for (const zc of [-F / 4 - 1, F / 4 + 1]) backWindow(b, M, D + 0.01, zc, 1.0, 2.4, 1.1);

  // ---- ground-floor roof slab (the terrace for the upper floor)
  b.use(M.trim, CAST);
  b.box(-eaveF, TOP0, z0 - 0.35, D + 0.3, U0, z1 + 0.35);
  if (cant > eaveF) {
    // Cantilevered floor and the columns that earn it.
    b.box(ux0 - 0.1, TOP0, uz0, -eaveF, U0, uz1);
    const span = uz1 - uz0 - 1;
    const cols = Math.max(2, Math.ceil(span / 4) + 1);
    b.use(M.wall, CAST | SMOOTH);
    for (let i = 0; i < cols; i++) {
      const zc = uz0 + 0.5 + (span * i) / (cols - 1);
      b.push();
      b.translate(ux0 + 0.45, DECK, zc);
      b.cylinder(0.16, 0.16, 0, TOP0 - DECK, 12, { caps: false });
      b.pop();
    }
  }

  // ---- upper floor with a ribbon window
  const upperAccent = accentMode === 'upper';
  b.use(wallMat(upperAccent), CAST);
  b.box(ux0 + 0.35, U0, uz0, ux1, U1, uz1);
  b.box(ux0, U0, uz0, ux0 + 0.35, U0 + 0.95, uz1, 'px');
  b.box(ux0, U1 - 0.55, uz0, ux0 + 0.35, U1, uz1, 'px');
  b.box(ux0, U0 + 0.95, uz0, ux0 + 0.35, U1 - 0.55, uz0 + 0.6, 'px');
  b.box(ux0, U0 + 0.95, uz1 - 0.6, ux0 + 0.35, U1 - 0.55, uz1, 'px');
  glazing(b, M, ux0 + 0.33, uz0 + 0.6, uz1 - 0.6, U0 + 0.95, U1 - 0.55, 2.0, null, 0);
  if (uz0 > z0 + 0.5) sideWindow(b, M, (ux0 + ux1) / 2, uz0 - 0.01, -1, U0 + 0.9, U0 + 2.3, 1.2);
  if (uz1 < z1 - 0.5) sideWindow(b, M, (ux0 + ux1) / 2, uz1 + 0.01, 1, U0 + 0.9, U0 + 2.3, 1.2);
  b.use(M.trim, CAST);
  b.box(ux0 - 1.0, U1, uz0 - 0.5, ux1 + 0.4, U1 + 0.28, uz1 + 0.5);

  // ---- roof-terrace parapets where the upper floor leaves the slab open
  const PH = 0.95;
  b.use(M.trim, CAST);
  if (uz0 - z0 > 0.8) b.box(-eaveF, U0, z0 - 0.35, -eaveF + 0.2, U0 + PH, uz0);
  if (z1 - uz1 > 0.8) b.box(-eaveF, U0, uz1, -eaveF + 0.2, U0 + PH, z1 + 0.35);
  if (uz0 > z0 + 0.5) b.box(-eaveF, U0, z0 - 0.35, D + 0.3, U0 + PH, z0 - 0.15);
  if (uz1 < z1 - 0.5) b.box(-eaveF, U0, z1 + 0.15, D + 0.3, U0 + PH, z1 + 0.35);
  b.box(D + 0.1, U0, z0 - 0.35, D + 0.3, U0 + PH, z1 + 0.35);

  // ---- accent element
  if (accentMode === 'tower') {
    const side = rng.pick([-1, 1]);
    const zc = side < 0 ? z0 - 1.3 : z1 + 1.3;
    const xc = D * 0.55;
    b.use(M.accent, CAST | SMOOTH);
    b.push();
    b.translate(xc, 0, zc);
    b.cylinder(1.5, 1.5, 0, U1 + 0.9, 28);
    b.pop();
    b.object();
    b.use(M.glass, CAST);
    b.box(xc - 1.56, DECK + 1.2, zc - 0.18, xc - 1.4, U1 - 0.2, zc + 0.18, 'px');
    footprint.push([xc - 1.7, xc + 1.7, zc - 1.7, zc + 1.7]);
  } else if (accentMode === 'wall') {
    const side = rng.pick([-1, 1]);
    const zc = side < 0 ? z0 + 0.15 : z1 - 0.15;
    const len = rng.range(5.5, 7.5);
    b.use(M.accent, CAST);
    b.box(-len, 0, zc - 0.15, 0, DECK + 2.7, zc + 0.15);
    footprint.push([-len - 0.5, 0, zc - 0.6, zc + 0.6]);
  }

  // ---- shadow-making feature
  if (feature === 'pergola') {
    // Over the widest open stretch of the roof terrace.
    const openA = uz0 - (z0 - 0.35);
    const openB = z1 + 0.35 - uz1;
    const [pz0, pz1] = openA > openB ? [z0 - 0.15, uz0 - 0.2] : [uz1 + 0.2, z1 + 0.15];
    if (pz1 - pz0 > 2.5) {
      const px0 = -eaveF + 0.3;
      const px1 = D - 0.5;
      const top = U0 + 2.5;
      b.use(M.trim, CAST);
      for (const [x, z] of [
        [px0, pz0],
        [px1, pz0],
        [px0, pz1],
        [px1, pz1],
      ]) {
        b.box(x - 0.08, U0, z - 0.08, x + 0.08, top, z + 0.08);
      }
      b.box(px0 - 0.1, top, pz0 - 0.1, px1 + 0.1, top + 0.18, pz0 + 0.08);
      b.box(px0 - 0.1, top, pz1 - 0.08, px1 + 0.1, top + 0.18, pz1 + 0.1);
      for (let x = px0; x <= px1 + 1e-6; x += 0.55) b.box(x - 0.04, top + 0.18, pz0 - 0.3, x + 0.04, top + 0.36, pz1 + 0.3);
    }
  } else if (feature === 'fins') {
    b.use(M.trim, CAST);
    for (let z = uz0 + 0.45; z < uz1 - 0.3; z += 0.9) b.box(ux0 - 0.5, U0, z - 0.05, ux0, U1, z + 0.05);
  }

  return {
    F,
    D,
    z0,
    z1,
    TOP0,
    U0,
    U1,
    ux0,
    ux1,
    uz0,
    uz1,
    eaveF,
    cant,
    accentMode,
    feature,
    lights,
    footprint,
    terrace: { x: -eaveF + 1.2, y: U0, z: uz0 > z0 + 2 ? (z0 + uz0) / 2 : (uz1 + z1) / 2 },
  };
}

// A run of glass panes facing -x at plane x, with mullions every ~pitch.
function glazing(b, M, x, za, zb, y0, y1, pitch, lights, deck) {
  const n = Math.max(1, Math.round((zb - za) / pitch));
  const w = (zb - za) / n;
  for (let i = 0; i < n; i++) {
    const zl = za + w * i;
    const zr = zl + w;
    b.object();
    b.use(M.glass, CAST);
    b.quad([x, y0, zr], [x, y1, zr], [x, y1, zl], [x, y0, zl]);
    if (lights) lights.push({ p: [x - 0.8, deck + 1.2, (zl + zr) / 2], c: [1, 0.72, 0.42], r: 2.2, k: 0.55 });
  }
  b.use(M.frame, CAST);
  for (let i = 0; i <= n; i++) {
    const zm = za + w * i;
    b.box(x - 0.07, y0, zm - 0.04, x + 0.01, y1, zm + 0.04);
  }
  b.box(x - 0.1, y0, za, x + 0.01, y0 + 0.06, zb);
}

// A window on a side wall (normal +z or -z), with a projecting sill.
function sideWindow(b, M, xc, zf, side, y0, y1, halfW) {
  b.object();
  b.use(M.glass, CAST);
  const xa = xc - halfW;
  const xb = xc + halfW;
  if (side > 0) b.quad([xa, y0, zf], [xb, y0, zf], [xb, y1, zf], [xa, y1, zf]);
  else b.quad([xb, y0, zf], [xa, y0, zf], [xa, y1, zf], [xb, y1, zf]);
  b.use(M.trim, CAST);
  const zs = zf + side * 0.12;
  b.box(xa - 0.1, y0 - 0.1, Math.min(zf, zs), xb + 0.1, y0, Math.max(zf, zs));
}

// A window on the back wall (normal +x).
function backWindow(b, M, xf, zc, y0, y1, halfW) {
  b.object();
  b.use(M.glass, CAST);
  b.quad([xf, y0, zc - halfW], [xf, y1, zc - halfW], [xf, y1, zc + halfW], [xf, y0, zc + halfW]);
  b.use(M.trim, CAST);
  b.box(xf, y0 - 0.1, zc - halfW - 0.1, xf + 0.12, y0, zc + halfW + 0.1);
}
