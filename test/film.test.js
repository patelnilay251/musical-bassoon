import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, FRAMES, FPS, BAR, DURATION, frame, nightCar, morningCar, TITLE, WISH } from '../film/score.js';
import { arrangement, chordAt } from '../film/music.js';
import { logoTimes } from '../film/sfx.js';
import { clockText, W, H } from '../film/screen.js';
import { renderFrame } from '../film/frame.js';
import { PLACES, buildPlace } from '../src/scenes/index.js';
import { quantize, enlarge } from '../src/retro.js';
import { drawText } from '../src/pixelfont.js';
import { Mix, RATE, ep, bass, lead, bell, kick, snare } from '../src/audio/synth.js';
import { encodeWAV } from '../src/audio/wav.js';

test('the film is sections of whole bars, back to back', () => {
  let t = 0;
  for (const s of SECTIONS) {
    assert.equal(s.t0, t, s.id);
    assert.ok(Math.abs((s.t1 - s.t0) / BAR - Math.round((s.t1 - s.t0) / BAR)) < 1e-9, `${s.id}: not whole bars`);
    t = s.t1;
  }
  assert.equal(DURATION, t);
  assert.equal(FRAMES, Math.round(DURATION * FPS));
});

test('every frame names a real place, a clock inside its section, and a camera', () => {
  for (const s of SECTIONS) {
    const i0 = Math.ceil(s.t0 * FPS);
    const i1 = Math.ceil(s.t1 * FPS) - 1;
    const [h0, h1] = [s.hours(0), s.hours(1)];
    for (const i of [i0, Math.round((i0 + i1) / 2), i1]) {
      const f = frame(i);
      assert.equal(f.section, s.id);
      if (!f.scene) continue;
      assert.ok(PLACES[f.scene.place], s.id);
      assert.ok(f.scene.hours >= h0 - 1e-9 && f.scene.hours <= h1 + 1e-9, `${s.id}: ${f.scene.hours}`);
      assert.ok([...f.scene.camera.eye, ...f.scene.camera.target].every(Number.isFinite), s.id);
    }
  }
});

test('quiet scenes are animated on twos; the drives run at full rate', () => {
  for (const s of SECTIONS) {
    const i = Math.ceil(s.t0 * FPS) + 40;
    const a = frame(i).scene.motion.t;
    const b = frame(i + 1).scene.motion.t;
    if (s.fast) assert.notEqual(a, b, s.id);
    else assert.ok(Math.abs(a - b) < 1e-9 || Math.abs(frame(i + 2).scene.motion.t - b) < 1e-9, s.id);
  }
});

test('the yellow car ends its day in the stall it was parked in at dawn', () => {
  const motel = buildPlace('motel', { car: true });
  const stall = motel.layout.cars.find((c) => c.visitor);
  const home = nightCar(99);
  assert.ok(Math.abs(home.x + 5.2) < 0.3 && Math.abs(home.z - stall.z) < 0.4, `parked at ${home.x}, ${home.z}`);
  assert.ok(Math.abs(home.yaw) < 0.05, 'nose in');
  // ... and breakfast is outside the diner, in the curb lane.
  const diner = morningCar(9.6);
  assert.ok(diner.z < -10 && diner.x > 0 && diner.x < 13, `parked at ${diner.x}, ${diner.z}`);
});

test('a frame of the film comes out at the board resolution in the board palette', () => {
  const s = SECTIONS.find((x) => x.id === 'house');
  const img = renderFrame(frame(Math.round((s.t0 + 5) * FPS)), { ss: 1, shadowSize: 512 });
  assert.equal(img.length, W * H * 4);
  // Away from the screen layer, every channel is one of 8 levels.
  const levels = new Set();
  for (let y = 40; y < H - 40; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) levels.add(img[(y * W + x) * 4 + c]);
  assert.ok(levels.size <= 8, `${levels.size} levels`);
});

test('the retro look: three bits a channel, and hard pixels with a scanline', () => {
  const px = new Uint8ClampedArray([10, 128, 250, 255, 200, 60, 90, 255]);
  quantize(px, 2, 1, { bits: 3, dither: 0 });
  for (const v of [px[0], px[1], px[2], px[4], px[5], px[6]]) assert.equal(Math.round(Math.round((v / 255) * 7) * (255 / 7)), v);
  const big = enlarge(new Uint8ClampedArray([200, 200, 200, 255]), 1, 1, 4, undefined, { scan: 0.25, vignette: 0 });
  assert.equal(big.length, 4 * 4 * 3);
  assert.equal(big[0], Math.floor(200 * (1 - 0.25 * 0.25)));
  assert.equal(big[4 * 3 * 1], 200); // rows inside the pixel are left alone
  assert.equal(big[4 * 3 * 3], 150); // and its last row is the scanline
});

test('the board font has every letter the film writes', () => {
  const texts = ['PALOMA BAY', 'ONE SUMMER DAY', 'PRESS START', 'CREDIT 0', '(C) 1986 VACANT SUNLIGHT', 'INSERT COIN', 'THANK YOU FOR VISITING', WISH.text, 'SPEED', 'MPH', clockText(20.8), ...Object.values(PLACES).map((p) => p.NAME.toUpperCase())];
  for (const text of texts) {
    for (const ch of text) {
      const a = new Uint8ClampedArray(8 * 8 * 4);
      const b = new Uint8ClampedArray(8 * 8 * 4);
      drawText(a, 8, 8, ch, 0, 0, { shadow: null });
      drawText(b, 8, 8, '?', 0, 0, { shadow: null });
      if (ch !== '?' && ch !== ' ') assert.notDeepEqual(a, b, `no glyph for ${JSON.stringify(ch)}`);
    }
  }
  assert.equal(clockText(20.8), '8:48 PM');
  assert.equal(clockText(0.5), '12:30 AM');
  assert.equal(clockText(12), '12:00 PM');
});

test('the tune stays in its keys, and every note is inside the film', () => {
  const D = new Set([2, 4, 6, 7, 9, 11, 1]);
  const E = new Set([4, 6, 8, 9, 11, 1, 3]);
  const events = arrangement({ logoTimes: logoTimes() });
  assert.ok(events.length > 500);
  for (let k = 1; k < events.length; k++) assert.ok(events[k].t >= events[k - 1].t);
  for (const e of events) {
    assert.ok(e.t >= 0 && e.t < DURATION, `${e.inst} at ${e.t}`);
    const bar = Math.floor(e.t / BAR + 1e-6);
    const beat = (e.t - bar * BAR) / (BAR / 4);
    if (bar === 3) continue; // the start jingle borrows flat six and flat seven
    // The sparkle plays the chord in force, color tones and all...
    if (e.inst === 'arp' && bar > 0) assert.ok(chordAt(bar, beat).v.some((m) => m % 12 === e.midi % 12), `arp ${e.midi} in bar ${bar}`);
    // ...and the tunes keep to the key.
    if (!['lead', 'celesta', 'epLead', 'bell'].includes(e.inst)) continue;
    const key = bar >= 24 && bar < 28 ? E : D;
    assert.ok(key.has(e.midi % 12), `${e.inst} ${e.midi} in bar ${bar}`);
  }
  assert.ok(chordAt(24).v.every((m) => E.has(m % 12)), 'the last chorus is in E');
  // The logo's letters land, one after another, before the shine.
  const times = logoTimes();
  assert.equal(times.length, 9);
  assert.ok(times[0] > TITLE.logo && times.every((t, k) => k === 0 || t > times[k - 1]));
});

test('the synthesizer is finite, quiet before it starts and silent after it ends', () => {
  for (const buf of [ep(440, 0.3, 0.8), bass(55, 0.3, 0.8), lead(660, 0.4, 0.8), bell(880, 0.1, 0.5), kick(1), snare(1)]) {
    assert.ok(buf.every(Number.isFinite));
    const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    assert.ok(peak > 0.05 && peak < 3, `peak ${peak}`);
    const tail = buf.subarray(buf.length - 64).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    assert.ok(tail < 0.05 * peak, 'rings past the end of its buffer');
  }
  const mix = new Mix(1);
  mix.add(ep(440, 0.3, 1), 0.1, { gain: 3, reverb: 0.5, delay: 0.3 });
  const [L, R] = mix.render();
  assert.ok(L.every((v) => Math.abs(v) <= 0.9) && R.every((v) => Math.abs(v) <= 0.9), 'the limiter lets something through');
  assert.equal(L.subarray(0, Math.round(0.1 * RATE) - 1).reduce((m, v) => Math.max(m, Math.abs(v)), 0), 0);
  const wav = encodeWAV([L, R], RATE);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), RATE);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.length, 44 + L.length * 4);
});
