/**
 * perspectiveWarp.ts
 *
 * Perspective warp + document enhancement using OpenCV (warp) + Canvas 2D (enhancement).
 *
 * Architecture:
 *   - OpenCV.js: ONLY used for perspective warp (getPerspectiveTransform + warpPerspective)
 *   - Canvas 2D API: ALL enhancement (brightness, contrast, sharpen)
 *
 * Pipeline (v6 — reordered for scanner-quality output):
 *   1. Perspective warp (OpenCV INTER_CUBIC) — correct skew, minimum 2000px longest side
 *   2. Grayscale conversion — FIRST (eliminates 3-channel work from every subsequent step)
 *   3. Median denoise — SECOND (remove sensor noise BEFORE any value manipulation)
 *   4. Contrast stretch (1st–99th percentile) — wider dynamic range, natural text contrast
 *   5. Adaptive brightness (target mean ~215) — consistent luminance across all lighting
 *   6. Two-pass sharpening — always LAST (sharpen clean edges, not amplified noise)
 *   7. Paper whitening — lift near-white pixels to pure white for photocopy/scanner aesthetic
 *
 * v5 → v6 changes:
 *   - Reordered pipeline: denoise BEFORE brightness/contrast (noise no longer amplified)
 *   - Replaced fixed +64 brightness with adaptive target-mean normalization
 *   - Widened contrast percentiles from 2nd–98th to 1st–99th for natural tonal range
 *   - Added paper whitening step for scanner-quality white backgrounds
 *   - JPEG quality raised to 90% for better text preservation
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
 * Adaptive brightness normalization.
 * Shifts all pixel values so the mean luminance approaches `targetMean`.
 * Uses a smooth factor (0.8×) to avoid overcorrection.
 * Skips adjustment if the image is already within ±8 of target.
 */
function adaptiveBrightness(gray: Uint8Array, targetMean: number): void {
  const n = gray.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i];
  const currentMean = sum / n;
  const delta = targetMean - currentMean;
  if (Math.abs(delta) < 8) return; // Already close enough
  const boost = delta * 0.8;
  for (let i = 0; i < n; i++) {
    gray[i] = Math.min(255, Math.max(0, Math.round(gray[i] + boost)));
  }
}

/**
 * Contrast stretch using 1st and 99th percentiles.
 * Wider range than v5's 2nd–98th for a more natural tonal distribution.
 * Clips only the extreme 1% tails (sensor outliers, pure black borders).
 */
function stretchContrast(gray: Uint8Array): void {
  const n = gray.length;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    histogram[gray[i]]++;
  }

  let lo = 0, hi = 255;
  let cum = 0;
  for (let i = 0; i < 256; i++) { cum += histogram[i]; if (cum >= n * 0.01) { lo = i; break; } }
  cum = 0;
  for (let i = 255; i >= 0; i--) { cum += histogram[i]; if (cum >= n * 0.01) { hi = i; break; } }

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
 * Two-pass sharpening for crisp text edges.
 *   Pass 1: Broad (radius 2, strength 0.8) — overall edge clarity
 *   Pass 2: Fine (radius 1, strength 0.6) — text stroke detail
 */
function sharpenTwoPass(gray: Uint8Array, w: number, h: number): void {
  unsharpMaskPass(gray, w, h, 2, 0.8);
  unsharpMaskPass(gray, w, h, 1, 0.6);
}

// ── Paper whitening ─────────────────────────────────────────────────

/**
 * Paper whitening: lift near-white pixels toward pure white.
 * Uses a quadratic curve so that pixels near 190 stay put,
 * but pixels closer to 255 get pushed to pure white (255).
 * This creates the "floating on white paper" scanner aesthetic
 * without affecting text or mid-tone content.
 */
function whitenPaper(gray: Uint8Array): void {
  const THRESHOLD = 190;
  const RANGE = 255 - THRESHOLD; // 65
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] > THRESHOLD) {
      const t = (gray[i] - THRESHOLD) / RANGE; // 0 → 1
      gray[i] = Math.min(255, Math.round(THRESHOLD + t * t * RANGE));
    }
  }
}

// ── Main enhancement pipeline ──────────────────────────────────────

/**
 * v6 enhancement pipeline — optimized order for scanner-quality output.
 *
 * Key insight from v5→v6: denoising MUST happen before brightness/contrast
 * manipulation. In v5, the fixed +64 brightness boost amplified sensor noise
 * before the median filter cleaned it up. Now noise is removed first.
 *
 * Order: Gray → Denoise → Contrast → Brightness → Sharpen → Whiten
 */
function enhanceCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);

  console.log(`[perspectiveWarp] v6 enhancing ${w}×${h}`);

  // STEP 1: Grayscale — FIRST (eliminates 3-channel work from all subsequent steps)
  const gray = extractGrayscale(imageData);
  console.log('[perspectiveWarp] ✓ Grayscale');

  // STEP 2: Median denoise — SECOND (clean noise before any value manipulation)
  try {
    medianDenoise(gray, w, h);
    console.log('[perspectiveWarp] ✓ Median denoise');
  } catch (e) { console.warn('[perspectiveWarp] Denoise failed:', e); }

  // STEP 3: Contrast stretch (1st–99th percentile — wider, more natural range)
  try {
    stretchContrast(gray);
    console.log('[perspectiveWarp] ✓ Contrast stretch');
  } catch (e) { console.warn('[perspectiveWarp] Contrast failed:', e); }

  // STEP 4: Adaptive brightness (target mean ~215 — consistent across all lighting)
  try {
    adaptiveBrightness(gray, 215);
    console.log('[perspectiveWarp] ✓ Adaptive brightness');
  } catch (e) { console.warn('[perspectiveWarp] Brightness failed:', e); }

  // STEP 5: Two-pass sharpen — LAST before whitening (sharpen clean edges only)
  try {
    sharpenTwoPass(gray, w, h);
    console.log('[perspectiveWarp] ✓ Two-pass sharpen');
  } catch (e) { console.warn('[perspectiveWarp] Sharpen failed:', e); }

  // STEP 6: Paper whitening (lift near-white to pure white for scanner look)
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

  console.log(`[perspectiveWarp] v6 output: ${outputWidth}×${outputHeight}`);

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
