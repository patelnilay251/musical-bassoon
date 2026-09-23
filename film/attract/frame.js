// One frame of the film, from the score's description of it to finished
// pixels at the board's resolution: build the place as it stands at that
// instant (palms in the wind, boats on the swell, the car where it is),
// paint it, then reduce it to the board's palette and draw the screen
// layer on top.

import { buildPlace } from '../../src/scenes/index.js';
import { Renderer, toRGBA } from '../../src/render.js';
import { fit } from '../../src/camera.js';
import { setMotion } from '../../src/world/motion.js';
import { quantize } from '../../src/retro.js';
import * as S from './screen.js';

// The board's palette: three bits a channel, dithered.
export const BOARD = { bits: 3, dither: 0.7 };

export function renderFrame(f, { ss = 2, shadowSize = 2048, look } = {}) {
  const { W, H } = S;
  let img;
  if (f.scene) {
    const sc = f.scene;
    setMotion(sc.motion.t, sc.motion.wind);
    const world = buildPlace(sc.place, sc.props, look);
    setMotion(0, 0);
    sc.sky(world.sky);
    if (sc.power) world.emitScale = { ...world.emitScale, ...sc.power };
    const r = new Renderer(world, { shadowSize });
    r.setTime(sc.hours, sc.motion.t);
    r.setCamera(fit(sc.camera, W / H), W, H, ss);
    img = toRGBA(r.render(), W, H, undefined, 0, 0, W, H, 0);
  } else {
    img = new Uint8ClampedArray(W * H * 4);
    for (let i = 3; i < img.length; i += 4) img[i] = 255;
  }
  S.fade(img, f.fade);
  S.whiten(img, f.flash);
  quantize(img, W, H, BOARD);
  if (f.mosaic > 1) S.mosaic(img, W, H, f.mosaic);
  f.overlay(img);
  return img;
}
