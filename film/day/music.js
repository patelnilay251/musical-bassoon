// The score: the attract mode's song remembered as a slow ballad, 76 beats
// a minute in D, lifting to E when the sun touches the sea. Electric piano,
// soft pads, a fretless bass, brushes, and the tune on a soft FM horn; no
// drum machine. Bar by bar (a shot's first bar in brackets):
//
//   predawn [0], sunrise [5]   no score: the town waking up
//   diner [8]                  the song, on the car radio (radio.js)
//   house [13]                 quiet
//   pool [16]                  the electric piano takes up the radio's tune
//   beach [20], shore [24]     the band, lightly: the verse, twice
//   pier [28]                  a breath: nothing
//   marina [31]                the bridge, climbing
//   sunset [35]                the chorus, a whole step up as the sun touches
//   lighthouse [41]            one held chord, a bell on each flash
//   home [45]                  the radio again
//   night [50], titles [55]    the score finishes the song; the music box
//
// Only notes here: events for sound.js to play.

import { BAR, shot, beacon } from './score.js';
import { CH, N, HOOK, VERSE, VERSE2, BRIDGE } from '../attract/music.js';

const B = BAR / 4; // one beat
const at = (bar, beat = 0) => bar * BAR + beat * B;
export const barOf = (id) => Math.round(shot(id).t0 / BAR);

// The chords, bar by bar: [at beat 0, at beat 2 (optional)].
const CHART = {};
const chart = (bar, rows) => rows.forEach((r, i) => (CHART[bar + i] = r));
const chordAt = (bar, beat = 0) => CH[CHART[bar][beat >= 2 && CHART[bar][1] ? 1 : 0]];

const events = [];
const push = (e) => events.push(e);

// A tune, bar after bar, on an instrument.
function tune(bar, phrase, { shift = 0, vel = 0.7, inst = 'horn', double = 0 } = {}) {
  phrase.forEach((notes, i) => {
    for (const [beat, dur, n] of notes) {
      const e = { inst, t: at(bar + i, beat), dur: dur * B, midi: N[n] + shift, vel };
      push(e);
      if (double) push({ ...e, midi: e.midi - 12, vel: vel * double });
    }
  });
}

// Keys: the chord held, rolled a little, on the given beats.
function held(bar, { beats = [0], len = 4, vel = 0.45, roll = 0.04, pad = 0 } = {}) {
  for (const beat of beats) {
    const c = chordAt(bar, beat).v;
    push({ inst: 'ep', t: at(bar, beat), dur: len * B, chord: c, vel, roll });
    if (pad) push({ inst: 'pad', t: at(bar, beat), dur: len * B, chord: c.map((m) => m + 12), vel: pad });
  }
}

// A ballad comp: long chords with a push before the third beat.
const COMP = [
  [0, 1.4, 0.55],
  [1.5, 0.9, 0.35],
  [2.5, 1.4, 0.45],
];
function comp(bar, vel = 1) {
  for (const [beat, len, v] of COMP) push({ inst: 'ep', t: at(bar, beat), dur: len * B, chord: chordAt(bar, beat).v, vel: v * vel, roll: 0.02 });
}

// Fretless: the root, the fifth or the next chord's root, sliding.
function bassLine(bar, vel = 0.7) {
  const r = chordAt(bar, 0).root;
  const r2 = chordAt(bar, 2).root;
  const next = CHART[bar + 1] ? chordAt(bar + 1, 0).root : r;
  const lead = next > r2 ? next - 2 : next + 2;
  for (const [beat, len, m, v] of [
    [0, 1.9, r, 1],
    [2, 1.2, r2 === r ? r + 7 : r2, 0.8],
    [3.25, 0.7, lead, 0.7],
  ]) push({ inst: 'fretless', t: at(bar, beat), dur: len * B, midi: m, vel: v * vel });
}
function bassHeld(bar, beats = 4, vel = 0.65) {
  push({ inst: 'fretless', t: at(bar), dur: (beats - 0.2) * B, midi: chordAt(bar).root, vel });
}

// Brushes: a sweep through every two beats, taps on two and four, and a
// felt kick on the one when the band is all in.
function brushes(bar, { taps = true, kick = false, vel = 1 } = {}) {
  for (const beat of [0, 2]) push({ inst: 'sweep', t: at(bar, beat), dur: 1.9 * B, vel: 0.6 * vel });
  if (taps) for (const [beat, v] of [[1, 0.7], [3, 0.8], [3.5, 0.3]]) push({ inst: 'tap', t: at(bar, beat), vel: v * vel });
  if (kick) for (const [beat, v] of [[0, 0.8], [2.5, 0.45]]) push({ inst: 'kick', t: at(bar, beat), vel: v * vel });
}

export function arrangement() {
  events.length = 0;

  // ---- the pool: the radio's tune, remembered on the electric piano
  const pool = barOf('pool');
  chart(pool, [['Gmaj9'], ['A13'], ['Fsm9'], ['Bm9']]);
  for (let bar = pool; bar < pool + 4; bar++) held(bar, { beats: [0, 2], len: 2, vel: 0.32, roll: 0.05, pad: bar > pool ? 0.18 : 0.1 });
  tune(pool, HOOK, { inst: 'epLead', vel: 0.5 });

  // ---- the beach and the shore: the band, lightly
  const beach = barOf('beach');
  chart(beach, [['Gmaj9'], ['Fsm9'], ['Em9'], ['A9sus', 'A13'], ['Gmaj9'], ['Fsm9'], ['Bm9'], ['Em9', 'A13']]);
  for (let bar = beach; bar < beach + 8; bar++) {
    comp(bar, 0.9);
    bassLine(bar, bar < beach + 1 ? 0.55 : 0.7);
    if (bar >= beach + 1) brushes(bar, { taps: bar >= beach + 2, vel: 0.8 });
    if (bar >= beach + 4) push({ inst: 'pad', t: at(bar), dur: 4 * B, chord: chordAt(bar).v.map((m) => m + 12), vel: 0.12 });
  }
  tune(beach, VERSE, { vel: 0.6 });
  tune(beach + 4, VERSE2, { vel: 0.65 });
  // The last chord rings on over the cut to the pier, which has no music.
  push({ inst: 'pad', t: at(beach + 7, 2), dur: 2.5 * B, chord: CH.A13.v.map((m) => m + 12), vel: 0.14 });

  // ---- the marina: the bridge, climbing
  const marina = barOf('marina');
  chart(marina, [['Em9'], ['Fsm9'], ['Gmaj9'], ['A9sus', 'A13']]);
  for (let bar = marina; bar < marina + 4; bar++) {
    held(bar, { beats: [0, 2], len: 2, vel: 0.4, roll: 0.03, pad: 0.18 });
    bassLine(bar, 0.6);
    brushes(bar, { taps: false, vel: 0.7 });
  }
  tune(marina, BRIDGE, { vel: 0.6 });

  // ---- sunset: two bars climbing, then the chorus a whole step up from
  // the moment the sun touches the sea
  const sunset = barOf('sunset');
  chart(sunset, [['Gmaj9'], ['A9sus', 'B9sus'], ['Amaj9'], ['B13'], ['Gsm9'], ['Csm9']]);
  for (let bar = sunset; bar < sunset + 6; bar++) {
    const lifted = bar >= sunset + 2;
    comp(bar, lifted ? 1.05 : 0.9);
    bassLine(bar, lifted ? 0.85 : 0.7);
    brushes(bar, { kick: lifted, vel: lifted ? 1 : 0.85 });
    push({ inst: 'pad', t: at(bar), dur: 4 * B, chord: chordAt(bar).v.map((m) => m + 12), vel: lifted ? 0.24 : 0.16 });
  }
  tune(sunset, [
    [[0, 2, 'B4'], [2, 2, 'D5']],
    [[0, 1.5, 'E5'], [1.5, 0.5, 'F#5'], [2, 2, 'A5']],
  ], { vel: 0.62 });
  tune(sunset + 2, HOOK, { shift: 2, vel: 0.78, double: 0.45 });
  push({ inst: 'swell', t: at(sunset + 1, 1), dur: 3 * B, vel: 0.5 });
  push({ inst: 'bell', t: at(sunset + 2), dur: 1, midi: N.E6, vel: 0.45 });

  // ---- the lighthouse: one chord, held, and a bell on each flash
  const light = barOf('lighthouse');
  chart(light, [['Amaj9'], ['Amaj9'], ['Amaj9'], ['Amaj9']]);
  push({ inst: 'ep', t: at(light), dur: 15 * B, chord: CH.Amaj9.v, vel: 0.36, roll: 0.07 });
  push({ inst: 'pad', t: at(light), dur: 14 * B, chord: CH.Amaj9.v.map((m) => m + 12), vel: 0.2 });
  bassHeld(light, 14, 0.5);
  const lh = shot('lighthouse');
  for (let s = 0; s < lh.len - 1; s += 1 / 48) {
    // the flash peaks where the beacon's power does
    if (beacon(0, s) > 2 && beacon(0, s - 1 / 48) <= beacon(0, s) && beacon(0, s + 1 / 48) < beacon(0, s)) {
      push({ inst: 'bell', t: lh.t0 + s, dur: 1, midi: N.E6, vel: 0.4 });
      push({ inst: 'bell', t: lh.t0 + s + 0.02, dur: 1, midi: N.B5, vel: 0.22 });
    }
  }

  // ---- night: the score finishes the song the radio broke off
  const night = barOf('night');
  chart(night, [['Bm9'], ['Gmaj9'], ['A13'], ['Dmaj9'], ['Dmaj9']]);
  held(night, { vel: 0.34, roll: 0.06, pad: 0.12 });
  held(night + 1, { vel: 0.36, roll: 0.06, pad: 0.14 });
  held(night + 2, { vel: 0.36, roll: 0.06, pad: 0.14 });
  held(night + 3, { vel: 0.42, roll: 0.09, len: 8, pad: 0.18 });
  for (let bar = night; bar < night + 3; bar++) bassHeld(bar, 4, 0.55);
  push({ inst: 'fretless', t: at(night + 3), dur: 7 * B, midi: CH.Dmaj9.root, vel: 0.55 });
  tune(night, [
    [[0, 1, 'F#5'], [1, 1, 'D5'], [2, 2, 'B4']],
    [[0, 0.5, 'B4'], [0.5, 0.5, 'D5'], [1, 1.5, 'F#5'], [2.5, 0.5, 'E5'], [3, 1, 'D5']],
    [[2, 1, 'E5'], [3, 1, 'C#5']],
    [[0, 4, 'D5']],
  ], { inst: 'epLead', vel: 0.48 });
  push({ inst: 'bell', t: at(night + 3), dur: 2, midi: N.D6, vel: 0.3 });

  // ---- titles: the tune once more on a music box, stopping short
  const titles = barOf('titles');
  tune(titles + 1, [[[0.5, 0.5, 'D6'], [1, 0.5, 'E6'], [1.5, 1, 'F#6'], [2.5, 0.5, 'E6'], [3, 0.5, 'D6'], [3.5, 0.5, 'A6']]], { inst: 'celesta', vel: 0.36 });

  return events.slice().sort((a, b) => a.t - b.t);
}
