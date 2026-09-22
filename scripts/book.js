#!/usr/bin/env node
// Render the picture book: cover + eight pages with ray-traced shadows,
// written as PNGs to docs/book/ and laid out in docs/book.html.
// --inline FILE also writes a single self-contained HTML with the images
// embedded, for sharing the book as one file.
//   node scripts/book.js [--w 1500 --h 1000 --ss 3] [--inline book.html]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildWorld } from '../src/world/index.js';
import { Renderer, toRGBA } from '../src/render.js';
import { encodePNG } from '../src/png.js';
import { SEED, TITLE, SUBTITLE, COVER, PAGES, clock } from '../book/story.js';

const { values: a } = parseArgs({
  options: {
    w: { type: 'string', default: '1500' },
    h: { type: 'string', default: '1000' },
    ss: { type: 'string', default: '3' },
    inline: { type: 'string' },
  },
});
const W = Number(a.w);
const H = Number(a.h);
const SS = Number(a.ss);

mkdirSync('docs/book', { recursive: true });

function shoot(shot, name) {
  const world = buildWorld(SEED, shot.props);
  const r = new Renderer(world, { shadowRays: true, shadowSize: 4096 });
  const t0 = performance.now();
  r.setTime(shot.hours);
  r.setCamera(shot.camera(world.layout), W, H, SS);
  const png = encodePNG(toRGBA(r.render(), W, H), W, H);
  const ms = performance.now() - t0;
  writeFileSync(`docs/book/${name}.png`, png);
  console.log(`${name}: ${clock(shot.hours)}, ${(ms / 1000).toFixed(1)} s, ${(png.length / 1024).toFixed(0)} KB`);
  return { png, ms, tris: world.mesh.count, name };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const embedded = (shot) => `data:image/png;base64,${shot.png.toString('base64')}`;
const linked = (shot) => `book/${shot.name}.png`;

const cover = shoot(COVER, 'cover');
const pages = PAGES.map((p, i) => ({ ...shoot(p, `page-${String(i + 1).padStart(2, '0')}`), page: p, i }));

const spreads = (src) =>
  pages
    .map(
      (shot) => `<section class="page">
  <div class="spread${shot.i % 2 ? ' flip' : ''}">
    <div class="picture"><img src="${src(shot)}" alt="${esc(shot.page.alt)}"></div>
    <div class="words">
      <div class="time">${clock(shot.page.hours)}</div>
      <p>${esc(shot.page.text)}</p>
      <div class="folio">${shot.i + 1}</div>
    </div>
  </div>
</section>`,
    )
    .join('\n');

const avg = pages.reduce((s, p) => s + p.ms, 0) / pages.length / 1000;
const tris = Math.round(pages.reduce((s, p) => s + p.tris, 0) / pages.length / 100) * 100;
const page = (src) =>
  readFileSync('web/book.html', 'utf8')
    .replace('{{COVER}}', () => src(cover))
    .replace('{{COVER_ALT}}', () => esc(COVER.alt))
    .replace('{{TITLE}}', () => esc(TITLE))
    .replace('{{SUBTITLE}}', () => esc(SUBTITLE))
    .replace('{{PAGES}}', () => spreads(src))
    .replaceAll('{{SEED}}', String(SEED))
    .replace('{{W}}', String(W))
    .replace('{{H}}', String(H))
    .replace('{{SAMPLES}}', String(SS * SS))
    .replace('{{TRIS}}', tris.toLocaleString('en-US'))
    .replace('{{SECONDS}}', avg.toFixed(1));
writeFileSync('docs/book.html', page(linked));
console.log('docs/book.html');
if (a.inline) {
  const html = page(embedded);
  writeFileSync(a.inline, html);
  console.log(`${a.inline}: ${(html.length / 1024 / 1024).toFixed(1)} MB, self-contained`);
}
