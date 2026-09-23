// Sound effects and the sound of each place, synthesized like the music
// and timed from the same score: the coin, the whoosh as a stage breaks
// into blocks, surf in step with the breakers on screen, gulls, crickets,
// the yellow car's engine following its speed, the door when it has
// parked, and the NO in NO VACANCY buzzing on frame by frame.

import { RATE, blip, bell } from '../../src/audio/synth.js';
import { shapedNoise, click, door, engine, crickets, birds, gull, surf, rigging, lapping, wind, hum, speedOf } from '../../src/audio/fx.js';
import * as SC from './score.js';
import { chordAt } from './music.js';
import { LETTER, CARD } from './screen.js';

const TAU = Math.PI * 2;
const len = (s) => Math.max(1, Math.ceil(s * RATE));
const smooth = (a, b, x) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- sources

function coin() {
  const a = blip(987.8, 0.075, 0.9, { duty: 0.5, decay: 0.02 });
  const b = blip(1318.5, 0.45, 0.9, { duty: 0.5, decay: 0.16 });
  const out = new Float32Array(a.length + b.length);
  out.set(a.subarray(0, len(0.075)));
  for (let i = 0; i < b.length; i++) out[len(0.075) + i] += b[i];
  return out;
}

// The board breaking the picture into blocks: a falling run of square
// blips over a filtered rush of air; rising when it comes back.
function warp(up) {
  const T = 0.5;
  const out = shapedNoise(T + 0.2, up ? 5 : 7, (t) => {
    const u = Math.min(1, t / T);
    const f = up ? 400 + 3200 * u : 3600 - 3200 * u;
    return [0.55 * Math.sin(Math.PI * Math.min(1, u)) ** 1.5, f, 1.6, 'bp'];
  });
  for (let k = 0; k < 8; k++) {
    const m = up ? 64 + k * 3 : 88 - k * 3;
    const b = blip(mtof(m), 0.035, 0.35, { duty: 0.25, decay: 0.015 });
    const o = len((k * T) / 8);
    for (let i = 0; i < b.length && o + i < out.length; i++) out[o + i] += b[i];
  }
  return out;
}

function swish() {
  return shapedNoise(0.4, 9, (t) => [0.4 * Math.sin(Math.PI * Math.min(1, t / 0.35)), 1200 + 5000 * (t / 0.35), 1.2, 'bp']);
}

// ---------------------------------------------------------------- the cue sheet

/** Adds every effect in the film to `mix` (see src/audio/synth.js). */
export function effects(mix) {
  const sec = (id) => SC.section(id);
  const T = SC.TITLE;

  // Title: the coin; crickets and the sign's hum under the logo.
  mix.add(coin(), T.coin, { gain: 0.5, reverb: 0.15 });
  const title = sec('title');
  mix.add(crickets(title.t1 - title.t0, 1), title.t0, { fadeIn: 0.3, gain: 0.5, pan: 0.2, reverb: 0.1 });
  mix.add(hum(title.t1, (t) => 0.6 * (1 - smooth(8.5, 9.6, t))), 0, { gain: 0.35, pan: 0.5 });
  mix.add(surf(title.t1, 2, [[3, 0.1, 0.1], [9, 0.1, 0.1]], { floor: 0.04 }), 0, { fadeIn: 0.3, gain: 0.5, pan: -0.5, reverb: 0.1 });

  // Stage changes: out as each section ends, back in as the next starts,
  // and a chime as the card slides up.
  for (const s of SC.SECTIONS) {
    // (the night runs straight on into the ending: no break there)
    const next = SC.SECTIONS[SC.SECTIONS.indexOf(s) + 1];
    if (next && next.id !== 'ending') mix.add(warp(false), s.t1 - 0.5, { gain: 0.3, pan: 0, reverb: 0.2 });
    if (s.stage) {
      mix.add(warp(true), s.t0, { gain: 0.22, reverb: 0.2 });
      const card = s.t0 + 0.45;
      mix.add(swish(), card, { gain: 0.4, pan: (t) => 0.8 - 1.6 * smooth(card, card + 0.35, t), reverb: 0.15 });
      const c = chordAt(Math.round(s.t0 / SC.BAR)).v;
      for (const [k, m] of [c[3] + 12, c[1] + 24].entries()) mix.add(bell(mtof(m), 0.1, 0.5, { ratio: 3, ring: 0.5 }), card + 0.08 + k * 0.1, { gain: 0.16, reverb: 0.35, delay: 0.2, pan: k ? 0.3 : -0.3 });
      mix.add(swish(), s.t0 + 0.45 + CARD - 0.4, { gain: 0.25, pan: (t) => 0.8 - 1.6 * smooth(card + CARD - 0.8, card + CARD - 0.4, t) });
    }
  }

  // Dawn: the sea across the road, the first birds, a gull.
  {
    const s = sec('dawn');
    const D = s.t1 - s.t0;
    mix.add(surf(D, 3, [[1, 0.12, 0.1], [4.5, 0.14, 0.1], [8, 0.12, 0.1]], { floor: 0.05 }), s.t0, { fadeIn: 0.3, gain: 0.45, pan: -0.4, reverb: 0.15 });
    mix.add(birds(D, 4, (t) => 0.1 + 0.5 * smooth(2, 8, t)), s.t0, { gain: 0.5, pan: 0.35, reverb: 0.3 });
    mix.add(birds(D, 5, (t) => 0.3 * smooth(4, 9, t)), s.t0, { gain: 0.35, pan: -0.5, reverb: 0.3 });
    mix.add(crickets(4, 6, 3), s.t0, { fadeIn: 0.3, gain: (t) => 0.35 * (1 - smooth(s.t0 + 1, s.t0 + 4, t)), pan: -0.2 });
    mix.add(gull(7), s.t0 + 6.2, { gain: 0.12, pan: 0.6, reverb: 0.4 });
    mix.add(lapping(D, 8, 0.25), s.t0, { fadeIn: 0.3, gain: 0.5, pan: 0.1 });
  }

  // Breakfast: the car, from behind; parked, the key, the door.
  {
    const s = sec('breakfast');
    const D = s.t1 - s.t0;
    const v = (t) => speedOf(SC.MORNING_SPEED, t);
    const off = SC.MORNING_PARK + 0.2;
    const e = engine(D, v, { off, seed: 12 });
    const back = (t) => 10.5 + 5 * smooth(5.2, 8.8, t);
    mix.add(e, s.t0, { gain: (t) => 0.55 * (12 / (back(t - s.t0) + 2)), pan: 0.15, reverb: 0.05 });
    mix.add(click(0.4, 900), s.t0 + off, { gain: 0.3, pan: 0.2 });
    mix.add(door(), s.t0 + off + 0.35, { gain: 0.5, pan: 0.25, reverb: 0.15 });
    mix.add(birds(D, 13, () => 0.15), s.t0, { gain: 0.25, pan: -0.4, reverb: 0.3 });
    mix.add(wind(D, 14, 0.12), s.t0, { fadeIn: 0.3, gain: 1, pan: -0.2 });
  }

  // The house: the pool, birds, the palms in the breeze.
  {
    const s = sec('house');
    const D = s.t1 - s.t0;
    mix.add(lapping(D, 15, 0.4), s.t0, { fadeIn: 0.3, gain: 0.6, pan: 0 });
    mix.add(birds(D, 16, () => 0.22), s.t0, { gain: 0.35, pan: 0.5, reverb: 0.35 });
    mix.add(wind(D, 17, 0.16, (t) => 0.8 + 0.2 * Math.sin(t)), s.t0, { fadeIn: 0.3, gain: 1, pan: 0.3 });
    mix.add(surf(D, 18, [[2, 0.08, 0.1], [7, 0.08, 0.1]], { floor: 0.04 }), s.t0, { fadeIn: 0.3, gain: 0.5, pan: -0.3, reverb: 0.2 });
  }

  // The beach: waves breaking in step with the lines on screen, and gulls.
  {
    const s = sec('beach');
    const D = s.t1 - s.t0;
    // Breaks come when each line's surge peaks: phase 2 pi t / 7.5 - lag.
    const waves = [];
    for (let k = -1; k < 3; k++) {
      for (const [lag, a, br] of [[0, 0.12, 0.2], [1.2, 0.2, 0.4], [2.2, 0.45, 0.8], [3.0, 0.25, 0.5]]) {
        const t = ((0.37 + lag) / TAU) * 7.5 + 7.5 * k + Math.round(s.t0 / 7.5) * 7.5 - s.t0;
        waves.push([t, a, br]);
      }
    }
    mix.add(surf(D, 19, waves, { floor: 0.06 }), s.t0, { fadeIn: 0.3, gain: 0.8, pan: -0.45, reverb: 0.15 });
    mix.add(surf(D, 20, waves.map(([t, a, b]) => [t + 0.15, a * 0.7, b]), { floor: 0.05 }), s.t0, { fadeIn: 0.3, gain: 0.6, pan: 0.2, reverb: 0.15 });
    for (const [k, t] of [1.8, 5.1, 7.9].entries()) mix.add(gull(21 + k), s.t0 + t, { gain: 0.16, pan: [-0.3, 0.5, 0.1][k], reverb: 0.45 });
    mix.add(wind(D, 24, 0.14), s.t0, { fadeIn: 0.3, gain: 1, pan: 0.3 });
  }

  // The marina: rigging, water among the hulls, the sloop's little diesel
  // coming closer, the winch and the sail filling.
  {
    const s = sec('marina');
    const D = s.t1 - s.t0;
    mix.add(rigging(D, 25), s.t0, { gain: 0.5, pan: 0.4, reverb: 0.4 });
    mix.add(rigging(D, 26), s.t0, { gain: 0.35, pan: -0.3, reverb: 0.4 });
    mix.add(lapping(D, 27, 0.35), s.t0, { fadeIn: 0.3, gain: 0.6, pan: -0.2 });
    // The sloop crosses from right to left as it closes on the camera.
    const eye = [-74, 60];
    const at = (t) => SC.sloop(Math.max(0, t - s.t0));
    const dist = (t) => Math.hypot(at(t).x - eye[0], at(t).z - eye[1]);
    const pan = (t) => Math.sin(Math.atan2(at(t).x - eye[0], -(at(t).z - eye[1])) - 38 * DEG) * 1.6;
    const diesel = engine(D, () => 2.2, { seed: 28, idle: 30, cylinders: 3 });
    mix.add(diesel, s.t0, { gain: (t) => 0.45 * (14 / (dist(t) + 6)), pan, reverb: 0.2 });
    // Winch clicks while the sails go up, then the sail snapping full.
    for (let t = 2.3; t < 5.2; t += 0.085) mix.add(click(0.25, 5000 + Math.round(t * 100)), s.t0 + t, { gain: 0.35, pan: pan(s.t0 + t), reverb: 0.2 });
    mix.add(shapedNoise(4, 29, (t) => [0.35 * smooth(0, 0.4, t) * (1 - smooth(2.5, 4, t)) * (0.6 + 0.4 * Math.sin(TAU * 7 * t)), 700, 0.8]), s.t0 + 2.2, { gain: 1, pan: pan(s.t0 + 4), reverb: 0.2 });
    mix.add(door(), s.t0 + 6.3, { gain: 0.25, pan: pan(s.t0 + 6.3), reverb: 0.3 });
    mix.add(gull(30), s.t0 + 4.4, { gain: 0.12, pan: 0.6, reverb: 0.5 });
  }

  // Sunset: wind as the camera glides down the boulevard; the street
  // lamps and the neon catching.
  {
    const s = sec('sunset');
    const D = s.t1 - s.t0;
    mix.add(wind(D, 31, 0.22, (t) => 0.6 + 0.4 * smooth(0, 3, t)), s.t0, { fadeIn: 0.3, gain: 1, pan: 0 });
    mix.add(wind(D, 32, 0.12), s.t0, { fadeIn: 0.3, gain: 1, pan: 0.6 });
    mix.add(surf(D, 33, [[3, 0.07, 0.1], [9, 0.08, 0.1]], { floor: 0.03 }), s.t0, { fadeIn: 0.3, gain: 0.5, pan: -0.1, reverb: 0.3 });
    const on = (t) => SC.catchOn(t - s.t0 - 6.8, 3);
    mix.add(hum(D, (t) => on(t + s.t0), 0.35), s.t0, { gain: 0.5, pan: 0.3, reverb: 0.2 });
    let last = 0;
    for (let t = 6.8; t < 7.8; t += 1 / SC.FPS) {
      const k = on(s.t0 + t);
      if (k !== last) mix.add(click(0.5, 2000 + Math.round(t * 1000)), s.t0 + t, { gain: 0.3, pan: 0.3, reverb: 0.2 });
      last = k;
    }
    mix.add(gull(34), s.t0 + 2.5, { gain: 0.1, pan: -0.5, reverb: 0.5 });
  }

  // Night: crickets, the hum, and the yellow car coming home.
  {
    const s = sec('night');
    const e = sec('ending');
    const D = e.t1 - s.t0;
    mix.add(crickets(D, 35, 5), s.t0, { fadeIn: 0.3, gain: 0.55, pan: 0.1, reverb: 0.15 });
    mix.add(hum(D, (t) => 0.6 * (1 - smooth(e.t1 - s.t0 - 3.8, e.t1 - s.t0 - 3, t))), s.t0, { gain: 0.35, pan: 0.5 });
    mix.add(surf(D, 36, [[2, 0.1, 0.1], [9, 0.1, 0.1], [16, 0.1, 0.1]], { floor: 0.04 }), s.t0, { fadeIn: 0.3, gain: 0.45, pan: -0.5, reverb: 0.2 });
    const v = (t) => speedOf(SC.NIGHT_SPEED, t);
    const off = SC.NIGHT_PARK + 0.3;
    const eye = [-56, 1.5];
    const car = (t) => SC.nightCar(Math.max(0, t - s.t0));
    const dist = (t) => {
      const c = car(t);
      return Math.hypot(c.x - eye[0], c.z - eye[1]);
    };
    const pan = (t) => {
      const c = car(t);
      const h = 97 * DEG;
      return Math.sin(Math.atan2(c.x - eye[0], -(c.z - eye[1])) - h) * 1.6;
    };
    mix.add(engine(12, v, { off, seed: 37 }), s.t0, { gain: (t) => 0.7 * (18 / (dist(t) + 4)), pan, reverb: 0.2 });
    mix.add(click(0.3, 1500), s.t0 + SC.NIGHT_LIGHTS_OFF, { gain: 0.25, pan: 0.3 });
    mix.add(door(), s.t0 + SC.NIGHT_DOOR, { gain: 0.35, pan: 0.3, reverb: 0.3 });
    // A few steps and a room door, somewhere across the lot.
    mix.add(door(), s.t0 + SC.NIGHT_DOOR + 1.9, { gain: 0.12, pan: 0.45, reverb: 0.5 });

    // The ending: the NO catches, frame by frame; the caption types.
    let last = 0;
    for (let t = 0.8; t < 2; t += 1 / SC.FPS) {
      const k = SC.catchOn(t - 0.9, 21);
      if (k !== last) {
        mix.add(click(0.7, 4000 + Math.round(t * 1000)), e.t0 + t, { gain: 0.35, pan: 0.45, reverb: 0.2 });
        mix.add(hum(0.06, () => 1, 0.6), e.t0 + t, { gain: 0.4, pan: 0.45 });
      }
      last = k;
    }
    mix.add(hum(6, (t) => (t > 1.7 ? 0.8 : 0) * (1 - smooth(4.9, 5.7, t))), e.t0, { gain: 0.3, pan: 0.45 });
    const text = SC.WISH.text;
    const tones = chordAt(33).v.map((m) => m + 24);
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      mix.add(blip(mtof(tones[i % tones.length]), 0.03, 0.4, { duty: 0.25, decay: 0.02 }), e.t0 + SC.WISH.at + i / SC.WISH.cps, { gain: 0.25, pan: -0.3 + (0.6 * i) / text.length, reverb: 0.2, delay: 0.15 });
    }
    // On black: a chime for the thanks.
    mix.add(bell(mtof(86), 0.2, 0.5, { ratio: 3, ring: 1 }), e.t0 + SC.FINAL.thanks, { gain: 0.15, reverb: 0.5, delay: 0.3 });
  }
}

// The logo's letters land one after another; the music plays a run on them.
export function logoTimes() {
  const out = [];
  const text = 'PALOMA BAY';
  for (let i = 0; i < text.length; i++) if (text[i] !== ' ') out.push(SC.TITLE.logo + i * LETTER + 0.32);
  return out;
}
