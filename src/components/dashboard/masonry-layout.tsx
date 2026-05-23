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
  x: number;  // grid column (0-based)
  y: number;  // grid row (0-based)
  width: number; // kept for store backwards-compat (unused)
}

interface GridPos {
  col: number;
  row: number;
}

// ─── Grid constants ──────────────────────────────────────────────

const TOTAL_COLS = 12;
const GAP_PX = 12; // gap-3

const LG_SPAN: Record<WidgetSize, number> = {
  full: 12,
  half: 6,
  third: 4,
  quarter: 3,
};

// ─── Default grid layout for the 5 default widgets ─────────────
// Row 1: activity-feed (left half), vat-output + vat-input (right half)
// Row 2: kpi-revenue + kpi-operating-result (right half, under VAT)
const DEFAULT_GRID_POSITIONS: Record<string, GridPos> = {
  'activity-feed':        { col: 0, row: 0 },
  'vat-output':           { col: 6, row: 0 },
  'vat-input':            { col: 9, row: 0 },
  'kpi-revenue':          { col: 6, row: 1 },
  'kpi-operating-result': { col: 9, row: 1 },
};

// ─── Responsive grid span Tailwind classes ─────────────────────
// Returns complete class strings so Tailwind JIT can detect them.

function getGridSpanClasses(size: WidgetSize): string {
  switch (size) {
    case 'full':    return 'col-span-1 sm:col-span-4 lg:col-span-12';
    case 'half':    return 'col-span-1 sm:col-span-2 lg:col-span-6';
    case 'third':   return 'col-span-1 sm:col-span-2 lg:col-span-4';
    case 'quarter': return 'col-span-1 sm:col-span-1 lg:col-span-3';
    default:        return 'col-span-1 sm:col-span-2 lg:col-span-6';
  }
}

// ─── Grid occupation helpers ───────────────────────────────────

function fitsAt(occupied: Set<string>, col: number, row: number, span: number): boolean {
  for (let c = col; c < col + span && c < TOTAL_COLS; c++) {
    if (occupied.has(`${c},${row}`)) return false;
  }
  return true;
}

function markOccupied(occupied: Set<string>, col: number, row: number, span: number): void {
  for (let c = col; c < col + span && c < TOTAL_COLS; c++) {
    occupied.add(`${c},${row}`);
  }
}

/** Find the nearest valid grid position for a widget, starting from (targetCol, targetRow). */
function findValidPosition(
  occupied: Set<string>,
  targetCol: number,
  targetRow: number,
  span: number,
): GridPos {
  const maxCol = Math.max(0, TOTAL_COLS - span);
  let col = Math.min(Math.max(0, targetCol), maxCol);
  let row = Math.max(0, targetRow);

  // Try exact target
  if (fitsAt(occupied, col, row, span)) return { col, row };

  // Scan same row left/right from target column
  for (let offset = 1; offset <= maxCol; offset++) {
    if (col - offset >= 0 && fitsAt(occupied, col - offset, row, span)) {
      return { col: col - offset, row };
    }
    if (col + offset <= maxCol && fitsAt(occupied, col + offset, row, span)) {
      return { col: col + offset, row };
    }
  }

  // Try next rows at same column, then scanning left
  for (let r = row + 1; r < 100; r++) {
    if (fitsAt(occupied, col, r, span)) return { col, row: r };
    for (let offset = 1; offset <= col; offset++) {
      if (fitsAt(occupied, col - offset, r, span)) return { col: col - offset, row: r };
    }
    // Also try right
    for (let offset = 1; offset <= maxCol - col; offset++) {
      if (fitsAt(occupied, col + offset, r, span)) return { col: col + offset, row: r };
    }
  }

  return { col: 0, row };
}

/**
 * Compute grid positions for ALL items.
 * Priority: saved position > default template > auto-flow.
 */
function computeAllPositions(
  items: MasonryItem[],
  savedPositions: Record<string, WidgetPosition>,
): Record<string, GridPos> {
  const result: Record<string, GridPos> = {};
  const occupied = new Set<string>();
  const positioned = new Set<string>();

  // Pass 1 — explicit positions (saved + default template)
  for (const item of items) {
    const saved = savedPositions[item.id];
    if (saved) {
      result[item.id] = { col: saved.x, row: saved.y };
      positioned.add(item.id);
      markOccupied(occupied, saved.x, saved.y, LG_SPAN[item.size]);
    } else if (DEFAULT_GRID_POSITIONS[item.id]) {
      const def = DEFAULT_GRID_POSITIONS[item.id];
      result[item.id] = { ...def };
      positioned.add(item.id);
      markOccupied(occupied, def.col, def.row, LG_SPAN[item.size]);
    }
  }

  // Pass 2 — auto-place remaining items (fill gaps top-to-bottom, left-to-right)
  for (const item of items) {
    if (positioned.has(item.id)) continue;
    const span = LG_SPAN[item.size];
    const pos = findValidPosition(occupied, 0, 0, span);
    result[item.id] = pos;
    markOccupied(occupied, pos.col, pos.row, span);
  }

  return result;
}

// ─── MasonryLayout Component ──────────────────────────────────
//
// CSS Grid layout (12 cols on lg, 4 on sm, 1 on xs) with free-form
// drag-and-drop positioning.
//
// Features:
//   • Default layout places the 5 standard widgets in the correct
//     arrangement (activity left, VAT right, KPI under VAT).
//   • Drag a widget to any grid cell — a dashed preview shows where
//     it will land.
//   • Collision detection prevents overlap.
//   • Positions persist across sessions.
//   • On mobile/sm, positions are ignored (auto-flow).

interface MasonryLayoutProps {
  items: MasonryItem[];
  children?: ReactNode;
  isDragMode: boolean;
  positions?: Record<string, WidgetPosition>;
  className?: string;
  onReorder?: (draggedId: string, targetIndex: number) => void; // kept for compat
  onPositionChange?: (widgetId: string, col: number, row: number) => void;
}

export function MasonryLayout({
  items,
  children,
  isDragMode,
  positions = {},
  className = '',
  onPositionChange,
}: MasonryLayoutProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ col: number; row: number; span: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track screen size — explicit positions only apply on lg+
  const isLg = useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(min-width: 1024px)');
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  // Compute effective grid positions for all items
  const effectivePositions = useMemo(
    () => computeAllPositions(items, positions),
    [items, positions],
  );

  // Build occupied set WITHOUT the dragged item (for collision detection)
  const occupiedWithoutDrag = useMemo(() => {
    if (!draggedId) return null;
    const without = items.filter(i => i.id !== draggedId);
    const posWithout: Record<string, WidgetPosition> = {};
    for (const key of Object.keys(positions)) {
      if (key !== draggedId) posWithout[key] = positions[key];
    }
    const pos = computeAllPositions(without, posWithout);
    const set = new Set<string>();
    for (const item of without) {
      const p = pos[item.id];
      if (p) markOccupied(set, p.col, p.row, LG_SPAN[item.size]);
    }
    return set;
  }, [draggedId, items, positions]);

  // Build child content map from children with data-widget-id
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedId || !isLg || !containerRef.current || !occupiedWithoutDrag) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Compute target column from X position
    const style = getComputedStyle(container);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const gridWidth = rect.width - padLeft - padRight;
    const colWidth = (gridWidth + GAP_PX) / TOTAL_COLS;
    let col = Math.floor((x - padLeft) / colWidth);

    const draggedItem = items.find(i => i.id === draggedId);
    if (!draggedItem) return;
    const span = LG_SPAN[draggedItem.size];
    col = Math.max(0, Math.min(col, TOTAL_COLS - span));

    // Compute target row from Y position.
    // Look at actual widget bounding boxes to detect row boundaries.
    const widgetEls = container.querySelectorAll('[data-widget-id]');
    const rowTops = new Set<number>();
    rowTops.add(0);

    widgetEls.forEach(el => {
      if ((el as HTMLElement).dataset.widgetId === draggedId) return;
      const elRect = (el as HTMLElement).getBoundingClientRect();
      const top = Math.round(elRect.top - rect.top);
      if (top > 0) rowTops.add(top);
    });

    const sortedTops = [...rowTops].sort((a, b) => a - b);
    let row = sortedTops.length - 1;
    for (let i = sortedTops.length - 1; i >= 0; i--) {
      if (y >= sortedTops[i]) {
        row = i;
        break;
      }
    }

    // Find nearest valid position
    const validPos = findValidPosition(occupiedWithoutDrag, col, row, span);

    setDropPreview(prev => {
      if (prev && prev.col === validPos.col && prev.row === validPos.row) return prev;
      return { col: validPos.col, row: validPos.row, span };
    });
  }, [draggedId, items, occupiedWithoutDrag, isLg]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedId || !dropPreview) {
      cleanup();
      return;
    }

    if (onPositionChange) {
      onPositionChange(draggedId, dropPreview.col, dropPreview.row);
    }
    cleanup();
  }, [draggedId, dropPreview, onPositionChange, cleanup]);

  const handleDragEnd = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-12 gap-3 p-3 sm:p-4 ${className}`}
      style={{ gridAutoFlow: 'dense' }}
      onDragOver={isDragMode ? handleDragOver : undefined}
      onDrop={isDragMode ? handleDrop : undefined}
    >
      {items.map(item => {
        const isDragging = draggedId === item.id;
        const content = childContentMap.get(item.id) ?? item.element;
        const pos = effectivePositions[item.id];
        const span = LG_SPAN[item.size];

        // Explicit position (only applied on lg+ screens)
        const positionStyle: React.CSSProperties | undefined =
          pos && isLg
            ? { gridColumn: `${pos.col + 1} / span ${span}`, gridRow: `${pos.row + 1}` }
            : undefined;

        return (
          <div
            key={item.id}
            data-widget-id={item.id}
            draggable={isDragMode}
            onDragStart={isDragMode ? (e) => handleDragStart(e, item.id) : undefined}
            onDragEnd={isDragMode ? handleDragEnd : undefined}
            className={`
              ${getGridSpanClasses(item.size)}
              ${isDragMode ? 'cursor-grab active:cursor-grabbing' : ''}
              ${isDragging ? 'opacity-40 scale-[0.97] pointer-events-none' : 'transition-all duration-200 ease-out'}
              relative
            `}
            style={positionStyle}
          >
            {content}
          </div>
        );
      })}

      {/* Drop preview placeholder */}
      {dropPreview && isLg && (
        <div
          className={`
            border-2 border-dashed border-[#0d9488]/50 rounded-xl
            bg-[#0d9488]/5 dark:bg-[#0d9488]/10
            flex items-center justify-center
            transition-all duration-150 ease-out
            min-h-[120px]
            animate-pulse
            pointer-events-none
            ${getGridSpanClasses(items.find(i => i.id === draggedId)?.size ?? 'half')}
          `}
          style={{
            gridColumn: `${dropPreview.col + 1} / span ${dropPreview.span}`,
            gridRow: `${dropPreview.row + 1}`,
          }}
        >
          <div className="flex flex-col items-center gap-2 text-[#0d9488]/60 dark:text-[#2dd4bf]/60">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-[10px] font-medium tracking-wide uppercase">Drop here</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Width calculation helper (for external use) ──────────────────

export function getWidgetPixelWidth(size: WidgetSize, containerWidth: number): number {
  const fractions: Record<WidgetSize, number> = {
    full: 1,
    half: 0.5,
    third: 1 / 3,
    quarter: 0.25,
  };
  const gap = GAP_PX;
  const padding = 16;
  const available = containerWidth - 2 * padding;
  const fraction = fractions[size] ?? 0.5;
  if (size === 'full') return available;
  const perRow = Math.round(1 / fraction);
  const totalGaps = (perRow - 1) * gap;
  return Math.floor((available - totalGaps) / perRow);
}
