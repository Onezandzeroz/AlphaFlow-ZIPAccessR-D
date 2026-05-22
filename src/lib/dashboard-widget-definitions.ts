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

  // ── Half-width widgets (2 per row) ──
  { id: 'pnl-cash', labelDa: 'Resultat & Likviditet', labelEn: 'P&L & Cash Position', icon: 'Wallet', defaultVisible: true, defaultSize: 'half', section: 'indicators' },
  { id: 'monthly-comparison', labelDa: 'Månedlig Sammenligning', labelEn: 'Monthly Comparison', icon: 'ArrowUpRight', defaultVisible: true, defaultSize: 'half', section: 'indicators' },
  { id: 'invoice-overview', labelDa: 'Fakturaoversigt', labelEn: 'Invoice Overview', icon: 'FileText', defaultVisible: true, defaultSize: 'half', section: 'details' },
  { id: 'vat-charts', labelDa: 'Moms & Omsætningsdiagrammer', labelEn: 'VAT & Revenue Charts', icon: 'Calculator', defaultVisible: true, defaultSize: 'half', section: 'charts' },
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
export function getWidgetGridSpan(widgetId: string): number {
  const widget = DASHBOARD_WIDGETS.find(w => w.id === widgetId);
  if (!widget) return 3; // default to half
  switch (widget.defaultSize) {
    case 'full': return 6;
    case 'half': return 3;
    case 'third': return 2;
    default: return 3;
  }
}
