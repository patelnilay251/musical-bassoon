#!/usr/bin/env node
// Contact sheets for the README: one view through the day, and one view
// across several seeds. Written to docs/gallery/.

import { writeFileSync, mkdirSync } from 'node:fs';
import { buildWorld } from '../src/world/index.js';
import { Renderer, toRGBA } from '../src/render.js';
import { views } from '../src/views.js';
import { encodePNG } from '../src/png.js';

const W = 400;
const H = 267;
const COLS = 4;
const GAP = 6;

function sheet(cells, file) {
  const rows = Math.ceil(cells.length / COLS);
  const SW = COLS * W + (COLS + 1) * GAP;
  const SH = rows * H + (rows + 1) * GAP;
  const out = new Uint8ClampedArray(SW * SH * 4).fill(255);
  cells.forEach(({ seed, hours, view }, i) => {
    const world = buildWorld(seed);
    const r = new Renderer(world, { shadowSize: 2048 });
    r.setTime(hours);
    r.setCamera(views(world.layout)[view], W, H, 3);
    const px = toRGBA(r.render(), W, H);
    const ox = GAP + (i % COLS) * (W + GAP);
    const oy = GAP + Math.floor(i / COLS) * (H + GAP);
    for (let y = 0; y < H; y++) out.set(px.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * SW + ox) * 4);
  });
  writeFileSync(file, encodePNG(out, SW, SH));
  console.log(file);
}

mkdirSync('docs/gallery', { recursive: true });
sheet(
  [7, 10, 13, 16, 18.4, 19.2, 20, 21.5].map((hours) => ({ seed: 1981, hours, view: 'low' })),
  'docs/gallery/day.png',
);
sheet(
  [7, 42, 314, 2026].map((seed) => ({ seed, hours: 16.8, view: 'hero' })),
  'docs/gallery/seeds.png',
);
