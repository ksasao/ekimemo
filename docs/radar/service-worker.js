const CACHE_NAME = 'radar-notify-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/styles.css',
  './js/config.js',
  './js/kdtree.js',
  './js/station.js',
  './js/map.js',
  './js/location.js',
  './js/drawing.js',
  './js/voronoi.js',
  './js/ui.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const failedUrls = [];

      await Promise.all(PRECACHE_URLS.map(async (url) => {
        try {
          await cache.add(url);
        } catch (error) {
          failedUrls.push(url);
          console.error('[SW] precache failed:', url, error);
        }
      }));

      if (failedUrls.length > 0) {
        console.warn('[SW] precache completed with failures:', failedUrls);
      }

      await self.skipWaiting();
    }).catch((error) => {
      console.error('[SW] install failed:', error);
      throw error;
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('./');
    })
  );
});
