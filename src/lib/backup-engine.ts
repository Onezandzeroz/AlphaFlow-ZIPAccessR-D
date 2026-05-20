/**
 * Backup Engine for AlphaAi Accounting
 *
 * Required by Danish Bookkeeping Law §15:
 * - Automated hourly/daily/weekly/monthly backups (saved as .zip)
 * - SHA-256 checksum verification on the zip file
 * - Retention policy (24 hourly, 30 daily, 52 weekly, 60+ monthly, 999 manual)
 * - User can create manual backups and restore from any backup
 *
 * Backup Scopes:
 * - "tenant": Tenant-specific JSON snapshot (default and only scope)
 *   Only contains data belonging to the specific tenant, exported as
 *   structured JSON files inside a ZIP archive.
 *
 * NOTE: The "full-db" backup scope (raw SQLite file copy) has been removed
 * as part of the PostgreSQL migration. PostgreSQL does not support file-level
 * database copying like SQLite. All backups now use the tenant snapshot approach.
 */

import { db } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import {
  AccountType,
  AccountGroup,
  ContactType,
  TransactionType,
  InvoiceStatus,
  JournalEntryStatus,
  PeriodStatus,
  VATCode,
  RecurringFrequency,
  RecurringStatus,
  ReconciliationStatus,
  BankConnectionStatus,
  SyncStatus,
  CompanyRole,
} from '@prisma/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createWriteStream, createReadStream, mkdirSync, rmSync } from 'fs';
import archiver from 'archiver';
import JSZip from 'jszip';
import { logger } from '@/lib/logger';

// Transaction client type from Prisma
type PrismaTransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// Backup directory structure: Tenant-Backup/{companyName}/{Hourly|Daily|Weekly|Monthly|Manual}/
const BACKUP_BASE_DIR = path.join(process.cwd(), 'Tenant-Backup');

// Map internal backup type to human-readable folder name matching retention policy labels
const BACKUP_TYPE_FOLDER: Record<BackupType, string> = {
  hourly:  'Hourly',
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
  manual:  'Manual',
};

/**
 * Sanitize a company name for use as a directory name.
 * Strips or replaces characters that are unsafe for filesystems.
 */
function sanitizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-')  // Replace forbidden filesystem chars
    .replace(/\s+/g, '-')              // Spaces to hyphens
    .replace(/-+/g, '-')                // Collapse multiple hyphens
    .replace(/^-|-$/g, '')              // Strip leading/trailing hyphens
    || 'unknown-company';
}

// Retention policy
const RETENTION = {
  hourly:  { count: 24, expiresMs: 25 * 60 * 60 * 1000 },         // 25 hours
  daily:   { count: 30, expiresMs: 31 * 24 * 60 * 60 * 1000 },     // 31 days
  weekly:  { count: 52, expiresMs: 53 * 24 * 60 * 60 * 1000 },     // 53 days
  monthly: { count: 60, expiresMs: 365 * 24 * 60 * 60 * 1000 },    // 1 year
  manual:  { count: 999, expiresMs: 90 * 24 * 60 * 60 * 1000 },    // 90 days
} as const;

export type BackupType = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'manual';
export type TriggerType = 'automatic' | 'manual' | 'scheduled';
export type BackupScope = 'tenant';

/**
 * Ensure backup directory exists for a company.
 * Structure: Tenant-Backup/{companyName}/{Hourly|Daily|Weekly|Monthly|Manual}/
 */
async function ensureBackupDir(companyId: string, backupType: BackupType): Promise<string> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  const folderName = company ? sanitizeCompanyName(company.name) : companyId;
  const typeFolder = BACKUP_TYPE_FOLDER[backupType] || backupType;
  const dir = path.join(BACKUP_BASE_DIR, folderName, typeFolder);
  if (!fs.existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Calculate SHA-256 checksum of a file using streaming (memory-efficient for large files)
 */
export async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Create a ZIP archive of tenant-specific data as structured JSON files.
 * This is used for regular tenant backups — only exports data belonging to the tenant.
 *
 * ZIP contents:
 *   manifest.json          - Metadata (version, timestamp, company info, record counts)
 *   company.json           - Company settings
 *   accounts.json          - Chart of accounts
 *   contacts.json          - Contacts
 *   transactions.json      - Transactions
 *   invoices.json          - Invoices
 *   journal-entries.json   - Journal entries with lines and documents
 *   fiscal-periods.json    - Fiscal periods
 *   budgets.json           - Budgets with entries
 *   recurring-entries.json - Recurring entries
 *   bank-statements.json   - Bank statements with lines
 *   bank-connections.json  - Bank connections with syncs
 *   members.json           - Team membership
 */
async function createTenantSnapshotZip(companyId: string, zipOutputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipOutputPath);
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Good compression for JSON text
    });

    output.on('close', () => resolve());
    output.on('error', (err) => reject(err));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // Fetch all tenant data in a single batch
    Promise.all([
      db.company.findUnique({ where: { id: companyId } }),
      db.account.findMany({ where: { companyId }, orderBy: [{ number: 'asc' }] }),
      db.contact.findMany({ where: { companyId }, orderBy: [{ name: 'asc' }] }),
      db.transaction.findMany({ where: { companyId }, orderBy: [{ date: 'desc' }] }),
      db.invoice.findMany({ where: { companyId }, orderBy: [{ createdAt: 'desc' }] }),
      db.journalEntry.findMany({
        where: { companyId },
        include: { lines: { orderBy: [{ id: 'asc' }] }, documents: true },
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
      }),
      db.fiscalPeriod.findMany({ where: { companyId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
      db.budget.findMany({
        where: { companyId },
        include: { entries: { include: { account: { select: { number: true } } } } },
        orderBy: [{ year: 'desc' }],
      }),
      db.recurringEntry.findMany({ where: { companyId }, orderBy: [{ name: 'asc' }] }),
      db.bankStatement.findMany({
        where: { companyId },
        include: { lines: { orderBy: [{ date: 'asc' }, { id: 'asc' }] } },
        orderBy: [{ startDate: 'desc' }],
      }),
      db.userCompany.findMany({
        where: { companyId },
        include: { user: { select: { email: true } } },
        orderBy: [{ joinedAt: 'asc' }],
      }),
      db.bankConnection.findMany({
        where: { companyId },
        include: { syncs: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ])
      .then(([company, accounts, contacts, transactions, invoices, journalEntries, fiscalPeriods, budgets, recurringEntries, bankStatements, members, bankConnections]) => {
        // Build and add manifest.json
        const manifest = {
          version: 2,
          type: 'tenant-snapshot',
          exportedAt: new Date().toISOString(),
          companyName: company?.name ?? 'unknown',
          companyId,
          alphaFlowVersion: '1.0.0',
          recordCounts: {
            accounts: accounts.length,
            contacts: contacts.length,
            transactions: transactions.length,
            invoices: invoices.length,
            journalEntries: journalEntries.length,
            fiscalPeriods: fiscalPeriods.length,
            budgets: budgets.length,
            recurringEntries: recurringEntries.length,
            bankStatements: bankStatements.length,
            bankConnections: bankConnections.length,
            members: members.length,
          },
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

        // Company settings
        if (company) {
          const companyData = {
            name: company.name,
            address: company.address,
            phone: company.phone,
            email: company.email,
            cvrNumber: company.cvrNumber,
            companyType: company.companyType,
            invoicePrefix: company.invoicePrefix,
            invoiceTerms: company.invoiceTerms,
            invoiceNotesTemplate: company.invoiceNotesTemplate,
            nextInvoiceSequence: company.nextInvoiceSequence,
            currentYear: company.currentYear,
            bankName: company.bankName,
            bankAccount: company.bankAccount,
            bankRegistration: company.bankRegistration,
            bankIban: company.bankIban,
            bankStreet: company.bankStreet,
            bankCity: company.bankCity,
            bankCountry: company.bankCountry,
            dashboardWidgets: company.dashboardWidgets,
          };
          archive.append(JSON.stringify(companyData, null, 2), { name: 'company.json' });
        }

        // Data files
        archive.append(JSON.stringify(accounts.map((a) => ({
          number: a.number, name: a.name, nameEn: a.nameEn, type: a.type, group: a.group,
          description: a.description, isActive: a.isActive, isSystem: a.isSystem, _ref: a.id,
        })), null, 2), { name: 'accounts.json' });

        archive.append(JSON.stringify(contacts.map((c) => ({
          name: c.name, cvrNumber: c.cvrNumber, email: c.email, phone: c.phone,
          address: c.address, city: c.city, postalCode: c.postalCode, country: c.country,
          type: c.type, notes: c.notes, isActive: c.isActive, _ref: c.id,
        })), null, 2), { name: 'contacts.json' });

        archive.append(JSON.stringify(transactions.map((t) => ({
          date: t.date.toISOString().split('T')[0], type: t.type, amount: t.amount,
          currency: t.currency, exchangeRate: t.exchangeRate, amountDKK: t.amountDKK,
          description: t.description, vatPercent: t.vatPercent, receiptImage: t.receiptImage,
          invoiceId: t.invoiceId, accountId: t.accountId, cancelled: t.cancelled,
          cancelReason: t.cancelReason, originalId: t.originalId, _ref: t.id,
        })), null, 2), { name: 'transactions.json' });

        archive.append(JSON.stringify(invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate.toISOString().split('T')[0],
          dueDate: inv.dueDate.toISOString().split('T')[0],
          customerName: inv.customerName, customerAddress: inv.customerAddress,
          customerEmail: inv.customerEmail, customerPhone: inv.customerPhone,
          customerCvr: inv.customerCvr, lineItems: inv.lineItems,
          subtotal: inv.subtotal, vatTotal: inv.vatTotal, total: inv.total,
          currency: inv.currency, exchangeRate: inv.exchangeRate, status: inv.status,
          notes: inv.notes, contactId: inv.contactId, cancelled: inv.cancelled,
          cancelReason: inv.cancelReason, _ref: inv.id,
        })), null, 2), { name: 'invoices.json' });

        archive.append(JSON.stringify(journalEntries.map((je) => ({
          date: je.date.toISOString().split('T')[0], description: je.description,
          reference: je.reference, status: je.status, cancelled: je.cancelled,
          cancelReason: je.cancelReason,
          lines: je.lines.map((l) => ({
            accountId: l.accountId, debit: l.debit, credit: l.credit,
            vatCode: l.vatCode, description: l.description,
          })),
          documents: je.documents.map((d) => ({
            fileName: d.fileName, fileType: d.fileType, fileSize: d.fileSize,
            filePath: d.filePath, description: d.description,
          })),
          _ref: je.id,
        })), null, 2), { name: 'journal-entries.json' });

        archive.append(JSON.stringify(fiscalPeriods.map((fp) => ({
          year: fp.year, month: fp.month, status: fp.status,
          lockedAt: fp.lockedAt?.toISOString() ?? null, lockedBy: fp.lockedBy, _ref: fp.id,
        })), null, 2), { name: 'fiscal-periods.json' });

        archive.append(JSON.stringify(budgets.map((b) => ({
          name: b.name, year: b.year, notes: b.notes, isActive: b.isActive,
          entries: b.entries.map((e) => ({
            accountNumber: e.account?.number ?? null,
            january: e.january, february: e.february, march: e.march,
            april: e.april, may: e.may, june: e.june,
            july: e.july, august: e.august, september: e.september,
            october: e.october, november: e.november, december: e.december,
          })),
          _ref: b.id,
        })), null, 2), { name: 'budgets.json' });

        archive.append(JSON.stringify(recurringEntries.map((re) => ({
          name: re.name, description: re.description, frequency: re.frequency,
          status: re.status,
          startDate: re.startDate.toISOString().split('T')[0],
          endDate: re.endDate?.toISOString().split('T')[0] ?? null,
          nextExecution: re.nextExecution?.toISOString().split('T')[0] ?? null,
          lastExecuted: re.lastExecuted?.toISOString() ?? null,
          lines: re.lines,
          reference: re.reference, _ref: re.id,
        })), null, 2), { name: 'recurring-entries.json' });

        archive.append(JSON.stringify(bankStatements.map((bs) => ({
          bankAccount: bs.bankAccount,
          startDate: bs.startDate.toISOString().split('T')[0],
          endDate: bs.endDate.toISOString().split('T')[0],
          openingBalance: bs.openingBalance, closingBalance: bs.closingBalance,
          fileName: bs.fileName, importSource: bs.importSource,
          reconciled: bs.reconciled,
          reconciledAt: bs.reconciledAt?.toISOString() ?? null,
          lines: bs.lines.map((l) => ({
            date: l.date.toISOString().split('T')[0], description: l.description,
            reference: l.reference, amount: l.amount, balance: l.balance,
            reconciliationStatus: l.reconciliationStatus,
            matchedJournalLineId: l.matchedJournalLineId,
            matchedAt: l.matchedAt?.toISOString() ?? null,
            matchConfidence: l.matchConfidence,
            matchMethod: l.matchMethod,
          })),
          _ref: bs.id,
        })), null, 2), { name: 'bank-statements.json' });

        archive.append(JSON.stringify(bankConnections.map((bc) => ({
          bankName: bc.bankName, provider: bc.provider,
          registrationNumber: bc.registrationNumber, accountNumber: bc.accountNumber,
          iban: bc.iban, accountName: bc.accountName, currentBalance: bc.currentBalance,
          syncFrequency: bc.syncFrequency, status: bc.status,
          consentId: bc.consentId, consentExpiresAt: bc.consentExpiresAt?.toISOString() ?? null,
          syncs: bc.syncs.map((s) => ({
            status: s.status, startedAt: s.startedAt.toISOString(),
            completedAt: s.completedAt?.toISOString() ?? null,
            transactionsFound: s.transactionsFound, transactionsNew: s.transactionsNew,
            transactionsDup: s.transactionsDup, matchedCount: s.matchedCount,
            errorMessage: s.errorMessage,
          })),
          _ref: bc.id,
        })), null, 2), { name: 'bank-connections.json' });

        archive.append(JSON.stringify(members.map((m) => ({
          email: m.user.email, role: m.role,
          joinedAt: m.joinedAt?.toISOString() ?? null, invitedBy: m.invitedBy,
        })), null, 2), { name: 'members.json' });

        archive.finalize();
      })
      .catch((err) => {
        reject(err);
      });
  });
}

/**
 * Create a backup.
 *
 * @param scope - "tenant" for tenant-specific JSON snapshot (only supported scope)
 *
 * Flow:
 * 1. Export tenant data as structured JSON
 * 2. Create a ZIP containing the JSON files
 * 3. Calculate SHA-256 of the ZIP
 * 4. Record in database
 */
export async function createBackup(
  userId: string,
  triggerType: TriggerType,
  backupType: BackupType,
  companyId: string,
  scope: BackupScope = 'tenant',
  meta?: Record<string, unknown>
): Promise<{ id: string; filePath: string; fileSize: number; sha256: string } | null> {
  // Fetch denormalized reference data for DB readability (companyName + userEmail)
  const [companyInfo, userInfo] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  const companyName = companyInfo?.name ?? null;
  const userEmail = userInfo?.email ?? null;

  const backupDir = await ensureBackupDir(companyId, backupType);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipFilename = `snapshot-${scope}-${backupType}-${timestamp}.zip`;
  const zipFilePath = path.join(backupDir, zipFilename);

  try {
    // ─── Tenant snapshot backup ──────────────────────────────────────
    await createTenantSnapshotZip(companyId, zipFilePath);

    // Calculate SHA-256 of the ZIP file (streaming)
    const stats = fs.statSync(zipFilePath);
    const sha256 = await calculateChecksum(zipFilePath);

    // Calculate expiry
    const expiresMs = RETENTION[backupType]?.expiresMs || 365 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + expiresMs);

    // Save backup record in database
    const backup = await db.backup.create({
      data: {
        userId,
        userEmail,
        companyId,
        companyName,
        triggerType,
        backupType,
        scope,
        filePath: zipFilePath,
        fileSize: stats.size,
        sha256,
        status: 'completed',
        expiresAt,
      },
    });

    // Audit log
    await auditLog({
      action: 'BACKUP_CREATE',
      entityType: 'Backup',
      entityId: backup.id,
      userId,
      companyId,
      metadata: {
        triggerType,
        backupType,
        scope,
        fileSize: stats.size,
        sha256,
        filename: zipFilename,
        format: 'zip',
        ...meta,
      },
    });

    return {
      id: backup.id,
      filePath: zipFilePath,
      fileSize: stats.size,
      sha256,
    };
  } catch (error) {
    logger.error('[BACKUP] Failed to create backup:', error);

    // Clean up any partial files
    try {
      if (fs.existsSync(zipFilePath)) rmSync(zipFilePath, { force: true });
    } catch { /* ignore */ }

    // Record failure — filePath is empty since the file was just deleted
    await db.backup.create({
      data: {
        userId,
        userEmail,
        companyId,
        companyName,
        triggerType,
        backupType,
        scope,
        filePath: '',
        fileSize: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return null;
  }
}

/**
 * Restore from a backup.
 *
 * Parses the JSON files from the tenant snapshot ZIP,
 * deletes existing tenant data, and re-imports from the snapshot.
 * Only affects data belonging to this tenant (not other tenants).
 * Creates a pre-restore safety backup first.
 */
export async function restoreBackup(
  userId: string,
  backupId: string,
  companyId: string,
  meta?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const backup = await db.backup.findFirst({
    where: { id: backupId },
  });

  if (!backup) {
    return { success: false, error: 'Backup not found' };
  }

  if (!fs.existsSync(backup.filePath)) {
    return { success: false, error: 'Backup file not found on disk' };
  }

  // Verify checksum on the ZIP file (streaming)
  if (backup.sha256) {
    const currentChecksum = await calculateChecksum(backup.filePath);
    if (currentChecksum !== backup.sha256) {
      return { success: false, error: 'Backup checksum mismatch — file may be corrupted' };
    }
  }

  return restoreTenantSnapshot(userId, backup, companyId, meta);
}

/**
 * Restore from a tenant snapshot backup.
 * Deletes existing tenant data and re-imports from the snapshot ZIP.
 * Only affects data belonging to the specific tenant — NOT other tenants.
 *
 * Uses a database transaction to make delete+import atomic — if import fails,
 * the entire operation rolls back so no data is lost.
 */
async function restoreTenantSnapshot(
  userId: string,
  backup: { id: string; backupType: string; filePath: string },
  companyId: string,
  meta?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Create pre-restore safety backup — MUST succeed
    const preRestoreBackup = await createBackup(userId, 'automatic', 'hourly', companyId, 'tenant', {
      reason: 'pre-tenant-restore-snapshot',
    });
    if (!preRestoreBackup) {
      return { success: false, error: 'Pre-restore safety backup failed — aborting restore to protect data' };
    }

    // 2. Parse the tenant snapshot ZIP
    const zipBuffer = fs.readFileSync(backup.filePath);
    const zip = await JSZip.loadAsync(zipBuffer);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return { success: false, error: 'Invalid tenant snapshot: missing manifest.json' };
    }

    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest.version !== 2) {
      return { success: false, error: `Unsupported backup version: ${manifest.version}. Only version 2 is supported.` };
    }

    // 3. Delete + import inside a transaction (atomic — rolls back on failure)
    const importedCounts = await db.$transaction(async (tx) => {
      // Delete existing tenant data (FK-safe order)
      await tx.bankStatementLine.deleteMany({ where: { bankStatement: { companyId } } });
      await tx.budgetEntry.deleteMany({ where: { budget: { companyId } } });
      await tx.journalEntryLine.deleteMany({ where: { journalEntry: { companyId } } });
      await tx.document.deleteMany({ where: { journalEntry: { companyId } } });
      await tx.bankConnectionSync.deleteMany({ where: { bankConnection: { companyId } } });

      await tx.bankStatement.deleteMany({ where: { companyId } });
      await tx.bankConnection.deleteMany({ where: { companyId } });
      await tx.recurringEntry.deleteMany({ where: { companyId } });
      await tx.budget.deleteMany({ where: { companyId } });
      await tx.fiscalPeriod.deleteMany({ where: { companyId } });
      await tx.journalEntry.deleteMany({ where: { companyId } });
      await tx.transaction.deleteMany({ where: { companyId } });
      await tx.invoice.deleteMany({ where: { companyId } });
      await tx.contact.deleteMany({ where: { companyId } });
      await tx.account.deleteMany({ where: { companyId } });

      // Import from snapshot
      return importTenantDataFromZip(zip, companyId, userId, tx);
    }, { timeout: 10 * 60 * 1000 }); // 10-minute timeout for large restores

    // 4. Audit log
    await auditLog({
      action: 'BACKUP_RESTORE',
      entityType: 'Backup',
      entityId: backup.id,
      userId,
      companyId,
      metadata: {
        restoredFrom: backup.backupType,
        scope: 'tenant',
        preRestoreBackupId: preRestoreBackup.id,
        format: 'zip',
        importedCounts,
        snapshotExportedAt: manifest.exportedAt ?? 'unknown',
        ...meta,
      },
    });

    logger.warn(`[BACKUP] Tenant snapshot restore successful for company ${companyId}:`, importedCounts);
    return { success: true };
  } catch (error) {
    logger.error('[BACKUP] Tenant snapshot restore failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during tenant restore',
    };
  }
}

/**
 * Restore from an uploaded backup ZIP buffer.
 *
 * Expects the ZIP to contain "manifest.json" (tenant snapshot format).
 * The caller (API route) is responsible for permission checks.
 *
 * Uses a database transaction to make delete+import atomic.
 */
export async function restoreBackupFromBuffer(
  userId: string,
  zipBuffer: Buffer,
  companyId: string,
  isAppOwner: boolean,
  originalFilename?: string,
  meta?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    return { success: false, error: 'Uploaded file is not a valid ZIP archive' };
  }

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    return {
      success: false,
      error: 'Uploaded ZIP does not contain a valid tenant snapshot. Expected manifest.json.',
    };
  }

  // Parse and validate manifest
  const manifest = JSON.parse(await manifestFile.async('string'));
  if (manifest.version !== 2) {
    return { success: false, error: `Unsupported backup version: ${manifest.version}. Only version 2 is supported.` };
  }

  // Create a pre-restore safety backup — MUST succeed
  const preRestoreBackup = await createBackup(userId, 'automatic', 'hourly', companyId, 'tenant', {
    reason: 'pre-upload-tenant-restore',
    source: originalFilename || 'uploaded-snapshot.zip',
  });
  if (!preRestoreBackup) {
    return { success: false, error: 'Pre-restore safety backup failed — aborting restore to protect data' };
  }

  try {
    // Delete + import inside a transaction (atomic — rolls back on failure)
    const importedCounts = await db.$transaction(async (tx) => {
      // Delete existing tenant data (FK-safe order)
      await tx.bankStatementLine.deleteMany({ where: { bankStatement: { companyId } } });
      await tx.budgetEntry.deleteMany({ where: { budget: { companyId } } });
      await tx.journalEntryLine.deleteMany({ where: { journalEntry: { companyId } } });
      await tx.document.deleteMany({ where: { journalEntry: { companyId } } });
      await tx.bankConnectionSync.deleteMany({ where: { bankConnection: { companyId } } });

      await tx.bankStatement.deleteMany({ where: { companyId } });
      await tx.bankConnection.deleteMany({ where: { companyId } });
      await tx.recurringEntry.deleteMany({ where: { companyId } });
      await tx.budget.deleteMany({ where: { companyId } });
      await tx.fiscalPeriod.deleteMany({ where: { companyId } });
      await tx.journalEntry.deleteMany({ where: { companyId } });
      await tx.transaction.deleteMany({ where: { companyId } });
      await tx.invoice.deleteMany({ where: { companyId } });
      await tx.contact.deleteMany({ where: { companyId } });
      await tx.account.deleteMany({ where: { companyId } });

      // Import from snapshot
      return importTenantDataFromZip(zip, companyId, userId, tx);
    }, { timeout: 10 * 60 * 1000 }); // 10-minute timeout for large restores

    // Audit log
    await auditLog({
      action: 'BACKUP_RESTORE',
      entityType: 'Backup',
      entityId: 'upload-tenant-restore',
      userId,
      companyId,
      metadata: {
        source: 'upload',
        scope: 'tenant',
        originalFilename: originalFilename || 'unknown',
        fileSize: zipBuffer.length,
        sha256: crypto.createHash('sha256').update(zipBuffer).digest('hex'),
        preRestoreBackupId: preRestoreBackup.id,
        importedCounts,
        snapshotExportedAt: manifest.exportedAt ?? 'unknown',
        ...meta,
      },
    });

    logger.info(`[BACKUP] Upload tenant snapshot restore successful from ${originalFilename || 'uploaded file'}`);
    return { success: true };
  } catch (error) {
    logger.error('[BACKUP] Upload tenant snapshot restore failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during upload restore',
    };
  }
}

/**
 * Helper: Import tenant data from an already-parsed JSZip object.
 * Returns counts of imported records per type.
 *
 * @param tx - Prisma transaction client (from db.$transaction callback)
 */
async function importTenantDataFromZip(
  zip: InstanceType<typeof JSZip>,
  companyId: string,
  userId: string,
  tx: PrismaTransactionClient
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Company settings
  const companyFile = zip.file('company.json');
  if (companyFile) {
    const companyData = JSON.parse(await companyFile.async('string'));
    await tx.company.update({
      where: { id: companyId },
      data: {
        name: companyData.name,
        address: companyData.address ?? '',
        phone: companyData.phone ?? '',
        email: companyData.email ?? '',
        cvrNumber: companyData.cvrNumber ?? '',
        companyType: companyData.companyType,
        invoicePrefix: companyData.invoicePrefix ?? 'INV',
        invoiceTerms: companyData.invoiceTerms ?? '',
        invoiceNotesTemplate: companyData.invoiceNotesTemplate,
        nextInvoiceSequence: companyData.nextInvoiceSequence ?? 1,
        currentYear: companyData.currentYear ?? new Date().getFullYear(),
        bankName: companyData.bankName ?? '',
        bankAccount: companyData.bankAccount ?? '',
        bankRegistration: companyData.bankRegistration ?? '',
        bankIban: companyData.bankIban,
        bankStreet: companyData.bankStreet,
        bankCity: companyData.bankCity,
        bankCountry: companyData.bankCountry,
        dashboardWidgets: companyData.dashboardWidgets,
      },
    });
    counts.company = 1;
  }

  // Accounts
  const accountsFile = zip.file('accounts.json');
  if (accountsFile) {
    const accountsData = JSON.parse(await accountsFile.async('string')) as Array<Record<string, unknown>>;
    for (const a of accountsData) {
      await tx.account.create({
        data: {
          companyId, userId,
          number: a.number as string, name: a.name as string,
          nameEn: (a.nameEn as string) ?? null,
          type: a.type as AccountType, group: a.group as AccountGroup,
          description: (a.description as string) ?? null,
          isActive: (a.isActive as boolean) ?? true,
          isSystem: (a.isSystem as boolean) ?? false,
        },
      });
    }
    counts.accounts = accountsData.length;
  }

  // Contacts
  const contactsFile = zip.file('contacts.json');
  if (contactsFile) {
    const contactsData = JSON.parse(await contactsFile.async('string')) as Array<Record<string, unknown>>;
    for (const c of contactsData) {
      await tx.contact.create({
        data: {
          companyId, userId,
          name: c.name as string,
          cvrNumber: (c.cvrNumber as string) ?? null,
          email: (c.email as string) ?? null, phone: (c.phone as string) ?? null,
          address: (c.address as string) ?? null, city: (c.city as string) ?? null,
          postalCode: (c.postalCode as string) ?? null,
          country: (c.country as string) ?? 'Danmark',
          type: c.type as ContactType, notes: (c.notes as string) ?? null,
          isActive: (c.isActive as boolean) ?? true,
        },
      });
    }
    counts.contacts = contactsData.length;
  }

  // Transactions
  const txFile = zip.file('transactions.json');
  if (txFile) {
    const txData = JSON.parse(await txFile.async('string')) as Array<Record<string, unknown>>;
    for (const t of txData) {
      await tx.transaction.create({
        data: {
          companyId, userId,
          date: new Date(t.date as string), type: t.type as TransactionType,
          amount: t.amount as number, currency: (t.currency as string) ?? 'DKK',
          exchangeRate: (t.exchangeRate as number) ?? null,
          amountDKK: (t.amountDKK as number) ?? null,
          description: t.description as string,
          vatPercent: (t.vatPercent as number) ?? 25.0,
          receiptImage: (t.receiptImage as string) ?? null,
          invoiceId: (t.invoiceId as string) ?? null,
          accountId: (t.accountId as string) ?? null,
          cancelled: (t.cancelled as boolean) ?? false,
          cancelReason: (t.cancelReason as string) ?? null,
        },
      });
    }
    counts.transactions = txData.length;
  }

  // Invoices
  const invFile = zip.file('invoices.json');
  if (invFile) {
    const invData = JSON.parse(await invFile.async('string')) as Array<Record<string, unknown>>;
    for (const inv of invData) {
      await tx.invoice.create({
        data: {
          companyId, userId,
          invoiceNumber: inv.invoiceNumber as string,
          customerName: inv.customerName as string,
          customerAddress: (inv.customerAddress as string) ?? null,
          customerEmail: (inv.customerEmail as string) ?? null,
          customerPhone: (inv.customerPhone as string) ?? null,
          customerCvr: (inv.customerCvr as string) ?? null,
          issueDate: new Date(inv.issueDate as string),
          dueDate: new Date(inv.dueDate as string),
          lineItems: inv.lineItems as string,
          subtotal: inv.subtotal as number, vatTotal: inv.vatTotal as number,
          total: inv.total as number, currency: (inv.currency as string) ?? 'DKK',
          exchangeRate: (inv.exchangeRate as number) ?? null,
          status: inv.status as InvoiceStatus, notes: (inv.notes as string) ?? null,
          contactId: (inv.contactId as string) ?? null,
          cancelled: (inv.cancelled as boolean) ?? false,
          cancelReason: (inv.cancelReason as string) ?? null,
        },
      });
    }
    counts.invoices = invData.length;
  }

  // Journal entries
  const jeFile = zip.file('journal-entries.json');
  if (jeFile) {
    const jeData = JSON.parse(await jeFile.async('string')) as Array<Record<string, unknown>>;
    for (const je of jeData) {
      const entry = await tx.journalEntry.create({
        data: {
          companyId, userId,
          date: new Date(je.date as string), description: je.description as string,
          reference: (je.reference as string) ?? null, status: je.status as JournalEntryStatus,
          cancelled: (je.cancelled as boolean) ?? false,
          cancelReason: (je.cancelReason as string) ?? null,
        },
      });
      for (const l of ((je.lines as Array<Record<string, unknown>>) ?? [])) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: entry.id, companyId,
            accountId: l.accountId as string,
            debit: (l.debit as number) ?? 0, credit: (l.credit as number) ?? 0,
            vatCode: (l.vatCode as VATCode) ?? null,
            description: (l.description as string) ?? null,
          },
        });
      }
      for (const d of ((je.documents as Array<Record<string, unknown>>) ?? [])) {
        await tx.document.create({
          data: {
            journalEntryId: entry.id, companyId,
            fileName: d.fileName as string, fileType: d.fileType as string,
            fileSize: (d.fileSize as number) ?? 0,
            filePath: (d.filePath as string) ?? '',
            description: (d.description as string) ?? null,
          },
        });
      }
    }
    counts.journalEntries = jeData.length;
  }

  // Fiscal periods
  const fpFile = zip.file('fiscal-periods.json');
  if (fpFile) {
    const fpData = JSON.parse(await fpFile.async('string')) as Array<Record<string, unknown>>;
    for (const fp of fpData) {
      await tx.fiscalPeriod.create({
        data: {
          companyId, userId,
          year: fp.year as number, month: fp.month as number,
          status: fp.status as PeriodStatus,
          lockedAt: fp.lockedAt ? new Date(fp.lockedAt as string) : null,
          lockedBy: (fp.lockedBy as string) ?? null,
        },
      });
    }
    counts.fiscalPeriods = fpData.length;
  }

  // Budgets
  const budgetFile = zip.file('budgets.json');
  if (budgetFile) {
    const budgetData = JSON.parse(await budgetFile.async('string')) as Array<Record<string, unknown>>;
    for (const b of budgetData) {
      const budget = await tx.budget.create({
        data: {
          companyId, userId,
          name: b.name as string, year: b.year as number,
          notes: (b.notes as string) ?? null, isActive: (b.isActive as boolean) ?? true,
        },
      });
      for (const e of ((b.entries as Array<Record<string, unknown>>) ?? [])) {
        let accountId: string | null = null;
        if (e.accountNumber) {
          const acct = await tx.account.findFirst({ where: { companyId, number: e.accountNumber as string } });
          if (acct) accountId = acct.id;
        }
        if (!accountId) continue;
        await tx.budgetEntry.create({
          data: {
            budgetId: budget.id, companyId, accountId,
            january: (e.january as number) ?? 0, february: (e.february as number) ?? 0,
            march: (e.march as number) ?? 0, april: (e.april as number) ?? 0,
            may: (e.may as number) ?? 0, june: (e.june as number) ?? 0,
            july: (e.july as number) ?? 0, august: (e.august as number) ?? 0,
            september: (e.september as number) ?? 0, october: (e.october as number) ?? 0,
            november: (e.november as number) ?? 0, december: (e.december as number) ?? 0,
          },
        });
      }
    }
    counts.budgets = budgetData.length;
  }

  // Recurring entries
  const reFile = zip.file('recurring-entries.json');
  if (reFile) {
    const reData = JSON.parse(await reFile.async('string')) as Array<Record<string, unknown>>;
    for (const re of reData) {
      await tx.recurringEntry.create({
        data: {
          companyId, userId,
          name: re.name as string, description: re.description as string,
          frequency: re.frequency as RecurringFrequency, status: re.status as RecurringStatus,
          startDate: new Date(re.startDate as string),
          endDate: re.endDate ? new Date(re.endDate as string) : null,
          nextExecution: re.nextExecution ? new Date(re.nextExecution as string) : new Date(),
          lastExecuted: re.lastExecuted ? new Date(re.lastExecuted as string) : null,
          lines: re.lines ?? [],
          reference: (re.reference as string) ?? null,
        },
      });
    }
    counts.recurringEntries = reData.length;
  }

  // Bank statements
  const bsFile = zip.file('bank-statements.json');
  if (bsFile) {
    const bsData = JSON.parse(await bsFile.async('string')) as Array<Record<string, unknown>>;
    for (const bs of bsData) {
      const stmt = await tx.bankStatement.create({
        data: {
          companyId, userId,
          bankAccount: bs.bankAccount as string,
          startDate: new Date(bs.startDate as string),
          endDate: new Date(bs.endDate as string),
          openingBalance: bs.openingBalance as number,
          closingBalance: bs.closingBalance as number,
          fileName: (bs.fileName as string) ?? null,
          importSource: (bs.importSource as string) ?? null,
          reconciled: (bs.reconciled as boolean) ?? false,
          reconciledAt: bs.reconciledAt ? new Date(bs.reconciledAt as string) : null,
        },
      });
      for (const l of ((bs.lines as Array<Record<string, unknown>>) ?? [])) {
        await tx.bankStatementLine.create({
          data: {
            bankStatementId: stmt.id, companyId,
            date: new Date(l.date as string), description: l.description as string,
            reference: (l.reference as string) ?? null, amount: l.amount as number,
            balance: l.balance as number,
            reconciliationStatus: (l.reconciliationStatus as ReconciliationStatus) ?? 'UNMATCHED',
            matchedJournalLineId: (l.matchedJournalLineId as string) ?? null,
            matchedAt: l.matchedAt ? new Date(l.matchedAt as string) : null,
            matchConfidence: (l.matchConfidence as number) ?? null,
            matchMethod: (l.matchMethod as string) ?? null,
          },
        });
      }
    }
    counts.bankStatements = bsData.length;
  }

  // Bank connections (with syncs)
  const bcFile = zip.file('bank-connections.json');
  if (bcFile) {
    const bcData = JSON.parse(await bcFile.async('string')) as Array<Record<string, unknown>>;
    for (const bc of bcData) {
      const connection = await tx.bankConnection.create({
        data: {
          companyId,
          userId,
          bankName: bc.bankName as string,
          provider: bc.provider as string,
          registrationNumber: (bc.registrationNumber as string) ?? null,
          accountNumber: bc.accountNumber as string,
          iban: (bc.iban as string) ?? null,
          accountName: (bc.accountName as string) ?? null,
          currentBalance: (bc.currentBalance as number) ?? null,
          syncFrequency: (bc.syncFrequency as string) ?? 'daily',
          status: (bc.status as BankConnectionStatus) ?? 'PENDING',
          consentId: (bc.consentId as string) ?? null,
          consentExpiresAt: bc.consentExpiresAt ? new Date(bc.consentExpiresAt as string) : null,
        },
      });

      const syncs = (bc.syncs as Array<Record<string, unknown>>) ?? [];
      for (const s of syncs) {
        await tx.bankConnectionSync.create({
          data: {
            bankConnectionId: connection.id,
            companyId,
            status: (s.status as SyncStatus) ?? 'PENDING',
            startedAt: new Date(s.startedAt as string),
            completedAt: s.completedAt ? new Date(s.completedAt as string) : null,
            transactionsFound: (s.transactionsFound as number) ?? 0,
            transactionsNew: (s.transactionsNew as number) ?? 0,
            transactionsDup: (s.transactionsDup as number) ?? 0,
            matchedCount: (s.matchedCount as number) ?? 0,
            errorMessage: (s.errorMessage as string) ?? null,
          },
        });
      }
    }
    counts.bankConnections = bcData.length;
  }

  // Members — restore team membership
  const membersFile = zip.file('members.json');
  if (membersFile) {
    const membersData = JSON.parse(await membersFile.async('string')) as Array<Record<string, unknown>>;
    let imported = 0;
    for (const m of membersData) {
      const memberEmail = (m.email as string)?.toLowerCase().trim();
      if (!memberEmail) continue;

      // Find or skip user by email
      const existingUser = await tx.user.findUnique({ where: { email: memberEmail } });
      if (!existingUser) continue; // User doesn't exist in the system — skip

      // Check if already a member
      const existingMember = await tx.userCompany.findUnique({
        where: { userId_companyId: { userId: existingUser.id, companyId } },
      });
      if (existingMember) continue; // Already a member — skip

      await tx.userCompany.create({
        data: {
          userId: existingUser.id,
          companyId,
          role: (m.role as CompanyRole) ?? 'VIEWER',
          joinedAt: m.joinedAt ? new Date(m.joinedAt as string) : new Date(),
          invitedBy: (m.invitedBy as string) ?? null,
        },
      });
      imported++;
    }
    counts.members = imported;
  }

  return counts;
}

/**
 * Clean up expired backups for a company
 */
export async function cleanupExpiredBackups(companyId: string): Promise<number> {
  let deleted = 0;

  // 1. Delete expired backups (past their expiresAt date)
  const expired = await db.backup.findMany({
    where: { companyId, expiresAt: { lt: new Date() } },
  });
  for (const backup of expired) {
    try { if (fs.existsSync(backup.filePath)) rmSync(backup.filePath, { force: true }); } catch { /* ignore */ }
    await db.backup.delete({ where: { id: backup.id } });
    deleted++;
  }

  // 2. Enforce retention count limits per type (keep only N most recent)
  const types: BackupType[] = ['hourly', 'daily', 'weekly', 'monthly', 'manual'];
  for (const backupType of types) {
    const maxCount = RETENTION[backupType]?.count;
    if (!maxCount) continue;

    const completed = await db.backup.findMany({
      where: { companyId, backupType, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, filePath: true },
    });

    const toRemove = completed.slice(maxCount);
    for (const backup of toRemove) {
      try { if (fs.existsSync(backup.filePath)) rmSync(backup.filePath, { force: true }); } catch { /* ignore */ }
      await db.backup.delete({ where: { id: backup.id } });
      deleted++;
    }
  }

  return deleted;
}

/**
 * Run automatic backup for a company (called by scheduler).
 * Always uses tenant snapshot scope (full-db was removed for PostgreSQL migration).
 */
export async function runAutomaticBackup(userId: string, companyId: string, backupType: BackupType): Promise<void> {
  await createBackup(userId, 'automatic', backupType, companyId, 'tenant', {
    scheduled: true,
    timestamp: new Date().toISOString(),
  });

  // Cleanup old backups for this company
  await cleanupExpiredBackups(companyId);
}

/**
 * Verify a backup's integrity by comparing the computed checksum against the stored one
 */
export async function verifyBackup(backupId: string): Promise<{ exists: boolean; matches: boolean; error?: string }> {
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (!backup) return { exists: false, matches: false, error: 'Backup not found' };

  if (!fs.existsSync(backup.filePath)) return { exists: false, matches: false, error: 'File not found' };

  if (!backup.sha256) return { exists: true, matches: false, error: 'No stored checksum to verify against' };

  const currentChecksum = await calculateChecksum(backup.filePath);
  return { exists: true, matches: currentChecksum === backup.sha256 };
}
