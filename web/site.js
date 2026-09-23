// Paloma Bay, one picture at a time. Drag across the painting to pass the
// day; the arrow keys (or the edges of the frame) walk to another place or
// another view of it; space lets the day go by on its own. The town can be
// painted in either of its looks (src/looks.js): the switch in the corner,
// or L, changes it, and the page remembers.
//
// Every frame is painted by the engine in Web Workers: first a quick
// sketch, then, once things settle, the finished picture tile by tile from
// the middle out. The visitor's yellow car keeps its own schedule
// (src/visitor.js): the page opens wherever it is at this hour.

import { PLACES, ORDER } from '../src/scenes/index.js';
import { propsAt, whereIs, clock } from '../src/visitor.js';
import { sunDirection } from '../src/sky.js';
import { bloom, toRGBA } from '../src/render.js';
import { LOOKS, LOOK_NAMES, DEFAULT_LOOK, lookOf } from '../src/looks.js';
import { createService } from './service.js';

const MIN_H = 4.5;
const MAX_H = 23.75;
const TILE = 64;
const DRAG_HOURS = 10; // a drag across the whole picture

const $ = (id) => document.getElementById(id);
const canvas = $('paint');
const ctx = canvas.getContext('2d');
const fade = $('fade');
const fctx = fade.getContext('2d');
const sketch = document.createElement('canvas');
const sctx = sketch.getContext('2d');

const state = { place: 0, view: 0, hours: 12, playing: false, look: DEFAULT_LOOK };

// ---------------------------------------------------------------- painters

const pool = makePool();

function makePool() {
  const cores = navigator.hardwareConcurrency || 4;
  const n = Math.max(1, Math.min((navigator.deviceMemory || 8) < 4 ? 2 : 4, cores - 1));
  // WORKER_SOURCE is the bundled worker, inlined by scripts/build.js.
  if (typeof WORKER_SOURCE === 'string' && typeof Worker !== 'undefined') {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      return Array.from({ length: n }, () => {
        const w = new Worker(url);
        w.onmessage = (e) => receive(e.data);
        w.onerror = (e) => console.error('painter:', e.message);
        return (m) => w.postMessage(m);
      });
    } catch (err) {
      console.warn('no workers, painting on the page', err);
    }
  }
  return [createService((m) => receive(m))];
}

function sizes() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = Math.round(innerWidth * dpr);
  let H = Math.round(innerHeight * dpr);
  const cap = 2.4e6;
  if (W * H > cap) {
    const k = Math.sqrt(cap / (W * H));
    W = Math.round(W * k);
    H = Math.round(H * k);
  }
  return { W, H, dpr };
}

function settings(q) {
  const { W, H, dpr } = sizes();
  if (q === 'sketch') {
    const k = Math.min(1, Math.sqrt(2.3e5 / (W * H)));
    return { q, W: Math.max(64, Math.round(W * k)), H: Math.max(40, Math.round(H * k)), ss: 1, shadowSize: 1536, reflScale: 0.5 };
  }
  return { q, W, H, ss: dpr >= 1.5 ? 1 : 2, shadowSize: 2048, reflScale: 0.6 };
}

// Tiles from the middle out: the eye goes there first.
function tiles(W, H) {
  const list = [];
  for (let y = 0; y < H; y += TILE) for (let x = 0; x < W; x += TILE) list.push([x, y, Math.min(W, x + TILE), Math.min(H, y + TILE)]);
  const d = (t) => Math.hypot((t[0] + t[2]) / 2 - W / 2, ((t[1] + t[3]) / 2 - H / 2) * 1.4);
  return list.sort((a, b) => d(a) - d(b));
}

let jobs = 0;
let job = null; // the frame being painted
let dirty = false; // something changed while a sketch was out
let idle = 0;
let holding = false; // a finger or the mouse is down
let revealing = false;

function current() {
  const place = ORDER[state.place];
  const views = PLACES[place].VIEWS;
  return { place, view: views[state.view % views.length] };
}

// Whatever should be on screen has changed.
function invalidate() {
  caption();
  if (job && job.q === 'sketch') dirty = true;
  else paint('sketch');
}

function paint(q) {
  clearTimeout(idle);
  const s = settings(q);
  const { place, view } = current();
  job = { id: ++jobs, ...s, look: state.look, left: pool.length, buf: new Float32Array(s.W * s.H * 3), rgba: null, image: null, t0: performance.now() };
  if (q === 'full') {
    job.rgba = new Uint8ClampedArray(s.W * s.H * 4);
    job.image = new ImageData(job.rgba, s.W, s.H);
  }
  const msg = { type: 'frame', job: job.id, place, view, look: state.look, props: propsAt(place, state.hours), hours: state.hours, W: s.W, H: s.H, ss: s.ss, shadowSize: s.shadowSize, reflScale: s.reflScale };
  const list = tiles(s.W, s.H);
  pool.forEach((post, i) => post({ ...msg, tiles: list.filter((_, k) => k % pool.length === i) }));
}

function receive(m) {
  const j = job;
  if (!j || m.job !== j.id) return;
  if (m.type === 'tile') {
    const [x0, y0, x1, y1] = m.rect;
    const w = x1 - x0;
    for (let y = y0; y < y1; y++) j.buf.set(m.data.subarray((y - y0) * w * 3, (y - y0 + 1) * w * 3), (y * j.W + x0) * 3);
    if (j.image && canvas.width === j.W && canvas.height === j.H) {
      // The finished picture comes in over the sketch.
      toRGBA(j.buf, j.W, j.H, j.rgba, x0, y0, x1, y1, lookOf(j.look).grain);
      ctx.putImageData(j.image, 0, 0, x0, y0, w, y1 - y0);
    }
  } else if (m.type === 'done' && --j.left === 0) finish(j);
}

// Is the bottom of the picture, where the caption sits, light or dark?
function inkFor(j) {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(j.H * 0.8); y < j.H; y += 2) {
    for (let x = 0; x < j.W; x += 3) {
      const o = (y * j.W + x) * 3;
      sum += 0.3 * Math.min(1, j.buf[o]) + 0.55 * Math.min(1, j.buf[o + 1]) + 0.15 * Math.min(1, j.buf[o + 2]);
      n++;
    }
  }
  document.body.classList.toggle('bright', sum / n > 0.62);
}

function finish(j) {
  job = null;
  bloom(j.buf, j.W, j.H);
  inkFor(j);
  // For anyone watching (and the tests): what was last painted, how fast.
  document.body.dataset.painted = j.q;
  document.body.dataset.ms = String(Math.round(performance.now() - j.t0));
  if (j.image) {
    if (canvas.width === j.W && canvas.height === j.H) {
      toRGBA(j.buf, j.W, j.H, j.rgba, 0, 0, j.W, j.H, lookOf(j.look).grain);
      ctx.putImageData(j.image, 0, 0);
    }
  } else {
    sketch.width = j.W;
    sketch.height = j.H;
    sctx.putImageData(new ImageData(toRGBA(j.buf, j.W, j.H, undefined, 0, 0, j.W, j.H, lookOf(j.look).grain), j.W, j.H), 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sketch, 0, 0, canvas.width, canvas.height);
  }
  if (revealing) {
    revealing = false;
    const quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      fade.style.transition = `opacity ${quick ? 0.2 : 0.9}s ease`;
      fade.style.opacity = '0';
    });
  }
  if (dirty) {
    dirty = false;
    paint('sketch');
  } else if (!j.image) settle();
}

// Once nothing moves, paint the real thing.
function settle() {
  clearTimeout(idle);
  if (holding || state.playing) return;
  idle = setTimeout(() => paint('full'), 160);
}

// Hold what is on screen and fade it out once the next picture is up.
function crossfade() {
  fade.width = canvas.width;
  fade.height = canvas.height;
  fctx.drawImage(canvas, 0, 0);
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  revealing = true;
}

function resize() {
  const { W, H } = sizes();
  if (canvas.width === W && canvas.height === H) return;
  canvas.width = W;
  canvas.height = H;
  if (sketch.width) ctx.drawImage(sketch, 0, 0, W, H);
  invalidate();
}

// ---------------------------------------------------------------- state

function setHours(h) {
  state.hours = Math.min(MAX_H, Math.max(MIN_H, h));
  invalidate();
}

function stepPlace(d) {
  state.place = (state.place + d + ORDER.length) % ORDER.length;
  state.view = 0;
  crossfade();
  invalidate();
}

function stepView(d) {
  const n = PLACES[ORDER[state.place]].VIEWS.length;
  state.view = (state.view + d + n) % n;
  crossfade();
  invalidate();
}

// The same place at the same moment, in the other look.
function setLook(name) {
  if (!LOOK_NAMES.includes(name) || name === state.look) return;
  state.look = name;
  try {
    localStorage.setItem('paloma-look', name);
  } catch {
    // private windows and file:// pages may say no; the address still has it
  }
  showLook();
  crossfade();
  invalidate();
}

function showLook() {
  for (const b of $('looks').children) b.setAttribute('aria-pressed', String(b.dataset.look === state.look));
  $('postcards').href = `book.html?look=${state.look}`;
}

function savedLook() {
  try {
    const l = localStorage.getItem('paloma-look');
    return LOOK_NAMES.includes(l) ? l : null;
  } catch {
    return null;
  }
}

let last = 0;
function play() {
  state.playing = true;
  last = performance.now();
  requestAnimationFrame(function tick(t) {
    if (!state.playing) return;
    const h = state.hours + (t - last) / 1000 / 5; // an hour every five seconds
    last = t;
    setHours(h > MAX_H ? MIN_H : h);
    requestAnimationFrame(tick);
  });
}

function pause() {
  if (!state.playing) return;
  state.playing = false;
  settle();
}

let hashTimer = 0;
function caption() {
  const { place, view } = current();
  const name = PLACES[place].NAME;
  const t = clock(state.hours);
  $('place').textContent = name;
  $('clock').textContent = t;
  document.title = `${name}, ${t} · Paloma Bay`;
  const sun = $('sun');
  sun.style.left = `${((state.hours - MIN_H) / (MAX_H - MIN_H)) * 100}%`;
  const el = (Math.asin(sunDirection(state.hours)[1]) * 180) / Math.PI;
  sun.style.background = el > 4 ? '#fff4d8' : el > -6 ? '#ffa373' : '#aebdff';
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', address()), 250);
}

// The address says where, when and how: #place/view/hours/look.
const HASH = /^#([a-z]+)(?:\/([a-z]+))?(?:\/(\d+(?:\.\d+)?))?(?:\/([a-z]+))?/;

function address() {
  const { place, view } = current();
  return `#${place}/${view}/${state.hours.toFixed(2)}/${state.look}`;
}

function readHash() {
  const m = location.hash.match(HASH);
  if (!m || !ORDER.includes(m[1])) return null;
  const views = PLACES[m[1]].VIEWS;
  return { place: ORDER.indexOf(m[1]), view: Math.max(0, views.indexOf(m[2])), hours: m[3] ? Number(m[3]) : null, look: LOOK_NAMES.includes(m[4]) ? m[4] : null };
}

function start() {
  const m = location.hash.match(HASH);
  const now = new Date();
  let h = now.getHours() + now.getMinutes() / 60;
  if (h < MIN_H) h = MAX_H; // small hours: show the night
  if (m && m[3]) h = Number(m[3]);
  state.hours = Math.min(MAX_H, Math.max(MIN_H, h));
  // Open wherever the visitor is right now.
  const place = m && ORDER.includes(m[1]) ? m[1] : whereIs(state.hours);
  state.place = ORDER.indexOf(place);
  const vi = m && m[2] ? PLACES[place].VIEWS.indexOf(m[2]) : 0;
  state.view = Math.max(0, vi);
  // The look the address asks for (#.../look, or ?look= from the book), or
  // the one chosen here last time.
  const asked = [m && m[4], new URLSearchParams(location.search).get('look')].find((l) => LOOK_NAMES.includes(l));
  state.look = asked ?? savedLook() ?? DEFAULT_LOOK;
  showLook();
  revealing = true;
  resize();
  invalidate();
}

// ---------------------------------------------------------------- input

const hint = $('hint');
const hintTimer = setTimeout(() => hint.classList.add('gone'), 9000);
function noted() {
  clearTimeout(hintTimer);
  hint.classList.add('gone');
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, h: state.hours, t: performance.now() };
  holding = true;
  pause();
  noted();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  setHours(drag.h + ((e.clientX - drag.x) / innerWidth) * DRAG_HOURS);
});
const release = (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  // A quick vertical flick on a touch screen changes the view.
  if (e.pointerType !== 'mouse' && Math.abs(dy) > 60 && Math.abs(dy) > 2.2 * Math.abs(dx) && performance.now() - drag.t < 700) {
    state.hours = drag.h;
    stepView(dy < 0 ? 1 : -1);
  }
  drag = null;
  holding = false;
  if (!job) settle();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// The day line: point at an hour.
const day = $('day');
const onDay = (e) => {
  const r = day.getBoundingClientRect();
  setHours(MIN_H + ((e.clientX - r.left) / r.width) * (MAX_H - MIN_H));
};
day.addEventListener('pointerdown', (e) => {
  day.setPointerCapture(e.pointerId);
  holding = true;
  pause();
  noted();
  onDay(e);
});
day.addEventListener('pointermove', (e) => {
  if (holding && day.hasPointerCapture(e.pointerId)) onDay(e);
});
day.addEventListener('pointerup', () => {
  holding = false;
  if (!job) settle();
});

addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    noted();
    pause();
    setHours(state.hours + (e.deltaY + e.deltaX) * 0.0035);
  },
  { passive: false },
);

$('prev').addEventListener('click', () => (noted(), stepPlace(-1)));
$('next').addEventListener('click', () => (noted(), stepPlace(1)));
for (const name of LOOK_NAMES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.look = name;
  b.textContent = LOOKS[name].title;
  b.addEventListener('click', () => (noted(), setLook(name)));
  $('looks').append(b);
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowRight') stepPlace(1);
  else if (k === 'ArrowLeft') stepPlace(-1);
  else if (k === 'ArrowUp') stepView(1);
  else if (k === 'ArrowDown') stepView(-1);
  else if (k === ' ') state.playing ? pause() : play();
  else if (k === '.' || k === ']') setHours(state.hours + 0.25);
  else if (k === ',' || k === '[') setHours(state.hours - 0.25);
  else if (k === 'l' || k === 'L') setLook(LOOK_NAMES[(LOOK_NAMES.indexOf(state.look) + 1) % LOOK_NAMES.length]);
  else return;
  e.preventDefault();
  noted();
});

addEventListener('resize', () => {
  clearTimeout(resize.t);
  resize.t = setTimeout(resize, 120);
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
addEventListener('hashchange', () => {
  const h = readHash();
  if (!h || location.hash === address()) return;
  const moved = h.place !== state.place || h.view !== state.view || (h.look !== null && h.look !== state.look);
  state.place = h.place;
  state.view = h.view;
  if (h.hours !== null) state.hours = Math.min(MAX_H, Math.max(MIN_H, h.hours));
  if (h.look !== null) {
    state.look = h.look;
    showLook();
  }
  if (moved) crossfade();
  invalidate();
});

start();
