# Multi-Tenant RBAC — Current Development State
## AlphaFlow (AlphaAi Accounting) — Multi-Tenant Implementation Status

> **Last updated**: Based on full code investigation (not README).  
> **Note**: This document reflects the ACTUAL state of the codebase. The original implementation plan sections are retained as reference with completion status annotations.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prisma Schema — Current State](#2-prisma-schema--current-state)
3. [Auth Session — Current State](#3-auth-session--current-state)
4. [RBAC Permission Matrix](#4-rbac-permission-matrix)
5. [Implementation Status](#5-implementation-status)
6. [Features Beyond Original Plan](#6-features-beyond-original-plan)
7. [Known Deviations from Plan](#7-known-deviations-from-plan)
8. [Remaining Work](#8-remaining-work)

---

## 1. Architecture Overview

### Original State (Before Multi-Tenant)
```
User (1) ──owns──> (N) Transactions, Invoices, Accounts, etc.
     Every query: WHERE userId = currentUserId
```

### Current State (Implemented)
```
User (M) ──belongs to──> (N) Company  (via UserCompany junction)
Company (1) ──owns──> (N) Transactions, Invoices, Accounts, etc.
     Every query: WHERE companyId = activeCompanyId
     Every mutation: CHECK role has permission
     SUPER_DEV: read-only cross-tenant access via oversightCompanyId
```

### Key Design Decisions (Implemented)

| Decision | Choice | Rationale | Status |
|---|---|---|---|
| CompanyInfo → Company? | **MERGED** ✅ | CompanyInfo IS the company. All fields moved into `Company`. Old `CompanyInfo` model deleted. | **DONE** |
| Where to store active companyId? | **On Session model** | No extra cookies. Session validated on every request. | **DONE** |
| SUPER_DEV implementation? | **`isSuperDev` boolean on User** | Simple flag checked in RBAC. Read-only in oversight mode, full OWNER in own company. | **DONE** |
| Oversight mode? | **`oversightCompanyId` on Session** | Allows SUPER_DEV to view any tenant's data in read-only mode. | **DONE** (beyond plan) |
| userId on company-scoped models? | **Kept** | Retained for backwards compatibility and audit trail tracking. | **Kept** |
| Company selector UX? | **Top of sidebar, below logo** | Single-company users see name only. Multi-company users get dropdown. | **DONE** |
| Database provider | **PostgreSQL** | Production-grade database (plan originally mentioned SQLite). | **DONE** |

---

## 2. Prisma Schema — Current State

### 2A. Enums (All Implemented ✅)

| Enum | Values | Status |
|---|---|---|
| `CompanyRole` | OWNER, ADMIN, ACCOUNTANT, VIEWER, AUDITOR | ✅ |
| `InvitationStatus` | PENDING, ACCEPTED, EXPIRED, REVOKED | ✅ |
| `TransactionType` | SALE, PURCHASE, SALARY, BANK, Z_REPORT, PRIVATE, ADJUSTMENT | ✅ |
| `InvoiceStatus` | DRAFT, SENT, PAID, CANCELLED | ✅ |
| `AccountType` | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE | ✅ |
| `AccountGroup` | CASH, BANK, RECEIVABLES, INVENTORY, FIXED_ASSETS, etc. (16 groups) | ✅ |
| `JournalEntryStatus` | DRAFT, POSTED, CANCELLED | ✅ |
| `ContactType` | CUSTOMER, SUPPLIER, BOTH | ✅ |
| `PeriodStatus` | OPEN, CLOSED | ✅ |
| `VATCode` | S25, S12, S0, SEU, K25, K12, K0, KEU, KUF, NONE | ✅ |
| `RecurringFrequency` | DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY | ✅ |
| `RecurringStatus` | ACTIVE, PAUSED, COMPLETED | ✅ |
| `ReconciliationStatus` | UNMATCHED, MATCHED, MANUAL, AI_SUGGESTED | ✅ |
| `BankConnectionStatus` | ACTIVE, EXPIRED, PENDING, REVOKED, ERROR | ✅ |
| `SyncStatus` | SUCCESS, PARTIAL, FAILED, PENDING | ✅ |

### 2B. Core Models (All Implemented ✅)

#### Company (Tenant Entity) ✅
- **22 fields** including business registration, invoice settings, bank details, dashboardWidgets (JSON)
- Relations: members, invitations, transactions, invoices, accounts, journalEntries, contacts, fiscalPeriods, bankStatements, bankConnections, recurringEntries, budgets, backups, auditLogs, sessions, oversightSessions
- Constraints: `@@unique([name])`, indexes on `isActive` and `cvrNumber`

#### UserCompany (Junction) ✅
- Fields: userId, companyId, role (CompanyRole), joinedAt, invitedBy
- Constraints: `@@unique([userId, companyId])`

#### Invitation ✅
- Fields: companyId, email, role, token (unique), status, invitedBy, expiresAt, acceptedAt, acceptedBy
- Indexes on email+status, companyId+status, token, expiresAt

#### User ✅
- **Key multi-tenant fields**: isSuperDev, emailVerified, emailVerificationToken, emailVerifiedAt, resetPasswordToken, resetPasswordExpires, trialClaimedAt
- Relations: companies (UserCompany[]), performedAuditLogs, plus legacy userId relations

#### Session ✅
- **Key fields**: token (unique), userId, activeCompanyId, oversightCompanyId, ipAddress, userAgent, expiresAt
- Relations: user, activeCompany, oversightCompany
- **Note**: `oversightCompanyId` was added beyond the original plan for SUPER_DEV oversight mode

### 2C. Company-Scoped Models (All Have companyId ✅)

| Model | companyId | userId (kept) | Unique Constraints |
|---|---|---|---|
| Transaction | ✅ | ✅ (optional) | `@@index([companyId, date])`, `@@index([companyId, type, date])` |
| Invoice | ✅ | ✅ (optional) | `@@unique([companyId, invoiceNumber])` |
| Account | ✅ | ✅ (optional) | `@@unique([companyId, number])` |
| JournalEntry | ✅ | ✅ (optional) | `@@index([companyId, date])`, `@@index([companyId, status, date])` |
| Contact | ✅ | ✅ (optional) | `@@index([companyId, type])`, `@@index([companyId, cvrNumber])` |
| FiscalPeriod | ✅ | ✅ (optional) | `@@unique([companyId, year, month])` |
| BankStatement | ✅ | ✅ (optional) | `@@index([companyId, bankAccount])`, `@@index([companyId, startDate])` |
| BankConnection | ✅ | ✅ (optional) | `@@unique([companyId, accountNumber])` |
| RecurringEntry | ✅ | ✅ (optional) | `@@index([companyId, status])`, `@@index([companyId, nextExecution])` |
| Budget | ✅ | ✅ (optional) | `@@unique([companyId, year])` |
| Backup | ✅ | ✅ (optional) | `@@index([companyId, backupType])`, `@@index([companyId, createdAt])` |
| AuditLog | ✅ (optional) | ✅ (optional) | `@@index([companyId, createdAt])` |

### 2D. Supporting Models

| Model | Description | Status |
|---|---|---|
| JournalEntryLine | Journal lines with companyId (denormalized), accountId, debit/credit, vatCode | ✅ |
| BankStatementLine | Statement lines with companyId (denormalized), reconciliation status, match fields | ✅ |
| BankConnectionSync | Sync history with companyId (denormalized), status, transaction counts | ✅ |
| BudgetEntry | Monthly budget amounts by account, companyId (denormalized) | ✅ |
| Document | Attached to JournalEntry, companyId (denormalized) | ✅ |
| EmailLog | Email delivery log (verification, password-reset, invitation, owner-notification) | ✅ (beyond plan) |

### 2E. CompanyInfo Model — REMOVED ✅
The old `CompanyInfo` model has been fully deleted from the Prisma schema. All fields merged into `Company`.

---

## 3. Auth Session — Current State

### 3A. AuthContext Interface (Implemented ✅)

```typescript
// src/lib/session.ts — actual implementation

export interface AuthContext {
  id: string;
  email: string;
  emailVerified: boolean;        // Beyond plan
  businessName?: string | null;
  isSuperDev: boolean;
  
  // Active company context
  activeCompanyId: string | null;
  activeCompanyRole: string | null;  // CompanyRole as string
  activeCompanyName: string | null;
  
  // Demo mode
  demoModeEnabled: boolean;
  isDemoCompany: boolean;           // Beyond plan
  oversightCompanyId: string | null;  // Beyond plan
  oversightCompanyName: string | null;
  isOversightMode: boolean;
}
```

**Implementation details:**
- Supports both cookie-based and Bearer token authentication
- Sliding session expiry (7 days)
- SUPER_DEV in oversight mode gets implicit OWNER role (read-only)
- SUPER_DEV always treated as emailVerified
- `isDemoCompany` checks: `session.activeCompany.isDemo === true && cvrNumber === '29876543'`

### 3B. Session Creation (Implemented ✅)
- Auto-selects user's first company as activeCompanyId on login
- Captures IP address and user agent
- Used by login, registration, and invitation acceptance flows

### 3C. Company Switch (Implemented ✅)
- `POST /api/company/switch` updates `activeCompanyId` on session
- SUPER_DEV can switch to any company
- Normal users verified via UserCompany membership
- Frontend reloads page after switch to refresh all data

### 3D. RBAC Module (Implemented ✅)

```typescript
// src/lib/rbac.ts — actual implementation

export enum Permission {
  // Company settings (4)
  COMPANY_VIEW_SETTINGS, COMPANY_EDIT_SETTINGS, COMPANY_TRANSFER_OWNERSHIP, COMPANY_DELETE,
  // Member management (4)
  MEMBERS_VIEW, MEMBERS_INVITE, MEMBERS_REMOVE, MEMBERS_CHANGE_ROLE,
  // Accounting data (5)
  DATA_READ, DATA_CREATE, DATA_EDIT, DATA_CANCEL, DATA_DELETE,
  // Reports (3)
  REPORTS_VIEW, REPORTS_EXPORT, REPORTS_SAFT,
  // Period management (3)
  PERIOD_CLOSE, PERIOD_OPEN, YEAR_END_CLOSE,
  // Banking (2)
  BANK_CONNECT, BANK_SYNC,
  // Backup (2)
  BACKUP_CREATE, BACKUP_RESTORE,
}
// Total: 23 permissions
```

**Key functions exported:**
- `hasPermission(ctx, permission)` — Role hierarchy check + SUPER_DEV handling
- `requirePermission(ctx, permission)` — API guard returning 403 if denied
- `companyScope(ctx)` — Prisma `{ companyId }` filter (handles oversight mode)
- `tenantFilter(ctx)` — Combined company + demo filter
- `blockOversightMutation(ctx)` — Blocks writes when in oversight mode
- `requireNotDemoCompany(ctx)` — Blocks writes on shared demo company
- `getRoleLevel(role)` — Numeric level for role comparison (OWNER=5 → AUDITOR=1)

**SUPER_DEV behavior:**
- Oversight mode: read-only via SUPER_DEV_READ_PERMISSIONS set
- Own company: full OWNER permissions
- `requirePermission()` auto-blocks demo company mutations for non-owners

### 3E. Frontend Permission Hook (Implemented ✅)

```typescript
// src/lib/use-permissions.ts

export function usePermissions() {
  // Returns: role, level, isOwner, isAdmin, isAccountant, isViewer, isSuperDev,
  //          isOversightMode, canRead, canCreate, canEdit, canCancel, canDelete,
  //          canViewSettings, canEditSettings, canViewMembers, canInviteMembers,
  //          canRemoveMembers, canChangeRoles, canViewReports, canExportReports,
  //          canExportSaft, canClosePeriod, canReopenPeriod, canYearEndClose,
  //          canConnectBank, canSyncBank, canCreateBackup, canRestoreBackup, isReadOnly
}
```
- All mutation permissions return `false` when `isOversightMode === true`
- Used by `TeamManagement`, `TransactionsPage`, `InvoicesPage`, etc. for conditional UI rendering

---

## 4. RBAC Permission Matrix

### Detailed Role Capabilities (Implemented ✅)

| Action | OWNER | ADMIN | ACCOUNTANT | VIEWER | AUDITOR | SUPER_DEV |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Company Settings** | | | | | | |
| View company settings | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Edit company settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete company | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Member Management** | | | | | | |
| View members | ✅ | ✅ | ❌ | ❌ | ❌ | 👁️ |
| Invite members | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remove members | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ |
| Change member roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Accounting Data** | | | | | | |
| View transactions/journals | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Create transactions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit transactions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel (soft-delete) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create/edit invoices | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Chart of Accounts** | | | | | | |
| View accounts | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Create/edit accounts | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Reports & Export** | | | | | | |
| View reports | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Export PDF/Excel | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Export SAF-T | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Period Management** | | | | | | |
| Close fiscal periods | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reopen closed periods | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Year-end closing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Bank** | | | | | | |
| Connect bank accounts | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sync bank data | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reconcile | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Backups** | | | | | | |
| Create backup | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Restore backup | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Audit Trail** | | | | | | |
| View audit log | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |

> \* ADMIN cannot remove OWNER members or change OWNER roles  
> 👁️ = Read-only access (SUPER_DEV cannot mutate any data)

### Enforcement Layers (Implemented ✅)

Every mutation API route applies these guards in order:
1. `getAuthContext()` — Authentication check
2. `requirePermission(ctx, permission)` — RBAC check
3. `blockOversightMutation(ctx)` — Oversight mode block
4. `requireNotDemoCompany(ctx)` — Demo company write block
5. `requireTokenPayAccess(userId)` — TokenPay proof-based access gate

---

## 5. Implementation Status

### Phase A: Schema & Core Infrastructure ✅ COMPLETE

| # | Task | Status | Files |
|---|---|---|---|
| A1 | CompanyRole, InvitationStatus enums | ✅ Done | `prisma/schema.prisma` |
| A2 | Company model | ✅ Done | `prisma/schema.prisma` |
| A3 | UserCompany junction model | ✅ Done | `prisma/schema.prisma` |
| A4 | Invitation model | ✅ Done | `prisma/schema.prisma` |
| A5 | companyId on all company-scoped models | ✅ Done | `prisma/schema.prisma` (12 models) |
| A6 | isSuperDev on User, activeCompanyId on Session | ✅ Done | `prisma/schema.prisma` |
| A7 | companyId + performedByUserId on AuditLog | ✅ Done | `prisma/schema.prisma` |
| A8 | Schema applied to database | ✅ Done | PostgreSQL |
| A9 | Data migration script | ⚠️ Not needed | New users auto-create companies |
| A10 | Run migration | ⚠️ N/A | Clean schema deployment |
| A11 | `src/lib/rbac.ts` | ✅ Done | Full Permission enum (23 perms), hasPermission, requirePermission, companyScope, tenantFilter, blockOversightMutation, requireNotDemoCompany |
| A12 | `src/lib/session.ts` | ✅ Done | AuthContext with 12 fields, createSession, destroySession, getAuthContext, getAuthUser wrapper |
| A13 | `src/lib/audit.ts` | ✅ Done | auditLog, auditCreate, auditUpdate, auditCancel, auditDeleteAttempt, auditAuth, requestMetadata |
| A14 | `src/lib/demo-filter.ts` | ✅ Done | Uses tenantFilter from rbac |

### Phase B: API Routes — Company Scoping ✅ COMPLETE

**Statistics:**
- **83 total API route files** across `src/app/api/`
- **83/83 routes use `getAuthContext()`** (0% use old `getAuthUser()`)
- **55/83 routes use `tenantFilter()` or `companyScope()`** (66%)
- **47/83 routes use `requirePermission()`** (57%)
- **36/83 routes use `blockOversightMutation()`** (43%)
- **37/83 routes use `requireTokenPayAccess()`** (45% — all mutation routes)

| # | Task | Route Count | Status |
|---|---|---|---|
| B1 | Auth routes (login, register, me, logout, delete-account, forgot-password, reset-password, verify-email, send-verification, resend-verification, promote-superdev) | 11 | ✅ Done |
| B2 | Company API route (GET/POST/PUT/DELETE) | 1 | ✅ Done |
| B3 | Company switch | 1 | ✅ Done |
| B4 | Transaction routes (CRUD, export, export-peppol, recent-descriptions) | 4 | ✅ Done |
| B5 | Invoice routes (CRUD, PDF, OIOUBL, validate) | 5 | ✅ Done |
| B6 | Journal entry routes (CRUD) | 2 | ✅ Done |
| B7 | Account routes (CRUD, seed, trend) | 3 | ✅ Done |
| B8 | Contact routes (CRUD) | 2 | ✅ Done |
| B9 | Fiscal period routes (CRUD) | 2 | ✅ Done |
| B10 | Bank routes (statements, connections, consent, sync, reconciliation) | 6 | ✅ Done |
| B11 | Recurring entry routes (CRUD, execute) | 2 | ✅ Done |
| B12 | Budget routes (CRUD, budget-vs-actual) | 2 | ✅ Done |
| B13 | Report routes (reports, P&L, ledger, cash-flow, cash-flow-forecast, aging, financial-health, vat-register, year-end-closing, export-saft, export-tenant, import-tenant, export) | 13 | ✅ Done |
| B14 | Backup routes (CRUD, download, upload-restore, scheduler-status) | 5 | ✅ Done |
| B15 | Audit log route | 1 | ✅ Done |
| B16 | Document routes (CRUD, serve) | 3 | ✅ Done |
| B17 | Other routes (AI categorize, demo-mode, demo-seed, expense-categories, user/preferences, widget-settings, account-trend, receipt serve, messages, tokenpay callback, proof-upload, proof-activate, trial/start, access proxy) | 15 | ✅ Done |

### Phase C: Company Management API ✅ COMPLETE

| # | Task | Status | File |
|---|---|---|---|
| C1 | `POST /api/companies` — Create company | ✅ Done | `src/app/api/companies/route.ts` |
| C2 | `GET /api/companies` — List user's companies | ✅ Done | `src/app/api/companies/route.ts` |
| C3 | `GET /api/companies/[id]` — Company details | ⚠️ Via `/api/company` | Active company pattern |
| C4 | `PUT /api/companies/[id]` — Update company | ⚠️ Via `/api/company` | Active company pattern |
| C5 | `POST /api/company/switch` — Switch active company | ✅ Done | `src/app/api/company/switch/route.ts` |
| C6 | Transfer ownership | ✅ Done | `PUT /api/companies/[id]/members/[userId]` (role=OWNER) |
| C7 | `GET /api/companies/[id]/members` — List members | ✅ Done | `src/app/api/companies/[id]/members/route.ts` |
| C8 | `PUT /api/companies/[id]/members/[userId]` — Change role | ✅ Done | `src/app/api/companies/[id]/members/[userId]/route.ts` |
| C9 | `DELETE /api/companies/[id]/members/[userId]` — Remove | ✅ Done | `src/app/api/companies/[id]/members/[userId]/route.ts` |
| C10 | `POST /api/companies/[id]/invitations` — Send invite | ✅ Done | `src/app/api/companies/[id]/invitations/route.ts` |
| C11 | `GET /api/companies/[id]/invitations` — List | ✅ Done | `src/app/api/companies/[id]/invitations/route.ts` |
| C12 | `DELETE /api/companies/[id]/invitations/[inviteId]` — Revoke | ✅ Done | `src/app/api/companies/[id]/invitations/[inviteId]/route.ts` |
| C13 | `POST /api/invitations/accept` — Accept | ✅ Done | `src/app/api/invitations/accept/route.ts` |
| C14 | `GET /api/invitations/verify` — Verify token | ✅ Done | `src/app/api/invitations/verify/route.ts` |

### Phase D: Frontend Changes ✅ COMPLETE

| # | Task | Status | File |
|---|---|---|---|
| D1 | `auth-store.ts` — company context | ✅ Done | `src/lib/auth-store.ts` (User interface with 16 fields, switchCompany, startOversight, stopOversight) |
| D2 | `/api/auth/me` — return company context | ✅ Done | `src/app/api/auth/me/route.ts` |
| D3 | Company switching store | ✅ Done | Integrated into `auth-store.ts` (no separate file) |
| D4 | `CompanySelector` component | ✅ Done | `src/components/layout/company-selector.tsx` |
| D5 | `app-layout.tsx` integration | ✅ Done | `src/components/layout/app-layout.tsx` (company selector, oversight banner, demo banner, email verification) |
| D6 | `TeamManagement` component | ✅ Done | `src/components/settings/team-management.tsx` (members grid, invite dialog, pending invitations, role management) |
| D7 | Invite dialog | ✅ Done | Integrated into `TeamManagement` |
| D8 | Invitation acceptance | ✅ Done | Via `?invite=TOKEN` URL in `page.tsx` |
| D9 | Settings with Members tab | ✅ Done | `src/components/settings/settings-page.tsx` |
| D10 | CompanySettingsPage | ✅ Done | `src/components/settings/company-settings-page.tsx` |
| D11 | RegisterForm creates company | ✅ Done | `src/components/auth/register-form.tsx` |
| D12 | All pages pass user context | ✅ Done | All 21 view components |
| D13 | Role-based UI hiding | ✅ Done | `src/lib/use-permissions.ts` (used in TeamManagement, TransactionsPage, InvoicesPage, etc.) |
| D14 | SUPER_DEV oversight UI | ✅ Done | `src/components/settings/oversight-settings.tsx` (tenant browser, trial management) |
| D15 | Invitation acceptance in page.tsx | ✅ Done | `src/app/page.tsx` (`?invite=TOKEN` detection) |

### Phase E: Cleanup & Testing

| # | Task | Status | Notes |
|---|---|---|---|
| E1 | Migration script | ⚠️ Not needed | New users auto-create companies on registration |
| E2 | API route testing with roles | ⚠️ Manual | RBAC enforced in code |
| E3 | Company switching data isolation | ✅ Enforced | `companyScope()` + `tenantFilter()` |
| E4 | SUPER_DEV read-only | ✅ Enforced | `blockOversightMutation()` + read-only permissions |
| E5 | Invitation flow | ✅ Implemented | Full send → verify → accept flow |
| E6 | Ownership transfer | ✅ Implemented | Via members/[userId] PUT with role=OWNER |
| E7 | Data isolation | ✅ Enforced | All queries use `companyId` scoping |
| E8 | Indexes | ✅ Done | Comprehensive indexes on all companyId fields |
| E9 | Remove `userId` from models | ⚠️ Intentionally kept | Used for audit trail + backwards compat |
| E10 | Remove `CompanyInfo` model | ✅ Done | Fully deleted from schema |
| E11 | Replace `getAuthUser()` calls | ✅ Done | 0 routes use old API; wrapper exists but unused |
| E12 | Documentation | ✅ This document | |

---

## 6. Features Beyond Original Plan

### 6A. SUPER_DEV Oversight System
- **`oversightCompanyId`** on Session model allows SUPER_DEV to view any tenant's data
- **Oversight API**: `/api/oversight/tenants` (list), `/api/oversight/switch` (enter), `/api/oversight/clear` (exit), `/api/oversight/trial` (manage trials)
- **OversightSettings** component with tenant browser and trial management UI
- **Oversight banner** in app-layout showing which tenant is being overseen
- **`blockOversightMutation()`** blocks all writes during oversight across 36 API routes

### 6B. TokenPay Access Control System
- **Mini-service**: `mini-services/tokenpay-access-service/` (Bun project on port 3100)
- **Proof-based access**: `.tbkey` encrypted proof files grant `read_write` access
- **`requireTokenPayAccess(userId)`** enforced on 37 mutation API routes
- **Owner bypass**: AlphaAi owner (isSuperDev + AlphaAi company) always has access without proofs
- **`access-guard.ts`**: `isAlphaAiOwner()`, `checkOwnerAccess()`, `ensureOwnerAccess()`
- **Client API**: `tokenpayClient` routes through Next.js API proxies
- **60-day free trial** granted on registration via `grantTrial()`
- **Upgrade Access Modal** (`upgrade-access-modal.tsx`) shown when write access is denied
- **Subscription Plans Prompt** for purchasing access

### 6C. Demo Company System
- Shared demo company with CVR `29876543`
- `isDemoCompany` flag detected by cvrNumber match
- Read-only for all non-SUPER_DEV users
- `requireNotDemoCompany()` blocks mutations
- Demo mode toggle (`/api/demo-mode`)
- Demo seed endpoint (`/api/demo-seed`) for populating demo data
- Frontend banners distinguish between demo and normal companies

### 6D. Full Email Verification Flow
- `emailVerified`, `emailVerificationToken`, `emailVerifiedAt` fields on User
- `POST /api/auth/send-verification` and `/api/auth/resend-verification`
- `POST /api/auth/verify-email` with token-based verification
- `?verify=TOKEN` URL detection in `page.tsx`
- `EmailVerificationBanner` component for unverified users
- SUPER_DEV always treated as verified

### 6E. Additional API Routes (Not in Plan)
| Route | Description |
|---|---|
| `/api/auth/forgot-password` | Password reset flow |
| `/api/auth/reset-password` | Token-based password reset |
| `/api/auth/delete-account` | Full account + data deletion |
| `/api/auth/promote-superdev` | SUPER_DEV promotion (one-time) |
| `/api/bank-connections/[id]/consent` | Open Banking consent management |
| `/api/bank-connections/consent-callback` | Open Banking callback |
| `/api/bank-reconciliation` | AI-suggested bank matching |
| `/api/cash-flow-forecast` | Financial forecasting |
| `/api/financial-health` | Financial health metrics |
| `/api/account-trend` | Account balance trends |
| `/api/aging-reports` | Accounts receivable aging |
| `/api/budget-vs-actual` | Budget comparison |
| `/api/expense-categories` | Expense categorization |
| `/api/export-tenant` | Full tenant data export |
| `/api/import-tenant` | Tenant data import |
| `/api/documents/*` | Document management (attached to journal entries) |
| `/api/tokenpay/callback` | TokenPay webhook handler |
| `/api/proof-upload` | Proof file upload proxy |
| `/api/proof-activate` | Proof activation proxy |
| `/api/trial/start` | Trial start endpoint |
| `/api/access/[userId]` | Access check proxy |
| `/api/access/[userId]/status` | User status proxy |
| `/api/messages/[userId]` | TokenPay messages proxy |
| `/api/widget-settings` | Dashboard widget configuration |
| `/api/user/preferences` | User preferences |
| `/api/receipts/[...path]` | Receipt file serving |
| `/api/transactions/export-peppol` | Peppol e-invoice export |
| `/api/ai-categorize` | AI transaction categorization |
| `/api/demo-mode` | Demo mode toggle |
| `/api/legal/terms-of-service` | Terms of service page |

### 6F. PWA Support
- Service worker registration (`pwa-register.ts`)
- Offline notice component (`offline-notice.tsx`)
- Mobile install prompt (`mobile-install-prompt.tsx`)
- Post-install camera prompt for receipt scanning
- Web app manifest (`/manifest.json`)
- Apple touch icons and mobile web app meta tags

### 6G. Bilingual System (Danish/English)
- `src/lib/translations.ts` — 200+ translation keys with `{ da, en }` format
- `src/lib/language-store.ts` — Zustand store for language preference
- `src/lib/use-translation.ts` — `useTranslation()` hook
- Language toggle in sidebar (DA/EN button)
- All user-facing strings translated
- `date-fns` with `da` locale for Danish date formatting

### 6H. Mobile-First Design
- Responsive layout with desktop sidebar and mobile header
- `MobileBottomNav` — bottom navigation bar
- `MobileFab` — floating action button for quick actions
- `SwipeViewContainer` — swipe navigation between views
- Touch-friendly targets (44px minimum)
- `useSwipeNavigation` hook

### 6I. Additional UX Features
- **Command Palette** (`Ctrl+K`) — Quick navigation
- **Keyboard Shortcuts** — Alt+N (new purchase), Alt+I (invoices), Alt+R (reports), Alt+V (VAT), `?` (shortcuts modal)
- **Dark/Light Mode** — System preference detection + manual toggle
- **Notification Center** — In-app notification system
- **OCR Receipt Scanning** — Tesseract.js integration
- **OpenCV Document Detection** — Perspective warp for receipt photos
- **Email Templates** — Verification, password reset, invitation, owner notification
- **Rate Limiting** — Per-IP rate limiting on auth endpoints
- **Audit Trail** — Comprehensive immutable logging per Danish Bookkeeping Law §10-12

---

## 7. Known Deviations from Plan

| Plan Item | Deviation | Reason |
|---|---|---|
| Database: SQLite | **PostgreSQL** | Production-grade database required |
| `@@unique([cvrNumber, isDemo])` on Company | **`@@unique([name])`** | Company name uniqueness is more important |
| `@@unique([companyId, number, isDemo])` on Account | **`@@unique([companyId, number])`** | Demo/live separation via separate Company records |
| `@@unique([companyId, year, month, isDemo])` on FiscalPeriod | **`@@unique([companyId, year, month])`** | Same reasoning |
| `currentYear` default: 2025 | **2026** | Current year |
| Session model | Added `oversightCompanyId` | Beyond-plan oversight system |
| User model | Added `emailVerified`, `emailVerificationToken`, `emailVerifiedAt`, `resetPasswordToken`, `resetPasswordExpires`, `userPrefs`, `trialClaimedAt`, `sidebarPrefs` (Json instead of String) | Full auth flow + preferences |
| Company model | Added `dashboardWidgets` (Json) | Per-company widget customization |
| Company model | `address/phone/email` default to `""` (not required) | Simplified registration |
| Company model | Danish invoice terms as default | Product localization |
| Company model | No `sessions` relation in plan | Added for oversight sessions |
| No separate company-store | Company switching in `auth-store.ts` | Simpler architecture |
| No separate members-page.tsx | TeamManagement in `team-management.tsx` | Combined component |
| No separate invite-dialog.tsx | Invite in TeamManagement | Integrated UI |
| No separate accept-invitation.tsx | URL-based in page.tsx | Cleaner UX |

---

## 8. Remaining Work

### Priority: Low (Polish/Optional)

| # | Task | Description | Effort |
|---|---|---|---|
| R1 | Remove `userId` from company-scoped models | Optional cleanup. Currently kept for audit trail tracking. Would require updating all audit log references. | 4h |
| R2 | Transfer ownership dedicated endpoint | Currently via `PUT /api/companies/[id]/members/[userId]` with `role=OWNER`. Could add explicit `/transfer-ownership` endpoint for clarity. | 1h |
| R3 | `GET /api/companies/[id]` direct endpoint | Currently company details are fetched via `/api/company` (active company). Direct company-by-ID could be useful for admin contexts. | 1h |
| R4 | Comprehensive E2E tests | Automated tests for role-based access, company switching, invitation flow, oversight mode, data isolation. | 8h |
| R5 | `AccountRole` → `CompanyRole` rename in audit entity types | The `AuditLog` entity type still references `'CompanyInfo'` as a legacy string in audit.ts EntityType union type. | 0.5h |
| R6 | TokenPay webhook retry logic | Improve resilience for webhook failures beyond `ensureOwnerAccess()`. | 2h |
