// The house on the point: the villa from the first book, one of the
// places in town now. The world itself lives in ../world/index.js.

import { buildWorld, DEFAULT_SEED, DEFAULT_PROPS as HOUSE_PROPS } from '../world/index.js';
import { views } from '../views.js';
import { level, levelAt } from '../camera.js';

export const NAME = 'The House';
// Compositions, the first one the place's hero.
export const VIEWS = ['pool', 'front', 'sunset'];
export const DEFAULT_PROPS = HOUSE_PROPS;

export function build(props = {}, look) {
  const world = buildWorld(DEFAULT_SEED, props, look);
  const L = world.layout;
  const p = L.pool;
  const pcz = (p.z0 + p.z1) / 2;
  world.id = 'house';
  world.name = NAME;
  world.views = {
    ...views(L),
    // Level compositions for the town: verticals stay vertical.
    pool: levelAt([p.x0 - 1.6, 1.45, p.z1 + 2.6], [L.villa.D * 0.4, 0, (L.villa.z0 + L.villa.z1) / 2 - 2], 40, 0.3),
    sunset: level([p.x1 + 1.3, 1.6, pcz + 2], 272, 36, 0.36),
    front: levelAt([L.car.x + 10, 1.55, L.car.z + 7.5], [L.car.x - 3, 0, L.car.z - 2], 36, 0.3),
  };
  world.hero = 'pool';
  return world;
}
