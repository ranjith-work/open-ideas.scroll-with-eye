// Pure gaze math.
// Scroll uses the iris position inside each eye, so moving the head while the
// eyes stay centered in their sockets does not scroll. x > 0 looks to the
// user's right. y > 0 looks down.
// The numbers here are raw iris travel. calibration.js turns them into
// viewport fractions, where 1 is the edge of the screen.
// Blendshapes are only used for blinks.

const IRIS_GAIN = 3.2;
const LEFT_EYE = { outer: 33, inner: 133, iris: 468 };
const RIGHT_EYE = { outer: 263, inner: 362, iris: 473 };

export function asScoreMap(blendshapes) {
  if (!blendshapes) return {};
  if (Array.isArray(blendshapes)) {
    const map = {};
    for (const item of blendshapes) {
      const name = item?.categoryName || item?.name;
      if (name) map[name] = Number(item.score) || 0;
    }
    return map;
  }
  if (Array.isArray(blendshapes.categories)) return asScoreMap(blendshapes.categories);
  return blendshapes;
}

function landmark(landmarks, index) {
  const point = landmarks?.[index];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

function along(origin, across, target) {
  const vx = across.x - origin.x;
  const vy = across.y - origin.y;
  const length = vx * vx + vy * vy;
  if (length < 1e-8) return null;
  return ((target.x - origin.x) * vx + (target.y - origin.y) * vy) / length;
}

// Both axes are measured against the line between the eye corners. The lids
// are never used: a squint moves the lids over a still iris, and that must
// not read as a look.
function irisInEye(landmarks, eye) {
  const outer = landmark(landmarks, eye.outer);
  const inner = landmark(landmarks, eye.inner);
  const iris = landmark(landmarks, eye.iris);
  if (!outer || !inner || !iris) return null;
  const ux = inner.x - outer.x;
  const uy = inner.y - outer.y;
  const width = Math.hypot(ux, uy);
  if (width < 1e-4) return null;
  const horizontal = along(outer, inner, iris);
  if (horizontal == null) return null;
  const dx = iris.x - (outer.x + inner.x) / 2;
  const dy = iris.y - (outer.y + inner.y) / 2;
  // Signed distance of the iris from the corner line, in eye widths. The
  // corner line runs the other way on the second eye, so the sign of ux keeps
  // "down" pointing down for both.
  const vertical = ((Math.sign(ux) || 1) * (ux * dy - uy * dx)) / (width * width);
  return { h: horizontal, v: vertical };
}

export function gazeFromLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 478) return null;
  const left = irisInEye(landmarks, LEFT_EYE);
  const right = irisInEye(landmarks, RIGHT_EYE);
  if (!left || !right) return null;
  const x = ((left.h - 0.5) + (0.5 - right.h)) / 2;
  const y = (left.v + right.v) / 2;
  // The landmarks come from the unmirrored frame, where the user's left is on
  // the image's right. Negate x so a look left moves the screen left.
  return { x: -x * IRIS_GAIN, y: y * IRIS_GAIN };
}

export function averageGaze(samples) {
  if (!samples?.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const sample of samples) {
    x += sample.x;
    y += sample.y;
  }
  return { x: x / samples.length, y: y / samples.length };
}

/** Gaze relative to a calibrated center look. */
export function offsetGaze(gaze, baseline) {
  return {
    x: (gaze?.x || 0) - (baseline?.x || 0),
    y: (gaze?.y || 0) - (baseline?.y || 0),
  };
}

export function smoothGaze(previous, next, dtMs, halfLifeMs = 90) {
  if (!previous || !(dtMs > 0)) return { x: next.x, y: next.y };
  const alpha = 1 - Math.exp(-dtMs / halfLifeMs);
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
  };
}

// value is a calibrated gaze: 0 is the center, 1 is the edge of the viewport.
export function axisVelocity(value, dtMs, {
  deadZone = 0.35,
  maxSpeed = 1200,
  fullScale = 0.6,
} = {}) {
  const mag = Math.abs(value);
  if (!(dtMs > 0) || mag <= deadZone) return 0;
  const span = fullScale > 0 ? fullScale : 0.6;
  const t = Math.min(1, (mag - deadZone) / span);
  return Math.sign(value) * t * t * maxSpeed * (dtMs / 1000);
}

export function velocityFromGaze(gaze, dtMs, options) {
  return {
    x: axisVelocity(gaze?.x || 0, dtMs, options),
    y: axisVelocity(gaze?.y || 0, dtMs, options),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function reticleFromGaze(gaze, viewport, { gain = 1 } = {}) {
  const width = viewport?.width || 0;
  const height = viewport?.height || 0;
  const x = width / 2 + (gaze?.x || 0) * gain * (width / 2);
  const y = height / 2 + (gaze?.y || 0) * gain * (height / 2);
  return {
    x: clamp(x, 0, width),
    y: clamp(y, 0, height),
  };
}
