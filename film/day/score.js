// One Day in Paloma Bay: the shooting script.
//
// Thirteen shots from before dawn to the last room going, and the film
// passes through every postcard in the book: at each card's minute the
// frame is that page (from the same view, with the same things left out)
// and a caption says where and when. Two clocks run at once: the light
// runs fifty to a hundred times fast, so a shot covers minutes of the day,
// while wind, water, birds and the car run in real time.
//
// Everything is timed in bars of the score, 76 beats a minute, so cuts
// land on the music. The music and the sound read these shots too.

import { propsAt, whereIs } from '../../src/visitor.js';
import { level } from '../../src/camera.js';
import { buildPlace } from '../../src/scenes/index.js';
import { sunDirection } from '../../src/sky.js';
import { hash2 } from '../../src/math.js';
import { clamp01, lerp, smooth, travel, speedAt, path } from '../paths.js';

export const FPS = 24;
export const BPM = 76;
export const BAR = 240 / BPM;
const DEG = Math.PI / 180;

// Layouts and views, for the things the film moves: built once, at rest.
const memo = {};
export function place(id) {
  memo[id] ??= buildPlace(id);
  return memo[id];
}

// "4:51 A.M."
export function clockText(hours) {
  const m = Math.round(hours * 60) % 1440;
  const hh = Math.floor(m / 60);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${hh < 12 ? 'A.M.' : 'P.M.'}`;
}

// ---------------------------------------------------------------- the boulevard

const road = () => place('boulevard').road;
const roadLevel = (eye, heading, fovY, horizon) => level(road().toWorld(eye), heading + road().turn, fovY, horizon);
const gy = (x) => road().ground(x);

// Breakfast: down the hill in the curb lane from the right, over into the
// parking lane, and into the space outside the diner the stills show it in.
const DINER_SPOT = 2.4;
const dinerLane = (x) => -7.9 - 3.0 * smooth(15, 5, x);
export const DINER_SPEED = [
  [0, 13],
  [2.4, 13],
  [7.4, 0],
  [99, 0],
];
const dinerD = travel(DINER_SPEED);
const DINER = (() => {
  const run = dinerD(99);
  const pts = [];
  for (let x = DINER_SPOT + run + 2; x >= DINER_SPOT; x -= 0.2) pts.push([x, dinerLane(x)]);
  return path(pts);
})();
export const DINER_PARK = 7.4; // seconds into the shot: stopped
export const DINER_KEY = 7.9; // the key turns and the radio stops
export const DINER_DOOR = 8.6;
function dinerCar(s) {
  const p = DINER.pose(DINER.length - (dinerD(99) - dinerD(s)));
  return { x: p.x, z: p.z, yaw: Math.atan2(p.dz, -p.dx) };
}

// ---------------------------------------------------------------- the motel

// Home: north up the coast highway, right into the lot, into its stall.
const HOME = (() => {
  const pts = [];
  for (let z = 40; z > 14.5; z -= 0.25) pts.push([-35.5, z]);
  for (let a = Math.PI; a <= 1.5 * Math.PI + 1e-9; a += Math.PI / 40) pts.push([-30.5 + 5 * Math.cos(a), 14.5 + 5 * Math.sin(a)]);
  for (let x = -30.3; x <= -5.2; x += 0.25) pts.push([x, 9.5 + 0.2 * smooth(-30, -12, x)]);
  return path(pts);
})();
export const HOME_SPEED = [
  [0, 12],
  [1.4, 12],
  [2.9, 6],
  [6.9, 6],
  [9.2, 0],
  [99, 0],
];
const homeD = travel(HOME_SPEED);
export const HOME_PARK = 9.2;
export const HOME_KEY = 9.6;
export const HOME_LIGHTS = 9.9; // headlights off
export const HOME_DOOR = 10.4;
export const HOME_ROOM = 12.6; // the room light comes on
export const HOME_NO = 13.4; // and the last room is gone
function homeCar(s) {
  const d = Math.min(HOME.length, homeD(s) - (homeD(99) - HOME.length));
  const p = HOME.pose(Math.max(0, d));
  const y = 0.15 * smooth(-32.8, -32, p.x) * (1 - smooth(-29.2, -28.4, p.x));
  return { x: p.x, y, z: p.z, yaw: Math.atan2(-p.dz, p.dx) };
}

// ---------------------------------------------------------------- the sloop

// Out past the harbor mouth at six, a small white sail far off...
function sloopOut(s) {
  return { x: -168 - 2.6 * s, z: 104 + 1.1 * s, yaw: Math.PI + 0.4, sails: 1, boom: -0.5 };
}
// ...and home around the lighthouse at dusk, running before the breeze,
// gone into the harbor by the time the picture is the postcard.
const ROUND = (() => {
  const way = [
    [-236, 150],
    [-224, 146],
    [-205, 140],
    [-192, 126],
    [-188, 112],
    [-186, 96],
  ];
  // Catmull-Rom through the waypoints, finely sampled.
  const pts = [];
  for (let i = 0; i + 1 < way.length; i++) {
    const p0 = way[Math.max(0, i - 1)];
    const p1 = way[i];
    const p2 = way[i + 1];
    const p3 = way[Math.min(way.length - 1, i + 2)];
    for (let k = 0; k < 20; k++) {
      const u = k / 20;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(way[way.length - 1]);
  return path(pts);
})();
function sloopHome(s) {
  const p = ROUND.pose(Math.min(ROUND.length, 12 + 6 * s));
  return { x: p.x, z: p.z, yaw: Math.atan2(-p.dz, p.dx), sails: 1, boom: 1.0 };
}

// ---------------------------------------------------------------- shots

// When the boulevard's sun touches the sea: the score lifts a key there.
function sunTouch() {
  let lo = 18.4;
  let hi = 19.0;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const el = Math.asin(sunDirection(mid)[1]) / DEG;
    if (el > 2.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Each shot either runs through a postcard, with the card's minute `sc`
// seconds in and the clock running at `rate` hours a second, or simply
// spans `hours`.
const SHOTS = [
  { id: 'predawn', bars: 5, place: 'motel', view: 'front', card: 4.85, sc: 11.4, rate: 0.0177, caption: 'THE MOTEL', wind: 0.35, title: true },
  { id: 'sunrise', bars: 3, place: 'motel', camera: () => level([-24, 1.75, -19.4], 63.5, 44, 0.36), hours: [5.1, 5.42], wind: 0.5, flock: { az: 52, el: 13, n: 2, speed: 1.6 } },
  {
    id: 'diner',
    bars: 5,
    place: 'boulevard',
    card: 8.3,
    sc: 11.4,
    rate: 0.0089,
    caption: 'THE DINER',
    // The pan follows the car in and settles on the postcard as it parks.
    camera: (s) => roadLevel([0, gy(0) + 1.62, 15], 17 * (1 - smooth(1.2, DINER_PARK + 0.4, s)), 36, 0.3),
    props: (s) => ({ drive: dinerCar(Math.min(s, DINER_PARK)) }),
    blur: (s) => speedAt(DINER_SPEED, s) > 0.3,
  },
  { id: 'house', bars: 3, place: 'house', view: 'front', card: 9.8, sc: 5.0, rate: 0.0148, caption: 'THE HOUSE' },
  {
    id: 'pool',
    bars: 4,
    place: 'house',
    view: 'pool',
    card: 11.6,
    sc: 7.6,
    rate: 0.0158,
    caption: 'THE POOL',
    // The float drifts on through the book's position at the card.
    props: (s, h, sc) => ({ float: 0.375 + (0.05 * (s - sc)) / 12.6, page: s }),
    flock: { az: 60, el: 20, n: 2, speed: -1.2 },
  },
  { id: 'beach', bars: 4, place: 'beach', view: 'tower', card: 14.2, sc: 7.6, rate: 0.0158, caption: 'THE BEACH', wind: 1.2, flock: { az: 70, el: 16, n: 3, speed: 1.4 } },
  { id: 'shore', bars: 4, place: 'beach', view: 'shore', hours: [14.67, 15.05], wind: 1.2, pelicans: { az: 330, el: 1.2, n: 5, speed: 1.1 } },
  { id: 'pier', bars: 3, place: 'beach', view: 'pier', card: 16.2, sc: 5.0, rate: 0.0169, caption: 'FROM THE PIER', wind: 1.1, flock: { az: 118, el: 14, n: 3, speed: -1.5 } },
  {
    id: 'marina',
    bars: 4,
    place: 'marina',
    view: 'harbor',
    card: 18.1,
    sc: 7.6,
    rate: 0.0158,
    caption: 'THE MARINA',
    props: (s) => ({ sloop: 'out', sloopAt: sloopOut(s) }),
    flock: { az: 230, el: 15, n: 2, speed: 1.2 },
  },
  {
    id: 'sunset',
    bars: 6,
    place: 'boulevard',
    // The sun touches the sea on the second bar line, where the key lifts;
    // the card follows as it goes down.
    card: 18.8,
    sc: 13.6,
    rate: (18.8 - sunTouch()) / (13.6 - 2 * BAR),
    caption: 'THE BOULEVARD',
    // A slow push down the middle of the street, through the postcard's spot.
    camera: (s, u, sc) => {
      const x = 70 - (7.5 * (s - sc)) / (6 * BAR);
      return roadLevel([x, gy(x) + 1.6, -1.2], 270, 26, 0.34);
    },
    power: (s) => {
      const k = catchOn(s - 15.2, 3);
      return { globe: k * 2.2, lamp: k * 2.2, neonPink: k * 2, neonCyan: k * 2, neonRed: k * 2, neonWhite: k * 2 };
    },
  },
  {
    id: 'lighthouse',
    bars: 4,
    place: 'marina',
    view: 'lighthouse',
    card: 19.45,
    sc: 8.2,
    rate: 0.0127,
    caption: 'THE LIGHTHOUSE',
    props: (s, h) => (h < 19.4 ? { sloop: 'out', sloopAt: sloopHome(s) } : {}),
    power: (s, h) => ({ beacon: beacon(h, s) }),
  },
  {
    id: 'home',
    bars: 5,
    place: 'motel',
    hours: [20.73, 20.87],
    // A slow pan with the car up the highway and into the lot, coming to
    // rest on the postcard's view.
    camera: (s) => level([-56, 1.6, 1.5], 90 + 16 * (1 - smooth(0.4, 8.6, s)), 30, 0.3),
    props: (s) => ({
      carAt: { ...homeCar(Math.min(s, HOME_PARK)), lit: s < HOME_LIGHTS },
      noVacancy: catchOn(s - HOME_NO, 21) > 0,
      roomLight: smooth(HOME_ROOM, HOME_ROOM + 0.25, s),
    }),
    blur: (s) => speedAt(HOME_SPEED, s) > 0.3,
    wind: 0.4,
  },
  { id: 'night', bars: 5, place: 'motel', view: 'front', card: 22.0, sc: 3.0, rate: 0.0089, caption: 'THE MOTEL', props: () => ({ roomLight: 1 }), wind: 0.4, wish: true },
  { id: 'titles', bars: 3 },
];

let t0 = 0;
for (const s of SHOTS) {
  s.t0 = t0;
  s.t1 = t0 + s.bars * BAR;
  s.len = s.t1 - s.t0;
  if (s.card !== undefined) s.hours = [s.card - s.rate * s.sc, s.card + s.rate * (s.len - s.sc)];
  t0 = s.t1;
}
export { SHOTS };
export const DURATION = t0;
export const FRAMES = Math.round(DURATION * FPS);
export const shot = (id) => SHOTS.find((s) => s.id === id);

// A light that catches: off, then stuttering on.
export function catchOn(t, seed) {
  if (t <= 0) return 0;
  if (t > 0.8) return 1;
  return hash2(Math.floor(t * 24), seed) < 0.2 + t ? 1 : 0;
}

// The lighthouse's character: one flash every six seconds, the beam's
// sweep rising and falling. Dark while there is daylight.
export function beacon(hours, s) {
  const ph = (s % 6) / 6;
  const flash = Math.exp(-(((ph - 0.5) / 0.05) ** 2));
  return 0.15 + 2.6 * flash;
}

// ---------------------------------------------------------------- the sky's cast

function animateSky(sky, t, s, sh) {
  for (const c of sky.clouds) c.az += 0.12 * t;
  for (const st of sky.streaks) st.az += 0.08 * t;
  sky.gulls.forEach((g, i) => {
    const ph = hash2(i, 7) * 6.28;
    g.az += (hash2(i, 3) > 0.5 ? 1 : -1) * (0.8 + 0.5 * hash2(i, 5)) * t;
    g.el += Math.sin(0.4 * t + ph);
    g.a = 0.2 * Math.sin(0.5 * t + ph);
    g.flap = Math.sin(0.6 * t + ph * 2) > 0.4 ? 0.35 + 0.95 * Math.cos(2 * Math.PI * 3 * t + ph) : 1;
  });
  const mid = s - sh.len / 2;
  if (sh.flock) flock(sky, mid, sh.flock, 0.7, 2, 3);
  if (sh.pelicans) flock(sky, mid, sh.pelicans, 1.4, 2.6, 0.9, true);
  sky.t = t;
}

// Birds crossing the shot; `s` is seconds from its middle. Pelicans fly
// low in a line, a few slow beats and a long glide.
function flock(sky, s, { az, el, n, speed }, size, weight, beat, line = false) {
  for (let i = 0; i < n; i++) {
    const ph = hash2(i, 91) * 6.28;
    const gliding = line ? Math.sin(0.5 * s + i * 0.6) < 0.3 : Math.sin(0.9 * s + ph) < 0.1;
    sky.gulls.push({
      az: az + (line ? i * 1.3 : (hash2(i, 17) - 0.5) * 9) + speed * s,
      el: el + (line ? 0.1 * Math.sin(0.8 * s + i) : (hash2(i, 29) - 0.5) * 5 + 0.7 * Math.sin(0.6 * s + ph)),
      s: size * (0.85 + 0.3 * hash2(i, 37)),
      a: line ? 0 : 0.2 * Math.sin(0.5 * s + ph),
      w: weight,
      flap: gliding ? 1 : 0.35 + 0.9 * Math.cos(2 * Math.PI * beat * s + (line ? i * 0.5 : ph)),
    });
  }
}

// ---------------------------------------------------------------- frames

/**
 * What frame i shows: the place, its props and the hour, the camera, the
 * sky, the power to lamps and signs, motion blur, and the lettering.
 */
export function frame(i) {
  const t = i / FPS;
  const sh = SHOTS.find((x) => t < x.t1) ?? SHOTS[SHOTS.length - 1];
  const s = t - sh.t0;
  const u = s / sh.len;
  const spec = { i, t, shot: sh.id, s, fade: 1, scene: null, blur: null, text: [] };
  if (sh.id === 'titles') {
    spec.text = endTitles(s);
    return spec;
  }
  const at = (ss) => {
    const tt = sh.t0 + ss;
    const hours = lerp(sh.hours[0], sh.hours[1], ss / sh.len);
    const props = { ...propsAt(sh.place, hours), ...(sh.props ? sh.props(ss, hours, sh.sc) : {}) };
    return {
      place: sh.place,
      hours,
      props,
      camera: sh.camera ? sh.camera(ss, ss / sh.len, sh.sc) : place(sh.place).views[sh.view],
      motion: { t: tt, wind: sh.wind ?? 0.9 },
      sky: (sky) => animateSky(sky, tt, ss, sh),
      power: sh.power ? sh.power(ss, hours) : null,
    };
  };
  spec.scene = at(s);
  // A 180-degree shutter for the car while it moves: four exposures across
  // half a frame, averaged.
  if (sh.blur && sh.blur(s)) spec.blur = [0.25, 0.5, 0.75].map((k) => at(s - (k * 0.5) / FPS));
  // Fades: up from black at the start, down to black at the end, and a
  // breath of black between the evening and the night.
  if (sh.id === 'predawn') spec.fade = smooth(0.2, 2.6, s);
  if (sh.id === 'night') spec.fade = 1 - smooth(sh.len - 2.2, sh.len - 0.2, s);
  if (sh.id === 'home') spec.fade = smooth(0, 0.8, s);
  if (sh.id === 'lighthouse') spec.fade = 1 - smooth(sh.len - 0.8, sh.len, s);
  spec.text = lettering(sh, s);
  return spec;
}

// Captions: the place and the card's minute, fading up at the card moment.
function lettering(sh, s) {
  const out = [];
  if (sh.title) {
    const a = smooth(1.6, 3.2, s) * (1 - smooth(7.4, 9.0, s));
    out.push({ text: 'ONE DAY IN', x: 0.5, y: 0.34, cap: 0.022, align: 'center', alpha: a, tracking: 0.9 });
    out.push({ text: 'PALOMA BAY', x: 0.5, y: 0.43, cap: 0.052, align: 'center', alpha: a, tracking: 0.55 });
  }
  if (sh.caption) {
    const a = smooth(sh.sc, sh.sc + 0.7, s) * (1 - smooth(sh.sc + 3.4, sh.sc + 4.2, s));
    if (a > 0) out.push({ text: `${sh.caption} · ${clockText(sh.card)}`, x: 0.065, y: 0.91, cap: 0.019, align: 'left', alpha: a, tracking: 0.55 });
  }
  if (sh.wish) {
    const a = smooth(sh.len - 7.6, sh.len - 6.2, s);
    out.push({ text: 'WISH YOU WERE HERE', x: 0.5, y: 0.3, cap: 0.03, align: 'center', alpha: a, tracking: 0.6 });
  }
  return out;
}

function endTitles(s) {
  const a = smooth(0.4, 1.6, s) * (1 - smooth(8.0, 9.4, s));
  const b = smooth(1.6, 2.8, s) * (1 - smooth(8.0, 9.4, s));
  return [
    { text: 'PALOMA BAY', x: 0.5, y: 0.47, cap: 0.04, align: 'center', alpha: a, tracking: 0.55 },
    { text: 'EVERY PICTURE, SOUND AND NOTE MADE FROM RULES', x: 0.5, y: 0.56, cap: 0.014, align: 'center', alpha: b * 0.8, tracking: 0.5 },
  ];
}

// Where the visitor's car is, for the sound: which place and how far.
export { whereIs };
export { dinerCar, homeCar, sloopHome, sloopOut };
