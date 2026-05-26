'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveSwitch } from '@/components/ui/responsive-switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  X,
  Info,
  BookOpen,
  Camera,
  Upload,
  Download,
  AlertTriangle,
  ArrowRightLeft,
  Loader2,
  Receipt,
  Plus,
  Package,
  Trash2,
  ScanSearch,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/use-translation';
import { toast } from 'sonner';
import { useAccessErrorHandler } from '@/hooks/use-access-error-handler';
import { ReceiptScanner } from '@/components/scanner/ReceiptScanner';
import { useOcr, type OCRResult } from '@/lib/ocr';

const CURRENCIES = ['DKK', 'EUR', 'USD', 'GBP', 'SEK', 'NOK'] as const;

interface ExpenseAccount {
  id: string;
  number: string;
  name: string;
  nameEn: string | null;
}

interface RecentDescription {
  description: string;
  type: string;
}

interface PurchaseLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatPercent: number;
  accountId: string;
}

interface AddTransactionFormProps {
  onSuccess: () => void;
  /** When set, a receipt file from the standalone scanner (FAB) should be
   *  preloaded into the form automatically. */
  preloadedReceiptFile?: File | null;
  /** Called after the preloaded file has been consumed (set in the form). */
  onPreloadedFileConsumed?: () => void;
  /** Called when the scanner opens (true) or closes (false). Used by parent Dialog
   *  to prevent Radix from treating scanner clicks as "outside clicks". */
  onScannerActiveChange?: (active: boolean) => void;
  /** Layout mode: 'compact' for dialogs, 'cards' for full-page desktop view */
  layout?: 'compact' | 'cards';
}

// Account category groupings for the Danish chart of accounts
const ACCOUNT_GROUPS: Array<{ labelDa: string; labelEn: string; range: [number, number] }> = [
  { labelDa: 'Vareforbrug', labelEn: 'Cost of Goods', range: [6000, 6999] },
  { labelDa: 'Personaleomkostninger', labelEn: 'Personnel', range: [7000, 7999] },
  { labelDa: 'Driftsomkostninger', labelEn: 'Operating Expenses', range: [8000, 8999] },
  { labelDa: 'Finansielle omkostninger', labelEn: 'Financial', range: [9000, 9400] },
  { labelDa: 'Skat', labelEn: 'Tax', range: [9500, 9500] },
];

// Format number with Danish locale for display
function formatDanishNumber(num: number): string {
  return num.toLocaleString('da-DK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function defaultToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const EMPTY_LINE_ITEM: PurchaseLineItem = {
  description: '',
  quantity: 1,
  unitPrice: 0,
  vatPercent: 25,
  accountId: '',
};

export function AddTransactionForm({ onSuccess, preloadedReceiptFile, onPreloadedFileConsumed, onScannerActiveChange, layout = 'compact' }: AddTransactionFormProps) {
  const { t, tc, language } = useTranslation();
  const isDa = language === 'da';
  const { handleMutationError } = useAccessErrorHandler();

  // ─── State ───
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [accountError, setAccountError] = useState('');

  const [date, setDate] = useState(defaultToday());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('DKK');
  const [exchangeRate, setExchangeRate] = useState('');
  const [includesVAT, setIncludesVAT] = useState(true);
  const [description, setDescription] = useState('');

  const [vatPercent, setVatPercent] = useState('25');

  // ─── OCR (unified hook — manages loading, progress, result, error) ───
  const { processFile: processOCR, result: ocrResult, loading: ocrLoading, progress: ocrProgress, error: ocrError, reset: resetOCR } = useOcr();

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptNaturalWidth, setReceiptNaturalWidth] = useState<number | null>(null);
  const [originalWasPdf, setOriginalWasPdf] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preloadedConsumedRef = useRef(false);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const receiptPreviewUrlRef = useRef<string | null>(null);
  const dateManuallySetRef = useRef(false);

  // ─── Purchase line items (for OCR + manual entry) ───
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineItem[]>([
    { ...EMPTY_LINE_ITEM },
  ]);

  // ─── Data ───
  const [expenseAccounts, setExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [recentDescriptions, setRecentDescriptions] = useState<RecentDescription[]>([]);
  const [descriptionsLoading, setDescriptionsLoading] = useState(false);
  const [showDescriptionSuggestions, setShowDescriptionSuggestions] = useState(false);

  // Notify parent when scanner is active
  useEffect(() => {
    onScannerActiveChange?.(scannerOpen);
  }, [scannerOpen, onScannerActiveChange]);

  // Fetch expense accounts (6000-9500) on mount
  useEffect(() => {
    async function fetchAccounts() {
      setAccountsLoading(true);
      try {
        const expRes = await fetch('/api/accounts?type=EXPENSE');
        if (expRes.ok) {
          const data = await expRes.json();
          const filtered = (data.accounts || []).filter(
            (acc: ExpenseAccount) => {
              const num = parseInt(acc.number, 10);
              return num >= 6000 && num <= 9500;
            }
          );
          setExpenseAccounts(filtered);
        }
      } catch { /* silent */ } finally {
        setAccountsLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  // Fetch recent descriptions on mount
  useEffect(() => {
    async function fetchDescriptions() {
      setDescriptionsLoading(true);
      try {
        const res = await fetch('/api/transactions/recent-descriptions');
        if (res.ok) {
          const data = await res.json();
          setRecentDescriptions(data.descriptions || []);
        }
      } catch { /* silent */ } finally {
        setDescriptionsLoading(false);
      }
    }
    fetchDescriptions();
  }, []);

  // ─── Calculations ───
  const parsedAmount = parseFloat(amount || '0');
  const parsedVatPercent = parseFloat(vatPercent || '0');
  const netAmount = includesVAT ? parsedAmount / (1 + parsedVatPercent / 100) : parsedAmount;
  const vatAmount = netAmount * parsedVatPercent / 100;
  const totalAmount = netAmount + vatAmount;

  // Line items totals
  const lineTotals = useMemo(() => {
    const subtotal = purchaseLines.reduce(
      (sum, item) => sum + (item.quantity * item.unitPrice), 0
    );
    const vatTotal = purchaseLines.reduce(
      (sum, item) => sum + ((item.quantity * item.unitPrice * item.vatPercent) / 100), 0
    );
    return { subtotal, vatTotal, total: subtotal + vatTotal };
  }, [purchaseLines]);

  // Group accounts by category for the dropdown
  const groupedAccounts = useMemo(() => {
    const groups: Array<{ labelDa: string; labelEn: string; accounts: ExpenseAccount[] }> = [];
    for (const group of ACCOUNT_GROUPS) {
      const accounts = expenseAccounts.filter((acc) => {
        const num = parseInt(acc.number, 10);
        return num >= group.range[0] && num <= group.range[1];
      });
      if (accounts.length > 0) {
        groups.push({ labelDa: group.labelDa, labelEn: group.labelEn, accounts });
      }
    }
    return groups;
  }, [expenseAccounts]);

  const selectedAccount = expenseAccounts.find((a) => a.id === selectedAccountId);

  // ─── Line item callbacks ───
  const addPurchaseLineItem = useCallback(() => {
    setPurchaseLines(prev => [...prev, { ...EMPTY_LINE_ITEM }]);
  }, []);

  const removePurchaseLineItem = useCallback((index: number) => {
    setPurchaseLines(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updatePurchaseLineItem = useCallback((index: number, field: keyof PurchaseLineItem, value: string | number) => {
    setPurchaseLines(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    );
  }, []);

  // ─── Receipt handling ───
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(isDa ? 'Filstørrelsen skal være under 10MB' : 'File size must be less than 10MB');
      return;
    }
    setError('');
    // Clear any previous OCR line items when new document is uploaded
    setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
    setReceiptNaturalWidth(null); // reset natural width for new file

    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }

    if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
      // ── PDF: Convert to PNG via server endpoint ──
      try {
        setReceiptPreview('loading');

        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/convert-pdf', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(errText || `Server error ${response.status}`);
        }

        // Get PNG blob from server
        const pngBlob = await response.blob();
        const pngFile = new File(
          [pngBlob],
          file.name.replace(/\.pdf$/i, '.png'),
          { type: 'image/png' },
        );

        // Create preview URL
        const previewUrl = URL.createObjectURL(pngBlob);
        if (receiptPreviewUrlRef.current) {
          URL.revokeObjectURL(receiptPreviewUrlRef.current);
        }
        receiptPreviewUrlRef.current = previewUrl;

        setReceiptFile(pngFile);
        setReceiptPreview(previewUrl);
        setOriginalWasPdf(true);

        console.log(
          `[PDF→PNG] Converted via server: ${(pngBlob.size / 1024).toFixed(0)}KB`,
        );
      } catch (err) {
        console.error('[PDF→PNG] Conversion failed:', err);
        setReceiptFile(null);
        setReceiptPreview(null);
        setOriginalWasPdf(false);

        toast.error(
          isDa ? 'Kunne ikke konvertere PDF' : 'Could not convert PDF',
          {
            description: isDa
              ? 'PDFen kunne ikke konverteres til billede. Prøv igen eller brug et screenshot i stedet.'
              : 'The PDF could not be converted to image. Try again or use a screenshot instead.',
            duration: 5000,
          },
        );
      }
    } else {
      // ── Images: use object URL directly ──
      setOriginalWasPdf(false);
      setReceiptFile(file);
      const previewUrl = URL.createObjectURL(file);
      receiptPreviewUrlRef.current = previewUrl;
      setReceiptPreview(previewUrl);
    }
  }, [isDa]);

  const clearReceipt = useCallback(() => {
    setReceiptFile(null);
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
      receiptPreviewUrlRef.current = null;
    }
    setReceiptPreview(null);
    setReceiptNaturalWidth(null);
    setOriginalWasPdf(false);
    resetOCR();
    setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [resetOCR]);

  // ─── Manual OCR trigger ───
  const handleManualOCR = useCallback(async () => {
    if (!receiptFile) return;

    // PDF-converted PNGs should use VLM for structured extraction (line items, description)
    // Regular images (camera/upload) use auto-detect → Tesseract
    const result = await processOCR(receiptFile, {
      source: 'upload',
      processor: originalWasPdf ? 'vlm' : 'auto',
    });
    if (!result) {
      toast.error(
        isDa ? 'Kunne ikke læse dokumentet' : 'Could not read document',
        {
          description: ocrError
            ? ocrError
            : isDa
              ? 'Tjek at filen er et gyldigt bilag og prøv igen, eller tilføj data manuelt'
              : 'Make sure the file is a valid receipt/invoice and try again, or add data manually',
          duration: 6000,
        },
      );
      return;
    }

    // Apply OCR results to form fields
    if (result.amount !== null && !amount) {
      setAmount(String(result.amount));
    }
    if (result.date && !dateManuallySetRef.current) {
      setDate(result.date);
    }
    if (result.vatPercent !== null) {
      setVatPercent(String(result.vatPercent));
    }
    if (result.amount !== null && result.vatPercent !== null && result.vatPercent > 0) {
      setIncludesVAT(true);
    }

    // Use structured line items or description from OCR result
    if (result.description && !description) {
      setDescription(result.description);
    }

    let newLines: PurchaseLineItem[] = [];

    if (result.lineItems.length > 0) {
      // Structured line items (from VLM PDF processing)
      newLines = result.lineItems.map((line) => ({
        description: line.description || '',
        quantity: line.quantity || 1,
        unitPrice: line.unitPrice || 0,
        vatPercent: line.vatPercent || (result.vatPercent ?? 25),
        accountId: '',
      }));
    } else {
      // Fallback: derive line items from raw OCR lines
      const amountPattern = /(\d+(?:[.,]\d{1,2}))\s*(?:kr|DKK)?/;

      for (const rawLine of result.rawLines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;

        const match = trimmed.match(amountPattern);
        if (match) {
          const lineAmount = parseFloat(match[1].replace(',', '.'));
          const isTotalLine = /(?:total|sum|alt|betale|beløb|ialt)/i.test(trimmed);
          if (isTotalLine) continue;
          const isVatLine = /(?:moms|vat)/i.test(trimmed) && !/moms\s*(?:udgør|amount)/i.test(trimmed);
          if (isVatLine && !amount) continue;

          if (lineAmount > 0 && lineAmount < 100000) {
            const desc = trimmed.replace(amountPattern, '').trim().replace(/\s+/g, ' ').slice(0, 80);
            newLines.push({
              description: desc || trimmed,
              quantity: 1,
              unitPrice: lineAmount,
              vatPercent: result.vatPercent ?? 25,
              accountId: '',
            });
          }
        }
      }
    }

    // If no line items were extracted, create a single line from the total
    if (newLines.length === 0 && result.amount !== null) {
      newLines.push({
        description: isDa ? 'Køb' : 'Purchase',
        quantity: 1,
        unitPrice: result.amount,
        vatPercent: result.vatPercent ?? 25,
        accountId: '',
      });
    }

    if (newLines.length > 0) {
      setPurchaseLines(newLines);
    }

    // Show result toast
    if (result.confidence > 0 && (result.amount || result.date || newLines.length > 0)) {
      toast.success(isDa ? 'Dokument læst' : 'Document scanned', {
        description: isDa
          ? `Fundet ${newLines.length} købslinje${newLines.length !== 1 ? 'r' : ''}${result.amount ? `, beløb: ${result.amount} kr` : ''}${result.date ? `, dato: ${result.date}` : ''}`
          : `Found ${newLines.length} line item${newLines.length !== 1 ? 's' : ''}${result.amount ? `, amount: ${result.amount} DKK` : ''}${result.date ? `, date: ${result.date}` : ''}`,
        duration: 4000,
      });
    } else {
      toast.warning(isDa ? 'Kunne ikke læse dokumentet' : 'Could not read document', {
        description: isDa
          ? 'Tilføj købslinjer manuelt'
          : 'Add purchase lines manually',
        duration: 3000,
      });
    }
  }, [receiptFile, originalWasPdf, amount, description, isDa, processOCR, ocrError]);

  // When a preloaded file arrives from the standalone scanner (FAB flow),
  // auto-attach it to the form (OCR is manual now — user triggers it).
  useEffect(() => {
    if (preloadedReceiptFile && !preloadedConsumedRef.current) {
      preloadedConsumedRef.current = true;
      if (receiptPreviewUrlRef.current) {
        URL.revokeObjectURL(receiptPreviewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(preloadedReceiptFile);
      receiptPreviewUrlRef.current = previewUrl;
      setReceiptFile(preloadedReceiptFile);
      setReceiptPreview(previewUrl);
      // Scanner captures are always images, never PDFs
      setOriginalWasPdf(false);
      onPreloadedFileConsumed?.();
    }
    if (!preloadedReceiptFile) {
      preloadedConsumedRef.current = false;
    }
  }, [preloadedReceiptFile, onPreloadedFileConsumed]);

  const handleScannerCapture = useCallback((file: File) => {
    if (receiptPreviewUrlRef.current) {
      URL.revokeObjectURL(receiptPreviewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    receiptPreviewUrlRef.current = previewUrl;
    setReceiptFile(file);
    setReceiptPreview(previewUrl);
    setScannerOpen(false);
    setOriginalWasPdf(false);
  }, []);

  const handleScannerDismiss = useCallback(() => {
    setScannerOpen(false);
  }, []);

  const handleUseDescription = useCallback((desc: string) => {
    setDescription(desc);
    setShowDescriptionSuggestions(false);
    descriptionInputRef.current?.focus();
  }, []);

  // ─── Submit ───
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccountError('');

    if (!selectedAccountId) {
      setAccountError(isDa
        ? 'Vælg en omkostningskonto for at bogføre i dobbelt-posteringsregnskabet'
        : 'Select an expense account for double-entry bookkeeping');
      return;
    }

    setIsLoading(true);

    try {
      let receiptImagePath: string | null = null;
      // receiptFile is always an image (PNG from PDF conversion or camera/upload)
      const fileToUpload = receiptFile;
      if (fileToUpload) {
        const formData = new FormData();
        formData.append('file', fileToUpload);
        const uploadResponse = await fetch('/api/transactions/upload', { method: 'POST', body: formData });
        if (!uploadResponse.ok) throw new Error(isDa ? 'Kunne ikke uploade kvittering' : 'Failed to upload receipt');
        const uploadData = await uploadResponse.json();
        receiptImagePath = uploadData.path;
      }

      const amountToStore = includesVAT ? netAmount : parsedAmount;
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PURCHASE',
          date,
          amount: amountToStore,
          currency: currency !== 'DKK' ? currency : undefined,
          exchangeRate: currency !== 'DKK' && exchangeRate ? parseFloat(exchangeRate) : undefined,
          description,
          vatPercent: parseFloat(vatPercent),
          receiptImage: receiptImagePath,
          accountId: selectedAccountId,
        }),
      });

      if (!response.ok) {
        const isAccess = await handleMutationError(
          response,
          isDa ? 'Opret indkøb' : 'Create purchase'
        );
        if (isAccess) { setIsLoading(false); return; }
        const data = await response.json();
        throw new Error(data.error || (isDa ? 'Kunne ikke oprette indkøb' : 'Failed to create purchase'));
      }

      // Reset form
      setDate(defaultToday());
      setAmount('');
      setCurrency('DKK');
      setExchangeRate('');
      setIncludesVAT(true);
      setDescription('');
      setVatPercent('25');
      setSelectedAccountId('');
      setPurchaseLines([{ ...EMPTY_LINE_ITEM }]);
      resetOCR();
      clearReceipt();

      toast.success(isDa ? 'Indkøb bogført' : 'Purchase recorded', {
        description: isDa
          ? 'Dit indkøb er bogført i dobbelt-posteringsregnskabet'
          : 'Your purchase has been recorded in the double-entry ledger',
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isDa ? 'Der opstod en fejl' : 'An error occurred'));
    } finally {
      setIsLoading(false);
    }
  }, [date, amount, currency, exchangeRate, includesVAT, netAmount, parsedAmount, description, vatPercent, receiptFile, selectedAccountId, clearReceipt, onSuccess, isDa, handleMutationError]);

  // ─── RENDER ───

  // Shared: Error message
  const renderError = () => error && (
    <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg flex items-center gap-2">
      <Info className="h-4 w-4 shrink-0" />
      {error}
    </div>
  );

  // Shared: Double-entry info banner
  const renderInfoBanner = () => (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20">
      <ArrowRightLeft className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
      <p className="text-xs text-teal-600 dark:text-teal-400">
        {isDa
          ? 'Bogføres automatisk med modposteringer i Finansjournalen'
          : 'Automatically recorded with offsetting entries in the General Journal'}
      </p>
    </div>
  );

  // Shared: Expense account select
  const renderAccountSelect = () => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
        <Label className="dark:text-gray-300 text-sm font-medium">
          {isDa ? 'Fra konto' : 'From account'}
        </Label>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0d9488]/10 text-[#0d9488] dark:bg-[#2dd4bf]/20 dark:text-[#2dd4bf]">
          6xxx–9xxx
        </span>
        <span className="text-[10px] text-red-500 dark:text-red-400 ml-1">*</span>
      </div>
      <Select value={selectedAccountId} onValueChange={(val) => { setSelectedAccountId(val); setAccountError(''); }} disabled={isLoading || accountsLoading}>
        <SelectTrigger className={`bg-gray-50 dark:bg-white/5 ${accountError ? 'border-red-400 dark:border-red-500' : ''}`}>
          <SelectValue placeholder={accountsLoading
            ? (isDa ? 'Indlæser konti...' : 'Loading accounts...')
            : (isDa ? 'Vælg konto...' : 'Select account...')
          } />
        </SelectTrigger>
        <SelectContent className="bg-white dark:bg-[#1a1f1e] max-h-72">
          {groupedAccounts.map((group) => (
            <SelectGroup key={group.labelDa}>
              <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 select-none">
                {isDa ? group.labelDa : group.labelEn} ({group.accounts[0]?.number.slice(0, 1)}xxx)
              </SelectLabel>
              {group.accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{acc.number}</span>
                  {isDa ? acc.name : (acc.nameEn || acc.name)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {accountError && (
        <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {accountError}
        </p>
      )}
      {selectedAccount && (
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Info className="h-3 w-3 shrink-0" />
          {isDa ? `Valgt: ${selectedAccount.number} ${selectedAccount.name}` : `Selected: ${selectedAccount.number} ${selectedAccount.nameEn || selectedAccount.name}`}
        </p>
      )}
    </div>
  );

  // Shared: Amount & Date (amount first)
  const renderDateAmount = () => (
    <div className="space-y-4">
      {/* Amount */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="dark:text-gray-300 text-sm font-medium">{t('amount')}</Label>
          <div className="flex items-center gap-1.5">
            <Label className="text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer">{t('amountIncludesVAT')}</Label>
            <ResponsiveSwitch checked={includesVAT} onCheckedChange={setIncludesVAT} disabled={isLoading} />
          </div>
        </div>
        <div className="relative">
          <Input type="number" step="0.01" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={isLoading} className="h-12 text-xl font-bold text-right pr-14 bg-gray-50 dark:bg-white/5 tabular-nums" />
          <div className="absolute right-3 top-1/2 -translate-y-1/2"><span className="text-xs font-semibold text-gray-400 dark:text-gray-500">DKK</span></div>
        </div>
        {includesVAT && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"><Info className="h-3 w-3" />{t('grossToNetInfo')}</p>
        )}
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor={layout === 'cards' ? 'date-cards' : 'date'} className="dark:text-gray-300 text-sm font-medium">{t('date')}</Label>
        <Input id={layout === 'cards' ? 'date-cards' : 'date'} type="date" value={date} onChange={(e) => { setDate(e.target.value); dateManuallySetRef.current = true; }} required disabled={isLoading} className="bg-gray-50 dark:bg-white/5 text-sm" />
      </div>
    </div>
  );

  // Shared: Net/VAT/Gross calculation cards
  const renderCalculations = () => amount && parsedAmount > 0 && (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">{t('netAmountShort')}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(netAmount)}</p>
      </div>
      <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">{t('vatShort')}</p>
        <p className="text-sm font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">{formatDanishNumber(vatAmount)}</p>
      </div>
      <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-0.5">{t('grossShort')}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(totalAmount)}</p>
      </div>
    </div>
  );

  // Shared: VAT% & Currency row
  const renderVatCurrency = () => (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="dark:text-gray-300 text-sm font-medium">{isDa ? 'Moms %' : 'VAT %'}</Label>
        <Input type="number" step="0.1" min="0" max="100" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} disabled={isLoading} className="bg-gray-50 dark:bg-white/5" />
      </div>
      <div className="space-y-1.5">
        <Label className="dark:text-gray-300 text-sm font-medium">{t('currency')}</Label>
        <Select value={currency} onValueChange={(val) => { setCurrency(val); if (val === 'DKK') setExchangeRate(''); }}>
          <SelectTrigger className="bg-gray-50 dark:bg-white/5"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-white dark:bg-[#1a1f1e]">{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );

  // Shared: Exchange rate (conditional)
  const renderExchangeRate = () => currency !== 'DKK' && (
    <div className="space-y-1.5">
      <Label className="dark:text-gray-300 text-sm font-medium">{t('exchangeRate')} ({currency} → DKK)</Label>
      <Input type="number" step="0.0001" min="0" placeholder="0.0000" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} disabled={isLoading} className="bg-gray-50 dark:bg-white/5" />
    </div>
  );

  // Document preview card (shown when a file is uploaded)
  const renderDocumentPreview = () => {
    if (!receiptPreview) return null;

    const isLoading = receiptPreview === 'loading';
    const isImagePreview = !isLoading;

    return (
      <div className="space-y-3">
        {/* Preview area */}
        <div className="relative rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-gray-900/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400 dark:text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-[#0d9488]" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{isDa ? 'Indlæser PDF…' : 'Loading PDF…'}</p>
            </div>
          ) : isImagePreview ? (
            <div className="flex justify-center p-2">
              <img
                src={receiptPreview}
                alt="Document preview"
                className="w-full h-auto object-contain shadow-sm rounded"
                style={{ maxHeight: '600px' }}
              />
            </div>
          ) : null}

          {/* OCR loading overlay */}
          {ocrLoading && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
              <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-teal-400 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(ocrProgress, 5)}%` }}
                />
              </div>
              <p className="text-[11px] text-white/80 font-medium">
                {isDa ? 'Læser dokument…' : 'Reading document…'}
              </p>
            </div>
          )}

          {/* Action buttons overlay */}
          {!ocrLoading && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 shadow-sm"
                onClick={handleManualOCR}
                title={isDa ? 'Læs dokument med OCR' : 'Read document with OCR'}
              >
                <ScanSearch className="h-3.5 w-3.5" />
              </Button>
              {isImagePreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 shadow-sm"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = receiptPreview;
                    const now = new Date();
                    const pad = (n: number) => String(n).padStart(2, '0');
                    a.download = `dokument_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  aria-label={isDa ? 'Gem billede' : 'Save image'}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button type="button" variant="destructive" size="sm" className="bg-red-500/90 backdrop-blur-sm shadow-sm" onClick={clearReceipt}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* OCR trigger button below preview */}
        {!ocrLoading && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 gap-2 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
            onClick={handleManualOCR}
          >
            <ScanSearch className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
            <span className="text-sm font-medium">
              {isDa ? 'Læs dokument med OCR' : 'Read document with OCR'}
            </span>
          </Button>
        )}
      </div>
    );
  };

  // Shared: Receipt upload area (only shown when no document is uploaded)
  const renderReceiptUpload = () => (
    <div className="space-y-1.5">
      <Label className="dark:text-gray-300 text-sm font-medium">{t('receipt')} <span className="text-gray-400 text-xs font-normal">({isDa ? 'valgfrit' : 'optional'})</span></Label>
      <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" disabled={isLoading} />
      {receiptPreview ? (
        renderDocumentPreview()
      ) : (
        <div className={`grid gap-2 ${layout === 'cards' ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {layout !== 'cards' && (
            <Button
              type="button"
              variant="outline"
              className="h-16 border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488]"
              onClick={() => setScannerOpen(true)}
              disabled={isLoading}
            >
              <div className="flex flex-col items-center gap-1">
                <Camera className="h-4 w-4 text-[#0d9488] dark:text-[#2dd4bf]" />
                <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{isDa ? 'Scan kvittering' : 'Scan receipt'}</span>
              </div>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className={`border-dashed border-2 hover:border-[#0d9488] hover:bg-[#0d9488]/5 transition-colors dark:border-white/20 dark:hover:border-[#0d9488] ${layout === 'cards' ? 'h-20' : 'h-16'}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <div className="flex flex-col items-center gap-1">
              <Upload className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">{isDa ? 'Upload kvittering eller købsfaktura' : 'Upload receipt or purchase invoice'}</span>
            </div>
          </Button>
        </div>
      )}
      {scannerOpen && (
        <ReceiptScanner
          onCapture={handleScannerCapture}
          onDismiss={handleScannerDismiss}
        />
      )}
    </div>
  );

  // Shared: Description textarea
  const renderDescription = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="dark:text-gray-300 text-sm font-medium">{t('description')}</Label>
        {recentDescriptions.length > 0 && (
          <button type="button" onClick={() => setShowDescriptionSuggestions(!showDescriptionSuggestions)} className="text-xs text-[#0d9488] dark:text-[#2dd4bf] hover:underline cursor-pointer">
            {isDa ? 'Seneste' : 'Recent'}
          </button>
        )}
      </div>
      {showDescriptionSuggestions && recentDescriptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 p-2">
          {recentDescriptions.map((desc, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleUseDescription(desc.description)}
              className="text-xs px-2 py-1 rounded-md bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-[#0d9488]/10 hover:border-[#0d9488]/30 hover:text-[#0d9488] dark:hover:text-[#2dd4bf] transition-colors cursor-pointer truncate max-w-[200px]"
            >
              {desc.description}
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={descriptionInputRef}
        placeholder={isDa ? 'Beskrivelse af købet...' : 'Description of purchase...'}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={layout === 'cards' ? 3 : 2}
        disabled={isLoading}
        className="bg-gray-50 dark:bg-white/5 text-sm"
      />
    </div>
  );

  // ─── Line items card content (matches invoice line items pattern) ───
  const renderLineItems = () => (
    <div className="space-y-4">
      {purchaseLines.map((item, index) => (
        <div key={index} className="flex flex-col gap-3 p-4 rounded-lg border border-gray-100/50 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02]">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Account selector */}
            <div className="w-48 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">
                {isDa ? 'Konto' : 'Account'}
              </Label>
              <Select
                value={item.accountId}
                onValueChange={(val) => updatePurchaseLineItem(index, 'accountId', val)}
              >
                <SelectTrigger className="h-10 bg-white dark:bg-white/5">
                  <SelectValue placeholder={isDa ? 'Vælg konto...' : 'Select account...'} />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740] max-h-64 overflow-y-auto">
                  {groupedAccounts.map((group) => (
                    <SelectGroup key={group.labelDa}>
                      <SelectLabel className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 py-1.5 select-none">
                        {isDa ? group.labelDa : group.labelEn} ({group.accounts[0]?.number.slice(0, 1)}xxx)
                      </SelectLabel>
                      {group.accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <span className="font-mono text-xs mr-1">{acc.number}</span> {isDa ? acc.name : (acc.nameEn || acc.name)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Description */}
            <div className="flex-1 min-w-[180px] space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('itemDescription')}</Label>
              <Input
                value={item.description}
                onChange={(e) => updatePurchaseLineItem(index, 'description', e.target.value)}
                placeholder={t('itemDescription')}
                className="h-10 bg-white dark:bg-white/5"
              />
            </div>
            {/* Quantity */}
            <div className="w-20 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('quantity')}</Label>
              <Input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updatePurchaseLineItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                className="h-10 bg-white dark:bg-white/5 text-center"
              />
            </div>
            {/* Unit Price */}
            <div className="w-28 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('unitPrice')}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice || ''}
                onChange={(e) => updatePurchaseLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                className="h-10 bg-white dark:bg-white/5 text-right"
              />
            </div>
            {/* VAT % */}
            <div className="w-20 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('vatPercent')}</Label>
              <Select
                value={item.vatPercent.toString()}
                onValueChange={(val) => updatePurchaseLineItem(index, 'vatPercent', parseFloat(val))}
              >
                <SelectTrigger className="h-10 bg-white dark:bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1f1e] dark:border-[#232740]">
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="12">12%</SelectItem>
                  <SelectItem value="25">25%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Amount (read-only) */}
            <div className="w-24 space-y-1">
              <Label className="text-xs text-gray-500 dark:text-gray-400">{t('amount')}</Label>
              <div className="h-10 px-3 flex items-center justify-end text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 rounded-md">
                {tc(item.quantity * item.unitPrice)}
              </div>
            </div>
            {/* Delete */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removePurchaseLineItem(index)}
              disabled={purchaseLines.length === 1}
              className="text-gray-400 hover:text-red-500 disabled:opacity-30"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-72 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t('subtotal')}</span>
            <span className="font-medium dark:text-gray-300">{tc(lineTotals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t('vatTotalLabel')}</span>
            <span className="font-medium dark:text-gray-300">{tc(lineTotals.vatTotal)}</span>
          </div>
          <Separator className="dark:bg-gray-700" />
          <div className="flex justify-between">
            <span className="text-lg font-bold text-gray-900 dark:text-white">{t('grandTotal')}</span>
            <span className="text-lg font-bold text-[#0d9488] dark:text-[#2dd4bf]">{tc(lineTotals.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Shared: Submit button
  const renderSubmit = () => (
    <Button
      type="submit"
      disabled={isLoading}
      className={`bg-[#0d9488] hover:bg-[#0f766e] text-white font-semibold transition-colors ${layout === 'cards' ? 'h-12 text-base px-8' : 'w-full h-11'}`}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {isDa ? 'Bogfører...' : 'Recording...'}
        </span>
      ) : (
        <span>{isDa ? 'Bogfør indkøb' : 'Record Purchase'}</span>
      )}
    </Button>
  );

  // ─── Compact layout (for mobile dialog) ───
  if (layout === 'compact') {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {renderError()}
        {renderInfoBanner()}
        {renderDateAmount()}
        {renderCalculations()}
        {renderVatCurrency()}
        {renderExchangeRate()}
        {renderAccountSelect()}
        {renderReceiptUpload()}
        {renderDescription()}
        {renderSubmit()}
      </form>
    );
  }

  // ─── Card layout (for desktop full-page) ───
  return (
    <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-6">
      {renderError()}

      {/* ── Two-column: Purchase Details + Receipt & Invoice ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

        {/* ── Left Card: Purchase Details ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0d9488] flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Købsnota & kvittering' : 'Purchase Note & Receipts'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* ── 1. Beløb (Amount) ── */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="dark:text-gray-300 text-sm font-medium">{t('amount')}</Label>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer">{t('amountIncludesVAT')}</Label>
                  <ResponsiveSwitch checked={includesVAT} onCheckedChange={setIncludesVAT} disabled={isLoading} />
                </div>
              </div>
              <div className="relative">
                <Input type="number" step="0.01" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={isLoading} className="h-12 text-xl font-bold text-right pr-14 bg-gray-50 dark:bg-white/5 tabular-nums" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2"><span className="text-xs font-semibold text-gray-400 dark:text-gray-500">DKK</span></div>
              </div>
              {includesVAT && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1"><Info className="h-3 w-3" />{t('grossToNetInfo')}</p>
              )}
            </div>

            {/* Description */}
            {renderDescription()}

            {/* Net / VAT / Gross calculation row */}
            {amount && parsedAmount > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('netAmountShort')}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(netAmount)}</p>
                </div>
                <div className="rounded-lg bg-[#0d9488]/5 dark:bg-[#2dd4bf]/5 border border-[#0d9488]/15 dark:border-[#2dd4bf]/15 px-3 py-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-[#0d9488] dark:text-[#2dd4bf] mb-1">{t('vatShort')}</p>
                  <p className="text-sm font-bold text-[#0d9488] dark:text-[#2dd4bf] tabular-nums">{formatDanishNumber(vatAmount)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{t('grossShort')}</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatDanishNumber(totalAmount)}</p>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-white/5" />

            {/* ── 2. Moms % & Valuta ── */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="dark:text-gray-300 text-sm font-medium">{isDa ? 'Moms %' : 'VAT %'}</Label>
                  <Input type="number" step="0.1" min="0" max="100" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} disabled={isLoading} className="bg-gray-50 dark:bg-white/5" />
                </div>
                <div className="space-y-1.5">
                  <Label className="dark:text-gray-300 text-sm font-medium">{t('currency')}</Label>
                  <Select value={currency} onValueChange={(val) => { setCurrency(val); if (val === 'DKK') setExchangeRate(''); }}>
                    <SelectTrigger className="bg-gray-50 dark:bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1a1f1e]">{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {currency !== 'DKK' && (
                <div className="space-y-1.5">
                  <Label className="dark:text-gray-300 text-sm font-medium">{t('exchangeRate')} ({currency} → DKK)</Label>
                  <Input type="number" step="0.0001" min="0" placeholder="0.0000" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} disabled={isLoading} className="bg-gray-50 dark:bg-white/5" />
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-white/5" />

            {/* ── 3. Dato ── */}
            <div className="space-y-1.5">
              <Label htmlFor="date-cards" className="dark:text-gray-300 text-sm font-medium">{t('date')}</Label>
              <Input id="date-cards" type="date" value={date} onChange={(e) => { setDate(e.target.value); dateManuallySetRef.current = true; }} required disabled={isLoading} className="bg-gray-50 dark:bg-white/5 text-sm" />
            </div>

            <div className="border-t border-gray-100 dark:border-white/5" />

            {/* ── 4. Fra konto ── */}
            {renderAccountSelect()}
          </CardContent>
        </Card>

        {/* ── Right Card: Kvittering & Købsfaktura ── */}
        <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Købsdokumenter' : 'Purchase Documents'}
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isDa
                ? 'Upload en kvittering eller købsfaktura, og læs den med OCR'
                : 'Upload a receipt or purchase invoice and read it with OCR'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderReceiptUpload()}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Card: Købslinjer (Line Items) — matches invoice varelinjer pattern ── */}
      <Card className="stat-card border-0 shadow-lg dark:border dark:border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-white" />
              </div>
              {isDa ? 'Købslinjer' : 'Purchase Lines'}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={addPurchaseLineItem} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t('addItem')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {renderLineItems()}

          {/* Submit row */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 dark:border-white/5">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <ArrowRightLeft className="h-4 w-4 text-teal-500" />
              <span>{isDa
                ? 'Bogføres i dobbelt-posteringsregnskabet med modposteringer'
                : 'Recorded in double-entry ledger with offsetting entries'
              }</span>
            </div>
            {renderSubmit()}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
