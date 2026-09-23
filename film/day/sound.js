// The soundtrack (placeholder: silence of the right length, until the
// score and the effects are written).
import { encodeWAV } from '../../src/audio/wav.js';
const RATE = 44100;
export function soundtrack({ from = 0, to } = {}) {
  const n = Math.round((to - from) * RATE);
  return encodeWAV([new Float32Array(n), new Float32Array(n)], RATE);
}
