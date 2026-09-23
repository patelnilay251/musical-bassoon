// Sounds of places and things, synthesized: surf, wind, crickets,
// songbirds, gulls, water lapping, halyards on masts, the hum of neon, a
// switch's click, a car door, and an engine whose revs follow its speed.
// The films share them; each takes a length in seconds and returns a mono
// Float32Array at RATE.

import { RATE, SVF, noiseSource, bell } from './synth.js';

const TAU = Math.PI * 2;
const len = (s) => Math.max(1, Math.ceil(s * RATE));

// A deterministic stream of numbers in [0, 1) for scattering events.
export function rng(seed) {
  const n = noiseSource(seed);
  return () => (n() + 1) / 2;
}

// Noise shaped by a function of time: fn(t) -> [gain, cutoff, q, mode].
export function shapedNoise(seconds, seed, fn, every = 32) {
  const out = new Float32Array(len(seconds));
  const noise = noiseSource(seed);
  const f = new SVF(1000, 0.7);
  let g = 0;
  let mode = 'lp';
  for (let i = 0; i < out.length; i++) {
    if (i % every === 0) {
      const [gain, cutoff, q = 0.7, m = 'lp'] = fn(i / RATE);
      g = gain;
      mode = m;
      f.set(cutoff, q);
    }
    f.tick(noise());
    out[i] = (mode === 'bp' ? f.bp : mode === 'hp' ? f.hp : f.lp) * g;
  }
  return out;
}

export function click(vel = 1, tone = 3000) {
  const out = new Float32Array(len(0.02));
  const n = noiseSource(tone);
  for (let i = 0; i < out.length; i++) out[i] = n() * Math.exp(-i / (RATE * 0.002)) * vel;
  return out;
}

// A car door: the thump of the panel, the latch, a little rattle.
export function door() {
  const out = new Float32Array(len(0.5));
  const n = noiseSource(77);
  const lp = new SVF(260, 0.9);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const thump = Math.sin(TAU * 62 * t) * Math.exp(-t / 0.06) * 0.8;
    const body = lp.tick(n()) * Math.exp(-t / 0.05) * 1.6;
    const latch = t > 0.012 && t < 0.02 ? n() * 0.5 : 0;
    const rattle = t > 0.03 ? n() * 0.04 * Math.exp(-(t - 0.03) / 0.08) : 0;
    out[i] = thump + body + latch + rattle;
  }
  return out;
}

/**
 * An engine by its speed: firing pulses of a V8 whose revs follow the car,
 * rougher under load, with road noise under it. speed(t) in m/s, `off`
 * the moment the key is turned (seconds, from the start of the buffer).
 */
export function engine(seconds, speed, { off = Infinity, seed = 3, idle = 13, cylinders = 8 } = {}) {
  const out = new Float32Array(len(seconds));
  const n = noiseSource(seed);
  const lp = new SVF(700, 0.8);
  const road = new SVF(500, 0.6);
  let ph = 0;
  let prev = speed(0);
  let load = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const v = speed(t);
    if (i % 256 === 0) {
      const a = (v - prev) * (RATE / 256);
      prev = v;
      load += (Math.max(0, Math.min(1, 0.4 + a * 0.25)) - load) * 0.1;
    }
    // Revs: idle, climbing with speed; spinning down after the key.
    const dying = t > off ? Math.exp(-(t - off) / 0.18) : 1;
    const rpm = (800 + v * 95) * (0.3 + 0.7 * dying);
    const f = (rpm / 60) * (cylinders / 2);
    ph += f / RATE;
    const p = ph % 1;
    const half = Math.floor(ph) % 2 ? 0.75 : 1; // the burble of a cross-plane V8
    const pulse = Math.exp(-p * 5) * half - 0.3;
    if (i % 32 === 0) lp.set(300 + f * 3, 0.8);
    const tone = lp.tick(pulse + n() * 0.25 * Math.exp(-p * 8));
    const hiss = road.tick(n()) * Math.min(1, v / idle) * 0.5;
    out[i] = (tone * (0.55 + 0.45 * load) + hiss) * dying;
  }
  return out;
}

// Crickets: several, each chirping in trains of pulses at its own rate.
export function crickets(seconds, seed, count = 4) {
  const out = new Float32Array(len(seconds));
  const r = rng(seed);
  for (let c = 0; c < count; c++) {
    const f = 4200 + r() * 900;
    const rate = 0.55 + r() * 0.5;
    const pulses = 3 + Math.floor(r() * 3);
    const gain = 0.05 + r() * 0.05;
    for (let t0 = r() * rate; t0 < seconds; t0 += rate * (0.9 + 0.2 * r())) {
      for (let k = 0; k < pulses; k++) {
        const o = len(t0 + k * 0.045);
        for (let j = 0; j < len(0.03) && o + j < out.length; j++) {
          const tt = j / RATE;
          out[o + j] += Math.sin(TAU * f * tt) * Math.sin((Math.PI * tt) / 0.03) * gain;
        }
      }
    }
  }
  return out;
}

// Songbirds: little sweeps and trills.
export function birds(seconds, seed, density) {
  const out = new Float32Array(len(seconds));
  const r = rng(seed);
  let t = r() * 0.5;
  while (t < seconds) {
    const d = density(t);
    if (d > 0 && r() < d) {
      const notes = 2 + Math.floor(r() * 5);
      const f0 = 2600 + r() * 2600;
      const dir = r() < 0.5 ? -1 : 1;
      const g = 0.08 + r() * 0.08;
      let o = t;
      for (let k = 0; k < notes; k++) {
        const nl = 0.04 + r() * 0.06;
        const fa = f0 * (1 + 0.08 * k * dir);
        const fb = fa * (1 + (r() - 0.3) * 0.5);
        let ph = 0;
        const i0 = len(o);
        for (let j = 0; j < len(nl) && i0 + j < out.length; j++) {
          const u = j / len(nl);
          ph += (TAU * (fa + (fb - fa) * u)) / RATE;
          out[i0 + j] += Math.sin(ph + 0.8 * Math.sin(ph * 2)) * Math.sin(Math.PI * u) * g;
        }
        o += nl + 0.02 + r() * 0.05;
      }
      t = o + 0.15 + r() * 0.9;
    } else t += 0.3;
  }
  return out;
}

// A gull: two or three nasal cries, each rising then falling.
export function gull(seed) {
  const r = rng(seed);
  const calls = 2 + Math.floor(r() * 2);
  const out = new Float32Array(len(calls * 0.42 + 0.3));
  const bp = new SVF(2100, 1.5);
  let ph = 0;
  for (let c = 0; c < calls; c++) {
    const o = len(c * (0.36 + r() * 0.08));
    const L = 0.22 + r() * 0.1;
    const f0 = 1150 + r() * 250;
    for (let j = 0; j < len(L) && o + j < out.length; j++) {
      const u = j / len(L);
      const f = f0 * (1 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.4)) - 0.2 * u);
      ph += f / RATE;
      const saw = 2 * (ph % 1) - 1;
      out[o + j] += bp.tick(saw) * Math.sin(Math.PI * u) ** 0.6 * 0.5;
    }
  }
  return out;
}

// Surf: each breaking wave a rush that swells and hisses away. `waves`:
// [time of the break, loudness, brightness].
export function surf(seconds, seed, waves, { floor = 0.05 } = {}) {
  return shapedNoise(seconds, seed, (t) => {
    let g = floor;
    let bright = 0;
    for (const [tw, a, br] of waves) {
      const x = t - tw;
      if (x < -0.8 || x > 6) continue;
      const env = x < 0 ? a * Math.pow(1 + x / 0.8, 2) : a * Math.exp(-x / (0.9 + 1.2 * br));
      g += env;
      bright = Math.max(bright, env * br);
    }
    return [g, 500 + 4200 * Math.min(1, bright * 1.5), 0.6];
  });
}

// Halyards tapping aluminum masts, and water in among the hulls.
export function rigging(seconds, seed) {
  const out = new Float32Array(len(seconds));
  const r = rng(seed);
  for (let t = r(); t < seconds; t += 0.25 + r() * 1.3) {
    const hits = 1 + Math.floor(r() * 3);
    for (let k = 0; k < hits; k++) {
      const b = bell(1800 + r() * 1600, 0.02, 0.18 + r() * 0.12, { ratio: 2.76, ring: 0.05 + r() * 0.05 });
      const o = len(t + k * 0.12);
      for (let j = 0; j < b.length && o + j < out.length; j++) out[o + j] += b[j];
    }
  }
  return out;
}

export function lapping(seconds, seed, gain = 0.2) {
  const r = rng(seed);
  const laps = [];
  for (let t = 0; t < seconds; t += 0.35 + r() * 0.6) laps.push([t, 0.3 + r() * 0.7]);
  return shapedNoise(seconds, seed, (t) => {
    let g = 0.02;
    for (const [tl, a] of laps) {
      const x = t - tl;
      if (x > 0 && x < 0.5) g += a * Math.sin(Math.PI * (x / 0.5)) ** 2;
    }
    return [g * gain, 420, 1.1, 'bp'];
  });
}

export function wind(seconds, seed, gain, fn = () => 1) {
  return shapedNoise(seconds, seed, (t) => [gain * fn(t) * (0.7 + 0.3 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1)), 350 + 250 * Math.sin(t * 0.5), 0.7]);
}

// The hum of neon: 120 Hz and its harmonics, only while `on(t)`.
export function hum(seconds, on, gain = 0.1) {
  const out = new Float32Array(len(seconds));
  const lp = new SVF(900, 0.7);
  let g = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    if (i % 32 === 0) g = on(t);
    const ph = (120 * t) % 1;
    out[i] = lp.tick((2 * ph - 1) * 0.6 + Math.sin(TAU * 60 * t) * 0.4) * g * gain;
  }
  return out;
}

export function speedOf(profile, t) {
  if (t <= profile[0][0]) return profile[0][1];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [t0, v0] = profile[i];
    const [t1, v1] = profile[i + 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return profile[profile.length - 1][1];
}

// ---------------------------------------------------------------- more of the town
// (for One Day in Paloma Bay)

// Mix `buf` into `out` from `t` seconds on.
export function addInto(out, buf, t, gain = 1) {
  const o = Math.round(t * RATE);
  for (let j = 0; j < buf.length; j++) {
    const i = o + j;
    if (i < 0) continue;
    if (i >= out.length) break;
    out[i] += buf[j] * gain;
  }
  return out;
}

// A mourning dove: coo-OOO-oo, coo, coo. Soft hooted notes, the second
// swelling up and sliding away, a little breath in each.
export function dove(seed = 1) {
  const r = rng(seed);
  const k = 0.94 + 0.12 * r(); // each bird a little higher or lower
  const notes = [
    [0.0, 0.22, 470, 545, false],
    [0.36, 0.62, 560, 500, true],
    [1.08, 0.3, 520, 470, false],
    [1.75, 0.42, 500, 462, false],
    [2.45, 0.42, 495, 458, false],
  ];
  const out = new Float32Array(len(3.1));
  const noise = noiseSource(seed * 7 + 1);
  const bp = new SVF(500, 4);
  for (const [t0, d, f0, f1, swell] of notes) {
    const o = len(t0);
    const L = len(d);
    let ph = 0;
    for (let j = 0; j < L && o + j < out.length; j++) {
      const u = j / L;
      const top = f0 * 1.12;
      const f = k * (swell ? (u < 0.35 ? f0 + ((top - f0) * u) / 0.35 : top - ((top - f1) * (u - 0.35)) / 0.65) : f0 + (f1 - f0) * u);
      ph += (TAU * f) / RATE;
      if (j % 32 === 0) bp.set(f, 4);
      const env = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.25) * (swell ? 0.7 + 0.3 * Math.sin(Math.PI * u) : 0.8);
      out[o + j] += (Math.sin(ph) + 0.12 * Math.sin(2 * ph) + bp.tick(noise()) * 0.25) * env * 0.5;
    }
  }
  return out;
}

// A mockingbird: a phrase of whistles, buzzes or chirps sung two to four
// times over, then another. density(t) in [0, 1].
export function mockingbird(seconds, seed, density = () => 1) {
  const out = new Float32Array(len(seconds));
  const r = rng(seed);
  let t = 0.2 + r();
  while (t < seconds) {
    if (r() > density(t)) {
      t += 0.5;
      continue;
    }
    const kind = Math.floor(r() * 3); // whistle, buzz, chirp
    const notes = [];
    let f = 1800 + r() * 2800;
    for (let k = 0, n = 2 + Math.floor(r() * 4); k < n; k++) {
      notes.push([kind === 1 ? 0.07 + r() * 0.06 : 0.04 + r() * 0.07, f, f * (0.7 + r() * 0.8)]);
      f = Math.max(1400, Math.min(6000, f * (0.8 + r() * 0.5)));
    }
    const g = 0.08 + r() * 0.06;
    for (let rep = 0, reps = 2 + Math.floor(r() * 3); rep < reps; rep++) {
      for (const [d, fa, fb] of notes) {
        const i0 = len(t);
        const L = len(d);
        let ph = 0;
        for (let j = 0; j < L && i0 + j < out.length; j++) {
          const u = j / L;
          ph += (TAU * (fa + (fb - fa) * u)) / RATE;
          const tone = kind === 1 ? Math.sin(ph + 2.5 * Math.sin(ph * 0.5)) : kind === 2 ? Math.sin(ph + 1.2 * Math.sin(ph * 2)) : Math.sin(ph);
          out[i0 + j] += tone * Math.sin(Math.PI * u) * g;
        }
        t += d + 0.015 + r() * 0.03;
      }
      t += 0.08 + r() * 0.08;
    }
    t += 0.3 + r() * 1.1;
  }
  return out;
}

// A truck a mile or two up the highway: a diesel drone and the roar of its
// tires, everything but the lows lost on the way. gain(t) shapes it.
export function farTruck(seconds, seed, gain = () => 1) {
  const e = engine(seconds, () => 7, { seed, idle: 20, cylinders: 6 });
  const out = new Float32Array(e.length);
  const n = noiseSource(seed + 5);
  const lp = new SVF(240, 0.7);
  const road = new SVF(420, 0.9);
  for (let i = 0; i < out.length; i++) {
    road.tick(n());
    out[i] = lp.tick(e[i] * 0.8 + road.bp * 0.9) * gain(i / RATE);
  }
  return out;
}

// An ice machine by a motel office dropping a load: a clattering cascade
// of cubes into the bin, the thud of it, and the compressor running on.
export function iceMachine(seed = 1, seconds = 4) {
  const out = new Float32Array(len(seconds));
  const r = rng(seed);
  for (let k = 0; k < 46; k++) {
    const t = 0.02 + 1.1 * Math.pow(r(), 1.6);
    addInto(out, bell(2200 + r() * 3200, 0.01, 0.12 + r() * 0.2, { ratio: 2.3 + r() * 1.4, ring: 0.015 + r() * 0.03 }), t, 0.6);
  }
  const n = noiseSource(seed + 3);
  const lp = new SVF(180, 1.2);
  const o = len(0.05);
  for (let j = 0; j < len(0.4); j++) {
    const t = j / RATE;
    out[o + j] += (lp.tick(n()) * 1.5 + Math.sin(TAU * 70 * t) * 0.4) * Math.exp(-t / 0.08);
  }
  const lp2 = new SVF(400, 0.7);
  for (let i = len(0.6); i < out.length; i++) {
    const t = i / RATE;
    const on = Math.min(1, (t - 0.6) / 0.4) * Math.max(0, Math.min(1, (seconds - t) / 0.5));
    out[i] += lp2.tick(Math.sin(TAU * 58 * t) + 0.5 * Math.sin(TAU * 116 * t) + 0.3 * n()) * 0.05 * on;
  }
  return out;
}

// A pool's filter: a motor humming down in the pump house, water
// trickling, and the skimmer gulping now and then.
export function poolFilter(seconds, seed) {
  const r = rng(seed);
  const gulps = [];
  for (let t = r() * 1.5; t < seconds; t += 1.1 + r() * 1.6) gulps.push(t);
  const out = shapedNoise(
    seconds,
    seed,
    (t) => {
      let g = 0.05 * (0.8 + 0.2 * Math.sin(t * 5.1) * Math.sin(t * 3.3));
      let f = 900;
      for (const tg of gulps) {
        const x = t - tg;
        if (x > 0 && x < 0.35) {
          g += 0.4 * Math.sin((Math.PI * x) / 0.35) ** 2;
          f = 700 - 400 * (x / 0.35);
        }
      }
      return [g, f, 2.2, 'bp'];
    },
    16,
  );
  const lp = new SVF(300, 0.7);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] += lp.tick(Math.sin(TAU * 59.5 * t) + 0.4 * Math.sin(TAU * 119 * t)) * 0.012;
  }
  return out;
}

// Water slapping the pilings under a pier: hollow slaps and sloshes.
export function pilings(seconds, seed) {
  const out = new Float32Array(len(seconds));
  const r = rng(seed);
  const n = noiseSource(seed + 1);
  for (let t = r() * 0.5; t < seconds; t += 0.35 + r() * 1.2) {
    const bp = new SVF(380 + r() * 500, 2.4);
    const lp = new SVF(140, 1.5);
    const a = 0.4 + r() * 0.6;
    const d = 0.12 + r() * 0.2;
    const o = len(t);
    for (let j = 0; j < len(d * 5) && o + j < out.length; j++) {
      const tt = j / RATE;
      const x = n();
      bp.tick(x);
      lp.tick(x);
      out[o + j] += (bp.bp * 0.9 + lp.lp * 1.4) * Math.min(1, tt / 0.006) * Math.exp(-tt / d) * a;
    }
  }
  return out;
}

// Waves on rocks: a deep boom, a burst of spray, and the water draining
// back out of the gaps. waves: [time of the hit, loudness].
export function rocks(seconds, seed, waves) {
  const out = new Float32Array(len(seconds));
  const n = noiseSource(seed);
  const r = rng(seed + 1);
  for (const [tw, a] of waves) {
    const lp = new SVF(120, 1.1);
    const hp = new SVF(2200, 0.7);
    const soft = new SVF(6000, 0.7); // spray hisses; it doesn't sizzle
    const bp = new SVF(700, 3);
    const o = Math.round(tw * RATE);
    let ph = 0;
    for (let j = 0; j < len(4); j++) {
      const i = o + j;
      if (i < 0) continue;
      if (i >= out.length) break;
      const t = j / RATE;
      const x = n();
      lp.tick(x);
      hp.tick(x);
      if (j % 64 === 0) bp.set(500 + 600 * r(), 3);
      bp.tick(x);
      const boom = (Math.sin(ph) * 0.8 + lp.lp * 2) * Math.min(1, t / 0.02) * Math.exp(-t / 0.35);
      soft.tick(hp.hp);
      const spray = soft.lp * Math.min(1, Math.max(0, (t - 0.05) / 0.1)) * Math.exp(-Math.max(0, t - 0.15) / 0.6) * 0.45;
      const drain = t > 0.8 ? bp.bp * 0.3 * Math.max(0, Math.sin((Math.PI * (t - 0.8)) / 3)) : 0;
      out[i] += (boom + spray + drain) * a;
      ph += (TAU * (55 + 20 * Math.exp(-t / 0.1))) / RATE;
    }
  }
  return out;
}

// A creak: wood or rubber rubbing, the stick and slip of it exciting a
// resonance. f: how fast it slips, tone: what it rings at. (A fender
// squeaking against a hull is a creak, higher and shorter.)
export function creak(seed, { dur = 0.6, f = 45, tone = 700, q = 6 } = {}) {
  const out = new Float32Array(len(dur + 0.1));
  const r = rng(seed);
  const res1 = new SVF(tone, q);
  const res2 = new SVF(tone * 2.3, q);
  const n = noiseSource(seed + 9);
  const wob = r() * 6;
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const u = Math.min(1, t / dur);
    ph += (f * (0.7 + 0.6 * Math.sin(Math.PI * u) + 0.2 * Math.sin(t * 17 + wob))) / RATE;
    let x = 0;
    if (ph >= 1) {
      ph -= 1;
      x = 1 + 0.3 * n();
    }
    res1.tick(x);
    res2.tick(x);
    out[i] = (res1.bp + res2.bp * 0.5) * Math.sin(Math.PI * u) ** 0.7 * 0.8;
  }
  return out;
}

// A bell buoy out on the swell: struck once, twice or three times as it
// rolls, then quiet for a while.
export function bellBuoy(seconds, seed) {
  const out = new Float32Array(len(seconds));
  const r = rng(seed);
  for (let t = 0.3 + r() * 1.5; t < seconds; t += 2.2 + r() * 3.2) {
    const strikes = 1 + Math.floor(r() * 3);
    let ts = t;
    for (let k = 0; k < strikes; k++) {
      const v = 0.5 + r() * 0.4;
      addInto(out, bell(587, 0.05, v, { ratio: 2.41, ring: 2.2 }), ts);
      addInto(out, bell(293.5, 0.05, v * 0.6, { ratio: 1.5, ring: 3 }), ts);
      ts += 0.55 + r() * 0.2;
    }
  }
  return out;
}

// A foghorn's diaphone: a long low blast, and the grunt at the end of it.
export function foghorn(dur = 2.8) {
  const out = new Float32Array(len(dur + 0.8));
  const lp = new SVF(700, 1.0);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const end = Math.max(0, t - (dur - 0.45));
    ph += (158 * (1 - 0.32 * Math.min(1, end / 0.35))) / RATE;
    const saw = 2 * (ph % 1) - 1;
    const sq = ph % 1 < 0.5 ? 0.6 : -0.6;
    const env = Math.min(1, t / 0.35) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.12)) * (1 + 0.25 * Math.exp(-(((end - 0.2) / 0.12) ** 2)));
    if (i % 32 === 0) lp.set(420 + 420 * Math.min(1, t / 0.4) - 200 * Math.min(1, end / 0.4), 1.2);
    out[i] = lp.tick(saw * 0.6 + sq * 0.4) * env * 0.8;
  }
  return out;
}

// A flag in a stiff breeze: the cloth fluttering, snapping when a gust
// takes it, and its halyard's clip ringing on the pole.
export function flag(seconds, seed, gust = () => 1) {
  const r = rng(seed);
  const snaps = [];
  for (let t = r(); t < seconds; t += 0.6 + r() * 2.2) snaps.push([t, 0.5 + r() * 0.5]);
  const out = shapedNoise(
    seconds,
    seed,
    (t) => {
      const g = gust(t);
      let a = 0.05 * g * (0.55 + 0.45 * Math.sin(TAU * (7 + 3 * g) * t) ** 2);
      for (const [ts, k] of snaps) {
        const x = t - ts;
        if (x > 0 && x < 0.12) a += k * 0.5 * Math.exp(-x / 0.025);
      }
      return [a, 1400 + 1600 * g, 0.8, 'bp'];
    },
    16,
  );
  for (let t = r() * 0.8; t < seconds; t += 0.5 + r() * 1.9) addInto(out, bell(2400 + r() * 900, 0.01, 0.2 + r() * 0.15, { ratio: 2.76, ring: 0.09 }), t);
  return out;
}

// One beat of big wings: a soft push of air.
export function wingbeat(seed, dur = 0.32) {
  return shapedNoise(dur, seed, (t) => [0.5 * Math.sin((Math.PI * t) / dur) ** 2, 380 + 500 * Math.sin((Math.PI * t) / dur), 0.8]);
}

// Palm fronds in a gusty breeze: a dry hiss that swells with each gust.
export function rustle(seconds, seed, gain = 1) {
  const r = rng(seed);
  const p = r() * 6;
  return shapedNoise(seconds, seed, (t) => {
    const gust = 0.25 + Math.max(0, Math.sin(t * 0.45 + p)) ** 2 + 0.3 * Math.max(0, Math.sin(t * 1.3 + p * 2)) ** 4;
    return [0.1 * gain * gust, 4200 + 1400 * gust, 0.6, 'hp'];
  });
}

// Ice settling in a glass.
export function clink(seed) {
  const r = rng(seed);
  return bell(3100 + r() * 1800, 0.01, 0.35 + r() * 0.25, { ratio: 2.9, ring: 0.06 });
}

// A car's wheels bumping up a driveway lip: a low thud and a rattle.
export function thud(seed = 1, vel = 1) {
  const out = new Float32Array(len(0.35));
  const n = noiseSource(seed);
  const lp = new SVF(160, 1.0);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    out[i] = (lp.tick(n()) * 1.4 + Math.sin(TAU * 48 * t) * 0.5) * Math.min(1, t / 0.004) * Math.exp(-t / 0.07) * vel + (t > 0.03 ? n() * 0.03 * Math.exp(-(t - 0.03) / 0.06) : 0);
  }
  return out;
}
