#!/usr/bin/env node
// Render the picture book: a cover and ten postcards with ray-traced
// shadows, in each of the looks (src/looks.js), written as PNGs to
// docs/book/<look>/ and laid out in docs/book.html, which turns from one
// look to the other. Pages render in parallel, one per CPU core. --looks
// renders only some of them. --inline FILE also writes a single
// self-contained HTML with the images of one look (--look) embedded.
//   node scripts/book.js [--w 1500 --h 1000 --ss 3] [--looks pastel,cobalt] [--inline book.html --look cobalt]

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { buildPlace, PLACES } from '../src/scenes/index.js';
import { Renderer, toRGBA } from '../src/render.js';
import { fit } from '../src/camera.js';
import { encodePNG } from '../src/png.js';
import { TITLE, SUBTITLE, COVER, PAGES, clock } from '../book/story.js';
import { LOOKS, LOOK_NAMES, DEFAULT_LOOK } from '../src/looks.js';

const shots = [{ ...COVER, name: 'cover' }, ...PAGES.map((p, i) => ({ ...p, name: `page-${String(i + 1).padStart(2, '0')}` }))];

function shoot(shot, look, W, H, SS) {
  const world = buildPlace(shot.place, shot.props, look);
  const r = new Renderer(world, { shadowRays: true, shadowSize: 4096 });
  const t0 = performance.now();
  r.setTime(shot.hours);
  r.setCamera(fit(world.views[shot.view], W / H), W, H, SS);
  const png = encodePNG(toRGBA(r.render(), W, H, undefined, 0, 0, W, H, r.look.grain), W, H);
  const ms = performance.now() - t0;
  writeFileSync(`docs/book/${look}/${shot.name}.png`, png);
  return { name: shot.name, look, ms, tris: world.mesh.count, kb: png.length / 1024 };
}

if (!isMainThread) {
  const { i, look, W, H, SS } = workerData;
  parentPort.postMessage(shoot(shots[i], look, W, H, SS));
} else {
  const { values: a } = parseArgs({
    options: {
      w: { type: 'string', default: '1500' },
      h: { type: 'string', default: '1000' },
      ss: { type: 'string', default: '3' },
      looks: { type: 'string', default: LOOK_NAMES.join(',') },
      inline: { type: 'string' },
      look: { type: 'string', default: DEFAULT_LOOK },
    },
  });
  const W = Number(a.w);
  const H = Number(a.h);
  const SS = Number(a.ss);
  const looks = a.looks.split(',').filter(Boolean);
  for (const l of [...looks, a.look]) if (!LOOKS[l]) throw new Error(`no such look: ${l} (try ${LOOK_NAMES.join(', ')})`);
  mkdirSync('docs/book', { recursive: true });
  // Pages from before the book had looks, and the looks about to be redone.
  for (const f of readdirSync('docs/book')) if (f.endsWith('.png')) unlinkSync(`docs/book/${f}`);
  for (const l of looks) {
    mkdirSync(`docs/book/${l}`, { recursive: true });
    for (const f of readdirSync(`docs/book/${l}`)) if (f.endsWith('.png')) unlinkSync(`docs/book/${l}/${f}`);
  }

  // A small pool of threads, one page each.
  const jobs = looks.flatMap((look) => shots.map((_, i) => ({ i, look })));
  const results = [];
  let next = 0;
  const run = () =>
    new Promise((done, fail) => {
      const go = () => {
        if (next >= jobs.length) return done();
        const { i, look } = jobs[next++];
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: { i, look, W, H, SS } });
        w.once('message', (res) => {
          results.push({ ...res, i });
          const s = shots[i];
          console.log(`${look}/${res.name}: ${PLACES[s.place].NAME}, ${clock(s.hours)}, ${(res.ms / 1000).toFixed(1)} s, ${res.kb.toFixed(0)} KB`);
        });
        w.once('error', fail);
        w.once('exit', go);
      };
      go();
    });
  const t0 = performance.now();
  await Promise.all(Array.from({ length: Math.min(jobs.length, cpus().length) }, run));
  console.log(`${jobs.length} pictures in ${((performance.now() - t0) / 1000).toFixed(0)} s`);

  // The page shows the default look (or whichever the reader picked last,
  // see web/book.html) and offers every look that has its pictures.
  const shown = LOOK_NAMES.filter((l) => shots.every((s) => existsSync(`docs/book/${l}/${s.name}.png`)));
  const base = shown.includes(DEFAULT_LOOK) ? DEFAULT_LOOK : shown[0];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const embedded = (name) => `data:image/png;base64,${readFileSync(`docs/book/${a.look}/${name}.png`).toString('base64')}`;
  const linked = (name) => `book/${base}/${name}.png`;
  const spreads = (src) =>
    PAGES.map(
      (p, i) => `<section class="page">
  <div class="spread${i % 2 ? ' flip' : ''}">
    <div class="picture"><img src="${src(shots[i + 1].name)}" data-card="${shots[i + 1].name}" alt="${esc(p.alt)}" loading="lazy"></div>
    <div class="words">
      <div class="time">${esc(PLACES[p.place].NAME)} &middot; ${clock(p.hours)}</div>
      <p>${esc(p.text)}</p>
      <div class="folio">${i + 1}</div>
    </div>
  </div>
</section>`,
    ).join('\n');
  const pages = results.filter((p) => p.i > 0);
  const avg = pages.reduce((s, p) => s + p.ms, 0) / pages.length / 1000;
  const tris = Math.round(pages.reduce((s, p) => s + p.tris, 0) / pages.length / 1000) * 1000;
  const switcher = (on) => (on && shown.length > 1 ? shown.map((l) => `<button type="button" data-look="${l}" aria-pressed="${l === base}">${esc(LOOKS[l].title)}</button>`).join('') : '');
  const html = (src, on) =>
    readFileSync('web/book.html', 'utf8')
      .replaceAll('{{TITLE}}', () => esc(TITLE))
      .replace('{{LOOKS}}', () => switcher(on))
      .replace('{{COVER}}', () => src('cover'))
      .replace('{{COVER_ALT}}', () => esc(COVER.alt))
      .replace('{{SUBTITLE}}', () => esc(SUBTITLE))
      .replace('{{PAGES}}', () => spreads(src))
      .replace('{{W}}', String(W))
      .replace('{{H}}', String(H))
      .replace('{{SAMPLES}}', String(SS * SS))
      .replace('{{TRIS}}', tris.toLocaleString('en-US'))
      .replace('{{SECONDS}}', avg.toFixed(0));
  writeFileSync('docs/book.html', html(linked, true));
  console.log(`docs/book.html: ${shown.join(' and ')}`);
  if (a.inline) {
    const out = html(embedded, false);
    writeFileSync(a.inline, out);
    console.log(`${a.inline}: ${(out.length / 1024 / 1024).toFixed(1)} MB, self-contained`);
  }
}
