// The live painter's shaders, in WGSL: the same rules as src/sky.js and
// src/render.js, line for line where they can be, run per pixel on the
// GPU. Colors stay in the painter's own space (plain 0..1 values, never
// linearized), so a live frame and a painted one mix the same tones.

const COMMON = /* wgsl */ `
const PI = 3.141592653589793;
const DEG = 0.017453292519943295;

const CAST = 1u;
const DOUBLE = 2u;
const SMOOTH = 4u;
const UNDERWATER = 8u;
const NOREFLECT = 16u;
const DISTANT = 32u;

const K_DIFFUSE = 0u;
const K_FOLIAGE = 1u;
const K_GLASS = 2u;
const K_CHROME = 3u;
const K_PAINT = 4u;
const K_WATER = 5u;
const K_LAMP = 6u;
const K_DISTANT = 7u;
const K_HARBOR = 8u;
const K_NEON = 9u;

const P_NONE = 0u;
const P_DECK = 1u;
const P_LAWN = 2u;
const P_TILE = 3u;
const P_TRUNK = 4u;
const P_STRIPES = 5u;
const P_ROAD = 6u;
const P_SEGMENTS = 7u;
const P_PLANKS = 8u;
const P_FROND = 9u;
const P_SAND = 10u;

struct Frame {
  viewProj: mat4x4f,
  mirrorVP: mat4x4f,
  shadowMat: mat4x4f,
  eye: vec4f,        // xyz, pixel angle
  camF: vec4f,       // forward, tan(fov/2) * aspect
  camR: vec4f,       // right, tan(fov/2)
  camU: vec4f,       // up, lens shift
  screen: vec4f,     // width, height, ripple clock, star clock (< 0: none)
  zenith: vec4f,
  mid: vec4f,
  horizon: vec4f,
  sunSide: vec4f,
  glow: vec4f,       // rgb, glowK
  amb: vec4f,
  ground: vec4f,
  key: vec4f,        // rgb, keyOn
  keyDir: vec4f,     // xyz, keyStrength
  sunDir: vec4f,     // xyz, sun elevation
  moonDir: vec4f,    // xyz, moonUp
  cloudLit: vec4f,
  cloudShade: vec4f,
  seaNear: vec4f,
  seaFar: vec4f,
  misc: vec4f,       // night, lights, stars, sun azimuth
  skyLook: vec4f,    // mist, deep from, deep to, deep curve
  skyLook2: vec4f,   // uneven, low-sun streaks, sea level, mirrored pass
  haze: vec4f,       // far, near, from, to
  haze2: vec4f,      // depth, painted shade, light count, pool strokes
  frond: vec4f,      // base, tip, across, warm
  frond2: vec4f,     // warm tip, flecks, has pool, has reflection
  shadowInfo: vec4f, // texel (m), shadow on, depth bias, mirror height
  reflRect: vec4f,   // the part of the mirror that was painted, in uv
  nearMat: mat4x4f,  // the tight shadow map around the walker
  nearInfo: vec4f,   // texel (m), on, depth bias, texel (uv)
};

struct Material {
  color: vec3f,
  kind: u32,
  color2: vec3f,
  pattern: u32,
  emit: vec3f,
  scale: f32,
  emitK: f32,
  ao: u32,
  curtain: u32,
  switched: u32,
  laneAx: f32,
  laneAz: f32,
  laneStart: u32,
  laneCount: u32,
  detail: u32,       // close-up grain (pack.js DETAIL)
  pad0: u32,
  pad1: u32,
  pad2: u32,
};

struct Light {
  p: vec3f,
  r: f32,
  c: vec3f,
  k: f32,
};

// A place's water: a pool, open water (a harbor or the sea off a beach),
// or both.
struct Pool {
  rect: vec4f,    // pool x0, x1, z0, z1
  levels: vec4f,  // pool water y, floor y, pool wave count, open-water wave count
  tile: vec4f,
  lane: vec4f,
  water: vec4f,
  glow: vec4f,
  waves: array<vec4f, 4>, // the pool's: kx, kz, w, phase
  amps: vec4f,
  hwaves: array<vec4f, 4>, // open water's
  hamps: vec4f,
  near: vec4f,    // open water near, falloff
  far: vec4f,     // open water far, shallows (1/0)
  shallow: vec4f, // shallows: a.x, a.z, d, w
  shallowColor: vec4f,
};

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> mats: array<Material>;
@group(0) @binding(2) var<storage, read> shades: array<vec4f>;
@group(0) @binding(3) var<storage, read> lights: array<Light>;
@group(0) @binding(4) var<storage, read> lanes: array<f32>;
@group(0) @binding(5) var<storage, read> sky: array<vec4f>;
@group(0) @binding(6) var<uniform> pool: Pool;
@group(0) @binding(7) var shadowMap: texture_depth_2d;
@group(0) @binding(8) var shadowSampler: sampler_comparison;
@group(0) @binding(9) var reflTex: texture_2d<f32>;
@group(0) @binding(10) var linearSampler: sampler;
@group(0) @binding(11) var nearMap: texture_depth_2d;
@group(0) @binding(12) var<storage, read> panes: array<vec4f>; // a0, a1, y0, y1; nx, nz, -, -

// smoothstep as the painter writes it: edges may come in either order.
fn ss(e0: f32, e1: f32, x: f32) -> f32 {
  let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

fn orOne(x: f32) -> f32 {
  return select(x, 1.0, x == 0.0);
}

fn powz(x: f32, y: f32) -> f32 {
  return select(pow(x, y), 0.0, x <= 0.0);
}

// math.js hash2, bit for bit.
fn hash2(x: i32, y: i32) -> f32 {
  var h = (bitcast<u32>(x) * 0x27d4eb2du) ^ (bitcast<u32>(y) * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return f32(h ^ (h >> 16u)) / 4294967296.0;
}

fn valueNoise(x: f32, y: f32) -> f32 {
  let xf = floor(x);
  let yf = floor(y);
  let fx = x - xf;
  let fy = y - yf;
  let u = fx * fx * (3.0 - 2.0 * fx);
  let v = fy * fy * (3.0 - 2.0 * fy);
  let xi = i32(xf);
  let yi = i32(yf);
  let a = hash2(xi, yi);
  let b = hash2(xi + 1, yi);
  let c = hash2(xi, yi + 1);
  let d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

fn wrapDeg(a0: f32) -> f32 {
  var a = a0 % 360.0;
  if (a > 180.0) { a -= 360.0; }
  if (a < -180.0) { a += 360.0; }
  return a;
}
`;

// ------------------------------------------------------------------ sky and sea (src/sky.js)

const SKY = /* wgsl */ `
fn evalClouds(az: f32, el: f32) -> f32 {
  let n = u32(sky[0].x);
  if (n == 0u || el < 0.0 || el > 50.0) { return -1.0; }
  let cosEl = cos(el * DEG);
  let c0 = u32(sky[1].x);
  for (var c = 0u; c < n; c++) {
    let h0 = sky[c0 + c * 2u];      // az, base, top, half
    let h1 = sky[c0 + c * 2u + 1u]; // first puff, puff count
    let del = el - h0.y;
    if (del < 0.0 || del > h0.z) { continue; }
    let da = wrapDeg(az - h0.x) * cosEl;
    if (da < -h0.w || da > h0.w) { continue; }
    var hit = -1;
    var bx = 0.0;
    var by = 0.0;
    let ps = u32(h1.x);
    let pn = u32(h1.y);
    for (var p = 0u; p < pn; p++) {
      let pf = sky[ps + p];
      let x = da - pf.x;
      let y = del - pf.y;
      if (x * x + y * y < pf.z * pf.z) {
        hit = i32(p);
        bx = x / pf.z;
        by = y / pf.z;
      }
    }
    if (hit < 0) { continue; }
    let side = clamp(wrapDeg(F.misc.w - h0.x) / 60.0, -1.0, 1.0) * 0.55;
    let facing = (bx * side + by) / sqrt(side * side + 1.0);
    let vert = del / h0.z;
    var lit = 0.68 * ss(0.04, 0.92, vert) + 0.32 * ss(-0.5, 0.8, facing) + 0.12 * side * (da / h0.w);
    lit *= ss(0.0, 0.2, vert);
    return clamp(lit, 0.0, 1.0);
  }
  return -1.0;
}

fn skyColor(d: vec3f, disc: bool) -> vec3f {
  let dx = d.x;
  let dy = d.y;
  let dz = d.z;
  let e = max(dy, 0.0);
  let s = F.sunDir.xyz;
  let hl = orOne(sqrt(dx * dx + dz * dz));
  let sl = orOne(sqrt(s.x * s.x + s.z * s.z));
  let cosAz = (dx * s.x + dz * s.z) / (hl * sl);
  let side = powz((cosAz + 1.0) * 0.5, 2.4);
  let Z = F.zenith.rgb;
  let M = F.mid.rgb;
  let Hn = F.horizon.rgb;
  let Hs = F.sunSide.rgb;
  let hc = Hn + (Hs - Hn) * side;
  let blue = 1.0 - exp(-e / F.skyLook.x);
  var c = hc + (M - hc) * blue;
  let deep = powz(ss(F.skyLook.y, F.skyLook.z, e), F.skyLook.w);
  c += (Z - c) * deep;
  // Sprayed by hand, not computed: a faint, slow unevenness over the dome.
  let n = valueNoise(dx * 2.3 + e * 1.3 + 7.1, dz * 2.3 - e * 2.1) + 0.5 * valueNoise(dx * 5.7 - 3.3, dz * 5.7 + e * 4.4) - 0.75;
  c *= 1.0 + n * F.skyLook2.x * (0.35 + blue);
  let cosA = min(1.0, dx * s.x + dy * s.y + dz * s.z);
  if (F.glow.w > 0.0 && cosA > 0.0) {
    let k = F.glow.w * (powz(cosA, 8.0) * (1.0 - 0.7 * blue) + 0.5 * powz(cosA, 400.0));
    c += (F.glow.rgb - c) * k;
  }
  let az = atan2(dx, -dz) / DEG;
  let el = asin(min(e, 1.0)) / DEG;
  // Long low streaks, sprayed thin.
  let ns = u32(sky[0].y);
  let s0 = u32(sky[1].y);
  for (var i = 0u; i < ns; i++) {
    let st = sky[s0 + i]; // az, el, w, h
    let u = wrapDeg(az - st.x) / st.z;
    let v = (el - st.y) / st.w;
    let q = u * u + v * v;
    if (q < 1.0) {
      var a = 0.55 * ss(1.0, 0.25, q);
      if (F.skyLook2.y > 0.5) { a *= ss(12.0, 4.0, F.sunDir.w); }
      c += (F.cloudLit.rgb * 0.8 + hc * 0.2 - c) * a;
    }
  }
  if (F.misc.z > 0.0 && e > 0.03) {
    let cell = 1.1;
    let ce = cos(el * DEG);
    let cuf = floor((az * ce) / cell);
    let cvf = floor(el / cell);
    let cu = i32(cuf);
    let cv = i32(cvf);
    let h = hash2(cu, cv);
    if (h > 0.74) {
      let ox = 0.2 + 0.6 * hash2(cu + 71, cv - 13);
      let oy = 0.2 + 0.6 * hash2(cu - 29, cv + 47);
      let ddx = (az * ce) / cell - cuf - ox;
      let ddy = el / cell - cvf - oy;
      let dd = sqrt(ddx * ddx + ddy * ddy) * cell;
      let rad = 0.035 + 0.05 * hash2(cu + 5, cv + 9);
      if (dd < rad) {
        var k = F.misc.z * ss(0.03, 0.2, e) * (0.55 + 0.45 * h);
        let t = F.screen.w;
        if (t >= 0.0) {
          // Each star shimmers at its own slow rate, more near the horizon.
          let f = 2.0 + 4.0 * hash2(cu + 17, cv - 3);
          let w = sin(t * f + 6.283 * hash2(cu - 41, cv + 23)) * (0.6 + 0.4 * sin(t * f * 0.37 + h * 20.0));
          k *= 1.0 - (0.16 + 0.3 * (1.0 - ss(4.0, 35.0, el))) * (0.5 + 0.5 * w);
        }
        c += (vec3f(0.95, 0.93, 0.85) - c) * k;
      }
    }
  }
  let lit = evalClouds(az, el);
  if (lit >= 0.0) {
    c = F.cloudShade.rgb + (F.cloudLit.rgb - F.cloudShade.rgb) * lit;
  } else if (disc) {
    if (F.sunDir.w > -1.5 && cosA > 0.99935) {
      // A stylized sun, larger than life, warmer as it sinks.
      let k = ss(0.99935, 0.99943, cosA);
      let warm = ss(12.0, 0.0, F.sunDir.w);
      c += (vec3f(1.3, mix(1.2, 0.86, warm), mix(1.0, 0.52, warm)) - c) * k;
    }
    let m = F.moonDir.xyz;
    let cm = dx * m.x + dy * m.y + dz * m.z;
    let night = F.misc.x;
    if (night > 0.2 && cm > 0.99985) {
      let k = ss(0.99985, 0.99989, cm) * F.moonDir.w * night;
      c += (vec3f(1.05, 1.02, 0.9) - c) * k;
    } else if (night > 0.2 && cm > 0.998) {
      let k = 0.18 * night * F.moonDir.w * powz((cm - 0.998) / 0.002, 3.0);
      c += (vec3f(0.6, 0.62, 0.8) - c) * k;
    }
    // Gulls: a few flat "m" strokes.
    let ng = u32(sky[0].z);
    let g0 = u32(sky[1].z);
    for (var i = 0u; i < ng; i++) {
      let gl = sky[g0 + i * 2u];       // az, el, size, angle
      let gx = sky[g0 + i * 2u + 1u];  // flap, weight
      let x = wrapDeg(az - gl.x) * cos(el * DEG);
      let y = el - gl.y;
      if (x < -gl.z * 1.2 || x > gl.z * 1.2 || y < -gl.z || y > gl.z) { continue; }
      let cg = cos(gl.w);
      let sg = sin(gl.w);
      let u = x * cg + y * sg;
      let v = -x * sg + y * cg;
      let t = abs(u) / gl.z;
      if (t > 1.0) { continue; }
      let curve = gl.z * (0.34 * t - 0.16 * sin(PI * t)) * gx.x;
      if (abs(v - curve) < gl.z * 0.07 * gx.y * (1.1 - 0.7 * t)) {
        let k = 0.75 * (1.0 - night);
        c += (vec3f(0.2, 0.26, 0.4) - c) * k;
      }
    }
  }
  if (dy < 0.0) {
    c = hc * vec3f(0.92, 0.92, 0.95);
  }
  return c;
}

// The sea where a downward ray from o meets it (src/sky.js seaColor).
fn seaColor(o: vec3f, d: vec3f) -> vec3f {
  let level = F.skyLook2.z;
  let t = (level - o.y) / d.y;
  let x = o.x + d.x * t;
  let z = o.z + d.z * t;
  let k = 1.0 - exp(-t / 900.0);
  var c = mix(F.seaNear.rgb, F.seaFar.rgb, k);
  let footprint = (t * F.eye.w) / max(0.02, -d.y);
  let spacing = 9.0;
  let fade = 1.0 - ss(spacing * 0.06, spacing * 0.3, footprint);
  if (fade > 0.0) {
    let w = x / spacing + 0.6 * valueNoise(z * 0.018, x * 0.01) + 0.25 * sin(z * 0.05);
    let f = w - floor(w);
    if (f < 0.07) {
      let a = 0.22 * fade;
      c += (F.seaFar.rgb - c) * a + vec3f(0.03, 0.04, 0.05) * a;
    }
  }
  let sd = F.sunDir.xyz;
  if (F.key.w > 0.5 && sd.y > -0.02 && sd.y < 0.5) {
    let cc = d.x * sd.x - d.y * sd.y + d.z * sd.z;
    let spread = 0.965 + 0.03 * ss(0.0, 0.5, sd.y);
    if (cc > spread) {
      let nse = valueNoise(x * 0.09, z * 0.9 + x * 0.02);
      let dash = ss(0.52, 0.62, nse);
      let kk = dash * ss(spread, 0.999, cc) * (1.0 - ss(0.25, 0.5, sd.y));
      let warm = ss(15.0, 0.0, F.sunDir.w);
      c += (vec3f(1.05, mix(1.0, 0.82, warm), mix(0.9, 0.56, warm)) - c) * kk;
    }
  }
  let tmp = skyColor(vec3f(d.x, 0.0001, d.z), false);
  let hz = 1.0 - exp(-t / 4200.0);
  c += (tmp - c) * hz;
  let line = 1.0 - ss(0.0006, 0.0035, -d.y);
  return c + (tmp * vec3f(1.08, 1.08, 1.05) - c) * line * 0.6;
}

fn background(o: vec3f, d: vec3f) -> vec3f {
  if (d.y < -1e-4 && o.y > F.skyLook2.z) { return seaColor(o, d); }
  return skyColor(d, true);
}
`;

// ------------------------------------------------------------------ surfaces (src/render.js shadeHit)

const SURFACE = /* wgsl */ `
// How far to push a lookup off the surface, in texels: the painter's 1.6,
// and more as the light grazes the face, which would otherwise shadow
// itself in stripes.
fn nudge(n: vec3f) -> f32 {
  return 1.6 + 3.0 * (1.0 - clamp(dot(n, F.keyDir.xyz), 0.0, 1.0));
}

// Fraction of the key light reaching p: the shadow map read with bilinear
// PCF, from a point pushed off the surface along its normal.
fn farShadow(p: vec3f, n: vec3f) -> f32 {
  let q = p + n * (F.shadowInfo.x * nudge(n));
  let c = F.shadowMat * vec4f(q, 1.0);
  let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { return 1.0; }
  return textureSampleCompareLevel(shadowMap, shadowSampler, uv, c.z - F.shadowInfo.z);
}

// Near the walker, the tight map: nine bilinear reads a texel apart, so an
// edge up close is a soft line rather than a staircase. It hands over to
// the whole-box map across its outer rim.
fn shadowAt(p: vec3f, n: vec3f) -> f32 {
  if (F.shadowInfo.y < 0.5) { return 0.0; }
  if (F.nearInfo.y > 0.5) {
    let q = p + n * (F.nearInfo.x * nudge(n));
    let c = F.nearMat * vec4f(q, 1.0);
    let uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
    let edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
    if (edge > 0.0) {
      let z = c.z - F.nearInfo.z;
      // Where the light grazes a face, one texel stretches across it into
      // a long tooth: read wider there, a soft penumbra instead.
      let t = F.nearInfo.w * (1.0 + 4.0 * (1.0 - ss(0.05, 0.35, dot(n, F.keyDir.xyz))));
      var s = 0.0;
      for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
          s += textureSampleCompareLevel(nearMap, shadowSampler, uv + vec2f(f32(i), f32(j)) * t, z);
        }
      }
      s /= 9.0;
      if (edge >= 0.06) { return s; }
      return mix(farShadow(p, n), s, edge / 0.06);
    }
  }
  return farShadow(p, n);
}

// The painted shade of material m on a face whose normal has height ny.
fn shadeAt(m: u32, ny: f32) -> vec3f {
  let side = shades[m * 3u + 1u].rgb;
  let o = select(shades[m * 3u + 2u].rgb, shades[m * 3u].rgb, ny >= 0.0);
  return side + (o - side) * abs(ny);
}

fn footAcross(foot: f32, d: vec3f, gx: f32, gz: f32) -> f32 {
  let c = (gx * d.x + gz * d.z) / orOne(sqrt(d.x * d.x + d.z * d.z));
  let k = 1.0 / max(abs(d.y), 0.03);
  return foot * sqrt(c * c * k * k + 1.0 - c * c);
}

// Brightness factor for a procedural pattern (negative: use color2).
fn pattern(pat: u32, m: u32, p: vec3f, uv: vec2f, dist: f32, d: vec3f) -> f32 {
  let s = mats[m].scale;
  let foot = dist * F.eye.w * 1.5;
  let px = p.x;
  let pz = p.z;
  if (pat == P_SAND) {
    var f = 1.0 + 0.05 * (valueNoise(px * 0.07 + 11.3, pz * 0.07) - 0.5);
    let fade = 1.0 - ss(0.02, 0.07, footAcross(foot, d, 1.0, 0.0));
    if (fade > 0.0) {
      let w = (px + 0.3 * sin(pz * 0.55 + 2.0 * sin(pz * 0.13 + px * 0.05)) + 0.08 * sin(pz * 2.1 + px * 1.3)) / (0.26 * s);
      let r = w - floor(w);
      let lee = select(0.012, -0.07 * (1.0 - r / 0.22), r < 0.22);
      f += lee * fade * ss(0.2, 0.7, valueNoise(px * 0.9 + 3.3, pz * 0.7));
    }
    return f;
  }
  if (pat == P_LAWN) {
    let fade = 1.0 - ss(0.15, 0.5, footAcross(foot, d, 0.0, 1.0));
    let sq = clamp(3.0 * sin((PI * pz) / (0.9 * s)), -1.0, 1.0);
    return 1.0 + 0.045 * sq * fade + 0.05 * (valueNoise(px * 0.23 + 5.1, pz * 0.23) - 0.5);
  }
  if (pat == P_ROAD) {
    var f = 1.0 + 0.06 * (valueNoise(px * 0.08 + 3.1, pz * 0.08 - 1.7) - 0.5) + 0.03 * (valueNoise(px * 0.45, pz * 0.45) - 0.5);
    let M = mats[m];
    if (M.laneCount > 0u) {
      let fade = 1.0 - ss(0.1, 0.35, footAcross(foot, d, M.laneAx, M.laneAz));
      if (fade > 0.0) {
        let a = px * M.laneAx + pz * M.laneAz;
        let along = px * M.laneAz - pz * M.laneAx;
        var w = 0.0;
        for (var i = 0u; i < M.laneCount; i++) {
          let dd = a - lanes[M.laneStart + i];
          if (dd > 1.8 || dd < -1.8) { continue; }
          let e = abs(dd) - 0.8;
          w += -0.12 * exp(-(dd * dd) / 0.2) + 0.05 * exp(-(e * e) / 0.07);
        }
        f += w * fade * (0.65 + 0.7 * valueNoise(along * 0.035, a * 0.2 + 9.7));
      }
    }
    return f;
  }
  if (pat == P_DECK) {
    let w = 0.012;
    let fx = (px / s) % 1.0;
    let fz = (pz / s) % 1.0;
    let ax = select(fx, fx + 1.0, fx < 0.0);
    let az = select(fz, fz + 1.0, fz < 0.0);
    let line = ax < w || ax > 1.0 - w || az < w || az > 1.0 - w;
    let fade = 1.0 - ss(s * 0.03, s * 0.1, foot);
    return select(1.0, 1.0 - 0.045 * fade, line);
  }
  if (pat == P_PLANKS) {
    let f = (px / (0.24 * s)) % 1.0;
    let a = select(f, f + 1.0, f < 0.0);
    let fade = 1.0 - ss(0.012, 0.05, foot);
    return select(1.0 - 0.03 * hash2(i32(floor(px / (0.24 * s))), 3) * fade, 1.0 - 0.12 * fade, a < 0.07);
  }
  if (pat == P_TILE) {
    let w = 0.06;
    let fu = uv.x / (0.2 * s) - floor(uv.x / (0.2 * s));
    let fv = uv.y / (0.2 * s) - floor(uv.y / (0.2 * s));
    let fade = 1.0 - ss(0.004, 0.02, foot);
    return select(1.0, 1.0 - 0.08 * fade, fu < w || fv < w);
  }
  if (pat == P_TRUNK) {
    let f = uv.y / (0.22 * s) - floor(uv.y / (0.22 * s));
    let fade = 1.0 - ss(0.02, 0.06, foot);
    return select(1.0, 1.0 - 0.08 * fade, f < 0.18);
  }
  if (pat == P_STRIPES) {
    let k = i32(floor(uv.x / (0.12 * s))) & 1;
    return select(1.0, -1.0, k != 0);
  }
  if (pat == P_SEGMENTS) {
    let k = i32(floor(uv.x * s + 1e-6)) & 1;
    return select(1.0, -1.0, k != 0);
  }
  return 1.0;
}

// ------------------------------------------------------------------ close-up grain (live only)
// What a walker sees at arm's length and a painting never has to show:
// sprayed stucco, the stones in the asphalt and its sealed cracks, the
// speckle of concrete, fibers up a palm trunk, sand, the grain of planks,
// blades of grass. Every octave fades before a pixel is a third of its
// size, and all of it is gone by twenty meters, so the painted views keep
// the painter's flat colors.
const D_STUCCO = 1u;
const D_ASPHALT = 2u;
const D_CONCRETE = 3u;
const D_BARK = 4u;
const D_SAND = 5u;
const D_WOOD = 6u;
const D_GRASS = 7u;
const D_LEAVES = 8u;

// A cheap hash and value noise (nothing here has to match the painter's).
fn hashf(q: vec2f) -> f32 {
  var p3 = fract(vec3f(q.x, q.y, q.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vn(q: vec2f) -> f32 {
  let i = floor(q);
  let f = q - i;
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(hashf(i), hashf(i + vec2f(1.0, 0.0)), u.x);
  let b = mix(hashf(i + vec2f(0.0, 1.0)), hashf(i + vec2f(1.0, 1.0)), u.x);
  return mix(a, b, u.y);
}

// Value noise in three dimensions, for round things no one plane fits:
// two slices of the flat noise, blended through the height.
fn vn3(p: vec3f) -> f32 {
  let k = floor(p.y);
  let f = p.y - k;
  let u = f * f * (3.0 - 2.0 * f);
  return mix(vn(p.xz + vec2f(k * 17.13, k * 3.71)), vn(p.xz + vec2f((k + 1.0) * 17.13, (k + 1.0) * 3.71)), u);
}

// One octave, wavelength lam meters, amplitude a, for a pixel foot wide.
fn grain(q: vec2f, lam: f32, a: f32, foot: f32) -> f32 {
  let w = 1.0 - ss(lam * 0.12, lam * 0.35, foot);
  if (w <= 0.0) { return 0.0; }
  return a * w * (vn(q / lam) - 0.5);
}

// Roughly how far q is from a crack, in a network of cells s meters
// across: half the gap between the nearest and next-nearest cell points.
fn crackDist(q: vec2f, s: f32) -> f32 {
  let g = q / s;
  let i = floor(g);
  var d1 = 9.0;
  var d2 = 9.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let c = i + vec2f(f32(x), f32(y));
      let d = length(c + vec2f(hashf(c), hashf(c + vec2f(17.3, 5.1))) - g);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return (d2 - d1) * s * 0.5;
}

// Brightness factor for the grain of material m at p (1: none).
fn detail(m: u32, p: vec3f, n: vec3f, uv: vec2f, dist: f32, foot: f32) -> f32 {
  let M = mats[m];
  let D = M.detail;
  if (D == 0u) { return 1.0; }
  let near = 1.0 - ss(8.0, 20.0, dist);
  if (near <= 0.0) { return 1.0; }
  // The face's own plane: along and up a wall, or the ground's x and z.
  var q = p.xz;
  if (abs(n.y) < 0.7) {
    let t = normalize(vec2f(-n.z, n.x) + vec2f(1e-6, 0.0));
    q = vec2f(dot(p.xz, t), p.y);
  }
  var f = 0.0;
  if (D == D_STUCCO) {
    f = grain(q, 0.9, 0.028, foot) + grain(q + 7.1, 0.21, 0.032, foot) + grain(q + 3.7, 0.05, 0.04, foot) + grain(q + 1.3, 0.014, 0.03, foot);
  } else if (D == D_ASPHALT) {
    f = grain(q, 2.4, 0.035, foot) + grain(q + 5.3, 0.1, 0.07, foot) + grain(q + 1.1, 0.03, 0.07, foot);
    let cw = 1.0 - ss(0.012, 0.035, foot);
    if (cw > 0.0) {
      // Sealed cracks, in some stretches and not others.
      let patchy = ss(0.45, 0.65, vn(q * 0.11 + 4.2));
      if (patchy > 0.0) {
        // Bent, so they wander as cracks do rather than run as seams.
        let bend = (vec2f(vn(q * 0.7), vn(q * 0.7 + 9.1)) - 0.5) * 1.1 + (vec2f(vn(q * 3.1 + 2.0), vn(q * 3.1 + 5.0)) - 0.5) * 0.16;
        f -= 0.09 * cw * patchy * (1.0 - ss(0.005, 0.016, crackDist(q + bend, 3.8)));
      }
    }
  } else if (D == D_CONCRETE) {
    f = grain(q, 0.35, 0.028, foot) + grain(q + 1.3, 0.045, 0.04, foot);
    if (M.pattern == P_DECK && abs(n.y) >= 0.7) {
      // Each slab poured a shade of its own.
      f += 0.022 * (hashf(floor(q / M.scale) + vec2f(3.0, 11.0)) - 0.5);
    }
  } else if (D == D_BARK) {
    // Fibers up the trunk, and each leaf scar a shade of its own.
    let w = 1.0 - ss(0.004, 0.012, foot);
    let a = uv.x * 1.3;
    f = 0.11 * w * (vn(vec2f(a / 0.022, uv.y / 0.5)) - 0.5) + 0.05 * (hashf(vec2f(floor(uv.y / (0.22 * M.scale)), 9.0)) - 0.5);
  } else if (D == D_SAND) {
    f = grain(q, 0.3, 0.035, foot) + grain(q + 2.9, 0.045, 0.05, foot) + grain(q + 8.3, 0.013, 0.045, foot);
  } else if (D == D_WOOD) {
    // Grain along the boards (they run along z), knots here and there.
    let w = 1.0 - ss(0.005, 0.016, foot);
    f = 0.08 * w * (vn(vec2f(p.x / 0.016, p.z / 0.8)) - 0.5) + grain(q, 0.4, 0.03, foot);
  } else if (D == D_GRASS) {
    f = grain(q, 0.6, 0.05, foot) + grain(q + 4.4, 0.08, 0.07, foot) + grain(q + 1.9, 0.022, 0.07, foot);
  } else if (D == D_LEAVES) {
    // Clusters of leaves and the dark between them, all the way round.
    let w1 = 1.0 - ss(0.008, 0.025, foot);
    let w2 = 1.0 - ss(0.003, 0.008, foot);
    let v = vn3(p / 0.07);
    f = 0.2 * w1 * (v - 0.5) - 0.12 * w1 * (1.0 - ss(0.2, 0.36, v)) + 0.1 * w2 * (vn3(p / 0.022 + 5.0) - 0.5);
  }
  return 1.0 + f * near;
}

// ------------------------------------------------------------------ rooms behind the glass (live only)
// Up close a pane is a window again. The ray from the eye goes on past the
// glass until it meets the back wall of a room that is not there, a side
// wall, the floor or the ceiling (interior mapping), each painted flat and
// lit by the day through the window or by the room's own lamps after dark.
// Motel rooms have curtains and a bed, shops shelves and a counter, the
// rest a sofa and a picture on the wall.

fn safeInv(x: f32) -> f32 {
  return 1.0 / select(x, select(-1e-6, 1e-6, x >= 0.0), abs(x) < 1e-6);
}

// Where a ray (origin o, direction r) first meets the box lo..hi, or 1e9.
fn boxHit(o: vec3f, r: vec3f, lo: vec3f, hi: vec3f) -> f32 {
  let inv = vec3f(safeInv(r.x), safeInv(r.y), safeInv(r.z));
  let t0 = (lo - o) * inv;
  let t1 = (hi - o) * inv;
  let tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  return select(1e9, tn, tf >= max(tn, 0.0) && tn > 0.0);
}

fn interior(pane: u32, id: u32, p: vec3f, d: vec3f, lamp: f32, warm: vec3f) -> vec3f {
  let A = panes[pane * 2u];
  let B = panes[pane * 2u + 1u];
  let style = u32(B.z);
  // The room's own axes: along the pane, up, and into the room, which lies
  // beyond the glass from wherever the walker stands.
  let tx = -B.y;
  let tz = B.x;
  var nx = B.x;
  var nz = B.y;
  if (d.x * nx + d.z * nz > 0.0) {
    nx = -nx;
    nz = -nz;
  }
  let o = vec3f(p.x * tx + p.z * tz, p.y, 0.0);
  let r = vec3f(d.x * tx + d.z * tz, d.y, -(d.x * nx + d.z * nz));
  // The pane's width (a long one is cut into shop-sized rooms, a small
  // window opens onto a room wider than itself), a story high, 4.5 m deep.
  var a0 = A.x;
  var a1 = A.y;
  let W = a1 - a0;
  var ri = 0.0;
  if (W > 9.0) {
    let nr = round(W / 6.0);
    let rw = W / nr;
    ri = clamp(floor((o.x - a0) / rw), 0.0, nr - 1.0);
    a0 = A.x + ri * rw;
    a1 = a0 + rw;
  } else if (W < 3.0) {
    a0 -= 1.0;
    a1 += 1.0;
  }
  let H = A.w - A.z;
  var y0: f32;
  var y1: f32;
  var si = 0.0;
  if (H > 4.5) {
    si = clamp(floor((o.y - A.z) / 3.3), 0.0, floor(H / 3.3));
    y0 = A.z + si * 3.3;
    y1 = y0 + 3.3;
  } else if (H < 2.0) {
    y0 = A.z - 0.85;
    y1 = max(A.w + 0.35, y0 + 2.8);
  } else {
    y0 = A.z - 0.15;
    y1 = max(A.w + 0.3, y0 + 3.0);
  }
  let depth = 4.5;
  let ta = (select(a0, a1, r.x > 0.0) - o.x) * safeInv(r.x);
  let ty = (select(y0, y1, r.y > 0.0) - o.y) * safeInv(r.y);
  let tw = depth * safeInv(r.z);
  var t = min(ta, min(ty, tw));
  var q = o + r * t;
  let seed = f32(id) * 7.31 + ri * 1.7 + si * 3.9 + f32(pane) * 0.37;
  let h1 = hashf(vec2f(seed, 1.3));
  let h2 = hashf(vec2f(seed, 2.9));
  let h3 = hashf(vec2f(seed, 5.1));
  // Pastel rooms: cream, pale blue, blush or mint.
  var wallC = vec3f(0.94, 0.9, 0.82);
  if (h1 > 0.75) {
    wallC = vec3f(0.8, 0.87, 0.94);
  } else if (h1 > 0.5) {
    wallC = vec3f(0.95, 0.83, 0.8);
  } else if (h1 > 0.3) {
    wallC = vec3f(0.8, 0.92, 0.86);
  }
  var c: vec3f;
  var shade: f32;
  var glow = 0.0;
  if (t == tw) {
    c = wallC;
    shade = 0.95;
  } else if (t == ta) {
    c = wallC;
    shade = 0.78;
  } else if (r.y < 0.0) {
    c = select(vec3f(0.62, 0.48, 0.36), vec3f(0.8, 0.76, 0.72), h2 > 0.5);
    shade = 0.62;
  } else {
    c = vec3f(0.95, 0.94, 0.92);
    shade = 0.86;
    // A light down the middle of the ceiling.
    if (abs(q.x - (a0 + a1) * 0.5) < 0.45 && abs(q.z - depth * 0.5) < 0.9) { glow = 1.0; }
  }
  let back = t == tw;
  // What stands in the room.
  let wr = a1 - a0;
  var lo = vec3f(0.0);
  var hi = vec3f(0.0);
  var fc = vec3f(0.0);
  if (style == 0u) {
    // A bed, its head against the back wall.
    lo = vec3f(a0 + wr * 0.2, y0, 2.3);
    hi = vec3f(a1 - wr * 0.2, y0 + 0.55, depth);
    fc = select(vec3f(0.96, 0.94, 0.9), vec3f(0.55, 0.72, 0.92), h3 > 0.5);
  } else if (style == 1u) {
    if (h3 < 0.33) {
      // A cafe: its counter across the back.
      lo = vec3f(a0 + wr * 0.1, y0, depth - 1.1);
      hi = vec3f(a1 - wr * 0.1, y0 + 1.05, depth - 0.5);
      fc = select(vec3f(0.95, 0.93, 0.88), vec3f(0.85, 0.35, 0.33), h1 > 0.5);
    } else {
      // A counter, partway in.
      let ca = a0 + wr * (0.12 + 0.35 * h2);
      lo = vec3f(ca, y0, 1.4);
      hi = vec3f(ca + wr * 0.38, y0 + 1.0, 2.0);
      fc = select(vec3f(0.92, 0.9, 0.86), vec3f(0.3, 0.46, 0.72), h1 > 0.6);
    }
  } else {
    // A long low sofa against the back wall.
    lo = vec3f(a0 + wr * 0.25, y0, depth - 0.9);
    hi = vec3f(a1 - wr * 0.25, y0 + 0.45, depth);
    fc = select(vec3f(0.95, 0.93, 0.88), vec3f(0.9, 0.55, 0.5), h3 > 0.55);
  }
  var tb = boxHit(o, r, lo, hi);
  if (style == 1u && h3 < 0.33) {
    // The cafe's little tables, down the middle.
    for (var i = 0; i < 3; i++) {
      let ta0 = a0 + wr * (0.18 + 0.3 * f32(i));
      let tw0 = 1.1 + 0.9 * hashf(vec2f(seed, f32(i) + 7.0));
      let tt = boxHit(o, r, vec3f(ta0, y0 + 0.7, tw0), vec3f(ta0 + 0.6, y0 + 0.76, tw0 + 0.6));
      if (tt < tb) {
        tb = tt;
        fc = vec3f(0.97, 0.96, 0.93);
        hi.y = y0 + 0.76;
      }
      // On one leg.
      let tl = boxHit(o, r, vec3f(ta0 + 0.27, y0, tw0 + 0.27), vec3f(ta0 + 0.33, y0 + 0.7, tw0 + 0.33));
      if (tl < tb) {
        tb = tl;
        fc = vec3f(0.35, 0.36, 0.4);
        hi.y = y0 + 9.0;
      }
    }
  }
  if (tb < t) {
    t = tb;
    q = o + r * t;
    c = fc;
    shade = select(0.78, 1.0, q.y > hi.y - 0.005);
    glow = 0.0;
  } else if (back) {
    // Each shop its own colors: warm, cool or sugared.
    let pal = floor(h2 * 3.0);
    let ca = select(select(vec3f(0.95, 0.72, 0.8), vec3f(0.3, 0.6, 0.62), pal > 0.5), vec3f(0.93, 0.42, 0.3), pal > 1.5);
    let cb = select(select(vec3f(0.6, 0.8, 0.95), vec3f(0.3, 0.45, 0.85), pal > 0.5), vec3f(0.97, 0.8, 0.35), pal > 1.5);
    if (style == 1u && h3 < 0.33) {
      // A menu board over the cafe's counter.
      if (abs(q.x - (a0 + a1) * 0.5) < wr * 0.3 && q.y > y0 + 1.6 && q.y < y0 + 2.3) {
        let line = (q.y - y0 - 1.65) / 0.09;
        let ink = line - floor(line) < 0.3 && hashf(vec2f(floor(q.x / 0.3), floor(line))) > 0.25;
        c = select(vec3f(0.12, 0.2, 0.22), vec3f(0.92, 0.9, 0.82), ink);
        shade = 1.0;
      }
    } else if (style == 1u && h3 < 0.55) {
      // A boutique: clothes on a rail.
      if (q.y > y0 + 0.85 && q.y < y0 + 1.62) {
        let k = hashf(vec2f(floor(q.x / 0.09) + seed, 5.0));
        if (k > 0.2) {
          c = mix(ca, cb, step(0.55, k)) * (0.85 + 0.15 * hashf(vec2f(k, 1.0)));
          shade = 0.9;
        }
      } else if (q.y > y0 + 1.62 && q.y < y0 + 1.66) {
        c = vec3f(0.85, 0.85, 0.86);
        shade = 1.0;
      }
    } else if (style == 1u && q.y > y0 + 0.3 && q.y < y0 + 2.3) {
      // Shelves of goods.
      let row = (q.y - y0 - 0.3) / 0.5;
      if (row - floor(row) < 0.1) {
        c = vec3f(0.92, 0.9, 0.86);
        shade = 1.0;
      } else {
        let k = hashf(vec2f(floor(q.x / 0.22) + seed, floor(row)));
        if (k > 0.35) {
          c = mix(ca, cb, hashf(vec2f(k * 13.0, 3.0)));
          c = mix(c, vec3f(0.96, 0.95, 0.9), step(0.85, k));
          shade = 0.85;
        }
      }
    } else if (style == 2u && abs(q.x - (a0 + a1) * 0.5) < 0.55 && q.y > y0 + 1.2 && q.y < y0 + 1.95) {
      // A picture of the sea.
      c = select(vec3f(0.25, 0.5, 0.85), vec3f(0.95, 0.75, 0.45), q.y < y0 + 1.45);
      shade = 1.0;
    }
  }
  var col = c * shade * (1.0 - 0.4 * clamp(q.z / depth, 0.0, 1.0));
  // Daylight through the window; after dark, the room's own lamps.
  // (Daylight indoors has lost the sky's blue on the walls and floors.)
  let dayIn = dot(F.amb.rgb, vec3f(0.3, 0.45, 0.25)) * vec3f(1.0, 0.97, 0.92) * 0.72 + F.key.rgb * (0.2 * F.key.w);
  // The lamps are warm from outside; within, whiter, so the room keeps its colors.
  let lampIn = mix(warm, vec3f(1.0, 0.95, 0.86) * dot(warm, vec3f(0.33)), 0.55);
  col *= dayIn + lampIn * (1.05 * lamp);
  col = mix(col, warm * 1.35, glow * lamp);
  // A motel room's curtains, drawn to the sides of the window.
  if (style == 0u) {
    let tc = 0.12 * safeInv(r.z);
    let ac = o.x + r.x * tc;
    let open = (A.y - A.x) * (0.16 + 0.2 * h2);
    if (ac < A.x + open || ac > A.y - open) {
      let fold = 0.5 + 0.5 * cos(ac * 6.283 / 0.09);
      let cc = select(vec3f(0.98, 0.86, 0.72), vec3f(0.95, 0.93, 0.86), h1 > 0.5);
      col = cc * (0.8 + 0.2 * fold) * (dayIn * 1.15 + warm * (1.05 * lamp));
    }
  }
  return col;
}

// Glass as an illustrator paints it: deep at the foot of each floor, lifting
// toward the sky, diagonal bands of light, and lit rooms after dark.
fn shadeGlass(m: u32, ids: u32, p: vec3f, n0: vec3f, d: vec3f) -> vec3f {
  // The object id, and in the top half the pane it belongs to (pack.js).
  let obj = ids & 0xffffu;
  let pane = ids >> 16u;
  var n = n0;
  if (dot(n, d) > 0.0) { n = -n; }
  let c = -dot(n, d);
  let rx = d.x + 2.0 * c * n.x;
  let rz = d.z + 2.0 * c * n.z;
  let rl = orOne(sqrt(rx * rx + rz * rz));
  let T = skyColor(vec3f((rx / rl) * 0.96, 0.28, (rz / rl) * 0.96), false);
  let hh = (p.y - 0.15) / 3.3 - floor((p.y - 0.15) / 3.3);
  let k = 0.18 + 0.62 * powz(hh, 1.35);
  let deep = vec3f(0.05, 0.09, 0.22) + F.amb.rgb * vec3f(0.16, 0.2, 0.34);
  var col = deep + (T - deep) * k;
  var tx = -n.z;
  var tz = n.x;
  let tl = orOne(sqrt(tx * tx + tz * tz));
  tx /= tl;
  tz /= tl;
  let along = p.x * tx + p.z * tz;
  let dd = (along * 0.55 + p.y) / 2.6 + 0.3;
  let f = dd - floor(dd);
  var band = 0.0;
  if (f > 0.1 && f < 0.26) { band = 0.3; } else if (f > 0.34 && f < 0.39) { band = 0.2; }
  let day = 1.0 - F.misc.x;
  if (band > 0.0) {
    col += (T * vec3f(1.1, 1.1, 1.05) + vec3f(0.08, 0.08, 0.06) - col) * band * day;
  }
  let M = mats[m];
  var on = 0.0;
  if (M.emit.r + M.emit.g + M.emit.b > 0.0) {
    if (M.switched != 0u) {
      on = F.misc.y * (0.1 + 0.9 * clamp(M.emitK, 0.0, 1.0));
    } else {
      on = F.misc.y * select(0.1, 1.0, hash2(i32(obj), 7) < 0.72);
    }
  }
  if (on > 0.0) {
    var warm = 0.9 + 0.1 * (1.0 - hh);
    if (M.curtain != 0u) {
      let u = along / 0.23 + 0.4 * sin(along * 1.7 + f32(obj));
      warm *= 0.8 + 0.2 * (0.5 + 0.5 * cos(u * 2.0 * PI));
    }
    col += (M.emit * warm * 1.22 - col) * on;
  }
  // Close to, the room behind it, with the painted glass laid over it as a
  // reflection does: it lightens (the bands of sky flare across the room)
  // and never darkens. Glancing, the glass is all reflection again.
  if (pane > 0u && F.skyLook2.w < 0.5) {
    // Only close to: from where the painted views are taken, glass is
    // the painter's glass.
    let vis = 1.0 - ss(6.0, 14.0, length(p - F.eye.xyz));
    if (vis > 0.0) {
      let inside = interior(pane - 1u, obj, p, d, on, M.emit);
      let fr = 0.18 + 0.82 * powz(1.0 - c, 4.0);
      let k = mix(0.38, 0.26, clamp(on, 0.0, 1.0));
      let refl = col * k;
      let through = vec3f(1.0) - (vec3f(1.0) - inside * vec3f(0.9, 0.95, 1.0)) * (vec3f(1.0) - refl);
      col = mix(col, mix(through, col, fr), vis);
    }
  }
  return col;
}

// One sample of a surface: everything in shadeHit but the water.
fn shadeSurface(m: u32, flags: u32, obj: u32, p: vec3f, nIn: vec3f, uv: vec2f, d: vec3f, dist: f32) -> vec3f {
  let M = mats[m];
  let kind = M.kind;
  let smoothN = (flags & SMOOTH) != 0u;
  let painted = F.haze2.y > 0.5;
  var n = nIn;
  let fnorm = nIn;
  if ((flags & DOUBLE) != 0u && dot(n, d) > 0.0) { n = -n; }
  let c = M.color;
  let L = F.keyDir.xyz;
  let K = F.key.rgb;
  let h = 0.5 + 0.5 * n.y;
  let A = F.ground.rgb + (F.amb.rgb - F.ground.rgb) * h;
  var col = vec3f(0.0);
  let pat = M.pattern;

  if (kind == K_DIFFUSE || kind == K_DISTANT) {
    var lit = 0.0;
    if (!smoothN && (flags & DOUBLE) == 0u) {
      // A plane: one of three painted values, full, oblique or grazing. The
      // grazing value comes in over the first few degrees rather than all
      // at once (the painter switches it on at once), so a face the sun
      // barely touches carries no shadow a map could render in teeth.
      let ndl = dot(fnorm, L);
      let lit3 = select(select(0.66 * ss(0.0, 0.05, ndl), 0.84, ndl > 0.18), 1.0, ndl > 0.5);
      let hf = 0.5 + 0.5 * fnorm.y;
      let Af = F.ground.rgb + (F.amb.rgb - F.ground.rgb) * hf;
      var sh: vec3f;
      var li: vec3f;
      if (painted) {
        sh = shadeAt(m, fnorm.y);
        li = sh + (c * (Af + K) - sh) * lit3;
      } else {
        sh = c * Af;
        li = c * (Af + K * lit3);
      }
      if (ndl > 0.0 && (flags & DISTANT) == 0u) { lit = shadowAt(p, fnorm); }
      col = sh + (li - sh) * lit;
    } else {
      // A curved form, airbrushed: a soft terminator and a sprayed sheen.
      let ndl = dot(n, L);
      lit = ss(-0.08, 0.42, ndl);
      if (lit > 0.0) { lit *= shadowAt(p, n); }
      let sheen = select(0.0, 0.07 * ss(0.7, 0.95, ndl) * lit, ndl > 0.7);
      if (painted) {
        let sh = shadeAt(m, n.y);
        col = sh + (c * (A + K * 0.95) - sh) * lit + vec3f(sheen);
      } else {
        col = c * (A + K * lit * 0.95) + vec3f(sheen);
      }
    }
    if (pat != P_NONE) {
      let f = pattern(pat, m, p, uv, dist, d);
      if (f < 0.0) {
        col *= (M.color2 / max(c, vec3f(1e-3))) * (-f);
      } else {
        col *= f;
      }
    }
    if ((flags & DISTANT) == 0u) {
      col *= detail(m, p, fnorm, uv, dist, dist * F.eye.w * 1.5);
      if (n.y < 0.35 && n.y > -0.35) {
        // Walls are airbrushed top to bottom.
        let hh = clamp(p.y / 7.0, 0.0, 1.0);
        if (lit > 0.5) {
          col *= 1.0 + 0.07 * (hh - 0.45);
        } else {
          let f = 1.0 - 0.1 * (hh - 0.45);
          col *= vec3f(f * (1.0 + 0.03 * (1.0 - hh)), f, f * (1.0 - 0.02 * (1.0 - hh)));
        }
      }
      if (M.ao != 0u) {
        col *= 0.9 + 0.1 * ss(0.0, 0.9, p.y);
      }
    }
  } else if (kind == K_FOLIAGE) {
    let ndl = dot(n, L);
    if (ndl > 0.0) {
      let vis = shadowAt(p, n);
      let lit = select(0.8, 1.0, ndl > 0.4) * vis;
      if (painted) {
        let sh = shadeAt(m, n.y) * vec3f(0.38, 0.38, 0.42);
        col = sh + (c * (A + K) - sh) * lit;
      } else {
        col = c * (A + K * lit);
      }
    } else {
      // Seen from the dark side, a leaf glows faintly yellow-green.
      let vis = shadowAt(p, -n);
      let k = 0.24 * vis;
      if (painted) {
        let sh = shadeAt(m, -n.y) * vec3f(0.38, 0.38, 0.42);
        col = sh + (c * (A + K * vec3f(1.1, 1.15, 0.6)) - sh) * k;
      } else {
        col = c * (A + K * k * vec3f(1.1, 1.15, 0.6));
      }
    }
    if (pat == P_FROND) {
      let u = uv.x;
      let f = F.frond.x + F.frond.y * u + F.frond.z * uv.y;
      col *= vec3f(f * (F.frond.w + F.frond2.x * u), f, f * (1.02 - 0.08 * u));
    }
    if ((flags & DISTANT) == 0u) {
      col *= detail(m, p, n, uv, dist, dist * F.eye.w * 1.5);
    }
  } else if (kind == K_GLASS) {
    col = shadeGlass(m, obj, p, n, d);
  } else if (kind == K_CHROME) {
    let cc = -dot(n, d);
    let r = d + 2.0 * cc * n;
    if (r.y > 0.0) {
      col = skyColor(r, false) * 1.08;
    } else {
      col = F.ground.rgb * vec3f(0.55, 0.5, 0.45) + vec3f(0.04, 0.04, 0.05);
    }
    let ndl = dot(n, L);
    if (ndl > 0.0) {
      let hv = L - d;
      let hl = orOne(length(hv));
      if (dot(n, hv) / hl > 0.985) {
        let vis = shadowAt(p, n) * F.keyDir.w;
        col += (vec3f(1.2, 1.2, 1.15) - col) * vis;
      }
    }
  } else if (kind == K_PAINT) {
    // Lacquer: an airbrushed body color, a clear coat of sky, a hot glint.
    let ndl = dot(n, L);
    var lit = ss(0.0, 0.35, ndl);
    if (lit > 0.0) { lit *= shadowAt(p, n); }
    if (painted) {
      let sh = shadeAt(m, n.y);
      col = sh + (c * (A + K) - sh) * lit;
    } else {
      col = c * (A + K * lit);
    }
    let cc = -dot(n, d);
    let fres = 0.06 + 0.5 * powz(1.0 - max(0.0, cc), 4.0);
    let r = d + 2.0 * cc * n;
    if (r.y > 0.02) {
      col += (skyColor(r, false) - col) * fres;
    }
    let hv = L - d;
    let hl = orOne(length(hv));
    if (lit > 0.0 && dot(n, hv) / hl > 0.99) {
      let k = 0.85 * F.keyDir.w;
      col += (vec3f(1.15, 1.15, 1.1) - col) * k;
    }
  } else if (kind == K_LAMP || kind == K_NEON) {
    let ndl = dot(n, L);
    let lit = select(0.0, (0.6 + 0.4 * ndl) * shadowAt(p, n), ndl > 0.0);
    if (painted) {
      let sh = shadeAt(m, n.y);
      col = sh + (c * (A + K) - sh) * lit;
    } else {
      col = c * (A + K * lit);
    }
    // Neon burns past white so the glow pass picks it up.
    let kE = M.emitK;
    let on = F.misc.y * select(1.15, 1.9, kind == K_NEON) * kE;
    let mixk = min(1.0, F.misc.y * 1.2 * min(1.0, kE));
    col += (M.emit * on - col) * mixk;
  } else {
    col = c;
  }

  // Warm pools of artificial light after dusk.
  if (F.misc.y > 0.0 && kind != K_LAMP && kind != K_NEON && kind != K_GLASS && (flags & DISTANT) == 0u) {
    var acc = vec3f(0.0);
    let count = u32(F.haze2.z);
    for (var i = 0u; i < count; i++) {
      let Lt = lights[i];
      let q = Lt.p - p;
      let d2 = dot(q, q);
      let rr = Lt.r * Lt.r;
      if (d2 > rr * 16.0) { continue; }
      let dl = orOne(sqrt(d2));
      let cs = dot(q, n) / dl;
      if (cs <= 0.0) { continue; }
      acc += Lt.c * ((Lt.k * cs) / (1.0 + d2 / rr));
    }
    col += c * acc * F.misc.y;
  }

  return col;
}

// Aerial perspective: distance lays a veil of horizon color over things.
fn haze(col: vec3f, flags: u32, d: vec3f, dist: f32) -> vec3f {
  if (dist <= 30.0) { return col; }
  let T = skyColor(vec3f(d.x, 0.0001, d.z), false);
  var k: f32;
  if ((flags & DISTANT) != 0u) {
    k = 1.0 - exp(-dist / F.haze.x);
  } else {
    let Z = F.haze;
    k = Z.y * ss(Z.z, Z.w, dist) + (1.0 - Z.y) * (1.0 - exp(-max(0.0, dist - Z.w) / F.haze2.x));
  }
  return col + (T - col) * k;
}
`;

// ------------------------------------------------------------------ the pool (shadeWater)

const WATER = /* wgsl */ `
struct Ripple {
  tilt: vec2f,
  phase: f32,
  k0: f32,
  along: f32,
};

fn wave(open: bool, i: u32) -> vec4f {
  return select(pool.waves[i], pool.hwaves[i], open);
}

fn ripple(px: f32, pz: f32, tm: f32, open: bool) -> Ripple {
  var hx = 0.0;
  var hz = 0.0;
  let nw = u32(select(pool.levels.z, pool.levels.w, open));
  for (var i = 0u; i < nw; i++) {
    let w = wave(open, i);
    let a = select(pool.amps[i], pool.hamps[i], open);
    let cw = cos(w.x * px + w.y * pz + w.z * tm + w.w) * a;
    hx += cw * w.x;
    hz += cw * w.y;
  }
  let w0 = wave(open, 0u);
  let w1 = wave(open, 1u);
  let w2 = wave(open, 2u);
  var r: Ripple;
  r.phase = w0.x * px + w0.y * pz + w0.z * tm + w0.w + 0.9 * sin(w1.x * px + w1.y * pz + w1.z * tm + w1.w) + 0.45 * sin(w2.x * px + w2.y * pz + w2.z * tm + w2.w);
  r.tilt = vec2f(-hx, -hz);
  r.k0 = sqrt(w0.x * w0.x + w0.y * w0.y);
  r.along = (-w0.y * px + w0.x * pz) / r.k0;
  return r;
}

// Painted bands and white crest lines over a water color.
fn paintWater(c0: vec3f, dist: f32, strength: f32, R: Ripple) -> vec3f {
  var c = c0;
  let wave = sin(R.phase);
  if (wave > 0.62) {
    let a = 0.1 * strength * ss(0.62, 0.72, wave);
    c += (c * vec3f(1.25, 1.18, 1.08) + vec3f(0.03, 0.04, 0.04) - c) * a * 1.6;
  } else if (wave < -0.7) {
    let a = 0.08 * strength * ss(-0.7, -0.8, wave);
    c *= vec3f(1.0 - a * 1.4, 1.0 - a * 1.1, 1.0 - a * 0.7);
  }
  let f = R.phase / (PI * 2.0);
  let fr = abs(f - floor(f) - 0.5);
  let foot = dist * F.eye.w * 1.5;
  let lw = ((0.03 + foot) * R.k0) / (PI * 2.0);
  if (fr < lw) {
    let dash = sin(R.along * 1.6 + 2.2 * sin(R.along * 0.55 + f * 1.7));
    if (dash > -0.15) {
      let a = (1.0 - fr / lw) * 0.6 * strength * select(0.4, 1.0, F.key.w > 0.5) * (1.0 - ss(0.03, 0.12, foot)) * ss(-0.15, 0.25, dash);
      c += (vec3f(0.97, 1.02, 1.02) - c) * a;
    }
  }
  return c;
}

// The sun on the ripples, dabbed on as a mosaic of small bright flecks.
fn flecks(px: f32, pz: f32, tm: f32, dist: f32, dy: f32) -> f32 {
  let G = 0.42;
  let foot = (dist * F.eye.w * 1.5) / max(0.08, abs(dy));
  let far = ss(0.03, 0.09, foot);
  if (far >= 1.0) { return 0.1; }
  let ci = i32(floor(px / G));
  let cj = i32(floor(pz / G));
  var cov = 0.0;
  for (var i = ci - 1; i <= ci + 1; i++) {
    for (var j = cj - 1; j <= cj + 1; j++) {
      let h1 = hash2(i * 3 + 11, j * 7 - 5);
      if (h1 < 0.18) { continue; }
      let cx = (f32(i) + 0.15 + 0.7 * hash2(i, j + 41)) * G;
      let cz = (f32(j) + 0.15 + 0.7 * hash2(i + 17, j)) * G;
      let breathe = 0.65 + 0.35 * sin(tm * 1.7 + h1 * 40.0);
      let rx = G * (0.1 + 0.14 * hash2(i - 9, j + 3)) * breathe;
      let rz = rx * (0.4 + 0.35 * hash2(i + 5, j - 13));
      let ex = (px - cx) / rx;
      let ez = (pz - cz) / rz;
      let dd = ex * ex + ez * ez;
      if (dd < 1.4) { cov = max(cov, ss(1.4, 0.7, dd)); }
    }
  }
  return cov * (1.0 - far) + 0.1 * far;
}

// The mirrored world seen along the ripple-tilted reflected ray.
fn reflection(p: vec3f, d: vec3f, nx: f32, nz: f32, reach: f32) -> vec4f {
  if (F.frond2.w < 0.5) { return vec4f(0.0); }
  let dn = d.x * nx + d.z * nz;
  let q = vec3f(p.x - 2.0 * d.y * nx * reach, p.y - 2.0 * dn * reach, p.z - 2.0 * d.y * nz * reach);
  let cl = F.mirrorVP * vec4f(q, 1.0);
  let cw = max(0.05, cl.w);
  // Held inside the part of the mirror that was painted, as Renderer does.
  let uv = clamp(vec2f((cl.x / cw + 1.0) * 0.5, (1.0 - cl.y / cw) * 0.5), F.reflRect.xy, F.reflRect.zw);
  return vec4f(textureSampleLevel(reflTex, linearSampler, uv, 0.0).rgb, 1.0);
}

fn shadeWater(p: vec3f, d: vec3f, dist: f32) -> vec3f {
  let tm = F.screen.z;
  let R = ripple(p.x, p.z, tm, false);
  var nrm = normalize(vec3f(R.tilt.x, 1.0, R.tilt.y));
  let cosi = max(0.0, -dot(nrm, d));
  // Stylized Fresnel: reflections never swamp the turquoise.
  let fres = 0.04 + 0.58 * powz(1.0 - cosi, 4.0);
  var rc: vec3f;
  let refl = reflection(p, d, nrm.x, nrm.z, 7.0);
  if (refl.w > 0.5) {
    rc = refl.rgb * vec3f(0.8, 0.95, 1.0);
  } else {
    rc = skyColor(vec3f(d.x + 2.0 * cosi * nrm.x, abs(d.y + 2.0 * cosi * nrm.y), d.z + 2.0 * cosi * nrm.z), false);
  }
  // Refraction into the basin (Snell, n = 1.333).
  let eta = 1.0 / 1.333;
  let kk = sqrt(max(0.0, 1.0 - eta * eta * (1.0 - cosi * cosi)));
  var t = normalize(eta * d + (eta * cosi - kk) * nrm);
  if (t.y > -0.02) { t.y = -0.02; }
  var tHit = (pool.levels.y - p.y) / t.y;
  var face = 0;
  var fnx = 0.0;
  var fnz = 0.0;
  if (t.x != 0.0) {
    let tw = (select(pool.rect.x, pool.rect.y, t.x > 0.0) - p.x) / t.x;
    if (tw > 0.0 && tw < tHit) {
      tHit = tw;
      face = 1;
      fnx = select(1.0, -1.0, t.x > 0.0);
    }
  }
  if (t.z != 0.0) {
    let tw = (select(pool.rect.z, pool.rect.w, t.z > 0.0) - p.z) / t.z;
    if (tw > 0.0 && tw < tHit) {
      tHit = tw;
      face = 2;
      fnx = 0.0;
      fnz = select(1.0, -1.0, t.z > 0.0);
    }
  }
  let q = p + t * tHit;
  let fny = select(0.0, 1.0, face == 0);
  if (face == 1) { fnz = 0.0; }
  var tc = pool.tile.rgb;
  if (face == 0) {
    let lane = abs(q.z - (pool.rect.z + pool.rect.w) * 0.5);
    if (lane < 0.16 && q.x > pool.rect.x + 1.2 && q.x < pool.rect.y - 1.2) { tc = pool.lane.rgb; }
  }
  let L = F.keyDir.xyz;
  let ndl = fnx * L.x + fny * L.y + fnz * L.z;
  let vis = select(0.0, shadowAt(q, vec3f(fnx, fny, fnz)), ndl > 0.0);
  let qq = (0.55 + 0.45 * max(0.0, ndl)) * vis;
  var ic = tc * (F.amb.rgb * 0.92 + F.key.rgb * qq);
  if (F.misc.y > 0.0) {
    let g = F.misc.y * (0.55 + 0.45 * exp(-abs(q.y - pool.levels.y - 0.9) * 0.8));
    ic += pool.glow.rgb * g;
  }
  // Absorption along the path from surface to basin.
  let ab = exp(-tHit * vec3f(0.6, 0.13, 0.075));
  let wc = pool.water.rgb * (F.amb.rgb + F.key.rgb * 0.6 + vec3f(F.misc.y * 0.7));
  ic = ic * ab + wc * (1.0 - ab);
  var w = ic + (rc - ic) * fres;
  if (F.frond2.y > 0.5) {
    let fl = flecks(p.x, p.z, tm, dist, d.y) * select(0.25 + 0.35 * F.misc.y, 0.85, F.key.w > 0.5);
    w += (vec3f(0.9, 0.97, 1.02) - w) * fl;
  }
  return paintWater(w, dist, F.haze2.w, R);
}
`;

// ------------------------------------------------------------------ entry points (open water first)

const ENTRY = /* wgsl */ `
// Open water: a deep body color that cools with distance, aqua shallows
// over sand, the mirrored world, a low sun's path, bands and crests.
fn shadeHarbor(p: vec3f, d: vec3f, dist: f32) -> vec3f {
  let R = ripple(p.x, p.z, F.screen.z, true);
  let nrm = normalize(vec3f(R.tilt.x, 1.0, R.tilt.y));
  let cosi = max(0.0, -dot(nrm, d));
  let fres = 0.1 + 0.62 * powz(1.0 - cosi, 3.0);
  let k = 1.0 - exp(-dist / pool.near.w);
  var w = pool.near.rgb + (pool.far.rgb - pool.near.rgb) * k;
  if (pool.far.w > 0.5) {
    let depth = pool.shallow.x * p.x + pool.shallow.y * p.z - pool.shallow.z;
    let a = exp(-max(0.0, depth) / pool.shallow.w);
    w += (pool.shallowColor.rgb - w) * a;
  }
  var b = w * (F.amb.rgb + F.key.rgb * 0.55);
  let refl = reflection(p, d, nrm.x, nrm.z, 12.0);
  if (refl.w > 0.5) {
    b += (refl.rgb * vec3f(0.85, 0.95, 1.0) - b) * fres;
  } else {
    b += (skyColor(vec3f(d.x, -d.y, d.z), false) - b) * fres;
  }
  let sd = F.sunDir.xyz;
  if (F.key.w > 0.5 && sd.y > -0.02 && sd.y < 0.55) {
    let c = d.x * sd.x - d.y * sd.y + d.z * sd.z;
    let spread = 0.955 + 0.035 * ss(0.0, 0.5, sd.y);
    if (c > spread) {
      let nse = valueNoise(p.x * 0.09 + R.phase * 0.08, p.z * 0.9 + p.x * 0.02);
      let dash = ss(0.5, 0.6, nse);
      let kk = dash * ss(spread, 0.999, c) * (1.0 - ss(0.3, 0.55, sd.y));
      let warm = ss(15.0, 0.0, F.sunDir.w);
      b += (vec3f(1.08, mix(1.02, 0.84, warm), mix(0.92, 0.58, warm)) - b) * kk;
    }
  }
  return paintWater(b, dist, 0.7, R);
}

struct VIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) uv: vec2f,
  @location(3) ids: vec2u,
};

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) nrm: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) ids: vec2u,
};

@vertex
fn vs_main(v: VIn) -> VOut {
  var o: VOut;
  o.clip = F.viewProj * vec4f(v.pos, 1.0);
  o.world = v.pos;
  o.nrm = v.nrm;
  o.uv = v.uv;
  o.ids = v.ids;
  return o;
}

@fragment
fn fs_main(v: VOut) -> @location(0) vec4f {
  let m = v.ids.x & 0xffffu;
  let flags = v.ids.x >> 16u;
  let mirrored = F.skyLook2.w > 0.5;
  if (mirrored) {
    // The mirrored camera sees only what stands above the water.
    if ((flags & (UNDERWATER | NOREFLECT)) != 0u || v.world.y < F.shadowInfo.w - 0.002) { discard; }
  }
  let toP = v.world - F.eye.xyz;
  let dist = max(length(toP), 0.05);
  let d = toP / dist;
  let kind = mats[m].kind;
  var col: vec3f;
  var n = v.nrm;
  if ((flags & SMOOTH) != 0u) { n = normalize(n); }
  if (kind == K_WATER) {
    col = shadeWater(v.world, d, dist);
  } else if (kind == K_HARBOR) {
    col = shadeHarbor(v.world, d, dist);
  } else {
    col = shadeSurface(m, flags, v.ids.y, v.world, n, v.uv, d, dist);
    col = haze(col, flags, d, dist);
  }
  return vec4f(col, 1.0);
}

// Sun shadows: only casters, never the far scenery.
@vertex
fn vs_shadow(v: VIn) -> @builtin(position) vec4f {
  let flags = v.ids.x >> 16u;
  if ((flags & CAST) == 0u || (flags & DISTANT) != 0u) { return vec4f(2.0, 2.0, 2.0, 1.0); }
  return F.shadowMat * vec4f(v.pos, 1.0);
}

struct BOut {
  @builtin(position) clip: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs_full(@builtin(vertex_index) i: u32) -> BOut {
  let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(i & 2u) * 2.0 - 1.0;
  var o: BOut;
  o.clip = vec4f(x, y, 0.0, 1.0);
  o.ndc = vec2f(x, y);
  return o;
}

// Sky and sea wherever nothing was drawn.
@fragment
fn fs_background(b: BOut) -> @location(0) vec4f {
  let W = F.screen.x;
  let H = F.screen.y;
  let px = floor(b.clip.xy);
  let nx = ((px.x + 0.5) / W) * 2.0 - 1.0;
  let ny = 1.0 - ((px.y + 0.5) / H) * 2.0;
  let vy = ny + F.camU.w;
  let d = normalize(F.camF.xyz + F.camR.xyz * nx * F.camF.w + F.camU.xyz * vy * F.camR.w);
  var c = background(F.eye.xyz, d);
  // The airbrush is heaviest at the top of the board.
  if (F.skyLook2.w < 0.5 && d.y > 0.0 && ny > 0.1) {
    let k = 0.22 * ss(0.1, 1.0, ny);
    c += (F.zenith.rgb * vec3f(0.9, 0.9, 0.95) - c) * k;
  }
  return vec4f(c, 1.0);
}
`;

export const SCENE_WGSL = COMMON + SKY + SURFACE + WATER + ENTRY;

// ------------------------------------------------------------------ glow and finish (bloom, toRGBA)

export const POST_WGSL = /* wgsl */ `
struct Post {
  size: vec4f,  // full width, height, half width, half height
  params: vec4f, // threshold, strength, grain, blur radius
  dir: vec4f,    // blur direction (1, 0) or (0, 1)
};

@group(0) @binding(0) var<uniform> P: Post;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var glowTex: texture_2d<f32>;

struct BOut {
  @builtin(position) clip: vec4f,
};

@vertex
fn vs_full(@builtin(vertex_index) i: u32) -> BOut {
  let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(i & 2u) * 2.0 - 1.0;
  var o: BOut;
  o.clip = vec4f(x, y, 0.0, 1.0);
  return o;
}

fn hash2(x: i32, y: i32) -> f32 {
  var h = (bitcast<u32>(x) * 0x27d4eb2du) ^ (bitcast<u32>(y) * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return f32(h ^ (h >> 16u)) / 4294967296.0;
}

// Whatever burns past white, averaged down to half size.
@fragment
fn fs_bright(b: BOut) -> @location(0) vec4f {
  let x = i32(b.clip.x);
  let y = i32(b.clip.y);
  let W = i32(P.size.x);
  let H = i32(P.size.y);
  var s = vec3f(0.0);
  for (var j = 0; j < 2; j++) {
    for (var i = 0; i < 2; i++) {
      let xx = min(W - 1, x * 2 + i);
      let yy = min(H - 1, y * 2 + j);
      s += max(textureLoad(src, vec2i(xx, yy), 0).rgb - vec3f(P.params.x), vec3f(0.0));
    }
  }
  return vec4f(s * 0.25, 1.0);
}

// One box blur along a line, clamped at the edges; three each way make
// the painter's gaussian.
@fragment
fn fs_blur(b: BOut) -> @location(0) vec4f {
  let x = i32(b.clip.x);
  let y = i32(b.clip.y);
  let w = i32(P.size.z);
  let h = i32(P.size.w);
  let R = i32(P.params.w);
  let horizontal = P.dir.x > 0.5;
  var acc = vec3f(0.0);
  for (var i = -R; i <= R; i++) {
    var q = vec2i(x, y);
    if (horizontal) { q.x = clamp(x + i, 0, w - 1); } else { q.y = clamp(y + i, 0, h - 1); }
    acc += textureLoad(src, q, 0).rgb;
  }
  return vec4f(acc / f32(2 * R + 1), 1.0);
}

fn shoulder(x: f32) -> f32 {
  if (x <= 0.82) { return max(x, 0.0); }
  return 0.82 + 0.18 * (1.0 - exp(-(x - 0.82) / 0.18));
}

// Glow laid over the picture, highlights rolled off, and the look's grain.
@fragment
fn fs_final(b: BOut) -> @location(0) vec4f {
  let x = i32(b.clip.x);
  let y = i32(b.clip.y);
  var c = textureLoad(src, vec2i(x, y), 0).rgb;
  let w = P.size.z;
  let h = P.size.w;
  let fx = min(w - 1.001, max(0.0, f32(x) / 2.0 - 0.25));
  let fy = min(h - 1.001, max(0.0, f32(y) / 2.0 - 0.25));
  let ix = i32(floor(fx));
  let iy = i32(floor(fy));
  let ax = fx - f32(ix);
  let ay = fy - f32(iy);
  let v00 = textureLoad(glowTex, vec2i(ix, iy), 0).rgb;
  let v10 = textureLoad(glowTex, vec2i(ix + 1, iy), 0).rgb;
  let v01 = textureLoad(glowTex, vec2i(ix, iy + 1), 0).rgb;
  let v11 = textureLoad(glowTex, vec2i(ix + 1, iy + 1), 0).rgb;
  c += ((v00 * (1.0 - ax) + v10 * ax) * (1.0 - ay) + (v01 * (1.0 - ax) + v11 * ax) * ay) * P.params.y * 2.2;
  let r = shoulder(c.r);
  let g = shoulder(c.g);
  let bl = shoulder(c.b);
  let l = 0.3 * r + 0.55 * g + 0.15 * bl;
  let n = (hash2(x * 7 + 13, y * 11 + 5) + hash2(x * 3 - 71, y * 5 + 29) - 1.0) * P.params.z * (0.3 + 2.8 * l * (1.0 - l));
  return vec4f(clamp(vec3f(r + n, g + n, bl + n), vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
