const CACHE_NAME = 'radar-notify-v4';
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

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SKIP_WAITING') {
    return;
  }

  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (isSameOrigin && response && response.status === 200) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone).catch(() => {
            // キャッシュ更新失敗時は無視
          });
        });
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }

        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }

        return caches.match('./index.html');
      });
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
