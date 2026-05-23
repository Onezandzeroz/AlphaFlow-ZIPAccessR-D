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
      const lp = path.isAbsolute(co.logo) ? co.logo : path.join(process.cwd(), co.logo);
      if (existsSync(lp)) {
        const bytes = await readFile(lp);
        const img = lp.toLowerCase().endsWith('.png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const d = img.scale(1);
        const s = Math.min(70 / d.height, 220 / d.width, 1);
        const w = d.width * s, h = d.height * s;
        pg.drawImage(img, { x: ML, y: y - h, width: w, height: h });
        headerBottom = y - h;
      }
    } catch (e) { logger.warn('[PDF] Logo embed failed:', e); }
  }

  // Invoice date below logo
  const dateLabel = co?.logo ? '' : (co?.companyName || '');
  if (!co?.logo && dateLabel) {
    txt(pg, dateLabel, ML, y - 16, fB, 20, C.text);
    headerBottom = y - 36;
  }

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

  // LEFT: FRA
  let ly = colStartY;
  txt(pg, 'FRA', C1, ly, fB, 9, C.textMid); ly -= 15;
  txt(pg, co?.companyName || '', C1, ly, fB, 12, C.text); ly -= 13;
  const coInfo = [co?.address, co?.phone, co?.email, co?.cvrNumber ? `CVR: ${co.cvrNumber}` : null].filter(Boolean) as string[];
  for (const d of coInfo) { txt(pg, d, C1, ly, fR, 9, C.textMid); ly -= 11; }

  // RIGHT: TIL
  let ry = colStartY;
  txt(pg, 'TIL', C2, ry, fB, 9, C.textMid); ry -= 15;
  txt(pg, inv.customerName, C2, ry, fB, 12, C.text); ry -= 13;
  const cuInfo = [inv.customerAddress, inv.customerPhone, inv.customerEmail, inv.customerCvr ? `CVR: ${inv.customerCvr}` : null].filter(Boolean) as string[];
  for (const d of cuInfo) { txt(pg, d, C2, ry, fR, 9, C.textMid); ry -= 11; }

  // y = lowest of both columns
  y = Math.min(ly, ry);

  // ══════════════════════════════════════════════════════════
  //  LINE ITEMS TABLE
  // ══════════════════════════════════════════════════════════

  y -= 20;
  const TL = ML, TR = RX, TW = TR - TL;

  // Column widths
  const cD = TW * 0.38;   // description
  const cQ = TW * 0.10;   // quantity
  const cP = TW * 0.18;   // unit price
  const cV = TW * 0.10;   // vat %
  const cT = TW * 0.24;   // line total

  // Header row
  pg.drawRectangle({ x: TL, y: y - 18, width: TW, height: 22, color: C.headerBg });
  const hY = y - 4;
  const hS = 8.5;

  txt(pg, 'Beskrivelse', TL + 8, hY, fB, hS, C.textMid);
  txt(pg, 'Antal', TL + cD + cQ - 4, hY, fB, hS, C.textMid, 'right');
  txt(pg, 'Enhedspris', TL + cD + cQ + cP - 4, hY, fB, hS, C.textMid, 'right');
  txt(pg, 'Moms %', TL + cD + cQ + cP + cV / 2, hY, fB, hS, C.textMid, 'center');
  txt(pg, 'Beløb', TR - 4, hY, fB, hS, C.textMid, 'right');

  pg.drawLine({ start: { x: TL, y: y - 18 }, end: { x: TR, y: y - 18 }, thickness: 1, color: C.border });
  y -= 18;

  // Data rows
  const RH = 20, iS = 9;
  for (let i = 0; i < items.length; i++) {
    if (y - RH < MB + 100) { pg = doc.addPage([PW, PH]); y = PH - MT; }
    const it = items[i];
    const lt = it.quantity * it.unitPrice;

    if (i % 2 === 1) pg.drawRectangle({ x: TL, y: y - RH, width: TW, height: RH, color: C.borderLt });

    const rY = y - 6;
    txt(pg, it.description, TL + 8, rY, fR, iS, C.text, 'left', cD - 16);
    txt(pg, fmtNum(it.quantity, 0), TL + cD + cQ - 4, rY, fR, iS, C.text, 'right');
    txt(pg, `${fmtNum(it.unitPrice)} ${sym}`, TL + cD + cQ + cP - 4, rY, fR, iS, C.text, 'right');
    txt(pg, `${it.vatPercent}%`, TL + cD + cQ + cP + cV / 2, rY, fR, iS, C.text, 'center');
    txt(pg, `${fmtNum(lt)} ${sym}`, TR - 4, rY, fB, iS, C.text, 'right');
    y -= RH;
  }

  pg.drawLine({ start: { x: TL, y }, end: { x: TR, y }, thickness: 1, color: C.border });

  // ══════════════════════════════════════════════════════════
  //  TOTALS (right-aligned block)
  // ══════════════════════════════════════════════════════════

  y -= 24;
  const tLbl = 140; // width reserved for labels on the left side of totals

  // Subtotal
  txt(pg, 'Subtotal (excl. moms)', TR - tLbl - 8, y, fR, 10, C.textMid, 'right');
  txt(pg, `${fmtNum(inv.subtotal)} ${sym}`, TR - 4, y, fR, 10, C.text, 'right');
  y -= 16;

  // Moms
  txt(pg, 'Moms', TR - tLbl - 8, y, fR, 10, C.textMid, 'right');
  txt(pg, `${fmtNum(inv.vatTotal)} ${sym}`, TR - 4, y, fR, 10, C.text, 'right');
  y -= 14;

  pg.drawLine({ start: { x: TR - tLbl - 8, y }, end: { x: TR, y }, thickness: 0.5, color: C.border });
  y -= 18;

  // TOTAL (big)
  txt(pg, 'TOTAL', TR - tLbl - 8, y, fB, 18, C.teal, 'right');
  txt(pg, `${fmtNum(inv.total)} ${sym}`, TR - 4, y, fB, 18, C.teal, 'right');
  y -= 14;

  pg.drawLine({ start: { x: TR - tLbl - 8, y }, end: { x: TR, y }, thickness: 0.5, color: C.border });
  y -= 14;

  // Due date
  txt(pg, 'Forfaldsdato', TR - tLbl - 8, y, fR, 10, C.textMid, 'right');
  txt(pg, fmtDate(inv.dueDate), TR - 4, y, fR, 10, C.text, 'right');

  // DKK equivalent
  if (inv.exchangeRate && inv.currency !== 'DKK') {
    const dkk = Number(inv.total) * Number(inv.exchangeRate);
    txt(pg, `Tilsvarende i DKK: ${fmtNum(dkk)} kr. (kurs: ${inv.exchangeRate.toFixed(4)})`, ML, y - 16, fI, 8, C.textMid);
  }

  // ══════════════════════════════════════════════════════════
  //  BANK INFO
  // ══════════════════════════════════════════════════════════

  y -= 28;
  const hasBank = co && (co.bankName || co.bankRegistration || co.bankAccount || co.bankIban);

  if (hasBank) {
    txt(pg, 'BETALINGSOPPLYSNINGER', ML, y, fB, 9, C.textMid);
    y -= 8;

    const bankRows: [string, string][] = [];
    if (co.bankName) bankRows.push(['Bank:', co.bankName]);
    if (co.bankRegistration) bankRows.push(['Reg.nr.:', co.bankRegistration]);
    if (co.bankAccount) bankRows.push(['Kontonr.:', co.bankAccount]);
    if (co.bankIban) bankRows.push(['IBAN:', co.bankIban]);

    const pad = 12;
    const rowH = 15;
    const boxH = bankRows.length * rowH + pad * 2 + rowH; // +rowH for reference line
    const boxW = HALF;

    pg.drawRectangle({ x: ML, y: y - boxH, width: boxW, height: boxH, color: C.bankBg, borderColor: C.border, borderWidth: 0.5 });

    let by = y - pad;
    for (const [label, value] of bankRows) {
      const lw = fR.widthOfTextAtSize(label, 9);
      txt(pg, label, ML + pad, by, fR, 9, C.textMuted);
      txt(pg, value, ML + pad + lw + 4, by, fR, 9, C.text);
      by -= rowH;
    }

    // Reference line
    const refLw = fB.widthOfTextAtSize('Reference: ', 9);
    txt(pg, 'Reference:', ML + pad, by, fB, 9, C.textMuted);
    txt(pg, inv.invoiceNumber, ML + pad + refLw, by, fB, 9, C.teal);
    by -= rowH;

    // Invoice terms (right side of bank info, same vertical area)
    if (co.invoiceTerms) {
      txt(pg, 'FAKTURABETINGELSER', C2, y, fB, 9, C.textMid);
      const lines = wrap(co.invoiceTerms, fR, 8.5, HALF - pad * 2);
      const tH = lines.length * 12 + pad * 2;

      pg.drawRectangle({ x: C2, y: y - 8 - tH, width: HALF, height: tH, color: C.bankBg, borderColor: C.border, borderWidth: 0.5 });

      let ty = y - 8 - tH + pad;
      for (const l of lines) { txt(pg, l, C2 + pad, ty, fR, 8.5, C.text); ty -= 12; }

      y = Math.min(by, y - 8 - tH) - 4;
    } else {
      y = by - 4;
    }
  }

  // ══════════════════════════════════════════════════════════
  //  NOTES
  // ══════════════════════════════════════════════════════════

  if (inv.notes) {
    y -= 16;
    txt(pg, 'BEMÆRKNINGER', ML, y, fB, 9, C.textMid);
    y -= 8;

    const lines = wrap(inv.notes, fR, 9, CW - 28);
    const boxH = lines.length * 13 + 24;

    pg.drawRectangle({ x: ML, y: y - boxH, width: CW, height: boxH, color: C.notesBg, borderColor: rgb(0.95, 0.93, 0.80), borderWidth: 0.5 });

    let ny = y - boxH + 12;
    txt(pg, 'Bemærkninger:', ML + 14, ny, fB, 9, C.text); ny -= 13;
    for (const l of lines) { txt(pg, l, ML + 14, ny, fR, 9, C.text); ny -= 13; }
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
