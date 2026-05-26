/**
 * VLM Processor Client
 *
 * Client-side wrapper for the /api/ocr/pdf server endpoint.
 * Sends PDF or image files to a Vision Language Model (Claude Sonnet 4)
 * for structured data extraction.
 *
 * Pipeline:
 *   1. Upload file to /api/ocr/pdf via FormData
 *   2. Server renders PDF pages to images (if PDF) or uses image directly
 *   3. Server sends images to VLM for structured extraction
 *   4. Returns unified OCRResult with enriched fields (lineItems, description)
 *
 * Features:
 *   - Handles both PDF and image inputs
 *   - Transforms raw VLM API response into unified OCRResult
 *   - Proper error handling with descriptive messages
 */

import type {
  OCRResult,
  OCRSource,
  VLMApiResponse,
  SupportedCurrency,
} from './types';
import { createEmptyOCRResult } from './types';

/**
 * Process a file (PDF or image) using the server-side VLM endpoint.
 *
 * @param file - The file to process (PDF or image)
 * @param source - Where the file came from ('camera' | 'upload')
 * @returns Unified OCRResult with enriched fields from VLM
 * @throws Error if the server request fails
 */
export async function processWithVLM(
  file: File,
  source: OCRSource = 'unknown',
): Promise<OCRResult> {
  const isPdf =
    file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

  console.log(
    `[OCR:VLM] Processing ${file.name}, type=${file.type}, ` +
    `${(file.size / 1024).toFixed(1)}KB, isPdf=${isPdf}`,
  );

  // ── Upload to server ──
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/ocr/pdf', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(
      `[OCR:VLM] Server error ${response.status}:`,
      errorBody.substring(0, 200),
    );
    throw new Error(
      `OCR failed (${response.status}): ${errorBody || response.statusText}`,
    );
  }

  // ── Parse and transform response ──
  const data: VLMApiResponse = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return transformVLMResponse(data, source);
}

/**
 * Transform a raw VLM API response into a unified OCRResult.
 */
function transformVLMResponse(
  data: VLMApiResponse,
  source: OCRSource,
): OCRResult {
  // Build raw lines for backward compatibility and display
  const rawLines: string[] = [];
  if (data.vlmDescription) rawLines.push(data.vlmDescription);
  if (data.amount) rawLines.push(`Total: ${data.amount} DKK`);
  if (data.date) rawLines.push(`Dato: ${data.date}`);
  if (data.vatPercent) rawLines.push(`Moms: ${data.vatPercent}%`);
  if (data.vlmLines) {
    for (const line of data.vlmLines) {
      rawLines.push(`${line.description} - ${line.quantity}x ${line.unitPrice}`);
    }
  }

  return {
    // Core fields
    amount: data.amount ?? null,
    date: data.date ?? null,
    vatPercent: data.vatPercent ?? null,
    confidence: data.confidence ?? 85,
    rawLines,

    // Tesseract-specific (null for VLM)
    text: data.text || null,

    // VLM-enriched fields
    currency: 'DKK' as SupportedCurrency,
    description: data.vlmDescription ?? null,
    lineItems: (data.vlmLines || []).map((line) => ({
      description: line.description || '',
      quantity: line.quantity || 1,
      unitPrice: line.unitPrice || 0,
      vatPercent: line.vatPercent || 0,
    })),

    // Metadata
    processor: 'vlm',
    source,
  };
}
