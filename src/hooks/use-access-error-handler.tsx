'use client';

import { useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { parseApiError, isAccessDenied } from '@/lib/api-error-handler';
import { toast } from 'sonner';
import { useUpgradeModalStore } from '@/lib/upgrade-modal-store';

/**
 * React hook for handling API errors with bilingual access-denied support.
 *
 * When a mutation (POST/PUT/DELETE) fails:
 * - If the error is ACCESS_DENIED / ACCESS_EXPIRED → shows the global
 *   UpgradeAccessModal (via Zustand store) which is mounted once in AppLayout.
 *   This guarantees the same placement, layout and design every time.
 * - For all other errors → shows a translated toast message.
 *
 * @example
 * ```tsx
 * const { handleMutationError } = useAccessErrorHandler();
 *
 * // In your mutation handler:
 * const response = await fetch('/api/contacts', { method: 'POST', ... });
 * if (!response.ok) {
 *   await handleMutationError(response, 'Opret kontakt');
 *   return;
 * }
 * ```
 */
export function useAccessErrorHandler() {
  const { language } = useTranslation();
  const showUpgradeModal = useUpgradeModalStore((s) => s.show);

  /**
   * Process a failed fetch response.
   *
   * @param response - The fetch Response that failed (response.ok === false)
   * @param action - Optional human-readable description of the action
   * @returns true if the error was an access denial (modal shown), false otherwise (toast shown)
   */
  const handleMutationError = useCallback(
    async (
      response: Response,
      action?: string,
    ): Promise<boolean> => {
      let body: Record<string, unknown> = {};
      try {
        body = await response.json();
      } catch {
        // Response body is not JSON — use status-based fallback
      }

      // Check if this is a TokenPay access denial
      if (isAccessDenied(body)) {
        const code = body.code as string;
        showUpgradeModal({
          variant: code === 'ACCESS_EXPIRED' ? 'expired' : 'denied',
          action,
        });
        return true; // signal: access denied
      }

      // All other errors — show translated toast
      const err = parseApiError(body, response.status, language);
      toast.error(err.translatedTitle || err.translatedMessage, {
        duration: 5000,
      });

      return false;
    },
    [language, showUpgradeModal]
  );

  return {
    handleMutationError,
  };
}
