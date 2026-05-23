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
import { type WidgetSize } from '@/lib/dashboard-widget-definitions';
import { useTranslation } from '@/lib/use-translation';
import { COLUMN_COUNT, DEFAULT_COLUMNS, clampColumn } from './masonry-layout';

// ─── Icon lookup ─────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, Wallet, Gauge, ArrowUpRight, BarChart3, Zap, FileText,
  Activity, Scale, Droplets, Sparkles, BookOpen, ArrowUpCircle,
  ArrowDownCircle, TrendingDown, PieChart,
};

// ─── Widget color palette (muted pastels) ───────────────────────
const WIDGET_COLORS: Record<string, { bg: string; border: string; activeBg: string }> = {
  'kpi-revenue':            { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800/50', activeBg: 'bg-emerald-100 dark:bg-emerald-900/50' },
  'kpi-operating-result':   { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'vat-output':             { bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-800/50', activeBg: 'bg-rose-100 dark:bg-rose-900/50' },
  'vat-input':              { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800/50', activeBg: 'bg-amber-100 dark:bg-amber-900/50' },
  'pnl-result':             { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'cash-position':          { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'comparison-revenue':     { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800/50', activeBg: 'bg-green-100 dark:bg-green-900/50' },
  'comparison-expenses':    { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800/50', activeBg: 'bg-orange-100 dark:bg-orange-900/50' },
  'comparison-net':         { bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800/50', activeBg: 'bg-sky-100 dark:bg-sky-900/50' },
  'financial-health-score': { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800/50', activeBg: 'bg-amber-100 dark:bg-amber-900/50' },
  'quick-actions':          { bg: 'bg-yellow-50 dark:bg-yellow-950/40', border: 'border-yellow-200 dark:border-yellow-800/50', activeBg: 'bg-yellow-100 dark:bg-yellow-900/50' },
  'cash-flow-trend':        { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800/50', activeBg: 'bg-cyan-100 dark:bg-cyan-900/50' },
  'net-result-chart':       { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800/50', activeBg: 'bg-green-100 dark:bg-green-900/50' },
  'profit-loss-waterfall':  { bg: 'bg-lime-50 dark:bg-lime-950/40', border: 'border-lime-200 dark:border-lime-800/50', activeBg: 'bg-lime-100 dark:bg-lime-900/50' },
  'cash-flow-forecast':     { bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-200 dark:border-indigo-800/50', activeBg: 'bg-indigo-100 dark:bg-indigo-900/50' },
  'revenue-expenses-chart': { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800/50', activeBg: 'bg-cyan-100 dark:bg-cyan-900/50' },
  'expense-analysis':       { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-800/50', activeBg: 'bg-purple-100 dark:bg-purple-900/50' },
  'budget-vs-actual':       { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', border: 'border-fuchsia-200 dark:border-fuchsia-800/50', activeBg: 'bg-fuchsia-100 dark:bg-fuchsia-900/50' },
  'invoice-overview':       { bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800/50', activeBg: 'bg-sky-100 dark:bg-sky-900/50' },
  'recent-journal':         { bg: 'bg-slate-50 dark:bg-slate-950/40', border: 'border-slate-200 dark:border-slate-800/50', activeBg: 'bg-slate-100 dark:bg-slate-900/50' },
  'activity-feed':          { bg: 'bg-stone-50 dark:bg-stone-950/40', border: 'border-stone-200 dark:border-stone-800/50', activeBg: 'bg-stone-100 dark:bg-stone-900/50' },
  'active-accounts':        { bg: 'bg-stone-50 dark:bg-stone-950/40', border: 'border-stone-200 dark:border-stone-800/50', activeBg: 'bg-stone-100 dark:bg-stone-900/50' },
  'saft-export':            { bg: 'bg-gray-50 dark:bg-gray-950/40', border: 'border-gray-200 dark:border-gray-800/50', activeBg: 'bg-gray-100 dark:bg-gray-900/50' },
  'ai-categorization':      { bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-800/50', activeBg: 'bg-violet-100 dark:bg-violet-900/50' },
  'financial-health-detail': { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
};

function getWidgetColor(id: string) {
  return WIDGET_COLORS[id] || { bg: 'bg-gray-50 dark:bg-gray-950/40', border: 'border-gray-200 dark:border-gray-800/50', activeBg: 'bg-gray-100 dark:bg-gray-900/50' };
}

// ─── Props ──────────────────────────────────────────────────────
interface WidgetLayoutEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ──────────────────────────────────────────────────
export function WidgetLayoutEditor({ open, onOpenChange }: WidgetLayoutEditorProps) {
  const { language } = useTranslation();

  // Subscribe to widget store state
  const visibilityMap = useDashboardWidgets((s) => s.visibilityMap);
  const widgetOrder = useDashboardWidgets((s) => s.widgetOrder);
  const widgetSizes = useDashboardWidgets((s) => s.widgetSizes);
  const widgetPositions = useDashboardWidgets((s) => s.widgetPositions);
  const toggleWidget = useDashboardWidgets((s) => s.toggleWidget);
  const resetWidgets = useDashboardWidgets((s) => s.resetWidgets);
  const isAppOwner = useDashboardWidgets((s) => s.isAppOwner);
  const setWidgetOrderDirect = useDashboardWidgets((s) => s.setWidgetOrderDirect);
  const setWidgetPosition = useDashboardWidgets((s) => s.setWidgetPosition);
  const isWidgetVisible = (id: string) => visibilityMap[id] ?? true;

  // ── Drag state ──────────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    col: number;
    insertAfterId: string | null;
  } | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Get column for a widget (same logic as masonry-layout) ──
  const getColumn = useCallback((id: string): number => {
    if (widgetPositions[id] !== undefined) return clampColumn(widgetPositions[id].x);
    if (DEFAULT_COLUMNS[id] !== undefined) return DEFAULT_COLUMNS[id];
    return 0;
  }, [widgetPositions]);

  // ── Sorted widgets (by global order) ────────────────────────
  const sortedWidgets = useMemo(() =>
    [...DASHBOARD_WIDGETS].sort((a, b) => {
      const aIdx = widgetOrder.indexOf(a.id);
      const bIdx = widgetOrder.indexOf(b.id);
      return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999);
    })
  , [widgetOrder]);

  // ── Distribute widgets into 3 columns (same as dashboard) ───
  const columns = useMemo(() => {
    const cols: (typeof DASHBOARD_WIDGETS[number])[][] = Array.from({ length: COLUMN_COUNT }, () => []);
    for (const w of sortedWidgets) {
      cols[getColumn(w.id)].push(w);
    }
    return cols;
  }, [sortedWidgets, getColumn]);

  // ── Visual columns with drop placeholder ────────────────────
  const visualColumns = useMemo(() => {
    const result = columns.map(col => [...col]);
    if (!dragId || !dropPreview) return result;

    const { col: targetCol, insertAfterId } = dropPreview;
    const targetWidgets = result[targetCol];
    let insertIdx: number;

    if (insertAfterId !== null) {
      const afterIdx = targetWidgets.findIndex(w => w.id === insertAfterId);
      insertIdx = afterIdx >= 0 ? afterIdx + 1 : 0;
    } else {
      insertIdx = 0;
    }

    targetWidgets.splice(insertIdx, 0, {
      id: '__placeholder__',
      labelDa: '', labelEn: '', icon: '', defaultVisible: false, defaultSize: 'half', section: 'details',
    });

    return result;
  }, [columns, dragId, dropPreview]);

  const activeDropCol = dropPreview?.col ?? -1;

  // ─── Drag handlers ──────────────────────────────────────────

  const cleanupEditor = useCallback(() => {
    if (dragId) {
      const el = columnRefs.current
        .flatMap(col => col ? [col] : [])
        .flatMap(col => Array.from(col.querySelectorAll(`[data-widget-editor-id="${dragId}"]`)));
      el.forEach(e => { if (e instanceof HTMLElement) e.style.opacity = '1'; });
    }
    setDragId(null);
    setDropPreview(null);
  }, [dragId]);

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }
    setDragId(widgetId);
    setDropPreview(null);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, colIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragId) return;

    const colEl = columnRefs.current[colIndex];
    if (!colEl) return;

    // Widgets in this column (excluding the dragged one)
    const colWidgets = columns[colIndex].filter(w => w.id !== dragId);
    let insertAfterId: string | null = null;

    if (colWidgets.length === 0) {
      for (const w of sortedWidgets) {
        if (w.id === dragId) continue;
        if (getColumn(w.id) === colIndex) break;
        insertAfterId = w.id;
      }
    } else {
      for (const widget of colWidgets) {
        const el = colEl.querySelector(`[data-widget-editor-id="${widget.id}"]`);
        if (!el) continue;
        const rect = (el as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) break;
        insertAfterId = widget.id;
      }

      if (insertAfterId === null) {
        for (const w of sortedWidgets) {
          if (w.id === dragId) continue;
          if (getColumn(w.id) === colIndex) break;
          insertAfterId = w.id;
        }
      }
    }

    setDropPreview(prev => {
      if (prev && prev.col === colIndex && prev.insertAfterId === insertAfterId) return prev;
      return { col: colIndex, insertAfterId };
    });
  }, [dragId, columns, sortedWidgets, getColumn]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || !dragId || !dropPreview) { cleanupEditor(); return; }

    const { col: targetCol, insertAfterId } = dropPreview;

    // 1. Update column assignment for the dragged widget
    setWidgetPosition(sourceId, { x: targetCol, y: 0, width: 0 });

    // 2. Update global order: remove from old position, insert at new position
    const state = useDashboardWidgets.getState();
    const filtered = state.widgetOrder.filter(id => id !== sourceId);

    if (insertAfterId !== null) {
      const idx = filtered.indexOf(insertAfterId);
      if (idx >= 0) {
        filtered.splice(idx + 1, 0, sourceId);
      } else {
        filtered.push(sourceId);
      }
    } else {
      filtered.unshift(sourceId);
    }

    setWidgetOrderDirect(filtered);
    cleanupEditor();
  }, [dragId, dropPreview, setWidgetPosition, setWidgetOrderDirect, cleanupEditor]);

  const handleDragEnd = useCallback(() => { cleanupEditor(); }, [cleanupEditor]);

  const handleReset = useCallback(() => {
    resetWidgets();
  }, [resetWidgets]);

  // ─── Render ────────────────────────────────────────────────

  const columnLabel = (colIdx: number) => {
    if (language === 'da') return ['Venstre', 'Midten', 'Højre'][colIdx] ?? '';
    return ['Left', 'Center', 'Right'][colIdx] ?? '';
  };

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
                ? 'Træk og slip mellem kolonner for at omarrangere. Klik øjet for at vise/skjule.'
                : 'Drag and drop between columns to rearrange. Click eye to show/hide.'}
            </DialogDescription>
          </DialogHeader>

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

        {/* 3-column preview (mirrors the dashboard layout) */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="relative rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4 min-h-[300px]">
            <div className="absolute -top-3 left-4 px-2 bg-white dark:bg-[#1a1f1e] text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {language === 'da' ? 'Live forhåndsvisning' : 'Live Preview'}
            </div>

            {/* 3 columns */}
            <div className="flex gap-3">
              {visualColumns.map((col, colIdx) => {
                const isDropTarget = activeDropCol === colIdx;
                return (
                  <div
                    key={colIdx}
                    ref={el => { columnRefs.current[colIdx] = el; }}
                    className={`
                      flex-1 flex flex-col gap-2 min-h-[200px]
                      rounded-lg transition-all duration-200
                      ${isDropTarget ? 'ring-2 ring-teal-400/40 bg-teal-50/60 dark:bg-teal-900/15' : 'bg-gray-100/60 dark:bg-gray-800/30'}
                    `}
                    onDragOver={(e) => handleColumnDragOver(e, colIdx)}
                    onDrop={handleDrop}
                  >
                    {/* Column label */}
                    <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center pb-1 border-b border-gray-200 dark:border-gray-700">
                      {columnLabel(colIdx)}
                    </div>

                    {col.map(widget => {
                      // ── Drop placeholder ──
                      if (widget.id === '__placeholder__') {
                        return (
                          <div
                            key="__placeholder__"
                            className="border-2 border-dashed border-[#0d9488]/50 rounded-lg bg-[#0d9488]/5 dark:bg-[#0d9488]/10 flex items-center justify-center min-h-[40px] animate-pulse"
                          >
                            <span className="text-[9px] text-[#0d9488]/60 dark:text-[#2dd4bf]/60 font-medium">Drop here</span>
                          </div>
                        );
                      }

                      const color = getWidgetColor(widget.id);
                      const visible = isWidgetVisible(widget.id);
                      const isDragging = dragId === widget.id;
                      const IconComp = ICON_MAP[widget.icon];

                      return (
                        <div
                          key={widget.id}
                          data-widget-editor-id={widget.id}
                          draggable={visible}
                          onDragStart={(e) => handleDragStart(e, widget.id)}
                          onDragEnd={handleDragEnd}
                          className={`
                            relative rounded-lg border-2 transition-all duration-200 select-none
                            ${visible ? color.border : 'border-dashed border-gray-300 dark:border-gray-600'}
                            ${isDragging ? 'opacity-40 scale-95 pointer-events-none' : 'opacity-100'}
                            ${!visible ? 'opacity-50' : ''}
                            ${visible ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                          `}
                          style={{ minHeight: '44px' }}
                        >
                          <div className={`
                            absolute inset-0 rounded-md flex items-center gap-2 px-2.5 overflow-hidden
                            ${visible ? color.bg : 'bg-gray-100/50 dark:bg-gray-800/30'}
                          `}>
                            <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                            <div className="shrink-0 rounded h-6 w-6 flex items-center justify-center ${visible ? color.activeBg : 'bg-gray-200/50 dark:bg-gray-700/50'}">
                              {IconComp ? (
                                <IconComp className={`h-3.5 w-3.5 ${visible ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`} />
                              ) : (
                                <div className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`
                                font-semibold truncate text-[10px] leading-tight
                                ${visible ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600 line-through'}
                              `}>
                                {language === 'da' ? widget.labelDa : widget.labelEn}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleWidget(widget.id); }}
                              className={`
                                shrink-0 rounded-md flex items-center justify-center transition-all h-6 w-6
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
                              {visible
                                ? <Eye className="h-3 w-3" />
                                : <EyeOff className="h-3 w-3" />
                              }
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
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
