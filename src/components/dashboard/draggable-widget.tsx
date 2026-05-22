'use client';

import { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface DraggableWidgetProps {
  id: string;
  children: ReactNode;
  /** Whether drag mode is active (shows drag handles) */
  isDragMode: boolean;
  /** Additional CSS classes (e.g. width classes from getWidgetSpanClass) */
  className?: string;
  /** Flex order value for visual positioning */
  order?: number;
}

export function DraggableWidget({ id, children, isDragMode, className, order }: DraggableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    order: order ?? 999,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${className ?? ''} ${isDragMode ? 'ring-2 ring-teal-400/30 ring-offset-2 ring-offset-transparent rounded-xl' : ''} ${isDragging ? 'shadow-2xl scale-[1.02]' : ''} transition-shadow duration-200`}
    >
      {/* Drag handle overlay - appears in drag mode */}
      {isDragMode && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-50 cursor-grab active:cursor-grabbing bg-teal-500 hover:bg-teal-600 text-white rounded-full p-1.5 shadow-lg transition-all duration-150 hover:scale-110"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}
      {children}
    </div>
  );
}
