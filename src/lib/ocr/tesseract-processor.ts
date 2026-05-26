/**
 * Tesseract Processor
 *
 * Client-side OCR processor using Tesseract.js.
 * Processes image files (JPEG, PNG, WebP, etc.) with Danish+English language support.
 *
 * Pipeline:
 *   1. Tesseract.recognize() → raw text + confidence
 *   2. parseReceiptText() → structured fields (amount, date, VAT%)
 *   3. Returns unified OCRResult
 *
 * Features:
 *   - Progress reporting (recognition progress 0-100%)
 *   - Graceful error handling (returns empty result on failure, never throws)
 */

import Tesseract from 'tesseract.js';
import { parseReceiptText } from './receipt-parser';
import type { OCRResult, OCRSource, OCRProgressCallback } from './types';
import { createEmptyOCRResult } from './types';

/**
 * Process an image file using Tesseract.js client-side OCR.
 *
 * @param imageFile - The image file to scan (JPEG, PNG, WebP, etc.)
 * @param source - Where the file came from ('camera' | 'upload')
 * @param onProgress - Optional progress callback (0-100)
 * @returns Unified OCRResult with extracted fields
 */
export async function processWithTesseract(
  imageFile: File,
  source: OCRSource = 'unknown',
  onProgress?: OCRProgressCallback,
): Promise<OCRResult> {
  try {
    const result = await Tesseract.recognize(imageFile, 'dan+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    });

    const text = result?.data?.text || '';
    const confidence = result?.data?.confidence || 0;
    const rawLines = text.split('\n').filter((line) => line.trim());
    const parsed = parseReceiptText(text);

    return {
      amount: parsed.totalAmount,
      date: parsed.date,
      vatPercent: parsed.vatPercent,
      confidence,
      rawLines,
      text: text || null,
      currency: null,
      description: null,
      lineItems: [],
      processor: 'tesseract',
      source,
    };
  } catch (error) {
    console.error('[OCR:Tesseract] Processing error:', error);
    return createEmptyOCRResult('tesseract', source);
  }
}
