// ---------------------------------------------------------------------------
// Dashboard widget definitions — shared between client hook and server API
// ---------------------------------------------------------------------------

export type WidgetSize = 'full' | 'half' | 'third' | 'quarter';

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
  // ── INDICATORS ──────────────────────────────────────────────
  { id: 'kpi-revenue',          labelDa: 'Omsætning',              labelEn: 'Revenue',                icon: 'TrendingUp',    defaultVisible: true,  defaultSize: 'half',    section: 'indicators' },
  { id: 'kpi-operating-result', labelDa: 'Driftsresultat',         labelEn: 'Operating Result',       icon: 'Scale',         defaultVisible: true,  defaultSize: 'half',    section: 'indicators' },
  { id: 'vat-output',           labelDa: 'Udgående moms',           labelEn: 'Output VAT',             icon: 'ArrowUpCircle', defaultVisible: true,  defaultSize: 'half',    section: 'indicators' },
  { id: 'vat-input',            labelDa: 'Indgående moms',          labelEn: 'Input VAT',              icon: 'ArrowDownCircle',defaultVisible: true, defaultSize: 'half',    section: 'indicators' },
  { id: 'pnl-result',           labelDa: 'Resultat & Likviditet',   labelEn: 'P&L Result',             icon: 'Wallet',        defaultVisible: true,  defaultSize: 'half',    section: 'indicators' },
  { id: 'cash-position',        labelDa: 'Likviditetsoversigt',     labelEn: 'Cash Position',          icon: 'Wallet',        defaultVisible: true,  defaultSize: 'half',    section: 'indicators' },
  { id: 'comparison-revenue',   labelDa: 'Omsætningsændring',       labelEn: 'Revenue Change',         icon: 'ArrowUpRight',  defaultVisible: true,  defaultSize: 'quarter', section: 'indicators' },
  { id: 'comparison-expenses',  labelDa: 'Udgiftsændring',          labelEn: 'Expense Change',         icon: 'TrendingDown',  defaultVisible: true,  defaultSize: 'quarter', section: 'indicators' },
  { id: 'comparison-net',       labelDa: 'Nettoprofitændring',      labelEn: 'Net Profit Change',      icon: 'Activity',      defaultVisible: true,  defaultSize: 'quarter', section: 'indicators' },
  { id: 'financial-health-score',labelDa: 'Økonomisk Sundhed',     labelEn: 'Financial Health',        icon: 'Gauge',         defaultVisible: true,  defaultSize: 'third',   section: 'indicators' },
  { id: 'quick-actions',        labelDa: 'Hurtige Handlinger',      labelEn: 'Quick Actions',          icon: 'Zap',           defaultVisible: true,  defaultSize: 'full',    section: 'indicators' },

  // ── CHARTS ───────────────────────────────────────────────────
  { id: 'cash-flow-trend',      labelDa: 'Indtægter vs Omkostninger',labelEn: 'Revenue vs Expenses',   icon: 'BarChart3',     defaultVisible: true,  defaultSize: 'full',    section: 'charts' },
  { id: 'net-result-chart',     labelDa: 'Netto Resultat pr. Måned', labelEn: 'Net Result by Month',    icon: 'BarChart3',     defaultVisible: true,  defaultSize: 'full',    section: 'charts' },
  { id: 'profit-loss-waterfall',labelDa: 'Resultatopgørelse Vandfald',labelEn: 'P&L Waterfall',        icon: 'BarChart',      defaultVisible: true,  defaultSize: 'full',    section: 'charts' },
  { id: 'cash-flow-forecast',   labelDa: 'Likviditetsprognose',      labelEn: 'Cash Flow Forecast',     icon: 'TrendingUp',    defaultVisible: true,  defaultSize: 'full',    section: 'charts' },
  { id: 'revenue-expenses-chart',labelDa: 'Omsætning vs Omkostninger (detaljeret)', labelEn: 'Revenue vs Expenses (detailed)', icon: 'BarChart3', defaultVisible: false, defaultSize: 'full', section: 'charts' },
  { id: 'expense-analysis',     labelDa: 'Udgiftsanalyse',           labelEn: 'Expense Analysis',       icon: 'PieChart',      defaultVisible: true,  defaultSize: 'half',    section: 'charts' },

  // ── DETAILS ───────────────────────────────────────────────────
  { id: 'budget-vs-actual',     labelDa: 'Budget vs Faktisk',        labelEn: 'Budget vs Actual',       icon: 'Scale',         defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'invoice-overview',     labelDa: 'Fakturaoversigt',          labelEn: 'Invoice Overview',       icon: 'FileText',      defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'recent-journal',       labelDa: 'Seneste Journalposter',    labelEn: 'Recent Journal Entries', icon: 'BookOpen',      defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'activity-feed',        labelDa: 'Seneste Aktivitet',        labelEn: 'Activity Feed',          icon: 'Activity',      defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'active-accounts',      labelDa: 'Mest Aktive Konti',        labelEn: 'Most Active Accounts',   icon: 'BookOpen',      defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'saft-export',          labelDa: 'SAF-T Eksport',            labelEn: 'SAF-T Export',           icon: 'Shield',        defaultVisible: true,  defaultSize: 'half',    section: 'details' },
  { id: 'ai-categorization',    labelDa: 'AI-Kategorisering',        labelEn: 'AI Categorization',      icon: 'Sparkles',      defaultVisible: false, defaultSize: 'half',    section: 'details' },
  { id: 'financial-health-detail',labelDa: 'Økonomisk Sundhed Detail',labelEn: 'Health Detail',        icon: 'Droplets',      defaultVisible: false, defaultSize: 'third',   section: 'details' },
];

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
// 12-column grid system:
// full = 12, half = 6, third = 4, quarter = 3

const SIZE_SPAN_MAP: Record<WidgetSize, number> = {
  full: 12,
  half: 6,
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

// ─── Responsive grid span class helper ──────────────────────────
// 12-column grid:
// sm: 2-col grid → full = span 2, others = span 1
// lg: 12-col grid → full = 12, half = 6, third = 4, quarter = 3

export function getGridSpanClasses(size: WidgetSize): string {
  switch (size) {
    case 'full':    return 'sm:col-span-2 lg:col-span-12';
    case 'half':    return 'sm:col-span-1 lg:col-span-6';
    case 'third':   return 'sm:col-span-1 lg:col-span-4';
    case 'quarter': return 'sm:col-span-1 lg:col-span-3';
    default:        return 'sm:col-span-1 lg:col-span-6';
  }
}

// ─── Size cycling helper (kept for backwards compat but not used in UI) ───

const SIZE_CYCLE: WidgetSize[] = ['full', 'half', 'third', 'quarter'];

export function cycleSize(current: WidgetSize): WidgetSize {
  const idx = SIZE_CYCLE.indexOf(current);
  return SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length];
}
