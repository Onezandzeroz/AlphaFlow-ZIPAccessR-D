/**
 * Notification read state store (Zustand)
 *
 * Why a store instead of local component state?
 * - NotificationCenter is mounted TWICE (desktop sidebar + mobile header).
 *   A Zustand store ensures both instances share the same read state.
 * - Read state is persisted server-side (PostgreSQL) via API calls,
 *   so it syncs across devices (desktop ↔ mobile ↔ different browsers).
 *
 * Flow:
 *   1. On mount, fetchReadState() loads IDs from the server.
 *   2. When user marks as read, update store + persist to server.
 *   3. Periodic refresh also re-fetches read state.
 */

import { create } from 'zustand';

interface NotificationState {
  /** Set of notification IDs the user has already read */
  readIds: Set<string>;

  /** Whether we are currently loading read state from the server */
  isLoading: boolean;

  /** Fetch read state from server and update the store */
  fetchReadState: () => Promise<void>;

  /** Mark specific notification IDs as read (updates store + persists to server) */
  markAsRead: (ids: string[]) => Promise<void>;

  /** Mark ALL given notification IDs as read (bulk persist) */
  markAllAsRead: (allNotificationIds: string[]) => Promise<void>;

  /** Reset store (used on logout) */
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  readIds: new Set<string>(),
  isLoading: false,

  fetchReadState: async () => {
    // Prevent concurrent fetches
    if (get().isLoading) return;

    set({ isLoading: true });
    try {
      const res = await fetch('/api/notifications/read-state');
      if (res.ok) {
        const data = await res.json();
        set({ readIds: new Set<string>(data.readIds || []) });
      }
    } catch {
      // Silently fail — user will see notifications as unread, which is
      // the safer default (never hide unread notifications).
    } finally {
      set({ isLoading: false });
    }
  },

  markAsRead: async (ids: string[]) => {
    if (ids.length === 0) return;

    // Optimistically update local state
    const prevReadIds = new Set(get().readIds);
    set({ readIds: new Set([...prevReadIds, ...ids]) });

    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
      });
    } catch {
      // On failure, revert to previous state so user can try again
      set({ readIds: prevReadIds });
    }
  },

  markAllAsRead: async (allNotificationIds: string[]) => {
    if (allNotificationIds.length === 0) return;

    // Optimistically mark all as read locally
    set({ readIds: new Set(allNotificationIds) });

    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: allNotificationIds }),
      });
    } catch {
      // On failure, revert: re-fetch from server to get authoritative state
      get().fetchReadState();
    }
  },

  reset: () => {
    set({ readIds: new Set<string>(), isLoading: false });
  },
}));
