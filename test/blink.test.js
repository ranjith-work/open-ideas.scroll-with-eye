import assert from 'node:assert/strict';
import test from 'node:test';

import { createBlinkDetector } from '../plugin/blink.js';

function blink(detector, start, duration = 120) {
  detector.update(0.9, 0.9, start);
  return detector.update(0.05, 0.05, start + duration);
}

test('a single blink is reported and does not select', () => {
  const detector = createBlinkDetector();
  assert.equal(blink(detector, 1000), 'blink');
  assert.equal(detector.update(0.05, 0.05, 1600), null);
});

test('two blinks inside the window select', () => {
  const detector = createBlinkDetector();
  assert.equal(blink(detector, 1000), 'blink');
  assert.equal(blink(detector, 1300), 'double');
});

test('two blinks far apart stay single', () => {
  const detector = createBlinkDetector();
  assert.equal(blink(detector, 1000), 'blink');
  assert.equal(blink(detector, 2000), 'blink');
});

test('a wink does not count', () => {
  const detector = createBlinkDetector();
  detector.update(0.9, 0.1, 1000);
  assert.equal(detector.update(0.05, 0.05, 1120), null);
});

test('holding the eyes shut is not a blink', () => {
  const detector = createBlinkDetector();
  detector.update(0.9, 0.9, 1000);
  assert.equal(detector.update(0.05, 0.05, 1600), null);
});

test('a flicker shorter than a blink is ignored', () => {
  const detector = createBlinkDetector();
  detector.update(0.9, 0.9, 1000);
  assert.equal(detector.update(0.05, 0.05, 1020), null);
});

test('reset drops a half-finished double blink', () => {
  const detector = createBlinkDetector();
  assert.equal(blink(detector, 1000), 'blink');
  detector.reset();
  assert.equal(blink(detector, 1200), 'blink');
});
