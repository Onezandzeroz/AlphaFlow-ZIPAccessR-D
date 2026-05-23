'use client';

import React, { useState, useCallback, useRef, ReactNode, useMemo, useSyncExternalStore } from 'react';
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
// Column 0 (left):   activity-feed
// Column 1 (middle):  vat-output (top), kpi-revenue (bottom)
// Column 2 (right):   vat-input (top), kpi-operating-result (bottom)

const COLUMN_COUNT = 3;

const DEFAULT_COLUMNS: Record<string, number> = {
  'activity-feed':        0,
  'vat-output':           1,
  'vat-input':            2,
  'kpi-revenue':          1,
  'kpi-operating-result': 2,
};

function clampColumn(col: number): number {
  return Math.max(0, Math.min(col, COLUMN_COUNT - 1));
}

// ─── MasonryLayout ────────────────────────────────────────────
//
// Column-based masonry layout with free-form drag-and-drop.
//
// Layout model:
//   • 3 logical columns on lg, 2 on sm, 1 on xs
//   • Widgets stack vertically within each column (flex-col + gap-3)
//   • NO rows — each column is independent, no cross-column alignment
//   • No empty gaps — every pixel is filled by a widget or padding
//
// Drag-and-drop (lg only):
//   • Drag a widget to any column — snaps to column boundary
//   • Within a column, snaps to widget edges (+ padding)
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
  // ── Drag state ──────────────────────────────────────────────
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    col: number;
    insertAfterId: string | null;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Responsive breakpoint (column drag only on lg+) ──────────
  const isLg = useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(min-width: 1024px)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
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

  // ── Distribute items into 3 columns (preserving global order) ─
  const columns = useMemo(() => {
    const cols: MasonryItem[][] = Array.from({ length: COLUMN_COUNT }, () => []);
    for (const item of items) {
      cols[getColumn(item.id)].push(item);
    }
    return cols;
  }, [items, getColumn]);

  // ── Visual columns: add drop placeholder during drag ────────
  const visualColumns = useMemo(() => {
    const result = columns.map(col => [...col]);
    if (!draggedId || !dropPreview) return result;

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
  }, [columns, draggedId, dropPreview]);

  // ── Active drop column (for visual highlight) ───────────────
  const activeDropCol = dropPreview?.col ?? -1;

  // ─── Drag-and-Drop handlers ─────────────────────────────────

  const cleanup = useCallback(() => {
    if (draggedId) {
      const el = containerRef.current?.querySelector(`[data-widget-id="${draggedId}"]`);
      if (el instanceof HTMLElement) el.style.opacity = '1';
    }
    setDraggedId(null);
    setDropPreview(null);
  }, [draggedId]);

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }
    setDraggedId(widgetId);
    setDropPreview(null);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, colIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedId || !isLg) return;

    const colEl = columnRefs.current[colIndex];
    if (!colEl) return;

    // Widgets in this column (excluding the dragged one)
    const colWidgets = columns[colIndex].filter(w => w.id !== draggedId);
    let insertAfterId: string | null = null;

    if (colWidgets.length === 0) {
      // Empty column — find last widget before this column in global order
      for (const item of items) {
        if (item.id === draggedId) continue;
        if (getColumn(item.id) === colIndex) break;
        insertAfterId = item.id;
      }
    } else {
      // Snap to widget edges: find which widget the cursor is nearest to
      for (const widget of colWidgets) {
        const el = colEl.querySelector(`[data-widget-id="${widget.id}"]`);
        if (!el) continue;
        const rect = (el as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) break; // Cursor above midpoint → insert before this widget
        insertAfterId = widget.id;
      }

      // Cursor above first widget → find widget before this column in global order
      if (insertAfterId === null) {
        for (const item of items) {
          if (item.id === draggedId) continue;
          if (getColumn(item.id) === colIndex) break;
          insertAfterId = item.id;
        }
      }
    }

    setDropPreview(prev => {
      if (prev && prev.col === colIndex && prev.insertAfterId === insertAfterId) return prev;
      return { col: colIndex, insertAfterId };
    });
  }, [draggedId, columns, items, getColumn, isLg]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedId || !dropPreview) { cleanup(); return; }
    if (onPositionChange) {
      onPositionChange(draggedId, dropPreview.col, dropPreview.insertAfterId);
    }
    cleanup();
  }, [draggedId, dropPreview, onPositionChange, cleanup]);

  const handleDragEnd = useCallback(() => { cleanup(); }, [cleanup]);

  // ─── Render ────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`flex flex-wrap gap-3 p-3 sm:p-4 ${className}`}
    >
      {visualColumns.map((col, colIdx) => (
        <div
          key={colIdx}
          ref={el => { columnRefs.current[colIdx] = el; }}
          className={`
            w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)]
            flex flex-col gap-3
            transition-all duration-200 ease-out
            ${isDragMode && isLg ? 'min-h-[60px]' : ''}
            ${isDragMode && isLg && activeDropCol === colIdx
              ? 'rounded-xl ring-2 ring-teal-400/30 bg-teal-50/50 dark:bg-teal-900/10'
              : ''}
          `}
          onDragOver={isDragMode && isLg ? (e) => handleColumnDragOver(e, colIdx) : undefined}
          onDrop={isDragMode && isLg ? handleDrop : undefined}
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

            const isDragging = draggedId === item.id;
            const content = childContentMap.get(item.id) ?? item.element;

            return (
              <div
                key={item.id}
                data-widget-id={item.id}
                draggable={isDragMode}
                onDragStart={isDragMode ? (e) => handleDragStart(e, item.id) : undefined}
                onDragEnd={isDragMode ? handleDragEnd : undefined}
                className={`
                  ${isDragMode ? 'cursor-grab active:cursor-grabbing' : ''}
                  ${isDragging ? 'opacity-40 scale-[0.97] pointer-events-none' : 'transition-all duration-200 ease-out'}
                  relative
                `}
              >
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Width calculation helper (for external use) ──────────────────

export function getWidgetPixelWidth(size: WidgetSize, containerWidth: number): number {
  const fractions: Record<WidgetSize, number> = {
    full: 1, half: 0.5, third: 1 / 3, quarter: 0.25,
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
