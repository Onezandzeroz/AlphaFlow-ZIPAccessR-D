'use client';

import React, { useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react';
import { WidgetSize } from '@/lib/dashboard-widget-definitions';

// ─── Types ────────────────────────────────────────────────────────

export interface MasonryItem {
  id: string;
  size: WidgetSize;
  element?: ReactNode;
}

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
}

interface PlacedRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Constants ────────────────────────────────────────────────────

const SIZE_WIDTH_FRACTION: Record<WidgetSize, number> = {
  full: 1,
  half: 0.5,
  third: 1 / 3,
  quarter: 0.25,
};

const SNAP_THRESHOLD = 12;
const GAP = 16;
const PADDING = 16;

// ─── Widget width calculation ─────────────────────────────────────

function getItemWidth(size: WidgetSize, containerWidth: number): number {
  const availableWidth = containerWidth - 2 * PADDING;
  const fraction = SIZE_WIDTH_FRACTION[size] ?? 0.5;
  if (size === 'full') return availableWidth;
  const itemsPerRow = Math.round(1 / fraction);
  const totalGaps = (itemsPerRow - 1) * GAP;
  return Math.floor((availableWidth - totalGaps) / itemsPerRow);
}

// ─── Row-based flow layout ────────────────────────────────────────
// Places widgets left-to-right in rows, wrapping to the next row
// when they don't fit. Like desktop icons in "auto-arrange" mode.
// Each row's height is the max height of its widgets.
// Returns positions in real coords (PADDING-offset).

interface Row {
  widgets: Array<{ id: string; width: number }>;
  y: number;
  height: number;
}

function calculateFlowLayout(
  items: Array<{ id: string; size: WidgetSize }>,
  containerWidth: number,
  itemHeights: Record<string, number>,
): Record<string, WidgetPosition> {
  if (containerWidth === 0) return {};

  const availableWidth = containerWidth - 2 * PADDING;
  const result: Record<string, WidgetPosition> = {};

  // Build rows
  const rows: Row[] = [];
  let currentRow: Row = { widgets: [], y: PADDING, height: 0 };
  let currentRowUsedWidth = 0;

  for (const item of items) {
    const width = getItemWidth(item.size, containerWidth);
    const height = itemHeights[item.id] || 200;

    // Can this widget fit in the current row?
    const neededWidth = currentRow.widgets.length === 0
      ? width
      : GAP + width;

    if (currentRowUsedWidth + neededWidth > availableWidth + 0.5 && currentRow.widgets.length > 0) {
      // Finish current row
      rows.push(currentRow);
      // Start new row
      const newRowY = currentRow.y + currentRow.height + GAP;
      currentRow = { widgets: [], y: newRowY, height: 0 };
      currentRowUsedWidth = 0;
    }

    // Add to current row
    currentRow.widgets.push({ id: item.id, width });
    currentRow.height = Math.max(currentRow.height, height);
    currentRowUsedWidth += (currentRow.widgets.length === 1 ? 0 : GAP) + width;
  }

  // Push the last row
  if (currentRow.widgets.length > 0) {
    rows.push(currentRow);
  }

  // Assign positions from rows
  for (const row of rows) {
    // Calculate total widget width in this row
    const totalWidgetWidth = row.widgets.reduce((sum, w) => sum + w.width, 0);
    const totalGapsInRow = (row.widgets.length - 1) * GAP;
    const usedSpace = totalWidgetWidth + totalGapsInRow;
    const remainingSpace = availableWidth - usedSpace;

    // Left-align widgets (like desktop icons)
    let x = PADDING;

    for (const widget of row.widgets) {
      result[widget.id] = {
        x,
        y: row.y,
        width: widget.width,
      };
      x += widget.width + GAP;
    }
  }

  return result;
}

// ─── Snap calculation ─────────────────────────────────────────────

interface SnapLine {
  orientation: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
}

function calculateSnapPoints(
  draggedId: string,
  draggedRect: { x: number; y: number; width: number; height: number },
  otherRects: PlacedRect[],
  containerWidth: number,
  containerHeight: number,
): { snappedX: number; snappedY: number; snapLines: SnapLine[] } {
  let snappedX = draggedRect.x;
  let snappedY = draggedRect.y;
  const snapLines: SnapLine[] = [];

  const dLeft = draggedRect.x;
  const dRight = draggedRect.x + draggedRect.width;
  const dTop = draggedRect.y;
  const dBottom = draggedRect.y + draggedRect.height;

  // Check each other widget for snap alignment
  for (const other of otherRects) {
    if (other.id === draggedId) continue;

    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oTop = other.y;
    const oBottom = other.y + other.height;

    // ── Vertical snap (x-axis) ──
    if (Math.abs(dLeft - oLeft) < SNAP_THRESHOLD) {
      snappedX = oLeft;
      snapLines.push({ orientation: 'vertical', position: oLeft, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }
    if (Math.abs(dLeft - (oRight + GAP)) < SNAP_THRESHOLD) {
      snappedX = oRight + GAP;
      snapLines.push({ orientation: 'vertical', position: oRight + GAP, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }
    if (Math.abs(dRight - oRight) < SNAP_THRESHOLD) {
      snappedX = oRight - draggedRect.width;
      snapLines.push({ orientation: 'vertical', position: oRight, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }
    if (Math.abs(dRight + GAP - oLeft) < SNAP_THRESHOLD) {
      snappedX = oLeft - GAP - draggedRect.width;
      snapLines.push({ orientation: 'vertical', position: oLeft, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }

    // ── Horizontal snap (y-axis) ──
    if (Math.abs(dTop - oTop) < SNAP_THRESHOLD) {
      snappedY = oTop;
      snapLines.push({ orientation: 'horizontal', position: oTop, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
    if (Math.abs(dTop - (oBottom + GAP)) < SNAP_THRESHOLD) {
      snappedY = oBottom + GAP;
      snapLines.push({ orientation: 'horizontal', position: oBottom + GAP, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
    if (Math.abs(dBottom - oBottom) < SNAP_THRESHOLD) {
      snappedY = oBottom - draggedRect.height;
      snapLines.push({ orientation: 'horizontal', position: oBottom, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
    if (Math.abs(dBottom + GAP - oTop) < SNAP_THRESHOLD) {
      snappedY = oTop - GAP - draggedRect.height;
      snapLines.push({ orientation: 'horizontal', position: oTop, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
  }

  // ── Container edge snaps ──
  if (Math.abs(dLeft - PADDING) < SNAP_THRESHOLD) {
    snappedX = PADDING;
    snapLines.push({ orientation: 'vertical', position: PADDING, start: dTop, end: dBottom });
  }
  if (Math.abs(dRight - (containerWidth - PADDING)) < SNAP_THRESHOLD) {
    snappedX = containerWidth - PADDING - draggedRect.width;
    snapLines.push({ orientation: 'vertical', position: containerWidth - PADDING, start: dTop, end: dBottom });
  }
  if (Math.abs(dTop - PADDING) < SNAP_THRESHOLD) {
    snappedY = PADDING;
    snapLines.push({ orientation: 'horizontal', position: PADDING, start: dLeft, end: dRight });
  }

  // ── Clamp to container bounds (never off-screen) ──
  // Left edge
  if (snappedX < PADDING) snappedX = PADDING;
  // Right edge
  if (snappedX + draggedRect.width > containerWidth - PADDING) {
    snappedX = containerWidth - PADDING - draggedRect.width;
  }
  // Top edge
  if (snappedY < PADDING) snappedY = PADDING;

  // Deduplicate snap lines
  const seen = new Set<string>();
  const uniqueLines = snapLines.filter(l => {
    const key = `${l.orientation}:${Math.round(l.position)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { snappedX, snappedY, snapLines: uniqueLines };
}

// ─── MasonryLayout Component ──────────────────────────────────────

interface MasonryLayoutProps {
  items: MasonryItem[];
  children?: ReactNode;
  savedPositions?: Record<string, WidgetPosition>;
  onPositionChange?: (id: string, position: WidgetPosition) => void;
  isDragMode: boolean;
  itemHeights: Record<string, number>;
  onItemHeightChange?: (id: string, height: number) => void;
  className?: string;
}

export function MasonryLayout({
  items,
  children,
  savedPositions,
  onPositionChange,
  isDragMode,
  itemHeights,
  onItemHeightChange,
  className = '',
}: MasonryLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Drag state
  const [dragState, setDragState] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  // Track which widgets have been manually positioned via drag (state so it triggers re-render)
  const [manuallyPositionedIds, setManuallyPositionedIds] = useState<Set<string>>(new Set());

  // Build child content map from children with data-widget-id
  const childContentMap = useMemo(() => {
    const map = new Map<string, ReactNode>();
    if (!children) return map;

    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const props = child.props as Record<string, unknown>;
        const id = props['data-widget-id'] as string | undefined;
        if (id) {
          const childContent = (props as { children?: ReactNode }).children ?? child;
          map.set(id, childContent);
        }
      }
    });
    return map;
  }, [children]);

  // Effective items: only those with renderable content
  const effectiveItems = useMemo(() => {
    return items.filter(item => item.element != null || childContentMap.has(item.id));
  }, [items, childContentMap]);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure item heights with ResizeObserver
  useEffect(() => {
    const refs = itemRefs.current;
    if (refs.size === 0) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.getAttribute('data-widget-id');
        if (id) {
          const h = Math.round(entry.contentRect.height);
          if (itemHeights[id] !== h) {
            onItemHeightChange?.(id, h);
          }
        }
      }
    });

    refs.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [effectiveItems.length, onItemHeightChange, itemHeights]);

  // Stable key from items structure
  const itemsKey = effectiveItems.map(i => `${i.id}:${i.size}`).join(',');

  // ── Flow layout: always recalculate from scratch ──
  // This is the "desktop icon auto-arrange" — positions are always
  // derived from the widget order and sizes, never from stale saved data.
  const flowPositions = useMemo(() => {
    return calculateFlowLayout(
      effectiveItems.map(i => ({ id: i.id, size: i.size })),
      containerWidth,
      itemHeights,
    );
  }, [containerWidth, itemsKey, itemHeights, effectiveItems]);

  // Merge flow positions with any manually-positioned widgets.
  // On initial load, ALL widgets use flow positions.
  // After a user drags a widget, that widget uses its custom position
  // until the layout is reset or the widget order changes.
  // NOTE: itemsKey is included to automatically reset manual positioning
  // when the widget order/visibility changes.
  const basePositions = useMemo(() => {
    const merged: Record<string, WidgetPosition> = {};
    for (const item of effectiveItems) {
      if (manuallyPositionedIds.has(item.id) && savedPositions && savedPositions[item.id]) {
        // Use saved custom position, but always use the current width
        const saved = savedPositions[item.id];
        const width = getItemWidth(item.size, containerWidth);
        merged[item.id] = { x: saved.x, y: saved.y, width };
      } else {
        // Use flow layout position
        merged[item.id] = flowPositions[item.id];
      }
    }
    return merged;
  }, [flowPositions, savedPositions, containerWidth, effectiveItems, manuallyPositionedIds, itemsKey]);

  // Active positions: base + any drag-in-progress overrides
  const [dragOverrides, setDragOverrides] = useState<Record<string, WidgetPosition>>({});
  const positions = useMemo(() => {
    if (Object.keys(dragOverrides).length === 0) return basePositions;
    return { ...basePositions, ...dragOverrides };
  }, [basePositions, dragOverrides]);

  // Total container height
  const totalHeight = useMemo(() => {
    let maxBottom = 0;
    for (const item of effectiveItems) {
      const pos = positions[item.id];
      if (pos) {
        const bottom = pos.y + (itemHeights[item.id] || 200);
        if (bottom > maxBottom) maxBottom = bottom;
      }
    }
    return maxBottom > 0 ? maxBottom + PADDING : 0;
  }, [positions, effectiveItems, itemHeights]);

  // ── Drag handlers ──────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, itemId: string) => {
    if (!isDragMode) return;
    e.preventDefault();
    e.stopPropagation();

    const pos = positions[itemId];
    if (!pos) return;

    const el = itemRefs.current.get(itemId);
    if (el) el.setPointerCapture(e.pointerId);

    setDragState({
      id: itemId,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
    });
  }, [isDragMode, positions]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;
    e.preventDefault();

    const newX = e.clientX - dragState.offsetX;
    const newY = e.clientY - dragState.offsetY;

    // Build list of other widgets' rects for snap calculation
    const otherRects: PlacedRect[] = [];
    for (const item of effectiveItems) {
      if (item.id === dragState.id) continue;
      const pos = positions[item.id];
      if (!pos) continue;
      otherRects.push({
        id: item.id,
        x: pos.x,
        y: pos.y,
        width: pos.width,
        height: itemHeights[item.id] || 200,
      });
    }

    const draggedHeight = itemHeights[dragState.id] || 200;
    const draggedWidth = positions[dragState.id]?.width || 200;

    const { snappedX, snappedY, snapLines: newSnapLines } = calculateSnapPoints(
      dragState.id,
      { x: newX, y: newY, width: draggedWidth, height: draggedHeight },
      otherRects,
      containerWidth,
      totalHeight,
    );

    setSnapLines(newSnapLines);

    // Update drag override in real-time
    setDragOverrides(prev => ({
      ...prev,
      [dragState.id]: { ...prev[dragState.id], x: snappedX, y: snappedY, width: draggedWidth },
    }));
  }, [dragState, effectiveItems, positions, itemHeights, containerWidth, totalHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    const el = itemRefs.current.get(dragState.id);
    if (el) el.releasePointerCapture(e.pointerId);

    // Mark this widget as manually positioned
    setManuallyPositionedIds(prev => new Set(prev).add(dragState.id));

    // Get the final drag position
    const finalPos = dragOverrides[dragState.id] || positions[dragState.id];
    if (finalPos) {
      onPositionChange?.(dragState.id, { x: finalPos.x, y: finalPos.y, width: finalPos.width });
    }

    // Clear drag state and overrides (basePositions will pick up saved positions)
    setDragState(null);
    setSnapLines([]);
    setDragOverrides({});
  }, [dragState, dragOverrides, positions, onPositionChange]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height: totalHeight > 0 ? totalHeight : 'auto' }}
      onPointerMove={isDragMode ? handlePointerMove : undefined}
      onPointerUp={isDragMode ? handlePointerUp : undefined}
    >
      {/* Snap guide lines */}
      {snapLines.map((line, idx) => (
        <div
          key={`snap-${idx}`}
          className="pointer-events-none absolute z-[100]"
          style={
            line.orientation === 'vertical'
              ? {
                  left: line.position,
                  top: line.start - 10,
                  width: 1,
                  height: line.end - line.start + 20,
                  backgroundColor: '#0d9488',
                  opacity: 0.7,
                }
              : {
                  top: line.position,
                  left: line.start - 10,
                  height: 1,
                  width: line.end - line.start + 20,
                  backgroundColor: '#0d9488',
                  opacity: 0.7,
                }
          }
        />
      ))}

      {effectiveItems.map((item) => {
        const pos = positions[item.id];
        if (!pos) return null;

        const isDragging = dragState?.id === item.id;
        const content = childContentMap.get(item.id) ?? item.element;

        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
            }}
            data-widget-id={item.id}
            className={`absolute ${isDragMode ? 'cursor-grab' : ''} ${isDragging ? 'cursor-grabbing z-50 shadow-2xl ring-2 ring-teal-400/50' : 'z-auto'} transition-[width] duration-200 ease-out`}
            style={{
              left: pos.x,
              top: pos.y,
              width: pos.width,
              ...(isDragging
                ? { transition: 'none' }
                : { transition: 'left 0.15s ease-out, top 0.15s ease-out, width 0.2s ease-out' }),
            }}
            onPointerDown={isDragMode ? (e) => handlePointerDown(e, item.id) : undefined}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

// ─── Width calculation helper (for external use) ──────────────────

export function getWidgetPixelWidth(size: WidgetSize, containerWidth: number): number {
  return getItemWidth(size, containerWidth);
}
