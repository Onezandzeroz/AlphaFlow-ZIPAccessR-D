'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useUpgradeModalStore } from '@/lib/upgrade-modal-store';
import { useAuthStore } from '@/lib/auth-store';
import { hasAccess, type AccessCheckResult } from '@/lib/tokenpay';

// ─── Global Access Cache (Zustand store) ───────────────────────────
//
// All components share this cache. The access check fires ONCE per
// userId and the result is cached for `TTL_MS` milliseconds so
// subsequent checks are instant and free.

const TTL_MS = 60_000; // 1 minute

interface AccessCacheState {
  userId: string | null;
  result: AccessCheckResult | null;
  isExpired: boolean; // true when the cache TTL has elapsed
  isLoading: boolean;
  isOwner: boolean; // AlphaAi owner always bypasses
  _fetchedAt: number;
  fetch: (userId: string) => Promise<void>;
  setOwner: (isOwner: boolean) => void;
  invalidate: () => void;
}

import { create } from 'zustand';

export const useAccessCacheStore = create<AccessCacheState>((set, get) => ({
  userId: null,
  result: null,
  isExpired: true,
  isLoading: false,
  isOwner: false,
  _fetchedAt: 0,

  fetch: async (userId: string) => {
    const state = get();

    // Don't re-fetch if we already have a fresh result for this user
    if (
      state.userId === userId &&
      !state.isExpired &&
      state.result !== null &&
      (state.isOwner || hasAccess(state.result))
    ) {
      return;
    }

    // Don't start a new fetch if one is already in progress
    if (state.isLoading) return;

    set({ isLoading: true });

    try {
      const res = await fetch(`/api/access/${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data: AccessCheckResult = await res.json();
        set({
          userId,
          result: data,
          isExpired: false,
          isOwner: false,
          _fetchedAt: Date.now(),
          isLoading: false,
        });
      } else {
        // API failed — default to denying access
        set({
          userId,
          result: null,
          isExpired: false,
          isLoading: false,
          _fetchedAt: Date.now(),
        });
      }
    } catch {
      // Network error — default to denying access
      set({
        userId,
        result: null,
        isExpired: false,
        isLoading: false,
        _fetchedAt: Date.now(),
      });
    }
  },

  setOwner: (isOwner: boolean) => {
    set({ isOwner });
  },

  invalidate: () => {
    set({ isExpired: true });
  },
}));

// ─── TTL expiry timer (runs once, globally) ────────────────────────
let _ttlTimerStarted = false;

function ensureTtlTimer() {
  if (_ttlTimerStarted || typeof window === 'undefined') return;
  _ttlTimerStarted = true;
  setInterval(() => {
    const state = useAccessCacheStore.getState();
    if (state._fetchedAt && Date.now() - state._fetchedAt >= TTL_MS) {
      useAccessCacheStore.setState({ isExpired: true });
    }
  }, 5000);
}

// ═══════════════════════════════════════════════════════════════════
// useWriteAccessGuard Hook
// ═══════════════════════════════════════════════════════════════════
//
// Proactively checks write access when a user is about to open a form
// that leads to a write operation. If the user lacks write access,
// the UpgradeAccessModal is shown instead of opening the form.
//
// @example
// ```tsx
// const { guardWriteAccess } = useWriteAccessGuard(user);
//
// <Button onClick={() => guardWriteAccess('Create contact', openCreateDialog)}>
//   New Contact
// </Button>
// ```
//
// The action name is shown in the modal: "The action 'Create contact'
// requires write access."

export function useWriteAccessGuard(user: { id: string; isSuperDev?: boolean; hasAppOwner?: boolean; activeCompanyName?: string | null } | null) {
  const showUpgradeModal = useUpgradeModalStore((s) => s.show);
  const fetchAccess = useAccessCacheStore((s) => s.fetch);
  const cachedResult = useAccessCacheStore((s) => s.result);
  const cachedIsOwner = useAccessCacheStore((s) => s.isOwner);
  const cacheIsExpired = useAccessCacheStore((s) => s.isExpired);
  const setOwner = useAccessCacheStore((s) => s.setOwner);
  const invalidate = useAccessCacheStore((s) => s.invalidate);
  const userId = user?.id ?? '';
  const initializedRef = useRef(false);

  // Start the global TTL timer and perform initial fetch
  useEffect(() => {
    if (!userId) return;
    ensureTtlTimer();

    // Check owner bypass — the AlphaAi owner (isSuperDev + AlphaAi company)
    // always has full access, so skip the TokenPay check entirely.
    const isOwner = !!(
      user?.isSuperDev &&
      user?.activeCompanyName?.startsWith('AlphaAi')
    );

    if (isOwner) {
      setOwner(true);
      return;
    }

    fetchAccess(userId);
  }, [userId, user?.isSuperDev, user?.activeCompanyName, fetchAccess, setOwner]);

  // Invalidate cache periodically so changes (e.g. after uploading a proof)
  // are picked up within TTL_MS
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      invalidate();
      // Re-fetch in background if expired
      const state = useAccessCacheStore.getState();
      if (state.isExpired && state.userId === userId && !state.isLoading) {
        fetchAccess(userId);
      }
    }, TTL_MS);
    return () => clearInterval(interval);
  }, [userId, invalidate, fetchAccess]);

  /**
   * Check write access before performing an action.
   *
   * - If the user HAS write access (or is the AlphaAi owner), runs `fn()` immediately.
   * - If the user LACKS write access, shows the UpgradeAccessModal with the action name.
   *
   * The result is cached, so after the first API call this is synchronous and free.
   */
  const guardWriteAccess = useCallback(
    (actionName: string, fn: () => void) => {
      if (!user) return;

      // Owner always bypasses
      if (cachedIsOwner) {
        fn();
        return;
      }

      // Check cached result
      if (cachedResult && !cacheIsExpired) {
        if (hasAccess(cachedResult)) {
          fn();
        } else {
          showUpgradeModal({
            variant: cachedResult.isExpired ? 'expired' : 'denied',
            action: actionName,
          });
        }
        return;
      }

      // No cached result yet — fetch then decide.
      // Show the modal pessimistically to avoid letting the user fill out a form
      // in case access is denied. If access turns out to be granted, the modal
      // won't have been shown because we'll call fn() directly.
      // Actually, we can't call fn() after an async check because by then the
      // user might have already done something else. So we fetch and handle it.
      fetchAccess(user.id).then(() => {
        const state = useAccessCacheStore.getState();
        if (state.isOwner || (state.result && hasAccess(state.result))) {
          fn();
        } else {
          showUpgradeModal({
            variant: state.result?.isExpired ? 'expired' : 'denied',
            action: actionName,
          });
        }
      });
    },
    [user, cachedIsOwner, cachedResult, cacheIsExpired, showUpgradeModal, fetchAccess]
  );

  /**
   * Returns whether the user currently has write access.
   * `undefined` if still loading, `true` if granted, `false` if denied.
   */
  const hasWriteAccess: boolean | undefined = cachedIsOwner
    ? true
    : cachedResult
      ? hasAccess(cachedResult)
      : undefined;

  return { guardWriteAccess, hasWriteAccess };
}
