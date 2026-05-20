// ═══════════════════════════════════════════════════════════════
// GET /api/access/[userId]/status
//
// Proxy: Full user status via the TokenPay service.
//
// OWNER BYPASS: The AlphaAi app owner always gets read_write status
// without needing a proof file.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';
import { checkOwnerStatus } from '@/lib/access-guard';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    // ─── Owner bypass: AlphaAi owner always has read_write ───
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, businessName: true },
    });

    const ownerStatus = await checkOwnerStatus(
      userId,
      user?.email,
      user?.businessName || undefined
    );
    if (ownerStatus) {
      return NextResponse.json(ownerStatus);
    }

    // ─── Normal flow: check TokenPay service ────────────────────
    const status = await tokenpay.getUserStatus(userId);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[Access Status API] Error:', error);
    const message = error instanceof Error ? error.message : 'Status check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
