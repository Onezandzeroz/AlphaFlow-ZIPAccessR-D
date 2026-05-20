# TokenBay Access — Environment Variables Guide

The TokenBay Access module uses **two separate .env locations** that must share a matching API key to communicate securely.

---

## 1. Host App (AlphaFlow) — `.env`

Place these variables in the **root `.env`** file (next to `DATABASE_URL`, etc.).

| Variable | Required | Default | Description |
|---|---|---|---|
| `TOKENPAY_API_KEY` | Yes | `tokenpay-dev-key-2026` | Shared secret used by the proxy routes to authenticate with the Access Service. **Must match `API_SHARED_KEY`** in the mini-service. |
| `NEXT_PUBLIC_TOKENPAY_PORT` | No | `3100` | Port the TokenPay Access Service listens on. Only change this if you use a different port. |

**How to set `TOKENPAY_API_KEY`:**

Generate a strong random key for production:
```bash
openssl rand -hex 32
```
Copy the output and paste it as the value. You must use this **exact same value** as `API_SHARED_KEY` in the mini-service (step 2 below).

---

## 2. Mini-Service — `.env` (or PM2 env)

Place these variables in `mini-services/tokenpay-access-service/.env` **or** set them in `ecosystem.config.js` under the `tokenpay-access` app's `env` block (PM2 takes precedence).

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3100` | Port the Access Service binds to. Must match `NEXT_PUBLIC_TOKENPAY_PORT` in the host app if you change it. |
| `API_SHARED_KEY` | Yes | `tokenpay-dev-key-2026` | Shared secret for authenticating requests from the host app. **Must match `TOKENPAY_API_KEY`** in the host `.env`. |
| `HOST_CALLBACK_URL` | No | *(empty)* | Full URL to the host app's webhook endpoint. The Access Service sends `access.granted`, `access.revoked`, and `access.expiring` events here. |
| `DATABASE_PATH` | No | `./data/access.db` | Path to the SQLite database file (relative to the mini-service root). The `data/` directory is auto-created on first run. |

### Where to find the values:

| Variable | Source |
|---|---|
| `API_SHARED_KEY` / `TOKENPAY_API_KEY` | **You generate this yourself.** Use `openssl rand -hex 32` for production. Both sides must be identical. |
| `PORT` | **You choose.** Default `3100` works unless it conflicts with another service. If you change it, also update `NEXT_PUBLIC_TOKENPAY_PORT` in the host `.env` and the `@tokenpay` matcher in `Caddyfile`. |
| `HOST_CALLBACK_URL` | **Your own server URL + the webhook route.** Format: `http://localhost:3000/api/tokenpay/callback` (local) or `https://yourdomain.com/api/tokenpay/callback` (production). This route already exists in the app — no setup needed beyond pointing to it. |
| `DATABASE_PATH` | **You choose.** Default `./data/access.db` stores the SQLite file inside `mini-services/tokenpay-access-service/data/`. Only change this if you want the DB file elsewhere. |

---

## 3. Quick Start — Minimal Setup

For development, the defaults work out of the box — no changes needed. Both sides default to `tokenpay-dev-key-2026`.

### Production Setup:

**Step 1** — Generate a shared key:
```bash
openssl rand -hex 32
# Example output: a3f8b2c1d4e5f607890abcdef1234567890abcdef1234567890abcdef123456
```

**Step 2** — Add to host `.env`:
```env
TOKENPAY_API_KEY=a3f8b2c1d4e5f607890abcdef1234567890abcdef1234567890abcdef123456
NEXT_PUBLIC_TOKENPAY_PORT=3100
```

**Step 3** — Add to `ecosystem.config.js` (under `tokenpay-access` env):
```js
env: {
  API_SHARED_KEY: 'a3f8b2c1d4e5f607890abcdef1234567890abcdef1234567890abcdef123456',
  HOST_CALLBACK_URL: 'https://yourdomain.com/api/tokenpay/callback',
  DATABASE_PATH: './data/access.db',
}
```

**Step 4** — Restart both services:
```bash
pm2 delete all && pm2 start ecosystem.config.js
```

---

## 4. Verification

After setup, confirm the service is healthy:

```bash
# Check the Access Service is running
curl http://localhost:3100/health

# Expected response:
# { "status": "ok", "service": "TokenPay Access Service", "version": "2.0.0", ... }
```

If you get `Unauthorized` from the host app's proxy routes, the `TOKENPAY_API_KEY` and `API_SHARED_KEY` values don't match.
