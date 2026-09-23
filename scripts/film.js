// Render a film: every frame painted on every core and streamed in order
// into ffmpeg, with its soundtrack. Films live in film/<name>/ and tell
// this script their frame count, how to paint frame i at the output size,
// their soundtrack, and where they go.
//
//   node scripts/film.js --film day                  the film, to its place in docs/
//   node scripts/film.js --film attract --draft      a quick look at lower quality
//   node scripts/film.js --film day --from 19 --to 29        one stretch of it (seconds)
//   node scripts/film.js --film day --slice 3/20 --video-only --out c/slice-03.mp4
//                                                    one of 20 slices, for rendering
//                                                    on many machines at once
//   node scripts/film.js --film day --join c/ --out day.mp4
//                                                    join the slice-NN.mp4 files in c/,
//                                                    and add the sound
//   node scripts/film.js --film day --audio-only     just the soundtrack, as WAV
//
// Also: --crf n, --scale k (the attract mode's enlargement), --threads n,
// --look name (paint it in another of the looks in src/looks.js; each film
// keeps the one it was made in unless told).
// ffmpeg must be on the PATH, or named by the FFMPEG environment variable.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILMS = { attract: '../film/attract/index.js', day: '../film/day/index.js' };
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

if (isMainThread) await main();
else await work();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args.film ?? 'attract';
  if (!FILMS[name]) throw new Error(`no film "${name}" (have: ${Object.keys(FILMS).join(', ')})`);
  const film = await import(FILMS[name]);
  const { LOOKS } = await import('../src/looks.js');
  if (args.look !== undefined && !LOOKS[args.look]) throw new Error(`no look "${args.look}" (have: ${Object.keys(LOOKS).join(', ')})`);
  const opts = { draft: Boolean(args.draft), scale: args.scale, scan: args.scan === undefined ? undefined : Number(args.scan), look: args.look };
  const { FPS, FRAMES, DURATION } = film;
  const encode = { ...(opts.draft ? film.DRAFT : film.ENCODE), ...(args.crf ? { crf: Number(args.crf) } : {}) };
  const out = resolve(args.out ?? (opts.draft ? `${ROOT}/out/film/${name}-draft.mp4` : `${ROOT}/${film.OUT}`));
  mkdirSync(dirname(out), { recursive: true });

  if (args.join) return joinSlices(film, resolve(String(args.join)), out);

  // Which frames: a slice of n, or a stretch in seconds, or all of them.
  let from = 0;
  let to = FRAMES;
  if (args.slice) {
    const [k, n] = String(args.slice).split('/').map(Number);
    from = Math.round((k * FRAMES) / n);
    to = Math.round(((k + 1) * FRAMES) / n);
  } else {
    from = Math.max(0, Math.round(Number(args.from ?? 0) * FPS));
    to = Math.min(FRAMES, Math.round(Number(args.to ?? DURATION) * FPS));
  }

  // The soundtrack first: quick, and ffmpeg wants it as an input.
  let wav = null;
  if (!args['video-only']) {
    wav = out.replace(/\.mp4$/, '') + '.wav';
    const t0 = performance.now();
    writeFileSync(wav, film.soundtrack({ from: from / FPS, to: to / FPS }));
    console.log(`soundtrack: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    if (args['audio-only']) return;
  }

  const { W: OW, H: OH } = film.size(opts);
  const enc = spawn(FFMPEG, [...inputArgs(OW, OH, FPS), ...(wav ? ['-i', wav] : []), ...videoArgs(encode), ...(wav ? audioArgs() : []), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  enc.on('error', (e) => {
    console.error(`could not start ffmpeg (${FFMPEG}): ${e.message}\nInstall ffmpeg or set FFMPEG=/path/to/ffmpeg.`);
    process.exit(1);
  });
  const done = new Promise((res) => enc.on('close', res));
  const start = performance.now();
  await renderFrames(name, opts, from, to, FPS, async (rgb) => {
    if (!enc.stdin.write(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength))) await new Promise((res) => enc.stdin.once('drain', res));
  }, Number(args.threads ?? os.availableParallelism?.() ?? os.cpus().length));
  enc.stdin.end();
  const code = await done;
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  if (wav) rmSync(wav);
  const mb = statSync(out).size / 1e6;
  console.log(`\n${out}: ${to - from} frames, ${((to - from) / FPS).toFixed(1)} s, ${OW}x${OH}, ${mb.toFixed(1)} MB, in ${((performance.now() - start) / 1000).toFixed(0)} s`);
  if (!args.slice && !opts.draft && from === 0 && to === FRAMES && out === resolve(`${ROOT}/${film.OUT}`)) await publish(film, opts);
}

// Paint frames [from, to) on a pool of workers and hand them to `write`
// in order, never running far ahead of it.
async function renderFrames(name, opts, from, to, FPS, write, threadsWanted) {
  const threads = Math.max(1, Math.min(threadsWanted, to - from));
  const ready = new Map();
  let next = from;
  let written = from;
  const start = performance.now();
  let writing = Promise.resolve();
  const flush = async () => {
    while (ready.has(written)) {
      const rgb = ready.get(written);
      ready.delete(written);
      await write(rgb);
      written++;
      if (written % FPS === 0 || written === to) {
        const el = (performance.now() - start) / 1000;
        const eta = ((to - written) * el) / Math.max(1, written - from);
        process.stdout.write(`\r  frame ${written - from}/${to - from}  ${el.toFixed(0)} s  eta ${eta.toFixed(0)} s   `);
      }
    }
  };
  await new Promise((resolveAll, reject) => {
    const idle = [];
    let live = threads;
    const dispatch = () => {
      while (idle.length && next < to && next - written < threads * 4) idle.pop().postMessage(next++);
      if (next >= to) while (idle.length) idle.pop().postMessage(-1);
    };
    for (let w = 0; w < threads; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { name, opts } });
      worker.on('message', ({ i, rgb }) => {
        ready.set(i, new Uint8Array(rgb));
        idle.push(worker);
        writing = writing.then(flush).then(dispatch);
        dispatch();
      });
      worker.on('error', reject);
      worker.on('exit', () => {
        if (--live === 0) resolveAll();
      });
      idle.push(worker);
    }
    dispatch();
  });
  await writing;
}

async function work() {
  const film = await import(FILMS[workerData.name]);
  parentPort.on('message', (i) => {
    if (i < 0) return process.exit(0);
    const rgb = film.render(i, workerData.opts);
    parentPort.postMessage({ i, rgb: rgb.buffer }, [rgb.buffer]);
  });
}

// Slices rendered on many machines, joined without re-encoding (they share
// their settings), with the whole soundtrack laid under them.
async function joinSlices(film, dir, out) {
  const parts = readdirSync(dir)
    .filter((f) => /^slice-\d+\.mp4$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!parts.length) throw new Error(`no slices in ${dir}`);
  const list = join(dir, 'slices.txt');
  writeFileSync(list, parts.map((p) => `file '${join(dir, p)}'`).join('\n') + '\n');
  const wav = out.replace(/\.mp4$/, '') + '.wav';
  // As long as the pictures (a film's last frame can end a hair after its
  // score does), so -shortest never cuts frames.
  writeFileSync(wav, film.soundtrack({ from: 0, to: Math.max(film.DURATION, film.FRAMES / film.FPS) }));
  await run(['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav, '-c:v', 'copy', ...audioArgs(), '-movflags', '+faststart', out]);
  rmSync(wav);
  console.log(`${out}: ${parts.length} slices joined, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
  if (out === resolve(`${ROOT}/${film.OUT}`)) await publish(film, {});
}

// A poster frame and the page, when the film goes to its place in docs/.
async function publish(film, opts) {
  if (!film.PAGE) return;
  const { encodePNG } = await import('../src/png.js');
  const { W, H } = film.size(opts);
  const rgb = film.render(Math.round(film.PAGE.at * film.FPS), opts);
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  writeFileSync(`${ROOT}/${film.PAGE.poster}`, encodePNG(rgba, W, H));
  copyFileSync(`${ROOT}/${film.PAGE.from}`, `${ROOT}/${film.PAGE.to}`);
  console.log(`${film.PAGE.poster}, ${film.PAGE.to}`);
}

function inputArgs(W, H, FPS) {
  return ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-'];
}

function videoArgs({ crf, preset, tune }) {
  return ['-c:v', 'libx264', '-preset', preset, ...(tune ? ['-tune', tune] : []), '-crf', String(crf), '-pix_fmt', 'yuv420p'];
}

function audioArgs() {
  return ['-c:a', 'aac', '-b:a', '192k', '-shortest'];
}

function run(argv) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, argv, { stdio: 'inherit' });
    p.on('error', rej);
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`))));
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) out[key] = true;
    else {
      out[key] = val;
      i++;
    }
  }
  return out;
}
