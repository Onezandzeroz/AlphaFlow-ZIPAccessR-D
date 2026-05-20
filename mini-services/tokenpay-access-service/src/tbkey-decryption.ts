// TokenPay Access Service — .tbkey Decryption
// Decrypts AES-256-GCM encrypted proof files produced by TokenBay-ZIPProof.
//
// Binary format of a .tbkey file:
//   Byte 0:       Version marker (0x01)
//   Bytes 1-12:   IV / nonce (12 bytes, random per file)
//   Bytes 13-28:  GCM auth tag (16 bytes)
//   Bytes 29+:    AES-256-GCM ciphertext (encrypted ZIP data)
//
// The PROOF_ENCRYPTION_KEY environment variable must be a 64-char hex string (32 bytes).
// This same key is used in TokenBay-ZIPProof to encrypt the proof ZIP.

import { createDecipheriv } from 'crypto';

// ─── Constants ──────────────────────────────────────────────

const TBKEY_VERSION = 0x01;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MIN_HEADER_SIZE = 1 + IV_LENGTH + AUTH_TAG_LENGTH; // 29 bytes

// ─── Validation ────────────────────────────────────────────

let cachedKey: Buffer | null = null;

/**
 * Parse and validate the encryption key from environment.
 * Key must be a 64-character hex string (32 bytes).
 * Throws if the key is missing or invalid.
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const hex = process.env.PROOF_ENCRYPTION_KEY;
  if (!hex || hex.trim() === '') {
    throw new Error(
      'PROOF_ENCRYPTION_KEY is not set. ' +
      'This service requires a shared AES-256-GCM key to decrypt .tbkey proof files. ' +
      'Set PROOF_ENCRYPTION_KEY in your environment (64-char hex string, 32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const trimmed = hex.trim();
  if (trimmed.length !== 64) {
    throw new Error(
      `PROOF_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${trimmed.length} characters`
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error('PROOF_ENCRYPTION_KEY must be a valid 64-character hex string');
  }

  cachedKey = Buffer.from(trimmed, 'hex');
  return cachedKey;
}

/**
 * Check if the encryption key is configured (without throwing).
 * Useful for startup health checks.
 */
export function hasEncryptionKey(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

// ─── Decryption ────────────────────────────────────────────

export type TbkeyDecryptResult =
  | { success: true; zipData: Uint8Array }
  | { success: false; error: string };

/**
 * Decrypt a .tbkey file and return the inner ZIP data.
 *
 * @param tbkeyBuffer - The raw bytes of the uploaded .tbkey file
 * @returns The decrypted ZIP data as Uint8Array, or an error
 */
export function decryptTbkey(tbkeyBuffer: Uint8Array): TbkeyDecryptResult {
  // Validate minimum file size
  if (tbkeyBuffer.byteLength < MIN_HEADER_SIZE) {
    return {
      success: false,
      error: `Invalid .tbkey file: too small (${tbkeyBuffer.byteLength} bytes, minimum ${MIN_HEADER_SIZE})`,
    };
  }

  // Validate version marker
  if (tbkeyBuffer[0] !== TBKEY_VERSION) {
    return {
      success: false,
      error: `Invalid .tbkey file: unsupported version marker 0x${tbkeyBuffer[0].toString(16).padStart(2, '0')} (expected 0x01)`,
    };
  }

  // Extract header components
  const iv = tbkeyBuffer.slice(1, 1 + IV_LENGTH);
  const authTag = tbkeyBuffer.slice(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = tbkeyBuffer.slice(1 + IV_LENGTH + AUTH_TAG_LENGTH);

  if (ciphertext.byteLength === 0) {
    return {
      success: false,
      error: 'Invalid .tbkey file: no ciphertext (empty encrypted payload)',
    };
  }

  // Get the encryption key
  let key: Buffer;
  try {
    key = getEncryptionKey();
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  // Decrypt using AES-256-GCM
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return {
      success: true,
      zipData: new Uint8Array(decrypted),
    };
  } catch (err: any) {
    // GCM authentication failure means the file was tampered with,
    // or the encryption key doesn't match the one used to encrypt.
    if (err.message?.includes('Unsupported state') || err.message?.includes('auth tag')) {
      return {
        success: false,
        error: 'Decryption failed: authentication tag mismatch. The file may be corrupted, tampered with, or encrypted with a different key.',
      };
    }
    return {
      success: false,
      error: `Decryption failed: ${err.message}`,
    };
  }
}
