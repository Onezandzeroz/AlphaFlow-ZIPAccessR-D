/**
 * One-time migration script: Re-encrypt legacy base64 bank tokens to AES-256-GCM format.
 *
 * Background:
 *   BankConnection.accessToken and .refreshToken were originally stored as
 *   raw base64-encoded strings. This script re-encrypts them using AES-256-GCM
 *   (the format produced by @/lib/crypto) so every token in the DB is
 *   consistently encrypted going forward.
 *
 * Usage:
 *   bun run scripts/migrate-bank-tokens.ts            # dry-run (default)
 *   bun run scripts/migrate-bank-tokens.ts --execute  # apply migration
 */

import { createCipheriv, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Crypto helpers (inlined so the script runs standalone without Next.js aliases)
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) throw new Error('ENCRYPTION_KEY environment variable is not set');
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return key;
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Returns true when the value already follows the iv:authTag:ciphertext format
 * produced by AES-256-GCM encryption.
 */
function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * If the token is already encrypted, return it as-is.
 * Otherwise decode it from base64 and re-encrypt with AES-256-GCM.
 * Falls back to encrypting the raw string if base64 decoding fails.
 */
function migrateBase64Token(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isEncrypted(value)) return value;
  try {
    const plaintext = Buffer.from(value, 'base64').toString('utf8');
    return encrypt(plaintext);
  } catch {
    return encrypt(value);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const db = new PrismaClient();

async function main() {
  const isDryRun = process.argv[2] !== '--execute';

  console.log('=== Bank Token Migration (base64 → AES-256-GCM) ===\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN — no changes will be made' : 'EXECUTE — tokens will be re-encrypted'}\n`);

  // Fetch all BankConnection records that have at least one token
  const connections = await db.bankConnection.findMany({
    where: {
      OR: [
        { accessToken: { not: null } },
        { refreshToken: { not: null } },
      ],
    },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
    },
  });

  console.log(`Found ${connections.length} bank connection(s) with token(s).\n`);

  // Track migration stats
  let accessTokensMigrated = 0;
  let refreshTokensMigrated = 0;
  let accessTokensSkipped = 0;
  let refreshTokensSkipped = 0;

  for (const conn of connections) {
    const changes: string[] = [];

    // --- accessToken ---
    if (conn.accessToken && !isEncrypted(conn.accessToken)) {
      const reEncrypted = migrateBase64Token(conn.accessToken);
      if (reEncrypted && reEncrypted !== conn.accessToken) {
        accessTokensMigrated++;
        changes.push('accessToken');
        if (!isDryRun) {
          await db.bankConnection.update({
            where: { id: conn.id },
            data: { accessToken: reEncrypted },
          });
        }
      }
    } else if (conn.accessToken) {
      accessTokensSkipped++;
    }

    // --- refreshToken ---
    if (conn.refreshToken && !isEncrypted(conn.refreshToken)) {
      const reEncrypted = migrateBase64Token(conn.refreshToken);
      if (reEncrypted && reEncrypted !== conn.refreshToken) {
        refreshTokensMigrated++;
        changes.push('refreshToken');
        if (!isDryRun) {
          await db.bankConnection.update({
            where: { id: conn.id },
            data: { refreshToken: reEncrypted },
          });
        }
      }
    } else if (conn.refreshToken) {
      refreshTokensSkipped++;
    }

    if (changes.length > 0) {
      console.log(`  [${conn.id}] ${isDryRun ? 'WOULD migrate' : 'Migrated'}: ${changes.join(', ')}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  const totalMigrated = accessTokensMigrated + refreshTokensMigrated;
  const totalSkipped = accessTokensSkipped + refreshTokensSkipped;

  console.log('\n=== Migration Summary ===\n');
  console.log(`  ┌──────────────────────────┬───────────┐`);
  console.log(`  │ Field                    │ Migrated  │`);
  console.log(`  ├──────────────────────────┼───────────┤`);
  console.log(`  │ accessToken              │ ${String(accessTokensMigrated).padStart(9)} │`);
  console.log(`  │ refreshToken             │ ${String(refreshTokensMigrated).padStart(9)} │`);
  console.log(`  ├──────────────────────────┼───────────┤`);
  console.log(`  │ Total migrated           │ ${String(totalMigrated).padStart(9)} │`);
  console.log(`  │ Already encrypted        │ ${String(totalSkipped).padStart(9)} │`);
  console.log(`  │ Connections scanned      │ ${String(connections.length).padStart(9)} │`);
  console.log(`  └──────────────────────────┴───────────┘\n`);

  if (isDryRun && totalMigrated > 0) {
    console.log('👉 To apply the migration, run: bun run scripts/migrate-bank-tokens.ts --execute');
  } else if (isDryRun && totalMigrated === 0) {
    console.log('✅ All tokens are already encrypted. Nothing to do.');
  } else if (!isDryRun && totalMigrated > 0) {
    console.log(`✅ Migration complete. ${totalMigrated} token(s) re-encrypted.`);
  } else {
    console.log('✅ No tokens needed migration.');
  }
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
