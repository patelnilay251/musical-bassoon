// The trees and plants of the hills behind the coast, drawn the way the
// palms are: in a few clean masses a painter would lay in with one color
// each, lit by the sun and airbrushed round (SMOOTH), never leaf by leaf.
//
// - Eucalyptus: pale, forked, leaning trunks under loose clumps of
//   grey-green; the windbreaks of every Californian field.
// - Italian cypress: dark flames, in pairs by a gate or a row by a drive.
// - Round trees: a short trunk and a heaped canopy, in yards and lots.
// - Agave: a rosette of stiff troughed leaves, blue-green.
// - Scrub: low grey-olive mounds of sage, scattered over the hills.
// - Ice plant: mats along the road's edge, dotted magenta.
//
// Each takes its own random stream (fork it), stands on `ground`, and
// takes `lod` (0.3 far to 1 near) for how finely it is cut.

import { CAST, SMOOTH, DOUBLE } from '../mesh.js';
import { normalize, cross, madd } from '../math.js';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// A squashed, turned sphere: one mass of leaves, for trees too far off
// for their lobes to show.
function clump(b, rng, c, r, { squash = 0.72, q = 1 } = {}) {
  b.push();
  b.translate(c[0], c[1], c[2]);
  b.rotateY(rng.range(0, Math.PI * 2));
  b.scale(1, squash * rng.range(0.85, 1.1), rng.range(0.8, 1));
  b.sphere(r, q > 0.6 ? 10 : q > 0.35 ? 7 : 6, q > 0.6 ? 6 : q > 0.35 ? 4 : 3);
  b.pop();
}

// The unit icosphere cut `level` times finer: 20 * 4^level faces, wound
// outward.
const ICO = [];
function ico(level) {
  if (ICO[level]) return ICO[level];
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(normalize);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let l = 0; l < level; l++) {
    const mids = new Map();
    const mid = (a, c) => {
      const k = Math.min(a, c) * 65536 + Math.max(a, c);
      let i = mids.get(k);
      if (i === undefined) {
        i = v.push(normalize([v[a][0] + v[c][0], v[a][1] + v[c][1], v[a][2] + v[c][2]])) - 1;
        mids.set(k, i);
      }
      return i;
    };
    f = f.flatMap(([a, c, d]) => {
      const ac = mid(a, c);
      const cd = mid(c, d);
      const da = mid(d, a);
      return [[a, ac, da], [c, cd, ac], [d, da, cd], [ac, cd, da]];
    });
  }
  return (ICO[level] = { v, f });
}

// A crown of leaves at `c`, about `r` out from its middle: a core heaped
// over with `lobes` lesser masses, made as one closed surface (as far out
// as any of them reaches, seen from the middle), so that its edge against
// the sky is scalloped and each lobe takes the sun on its own cap, the way
// a painter clusters a tree. `level` 1 (80 faces) far, to 3 (1280) near.
function crown(b, rng, c, r, { lobes = 7, squash = 0.78, level = 2, low = -0.4 } = {}) {
  const S = [[0, 0, 0, r * 0.6]];
  const az0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < lobes; i++) {
    // Over the top and round the sides by the golden angle; none beneath.
    const y = 0.97 - ((i + rng.range(0.2, 0.8)) / lobes) * (0.97 - low);
    const s = Math.sqrt(1 - y * y);
    const az = az0 + i * GOLDEN;
    const d = r * rng.range(0.5, 0.62);
    S.push([Math.cos(az) * s * d, y * d, Math.sin(az) * s * d, r * rng.range(0.37, 0.5)]);
  }
  const { v, f } = ico(level);
  const P = [];
  const N = [];
  for (const u of v) {
    // How far out along u the heap reaches, and which mass it is there.
    let far = 0;
    let k = 0;
    for (let j = 0; j < S.length; j++) {
      const [sx, sy, sz, sr] = S[j];
      const uc = u[0] * sx + u[1] * sy + u[2] * sz;
      const disc = uc * uc - (sx * sx + sy * sy + sz * sz) + sr * sr;
      if (disc < 0) continue;
      const t = uc + Math.sqrt(disc);
      if (t > far) {
        far = t;
        k = j;
      }
    }
    const [sx, sy, sz, sr] = S[k];
    const p = [u[0] * far, u[1] * far, u[2] * far];
    // Squashed, so the normals stretch the other way.
    P.push([c[0] + p[0], c[1] + p[1] * squash, c[2] + p[2]]);
    N.push(normalize([(p[0] - sx) / sr, (p[1] - sy) / (sr * squash), (p[2] - sz) / sr]));
  }
  for (const [i, j, k] of f) b.tri(P[i], P[j], P[k], null, [N[i], N[j], N[k]]);
}

export function addEucalyptus(b, rng, M, x, z, { height = rng.range(13, 22), ground = 0, lod = 1 } = {}) {
  const q = lod;
  const k = height / 16;
  const lean = rng.range(0.02, 0.12) * height;
  const la = rng.range(0, Math.PI * 2);
  const fork = rng.range(0.38, 0.55);
  b.object();
  b.use(M.bark, CAST | SMOOTH);
  // The trunk: up to the fork, leaning, from a foot that spreads.
  const n = q > 0.6 ? 7 : 4;
  const pts = [];
  const radii = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = t * fork;
    pts.push([x + Math.cos(la) * lean * s * s * 2, ground - 0.1 + height * s, z + Math.sin(la) * lean * s * s * 2]);
    radii.push(k * (0.34 * (1 - 0.35 * t) + 0.16 * Math.exp(-t * 9)));
  }
  b.tube(pts, radii, q > 0.6 ? 7 : 5);
  const fk = pts[n];
  // Limbs out of the fork, each bowing out and up to a clump of leaves.
  const limbs = rng.int(2, 4);
  const az0 = rng.range(0, Math.PI * 2);
  const ends = [];
  for (let i = 0; i < limbs; i++) {
    const az = az0 + (i / limbs) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const out = rng.range(0.35, 0.75);
    const len = (1 - fork) * height * rng.range(0.75, 1.02);
    const d = normalize([Math.cos(az) * out + Math.cos(la) * 0.2, 1, Math.sin(az) * out + Math.sin(la) * 0.2]);
    const lp = [];
    const lr = [];
    for (let j = 0; j <= 3; j++) {
      const t = j / 3;
      // Bowing: out early, then up.
      const bow = Math.sin(t * Math.PI * 0.5);
      lp.push([fk[0] + d[0] * len * t * (0.6 + 0.4 * bow), fk[1] + d[1] * len * t, fk[2] + d[2] * len * t * (0.6 + 0.4 * bow)]);
      lr.push(k * 0.2 * (1 - 0.7 * t));
    }
    b.tube(lp, lr, q > 0.6 ? 5 : 4, { capEnd: true });
    ends.push({ p: lp[3], mid: lp[2], az });
  }
  // The leaves: a loose crown of clumps at the limb ends, with sky
  // between them; near enough, each clump is lobed.
  b.use(M.eucalyptus, CAST | SMOOTH);
  const R = k * rng.range(2.2, 2.9);
  const mass = (p, r, squash, lobes) => (q > 0.45 ? crown(b, rng, p, r * 1.12, { lobes: q > 0.6 ? lobes + 2 : lobes, squash, level: q > 0.6 ? 2 : 1 }) : clump(b, rng, p, r, { squash, q }));
  for (const e of ends) {
    mass(e.p, R * rng.range(0.8, 1.1) * (q > 0.45 ? 1 : 1.15), 0.66, 5);
    // Lesser clumps on the limbs, lost in the greater far off.
    if (q > 0.6) mass([e.mid[0] + Math.cos(e.az) * R * 0.5, e.mid[1], e.mid[2] + Math.sin(e.az) * R * 0.5], R * rng.range(0.55, 0.75), 0.7, 3);
  }
  // One heaped over the middle, so the crown is one mass with ragged edges.
  const top = ends.reduce((a, e) => [a[0] + e.p[0] / ends.length, a[1] + e.p[1] / ends.length, a[2] + e.p[2] / ends.length], [0, 0, 0]);
  mass([top[0], top[1] + R * 0.35, top[2]], R * rng.range(0.9, 1.15), 0.6, 6);
  if (q > 0.6) {
    // A few hanging wisps of leaves under the crown.
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2);
      clump(b, rng, [top[0] + Math.cos(a) * R * 0.9, top[1] - R * 0.55, top[2] + Math.sin(a) * R * 0.9], R * 0.42, { squash: 0.9, q });
    }
  }
  return { top, height };
}

export function addCypress(b, rng, M, x, z, { height = rng.range(8, 14), ground = 0, lod = 1 } = {}) {
  const q = lod;
  const rMax = height * rng.range(0.065, 0.085);
  const ph = rng.range(0, Math.PI * 2);
  const lean = rng.range(-0.1, 0.1);
  const n = q > 0.6 ? 14 : 8;
  const pts = [];
  const radii = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // A flame: full low down, drawn to a point, a little uneven.
    const r = rMax * Math.sin(Math.PI * Math.pow(0.1 + 0.9 * t, 0.85)) * (1 + 0.07 * Math.sin(i * 2.3 + ph));
    pts.push([x + lean * t * t * height * 0.1, ground - 0.15 + (height + 0.15) * t, z]);
    radii.push(Math.max(0.02, r));
  }
  b.object();
  b.use(M.bark, CAST | SMOOTH);
  b.tube([[x, ground - 0.1, z], [x, ground + 0.5, z]], [0.1, 0.09], 5);
  b.use(M.cypress, CAST | SMOOTH);
  b.tube(pts, radii, q > 0.6 ? 10 : 6, { capEnd: true });
  return { height };
}

export function addRoundTree(b, rng, M, x, z, { height = rng.range(5, 8.5), ground = 0, lod = 1, mat = M.canopy } = {}) {
  const q = lod;
  const r = height * rng.range(0.3, 0.36);
  const stem = height - r * 1.3;
  const la = rng.range(0, Math.PI * 2);
  const lean = rng.range(0, 0.25);
  b.object();
  b.use(M.bark, CAST | SMOOTH);
  const topStem = [x + Math.cos(la) * lean, ground + stem, z + Math.sin(la) * lean];
  b.tube([[x, ground - 0.1, z], [x + Math.cos(la) * lean * 0.4, ground + stem * 0.5, z + Math.sin(la) * lean * 0.4], topStem], [0.2, 0.16, 0.12], q > 0.6 ? 6 : 4);
  // The crown: one heap of lobes, a little wider than it is tall, on
  // limbs that fork out of the top of the trunk into it.
  const R = r * 1.22;
  const c = [topStem[0], topStem[1] + R * 0.5, topStem[2]];
  if (q > 0.45) {
    const limbs = rng.int(2, 3);
    const az0 = rng.range(0, Math.PI * 2);
    for (let i = 0; i < limbs; i++) {
      const az = az0 + (i / limbs) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const out = R * rng.range(0.35, 0.5);
      b.tube([topStem, [topStem[0] + Math.cos(az) * out * 0.5, topStem[1] + R * 0.3, topStem[2] + Math.sin(az) * out * 0.5], [topStem[0] + Math.cos(az) * out, topStem[1] + R * 0.62, topStem[2] + Math.sin(az) * out]], [0.1, 0.07, 0.04], 4, { capEnd: true });
    }
  }
  b.use(mat, CAST | SMOOTH);
  crown(b, rng, c, R, { lobes: q > 0.35 ? rng.int(8, 11) : 5, squash: rng.range(0.74, 0.84), level: q > 0.45 ? 3 : q > 0.35 ? 2 : 1 });
  return { top: c, height };
}

// An agave on the ground at (x, z): a rosette of `size` meters.
export function addAgave(b, rng, M, x, z, { size = rng.range(0.6, 1.2), ground = 0 } = {}) {
  b.object();
  b.use(M.agave, CAST | DOUBLE);
  const n = rng.int(12, 18);
  const az0 = rng.range(0, Math.PI * 2);
  const o = [x, ground + 0.08, z];
  for (let i = 0; i < n; i++) {
    const az = az0 + i * GOLDEN + rng.range(-0.15, 0.15);
    // The inner leaves stand up, the outer ones spread and bend down.
    const inner = i / n < 0.35;
    const el = inner ? rng.range(0.9, 1.3) : rng.range(0.25, 0.7);
    const len = size * rng.range(0.75, 1.05) * (inner ? 0.85 : 1);
    const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    let side = cross(d, [0, 1, 0]);
    const sl = Math.hypot(side[0], side[1], side[2]) || 1;
    side = [side[0] / sl, side[1] / sl, side[2] / sl];
    const up = cross(side, d);
    const w = size * 0.11;
    const tip = madd(madd(o, d, len), [0, 1, 0], inner ? 0 : -len * 0.18);
    const mid = madd(madd(o, d, len * 0.45), up, -w * 0.5); // the trough
    const l = madd(madd(o, side, w), d, len * 0.1);
    const r = madd(madd(o, side, -w), d, len * 0.1);
    b.tri(l, mid, tip, [0, 0, 0.5, 0.5, 1, 1]);
    b.tri(mid, r, tip, [0.5, 0.5, 0, 0, 1, 1]);
    b.tri(o, mid, l, [0, 0, 0.5, 0.5, 0, 0]);
    b.tri(o, r, mid, [0, 0, 0, 0, 0.5, 0.5]);
  }
}

// A mound of sage scrub, `r` meters across: near, a low heap of lobes.
export function addScrub(b, rng, M, x, z, { r = rng.range(0.5, 1.3), ground = 0, lod = 1, mat = M.scrub } = {}) {
  b.object();
  b.use(mat, CAST | SMOOTH);
  if (lod > 0.6) {
    crown(b, rng, [x, ground + r * 0.22, z], r * 1.1, { lobes: rng.int(3, 5), squash: 0.55, level: 1, low: -0.1 });
    return;
  }
  clump(b, rng, [x, ground + r * 0.3, z], r, { squash: 0.55, q: lod });
}

// A mat of ice plant over w x d meters at (x, z), dotted with flowers.
export function addIcePlant(b, rng, M, x, z, { w = 3, d = 2, ground = 0, flowers = true } = {}) {
  b.object();
  b.use(M.icePlant, CAST | SMOOTH);
  const n = Math.max(2, Math.round((w * d) / 1.6));
  const spots = [];
  for (let i = 0; i < n; i++) {
    const px = x + rng.range(-w / 2, w / 2);
    const pz = z + rng.range(-d / 2, d / 2);
    const r = rng.range(0.45, 0.8);
    b.push();
    b.translate(px, ground, pz);
    b.scale(1, 0.2, rng.range(0.8, 1.2));
    b.sphere(r, 8, 4);
    b.pop();
    spots.push([px, ground + r * 0.2, pz, r]);
  }
  if (!flowers) return;
  b.use(M.icePlantFlower, DOUBLE);
  for (const [px, py, pz, r] of spots) {
    for (let k = 0; k < 5; k++) {
      const a = rng.range(0, Math.PI * 2);
      const dd = rng.range(0, r * 0.7);
      const cx = px + Math.cos(a) * dd;
      const cz = pz + Math.sin(a) * dd;
      const s = rng.range(0.05, 0.08);
      const y = py + 0.01;
      b.tri([cx - s, y, cz], [cx + s * 0.5, y, cz - s * 0.87], [cx + s * 0.5, y, cz + s * 0.87]);
    }
  }
}
