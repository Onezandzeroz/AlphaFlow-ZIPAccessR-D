import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*.space.z.ai",
    "*.space-z.ai",
  ],
  serverExternalPackages: ["@prisma/client", "prisma", "node-cron", "archiver", "nodemailer"],

  // ─── SPA rewrites: catch all non-API, non-static paths and serve the root page ───
  // The app is a single-page app (SPA) with client-side routing.
  // Next.js only has one filesystem route (/). All other paths like
  // /reset-password, /terms, /transactions, /invoices etc. are handled
  // client-side via window.history + React state. Without these rewrites,
  // Next.js would return a 404 for any path that doesn't match a file
  // in src/app/, preventing the client JS from ever loading.
  async rewrites() {
    return [
      {
        // Exclude API routes, static assets, and special files from the catch-all
        source: "/((?!api|_next|favicon\\.ico|manifest\\.json|robots\\.txt|sitemap\\.xml|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot)).*)",
        destination: "/",
      },
    ];
  },

  // ─── SEO: Generate sitemap and robots automatically ───────────
  // next-sitemap style configuration for Danish market
  // Sitemap and robots are generated via src/app/sitemap.ts and robots.ts

  // Security headers & feature policies — applied to all responses.
  // These headers protect the app regardless of whether it is served
  // directly by Next.js or behind Caddy / another reverse proxy.
  async headers() {
    return [
      // ─── Global headers (all routes) ─────────────────────────────
      {
        source: "/(.*)",
        headers: [
          // Clickjacking protection
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // Prevent MIME type sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // XSS protection (legacy browsers)
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // Referrer policy — only send origin on cross-origin requests
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Permissions policy — allow camera from same origin (needed for receipt scanner),
          // disable other sensitive APIs that the app doesn't use
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
          },
          // CRITICAL: Never cache HTML pages — ensures fresh JS bundle references
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },

      // ─── Strict security for API routes ──────────────────────────
      {
        source: "/api/:path*",
        headers: [
          // Prevent API endpoints from being embedded in iframes
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          // Cache control — no caching for API responses
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          // Pragma for HTTP/1.0 caches
          {
            key: "Pragma",
            value: "no-cache",
          },
          // API endpoints should not be navigated to directly
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },

      // ─── SEO: Sitemap & robots — cache for performance ──────────
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
          {
            key: "Content-Type",
            value: "application/xml; charset=utf-8",
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
          {
            key: "Content-Type",
            value: "text/plain; charset=utf-8",
          },
        ],
      },
      // ─── SEO: Structured data (JSON-LD) headers ───────────────────
      // JSON-LD is embedded in HTML, but if served as static files:
      {
        source: "/(.*)\.json$",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      // ─── Service worker — allow caching ──────────────────────────
      {
        source: "/sw.js",
        headers: [
          // Service worker must have JS content type
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          // Cache-Control — allow SW file to be cached briefly but always revalidate
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },

      // ─── Manifest — allow caching ────────────────────────────────
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
          // Short cache for manifest so updates are picked up quickly
          {
            key: "Cache-Control",
            value: "public, max-age=3600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
