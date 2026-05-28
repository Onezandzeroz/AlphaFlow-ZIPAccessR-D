import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { requireTokenPayAccess } from '@/lib/tokenpay';
import { addFrequency, parseLocalDate, todayLocal } from '@/lib/date-utils';

// ─── POST - Execute a single recurring entry (create journal entry & advance) ─

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
        { status: 400 },
      );
    }

    // ─── 1. Fetch the recurring entry ─────────────────────────────────
    const entry = await db.recurringEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Recurring entry not found' },
        { status: 404 },
      );
    }

    if (entry.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Cannot execute a ${entry.status.toLowerCase()} recurring entry` },
        { status: 400 },
      );
    }

    // ─── 2. Parse and validate journal lines ─────────────────────────
    const parsedLines = entry.lines as Array<{
      accountId: string;
      debit: number;
      credit: number;
      description?: string;
    }>;

    if (!Array.isArray(parsedLines) || parsedLines.length < 2) {
      return NextResponse.json(
        { error: 'Recurring entry has invalid lines' },
        { status: 400 },
      );
    }

    // Verify all referenced accounts still exist and are active
    const accountIds = [...new Set(parsedLines.map((l) => l.accountId))];
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds }, companyId: entry.companyId, isActive: true },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map((a) => a.id));
      const missingIds = accountIds.filter((aid) => !foundIds.has(aid));
      return NextResponse.json(
        { error: `Accounts no longer active: ${missingIds.join(', ')}` },
        { status: 400 },
      );
    }

    // ─── 3. Compute sequential reference number ─────────────────────
    let sequenceNumber = 1;
    if (entry.reference) {
      const existingCount = await db.journalEntry.count({
        where: { companyId: entry.companyId, reference: { startsWith: entry.reference } },
      });
      sequenceNumber = existingCount + 1;
    }

    const ref = entry.reference
      ? `${entry.reference}${String(sequenceNumber).padStart(3, '0')}`
      : null;

    // ─── 4. Determine execution date & build description ────────────
    // The execution date is the current nextExecution (the scheduled date)
    const executionDate = parseLocalDate(entry.nextExecution.toISOString().split('T')[0]);
    const dateStr = `${executionDate.getFullYear()}-${String(executionDate.getMonth() + 1).padStart(2, '0')}-${String(executionDate.getDate()).padStart(2, '0')}`;
    const journalDescription = `${entry.name} — ${dateStr}`;

    // ─── 5. Create a POSTED journal entry ───────────────────────────
    const journalEntry = await db.journalEntry.create({
      data: {
        date: executionDate,
        description: journalDescription,
        reference: ref,
        status: 'POSTED',
        companyId: entry.companyId,
        lines: {
          create: parsedLines.map((l) => ({
            companyId: entry.companyId,
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description || null,
          })),
        },
      },
    });

    // ─── 6. Calculate next execution date (timezone-safe) ───────────
    let nextExec = addFrequency(executionDate, entry.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY');
    const today = todayLocal();
    const endDateLocal = entry.endDate
      ? parseLocalDate(entry.endDate.toISOString().split('T')[0])
      : null;

    // Fast-forward past already-passed dates
    while (nextExec <= today) {
      if (endDateLocal && nextExec > endDateLocal) break;
      nextExec = addFrequency(nextExec, entry.frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY');
    }

    // ─── 7. Check if entry should be COMPLETED ──────────────────────
    const shouldComplete = endDateLocal !== null && nextExec > endDateLocal;

    // ─── 8. Update recurring entry ──────────────────────────────────
    const updatedEntry = await db.recurringEntry.update({
      where: { id },
      data: {
        lastExecuted: new Date(),
        nextExecution: nextExec,
        ...(shouldComplete ? { status: 'COMPLETED' } : {}),
      },
    });

    // ─── 9. Audit trail ─────────────────────────────────────────────
    await auditCreate(
      ctx.id,
      'JournalEntry',
      journalEntry.id,
      {
        source: 'RecurringEntry',
        recurringEntryId: entry.id,
        recurringEntryName: entry.name,
        executionDate: dateStr,
        lineCount: parsedLines.length,
        totalDebit: parsedLines.reduce((s, l) => s + l.debit, 0),
        totalCredit: parsedLines.reduce((s, l) => s + l.credit, 0),
        nextExecution: nextExec.toISOString(),
        ...(shouldComplete ? { completed: true } : {}),
      },
      requestMetadata(request),
      ctx.activeCompanyId,
    );

    logger.info(
      `[RECURRING-EXECUTE] Manually executed "${entry.name}" for company ${entry.companyId} → journal ${journalEntry.id}, next: ${dateStr}`,
    );

    return NextResponse.json({
      recurringEntry: updatedEntry,
      journalEntryId: journalEntry.id,
    });
  } catch (error) {
    logger.error('Execute recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
