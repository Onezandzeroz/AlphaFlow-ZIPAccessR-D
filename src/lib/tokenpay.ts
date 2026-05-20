// ═══════════════════════════════════════════════════════════════
// TokenPay Client Library — Drop-in integration for any app
// ═══════════════════════════════════════════════════════════════
//
// The TokenPay Access Service controls user access levels based on
// valid encrypted proof files (.tbkey). Proof creation/purchasing happens externally
// in TokenBay-ZIPProof.
//
// USAGE (Server-side / API routes):
//   import { tokenpay } from '@/lib/tokenpay';
//   const access = await tokenpay.checkAccess(userId);
//
// USAGE (Client-side):
//   import { tokenpayClient } from '@/lib/tokenpay';
//   const access = await tokenpayClient.checkAccess(userId);
//

// ─── Types ─────────────────────────────────────────────────

import { NextResponse } from 'next/server';

export type AccessLevel = 'read_only' | 'read_write';

export type ProofStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'failed';

export type MessagePriority = 'info' | 'warning' | 'urgent';

export interface AccessCheckResult {
  userId: string;
  accessLevel: AccessLevel;
  accessExpiry: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
  cached: boolean;
}

export interface TokenPayUser {
  id: string;
  email: string;
  name: string | null;
  accessLevel: AccessLevel;
  accessExpiry: string | null;
  createdAt: string;
}

export interface ProofUploadResult {
  success: boolean;
  proofId: string;
  userId?: string;
  status?: string;
  tier?: AccessLevel;
  expiresAt?: string;
  filename: string;
  message?: string;
  manifest?: {
    version: number;
    proofId: string;
    escrowId: string;
    tier: AccessLevel;
    issuedAt: string;
    expiresAt: string;
    issuer: string;
  };
  error?: string;
  stage?: number;
  details?: any;
}

export interface ProofActivationResult {
  success: boolean;
  tier: string;
  expiresAt: string;
  error?: string;
  stage?: number;
}

export interface ProofRecord {
  id: string;
  userId: string;
  filename: string;
  tier: AccessLevel;
  expiresAt: string;
  escrowId: string;
  issuer: string | null;
  status: ProofStatus;
  verifiedAt: string | null;
  lastError: string | null;
  uploadedAt: string;
  createdAt: string;
}

export interface WebhookPayload {
  event: 'access.granted' | 'access.revoked' | 'access.expiring';
  userId: string;
  previousLevel: AccessLevel;
  newLevel: AccessLevel;
  reason: string;
  timestamp: string;
  proofId?: string;
}

export interface TokenPayStats {
  totalUsers: number;
  activeUsers: number;
  read_only: number;
  read_write: number;
  totalProofs: number;
  activeProofs: number;
  pendingProofs: number;
  expiredProofs: number;
  totalMessages: number;
  unreadMessages: number;
}

export interface AccessLog {
  id: string;
  userId: string;
  oldLevel: AccessLevel;
  newLevel: AccessLevel;
  reason: string;
  proofId: string | null;
  timestamp: string;
}

export interface MessageRecord {
  id: string;
  subject: string;
  body: string;
  priority: MessagePriority;
  isRead: boolean;
  proofId: string | null;
  createdAt: string;
}

export interface UserStatusResult {
  user: TokenPayUser;
  access: AccessCheckResult;
  activeProof: {
    proofId: string;
    filename: string;
    tier: string;
    expiresAt: string;
    escrowId: string;
    status: string;
    uploadedAt: string;
  } | null;
  recentLogs: { oldLevel: string; newLevel: string; reason: string; proofId: string | null; timestamp: string }[];
}

export interface CronStatus {
  active: boolean;
  intervalMs: number;
  runCount: number;
  isRunning: boolean;
  lastRunAt: string | null;
}

// ─── Config ─────────────────────────────────────────────────

const SERVICE_PORT = process.env.NEXT_PUBLIC_TOKENPAY_PORT || '3100';
const API_KEY = process.env.TOKENPAY_API_KEY || 'tokenpay-dev-key-2026';

// Server-side: use absolute localhost URL (Bun/Node fetch requires absolute URLs).
// Client-side: use relative URL with XTransformPort (Caddy gateway handles routing).
function baseUrl(): string {
  return typeof window === 'undefined'
    ? `http://localhost:${SERVICE_PORT}/api/v1`
    : `/api/v1`;
}

function serviceUrl(): string {
  return typeof window === 'undefined'
    ? `http://localhost:${SERVICE_PORT}`
    : `/`;
}

/** Append XTransformPort as a query parameter (client-side only). */
function appendPort(path: string): string {
  if (typeof window === 'undefined') return path; // Server-side uses absolute URLs
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}XTransformPort=${SERVICE_PORT}`;
}

// ─── Core Fetch Helper ─────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = appendPort(`${baseUrl()}${path.startsWith('/') ? '' : '/'}${path}`);
  const res = await fetch(url, {
    headers: {
      'X-Access-Service-Key': API_KEY,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = (body as Record<string, string>).error || `TokenPay error (${res.status})`;
    throw new TokenPayError(error, res.status, body);
  }

  return res.json() as Promise<T>;
}

// ─── Error Class ───────────────────────────────────────────

export class TokenPayError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'TokenPayError';
  }
}

// ─── Access Level Helpers ──────────────────────────────────

export const ACCESS_LEVELS: { level: AccessLevel; label: string; color: string; description: string }[] = [
  { level: 'read_only', label: 'Access Denied', color: '#9ca3af', description: 'Read-only — no write access' },
  { level: 'read_write', label: 'Access Granted', color: '#10b981', description: 'Full read/write access' },
];

/** Bilingual labels/descriptions for ACCESS_LEVELS */
export function getAccessLevelLabel(level: AccessLevel, language: 'da' | 'en'): string {
  if (level === 'read_write') {
    return language === 'da' ? 'Adgang tildelt' : 'Access Granted';
  }
  return language === 'da' ? 'Adgang nægtet' : 'Access Denied';
}

export function getAccessLevelDescription(level: AccessLevel, language: 'da' | 'en'): string {
  if (level === 'read_write') {
    return language === 'da' ? 'Fuld læse/skrive-adgang' : 'Full read/write access';
  }
  return language === 'da' ? 'Skrivebeskyttet — ingen skrivetilladelse' : 'Read-only — no write access';
}

/**
 * Check if a user has the required access level.
 * With only two modes, this is simple: read_only = denied, read_write = granted.
 */
export function hasAccess(result: AccessCheckResult): boolean {
  return !result.isExpired && result.accessLevel === 'read_write';
}

/**
 * Check if a user currently has read/write access (not expired, not read_only).
 */
export function isAccessActive(result: AccessCheckResult): boolean {
  return !result.isExpired && result.accessLevel === 'read_write';
}

// ─── HMAC Signature Verification (for webhooks) ───────────

export async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const { createHmac } = await import('crypto');
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (signature.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

// ═══════════════════════════════════════════════════════════════
// SERVER-SIDE API (for use in Next.js API routes / middleware)
// ═══════════════════════════════════════════════════════════════

export const tokenpay = {
  // ─── User Management ───────────────────────────────────

  /** Register a user (or find existing by email). */
  async createUser(email: string, name?: string): Promise<TokenPayUser> {
    return apiFetch<TokenPayUser>('users', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    });
  },

  /** List all users. */
  async listUsers(): Promise<TokenPayUser[]> {
    return apiFetch<TokenPayUser[]>('users');
  },

  /** Get a single user's detailed status including active proof. */
  async getUserStatus(userId: string): Promise<UserStatusResult> {
    return apiFetch<UserStatusResult>(`access/${userId}/status`);
  },

  /** Delete a user. */
  async deleteUser(userId: string): Promise<void> {
    await apiFetch(`users/${userId}`, { method: 'DELETE' });
  },

  // ─── Access Control ────────────────────────────────────

  /**
   * Check if a user has access. Call this on every protected page load.
   * Returns cached result (< 1ms) when available.
   */
  async checkAccess(userId: string): Promise<AccessCheckResult> {
    return apiFetch<AccessCheckResult>(`access/${userId}`);
  },

  /** Check access — returns a boolean for quick guards. */
  async canAccess(userId: string): Promise<boolean> {
    const result = await this.checkAccess(userId);
    return hasAccess(result);
  },

  // ─── Proof Upload ─────────────────────────────────────

  /**
   * Upload an encrypted proof file (.tbkey). The proof is user-agnostic (bearer instrument).
   * If userId is included in the FormData, the proof is auto-activated for that user.
   * If userId is omitted, the proof is stored as 'pending' (unclaimed).
   *
   * @example
   * // Without userId (store as pending):
   * const formData = new FormData();
   * formData.append('proofFile', tbkeyBlob, 'proof.tbkey');
   * const result = await tokenpay.uploadProof(formData);
   *
   * @example
   * // With userId (auto-activate):
   * const formData = new FormData();
   * formData.append('userId', userId);
   * formData.append('proofFile', tbkeyBlob, 'proof.tbkey');
   * const result = await tokenpay.uploadProof(formData);
   */
  async uploadProof(formData: FormData): Promise<ProofUploadResult> {
    const url = appendPort(`${baseUrl()}/proof/upload`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Access-Service-Key': API_KEY,
        // Do NOT set Content-Type — browser sets multipart boundary
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = (body as Record<string, string>).error || `Upload failed (${res.status})`;
      throw new TokenPayError(error, res.status, body);
    }

    return res.json() as Promise<ProofUploadResult>;
  },

  /**
   * Activate a previously uploaded proof by proofId.
   */
  async activateProof(userId: string, proofId: string): Promise<ProofActivationResult> {
    return apiFetch<ProofActivationResult>('proof/activate', {
      method: 'POST',
      body: JSON.stringify({ userId, proofId }),
    });
  },

  // ─── Proof Queries ────────────────────────────────────

  /** Get all proofs, optionally filtered by userId. */
  async getProofs(userId?: string): Promise<ProofRecord[]> {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    const qs = params.toString();
    return apiFetch<ProofRecord[]>(`proofs${qs ? `?${qs}` : ''}`);
  },

  /** Get all unclaimed (pending) proofs. */
  async getPendingProofs(): Promise<ProofRecord[]> {
    return apiFetch<ProofRecord[]>('proofs/pending');
  },

  /** Get a single proof by ID. */
  async getProof(proofId: string): Promise<ProofRecord> {
    return apiFetch<ProofRecord>(`proofs/${proofId}`);
  },

  /** Delete a proof. */
  async deleteProof(proofId: string): Promise<void> {
    await apiFetch(`proofs/${proofId}`, { method: 'DELETE' });
  },

  // ─── Messages ─────────────────────────────────────────

  /** Send a message to a user. */
  async sendMessage(userId: string, subject: string, body: string, priority?: MessagePriority, proofId?: string): Promise<MessageRecord> {
    return apiFetch<MessageRecord>(`users/${userId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ subject, body, priority: priority || 'info', proofId }),
    });
  },

  /** Get messages for a user. */
  async getMessages(userId: string, options?: { unreadOnly?: boolean; limit?: number }): Promise<{ messages: MessageRecord[]; unreadCount: number }> {
    const params = new URLSearchParams();
    if (options?.unreadOnly) params.set('unread', 'true');
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return apiFetch(`users/${userId}/messages${qs ? `?${qs}` : ''}`);
  },

  /** Mark a message as read. */
  async markMessageRead(messageId: string): Promise<void> {
    await apiFetch(`messages/${messageId}/read`, { method: 'PUT' });
  },

  /** Mark all messages as read for a user. */
  async markAllMessagesRead(userId: string): Promise<void> {
    await apiFetch(`users/${userId}/messages/read-all`, { method: 'PUT' });
  },

  // ─── Admin ─────────────────────────────────────────────

  /** Override a user's access level (admin action). */
  async overrideAccess(userId: string, targetLevel?: AccessLevel): Promise<{
    success: boolean;
    previousLevel: AccessLevel;
    newLevel: AccessLevel;
  }> {
    return apiFetch('admin/override', {
      method: 'POST',
      body: JSON.stringify({ userId, targetLevel }),
    });
  },

  /** Process expired proofs (call periodically or use cron). */
  async processExpired(): Promise<{ processed: number; downgraded: number; warned: number }> {
    return apiFetch('admin/process-expired', { method: 'POST' });
  },

  /** Audit all active proofs (integrity check). */
  async auditProofs(): Promise<{ total: number; valid: number; failed: number }> {
    return apiFetch('admin/audit', { method: 'POST' });
  },

  /** Get cron status. */
  async getCronStatus(): Promise<CronStatus> {
    return apiFetch<CronStatus>('cron/status');
  },

  // ─── Read-only Queries ────────────────────────────────

  async getStats(): Promise<TokenPayStats> {
    return apiFetch<TokenPayStats>('stats');
  },

  async getLogs(userId?: string, limit = 50): Promise<AccessLog[]> {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    params.set('limit', String(limit));
    return apiFetch<AccessLog[]>(`logs?${params}`);
  },

  /** Health check (no auth required). */
  async health(): Promise<{ status: string; uptime: number; cron: CronStatus }> {
    const url = appendPort(`${serviceUrl()}/health`);
    const res = await fetch(url);
    return res.json() as Promise<{ status: string; uptime: number; cron: CronStatus }>;
  },
};

// ═══════════════════════════════════════════════════════════════
// STANDALONE EXPORTS (for Turbopack compatibility)
// ═══════════════════════════════════════════════════════════════
//
// Some methods are exported as standalone functions because
// Turbopack's type checker may truncate types on large object literals.

/**
 * Grant a free trial period of read_write access.
 * Used during registration to auto-grant trial access without .tbkey proofs.
 * Logs with 'trial_granted' reason code.
 *
 * @param days - Trial duration in days (default: 60)
 */
export async function grantTrial(userId: string, email?: string, name?: string, days?: number): Promise<{
  success: boolean;
  userId: string;
  previousLevel: AccessLevel;
  newLevel: AccessLevel;
  trialExpiry: string | null;
}> {
  return apiFetch('admin/grant-trial', {
    method: 'POST',
    body: JSON.stringify({ userId, email, name, days }),
  });
}

// ═══════════════════════════════════════════════════════════════
// SERVER-SIDE ACCESS GUARD (owner bypass + TokenPay)
// ═══════════════════════════════════════════════════════════════
//
// Use these in your API routes when gating features by access level.
// The AlphaAi owner ALWAYS passes — no proof file needed.

/**
 * Check if a user has read_write access.
 * The AlphaAi owner (isSuperDev + AlphaAi company) always returns true.
 * All other users are checked against the TokenPay service.
 *
 * @example
 * import { requireAccess } from '@/lib/tokenpay';
 *
 * const { allowed, access } = await requireAccess(userId);
 * if (!allowed) {
 *   return NextResponse.json({ error: 'Access denied' }, { status: 403 });
 * }
 */
export async function requireAccess(userId: string): Promise<{
  allowed: boolean;
  access: AccessCheckResult;
}> {
  // Dynamic import to avoid circular dependency in edge cases
  const { checkOwnerAccess } = await import('@/lib/access-guard');

  // Owner bypass — AlphaAi owner always has access
  const ownerAccess = await checkOwnerAccess(userId);
  if (ownerAccess) {
    return { allowed: true, access: ownerAccess };
  }

  // Normal TokenPay check
  const access = await tokenpay.checkAccess(userId);
  return { allowed: hasAccess(access), access };
}

/**
 * Quick boolean check — does this user have read_write access?
 * Returns true for the AlphaAi owner, or for users with valid proofs.
 */
export async function canUserAccess(userId: string): Promise<boolean> {
  const { allowed } = await requireAccess(userId);
  return allowed;
}

/**
 * Block mutations when the user does NOT have TokenPay read_write access.
 *
 * This is the enforcement gate that prevents tenants without a valid proof
 * from writing any data. The AlphaAi owner (isSuperDev + AlphaAi company)
 * always bypasses this check.
 *
 * Usage — add to every mutation API route (POST, PUT, DELETE, PATCH):
 * ```ts
 * import { requireTokenPayAccess } from '@/lib/tokenpay';
 *
 * const accessDenied = await requireTokenPayAccess(ctx.id);
 * if (accessDenied) return accessDenied;
 * ```
 *
 * @returns null if mutations are allowed, or a 403 NextResponse if denied.
 */
export async function requireTokenPayAccess(
  userId: string
): Promise<NextResponse | null> {
  try {
    const { allowed, access } = await requireAccess(userId);
    if (allowed) return null;

    const isExpired = access.isExpired;

    return NextResponse.json(
      {
        error: isExpired
          ? 'Access expired — please upload a new proof to continue'
          : 'Access denied — upload a valid .tbkey proof file to activate write access',
        code: isExpired ? 'ACCESS_EXPIRED' : 'ACCESS_DENIED',
        accessLevel: access.accessLevel,
        accessExpiry: access.accessExpiry,
        daysRemaining: access.daysRemaining,
      },
      { status: 403 }
    );
  } catch {
    // If the access service is unreachable, default to denying write access
    // with a clear code so the frontend can show a proper message.
    return NextResponse.json(
      {
        error: 'Access service unavailable — cannot verify write access',
        code: 'ACCESS_DENIED',
        accessLevel: 'read_only' as AccessLevel,
        accessExpiry: null,
        daysRemaining: null,
      },
      { status: 403 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// CLIENT-SIDE API (for use in React components / 'use client')
// ═══════════════════════════════════════════════════════════════
//
// Same functionality but routes through your own API routes
// so you never expose the API key to the browser.
//
// To use these, create thin API routes in your Next.js app:
//   app/api/access/[userId]/route.ts       → calls tokenpay.checkAccess()
//   app/api/access/[userId]/status/route.ts → calls tokenpay.getUserStatus()
//   app/api/proof-upload/route.ts          → calls tokenpay.uploadProof()
//

export const tokenpayClient = {
  /** Check access (via your own API route). */
  async checkAccess(userId: string): Promise<AccessCheckResult> {
    const res = await fetch(`/api/access/${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Access check failed');
    return res.json();
  },

  /** Upload a proof file (via your own API route). userId is optional. */
  async uploadProof(formData: FormData): Promise<ProofUploadResult> {
    const res = await fetch('/api/proof-upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = (body as Record<string, string>).error || 'Proof upload failed';
      throw new Error(error);
    }
    return res.json();
  },

  /** Activate a proof (via your own API route). */
  async activate(userId: string, proofId: string): Promise<ProofActivationResult> {
    const res = await fetch('/api/proof-activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, proofId }),
    });
    if (!res.ok) throw new Error('Proof activation failed');
    return res.json();
  },

  /** Get user status (via your own API route). */
  async getStatus(userId: string): Promise<UserStatusResult> {
    const res = await fetch(`/api/access/${encodeURIComponent(userId)}/status`);
    if (!res.ok) throw new Error('Status check failed');
    return res.json();
  },

  /** Get user messages (via your own API route). */
  async getMessages(userId: string): Promise<{ messages: MessageRecord[]; unreadCount: number }> {
    const res = await fetch(`/api/messages/${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },
};
