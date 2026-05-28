// ── Service Worker v4 — installability fix ──────────────────────────
//
// Changes from v3:
//   - manifest.json is now NETWORK ONLY (never intercepted/cached by SW)
//     because Chrome uses the manifest to determine installability. If the
//     SW serves a stale or empty cached manifest, the install prompt vanishes.
//   - PWA-critical files (icons, manifest) are excluded from static asset
//     classification so they always come from the network.
//   - Nuclear cache-clear fallback is gentler: no longer nukes icon caches.
//
// Unchanged from v3:
//   - JS/CSS: NETWORK ONLY — never cached
//   - Pages: NETWORK ONLY — always fresh HTML
//   - Static assets (images/fonts): stale-while-revalidate
//   - Version message: allows the app to query SW version and force updates
//
const CACHE_VERSION = 'alphaai-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache (NOT JS/CSS — those are always network)
const STATIC_ASSETS = [
  '/logo.svg',
  '/logo.png',
  '/logo-clean.png',
  '/favicon.png',
  '/apple-touch-icon.png',
];

// PWA-critical files: icons and manifest MUST always come from the network.
// If the SW serves a stale version of these, Chrome won't offer install.
const PWA_CRITICAL = [
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/manifest.json',
  '/sw.js',
];

// ── Install: pre-cache static assets only ─────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Some assets might not exist — that's fine
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: nuke ALL old caches ─────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ── Message handler: version queries + cache control ──────────────
self.addEventListener('message', (event) => {
  const { data, source } = event;

  if (data?.type === 'GET_VERSION') {
    // Respond with our cache version so the app can detect mismatches
    source?.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }

  if (data?.type === 'CLEAR_ALL_CACHES') {
    // Nuclear option: clear everything the SW has cached
    caches.keys().then((names) => {
      return Promise.all(names.map((n) => caches.delete(n)));
    }).then(() => {
      source?.postMessage({ type: 'CACHES_CLEARED' });
    });
  }

  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch: route by request type ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) return;

  // API calls: network-first with short cache (for offline resilience)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE, 300));
    return;
  }

  // Page navigation: NETWORK ONLY
  // Pages MUST come from the network so the browser always gets the latest
  // HTML which references the latest JS bundles. No caching at all.
  if (request.mode === 'navigate') {
    event.respondWith(networkOnly(request));
    return;
  }

  // JS/CSS bundles: NETWORK ONLY — NEVER cache application code
  // This is the critical fix. Previously cached JS meant old code ran forever.
  // Now every request goes to the network. Period.
  if (isAppBundle(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  // _next/data (RSC): network only — these are dynamic
  if (url.pathname.startsWith('/_next/data/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // _next/static (hashed assets): these have content hashes so can be cached
  // But to be safe, use network-first so updates always propagate
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(networkFirst(request, STATIC_CACHE, 0));
    return;
  }

  // PWA-critical files (icons, manifest, sw.js): NETWORK ONLY
  // Chrome checks these during install eligibility. Stale cached copies
  // cause the install prompt to silently disappear.
  if (isPwaCritical(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Static assets (images, fonts): cache-first with revalidation
  // NOTE: .json files are excluded — manifest.json must not be cached.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────

/**
 * NETWORK ONLY — never cache, always fetch from network.
 * Used for JS/CSS bundles and page navigation where stale code is unacceptable.
 */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    // If we're offline, try cache as absolute last resort
    const cached = await caches.match(request);
    if (cached) return cached;
    return offlineFallback();
  }
}

/**
 * NETWORK FIRST — try network, fall back to cache.
 * Used for API calls and hashed static assets.
 */
async function networkFirst(request, cacheName, maxAgeSeconds) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      if (maxAgeSeconds <= 0) return cached;
      const cachedTime = cached.headers.get('sw-cache-time');
      if (cachedTime) {
        const age = (Date.now() - parseInt(cachedTime, 10)) / 1000;
        if (age < maxAgeSeconds) return cached;
      }
      return cached;
    }
    return offlineFallback();
  }
}

/**
 * STALE WHILE REVALIDATE — serve cache immediately, update in background.
 * Used for images, fonts, icons that rarely change.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

function offlineFallback() {
  return new Response(
    '<html><body><h1>Offline</h1><p>Du er offline. Prøv igen senere.</p></body></html>',
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 503,
    }
  );
}

function isAppBundle(url) {
  return url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
}

function isStaticAsset(url) {
  const staticExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.woff', '.woff2', '.ttf', '.eot', '.otf', '.ico',
    // NOTE: .json is intentionally EXCLUDED so manifest.json
    // always goes to the network and is never intercepted by SW.
  ];
  return staticExtensions.some((ext) => url.pathname.endsWith(ext));
}

function isPwaCritical(url) {
  return PWA_CRITICAL.some((p) => url.pathname === p || url.pathname.endsWith(p));
}
