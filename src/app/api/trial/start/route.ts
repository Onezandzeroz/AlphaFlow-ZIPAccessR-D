import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { grantTrial } from '@/lib/tokenpay';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';

// ─── POST /api/trial/start ─────────────────────────────────────────
// Start the one-time free trial for a newly registered tenant.
// This is called when the user actively clicks the Free plan on the
// subscription plans prompt.
//
// Rules:
//   - Each user can only self-claim a trial ONCE (tracked by trialClaimedAt).
//   - The app owner can still grant additional trials via oversight settings.
//   - SuperDev users and demo companies are not eligible.
//   - Users who already have active read_write access are not eligible.

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Block demo companies and super devs
    if (ctx.isDemoCompany) {
      return NextResponse.json(
        { error: 'Demo companies cannot start a trial' },
        { status: 403 },
      );
    }

    if (ctx.isSuperDev) {
      return NextResponse.json(
        { error: 'App owner does not need a trial' },
        { status: 403 },
      );
    }

    // Check if user has already claimed their one-time trial
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: { id: true, email: true, businessName: true, trialClaimedAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.trialClaimedAt) {
      return NextResponse.json(
        {
          error: 'Du har allerede brugt din gratis prøveperiode.',
          alreadyClaimed: true,
          claimedAt: user.trialClaimedAt.toISOString(),
        },
        { status: 409 },
      );
    }

    // Grant 60-day trial via TokenPay
    const result = await grantTrial(ctx.id, user.email, user.businessName || undefined, 60);

    // Mark that the user has claimed their one-time trial
    await db.user.update({
      where: { id: ctx.id },
      data: { trialClaimedAt: new Date() },
    });

    // Audit log
    await auditLog({
      action: 'CREATE',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: { trialClaimed: { old: null, new: result.trialExpiry } },
      metadata: requestMetadata(request),
    });

    logger.info(
      `[TRIAL] User ${user.email} self-claimed trial. Expires: ${result.trialExpiry}`,
    );

    return NextResponse.json({
      success: true,
      trialExpiry: result.trialExpiry,
      message: 'Prøveperioden er startet! Du har nu 60 dage med fuld adgang.',
    });
  } catch (error) {
    logger.error('[TRIAL START] Error:', error);
    return NextResponse.json(
      { error: 'Kunne ikke starte prøveperioden. Prøv igen senere.' },
      { status: 500 },
    );
  }
}
