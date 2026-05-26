/**
 * OCR Engine — Unified Document Processing
 *
 * Single entry point for processing receipts and invoices.
 * Automatically routes to the correct processor based on input type:
 *
 *   - Images (JPEG, PNG, WebP, etc.) → Tesseract.js (client-side)
 *   - PDFs                         → VLM via /api/ocr/pdf (server-side)
 *
 * Both pipelines produce a unified OCRResult, so consumers don't need
 * to know which processor was used.
 *
 * Usage:
 *   const result = await processDocument(file, { source: 'camera' });
 *   // result.amount, result.date, result.vatPercent, result.lineItems, etc.
 */

import type {
  OCRResult,
  OCRSource,
  OCRInputType,
  OCRProgressCallback,
} from './types';
import { detectInputType } from './types';
import { processWithTesseract } from './tesseract-processor';
import { processWithVLM } from './vlm-client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROCESSING OPTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ProcessDocumentOptions {
  /** Where the document came from (default: 'unknown') */
  source?: OCRSource;
  /** Force a specific processor ('tesseract' | 'vlm'), or auto-detect */
  processor?: 'tesseract' | 'vlm' | 'auto';
  /** Progress callback (Tesseract only; VLM is binary) */
  onProgress?: OCRProgressCallback;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Process a document (receipt or invoice) and extract structured data.
 *
 * Routing strategy:
 *   - PDF files → VLM (server-side Claude Sonnet 4)
 *   - Image files → Tesseract.js (client-side, with progress)
 *   - Override with `processor` option to force a specific pipeline
 *
 * @param file - The document file (image or PDF)
 * @param options - Processing options
 * @returns Unified OCRResult with extracted fields
 * @throws Error if processing fails (VLM) or returns empty result (Tesseract)
 */
export async function processDocument(
  file: File,
  options: ProcessDocumentOptions = {},
): Promise<OCRResult> {
  const {
    source = 'unknown',
    processor = 'auto',
    onProgress,
  } = options;

  const inputType = detectInputType(file);
  const selectedProcessor = resolveProcessor(inputType, processor);

  console.log(
    `[OCR:Engine] Processing: ${file.name} (${inputType}) → ${selectedProcessor}`,
  );

  switch (selectedProcessor) {
    case 'tesseract':
      return processWithTesseract(file, source, onProgress);

    case 'vlm':
      // Report binary progress for VLM (no granular progress available)
      onProgress?.(10);
      try {
        const result = await processWithVLM(file, source);
        onProgress?.(100);
        return result;
      } catch (error) {
        onProgress?.(0);
        throw error;
      }

    default:
      throw new Error(`Unknown processor: ${selectedProcessor}`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ROUTING LOGIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Resolve which processor to use based on input type and user preference.
 *
 * Strategy:
 *   - PDFs always go to VLM (Tesseract can't read PDFs)
 *   - Images default to Tesseract (fast, free, no API cost)
 *   - Override with explicit processor option
 */
function resolveProcessor(
  inputType: OCRInputType,
  preference: 'tesseract' | 'vlm' | 'auto',
): 'tesseract' | 'vlm' {
  if (preference !== 'auto') return preference;

  // PDFs require VLM (Tesseract doesn't support PDFs in browser)
  if (inputType === 'pdf') return 'vlm';

  // Images default to Tesseract (fast, offline, no API cost)
  return 'tesseract';
}
