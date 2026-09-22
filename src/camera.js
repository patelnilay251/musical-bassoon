// Compositions. A painter's perspective keeps verticals vertical, so views
// are mostly built level: an eye, a compass heading, a lens, and where the
// horizon should sit in the frame. The renderer's lens shift does the rest.

import { DEG } from './math.js';

/**
 * A level view. heading: degrees clockwise from north (0 = -z, 90 = +x).
 * horizon: height of the horizon line as a fraction of the frame, from the
 * bottom. fovY is the vertical field of view at the reference 3:2 frame.
 */
export function level(eye, heading, fovY, horizon = 0.33) {
  const a = heading * DEG;
  return {
    eye,
    target: [eye[0] + Math.sin(a) * 10, eye[1], eye[2] - Math.cos(a) * 10],
    fovY,
    shift: 1 - 2 * horizon,
  };
}

// A level view whose heading points at `target` (its height is ignored).
export function levelAt(eye, target, fovY, horizon = 0.33) {
  const heading = Math.atan2(target[0] - eye[0], -(target[2] - eye[2])) / DEG;
  return level(eye, heading, fovY, horizon);
}

/**
 * Fit a view composed for a `ref` aspect to another frame. Wider frames
 * keep the vertical field and see more at the sides; taller frames keep the
 * horizontal field, so the subject still fits, and gain sky and ground.
 */
export function fit(view, aspect, ref = 1.5) {
  if (aspect >= ref) return view;
  const tx = Math.tan(((view.fovY ?? 45) * DEG) / 2) * ref;
  return { ...view, fovY: (2 * Math.atan(tx / aspect)) / DEG };
}
