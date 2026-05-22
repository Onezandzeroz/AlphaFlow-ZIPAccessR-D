'use client';

import { useState, useCallback, useRef } from 'react';
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
  Save,
  Shield,
  TrendingUp,
  Wallet,
  Gauge,
  ArrowUpRight,
  BarChart3,
  Zap,
  FileText,
  Calculator,
  Activity,
  Scale,
  Droplets,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { useDashboardWidgets, DASHBOARD_WIDGETS } from '@/lib/dashboard-widgets';
import { getWidgetGridSpan } from '@/lib/dashboard-widget-definitions';
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
  Calculator,
  Activity,
  Scale,
  Droplets,
  Sparkles,
  BookOpen,
};

// ─── Widget visual sizes ─────────────────────────────────────────
// gridSpan: 6 = full width, 3 = half width (2 per row), 2 = third width (3 per row)
// The gridSpan in the dialog preview corresponds to the proportional width
// of the actual widget on the dashboard.
const WIDGET_SIZES: Record<string, { w: number; h: number; label: string; gridSpan: 2 | 3 | 6 }> = {
  // ── Full-width widgets (span entire row) ──
  'kpi-cards':             { w: 2, h: 1.2, label: '4x KPI', gridSpan: 6 },
  'cash-flow-trend':       { w: 2, h: 2.4, label: 'Rev. vs Exp.', gridSpan: 6 },
  'quick-actions':         { w: 2, h: 1.4, label: 'Quick Actions', gridSpan: 6 },
  'net-result-chart':      { w: 2, h: 2.4, label: 'Net Result', gridSpan: 6 },
  'profit-loss-waterfall': { w: 2, h: 2.6, label: 'P&L Waterfall', gridSpan: 6 },
  'cash-flow-forecast':    { w: 2, h: 2.6, label: 'Cash Forecast', gridSpan: 6 },

  // ── Half-width widgets (2 per row) ──
  'pnl-cash':              { w: 1, h: 1.8, label: 'P&L + Cash', gridSpan: 3 },
  'monthly-comparison':    { w: 1, h: 2.0, label: 'Monthly Comp.', gridSpan: 3 },
  'invoice-overview':      { w: 1, h: 2.0, label: 'Invoices', gridSpan: 3 },
  'vat-charts':            { w: 1, h: 2.4, label: 'VAT Charts', gridSpan: 3 },
  'expense-analysis':      { w: 1, h: 2.4, label: 'Exp. Analysis', gridSpan: 3 },
  'budget-vs-actual':      { w: 1, h: 2.4, label: 'Budget vs Act.', gridSpan: 3 },
  'ai-categorization':     { w: 1, h: 2.0, label: 'AI Categorize', gridSpan: 3 },
  'recent-activity':       { w: 1, h: 2.6, label: 'Recent Activity', gridSpan: 3 },
  'active-accounts':       { w: 1, h: 2.0, label: 'Active Accounts', gridSpan: 3 },
  'saft-export':           { w: 1, h: 1.4, label: 'SAF-T Export', gridSpan: 3 },

  // ── Third-width widgets (3 per row) ──
  'financial-health-score':   { w: 1, h: 2.0, label: 'Health Score', gridSpan: 2 },
  'financial-health-detail': { w: 1, h: 2.6, label: 'Health Detail', gridSpan: 2 },
};

function getWidgetSize(id: string) {
  const local = WIDGET_SIZES[id];
  const gridSpan = getWidgetGridSpan(id) as 2 | 3 | 6;
  if (local) return { ...local, gridSpan };
  return { w: 1, h: 1.5, label: id, gridSpan };
}

// ─── Widget color palette (muted pastels) ───────────────────────
const WIDGET_COLORS: Record<string, { bg: string; border: string; activeBg: string }> = {
  'kpi-cards':         { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800/50', activeBg: 'bg-emerald-100 dark:bg-emerald-900/50' },
  'pnl-cash':          { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'financial-health-score': { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800/50', activeBg: 'bg-amber-100 dark:bg-amber-900/50' },
  'monthly-comparison':{ bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800/50', activeBg: 'bg-orange-100 dark:bg-orange-900/50' },
  'cash-flow-trend':   { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800/50', activeBg: 'bg-cyan-100 dark:bg-cyan-900/50' },
  'quick-actions':     { bg: 'bg-yellow-50 dark:bg-yellow-950/40', border: 'border-yellow-200 dark:border-yellow-800/50', activeBg: 'bg-yellow-100 dark:bg-yellow-900/50' },
  'invoice-overview':  { bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800/50', activeBg: 'bg-sky-100 dark:bg-sky-900/50' },
  'vat-charts':        { bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-800/50', activeBg: 'bg-rose-100 dark:bg-rose-900/50' },
  'net-result-chart':  { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-200 dark:border-green-800/50', activeBg: 'bg-green-100 dark:bg-green-900/50' },
  'expense-analysis':  { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-800/50', activeBg: 'bg-purple-100 dark:bg-purple-900/50' },
  'profit-loss-waterfall': { bg: 'bg-lime-50 dark:bg-lime-950/40', border: 'border-lime-200 dark:border-lime-800/50', activeBg: 'bg-lime-100 dark:bg-lime-900/50' },
  'financial-health-detail': { bg: 'bg-teal-50 dark:bg-teal-950/40', border: 'border-teal-200 dark:border-teal-800/50', activeBg: 'bg-teal-100 dark:bg-teal-900/50' },
  'cash-flow-forecast':{ bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-200 dark:border-indigo-800/50', activeBg: 'bg-indigo-100 dark:bg-indigo-900/50' },
  'budget-vs-actual':  { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', border: 'border-fuchsia-200 dark:border-fuchsia-800/50', activeBg: 'bg-fuchsia-100 dark:bg-fuchsia-900/50' },
  'ai-categorization': { bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-800/50', activeBg: 'bg-violet-100 dark:bg-violet-900/50' },
  'recent-activity':   { bg: 'bg-slate-50 dark:bg-slate-950/40', border: 'border-slate-200 dark:border-slate-800/50', activeBg: 'bg-slate-100 dark:bg-slate-900/50' },
  'active-accounts':   { bg: 'bg-stone-50 dark:bg-stone-950/40', border: 'border-stone-200 dark:border-stone-800/50', activeBg: 'bg-stone-100 dark:bg-stone-900/50' },
  'saft-export':       { bg: 'bg-gray-50 dark:bg-gray-950/40', border: 'border-gray-200 dark:border-gray-800/50', activeBg: 'bg-gray-100 dark:bg-gray-900/50' },
};

function getWidgetColor(id: string) {
  return WIDGET_COLORS[id] || { bg: 'bg-gray-50 dark:bg-gray-950/40', border: 'border-gray-200 dark:border-gray-800/50', activeBg: 'bg-gray-100 dark:bg-gray-900/50' };
}

// ─── Size label helper ──────────────────────────────────────────
function getSizeLabel(gridSpan: number, language: string) {
  if (gridSpan === 6) return language === 'da' ? 'Fuld bredde' : 'Full width';
  if (gridSpan === 3) return language === 'da' ? 'Halv bredde' : 'Half width';
  return language === 'da' ? '1/3 bredde' : '1/3 width';
}

// ─── Props ──────────────────────────────────────────────────────
interface WidgetLayoutEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ──────────────────────────────────────────────────
export function WidgetLayoutEditor({ open, onOpenChange }: WidgetLayoutEditorProps) {
  const { language } = useTranslation();
  const { isWidgetVisible, toggleWidget, resetWidgets, isAppOwner, widgetOrder, setWidgetOrderDirect } = useDashboardWidgets();

  // Local working copy for drag-and-drop (committed on save)
  // Use refs to track last synced state and only update when dialog opens
  const syncedOpenRef = useRef(false);
  const [localOrder, setLocalOrder] = useState<string[]>(widgetOrder);
  const [localVisibility, setLocalVisibility] = useState<Record<string, boolean>>(() => {
    const visMap: Record<string, boolean> = {};
    DASHBOARD_WIDGETS.forEach(w => { visMap[w.id] = isWidgetVisible(w.id); });
    return visMap;
  });

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync from global state when dialog opens — using a ref to avoid setState-in-effect
  if (open && !syncedOpenRef.current) {
    syncedOpenRef.current = true;
    // These syncs happen during render (not in an effect), which is fine for initialization
  }
  if (!open) {
    syncedOpenRef.current = false;
  }

  // Re-sync local state from global when dialog opens (use callback in Dialog's onOpenChange)
  const handleDialogOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      setLocalOrder([...widgetOrder]);
      const visMap: Record<string, boolean> = {};
      DASHBOARD_WIDGETS.forEach(w => { visMap[w.id] = isWidgetVisible(w.id); });
      setLocalVisibility(visMap);
      setDragId(null);
      setDropTargetId(null);
    }
    onOpenChange(newOpen);
  }, [widgetOrder, isWidgetVisible, onOpenChange]);

  const handleDragStart = useCallback((e: React.DragEvent, widgetId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widgetId);
    setDragId(widgetId);
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
    if (!sourceId || sourceId === targetId) {
      setDragId(null);
      setDropTargetId(null);
      dragOverRef.current = null;
      return;
    }

    // Reorder: move sourceId to targetId's position
    setLocalOrder(prev => {
      const sourceIdx = prev.indexOf(sourceId);
      const targetIdx = prev.indexOf(targetId);
      if (sourceIdx < 0 || targetIdx < 0) return prev;
      const next = [...prev];
      next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, sourceId);
      return next;
    });

    setDragId(null);
    setDropTargetId(null);
    dragOverRef.current = null;
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTargetId(null);
    dragOverRef.current = null;
  }, []);

  const handleToggleLocal = useCallback((id: string) => {
    setLocalVisibility(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleSave = useCallback(() => {
    // Apply order
    setWidgetOrderDirect(localOrder);

    // Apply visibility changes
    Object.entries(localVisibility).forEach(([id, visible]) => {
      if (visible !== isWidgetVisible(id)) {
        toggleWidget(id);
      }
    });

    handleDialogOpenChange(false);
  }, [localOrder, localVisibility, isWidgetVisible, toggleWidget, setWidgetOrderDirect, handleDialogOpenChange]);

  const handleReset = useCallback(() => {
    resetWidgets();
    const defaults = DASHBOARD_WIDGETS.map(w => w.id);
    setLocalOrder(defaults);
    const visMap: Record<string, boolean> = {};
    DASHBOARD_WIDGETS.forEach(w => { visMap[w.id] = w.defaultVisible; });
    setLocalVisibility(visMap);
  }, [resetWidgets]);

  // Build sorted widget list based on local order
  const sortedWidgets = [...DASHBOARD_WIDGETS].sort((a, b) => {
    const aIdx = localOrder.indexOf(a.id);
    const bIdx = localOrder.indexOf(b.id);
    return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999);
  });

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
                : 'Drag and drop to rearrange widgets. Click the eye to show/hide.'}
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

        {/* Miniature dashboard preview */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-4"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Dashboard frame */}
          <div className="relative rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3 min-h-[300px]">
            {/* Frame label */}
            <div className="absolute -top-3 left-4 px-2 bg-white dark:bg-[#1a1f1e] text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {language === 'da' ? 'Miniature forhåndsvisning' : 'Miniature Preview'}
            </div>

            {/* Widget blocks — 6-column grid layout */}
            <div className="grid grid-cols-6 gap-2 mt-1">
              {sortedWidgets.map((widget, idx) => {
                const size = getWidgetSize(widget.id);
                const color = getWidgetColor(widget.id);
                const visible = localVisibility[widget.id] ?? true;
                const isDragging = dragId === widget.id;
                const isDropTarget = dropTargetId === widget.id;
                const IconComp = ICON_MAP[widget.icon];
                const isThird = size.gridSpan === 2;
                const isHalf = size.gridSpan === 3;

                return (
                  <div
                    key={widget.id}
                    draggable={visible}
                    onDragStart={(e) => handleDragStart(e, widget.id)}
                    onDragOver={(e) => handleDragOver(e, widget.id)}
                    onDrop={(e) => handleDrop(e, widget.id)}
                    onDragEnd={handleDragEnd}
                    className={`
                      relative rounded-lg border-2 transition-all duration-200 select-none
                      ${visible ? color.border : 'border-dashed border-gray-300 dark:border-gray-600'}
                      ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}
                      ${isDropTarget && visible ? 'ring-2 ring-[#0d9488] ring-offset-2 dark:ring-offset-[#1a1f1e] scale-[1.02] shadow-lg' : ''}
                      ${!visible ? 'opacity-50' : ''}
                      ${visible ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                    `}
                    style={{
                      gridColumn: `span ${size.gridSpan} / span ${size.gridSpan}`,
                      minHeight: `${Math.max(size.h, 1) * 44}px`,
                    }}
                  >
                    {/* Inner content */}
                    <div className={`
                      absolute inset-0 rounded-md flex overflow-hidden
                      ${visible ? color.bg : 'bg-gray-100/50 dark:bg-gray-800/30'}
                      ${isThird ? 'flex-col items-center justify-center gap-1 px-2 py-2' : 'flex-row items-center gap-2 px-3'}
                    `}>
                      {/* Drag handle */}
                      <div className={`
                        shrink-0 flex items-center justify-center
                        ${visible ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-700'}
                        ${isThird ? 'absolute top-1.5 left-1.5' : ''}
                      `}>
                        <GripVertical className={isThird ? 'h-3 w-3' : 'h-4 w-4'} />
                      </div>

                      {/* Icon */}
                      <div className={`
                        shrink-0 rounded-lg flex items-center justify-center
                        ${isThird ? 'h-7 w-7' : 'h-8 w-8'}
                        ${visible ? color.activeBg : 'bg-gray-200/50 dark:bg-gray-700/50'}
                      `}>
                        {IconComp ? (
                          <IconComp className={`h-4 w-4 ${visible ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`} />
                        ) : (
                          <div className={`h-2 w-2 rounded-full ${visible ? 'bg-gray-400 dark:bg-gray-500' : 'bg-gray-300 dark:text-gray-700'}`} />
                        )}
                      </div>

                      {/* Widget info */}
                      <div className={`flex-1 min-w-0 ${isThird ? 'text-center' : ''}`}>
                        <p className={`
                          font-semibold truncate
                          ${isThird ? 'text-[10px] leading-tight' : 'text-xs'}
                          ${visible ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600 line-through'}
                        `}>
                          {language === 'da' ? widget.labelDa : widget.labelEn}
                        </p>
                        {/* Size sublabel — only for half and full blocks */}
                        {!isThird && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                            {size.label}
                            <span className="opacity-60"> · {getSizeLabel(size.gridSpan, language)}</span>
                          </p>
                        )}
                      </div>

                      {/* Position badge — only for full-width blocks */}
                      {!isHalf && !isThird && visible && (
                        <span className="shrink-0 text-[10px] font-mono text-gray-400 dark:text-gray-600 bg-white/60 dark:bg-gray-800/60 px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                      )}

                      {/* Visibility toggle */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleToggleLocal(widget.id); }}
                        className={`
                          shrink-0 rounded-md flex items-center justify-center transition-all
                          ${isThird ? 'absolute top-1.5 right-1.5 h-5 w-5' : 'h-7 w-7'}
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
                        {visible ? <Eye className={isThird ? 'h-3 w-3' : 'h-4 w-4'} /> : <EyeOff className={isThird ? 'h-3 w-3' : 'h-4 w-4'} />}
                      </button>
                    </div>

                    {/* Drop indicator line */}
                    {isDropTarget && dragId !== widget.id && (
                      <div className="absolute -top-[5px] left-2 right-2 h-[2px] bg-[#0d9488] rounded-full shadow-[0_0_6px_rgba(13,148,136,0.5)]" />
                    )}
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

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDialogOpenChange(false)}
              className="text-xs text-gray-500 dark:text-gray-400"
            >
              {language === 'da' ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="text-xs gap-1.5 bg-[#0d9488] hover:bg-[#0f766e] text-white dark:bg-[#2dd4bf] dark:hover:bg-[#14b8a6] dark:text-gray-900 font-semibold shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              {language === 'da' ? 'Gem layout' : 'Save Layout'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
