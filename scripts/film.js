// Render the film: every frame of film/score.js, painted on every core and
// streamed in order into ffmpeg, with the soundtrack from film/sound.js.
//
//   node scripts/film.js                    docs/film/paloma-bay.mp4, 1536x864
//   node scripts/film.js --draft            quick look: fewer samples, 768x432
//   node scripts/film.js --from 19 --to 29  one stretch of it
//   node scripts/film.js --scale 5          enlarge 5x (1920x1080) instead of 4x
//   node scripts/film.js --audio-only       just the soundtrack, as WAV
//   --crf n (x264 quality, default 20), --scan k (scanline depth, 0 for none)
//
// Four times is the default because each of the board's pixels then fills
// exactly one of H.264's 4x4 blocks, which keeps the file small and the
// pixels hard.
//
// ffmpeg must be on the PATH, or named by the FFMPEG environment variable.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (isMainThread) await main();
else await work();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { FPS, FRAMES, DURATION } = await import('../film/score.js');
  const { W, H } = await import('../film/screen.js');
  const draft = Boolean(args.draft);
  const k = Number(args.scale ?? (draft ? 2 : 4));
  const out = resolve(args.out ?? (draft ? `${ROOT}/out/film/draft.mp4` : `${ROOT}/docs/film/paloma-bay.mp4`));
  const from = Math.max(0, Math.round(Number(args.from ?? 0) * FPS));
  const to = Math.min(FRAMES, Math.round(Number(args.to ?? DURATION) * FPS));
  mkdirSync(dirname(out), { recursive: true });

  // The soundtrack first: it is quick, and ffmpeg wants it as an input.
  const wav = out.replace(/\.mp4$/, '') + '.wav';
  const t0 = performance.now();
  const { soundtrack } = await import('../film/sound.js');
  writeFileSync(wav, soundtrack({ from: from / FPS, to: to / FPS }));
  console.log(`soundtrack: ${((performance.now() - t0) / 1000).toFixed(1)} s -> ${wav}`);
  if (args['audio-only']) return;

  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  const OW = W * k;
  const OH = H * k;
  const enc = spawn(
    ffmpeg,
    [
      ...['-y', '-hide_banner', '-loglevel', 'warning'],
      ...['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${OW}x${OH}`, '-r', String(FPS), '-i', '-'],
      ...['-i', wav],
      ...['-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'slow', '-tune', 'animation', '-crf', String(args.crf ?? (draft ? 26 : 20))],
      ...['-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out],
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  enc.on('error', (e) => {
    console.error(`could not start ffmpeg (${ffmpeg}): ${e.message}\nInstall ffmpeg or set FFMPEG=/path/to/ffmpeg.`);
    process.exit(1);
  });
  const done = new Promise((res) => enc.on('close', res));

  const { enlarge } = await import('../src/retro.js');
  const scan = Number(args.scan ?? 0.24); // darkening of each pixel row's last line
  const threads = Math.max(1, Math.min(Number(args.threads ?? os.availableParallelism?.() ?? os.cpus().length), to - from));
  const opts = draft ? { ss: 1, shadowSize: 1024 } : { ss: 2, shadowSize: 2048 };
  const ready = new Map();
  let next = from; // next frame to hand out
  let write = from; // next frame to write
  const start = performance.now();
  const flush = async () => {
    while (ready.has(write)) {
      const img = ready.get(write);
      ready.delete(write);
      // A fresh buffer per frame: the pipe may still be reading the last.
      const big = enlarge(img, W, H, k, Buffer.alloc(OW * OH * 3), { scan });
      if (!enc.stdin.write(big)) await new Promise((res) => enc.stdin.once('drain', res));
      write++;
      if (write % FPS === 0 || write === to) {
        const el = (performance.now() - start) / 1000;
        const eta = ((to - write) * el) / Math.max(1, write - from);
        process.stdout.write(`\r  frame ${write - from}/${to - from}  ${el.toFixed(0)} s  eta ${eta.toFixed(0)} s   `);
      }
    }
  };
  let writing = Promise.resolve();
  await new Promise((resolveAll, reject) => {
    const idle = [];
    let live = threads;
    // Hand frames to idle workers, but never run far ahead of the encoder.
    const dispatch = () => {
      while (idle.length && next < to && next - write < threads * 6) idle.pop().postMessage(next++);
      if (next >= to) while (idle.length) idle.pop().postMessage(-1);
    };
    for (let w = 0; w < threads; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { opts } });
      worker.on('message', ({ i, img }) => {
        ready.set(i, new Uint8ClampedArray(img));
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
  enc.stdin.end();
  await done;
  const mb = statSync(out).size / 1e6;
  console.log(`\n${out}: ${to - from} frames, ${((to - from) / FPS).toFixed(1)} s, ${OW}x${OH}, ${mb.toFixed(1)} MB, in ${((performance.now() - start) / 1000).toFixed(0)} s`);
  rmSync(wav);

  // The whole film, where the site expects it: a poster and the page too.
  if (out === resolve(`${ROOT}/docs/film/paloma-bay.mp4`) && from === 0 && to === FRAMES) {
    const { frame } = await import('../film/score.js');
    const { renderFrame } = await import('../film/frame.js');
    const { encodePNG } = await import('../src/png.js');
    const rgb = enlarge(renderFrame(frame(Math.round(3 * FPS)), opts), W, H, k, Buffer.alloc(OW * OH * 3), { scan });
    const rgba = new Uint8ClampedArray(OW * OH * 4);
    for (let i = 0; i < OW * OH; i++) {
      rgba[i * 4] = rgb[i * 3];
      rgba[i * 4 + 1] = rgb[i * 3 + 1];
      rgba[i * 4 + 2] = rgb[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    writeFileSync(`${ROOT}/docs/film/poster.png`, encodePNG(rgba, OW, OH));
    copyFileSync(`${ROOT}/web/film.html`, `${ROOT}/docs/film.html`);
    console.log('docs/film/poster.png, docs/film.html');
  }
}

async function work() {
  const { frame } = await import('../film/score.js');
  const { renderFrame } = await import('../film/frame.js');
  parentPort.on('message', (i) => {
    if (i < 0) return process.exit(0);
    const img = renderFrame(frame(i), workerData.opts);
    parentPort.postMessage({ i, img: img.buffer }, [img.buffer]);
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
