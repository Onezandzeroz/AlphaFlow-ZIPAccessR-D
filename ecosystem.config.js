// PM2 Ecosystem Configuration for AlphaFlow + TokenPay Access Service
// Usage: pm2 start ecosystem.config.js
//
// PREREQUISITES:
//   1. bun run build
//   2. bun run db:push
//   3. cd mini-services/tokenpay-access-service && bun install
//
// After config changes: pm2 delete all && pm2 start ecosystem.config.js
//
// Services:
//   1. alphaflow          — Next.js app on port 3000
//   2. tokenpay-access    — TokenPay Access Service on port 3100

module.exports = {
  apps: [
    // ─── AlphaFlow (Next.js) ───────────────────────────────────────
    {
      name: 'alphaflow',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      // Set cwd to YOUR project root on the server
      // e.g. '/home/ubuntu/alphaflow' or '/var/www/alphaflow'
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'production',
        // DATABASE_URL is loaded from .env.local — make sure it's set!
        // Example: postgresql://neondb_owner:xxx@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
      },
      // CRITICAL: Must use fork mode — cluster mode breaks Bun interpreter
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Memory limit — restart if exceeding 1.5GB
      max_memory_restart: '1500M',
      // Logging
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // ─── TokenPay Access Service (Bun + Hono) ──────────────────────
    {
      name: 'tokenpay-access',
      script: 'index.ts',
      cwd: `${process.cwd()}/mini-services/tokenpay-access-service`,
      interpreter: 'bun',
      env: {
        NODE_ENV: 'production',
        PORT: '3100',
        // API_SHARED_KEY must match TOKENPAY_API_KEY in the host app's .env
        API_SHARED_KEY: 'tokenpay-dev-key-2026',
        // Webhook callback URL — the host app's endpoint for access change events
        HOST_CALLBACK_URL: 'http://localhost:3000/api/tokenpay/callback',
        // SQLite database path for the access service
        DATABASE_PATH: './data/access.db',
        // AES-256-GCM key (64-char hex) shared with TokenBay-ZIPProof for .tbkey decryption.
        // This MUST match the PROOF_ENCRYPTION_KEY in the root .env file and in TokenBay-ZIPProof.
        // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        // NOTE: pm2 reads env vars from this file — it does NOT inherit from the root .env.
        PROOF_ENCRYPTION_KEY: '', // <-- SET YOUR KEY HERE (or use pm2 set)
      },
      // CRITICAL: Must use fork mode — cluster mode breaks Bun and SQLite.
      // Bun does not support Node.js cluster module, and multiple workers
      // cannot share a single SQLite database file (WAL locking conflict).
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // Memory limit — lighter service, 256MB is plenty
      max_memory_restart: '256M',
      // Logging
      error_file: './logs/tokenpay-access-error.log',
      out_file: './logs/tokenpay-access-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
