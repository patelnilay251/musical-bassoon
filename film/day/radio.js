// The car radio. The song on it is the attract mode's tune, that summer's
// hit, at its own tempo: the full arrangement from film/attract, played as
// it was mixed, then heard through a dashboard speaker. The lows and highs
// are gone, it is mono, and it is a little saturated.

import { Mix, RATE, SVF, noiseSource } from '../../src/audio/synth.js';
import { arrangement } from '../attract/music.js';
import { play } from '../attract/sound.js';

let song = null;

// Where in the song the car radio is at the start of a shot that hears it:
// both times, the fill into the chorus, the song's best minute.
export const SONG_AT = 36.8;

/** Seconds [from, to) of the song, on the radio: mono, at RATE. */
export function radio(from, to) {
  song ??= arrangement({ logoTimes: [] });
  const mix = new Mix(to - from + 0.5);
  for (const e of song) if (e.t >= from - 6 && e.t < to) play(mix, { ...e, t: e.t - from });
  const [L, R] = mix.render();
  const n = Math.round((to - from) * RATE);
  const out = new Float32Array(n);
  const hp = new SVF(330, 0.7);
  const cone = new SVF(1300, 1.8);
  const lp1 = new SVF(3400, 0.75);
  const lp2 = new SVF(4300, 0.7);
  const hiss = noiseSource(97);
  for (let i = 0; i < n; i++) {
    hp.tick((L[i] + R[i]) * 0.5);
    cone.tick(hp.hp);
    lp1.tick(hp.hp + cone.bp * 0.4);
    lp2.tick(lp1.lp);
    out[i] = Math.tanh(lp2.lp * 2.2) * 0.5 + hiss() * 0.0015;
  }
  return out;
}
