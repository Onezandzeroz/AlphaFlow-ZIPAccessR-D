import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email-service';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// POST /api/auth/forgot-password — Request password reset (public)
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      // Always return success to avoid revealing if email exists
      return NextResponse.json({ message: 'If the email exists, a reset link has been sent' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: once per 5 minutes per email
    const { allowed } = rateLimit(`forgot-password:${normalizedEmail}`, {
      maxRequests: 1,
      windowMs: 5 * 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json({ message: 'If the email exists, a reset link has been sent' });
    }

    // Find user — but don't reveal whether they exist
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: token,
          resetPasswordExpires: expiresAt,
        },
      });

      // Send password reset email — fire-and-forget so SMTP latency doesn't block the response
      sendPasswordResetEmail(user.email, token, 'da')
        .then((result) => {
          if (!result.success) {
            logger.warn(`Password reset email failed for user ${user.id}, logId=${result.logId}`);
          }
        })
        .catch((emailError) => {
          logger.warn('Failed to send password reset email:', emailError);
        });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    // Still return success to prevent email enumeration
    return NextResponse.json({ message: 'If the email exists, a reset link has been sent' });
  }
}
