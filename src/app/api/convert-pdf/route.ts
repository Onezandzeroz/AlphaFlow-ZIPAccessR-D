import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

/**
 * POST /api/convert-pdf
 *
 * Converts the first page of a PDF to a PNG image.
 * Uses pdfjs-dist v3 + node-canvas (both already installed).
 *
 * Returns: PNG image blob (image/png)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 },
      );
    }

    const isPdf =
      file.type === 'application/pdf' ||
      file.name?.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // ── Load pdfjs-dist v3 + node-canvas ──
    const pdfjsLib = await import(
      /* webpackIgnore: true */ 'pdfjs-dist/build/pdf.js' as string
    );
    const nodeCanvas = await import(
      /* webpackIgnore: true */ 'canvas' as string
    );

    const cwd = process.cwd();
    const workerPath = path.join(
      cwd,
      'node_modules',
      'pdfjs-dist',
      'build',
      'pdf.worker.min.js',
    );
    const fontPath = path.join(
      cwd,
      'node_modules',
      'pdfjs-dist',
      'standard_fonts',
    );

    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

    // canvasFactory for pdfjs-dist v3 in Node.js
    const canvasFactory = {
      create(width: number, height: number) {
        const canvas = nodeCanvas.createCanvas(width, height);
        return { canvas, context: canvas.getContext('2d') };
      },
      reset(
        canvasAndContext: { canvas: any },
        width: number,
        height: number,
      ) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      },
      destroy(canvasAndContext: { canvas: any }) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      },
    };

    // ── Parse PDF and render first page ──
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      standardFontDataUrl: fontPath + '/',
      canvasFactory,
    }).promise;

    const page = await pdf.getPage(1);
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    const { createCanvas } = nodeCanvas;
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');
    const pngSizeKB = (pngBuffer.length / 1024).toFixed(0);

    console.log(
      `[convert-pdf] Rendered first page: ${viewport.width}×${viewport.height}, PNG: ${pngSizeKB}KB`,
    );

    // Return PNG image directly
    return new NextResponse(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(pngBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[convert-pdf] ERROR:', msg);
    if (error instanceof Error) console.error('[convert-pdf] Stack:', error.stack);
    return NextResponse.json(
      { error: `PDF conversion failed: ${msg}` },
      { status: 500 },
    );
  }
}
