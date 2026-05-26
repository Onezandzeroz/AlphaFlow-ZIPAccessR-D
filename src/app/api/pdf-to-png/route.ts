import { NextRequest, NextResponse } from 'next/server';
import { fromBuffer } from 'pdf2pic';

/**
 * POST /api/pdf-to-png
 *
 * Converts the first page of a PDF file to a PNG image using
 * GraphicsMagick + Ghostscript (via pdf2pic).
 *
 * System dependencies (install on production VPS):
 *   apt-get install -y graphicsmagick ghostscript
 *
 * Returns the PNG as a binary blob with Content-Type: image/png.
 */

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

    // Read PDF bytes into a Buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    console.log(
      `[PDF→PNG] Converting: ${file.name}, ${(pdfBuffer.length / 1024).toFixed(1)}KB`,
    );

    // Convert page 1 to PNG (in-memory, no temp files)
    const convert = fromBuffer(pdfBuffer, {
      density: 150, // DPI — balanced quality vs file size
      format: 'png',
      width: 1200,
      height: 1600,
      preserveAspectRatio: true,
    });

    const result = await convert(1, { responseType: 'buffer' });

    if (!result?.buffer) {
      console.error('[PDF→PNG] pdf2pic returned no buffer');
      return NextResponse.json(
        { error: 'PDF conversion failed — no image produced' },
        { status: 500 },
      );
    }

    console.log(
      `[PDF→PNG] Success: ${(result.buffer.length / 1024).toFixed(0)}KB PNG`,
    );

    // Stream the PNG back
    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="${file.name.replace(/\.pdf$/i, '.png')}"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[PDF→PNG] Conversion error:', msg);

    // Detect missing system dependencies
    if (
      msg.includes('graphicsmagick') ||
      msg.includes('gm') ||
      msg.includes('ghostscript') ||
      msg.includes('gs') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('spawn')
    ) {
      return NextResponse.json(
        {
          error:
            'PDF conversion requires GraphicsMagick and Ghostscript. ' +
            'Install with: sudo apt-get install -y graphicsmagick ghostscript',
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
