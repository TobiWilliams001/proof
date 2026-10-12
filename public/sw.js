// Proof service worker, keeps the app opening on weak or no connection (brief §9).
// Journal data lives in the browser, so caching the shell is enough to write offline.

// Bump to clear every old copy on the next visit.
const VERSION = 'proof-v2';
const SHELL = ['/journal', '/ask', '/review', '/trades', '/playbook', '/settings', '/calculator', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // One failed route shouldn't abort the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages, and the data Next.js fetches when moving between pages: always fresh when
  // online, last good copy only when offline. A cached copy here would show an old
  // version of a page after every release.
  const isPageData = url.searchParams.has('_rsc') || req.headers.get('RSC') === '1';
  if (req.mode === 'navigate' || isPageData) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || (isPageData ? Response.error() : caches.match('/journal')))),
    );
    return;
  }

  // Hashed build assets never change, serve from cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else (icons, images): cached copy now, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});

// Tapping a rule notification opens the journal, where the card is waiting.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus().then((w) => w.navigate('/journal')) : self.clients.openWindow('/journal');
    }),
  );
});
