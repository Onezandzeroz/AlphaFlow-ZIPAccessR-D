'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { toast } from "sonner";
import { getMonthNames } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  Calendar,
  CalendarDays,
  FileDown,
  Archive,
  Shield,
  FileCode,
  AlertTriangle,
  Eye,
  CheckCircle,
  Info,
  XCircle,
  Clock,
  Building2,
  Hash,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { da } from 'date-fns/locale';
import { Calendar as CalendarUI } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// SAF-T period type options
type SaftPeriodType = 'year' | 'quarter' | 'month' | 'custom';
type SaftQuarter = '1' | '2' | '3' | '4';

// Quarter date ranges (calendar year based)
function getQuarterRange(year: number, quarter: SaftQuarter): { start: Date; end: Date } {
  const qStart = (parseInt(quarter) - 1) * 3;
  return {
    start: new Date(year, qStart, 1),
    end: new Date(year, qStart + 3, 0, 23, 59, 59, 999),
  };
}

interface Transaction {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE';
  amount: number;
  description: string;
  vatPercent: number;
  receiptImage: string | null;
  invoiceId?: string | null;
  // Journal-entry-derived VAT (authoritative) — from double-entry journal.
  // null when no journal entry exists (the transaction has no VAT posting).
  journalVAT?: { amount: number; code: string | null; rate: number } | null;
}

interface VATRegisterSummary {
  totalOutputVAT: number;
  totalInputVAT: number;
  netVATPayable: number;
  periodFrom: string;
  periodTo: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lineItems: any;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
  customerName: string;
}

interface ValidationStatus {
  hasErrors: boolean;
  hasWarnings: boolean;
  errors: number;
  warnings: number;
  details: Array<{
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

interface ExportsPageProps {
  user: User;
}

export function ExportsPage({ user }: ExportsPageProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const { t, tc, tm, language } = useTranslation();
  
  // Get month names based on language
  const monthNames = getMonthNames(language);

  // SAF-T specific state
  const [showSAFTDialog, setShowSAFTDialog] = useState(false);
  const [saftPreview, setSaftPreview] = useState<string | null>(null);
  const [saftValidation, setSaftValidation] = useState<ValidationStatus | null>(null);
  const [saftStep, setSaftStep] = useState<'select' | 'validating' | 'generating' | 'preview' | 'complete'>('select');
  const previewRef = useRef<HTMLPreElement>(null);

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState((currentDate.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString());
  // SAF-T period state — supports full year, quarter, month, and custom date ranges
  const [saftPeriodType, setSaftPeriodType] = useState<SaftPeriodType>('year');
  const [saftYear, setSaftYear] = useState(currentDate.getFullYear().toString());
  const [saftMonth, setSaftMonth] = useState((currentDate.getMonth() + 1).toString());
  const [saftQuarter, setSaftQuarter] = useState<SaftQuarter>('1');
  const [saftCustomFrom, setSaftCustomFrom] = useState<Date | undefined>(undefined);
  const [saftCustomTo, setSaftCustomTo] = useState<Date | undefined>(undefined);

  // VAT register data (single source of truth for VAT totals)
  const [vatSummaryCSV, setVatSummaryCSV] = useState<VATRegisterSummary | null>(null);
  const [vatSummarySAFT, setVatSummarySAFT] = useState<VATRegisterSummary | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // ─── Initial data load: transactions, invoices (once) ───
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch transactions, invoices in parallel
        const [txResponse, invResponse] = await Promise.all([
          fetch('/api/transactions'),
          fetch('/api/invoices'),
        ]);

        if (!txResponse.ok) console.error('Transactions API error:', txResponse.status);
        if (!invResponse.ok) console.error('Invoices API error:', invResponse.status);

        const txData = txResponse.ok ? await txResponse.json() : {};
        const invData = invResponse.ok ? await invResponse.json() : {};

        const allTransactions: Transaction[] = txData.transactions || [];
        const invoices: Invoice[] = invData.invoices || [];

        // Collect IDs of invoices that already have transactions (to avoid double-counting)
        const invoiceIdsWithTransactions = new Set(
          allTransactions
            .filter((tx) => tx.invoiceId)
            .map((tx) => tx.invoiceId)
        );

        // For invoices without transactions, create virtual transactions from line items
        // Only include SENT and PAID invoices (exclude DRAFT and CANCELLED)
        const virtualTransactions: Transaction[] = [];

        for (const invoice of invoices) {
          if (invoice.status === 'CANCELLED' || invoice.status === 'DRAFT') continue;
          if (invoiceIdsWithTransactions.has(invoice.id)) continue;

          const lineItems = (invoice.lineItems as Array<{
            description: string;
            quantity: number;
            unitPrice: number;
            vatPercent: number;
          }>) || [];

          for (const item of lineItems) {
            if (!item.description?.trim() || item.unitPrice <= 0) continue;

            const lineTotal = item.quantity * item.unitPrice;
            virtualTransactions.push({
              id: `inv-${invoice.id}-${item.description.slice(0, 20)}`,
              date: invoice.issueDate,
              type: 'SALE',
              amount: lineTotal,
              description: `${invoice.invoiceNumber} - ${item.description}`,
              vatPercent: item.vatPercent,
              receiptImage: null,
              invoiceId: invoice.id,
            });
          }
        }

        // Merge real transactions with virtual ones from invoices
        setTransactions([...allTransactions, ...virtualTransactions]);
        setInitialLoadDone(true);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // ─── Period-specific VAT register fetch (re-fetches on month/year change) ───
  useEffect(() => {
    if (!initialLoadDone) return;

    const fetchVAT = async () => {
      try {
        // CSV VAT totals: use selected month period
        const monthStr = selectedMonth.padStart(2, '0');
        const lastDay = new Date(+selectedYear, +selectedMonth, 0).getDate();
        const from = `${selectedYear}-${monthStr}-01`;
        const to = `${selectedYear}-${monthStr}-${lastDay}`;

        const vatResp = await fetch(`/api/vat-register?from=${from}&to=${to}`);
        if (vatResp.ok) {
          const vatData = await vatResp.json();
          setVatSummaryCSV({
            totalOutputVAT: vatData.totalOutputVAT || 0,
            totalInputVAT: vatData.totalInputVAT || 0,
            netVATPayable: vatData.netVATPayable || 0,
            periodFrom: from,
            periodTo: to,
          });
        }
      } catch {
        // VAT register fetch failed — VAT totals will show 0
      } finally {
        setIsLoading(false);
      }
    };

    fetchVAT();
  }, [selectedMonth, selectedYear, initialLoadDone]);

  // ─── Helper: compute SAF-T period date range ───
  const saftPeriodRange = useMemo(() => {
    const y = parseInt(saftYear);
    switch (saftPeriodType) {
      case 'year':
        return {
          start: startOfYear(new Date(y, 0, 1)),
          end: endOfYear(new Date(y, 0, 1)),
        };
      case 'quarter':
        return getQuarterRange(y, saftQuarter);
      case 'month': {
        const m = parseInt(saftMonth) - 1;
        return {
          start: startOfMonth(new Date(y, m, 1)),
          end: endOfMonth(new Date(y, m, 1)),
        };
      }
      case 'custom':
        return {
          start: saftCustomFrom || startOfMonth(new Date()),
          end: saftCustomTo || endOfMonth(new Date()),
        };
    }
  }, [saftPeriodType, saftYear, saftMonth, saftQuarter, saftCustomFrom, saftCustomTo]);

  // ─── Helper: human-readable label for the current SAF-T period ───
  const saftPeriodLabel = useMemo(() => {
    const fmt = (d: Date) => format(d, 'dd/MM/yyyy');
    switch (saftPeriodType) {
      case 'year':
        return `${saftYear} (01/01 – 31/12)`;
      case 'quarter':
        return `${saftYear} ${t('saftPeriodQ' + saftQuarter as keyof typeof t) || `Q${saftQuarter}`}`;
      case 'month': {
        const m = parseInt(saftMonth) - 1;
        return format(new Date(parseInt(saftYear), m, 1), language === 'da' ? 'MMMM yyyy' : 'MMMM yyyy');
      }
      case 'custom':
        if (saftCustomFrom && saftCustomTo) {
          return `${fmt(saftCustomFrom)} – ${fmt(saftCustomTo)}`;
        }
        return t('saftPeriodCustom');
    }
  }, [saftPeriodType, saftYear, saftMonth, saftQuarter, saftCustomFrom, saftCustomTo, language, t]);

  // ─── SAF-T VAT register fetch (re-fetches on period change) ───
  useEffect(() => {
    if (!initialLoadDone) return;

    const fetchSAFTVAT = async () => {
      try {
        const from = format(saftPeriodRange.start, 'yyyy-MM-dd');
        const to = format(saftPeriodRange.end, 'yyyy-MM-dd');

        const vatResp = await fetch(`/api/vat-register?from=${from}&to=${to}`);
        if (vatResp.ok) {
          const vatData = await vatResp.json();
          setVatSummarySAFT({
            totalOutputVAT: vatData.totalOutputVAT || 0,
            totalInputVAT: vatData.totalInputVAT || 0,
            netVATPayable: vatData.netVATPayable || 0,
            periodFrom: from,
            periodTo: to,
          });
        }
      } catch {
        // VAT register fetch failed
      }
    };

    fetchSAFTVAT();
  }, [saftPeriodRange, initialLoadDone]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 4 }, (_, i) => currentYear - i);
  }, []);

  const filteredTransactions = useMemo(() => {
    const monthStr = selectedMonth.padStart(2, '0');
    const filterPrefix = `${selectedYear}-${monthStr}`;
    return transactions.filter((t) => {
      const dateStr = t.date?.substring(0, 10) || '';
      return dateStr.startsWith(filterPrefix);
    });
  }, [transactions, selectedMonth, selectedYear]);

  const saftFilteredTransactions = useMemo(() => {
    const periodStart = saftPeriodRange.start.getTime();
    const periodEnd = saftPeriodRange.end.getTime();
    return transactions.filter((t) => {
      const txDate = new Date(t.date).getTime();
      return txDate >= periodStart && txDate <= periodEnd;
    });
  }, [transactions, saftPeriodRange]);

  // Compute totals — VAT amounts come exclusively from the VAT register
  // (double-entry journal), not from legacy transaction formula.
  const totals = useMemo(() => {
    const sales = filteredTransactions.filter(t => t.type === 'SALE' || !t.type);
    const purchases = filteredTransactions.filter(t => t.type === 'PURCHASE');
    const totalAmount = filteredTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    // Use VAT register as the single source of truth
    const outputVAT = vatSummaryCSV?.totalOutputVAT ?? 0;
    const inputVAT = vatSummaryCSV?.totalInputVAT ?? 0;
    const netVAT = outputVAT - inputVAT;
    return {
      outputVAT,
      inputVAT,
      netVAT,
      totalAmount,
      count: filteredTransactions.length,
    };
  }, [filteredTransactions, vatSummaryCSV]);

  const saftTotals = useMemo(() => {
    const sales = saftFilteredTransactions.filter(t => t.type === 'SALE' || !t.type);
    const purchases = saftFilteredTransactions.filter(t => t.type === 'PURCHASE');
    const totalAmount = saftFilteredTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    // Use VAT register as the single source of truth
    const outputVAT = vatSummarySAFT?.totalOutputVAT ?? 0;
    const inputVAT = vatSummarySAFT?.totalInputVAT ?? 0;
    const netVAT = outputVAT - inputVAT;
    return {
      outputVAT,
      inputVAT,
      netVAT,
      totalAmount,
      count: saftFilteredTransactions.length,
    };
  }, [saftFilteredTransactions, vatSummarySAFT]);

  // Export functions
  const exportCSV = useCallback(async () => {
    setIsExporting('csv');
    try {
      const response = await fetch(`/api/transactions/export?month=${selectedYear}-${selectedMonth.padStart(2, '0')}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${selectedYear}-${selectedMonth}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(language === 'da' ? 'CSV eksporteret' : 'CSV exported', {
        description: language === 'da'
          ? `posteringer-${selectedYear}-${selectedMonth}.csv er blevet downloadet`
          : `transactions-${selectedYear}-${selectedMonth}.csv has been downloaded`,
      });
    } catch (error) {
      console.error('CSV export failed:', error);
      toast.error(language === 'da' ? 'Kunne ikke eksportere CSV' : 'Failed to export CSV');
    } finally {
      setIsExporting(null);
    }
  }, [selectedMonth, selectedYear, language]);

  const exportVATReport = useCallback(() => {
    setIsExporting('vat');
    try {
      const headers = language === 'da' 
        ? ['Dato', 'Beskrivelse', 'Beløb (DKK)', 'Moms %', 'Moms (DKK)']
        : ['Date', 'Description', 'Amount (DKK)', 'VAT %', 'VAT (DKK)'];
      const rows = filteredTransactions.map((t) => {
        // Per-line VAT: ONLY use journal-entry-derived data (single source of truth).
        // No fallback to amount × vatPercent — summary totals are authoritative via vat-register.
        const vatRate = t.journalVAT?.rate ?? 0;
        const vatAmount = t.journalVAT?.amount ?? 0;
        return [
          format(new Date(t.date), 'dd/MM/yyyy'),
          `"${t.description.replace(/"/g, '""')}"`,
          t.amount.toFixed(2),
          vatRate.toFixed(1),
          vatAmount.toFixed(2),
        ];
      });

      rows.push([]);
      rows.push(['', language === 'da' ? 'TOTALER' : 'TOTALS', '', '', '']);
      rows.push(['', language === 'da' ? 'Posteringer' : 'Transactions', totals.count.toString(), '', '']);
      rows.push(['', language === 'da' ? 'Total beløb' : 'Total Amount', totals.totalAmount.toFixed(2), '', '']);
      rows.push(['', language === 'da' ? 'Udgående moms (salg)' : 'Output VAT (Sales)', totals.outputVAT.toFixed(2), '', '']);
      rows.push(['', language === 'da' ? 'Indgående moms (køb)' : 'Input VAT (Purchases)', totals.inputVAT.toFixed(2), '', '']);
      rows.push(['', language === 'da' ? (totals.netVAT >= 0 ? 'At betale' : 'Til godtgørelse') : (totals.netVAT >= 0 ? 'To Pay' : 'To Refund'), Math.abs(totals.netVAT).toFixed(2), '', '']);

      const bom = '\uFEFF';
      const csv = bom + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = language === 'da' ? `momsrapport-${selectedYear}-${selectedMonth}.csv` : `vat-report-${selectedYear}-${selectedMonth}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(language === 'da' ? 'Momsrapport eksporteret' : 'VAT report exported', {
        description: language === 'da'
          ? `momsrapport-${selectedYear}-${selectedMonth}.csv er blevet downloadet`
          : `vat-report-${selectedYear}-${selectedMonth}.csv has been downloaded`,
      });
    } finally {
      setIsExporting(null);
    }
  }, [filteredTransactions, totals, selectedMonth, selectedYear, language]);

  const exportAllOIOUBL = useCallback(async () => {
    setIsExporting('oioubl');
    try {
      for (const t of filteredTransactions) {
        const response = await fetch(`/api/transactions/export-peppol?id=${t.id}`);
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `oioubl-${t.id.substring(0, 8)}.xml`;
          a.click();
          window.URL.revokeObjectURL(url);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } finally {
      setIsExporting(null);
    }
  }, [filteredTransactions]);

  // SAF-T Export with progress
  const generateSAFT = useCallback(async () => {
    // Note: Zero-balance periods are allowed — a company may have no activity
    // in a given period and a valid empty SAF-T file is still required.

    setSaftStep('validating');
    setExportProgress(0);

    // Simulate validation progress
    for (let i = 0; i <= 30; i += 10) {
      await new Promise((r) => setTimeout(r, 150));
      setExportProgress(i);
    }

    setSaftStep('generating');
    
    // Simulate generation progress
    for (let i = 30; i <= 60; i += 10) {
      await new Promise((r) => setTimeout(r, 100));
      setExportProgress(i);
    }

    try {
      // Build API URL — use startDate/endDate for proper period support
      const fromStr = format(saftPeriodRange.start, 'yyyy-MM-dd');
      const toStr = format(saftPeriodRange.end, 'yyyy-MM-dd');
      const response = await fetch(`/api/export-saft?startDate=${fromStr}&endDate=${toStr}`);
      
      setExportProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || 'Failed to generate SAF-T');
      }

      // Get validation info from headers
      const errorCount = parseInt(response.headers.get('X-Validation-Errors') || '0');
      const warningCount = parseInt(response.headers.get('X-Validation-Warnings') || '0');

      setSaftValidation({
        hasErrors: errorCount > 0,
        hasWarnings: warningCount > 0,
        errors: errorCount,
        warnings: warningCount,
        details: [],
      });

      const xmlText = await response.text();
      setSaftPreview(xmlText);
      setExportProgress(100);
      setSaftStep('preview');

      toast.success(language === 'da' ? 'SAF-T fil genereret' : 'SAF-T file generated', {
        description: language === 'da'
          ? `SAF-T for ${saftPeriodLabel} er klar til download`
          : `SAF-T for ${saftPeriodLabel} is ready for download`,
      });

    } catch (error) {
      console.error('SAF-T export error:', error);
      setSaftValidation({
        hasErrors: true,
        hasWarnings: false,
        errors: 1,
        warnings: 0,
        details: [{
          field: 'export',
          message: error instanceof Error ? error.message : 'Failed to generate SAF-T file',
          severity: 'error',
        }],
      });
      setSaftStep('preview');
    }
  }, [saftPeriodRange, saftTotals.count, language]);

  const downloadSAFT = useCallback(() => {
    if (!saftPreview) return;

    const blob = new Blob([saftPreview], { type: 'application/xml; charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fromStr = format(saftPeriodRange.start, 'yyyy-MM-dd');
    const toStr = format(saftPeriodRange.end, 'yyyy-MM-dd');
    a.download = `SAF-T-${fromStr}_to_${toStr}.xml`;
    a.click();
    window.URL.revokeObjectURL(url);
    setSaftStep('complete');
  }, [saftPreview, saftPeriodRange]);

  const resetSAFTDialog = useCallback(() => {
    setSaftStep('select');
    setSaftPreview(null);
    setSaftValidation(null);
    setExportProgress(0);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#0d9488]" />
          <p className="text-gray-500 dark:text-gray-400">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={t('exports')}
        description={t('forTaxCompliance')}
      />

      {/* Period Selector */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardContent className="p-4 pb-2 lg:pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4">
            <Calendar className="h-5 w-5 text-[#0d9488]" />
            <div className="flex gap-3">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-32 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                  {monthNames.map((m, i) => (
                    <SelectItem key={i} value={(i + 1).toString()}>
                      {m} {selectedYear}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-24 bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e]" align="end">
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SAF-T Export - Featured */}
      <Card className="relative overflow-hidden border-2 border-[#0d9488]/20 dark:border-[#0d9488]/30 shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#0d9488]/10 to-[#0d9488]/5 rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
        <CardContent className="relative p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#0d9488] to-[#0d9488] flex items-center justify-center shrink-0 shadow-lg">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {t('saftExport')}
                </h3>
                <Badge className="bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/20">
                  {t('officialFormat')}
                </Badge>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t('saftDescription')}
              </p>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-3 sm:mb-4">
                <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-0.5 sm:mb-1">
                    <Receipt className="h-3 w-3 sm:h-4 sm:w-4" />
                    {t('transactions')}
                  </div>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                    {saftTotals.count}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-0.5 sm:mb-1">
                    <Hash className="h-3 w-3 sm:h-4 sm:w-4" />
                    {t('amount')}
                  </div>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                    {tc(saftTotals.totalAmount)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-0.5 sm:mb-1">
                    <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    {language === 'da' ? 'Net moms' : 'Net VAT'}
                  </div>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                    {tc(saftTotals.netVAT)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center gap-1 sm:gap-2 text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-0.5 sm:mb-1">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                    {t('saftPeriodRange')}
                  </div>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                    {saftPeriodLabel}
                  </p>
                </div>
              </div>

              {/* SAF-T Period Selector */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Period type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('saftPeriodType')}</label>
                    <Select value={saftPeriodType} onValueChange={(v) => setSaftPeriodType(v as SaftPeriodType)}>
                      <SelectTrigger className="w-44 bg-white dark:bg-[#1a1f1e] border-gray-200 dark:border-gray-700">
                        <CalendarDays className="h-4 w-4 text-[#0d9488] mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                        <SelectItem value="year">{t('saftPeriodFullYear')}</SelectItem>
                        <SelectItem value="quarter">{t('saftPeriodQuarter')}</SelectItem>
                        <SelectItem value="month">{t('saftPeriodMonth')}</SelectItem>
                        <SelectItem value="custom">{t('saftPeriodCustom')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Year (always shown) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('year') || 'År'}</label>
                    <Select value={saftYear} onValueChange={setSaftYear}>
                      <SelectTrigger className="w-28 bg-white dark:bg-[#1a1f1e] border-gray-200 dark:border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                        {yearOptions.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quarter (shown when quarter selected) */}
                  {saftPeriodType === 'quarter' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('saftPeriodQuarter')}</label>
                      <Select value={saftQuarter} onValueChange={(v) => setSaftQuarter(v as SaftQuarter)}>
                        <SelectTrigger className="w-44 bg-white dark:bg-[#1a1f1e] border-gray-200 dark:border-gray-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                          <SelectItem value="1">{t('saftPeriodQ1')}</SelectItem>
                          <SelectItem value="2">{t('saftPeriodQ2')}</SelectItem>
                          <SelectItem value="3">{t('saftPeriodQ3')}</SelectItem>
                          <SelectItem value="4">{t('saftPeriodQ4')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Month (shown when month selected) */}
                  {saftPeriodType === 'month' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('saftSelectMonth')}</label>
                      <Select value={saftMonth} onValueChange={setSaftMonth}>
                        <SelectTrigger className="w-36 bg-white dark:bg-[#1a1f1e] border-gray-200 dark:border-gray-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-[#1a1f1e]">
                          {monthNames.map((m, i) => (
                            <SelectItem key={i} value={(i + 1).toString()}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Custom date range (shown when custom selected) */}
                  {saftPeriodType === 'custom' && (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('saftPeriodFrom')}</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-36 justify-start text-left font-normal bg-white dark:bg-[#1a1f1e] border-gray-200 dark:border-gray-700">
                              <Calendar className="mr-2 h-4 w-4 text-[#0d9488]" />
                              {saftCustomFrom ? format(saftCustomFrom, 'dd/MM/yyyy') : '...'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-white dark:bg-[#1a1f1e]" align="start">
                            <CalendarUI
                              mode="single"
                              selected={saftCustomFrom}
                              onSelect={(d) => { setSaftCustomFrom(d); if (d && saftCustomTo && d > saftCustomTo) setSaftCustomTo(undefined); }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('saftPeriodTo')}</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-36 justify-start text-left font-normal bg-white dark:bg-[#1a1f1e] border-gray-200 dark:border-gray-700">
                              <Calendar className="mr-2 h-4 w-4 text-[#0d9488]" />
                              {saftCustomTo ? format(saftCustomTo, 'dd/MM/yyyy') : '...'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-white dark:bg-[#1a1f1e]" align="start">
                            <CalendarUI
                              mode="single"
                              selected={saftCustomTo}
                              onSelect={(d) => { setSaftCustomTo(d); }}
                              disabled={(d) => saftCustomFrom ? d < saftCustomFrom : false}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mt-3">
                <Dialog open={showSAFTDialog} onOpenChange={(open) => {
                  setShowSAFTDialog(open);
                  if (!open) resetSAFTDialog();
                }}>
                  <DialogTrigger asChild>
                    <Button 
                      className="btn-gradient text-white gap-2"
                    >
                      <FileCode className="h-4 w-4" />
                      {t('generateSAFT')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-white dark:bg-[#1a1f1e] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader className="shrink-0">
                      <DialogTitle className="flex items-center gap-2 text-xl dark:text-white">
                        <Shield className="h-5 w-5 text-[#0d9488]" />
                        {t('saftFileGeneration')}
                      </DialogTitle>
                      <DialogDescription className="dark:text-gray-400">
                        {language === 'da' 
                          ? `Skattestyrelsen kompatibel revisionsfil for ${saftPeriodLabel}`
                          : `Danish Tax Authority compliant audit file for ${saftPeriodLabel}`}
                      </DialogDescription>
                    </DialogHeader>

                    {/* Scrollable body area */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Step: Select */}
                    {saftStep === 'select' && (
                      <div className="space-y-6 py-4">
                        <div className="bg-gradient-to-br from-[#0d9488]/5 to-[#0d9488]/5 dark:from-[#0d9488]/10 dark:to-[#0d9488]/10 rounded-xl p-4 sm:p-6 border border-[#0d9488]/20">
                          <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-[#0d9488]" />
                            {t('readyToGenerate')}
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">{t('saftPeriodRange')}:</span>
                              <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                {saftPeriodLabel}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">{t('transactions')}:</span>
                              <span className="ml-2 font-medium text-gray-900 dark:text-white">{saftTotals.count}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">{t('totalAmount')}:</span>
                              <span className="ml-2 font-medium text-gray-900 dark:text-white">{tc(saftTotals.totalAmount)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">{language === 'da' ? 'Net moms' : 'Net VAT'}:</span>
                              <span className="ml-2 font-medium text-gray-900 dark:text-white">{tc(saftTotals.netVAT)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <CheckCircle2 className="h-4 w-4 text-[#0d9488]" />
                          {t('compliantWith')}
                        </div>

                        {saftTotals.count === 0 && (
                          <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <Info className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>
                              {language === 'da'
                                ? 'Den valgte periode indeholder ingen posteringer. Der vil blive genereret et nulregnskab, som er gyldigt ifølge Skattestyrelsens krav.'
                                : 'The selected period has no transactions. A zero-balance SAF-T file will be generated, which is valid per Danish Tax Authority requirements.'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Steps: Validating / Generating */}
                    {(saftStep === 'validating' || saftStep === 'generating') && (
                      <div className="space-y-6 py-8">
                        <div className="text-center">
                          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-[#0d9488] to-[#0d9488] mb-4">
                            <Loader2 className="h-8 w-8 text-white animate-spin" />
                          </div>
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            {saftStep === 'validating' ? t('validatingData') : t('generatingXML')}
                          </h4>
                          <p className="text-gray-500 dark:text-gray-400 text-sm">
                            {t('pleaseWait')}
                          </p>
                        </div>
                        <div className="max-w-md mx-auto space-y-2">
                          <Progress value={exportProgress} className="h-2" />
                          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                            {exportProgress}% {t('complete')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step: Preview */}
                    {saftStep === 'preview' && (
                      <div className="space-y-4 py-4">
                        {/* Validation Status */}
                        {saftValidation && (
                          <div className={`flex items-center gap-3 p-4 rounded-lg ${
                            saftValidation.hasErrors 
                              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                              : saftValidation.hasWarnings
                                ? 'bg-[#0d9488]/5 dark:bg-[#0d9488]/10 border border-[#0d9488]/20'
                                : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          }`}>
                            {saftValidation.hasErrors ? (
                              <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                            ) : saftValidation.hasWarnings ? (
                              <Info className="h-5 w-5 text-[#0d9488] shrink-0" />
                            ) : (
                              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                            )}
                            <div className="flex-1">
                              <p className={`font-medium ${
                                saftValidation.hasErrors 
                                  ? 'text-red-700 dark:text-red-400' 
                                  : saftValidation.hasWarnings
                                    ? 'text-[#0d9488] dark:text-[#2dd4bf]'
                                    : 'text-green-700 dark:text-green-400'
                              }`}>
                                {saftValidation.hasErrors 
                                  ? `${saftValidation.errors} ${t('validationErrorsFound')}` 
                                  : saftValidation.hasWarnings
                                    ? `${saftValidation.warnings} ${t('infoNoteExportable')}`
                                    : t('allValidationsPassed')}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* XML Preview */}
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                          <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                              <FileCode className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t('xmlPreview')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {(saftPreview?.length || 0).toLocaleString()} {t('bytes')}
                              </Badge>
                              {!saftValidation?.hasErrors && (
                                <Button
                                  size="sm"
                                  onClick={downloadSAFT}
                                  className="h-7 gap-1.5 text-xs bg-[#0d9488] hover:bg-[#0d9488]/90 text-white"
                                >
                                  <Download className="h-3 w-3" />
                                  {language === 'da' ? 'Download .xml' : 'Download .xml'}
                                </Button>
                              )}
                            </div>
                          </div>
                          <pre 
                            ref={previewRef}
                            className="p-4 text-xs font-mono overflow-auto flex-1 min-h-[120px] max-h-[40vh] bg-gray-50/50 text-gray-800 dark:text-gray-300"
                          >
                            {saftPreview?.substring(0, 5000)}
                            {(saftPreview?.length || 0) > 5000 && '\n\n... (truncated for preview)'}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Step: Complete */}
                    {saftStep === 'complete' && (
                      <div className="space-y-6 py-8 text-center">
                        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-[#0d9488] to-[#0d9488] mb-4">
                          <CheckCircle className="h-8 w-8 text-white" />
                        </div>
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {t('saftFileDownloaded')}
                        </h4>
                        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
                          {t('saftFileReady')}
                        </p>
                      </div>
                    )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0 shrink-0 pt-2 border-t border-gray-100 dark:border-gray-800">
                      {saftStep === 'select' && (
                        <Button onClick={generateSAFT} className="btn-gradient text-white gap-2">
                          <Sparkles className="h-4 w-4" />
                          {t('startGeneration')}
                        </Button>
                      )}
                      {saftStep === 'preview' && (
                        <>
                          <Button variant="outline" onClick={resetSAFTDialog} className="gap-2 dark:border-white/20">
                            <Eye className="h-4 w-4" />
                            {t('regenerate')}
                          </Button>
                          <Button 
                            onClick={downloadSAFT} 
                            className="btn-gradient text-white gap-2"
                            disabled={saftValidation?.hasErrors}
                          >
                            <Download className="h-4 w-4" />
                            {t('downloadSAFTFile')}
                          </Button>
                        </>
                      )}
                      {saftStep === 'complete' && (
                        <Button onClick={() => {
                          setShowSAFTDialog(false);
                          resetSAFTDialog();
                        }} className="btn-gradient text-white">
                          {t('done')}
                        </Button>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Other Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* CSV Export */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5 hover:shadow-xl transition-shadow">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl stat-icon-emerald flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-6 w-6 text-[#0d9488]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {t('transactionsCSV')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('exportAllTransactions')}
                </p>
                <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  {totals.count} {t('totalTransactions')} • {tc(totals.totalAmount)}
                </div>
              </div>
            </div>
            <Button
              onClick={exportCSV}
              disabled={isExporting !== null || totals.count === 0}
              className="w-full mt-4 btn-gradient text-white gap-2"
            >
              {isExporting === 'csv' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('downloadCSV')}
            </Button>
          </CardContent>
        </Card>

        {/* VAT Report */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5 hover:shadow-xl transition-shadow">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl stat-icon-blue flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6 text-[#2dd4bf]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {t('vatReportCSV')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('monthlyVATSummary')}
                </p>
                <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  {language === 'da' ? 'Net moms' : 'Net VAT'}: {tc(totals.netVAT)}
                </div>
              </div>
            </div>
            <Button
              onClick={exportVATReport}
              disabled={isExporting !== null || totals.count === 0}
              className="w-full mt-4 btn-gradient text-white gap-2"
            >
              {isExporting === 'vat' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('downloadReport')}
            </Button>
          </CardContent>
        </Card>

        {/* OIOUBL Export */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5 hover:shadow-xl transition-shadow">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl stat-icon-violet flex items-center justify-center shrink-0">
                <Archive className="h-6 w-6 text-[#0d9488]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {t('oioublInvoices')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t('peppolCompliant')}
                </p>
                <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  {filteredTransactions.length} {t('invoices')}
                </div>
              </div>
            </div>
            <Button
              onClick={exportAllOIOUBL}
              disabled={isExporting !== null || filteredTransactions.length === 0}
              className="w-full mt-4 btn-gradient text-white gap-2"
            >
              {isExporting === 'oioubl' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              {t('exportAllXML')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <Card className="hero-gradient border-0 shadow-xl text-white">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">
                {format(new Date(`${selectedYear}-${selectedMonth.padStart(2, '0')}-01`), 'MMMM yyyy')}
              </h3>
              <p className="text-white/80">
                {totals.count} {t('transactionsWord')} • {tc(totals.totalAmount)} {language === 'da' ? 'ialt' : 'total'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/80 text-xs sm:text-sm">{language === 'da' ? 'Net moms (udgående - indgående)' : 'Net VAT (output - input)'}</p>
              <p className="text-xl sm:text-3xl font-bold">{tc(totals.netVAT)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
