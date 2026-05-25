/**
 * Notification read state store (Zustand) with real-time cross-device sync
 *
 * Sync mechanisms (in order of priority):
 *
 *   1. Socket.IO WebSocket — INSTANT cross-device sync.
 *      When any device marks notifications as read, the server broadcasts
 *      the new readIds to ALL connected devices immediately.
 *
 *   2. BroadcastChannel — INSTANT same-device cross-tab sync.
 *      When one tab marks as read, all other tabs on the same device
 *      are notified immediately (no network round-trip needed).
 *
 *   3. Server fetch on focus/visibility — NEAR-INSTANT cross-device sync.
 *      When the tab regains focus, we fetch the latest from the server.
 *
 *   4. On-open refresh — NEAR-INSTANT cross-device sync.
 *      When the user clicks the notification bell, we fetch from the server.
 *
 *   5. Periodic polling — FALLBACK (30s read-state, 5min full).
 *
 * Architecture:
 *   - mark-read API persists to PostgreSQL, then calls POST /broadcast on the
 *     notification WS service (port 3001) to push to all connected sockets.
 *   - Each client connects to the WS service via Socket.IO (through Caddy gateway).
 *   - The WS service maintains a Map<userId, Set<socketId>> for broadcasting.
 */

import { create } from 'zustand';
import { useAuthStore } from './auth-store';

// NOTE: socket.io-client is imported dynamically (see connectSocketIO).
// We intentionally avoid a static import so the build succeeds even if the
// package is not yet installed — the system degrades to polling gracefully.

// ─── Constants ────────────────────────────────────────────────────────

const CHANNEL_NAME = 'alphaai-notification-sync';
const WS_PORT = typeof process !== 'undefined' && process.env?.NOTIFICATION_WS_PORT
  ? process.env.NOTIFICATION_WS_PORT
  : '3001';

/** Minimum ms between server fetches (prevents hammering on rapid focus changes) */
const FETCH_THROTTLE_MS = 3_000;

// ─── BroadcastChannel (same-device cross-tab, no network needed) ─────

let broadcastChannel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      // BroadcastChannel not supported — degrade gracefully
    }
  }
  return broadcastChannel;
}

// ─── Socket.IO client (cross-device real-time sync via WebSocket) ────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let socketInstance: any = null;
let socketConnecting = false;
let currentSocketUserId: string | null = null;

/**
 * Initialize Socket.IO connection for a given user.
 * Uses dynamic import() to avoid SSR issues — socket.io-client is client-only.
 * The connection is fire-and-forget: events are received via the 'notification-update'
 * listener which updates the Zustand store automatically.
 */
async function connectSocketIO(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (socketInstance) return;
  if (socketConnecting) return;

  // Already connected for this user
  if (currentSocketUserId === userId) return;

  socketConnecting = true;

  try {
    const { io } = await import('socket.io-client');

    socketInstance = io({
      // XTransformPort routes through Caddy to the WS service on port 3001.
      // Socket.IO uses default path '/socket.io/' so the WS service's
      // HTTP endpoints (/health, /broadcast, /stats) remain accessible.
      query: { XTransformPort: WS_PORT },
      // Auth with userId so the WS service can map connections
      auth: { userId },
      transports: ['polling', 'websocket'],
      // Reconnection settings
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 5000,
    });

    currentSocketUserId = userId;

    socketInstance.on('connect', () => {
      console.log('[NotificationStore] Socket.IO connected');
    });

    socketInstance.on('connect_error', (err: Error) => {
      console.warn('[NotificationStore] Socket.IO connection error:', err.message);
    });

    socketInstance.on('disconnect', (reason: string) => {
      console.log('[NotificationStore] Socket.IO disconnected:', reason);
    });

    socketInstance.on('notification-update', (data: { type: string; readIds: string[] }) => {
      if (data.type === 'READ_STATE_CHANGED' && Array.isArray(data.readIds)) {
        // Update store with the authoritative read state from the server
        useNotificationStore.setState({
          readIds: new Set<string>(data.readIds),
          lastFetchAt: Date.now(),
        });

        // Also broadcast to other tabs on this device via BroadcastChannel
        const channel = getBroadcastChannel();
        if (channel) {
          try {
            channel.postMessage({ type: 'READ_STATE_CHANGED', readIds: data.readIds });
          } catch {
            // Ignore
          }
        }
      }
    });
  } catch (err) {
    console.warn('[NotificationStore] Failed to initialize Socket.IO:', err);
  } finally {
    socketConnecting = false;
  }
}

/**
 * Disconnect Socket.IO (call on logout or user change).
 */
function disconnectSocketIO(): void {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
  currentSocketUserId = null;
  socketConnecting = false;
}

// ─── Store Interface ─────────────────────────────────────────────────

interface NotificationState {
  /** Set of notification IDs the user has already read */
  readIds: Set<string>;

  /** Whether we are currently loading read state from the server */
  isLoading: boolean;

  /** Timestamp of the last successful server fetch (for throttling) */
  lastFetchAt: number;

  /** Fetch read state from server and update the store.
   *  Respects throttle — calls within FETCH_THROTTLE_MS of the last fetch are skipped unless forced. */
  fetchReadState: (force?: boolean) => Promise<void>;

  /** Mark specific notification IDs as read (updates store + persists to server + broadcasts) */
  markAsRead: (ids: string[]) => Promise<void>;

  /** Mark ALL given notification IDs as read (bulk persist + broadcast) */
  markAllAsRead: (allNotificationIds: string[]) => Promise<void>;

  /** Reset store (used on logout) */
  reset: () => void;
}

// ─── Helper: merge + broadcast to same-device tabs ───────────────────

function mergeAndBroadcast(
  set: (partial: Partial<NotificationState> | ((s: NotificationState) => Partial<NotificationState>)) => void,
  get: () => NotificationState,
  newIds: string[]
): void {
  const merged = new Set([...get().readIds, ...newIds]);
  set({ readIds: merged });
  // Broadcast to other tabs on the same device
  const channel = getBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage({ type: 'READ_STATE_CHANGED', readIds: [...merged] });
    } catch {
      // Channel might be closed
    }
  }
}

// ─── Zustand Store ──────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  readIds: new Set<string>(),
  isLoading: false,
  lastFetchAt: 0,

  fetchReadState: async (force = false) => {
    const now = Date.now();
    if (get().isLoading) return;
    // Skip if within throttle window (unless forced)
    if (!force && now - get().lastFetchAt < FETCH_THROTTLE_MS) return;

    set({ isLoading: true });
    try {
      const res = await fetch('/api/notifications/read-state');
      if (res.ok) {
        const data = await res.json();
        set({ readIds: new Set<string>(data.readIds || []), lastFetchAt: Date.now() });
      } else {
        console.warn('[NotificationStore] read-state fetch failed:', res.status);
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

    // Optimistically update local state + broadcast to other same-device tabs
    mergeAndBroadcast(set, get, ids);
    // Set throttle BEFORE the POST to prevent race condition with fetchReadState
    set({ lastFetchAt: Date.now() });

    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
      });
      if (!res.ok) {
        console.warn('[NotificationStore] mark-read failed:', res.status);
        // Server rejected — revert to authoritative state
        get().fetchReadState(true);
      }
    } catch {
      // Network failure — revert: re-fetch from server to get authoritative state
      get().fetchReadState(true);
    }
  },

  markAllAsRead: async (allNotificationIds: string[]) => {
    if (allNotificationIds.length === 0) return;

    // Optimistically mark all as read locally + broadcast
    set({ readIds: new Set(allNotificationIds) });
    // Set throttle BEFORE the POST to prevent race condition with fetchReadState
    set({ lastFetchAt: Date.now() });
    const channel = getBroadcastChannel();
    if (channel) {
      try {
        channel.postMessage({ type: 'READ_STATE_CHANGED', readIds: allNotificationIds });
      } catch {
        // Ignore
      }
    }

    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: allNotificationIds }),
      });
      if (!res.ok) {
        console.warn('[NotificationStore] mark-all-read failed:', res.status);
        // Server rejected — revert to authoritative state
        get().fetchReadState(true);
      }
    } catch {
      // Network failure — revert: re-fetch from server to get authoritative state
      get().fetchReadState(true);
    }
  },

  reset: () => {
    disconnectSocketIO();
    set({ readIds: new Set<string>(), isLoading: false, lastFetchAt: 0 });
  },
}));

// ─── BroadcastChannel listener (global, runs once per browser context) ─
// Listen for read-state changes from OTHER tabs on the same device.
if (typeof window !== 'undefined') {
  const channel = getBroadcastChannel();
  if (channel) {
    channel.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'READ_STATE_CHANGED' && Array.isArray(event.data.readIds)) {
        useNotificationStore.setState({
          readIds: new Set<string>(event.data.readIds),
          lastFetchAt: Date.now(),
        });
      }
    });
  }

  // ─── Auth-aware Socket.IO connection management ───────────────────
  // When the user logs in/out or changes, connect/disconnect Socket.IO accordingly.

  useAuthStore.subscribe((state, prevState) => {
    const prevUserId = prevState.user?.id;
    const nextUserId = state.user?.id;

    if (prevUserId !== nextUserId) {
      if (nextUserId) {
        // User logged in or changed — reconnect
        disconnectSocketIO();
        connectSocketIO(nextUserId);
      } else {
        // User logged out — disconnect
        disconnectSocketIO();
        useNotificationStore.getState().reset();
      }
    }
  });

  // Connect on initial load if user is already authenticated
  const initialUser = useAuthStore.getState().user;
  if (initialUser?.id) {
    // Delay slightly to ensure the page is fully loaded
    setTimeout(() => {
      connectSocketIO(initialUser.id!);
    }, 500);
  }
}
