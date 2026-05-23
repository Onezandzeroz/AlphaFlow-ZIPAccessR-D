'use client';

import React, { useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react';
import { WidgetSize } from '@/lib/dashboard-widget-definitions';

// ─── Types ────────────────────────────────────────────────────────

export interface MasonryItem {
  id: string;
  size: WidgetSize;
  element?: ReactNode; // Optional when using children-based rendering
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

const SNAP_THRESHOLD = 10; // px — snap when within this distance
const GAP = 16; // consistent margin between widgets
const PADDING = 16; // margin from container edges (all sides)

// ─── Skyline bin-packing algorithm ────────────────────────────────
// Works in a virtual coordinate system (0,0) → (availableWidth, ∞)
// The final positions are offset by PADDING to create edge margins.

interface SkylineSegment {
  x: number;
  y: number;
  width: number;
}

function placeRectangle(
  skyline: SkylineSegment[],
  rectWidth: number,
  availableWidth: number,
  gap: number,
): { x: number; y: number } {
  if (skyline.length === 0) {
    return { x: 0, y: 0 };
  }

  let bestX = 0;
  let bestY = Infinity;

  for (let i = 0; i < skyline.length; i++) {
    const seg = skyline[i];
    if (seg.x + rectWidth > availableWidth + 0.5) continue;
    const yAtX = getYAtX(skyline, seg.x, seg.x + rectWidth);
    if (yAtX < bestY) {
      bestY = yAtX;
      bestX = seg.x;
    }
  }

  for (let i = 0; i < skyline.length; i++) {
    const seg = skyline[i];
    const tryX = seg.x + seg.width + gap;
    if (tryX + rectWidth > availableWidth + 0.5) continue;
    const yAtX = getYAtX(skyline, tryX, tryX + rectWidth);
    if (yAtX < bestY) {
      bestY = yAtX;
      bestX = tryX;
    }
  }

  if (bestY === Infinity) {
    bestY = Math.max(...skyline.map(s => s.y));
    bestX = 0;
  }

  return { x: bestX, y: bestY };
}

function getYAtX(skyline: SkylineSegment[], xStart: number, xEnd: number): number {
  let maxY = 0;
  for (const seg of skyline) {
    const overlapStart = Math.max(seg.x, xStart);
    const overlapEnd = Math.min(seg.x + seg.width, xEnd);
    if (overlapStart < overlapEnd) {
      maxY = Math.max(maxY, seg.y);
    }
  }
  return maxY;
}

function addRectangleToSkyline(
  skyline: SkylineSegment[],
  x: number,
  y: number,
  width: number,
  height: number,
): SkylineSegment[] {
  const newTop = y + height + GAP;
  const newSeg: SkylineSegment = { x, y: newTop, width };

  const newSkyline: SkylineSegment[] = [];
  for (const seg of skyline) {
    const segEnd = seg.x + seg.width;
    const newEnd = x + width;
    const overlapStart = Math.max(seg.x, x);
    const overlapEnd = Math.min(segEnd, newEnd);

    if (overlapStart < overlapEnd) {
      if (seg.y > newTop) {
        if (seg.x < x) {
          newSkyline.push({ x: seg.x, y: seg.y, width: x - seg.x });
        }
        if (segEnd > newEnd) {
          newSkyline.push({ x: newEnd, y: seg.y, width: segEnd - newEnd });
        }
      }
    } else {
      newSkyline.push({ ...seg });
    }
  }

  newSkyline.push(newSeg);
  newSkyline.sort((a, b) => a.x - b.x);

  const merged: SkylineSegment[] = [];
  for (const seg of newSkyline) {
    if (merged.length > 0) {
      const last = merged[merged.length - 1];
      if (last.y === seg.y && Math.abs((last.x + last.width) - seg.x) < 1) {
        last.width += seg.width;
        continue;
      }
    }
    merged.push({ ...seg });
  }

  return merged;
}

// ─── Snap calculation ─────────────────────────────────────────────

interface SnapLine {
  orientation: 'horizontal' | 'vertical';
  position: number; // the x (vertical line) or y (horizontal line) value
  start: number; // start of the line segment
  end: number; // end of the line segment
}

function calculateSnapPoints(
  draggedId: string,
  draggedRect: { x: number; y: number; width: number; height: number },
  otherRects: PlacedRect[],
  containerWidth: number,
): { snappedX: number; snappedY: number; snapLines: SnapLine[] } {
  let snappedX = draggedRect.x;
  let snappedY = draggedRect.y;
  const snapLines: SnapLine[] = [];

  const dLeft = draggedRect.x;
  const dRight = draggedRect.x + draggedRect.width;
  const dTop = draggedRect.y;
  const dBottom = draggedRect.y + draggedRect.height;
  const dCenterX = draggedRect.x + draggedRect.width / 2;
  const dCenterY = draggedRect.y + draggedRect.height / 2;

  // Check each other widget for snap alignment
  for (const other of otherRects) {
    if (other.id === draggedId) continue;

    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterX = other.x + other.width / 2;
    const oCenterY = other.y + other.height / 2;

    // ── Vertical snap lines (x-axis alignment) ──

    // Left edge to left edge
    if (Math.abs(dLeft - oLeft) < SNAP_THRESHOLD) {
      snappedX = oLeft;
      snapLines.push({ orientation: 'vertical', position: oLeft, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }
    // Left edge to right edge + gap
    if (Math.abs(dLeft - (oRight + GAP)) < SNAP_THRESHOLD) {
      snappedX = oRight + GAP;
      snapLines.push({ orientation: 'vertical', position: oRight + GAP, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }
    // Right edge to right edge
    if (Math.abs(dRight - oRight) < SNAP_THRESHOLD) {
      snappedX = oRight - draggedRect.width;
      snapLines.push({ orientation: 'vertical', position: oRight, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }
    // Right edge to left edge - gap
    if (Math.abs(dRight + GAP - oLeft) < SNAP_THRESHOLD) {
      snappedX = oLeft - GAP - draggedRect.width;
      snapLines.push({ orientation: 'vertical', position: oLeft, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }
    // Center X alignment
    if (Math.abs(dCenterX - oCenterX) < SNAP_THRESHOLD) {
      snappedX = oCenterX - draggedRect.width / 2;
      snapLines.push({ orientation: 'vertical', position: oCenterX, start: Math.min(dTop, oTop), end: Math.max(dBottom, oBottom) });
    }

    // ── Horizontal snap lines (y-axis alignment) ──

    // Top edge to top edge
    if (Math.abs(dTop - oTop) < SNAP_THRESHOLD) {
      snappedY = oTop;
      snapLines.push({ orientation: 'horizontal', position: oTop, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
    // Top edge to bottom edge + gap
    if (Math.abs(dTop - (oBottom + GAP)) < SNAP_THRESHOLD) {
      snappedY = oBottom + GAP;
      snapLines.push({ orientation: 'horizontal', position: oBottom + GAP, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
    // Bottom edge to bottom edge
    if (Math.abs(dBottom - oBottom) < SNAP_THRESHOLD) {
      snappedY = oBottom - draggedRect.height;
      snapLines.push({ orientation: 'horizontal', position: oBottom, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
    // Bottom edge to top edge - gap
    if (Math.abs(dBottom + GAP - oTop) < SNAP_THRESHOLD) {
      snappedY = oTop - GAP - draggedRect.height;
      snapLines.push({ orientation: 'horizontal', position: oTop, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
    // Center Y alignment
    if (Math.abs(dCenterY - oCenterY) < SNAP_THRESHOLD) {
      snappedY = oCenterY - draggedRect.height / 2;
      snapLines.push({ orientation: 'horizontal', position: oCenterY, start: Math.min(dLeft, oLeft), end: Math.max(dRight, oRight) });
    }
  }

  // ── Container edge snaps (with PADDING offset) ──
  // Left edge → snap to PADDING
  if (Math.abs(dLeft - PADDING) < SNAP_THRESHOLD) {
    snappedX = PADDING;
    snapLines.push({ orientation: 'vertical', position: PADDING, start: dTop, end: dBottom });
  }
  // Right edge → snap so right edge = containerWidth - PADDING
  if (Math.abs(dRight - (containerWidth - PADDING)) < SNAP_THRESHOLD) {
    snappedX = containerWidth - PADDING - draggedRect.width;
    snapLines.push({ orientation: 'vertical', position: containerWidth - PADDING, start: dTop, end: dBottom });
  }
  // Top edge → snap to PADDING
  if (Math.abs(dTop - PADDING) < SNAP_THRESHOLD) {
    snappedY = PADDING;
    snapLines.push({ orientation: 'horizontal', position: PADDING, start: dLeft, end: dRight });
  }

  // Deduplicate snap lines (keep unique positions)
  const seen = new Set<string>();
  const uniqueLines = snapLines.filter(l => {
    const key = `${l.orientation}:${Math.round(l.position)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { snappedX, snappedY, snapLines: uniqueLines };
}

// ─── Width calculation helper ─────────────────────────────────────
// Computes widget width within the available area (between PADDING edges)

function getItemWidth(size: WidgetSize, containerWidth: number): number {
  const availableWidth = containerWidth - 2 * PADDING;
  const fraction = SIZE_WIDTH_FRACTION[size] ?? 0.5;
  if (size === 'full') return availableWidth;
  // For N items per row (N = 1/fraction), there are (N-1) gaps between them
  const itemsPerRow = Math.round(1 / fraction);
  const totalGaps = (itemsPerRow - 1) * GAP;
  return Math.floor((availableWidth - totalGaps) / itemsPerRow);
}

// ─── SnapCanvas Component ─────────────────────────────────────────

interface SnapCanvasProps {
  /** Layout items with id and size (element is optional when using children) */
  items: MasonryItem[];
  /** Children with data-widget-id attributes — content is extracted and rendered in positioned containers */
  children?: ReactNode;
  /** Saved positions from persistence (id → {x, y, width}) */
  savedPositions?: Record<string, WidgetPosition>;
  /** Called when a widget position changes (after drag) */
  onPositionChange?: (id: string, position: WidgetPosition) => void;
  /** Whether drag mode is active */
  isDragMode: boolean;
  /** Measured heights of rendered items (id → height in px) */
  itemHeights: Record<string, number>;
  /** Called when an item's height changes */
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
}: SnapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Drag state
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  // Computed positions for all items
  const [positions, setPositions] = useState<Record<string, WidgetPosition>>({});

  // Build child content map from children with data-widget-id
  const childContentMap = useMemo(() => {
    const map = new Map<string, ReactNode>();
    if (!children) return map;

    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const props = child.props as Record<string, unknown>;
        const id = props['data-widget-id'] as string | undefined;
        if (id) {
          // Use the child's children as content (unwrap the marker wrapper div)
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

  // Derive a stable key from item IDs and sizes so that position recalculation
  // only happens when the layout structure changes — not when element content changes.
  const itemsKey = effectiveItems.map(i => `${i.id}:${i.size}`).join(',');

  // Calculate initial positions using skyline algorithm
  // Works in virtual coords (0,0)→(availableWidth,∞), then offsets by PADDING
  const initialPositions = useMemo(() => {
    if (containerWidth === 0) return {};

    const availableWidth = containerWidth - 2 * PADDING;
    const result: Record<string, WidgetPosition> = {};
    let skyline: SkylineSegment[] = [{ x: 0, y: 0, width: availableWidth }];

    for (const item of effectiveItems) {
      const width = getItemWidth(item.size, containerWidth);

      // If we have a saved position with valid data, use it (offset by PADDING)
      if (savedPositions && savedPositions[item.id]) {
        const saved = savedPositions[item.id];
        result[item.id] = { x: saved.x, y: saved.y, width };
      } else {
        // Calculate using skyline in virtual coords, then offset by PADDING
        const height = itemHeights[item.id] || 200;
        const pos = placeRectangle(skyline, width, availableWidth, GAP);
        result[item.id] = { x: pos.x + PADDING, y: pos.y + PADDING, width };
        skyline = addRectangleToSkyline(skyline, pos.x, pos.y, width, height);
      }
    }

    return result;
  }, [containerWidth, itemsKey, savedPositions, itemHeights, effectiveItems]);

  // Merge initial positions with any drag-in-progress overrides
  useEffect(() => {
    setPositions(initialPositions);
  }, [initialPositions]);

  // Total container height (includes PADDING at top and bottom)
  const totalHeight = useMemo(() => {
    let maxBottom = 0;
    for (const item of effectiveItems) {
      const pos = positions[item.id];
      if (pos) {
        const bottom = pos.y + (itemHeights[item.id] || 200);
        if (bottom > maxBottom) maxBottom = bottom;
      }
    }
    // Add bottom PADDING
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
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y,
      currentX: pos.x,
      currentY: pos.y,
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
    );

    setSnapLines(newSnapLines);
    setDragState(prev => prev ? { ...prev, currentX: snappedX, currentY: snappedY } : null);

    // Update position in real-time
    setPositions(prev => ({
      ...prev,
      [dragState.id]: { ...prev[dragState.id], x: snappedX, y: snappedY },
    }));
  }, [dragState, effectiveItems, positions, itemHeights, containerWidth]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState) return;

    const el = itemRefs.current.get(dragState.id);
    if (el) el.releasePointerCapture(e.pointerId);

    // Persist the final position
    const finalPos = positions[dragState.id];
    if (finalPos) {
      onPositionChange?.(dragState.id, { x: finalPos.x, y: finalPos.y, width: finalPos.width });
    }

    setDragState(null);
    setSnapLines([]);
  }, [dragState, positions, onPositionChange]);

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
              ...(isDragging ? { transition: 'none' } : { transition: 'left 0.15s ease-out, top 0.15s ease-out, width 0.2s ease-out' }),
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
