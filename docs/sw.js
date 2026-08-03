/* Naruve — service worker
   Strategy:
     · HTML + version.json  → network first  (so a push shows up immediately)
     · css / js / icons     → stale-while-revalidate
     · audio/               → cache first, in a cache that outlives builds
     · fonts (cross-origin) → cache first
   skipWaiting + clients.claim means a new build takes over on the next launch,
   without the user having to close every tab.                                  */

const BUILD = '0.1.10';           // replaced by scripts/bump.mjs on every push
const CACHE = 'naruve-' + BUILD;

/* Example audio is expensive on mobile data — Indonesia is the first market —
   and a recording never changes without its filename changing, because the
   name is a hash of the sentence. So it lives in its own cache that the
   activate handler does NOT sweep: a build bump must not make the phone
   re-download every clip it already has. */
const AUDIO_CACHE = 'naruve-audio-v1';
const KEEP = [CACHE, AUDIO_CACHE];

const PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/ui.js',
  './js/audio.js',
  './js/mic.js',
  './js/pitch.js',
  './js/score.js',
  './js/data.js',
  './js/phonemes.js',
  './js/app.js',
  './js/boot.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' goes past the browser's own HTTP cache.
      // Without it a worker installing while the previous max-age is still
      // alive fills the brand-new cache with the previous build's files —
      // the build number on screen changes but the layout does not.
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isHTML(req) {
  return req.mode === 'navigate' ||
         (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Example audio — cache first, keep forever. Matches wherever AUDIO.base
  // points, so this keeps working after the move to external storage.
  if (/\/audio\/.+\.(mp3|m4a|ogg|wav)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Google Fonts — cache first, they never change
  if (url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // HTML and version.json — always try the network first
  if (isHTML(req) || url.pathname.endsWith('version.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // everything else — serve cache, refresh in the background.
  // The background refresh skips the HTTP cache too, for the same reason
  // as the precache above.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(new Request(req.url, { cache: 'reload' })).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
