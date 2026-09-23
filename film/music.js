// The soundtrack: an original tune in the city-pop manner, arranged for
// an FM board. D major at 100 beats a minute; each section of the film
// gets four bars.
//
//   title      a fanfare as the logo lands, the hook, and the start jingle
//   dawn       electric piano and a celesta, no drums yet
//   breakfast  the band comes in: the verse
//   house      the verse again, the lead a little higher
//   beach      the chorus, on the royal road (IV - V - iii - vi)
//   marina     half-time, a bridge that climbs a whole step
//   sunset     the chorus in E, everything playing
//   night      down to piano and bass
//   ending     the last cadence; then the hook on a music box, unresolved,
//              the way an attract mode starts over
//
// This file is only notes: events for film/sound.js to play.

import { BAR } from './score.js';

const B = BAR / 4; // one beat
const at = (bar, beat = 0) => bar * BAR + beat * B;

// Chords: the root for the bass, and a rootless voicing for the keys.
const CH = {
  Dmaj9: { root: 38, v: [57, 61, 64, 66] },
  Gmaj9: { root: 43, v: [59, 62, 66, 69] },
  A13: { root: 45, v: [61, 66, 67, 71] },
  A9sus: { root: 45, v: [62, 64, 67, 71] },
  Fsm9: { root: 42, v: [57, 61, 64, 68] },
  Em9: { root: 40, v: [55, 59, 62, 66] },
  Bm9: { root: 47, v: [62, 66, 69, 73] },
  B9sus: { root: 47, v: [64, 66, 69, 73] },
  Bb: { root: 46, v: [58, 62, 65, 70] },
  C: { root: 48, v: [60, 64, 67, 72] },
  D: { root: 50, v: [62, 66, 69, 74] },
  // up a whole step, for the last chorus
  Amaj9: { root: 45, v: [61, 64, 68, 71] },
  B13: { root: 47, v: [63, 68, 69, 73] },
  Gsm9: { root: 44, v: [59, 63, 66, 70] },
  Csm9: { root: 49, v: [64, 68, 71, 75] },
};

// Bar by bar: [chord at beat 0, chord at beat 2 (optional)].
const CHART = [
  ['Dmaj9'], ['Gmaj9'], ['A13'], ['D'],
  ['Dmaj9'], ['Bm9'], ['Gmaj9'], ['A9sus'],
  ['Gmaj9'], ['Fsm9'], ['Em9'], ['A9sus', 'A13'],
  ['Gmaj9'], ['Fsm9'], ['Bm9'], ['Em9', 'A13'],
  ['Gmaj9'], ['A13'], ['Fsm9'], ['Bm9'],
  ['Em9'], ['Fsm9'], ['Gmaj9'], ['A9sus', 'B9sus'],
  ['Amaj9'], ['B13'], ['Gsm9'], ['Csm9'],
  ['Gmaj9'], ['Fsm9'], ['Em9'], ['A9sus'],
  ['Gmaj9'], ['A13'], ['Dmaj9'], ['Dmaj9'],
];
export const chordAt = (bar, beat = 0) => CH[CHART[bar][beat >= 2 && CHART[bar][1] ? 1 : 0]];

// Note names, for writing melodies down.
const N = {};
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => {
  for (let o = 2; o <= 7; o++) N[n + o] = 12 * (o + 1) + i;
});
const mel = (bar, notes, shift = 0) => notes.map(([beat, dur, n]) => ({ t: at(bar, beat), dur: dur * B, midi: N[n] + shift }));

// The hook: four bars over the royal road.
const HOOK = [
  [[0.5, 0.5, 'D5'], [1, 0.5, 'E5'], [1.5, 1, 'F#5'], [2.5, 0.5, 'E5'], [3, 0.5, 'D5'], [3.5, 1, 'A5']],
  [[0.5, 0.5, 'G5'], [1, 0.5, 'F#5'], [1.5, 1, 'E5'], [2.5, 0.5, 'C#5'], [3, 0.5, 'E5'], [3.5, 1, 'F#5']],
  [[0.5, 0.5, 'E5'], [1, 0.5, 'F#5'], [1.5, 1.5, 'A5'], [3, 0.5, 'F#5'], [3.5, 0.5, 'E5']],
  [[0, 1, 'D5'], [1, 0.5, 'E5'], [1.5, 0.5, 'F#5'], [2, 1, 'D5'], [3, 1, 'B4']],
];
const VERSE = [
  [[0, 0.5, 'B4'], [0.5, 0.5, 'D5'], [1, 0.5, 'F#5'], [1.5, 0.5, 'E5'], [2, 0.75, 'D5'], [2.75, 0.25, 'B4'], [3, 1, 'D5']],
  [[0, 0.5, 'C#5'], [0.5, 0.5, 'E5'], [1, 0.75, 'A5'], [1.75, 0.25, 'F#5'], [2, 1, 'E5'], [3, 0.5, 'C#5'], [3.5, 0.5, 'A4']],
  [[0, 0.5, 'B4'], [0.5, 0.5, 'D5'], [1, 0.75, 'G5'], [1.75, 0.25, 'F#5'], [2, 0.5, 'E5'], [2.5, 0.5, 'D5'], [3, 1, 'B4']],
  [[0, 0.5, 'A4'], [0.5, 0.5, 'B4'], [1, 1, 'D5'], [2, 1, 'C#5'], [3, 0.5, 'E5'], [3.5, 0.5, 'G5']],
];
const VERSE2 = [
  [[0, 0.5, 'D5'], [0.5, 0.5, 'F#5'], [1, 1, 'A5'], [2, 0.5, 'G5'], [2.5, 0.5, 'F#5'], [3, 0.5, 'E5'], [3.5, 0.5, 'D5']],
  [[0, 1.5, 'E5'], [1.5, 0.5, 'C#5'], [2, 0.5, 'A4'], [2.5, 0.5, 'C#5'], [3, 1, 'E5']],
  [[0, 0.5, 'D5'], [0.5, 0.5, 'F#5'], [1, 1, 'B5'], [2, 0.5, 'A5'], [2.5, 0.5, 'F#5'], [3, 1, 'D5']],
  [[0, 0.5, 'E5'], [0.5, 0.5, 'G5'], [1, 0.5, 'B5'], [1.5, 0.5, 'A5'], [2, 0.5, 'G5'], [2.5, 0.5, 'E5'], [3, 0.5, 'C#5'], [3.5, 0.5, 'A4']],
];
const BRIDGE = [
  [[0, 1.5, 'B4'], [1.5, 0.5, 'D5'], [2, 2, 'F#5']],
  [[0, 1.5, 'E5'], [1.5, 0.5, 'C#5'], [2, 2, 'A4']],
  [[0, 1, 'B4'], [1, 1, 'D5'], [2, 1, 'F#5'], [3, 1, 'A5']],
  [[0, 1, 'D5'], [1, 1, 'E5'], [2, 1, 'F#5'], [3, 1, 'A5']],
];
const DAWN = [
  [[1, 1, 'A5'], [2, 1, 'F#5'], [3, 1, 'E5']],
  [[0, 2, 'D5'], [2, 1, 'C#5'], [3, 1, 'B4']],
  [[0.5, 0.5, 'D5'], [1, 1, 'F#5'], [2, 0.5, 'A5'], [2.5, 1.5, 'G5']],
  [[0, 1.5, 'E5'], [1.5, 0.5, 'D5'], [2, 2, 'E5']],
];
const NIGHT = [
  [[2, 0.5, 'F#5'], [2.5, 0.5, 'E5'], [3, 1, 'D5']],
  [[2, 0.5, 'E5'], [2.5, 0.5, 'C#5'], [3, 1, 'A4']],
  [[2, 0.5, 'D5'], [2.5, 0.5, 'B4'], [3, 1, 'G4']],
  [[0, 2, 'A4'], [2, 1, 'B4'], [3, 1, 'D5']],
];

// ---------------------------------------------------------------- parts

const events = [];
const push = (e) => events.push(e);

function lead(bar, phrase, { shift = 0, vel = 0.8, double = false, inst = 'lead' } = {}) {
  phrase.forEach((notes, i) => {
    for (const n of mel(bar + i, notes, shift)) {
      push({ inst, ...n, vel });
      if (double) push({ inst, ...n, midi: n.midi - 12, vel: vel * 0.55 });
    }
  });
}

// Keys: [beat, length, velocity] hits of the chord in force at that beat.
const COMP_A = [[0, 0.5, 0.8], [1.5, 0.5, 0.6], [2.5, 0.4, 0.7], [3.25, 0.5, 0.55]];
const COMP_B = [[0, 0.45, 0.85], [0.75, 0.25, 0.5], [1.5, 0.5, 0.7], [2.5, 0.25, 0.6], [2.75, 0.5, 0.7], [3.5, 0.5, 0.6]];
function comp(bar, pattern, vel = 1) {
  for (const [beat, len, v] of pattern) push({ inst: 'ep', t: at(bar, beat), dur: len * B, chord: chordAt(bar, beat).v, vel: v * vel });
}
function held(bar, { beats = [0], len = 4, vel = 0.6, roll = 0.03, pad = 0 } = {}) {
  for (const beat of beats) {
    const c = chordAt(bar, beat).v;
    push({ inst: 'ep', t: at(bar, beat), dur: len * B, chord: c, vel, roll });
    if (pad) push({ inst: 'pad', t: at(bar, beat), dur: len * B, chord: c.map((m) => m + 12), vel: pad });
  }
}

// Bass: city-pop sixteenths, octave pops, a walk into the next root.
function bassGroove(bar) {
  const r = chordAt(bar, 0).root;
  const r2 = chordAt(bar, 2).root;
  const next = CHART[bar + 1] ? chordAt(bar + 1, 0).root : r;
  const walk = next > r2 ? next - 1 : next + 2;
  for (const [beat, len, m, v] of [
    [0, 0.7, r, 0.95],
    [0.75, 0.25, r + 12, 0.7],
    [1.5, 0.5, r, 0.8],
    [2, 0.5, r2, 0.85],
    [2.5, 0.5, r2 + 7, 0.7],
    [3, 0.25, r2 + 12, 0.75],
    [3.5, 0.5, walk, 0.7],
  ]) push({ inst: 'bass', t: at(bar, beat), dur: len * B, midi: m, vel: v });
}
function bassHalf(bar) {
  const r = chordAt(bar, 0).root;
  const r2 = chordAt(bar, 2).root;
  for (const [beat, len, m, v] of [
    [0, 1.4, r, 0.9],
    [1.5, 0.5, r + 12, 0.6],
    [2, 1.0, r2 + 7, 0.75],
    [3, 0.5, r2, 0.7],
    [3.5, 0.5, r2 + 12, 0.6],
  ]) push({ inst: 'bass', t: at(bar, beat), dur: len * B, midi: m, vel: v });
}
function bassHeld(bar, vel = 0.7) {
  push({ inst: 'bass', t: at(bar), dur: 3.8 * B, midi: chordAt(bar).root, vel });
}

// Drums.
function groove(bar, { claps = false, open = false, fill = false, crash = false, hats = 1 } = {}) {
  const d = (inst, beat, vel = 1) => push({ inst, t: at(bar, beat), vel });
  if (crash) d('crash', 0, 0.9);
  for (const beat of [0, 1.75, 2.5]) d('kick', beat, beat ? 0.8 : 1);
  for (const beat of [1, 3]) {
    if (fill && beat === 3) continue;
    d('snare', beat);
    if (claps) d('clap', beat, 0.8);
  }
  d('snare', 2.75, 0.18);
  for (let k = 0; k < 16; k++) {
    const beat = k / 4;
    if (fill && beat >= 3) break;
    if (open && k === 14) d('open', beat, 0.7 * hats);
    else d('hat', beat, (k % 4 === 0 ? 0.9 : k % 2 === 0 ? 0.6 : 0.38) * hats);
  }
  if (fill) [[3, 0.9, 196], [3.25, 0.8, 165], [3.5, 0.85, 139], [3.75, 0.9, 110]].forEach(([beat, v, f]) => push({ inst: 'tom', t: at(bar, beat), vel: v, freq: f, pan: (f - 150) / 90 }));
}
function halfTime(bar, { roll = false } = {}) {
  const d = (inst, beat, vel = 1) => push({ inst, t: at(bar, beat), vel });
  d('kick', 0);
  d('kick', 2.75, 0.6);
  if (!roll) d('snare', 2, 0.9);
  for (let k = 0; k < 8; k++) d('hat', k / 2, k % 2 ? 0.35 : 0.6);
  if (roll) for (let k = 0; k < 8; k++) d('snare', 2 + k / 4, 0.25 + 0.09 * k);
}
function shakers(bar, from = 0, vel = 0.5) {
  for (let k = from * 4; k < 16; k++) push({ inst: 'shaker', t: at(bar, k / 4), vel: vel * (k % 2 ? 0.55 : 1) * (0.6 + (0.4 * k) / 16) });
}

// A sparkle of square-wave sixteenths up and down the chord, as the
// boards did when they had channels to spare.
function sparkle(bar, vel = 0.5) {
  const order = [0, 1, 2, 3, 2, 1, 2, 3];
  for (let k = 0; k < 16; k++) {
    const c = chordAt(bar, k / 4).v;
    push({ inst: 'arp', t: at(bar, k / 4), dur: 0.2 * B, midi: c[order[k % 8]] + 24, vel: vel * (k % 4 === 0 ? 1 : 0.7), pan: k % 2 ? 0.45 : -0.45 });
  }
}

// ---------------------------------------------------------------- the arrangement

// Title. The logo's letters land on a rising pentatonic run (their times
// come from the screen layer), then a chord for the shine.
export function arrangement({ logoTimes = [] } = {}) {
  events.length = 0;
  const run = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6'];
  logoTimes.forEach((t, i) => push({ inst: 'arp', t, dur: 0.06, midi: N[run[Math.min(i, run.length - 1)]], vel: 0.75, pan: -0.6 + (1.2 * i) / 8 }));
  push({ inst: 'ep', t: at(0, 2), dur: 2 * B, chord: CH.Dmaj9.v, vel: 0.8, roll: 0.04 });
  push({ inst: 'pad', t: at(0, 2), dur: 2 * B, chord: CH.Dmaj9.v.map((m) => m + 12), vel: 0.5 });
  push({ inst: 'bell', t: at(0, 2), dur: 1, midi: N.D6, vel: 0.5 });
  push({ inst: 'crash', t: at(0, 2), vel: 0.5 });
  // The hook, once, over the attract groove.
  for (const bar of [1, 2]) {
    groove(bar, { crash: bar === 1, open: true });
    bassGroove(bar);
    comp(bar, COMP_A);
  }
  // (its last note cut short: the jingle starts on the bar)
  lead(1, [HOOK[0], HOOK[1].map(([b, d, n]) => [b, b === 3.5 ? 0.4 : d, n])]);
  // START: flat six, flat seven, one.
  [[0, 'Bb', 0.5], [0.5, 'C', 0.5], [1, 'D', 2.5]].forEach(([beat, name, len]) => {
    push({ inst: 'ep', t: at(3, beat), dur: len * B, chord: CH[name].v, vel: 0.95 });
    push({ inst: 'bass', t: at(3, beat), dur: len * B, midi: CH[name].root, vel: 0.9 });
    push({ inst: 'lead', t: at(3, beat), dur: len * B, midi: CH[name].v[3], vel: 0.8 });
  });
  push({ inst: 'snare', t: at(3, 0), vel: 0.8 });
  push({ inst: 'snare', t: at(3, 0.5), vel: 0.8 });
  push({ inst: 'kick', t: at(3, 1), vel: 1 });
  push({ inst: 'crash', t: at(3, 1), vel: 0.9 });
  ['D5', 'F#5', 'A5', 'D6'].forEach((n, i) => push({ inst: 'arp', t: at(3, 1 + i * 0.25), dur: 0.1, midi: N[n], vel: 0.6, pan: 0 }));

  // Dawn.
  for (let bar = 4; bar < 8; bar++) {
    held(bar, { vel: 0.5, roll: 0.05, pad: 0.35 });
    bassHeld(bar, 0.55);
  }
  lead(4, DAWN, { inst: 'celesta', vel: 0.6 });
  shakers(7, 2, 0.45);

  // Breakfast: the band.
  for (let bar = 8; bar < 12; bar++) {
    groove(bar, { crash: bar === 8, fill: bar === 11 });
    bassGroove(bar);
    comp(bar, COMP_A);
  }
  lead(8, VERSE);

  // The house.
  for (let bar = 12; bar < 16; bar++) {
    groove(bar, { fill: bar === 15, hats: 0.8 });
    bassGroove(bar);
    comp(bar, COMP_A, 0.9);
  }
  lead(12, VERSE2);

  // The beach: the chorus.
  for (let bar = 16; bar < 20; bar++) {
    groove(bar, { crash: bar === 16, claps: true, open: true, fill: bar === 19 });
    bassGroove(bar);
    comp(bar, COMP_B);
    push({ inst: 'pad', t: at(bar), dur: 4 * B, chord: chordAt(bar).v.map((m) => m + 12), vel: 0.25 });
    sparkle(bar, 0.35);
  }
  lead(16, HOOK);

  // The marina: half-time, climbing.
  for (let bar = 20; bar < 24; bar++) {
    halfTime(bar, { roll: bar === 23 });
    bassHalf(bar);
    held(bar, { beats: [0, 2], len: 2, vel: 0.55, roll: 0.02, pad: 0.3 });
  }
  lead(20, BRIDGE, { vel: 0.7 });

  // Sunset: the chorus, a whole step up, everyone playing.
  for (let bar = 24; bar < 28; bar++) {
    groove(bar, { crash: bar === 24 || bar === 26, claps: true, open: true, fill: bar === 27 });
    bassGroove(bar);
    comp(bar, COMP_B, 1.05);
    push({ inst: 'pad', t: at(bar), dur: 4 * B, chord: chordAt(bar).v.map((m) => m + 12), vel: 0.35 });
    sparkle(bar, 0.45);
  }
  lead(24, HOOK, { shift: 2, vel: 0.9, double: true });

  // Night.
  for (let bar = 28; bar < 32; bar++) {
    held(bar, { vel: 0.45, roll: 0.06 });
    push({ inst: 'bass', t: at(bar), dur: 1.9 * B, midi: chordAt(bar).root, vel: 0.6 });
    push({ inst: 'bass', t: at(bar, 2), dur: 1.4 * B, midi: chordAt(bar).root + 7, vel: 0.5 });
    for (let k = 0; k < 8; k++) push({ inst: 'hat', t: at(bar, k / 2 + 0.5), vel: 0.22 });
  }
  lead(28, NIGHT, { inst: 'epLead', vel: 0.55 });

  // The ending: a cadence under the caption, then the music box.
  held(32, { vel: 0.5, roll: 0.05, pad: 0.3 });
  held(33, { vel: 0.5, roll: 0.05, pad: 0.3 });
  held(34, { vel: 0.6, roll: 0.08, len: 8, pad: 0.4 });
  bassHeld(32, 0.6);
  bassHeld(33, 0.6);
  push({ inst: 'bass', t: at(34), dur: 7 * B, midi: CH.Dmaj9.root, vel: 0.65 });
  lead(32, [
    [[0, 0.5, 'B4'], [0.5, 0.5, 'D5'], [1, 1.5, 'F#5'], [2.5, 0.5, 'E5'], [3, 1, 'D5']],
    [[2, 1, 'E5'], [3, 1, 'C#5']],
    [[0, 3.5, 'D5']],
  ], { vel: 0.7 });
  push({ inst: 'bell', t: at(34), dur: 2, midi: N.D6, vel: 0.45 });
  push({ inst: 'crash', t: at(34), vel: 0.35 });
  // The attract loop starting over, on a music box, and stopping short.
  lead(35, [[[0.5, 0.5, 'D6'], [1, 0.5, 'E6'], [1.5, 1, 'F#6'], [2.5, 0.5, 'E6'], [3, 0.5, 'D6'], [3.5, 0.5, 'A6']]], { inst: 'celesta', vel: 0.4 });

  return events.slice().sort((a, b) => a.t - b.t);
}
