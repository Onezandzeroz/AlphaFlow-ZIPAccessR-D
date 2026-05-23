'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Settings2,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  Shield,
  TrendingUp,
  Wallet,
  Gauge,
  ArrowUpRight,
  BarChart3,
  Zap,
  FileText,
  Activity,
  Scale,
  Droplets,
  Sparkles,
  BookOpen,
  ArrowUpCircle,
  ArrowDownCircle,
  TrendingDown,
  PieChart,
} from 'lucide-react';
import { useDashboardWidgets, DASHBOARD_WIDGETS } from '@/lib/dashboard-widgets';
import { getGridSpanClasses, type WidgetSize } from '@/lib/dashboard-widget-definitions';
import { useTranslation } from '@/lib/use-translation';

// ─── Icon lookup ─────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  Wallet,
  Gauge,
  ArrowUpRight,
  BarChart3,
  Zap,
  FileText,
  Activity,
  Scale,
  Droplets,
  Sparkles,
  BookOpen,
  ArrowUpCircle,
  ArrowDownCircle,
  TrendingDown,
  PieChart,
};

// ─── Widget color palette (muted pastels) ───────────────────────
const WIDGET_COLORS: Record<string, { bg: string; border: string; activeBg: string }> = {
  'kpi-revenue':           { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800/50', activeBg: 'bg-emerald-100 dark:bg-emerald-900/50' },
  'kpi-operating-result':  { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'vat-output':            { bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-800/50', activeBg: 'bg-rose-100 dark:bg-rose-900/50' },
  'vat-input':             { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800/50', activeBg: 'bg-amber-100 dark:bg-amber-900/50' },
  'pnl-result':            { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'cash-position':         { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'comparison-revenue':    { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800/50', activeBg: 'bg-green-100 dark:bg-green-900/50' },
  'comparison-expenses':   { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800/50', activeBg: 'bg-orange-100 dark:bg-orange-900/50' },
  'comparison-net':        { bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800/50', activeBg: 'bg-sky-100 dark:bg-sky-900/50' },
  'financial-health-score':{ bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800/50', activeBg: 'bg-amber-100 dark:bg-amber-900/50' },
  'quick-actions':         { bg: 'bg-yellow-50 dark:bg-yellow-950/40', border: 'border-yellow-200 dark:border-yellow-800/50', activeBg: 'bg-yellow-100 dark:bg-yellow-900/50' },
  'cash-flow-trend':       { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800/50', activeBg: 'bg-cyan-100 dark:bg-cyan-900/50' },
  'net-result-chart':      { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800/50', activeBg: 'bg-green-100 dark:bg-green-900/50' },
  'profit-loss-waterfall': { bg: 'bg-lime-50 dark:bg-lime-950/40', border: 'border-lime-200 dark:border-lime-800/50', activeBg: 'bg-lime-100 dark:bg-lime-900/50' },
  'cash-flow-forecast':    { bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-200 dark:border-indigo-800/50', activeBg: 'bg-indigo-100 dark:bg-indigo-900/50' },
  'revenue-expenses-chart':{ bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800/50', activeBg: 'bg-cyan-100 dark:bg-cyan-900/50' },
  'expense-analysis':      { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-800/50', activeBg: 'bg-purple-100 dark:bg-purple-900/50' },
  'budget-vs-actual':      { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', border: 'border-fuchsia-200 dark:border-fuchsia-800/50', activeBg: 'bg-fuchsia-100 dark:bg-fuchsia-900/50' },
  'invoice-overview':      { bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800/50', activeBg: 'bg-sky-100 dark:bg-sky-900/50' },
  'recent-journal':        { bg: 'bg-slate-50 dark:bg-slate-950/40', border: 'border-slate-200 dark:border-slate-800/50', activeBg: 'bg-slate-100 dark:bg-slate-900/50' },
  'activity-feed':         { bg: 'bg-stone-50 dark:bg-stone-950/40', border: 'border-stone-200 dark:border-stone-800/50', activeBg: 'bg-stone-100 dark:bg-stone-900/50' },
  'active-accounts':       { bg: 'bg-stone-50 dark:bg-stone-950/40', border: 'border-stone-200 dark:border-stone-800/50', activeBg: 'bg-stone-100 dark:bg-stone-900/50' },
  'saft-export':           { bg: 'bg-gray-50 dark:bg-gray-950/40', border: 'border-gray-200 dark:border-gray-800/50', activeBg: 'bg-gray-100 dark:bg-gray-900/50' },
  'ai-categorization':     { bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-800/50', activeBg: 'bg-violet-100 dark:bg-violet-900/50' },
  'financial-health-detail': { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
};

function getWidgetColor(id: string) {
  return WIDGET_COLORS[id] || { bg: 'bg-gray-50 dark:bg-gray-950/40', border: 'border-gray-200 dark:border-gray-800/50', activeBg: 'bg-gray-100 dark:bg-gray-900/50' };
}

// ─── Size label helpers ──────────────────────────────────────────
function getSizeLabel(size: WidgetSize, language: string) {
  switch (size) {
    case 'full':    return language === 'da' ? 'Fuld' : 'Full';
    case 'half':    return language === 'da' ? 'Halv' : '½';
    case 'third':   return '⅓';
    case 'quarter': return '¼';
    default:        return size;
  }
}

// ─── Height for dialog preview blocks ────────────────────────────
function getPreviewMinHeight(size: WidgetSize): string {
  switch (size) {
    case 'full':    return '48px';
    case 'half':    return '64px';
    case 'third':   return '64px';
    case 'quarter': return '64px';
    default:        return '64px';
  }
}

// ─── Props ──────────────────────────────────────────────────────
interface WidgetLayoutEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ──────────────────────────────────────────────────
export function WidgetLayoutEditor({ open, onOpenChange }: WidgetLayoutEditorProps) {
  const { language } = useTranslation();
  // Subscribe to widget store state via Zustand selectors (shared single source of truth)
  const visibilityMap = useDashboardWidgets((s) => s.visibilityMap);
  const widgetOrder = useDashboardWidgets((s) => s.widgetOrder);
  const widgetSizes = useDashboardWidgets((s) => s.widgetSizes);
  const toggleWidget = useDashboardWidgets((s) => s.toggleWidget);
  const resetWidgets = useDashboardWidgets((s) => s.resetWidgets);
  const isAppOwner = useDashboardWidgets((s) => s.isAppOwner);
  const setWidgetOrderDirect = useDashboardWidgets((s) => s.setWidgetOrderDirect);
  const clearWidgetPositions = useDashboardWidgets((s) => s.clearWidgetPositions);
  const isWidgetVisible = (id: string) => visibilityMap[id] ?? true;

  // Drag state — tracks a drop insertion index rather than a single target ID
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build sorted widget list based on store order
  const sortedWidgets = useMemo(() =>
    [...DASHBOARD_WIDGETS].sort((a, b) => {
      const aIdx = widgetOrder.indexOf(a.id);
      const bIdx = widgetOrder.indexOf(b.id);
      return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999);
    })
  , [widgetOrder]);

  // Cleanup helper — restores opacity, clears drag state
  const cleanupEditor = useCallback(() => {
    if (dragId) {
      const el = containerRef.current?.querySelector(
        `[data-widget-editor-id="${dragId}"]`
      );
      if (el instanceof HTMLElement) el.style.opacity = '1';
    }
    setDragId(null);
    setDropInsertIndex(null);
    dropIndexRef.current = null;
  }, [dragId]);

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }
    setDragId(widgetId);
    setDropInsertIndex(null);
  }, []);

  // Compute insert index based on cursor position relative to widget center
  const computeEditorInsertIndex = useCallback((
    e: React.DragEvent,
    targetWidgetId: string,
  ): number => {
    const targetEl = e.currentTarget as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const x = e.clientX;
    const midX = rect.left + rect.width / 2;
    const isLeftHalf = x < midX;
    const position = isLeftHalf ? 'before' : 'after';

    const targetIdx = sortedWidgets.findIndex(w => w.id === targetWidgetId);
    if (targetIdx < 0) return sortedWidgets.length;
    return position === 'before' ? targetIdx : targetIdx + 1;
  }, [sortedWidgets]);

  const handleDragOver = useCallback((e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragId || widgetId === dragId) return;

    const idx = computeEditorInsertIndex(e, widgetId);
    if (dropIndexRef.current !== idx) {
      dropIndexRef.current = idx;
      setDropInsertIndex(idx);
    }
  }, [dragId, computeEditorInsertIndex]);

  const handleDrop = useCallback((e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === widgetId) {
      cleanupEditor();
      return;
    }

    // Build new order: remove source, insert at computed index
    const newOrder = sortedWidgets
      .filter(w => w.id !== sourceId)
      .map(w => w.id);
    const insertIdx = dropIndexRef.current ?? newOrder.length;
    const clampedIdx = Math.min(Math.max(insertIdx, 0), newOrder.length);
    newOrder.splice(clampedIdx, 0, sourceId);

    setWidgetOrderDirect(newOrder);
    clearWidgetPositions();
    cleanupEditor();
  }, [sortedWidgets, setWidgetOrderDirect, clearWidgetPositions, cleanupEditor]);

  const handleDragEnd = useCallback(() => {
    cleanupEditor();
  }, [cleanupEditor]);

  // Container drop (empty area at the end)
  const handleContainerDragOver = useCallback((e: React.DragEvent) => {
    if ((e.target as HTMLElement) !== containerRef.current) return;
    e.preventDefault();
    if (!dragId) return;
    const idx = sortedWidgets.length;
    if (dropIndexRef.current !== idx) {
      dropIndexRef.current = idx;
      setDropInsertIndex(idx);
    }
  }, [dragId, sortedWidgets]);

  const handleContainerDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || !dragId) { cleanupEditor(); return; }
    const newOrder = sortedWidgets.filter(w => w.id !== sourceId).map(w => w.id);
    newOrder.push(sourceId);
    setWidgetOrderDirect(newOrder);
    clearWidgetPositions();
    cleanupEditor();
  }, [dragId, sortedWidgets, setWidgetOrderDirect, clearWidgetPositions, cleanupEditor]);

  const handleReset = useCallback(() => {
    resetWidgets();
  }, [resetWidgets]);

  // Build visual order with placeholder during drag
  const visualEditorWidgets = useMemo(() => {
    if (!dragId || dropInsertIndex === null) return sortedWidgets;
    const withoutDrag = sortedWidgets.filter(w => w.id !== dragId);
    const idx = Math.min(Math.max(dropInsertIndex, 0), withoutDrag.length);
    const result = [...withoutDrag];
    result.splice(idx, 0, { id: '__placeholder__', labelDa: '', labelEn: '', icon: '', defaultVisible: false, defaultSize: 'half', section: 'details' });
    return result;
  }, [sortedWidgets, dragId, dropInsertIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5 text-[#0d9488]" />
              {language === 'da' ? 'Tilpas kontrolpanel' : 'Customize Dashboard'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400 text-sm">
              {language === 'da'
                ? 'Træk og slip for at omarrangere widgets. Klik øjet for at vise/skjule.'
                : 'Drag and drop to rearrange. Click eye to show/hide.'}
            </DialogDescription>
          </DialogHeader>

          {/* AppOwner notice */}
          {isAppOwner && (
            <div className="flex items-start gap-2.5 p-3 mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                {language === 'da'
                  ? 'Dine valg her gælder som standard for alle nye virksomheder.'
                  : 'Your choices here become the default for all new companies.'}
              </p>
            </div>
          )}
        </div>

        {/* Miniature dashboard preview — uses the same flex-wrap layout as the real dashboard */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Dashboard frame */}
          <div className="relative rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4 min-h-[300px]">
            {/* Frame label */}
            <div className="absolute -top-3 left-4 px-2 bg-white dark:bg-[#1a1f1e] text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {language === 'da' ? 'Live forhåndsvisning' : 'Live Preview'}
            </div>

            {/* Widget blocks — same flex-wrap layout as the real MasonryLayout */}
            <div
              ref={containerRef}
              className="flex flex-wrap gap-3"
              onDragOver={handleContainerDragOver}
              onDrop={handleContainerDrop}
            >
              {visualEditorWidgets.map((widget) => {
                // ── Drop placeholder ──
                if (widget.id === '__placeholder__') {
                  const draggedSize = sortedWidgets.find(w => w.id === dragId)?.defaultSize ?? 'half';
                  return (
                    <div
                      key="__placeholder__"
                      className={`${getGridSpanClasses(draggedSize)} border-2 border-dashed border-[#0d9488]/50 rounded-lg bg-[#0d9488]/5 dark:bg-[#0d9488]/10 flex items-center justify-center transition-all duration-200 animate-pulse`}
                      style={{ minHeight: '48px' }}
                    >
                      <span className="text-[10px] text-[#0d9488]/60 dark:text-[#2dd4bf]/60 font-medium">Drop here</span>
                    </div>
                  );
                }

                const size = widgetSizes[widget.id] || widget.defaultSize;
                const sizeClasses = getGridSpanClasses(size);
                const color = getWidgetColor(widget.id);
                const visible = isWidgetVisible(widget.id);
                const isDragging = dragId === widget.id;
                const IconComp = ICON_MAP[widget.icon];
                const isNarrow = size === 'third' || size === 'quarter';

                return (
                  <div
                    key={widget.id}
                    data-widget-editor-id={widget.id}
                    draggable={visible}
                    onDragStart={(e) => handleDragStart(e, widget.id)}
                    onDragOver={(e) => handleDragOver(e, widget.id)}
                    onDrop={(e) => handleDrop(e, widget.id)}
                    onDragEnd={handleDragEnd}
                    className={`
                      ${sizeClasses}
                      relative rounded-lg border-2 transition-all duration-200 select-none
                      ${visible ? color.border : 'border-dashed border-gray-300 dark:border-gray-600'}
                      ${isDragging ? 'opacity-40 scale-95 pointer-events-none' : 'opacity-100'}
                      ${!visible ? 'opacity-50' : ''}
                      ${visible ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                    `}
                    style={{ minHeight: getPreviewMinHeight(size) }}
                  >
                    {/* Inner content */}
                    <div className={`
                      absolute inset-0 rounded-md flex overflow-hidden
                      ${visible ? color.bg : 'bg-gray-100/50 dark:bg-gray-800/30'}
                      ${isNarrow ? 'flex-col items-center justify-center gap-1 px-2 py-2' : 'flex-row items-center gap-2 px-3'}
                    `}>
                      {/* Drag handle */}
                      <div className={`
                        shrink-0 flex items-center justify-center
                        ${visible ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-700'}
                        ${isNarrow ? 'absolute top-1.5 left-1.5' : ''}
                      `}>
                        <GripVertical className={isNarrow ? 'h-3 w-3' : 'h-4 w-4'} />
                      </div>

                      {/* Icon */}
                      <div className={`
                        shrink-0 rounded-lg flex items-center justify-center
                        ${isNarrow ? 'h-7 w-7' : 'h-8 w-8'}
                        ${visible ? color.activeBg : 'bg-gray-200/50 dark:bg-gray-700/50'}
                      `}>
                        {IconComp ? (
                          <IconComp className={`h-4 w-4 ${visible ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`} />
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${visible ? 'bg-gray-400 dark:bg-gray-500' : 'bg-gray-300 dark:text-gray-700'}`} />
                        )}
                      </div>

                      {/* Widget info */}
                      <div className={`flex-1 min-w-0 ${isNarrow ? 'text-center' : ''}`}>
                        <p className={`
                          font-semibold truncate
                          ${isNarrow ? 'text-[10px] leading-tight' : 'text-xs'}
                          ${visible ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600 line-through'}
                        `}>
                          {language === 'da' ? widget.labelDa : widget.labelEn}
                        </p>
                        {/* Size sublabel */}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                          <span className="opacity-60">{getSizeLabel(size, language)}</span>
                        </p>
                      </div>

                      {/* Visibility toggle */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleWidget(widget.id); clearWidgetPositions(); }}
                        className={`
                          shrink-0 rounded-md flex items-center justify-center transition-all
                          ${isNarrow ? 'absolute top-1.5 right-1.5 h-5 w-5' : 'h-7 w-7'}
                          ${visible
                            ? 'text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/10 dark:hover:bg-[#2dd4bf]/10'
                            : 'text-gray-300 dark:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }
                        `}
                        aria-label={visible
                          ? (language === 'da' ? 'Skjul widget' : 'Hide widget')
                          : (language === 'da' ? 'Vis widget' : 'Show widget')
                        }
                      >
                        {visible ? <Eye className={isNarrow ? 'h-3 w-3' : 'h-4 w-4'} /> : <EyeOff className={isNarrow ? 'h-3 w-3' : 'h-4 w-4'} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer — minimal: only reset button */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-[#0d9488] dark:hover:text-[#2dd4bf] gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {language === 'da' ? 'Nulstil til standard' : 'Reset to defaults'}
          </Button>

          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {language === 'da'
              ? 'Ændringer anvendes direkte på kontrolpanelet'
              : 'Changes are applied directly to the dashboard'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
