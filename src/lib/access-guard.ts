/**
 * Access Guard — Owner Bypass for AlphaAi
 *
 * The AlphaAi tenant (app owner) always has read_write access
 * regardless of proof files. This module provides utilities to:
 *
 * 1. Detect if a user is the AlphaAi owner (isSuperDev + AlphaAi company)
 * 2. Return hardcoded read_write access for the owner
 * 3. Prevent the owner from being downgraded via webhooks
 *
 * All other users go through the normal TokenPay proof-based access control.
 */

import { db } from '@/lib/db';

// ─── Types ─────────────────────────────────────────────────────────

export interface OwnerAccessResult {
  userId: string;
  accessLevel: 'read_write';
  accessExpiry: null;       // No expiry — permanent access
  daysRemaining: null;
  isExpired: false;
  cached: false;
  isOwnerBypass: true;      // Flag to distinguish from proof-based access
}

// ─── Owner Detection ───────────────────────────────────────────────

/**
 * Check if a user is the AlphaAi app owner.
 *
 * Criteria (ALL must be true):
 *  1. User has `isSuperDev: true` in the database
 *  2. User belongs to a company named exactly 'AlphaAi'
 *
 * This is the definitive owner check — it queries the database
 * directly, so it works regardless of session state.
 */
export async function isAlphaAiOwner(userId: string): Promise<boolean> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperDev: true,
        companies: {
          where: {
            company: {
              name: 'AlphaAi',
              isActive: true,
            },
          },
          select: { companyId: true },
          take: 1,
        },
      },
    });

    return !!(
      user &&
      user.isSuperDev === true &&
      user.companies.length > 0
    );
  } catch (error) {
    console.error('[AccessGuard] Failed to check owner status:', error);
    return false;
  }
}

// ─── Owner Access Result ──────────────────────────────────────────

/**
 * Get a hardcoded read_write access result for the AlphaAi owner.
 * This never expires and doesn't require a proof file.
 */
export function getOwnerAccessResult(userId: string): OwnerAccessResult {
  return {
    userId,
    accessLevel: 'read_write',
    accessExpiry: null,
    daysRemaining: null,
    isExpired: false,
    cached: false,
    isOwnerBypass: true,
  };
}

/**
 * Get a full owner status result (compatible with UserStatusResult shape).
 */
export function getOwnerStatusResult(userId: string, email?: string, name?: string) {
  return {
    user: {
      id: userId,
      email: email || 'owner@alphaflow.dk',
      name: name || 'App Owner',
      accessLevel: 'read_write' as const,
      accessExpiry: null,
      createdAt: new Date().toISOString(),
    },
    access: getOwnerAccessResult(userId),
    activeProof: {
      proofId: 'owner-bypass',
      filename: 'AlphaAi Owner — Permanent Access',
      tier: 'read_write',
      expiresAt: null,
      escrowId: 'owner-bypass',
      status: 'active',
      uploadedAt: new Date().toISOString(),
    },
    recentLogs: [
      {
        oldLevel: 'read_only',
        newLevel: 'read_write',
        reason: 'owner_bypass',
        proofId: 'owner-bypass',
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ─── Convenience: Check + Get ──────────────────────────────────────

/**
 * Check if user is the AlphaAi owner. If yes, return owner access.
 * If no, return null (caller should fall through to TokenPay).
 */
export async function checkOwnerAccess(
  userId: string,
  email?: string,
  name?: string
): Promise<OwnerAccessResult | null> {
  const isOwner = await isAlphaAiOwner(userId);
  if (isOwner) {
    return getOwnerAccessResult(userId);
  }
  return null;
}

/**
 * Same as checkOwnerAccess but returns the full status result.
 */
export async function checkOwnerStatus(
  userId: string,
  email?: string,
  name?: string
): Promise<ReturnType<typeof getOwnerStatusResult> | null> {
  const isOwner = await isAlphaAiOwner(userId);
  if (isOwner) {
    return getOwnerStatusResult(userId, email, name);
  }
  return null;
}

/**
 * Ensure the AlphaAi owner is always at read_write in TokenPay.
 * Call this from the webhook callback when a revocation is received
 * for the owner — it will re-override the access back to read_write.
 */
export async function ensureOwnerAccess(userId: string): Promise<boolean> {
  const isOwner = await isAlphaAiOwner(userId);
  if (!isOwner) return false;

  try {
    const { tokenpay } = await import('@/lib/tokenpay');
    await tokenpay.overrideAccess(userId, 'read_write');
    console.log(`[AccessGuard] Re-granted owner access to ${userId}`);
    return true;
  } catch (error) {
    console.error('[AccessGuard] Failed to re-grant owner access:', error);
    return false;
  }
}
