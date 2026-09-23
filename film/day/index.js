// One Day in Paloma Bay as scripts/film.js sees it.

import { FPS, FRAMES, DURATION, frame } from './score.js';
import { renderFrame } from './frame.js';

export { FPS, FRAMES, DURATION };
export { soundtrack } from './sound.js';

export const TITLE = 'One Day in Paloma Bay';
export const OUT = 'docs/film/one-day.mp4';
export const PAGE = { from: 'web/day.html', to: 'docs/day.html', poster: 'docs/film/one-day.png', at: 147.5 };
export const ENCODE = { crf: 18, preset: 'slow', tune: 'film' };
export const DRAFT = { crf: 24, preset: 'veryfast', tune: 'film' };

export function size({ draft = false } = {}) {
  return draft ? { W: 640, H: 360 } : { W: 1920, H: 1080 };
}

export function render(i, opts = {}) {
  const { W, H } = size(opts);
  const q = opts.draft ? { ss: 1, shadowSize: 1024, rays: false, blur: false } : { ss: 2, shadowSize: 2048, rays: true, blur: true };
  return renderFrame(frame(i), W, H, q);
}
