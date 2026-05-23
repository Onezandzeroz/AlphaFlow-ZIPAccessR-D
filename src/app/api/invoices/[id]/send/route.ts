import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { generateInvoicePDF } from '@/lib/pdf-generator';
import { sendInvoiceEmail } from '@/lib/email-service';
import { logger } from '@/lib/logger';
import { requireTokenPayAccess } from '@/lib/tokenpay';
import { blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// POST /api/invoices/[id]/send — Generate PDF, send email, mark as SENT
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const accessDenied = await requireTokenPayAccess(ctx.id);
    if (accessDenied) return accessDenied;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await params;
    const body = await request.json();
    const { subject, message, language } = body as {
      subject?: string;
      message?: string;
      language?: string;
    };

    // Fetch invoice with contact
    const companyId = ctx.activeCompanyId;
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }
    const invoice = await db.invoice.findFirst({
      where: { id, companyId },
      include: {
        contact: {
          select: { email: true, name: true },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Cannot send a cancelled invoice' }, { status: 400 });
    }

    // Determine recipient email: contact's live email > invoice's stored email
    const recipientEmail = invoice.contact?.email || invoice.customerEmail;
    if (!recipientEmail) {
      return NextResponse.json(
        { error: language === 'da' ? 'Ingen e-mailadresse fundet på fakturaen eller kontakten' : 'No email address found on the invoice or contact' },
        { status: 400 }
      );
    }

    // Fetch company info
    const company = await db.company.findUnique({ where: { id: companyId } });
    const companyName = company?.name || 'Unknown Company';

    // Build email defaults
    const lang = (language === 'en' ? 'en' : 'da') as 'da' | 'en';
    const emailSubject = subject?.trim() || (lang === 'da'
      ? `Faktura fra ${companyName}`
      : `Invoice from ${companyName}`);
    const emailMessage = message?.trim() || (lang === 'da'
      ? `Efter aftale.\nMvh. ${companyName}`
      : `As agreed.\nBest regards, ${companyName}`);

    // Generate PDF
    const invoiceWithDetails = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      customerAddress: invoice.customerAddress,
      customerEmail: invoice.customerEmail,
      customerPhone: invoice.customerPhone,
      customerCvr: invoice.customerCvr,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      lineItems: invoice.lineItems,
      subtotal: Number(invoice.subtotal),
      vatTotal: Number(invoice.vatTotal),
      total: Number(invoice.total),
      currency: invoice.currency || 'DKK',
      exchangeRate: invoice.exchangeRate ? Number(invoice.exchangeRate) : null,
      status: invoice.status,
      notes: invoice.notes,
      companyInfo: company
        ? {
            logo: company.logo,
            companyName: company.name,
            address: company.address,
            phone: company.phone,
            email: company.email,
            cvrNumber: company.cvrNumber,
            bankName: company.bankName,
            bankAccount: company.bankAccount,
            bankRegistration: company.bankRegistration,
            bankIban: company.bankIban,
            invoiceTerms: company.invoiceTerms,
          }
        : null,
    };

    const pdfBytes = await generateInvoicePDF(invoiceWithDetails);

    // Send email with PDF attachment
    const emailResult = await sendInvoiceEmail(
      recipientEmail,
      emailSubject,
      emailMessage,
      Buffer.from(pdfBytes),
      invoice.invoiceNumber,
      companyName,
      lang,
      companyId,
    );

    if (!emailResult.success) {
      return NextResponse.json(
        { error: lang === 'da' ? 'Kunne ikke sende e-mail' : 'Failed to send email' },
        { status: 500 }
      );
    }

    // Update invoice status to SENT (triggers accrual journal entry via existing PUT logic)
    if (invoice.status === 'DRAFT') {
      await db.invoice.update({
        where: { id },
        data: { status: 'SENT' },
      });

      // Create accrual journal entry using the existing logic from PUT
      // We replicate it here since the send endpoint handles the full flow
      const lineItems = invoice.lineItems as Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        vatPercent: number;
        accountId?: string;
      }>;

      const receivablesAccount = await db.account.findFirst({
        where: { companyId, number: '1200', isActive: true },
      });
      const outputVat25Account = await db.account.findFirst({
        where: { companyId, number: '4510', isActive: true },
      });
      const outputVat12Account = await db.account.findFirst({
        where: { companyId, number: '4520', isActive: true },
      });
      const defaultRevenueAccount = await db.account.findFirst({
        where: { companyId, number: '4100', isActive: true },
      });

      if (receivablesAccount) {
        const jeLines: Array<{
          accountId: string;
          debit: number;
          credit: number;
          description: string;
          vatCode?: string | null;
        }> = [];
        let totalGross = 0;
        const vatByRate: Record<number, number> = {};

        for (const item of lineItems) {
          if (!item.description.trim() || item.unitPrice <= 0) continue;
          const netAmount = Number(item.quantity) * Number(item.unitPrice);
          const vatAmount = (netAmount * Number(item.vatPercent)) / 100;
          const grossAmount = netAmount + vatAmount;

          const revenueAccountId = item.accountId || defaultRevenueAccount?.id;
          if (revenueAccountId) {
            jeLines.push({
              accountId: revenueAccountId,
              debit: 0,
              credit: netAmount,
              description: item.description,
              vatCode: null,
            });
          }

          if (vatAmount > 0) {
            vatByRate[item.vatPercent] = (vatByRate[item.vatPercent] || 0) + vatAmount;
          }

          totalGross += grossAmount;
        }

        if (totalGross > 0) {
          jeLines.unshift({
            accountId: receivablesAccount.id,
            debit: totalGross,
            credit: 0,
            description: `${invoice.invoiceNumber} – ${invoice.customerName}`,
          });
        }

        if (vatByRate[25] && outputVat25Account) {
          jeLines.push({
            accountId: outputVat25Account.id,
            debit: 0,
            credit: vatByRate[25],
            description: `${invoice.invoiceNumber} – Udgående moms 25%`,
            vatCode: 'S25',
          });
        }
        if (vatByRate[12] && outputVat12Account) {
          jeLines.push({
            accountId: outputVat12Account.id,
            debit: 0,
            credit: vatByRate[12],
            description: `${invoice.invoiceNumber} – Udgående moms 12%`,
            vatCode: 'S12',
          });
        }

        const totalDebit = jeLines.reduce((s, l) => s + l.debit, 0);
        const totalCredit = jeLines.reduce((s, l) => s + l.credit, 0);

        if (jeLines.length >= 2 && Math.abs(totalDebit - totalCredit) < 0.01) {
          await db.journalEntry.create({
            data: {
              date: invoice.issueDate,
              description: `Tilgodehavende – Faktura ${invoice.invoiceNumber} – ${invoice.customerName}`,
              reference: invoice.invoiceNumber,
              status: 'POSTED',
              userId: ctx.id,
              companyId,
              lines: {
                create: jeLines.map(l => ({
                  companyId,
                  accountId: l.accountId,
                  debit: l.debit,
                  credit: l.credit,
                  description: l.description,
                  vatCode: (l.vatCode as any) ?? null,
                })),
              },
            },
          });
        }
      }

      logger.warn(`[INVOICE-SEND] Invoice ${invoice.invoiceNumber} sent to ${recipientEmail}, status set to SENT, logId=${emailResult.logId}`);
    } else {
      logger.warn(`[INVOICE-SEND] Invoice ${invoice.invoiceNumber} re-sent to ${recipientEmail} (was already ${invoice.status}), logId=${emailResult.logId}`);
    }

    return NextResponse.json({
      success: true,
      sentTo: recipientEmail,
      invoiceNumber: invoice.invoiceNumber,
      logId: emailResult.logId,
    });
  } catch (error) {
    logger.error('[INVOICE-SEND] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to send invoice' },
      { status: 500 }
    );
  }
}
