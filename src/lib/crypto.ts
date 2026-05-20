/**
 * AlphaFlow — AES-256-GCM Encryption Module
 *
 * Server-side only. Used to encrypt sensitive data at rest, specifically
 * bank access tokens and refresh tokens stored in the BankConnection model.
 *
 * Design decisions:
 * - Algorithm: AES-256-GCM (authenticated encryption with associated data)
 * - IV: 12 bytes (96 bits) — NIST recommended for GCM mode
 * - Auth tag: 16 bytes (128 bits) — standard GCM tag length
 * - Key: 32 bytes (256 bits) — hex-encoded in ENCRYPTION_KEY env var
 * - Storage format: `iv_base64:authTag_base64:ciphertext_base64`
 *
 * Security properties:
 * - Each encryption uses a unique random IV (no IV reuse)
 * - GCM provides both confidentiality AND integrity verification
 * - Tampered ciphertext is rejected during decryption
 * - Key is never stored in the database — only in environment variable
 *
 * Backward compatibility:
 * - isEncrypted() can detect legacy base64-encoded tokens (no colons)
 * - migrateBase64Token() re-encrypts old tokens to AES-256-GCM format
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;        // 96 bits — NIST SP 800-38D recommended
const AUTH_TAG_LENGTH = 16;  // 128 bits — standard GCM authentication tag
const KEY_LENGTH = 32;       // 256 bits — AES-256

// Cache the parsed key to avoid re-parsing on every call
let cachedKey: Buffer | null = null;

// ─── Key Management ─────────────────────────────────────────────────────────

/**
 * Get the encryption key from the ENCRYPTION_KEY environment variable.
 * The key must be a 64-character hex string (32 bytes / 256 bits).
 * Key is cached after first parse for performance.
 *
 * @throws Error if ENCRYPTION_KEY is not set or has wrong length
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'CRITICAL: ENCRYPTION_KEY environment variable is not set. ' +
      'Bank tokens cannot be encrypted. Generate a key with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters). ` +
      `Got ${key.length} bytes. Generate a valid key with: ` +
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }

  cachedKey = key;
  return key;
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt (e.g., an OAuth access token)
 * @returns A string in format `iv:authTag:ciphertext` (all base64-encoded, colon-separated)
 *
 * @example
 * const encrypted = encrypt('my-secret-token');
 * // => "dGhpcyBpcyAxMic=:aWV3OW1WY1R6R0c=:eW91cl9lbmNyeXB0ZWRfZGF0YQ=="
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 *
 * @param encrypted - The encrypted string in format `iv:authTag:ciphertext`
 * @returns The original plaintext string
 * @throws Error if decryption fails (wrong key, tampered data, invalid format)
 *
 * @example
 * const plaintext = decrypt(encrypted);
 * // => "my-secret-token"
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted data format. Expected "iv:authTag:ciphertext" with 3 colon-separated base64 parts.'
    );
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Encrypt a nullable value. Returns null if input is null/undefined.
 */
export function encryptOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

/**
 * Decrypt a nullable value. Returns null if input is null/undefined.
 * Returns empty string if decryption yields empty result.
 */
export function decryptOrNull(value: string | null | undefined): string {
  if (!value) return '';
  return decrypt(value);
}

/**
 * Check if a stored value looks like it was encrypted with AES-256-GCM.
 *
 * Encrypted values have the format `base64:base64:base64` (3 colon-separated
 * base64 strings). Legacy base64-encoded tokens do NOT contain colons, so
 * this simple check is reliable for distinguishing the two formats.
 *
 * @param value - The stored value to check
 * @returns true if the value appears to be AES-256-GCM encrypted
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  // Quick sanity check: all 3 parts should be non-empty
  return parts.every(p => p.length > 0);
}

/**
 * Migrate a legacy base64-encoded token to AES-256-GCM encrypted format.
 * If the value is already encrypted, returns it unchanged.
 * If the value is null/empty, returns null.
 *
 * Use this to upgrade existing bank tokens in the database.
 *
 * @param value - The stored value (may be base64 or already encrypted)
 * @returns The AES-256-GCM encrypted value, or null
 *
 * @example
 * const migrated = migrateBase64Token(storedToken);
 * if (migrated !== storedToken) {
 *   await db.bankConnection.update({
 *     where: { id: connectionId },
 *     data: { accessToken: migrated },
 *   });
 * }
 */
export function migrateBase64Token(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isEncrypted(value)) return value;

  // Legacy format: raw base64-encoded plaintext
  try {
    const plaintext = Buffer.from(value, 'base64').toString('utf8');
    return encrypt(plaintext);
  } catch {
    // If base64 decode fails, the value might be plaintext — encrypt it directly
    return encrypt(value);
  }
}

/**
 * Generate a new random encryption key.
 * Useful for initial setup — call this to generate a key for ENCRYPTION_KEY env var.
 *
 * @returns A 64-character hex string (32 bytes / 256 bits)
 */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}
