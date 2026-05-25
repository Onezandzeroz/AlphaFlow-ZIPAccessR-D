import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ocr/pdf
 * Uses AI vision (VLM) to extract structured data from PDF purchase invoices.
 * Converts PDF to base64, sends to z-ai-web-dev-sdk vision API.
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
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64}`;

    console.log(`[PDF OCR] Processing ${file.name}, ${(file.size / 1024).toFixed(1)}KB via VLM`);

    // Use z-ai-web-dev-sdk for vision analysis
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const response = await zai.chat.completions.createVision({
      model: 'claude-sonnet-4-20250514',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this purchase invoice/receipt document. Extract the following information and return ONLY valid JSON (no markdown, no backticks):

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
- Return ONLY the JSON object, nothing else`
            },
            {
              type: 'file_url',
              file_url: { url: dataUrl }
            }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    });

    const content = response.choices[0]?.message?.content || '';
    console.log(`[PDF OCR] VLM response length: ${content.length}`);

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
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('[PDF OCR] Failed to parse VLM response:', content.substring(0, 200));
      return NextResponse.json({
        text: content,
        amount: null,
        date: null,
        vatPercent: null,
        confidence: 0,
        rawLines: content.split('\n').filter((l: string) => l.trim()),
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
      text: content,
      amount: parsed.amount ?? null,
      date: parsed.date ?? null,
      vatPercent: parsed.vatPercent ?? null,
      confidence: 85, // VLM generally high confidence
      rawLines,
      // Pass through structured line items for the form
      vlmLines: parsed.lines || [],
      vlmDescription: parsed.description || null,
    };

    console.log(`[PDF OCR] Extracted: amount=${ocrResult.amount}, date=${ocrResult.date}, vat=${ocrResult.vatPercent}%, lines=${(parsed.lines || []).length}`);

    return NextResponse.json(ocrResult);
  } catch (error) {
    console.error('[PDF OCR] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Failed to process PDF' },
      { status: 500 }
    );
  }
}
