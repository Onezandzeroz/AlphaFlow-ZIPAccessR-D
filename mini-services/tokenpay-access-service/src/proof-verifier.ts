// TokenPay Access Service — Proof Verifier
// Handles .tbkey decryption, ZIP proof file parsing, validation, and storage on disk.
// This is the heart of the system: proofs are encrypted .tbkey files uploaded externally
// (purchasing/creation happens in TokenBay-ZIPProof), this module decrypts and verifies them.

import { unzipSync } from 'fflate';
import { createHash } from 'crypto';
import { join, basename } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { mkdirSync } from 'fs';
import type { ProofManifest, ProofStatus, AccessLevel } from './types.js';
import { PROOF_DIR, MANIFEST_FILENAME, DEFAULT_ACCESS_LEVEL, ACCESS_HIERARCHY, GRANTED_ACCESS_LEVEL } from './types.js';
import { createProof, getProofById, getProofByEscrowId } from './data-layer.js';
import { decryptTbkey, type TbkeyDecryptResult } from './tbkey-decryption.js';

// ─── File Storage ──────────────────────────────────────────

/**
 * Save an uploaded file buffer to disk and return the relative path.
 * Stores the original .tbkey file (encrypted), not the decrypted ZIP.
 */
export function storeProofFile(buffer: Uint8Array, originalFilename: string): string {
  mkdirSync(PROOF_DIR, { recursive: true });
  // Use a timestamp prefix to avoid collisions
  const safeName = basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedName = `${Date.now()}-${safeName}`;
  const filePath = join(PROOF_DIR, storedName);
  writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Compute SHA-256 hash of a buffer.
 */
export function computeFileHash(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Read a stored proof file from disk.
 */
export function readProofFile(filePath: string): Uint8Array | null {
  const fullPath = join(process.cwd(), filePath);
  if (!existsSync(fullPath)) return null;
  return new Uint8Array(readFileSync(fullPath));
}

// ─── .tbkey Decryption ─────────────────────────────────────

/**
 * Decrypt a .tbkey file and return the inner ZIP data.
 * Returns a structured error result instead of throwing.
 */
export function decryptProofFile(tbkeyBuffer: Uint8Array): TbkeyDecryptResult {
  return decryptTbkey(tbkeyBuffer);
}

// ─── ZIP Parsing ───────────────────────────────────────────

/**
 * Parse a ZIP buffer and extract the manifest.json inside it.
 * Returns the parsed ProofManifest.
 */
export function parseZipProof(zipBuffer: Uint8Array): {
  manifest: ProofManifest;
  files: string[];  // list of files in the ZIP
} {
  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(zipBuffer);
  } catch (err: any) {
    throw new Error(`Invalid ZIP file: ${err.message}`);
  }

  const fileList = Object.keys(files);

  if (!fileList.includes(MANIFEST_FILENAME)) {
    throw new Error(`ZIP must contain '${MANIFEST_FILENAME}'`);
  }

  let manifestRaw: string;
  try {
    manifestRaw = new TextDecoder().decode(files[MANIFEST_FILENAME]);
  } catch {
    throw new Error(`Could not read '${MANIFEST_FILENAME}' from ZIP`);
  }

  let manifest: ProofManifest;
  try {
    manifest = JSON.parse(manifestRaw) as ProofManifest;
  } catch {
    throw new Error(`'${MANIFEST_FILENAME}' is not valid JSON`);
  }

  return { manifest, files: fileList };
}

// ─── Manifest Validation ───────────────────────────────────

export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Validate a proof manifest. Returns an array of errors (empty = valid).
 */
export function validateManifest(manifest: ProofManifest): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!manifest.version || typeof manifest.version !== 'number') {
    errors.push({ field: 'version', message: 'Version is required and must be a number' });
  }
  if (!manifest.proofId || typeof manifest.proofId !== 'string') {
    errors.push({ field: 'proofId', message: 'proofId is required' });
  }
  // userId is NOT required — proofs are user-agnostic (bearer instruments)
  // Backward compatibility: if present, it is accepted but ignored
  if (!manifest.escrowId || typeof manifest.escrowId !== 'string') {
    errors.push({ field: 'escrowId', message: 'escrowId is required' });
  }
  // tier must be 'read_write' — the only granted access level.
  // 'read_only' is the default (denied) and should not appear in a proof manifest.
  if (!manifest.tier || manifest.tier !== GRANTED_ACCESS_LEVEL) {
    errors.push({ field: 'tier', message: `tier must be '${GRANTED_ACCESS_LEVEL}'` });
  }
  if (!manifest.issuedAt) {
    errors.push({ field: 'issuedAt', message: 'issuedAt is required' });
  }
  if (!manifest.expiresAt) {
    errors.push({ field: 'expiresAt', message: 'expiresAt is required' });
  }

  if (errors.length > 0) return errors;

  // Date validation
  const issuedAt = new Date(manifest.issuedAt);
  const expiresAt = new Date(manifest.expiresAt);
  const now = new Date();

  if (isNaN(issuedAt.getTime())) {
    errors.push({ field: 'issuedAt', message: 'issuedAt is not a valid date' });
  }
  if (isNaN(expiresAt.getTime())) {
    errors.push({ field: 'expiresAt', message: 'expiresAt is not a valid date' });
  }
  if (expiresAt <= issuedAt) {
    errors.push({ field: 'expiresAt', message: 'expiresAt must be after issuedAt' });
  }
  if (expiresAt <= now) {
    errors.push({ field: 'expiresAt', message: 'Proof has already expired' });
  }

  return errors;
}

// ─── Full Verification Pipeline ────────────────────────────

export type VerificationResult =
  | { success: true; proofId: string; manifest: ProofManifest; filePath: string; fileHash: string }
  | { success: false; stage: number; error: string; details?: ValidationError[] };

/**
 * Full proof verification pipeline (7 stages):
 *   Stage 1: .tbkey decryption
 *   Stage 2: File integrity (valid ZIP after decryption)
 *   Stage 3: Manifest extraction and parsing
 *   Stage 4: Manifest validation (required fields, dates)
 *   Stage 5: Expiry check (not already expired)
 *   Stage 6: Duplicate check (no active proof with same escrowId)
 *   Stage 7: Store file and create DB record
 *
 * This does NOT grant access — that's the access-engine's job.
 *
 * @param tbkeyBuffer - The raw .tbkey file bytes
 * @param filename - Original filename (e.g., "proof.tbkey")
 */
export function verifyProofFile(
  tbkeyBuffer: Uint8Array,
  filename: string
): VerificationResult {
  const fileHash = computeFileHash(tbkeyBuffer);

  // Stage 1: Decrypt .tbkey file
  const decrypted = decryptProofFile(tbkeyBuffer);
  if (!decrypted.success) {
    return { success: false, stage: 1, error: `Decryption failed: ${decrypted.error}` };
  }

  let zipBuffer = decrypted.zipData;
  let parsed: { manifest: ProofManifest; files: string[] };

  // Stage 2: File integrity — is the decrypted data a valid ZIP?
  try {
    parsed = parseZipProof(zipBuffer);
  } catch (err: any) {
    return { success: false, stage: 2, error: err.message };
  }

  // Stage 3: Manifest exists and parses correctly
  const { manifest, files } = parsed;

  // Stage 4: Manifest field validation
  const validationErrors = validateManifest(manifest);
  if (validationErrors.length > 0) {
    return {
      success: false,
      stage: 4,
      error: 'Invalid manifest fields',
      details: validationErrors,
    };
  }

  // Stage 5: Expiry check
  if (new Date(manifest.expiresAt) <= new Date()) {
    return { success: false, stage: 5, error: 'Proof has already expired' };
  }

  // Stage 6: Duplicate check — prevent re-uploading the same escrow
  const existingByEscrow = getProofByEscrowId(manifest.escrowId);
  if (existingByEscrow && existingByEscrow.status === 'active') {
    return {
      success: false,
      stage: 6,
      error: `An active proof for escrow '${manifest.escrowId}' already exists`,
    };
  }

  // Stage 7: Store the .tbkey file (encrypted) and create DB record
  try {
    const filePath = storeProofFile(tbkeyBuffer, filename);
    const proof = createProof(
      null,  // user_id is null — proof is user-agnostic until activated
      filename,
      fileHash,
      filePath,
      tbkeyBuffer.byteLength,
      GRANTED_ACCESS_LEVEL, // always grants read_write regardless of manifest content
      manifest.expiresAt,
      manifest.escrowId,
      manifest.issuer || null
    );

    console.log(
      `[ProofVerifier] Stored proof ${proof.id} (user-agnostic)` +
      ` (tier=${manifest.tier}, escrow=${manifest.escrowId}, expires=${manifest.expiresAt})`
    );

    return {
      success: true,
      proofId: proof.id,
      manifest,
      filePath,
      fileHash,
    };
  } catch (err: any) {
    return { success: false, stage: 7, error: `Failed to store proof: ${err.message}` };
  }
}

/**
 * Re-verify an already stored proof (used by the cron job).
 * Reads the .tbkey from disk, decrypts it, parses and validates the manifest again.
 */
export function reverifyStoredProof(proofId: string): {
  valid: boolean;
  expired: boolean;
  error?: string;
} {
  const proof = getProofById(proofId);
  if (!proof) {
    return { valid: false, expired: false, error: 'Proof not found in database' };
  }

  // Read the encrypted .tbkey from disk
  const tbkeyBuffer = readProofFile(proof.file_path);
  if (!tbkeyBuffer) {
    return { valid: false, expired: false, error: 'Proof file not found on disk' };
  }

  // Verify file hash matches what we stored
  const currentHash = computeFileHash(tbkeyBuffer);
  if (currentHash !== proof.file_hash) {
    return { valid: false, expired: false, error: 'File hash mismatch — file may have been tampered with' };
  }

  // Decrypt the .tbkey
  const decrypted = decryptProofFile(tbkeyBuffer);
  if (!decrypted.success) {
    return { valid: false, expired: false, error: `Decryption failed: ${decrypted.error}` };
  }

  // Parse and validate the manifest
  let parsed: { manifest: ProofManifest };
  try {
    parsed = parseZipProof(decrypted.zipData);
  } catch (err: any) {
    return { valid: false, expired: false, error: `Invalid ZIP after decryption: ${err.message}` };
  }

  const validationErrors = validateManifest(parsed.manifest);
  if (validationErrors.length > 0) {
    return {
      valid: false,
      expired: false,
      error: `Invalid manifest: ${validationErrors.map(e => e.message).join(', ')}`,
    };
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(parsed.manifest.expiresAt);
  if (expiresAt <= now) {
    return { valid: false, expired: true, error: 'Proof has expired' };
  }

  return { valid: true, expired: false };
}
