import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import type { VisionMultimodalContentItem } from 'z-ai-web-dev-sdk';

/**
 * POST /api/ocr/pdf
 * Uses AI vision (VLM) to extract structured data from purchase documents.
 * For PDFs: renders pages to images first, then sends to VLM.
 * For images: sends directly to VLM.
 */
export const maxDuration = 60;

// ─── Canvas polyfill state ───────────────────────────────────────────
// pdfjs-dist v4 uses `instanceof Image` and `instanceof Canvas` checks
// internally (e.g. in paintInlineImageXObject). In Node.js these DOM
// globals don't exist, causing "Image or Canvas expected" errors when
// rendering PDFs with inline images (logos, stamps, etc.).
//
// We polyfill them once from the `canvas` npm package so all pdfjs-dist
// code paths work transparently. The polyfill is idempotent — safe to
// call on every request.

let canvasPolyfilled = false;

async function ensureCanvasPolyfill(): Promise<typeof import('canvas')> {
  if (canvasPolyfilled) {
    return await import(/* webpackIgnore: true */ 'canvas' as string);
  }

  const nodeCanvas = await import(/* webpackIgnore: true */ 'canvas' as string) as any;

  // Polyfill DOM globals that pdfjs-dist v4 checks with `instanceof`
  if (typeof (globalThis as any).Image === 'undefined') {
    (globalThis as any).Image = nodeCanvas.Image;
  }
  if (typeof (globalThis as any).Canvas === 'undefined') {
    // The `canvas` package doesn't export `Canvas` as a named export directly,
    // but createCanvas() returns an instance whose constructor IS the Canvas class.
    const temp = nodeCanvas.createCanvas(1, 1);
    (globalThis as any).Canvas = temp.constructor;
  }
  if (typeof (globalThis as any).ImageBitmap === 'undefined') {
    // pdfjs-dist may also reference ImageBitmap in some code paths
    (globalThis as any).ImageBitmap = class ImageBitmap {};
  }

  canvasPolyfilled = true;
  console.log('[OCR] Canvas polyfill applied (Image, Canvas, ImageBitmap)');
  return nodeCanvas;
}

// ─── pdfjs-dist loader ──────────────────────────────────────────────

async function getPdfjsLib(): Promise<any> {
  return await import(/* webpackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs' as string);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

    console.log(`[OCR] Processing ${file.name}, type=${file.type}, ${(file.size / 1024).toFixed(1)}KB, isPdf=${isPdf}`);

    let pageImages: string[] = [];

    if (isPdf) {
      // ── PDF: Render pages to images using pdfjs-dist + node-canvas ──
      // Ensure canvas polyfill is applied before loading pdfjs-dist,
      // so the legacy build picks up the correct Image/Canvas globals.
      const nodeCanvas = await ensureCanvasPolyfill();
      const pdfjsLib = await getPdfjsLib();

      const cwd = process.cwd();
      const workerPath = path.join(cwd, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
      const fontPath = path.join(cwd, 'node_modules', 'pdfjs-dist', 'standard_fonts');

      pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

      // canvasFactory: tells pdfjs-dist how to create Canvas objects in Node.js.
      // This is required for v4 so that ALL internal canvas creation (including
      // inline images in paintInlineImageXObject) uses node-canvas instead of
      // trying to use the non-existent DOM Canvas.
      const canvasFactory = {
        create(width: number, height: number) {
          const canvas = nodeCanvas.createCanvas(width, height);
          return { canvas, context: canvas.getContext('2d') };
        },
        reset(canvasAndContext: { canvas: any }, width: number, height: number) {
          canvasAndContext.canvas.width = width;
          canvasAndContext.canvas.height = height;
        },
        destroy(canvasAndContext: { canvas: any }) {
          canvasAndContext.canvas.width = 0;
          canvasAndContext.canvas.height = 0;
        },
      };

      const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        standardFontDataUrl: fontPath + '/',
        canvasFactory,
      }).promise;

      const numPages = Math.min(pdf.numPages, 5);
      const { createCanvas } = nodeCanvas;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        pageImages.push(canvas.toDataURL('image/png'));
      }

      console.log(`[OCR] Rendered ${pageImages.length} PDF pages to images`);
    } else {
      // ── Image: Convert directly to data URL ──
      const mimeType = file.type || 'image/png';
      pageImages.push(`data:${mimeType};base64,${base64}`);
    }

    if (pageImages.length === 0) {
      return NextResponse.json({ error: 'No pages/images to analyze' }, { status: 400 });
    }

    // ── Step 2: Send to VLM ──
    console.log(`[OCR] Sending ${pageImages.length} image(s) to VLM...`);

    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const prompt = `Analyze this purchase invoice/receipt document${pageImages.length > 1 ? ` (${pageImages.length} pages)` : ''}. Extract the following information and return ONLY valid JSON (no markdown, no backticks):

{
  "amount": <total amount as number, or null>,
  "date": <date in YYYY-MM-DD format, or null>,
  "vatPercent": <VAT percentage as number (e.g. 25), or null>,
  "currency": <currency code like "DKK", or "DKK" if unknown>,
  "description": <brief description of the purchase, or null>,
  "lines": [
    {
      "description": <line item description>,
      "quantity": <quantity as number>,
      "unitPrice": <unit price as number>,
      "vatPercent": <VAT percentage as number>
    }
  ]
}

Rules:
- amount should be the TOTAL including VAT (brutto/total)
- date format must be YYYY-MM-DD
- vatPercent should be 0-100 (not decimal)
- Extract individual line items if visible
- If no line items are visible, return empty lines array
- Return ONLY the JSON object, nothing else`;

    const content: VisionMultimodalContentItem[] = [
      { type: 'text', text: prompt },
      ...pageImages.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
    ];

    const response = await zai.chat.completions.createVision({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content }],
      thinking: { type: 'disabled' },
    });

    const resultContent = response.choices[0]?.message?.content || '';
    console.log(`[OCR] VLM response (${resultContent.length} chars): ${resultContent.substring(0, 150)}...`);

    // Parse JSON from response
    let parsed: {
      amount: number | null;
      date: string | null;
      vatPercent: number | null;
      currency: string;
      description: string | null;
      lines: Array<{ description: string; quantity: number; unitPrice: number; vatPercent: number }>;
    };

    try {
      const jsonMatch = resultContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('[OCR] Failed to parse VLM response:', resultContent.substring(0, 200));
      return NextResponse.json({
        text: resultContent,
        amount: null,
        date: null,
        vatPercent: null,
        confidence: 0,
        rawLines: resultContent.split('\n').filter((l: string) => l.trim()),
      });
    }

    // Build raw lines for compatibility
    const rawLines: string[] = [];
    if (parsed.description) rawLines.push(parsed.description);
    if (parsed.amount) rawLines.push(`Total: ${parsed.amount} ${parsed.currency || 'DKK'}`);
    if (parsed.date) rawLines.push(`Dato: ${parsed.date}`);
    if (parsed.vatPercent) rawLines.push(`Moms: ${parsed.vatPercent}%`);
    for (const line of parsed.lines || []) {
      rawLines.push(`${line.description} - ${line.quantity}x ${line.unitPrice}`);
    }

    const ocrResult = {
      text: resultContent,
      amount: parsed.amount ?? null,
      date: parsed.date ?? null,
      vatPercent: parsed.vatPercent ?? null,
      confidence: 85,
      rawLines,
      vlmLines: parsed.lines || [],
      vlmDescription: parsed.description || null,
    };

    console.log(`[OCR] SUCCESS: amount=${ocrResult.amount}, date=${ocrResult.date}, vat=${ocrResult.vatPercent}%, lines=${(parsed.lines || []).length}`);

    return NextResponse.json(ocrResult);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[OCR] ERROR:', msg);
    if (error instanceof Error) console.error('[OCR] Stack:', error.stack);
    return NextResponse.json(
      { error: `OCR failed: ${msg}` },
      { status: 500 }
    );
  }
}
