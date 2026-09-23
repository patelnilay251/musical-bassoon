// The sound of the day, shot by shot, synthesized like the pictures and
// timed from the same script. Every place has its own bed, which starts a
// little before the cut (so a cut feels like turning your head) and lingers
// a moment after. Sources sit where they are on screen: panned by where the
// camera sees them, quieter and wetter with distance. The visitor is heard
// only through their car: the engine, the radio, the key, the doors.

import { bell } from '../../src/audio/synth.js';
import * as FX from '../../src/audio/fx.js';
import * as SC from './score.js';
import { radio, SONG_AT } from './radio.js';

const { shot, place, FPS } = SC;
const TAU = Math.PI * 2;
const LEAD = 0.8; // each place is heard this long before it is seen
const TAIL = 0.35; // and lingers this long after the next cut
const smooth = (a, b, x) => {
  if (b <= a) return x >= b ? 1 : 0;
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// Where a point is across the frame of a level camera: -1 at the left
// edge, 1 at the right; behind the camera, hard to its side.
function across(cam, [x, , z], aspect = 16 / 9) {
  const fx = cam.target[0] - cam.eye[0];
  const fz = cam.target[2] - cam.eye[2];
  const fl = Math.hypot(fx, fz);
  const dx = x - cam.eye[0];
  const dz = z - cam.eye[2];
  const ahead = (dx * fx + dz * fz) / fl;
  const side = (-dx * fz + dz * fx) / fl;
  if (ahead <= 0.5) return Math.sign(side);
  return Math.max(-1, Math.min(1, side / ahead / (Math.tan((cam.fovY * Math.PI) / 360) * aspect)));
}
const pan = (cam, p, width = 0.85) => width * across(cam, p);

// How loud each place is, overall: fuller where there is no music.
const LEVEL = { predawn: 1.7, sunrise: 1.7, diner: 1.3, house: 1.8, pool: 1.4, beach: 1.2, shore: 1.2, pier: 1.7, marina: 1.25, sunset: 1.3, lighthouse: 1.2, home: 1.35, night: 1.3 };

// The mix, with every gain added through it scaled by k.
function scaled(mix, k) {
  return {
    add(buf, t, o = {}) {
      const g = o.gain ?? 1;
      mix.add(buf, t, { ...o, gain: typeof g === 'function' ? (x) => g(x) * k : g * k });
    },
  };
}
const dist = (cam, [x, , z]) => Math.hypot(x - cam.eye[0], z - cam.eye[2]);

/**
 * A place's bed: make(seconds) renders it from `lead` seconds before the
 * shot to `tail` after it; it is faded up to the cut and away after the
 * next one. gain may be a function of the film's time.
 */
function bed(mix, sh, make, { gain = 1, pan: p = 0, reverb = 0, delay = 0, lead = LEAD, tail = TAIL } = {}) {
  const t0 = Math.max(0, sh.t0 - lead);
  const t1 = sh.t1 + tail;
  const buf = make(t1 - t0);
  const g = typeof gain === 'function' ? gain : () => gain;
  const up = sh.t0 - lead < 0 ? [0, 1.2] : [t0, sh.t0];
  mix.add(buf, t0, { gain: (t) => g(t) * smooth(up[0], up[1], t) * (1 - smooth(sh.t1, t1, t)), pan: p, reverb, delay });
}

// Waves break when each line's surge peaks (see addBreakers): times in
// [t0, t1) for the beach's four lines, with loudness and brightness.
function breaks(t0, t1) {
  const out = [];
  for (const [lag, a, br] of [
    [0, 0.12, 0.2],
    [1.2, 0.2, 0.4],
    [2.2, 0.45, 0.8],
    [3.0, 0.25, 0.5],
  ]) {
    for (let k = Math.floor(t0 / 7.5) - 1; k * 7.5 < t1 + 7.5; k++) {
      const t = ((0.37 + lag) / TAU) * 7.5 + 7.5 * k;
      if (t > t0 - 2 && t < t1 + 1) out.push([t - t0, a, br]);
    }
  }
  return out;
}

// A light catching: a relay's click on every frame it changes.
function catching(mix, t0, dur, seed, { gain = 0.3, pan: p = 0, tone = 2000 } = {}) {
  let last = 0;
  for (let t = 0; t < dur; t += 1 / FPS) {
    const k = SC.catchOn(t, seed);
    if (k !== last) mix.add(FX.click(0.5, tone + Math.round(t * 1000)), t0 + t, { gain, pan: p, reverb: 0.2 });
    last = k;
  }
}

/** Adds every sound of the day but the score to `mix`. */
export function effects(film) {
  const motel = place('motel');
  const front = motel.views.front;
  const signPan = pan(front, [-30.6, 0, 6.5]);

  // ---- before dawn: sound first, in the dark. Crickets, the sign's hum
  // and the odd tick of a tube, the sea across the road behind us, a truck
  // far up the highway, and the ice machine by the office dropping a load.
  {
    const sh = shot('predawn');
    const mix = scaled(film, LEVEL.predawn);
    const sr = shot('sunrise');
    const off = sr.t0 + 1.4; // the sign goes off at sunrise, behind us
    mix.add(FX.crickets(sr.t1 + TAIL, 1, 5), 0, { gain: (t) => 0.5 * smooth(0, 1.4, t) * (1 - 0.75 * smooth(sr.t0, sr.t1, t)) * (1 - smooth(sr.t1, sr.t1 + TAIL, t)), pan: 0.15, reverb: 0.12 });
    mix.add(FX.hum(off, () => 1, 0.1), 0, { gain: (t) => 0.2 * smooth(0, 1.2, t) * (t > sh.t1 ? 0.45 : 1), pan: signPan, reverb: 0.05 });
    for (const t of [3.1, 7.6, 12.9]) mix.add(FX.click(0.22, 5200 + t * 100), t, { gain: 0.3, pan: signPan, reverb: 0.15 });
    mix.add(FX.click(0.5, 1300), off, { gain: 0.3, pan: -0.3, reverb: 0.35 });
    bed(mix, sh, (D) => FX.surf(D, 2, [[2.5, 0.1, 0.1], [9.5, 0.12, 0.1], [15.5, 0.1, 0.1]], { floor: 0.035 }), { gain: 0.4, pan: 0, reverb: 0.25 });
    mix.add(FX.farTruck(10, 3, (t) => smooth(0, 3, t) * (1 - smooth(3.5, 10, t))), 0, { gain: 0.5, pan: (t) => -0.2 - 0.5 * smooth(0, 10, t), reverb: 0.3 });
    mix.add(FX.iceMachine(4), 9.3, { gain: 0.2, pan: 0.85, reverb: 0.2 });
  }

  // ---- sunrise, on the pool deck: the doves, a mockingbird, the filter
  {
    const sh = shot('sunrise');
    const mix = scaled(film, LEVEL.sunrise);
    bed(mix, sh, (D) => FX.poolFilter(D, 5), { gain: 0.35, pan: 0.1 });
    bed(mix, sh, (D) => FX.lapping(D, 6, 0.22), { gain: 0.3, pan: -0.1 });
    bed(mix, sh, (D) => FX.mockingbird(D, 7, (t) => smooth(4.2, 5.5, t)), { gain: 0.32, pan: 0.45, reverb: 0.3 });
    mix.add(FX.dove(8), sh.t0 + 2.3, { gain: 0.34, pan: -0.5, reverb: 0.3 });
    mix.add(FX.dove(9), sh.t0 + 6.1, { gain: 0.2, pan: -0.35, reverb: 0.4 });
  }

  // ---- the diner: the radio coming down the hill, the engine, the key
  // turning and the song stopping dead, the door; then the street again.
  {
    const sh = shot('diner');
    const mix = scaled(film, LEVEL.diner);
    const road = place('boulevard').road;
    const car = (t) => {
      const c = SC.dinerCar(Math.max(0, Math.min(t - sh.t0, SC.DINER_PARK)));
      return road.toWorld([c.x, road.ground(c.x) + 1, c.z]);
    };
    const cam = (t) => sh.camera(Math.max(0, t - sh.t0));
    const near = (t) => 20 / (dist(cam(t), car(t)) + 6);
    const p = (t) => pan(cam(t), car(t));
    mix.add(radio(SONG_AT - LEAD, SONG_AT + SC.DINER_KEY), sh.t0 - LEAD, { gain: (t) => 0.85 * near(t), pan: p, reverb: 0.06 });
    const v = (t) => FX.speedOf(SC.DINER_SPEED, t - LEAD);
    mix.add(FX.engine(SC.DINER_KEY + LEAD + 1.2, v, { off: SC.DINER_KEY + LEAD, seed: 12 }), sh.t0 - LEAD, { gain: (t) => 0.28 * near(t), pan: p, reverb: 0.05 });
    mix.add(FX.click(0.4, 900), sh.t0 + SC.DINER_KEY, { gain: 0.25, pan: p(sh.t0 + 8), reverb: 0.1 });
    mix.add(FX.door(), sh.t0 + SC.DINER_DOOR, { gain: 0.4, pan: p(sh.t0 + 8), reverb: 0.15 });
    // A little bell over the diner's door: the visitor has gone in.
    for (const [k, f] of [2093, 1760].entries()) mix.add(bell(f, 0.05, 0.4, { ratio: 2.9, ring: 0.35 }), sh.t0 + 11.3 + k * 0.09, { gain: 0.1, pan: p(sh.t0 + 8) - 0.1, reverb: 0.3 });
    const after = (t) => 0.35 + 0.65 * smooth(sh.t0 + SC.DINER_KEY, sh.t0 + SC.DINER_KEY + 1.5, t);
    bed(mix, sh, (D) => FX.birds(D, 13, () => 0.2), { gain: (t) => 0.3 * after(t), pan: -0.4, reverb: 0.3 });
    bed(mix, sh, (D) => FX.birds(D, 14, () => 0.12), { gain: (t) => 0.22 * after(t), pan: 0.5, reverb: 0.35 });
    bed(mix, sh, (D) => FX.wind(D, 15, 0.1), { gain: 1, pan: 0.2 });
  }

  // ---- the house on the point: palms in the gusts, the sea below the
  // cliff, birds, a dove a long way off
  {
    const sh = shot('house');
    const mix = scaled(film, LEVEL.house);
    bed(mix, sh, (D) => FX.rustle(D, 16, 1), { gain: 0.45, pan: 0.25, reverb: 0.1 });
    bed(mix, sh, (D) => FX.surf(D, 17, [[1.5, 0.1, 0.15], [8.5, 0.12, 0.15]], { floor: 0.04 }), { gain: 0.4, pan: -0.3, reverb: 0.35 });
    bed(mix, sh, (D) => FX.birds(D, 18, () => 0.22), { gain: 0.3, pan: -0.45, reverb: 0.3 });
    bed(mix, sh, (D) => FX.wind(D, 19, 0.12), { gain: 1, pan: 0.1 });
    mix.add(FX.dove(20), sh.t0 + 4.4, { gain: 0.1, pan: 0.6, reverb: 0.5 });
  }

  // ---- the pool: water at the coping, the skimmer, ice in the glass
  {
    const sh = shot('pool');
    const mix = scaled(film, LEVEL.pool);
    bed(mix, sh, (D) => FX.lapping(D, 21, 0.4), { gain: 0.5, pan: -0.1 });
    bed(mix, sh, (D) => FX.poolFilter(D, 22), { gain: 0.3, pan: 0.35 });
    bed(mix, sh, (D) => FX.rustle(D, 23, 0.5), { gain: 0.3, pan: -0.3, reverb: 0.1 });
    bed(mix, sh, (D) => FX.birds(D, 24, () => 0.12), { gain: 0.2, pan: 0.5, reverb: 0.35 });
    for (const [k, s] of [2.8, 9.1].entries()) mix.add(FX.clink(25 + k), sh.t0 + s, { gain: 0.14, pan: 0.15, reverb: 0.2 });
  }

  // ---- the beach, from the tower: the surf behind us, the flag and its
  // halyard ringing on the pole, gulls, the wind
  {
    const sh = shot('beach');
    const mix = scaled(film, LEVEL.beach);
    const beach = place('beach');
    const cam = beach.views.tower;
    const waves = (t0) => breaks(t0, t0 + sh.len + LEAD + TAIL);
    bed(mix, sh, (D) => FX.surf(D, 27, waves(sh.t0 - LEAD), { floor: 0.06 }), { gain: 0.65, pan: -0.35, reverb: 0.15 });
    bed(mix, sh, (D) => FX.surf(D, 28, waves(sh.t0 - LEAD).map(([t, a, b]) => [t + 0.15, a * 0.7, b]), { floor: 0.05 }), { gain: 0.5, pan: 0.35, reverb: 0.15 });
    const T = beach.layout.tower;
    bed(mix, sh, (D) => FX.flag(D, 29, (t) => 0.7 + 0.3 * Math.sin(t * 0.8)), { gain: 0.35, pan: pan(cam, [T.x, 0, T.z]), reverb: 0.15 });
    for (const [k, s] of [1.8, 5.1, 9.6].entries()) mix.add(FX.gull(30 + k), sh.t0 + s, { gain: 0.14, pan: [-0.3, 0.5, 0.1][k], reverb: 0.45 });
    bed(mix, sh, (D) => FX.wind(D, 33, 0.16), { gain: 1, pan: 0.3 });
  }

  // ---- the shore: surf close by, in step with the lines on screen,
  // gulls, and the pelicans' slow wingbeats as they pass
  {
    const sh = shot('shore');
    const mix = scaled(film, LEVEL.shore);
    const waves = breaks(sh.t0 - LEAD, sh.t1 + TAIL);
    bed(mix, sh, (D) => FX.surf(D, 34, waves, { floor: 0.07 }), { gain: 0.8, pan: -0.55, reverb: 0.12 });
    bed(mix, sh, (D) => FX.surf(D, 35, waves.map(([t, a, b]) => [t + 0.25, a * 0.6, b * 0.8]), { floor: 0.05 }), { gain: 0.5, pan: 0.05, reverb: 0.15 });
    bed(mix, sh, (D) => FX.wind(D, 36, 0.15), { gain: 1, pan: 0.35 });
    for (const [k, s] of [3.3, 8.2].entries()) mix.add(FX.gull(37 + k), sh.t0 + s, { gain: 0.12, pan: [0.4, -0.2][k], reverb: 0.5 });
    // Pelican 0 beats its wings while sin(s/2) >= 0.3 (s from the shot's
    // middle), at 0.9 beats a second.
    for (let s = 0; s < sh.len; s += 1 / 0.9) {
      const m = s - sh.len / 2;
      if (Math.sin(0.5 * m) >= 0.3) mix.add(FX.wingbeat(40 + Math.round(s * 10)), sh.t0 + s, { gain: 0.07, pan: -0.55, reverb: 0.3 });
    }
  }

  // ---- from the pier: water slapping the pilings, the planks creaking
  {
    const sh = shot('pier');
    const mix = scaled(film, LEVEL.pier);
    bed(mix, sh, (D) => FX.pilings(D, 41), { gain: 0.5, pan: 0.1, reverb: 0.2 });
    bed(mix, sh, (D) => FX.surf(D, 42, [[2, 0.1, 0.2], [8.5, 0.1, 0.2]], { floor: 0.05 }), { gain: 0.35, pan: 0.4, reverb: 0.3 });
    bed(mix, sh, (D) => FX.wind(D, 43, 0.17), { gain: 1, pan: -0.2 });
    for (const [k, s] of [1.2, 4.6, 7.3].entries()) mix.add(FX.creak(44 + k, { dur: 0.5 + 0.3 * k, f: 38 + 9 * k, tone: 620 + 90 * k }), sh.t0 + s, { gain: 0.16, pan: -0.3 + 0.3 * k, reverb: 0.15 });
    mix.add(FX.gull(47), sh.t0 + 5.8, { gain: 0.1, pan: 0.6, reverb: 0.5 });
  }

  // ---- the marina: halyards on masts, water among the hulls, fenders
  // squeaking, and a bell buoy far out
  {
    const sh = shot('marina');
    const mix = scaled(film, LEVEL.marina);
    bed(mix, sh, (D) => FX.rigging(D, 48), { gain: 0.45, pan: 0.35, reverb: 0.4 });
    bed(mix, sh, (D) => FX.rigging(D, 49), { gain: 0.3, pan: -0.35, reverb: 0.4 });
    bed(mix, sh, (D) => FX.lapping(D, 50, 0.35), { gain: 0.55, pan: -0.1 });
    bed(mix, sh, (D) => FX.bellBuoy(D, 51), { gain: 0.08, pan: -0.6, reverb: 0.6 });
    for (const [k, s] of [1.6, 3.9, 6.8, 10.2].entries()) mix.add(FX.creak(52 + k, { dur: 0.22 + 0.06 * k, f: 240 + 50 * k, tone: 1250 + 120 * k, q: 8 }), sh.t0 + s, { gain: 0.07, pan: [0.3, -0.25, 0.5, 0.1][k], reverb: 0.2 });
    mix.add(FX.gull(56), sh.t0 + 7.4, { gain: 0.1, pan: 0.55, reverb: 0.5 });
  }

  // ---- sunset down the boulevard: the wind as we glide, the surf at the
  // bottom of the hill, and the street lamps' relays clunking on
  {
    const sh = shot('sunset');
    const mix = scaled(film, LEVEL.sunset);
    bed(mix, sh, (D) => FX.wind(D, 57, 0.2, (t) => 0.6 + 0.4 * smooth(0, 3, t)), { gain: 1, pan: 0 });
    bed(mix, sh, (D) => FX.wind(D, 58, 0.1), { gain: 1, pan: 0.6 });
    bed(mix, sh, (D) => FX.surf(D, 59, [[3, 0.07, 0.1], [10, 0.08, 0.1], [17, 0.07, 0.1]], { floor: 0.03 }), { gain: 0.45, pan: -0.05, reverb: 0.35 });
    const at = sh.t0 + 15.2;
    catching(mix, at, 1, 3, { gain: 0.28, pan: 0.35 });
    catching(mix, at, 1, 3, { gain: 0.2, pan: -0.4, tone: 2600 });
    mix.add(FX.hum(sh.t1 - at + TAIL, (t) => SC.catchOn(t, 3) * smooth(0, 1.5, t), 0.1), at, { gain: (t) => 0.3 * (1 - smooth(sh.t1, sh.t1 + TAIL, t)), pan: 0.2, reverb: 0.2 });
    mix.add(FX.birds(4, 60, () => 0.2), sh.t0 + 2, { gain: 0.12, pan: -0.5, reverb: 0.4 });
  }

  // ---- the lighthouse: waves on the rocks, the bell buoy, and one long
  // foghorn going out over the water into the dark
  {
    const sh = shot('lighthouse');
    const mix = scaled(film, LEVEL.lighthouse);
    bed(mix, sh, (D) => FX.rocks(D, 61, [[0.6, 0.35], [5.9, 0.45], [12.2, 0.4]]), { gain: 0.45, pan: 0.15, reverb: 0.3 });
    bed(mix, sh, (D) => FX.surf(D, 62, [[3, 0.08, 0.2], [9.5, 0.08, 0.2]], { floor: 0.04 }), { gain: 0.35, pan: -0.3, reverb: 0.3 });
    bed(mix, sh, (D) => FX.bellBuoy(D, 63), { gain: 0.13, pan: 0.5, reverb: 0.55 });
    mix.add(FX.foghorn(2.6), sh.t0 + 8.7, { gain: 0.3, pan: 0.05, reverb: 0.6 });
  }

  // ---- home: the radio again, coming up the highway in the dark; into
  // the lot and the key, the song stopping dead again; the lights, the
  // door, a room door across the lot, and the NO buzzing on.
  {
    const sh = shot('home');
    const mix = scaled(film, LEVEL.home);
    const cam = (t) => sh.camera(Math.max(0, t - sh.t0));
    const car = (t) => {
      const c = SC.homeCar(Math.max(0, Math.min(t - sh.t0, SC.HOME_PARK)));
      return [c.x, 1, c.z];
    };
    const near = (t) => 20 / (dist(cam(t), car(t)) + 6);
    const p = (t) => pan(cam(t), car(t));
    const parked = sh.t0 + SC.HOME_PARK;
    mix.add(radio(SONG_AT - LEAD, SONG_AT + SC.HOME_KEY), sh.t0 - LEAD, { gain: (t) => 0.85 * near(t), pan: p, reverb: 0.08 });
    const v = (t) => FX.speedOf(SC.HOME_SPEED, t - LEAD);
    mix.add(FX.engine(SC.HOME_KEY + LEAD + 1.2, v, { off: SC.HOME_KEY + LEAD, seed: 64 }), sh.t0 - LEAD, { gain: (t) => 0.28 * near(t), pan: p, reverb: 0.06 });
    // Up over the sidewalk's lip into the lot, and down again.
    let lastX = SC.homeCar(0).x;
    for (let s = 0; s < SC.HOME_PARK; s += 0.01) {
      const x = SC.homeCar(s).x;
      for (const edge of [-32.8, -29.2]) if (lastX < edge && x >= edge) mix.add(FX.thud(65 + Math.round(edge), 0.8), sh.t0 + s, { gain: 0.2 * near(sh.t0 + s), pan: p(sh.t0 + s), reverb: 0.1 });
      lastX = x;
    }
    mix.add(FX.click(0.4, 900), sh.t0 + SC.HOME_KEY, { gain: 0.2, pan: p(parked), reverb: 0.1 });
    mix.add(FX.click(0.3, 1500), sh.t0 + SC.HOME_LIGHTS, { gain: 0.18, pan: p(parked), reverb: 0.1 });
    mix.add(FX.door(), sh.t0 + SC.HOME_DOOR, { gain: 0.3, pan: p(parked), reverb: 0.2 });
    mix.add(FX.door(), sh.t0 + SC.HOME_ROOM - 0.5, { gain: 0.12, pan: p(parked) - 0.08, reverb: 0.45 });
    catching(mix, sh.t0 + SC.HOME_NO, 1, 21, { gain: 0.35, pan: signPan, tone: 4000 });
    mix.add(FX.hum(sh.t1 - (sh.t0 + SC.HOME_NO) + TAIL, (t) => SC.catchOn(t, 21), 0.1), sh.t0 + SC.HOME_NO, { gain: 0.2, pan: signPan });
    // The night around it: crickets, the sign, the sea behind us.
    bed(mix, sh, (D) => FX.crickets(D, 66, 5), { gain: 0.5, pan: 0.1, reverb: 0.15 });
    bed(mix, sh, (D) => FX.hum(D, () => 1, 0.1), { gain: 0.18, pan: signPan });
    bed(mix, sh, (D) => FX.surf(D, 67, [[2.5, 0.1, 0.1], [9.5, 0.1, 0.1]], { floor: 0.035 }), { gain: 0.35, pan: 0, reverb: 0.25 });
  }

  // ---- later: the last postcard, fading to black
  {
    const sh = shot('night');
    const mix = scaled(film, LEVEL.night);
    const out = (t) => 1 - smooth(sh.t1 - 2.2, sh.t1 + 1.2, t);
    bed(mix, sh, (D) => FX.crickets(D, 68, 5), { gain: (t) => 0.5 * out(t), pan: 0.1, reverb: 0.15, tail: 1.6 });
    bed(mix, sh, (D) => FX.hum(D, () => 1, 0.1), { gain: (t) => 0.18 * out(t), pan: signPan, tail: 1.6 });
    bed(mix, sh, (D) => FX.surf(D, 69, [[1.5, 0.1, 0.1], [8.5, 0.1, 0.1], [15, 0.1, 0.1]], { floor: 0.035 }), { gain: (t) => 0.35 * out(t), pan: 0, reverb: 0.25, tail: 1.6 });
    mix.add(FX.iceMachine(70), sh.t0 + 5.6, { gain: 0.16, pan: 0.85, reverb: 0.25 });
  }
}
