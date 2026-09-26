// Paloma Bay, live: walk the whole town, painted on the GPU as fast as you
// move by the same rules as the painted town (src/live/). The five places
// lie along one coast (src/live/town.js), the coast road and the shore
// between them (src/live/ground.js): walk from one to the next. Click to
// walk: W A S D or the arrows, the mouse to look, shift to run. [ and ] or
// the wheel change the hour, space lets the day pass, L turns to the other
// look, 1 to 5 (or the names at the top) take you to a place. The camera
// stays level the way the paintings do: looking up or down slides the
// frame, like the rising front of a view camera, so verticals stay
// vertical.

import { PLACES, ORDER } from '../src/scenes/index.js';
import { clock, whereIs } from '../src/visitor.js';
import { sunDirection } from '../src/sky.js';
import { LOOKS, LOOK_NAMES, DEFAULT_LOOK } from '../src/looks.js';
import { fit } from '../src/camera.js';
import { DEG } from '../src/math.js';
import { createLive } from '../src/live/renderer.js';
import { TownWalk, walk, standAt, WALKER } from '../src/live/walk.js';
import { Town, LAYOUT, placeAt } from '../src/live/town.js';
import { buildGround } from '../src/live/ground.js';

const MIN_H = 4.5;
const MAX_H = 23.75;
const FOV = 52; // vertical, at the 3:2 frame the views are composed for
const WALK_SPEED = 1.6;
const RUN_SPEED = 4.2;
const LOOK_SPEED = 0.0022; // radians per pixel of mouse travel
const SHIFT_SPEED = 0.003;
const MAX_SHIFT = 0.95;
const ROAD = 'The Coast Road'; // anywhere between the places

const $ = (id) => document.getElementById(id);
const canvas = $('live');
const state = {
  place: 'motel', // the place the walker is in, or was in last
  inside: true, // in it, or out on the road
  hours: 12,
  look: DEFAULT_LOOK,
  playing: false,
  yaw: 0, // radians clockwise from north
  shift: 0,
  pos: null,
  keys: new Set(),
  scale: 0.75, // of the device's pixels; adjusted to keep the frame rate up
};
// ?test: run everything but present frames (a headless browser may not be
// able to); tests read frames back with __live.snapshot().
const TEST = new URLSearchParams(location.search).has('test');
let live = null;
let town = null;
let grid = null;
let queue = []; // places still to be laid out, nearest first

// ---------------------------------------------------------------- setup

async function start() {
  const now = new Date();
  let h = now.getHours() + now.getMinutes() / 60;
  if (h < MIN_H) h = MAX_H;
  // The address says where, when and how: #place/hours/look.
  const m = location.hash.match(/^#(?:([a-z]+)\/)?(\d+(?:\.\d+)?)(?:\/([a-z]+))?/);
  if (m) h = Number(m[2]);
  state.hours = Math.min(MAX_H, Math.max(MIN_H, h));
  const asked = [m && m[3], new URLSearchParams(location.search).get('look'), saved()].find((l) => LOOK_NAMES.includes(l));
  state.look = asked ?? DEFAULT_LOOK;
  // Otherwise open wherever the visitor is right now, as the site does.
  state.place = m && PLACES[m[1]] ? m[1] : whereIs(state.hours);
  showLooks();
  showPlaces();
  caption();
  try {
    live = await createLive(canvas);
  } catch (err) {
    console.warn(err);
    document.body.classList.add('nogpu');
    return;
  }
  await layOut();
  enter(state.place);
  requestAnimationFrame(frame);
}

// The town in this look: its ground and the place the walker starts in
// first, the rest a place at a time as the frames go by (grow).
async function layOut() {
  busy(`laying out ${PLACES[state.place].NAME.replace(/^The /, 'the ')}`);
  // Let the message show before the work.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  town = new Town(state.look);
  town.setGround(buildGround(town));
  town.addPlace(state.place, state.hours);
  live.setScene(town);
  grid = new TownWalk(town);
  const at = LAYOUT[state.place].at;
  queue = ORDER.filter((id) => id !== state.place).sort((a, b) => dist(LAYOUT[a].at, at) - dist(LAYOUT[b].at, at));
  busy(null);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// Lay out the next place (or the one asked for): one per call.
function grow(id = queue[0]) {
  if (!id) return;
  queue = queue.filter((q) => q !== id);
  town.addPlace(id, state.hours);
  live.sync();
  grid.sync();
}

// Places whose things have changed with the hour (the car, a lit window)
// are built again, one at a time.
let checked = 0;
function refresh(t) {
  if (t - checked < 500) return;
  checked = t;
  const id = Object.keys(town.places).find((p) => town.stale(p, state.hours));
  if (id) grow(id);
}

// Go to a place and stand where its hero picture is taken (or where the
// place says a walk starts).
function enter(place) {
  if (!town.places[place]) grow(place);
  const v = town.views[town.places[place].start];
  state.pos = standAt(grid, v.eye[0], v.eye[2], v.eye[1]) ?? { x: v.eye[0], y: v.eye[1] - WALKER.eye, z: v.eye[2] };
  state.yaw = Math.atan2(v.target[0] - v.eye[0], -(v.target[2] - v.eye[2]));
  state.shift = v.shift ?? 0;
  where();
}

// Which place the walker is in, for the caption and the links.
function where() {
  const id = placeAt(state.pos.x, state.pos.z);
  const inside = Boolean(id);
  if ((id && id !== state.place) || inside !== state.inside) {
    if (id) state.place = id;
    state.inside = inside;
    showPlaces();
    caption();
  }
}

function saved() {
  try {
    return localStorage.getItem('paloma-look');
  } catch {
    return null;
  }
}

function busy(what) {
  $('busy').textContent = what ? ` · ${what}` : '';
}

function showPlaces() {
  const el = $('places');
  if (!el.children.length) {
    ORDER.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.place = id;
      b.textContent = PLACES[id].NAME.replace(/^The /, '');
      b.title = `${PLACES[id].NAME} (${i + 1})`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (town) enter(id);
      });
      el.append(b);
    });
  }
  for (const b of el.children) b.setAttribute('aria-pressed', String(state.inside && b.dataset.place === state.place));
}

// ---------------------------------------------------------------- the frame

let last = 0;
const times = [];

function frame(t) {
  const dt = Math.min(0.1, last ? (t - last) / 1000 : 0);
  last = t;
  if (state.playing) {
    let h = state.hours + dt / 5; // an hour every five seconds
    if (h > MAX_H) h = MIN_H;
    setHours(h);
  }
  move(dt);
  where();
  live.setTime(state.hours);
  size();
  if (!TEST) live.render(camera(), { rippleT: t / 1000, starT: t / 1000 });
  pace(dt);
  // The work of the next frames: the rest of the town, the ground ahead.
  if (queue.length) {
    busy(`laying out ${PLACES[queue[0]].NAME.replace(/^The /, 'the ')}`);
    // After this frame is on screen, so the message shows first.
    setTimeout(() => {
      grow();
      busy(queue.length ? `laying out ${PLACES[queue[0]].NAME.replace(/^The /, 'the ')}` : null);
      requestAnimationFrame(frame);
    }, 0);
    return;
  }
  refresh(t);
  grid.prefetch(state.pos.x, state.pos.z);
  requestAnimationFrame(frame);
}

function camera() {
  const W = canvas.width;
  const H = canvas.height;
  const eye = [state.pos.x, state.pos.y + WALKER.eye, state.pos.z];
  const target = [eye[0] + Math.sin(state.yaw) * 10, eye[1], eye[2] - Math.cos(state.yaw) * 10];
  return fit({ eye, target, fovY: FOV, shift: state.shift }, W / H);
}

function size() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(64, Math.round(innerWidth * dpr * state.scale));
  const H = Math.max(40, Math.round(innerHeight * dpr * state.scale));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  live.resize(W, H);
}

// Keep near 60 frames a second: paint fewer pixels when slow, more when
// there is room. Not while the town is still being laid out.
function pace(dt) {
  if (!dt || queue.length || TEST) return;
  times.push(dt);
  if (times.length < 40) return;
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  times.length = 0;
  if (avg > 0.022 && state.scale > 0.4) state.scale = Math.max(0.4, state.scale * 0.85);
  else if (avg < 0.0135 && state.scale < 1) state.scale = Math.min(1, state.scale * 1.08);
}

// ---------------------------------------------------------------- moving

function move(dt) {
  const k = state.keys;
  let f = 0;
  let s = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
  f += touch.move[1];
  s += touch.move[0];
  const len = Math.hypot(f, s);
  if (len < 1e-3) return;
  const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) * Math.min(1, len);
  const fx = Math.sin(state.yaw);
  const fz = -Math.cos(state.yaw);
  const dx = ((fx * f - fz * s) / len) * speed * dt;
  const dz = ((fz * f + fx * s) / len) * speed * dt;
  state.pos = walk(grid, state.pos, dx, dz);
}

function turn(dx, dy) {
  state.yaw += dx * LOOK_SPEED;
  // Looking up slides the frame up: the horizon drops, verticals stay put.
  state.shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, state.shift - dy * SHIFT_SPEED));
}

// ---------------------------------------------------------------- the hour and the look

function setHours(h) {
  state.hours = Math.min(MAX_H, Math.max(MIN_H, h));
  caption();
}

let hashTimer = 0;
function caption() {
  const t = clock(state.hours);
  $('clock').textContent = t;
  const name = state.inside ? PLACES[state.place].NAME : ROAD;
  $('place').textContent = name;
  document.title = `${name}, ${t}, live · Paloma Bay`;
  $('sun').style.left = `${((state.hours - MIN_H) / (MAX_H - MIN_H)) * 100}%`;
  const el = (Math.asin(sunDirection(state.hours)[1]) * 180) / Math.PI;
  $('sun').style.background = el > 4 ? '#fff4d8' : el > -6 ? '#ffa373' : '#aebdff';
  $('stills').href = `index.html#${state.place}/${PLACES[state.place].VIEWS[0]}/${state.hours.toFixed(2)}/${state.look}`;
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', `#${state.place}/${state.hours.toFixed(2)}/${state.look}`), 250);
}

async function setLook(name) {
  if (!LOOK_NAMES.includes(name) || name === state.look || (town && queue.length)) return;
  state.look = name;
  try {
    localStorage.setItem('paloma-look', name);
  } catch {
    // the address still has it
  }
  showLooks();
  caption();
  if (!town) return;
  // The whole town again in the other look; the walker stays where they are.
  const { pos, yaw, shift } = state;
  await layOut();
  state.pos = standAt(grid, pos.x, pos.z, pos.y + WALKER.step) ?? pos;
  state.yaw = yaw;
  state.shift = shift;
}

function showLooks() {
  const el = $('looks');
  if (!el.children.length) {
    for (const name of LOOK_NAMES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.look = name;
      b.textContent = LOOKS[name].title;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setLook(name);
      });
      el.append(b);
    }
  }
  for (const b of el.children) b.setAttribute('aria-pressed', String(b.dataset.look === state.look));
}

// ---------------------------------------------------------------- input

canvas.addEventListener('click', () => {
  if (matchMedia('(hover: none)').matches) return;
  canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('walking', document.pointerLockElement === canvas);
  if (document.pointerLockElement !== canvas) state.keys.clear();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) turn(e.movementX, e.movementY);
});

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const c = e.code;
  if (c === 'BracketRight' || c === 'Period') setHours(state.hours + 0.25);
  else if (c === 'BracketLeft' || c === 'Comma') setHours(state.hours - 0.25);
  else if (c === 'Space') state.playing = !state.playing;
  else if (c === 'KeyL') setLook(LOOK_NAMES[(LOOK_NAMES.indexOf(state.look) + 1) % LOOK_NAMES.length]);
  else if (/^Digit[1-9]$/.test(c) && ORDER[Number(c.slice(5)) - 1]) {
    if (town) enter(ORDER[Number(c.slice(5)) - 1]);
  } else if (/^(Key[WASD]|Arrow|Shift)/.test(c)) state.keys.add(c);
  else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => state.keys.delete(e.code));
addEventListener('blur', () => state.keys.clear());

addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    setHours(state.hours + (e.deltaY + e.deltaX) * 0.0035);
  },
  { passive: false },
);

// The day line: point at an hour.
const day = $('day');
const onDay = (e) => {
  const r = day.getBoundingClientRect();
  setHours(MIN_H + ((e.clientX - r.left) / r.width) * (MAX_H - MIN_H));
};
day.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  day.setPointerCapture(e.pointerId);
  onDay(e);
});
day.addEventListener('pointermove', (e) => {
  if (day.hasPointerCapture(e.pointerId)) onDay(e);
});

// Touch: the left half of the screen walks, the right half looks.
const touch = { move: [0, 0], fingers: new Map() };
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  canvas.setPointerCapture(e.pointerId);
  touch.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, walk: e.clientX < innerWidth / 2 });
  document.body.classList.add('walking');
});
canvas.addEventListener('pointermove', (e) => {
  const f = touch.fingers.get(e.pointerId);
  if (!f) return;
  if (f.walk) {
    touch.move = [Math.max(-1, Math.min(1, (e.clientX - f.x) / 60)), Math.max(-1, Math.min(1, -(e.clientY - f.y) / 60))];
  } else {
    turn((e.clientX - f.x) * 1.6, (e.clientY - f.y) * 1.6);
    f.x = e.clientX;
    f.y = e.clientY;
  }
});
const lift = (e) => {
  const f = touch.fingers.get(e.pointerId);
  if (f?.walk) touch.move = [0, 0];
  touch.fingers.delete(e.pointerId);
};
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);

// For tests: where the walker is, and a way to put them somewhere.
window.__live = {
  state,
  town: () => town,
  grid: () => grid,
  renderer: () => live,
  enter,
  ready: () => Boolean(live && town && grid && state.pos),
  // Everything laid out now, rather than a place a frame.
  loadAll() {
    while (queue.length) grow();
    busy(null);
  },
  loaded: () => Boolean(town) && queue.length === 0,
  // A place's own view, in the town.
  view: (place, name) => town.views[`${place}:${name}`],
  snapshot: (cam) => live.snapshot(cam ?? camera(), { rippleT: performance.now() / 1000 }),
  go(x, z, yaw, shift = 0, below = 50) {
    state.pos = standAt(grid, x, z, below) ?? state.pos;
    state.yaw = yaw * DEG;
    state.shift = shift;
    where();
  },
  walk(dx, dz) {
    state.pos = walk(grid, state.pos, dx, dz);
    where();
    return state.pos;
  },
};

start();
