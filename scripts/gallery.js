#!/usr/bin/env node
// Contact sheets for the README, in each look, written to
// docs/gallery/<look>/:
//   town.png   every place in Paloma Bay
//   day.png    the motel from dawn to night
//   seeds.png  one rulebook, four houses
//   node scripts/gallery.js [--looks pastel,cobalt]

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildPlace } from '../src/scenes/index.js';
import { buildWorld } from '../src/world/index.js';
import { propsAt } from '../src/visitor.js';
import { Renderer, toRGBA } from '../src/render.js';
import { views } from '../src/views.js';
import { fit } from '../src/camera.js';
import { encodePNG } from '../src/png.js';
import { LOOKS, LOOK_NAMES } from '../src/looks.js';

const GAP = 6;

function sheet(cells, file, { W = 420, H = 280, cols = 4 } = {}) {
  const rows = Math.ceil(cells.length / cols);
  const SW = cols * W + (cols + 1) * GAP;
  const SH = rows * H + (rows + 1) * GAP;
  const out = new Uint8ClampedArray(SW * SH * 4).fill(255);
  cells.forEach(({ world, hours, view }, i) => {
    const r = new Renderer(world, { shadowSize: 2048 });
    r.setTime(hours);
    r.setCamera(fit(view, W / H), W, H, 3);
    const px = toRGBA(r.render(), W, H, undefined, 0, 0, W, H, r.look.grain);
    const ox = GAP + (i % cols) * (W + GAP);
    const oy = GAP + Math.floor(i / cols) * (H + GAP);
    for (let y = 0; y < H; y++) out.set(px.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * SW + ox) * 4);
  });
  writeFileSync(file, encodePNG(out, SW, SH));
  console.log(file);
}

const { values: a } = parseArgs({ options: { looks: { type: 'string', default: LOOK_NAMES.join(',') } } });
const looks = a.looks.split(',').filter(Boolean);
for (const l of looks) if (!LOOKS[l]) throw new Error(`no such look: ${l} (try ${LOOK_NAMES.join(', ')})`);
// Sheets from before the gallery had looks.
for (const f of ['town', 'day', 'seeds']) if (existsSync(`docs/gallery/${f}.png`)) unlinkSync(`docs/gallery/${f}.png`);

for (const look of looks) {
  const place = (id, view, hours) => {
    const world = buildPlace(id, propsAt(id, hours), look);
    return { world, hours, view: world.views[view] };
  };
  const dir = `docs/gallery/${look}`;
  mkdirSync(dir, { recursive: true });
  sheet(
    [
      place('motel', 'front', 16.2),
      place('boulevard', 'sunset', 18.6),
      place('beach', 'tower', 14.2),
      place('house', 'pool', 11.6),
      place('marina', 'harbor', 17.2),
      place('motel', 'walkway', 17.4),
      place('beach', 'sunset', 18.7),
      place('marina', 'slips', 15.8),
      place('boulevard', 'diner', 15.5),
    ],
    `${dir}/town.png`,
    { W: 480, H: 320, cols: 3 },
  );
  sheet(
    [4.85, 7.5, 10.5, 13.5, 16.5, 18.6, 19.4, 21.5].map((hours) => place('motel', 'front', hours)),
    `${dir}/day.png`,
  );
  sheet(
    [7, 42, 314, 2026].map((seed) => {
      const world = buildWorld(seed, {}, look);
      return { world, hours: 16.8, view: views(world.layout).hero };
    }),
    `${dir}/seeds.png`,
  );
}
