'use client';

import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { DASHBOARD_WIDGETS, getDefaultVisibilityMap, getDefaultSizesMap, WidgetSize, WIDGET_DEFAULTS_VERSION } from '@/lib/dashboard-widget-definitions';

// Re-export so existing imports from this module still work
export { DASHBOARD_WIDGETS, getDefaultVisibilityMap } from '@/lib/dashboard-widget-definitions';
export type { DashboardWidget, WidgetSize } from '@/lib/dashboard-widget-definitions';
export { getGridSpanClasses, getWidgetGridSpanById, getWidgetGridSpan } from '@/lib/dashboard-widget-definitions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'alphaflow-dashboard-widgets';
const ORDER_STORAGE_KEY = 'alphaflow-dashboard-widget-order';
const SIZES_STORAGE_KEY = 'alphaflow-dashboard-widget-sizes';
const POSITIONS_STORAGE_KEY = 'alphaflow-dashboard-widget-positions';
const VERSION_STORAGE_KEY = 'alphaflow-dashboard-widget-defaults-ver';
const DEFAULT_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);
const DEFAULT_SIZES = getDefaultSizesMap();

// ---------------------------------------------------------------------------
// Defaults version check — invalidates localStorage cache when code defaults
// change (visibility, order, column layout). Ensures users see new defaults
// without needing to manually clear browser storage.
// ---------------------------------------------------------------------------

function isLocalCacheStale(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(VERSION_STORAGE_KEY);
    if (stored === null) return true; // no version stored = stale
    return parseInt(stored, 10) !== WIDGET_DEFAULTS_VERSION;
  } catch {
    return true;
  }
}

function clearLocalCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ORDER_STORAGE_KEY);
    localStorage.removeItem(SIZES_STORAGE_KEY);
    localStorage.removeItem(POSITIONS_STORAGE_KEY);
    localStorage.setItem(VERSION_STORAGE_KEY, String(WIDGET_DEFAULTS_VERSION));
  } catch { /* ignore */ }
}

function stampLocalCacheVersion(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, String(WIDGET_DEFAULTS_VERSION));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WidgetPosition {
  x: number;     // column index (0, 1, or 2)
  y: number;     // unused — kept for store backwards-compat
  width: number; // unused — kept for store backwards-compat
}

// ---------------------------------------------------------------------------
// Local storage helpers (simple read/write, no migration clearing)
// ---------------------------------------------------------------------------

function readLocalVisibilityMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return getDefaultVisibilityMap();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return getDefaultVisibilityMap();
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...getDefaultVisibilityMap(), ...parsed };
  } catch {
    return getDefaultVisibilityMap();
  }
}

function writeLocalVisibilityMap(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

function readLocalWidgetOrder(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_ORDER];
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_ORDER];
    const parsed = JSON.parse(raw) as string[];
    const validIds = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
    const filtered = parsed.filter((id) => validIds.has(id));
    const missing = DEFAULT_ORDER.filter((id) => !parsed.includes(id));
    return [...filtered, ...missing];
  } catch {
    return [...DEFAULT_ORDER];
  }
}

function writeLocalWidgetOrder(order: string[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order)); } catch { /* ignore */ }
}

function readLocalWidgetSizes(): Record<string, WidgetSize> {
  if (typeof window === 'undefined') return { ...DEFAULT_SIZES };
  try {
    const raw = localStorage.getItem(SIZES_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_SIZES };
    const parsed = JSON.parse(raw) as Record<string, WidgetSize>;
    return { ...DEFAULT_SIZES, ...parsed };
  } catch {
    return { ...DEFAULT_SIZES };
  }
}

function writeLocalWidgetSizes(sizes: Record<string, WidgetSize>): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SIZES_STORAGE_KEY, JSON.stringify(sizes)); } catch { /* ignore */ }
}

function readLocalWidgetPositions(): Record<string, WidgetPosition> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (raw === null) return {};
    return JSON.parse(raw) as Record<string, WidgetPosition>;
  } catch {
    return {};
  }
}

function writeLocalWidgetPositions(positions: Record<string, WidgetPosition>): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Valid widget ID set (for filtering)
// ---------------------------------------------------------------------------

const VALID_WIDGET_IDS = new Set(DASHBOARD_WIDGETS.map((w) => w.id));

function ensureValidOrder(order: string[]): string[] {
  const filtered = order.filter((id) => VALID_WIDGET_IDS.has(id));
  const missing = DEFAULT_ORDER.filter((id) => !order.includes(id));
  return [...filtered, ...missing];
}

// ---------------------------------------------------------------------------
// Zustand Store — single source of truth, shared across all components
// ---------------------------------------------------------------------------
//
// Persistence model:
//   1. Server (database) is the primary source of truth
//   2. localStorage is a fast-read cache (for instant render before API)
//   3. On load: server data ALWAYS wins over localStorage
//   4. On change: persist to both localStorage (instant) and server (debounced)
//   5. New tenants with no saved data inherit the app owner's (AlphaAi) layout
//      — this is handled server-side in GET /api/widget-settings
// ---------------------------------------------------------------------------

interface DashboardWidgetState {
  visibilityMap: Record<string, boolean>;
  widgetOrder: string[];
  widgetSizes: Record<string, WidgetSize>;
  widgetPositions: Record<string, WidgetPosition>;
  isAppOwner: boolean;
  isLoaded: boolean;
}

interface DashboardWidgetActions {
  // Data loading
  _loadFromServer: () => Promise<void>;
  _persistToServer: () => void;
  // Visibility
  isWidgetVisible: (id: string) => boolean;
  toggleWidget: (id: string) => void;
  setWidgetVisibility: (id: string, visible: boolean) => void;
  // Order
  setWidgetOrderDirect: (newOrder: string[]) => void;
  moveWidgetUp: (id: string) => void;
  moveWidgetDown: (id: string) => void;
  getWidgetOrderIndex: (id: string) => number;
  // Size
  setWidgetSize: (id: string, size: WidgetSize) => void;
  getWidgetSize: (id: string) => WidgetSize;
  // Positions
  setWidgetPosition: (id: string, position: WidgetPosition) => void;
  getWidgetPositions: () => Record<string, WidgetPosition>;
  clearWidgetPositions: () => void;
  // Reset
  resetWidgets: () => void;
  // Utility
  getVisibleWidgets: () => string[];
}

type DashboardWidgetStore = DashboardWidgetState & DashboardWidgetActions;

// Debounce timer — shared module-level so multiple store updates coalesce
let persistDebounce: ReturnType<typeof setTimeout> | null = null;

export const useDashboardWidgets = create<DashboardWidgetStore>((set, get) => ({
  // ─── Initial state (used for SSR and instant first render) ─
  visibilityMap: getDefaultVisibilityMap(),
  widgetOrder: [...DEFAULT_ORDER],
  widgetSizes: { ...DEFAULT_SIZES },
  widgetPositions: {},
  isAppOwner: false,
  isLoaded: false,

  // ─── Data loading ──────────────────────────────────────────
  //
  // Strategy:
  //   1. If localStorage cache version doesn't match code defaults version,
  //      clear all cached widget data (visibility, order, sizes, positions).
  //   2. Always prefer server data. The server API handles new-tenant
  //      defaults by falling back to the AlphaAi company's saved layout.
  //   3. localStorage is a fast-read cache (for instant render before API).
  //
  _loadFromServer: async () => {
    // Invalidate stale localStorage cache BEFORE any reads
    if (isLocalCacheStale()) {
      clearLocalCache();
    }

    try {
      const res = await fetch('/api/widget-settings');
      if (!res.ok) {
        // API failed (e.g. 401) — use code defaults (localStorage was already cleared if stale)
        set({
          visibilityMap: getDefaultVisibilityMap(),
          widgetOrder: [...DEFAULT_ORDER],
          widgetSizes: { ...DEFAULT_SIZES },
          widgetPositions: {},
          isLoaded: true,
        });
        stampLocalCacheVersion();
        return;
      }
      const data = await res.json();

      const defaults = getDefaultVisibilityMap();

      // Visibility: merge defaults with server (server wins for known widgets)
      const serverWidgets = data.widgets as Record<string, boolean> | undefined;
      const visibility: Record<string, boolean> = serverWidgets
        ? { ...defaults, ...serverWidgets }
        : { ...defaults };

      // Order: prefer server order, merge in any new widgets
      const serverOrder = data.order as string[] | undefined;
      const order: string[] = (serverOrder && serverOrder.length > 0)
        ? ensureValidOrder(serverOrder)
        : [...DEFAULT_ORDER];

      // Sizes: prefer server sizes, merge with defaults
      const serverSizes = data.sizes as Record<string, WidgetSize> | undefined;
      const sizes: Record<string, WidgetSize> = { ...DEFAULT_SIZES, ...(serverSizes || {}) };

      // Positions: prefer server positions
      const serverPositions = data.positions as Record<string, WidgetPosition> | undefined;
      const positions: Record<string, WidgetPosition> = serverPositions || {};

      set({
        visibilityMap: visibility,
        widgetOrder: order,
        widgetSizes: sizes,
        widgetPositions: positions,
        isAppOwner: !!data.isAppOwner,
        isLoaded: true,
      });

      // Update localStorage cache
      writeLocalVisibilityMap(visibility);
      writeLocalWidgetOrder(order);
      writeLocalWidgetSizes(sizes);
      writeLocalWidgetPositions(positions);
      stampLocalCacheVersion();
    } catch {
      // Network error — fall back to fresh code defaults (cache was cleared if stale)
      set({
        visibilityMap: getDefaultVisibilityMap(),
        widgetOrder: [...DEFAULT_ORDER],
        widgetSizes: { ...DEFAULT_SIZES },
        widgetPositions: {},
        isLoaded: true,
      });
      stampLocalCacheVersion();
    }
  },

  _persistToServer: () => {
    const { visibilityMap, widgetOrder, widgetSizes, widgetPositions, isLoaded } = get();
    if (!isLoaded) return;

    // Immediately update localStorage cache (instant for next page load)
    writeLocalVisibilityMap(visibilityMap);
    writeLocalWidgetOrder(widgetOrder);
    writeLocalWidgetSizes(widgetSizes);
    writeLocalWidgetPositions(widgetPositions);

    // Debounce server API call (500ms — coalesces rapid updates like drag-and-drop)
    if (persistDebounce) clearTimeout(persistDebounce);
    persistDebounce = setTimeout(async () => {
      try {
        const res = await fetch('/api/widget-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            widgets: visibilityMap,
            order: widgetOrder,
            sizes: widgetSizes,
            positions: widgetPositions,
          }),
        });
        // 403 = read-only mode (e.g. demo company) — expected, no action needed
        if (!res.ok && res.status !== 403) {
          console.warn('Failed to persist widget settings:', res.status);
        }
      } catch {
        // Network error — data is cached locally, will retry on next change
      }
    }, 500);
  },

  // ─── Visibility ────────────────────────────────────────────
  isWidgetVisible: (id: string) => {
    return get().visibilityMap[id] ?? true;
  },

  toggleWidget: (id: string) => {
    set((s) => ({
      visibilityMap: { ...s.visibilityMap, [id]: !s.visibilityMap[id] },
    }));
    setTimeout(() => get()._persistToServer(), 0);
  },

  setWidgetVisibility: (id: string, visible: boolean) => {
    set((s) => ({
      visibilityMap: { ...s.visibilityMap, [id]: visible },
    }));
    setTimeout(() => get()._persistToServer(), 0);
  },

  // ─── Order ─────────────────────────────────────────────────
  setWidgetOrderDirect: (newOrder: string[]) => {
    set({ widgetOrder: ensureValidOrder(newOrder) });
    setTimeout(() => get()._persistToServer(), 0);
  },

  moveWidgetUp: (id: string) => {
    set((s) => {
      const idx = s.widgetOrder.indexOf(id);
      if (idx <= 0) return s;
      const next = [...s.widgetOrder];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return { widgetOrder: next };
    });
    setTimeout(() => get()._persistToServer(), 0);
  },

  moveWidgetDown: (id: string) => {
    set((s) => {
      const idx = s.widgetOrder.indexOf(id);
      if (idx < 0 || idx >= s.widgetOrder.length - 1) return s;
      const next = [...s.widgetOrder];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { widgetOrder: next };
    });
    setTimeout(() => get()._persistToServer(), 0);
  },

  getWidgetOrderIndex: (id: string) => {
    const idx = get().widgetOrder.indexOf(id);
    return idx >= 0 ? idx : 999;
  },

  // ─── Size ──────────────────────────────────────────────────
  setWidgetSize: (id: string, size: WidgetSize) => {
    set((s) => ({
      widgetSizes: { ...s.widgetSizes, [id]: size },
    }));
    setTimeout(() => get()._persistToServer(), 0);
  },

  getWidgetSize: (id: string) => {
    const sizes = get().widgetSizes;
    return sizes[id] ?? DEFAULT_SIZES[id] ?? 'half';
  },

  // ─── Positions ───────────────────────────────────────────
  setWidgetPosition: (id: string, position: WidgetPosition) => {
    set((s) => ({
      widgetPositions: { ...s.widgetPositions, [id]: position },
    }));
    setTimeout(() => get()._persistToServer(), 0);
  },

  getWidgetPositions: () => {
    return get().widgetPositions;
  },

  clearWidgetPositions: () => {
    set({ widgetPositions: {} });
    writeLocalWidgetPositions({});
    setTimeout(() => get()._persistToServer(), 0);
  },

  // ─── Reset ─────────────────────────────────────────────────
  resetWidgets: () => {
    const defaults = getDefaultVisibilityMap();
    set({
      visibilityMap: defaults,
      widgetOrder: [...DEFAULT_ORDER],
      widgetSizes: { ...DEFAULT_SIZES },
      widgetPositions: {},
    });
    clearLocalCache();
    setTimeout(() => get()._persistToServer(), 0);
  },

  // ─── Utility ───────────────────────────────────────────────
  getVisibleWidgets: () => {
    const { visibilityMap } = get();
    return DASHBOARD_WIDGETS.filter((w) => visibilityMap[w.id] !== false).map((w) => w.id);
  },
}));

// ---------------------------------------------------------------------------
// Initialization hook — call once at the app/dashboard root to load data
// ---------------------------------------------------------------------------

export function useDashboardWidgetsInit() {
  const isLoaded = useDashboardWidgets((s) => s.isLoaded);
  const loadFromServer = useDashboardWidgets((s) => s._loadFromServer);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current && !isLoaded) {
      hasLoadedRef.current = true;
      loadFromServer();
    }
  }, [isLoaded, loadFromServer]);
}
