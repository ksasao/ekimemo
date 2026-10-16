const CACHE_NAME = 'radar-notify-v4';
// アプリ本体のキャッシュ更新で消えないよう別名で管理する
const TILE_CACHE_NAME = 'radar-tiles-v1';
const TILE_HOST = 'tile.openstreetmap.org';
const TILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TILE_MAX_ENTRIES = 3000;
// 上限を超えたら少し余裕を持たせて減らし、削除処理が毎回走らないようにする
const TILE_TRIM_TARGET = 2700;
const TILE_CACHED_AT_HEADER = 'x-radar-cached-at';
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
      keys.filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME).map((key) => caches.delete(key))
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

  if (requestUrl.hostname === TILE_HOST) {
    event.respondWith(handleTileRequest(event));
    return;
  }

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

// 地図タイル: 保存から30日以内はキャッシュを使い、期限切れなら取り直す(失敗時は古いタイルを使う)
async function handleTileRequest(event) {
  const cache = await caches.open(TILE_CACHE_NAME);
  const cached = await cache.match(event.request);

  if (cached && !isTileExpired(cached)) {
    return cached;
  }

  try {
    const response = await fetch(event.request);
    // opaque(no-cors)は中身が見えず容量計算も大きく膨らむため保存しない
    if (response.ok && response.type === 'cors') {
      event.waitUntil(storeTile(cache, event.request, response.clone(), !cached));
    }
    return response;
  } catch (error) {
    return cached || Response.error();
  }
}

function isTileExpired(response) {
  const cachedAt = Number(response.headers.get(TILE_CACHED_AT_HEADER));
  return !Number.isFinite(cachedAt) || Date.now() - cachedAt > TILE_MAX_AGE_MS;
}

async function storeTile(cache, request, response, isNewEntry) {
  const headers = new Headers(response.headers);
  headers.set(TILE_CACHED_AT_HEADER, String(Date.now()));
  const body = await response.blob();
  await cache.put(request, new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  }));

  if (isNewEntry) {
    await noteNewTileStored(cache);
  }
}

// 件数は Service Worker 起動後の初回だけ数え、以降は追加分を加算して判定する
let tileEntryCount = null;
let tileTrimPromise = null;

async function noteNewTileStored(cache) {
  if (tileEntryCount === null) {
    tileEntryCount = (await cache.keys()).length;
  } else {
    tileEntryCount += 1;
  }

  if (tileEntryCount > TILE_MAX_ENTRIES && !tileTrimPromise) {
    tileTrimPromise = trimTileCache(cache).finally(() => {
      tileTrimPromise = null;
    });
  }
  return tileTrimPromise;
}

// cache.keys() は保存(上書き)された順なので、先頭から古い順に削除する
async function trimTileCache(cache) {
  const keys = await cache.keys();
  const excess = Math.max(0, keys.length - TILE_TRIM_TARGET);
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
  tileEntryCount = keys.length - excess;
}
