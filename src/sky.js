// Time of day: the sun's real path, the sky palette it implies, and the
// functions that color any ray that escapes the world (sky and sea).
//
// World axes: +x east, +y up, +z south. The sea lies to the west.

import { DEG, clamp, lerp, smoothstep, hex, hash2, valueNoise } from './math.js';

export const LATITUDE = 34 * DEG; // Southern California
export const DECLINATION = 19 * DEG; // late July: the long end of summer
export const SEA_LEVEL = -14;

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

// Palette keyframes by solar elevation (degrees). Each moment names a
// light tone and a shade tone directly, the way an illustrator would:
// a lit face is its local color times `light`, a face in shadow is its
// local color times `shade`. Shadows are a change of hue, not a loss of it.
const KEYS = [
  { el: -18, zenith: '#050a22', horizon: '#141d49', sunSide: '#18204e', light: '#262c68', shade: '#262c68', glow: '#000000', glowK: 0, cloudLit: '#28305e', cloudShade: '#141a3c', seaNear: '#070d2e', seaFar: '#141c48' },
  { el: -9, zenith: '#0c1440', horizon: '#2e3474', sunSide: '#4c3f80', light: '#383c7e', shade: '#383c7e', glow: '#6a4a8a', glowK: 0.15, cloudLit: '#4a4580', cloudShade: '#1f2352', seaNear: '#0c1540', seaFar: '#2a3070' },
  { el: -4, zenith: '#18236a', horizon: '#6b5a9e', sunSide: '#c26e84', light: '#5a5898', shade: '#5a5898', glow: '#d27886', glowK: 0.3, cloudLit: '#b07a9e', cloudShade: '#44447e', seaNear: '#172062', seaFar: '#6a5a9a' },
  { el: -0.8, zenith: '#26348a', horizon: '#c182a8', sunSide: '#fb9a66', light: '#7a6aa8', shade: '#7a6aa8', glow: '#ff9058', glowK: 0.5, cloudLit: '#f7a58e', cloudShade: '#6e5f9c', seaNear: '#233282', seaFar: '#c08aa8' },
  { el: 2.5, zenith: '#2c4398', horizon: '#e0a0a8', sunSide: '#ffb070', light: '#ffb38a', shade: '#8a7cb8', glow: '#ffa060', glowK: 0.55, cloudLit: '#ffbd94', cloudShade: '#8a78ae', seaNear: '#26409a', seaFar: '#dca0a4' },
  { el: 7, zenith: '#3155b4', horizon: '#ecd0c0', sunSide: '#ffcc90', light: '#ffd4a2', shade: '#9290c8', glow: '#ffc080', glowK: 0.4, cloudLit: '#ffe0b8', cloudShade: '#a4a2c8', seaNear: '#2750a8', seaFar: '#c8c4d0' },
  { el: 15, zenith: '#2a5cc0', horizon: '#cde4ee', sunSide: '#f4e2c4', light: '#ffecce', shade: '#8f9bd3', glow: '#fff0d0', glowK: 0.22, cloudLit: '#fff6e6', cloudShade: '#b4c0e0', seaNear: '#2358b4', seaFar: '#9cc4e4' },
  { el: 30, zenith: '#1f58c2', horizon: '#b0dcf0', sunSide: '#d4ecf2', light: '#fff6e6', shade: '#8ea1d9', glow: '#ffffff', glowK: 0.14, cloudLit: '#ffffff', cloudShade: '#bccbe8', seaNear: '#1d56b8', seaFar: '#7ab4e2' },
  { el: 75, zenith: '#174dba', horizon: '#9fd4f0', sunSide: '#bfe4f4', light: '#fff9ee', shade: '#8fa4dc', glow: '#ffffff', glowK: 0.12, cloudLit: '#ffffff', cloudShade: '#bfd0ec', seaNear: '#1a52b6', seaFar: '#6aaee0' },
].map((k) => {
  const o = { el: k.el, glowK: k.glowK };
  for (const key of ['zenith', 'horizon', 'sunSide', 'light', 'shade', 'glow', 'cloudLit', 'cloudShade', 'seaNear', 'seaFar']) o[key] = hex(k[key]);
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
 * `clouds` comes from makeClouds(); the same list is used all day.
 */
export function skyState(hours, clouds = []) {
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
    const mk = 0.16 * night * moonUp;
    key = [0.5 * mk, 0.58 * mk, 0.9 * mk];
  }
  // Hemisphere: faces that look up see a little more sky, faces that look
  // down get a warmer, dimmer bounce.
  const amb = k.shade.map((v) => v * 1.05);
  const ground = [k.shade[0] * 0.88, k.shade[1] * 0.84, k.shade[2] * 0.8];
  return {
    hours,
    sunDir,
    sunEl,
    moonDir,
    keyDir,
    key,
    keyOn: key[0] + key[1] + key[2] > 0.01,
    zenith: k.zenith,
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
    moonUp,
    clouds,
  };
}

// ------------------------------------------------------------------ clouds
// Flat-bottomed cumulus that live on the sky dome, described in degrees of
// azimuth and elevation, so they stay put as the camera turns and show up
// in every reflection.

export function makeClouds(rng) {
  const clouds = [];
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * 360 + rng.range(-25, 25);
    const base = rng.range(2.5, 9);
    const width = rng.range(9, 22);
    const puffs = [];
    const m = rng.int(4, 7);
    for (let j = 0; j < m; j++) {
      const t = m === 1 ? 0.5 : j / (m - 1);
      const x = (t - 0.5) * width;
      const bulge = Math.sin(t * Math.PI);
      const r = width * rng.range(0.12, 0.2) * (0.6 + 0.6 * bulge);
      puffs.push({ x, y: r * rng.range(0.25, 0.55) + bulge * width * 0.04, r });
    }
    // One or two crowning puffs give the silhouette its tower.
    const crowns = rng.int(1, 2);
    for (let j = 0; j < crowns; j++) {
      const r = width * rng.range(0.16, 0.24);
      puffs.push({ x: rng.range(-0.18, 0.18) * width, y: r * 0.9 + width * 0.08, r });
    }
    // Paint order: lower puffs first, so upper ones overlap them.
    puffs.sort((a, b) => a.y - b.y);
    let top = 0;
    let half = 0;
    for (const p of puffs) {
      top = Math.max(top, p.y + p.r);
      half = Math.max(half, Math.abs(p.x) + p.r);
    }
    clouds.push({ az, base, puffs, top, half });
  }
  return clouds;
}

function wrapDeg(a) {
  a %= 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

// Returns 0 when the direction misses every cloud, 1 for the shaded side
// and 2 for the lit side. Each point takes the last puff (in paint order)
// that covers it, lit mostly from above and a little from the sun's side,
// so every puff gets a bright crown and a cool underside.
function evalClouds(S, az, el) {
  const clouds = S.clouds;
  if (!clouds.length || el < 0 || el > 45) return 0;
  const sunAz = Math.atan2(S.sunDir[0], -S.sunDir[2]) / DEG;
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
    const side = clamp(wrapDeg(sunAz - cl.az) / 60, -1, 1) * 0.55;
    const ll = Math.hypot(side, 1);
    const facing = (bx * side + by) / ll;
    const underside = del < cl.top * 0.14;
    return !underside && facing > -0.05 ? 2 : 1;
  }
  return 0;
}

// ------------------------------------------------------------------ sky

/**
 * Color of the sky in direction (dx, dy, dz), written to out[0..2].
 * disc: draw sun and moon discs (off for blurry reflections).
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
  const Hn = S.horizon;
  const Hs = S.sunSide;
  const hr = Hn[0] + (Hs[0] - Hn[0]) * side;
  const hg = Hn[1] + (Hs[1] - Hn[1]) * side;
  const hb = Hn[2] + (Hs[2] - Hn[2]) * side;
  const g = Math.pow(e, 0.5);
  let r = hr + (Z[0] - hr) * g;
  let gg = hg + (Z[1] - hg) * g;
  let b = hb + (Z[2] - hb) * g;
  const cosA = dx * sx + dy * sy + dz * sz;
  if (S.glowK > 0 && cosA > 0) {
    const k = S.glowK * Math.pow(cosA, 10) * (1 - 0.75 * g);
    r += (S.glow[0] - r) * k;
    gg += (S.glow[1] - gg) * k;
    b += (S.glow[2] - b) * k;
  }
  if (S.stars > 0 && e > 0.03) {
    const az = Math.atan2(dx, -dz) / DEG;
    const el = Math.asin(e) / DEG;
    const cell = 1.1;
    const u = (az * Math.cos(el * DEG)) / cell;
    const v = el / cell;
    const cu = Math.floor(u);
    const cv = Math.floor(v);
    const h = hash2(cu, cv);
    if (h > 0.74) {
      const ox = 0.2 + 0.6 * hash2(cu + 71, cv - 13);
      const oy = 0.2 + 0.6 * hash2(cu - 29, cv + 47);
      const d = Math.hypot(u - cu - ox, v - cv - oy) * cell;
      const rad = 0.035 + 0.05 * hash2(cu + 5, cv + 9);
      if (d < rad) {
        const k = S.stars * smoothstep(0.03, 0.2, e) * (0.55 + 0.45 * h);
        r += (0.95 - r) * k;
        gg += (0.93 - gg) * k;
        b += (0.85 - b) * k;
      }
    }
  }
  const hit = evalClouds(S, Math.atan2(dx, -dz) / DEG, Math.asin(e) / DEG);
  if (hit) {
    const C = hit === 2 ? S.cloudLit : S.cloudShade;
    r = C[0];
    gg = C[1];
    b = C[2];
  } else if (disc) {
    if (S.sunEl > -1.5 && cosA > 0.9994) {
      // A stylized sun, larger than life, warmer as it sinks.
      const k = smoothstep(0.9994, 0.99965, cosA);
      const warm = smoothstep(12, 0, S.sunEl);
      r += (1.0 - r) * k;
      gg += (lerp(0.97, 0.78, warm) - gg) * k;
      b += (lerp(0.86, 0.5, warm) - b) * k;
    }
    const m = S.moonDir;
    const cm = dx * m[0] + dy * m[1] + dz * m[2];
    if (S.night > 0.2 && cm > 0.99985) {
      const k = smoothstep(0.99985, 0.99992, cm) * S.moonUp * S.night;
      r += (0.96 - r) * k;
      gg += (0.94 - gg) * k;
      b += (0.84 - b) * k;
    } else if (S.night > 0.2 && cm > 0.998) {
      const k = 0.18 * S.night * S.moonUp * Math.pow((cm - 0.998) / 0.002, 3);
      r += (0.6 - r) * k;
      gg += (0.62 - gg) * k;
      b += (0.8 - b) * k;
    }
  }
  if (dy < 0) {
    // Below the horizon but nothing was hit: a hazy band.
    r = hr * 0.92;
    gg = hg * 0.92;
    b = hb * 0.95;
  }
  out[0] = r;
  out[1] = gg;
  out[2] = b;
}

// Color of the sea where a downward ray meets it.
const tmp = new Float64Array(3);
export function seaColor(S, ox, oy, oz, dx, dy, dz, out, pixelAngle = 0.0006) {
  const t = (SEA_LEVEL - oy) / dy;
  const x = ox + dx * t;
  const z = oz + dz * t;
  const k = 1 - Math.exp(-t / 900);
  let r = lerp(S.seaNear[0], S.seaFar[0], k);
  let g = lerp(S.seaNear[1], S.seaFar[1], k);
  let b = lerp(S.seaNear[2], S.seaFar[2], k);
  // Long swell lines parallel to the shore, thinning into the distance.
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
    const rx = dx;
    const ry = -dy;
    const rz = dz;
    const c = rx * sd[0] + ry * sd[1] + rz * sd[2];
    const spread = 0.965 + 0.03 * smoothstep(0, 0.5, sd[1]);
    if (c > spread) {
      const n = valueNoise(x * 0.09, z * 0.9 + x * 0.02);
      const dash = smoothstep(0.52, 0.62, n);
      const k = dash * smoothstep(spread, 0.999, c) * (1 - smoothstep(0.25, 0.5, sd[1]));
      const warm = smoothstep(15, 0, S.sunEl);
      r += (1.0 - r) * k;
      g += (lerp(0.96, 0.8, warm) - g) * k;
      b += (lerp(0.86, 0.55, warm) - b) * k;
    }
  }
  // Haze into the horizon color seen in this direction.
  skyColor(S, dx, 0.0001, dz, tmp, false);
  const haze = 1 - Math.exp(-t / 4200);
  out[0] = r + (tmp[0] - r) * haze;
  out[1] = g + (tmp[1] - g) * haze;
  out[2] = b + (tmp[2] - b) * haze;
}
