import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, ORDER, buildPlace } from '../src/scenes/index.js';
import { propsAt, whereIs, DAY } from '../src/visitor.js';
import { sunDirection } from '../src/sky.js';
import { Renderer } from '../src/render.js';
import { level, fit } from '../src/camera.js';
import { DEG, mat4LookAt, mat4Perspective, mat4Mul } from '../src/math.js';
import { glyphs } from '../src/world/font.js';
import { createService } from '../web/service.js';

function checksum(mesh) {
  let s = 0;
  for (let i = 0; i < mesh.pos.length; i += 7) s = (s * 31 + Math.round(mesh.pos[i] * 1000)) % 1000000007;
  return s;
}

test('every place builds the same town every time, with all its views', () => {
  for (const id of ORDER) {
    const a = buildPlace(id);
    const b = buildPlace(id);
    assert.equal(a.mesh.count, b.mesh.count, id);
    assert.equal(checksum(a.mesh), checksum(b.mesh), `${id}: not deterministic`);
    assert.ok(a.mesh.pos.every(Number.isFinite), `${id}: bad vertex`);
    for (const v of PLACES[id].VIEWS) assert.ok(a.views[v], `${id}: missing view ${v}`);
    assert.equal(a.hero, PLACES[id].VIEWS[0]);
    assert.ok(a.shadowBox.min.every((m, k) => m < a.shadowBox.max[k]), `${id}: empty shadow box`);
  }
});

test('the visitor is always somewhere, and only in one place at a time', () => {
  for (let h = 0; h < 24; h += 0.05) {
    const here = ORDER.filter((id) => propsAt(id, h).car);
    assert.deepEqual(here, [whereIs(h)], `at ${h.toFixed(2)}`);
  }
  assert.equal(DAY[DAY.length - 1].to, 24);
});

test('props move the traces, never the town', () => {
  const still = {
    motel: (w) => w.layout.block,
    beach: (w) => [w.layout.tower.x, w.layout.tower.z, w.layout.pier],
    marina: (w) => w.layout.lighthouse,
    boulevard: (w) => w.layout.palms.map((p) => [p.x, p.z]),
  };
  for (const [id, pick] of Object.entries(still)) {
    const morning = buildPlace(id, propsAt(id, 6));
    const evening = buildPlace(id, propsAt(id, 18.5));
    assert.deepEqual(pick(morning), pick(evening), id);
  }
  // Taking the car away takes triangles away.
  for (const id of ORDER) {
    const withCar = buildPlace(id, { car: true });
    const without = buildPlace(id, { car: false });
    assert.ok(without.mesh.count < withCar.mesh.count, `${id}: the car did not leave`);
  }
});

// The mesh without something is the mesh with it, one run of triangles cut out.
function cutFrom(whole, part) {
  const a = whole.mesh.pos;
  const b = part.mesh.pos;
  let p = 0;
  while (p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  return p + q === b.length && b.length < a.length;
}

test('the visitor coming and going moves nothing else in town', () => {
  // Every parked car and every boat draws from a stream of its own, so the
  // visitor's car (or the red sloop) is the only thing that changes.
  for (const id of ORDER) assert.ok(cutFrom(buildPlace(id, { car: true }), buildPlace(id, { car: false })), `${id}: taking the car away changed something else`);
  assert.ok(cutFrom(buildPlace('marina', { sloop: 'in' }), buildPlace('marina', { sloop: 'out' })), 'the sloop leaving changed another boat');
});

test('the sloop under way is the same boat that lies in the slip', () => {
  const inSlip = buildPlace('marina', { sloop: 'in' });
  const home = inSlip.layout.sloop;
  const away = buildPlace('marina', { sloop: 'out', sloopAt: { ...home } });
  assert.equal(away.mesh.count, inSlip.mesh.count);
  const sum = (m) => m.pos.reduce((acc, v) => acc + v, 0);
  assert.ok(Math.abs(sum(away.mesh) - sum(inSlip.mesh)) < 1e-3 * away.mesh.count);
});

test('the boulevard is laid out on the midsummer sunset', () => {
  // Find sunset, then its compass bearing.
  let h = 18;
  while (sunDirection(h)[1] > 0) h += 0.01;
  const d = sunDirection(h);
  const az = (Math.atan2(d[0], -d[2]) / DEG + 360) % 360;
  const v = buildPlace('boulevard').views.sunset;
  const look = (Math.atan2(v.target[0] - v.eye[0], -(v.target[2] - v.eye[2])) / DEG + 360) % 360;
  assert.ok(Math.abs(az - look) < 2, `road ${look.toFixed(1)} vs sunset ${az.toFixed(1)}`);
});

test('level views keep verticals vertical; the lens shift puts the horizon where asked', () => {
  const v = level([0, 1.6, 0], 90, 30, 0.3);
  assert.equal(v.target[1], v.eye[1]);
  const W = 300;
  const H = 200;
  // A far point at eye height lands on the horizon line.
  const proj = mat4Perspective(v.fovY * DEG, W / H, 0.05, 30000);
  proj[9] = v.shift;
  const vp = mat4Mul(proj, mat4LookAt(v.eye, v.target));
  const p = [5000, 1.6, 0];
  const cy = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const cw = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  const fromBottom = (cy / cw + 1) / 2;
  assert.ok(Math.abs(fromBottom - 0.3) < 1e-6, `horizon at ${fromBottom}`);
  // Taller frames keep the width of the view.
  const tall = fit(v, 0.6);
  const tx = (f, a) => Math.tan((f * DEG) / 2) * a;
  assert.ok(Math.abs(tx(tall.fovY, 0.6) - tx(v.fovY, 1.5)) < 1e-9);
  assert.equal(fit(v, 2).fovY, v.fovY);
});

test('open water mirrors only the band it needs, and nothing changes for it', () => {
  const world = buildPlace('beach');
  const W = 72;
  const H = 48;
  const frames = [true, false].map((band) => {
    const r = new Renderer(world, { shadowSize: 256 });
    if (!band) r.reflectionBand = () => null;
    r.setTime(15);
    r.setCamera(world.views.pier, W, H, 1);
    return r.render(undefined, { glow: false });
  });
  assert.deepEqual(frames[0], frames[1]);
});

test('a tile rendered on its own matches the same tile of a whole frame', () => {
  const world = buildPlace('motel');
  const r = new Renderer(world, { shadowSize: 256 });
  const W = 80;
  const H = 50;
  r.setTime(16);
  r.setCamera(world.views.front, W, H, 2);
  const full = r.render(undefined, { glow: false });
  const [x0, y0, x1, y1] = [20, 10, 52, 37];
  const tile = new Float32Array((x1 - x0) * (y1 - y0) * 3);
  r.renderTile(x0, y0, x1, y1, tile, true);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      for (let c = 0; c < 3; c++) assert.equal(tile[((y - y0) * (x1 - x0) + (x - x0)) * 3 + c], full[(y * W + x) * 3 + c]);
    }
  }
});

test('the sign painter knows every letter the town uses', () => {
  const words = ['MOTEL', 'VACANCY', 'NO', 'OFFICE', 'DINER', 'COFFEE', 'MARINA', 'SURF SHOP', 'RECORDS', 'COCKTAILS', 'PHARMACY', 'CINEMA', 'BAR', 'HOTEL'];
  for (const w of words) for (const ch of w.replace(/ /g, '')) assert.ok(glyphs.includes(ch), `no glyph for ${ch}`);
});

test('the render service paints every tile of a frame, and a newer frame wins', async () => {
  const got = [];
  let resolve;
  const finished = new Promise((r) => (resolve = r));
  const handle = createService((m) => {
    got.push(m);
    if (m.type === 'done') resolve(m.job);
  });
  const frame = (job) => ({
    type: 'frame',
    job,
    place: 'house',
    view: 'pool',
    props: propsAt('house', 11),
    hours: 11,
    W: 64,
    H: 40,
    ss: 1,
    shadowSize: 256,
    reflScale: 0.5,
    tiles: [
      [0, 0, 32, 40],
      [32, 0, 64, 40],
    ],
  });
  handle(frame(1));
  handle(frame(2)); // replaces job 1 before it starts
  assert.equal(await finished, 2);
  const tiles = got.filter((m) => m.type === 'tile');
  assert.equal(tiles.length, 2);
  assert.ok(tiles.every((t) => t.job === 2 && t.data.length === 32 * 40 * 3 && t.data.every(Number.isFinite)));
});
