/**
 * Recurring Entry Scheduler
 *
 * Automatically executes recurring entries on their scheduled dates.
 *
 * How it works:
 * 1. Runs daily (configurable via cron) at a set time
 * 2. Queries all ACTIVE recurring entries where nextExecution <= today
 * 3. For each due entry, creates a POSTED journal entry (same as manual execute)
 * 4. Advances nextExecution to the next scheduled date
 * 5. Marks entries as COMPLETED if they've passed their endDate
 *
 * Design decisions:
 * - Uses the same execution logic as the manual /api/recurring-entries/execute endpoint
 * - Handles multi-tenant scoping (iterates all companies)
 * - Logs each execution for audit trail
 * - Dedup: skips if an entry was already executed today
 * - Safe: won't execute PAUSED or COMPLETED entries
 */

import cron, { type ScheduledTask } from 'node-cron';
import { db } from '@/lib/db';
import { RecurringFrequency } from '@prisma/client';
import { logger } from '@/lib/logger';
import { parseLocalDate, todayLocal, formatDateLocal } from '@/lib/date-utils';

// ─── Types ────────────────────────────────────────────────────────────────

interface ExecutionResult {
  entryId: string;
  entryName: string;
  companyId: string;
  success: boolean;
  error?: string;
  journalEntryId?: string;
}

interface SchedulerRunSummary {
  timestamp: string;
  totalChecked: number;
  totalExecuted: number;
  totalSkipped: number;
  totalErrors: number;
  results: ExecutionResult[];
}

// ─── State ─────────────────────────────────────────────────────────────────

const scheduledTasks: ScheduledTask[] = [];
let _schedulerStarted = false;
const LAST_EXECUTIONS: Map<string, string> = new Map(); // entryId → dateStr (dedup)

// ─── Core: Add frequency to a date ────────────────────────────────────────
// Duplicated from date-utils.ts because this file runs in Node.js (server)
// and the scheduler doesn't go through Next.js bundler.

function addFrequency(baseDate: Date, frequency: string): Date {
  const next = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

// ─── Core: Execute a single recurring entry ───────────────────────────────
// This mirrors the logic in /api/recurring-entries/execute/route.ts

async function executeRecurringEntry(entry: {
  id: string;
  name: string;
  description: string;
  frequency: string;
  nextExecution: Date;
  startDate: Date;
  endDate: Date | null;
  lines: unknown;
  reference: string | null;
  companyId: string;
}): Promise<ExecutionResult> {
  const { id, name, description, frequency, nextExecution: executionDate, endDate, lines, reference, companyId } = entry;

  try {
    // 1. Parse and validate lines
    const parsedLines = lines as Array<{ accountId: string; debit: number; credit: number; description?: string }>;

    // 2. Verify all referenced accounts still exist and are active
    const accountIds = [...new Set(parsedLines.map(l => l.accountId))];
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds }, companyId, isActive: true },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map(a => a.id));
      const missingIds = accountIds.filter(aid => !foundIds.has(aid));
      return {
        entryId: id,
        entryName: name,
        companyId,
        success: false,
        error: `Accounts no longer active: ${missingIds.join(', ')}`,
      };
    }

    // 3. Compute sequential reference number
    let sequenceNumber = 1;
    if (reference) {
      const existingCount = await db.journalEntry.count({
        where: { companyId, reference: { startsWith: reference } },
      });
      sequenceNumber = existingCount + 1;
    }

    const ref = reference ? `${reference}${String(sequenceNumber).padStart(3, '0')}` : null;

    // 4. Build journal entry description
    const executionDateLocal = parseLocalDate(executionDate.toISOString().split('T')[0]);
    const dateStr = formatDateLocal(executionDateLocal);
    const journalDescription = `${name} — ${dateStr}`;

    // 5. Create a POSTED journal entry
    const journalEntry = await db.journalEntry.create({
      data: {
        date: executionDate,
        description: journalDescription,
        reference: ref,
        status: 'POSTED',
        companyId,
        lines: {
          create: parsedLines.map(l => ({
            companyId,
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description || null,
          })),
        },
      },
    });

    // 6. Calculate next execution date — timezone-safe
    let nextExec = addFrequency(executionDateLocal, frequency);
    const today = todayLocal();
    const endDateLocal = endDate ? parseLocalDate(endDate.toISOString().split('T')[0]) : null;

    // Fast-forward past already-passed dates
    while (nextExec <= today) {
      if (endDateLocal && nextExec > endDateLocal) break;
      nextExec = addFrequency(nextExec, frequency);
    }

    // 7. Check if entry should be COMPLETED
    const shouldComplete = endDateLocal && nextExec > endDateLocal;

    // 8. Update recurring entry
    await db.recurringEntry.update({
      where: { id },
      data: {
        lastExecuted: new Date(),
        nextExecution: nextExec,
        ...(shouldComplete && { status: 'COMPLETED' }),
      },
    });

    logger.info(`[RECURRING-SCHEDULER] Executed "${name}" for company ${companyId} → journal ${journalEntry.id}, next: ${formatDateLocal(nextExec)}`);

    return {
      entryId: id,
      entryName: name,
      companyId,
      success: true,
      journalEntryId: journalEntry.id,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[RECURRING-SCHEDULER] Failed to execute "${name}" for company ${companyId}:`, error);
    return {
      entryId: id,
      entryName: name,
      companyId,
      success: false,
      error: msg,
    };
  }
}

// ─── Main: Run the daily execution cycle ──────────────────────────────────

async function runDailyExecutionCycle(): Promise<SchedulerRunSummary> {
  const today = todayLocal();
  const todayStr = formatDateLocal(today);

  logger.info(`[RECURRING-SCHEDULER] Starting daily execution cycle for ${todayStr}`);

  const summary: SchedulerRunSummary = {
    timestamp: new Date().toISOString(),
    totalChecked: 0,
    totalExecuted: 0,
    totalSkipped: 0,
    totalErrors: 0,
    results: [],
  };

  try {
    // Find all ACTIVE recurring entries where nextExecution <= today
    // We use the raw ISO date comparison since Prisma stores UTC midnight
    // and our dates are now consistently created as local midnight
    const dueEntries = await db.recurringEntry.findMany({
      where: {
        status: 'ACTIVE',
        nextExecution: { lte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) },
      },
      orderBy: { nextExecution: 'asc' },
    });

    summary.totalChecked = dueEntries.length;

    if (dueEntries.length === 0) {
      logger.info('[RECURRING-SCHEDULER] No entries due for execution');
      return summary;
    }

    logger.info(`[RECURRING-SCHEDULER] Found ${dueEntries.length} due entries`);

    for (const entry of dueEntries) {
      // Dedup: skip if we already executed this entry today
      const lastExecKey = entry.id;
      const lastExecDate = LAST_EXECUTIONS.get(lastExecKey);

      if (lastExecDate === todayStr) {
        summary.totalSkipped++;
        continue;
      }

      // Also check DB: if lastExecuted is today, skip
      if (entry.lastExecuted) {
        const lastExecLocal = parseLocalDate(entry.lastExecuted.toISOString().split('T')[0]);
        if (lastExecLocal.getTime() === today.getTime()) {
          summary.totalSkipped++;
          LAST_EXECUTIONS.set(lastExecKey, todayStr);
          continue;
        }
      }

      const result = await executeRecurringEntry(entry);
      summary.results.push(result);

      if (result.success) {
        summary.totalExecuted++;
        LAST_EXECUTIONS.set(lastExecKey, todayStr);
      } else {
        summary.totalErrors++;
      }
    }

    logger.info(
      `[RECURRING-SCHEDULER] Cycle complete: ${summary.totalExecuted} executed, ${summary.totalSkipped} skipped, ${summary.totalErrors} errors`,
    );
  } catch (error) {
    logger.error('[RECURRING-SCHEDULER] Daily execution cycle error:', error);
  }

  return summary;
}

// ─── Public API: Start / Stop ────────────────────────────────────────────

export function startRecurringScheduler(): void {
  if (process.env.DISABLE_RECURRING_SCHEDULER === 'true') {
    logger.info('[RECURRING-SCHEDULER] Disabled via DISABLE_RECURRING_SCHEDULER env');
    return;
  }

  if (_schedulerStarted) return;
  _schedulerStarted = true;

  logger.info('[RECURRING-SCHEDULER] Starting recurring entry automation...');

  // Run daily at 06:00 server time (configurable)
  const cronExpr = process.env.RECURRING_CRON_SCHEDULE || '0 6 * * *';

  if (!cron.validate(cronExpr)) {
    logger.error(`[RECURRING-SCHEDULER] Invalid cron expression: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, () => {
    runDailyExecutionCycle();
  });

  scheduledTasks.push(task);
  logger.info(`[RECURRING-SCHEDULER] Scheduled daily execution: ${cronExpr}`);

  // Also run once on startup (with a small delay to let DB warm up)
  setTimeout(() => {
    logger.info('[RECURRING-SCHEDULER] Running startup execution check...');
    runDailyExecutionCycle();
  }, 5000);
}

export function stopRecurringScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  _schedulerStarted = false;
  logger.info('[RECURRING-SCHEDULER] Stopped all scheduled tasks');
}

/**
 * Manually trigger a cycle (for testing or admin use).
 */
export async function triggerRecurringCycle(): Promise<SchedulerRunSummary> {
  return runDailyExecutionCycle();
}

/**
 * Get scheduler status for display.
 */
export function getRecurringSchedulerStatus(): {
  running: boolean;
  cronExpression: string;
  tasksCount: number;
} {
  return {
    running: scheduledTasks.length > 0,
    cronExpression: process.env.RECURRING_CRON_SCHEDULE || '0 6 * * *',
    tasksCount: scheduledTasks.length,
  };
}
