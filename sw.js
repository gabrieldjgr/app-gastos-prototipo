// Service worker: la app funciona sin conexión (excepto la lectura con IA).
const VERSION = 'ritmo-v0.4.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/store.js', './js/data.js', './js/format.js', './js/budget.js',
  './js/charts.js', './js/ui.js', './js/sample.js', './js/ai.js', './js/imageeditor.js', './js/proactive.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'api.anthropic.com') return; // nunca se guarda en caché

  // Archivos propios: red primero (para ver cambios), caché si no hay conexión.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }

  // Fuentes y librerías de CDN: caché primero.
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url.hostname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })),
    );
  }
});
