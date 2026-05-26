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
 * Extract line items from a Danish invoice table.
 *
 * Strategy:
 *   1. Find the "Beløb" (or "BELØB") column header row
 *   2. Scan lines after it until "Subtotal" / "Subtotal" / "I alt subtotal"
 *   3. Each line between those markers is a line item
 *   4. Parse quantity, unit price, and total from the amounts on each line
 *
 * Danish invoice table format:
 *   BESKRIVELSE AF VARE/YDELSE | ANTAL | ENHEDSPRIS | MOMS % | BELØB
 *   Ting                       | 10    | 300,00    | 25%    | 3.000,00
 *   Subtotal                   |       |           |        | 3.000,00
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

  // Scan lines after the header until we hit a subtotal/total marker
  const items: ParsedLineItem[] = [];
  const defaultVat = extractVAT(text) ?? 25;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop at subtotal / total markers
    if (/^(?:Subtotal|I alt|Moms i alt|Total|At betale|Forfaldsdato|BANKDETAILER|BETINGELSER|BETALING)/i.test(line)) {
      break;
    }

    // Extract all amounts from this line (Danish format: 3.000,00 or 300,00)
    const amounts = extractAmountsFromLine(line);
    if (amounts.length === 0) continue;

    // Try to determine the structure from the amounts:
    //
    // For a line like: "Ting  10  300,00 kr.  25%  3.000,00 kr."
    //   amounts = [10, 300, 3000]
    //   description = "Ting", quantity = 10, unitPrice = 300, total = 3000
    //
    // For a line like: "Ting  300,00 kr."
    //   amounts = [300]
    //   description = "Ting", quantity = 1, unitPrice = 300

    // Extract VAT % if present on the line
    const vatMatch = line.match(/(\d+)\s*%/);
    const lineVat = vatMatch ? parseInt(vatMatch[1], 10) : defaultVat;

    // Extract description (everything before the first number on the line)
    const descMatch = line.match(/^(.*?)(?=\d)/);
    const description = descMatch
      ? descMatch[1].replace(/[|\-–—]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
      : line.slice(0, 80).trim();

    if (amounts.length >= 3) {
      // Full row: description | quantity | unitPrice | [vat%] | total
      // The first small number is quantity, next is unit price, last is total
      const quantity = amounts[0];
      const unitPrice = amounts[1];
      // Validate: total should be approx quantity * unitPrice (allow for rounding)
      const expectedTotal = quantity * unitPrice;
      const actualTotal = amounts[amounts.length - 1];

      if (Math.abs(expectedTotal - actualTotal) < expectedTotal * 0.05) {
        items.push({ description, quantity, unitPrice, vatPercent: lineVat });
      } else if (amounts.length >= 2) {
        // If the total doesn't match, maybe amounts[0] isn't quantity
        // Try: unitPrice = amounts[0], total = amounts[1], quantity = 1
        items.push({ description, quantity: 1, unitPrice: amounts[0], vatPercent: lineVat });
      } else {
        items.push({ description, quantity: 1, unitPrice: actualTotal, vatPercent: lineVat });
      }
    } else if (amounts.length === 2) {
      // Two amounts: could be quantity + unitPrice, or unitPrice + total
      // Heuristic: if first amount < 1000 and second amount is roughly first * N, first is qty
      if (amounts[0] < 1000 && amounts[0] >= 1 && amounts[1] >= amounts[0]) {
        const qty = amounts[0];
        const unitPrice = Math.round((amounts[1] / qty) * 100) / 100;
        items.push({ description, quantity: qty, unitPrice, vatPercent: lineVat });
      } else {
        // Otherwise: treat as unitPrice + total (qty = 1)
        items.push({ description, quantity: 1, unitPrice: amounts[0], vatPercent: lineVat });
      }
    } else if (amounts.length === 1) {
      // Single amount: treat as unit price (quantity = 1)
      items.push({
        description,
        quantity: 1,
        unitPrice: amounts[0],
        vatPercent: lineVat,
      });
    }
  }

  return items;
}

/**
 * Extract all monetary amounts from a single line.
 * Handles Danish format: "3.000,00" (thousands separator = dot, decimal = comma)
 * Also handles plain numbers with optional "kr." suffix.
 *
 * Returns amounts sorted by position in the line (left to right).
 */
function extractAmountsFromLine(line: string): number[] {
  const amounts: number[] = [];

  // Pattern: Danish number format with optional "kr." suffix
  // Matches: 3.000,00  /  300,00  /  3.000  /  300
  const pattern = /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    const raw = match[1];
    const num = parseDanishNumber(raw);
    if (num !== null && num > 0 && num < 10000000) {
      // Skip if this number looks like a year (2026, 2024, etc.)
      if (num >= 1990 && num <= 2100 && raw.indexOf('.') === -1 && raw.indexOf(',') === -1) {
        continue;
      }
      amounts.push(num);
    }
  }

  return amounts;
}

/**
 * Parse a Danish-formatted number string to a float.
 * Handles:
 *   "3.000,00" → 3000.00  (dot = thousands, comma = decimal)
 *   "300,00"   → 300.00
 *   "3.000"    → 3000.00
 *   "300"      → 300.00
 */
function parseDanishNumber(str: string): number | null {
  if (!str) return null;
  try {
    // If it has a comma, the comma is the decimal separator
    // Remove dots (thousands separator), replace comma with dot
    let normalized = str.replace(/\./g, '').replace(',', '.');
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
  // ── Phase 1: High-priority TOTAL-line patterns ──
  const totalLinePatterns = [
    /(?:TOTAL|Total|total)[^:]*:?\s*(?:kr\.?\s*)?(?:DKK\s*)?(\d[\d.,]+)\s*(?:kr)?(?:\s*DKK)?/gi,
    /kr\.?\s*(\d[\d.,]+)\s*(?:total|TOTAL|Total)/gi,
    /(?:SUM|Sum|sum)[^:]*:?\s*(?:kr\.?\s*)?(\d[\d.,]+)\s*(?:kr)?/gi,
    /at\s+betale[^:]*:?\s*(?:kr\.?\s*)?(\d[\d.,]+)/gi,
    /i\s*alt[^:]*:?\s*(?:kr\.?\s*)?(\d[\d.,]+)/gi,
  ];

  for (const pattern of totalLinePatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    let lastAmount: number | null = null;
    while ((match = regex.exec(text)) !== null) {
      const amount = parseDanishNumber(match[1]);
      if (amount !== null && amount > 0) {
        lastAmount = amount;
      }
    }
    if (lastAmount !== null) return lastAmount;
  }

  // ── Phase 2: Fallback — largest monetary amount ──
  const fallbackPatterns = [
    /dkk\s*(\d[\d.,]+)/gi,
    /kr\.?\s*(\d[\d.,]+)/gi,
    /(?:pris|price|amount)[^:]*:?\s*(?:kr\.?\s*)?(\d[\d.,]+)/gi,
  ];

  const allAmounts: number[] = [];
  for (const pattern of fallbackPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      const amount = parseDanishNumber(match[1]);
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VAT EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractVAT(text: string): number | null {
  const patterns = [
    /(\d+)\s*%\s*(?:moms|vat)/gi,
    /moms[^:]*:?\s*(\d+(?:[.,]\d+)?)\s*%/gi,
    /vat[^:]*:?\s*(\d+(?:[.,]\d+)?)\s*%/gi,
    /moms\s+(?:i alt)[^:]*:?\s*(?:kr\.?\s*)?(\d[\d.,]+)/gi,
    /moms[^:]*:?\s*(?:kr\.?\s*)?(\d[\d.,]+)/gi,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let vatMatch;
    while ((vatMatch = regex.exec(text)) !== null) {
      const value = parseFloat((vatMatch[1] || '0').replace(',', '.'));
      if (!isNaN(value) && value <= 100 && value >= 0) {
        return value; // Percentage (0-100)
      }
      break;
    }
  }

  // Default to 25% for Danish receipts with no explicit VAT
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
