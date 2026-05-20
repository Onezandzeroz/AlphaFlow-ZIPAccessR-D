// TokenPay Access Service — Shared Types
// Mission: Control user access levels based on valid encrypted proof files (.tbkey),
// decrypt, hold and verify proof-of-escrow files, and automate validity checks.

// ─── Access Levels ──────────────────────────────────────────

export type AccessLevel = 'read_only' | 'read_write';

export type ProofStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'failed';

export type ReasonCode =
  | 'proof_uploaded'
  | 'proof_verified'
  | 'proof_expired'
  | 'proof_revoked'
  | 'proof_invalid'
  | 'admin_override'
  | 'system_revoke'
  | 'trial_granted'
  | 'trial_expired';

export type MessagePriority = 'info' | 'warning' | 'urgent';

// ─── User ───────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  access_level: AccessLevel;
  access_expiry: string | null; // ISO timestamp or null
  created_at: string;
  updated_at: string;
}

// ─── Proof File ─────────────────────────────────────────────

export interface ProofRecord {
  id: string;
  user_id: string | null;     // null when first uploaded (user-agnostic); set on activation
  filename: string;
  file_hash: string;           // SHA-256 hash of the .tbkey for integrity
  file_path: string;           // relative path to stored .tbkey on disk (encrypted)
  file_size: number;           // bytes (of the .tbkey file, not the inner ZIP)
  tier: AccessLevel;           // access level this proof grants
  expires_at: string;          // ISO timestamp — proof expiry
  escrow_id: string;           // reference to the external escrow
  issuer: string | null;       // who issued the proof
  status: ProofStatus;
  verified_at: string | null;  // ISO timestamp of last successful verification
  last_error: string | null;   // reason for last verification failure
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Proof Manifest (inside the .tbkey, after decryption → ZIP) ────

export interface ProofManifest {
  version: number;
  proofId: string;             // unique proof identifier
  escrowId: string;            // escrow reference identifier
  tier: AccessLevel;           // access level to grant
  issuedAt: string;            // ISO timestamp
  expiresAt: string;           // ISO timestamp
  issuer: string;              // who issued this proof
}

// Proof manifests may also include a userId for backward compatibility,
// but it is NOT required or validated — proofs are user-agnostic.
export type LegacyProofManifest = ProofManifest & { userId?: string };

// ─── Access Log ─────────────────────────────────────────────

export interface AccessLogRecord {
  id: string;
  user_id: string;
  old_level: AccessLevel;
  new_level: AccessLevel;
  reason: ReasonCode;
  proof_id: string | null;     // reference to the proof that caused the change
  created_at: string;
}

// ─── User Messages ──────────────────────────────────────────

export interface MessageRecord {
  id: string;
  user_id: string;
  subject: string;
  body: string;
  priority: MessagePriority;
  is_read: number;  // 0 = unread, 1 = read (SQLite integer)
  proof_id: string | null;     // optional link to related proof
  created_at: string;
}

// ─── API Result Types ───────────────────────────────────────

export interface AccessCheckResult {
  userId: string;
  accessLevel: AccessLevel;
  accessExpiry: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
  cached: boolean;
}

export interface ProofUploadResult {
  success: boolean;
  proofId: string;
  tier: AccessLevel;
  expiresAt: string;
  filename: string;
  verified: boolean;
  error?: string;
}

export interface WebhookPayload {
  event: 'access.granted' | 'access.revoked' | 'access.expiring';
  userId: string;
  previousLevel: AccessLevel;
  newLevel: AccessLevel;
  reason: ReasonCode;
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

// ─── Constants ──────────────────────────────────────────────

export const DEFAULT_ACCESS_LEVEL: AccessLevel = 'read_only';
export const CACHE_TTL_MS = 60_000;          // 60 seconds
export const EXPIRY_WARNING_DAYS = 7;        // warn users 7 days before expiry
export const TRIAL_DURATION_DAYS = 60;       // free trial duration in days
export const CRON_INTERVAL_MS = 5 * 60_000;  // 5 minutes
export const PROOF_DIR = './data/proofs';    // where .tbkey files are stored (encrypted)
export const MANIFEST_FILENAME = 'manifest.json';

// Access level hierarchy (higher number = more access)
// read_only  = Access denied (default)
// read_write = Access granted (via valid proof)
export const ACCESS_HIERARCHY: Record<AccessLevel, number> = {
  read_only: 0,
  read_write: 1,
};

/** The access level granted when a valid proof is activated. */
export const GRANTED_ACCESS_LEVEL: AccessLevel = 'read_write';
