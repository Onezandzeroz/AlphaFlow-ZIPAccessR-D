'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLanguageStore } from '@/lib/language-store';
import { useNotificationStore } from '@/lib/notification-store';
import { formatDistanceToNow } from 'date-fns';
import { da, enGB } from 'date-fns/locale';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Bell,
  AlertTriangle,
  Calculator,
  Landmark,
  BookOpen,
  CheckCircle2,
  X,
} from 'lucide-react';

interface NotificationCenterProps {
  onNavigate: (view: string) => void;
}

interface NotificationItem {
  id: string;
  type: 'overdue' | 'vat' | 'bank-recon' | 'journal';
  icon: React.ReactNode;
  title: string;
  description: string;
  timeAgo: string;
  /** Absolute timestamp (ms) used for sorting — newest first */
  timestamp: number;
  actionView: string;
  actionLabel: string;
}

// Bilingual strings
const strings = {
  da: {
    title: 'Notifikationer',
    markAllRead: 'Markér alle som læst',
    emptyTitle: 'Ingen notifikationer',
    emptyDesc: 'Du er helt opdateret!',
    overdueInvoices: 'Forfaldne fakturaer',
    overdueDescSingle: '1 faktura er forfalden og afventer betaling',
    overdueDescMulti: (count: number) =>
      `${count} fakturaer er forfaldne og afventer betaling`,
    vatDeadline: 'Momsfrist nærmer sig',
    vatDesc: 'Momsrapporten for perioden skal indsendes',
    bankRecon: 'Bankafstemning',
    bankReconDesc: 'Gennemgå bankafstemning for uafstemte posteringer',
    recentJournal: 'Seneste posteringer',
    recentJournalDesc: (ref: string, desc: string) =>
      `${ref}: ${desc}`,
    viewInvoices: 'Vis fakturaer',
    viewVat: 'Momsrapport',
    viewBankRecon: 'Bankafstemning',
    viewJournal: 'Finansjournal',
  },
  en: {
    title: 'Notifications',
    markAllRead: 'Mark all as read',
    emptyTitle: 'No notifications',
    emptyDesc: "You're all caught up!",
    overdueInvoices: 'Overdue Invoices',
    overdueDescSingle: '1 invoice is overdue and awaiting payment',
    overdueDescMulti: (count: number) =>
      `${count} invoices are overdue and awaiting payment`,
    vatDeadline: 'VAT Deadline Approaching',
    vatDesc: 'VAT report for the period needs to be filed',
    bankRecon: 'Bank Reconciliation',
    bankReconDesc: 'Review bank reconciliation for unmatched transactions',
    recentJournal: 'Recent Journal Entries',
    recentJournalDesc: (ref: string, desc: string) =>
      `${ref}: ${desc}`,
    viewInvoices: 'View Invoices',
    viewVat: 'VAT Report',
    viewBankRecon: 'Bank Reconciliation',
    viewJournal: 'Journal',
  },
};

const FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes (fallback polling)
const READ_STATE_SYNC_INTERVAL = 30 * 1000; // 30 seconds — how often to poll read state from server for cross-device sync

export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const { language } = useLanguageStore();
  const { readIds, fetchReadState, markAsRead, markAllAsRead } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const t = strings[language];

  const locale = language === 'da' ? da : enGB;

  // Track whether we have loaded from server to prevent stale initial state.
  const hasLoadedFromServer = useRef(false);

  // ─── Read-state fetch on mount ───────────────────────────────
  useEffect(() => {
    fetchReadState().finally(() => {
      requestAnimationFrame(() => { hasLoadedFromServer.current = true; });
    });
  }, [fetchReadState]);

  // ─── Read-state fetch when popover OPENS ─────────────────────
  // Whenever the user clicks the bell, we get the latest read state
  // from the server. This is the primary cross-device sync trigger.
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      // Always fetch fresh read state when the popover opens
      fetchReadState(true);
    }
  }, [fetchReadState]);

  // ─── Read-state fetch on tab focus / visibility ──────────────
  // When user switches back to this tab from another app (e.g. from
  // their phone browser to their desktop browser), refresh read state.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchReadState(true);
      }
    };
    const onFocus = () => {
      fetchReadState(true);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchReadState]);

  // Compute next VAT deadline: 1st day of the 2nd following month
  const computeVatDeadline = useCallback((): Date => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-indexed
    const targetMonth = currentMonth + 2;
    const targetDate = new Date(now.getFullYear(), targetMonth, 1);
    return targetDate;
  }, []);

  // Fetch notification data from existing business-logic APIs
  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const items: NotificationItem[] = [];

      // 1. Fetch invoices for overdue check
      try {
        const invRes = await fetch('/api/invoices');
        if (invRes.ok) {
          const invData = await invRes.json();
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const overdueInvoices = (invData.invoices || []).filter(
            (inv: { status: string; dueDate: string; cancelled: boolean }) =>
              inv.status !== 'PAID' &&
              inv.status !== 'CANCELLED' &&
              !inv.cancelled &&
              new Date(inv.dueDate) < today
          );

          if (overdueInvoices.length > 0) {
            // Sort by due date descending to show most urgent first
            overdueInvoices.sort(
              (a: { dueDate: string }, b: { dueDate: string }) =>
                new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
            );

            // Create one notification per overdue invoice (up to 3)
            const showInvoices = overdueInvoices.slice(0, 3);
            for (const inv of showInvoices) {
              const dueDate = new Date(inv.dueDate);
              items.push({
                id: `overdue-${inv.id}`,
                type: 'overdue',
                icon: (
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                ),
                title: t.overdueInvoices,
                description: `${inv.invoiceNumber} — ${inv.customerName}`,
                timeAgo: formatDistanceToNow(dueDate, { addSuffix: true, locale }),
                timestamp: dueDate.getTime(),
                actionView: 'invoices',
                actionLabel: t.viewInvoices,
              });
            }

            // Summary notification if more than 3
            if (overdueInvoices.length > 3) {
              const lastDueDate = new Date(overdueInvoices[overdueInvoices.length - 1].dueDate);
              items.push({
                id: 'overdue-summary',
                type: 'overdue',
                icon: (
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                ),
                title: t.overdueInvoices,
                description: t.overdueDescMulti(overdueInvoices.length),
                timeAgo: formatDistanceToNow(lastDueDate, {
                  addSuffix: true,
                  locale,
                }),
                timestamp: lastDueDate.getTime(),
                actionView: 'invoices',
                actionLabel: t.viewInvoices,
              });
            }
          }
        }
      } catch {
        // Silently fail invoice fetch
      }

      // 2. VAT deadline notification
      const vatDeadline = computeVatDeadline();
      const daysUntilVat = Math.ceil(
        (vatDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      // Show if within 30 days
      if (daysUntilVat >= 0 && daysUntilVat <= 30) {
        items.push({
          id: 'vat-deadline',
          type: 'vat',
          icon: (
            <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
              <Calculator className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          ),
          title: t.vatDeadline,
          description:
            daysUntilVat <= 7
              ? `${language === 'da' ? 'Om' : 'In'} ${daysUntilVat} ${language === 'da' ? 'dage' : 'days'} — ${t.vatDesc}`
              : t.vatDesc,
          timeAgo: formatDistanceToNow(vatDeadline, { addSuffix: true, locale }),
          timestamp: vatDeadline.getTime(),
          actionView: 'vat-report',
          actionLabel: t.viewVat,
        });
      }

      // 3. Bank reconciliation reminder
      try {
        const bankRes = await fetch('/api/bank-reconciliation?status=unmatched');
        if (bankRes.ok) {
          const bankData = await bankRes.json();
          const statements = bankData.bankStatements || [];
          if (statements.length > 0) {
            const bankDate = new Date(statements[0].importDate || statements[0].startDate);
            items.push({
              id: 'bank-recon-reminder',
              type: 'bank-recon',
              icon: (
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                  <Landmark className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              ),
              title: t.bankRecon,
              description: t.bankReconDesc,
              timeAgo: formatDistanceToNow(bankDate, { addSuffix: true, locale }),
              timestamp: bankDate.getTime(),
              actionView: 'bank-recon',
              actionLabel: t.viewBankRecon,
            });
          }
        }
      } catch {
        // Silently fail bank fetch
      }

      // 4. Recent journal entries (last 3 posted)
      try {
        const journalRes = await fetch('/api/journal-entries?status=POSTED');
        if (journalRes.ok) {
          const journalData = await journalRes.json();
          const entries = (journalData.journalEntries || [])
            .filter((e: { cancelled: boolean }) => !e.cancelled)
            .slice(0, 3);

          for (const entry of entries) {
            const createdAt = new Date(entry.createdAt);
            items.push({
              id: `journal-${entry.id}`,
              type: 'journal',
              icon: (
                <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                  <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              ),
              title: t.recentJournal,
              description: t.recentJournalDesc(
                entry.reference || entry.id.slice(0, 8),
                entry.description || ''
              ),
              timeAgo: formatDistanceToNow(createdAt, {
                addSuffix: true,
                locale,
              }),
              timestamp: createdAt.getTime(),
              actionView: 'journal',
              actionLabel: t.viewJournal,
            });
          }
        }
      } catch {
        // Silently fail journal fetch
      }

      // *** KEY FIX: Sort all notifications by timestamp DESCENDING (newest first) ***
      items.sort((a, b) => b.timestamp - a.timestamp);

      setNotifications(items);
    } finally {
      setIsLoading(false);
    }
  }, [t, locale, language, computeVatDeadline]);

  // ─── Periodic polling (notification data + read state) ────────
  useEffect(() => {
    fetchNotifications();
    fetchReadState();

    // Full notification data + read state every 5 min
    const fullInterval = setInterval(() => {
      fetchNotifications();
      fetchReadState();
    }, FETCH_INTERVAL);

    // Read-state-only poll every 30 sec for faster cross-device sync
    const readStateInterval = setInterval(() => {
      fetchReadState();
    }, READ_STATE_SYNC_INTERVAL);

    return () => {
      clearInterval(fullInterval);
      clearInterval(readStateInterval);
    };
  }, [fetchNotifications, fetchReadState]);

  // Compute unread count from server-backed readIds
  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  // Handle notification click → mark as read (server-backed) + navigate
  const handleNotificationClick = useCallback(
    (notification: NotificationItem) => {
      markAsRead([notification.id]);
      setOpen(false);
      onNavigate(notification.actionView);
    },
    [onNavigate, markAsRead]
  );

  // Handle "Mark all as read" → mark ALL current notification IDs (server-backed)
  const handleMarkAllRead = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    markAllAsRead(allIds);
  }, [notifications, markAllAsRead]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative text-gray-500 dark:text-gray-400 hover:text-[#0d9488] dark:hover:text-[#2dd4bf] transition-colors"
          aria-label={t.title}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            {t.title}
          </h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-auto px-2 py-1 text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/10 dark:hover:bg-[#2dd4bf]/10 transition-colors"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t.markAllRead}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-auto w-7 p-0 text-gray-400 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Notifications List — sorted newest-first */}
        <div className="max-h-80 overflow-y-auto scrollable-thin">
          {isLoading ? (
            // Loading skeleton
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="h-12 w-12 rounded-full bg-[#0d9488]/10 dark:bg-[#2dd4bf]/10 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6 text-[#0d9488] dark:text-[#2dd4bf]" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {t.emptyTitle}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t.emptyDesc}
              </p>
            </div>
          ) : (
            // Flat list sorted by timestamp (newest first)
            <div className="divide-y divide-[var(--border)]">
              {notifications.map((notification, index) => {
                const isRead = readIds.has(notification.id);
                const isLast = index === notifications.length - 1;

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`
                      w-full flex items-start gap-3 px-4 py-3 text-left
                      transition-colors cursor-pointer relative
                      hover:bg-[#f0fdf9]/60 dark:hover:bg-[#1a2e2b]/50
                      ${isLast ? 'pb-3' : 'pb-2.5'}
                      ${!isRead ? 'bg-[#0d9488]/[0.03] dark:bg-[#2dd4bf]/[0.03]' : ''}
                    `}
                  >
                    {/* Unread indicator dot */}
                    {!isRead && (
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-[#0d9488] dark:bg-[#2dd4bf]" />
                    )}

                    {/* Icon */}
                    <div className="relative shrink-0">{notification.icon}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm text-foreground truncate ${
                            !isRead ? 'font-medium' : 'font-normal'
                          }`}
                        >
                          {notification.title}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {notification.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-muted-foreground/70">
                          {notification.timeAgo}
                        </span>
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 text-[10px] font-normal"
                        >
                          {notification.actionLabel}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && notifications.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-2.5 bg-muted/30">
              <p className="text-[11px] text-muted-foreground text-center">
                {language === 'da'
                  ? `${unreadCount} ulæst${unreadCount !== 1 ? 'e' : ''} af ${notifications.length}`
                  : `${unreadCount} unread of ${notifications.length}`}
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
