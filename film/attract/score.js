// PALOMA BAY, the attract mode: a video game from a summer that never
// happened, playing one day in town from before dawn to the last room
// going at the motel. Someone drops a coin in, presses start, and plays
// the visitor, who is never seen: only their yellow car, a towel on the
// sand, an empty slip at the marina.
//
// This is the score in the sense of a film's shooting script. Everything
// lives on one clock, in bars of the soundtrack: at 100 beats a minute a
// bar is 2.4 seconds, and every section is four bars long. `frame(i)`
// says what frame i shows; the music and the sound effects read the same
// sections, so a door closes when the car has parked.

import { propsAt } from '../../src/visitor.js';
import { level, levelAt } from '../../src/camera.js';
import { buildPlace } from '../../src/scenes/index.js';
import { hash2 } from '../../src/math.js';
import * as S from './screen.js';

export const FPS = 30;
export const BPM = 100;
export const BAR = 240 / BPM;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const lerp = (a, b, u) => a + (b - a) * u;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- motion helpers

// Distance covered under a piecewise-linear speed profile [[t, v], ...].
function travel(profile) {
  return (t) => {
    let d = 0;
    for (let i = 0; i + 1 < profile.length; i++) {
      const [t0, v0] = profile[i];
      const [t1, v1] = profile[i + 1];
      if (t <= t0) break;
      const te = Math.min(t, t1);
      const vt = v0 + ((v1 - v0) * (te - t0)) / (t1 - t0);
      d += ((v0 + vt) / 2) * (te - t0);
    }
    return d;
  };
}

function speedAt(profile, t) {
  if (t <= profile[0][0]) return profile[0][1];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [t0, v0] = profile[i];
    const [t1, v1] = profile[i + 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return profile[profile.length - 1][1];
}

// A path through [x, z] points: position and heading at a distance along it.
function path(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = cum[cum.length - 1];
  const at = (d) => {
    d = Math.max(0, Math.min(length, d));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const a = points[i - 1];
    const b = points[i];
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k };
  };
  const pose = (d) => {
    const p = at(d);
    const q0 = at(d - 0.6);
    const q1 = at(d + 0.6);
    return { ...p, dx: q1.x - q0.x, dz: q1.z - q0.z };
  };
  return { length, at, pose };
}

// ---------------------------------------------------------------- the sky's cast in motion

// Clouds drift across the dome and gulls wheel; `s` is film seconds.
function animateSky(sky, s, { drift = 0.35 } = {}) {
  for (const c of sky.clouds) c.az += drift * s;
  for (const st of sky.streaks) st.az += drift * 0.6 * s;
  sky.gulls.forEach((g, i) => {
    const ph = hash2(i, 7) * 6.28;
    const dir = hash2(i, 3) > 0.5 ? 1 : -1;
    g.az += dir * (1.1 + 0.6 * hash2(i, 5)) * s;
    g.el += 1.2 * Math.sin(0.4 * s + ph);
    g.a = 0.25 * Math.sin(0.5 * s + ph);
    // Bursts of wingbeats between long glides.
    const beating = Math.sin(0.7 * s + ph * 2) > 0.35;
    g.flap = beating ? 0.35 + 0.95 * Math.cos(2 * Math.PI * 3.2 * s + ph) : 1;
  });
}

// A few gulls crossing the shot: `s` is seconds from the middle of it.
function flock(sky, s, { az, el, n, speed }) {
  for (let i = 0; i < n; i++) {
    const ph = hash2(i, 91) * 6.28;
    const beating = Math.sin(0.9 * s + ph) > 0.1;
    sky.gulls.push({
      az: az + (hash2(i, 17) - 0.5) * 9 + speed * (1 + 0.25 * hash2(i, 5)) * s,
      el: el + (hash2(i, 29) - 0.5) * 5 + 0.7 * Math.sin(0.6 * s + ph),
      s: 0.95 + 0.4 * hash2(i, 37),
      w: 2.3,
      a: 0.22 * Math.sin(0.5 * s + ph),
      flap: beating ? 0.3 + 0.95 * Math.cos(2 * Math.PI * 3 * s + ph) : 1,
    });
  }
}

// A tube that catches: off, then stuttering on.
export function catchOn(t, seed) {
  if (t <= 0) return 0;
  if (t > 0.8) return 1;
  const k = Math.floor(t * 30);
  return hash2(k, seed) < 0.2 + t ? 1 : 0;
}

// ---------------------------------------------------------------- the places

const PLACE = { motel: 'THE MOTEL', boulevard: 'THE BOULEVARD', house: 'THE HOUSE', beach: 'THE BEACH', marina: 'THE MARINA' };

// Layouts, for the things the film moves: built once, at rest.
const memo = {};
function layout(place, props = {}) {
  memo[place] ??= buildPlace(place, props);
  return memo[place];
}

// The boulevard in its road frame: x along the road (the sea toward -x),
// z across it.
const roadWorld = (p) => layout('boulevard').road.toWorld(p);
const gy = (x) => layout('boulevard').road.ground(x);
const roadView = (eye, target, fovY, horizon) => levelAt(roadWorld(eye), roadWorld(target), fovY, horizon);

// ---- stage 2: breakfast. The yellow car comes down the boulevard, gets
// into the curb lane before the corner, and pulls in outside the diner.
const lane = (x) => -3.2 - 4.7 * smooth(76, 44, x) - 3.0 * smooth(14, 3, x);
const MORNING = (() => {
  const pts = [];
  // Stops short of the lamp post outside the diner.
  for (let x = 140; x >= 4.5; x -= 0.25) pts.push([x, lane(x)]);
  return path(pts);
})();
export const MORNING_SPEED = [
  [0, 17],
  [3.4, 17],
  [8.4, 0],
  [9.6, 0],
];
export const MORNING_PARK = 8.4;
const morningD = travel(MORNING_SPEED);
const MORNING_START = MORNING.length - morningD(9.6);
export function morningCar(s) {
  const p = MORNING.pose(MORNING_START + morningD(s));
  return { x: p.x, z: p.z, yaw: Math.atan2(p.dz, -p.dx) };
}

// ---- stage 7: back for the night. North up the coast highway, right
// into the lot, and into the same stall as this morning.
const NIGHT = (() => {
  const pts = [];
  for (let z = 27; z > 14.5; z -= 0.25) pts.push([-35.5, z]);
  for (let a = Math.PI; a <= 1.5 * Math.PI + 1e-9; a += Math.PI / 40) pts.push([-30.5 + 5 * Math.cos(a), 14.5 + 5 * Math.sin(a)]);
  for (let x = -30.3; x <= -5.2; x += 0.25) pts.push([x, 9.5 + 0.2 * smooth(-30, -12, x)]);
  return path(pts);
})();
export const NIGHT_SPEED = [
  [0, 11],
  [0.25, 11],
  [1.6, 6],
  [5.9, 6],
  [8.2, 0],
  [9.6, 0],
];
const nightD = travel(NIGHT_SPEED);
export function nightCar(s) {
  const p = NIGHT.pose(Math.min(NIGHT.length, nightD(s)));
  // Up over the sidewalk into the lot.
  const y = 0.15 * smooth(-32.8, -32, p.x) * (1 - smooth(-29.2, -28.4, p.x));
  return { x: p.x, y, z: p.z, yaw: Math.atan2(-p.dz, p.dx) };
}
export const NIGHT_PARK = 8.2; // stage seconds: stopped
export const NIGHT_LIGHTS_OFF = 8.75;
export const NIGHT_DOOR = 9.25;

// ---- stage 5: the red sloop, out of its slip a few minutes ago, motors
// down the harbor toward the camera and gets its sails up.
export const SLOOP_SPEED = [
  [0, 2.6],
  [3, 3.2],
  [9.6, 4.6],
];
const sloopD = travel(SLOOP_SPEED);
const HARBOR = (() => {
  const pts = [];
  // A gentle arc from the docks toward the harbor mouth.
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    const h = (262 - 22 * u) * DEG; // heading, west bearing south
    const prev = pts[pts.length - 1] ?? [-36, 37];
    pts.push(i === 0 ? prev : [prev[0] + Math.sin(h) * 0.25, prev[1] - Math.cos(h) * 0.25]);
  }
  return path(pts);
})();
export function sloop(s) {
  const p = HARBOR.pose(sloopD(s));
  const sails = smooth(2.2, 6.4, s);
  return { x: p.x, z: p.z, yaw: Math.atan2(-p.dz, p.dx), sails: Math.max(0.001, sails), boom: 0.32 * sails };
}

// ---------------------------------------------------------------- sections

// hours(u): the clock across the section, u = 0..1.
const SECTIONS = [
  {
    id: 'title',
    place: 'motel',
    hours: (u) => lerp(4.1, 4.2, u),
    camera: () => level([-57.8, 1.6, 1.5], 77.5, 30, 0.3),
    wind: 0.6,
  },
  {
    id: 'dawn',
    stage: 1,
    place: 'motel',
    // From the pool deck, over the wall, as the sun comes up over the hills.
    hours: (u) => lerp(4.76, 5.46, u),
    camera: () => level([-24, 1.75, -19.4], 63.5, 44, 0.36),
    flock: { az: 52, el: 13, n: 2, speed: 2.2 },
  },
  {
    id: 'breakfast',
    stage: 2,
    fast: true,
    place: 'boulevard',
    hours: (u) => lerp(8.05, 8.2, u),
    props: (s) => ({ drive: morningCar(s) }),
    camera: (u, s) => {
      const car = morningCar(s);
      const back = 10.5 + 5 * smooth(5.2, 8.8, s);
      const cx = car.x + back;
      const cz = car.z * 0.55 - 0.4;
      return roadView([cx, gy(cx) + 2.5 + 0.6 * smooth(5, 9, s), cz], [car.x - 30, 0, car.z * 0.75], 36, 0.47);
    },
    power: (s) => ({ signalRed: S.blink(s, 1.1, 0.5) ? 1 : 0.1 }),
    speed: (s) => speedAt(MORNING_SPEED, s) * 2.237,
  },
  {
    id: 'house',
    stage: 3,
    place: 'house',
    // Across the pool to the sea, the float drifting across the frame.
    hours: (u) => lerp(10.65, 11.35, u),
    props: (s) => ({ float: lerp(0.64, 0.76, s / 9.6) }),
    camera: () => {
      const v = layout('house').views.sunset;
      return { ...v, eye: [v.eye[0] + 0.8, v.eye[1], v.eye[2]], target: [v.target[0] + 0.8, v.target[1], v.target[2]] };
    },
    flock: { az: 284, el: 16, n: 3, speed: -1.6 },
  },
  {
    id: 'beach',
    stage: 4,
    place: 'beach',
    // Along the waterline toward the pier, the surf running in.
    hours: (u) => lerp(14.0, 14.8, u),
    camera: () => level([4.6, 1.6, 37.8], 14, 38, 0.36),
    flock: { az: 358, el: 14, n: 4, speed: 1.8 },
  },
  {
    id: 'marina',
    stage: 5,
    place: 'marina',
    hours: (u) => lerp(17.55, 18.2, u),
    props: (s) => ({ sloop: 'out', sloopAt: sloop(s) }),
    // From the water: the sloop crosses right to left, closing.
    camera: () => level([-74, 1.9, 60], 38, 36, 0.4),
    flock: { az: 62, el: 17, n: 3, speed: -2.4 },
  },
  {
    id: 'sunset',
    stage: 6,
    fast: true,
    place: 'boulevard',
    hours: (u) => lerp(18.62, 18.97, u),
    camera: (u) => {
      const x = lerp(96, 16, u);
      return roadView([x, gy(x) + lerp(1.7, 4.2, smooth(0, 1, u)), lerp(-1.4, -0.6, u)], [x - 100, 0, -1], lerp(26, 30, u), lerp(0.34, 0.37, u));
    },
    power: (s) => {
      const k = catchOn(s - 6.8, 3);
      return { globe: k * 1.8, lamp: k * 1.8, neonPink: k * 1.6, neonCyan: k * 1.6, neonRed: k * 1.6, neonWhite: k * 1.6 };
    },
  },
  {
    id: 'night',
    stage: 7,
    place: 'motel',
    hours: (u) => lerp(20.7, 20.83, u),
    props: (s) => ({ carAt: { ...nightCar(s), lit: s < NIGHT_LIGHTS_OFF }, noVacancy: false }),
    camera: () => level([-56, 1.6, 1.5], 97, 30, 0.3),
    wind: 0.5,
  },
  {
    id: 'ending',
    place: 'motel',
    hours: (u) => lerp(20.83, 20.9, u),
    props: (s) => ({ carAt: { ...nightCar(99), lit: false }, noVacancy: catchOn(s - 0.9, 21) > 0 }),
    camera: () => level([-56, 1.6, 1.5], 97, 30, 0.3),
    wind: 0.5,
  },
];

let t0 = 0;
for (const sec of SECTIONS) {
  sec.bars = 4;
  sec.t0 = t0;
  sec.t1 = t0 + sec.bars * BAR;
  t0 = sec.t1;
}
export { SECTIONS };
export const DURATION = t0;
export const FRAMES = Math.round(DURATION * FPS);

export function section(id) {
  return SECTIONS.find((s) => s.id === id);
}

// ---------------------------------------------------------------- title and ending times

export const TITLE = {
  logo: 0.2, // first letter drops
  subtitle: 1.6,
  press: 2.6, // PRESS START starts blinking
  coin: 4.9,
  start: 7.2,
};
export const WISH = { text: 'WISH YOU WERE HERE', at: 2.2, cps: 11 };
export const FINAL = { black: 6.6, thanks: 7.3, coin: 8.1 };

// ---------------------------------------------------------------- frames

/**
 * What frame i shows: the place, its props and the hour, the camera, the
 * sky and the power to the signs, plus the screen layer on top.
 */
export function frame(i) {
  const t = i / FPS;
  const sec = SECTIONS.find((x) => t < x.t1) ?? SECTIONS[SECTIONS.length - 1];
  const s = t - sec.t0;
  const len = sec.t1 - sec.t0;
  const u = s / len;
  const hours = sec.hours(u);
  // Quiet scenes are animated on twos, as the boards did with backgrounds:
  // the picture changes fifteen times a second, the screen layer thirty.
  const ts = sec.fast ? t : sec.t0 + Math.floor(Math.round(s * FPS) / 2) * (2 / FPS);
  const ss = ts - sec.t0;
  const hs = sec.hours(ss / len);
  const scene = {
    place: sec.place,
    hours: hs,
    props: { ...propsAt(sec.place, hs), ...(sec.props ? sec.props(ss, hs) : {}) },
    camera: sec.camera(ss / len, ss),
    motion: { t: ts, wind: sec.wind ?? 1 },
    sky: (sky) => {
      animateSky(sky, ts);
      if (sec.flock) flock(sky, ss - len / 2, sec.flock);
    },
    power: sec.power ? sec.power(ss, hs) : null,
  };
  // Stage changes: the picture breaks into blocks and goes dark, then
  // comes back the same way.
  const OUT = 0.5;
  const IN = 0.5;
  let fadeK = 1;
  let blocks = 1;
  // (The night runs straight on into the ending: no break there.)
  const next = SECTIONS[SECTIONS.indexOf(sec) + 1];
  const cut = next && next.id !== 'ending';
  if (cut && s > len - OUT) {
    const k = (s - (len - OUT)) / OUT;
    fadeK = 1 - k;
    blocks = 1 + Math.round(k * 15);
  }
  if (sec.stage && s < IN) {
    const k = 1 - s / IN;
    fadeK = Math.min(fadeK, 1 - k);
    blocks = Math.max(blocks, 1 + Math.round(k * 15));
  }
  let flash = 0;
  let black = false;
  if (sec.id === 'title') {
    fadeK = Math.min(fadeK, clamp01(s / 0.4));
    const ts = s - TITLE.start;
    if (ts > 0 && ts < 0.25) flash = 1 - ts / 0.25;
  }
  if (sec.id === 'ending') {
    fadeK = Math.min(fadeK, 1 - clamp01((s - (FINAL.black - 0.9)) / 0.9));
    if (s > FINAL.black) black = true;
  }
  const hudAlpha = sec.stage ? Math.min(clamp01((s - 0.3) / 0.2), fadeK >= 1 ? 1 : fadeK) : 0;
  return {
    i,
    t,
    section: sec.id,
    scene: black ? null : scene,
    fade: fadeK,
    flash,
    mosaic: blocks,
    overlay: (img) => overlay(img, sec, s, hours, hudAlpha, fadeK),
  };
}

function overlay(img, sec, s, hours, hudAlpha, fadeK) {
  if (sec.stage) {
    S.hud(img, { place: PLACE[sec.place], hours, alpha: hudAlpha });
    if (sec.speed) S.speedometer(img, sec.speed(s), hudAlpha);
    S.stageCard(img, s - 0.45, { stage: `STAGE ${sec.stage}`, name: PLACE[sec.place], time: S.clockText(sec.hours(0)) });
    return;
  }
  if (sec.id === 'title') return title(img, s);
  if (sec.id === 'ending') return ending(img, s, fadeK);
}

function title(img, s) {
  const T = TITLE;
  // The board's text layer comes up with the picture and goes with START.
  if (s < 0.4 || s > T.start + 0.9) return;
  const shine = s > 1.4 && s < 2.4 ? lerp(-0.2, 1.3, (s - 1.4) / 1.0) : null;
  S.logo(img, s - T.logo, { shine });
  if (s > T.subtitle) S.subtitle(img, 'ONE SUMMER DAY', 66, clamp01((s - T.subtitle) / 0.4));
  if (s > T.press) {
    const fast = s > T.start;
    const lit = fast ? S.blink(s, 12, 0.5) : s > T.coin ? S.blink(s, 3.5, 0.6) : S.blink(s - T.press, 1.1, 0.6);
    if (lit) S.centered(img, 'PRESS START', 150, { fill: S.INK.white, spacing: 1 });
  }
  S.corner(img, s > T.coin ? 'CREDIT 1' : 'CREDIT 0', { right: true, bottom: true, fill: S.INK.cream });
  S.centered(img, '(C) 1986 VACANT SUNLIGHT', 196, { fill: S.INK.cream });
}

function ending(img, s, fadeK) {
  if (s < FINAL.black) {
    S.typed(img, WISH.text, s - WISH.at, 34, { cps: WISH.cps, alpha: fadeK >= 1 ? 1 : fadeK });
    return;
  }
  if (s > FINAL.thanks) S.centered(img, 'THANK YOU FOR VISITING', 78, { fill: S.INK.cream, spacing: 1 });
  if (s > FINAL.thanks + 0.3) {
    S.logo(img, 99, { y: 92 });
  }
  if (s > FINAL.coin && S.blink(s - FINAL.coin, 1.1, 0.6)) S.centered(img, 'INSERT COIN', 150, { fill: S.INK.white, spacing: 1 });
  S.corner(img, 'CREDIT 0', { right: true, bottom: true, fill: S.INK.cream });
}
