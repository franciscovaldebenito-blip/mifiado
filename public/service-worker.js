const CACHE_NAME = 'mifiado-shell-v11';
const APP_SHELL = ['/', '/index.html', '/css/styles.css?v=family-tabs-v2', '/js/app.bundle.js?v=family-tabs-v2', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/config.js' || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return;
  if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/icons/') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
    return;
  }
  if (req.mode === 'navigate') event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
});
