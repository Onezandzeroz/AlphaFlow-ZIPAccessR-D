import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { RecurringFrequency as PrismaFrequency, RecurringStatus, Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { requireTokenPayAccess } from '@/lib/tokenpay';
import { addFrequency, parseLocalDate, todayLocal, formatDateLocal } from '@/lib/date-utils';

// ─── GET - List recurring entries for the authenticated user ──────────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    
    const where: Record<string, unknown> = { ...tenantFilter(ctx) };

    if (statusFilter && Object.values(RecurringStatus).includes(statusFilter as RecurringStatus)) {
      where.status = statusFilter;
    }

    const entries = await db.recurringEntry.findMany({
      where,
      orderBy: { nextExecution: 'asc' },
    });

    // Determine isOverdue: nextExecution < today (both local-midnight), status ACTIVE,
    // AND has been executed at least once.
    // An entry that has never been executed is not overdue (e.g. just created with past start date)
    const today = todayLocal();

    const enrichedEntries = entries.map((entry) => {
      const nextExecLocal = parseLocalDate(entry.nextExecution.toISOString().split('T')[0]);
      const isOverdue = entry.status === 'ACTIVE' && entry.lastExecuted !== null && nextExecLocal < today;
      return { ...entry, isOverdue };
    });

    return NextResponse.json({ recurringEntries: enrichedEntries });
  } catch (error) {
    logger.error('List recurring entries error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST - Create a new recurring entry template ─────────────────────────

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
    const { name, description, frequency, startDate, endDate, lines, reference, accountId, amount, vatPercent } = body;

    // Validate required fields (name, frequency, startDate always required)
    if (!name || !frequency || !startDate) {
      return NextResponse.json(
        { error: 'Missing required fields: name, frequency, startDate' },
        { status: 400 }
      );
    }

    // If no explicit lines provided, require purchase-based fields
    let resolvedLines = lines;
    if (!resolvedLines && accountId && amount !== undefined && vatPercent !== undefined) {
      // Auto-build lines for purchase-type recurring entries
      const netAmt = typeof amount === 'number' ? amount : parseFloat(amount);
      const vatPct = typeof vatPercent === 'number' ? vatPercent : parseFloat(vatPercent);
      const vatAmt = Math.round(netAmt * vatPct / 100 * 100) / 100;
      const grossAmt = Math.round((netAmt + vatAmt) * 100) / 100;

      // Look up the VAT input account (account starting with 54xx)
      const vatAccount = await db.account.findFirst({
        where: {
          number: { startsWith: '54' },
          ...tenantFilter(ctx),
          isActive: true,
        },
      });

      // Look up the bank/cash account (account 1100 or similar)
      const bankAccount = await db.account.findFirst({
        where: {
          number: { startsWith: '1100' },
          ...tenantFilter(ctx),
          isActive: true,
        },
      });

      if (!bankAccount) {
        return NextResponse.json(
          { error: 'Bank account (1100) not found. Please create it first.' },
          { status: 400 }
        );
      }

      const entryName = name || 'Purchase';
      resolvedLines = [
        {
          accountId,
          debit: netAmt,
          credit: 0,
          description: entryName,
        },
      ];

      // Only add VAT line if VAT amount > 0 and VAT account exists
      if (vatAmt > 0 && vatAccount) {
        resolvedLines.push({
          accountId: vatAccount.id,
          debit: vatAmt,
          credit: 0,
          description: `Input VAT ${vatPct}%`,
        });
      }

      // Credit bank account (gross amount)
      resolvedLines.push({
        accountId: bankAccount.id,
        debit: 0,
        credit: grossAmt,
        description: entryName,
      });
    }

    // Validate lines are present (either provided or auto-built)
    if (!resolvedLines) {
      return NextResponse.json(
        { error: 'Missing required fields: provide either lines or accountId/amount/vatPercent for purchase-based creation' },
        { status: 400 }
      );
    }

    // Validate frequency
    if (!Object.values(PrismaFrequency).includes(frequency)) {
      return NextResponse.json(
        { error: `Invalid frequency. Must be one of: ${Object.values(PrismaFrequency).join(', ')}` },
        { status: 400 }
      );
    }

    // Validate lines
    if (!Array.isArray(resolvedLines) || resolvedLines.length < 2) {
      return NextResponse.json(
        { error: 'A recurring entry must have at least 2 lines (double-entry)' },
        { status: 400 }
      );
    }

    for (const line of resolvedLines) {
      if (!line.accountId) {
        return NextResponse.json(
          { error: 'Each line must have an accountId' },
          { status: 400 }
        );
      }
      if (typeof line.debit !== 'number' || typeof line.credit !== 'number') {
        return NextResponse.json(
          { error: 'Each line must have numeric debit and credit values' },
          { status: 400 }
        );
      }
      if (line.debit < 0 || line.credit < 0) {
        return NextResponse.json(
          { error: 'Debit and credit values must be non-negative' },
          { status: 400 }
        );
      }
    }

    // Verify all referenced accounts exist and belong to the user
    const accountIds = [...new Set(resolvedLines.map((l: { accountId: string }) => l.accountId))];
        const accounts = await db.account.findMany({
      where: {
        id: { in: accountIds },
        ...tenantFilter(ctx),
        isActive: true,
      },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map(a => a.id));
      const missingIds = accountIds.filter((id: string) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate double-entry balance
    const totalDebit = resolvedLines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
    const totalCredit = resolvedLines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return NextResponse.json(
        { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
        { status: 400 }
      );
    }

    // Compute nextExecution from startDate (timezone-safe: parse as local date)
    const start = parseLocalDate(startDate);
    const nextExecution = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    const entry = await db.recurringEntry.create({
      data: {
        name,
        description: description || name,
        frequency,
        startDate: start,
        endDate: endDate ? parseLocalDate(endDate) : null,
        nextExecution,
        lines: resolvedLines,
        reference: reference || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
      },
    });

    // ─── Backfill: post all missed entries if startDate is in the past ──
    // When a recurring purchase is created with a start date before today,
    // every scheduled payment date from startDate up to (and including)
    // today must be posted as individual journal entries with their correct
    // date. This ensures the ledger is complete from the moment the recurring
    // entry is created.
    const today = todayLocal();
    const todayMs = today.getTime();
    const endDateLocal = entry.endDate
      ? parseLocalDate(entry.endDate.toISOString().split('T')[0])
      : null;

    if (start.getTime() <= todayMs) {
      let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      let postedCount = 0;
      const maxBackfill = 3650; // Safety limit: ~10 years of daily entries

      while (postedCount < maxBackfill) {
        const dotMs = new Date(
          current.getFullYear(), current.getMonth(), current.getDate()
        ).getTime();

        // Stop if past endDate
        if (endDateLocal && dotMs > endDateLocal.getTime()) break;
        // Stop if past today (we don't post for future dates)
        if (dotMs > todayMs) break;

        // Build the journal entry date string
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        const journalDescription = `${name} — ${dateStr}`;

        // Compute sequential reference number
        let sequenceNumber = 1;
        if (reference) {
          const existingCount = await db.journalEntry.count({
            where: { companyId: ctx.activeCompanyId!, reference: { startsWith: reference } },
          });
          sequenceNumber = existingCount + 1;
        }
        const ref = reference
          ? `${reference}${String(sequenceNumber).padStart(3, '0')}`
          : null;

        // Create a POSTED journal entry with the scheduled date
        await db.journalEntry.create({
          data: {
            date: new Date(current),
            description: journalDescription,
            reference: ref,
            status: 'POSTED',
            companyId: ctx.activeCompanyId!,
            lines: {
              create: (resolvedLines as Array<{ accountId: string; debit: number; credit: number; description?: string }>).map((l) => ({
                companyId: ctx.activeCompanyId!,
                accountId: l.accountId,
                debit: l.debit,
                credit: l.credit,
                description: l.description || null,
              })),
            },
          },
        });

        postedCount++;
        current = addFrequency(current, frequency as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY');
      }

      // Calculate the next execution date (first date AFTER today)
      let nextExec = new Date(current.getFullYear(), current.getMonth(), current.getDate());
      const shouldComplete = endDateLocal !== null && nextExec.getTime() > endDateLocal.getTime();

      // Update the recurring entry with correct nextExecution and lastExecuted
      await db.recurringEntry.update({
        where: { id: entry.id },
        data: {
          lastExecuted: new Date(),
          nextExecution: nextExec,
          ...(shouldComplete ? { status: 'COMPLETED' } : {}),
        },
      });

      // Re-read the updated entry for the response
      const updatedEntry = await db.recurringEntry.findFirst({
        where: { id: entry.id },
      });

      if (postedCount > 0) {
        logger.info(
          `[RECURRING-CREATE] Backfilled ${postedCount} journal entries for "${name}" (${startDate} → ${formatDateLocal(today)}) in company ${ctx.activeCompanyId}`,
        );
      }

      await auditCreate(
        ctx.id,
        'RecurringEntry',
        entry.id,
        { name, description: description || name, frequency, startDate, endDate, reference, lineCount: resolvedLines.length, totalDebit, totalCredit, backfilledCount: postedCount },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ recurringEntry: updatedEntry || entry, backfilledCount: postedCount }, { status: 201 });
    }

    await auditCreate(
      ctx.id,
      'RecurringEntry',
      entry.id,
      { name, description: description || name, frequency, startDate, endDate, reference, lineCount: resolvedLines.length, totalDebit, totalCredit },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ recurringEntry: entry }, { status: 201 });
  } catch (error) {
    logger.error('Create recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── PUT - Update a recurring entry template ──────────────────────────────

export async function PUT(request: NextRequest) {
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
    const { id, name, description, frequency, status, endDate, lines, reference } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    
    // Fetch existing entry
    const existing = await db.recurringEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
    }

    // Validate status if provided
    if (status !== undefined && !Object.values(RecurringStatus).includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${Object.values(RecurringStatus).join(', ')}` },
        { status: 400 }
      );
    }

    // Validate frequency if provided
    if (frequency !== undefined && !Object.values(PrismaFrequency).includes(frequency)) {
      return NextResponse.json(
        { error: `Invalid frequency. Must be one of: ${Object.values(PrismaFrequency).join(', ')}` },
        { status: 400 }
      );
    }

    // If lines are provided, validate them
    if (lines !== undefined) {
      if (!Array.isArray(lines) || lines.length < 2) {
        return NextResponse.json(
          { error: 'A recurring entry must have at least 2 lines (double-entry)' },
          { status: 400 }
        );
      }

      for (const line of lines) {
        if (!line.accountId) {
          return NextResponse.json(
            { error: 'Each line must have an accountId' },
            { status: 400 }
          );
        }
        if (typeof line.debit !== 'number' || typeof line.credit !== 'number') {
          return NextResponse.json(
            { error: 'Each line must have numeric debit and credit values' },
            { status: 400 }
          );
        }
        if (line.debit < 0 || line.credit < 0) {
          return NextResponse.json(
            { error: 'Debit and credit values must be non-negative' },
            { status: 400 }
          );
        }
      }

      // Verify all referenced accounts exist and belong to the user
      const accountIds = [...new Set(lines.map((l: { accountId: string }) => l.accountId))];
      const accountsForUpdate = await db.account.findMany({
        where: {
          id: { in: accountIds },
          ...tenantFilter(ctx),
          isActive: true,
        },
      });

      if (accountsForUpdate.length !== accountIds.length) {
        const foundIds = new Set(accountsForUpdate.map(a => a.id));
        const missingIds = accountIds.filter((aid: string) => !foundIds.has(aid));
        return NextResponse.json(
          { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate double-entry balance
      const totalDebit = lines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
      const totalCredit = lines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return NextResponse.json(
          { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
          { status: 400 }
        );
      }
    }

    // Build update data — only allowed fields
    const updateData: Prisma.RecurringEntryUpdateInput = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (status !== undefined) updateData.status = status;
    if (endDate !== undefined) updateData.endDate = endDate ? parseLocalDate(endDate) : null;
    if (lines !== undefined) updateData.lines = lines;
    if (reference !== undefined) updateData.reference = reference || null;

    // Recalculate nextExecution if frequency or dates change
    const frequencyChanged = frequency !== undefined && frequency !== existing.frequency;
    const startDateChanged = false; // startDate is immutable after creation
    const endDateChanged = endDate !== undefined;

    if (frequencyChanged || endDateChanged) {
      // Use current nextExecution as the base, recalculating from the existing lastExecuted or startDate
      const baseDate = existing.lastExecuted
        ? parseLocalDate(existing.lastExecuted.toISOString().split('T')[0])
        : parseLocalDate(existing.startDate.toISOString().split('T')[0]);

      const newFrequency = frequency || existing.frequency;
      const recalculatedNext = addFrequency(baseDate, newFrequency as PrismaFrequency);

      // If recalculated next is past endDate, set to COMPLETED
      const newEndDate = endDate !== undefined ? (endDate ? parseLocalDate(endDate) : null) : existing.endDate;

      if (newEndDate && recalculatedNext > newEndDate) {
        updateData.status = 'COMPLETED' as RecurringStatus;
      }

      updateData.nextExecution = recalculatedNext;
    }

    const entry = await db.recurringEntry.update({
      where: { id },
      data: updateData,
    });

    const oldData: Record<string, unknown> = {
      name: existing.name,
      description: existing.description,
      frequency: existing.frequency,
      status: existing.status,
      endDate: existing.endDate,
      reference: existing.reference,
    };

    const newData: Record<string, unknown> = {
      name: entry.name,
      description: entry.description,
      frequency: entry.frequency,
      status: entry.status,
      endDate: entry.endDate,
      reference: entry.reference,
      nextExecution: entry.nextExecution,
    };

    await auditUpdate(
      ctx.id,
      'RecurringEntry',
      id,
      oldData,
      newData,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ recurringEntry: entry });
  } catch (error) {
    logger.error('Update recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── DELETE - Soft-cancel a recurring entry (set status to COMPLETED) ─────

export async function DELETE(request: NextRequest) {
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

    
    const existing = await db.recurringEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
    }

    if (existing.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Recurring entry is already completed/cancelled' },
        { status: 400 }
      );
    }

    const entry = await db.recurringEntry.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    await auditCancel(
      ctx.id,
      'RecurringEntry',
      id,
      'Cancelled via DELETE request',
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ recurringEntry: entry });
  } catch (error) {
    logger.error('Delete recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
