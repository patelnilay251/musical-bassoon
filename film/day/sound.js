// The soundtrack, mixed: the ballad from music.js on the voices of
// src/audio/synth.js, the town and the car radio from sfx.js, one hall and
// one echo for everything, and a limiter on the master. Returns a WAV.

import { Mix, RATE, SVF, mtof, ep, lead, bell, pad, kick, fretless, brush } from '../../src/audio/synth.js';
import { shapedNoise } from '../../src/audio/fx.js';
import { encodeWAV } from '../../src/audio/wav.js';
import { arrangement } from './music.js';
import { effects } from './sfx.js';
import { DURATION, BPM } from './score.js';

export { RATE };

const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

// A player keeps what the bass last played, so the next note can slide.
function player() {
  let prev = null;
  return (mix, e) => {
    const { t, vel = 1 } = e;
    switch (e.inst) {
      case 'ep':
        e.chord.forEach((m, k) => {
          const tk = t + k * (e.roll ?? 0);
          mix.add(ep(mtof(m), e.dur, vel, { detune: -6 }), tk, { gain: 0.1, pan: -0.3, reverb: 0.42, delay: 0.05 });
          mix.add(ep(mtof(m), e.dur, vel, { detune: 6 }), tk, { gain: 0.1, pan: 0.3, reverb: 0.42, delay: 0.05 });
        });
        break;
      case 'epLead':
        mix.add(ep(mtof(e.midi), e.dur, vel), t, { gain: 0.34, pan: 0.05, reverb: 0.45, delay: 0.18 });
        break;
      case 'horn':
        mix.add(lead(mtof(e.midi), e.dur, vel, { bright: 0.55 }), t, { gain: 0.26, pan: 0.08, reverb: 0.45, delay: 0.16 });
        break;
      case 'fretless': {
        const f = mtof(e.midi);
        const slide = prev && t - prev.end < 0.35 && Math.abs(prev.midi - e.midi) <= 7;
        mix.add(fretless(f, e.dur, vel, { from: slide ? mtof(prev.midi) : f * 0.985 }), t, { gain: 0.36, reverb: 0.08 });
        prev = { midi: e.midi, end: t + e.dur };
        break;
      }
      case 'pad':
        mix.add(pad(e.chord.map(mtof), e.dur, vel, { cutoff: 1100, attack: 0.9, release: 1.6 }), t, { gain: 0.6, pan: -0.45, reverb: 0.5 });
        mix.add(pad(e.chord.map((m) => mtof(m) * 1.002), e.dur, vel, { cutoff: 1100, attack: 0.9, release: 1.6 }), t, { gain: 0.6, pan: 0.45, reverb: 0.5 });
        break;
      case 'bell':
        mix.add(bell(mtof(e.midi), e.dur, vel, { ratio: 3.5, ring: 1.8 }), t, { gain: 0.13, pan: -0.1, reverb: 0.55, delay: 0.22 });
        break;
      case 'celesta':
        mix.add(bell(mtof(e.midi), e.dur, vel, { ratio: 4, ring: 0.7 }), t, { gain: 0.27, pan: 0.15, reverb: 0.5, delay: 0.25 });
        break;
      case 'sweep':
        mix.add(once(`sweep${e.dur.toFixed(3)}`, () => brush(1, { sweep: e.dur })), t, { gain: 0.12 * vel, pan: 0.25, reverb: 0.2 });
        break;
      case 'tap':
        mix.add(once('tap', () => brush(1)), t, { gain: 0.2 * vel, pan: 0.2, reverb: 0.25 });
        break;
      case 'kick':
        // a felt beater: the kick with its click and its top taken off
        mix.add(
          once('felt', () => {
            const lp = new SVF(160, 0.7);
            return kick(1).map((x) => lp.tick(x));
          }),
          t,
          { gain: 0.5 * vel, reverb: 0.05 },
        );
        break;
      case 'swell':
        // a cymbal rolled with soft mallets into the next bar
        mix.add(shapedNoise(e.dur + 0.3, 71, (x) => [0.2 * vel * Math.min(1, x / e.dur) ** 2.5 * (x < e.dur ? 1 : Math.exp(-(x - e.dur) / 0.1)), 5000 + (3000 * x) / e.dur, 0.7, 'hp']), t, { gain: 1, pan: -0.2, reverb: 0.35 });
        break;
      default:
        throw new Error(`no instrument ${e.inst}`);
    }
  };
}

export function mixdown({ music = true, sfx = true } = {}) {
  const mix = new Mix(DURATION + 1);
  if (music) {
    const play = player();
    for (const e of arrangement()) play(mix, e);
  }
  if (sfx) effects(mix);
  // Echoes on the dotted eighth.
  return mix.render({ echo: (60 / BPM) * 0.75, feedback: 0.32, master: 1.12 });
}

export function soundtrack({ from = 0, to = DURATION, ...opts } = {}) {
  const [L, R] = mixdown(opts);
  const a = Math.round(from * RATE);
  const b = Math.min(L.length, Math.round(to * RATE));
  const l = L.slice(a, b);
  const r = R.slice(a, b);
  // A few milliseconds of fade at the edges of a stretch, so it never
  // starts or stops on a click; the whole film ends in silence anyway.
  const f = Math.min(l.length, 256);
  for (let i = 0; i < f; i++) {
    l[i] *= i / f;
    r[i] *= i / f;
    l[l.length - 1 - i] *= i / f;
    r[r.length - 1 - i] *= i / f;
  }
  return encodeWAV([l, r], RATE);
}
