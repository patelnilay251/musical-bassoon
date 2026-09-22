#!/usr/bin/env node
// Render the picture book: a cover and ten postcards with ray-traced
// shadows, written as PNGs to docs/book/ and laid out in docs/book.html.
// Pages render in parallel, one per CPU core. --inline FILE also writes a
// single self-contained HTML with the images embedded.
//   node scripts/book.js [--w 1500 --h 1000 --ss 3] [--inline book.html]

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { buildPlace, PLACES } from '../src/scenes/index.js';
import { Renderer, toRGBA } from '../src/render.js';
import { fit } from '../src/camera.js';
import { encodePNG } from '../src/png.js';
import { TITLE, SUBTITLE, COVER, PAGES, clock } from '../book/story.js';

const shots = [{ ...COVER, name: 'cover' }, ...PAGES.map((p, i) => ({ ...p, name: `page-${String(i + 1).padStart(2, '0')}` }))];

function shoot(shot, W, H, SS) {
  const world = buildPlace(shot.place, shot.props);
  const r = new Renderer(world, { shadowRays: true, shadowSize: 4096 });
  const t0 = performance.now();
  r.setTime(shot.hours);
  r.setCamera(fit(world.views[shot.view], W / H), W, H, SS);
  const png = encodePNG(toRGBA(r.render(), W, H), W, H);
  const ms = performance.now() - t0;
  writeFileSync(`docs/book/${shot.name}.png`, png);
  return { name: shot.name, ms, tris: world.mesh.count, kb: png.length / 1024 };
}

if (!isMainThread) {
  const { i, W, H, SS } = workerData;
  parentPort.postMessage(shoot(shots[i], W, H, SS));
} else {
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
  for (const f of readdirSync('docs/book')) if (f.endsWith('.png')) unlinkSync(`docs/book/${f}`);

  // A small pool of threads, one page each.
  const results = new Array(shots.length);
  let next = 0;
  const run = () =>
    new Promise((done, fail) => {
      const go = () => {
        if (next >= shots.length) return done();
        const i = next++;
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { i, W, H, SS } });
        w.once('message', (res) => {
          results[i] = res;
          const s = shots[i];
          console.log(`${res.name}: ${PLACES[s.place].NAME}, ${clock(s.hours)}, ${(res.ms / 1000).toFixed(1)} s, ${res.kb.toFixed(0)} KB`);
        });
        w.once('error', fail);
        w.once('exit', go);
      };
      go();
    });
  const t0 = performance.now();
  await Promise.all(Array.from({ length: Math.min(shots.length, cpus().length) }, run));
  console.log(`${shots.length} pictures in ${((performance.now() - t0) / 1000).toFixed(0)} s`);

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const embedded = (name) => `data:image/png;base64,${readFileSync(`docs/book/${name}.png`).toString('base64')}`;
  const linked = (name) => `book/${name}.png`;
  const spreads = (src) =>
    PAGES.map(
      (p, i) => `<section class="page">
  <div class="spread${i % 2 ? ' flip' : ''}">
    <div class="picture"><img src="${src(shots[i + 1].name)}" alt="${esc(p.alt)}" loading="lazy"></div>
    <div class="words">
      <div class="time">${esc(PLACES[p.place].NAME)} &middot; ${clock(p.hours)}</div>
      <p>${esc(p.text)}</p>
      <div class="folio">${i + 1}</div>
    </div>
  </div>
</section>`,
    ).join('\n');
  const pages = results.slice(1);
  const avg = pages.reduce((s, p) => s + p.ms, 0) / pages.length / 1000;
  const tris = Math.round(pages.reduce((s, p) => s + p.tris, 0) / pages.length / 1000) * 1000;
  const html = (src) =>
    readFileSync('web/book.html', 'utf8')
      .replaceAll('{{TITLE}}', () => esc(TITLE))
      .replace('{{COVER}}', () => src('cover'))
      .replace('{{COVER_ALT}}', () => esc(COVER.alt))
      .replace('{{SUBTITLE}}', () => esc(SUBTITLE))
      .replace('{{PAGES}}', () => spreads(src))
      .replace('{{W}}', String(W))
      .replace('{{H}}', String(H))
      .replace('{{SAMPLES}}', String(SS * SS))
      .replace('{{TRIS}}', tris.toLocaleString('en-US'))
      .replace('{{SECONDS}}', avg.toFixed(0));
  writeFileSync('docs/book.html', html(linked));
  console.log('docs/book.html');
  if (a.inline) {
    const out = html(embedded);
    writeFileSync(a.inline, out);
    console.log(`${a.inline}: ${(out.length / 1024 / 1024).toFixed(1)} MB, self-contained`);
  }
}
