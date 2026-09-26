import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlace, PLACES, ORDER } from '../src/scenes/index.js';
import { propsAt } from '../src/visitor.js';
import { Renderer, KIND } from '../src/render.js';
import { skyState } from '../src/sky.js';
import { packMesh, packMaterials, packShades, packFrame, packPanes, shadowMatrix, nearShadowMatrix, DETAIL, PANE_FLOATS, VERTEX_BYTES, MATERIAL_FLOATS, FRAME_FLOATS } from '../src/live/pack.js';
import { buildWalk, walk, standAt, floorAt, WALKER } from '../src/live/walk.js';
import { SCENE_WGSL, POST_WGSL } from '../src/live/wgsl.js';

const motel = buildPlace('motel', propsAt('motel', 16.2), 'cobalt');

function area(P) {
  const e0 = [P[3] - P[0], P[4] - P[1], P[5] - P[2]];
  const e1 = [P[6] - P[0], P[7] - P[1], P[8] - P[2]];
  return Math.hypot(e0[1] * e1[2] - e0[2] * e1[1], e0[2] * e1[0] - e0[0] * e1[2], e0[0] * e1[1] - e0[1] * e1[0]) / 2;
}

test('the live mesh is the painted mesh, with big triangles cut small where a camera can go', () => {
  const box = motel.shadowBox;
  const { data, count } = packMesh(motel.mesh, box);
  assert.equal(data.byteLength, count * VERTEX_BYTES);
  assert.equal(count % 3, 0);
  const f = new Float32Array(data);
  const u = new Uint32Array(data);
  let packed = 0;
  let original = 0;
  const mats = new Set();
  for (let t = 0; t < count / 3; t++) {
    const P = [];
    for (let k = 0; k < 3; k++) P.push(f[(t * 3 + k) * 10], f[(t * 3 + k) * 10 + 1], f[(t * 3 + k) * 10 + 2]);
    packed += area(P);
    mats.add(u[t * 30 + 8] & 0xffff);
    // Inside the zone, nothing longer than 40 m is left.
    const inside = [0, 3, 6].every((o) => P[o] > box.min[0] && P[o] < box.max[0] && P[o + 2] > box.min[2] && P[o + 2] < box.max[2]);
    if (inside) {
      for (let e = 0; e < 3; e++) {
        const a = e * 3;
        const b = ((e + 1) % 3) * 3;
        assert.ok(Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]) <= 40.001);
      }
    }
  }
  for (let t = 0; t < motel.mesh.count; t++) original += area(Array.from(motel.mesh.pos.subarray(t * 9, t * 9 + 9)));
  assert.ok(Math.abs(packed - original) / original < 1e-4, 'cutting triangles lost or gained area');
  assert.equal(mats.size, new Set(motel.mesh.mat).size);
});

test('materials go to the GPU with their kinds, patterns, power and road lanes', () => {
  const { data, count, lanes } = packMaterials(motel);
  const f = new Float32Array(data);
  const u = new Uint32Array(data);
  assert.equal(count, motel.materials.length);
  motel.materials.forEach((m, i) => {
    assert.equal(u[i * MATERIAL_FLOATS + 3], KIND[m.kind ?? 'diffuse'], m.name);
  });
  const road = motel.materials.findIndex((m) => m.name === 'road');
  assert.equal(u[road * MATERIAL_FLOATS + 19], 2);
  assert.deepEqual(Array.from(lanes.subarray(u[road * MATERIAL_FLOATS + 18], u[road * MATERIAL_FLOATS + 18] + 2)), motel.materials[road].lanes.centers.map(Math.fround));
  const visitor = motel.materials.findIndex((m) => m.name === 'visitorGlass');
  assert.equal(f[visitor * MATERIAL_FLOATS + 12], motel.emitScale.visitorGlass);
  // Close-up grain: stucco on the walls, stones in the tar, none on glass.
  const grainOf = (name) => u[motel.materials.findIndex((m) => m.name === name) * MATERIAL_FLOATS + 20];
  assert.equal(grainOf('wall'), DETAIL.stucco);
  assert.equal(grainOf('road'), DETAIL.asphalt);
  assert.equal(grainOf('trunk'), DETAIL.bark);
  assert.equal(grainOf('roomGlass'), DETAIL.none);
});

test('every pane a walker can look into is upright glass of a building, with its own extent', () => {
  const boulevard = buildPlace('boulevard', propsAt('boulevard', 16.2), 'cobalt');
  for (const world of [motel, boulevard]) {
    const { data, paneOf, count } = packPanes(world);
    assert.ok(count > 0);
    assert.equal(data.length, count * PANE_FLOATS);
    const mesh = world.mesh;
    for (let t = 0; t < mesh.count; t++) {
      const name = world.materials[mesh.mat[t]].name;
      if (name === 'carGlass' || name === 'visitorGlass') assert.equal(paneOf[t], 0, 'a car is not a room');
      if (!paneOf[t]) continue;
      assert.ok(name === 'glass' || name === 'roomGlass');
      // The triangle lies inside its pane, along the face and up it.
      const o = (paneOf[t] - 1) * PANE_FLOATS;
      const [a0, a1, y0, y1, nx, nz] = data.subarray(o, o + 6);
      for (let k = 0; k < 3; k++) {
        const x = mesh.pos[t * 9 + k * 3];
        const y = mesh.pos[t * 9 + k * 3 + 1];
        const z = mesh.pos[t * 9 + k * 3 + 2];
        const a = -nz * x + nx * z;
        assert.ok(a >= a0 - 1e-3 && a <= a1 + 1e-3 && y >= y0 - 1e-3 && y <= y1 + 1e-3);
      }
    }
    // The pane rides in the top half of the object id; the id itself is kept.
    const { data: verts } = packMesh(world.mesh, world.shadowBox, paneOf);
    const u = new Uint32Array(verts);
    const ids = new Set(Array.from({ length: u.length / 10 }, (_, v) => u[v * 10 + 9] & 0xffff));
    assert.deepEqual([...ids].sort((a, b) => a - b), [...new Set(world.mesh.obj)].sort((a, b) => a - b));
  }
  // Rooms, shops and lounges.
  const style = (world, name) => {
    const { data, paneOf } = packPanes(world);
    const t = world.mesh.mat.findIndex((m, i) => world.materials[m].name === name && paneOf[i]);
    return data[(paneOf[t] - 1) * PANE_FLOATS + 6];
  };
  assert.equal(style(motel, 'roomGlass'), 0);
  assert.equal(style(boulevard, 'glass'), 1);
  assert.equal(style(motel, 'glass'), 2);
});

test('the shadow map that follows the walker sees around them, and holds still to the texel', () => {
  const S = skyState(16.2, motel.sky, 'cobalt');
  const clip = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const at = [-10, 0, -5];
  const near = nearShadowMatrix(S, motel.shadowBox, at, 40, 4096);
  const c = clip(near.m, at);
  assert.ok(Math.abs(c[0]) < 0.01 && Math.abs(c[1]) < 0.01 && c[2] > 0 && c[2] < 1, 'centered on the walker');
  // Depth runs the same way as the whole-box map's, over every caster.
  const far = shadowMatrix(S, motel.shadowBox);
  assert.ok(Math.abs(near.depthScale - far.depthScale) < 1e-12);
  const top = clip(near.m, [-10, 20, -5]);
  assert.ok(top[2] >= 0 && top[2] < c[2], 'a palm top is nearer the sun than its foot');
  // Moving a hair does not shift the map by less than a texel.
  const a = nearShadowMatrix(S, motel.shadowBox, [-10.001, 0, -5], 40, 4096).m;
  const texel = 2 / 4096;
  for (const k of [12, 13]) {
    const shift = (a[k] - near.m[k]) / texel;
    assert.ok(Math.abs(shift - Math.round(shift)) < 1e-6);
  }
});

test("the live painter mixes shade with the painter's own numbers", () => {
  const S = skyState(16.2, motel.sky, 'cobalt');
  const live = packShades(motel, S);
  const r = new Renderer(motel, { shadowSize: 64 });
  r.setTime(16.2);
  for (let m = 0; m < motel.materials.length; m++) {
    for (let k = 0; k < 3; k++) {
      for (let c = 0; c < 3; c++) assert.ok(Math.abs(live[m * 12 + k * 4 + c] - r.mShade[m * 9 + k * 3 + c]) < 1e-6);
    }
  }
});

test('the sun sees the whole shadow box, and a frame is one block of uniforms', () => {
  const S = skyState(16.2, motel.sky, 'cobalt');
  const sh = shadowMatrix(S, motel.shadowBox);
  const { min, max } = motel.shadowBox;
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    const m = sh.m;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    assert.ok(x >= -1.000001 && x <= 1.000001 && y >= -1.000001 && y <= 1.000001 && z >= 0 && z <= 1, `corner ${i}`);
  }
  const cam = { eye: [-56, 1.6, 1.5], target: [-46, 1.6, 1.5], fovY: 30, shift: 0.4 };
  const frame = (look, mirror) => packFrame({ cam, W: 300, H: 200, S: skyState(16.2, motel.sky, look), look, shadow: sh, shadowSize: 4096, rippleT: 1, lightCount: 32, hasPool: true, mirror });
  const f = frame('cobalt', false);
  assert.equal(f.length, FRAME_FLOATS);
  assert.deepEqual(Array.from(f.subarray(48, 51)), cam.eye.map(Math.fround));
  assert.equal(f[145], 1, 'cobalt mixes its shade');
  assert.equal(frame('pastel', false)[145], 0, 'pastel does not');
  assert.equal(frame('cobalt', true)[139], 1, 'the mirrored pass knows it');
  assert.ok(SCENE_WGSL.includes('fn fs_main') && SCENE_WGSL.includes('fn vs_shadow') && POST_WGSL.includes('fn fs_final'));
});

test('a walker can climb the motel stairs, but not walk through walls or into the pool', () => {
  const W = buildWalk(motel);
  const B = motel.layout.block;
  // From the parking lot up the stairs at the north end to the walkway.
  let p = standAt(W, -1, B.z0 - 6);
  assert.ok(p && p.y < 0.5);
  for (let i = 0; i < 60; i++) p = walk(W, p, 0, 0.25);
  assert.ok(Math.abs(p.y - B.F1) < 0.05, `walkway at ${B.F1}, walker at ${p.y}`);
  // Along the ground floor, straight at the rooms: stopped by the wall.
  let q = standAt(W, -3, 0);
  for (let i = 0; i < 40; i++) q = walk(W, q, 0.25, 0);
  assert.ok(q.x < -WALKER.radius + 0.05, `walked into the rooms (x ${q.x})`);
  // At the pool: never onto the water.
  const pool = motel.pool;
  let r = standAt(W, pool.x0 - 1.5, (pool.z0 + pool.z1) / 2);
  for (let i = 0; i < 40; i++) r = walk(W, r, 0.25, 0);
  assert.ok(r.x < pool.x0, 'walked into the pool');
  assert.ok(Number.isNaN(floorAt(W, 1e6, 0, 10)), 'off the map there is no floor');
});

test('from the end of a dock a walker goes up the gangway to the quay, and never into the harbor', () => {
  const marina = buildPlace('marina', propsAt('marina', 16.2), 'cobalt');
  const W = buildWalk(marina);
  const v = marina.views[PLACES.marina.START];
  let p = standAt(W, v.eye[0], v.eye[2], v.eye[1]);
  assert.ok(p && Math.abs(p.y - 0.45) < 0.01, 'the walk starts on the dock');
  for (let i = 0; i < 420; i++) p = walk(W, p, 0.25, 0);
  assert.ok(Math.abs(p.y - 1.4) < 0.01 && p.x > 0.6, `up on the quay (at ${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  // Sideways off the dock, between two fingers: stopped at the edge.
  let q = standAt(W, -50, -30, 1);
  for (let i = 0; i < 40; i++) q = walk(W, q, 0, 0.25);
  assert.ok(q.z < -28.8 + W.cell, `walked off the dock (z ${q.z.toFixed(2)})`);
});

test('a walker put down inside a railing steps out of it, and never stands on leaves', () => {
  const house = buildPlace('house', propsAt('house', 16.2), 'cobalt');
  const W = buildWalk(house);
  // Two of the house's pictures are taken from right against a railing.
  for (const view of ['hero', 'terrace']) {
    const v = house.views[view];
    const p = standAt(W, v.eye[0], v.eye[2], v.eye[1]);
    let far = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let q = p;
      for (let i = 0; i < 20; i++) q = walk(W, q, dx * 0.25, dz * 0.25);
      far = Math.max(far, Math.hypot(q.x - p.x, q.z - p.z));
    }
    assert.ok(far > 2, `stuck at the ${view} picture`);
  }
  // Under a palm's fronds, the lawn is still the floor.
  const v = house.views.drive;
  assert.equal(standAt(W, v.eye[0], v.eye[2], v.eye[1]).y, 0);
});

test('every walk starts somewhere a walker can leave', () => {
  for (const id of ORDER) {
    const world = buildPlace(id, propsAt(id, 16.2), 'cobalt');
    const W = buildWalk(world);
    const v = world.views[PLACES[id].START ?? PLACES[id].VIEWS[0]];
    const start = standAt(W, v.eye[0], v.eye[2], v.eye[1]);
    assert.ok(start, `${id}: nowhere to stand`);
    // Flood out from the start, a cell at a time, until there is plenty.
    const key = (p) => `${Math.floor((p.x - W.x0) / W.cell)},${Math.floor((p.z - W.z0) / W.cell)},${Math.round(p.y * 4)}`;
    const seen = new Set([key(start)]);
    const queue = [start];
    while (queue.length && seen.size < 4000) {
      const p = queue.shift();
      for (const [dx, dz] of [[W.cell, 0], [-W.cell, 0], [0, W.cell], [0, -W.cell]]) {
        const q = walk(W, p, dx, dz);
        if (!seen.has(key(q))) {
          seen.add(key(q));
          queue.push(q);
        }
      }
    }
    assert.ok(seen.size >= 4000, `${id}: only ${seen.size} cells to walk`);
  }
});
