'use client';

/**
 * useScannerEngine.ts
 *
 * Scanner engine hook with:
 *   - Quad lock-on: once detected, the overlay persists and tracks the receipt
 *     even if a few frames fail to detect
 *   - Exponential moving average (EMA) smoothing for stable corner positions
 *   - Graduated stillness: small movements decay the counter slowly, not reset to 0
 *   - Auto-capture only (no manual button)
 *
 * Architecture:
 *   - <video> element = visible camera feed (object-cover)
 *   - <canvas ref={overlayCanvasRef}> = overlay for quad trace
 *   - offscreen canvases = OpenCV detection + stillness
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { loadOpenCV } from '@/lib/opencv/loadOpenCV';
import { detectDocumentQuad, type Quad } from '@/lib/opencv/documentDetect';
import { warpAndThreshold } from '@/lib/opencv/perspectiveWarp';
import { useLanguageStore } from '@/lib/language-store';

// ── Tuning constants ───────────────────────────────────────────────

// Detection interval fallback for browsers without requestVideoFrameCallback
const DETECT_INTERVAL_MS = 50;

// Detection canvas max dimension — keep SMALL for speed
// 480px wide = ~260K pixels vs 2M at 1080p → ~8× faster OpenCV
const DETECT_MAX_DIM_DEFAULT = 480;
const DETECT_MAX_DIM_MIN = 256;     // Floor — never go below this (detection quality suffers)
const DETECT_MAX_DIM_STEP = 32;     // Reduce by this amount when over budget
const FRAME_TIME_BUDGET_MS = 45;    // Target: leave headroom for 20fps
const FRAME_TIME_SMOOTH = 0.3;      // EMA for measured frame time
const ADAPTIVE_CHECK_INTERVAL = 5;  // Check every N frames whether to adapt

// Stillness: allow MORE movement (relaxed from 0.025)
const STILL_THRESHOLD = 0.06;          // 6% avg pixel shift = "still enough"
const STILL_HARD_THRESHOLD = 0.15;      // 15% = definitely moving
const STILL_FRAMES_NEEDED = 10;         // Reduced from 15 for faster capture

// Quad lock-on: keep showing overlay for N frames after last detection
const LOCK_MAX_AGE = 60;                // 60 × 80ms = 4.8 seconds of persistence

// EMA smoothing for corner positions (lower = smoother but slower to follow)
const CORNER_SMOOTH_ALPHA = 0.35;

// Camera constraints for STREAM (used for detection preview only).
// 1600×900 — safe middle ground: less GPU work than 1080p, universally supported.
// 1.44M pixels vs 2.07M at 1080p → ~30% less GPU work per frame.
// Detection quality is unaffected (always uses 480px offscreen canvas).
// High-quality capture uses ImageCapture API (see doCapture).
const CONSTRAINTS_FULL: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1600, min: 1280 },
    height: { ideal: 900, min: 720 },
    frameRate: { ideal: 30 },
  },
  audio: false,
};

const CONSTRAINTS_RELAXED: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};

const CONSTRAINTS_MINIMAL: MediaStreamConstraints = {
  video: true,
  audio: false,
};

type Phase = 'loading' | 'permission_pending' | 'scanning' | 'capturing' | 'processing' | 'result' | 'error' | 'dismissed';

export interface ScannerError {
  message: string;
  retryable: boolean;
}

// ── Smart camera selection for multi-lens devices ───────────────────

interface CameraCandidate {
  deviceId: string;
  label: string;
  maxResW: number;
  maxResH: number;
}

// ── Camera caching (skip enumeration on repeat scans) ───────────────

const CAMERA_CACHE_KEY = 'scanner_best_camera';
const CAMERA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CameraCacheEntry {
  deviceId: string;
  maxResW: number;
  maxResH: number;
  ts: number;
}

function getCachedCamera(): CameraCacheEntry | null {
  try {
    const raw = localStorage.getItem(CAMERA_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CameraCacheEntry;
    if (Date.now() - entry.ts > CAMERA_CACHE_TTL) return null;
    return entry;
  } catch { return null; }
}

function setCachedCamera(deviceId: string, maxResW: number, maxResH: number): void {
  try {
    localStorage.setItem(CAMERA_CACHE_KEY, JSON.stringify({ deviceId, maxResW, maxResH, ts: Date.now() }));
  } catch { /* localStorage may be full or blocked */ }
}

/**
 * On multi-lens phones (e.g. Galaxy A53 with 4 rear cameras),
 * `facingMode: 'environment'` often selects the ultrawide or macro lens
 * instead of the main camera — producing lower quality scans.
 *
 * This function:
 *   1. Gets any rear-facing stream to trigger permission + enumerate devices
 *   2. Lists all video devices and tests each rear-facing one
 *   3. Picks the camera with the highest max resolution (= main sensor)
 *   4. Opens a new stream on that specific camera
 *
 * Falls back to simple facingMode if enumeration isn't supported.
 */
async function acquireBestCameraStream(): Promise<MediaStream | null> {
  // Step 0: Try cached camera first (skip 2-6s enumeration on repeat scans)
  const cached = getCachedCamera();
  if (cached) {
    try {
      const cachedStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: cached.deviceId },
          width: { ideal: 1600, min: 1280 },
          height: { ideal: 900, min: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      console.log(`[ScannerCamera] Using cached: ${cached.deviceId.slice(0, 8)} (${cached.maxResW}×${cached.maxResH})`);
      return cachedStream;
    } catch {
      // Cached camera no longer available — fall through to full selection
      try { localStorage.removeItem(CAMERA_CACHE_KEY); } catch { /* ignore */ }
    }
  }

  // Step 1: Get initial stream to trigger permission grant
  // (enumerateDevices() returns empty labels without permission)
  const initialStream = await acquireStreamBasic();
  if (!initialStream) return null;

  try {
    // Step 2: Enumerate all video devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (videoDevices.length <= 1) {
      // Single camera device — nothing to choose, use what we have
      return initialStream;
    }

    // Step 3: Test each device to find the best rear camera
    const candidates: CameraCandidate[] = [];

    for (const device of videoDevices) {
      // Skip devices that are clearly not rear-facing (based on label)
      if (device.label) {
        const label = device.label.toLowerCase();
        // Skip front-facing cameras
        if (label.includes('user') || label.includes('front') || label.includes('facetime')) {
          continue;
        }
        // On Samsung, depth and IR cameras are low-res and useless for scanning
        if (label.includes('depth') || label.includes('ir ') || label.includes('infrared')) {
          continue;
        }
      }

      try {
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: device.deviceId },
            width: { ideal: 4000 },
            height: { ideal: 3000 },
          },
          audio: false,
        });

        const track = testStream.getVideoTracks()[0];
        const settings = track.getSettings();
        let maxW = settings.width || 0;
        let maxH = settings.height || 0;

        // Check capabilities for the true maximum resolution
        try {
          const caps = track.getCapabilities() as { width?: { max: number }; height?: { max: number } };
          if (caps.width?.max && caps.width.max > maxW) maxW = caps.width.max;
          if (caps.height?.max && caps.height.max > maxH) maxH = caps.height.max;
        } catch { /* getCapabilities not supported on some browsers */ }

        // Stop test stream immediately
        testStream.getTracks().forEach(t => t.stop());

        candidates.push({
          deviceId: device.deviceId,
          label: device.label || `camera-${device.deviceId.slice(0, 8)}`,
          maxResW: maxW,
          maxResH: maxH,
        });
      } catch {
        // Can't open this device — skip it
        continue;
      }
    }

    // Stop the initial stream
    initialStream.getTracks().forEach(t => t.stop());

    if (candidates.length === 0) {
      // No valid rear cameras found — fall back
      return acquireStreamBasic();
    }

    // Step 4: Pick the camera with the highest max resolution (main sensor)
    candidates.sort((a, b) => (b.maxResW * b.maxResH) - (a.maxResW * a.maxResH));
    const best = candidates[0];

    console.log(`[ScannerCamera] Selected: ${best.label} (${best.maxResW}×${best.maxResH})`);
    if (candidates.length > 1) {
      console.log(`[ScannerCamera] Rejected: ${candidates.slice(1).map(c => `${c.label} (${c.maxResW}×${c.maxResH})`).join(', ')}`);
    }

    // Cache for next time (skips enumeration on repeat scans)
    setCachedCamera(best.deviceId, best.maxResW, best.maxResH);

    // Step 5: Open stream on the selected camera at 1600×900.
    // Safe middle ground for detection — minimal GPU decode, universal camera support.
    // High-quality capture uses ImageCapture API (see doCapture).
    const bestStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: best.deviceId },
        width: { ideal: 1600, min: 1280 },
        height: { ideal: 900, min: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });

    return bestStream;

  } catch (err) {
    console.warn('[ScannerCamera] Smart selection failed, using fallback:', err);
    // Stop initial stream and fall back to basic acquisition
    initialStream.getTracks().forEach(t => t.stop());
    return acquireStreamBasic();
  }
}

/**
 * Basic stream acquisition with constraint fallback chain.
 * Used as fallback when smart camera selection isn't available.
 */
async function acquireStreamBasic(): Promise<MediaStream | null> {
  const attempts = [CONSTRAINTS_FULL, CONSTRAINTS_RELAXED, CONSTRAINTS_MINIMAL];
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      continue;
    }
  }
  return null;
}

// Keep old name as alias for compatibility
async function acquireStream(): Promise<MediaStream | null> {
  return acquireBestCameraStream();
}

// ── Video → display coordinate mapping (object-cover) ───────────────

interface Pt { x: number; y: number; }

function videoToDisplay(pt: Pt, video: HTMLVideoElement, dw: number, dh: number): Pt {
  const va = video.videoWidth / video.videoHeight;
  const da = dw / dh;
  let rw: number, rh: number, ox: number, oy: number;
  if (va > da) {
    rh = dh; rw = dh * va; ox = (dw - rw) / 2; oy = 0;
  } else {
    rw = dw; rh = dw / va; ox = 0; oy = (dh - rh) / 2;
  }
  return {
    x: (pt.x / video.videoWidth) * rw + ox,
    y: (pt.y / video.videoHeight) * rh + oy,
  };
}

// ── Quad smoothing (EMA) ────────────────────────────────────────────

function lerpPt(a: Pt, b: Pt, alpha: number): Pt {
  return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}

function smoothQuad(prev: Quad, fresh: Quad, alpha: number): Quad {
  return {
    tl: lerpPt(prev.tl, fresh.tl, alpha),
    tr: lerpPt(prev.tr, fresh.tr, alpha),
    br: lerpPt(prev.br, fresh.br, alpha),
    bl: lerpPt(prev.bl, fresh.bl, alpha),
  };
}

// ── False-positive filter ───────────────────────────────────────────

function isEdgeQuad(dp: Pt[], dw: number, dh: number): boolean {
  const edgeMargin = 0.03; // Tight margin — only filter obvious full-frame matches
  return dp.every(p =>
    p.x < dw * edgeMargin || p.x > dw * (1 - edgeMargin) ||
    p.y < dh * edgeMargin || p.y > dh * (1 - edgeMargin)
  );
}

// ── High-quality frame capture ───────────────────────────────────────

/**
 * Capture a high-quality frame from the camera for post-processing.
 *
 * Strategy:
 *   1. Try ImageCapture API (Chrome/Android) — grabs at the camera sensor's
 *      full resolution, hardware-processed. Much higher quality than stream
 *      resolution with no GPU decode overhead.
 *   2. Fall back to canvas drawImage from the video stream — uses whatever
 *      resolution the stream provides (typically 1920×1080).
 *
 * The result is capped at `maxDim` longest side (set by caller based on
 * track capabilities — typically the device's native sensor resolution,
 * up to 4000px to keep post-processing manageable).
 */
async function captureHighQualityFrame(
  video: HTMLVideoElement,
  track: MediaStreamTrack | undefined,
  maxDim: number,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Try ImageCapture API — available in Chrome 59+, Edge 79+, Opera 46+
  if (track && typeof ImageCapture !== 'undefined') {
    try {
      const imageCapture = new ImageCapture(track);
      const blob = await imageCapture.takePhoto();

      // Create bitmap from the photo blob (hardware-decoded, efficient)
      const img = await createImageBitmap(blob);
      const srcW = img.width;
      const srcH = img.height;

      // Cap at maxDim longest side to keep post-processing manageable
      let w = srcW;
      let h = srcH;
      const longestSide = Math.max(w, h);
      if (longestSide > maxDim) {
        const scale = maxDim / longestSide;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      canvas.width = w;
      canvas.height = h;
      if (ctx) ctx.drawImage(img, 0, 0, w, h);

      // Free bitmap memory immediately
      img.close();

      console.log(`[ScannerCapture] ImageCapture: ${srcW}×${srcH} → ${w}×${h}`);
      return canvas;
    } catch (err) {
      console.warn('[ScannerCapture] ImageCapture failed, falling back to canvas:', err);
    }
  }

  // Fallback: canvas drawImage from the video stream at stream resolution
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (ctx) ctx.drawImage(video, 0, 0);

  console.log(`[ScannerCapture] Canvas fallback: ${video.videoWidth}×${video.videoHeight}`);
  return canvas;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function useScannerEngine() {
  const language = useLanguageStore(s => s.language);
  const msg = (da: string, en: string) => language === 'da' ? da : en;
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stillnessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rvfcIdRef = useRef<number | null>(null);  // requestVideoFrameCallback handle
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  // Adaptive detection resolution state
  const detectMaxDimRef = useRef(DETECT_MAX_DIM_DEFAULT);
  const frameTimeEmaRef = useRef(0);
  const frameCountRef = useRef(0);
  const frameBusyRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [quad, setQuad] = useState<Quad | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [scanStatus, setScanStatus] = useState<'searching' | 'found' | 'stable'>('searching');
  const [error, setError] = useState<ScannerError | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);
  const [scannedFile, setScannedFile] = useState<File | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Detection state refs
  const quadRef = useRef<Quad | null>(null);         // Latest raw detection result
  const lockedQuadRef = useRef<Quad | null>(null);   // Smoothed, persisted quad for overlay
  const lockAgeRef = useRef(0);                       // Frames since last detection confirmed lock
  const stillnessCountRef = useRef(0);
  const prevFrameRef = useRef<Uint8Array | null>(null);
  const capturingRef = useRef(false);
  const scannedUrlRef = useRef<string | null>(null);
  const overlaySizedRef = useRef(false);
  const displayDimsRef = useRef({ dw: 0, dh: 0 });
  const torchOnRef = useRef(false);

  // Function refs (break circular dependencies)
  const stopCameraRef = useRef<() => void>(() => {});
  const doCaptureRef = useRef<() => Promise<void>>(async () => {});
  const startDetectionLoopRef = useRef<() => void>(() => {});

  useEffect(() => { scannedUrlRef.current = scannedUrl; }, [scannedUrl]);

  // ── Torch (LED flash) control ────────────────────────────────────

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
      const hasTorch = caps?.torch === true;
      setTorchSupported(hasTorch);

      if (!hasTorch) return;

      const newState = !torchOnRef.current;
      await track.applyConstraints({ advanced: [{ torch: newState }] } as MediaTrackConstraintSet);
      torchOnRef.current = newState;
      setTorchOn(newState);
      console.log(`[ScannerCamera] Torch ${newState ? 'ON' : 'OFF'}`);
    } catch {
      // Torch not supported on this device/browser
      setTorchSupported(false);
    }
  }, []);

  // ── Stop camera (comprehensive cleanup) ──────────────────────────

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (rvfcIdRef.current !== null) {
      const video = videoRef.current;
      if (video && typeof (video as any).cancelVideoFrameCallback === 'function') {
        (video as any).cancelVideoFrameCallback(rvfcIdRef.current);
      }
      rvfcIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    }

    overlaySizedRef.current = false;
    quadRef.current = null;
    lockedQuadRef.current = null;
    lockAgeRef.current = 0;
    stillnessCountRef.current = 0;
    prevFrameRef.current = null;
    capturingRef.current = false;
    torchOnRef.current = false;
    setTorchOn(false);
  }, []);

  useEffect(() => { stopCameraRef.current = stopCamera; }, [stopCamera]);

  // ── Draw overlay on canvas (quad trace on top of video) ──────────

  const drawOverlay = useCallback((
    ctx: CanvasRenderingContext2D,
    dw: number,
    dh: number,
    video: HTMLVideoElement,
    detectedQuad: Quad | null,
    stillCount: number,
    isLocked: boolean,
  ) => {
    ctx.clearRect(0, 0, dw, dh);

    if (!detectedQuad) return;

    const { tl, tr, br, bl } = detectedQuad;
    const dp = [
      videoToDisplay(tl, video, dw, dh),
      videoToDisplay(tr, video, dw, dh),
      videoToDisplay(br, video, dw, dh),
      videoToDisplay(bl, video, dw, dh),
    ];

    // Only run false-positive filter on freshly detected quads, not locked ones
    if (!isLocked && isEdgeQuad(dp, dw, dh)) return;

    const stable = stillCount >= 4;

    // Fill
    ctx.fillStyle = stable ? 'rgba(13, 148, 136, 0.30)' : 'rgba(13, 148, 136, 0.15)';
    ctx.beginPath();
    ctx.moveTo(dp[0].x, dp[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(dp[i].x, dp[i].y);
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.strokeStyle = stable ? 'rgba(45, 212, 191, 1)' : 'rgba(45, 212, 191, 0.9)';
    ctx.lineWidth = stable ? 3 : 2;
    ctx.lineJoin = 'round';
    ctx.setLineDash(stable ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner dots
    const r = stable ? 6 : 4;
    for (const p of dp) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = stable ? 'rgba(16, 185, 129, 1)' : 'rgba(45, 212, 191, 0.9)';
      ctx.fill();
      // White center
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }, []);

  // ── Detection loop (shared core logic) ───────────────────────────

  /**
   * Core detection tick — runs one frame of: stillness check + OpenCV detect + overlay.
   * Extracted so both setInterval and requestVideoFrameCallback can call it.
   */
  const detectTick = useCallback(() => {
    // Guard: don't run if unmounted, capturing, or previous frame still processing
    if (!mountedRef.current || capturingRef.current || frameBusyRef.current) return;
    frameBusyRef.current = true;

    const t0 = performance.now();

    try {
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      const frame = frameCanvasRef.current;
      const stillCanvas = stillnessCanvasRef.current;
      if (!video || !overlay || !frame || !stillCanvas || video.readyState < 2) {
        frameBusyRef.current = false;
        return;
      }

      // Size overlay canvas to match its CSS display size (once)
      if (!overlaySizedRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const cw = overlay.clientWidth;
        const ch = overlay.clientHeight;
        if (cw === 0 || ch === 0) { frameBusyRef.current = false; return; }
        overlay.width = cw * dpr;
        overlay.height = ch * dpr;
        const ctx = overlay.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
        overlaySizedRef.current = true;
        displayDimsRef.current = { dw: cw, dh: ch };
      }

      const { dw, dh } = displayDimsRef.current;
      const overlayCtx = overlay.getContext('2d');
      if (!overlayCtx) { frameBusyRef.current = false; return; }

      // Draw frame to offscreen detection canvas (already at small size)
      const fctx = frame.getContext('2d');
      if (!fctx) { frameBusyRef.current = false; return; }
      fctx.drawImage(video, 0, 0, frame.width, frame.height);

      // ── Stillness check (graduated — not hard reset) ──────────
      const sctx = stillCanvas.getContext('2d');
      if (sctx) {
        sctx.drawImage(video, 0, 0, 64, 48);
        const imgData = sctx.getImageData(0, 0, 64, 48);
        const currentFrame = new Uint8Array(imgData.data.buffer);
        const prev = prevFrameRef.current;

        if (prev) {
          let sad = 0;
          for (let i = 0; i < currentFrame.length; i += 4) {
            sad += Math.abs(currentFrame[i] - prev[i]);
          }
          const avgSad = sad / (64 * 48) / 255;

          if (avgSad < STILL_THRESHOLD) {
            stillnessCountRef.current = stillnessCountRef.current + 1;
          } else if (avgSad < STILL_HARD_THRESHOLD) {
            stillnessCountRef.current = Math.max(0, stillnessCountRef.current - 1);
          } else {
            stillnessCountRef.current = Math.max(0, stillnessCountRef.current - 3);
          }
        }
        prevFrameRef.current = currentFrame;
      }

      const isCurrentlyStable = stillnessCountRef.current >= 4;

      // ── OpenCV detection with quad lock-on ────────────────────
      try {
        let freshQuad = detectDocumentQuad(frame);

        // Scale quad from detection canvas coords → video resolution coords
        if (freshQuad) {
          const s = parseFloat(frame.dataset.scale || '1');
          if (s !== 1) {
            freshQuad = {
              tl: { x: freshQuad.tl.x / s, y: freshQuad.tl.y / s },
              tr: { x: freshQuad.tr.x / s, y: freshQuad.tr.y / s },
              br: { x: freshQuad.br.x / s, y: freshQuad.br.y / s },
              bl: { x: freshQuad.bl.x / s, y: freshQuad.bl.y / s },
            };
          }
        }

        quadRef.current = freshQuad;

        let displayQuad: Quad | null = null;
        let hasTracking = false;

        if (freshQuad) {
          if (lockedQuadRef.current) {
            displayQuad = smoothQuad(lockedQuadRef.current, freshQuad, CORNER_SMOOTH_ALPHA);
          } else {
            displayQuad = freshQuad;
          }
          lockedQuadRef.current = displayQuad;
          lockAgeRef.current = 0;
          hasTracking = true;
        } else if (lockedQuadRef.current) {
          lockAgeRef.current += 1;
          if (lockAgeRef.current < LOCK_MAX_AGE) {
            displayQuad = lockedQuadRef.current;
            hasTracking = true;
          } else {
            lockedQuadRef.current = null;
          }
        }

        setQuad(displayQuad);
        const newStatus = hasTracking
          ? (isCurrentlyStable ? 'stable' : 'found')
          : 'searching';
        setScanStatus(newStatus);
        setIsStable(hasTracking && isCurrentlyStable);

        drawOverlay(overlayCtx, dw, dh, video, displayQuad, stillnessCountRef.current, hasTracking && lockAgeRef.current > 0);

        // ── Auto-capture: stillness + locked quad ──────────────
        if (
          !capturingRef.current &&
          stillnessCountRef.current >= STILL_FRAMES_NEEDED &&
          hasTracking &&
          lockedQuadRef.current
        ) {
          capturingRef.current = true;
          setTimeout(() => doCaptureRef.current(), 0);
        }
      } catch {
        if (lockedQuadRef.current) {
          lockAgeRef.current += 1;
          if (lockAgeRef.current < LOCK_MAX_AGE) {
            drawOverlay(overlayCtx, dw, dh, video, lockedQuadRef.current, stillnessCountRef.current, true);
            setIsStable(isCurrentlyStable);
            setScanStatus(isCurrentlyStable ? 'stable' : 'found');
          } else {
            lockedQuadRef.current = null;
            setQuad(null);
            setScanStatus('searching');
            setIsStable(false);
            overlayCtx.clearRect(0, 0, dw, dh);
          }
        } else {
          quadRef.current = null;
          setQuad(null);
          setScanStatus('searching');
          setIsStable(false);
          overlayCtx.clearRect(0, 0, dw, dh);
        }
      }

      // ── Adaptive detection resolution ────────────────────────
      // Measure frame time and scale down detection canvas if over budget
      const dt = performance.now() - t0;
      frameCountRef.current += 1;

      // Exponential moving average for frame time
      if (frameTimeEmaRef.current === 0) {
        frameTimeEmaRef.current = dt;
      } else {
        frameTimeEmaRef.current = frameTimeEmaRef.current * (1 - FRAME_TIME_SMOOTH) + dt * FRAME_TIME_SMOOTH;
      }

      // Check every N frames whether to adapt
      if (frameCountRef.current % ADAPTIVE_CHECK_INTERVAL === 0 && frameTimeEmaRef.current > FRAME_TIME_BUDGET_MS) {
        const currentDim = detectMaxDimRef.current;
        if (currentDim > DETECT_MAX_DIM_MIN) {
          const newDim = Math.max(DETECT_MAX_DIM_MIN, currentDim - DETECT_MAX_DIM_STEP);
          detectMaxDimRef.current = newDim;
          console.log(`[ScannerEngine] Frame time ${frameTimeEmaRef.current.toFixed(1)}ms > ${FRAME_TIME_BUDGET_MS}ms budget → reducing detection to ${newDim}px`);

          // Resize the detection canvas
          const video2 = videoRef.current;
          if (video2 && video2.videoWidth) {
            const vw = video2.videoWidth;
            const vh = video2.videoHeight;
            const maxDim = Math.max(vw, vh);
            const detectScale = maxDim > newDim ? newDim / maxDim : 1;
            const ndw = Math.round(vw * detectScale);
            const ndh = Math.round(vh * detectScale);
            if (frameCanvasRef.current) {
              frameCanvasRef.current.width = ndw;
              frameCanvasRef.current.height = ndh;
              frameCanvasRef.current.dataset.scale = String(detectScale);
            }
          }
        }
      }
    } finally {
      frameBusyRef.current = false;
    }
  }, [drawOverlay]);

  // ── Detection loop entry point ───────────────────────────────────────

  const startDetectionLoop = useCallback(() => {
    // Clear any existing loop
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (rvfcIdRef.current !== null) {
      const video = videoRef.current;
      if (video && typeof (video as any).cancelVideoFrameCallback === 'function') {
        (video as any).cancelVideoFrameCallback(rvfcIdRef.current);
      }
      rvfcIdRef.current = null;
    }

    // Reset adaptive state for each new scan session
    detectMaxDimRef.current = DETECT_MAX_DIM_DEFAULT;
    frameTimeEmaRef.current = 0;
    frameCountRef.current = 0;
    frameBusyRef.current = false;

    const video = videoRef.current;
    // Prefer requestVideoFrameCallback (Chrome 83+) — fires exactly on new camera frames
    if (video && typeof (video as any).requestVideoFrameCallback === 'function') {
      const scheduleNext = () => {
        if (!mountedRef.current || capturingRef.current) return;
        rvfcIdRef.current = (video as any).requestVideoFrameCallback(() => {
          detectTick();
          if (mountedRef.current && !capturingRef.current) {
            scheduleNext();
          }
        });
      };
      scheduleNext();
      console.log('[ScannerEngine] Detection: requestVideoFrameCallback (frame-synced)');
    } else {
      // Fallback: setInterval for browsers without RVFC
      intervalRef.current = setInterval(detectTick, DETECT_INTERVAL_MS);
      console.log('[ScannerEngine] Detection: setInterval fallback');
    }
  }, [detectTick]);

  useEffect(() => { startDetectionLoopRef.current = startDetectionLoop; }, [startDetectionLoop]);

  // ── Capture + warp ───────────────────────────────────────────────

  const doCapture = useCallback(async () => {
    const video = videoRef.current;
    const currentQuad = lockedQuadRef.current || quadRef.current;
    if (!video || !video.videoWidth) return;

    if (!mountedRef.current) return;

    setPhase('capturing');

    // Focus lock before capture: prevent AF hunting during the grab moment
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: 0 }] } as MediaTrackConstraintSet);
        await new Promise(r => setTimeout(r, 200)); // Let lens settle
      } catch { /* Focus lock not supported — continue with continuous AF */ }
    }

    // Save video dimensions NOW — stopCamera() will zero videoWidth/videoHeight
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;

    // High-quality capture: try ImageCapture API first, fall back to canvas.
    // ImageCapture can grab at sensor's full resolution (much higher than stream),
    // hardware-processed — no GPU decode overhead.
    // Let the device decide its best resolution: use track capabilities as cap,
    // fall back to 4000px safety limit only if capabilities are unavailable.
    // This ensures consistent quality across different devices and sensor sizes.
    let captureMaxDim = 4000; // Safety upper bound (prevents 48MP/64MP monsters)
    if (track) {
      try {
        const caps = track.getCapabilities() as { width?: { max: number }; height?: { max: number } } | undefined;
        if (caps?.width?.max && caps?.height?.max) {
          const trackMax = Math.max(caps.width.max, caps.height.max);
          captureMaxDim = Math.min(trackMax, 4000); // Cap at 4000 to keep post-processing fast
          console.log(`[ScannerEngine] Track max resolution: ${caps.width.max}×${caps.height.max} → capture cap: ${captureMaxDim}px`);
        }
      } catch { /* getCapabilities not supported — use 4000 default */ }
    }
    const capCanvas = await captureHighQualityFrame(video, track, captureMaxDim);
    console.log(`[ScannerEngine] Captured at ${capCanvas.width}×${capCanvas.height} (stream was ${videoW}×${videoH})`);

    // Flash animation delay
    setTimeout(() => {
      if (!mountedRef.current) return;

      setPhase('processing');
      stopCameraRef.current();

      try {
        let resultCanvas: HTMLCanvasElement;

        if (currentQuad) {
          // Scale quad from video stream coordinates to captured image coordinates.
          //
          // IMPORTANT: ImageCapture.takePhoto() may capture at a DIFFERENT aspect ratio
          // than the video stream (e.g., stream = 16:9, sensor = 4:3). The video stream
          // is center-cropped from the sensor. We must map quad coordinates through the
          // same center crop so they reference the correct physical area in the photo.
          //
          // Strategy:
          //   1. Compute the sensor crop that matches the stream's aspect ratio (centered)
          //   2. Scale quad from stream pixel space into that crop's pixel space
          //   3. Offset into the full captured image coordinates
          const capW = capCanvas.width;
          const capH = capCanvas.height;
          const streamAspect = videoW / videoH;
          const capAspect = capW / capH;

          let cropX = 0, cropY = 0, cropW = capW, cropH = capH;
          if (capAspect > streamAspect) {
            // Capture is wider than stream → pillarbox (side crop)
            cropW = capH * streamAspect;
            cropX = (capW - cropW) / 2;
          } else if (capAspect < streamAspect) {
            // Capture is taller than stream → letterbox (top/bottom crop)
            cropH = capW / streamAspect;
            cropY = (capH - cropH) / 2;
          }

          // Map quad corners from stream → captured image
          const mapX = (sx: number) => cropX + (sx / videoW) * cropW;
          const mapY = (sy: number) => cropY + (sy / videoH) * cropH;

          const captureQuad: Quad = {
            tl: { x: mapX(currentQuad.tl.x), y: mapY(currentQuad.tl.y) },
            tr: { x: mapX(currentQuad.tr.x), y: mapY(currentQuad.tr.y) },
            br: { x: mapX(currentQuad.br.x), y: mapY(currentQuad.br.y) },
            bl: { x: mapX(currentQuad.bl.x), y: mapY(currentQuad.bl.y) },
          };
          console.log(`[ScannerEngine] Quad mapped: stream ${videoW}×${videoH} → capture ${capW}×${capH}, crop ${Math.round(cropW)}×${Math.round(cropH)} at (${Math.round(cropX)},${Math.round(cropY)})`);

          // Dynamic dimensions — computed from quad proportions inside warpAndThreshold
          resultCanvas = warpAndThreshold(capCanvas, captureQuad);
        } else {
          resultCanvas = capCanvas;
        }

        // The enhanceCanvas pipeline (v6) already produces grayscale output.
        // Export at 90% JPEG for better text preservation.
        resultCanvas.toBlob(
          (blob) => {
            if (!mountedRef.current) return;
            if (!blob) {
              setError({ message: msg('Kunne ikke generere billede.', 'Could not generate image.'), retryable: true });
              setPhase('error');
              return;
            }

            const file = new File([blob], `receipt_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            setScannedUrl(url);
            setScannedFile(file);
            setPhase('result');
          },
          'image/jpeg',
          0.90
        );
      } catch (err) {
        console.error('[ScannerEngine] Processing failed:', err);
        if (!mountedRef.current) return;
        setError({ message: msg('Kunne ikke behandle billedet. Prøv igen.', 'Could not process the image. Please try again.'), retryable: true });
        setPhase('error');
      }
    }, 400);
  }, [msg]);

  useEffect(() => { doCaptureRef.current = doCapture; }, [doCapture]);

  // ── Start camera ─────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    try {
      const stream = await acquireStream();
      if (!stream) {
        setError({ message: msg('Kunne ikke få adgang til kameraet.', 'Could not access the camera.'), retryable: true });
        setPhase('error');
        return;
      }

      streamRef.current = stream;

      // Probe for torch (LED flash) support
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const caps = videoTrack.getCapabilities?.() as { torch?: boolean } | undefined;
          setTorchSupported(caps?.torch === true);
        } catch { /* getCapabilities not supported */ }
      }

      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', 'true');
        video.srcObject = stream;
        void video.play().catch(() => {});
      }

      await new Promise<void>((resolve) => {
        const v = video || videoRef.current;
        if (!v || (v.videoWidth && v.videoHeight)) { resolve(); return; }
        const onMeta = () => { resolve(); };
        v?.addEventListener('loadedmetadata', onMeta, { once: true });
        setTimeout(resolve, 2000);
      });

      // Wait for video to actually produce frames (readyState >= 2 = HAVE_CURRENT_DATA).
      // Some Samsung camera HALs deliver the stream at certain resolutions but
      // never decode a frame, causing readyState to stay at 1 (metadata only).
      // Without this check, the detection loop silently skips every frame.
      const currentVideo = videoRef.current;
      if (currentVideo && currentVideo.readyState < 2) {
        console.log(`[ScannerCamera] Waiting for frames (readyState=${currentVideo.readyState})...`);
        await new Promise<void>((resolve) => {
          const check = () => {
            const v = videoRef.current;
            if (!v || v.readyState >= 2) { resolve(); return; }
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
          setTimeout(resolve, 3000); // Hard timeout — start anyway after 3s
        });
      }

      const vw = currentVideo?.videoWidth || 640;
      const vh = currentVideo?.videoHeight || 480;
      console.log(`[ScannerCamera] Stream ready: ${vw}×${vh}, readyState=${currentVideo?.readyState}`);

      // Downscale detection canvas for SPEED (uses adaptive dim from P3-a)
      const detectDim = detectMaxDimRef.current;
      const maxDim = Math.max(vw, vh);
      const detectScale = maxDim > detectDim ? detectDim / maxDim : 1;
      const dw = Math.round(vw * detectScale);
      const dh = Math.round(vh * detectScale);

      frameCanvasRef.current = document.createElement('canvas');
      frameCanvasRef.current.width = dw;
      frameCanvasRef.current.height = dh;
      // Store scale factor so we can upscale quad coords back to video resolution
      frameCanvasRef.current.dataset.scale = String(detectScale);

      stillnessCanvasRef.current = document.createElement('canvas');
      stillnessCanvasRef.current.width = 64;
      stillnessCanvasRef.current.height = 48;

      if (mountedRef.current) {
        setPhase('scanning');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const errMsg = err instanceof Error ? err.message : msg('Ukendt fejl', 'Unknown error');
      const isNotAllowed = errMsg.includes('NotAllowed') || errMsg.includes('Permission');
      const isNotFound = errMsg.includes('NotFound');
      setError({
        message: isNotAllowed
          ? msg('Kameratilladelse blev afvist. Tillad kameraadgang i browserindstillingerne.', 'Camera permission was denied. Please allow camera access in browser settings.')
          : isNotFound
            ? msg('Intet kamera fundet på denne enhed.', 'No camera found on this device.')
            : `${language === 'da' ? 'Kamerafejl' : 'Camera Error'}: ${errMsg}`,
        retryable: !isNotAllowed,
      });
      setPhase('error');
    }
  }, [msg, language]);

  // ── Discard scan result (free Blob + revoke ObjectURL) ───────────

  /**
   * Revoke the ObjectURL and null out the scanned file/blob so the browser
   * can immediately free the memory. Called before retake, dismiss, and unmount.
   */
  const discardScan = useCallback(() => {
    const url = scannedUrlRef.current;
    if (url) {
      URL.revokeObjectURL(url);
      scannedUrlRef.current = null;
    }
    setScannedUrl(null);
    setScannedFile(null);
  }, []);

  // ── Retake ───────────────────────────────────────────────────────

  const retake = useCallback(() => {
    discardScan();
    setQuad(null);
    setIsStable(false);
    setScanStatus('searching');
    stillnessCountRef.current = 0;
    prevFrameRef.current = null;
    capturingRef.current = false;
    overlaySizedRef.current = false;
    lockedQuadRef.current = null;
    lockAgeRef.current = 0;
    quadRef.current = null;
    setPhase('permission_pending');
  }, [discardScan]);

  // ── Retry ────────────────────────────────────────────────────────

  const retry = useCallback(() => {
    setError(null);
    setPhase('permission_pending');
  }, []);

  // ── Effects ──────────────────────────────────────────────────────

  // Load OpenCV
  useEffect(() => {
    mountedRef.current = true;

    loadOpenCV()
      .then(() => {
        if (mountedRef.current) setPhase('permission_pending');
      })
      .catch((err) => {
        console.error('[ScannerEngine] OpenCV load failed:', err);
        if (mountedRef.current) {
          setError({
            message: msg('Kunne ikke indlæse scannersystemet. Tjek din internetforbindelse.', 'Could not load the scanner system. Check your internet connection.'),
            retryable: true,
          });
          setPhase('error');
        }
      });

    return () => {
      mountedRef.current = false;
      stopCameraRef.current();
    };
  }, []);

  // Start camera on permission_pending
  const startCameraRef = useRef(startCamera);
  useEffect(() => { startCameraRef.current = startCamera; }, [startCamera]);

  useEffect(() => {
    if (phase === 'permission_pending') {
      startCameraRef.current();
    }
  }, [phase]);

  // Start detection loop when scanning
  useEffect(() => {
    if (phase === 'scanning') {
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          startDetectionLoopRef.current();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      discardScan();
    };
  }, [discardScan]);

  return {
    videoRef,
    overlayCanvasRef,
    phase,
    quad,
    isStable,
    scanStatus,
    error,
    discardScan,
    scannedUrl,
    scannedFile,
    retake,
    retry,
    stopCamera,
    torchOn,
    torchSupported,
    toggleTorch,
  };
}
