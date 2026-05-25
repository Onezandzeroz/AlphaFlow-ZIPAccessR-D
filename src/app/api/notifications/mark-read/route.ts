import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/** Port of the notification WebSocket service */
const WS_SERVICE_PORT = process.env.NOTIFICATION_WS_PORT || '3001';

/**
 * POST /api/notifications/mark-read
 *
 * Marks one or more notification IDs as read for the current user.
 * Uses upsert to handle race conditions safely.
 * After persisting, broadcasts the change to all connected devices via the
 * notification WebSocket service (port 3001).
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

    // ─── Broadcast to all connected devices via WebSocket service ──
    // Build the full set of readIds for this user (existing + new)
    // so all devices get the complete state, not just the delta.
    broadcastReadStateChange(ctx.id, ids).catch((err) => {
      // Non-critical: if broadcast fails, devices will catch up via polling
      logger.warn('Failed to broadcast read-state change via WS service:', err);
    });

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    logger.error('Failed to mark notifications as read:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Notify the notification WebSocket service (port 3001) to broadcast
 * a read-state change to all connected sockets for this user.
 *
 * This is a server-to-server call (localhost), not going through Caddy.
 * The WS service will push the event to all browsers/phones connected as this user.
 */
async function broadcastReadStateChange(userId: string, newReadIds: string[]): Promise<void> {
  try {
    // Fetch the user's full set of readIds so we broadcast the complete state
    const allReads = await db.notificationRead.findMany({
      where: { userId },
      select: { notificationId: true },
    });
    const allReadIds = allReads.map((r) => r.notificationId);

    const res = await fetch(`http://localhost:${WS_SERVICE_PORT}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        readIds: allReadIds,
      }),
      // Short timeout — this is a fire-and-forget notification
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) {
      logger.warn(`WS broadcast returned ${res.status}`);
    }
  } catch {
    // WS service might be down — that's OK, polling will catch up
  }
}
