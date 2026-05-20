import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { auditAuth, requestMetadata } from '@/lib/audit';
import { sendVerificationEmail } from '@/lib/email-service';
import { logger } from '@/lib/logger';
import { tokenpay, grantTrial } from '@/lib/tokenpay';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: max 3 registrations per minute per IP
    const clientIp = getClientIp(request);
    const { allowed } = rateLimit(`register:${clientIp}`, {
      maxRequests: 3,
      windowMs: 60 * 1000,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, password, businessName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      );
    }

    // Determine company name and check uniqueness BEFORE creating the user
    // to avoid orphaned user records on company name collision
    const companyName = businessName || normalizedEmail.split('@')[0];

    // Enforce unique company name — no two tenants may share a name
    const existingCompany = await db.company.findFirst({
      where: { name: companyName },
    });
    if (existingCompany) {
      return NextResponse.json(
        { error: `A company named "${companyName}" already exists. Please choose a different business name.` },
        { status: 409 }
      );
    }

    // Hash password with bcrypt
    const hashedPassword = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        businessName,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        demoModeEnabled: true,
      },
    });

    // Inherit AppOwner widget defaults (AlphaAi company) for new tenant companies
    const appOwnerCompany = await db.company.findUnique({
      where: { name: 'AlphaAi' },
      select: { dashboardWidgets: true },
    });
    const inheritedWidgets = appOwnerCompany?.dashboardWidgets ?? undefined;

    const company = await db.company.create({
      data: {
        name: companyName,
        email: normalizedEmail,
        cvrNumber: '',
        address: '',
        phone: '',
        bankName: '',
        bankAccount: '',
        bankRegistration: '',
        invoicePrefix: 'INV',
        currentYear: new Date().getFullYear(),
        isDemo: false,
        ...(inheritedWidgets !== undefined && { dashboardWidgets: inheritedWidgets as Record<string, unknown> }),
      },
    });

    // Assign user as OWNER of the company
    await db.userCompany.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: 'OWNER',
      },
    });

    // Send verification email — fire-and-forget so SMTP latency doesn't block the response
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await db.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: verificationToken },
    });
    sendVerificationEmail(normalizedEmail, verificationToken, 'da', company.id)
      .then((emailResult) => {
        if (!emailResult.success) {
          logger.warn(`Verification email failed to send for ${normalizedEmail}, logId=${emailResult.logId}`);
        }
      })
      .catch((emailError) => {
        logger.warn('Failed to send verification email during registration:', emailError);
      });

    // NOTE: We do NOT auto-seed the chart of accounts here.
    // The onboarding flow (Step 2) lets the user explicitly seed their accounts,
    // so the onboarding progress correctly starts at 0/4 for new users.
    // Seeding is available via /api/accounts/seed or the Chart of Accounts page.

    // NOTE: We do NOT create a session here.
    // The user must verify their email before they can log in.
    // The register form shows a "check your email" screen instead.

    // (Notification to app owner is sent on first complete company save — see PUT /api/company)

    // Audit registration
    await auditAuth(user.id, 'REGISTER', requestMetadata(request), company.id);

    // ─── Auto-grant 60-day trial access (fire-and-forget) ───────
    // Grants read_write access without requiring a .tbkey proof file.
    // Uses 'trial_granted' reason code in TokenPay access logs.
    // The existing cron will auto-downgrade to read_only when the trial expires.
    grantTrial(user.id, normalizedEmail, user.businessName || undefined)
      .then((result) => {
        logger.info(`[REGISTER] Trial granted to ${normalizedEmail}: expires ${result.trialExpiry}`);
      })
      .catch((err) => {
        logger.warn(`[REGISTER] Failed to grant trial to ${normalizedEmail}:`, err);
      });

    // Return success — the client will show "check your email" screen
    return NextResponse.json({
      success: true,
      email: user.email,
      companyName: company.name,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
