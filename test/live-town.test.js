import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlace, PLACES, ORDER } from '../src/scenes/index.js';
import { propsAt } from '../src/visitor.js';
import { DISTANT } from '../src/mesh.js';
import { Town, LAYOUT, BOULEVARD, placeAt, inside } from '../src/live/town.js';
import { buildGround } from '../src/live/ground.js';
import { packMesh, packWater, packLampGrid, packMaterials, boxInView, MATERIAL_FLOATS } from '../src/live/pack.js';
import { TownWalk, walk, standAt, floorAt } from '../src/live/walk.js';
import { addDetail } from '../src/live/detail.js';

// One town for all the tests: the ground, then every place, at 4:12 pm.
const town = new Town('cobalt');
town.setGround(buildGround(town));
for (const id of ORDER) town.addPlace(id, 16.2);
const grid = new TownWalk(town);

test('the five places lie along the coast, apart, each where the town says', () => {
  const outlines = Object.entries(LAYOUT);
  for (const [id, L] of outlines) {
    // Every corner of a place's ground is in no other place's ground.
    for (const [other, M] of outlines) {
      if (other === id) continue;
      for (const [x, z] of L.ground) assert.ok(!inside(M.ground, x, z, -0.5), `${id} runs into ${other}`);
    }
    // The place's own views stand in it, moved by where it is.
    const own = buildPlace(id, propsAt(id, 16.2), 'cobalt');
    for (const [name, v] of Object.entries(own.views)) {
      const t = town.views[`${id}:${name}`];
      assert.deepEqual(t.eye, v.eye.map((c, k) => c + L.at[k]), `${id}:${name}`);
    }
    const start = town.views[town.places[id].start];
    assert.equal(placeAt(start.eye[0], start.eye[2]), id, `${id}'s walk starts in it`);
  }
  // North to south, as the coast runs.
  const zs = ['house', 'marina', 'beach', 'boulevard', 'motel'].map((id) => LAYOUT[id].at[2]);
  assert.deepEqual([...zs].sort((a, b) => a - b), zs);
});

test('a place in town is the place: its paints, its own objects, laid from where it stands', () => {
  for (const id of ORDER) {
    const own = addDetail(buildPlace(id, propsAt(id, 16.2), 'cobalt'));
    const base = town.blocks[id];
    own.materials.forEach((m, i) => {
      const t = town.materials[base + i];
      assert.equal(t.name, m.name);
      assert.equal(t.color, m.color);
      assert.deepEqual(t.origin, LAYOUT[id].at, `${id}'s ${m.name} is laid from the place`);
    });
    // Only its own materials, and only its own open water left out.
    const chunk = town.chunks.get(id);
    for (let t = 0; t < chunk.mesh.count; t++) {
      const m = chunk.mesh.mat[t] - base;
      assert.ok(m >= 0 && m < own.materials.length);
      assert.notEqual(own.materials[m].kind, 'harbor', `${id} brought its own sea`);
      assert.ok(!(chunk.mesh.flags[t] & DISTANT), `${id} brought its own horizon`);
    }
    // Where the painter's pieces of pattern and grain are laid from goes to the GPU.
    const { data } = packMaterials(town);
    const f = new Float32Array(data);
    assert.deepEqual(Array.from(f.subarray((base + 1) * MATERIAL_FLOATS + 21, (base + 1) * MATERIAL_FLOATS + 24)), LAYOUT[id].at.map(Math.fround));
  }
});

test('standing things come into town whole or not at all: no shop is cut open at the boulevard', () => {
  // Every upright wall the boulevard keeps belongs to a closed box: its
  // shops have all four walls.
  const c = town.chunks.get('boulevard');
  const m = c.mesh;
  const walls = new Map();
  for (let t = 0; t < m.count; t++) {
    const name = town.materials[m.mat[t]].name;
    if (!['stucco', 'salmon', 'mint', 'butter', 'skyBlue', 'lilac'].includes(name) || Math.abs(m.fn[t * 3 + 1]) > 0.01) continue;
    const key = `${m.obj[t]}`;
    const dirs = walls.get(key) ?? new Set();
    dirs.add(`${Math.round(m.fn[t * 3] * 4)},${Math.round(m.fn[t * 3 + 2] * 4)}`);
    walls.set(key, dirs);
  }
  const open = [...walls.entries()].filter(([, d]) => d.size < 4);
  assert.ok(walls.size > 20);
  assert.equal(open.length, 0, `shops with a wall missing: ${open.map(([k]) => k).join(', ')}`);
});

test('one sea: the beach waves outside the breakwater, the marina waves inside, each laid from its place', () => {
  const beach = buildPlace('beach', {}, 'cobalt');
  const marina = buildPlace('marina', {}, 'cobalt');
  const f = packWater(town);
  const waves = (at) => Array.from({ length: 4 }, (_, k) => Array.from(f.subarray(at + k * 4, at + k * 4 + 4)));
  const expect = (list) => list.map((w) => [w.kx, w.kz, w.w, w.p].map(Math.fround));
  assert.deepEqual(waves(92), expect(beach.water.waves));
  assert.deepEqual(waves(208), expect(marina.water.waves));
  assert.deepEqual(Array.from(f.subarray(228, 232)), [LAYOUT.beach.at[0], LAYOUT.beach.at[2], LAYOUT.marina.at[0], LAYOUT.marina.at[2]]);
  // The pools' ripples are laid from their places too.
  assert.equal(f[88], 2);
  const pools = town.pools;
  pools.forEach((p, i) => {
    assert.equal(f[i * 44 + 7], p.origin[0]);
    assert.equal(f[i * 44 + 11], p.origin[1]);
  });
  assert.deepEqual(pools.map((p) => p.origin).sort(), [LAYOUT.motel.at, LAYOUT.house.at].map((a) => [a[0], a[2]]).sort());
});

test('every lamp lights every square of ground it can reach', () => {
  const lights = town.lights;
  const g = packLampGrid(lights);
  const f = new Float32Array(g.buffer);
  const [x0, z0, cell] = [f[0], f[1], f[2]];
  const nx = g[3];
  const nz = g[4];
  const listed = (x, z) => {
    const i = Math.floor((x - x0) / cell);
    const j = Math.floor((z - z0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return new Set();
    const at = 8 + (j * nx + i) * 2;
    return new Set(g.subarray(g[at], g[at] + g[at + 1]));
  };
  // Points in reach of each lamp (as the shader measures it) find it listed.
  let checked = 0;
  lights.forEach((L, k) => {
    for (const [dx, dz] of [[0, 0], [1, 0], [-0.7, 0.7], [0, -1], [-1, 0]]) {
      const x = L.p[0] + dx * L.r * 3.99;
      const z = L.p[2] + dz * L.r * 3.99;
      assert.ok(listed(x, z).has(k), `lamp ${k} missing at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      checked++;
    }
  });
  assert.ok(checked > 1000);
  // And a square lists no more than it should: nothing out of all reach.
  for (let j = 0; j < nz; j += 7) {
    for (let i = 0; i < nx; i += 5) {
      const at = 8 + (j * nx + i) * 2;
      for (const k of g.subarray(g[at], g[at] + g[at + 1])) {
        const L = lights[k];
        const cx = Math.max(x0 + i * cell, Math.min(L.p[0], x0 + (i + 1) * cell));
        const cz = Math.max(z0 + j * cell, Math.min(L.p[2], z0 + (j + 1) * cell));
        assert.ok(Math.hypot(cx - L.p[0], cz - L.p[2]) <= L.r * 4 * Math.SQRT2 + 1e-3);
      }
    }
  }
});

test('the town packs square by square: every triangle once, each run inside its bounds', () => {
  const ground = town.chunks.get('ground');
  const sea = new Set(town.materials.flatMap((m, i) => (m.kind === 'harbor' ? [i] : [])));
  const { data, count, single, parts } = packMesh(ground.mesh, town.shadowBox, null, { bin: 96, sea });
  const f = new Float32Array(data);
  const u = new Uint32Array(data);
  let covered = 0;
  let prevEnd = 0;
  for (const p of parts) {
    assert.equal(p.first, prevEnd, 'runs follow one another');
    prevEnd = p.first + p.count;
    covered += p.count;
    assert.equal(p.double, p.first >= single);
    for (let v = p.first; v < p.first + p.count; v++) {
      for (let c = 0; c < 3; c++) {
        const x = f[v * 10 + c];
        assert.ok(x >= p.box.min[c] - 1e-3 && x <= p.box.max[c] + 1e-3);
      }
      if (v % 3 === 0) assert.equal(sea.has(u[v * 10 + 8] & 0xffff), p.sea);
    }
  }
  assert.equal(covered, count);
  assert.ok(parts.some((p) => p.sea) && parts.some((p) => !p.sea));
  // Big triangles are cut on one grid, so the pieces keep the area.
  const area = (P) => {
    const e0 = [P[3] - P[0], P[4] - P[1], P[5] - P[2]];
    const e1 = [P[6] - P[0], P[7] - P[1], P[8] - P[2]];
    return Math.hypot(e0[1] * e1[2] - e0[2] * e1[1], e0[2] * e1[0] - e0[0] * e1[2], e0[0] * e1[1] - e0[1] * e1[0]) / 2;
  };
  let a = 0;
  let b = 0;
  for (let t = 0; t < count / 3; t++) a += area([0, 1, 2].flatMap((k) => [f[(t * 3 + k) * 10], f[(t * 3 + k) * 10 + 1], f[(t * 3 + k) * 10 + 2]]));
  for (let t = 0; t < ground.mesh.count; t++) b += area(Array.from(ground.mesh.pos.subarray(t * 9, t * 9 + 9)));
  assert.ok(Math.abs(a - b) / b < 1e-5);
});

test('a camera leaves out only runs it cannot see', () => {
  const vp = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.5, -1, 0, 0, 0.05, 0]); // looking down -z
  assert.ok(boxInView(vp, { min: [-1, -1, -20], max: [1, 1, -10] }));
  assert.ok(!boxInView(vp, { min: [-1, -1, 10], max: [1, 1, 20] }), 'behind');
  assert.ok(!boxInView(vp, { min: [30, -1, -20], max: [40, 1, -10] }), 'off to the right');
  assert.ok(!boxInView(vp, { min: [-1, -1, -20], max: [1, 1, -10] }, [0.5, 1, -1, 1]), 'outside the painted part');
});

test('the coast road runs unbroken from the house to the motel', () => {
  for (const x of [0.6, 3.5, -9.4]) {
    let pos = standAt(grid, x, -540, 20);
    let y = pos.y;
    for (let z = -540; z < 700; z += 0.5) {
      const next = walk(grid, pos, x - pos.x, 0.5);
      assert.ok(next.z - pos.z > 0.4, `stopped at x ${x}, z ${pos.z.toFixed(1)}`);
      assert.ok(Math.abs(next.y - y) < 0.4, `a step of ${(next.y - y).toFixed(2)} at z ${pos.z.toFixed(1)}`);
      y = next.y;
      pos = next;
    }
  }
});

test('from every place a walker can reach the coast road', () => {
  for (const id of ORDER) {
    const v = town.views[town.places[id].start];
    const s = standAt(grid, v.eye[0], v.eye[2], v.eye[1]);
    // Out over walkable ground a meter at a time, within the place (and
    // the boulevard's foot), until the road.
    const key = (p) => `${Math.round(p.x)},${Math.round(p.z)},${Math.round(p.y * 2)}`;
    const seen = new Set([key(s)]);
    let front = [s];
    let reached = false;
    while (front.length && !reached) {
      const next = [];
      for (const p of front) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const tx = Math.round(p.x) + dx;
          const tz = Math.round(p.z) + dz;
          const q = walk(grid, p, tx - p.x, tz - p.z);
          if (Math.hypot(q.x - tx, q.z - tz) > 0.05) continue;
          if (!inside(LAYOUT[id].ground, q.x, q.z, 12) && !inside(BOULEVARD.footOutline, q.x, q.z, 1)) continue;
          const k = key(q);
          if (seen.has(k)) continue;
          seen.add(k);
          if (Math.abs(q.x) < 3) reached = true;
          next.push(q);
        }
      }
      front = next;
    }
    assert.ok(reached, `${id}: no way from ${town.places[id].start} to the road`);
  }
});

test('down the beach steps to the sand, and through the house gate: the openings a walker needs', () => {
  // The rail stops either side of each flight of steps.
  const beach = town.chunks.get('beach').mesh;
  const rail = new Set(town.materials.flatMap((m, i) => (m.name === 'rail' && m.place === 'beach' ? [i] : [])));
  const S = buildPlace('beach', {}, 'cobalt').layout.steps;
  const at = LAYOUT.beach.at;
  for (const zs of S.z) {
    for (let t = 0; t < beach.count; t++) {
      if (!rail.has(beach.mat[t])) continue;
      const xs = [0, 1, 2].map((k) => beach.pos[t * 9 + k * 3] - at[0]);
      const ys = [0, 1, 2].map((k) => beach.pos[t * 9 + k * 3 + 1] - at[1]);
      const zz = [0, 1, 2].map((k) => beach.pos[t * 9 + k * 3 + 2] - at[2]);
      if (Math.min(...xs) < S.x - 0.7 || Math.max(...xs) > S.x + 0.4 || Math.min(...ys) < S.y) continue;
      assert.ok(Math.max(...zz) <= zs - S.half + 1e-6 || Math.min(...zz) >= zs + S.half - 1e-6, `rail across the steps at ${zs}`);
    }
  }
  // The gate: floor all the way from the drive to the sidewalk.
  const zGate = LAYOUT.house.at[2];
  for (let x = -12; x <= -9; x += 0.1) assert.ok(!Number.isNaN(floorAt(grid, x, zGate, 7)), `no floor at x ${x.toFixed(1)}`);
});

test('the painted places are the places they were: the town adds and moves, and changes nothing', () => {
  for (const id of Object.keys(PLACES)) {
    const a = buildPlace(id, {}, 'cobalt');
    const b = buildPlace(id, {}, 'cobalt');
    addDetail(b);
    assert.deepEqual(Array.from(a.mesh.pos.subarray(0, 900)), Array.from(b.mesh.pos.subarray(0, 900)));
    assert.equal(a.mesh.count, b.mesh.count);
  }
});
