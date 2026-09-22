#!/usr/bin/env node
// Render one still to PNG.
//   node scripts/render.js --seed 1981 --time 16.5 --view hero --w 1500 --h 1000 --ss 3 --out still.png

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildWorld, DEFAULT_SEED } from '../src/world/index.js';
import { Renderer, toRGBA } from '../src/render.js';
import { views } from '../src/views.js';
import { encodePNG } from '../src/png.js';

const { values: a } = parseArgs({
  options: {
    seed: { type: 'string', default: String(DEFAULT_SEED) },
    time: { type: 'string', default: '16.5' },
    view: { type: 'string', default: 'hero' },
    w: { type: 'string', default: '1200' },
    h: { type: 'string', default: '800' },
    ss: { type: 'string', default: '2' },
    shadow: { type: 'string', default: '4096' },
    out: { type: 'string', default: 'still.png' },
  },
});

const t0 = performance.now();
const world = buildWorld(Number(a.seed));
const t1 = performance.now();
const r = new Renderer(world, { shadowSize: Number(a.shadow) });
const W = Number(a.w);
const H = Number(a.h);
r.setTime(Number(a.time));
r.setCamera(views(world.layout)[a.view], W, H, Number(a.ss));
const img = r.render();
const t2 = performance.now();
writeFileSync(a.out, encodePNG(toRGBA(img, W, H), W, H));
console.log(
  `${a.out}: ${world.mesh.count} triangles, world ${(t1 - t0).toFixed(0)} ms, render ${(t2 - t1).toFixed(0)} ms`,
);
