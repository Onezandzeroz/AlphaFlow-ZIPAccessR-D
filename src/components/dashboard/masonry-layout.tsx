'use client';

import React, { useState, useCallback, useRef, ReactNode, useMemo, useSyncExternalStore, useEffect } from 'react';
import { WidgetSize } from '@/lib/dashboard-widget-definitions';

// ─── Types ────────────────────────────────────────────────────────

export interface MasonryItem {
  id: string;
  size: WidgetSize;
  element?: ReactNode;
}

export interface WidgetPosition {
  x: number;     // column index (0, 1, or 2)
  y: number;     // unused — kept for store backwards-compat
  width: number; // unused — kept for store backwards-compat
}

// ─── Default column assignments ───────────────────────────────
// Column 0 (left):   activity-feed, active-accounts, invoice-overview
// Column 1 (middle):  vat-output, kpi-revenue
// Column 2 (right):   vat-input, cash-position

export const COLUMN_COUNT = 3;

export const DEFAULT_COLUMNS: Record<string, number> = {
  'activity-feed':        0,
  'active-accounts':      0,
  'invoice-overview':     0,
  'vat-output':           1,
  'kpi-revenue':          1,
  'vat-input':            2,
  'cash-position':        2,
};

export function clampColumn(col: number): number {
  return Math.max(0, Math.min(col, COLUMN_COUNT - 1));
}

// ─── MasonryLayout ────────────────────────────────────────────
//
// Column-based masonry layout with pointer-event drag-and-drop.
//
// Layout model:
//   • 3 logical columns on lg, 2 on sm, 1 on xs
//   • Widgets stack vertically within each column (flex-col + gap-3)
//   • NO rows — each column is independent, no cross-column alignment
//   • No empty gaps — every pixel is filled by a widget or padding
//
// Drag-and-drop (pointer events — works on all screen sizes):
//   • Click and drag a widget to move it between columns
//   • Snaps to column boundary and widget edges (+ padding)
//   • Drop preview shows exactly where the widget will land
//   • Column assignments persist across sessions

interface MasonryLayoutProps {
  items: MasonryItem[];
  children?: ReactNode;
  isDragMode: boolean;
  positions?: Record<string, WidgetPosition>;
  className?: string;
  onReorder?: (draggedId: string, targetIndex: number) => void; // kept for compat
  onPositionChange?: (widgetId: string, col: number, insertAfterId: string | null) => void;
}

export function MasonryLayout({
  items,
  children,
  isDragMode,
  positions = {},
  className = '',
  onPositionChange,
}: MasonryLayoutProps) {
  // ── Drag state (React state for rendering, pointer events for mechanics) ─
  const [isDragging, setIsDragging] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    col: number;
    insertAfterId: string | null;
  } | null>(null);

  // ── Refs for pointer event tracking (don't trigger re-renders) ─
  const dragInternalRef = useRef<{
    isDown: boolean;
    widgetId: string | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    hasMoved: boolean;
    clone: HTMLElement | null;
    sourceEl: HTMLElement | null;
  }>({
    isDown: false,
    widgetId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    hasMoved: false,
    clone: null,
    sourceEl: null,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Keep callbacks in refs to avoid stale closures in window event listeners
  const onPositionChangeRef = useRef(onPositionChange);
  const itemsRef = useRef(items);
  const columnsRef = useRef<MasonryItem[][]>([]);

  useEffect(() => { onPositionChangeRef.current = onPositionChange; }, [onPositionChange]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── Responsive: how many columns are currently visible? ─────
  const visibleColumns = useSyncExternalStore(
    (cb) => {
      const mqlSm = window.matchMedia('(min-width: 640px)');
      const mqlLg = window.matchMedia('(min-width: 1024px)');
      mqlSm.addEventListener('change', cb);
      mqlLg.addEventListener('change', cb);
      return () => { mqlSm.removeEventListener('change', cb); mqlLg.removeEventListener('change', cb); };
    },
    () => {
      if (typeof window === 'undefined') return 1;
      if (window.matchMedia('(min-width: 1024px)').matches) return 3;
      if (window.matchMedia('(min-width: 640px)').matches) return 2;
      return 1;
    },
  );

  // ── Child content map (from data-widget-id children) ────────
  const childContentMap = useMemo(() => {
    const map = new Map<string, ReactNode>();
    if (!children) return map;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const props = child.props as Record<string, unknown>;
        const id = props['data-widget-id'] as string | undefined;
        if (id) {
          map.set(id, (props as { children?: ReactNode }).children ?? child);
        }
      }
    });
    return map;
  }, [children]);

  // ── Get column assignment for a widget ──────────────────────
  const getColumn = useCallback((id: string): number => {
    if (positions[id] !== undefined) return clampColumn(positions[id].x);
    if (DEFAULT_COLUMNS[id] !== undefined) return DEFAULT_COLUMNS[id];
    return 0;
  }, [positions]);

  // ── Distribute items into COLUMN_COUNT columns (preserving global order) ─
  const columns = useMemo(() => {
    const cols: MasonryItem[][] = Array.from({ length: COLUMN_COUNT }, () => []);
    for (const item of items) {
      cols[getColumn(item.id)].push(item);
    }
    return cols;
  }, [items, getColumn]);

  // Keep columns in ref for use in pointer event handlers
  useEffect(() => { columnsRef.current = columns; }, [columns]);

  // Keep getColumn in ref for use in pointer event handlers
  const getColumnRef = useRef(getColumn);
  useEffect(() => { getColumnRef.current = getColumn; }, [getColumn]);

  // ── Visual columns: add drop placeholder during drag ────────
  const visualColumns = useMemo(() => {
    const result = columns.map(col => [...col]);
    if (!isDragging || !dropPreview) return result;

    const { col: targetCol, insertAfterId } = dropPreview;
    const targetWidgets = result[targetCol];
    let insertIdx: number;

    if (insertAfterId !== null) {
      const afterIdx = targetWidgets.findIndex(w => w.id === insertAfterId);
      insertIdx = afterIdx >= 0 ? afterIdx + 1 : 0;
    } else {
      insertIdx = 0;
    }

    targetWidgets.splice(insertIdx, 0, {
      id: '__drop_placeholder__',
      size: 'half',
    } as MasonryItem);

    return result;
  }, [columns, isDragging, dropPreview]);

  // ── Active drop column (for visual highlight) ───────────────
  const activeDropCol = dropPreview?.col ?? -1;

  // ─── Pointer-event Drag-and-Drop ────────────────────────────

  // Determine which column the pointer is over
  const getColumnAtPoint = useCallback((clientX: number): number => {
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const colEl = columnRefs.current[i];
      if (!colEl) continue;
      const rect = colEl.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return i;
    }
    // Fallback: closest column by center distance
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const colEl = columnRefs.current[i];
      if (!colEl) continue;
      const rect = colEl.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(clientX - center);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    return closest;
  }, []);

  // Determine where in a column the widget should be inserted
  const getInsertPosition = useCallback((colIndex: number, clientY: number): { col: number; insertAfterId: string | null } => {
    const internal = dragInternalRef.current;
    const currentColumns = columnsRef.current;
    const getCol = getColumnRef.current;

    const colEl = columnRefs.current[colIndex];
    if (!colEl) return { col: colIndex, insertAfterId: null };

    // Widgets in this column (excluding the dragged one)
    const colWidgets = currentColumns[colIndex]?.filter(w => w.id !== internal.widgetId) ?? [];
    let insertAfterId: string | null = null;

    if (colWidgets.length === 0) {
      // Empty column — insert at beginning
      return { col: colIndex, insertAfterId: null };
    }

    // Snap to widget edges: find which widget the cursor is nearest to
    for (const widget of colWidgets) {
      const el = colEl.querySelector(`[data-widget-id="${widget.id}"]`);
      if (!el) continue;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) break; // Cursor above midpoint → insert before this widget
      insertAfterId = widget.id;
    }

    return { col: colIndex, insertAfterId };
  }, []);

  // Clean up drag state
  const cleanupDrag = useCallback(() => {
    const internal = dragInternalRef.current;
    if (internal.clone) {
      internal.clone.remove();
      internal.clone = null;
    }
    if (internal.sourceEl) {
      internal.sourceEl.style.opacity = '1';
      internal.sourceEl = null;
    }
    internal.isDown = false;
    internal.widgetId = null;
    internal.hasMoved = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    setIsDragging(false);
    setDraggedId(null);
    setDropPreview(null);
  }, []);

  // Handle pointer down on a widget — start potential drag
  const handlePointerDown = useCallback((e: React.PointerEvent, widgetId: string) => {
    if (!isDragMode) return;
    // Only left mouse button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    dragInternalRef.current = {
      isDown: true,
      widgetId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      hasMoved: false,
      clone: null,
      sourceEl: el,
    };

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
  }, [isDragMode]);

  // Global pointer move and up handlers
  useEffect(() => {
    if (!isDragMode) return;

    const handlePointerMove = (e: PointerEvent) => {
      const internal = dragInternalRef.current;
      if (!internal.isDown || !internal.widgetId) return;

      const dx = e.clientX - internal.startX;
      const dy = e.clientY - internal.startY;

      // Need at least 5px movement before starting the visual drag
      if (!internal.hasMoved) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        internal.hasMoved = true;

        // Now set React state for rendering (placeholder, dimming)
        setIsDragging(true);
        setDraggedId(internal.widgetId);
        document.body.style.cursor = 'grabbing';

        // Create clone of the widget
        const sourceEl = internal.sourceEl;
        if (sourceEl) {
          sourceEl.style.opacity = '0.3';

          const clone = sourceEl.cloneNode(true) as HTMLElement;
          clone.style.position = 'fixed';
          clone.style.width = `${sourceEl.offsetWidth}px`;
          clone.style.zIndex = '9999';
          clone.style.pointerEvents = 'none';
          clone.style.opacity = '0.85';
          clone.style.transform = 'scale(1.03)';
          clone.style.boxShadow = '0 20px 40px rgba(0,0,0,0.15), 0 8px 16px rgba(0,0,0,0.1)';
          clone.style.borderRadius = '12px';
          clone.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
          clone.setAttribute('data-drag-clone', 'true');
          document.body.appendChild(clone);
          internal.clone = clone;
        }
      }

      // Update clone position
      if (internal.clone) {
        internal.clone.style.left = `${e.clientX - internal.offsetX}px`;
        internal.clone.style.top = `${e.clientY - internal.offsetY}px`;
      }

      // Calculate drop target
      const visCols = typeof window !== 'undefined'
        ? (window.matchMedia('(min-width: 1024px)').matches ? 3
          : window.matchMedia('(min-width: 640px)').matches ? 2 : 1)
        : 1;

      const col = Math.min(getColumnAtPoint(e.clientX), visCols - 1);
      const position = getInsertPosition(col, e.clientY);

      setDropPreview(prev => {
        if (prev && prev.col === position.col && prev.insertAfterId === position.insertAfterId) return prev;
        return position;
      });
    };

    const handlePointerUp = () => {
      const internal = dragInternalRef.current;
      if (!internal.isDown) return;

      // Only apply if we actually moved (prevents accidental clicks)
      if (internal.hasMoved && dropPreview && internal.widgetId) {
        const callback = onPositionChangeRef.current;
        if (callback) {
          callback(internal.widgetId, dropPreview.col, dropPreview.insertAfterId);
        }
      }

      cleanupDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragMode, getColumnAtPoint, getInsertPosition, cleanupDrag, dropPreview]);

  // ─── Render ────────────────────────────────────────────────

  const colWidthClass = 'w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]';

  return (
    <div
      ref={containerRef}
      className={`flex flex-wrap gap-3 p-3 sm:p-4 ${className}`}
      style={isDragMode ? { touchAction: 'none' } : undefined}
    >
      {visualColumns.map((col, colIdx) => {
        const isDropTarget = isDragMode && activeDropCol === colIdx;
        const isColVisible = colIdx < visibleColumns;

        return (
          <div
            key={colIdx}
            ref={el => { columnRefs.current[colIdx] = el; }}
            className={`
              ${colWidthClass}
              flex flex-col gap-3
              transition-colors duration-200 ease-out
              ${isDragMode && isColVisible ? 'min-h-[60px] rounded-xl' : ''}
              ${isDropTarget && isColVisible
                ? 'ring-2 ring-teal-400/30 bg-teal-50/50 dark:bg-teal-900/10'
                : ''}
            `}
          >
            {col.map(item => {
              // ── Drop placeholder ──
              if (item.id === '__drop_placeholder__') {
                return (
                  <div
                    key="__placeholder__"
                    className="border-2 border-dashed border-[#0d9488]/50 rounded-xl bg-[#0d9488]/5 dark:bg-[#0d9488]/10 flex items-center justify-center min-h-[120px] animate-pulse"
                  >
                    <div className="flex flex-col items-center gap-2 text-[#0d9488]/60 dark:text-[#2dd4bf]/60">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      <span className="text-[10px] font-medium tracking-wide uppercase">Drop here</span>
                    </div>
                  </div>
                );
              }

              const isThisDragging = isDragging && draggedId === item.id;
              const content = childContentMap.get(item.id) ?? item.element;

              return (
                <div
                  key={item.id}
                  data-widget-id={item.id}
                  onPointerDown={isDragMode ? (e) => handlePointerDown(e, item.id) : undefined}
                  className={`
                    ${isDragMode ? 'cursor-grab select-none' : ''}
                    ${isThisDragging ? 'opacity-30' : ''}
                    relative
                  `}
                  style={isDragMode ? { touchAction: 'none' } : undefined}
                >
                  {content}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Width calculation helper (for external use) ──────────────────

export function getWidgetPixelWidth(size: WidgetSize, containerWidth: number): number {
  const fractions: Record<WidgetSize, number> = {
    full: 1, 'two-thirds': 2 / 3, half: 0.5, third: 1 / 3, quarter: 0.25,
  };
  const gap = 12;
  const padding = 16;
  const available = containerWidth - 2 * padding;
  const fraction = fractions[size] ?? 0.5;
  if (size === 'full') return available;
  const perRow = Math.round(1 / fraction);
  const totalGaps = (perRow - 1) * gap;
  return Math.floor((available - totalGaps) / perRow);
}
