/**
 * OCR Module — Barrel Export
 *
 * Single entry point for the OCR module.
 * Import everything from '@/lib/ocr' instead of individual files.
 *
 * Public API:
 *   import { processDocument, useOcr, type OCRResult } from '@/lib/ocr';
 */

// ── Types ──
export type {
  OCRResult,
  OCRLineItem,
  OCRSource,
  OCRInputType,
  OCRProcessor,
  SupportedCurrency,
  VLMApiResponse,
  OCRProgressCallback,
  OCRState,
} from './types';

export {
  detectInputType,
  createEmptyOCRResult,
} from './types';

// ── Engine (main entry point) ──
export { processDocument } from './engine';
export type { ProcessDocumentOptions } from './engine';

// ── Processors ──
export { processWithTesseract } from './tesseract-processor';
export { processWithVLM } from './vlm-client';

// ── Parser ──
export {
  parseReceiptText,
  parseInvoiceText,
  formatDanishCurrency,
  getTodayISO,
} from './receipt-parser';
export type { ParsedReceiptFields, ParsedLineItem, ParsedInvoiceResult } from './receipt-parser';

// ── Hooks ──
export { useOcr } from './hooks/use-ocr';
export type { UseOcrReturn } from './hooks/use-ocr';
