import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asScoreMap,
  axisVelocity,
  gazeFromBlendshapes,
  averageGaze,
  offsetGaze,
  reticleFromGaze,
  smoothGaze,
  velocityFromGaze,
  gazeFromLandmarks,
} from '../plugin/gaze.js';

const LEFT = { outer: 33, inner: 133, upper: 159, lower: 145, iris: 468 };
const RIGHT = { outer: 263, inner: 362, upper: 386, lower: 374, iris: 473 };

function blankFace() {
  return Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
}

function placeEye(face, eye, box, irisH, irisV) {
  const { x, y, w, h, innerOnRight } = box;
  const outer = { x: innerOnRight ? x : x + w, y: y + h / 2 };
  const inner = { x: innerOnRight ? x + w : x, y: y + h / 2 };
  const upper = { x: x + w / 2, y };
  const lower = { x: x + w / 2, y: y + h };
  face[eye.outer] = { ...outer, z: 0 };
  face[eye.inner] = { ...inner, z: 0 };
  face[eye.upper] = { ...upper, z: 0 };
  face[eye.lower] = { ...lower, z: 0 };
  face[eye.iris] = {
    x: outer.x + (inner.x - outer.x) * irisH,
    y: upper.y + (lower.y - upper.y) * irisV,
    z: 0,
  };
}

function faceWithEyes({ leftH = 0.5, leftV = 0.5, rightH = 0.5, rightV = 0.5, shiftX = 0, shiftY = 0 } = {}) {
  const face = blankFace();
  placeEye(face, LEFT, { x: 0.3 + shiftX, y: 0.36 + shiftY, w: 0.12, h: 0.08, innerOnRight: true }, leftH, leftV);
  placeEye(face, RIGHT, { x: 0.58 + shiftX, y: 0.36 + shiftY, w: 0.12, h: 0.08, innerOnRight: false }, rightH, rightV);
  return face;
}

test('asScoreMap reads MediaPipe categories', () => {
  const map = asScoreMap([
    { categoryName: 'eyeLookUpLeft', score: 0.4 },
    { categoryName: 'eyeBlinkLeft', score: 0.1 },
  ]);
  assert.equal(map.eyeLookUpLeft, 0.4);
  assert.equal(map.eyeBlinkLeft, 0.1);
});

test('a resting face sits at the origin', () => {
  const gaze = gazeFromBlendshapes({});
  assert.deepEqual(gaze, { x: 0, y: 0 });
});

test('looking right and down produces a positive gaze', () => {
  const gaze = gazeFromBlendshapes({
    eyeLookOutRight: 0.6,
    eyeLookInLeft: 0.4,
    eyeLookDownLeft: 0.5,
    eyeLookDownRight: 0.5,
  });
  assert.ok(gaze.x > 0);
  assert.ok(gaze.y > 0);
  assert.equal(gaze.x, 0.5);
  assert.equal(gaze.y, 0.5);
});

test('looking left and up produces a negative gaze', () => {
  const gaze = gazeFromBlendshapes({
    eyeLookOutLeft: 0.8,
    eyeLookInRight: 0.2,
    eyeLookUpLeft: 0.3,
    eyeLookUpRight: 0.3,
  });
  assert.equal(gaze.x, -0.5);
  assert.equal(gaze.y, -0.3);
});

test('the dead zone produces no scroll', () => {
  assert.equal(axisVelocity(0.1, 16), 0);
  assert.equal(axisVelocity(-0.05, 16), 0);
  const still = velocityFromGaze({ x: 0.08, y: -0.1 }, 16);
  assert.deepEqual(still, { x: 0, y: 0 });
});

test('past the dead zone, direction matches the look and speed grows with time', () => {
  const right = axisVelocity(0.5, 1000);
  const left = axisVelocity(-0.5, 1000);
  assert.ok(right > 0);
  assert.equal(left, -right);

  const slow = axisVelocity(0.2, 500);
  const fast = axisVelocity(0.5, 500);
  assert.ok(fast > slow);
  assert.ok(slow > 0);

  const frame = velocityFromGaze({ x: 0.5, y: -0.5 }, 100);
  assert.ok(frame.x > 0);
  assert.ok(frame.y < 0);
});

test('smoothing moves partway toward the next sample', () => {
  assert.deepEqual(smoothGaze(null, { x: 1, y: -1 }, 16), { x: 1, y: -1 });
  const next = smoothGaze({ x: 0, y: 0 }, { x: 1, y: 1 }, 90);
  assert.ok(next.x > 0.5 && next.x < 1);
  assert.ok(next.y > 0.5 && next.y < 1);
});

test('a resting downward look becomes the center and does not scroll', () => {
  const rest = { x: 0.02, y: 0.55 };
  const baseline = averageGaze([rest, { x: 0.04, y: 0.45 }]);
  const relative = offsetGaze(rest, baseline);
  assert.ok(Math.abs(relative.y) < 0.1);
  assert.deepEqual(velocityFromGaze(offsetGaze(baseline, baseline), 32), { x: 0, y: 0 });
});

test('the iris, not the head, sets the gaze', () => {
  assert.equal(gazeFromLandmarks(null), null);
  assert.equal(gazeFromLandmarks(Array.from({ length: 10 }, () => ({ x: 0, y: 0 }))), null);

  const still = gazeFromLandmarks(faceWithEyes());
  assert.ok(Math.abs(still.x) < 1e-9);
  assert.ok(Math.abs(still.y) < 1e-9);

  const shifted = gazeFromLandmarks(faceWithEyes({ shiftX: 0.2, shiftY: -0.15 }));
  assert.ok(Math.abs(shifted.x - still.x) < 1e-9);
  assert.ok(Math.abs(shifted.y - still.y) < 1e-9);

  const toTheLeft = gazeFromLandmarks(faceWithEyes({ leftH: 0.8, rightH: 0.2 }));
  const down = gazeFromLandmarks(faceWithEyes({ leftV: 0.8, rightV: 0.8 }));
  assert.ok(toTheLeft.x < -0.5);
  assert.ok(Math.abs(toTheLeft.y) < 1e-9);
  assert.ok(down.y > 0.5);
  assert.ok(Math.abs(down.x) < 1e-9);
});

test('the reticle starts at center and clamps at the viewport edge', () => {
  const center = reticleFromGaze({ x: 0, y: 0 }, { width: 800, height: 600 });
  assert.deepEqual(center, { x: 400, y: 300 });

  const edge = reticleFromGaze({ x: 1, y: -1 }, { width: 800, height: 600 });
  assert.equal(edge.x, 800);
  assert.equal(edge.y, 0);
});
