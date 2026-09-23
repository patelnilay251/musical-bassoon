// The soundtrack, mixed: the music from film/music.js played on the voices
// of src/audio/synth.js, the effects from film/sfx.js, one hall and one
// echo for everything, and a limiter on the master. Returns a WAV.

import { Mix, RATE, mtof, ep, bass, lead, bell, blip, pad, kick, snare, clap, hat, shaker, crash, tom } from '../src/audio/synth.js';
import { encodeWAV } from '../src/audio/wav.js';
import { arrangement } from './music.js';
import { effects, logoTimes } from './sfx.js';
import { DURATION } from './score.js';

export { RATE };

// Drums sound the same every hit: render each once.
const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function play(mix, e) {
  const { t, vel = 1 } = e;
  switch (e.inst) {
    case 'ep':
      e.chord.forEach((m, k) => {
        const tk = t + k * (e.roll ?? 0);
        mix.add(ep(mtof(m), e.dur, vel, { detune: -5 }), tk, { gain: 0.11, pan: -0.35, reverb: 0.3, delay: 0.06 });
        mix.add(ep(mtof(m), e.dur, vel, { detune: 5 }), tk, { gain: 0.11, pan: 0.35, reverb: 0.3, delay: 0.06 });
      });
      break;
    case 'epLead':
      mix.add(ep(mtof(e.midi), e.dur, vel), t, { gain: 0.38, pan: 0.1, reverb: 0.35, delay: 0.25 });
      break;
    case 'bass':
      mix.add(bass(mtof(e.midi), e.dur, vel), t, { gain: 0.42, reverb: 0.02 });
      break;
    case 'lead':
      mix.add(lead(mtof(e.midi), e.dur, vel), t, { gain: 0.32, pan: 0.05, reverb: 0.3, delay: 0.2 });
      break;
    case 'celesta':
      mix.add(bell(mtof(e.midi), e.dur, vel, { ratio: 4, ring: 0.7 }), t, { gain: 0.27, pan: 0.2, reverb: 0.45, delay: 0.25 });
      break;
    case 'bell':
      mix.add(bell(mtof(e.midi), e.dur, vel), t, { gain: 0.14, pan: -0.15, reverb: 0.5, delay: 0.2 });
      break;
    case 'pad':
      mix.add(pad(e.chord.map(mtof), e.dur, vel), t, { gain: 0.7, pan: -0.4, reverb: 0.45 });
      mix.add(pad(e.chord.map((m) => mtof(m) * 1.002), e.dur, vel), t, { gain: 0.7, pan: 0.4, reverb: 0.45 });
      break;
    case 'arp':
      mix.add(blip(mtof(e.midi), e.dur, vel, { duty: 0.25, decay: 0.03 }), t, { gain: 0.14, pan: e.pan ?? 0, reverb: 0.2, delay: 0.3 });
      break;
    case 'kick':
      mix.add(once('kick', () => kick(1)), t, { gain: 0.62 * vel, reverb: 0.04 });
      break;
    case 'snare':
      mix.add(once('snare', () => snare(1)), t, { gain: 0.85 * vel, pan: 0.05, reverb: 0.3 });
      break;
    case 'clap':
      mix.add(once('clap', () => clap(1)), t, { gain: 0.5 * vel, pan: -0.12, reverb: 0.3 });
      break;
    case 'hat':
      mix.add(once('hat', () => hat(1)), t, { gain: 0.16 * vel, pan: 0.3, reverb: 0.05 });
      break;
    case 'open':
      mix.add(once('open', () => hat(1, true)), t, { gain: 0.13 * vel, pan: 0.3, reverb: 0.1 });
      break;
    case 'shaker':
      mix.add(once('shaker', () => shaker(1)), t, { gain: 0.16 * vel, pan: -0.3, reverb: 0.1 });
      break;
    case 'crash':
      mix.add(once('crash', () => crash(1)), t, { gain: 0.24 * vel, pan: -0.25, reverb: 0.2 });
      break;
    case 'tom':
      mix.add(once(`tom${e.freq}`, () => tom(e.freq, 1)), t, { gain: 0.36 * vel, pan: e.pan ?? 0, reverb: 0.2 });
      break;
    default:
      throw new Error(`no instrument ${e.inst}`);
  }
}

// only: a set of instrument names, to hear (or measure) part of the band.
export function mixdown({ music = true, sfx = true, only = null } = {}) {
  const mix = new Mix(DURATION + 1);
  if (music) for (const e of arrangement({ logoTimes: logoTimes() })) if (!only || only.has(e.inst)) play(mix, e);
  if (sfx) effects(mix);
  return mix.render();
}

export function soundtrack({ from = 0, to = DURATION, ...opts } = {}) {
  const [L, R] = mixdown(opts);
  const a = Math.round(from * RATE);
  const b = Math.min(L.length, Math.round(to * RATE));
  // A few milliseconds of fade at a cut, so a stretch never starts on a
  // click; and at the very end, time for the music box to die away.
  const l = L.slice(a, b);
  const r = R.slice(a, b);
  const f = Math.min(l.length, 256);
  const g = Math.min(l.length, Math.round((to >= DURATION ? 0.8 : 0.006) * RATE));
  for (let i = 0; i < f; i++) {
    l[i] *= i / f;
    r[i] *= i / f;
  }
  for (let i = 0; i < g; i++) {
    const k = (i / g) ** 2;
    l[l.length - 1 - i] *= k;
    r[r.length - 1 - i] *= k;
  }
  return encodeWAV([l, r], RATE);
}
