// The render service: builds places and paints tiles of frames. It runs in
// a Web Worker (see worker.js) or, where workers are unavailable, on the
// page itself, one tile per task. Messages in:
//   { type: 'frame', job, place, props, hours, view (a name), W, H, ss,
//     shadowSize, reflScale, tiles: [[x0, y0, x1, y1], ...] }
//   { type: 'cancel' }
// Messages out: { type: 'tile', job, rect, data: Float32Array RGB } and
// { type: 'done', job }. A newer frame always replaces an older one.

import { buildPlace } from '../src/scenes/index.js';
import { Renderer } from '../src/render.js';
import { fit } from '../src/camera.js';

export function createService(post) {
  let world = null; // { key, world, r }
  let pending = null;
  let job = null;
  let tiles = [];
  let scheduled = false;

  const kick = () => {
    if (!scheduled) {
      scheduled = true;
      setTimeout(loop, 0);
    }
  };

  function setup(m) {
    const key = `${m.place}|${JSON.stringify(m.props)}`;
    if (!world || world.key !== key) {
      world = null; // let the old one go before building the next
      const w = buildPlace(m.place, m.props);
      world = { key, world: w, r: new Renderer(w, { shadowSize: m.shadowSize, reflScale: m.reflScale }) };
    }
    const r = world.r;
    if (r.shadowSize !== m.shadowSize) {
      r.shadowSize = m.shadowSize;
      r.shadowValid = false;
    }
    r.reflScale = m.reflScale;
    r.setTime(m.hours);
    const w = world.world;
    r.setCamera(fit(w.views[m.view] ?? w.views[w.hero], m.W / m.H), m.W, m.H, m.ss);
    r.prepare();
  }

  function loop() {
    scheduled = false;
    if (pending) {
      job = pending;
      pending = null;
      setup(job);
      tiles = job.tiles.slice();
    }
    if (!job) return;
    if (tiles.length) {
      const [x0, y0, x1, y1] = tiles.shift();
      const data = new Float32Array((x1 - x0) * (y1 - y0) * 3);
      world.r.renderTile(x0, y0, x1, y1, data, true);
      post({ type: 'tile', job: job.job, rect: [x0, y0, x1, y1], data }, [data.buffer]);
      kick();
    } else {
      post({ type: 'done', job: job.job });
      job = null;
    }
  }

  return (m) => {
    if (m.type === 'frame') {
      pending = m;
      kick();
    } else if (m.type === 'cancel') {
      pending = null;
      job = null;
      tiles = [];
    }
  };
}
