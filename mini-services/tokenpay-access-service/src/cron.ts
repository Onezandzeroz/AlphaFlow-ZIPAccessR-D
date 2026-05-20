// TokenPay Access Service — Automated Cron
// Continuously cycles through proofs to ascertain current validity.
// Runs on a configurable interval (default: 5 minutes).

import { CRON_INTERVAL_MS } from './types.js';
import { processExpiredAccess, auditAllActiveProofs } from './access-engine.js';
import { notifyAccessRevoked, notifyAccessExpiring, sendMessageToUser } from './notification.js';
import { getActiveProofs, getUserById, getProofsExpiringSoon } from './data-layer.js';
import { DEFAULT_ACCESS_LEVEL, EXPIRY_WARNING_DAYS } from './types.js';

let cronTimer: Timer | null = null;
let isRunning = false;
let runCount = 0;

/**
 * Get the current cron status.
 */
export function getCronStatus(): {
  active: boolean;
  intervalMs: number;
  runCount: number;
  isRunning: boolean;
  lastRunAt: string | null;
} {
  return {
    active: cronTimer !== null,
    intervalMs: CRON_INTERVAL_MS,
    runCount,
    isRunning,
    lastRunAt: lastRunAt,
  };
}

let lastRunAt: string | null = null;

/**
 * Start the automated cron job.
 * Runs every CRON_INTERVAL_MS to check proof validity.
 */
export function startCron(): void {
  if (cronTimer) {
    console.log('[Cron] Already running');
    return;
  }

  console.log(`[Cron] Starting automated proof validity check (interval: ${CRON_INTERVAL_MS / 1000}s)`);

  // Run immediately on start
  runCronCycle();

  // Then run on interval
  cronTimer = setInterval(() => {
    runCronCycle();
  }, CRON_INTERVAL_MS);
}

/**
 * Stop the automated cron job.
 */
export function stopCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    console.log('[Cron] Stopped');
  }
}

/**
 * Execute one full cron cycle:
 *   1. Re-verify all active proofs (integrity check)
 *   2. Process expired proofs (downgrade users)
 *   3. Send warnings for proofs expiring soon
 *   4. Dispatch webhooks for changes
 */
async function runCronCycle(): Promise<void> {
  if (isRunning) {
    console.log('[Cron] Previous cycle still running, skipping');
    return;
  }

  isRunning = true;
  const cycleStart = Date.now();
  runCount++;

  console.log(`[Cron] ── Cycle #${runCount} started ──`);

  try {
    // Step 1: Full audit of all active proofs
    const audit = auditAllActiveProofs();

    if (audit.failed > 0) {
      console.warn(`[Cron] Audit found ${audit.failed} invalid proof(s)`);

      // For each failed proof, notify the user (if claimed)
      for (const result of audit.results) {
        if (!result.valid && result.userId) {
          const user = getUserById(result.userId);
          if (user) {
            sendMessageToUser(result.userId, {
              subject: 'Proof verification failed',
              body: `Your proof file could not be verified: ${result.error}. ` +
                `Your access may be affected. Please contact support.`,
              priority: 'urgent',
              proofId: result.proofId,
            });
          }
        }
      }
    }

    // Step 2: Process expired proofs and downgrade users
    const expiryResult = processExpiredAccess();

    // Step 3: Send webhooks for downgraded users
    for (const detail of expiryResult.details) {
      if (detail.action === 'expired' && detail.userId) {
        const user = getUserById(detail.userId);
        if (user && user.access_level === DEFAULT_ACCESS_LEVEL) {
          // User was downgraded — send webhook
          await notifyAccessRevoked(detail.userId, user.access_level, 'proof_expired', detail.proofId);
        }
      }
    }

    // Step 4: Send webhook warnings for expiring-soon proofs (only claimed ones)
    const now = new Date().toISOString();
    const expiringSoon = getProofsExpiringSoon(now, EXPIRY_WARNING_DAYS);
    for (const proof of expiringSoon) {
      if (!proof.user_id) continue;  // Skip unclaimed proofs
      const daysLeft = Math.ceil((new Date(proof.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const user = getUserById(proof.user_id);
      if (user) {
        await notifyAccessExpiring(proof.user_id, user.access_level, daysLeft, proof.id);
      }
    }

    const duration = Date.now() - cycleStart;
    console.log(
      `[Cron] ── Cycle #${runCount} complete (${duration}ms)` +
      ` | Audit: ${audit.valid}/${audit.total} valid` +
      ` | Expired: ${expiryResult.processed} (${expiryResult.downgraded} downgraded)` +
      ` | Warned: ${expiryResult.warned}`
    );

  } catch (err) {
    console.error(`[Cron] Cycle #${runCount} failed:`, err);
  } finally {
    lastRunAt = new Date().toISOString();
    isRunning = false;
  }
}
