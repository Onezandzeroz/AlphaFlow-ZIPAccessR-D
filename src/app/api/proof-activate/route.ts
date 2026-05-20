// ═══════════════════════════════════════════════════════════════
// POST /api/proof-activate
//
// Proxy: Activates a previously uploaded proof by proofId.
//
// Body: { userId: string, proofId: string }
// Response: { success: true, tier: string, expiresAt: string }
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, proofId } = body;

    if (!userId || !proofId) {
      return NextResponse.json(
        { error: 'Missing userId or proofId' },
        { status: 400 }
      );
    }

    const result = await tokenpay.activateProof(userId, proofId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Proof Activate API] Error:', error);
    const message = error instanceof Error ? error.message : 'Proof activation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
