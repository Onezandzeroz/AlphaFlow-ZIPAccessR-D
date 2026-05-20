'use client';

import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import {
  ShieldX,
  Clock,
  ArrowRight,
  KeyRound,
  Eye,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useCallback } from 'react';

interface AccessDeniedBannerProps {
  /** 'denied' = ACCESS_DENIED, 'expired' = ACCESS_EXPIRED */
  variant?: 'denied' | 'expired';
  /** Optional: triggered by a specific action description */
  action?: string;
  /** Callback when user clicks "Go to Access Settings" */
  onGoToSettings?: () => void;
  /** Callback when user clicks "Purchase Access Token" */
  onPurchaseToken?: () => void;
  /** Callback to dismiss the popup */
  onDismiss?: () => void;
}

/**
 * Access denial popup — centered modal over a dark semi-transparent overlay.
 *
 * Shows when a tenant tries to perform a write operation but
 * lacks a valid TokenBay access token (proof).
 *
 * Features:
 * - Bilingual (DA/ENG) via useTranslation
 * - Briefly explains WHY access is denied
 * - Encourages purchasing access tokens with CTA
 * - Links to Access Settings for proof upload
 * - Dismissible via X button, clicking overlay, or pressing Escape
 * - Smooth fade-in animation
 */
export function AccessDeniedBanner({
  variant = 'denied',
  action,
  onGoToSettings,
  onPurchaseToken,
  onDismiss,
}: AccessDeniedBannerProps) {
  const { t, language } = useTranslation();
  const isExpired = variant === 'expired';

  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleDismiss]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    // Dark semi-transparent overlay
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleDismiss}
    >
      {/* Centered modal card */}
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
          isExpired
            ? 'border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50 via-orange-50/50 to-yellow-50 dark:from-amber-950/60 dark:via-orange-950/40 dark:to-yellow-950/40'
            : 'border-gray-200 dark:border-white/10 bg-gradient-to-br from-gray-50 via-slate-50/50 to-zinc-50 dark:from-gray-900/80 dark:via-slate-900/70 dark:to-zinc-900/80'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 25% 25%, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }} />
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label={language === 'da' ? 'Luk' : 'Close'}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-5 sm:p-6 space-y-4">
          {/* Icon + Title row */}
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="flex-shrink-0">
              <div
                className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                  isExpired
                    ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20'
                    : 'bg-gradient-to-br from-gray-500 to-gray-600 shadow-lg shadow-gray-500/20'
                }`}
              >
                {isExpired ? (
                  <Clock className="h-6 w-6 text-white" />
                ) : (
                  <ShieldX className="h-6 w-6 text-white" />
                )}
              </div>
            </div>

            {/* Title + badge */}
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isExpired ? t('accessDeniedExpiredTitle') : t('accessDeniedTitle')}
              </h3>
              <span
                className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  isExpired
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                }`}
              >
                <Eye className="h-3 w-3" />
                {t('readAccessActive')}
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {action
              ? (isExpired ? t('accessExpiredDescription') : t('accessDeniedDescription')) +
                ' ' +
                (language === 'da'
                  ? `Handlingen "${action}" kræver skrivetilladelse.`
                  : `The action "${action}" requires write access.`)
              : (isExpired ? t('accessExpiredDescription') : t('accessDeniedDescription'))
            }
          </p>

          {/* Info callout */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-white/60 dark:bg-white/5 border border-gray-100 dark:border-white/5">
            <Eye className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('readAccessDesc')}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            {/* Primary CTA — Purchase Token */}
            <Button
              onClick={onPurchaseToken}
              className={`gap-2 shadow-sm flex-1 sm:flex-none ${
                isExpired
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-amber-500/20'
                  : 'bg-gradient-to-r from-[#0d9488] to-[#14b8a6] hover:from-[#0f766e] hover:to-[#0d9488] text-white border-0 shadow-teal-500/20'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span className="font-medium">{t('purchaseTokensCta')}</span>
              <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>

            {/* Secondary CTA — Go to Settings */}
            <Button
              variant="outline"
              onClick={onGoToSettings}
              className="gap-2 flex-1 sm:flex-none border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <KeyRound className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <span className="font-medium">{t('goToAccessSettings')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
