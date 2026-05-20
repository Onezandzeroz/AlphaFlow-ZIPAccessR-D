// TokenPay Access Service — Data Layer (Bun SQLite + WAL mode)
// Stores users, proofs, access logs, and user messages.

import { Database } from 'bun:sqlite';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'fs';
import type {
  UserRecord, ProofRecord, AccessLogRecord, MessageRecord,
  AccessLevel, ProofStatus, ReasonCode, MessagePriority, TokenPayStats
} from './types.js';
import { DEFAULT_ACCESS_LEVEL, PROOF_DIR } from './types.js';
import { v4 as uuid } from 'uuid';

let db: Database;

export function initDataLayer(dbPath: string): Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(PROOF_DIR, { recursive: true });

  db = new Database(dbPath, { create: true });

  // Enable WAL mode for concurrent read-write
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      access_level TEXT NOT NULL DEFAULT '${DEFAULT_ACCESS_LEVEL}',
      access_expiry TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS proofs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      filename TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL DEFAULT '${DEFAULT_ACCESS_LEVEL}',
      expires_at TEXT NOT NULL,
      escrow_id TEXT NOT NULL DEFAULT '',
      issuer TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      verified_at TEXT,
      last_error TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS access_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      old_level TEXT NOT NULL,
      new_level TEXT NOT NULL,
      reason TEXT NOT NULL,
      proof_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      proof_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_access_level ON users(access_level);
    CREATE INDEX IF NOT EXISTS idx_proofs_user ON proofs(user_id);
    CREATE INDEX IF NOT EXISTS idx_proofs_status ON proofs(status);
    CREATE INDEX IF NOT EXISTS idx_proofs_expires ON proofs(expires_at);
    CREATE INDEX IF NOT EXISTS idx_proofs_escrow ON proofs(escrow_id);
    CREATE INDEX IF NOT EXISTS idx_log_user ON access_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_log_created ON access_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read);
  `);

  console.log(`[DataLayer] Initialized at ${dbPath} (WAL mode)`);
  console.log(`[DataLayer] Proof storage at ${PROOF_DIR}`);
  return db;
}

export function getDb(): Database {
  return db;
}

// ═══════════════════════════════════════════════════════════
// User Operations
// ═══════════════════════════════════════════════════════════

export function createUser(email: string, name?: string): UserRecord {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR IGNORE INTO users (id, email, name, access_level, access_expiry, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, email, name || null, DEFAULT_ACCESS_LEVEL, null, now, now);
  // Re-fetch in case INSERT OR IGNORE was a no-op (race on email uniqueness)
  const user = getUserById(id) ?? getUserByEmail(email);
  return user!;
}

export function getUserById(id: string): UserRecord | null {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | null;
}

export function getUserByEmail(email: string): UserRecord | null {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | null;
}

export function findOrCreateUser(email: string, name?: string): UserRecord {
  const existing = getUserByEmail(email);
  if (existing) return existing;
  return createUser(email, name);
}

/**
 * Find a user by ID, or create a new one with that exact ID.
 * Used when the host app (AlphaFlow) provides its own userId and we need
 * to register it in the access service's database on first proof upload.
 */
export function findOrCreateUserById(userId: string, email?: string, name?: string): UserRecord {
  const existing = getUserById(userId);
  if (existing) return existing;

  const id = userId; // Use the host app's userId as-is
  const now = new Date().toISOString();
  // Use INSERT OR IGNORE to handle race conditions where two concurrent requests
  // both pass the getUserById check before either inserts (SQLITE_CONSTRAINT_UNIQUE).
  db.prepare(
    'INSERT OR IGNORE INTO users (id, email, name, access_level, access_expiry, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, email || null, name || null, DEFAULT_ACCESS_LEVEL, null, now, now);
  // Always re-fetch to get the correct record (either just-inserted or pre-existing from race)
  const user = getUserById(id);
  if (!user) {
    console.error(`[DataLayer] Failed to find or create user ${id} after INSERT OR IGNORE`);
  }
  return user!;
}

export function updateUserAccess(
  userId: string,
  accessLevel: AccessLevel,
  accessExpiry: string | null
): void {
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE users SET access_level = ?, access_expiry = ?, updated_at = ? WHERE id = ?'
  ).run(accessLevel, accessExpiry, now, userId);
}

export function getAllUsers(): UserRecord[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRecord[];
}

export function deleteUser(userId: string): boolean {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return result.changes > 0;
}

/**
 * Get users whose access_expiry has passed but still have read_write access.
 * These are trial users (or proof users whose proofs weren't caught by the proof expiry check).
 * Used by the cron to ensure all expired users are properly downgraded.
 */
export function getExpiredTrialUsers(now: string): { id: string; access_level: string; access_expiry: string }[] {
  return db.prepare(
    "SELECT id, access_level, access_expiry FROM users WHERE access_level = 'read_write' AND access_expiry IS NOT NULL AND access_expiry <= ?"
  ).all(now) as { id: string; access_level: string; access_expiry: string }[];
}

// ═══════════════════════════════════════════════════════════
// Proof Operations
// ═══════════════════════════════════════════════════════════

export function createProof(
  userId: string | null,
  filename: string,
  fileHash: string,
  filePath: string,
  fileSize: number,
  tier: AccessLevel,
  expiresAt: string,
  escrowId: string,
  issuer: string | null
): ProofRecord {
  const id = uuid();
  const now = new Date().toISOString();
  const status = userId ? 'active' : 'pending';
  db.prepare(
    `INSERT INTO proofs (id, user_id, filename, file_hash, file_path, file_size, tier, expires_at, escrow_id, issuer, status, uploaded_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, filename, fileHash, filePath, fileSize, tier, expiresAt, escrowId, issuer, status, now, now, now);
  return getProofById(id)!;
}

export function getProofById(id: string): ProofRecord | null {
  return db.prepare('SELECT * FROM proofs WHERE id = ?').get(id) as ProofRecord | null;
}

export function getActiveProofByUserId(userId: string): ProofRecord | null {
  return db.prepare(
    "SELECT * FROM proofs WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  ).get(userId) as ProofRecord | null;
}

/** Get pending (unclaimed) proofs. */
export function getPendingProofs(): ProofRecord[] {
  return db.prepare(
    "SELECT * FROM proofs WHERE user_id IS NULL AND status = 'pending' ORDER BY created_at DESC"
  ).all() as ProofRecord[];
}

export function getAllProofsByUserId(userId: string): ProofRecord[] {
  return db.prepare(
    'SELECT * FROM proofs WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as ProofRecord[];
}

export function getProofByEscrowId(escrowId: string): ProofRecord | null {
  return db.prepare('SELECT * FROM proofs WHERE escrow_id = ?').get(escrowId) as ProofRecord | null;
}

export function getAllProofs(): ProofRecord[] {
  return db.prepare('SELECT * FROM proofs ORDER BY created_at DESC').all() as ProofRecord[];
}

export function getActiveProofs(): ProofRecord[] {
  return db.prepare("SELECT * FROM proofs WHERE status = 'active' ORDER BY expires_at ASC").all() as ProofRecord[];
}

export function updateProofStatus(proofId: string, status: ProofStatus, lastError?: string | null): void {
  const now = new Date().toISOString();
  const verifiedAt = (status === 'active') ? now : null;
  db.prepare(
    'UPDATE proofs SET status = ?, last_error = ?, verified_at = COALESCE(?, verified_at), updated_at = ? WHERE id = ?'
  ).run(status, lastError || null, verifiedAt, now, proofId);
}

export function deleteProof(proofId: string): boolean {
  const proof = getProofById(proofId);
  if (proof && proof.file_path) {
    try {
      const fullPath = join(process.cwd(), proof.file_path);
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }
    } catch (err) {
      console.warn(`[DataLayer] Could not delete file ${proof.file_path}:`, err);
    }
  }
  const result = db.prepare('DELETE FROM proofs WHERE id = ?').run(proofId);
  return result.changes > 0;
}

export function deactivateOldProofs(userId: string, keepProofId?: string): number {
  const params: any[] = [userId];
  let sql = "UPDATE proofs SET status = 'expired', updated_at = datetime('now') WHERE user_id = ? AND status = 'active'";
  if (keepProofId) {
    sql += ' AND id != ?';
    params.push(keepProofId);
  }
  const result = db.prepare(sql).run(...params);
  return result.changes;
}

/**
 * Associate a proof with a user (claim the proof).
 * This is the core of the bearer-instrument model:
 * any user who possesses the proof file can claim it.
 */
export function associateProofWithUser(proofId: string, userId: string): boolean {
  const now = new Date().toISOString();
  const result = db.prepare(
    "UPDATE proofs SET user_id = ?, status = 'active', verified_at = ?, updated_at = ? WHERE id = ? AND status != 'expired'"
  ).run(userId, now, now, proofId);
  return result.changes > 0;
}

export function getProofsExpiringSoon(now: string, days: number): ProofRecord[] {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  return db.prepare(
    "SELECT * FROM proofs WHERE status = 'active' AND expires_at > ? AND expires_at <= ?"
  ).all(now, futureDate.toISOString()) as ProofRecord[];
}

export function getExpiredActiveProofs(now: string): ProofRecord[] {
  return db.prepare(
    "SELECT * FROM proofs WHERE status = 'active' AND expires_at <= ?"
  ).all(now) as ProofRecord[];
}

// ═══════════════════════════════════════════════════════════
// Access Log Operations
// ═══════════════════════════════════════════════════════════

export function logAccessChange(
  userId: string,
  oldLevel: AccessLevel,
  newLevel: AccessLevel,
  reason: ReasonCode,
  proofId?: string | null
): AccessLogRecord {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO access_log (id, user_id, old_level, new_level, reason, proof_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, oldLevel, newLevel, reason, proofId || null, now);
  return { id, user_id: userId, old_level: oldLevel, new_level: newLevel, reason: reason as AccessLogRecord['reason'], proof_id: proofId || null, created_at: now };
}

export function getAccessLogs(userId?: string, limit = 50): AccessLogRecord[] {
  if (userId) {
    return db.prepare('SELECT * FROM access_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit) as AccessLogRecord[];
  }
  return db.prepare('SELECT * FROM access_log ORDER BY created_at DESC LIMIT ?')
    .all(limit) as AccessLogRecord[];
}

// ═══════════════════════════════════════════════════════════
// Message Operations
// ═══════════════════════════════════════════════════════════

export function createMessage(
  userId: string,
  subject: string,
  body: string,
  priority: MessagePriority,
  proofId?: string | null
): MessageRecord {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, user_id, subject, body, priority, is_read, proof_id, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).run(id, userId, subject, body, priority, proofId || null, now);
  return getMessageById(id)!;
}

export function getMessageById(id: string): MessageRecord | null {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRecord | null;
}

export function getMessagesByUserId(userId: string, includeRead = true, limit = 50): MessageRecord[] {
  if (includeRead) {
    return db.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit) as MessageRecord[];
  }
  return db.prepare('SELECT * FROM messages WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit) as MessageRecord[];
}

export function getUnreadMessageCount(userId: string): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM messages WHERE user_id = ? AND is_read = 0')
    .get(userId) as { c: number };
  return row.c;
}

export function markMessageRead(messageId: string): boolean {
  const result = db.prepare("UPDATE messages SET is_read = 1 WHERE id = ? AND is_read = 0").run(messageId);
  return result.changes > 0;
}

export function markAllMessagesRead(userId: string): number {
  const result = db.prepare("UPDATE messages SET is_read = 1 WHERE user_id = ? AND is_read = 0").run(userId);
  return result.changes;
}

export function deleteMessage(messageId: string): boolean {
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════
// Statistics
// ═══════════════════════════════════════════════════════════

export function getStats(): TokenPayStats {
  const row = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  return {
    totalUsers: row('SELECT COUNT(*) as c FROM users'),
    activeUsers: row("SELECT COUNT(*) as c FROM users WHERE access_level = 'read_write'"),
    read_only: row("SELECT COUNT(*) as c FROM users WHERE access_level = 'read_only'"),
    read_write: row("SELECT COUNT(*) as c FROM users WHERE access_level = 'read_write'"),
    totalProofs: row('SELECT COUNT(*) as c FROM proofs'),
    activeProofs: row("SELECT COUNT(*) as c FROM proofs WHERE status = 'active'"),
    pendingProofs: row("SELECT COUNT(*) as c FROM proofs WHERE status = 'pending'"),
    expiredProofs: row("SELECT COUNT(*) as c FROM proofs WHERE status = 'expired'"),
    totalMessages: row('SELECT COUNT(*) as c FROM messages'),
    unreadMessages: row('SELECT COUNT(*) as c FROM messages WHERE is_read = 0'),
  };
}
