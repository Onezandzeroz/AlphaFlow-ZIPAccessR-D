import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/notifications/mark-read
 *
 * Marks one or more notification IDs as read for the current user.
 * Uses upsert to handle race conditions safely.
 *
 * Body: { notificationIds: string[] }
 *   - notificationIds: Array of deterministic notification IDs to mark as read.
 *     Pass all current notification IDs to "mark all as read".
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const notificationIds: string[] = body.notificationIds;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: 'notificationIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Limit to 100 IDs per request to prevent abuse
    const ids = notificationIds.slice(0, 100);

    // Upsert each notification read record
    // Using createMany is not supported with conflict handling in SQLite,
    // so we loop with individual upserts.
    for (const notificationId of ids) {
      await db.notificationRead.upsert({
        where: {
          userId_notificationId: {
            userId: ctx.id,
            notificationId,
          },
        },
        create: {
          userId: ctx.id,
          notificationId,
        },
        update: {
          readAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    logger.error('Failed to mark notifications as read:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
