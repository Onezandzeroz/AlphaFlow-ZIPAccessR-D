'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, Mail, FileText, AlertCircle } from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCvr: string | null;
  issueDate: string;
  dueDate: string;
  lineItems: any;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
}

interface SendInvoiceDialogProps {
  invoice: Invoice | null;
  companyName: string;
  language: string;
  isSending: boolean;
  onSend: (invoice: Invoice, subject: string, message: string) => Promise<boolean>;
  onClose: () => void;
}

export function SendInvoiceDialog({
  invoice,
  companyName,
  language,
  isSending,
  onSend,
  onClose,
}: SendInvoiceDialogProps) {
  const isDa = language === 'da';

  const defaultSubject = isDa
    ? `Faktura fra ${companyName}`
    : `Invoice from ${companyName}`;
  const defaultMessage = isDa
    ? `Efter aftale.\nMvh. ${companyName}`
    : `As agreed.\nBest regards, ${companyName}`;

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  if (!invoice) return null;

  const recipientEmail = invoice.customerEmail;

  const handleSend = async () => {
    const success = await onSend(invoice, subject.trim(), message.trim());
    if (success) {
      onClose();
    }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-lg w-[95vw] p-0 gap-0 overflow-hidden bg-white dark:bg-[#1a1f1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10"
      >
        {/* Inner card */}
        <div className="w-full overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0d9488] to-[#14b8a6] dark:from-[#0f766e] dark:to-[#0d9488] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Send className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {isDa ? 'Send faktura' : 'Send Invoice'}
                </h2>
                <p className="text-sm text-white/80 mt-0.5">
                  {isDa
                    ? `Faktura ${invoice.invoiceNumber} til ${invoice.customerName}`
                    : `Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Invoice info badges */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs font-medium gap-1 bg-[#0d9488]/10 text-[#0d9488] border border-[#0d9488]/20">
                <FileText className="h-3 w-3" />
                {invoice.invoiceNumber}
              </Badge>
              <Badge variant="secondary" className="text-xs font-medium gap-1">
                {Number(invoice.total).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
              </Badge>
            </div>

            {/* Recipient */}
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{isDa ? 'Modtager' : 'Recipient'}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {recipientEmail || (isDa ? 'Ingen e-mailadresse' : 'No email address')}
                </p>
              </div>
              {!recipientEmail && (
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 ml-auto" />
              )}
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="email-subject" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDa ? 'Emne' : 'Subject'}
              </Label>
              <Input
                id="email-subject"
                value={subject || defaultSubject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={isDa ? 'Emne for e-mailen...' : 'Email subject...'}
                className="bg-white dark:bg-white/5 border-gray-200 dark:border-white/10"
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <Label htmlFor="email-message" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isDa ? 'Besked' : 'Message'}
              </Label>
              <Textarea
                id="email-message"
                value={message || defaultMessage}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isDa ? 'Skriv en besked...' : 'Write a message...'}
                rows={4}
                className="bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 resize-none"
              />
            </div>

            {/* PDF notice */}
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span>
                {isDa
                  ? 'Fakturaen vedhæftes automatisk som PDF'
                  : 'The invoice will be automatically attached as a PDF'}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5 flex items-center justify-end gap-2 rounded-b-2xl">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSending}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              {isDa ? 'Annuller' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || !recipientEmail}
              className="bg-[#0d9488] hover:bg-[#0f766e] text-white gap-2 min-w-[120px]"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSending
                ? (isDa ? 'Sender...' : 'Sending...')
                : (isDa ? 'Send faktura' : 'Send Invoice')
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
