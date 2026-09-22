import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunDirection, skyState, LATITUDE, DECLINATION } from '../src/sky.js';
import { DEG } from '../src/math.js';
import { buildWorld } from '../src/world/index.js';
import { Renderer } from '../src/render.js';
import { views } from '../src/views.js';

test('solar noon: due south, at 90 - latitude + declination', () => {
  const d = sunDirection(12);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-12);
  assert.ok(Math.abs(d[0]) < 1e-12, 'no east-west component at noon');
  assert.ok(d[2] > 0, 'sun is to the south (+z)');
  const el = Math.asin(d[1]) / DEG;
  assert.ok(Math.abs(el - (90 - LATITUDE / DEG + DECLINATION / DEG)) < 1e-9);
});

test('the sun rises in the east and sets in the west, symmetrically', () => {
  const am = sunDirection(9);
  const pm = sunDirection(15);
  assert.ok(am[0] > 0 && pm[0] < 0);
  assert.ok(Math.abs(am[1] - pm[1]) < 1e-12);
  assert.ok(sunDirection(4.5)[1] < 0 && sunDirection(19.5)[1] < 0, 'down at night');
});

test('sky: bright day, dark starry night with the lights on', () => {
  const day = skyState(13);
  const night = skyState(22);
  assert.ok(day.keyOn && day.night === 0 && day.lights === 0);
  assert.ok(night.night > 0.9 && night.stars > 0.9 && night.lights === 1);
  assert.ok(night.zenith.reduce((a, b) => a + b) < day.zenith.reduce((a, b) => a + b) / 4);
  // Shadows are a hue shift: the shade tone is bluer than the light tone.
  assert.ok(day.amb[2] > day.amb[0] && day.key[0] > day.key[2]);
});

function checksum(mesh) {
  let s = 0;
  for (let i = 0; i < mesh.pos.length; i += 7) s = (s * 31 + Math.round(mesh.pos[i] * 1000)) % 1000000007;
  return s;
}

test('same seed, same world; different seed, different world', () => {
  const a = buildWorld(1981);
  const b = buildWorld(1981);
  const c = buildWorld(1982);
  assert.equal(a.mesh.count, b.mesh.count);
  assert.equal(checksum(a.mesh), checksum(b.mesh));
  assert.notEqual(checksum(a.mesh), checksum(c.mesh));
});

test('traces move, the house does not', () => {
  const morning = buildWorld(1981, { towel: false, car: true, float: 0 });
  const night = buildWorld(1981, { towel: true, car: false, float: 1 });
  assert.deepEqual(morning.layout.pool, night.layout.pool);
  assert.deepEqual(morning.layout.villa.footprint, night.layout.villa.footprint);
  assert.deepEqual(
    morning.layout.palms.map((p) => [p.x, p.z]),
    night.layout.palms.map((p) => [p.x, p.z]),
  );
  // The float drifts from the deep end toward the shallow end.
  assert.ok(night.layout.float.x < morning.layout.float.x);
  assert.ok(night.layout.float.z > morning.layout.float.z);
});

test('placement rules hold across seeds', () => {
  for (const seed of [1, 7, 42, 99, 314, 777, 1234, 1981, 2026, 31337]) {
    const { layout: L } = buildWorld(seed);
    const p = L.pool;
    for (const palm of L.palms) {
      assert.ok(!(palm.x > p.x0 - 1 && palm.x < p.x1 + 1 && palm.z > p.z0 - 1 && palm.z < p.z1 + 1), `seed ${seed}: palm in the pool`);
      for (const [x0, x1, z0, z1] of L.villa.footprint) {
        assert.ok(!(palm.x > x0 && palm.x < x1 && palm.z > z0 && palm.z < z1), `seed ${seed}: palm in the house`);
      }
      assert.ok(palm.x > L.bounds.x0 && palm.x < L.bounds.x1 && palm.z > L.bounds.z0 && palm.z < L.bounds.z1);
    }
    // The pool sits in front of the house, never under it.
    assert.ok(p.x1 < L.villa.ux0, `seed ${seed}: pool overlaps the house`);
    assert.ok(L.palms.length >= 8, `seed ${seed}: too few palms`);
  }
});

test('a small render is finite, sky is blue by day, and night is dark', () => {
  const world = buildWorld(1981);
  const r = new Renderer(world, { shadowSize: 512 });
  const W = 48;
  const H = 32;
  const mean = (img) => img.reduce((a, b) => a + b, 0) / img.length;
  r.setCamera(views(world.layout).sea, W, H, 1);
  r.setTime(13);
  const day = r.render();
  assert.ok(day.every(Number.isFinite));
  const sky = new Float64Array(3);
  r.background(0, 2, 0, 0, 0.6, 0.8, sky);
  assert.ok(sky[2] > sky[1] && sky[1] > sky[0], 'noon sky is blue');
  r.setTime(22);
  const night = r.render();
  assert.ok(night.every(Number.isFinite));
  // The glowing pool keeps the frame bright; the sky itself goes dark.
  assert.ok(mean(night) < mean(day) * 0.6, 'night is darker');
  const nightSky = new Float64Array(3);
  r.background(0, 2, 0, 0, 0.6, 0.8, nightSky);
  assert.ok(nightSky[0] + nightSky[1] + nightSky[2] < (sky[0] + sky[1] + sky[2]) / 4, 'night sky is dark');
});
