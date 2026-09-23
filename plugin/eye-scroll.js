// Drop-in eye scroll. The host page calls EyeScroll.start(). The camera
// opens only after the Start button, which is the gesture browsers require.

import { createBlinkDetector } from './blink.js';
import {
  asScoreMap,
  averageGaze,
  gazeFromLandmarks,
  offsetGaze,
  reticleFromGaze,
  smoothGaze,
  velocityFromGaze,
} from './gaze.js';
import { measureSections, sectionAtPoint, sectionLabel } from './sections.js';

const CALIBRATION_MS = 1000;
const CALIBRATION_WARMUP_MS = 300;
const CALIBRATION_MIN = 8;

const VISION_VERSION = '0.10.17';
const VISION_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`;
const VISION_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const STYLE = `
.eye-scroll-panel {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2147483000;
  width: min(280px, calc(100vw - 32px));
  padding: 10px 12px;
  border-radius: 16px;
  background: #1c1f18;
  color: #f4f1e8;
  font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}
.eye-scroll-panel * { box-sizing: border-box; }
.eye-scroll-panel.live {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  align-items: center;
  width: min(360px, calc(100vw - 32px));
}
.eye-scroll-video {
  display: none;
  width: 96px;
  height: 72px;
  object-fit: cover;
  border-radius: 10px;
  background: #2a2d26;
  transform: scaleX(-1);
}
.eye-scroll-panel.live .eye-scroll-video { display: block; }
@media (max-width: 960px) {
  .eye-scroll-panel,
  .eye-scroll-panel.live {
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    border-radius: 18px 18px 0 0;
  }
}
.eye-scroll-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.eye-scroll-target {
  font-weight: 650;
  letter-spacing: 0.01em;
}
.eye-scroll-status {
  margin: 6px 0 0;
  color: #c9c4b4;
  min-height: 1.4em;
}
.eye-scroll-button {
  border: 0;
  border-radius: 999px;
  padding: 6px 12px;
  background: #e2f08a;
  color: #1a1d14;
  font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
}
.eye-scroll-button:disabled { opacity: 0.6; cursor: default; }
.eye-scroll-center {
  background: transparent;
  color: #f4f1e8;
  border: 1px solid rgba(244, 241, 232, 0.4);
}
.eye-scroll-sensitivity {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #c9c4b4;
}
.eye-scroll-sensitivity input { width: 100%; accent-color: #e2f08a; }
.eye-scroll-reticle {
  position: fixed;
  z-index: 2147482990;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 2px solid #e2f08a;
  border-radius: 50%;
  pointer-events: none;
  box-shadow: 0 0 0 4px rgba(226, 240, 138, 0.2);
  display: none;
}
.eye-scroll-reticle.visible { display: block; }
.eye-scroll-reticle.pulse { animation: eye-scroll-pulse 0.35s ease-out; }
@keyframes eye-scroll-pulse {
  from { transform: scale(0.7); }
  to { transform: scale(1); }
}
.eye-scroll-hot { outline: 2px solid #e2f08a !important; outline-offset: 4px; }
.eye-scroll-chosen { outline: 3px solid #ffb087 !important; outline-offset: 4px; }
`;

let current = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function createLandmarker() {
  const vision = await import(VISION_MODULE);
  const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL },
    outputFaceBlendshapes: true,
    runningMode: 'VIDEO',
    numFaces: 1,
  };
  try {
    return await vision.FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'GPU' },
    });
  } catch {
    return vision.FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
}

function createSession(options) {
  const sectionSelector = options.sectionSelector || '[data-eye-section]';
  const deadZone = options.deadZone ?? 0.16;
  const maxSpeed = options.maxSpeed ?? 1200;

  const style = el('style');
  style.id = 'eye-scroll-style';
  style.textContent = STYLE;

  const panel = el('aside', 'eye-scroll-panel');
  panel.setAttribute('aria-label', 'Eye scroll');
  const video = el('video', 'eye-scroll-video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.autoplay = true;

  const row = el('div', 'eye-scroll-row');
  const targetLabel = el('div', 'eye-scroll-target', 'Scrolling Page');
  const centerButton = el('button', 'eye-scroll-button eye-scroll-center', 'Center');
  centerButton.type = 'button';
  const button = el('button', 'eye-scroll-button', 'Start');
  button.type = 'button';
  row.append(targetLabel, centerButton, button);

  const status = el('p', 'eye-scroll-status', 'Camera off');
  status.setAttribute('aria-live', 'polite');

  const sensitivity = el('label', 'eye-scroll-sensitivity');
  sensitivity.append(document.createTextNode('Sensitivity'));
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.4';
  slider.max = '2.2';
  slider.step = '0.1';
  slider.value = '1';
  slider.setAttribute('aria-label', 'Scroll sensitivity');
  sensitivity.append(slider);

  const main = el('div', 'eye-scroll-main');
  main.append(row, status, sensitivity);
  panel.append(video, main);

  const reticle = el('div', 'eye-scroll-reticle');
  reticle.setAttribute('aria-hidden', 'true');

  document.head.append(style);
  document.body.append(panel, reticle);

  const blinks = createBlinkDetector();
  let stream = null;
  let landmarker = null;
  let raf = 0;
  let running = false;
  let closed = false;
  let smoothed = null;
  let baseline = null;
  let calibration = [];
  let calibrationStarted = 0;
  let lastFrame = 0;
  let lastVideoTs = 0;
  let hot = null;
  let chosen = null;
  let gain = 1;
  let statusNote = '';
  let noteUntil = 0;

  slider.addEventListener('input', () => {
    gain = Number(slider.value) || 1;
  });

  function beginCalibration() {
    baseline = null;
    calibration = [];
    calibrationStarted = 0;
    smoothed = null;
  }

  function placeReticle(x, y) {
    reticle.style.left = `${x}px`;
    reticle.style.top = `${y}px`;
    reticle.classList.add('visible');
  }

  centerButton.addEventListener('click', () => {
    if (!running) return;
    beginCalibration();
    setStatus('Look at the center of the screen');
  });

  function setStatus(text) {
    if (status.textContent !== text) status.textContent = text;
  }

  function setTarget(section) {
    const label = `Scrolling ${sectionLabel(section)}`;
    if (targetLabel.textContent !== label) targetLabel.textContent = label;
  }

  function paint(nextHot) {
    if (hot && hot !== nextHot && hot !== chosen) hot.classList.remove('eye-scroll-hot');
    if (nextHot && nextHot !== chosen) nextHot.classList.add('eye-scroll-hot');
    hot = nextHot;
  }

  function choose(section) {
    if (chosen && chosen !== section?.element) {
      chosen.classList.remove('eye-scroll-chosen', 'eye-scroll-hot');
    }
    chosen = section?.element || null;
    if (chosen) {
      chosen.classList.remove('eye-scroll-hot');
      chosen.classList.add('eye-scroll-chosen');
    }
    setTarget(section && chosen ? section : null);
    statusNote = chosen ? `Selected ${sectionLabel(section)}` : 'Back to the page';
    noteUntil = performance.now() + 1200;
    reticle.classList.remove('pulse');
    void reticle.offsetWidth;
    reticle.classList.add('pulse');
  }

  function clearMarks() {
    hot?.classList.remove('eye-scroll-hot');
    chosen?.classList.remove('eye-scroll-chosen', 'eye-scroll-hot');
    hot = null;
    chosen = null;
    setTarget(null);
  }

  function scroller() {
    if (chosen && !chosen.isConnected) {
      chosen.classList.remove('eye-scroll-chosen');
      chosen = null;
      setTarget(null);
    }
    return chosen || document.scrollingElement || document.documentElement;
  }

  function stopTracks() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    landmarker?.close?.();
    landmarker = null;
    smoothed = null;
    beginCalibration();
    lastFrame = 0;
    lastVideoTs = 0;
    blinks.reset();
    panel.classList.remove('live');
    reticle.classList.remove('visible', 'pulse');
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = lastFrame ? Math.min(50, now - lastFrame) : 16;
    lastFrame = now;

    let scores = null;
    let gaze = null;
    if (video.readyState >= 2) {
      let ts = Math.round(now);
      if (ts <= lastVideoTs) ts = lastVideoTs + 1;
      lastVideoTs = ts;
      try {
        const result = landmarker.detectForVideo(video, ts);
        const blend = result?.faceBlendshapes?.[0];
        if (blend) scores = asScoreMap(blend);
        gaze = gazeFromLandmarks(result?.faceLandmarks?.[0]);
      } catch {
        scores = null;
        gaze = null;
      }
    }

    if (!gaze) {
      blinks.reset();
      smoothed = { x: 0, y: 0 };
      if (!baseline) beginCalibration();
      paint(null);
      reticle.classList.remove('visible');
      setStatus(now < noteUntil ? statusNote : 'No face in frame');
    } else if (!baseline) {
      const blinking = (scores?.eyeBlinkLeft || 0) >= 0.45 && (scores?.eyeBlinkRight || 0) >= 0.45;
      if (!calibrationStarted) calibrationStarted = now;
      const elapsed = now - calibrationStarted;
      if (!blinking && elapsed >= CALIBRATION_WARMUP_MS) calibration.push(gaze);
      smoothed = { x: 0, y: 0 };
      placeReticle(window.innerWidth / 2, window.innerHeight / 2);
      paint(null);
      if (elapsed >= CALIBRATION_MS && calibration.length >= CALIBRATION_MIN) {
        baseline = averageGaze(calibration);
        smoothed = null;
      }
      setStatus('Look at the center of the screen');
    } else {
      const raw = offsetGaze(gaze, baseline);
      smoothed = smoothGaze(smoothed, raw, dt);
      const point = reticleFromGaze(smoothed, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      placeReticle(point.x, point.y);

      const hit = sectionAtPoint(point.x, point.y, measureSections(document.querySelectorAll(sectionSelector)));
      paint(hit?.element || null);

      const gesture = scores
        ? blinks.update(scores.eyeBlinkLeft || 0, scores.eyeBlinkRight || 0, now)
        : null;
      if (gesture === 'double') choose(hit);

      if (now < noteUntil) setStatus(statusNote);
      else setStatus(hit ? `On ${sectionLabel(hit)}` : 'Look to an edge to scroll');

      const velocity = velocityFromGaze(smoothed, dt, {
        deadZone,
        maxSpeed: maxSpeed * gain,
      });
      if (velocity.x || velocity.y) {
        const node = scroller();
        node.style.scrollBehavior = 'auto';
        node.scrollBy({ left: velocity.x, top: velocity.y, behavior: 'auto' });
      }
    }
  }

  async function enable() {
    if (running || closed) return;
    button.disabled = true;
    setStatus('Opening camera…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (closed) {
        stopTracks();
        return;
      }
      video.srcObject = stream;
      video.playsInline = true;
      await video.play();
      setStatus('Loading eye tracker…');
      landmarker = await createLandmarker();
      if (closed) {
        stopTracks();
        return;
      }
      running = true;
      panel.classList.add('live');
      button.disabled = false;
      button.textContent = 'Stop';
      beginCalibration();
      setStatus('Look at the center of the screen');
      lastFrame = 0;
      raf = requestAnimationFrame(frame);
    } catch (err) {
      stopTracks();
      button.disabled = false;
      button.textContent = 'Start';
      const name = err?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('Camera permission was blocked');
      else if (name === 'NotFoundError' || name === 'NotReadableError') setStatus('No camera was found');
      else setStatus('Could not start the eye tracker');
    }
  }

  function stop() {
    closed = true;
    stopTracks();
    clearMarks();
    panel.remove();
    reticle.remove();
    style.remove();
    if (current === session) current = null;
  }

  button.addEventListener('click', () => {
    if (running) {
      stopTracks();
      button.textContent = 'Start';
      setStatus('Camera off');
      paint(null);
      return;
    }
    enable();
  });

  const session = {
    api: { stop },
    get closed() { return closed; },
  };

  return session;
}

export const EyeScroll = {
  start(options = {}) {
    if (current && !current.closed) return current.api;
    current = createSession(options);
    return current.api;
  },
};
