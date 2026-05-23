/**
 * Invoice PDF Generator
 *
 * Generates professional PDF invoices using pdf-lib.
 * Layout matches the "Udskriv faktura" print view.
 * Includes company branding, line items table, VAT breakdown,
 * and payment information. Supports multiple currencies.
 *
 * SERVER-SIDE ONLY — do not import on the client.
 */

import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { formatNumberForPDF, getCurrencySymbol, getCurrencyConfig } from './currency-utils';
import { logger } from '@/lib/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
}

export interface InvoiceWithDetails {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerAddress?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerCvr?: string | null;
  issueDate: Date | string;
  dueDate: Date | string;
  lineItems: any; // Prisma Json field (already parsed)
  subtotal: number;
  vatTotal: number;
  total: number;
  currency: string;
  exchangeRate?: number | null;
  status: string;
  notes?: string | null;
  // Company info (joined)
  companyInfo?: {
    logo?: string | null;
    companyName: string;
    address: string;
    phone: string;
    email: string;
    cvrNumber: string;
    bankName: string;
    bankAccount: string;
    bankRegistration: string;
    bankIban?: string | null;
    invoiceTerms?: string | null;
  } | null;
}

// ── Color Palette — matches the app's teal theme ────────────────────────────

const COLORS = {
  primary: rgb(0.05, 0.58, 0.53),        // Teal #0d9488
  primaryDark: rgb(0.06, 0.46, 0.43),     // Darker teal #0f766e
  text: rgb(0.12, 0.12, 0.12),           // Near-black #1f2937
  textLight: rgb(0.42, 0.42, 0.42),      // Gray #6b7280
  textMuted: rgb(0.69, 0.66, 0.62),      // Light brown-gray #b0a89e
  border: rgb(0.90, 0.91, 0.92),         // #e5e7eb
  borderLight: rgb(0.95, 0.96, 0.97),    // #f3f4f6
  tableHeader: rgb(0.98, 0.98, 0.98),    // #fafafa
  tableAlt: rgb(0.99, 0.99, 0.99),
  bankBox: rgb(0.98, 0.98, 0.98),        // #f9fafb
  notesBox: rgb(1.0, 0.99, 0.93),        // #fefce8
  white: rgb(1, 1, 1),
  teal10: rgb(0.94, 0.99, 0.98),         // #f0fdfa
};

// ── Layout Constants ─────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28;  // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 60;
const COL_GAP = 40; // Gap between From/To columns

// ── Status Colors ──────────────────────────────────────────────────────────

function getStatusColor(status: string) {
  switch (status) {
    case 'DRAFT': return { bg: rgb(0.95, 0.96, 0.96), text: rgb(0.22, 0.25, 0.29) };      // gray
    case 'SENT': return { bg: rgb(0.86, 0.92, 0.99), text: rgb(0.11, 0.30, 0.85) };       // blue
    case 'PAID': return { bg: rgb(0.86, 0.99, 0.91), text: rgb(0.09, 0.40, 0.20) };       // green
    case 'CANCELLED': return { bg: rgb(1.0, 0.89, 0.89), text: rgb(0.60, 0.11, 0.11) };    // red
    default: return { bg: rgb(0.95, 0.96, 0.96), text: rgb(0.22, 0.25, 0.29) };
  }
}

// ── Main Generator ───────────────────────────────────────────────────────────

export async function generateInvoicePDF(invoice: InvoiceWithDetails): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const currency = invoice.currency || 'DKK';
  const currencyConfig = getCurrencyConfig(currency);
  const currencySymbol = currencyConfig.symbol;
  const parsedItems = parseLineItems(invoice.lineItems);

  // ── Page 1 ──
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  const company = invoice.companyInfo;
  const rightX = PAGE_WIDTH - MARGIN_RIGHT;
  const halfContent = (CONTENT_WIDTH - COL_GAP) / 2;
  const colLeftX = MARGIN_LEFT;
  const colRightX = MARGIN_LEFT + halfContent + COL_GAP;

  // ════════════════════════════════════════════════════════════════════
  // ── HEADER: Logo/company LEFT, "FAKTURA" + invoice# + status RIGHT ─
  // ════════════════════════════════════════════════════════════════════

  let logoBottomY = y;

  // Logo
  if (company?.logo) {
    try {
      const logoPath = path.isAbsolute(company.logo)
        ? company.logo
        : path.join(process.cwd(), company.logo);
      if (existsSync(logoPath)) {
        const logoBytes = await readFile(logoPath);
        let image;
        if (logoPath.toLowerCase().endsWith('.png')) {
          image = await pdfDoc.embedPng(logoBytes);
        } else {
          image = await pdfDoc.embedJpg(logoBytes);
        }
        const logoDims = image.scale(1);
        const maxLogoHeight = 70;
        const maxLogoWidth = 220;
        const scaleW = maxLogoWidth / logoDims.width;
        const scaleH = maxLogoHeight / logoDims.height;
        const scale = Math.min(scaleW, scaleH, 1);
        const w = logoDims.width * scale;
        const h = logoDims.height * scale;
        page.drawImage(image, {
          x: MARGIN_LEFT,
          y: y - h,
          width: w,
          height: h,
        });
        logoBottomY = y - h;
      }
    } catch (err) {
      logger.warn('[PDF] Failed to embed logo:', err);
    }
  }

  // Company name (below logo or as title)
  const companyNameStartY = logoBottomY - 12;
  if (!company?.logo) {
    drawText(page, company?.companyName || '', {
      x: MARGIN_LEFT,
      y: y - 14,
      font: fontBold,
      size: 22,
      color: COLORS.text,
    });
  }

  // Issue date below logo/name
  drawText(page, `Fakturadato: ${formatDate(invoice.issueDate)}`, {
    x: MARGIN_LEFT,
    y: companyNameStartY - 8,
    font: fontRegular,
    size: 9,
    color: COLORS.textLight,
  });

  // ── RIGHT SIDE: Title + number + status ──
  const titleY = y - 14;
  drawText(page, 'FAKTURA', {
    x: rightX,
    y: titleY,
    font: fontBold,
    size: 28,
    color: COLORS.primary,
    align: 'right',
  });

  // Teal underline
  const titleWidth = fontBold.widthOfTextAtSize('FAKTURA', 28);
  page.drawLine({
    start: { x: rightX - titleWidth, y: titleY - 6 },
    end: { x: rightX, y: titleY - 6 },
    thickness: 2.5,
    color: COLORS.primary,
  });

  // Invoice number
  drawText(page, invoice.invoiceNumber, {
    x: rightX,
    y: titleY - 24,
    font: fontBold,
    size: 16,
    color: COLORS.text,
    align: 'right',
  });

  // Status badge
  const statusLabel = mapStatus(invoice.status);
  const statusColors = getStatusColor(invoice.status);
  const statusWidth = fontRegular.widthOfTextAtSize(statusLabel, 10) + 16;
  const badgeH = 16;
  const badgeY = titleY - 40;
  page.drawRectangle({
    x: rightX - statusWidth,
    y: badgeY - 4,
    width: statusWidth,
    height: badgeH,
    color: statusColors.bg,
  });
  drawText(page, statusLabel, {
    x: rightX - statusWidth / 2,
    y: badgeY,
    font: fontRegular,
    size: 10,
    color: statusColors.text,
    align: 'center',
  });

  // ════════════════════════════════════════════════════════════════════
  // ── INFO GRID: "Fra" (left) / "Til" (right) ──
  // ════════════════════════════════════════════════════════════════════

  y = Math.min(companyNameStartY - 8, badgeY - 4) - 28;

  // Divider above info grid
  page.drawLine({
    start: { x: MARGIN_LEFT, y },
    end: { x: rightX, y },
    thickness: 0.75,
    color: COLORS.border,
  });
  y -= 20;

  // ── LEFT COLUMN: "Fra" (From) ──
  drawText(page, 'FRA', {
    x: colLeftX,
    y,
    font: fontBold,
    size: 9,
    color: COLORS.textLight,
  });
  y -= 16;

  drawText(page, company?.companyName || '', {
    x: colLeftX,
    y,
    font: fontBold,
    size: 12,
    color: COLORS.text,
  });
  y -= 14;

  const companyDetails = [
    company?.address,
    company?.phone,
    company?.email,
    company?.cvrNumber ? `CVR: ${company.cvrNumber}` : null,
  ].filter(Boolean) as string[];

  for (const detail of companyDetails) {
    drawText(page, detail, {
      x: colLeftX,
      y,
      font: fontRegular,
      size: 9,
      color: COLORS.textLight,
    });
    y -= 12;
  }

  // ── RIGHT COLUMN: "Til" (To) ──
  let rightColY = y + (companyDetails.length + 1) * 12 + 20; // Align with "FRA" heading

  drawText(page, 'TIL', {
    x: colRightX,
    y: rightColY,
    font: fontBold,
    size: 9,
    color: COLORS.textLight,
  });
  rightColY -= 16;

  drawText(page, invoice.customerName, {
    x: colRightX,
    y: rightColY,
    font: fontBold,
    size: 12,
    color: COLORS.text,
  });
  rightColY -= 14;

  const customerDetails = [
    invoice.customerAddress,
    invoice.customerPhone,
    invoice.customerEmail,
    invoice.customerCvr ? `CVR: ${invoice.customerCvr}` : null,
  ].filter(Boolean) as string[];

  for (const detail of customerDetails) {
    drawText(page, detail, {
      x: colRightX,
      y: rightColY,
      font: fontRegular,
      size: 9,
      color: COLORS.textLight,
    });
    rightColY -= 12;
  }

  // ════════════════════════════════════════════════════════════════════
  // ── LINE ITEMS TABLE ──
  // ════════════════════════════════════════════════════════════════════

  y -= 16;

  const tableLeft = MARGIN_LEFT;
  const tableRight = PAGE_WIDTH - MARGIN_RIGHT;
  const tableWidth = tableRight - tableLeft;

  // Column widths: description | qty | unit price | VAT% | line total
  const colDesc = tableWidth * 0.38;
  const colQty = tableWidth * 0.10;
  const colUnitPrice = tableWidth * 0.18;
  const colVat = tableWidth * 0.10;
  const colTotal = tableWidth * 0.24;

  // Table header background
  page.drawRectangle({
    x: tableLeft,
    y: y - 18,
    width: tableWidth,
    height: 22,
    color: COLORS.tableHeader,
  });

  const headerY = y - 4;
  const headerSize = 8.5;

  drawText(page, 'Beskrivelse', { x: tableLeft + 8, y: headerY, font: fontBold, size: headerSize, color: COLORS.textLight });
  drawText(page, 'Antal', { x: tableLeft + colDesc + 8, y: headerY, font: fontBold, size: headerSize, color: COLORS.textLight, align: 'right', maxWidth: tableLeft + colDesc + colQty - 4 });
  drawText(page, 'Enhedspris', { x: tableLeft + colDesc + colQty + colUnitPrice - 4, y: headerY, font: fontBold, size: headerSize, color: COLORS.textLight, align: 'right' });
  drawText(page, 'Moms %', { x: tableLeft + colDesc + colQty + colUnitPrice + colVat / 2, y: headerY, font: fontBold, size: headerSize, color: COLORS.textLight, align: 'center' });
  drawText(page, 'Beløb', { x: tableRight - 4, y: headerY, font: fontBold, size: headerSize, color: COLORS.textLight, align: 'right' });

  // Header bottom border
  page.drawLine({
    start: { x: tableLeft, y: y - 18 },
    end: { x: tableRight, y: y - 18 },
    thickness: 1.5,
    color: COLORS.border,
  });

  y -= 18;

  // Line items
  const rowHeight = 20;
  const itemFontSize = 9;

  for (let i = 0; i < parsedItems.length; i++) {
    if (y - rowHeight < MARGIN_BOTTOM + 120) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN_TOP;
    }

    const item = parsedItems[i];
    const lineTotal = item.quantity * item.unitPrice;

    // Alternating row background
    if (i % 2 === 1) {
      page.drawRectangle({
        x: tableLeft,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: COLORS.borderLight,
      });
    }

    const rowTextY = y - 6;

    drawText(page, item.description, {
      x: tableLeft + 8,
      y: rowTextY,
      font: fontRegular,
      size: itemFontSize,
      color: COLORS.text,
      maxWidth: colDesc - 16,
    });

    drawText(page, formatNumberForPDF(item.quantity, 0), {
      x: tableLeft + colDesc + colQty - 4,
      y: rowTextY,
      font: fontRegular,
      size: itemFontSize,
      color: COLORS.text,
      align: 'right',
    });

    drawText(page, `${formatNumberForPDF(item.unitPrice)} ${currencySymbol}`, {
      x: tableLeft + colDesc + colQty + colUnitPrice - 4,
      y: rowTextY,
      font: fontRegular,
      size: itemFontSize,
      color: COLORS.text,
      align: 'right',
    });

    drawText(page, `${item.vatPercent}%`, {
      x: tableLeft + colDesc + colQty + colUnitPrice + colVat / 2,
      y: rowTextY,
      font: fontRegular,
      size: itemFontSize,
      color: COLORS.text,
      align: 'center',
    });

    drawText(page, `${formatNumberForPDF(lineTotal)} ${currencySymbol}`, {
      x: tableRight - 4,
      y: rowTextY,
      font: fontBold,
      size: itemFontSize,
      color: COLORS.text,
      align: 'right',
    });

    y -= rowHeight;
  }

  // Table bottom border
  page.drawLine({
    start: { x: tableLeft, y },
    end: { x: tableRight, y },
    thickness: 1,
    color: COLORS.border,
  });

  // ════════════════════════════════════════════════════════════════════
  // ── TOTALS ──
  // ════════════════════════════════════════════════════════════════════

  y -= 24;

  // Subtotal
  drawText(page, 'Subtotal (excl. moms)', {
    x: tableRight - 200,
    y,
    font: fontRegular,
    size: 10,
    color: COLORS.textLight,
    align: 'right',
    maxWidth: tableRight - 4,
  });
  drawText(page, `${formatNumberForPDF(invoice.subtotal)} ${currencySymbol}`, {
    x: tableRight - 4,
    y,
    font: fontRegular,
    size: 10,
    color: COLORS.text,
    align: 'right',
  });
  y -= 16;

  // VAT
  drawText(page, 'Moms', {
    x: tableRight - 200,
    y,
    font: fontRegular,
    size: 10,
    color: COLORS.textLight,
    align: 'right',
    maxWidth: tableRight - 4,
  });
  drawText(page, `${formatNumberForPDF(invoice.vatTotal)} ${currencySymbol}`, {
    x: tableRight - 4,
    y,
    font: fontRegular,
    size: 10,
    color: COLORS.text,
    align: 'right',
  });
  y -= 16;

  // Divider
  page.drawLine({
    start: { x: tableRight - 200, y },
    end: { x: tableRight, y },
    thickness: 0.5,
    color: COLORS.border,
  });
  y -= 18;

  // Grand total
  drawText(page, 'TOTAL', {
    x: tableRight - 200,
    y,
    font: fontBold,
    size: 18,
    color: COLORS.primary,
    align: 'right',
    maxWidth: tableRight - 4,
  });
  drawText(page, `${formatNumberForPDF(invoice.total)} ${currencySymbol}`, {
    x: tableRight - 4,
    y,
    font: fontBold,
    size: 18,
    color: COLORS.primary,
    align: 'right',
  });
  y -= 16;

  // Divider
  page.drawLine({
    start: { x: tableRight - 200, y },
    end: { x: tableRight, y },
    thickness: 0.5,
    color: COLORS.border,
  });
  y -= 14;

  // Due date
  drawText(page, 'Forfaldsdato', {
    x: tableRight - 200,
    y,
    font: fontRegular,
    size: 10,
    color: COLORS.textLight,
    align: 'right',
    maxWidth: tableRight - 4,
  });
  drawText(page, formatDate(invoice.dueDate), {
    x: tableRight - 4,
    y,
    font: fontRegular,
    size: 10,
    color: COLORS.text,
    align: 'right',
  });

  // ── DKK equivalent if foreign currency ──
  if (invoice.exchangeRate && invoice.currency !== 'DKK') {
    y -= 20;
    const dkkEquivalent = Number(invoice.total) * Number(invoice.exchangeRate);
    drawText(page, `Tilsvarende i DKK: ${formatNumberForPDF(dkkEquivalent)} kr. (kurs: ${invoice.exchangeRate.toFixed(4)})`, {
      x: MARGIN_LEFT,
      y,
      font: fontItalic,
      size: 8,
      color: COLORS.textLight,
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // ── BANK INFO BOX ──
  // ════════════════════════════════════════════════════════════════════

  y -= 28;

  const hasBankInfo = company && (company.bankName || company.bankRegistration || company.bankAccount || company.bankIban);

  if (hasBankInfo) {
    drawText(page, 'BETALINGSOPPLYSNINGER', {
      x: MARGIN_LEFT,
      y,
      font: fontBold,
      size: 9,
      color: COLORS.textLight,
    });
    y -= 10;

    // Bank box background
    const bankDetails: string[] = [];
    if (company.bankName) bankDetails.push(`Bank: ${company.bankName}`);
    if (company.bankRegistration) bankDetails.push(`Reg.nr.: ${company.bankRegistration}`);
    if (company.bankAccount) bankDetails.push(`Kontonr.: ${company.bankAccount}`);
    if (company.bankIban) bankDetails.push(`IBAN: ${company.bankIban}`);
    const bankLineCount = bankDetails.length;

    const boxPadding = 14;
    const boxHeight = bankLineCount * 16 + boxPadding * 2 + 4;
    const boxWidth = halfContent;

    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      color: COLORS.bankBox,
      borderColor: COLORS.border,
      borderWidth: 0.5,
    });

    let bankY = y - boxHeight + boxPadding;
    for (const detail of bankDetails) {
      // Split "Bank:", "Reg.nr.:" labels
      const colonIdx = detail.indexOf(':');
      if (colonIdx > 0) {
        const label = detail.substring(0, colonIdx + 1);
        const value = detail.substring(colonIdx + 2);
        drawText(page, label, {
          x: MARGIN_LEFT + boxPadding,
          y: bankY,
          font: fontRegular,
          size: 9,
          color: COLORS.textMuted,
        });
        drawText(page, value, {
          x: MARGIN_LEFT + boxPadding + fontRegular.widthOfTextAtSize(label, 9) + 4,
          y: bankY,
          font: fontRegular,
          size: 9,
          color: COLORS.text,
        });
      } else {
        drawText(page, detail, {
          x: MARGIN_LEFT + boxPadding,
          y: bankY,
          font: fontRegular,
          size: 9,
          color: COLORS.text,
        });
      }
      bankY += 16;
    }

    // Payment reference
    const refLabel = 'Reference:';
    const refValue = invoice.invoiceNumber;
    drawText(page, refLabel, {
      x: MARGIN_LEFT + boxPadding,
      y: bankY + 4,
      font: fontBold,
      size: 9,
      color: COLORS.textMuted,
    });
    drawText(page, refValue, {
      x: MARGIN_LEFT + boxPadding + fontRegular.widthOfTextAtSize(refLabel, 9) + 4,
      y: bankY + 4,
      font: fontBold,
      size: 9,
      color: COLORS.primary,
    });

    // Invoice terms (if any) — right-aligned within the box area
    if (company.invoiceTerms) {
      const termsX = colRightX;
      const termsMaxWidth = halfContent;
      const termsLines = wrapText(company.invoiceTerms, fontRegular, 8.5, termsMaxWidth);
      const termsBoxH = termsLines.length * 12 + boxPadding * 2;

      drawText(page, 'FAKTURABETINGELSER', {
        x: termsX,
        y: y - boxHeight + 18 + boxHeight, // Align with top of bank box
        font: fontBold,
        size: 9,
        color: COLORS.textLight,
      });

      // Position correctly
      const termsStartY = y - boxHeight + 18;
      // We drew the heading at that Y, now draw the box
      page.drawRectangle({
        x: termsX,
        y: termsStartY - termsBoxH - 10,
        width: termsMaxWidth,
        height: termsBoxH,
        color: COLORS.bankBox,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });

      let termY = termsStartY - termsBoxH - 10 + boxPadding;
      for (const line of termsLines) {
        drawText(page, line, {
          x: termsX + boxPadding,
          y: termY,
          font: fontRegular,
          size: 8.5,
          color: COLORS.text,
        });
        termY += 12;
      }

      y = Math.min(y - boxHeight - 4, termsStartY - termsBoxH - 10) - 4;
    } else {
      y -= boxHeight + 4;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ── NOTES BOX ──
  // ════════════════════════════════════════════════════════════════════

  if (invoice.notes) {
    y -= 12;
    drawText(page, 'BEMÆRKNINGER', {
      x: MARGIN_LEFT,
      y,
      font: fontBold,
      size: 9,
      color: COLORS.textLight,
    });
    y -= 10;

    const noteLines = wrapText(invoice.notes, fontRegular, 9, CONTENT_WIDTH - 28);
    const noteBoxH = noteLines.length * 13 + 24;

    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - noteBoxH,
      width: CONTENT_WIDTH,
      height: noteBoxH,
      color: COLORS.notesBox,
      borderColor: rgb(0.95, 0.93, 0.80),
      borderWidth: 0.5,
    });

    let noteY = y - noteBoxH + 12;
    drawText(page, 'Bemærkninger:', {
      x: MARGIN_LEFT + 14,
      y: noteY,
      font: fontBold,
      size: 9,
      color: COLORS.text,
    });
    noteY -= 13;
    for (const line of noteLines) {
      drawText(page, line, {
        x: MARGIN_LEFT + 14,
        y: noteY,
        font: fontRegular,
        size: 9,
        color: COLORS.text,
      });
      noteY -= 13;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ── FOOTER ──
  // ════════════════════════════════════════════════════════════════════

  drawFooter(page, fontBold, fontRegular, fontItalic, pdfDoc.getPageCount());

  // ── Save ──
  return pdfDoc.save();
}

// ── Helper Functions ─────────────────────────────────────────────────────────

function drawText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: typeof COLORS.white;
    align?: 'left' | 'right' | 'center';
    maxWidth?: number;
  }
) {
  const { x, y, font, size, color, align = 'left', maxWidth } = options;
  const textWidth = font.widthOfTextAtSize(text, size);

  if (maxWidth && textWidth > maxWidth) {
    let truncated = text;
    while (font.widthOfTextAtSize(truncated + '...', size) > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    if (truncated.length > 0) {
      const truncatedText = truncated + '...';
      const tWidth = font.widthOfTextAtSize(truncatedText, size);
      let drawX = x;
      if (align === 'right') drawX = x - tWidth;
      else if (align === 'center') drawX = x - tWidth / 2;
      page.drawText(truncatedText, { x: drawX, y, font, size, color });
    }
    return;
  }

  let drawX = x;
  if (align === 'right') drawX = x - textWidth;
  else if (align === 'center') drawX = x - textWidth / 2;

  page.drawText(text, { x: drawX, y, font, size, color });
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: typeof COLORS.white;
    maxWidth?: number;
    lineHeight: number;
  }
) {
  const { x, y, font, size, color, maxWidth, lineHeight } = options;
  const lines = text.split('\n');

  let currentY = y;
  for (const line of lines) {
    if (!line.trim()) {
      currentY -= lineHeight;
      continue;
    }

    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, size);

      if (maxWidth && testWidth > maxWidth && currentLine) {
        page.drawText(currentLine, { x, y: currentY, font, size, color });
        currentY -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, { x, y: currentY, font, size, color });
      currentY -= lineHeight;
    }
  }
}

/**
 * Word-wrap text into lines that fit within maxWidth.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const rawLines = text.split('\n');
  const result: string[] = [];

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      result.push('');
      continue;
    }
    const words = rawLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(testLine, size) > maxWidth && currentLine) {
        result.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) result.push(currentLine);
  }

  return result;
}

function drawFooter(page: PDFPage, fontBold: PDFFont, fontRegular: PDFFont, fontItalic: PDFFont, _pageNum: number) {
  const footerY = MARGIN_BOTTOM - 10;

  // Thin teal line above footer
  page.drawLine({
    start: { x: MARGIN_LEFT, y: footerY + 22 },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: footerY + 22 },
    thickness: 1,
    color: COLORS.primary,
  });

  // Branding
  drawText(page, 'AlphaFlow Regnskab & Bogføring', {
    x: PAGE_WIDTH / 2,
    y: footerY + 10,
    font: fontBold,
    size: 8,
    color: COLORS.primary,
    align: 'center',
  });

  // Generated timestamp
  const generatedStr = `Genereret: ${new Date().toLocaleDateString('da-DK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  drawText(page, generatedStr, {
    x: PAGE_WIDTH / 2,
    y: footerY - 2,
    font: fontRegular,
    size: 7,
    color: COLORS.textLight,
    align: 'center',
  });
}

function parseLineItems(lineItems: any): InvoiceLineItem[] {
  if (Array.isArray(lineItems)) {
    return lineItems.map((item) => ({
      description: item.description || '',
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      vatPercent: Number(item.vatPercent) || 0,
    }));
  }
  return [];
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('da-DK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function mapStatus(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Kladd',
    SENT: 'Sendt',
    PAID: 'Betalt',
    CANCELLED: 'Annulleret',
  };
  return map[status] || status;
}
