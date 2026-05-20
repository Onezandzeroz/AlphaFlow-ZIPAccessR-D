// TokenPay Access Service — Cryptographic Utilities
// HMAC-SHA256 webhook signing for secure callback verification.

import { createHmac } from 'crypto';

/**
 * HMAC-SHA256 signature for webhook callbacks.
 * Used by the notification dispatcher to sign outgoing webhooks.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify a webhook signature.
 * Used by the host app to verify incoming webhook authenticity.
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = signPayload(payload, secret);
  if (signature.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}
