'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  PieChart as PieChartIcon, TrendingDown, Loader2, ChevronRight,
} from 'lucide-react';

const COLORS = ['#0d9488', '#7c9a82', '#d4915c', '#6366f1', '#c9928f', '#7dabb5', '#e8b86d', '#94a3b8'];

interface CategoryData {
  name: string;
  total: number;
  percentage: number;
  accounts: Array<{ number: string; name: string; amount: number }>;
  monthlyData: Record<string, number>;
}

interface MonthlyTrend {
  month: string;
  total: number;
  byCategory: Record<string, number>;
}

interface ExpenseAnalysisProps {
  dateRange: { from: Date; to: Date } | null;
}

export function ExpenseAnalysis({ dateRange }: ExpenseAnalysisProps) {
  const { t, tc, language } = useTranslation();
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const from = dateRange ? dateRange.from.toISOString().split('T')[0] : '';
      const to = dateRange ? dateRange.to.toISOString().split('T')[0] : '';
      const res = await fetch(`/api/expense-categories?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setMonthlyTrend(data.monthlyTrend || []);
        setTotalExpenses(data.totalExpenses || 0);
      }
    } catch (error) {
      console.error('Failed to fetch expense categories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pieData = useMemo(() =>
    categories.map((cat, i) => ({
      name: cat.name,
      value: cat.total,
      color: COLORS[i % COLORS.length],
    })),
    [categories]
  );

  const barData = useMemo(() =>
    monthlyTrend.map((m) => {
      const entry: Record<string, string | number> = {
        label: m.month.substring(5), // MM
      };
      // Top 4 categories + Other
      let otherTotal = 0;
      categories.forEach((cat, i) => {
        const catAmount = m.byCategory[cat.name] || 0;
        if (i < 4) {
          entry[cat.name] = catAmount;
        } else {
          otherTotal += catAmount;
        }
      });
      if (otherTotal > 0) {
        entry[language === 'da' ? 'Andet' : 'Other'] = otherTotal;
      }
      return entry;
    }),
    [monthlyTrend, categories, language]
  );

  const barKeys = useMemo(() => {
    const keys = categories.slice(0, 4).map((c) => c.name);
    if (categories.length > 4) {
      keys.push(language === 'da' ? 'Andet' : 'Other');
    }
    return keys;
  }, [categories, language]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload?: { color?: string } }> }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-3 min-w-[140px]">
        {payload.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.payload?.color || COLORS[idx] }} />
              {item.name}
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
              {tc(item.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="stat-card">
        <CardContent className="p-4 sm:p-6 flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-[#0d9488]" />
        </CardContent>
      </Card>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Expense Breakdown Pie Chart */}
      <Card className="stat-card overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 dark:bg-[#2dd4bf]/15 flex items-center justify-center">
              <PieChartIcon className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'da' ? 'Udgiftskategorier' : 'Expense Categories'}</h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{language === 'da' ? 'Fordeling pr. kategori' : 'Distribution by category'}</p>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <div className="flex items-start gap-4">
            <div className="w-44 h-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={55}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(data) => setSelectedCategory(selectedCategory === data.name ? null : data.name)}
                    className="cursor-pointer"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        opacity={selectedCategory && selectedCategory !== entry.name ? 0.4 : 1}
                        className="transition-opacity duration-200"
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {categories.slice(0, 6).map((cat, i) => (
                <div
                  key={cat.name}
                  className={`flex items-center gap-2 text-xs cursor-pointer rounded-md px-1.5 py-1 transition-colors ${
                    selectedCategory === cat.name ? 'bg-[#e6f7f3] dark:bg-[#1a2e2b]' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                  onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{cat.name}</span>
                  <span className="font-medium text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{tc(cat.total)}</span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                    {cat.percentage}%
                  </Badge>
                </div>
              ))}
              {totalExpenses > 0 && (
                <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {language === 'da' ? 'Total' : 'Total'}
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{tc(totalExpenses)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Selected category detail */}
          {selectedCategory && (() => {
            const cat = categories.find((c) => c.name === selectedCategory);
            if (!cat) return null;
            return (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1.5 mb-2">
                  <ChevronRight className="h-3.5 w-3.5 text-[#0d9488]" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{cat.name}</span>
                  <span className="text-xs text-gray-400">({cat.accounts.length} {language === 'da' ? 'konti' : 'accounts'})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {cat.accounts.slice(0, 6).map((acc) => (
                    <div key={acc.number} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-gray-50 dark:bg-gray-800/50">
                      <span className="text-gray-600 dark:text-gray-400 truncate">{acc.number} {acc.name}</span>
                      <span className="font-medium text-gray-900 dark:text-white tabular-nums ml-2">{tc(acc.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </Card>

      {/* Monthly Expense Trend */}
      <Card className="stat-card overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'da' ? 'Månedlig udgiftstrend' : 'Monthly Expense Trend'}</h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{language === 'da' ? 'Udvikling over tid' : 'Development over time'}</p>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={10}
                  tick={{ fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  fontSize={10}
                  tick={{ fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v / 1000}k`}
                  width={40}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                {barKeys.map((key, i) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="expenses"
                    fill={COLORS[i % COLORS.length]}
                    radius={i === barKeys.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-gray-400 dark:text-gray-500 text-sm">
              {language === 'da' ? 'Ingen udgiftsdata' : 'No expense data'}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
