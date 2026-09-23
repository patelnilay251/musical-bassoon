// A small offline synthesizer in the manner of the FM boards of the
// mid-eighties: two-operator FM voices (an electric piano, a slap bass, a
// breathy lead, bells), detuned saw pads, drums built from sines and
// filtered noise, and a mixer with a hall reverb and a ping-pong delay.
// Everything renders into Float32Arrays at 44.1 kHz, deterministically.

export const RATE = 44100;
const TAU = Math.PI * 2;

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A seeded white-noise source, so the soundtrack is the same every time.
export function noiseSource(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

const len = (seconds) => Math.max(1, Math.ceil(seconds * RATE));

// ---------------------------------------------------------------- filters

// A state-variable filter (Simper's form); cutoff may change per sample.
export class SVF {
  constructor(cutoff = 1000, q = 0.7) {
    this.ic1 = 0;
    this.ic2 = 0;
    this.set(cutoff, q);
  }
  set(cutoff, q = this.q) {
    this.q = q;
    const g = Math.tan((Math.PI * Math.max(20, Math.min(cutoff, RATE * 0.49))) / RATE);
    const k = 1 / q;
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  // Returns [low, band, high] in this.lp / bp / hp.
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

// ---------------------------------------------------------------- envelopes

// Attack, then exponential decay toward `sustain`, released at `off`.
function adsr(t, off, { a = 0.004, d = 0.3, s = 0, r = 0.15 }) {
  const on = t < a ? t / a : s + (1 - s) * Math.exp(-(t - a) / d);
  if (t < off) return on;
  const atOff = off < a ? off / a : s + (1 - s) * Math.exp(-(off - a) / d);
  return atOff * Math.exp(-(t - off) / r);
}

// ---------------------------------------------------------------- voices

/**
 * Electric piano: a 1:1 FM pair for the body, whose brightness falls away
 * as the note rings, and a 14:1 pair for the tine's knock.
 */
export function ep(freq, dur, vel = 0.8, { detune = 0 } = {}) {
  const f = freq * Math.pow(2, detune / 1200);
  const tail = 0.5;
  const n = len(dur + tail);
  const out = new Float32Array(n);
  const decay = 1.5 * Math.pow(220 / f, 0.35);
  let pc = 0;
  let pm = 0;
  let pt = 0;
  const dc = (TAU * f) / RATE;
  const dt = (TAU * f * 14) / RATE;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const idx = (0.4 + 1.9 * vel) * Math.exp(-t / 0.5) + 0.22;
    const tine = Math.exp(-t / 0.045) * (0.5 + vel);
    const mod = Math.sin(pm) * idx + Math.sin(pt) * tine * 0.6;
    const env = adsr(t, dur, { a: 0.002, d: decay, s: 0, r: 0.12 });
    out[i] = Math.sin(pc + mod) * env * (0.35 + 0.65 * vel);
    pc += dc;
    pm += dc;
    pt += dt;
  }
  return out;
}

// Slap bass: an FM pair that snaps bright and settles to a round tone,
// over a sine an octave down.
export function bass(freq, dur, vel = 0.8) {
  const n = len(dur + 0.3);
  const out = new Float32Array(n);
  let pc = 0;
  let pm = 0;
  let ps = 0;
  const d = (TAU * freq) / RATE;
  const lp = new SVF(900 + 1600 * vel, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const idx = 2.6 * vel * Math.exp(-t / 0.07) + 0.7;
    const env = adsr(t, dur, { a: 0.003, d: 0.35, s: 0.55, r: 0.05 });
    const v = Math.sin(pc + Math.sin(pm) * idx) * 0.75 + Math.sin(ps) * 0.45;
    out[i] = lp.tick(v) * env * (0.5 + 0.5 * vel);
    pc += d;
    pm += d;
    ps += d * 0.5;
  }
  return out;
}

/**
 * A fretless bass: a round tone that slides into each note from the one
 * before, the filter opening a little after the attack (the "mwah"), and
 * a slow vibrato on long notes.
 */
export function fretless(freq, dur, vel = 0.8, { from = freq, slide = 0.07 } = {}) {
  const n = len(dur + 0.4);
  const out = new Float32Array(n);
  const lp = new SVF(400, 1.1);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const k = Math.min(1, t / slide);
    const vib = 1 + 0.005 * Math.sin(TAU * 4.6 * t) * Math.min(1, Math.max(0, (t - 0.35) / 0.4));
    const f = from * Math.pow(freq / from, k * k * (3 - 2 * k)) * vib;
    ph += f / RATE;
    if (i % 32 === 0) lp.set(Math.min(6000, f * (1.8 + 2.6 * vel * (1 - Math.exp(-t / 0.06)) * Math.exp(-t / 0.35))), 1.1);
    const env = adsr(t, dur, { a: 0.015, d: 1.1, s: 0.55, r: 0.14 });
    const v = (2 * (ph % 1) - 1) * 0.45 + Math.sin(TAU * ph) * 0.7;
    out[i] = lp.tick(v) * env * (0.5 + 0.5 * vel);
  }
  return out;
}

/**
 * A breathy FM lead, like the flute-and-brass patches of the day: the tone
 * blooms after the attack, scoops up into pitch, and gets vibrato if held.
 */
export function lead(freq, dur, vel = 0.8, { bright = 1 } = {}) {
  const n = len(dur + 0.9);
  const out = new Float32Array(n);
  const noise = noiseSource(Math.round(freq * 100));
  const breath = new SVF(freq * 2.2, 2.5);
  let pc = 0;
  let pm = 0;
  let p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const scoop = 1 - 0.018 * Math.exp(-t / 0.035);
    const vib = 1 + 0.0045 * Math.sin(TAU * 5.4 * t) * Math.min(1, Math.max(0, (t - 0.22) / 0.3));
    const f = freq * scoop * vib;
    const idx = bright * (0.9 + 0.9 * Math.min(1, t / 0.06) * Math.exp(-t / 0.9) + 0.35);
    const env = adsr(t, dur, { a: 0.02, d: 0.6, s: 0.72, r: 0.16 });
    const air = breath.tick(noise()) * 0.12 * Math.exp(-t / 0.15);
    out[i] = (Math.sin(pc + Math.sin(pm) * idx + Math.sin(p2) * 0.25 * bright) + air) * env * (0.45 + 0.55 * vel);
    pc += (TAU * f) / RATE;
    pm += (TAU * f) / RATE;
    p2 += (TAU * f * 2) / RATE;
  }
  return out;
}

// A bell: inharmonic FM, a long ring.
export function bell(freq, dur, vel = 0.8, { ratio = 3.5, ring = 1.6 } = {}) {
  const n = len(dur + ring * 5);
  const out = new Float32Array(n);
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const idx = 2.2 * vel * Math.exp(-t / 0.4) + 0.3;
    const env = Math.min(1, t / 0.001) * Math.exp(-t / ring);
    out[i] = Math.sin(pc + Math.sin(pm) * idx) * env * vel;
    pc += (TAU * freq) / RATE;
    pm += (TAU * freq * ratio) / RATE;
  }
  return out;
}

// A square-wave blip, the sound of a board saying something happened.
export function blip(freq, dur, vel = 0.8, { duty = 0.5, decay = 0.08, slide = 0 } = {}) {
  const n = len(dur + decay * 6);
  const out = new Float32Array(n);
  const lp = new SVF(6000, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = freq * Math.pow(2, (slide * Math.min(t, dur)) / 12);
    const env = t < dur ? Math.exp(-t / (decay * 4)) : Math.exp(-dur / (decay * 4)) * Math.exp(-(t - dur) / decay);
    out[i] = lp.tick((ph % 1) < duty ? 1 : -1) * env * vel * 0.5;
    ph += f / RATE;
  }
  return out;
}

// Detuned saws through a slow low-pass: the string machine behind it all.
export function pad(freqs, dur, vel = 0.6, { cutoff = 1600, attack = 0.5, release = 1.2 } = {}) {
  const n = len(dur + release * 5);
  const out = new Float32Array(n);
  const lp = new SVF(cutoff, 0.9);
  const rnd = noiseSource(Math.round(freqs[0] * 7));
  const voices = [];
  for (const f of freqs) for (const c of [-9, 0, 8]) voices.push({ d: (f * Math.pow(2, c / 1200)) / RATE, p: rnd() + 1 });
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let v = 0;
    for (const o of voices) {
      v += 2 * (o.p % 1) - 1;
      o.p += o.d;
    }
    const env = adsr(t, dur, { a: attack, d: 10, s: 1, r: release });
    if (i % 32 === 0) lp.set(cutoff * (0.7 + 0.3 * Math.min(1, t / attack)), 0.9);
    out[i] = (lp.tick(v / voices.length) * env * vel) / 1.5;
  }
  return out;
}

// ---------------------------------------------------------------- drums

export function kick(vel = 1) {
  const n = len(1.2);
  const out = new Float32Array(n);
  const noise = noiseSource(11);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 46 + 120 * Math.exp(-t / 0.032);
    const click = t < 0.003 ? noise() * 0.5 * (1 - t / 0.003) : 0;
    out[i] = (Math.sin(ph) * Math.exp(-t / 0.26) + click) * vel;
    ph += (TAU * f) / RATE;
  }
  return out;
}

// The snare of the day: a crack, a tone, and a burst of room gated shut.
export function snare(vel = 1, { gate = 0.2 } = {}) {
  const n = len(gate + 0.2);
  const out = new Float32Array(n);
  const noise = noiseSource(23);
  const bp = new SVF(2100, 0.9);
  const hp = new SVF(600, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const x = noise();
    bp.tick(x);
    hp.tick(x);
    const crack = bp.bp * Math.exp(-t / 0.05) * 1.2;
    const room = hp.hp * 0.32 * (t < gate ? 1 : Math.exp(-(t - gate) / 0.018)) * Math.exp(-t / 0.5);
    const tone = Math.sin(ph) * Math.exp(-t / 0.05) * 0.6;
    out[i] = (crack + room + tone) * vel;
    ph += (TAU * (180 + 30 * Math.exp(-t / 0.01))) / RATE;
  }
  return out;
}

export function clap(vel = 1) {
  const n = len(0.35);
  const out = new Float32Array(n);
  const noise = noiseSource(31);
  const bp = new SVF(1250, 1.4);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let env = 0;
    for (const o of [0, 0.011, 0.022]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) / 0.007));
    if (t >= 0.03) env = Math.max(env, 0.55 * Math.exp(-(t - 0.03) / 0.09));
    bp.tick(noise());
    out[i] = bp.bp * env * vel * 1.4;
  }
  return out;
}

export function hat(vel = 1, open = false) {
  const n = len(open ? 0.7 : 0.12);
  const out = new Float32Array(n);
  const noise = noiseSource(open ? 41 : 43);
  const hp = new SVF(7500, 0.8);
  const decay = open ? 0.2 : 0.028;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    hp.tick(noise());
    out[i] = hp.hp * Math.exp(-t / decay) * vel * 0.7;
  }
  return out;
}

export function shaker(vel = 1) {
  const n = len(0.12);
  const out = new Float32Array(n);
  const noise = noiseSource(47);
  const bp = new SVF(6500, 1.2);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    bp.tick(noise());
    out[i] = bp.bp * Math.min(1, t / 0.012) * Math.exp(-t / 0.035) * vel;
  }
  return out;
}

export function crash(vel = 1) {
  const n = len(4.5);
  const out = new Float32Array(n);
  const noise = noiseSource(53);
  const hp = new SVF(4200, 0.7);
  const partials = [2.3, 3.1, 4.7, 5.9, 7.3].map((k) => ({ d: (TAU * 420 * k) / RATE, p: 0 }));
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let ring = 0;
    for (const o of partials) {
      ring += Math.sin(o.p);
      o.p += o.d;
    }
    hp.tick(noise() + ring * 0.08);
    out[i] = hp.hp * Math.exp(-t / 0.9) * vel * 0.6;
  }
  return out;
}

// Brushes on a snare: a tap (wire on the head, a little drum tone under
// it), or with `sweep` seconds, a long swish round the head.
export function brush(vel = 1, { sweep = 0 } = {}) {
  const T = sweep || 0.2;
  const n = len(T + 0.08);
  const out = new Float32Array(n);
  const noise = noiseSource(sweep ? 61 : 67);
  const bp = new SVF(sweep ? 3200 : 4400, 0.6);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    bp.tick(noise());
    if (sweep) {
      const u = Math.min(1, t / T);
      if (i % 64 === 0) bp.set(2600 + 1800 * Math.sin(Math.PI * u), 0.6);
      out[i] = bp.bp * Math.sin(Math.PI * u) ** 1.5 * 0.55 * vel;
    } else {
      const tone = Math.sin(ph) * Math.exp(-t / 0.025) * 0.3;
      out[i] = (bp.bp * Math.min(1, t / 0.002) * Math.exp(-t / 0.05) + tone) * vel;
      ph += (TAU * 185) / RATE;
    }
  }
  return out;
}

export function tom(freq, vel = 1) {
  const n = len(1.1);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = freq * (1 + 0.5 * Math.exp(-t / 0.04));
    out[i] = Math.sin(ph) * Math.exp(-t / 0.22) * vel;
    ph += (TAU * f) / RATE;
  }
  return out;
}

// ---------------------------------------------------------------- the mixer

// Freeverb's tunings, for 44.1 kHz.
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS = [556, 441, 341, 225];

function reverb(input, { room = 0.84, damp = 0.3, spread = 0 } = {}) {
  const out = new Float32Array(input.length);
  const combs = COMBS.map((l) => ({ buf: new Float32Array(l + spread), i: 0, store: 0 }));
  const aps = ALLPASS.map((l) => ({ buf: new Float32Array(l + spread), i: 0 }));
  for (let n = 0; n < input.length; n++) {
    const x = input[n] * 0.015;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.store = o * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * room;
      if (++c.i >= c.buf.length) c.i = 0;
      y += o;
    }
    for (const a of aps) {
      const o = a.buf[a.i];
      a.buf[a.i] = y + o * 0.5;
      y = o - y;
      if (++a.i >= a.buf.length) a.i = 0;
    }
    out[n] = y;
  }
  return out;
}

export class Mix {
  constructor(seconds) {
    this.n = len(seconds);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
    this.rev = new Float32Array(this.n);
    this.dlyL = new Float32Array(this.n);
    this.dlyR = new Float32Array(this.n);
  }

  /**
   * Place a mono sound at `t` seconds. pan: -1 left .. 1 right, or a
   * function of the sample's time for moving sources; gain may be one too.
   */
  add(buf, t, { gain = 1, pan = 0, reverb = 0, delay = 0, fadeIn = 0 } = {}) {
    const i0 = Math.round(t * RATE);
    // Every sound ends on a short fade, so none can end on a click.
    const fo = Math.min(buf.length, Math.round(0.01 * RATE));
    const fi = Math.round(fadeIn * RATE);
    const panF = typeof pan === 'function' ? pan : null;
    const gainF = typeof gain === 'function' ? gain : null;
    let l = Math.cos(((pan + 1) * Math.PI) / 4);
    let r = Math.sin(((pan + 1) * Math.PI) / 4);
    let g = gainF ? 0 : gain;
    for (let j = 0; j < buf.length; j++) {
      const i = i0 + j;
      if (i < 0) continue;
      if (i >= this.n) break;
      if ((panF || gainF) && j % 64 === 0) {
        const ts = i / RATE;
        if (panF) {
          const p = Math.max(-1, Math.min(1, panF(ts)));
          l = Math.cos(((p + 1) * Math.PI) / 4);
          r = Math.sin(((p + 1) * Math.PI) / 4);
        }
        if (gainF) g = gainF(ts);
      }
      let v = buf[j] * g;
      if (j >= buf.length - fo) v *= (buf.length - j) / fo;
      if (j < fi) v *= j / fi;
      this.L[i] += v * l;
      this.R[i] += v * r;
      if (reverb) this.rev[i] += v * reverb;
      if (delay) {
        this.dlyL[i] += v * delay * l;
        this.dlyR[i] += v * delay * r;
      }
    }
  }

  // Master: the hall, the echoes, and a limiter that keeps it under 0 dBFS.
  render({ echo = 0.45, feedback = 0.38, peak = 0.89, master = 0.74 } = {}) {
    const { n, L, R } = this;
    const wetL = reverb(this.rev, { spread: 0 });
    const wetR = reverb(this.rev, { spread: 23 });
    // Ping-pong: left echoes to the right and back, darkening each time.
    const D = Math.round(echo * RATE);
    const eL = new Float32Array(n);
    const eR = new Float32Array(n);
    let lpL = 0;
    let lpR = 0;
    for (let i = 0; i < n; i++) {
      const fromR = i >= D ? eR[i - D] : 0;
      const fromL = i >= D ? eL[i - D] : 0;
      lpL += 0.45 * (fromR - lpL);
      lpR += 0.45 * (fromL - lpR);
      eL[i] = this.dlyL[i] + lpL * feedback;
      eR[i] = this.dlyR[i] + lpR * feedback;
    }
    for (let i = 0; i < n; i++) {
      L[i] = (L[i] + wetL[i] + (i >= D ? eR[i - D] : 0) * 0.5) * master;
      R[i] = (R[i] + wetR[i] + (i >= D ? eL[i - D] : 0) * 0.5) * master;
    }
    limit(L, R, peak);
    return [L, R];
  }
}

// A peak limiter with a short look-ahead and a gentle release.
function limit(L, R, ceiling) {
  const n = L.length;
  const look = Math.round(0.004 * RATE);
  const rel = Math.exp(-1 / (0.12 * RATE));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  let g = 1;
  for (let i = 0; i < n; i++) {
    let target = 1;
    for (let j = i; j < Math.min(n, i + look); j += 8) target = Math.min(target, need[j]);
    target = Math.min(target, need[Math.min(n - 1, i + look - 1)]);
    g = target < g ? target : target + (g - target) * rel;
    L[i] *= g;
    R[i] *= g;
  }
}
