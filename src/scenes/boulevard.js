// The boulevard: a wide avenue running downhill to the sea, laid out (as
// some streets in this part of the world are) so that in high summer the
// sun sets straight down the middle of it. Two rows of fan palms, low
// shops with awnings, a diner on the corner, a traffic light nobody waits at.
//
// Built in a road frame (x along the road, the sea toward -x; z across it)
// and turned so that -x points at the midsummer sunset.

import { MeshBuilder, finalizeMesh, CAST, DOUBLE, SMOOTH } from '../mesh.js';
import { Rng, hashInts, DEG } from '../math.js';
import { makeSky } from '../sky.js';
import { makeMaterials } from '../world/materials.js';
import { addFanPalm } from '../world/fanpalm.js';
import { addCar, parkedCar } from '../world/cars.js';
import { hills, lampPost } from '../world/common.js';
import { neonWord, addBoard } from '../world/signs.js';
import { addMeter, addHydrant, addNewsBox } from '../world/street.js';
import { addFlowerBush } from '../world/plants.js';
import { level } from '../camera.js';
import { lookOf } from '../looks.js';

export const NAME = 'The Boulevard';
// Compositions, the first one the place's hero.
export const VIEWS = ['sunset', 'diner', 'uphill'];
const SEED = 1984;
const AZ = 292; // compass heading of the road, downhill: the sunset
const ROT = -(AZ - 270) * DEG; // road frame -> world
const GRADE = 0.04;
const X0 = -700; // the coast road
const X1 = 360; // uphill end, over the crest behind the camera
const CROSS = [15, 29]; // the cross street
const FAR = 6000;
const SEA = X0 * GRADE - 4;

export const DEFAULT_PROPS = { car: true };

const gy = (x) => x * GRADE; // ground height along the road

// Road frame -> world.
const cr = Math.cos(ROT);
const sr = Math.sin(ROT);
const W = ([x, y, z]) => [x * cr + z * sr, y, -x * sr + z * cr];

export function build(props = {}, look = lookOf()) {
  const P = { ...DEFAULT_PROPS, ...props };
  const sub = (salt) => new Rng(hashInts(SEED, salt));
  const { list: materials, M } = makeMaterials(sub(1), look);
  const b = new MeshBuilder();
  const lights = [];
  const light = (p, c, r, k) => lights.push({ p: W(p), c, r, k });
  b.push();
  b.rotateY(ROT);

  // ---- the ground: one tilted plane, strips of it painted and raised
  const flat = (mat, x0, x1, z0, z1, lift = 0, flags = 0) => {
    b.use(mat, flags);
    b.quad([x0, gy(x0) + lift, z0], [x0, gy(x0) + lift, z1], [x1, gy(x1) + lift, z1], [x1, gy(x1) + lift, z0]);
  };
  // A raised slab on the slope: top, and the faces a curb shows.
  const slab = (mat, x0, x1, z0, z1, h) => {
    flat(mat, x0, x1, z0, z1, h, CAST);
    b.use(mat, CAST);
    const lo = -0.2;
    b.quad([x0, gy(x0) + lo, z0], [x1, gy(x1) + lo, z0], [x1, gy(x1) + h, z0], [x0, gy(x0) + h, z0]);
    b.quad([x1, gy(x1) + lo, z1], [x0, gy(x0) + lo, z1], [x0, gy(x0) + h, z1], [x1, gy(x1) + h, z1]);
    b.quad([x0, gy(x0) + lo, z1], [x0, gy(x0) + lo, z0], [x0, gy(x0) + h, z0], [x0, gy(x0) + h, z1]);
    b.quad([x1, gy(x1) + lo, z0], [x1, gy(x1) + lo, z1], [x1, gy(x1) + h, z1], [x1, gy(x1) + h, z0]);
  };
  const [cx0, cx1] = CROSS;
  // Roadway, the cross street, and the coast road at the bottom. Traffic
  // wears the middle of each lane of the boulevard.
  materials[M.road].lanes = { ax: sr, az: cr, centers: [-7.9, -3.13, 3.13, 7.9] };
  flat(M.road, X0 - 16, X1, -12, 12);
  flat(M.asphalt, cx0, cx1, -FAR, -12);
  flat(M.asphalt, cx0, cx1, 12, FAR);
  flat(M.asphalt, X0 - 16, X0, -FAR, -12);
  flat(M.asphalt, X0 - 16, X0, 12, FAR);
  // Median, sidewalks, and the lots behind them, stopping for the cross street.
  for (const [a, c] of [
    [X0, cx0],
    [cx1, X1],
  ]) {
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? -16.5 : 12;
      const z1 = s < 0 ? -12 : 16.5;
      slab(M.sidewalk, a, c, z0, z1, 0.15);
      flat(M.lot, a, c, s < 0 ? -60 : 16.5, s < 0 ? -16.5 : 60, 0.15);
      flat(M.field, a, c, s < 0 ? -FAR : 60, s < 0 ? -60 : FAR, 0.15);
    }
  }
  // The land ends at a low wall above the sea.
  flat(M.sidewalk, X0 - 22, X0 - 16, -FAR, FAR, 0.15);
  b.use(M.stucco, CAST);
  b.box(X0 - 22.4, gy(X0 - 22) - 6, -FAR, X0 - 22, gy(X0 - 22) + 1.0, FAR);
  // Markings: dashed lanes, a double yellow either side of the median,
  // parking lines, and zebra crossings at the corner.
  const line = (mat, z, x0, x1, dash = 0, gap = 0) => {
    const w = 0.07;
    if (!dash) return flat(mat, x0, x1, z - w, z + w, 0.012);
    for (let x = x0; x < x1; x += dash + gap) flat(mat, x, Math.min(x1, x + dash), z - w, z + w, 0.012);
  };
  for (const [a, c] of [
    [X0, cx0],
    [cx1, X1],
  ]) {
    for (const s of [-1, 1]) {
      line(M.lineWhite, s * 6.1, a, c, 3, 9);
      line(M.lineWhite, s * 9.7, a, c);
      line(M.lineYellow, s * 0.16, a, c);
    }
  }
  for (const x of [cx0 - 2.2, cx1 + 0.6]) {
    for (let z = -11.4; z < 11.5; z += 1.2) flat(M.lineWhite, x, x + 1.6, z, z + 0.6, 0.012);
  }

  // ---- palms down both sides, all the way to the sea
  const pr = sub(2);
  const palms = [];
  for (const s of [-1, 1]) {
    for (let x = X1 - 18 + (s > 0 ? 6 : 0); x > X0 + 8; x -= 16) {
      if (x > cx0 - 3 && x < cx1 + 3) continue;
      const z = s * 14.2 + pr.range(-0.3, 0.3);
      const near = x > -160 && x < 150;
      const info = addFanPalm(b, pr.fork(palms.length + 1), M, x, z, { height: pr.range(16, 22.5), ground: gy(x) + 0.15, lod: near ? 1 : 0.3 });
      palms.push({ x, z, ...info });
    }
  }
  // Street lamps between them.
  for (const s of [-1, 1]) {
    for (let x = X1 - 26; x > X0 + 20; x -= 48) {
      if (x > cx0 - 3 && x < cx1 + 3) continue;
      const L = lampPost(b, M, x, s * 12.6, gy(x) + 0.15, { height: 5.2, globe: 0.26, reach: 9 });
      light(L.p, L.c, L.r, L.k);
    }
  }

  // ---- buildings along both sides
  const br = sub(3);
  const walls = [M.stucco, M.salmon, M.mint, M.butter, M.skyBlue, M.lilac, M.stucco, M.stucco];
  const awnings = [M.awningRed, M.awningBlue, M.awningGreen];
  const words = ['SURF SHOP', 'RECORDS', 'COCKTAILS', 'MOTEL', 'PHARMACY', 'CINEMA', 'BAR', 'HOTEL'];
  let wi = 0;
  for (const s of [-1, 1]) {
    let x = 200;
    while (x > X0 + 10) {
      const w = br.range(14, 30);
      const xa = x - w;
      if (xa < cx1 + 1 && x > cx0 - 1) {
        x = cx0 - 1;
        continue;
      }
      // The diner has the downhill corner on the sunny side.
      if (s < 0 && x <= cx0 - 1 && xa > cx0 - 40) {
        x = cx0 - 31;
        continue;
      }
      const near = x > -200 && x < 130;
      const h = br.pick([4.4, 4.4, 5.2, 7.8, 7.8, 11.2]);
      const sign = near && br.chance(0.6) ? words[wi++ % words.length] : null;
      shop(b, M, br, s, xa, x, h, br.pick(walls), br.pick(awnings), sign, near, light);
      x = xa - br.range(2, 10);
    }
  }
  diner(b, M, -1, cx0 - 31, cx0 - 2, light);

  // ---- flowering bushes in planters along the shop fronts
  if (look.flowers) {
    const fl = sub(20);
    for (const s of [-1, 1]) {
      for (let x = X1 - 30 + (s > 0 ? 9 : 0); x > -240; x -= 23) {
        if (x > cx0 - 6 && x < cx1 + 6) continue;
        const r = fl.fork(Math.round(x * 10) + (s > 0 ? 7 : 0));
        if (r.chance(0.35)) continue;
        const z = s * 16.3;
        b.use(M.curb, CAST);
        b.box(x - 1.4, gy(x) + 0.15, z - 0.55, x + 1.4, gy(x) + 0.55, z + 0.55);
        for (const dxo of [-0.7, 0.7]) {
          b.push();
          b.translate(x + dxo, gy(x) + 0.55, z);
          addFlowerBush(b, M, r.fork(dxo > 0 ? 2 : 1), { r: 0.62, h: 0.62, kind: r.pick(['bougainvillea', 'oleander', 'hibiscus']) });
          b.pop();
        }
      }
    }
  }

  // ---- the curb: a meter for every space, hydrants near the corners and
  // now and then down the hill, papers by the diner door
  const lamps = new Set();
  for (let x = X1 - 26; x > X0 + 20; x -= 48) lamps.add(Math.round(x));
  const kerb = (fn, x, s) => {
    b.push();
    b.translate(x, gy(x) + 0.15, s * 12.45);
    if (s > 0) b.rotateY(Math.PI); // face the road
    fn();
    b.pop();
  };
  for (const s of [-1, 1]) {
    for (let x = X1 - 12 + 2.9; x > -260; x -= 6.4) {
      if (x > cx0 - 6 && x < cx1 + 6) continue;
      if (s > 0 && Math.abs(x - (cx0 - 15)) < 14) continue;
      if ([...lamps].some((l) => Math.abs(l - x) < 0.8)) continue;
      kerb(() => addMeter(b, M), x, s);
    }
    for (const x of [cx0 - 8.2, cx1 + 8.2, -104.3, 121.7, -212.5]) {
      if (!(s > 0 && Math.abs(x - (cx0 - 15)) < 14)) kerb(() => addHydrant(b, M), x, s);
    }
  }
  for (const [x, paint] of [
    [cx0 - 28.6, M.doorBlue],
    [cx0 - 27.9, M.doorYellow],
  ]) {
    b.push();
    b.translate(x, gy(x) + 0.15, -15.9);
    addNewsBox(b, M, paint);
    b.pop();
  }

  // ---- the traffic light at the corner, facing uphill
  signal(b, M, cx1 + 1.2, -12.8, light);

  // ---- parked cars, and the yellow convertible outside the diner
  const cr2 = sub(4);
  const cars = [];
  let slot = 0;
  for (const s of [-1, 1]) {
    for (let x = X1 - 12; x > -260; x -= 6.4) {
      if (x > cx0 - 5 && x < cx1 + 5) continue;
      const r = cr2.fork(++slot); // one stream per space along the curb
      const visitor = s < 0 && Math.abs(x - (cx0 - 14)) < 3.2;
      // Nothing parked right under the diner view's feet.
      if (s > 0 && Math.abs(x - (cx0 - 15)) < 14) continue;
      if (visitor ? !P.car || P.drive : !r.chance(0.32)) continue;
      // Parked with the traffic: downhill on the right, uphill on the left.
      b.push();
      b.translate(x, gy(x), s * 10.9);
      b.rotateY((s < 0 ? Math.PI : 0) + r.range(-0.02, 0.02));
      b.rotateZ((s < 0 ? -1 : 1) * Math.atan(GRADE));
      if (visitor) addCar(b, M, { paint: M.visitor });
      else parkedCar(b, M, r, { lod: x > -20 && x < 95 ? 1 : 0.3 });
      b.pop();
      cars.push({ x, s, visitor });
    }
  }
  // The visitor's car on the move, downhill: { x, z, lit } in the road frame.
  if (P.drive) {
    const { x, z, yaw = 0, lit } = P.drive;
    b.push();
    b.translate(x, gy(x), z);
    b.rotateY(Math.PI + yaw);
    b.rotateZ(-Math.atan(GRADE));
    addCar(b, M, { paint: M.visitor, lit });
    b.pop();
    const c = -Math.cos(yaw);
    const s = Math.sin(yaw);
    if (lit) {
      light([x + c * 5, gy(x + c * 5) + 0.8, z + s * 5], [1, 0.92, 0.72], 4.5, 1.2);
      light([x - c * 3, gy(x - c * 3) + 0.6, z - s * 3], [1, 0.2, 0.15], 1.4, 0.6);
    }
  }
  b.pop();

  // ---- far off: the mountains coming down to the sea on the right
  hills(b, sub(5), M.headland, { n: 4, az: [300, 345], dist: [3500, 9000], height: [250, 700], base: SEA });
  hills(b, sub(6), M.scenery, { n: 5, az: [20, 150], dist: [3000, 8000], height: [150, 500] });

  const mesh = finalizeMesh(b);
  // Views in the road frame; headings are turned into compass headings.
  const view = (eye, heading, fovY, horizon) => level(W(eye), heading + (AZ - 270), fovY, horizon);
  const box = [W([130, 0, -60]), W([130, 0, 60]), W([-260, 0, -60]), W([-260, 0, 60])];
  return {
    id: 'boulevard',
    name: NAME,
    props: P,
    mesh,
    materials,
    look,
    sky: makeSky(sub(7), { clouds: look.clouds.boulevard, streaks: [2, 4], gulls: [0, 3] }, look),
    seaLevel: SEA,
    lights,
    shadowBox: {
      min: [Math.min(...box.map((p) => p[0])), -12, Math.min(...box.map((p) => p[2]))],
      max: [Math.max(...box.map((p) => p[0])), 28, Math.max(...box.map((p) => p[2]))],
    },
    layout: { palms, cars, cross: CROSS },
    // For compositions along the road: road frame -> world, the ground,
    // and how far road headings are turned from compass headings.
    road: { toWorld: W, ground: gy, turn: AZ - 270 },
    views: {
      sunset: view([70, gy(70) + 1.6, -1.2], 270, 26, 0.34),
      diner: view([cx0 - 15, gy(cx0 - 15) + 1.62, 15], 0, 36, 0.3),
      uphill: view([-60, gy(-60) + 1.6, 4.5], 90, 30, 0.32),
    },
    hero: 'sunset',
  };
}

// A low commercial building on the slope, its front on the sidewalk line.
function shop(b, M, rng, s, xa, xb, h, wall, awning, word, near, light) {
  const f = s * 17.4; // facade plane
  const d = rng.range(12, 20) * s;
  const y0 = gy(xa) - 0.4;
  const top = gy(xb) + 0.15 + h;
  b.use(wall, CAST);
  const za = Math.min(f, f + d);
  const zb = Math.max(f, f + d);
  b.box(xa, y0, za, xb, top, zb);
  b.use(M.trim, CAST);
  b.box(xa - 0.2, top, za - 0.2, xb + 0.2, top + 0.35, zb + 0.2);
  if (!near) {
    // Far down the hill: a window band is enough.
    b.object();
    b.use(M.glass, CAST);
    const y = gy(xb) + 1.0;
    const fz = f - s * 0.02;
    if (s < 0) b.quad([xa + 1, y, fz], [xb - 1, y, fz], [xb - 1, y + 1.8, fz], [xa + 1, y + 1.8, fz]);
    else b.quad([xb - 1, y, fz], [xa + 1, y, fz], [xa + 1, y + 1.8, fz], [xb - 1, y + 1.8, fz]);
    return;
  }
  // Storefront glass between piers, stepping down the slope with the street.
  const bays = Math.max(1, Math.round((xb - xa) / 4.5));
  const bw = (xb - xa) / bays;
  const fz = f - s * 0.02;
  for (let i = 0; i < bays; i++) {
    const x0 = xa + i * bw + 0.35;
    const x1 = xa + (i + 1) * bw - 0.35;
    const g = gy(x1) + 0.15;
    b.object();
    b.use(M.glass, CAST);
    if (s < 0) b.quad([x0, g + 0.45, fz], [x1, g + 0.45, fz], [x1, g + 2.9, fz], [x0, g + 2.9, fz]);
    else b.quad([x1, g + 0.45, fz], [x0, g + 0.45, fz], [x0, g + 2.9, fz], [x1, g + 2.9, fz]);
    light([(x0 + x1) / 2, g + 1.6, f - s * 1.2], [1, 0.75, 0.46], 2.6, 0.55);
  }
  // Upper floors: a ribbon window per floor.
  for (let y = 4.4; y + 3 < h; y += 3.3) {
    b.object();
    b.use(M.glass, CAST);
    const g = gy(xb) + 0.15 + y;
    if (s < 0) b.quad([xa + 0.8, g + 0.8, fz], [xb - 0.8, g + 0.8, fz], [xb - 0.8, g + 2.2, fz], [xa + 0.8, g + 2.2, fz]);
    else b.quad([xb - 0.8, g + 0.8, fz], [xa + 0.8, g + 0.8, fz], [xa + 0.8, g + 2.2, fz], [xb - 0.8, g + 2.2, fz]);
  }
  // A striped awning over the sidewalk.
  const ay = gy(xb) + 0.15 + 3.35;
  b.use(awning, CAST | DOUBLE);
  const out = f - s * 1.7;
  const U = [0, 0, xb - xa, 0, xb - xa, 1, 0, 1];
  b.quad([xa + 0.3, ay, f], [xb - 0.3, ay, f], [xb - 0.3, ay - 0.75, out], [xa + 0.3, ay - 0.75, out], U);
  b.quad([xa + 0.3, ay - 0.75, out], [xb - 0.3, ay - 0.75, out], [xb - 0.3, ay - 1.05, out], [xa + 0.3, ay - 1.05, out], U);
  if (word) {
    b.push();
    b.translate((xa + xb) / 2, Math.min(top - 0.9, ay + 0.35), f);
    if (s > 0) b.rotateY(Math.PI);
    const size = Math.min(0.62, (xb - xa - 3) / ((word.length * 5.6) / 6));
    addBoard(b, M, word, { size, board: M.signCream, paint: rng.pick([M.signRed, M.signNavy, M.signTeal]), neon: rng.pick([M.neonPink, M.neonCyan, M.neonRed]), depth: 0.1 });
    b.pop();
    light([(xa + xb) / 2, ay + 1, f - s * 1.5], [1, 0.5, 0.6], 3, 0.6);
  }
}

// A streamline diner on the downhill corner: a long low box, a rounded
// end toward the intersection, wrap-around windows, speed stripes, and
// DINER on the roof in neon.
function diner(b, M, s, xa, xb, light) {
  const f = s * 17.4; // the street face
  const d = 12;
  const g = gy(xa) + 0.15;
  const h = 4.6;
  const R = d / 2;
  const xr = xb - R; // center of the rounded end
  const zc = f + s * R;
  const z0 = Math.min(f, f + s * d);
  const z1 = Math.max(f, f + s * d);
  b.object();
  b.use(M.stucco, CAST);
  b.box(xa, g - 0.8, z0, xr, g + h, z1);
  b.use(M.stucco, CAST | SMOOTH);
  // The rounded end faces the corner: half a cylinder on the +x side.
  const arc = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
  const seg = 14;
  b.push();
  b.translate(xr, g - 0.8, zc);
  for (let i = 0; i < seg; i++) {
    const a0 = -Math.PI / 2 + (i / seg) * Math.PI;
    const a1 = -Math.PI / 2 + ((i + 1) / seg) * Math.PI;
    const p0 = arc(a0, R);
    const p1 = arc(a1, R);
    const n0 = arc(a0, 1);
    const n1 = arc(a1, 1);
    b.quad(p0, [p0[0], h + 0.8, p0[2]], [p1[0], h + 0.8, p1[2]], p1, null, [n0, n0, n1, n1]);
    b.use(M.trim, CAST);
    b.tri([0, h + 0.8, 0], [p1[0], h + 0.8, p1[2]], [p0[0], h + 0.8, p0[2]]);
    b.use(M.stucco, CAST | SMOOTH);
  }
  b.pop();
  // Roof fascia, and three red speed stripes wrapping the rounded end.
  b.use(M.trim, CAST);
  b.box(xa - 0.2, g + h, z0 - 0.25, xr, g + h + 0.4, z1 + 0.25);
  b.use(M.signRed, CAST | SMOOTH);
  for (const y of [0.55, 0.8, 1.05]) {
    b.box(xa, g + y, Math.min(f, f - s * 0.03), xr, g + y + 0.1, Math.max(f, f - s * 0.03));
    b.push();
    b.translate(xr, g + y, zc);
    for (let i = 0; i < seg; i++) {
      const a0 = -Math.PI / 2 + (i / seg) * Math.PI;
      const a1 = -Math.PI / 2 + ((i + 1) / seg) * Math.PI;
      const q0 = arc(a0, R + 0.03);
      const q1 = arc(a1, R + 0.03);
      b.quad(q0, [q0[0], 0.1, q0[2]], [q1[0], 0.1, q1[2]], q1, null, [arc(a0, 1), arc(a0, 1), arc(a1, 1), arc(a1, 1)]);
    }
    b.pop();
  }
  // Wrap-around windows: along the street face, and round the end.
  b.object();
  b.use(M.glass, CAST);
  const wy0 = g + 1.4;
  const wy1 = g + 3.3;
  const fz = f - s * 0.02;
  if (s > 0) b.quad([xr, wy0, fz], [xa + 1.5, wy0, fz], [xa + 1.5, wy1, fz], [xr, wy1, fz]);
  else b.quad([xa + 1.5, wy0, fz], [xr, wy0, fz], [xr, wy1, fz], [xa + 1.5, wy1, fz]);
  b.push();
  b.translate(xr, 0, zc);
  // Glass round the end, starting from the street side.
  for (let i = s > 0 ? 0 : 4; i < (s > 0 ? 10 : 14); i++) {
    const a0 = -Math.PI / 2 + (i / seg) * Math.PI;
    const a1 = -Math.PI / 2 + ((i + 1) / seg) * Math.PI;
    const q0 = arc(a0, R + 0.02);
    const q1 = arc(a1, R + 0.02);
    b.quad([q1[0], wy0, q1[2]], [q0[0], wy0, q0[2]], [q0[0], wy1, q0[2]], [q1[0], wy1, q1[2]]);
  }
  b.pop();
  b.use(M.frame, CAST);
  for (let x = xa + 1.5; x < xr; x += 1.6) b.box(x - 0.04, wy0, Math.min(f, f - s * 0.08), x + 0.04, wy1, Math.max(f, f - s * 0.08));
  for (let i = 0; i < 4; i++) light([xa + 3 + i * 5, g + 2.2, f - s * 1.4], [1, 0.8, 0.5], 3, 0.7);
  // DINER along the roof, neon over painted letters.
  b.push();
  b.translate((xa + xr) / 2, g + h + 0.4, f + s * 0.1);
  if (s > 0) b.rotateY(Math.PI); // face the street
  b.use(M.trim, CAST);
  b.box(-0.08, 0, 0.0, 0.08, 1.6, 0.3);
  b.translate(0, 0.15, 0);
  neonWord(b, M, 'DINER', { size: 1.35, paint: M.signRed, neon: M.neonRed, stroke: 0.24 });
  b.pop();
  light([(xa + xr) / 2, g + h + 1.2, f - s * 1], [1, 0.3, 0.25], 6, 1.0);
  // A pole sign on the corner: COFFEE.
  const px = xb - 1.5;
  const pz = f - s * 1.6;
  b.use(M.trim, CAST);
  b.box(px - 0.12, g, pz - 0.12, px + 0.12, g + 7.5, pz + 0.12);
  b.push();
  b.translate(px, g + 7.2, pz);
  b.rotateY(-Math.PI / 2);
  b.use(M.signTeal, CAST);
  b.box(-2.3, 0, -0.18, 2.3, 1.3, 0.18);
  for (const sd of [1, -1]) {
    b.push();
    if (sd < 0) b.rotateY(Math.PI);
    b.translate(0, 0.3, 0.18);
    neonWord(b, M, 'COFFEE', { size: 0.7, paint: M.signCream, neon: M.neonCyan, stroke: 0.14 });
    b.pop();
  }
  b.pop();
  light([px - 1, g + 7.8, pz], [0.4, 0.9, 1], 4, 0.8);
}

// A mast-arm traffic signal on the near corner, heads facing uphill (+x).
function signal(b, M, x, z, light) {
  const g = gy(x) + 0.15;
  b.object();
  b.use(M.signalBody, CAST | SMOOTH);
  b.push();
  b.translate(x, g, z);
  b.cylinder(0.16, 0.12, 0, 6.2, 10, { caps: false });
  b.pop();
  b.tube([[x, g + 5.9, z], [x, g + 6.0, z + 4.2], [x, g + 5.95, z + 8.5]], [0.09, 0.08, 0.06], 8);
  for (const hz of [z + 4.5, z + 8.2]) {
    b.use(M.signalBody, CAST);
    b.box(x + 0.1, g + 4.8, hz - 0.2, x + 0.42, g + 5.95, hz + 0.2);
    b.use(M.signalRed, CAST | SMOOTH);
    b.push();
    b.translate(x + 0.43, g + 5.6, hz);
    b.rotateZ(-Math.PI / 2);
    b.cylinder(0.11, 0.11, 0, 0.03, 10);
    b.pop();
    b.use(M.rope, CAST);
    for (const y of [5.25, 4.93]) b.box(x + 0.42, g + y - 0.1, hz - 0.1, x + 0.45, g + y + 0.1, hz + 0.1);
    light([x + 1, g + 5.6, hz], [1, 0.25, 0.2], 2.2, 0.8);
  }
}
