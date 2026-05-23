'use client';

import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { DASHBOARD_WIDGETS, getDefaultVisibilityMap, getDefaultSizesMap, WidgetSize } from '@/lib/dashboard-widget-definitions';

// Re-export so existing imports from this module still work
export { DASHBOARD_WIDGETS, getDefaultVisibilityMap } from '@/lib/dashboard-widget-definitions';
export type { DashboardWidget, WidgetSize } from '@/lib/dashboard-widget-definitions';
export { getGridSpanClasses, getWidgetGridSpanById, getWidgetGridSpan } from '@/lib/dashboard-widget-definitions';

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'alphaflow-dashboard-widgets';
const ORDER_STORAGE_KEY = 'alphaflow-dashboard-widget-order';
const SIZES_STORAGE_KEY = 'alphaflow-dashboard-widget-sizes';
const POSITIONS_STORAGE_KEY = 'alphaflow-dashboard-widget-positions';
const DEFAULT_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);
const DEFAULT_SIZES = getDefaultSizesMap();

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
}

function readLocalVisibilityMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return getDefaultVisibilityMap();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return getDefaultVisibilityMap();
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    const defaults = getDefaultVisibilityMap();
    return { ...defaults, ...parsed };
  } catch {
    return getDefaultVisibilityMap();
  }
}

function writeLocalVisibilityMap(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // silently ignore
  }
}

function readLocalWidgetOrder(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_ORDER];
  try {
    // Run order migration if needed — clears stale stored order so new defaults take effect
    const orderMigrationVersion = parseInt(localStorage.getItem(ORDER_MIGRATION_KEY) || '0', 10);
    if (orderMigrationVersion < CURRENT_ORDER_MIGRATION) {
      localStorage.removeItem(ORDER_STORAGE_KEY);
      localStorage.setItem(ORDER_MIGRATION_KEY, String(CURRENT_ORDER_MIGRATION));
      return [...DEFAULT_ORDER];
    }

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
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // silently ignore
  }
}

// Migration: reset specific widget sizes when defaults change
const SIZES_MIGRATION_KEY = 'alphaflow-dashboard-widget-sizes-migration';
const CURRENT_SIZES_MIGRATION = 4; // bump when changing default sizes

// Migration: reset stored widget order when default order changes
const ORDER_MIGRATION_KEY = 'alphaflow-dashboard-widget-order-migration';
const CURRENT_ORDER_MIGRATION = 2; // bump when changing default order

// Migration: reset stored widget positions when layout algorithm changes
const POSITIONS_MIGRATION_KEY = 'alphaflow-dashboard-widget-positions-migration';
const CURRENT_POSITIONS_MIGRATION = 3; // bump when layout algorithm changes

function readLocalWidgetSizes(): Record<string, WidgetSize> {
  if (typeof window === 'undefined') return { ...DEFAULT_SIZES };
  try {
    // Run migration if needed
    const migrationVersion = parseInt(localStorage.getItem(SIZES_MIGRATION_KEY) || '0', 10);
    if (migrationVersion < CURRENT_SIZES_MIGRATION) {
      // v4: clear all stored sizes so new defaults take effect
      localStorage.removeItem(SIZES_STORAGE_KEY);
      localStorage.setItem(SIZES_MIGRATION_KEY, String(CURRENT_SIZES_MIGRATION));
    }

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
  try {
    localStorage.setItem(SIZES_STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // silently ignore
  }
}

function readLocalWidgetPositions(): Record<string, WidgetPosition> {
  if (typeof window === 'undefined') return {};
  try {
    // Run migration if needed — clears stale positions from old layout algorithms
    const migrationVersion = parseInt(localStorage.getItem(POSITIONS_MIGRATION_KEY) || '0', 10);
    if (migrationVersion < CURRENT_POSITIONS_MIGRATION) {
      localStorage.removeItem(POSITIONS_STORAGE_KEY);
      localStorage.setItem(POSITIONS_MIGRATION_KEY, String(CURRENT_POSITIONS_MIGRATION));
      return {};
    }

    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (raw === null) return {};
    return JSON.parse(raw) as Record<string, WidgetPosition>;
  } catch {
    return {};
  }
}

function writeLocalWidgetPositions(positions: Record<string, WidgetPosition>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // silently ignore
  }
}

// ---------------------------------------------------------------------------
// Zustand Store — single source of truth, shared across all components
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
  // ─── Initial state ─────────────────────────────────────────
  visibilityMap: getDefaultVisibilityMap(),
  widgetOrder: [...DEFAULT_ORDER],
  widgetSizes: { ...DEFAULT_SIZES },
  widgetPositions: {},
  isAppOwner: false,
  isLoaded: false,

  // ─── Data loading ──────────────────────────────────────────
  _loadFromServer: async () => {
    try {
      const res = await fetch('/api/widget-settings');
      if (!res.ok) return;
      const data = await res.json();

      const serverWidgets = data.widgets as Record<string, boolean>;
      const defaults = getDefaultVisibilityMap();
      const merged = { ...defaults, ...serverWidgets };

      // Order — on first load with new default order, ignore server order and use defaults
      const serverOrder = data.order as string[] | undefined;
      let order: string[];
      if (serverOrder && serverOrder.length > 0) {
        // Check if the server order starts with the expected top widgets (activity-feed, vat-output, vat-input)
        // If not, it's a stale order from before the default change — reset to defaults
        const expectedTopIds = ['activity-feed', 'vat-output', 'vat-input'];
        const serverTop3 = serverOrder.slice(0, 3);
        const isStaleOrder = !expectedTopIds.every((id, i) => serverTop3[i] === id);
        if (isStaleOrder) {
          order = [...DEFAULT_ORDER];
        } else {
          const validIds = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
          const filtered = serverOrder.filter((id) => validIds.has(id));
          const missing = DEFAULT_ORDER.filter((id) => !serverOrder.includes(id));
          order = [...filtered, ...missing];
        }
      } else {
        order = readLocalWidgetOrder();
      }

      // Sizes — use server sizes but override with defaults for any that changed
      const serverSizes = data.sizes as Record<string, WidgetSize> | undefined;
      let sizes: Record<string, WidgetSize>;
      if (serverSizes) {
        // Remove stale overrides for widgets whose defaults changed
        delete serverSizes['profit-loss-waterfall'];
        delete serverSizes['cash-flow-forecast'];
        delete serverSizes['kpi-revenue'];
        delete serverSizes['kpi-operating-result'];
        delete serverSizes['vat-output'];
        delete serverSizes['vat-input'];
        sizes = { ...DEFAULT_SIZES, ...serverSizes };
      } else {
        sizes = readLocalWidgetSizes();
      }

      // Positions — read through the migration-aware function which clears
      // stale data from old layout algorithms
      const localPositions = readLocalWidgetPositions();
      // Only use server positions if the local migration didn't just clear them
      const serverPositions = data.positions as Record<string, WidgetPosition> | undefined;
      const positions = Object.keys(localPositions).length > 0
        ? localPositions
        : (serverPositions || localPositions);

      set({
        visibilityMap: merged,
        widgetOrder: order,
        widgetSizes: sizes,
        widgetPositions: positions,
        isAppOwner: !!data.isAppOwner,
        isLoaded: true,
      });

      writeLocalVisibilityMap(merged);
      writeLocalWidgetOrder(order);
      writeLocalWidgetSizes(sizes);
      writeLocalWidgetPositions(positions);
    } catch {
      // API failed — fall back to localStorage
      set({
        visibilityMap: readLocalVisibilityMap(),
        widgetOrder: readLocalWidgetOrder(),
        widgetSizes: readLocalWidgetSizes(),
        widgetPositions: readLocalWidgetPositions(),
        isLoaded: true,
      });
    }
  },

  _persistToServer: () => {
    const { visibilityMap, widgetOrder, widgetSizes, widgetPositions, isLoaded } = get();
    if (!isLoaded) return;

    // Always keep localStorage in sync
    writeLocalVisibilityMap(visibilityMap);
    writeLocalWidgetOrder(widgetOrder);
    writeLocalWidgetSizes(widgetSizes);
    writeLocalWidgetPositions(widgetPositions);

    // Debounce API call
    if (persistDebounce) clearTimeout(persistDebounce);
    persistDebounce = setTimeout(async () => {
      try {
        await fetch('/api/widget-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgets: visibilityMap, order: widgetOrder, sizes: widgetSizes, positions: widgetPositions }),
        });
      } catch {
        // Silently fail — data is cached locally
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
    // Persist after state update (next tick)
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
    const validIds = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
    const filtered = newOrder.filter((id) => validIds.has(id));
    const missing = DEFAULT_ORDER.filter((id) => !newOrder.includes(id));
    set({ widgetOrder: [...filtered, ...missing] });
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
    // Debounced persist
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
    set({
      visibilityMap: getDefaultVisibilityMap(),
      widgetOrder: [...DEFAULT_ORDER],
      widgetSizes: { ...DEFAULT_SIZES },
      widgetPositions: {},
    });
    writeLocalWidgetPositions({});
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
