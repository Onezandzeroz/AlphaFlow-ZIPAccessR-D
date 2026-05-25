import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ocr/pdf
 * Uses AI vision (VLM) to extract structured data from PDF purchase invoices.
 * Step 1: Renders PDF pages to images using pdfjs-dist
 * Step 2: Sends images to z-ai-web-dev-sdk VLM for analysis
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    console.log(`[PDF OCR] Processing ${file.name}, ${(file.size / 1024).toFixed(1)}KB`);

    // Step 1: Render PDF pages to PNG images using pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');

    // In Node.js, disable the worker (runs on main thread)
    const pdfjsLibAny = pdfjsLib as any;
    pdfjsLibAny.GlobalWorkerOptions.workerSrc = '';

    const pdf = await pdfjsLibAny.getDocument({ data: new Uint8Array(arrayBuffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const numPages = Math.min(pdf.numPages, 5); // Max 5 pages
    const pageImages: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });

      // Create offscreen canvas to render the page
      const canvas = await createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Get PNG as base64
      const pngBase64 = canvas.toDataURL('image/png');
      pageImages.push(pngBase64);
    }

    console.log(`[PDF OCR] Rendered ${pageImages.length} pages to images`);

    // Step 2: Send rendered images to VLM for analysis
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    // Build content array: text prompt + all page images
    const content: Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }> = [
      {
        type: 'text',
        text: `Analyze this purchase invoice/receipt document (page ${pageImages.length > 1 ? '1 of ' + pageImages.length : ''}). Extract the following information and return ONLY valid JSON (no markdown, no backticks):

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
    console.log(`[PDF OCR] VLM response length: ${resultContent.length}`);

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
      console.error('[PDF OCR] Failed to parse VLM response:', resultContent.substring(0, 200));
      return NextResponse.json({
        text: resultContent,
        amount: null,
        date: null,
        vatPercent: null,
        confidence: 0,
        rawLines: resultContent.split('\n').filter((l: string) => l.trim()),
      });
    }

    // Build raw lines from the extracted data for compatibility
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

    console.log(`[PDF OCR] Extracted: amount=${ocrResult.amount}, date=${ocrResult.date}, vat=${ocrResult.vatPercent}%, lines=${(parsed.lines || []).length}`);

    return NextResponse.json(ocrResult);
  } catch (error) {
    console.error('[PDF OCR] Error:', error instanceof Error ? error.stack : error);
    return NextResponse.json(
      { error: `Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

/**
 * Creates a node-canvas for server-side PDF rendering.
 */
async function createCanvas(width: number, height: number) {
  const { createCanvas } = await import('canvas');
  return createCanvas(width, height);
}
