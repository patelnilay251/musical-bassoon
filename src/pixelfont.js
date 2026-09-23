// A 5x7 bitmap font of the kind burned into arcade boards, for the HUD,
// stage cards and title screens. Drawn straight into RGBA8 pixels.

const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export const CELL = 6; // advance per character, in font pixels

export function textWidth(text, scale = 1) {
  return (text.length * CELL - 1) * scale;
}

/**
 * Draw `text` into RGBA8 `img` (W x H) with its top-left at (x, y).
 * fill: [r, g, b] or a function (u, v, row) -> [r, g, b] over the text box
 * (for gradient logos; row is the font row, 0..6). shadow: color of a drop
 * shadow, or null. outline: color of a one-pixel outline, or null.
 * shear: italic lean in font pixels per row. spacing: extra pixels
 * between letters.
 */
export function drawText(img, W, H, text, x, y, { scale = 1, fill = [255, 255, 255], shadow = [16, 18, 54], outline = null, shear = 0, align = 'left', alpha = 1, spacing = 0 } = {}) {
  const w = textWidth(text, scale) + spacing * Math.max(0, text.length - 1);
  const cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const cy = Math.round(y);
  const color = typeof fill === 'function' ? fill : () => fill;
  const plot = (px, py, c) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const o = (py * W + px) * 4;
    img[o] += (c[0] - img[o]) * alpha;
    img[o + 1] += (c[1] - img[o + 1]) * alpha;
    img[o + 2] += (c[2] - img[o + 2]) * alpha;
  };
  const d = Math.max(1, scale >> 1);
  const passes = [];
  if (shadow) passes.push(['shadow', [[d, d]]]);
  if (outline) passes.push(['outline', [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [d + 1, d + 1]]]);
  passes.push(['fill', [[0, 0]]]);
  for (const [pass, offsets] of passes) {
    let gx = cx;
    for (const ch of text.toUpperCase()) {
      const g = G[ch] ?? G['?'];
      for (let row = 0; row < 7; row++) {
        const lean = Math.round((6 - row) * shear * scale);
        for (let col = 0; col < 5; col++) {
          if (g[row][col] !== '#') continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = gx + col * scale + sx + lean;
              const py = cy + row * scale + sy;
              if (pass === 'fill') plot(px, py, color((px - cx) / Math.max(1, w), (row * scale + sy) / (7 * scale), row));
              else for (const [ox, oy] of offsets) plot(px + ox, py + oy, pass === 'shadow' ? shadow : outline);
            }
          }
        }
      }
      gx += CELL * scale + spacing;
    }
  }
  return w;
}

// A translucent band behind a caption, x0..x1 by y0..y1.
export function band(img, W, H, y0, y1, color = [14, 16, 48], alpha = 0.55, x0 = 0, x1 = W) {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x++) {
      const o = (y * W + x) * 4;
      img[o] += (color[0] - img[o]) * alpha;
      img[o + 1] += (color[1] - img[o + 1]) * alpha;
      img[o + 2] += (color[2] - img[o + 2]) * alpha;
    }
  }
}

// The consoles' favorite transition: the picture breaks into blocks.
export function mosaic(img, W, H, n) {
  if (n <= 1) return img;
  for (let by = 0; by < H; by += n) {
    for (let bx = 0; bx < W; bx += n) {
      const o = (Math.min(H - 1, by + (n >> 1)) * W + Math.min(W - 1, bx + (n >> 1))) * 4;
      const r = img[o];
      const g = img[o + 1];
      const b = img[o + 2];
      for (let y = by; y < Math.min(H, by + n); y++) {
        for (let x = bx; x < Math.min(W, bx + n); x++) {
          const q = (y * W + x) * 4;
          img[q] = r;
          img[q + 1] = g;
          img[q + 2] = b;
        }
      }
    }
  }
  return img;
}
