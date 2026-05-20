# Deployment Guide — AlphaFlow + TokenBay Access

Complete setup instructions for local development and production deployment on Ubuntu cloud VPS.

The app runs **two services** with **two separate databases**:

| Service | Port | Stack | Database | Purpose |
|---|---|---|---|---|
| **AlphaFlow** (host app) | 3000 | Next.js 16 + Prisma | **Neon PostgreSQL** (cloud) | Main accounting/ERP application |
| **TokenBay Access** | 3100 | Hono + Bun | **SQLite** (local file) | Token-gated access control module |

> **Important — Two completely different database systems:**
> - The **host app** connects to a **remote Neon PostgreSQL** database via `DATABASE_URL` in `.env`. It uses **Prisma ORM** (`prisma/schema.prisma`) and you run `bun run db:push` to sync the schema.
> - The **TokenBay Access mini-service** uses its own **local SQLite** file (`data/access.db`) managed by `bun:sqlite` directly — **no Prisma, no `db:push`**. Tables are created automatically on first startup. There is nothing to configure beyond ensuring the `data/` directory exists.

Both services are managed together via PM2 and routed through a single Caddy reverse proxy.

---

## Prerequisites

Install [Bun](https://bun.sh/docs/installation) v1.3+:

**macOS / Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

Verify installation:
```bash
bun --version
```

---

## 1. Local Development

### 1.1. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url>
cd AlphaFlow

# Install host app dependencies (generates Prisma Client automatically via postinstall)
bun install
```

### 1.2. Host App — Neon PostgreSQL Database

The host app requires a **Neon PostgreSQL** connection. You must set `DATABASE_URL` in your `.env` file.

```bash
# Create your .env from the template
cp .env.example .env
```

Edit `.env` and set your Neon connection string:

```env
# Database — REQUIRED — Get this from your Neon dashboard
# For Neon pooled connections (recommended):
#   postgresql://neondb_owner:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

> **Where to find this:** Log into your [Neon Console](https://console.neon.tech), select your project, click **Connection Details**, and copy the connection string. Use the **pooled** connection string (with `-pooler` in the hostname) for best performance.

Then push the Prisma schema to your Neon database:

```bash
# Sync the Prisma schema to Neon (creates/updates all tables)
bun run db:push
```

### 1.3. TokenBay Access — Local SQLite Database

The mini-service uses its **own separate local SQLite database** — completely independent from the host app's PostgreSQL.

```bash
# Install mini-service dependencies
cd mini-services/tokenpay-access-service
bun install

# CRITICAL: Remove any stale SQLite files left from a previous clone
# These WAL/SHM files can lock the database and cause startup crashes
rm -f data/access.db data/access.db-shm data/access.db-wal
cd ../..
```

> **How the mini-service database works (you don't need to run any migration):**
> 1. On first startup, the `initDataLayer()` function in `src/data-layer.ts` creates the `data/` directory automatically (`mkdirSync` with `recursive: true`).
> 2. It then creates (or opens) `data/access.db` using `new Database(dbPath, { create: true })`.
> 3. It runs `CREATE TABLE IF NOT EXISTS` statements to create all tables (`users`, `proofs`, `access_log`, `messages`) and their indexes.
> 4. WAL mode is enabled for concurrent read-write safety.
> 5. **There is no Prisma, no migration tool, and no `db:push` for this service.** The schema is defined entirely in `src/data-layer.ts` and is self-initializing.
>
> The `DATABASE_PATH` defaults to `./data/access.db` (relative to `mini-services/tokenpay-access-service/`). You can override it via the `DATABASE_PATH` environment variable, but the default works for both dev and production.

### 1.4. Start Development Servers

```bash
# Start the Next.js development server (port 3000)
bun run dev &

# Start the TokenBay Access service (port 3100) in a separate terminal
cd mini-services/tokenpay-access-service
bun run dev
```

Open **http://localhost:3000** in your browser.

The dev servers automatically:
- AlphaFlow: Hot-reloads on file changes, uses Webpack mode (required for Prisma compatibility with Next.js 16)
- TokenBay Access: Hot-reloads on file changes via `bun --hot`, runs an automated cron every 5 minutes to re-audit proofs

> **Note:** In development, both services use default credentials (`tokenpay-dev-key-2026`) and no additional configuration is needed beyond `bun install` in each directory.

### Stopping the dev servers

Press `Ctrl + C` in each terminal, or kill all background processes:
```bash
pkill -f "next dev"
pkill -f "bun.*tokenpay"
```

### If port 3000 or 3100 is stuck

```bash
# Port 3000 (Next.js)
lsof -ti :3000 | xargs kill -9

# Port 3100 (TokenBay Access)
lsof -ti :3100 | xargs kill -9
```

### Email in Development

Without SMTP configuration, the email system runs in **dev mode**: emails are rendered and logged to the console but not sent. This is the default — no additional setup is required.

To test real emails during development, configure SMTP in `.env` (see [Environment Variables](#6-environment-variables-reference)).

---

## 2. Production Deployment (Ubuntu Cloud VPS)

### 2.1. Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y git curl ufw

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Verify
bun --version
```

### 2.2. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd AlphaFlow

# Install host app dependencies
bun install
```

### 2.3. Configure Host App — Neon PostgreSQL

Create a `.env` file in the project root:

```bash
cp .env.example .env
nano .env
```

Edit the following values:

```env
# Database — REQUIRED — Get this from your Neon dashboard
# Use the pooled connection string for production
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-xxxxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Email / SMTP (REQUIRED for production email features)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
APP_URL=https://yourdomain.com

# TokenBay Access — shared API key (must match API_SHARED_KEY in PM2 config)
TOKENPAY_API_KEY=<generate-with-openssl-rand-hex-32>
NEXT_PUBLIC_TOKENPAY_PORT=3100
```

> **Important:** `APP_URL` must match your public URL. This is used for email verification links, password reset links, and team invitation links. If this is wrong, those links will point to the wrong address.

Push the schema to your Neon database:

```bash
bun run db:push
```

See [SMTP Provider Examples](#31-smtp-provider-examples) below for provider-specific settings.

### 2.4. Configure TokenBay Access Mini-Service

#### Step 1 — Install dependencies

```bash
cd mini-services/tokenpay-access-service
bun install
cd ../..
```

#### Step 2 — Clean any stale SQLite files from the repo

The repository may contain leftover SQLite database files (`data/access.db`, `data/access.db-shm`, `data/access.db-wal`) from a previous environment. These files contain **WAL (Write-Ahead Logging) lock state** that is specific to the machine that created them. On a new server, they can cause the database to be **locked or corrupted**, which will make the mini-service crash on PM2 startup.

```bash
# Remove ALL existing SQLite files in the mini-service data directory
rm -rf mini-services/tokenpay-access-service/data/access.db
rm -rf mini-services/tokenpay-access-service/data/access.db-shm
rm -rf mini-services/tokenpay-access-service/data/access.db-wal
```

> **Why this is necessary:** The `data/access.db` file is in `.gitignore`, but the `-shm` and `-wal` companion files may have been committed accidentally in a previous push. These files hold SQLite's write-ahead log and shared-memory index. They are machine-specific and **must be deleted** on a fresh deployment. The mini-service will recreate a fresh, clean database on first startup — this is by design.

#### Step 3 — Set environment variables in PM2 config

The mini-service reads its configuration from the PM2 ecosystem file (`ecosystem.config.js`). Open it and update the `env` block under the `tokenpay-access` app:

```bash
nano ecosystem.config.js
```

Update the `env` block:

```js
// ecosystem.config.js — tokenpay-access app env
env: {
  NODE_ENV: 'production',
  PORT: '3100',
  // MUST match TOKENPAY_API_KEY in the host .env
  API_SHARED_KEY: '<same-value-as-TOKENPAY_API_KEY-above>',
  // Webhook callback URL — the host app's endpoint for access change events
  HOST_CALLBACK_URL: 'https://yourdomain.com/api/tokenpay/callback',
  // SQLite database path (relative to mini-services/tokenpay-access-service/)
  // The data/ directory and access.db file are CREATED AUTOMATICALLY on first startup.
  // Do NOT pre-create these files. Do NOT copy them from another machine.
  DATABASE_PATH: './data/access.db',
}
```

> **Critical:** `API_SHARED_KEY` (mini-service) and `TOKENPAY_API_KEY` (host app) must be **identical**. Generate a strong key:
> ```bash
> openssl rand -hex 32
> ```

#### Step 4 — Verify the database will be auto-created

After the above steps, the following must be true:

```bash
# The data directory should NOT exist yet (or be empty after cleanup):
ls mini-services/tokenpay-access-service/data/
# Expected: "No such file or directory" or empty listing

# The data-layer.ts file exists and contains the initDataLayer function:
ls mini-services/tokenpay-access-service/src/data-layer.ts
# Expected: the file is listed
```

When PM2 starts the mini-service for the first time, you should see this in the logs:

```
[DataLayer] Initialized at ./data/access.db (WAL mode)
[DataLayer] Proof storage at ./data/proofs
```

If instead you see errors like `SQLITE_CANTOPEN`, `database is locked`, or `unable to open database file`, the stale files were not properly cleaned — go back to **Step 2** and make sure all `.db`, `.db-shm`, and `.db-wal` files are removed.

See [TOKENBAY-ACCESS-ENV-GUIDE.md](./docs/TOKENBAY-ACCESS-ENV-GUIDE.md) for full documentation of all TokenBay environment variables.

### 2.5. Build and Start with PM2

The `ecosystem.config.js` manages both services together.

```bash
# Create the production build
bun run build

# Create logs directory (required by PM2)
mkdir -p logs

# Start both services with PM2
pm2 start ecosystem.config.js

# Verify BOTH are running (not "errored" or "stopped")
pm2 status
# Expected output: alphaflow (online) and tokenpay-access (online)

# If tokenpay-access shows "errored", check logs immediately:
pm2 logs tokenpay-access --lines 30 --err

# Save the PM2 configuration so it survives reboots
pm2 save
pm2 startup
```

### 2.6. Configure Reverse Proxy (Caddy)

Caddy automatically handles HTTPS certificates via Let's Encrypt and routes both services through a single domain.

```bash
# Install Caddy
sudo apt install -y caddy

# Edit the Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Replace the contents with (or copy from the project's `Caddyfile`):

```
yourdomain.com, www.yourdomain.com {
    # ─── TokenBay Access Service (port 3100) ───────────────
    # Routes requests with ?XTransformPort=3100 to the access service
    @tokenpay {
        query XTransformPort=3100
    }
    handle @tokenpay {
        reverse_proxy localhost:3100 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }

    # ─── AlphaFlow (Next.js, port 3000) — default fallback ──
    handle {
        reverse_proxy localhost:3000 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
    }

    # Gzip compression
    encode gzip zstd

    # Logging
    log {
        output file /var/log/caddy/alphaflow-access.log {
            roll_size 50mb
            roll_keep 5
        }
    }
}
```

```bash
# Validate and reload Caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy
```

Your app is now accessible at **https://yourdomain.com** with automatic HTTPS.

> **How routing works:** The host app's proxy API routes (e.g., `/api/access/:userId`, `/api/proof-upload`) append `?XTransformPort=3100` to their outgoing requests. Caddy intercepts this query parameter and forwards the request to the TokenBay Access service on port 3100. All other traffic goes to Next.js on port 3000.

### 2.7. Verify TokenBay Access Service

After starting both services, verify the access service is healthy:

```bash
# Health check (no auth required)
curl http://localhost:3100/health
# Expected: { "status": "ok", "service": "TokenPay Access Service", "version": "2.0.0", ... }

# Stats check (requires API key)
curl -H "X-Access-Service-Key: <your-TOKENPAY_API_KEY>" http://localhost:3100/api/v1/stats
# Expected: { "totalUsers": 0, "activeUsers": 0, ... }
```

### 2.8. Firewall

```bash
# Allow SSH, HTTP, and HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

> **Note:** Ports 3000 and 3100 are NOT exposed to the internet. They are only accessible internally via the Caddy reverse proxy. Never open them in the firewall.

---

## 3. SMTP Configuration

### 3.1. SMTP Provider Examples

| Provider | SMTP Host | Port | Notes |
|---|---|---|---|
| **Gmail** | `smtp.gmail.com` | 587 | Requires [App Password](https://support.google.com/accounts/answer/185833) (not account password). Enable 2FA first. |
| **Mailgun** | `smtp.mailgun.org` | 587 | Free tier: 1,000 emails/month. Use credentials from Mailgun dashboard. |
| **SendGrid** | `smtp.sendgrid.net` | 587 | Use API key as password. Create a sender identity first. |
| **Mailtrap** | `smtp.mailtrap.io` | 587 | Testing only — emails are captured in sandbox UI. Free plan: 1,000 emails/month. |
| **Amazon SES** | `email-smtp.eu-north-1.amazonaws.com` | 587 | SES SMTP credentials from AWS console. Verify sender domain first. |
| **Microsoft 365** | `smtp.office365.com` | 587 | Requires app password or OAuth2 client credentials. |
| **Migadu** | `smtp.migadu.com` | 465 | Use your Migadu mailbox credentials. |

### 3.2. Gmail Setup (Most Common for Small Businesses)

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Go to **App passwords** → Create new → Select "Mail" → Generate
4. Use the 16-character app password as `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=abcdabcdabcdabcd  # 16-char app password
EMAIL_FROM=your@gmail.com
APP_URL=https://yourdomain.com
```

### 3.3. Testing Email Configuration

After deployment, verify email is working:

1. **Register a new account** — A verification email should be sent
2. **Click "Forgot password"** — A reset email should be sent
3. **Invite a team member** — An invitation email should be sent
4. **Check PM2 logs** for `[EMAIL]` entries:
   ```bash
   pm2 logs alphaflow | grep EMAIL
   ```

If emails fail, check the `EmailLog` table in the database — failed emails will have status `failed` with an error message.

---

## 4. Updating the Deployment

When you pull new changes:

```bash
cd AlphaFlow

# Pull latest code
git pull

# Install any new dependencies (both host app and mini-service)
bun install
cd mini-services/tokenpay-access-service && bun install && cd ../..

# Update the Neon database schema (if Prisma schema changed)
bun run db:push

# Rebuild for production
bun run build

# Restart both services
pm2 restart all

# Verify both are running
pm2 status
```

### Updating only the mini-service

If only the TokenBay Access module changed:

```bash
cd mini-services/tokenpay-access-service
bun install
cd ../..
pm2 restart tokenpay-access
```

> **Note:** If the `data-layer.ts` schema changed (tables added/modified), the `CREATE TABLE IF NOT EXISTS` statements won't alter existing tables. In that case, delete the SQLite file and let it recreate: `rm mini-services/tokenpay-access-service/data/access.db && pm2 restart tokenpay-access`.

---

## 5. Useful PM2 Commands

Both services are managed together. Replace `alphaflow` or `tokenpay-access` with `all` to target both.

| Command | Description |
|---|---|
| `pm2 status` | Show all running apps |
| `pm2 logs` | Show live logs (all services) |
| `pm2 logs alphaflow` | Show AlphaFlow logs |
| `pm2 logs tokenpay-access` | Show TokenBay Access logs |
| `pm2 logs alphaflow --lines 100` | Show last 100 log lines |
| `pm2 logs alphaflow --err` | Show error logs only |
| `pm2 restart alphaflow` | Restart AlphaFlow |
| `pm2 restart tokenpay-access` | Restart TokenBay Access |
| `pm2 restart all` | Restart both services |
| `pm2 stop alphaflow` | Stop AlphaFlow |
| `pm2 stop tokenpay-access` | Stop TokenBay Access |
| `pm2 delete all` | Remove all services from PM2 |
| `pm2 monit` | Real-time monitoring dashboard |
| `pm2 save` | Save current process list |
| `pm2 startup` | Generate startup script |

---

## 6. Environment Variables Reference

### 6.1. Host App (`.env` in project root)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | Neon PostgreSQL connection string. Get from [Neon Console](https://console.neon.tech). |
| `SMTP_HOST` | No* | — | SMTP server hostname |
| `SMTP_PORT` | No* | `587` | SMTP port (587 = TLS, 465 = SSL) |
| `SMTP_USER` | No* | — | SMTP authentication username |
| `SMTP_PASS` | No* | — | SMTP authentication password |
| `EMAIL_FROM` | No* | `noreply@alphaflow.dk` | Sender email address |
| `APP_URL` | No* | `http://localhost:3000` | Public base URL for email links |
| `TOKENPAY_API_KEY` | Yes | `tokenpay-dev-key-2026` | Shared API key for TokenBay proxy routes. **Must match `API_SHARED_KEY`.** |
| `NEXT_PUBLIC_TOKENPAY_PORT` | No | `3100` | Port the TokenBay Access service listens on |

*Not required — if any of `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` are missing, the email system runs in dev mode (console logging only, no emails sent).

### 6.2. TokenBay Access Mini-Service

Configured in `ecosystem.config.js` under the `tokenpay-access` app's `env` block (or in `mini-services/tokenpay-access-service/.env` for local dev).

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3100` | Service listen port |
| `API_SHARED_KEY` | Yes | `tokenpay-dev-key-2026` | Shared secret. **Must match `TOKENPAY_API_KEY`** in the host app. |
| `HOST_CALLBACK_URL` | No | *(empty)* | Webhook endpoint URL on the host app |
| `DATABASE_PATH` | No | `./data/access.db` | SQLite database file path (relative to `mini-services/tokenpay-access-service/`). The `data/` directory is auto-created on first startup. |

> **How the mini-service database works:** The SQLite database is managed entirely by `bun:sqlite` in `src/data-layer.ts` — **not** by Prisma. There is no migration file, no `db:push`, and no separate schema file. The `initDataLayer()` function runs `CREATE TABLE IF NOT EXISTS` on every startup, so the database is always self-initializing. Tables are only created if they don't exist, so existing data is preserved across restarts.

See [TOKENBAY-ACCESS-ENV-GUIDE.md](./docs/TOKENBAY-ACCESS-ENV-GUIDE.md) for detailed setup instructions and where to find each value.

---

## 7. Database Management

The app uses **two completely separate databases** with different engines, tools, and backup strategies:

| Database | Engine | Location | Managed By | Purpose |
|---|---|---|---|---|
| **AlphaFlow** | Neon PostgreSQL | Cloud (Neon) | Prisma ORM | Users, companies, accounting data |
| **TokenBay Access** | SQLite | `mini-services/tokenpay-access-service/data/access.db` | `bun:sqlite` (direct) | Proof files, access records, messages |

### Host App — Neon PostgreSQL

Neon handles backups, replication, and scaling automatically. You can also:

- **View your data:** Use the Neon Console's SQL Editor or connect with any PostgreSQL client (e.g., `psql`, pgAdmin, DBeaver)
- **Branch your database:** Neon supports zero-downtime branching for testing schema changes
- **Reset the schema:** `bun run db:push -- --force-reset` (WARNING: deletes all data)

### TokenBay Access — Local SQLite

#### Backup

```bash
cp mini-services/tokenpay-access-service/data/access.db \
   mini-services/tokenpay-access-service/data/access.db.backup-$(date +%Y%m%d)
```

#### Restore

```bash
pm2 stop tokenpay-access
cp mini-services/tokenpay-access-service/data/access.db.backup \
   mini-services/tokenpay-access-service/data/access.db
pm2 restart tokenpay-access
```

#### Reset (WARNING: deletes all data)

```bash
# Delete the SQLite file entirely — it is recreated from scratch on next startup
rm mini-services/tokenpay-access-service/data/access.db
rm mini-services/tokenpay-access-service/data/access.db-shm
rm mini-services/tokenpay-access-service/data/access.db-wal
pm2 restart tokenpay-access
```

> **Important:** Always stop the service before restoring or deleting the database file. The `-shm` and `-wal` files are SQLite's Write-Ahead Log companions — delete all three together.

---

## 8. Troubleshooting

### TokenBay Access crashes on PM2 startup (most common issue)

If `pm2 status` shows `tokenpay-access` as **errored** or it keeps restarting:

**Step 1 — Check the error logs:**
```bash
pm2 logs tokenpay-access --lines 30 --err
```

**Step 2 — The most likely cause is stale SQLite files from the repo clone.** Fix it:

```bash
# Stop the service
pm2 stop tokenpay-access

# Remove ALL SQLite files (database + WAL + SHM)
rm -f mini-services/tokenpay-access-service/data/access.db
rm -f mini-services/tokenpay-access-service/data/access.db-shm
rm -f mini-services/tokenpay-access-service/data/access.db-wal

# Restart — the service will create a fresh database
pm2 restart tokenpay-access

# Verify it started successfully
pm2 logs tokenpay-access --lines 10
# You should see: [DataLayer] Initialized at ./data/access.db (WAL mode)
```

**Step 3 — If it still fails, check for missing dependencies:**
```bash
cd mini-services/tokenpay-access-service && bun install && cd ../..
pm2 restart tokenpay-access
```

**Step 4 — Verify the cwd in PM2 is correct:**
```bash
pm2 show tokenpay-access | grep "script path"
# Should show: .../mini-services/tokenpay-access-service/index.ts
```

### App won't start — port in use

```bash
# Check what's using port 3000 or 3100
sudo lsof -i :3000
sudo lsof -i :3100

# Kill the process
sudo kill <PID>
```

### Host App database errors (Neon PostgreSQL)

```bash
# Check that DATABASE_URL is set in .env
grep DATABASE_URL .env

# Re-sync the Prisma schema to Neon
bun run db:push

# Regenerate Prisma Client
bun run db:generate
```

### Build errors

```bash
# Clean everything and rebuild
rm -rf .next node_modules
bun install
bun run db:generate
bun run build
```

### Emails not sending

1. **Check SMTP credentials** — Verify `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `.env`
2. **Check PM2 logs** — `pm2 logs alphaflow | grep EMAIL`
3. **Check EmailLog table** — Query for `status: 'failed'` entries
4. **Verify APP_URL** — Must be your public URL, not `localhost`
5. **Check SMTP port** — Port 587 uses STARTTLS; port 465 uses implicit SSL
6. **Gmail specific** — Ensure you're using an App Password, not your account password

### TokenBay Access not responding

```bash
# Check if the service is running
pm2 status tokenpay-access

# Check logs
pm2 logs tokenpay-access --lines 50

# Check if port 3100 is listening
curl http://localhost:3100/health

# Common causes:
# 1. Stale SQLite files (see above)  → rm -f data/access.db*
# 2. API key mismatch                → ensure TOKENPAY_API_KEY = API_SHARED_KEY
# 3. Port conflict                   → lsof -i :3100
# 4. Missing deps                    → cd mini-services/tokenpay-access-service && bun install
# 5. Data directory permission issue → ls -la mini-services/tokenpay-access-service/data/
```

### "Unauthorized" errors from proxy routes

If the host app's proxy routes (`/api/access/:userId`, `/api/proof-upload`, etc.) return `401 Unauthorized`:

1. **Check API key mismatch** — The `TOKENPAY_API_KEY` in the host `.env` must exactly match `API_SHARED_KEY` in `ecosystem.config.js`
2. **No trailing spaces** — Ensure no extra whitespace around the `=` in both files
3. **PM2 env takes precedence** — If you set the key in `ecosystem.config.js`, a `.env` file in the mini-service directory is ignored by PM2

### Webhooks not firing (access changes not logged)

1. **Check HOST_CALLBACK_URL** — Must be `https://yourdomain.com/api/tokenpay/callback` (not `localhost`)
2. **Check PM2 logs** — `pm2 logs tokenpay-access | grep Notification`
3. **Check the callback route** — Verify `/api/tokenpay/callback` is reachable:
   ```bash
   curl -X POST https://yourdomain.com/api/tokenpay/callback \
     -H "Content-Type: application/json" \
     -H "X-TokenPay-Signature: test" \
     -d '{"event":"test","userId":"test"}'
   ```

### PM2 app keeps restarting

```bash
# Check error logs for either service
pm2 logs alphaflow --err --lines 50
pm2 logs tokenpay-access --err --lines 50

# Common causes:
# 1. DATABASE_URL not set       → add Neon connection string to .env
# 2. Stale SQLite files         → rm -f mini-services/tokenpay-access-service/data/access.db*
# 3. Port conflict              → lsof -i :3000 or lsof -i :3100
# 4. Missing dependencies       → bun install (in both dirs)
# 5. Invalid .env file          → check syntax (no spaces around =)
# 6. API key mismatch           → check TOKENPAY_API_KEY vs API_SHARED_KEY
```

### Permission errors on Ubuntu

```bash
# Fix file ownership (both services need access)
sudo chown -R $USER:$USER /path/to/AlphaFlow
sudo chown -R $USER:$USER /path/to/AlphaFlow/mini-services/tokenpay-access-service

# Ensure the data directory is writable
chmod 755 mini-services/tokenpay-access-service/
```

### Caddy HTTPS not working

```bash
# Check Caddy status
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -f

# Validate config
sudo caddy validate --config /etc/caddy/Caddyfile

# Ensure DNS is pointing to your server IP
dig yourdomain.com
```

---

## 9. Security Checklist

Before going live, ensure:

- [ ] `.env` is configured with a valid `DATABASE_URL` pointing to your Neon PostgreSQL database
- [ ] `bun run db:push` succeeded (schema pushed to Neon)
- [ ] Stale SQLite files were removed (`rm -f mini-services/tokenpay-access-service/data/access.db*`)
- [ ] `.env` is configured with real SMTP credentials (not using dev mode)
- [ ] `APP_URL` matches your public domain (https)
- [ ] `TOKENPAY_API_KEY` and `API_SHARED_KEY` are set to a strong random value (not the dev default)
- [ ] Firewall (ufw) allows only ports 22, 80, 443 (ports 3000/3100 are internal only)
- [ ] SSH key authentication is configured (disable password login)
- [ ] Database files are not publicly accessible
- [ ] PM2 startup script is saved (`pm2 save && pm2 startup`)
- [ ] Caddy is enabled (`sudo systemctl enable caddy`) and configured with the `XTransformPort` routing block
- [ ] Both services show `online` in `pm2 status`
- [ ] `curl http://localhost:3100/health` returns `{"status":"ok"}`
- [ ] Backups are running (check PM2 logs for `[BACKUP]` entries)
- [ ] First user is promoted to SuperDev for oversight access
