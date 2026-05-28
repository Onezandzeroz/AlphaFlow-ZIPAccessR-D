/**
 * Node.js Instrumentation Hook (Next.js 16)
 *
 * This file runs ONLY in the Node.js Runtime — safe to use Node.js APIs
 * like fs, path, crypto, node-cron, etc.
 *
 * Initializes background services:
 * - Backup scheduler for Danish Bookkeeping Act §15 compliance
 * - Recurring entry scheduler for automatic purchase execution
 *
 * @see https://nextjs.org/docs/app/building-your-application/configuring/instrumentation
 */

import { startBackupScheduler, stopBackupScheduler } from '@/lib/backup-scheduler';
import { startRecurringScheduler, stopRecurringScheduler } from '@/lib/recurring-scheduler';
import { logger } from '@/lib/logger';

export async function register() {
  logger.info('[INSTRUMENTATION-NODE] Server starting — initializing background services');
  startBackupScheduler();
  startRecurringScheduler();
}

export async function unregister() {
  logger.info('[INSTRUMENTATION-NODE] Server shutting down — stopping background services');
  stopBackupScheduler();
  stopRecurringScheduler();
}
