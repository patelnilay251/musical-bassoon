// Interactive viewer: orbit the resort, drag the sun, explore seeds.
// Rendering is progressive: a quick low-resolution frame while you move,
// then full resolution, then 2x supersampling, tile by tile, when you stop.

import { buildWorld, DEFAULT_SEED, DEFAULT_PROPS } from '../src/world/index.js';
import { Renderer, toRGBA } from '../src/render.js';
import { views } from '../src/views.js';
import { sunDirection } from '../src/sky.js';
import { DEG, clamp, mat4LookAt, mat4Perspective, mat4Mul } from '../src/math.js';

const defaults = { seed: DEFAULT_SEED, hours: 16.5, view: 'hero', fov: 46, props: { ...DEFAULT_PROPS } };
let params = structuredClone(defaults);

const PRESETS = [
  ['hero', 'Poolside'],
  ['low', 'Water level'],
  ['sea', 'Sea wall'],
  ['terrace', 'Terrace'],
  ['drive', 'Drive'],
  ['aerial', 'Aerial'],
];

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const overlay = $('overlay');
const ctx = canvas.getContext('2d');
const octx = overlay.getContext('2d');
const small = document.createElement('canvas');
const sctx = small.getContext('2d');

let W = 0;
let H = 0;
let dpr = 1;
let image = null;
let world = null;
let fast = null;
let fine = null;
let orbit = null;
let needsFast = true;
let lastInput = 0;
let fineJob = null;
let fineStage = 0;
let playing = false;
let lastFrame = 0;
let drag = null;
let hoverSun = false;
let lastFastMs = 0;

// ------------------------------------------------------------ world & camera

function rebuild() {
  const t0 = performance.now();
  world = buildWorld(params.seed, params.props);
  fast = new Renderer(world, { shadowSize: 1024 });
  fine = new Renderer(world, { shadowSize: 2048 });
  const ms = performance.now() - t0;
  $('status-left').textContent = `seed ${params.seed} · ${world.mesh.count.toLocaleString()} triangles · built in ${ms.toFixed(0)} ms`;
  invalidate();
}

function allViews() {
  return views(world.layout);
}

function setView(name) {
  const v = allViews()[name];
  params.view = name;
  params.fov = v.fovY;
  const T = v.target.slice();
  const d = [v.eye[0] - T[0], v.eye[1] - T[1], v.eye[2] - T[2]];
  const dist = Math.hypot(d[0], d[1], d[2]);
  orbit = { T, dist, yaw: Math.atan2(d[2], d[0]), pitch: Math.asin(d[1] / dist) };
  syncUI();
  invalidate();
}

function camera() {
  const { T, dist, yaw } = orbit;
  // Keep the eye above the ground.
  const minPitch = Math.asin(clamp((0.3 - T[1]) / dist, -1, 1));
  orbit.pitch = clamp(orbit.pitch, minPitch, 1.5);
  const cp = Math.cos(orbit.pitch);
  const eye = [T[0] + dist * cp * Math.cos(yaw), T[1] + dist * Math.sin(orbit.pitch), T[2] + dist * cp * Math.sin(yaw)];
  return { eye, target: T, fovY: params.fov };
}

function viewProj(cam) {
  const view = mat4LookAt(cam.eye, cam.target);
  const proj = mat4Perspective(cam.fovY * DEG, W / H, 0.05, 30000);
  return mat4Mul(proj, view);
}

// World direction -> canvas pixel (or null behind the camera).
function projectDir(vp, eye, d) {
  const x = eye[0] + d[0] * 1000;
  const y = eye[1] + d[1] * 1000;
  const z = eye[2] + d[2] * 1000;
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (cw <= 0.1) return null;
  return { x: (cx / cw + 1) * 0.5 * W, y: (1 - cy / cw) * 0.5 * H };
}

// ------------------------------------------------------------ rendering

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.min(1200, Math.round(rect.width * dpr));
  const h = Math.round((w * 2) / 3);
  if (w === W && h === H) return;
  W = w;
  H = h;
  canvas.width = overlay.width = W;
  canvas.height = overlay.height = H;
  image = ctx.createImageData(W, H);
  invalidate();
}

function invalidate() {
  needsFast = true;
}

function renderFast() {
  const t0 = performance.now();
  const s = playing ? 0.33 : 0.4;
  const w = Math.max(2, Math.round(W * s));
  const h = Math.max(2, Math.round(H * s));
  if (small.width !== w || small.height !== h) {
    small.width = w;
    small.height = h;
  }
  fast.setTime(params.hours);
  fast.setCamera(camera(), w, h, 1);
  const img = fast.render();
  const px = sctx.createImageData(w, h);
  toRGBA(img, w, h, px.data);
  sctx.putImageData(px, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, W, H);
  lastFastMs = performance.now() - t0;
  $('status-right').textContent = `preview ${w}×${h} · ${lastFastMs.toFixed(0)} ms`;
  document.body.dataset.refined = '0';
}

function startFine(ss) {
  const t0 = performance.now();
  fine.setTime(params.hours);
  fine.setCamera(camera(), W, H, ss);
  fine.prepare();
  return { ss, tiles: fine.tiles(), i: 0, img: new Float32Array(W * H * 3), t0 };
}

function stepFine(job, budget) {
  const t0 = performance.now();
  while (job.i < job.tiles.length && performance.now() - t0 < budget) {
    const [x0, y0, x1, y1] = job.tiles[job.i++];
    fine.renderTile(x0, y0, x1, y1, job.img);
    toRGBA(job.img, W, H, image.data, x0, y0, x1, y1);
    ctx.putImageData(image, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }
  const done = job.i >= job.tiles.length;
  const pct = Math.round((100 * job.i) / job.tiles.length);
  const label = job.ss > 1 ? `${job.ss}× supersampled` : 'full resolution';
  $('status-right').textContent = done
    ? `${W}×${H} · ${label} · ${(performance.now() - job.t0).toFixed(0)} ms`
    : `refining ${label} · ${pct}%`;
  return done;
}

function frame(now) {
  resize();
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (playing) {
    params.hours += dt * 0.8;
    if (params.hours > 22.5) params.hours = 5.5;
    syncHours();
    needsFast = true;
  }
  if (world && W) {
    if (needsFast) {
      renderFast();
      needsFast = false;
      fineJob = null;
      fineStage = 0;
      lastInput = now;
      drawOverlay();
      $('canvas-container').querySelector('.loading')?.remove();
    } else if (!playing && now - lastInput > 160 && fineStage < 2) {
      if (!fineJob) fineJob = startFine(fineStage === 0 ? 1 : 2);
      if (stepFine(fineJob, 24)) {
        fineJob = null;
        fineStage++;
        document.body.dataset.refined = String(fineStage);
      }
    }
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ the sun handle

function sunScreen() {
  const cam = camera();
  const d = sunDirection(params.hours);
  if (d[1] < -0.03) return null;
  return projectDir(viewProj(cam), cam.eye, d);
}

function sunPath() {
  const cam = camera();
  const vp = viewProj(cam);
  const pts = [];
  for (let t = 4.5; t <= 20.5; t += 0.05) {
    const d = sunDirection(t);
    if (d[1] < -0.02) continue;
    const p = projectDir(vp, cam.eye, d);
    pts.push(p ? { ...p, t } : null);
  }
  return pts;
}

function drawOverlay() {
  octx.clearRect(0, 0, W, H);
  const active = hoverSun || (drag && drag.mode === 'sun');
  if (!active) {
    // A faint ring says the sun can be grabbed.
    const s = sunScreen();
    if (s) {
      octx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      octx.lineWidth = 1.5 * dpr;
      octx.beginPath();
      octx.arc(s.x, s.y, 18 * dpr, 0, Math.PI * 2);
      octx.stroke();
    }
    return;
  }
  const pts = sunPath();
  octx.save();
  octx.lineWidth = 1.5 * dpr;
  octx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  octx.setLineDash([5 * dpr, 6 * dpr]);
  octx.beginPath();
  let pen = false;
  for (const p of pts) {
    if (!p) {
      pen = false;
      continue;
    }
    if (pen) octx.lineTo(p.x, p.y);
    else octx.moveTo(p.x, p.y);
    pen = true;
  }
  octx.stroke();
  octx.setLineDash([]);
  octx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  octx.font = `${11 * dpr}px Poppins, sans-serif`;
  octx.textAlign = 'center';
  for (const p of pts) {
    if (!p) continue;
    const h = Math.round(p.t * 20) / 20;
    if (Math.abs(h - Math.round(h)) < 1e-6 && Math.round(h) % 3 === 0) {
      octx.beginPath();
      octx.arc(p.x, p.y, 2.5 * dpr, 0, Math.PI * 2);
      octx.fill();
      octx.fillText(fmtHours(Math.round(h)), p.x, p.y - 8 * dpr);
    }
  }
  const s = sunScreen();
  if (s) {
    octx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    octx.lineWidth = 2 * dpr;
    octx.beginPath();
    octx.arc(s.x, s.y, 20 * dpr, 0, Math.PI * 2);
    octx.stroke();
  }
  octx.restore();
}

function nearestHour(p) {
  const cam = camera();
  const vp = viewProj(cam);
  let best = params.hours;
  let bestD = Infinity;
  for (let t = 4.8; t <= 20.2; t += 0.01) {
    const d = sunDirection(t);
    if (d[1] < -0.03) continue;
    const q = projectDir(vp, cam.eye, d);
    if (!q) continue;
    const dd = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = t;
    }
  }
  return best;
}

// ------------------------------------------------------------ input

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

function isNearSun(p) {
  const s = sunScreen();
  return !!s && Math.hypot(s.x - p.x, s.y - p.y) < 30 * dpr;
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = toCanvas(e);
  if (isNearSun(p)) drag = { mode: 'sun' };
  else if (e.button === 2 || e.shiftKey) drag = { mode: 'pan', ...p };
  else drag = { mode: 'orbit', ...p };
  if (playing) togglePlay();
});
canvas.addEventListener('pointermove', (e) => {
  const p = toCanvas(e);
  if (!drag) {
    const near = isNearSun(p);
    canvas.style.cursor = near ? 'grab' : 'default';
    if (near !== hoverSun) {
      hoverSun = near;
      drawOverlay();
    }
    return;
  }
  if (drag.mode === 'sun') {
    params.hours = nearestHour(p);
    syncHours();
  } else if (drag.mode === 'orbit') {
    orbit.yaw += ((p.x - drag.x) / W) * 3.2;
    orbit.pitch += ((p.y - drag.y) / H) * 2.0;
  } else {
    const k = (orbit.dist * 1.2) / W;
    const f = [Math.cos(orbit.yaw), Math.sin(orbit.yaw)];
    orbit.T[0] += (-f[1] * (p.x - drag.x) - f[0] * (p.y - drag.y)) * k;
    orbit.T[2] += (f[0] * (p.x - drag.x) - f[1] * (p.y - drag.y)) * k;
  }
  drag.x = p.x;
  drag.y = p.y;
  invalidate();
});
canvas.addEventListener('pointerup', () => {
  drag = null;
  drawOverlay();
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.0012), 2.5, 140);
    invalidate();
  },
  { passive: false },
);
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === '[' || e.key === ']') {
    params.hours = clamp(params.hours + (e.key === ']' ? 0.25 : -0.25), 5, 23.5);
    syncHours();
    invalidate();
  }
});

// ------------------------------------------------------------ UI

function fmtHours(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const m = mm === 60 ? 0 : mm;
  const H24 = (mm === 60 ? hh + 1 : hh) % 24;
  const h12 = H24 % 12 === 0 ? 12 : H24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${H24 < 12 ? 'am' : 'pm'}`;
}

function syncHours() {
  $('hours').value = params.hours;
  $('hours-value').textContent = fmtHours(params.hours);
}

function syncUI() {
  syncHours();
  $('seed-input').value = params.seed;
  $('fov').value = params.fov;
  $('fov-value').textContent = `${Math.round(params.fov)}°`;
  $('towel').checked = params.props.towel;
  $('book').checked = params.props.book;
  $('umbrella').checked = params.props.umbrella !== 'closed';
  $('car').checked = params.props.car;
  $('float').value = params.props.float;
  $('float-value').textContent = params.props.float.toFixed(2);
  for (const b of $('presets').children) b.classList.toggle('active', b.dataset.view === params.view);
}

function buildPresets() {
  const el = $('presets');
  for (const [name, label] of PRESETS) {
    const b = document.createElement('button');
    b.className = 'button';
    b.textContent = label;
    b.dataset.view = name;
    b.onclick = () => setView(name);
    el.appendChild(b);
  }
}

function changeSeed(seed) {
  params.seed = seed;
  rebuild();
  setView(params.view);
}

Object.assign(window, {
  updateSeed() {
    const s = parseInt($('seed-input').value, 10);
    if (s && s > 0) changeSeed(s);
    else syncUI();
  },
  previousSeed() {
    changeSeed(Math.max(1, params.seed - 1));
  },
  nextSeed() {
    changeSeed(params.seed + 1);
  },
  randomSeedAndUpdate() {
    changeSeed(Math.floor(Math.random() * 999999) + 1);
  },
  updateParam(name, value) {
    params[name] = parseFloat(value);
    if (name === 'fov') $('fov-value').textContent = `${Math.round(params.fov)}°`;
    if (name === 'hours') syncHours();
    invalidate();
  },
  updateTrace(name, value) {
    params.props[name] = value;
    if (name === 'float') $('float-value').textContent = value.toFixed(2);
    rebuild();
  },
  togglePlay() {
    playing = !playing;
    $('play').textContent = playing ? '❚❚ Pause' : '▶ Play the day';
    invalidate();
  },
  regenerate() {
    rebuild();
  },
  resetParameters() {
    params = structuredClone(defaults);
    rebuild();
    setView(params.view);
  },
  downloadPNG() {
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vacant-sunlight-${params.seed}-${fmtHours(params.hours).replace(/[: ]/g, '')}.png`;
      a.click();
    });
  },
});
const togglePlay = window.togglePlay;

// Test hook for headless checks.
window.__vacant = {
  params: () => params,
  setView,
  setHours(h) {
    params.hours = h;
    syncHours();
    invalidate();
  },
  sunScreen,
};

buildPresets();
rebuild();
setView(params.view);
requestAnimationFrame(frame);
