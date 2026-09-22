#!/usr/bin/env node
// Render one still of a place to PNG, with the visitor's traces for that hour.
//   node scripts/render.js --place motel --view front --time 16.5 --w 1500 --h 1000 --ss 3 --rays --out still.png
// Views: see VIEWS in each src/scenes/*.js (the house also has hero, sea,
// terrace, aerial, drive and low).

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildPlace, PLACES } from '../src/scenes/index.js';
import { propsAt } from '../src/visitor.js';
import { Renderer, toRGBA } from '../src/render.js';
import { fit } from '../src/camera.js';
import { encodePNG } from '../src/png.js';

const { values: a } = parseArgs({
  options: {
    place: { type: 'string', default: 'house' },
    view: { type: 'string' },
    time: { type: 'string', default: '16.5' },
    w: { type: 'string', default: '1200' },
    h: { type: 'string', default: '800' },
    ss: { type: 'string', default: '2' },
    shadow: { type: 'string', default: '4096' },
    rays: { type: 'boolean', default: false },
    out: { type: 'string', default: 'still.png' },
  },
});

if (!PLACES[a.place]) throw new Error(`no such place: ${a.place} (try ${Object.keys(PLACES).join(', ')})`);
const hours = Number(a.time);
const t0 = performance.now();
const world = buildPlace(a.place, propsAt(a.place, hours));
const t1 = performance.now();
const view = world.views[a.view ?? world.hero];
if (!view) throw new Error(`no view ${a.view} at ${a.place}: ${Object.keys(world.views).join(', ')}`);
const r = new Renderer(world, { shadowSize: Number(a.shadow), shadowRays: a.rays });
const W = Number(a.w);
const H = Number(a.h);
r.setTime(hours);
r.setCamera(fit(view, W / H), W, H, Number(a.ss));
const img = r.render();
const t2 = performance.now();
writeFileSync(a.out, encodePNG(toRGBA(img, W, H), W, H));
console.log(`${a.out}: ${world.mesh.count} triangles, world ${(t1 - t0).toFixed(0)} ms, render ${(t2 - t1).toFixed(0)} ms`);
