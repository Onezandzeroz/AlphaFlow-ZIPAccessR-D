// ═══════════════════════════════════════════════════════════════
// POST /api/proof-upload
//
// Proxy: Uploads an encrypted .tbkey proof file via the TokenPay service.
// The proof is user-agnostic (bearer instrument) — userId is optional.
//
// Content-Type: multipart/form-data
// Fields: proofFile (File — .tbkey), userId (string, optional)
//
// Response: { success, proofId, status, tier?, expiresAt?, filename, manifest }
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const userId = formData.get('userId') as string | null;
    const proofFile = formData.get('proofFile') as File | null;

    if (!proofFile) {
      return NextResponse.json(
        { error: 'Missing proofFile' },
        { status: 400 }
      );
    }

    if (!proofFile.name.toLowerCase().endsWith('.tbkey')) {
      return NextResponse.json(
        { error: 'proofFile must be a .tbkey encrypted proof file (not .zip or other format)' },
        { status: 400 }
      );
    }

    // Re-build FormData for the service (boundary will be re-set by fetch)
    const serviceFormData = new FormData();
    if (userId) {
      serviceFormData.append('userId', userId);
    }
    serviceFormData.append('proofFile', proofFile);

    const result = await tokenpay.uploadProof(serviceFormData);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Proof Upload API] Error:', error);
    const message = error instanceof Error ? error.message : 'Proof upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
