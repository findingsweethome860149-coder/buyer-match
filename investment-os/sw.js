/**
 * Service Worker — AI Investment OS Lite
 * Cache-first for static assets; network-first for API calls.
 */
const CACHE_NAME = 'aios-v1.1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/db.js',
  './js/utils.js',
  './js/transaction.js',
  './js/portfolio.js',
  './js/watchlist.js',
  './js/ai.js',
  './js/notification.js',
  './js/security.js',
  './js/dashboard.js',
  './js/price.js',
  './js/app.js',
];

// Install: pre-cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API calls: network-first (don't cache dynamic data)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhook')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response('{"error":"offline"}', {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }))
  );
});
