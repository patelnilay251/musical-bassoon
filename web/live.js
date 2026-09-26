// Paloma Bay, live: walk through a place painted on the GPU as fast as you
// move, by the same rules as the painted town (src/live/). Click to walk:
// W A S D or the arrows, the mouse to look, shift to run. [ and ] or the
// wheel change the hour, space lets the day pass, L turns to the other
// look. The camera stays level the way the paintings do: looking up or
// down slides the frame, like the rising front of a view camera, so
// verticals stay vertical.

import { buildPlace } from '../src/scenes/index.js';
import { propsAt, clock } from '../src/visitor.js';
import { sunDirection } from '../src/sky.js';
import { LOOKS, LOOK_NAMES, DEFAULT_LOOK } from '../src/looks.js';
import { fit } from '../src/camera.js';
import { DEG } from '../src/math.js';
import { createLive } from '../src/live/renderer.js';
import { buildWalk, walk, standAt, WALKER } from '../src/live/walk.js';

const PLACE = 'motel';
const START = 'front'; // stand where the hero picture is taken
const MIN_H = 4.5;
const MAX_H = 23.75;
const FOV = 52; // vertical, at the 3:2 frame the views are composed for
const WALK_SPEED = 1.6;
const RUN_SPEED = 4.2;
const LOOK_SPEED = 0.0022; // radians per pixel of mouse travel
const SHIFT_SPEED = 0.003;
const MAX_SHIFT = 0.95;

const $ = (id) => document.getElementById(id);
const canvas = $('live');
const state = {
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
let world = null;
let grid = null;
let built = ''; // props and look the current world was built with

// ---------------------------------------------------------------- setup

async function start() {
  const now = new Date();
  let h = now.getHours() + now.getMinutes() / 60;
  if (h < MIN_H) h = MAX_H;
  const m = location.hash.match(/^#(\d+(?:\.\d+)?)(?:\/([a-z]+))?/);
  if (m) h = Number(m[1]);
  state.hours = Math.min(MAX_H, Math.max(MIN_H, h));
  const asked = [m && m[2], new URLSearchParams(location.search).get('look'), saved()].find((l) => LOOK_NAMES.includes(l));
  state.look = asked ?? DEFAULT_LOOK;
  showLooks();
  caption();
  try {
    live = await createLive(canvas);
  } catch (err) {
    console.warn(err);
    document.body.classList.add('nogpu');
    return;
  }
  rebuild();
  const v = world.views[START];
  state.pos = standAt(grid, v.eye[0], v.eye[2]) ?? { x: v.eye[0], y: 0, z: v.eye[2] };
  state.yaw = Math.atan2(v.target[0] - v.eye[0], -(v.target[2] - v.eye[2]));
  state.shift = v.shift ?? 0;
  requestAnimationFrame(frame);
}

function saved() {
  try {
    return localStorage.getItem('paloma-look');
  } catch {
    return null;
  }
}

// Build the place as it stands at this hour, in this look; a new world
// only when something in it has changed (the car, the sign, the look).
function rebuild() {
  const props = propsAt(PLACE, state.hours);
  const key = `${state.look}|${JSON.stringify(props)}`;
  if (key === built) return;
  const carMoved = !world || world.props?.car !== props.car || world.look?.name !== state.look;
  built = key;
  world = buildPlace(PLACE, props, state.look);
  live.setWorld(world);
  // The walking grid only needs redoing when something solid moved.
  if (carMoved || !grid) grid = buildWalk(world);
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
  rebuild();
  live.setTime(state.hours);
  size();
  if (!TEST) live.render(camera(), { rippleT: t / 1000, starT: t / 1000 });
  pace(dt);
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
// there is room.
function pace(dt) {
  if (!dt) return;
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
  document.title = `The Motel, ${t}, live · Paloma Bay`;
  $('sun').style.left = `${((state.hours - MIN_H) / (MAX_H - MIN_H)) * 100}%`;
  const el = (Math.asin(sunDirection(state.hours)[1]) * 180) / Math.PI;
  $('sun').style.background = el > 4 ? '#fff4d8' : el > -6 ? '#ffa373' : '#aebdff';
  $('stills').href = `index.html#${PLACE}/${START}/${state.hours.toFixed(2)}/${state.look}`;
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', `#${state.hours.toFixed(2)}/${state.look}`), 250);
}

function setLook(name) {
  if (!LOOK_NAMES.includes(name) || name === state.look) return;
  state.look = name;
  try {
    localStorage.setItem('paloma-look', name);
  } catch {
    // the address still has it
  }
  showLooks();
  caption();
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
  else if (/^(Key[WASD]|Arrow|Shift)/.test(c)) state.keys.add(c);
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
  place: () => world,
  ready: () => Boolean(live && world),
  snapshot: () => live.snapshot(camera(), { rippleT: performance.now() / 1000 }),
  go(x, z, yaw, shift = 0) {
    state.pos = standAt(grid, x, z) ?? state.pos;
    state.yaw = yaw * DEG;
    state.shift = shift;
  },
  walk(dx, dz) {
    state.pos = walk(grid, state.pos, dx, dz);
    return state.pos;
  },
};

start();
