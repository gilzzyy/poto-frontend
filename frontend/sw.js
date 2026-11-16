const CACHE_NAME = 'photobooth-asyricame-v4';
const APP_SHELL = [
  '/',
  '/aplikasi-photobooth.html',
  '/manifest.webmanifest',
  '/assets/frames/the1975-data.js',
  '/assets/frames/the1975-overlay.png',
  '/assets/frames/the1975-preview.jpg',
  '/assets/frames/the1975_duo-overlay.png',
  '/assets/frames/the1975_duo-preview.jpg',
  '/assets/frames/ransom-overlay.png',
  '/assets/frames/ransom-preview.jpg',
  '/assets/frames/specialday-overlay.png',
  '/assets/frames/specialday-preview.jpg',
  '/assets/frames/polaroid_denim-overlay.png',
  '/assets/frames/polaroid_denim-preview.jpg',
  '/assets/frames/cowgirl-overlay.png',
  '/assets/frames/cowgirl-preview.jpg',
  '/assets/frames/canon_vinyl-overlay.png',
  '/assets/frames/canon_vinyl-preview.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Network-first dengan fallback ke cache offline (PWA-03)
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches
          .open(CACHE_NAME)
          .then((c) => c.put(event.request, copy))
          .catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('/'))
      )
  );
});
