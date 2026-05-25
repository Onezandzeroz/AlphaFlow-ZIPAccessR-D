'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  const widgetPositions = useDashboardWidgets((s) => s.widgetPositions);
  const toggleWidget = useDashboardWidgets((s) => s.toggleWidget);
  const resetWidgets = useDashboardWidgets((s) => s.resetWidgets);
  const isAppOwner = useDashboardWidgets((s) => s.isAppOwner);
  const setWidgetOrderDirect = useDashboardWidgets((s) => s.setWidgetOrderDirect);
  const setWidgetPosition = useDashboardWidgets((s) => s.setWidgetPosition);
  const isWidgetVisible = (id: string) => visibilityMap[id] ?? true;

  // ── Drag state (React state for rendering) ──────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    col: number;
    insertAfterId: string | null;
  } | null>(null);

  // ── Internal drag tracking (refs for non-rendering data) ────
  const dragInternalRef = useRef<{
    isDown: boolean;
    widgetId: string | null;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    hasMoved: boolean;
    clone: HTMLElement | null;
    sourceEl: HTMLElement | null;
  }>({
    isDown: false,
    widgetId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    hasMoved: false,
    clone: null,
    sourceEl: null,
  });

  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Refs for store actions (avoid stale closures in window event listeners)
  const setWidgetPositionRef = useRef(setWidgetPosition);
  const setWidgetOrderDirectRef = useRef(setWidgetOrderDirect);
  useEffect(() => { setWidgetPositionRef.current = setWidgetPosition; }, [setWidgetPosition]);
  useEffect(() => { setWidgetOrderDirectRef.current = setWidgetOrderDirect; }, [setWidgetOrderDirect]);

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

  // Keep refs for use in pointer event handlers
  const sortedWidgetsRef = useRef(sortedWidgets);
  useEffect(() => { sortedWidgetsRef.current = sortedWidgets; }, [sortedWidgets]);

  // ── Distribute widgets into 3 columns (same as dashboard) ───
  const columns = useMemo(() => {
    const cols: (typeof DASHBOARD_WIDGETS[number])[][] = Array.from({ length: COLUMN_COUNT }, () => []);
    for (const w of sortedWidgets) {
      cols[getColumn(w.id)].push(w);
    }
    return cols;
  }, [sortedWidgets, getColumn]);

  const columnsRef = useRef(columns);
  useEffect(() => { columnsRef.current = columns; }, [columns]);

  const getColumnRef = useRef(getColumn);
  useEffect(() => { getColumnRef.current = getColumn; }, [getColumn]);

  // ── Visual columns with drop placeholder ────────────────────
  const visualColumns = useMemo(() => {
    const result = columns.map(col => [...col]);
    if (!isDragging || !dropPreview) return result;

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
  }, [columns, isDragging, dropPreview]);

  const activeDropCol = dropPreview?.col ?? -1;

  // ─── Pointer-event Drag-and-Drop ────────────────────────────

  const getColumnAtPoint = useCallback((clientX: number): number => {
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const colEl = columnRefs.current[i];
      if (!colEl) continue;
      const rect = colEl.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return i;
    }
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const colEl = columnRefs.current[i];
      if (!colEl) continue;
      const rect = colEl.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(clientX - center);
      if (dist < minDist) { minDist = dist; closest = i; }
    }
    return closest;
  }, []);

  const getInsertPosition = useCallback((colIndex: number, clientY: number): { col: number; insertAfterId: string | null } => {
    const internal = dragInternalRef.current;
    const currentColumns = columnsRef.current;
    const getCol = getColumnRef.current;

    const colEl = columnRefs.current[colIndex];
    if (!colEl) return { col: colIndex, insertAfterId: null };

    const colWidgets = currentColumns[colIndex]?.filter(w => w.id !== internal.widgetId) ?? [];
    let insertAfterId: string | null = null;

    if (colWidgets.length === 0) {
      return { col: colIndex, insertAfterId: null };
    }

    for (const widget of colWidgets) {
      const el = colEl.querySelector(`[data-widget-editor-id="${widget.id}"]`);
      if (!el) continue;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) break;
      insertAfterId = widget.id;
    }

    return { col: colIndex, insertAfterId };
  }, []);

  const cleanupDrag = useCallback(() => {
    const internal = dragInternalRef.current;
    if (internal.clone) {
      internal.clone.remove();
      internal.clone = null;
    }
    if (internal.sourceEl) {
      internal.sourceEl.style.opacity = '1';
      internal.sourceEl = null;
    }
    internal.isDown = false;
    internal.widgetId = null;
    internal.hasMoved = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    setIsDragging(false);
    setDraggedId(null);
    setDropPreview(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, widgetId: string) => {
    if (!isWidgetVisible(widgetId)) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();

    dragInternalRef.current = {
      isDown: true,
      widgetId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      hasMoved: false,
      clone: null,
      sourceEl: el,
    };

    document.body.style.userSelect = 'none';
  }, [isWidgetVisible]);

  // Global pointer move and up handlers
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const internal = dragInternalRef.current;
      if (!internal.isDown || !internal.widgetId) return;

      const dx = e.clientX - internal.startX;
      const dy = e.clientY - internal.startY;

      if (!internal.hasMoved) {
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        internal.hasMoved = true;

        setIsDragging(true);
        setDraggedId(internal.widgetId);
        document.body.style.cursor = 'grabbing';

        const sourceEl = internal.sourceEl;
        if (sourceEl) {
          sourceEl.style.opacity = '0.3';

          const clone = sourceEl.cloneNode(true) as HTMLElement;
          clone.style.position = 'fixed';
          clone.style.width = `${sourceEl.offsetWidth}px`;
          clone.style.zIndex = '9999';
          clone.style.pointerEvents = 'none';
          clone.style.opacity = '0.9';
          clone.style.transform = 'scale(1.05)';
          clone.style.boxShadow = '0 12px 28px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)';
          clone.style.borderRadius = '8px';
          clone.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
          clone.setAttribute('data-drag-clone', 'true');
          document.body.appendChild(clone);
          internal.clone = clone;
        }
      }

      if (internal.clone) {
        internal.clone.style.left = `${e.clientX - internal.offsetX}px`;
        internal.clone.style.top = `${e.clientY - internal.offsetY}px`;
      }

      const col = getColumnAtPoint(e.clientX);
      const position = getInsertPosition(col, e.clientY);

      setDropPreview(prev => {
        if (prev && prev.col === position.col && prev.insertAfterId === position.insertAfterId) return prev;
        return position;
      });
    };

    const handlePointerUp = () => {
      const internal = dragInternalRef.current;
      if (!internal.isDown) return;

      if (internal.hasMoved && dropPreview && internal.widgetId) {
        const { col: targetCol, insertAfterId } = dropPreview;
        const sourceId = internal.widgetId;

        // 1. Update column assignment
        setWidgetPositionRef.current(sourceId, { x: targetCol, y: 0, width: 0 });

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

        setWidgetOrderDirectRef.current(filtered);
      }

      cleanupDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [getColumnAtPoint, getInsertPosition, cleanupDrag, dropPreview]);

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
      <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-[95vw] md:max-w-[1008px] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
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
          <div className="relative rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4 min-h-[300px]" style={{ touchAction: 'none' }}>
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
                      rounded-lg transition-colors duration-200
                      ${isDropTarget ? 'ring-2 ring-teal-400/40 bg-teal-50/60 dark:bg-teal-900/15' : 'bg-gray-100/60 dark:bg-gray-800/30'}
                    `}
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
                      const isThisDragging = isDragging && draggedId === widget.id;
                      const IconComp = ICON_MAP[widget.icon];

                      return (
                        <div
                          key={widget.id}
                          data-widget-editor-id={widget.id}
                          onPointerDown={(e) => handlePointerDown(e, widget.id)}
                          className={`
                            relative rounded-lg border-2 select-none
                            ${visible ? color.border : 'border-dashed border-gray-300 dark:border-gray-600'}
                            ${isThisDragging ? 'opacity-30' : 'opacity-100'}
                            ${!visible ? 'opacity-50' : ''}
                            ${visible ? 'cursor-grab' : 'cursor-default'}
                          `}
                          style={{ minHeight: '44px', touchAction: 'none' }}
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
                                font-semibold truncate text-xs leading-tight
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
