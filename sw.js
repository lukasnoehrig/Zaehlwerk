/* Zählwerk Service Worker: App offline verfügbar, Kartenbilder werden zwischengespeichert. */
const VERSION = 'zaehlwerk-v3';
const KACHELN = 'zaehlwerk-kacheln';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== KACHELN).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function kuerzen(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) {
    for (const k of keys.slice(0, keys.length - max)) await cache.delete(k);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Eigene Dateien: erst Netz (für Updates), sonst Zwischenspeicher
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const kopie = res.clone();
          caches.open(VERSION).then((c) => c.put(req, kopie));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Kartenbibliothek: aus dem Zwischenspeicher, wenn vorhanden
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const kopie = res.clone();
        caches.open(VERSION).then((c) => c.put(req, kopie));
        return res;
      }))
    );
    return;
  }

  // Kartenbilder: zwischenspeichern, höchstens 500 Stück
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(
      caches.open(KACHELN).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          kuerzen(cache, 500);
        }
        return res;
      })
    );
  }
  // Routen, Adresssuche und Spritpreise gehen immer direkt ins Netz.
});
