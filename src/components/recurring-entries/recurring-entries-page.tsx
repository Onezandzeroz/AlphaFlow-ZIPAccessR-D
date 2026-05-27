'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/auth-store';
import { useTranslation } from '@/lib/use-translation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Loader2,
  RefreshCw,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  CalendarClock,
  Repeat,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';

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
  PAUSED: { label_da: 'Pauset', label_en: 'Paused', className: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20' },
  COMPLETED: { label_da: 'Afsluttet', label_en: 'Completed', className: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/20' },
};

// ─── Component ────────────────────────────────────────────────────

export function RecurringEntriesPage({ user, hideHeader }: { user: User; hideHeader?: boolean }) {
  const { language, td } = useTranslation();
  const { guardWriteAccess } = useWriteAccessGuard(user);
  const [entries, setEntries] = useState<RecurringEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuteDialogOpen, setIsExecuteDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // ─── Execute handler ──────────────────────────────────────────

  const handleExecute = async () => {
    if (!executingId) return;
    setIsExecuting(true);
    try {
      const res = await fetch('/api/recurring-entries/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: executingId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to execute');
      }

      setIsExecuteDialogOpen(false);
      setExecutingId(null);
      fetchData();
    } catch (err) {
      console.error('Execute error:', err);
    } finally {
      setIsExecuting(false);
    }
  };

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
        fetchData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────

  const isOverdue = (entry: RecurringEntry) => {
    return entry.status === 'ACTIVE' && new Date(entry.nextExecution) < new Date();
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
            <p className={`text-lg sm:text-2xl font-bold mt-0.5 ${entries.some((e) => isOverdue(e)) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {entries.filter((e) => isOverdue(e)).length}
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
            {language === 'da' ? 'Skabeloner' : 'Templates'}
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
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-white/5">
                    <TableHead>{language === 'da' ? 'Navn' : 'Name'}</TableHead>
                    <TableHead>{language === 'da' ? 'Frekvens' : 'Frequency'}</TableHead>
                    <TableHead className="hidden sm:table-cell">{language === 'da' ? 'Næste' : 'Next'}</TableHead>
                    <TableHead>{language === 'da' ? 'Status' : 'Status'}</TableHead>
                    <TableHead className="text-right">{language === 'da' ? 'Handlinger' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className={isOverdue(entry) ? 'bg-red-50 dark:bg-red-500/5' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{entry.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                            {entry.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getFrequencyLabel(entry.frequency)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
                          <span className={`text-sm ${isOverdue(entry) ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                            {td(new Date(entry.nextExecution))}
                          </span>
                          {isOverdue(entry) && (
                            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                              {language === 'da' ? 'Forfalden' : 'Overdue'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {entry.status === 'ACTIVE' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                              onClick={() => { setExecutingId(entry.id); setIsExecuteDialogOpen(true); }}
                              title={language === 'da' ? 'Udfør nu' : 'Execute now'}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {(entry.status === 'ACTIVE' || entry.status === 'PAUSED') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700"
                              onClick={() => handleTogglePause(entry)}
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
                              onClick={() => { setDeleteId(entry.id); setIsDeleteDialogOpen(true); }}
                              title={language === 'da' ? 'Annuller' : 'Cancel'}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Execute Confirmation Dialog ═══ */}
      <AlertDialog open={isExecuteDialogOpen} onOpenChange={setIsExecuteDialogOpen}>
        <AlertDialogContent className="bg-white dark:bg-[#1a1f1e]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-green-600" />
              {language === 'da' ? 'Udfør postering?' : 'Execute Entry?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'da'
                ? 'Dette opretter en ny bogført journalpost baseret på skabelonen. Handlingen kan ikke fortrydes.'
                : 'This will create a new posted journal entry based on the template. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecute}
              disabled={isExecuting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {language === 'da' ? 'Udfør' : 'Execute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                ? 'Skabelonen markeres som afsluttet. Allerede oprettede poster bevares.'
                : 'The template will be marked as completed. Already created entries are preserved.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'da' ? 'Annuller' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {language === 'da' ? 'Afslut skabelon' : 'Complete Template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
