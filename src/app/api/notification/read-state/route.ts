import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/notifications/read-state
 *
 * Returns the set of notification IDs that the current user has marked as read.
 * Used by the NotificationCenter to sync read state across devices.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reads = await db.notificationRead.findMany({
      where: { userId: ctx.id },
      select: { notificationId: true },
    });

    // Return as a simple array of notification ID strings
    const readIds = reads.map((r) => r.notificationId);

    return NextResponse.json({ readIds });
  } catch (error) {
    logger.error('Failed to fetch notification read state:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
