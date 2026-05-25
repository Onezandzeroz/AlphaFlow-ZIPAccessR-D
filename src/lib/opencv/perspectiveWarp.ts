/**
 * perspectiveWarp.ts
 *
 * Perspective warp + document enhancement using OpenCV (warp) + Canvas 2D (enhancement).
 *
 * Architecture:
 *   - OpenCV.js: ONLY used for perspective warp (getPerspectiveTransform + warpPerspective)
 *   - Canvas 2D API: ALL enhancement (brightness, contrast, sharpen)
 *
 * Pipeline (v10 — clean document scan):
 *   1. Perspective warp (OpenCV INTER_CUBIC) — correct skew, minimum 2000px longest side
 *   2. Grayscale conversion — eliminates 3-channel work from every subsequent step
 *   3. Brightness boost (+15%) — compensates for sensor underexposure on mobile
 *   4. Median denoise — remove sensor noise before any manipulation
 *   5. Contrast stretch (1st–99th percentile) — gentle dynamic range normalization
 *   6. Mild sharpening — crisp text edges without introducing halos
 *   7. Gentle S-curve — subtle contrast boost, preserves natural tonal gradations
 *   8. Paper whitening — lift near-white pixels to clean white background
 *
 * v9 → v10 changes (CLEAN SCAN, NOT PHOTOCOPY):
 *   - REDUCED S-curve steepness from 8 → 4 (preserves natural shading)
 *   - REMOVED text darkening step (was crushing shadows artificially)
 *   - RELAXED contrast stretch from 2nd-98th → 1st-99th (prevents darkening of darker areas)
 *   - REDUCED sharpen strength from 0.7 → 0.5 (fewer halos on mid-tone text)
 *   - LOWERED paper whiten threshold from 235 → 225 (cleaner white background)
 *   - ADDED brightness boost +15% (compensates for mobile sensor underexposure)
 *   - Result: looks like a real flatbed scanner, not a harsh photocopy
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
 * Linear brightness boost — multiplies each pixel by a factor (1.15 = +15%).
 * Clamps to 255 to prevent overflow. Applied early in the pipeline so
 * subsequent steps (contrast stretch, S-curve) work on properly-lit data.
 */
function boostBrightness(gray: Uint8Array, factor: number): void {
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.min(255, (gray[i] * factor + 0.5) | 0);
  }
}

/**
 * Gentle S-curve contrast boost — produces a clean scanner look.
 *
 * Uses a sigmoid function with LOW steepness to subtly boost contrast:
 *   - Dark pixels (text) get gently darker
 *   - Light pixels (paper) get gently brighter
 *   - Mid-tones are preserved — no harsh photocopy effect
 *
 * The midpoint is auto-adapted from the image's median brightness,
 * so it works correctly regardless of original lighting.
 *
 * Uses a precomputed 256-entry LUT — O(n) application, very fast.
 */
function gentleSCurve(gray: Uint8Array): void {
  const n = gray.length;

  // Find midpoint: use the image's median brightness.
  const histogram = new Uint32Array(256);
  for (let i = 0; i < n; i++) histogram[gray[i]]++;
  let cum = 0;
  let median = 128;
  for (let i = 0; i < 256; i++) {
    cum += histogram[i];
    if (cum >= n / 2) { median = i; break; }
  }

  // Steepness 4 = subtle contrast boost (clean scanner look).
  // Higher values approach photocopy; lower values are nearly linear.
  const STEEPNESS = 4;

  // Precompute 256-entry LUT, then rescale so 0→0 and 255→255.
  // Without rescaling, the sigmoid never reaches exact 0 or 255,
  // which lifts pure blacks and dims pure whites slightly.
  const lut = new Uint8Array(256);
  const midpointNorm = median / 255;
  const raw = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const centered = (x - midpointNorm) * STEEPNESS;
    raw[i] = 1 / (1 + Math.exp(-centered));
  }
  const rawMin = raw[0];
  const rawMax = raw[255];
  const rawRange = rawMax - rawMin;
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, Math.round(((raw[i] - rawMin) / rawRange) * 255)));
  }

  // Apply LUT
  for (let i = 0; i < n; i++) {
    gray[i] = lut[gray[i]];
  }
}

/**
 * Contrast stretch using 1st and 99th percentiles.
 * Clips only the extreme 1% tails (sensor outliers, pure black borders).
 * Gentler than 2nd–98th — preserves natural shading in darker areas.
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
  if (range <= 5) return; // Already full contrast — only skip truly saturated images

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
      // Window contains pixels [x-radius .. x+radius] clamped — count is addX - subX + 1
      temp[rowOff + x] = sum / (addX - subX + 1);
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
      // Window contains rows [y-radius .. y+radius] clamped — count is addY - subY + 1
      result[y * w + x] = sum / (addY - subY + 1);
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
 * Mild strength (0.5) at radius 1 — sharpens text without creating
 * visible halos on mid-tone areas.
 * Applied BEFORE the S-curve so sharpening works on natural tonal values.
 */
function sharpenPass(gray: Uint8Array, w: number, h: number): void {
  unsharpMaskPass(gray, w, h, 1, 0.5);
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

  // Standard 2D prefix-sum integral images.
  // Size: (w+1) × (h+1), row stride = w+1.
  // integral[y*(w+1)+x] = sum of gray over rect [0,0]..[x-1,y-1].
  // This layout is required for the 4-corner rectangular sum formula to work correctly.
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  const integralSq = new Float64Array(stride * (h + 1));

  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    let rowSqSum = 0;
    for (let x = 1; x <= w; x++) {
      const v = gray[(y - 1) * w + (x - 1)];
      rowSum += v;
      rowSqSum += v * v;
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
      integralSq[y * stride + x] = integralSq[(y - 1) * stride + x] + rowSqSum;
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

      // Rectangular sum using 4-corner formula on the (w+1)×(h+1) integral image
      const r2 = y2 + 1, c2 = x2 + 1;
      const r1 = y1,     c1 = x1;

      const sum   = integral[r2*stride+c2]   - integral[r1*stride+c2]   - integral[r2*stride+c1]   + integral[r1*stride+c1];
      const sumSq = integralSq[r2*stride+c2] - integralSq[r1*stride+c2] - integralSq[r2*stride+c1] + integralSq[r1*stride+c1];

      const mean = sum / area;
      const variance = sumSq / area - mean * mean;
      const std = Math.sqrt(Math.max(0, variance));

      const threshold = mean * (1 + K * (std / R - 1));
      gray[y * w + x] = (gray[y * w + x] > threshold) ? 255 : 0;
    }
  }
}

// ── Text darkening ───────────────────────────────────────────────────

/**
 * Text darkening: push clearly-dark pixels toward pure black.
 * Complements paper whitening for full photocopy effect.
 * Uses a quadratic curve so pixels at threshold stay unchanged,
 * while pixels near 0 get pushed aggressively toward 0.
 * Threshold 50: only affects clearly dark text pixels (not anti-aliased edges).
 */
function darkenText(gray: Uint8Array): void {
  const THRESHOLD = 50;
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < THRESHOLD) {
      const t = gray[i] / THRESHOLD; // 0 → 1
      gray[i] = Math.round(gray[i] * t * t);
    }
  }
}

// ── Paper whitening ─────────────────────────────────────────────────

/**
 * Paper whitening: lift near-white pixels toward pure white.
 * Threshold 225 catches pixels that are already quite bright (warm-toned paper,
 * slightly uneven mobile lighting).
 *
 * Uses a quadratic ease-in curve so pixels just above the threshold lift gently,
 * while pixels close to 255 snap to pure white — natural, not harsh.
 *
 * Curve: output = THRESHOLD + t² × RANGE, where t = (pixel - THRESHOLD) / RANGE
 */
function whitenPaper(gray: Uint8Array): void {
  const THRESHOLD = 220; // Slightly lowered to catch more warm-toned paper
  const RANGE = 255 - THRESHOLD;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (i <= THRESHOLD) {
      lut[i] = i;
    } else {
      const t = (i - THRESHOLD) / RANGE; // 0 → 1
      lut[i] = Math.min(255, Math.round(THRESHOLD + t * t * RANGE));
    }
  }
  for (let i = 0; i < gray.length; i++) {
    gray[i] = lut[gray[i]];
  }
}

// ── Main enhancement pipeline ──────────────────────────────────────

/**
 * v10 enhancement pipeline — clean document scan.
 *
 * v10 key changes (clean scan, not photocopy):
 *   - REMOVED text darkening step (was crushing shadows on unevenly-lit receipts).
 *   - REPLACED photocopyContrast (steepness=8) with gentleSCurve (steepness=4):
 *     subtle contrast boost that preserves natural tonal gradations.
 *   - RELAXED contrast stretch from 2nd-98th to 1st-99th percentile:
 *     prevents darkening of darker receipt areas (shadows, colored ink).
 *   - REDUCED sharpen from 0.7 to 0.5: fewer halos on mid-tone text.
 *   - LOWERED paper whiten threshold from 235 to 225: cleaner white background.
 *
 * Result: looks like a real flatbed scanner — clean whites, readable text,
 * natural shading preserved. No harsh photocopy contrast.
 *
 * Order: Gray → Brightness → Denoise → Contrast → Sharpen → S-curve → Whiten
 */
function enhanceCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);

  console.log(`[perspectiveWarp] v10 enhancing ${w}×${h}`);

  // STEP 1: Grayscale
  const gray = extractGrayscale(imageData);
  console.log('[perspectiveWarp] ✓ Grayscale');

  // STEP 2: Brightness boost (+15%)
  try {
    boostBrightness(gray, 1.15);
    console.log('[perspectiveWarp] ✓ Brightness +15%');
  } catch (e) { console.warn('[perspectiveWarp] Brightness failed:', e); }

  // STEP 3: Median denoise (clean noise before any manipulation)
  try {
    medianDenoise(gray, w, h);
    console.log('[perspectiveWarp] ✓ Median denoise');
  } catch (e) { console.warn('[perspectiveWarp] Denoise failed:', e); }

  // STEP 4: Contrast stretch (1st–99th percentile — gentle normalization)
  try {
    stretchContrast(gray);
    console.log('[perspectiveWarp] ✓ Contrast stretch');
  } catch (e) { console.warn('[perspectiveWarp] Contrast failed:', e); }

  // STEP 5: Sharpen (on natural tones, BEFORE S-curve)
  try {
    sharpenPass(gray, w, h);
    console.log('[perspectiveWarp] ✓ Sharpen');
  } catch (e) { console.warn('[perspectiveWarp] Sharpen failed:', e); }

  // STEP 6: Gentle S-curve (subtle contrast boost — scanner look, not photocopy)
  try {
    gentleSCurve(gray);
    console.log('[perspectiveWarp] ✓ Gentle S-curve');
  } catch (e) { console.warn('[perspectiveWarp] S-curve failed:', e); }

  // STEP 7: Paper whitening (clean up near-white pixels to pure white)
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

  console.log(`[perspectiveWarp] v10 output: ${outputWidth}×${outputHeight}`);

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

  try {
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

    enhanceCanvas(outputCanvas);
    return outputCanvas;
  } finally {
    // Always free OpenCV mats — even if enhanceCanvas or imshow throws
    src.delete();
    dst.delete();
    srcPts.delete();
    dstPts.delete();
    M.delete();
  }
}

/**
 * Fallback: Canvas 2D perspective crop — extracts the quad bounding box from
 * the source and scales it to the output dimensions.
 *
 * This is NOT a full perspective correction (that requires a matrix transform),
 * but it correctly crops to the detected document region rather than scaling
 * the entire frame. For nearly-flat captures this produces usable results.
 * True perspective warp only happens when OpenCV is available.
 */
function canvasFallbackWarp(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
  outputWidth: number,
  outputHeight: number,
): HTMLCanvasElement {
  // Compute the bounding box of the quad in source coords
  const xs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x];
  const ys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y];
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(sourceCanvas.width,  Math.ceil(Math.max(...xs)));
  const y1 = Math.min(sourceCanvas.height, Math.ceil(Math.max(...ys)));
  const cropW = x1 - x0;
  const cropH = y1 - y0;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const ctx = outputCanvas.getContext('2d')!;

  if (cropW > 0 && cropH > 0) {
    // Draw only the quad bounding box, scaled to output dimensions
    ctx.drawImage(sourceCanvas, x0, y0, cropW, cropH, 0, 0, outputWidth, outputHeight);
  } else {
    // Degenerate quad — fall back to full frame
    ctx.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
  }

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

  try {
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
    return outputCanvas;
  } finally {
    // Always free OpenCV mats — even if an exception is thrown
    src.delete();
    dst.delete();
    srcPts.delete();
    dstPts.delete();
    M.delete();
  }
}
