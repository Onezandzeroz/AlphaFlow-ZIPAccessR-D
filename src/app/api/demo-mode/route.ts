import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext, SESSION_COOKIE_NAME } from '@/lib/session';
import { blockOversightMutation } from '@/lib/rbac';
import { seedDemoCompany } from '@/lib/seed-demo-company';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';
import { auditLog, requestMetadata } from '@/lib/audit';

// ─── GET: Check demo mode status ──────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ctx.isDemoCompany is now verified against the demo company's CVR number
    // (see session.ts getAuthContext), so it's safe to use directly.
    const isDemoCompany = ctx.isDemoCompany;

    return NextResponse.json({
      demoModeEnabled: isDemoCompany,
      isDemoCompany,
      demoCompanyName: isDemoCompany ? ctx.activeCompanyName : null,
    });
  } catch (error) {
    logger.error('[Demo Mode GET] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST: Enter / Exit demo mode ─────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const body = await request.json();
    const { action } = body as { action: 'enter' | 'exit' | 'reseed' };

    if (action !== 'enter' && action !== 'exit' && action !== 'reseed') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "enter", "exit", or "reseed".' },
        { status: 400 }
      );
    }

    // ── Reseed demo company (any user, destructive) ────────────
    if (action === 'reseed') {

      const demoCompany = await db.company.findFirst({
        where: { isDemo: true, isActive: true, cvrNumber: '29876543' },
      });
      if (!demoCompany) {
        return NextResponse.json({ error: 'Demo company not found' }, { status: 404 });
      }

      // Delete all demo data in dependency order (child → parent)
      await db.$transaction([
        db.journalEntryLine.deleteMany({ where: { journalEntry: { companyId: demoCompany.id } } }),
        db.journalEntry.deleteMany({ where: { companyId: demoCompany.id } }),
        db.bankStatementLine.deleteMany({ where: { bankStatement: { companyId: demoCompany.id } } }),
        db.bankStatement.deleteMany({ where: { companyId: demoCompany.id } }),
        db.budgetEntry.deleteMany({ where: { budget: { companyId: demoCompany.id } } }),
        db.budget.deleteMany({ where: { companyId: demoCompany.id } }),
        db.transaction.deleteMany({ where: { companyId: demoCompany.id } }),
        db.invoice.deleteMany({ where: { companyId: demoCompany.id } }),
        db.fiscalPeriod.deleteMany({ where: { companyId: demoCompany.id } }),
        db.contact.deleteMany({ where: { companyId: demoCompany.id } }),
        db.account.deleteMany({ where: { companyId: demoCompany.id } }),
        db.recurringEntry.deleteMany({ where: { companyId: demoCompany.id } }),
        db.bankConnection.deleteMany({ where: { companyId: demoCompany.id } }),
      ]);

      // Re-seed with corrected data
      await seedDemoCompany(demoCompany.id, ctx.id);

      logger.info('[Demo Mode] Reseeded demo company:', demoCompany.id);
      await auditLog({
        action: 'UPDATE',
        entityType: 'Company',
        entityId: demoCompany.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: { reseed: { old: true, new: true } },
        metadata: requestMetadata(request),
      });

      return NextResponse.json({ message: 'Demo company reseeded successfully' });
    }

    // ── Get current session token for updating activeCompanyId ──
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (action === 'enter') {
      // ── Enter demo mode ──────────────────────────────────────

      // ctx.isDemoCompany is now verified against the demo company's CVR number
      // (see session.ts getAuthContext), so if it's true, we're already in the demo company.
      // Even when already in demo mode, we ALWAYS re-seed to guarantee fresh data.
      // The demo seed is fast and idempotent — stale data is worse than a brief delay.

      // Find the shared demo company (identified by CVR number)
      let demoCompany = await db.company.findFirst({
        where: {
          isActive: true,
          cvrNumber: '29876543',
        },
      });
      let demoCompanyId: string;

      if (!demoCompany) {
        // Inherit AppOwner widget defaults for the demo company
        const appOwnerCompany = await db.company.findUnique({
          where: { name: 'AlphaAi' },
          select: { dashboardWidgets: true },
        });
        const inheritedWidgets = appOwnerCompany?.dashboardWidgets as Record<string, unknown> | undefined;

        // Create the shared demo company
        demoCompany = await db.company.create({
          data: {
            name: 'Nordisk Erhverv ApS',
            address: 'Vesterbrogade 42, 3. sal',
            phone: '+45 33 12 34 56',
            email: 'info@nordiskerhverv.dk',
            cvrNumber: '29876543',
            companyType: 'ApS',
            invoicePrefix: 'NE',
            invoiceTerms: 'Netto 30 dage',
            nextInvoiceSequence: 1,
            currentYear: new Date().getFullYear(),
            bankName: 'Nordea',
            bankAccount: '1234 567890',
            bankRegistration: '2190',
            bankIban: 'DK9520001234567890',
            bankStreet: 'Strøget 10',
            bankCity: 'København K',
            bankCountry: 'Danmark',
            isDemo: true,
            isActive: true,
            ...(inheritedWidgets && { dashboardWidgets: inheritedWidgets }),
          },
        });

        demoCompanyId = demoCompany.id;

        // We need a system user ID for seeding — use the current user
        const systemUserId = ctx.id;

        // Seed the demo company data
        await seedDemoCompany(demoCompanyId, systemUserId);

        logger.info('[Demo Mode] Created and seeded demo company:', demoCompanyId);
      } else {
        // Demo company already exists — ensure data is up-to-date by re-seeding.
        // The seed engine is deterministic and fast; this guarantees fresh,
        // correct data regardless of when the company was first created.
        demoCompanyId = demoCompany.id;

        // Delete all existing demo data in dependency order (child → parent)
        await db.$transaction([
          db.journalEntryLine.deleteMany({ where: { journalEntry: { companyId: demoCompany.id } } }),
          db.journalEntry.deleteMany({ where: { companyId: demoCompany.id } }),
          db.bankStatementLine.deleteMany({ where: { bankStatement: { companyId: demoCompany.id } } }),
          db.bankStatement.deleteMany({ where: { companyId: demoCompany.id } }),
          db.budgetEntry.deleteMany({ where: { budget: { companyId: demoCompany.id } } }),
          db.budget.deleteMany({ where: { companyId: demoCompany.id } }),
          db.transaction.deleteMany({ where: { companyId: demoCompany.id } }),
          db.invoice.deleteMany({ where: { companyId: demoCompany.id } }),
          db.fiscalPeriod.deleteMany({ where: { companyId: demoCompany.id } }),
          db.contact.deleteMany({ where: { companyId: demoCompany.id } }),
          db.account.deleteMany({ where: { companyId: demoCompany.id } }),
          db.recurringEntry.deleteMany({ where: { companyId: demoCompany.id } }),
          db.bankConnection.deleteMany({ where: { companyId: demoCompany.id } }),
        ]);

        // Re-seed with fresh, corrected data
        await seedDemoCompany(demoCompanyId, ctx.id);

        logger.info('[Demo Mode] Re-seeded existing demo company:', demoCompanyId);
      }

      // Ensure the user has a UserCompany membership for the demo company
      const existingMembership = await db.userCompany.findUnique({
        where: {
          userId_companyId: { userId: ctx.id, companyId: demoCompanyId },
        },
      });

      if (!existingMembership) {
        await db.userCompany.create({
          data: {
            userId: ctx.id,
            companyId: demoCompanyId,
            role: 'VIEWER', // Read-only role — writes are blocked by isDemoCompany guard
          },
        });
      }

      // Save the user's current (original) company ID in userPrefs
      const user = await db.user.findUnique({
        where: { id: ctx.id },
        select: { userPrefs: true },
      });

      const currentPrefs = user?.userPrefs
        ? (user.userPrefs as Record<string, unknown>)
        : {};

      // Only save the original company ID if we're not already in demo
      if (ctx.activeCompanyId && !currentPrefs.originalCompanyId) {
        currentPrefs.originalCompanyId = ctx.activeCompanyId;
        await db.user.update({
          where: { id: ctx.id },
          data: { userPrefs: currentPrefs },
        });
      }

      // Update session's activeCompanyId to the demo company
      if (token) {
        await db.session.update({
          where: { token },
          data: { activeCompanyId: demoCompanyId },
        });
      }

      // Set demoModeEnabled on the User model
      await db.user.update({
        where: { id: ctx.id },
        data: { demoModeEnabled: true },
      });

      await auditLog({
        action: 'UPDATE',
        entityType: 'User',
        entityId: ctx.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: { demoModeEnabled: { old: false, new: true } },
        metadata: requestMetadata(request),
      });

      return NextResponse.json({
        message: 'Demo mode enabled',
        demoModeEnabled: true,
        isDemoCompany: true,
        activeCompanyId: demoCompanyId,
        activeCompanyName: demoCompany.name,
      });
    }

    // ── Exit demo mode ──────────────────────────────────────────

    // If not in the demo company, just clear the flag
    if (!ctx.isDemoCompany) {
      await db.user.update({
        where: { id: ctx.id },
        data: { demoModeEnabled: false },
      });

      await auditLog({
        action: 'UPDATE',
        entityType: 'User',
        entityId: ctx.id,
        userId: ctx.id,
        companyId: ctx.activeCompanyId,
        changes: { demoModeEnabled: { old: true, new: false } },
        metadata: requestMetadata(request),
      });

      return NextResponse.json({
        message: 'Demo mode exited',
        demoModeEnabled: false,
        isDemoCompany: false,
        activeCompanyId: ctx.activeCompanyId,
        activeCompanyName: ctx.activeCompanyName,
      });
    }

    // Read the user's original company ID from userPrefs
    const user = await db.user.findUnique({
      where: { id: ctx.id },
      select: { userPrefs: true },
    });

    const prefs = user?.userPrefs ? (user.userPrefs as Record<string, any>) : {};
    let originalCompanyId: string | null = (prefs.originalCompanyId as string) ?? null;

    // If no original company ID, find the user's first non-demo company
    if (!originalCompanyId) {
      const firstNonDemoCompany = await db.userCompany.findFirst({
        where: {
          userId: ctx.id,
          company: { isDemo: false, isActive: true },
        },
        orderBy: { joinedAt: 'asc' },
        select: { companyId: true },
      });
      originalCompanyId = firstNonDemoCompany?.companyId ?? null;
    }

    // Validate the original company still exists and is active
    if (originalCompanyId) {
      const originalCompany = await db.company.findUnique({
        where: { id: originalCompanyId },
        select: { id: true, name: true, isActive: true },
      });

      if (!originalCompany || !originalCompany.isActive) {
        // Original company is gone, find another non-demo company
        const fallback = await db.userCompany.findFirst({
          where: {
            userId: ctx.id,
            company: { isDemo: false, isActive: true },
          },
          orderBy: { joinedAt: 'asc' },
          select: { companyId: true },
        });
        originalCompanyId = fallback?.companyId ?? null;
      }
    }

    // Update session's activeCompanyId back to the original company
    if (token && originalCompanyId) {
      await db.session.update({
        where: { token },
        data: { activeCompanyId: originalCompanyId },
      });
    }

    // Set demoModeEnabled = false
    await db.user.update({
      where: { id: ctx.id },
      data: { demoModeEnabled: false },
    });

    await auditLog({
      action: 'UPDATE',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: { demoModeEnabled: { old: true, new: false } },
      metadata: requestMetadata(request),
    });

    // Clear the originalCompanyId from userPrefs
    if (prefs.originalCompanyId) {
      delete prefs.originalCompanyId;
      await db.user.update({
        where: { id: ctx.id },
        data: { userPrefs: prefs },
      });
    }

    // Get the active company name for the response
    let activeCompanyName: string | null = null;
    if (originalCompanyId) {
      const company = await db.company.findUnique({
        where: { id: originalCompanyId },
        select: { name: true },
      });
      activeCompanyName = company?.name ?? null;
    }

    return NextResponse.json({
      message: 'Demo mode exited',
      demoModeEnabled: false,
      isDemoCompany: false,
      activeCompanyId: originalCompanyId,
      activeCompanyName,
    });
  } catch (error) {
    logger.error('[Demo Mode POST] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
