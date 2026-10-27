// Network-first service worker: always fresh when online, works offline.
const CACHE = 'scores-v24';
const ASSETS = ['./', 'index.html', 'dix-mille.html', 'yams.html', 'scoppa.html', 'flechettes.html', 'joueurs.html', 'autre.html', 'style.css', 'common.js', 'stats.js', 'roster.js', 'joueurs.js', 'autre.js', 'camera-scan.js', 'decoder.js', 'vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/zxing-reader.js', 'counter.js', 'yams.js', 'scoppa.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
