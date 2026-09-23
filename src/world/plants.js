// Flowering shrubs: bougainvillea, hibiscus, oleander, lantana. Dark green
// mounds studded with blossoms, the dots of hot color that pictures of
// this kind scatter along pool walls, drives and sidewalks.

import { CAST, SMOOTH, DOUBLE } from '../mesh.js';

// The blossom colors, a main tone and a lighter one mixed through it.
export const FLOWERS = {
  bougainvillea: ['bougainvillea', 'bougainvilleaLight'],
  hibiscus: ['hibiscus', 'hibiscusLight'],
  oleander: ['oleander', 'blossomWhite'],
  lantana: ['lantana', 'lantanaLight'],
};

/**
 * A flowering bush standing on y = 0 in its own frame: `r` wide, `h` tall,
 * `kind` one of FLOWERS, `bloom` how thickly it flowers (1: covered).
 */
export function addFlowerBush(b, M, rng, { r = 0.9, h = 0.85, kind = 'bougainvillea', bloom = 1 } = {}) {
  b.object();
  // The body: a few squashed spheres heaped into one mound.
  const lobes = [];
  const n = 3 + Math.floor(rng.range(0, 3));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const d = i === 0 ? 0 : r * rng.range(0.25, 0.5);
    const lr = r * (i === 0 ? 0.72 : rng.range(0.42, 0.6));
    lobes.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: h * (i === 0 ? 0.5 : rng.range(0.32, 0.45)), r: lr, sy: (h / r) * rng.range(0.8, 1.0) });
  }
  b.use(M.bush, CAST | SMOOTH);
  for (const l of lobes) {
    b.push();
    b.translate(l.x, l.y, l.z);
    b.scale(1, l.sy, 1);
    b.sphere(l.r, 10, 6);
    b.pop();
  }
  // Blossoms: small five-petaled dots on the sunny upper surface.
  const [main, light] = FLOWERS[kind] ?? FLOWERS.bougainvillea;
  const count = Math.round(bloom * 70 * (r / 0.9) ** 2);
  for (let k = 0; k < count; k++) {
    const l = lobes[Math.floor(rng.range(0, lobes.length))];
    const th = rng.range(0, Math.PI * 2);
    const ph = rng.range(0.05, 1.25); // from the top down to a little below the equator
    const nx = Math.sin(ph) * Math.cos(th);
    const ny = Math.cos(ph);
    const nz = Math.sin(ph) * Math.sin(th);
    const cx = l.x + nx * l.r * 1.02;
    const cy = l.y + ny * l.r * l.sy * 1.02;
    const cz = l.z + nz * l.r * 1.02;
    // Two tangents to lay the dot on the surface.
    const tx = [-nz, 0, nx];
    const tl = Math.hypot(tx[0], tx[2]) || 1;
    tx[0] /= tl;
    tx[2] /= tl;
    const ty = [ny * tx[2], nz * tx[0] - nx * tx[2], -ny * tx[0]];
    const s = rng.range(0.055, 0.1) * (0.8 + 0.4 * (r / 0.9));
    b.use(rng.chance(0.3) ? M[light] : M[main], DOUBLE);
    const pts = [];
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + th;
      const rr = s * (p % 2 ? 0.8 : 1);
      pts.push([cx + (tx[0] * Math.cos(a) + ty[0] * Math.sin(a)) * rr, cy + (tx[1] * Math.cos(a) + ty[1] * Math.sin(a)) * rr, cz + (tx[2] * Math.cos(a) + ty[2] * Math.sin(a)) * rr]);
    }
    for (let p = 1; p < 4; p++) b.tri(pts[0], pts[p], pts[p + 1]);
  }
}

/**
 * Plant `n` bushes in `zone` = [x0, x1, z0, z1] at least `gap` apart and
 * wherever ok(x, z) allows. ground(x, z) gives the height to stand on.
 */
export function plantBushes(b, M, rng, zone, n, { ok = () => true, gap = 2.2, ground = () => 0, kinds = ['bougainvillea', 'hibiscus', 'oleander'], size = [0.7, 1.15], placed = [] } = {}) {
  let tries = 0;
  let got = 0;
  while (got < n && tries++ < 300) {
    const x = rng.range(zone[0], zone[1]);
    const z = rng.range(zone[2], zone[3]);
    if (!ok(x, z)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    const r = rng.range(size[0], size[1]);
    b.push();
    b.translate(x, ground(x, z), z);
    b.rotateY(rng.range(0, Math.PI * 2));
    addFlowerBush(b, M, rng.fork(got + 1), { r, h: r * rng.range(0.8, 1.05), kind: kinds[Math.floor(rng.range(0, kinds.length))], bloom: rng.range(0.8, 1.2) });
    b.pop();
    placed.push({ x, z, r });
    got++;
  }
  return placed;
}
