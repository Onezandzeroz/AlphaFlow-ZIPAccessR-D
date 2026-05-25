import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

/**
 * POST /api/ocr/pdf
 * Uses AI vision (VLM) to extract structured data from purchase documents.
 * For PDFs: renders pages to images first, then sends to VLM.
 * For images: sends directly to VLM.
 */
export const maxDuration = 60;

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
      // ── PDF: Render pages to images using pdfjs-dist + canvas ──
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdfjsLibAny = pdfjsLib as any;

      // Set worker path explicitly for Node.js
      const workerPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
      pdfjsLibAny.GlobalWorkerOptions.workerSrc = workerPath;

      const standardFontDataPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules/pdfjs-dist/standard_fonts');

      const pdf = await pdfjsLibAny.getDocument({
        data: new Uint8Array(arrayBuffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
        standardFontDataUrl: standardFontDataPath + '/',
      }).promise;

      const numPages = Math.min(pdf.numPages, 5);

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        const { createCanvas } = await import('canvas');
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport }).promise;
        const pngBase64 = canvas.toDataURL('image/png');
        pageImages.push(pngBase64);
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

    const content: Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }> = [
      {
        type: 'text',
        text: `Analyze this purchase invoice/receipt document${pageImages.length > 1 ? ` (${pageImages.length} pages)` : ''}. Extract the following information and return ONLY valid JSON (no markdown, no backticks):

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
- Return ONLY the JSON object, nothing else`,
      },
    ];

    for (const imgDataUrl of pageImages) {
      content.push({
        type: 'image_url',
        image_url: { url: imgDataUrl },
      });
    }

    const response = await zai.chat.completions.createVision({
      model: 'claude-sonnet-4-20250514',
      messages: [
        {
          role: 'user',
          content,
        }
      ],
      thinking: { type: 'disabled' }
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
      lines: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        vatPercent: number;
      }>;
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
    const stack = error instanceof Error ? error.stack : '';
    console.error('[OCR] ERROR:', msg);
    console.error('[OCR] Stack:', stack);
    return NextResponse.json(
      { error: `OCR failed: ${msg}` },
      { status: 500 }
    );
  }
}
