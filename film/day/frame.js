// One frame of One Day in Paloma Bay at full painted resolution: build the
// place as it stands at that instant, paint it (several exposures averaged
// while the car is moving), lay on the painted grain, fade, and letter.

import { buildPlace } from '../../src/scenes/index.js';
import { Renderer, toRGBA } from '../../src/render.js';
import { fit } from '../../src/camera.js';
import { setMotion } from '../../src/world/motion.js';
import { drawText } from './titles.js';

function paint(sc, W, H, { ss, shadowSize, rays }) {
  setMotion(sc.motion.t, sc.motion.wind);
  const world = buildPlace(sc.place, sc.props);
  setMotion(0, 0);
  sc.sky(world.sky);
  if (sc.power) world.emitScale = { ...world.emitScale, ...sc.power };
  const r = new Renderer(world, { shadowSize, shadowRays: rays });
  r.setTime(sc.hours, sc.motion.t);
  r.setCamera(fit(sc.camera, W / H), W, H, ss);
  return r.render();
}

/** Frame `f` (from score.frame) as RGB24, W x H. */
export function renderFrame(f, W, H, { ss = 2, shadowSize = 2048, rays = true, grain = 0.02, blur = true } = {}) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  if (f.scene) {
    const img = paint(f.scene, W, H, { ss, shadowSize, rays });
    if (blur && f.blur) {
      for (const sc of f.blur) {
        const extra = paint(sc, W, H, { ss, shadowSize, rays });
        for (let i = 0; i < img.length; i++) img[i] += extra[i];
      }
      const k = 1 / (1 + f.blur.length);
      for (let i = 0; i < img.length; i++) img[i] *= k;
    }
    toRGBA(img, W, H, rgba, 0, 0, W, H, grain);
    if (f.fade < 1) {
      const k = Math.max(0, f.fade);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] *= k;
        rgba[i + 1] *= k;
        rgba[i + 2] *= k;
      }
    }
  } else {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  }
  // Lettering sizes are fractions of the frame height, so drafts match.
  for (const t of f.text) {
    const cap = t.cap * H;
    drawText(rgba, W, H, t.text, t.x * W, t.y * H, { cap, weight: Math.max(1, cap / 11), tracking: cap * t.tracking, align: t.align, alpha: t.alpha });
  }
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}
