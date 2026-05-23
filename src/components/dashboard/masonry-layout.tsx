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

// ─── MasonryLayout Component ──────────────────────────────────────
//
// Flex-wrap flow layout: widgets are placed left-to-right in rows,
// wrapping to the next row when they don't fit. Like desktop icons
// in "auto-arrange" mode. CSS flex-wrap ensures:
//   • Consistent gaps between widgets (never overlap)
//   • Widgets never go off-screen
//   • Natural flow — items snap to their grid position
//   • Responsive — reflows when container resizes

interface MasonryLayoutProps {
  items: MasonryItem[];
  children?: ReactNode;
  isDragMode: boolean;
  itemHeights?: Record<string, number>; // optional — kept for backward compat, not used in flex-wrap layout
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
  // Drag state for reordering
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragOverRef = useRef<string | null>(null);

  // Build child content map from children with data-widget-id.
  // This map is used purely for CONTENT LOOKUP — it does NOT gate
  // whether a widget renders. The `items` array (already filtered
  // to only visible widgets by the parent) is the single source of
  // truth for what renders. If a child happens to be missing from
  // the map (e.g. due to React scheduling), we simply render the
  // item's .element fallback or an empty placeholder.
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

  // items are already pre-filtered to visible widgets by the parent
  // (orderedVisibleWidgets). We use them directly — no childContentMap gate.
  const effectiveItems = useMemo(() => {
    return items;
  }, [items]);

  // ── HTML5 Drag-and-Drop handlers ────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    setDraggedId(widgetId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverRef.current !== widgetId) {
      dragOverRef.current = widgetId;
      setDropTargetId(widgetId);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId || !onReorder) {
      setDraggedId(null);
      setDropTargetId(null);
      dragOverRef.current = null;
      return;
    }

    // Find the target index in effectiveItems
    const targetIdx = effectiveItems.findIndex(item => item.id === targetId);
    if (targetIdx >= 0) {
      onReorder(sourceId, targetIdx);
    }

    setDraggedId(null);
    setDropTargetId(null);
    dragOverRef.current = null;
  }, [effectiveItems, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
    dragOverRef.current = null;
  }, []);

  return (
    <div className={`w-full flex flex-wrap gap-3 p-3 sm:p-4 ${className}`}>
      {effectiveItems.map((item) => {
        const isDragging = draggedId === item.id;
        const isDropTarget = dropTargetId === item.id && draggedId !== item.id;
        // Look up content from children, fall back to item.element
        const content = childContentMap.get(item.id) ?? item.element;
        const sizeClasses = getGridSpanClasses(item.size);

        return (
          <div
            key={item.id}
            data-widget-id={item.id}
            draggable={isDragMode}
            onDragStart={isDragMode ? (e) => handleDragStart(e, item.id) : undefined}
            onDragOver={isDragMode ? (e) => handleDragOver(e, item.id) : undefined}
            onDrop={isDragMode ? (e) => handleDrop(e, item.id) : undefined}
            onDragEnd={isDragMode ? handleDragEnd : undefined}
            className={`
              ${sizeClasses}
              ${isDragMode ? 'cursor-grab active:cursor-grabbing' : ''}
              ${isDragging ? 'opacity-40 scale-95 transition-all duration-200' : 'transition-all duration-200'}
              ${isDropTarget ? 'ring-2 ring-teal-400 ring-offset-2 rounded-xl' : ''}
              relative
            `}
          >
            {/* Drop indicator line above */}
            {isDropTarget && !isDragging && (
              <div className="absolute -top-3 left-0 right-0 h-[3px] bg-teal-400 rounded-full shadow-[0_0_6px_rgba(13,148,136,0.5)] z-10" />
            )}
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
