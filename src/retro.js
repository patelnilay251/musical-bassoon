// The look of late-eighties game footage: a picture reduced to a 512-color
// master palette (three bits a channel, like the consoles of the day) with
// a 4x4 ordered dither, then enlarged with hard pixels and scanlines.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// In place, on RGBA8 pixels.
export function quantize(rgba, W, H, { bits = 3, dither = 1 } = {}) {
  const levels = (1 << bits) - 1;
  const up = 255 / levels;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = ((BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5) * dither;
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const q = Math.round((rgba[i + c] / 255) * levels + t);
        rgba[i + c] = (q < 0 ? 0 : q > levels ? levels : q) * up;
      }
    }
  }
  return rgba;
}

// Enlarge by an integer factor into RGB24 (what ffmpeg reads): hard pixels,
// every pixel row ending in a darker scanline, a soft vignette.
export function enlarge(rgba, W, H, k, out = new Uint8Array(W * k * H * k * 3), { scan = 0.24, vignette = 0.18 } = {}) {
  const OW = W * k;
  const OH = H * k;
  for (let oy = 0; oy < OH; oy++) {
    const y = (oy / k) | 0;
    const line = oy % k === k - 1 ? 1 - scan : oy % k === 0 ? 1 - scan * 0.25 : 1;
    const vy = (oy / OH) * 2 - 1;
    for (let ox = 0; ox < OW; ox++) {
      const x = (ox / k) | 0;
      const vx = (ox / OW) * 2 - 1;
      const v = line * (1 - vignette * Math.pow(Math.min(1, (vx * vx + vy * vy) / 2), 1.5));
      const i = (y * W + x) * 4;
      const o = (oy * OW + ox) * 3;
      out[o] = rgba[i] * v;
      out[o + 1] = rgba[i + 1] * v;
      out[o + 2] = rgba[i + 2] * v;
    }
  }
  return out;
}
