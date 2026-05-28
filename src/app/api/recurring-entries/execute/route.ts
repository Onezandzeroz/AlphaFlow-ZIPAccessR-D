import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { RecurringFrequency as PrismaFrequency, RecurringStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { requireTokenPayAccess } from '@/lib/tokenpay';
import { addFrequency, parseLocalDate, todayLocal } from '@/lib/date-utils';

// ─── Helper: Calculate next execution date based on frequency (timezone-safe) ──
// Uses shared addFrequency from date-utils.ts. Kept here as a thin wrapper
// that ensures the input is always a local-midnight date.
function advanceByFrequency(baseDate: Date, frequency: string): Date {
  const localBase = parseLocalDate(baseDate.toISOString().split('T')[0]);
  return addFrequency(localBase, frequency as PrismaFrequency);
}

// ─── POST - Execute a recurring entry: create a POSTED journal entry ──────

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const accessDenied = await requireTokenPayAccess(ctx.id);
    if (accessDenied) return accessDenied;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    // 1. Fetch the recurring entry, validate it's ACTIVE
    const recurring = await db.recurringEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!recurring) {
      return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
    }

    if (recurring.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Cannot execute a recurring entry with status: ${recurring.status}. Only ACTIVE entries can be executed.` },
        { status: 400 }
      );
    }

    // Parse lines from JSON
    const parsedLines = recurring.lines as Array<{ accountId: string; debit: number; credit: number; description?: string }>;

    // Verify all referenced accounts still exist and are active
    const accountIds = [...new Set(parsedLines.map(l => l.accountId))];
    // demo filter now included in tenantFilter
    const accounts = await db.account.findMany({
      where: {
        id: { in: accountIds },
        ...tenantFilter(ctx),
        isActive: true,
      },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map(a => a.id));
      const missingIds = accountIds.filter(aid => !foundIds.has(aid));
      return NextResponse.json(
        { error: `Some accounts in the recurring entry are no longer active or valid: ${missingIds.join(', ')}` },
        { status: 400 }
      );
    }

    // 4. Compute sequential reference number
    // Count existing journal entries whose reference starts with the recurring entry's reference prefix
    let sequenceNumber = 1;
    if (recurring.reference) {
      const prefix = recurring.reference;
      const existingCount = await db.journalEntry.count({
        where: {
          ...tenantFilter(ctx),
          reference: { startsWith: prefix },
        },
      });
      sequenceNumber = existingCount + 1;
    }

    const reference = recurring.reference
      ? `${recurring.reference}${String(sequenceNumber).padStart(3, '0')}`
      : null;

    // Build journal entry description: recurring name + date
    const executionDate = recurring.nextExecution;
    const dateStr = executionDate.toISOString().split('T')[0];
    const journalDescription = `${recurring.name} — ${dateStr}`;

    // 2. Create a POSTED journal entry with the recurring entry's lines
    const journalEntry = await db.journalEntry.create({
      data: {
        date: executionDate,
        description: journalDescription,
        reference,
        status: 'POSTED',
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        lines: {
          create: parsedLines.map(l => ({
            companyId: ctx.activeCompanyId!,
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description || null,
          })),
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    // 5. Calculate next execution date — timezone-safe local-midnight arithmetic
    let nextExecution = advanceByFrequency(executionDate, recurring.frequency);
    const today = todayLocal();
    const endDateLocal = recurring.endDate
      ? parseLocalDate(recurring.endDate.toISOString().split('T')[0])
      : null;

    // Fast-forward past any already-passed dates (handles overdue entries)
    // All comparisons use local-midnight dates — no UTC vs local confusion
    while (nextExecution <= today) {
      if (endDateLocal && nextExecution > endDateLocal) break;
      nextExecution = advanceByFrequency(nextExecution, recurring.frequency);
    }

    // 6. Determine if recurring entry should be set to COMPLETED
    const statusUpdate: RecurringStatus | undefined =
      (endDateLocal && nextExecution > endDateLocal)
        ? 'COMPLETED'
        : undefined;

    // 5. Update recurring entry
    await db.recurringEntry.update({
      where: { id: recurring.id },
      data: {
        lastExecuted: new Date(),
        nextExecution,
        ...(statusUpdate && { status: statusUpdate }),
      },
    });
    const updatedRecurring = await db.recurringEntry.findFirst({
      where: { id: recurring.id },
    });

    // 7. Log to audit trail
    await auditCreate(
      ctx.id,
      'JournalEntry',
      journalEntry.id,
      {
        source: 'RecurringEntry',
        recurringEntryId: recurring.id,
        recurringEntryName: recurring.name,
        date: dateStr,
        description: journalDescription,
        reference,
        status: 'POSTED',
        lineCount: parsedLines.length,
        totalDebit: parsedLines.reduce((sum, l) => sum + l.debit, 0),
        totalCredit: parsedLines.reduce((sum, l) => sum + l.credit, 0),
      },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({
      journalEntry,
      recurringEntry: updatedRecurring,
    });
  } catch (error) {
    logger.error('Execute recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
