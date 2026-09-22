// The resort, assembled from rules. One seed gives one villa; the `props`
// only move the things people leave behind, so every page of the book shows
// the same place.
//
// Axes: +x east, +y up, +z south. The sea lies to the west, past the parapet.

import { MeshBuilder, finalizeMesh, CAST, DOUBLE, UNDERWATER, NOREFLECT, DISTANT } from '../mesh.js';
import { Rng, hashInts, hex, clamp, lerp } from '../math.js';
import { makeClouds, SEA_LEVEL } from '../sky.js';
import { makeMaterials } from './materials.js';
import { addVilla } from './villa.js';
import { addPalm } from './palm.js';
import { addLounger, addSideTable, addUmbrella, addFloat, addLadder, addDivingBoard, addLamp, addCar } from './props.js';

export const DEFAULT_SEED = 1981;
export const DECK = 0.15;

// Property bounds in meters.
const PX0 = -30;
const PX1 = 32;
const PZ0 = -28;
const PZ1 = 28;

export const DEFAULT_PROPS = {
  towel: true,
  book: true,
  glass: true,
  umbrella: 'open', // 'open' | 'closed'
  car: true,
  float: 0.3, // 0..1 along its drift across the pool, or null
};

export function buildWorld(seed = DEFAULT_SEED, props = {}) {
  const P = { ...DEFAULT_PROPS, ...props };
  // Independent streams per subsystem: changing one never reshuffles another.
  const sub = (salt) => new Rng(hashInts(seed, salt));
  const { list: materials, M } = makeMaterials(sub(1));
  const b = new MeshBuilder();
  const lights = [];

  // ---- villa
  const V = addVilla(b, sub(2), M, DECK);
  lights.push(...V.lights);

  // ---- pool, sized from the facade it faces
  const pr = sub(3);
  const front = Math.max(V.cant, V.eaveF);
  const px1 = -(front + pr.range(3.6, 4.6));
  const px0 = px1 - pr.int(6, 8);
  const pl = pr.int(12, 17);
  const zc = clamp(pr.range(-2.5, 2.5), V.z0 + pl / 2 - 4, V.z1 - pl / 2 + 4);
  const pz0 = zc - pl / 2;
  const pz1 = zc + pl / 2;
  const WATER = DECK - 0.1;
  const FLOOR = -1.45;
  const dx0 = px0 - pr.range(4.5, 6);
  const dx1 = 0.6;
  const dz0 = Math.min(V.z0 - 2.5, pz0 - 3.5);
  const dz1 = Math.max(V.z1 + 2.5, pz1 + 3.5);
  const C = 0.4; // coping width

  b.use(M.deck, CAST);
  b.box(dx0, 0, dz0, px0 - C, DECK, dz1, 'ny');
  b.box(px1 + C, 0, dz0, dx1, DECK, dz1, 'ny');
  b.box(px0 - C, 0, dz0, px1 + C, DECK, pz0 - C, 'ny');
  b.box(px0 - C, 0, pz1 + C, px1 + C, DECK, dz1, 'ny');
  b.use(M.coping, CAST);
  const CT = DECK + 0.03;
  b.box(px0 - C, 0, pz0 - C, px0, CT, pz1 + C, 'ny');
  b.box(px1, 0, pz0 - C, px1 + C, CT, pz1 + C, 'ny');
  b.box(px0, 0, pz0 - C, px1, CT, pz0, 'ny');
  b.box(px0, 0, pz1, px1, CT, pz1 + C, 'ny');
  // Basin: hidden under the water, but it casts the shadows the refracted
  // rays find on the floor.
  b.use(M.poolTile, CAST | UNDERWATER);
  b.quad([px0, FLOOR, pz0], [px0, 0, pz0], [px0, 0, pz1], [px0, FLOOR, pz1]);
  b.quad([px1, FLOOR, pz1], [px1, 0, pz1], [px1, 0, pz0], [px1, FLOOR, pz0]);
  b.quad([px0, FLOOR, pz0], [px1, FLOOR, pz0], [px1, 0, pz0], [px0, 0, pz0]);
  b.quad([px1, FLOOR, pz1], [px0, FLOOR, pz1], [px0, 0, pz1], [px1, 0, pz1]);
  b.quad([px0, FLOOR, pz0], [px0, FLOOR, pz1], [px1, FLOOR, pz1], [px1, FLOOR, pz0]);
  b.use(M.water, NOREFLECT);
  b.quad([px0, WATER, pz0], [px0, WATER, pz1], [px1, WATER, pz1], [px1, WATER, pz0]);
  const ladderX = (px0 + px1) / 2 + 1.6;
  addLadder(b, M, ladderX, pz0, 0, 1, DECK, WATER);
  const board = pr.chance(0.6);
  if (board) {
    b.push();
    b.translate((px0 + px1) / 2, DECK, pz1 + 0.35);
    addDivingBoard(b, M);
    b.pop();
  }
  const pool = {
    x0: px0,
    x1: px1,
    z0: pz0,
    z1: pz1,
    waterY: WATER,
    floorY: FLOOR,
    tile: hex('#c4f0f2'),
    lane: hex('#2a5d9c'),
    water: hex('#12a4d4'),
    glow: hex('#2fb8d6'),
    // Pool-sized ripples (wavelengths of one to two meters).
    waves: [
      { kx: 3.1, kz: 0.9, w: 1.0, p: pr.range(0, 6.28), a: 0.012 },
      { kx: -1.4, kz: 3.6, w: 1.4, p: pr.range(0, 6.28), a: 0.008 },
      { kx: 5.3, kz: -2.2, w: 2.3, p: pr.range(0, 6.28), a: 0.004 },
      { kx: 2.0, kz: 1.1, w: 0.7, p: pr.range(0, 6.28), a: 0.01 },
    ],
  };
  lights.push({ p: [(px0 + px1) / 2, WATER + 0.5, zc], c: [0.3, 0.88, 1.0], r: 4.5, k: 0.9 });

  // ---- loungers facing the water, an umbrella, a table
  const hx = -front - 0.45; // head end, just west of any columns
  const zL = clamp(zc + pr.range(-2, 2), pz0 + 2.4, pz1 - 2.4);
  const lzs = [zL - 1.8, zL - 0.6, zL + 0.6];
  lzs.forEach((z, i) => {
    b.push();
    b.translate(hx, DECK, z);
    b.rotateY(-Math.PI / 2);
    addLounger(b, M, { towel: P.towel && i === 1, book: P.book && i === 2 });
    b.pop();
  });
  b.push();
  b.translate(hx - 0.35, DECK, zL);
  addSideTable(b, M, { glass: P.glass });
  b.pop();
  const umb = { x: hx - 0.9, z: zL + 1.85 };
  b.push();
  b.translate(umb.x, DECK, umb.z);
  addUmbrella(b, M, P.umbrella !== 'closed');
  b.pop();

  // ---- the float, drifting from the deep end toward the shallow end
  let float = null;
  if (P.float !== null && P.float !== undefined) {
    const t = clamp(P.float, 0, 1);
    float = {
      x: lerp(px1 - 1.3, px0 + 1.5, t) + 0.5 * Math.sin(t * 4.0),
      z: lerp(pz0 + 1.8, pz1 - 1.8, t) + 0.9 * Math.sin(t * 6.2),
    };
    b.push();
    b.translate(float.x, WATER + 0.03, float.z);
    b.rotateY(t * 2.3);
    addFloat(b, M);
    b.pop();
  }

  // ---- drive, car, lamps
  const drive = { x0: V.D, x1: PX1, z0: -3.2, z1: 3.2 };
  b.use(M.drive, CAST);
  b.box(drive.x0, 0, drive.z0, drive.x1, 0.04, drive.z1, 'ny');
  const car = { x: V.D + 5.8, z: -0.6 };
  if (P.car) {
    b.push();
    b.translate(car.x, 0.04, car.z);
    b.rotateY(Math.PI + 0.06);
    addCar(b, M);
    b.pop();
  }
  lights.push(addLamp(b, M, dx0 + 0.8, dz0 + 0.8, DECK));
  lights.push(addLamp(b, M, dx0 + 0.8, dz1 - 0.8, DECK));
  lights.push(addLamp(b, M, V.D + 7, 4.1));
  lights.push(addLamp(b, M, V.D + 15, 4.1));

  // ---- lawn, walls, parapets. The property is a headland: sea to the
  // north, west and south behind low walls; the mainland and the gate east.
  // The lawn runs under the deck and the pool, so it must not cast shadows
  // (it would black out the pool floor).
  b.use(M.lawn, 0);
  b.quad([PX0, 0, PZ0], [PX0, 0, PZ1], [PX1, 0, PZ1], [PX1, 0, PZ0]);
  const low = 1.1;
  b.use(M.boundary, CAST);
  b.box(PX0 - 0.3, 0, PZ0 - 0.3, PX1 + 0.3, low, PZ0);
  b.box(PX0 - 0.3, 0, PZ1, PX1 + 0.3, low, PZ1 + 0.3);
  b.box(PX0 - 0.3, 0, PZ0, PX0, low, PZ1);
  b.box(PX1, 0, PZ0, PX1 + 0.3, 2.4, drive.z0 - 0.4);
  b.box(PX1, 0, drive.z1 + 0.4, PX1 + 0.3, 2.4, PZ1);
  b.use(M.trim, CAST);
  b.box(PX0 - 0.36, low, PZ0 - 0.36, PX1 + 0.36, low + 0.07, PZ0 + 0.06);
  b.box(PX0 - 0.36, low, PZ1 - 0.06, PX1 + 0.36, low + 0.07, PZ1 + 0.36);
  b.box(PX0 - 0.36, low, PZ0, PX0 + 0.06, low + 0.07, PZ1);
  b.box(PX1 - 0.06, 2.4, PZ0, PX1 + 0.36, 2.48, drive.z0 - 0.4);
  b.box(PX1 - 0.06, 2.4, drive.z1 + 0.4, PX1 + 0.36, 2.48, PZ1);
  for (const z of [drive.z0 - 0.4, drive.z1 + 0.4]) b.box(PX1 - 0.15, 0, z - 0.3, PX1 + 0.45, 2.9, z + 0.3);

  // ---- beyond: cliffs into the sea, the mainland, hills, islands
  const FAR = 6000;
  const E = PX1 + 0.3;
  b.use(M.field, 0);
  b.quad([E, 0, -FAR], [E, 0, FAR], [FAR, 0, FAR], [FAR, 0, -FAR]);
  b.use(M.cliff, 0);
  const cx0 = PX0 - 0.3;
  const cz0 = PZ0 - 0.3;
  const cz1 = PZ1 + 0.3;
  b.quad([cx0, SEA_LEVEL, cz1], [cx0, 0, cz1], [cx0, 0, cz0], [cx0, SEA_LEVEL, cz0]); // west, faces -x
  b.quad([E, SEA_LEVEL, cz0], [cx0, SEA_LEVEL, cz0], [cx0, 0, cz0], [E, 0, cz0]); // north, faces -z
  b.quad([cx0, SEA_LEVEL, cz1], [E, SEA_LEVEL, cz1], [E, 0, cz1], [cx0, 0, cz1]); // south, faces +z
  b.quad([E, SEA_LEVEL, cz0], [E, 0, cz0], [E, 0, -FAR], [E, SEA_LEVEL, -FAR]); // mainland coast, north
  b.quad([E, SEA_LEVEL, FAR], [E, 0, FAR], [E, 0, cz1], [E, SEA_LEVEL, cz1]); // mainland coast, south
  const hr = sub(4);
  b.use(M.hill, DISTANT);
  for (let i = 0; i < 7; i++) {
    ridge(b, hr, hr.range(1800, 5200), hr.range(-3800, 3800), hr.range(1200, 3000), hr.range(500, 1100), hr.range(160, 620), 0);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      ridge(b, hr, hr.range(600, 2600), side * hr.range(1800, 4200), hr.range(1400, 2600), hr.range(600, 1000), hr.range(120, 380), 0, true);
    }
  }
  b.use(M.island, DISTANT);
  for (let i = 0; i < 4; i++) {
    const a = hr.range(-1.2, 1.2);
    const d = hr.range(3500, 8000);
    ridge(b, hr, -Math.cos(a) * d, Math.sin(a) * d, hr.range(600, 1800), hr.range(300, 600), hr.range(40, 200), SEA_LEVEL, true);
  }

  // ---- palms, placed by rejection sampling around everything built
  const keepOut = [
    ...V.footprint,
    [px0 - C - 1, px1 + C + 1, pz0 - C - 1, pz1 + C + 1],
    [hx - 2.4, hx + 0.6, lzs[0] - 0.8, umb.z + 1.6],
    [drive.x0, drive.x1 + 1, drive.z0 - 1.2, drive.z1 + 1.2],
    [PX0 - 1, PX1 + 1, PZ0 - 1, PZ0 + 1.2],
    [PX0 - 1, PX1 + 1, PZ1 - 1.2, PZ1 + 1],
    [PX0 - 1, PX0 + 1.4, PZ0, PZ1],
  ];
  const palms = [];
  const ok = (x, z) => {
    for (const [a, c, d, e] of keepOut) if (x > a && x < c && z > d && z < e) return false;
    for (const p of palms) if (Math.hypot(p.x - x, p.z - z) < 3.4) return false;
    return true;
  };
  const plant = (rng, zone, n, lean) => {
    let tries = 0;
    let placed = 0;
    while (placed < n && tries++ < 400) {
      const x = rng.range(zone[0], zone[1]);
      const z = rng.range(zone[2], zone[3]);
      if (!ok(x, z)) continue;
      const leanAz = lean(x, z) + rng.range(-0.6, 0.6);
      const onDeck = x > dx0 && x < dx1 && z > dz0 && z < dz1;
      const r = rng.fork(placed + 17);
      const info = addPalm(b, r, M, x, z, { leanAz, ground: onDeck ? DECK : 0 });
      palms.push({ x, z, ...info });
      placed++;
    }
  };
  const lr = sub(5);
  plant(lr, [PX0 + 2, dx0 - 0.5, PZ0 + 2.5, PZ1 - 2.5], lr.int(4, 5), () => Math.PI);
  plant(lr, [dx0 - 1.5, 0, dz0 - 3, dz0 + 1.5], lr.int(1, 2), () => -Math.PI / 2 - 0.4);
  plant(lr, [dx0 - 1.5, 0, dz1 - 1.5, dz1 + 3], lr.int(1, 2), () => Math.PI / 2 + 0.4);
  plant(lr, [0, V.D + 5, PZ0 + 2.5, V.z0 - 2], lr.int(1, 2), () => -Math.PI / 2);
  plant(lr, [0, V.D + 5, V.z1 + 2, PZ1 - 2.5], lr.int(1, 2), () => Math.PI / 2);
  plant(lr, [V.D + 3, PX1 - 2, drive.z1 + 1.3, drive.z1 + 3.5], lr.int(2, 3), () => lr.range(0, 6.28));
  plant(lr, [V.D + 3, PX1 - 2, drive.z0 - 3.5, drive.z0 - 1.3], lr.int(1, 2), () => lr.range(0, 6.28));

  const mesh = finalizeMesh(b);
  return {
    seed,
    props: P,
    mesh,
    materials,
    clouds: makeClouds(sub(6)),
    pool,
    lights,
    shadowBox: { min: [PX0 - 1, -2, PZ0 - 1], max: [PX1 + 1, 16, PZ1 + 1] },
    layout: {
      bounds: { x0: PX0, x1: PX1, z0: PZ0, z1: PZ1 },
      deck: { x0: dx0, x1: dx1, z0: dz0, z1: dz1, y: DECK },
      villa: V,
      pool,
      loungers: { hx, zs: lzs },
      umbrella: umb,
      drive,
      car,
      float,
      board,
      palms,
    },
  };
}

// A faceted ridge: a row of peaks between two ground lines, flat shaded so
// each slope reads as one tone. `alongX` turns it to run east-west.
function ridge(b, rng, x, z, width, depth, height, base, alongX = false) {
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
