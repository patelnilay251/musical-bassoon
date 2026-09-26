// The live painter: Paloma Bay drawn on the GPU fast enough to walk
// through, by the rules of src/render.js (see wgsl.js). What it draws comes
// in pieces (a place, the ground between the places), each its own vertex
// buffer, drawn only where the camera or a shadow map can see it. Each
// frame is the sun's shadow maps (a map is redrawn when the walker has left
// it behind or the sun has moved), the world mirrored in the nearest pool
// or the sea, the scene with its sky and sea, then the glow and the look's
// finish.

import { SCENE_WGSL, POST_WGSL } from './wgsl.js';
import { packMesh, packMaterials, packLights, packLampGrid, packSky, packWater, packShades, packFrame, packPanes, shadowMatrix, nearShadowMatrix, mirrorCamera, viewProj, boxInView, VERTEX_BYTES, FRAME_FLOATS, PANE_FLOATS } from './pack.js';
import { skyState } from '../sky.js';
import { lookOf } from '../looks.js';

const HDR = 'rgba16float';
const DEPTH = 'depth32float';
const SAMPLES = 4;
// The shadow maps that follow the walker: `span` meters across `size`
// texels, centered `ahead` meters in front of the eye, moved when the eye
// has gone `move` meters. A centimeter a texel up close; in the town, a
// few hundred meters around at six, and as far as the haze lets anything
// be seen at a quarter meter. A single place has one map of all of it
// instead of the last two, as the painter does.
const NEAR = { size: 4096, span: 40, ahead: 14, move: 5 };
const MID = { size: 4096, span: 240, ahead: 90, move: 20 };
const FAR = { size: 4096, span: 1100, ahead: 400, move: 100 };
// A pool is mirrored rather than the sea when it is in view this close.
const POOL_REACH = 150;
// Each piece is laid out in squares of ground this many meters across,
// each drawn only when a camera or shadow map can see it.
const BIN = 96;
const U = GPUBufferUsage;
const T = GPUTextureUsage;
const S = GPUShaderStage;

/** Ask the browser for a GPU; resolves to a LiveRenderer, or throws. */
export async function createLive(canvas, opts = {}) {
  if (!navigator.gpu) throw new Error('This browser has no WebGPU.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No GPU adapter.');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  // The painter's values go to the screen as they are: never sRGB-encoded.
  context.configure({ device, format, alphaMode: 'opaque' });
  const live = new LiveRenderer(device, context, format, opts);
  // Held for the device's lifetime: some browsers drop a device whose
  // adapter has been collected.
  live.adapter = adapter;
  return live;
}

/**
 * One place (from buildPlace) as the renderer takes a town: a single piece,
 * its lamps' power worked out, mirroring what the painter mirrors.
 */
export function soloScene(world) {
  const power = world.emitScale ?? {};
  const lights = (world.lights ?? []).map((L) => ({ ...L, k: L.k * (L.emit && power[L.emit] !== undefined ? power[L.emit] : 1), emit: undefined }));
  const mirror = world.mirror || (world.pool ? { y: world.pool.waterY, rect: world.pool } : null);
  return {
    id: world.id,
    look: world.look,
    materials: world.materials,
    emitScale: world.emitScale,
    sky: world.sky,
    water: world.water,
    pools: world.pool ? [world.pool] : [],
    mirrors: mirror ? [{ ...mirror, index: mirror.rect ? 0 : -1 }] : [],
    seaLevel: world.seaLevel,
    shadowBox: world.shadowBox,
    chunks: new Map([[world.id, { id: world.id, mesh: world.mesh, lights, pool: world.pool ?? null }]]),
    lights,
    solo: true,
  };
}

export class LiveRenderer {
  constructor(device, context, format, { shadowSize = 4096, reflScale = 0.6, cascades = {} } = {}) {
    this.device = device;
    this.context = context;
    this.format = format;
    const max = device.limits.maxTextureDimension2D;
    this.shadowSize = Math.min(shadowSize, max);
    this.reflScale = reflScale;
    this.scene = null;
    this.hours = null;
    this.skip = new Set(); // passes to leave out, for finding faults
    this.W = 0;
    this.H = 0;
    this.pieces = new Map(); // piece id -> its buffer and bounds on the GPU
    device.lost.then((info) => console.warn('GPU device lost:', info.message));

    const scene = device.createShaderModule({ code: SCENE_WGSL });
    const post = device.createShaderModule({ code: POST_WGSL });
    this.shaders = { scene, post };

    // Only the frame's uniforms reach the vertex stage; everything else is
    // the fragment shader's (some GPUs allow no storage there).
    const storage = (binding) => ({ binding, visibility: S.FRAGMENT, buffer: { type: 'read-only-storage' } });
    const depthTex = (binding) => ({ binding, visibility: S.FRAGMENT, texture: { sampleType: 'depth' } });
    this.sceneLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform' } },
        storage(1),
        storage(2),
        storage(3),
        storage(4),
        storage(5),
        { binding: 6, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
        depthTex(7),
        { binding: 8, visibility: S.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 9, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 10, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
        depthTex(11),
        storage(12),
        depthTex(13),
        storage(14),
      ],
    });
    const sceneLayout = device.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] });
    const vertex = {
      module: scene,
      buffers: [
        {
          arrayStride: VERTEX_BYTES,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x2' },
            { shaderLocation: 3, offset: 32, format: 'uint32x2' },
          ],
        },
      ],
    };
    // Back faces are culled but for two-sided triangles, as in raster.js.
    const surface = (samples, cullMode) =>
      device.createRenderPipeline({
        layout: sceneLayout,
        vertex: { ...vertex, entryPoint: 'vs_main' },
        fragment: { module: scene, entryPoint: 'fs_main', targets: [{ format: HDR }] },
        primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode },
        depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'greater' },
        multisample: { count: samples },
      });
    const sky = (samples) =>
      device.createRenderPipeline({
        layout: sceneLayout,
        vertex: { module: scene, entryPoint: 'vs_full' },
        fragment: { module: scene, entryPoint: 'fs_background', targets: [{ format: HDR }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'equal' },
        multisample: { count: samples },
      });
    this.surfacePipe = surface(SAMPLES, 'back');
    this.surfaceDoublePipe = surface(SAMPLES, 'none');
    this.skyPipe = sky(SAMPLES);
    this.surfaceMirrorPipe = surface(1, 'back');
    this.surfaceMirrorDoublePipe = surface(1, 'none');
    this.skyMirrorPipe = sky(1);
    this.shadowPipe = device.createRenderPipeline({
      layout: sceneLayout,
      vertex: { ...vertex, entryPoint: 'vs_shadow' },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
    });

    this.postLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: S.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: S.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const postLayout = device.createPipelineLayout({ bindGroupLayouts: [this.postLayout] });
    const postPipe = (entryPoint, format) =>
      device.createRenderPipeline({
        layout: postLayout,
        vertex: { module: post, entryPoint: 'vs_full' },
        fragment: { module: post, entryPoint, targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
    this.brightPipe = postPipe('fs_bright', HDR);
    this.blurPipe = postPipe('fs_blur', HDR);
    this.finalPipe = postPipe('fs_final', format);

    const frame = () => device.createBuffer({ size: FRAME_FLOATS * 4, usage: U.UNIFORM | U.COPY_DST });
    this.frameMain = frame();
    this.frameMirror = frame();
    this.postMain = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    this.postH = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    this.postV = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });

    // The shadow maps: each its own frame (only its matrix is read, by
    // vs_shadow) and where it stands. `far` is the whole place's in a place
    // and follows the walker in the town; `mid` is the town's only.
    const map = (name, spec) => {
      const size = Math.min(spec.size, max);
      return { name, ...spec, size, tex: null, frame: frame(), at: null, m: null, dirty: true };
    };
    this.maps = {
      near: map('near', { ...NEAR, ...cascades.near }),
      mid: map('mid', { ...MID, ...cascades.mid }),
      far: map('far', { ...FAR, ...cascades.far }),
    };
    this.maps.near.tex = device.createTexture({ size: [this.maps.near.size, this.maps.near.size], format: DEPTH, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    this.dummyDepth = device.createTexture({ size: [1, 1], format: DEPTH, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    this.dummyColor = device.createTexture({ size: [1, 1], format: HDR, usage: T.TEXTURE_BINDING | T.RENDER_ATTACHMENT });
    this.shadowSampler = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  }

  buffer(data, usage) {
    const b = this.device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage: usage | U.COPY_DST });
    this.device.queue.writeBuffer(b, 0, data);
    return b;
  }

  /** Put a place (from buildPlace) on the GPU. */
  setWorld(world) {
    this.setScene(soloScene(world));
  }

  /**
   * Put a town (town.js Town), or soloScene(), on the GPU. Its pieces are
   * taken as they are now; call sync() when some have been added or built
   * again.
   */
  setScene(scene) {
    for (const id of [...this.pieces.keys()]) this.dropPiece(id);
    for (const b of this.sceneBuffers ?? []) b.destroy();
    this.scene = scene;
    this.look = lookOf(scene.look);
    this.solo = Boolean(scene.solo);
    // The far map covers a place whole, at the size the painter's has; in
    // the town it follows the walker, and the middle one with it.
    const far = this.maps.far;
    const farSize = this.solo ? this.shadowSize : far.size;
    if (!far.tex || far.tex.width !== farSize) {
      far.tex?.destroy();
      far.tex = this.device.createTexture({ size: [farSize, farSize], format: DEPTH, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    }
    far.texSize = farSize;
    const mid = this.maps.mid;
    if (!this.solo && !mid.tex) mid.tex = this.device.createTexture({ size: [mid.size, mid.size], format: DEPTH, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    this.skyBuf = this.buffer(packSky(scene.sky), U.STORAGE);
    this.waterBuf = this.device.createBuffer({ size: packWater(scene).byteLength, usage: U.UNIFORM | U.COPY_DST });
    this.sceneBuffers = [this.skyBuf, this.waterBuf];
    this.slots = new Map();
    this.paneEnd = 0;
    this.matCount = -1;
    this.hours = null;
    this.bindGroups = null;
    this.sync();
  }

  /** Take up the scene's pieces as they stand: new ones, rebuilt ones, lamps and paints. */
  sync() {
    const scene = this.scene;
    let changed = this.matCount < 0;
    for (const [id, p] of this.pieces) {
      if (scene.chunks.get(id) !== p.src) {
        this.dropPiece(id);
        changed = true;
      }
    }
    for (const [id, c] of scene.chunks) {
      if (!this.pieces.has(id)) {
        this.addPiece(id, c);
        changed = true;
      }
    }
    if (!changed) return false;
    const d = this.device;
    // Materials only grow; a place built again may change a lamp's power.
    const mats = packMaterials(scene);
    if (mats.count !== this.matCount) {
      for (const b of [this.mats, this.lanes, this.shades]) b?.destroy();
      this.mats = this.buffer(mats.data, U.STORAGE);
      this.lanes = this.buffer(mats.lanes, U.STORAGE);
      this.shades = d.createBuffer({ size: Math.max(1, scene.materials.length) * 48, usage: U.STORAGE | U.COPY_DST });
      this.matCount = mats.count;
      this.bindGroups = null;
    } else {
      d.queue.writeBuffer(this.mats, 0, mats.data);
    }
    if (this.S) d.queue.writeBuffer(this.shades, 0, packShades(scene, this.S));
    // Lamps, and the squares of ground each can light.
    const lights = packLights(scene, scene.lights);
    this.lightCount = lights.count;
    this.lightBuf?.destroy();
    this.lightBuf = this.buffer(lights.data, U.STORAGE);
    this.lampGrid?.destroy();
    this.lampGrid = this.buffer(packLampGrid(scene.lights), U.STORAGE);
    d.queue.writeBuffer(this.waterBuf, 0, packWater(scene));
    // The panes of every piece, each in its own run of slots.
    const total = Math.max(1, this.paneEnd);
    const panes = new Float32Array(total * PANE_FLOATS);
    for (const p of this.pieces.values()) panes.set(p.panes, p.paneBase * PANE_FLOATS);
    this.paneBuf?.destroy();
    this.paneBuf = this.buffer(panes, U.STORAGE);
    this.pools = scene.pools ?? [];
    this.bindGroups = null;
    for (const m of Object.values(this.maps)) m.dirty = true;
    return true;
  }

  addPiece(id, c) {
    const scene = this.scene;
    const panes = packPanes({ id, mesh: c.mesh, materials: scene.materials });
    // A piece built again keeps its run of pane slots if it still fits.
    let slot = this.slots.get(id);
    if (!slot || slot.cap < panes.count) {
      slot = { base: this.paneEnd, cap: panes.count };
      this.paneEnd = slot.base + panes.count;
      this.slots.set(id, slot);
    }
    const paneOf = panes.paneOf;
    for (let t = 0; t < paneOf.length; t++) if (paneOf[t]) paneOf[t] += slot.base;
    // Laid out square by square, each square drawn only when in view.
    const sea = new Set(scene.materials.flatMap((m, i) => (m.kind === 'harbor' ? [i] : [])));
    const mesh = packMesh(c.mesh, scene.shadowBox, paneOf, { bin: BIN, sea });
    const vb = this.buffer(mesh.data, U.VERTEX);
    this.pieces.set(id, {
      src: c,
      vb,
      parts: mesh.parts.map((p) => ({ ...p, vb })),
      panes: panes.count ? panes.data : new Float32Array(0),
      paneBase: slot.base,
    });
  }

  dropPiece(id) {
    this.pieces.get(id)?.vb.destroy();
    this.pieces.delete(id);
  }

  /** The hour (and the sky's own clock) to paint. */
  setTime(hours) {
    if (hours === this.hours) return;
    this.hours = hours;
    this.S = skyState(hours, this.scene.sky, this.look);
    this.device.queue.writeBuffer(this.shades, 0, packShades(this.scene, this.S));
    this.shadow = this.S.keyOn;
    for (const m of Object.values(this.maps)) {
      m.at = null;
      m.dirty = true;
    }
  }

  /** Paint a frame into a texture and read it back as RGBA bytes. */
  async snapshot(cam, opts = {}) {
    const d = this.device;
    const W = this.W;
    const H = this.H;
    const tex = d.createTexture({ size: [W, H], format: this.format, usage: T.RENDER_ATTACHMENT | T.COPY_SRC });
    this.render(cam, { ...opts, target: tex.createView() });
    const row = Math.ceil((W * 4) / 256) * 256;
    const buf = d.createBuffer({ size: row * H, usage: U.COPY_DST | U.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [W, H]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const out = new Uint8ClampedArray(W * H * 4);
    const bgra = this.format.startsWith('bgra');
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * row + x * 4;
        const o = (y * W + x) * 4;
        out[o] = src[i + (bgra ? 2 : 0)];
        out[o + 1] = src[i + 1];
        out[o + 2] = src[i + (bgra ? 0 : 2)];
        out[o + 3] = 255;
      }
    }
    buf.unmap();
    buf.destroy();
    tex.destroy();
    return out;
  }

  // Does any part of the pool's surface fall inside the frame?
  inView(vp, P, h) {
    const corners = [
      [P.x0, P.z0],
      [P.x1, P.z0],
      [P.x0, P.z1],
      [P.x1, P.z1],
    ].map(([x, z]) => [vp[0] * x + vp[4] * h + vp[8] * z + vp[12], vp[1] * x + vp[5] * h + vp[9] * z + vp[13], vp[3] * x + vp[7] * h + vp[11] * z + vp[15]]);
    if (corners.some((c) => c[2] <= 0.05)) return true; // around the camera: can't tell cheaply
    const out = (test) => corners.every(test);
    return !(out((c) => c[0] < -c[2]) || out((c) => c[0] > c[2]) || out((c) => c[1] < -c[2]) || out((c) => c[1] > c[2]));
  }

  // The pool's rectangle in the mirrored frame, padded for the ripples, as
  // [x, y, w, h] in the reflection texture's pixels.
  poolRect(vp, P, h) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, z] of [
      [P.x0, P.z0],
      [P.x1, P.z0],
      [P.x0, P.z1],
      [P.x1, P.z1],
    ]) {
      const cx = vp[0] * x + vp[4] * h + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * h + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * h + vp[11] * z + vp[15];
      if (cw < 0.05) return [0, 0, this.rw, this.rh];
      const sx = (cx / cw + 1) * 0.5 * this.rw;
      const sy = (1 - cy / cw) * 0.5 * this.rh;
      x0 = Math.min(x0, sx);
      y0 = Math.min(y0, sy);
      x1 = Math.max(x1, sx);
      y1 = Math.max(y1, sy);
    }
    const pad = Math.round(24 * this.reflScale);
    const ax = Math.max(0, Math.floor(x0) - pad);
    const ay = Math.max(0, Math.floor(y0) - pad);
    const bx = Math.min(this.rw, Math.ceil(x1) + pad);
    const by = Math.min(this.rh, Math.ceil(y1) + pad);
    return [ax, ay, Math.max(0, bx - ax), Math.max(0, by - ay)];
  }

  // Rows of the mirrored frame open water can look up, for a level camera
  // (Renderer.reflectionBand): row y sees its image at -y - 2 shift.
  band(cam) {
    const level = Math.abs(cam.target[1] - cam.eye[1]) < 1e-6;
    if (!level) return [0, 0, this.rw, this.rh];
    const sh = cam.shift ?? 0;
    const y0 = Math.max(0, ((sh - 0.08) * this.rh) | 0);
    const y1 = Math.min(this.rh, Math.ceil(((1 + sh + 0.16) / 2) * this.rh));
    return [0, y0, this.rw, Math.max(0, y1 - y0)];
  }

  // What this frame mirrors: a place's own (a pool, or its open water), or
  // in the town the nearest pool in view, else the sea.
  mirrorFor(cam, vp) {
    const eye = cam.eye;
    const sea = this.scene.seaLevel ?? 0;
    const list = this.scene.mirrors ?? [...this.pools.map((p, i) => ({ y: p.waterY, rect: p, index: i, reach: POOL_REACH })), { y: sea, index: -1 }];
    let best = null;
    let bestD = Infinity;
    for (const M of list) {
      if (!M.rect || eye[1] <= M.y || !this.inView(vp, M.rect, M.y)) continue;
      const R = M.rect;
      const dd = Math.hypot(Math.max(R.x0 - eye[0], 0, eye[0] - R.x1), Math.max(R.z0 - eye[2], 0, eye[2] - R.z1));
      if (dd < (M.reach ?? Infinity) && dd < bestD) {
        best = M;
        bestD = dd;
      }
    }
    return best ?? list.find((M) => !M.rect && eye[1] > M.y) ?? null;
  }

  // Put a following shadow map where the walker needs it; true if it moved.
  follow(m, cam) {
    const fx = cam.target[0] - cam.eye[0];
    const fz = cam.target[2] - cam.eye[2];
    const fl = Math.hypot(fx, fz) || 1;
    const want = [cam.eye[0] + (fx / fl) * m.ahead, cam.eye[1] - 1.6, cam.eye[2] + (fz / fl) * m.ahead];
    if (m.at && Math.hypot(want[0] - m.at[0], want[1] - m.at[1], want[2] - m.at[2]) <= m.move) return false;
    m.at = want;
    m.m = nearShadowMatrix(this.S, this.scene.shadowBox, want, m.span, m.size);
    return true;
  }

  resize(W, H) {
    if (W === this.W && H === this.H) return;
    for (const t of this.sized ?? []) t.destroy();
    this.W = W;
    this.H = H;
    const d = this.device;
    const tex = (w, h, format, usage, sampleCount = 1) => d.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format, usage, sampleCount });
    this.msColor = tex(W, H, HDR, T.RENDER_ATTACHMENT, SAMPLES);
    this.msDepth = tex(W, H, DEPTH, T.RENDER_ATTACHMENT, SAMPLES);
    this.hdr = tex(W, H, HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    this.rw = Math.max(8, Math.round(W * this.reflScale));
    this.rh = Math.max(8, Math.round(H * this.reflScale));
    this.refl = tex(this.rw, this.rh, HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    this.reflDepth = tex(this.rw, this.rh, DEPTH, T.RENDER_ATTACHMENT);
    this.hw = Math.max(1, W >> 1);
    this.hh = Math.max(1, H >> 1);
    this.glowA = tex(this.hw, this.hh, HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    this.glowB = tex(this.hw, this.hh, HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING);
    this.sized = [this.msColor, this.msDepth, this.hdr, this.refl, this.reflDepth, this.glowA, this.glowB];
    this.bindGroups = null;
  }

  makeBindGroups() {
    const d = this.device;
    const view = (tex) => (tex ?? this.dummyDepth).createView();
    const group = (frame, reflView, maps) =>
      d.createBindGroup({
        layout: this.sceneLayout,
        entries: [
          { binding: 0, resource: { buffer: frame } },
          { binding: 1, resource: { buffer: this.mats } },
          { binding: 2, resource: { buffer: this.shades } },
          { binding: 3, resource: { buffer: this.lightBuf } },
          { binding: 4, resource: { buffer: this.lanes } },
          { binding: 5, resource: { buffer: this.skyBuf } },
          { binding: 6, resource: { buffer: this.waterBuf } },
          { binding: 7, resource: maps.far },
          { binding: 8, resource: this.shadowSampler },
          { binding: 9, resource: reflView },
          { binding: 10, resource: this.linear },
          { binding: 11, resource: maps.near },
          { binding: 12, resource: { buffer: this.paneBuf } },
          { binding: 13, resource: maps.mid },
          { binding: 14, resource: { buffer: this.lampGrid } },
        ],
      });
    const M = this.maps;
    const lit = { far: view(M.far.tex), near: view(M.near.tex), mid: view(this.solo ? null : M.mid.tex) };
    // A map is never read in the pass that draws it.
    const none = { far: view(null), near: view(null), mid: view(null) };
    const dummyColor = this.dummyColor.createView();
    const post = (buf, a, b) =>
      d.createBindGroup({
        layout: this.postLayout,
        entries: [
          { binding: 0, resource: { buffer: buf } },
          { binding: 1, resource: a.createView() },
          { binding: 2, resource: b.createView() },
        ],
      });
    this.bindGroups = {
      main: group(this.frameMain, this.refl.createView(), lit),
      mirror: group(this.frameMirror, dummyColor, lit),
      near: group(M.near.frame, dummyColor, none),
      mid: group(M.mid.frame, dummyColor, none),
      far: group(M.far.frame, dummyColor, none),
      bright: post(this.postMain, this.hdr, this.glowB),
      // The second texture is unused by the blur; never the one it draws to.
      blurH: post(this.postH, this.glowA, this.hdr),
      blurV: post(this.postV, this.glowB, this.hdr),
      final: post(this.postMain, this.hdr, this.glowA),
    };
  }

  // The runs of triangles a camera (or a shadow map) with this matrix can
  // see, one-sided first.
  visible(vp, rect) {
    const out = [];
    for (const piece of this.pieces.values()) for (const p of piece.parts) if (boxInView(vp, p.box, rect)) out.push(p);
    return out.sort((a, b) => a.double - b.double);
  }

  // Draw runs of triangles, switching buffers only when the piece changes.
  // What each pass drew goes in `stats` (triangles), for finding faults.
  drawRuns(pass, runs, single, double, name) {
    let pipe = null;
    let vb = null;
    if (name) this.stats[name] = runs.reduce((n, p) => n + p.count / 3, 0);
    for (const p of runs) {
      const want = single && p.double ? double : single;
      if (want && want !== pipe) pass.setPipeline((pipe = want));
      if (p.vb !== vb) pass.setVertexBuffer(0, (vb = p.vb));
      pass.draw(p.count, 1, p.first);
    }
  }

  /**
   * Paint one frame from cam = { eye, target, fovY, shift }. rippleT runs
   * the water; starT, when given, lets the stars shimmer. `target` (a
   * texture view in the canvas format) paints somewhere other than the
   * canvas, to read the frame back.
   */
  render(cam, { rippleT = this.hours * 0.35, starT = -1, target = null } = {}) {
    const d = this.device;
    if (!this.bindGroups) this.makeBindGroups();
    const W = this.W;
    const H = this.H;
    const pixelAngle = (2 * Math.tan((cam.fovY * Math.PI) / 360)) / H;
    const vp = viewProj(cam, W / H);
    const seen = this.skip.has('surface') ? [] : this.visible(vp);
    // The mirrored pass only where the water can show it, as
    // buildReflection does: cut to a pool's rectangle, or the rows open
    // water can look up; none for open water when none is in view.
    let M = this.mirrorFor(cam, vp);
    if (M && !M.rect && !seen.some((p) => p.sea)) M = null;
    let mirror = Boolean(M);
    const mcam = mirror ? mirrorCamera(cam, M.y) : null;
    const mirrorVP = mirror ? viewProj(mcam, W / H) : null;
    const scissor = mirror ? (M.rect ? this.poolRect(mirrorVP, M.rect, M.y) : this.band(cam)) : null;
    if (scissor && (scissor[2] <= 0 || scissor[3] <= 0)) mirror = false;
    // Lookups stay inside what was painted (texel centers, as sampleReflection).
    const reflRect = mirror ? [(scissor[0] + 0.5) / this.rw, (scissor[1] + 0.5) / this.rh, (scissor[0] + scissor[2] - 0.501) / this.rw, (scissor[1] + scissor[3] - 0.501) / this.rh] : [0, 0, 1, 1];

    // The shadow maps: redrawn where the walker has left them behind, or
    // when the sun or the town has changed.
    const maps = this.maps;
    const redraw = [];
    const on = (m) => this.shadow && !this.skip.has(m.name === 'far' ? 'shadow' : m.name);
    if (on(maps.near)) {
      if (this.follow(maps.near, cam) || maps.near.dirty) redraw.push(maps.near);
    } else {
      maps.near.m = null;
    }
    if (!this.solo && on(maps.mid)) {
      if (this.follow(maps.mid, cam) || maps.mid.dirty) redraw.push(maps.mid);
    } else {
      maps.mid.m = null;
    }
    if (on(maps.far)) {
      if (this.solo) {
        if (maps.far.dirty) {
          maps.far.m = shadowMatrix(this.S, this.scene.shadowBox);
          redraw.push(maps.far);
        }
      } else if (this.follow(maps.far, cam) || maps.far.dirty) {
        redraw.push(maps.far);
      }
    } else {
      maps.far.m = null;
    }
    const far = maps.far.m;
    const common = {
      S: this.S,
      look: this.look,
      shadow: far,
      shadowSize: maps.far.texSize,
      near: maps.near.m,
      nearSize: maps.near.size,
      mid: maps.mid.m,
      midSize: maps.mid.size,
      rippleT,
      starT,
      lightCount: this.lightCount,
      hasPool: this.pools.length > 0,
      seaLevel: this.scene.seaLevel,
      mirrorY: M ? M.y : 0,
      mirrored: M ? M.index : -1,
    };
    d.queue.writeBuffer(this.frameMain, 0, packFrame({ ...common, cam, W, H, mirrorVP, reflection: mirror, reflRect }));
    for (const m of redraw) {
      // A map's pass draws with the same vertex stage, through its matrix.
      const f = new Float32Array(FRAME_FLOATS);
      f.set(m.m.m, 32);
      d.queue.writeBuffer(m.frame, 0, f);
    }
    if (mirror) d.queue.writeBuffer(this.frameMirror, 0, packFrame({ ...common, cam: mcam, W: this.rw, H: this.rh, pixelAngle, mirror: true, reflection: false }));
    const blurR = Math.max(1, Math.round(0.012 * H * 0.5));
    d.queue.writeBuffer(this.postMain, 0, new Float32Array([W, H, this.hw, this.hh, 1.1, 0.9, this.look.grain, blurR, 0, 0, 0, 0]));
    d.queue.writeBuffer(this.postH, 0, new Float32Array([W, H, this.hw, this.hh, 1.1, 0.9, this.look.grain, blurR, 1, 0, 0, 0]));
    d.queue.writeBuffer(this.postV, 0, new Float32Array([W, H, this.hw, this.hh, 1.1, 0.9, this.look.grain, blurR, 0, 1, 0, 0]));

    const enc = d.createCommandEncoder();
    // Which water was mirrored (a pool's index, -1 the sea, null none), and
    // the triangles each pass drew.
    this.stats = { mirrored: mirror ? M.index : null };
    for (const m of redraw) {
      const pass = enc.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: m.tex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setPipeline(this.shadowPipe);
      pass.setBindGroup(0, this.bindGroups[m.name]);
      this.drawRuns(pass, this.visible(m.m.m), null, null, m.name);
      pass.end();
      m.dirty = false;
    }
    if (mirror && !this.skip.has('mirror')) {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.refl.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        depthStencilAttachment: { view: this.reflDepth.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      });
      pass.setBindGroup(0, this.bindGroups.mirror);
      pass.setScissorRect(...scissor);
      // Only what can be seen in the part of the mirror that is painted.
      const [sx, sy, sw, sh] = scissor;
      const ndc = [(sx / this.rw) * 2 - 1, ((sx + sw) / this.rw) * 2 - 1, 1 - ((sy + sh) / this.rh) * 2, 1 - (sy / this.rh) * 2];
      this.drawRuns(pass, this.visible(mirrorVP, ndc), this.surfaceMirrorPipe, this.surfaceMirrorDoublePipe, 'mirror');
      pass.setPipeline(this.skyMirrorPipe);
      pass.draw(3);
      pass.end();
    }
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.msColor.createView(), resolveTarget: this.hdr.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }],
        depthStencilAttachment: { view: this.msDepth.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      });
      pass.setBindGroup(0, this.bindGroups.main);
      this.drawRuns(pass, seen, this.surfacePipe, this.surfaceDoublePipe, 'main');
      if (!this.skip.has('sky')) {
        pass.setPipeline(this.skyPipe);
        pass.draw(3);
      }
      pass.end();
    }
    const postPass = (pipe, group, target) => {
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      pass.setPipeline(pipe);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
    };
    if (!this.skip.has('glow')) postPass(this.brightPipe, this.bindGroups.bright, this.glowA.createView());
    for (let i = 0; i < (this.skip.has('glow') ? 0 : 3); i++) {
      postPass(this.blurPipe, this.bindGroups.blurH, this.glowB.createView());
      postPass(this.blurPipe, this.bindGroups.blurV, this.glowA.createView());
    }
    postPass(this.finalPipe, this.bindGroups.final, target ?? this.context.getCurrentTexture().createView());
    d.queue.submit([enc.finish()]);
  }
}
