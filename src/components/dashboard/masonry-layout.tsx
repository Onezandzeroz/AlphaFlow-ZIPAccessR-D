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

// ─── Overlap detection ────────────────────────────────────────────
// Returns true if two rects overlap (are closer than minGap pixels
// in BOTH the horizontal AND vertical axes simultaneously).

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  minGap: number,
): boolean {
  // No overlap if there's enough horizontal OR vertical separation
  const separatedHorizontally = a.x + a.width + minGap <= b.x || b.x + b.width + minGap <= a.x;
  const separatedVertically = a.y + a.height + minGap <= b.y || b.y + b.height + minGap <= a.y;
  return !separatedHorizontally && !separatedVertically;
}

// ─── Overlap resolution ───────────────────────────────────────────
// Takes a set of positions and resolves any overlaps by pushing
// overlapping widgets down. Processes widgets top-to-bottom so
// higher widgets stay in place and lower ones get pushed.
// This is the "desktop icon" guarantee: no two widgets ever overlap.

function resolveAllOverlaps(
  positions: Record<string, WidgetPosition>,
  itemOrder: string[],
  itemHeights: Record<string, number>,
  containerWidth: number,
): Record<string, WidgetPosition> {
  if (containerWidth === 0) return positions;

  const resolved: Record<string, WidgetPosition> = {};
  const placedRects: PlacedRect[] = [];

  // Sort by y position (top-to-bottom), then x (left-to-right)
  const sortedIds = [...itemOrder].sort((a, b) => {
    const posA = positions[a];
    const posB = positions[b];
    if (!posA && !posB) return 0;
    if (!posA) return 1;
    if (!posB) return -1;
    const dy = posA.y - posB.y;
    if (Math.abs(dy) > 1) return dy;
    return posA.x - posB.x;
  });

  for (const id of sortedIds) {
    const pos = positions[id];
    if (!pos) continue;

    const height = itemHeights[id] || 200;
    let currentPos = { ...pos };

    // Check against all previously placed (and resolved) widgets
    let hasOverlap = true;
    let iterations = 0;
    while (hasOverlap && iterations < 100) {
      hasOverlap = false;
      for (const placed of placedRects) {
        if (rectsOverlap(
          { x: currentPos.x, y: currentPos.y, width: currentPos.width, height },
          { x: placed.x, y: placed.y, width: placed.width, height: placed.height },
          GAP,
        )) {
          // Push down past the overlapping widget
          currentPos = {
            ...currentPos,
            y: placed.y + placed.height + GAP,
          };
          hasOverlap = true;
          break; // Restart check from the first placed widget
        }
      }
      iterations++;
    }

    // Clamp to container bounds
    if (currentPos.x < PADDING) currentPos.x = PADDING;
    if (currentPos.x + currentPos.width > containerWidth - PADDING) {
      currentPos.x = Math.max(PADDING, containerWidth - PADDING - currentPos.width);
    }
    if (currentPos.y < PADDING) currentPos.y = PADDING;

    resolved[id] = currentPos;
    placedRects.push({
      id,
      x: currentPos.x,
      y: currentPos.y,
      width: currentPos.width,
      height,
    });
  }

  return resolved;
}

// ─── Find non-overlapping position for a dragged widget ───────────
// Given a desired position, push the widget down if it would overlap
// any other widget. Used during drag to prevent dropping on top of
// other widgets.

function findNonOverlappingPosition(
  id: string,
  desiredPos: WidgetPosition,
  desiredHeight: number,
  otherRects: PlacedRect[],
  containerWidth: number,
): WidgetPosition {
  let pos = { ...desiredPos };

  // Clamp to container first
  if (pos.x < PADDING) pos.x = PADDING;
  if (pos.x + pos.width > containerWidth - PADDING) {
    pos.x = Math.max(PADDING, containerWidth - PADDING - pos.width);
  }
  if (pos.y < PADDING) pos.y = PADDING;

  // Push down past any overlapping widgets
  let hasOverlap = true;
  let iterations = 0;
  while (hasOverlap && iterations < 100) {
    hasOverlap = false;
    for (const other of otherRects) {
      if (other.id === id) continue;
      if (rectsOverlap(
        { x: pos.x, y: pos.y, width: pos.width, height: desiredHeight },
        { x: other.x, y: other.y, width: other.width, height: other.height },
        GAP,
      )) {
        pos = {
          ...pos,
          y: other.y + other.height + GAP,
        };
        hasOverlap = true;
        break;
      }
    }
    iterations++;
  }

  return pos;
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
  if (snappedX < PADDING) snappedX = PADDING;
  if (snappedX + draggedRect.width > containerWidth - PADDING) {
    snappedX = containerWidth - PADDING - draggedRect.width;
  }
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

  // Track which widgets have been manually positioned via drag.
  // We pair this with the itemsKey so that when widget order/visibility changes,
  // manual positions are automatically cleared (no useEffect needed).
  const [manualPositionState, setManualPositionState] = useState<{
    ids: Set<string>;
    itemsKey: string;
  }>({ ids: new Set(), itemsKey: '' });

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
  const flowPositions = useMemo(() => {
    return calculateFlowLayout(
      effectiveItems.map(i => ({ id: i.id, size: i.size })),
      containerWidth,
      itemHeights,
    );
  }, [containerWidth, itemsKey, itemHeights, effectiveItems]);

  // Derive effective manual IDs — auto-reset when itemsKey changes
  const effectiveManualIds = manualPositionState.itemsKey === itemsKey
    ? manualPositionState.ids
    : new Set<string>();

  // Merge flow positions with manually-positioned widgets, then resolve overlaps.
  // This is the key step: after merging, we run overlap resolution to guarantee
  // that no two widgets ever overlap — like desktop icons.
  const basePositions = useMemo(() => {
    const merged: Record<string, WidgetPosition> = {};
    for (const item of effectiveItems) {
      if (effectiveManualIds.has(item.id) && savedPositions && savedPositions[item.id]) {
        const saved = savedPositions[item.id];
        const width = getItemWidth(item.size, containerWidth);
        merged[item.id] = { x: saved.x, y: saved.y, width };
      } else {
        merged[item.id] = flowPositions[item.id];
      }
    }

    // ── Resolve overlaps ──
    // After merging flow + manual positions, some widgets may overlap.
    // Push overlapping widgets down so they don't overlap any other widget.
    return resolveAllOverlaps(
      merged,
      effectiveItems.map(i => i.id),
      itemHeights,
      containerWidth,
    );
  }, [flowPositions, savedPositions, containerWidth, effectiveItems, effectiveManualIds, itemsKey, itemHeights]);

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

    // Build list of other widgets' rects for snap + overlap calculation
    const otherRects: PlacedRect[] = [];
    for (const item of effectiveItems) {
      if (item.id === dragState.id) continue;
      const pos = basePositions[item.id];
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
    const draggedWidth = basePositions[dragState.id]?.width || 200;

    // Step 1: Snap to alignment guides
    const { snappedX, snappedY, snapLines: newSnapLines } = calculateSnapPoints(
      dragState.id,
      { x: newX, y: newY, width: draggedWidth, height: draggedHeight },
      otherRects,
      containerWidth,
      totalHeight,
    );

    // Step 2: Resolve overlaps — push down if this position overlaps any other widget
    const resolvedPos = findNonOverlappingPosition(
      dragState.id,
      { x: snappedX, y: snappedY, width: draggedWidth },
      draggedHeight,
      otherRects,
      containerWidth,
    );

    setSnapLines(newSnapLines);

    // Update drag override in real-time
    setDragOverrides(prev => ({
      ...prev,
      [dragState.id]: resolvedPos,
    }));
  }, [dragState, effectiveItems, basePositions, itemHeights, containerWidth, totalHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    const el = itemRefs.current.get(dragState.id);
    if (el) el.releasePointerCapture(e.pointerId);

    // Mark this widget as manually positioned (paired with current itemsKey)
    setManualPositionState(prev => ({
      ids: new Set(prev.ids).add(dragState.id),
      itemsKey,
    }));

    // Get the final drag position (already overlap-resolved from handlePointerMove)
    const finalPos = dragOverrides[dragState.id] || positions[dragState.id];
    if (finalPos) {
      onPositionChange?.(dragState.id, { x: finalPos.x, y: finalPos.y, width: finalPos.width });
    }

    // Clear drag state and overrides (basePositions will pick up saved positions + resolve overlaps)
    setDragState(null);
    setSnapLines([]);
    setDragOverrides({});
  }, [dragState, dragOverrides, positions, onPositionChange, itemsKey]);

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
