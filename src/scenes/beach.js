// The beach: a long slope of sand down to the surf, a lifeguard tower on
// stilts, a rack of boards, umbrellas nobody is under, and a pier walking
// out to sea on its pilings. Behind: a promenade of coconut palms, a
// street of beach houses, and the hills.
//
// Axes: +x east, +y up, +z south. The sea is west; the waterline is x = 0.

import { MeshBuilder, finalizeMesh, CAST } from '../mesh.js';
import { Rng, hashInts, hex } from '../math.js';
import { makeSky } from '../sky.js';
import { makeMaterials } from '../world/materials.js';
import { addPalm } from '../world/palm.js';
import { addFanPalm } from '../world/fanpalm.js';
import { addCar, parkedCar } from '../world/cars.js';
import { addUmbrella } from '../world/props.js';
import { hills, railing, lampPost } from '../world/common.js';
import { addLifeguardTower, addBoardRack, addSurfboard, addTowel, addPier, addFoam, addBreakers, addFootprints } from '../world/shore.js';
import { level } from '../camera.js';
import { addFlowerBush } from '../world/plants.js';
import { motion } from '../world/motion.js';

export const NAME = 'The Beach';
// Compositions, the first one the place's hero.
export const VIEWS = ['tower', 'pier', 'shore', 'sunset'];
const SEED = 1983;
const SLOPE = 0.035;
const WALL = 72; // the promenade's sea wall
const PROM = WALL * SLOPE + 0.9; // promenade level
const Z = 3000; // the beach runs on out of sight both ways
const FAR = 25000;
const PIER = -95;

// prints: the visitor's footprints, 0 none, 1 down to the water, 2 and back.
export const DEFAULT_PROPS = { car: true, towel: true, umbrella: 'open', board: 'sand', prints: 0 };

const sandY = (x) => x * SLOPE;

export function build(props = {}) {
  const P = { ...DEFAULT_PROPS, ...props };
  const sub = (salt) => new Rng(hashInts(SEED, salt));
  const { list: materials, M } = makeMaterials(sub(1));
  const b = new MeshBuilder();
  const lights = [];

  // ---- sea and sand
  b.use(M.sea, 0);
  b.quad([-FAR, 0, -FAR], [-FAR, 0, FAR], [3, 0, FAR], [3, 0, -FAR]);
  // Wet sand below the high-water line, which wanders.
  const fr = sub(2);
  const ph = [fr.range(0, 6), fr.range(0, 6), fr.range(0, 6)];
  const tide = (z) => 7 + 1.6 * Math.sin(z * 0.021 + ph[0]) + 0.7 * Math.sin(z * 0.067 + ph[1]);
  const band = (mat, xa, xb) => {
    b.use(mat, 0);
    for (let z = -Z; z < Z; z += z > -400 && z < 400 ? 3 : 200) {
      const zb = Math.min(Z, z + (z > -400 && z < 400 ? 3 : 200));
      b.quad([xa(z), sandY(xa(z)), z], [xa(zb), sandY(xa(zb)), zb], [xb(zb), sandY(xb(zb)), zb], [xb(z), sandY(xb(z)), z]);
    }
  };
  band(M.wetSand, () => -40, tide);
  band(M.sand, tide, () => WALL);
  // Foam: a thin scalloped swash at the waterline, and two lines of
  // breaking waves offshore.
  // With the motion clock running, each line runs in and back with the
  // swell a little after the line beyond it, so the waves come ashore.
  const wash = motion.wind > 0 ? (z) => 0.45 * Math.sin(((2 * Math.PI) / 7.5) * motion.t - 3.6 - z * 0.012) : () => 0;
  addFoam(b, M, {
    z0: -Z,
    z1: Z,
    step: 1.25,
    xa: (z) => -0.12 - 0.22 * Math.pow(Math.abs(Math.sin(z * 0.11 + ph[0])), 0.6) - 0.1 * Math.sin(z * 0.029 + ph[1]) + wash(z),
    xb: () => 0.3,
  });
  addBreakers(b, M, sub(14), { x: -0.9, z0: -900, z1: 900, width: 1.1, len: [2, 9], gap: [0.4, 3], y: 0.01, mat: M.lace, surge: 0.9, lag: 3.0 });
  addBreakers(b, M, sub(11), { x: -6, z0: -900, z1: 900, width: 0.45, len: [3, 12], gap: [1.5, 7], surge: 1.4, lag: 2.2 });
  addBreakers(b, M, sub(12), { x: -15, z0: -1500, z1: 1500, width: 0.9, len: [6, 26], gap: [2, 10], surge: 1.8, lag: 1.2 });
  addBreakers(b, M, sub(13), { x: -31, z0: -2000, z1: 2000, width: 1.2, len: [8, 30], gap: [4, 16], surge: 2.2, lag: 0 });

  // ---- the promenade, its palms, the street and the houses
  b.use(M.stucco, CAST);
  b.box(WALL - 0.4, sandY(WALL) - 0.3, -Z, WALL, PROM, Z);
  b.use(M.trim, CAST);
  b.box(WALL - 0.5, PROM, -Z, WALL + 0.3, PROM + 0.08, Z);
  b.use(M.sidewalk, 0);
  b.quad([WALL, PROM, -Z], [WALL, PROM, Z], [WALL + 12, PROM, Z], [WALL + 12, PROM, -Z]);
  railing(b, M.rail, [[WALL - 0.2, PROM + 0.08, -Z], [WALL - 0.2, PROM + 0.08, Z]], { h: 0.95, posts: false });
  b.use(M.rail, CAST);
  for (let z = -300; z <= 300; z += 2.4) b.box(WALL - 0.24, PROM + 0.08, z - 0.03, WALL - 0.16, PROM + 1.03, z + 0.03);
  // Steps down to the sand every so often.
  for (const zs of [-40, 30, 110]) {
    b.use(M.trim, CAST);
    for (let i = 0; i < 6; i++) {
      const x = WALL - 0.4 - i * 0.32;
      b.box(x - 0.32, sandY(x) - 0.3, zs - 1.2, x, PROM - (i + 1) * 0.16, zs + 1.2);
    }
  }
  b.use(M.asphalt, 0);
  b.quad([WALL + 12, PROM, -Z], [WALL + 12, PROM, Z], [WALL + 26, PROM, Z], [WALL + 26, PROM, -Z]);
  // Nose-in stalls along the promenade side of the street.
  b.use(M.lineWhite, 0);
  for (let z = -150.2; z < 150; z += 2.8) b.box(WALL + 12.3, PROM, z - 0.06, WALL + 17.6, PROM + 0.012, z + 0.06, 'ny');
  b.use(M.sidewalk, CAST);
  b.box(WALL + 26, PROM - 0.5, -Z, WALL + 30, PROM + 0.15, Z, 'ny');
  b.use(M.field, 0);
  b.quad([WALL + 30, PROM + 0.15, -FAR], [WALL + 30, PROM + 0.15, FAR], [FAR, PROM + 0.15, FAR], [FAR, PROM + 0.15, -FAR]);

  const pr = sub(3);
  const palms = [];
  for (let z = -186; z < 200; z += 15) {
    if (Math.abs(z - PIER) < 7) continue;
    const r = pr.fork(palms.length + 1);
    const info = addPalm(b, r, M, WALL + 5.5 + pr.range(-0.6, 0.6), z + pr.range(-1.5, 1.5), {
      ground: PROM,
      leanAz: Math.PI + pr.range(-0.5, 0.5),
      lean: pr.range(0.8, 2.2),
      height: pr.range(8.5, 12),
    });
    palms.push({ ...info });
    // Every other palm has a flowering bush at its foot.
    if (palms.length % 2 === 0) {
      b.push();
      b.translate(WALL + 3.6 + r.range(-0.3, 0.3), PROM, z + r.range(1.4, 2.2));
      addFlowerBush(b, M, sub(20).fork(palms.length), { r: r.range(0.75, 1.0), h: 0.8, kind: r.pick(['bougainvillea', 'hibiscus', 'oleander']) });
      b.pop();
    }
  }
  for (let z = -60; z < 140; z += 26) lights.push(lampPost(b, M, WALL + 1.2, z, PROM, { height: 4.2, reach: 6 }));
  // Beach houses across the street, in the town's pastels.
  const hr = sub(4);
  const walls = [M.stucco, M.salmon, M.mint, M.butter, M.skyBlue, M.lilac, M.stucco];
  for (let z = -170; z < 170; ) {
    const w = hr.range(12, 22);
    const h = hr.pick([4.5, 7.8, 7.8, 11.1]);
    house(b, M, WALL + 32, z, w, h, hr.pick(walls), hr, lights);
    z += w + hr.range(3, 9);
  }
  for (let z = -160; z < 170; z += 21) addFanPalm(b, pr.fork(500 + z), M, WALL + 30.8, z + 7, { height: pr.range(15, 21), ground: PROM + 0.15, lod: 0.3 });
  // In the stalls: the visitor's car among others, noses to the sea.
  const cr = sub(5);
  for (let k = -12; k < 16; k++) {
    const r = cr.fork(k + 20); // one stream per stall
    const z = -150.2 + 2.8 * (54 + k) + 1.4;
    const visitor = k === 0;
    if (visitor ? !P.car : r.chance(0.55)) continue;
    b.push();
    b.translate(WALL + 15, PROM, z + r.range(-0.1, 0.1));
    b.rotateY(Math.PI + r.range(-0.03, 0.03));
    if (visitor) addCar(b, M, { paint: M.visitor });
    else parkedCar(b, M, r, { lod: 0.3 });
    b.pop();
  }

  // ---- the pier
  lights.push(...addPier(b, M, { x0: WALL + 1, x1: -270, zc: PIER, deck: PROM + 0.4 }));

  // ---- the tower and the visitor's corner of the beach
  const T = { x: 30, z: 0 };
  b.push();
  b.translate(T.x, sandY(T.x), T.z);
  const tower = addLifeguardTower(b, M);
  b.pop();
  b.push();
  b.translate(27.4, sandY(27.4), 5.6);
  addBoardRack(b, M, [M.boardRed, M.boardYellow, P.board === 'rack' ? M.boardAqua : null, M.boardWhite]);
  b.pop();
  const spot = { x: 20.5, z: 10.5 };
  if (P.towel) {
    b.push();
    b.translate(spot.x, sandY(spot.x) + 0.01, spot.z);
    b.rotateY(0.25);
    b.rotateZ(Math.atan(SLOPE));
    addTowel(b, M);
    b.pop();
  }
  if (P.umbrella) {
    b.push();
    b.translate(spot.x + 1.3, sandY(spot.x + 1.3) - 0.25, spot.z - 1.1);
    b.rotateZ(0.12);
    addUmbrella(b, M, P.umbrella === 'open', [M.doorRed, M.signCream]);
    b.pop();
  }
  if (P.board === 'sand') {
    b.push();
    b.translate(spot.x - 1.2, sandY(spot.x - 1.2) + 0.04, spot.z + 0.4);
    b.rotateZ(Math.atan(SLOPE));
    b.rotateY(0.4);
    b.rotateX(-Math.PI / 2);
    b.translate(0, -1.15, 0);
    addSurfboard(b, M.boardAqua, 2.45);
    b.pop();
  }
  // Footprints: down to the water with the board, and later back up.
  if (P.prints) {
    const fp = sub(15);
    const opts = { ground: sandY, wet: tide, swash: 1.1 };
    addFootprints(b, M, fp.fork(1), [[spot.x - 1.9, spot.z + 0.1], [15, 8.9], [9, 7.2], [0.6, 6.3]], opts);
    if (P.prints > 1) addFootprints(b, M, fp.fork(2), [[0.8, 8.2], [7.5, 9.0], [13.5, 10.2], [spot.x - 1.6, spot.z + 0.9]], opts);
  }
  // Other umbrellas up and down the beach, left standing.
  const ur = sub(6);
  const colors = [
    [M.doorBlue, M.signCream],
    [M.doorYellow, M.signCream],
    [M.doorGreen, M.signCream],
    [M.salmon, M.signCream],
  ];
  for (let i = 0; i < 9; i++) {
    const x = ur.range(16, 50);
    const z = ur.pick([-1, 1]) * ur.range(18, 80) + (i % 2 ? -30 : 20);
    if (Math.abs(z - PIER) < 10) continue;
    b.push();
    b.translate(x, sandY(x) - 0.25, z);
    b.rotateZ(ur.range(-0.12, 0.12));
    addUmbrella(b, M, ur.chance(0.75), ur.pick(colors));
    b.pop();
    if (ur.chance(0.5)) {
      b.push();
      b.translate(x + 1.2, sandY(x + 1.2) + 0.01, z + 1);
      b.rotateY(ur.range(-0.5, 0.5));
      b.rotateZ(Math.atan(SLOPE));
      addTowel(b, M, ur.pick([M.awningBlue, M.awningGreen, M.awningRed]));
      b.pop();
    }
  }

  // ---- far off: hills inland, a headland out across the water
  hills(b, sub(7), M.scenery, { n: 6, az: [25, 155], dist: [3500, 8000], height: [120, 420] });
  hills(b, sub(8), M.headland, { n: 3, az: [292, 335], dist: [9000, 16000], height: [180, 520], base: 0 });

  const wr = sub(9);
  const mesh = finalizeMesh(b);
  return {
    id: 'beach',
    name: NAME,
    props: P,
    mesh,
    materials,
    sky: makeSky(sub(10), { clouds: [1, 2], gulls: [2, 5] }),
    seaLevel: 0,
    mirror: { y: 0 },
    water: {
      waves: [
        { kx: 0.33, kz: 0.02, w: 0.9, p: wr.range(0, 6.28), a: 0.05 },
        { kx: 0.52, kz: -0.14, w: 1.3, p: wr.range(0, 6.28), a: 0.028 },
        { kx: 1.3, kz: 0.8, w: 2.1, p: wr.range(0, 6.28), a: 0.012 },
        { kx: 2.4, kz: -1.5, w: 2.9, p: wr.range(0, 6.28), a: 0.006 },
      ],
      near: hex('#2a8fd0'),
      far: hex('#0f3f98'),
      falloff: 420,
      shallow: { a: [-1, 0], d: 0, w: 14, color: hex('#66d9cf') },
    },
    lights,
    shadowBox: { min: [-120, -3, -110], max: [WALL + 45, 24, 95] },
    layout: { tower: { ...T, ...tower }, spot, pier: PIER, palms },
    views: {
      tower: level([4, sandY(4) + 1.6, 7.5], 83, 30, 0.3),
      sunset: level([50, sandY(50) + 1.6, 0.5], 284, 36, 0.42),
      pier: level([-60, PROM + 0.4 + 1.6, PIER + 3], 128, 34, 0.44),
      shore: level([6, sandY(6) + 1.45, 44], 356, 40, 0.36),
    },
    hero: 'tower',
  };
}

// A beach house facing the sea: a stucco box with window bands, a
// balcony per floor, a flat roof.
function house(b, M, x, z, w, h, wall, rng, lights) {
  const y0 = PROM + 0.15;
  const d = rng.range(9, 13);
  b.use(wall, CAST);
  b.box(x, y0, z, x + d, y0 + h, z + w);
  b.use(M.trim, CAST);
  b.box(x - 0.3, y0 + h, z - 0.3, x + d + 0.3, y0 + h + 0.3, z + w + 0.3);
  const floors = Math.round(h / 3.3);
  for (let f = 0; f < floors; f++) {
    const fy = y0 + f * 3.3;
    b.object();
    b.use(M.glass, CAST);
    b.quad([x - 0.01, fy + 0.9, z + w - 1.2], [x - 0.01, fy + 2.5, z + w - 1.2], [x - 0.01, fy + 2.5, z + 1.2], [x - 0.01, fy + 0.9, z + 1.2]);
    b.use(M.frame, CAST);
    for (let k = 0; k <= Math.round((w - 2.4) / 1.8); k++) {
      const zm = z + 1.2 + k * ((w - 2.4) / Math.max(1, Math.round((w - 2.4) / 1.8)));
      b.box(x - 0.06, fy + 0.9, zm - 0.04, x, fy + 2.5, zm + 0.04);
    }
    if (f > 0) {
      b.use(M.trim, CAST);
      b.box(x - 1.4, fy - 0.2, z + 0.8, x, fy, z + w - 0.8);
      railing(b, M.rail, [[x - 1.35, fy, z + 0.85], [x - 1.35, fy, z + w - 0.85]], { h: 1.0, pitch: 1.2, r: 0.025 });
    }
    lights.push({ p: [x - 0.8, fy + 1.6, z + w / 2], c: [1, 0.72, 0.42], r: 2.6, k: 0.5 });
  }
}
