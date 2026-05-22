// ---------------------------------------------------------------------------
// Dashboard widget definitions — shared between client hook and server API
// ---------------------------------------------------------------------------

export type WidgetSize = 'full' | 'half' | 'third';

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
  // ── Full-width widgets (span entire row) ──
  { id: 'kpi-cards', labelDa: 'Nøgletal', labelEn: 'KPI Cards', icon: 'TrendingUp', defaultVisible: true, defaultSize: 'full', section: 'indicators' },
  { id: 'cash-flow-trend', labelDa: 'Indtægter vs Omkostninger', labelEn: 'Revenue vs Expenses', icon: 'BarChart3', defaultVisible: true, defaultSize: 'full', section: 'charts' },
  { id: 'quick-actions', labelDa: 'Hurtige Handlinger', labelEn: 'Quick Actions', icon: 'Zap', defaultVisible: true, defaultSize: 'full', section: 'indicators' },
  { id: 'net-result-chart', labelDa: 'Netto Resultat pr. Måned', labelEn: 'Net Result by Month', icon: 'Activity', defaultVisible: true, defaultSize: 'full', section: 'charts' },
  { id: 'profit-loss-waterfall', labelDa: 'Resultatopgørelse Vandfald', labelEn: 'P&L Waterfall', icon: 'BarChart', defaultVisible: true, defaultSize: 'full', section: 'charts' },
  { id: 'cash-flow-forecast', labelDa: 'Likviditetsprognose', labelEn: 'Cash Flow Forecast', icon: 'TrendingUp', defaultVisible: true, defaultSize: 'full', section: 'charts' },
  { id: 'revenue-expenses-chart', labelDa: 'Omsætning vs Omkostninger (detaljeret)', labelEn: 'Revenue vs Expenses (detailed)', icon: 'BarChart3', defaultVisible: false, defaultSize: 'full', section: 'charts' },

  // ── Half-width widgets (2 per row) ──
  { id: 'pnl-result', labelDa: 'Resultat & Likviditet', labelEn: 'P&L Result', icon: 'Wallet', defaultVisible: true, defaultSize: 'half', section: 'indicators' },
  { id: 'cash-position', labelDa: 'Likviditetsoversigt', labelEn: 'Cash Position', icon: 'Wallet', defaultVisible: true, defaultSize: 'half', section: 'indicators' },
  { id: 'monthly-comparison', labelDa: 'Månedlig Sammenligning', labelEn: 'Monthly Comparison', icon: 'ArrowUpRight', defaultVisible: true, defaultSize: 'half', section: 'indicators' },
  { id: 'invoice-overview', labelDa: 'Fakturaoversigt', labelEn: 'Invoice Overview', icon: 'FileText', defaultVisible: true, defaultSize: 'half', section: 'details' },
  { id: 'vat-breakdown', labelDa: 'Moms & Omsætningsdiagrammer', labelEn: 'VAT & Revenue Charts', icon: 'Calculator', defaultVisible: true, defaultSize: 'half', section: 'charts' },
  { id: 'expense-analysis', labelDa: 'Udgiftsanalyse', labelEn: 'Expense Analysis', icon: 'PieChart', defaultVisible: true, defaultSize: 'half', section: 'charts' },
  { id: 'budget-vs-actual', labelDa: 'Budget vs Faktisk', labelEn: 'Budget vs Actual', icon: 'Scale', defaultVisible: true, defaultSize: 'half', section: 'details' },
  { id: 'ai-categorization', labelDa: 'AI-Kategorisering', labelEn: 'AI Categorization', icon: 'Sparkles', defaultVisible: false, defaultSize: 'half', section: 'details' },
  { id: 'recent-activity', labelDa: 'Seneste Aktivitet & Journal', labelEn: 'Recent Activity & Journal', icon: 'Activity', defaultVisible: true, defaultSize: 'half', section: 'details' },
  { id: 'active-accounts', labelDa: 'Mest Aktive Konti', labelEn: 'Most Active Accounts', icon: 'BookOpen', defaultVisible: true, defaultSize: 'half', section: 'details' },
  { id: 'saft-export', labelDa: 'SAF-T Eksport', labelEn: 'SAF-T Export', icon: 'Shield', defaultVisible: true, defaultSize: 'half', section: 'details' },

  // ── Third-width widgets (3 per row) ──
  { id: 'financial-health-score', labelDa: 'Økonomisk Sundhed', labelEn: 'Financial Health Score', icon: 'Gauge', defaultVisible: true, defaultSize: 'third', section: 'indicators' },
  { id: 'financial-health-detail', labelDa: 'Økonomisk Sundhed Detail', labelEn: 'Financial Health Detail', icon: 'Droplets', defaultVisible: false, defaultSize: 'third', section: 'details' },
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
// Maps widget size → number of columns in the 6-column grid.
// full = 6 (entire row), half = 3 (2 per row), third = 2 (3 per row).

const SIZE_SPAN_MAP: Record<WidgetSize, number> = {
  full: 6,
  half: 3,
  third: 2,
};

export function getWidgetGridSpan(size: WidgetSize): number {
  return SIZE_SPAN_MAP[size] ?? 3;
}

export function getWidgetGridSpanById(widgetId: string, sizesMap?: Record<string, WidgetSize>): number {
  if (sizesMap && sizesMap[widgetId]) return SIZE_SPAN_MAP[sizesMap[widgetId]] ?? 3;
  const widget = DASHBOARD_WIDGETS.find(w => w.id === widgetId);
  if (!widget) return 3;
  return SIZE_SPAN_MAP[widget.defaultSize] ?? 3;
}

// ─── Responsive grid span class helper ──────────────────────────
// Returns Tailwind classes for a widget of the given size.
// sm: 2-col grid → full = span 2, half/third = span 1
// lg: 6-col grid → full = span 6, half = span 3, third = span 2

export function getGridSpanClasses(size: WidgetSize): string {
  switch (size) {
    case 'full': return 'sm:col-span-2 lg:col-span-6';
    case 'half': return 'sm:col-span-1 lg:col-span-3';
    case 'third': return 'sm:col-span-1 lg:col-span-2';
    default: return 'sm:col-span-1 lg:col-span-3';
  }
}

// ─── Size cycling helper ────────────────────────────────────────
// Cycles through: full → half → third → full

const SIZE_CYCLE: WidgetSize[] = ['full', 'half', 'third'];

export function cycleSize(current: WidgetSize): WidgetSize {
  const idx = SIZE_CYCLE.indexOf(current);
  return SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length];
}
