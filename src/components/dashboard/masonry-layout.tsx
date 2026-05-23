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

// ─── Constants ────────────────────────────────────────────────────

const SIZE_WIDTH_FRACTION: Record<WidgetSize, number> = {
  full: 1,
  half: 0.5,
  third: 1 / 3,
  quarter: 0.25,
};

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

// ─── MasonryLayout Component ──────────────────────────────────────

interface MasonryLayoutProps {
  items: MasonryItem[];
  children?: ReactNode;
  isDragMode: boolean;
  itemHeights: Record<string, number>;
  onItemHeightChange?: (id: string, height: number) => void;
  className?: string;
  onReorder?: (draggedId: string, targetIndex: number) => void;
}

export function MasonryLayout({
  items,
  children,
  isDragMode,
  itemHeights,
  onItemHeightChange,
  className = '',
  onReorder,
}: MasonryLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Drag state — tracks which item is being dragged and its offset
  const [dragState, setDragState] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // The index where the dragged widget would land on drop
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

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

  // ── Flow layout: always recalculate from scratch ──
  const flowPositions = useMemo(() => {
    return calculateFlowLayout(
      effectiveItems.map(i => ({ id: i.id, size: i.size })),
      containerWidth,
      itemHeights,
    );
  }, [containerWidth, effectiveItems, itemHeights]);

  // Total container height
  const totalHeight = useMemo(() => {
    let maxBottom = 0;
    for (const item of effectiveItems) {
      const pos = flowPositions[item.id];
      if (pos) {
        const bottom = pos.y + (itemHeights[item.id] || 200);
        if (bottom > maxBottom) maxBottom = bottom;
      }
    }
    return maxBottom > 0 ? maxBottom + PADDING : 0;
  }, [flowPositions, effectiveItems, itemHeights]);

  // ── Compute drop target index from pointer position ──
  const computeDropIndex = useCallback((
    pointerX: number,
    pointerY: number,
    draggedId: string,
  ): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const containerX = pointerX - rect.left;
    const containerY = pointerY - rect.top;

    let bestIndex = 0;
    let bestDist = Infinity;

    for (let i = 0; i <= effectiveItems.length; i++) {
      // Calculate the position where item i would start
      if (i < effectiveItems.length) {
        const item = effectiveItems[i];
        if (item.id === draggedId) continue;
        const pos = flowPositions[item.id];
        if (!pos) continue;

        // Distance from pointer to this item's center
        const centerX = pos.x + pos.width / 2;
        const centerY = pos.y + (itemHeights[item.id] || 200) / 2;
        const dist = Math.sqrt((containerX - centerX) ** 2 + (containerY - centerY) ** 2);

        // If pointer is above this item, we'd insert before it (index i)
        if (containerY < pos.y + (itemHeights[item.id] || 200) / 2) {
          const insertIdx = i;
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = insertIdx;
          }
        } else {
          // Pointer is below this item, we'd insert after it (index i+1)
          const insertIdx = i + 1;
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = insertIdx;
          }
        }
      } else {
        // End position — distance to bottom of last item
        const lastItem = effectiveItems[effectiveItems.length - 1];
        if (lastItem) {
          const lastPos = flowPositions[lastItem.id];
          if (lastPos) {
            const bottomY = lastPos.y + (itemHeights[lastItem.id] || 200) + GAP / 2;
            const dist = Math.abs(containerY - bottomY) + Math.abs(containerX - PADDING);
            if (dist < bestDist) {
              bestDist = dist;
              bestIndex = i;
            }
          }
        }
      }
    }

    // Adjust index: if the dragged item is before the drop index, we need to subtract 1
    // because removing the dragged item shifts indices down
    const draggedIdx = effectiveItems.findIndex(item => item.id === draggedId);
    if (draggedIdx >= 0 && draggedIdx < bestIndex) {
      bestIndex -= 1;
    }

    return Math.max(0, Math.min(bestIndex, effectiveItems.length - 1));
  }, [effectiveItems, flowPositions, itemHeights]);

  // ── Drag handlers ──────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, itemId: string) => {
    if (!isDragMode) return;
    e.preventDefault();
    e.stopPropagation();

    const el = itemRefs.current.get(itemId);
    if (!el || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    // Offset from pointer to widget's top-left corner (in container-relative coords)
    const offsetX = e.clientX - elRect.left;
    const offsetY = e.clientY - elRect.top;

    // Widget's current position in container-relative coords
    const currentX = elRect.left - containerRect.left;
    const currentY = elRect.top - containerRect.top;

    el.setPointerCapture(e.pointerId);

    setDragState({
      id: itemId,
      offsetX,
      offsetY,
      currentX,
      currentY,
    });
  }, [isDragMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState || !containerRef.current) return;
    e.preventDefault();

    const containerRect = containerRef.current.getBoundingClientRect();

    // Widget follows the pointer, positioned relative to the container
    const newX = e.clientX - containerRect.left - dragState.offsetX;
    const newY = e.clientY - containerRect.top - dragState.offsetY;

    setDragState(prev => prev ? { ...prev, currentX: newX, currentY: newY } : null);

    // Compute drop target
    const targetIdx = computeDropIndex(e.clientX, e.clientY, dragState.id);
    setDropTargetIndex(targetIdx);
  }, [dragState, computeDropIndex]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    const el = itemRefs.current.get(dragState.id);
    if (el) el.releasePointerCapture(e.pointerId);

    // If we have a valid drop target, reorder
    if (dropTargetIndex !== null && onReorder) {
      onReorder(dragState.id, dropTargetIndex);
    }

    setDragState(null);
    setDropTargetIndex(null);
  }, [dragState, dropTargetIndex, onReorder]);

  // ── Render drop indicator position ──
  const dropIndicatorPosition = useMemo<{ x: number; y: number; width: number } | null>(() => {
    if (dropTargetIndex === null || !dragState) return null;

    const draggedIdx = effectiveItems.findIndex(item => item.id === dragState.id);

    if (effectiveItems.length === 0) return null;

    // After removing the dragged item, the target index points to where it should go
    // We need to compute where the indicator should appear
    if (dropTargetIndex === 0) {
      // Before the first item (that isn't the dragged one)
      const firstItem = effectiveItems.find(item => item.id !== dragState.id);
      if (firstItem) {
        const pos = flowPositions[firstItem.id];
        if (pos) {
          return { x: PADDING, y: pos.y - GAP / 2, width: pos.width };
        }
      }
      return null;
    }

    // Find the item at the target position (accounting for the dragged item being removed)
    const itemsWithoutDragged = effectiveItems.filter(item => item.id !== dragState.id);
    if (dropTargetIndex > itemsWithoutDragged.length) return null;

    const targetItem = itemsWithoutDragged[dropTargetIndex - 1];
    if (!targetItem) return null;

    const pos = flowPositions[targetItem.id];
    if (!pos) return null;

    const height = itemHeights[targetItem.id] || 200;
    return { x: PADDING, y: pos.y + height + GAP / 2, width: pos.width };
  }, [dropTargetIndex, dragState, effectiveItems, flowPositions, itemHeights]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height: totalHeight > 0 ? totalHeight : 'auto' }}
      onPointerMove={isDragMode ? handlePointerMove : undefined}
      onPointerUp={isDragMode ? handlePointerUp : undefined}
    >
      {/* Drop indicator line */}
      {dropIndicatorPosition && dragState && (
        <div
          className="pointer-events-none absolute z-[90]"
          style={{
            left: dropIndicatorPosition.x,
            top: dropIndicatorPosition.y,
            width: dropIndicatorPosition.width,
            height: 3,
            backgroundColor: '#0d9488',
            borderRadius: 2,
            opacity: 0.8,
          }}
        />
      )}

      {effectiveItems.map((item) => {
        const pos = flowPositions[item.id];
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
            className={`absolute ${isDragMode ? 'cursor-grab' : ''} ${
              isDragging
                ? 'cursor-grabbing z-50 shadow-2xl ring-2 ring-teal-400/50'
                : 'z-auto'
            }`}
            style={{
              left: isDragging ? dragState.currentX : pos.x,
              top: isDragging ? dragState.currentY : pos.y,
              width: pos.width,
              ...(isDragging
                ? { transition: 'none' }
                : { transition: 'left 0.2s ease-out, top 0.2s ease-out, width 0.2s ease-out' }),
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
