// Close-up structure for the live town: the hardware and framing a walker
// passes at arm's length and no painted view has ever needed. Knobs, kick
// plates and number plates on the doors; mullions and transoms across the
// big panes of shops and lounges. It is added to a finished world, never
// built into it, so the painted town and its films stay exactly as they
// are.

import { MeshBuilder, finalizeMesh, CAST, SMOOTH } from '../mesh.js';
import { addText } from '../world/font.js';
import { packPanes, PANE_FLOATS } from './pack.js';

const DOORS = new Set(['door', 'doorRed', 'doorYellow', 'doorBlue', 'doorGreen', 'doorPink']);

/** The world with its close-up structure added (a new mesh; the rest shared). */
export function addDetail(world) {
  const mesh = world.mesh;
  // Door hardware in brass, a lacquer of its own the painted town never needed.
  const materials = [...world.materials, { name: 'brass', kind: 'paint', color: '#d9b25a' }];
  const mat = (name) => materials.findIndex((m) => m.name === name);
  const brass = mat('brass');
  const plate = mat('signCream');
  const ink = mat('signNavy');
  const frame = mat('frame');
  const b = new MeshBuilder();
  // New objects never share an id with the world's own.
  let top = 0;
  for (let t = 0; t < mesh.count; t++) top = Math.max(top, mesh.obj[t]);
  b.objCount = top + 1;

  const faces = doorFaces(world);
  const numbers = world.id === 'motel' ? roomNumbers(faces) : new Map();
  for (const f of faces) door(b, f, brass, plate, ink, numbers.get(f.obj));
  if (frame >= 0) mullions(b, world, frame);

  if (b.mat.length === 0) return world;
  return { ...world, materials, mesh: mergeMeshes(mesh, finalizeMesh(b)) };
}

// The big upright faces of every door: each with its plane (n, w), its
// extent along the face (a0..a1, t = (-nz, nx)) and up it (y0..y1).
function doorFaces(world) {
  const mesh = world.mesh;
  const groups = new Map();
  for (let t = 0; t < mesh.count; t++) {
    if (!DOORS.has(world.materials[mesh.mat[t]].name)) continue;
    const nx = mesh.fn[t * 3];
    const nz = mesh.fn[t * 3 + 2];
    if (Math.abs(mesh.fn[t * 3 + 1]) > 0.05) continue;
    const key = `${mesh.obj[t]} ${Math.round(nx * 20)} ${Math.round(nz * 20)} ${Math.round(mesh.fd[t] * 100)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { obj: mesh.obj[t], nx, nz, w: mesh.fd[t], tris: [] }));
    g.tris.push(t);
  }
  const faces = [];
  for (const g of groups.values()) {
    let a0 = Infinity;
    let a1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const t of g.tris) {
      for (let k = 0; k < 3; k++) {
        const x = mesh.pos[t * 9 + k * 3];
        const y = mesh.pos[t * 9 + k * 3 + 1];
        const z = mesh.pos[t * 9 + k * 3 + 2];
        const a = -g.nz * x + g.nx * z;
        a0 = Math.min(a0, a);
        a1 = Math.max(a1, a);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    // A door's face, not its edge.
    if (a1 - a0 > 0.6 && y1 - y0 > 1.6) faces.push({ ...g, a0, a1, y0, y1 });
  }
  return faces;
}

// A point on a face: `a` along it, `y` up, `out` meters in front of it.
function onFace(f, a, y, out) {
  return [-f.nz * a + f.nx * (f.w + out), y, f.nx * a + f.nz * (f.w + out)];
}

// A box on a face, from (a0, y0) to (a1, y1) along and up it, standing out
// from `o0` to `o1` meters in front.
function faceBox(b, f, a0, y0, a1, y1, o0, o1) {
  b.push();
  // Local x runs against the face's a, so the frame stays right-handed
  // (and the box's faces wound outward); y up, z out of the face.
  b.apply([f.nz, 0, -f.nx, 0, 0, 1, 0, 0, f.nx, 0, f.nz, 0, f.nx * f.w, 0, f.nz * f.w, 1]);
  b.box(-a1, y0, o0, -a0, y1, o1);
  b.pop();
}

// The motel's rooms numbered as a motel numbers them: 101 up along the
// ground floor, 201 up along the walkway, both faces of a door alike.
function roomNumbers(faces) {
  const doors = new Map();
  for (const f of faces) {
    const c = onFace(f, (f.a0 + f.a1) / 2, f.y0, 0);
    doors.set(f.obj, { floor: f.y0 < 1.5 ? 1 : 2, x: c[0], z: c[2] });
  }
  const numbers = new Map();
  for (const floor of [1, 2]) {
    const row = [...doors].filter(([, d]) => d.floor === floor).sort((p, q) => p[1].z - q[1].z || p[1].x - q[1].x);
    row.forEach(([obj], i) => numbers.set(obj, String(floor * 100 + i + 1)));
  }
  return numbers;
}

function door(b, f, brass, plate, ink, number) {
  b.object();
  // The latch on the same edge seen from either side: the one furthest
  // along +z (then +x) in the world.
  const e0 = onFace(f, f.a0, 0, 0);
  const e1 = onFace(f, f.a1, 0, 0);
  const far = e1[2] - e0[2] > 1e-6 || (Math.abs(e1[2] - e0[2]) <= 1e-6 && e1[0] > e0[0]);
  const latch = far ? f.a1 - 0.1 : f.a0 + 0.1;
  const mid = (f.a0 + f.a1) / 2;
  if (brass >= 0) {
    b.use(brass, CAST);
    // A kick plate along the foot.
    faceBox(b, f, f.a0 + 0.04, f.y0 + 0.02, f.a1 - 0.04, f.y0 + 0.24, 0, 0.004);
    // The knob: a rose, a neck, a ball.
    b.use(brass, CAST | SMOOTH);
    b.push();
    const p = onFace(f, latch, f.y0 + 0.96, 0);
    b.translate(p[0], p[1], p[2]);
    // Local +y out of the door (a right-handed frame: local z points down).
    b.apply([f.nz, 0, -f.nx, 0, f.nx, 0, f.nz, 0, 0, -1, 0, 0, 0, 0, 0, 1]);
    b.cylinder(0.03, 0.03, 0, 0.012, 10);
    b.cylinder(0.009, 0.009, 0.012, 0.045, 6, { caps: false });
    b.translate(0, 0.06, 0);
    b.sphere(0.028, 10, 6);
    b.pop();
  }
  if (plate >= 0 && number) {
    // The room number, on a small plate at eye height.
    b.use(plate, CAST);
    faceBox(b, f, mid - 0.075, f.y0 + 1.55, mid + 0.075, f.y0 + 1.645, 0, 0.006);
    if (ink >= 0) {
      b.use(ink, 0);
      b.push();
      // The face's frame as faceBox has it: x to the reader's right.
      b.apply([f.nz, 0, -f.nx, 0, 0, 1, 0, 0, f.nx, 0, f.nz, 0, f.nx * f.w, 0, f.nz * f.w, 1]);
      b.translate(-mid, f.y0 + 1.572, 0.006);
      addText(b, number, { size: 0.05, depth: 0.003, stroke: 0.008, align: 'center' });
      b.pop();
    }
  }
}

// Mullions across a shop's or a lounge's wide panes, and a transom where
// a pane stands taller than a door.
function mullions(b, world, frame) {
  const { data, count } = packPanes(world);
  b.use(frame, CAST);
  for (let i = 0; i < count; i++) {
    const [a0, a1, y0, y1, nx, nz, style, w] = data.subarray(i * PANE_FLOATS, (i + 1) * PANE_FLOATS);
    if (style === 0) continue; // motel rooms have their own
    const W = a1 - a0;
    const H = y1 - y0;
    const bay = style === 1 ? 1.8 : 2.4;
    if (W < bay * 1.2 || H < 1.5) continue;
    const f = { nx, nz, w };
    b.object();
    const n = Math.ceil(W / bay);
    for (let k = 1; k < n; k++) {
      const a = a0 + (k * W) / n;
      faceBox(b, f, a - 0.025, y0, a + 0.025, y1, -0.02, 0.02);
    }
    if (H > 2.9) faceBox(b, f, a0, y0 + 2.3, a1, y0 + 2.35, -0.02, 0.02);
  }
}

// Two finished meshes as one.
export function mergeMeshes(a, b) {
  const cat = (A, B) => {
    const out = new A.constructor(A.length + B.length);
    out.set(A);
    out.set(B, A.length);
    return out;
  };
  return {
    count: a.count + b.count,
    pos: cat(a.pos, b.pos),
    nrm: cat(a.nrm, b.nrm),
    uv: cat(a.uv, b.uv),
    mat: cat(a.mat, b.mat),
    flags: cat(a.flags, b.flags),
    obj: cat(a.obj, b.obj),
    fn: cat(a.fn, b.fn),
    fd: cat(a.fd, b.fd),
    bary: cat(a.bary, b.bary),
    bounds: {
      min: a.bounds.min.map((v, i) => Math.min(v, b.bounds.min[i])),
      max: a.bounds.max.map((v, i) => Math.max(v, b.bounds.max[i])),
    },
  };
}
