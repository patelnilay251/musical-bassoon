#!/usr/bin/env node
// Bundle the engine + viewer into one self-contained HTML file (no network
// needed except optional web fonts): docs/index.html.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const res = await build({
  entryPoints: ['web/viewer.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2020',
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('web/viewer.html', 'utf8').replace('/*ENGINE*/', () => js);
mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', html);
console.log(`docs/index.html: ${(html.length / 1024).toFixed(0)} KB`);
