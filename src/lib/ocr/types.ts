/**
 * OCR Module — Unified Type System
 *
 * Single source of truth for all OCR-related types.
 * Covers both input modes:
 *   - Mobile: camera capture → Tesseract OCR → regex parsing
 *   - Desktop: PDF upload → VLM (Claude Sonnet 4) → structured JSON
 *
 * Both processors produce a unified OCRResult, so consumers don't need
 * to know which pipeline was used.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INPUT TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Where the document came from */
export type OCRSource = 'camera' | 'upload' | 'unknown';

/** What kind of document was processed */
export type OCRInputType = 'image' | 'pdf';

/** Which OCR processor handled the document */
export type OCRProcessor = 'tesseract' | 'vlm';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRUCTURED DATA TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** A single line item extracted from an invoice or receipt */
export interface OCRLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
}

/** Currency codes supported by the application */
export type SupportedCurrency = 'DKK' | 'EUR' | 'USD' | 'GBP' | 'SEK' | 'NOK';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESULT TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Unified OCR result — the single output type from any OCR pipeline.
 *
 * Fields present from both processors:
 *   - amount, date, vatPercent, confidence, rawLines
 *
 * Fields enriched by Tesseract (client-side image OCR):
 *   - text (full raw OCR text)
 *
 * Fields enriched by VLM (server-side PDF/image AI):
 *   - currency, description, lineItems
 */
export interface OCRResult {
  // ── Core extracted fields (both processors) ──
  /** Total amount including VAT (brutto), or null if not detected */
  amount: number | null;
  /** Document date in ISO format (YYYY-MM-DD), or null */
  date: string | null;
  /** VAT percentage (0-100), or null if not detected */
  vatPercent: number | null;
  /** OCR confidence score 0-100 */
  confidence: number;
  /** Raw text lines extracted from the document */
  rawLines: string[];

  // ── Tesseract-specific (image OCR) ──
  /** Full raw OCR text output (Tesseract only, null for VLM) */
  text: string | null;

  // ── VLM-specific (AI-powered PDF/image) ──
  /** Currency code detected on the document */
  currency: SupportedCurrency | null;
  /** Brief description of the purchase/vendor */
  description: string | null;
  /** Structured line items from the invoice */
  lineItems: OCRLineItem[];

  // ── Metadata ──
  /** Which processor produced this result */
  processor: OCRProcessor;
  /** Where the input document came from */
  source: OCRSource;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTERNAL / API TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Raw VLM API response shape (from /api/ocr/pdf).
 * Used internally to transform the server response into OCRResult.
 */
export interface VLMApiResponse {
  text?: string;
  amount?: number | null;
  date?: string | null;
  vatPercent?: number | null;
  confidence?: number;
  rawLines?: string[];
  vlmLines?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
  }>;
  vlmDescription?: string | null;
  error?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Callback for OCR progress updates */
export type OCRProgressCallback = (progress: number) => void;

/** State of the OCR hook */
export interface OCRState {
  /** Whether OCR is currently processing */
  loading: boolean;
  /** Processing progress 0-100 (Tesseract only; VLM is binary) */
  progress: number;
  /** The most recent OCR result, or null */
  result: OCRResult | null;
  /** Error message if processing failed, or null */
  error: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Detect whether a file is a PDF or image based on MIME type and extension.
 */
export function detectInputType(file: File): OCRInputType {
  if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }
  return 'image';
}

/**
 * Create an empty/fallback OCRResult for error cases.
 */
export function createEmptyOCRResult(
  processor: OCRProcessor,
  source: OCRSource = 'unknown',
): OCRResult {
  return {
    amount: null,
    date: null,
    vatPercent: null,
    confidence: 0,
    rawLines: [],
    text: null,
    currency: null,
    description: null,
    lineItems: [],
    processor,
    source,
  };
}
