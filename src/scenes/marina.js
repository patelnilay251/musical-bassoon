// The marina: two floating docks full of boats, a quay with palms and a
// yacht club, a rock breakwater across the harbor mouth and a lighthouse at
// its tip. The water is calm enough to hold every mast upside down.
//
// Axes: +x east, +y up, +z south. The quay runs north-south at x = 0; the
// harbor and the sea are west of it.

import { MeshBuilder, finalizeMesh, CAST, DOUBLE, SMOOTH } from '../mesh.js';
import { Rng, hashInts, hex } from '../math.js';
import { makeSky } from '../sky.js';
import { makeMaterials } from '../world/materials.js';
import { addPalm } from '../world/palm.js';
import { addFanPalm } from '../world/fanpalm.js';
import { addCar, parkedCar } from '../world/cars.js';
import { hills, railing, lampPost } from '../world/common.js';
import { addSailboat, addMotorYacht, addLighthouse } from '../world/boats.js';
import { neonWord } from '../world/signs.js';
import { level } from '../camera.js';

export const NAME = 'The Marina';
// Compositions, the first one the place's hero.
export const VIEWS = ['harbor', 'slips', 'quay', 'lighthouse'];
const SEED = 1986;
const QUAY = 1.4;
const DOCK = 0.45;
const FAR = 25000;
const BW = -215; // breakwater line
const LH = { x: BW, z: 118 }; // lighthouse

export const DEFAULT_PROPS = { car: true, sloop: 'in' };

export function build(props = {}) {
  const P = { ...DEFAULT_PROPS, ...props };
  const sub = (salt) => new Rng(hashInts(SEED, salt));
  const { list: materials, M } = makeMaterials(sub(1));
  const b = new MeshBuilder();
  const lights = [];

  // ---- water, quay, promenade
  b.use(M.sea, 0);
  b.quad([-FAR, 0, -FAR], [-FAR, 0, FAR], [0.5, 0, FAR], [0.5, 0, -FAR]);
  b.use(M.stucco, CAST);
  b.box(0, -1.5, -600, 0.6, QUAY, 600, 'ny');
  b.use(M.sidewalk, 0);
  b.quad([0.6, QUAY, -600], [0.6, QUAY, 600], [16, QUAY, 600], [16, QUAY, -600]);
  b.use(M.lot, 0);
  b.quad([16, QUAY, -600], [16, QUAY, 600], [44, QUAY, 600], [44, QUAY, -600]);
  b.use(M.field, 0);
  b.quad([44, QUAY, -FAR], [44, QUAY, FAR], [FAR, QUAY, FAR], [FAR, QUAY, -FAR]);
  b.quad([0.6, QUAY, -FAR], [0.6, QUAY, -600], [44, QUAY, -600], [44, QUAY, -FAR]);
  b.quad([0.6, QUAY, 600], [0.6, QUAY, FAR], [44, QUAY, FAR], [44, QUAY, 600]);
  const DOCKS = [-30, 20];
  // Railing along the quay edge, open where the gangways go down.
  let z = -300;
  for (const zd of [...DOCKS, 300]) {
    if (zd - 2 > z) railing(b, M.rail, [[0.4, QUAY, z], [0.4, QUAY, zd - 2]], { h: 1.0, pitch: 2 });
    z = zd + 2;
  }
  const pr = sub(2);
  const palms = [];
  for (let zp = -150; zp < 160; zp += 14) {
    if (DOCKS.some((d) => Math.abs(zp - d) < 5)) continue;
    const info = addPalm(b, pr.fork(palms.length + 1), M, 9 + pr.range(-0.8, 0.8), zp + pr.range(-2, 2), {
      ground: QUAY,
      leanAz: Math.PI + pr.range(-0.6, 0.6),
      lean: pr.range(0.6, 2),
      height: pr.range(8, 11.5),
    });
    palms.push(info);
  }
  for (let zp = -120; zp < 140; zp += 30) lights.push(lampPost(b, M, 3.2, zp, QUAY, { height: 4, reach: 6 }));
  // Fan palms beyond the lot, and the hills.
  for (let zp = -210; zp < 220; zp += 19) addFanPalm(b, pr.fork(300 + palms.length++), M, 46 + pr.range(0, 3), zp, { height: pr.range(15, 21), ground: QUAY, lod: 0.3 });
  hills(b, sub(3), M.scenery, { n: 7, az: [20, 160], dist: [4500, 9500], height: [110, 330] });
  hills(b, sub(4), M.headland, { n: 3, az: [290, 330], dist: [8000, 15000], height: [200, 600] });

  // ---- the yacht club
  clubhouse(b, M, 24, -12, lights);
  const car = { x: 20.5, z: 6 };
  if (P.car) {
    b.push();
    b.translate(car.x, QUAY, car.z);
    b.rotateY(Math.PI / 2 + 0.08);
    addCar(b, M, { paint: M.visitor });
    b.pop();
  }
  const cr = sub(5);
  for (const [x, zc] of [
    [20.5, -26],
    [20.5, 16],
    [20.5, 22],
    [34, 22],
  ]) {
    b.push();
    b.translate(x, QUAY, zc);
    b.rotateY(Math.PI / 2 + cr.range(-0.05, 0.05));
    parkedCar(b, M, cr);
    b.pop();
  }

  // ---- docks, fingers, and the boats in their slips
  const br = sub(6);
  const boats = [];
  const slip = 5.6;
  const finger = 11;
  for (const [di, zd] of DOCKS.entries()) {
    b.use(M.planks, CAST);
    b.box(-96, 0.12, zd - 1.2, -2, DOCK, zd + 1.2);
    // Gangway down from the quay.
    b.use(M.planks, CAST | DOUBLE);
    b.quad([0.6, QUAY, zd - 0.7], [0.6, QUAY, zd + 0.7], [-2, DOCK, zd + 0.7], [-2, DOCK, zd - 0.7]);
    railing(b, M.rail, [[0.6, QUAY, zd - 0.75], [-2, DOCK, zd - 0.75]], { h: 0.9, mid: false, posts: false });
    railing(b, M.rail, [[0.6, QUAY, zd + 0.75], [-2, DOCK, zd + 0.75]], { h: 0.9, mid: false, posts: false });
    for (let k = 0; ; k++) {
      const xf = -8 - k * slip;
      if (xf < -94) break;
      for (const s of [-1, 1]) {
        b.use(M.planks, CAST);
        const z0 = zd + s * 1.2;
        const z1 = zd + s * (1.2 + finger);
        b.box(xf - 0.45, 0.12, Math.min(z0, z1), xf + 0.45, DOCK - 0.05, Math.max(z0, z1));
        // A piling at the end of every other finger.
        if (k % 2 === 0) {
          b.use(M.piling, CAST | SMOOTH);
          b.push();
          b.translate(xf, -1, z1 + s * 0.3);
          b.cylinder(0.2, 0.18, 0, 4.2, 8);
          b.pop();
        }
        // The boat in the slip beside this finger.
        const xb = xf - slip / 2;
        if (xb < -94) continue;
        const sloop = di === 1 && s > 0 && k === 3;
        if (sloop ? P.sloop !== 'in' : !br.chance(0.8)) continue;
        const r = br.fork(boats.length + 1);
        const kind = sloop ? 'sail' : r.chance(0.68) ? 'sail' : 'motor';
        const L = kind === 'sail' ? r.range(8.5, 11.5) : r.range(10, 12.8);
        // Bow in, a little short of the main dock.
        const zc = zd + s * (1.8 + L / 2);
        b.push();
        b.translate(xb + r.range(-0.2, 0.2), 0, zc);
        b.rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2);
        b.rotateY(r.range(-0.03, 0.03));
        boat(b, M, r, kind, sloop, L);
        b.pop();
        boats.push({ x: xb, z: zc, kind });
      }
    }
    for (const xl of [-30, -64]) {
      const L = lampPost(b, M, xl, zd + 1.0, DOCK, { height: 2.6, globe: 0.16, reach: 4 });
      lights.push(L);
    }
  }
  // A few boats on moorings out in the harbor, heads to the westerly.
  for (let i = 0; i < 6; i++) {
    const r = br.fork(900 + i);
    const x = r.range(-190, -120);
    const zm = r.range(-110, 90);
    b.push();
    b.translate(x, 0, zm);
    b.rotateY(Math.PI + r.range(-0.3, 0.3));
    boat(b, M, r, r.chance(0.8) ? 'sail' : 'motor', false, r.range(9, 13));
    b.pop();
  }

  // ---- the breakwater and the lighthouse at its tip
  breakwater(b, M, sub(7), BW, -420, LH.z - 4);
  b.push();
  b.translate(LH.x, 3.0, LH.z);
  const lh = addLighthouse(b, M, { h: 13 });
  b.pop();
  lights.push({ p: [LH.x, 3.0 + lh.lamp[1], LH.z], c: [1, 0.85, 0.55], r: 9, k: 1.2 });

  const wr = sub(8);
  const mesh = finalizeMesh(b);
  return {
    id: 'marina',
    name: NAME,
    props: P,
    mesh,
    materials,
    sky: makeSky(sub(9), { clouds: [3, 5], gulls: [2, 6] }),
    seaLevel: 0,
    mirror: { y: 0 },
    water: {
      waves: [
        { kx: 0.9, kz: 0.35, w: 0.8, p: wr.range(0, 6.28), a: 0.011 },
        { kx: -0.4, kz: 1.3, w: 1.1, p: wr.range(0, 6.28), a: 0.007 },
        { kx: 2.1, kz: -1.2, w: 1.9, p: wr.range(0, 6.28), a: 0.004 },
        { kx: 3.4, kz: 1.9, w: 2.6, p: wr.range(0, 6.28), a: 0.0025 },
      ],
      near: hex('#1c72bc'),
      far: hex('#10408f'),
      falloff: 260,
    },
    lights,
    shadowBox: { min: [-235, -3, -90], max: [48, 22, 135] },
    layout: { boats, car, lighthouse: LH, docks: DOCKS },
    views: {
      harbor: level([23.0, QUAY + 3.9 + 1.6, 1], 246, 36, 0.52),
      slips: level([-95.2, DOCK + 1.55, -30], 88, 36, 0.36),
      quay: level([1.4, QUAY + 1.6, 44], 262, 32, 0.36),
      lighthouse: level([BW + 0.5, 3.0 + 1.6, LH.z - 40], 184, 34, 0.3),
    },
    hero: 'harbor',
  };
}

const HULLS = [
  ['hull', 'bootStripe'],
  ['hull', 'bootStripe'],
  ['hull', 'hullRed'],
  ['hull', 'bootStripe'],
  ['hullNavy', 'hull'],
  ['hull', 'doorGreen'],
  ['hullRed', 'hull'],
];

function boat(b, M, r, kind, sloop, L) {
  const [paint, boot] = sloop ? ['hull', 'hullRed'] : r.pick(HULLS);
  if (kind === 'sail') addSailboat(b, M, r, { L, paint: M[paint], boot: M[boot], cover: sloop ? M.doorRed : r.pick([M.sailCover, M.sailCover, M.doorGreen, M.signNavy]) });
  else addMotorYacht(b, M, r, { L, paint: M[paint === 'hullNavy' ? 'hull' : paint], boot: M[boot === 'hull' ? 'hullNavy' : boot] });
}

// A rock breakwater along z at x: a trapezoid of rubble with a walkway on
// top, big faceted boulders along both flanks.
function breakwater(b, M, rng, x, z0, z1) {
  const top = 3.0;
  b.use(M.rock, CAST);
  b.quad([x - 9, -2, z0], [x - 9, -2, z1], [x - 2.5, top, z1], [x - 2.5, top, z0]);
  b.quad([x + 2.5, top, z0], [x + 2.5, top, z1], [x + 9, -2, z1], [x + 9, -2, z0]);
  b.quad([x - 9, -2, z1], [x + 9, -2, z1], [x + 2.5, top, z1], [x - 2.5, top, z1]);
  b.use(M.sidewalk, CAST);
  b.box(x - 2.5, top - 0.3, z0, x + 2.5, top + 0.05, z1 + 6, 'ny');
  b.use(M.curb, CAST);
  b.box(x - 4, -1, z1 + 1, x + 4, top + 0.05, z1 + 9);
  // Boulders: squashed, turned, faceted.
  b.use(M.rock, CAST);
  for (let zz = z0; zz < z1 + 8; zz += rng.range(1.6, 3.2)) {
    for (const s of [-1, 1]) {
      const d = rng.range(3.2, 7.5);
      const y = top - (d - 2.5) * 0.77 + rng.range(-0.3, 0.5);
      b.push();
      b.translate(x + s * d, y, zz);
      b.rotateY(rng.range(0, 6.28));
      b.rotateX(rng.range(-0.4, 0.4));
      b.scale(rng.range(1.1, 2.0), rng.range(0.7, 1.2), rng.range(1.0, 1.8));
      b.sphere(1, 6, 3);
      b.pop();
    }
  }
}

// The yacht club: white, two stories, glass toward the water, a flag.
function clubhouse(b, M, x, z, lights) {
  const w = 24;
  const d = 14;
  const h1 = 3.6;
  const h2 = 7.2;
  const g = QUAY;
  b.use(M.stucco, CAST);
  b.box(x, g, z, x + d, g + h2, z + w);
  b.use(M.trim, CAST);
  b.box(x - 2.2, g + h1, z - 0.8, x + d, g + h1 + 0.3, z + w + 0.8);
  b.box(x - 0.6, g + h2, z - 0.6, x + d + 0.6, g + h2 + 0.4, z + w + 0.6);
  for (const [f, y0, y1] of [
    [0, g + 0.3, g + h1 - 0.3],
    [1, g + h1 + 0.9, g + h2 - 0.5],
  ]) {
    b.object();
    b.use(M.glass, CAST);
    b.quad([x - 0.01, y0, z + w - 1.2], [x - 0.01, y1, z + w - 1.2], [x - 0.01, y1, z + 1.2], [x - 0.01, y0, z + 1.2]);
    b.use(M.frame, CAST);
    for (let zz = z + 1.2; zz <= z + w - 1.2 + 1e-6; zz += (w - 2.4) / 8) b.box(x - 0.08, y0, zz - 0.04, x, y1, zz + 0.04);
    if (f === 1) railing(b, M.rail, [[x - 2.1, g + h1 + 0.3, z - 0.7], [x - 2.1, g + h1 + 0.3, z + w + 0.7]], { h: 1.0, pitch: 1.4, r: 0.03 });
    lights.push({ p: [x - 1, (y0 + y1) / 2, z + w / 2], c: [1, 0.75, 0.46], r: 5, k: 0.7 });
  }
  // MARINA across the fascia, and a flagpole.
  b.push();
  b.translate(x - 0.62, g + h2 + 0.02, z + w / 2);
  b.rotateY(-Math.PI / 2);
  neonWord(b, M, 'MARINA', { size: 0.34, paint: M.signNavy, neon: M.neonCyan, stroke: 0.07 });
  b.pop();
  b.use(M.trim, CAST | SMOOTH);
  b.tube([[x - 5, g, z + w + 4], [x - 5, g + 12, z + w + 4]], [0.07, 0.04], 6);
  b.use(M.doorBlue, CAST | DOUBLE);
  b.quad([x - 5, g + 11.8, z + w + 4], [x - 5, g + 10.9, z + w + 4], [x - 5.1, g + 10.95, z + w + 5.5], [x - 5.1, g + 11.75, z + w + 5.4]);
}
