'use client';

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useLanguageStore } from '@/lib/language-store';
import { useTranslation } from '@/lib/use-translation';
import { useScannerStore } from '@/lib/scanner-store';
import { TransactionsPage } from '@/components/transactions/transactions-page';
import { RecurringEntriesPage } from '@/components/recurring-entries/recurring-entries-page';
import { PageHeader } from '@/components/shared/page-header';
import { AddTransactionForm } from '@/components/transaction/add-transaction-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Receipt, RefreshCw, Plus, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWriteAccessGuard } from '@/hooks/use-write-access-guard';

type PageView = 'list' | 'create';

interface PosteringerPageProps {
  user: any; // User type from auth-store
  defaultTab?: 'transactions' | 'recurring';
}

export function PosteringerPage({ user, defaultTab = 'transactions' }: PosteringerPageProps) {
  const { language } = useLanguageStore();
  const { t } = useTranslation();
  const isDa = language === 'da';
  const { guardWriteAccess } = useWriteAccessGuard(user);
  const [activeTab, setActiveTab] = useState<'transactions' | 'recurring'>(defaultTab);
  const [currentView, setCurrentView] = useState<PageView>('list');
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  const [recurringTrigger, setRecurringTrigger] = useState(0);

  // ── Viewport detection (lg = 1024px) ──
  const subscribeToMedia = useCallback((cb: () => void) => {
    const mql = window.matchMedia('(min-width: 1024px)');
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  }, []);
  const getIsDesktopSnapshot = useCallback(() => window.matchMedia('(min-width: 1024px)').matches, []);
  const getServerSnapshot = useCallback(() => false, []);
  const isDesktop = useSyncExternalStore(subscribeToMedia, getIsDesktopSnapshot, getServerSnapshot);

  // ── Standalone scanner flow (FAB → scan → form) ──
  const [preloadedFile, setPreloadedFile] = useState<File | null>(null);
  const lastConsumedIdRef = useRef<number>(0);

  const openFormWithScan = useCallback((result: { file: File; id: number }) => {
    if (result.id === lastConsumedIdRef.current) return;
    lastConsumedIdRef.current = result.id;
    requestAnimationFrame(() => {
      setPreloadedFile(result.file);
      // Desktop: full page only, Mobile: dialog only
      setCurrentView('create');
      if (!window.matchMedia('(min-width: 1024px)').matches) {
        setIsMobileDialogOpen(true);
      }
    });
  }, []);

  useEffect(() => {
    const existing = useScannerStore.getState().pendingResult;
    if (existing && existing.id !== lastConsumedIdRef.current) {
      const claimed = useScannerStore.getState().consumeResult();
      if (claimed) openFormWithScan(claimed);
    }
    const unsubscribe = useScannerStore.subscribe((state, prevState) => {
      if (state.pendingResult && !prevState.pendingResult) {
        const claimed = useScannerStore.getState().consumeResult();
        if (claimed) openFormWithScan(claimed);
      }
    });
    return () => unsubscribe();
  }, [openFormWithScan]);

  // ── Embedded scanner tracking (for mobile Dialog protection) ──
  const isScannerActiveRef = useRef(false);

  const handleSuccess = useCallback(() => {
    setCurrentView('list');
    setIsMobileDialogOpen(false);
    setPreloadedFile(null);
  }, []);

  const handleOpenRecurringDialog = useCallback(() => {
    guardWriteAccess(
      isDa ? 'Opret tilbagevendende postering' : 'Create recurring entry',
      () => setRecurringTrigger((prev) => prev + 1),
    );
  }, [guardWriteAccess, isDa]);

  const handleSwitchToRecurring = useCallback(() => {
    setCurrentView('list');
    setIsMobileDialogOpen(false);
    setActiveTab('recurring');
    setTimeout(() => guardWriteAccess(
      isDa ? 'Opret tilbagevendende postering' : 'Create recurring entry',
      () => setRecurringTrigger((prev) => prev + 1),
    ), 100);
  }, [guardWriteAccess, isDa]);

  const handleCancel = useCallback(() => {
    setCurrentView('list');
    setIsMobileDialogOpen(false);
    setPreloadedFile(null);
  }, []);

  // Mobile Dialog handlers (prevent close when scanner is active)
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open && isScannerActiveRef.current) return;
    setIsMobileDialogOpen(open);
    if (!open) {
      setPreloadedFile(null);
    }
  }, []);

  const handlePointerDownOutside = useCallback((e: Event) => {
    if (isScannerActiveRef.current) e.preventDefault();
  }, []);

  const handlePreloadedFileConsumed = useCallback(() => {
    setPreloadedFile(null);
  }, []);

  // Unified open handler: desktop → full page, mobile → dialog
  const handleAddClick = useCallback(() => {
    guardWriteAccess(isDa ? 'Tilføj indkøb' : 'Add Purchase', () => {
      setCurrentView('create');
      // Only open dialog on mobile (not desktop)
      if (!isDesktop) {
        setIsMobileDialogOpen(true);
      }
    });
  }, [guardWriteAccess, isDa, isDesktop]);

  const tabs = [
    { id: 'transactions' as const, labelDa: 'Alle posteringer', labelEn: 'All Transactions', icon: Receipt },
    { id: 'recurring' as const, labelDa: 'Gentagende posteringer', labelEn: 'Recurring Entries', icon: RefreshCw },
  ];

  // ── Full-page create form (desktop) ──
  const renderCreatePage = () => (
    <div className="p-3 lg:p-6 space-y-4 lg:space-y-6">
      <PageHeader
        title={isDa ? 'Tilføj indkøb' : 'Add Purchase'}
        description={isDa
          ? 'Vælg en omkostningskonto og bogfør købet i dobbelt-posteringsregnskabet'
          : 'Select an expense account and record the purchase in the double-entry ledger'}
        action={(
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-medium h-8 px-3"
          >
            <X className="h-3.5 w-3.5" />
            {isDa ? 'Annuller' : 'Cancel'}
          </Button>
        )}
      />
      <div>
        <AddTransactionForm
          layout="cards"
          onSuccess={handleSuccess}
          preloadedReceiptFile={preloadedFile}
          onPreloadedFileConsumed={handlePreloadedFileConsumed}
          onScannerActiveChange={(active) => { isScannerActiveRef.current = active; }}
        />
        <div className="pt-3 mt-3">
          <button
            type="button"
            onClick={handleSwitchToRecurring}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/5 dark:hover:bg-[#2dd4bf]/5 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="flex-1 text-left font-medium">
              {isDa ? 'Tilføj gentagende indkøb' : 'Add recurring purchase'}
            </span>
            <ArrowRight className="h-3.5 w-3.5 opacity-50" />
          </button>
        </div>
      </div>
    </div>
  );

  // ── Mobile Dialog create form ──
  const renderMobileDialog = () => (
    <Dialog open={isMobileDialogOpen && currentView === 'create'} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto dialog-bg-translucent backdrop-blur-md lg:backdrop-blur-none"
        onPointerDownOutside={handlePointerDownOutside}
      >
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#2dd4bf]" />
            {isDa ? 'Tilføj indkøb' : 'Add Purchase'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">{isDa
            ? 'Vælg en omkostningskonto og bogfør købet i dobbelt-posteringsregnskabet'
            : 'Select an expense account and record the purchase in the double-entry ledger'}
          </DialogDescription>
        </DialogHeader>
        <AddTransactionForm
          onSuccess={handleSuccess}
          preloadedReceiptFile={preloadedFile}
          onPreloadedFileConsumed={handlePreloadedFileConsumed}
          onScannerActiveChange={(active) => { isScannerActiveRef.current = active; }}
        />
        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-white/10">
          <button
            type="button"
            onClick={handleSwitchToRecurring}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-[#0d9488] dark:text-[#2dd4bf] hover:bg-[#0d9488]/5 dark:hover:bg-[#2dd4bf]/5 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="flex-1 text-left font-medium">
              {isDa ? 'Tilføj gentagende indkøb' : 'Add recurring purchase'}
            </span>
            <ArrowRight className="h-3.5 w-3.5 opacity-50" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Create view: desktop full page, mobile dialog ──
  if (currentView === 'create') {
    return (
      <>
        {/* Desktop: full page */}
        <div className="hidden lg:block">{renderCreatePage()}</div>
        {/* Mobile: dialog (list still renders behind it) */}
        <div className="lg:hidden">
          {renderListContent()}
        </div>
        {renderMobileDialog()}
      </>
    );
  }

  // ── List view ──
  return renderListContent();

  function renderListContent() {
    return (
      <div className="space-y-0">
        <div className="p-3 lg:p-6 pb-0">
          <PageHeader
            title={isDa ? 'Indkøb & Kvittering' : 'Purchases & Receipts'}
            description={isDa
              ? 'Registrer køb og vedhæft kvitteringer'
              : 'Record purchases and attach receipts'}
            action={(
              <Button
                onClick={handleAddClick}
                className="bg-[#0d9488] hover:bg-[#0f766e] text-white border border-[#0d9488] gap-2 lg:bg-white/20 lg:hover:bg-white/30 lg:border-white/30 lg:backdrop-blur-sm text-sm font-medium transition-all"
              >
                <Plus className="h-4 w-4" />
                {isDa ? 'Tilføj indkøb' : 'Add Purchase'}
              </Button>
            )}
          />
        </div>

        {/* Tab bar */}
        <div className="px-4 lg:px-8">
          <div className="flex items-center gap-1 border-b border-[#e2e8e6] dark:border-[#2a3330]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-150 -mb-px',
                    isActive
                      ? 'border-[#0d9488] text-[#0d9488] dark:border-[#2dd4bf] dark:text-[#2dd4bf]'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {isDa ? tab.labelDa : tab.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {activeTab === 'transactions' ? (
            <TransactionsPage user={user} hideHeader defaultTypeFilter="PURCHASE" />
          ) : (
            <RecurringEntriesPage user={user} hideHeader triggerCreate={recurringTrigger} />
          )}
        </div>
      </div>
    );
  }
}
