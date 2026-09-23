// The motel on the Coast Highway: two stories of rooms behind an open
// walkway, doors in five colors, a pool behind a low white wall, an office
// under a flying canopy, and a pylon that says MOTEL all night. Across the
// road, a strip of sand and the sea.
//
// Axes: +x east, +y up, +z south. The rooms face west, toward the road.

import { MeshBuilder, finalizeMesh, CAST, DOUBLE, SMOOTH, UNDERWATER, NOREFLECT } from '../mesh.js';
import { Rng, hashInts, hex } from '../math.js';
import { makeSky } from '../sky.js';
import { makeMaterials } from '../world/materials.js';
import { addFanPalm } from '../world/fanpalm.js';
import { addPalm } from '../world/palm.js';
import { addCar, parkedCar } from '../world/cars.js';
import { addLounger, addUmbrella, addLadder, addSideTable } from '../world/props.js';
import { hills, railing, lampPost } from '../world/common.js';
import { addMotelSign, neonWord } from '../world/signs.js';
import { level } from '../camera.js';

export const NAME = 'The Motel';
// Compositions, the first one the place's hero.
export const VIEWS = ['front', 'walkway', 'pool', 'road'];
const SEED = 1979;
const SEA = -4;

// roomLight: the visitor's window, 0 (dark) to 1 (lit).
export const DEFAULT_PROPS = { car: true, noVacancy: false, roomLight: 0 };

const ROOM = 4; // room width along z
const N = 11; // rooms per floor
const Z0 = -(N * ROOM) / 2;
const Z1 = (N * ROOM) / 2;
const DEPTH = 9;
const F1 = 3.25; // upper floor level
const TOP = 6.3; // underside of the roof
const WALK = 1.9; // walkway depth, in front of the upper rooms
const FAR = 6000;

const DOORS = ['doorRed', 'doorYellow', 'doorBlue', 'doorGreen', 'doorPink'];
const VISITOR_ROOM = 7; // z 6..10, in front of the third stall

export function build(props = {}) {
  const P = { ...DEFAULT_PROPS, ...props };
  const sub = (salt) => new Rng(hashInts(SEED, salt));
  const { list: materials, M } = makeMaterials(sub(1));
  const b = new MeshBuilder();
  const lights = [];

  // ---- the block
  b.use(M.stucco, CAST);
  b.box(0, 0, Z0, DEPTH, TOP, Z1);
  // Walkway slab with a salmon edge, and the roof with a deep fascia.
  b.use(M.trim, CAST);
  b.box(-WALK, F1 - 0.28, Z0 - 0.1, 0, F1, Z1 + 0.1);
  b.box(-WALK - 0.2, TOP, Z0 - 0.45, DEPTH + 0.4, TOP + 0.26, Z1 + 0.45);
  b.use(M.salmon, CAST);
  b.box(-WALK - 0.05, F1 - 0.34, Z0 - 0.1, -WALK, F1 + 0.02, Z1 + 0.1);
  b.box(-WALK - 0.28, TOP - 0.18, Z0 - 0.5, -WALK - 0.2, TOP + 0.42, Z1 + 0.5);
  for (const z of [Z0 - 0.5, Z1 + 0.45]) b.box(-WALK - 0.2, TOP - 0.18, z, DEPTH + 0.4, TOP + 0.42, z + 0.05);
  // Posts at every party wall, both floors.
  b.use(M.trim, CAST);
  for (let k = 0; k <= N; k++) {
    const z = Z0 + k * ROOM;
    b.box(-WALK + 0.06, 0, z - 0.09, -WALK + 0.24, F1 - 0.28, z + 0.09);
    b.box(-WALK + 0.06, F1, z - 0.07, -WALK + 0.2, TOP, z + 0.07);
  }
  // Picket railing along the walkway: its shadow is the motel's pattern.
  pickets(b, M, -WALK + 0.1, F1, Z0 + 0.1, Z1 - 0.1);
  // Rooms. The visitor has the ground-floor room behind their stall.
  for (const [floor, y0] of [
    [0, 0],
    [1, F1],
  ]) {
    for (let k = 0; k < N; k++) {
      const z = Z0 + k * ROOM;
      const glass = floor === 0 && k === VISITOR_ROOM ? M.visitorGlass : M.roomGlass;
      room(b, M, z, y0, M[DOORS[(k + floor * 2) % DOORS.length]], glass, lights);
    }
  }
  // End walls: a stripe of color at the south corner, windows north.
  b.use(M.butter, CAST);
  b.box(DEPTH - 3.2, 0, Z1, DEPTH - 2.0, TOP, Z1 + 0.03);
  b.use(M.mint, CAST);
  b.box(DEPTH - 2.0, 0, Z1, DEPTH - 0.8, TOP, Z1 + 0.03);
  b.use(M.salmon, CAST);
  b.box(DEPTH - 0.8, 0, Z1, DEPTH, TOP, Z1 + 0.03);
  // Sidewalk under the walkway.
  b.use(M.sidewalk, CAST);
  b.box(-WALK - 0.4, 0, Z0 - 6, 0, 0.12, Z1 + 1, 'ny');

  // ---- stairs at the north end, down along the walkway line
  const run = 5.6;
  const steps = 18;
  b.use(M.trim, CAST);
  for (let i = 0; i < steps; i++) {
    const y = F1 - ((i + 1) * F1) / steps;
    const z1 = Z0 - (i * run) / steps;
    b.box(-WALK + 0.15, y, z1 - run / steps - 0.02, -0.15, y + 0.06, z1);
  }
  b.use(M.salmon, CAST | DOUBLE);
  for (const x of [-WALK + 0.12, -0.12]) {
    b.quad([x, F1, Z0], [x, F1 - 0.45, Z0], [x, -0.1, Z0 - run], [x, 0.35, Z0 - run]);
  }
  railing(b, M.rail, [[-WALK + 0.12, F1, Z0 - 0.05], [-WALK + 0.12, 0.2, Z0 - run]], { h: 0.95, pitch: 1.5, mid: false });

  // ---- the office, under a flying canopy
  const ox0 = -6;
  const oz0 = Z1 + 3;
  const oz1 = Z1 + 11;
  b.use(M.stucco, CAST);
  b.box(ox0 + 0.3, 0, oz0, 5, 3.4, oz1);
  b.object();
  b.use(M.glass, CAST);
  b.quad([ox0 + 0.29, 0.12, oz1 - 0.6], [ox0 + 0.29, 2.9, oz1 - 0.6], [ox0 + 0.29, 2.9, oz0 + 0.6], [ox0 + 0.29, 0.12, oz0 + 0.6]);
  b.use(M.frame, CAST);
  for (let z = oz0 + 0.6; z <= oz1 - 0.6 + 1e-6; z += (oz1 - oz0 - 1.2) / 4) b.box(ox0 + 0.22, 0.12, z - 0.04, ox0 + 0.31, 2.9, z + 0.04);
  b.use(M.trim, CAST);
  b.box(ox0 - 9.5, 3.4, oz0 + 0.5, 5.4, 3.68, oz1 - 0.5);
  b.use(M.salmon, CAST);
  b.box(ox0 - 9.58, 3.3, oz0 + 0.45, ox0 - 9.5, 3.76, oz1 - 0.45);
  b.use(M.trim, CAST | SMOOTH);
  for (const z of [oz0 + 1.2, oz1 - 1.2]) {
    b.push();
    b.translate(ox0 - 8.9, 0, z);
    b.cylinder(0.11, 0.11, 0, 3.4, 10, { caps: false });
    b.pop();
  }
  b.push();
  b.translate(ox0 - 9.58, 3.36, (oz0 + oz1) / 2);
  b.rotateY(-Math.PI / 2);
  neonWord(b, M, 'OFFICE', { size: 0.34, paint: M.signNavy, neon: M.neonCyan, stroke: 0.07 });
  b.pop();
  lights.push({ p: [ox0 - 1.5, 1.4, (oz0 + oz1) / 2], c: [1, 0.78, 0.5], r: 4, k: 0.8 });
  lights.push({ p: [ox0 - 9.9, 3.2, (oz0 + oz1) / 2], c: [0.35, 0.9, 1.0], r: 2.4, k: 0.7 });

  // ---- the lot: asphalt, stall lines, and whoever is staying
  const LX0 = -29;
  b.use(M.lot, 0);
  b.quad([LX0, 0, -40], [LX0, 0, 48], [DEPTH + 0.4, 0, 48], [DEPTH + 0.4, 0, -40]);
  b.use(M.lineWhite, 0);
  const stall0 = 2.2;
  for (let k = 0; k <= 6; k++) {
    const z = stall0 + k * 3;
    b.box(-7.7, 0, z - 0.06, -2.5, 0.012, z + 0.06, 'ny');
  }
  const cr = sub(7);
  const cars = [];
  for (let k = 0; k < 6; k++) {
    // One stream per stall, so the others never change when the visitor
    // comes or goes.
    const r = cr.fork(k + 1);
    const zc = stall0 + k * 3 + 1.5;
    const visitor = k === 2;
    if (visitor ? !P.car || P.carAt : !r.chance(0.5)) continue;
    b.push();
    b.translate(-5.2 + r.range(-0.15, 0.15), 0, zc + r.range(-0.12, 0.12));
    b.rotateY(r.range(-0.03, 0.03));
    if (visitor) addCar(b, M, { paint: M.visitor });
    else parkedCar(b, M, r);
    b.pop();
    cars.push({ z: zc, visitor });
  }
  // The visitor's car on its way somewhere: { x, z, yaw, lit } (yaw turns
  // the nose from +x toward -z).
  if (P.carAt) {
    const { x, y = 0, z, yaw, lit } = P.carAt;
    b.push();
    b.translate(x, y, z);
    b.rotateY(yaw);
    addCar(b, M, { paint: M.visitor, lit });
    b.pop();
    // Headlights throw a pool of light ahead; the taillights a red glow.
    const c = Math.cos(yaw);
    const s = -Math.sin(yaw);
    if (lit) lights.push({ p: [x + c * 5, 0.8, z + s * 5], c: [1, 0.92, 0.72], r: 4.5, k: 1.2 }, { p: [x - c * 3, 0.6, z - s * 3], c: [1, 0.2, 0.15], r: 1.4, k: 0.6 });
  }
  lights.push(lampPost(b, M, LX0 + 1.2, -12, 0, { height: 4.6, reach: 7 }));
  lights.push(lampPost(b, M, LX0 + 1.2, 30, 0, { height: 4.6, reach: 7 }));

  // ---- the pool, behind a low white wall
  const pool = addPool(b, M, sub(3), lights);

  // ---- the highway, sidewalks, and the sea wall across the road
  b.use(M.sidewalk, CAST);
  b.box(-32, 0, -FAR, LX0, 0.15, FAR, 'ny');
  b.box(-49, 0, -FAR, -46, 0.15, FAR, 'ny');
  materials[M.road].lanes = { ax: 1, az: 0, centers: [-42.27, -35.85] };
  b.use(M.road, 0);
  b.quad([-46, 0, -FAR], [-46, 0, FAR], [-32, 0, FAR], [-32, 0, -FAR]);
  b.use(M.lineYellow, 0);
  for (const x of [-39.2, -38.92]) b.box(x, 0, -FAR, x + 0.12, 0.012, FAR, 'ny');
  b.use(M.lineWhite, 0);
  for (const x of [-45.35, -32.77]) b.box(x, 0, -FAR, x + 0.12, 0.012, FAR, 'ny');
  b.use(M.sand, 0);
  b.quad([-66, 0, -FAR], [-66, 0, FAR], [-49, 0, FAR], [-49, 0, -FAR]);
  b.use(M.stucco, CAST);
  b.box(-66.4, 0, -FAR, -66, 0.85, FAR);
  b.use(M.trim, CAST);
  b.box(-66.5, 0.85, -FAR, -65.9, 0.92, FAR);
  b.use(M.cliff, 0);
  b.quad([-66.4, SEA, FAR], [-66.4, 0, FAR], [-66.4, 0, -FAR], [-66.4, SEA, -FAR]);
  // Everything else is dry grass up to the hills.
  b.use(M.field, 0);
  b.quad([LX0, 0, -FAR], [LX0, 0, -40], [FAR, 0, -40], [FAR, 0, -FAR]);
  b.quad([LX0, 0, 48], [LX0, 0, FAR], [FAR, 0, FAR], [FAR, 0, 48]);
  b.quad([DEPTH + 0.4, 0, -40], [DEPTH + 0.4, 0, 48], [FAR, 0, 48], [FAR, 0, -40]);
  hills(b, sub(4), M.scenery, { n: 7, az: [20, 160], dist: [1600, 4200], height: [160, 520] });
  hills(b, sub(5), M.headland, { n: 2, az: [305, 340], dist: [2400, 5000], height: [90, 260], base: SEA });

  // ---- the sign
  const sign = { x: -30.6, z: 6.5 };
  b.push();
  b.translate(sign.x, 0.15, sign.z);
  // Square to the lot, turned a little toward traffic coming up the coast.
  b.rotateY(-Math.PI / 2 + 0.35);
  lights.push(...addMotelSign(b, M, { noVacancy: P.noVacancy }));
  b.pop();

  // ---- palms: a row of fan palms on each sidewalk, two coconuts by the pool
  const pr = sub(8);
  const palms = [];
  const fan = (x, z, h, lod = 1) => {
    const info = addFanPalm(b, pr.fork(palms.length + 1), M, x, z, { height: h, ground: 0.15, lod });
    palms.push({ x, z, ...info });
  };
  for (const z of [-33, -19, 19.5, 33]) fan(-30.5, z, pr.range(16, 21.5));
  // Behind the block, crowns over the roofline; and one in a planter in the lot.
  for (const [z, h] of [
    [-17, 19],
    [-6.5, 21.5],
    [8.5, 17.5],
    [17.5, 20.5],
  ]) {
    fan(DEPTH + 3 + pr.range(0, 4), z + pr.range(-1, 1), h + pr.range(-1, 1));
  }
  b.use(M.curb, CAST | SMOOTH);
  b.push();
  b.translate(-9.3, 0, 1.7);
  b.cylinder(0.62, 0.62, 0, 0.2, 14);
  b.pop();
  fan(-9.3, 1.7, 16.5);
  for (let z = -60; z > -520; z -= 22) fan(-30.5, z, pr.range(15, 22), 0.3);
  for (let z = 60; z < 520; z += 22) fan(-30.5, z, pr.range(15, 22), 0.3);
  for (const z of [-26, -3, 21]) fan(-47.5, z, pr.range(13, 19));
  for (let z = -48; z > -520; z -= 26) fan(-47.5, z, pr.range(13, 20), 0.3);
  for (let z = 47; z < 520; z += 26) fan(-47.5, z, pr.range(13, 20), 0.3);
  for (const [x, z, az] of [
    [-22.9, -1.9, Math.PI * 0.9],
    [-9.6, -18.2, -Math.PI * 0.4],
  ]) {
    const info = addPalm(b, pr.fork(90 + palms.length), M, x, z, { ground: 0.15, leanAz: az, height: pr.range(8, 10) });
    palms.push({ x, z, ...info });
  }

  const mesh = finalizeMesh(b);
  const layout = { pool, sign, cars, palms, block: { x0: 0, x1: DEPTH, z0: Z0, z1: Z1, F1, TOP, WALK } };
  return {
    id: 'motel',
    name: NAME,
    props: P,
    mesh,
    materials,
    sky: makeSky(sub(6), { clouds: [3, 5], gulls: [1, 4] }),
    seaLevel: SEA,
    pool,
    lights,
    emitScale: { visitorGlass: P.roomLight },
    shadowBox: { min: [-60, -1, -45], max: [DEPTH + 2, 24, 50] },
    layout,
    views: {
      front: level([-56, 1.6, 1.5], 90, 30, 0.3),
      road: level([-44.2, 1.55, 62], 12, 32, 0.34),
      walkway: level([-1.05, F1 + 1.58, Z0 + 1.0], 180, 52, 0.44),
      pool: level([-23.2, 1.4, -20.4], 124, 46, 0.32),
    },
    hero: 'front',
  };
}

// One room: a colored door, a window with a sill, an air conditioner
// under it, and a lamp by the door.
function room(b, M, z, y0, door, glass, lights) {
  const dz0 = z + 0.55;
  const dz1 = dz0 + 0.95;
  b.object();
  b.use(M.trim, CAST);
  b.box(-0.06, y0, dz0 - 0.1, 0, y0 + 2.28, dz1 + 0.1);
  b.use(door, CAST);
  b.box(-0.09, y0, dz0, -0.06, y0 + 2.18, dz1);
  const wz0 = z + 1.95;
  const wz1 = z + 3.6;
  b.object();
  b.use(glass, CAST);
  b.quad([-0.01, y0 + 1.0, wz1], [-0.01, y0 + 2.25, wz1], [-0.01, y0 + 2.25, wz0], [-0.01, y0 + 1.0, wz0]);
  b.use(M.frame, CAST);
  b.box(-0.07, y0 + 0.92, wz0 - 0.06, 0, y0 + 1.0, wz1 + 0.06);
  b.box(-0.07, y0 + 2.25, wz0 - 0.06, 0, y0 + 2.31, wz1 + 0.06);
  b.box(-0.07, y0 + 1.0, (wz0 + wz1) / 2 - 0.03, 0, y0 + 2.25, (wz0 + wz1) / 2 + 0.03);
  b.use(M.signCream, CAST);
  b.box(-0.42, y0 + 0.36, wz0 + 0.45, 0, y0 + 0.82, wz1 - 0.45);
  b.use(M.lamp, CAST);
  b.box(-0.12, y0 + 2.3, z + 1.62, 0, y0 + 2.48, z + 1.76);
  lights.push({ p: [-0.5, y0 + 2.2, z + 1.7], c: [1, 0.78, 0.5], r: 1.5, k: 0.8 });
}

// Vertical pickets between a top and a bottom rail, facing west.
function pickets(b, M, x, y, z0, z1) {
  b.use(M.rail, CAST);
  b.box(x - 0.05, y + 0.96, z0, x + 0.05, y + 1.02, z1);
  b.box(x - 0.03, y + 0.1, z0, x + 0.03, y + 0.15, z1);
  for (let z = z0 + 0.08; z < z1; z += 0.16) b.box(x - 0.015, y + 0.1, z - 0.015, x + 0.015, y + 0.96, z + 0.015, 'py ny');
}

function addPool(b, M, rng, lights) {
  const DECK = 0.15;
  const px0 = -20.5;
  const px1 = -11.5;
  const pz0 = -16.5;
  const pz1 = -3.5;
  const dx0 = -24;
  const dx1 = -WALK - 0.4;
  const dz0 = -21;
  const dz1 = 0.8;
  const C = 0.4;
  const WATER = DECK - 0.1;
  const FLOOR = -1.5;
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
  b.use(M.poolTile, CAST | UNDERWATER);
  b.quad([px0, FLOOR, pz0], [px0, 0, pz0], [px0, 0, pz1], [px0, FLOOR, pz1]);
  b.quad([px1, FLOOR, pz1], [px1, 0, pz1], [px1, 0, pz0], [px1, FLOOR, pz0]);
  b.quad([px0, FLOOR, pz0], [px1, FLOOR, pz0], [px1, 0, pz0], [px0, 0, pz0]);
  b.quad([px1, FLOOR, pz1], [px0, FLOOR, pz1], [px0, 0, pz1], [px1, 0, pz1]);
  b.quad([px0, FLOOR, pz0], [px0, FLOOR, pz1], [px1, FLOOR, pz1], [px1, FLOOR, pz0]);
  b.use(M.water, NOREFLECT);
  b.quad([px0, WATER, pz0], [px0, WATER, pz1], [px1, WATER, pz1], [px1, WATER, pz0]);
  addLadder(b, M, px1, (pz0 + pz1) / 2 - 3, -1, 0, DECK, WATER);
  // The wall: west, north and south, with a gate toward the rooms.
  const H = 1.05;
  b.use(M.stucco, CAST);
  b.box(dx0 - 0.25, 0, dz0 - 0.25, dx0, H, dz1 + 0.25);
  b.box(dx0, 0, dz0 - 0.25, dx1, H, dz0);
  b.box(dx0, 0, dz1, dx1 - 3.2, H, dz1 + 0.25);
  b.use(M.trim, CAST);
  b.box(dx0 - 0.3, H, dz0 - 0.3, dx0 + 0.05, H + 0.06, dz1 + 0.3);
  b.box(dx0, H, dz0 - 0.3, dx1, H + 0.06, dz0 + 0.05);
  b.box(dx0, H, dz1 - 0.05, dx1 - 3.2, H + 0.06, dz1 + 0.3);
  // Loungers on the east side, facing the afternoon sun.
  for (const [i, z] of [-14.6, -13.3, -12.0, -7.8, -6.5].entries()) {
    b.push();
    b.translate(-4.6, DECK, z);
    b.rotateY(-Math.PI / 2);
    addLounger(b, M, { towel: i === 3 });
    b.pop();
  }
  b.push();
  b.translate(-6.4, DECK, -10.0);
  addUmbrella(b, M, true);
  b.pop();
  b.push();
  b.translate(-4.9, DECK, -10.9);
  addSideTable(b, M, {});
  b.pop();
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
    waves: [
      { kx: 3.1, kz: 0.9, w: 1.0, p: rng.range(0, 6.28), a: 0.012 },
      { kx: -1.4, kz: 3.6, w: 1.4, p: rng.range(0, 6.28), a: 0.008 },
      { kx: 5.3, kz: -2.2, w: 2.3, p: rng.range(0, 6.28), a: 0.004 },
      { kx: 2.0, kz: 1.1, w: 0.7, p: rng.range(0, 6.28), a: 0.01 },
    ],
  };
  lights.push({ p: [(px0 + px1) / 2, WATER + 0.5, (pz0 + pz1) / 2], c: [0.3, 0.88, 1.0], r: 4.5, k: 0.9 });
  return pool;
}
