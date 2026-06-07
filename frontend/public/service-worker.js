// Bump CACHE_VERSION whenever cache strategy or shell assets change.
// On version bump, old caches are deleted on activate.
const CACHE_VERSION = 'v24';
const SHELL_CACHE = `athlyticai-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `athlyticai-assets-${CACHE_VERSION}`;
const DATA_CACHE = `athlyticai-data-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {
        // Don't fail install if a single asset 404s
      })
    )
  );
  // Apply update immediately when prompted by the page
  self.skipWaiting();
});

// Activate: nuke caches from older versions
self.addEventListener('activate', (event) => {
  const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Listen for explicit "apply update" messages from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Web Push: "your analysis is ready" while the tab is closed/backgrounded ─
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'Atheonics';
  const options = {
    body: data.body || 'Your analysis is ready.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.job_id ? `analysis-${data.job_id}` : 'analysis',
    renotify: true,
    data: { url: data.url || '/analyze' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification focuses an existing tab (or opens one) at the URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/analyze';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        // Focus an already-open app tab and route it to the result.
        if ('focus' in w) {
          w.focus();
          if ('navigate' in w) { try { w.navigate(target); } catch {} }
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// Fetch routing
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GETs
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Skip non-http(s) (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) return;

  // Never cache API calls or video processing endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/tokens/') ||
    url.pathname.startsWith('/payments/') ||
    url.pathname.startsWith('/admin/')
  ) {
    return;
  }

  // Cross-origin: let the browser handle it (avoids opaque-cache bloat)
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML) — network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Static JSON data (equipment, training, etc.) — stale-while-revalidate
  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Hashed build assets (CRA puts them in /static/) — cache-first, immutable
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Other static files (images, fonts, audio, models) — cache-first
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|mp3|wav|json|bin)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  // Default: pass through
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}
