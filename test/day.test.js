import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, FRAMES, FPS, BAR, DURATION, frame, shot, place, DINER_KEY, HOME_KEY, HOME_PARK, homeCar, dinerCar } from '../film/day/score.js';
import { arrangement } from '../film/day/music.js';
import { SONG_AT, radio } from '../film/day/radio.js';
import { arrangement as song } from '../film/attract/music.js';
import { PAGES } from '../book/story.js';
import { buildPlace } from '../src/scenes/index.js';
import { whereIs, propsAt } from '../src/visitor.js';
import { strokes } from '../src/world/font.js';
import { RATE, fretless, brush } from '../src/audio/synth.js';
import * as FX from '../src/audio/fx.js';

test('One Day is shots of whole bars, back to back, and captions are gone before the cut', () => {
  let t = 0;
  for (const s of SHOTS) {
    assert.equal(s.t0, t, s.id);
    assert.ok(Math.abs(s.len / BAR - Math.round(s.len / BAR)) < 1e-9, `${s.id}: not whole bars`);
    if (s.caption) assert.ok(s.sc + 4.2 <= s.len, `${s.id}: the caption is still up at the cut`);
    t = s.t1;
  }
  assert.equal(DURATION, t);
  assert.equal(FRAMES, Math.round(DURATION * FPS));
});

test('at each postcard minute the frame is the book page: place, view, hour and things left out', () => {
  for (const page of PAGES) {
    const sh = SHOTS.find((s) => s.place === page.place && s.card !== undefined && Math.abs(s.card - page.hours) < 1e-9);
    assert.ok(sh, `no shot passes through ${page.place} at ${page.hours}`);
    const f = frame(Math.round((sh.t0 + sh.sc) * FPS));
    assert.equal(f.shot, sh.id);
    assert.equal(f.scene.place, page.place);
    assert.ok(Math.abs(f.scene.hours - page.hours) < 1 / 60, `${sh.id}: ${f.scene.hours} for ${page.hours}`);
    const view = place(page.place).views[page.view];
    for (const k of ['eye', 'target']) f.scene.camera[k].forEach((v, i) => assert.ok(Math.abs(v - view[k][i]) < 0.05, `${sh.id}: camera ${k}`));
    assert.equal(f.scene.camera.fovY, view.fovY, sh.id);
    for (const [k, v] of Object.entries(page.props)) {
      if (typeof v === 'number') assert.ok(Math.abs(f.scene.props[k] - v) < 0.002, `${sh.id}: ${k}`);
      else assert.deepEqual(f.scene.props[k], v, `${sh.id}: ${k}`);
    }
  }
});

test('the visitor keeps one schedule: breakfast from a quarter past eight, home before nine', () => {
  assert.equal(whereIs(8.1), 'motel');
  assert.equal(whereIs(8.3), 'boulevard');
  assert.equal(whereIs(20.9), 'motel');
  // The drive ends in the stills' parking space outside the diner...
  const parked = buildPlace('boulevard').layout.cars.find((c) => c.visitor);
  const d = dinerCar(99);
  assert.ok(Math.abs(d.x - parked.x) < 0.3 && Math.abs(d.z - parked.s * 10.9) < 0.3, `diner: ${d.x}, ${d.z}`);
  // ...and the evening's in the motel stall it left from.
  const stall = buildPlace('motel').layout.cars.find((c) => c.visitor);
  const h = homeCar(HOME_PARK);
  assert.ok(Math.abs(h.x + 5.2) < 0.3 && Math.abs(h.z - stall.z) < 0.4, `home: ${h.x}, ${h.z}`);
  // Their window is lit when they are in, and only then.
  assert.equal(propsAt('motel', 22).roomLight, 1);
  assert.equal(propsAt('motel', 4.85).roomLight, 0);
  const motel = buildPlace('motel', { roomLight: 1 });
  assert.equal(motel.emitScale.visitorGlass, 1);
});

test('every caption and title is lettered in the sign alphabet', () => {
  const texts = new Set();
  for (let i = 0; i < FRAMES; i += 12) for (const t of frame(i).text) texts.add(t.text);
  assert.ok(texts.size >= 12, `${texts.size} texts`);
  for (const text of texts) for (const ch of text) assert.ok(strokes(ch), `no strokes for ${JSON.stringify(ch)} in ${text}`);
});

test('the radio stops mid-song, and the score finishes the phrase it broke off', () => {
  const lead = song({ logoTimes: [] }).filter((e) => e.inst === 'lead');
  // In the evening the key turns inside the hook's last bar, after its E
  // and before its F#, D, B...
  const cut = SONG_AT + HOME_KEY;
  const heard = lead.filter((e) => e.t < cut).pop();
  const rest = lead.filter((e) => e.t >= cut).slice(0, 3).map((e) => e.midi % 12);
  assert.equal(heard.midi % 12, 4, 'the last note heard is an E');
  assert.deepEqual(rest, [6, 2, 11]);
  // ...which the night's first notes are.
  const night = shot('night');
  const first = arrangement().filter((e) => e.inst === 'epLead' && e.t >= night.t0).slice(0, 3).map((e) => e.midi % 12);
  assert.deepEqual(first, rest);
  // At breakfast it stops inside the chorus, on a held note.
  const morning = lead.find((e) => e.t < SONG_AT + DINER_KEY && e.t + e.dur > SONG_AT + DINER_KEY);
  assert.ok(morning, 'the morning cut falls on a note');
  // The radio itself: mono, finite, and it has the song in it.
  const r = radio(SONG_AT, SONG_AT + 1);
  assert.equal(r.length, RATE);
  const peak = r.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(r.every(Number.isFinite) && peak > 0.05 && peak <= 0.6, `peak ${peak}`);
});

test('the ballad keeps to its keys, lifting to E where the sun touches the sea', () => {
  const D = new Set([2, 4, 6, 7, 9, 11, 1]);
  const E = new Set([4, 6, 8, 9, 11, 1, 3]);
  const events = arrangement();
  const lift = shot('sunset').t0 + 2 * BAR;
  for (let k = 1; k < events.length; k++) assert.ok(events[k].t >= events[k - 1].t);
  for (const e of events) {
    assert.ok(e.t >= 0 && e.t < DURATION, `${e.inst} at ${e.t}`);
    if (!['horn', 'epLead', 'celesta', 'bell'].includes(e.inst)) continue;
    const key = e.t >= lift - 1e-6 && e.t < shot('home').t0 ? E : D;
    assert.ok(key.has(e.midi % 12), `${e.inst} ${e.midi} at ${e.t.toFixed(2)}`);
  }
  // No score where the plan wants none: before the pool, the pier, home.
  for (const id of ['predawn', 'sunrise', 'diner', 'house', 'pier', 'home']) {
    const s = shot(id);
    assert.ok(!events.some((e) => e.t >= s.t0 + 1e-6 && e.t < s.t1 - 1e-6), `music in the ${id} shot`);
  }
});

test('the new sounds are finite, heard, and die away', () => {
  const bufs = {
    fretless: fretless(55, 0.5, 0.8, { from: 49 }),
    brush: brush(1),
    sweep: brush(1, { sweep: 0.8 }),
    dove: FX.dove(1),
    mockingbird: FX.mockingbird(3, 2),
    ice: FX.iceMachine(3),
    filter: FX.poolFilter(2, 4),
    pilings: FX.pilings(2, 5),
    rocks: FX.rocks(3, 6, [[0.2, 1]]),
    creak: FX.creak(7),
    buoy: FX.bellBuoy(4, 8),
    foghorn: FX.foghorn(1.5),
    flag: FX.flag(2, 9),
    wing: FX.wingbeat(10),
    rustle: FX.rustle(2, 11),
    clink: FX.clink(12),
    thud: FX.thud(13),
    truck: FX.farTruck(2, 14),
  };
  for (const [name, buf] of Object.entries(bufs)) {
    assert.ok(buf.every(Number.isFinite), `${name}: not finite`);
    const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    assert.ok(peak > 0.005 && peak < 4, `${name}: peak ${peak}`);
  }
  for (const name of ['fretless', 'brush', 'dove', 'creak', 'clink', 'thud', 'foghorn']) {
    const b = bufs[name];
    const peak = b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const tail = b.subarray(b.length - 64).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    assert.ok(tail < 0.1 * peak, `${name} rings past the end of its buffer`);
  }
});
