'use client';

import React, { useState, useCallback, useRef, ReactNode, useMemo } from 'react';
import { WidgetSize, getGridSpanClasses } from '@/lib/dashboard-widget-definitions';

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

// ─── Drop slot position relative to the target widget ─────────

type DropPosition = 'before' | 'after';

interface DropSlot {
  // Index in the effectiveItems array where the dragged widget would be inserted.
  // This accounts for the dragged item being removed from the list.
  insertIndex: number;
  // The size class of the dragged widget (for rendering the placeholder).
  draggedSize: WidgetSize;
}

// ─── MasonryLayout Component ──────────────────────────────────────
//
// Flex-wrap flow layout with drag-and-drop reordering.
//
// Features:
//   • Drop placeholder: a dashed box sized to the dragged widget shows
//     exactly where it will land, between other widgets.
//   • Before/after detection: cursor on left/top half → insert before;
//     right/bottom half → insert after the hovered widget.
//   • Container drop: dropping on empty area at the end appends.
//   • Smooth CSS transitions for rearranging widgets.
//   • Never overlaps, never renders off-screen (flex-wrap guarantee).

interface MasonryLayoutProps {
  items: MasonryItem[];
  children?: ReactNode;
  isDragMode: boolean;
  itemHeights?: Record<string, number>; // kept for backward compat
  onItemHeightChange?: (id: string, height: number) => void;
  className?: string;
  onReorder?: (draggedId: string, targetIndex: number) => void;
}

export function MasonryLayout({
  items,
  children,
  isDragMode,
  className = '',
  onReorder,
}: MasonryLayoutProps) {
  // ── Drag state ────────────────────────────────────────────────
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<DropSlot | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build child content map from children with data-widget-id.
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

  // Effective items = what's currently visible and ordered.
  const effectiveItems = useMemo(() => items, [items]);

  // ── Compute the visual order while a drag is in progress ────────
  //
  // When dragging, we remove the dragged item from the visual list and
  // insert a placeholder at the computed drop index. This gives the user
  // a live preview of the final arrangement.
  const visualItems = useMemo(() => {
    if (!draggedId || !dropSlot) return effectiveItems;

    // Remove the dragged item
    const withoutDragged = effectiveItems.filter(i => i.id !== draggedId);

    // Clamp insert index to valid range
    const idx = Math.min(Math.max(dropSlot.insertIndex, 0), withoutDragged.length);

    // Insert a placeholder at the insertion point
    const result = [...withoutDragged];
    result.splice(idx, 0, {
      id: '__drop_placeholder__',
      size: dropSlot.draggedSize,
    } as MasonryItem);

    return result;
  }, [effectiveItems, draggedId, dropSlot]);

  // ── Determine insert index from a DragEvent over a widget ───────
  const computeInsertIndex = useCallback((
    e: React.DragEvent,
    targetWidgetId: string,
  ): number => {
    const targetEl = e.currentTarget as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    // Determine "before" or "after" based on cursor position:
    //   - horizontal midpoint for left/right placement
    //   - vertical midpoint for above/below (different rows)
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;

    const isLeftHalf = x < midX;
    const isTopHalf = y < midY;

    // Use horizontal position as primary signal (left = before, right = after).
    // If the cursor is clearly above the widget (different row context), treat as "before".
    const position: DropPosition = (isLeftHalf || isTopHalf) ? 'before' : 'after';

    // Index in the list WITHOUT the dragged item
    const withoutDragged = effectiveItems.filter(i => i.id !== draggedId);
    const targetIdx = withoutDragged.findIndex(i => i.id === targetWidgetId);

    if (targetIdx < 0) return withoutDragged.length;
    return position === 'before' ? targetIdx : targetIdx + 1;
  }, [effectiveItems, draggedId]);

  // ── HTML5 Drag-and-Drop handlers ────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);

    // Make the drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }

    setDraggedId(widgetId);
    setDropSlot(null);
  }, []);

  const handleDragOverWidget = useCallback((e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedId || widgetId === draggedId) return;

    const insertIndex = computeInsertIndex(e, widgetId);

    setDropSlot(prev => {
      if (prev && prev.insertIndex === insertIndex) return prev;
      return {
        insertIndex,
        draggedSize: effectiveItems.find(i => i.id === draggedId)?.size ?? 'half',
      };
    });
  }, [draggedId, computeInsertIndex, effectiveItems]);

  const handleDragOverContainer = useCallback((e: React.DragEvent) => {
    // Only handle when dragging over the container itself (not a child)
    if ((e.target as HTMLElement) !== containerRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedId) return;

    // Append to the end
    const withoutDragged = effectiveItems.filter(i => i.id !== draggedId);
    setDropSlot(prev => {
      if (prev && prev.insertIndex === withoutDragged.length) return prev;
      return {
        insertIndex: withoutDragged.length,
        draggedSize: effectiveItems.find(i => i.id === draggedId)?.size ?? 'half',
      };
    });
  }, [draggedId, effectiveItems]);

  const cleanup = useCallback(() => {
    // Restore opacity on the dragged element
    if (draggedId) {
      const el = containerRef.current?.querySelector(
        `[data-widget-id="${draggedId}"]`
      );
      if (el instanceof HTMLElement) {
        el.style.opacity = '1';
      }
    }
    setDraggedId(null);
    setDropSlot(null);
  }, [draggedId]);

  const handleDropOnWidget = useCallback((e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || !onReorder || !dropSlot) {
      cleanup();
      return;
    }

    onReorder(sourceId, dropSlot.insertIndex);
    cleanup();
  }, [onReorder, dropSlot, cleanup]);

  const handleDropOnContainer = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || !onReorder || !dropSlot) {
      cleanup();
      return;
    }

    onReorder(sourceId, dropSlot.insertIndex);
    cleanup();
  }, [onReorder, dropSlot, cleanup]);

  const handleDragEnd = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // ── Render ──────────────────────────────────────────────────────

  const placeholderSizeClasses = dropSlot ? getGridSpanClasses(dropSlot.draggedSize) : '';

  return (
    <div
      ref={containerRef}
      className={`w-full flex flex-wrap gap-3 p-3 sm:p-4 ${className}`}
      onDragOver={isDragMode ? handleDragOverContainer : undefined}
      onDrop={isDragMode ? handleDropOnContainer : undefined}
    >
      {visualItems.map((item) => {
        // ── Placeholder slot ──
        if (item.id === '__drop_placeholder__') {
          return (
            <div
              key="__drop_placeholder__"
              className={`
                ${placeholderSizeClasses}
                border-2 border-dashed border-[#0d9488]/50 rounded-xl
                bg-[#0d9488]/5 dark:bg-[#0d9488]/10
                flex items-center justify-center
                transition-all duration-200 ease-out
                min-h-[120px]
                animate-pulse
              `}
            >
              <div className="flex flex-col items-center gap-2 text-[#0d9488]/60 dark:text-[#2dd4bf]/60">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="text-[10px] font-medium tracking-wide uppercase">
                  Drop here
                </span>
              </div>
            </div>
          );
        }

        const isDragging = draggedId === item.id;
        const content = childContentMap.get(item.id) ?? item.element;
        const sizeClasses = getGridSpanClasses(item.size);

        return (
          <div
            key={item.id}
            data-widget-id={item.id}
            draggable={isDragMode}
            onDragStart={isDragMode ? (e) => handleDragStart(e, item.id) : undefined}
            onDragOver={isDragMode ? (e) => handleDragOverWidget(e, item.id) : undefined}
            onDrop={isDragMode ? (e) => handleDropOnWidget(e, item.id) : undefined}
            onDragEnd={isDragMode ? handleDragEnd : undefined}
            className={`
              ${sizeClasses}
              ${isDragMode ? 'cursor-grab active:cursor-grabbing' : ''}
              ${isDragging
                ? 'opacity-40 scale-[0.97] rounded-xl'
                : 'transition-all duration-200 ease-out'
              }
              ${isDragging ? 'pointer-events-none' : ''}
              relative
            `}
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
  // Approximate — actual width is determined by CSS flex-wrap
  const fractions: Record<WidgetSize, number> = {
    full: 1,
    half: 0.5,
    third: 1 / 3,
    quarter: 0.25,
  };
  const gap = 12; // gap-3 = 12px
  const padding = 16; // p-4 on sm+
  const available = containerWidth - 2 * padding;
  const fraction = fractions[size] ?? 0.5;
  if (size === 'full') return available;
  const perRow = Math.round(1 / fraction);
  const totalGaps = (perRow - 1) * gap;
  return Math.floor((available - totalGaps) / perRow);
}
