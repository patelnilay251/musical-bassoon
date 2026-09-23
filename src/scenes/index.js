// Paloma Bay: the places in town, in the order a visitor would drive them.
// Every place is built from a fixed seed, so the town is always the same
// town; `props` only move the things people leave behind.

import * as house from './house.js';
import * as motel from './motel.js';
import * as beach from './beach.js';
import * as boulevard from './boulevard.js';
import * as marina from './marina.js';
import { lookOf } from '../looks.js';

export const PLACES = {
  motel,
  boulevard,
  beach,
  house,
  marina,
};

export const ORDER = Object.keys(PLACES);

// `look`: the name of one of the looks (src/looks.js), or the default.
export function buildPlace(id, props = {}, look) {
  const place = PLACES[id];
  if (!place) throw new Error(`no such place: ${id}`);
  const world = place.build(props, lookOf(look));
  world.hero = place.VIEWS[0];
  return world;
}
