// Calibration turns raw iris travel into viewport fractions.
// The center look becomes 0. A look at an edge becomes 1 on that axis. With
// only the center captured, the edges are guessed with DEFAULT_SCALE.

import { averageGaze } from './gaze.js';

export const DEFAULT_SCALE = 2.4;
const MIN_SPAN = 0.05;
const MIN_SCALE = 0.5;
const MAX_SCALE = 20;

const MODES = {
  quick: ['center'],
  full: ['center', 'top', 'bottom'],
  wide: ['center', 'top', 'bottom', 'left', 'right'],
};

export const STEP_PROMPTS = {
  center: 'Look at the center of the screen',
  top: 'Look at the top edge of the screen',
  bottom: 'Look at the bottom edge of the screen',
  left: 'Look at the left edge of the screen',
  right: 'Look at the right edge of the screen',
};

export function stepsFor(mode) {
  if (Array.isArray(mode)) return mode.filter((step) => step in STEP_PROMPTS);
  return MODES[mode] || MODES.full;
}

function axisScale(before, after, center, fallback) {
  const spans = [];
  if (Number.isFinite(before)) spans.push(center - before);
  if (Number.isFinite(after)) spans.push(after - center);
  const usable = spans.filter((span) => span >= MIN_SPAN);
  if (!usable.length) return fallback;
  const span = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, 1 / span));
}

// points: { center, top?, bottom?, left?, right? } as raw gaze samples.
// A missing edge, or one the user looked the wrong way for, falls back.
export function calibrationFromPoints(points, { defaultScale = DEFAULT_SCALE } = {}) {
  const center = { x: points?.center?.x || 0, y: points?.center?.y || 0 };
  return {
    center,
    scale: {
      x: axisScale(points?.left?.x, points?.right?.x, center.x, defaultScale),
      y: axisScale(points?.top?.y, points?.bottom?.y, center.y, defaultScale),
    },
    steps: Object.keys(points || {}),
  };
}

export function applyCalibration(gaze, calibration) {
  const x = gaze?.x || 0;
  const y = gaze?.y || 0;
  if (!calibration) return { x: x * DEFAULT_SCALE, y: y * DEFAULT_SCALE };
  return {
    x: (x - calibration.center.x) * calibration.scale.x,
    y: (y - calibration.center.y) * calibration.scale.y,
  };
}

// Collects one look per step. Each step waits warmupMs for the eyes to
// arrive, then needs stepMs and at least minSamples clean frames.
export function createCalibrator({
  steps = MODES.full,
  stepMs = 1000,
  warmupMs = 300,
  minSamples = 8,
} = {}) {
  const order = stepsFor(steps);
  const points = {};
  let index = 0;
  let started = 0;
  let samples = [];
  let result = null;

  return {
    get step() {
      return result ? null : order[index];
    },
    get index() {
      return index;
    },
    get total() {
      return order.length;
    },
    get result() {
      return result;
    },

    // Returns the result once the last step completes, otherwise null.
    push(gaze, now, { skip = false } = {}) {
      if (result) return result;
      if (!started) started = now;
      const elapsed = now - started;
      if (!skip && gaze && elapsed >= warmupMs) samples.push(gaze);
      if (elapsed >= stepMs && samples.length >= minSamples) {
        points[order[index]] = averageGaze(samples);
        samples = [];
        started = 0;
        index += 1;
        if (index >= order.length) result = calibrationFromPoints(points);
      }
      return result;
    },

    reset() {
      for (const key of Object.keys(points)) delete points[key];
      index = 0;
      started = 0;
      samples = [];
      result = null;
    },
  };
}
