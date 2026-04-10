const CACHE_NAME = 'ultrapilot-1.0.5';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './data/airports.json',
];

const TILE_CACHE = 'ultrapilot-tiles-v1';

// Install — cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — purge old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== TILE_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Google Fonts: cache-first (stale-while-revalidate)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetched = fetch(e.request).then(res => {
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // OSM map tiles: cache-first (offline map support)
  if (url.hostname.match(/^[abc]\.tile\.openstreetmap\.org$/)) {
    e.respondWith(
      caches.open(TILE_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            cache.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Same-origin: network-first, fallback to cache (catches hashed JS/CSS bundles)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(fetch(e.request));
});
