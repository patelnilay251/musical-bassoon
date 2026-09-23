// The screen layer of the film: what an arcade board of 1986 would draw
// over its backgrounds. The title logo, stage cards, the clock and the
// speedometer, typed captions, and the fades and mosaics between stages.
// Everything draws into RGBA8 at the film's native 384 x 216.

import { drawText, textWidth, band, mosaic, CELL } from '../src/pixelfont.js';

export const W = 384;
export const H = 216;
export { mosaic };

// Inks from the board's palette: 3 bits a channel, and a deep navy for
// shadows and outlines.
export const INK = {
  white: [255, 255, 255],
  cream: [255, 246, 219],
  yellow: [255, 219, 73],
  pink: [255, 109, 170],
  cyan: [109, 219, 255],
  mint: [109, 255, 200],
  navy: [18, 20, 72],
  ink: [6, 6, 30],
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) * (1 - u) * (1 - u);

// A lamp that blinks `hz` times a second, lit for `duty` of each blink.
export const blink = (t, hz, duty = 0.5) => (((t * hz) % 1) + 1) % 1 < duty;

// 20.8 -> "8:48 PM"
export function clockText(hours) {
  const m = Math.floor(hours * 60 + 1e-6) % 1440;
  const hh = Math.floor(m / 60);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

// Palette fades on old hardware step through a few levels; so do these.
// Applied before quantizing, so each step dithers.
export function fade(img, k, steps = 8) {
  if (k >= 1) return;
  const q = Math.round(clamp01(k) * steps) / steps;
  for (let i = 0; i < img.length; i += 4) {
    img[i] *= q;
    img[i + 1] *= q;
    img[i + 2] *= q;
  }
}

export function whiten(img, k) {
  if (k <= 0) return;
  for (let i = 0; i < img.length; i += 4) {
    img[i] += (255 - img[i]) * k;
    img[i + 1] += (255 - img[i + 1]) * k;
    img[i + 2] += (255 - img[i + 2]) * k;
  }
}

// ---------------------------------------------------------------- title

// Sunset in seven bands, one per row of the font.
const LOGO = [
  [255, 250, 200],
  [255, 230, 90],
  [255, 196, 50],
  [255, 150, 40],
  [255, 112, 80],
  [245, 80, 120],
  [214, 50, 150],
];

/**
 * PALOMA BAY, dropped in a letter at a time. t: seconds since the first
 * letter fell. shine: position of the glint sweeping across (0..1), or null.
 */
export function logo(img, t, { y = 28, shine = null, alpha = 1 } = {}) {
  const text = 'PALOMA BAY';
  const scale = 4;
  const w = textWidth(text, scale);
  const x0 = Math.round((W - w) / 2);
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue;
    const ti = t - i * LETTER;
    if (ti < 0) continue;
    const lx = x0 + i * CELL * scale;
    const fill = (u, v, row) => {
      const gu = (lx - x0 + u * 20) / w;
      if (shine !== null && Math.abs(gu + v * 0.35 - shine) < 0.03) return INK.white;
      // A hot rim along the top of each letter, then the bands.
      return v < 0.04 ? INK.white : LOGO[row];
    };
    drawText(img, W, H, text[i], lx, y + drop(ti), { scale, fill, outline: INK.ink, shadow: null, shear: 0.14, alpha });
  }
}

export const LETTER = 0.075; // seconds between letters

// Falls from above the frame and bounces twice.
function drop(t) {
  const T = 0.32;
  if (t < T) return -70 * (1 - (t / T) ** 2);
  const b1 = 0.16;
  if (t < T + b1) {
    const u = (t - T) / b1;
    return -9 * 4 * u * (1 - u);
  }
  const b2 = 0.09;
  if (t < T + b1 + b2) {
    const u = (t - T - b1) / b2;
    return -3 * 4 * u * (1 - u);
  }
  return 0;
}

export function subtitle(img, text, y, alpha = 1) {
  drawText(img, W, H, text, W / 2, y, { fill: INK.cyan, shadow: INK.ink, align: 'center', spacing: 2, alpha });
}

export function centered(img, text, y, { fill = INK.white, scale = 1, alpha = 1, spacing = 0, shadow = INK.ink } = {}) {
  return drawText(img, W, H, text, W / 2, y, { fill, scale, alpha, spacing, shadow, align: 'center' });
}

export function corner(img, text, { right = false, bottom = false, fill = INK.white, alpha = 1 } = {}) {
  drawText(img, W, H, text, right ? W - 8 : 8, bottom ? H - 15 : 8, { fill, alpha, shadow: INK.ink, align: right ? 'right' : 'left' });
}

// ---------------------------------------------------------------- stage cards

export const CARD = 2.2; // seconds a stage card is up

/**
 * STAGE n / THE PLACE / the time, on a band that wipes in from the right
 * and slides out to the left. t: seconds since the card came up.
 */
export function stageCard(img, t, { stage, name, time }) {
  if (t < 0 || t > CARD) return;
  const inU = easeOut(clamp01(t / 0.28));
  const outU = ease(clamp01((t - (CARD - 0.32)) / 0.32));
  const dx = Math.round(W * (1 - inU) - W * outU);
  const y0 = 80;
  const y1 = 137;
  band(img, W, H, y0, y1, INK.navy, 0.72, dx, dx + W);
  band(img, W, H, y0, y0 + 1, INK.pink, 1, dx, dx + W);
  band(img, W, H, y1 - 1, y1, INK.cyan, 1, dx, dx + W);
  // The text trails the band a little on the way in.
  const lag = Math.round(60 * (1 - easeOut(clamp01((t - 0.06) / 0.34))));
  const x = W / 2 + dx + lag;
  drawText(img, W, H, stage, x, y0 + 7, { fill: INK.yellow, shadow: INK.ink, align: 'center', spacing: 2 });
  drawText(img, W, H, name, x, y0 + 19, { scale: 2, fill: INK.white, shadow: INK.ink, align: 'center' });
  drawText(img, W, H, time, x, y0 + 40, { fill: INK.cyan, shadow: INK.ink, align: 'center', spacing: 1 });
}

// ---------------------------------------------------------------- HUD

export function hud(img, { place, hours, alpha = 1 }) {
  if (alpha <= 0) return;
  drawText(img, W, H, place, 8, 8, { fill: INK.white, shadow: INK.ink, alpha });
  drawText(img, W, H, clockText(hours), W - 8, 8, { fill: INK.yellow, shadow: INK.ink, align: 'right', alpha });
}

// A driving game's speedometer: the number, and a bar of segments.
export function speedometer(img, mph, alpha = 1) {
  if (alpha <= 0) return;
  const x = 8;
  const y = H - 30;
  drawText(img, W, H, 'SPEED', x, y, { fill: INK.cyan, shadow: INK.ink, alpha, spacing: 1 });
  const n = String(Math.round(mph)).padStart(3, ' ');
  drawText(img, W, H, n, x, y + 10, { scale: 2, fill: INK.white, shadow: INK.ink, alpha });
  drawText(img, W, H, 'MPH', x + 38, y + 17, { fill: INK.yellow, shadow: INK.ink, alpha });
  const lit = Math.round(clamp01(mph / 60) * 12);
  for (let i = 0; i < 12; i++) {
    const c = i < lit ? (i >= 9 ? INK.pink : i >= 6 ? INK.yellow : INK.mint) : INK.navy;
    const sx = x + 62 + i * 5;
    band(img, W, H, y + 20 - Math.min(8, 2 + i * 0.6), y + 24, INK.ink, alpha, sx - 1, sx + 4);
    band(img, W, H, y + 21 - Math.min(8, 2 + i * 0.6), y + 23, c, alpha, sx, sx + 3);
  }
}

// ---------------------------------------------------------------- captions

/**
 * Text that types itself out, `cps` letters a second, from t = 0.
 * Returns how many letters are showing (the sound effects count them too).
 */
export function typed(img, text, t, y, { cps = 14, scale = 2, fill = INK.cream, alpha = 1 } = {}) {
  if (t < 0) return 0;
  const n = Math.min(text.length, Math.floor(t * cps) + 1);
  const w = textWidth(text, scale);
  const x = Math.round((W - w) / 2);
  drawText(img, W, H, text.slice(0, n), x, y, { scale, fill, shadow: INK.ink, alpha });
  // A block cursor while it types.
  if (n < text.length && blink(t, 8)) band(img, W, H, y, y + 7 * scale, INK.white, alpha, x + n * CELL * scale, x + n * CELL * scale + 5 * scale);
  return n;
}
