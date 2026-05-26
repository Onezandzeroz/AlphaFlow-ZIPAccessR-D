import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/pdf-to-png
 *
 * Converts the first page of a PDF file to a PNG image using
 * pdfjs-dist + node-canvas (same stack as /api/ocr/pdf).
 *
 * System dependencies (install on production VPS):
 *   apt-get install -y graphicsmagick ghostscript
 *
 * Returns the PNG as a binary blob with Content-Type: image/png.
 */

async function getPdfjsLib() {
  return await import(/* webpackIgnore: true */ 'pdfjs-dist/build/pdf.js' as string);
}

async function getCanvas() {
  return await import(/* webpackIgnore: true */ 'canvas' as string);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded (field name: file)' },
        { status: 400 },
      );
    }

    // Only accept PDFs
    if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are accepted' },
        { status: 400 },
      );
    }

    // 10 MB limit
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    console.log(
      `[PDF→PNG] Converting: ${file.name}, ${(pdfBuffer.length / 1024).toFixed(1)}KB`,
    );

    // Load pdfjs-dist + node-canvas at runtime (not bundled by Turbopack)
    const pdfjsModule = await getPdfjsLib();
    const pdfjsLib = pdfjsModule.default || pdfjsModule;
    const canvasModule = await getCanvas();
    const createCanvas = canvasModule.default?.createCanvas || canvasModule.createCanvas;

    // Set up worker
    const path = await import('path');
    const cwd = process.cwd();
    const workerPath = path.join(cwd, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js');
    const fontPath = path.join(cwd, 'node_modules', 'pdfjs-dist', 'standard_fonts');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

    // canvasFactory tells pdfjs-dist how to create Canvas objects in Node.js
    const canvasFactory = {
      create(width: number, height: number) {
        const canvas = createCanvas(width, height);
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

    // Parse PDF
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      standardFontDataUrl: fontPath + '/',
      canvasFactory,
    }).promise;

    // Render first page
    const page = await pdf.getPage(1);
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Convert to PNG buffer
    const pngBuffer = canvas.toBuffer('image/png');

    console.log(
      `[PDF→PNG] Success: ${viewport.width}x${viewport.height}, ${(pngBuffer.length / 1024).toFixed(0)}KB PNG`,
    );

    // Stream the PNG back
    return new NextResponse(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="${file.name.replace(/\.pdf$/i, '.png')}"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[PDF→PNG] Conversion error:', msg);

    // Detect missing native dependencies
    const errLower = msg.toLowerCase();
    if (
      errLower.includes('dlopen') ||
      errLower.includes('cannot find module') ||
      errLower.includes('canvas') ||
      errLower.includes('native') ||
      errLower.includes('ENOENT') ||
      errLower.includes('spawn')
    ) {
      return NextResponse.json(
        {
          error:
            'PDF conversion requires native dependencies. ' +
            'Run: sudo apt-get install -y build-essential libcairo2-dev libjpeg-dev libpango1.0-dev',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: `PDF conversion failed: ${msg}` },
      { status: 500 },
    );
  }
}
