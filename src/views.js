// Named cameras, derived from the world's layout so they fit any seed.

export function views(L) {
  const p = L.pool;
  const V = L.villa;
  const d = L.deck;
  const pcz = (p.z0 + p.z1) / 2;
  return {
    hero: { eye: [p.x0 - 3.5, 1.55, p.z1 + 4.5], target: [2, 3.4, p.z0 + 1], fovY: 52 },
    sea: { eye: [p.x1 + 1.3, 1.65, pcz + 3], target: [L.bounds.x0 - 30, 1.4, pcz - 3], fovY: 54 },
    terrace: {
      eye: [-V.eaveF + 0.5, V.U0 + 1.6, V.terrace.z],
      target: [p.x0 - 18, -2, V.terrace.z + (V.terrace.z < (V.uz0 + V.uz1) / 2 ? -9 : 9)],
      fovY: 54,
    },
    aerial: { eye: [p.x0 - 34, 17, p.z1 + 30], target: [V.D * 0.3, 1.5, -2], fovY: 40 },
    drive: { eye: [L.car.x + 9, 1.5, L.car.z + 6.5], target: [L.car.x - 2, 1.6, L.car.z - 1], fovY: 42 },
    low: { eye: [p.x0 - 0.7, d.y + 0.45, p.z0 - 0.9], target: [p.x1, 5.5, p.z1], fovY: 62 },
  };
}
