const CACHE = 'tradequest-v2-foundation-1';
const CORE = [
  './', './index.html', './student.html', './teacher.html',
  './manifest.webmanifest', './assets/favicon.svg',
  './css/tokens.css', './css/base.css', './css/components.css',
  './css/game.css', './css/pages.css', './css/animations.css',
  './config/branding.json', './config/gamification.json',
  './questions/index.json', './avatars/index.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('tradequest-') && key !== CACHE)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
