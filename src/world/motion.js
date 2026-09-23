// A clock for the things that move without the sun: palms in the breeze,
// boats on their lines, surf running up the sand. Stills leave it at rest
// (wind 0), so nothing changes unless a film winds it up before building.

import { hash2 } from '../math.js';

export const motion = { t: 0, wind: 0 };

export function setMotion(t = 0, wind = 0) {
  motion.t = t;
  motion.wind = wind;
}

// A steady phase in [0, 2 pi) for thing `i` near (x, z), so everything
// sways a little out of step with everything else.
export function phase(i, x = 0, z = 0) {
  return hash2(i * 131 + Math.round(x * 10), Math.round(z * 10) * 7 + 17) * Math.PI * 2;
}
