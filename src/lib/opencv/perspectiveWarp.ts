/**
 * perspectiveWarp.ts
 *
 * Perspective warp + document enhancement using OpenCV (warp) + Canvas 2D (enhancement).
 *
 * Architecture:
 *   - OpenCV.js: ONLY used for perspective warp (getPerspectiveTransform + warpPerspective)
 *   - Canvas 2D API: ALL enhancement (brightness, contrast, sharpen)
 *
 * Pipeline (v8 — balanced enhancement, no overexposure):
 *   1. Perspective warp (OpenCV INTER_CUBIC) — correct skew, minimum 2000px longest side
 *   2. Grayscale conversion — FIRST (eliminates 3-channel work from every subsequent step)
 *   3. Median denoise — SECOND (remove sensor noise BEFORE any value manipulation)
 *   4. Contrast stretch (2nd–98th percentile) — widen dynamic range without clipping extremes
 *   5. Adaptive brightness (target mean ~200, gamma-corrected) — natural luminance adjustment
 *   6. Single-pass sharpening — crisp text edges without halos
 *   7. Paper whitening — lift ONLY near-white pixels (230+) to pure white
 *
 * v7 → v8 changes (OVEREXPOSURE FIX):
 *   - REMOVED Sauvola binarization — it destroyed detail on brightened images
 *   - Lowered brightness target: 215 → 200 (less aggressive push)
 *   - Changed brightness from additive to gamma correction (more natural, preserves blacks)
 *   - Raised paper whitening threshold: 190 → 230 (only whitens already-near-white pixels)
 *   - Reduced sharpening from two-pass to single-pass (less edge halo)
 *   - Tightened contrast percentiles: 1st–99th → 2nd–98th (less extreme stretching)
 *
 * v6 → v7 changes:
 *   - Added Sauvola local binarization as final step (pure black text on white paper)
 *   - Sauvola handles uneven illumination better than global Otsu for receipt documents
 */

declare const cv: any;

import type { Quad } from './documentDetect';

// ── Resolution constants ────────────────────────────────────────────

const MIN_OUTPUT_DIM = 2000;   // Minimum longest side — ensures OCR-quality text
const MIN_OUTPUT_WIDTH = 800;  // Minimum width — prevents narrow receipts from being tiny
const MAX_OUTPUT_DIM = 3500;   // Maximum longest side — prevent memory issues

/**
 * Compute output dimensions from quad proportions.
 * Ensures minimum resolution for OCR clarity by upscaling if needed.
 */
function quadDimensions(quad: Quad): { width: number; height: number } {
  const topW = Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y);
  const botW = Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y);
  const leftH = Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y);
  const rightH = Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y);

  const avgW = (topW + botW) / 2;
  const avgH = (leftH + rightH) / 2;

  let width = Math.round(avgW);
  let height = Math.round(avgH);

  const maxSide = Math.max(width, height);
  if (maxSide < MIN_OUTPUT_DIM) {
    const scale = MIN_OUTPUT_DIM / maxSide;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  if (width < MIN_OUTPUT_WIDTH) {
    const scale = MIN_OUTPUT_WIDTH / width;
    width = MIN_OUTPUT_WIDTH;
    height = Math.round(height * scale);
  }

  const newMax = Math.max(width, height);
  if (newMax > MAX_OUTPUT_DIM) {
    const scale = MAX_OUTPUT_DIM / newMax;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  return { width, height };
}

// ── Single-channel helpers (operate on flat Uint8Array of length w*h) ──

/**
 * Convert ImageData to a flat Uint8Array grayscale (length = w*h).
 * ITU-R BT.601: 0.299R + 0.587G + 0.114B
 */
function extractGrayscale(imageData: ImageData): Uint8Array {
  const d = imageData.data;
  const n = imageData.width * imageData.height;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    gray[i] = Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]);
  }
  return gray;
}

/**
 * Write a flat grayscale Uint8Array back into ImageData (sets R=G=B=gray, A=255).
 */
function writeGrayscale(imageData: ImageData, gray: Uint8Array): void {
  const d = imageData.data;
  const n = gray.length;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    d[j] = gray[i];
    d[j + 1] = gray[i];
    d[j + 2] = gray[i];
    d[j + 3] = 255;
  }
}

/**
 * Adaptive brightness normalization using gamma correction.
 * Adjusts image brightness so the mean luminance approaches `targetMean`.
 * Uses gamma correction instead of additive shift — this preserves near-black
 * pixels (text) while gently lifting mid-tones (paper).
 * Skips adjustment if the image is already within ±5 of target.
 */
function adaptiveBrightness(gray: Uint8Array, targetMean: number): void {
  const n = gray.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i];
  const currentMean = sum / n;
  const delta = targetMean - currentMean;
  if (Math.abs(delta) < 5) return; // Already close enough

  // Use gamma correction instead of additive shift.
  // Gamma brightens mid-tones while preserving near-black pixels.
  // gamma < 1 = brighten, gamma > 1 = darken.
  // We interpolate toward the ideal gamma, capped to avoid extreme values.
  const ratio = targetMean / currentMean;
  let gamma = 1.0 / Math.max(0.5, Math.min(2.0, ratio)); // clamp ratio
  // Blend: if delta is small, stay closer to 1.0 (neutral)
  gamma = 1.0 + (gamma - 1.0) * 0.6;

  // Precompute 256-entry LUT for speed
  const lut = new Uint8Array(256);
  const invGamma = 1.0 / gamma;
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(i / 255, invGamma))));
  }
  for (let i = 0; i < n; i++) {
    gray[i] = lut[gray[i]];
  }
}

/**
 * Contrast stretch using 2nd and 98th percentiles.
 * Clips the extreme 2% tails (sensor outliers, pure black borders, hot pixels).
 * Tighter than 1st–99th — prevents over-stretching which causes washed-out whites.
 */
function stretchContrast(gray: Uint8Array): void {
  const n = gray.length;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    histogram[gray[i]]++;
  }

  let lo = 0, hi = 255;
  let cum = 0;
  for (let i = 0; i < 256; i++) { cum += histogram[i]; if (cum >= n * 0.02) { lo = i; break; } }
  cum = 0;
  for (let i = 255; i >= 0; i--) { cum += histogram[i]; if (cum >= n * 0.02) { hi = i; break; } }

  const range = hi - lo;
  if (range <= 20) return; // Already high contrast

  const scale = 255 / range;
  for (let i = 0; i < n; i++) {
    gray[i] = Math.max(0, Math.min(255, Math.round((gray[i] - lo) * scale)));
  }
}

/**
 * 3×3 cross-pattern median filter on single-channel data.
 * Removes salt-and-pepper noise without blurring edges.
 * Uses a flat Uint8Array copy for in-place operation.
 */
function medianDenoise(gray: Uint8Array, w: number, h: number): void {
  const copy = new Uint8Array(gray);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      let a = copy[idx - w];     // top
      let b = copy[idx - 1];     // left
      let c = copy[idx];         // center
      let d2 = copy[idx + 1];    // right
      let e = copy[idx + w];     // bottom
      // Sort 5 values, take median
      // Optimization: sort network for 5 elements
      let t: number;
      if (a > b) { t = a; a = b; b = t; }
      if (c > d2) { t = c; c = d2; d2 = t; }
      if (a > c) { t = a; a = c; c = t; }
      if (b > d2) { t = b; b = d2; d2 = t; }
      if (b > c) { t = b; b = c; c = t; }
      if (b > e) {
        if (c > e) { gray[idx] = c; }
        else { gray[idx] = e; }
      } else {
        if (b > d2) { gray[idx] = d2; }
        else { gray[idx] = b; }
      }
    }
  }
}

/**
 * Single-channel box blur using separable horizontal + vertical passes.
 * Operates on flat Uint8Array (w*h) — no RGBA overhead.
 * O(n) per pixel regardless of radius via running sum.
 */
function boxBlurGray(gray: Uint8Array, w: number, h: number, radius: number): Float32Array {
  const temp = new Float32Array(w * h);
  const result = new Float32Array(w * h);

  // Horizontal pass with running sum for O(w) per row instead of O(w*radius)
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const rowOff = y * w;
    // Initialize window
    for (let x = 0; x <= radius && x < w; x++) sum += gray[rowOff + x];
    temp[rowOff] = sum / Math.min(radius + 1, w);

    // Slide window right
    for (let x = 1; x < w; x++) {
      const addX = Math.min(x + radius, w - 1);
      const subX = Math.max(x - radius - 1, 0);
      sum += gray[rowOff + addX] - gray[rowOff + subX];
      temp[rowOff + x] = sum / (addX - subX);
    }
  }

  // Vertical pass with running sum
  for (let x = 0; x < w; x++) {
    let sum = 0;
    // Initialize window
    for (let y = 0; y <= radius && y < h; y++) sum += temp[y * w + x];
    result[x] = sum / Math.min(radius + 1, h);

    // Slide window down
    for (let y = 1; y < h; y++) {
      const addY = Math.min(y + radius, h - 1);
      const subY = Math.max(y - radius - 1, 0);
      sum += temp[addY * w + x] - temp[subY * w + x];
      result[y * w + x] = sum / (addY - subY);
    }
  }

  return result;
}

/**
 * Unsharp mask on single-channel data: sharpened = original + strength * (original - blurred).
 * Uses Float32Array blurred result for precision.
 */
function unsharpMaskPass(gray: Uint8Array, w: number, h: number, radius: number, strength: number): void {
  const blurred = boxBlurGray(gray, w, h, radius);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const sharp = gray[i] + strength * (gray[i] - blurred[i]);
    gray[i] = Math.min(255, Math.max(0, Math.round(sharp)));
  }
}

/**
 * Single-pass sharpening for crisp text edges.
 * Moderate strength (0.6) at radius 1 — sharpens text without creating
 * visible halos or amplifying noise.
 * v8: reduced from two-pass to prevent over-sharpening artifacts.
 */
function sharpenPass(gray: Uint8Array, w: number, h: number): void {
  unsharpMaskPass(gray, w, h, 1, 0.6);
}

// ── Sauvola local binarization ───────────────────────────────────────

/**
 * Sauvola binarization: produces pure B&W output (black text on white paper).
 * Superior to global Otsu for documents with uneven illumination.
 *
 * Formula: T(x,y) = mean(x,y) * (1 + k * (std(x,y) / R - 1))
 *
 * Uses integral images for O(1) mean/variance computation per pixel.
 * This is the standard approach used in production document scanners.
 */
function sauvolaBinarize(gray: Uint8Array, w: number, h: number): void {
  const K = 0.2;     // Controls threshold sensitivity (0.2 = standard for documents)
  const R = 128;      // Dynamic range of standard deviation (normalization constant)
  const halfWin = 15; // Window half-size (31×31 window — large enough to capture local context)

  // Build integral images for mean and mean-of-squares
  // integral[i] = sum of gray[0..i]
  // integralSq[i] = sum of gray[0..i]^2
  const n = w * h;
  const integral = new Float64Array(n + 1);
  const integralSq = new Float64Array(n + 1);

  // Row 0
  let rowSum = 0;
  let rowSqSum = 0;
  for (let x = 0; x < w; x++) {
    const v = gray[x];
    rowSum += v;
    rowSqSum += v * v;
    integral[x + 1] = rowSum;
    integralSq[x + 1] = rowSqSum;
  }

  // Remaining rows
  for (let y = 1; y < h; y++) {
    const rowOff = y * w;
    rowSum = 0;
    rowSqSum = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[rowOff + x];
      rowSum += v;
      rowSqSum += v * v;
      const idx = rowOff + x + 1;
      integral[idx] = integral[idx - w] + rowSum;
      integralSq[idx] = integralSq[idx - w] + rowSqSum;
    }
  }

  // Apply Sauvola threshold to each pixel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const y1 = Math.max(0, y - halfWin);
      const y2 = Math.min(h - 1, y + halfWin);
      const x1 = Math.max(0, x - halfWin);
      const x2 = Math.min(w - 1, x + halfWin);

      const area = (x2 - x1 + 1) * (y2 - y1 + 1);

      // Sum from integral images: sum = II(x2,y2) - II(x1-1,y2) - II(x2,y1-1) + II(x1-1,y1-1)
      const iy2 = y2 + 1;
      const ix2 = x2 + 1;
      const iy1 = y1;
      const ix1 = x1;

      const sum = integral[iy2 * w + ix2] - integral[iy2 * w + ix1] - integral[iy1 * w + ix2] + integral[iy1 * w + ix1];
      const sumSq = integralSq[iy2 * w + ix2] - integralSq[iy2 * w + ix1] - integralSq[iy1 * w + ix2] + integralSq[iy1 * w + ix1];

      const mean = sum / area;
      const variance = sumSq / area - mean * mean;
      const std = Math.sqrt(Math.max(0, variance));

      const threshold = mean * (1 + K * (std / R - 1));
      gray[y * w + x] = (gray[y * w + x] > threshold) ? 255 : 0;
    }
  }
}

// ── Paper whitening ─────────────────────────────────────────────────

/**
 * Paper whitening: lift ONLY near-white pixels toward pure white.
 * Threshold 230 means only pixels already very close to white get boosted.
 * This creates a clean white paper look without destroying mid-tones.
 * v8: raised from 190 to 230 to prevent over-whitening of mid-tone content.
 */
function whitenPaper(gray: Uint8Array): void {
  const THRESHOLD = 230;
  const RANGE = 255 - THRESHOLD; // 25
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] > THRESHOLD) {
      const t = (gray[i] - THRESHOLD) / RANGE; // 0 → 1
      gray[i] = Math.min(255, Math.round(THRESHOLD + t * t * RANGE));
    }
  }
}

// ── Main enhancement pipeline ──────────────────────────────────────

/**
 * v8 enhancement pipeline — balanced, no overexposure.
 *
 * v8 key changes (overexposure fix):
 *   - REMOVED Sauvola binarization: was destroying detail on brightened images.
 *     Clean grayscale preserves text readability, colored elements, and formatting.
 *   - Brightness: target 200 (was 215), gamma-corrected (was additive).
 *     Gamma preserves dark text while gently lifting mid-tones.
 *   - Paper whitening: threshold 230 (was 190). Only whitens already-near-white pixels.
 *   - Contrast: 2nd–98th percentile (was 1st–99th). Less extreme stretching.
 *   - Sharpening: single-pass (was two-pass). Less edge halo artifacts.
 *
 * Order: Gray → Denoise → Contrast → Brightness → Sharpen → Whiten
 */
function enhanceCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);

  console.log(`[perspectiveWarp] v8 enhancing ${w}×${h}`);

  // STEP 1: Grayscale — FIRST (eliminates 3-channel work from all subsequent steps)
  const gray = extractGrayscale(imageData);
  console.log('[perspectiveWarp] ✓ Grayscale');

  // STEP 2: Median denoise — SECOND (clean noise before any value manipulation)
  try {
    medianDenoise(gray, w, h);
    console.log('[perspectiveWarp] ✓ Median denoise');
  } catch (e) { console.warn('[perspectiveWarp] Denoise failed:', e); }

  // STEP 3: Contrast stretch (2nd–98th percentile — natural range, no over-stretching)
  try {
    stretchContrast(gray);
    console.log('[perspectiveWarp] ✓ Contrast stretch');
  } catch (e) { console.warn('[perspectiveWarp] Contrast failed:', e); }

  // STEP 4: Adaptive brightness (target mean ~200, gamma-corrected — preserves blacks)
  try {
    adaptiveBrightness(gray, 200);
    console.log('[perspectiveWarp] ✓ Adaptive brightness');
  } catch (e) { console.warn('[perspectiveWarp] Brightness failed:', e); }

  // STEP 5: Single-pass sharpen — crisp text without halos
  try {
    sharpenPass(gray, w, h);
    console.log('[perspectiveWarp] ✓ Sharpen');
  } catch (e) { console.warn('[perspectiveWarp] Sharpen failed:', e); }

  // STEP 6: Paper whitening (lift only 230+ to white — preserves mid-tones)
  try {
    whitenPaper(gray);
    console.log('[perspectiveWarp] ✓ Paper whitening');
  } catch (e) { console.warn('[perspectiveWarp] Whitening failed:', e); }

  // Write back to ImageData (R=G=B=gray, A=255)
  writeGrayscale(imageData, gray);
  ctx.putImageData(imageData, 0, 0);
  console.log('[perspectiveWarp] Enhancement pipeline complete');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Warp the detected quad region from the source canvas into a rectangle,
 * then apply document enhancement for clean, readable output.
 */
export function warpAndThreshold(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
  outputWidth?: number,
  outputHeight?: number
): HTMLCanvasElement {
  if (outputWidth === undefined || outputHeight === undefined) {
    const dims = quadDimensions(quad);
    outputWidth = dims.width;
    outputHeight = dims.height;
  }

  console.log(`[perspectiveWarp] v8 output: ${outputWidth}×${outputHeight}`);

  if (typeof cv !== 'undefined' && cv.Mat) {
    try {
      return opencvWarp(sourceCanvas, quad, outputWidth, outputHeight);
    } catch (e) {
      console.warn('[perspectiveWarp] OpenCV warp failed:', e);
    }
  }

  return canvasFallbackWarp(sourceCanvas, quad, outputWidth, outputHeight);
}

/**
 * OpenCV perspective warp + Canvas 2D enhancement.
 */
function opencvWarp(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
  outputWidth: number,
  outputHeight: number,
): HTMLCanvasElement {
  const src = cv.imread(sourceCanvas);
  const dst = new cv.Mat();

  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad.tl.x, quad.tl.y,
    quad.tr.x, quad.tr.y,
    quad.br.x, quad.br.y,
    quad.bl.x, quad.bl.y,
  ]);

  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outputWidth, 0,
    outputWidth, outputHeight,
    0, outputHeight,
  ]);

  const M = cv.getPerspectiveTransform(srcPts, dstPts);
  cv.warpPerspective(
    src, dst, M,
    new cv.Size(outputWidth, outputHeight),
    cv.INTER_CUBIC,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  src.delete();
  srcPts.delete();
  dstPts.delete();
  M.delete();

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  cv.imshow(outputCanvas, dst);
  dst.delete();

  enhanceCanvas(outputCanvas);

  return outputCanvas;
}

/**
 * Fallback: Simple Canvas 2D perspective warp using drawImage transforms.
 */
function canvasFallbackWarp(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
  outputWidth: number,
  outputHeight: number,
): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const ctx = outputCanvas.getContext('2d')!;
  ctx.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
  enhanceCanvas(outputCanvas);
  return outputCanvas;
}

/**
 * Warp without any enhancement — preserves original colors and quality.
 */
export function warpOnly(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
  outputWidth?: number,
  outputHeight?: number
): HTMLCanvasElement {
  if (typeof cv === 'undefined' || !cv.Mat) {
    return sourceCanvas;
  }

  if (outputWidth === undefined || outputHeight === undefined) {
    const dims = quadDimensions(quad);
    outputWidth = dims.width;
    outputHeight = dims.height;
  }

  const src = cv.imread(sourceCanvas);
  const dst = new cv.Mat();

  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad.tl.x, quad.tl.y,
    quad.tr.x, quad.tr.y,
    quad.br.x, quad.br.y,
    quad.bl.x, quad.bl.y,
  ]);

  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outputWidth, 0,
    outputWidth, outputHeight,
    0, outputHeight,
  ]);

  const M = cv.getPerspectiveTransform(srcPts, dstPts);
  cv.warpPerspective(
    src, dst, M,
    new cv.Size(outputWidth, outputHeight),
    cv.INTER_CUBIC,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  cv.imshow(outputCanvas, dst);

  src.delete();
  dst.delete();
  srcPts.delete();
  dstPts.delete();
  M.delete();

  return outputCanvas;
}
