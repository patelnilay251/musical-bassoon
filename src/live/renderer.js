// The live painter: a place drawn on the GPU fast enough to walk through,
// by the rules of src/render.js (see wgsl.js). Each frame is the sun's
// shadow map (only when the hour changes), the world mirrored in the pool,
// the scene with its sky and sea, then the glow and the look's finish.

import { SCENE_WGSL, POST_WGSL } from './wgsl.js';
import { packMesh, packMaterials, packLights, packSky, packPool, packShades, packFrame, shadowMatrix, mirrorCamera, viewProj, VERTEX_BYTES, FRAME_FLOATS } from './pack.js';
import { skyState } from '../sky.js';
import { lookOf } from '../looks.js';

const HDR = 'rgba16float';
const DEPTH = 'depth32float';
const SAMPLES = 4;
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

export class LiveRenderer {
  constructor(device, context, format, { shadowSize = 4096, reflScale = 0.6 } = {}) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.shadowSize = Math.min(shadowSize, device.limits.maxTextureDimension2D);
    this.reflScale = reflScale;
    this.world = null;
    this.hours = null;
    this.skip = new Set(); // passes to leave out, for finding faults
    this.W = 0;
    this.H = 0;
    device.lost.then((info) => console.warn('GPU device lost:', info.message));

    const scene = device.createShaderModule({ code: SCENE_WGSL });
    const post = device.createShaderModule({ code: POST_WGSL });
    this.scene = scene;
    this.post = post;

    // Only the frame's uniforms reach the vertex stage; everything else is
    // the fragment shader's (some GPUs allow no storage there).
    this.sceneLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: S.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: S.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: S.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: S.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: S.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 7, visibility: S.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 8, visibility: S.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 9, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 10, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
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

    this.frameMain = device.createBuffer({ size: FRAME_FLOATS * 4, usage: U.UNIFORM | U.COPY_DST });
    this.frameMirror = device.createBuffer({ size: FRAME_FLOATS * 4, usage: U.UNIFORM | U.COPY_DST });
    this.postMain = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    this.postH = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });
    this.postV = device.createBuffer({ size: 48, usage: U.UNIFORM | U.COPY_DST });

    this.shadowTex = device.createTexture({ size: [this.shadowSize, this.shadowSize], format: DEPTH, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
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
    for (const b of this.worldBuffers ?? []) b.destroy();
    this.world = world;
    this.look = lookOf(world.look);
    const mesh = packMesh(world.mesh, world.shadowBox);
    const mats = packMaterials(world);
    const lights = packLights(world);
    this.vertexCount = mesh.count;
    this.singleCount = mesh.single;
    this.lightCount = lights.count;
    this.vertices = this.buffer(mesh.data, U.VERTEX);
    this.mats = this.buffer(mats.data, U.STORAGE);
    this.lanes = this.buffer(mats.lanes, U.STORAGE);
    this.lightBuf = this.buffer(lights.data, U.STORAGE);
    this.skyBuf = this.buffer(packSky(world.sky), U.STORAGE);
    this.poolBuf = this.buffer(packPool(world.pool, world.water), U.UNIFORM);
    this.shades = this.device.createBuffer({ size: Math.max(1, world.materials.length) * 48, usage: U.STORAGE | U.COPY_DST });
    this.worldBuffers = [this.vertices, this.mats, this.lanes, this.lightBuf, this.skyBuf, this.poolBuf, this.shades];
    // What the world mirrors, as Renderer does: open water (the whole
    // frame) or a pool (its rectangle).
    this.mirror = world.mirror || (world.pool ? { y: world.pool.waterY, rect: world.pool } : null);
    this.hours = null;
    this.bindGroups = null;
  }

  /** The hour (and the sky's own clock) to paint. */
  setTime(hours) {
    if (hours === this.hours) return;
    this.hours = hours;
    this.S = skyState(hours, this.world.sky, this.look);
    this.device.queue.writeBuffer(this.shades, 0, packShades(this.world, this.S));
    this.shadow = this.S.keyOn ? shadowMatrix(this.S, this.world.shadowBox) : null;
    this.shadowDirty = true;
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
    const group = (frame, shadowView, reflView) =>
      d.createBindGroup({
        layout: this.sceneLayout,
        entries: [
          { binding: 0, resource: { buffer: frame } },
          { binding: 1, resource: { buffer: this.mats } },
          { binding: 2, resource: { buffer: this.shades } },
          { binding: 3, resource: { buffer: this.lightBuf } },
          { binding: 4, resource: { buffer: this.lanes } },
          { binding: 5, resource: { buffer: this.skyBuf } },
          { binding: 6, resource: { buffer: this.poolBuf } },
          { binding: 7, resource: shadowView },
          { binding: 8, resource: this.shadowSampler },
          { binding: 9, resource: reflView },
          { binding: 10, resource: this.linear },
        ],
      });
    const shadowView = this.shadowTex.createView();
    const dummyDepth = this.dummyDepth.createView();
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
      main: group(this.frameMain, shadowView, this.refl.createView()),
      mirror: group(this.frameMirror, shadowView, dummyColor),
      shadow: group(this.frameMain, dummyDepth, dummyColor),
      bright: post(this.postMain, this.hdr, this.glowB),
      // The second texture is unused by the blur; never the one it draws to.
      blurH: post(this.postH, this.glowA, this.hdr),
      blurV: post(this.postV, this.glowB, this.hdr),
      final: post(this.postMain, this.hdr, this.glowA),
    };
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
    // The mirrored pass only where the pool can show it, as buildReflection
    // does: skipped when the pool is out of view, else cut to its rectangle.
    const M = this.mirror;
    let mirror = Boolean(M) && cam.eye[1] > M.y && (!M.rect || this.inView(viewProj(cam, W / H), M.rect, M.y));
    const mcam = mirror ? mirrorCamera(cam, M.y) : null;
    const mirrorVP = mirror ? viewProj(mcam, W / H) : null;
    const scissor = mirror ? (M.rect ? this.poolRect(mirrorVP, M.rect, M.y) : this.band(cam)) : null;
    if (scissor && (scissor[2] <= 0 || scissor[3] <= 0)) mirror = false;
    // Lookups stay inside what was painted (texel centers, as sampleReflection).
    const reflRect = mirror ? [(scissor[0] + 0.5) / this.rw, (scissor[1] + 0.5) / this.rh, (scissor[0] + scissor[2] - 0.501) / this.rw, (scissor[1] + scissor[3] - 0.501) / this.rh] : [0, 0, 1, 1];
    const common = { S: this.S, look: this.look, shadow: this.shadow, shadowSize: this.shadowSize, rippleT, starT, lightCount: this.lightCount, hasPool: Boolean(this.world.pool), seaLevel: this.world.seaLevel, mirrorY: M ? M.y : 0 };
    d.queue.writeBuffer(this.frameMain, 0, packFrame({ ...common, cam, W, H, mirrorVP, reflection: mirror, reflRect }));
    if (mirror) d.queue.writeBuffer(this.frameMirror, 0, packFrame({ ...common, cam: mcam, W: this.rw, H: this.rh, pixelAngle, mirror: true, reflection: false }));
    const blurR = Math.max(1, Math.round(0.012 * H * 0.5));
    d.queue.writeBuffer(this.postMain, 0, new Float32Array([W, H, this.hw, this.hh, 1.1, 0.9, this.look.grain, blurR, 0, 0, 0, 0]));
    d.queue.writeBuffer(this.postH, 0, new Float32Array([W, H, this.hw, this.hh, 1.1, 0.9, this.look.grain, blurR, 1, 0, 0, 0]));
    d.queue.writeBuffer(this.postV, 0, new Float32Array([W, H, this.hw, this.hh, 1.1, 0.9, this.look.grain, blurR, 0, 1, 0, 0]));

    const enc = d.createCommandEncoder();
    if (this.shadowDirty && this.shadow && !this.skip.has('shadow')) {
      const pass = enc.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: this.shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setPipeline(this.shadowPipe);
      pass.setBindGroup(0, this.bindGroups.shadow);
      pass.setVertexBuffer(0, this.vertices);
      pass.draw(this.vertexCount);
      pass.end();
    }
    this.shadowDirty = false;
    if (mirror && !this.skip.has('mirror')) {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.refl.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        depthStencilAttachment: { view: this.reflDepth.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' },
      });
      pass.setBindGroup(0, this.bindGroups.mirror);
      pass.setScissorRect(...scissor);
      pass.setVertexBuffer(0, this.vertices);
      pass.setPipeline(this.surfaceMirrorPipe);
      pass.draw(this.singleCount);
      pass.setPipeline(this.surfaceMirrorDoublePipe);
      pass.draw(this.vertexCount - this.singleCount, 1, this.singleCount);
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
      if (!this.skip.has('surface')) {
        pass.setVertexBuffer(0, this.vertices);
        pass.setPipeline(this.surfacePipe);
        pass.draw(this.singleCount);
        pass.setPipeline(this.surfaceDoublePipe);
        pass.draw(this.vertexCount - this.singleCount, 1, this.singleCount);
      }
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
