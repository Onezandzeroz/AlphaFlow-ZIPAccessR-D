/**
 * Global Subscription Plans Prompt Store (Zustand)
 *
 * Allows any component to programmatically open the subscription plans prompt
 * (e.g. from the upgrade-access-modal "Buy access" button).
 * The prompt is mounted ONCE in AppLayout and reads from this store.
 */

import { create } from 'zustand';

interface SubscriptionPlansState {
  /** Whether the prompt should be shown on demand (e.g. via "Buy" button) */
  isOpen: boolean;
}

interface SubscriptionPlansActions {
  /** Open the subscription plans prompt */
  show: () => void;
  /** Close the subscription plans prompt (also called by the prompt itself) */
  dismiss: () => void;
}

export const useSubscriptionPlansStore = create<SubscriptionPlansState & SubscriptionPlansActions>(
  (set) => ({
    isOpen: false,

    show: () => set({ isOpen: true }),

    dismiss: () => set({ isOpen: false }),
  })
);
