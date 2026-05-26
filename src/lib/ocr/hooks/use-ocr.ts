/**
 * useOcr — Unified OCR React Hook
 *
 * Provides a clean interface for processing documents with OCR.
 * Manages loading state, progress, results, and errors.
 * Works with both input modes (camera capture and file upload).
 *
 * Usage:
 *   const { processFile, result, loading, progress, error, reset } = useOcr();
 *
 *   // Trigger OCR on a file
 *   await processFile(file, { source: 'camera' });
 *
 *   // Use the result
 *   if (result) {
 *     setAmount(result.amount);
 *     setDate(result.date);
 *     setVatPercent(result.vatPercent);
 *     setLineItems(result.lineItems);
 *   }
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  OCRResult,
  OCRSource,
  OCRProgressCallback,
} from '../types';
import type { ProcessDocumentOptions } from '../engine';
import { processDocument } from '../engine';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK INTERFACE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseOcrReturn {
  /** Process a file with OCR (returns the result, or throws on error) */
  processFile: (
    file: File,
    options?: { source?: OCRSource; processor?: 'tesseract' | 'vlm' | 'auto' },
  ) => Promise<OCRResult | null>;

  /** Current OCR result, or null if no document has been processed */
  result: OCRResult | null;

  /** Whether OCR is currently processing */
  loading: boolean;

  /** Processing progress 0-100 (Tesseract shows granular progress; VLM is binary) */
  progress: number;

  /** Error message if processing failed, or null */
  error: string | null;

  /** Reset state (clear result, error, progress) */
  reset: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * React hook for document OCR processing.
 *
 * Encapsulates all OCR state management so components don't need to
 * manually track loading, progress, errors, and results.
 */
export function useOcr(): UseOcrReturn {
  const [result, setResult] = useState<OCRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Ref to prevent race conditions if multiple files are processed
  const activeRequestId = useRef(0);

  /**
   * Process a file with OCR.
   *
   * @param file - The document file (image or PDF)
   * @param options - Optional processing options (source)
   * @returns The OCR result, or null if processing was interrupted
   */
  const processFile = useCallback(
    async (
      file: File,
      options?: { source?: OCRSource; processor?: 'tesseract' | 'vlm' | 'auto' },
    ): Promise<OCRResult | null> => {
      // Increment request ID to detect stale responses
      const requestId = ++activeRequestId.current;

      // Reset previous state
      setLoading(true);
      setError(null);
      setProgress(0);

      // Progress callback
      const onProgress: OCRProgressCallback = (p) => {
        // Only update if this is still the active request
        if (activeRequestId.current === requestId) {
          setProgress(p);
        }
      };

      try {
        const processOptions: ProcessDocumentOptions = {
          source: options?.source,
          processor: options?.processor,
          onProgress,
        };

        const ocrResult = await processDocument(file, processOptions);

        // Check if this request is still current (user may have started a new one)
        if (activeRequestId.current !== requestId) {
          return null;
        }

        setResult(ocrResult);
        setLoading(false);
        setProgress(100);
        return ocrResult;
      } catch (err) {
        // Check if this request is still current
        if (activeRequestId.current !== requestId) {
          return null;
        }

        const message =
          err instanceof Error ? err.message : 'OCR processing failed';
        setError(message);
        setLoading(false);
        setProgress(0);
        return null;
      }
    },
    [],
  );

  /**
   * Reset all OCR state.
   */
  const reset = useCallback(() => {
    // Invalidate any in-flight request
    activeRequestId.current++;
    setResult(null);
    setLoading(false);
    setProgress(0);
    setError(null);
  }, []);

  return {
    processFile,
    result,
    loading,
    progress,
    error,
    reset,
  };
}
