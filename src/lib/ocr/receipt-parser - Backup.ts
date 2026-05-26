/**
 * Receipt / Invoice Text Parser
 *
 * Extracts structured data from OCR text output of Danish receipts and invoices.
 *
 * Two modes:
 *   1. Simple receipts — total amount, date, VAT% (legacy)
 *   2. Structured invoices — line items with description, quantity, unit price,
 *      plus date and VAT% (new)
 *
 * Danish invoice table structure detected by:
 *   - "Beløb" column header (or "BELØB")
 *   - Line items between "Beløb" and "Subtotal" (or "Subtotal" / "I alt")
 *
 * Line-item identification rule:
 *   A line in the description area is only a purchase line if it contains
 *   a Danish monetary amount (comma-decimal, thousands-dot, or "kr" suffix).
 *   Text-only lines (no monetary amounts) are accumulated as description
 *   text for the current purchase line.  Small integers like quantity "5" or
 *   VAT "25%" on their own line do NOT trigger a new line item.
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

/** A single line item from an invoice table */
export interface ParsedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
}

/** Full parse result including line items */
export interface ParsedInvoiceResult {
  date: string | null;
  vatPercent: number | null;
  totalAmount: number | null;
  lineItems: ParsedLineItem[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parse raw OCR text from a Danish receipt/invoice (legacy interface).
 *
 * Returns totalAmount, date, and vatPercent. Used by the Tesseract processor
 * for simple receipt OCR.
 */
export function parseReceiptText(text: string | undefined | null): ParsedReceiptFields {
  if (!text || typeof text !== 'string') {
    return { totalAmount: null, date: null, vatPercent: null };
  }

  return {
    date: extractDate(text),
    totalAmount: extractAmount(text),
    vatPercent: extractVAT(text),
  };
}

/**
 * Parse raw OCR text from a Danish invoice (full line-item extraction).
 *
 * Detects the table structure between "Beløb" header and "Subtotal",
 * extracts individual line items with description, quantity, unit price, VAT%.
 * Also extracts the invoice date.
 *
 * Falls back to simple total extraction if no table structure is detected.
 */
export function parseInvoiceText(text: string | undefined | null): ParsedInvoiceResult {
  const empty: ParsedInvoiceResult = {
    date: null,
    vatPercent: null,
    totalAmount: null,
    lineItems: [],
  };

  if (!text || typeof text !== 'string') return empty;

  const date = extractDate(text);
  const vatPercent = extractVAT(text);

  // Try to extract structured line items from table
  const lineItems = extractLineItems(text);

  if (lineItems.length > 0) {
    // Derive total from line items
    const totalAmount = lineItems.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unitPrice;
      const vatAdd = lineTotal * (item.vatPercent / 100);
      return sum + lineTotal + vatAdd;
    }, 0);

    return {
      date,
      vatPercent,
      totalAmount: Math.round(totalAmount * 100) / 100,
      lineItems,
    };
  }

  // Fallback: no table detected, extract simple total
  return {
    date,
    vatPercent,
    totalAmount: extractAmount(text),
    lineItems: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LINE ITEM EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Check whether a line contains a Danish monetary-format number.
 *
 * A "monetary amount" is a number that looks like money:
 *   - Has a comma decimal part: "300,00" or "1.500,00"
 *   - Has thousands-dot separators: "3.000"
 *   - Has "kr" suffix: "500 kr" or "1.500,00 kr."
 *
 * Small bare integers (e.g. "5" for quantity, "25" for percentage)
 * do NOT qualify as monetary amounts on their own.
 */
function hasMonetaryAmount(line: string): boolean {
  // Comma-decimal number (e.g. "300,00" or "1.500,00")
  if (/\d+,\d{1,2}\b/.test(line)) return true;
  // Thousands-dot number with at least 4 digits total (e.g. "1.500" or "10.000")
  if (/\d{1,3}\.\d{3}/.test(line)) return true;
  // "kr" or "DKK" suffix near a number
  if (/\d[\d.,]*\s*kr/i.test(line)) return true;
  return false;
}

/**
 * Check whether a line contains actual descriptive text (words/letters),
 * as opposed to pure numbers, percentages, or empty content.
 *
 * Used to determine when a new line item block starts: a descriptive line
 * after a block that already has monetary data signals a new item.
 */
function isDescriptiveText(line: string): boolean {
  // Remove numbers, %, punctuation, and whitespace
  const stripped = line.replace(/[\d%.,\-–—|\s:/]+/g, '').trim();
  // If there are at least 3 alphabetic characters, it's descriptive text
  return /[a-zA-ZæøåÆØÅäöÄÖ]{3,}/.test(stripped);
}

/**
 * Extract ALL numbers from a line of text (including small integers).
 *
 * Returns numbers in left-to-right order of appearance.
 * Skips year-like numbers (1990-2100) that lack comma/dot separators.
 */
function extractAllNumbers(line: string): number[] {
  const numbers: number[] = [];
  const pattern = /(\d[\d.,]*)/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    const raw = match[1];
    const num = parseDanishNumber(raw);
    if (num !== null && num > 0 && num < 10000000) {
      // Skip year-like 4-digit integers with no decimal/thousands markers
      if (num >= 1990 && num <= 2100 && !raw.includes('.') && !raw.includes(',')) {
        continue;
      }
      numbers.push(num);
    }
  }

  return numbers;
}

/**
 * Extract line items from a Danish invoice table.
 *
 * Strategy (block-based grouping for Tesseract column-split output):
 *   1. Find the "Beløb" (or "BELØB") column header row
 *   2. Collect all content lines between header and subtotal
 *   3. Group lines into "blocks" — each block = one logical line item.
 *      A new block starts when we see descriptive text after a block
 *      that already contains monetary data.
 *   4. Each block is joined into one string and parsed for
 *      description, quantity, unit price, and VAT%.
 *
 * This correctly handles invoices where Tesseract splits table columns
 * across multiple output lines, e.g.:
 *     Konsulentydelse - Rådgivning ifm. AI ...
 *     5
 *     1.500,00 kr.
 *     25%
 *     7.500,00 kr.
 * All these lines belong to the same block (same invoice row).
 *
 * And it correctly handles multiple line items:
 *     Webhosting  1  500,00  25%  500,00
 *     Domæne  2  150,00  25%  300,00
 * "Domæne" is descriptive text, and the previous block already had monetary
 * data, so it starts a new block.
 */
function extractLineItems(text: string): ParsedLineItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Find the "Beløb" header row index
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/BELØB|Beløb/i.test(lines[i])) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  // Collect content lines between header and subtotal
  const contentLines: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (/^(?:Subtotal|I alt|Moms i alt|Total|At betale|Forfaldsdato|BANKDETAILER|BETINGELSER|BETALING)/i.test(lines[i])) {
      break;
    }
    contentLines.push(lines[i]);
  }

  if (contentLines.length === 0) return [];

  // ── Group lines into blocks ──
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let blockHasMonetary = false;

  for (const line of contentLines) {
    const monetary = hasMonetaryAmount(line);
    const descriptive = isDescriptiveText(line);

    if (descriptive && blockHasMonetary && currentBlock.length > 0) {
      // New descriptive text after monetary data → start a new block
      blocks.push(currentBlock);
      currentBlock = [line];
      blockHasMonetary = monetary;
    } else {
      currentBlock.push(line);
      if (monetary) blockHasMonetary = true;
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // ── Parse each block into a line item ──
  const items: ParsedLineItem[] = [];
  const defaultVat = extractVAT(text) ?? 25;

  for (const block of blocks) {
    const combined = block.join(' ');
    if (hasMonetaryAmount(combined)) {
      const item = parseSingleLineItem(combined, defaultVat);
      if (item) items.push(item);
    }
  }

  return items;
}

/**
 * Parse a single line item from combined text.
 *
 * `combined` is all lines of one block joined with spaces, e.g.:
 * "Konsulentydelse - Rådgivning ifm. AI i arbejdsgangen 5 25% 1.500,00 kr. 7.500,00 kr."
 *
 * Extracts description, quantity, unit price, and VAT%.
 */
function parseSingleLineItem(combined: string, defaultVat: number): ParsedLineItem | null {
  // Extract VAT % if present
  const vatMatch = combined.match(/(\d+)\s*%/);
  const lineVat = vatMatch ? parseInt(vatMatch[1], 10) : defaultVat;

  // Extract ALL numbers from the combined text
  const allNumbers = extractAllNumbers(combined);

  // Remove the VAT percentage value from the number list (it's not a monetary amount)
  const monetaryNums = allNumbers.filter((n) => n !== lineVat);

  // Extract description: text before the first digit
  const descMatch = combined.match(/^(.*?)(?=\d)/);
  const description = descMatch
    ? descMatch[1]
        .replace(/[|\-–—]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200)
    : '';

  if (monetaryNums.length === 0) return null;

  // ── Determine quantity and unit price from available numbers ──
  if (monetaryNums.length >= 3) {
    // Full row: likely [quantity, unitPrice, ..., total]
    // Try: values[0] = qty, values[1] = unitPrice, values[last] = total
    const qty = monetaryNums[0];
    const unitPrice = monetaryNums[1];
    const total = monetaryNums[monetaryNums.length - 1];

    // Validate: total ≈ qty × unitPrice (within 5% for rounding)
    const expected = qty * unitPrice;
    if (
      qty >= 1 &&
      qty < 10000 &&
      unitPrice > 0 &&
      total > 0 &&
      Math.abs(expected - total) < Math.max(expected, total) * 0.05
    ) {
      return { description, quantity: qty, unitPrice, vatPercent: lineVat };
    }

    // Fallback: maybe values[0] isn't quantity. Try qty=1
    return { description, quantity: 1, unitPrice: monetaryNums[0], vatPercent: lineVat };
  }

  if (monetaryNums.length === 2) {
    // Two values: could be qty + unitPrice, or unitPrice + total
    const first = monetaryNums[0];
    const second = monetaryNums[1];

    // If first < 1000 and >= 1, and second >= first → likely qty + unitPrice
    if (first >= 1 && first < 1000 && second >= first) {
      return { description, quantity: first, unitPrice: second, vatPercent: lineVat };
    }

    // Otherwise treat as qty=1, unitPrice = first
    return { description, quantity: 1, unitPrice: first, vatPercent: lineVat };
  }

  // Single value: treat as unit price (qty = 1)
  return {
    description,
    quantity: 1,
    unitPrice: monetaryNums[0],
    vatPercent: lineVat,
  };
}

/**
 * Parse a Danish-formatted number string to a float.
 * Handles:
 *   "3.000,00" → 3000.00  (dot = thousands, comma = decimal)
 *   "300,00"   → 300.00
 *   "3.000"    → 3000.00
 *   "300"      → 300.00
 *   "1500,00"  → 1500.00  (no thousands separator)
 */
function parseDanishNumber(str: string): number | null {
  if (!str) return null;
  try {
    // Remove any trailing non-numeric chars (kr., DKK, etc.)
    const cleaned = str.replace(/[^\d.,\-]/g, '');
    if (!cleaned) return null;

    // If it has a comma, the comma is the decimal separator
    // Remove dots (thousands separator), replace comma with dot
    let normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATE EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Danish month name mapping */
const DANISH_MONTHS: Record<string, number> = {
  jan: 1, januar: 1, january: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, marts: 3, march: 3,
  apr: 4, april: 4,
  maj: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function extractDate(text: string): string | null {
  const patterns = [
    // DD. MMM YYYY (Danish: "19. apr. 2026" or "19. april 2026")
    /(\d{1,2})\.\s+([a-zæøå]+)\.?\s+(\d{4})/i,
    // DD MMM YYYY (no dot: "19 april 2026")
    /(\d{1,2})\s+([a-zæøå]+)\s+(\d{4})/i,
    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
    // YYYY-MM-DD (ISO)
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = normalizeDate(match[0], match);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Normalize a date string to YYYY-MM-DD format.
 * @param dateStr - The matched date string
 * @param groups - The regex match groups (for extracting month names)
 */
function normalizeDate(dateStr: string | undefined, groups?: RegExpMatchArray): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  try {
    // DD. MMMM YYYY (Danish named month)
    if (groups && groups.length >= 4) {
      const day = parseInt(groups[1], 10);
      const monthName = groups[2].toLowerCase().replace('.', '');
      const year = parseInt(groups[3], 10);
      const month = DANISH_MONTHS[monthName];
      if (month && day >= 1 && day <= 31 && year >= 1990 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

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
  // Process line-by-line to prevent regex \s from matching across newlines.
  // Use [:\s]+ instead of [^:]* to avoid greedy consumption of numbers.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // ── Phase 1: High-priority TOTAL-line patterns ──
  const totalLinePatterns = [
    // "TOTAL 1.000,00 kr." or "Total: 9.375,00" or "total 9375,00 DKK"
    /(?:TOTAL|Total|total)[:\s]+(?:kr\.?\s*)?(?:DKK\s*)?(\d[\d.,]+)/i,
    // "1.000,00 kr total" (amount before keyword)
    /(\d[\d.,]+)\s*kr\.?\s*(?:total|TOTAL|Total)/i,
    // "SUM 1.000,00" or "Sum: 800,00"
    /(?:SUM|Sum|sum)[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)/i,
    // "at betale 1.000,00 kr." or "At betale: 9375"
    /at\s+betale[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)/i,
    // "i alt 1.000,00 kr." or "I alt: 9.375,00"
    /i\s+alt[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)/i,
  ];

  for (const pattern of totalLinePatterns) {
    let lastAmount: number | null = null;
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const amount = parseDanishNumber(match[1]);
        if (amount !== null && amount > 0) {
          lastAmount = amount;
        }
      }
    }
    if (lastAmount !== null) return lastAmount;
  }

  // ── Phase 2: Fallback — largest monetary amount ──
  const fallbackPatterns = [
    /dkk\s*(\d[\d.,]+)/i,
    /kr\.?\s*(\d[\d.,]+)/i,
    /(?:pris|price|amount)[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)/i,
  ];

  const allAmounts: number[] = [];
  for (const pattern of fallbackPatterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const amount = parseDanishNumber(match[1]);
        if (amount !== null && amount > 0) {
          allAmounts.push(amount);
        }
      }
    }
  }

  if (allAmounts.length > 0) {
    allAmounts.sort((a, b) => b - a);
    return allAmounts[0];
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VAT EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractVAT(text: string): number | null {
  // Process line-by-line to prevent regex \s from matching across newlines.
  //
  // Pattern design principles:
  //   - Use [:\s]+ instead of [^:]* to avoid greedy partial-number matches
  //   - Require "moms" or "vat" keyword on the SAME line as the percentage
  //   - The "MOMS %" column header is safely ignored (no digit before %)
  //   - Standalone "25%" without "moms"/"vat" is ignored (falls through to default)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Pattern 1: "25% moms" or "25 % vat" — percentage then keyword
  const pPercentBefore = /(\d+)\s*%\s*(?:moms|vat)/i;
  // Pattern 2: "moms: 25%" — keyword colon then percentage
  const pMomsColon = /moms\s*:\s*(\d+)\s*%/i;
  // Pattern 3: "moms (25%)" or "moms i alt (25%)" — percentage in parentheses
  const pMomsParen = /moms[^(]*\((\d+)%\)/i;
  // Pattern 4: "moms 25%" — keyword space then percentage (no colon)
  const pMomsSpace = /moms\s+(\d+)\s*%/i;
  // Pattern 5: "vat: 25%" or "vat 25%"
  const pVatAny = /vat\s*:?\s*(\d+)\s*%/i;

  const patterns = [pPercentBefore, pMomsColon, pMomsParen, pMomsSpace, pVatAny];

  for (const pattern of patterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        const value = parseFloat((match[1] || '0').replace(',', '.'));
        if (!isNaN(value) && value > 0 && value <= 100) {
          return value; // Valid percentage (1-100)
        }
      }
    }
  }

  // Default to 25% for Danish receipts/invoices with no explicit VAT percentage
  const danishIndicators = ['moms', 'kr', 'dkk', 'betale', 'kontant', 'dankort', 'faktura'];
  if (danishIndicators.some((ind) => text.toLowerCase().includes(ind))) {
    return 25;
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
