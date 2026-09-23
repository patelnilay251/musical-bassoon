// The attract mode as scripts/film.js sees it: how many frames, how to
// paint one at the output size, the soundtrack, and where it all goes.

import { FPS, FRAMES, DURATION, frame } from './score.js';
import { renderFrame } from './frame.js';
import { W, H } from './screen.js';
import { enlarge } from '../../src/retro.js';

export { FPS, FRAMES, DURATION };
export { soundtrack } from './sound.js';

export const TITLE = 'Paloma Bay, the attract mode';
export const OUT = 'docs/film/paloma-bay.mp4';
export const PAGE = { from: 'web/film.html', to: 'docs/film.html', poster: 'docs/film/poster.png', at: 3 };
export const ENCODE = { crf: 20, preset: 'slow', tune: 'animation' };
export const DRAFT = { crf: 26, preset: 'veryfast', tune: 'animation' };

// Four times the board's 384x216 by default: each board pixel then fills
// exactly one of H.264's 4x4 blocks.
const factor = ({ draft = false, scale } = {}) => Number(scale ?? (draft ? 2 : 4));

export function size(opts = {}) {
  const k = factor(opts);
  return { W: W * k, H: H * k };
}

// Frame i as RGB24 at the output size.
export function render(i, opts = {}) {
  const k = factor(opts);
  const img = renderFrame(frame(i), opts.draft ? { ss: 1, shadowSize: 1024 } : { ss: 2, shadowSize: 2048 });
  return enlarge(img, W, H, k, new Uint8Array(W * k * H * k * 3), { scan: opts.scan ?? 0.24 });
}
