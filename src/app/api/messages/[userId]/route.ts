// ═══════════════════════════════════════════════════════════════
// GET /api/messages/[userId]
//
// Proxy: Get messages for a user from the TokenPay service.
//
// Response: { messages: [...], unreadCount: number }
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { tokenpay } from '@/lib/tokenpay';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const result = await tokenpay.getMessages(userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Messages API] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch messages';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
