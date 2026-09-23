#!/usr/bin/env node
// Download MediaPipe Face Landmarker assets next to the demo so the eye
// tracker does not depend on jsDelivr / Google Storage at runtime (those are
// the usual reason a Netlify deploy opens the camera but never shows the ring).

import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ? join(ROOT, process.argv[2]) : join(ROOT, 'public', 'vendor', 'mediapipe');
const VERSION = '0.10.17';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const FILES = [
  ['vision_bundle.mjs', `${CDN}/vision_bundle.mjs`],
  ['wasm/vision_wasm_internal.js', `${CDN}/wasm/vision_wasm_internal.js`],
  ['wasm/vision_wasm_internal.wasm', `${CDN}/wasm/vision_wasm_internal.wasm`],
  ['wasm/vision_wasm_nosimd_internal.js', `${CDN}/wasm/vision_wasm_nosimd_internal.js`],
  ['wasm/vision_wasm_nosimd_internal.wasm', `${CDN}/wasm/vision_wasm_nosimd_internal.wasm`],
  ['face_landmarker.task', MODEL],
];

async function download(url, dest) {
  if (existsSync(dest)) {
    console.log(`  keep ${dest}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`  got  ${dest}`);
}

try {
  console.log(`Fetching MediaPipe assets → ${OUT}`);
  for (const [rel, url] of FILES) {
    await download(url, join(OUT, rel));
  }
  console.log('Done.');
} catch (err) {
  console.warn('Vendor fetch failed (CDN fallback will be used):', err.message || err);
  if (!process.env.NETLIFY) process.exit(1);
}
