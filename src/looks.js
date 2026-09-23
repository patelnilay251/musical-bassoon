// Two looks for one town. The same places under the same sun on the same
// day, painted two ways; every picture can be made in either.
//
//   pastel  The first look: an airbrushed summer. The sky is misted white
//           at the horizon and heaped with cumulus, a face in shadow is
//           its own color under the blue shade light, and a fine grain
//           lies over everything like the tooth of acrylic sprayed on
//           board.
//   cobalt  The repaint, made after measuring record covers of the 1980s
//           against our pictures: a deep cobalt sky right down to the
//           horizon and hardly a cloud, shadows mixed the way a painter
//           mixes them (each color's own hue, deeper and richer), crisp
//           paint with no grain or haze, dark palms with bright tips,
//           flecks of sun on the pools, and flowering bushes for spots of
//           hot color.
//
// A look is only data. The places read it when they are built (a few
// colors, the clouds, the pools, the flowers) and the renderer when it
// paints (the sky, the shade, the veil of distance, the grain).

// Palette keyframes by solar elevation (degrees), for sky.js. Each moment
// names a light tone and a shade tone directly, the way an illustrator
// would: a lit face is its local color times `light`, a face in shadow its
// local color times `shade` (or, in cobalt, a shadow mixed from both).
// Shadows are a change of hue, not a loss of it. The two looks share their
// sunsets.
const DUSK = [
  { el: -4, zenith: '#111b5a', mid: '#2f3278', horizon: '#76599a', sunSide: '#b86a88', light: '#4c4b8e', shade: '#4c4b8e', glow: '#d27886', glowK: 0.3, cloudLit: '#a57498', cloudShade: '#42427c', seaNear: '#121a58', seaFar: '#665796' },
  { el: -0.8, zenith: '#1b2b80', mid: '#554a98', horizon: '#d383a0', sunSide: '#f98d60', light: '#665a9e', shade: '#665a9e', glow: '#ff9058', glowK: 0.5, cloudLit: '#f7a58e', cloudShade: '#6e5f9c', seaNear: '#1b2c7c', seaFar: '#b98aa6' },
  { el: 2.5, zenith: '#1f3590', mid: '#6c5fa6', horizon: '#f0a19c', sunSide: '#ffb069', light: '#ffac7a', shade: '#6e5ca6', glow: '#ffa060', glowK: 0.55, cloudLit: '#ffbd94', cloudShade: '#8a74ae', seaNear: '#1f358a', seaFar: '#d99aa0' },
];

export const LOOKS = {
  pastel: {
    name: 'pastel',
    title: 'Pastel',
    keys: [
      { el: -18, zenith: '#03061c', mid: '#08102e', horizon: '#151c44', sunSide: '#171e48', light: '#1d2356', shade: '#1d2356', glow: '#000000', glowK: 0, cloudLit: '#242b58', cloudShade: '#10163a', seaNear: '#050b28', seaFar: '#121a42' },
      { el: -9, zenith: '#080e34', mid: '#171e56', horizon: '#30336c', sunSide: '#473a72', light: '#30356f', shade: '#30356f', glow: '#6a4a8a', glowK: 0.15, cloudLit: '#443f78', cloudShade: '#1d214c', seaNear: '#0a1238', seaFar: '#262c66' },
      ...DUSK,
      { el: 7, zenith: '#1d43a8', mid: '#4f74c4', horizon: '#f3d7bf', sunSide: '#ffca8e', light: '#ffd29c', shade: '#7676b8', glow: '#ffc080', glowK: 0.4, cloudLit: '#ffe1b8', cloudShade: '#a09cc4', seaNear: '#1a4096', seaFar: '#c9b4b4' },
      { el: 15, zenith: '#1440ae', mid: '#3474d2', horizon: '#e6eff0', sunSide: '#fbe9cf', light: '#ffeccb', shade: '#7282c8', glow: '#fff0d0', glowK: 0.22, cloudLit: '#fff8ea', cloudShade: '#b0bddf', seaNear: '#123f9c', seaFar: '#8cb4d8' },
      { el: 30, zenith: '#0d36a8', mid: '#2a6ad4', horizon: '#d5eff8', sunSide: '#e8f4f4', light: '#fff7e8', shade: '#6d84cf', glow: '#ffffff', glowK: 0.12, cloudLit: '#ffffff', cloudShade: '#abc0e5', seaNear: '#0e3e9e', seaFar: '#4a93d6' },
      { el: 75, zenith: '#0a2f9e', mid: '#1f5fd0', horizon: '#cfeefb', sunSide: '#e4f5fb', light: '#fffbf1', shade: '#6a82d0', glow: '#ffffff', glowK: 0.1, cloudLit: '#ffffff', cloudShade: '#a9bfe6', seaNear: '#0c3a9a', seaFar: '#3c8ad6' },
    ],
    // How the sky is sprayed: white mist from the horizon (`mist`: how
    // high it climbs, in sine of elevation), blue layered over it, the
    // zenith's tone taking over between deep[0] and deep[1] (curve
    // deep[2]), an unevenness by hand, low streaks at any hour, and the
    // strength of the moonlight.
    sky: { mist: 0.15, deep: [0.16, 0.95, 0.85], uneven: 0.04, lowSunStreaks: false, moon: 0.14 },
    // How many cumulus each place's sky has, where they sit (degrees above
    // the horizon) and how wide they are (degrees).
    clouds: { house: [4, 6], motel: [3, 5], beach: [4, 6], boulevard: [3, 5], marina: [3, 5] },
    cumulus: { base: [1.5, 8], width: [12, 26] },
    // 'plain': a face in shadow is its color times the shade tone.
    shade: 'plain',
    // Palm leaves: deep at the crown, lighter toward the tips (u) and
    // across the leaf (v), and a touch warmer at the tips.
    frond: { base: 0.74, tip: 0.3, across: 0.16, warm: 0.96, warmTip: 0.1 },
    // Aerial perspective: far scenery fades over `far` meters; everything
    // else takes `near` of the horizon's tone between `from` and `to`,
    // then fades over `depth` meters beyond.
    haze: { far: 2600, near: 0.16, from: 30, to: 220, depth: 3500 },
    // The pools: tile and water colors, flecks of sun, and how strongly
    // the painted bands and crest lines lie on the water.
    pool: { tile: '#c4f0f2', water: '#12a4d4', flecks: false, strokes: 1 },
    flowers: false,
    grain: 0.024,
    // The colors that differ between the looks (materials.js).
    colors: {
      deck: '#f5f0e4',
      coping: '#f8f4ea',
      lawn: '#43a45e',
      trunk: '#b89f82',
      frond: '#3a9c52',
      frondDark: '#2c8a4e',
      sidewalk: '#e8e0d2',
      sand: '#f2dcb8',
      fanTrunk: '#a48f7a',
      skirt: '#b69a68',
      fanLeaf: '#3f9858',
    },
  },

  cobalt: {
    name: 'cobalt',
    title: 'Cobalt',
    keys: [
      { el: -18, zenith: '#07114a', mid: '#0c1a66', horizon: '#18287e', sunSide: '#1a2a82', light: '#26337a', shade: '#26337a', glow: '#000000', glowK: 0, cloudLit: '#2c387a', cloudShade: '#141e56', seaNear: '#07124a', seaFar: '#16247a' },
      { el: -9, zenith: '#0a1656', mid: '#162676', horizon: '#2e3a8a', sunSide: '#473f88', light: '#343f86', shade: '#343f86', glow: '#6a4a8a', glowK: 0.15, cloudLit: '#484a8c', cloudShade: '#1f2860', seaNear: '#0b1850', seaFar: '#28337e' },
      ...DUSK,
      { el: 7, zenith: '#153a9c', mid: '#3a62b6', horizon: '#eec8ae', sunSide: '#ffc58a', light: '#ffd29c', shade: '#7676b8', glow: '#ffc080', glowK: 0.4, cloudLit: '#ffe1b8', cloudShade: '#a09cc4', seaNear: '#123e90', seaFar: '#8e86b0' },
      { el: 15, zenith: '#0b3490', mid: '#0f58b0', horizon: '#3f90d0', sunSide: '#7cb6e0', light: '#ffeccb', shade: '#7496d4', glow: '#fff0d0', glowK: 0.16, cloudLit: '#fff8ea', cloudShade: '#b0bddf', seaNear: '#0e4496', seaFar: '#2a6cb0' },
      { el: 30, zenith: '#0a2f86', mid: '#0b52a8', horizon: '#2e83c8', sunSide: '#5ea6dc', light: '#fff7e8', shade: '#78a0dc', glow: '#ffffff', glowK: 0.08, cloudLit: '#ffffff', cloudShade: '#abc0e5', seaNear: '#0c4499', seaFar: '#1a62b2' },
      { el: 75, zenith: '#082b80', mid: '#0a4ea4', horizon: '#2a7fc4', sunSide: '#56a0da', light: '#fffbf1', shade: '#769edc', glow: '#ffffff', glowK: 0.06, cloudLit: '#ffffff', cloudShade: '#a9bfe6', seaNear: '#0b4096', seaFar: '#185eae' },
    ],
    // The horizon's tone only in the lowest few degrees, blue laid over
    // it, and a deep cobalt that takes over well before the top of the
    // picture. Streaks only when the sun is low; a clear day has none.
    sky: { mist: 0.07, deep: [0.02, 0.55, 0.9], uneven: 0.015, lowSunStreaks: true, moon: 0.3 },
    clouds: { house: [0, 2], motel: [0, 2], beach: [1, 2], boulevard: [0, 1], marina: [0, 2] },
    cumulus: { base: [1, 4.5], width: [9, 17] },
    // 'painted': shadows mixed as a painter mixes them (render.js).
    shade: 'painted',
    // Dark at the crown and bright, yellowing, toward the tips.
    frond: { base: 0.45, tip: 0.72, across: 0.1, warm: 0.86, warmTip: 0.34 },
    haze: { far: 5200, near: 0.05, from: 60, to: 400, depth: 9000 },
    pool: { tile: '#a6dcf2', water: '#1a82d2', flecks: true, strokes: 0.45 },
    flowers: true,
    grain: 0.006,
    colors: {
      deck: '#f4e1d2',
      coping: '#f7ede4',
      lawn: '#34a04e',
      trunk: '#9a806a',
      frond: '#1f7a3c',
      frondDark: '#175f33',
      sidewalk: '#ecdcd0',
      sand: '#f3d4ae',
      fanTrunk: '#6e4a38',
      skirt: '#5b4634',
      fanLeaf: '#1f7038',
    },
  },
};

// In the order a switch offers them: first the first.
export const LOOK_NAMES = Object.keys(LOOKS);
export const DEFAULT_LOOK = 'cobalt';

/** The look called `name` (or a look itself); anything else, the default. */
export function lookOf(name) {
  if (name && typeof name === 'object') return name;
  return LOOKS[name] ?? LOOKS[DEFAULT_LOOK];
}
