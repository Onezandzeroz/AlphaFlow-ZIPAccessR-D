'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/use-translation';
import {
  useDashboardWidgets,
  DASHBOARD_WIDGETS,
} from '@/lib/dashboard-widgets';
import {
  GripVertical,
  Columns2,
  Columns3,
  Eye,
  EyeOff,
  RotateCcw,
  LayoutGrid,
  Shield,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface WidgetLayoutEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Section color helper (inline styles) ─────────────────────
function getSectionStyle(section: string): {
  backgroundColor: string;
  borderColor: string;
  color: string;
  iconBg: string;
} {
  switch (section) {
    case 'indicators':
      return {
        backgroundColor: '#f0fdfa',
        borderColor: '#99f6e4',
        color: '#0f766e',
        iconBg: '#ccfbf1',
      };
    case 'charts':
      return {
        backgroundColor: '#eef2ff',
        borderColor: '#c7d2fe',
        color: '#4338ca',
        iconBg: '#e0e7ff',
      };
    case 'details':
      return {
        backgroundColor: '#fff7ed',
        borderColor: '#fed7aa',
        color: '#c2410c',
        iconBg: '#ffedd5',
      };
    default:
      return {
        backgroundColor: '#f9fafb',
        borderColor: '#e5e7eb',
        color: '#374151',
        iconBg: '#f3f4f6',
      };
  }
}

// ─── Dynamic icon component ───────────────────────────────────

function WidgetIcon({ iconName, className }: { iconName: string; className?: string }) {
  const IconComponent = (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
  if (!IconComponent) return <LayoutGrid className={className} />;
  return <IconComponent className={className} />;
}

// ─── Sortable Widget Block ────────────────────────────────────

function SortableWidgetBlock({
  widgetId,
  visible,
  size,
  onToggleVisibility,
  onToggleSize,
  language,
}: {
  widgetId: string;
  visible: boolean;
  size: 'full' | 'half';
  onToggleVisibility: () => void;
  onToggleSize: () => void;
  language: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: widgetId,
    strategy: verticalListSortingStrategy,
  });

  const widget = DASHBOARD_WIDGETS.find((w) => w.id === widgetId);
  if (!widget) return null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : visible ? 1 : 0.55,
  };

  const sectionStyle = getSectionStyle(widget.section);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border-2 transition-all duration-200 ${
        size === 'full' ? 'col-span-2' : 'col-span-1'
      } ${
        visible
          ? 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
          : 'border-dashed border-gray-300 dark:border-gray-600'
      }`}
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors"
        style={{ backgroundColor: visible ? sectionStyle.backgroundColor : 'transparent' }}
      >
        {/* Drag handle */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        </button>

        {/* Icon */}
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: sectionStyle.iconBg }}
        >
          <WidgetIcon
            iconName={widget.icon}
            className="h-3.5 w-3.5"
            style={{ color: sectionStyle.color } as any}
          />
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold truncate ${
            visible
              ? 'text-gray-800 dark:text-gray-200'
              : 'text-gray-400 dark:text-gray-500'
          }`}>
            {language === 'da' ? widget.labelDa : widget.labelEn}
          </p>
          {!visible && (
            <p className="text-[10px] text-gray-400 dark:text-gray-600">
              {language === 'da' ? 'Skjult' : 'Hidden'}
            </p>
          )}
        </div>

        {/* Size indicator */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleSize}
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label={
              size === 'full'
                ? (language === 'da' ? 'Skift til halv bredde' : 'Switch to half width')
                : (language === 'da' ? 'Skift til fuld bredde' : 'Switch to full width')
            }
            title={
              size === 'full'
                ? (language === 'da' ? 'Fuld bredde – klik for halv' : 'Full width – click for half')
                : (language === 'da' ? 'Halv bredde – klik for fuld' : 'Half width – click for full')
            }
          >
            {size === 'full' ? (
              <Columns2 className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            ) : (
              <Columns3 className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            )}
          </button>

          {/* Visibility toggle */}
          <button
            onClick={onToggleVisibility}
            className={`p-1.5 rounded-md transition-colors ${
              visible
                ? 'hover:bg-black/5 dark:hover:bg-white/10'
                : 'hover:bg-green-50 dark:hover:bg-green-900/30'
            }`}
            aria-label={
              visible
                ? (language === 'da' ? 'Skjul widget' : 'Hide widget')
                : (language === 'da' ? 'Vis widget' : 'Show widget')
            }
          >
            {visible ? (
              <Eye className="h-3.5 w-3.5 text-[#0d9488] dark:text-[#2dd4bf]" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Drag Overlay Block ───────────────────────────────────────

function DragOverlayBlock({
  widgetId,
  size,
  language,
}: {
  widgetId: string;
  size: 'full' | 'half';
  language: string;
}) {
  const widget = DASHBOARD_WIDGETS.find((w) => w.id === widgetId);
  if (!widget) return null;

  const sectionStyle = getSectionStyle(widget.section);

  return (
    <div
      className={`rounded-xl border-2 shadow-xl ${
        size === 'full' ? 'col-span-2' : 'col-span-1'
      }`}
      style={{
        backgroundColor: sectionStyle.backgroundColor,
        borderColor: '#0d9488',
        boxShadow: '0 8px 30px rgba(13, 148, 136, 0.25)',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg">
        <div className="p-1 rounded-md">
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: sectionStyle.iconBg }}
        >
          <WidgetIcon iconName={widget.icon} className="h-3.5 w-3.5" />
        </div>
        <p className="text-xs font-semibold text-gray-800 truncate">
          {language === 'da' ? widget.labelDa : widget.labelEn}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function WidgetLayoutEditor({ open, onOpenChange }: WidgetLayoutEditorProps) {
  const { language } = useTranslation();
  const {
    isWidgetVisible,
    toggleWidget,
    resetWidgets,
    isAppOwner,
    widgetOrder,
    widgetSizes,
    setWidgetSize,
    reorderWidgets,
  } = useDashboardWidgets();

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor),
  );

  // Sort widgets by current order
  const orderedWidgets = useMemo(() => {
    return widgetOrder
      .map((id) => DASHBOARD_WIDGETS.find((w) => w.id === id))
      .filter(Boolean) as typeof DASHBOARD_WIDGETS;
  }, [widgetOrder]);

  const visibleWidgets = useMemo(
    () => orderedWidgets.filter((w) => isWidgetVisible(w.id)),
    [orderedWidgets, isWidgetVisible],
  );

  const hiddenWidgets = useMemo(
    () => orderedWidgets.filter((w) => !isWidgetVisible(w.id)),
    [orderedWidgets, isWidgetVisible],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (over && active.id !== over.id) {
        reorderWidgets(active.id as string, over.id as string);
      }
    },
    [reorderWidgets],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeWidget = activeId
    ? DASHBOARD_WIDGETS.find((w) => w.id === activeId)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-[#0d9488]" />
            {language === 'da'
              ? 'Tilpas kontrolpanel-layout'
              : 'Customize Dashboard Layout'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {language === 'da'
              ? 'Træk og slip for at omarrangere. Skift størrelse og synlighed for hver widget.'
              : 'Drag and drop to reorder. Toggle size and visibility for each widget.'}
          </DialogDescription>
        </DialogHeader>

        {/* AppOwner notice */}
        {isAppOwner && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              {language === 'da'
                ? 'Dine valg her gælder som standard for alle nye virksomheder.'
                : 'Your choices here become the default for all new companies.'}
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-1">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#f0fdfa', border: '1px solid #99f6e4' }} />
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Indikatorer' : 'Indicators'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe' }} />
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Diagrammer' : 'Charts'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }} />
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Detaljer' : 'Details'}
            </span>
          </div>
        </div>

        {/* Grid preview header */}
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            {language === 'da' ? 'Widget-layout' : 'Widget Layout'}
          </h3>
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <Columns2 className="h-3 w-3" />
            <span>{language === 'da' ? '2-kolonne' : '2-column'}</span>
          </div>
        </div>

        {/* Draggable grid */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={widgetOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-2">
              {visibleWidgets.map((widget) => (
                <SortableWidgetBlock
                  key={widget.id}
                  widgetId={widget.id}
                  visible={true}
                  size={widgetSizes[widget.id] || widget.defaultSize}
                  onToggleVisibility={() => toggleWidget(widget.id)}
                  onToggleSize={() =>
                    setWidgetSize(
                      widget.id,
                      (widgetSizes[widget.id] || widget.defaultSize) === 'full'
                        ? 'half'
                        : 'full',
                    )
                  }
                  language={language}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={{
            duration: 200,
            easing: 'ease',
          }}>
            {activeId ? (
              <DragOverlayBlock
                widgetId={activeId as string}
                size={
                  widgetSizes[activeId as string] ||
                  'full'
                }
                language={language}
              />
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Hidden widgets section */}
        {hiddenWidgets.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 px-1 mb-2">
              <EyeOff className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {language === 'da'
                  ? `Skjulte widgets (${hiddenWidgets.length})`
                  : `Hidden Widgets (${hiddenWidgets.length})`}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 opacity-60">
              {hiddenWidgets.map((widget) => (
                <SortableWidgetBlock
                  key={widget.id}
                  widgetId={widget.id}
                  visible={false}
                  size={widgetSizes[widget.id] || widget.defaultSize}
                  onToggleVisibility={() => toggleWidget(widget.id)}
                  onToggleSize={() =>
                    setWidgetSize(
                      widget.id,
                      (widgetSizes[widget.id] || widget.defaultSize) === 'full'
                        ? 'half'
                        : 'full',
                    )
                  }
                  language={language}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
          <button
            type="button"
            onClick={resetWidgets}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {language === 'da' ? 'Nulstil til standard' : 'Reset to Defaults'}
          </button>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-lg px-5"
          >
            {language === 'da' ? 'Gem layout' : 'Save Layout'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
