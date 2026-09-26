#!/usr/bin/env node
// Bundle the site into one self-contained HTML file, docs/index.html: the
// page script, with the painter (the whole engine, as a Web Worker) inlined
// into it as a string. Also builds the older, knob-covered viewer as
// docs/workshop.html, and the live motel, painted on the GPU, as
// docs/live.html.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const bundle = async (entry, define = {}) => {
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: 'es2020',
    legalComments: 'none',
    define,
  });
  return res.outputFiles[0].text;
};

const page = (template, js, out) => {
  const safe = js.replace(/<\/script/gi, '<\\/script');
  const html = readFileSync(template, 'utf8').replace('/*ENGINE*/', () => safe);
  writeFileSync(out, html);
  console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
};

mkdirSync('docs', { recursive: true });
const worker = await bundle('web/worker.js');
page('web/site.html', await bundle('web/site.js', { WORKER_SOURCE: JSON.stringify(worker) }), 'docs/index.html');
page('web/viewer.html', await bundle('web/viewer.js'), 'docs/workshop.html');
page('web/live.html', await bundle('web/live.js'), 'docs/live.html');
