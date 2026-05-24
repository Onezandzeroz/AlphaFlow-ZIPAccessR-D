// ---------------------------------------------------------------------------
// Dashboard widget definitions — shared between client hook and server API
// ---------------------------------------------------------------------------

export type WidgetSize = 'full' | 'half' | 'two-thirds' | 'third' | 'quarter';

export interface DashboardWidget {
  id: string;
  labelDa: string;
  labelEn: string;
  icon: string; // lucide icon name
  defaultVisible: boolean;
  defaultSize: WidgetSize;
  section: 'indicators' | 'charts' | 'details';
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  // ── DEFAULT VISIBLE: Column 0 (Left) ─────────────────────────
  { id: 'activity-feed',        labelDa: 'Seneste Aktivitet',        labelEn: 'Activity Feed',          icon: 'Activity',      defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'active-accounts',      labelDa: 'Mest Aktive Konti',        labelEn: 'Most Active Accounts',   icon: 'BookOpen',      defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'invoice-overview',     labelDa: 'Fakturaoversigt',          labelEn: 'Invoice Overview',       icon: 'FileText',      defaultVisible: true,  defaultSize: 'two-thirds',    section: 'details' },

  // ── DEFAULT VISIBLE: Column 1 (Middle) ───────────────────────
  { id: 'vat-output',           labelDa: 'Udgående moms',           labelEn: 'Output VAT',             icon: 'ArrowUpCircle', defaultVisible: true,  defaultSize: 'quarter', section: 'indicators' },
  { id: 'kpi-revenue',          labelDa: 'Omsætning',              labelEn: 'Revenue',                icon: 'TrendingUp',    defaultVisible: true,  defaultSize: 'quarter', section: 'indicators' },

  // ── DEFAULT VISIBLE: Column 2 (Right) ────────────────────────
  { id: 'vat-input',            labelDa: 'Indgående moms',          labelEn: 'Input VAT',              icon: 'ArrowDownCircle',defaultVisible: true, defaultSize: 'quarter', section: 'indicators' },
  { id: 'cash-position',        labelDa: 'Likviditetsoversigt',     labelEn: 'Cash Position',          icon: 'Wallet',        defaultVisible: true,  defaultSize: 'third',   section: 'indicators' },

  // ── HIDDEN BY DEFAULT: Indicators ─────────────────────────────
  { id: 'kpi-operating-result', labelDa: 'Driftsresultat',         labelEn: 'Operating Result',       icon: 'Scale',         defaultVisible: false, defaultSize: 'quarter', section: 'indicators' },
  { id: 'pnl-result',           labelDa: 'Resultat & Likviditet',   labelEn: 'P&L Result',             icon: 'Wallet',        defaultVisible: false, defaultSize: 'third',   section: 'indicators' },
  { id: 'comparison-revenue',   labelDa: 'Omsætningsændring',       labelEn: 'Revenue Change',         icon: 'ArrowUpRight',  defaultVisible: false, defaultSize: 'quarter', section: 'indicators' },
  { id: 'comparison-expenses',  labelDa: 'Udgiftsændring',          labelEn: 'Expense Change',         icon: 'TrendingDown',  defaultVisible: false, defaultSize: 'quarter', section: 'indicators' },
  { id: 'comparison-net',       labelDa: 'Nettoprofitændring',      labelEn: 'Net Profit Change',      icon: 'Activity',      defaultVisible: false, defaultSize: 'quarter', section: 'indicators' },
  { id: 'financial-health-score',labelDa: 'Økonomisk Sundhed',     labelEn: 'Financial Health',        icon: 'Gauge',         defaultVisible: false, defaultSize: 'third',   section: 'indicators' },
  { id: 'quick-actions',        labelDa: 'Hurtige Handlinger',      labelEn: 'Quick Actions',          icon: 'Zap',           defaultVisible: false, defaultSize: 'full',    section: 'indicators' },

  // ── HIDDEN BY DEFAULT: Charts ─────────────────────────────────
  { id: 'cash-flow-trend',      labelDa: 'Indtægter vs Omkostninger',labelEn: 'Revenue vs Expenses',   icon: 'BarChart3',     defaultVisible: false, defaultSize: 'full',    section: 'charts' },
  { id: 'net-result-chart',     labelDa: 'Netto Resultat pr. Måned', labelEn: 'Net Result by Month',    icon: 'BarChart3',     defaultVisible: false, defaultSize: 'full',    section: 'charts' },
  { id: 'profit-loss-waterfall',labelDa: 'Resultatopgørelse Vandfald',labelEn: 'P&L Waterfall',        icon: 'BarChart',      defaultVisible: false, defaultSize: 'half',    section: 'charts' },
  { id: 'cash-flow-forecast',   labelDa: 'Likviditetsprognose',      labelEn: 'Cash Flow Forecast',     icon: 'TrendingUp',    defaultVisible: false, defaultSize: 'half',    section: 'charts' },
  { id: 'revenue-expenses-chart',labelDa: 'Omsætning vs Omkostninger (detaljeret)', labelEn: 'Revenue vs Expenses (detailed)', icon: 'BarChart3', defaultVisible: false, defaultSize: 'full', section: 'charts' },
  { id: 'expense-analysis',     labelDa: 'Udgiftsanalyse',           labelEn: 'Expense Analysis',       icon: 'PieChart',      defaultVisible: false, defaultSize: 'half',    section: 'charts' },

  // ── HIDDEN BY DEFAULT: Details ────────────────────────────────
  { id: 'budget-vs-actual',     labelDa: 'Budget vs Faktisk',        labelEn: 'Budget vs Actual',       icon: 'Scale',         defaultVisible: false, defaultSize: 'half',    section: 'details' },
  { id: 'recent-journal',       labelDa: 'Seneste Journalposter',    labelEn: 'Recent Journal Entries', icon: 'BookOpen',      defaultVisible: false, defaultSize: 'half',    section: 'details' },
  { id: 'saft-export',          labelDa: 'SAF-T Eksport',            labelEn: 'SAF-T Export',           icon: 'Shield',        defaultVisible: false, defaultSize: 'half',    section: 'details' },
  { id: 'ai-categorization',    labelDa: 'AI-Kategorisering',        labelEn: 'AI Categorization',      icon: 'Sparkles',      defaultVisible: false, defaultSize: 'half',    section: 'details' },
  { id: 'financial-health-detail',labelDa: 'Økonomisk Sundhed Detail',labelEn: 'Health Detail',        icon: 'Droplets',      defaultVisible: false, defaultSize: 'third',   section: 'details' },
];

// ─── Defaults version ──────────────────────────────────────────
// Bump this when code-level defaults change (visibility, order, column layout).
// The Zustand store compares this against localStorage to detect stale cache.
export const WIDGET_DEFAULTS_VERSION = 4;

export function getDefaultVisibilityMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const w of DASHBOARD_WIDGETS) {
    map[w.id] = w.defaultVisible;
  }
  return map;
}

export function getDefaultSizesMap(): Record<string, WidgetSize> {
  const map: Record<string, WidgetSize> = {};
  for (const w of DASHBOARD_WIDGETS) {
    map[w.id] = w.defaultSize;
  }
  return map;
}

// ─── Grid span lookup ───────────────────────────────────────────
// Kept for backwards compat — not used in the flex-wrap layout

const SIZE_SPAN_MAP: Record<WidgetSize, number> = {
  full: 12,
  half: 6,
  'two-thirds': 8,
  third: 4,
  quarter: 3,
};

export function getWidgetGridSpan(size: WidgetSize): number {
  return SIZE_SPAN_MAP[size] ?? 6;
}

export function getWidgetGridSpanById(widgetId: string, sizesMap?: Record<string, WidgetSize>): number {
  if (sizesMap && sizesMap[widgetId]) return SIZE_SPAN_MAP[sizesMap[widgetId]] ?? 6;
  const widget = DASHBOARD_WIDGETS.find(w => w.id === widgetId);
  if (!widget) return 6;
  return SIZE_SPAN_MAP[widget.defaultSize] ?? 6;
}

// ─── Flex-wrap width helper ──────────────────────────────────────
// Dynamic board layout: flex-wrap with percentage widths.
// gap-3 (12px) consistently across all breakpoints.
//
// With N items per row and (N-1) gaps of G pixels:
//   item_width = (100% - (N-1)*G) / N
//
// full        = 100%                  (1 per row, 0 gaps)
// two-thirds  = calc(66.666% - 4px)   (1.5 per row, ~1 gap of 12px)
// half        = calc(50% - 6px)       (2 per row, 1 gap of 12px)
// third       = calc(33.333% - 8px)   (3 per row, 2 gaps of 12px)
// quarter     = calc(25% - 9px)       (4 per row, 3 gaps of 12px)

export function getGridSpanClasses(size: WidgetSize): string {
  switch (size) {
    case 'full':
      return 'w-full shrink-0';
    case 'two-thirds':
      // Mobile: full width | sm+: 2/3 width (fits with a 1/3 widget beside it)
      return 'w-full sm:w-[calc(66.666%-4px)] shrink-0';
    case 'half':
      // Mobile: full width | sm+: 2-col (gap-3=12px)
      return 'w-full sm:w-[calc(50%-6px)] shrink-0';
    case 'third':
      // Mobile: full width | sm: 2-col | lg: 3-col
      return 'w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.333%-8px)] shrink-0';
    case 'quarter':
      // Mobile: full width | sm: 2-col | lg: 4-col
      return 'w-full sm:w-[calc(50%-6px)] lg:w-[calc(25%-9px)] shrink-0';
    default:
      return 'w-full sm:w-[calc(50%-6px)] shrink-0';
  }
}

// ─── Size cycling helper (kept for backwards compat but not used in UI) ───

const SIZE_CYCLE: WidgetSize[] = ['full', 'two-thirds', 'half', 'third', 'quarter'];

export function cycleSize(current: WidgetSize): WidgetSize {
  const idx = SIZE_CYCLE.indexOf(current);
  return SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length];
}
