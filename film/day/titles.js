// The film's lettering: the town's own sign alphabet (src/world/font.js),
// drawn flat as thin anti-aliased strokes with round ends, white over a
// soft shadow. Titles, the postcard captions and the closing line all use
// it, so the words on screen are made the same way as the signs in the
// pictures.

import { strokes } from '../../src/world/font.js';

const ADVANCE = 5.6; // letter pitch in font units (letters are 4 wide, 6 tall)

export function textWidth(text, cap, tracking = 0) {
  return (text.length * ADVANCE - 1.6) * (cap / 6) + tracking * Math.max(0, text.length - 1);
}

/**
 * Draw `text` into RGBA8 `img` (W x H). (x, y) is the left end of the
 * baseline, or its middle with align 'center'. cap: cap height in pixels.
 * weight: stroke width in pixels. tracking: extra pixels between letters.
 */
export function drawText(img, W, H, text, x, y, { cap = 24, weight = cap / 12, tracking = cap * 0.35, align = 'left', color = [255, 252, 244], alpha = 1, shadow = 0.45 } = {}) {
  if (alpha <= 0) return;
  const k = cap / 6;
  const w = textWidth(text, cap, tracking);
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const segs = [];
  let cx = x0;
  for (const ch of text) {
    const g = strokes(ch);
    if (g) for (const [ax, ay, bx, by] of g) segs.push([cx + ax * k, y - ay * k, cx + bx * k, y - by * k]);
    cx += ADVANCE * k + tracking;
  }
  // A soft shadow first, wider and offset, then the letters.
  if (shadow > 0) paint(img, W, H, segs, weight * 0.5 + Math.max(1.2, cap / 18), [8, 10, 34], alpha * shadow, Math.max(1, cap / 28), Math.max(1, cap / 28), Math.max(1.5, cap / 14));
  paint(img, W, H, segs, weight * 0.5, color, alpha, 0, 0, 0.75);
}

// Coverage of round-capped segments: 1 inside, falling off over `soft`
// pixels at the edge. Each pixel takes its nearest segment.
function paint(img, W, H, segs, half, color, alpha, ox, oy, soft) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [ax, ay, bx, by] of segs) {
    minX = Math.min(minX, ax, bx);
    maxX = Math.max(maxX, ax, bx);
    minY = Math.min(minY, ay, by);
    maxY = Math.max(maxY, ay, by);
  }
  const pad = half + soft + 1;
  const X0 = Math.max(0, Math.floor(minX + ox - pad));
  const X1 = Math.min(W - 1, Math.ceil(maxX + ox + pad));
  const Y0 = Math.max(0, Math.floor(minY + oy - pad));
  const Y1 = Math.min(H - 1, Math.ceil(maxY + oy + pad));
  for (let py = Y0; py <= Y1; py++) {
    for (let px = X0; px <= X1; px++) {
      const qx = px + 0.5 - ox;
      const qy = py + 0.5 - oy;
      let d = Infinity;
      for (const [ax, ay, bx, by] of segs) {
        if (qx < Math.min(ax, bx) - pad || qx > Math.max(ax, bx) + pad || qy < Math.min(ay, by) - pad || qy > Math.max(ay, by) + pad) continue;
        const vx = bx - ax;
        const vy = by - ay;
        const l2 = vx * vx + vy * vy;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((qx - ax) * vx + (qy - ay) * vy) / l2)) : 0;
        const ex = qx - ax - vx * t;
        const ey = qy - ay - vy * t;
        d = Math.min(d, Math.sqrt(ex * ex + ey * ey));
      }
      const cov = Math.max(0, Math.min(1, (half + soft * 0.5 - d) / soft));
      if (cov <= 0) continue;
      const a = cov * alpha;
      const o = (py * W + px) * 4;
      img[o] += (color[0] - img[o]) * a;
      img[o + 1] += (color[1] - img[o + 1]) * a;
      img[o + 2] += (color[2] - img[o + 2]) * a;
    }
  }
}
