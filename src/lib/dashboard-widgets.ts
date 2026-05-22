'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DASHBOARD_WIDGETS, getDefaultVisibilityMap, getDefaultSizesMap, WidgetSize } from '@/lib/dashboard-widget-definitions';

// Re-export so existing imports from this module still work
export { DASHBOARD_WIDGETS, getDefaultVisibilityMap } from '@/lib/dashboard-widget-definitions';
export type { DashboardWidget, WidgetSize } from '@/lib/dashboard-widget-definitions';
export { getGridSpanClasses, getWidgetGridSpanById, cycleSize, getWidgetGridSpan } from '@/lib/dashboard-widget-definitions';

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'alphaflow-dashboard-widgets';
const ORDER_STORAGE_KEY = 'alphaflow-dashboard-widget-order';
const SIZES_STORAGE_KEY = 'alphaflow-dashboard-widget-sizes';
const DEFAULT_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);
const DEFAULT_SIZES = getDefaultSizesMap();

function readLocalVisibilityMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return getDefaultVisibilityMap();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return getDefaultVisibilityMap();
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    // Merge with defaults so newly added widgets still get their default value
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
    // Storage full or unavailable – silently ignore
  }
}

function readLocalWidgetOrder(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_ORDER];
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_ORDER];
    const parsed = JSON.parse(raw) as string[];
    // Validate: ensure all known widget IDs are present, add missing ones at the end
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
    // Storage full or unavailable – silently ignore
  }
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
  try {
    localStorage.setItem(SIZES_STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // Storage full or unavailable – silently ignore
  }
}

// ---------------------------------------------------------------------------
// Hook — API-backed with localStorage cache
// ---------------------------------------------------------------------------

export function useDashboardWidgets() {
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>(getDefaultVisibilityMap);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_ORDER);
  const [widgetSizes, setWidgetSizes] = useState<Record<string, WidgetSize>>({ ...DEFAULT_SIZES });
  const [isAppOwner, setIsAppOwner] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch widget settings from API on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchSettings() {
      try {
        const res = await fetch('/api/widget-settings');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        const serverWidgets = data.widgets as Record<string, boolean>;
        // Merge with defaults so newly added widgets still get their default value
        const defaults = getDefaultVisibilityMap();
        const merged = { ...defaults, ...serverWidgets };
        setVisibilityMap(merged);
        writeLocalVisibilityMap(merged);

        // Read order from API response
        const serverOrder = data.order as string[] | undefined;
        if (serverOrder && serverOrder.length > 0) {
          // Ensure all known widget IDs are present
          const validIds = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
          const filtered = serverOrder.filter((id) => validIds.has(id));
          const missing = DEFAULT_ORDER.filter((id) => !serverOrder.includes(id));
          const fullOrder = [...filtered, ...missing];
          setWidgetOrder(fullOrder);
          writeLocalWidgetOrder(fullOrder);
        } else {
          // No order from API — use local cache or defaults
          const localOrder = readLocalWidgetOrder();
          setWidgetOrder(localOrder);
        }

        // Read sizes from API response
        const serverSizes = data.sizes as Record<string, WidgetSize> | undefined;
        if (serverSizes) {
          const mergedSizes = { ...DEFAULT_SIZES, ...serverSizes };
          setWidgetSizes(mergedSizes);
          writeLocalWidgetSizes(mergedSizes);
        } else {
          const localSizes = readLocalWidgetSizes();
          setWidgetSizes(localSizes);
        }

        setIsAppOwner(!!data.isAppOwner);
      } catch {
        // API failed — fall back to localStorage cache
        const cached = readLocalVisibilityMap();
        setVisibilityMap(cached);
        const cachedOrder = readLocalWidgetOrder();
        setWidgetOrder(cachedOrder);
        const cachedSizes = readLocalWidgetSizes();
        setWidgetSizes(cachedSizes);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    }

    fetchSettings();
    return () => { cancelled = true; };
  }, []);

  // Persist to API with debounce whenever visibility, order, or sizes change (after initial load)
  useEffect(() => {
    if (!isLoaded) return;
    // Always keep localStorage in sync as a cache
    writeLocalVisibilityMap(visibilityMap);
    writeLocalWidgetOrder(widgetOrder);
    writeLocalWidgetSizes(widgetSizes);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await fetch('/api/widget-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgets: visibilityMap, order: widgetOrder, sizes: widgetSizes }),
        });
      } catch {
        // Silently fail — data is cached locally
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [visibilityMap, widgetOrder, widgetSizes, isLoaded]);

  const visibleWidgets = DASHBOARD_WIDGETS.filter((w) => visibilityMap[w.id] !== false).map((w) => w.id);

  const isWidgetVisible = useCallback(
    (id: string): boolean => {
      return visibilityMap[id] ?? true;
    },
    [visibilityMap],
  );

  const toggleWidget = useCallback((id: string) => {
    setVisibilityMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Direct visibility setter (for real-time dialog sync)
  const setWidgetVisibility = useCallback((id: string, visible: boolean) => {
    setVisibilityMap((prev) => ({
      ...prev,
      [id]: visible,
    }));
  }, []);

  const resetWidgets = useCallback(() => {
    const defaults = getDefaultVisibilityMap();
    setVisibilityMap(defaults);
    setWidgetOrder([...DEFAULT_ORDER]);
    setWidgetSizes({ ...DEFAULT_SIZES });
  }, []);

  const setWidgetOrderDirect = useCallback((newOrder: string[]) => {
    // Ensure all known widget IDs are present
    const validIds = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
    const filtered = newOrder.filter((id) => validIds.has(id));
    const missing = DEFAULT_ORDER.filter((id) => !newOrder.includes(id));
    setWidgetOrder([...filtered, ...missing]);
  }, []);

  // Widget size actions
  const setWidgetSize = useCallback((id: string, size: WidgetSize) => {
    setWidgetSizes((prev) => ({
      ...prev,
      [id]: size,
    }));
  }, []);

  const getWidgetSize = useCallback(
    (id: string): WidgetSize => {
      return widgetSizes[id] ?? DEFAULT_SIZES[id] ?? 'half';
    },
    [widgetSizes],
  );

  const moveWidgetUp = useCallback((id: string) => {
    setWidgetOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveWidgetDown = useCallback((id: string) => {
    setWidgetOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const getWidgetOrderIndex = useCallback(
    (id: string): number => {
      const idx = widgetOrder.indexOf(id);
      return idx >= 0 ? idx : 999;
    },
    [widgetOrder],
  );

  return {
    visibleWidgets,
    isWidgetVisible,
    toggleWidget,
    setWidgetVisibility,
    resetWidgets,
    isAppOwner,
    isLoaded,
    widgetOrder,
    widgetSizes,
    setWidgetSize,
    getWidgetSize,
    moveWidgetUp,
    moveWidgetDown,
    getWidgetOrderIndex,
    setWidgetOrderDirect,
  } as const;
}
