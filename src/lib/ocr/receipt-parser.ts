/**
 * Receipt Text Parser
 *
 * Extracts structured data (amount, date, VAT%) from OCR text output.
 * Optimized for Danish receipts and invoices.
 *
 * Extracted from the original ocr-utils.ts to be a standalone, reusable
 * parser that doesn't depend on any OCR engine.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Parsed fields from receipt text */
export interface ParsedReceiptFields {
  totalAmount: number | null;
  date: string | null;
  vatPercent: number | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parse raw OCR text from a Danish receipt/invoice.
 *
 * Extracts three fields:
 *   1. Date — supports DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD,
 *      and Danish month names (26 marts 2024)
 *   2. Total amount — high-priority "TOTAL" lines first, then falls back
 *      to largest monetary amount found
 *   3. VAT percentage — explicit "Moms 25%" or derived from amount
 *
 * Danish context heuristics:
 *   - Keywords: "At betale", "I alt", "Moms", "Kr", "DKK", "Beløb"
 *   - If Danish indicators are present but no VAT found, defaults to 25%
 */
export function parseReceiptText(text: string | undefined | null): ParsedReceiptFields {
  if (!text || typeof text !== 'string') {
    return { totalAmount: null, date: null, vatPercent: null };
  }

  const result: ParsedReceiptFields = {
    totalAmount: null,
    date: null,
    vatPercent: null,
  };

  result.date = extractDate(text);
  result.totalAmount = extractAmount(text);
  result.vatPercent = extractVAT(text, result.totalAmount);

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATE EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractDate(text: string): string | null {
  const patterns = [
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/gi,
    // YYYY-MM-DD (ISO)
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/gi,
    // DD MMM YYYY (Danish/English month names)
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)\s+(\d{2,4})/gi,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = normalizeDate(match[0]);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Normalize a date string to YYYY-MM-DD format.
 */
function normalizeDate(dateStr: string | undefined | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  try {
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = dateStr.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);
    if (dmyMatch) {
      const day = (dmyMatch[1] || '').padStart(2, '0');
      const month = (dmyMatch[2] || '').padStart(2, '0');
      let year = dmyMatch[3] || '';
      if (year.length === 2) year = `20${year}`;
      return `${year}-${month}-${day}`;
    }

    // YYYY-MM-DD
    const isoMatch = dateStr.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/i);
    if (isoMatch) {
      const year = isoMatch[1] || '';
      const month = (isoMatch[2] || '').padStart(2, '0');
      const day = (isoMatch[3] || '').padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AMOUNT EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractAmount(text: string): number | null {
  // ── Phase 1: High-priority TOTAL-line patterns ──
  const totalLinePatterns = [
    /at\s+betale[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
    /(?:TOTAL|Total|total)[^:]*:?\s*(?:kr\.?\s*)?(?:DKK\s*)?(\d+(?:[.,]\d{1,2}))\s*(?:kr)?(?:\s*DKK)?/gi,
    /kr\.?\s*(\d+(?:[.,]\d{1,2}))\s*(?:total|TOTAL|Total)/gi,
    /(?:SUM|Sum|sum)[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))\s*(?:kr)?/gi,
    /i\s*alt[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
    /beløb[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
  ];

  for (const pattern of totalLinePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    let lastAmount: number | null = null;
    while ((match = regex.exec(text)) !== null) {
      const amount = parseAmountString(match[1]);
      if (amount !== null && amount > 0) {
        lastAmount = amount;
      }
    }
    if (lastAmount !== null) return lastAmount;
  }

  // ── Phase 2: Fallback — largest monetary amount ──
  const fallbackPatterns = [
    /dkk\s*(\d+(?:[.,]\d{1,2}))/gi,
    /kr\.?\s*(\d+(?:[.,]\d{1,2}))/gi,
    /(?:pris|price|amount)[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
  ];

  const allAmounts: number[] = [];
  for (const pattern of fallbackPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const amount = parseAmountString(match[1]);
      if (amount !== null && amount > 0) {
        allAmounts.push(amount);
      }
    }
  }

  if (allAmounts.length > 0) {
    allAmounts.sort((a, b) => b - a);
    return allAmounts[0];
  }

  return null;
}

/**
 * Parse an amount string to number (handles comma/dot decimal separators).
 */
function parseAmountString(amountStr: string | undefined): number | null {
  if (!amountStr || typeof amountStr !== 'string') return null;
  try {
    const normalized = amountStr.replace(',', '.');
    const amount = parseFloat(normalized);
    return isNaN(amount) ? null : amount;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VAT EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractVAT(text: string, totalAmount: number | null): number | null {
  const patterns = [
    /moms[^:]*:?\s*(\d+(?:[.,]\d+)?)\s*%?/gi,
    /vat[^:]*:?\s*(\d+(?:[.,]\d+)?)\s*%?/gi,
    /(\d+(?:[.,]\d+)?)\s*%\s*(?:moms|vat)/gi,
    /moms[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
    /moms\s+(?:udgør|amount)[^:]*:?\s*(?:kr\.?\s*)?(\d+(?:[.,]\d{1,2}))/gi,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let vatMatch;
    while ((vatMatch = regex.exec(text)) !== null) {
      const value = parseFloat((vatMatch[1] || '0').replace(',', '.'));
      if (!isNaN(value) && value <= 100 && value >= 0) {
        return value; // Percentage (0-100)
      } else if (!isNaN(value) && value > 100 && totalAmount) {
        // VAT amount >100 DKK — derive percentage from total
        const netAmount = totalAmount - value;
        if (netAmount > 0) {
          return Math.round((value / netAmount) * 100);
        }
      }
      break;
    }
    // Check if we already found a VAT value in the loop above
    // (the break inside the while exits the inner loop, not the for)
  }

  // Default to 25% for Danish receipts with no explicit VAT
  if (totalAmount !== null) {
    const danishIndicators = ['moms', 'kr', 'dkk', 'betale', 'kontant', 'dankort'];
    if (danishIndicators.some((ind) => text.toLowerCase().includes(ind))) {
      return 25;
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Format a number as Danish currency (e.g. "1.234,56 kr.").
 */
export function formatDanishCurrency(amount: number): string {
  return amount.toLocaleString('da-DK', {
    style: 'currency',
    currency: 'DKK',
  });
}

/**
 * Get today's date in ISO format (YYYY-MM-DD).
 */
export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}
