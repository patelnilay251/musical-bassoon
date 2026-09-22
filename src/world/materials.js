// Palette and material table for one world. The seed picks the accent
// colors; everything else is the house style: warm whites, cobalt, aqua,
// palm green, and one loud color per resort.

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

export function makeMaterials(rng) {
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
  add('deck', { color: '#efe6d3', pattern: 'deck', scale: 1.2 });
  add('coping', { color: '#f8f4ea' });
  add('lawn', { color: '#63aa56', pattern: 'lawn' });
  add('field', { color: '#bdb883' });
  add('drive', { color: '#ddd5c6', pattern: 'deck', scale: 3 });
  add('wall', { color: '#f4f0e7', ao: true });
  add('trim', { color: '#fbf9f3' });
  add('accent', { color: accent.wall, ao: true });
  add('door', { color: accent.door });
  add('frame', { color: '#e8e3d8' });
  add('glass', { kind: 'glass', color: '#34507e', emit: '#ffc36e' });
  add('boundary', { color: '#f1e9d9', ao: true });
  add('water', { kind: 'water', color: '#1596c4' });
  add('poolTile', { color: '#92dce6', pattern: 'tile' });
  add('trunk', { color: '#b89f82', pattern: 'trunk' });
  add('boot', { color: '#8f7a56' });
  add('frond', { kind: 'foliage', color: '#3f9c55' });
  add('frondDark', { kind: 'foliage', color: '#2f8350' });
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
  add('headlight', { kind: 'lamp', color: '#f3efe2', emit: '#fff3d0' });
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
  return { list, M, accent, car };
}
