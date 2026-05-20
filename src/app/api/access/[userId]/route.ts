// ═══════════════════════════════════════════════════════════════
// GET /api/access/[userId]
//
// Proxy: Checks a user's access level via the TokenPay service.
// Call this from your client-side components.
//
// OWNER BYPASS: The AlphaAi app owner (isSuperDev + AlphaAi company)
// always gets read_write access without needing a proof file.
//
// Response: { userId, accessLevel, accessExpiry, daysRemaining, isExpired }
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { checkOwnerAccess } from '@/lib/access-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // ─── Owner bypass: AlphaAi owner always has read_write ───
    const ownerAccess = await checkOwnerAccess(userId);
    if (ownerAccess) {
      return NextResponse.json(ownerAccess);
    }

    // ─── Normal flow: check TokenPay service ────────────────────
    const access = await tokenpay.checkAccess(userId);
    return NextResponse.json(access);
  } catch (error) {
    console.error('[Access API] Error:', error);
    const message = error instanceof Error ? error.message : 'Access check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
