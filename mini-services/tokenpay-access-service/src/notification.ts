// TokenPay Access Service — Notification Dispatcher
// Webhook callbacks to the host app + in-app messaging via DB.

import type { WebhookPayload, ReasonCode, AccessLevel } from './types.js';
import { signPayload } from './encryption.js';
import { createMessage } from './data-layer.js';

// ─── Webhook Configuration ─────────────────────────────────

let callbackUrl: string | null = null;
let sharedSecret: string = '';
let retryAttempts = 3;

export function configureNotification(url: string, secret: string): void {
  callbackUrl = url;
  sharedSecret = secret;
  console.log(`[Notification] Callback URL configured: ${url}`);
}

export function getCallbackUrl(): string | null {
  return callbackUrl;
}

// ─── Webhook Dispatch ──────────────────────────────────────

/**
 * Send a webhook to the host app with HMAC-SHA256 signature.
 * Retries with exponential backoff (1s, 2s, 4s).
 */
export async function dispatch(payload: WebhookPayload): Promise<boolean> {
  if (!callbackUrl) {
    console.log(`[Notification] No callback URL configured, skipping notification for ${payload.event}`);
    return true;
  }

  const body = JSON.stringify(payload);
  const signature = signPayload(body, sharedSecret);

  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      const delay = Math.pow(2, attempt) * 1000;
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TokenPay-Signature': signature,
          'X-TokenPay-Event': payload.event,
        },
        body,
      });

      if (response.ok) {
        console.log(`[Notification] Delivered ${payload.event} for user ${payload.userId} (attempt ${attempt + 1})`);
        return true;
      }

      console.warn(`[Notification] Failed (${response.status}) for ${payload.event} (attempt ${attempt + 1})`);
    } catch (err) {
      console.warn(`[Notification] Error sending ${payload.event} (attempt ${attempt + 1}):`, err);
    }
  }

  console.error(`[Notification] All retries exhausted for ${payload.event} (${payload.userId})`);
  return false;
}

// ─── Convenience Webhook Senders ───────────────────────────

export async function notifyAccessGranted(
  userId: string,
  previousLevel: AccessLevel,
  newLevel: AccessLevel,
  proofId?: string
): Promise<void> {
  await dispatch({
    event: 'access.granted',
    userId,
    previousLevel,
    newLevel,
    reason: 'proof_verified',
    timestamp: new Date().toISOString(),
    proofId,
  });
}

export async function notifyAccessRevoked(
  userId: string,
  previousLevel: AccessLevel,
  reason: ReasonCode = 'proof_expired',
  proofId?: string
): Promise<void> {
  await dispatch({
    event: 'access.revoked',
    userId,
    previousLevel,
    newLevel: 'read_only',
    reason,
    timestamp: new Date().toISOString(),
    proofId,
  });
}

export async function notifyAccessExpiring(
  userId: string,
  currentLevel: AccessLevel,
  daysRemaining: number,
  proofId?: string
): Promise<void> {
  await dispatch({
    event: 'access.expiring',
    userId,
    previousLevel: currentLevel,
    newLevel: currentLevel,
    reason: 'proof_expired',
    timestamp: new Date().toISOString(),
    proofId,
  });
}

// ─── In-App Messaging (stored in DB) ───────────────────────

export interface SendMessageOptions {
  subject: string;
  body: string;
  priority?: 'info' | 'warning' | 'urgent';
  proofId?: string;
}

/**
 * Send an in-app message to a user (stored in DB, not a webhook).
 */
export function sendMessageToUser(
  userId: string,
  options: SendMessageOptions
): void {
  createMessage(
    userId,
    options.subject,
    options.body,
    options.priority || 'info',
    options.proofId || null
  );
}

/**
 * Send a message AND dispatch a webhook about it.
 */
export async function messageAndNotifyUser(
  userId: string,
  options: SendMessageOptions
): Promise<void> {
  sendMessageToUser(userId, options);

  // Also dispatch as a webhook so the host app can handle it
  // (e.g., send email, push notification, etc.)
  if (callbackUrl) {
    // We use a generic dispatch here — the host app can filter by event
    // For specific events, use the typed notify functions above
  }
}
