'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  RefreshCw,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  CalendarClock,
  Repeat,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Check,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

import { toLocalDate, daysBetween, addFrequency, parseLocalDate, todayLocal } from '@/lib/date-utils';
import { RecurringFrequency } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────

interface RecurringEntry {
  id: string;
  name: string;
  description: string;
  frequency: string;
  status: string;
  startDate: string;
  endDate: string | null;
  nextExecution: string;
  lastExecuted: string | null;
  lines: any;
  reference: string | null;
  isOverdue?: boolean;
}

interface TimelineDate {
  date: Date;
  status: 'past' | 'next' | 'future';
}

// ─── Constants ────────────────────────────────────────────────────

const FREQUENCY_LABELS: Record<string, { da: string; en: string }> = {
  DAILY: { da: 'Daglig', en: 'Daily' },
  WEEKLY: { da: 'Ugentlig', en: 'Weekly' },
  MONTHLY: { da: 'Månedlig', en: 'Monthly' },
  QUARTERLY: { da: 'Kvartalsvis', en: 'Quarterly' },
  YEARLY: { da: 'Årlig', en: 'Yearly' },
};

const STATUS_CONFIG: Record<string, { label_da: string; label_en: string; className: string }> = {
  ACTIVE: { label_da: 'Aktiv', label_en: 'Active', className: 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20' },
  PAUSED: { label_da: 'Pauset', label_en: 'Paused', className: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-500/20' },
  COMPLETED: { label_da: 'Afsluttet', label_en: 'Completed', className: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20' },
};

// ─── Helper: Add frequency to a date (imported from date-utils) ───
// Kept as local alias for component use

// ─── Helper: Generate timeline dates ──────────────────────────────

function generateTimeline(entry: RecurringEntry, maxDots: number = 24): TimelineDate[] {
  const dates: TimelineDate[] = [];
  // Parse all dates as local midnight — avoids UTC timezone drift
  const start = parseLocalDate(entry.startDate.split('T')[0]);
  const end = entry.endDate ? parseLocalDate(entry.endDate.split('T')[0]) : null;

  const completed = entry.status === 'COMPLETED';

  // Timeline is calendar-based relative to TODAY:
  //   dot <= today   → "past"  (green — purchase already done)
  //   first > today  → "next"  (pulsing blue — upcoming payment)
  //   subsequent      → "future" (gray)
  // The first dot (startDate) is ALWAYS green — it represents the
  // first purchase in the cycle.
  // For COMPLETED entries: no "next" or "future" dots — all are "past".
  const today = todayLocal();
  const todayMs = today.getTime();

  let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let dotCount = 0;
  let foundNext = false;

  while (dotCount < maxDots) {
    const dotMs = new Date(
      current.getFullYear(), current.getMonth(), current.getDate()
    ).getTime();

    // Stop if past end date
    if (end && dotMs > end.getTime()) break;

    let status: TimelineDate['status'];

    if (completed || dotMs <= todayMs) {
      // Completed entry → all dots are past (no pulse, no future)
      // Or today/in the past → purchase already done
      status = 'past';
    } else if (!foundNext) {
      // First date strictly after today → next upcoming purchase
      status = 'next';
      foundNext = true;
    } else {
      // Subsequent future dates
      status = 'future';
    }

    dates.push({
      date: new Date(current),
      status,
    });

    dotCount++;
    current = addFrequency(current, entry.frequency as RecurringFrequency);
  }

  return dates;
}

// ─── Helper: Get amount from lines ───────────────────────────────

function getAmountFromLines(lines: any): number | null {
  if (!lines || !Array.isArray(lines)) return null;
  const totalDebit = lines.reduce((sum: number, l: any) => sum + (l.debit || 0), 0);
  return totalDebit > 0 ? totalDebit : null;
}

// ─── Helper: Format amount ────────────────────────────────────────

function formatAmount(amount: number, language: string): string {
  return new Intl.NumberFormat(language === 'da' ? 'da-DK' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Helper: Count total scheduled payments ───────────────────────

function countTotalPayments(entry: RecurringEntry): number {
  const start = toLocalDate(entry.startDate);
  const end = entry.endDate ? toLocalDate(entry.endDate) : null;
  const maxCount = 1000; // Safety limit

  let current = new Date(start);
  let count = 0;

  while (count < maxCount) {
    if (end && toLocalDate(current) > end) break;
    count++;
    current = addFrequency(current, entry.frequency as RecurringFrequency);
  }

  return count;
}

// ─── Helper: Get next payment date (calendar-based) ──────────
// Returns the first scheduled payment date strictly after today.
// This matches the timeline's blue pulsing "next" dot.

function getNextPaymentDate(entry: RecurringEntry): Date | null {
  const start = parseLocalDate(entry.startDate.split('T')[0]);
  const end = entry.endDate ? parseLocalDate(entry.endDate.split('T')[0]) : null;
  const today = todayLocal();
  const todayMs = today.getTime();

  let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const maxIter = 1000;

  for (let i = 0; i < maxIter; i++) {
    const dotMs = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
    if (end && dotMs > end.getTime()) return null; // past end date → no next
    if (dotMs > todayMs) return new Date(current);
    current = addFrequency(current, entry.frequency as RecurringFrequency);
  }
  return null;
}

// ─── Helper: Get last payment date (calendar-based) ───────────
// Returns the last scheduled payment date on or before today.
// This matches the timeline's last green "past" dot.

function getLastPaymentDate(entry: RecurringEntry): Date | null {
  const start = parseLocalDate(entry.startDate.split('T')[0]);
  const today = todayLocal();
  const todayMs = today.getTime();

  let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let last: Date | null = null;
  const maxIter = 1000;

  for (let i = 0; i < maxIter; i++) {
    const dotMs = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
    if (dotMs > todayMs) break;
    last = new Date(current);
    current = addFrequency(current, entry.frequency as RecurringFrequency);
  }
  return last;
}

// ─── Helper: Count past payments (calendar-based) ───────────────
// Counts how many scheduled payment dates fall on or before today.
// Matches the green-dot count shown in the timeline.

function countPastPayments(entry: RecurringEntry): number {
  const start = parseLocalDate(entry.startDate.split('T')[0]);
  const today = todayLocal();
  const todayMs = today.getTime();

  let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let count = 0;
  const maxCount = 1000;

  while (count < maxCount) {
    const dotMs = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
    if (dotMs > todayMs) break;
    count++;
    current = addFrequency(current, entry.frequency as RecurringFrequency);
  }

  return count;
}

// ─── Component ────────────────────────────────────────────────────

export function RecurringEntriesPage({ user, hideHeader }: { user: User; hideHeader?: boolean }) {
  const { language, td } = useTranslation();
  const [entries, setEntries] = useState<RecurringEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ─── Fetch data ────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const entriesRes = await fetch('/api/recurring-entries');

      if (!entriesRes.ok) throw new Error('Failed to fetch recurring entries');

      const entriesData = await entriesRes.json();

      setEntries(entriesData.recurringEntries || []);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(language === 'da' ? 'Kunne ikke hente data' : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, [language]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Toggle pause ─────────────────────────────────────────────

  const handleTogglePause = async (entry: RecurringEntry) => {
    try {
      const newStatus = entry.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
      const res = await fetch('/api/recurring-entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: newStatus }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Toggle pause error:', err);
    }
  };

  // ─── Delete handler ───────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch('/api/recurring-entries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteId }),
      });
      if (res.ok) {
        setIsDeleteDialogOpen(false);
        setDeleteId(null);
        setExpandedId(null);
        fetchData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────

  const isEntryOverdue = (entry: RecurringEntry) => {
    // Use server-provided isOverdue if available, otherwise calculate client-side
    // Never overdue if never executed (e.g. just created with past start date)
    if (entry.isOverdue !== undefined) return entry.isOverdue;
    if (!entry.lastExecuted) return false;
    const nextExec = toLocalDate(new Date(entry.nextExecution));
    const today = toLocalDate(new Date());
    return entry.status === 'ACTIVE' && nextExec < today;
  };

  const getFrequencyLabel = (freq: string) => {
    const f = FREQUENCY_LABELS[freq];
    return f ? (language === 'da' ? f.da : f.en) : freq;
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status];
    if (!config) return null;
    return (
      <Badge variant="outline" className={config.className}>
        {language === 'da' ? config.label_da : config.label_en}
      </Badge>
    );
  };

  const handleRowClick = (entryId: string) => {
    setExpandedId(prev => prev === entryId ? null : entryId);
  };

  const getActionHandlers = (entry: RecurringEntry) => {
    return {
      togglePause: (e: React.MouseEvent) => {
        e.stopPropagation();
        handleTogglePause(entry);
      },
      delete: (e: React.MouseEvent) => {
        e.stopPropagation();
        setDeleteId(entry.id);
        setIsDeleteDialogOpen(true);
      },
    };
  };

  // ─── Loading skeleton ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      {!hideHeader && (
      <PageHeader
        title={language === 'da' ? 'Gentagende Posteringer' : 'Recurring Entries'}
        description={language === 'da'
          ? 'Automatisér gentagende bilag som husleje, løn og abonnementer'
          : 'Automate recurring postings like rent, salaries, and subscriptions'}
        action={
          <Button onClick={fetchData} className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 font-medium transition-all lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm">
            <RefreshCw className="h-4 w-4" />
            {language === 'da' ? 'Opdater' : 'Refresh'}
          </Button>
        }
      />
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData} className="ml-auto">
              {language === 'da' ? 'Prøv igen' : 'Retry'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {entries.length > 0 && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Aktive' : 'Active'}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {entries.filter((e) => e.status === 'ACTIVE').length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Pauset' : 'Paused'}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {entries.filter((e) => e.status === 'PAUSED').length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Forfaldne' : 'Overdue'}
            </p>
            <p className={`text-lg sm:text-2xl font-bold mt-0.5 ${entries.some((e) => isEntryOverdue(e)) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {entries.filter((e) => isEntryOverdue(e)).length}
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-3 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {language === 'da' ? 'Afsluttede' : 'Completed'}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {entries.filter((e) => e.status === 'COMPLETED').length}
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Entries Table */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            {language === 'da' ? 'Posteringer' : 'Entries'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <Repeat className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {language === 'da'
                  ? 'Ingen gentagende posteringer endnu'
                  : 'No recurring entries yet'}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {language === 'da'
                  ? 'Opret gentagende indkøb fra indkøbsformularen ved at slå "Gentagende indkøb" til'
                  : 'Create recurring purchases from the purchase form by toggling "Recurring Purchase" on'}
              </p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-white/5">
                    <TableHead className="w-8"></TableHead>
                    <TableHead>{language === 'da' ? 'Navn' : 'Name'}</TableHead>
                    <TableHead>{language === 'da' ? 'Frekvens' : 'Frequency'}</TableHead>
                    <TableHead className="hidden sm:table-cell">{language === 'da' ? 'Næste' : 'Next'}</TableHead>
                    <TableHead>{language === 'da' ? 'Status' : 'Status'}</TableHead>
                    <TableHead className="text-right">{language === 'da' ? 'Handlinger' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const overdue = isEntryOverdue(entry);
                    const isCompleted = entry.status === 'COMPLETED';
                    const isExpanded = expandedId === entry.id;
                    const actions = getActionHandlers(entry);
                    const timeline = generateTimeline(entry);
                    const amount = getAmountFromLines(entry.lines);
                    const totalPayments = entry.endDate ? countTotalPayments(entry) : null;
                    const pastPayments = countPastPayments(entry);
                    const nextPaymentDate = getNextPaymentDate(entry);
                    const lastPaymentDate = getLastPaymentDate(entry);

                    return (
                      <React.Fragment key={entry.id}>
                        {/* Main row — clickable */}
                        <TableRow
                          className={`${overdue ? 'bg-red-50 dark:bg-red-500/5' : ''} ${isExpanded ? 'border-b-0' : ''} ${isCompleted ? 'opacity-50' : ''} cursor-pointer hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors`}
                          onClick={() => handleRowClick(entry.id)}
                        >
                          {/* Expand/collapse chevron */}
                          <TableCell className="w-8 px-2">
                            <div className="flex items-center justify-center">
                              {isExpanded
                                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                : <ChevronDown className="h-4 w-4 text-gray-400" />
                              }
                            </div>
                          </TableCell>

                          {/* Name */}
                          <TableCell>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{entry.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                {entry.description}
                              </p>
                            </div>
                          </TableCell>

                          {/* Frequency */}
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getFrequencyLabel(entry.frequency)}
                            </Badge>
                          </TableCell>

                          {/* Next execution */}
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex items-center gap-1.5">
                              <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
                              <span className={`text-sm ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                                {nextPaymentDate ? td(nextPaymentDate) : '—'}
                              </span>
                              {overdue && (
                                <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                                  {language === 'da' ? 'Forfalden' : 'Overdue'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell>{getStatusBadge(entry.status)}</TableCell>

                          {/* Actions */}
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {(entry.status === 'ACTIVE' || entry.status === 'PAUSED') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700"
                                  onClick={actions.togglePause}
                                  title={entry.status === 'PAUSED' ? (language === 'da' ? 'Genoptag' : 'Resume') : (language === 'da' ? 'Pause' : 'Pause')}
                                >
                                  {entry.status === 'PAUSED' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                                </Button>
                              )}
                              {entry.status !== 'COMPLETED' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                                  onClick={actions.delete}
                                  title={language === 'da' ? 'Annuller' : 'Cancel'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <TableRow className={`${isCompleted ? 'opacity-50' : ''} bg-gray-50/50 dark:bg-white/[0.02] hover:bg-gray-50/50 dark:hover:bg-white/[0.02]`}>
                            <TableCell colSpan={6} className="p-0">
                              <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4">
                                {/* Detail grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                  {/* Period */}
                                  <div className="flex items-start gap-2.5">
                                    <div className="mt-0.5 p-1.5 rounded-md bg-teal-500/10">
                                      <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {language === 'da' ? 'Periode' : 'Period'}
                                      </p>
                                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                                        {td(new Date(entry.startDate))}
                                        {entry.endDate ? ` — ${td(new Date(entry.endDate))}` : ` — ∞`}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Frequency */}
                                  <div className="flex items-start gap-2.5">
                                    <div className="mt-0.5 p-1.5 rounded-md bg-blue-500/10">
                                      <Repeat className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {language === 'da' ? 'Frekvens' : 'Frequency'}
                                      </p>
                                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                                        {getFrequencyLabel(entry.frequency)}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Amount */}
                                  {amount !== null && (
                                    <div className="flex items-start gap-2.5">
                                      <div className="mt-0.5 p-1.5 rounded-md bg-green-500/10">
                                        <span className="text-xs font-bold text-green-600 dark:text-green-400">DKK</span>
                                      </div>
                                      <div>
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                          {language === 'da' ? 'Beløb pr. betaling' : 'Amount per payment'}
                                        </p>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                                          {formatAmount(amount, language)} DKK
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Last executed */}
                                  <div className="flex items-start gap-2.5">
                                    <div className="mt-0.5 p-1.5 rounded-md bg-purple-500/10">
                                      <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div>
                                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {language === 'da' ? 'Sidst udført' : 'Last executed'}
                                      </p>
                                      <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                                        {lastPaymentDate
                                          ? td(lastPaymentDate)
                                          : (language === 'da' ? 'Aldrig' : 'Never')}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <Separator />

                                {/* Timeline */}
                                <div>
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                      {language === 'da' ? 'Betalingsplan' : 'Payment Schedule'}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                      <span className="flex items-center gap-1">
                                        <span className="inline-block w-2 h-2 rounded-full bg-[#05df72]" />
                                        {language === 'da' ? 'Udført' : 'Done'}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <span className={`inline-block w-2 h-2 rounded-full ${entry.status === 'PAUSED' ? 'bg-orange-500' : 'bg-[#00d5be]'}`} />
                                        {language === 'da' ? 'Næste' : 'Next'}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <span className="inline-block w-2 h-2 rounded-full bg-[#4a5565]" />
                                        {language === 'da' ? 'Fremtidig' : 'Future'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Timeline track */}
                                  <div className="overflow-x-auto">
                                    <div className="relative min-w-max pt-3 pb-2">
                                      <div className="flex items-center gap-0">
                                      {/* The track line — centered on 12px dots (pt-3 + 6px) */}
                                      <div className="absolute top-[18px] left-2 right-2 h-[2px] bg-gray-200 dark:bg-gray-700 z-0" />

                                      {timeline.map((item, idx) => {
                                        const isPaused = entry.status === 'PAUSED';
                                        const isPast = item.status === 'past';
                                        const isNext = item.status === 'next';
                                        const isFuture = item.status === 'future';

                                        return (
                                          <Tooltip key={idx}>
                                            <TooltipTrigger asChild>
                                              <div className="relative flex flex-col items-center w-10 sm:w-12">
                                                {/* Dot */}
                                                {isPast ? (
                                                  <div className="w-3 h-3 rounded-full bg-[#05df72] relative z-20 flex items-center justify-center">
                                                    <Check className="h-2 w-2 text-white" strokeWidth={3} />
                                                  </div>
                                                ) : isNext ? (
                                                  <div className="relative z-20">
                                                    <div className={`w-4 h-4 rounded-full ${isPaused ? 'bg-orange-500' : 'bg-[#00d5be]'} dot-pulse flex items-center justify-center`}>
                                                      <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-orange-300' : 'bg-[#00ffcc]'}`} />
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="w-3 h-3 rounded-full bg-[#4a5565] relative z-20" />
                                                )}
                                                {/* Label */}
                                                <span className={`text-[9px] sm:text-[10px] mt-1.5 whitespace-nowrap ${
                                                  isPast
                                                    ? 'text-[#05df72] font-medium'
                                                    : isNext && isPaused
                                                    ? 'text-orange-600 dark:text-orange-400 font-bold'
                                                    : isNext
                                                    ? 'text-[#00d5be] font-bold'
                                                    : 'text-[#4a5565]'
                                                }`}>
                                                  {item.date.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-GB', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                  })}
                                                </span>
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                              {td(item.date)}
                                              {isNext && isPaused && ` — ${language === 'da' ? 'pauset' : 'paused'}`}
                                              {isNext && !isPaused && ` — ${language === 'da' ? 'næste betaling' : 'next payment'}`}
                                              {isPast && ` — ${language === 'da' ? 'udført' : 'executed'}`}
                                            </TooltipContent>
                                          </Tooltip>
                                        );
                                      })}

                                      {/* More indicator if there could be more dates */}
                                      {!entry.endDate && timeline.length >= 24 && (
                                        <div className="relative flex flex-col items-center w-8 ml-1">
                                          <div className="w-3 h-3 rounded-full z-10 bg-[#4a5565]" />
                                          <span className="text-[9px] text-gray-400 dark:text-gray-500 mt-1.5">…</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                  {/* Today marker */}
                                  {timeline.length > 0 && (
                                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                                      <span className="flex items-center gap-1">
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        {language === 'da'
                                          ? `Næste betaling: ${nextPaymentDate ? td(nextPaymentDate) : '—'}`
                                          : `Next payment: ${nextPaymentDate ? td(nextPaymentDate) : '—'}`
                                        }
                                      </span>
                                      {totalPayments !== null && (
                                        <span>
                                          {language === 'da'
                                            ? `${Math.max(0, pastPayments)} af ${totalPayments} betalinger udført`
                                            : `${Math.max(0, pastPayments)} of ${totalPayments} payments executed`
                                          }
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Delete Confirmation Dialog ═══ */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {language === 'da' ? 'Annuller gentagende postering?' : 'Cancel Recurring Entry?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'da'
                ? 'Posteringen markeres som afsluttet. Allerede oprettede poster bevares.'
                : 'The entry will be marked as completed. Already created entries are preserved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {language === 'da' ? 'Afslut postering' : 'Complete Entry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
