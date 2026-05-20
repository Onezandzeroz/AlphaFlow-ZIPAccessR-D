<p align="center">
  <img src="public/logo-clean.png" alt="AlphaFlow" width="180" />
</p>

<h1 align="center">AlphaFlow</h1>

<p align="center">
  <strong>Intelligent Accounting for Danish Small Businesses</strong><br/>
  Multi-tenant, AI-assisted bookkeeping — fully compliant with the Danish Bookkeeping Act (Bogføringsloven)
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PostgreSQL-Prisma-336791?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Bun-Runtime-F9A825?logo=bun" alt="Bun" />
  <img src="https://img.shields.io/badge/PWA-Installable-5D3FD3" alt="PWA" />
  <img src="https://img.shields.io/badge/Multi_Tenant-✓-16a34a" alt="Multi-Tenant" />
  <img src="https://img.shields.io/badge/TokenPay_Access-✓-16a34a" alt="TokenPay Access" />
</p>

---

## Why AlphaFlow?

Managing bookkeeping for a Danish small business means navigating VAT codes, SAF-T exports, OIOUBL invoicing, and strict retention laws — all while just trying to run your company. AlphaFlow handles the complexity so you don't have to:

- **Full bookkeeping cycle** — from daily transaction entry to guided year-end closing
- **Danish compliance built-in** — FSR chart of accounts, 10 VAT codes, SAF-T & Peppol exports, 5-year backup retention
- **AI-assisted reconciliation** — 3-level matching engine (rule-based → fuzzy → LLM) for bank statements
- **Multi-company** — run multiple entities with role-based team access from a single login
- **Token-gated access** — proof-based access control with 60-day free trial, no credit card required
- **Works everywhere** — installable PWA, offline support, Danish/English UI, dark/light themes

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Onezandzeroz/AlphaFlow-ZIPR-D.git
cd AlphaFlow-ZIPR-D

# 2. Install (auto-generates Prisma Client via postinstall)
bun install

# 3. Set up your database
cp .env.example .env
# Edit .env — set your PostgreSQL DATABASE_URL (e.g. Neon, Supabase, or local Postgres)
bun run db:push

# 4. Install TokenPay mini-service
cd mini-services/tokenpay-access-service && bun install && cd ../..

# 5. Start developing
bun run dev
```

Open **http://localhost:3000** and create your first account.

> The dev server uses Webpack mode (`--webpack`) which is required for Prisma compatibility with Next.js 16. The startup script handles port checks automatically.
>
> The TokenPay Access mini-service starts separately: `cd mini-services/tokenpay-access-service && bun run dev` (port 3100). See [STARTUP.md](./STARTUP.md) for full instructions.

### First Steps After Login

1. **Set up your company** — Go to Settings → Company Profile. Add your CVR number, bank details, and invoice settings.
2. **Seed the chart of accounts** — Go to Chart of Accounts → "Create standard Danish chart" (38 FSR-standard accounts).
3. **Add contacts** — Register your customers and suppliers under Contacts.
4. **Start bookkeeping** — Create transactions, journal entries, or invoices.

Or load **demo data** from the dashboard to explore all features with realistic sample data for "Nordisk Erhverv ApS".

---

## Feature Overview

### Core Accounting

| | Feature | Details |
|---|---|---|
| 📒 | **Double-Entry Bookkeeping** | Full debit/credit posting with ±0.005 balance validation |
| 📊 | **Chart of Accounts** | 38 FSR-standard accounts + custom accounts across 5 types, 22 groups |
| 🧾 | **Invoicing** | Line items, auto VAT, sequential numbering (`PREFIX-YEAR-SEQ`), PDF download |
| 💰 | **VAT Reporting** | 10 Danish VAT codes — S25/S12/S0/SEU (output) + K25/K12/K0/KEU/KUF (input) |
| 👥 | **Contacts** | Customers & suppliers with CVR numbers, type classification, linked invoices |
| 📈 | **Financial Reports** | Income statement, balance sheet, general ledger, aging reports, cash flow |
| 🏦 | **Bank Reconciliation** | 3-level matching engine — rule-based → fuzzy (Levenshtein) → LLM-assisted |
| 📋 | **Journal Entries** | Draft/Posted/Cancelled workflow with debit/credit balance validation |
| 🔄 | **Recurring Entries** | Daily/weekly/monthly/quarterly/yearly templates with one-click execution |
| 🎯 | **Budgets** | Monthly budgets per account with actual-vs-budget variance tracking |
| 🔒 | **Fiscal Periods** | Open/closed periods — locking prevents posting to closed months |
| 📅 | **Year-End Closing** | Guided closing that resets P&L accounts and locks all periods automatically |
| 📸 | **Receipt Scanning** | Tesseract.js OCR + OpenCV document detection — auto-extracts amount, date, VAT |
| 💱 | **Multi-Currency** | DKK, EUR, USD, GBP, SEK, NOK with exchange rate tracking |

### Compliance & Exports

| | Feature | Details |
|---|---|---|
| 📤 | **SAF-T Export** | Danish Financial Schema v1.0 XML with pre/post validation |
| 📨 | **OIOUBL/Peppol** | BIS Billing 3.0 e-invoice XML with 11-category pre-validation |
| 🔐 | **Audit Trail** | Immutable log — 13+ action types, before/after values, IP & user-agent |
| 🛡️ | **Soft Delete** | Financial data is never physically deleted per Bogføringsloven |
| 💾 | **Backup System** | ZIP with SHA-256, per-tenant auto-scheduling, up to 60-month retention |
| 📦 | **Tenant Export/Import** | Upload & restore from ZIP — transactional with pre-restore safety backup |

### Multi-Tenant & Collaboration

| | Feature | Details |
|---|---|---|
| 🏢 | **Multi-Company** | Belong to multiple companies, switch instantly from sidebar |
| 🔑 | **RBAC** | 5 roles (Owner, Admin, Accountant, Viewer, Auditor) with 23 fine-grained permissions |
| ✉️ | **Team Invitations** | Email-based with 7-day expiring tokens and acceptance tracking |
| 👁️ | **Oversight Mode** | SuperDev read-only cross-tenant access with tenant browser and trial management |
| 🎭 | **Demo Company** | Shared read-only demo company (CVR 29876543) with pre-seeded sample data |

### Access Control (TokenPay)

| | Feature | Details |
|---|---|---|
| 🔐 | **Proof-Based Access** | `.tbkey` encrypted proof files grant `read_write` access to the system |
| 🆓 | **60-Day Free Trial** | Automatic trial granted on registration — no credit card needed |
| 📋 | **Subscription Plans** | Browse and purchase access plans via the Subscription Plans Prompt |
| 🛡️ | **Owner Bypass** | AlphaAi owner (SuperDev) always has full access without proofs |
| 🚫 | **Write Guard** | `requireTokenPayAccess()` enforced on all 37+ mutation API routes |
| 🔔 | **Upgrade Modal** | Shown automatically when write access is denied — guides to purchase |

### Open Banking

| | Feature | Details |
|---|---|---|
| 🏦 | **Bank Connections** | Demo Bank, Tink, Nordea, Danske Bank, Jyske Bank |
| 🔐 | **OAuth2 + SCA** | Full Strong Customer Authentication consent flow |
| 🔄 | **Auto Sync** | Scheduled transaction synchronization with detailed history |

### AI & Smart Features

| | Feature | Details |
|---|---|---|
| 🤖 | **AI Bank Reconciliation** | LLM-powered level-3 matching with confidence scoring |
| 🏷️ | **Smart Categorization** | 8 keyword groups mapping descriptions to chart accounts |
| ⚡ | **Auto-Post** | Matches above 95% confidence post automatically; 80–95% require approval |

### Dashboard & UX

| | Feature | Details |
|---|---|---|
| 📊 | **18 Dashboard Widgets** | KPIs, charts, forecasts — reorderable, toggleable, per-company defaults |
| ⌨️ | **Command Palette** | `Cmd+K` / `Ctrl+K` quick navigation and actions |
| 🎹 | **Keyboard Shortcuts** | `Alt+N` (new), `Alt+I` (invoices), `Alt+R` (reports), `Alt+V` (VAT) |
| 💚 | **Financial Health Score** | 0–100 composite score analyzing trends, ratios, compliance |
| 🌙 | **Dark/Light Theme** | System-aware with manual override |
| 🇩🇰 | **Danish/English UI** | ~500 translation keys, one-click switching |
| 📱 | **Responsive Design** | Desktop, tablet, and mobile with bottom nav, FAB, and swipe gestures |
| 📲 | **PWA** | Installable, offline caching via service worker |
| 📄 | **Terms of Service** | Built-in legal terms page |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser (PWA)                            │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐   │
│  │ Zustand   │  │  React   │  │  shadcn/ui (31 comps)         │   │
│  │  Stores   │  │  State   │  │  Recharts · Cmd Palette        │   │
│  │  (7)      │  │          │  │  Mobile Nav · PWA              │   │
│  └────┬──────┘  └────┬─────┘  └──────────────────────────────┘   │
│       │              │                                             │
├───────┼──────────────┼─────────────────────────────────────────────┤
│       │    REST API (89 route files)                               │
│  ┌────▼──────────────▼──────────────────────────────────────┐      │
│  │  Next.js 16 API Routes (App Router, Webpack mode)         │      │
│  │                                                           │      │
│  │  ┌────────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │      │
│  │  │  Session   │ │  RBAC   │ │  Audit   │ │ TokenPay   │  │      │
│  │  │  Auth      │ │ 5 roles │ │  Logger  │ │ Access     │  │      │
│  │  │ (7-day     │ │ 23 perm │ │(Immutable│ │ Guard      │  │      │
│  │  │  sliding)  │ │         │ │          │ │            │  │      │
│  │  └─────┬──────┘ └─────────┘ └──────────┘ └─────┬──────┘  │      │
│  └────────┼─────────────────────────────────────────┼────────┘      │
│           │                                         │               │
│  ┌────────▼──────────────────┐  ┌──────────────────▼──────────┐   │
│  │  Prisma ORM → PostgreSQL  │  │  TokenPay Mini-Service      │   │
│  │  23 models · 15 enums     │  │  Hono · Bun · SQLite        │   │
│  │  Multi-tenant isolation   │  │  Port 3100 · Proof storage  │   │
│  └───────────────────────────┘  └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Two-Service Architecture

The application runs **two independent services** with **two separate databases**:

| Service | Port | Stack | Database | Purpose |
|---|---|---|---|---|
| **AlphaFlow** (host app) | 3000 | Next.js 16 + Prisma | PostgreSQL (Neon cloud) | Main accounting/ERP application |
| **TokenPay Access** | 3100 | Hono + Bun | SQLite (local file) | Token-gated access control module |

> See [STARTUP.md](./STARTUP.md) for complete deployment instructions covering both services.

### Key Design Decisions

- **SPA architecture** — Single route (`/`) with 20+ views managed by React state + hash-based routing
- **Multi-tenant isolation** — Every query scoped to `companyId` via `tenantFilter()` in RBAC middleware
- **Session-based auth** — HTTP-only cookie, 7-day sliding expiry, stored in DB with `activeCompanyId`
- **5-layer mutation guard** — Every write API enforces: auth → RBAC permission → oversight block → demo block → TokenPay access
- **Webpack mode** — Next.js 16 runs with `--webpack` flag for Prisma compatibility (not Turbopack)
- **Immutable audit trail** — All mutations logged, never deletable per Bogføringsloven
- **Soft-delete only** — Financial data is never physically deleted
- **Caddy gateway** — Single external port with `XTransformPort` query routing to internal services

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Runtime** | [Bun](https://bun.sh/) | JavaScript runtime, package manager, script runner |
| **Framework** | [Next.js 16](https://nextjs.org/) | React SSR/SSG with App Router (Webpack mode) |
| **UI** | [React 19](https://react.dev/) + [shadcn/ui](https://ui.shadcn.com/) | 31 Radix-based components, New York style |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) | Static type checking |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first CSS with dark mode |
| **Database** | [PostgreSQL](https://www.postgresql.org/) via [Prisma 6](https://www.prisma.io/) | Relational database with type-safe ORM |
| **State** | [Zustand 5](https://zustand.docs.pmnd.rs/) | Client state (7 stores: auth, sidebar, language, scanner, widgets, plans, upgrade-modal) |
| **Forms** | [React Hook Form 7](https://react-hook-form.com/) + [Zod 4](https://zod.dev/) | Form handling & validation |
| **Charts** | [Recharts 2](https://recharts.org/) | Data visualization |
| **PDF** | [pdf-lib](https://pdf-lib.js.org/) | Server-side invoice PDF generation |
| **OCR** | [Tesseract.js 7](https://tesseract.projectnaptha.com/) | Client-side receipt text extraction |
| **Vision** | [OpenCV.js](https://docs.opencv.org/) | Client-side document detection & perspective warp |
| **XML** | [xmlbuilder2](https://github.com/oozcitak/xmlbuilder2) | SAF-T and OIOUBL generation |
| **AI** | [z-ai-web-dev-sdk](https://www.npmjs.com/package/z-ai-web-dev-sdk) | LLM-powered bank reconciliation (level 3) + AI categorization |
| **Email** | [Nodemailer 8](https://nodemailer.com/) | SMTP with jsonTransport dev fallback |
| **Backup** | [Archiver](https://www.npmjs.com/package/archiver) + [JSZip](https://stuk.github.io/jszip/) | ZIP creation and extraction |
| **Scheduling** | [node-cron 4](https://www.npmjs.com/package/node-cron) | Per-tenant automated backup scheduling |
| **Access Service** | [Hono](https://hono.dev/) + [Bun](https://bun.sh/) | TokenPay proof-based access control micro-service |
| **Process** | [PM2](https://pm2.keymetrics.io/) + [Caddy](https://caddyserver.com/) | Production process management & HTTPS |

---

## Database

### Host App — PostgreSQL

PostgreSQL with **23 models** and **15 enums**, fully multi-tenant:

```
Company (tenant boundary — 22 fields)
 ├── UserCompany (role-based junction)
 ├── Invitation (7-day expiring tokens)
 ├── Account (chart of accounts)
 ├── Transaction (sales, purchases, salaries, etc.)
 ├── JournalEntry → JournalEntryLine (double-entry)
 ├── Invoice (with line items, PDF, OIOUBL)
 ├── Contact (customers, suppliers)
 ├── FiscalPeriod (open/closed months)
 ├── BankStatement → BankStatementLine (reconciliation)
 ├── BankConnection → BankConnectionSync (open banking)
 ├── RecurringEntry (automated templates)
 ├── Budget → BudgetEntry (monthly planning)
 ├── Document (journal entry attachments)
 ├── Backup (ZIP archives with SHA-256)
 ├── AuditLog (immutable, 13+ action types)
 └── EmailLog (delivery tracking)

User (global identity)
 ├── Session (with activeCompanyId + oversightCompanyId)
 └── Companies[] (via UserCompany junction)
```

### TokenPay Access — SQLite (mini-service)

Separate local SQLite database managed by `bun:sqlite` — self-initializing on first startup:

```
users          — User access records
proofs         — Uploaded .tbkey proof files with verification status
access_log     — Access change history
messages       — TokenPay webhook messages
```

> No Prisma, no migration tool. The `data-layer.ts` module runs `CREATE TABLE IF NOT EXISTS` on every startup.

### RBAC Permission Matrix

| Role | Level | Permissions |
|---|---|---|
| **Owner** | 5 | Full control + ownership transfer + member management + backups |
| **Admin** | 4 | Full control except ownership transfer |
| **Accountant** | 3 | Create/edit all accounting data, bank sync, period close |
| **Viewer** | 2 | Read-only access to all accounting data |
| **Auditor** | 1 | Read-only + report exports and audit runs |
| **SuperDev** | — | Read-only cross-tenant access (oversight mode); full Owner in own company |

**23 fine-grained permissions** across 7 categories:
- Company settings (4): view, edit, transfer ownership, delete
- Member management (4): view, invite, remove, change role
- Accounting data (5): read, create, edit, cancel, delete
- Reports (3): view, export, SAF-T export
- Period management (3): close, reopen, year-end close
- Banking (2): connect, sync
- Backup (2): create, restore

---

## API

**89 route files** organized into logical groups. All mutating endpoints enforce the 5-layer guard chain: authentication → RBAC → oversight block → demo block → TokenPay access.

| Group | Count | Key Endpoints |
|---|---|---|
| **Auth** | 11 | `login`, `register`, `me`, `logout`, `delete-account`, `promote-superdev`, `send-verification`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password` |
| **Companies** | 5 | `companies` (CRUD), `companies/[id]/invitations`, `companies/[id]/members` |
| **Company** | 2 | `company` (active company GET/PUT), `company/switch` |
| **Accounting** | 7 | `accounts` (CRUD + seed + trend), `transactions` (CRUD + export + Peppol + recent-descriptions), `journal-entries` (CRUD), `invoices` (CRUD + PDF + OIOUBL + validate), `contacts` (CRUD) |
| **Reports & Analysis** | 15 | `reports`, `ledger`, `vat-register`, `cash-flow`, `cash-flow-forecast`, `profit-loss`, `aging-reports`, `financial-health`, `budget-vs-actual`, `account-trend`, `expense-categories`, `year-end-closing`, `export-saft`, `export-tenant`, `import-tenant` |
| **Banking** | 6 | `bank-reconciliation`, `bank-connections` (CRUD + consent + sync + callback) |
| **Compliance** | 7 | `fiscal-periods` (CRUD), `audit-logs`, `backups` (CRUD + download + upload-restore + scheduler-status), `documents` (CRUD + serve) |
| **Planning** | 3 | `budgets`, `budget-vs-actual`, `recurring-entries` (CRUD + execute) |
| **Oversight** | 4 | `oversight/tenants`, `oversight/switch`, `oversight/clear`, `oversight/trial` |
| **Invitations** | 2 | `invitations/accept`, `invitations/verify` |
| **TokenPay Access** | 6 | `tokenpay/callback`, `proof-upload`, `proof-activate`, `access/[userId]`, `access/[userId]/status`, `trial/start` |
| **Smart** | 1 | `ai-categorize` |
| **System** | 6 | `demo-mode`, `demo-seed`, `widget-settings`, `user/preferences`, `messages/[userId]`, `receipts/[...path]` |

Rate limiting: 5/min for login/register, 1/min for verification emails, 1/5min for password resets.

---

## Danish Bookkeeping Law Compliance

AlphaFlow is built with full **Bogføringslov** compliance:

| Requirement | Implementation |
|---|---|
| **Audit Trail** (§10–12) | Immutable log with timestamp, user, IP, user-agent, and field-level changes |
| **Soft Delete** (§4–8) | Financial entries are cancelled, never physically deleted |
| **Fiscal Periods** | Periods can be locked to prevent posting to closed months |
| **Backup Retention** (§15) | Auto-scheduled ZIP backups with SHA-256, up to 60-month retention |
| **Official Formats** | SAF-T (Danish Financial Schema v1.0) + OIOUBL/Peppol (BIS Billing 3.0) |

---

## Email System

Powered by [Nodemailer](https://nodemailer.com/) with bilingual (Danish/English) HTML templates:

| Flow | Trigger | Token Lifetime |
|---|---|---|
| Email Verification | Registration / re-send | Until used |
| Password Reset | "Forgot password" | 1 hour |
| Team Invitation | Owner/Admin invites | 7 days |
| Owner Notification | System events | — |

**Dev mode** (default): When no SMTP is configured, emails are rendered and logged to console via `jsonTransport` — no emails are actually sent. Perfect for local development.

**Production**: Configure SMTP credentials in `.env` to send real emails.

---

## Backup System

Fully automated per-tenant backup system designed for **Bogføringsloven §15** compliance:

| Feature | Details |
|---|---|
| **Auto-Scheduled Backups** | 4 cron schedules — hourly, daily, weekly, monthly — per tenant |
| **Manual Backups** | On-demand backup creation from the UI at any time |
| **ZIP Snapshots** | Structured JSON files inside a ZIP archive (12 entity types exported) |
| **SHA-256 Checksums** | Every backup is checksummed; verified on restore to detect corruption |
| **Retention Policy** | 24 hourly / 30 daily / 52 weekly / 60 monthly / 999 manual — auto-cleaned daily |
| **Transactional Restore** | Delete + import runs inside a DB transaction — rolls back on failure, no data loss |
| **Pre-Restore Safety** | Automatic safety backup created before any restore operation |
| **Upload & Restore** | Import a backup ZIP from another AlphaFlow instance |
| **First-Data Trigger** | Initial backups created automatically when a tenant first inputs data |
| **Health Monitoring** | Per-tenant scheduler status: idle → pending → healthy/unhealthy |
| **Tenant Isolation** | Each backup contains only one tenant's data; restores never affect other tenants |

**Backup contents** — company settings, chart of accounts, contacts, transactions, invoices, journal entries (with lines & documents), fiscal periods, budgets, recurring entries, bank statements (with lines), bank connections (with syncs), and team members.

**Storage** — organized on disk as `Tenant-Backup/{CompanyName}/{Hourly|Daily|Weekly|Monthly|Manual}/snapshot-*.zip`.

---

## Environment Variables

```env
# ─── Database (REQUIRED) ─────────────────────────────────────────
# PostgreSQL connection string
# Neon:       postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
# Supabase:   postgresql://user:pass@db.xxx.supabase.co:5432/postgres
# Local:      postgresql://user:pass@localhost:5432/alphaflow
DATABASE_URL=

# ─── Email / SMTP (optional — dev mode when not set) ─────────────
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@alphaflow.dk
APP_URL=https://yourdomain.com

# ─── TokenPay Access (optional — dev defaults when not set) ──────
TOKENPAY_API_KEY=tokenpay-dev-key-2026
NEXT_PUBLIC_TOKENPAY_PORT=3100
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `SMTP_HOST` | No | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port (587 = TLS, 465 = SSL) |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password or app-specific token |
| `EMAIL_FROM` | No | `noreply@alphaflow.dk` | Sender email address |
| `APP_URL` | No | `http://localhost:3000` | Public base URL for email links |
| `TOKENPAY_API_KEY` | No | `tokenpay-dev-key-2026` | Shared API key for TokenPay proxy routes (must match `API_SHARED_KEY`) |
| `NEXT_PUBLIC_TOKENPAY_PORT` | No | `3100` | Port the TokenPay Access service listens on |

### Common SMTP Providers

| Provider | Host | Port | Notes |
|---|---|---|---|
| **Gmail** | `smtp.gmail.com` | 587 | Requires App Password (not account password) |
| **Mailgun** | `smtp.mailgun.org` | 587 | Free tier: 1,000 emails/month |
| **SendGrid** | `smtp.sendgrid.net` | 587 | API key as password |
| **Mailtrap** | `smtp.mailtrap.io` | 587 | Testing only — captures emails in sandbox |
| **Amazon SES** | `email-smtp.eu-north-1.amazonaws.com` | 587 | SES SMTP credentials required |
| **Microsoft 365** | `smtp.office365.com` | 587 | Requires app password or OAuth2 |
| **Migadu** | `smtp.migadu.com` | 465 | Use your Migadu mailbox credentials |

---

## Project Structure

```
AlphaFlow-ZIPR-D/
├── prisma/
│   └── schema.prisma              # 23 models, 15 enums (PostgreSQL)
├── public/
│   ├── logo*.png                  # Brand logos (multiple variants)
│   ├── icon-*.png                 # PWA icons (192, 512, maskable)
│   ├── manifest.json              # PWA manifest
│   ├── sw.js                      # Service worker (3-layer caching)
│   ├── robots.txt                 # SEO robots
│   ├── favicon.png                # Browser favicon
│   ├── tbkey.png                  # TokenPay proof icon
│   └── VidClips/Onboarding/      # Onboarding images & video
├── scripts/
│   ├── dev-server.ts              # Smart dev starter (port check + Webpack)
│   ├── kill-port.ts               # Cross-platform port killer
│   └── fix-isdemo-default.ts      # Demo company flag fix
├── docs/
│   ├── MULTI_TENANT_PLAN.md       # Detailed multi-tenant implementation status
│   └── TOKENBAY-ACCESS-ENV-GUIDE.md  # TokenPay environment setup guide
├── mini-services/
│   └── tokenpay-access-service/   # TokenPay proof-based access control
│       ├── index.ts               # Hono server entry point (port 3100)
│       ├── src/
│       │   ├── data-layer.ts      # SQLite schema + CRUD (self-initializing)
│       │   ├── access-engine.ts   # Permission logic
│       │   ├── proof-verifier.ts  # .tbkey proof validation
│       │   ├── encryption.ts      # AES-256 proof decryption
│       │   ├── tbkey-decryption.ts # TokenBay key handling
│       │   ├── notification.ts    # Webhook callbacks
│       │   ├── cron.ts            # Automated proof re-audit (5 min)
│       │   └── types.ts           # TypeScript types
│       ├── PROOF_FILE_SPECIFICATION.md
│       └── package.json
├── src/
│   ├── app/
│   │   ├── page.tsx               # Root SPA page (auth gate + 20+ view router)
│   │   ├── layout.tsx             # Root layout (fonts, PWA, theme, toaster)
│   │   ├── error.tsx              # Error boundary page
│   │   ├── globals.css            # Theme variables, dark mode, animations
│   │   ├── instrumentation.ts     # Client instrumentation
│   │   ├── instrumentation.node.ts # Server startup (backup scheduler)
│   │   └── api/                   # 89 API route handlers
│   │       ├── auth/              # 11 routes: login, register, me, logout, etc.
│   │       ├── accounts/          # 3 routes: CRUD + seed + trend
│   │       ├── transactions/      # 4 routes: CRUD + export + Peppol + recent
│   │       ├── journal-entries/   # 2 routes: CRUD
│   │       ├── invoices/          # 5 routes: CRUD + PDF + OIOUBL + validate
│   │       ├── contacts/          # 2 routes: CRUD
│   │       ├── companies/         # 5 routes: CRUD + invitations + members
│   │       ├── company/           # 2 routes: active company + switch
│   │       ├── reports/           # Income statement, balance sheet
│   │       ├── bank-reconciliation/ # AI-assisted matching
│   │       ├── bank-connections/  # 5 routes: Open Banking (5 providers)
│   │       ├── export-saft/       # SAF-T XML generation
│   │       ├── fiscal-periods/    # 2 routes: Period management + locking
│   │       ├── budgets/           # Budget with variance tracking
│   │       ├── recurring-entries/ # 2 routes: Template management + execution
│   │       ├── year-end-closing/  # Guided year-end process
│   │       ├── backups/           # 5 routes: ZIP backup/restore/scheduler
│   │       ├── audit-logs/        # Immutable audit trail
│   │       ├── documents/         # 3 routes: Journal entry attachments
│   │       ├── oversight/         # 4 routes: SuperDev tenant management
│   │       ├── invitations/       # 2 routes: accept + verify tokens
│   │       ├── tokenpay/          # Webhook callback
│   │       ├── access/            # 2 routes: user access status proxy
│   │       ├── proof-upload/      # Proof file upload proxy
│   │       ├── proof-activate/    # Proof activation proxy
│   │       ├── trial/             # Trial start endpoint
│   │       └── ...                # cash-flow, ledger, vat-register, etc.
│   ├── components/
│   │   ├── ui/                    # 31 shadcn/ui components
│   │   ├── layout/                # AppLayout, CompanySelector
│   │   ├── dashboard/             # Dashboard, 18 widget components, subscription plans
│   │   ├── transactions/          # Transactions, Posteringer, AddTransaction form
│   │   ├── invoices/              # Invoice management page
│   │   ├── journal/               # Journal entries page
│   │   ├── contacts/              # Customer/supplier management
│   │   ├── chart-of-accounts/     # Chart of accounts page
│   │   ├── reports/               # Financial reports page
│   │   ├── settings/              # Settings with tabs: Company, Team, Access, Oversight
│   │   ├── bank-reconciliation/   # Bank reconciliation + Open Banking section
│   │   ├── budget/                # Budget management page
│   │   ├── recurring-entries/     # Recurring entry templates
│   │   ├── fiscal-periods/        # Period management page
│   │   ├── cash-flow/             # Cash flow report
│   │   ├── cash-flow-forecast/    # Cash flow forecast widget
│   │   ├── budget-vs-actual/      # Budget comparison widget
│   │   ├── aging-reports/         # Accounts receivable aging
│   │   ├── financial-health/      # Financial health score widget
│   │   ├── profit-loss-waterfall/ # P&L waterfall chart
│   │   ├── expense-analysis/      # Expense analysis widget
│   │   ├── vat-report/            # VAT settlement report
│   │   ├── year-end-closing/      # Year-end closing page
│   │   ├── backup/                # Backup management page
│   │   ├── audit-log/             # Audit log viewer
│   │   ├── exports/               # Export center (CSV, SAF-T, OIOUBL)
│   │   ├── scanner/               # Receipt scanner with OCR engine
│   │   ├── auth/                  # Login, Register, Forgot/Reset password, Email verification
│   │   ├── legal/                 # Terms of Service
│   │   ├── ledger/                # General ledger page
│   │   ├── pwa/                   # PWA registration, offline notice, install prompt
│   │   └── shared/                # PageHeader, StatsCard, DateRangeFilter, MobileFilterDropdown
│   ├── hooks/
│   │   ├── use-mobile.ts          # Mobile breakpoint detection
│   │   ├── use-write-access-guard.ts  # TokenPay write access check
│   │   └── use-access-error-handler.tsx # Access denied error UI
│   ├── lib/
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── session.ts             # Session management + getAuthContext()
│   │   ├── rbac.ts                # Role-based access control (23 permissions)
│   │   ├── audit.ts               # Immutable audit logger
│   │   ├── access-guard.ts        # TokenPay access verification
│   │   ├── tokenpay.ts            # TokenPay client SDK
│   │   ├── email-service.ts       # Nodemailer with dev/production modes
│   │   ├── email-templates.ts     # Bilingual HTML email templates
│   │   ├── saft-validator.ts      # SAF-T pre/post validation
│   │   ├── oioubl-validator.ts    # OIOUBL pre-validation (11 categories)
│   │   ├── oioubl-generator.ts    # OIOUBL/Peppol XML generation
│   │   ├── pdf-generator.ts       # A4 invoice PDF generation (pdf-lib)
│   │   ├── matching-engine.ts     # 3-level bank reconciliation engine
│   │   ├── backup-engine.ts       # ZIP backup creation & restore
│   │   ├── backup-scheduler.ts    # Per-tenant cron scheduling
│   │   ├── translations.ts        # ~500 Danish/English translation keys
│   │   ├── language-store.ts      # DA/EN language toggle store
│   │   ├── use-translation.ts     # useTranslation() hook
│   │   ├── auth-store.ts          # Auth, session, company switching store
│   │   ├── sidebar-store.ts       # Sidebar collapsed state store
│   │   ├── scanner-store.ts       # Receipt scanner state store
│   │   ├── dashboard-widgets.ts   # Widget visibility/ordering store
│   │   ├── dashboard-widget-definitions.ts # 18 widget definitions (shared client/server)
│   │   ├── subscription-plans-store.ts # Subscription plans state
│   │   ├── upgrade-modal-store.ts # Upgrade access modal state
│   │   ├── use-permissions.ts    # Frontend RBAC permission hook
│   │   ├── rate-limit.ts          # Per-IP rate limiting
│   │   ├── logger.ts              # Structured logging utility
│   │   ├── api-error-handler.ts   # Standardized API error responses
│   │   ├── notify-owner.ts        # Owner notification helper
│   │   ├── currency-utils.ts      # Currency formatting & conversion
│   │   ├── vat-utils.ts           # VAT calculation utilities
│   │   ├── demo-filter.ts         # Demo data filtering
│   │   ├── bank-providers.ts      # Bank provider definitions
│   │   ├── file-service.ts        # File upload/management service
│   │   ├── password.ts            # bcrypt password utilities
│   │   ├── seed-chart-of-accounts.ts # FSR standard chart seeder
│   │   ├── seed-demo-company.ts   # Demo company data seeder
│   │   ├── ocr-utils.ts           # OCR text extraction utilities
│   │   ├── use-hydrated.ts        # Hydration-safe hook
│   │   ├── use-swipe-navigation.ts # Swipe gesture hook
│   │   ├── port-utils.ts          # Port scanning utility
│   │   └── opencv/                # OpenCV document detection
│   │       ├── loadOpenCV.ts      # Lazy OpenCV loader
│   │       ├── documentDetect.ts  # Document edge detection
│   │       └── perspectiveWarp.ts # Perspective correction transform
│   └── fonts/                     # Geist Sans/Mono font files (woff2)
├── .env.example                   # Environment variable template
├── next.config.ts                 # Security headers, caching, PWA config
├── Caddyfile                      # Reverse proxy with HTTPS + XTransformPort routing
├── ecosystem.config.js            # PM2 production config (2 services)
├── components.json                # shadcn/ui configuration
├── tsconfig.json                  # TypeScript configuration
├── eslint.config.mjs              # ESLint configuration
└── package.json                   # Scripts and dependencies
```

---

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server (port check + Webpack mode) |
| `bun run dev:direct` | Start Next.js dev directly (no port check) |
| `bun run build` | Production build |
| `bun run start` | Start production server on port 3000 |
| `bun run start:pm2` | Start with PM2 process manager |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Push schema changes to PostgreSQL |
| `bun run db:generate` | Generate Prisma Client |
| `bun run db:migrate` | Run Prisma migrations |
| `bun run db:reset` | Reset database (⚠️ deletes all data) |
| `bun run kill-port` | Kill process on port 3000 |
| `bun run ports` | Scan and display port usage |

---

## Deployment

### Production Stack

- **Runtime**: Bun
- **Process Manager**: PM2 (2 instances: alphaflow + tokenpay-access, auto-restart)
- **Reverse Proxy**: Caddy (automatic HTTPS via Let's Encrypt + XTransformPort routing)
- **Database**: PostgreSQL (Neon, Supabase, or self-hosted) + SQLite (TokenPay local)

### Deploy to Ubuntu VPS

```bash
# 1. Set up server
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw
curl -fsSL https://bun.sh/install | bash

# 2. Clone and install
git clone https://github.com/Onezandzeroz/AlphaFlow-ZIPR-D.git
cd AlphaFlow-ZIPR-D
bun install

# 3. Install TokenPay mini-service
cd mini-services/tokenpay-access-service && bun install && cd ../..

# 4. Clean stale SQLite files (critical!)
rm -f mini-services/tokenpay-access-service/data/access.db*

# 5. Configure environment
cp .env.example .env
nano .env  # Set DATABASE_URL, SMTP_*, APP_URL, TOKENPAY_API_KEY

# 6. Initialize database
bun run db:push

# 7. Build and start
bun run build
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# 8. Set up Caddy reverse proxy
sudo apt install -y caddy
# Edit /etc/caddy/Caddyfile with your domain → localhost:3000 + XTransformPort:3100
sudo systemctl restart caddy && sudo systemctl enable caddy

# 9. Firewall
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

> **Full deployment guide** — See [STARTUP.md](./STARTUP.md) for detailed instructions covering both services, SMTP setup, troubleshooting, and update procedures.

### Update an Existing Deployment

```bash
cd AlphaFlow-ZIPR-D
git pull
bun install
cd mini-services/tokenpay-access-service && bun install && cd ../..
bun run db:push
bun run build
pm2 restart all
```

---

## Security

- **Session-based auth** — HTTP-only cookies, 7-day sliding expiry, bcrypt (12 rounds)
- **5-layer mutation guard** — Auth → RBAC → Oversight block → Demo block → TokenPay access
- **Rate limiting** — Login/register: 5/min, verification: 1/min, password reset: 1/5min
- **Security headers** — X-Frame-Options, X-Content-Type-Options, HSTS (via Caddy), CSP-ready
- **Tenant isolation** — All data scoped to `companyId` via RBAC `tenantFilter()` middleware
- **Oversight protection** — `blockOversightMutation()` blocks all writes during cross-tenant access
- **Demo company protection** — `requireNotDemoCompany()` blocks mutations on shared demo company
- **Proof-based access** — `requireTokenPayAccess()` enforced on all 37+ mutation API routes
- **Path traversal protection** — Document serving validates file paths
- **Anti-enumeration** — Password reset always returns success regardless of email existence
- **Shared API key** — TokenPay proxy routes use `TOKENPAY_API_KEY` for inter-service authentication

---

## Built With

| Category | Technologies |
|---|---|
| **Framework** | Next.js 16, React 19, TypeScript 5 |
| **Database** | PostgreSQL (Prisma 6), SQLite (bun:sqlite) |
| **Styling** | Tailwind CSS 4, shadcn/ui, next-themes |
| **State** | Zustand 5 (7 stores), React Hook Form 7, Zod 4 |
| **AI/ML** | z-ai-web-dev-sdk (LLM), Tesseract.js (OCR), OpenCV.js (document detection) |
| **Documents** | pdf-lib (PDF), xmlbuilder2 (SAF-T/OIOUBL) |
| **Access Control** | Hono (micro-service), AES-256 encryption, proof verification |
| **Infrastructure** | Bun, PM2, Caddy, PWA Service Worker |
| **Communication** | Nodemailer 8 (SMTP) |

---

## Documentation

| Document | Description |
|---|---|
| [README.md](./README.md) | This file — feature overview and quick start |
| [STARTUP.md](./STARTUP.md) | Complete deployment guide (local dev + production VPS) |
| [MULTI_TENANT_PLAN.md](./docs/MULTI_TENANT_PLAN.md) | Detailed multi-tenant RBAC implementation status |
| [TOKENBAY-ACCESS-ENV-GUIDE.md](./docs/TOKENBAY-ACCESS-ENV-GUIDE.md) | TokenPay environment variable reference |
| [COMPLIANCE_REPORT.md](./docs/COMPLIANCE_REPORT.md) | Internal compliance report for Erhvervsstyrelsen (Danish) |
| [ENCRYPTION.md](./docs/ENCRYPTION.md) | Technical encryption & data security documentation (Danish) |
| [BRUGSVEJLEDNING.md](./docs/BRUGSVEJLEDNING.md) | User guide / Brugsvejledning (Danish) |

---

## License

Private — All rights reserved.
