// TokenPay Access Service — API Gateway (Hono on Bun)
// Port 3100
//
// Mission: Control user access based on valid proof files (ZIP).
//   - Receives and stores ZIPped proof files
//   - Verifies proof validity on upload and continuously via cron
//   - Grants/revokes access based on proof status
//   - Sends webhook callbacks and in-app messages

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  initDataLayer, getUserById, findOrCreateUser, findOrCreateUserById, getAllUsers, deleteUser,
  getProofById, getActiveProofByUserId, getAllProofsByUserId, getAllProofs,
  getAccessLogs, getStats, getPendingProofs,
  createMessage, getMessagesByUserId, markMessageRead, markAllMessagesRead,
  deleteMessage, getUnreadMessageCount,
} from './src/data-layer.js';
import {
  checkAccess, activateProof, processExpiredAccess,
  adminOverride, auditAllActiveProofs, grantTrial,
} from './src/access-engine.js';
import { verifyProofFile, readProofFile, computeFileHash } from './src/proof-verifier.js';
import {
  notifyAccessGranted, notifyAccessRevoked, configureNotification,
} from './src/notification.js';
import {
  startCron, stopCron, getCronStatus,
} from './src/cron.js';
import type { AccessLevel } from './src/types.js';
import { CRON_INTERVAL_MS } from './src/types.js';
import { getEncryptionKey, hasEncryptionKey } from './src/tbkey-decryption.js';

// ─── Configuration ─────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3100', 10);
const API_KEY = process.env.API_SHARED_KEY || 'tokenpay-dev-key-2026';
const HOST_CALLBACK_URL = process.env.HOST_CALLBACK_URL || '';
const DB_PATH = process.env.DATABASE_PATH || './data/access.db';

// ─── Initialize ────────────────────────────────────────────

// Validate encryption key on startup (required for .tbkey decryption)
if (!hasEncryptionKey()) {
  console.error('');
  console.error('  ╔══════════════════════════════════════════════════════════╗');
  console.error('  ║  FATAL: PROOF_ENCRYPTION_KEY is not set.                 ║');
  console.error('  ║  This service requires a shared AES-256-GCM key to       ║');
  console.error('  ║  decrypt .tbkey proof files.                             ║');
  console.error('  ║                                                          ║');
  console.error('  ║  Set PROOF_ENCRYPTION_KEY in your environment:            ║');
  console.error('  ║    export PROOF_ENCRYPTION_KEY="<64-char-hex-string>"      ║');
  console.error('  ║                                                          ║');
  console.error('  ║  Generate a key with:                                     ║');
  console.error('  ║    node -e "console.log(require(\'crypto\').randomBytes(32)  ║');
  console.error('  ║              .toString(\'hex\'))"                          ║');
  console.error('  ║                                                          ║');
  console.error('  ║  This key MUST match the key in TokenBay-ZIPProof.         ║');
  console.error('  ╚══════════════════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}

initDataLayer(DB_PATH);
if (HOST_CALLBACK_URL) {
  configureNotification(HOST_CALLBACK_URL, API_KEY);
}

// Start the automated cron
startCron();

// ─── App ───────────────────────────────────────────────────

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Access-Service-Key'],
}));

// ─── Middleware: API Key Auth ──────────────────────────────

const requireAuth = async (c: any, next: any) => {
  const key = c.req.header('X-Access-Service-Key');
  if (!key || key !== API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// ─── Rate limiting ─────────────────────────────────────────

const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

// ═══════════════════════════════════════════════════════════
// Public Endpoints
// ═══════════════════════════════════════════════════════════

app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'TokenPay Access Service',
  version: '2.0.0',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  cron: getCronStatus(),
}));

app.get('/', (c) => c.json({
  name: 'TokenPay Access Service',
  version: '2.0.0',
  mission: 'Control user access based on valid proof files (ZIP)',
  cron: getCronStatus(),
}));

// ═══════════════════════════════════════════════════════════
// v1 API
// ═══════════════════════════════════════════════════════════

const v1 = app.basePath('/api/v1');

// ─── Access Control ────────────────────────────────────────

v1.get('/access/:userId', requireAuth, (c) => {
  const userId = c.req.param('userId');
  const result = checkAccess(userId);
  return c.json(result);
});

v1.get('/access/:userId/status', requireAuth, (c) => {
  const userId = c.req.param('userId');
  const user = getUserById(userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const activeProof = getActiveProofByUserId(userId);
  const logs = getAccessLogs(userId, 10);
  const access = checkAccess(userId);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      accessLevel: user.access_level,
      accessExpiry: user.access_expiry,
      createdAt: user.created_at,
    },
    access,
    activeProof: activeProof ? {
      proofId: activeProof.id,
      filename: activeProof.filename,
      tier: activeProof.tier,
      expiresAt: activeProof.expires_at,
      escrowId: activeProof.escrow_id,
      status: activeProof.status,
      uploadedAt: activeProof.uploaded_at,
    } : null,
    recentLogs: logs.map(l => ({
      oldLevel: l.old_level,
      newLevel: l.new_level,
      reason: l.reason,
      proofId: l.proof_id,
      timestamp: l.created_at,
    })),
  });
});

// ─── Proof Upload (core mission) ──────────────────────────

/**
 * POST /api/v1/proof/upload
 *
 * Upload an encrypted .tbkey proof file. The proof is user-agnostic (bearer instrument).
 *
 * Content-Type: multipart/form-data
 * Fields:
 *   - proofFile: File (required) — the .tbkey encrypted proof file
 *   - userId: string (optional) — if provided, auto-activates the proof for this user
 *
 * The .tbkey file is decrypted using the shared PROOF_ENCRYPTION_KEY (AES-256-GCM),
 * then the inner ZIP is verified for a valid manifest.json.
 *
 * If userId is omitted, the proof is stored as 'pending' and can be claimed later
 * via POST /api/v1/proof/activate.
 */
v1.post('/proof/upload', requireAuth, async (c) => {
  const body = await c.req.parseBody();
  const userId = (body['userId'] as string) || null;  // optional
  const proofFile = body['proofFile'] as File | string;

  if (!proofFile) {
    return c.json({ error: 'Missing: proofFile (.tbkey encrypted proof file)' }, 400);
  }

  // Handle file — could be a File object (from multipart) or a string
  let tbkeyBuffer: Uint8Array;
  let filename: string;

  if (proofFile instanceof File) {
    tbkeyBuffer = new Uint8Array(await proofFile.arrayBuffer());
    filename = proofFile.name;
  } else {
    return c.json({ error: 'proofFile must be a file upload' }, 400);
  }

  if (!filename.toLowerCase().endsWith('.tbkey')) {
    return c.json({ error: 'proofFile must be a .tbkey encrypted proof file (not .zip or other format)' }, 400);
  }

  // Verify the proof file (user-agnostic — no userId needed)
  const result = verifyProofFile(tbkeyBuffer, filename);

  if (!result.success) {
    return c.json({
      success: false,
      stage: result.stage,
      error: result.error,
      details: result.details,
    }, 400);
  }

  // If userId was provided, auto-activate the proof
  if (userId) {
    // Ensure user exists — auto-create if this is their first interaction
    const user = findOrCreateUserById(userId);

    const activation = activateProof(userId, result.proofId);
    if (!activation.success) {
      return c.json({
        success: false,
        stage: activation.stage,
        error: activation.error,
      }, 400);
    }

    // Notify host app
    await notifyAccessGranted(userId, user.access_level, activation.tier, result.proofId);

    return c.json({
      success: true,
      proofId: result.proofId,
      userId,
      tier: activation.tier,
      expiresAt: activation.expiresAt,
      filename,
      manifest: result.manifest,
    });
  }

  // No userId — proof is stored as pending (unclaimed)
  return c.json({
    success: true,
    proofId: result.proofId,
    status: 'pending',
    message: 'Proof uploaded and verified. Activate it with POST /api/v1/proof/activate to grant access.',
    filename,
    manifest: result.manifest,
  });
});

/**
 * POST /api/v1/proof/activate
 *
 * Activate a previously uploaded proof by proofId.
 * Any user can activate any unclaimed/active proof (bearer instrument model).
 *
 * Body: { userId: string, proofId: string }
 */
v1.post('/proof/activate', requireAuth, async (c) => {
  const { userId, proofId } = await c.req.json<{ userId: string; proofId: string }>();

  if (!userId || !proofId) {
    return c.json({ error: 'Missing: userId, proofId' }, 400);
  }

  const user = getUserById(userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const activation = activateProof(userId, proofId);

  if (!activation.success) {
    return c.json({ success: false, stage: activation.stage, error: activation.error }, 400);
  }

  await notifyAccessGranted(userId, user.access_level, activation.tier, proofId);

  return c.json({ success: true, tier: activation.tier, expiresAt: activation.expiresAt });
});

/**
 * GET /api/v1/proofs/pending
 * List all unclaimed (pending) proofs.
 */
v1.get('/proofs/pending', requireAuth, (c) => {
  return c.json(getPendingProofs().map(p => ({
    id: p.id,
    filename: p.filename,
    tier: p.tier,
    expiresAt: p.expires_at,
    escrowId: p.escrow_id,
    issuer: p.issuer,
    status: p.status,
    uploadedAt: p.uploaded_at,
    createdAt: p.created_at,
  })));
});

// ─── Proof Management ─────────────────────────────────────

v1.get('/proofs', requireAuth, (c) => {
  const userId = c.req.query('userId');
  if (userId) {
    return c.json(getAllProofsByUserId(userId).map(p => ({
      id: p.id,
      userId: p.user_id,
      filename: p.filename,
      tier: p.tier,
      expiresAt: p.expires_at,
      escrowId: p.escrow_id,
      issuer: p.issuer,
      status: p.status,
      verifiedAt: p.verified_at,
      lastError: p.last_error,
      uploadedAt: p.uploaded_at,
      createdAt: p.created_at,
    })));
  }
  return c.json(getAllProofs().map(p => ({
    id: p.id,
    userId: p.user_id,
    filename: p.filename,
    tier: p.tier,
    expiresAt: p.expires_at,
    escrowId: p.escrow_id,
    issuer: p.issuer,
    status: p.status,
    verifiedAt: p.verified_at,
    lastError: p.last_error,
    uploadedAt: p.uploaded_at,
    createdAt: p.created_at,
  })));
});

v1.get('/proofs/:proofId', requireAuth, (c) => {
  const proof = getProofById(c.req.param('proofId'));
  if (!proof) return c.json({ error: 'Proof not found' }, 404);
  return c.json({
    id: proof.id,
    userId: proof.user_id,
    filename: proof.filename,
    fileHash: proof.file_hash,
    fileSize: proof.file_size,
    tier: proof.tier,
    expiresAt: proof.expires_at,
    escrowId: proof.escrow_id,
    issuer: proof.issuer,
    status: proof.status,
    verifiedAt: proof.verified_at,
    lastError: proof.last_error,
    uploadedAt: proof.uploaded_at,
    createdAt: proof.created_at,
  });
});

v1.delete('/proofs/:proofId', requireAuth, async (c) => {
  const { deleteProof } = await import('./src/data-layer.js');
  const deleted = deleteProof(c.req.param('proofId'));
  return c.json({ success: deleted });
});

// ─── User Management ───────────────────────────────────────

v1.post('/users', requireAuth, async (c) => {
  const { email, name } = await c.req.json<{ email: string; name?: string }>();
  if (!email) return c.json({ error: 'Missing: email' }, 400);
  const user = findOrCreateUser(email, name);
  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    accessLevel: user.access_level,
    accessExpiry: user.access_expiry,
    createdAt: user.created_at,
  });
});

v1.get('/users', requireAuth, (c) => {
  return c.json(getAllUsers().map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    accessLevel: u.access_level,
    accessExpiry: u.access_expiry,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  })));
});

v1.delete('/users/:userId', requireAuth, (c) => {
  const deleted = deleteUser(c.req.param('userId'));
  return c.json({ success: deleted });
});

// ─── User Messages ─────────────────────────────────────────

/**
 * POST /api/v1/users/:userId/messages
 * Send a message to a user.
 */
v1.post('/users/:userId/messages', requireAuth, async (c) => {
  const userId = c.req.param('userId');
  const user = getUserById(userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const { subject, body, priority, proofId } = await c.req.json<{
    subject: string;
    body: string;
    priority?: 'info' | 'warning' | 'urgent';
    proofId?: string;
  }>();

  if (!subject || !body) {
    return c.json({ error: 'Missing: subject, body' }, 400);
  }

  const msg = createMessage(userId, subject, body, priority || 'info', proofId || null);
  return c.json({
    id: msg.id,
    userId: msg.user_id,
    subject: msg.subject,
    priority: msg.priority,
    createdAt: msg.created_at,
  });
});

/**
 * GET /api/v1/users/:userId/messages
 * Get messages for a user.
 */
v1.get('/users/:userId/messages', requireAuth, (c) => {
  const userId = c.req.param('userId');
  const unreadOnly = c.req.query('unread') === 'true';
  const limit = parseInt(c.req.query('limit') || '50', 10);

  const user = getUserById(userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const messages = getMessagesByUserId(userId, !unreadOnly, limit);
  const unreadCount = getUnreadMessageCount(userId);

  return c.json({
    messages: messages.map(m => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      priority: m.priority,
      isRead: m.is_read === 1,
      proofId: m.proof_id,
      createdAt: m.created_at,
    })),
    unreadCount,
  });
});

/**
 * PUT /api/v1/messages/:messageId/read
 * Mark a message as read.
 */
v1.put('/messages/:messageId/read', requireAuth, (c) => {
  const marked = markMessageRead(c.req.param('messageId'));
  return c.json({ success: marked });
});

/**
 * PUT /api/v1/users/:userId/messages/read-all
 * Mark all messages as read for a user.
 */
v1.put('/users/:userId/messages/read-all', requireAuth, (c) => {
  const count = markAllMessagesRead(c.req.param('userId'));
  return c.json({ marked: count });
});

v1.delete('/messages/:messageId', requireAuth, (c) => {
  const deleted = deleteMessage(c.req.param('messageId'));
  return c.json({ success: deleted });
});

// ─── Admin ─────────────────────────────────────────────────

v1.post('/admin/override', requireAuth, async (c) => {
  const { userId, targetLevel } = await c.req.json<{ userId: string; targetLevel?: AccessLevel }>();
  if (!userId) return c.json({ error: 'Missing: userId' }, 400);
  const result = adminOverride(userId, targetLevel);
  if (!result.success) return c.json({ error: 'User not found' }, 404);
  await notifyAccessRevoked(userId, result.previousLevel, 'admin_override');
  return c.json({ success: true, userId, previousLevel: result.previousLevel, newLevel: result.newLevel });
});

/**
 * POST /api/v1/admin/grant-trial
 *
 * Grant a free trial period of read_write access to a user.
 * Used during registration to auto-grant trial access without issuing .tbkey proofs.
 * Logs with 'trial_granted' reason code.
 *
 * Body: { userId: string, email?: string, name?: string, days?: number }
 * Response: { success, userId, previousLevel, newLevel, trialExpiry }
 */
v1.post('/admin/grant-trial', requireAuth, async (c) => {
  const { userId, email, name, days } = await c.req.json<{
    userId: string;
    email?: string;
    name?: string;
    days?: number;
  }>();
  if (!userId) return c.json({ error: 'Missing: userId' }, 400);

  const result = grantTrial(userId, email, name, days);
  if (!result.success) {
    return c.json({ error: result.error || 'Failed to grant trial' }, 400);
  }

  return c.json({
    success: true,
    userId,
    previousLevel: result.previousLevel,
    newLevel: result.newLevel,
    trialExpiry: result.trialExpiry,
  });
});

/**
 * POST /api/v1/admin/process-expired
 * Manually trigger expiry processing.
 */
v1.post('/admin/process-expired', requireAuth, async (c) => {
  try {
    const result = processExpiredAccess();
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: 'Expiry processing failed', details: err.message }, 500);
  }
});

/**
 * POST /api/v1/admin/audit
 * Manually trigger a full audit of all active proofs.
 */
v1.post('/admin/audit', requireAuth, (c) => {
  const result = auditAllActiveProofs();
  return c.json(result);
});

v1.get('/cron/status', requireAuth, (c) => {
  return c.json(getCronStatus());
});

// ─── Stats & Logs ──────────────────────────────────────────

v1.get('/stats', requireAuth, (c) => c.json(getStats()));

v1.get('/logs', requireAuth, (c) => {
  const userId = c.req.query('userId');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  return c.json(getAccessLogs(userId || undefined, limit).map(l => ({
    id: l.id,
    userId: l.user_id,
    oldLevel: l.old_level,
    newLevel: l.new_level,
    reason: l.reason,
    proofId: l.proof_id,
    timestamp: l.created_at,
  })));
});

// ─── Error handling ────────────────────────────────────────

app.onError((err, c) => {
  console.error('[API] Error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

// ─── Start ─────────────────────────────────────────────────

const server = Bun.serve({ port: PORT, fetch: app.fetch });

console.log(`\n  ╔══════════════════════════════════════════════╗`);
console.log(`  ║  TokenPay Access Service v2.0.0             ║`);
console.log(`  ║  Port: ${String(PORT).padEnd(36)}║`);
console.log(`  ║  Cron: Active (every ${String(CRON_INTERVAL_MS / 1000 + 's').padEnd(23)}║`);
console.log(`  ║  Proof Dir: ${'./data/proofs'.padEnd(30)}║`);
console.log(`  ╚══════════════════════════════════════════════╝\n`);

// Graceful shutdown
process.on('SIGTERM', () => { console.log('Shutting down...'); stopCron(); process.exit(0); });
process.on('SIGINT', () => { console.log('Shutting down...'); stopCron(); process.exit(0); });
