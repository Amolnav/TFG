/*
 * N4.6: service worker MÍNIMO del panel (y web pública).
 * - Sin caché agresiva de datos: /api y /socket.io van SIEMPRE a red.
 * - Los estáticos usan red-primero con caché de respaldo, para que el panel
 *   instalado abra aunque la red parpadee.
 */
const CACHE_NAME = 'resto-static-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/api') &&
    !url.pathname.startsWith('/socket.io') &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/branding/') ||
      /\.(js|css|svg|png|jpg|jpeg|webp|woff2?)$/.test(url.pathname) ||
      url.pathname === '/' ||
      url.pathname === '/manifest.webmanifest')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isStaticAsset(url)) return; // datos: siempre red, sin tocar

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
