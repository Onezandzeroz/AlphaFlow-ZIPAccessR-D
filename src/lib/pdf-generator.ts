/**
 * Invoice PDF Generator
 *
 * Generates professional PDF invoices using pdf-lib.
 * Layout matches the "Udskriv faktura" print view.
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
  lineItems: any;
  subtotal: number;
  vatTotal: number;
  total: number;
  currency: string;
  exchangeRate?: number | null;
  status: string;
  notes?: string | null;
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
    bankStreet?: string | null;
    bankCity?: string | null;
    bankCountry?: string | null;
    invoiceTerms?: string | null;
  } | null;
}

// ── Colors ───────────────────────────────────────────────────────────────────

const C = {
  teal:       rgb(0.051, 0.58, 0.533),   // #0d9488
  tealDark:   rgb(0.059, 0.464, 0.431),  // #0f766e
  text:       rgb(0.122, 0.122, 0.122),  // #1f2937
  textMid:    rgb(0.420, 0.420, 0.420),  // #6b7280
  textMuted:  rgb(0.690, 0.659, 0.620),  // #b0a89e
  border:     rgb(0.898, 0.902, 0.906),  // #e5e7eb
  borderLt:   rgb(0.953, 0.953, 0.953),  // #f3f4f6
  headerBg:   rgb(0.976, 0.976, 0.976),  // #f9fafb
  bankBg:     rgb(0.976, 0.976, 0.976),  // #f9fafb
  notesBg:    rgb(1.0, 0.992, 0.922),    // #fefce8
  white:      rgb(1, 1, 1),
};

// ── Layout ───────────────────────────────────────────────────────────────────

const PW = 595.28;
const PH = 841.89;
const ML = 50;           // margin left
const MR = 50;           // margin right
const CW = PW - ML - MR; // content width
const MT = 40;           // margin top
const MB = 50;           // margin bottom (footer space)
const COL_GAP = 40;
const HALF = (CW - COL_GAP) / 2;

// ── Status colors ───────────────────────────────────────────────────────────

function statusColor(s: string) {
  const m: Record<string, { bg: typeof C.white; fg: typeof C.text }> = {
    DRAFT:     { bg: rgb(0.953, 0.957, 0.957), fg: rgb(0.216, 0.251, 0.290) },
    SENT:      { bg: rgb(0.859, 0.922, 0.992), fg: rgb(0.110, 0.302, 0.851) },
    PAID:      { bg: rgb(0.863, 0.992, 0.906), fg: rgb(0.086, 0.396, 0.204) },
    CANCELLED: { bg: rgb(1.0, 0.894, 0.894), fg: rgb(0.600, 0.110, 0.110) },
  };
  return m[s] || m.DRAFT;
}

// ── Logo loader ──────────────────────────────────────────────────────────────

async function loadLogoBytes(logoRef: string): Promise<Buffer | null> {
  if (!logoRef) return null;

  // 1) Base64 data URL
  if (logoRef.startsWith('data:')) {
    const comma = logoRef.indexOf(',');
    if (comma === -1) return null;
    const b64 = logoRef.slice(comma + 1);
    return Buffer.from(b64, 'base64');
  }

  // 2) HTTP / HTTPS URL
  if (logoRef.startsWith('http://') || logoRef.startsWith('https://')) {
    try {
      const res = await fetch(logoRef, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    } catch (e) { logger.warn('[PDF] Logo fetch failed:', e); return null; }
  }

  // 3) Local file path
  const lp = path.isAbsolute(logoRef) ? logoRef : path.join(/*turbopackIgnore: true*/ process.cwd(), logoRef);
  if (existsSync(lp)) {
    return readFile(lp);
  }

  logger.warn(`[PDF] Logo not found at: ${lp}`);
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function generateInvoicePDF(inv: InvoiceWithDetails): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fR = await doc.embedFont(StandardFonts.Helvetica);
  const fB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fI = await doc.embedFont(StandardFonts.HelveticaOblique);

  const cur = inv.currency || 'DKK';
  const sym = getCurrencyConfig(cur).symbol;
  const items = parseItems(inv.lineItems);
  const co = inv.companyInfo;

  let pg = doc.addPage([PW, PH]);
  let y = PH - MT;

  const RX = PW - MR;
  const C1 = ML;                        // left column X
  const C2 = ML + HALF + COL_GAP;       // right column X

  // ══════════════════════════════════════════════════════════
  //  HEADER
  // ══════════════════════════════════════════════════════════

  // Logo (left side)
  let headerBottom = y;
  if (co?.logo) {
    try {
      const logoBuf = await loadLogoBytes(co.logo);
      if (logoBuf) {
        const img = co.logo.includes('image/png') || co.logo.endsWith('.png')
          ? await doc.embedPng(logoBuf)
          : await doc.embedJpg(logoBuf);
        const d = img.scale(1);
        const s = Math.min(70 / d.height, 220 / d.width, 1);
        const w = d.width * s, h = d.height * s;
        pg.drawImage(img, { x: ML, y: y - h, width: w, height: h });
        headerBottom = y - h;
      }
    } catch (e) { logger.warn('[PDF] Logo embed failed:', e); }
  }

  // Company name fallback (no logo)
  if (!co?.logo && co?.companyName) {
    txt(pg, co.companyName, ML, y - 16, fB, 20, C.text);
    headerBottom = y - 36;
  }

  // Invoice date below logo/company name
  txt(pg, `Fakturadato: ${fmtDate(inv.issueDate)}`, ML, headerBottom - 10, fR, 9, C.textMid);

  // ── Right side: FAKTURA + number + status badge ──

  const tY = y - 18;
  txt(pg, 'FAKTURA', RX, tY, fB, 28, C.teal, 'right');

  // Teal underline
  const tw = fB.widthOfTextAtSize('FAKTURA', 28);
  pg.drawLine({ start: { x: RX - tw, y: tY - 6 }, end: { x: RX, y: tY - 6 }, thickness: 2.5, color: C.teal });

  // Invoice number
  txt(pg, inv.invoiceNumber, RX, tY - 28, fB, 16, C.text, 'right');

  // Status badge
  const stLabel = mapStatus(inv.status);
  const stC = statusColor(inv.status);
  const stW = fR.widthOfTextAtSize(stLabel, 9.5) + 20;
  const badgeY = tY - 46;
  pg.drawRectangle({ x: RX - stW, y: badgeY - 5, width: stW, height: 17, color: stC.bg });
  txt(pg, stLabel, RX - stW / 2, badgeY, fR, 9.5, stC.fg, 'center');

  // ══════════════════════════════════════════════════════════
  //  INFO GRID: FRA (left) / TIL (right)
  // ══════════════════════════════════════════════════════════

  // Divider
  const gridTop = Math.min(headerBottom - 10, badgeY - 5) - 24;
  pg.drawLine({ start: { x: ML, y: gridTop }, end: { x: RX, y: gridTop }, thickness: 0.75, color: C.border });

  y = gridTop - 18;

  // Both columns start at the same Y
  const colStartY = y;

  // LEFT: SÆLGER
  let ly = colStartY;
  txt(pg, 'SÆLGER', C1, ly, fB, 9, C.textMid); ly -= 15;
  txt(pg, co?.companyName || '', C1, ly, fB, 12, C.text); ly -= 13;
  const coInfo = [co?.address, co?.phone, co?.email, co?.cvrNumber ? `CVR: ${co.cvrNumber}` : null].filter(Boolean) as string[];
  for (const d of coInfo) {
    for (const line of d.split('\n').filter(Boolean)) { txt(pg, line, C1, ly, fR, 9, C.textMid); ly -= 11; }
  }

  // RIGHT: KØBER
  let ry = colStartY;
  txt(pg, 'KØBER', C2, ry, fB, 9, C.textMid); ry -= 15;
  txt(pg, inv.customerName, C2, ry, fB, 12, C.text); ry -= 13;
  const cuInfo = [inv.customerAddress, inv.customerPhone, inv.customerEmail, inv.customerCvr ? `CVR: ${inv.customerCvr}` : null].filter(Boolean) as string[];
  for (const d of cuInfo) {
    for (const line of d.split('\n').filter(Boolean)) { txt(pg, line, C2, ry, fR, 9, C.textMid); ry -= 11; }
  }

  // y = lowest of both columns
  y = Math.min(ly, ry);

  // ══════════════════════════════════════════════════════════
  //  LINE ITEMS TABLE
  // ══════════════════════════════════════════════════════════

  y -= 20;
  const TL = ML, TR = RX, TW = TR - TL;

  // Column widths (sum = 1.0)
  const cD = TW * 0.38;   // description
  const cQ = TW * 0.10;   // quantity
  const cP = TW * 0.17;   // unit price
  const cV = TW * 0.10;   // vat %
  const cT = TW * 0.25;   // line total

  // Column edge X positions
  const xQ = TL + cD;           // start of quantity col
  const xP = xQ + cQ;           // start of unit price col
  const xV = xP + cP;           // start of vat col
  const xT = xV + cV;           // start of amount col (end = TR)

  // Header row
  const hH = 24; // header row height
  pg.drawRectangle({ x: TL, y: y - hH, width: TW, height: hH, color: C.headerBg });
  const hY = y - hH / 2 - 3; // vertically center baseline (approximate)
  const hS = 8.5;

  txt(pg, 'Beskrivelse', TL + 10, hY, fB, hS, C.textMid);
  txt(pg, 'Antal', xQ + cQ - 6, hY, fB, hS, C.textMid, 'right');
  txt(pg, 'Enhedspris', xP + cP - 6, hY, fB, hS, C.textMid, 'right');
  txt(pg, 'Moms %', xV + cV / 2, hY, fB, hS, C.textMid, 'center');
  txt(pg, 'Beløb', TR - 6, hY, fB, hS, C.textMid, 'right');

  pg.drawLine({ start: { x: TL, y: y - hH }, end: { x: TR, y: y - hH }, thickness: 1, color: C.border });
  y -= hH;

  // Data rows
  const RH = 22, iS = 9;
  for (let i = 0; i < items.length; i++) {
    if (y - RH < MB + 100) { pg = doc.addPage([PW, PH]); y = PH - MT; }
    const it = items[i];
    const lt = it.quantity * it.unitPrice;

    if (i % 2 === 1) pg.drawRectangle({ x: TL, y: y - RH, width: TW, height: RH, color: C.borderLt });

    // Light bottom border for every row
    pg.drawLine({ start: { x: TL, y: y - RH }, end: { x: TR, y: y - RH }, thickness: 0.5, color: C.borderLt });

    const rY = y - RH / 2 - 3; // vertically center baseline
    txt(pg, it.description, TL + 10, rY, fR, iS, C.text, 'left', cD - 20);
    txt(pg, fmtNum(it.quantity, 0), xQ + cQ - 6, rY, fR, iS, C.text, 'right');
    txt(pg, `${fmtNum(it.unitPrice)} ${sym}`, xP + cP - 6, rY, fR, iS, C.text, 'right');
    txt(pg, `${it.vatPercent}%`, xV + cV / 2, rY, fR, iS, C.text, 'center');
    txt(pg, `${fmtNum(lt)} ${sym}`, TR - 6, rY, fB, iS, C.text, 'right');
    y -= RH;
  }

  pg.drawLine({ start: { x: TL, y }, end: { x: TR, y }, thickness: 1, color: C.border });

  // ══════════════════════════════════════════════════════════
  //  TOTALS (right-aligned block)
  // ══════════════════════════════════════════════════════════

  y -= 24;
  const tBlockW = 220;  // total block width
  const tLabelX = TR - tBlockW; // left edge of label column
  const tValX = TR - 6;         // right edge of value column

  // Subtotal
  txt(pg, 'Subtotal (excl. moms)', tLabelX, y, fR, 10, C.textMid);
  txt(pg, `${fmtNum(inv.subtotal)} ${sym}`, tValX, y, fR, 10, C.text, 'right');
  y -= 18;

  // Moms
  txt(pg, 'Moms', tLabelX, y, fR, 10, C.textMid);
  txt(pg, `${fmtNum(inv.vatTotal)} ${sym}`, tValX, y, fR, 10, C.text, 'right');
  y -= 14;

  pg.drawLine({ start: { x: tLabelX, y }, end: { x: TR, y }, thickness: 0.5, color: C.border });
  y -= 16;

  // TOTAL (big)
  txt(pg, 'TOTAL', tLabelX, y, fB, 16, C.teal);
  txt(pg, `${fmtNum(inv.total)} ${sym}`, tValX, y, fB, 16, C.teal, 'right');
  y -= 18;

  pg.drawLine({ start: { x: tLabelX, y }, end: { x: TR, y }, thickness: 0.5, color: C.border });
  y -= 14;

  // Due date
  txt(pg, 'Forfaldsdato', tLabelX, y, fR, 10, C.textMid);
  txt(pg, fmtDate(inv.dueDate), tValX, y, fR, 10, C.text, 'right');

  // DKK equivalent
  if (inv.exchangeRate && inv.currency !== 'DKK') {
    y -= 8;
    const dkk = Number(inv.total) * Number(inv.exchangeRate);
    txt(pg, `Tilsvarende i DKK: ${fmtNum(dkk)} kr. (kurs: ${inv.exchangeRate.toFixed(4)})`, ML, y, fI, 8, C.textMid);
  }

  // ══════════════════════════════════════════════════════════
  //  BANK INFO (pinned to page bottom, above footer)
  // ══════════════════════════════════════════════════════════

  const FOOTER_ZONE = MB + 30; // top of footer area
  const BK_PAD = 16;            // bank box inner padding
  const BK_ROW_H = 16;          // bank box row height
  const hasBank = co && (co.bankName || co.bankRegistration || co.bankAccount || co.bankIban || co.bankStreet || co.bankCity || co.bankCountry || co.invoiceTerms);

  // ── Calculate bank box height first (we need it for positioning) ──
  let bankBoxH = 0;
  const bankRows: [string, string][] = [];
  let bankAddrLines: string[] = [];
  let termsLines: string[] = [];
  const hasBankAddr = co && (co.bankName || co.bankStreet || co.bankCity || co.bankCountry);
  const hasTerms = !!co?.invoiceTerms;
  const hasBottomRow = hasBankAddr || hasTerms;

  if (hasBank) {
    if (co.bankRegistration) bankRows.push(['Reg.nr.:', co.bankRegistration]);
    if (co.bankAccount) bankRows.push(['Kontonr.:', co.bankAccount]);
    if (co.bankIban) bankRows.push(['IBAN:', co.bankIban]);

    if (hasBankAddr) {
      bankAddrLines = [co.bankName, co.bankStreet, co.bankCity, co.bankCountry].filter(Boolean) as string[];
    }
    if (hasTerms) {
      termsLines = wrap(co.invoiceTerms!, fR, 9, HALF - 16);
    }

    const detailsH = bankRows.length > 0 ? (14 + bankRows.length * BK_ROW_H) : 0; // title + rows
    const sectionGap = (bankRows.length > 0 && hasBottomRow) ? 10 : 0;
    const addrH = bankAddrLines.length * BK_ROW_H;
    const termH = termsLines.length * 13 + 6;
    const bottomH = hasBottomRow ? (BK_ROW_H + Math.max(addrH, termH)) : 0; // title + content

    bankBoxH = detailsH + sectionGap + bottomH + BK_PAD * 2;
  }

  // ── Position bank box: pin to bottom, just above footer ──
  if (hasBank && bankBoxH > 0) {
    const bankBoxTop = FOOTER_ZONE + bankBoxH; // top of the box
    const bankBoxBot = FOOTER_ZONE;             // bottom of the box

    // Make sure there's space between current content and bank box
    if (y > bankBoxTop + 16) {
      y = bankBoxTop + 16; // leave 16pt gap
    }

    // Draw the full-width gray box
    pg.drawRectangle({ x: ML, y: bankBoxBot, width: CW, height: bankBoxH, color: C.bankBg, borderColor: C.border, borderWidth: 0.5 });

    let by = bankBoxTop - BK_PAD;

    // Section 1: BANKDETALJER (top, full width)
    if (bankRows.length > 0) {
      txt(pg, 'BANKDETALJER', ML + BK_PAD, by, fB, 9, C.textMid);
      by -= 14;

      for (const [label, value] of bankRows) {
        const lw = fR.widthOfTextAtSize(label, 9);
        txt(pg, label, ML + BK_PAD, by, fR, 9, C.textMuted);
        txt(pg, value, ML + BK_PAD + lw + 6, by, fR, 9, C.text);
        by -= BK_ROW_H;
      }

      if (hasBottomRow) by -= 10; // gap before bottom section
    }

    // Section 2: BANKADRESSE (left) + BETINGELSER (right)
    if (hasBottomRow) {
      if (hasBankAddr) {
        txt(pg, 'BANKADRESSE', C1, by, fB, 9, C.textMid);
      }
      if (hasTerms) {
        txt(pg, 'BETINGELSER', C2, by, fB, 9, C.textMid);
      }
      by -= BK_ROW_H;

      // Bank address values (left column)
      for (const line of bankAddrLines) {
        txt(pg, line, C1, by, fR, 9, C.text);
        by -= BK_ROW_H;
      }

      // Invoice terms (right column, top-aligned with bank address)
      if (termsLines.length > 0) {
        const tyStart = by + ((bankAddrLines.length - 1) * BK_ROW_H);
        let ty = tyStart;
        for (const l of termsLines) {
          txt(pg, l, C2, ty, fR, 9, C.text);
          ty -= 13;
        }
      }
    }

    y = bankBoxBot - 8; // update y to below the bank box
  }

  // ══════════════════════════════════════════════════════════
  //  NOTES (between totals and bank box)
  // ══════════════════════════════════════════════════════════

  if (inv.notes) {
    // Calculate available space between current y and bank box
    const notesY = hasBank ? y : FOOTER_ZONE;
    if (notesY - FOOTER_ZONE > 60) { // only draw if there's room
      const availableH = notesY - FOOTER_ZONE - 4;
      const lines = wrap(inv.notes, fR, 9, CW - 28);
      const neededH = lines.length * 13 + 24;

      const boxH = Math.min(neededH, availableH);
      pg.drawRectangle({ x: ML, y: notesY - boxH, width: CW, height: boxH, color: C.notesBg, borderColor: rgb(0.95, 0.93, 0.80), borderWidth: 0.5 });

      let ny = notesY - boxH + 12;
      txt(pg, 'Bemærkninger:', ML + 14, ny, fB, 9, C.text); ny -= 13;
      for (const l of lines) {
        if (ny < FOOTER_ZONE + 4) break; // don't overflow
        txt(pg, l, ML + 14, ny, fR, 9, C.text); ny -= 13;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  FOOTER
  // ══════════════════════════════════════════════════════════

  // Teal accent line
  pg.drawLine({ start: { x: ML, y: MB + 16 }, end: { x: RX, y: MB + 16 }, thickness: 1, color: C.teal });

  txt(pg, 'AlphaFlow Regnskab & Bogføring', PW / 2, MB + 6, fB, 8, C.teal, 'center');

  const genStr = `Genereret: ${new Date().toLocaleDateString('da-DK', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  txt(pg, genStr, PW / 2, MB - 6, fR, 7, C.textMid, 'center');

  return doc.save();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function txt(pg: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color: typeof C.white, align?: 'left' | 'right' | 'center', maxW?: number) {
  const w = font.widthOfTextAtSize(text, size);
  if (maxW && w > maxW) {
    let t = text;
    while (font.widthOfTextAtSize(t + '...', size) > maxW && t.length > 0) t = t.slice(0, -1);
    if (t.length > 0) {
      const s = t + '...';
      const sw = font.widthOfTextAtSize(s, size);
      pg.drawText(s, { x: align === 'right' ? x - sw : align === 'center' ? x - sw / 2 : x, y, font, size, color });
    }
    return;
  }
  pg.drawText(text, { x: align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y, font, size, color });
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) { out.push(''); continue; }
    let cur = '';
    for (const word of raw.split(' ')) {
      const test = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) { out.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function parseItems(li: any): InvoiceLineItem[] {
  if (!Array.isArray(li)) return [];
  return li.map((i: any) => ({
    description: i.description || '',
    quantity: Number(i.quantity) || 0,
    unitPrice: Number(i.unitPrice) || 0,
    vatPercent: Number(i.vatPercent) || 0,
  }));
}

function fmtNum(n: number, decimals?: number) {
  return formatNumberForPDF(n, decimals);
}

function fmtDate(d: Date | string): string {
  const v = typeof d === 'string' ? new Date(d) : d;
  return v.toLocaleDateString('da-DK', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function mapStatus(s: string): string {
  return { DRAFT: 'Kladd', SENT: 'Sendt', PAID: 'Betalt', CANCELLED: 'Annulleret' }[s] || s;
}
