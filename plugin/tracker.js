// The per-frame decision, kept away from the DOM so it can run on synthetic
// faces in tests. eye-scroll.js feeds it landmarks and paints what comes back.
//
// update() returns:
//   state    'lost' | 'calibrating' | 'tracking'
//   step     the calibration step to prompt for, or null
//   reticle  { x, y } in viewport pixels, or null when there is no face
//   hit      the section rect under the reticle, or null
//   scroll   { x, y } pixels to scroll this frame
//   frozen   true while a blink hides the iris
//   select   { section } when a double blink lands, else undefined

import { createBlinkDetector, createBlinkGate } from './blink.js';
import { applyCalibration, createCalibrator } from './calibration.js';
import {
  asScoreMap,
  gazeFromLandmarks,
  reticleFromGaze,
  smoothGaze,
  velocityFromGaze,
} from './gaze.js';
import { sectionAtPoint } from './sections.js';

const IDLE = Object.freeze({ x: 0, y: 0 });

export function createTracker({
  deadZone = 0.35,
  maxSpeed = 1200,
  fullScale = 0.6,
  calibration = 'full',
  lostResetMs = 2000,
  blinkHoldMs = 150,
  smoothingMs = 90,
} = {}) {
  const blinks = createBlinkDetector();
  const gate = createBlinkGate({ holdMs: blinkHoldMs });
  let calibrator = createCalibrator({ steps: calibration });
  let fit = null;
  let smoothed = null;
  let reticle = null;
  let lostAt = 0;
  let lastNow = 0;

  function recalibrate(mode = calibration) {
    calibrator = createCalibrator({ steps: mode });
    fit = null;
    smoothed = null;
    reticle = null;
    blinks.reset();
    gate.reset();
  }

  function reset() {
    recalibrate();
    lostAt = 0;
    lastNow = 0;
  }

  function update({ landmarks, blendshapes, now, viewport, sections = [], speed = 1 }) {
    const dt = lastNow ? Math.min(50, now - lastNow) : 16;
    lastNow = now;
    const gaze = gazeFromLandmarks(landmarks);

    if (!gaze) {
      if (!lostAt) lostAt = now;
      blinks.reset();
      gate.reset();
      smoothed = null;
      return { state: 'lost', step: fit ? null : calibrator.step, reticle: null, hit: null, scroll: IDLE, frozen: false };
    }

    if (lostAt) {
      // A short dropout keeps the calibration. A long one usually means the
      // person moved, so the center is measured again.
      if (fit && now - lostAt >= lostResetMs) recalibrate();
      lostAt = 0;
    }

    const scores = asScoreMap(blendshapes);
    const left = scores.eyeBlinkLeft || 0;
    const right = scores.eyeBlinkRight || 0;
    const frozen = gate.update(left, right, now);

    if (!fit) {
      fit = calibrator.push(gaze, now, { skip: frozen });
      if (!fit) {
        reticle = reticleFromGaze(IDLE, viewport);
        return {
          state: 'calibrating',
          step: calibrator.step,
          index: calibrator.index,
          total: calibrator.total,
          reticle,
          hit: null,
          scroll: IDLE,
          frozen,
        };
      }
    }

    if (!frozen) {
      smoothed = smoothGaze(smoothed, applyCalibration(gaze, fit), dt, smoothingMs);
      reticle = reticleFromGaze(smoothed, viewport);
    } else if (!reticle) {
      reticle = reticleFromGaze(IDLE, viewport);
    }

    const hit = sectionAtPoint(reticle.x, reticle.y, sections);
    const gesture = blinks.update(left, right, now);
    const scroll = frozen || !smoothed
      ? IDLE
      : velocityFromGaze(smoothed, dt, { deadZone, maxSpeed: maxSpeed * speed, fullScale });

    return {
      state: 'tracking',
      step: null,
      reticle,
      hit,
      scroll,
      frozen,
      gesture,
      select: gesture === 'double' ? { section: hit } : undefined,
    };
  }

  return {
    update,
    recalibrate,
    reset,
    get calibration() {
      return fit;
    },
    get step() {
      return fit ? null : calibrator.step;
    },
  };
}
