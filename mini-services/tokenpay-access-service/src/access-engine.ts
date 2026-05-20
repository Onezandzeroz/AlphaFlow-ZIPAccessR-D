// TokenPay Access Service — Access Engine
// Manages access checking (with cache), proof activation, expiry processing, and admin overrides.

import type {
  AccessCheckResult, AccessLevel, ReasonCode,
} from './types.js';
import {
  DEFAULT_ACCESS_LEVEL, GRANTED_ACCESS_LEVEL, CACHE_TTL_MS, EXPIRY_WARNING_DAYS,
  TRIAL_DURATION_DAYS,
} from './types.js';
import {
  getUserById, updateUserAccess, getProofById,
  getActiveProofByUserId, deactivateOldProofs, logAccessChange,
  updateProofStatus, getExpiredActiveProofs, getProofsExpiringSoon,
  createMessage, getActiveProofs, associateProofWithUser,
  findOrCreateUserById, getExpiredTrialUsers,
} from './data-layer.js';
import { reverifyStoredProof, type VerificationResult } from './proof-verifier.js';
import type { ProofRecord } from './types.js';

// ─── In-memory cache ───────────────────────────────────────

interface CacheEntry {
  result: AccessCheckResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function setCache(userId: string, result: AccessCheckResult): void {
  cache.set(userId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCache(userId: string): AccessCheckResult | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return { ...entry.result, cached: true };
}

export function invalidateCache(userId?: string): void {
  if (userId) {
    cache.delete(userId);
  } else {
    cache.clear();
  }
}

// ─── Access Check ──────────────────────────────────────────

/**
 * Check a user's current access level.
 * Uses in-memory cache (60s TTL) for fast repeated checks.
 * Auto-expires if access_expiry is past.
 */
export function checkAccess(userId: string): AccessCheckResult {
  // Check cache first
  const cached = getCache(userId);
  if (cached) return cached;

  const user = getUserById(userId);
  if (!user) {
    return {
      userId,
      accessLevel: DEFAULT_ACCESS_LEVEL,
      accessExpiry: null,
      daysRemaining: null,
      isExpired: true,
      cached: false,
    };
  }

  // Auto-expire if access_expiry is past
  if (user.access_expiry) {
    const expiryDate = new Date(user.access_expiry);
    if (expiryDate <= new Date()) {
      // Determine reason: trial_expired if no active proof, proof_expired otherwise
      const activeProof = getActiveProofByUserId(userId);
      const reason = activeProof ? 'proof_expired' : 'trial_expired';

      updateUserAccess(userId, DEFAULT_ACCESS_LEVEL, null);
      logAccessChange(userId, user.access_level, DEFAULT_ACCESS_LEVEL, reason);
      invalidateCache(userId);

      return {
        userId,
        accessLevel: DEFAULT_ACCESS_LEVEL,
        accessExpiry: null,
        daysRemaining: 0,
        isExpired: true,
        cached: false,
      };
    }
  }

  const daysRemaining = user.access_expiry
    ? Math.ceil((new Date(user.access_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const result: AccessCheckResult = {
    userId,
    accessLevel: user.access_level,
    accessExpiry: user.access_expiry,
    daysRemaining: daysRemaining !== null ? Math.max(0, daysRemaining) : null,
    isExpired: false,
    cached: false,
  };

  setCache(userId, result);
  return result;
}

// ─── Proof Activation ──────────────────────────────────────

export type ActivationResult =
  | { success: true; proof: ProofRecord; tier: AccessLevel; expiresAt: string }
  | { success: false; stage: number; error: string; details?: any };

/**
 * Activate a proof: the proof file was already uploaded and verified by proof-verifier.
 * This function grants access to the user based on the verified proof.
 */
export function activateProof(userId: string, proofId: string): ActivationResult {
  // Stage 1: Validate inputs
  if (!userId || typeof userId !== 'string') {
    return { success: false, stage: 1, error: 'Invalid userId format' };
  }
  if (!proofId || typeof proofId !== 'string') {
    return { success: false, stage: 1, error: 'Invalid proofId format' };
  }

  // Stage 2: Proof ID lookup
  const proof = getProofById(proofId);
  if (!proof) {
    return { success: false, stage: 2, error: 'Proof not found' };
  }

  // Stage 3: Check proof is still valid (not expired/revoked)
  if (proof.status === 'expired') {
    return { success: false, stage: 3, error: 'Proof has expired' };
  }
  if (proof.status === 'revoked') {
    return { success: false, stage: 3, error: 'Proof has been revoked' };
  }

  // Stage 4: Skip ownership check — proofs are user-agnostic (bearer instruments)
  // Any user who possesses the proof can activate it.

  // If the proof was previously claimed by another user, downgrade that user
  // (the proof transfers — bearer instrument model)
  if (proof.user_id && proof.user_id !== userId) {
    const previousUserId = proof.user_id;
    const previousUser = getUserById(previousUserId);
    if (previousUser && previousUser.access_level !== DEFAULT_ACCESS_LEVEL) {
      updateUserAccess(previousUserId, DEFAULT_ACCESS_LEVEL, null);
      logAccessChange(previousUserId, previousUser.access_level, DEFAULT_ACCESS_LEVEL, 'proof_revoked', proofId);
      invalidateCache(previousUserId);
      console.log(
        `[AccessEngine] Bearer transfer: revoked ${previousUser.access_level} from user ${previousUserId} ` +
        `(proof ${proofId} reassigned to user ${userId})`
      );
    }
  }

  // Stage 5: Re-verify the stored proof file
  const reverify = reverifyStoredProof(proofId);
  if (!reverify.valid) {
    updateProofStatus(proofId, 'failed', reverify.error);
    return { success: false, stage: 5, error: `Proof file verification failed: ${reverify.error}` };
  }

  // Stage 6: Access Grant
  const user = getUserById(userId);
  if (!user) {
    return { success: false, stage: 6, error: 'User not found' };
  }

  const oldLevel = user.access_level;
  const newLevel = GRANTED_ACCESS_LEVEL; // valid proof always grants read_write

  // Deactivate old proofs for this user (they get a new proof now)
  deactivateOldProofs(userId, proofId);

  // Associate proof with this user (bearer instrument: claim the proof)
  associateProofWithUser(proofId, userId);

  // Update user access
  updateUserAccess(userId, newLevel, proof.expires_at);
  logAccessChange(userId, oldLevel, newLevel, 'proof_verified', proofId);
  invalidateCache(userId);

  console.log(`[AccessEngine] Granted ${newLevel} to user ${userId} via bearer proof ${proofId} (expires: ${proof.expires_at})`);

  // Stage 7: Host notification — handled by the caller (API gateway)

  return {
    success: true,
    proof,
    tier: newLevel,
    expiresAt: proof.expires_at,
  };
}

// ─── Expiry Processing ─────────────────────────────────────

/**
 * Process expired proofs: re-verify active proofs and downgrade users.
 * Called by the cron job and manually via admin endpoint.
 */
export function processExpiredAccess(): {
  processed: number;
  downgraded: number;
  warned: number;
  details: { proofId: string; userId: string; action: string; reason: string }[];
} {
  const now = new Date().toISOString();
  const details: { proofId: string; userId: string; action: string; reason: string }[] = [];

  // 1. Find and process expired proofs
  const expiredProofs = getExpiredActiveProofs(now);
  let downgraded = 0;

  for (const proof of expiredProofs) {
    // Skip unclaimed proofs (no user to downgrade)
    if (!proof.user_id) {
      updateProofStatus(proof.id, 'expired', 'Proof expired (unclaimed)');
      details.push({
        proofId: proof.id,
        userId: '',
        action: 'expired',
        reason: 'Proof expired (unclaimed)',
      });
      continue;
    }

    const user = getUserById(proof.user_id);
    if (!user) continue;

    // Re-verify the stored proof file
    const reverify = reverifyStoredProof(proof.id);

    // Mark proof as expired
    updateProofStatus(proof.id, 'expired', reverify.error || 'Proof expired');
    details.push({
      proofId: proof.id,
      userId: proof.user_id,
      action: 'expired',
      reason: reverify.error || 'Proof has expired',
    });

    // Downgrade user if they were at the level this proof granted
    if (user.access_level !== DEFAULT_ACCESS_LEVEL) {
      const oldLevel = user.access_level;
      updateUserAccess(proof.user_id, DEFAULT_ACCESS_LEVEL, null);
      logAccessChange(proof.user_id, oldLevel, DEFAULT_ACCESS_LEVEL, 'proof_expired', proof.id);
      invalidateCache(proof.user_id);
      downgraded++;
      console.log(`[AccessEngine] Downgraded user ${proof.user_id} from ${oldLevel} to ${DEFAULT_ACCESS_LEVEL} (proof expired)`);
    }
  }

  // 2. Find proofs expiring soon and send warning messages
  let warned = 0;
  const expiringSoon = getProofsExpiringSoon(now, EXPIRY_WARNING_DAYS);
  for (const proof of expiringSoon) {
    const daysLeft = Math.ceil((new Date(proof.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    // Skip unclaimed proofs — no user to warn
    if (!proof.user_id) {
      details.push({
        proofId: proof.id,
        userId: '',
        action: 'warned',
        reason: `Expires in ${daysLeft} days (unclaimed)`,
      });
      continue;
    }

    // Only send one warning per proof cycle
    // We check if there's already an unread warning for this proof
    createMessage(
      proof.user_id,
      `Access expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
      `Your access will expire on ${new Date(proof.expires_at).toLocaleDateString()}. ` +
      `Please upload a new proof file to maintain read/write access.`,
      'warning',
      proof.id
    );
    warned++;
    details.push({
      proofId: proof.id,
      userId: proof.user_id,
      action: 'warned',
      reason: `Expires in ${daysLeft} days`,
    });
  }

  console.log(`[AccessEngine] Expiry check: ${expiredProofs.length} expired, ${downgraded} downgraded, ${warned} warned`);

  // 2b. Handle expired trial users (users with past access_expiry but no active proof)
  const expiredTrialUsers = getExpiredTrialUsers(now);
  let trialDowngraded = 0;
  for (const trialUser of expiredTrialUsers) {
    // Skip users who have an active proof — they're handled by the proof expiry logic above
    const activeProof = getActiveProofByUserId(trialUser.id);
    if (activeProof) continue;

    updateUserAccess(trialUser.id, DEFAULT_ACCESS_LEVEL, null);
    logAccessChange(trialUser.id, trialUser.access_level as AccessLevel, DEFAULT_ACCESS_LEVEL, 'trial_expired');
    invalidateCache(trialUser.id);
    trialDowngraded++;
    details.push({
      proofId: '',
      userId: trialUser.id,
      action: 'trial_expired',
      reason: `Trial period expired (was: ${trialUser.access_expiry})`,
    });
    console.log(`[AccessEngine] Trial expired: downgraded user ${trialUser.id} to ${DEFAULT_ACCESS_LEVEL}`);
  }

  if (trialDowngraded > 0) {
    downgraded += trialDowngraded;
    console.log(`[AccessEngine] Trial expiry: ${trialDowngraded} trial users downgraded`);
  }

  return {
    processed: expiredProofs.length,
    downgraded,
    warned,
    details,
  };
}

/**
 * Full proof audit: re-verify ALL active proofs.
 * Used by the cron for comprehensive integrity checking.
 */
export function auditAllActiveProofs(): {
  total: number;
  valid: number;
  failed: number;
  results: { proofId: string; userId: string; valid: boolean; error?: string }[];
} {
  const activeProofs = getActiveProofs();
  const results: { proofId: string; userId: string; valid: boolean; error?: string }[] = [];
  let valid = 0;
  let failed = 0;

  for (const proof of activeProofs) {
    const reverify = reverifyStoredProof(proof.id);
    if (reverify.valid) {
      valid++;
    } else {
      failed++;
      updateProofStatus(proof.id, 'failed', reverify.error);
      console.warn(`[AccessEngine] Audit failed for proof ${proof.id}: ${reverify.error}`);
    }
    results.push({
      proofId: proof.id,
      userId: proof.user_id || '',
      valid: reverify.valid,
      error: reverify.error,
    });
  }

  console.log(`[AccessEngine] Audit complete: ${valid} valid, ${failed} failed out of ${activeProofs.length}`);

  return { total: activeProofs.length, valid, failed, results };
}

// ─── Admin Override ────────────────────────────────────────

export function adminOverride(userId: string, targetLevel?: AccessLevel): {
  success: boolean;
  previousLevel: AccessLevel;
  newLevel: AccessLevel;
} {
  const user = getUserById(userId);
  if (!user) {
    return { success: false, previousLevel: DEFAULT_ACCESS_LEVEL, newLevel: DEFAULT_ACCESS_LEVEL };
  }

  const previousLevel = user.access_level;
  const newLevel = targetLevel || DEFAULT_ACCESS_LEVEL;

  updateUserAccess(userId, newLevel, null);
  logAccessChange(userId, previousLevel, newLevel, 'admin_override');
  invalidateCache(userId);

  console.log(`[AccessEngine] Admin override: user ${userId} ${previousLevel} → ${newLevel}`);

  return { success: true, previousLevel, newLevel };
}

// ─── Trial Grant ────────────────────────────────────────────

export type GrantTrialResult = {
  success: boolean;
  previousLevel: AccessLevel;
  newLevel: AccessLevel;
  trialExpiry: string | null;
  error?: string;
};

/**
 * Grant a free trial period to a user.
 * Sets access_level to read_write with an expiry of `days` days (default TRIAL_DURATION_DAYS).
 * Logs with 'trial_granted' reason code.
 * If the user already has read_write access (e.g., via a proof), this is a no-op.
 */
export function grantTrial(userId: string, email?: string, name?: string, days?: number): GrantTrialResult {
  // Ensure user exists — auto-create if this is their first interaction
  let user = getUserById(userId);
  if (!user) {
    user = findOrCreateUserById(userId, email, name);
  }

  const duration = days ?? TRIAL_DURATION_DAYS;

  // Already has read_write access — skip (don't overwrite a proof-based grant)
  if (user.access_level === GRANTED_ACCESS_LEVEL && user.access_expiry) {
    return {
      success: true,
      previousLevel: user.access_level,
      newLevel: user.access_level,
      trialExpiry: user.access_expiry,
      error: 'User already has active access',
    };
  }

  const previousLevel = user.access_level;
  const trialExpiry = new Date();
  trialExpiry.setDate(trialExpiry.getDate() + duration);
  const trialExpiryISO = trialExpiry.toISOString();

  updateUserAccess(userId, GRANTED_ACCESS_LEVEL, trialExpiryISO);
  logAccessChange(userId, previousLevel, GRANTED_ACCESS_LEVEL, 'trial_granted');
  invalidateCache(userId);

  console.log(
    `[AccessEngine] Trial granted: user ${userId} (${email || 'unknown'}) ` +
    `${previousLevel} → read_write (expires: ${trialExpiryISO})`
  );

  return {
    success: true,
    previousLevel,
    newLevel: GRANTED_ACCESS_LEVEL,
    trialExpiry: trialExpiryISO,
  };
}
