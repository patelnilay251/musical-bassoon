// Motion for films: things that travel along paths under speed profiles.

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, u) => a + (b - a) * u;
export function smooth(a, b, x) {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

// Distance covered under a piecewise-linear speed profile [[t, v], ...].
export function travel(profile) {
  return (t) => {
    let d = 0;
    for (let i = 0; i + 1 < profile.length; i++) {
      const [t0, v0] = profile[i];
      const [t1, v1] = profile[i + 1];
      if (t <= t0) break;
      const te = Math.min(t, t1);
      const vt = v0 + ((v1 - v0) * (te - t0)) / (t1 - t0);
      d += ((v0 + vt) / 2) * (te - t0);
    }
    return d;
  };
}

export function speedAt(profile, t) {
  if (t <= profile[0][0]) return profile[0][1];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [t0, v0] = profile[i];
    const [t1, v1] = profile[i + 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return profile[profile.length - 1][1];
}

// A path through [x, z] points: position and heading at a distance along it.
export function path(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = cum[cum.length - 1];
  const at = (d) => {
    d = Math.max(0, Math.min(length, d));
    let lo = 1;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    const i = lo;
    const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const a = points[i - 1];
    const b = points[i];
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k };
  };
  const pose = (d) => {
    const p = at(d);
    const q0 = at(d - 0.6);
    const q1 = at(d + 0.6);
    return { ...p, dx: q1.x - q0.x, dz: q1.z - q0.z };
  };
  return { length, at, pose };
}
