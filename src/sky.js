// Time of day: the sun's real path, the palette it implies, and the
// painters for anything a ray reaches without hitting geometry: sky and sea.
//
// The sky is built the way it would be airbrushed: an ultramarine ground,
// white mist sprayed up from the horizon, blue layered back over it toward
// the zenith, and never perfectly even.
//
// World axes: +x east, +y up, +z south.

import { DEG, clamp, lerp, smoothstep, hex, hash2, valueNoise } from './math.js';

export const LATITUDE = 34 * DEG; // Southern California
export const DECLINATION = 19 * DEG; // late July: the long end of summer
export const SEA_LEVEL = -14; // the house sits on a cliff; other places override it

// Solar position from the hour angle. Returns a unit vector toward the sun.
export function sunDirection(hours, lat = LATITUDE, dec = DECLINATION) {
  const H = (hours - 12) * 15 * DEG;
  const east = -Math.cos(dec) * Math.sin(H);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H);
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  return [east, up, -north];
}

// A waxing moon that rises in the east after dusk.
export function moonDirection(hours) {
  return sunDirection(hours - 12 - 1.6, LATITUDE, -6 * DEG);
}

// Palette keyframes by solar elevation (degrees). Each moment names a light
// tone and a shade tone directly, the way an illustrator would: a lit face
// is its local color times `light`, a face in shadow its local color times
// `shade`. Shadows are a change of hue, not a loss of it.
const KEYS = [
  { el: -18, zenith: '#03061c', mid: '#08102e', horizon: '#151c44', sunSide: '#171e48', light: '#1d2356', shade: '#1d2356', glow: '#000000', glowK: 0, cloudLit: '#242b58', cloudShade: '#10163a', seaNear: '#050b28', seaFar: '#121a42' },
  { el: -9, zenith: '#080e34', mid: '#171e56', horizon: '#30336c', sunSide: '#473a72', light: '#30356f', shade: '#30356f', glow: '#6a4a8a', glowK: 0.15, cloudLit: '#443f78', cloudShade: '#1d214c', seaNear: '#0a1238', seaFar: '#262c66' },
  { el: -4, zenith: '#111b5a', mid: '#2f3278', horizon: '#76599a', sunSide: '#b86a88', light: '#4c4b8e', shade: '#4c4b8e', glow: '#d27886', glowK: 0.3, cloudLit: '#a57498', cloudShade: '#42427c', seaNear: '#121a58', seaFar: '#665796' },
  { el: -0.8, zenith: '#1b2b80', mid: '#554a98', horizon: '#d383a0', sunSide: '#f98d60', light: '#665a9e', shade: '#665a9e', glow: '#ff9058', glowK: 0.5, cloudLit: '#f7a58e', cloudShade: '#6e5f9c', seaNear: '#1b2c7c', seaFar: '#b98aa6' },
  { el: 2.5, zenith: '#1f3590', mid: '#6c5fa6', horizon: '#f0a19c', sunSide: '#ffb069', light: '#ffac7a', shade: '#6e5ca6', glow: '#ffa060', glowK: 0.55, cloudLit: '#ffbd94', cloudShade: '#8a74ae', seaNear: '#1f358a', seaFar: '#d99aa0' },
  { el: 7, zenith: '#1d43a8', mid: '#4f74c4', horizon: '#f3d7bf', sunSide: '#ffca8e', light: '#ffd29c', shade: '#7676b8', glow: '#ffc080', glowK: 0.4, cloudLit: '#ffe1b8', cloudShade: '#a09cc4', seaNear: '#1a4096', seaFar: '#c9b4b4' },
  { el: 15, zenith: '#1440ae', mid: '#3474d2', horizon: '#e6eff0', sunSide: '#fbe9cf', light: '#ffeccb', shade: '#7282c8', glow: '#fff0d0', glowK: 0.22, cloudLit: '#fff8ea', cloudShade: '#b0bddf', seaNear: '#123f9c', seaFar: '#8cb4d8' },
  { el: 30, zenith: '#0d36a8', mid: '#2a6ad4', horizon: '#d5eff8', sunSide: '#e8f4f4', light: '#fff7e8', shade: '#6d84cf', glow: '#ffffff', glowK: 0.12, cloudLit: '#ffffff', cloudShade: '#abc0e5', seaNear: '#0e3e9e', seaFar: '#4a93d6' },
  { el: 75, zenith: '#0a2f9e', mid: '#1f5fd0', horizon: '#cfeefb', sunSide: '#e4f5fb', light: '#fffbf1', shade: '#6a82d0', glow: '#ffffff', glowK: 0.1, cloudLit: '#ffffff', cloudShade: '#a9bfe6', seaNear: '#0c3a9a', seaFar: '#3c8ad6' },
].map((k) => {
  const o = { el: k.el, glowK: k.glowK };
  for (const key of ['zenith', 'mid', 'horizon', 'sunSide', 'light', 'shade', 'glow', 'cloudLit', 'cloudShade', 'seaNear', 'seaFar']) o[key] = hex(k[key]);
  return o;
});

function sample(el) {
  if (el <= KEYS[0].el) return KEYS[0];
  if (el >= KEYS[KEYS.length - 1].el) return KEYS[KEYS.length - 1];
  let i = 0;
  while (KEYS[i + 1].el < el) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smoothstep(0, 1, (el - a.el) / (b.el - a.el));
  const o = {};
  for (const key in a) {
    o[key] = Array.isArray(a[key]) ? a[key].map((v, j) => lerp(v, b[key][j], t)) : lerp(a[key], b[key], t);
  }
  return o;
}

/**
 * Everything the renderer needs to know about one moment of the day.
 * `sky` = { clouds, gulls } from makeSky(); the same sky is used all day.
 */
export function skyState(hours, sky = {}) {
  const sunDir = sunDirection(hours);
  const moonDir = moonDirection(hours);
  const sunEl = Math.asin(clamp(sunDir[1], -1, 1)) / DEG;
  const k = sample(sunEl);
  // Mornings are paler and cooler than evenings.
  const warmth = hours < 12 ? 0.55 : 1;
  const sunSide = k.sunSide.map((v, i) => lerp(k.horizon[i], v, warmth));
  const glowK = k.glowK * warmth;
  const night = smoothstep(-2, -10, sunEl);
  const moonUp = smoothstep(-2, 6, Math.asin(moonDir[1]) / DEG);
  // Key light: whatever the sun adds on top of the shade tone. By night a
  // faint blue moon takes over.
  const sunUp = smoothstep(-1.2, 1.5, sunEl);
  let keyDir = sunDir;
  let key = k.light.map((v, i) => Math.max(0, v - k.shade[i]) * sunUp);
  if (sunEl < -3) {
    keyDir = moonDir;
    const mk = 0.14 * night * moonUp;
    key = [0.5 * mk, 0.58 * mk, 0.9 * mk];
  }
  // Hemisphere: faces that look up see a little more sky, faces that look
  // down get a warmer, dimmer bounce.
  const amb = k.shade.map((v) => v * 1.04);
  const ground = [k.shade[0] * 0.86, k.shade[1] * 0.82, k.shade[2] * 0.8];
  return {
    hours,
    sunDir,
    sunEl,
    sunAz: Math.atan2(sunDir[0], -sunDir[2]) / DEG,
    moonDir,
    keyDir,
    key,
    keyOn: key[0] + key[1] + key[2] > 0.01,
    keyStrength: Math.min(1, (key[0] + key[1] + key[2]) / 1.2),
    zenith: k.zenith,
    mid: k.mid,
    horizon: k.horizon,
    sunSide,
    glow: k.glow,
    glowK,
    amb,
    ground,
    cloudLit: k.cloudLit,
    cloudShade: k.cloudShade,
    seaNear: k.seaNear,
    seaFar: k.seaFar,
    night,
    lights: smoothstep(1.5, -3.5, sunEl),
    stars: smoothstep(-5, -13, sunEl),
    // A film's own clock, if it keeps one: stars twinkle by it.
    t: sky.t,
    moonUp,
    clouds: sky.clouds || [],
    streaks: sky.streaks || [],
    gulls: sky.gulls || [],
  };
}

// ------------------------------------------------------------------ the sky's cast

// Cumulus that live on the sky dome, in degrees of azimuth and elevation,
// so they stay put as the camera turns and show up in every reflection.
// Plus a few long streaks low on the horizon, and gulls.
export function makeSky(rng, { clouds = [4, 6], streaks = [1, 3], gulls = [0, 4] } = {}) {
  const out = { clouds: [], streaks: [], gulls: [] };
  const n = rng.int(clouds[0], clouds[1]);
  for (let i = 0; i < n; i++) {
    const az = (i / Math.max(1, n)) * 360 + rng.range(-25, 25);
    const base = rng.range(1.5, 8);
    const width = rng.range(12, 26);
    const height = width * rng.range(0.26, 0.42);
    const puffs = [];
    // Crown: puffs strung along a domed envelope, bigger toward the middle.
    const nTop = rng.int(8, 12);
    for (let j = 0; j < nTop; j++) {
      const t = j / (nTop - 1);
      const env = Math.pow(Math.max(0, 1 - (2 * t - 1) ** 2), 0.55);
      const r = width * (0.06 + 0.075 * env) * rng.range(0.8, 1.2);
      puffs.push({ x: (t - 0.5) * width * 0.92, y: Math.max(r * 0.35, height * env * rng.range(0.78, 1.02) - r * 0.45), r });
    }
    // Body: broad puffs to fill in under the crown, one always at the center.
    puffs.push({ x: 0, y: width * 0.06, r: width * 0.2 });
    const nFill = rng.int(3, 5);
    for (let j = 0; j < nFill; j++) {
      const r = width * rng.range(0.13, 0.19);
      puffs.push({ x: rng.range(-0.34, 0.34) * width, y: r * rng.range(0.25, 0.5), r });
    }
    puffs.sort((a, b) => a.y - b.y); // paint order: upper puffs overlap lower ones
    let top = 0;
    let half = 0;
    for (const p of puffs) {
      top = Math.max(top, p.y + p.r);
      half = Math.max(half, Math.abs(p.x) + p.r);
    }
    out.clouds.push({ az, base, puffs, top, half });
  }
  const s = rng.int(streaks[0], streaks[1]);
  for (let i = 0; i < s; i++) {
    out.streaks.push({ az: rng.range(0, 360), el: rng.range(1.2, 5), w: rng.range(14, 40), h: rng.range(0.35, 0.9) });
  }
  const g = rng.int(gulls[0], gulls[1]);
  const gaz = rng.range(0, 360);
  for (let i = 0; i < g; i++) {
    out.gulls.push({ az: gaz + rng.range(-9, 9), el: rng.range(9, 20), s: rng.range(0.35, 0.7), a: rng.range(-0.25, 0.25) });
  }
  return out;
}

function wrapDeg(a) {
  a %= 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

// Lit fraction (0..1) of the cloud seen in this direction, or -1 for a miss.
// Each point takes the last puff (in paint order) that covers it. Shading is
// airbrushed: a soft roll from a bright crown to a cool, flat underside,
// with crisp silhouettes.
function evalClouds(S, az, el) {
  const clouds = S.clouds;
  if (!clouds.length || el < 0 || el > 50) return -1;
  const cosEl = Math.cos(el * DEG);
  for (let c = 0; c < clouds.length; c++) {
    const cl = clouds[c];
    const del = el - cl.base;
    if (del < 0 || del > cl.top) continue;
    const da = wrapDeg(az - cl.az) * cosEl;
    if (da < -cl.half || da > cl.half) continue;
    let hit = -1;
    let bx = 0;
    let by = 0;
    for (let p = 0; p < cl.puffs.length; p++) {
      const pf = cl.puffs[p];
      const x = da - pf.x;
      const y = del - pf.y;
      if (x * x + y * y < pf.r * pf.r) {
        hit = p;
        bx = x / pf.r;
        by = y / pf.r;
      }
    }
    if (hit < 0) continue;
    // One airbrushed form: mostly a gradient up through the whole cloud,
    // a little modeling from each puff, a lean toward the sun's side, and
    // a flat underside that stays in shade.
    const side = clamp(wrapDeg(S.sunAz - cl.az) / 60, -1, 1) * 0.55;
    const facing = (bx * side + by) / Math.hypot(side, 1);
    const vert = del / cl.top;
    let lit = 0.68 * smoothstep(0.04, 0.92, vert) + 0.32 * smoothstep(-0.5, 0.8, facing) + 0.12 * side * (da / cl.half);
    lit *= smoothstep(0, 0.2, vert);
    return clamp(lit, 0, 1);
  }
  return -1;
}

// ------------------------------------------------------------------ sky

/**
 * Color of the sky in direction (dx, dy, dz), written to out[0..2].
 * disc: draw sun, moon and gulls (off for soft reflections).
 */
export function skyColor(S, dx, dy, dz, out, disc = true) {
  const e = dy > 0 ? dy : 0;
  const sx = S.sunDir[0];
  const sy = S.sunDir[1];
  const sz = S.sunDir[2];
  const hl = Math.hypot(dx, dz) || 1;
  const sl = Math.hypot(sx, sz) || 1;
  const cosAz = (dx * sx + dz * sz) / (hl * sl);
  const side = Math.pow((cosAz + 1) * 0.5, 2.4);
  const Z = S.zenith;
  const M = S.mid;
  const Hn = S.horizon;
  const Hs = S.sunSide;
  const hr = Hn[0] + (Hs[0] - Hn[0]) * side;
  const hg = Hn[1] + (Hs[1] - Hn[1]) * side;
  const hb = Hn[2] + (Hs[2] - Hn[2]) * side;
  // White mist from the horizon, blue layered over it, deepest overhead.
  const blue = 1 - Math.exp(-e / 0.15);
  let r = hr + (M[0] - hr) * blue;
  let g = hg + (M[1] - hg) * blue;
  let b = hb + (M[2] - hb) * blue;
  const deep = Math.pow(smoothstep(0.16, 0.95, e), 0.85);
  r += (Z[0] - r) * deep;
  g += (Z[1] - g) * deep;
  b += (Z[2] - b) * deep;
  // Sprayed by hand, not computed: a faint, slow unevenness over the dome.
  const n = valueNoise(dx * 2.3 + e * 1.3 + 7.1, dz * 2.3 - e * 2.1) + 0.5 * valueNoise(dx * 5.7 - 3.3, dz * 5.7 + e * 4.4) - 0.75;
  const uneven = 1 + n * 0.04 * (0.35 + blue);
  r *= uneven;
  g *= uneven;
  b *= uneven;
  // Clamped: a slightly long direction must never make the halo explode.
  const cosA = Math.min(1, dx * sx + dy * sy + dz * sz);
  if (S.glowK > 0 && cosA > 0) {
    const k = S.glowK * (Math.pow(cosA, 8) * (1 - 0.7 * blue) + 0.5 * Math.pow(cosA, 400));
    r += (S.glow[0] - r) * k;
    g += (S.glow[1] - g) * k;
    b += (S.glow[2] - b) * k;
  }
  // Long low streaks, sprayed thin.
  const az = Math.atan2(dx, -dz) / DEG;
  const el = Math.asin(e) / DEG;
  for (let i = 0; i < S.streaks.length; i++) {
    const st = S.streaks[i];
    const u = wrapDeg(az - st.az) / st.w;
    const v = (el - st.el) / st.h;
    const q = u * u + v * v;
    if (q < 1) {
      const a = 0.55 * smoothstep(1, 0.25, q);
      const L = S.cloudLit;
      r += (L[0] * 0.8 + hr * 0.2 - r) * a;
      g += (L[1] * 0.8 + hg * 0.2 - g) * a;
      b += (L[2] * 0.8 + hb * 0.2 - b) * a;
    }
  }
  if (S.stars > 0 && e > 0.03) {
    const cell = 1.1;
    const cu = Math.floor((az * Math.cos(el * DEG)) / cell);
    const cv = Math.floor(el / cell);
    const h = hash2(cu, cv);
    if (h > 0.74) {
      const ox = 0.2 + 0.6 * hash2(cu + 71, cv - 13);
      const oy = 0.2 + 0.6 * hash2(cu - 29, cv + 47);
      const d = Math.hypot((az * Math.cos(el * DEG)) / cell - cu - ox, el / cell - cv - oy) * cell;
      const rad = 0.035 + 0.05 * hash2(cu + 5, cv + 9);
      if (d < rad) {
        let k = S.stars * smoothstep(0.03, 0.2, e) * (0.55 + 0.45 * h);
        if (S.t !== undefined) {
          // Each star shimmers at its own slow rate, more so near the
          // horizon, where there is more air to look through.
          const f = 2 + 4 * hash2(cu + 17, cv - 3);
          const w = Math.sin(S.t * f + 6.283 * hash2(cu - 41, cv + 23)) * (0.6 + 0.4 * Math.sin(S.t * f * 0.37 + h * 20));
          k *= 1 - (0.16 + 0.3 * (1 - smoothstep(4, 35, el))) * (0.5 + 0.5 * w);
        }
        r += (0.95 - r) * k;
        g += (0.93 - g) * k;
        b += (0.85 - b) * k;
      }
    }
  }
  const lit = evalClouds(S, az, el);
  if (lit >= 0) {
    const L = S.cloudLit;
    const D = S.cloudShade;
    r = D[0] + (L[0] - D[0]) * lit;
    g = D[1] + (L[1] - D[1]) * lit;
    b = D[2] + (L[2] - D[2]) * lit;
  } else if (disc) {
    if (S.sunEl > -1.5 && cosA > 0.99935) {
      // A stylized sun, larger than life, warmer as it sinks. Its edge is
      // masked crisp; the halo around it is sprayed.
      const k = smoothstep(0.99935, 0.99943, cosA);
      const warm = smoothstep(12, 0, S.sunEl);
      r += (1.3 - r) * k;
      g += (lerp(1.2, 0.86, warm) - g) * k;
      b += (lerp(1.0, 0.52, warm) - b) * k;
    }
    const m = S.moonDir;
    const cm = dx * m[0] + dy * m[1] + dz * m[2];
    if (S.night > 0.2 && cm > 0.99985) {
      const k = smoothstep(0.99985, 0.99989, cm) * S.moonUp * S.night;
      r += (1.05 - r) * k;
      g += (1.02 - g) * k;
      b += (0.9 - b) * k;
    } else if (S.night > 0.2 && cm > 0.998) {
      const k = 0.18 * S.night * S.moonUp * Math.pow((cm - 0.998) / 0.002, 3);
      r += (0.6 - r) * k;
      g += (0.62 - g) * k;
      b += (0.8 - b) * k;
    }
    // Gulls: a few flat "m" strokes.
    for (let i = 0; i < S.gulls.length; i++) {
      const gl = S.gulls[i];
      let x = wrapDeg(az - gl.az) * Math.cos(el * DEG);
      let y = el - gl.el;
      if (x < -gl.s * 1.2 || x > gl.s * 1.2 || y < -gl.s || y > gl.s) continue;
      const c = Math.cos(gl.a);
      const sn = Math.sin(gl.a);
      const u = x * c + y * sn;
      const v = -x * sn + y * c;
      const t = Math.abs(u) / gl.s;
      if (t > 1) continue;
      // flap: 1 is the gliding "m"; below zero the wingtips beat down.
      // w thickens the stroke, for pictures with few pixels to spare.
      const curve = gl.s * (0.34 * t - 0.16 * Math.sin(Math.PI * t)) * (gl.flap ?? 1);
      if (Math.abs(v - curve) < gl.s * 0.07 * (gl.w ?? 1) * (1.1 - 0.7 * t)) {
        const k = 0.75 * (1 - S.night);
        r += (0.2 - r) * k;
        g += (0.26 - g) * k;
        b += (0.4 - b) * k;
      }
    }
  }
  if (dy < 0) {
    // Below the horizon but nothing was hit: a hazy band.
    r = hr * 0.92;
    g = hg * 0.92;
    b = hb * 0.95;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

// Color of the sea where a downward ray meets it at height `level`.
const tmp = new Float64Array(3);
export function seaColor(S, level, ox, oy, oz, dx, dy, dz, out, pixelAngle = 0.0006) {
  const t = (level - oy) / dy;
  const x = ox + dx * t;
  const z = oz + dz * t;
  const k = 1 - Math.exp(-t / 900);
  let r = lerp(S.seaNear[0], S.seaFar[0], k);
  let g = lerp(S.seaNear[1], S.seaFar[1], k);
  let b = lerp(S.seaNear[2], S.seaFar[2], k);
  // Long swell strokes, thinning into the distance.
  const footprint = (t * pixelAngle) / Math.max(0.02, -dy);
  const spacing = 9;
  const fade = 1 - smoothstep(spacing * 0.06, spacing * 0.3, footprint);
  if (fade > 0) {
    const w = x / spacing + 0.6 * valueNoise(z * 0.018, x * 0.01) + 0.25 * Math.sin(z * 0.05);
    const f = w - Math.floor(w);
    if (f < 0.07) {
      const a = 0.22 * fade;
      r += (S.seaFar[0] - r) * a + 0.03 * a;
      g += (S.seaFar[1] - g) * a + 0.04 * a;
      b += (S.seaFar[2] - b) * a + 0.05 * a;
    }
  }
  // Glitter path under a low sun: broken horizontal dashes.
  const sd = S.sunDir;
  if (S.keyOn && sd[1] > -0.02 && sd[1] < 0.5) {
    const c = dx * sd[0] - dy * sd[1] + dz * sd[2];
    const spread = 0.965 + 0.03 * smoothstep(0, 0.5, sd[1]);
    if (c > spread) {
      const nse = valueNoise(x * 0.09, z * 0.9 + x * 0.02);
      const dash = smoothstep(0.52, 0.62, nse);
      const kk = dash * smoothstep(spread, 0.999, c) * (1 - smoothstep(0.25, 0.5, sd[1]));
      const warm = smoothstep(15, 0, S.sunEl);
      r += (1.05 - r) * kk;
      g += (lerp(1.0, 0.82, warm) - g) * kk;
      b += (lerp(0.9, 0.56, warm) - b) * kk;
    }
  }
  // Haze into the horizon color seen in this direction, and the thin bright
  // line a painter leaves where sea meets sky.
  skyColor(S, dx, 0.0001, dz, tmp, false);
  const haze = 1 - Math.exp(-t / 4200);
  r += (tmp[0] - r) * haze;
  g += (tmp[1] - g) * haze;
  b += (tmp[2] - b) * haze;
  const line = 1 - smoothstep(0.0006, 0.0035, -dy);
  out[0] = r + (tmp[0] * 1.08 - r) * line * 0.6;
  out[1] = g + (tmp[1] * 1.08 - g) * line * 0.6;
  out[2] = b + (tmp[2] * 1.05 - b) * line * 0.6;
}
