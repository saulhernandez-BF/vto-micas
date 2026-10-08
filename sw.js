// Service worker del modo kiosko: la app funciona aunque se caiga el Wi-Fi de la tienda.
//  · Archivos propios: red primero (para recibir versiones nuevas), caché si no hay red.
//  · MediaPipe (jsdelivr) y el modelo de rostro (storage.googleapis): caché primero, son versiones fijas.
const CACHE = 'vto-micas-v1';
const PINNED = /cdn\.jsdelivr\.net\/npm\/@mediapipe|storage\.googleapis\.com\/mediapipe-models/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (PINNED.test(req.url)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  } else if (url.origin === self.location.origin && !url.pathname.includes('/media/')) {
    e.respondWith(fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then((res) => { // revalida siempre: versiones nuevas al instante
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
