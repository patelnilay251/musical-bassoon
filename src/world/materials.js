// Palette and material table for one world. The seed picks the accent
// colors; everything else is the house style: warm whites, cobalt, aqua,
// palm green, and one loud color per resort. A few colors are the look's
// (looks.js): the ground, the palms.

import { lookOf } from '../looks.js';

const ACCENTS = [
  { wall: '#ef8e7f', door: '#2f6db5' }, // salmon
  { wall: '#f3c24f', door: '#2f6db5' }, // sunflower
  { wall: '#86d3bd', door: '#ef6f5e' }, // mint
  { wall: '#f07a61', door: '#2a5fa8' }, // coral
  { wall: '#b9a2e0', door: '#f3c24f' }, // lilac
  { wall: '#75b8ea', door: '#ef6f5e' }, // sky
];

const CARS = ['#d7302b', '#f1ece0', '#2e6fc0', '#f2b233', '#1f8a76'];

const CANVAS = [
  ['#e9463f', '#fbf6ee'],
  ['#2f6db5', '#fbf6ee'],
  ['#f3b634', '#fbf6ee'],
  ['#1f8a76', '#fbf6ee'],
];

export function makeMaterials(rng, look) {
  const P = lookOf(look).colors;
  const accent = rng.pick(ACCENTS);
  const car = rng.pick(CARS);
  const canvas = rng.pick(CANVAS);
  const towel = rng.pick([
    ['#f06a5c', '#fbf6ee'],
    ['#f3b634', '#2f6db5'],
    ['#6fc3e6', '#fbf6ee'],
  ]);
  const list = [];
  const M = {};
  const add = (name, def) => {
    M[name] = list.length;
    list.push({ name, ...def });
  };
  add('deck', { color: P.deck, pattern: 'deck', scale: 1.2 });
  add('coping', { color: P.coping });
  add('lawn', { color: P.lawn, pattern: 'lawn' });
  add('field', { color: '#bdb883' });
  add('drive', { color: '#ddd5c6', pattern: 'deck', scale: 3 });
  add('wall', { color: '#f4f0e7', ao: true });
  add('trim', { color: '#fbf9f3' });
  add('accent', { color: accent.wall, ao: true });
  add('door', { color: accent.door });
  add('frame', { color: '#e8e3d8' });
  add('glass', { kind: 'glass', color: '#34507e', emit: '#ffc36e' });
  // Motel rooms draw their curtains; the visitor's window is switched by
  // hand (emitScale) instead of lit by chance.
  add('roomGlass', { kind: 'glass', color: '#34507e', emit: '#ffc36e', curtains: true });
  add('visitorGlass', { kind: 'glass', color: '#34507e', emit: '#ffc36e', curtains: true, switched: true });
  add('carGlass', { kind: 'glass', color: '#34507e' });
  add('boundary', { color: '#f1e9d9', ao: true });
  add('water', { kind: 'water', color: '#1596c4' });
  add('poolTile', { color: '#92dce6', pattern: 'tile' });
  add('trunk', { color: P.trunk, pattern: 'trunk' });
  add('boot', { color: '#8f7a56' });
  add('frond', { kind: 'foliage', color: P.frond, pattern: 'frond' });
  add('frondDark', { kind: 'foliage', color: P.frondDark, pattern: 'frond' });
  add('nut', { color: '#7a6a33' });
  add('hedge', { color: '#3d8c48' });
  add('loungerFrame', { color: '#f7f6f1' });
  add('cushion', { color: '#fbf8f0', color2: '#3c7fd0', pattern: 'stripes' });
  add('towel', { color: towel[0], color2: towel[1], pattern: 'stripes', scale: 0.8 });
  add('canvasA', { color: canvas[0] });
  add('canvasB', { color: canvas[1] });
  add('pole', { color: '#f4f2ec' });
  add('chrome', { kind: 'chrome', color: '#d0d4d8' });
  add('paint', { kind: 'paint', color: car });
  add('leather', { color: '#efe2c8' });
  add('tire', { color: '#262628' });
  add('headlight', { kind: 'paint', color: '#f3efe2' }); // parked: never lit
  add('headlightLit', { kind: 'lamp', color: '#f3efe2', emit: '#fff1cc' }); // driving after dark
  add('taillightLit', { kind: 'lamp', color: '#c8262c', emit: '#ff3a30' });
  add('taillight', { color: '#c8262c' });
  add('globe', { kind: 'lamp', color: '#f6f2e8', emit: '#ffe6ad' });
  add('post', { color: '#f0ece3' });
  add('cliff', { color: '#e3cfae' });
  add('hill', { kind: 'distant', color: '#8a8fbf' });
  add('island', { kind: 'distant', color: '#7c86b6' });
  add('floatA', { color: '#ec4a3e' });
  add('floatB', { color: '#fbf8f0' });
  add('book', { color: '#2f6db5' });
  add('pages', { color: '#f8f4e8' });
  add('board', { color: '#f7f5ef' });
  add('table', { color: '#f7f6f1' });
  add('glassware', { kind: 'chrome', color: '#e6f0f4' });

  // ---- the rest of Paloma Bay (fixed colors: the town is the same town
  // whichever house the seed builds)
  add('visitor', { kind: 'paint', color: '#f2b233' }); // the yellow convertible
  add('paintRed', { kind: 'paint', color: '#d7302b' });
  add('paintCream', { kind: 'paint', color: '#f1ece0' });
  add('paintBlue', { kind: 'paint', color: '#2e6fc0' });
  add('paintTeal', { kind: 'paint', color: '#1f8a76' });
  add('paintPink', { kind: 'paint', color: '#ee8f9c' });
  add('paintWhite', { kind: 'paint', color: '#f6f4ee' });
  add('asphalt', { color: '#6c7188', pattern: 'road' });
  add('road', { color: '#6c7188', pattern: 'road' }); // a scene gives it lanes to wear
  add('lot', { color: '#858aa0', pattern: 'road' });
  add('lineWhite', { color: '#f5f2e8' });
  add('lineYellow', { color: '#f4c04a' });
  add('curb', { color: '#efe9dd' });
  add('sidewalk', { color: P.sidewalk, pattern: 'deck', scale: 1.6 });
  add('sand', { color: P.sand, pattern: 'sand' });
  add('wetSand', { color: '#d9bf98' });
  add('print', { color: '#e2c7a0' }); // footprints in dry sand
  add('printWet', { color: '#c4a47c' }); // and in wet
  add('foam', { color: '#fdfcf8' });
  add('lace', { color: '#c9f1ee' }); // thinning foam over the shallows
  add('sea', { kind: 'harbor', color: '#1a5fb0' });
  add('planks', { color: '#d2bc98', pattern: 'planks' });
  add('piling', { color: '#8c7a66' });
  add('rail', { color: '#f7f5ef' });
  add('fanTrunk', { color: P.fanTrunk, pattern: 'trunk', scale: 0.7 });
  add('skirt', { color: P.skirt });
  add('fanLeaf', { kind: 'foliage', color: P.fanLeaf, pattern: 'frond' });
  add('neonPink', { kind: 'neon', color: '#f8c9d8', emit: '#ff5fa8' });
  add('neonCyan', { kind: 'neon', color: '#cdf1f6', emit: '#54e8ff' });
  add('neonRed', { kind: 'neon', color: '#f6c6be', emit: '#ff4a3a' });
  add('neonWhite', { kind: 'neon', color: '#f8f5ee', emit: '#fff1d4' });
  add('signTeal', { color: '#1d9aa0' });
  add('signCream', { color: '#fbf5e6' });
  add('signRed', { color: '#e2473b' });
  add('signNavy', { color: '#23407e' });
  add('stucco', { color: '#f6f1e8', ao: true });
  add('salmon', { color: '#ef8e7f', ao: true });
  add('mint', { color: '#8fd6c0', ao: true });
  add('butter', { color: '#f5d77a', ao: true });
  add('lilac', { color: '#bba6e2', ao: true });
  add('skyBlue', { color: '#86c6ee', ao: true });
  add('doorRed', { color: '#e9463f' });
  add('doorYellow', { color: '#f3b634' });
  add('doorBlue', { color: '#2f6db5' });
  add('doorGreen', { color: '#1f8a76' });
  add('doorPink', { color: '#ef8e9f' });
  add('awningRed', { color: '#e9463f', color2: '#fbf6ee', pattern: 'stripes', scale: 2 });
  add('awningBlue', { color: '#2f6db5', color2: '#fbf6ee', pattern: 'stripes', scale: 2 });
  add('awningGreen', { color: '#1f8a76', color2: '#fbf6ee', pattern: 'stripes', scale: 2 });
  add('hull', { kind: 'paint', color: '#f8f7f2' });
  add('hullNavy', { kind: 'paint', color: '#1d3b82' });
  add('hullRed', { kind: 'paint', color: '#c9352f' });
  add('bootStripe', { color: '#1d3b82' });
  add('teak', { color: '#c9a77c' });
  add('mast', { color: '#eef0f0' });
  add('sailCover', { color: '#2f6db5' });
  add('rope', { color: '#474a58' });
  add('rock', { color: '#b8ab9d' });
  add('lhRed', { color: '#d63a33' });
  add('beacon', { kind: 'lamp', color: '#f8f0d8', emit: '#ffe9ad' });
  add('towerBlue', { color: '#8fd0ea', ao: true });
  add('number', { color: '#2f6db5' });
  add('boardRed', { kind: 'paint', color: '#f06a5c' });
  add('boardYellow', { kind: 'paint', color: '#f5c64f' });
  add('boardAqua', { kind: 'paint', color: '#5cc6d8' });
  add('boardWhite', { kind: 'paint', color: '#f8f5ec' });
  add('lamp', { kind: 'lamp', color: '#f6f2e8', emit: '#ffdca0' });
  add('signalBody', { color: '#e0b93a' });
  add('signalRed', { kind: 'lamp', color: '#b3302b', emit: '#ff4a3a' });
  add('shrub', { kind: 'foliage', color: '#3f8f4c' });
  add('lawnTown', { color: '#4aa865' });
  add('scenery', { kind: 'distant', color: '#8f95c4' });
  add('headland', { kind: 'distant', color: '#8a86b6' });
  add('sail', { color: '#fbf8f0' });
  add('leatherPleat', { color: '#efe2c8', color2: '#e3d2b2', pattern: 'stripes', scale: 0.5 });
  add('canvasTop', { color: '#f2ead8' });
  add('whitewall', { color: '#f4f1e8' });
  add('plate', { color: '#2a4a8c' });
  add('meter', { kind: 'paint', color: '#aeb4bf' });
  // Flowering shrubs (planted only in looks that have flowers).
  add('bush', { kind: 'foliage', color: '#236c38' });
  add('bougainvillea', { color: '#e0287e' });
  add('bougainvilleaLight', { color: '#f45fa6' });
  add('hibiscus', { color: '#e23a34' });
  add('hibiscusLight', { color: '#f6705a' });
  add('oleander', { color: '#f58cb8' });
  add('blossomWhite', { color: '#fbf6ee' });
  add('lantana', { color: '#f2c030' });
  add('lantanaLight', { color: '#f7de68' });
  add('meterPost', { color: '#5d6373' });
  add('meterFlag', { color: '#e2473b' });
  return { list, M, accent, car };
}
