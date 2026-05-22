'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/use-translation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingDown,
  TrendingUp,
  Minus,
  Loader2,
  PieChart,
  ArrowRight,
} from 'lucide-react';

interface BudgetVsActualRow {
  accountNumber: string;
  accountName: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number;
}

interface BudgetVsActualWidgetProps {
  user?: { id: string; email: string; businessName?: string | null; demoModeEnabled?: boolean };
}

export function BudgetVsActualWidget({ user: _user }: BudgetVsActualWidgetProps) {
  const [data, setData] = useState<BudgetVsActualRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { tc, language } = useTranslation();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/budget-vs-actual');
      if (res.ok) {
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
      }
    } catch (error) {
      console.error('Failed to fetch budget vs actual data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <Card className="stat-card">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#0d9488]" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <Card className="stat-card overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 dark:bg-[#2dd4bf]/15 flex items-center justify-center">
              <PieChart className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'da' ? 'Budget vs. Faktisk' : 'Budget vs. Actual'}</h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{language === 'da' ? 'Afvigelse pr. kontokategori' : 'Variance by account category'}</p>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <div className="empty-state-container flex flex-col items-center py-8 text-center">
            <div className="empty-state-illustration h-14 w-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
              <PieChart className="h-7 w-7 text-[#0d9488] dark:text-[#2dd4bf]" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {language === 'da' ? 'Intet budget fundet' : 'No budget found'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[260px]">
              {language === 'da'
                ? 'Opret et budget for at sammenligne budgetterede beløb med faktiske udgifter pr. kontokategori.'
                : 'Create a budget to compare budgeted amounts to actual spending per account category.'}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Calculate totals
  const totalBudget = data.reduce((sum, row) => sum + row.budgetAmount, 0);
  const totalActual = data.reduce((sum, row) => sum + row.actualAmount, 0);
  const totalVariance = totalActual - totalBudget;
  const totalVariancePercent = totalBudget !== 0
    ? ((totalVariance / Math.abs(totalBudget)) * 100)
    : 0;

  function getVarianceIcon(variance: number) {
    if (variance < -50) return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
    if (variance > 50) return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5 text-amber-500" />;
  }

  function getVarianceColor(variance: number) {
    // For expenses: under budget (negative variance) is green, over budget (positive variance) is red
    // For revenue: over budget (positive variance) is green, under budget (negative variance) is red
    // Since budget can contain both, we use: positive variance = red (over), negative = green (under)
    if (variance < 0) return 'text-green-600 dark:text-green-400';
    if (variance > 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  }

  function getVarianceBadge(variance: number, variancePercent: number) {
    if (variance === 0) {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">
          0%
        </Badge>
      );
    }
    // Under budget (negative variance) = green
    if (variance < 0) {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20">
          {variancePercent.toFixed(1)}%
        </Badge>
      );
    }
    // Over budget (positive variance) = red
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
        +{variancePercent.toFixed(1)}%
      </Badge>
    );
  }

  return (
    <Card className="stat-card overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[#0d9488]/10 dark:bg-[#2dd4bf]/15 flex items-center justify-center">
            <PieChart className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{language === 'da' ? 'Budget vs. Faktisk' : 'Budget vs. Actual'}</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{language === 'da' ? 'Afvigelse pr. kontokategori' : 'Variance by account category'}</p>
          </div>
        </div>
      </div>
      <div className="px-4 sm:px-5 pb-4 sm:pb-5">

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {language === 'da' ? 'Budget' : 'Budget'}
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums mt-0.5">
              {tc(totalBudget)}
            </p>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {language === 'da' ? 'Faktisk' : 'Actual'}
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums mt-0.5">
              {tc(totalActual)}
            </p>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {language === 'da' ? 'Afvigelse' : 'Variance'}
            </p>
            <p className={`text-sm font-bold tabular-nums mt-0.5 ${getVarianceColor(totalVariance)}`}>
              {totalVariance >= 0 ? '+' : ''}{tc(totalVariance)}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="-mx-5 px-5 max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 h-8 py-1 min-w-[100px]">
                  {language === 'da' ? 'Konto' : 'Account'}
                </TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 text-right h-8 py-1 whitespace-nowrap">
                  {language === 'da' ? 'Budget' : 'Budget'}
                </TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 text-right h-8 py-1 whitespace-nowrap">
                  {language === 'da' ? 'Faktisk' : 'Actual'}
                </TableHead>
                <TableHead className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 text-right h-8 py-1 whitespace-nowrap">
                  {language === 'da' ? 'Afvigelse' : 'Variance'}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.accountNumber} className="table-row-teal-hover">
                  <TableCell className="py-2 px-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {getVarianceIcon(row.variance)}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {row.accountNumber}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight truncate" title={row.accountName}>
                          {row.accountName}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right text-xs tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {tc(row.budgetAmount)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right text-xs tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {tc(row.actualAmount)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end gap-1 flex-nowrap">
                      <span className={`text-xs font-medium tabular-nums whitespace-nowrap ${getVarianceColor(row.variance)}`}>
                        {row.variance >= 0 ? '+' : ''}{tc(row.variance)}
                      </span>
                      {getVarianceBadge(row.variance, row.variancePercent)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <ArrowRight className="h-3 w-3 text-gray-400" />
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {language === 'da'
              ? 'Grøn afvigelse = under budget · Rød afvigelse = over budget'
              : 'Green variance = under budget · Red variance = over budget'}
          </p>
        </div>
      </div>
    </Card>
  );
}
