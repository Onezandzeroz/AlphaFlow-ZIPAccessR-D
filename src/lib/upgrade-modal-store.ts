/**
 * Global Upgrade Modal Store (Zustand)
 *
 * Central state management for the access upgrade modal.
 * Any component can trigger the modal via `showUpgradeModal()`.
 * The modal is mounted ONCE in AppLayout and reads from this store.
 *
 * This guarantees the same placement, layout and design every time
 * a user attempts a write operation without a valid .tbkey proof.
 */

import { create } from 'zustand';

export interface UpgradeModalState {
  /** Whether the modal is currently visible */
  isOpen: boolean;
  /** 'denied' = no proof at all, 'expired' = proof was valid but expired */
  variant: 'denied' | 'expired';
  /** Optional: what action the user was trying to perform */
  action: string | null;
}

interface UpgradeModalActions {
  /** Show the upgrade modal */
  show: (opts?: { variant?: 'denied' | 'expired'; action?: string }) => void;
  /** Hide the upgrade modal */
  dismiss: () => void;
}

export const useUpgradeModalStore = create<UpgradeModalState & UpgradeModalActions>(
  (set) => ({
    isOpen: false,
    variant: 'denied',
    action: null,

    show: (opts = {}) =>
      set({
        isOpen: true,
        variant: opts.variant ?? 'denied',
        action: opts.action ?? null,
      }),

    dismiss: () =>
      set({
        isOpen: false,
        action: null,
      }),
  })
);
