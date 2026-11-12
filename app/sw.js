// Keeps E-ADIS C/P CAADC on the device so it opens without a connection.
//
// A version is a set that belongs together: the password page, the app file
// it opens, and the manual. A new version is downloaded whole into its own
// cache and checked; only then, at the next start of the app, does it take
// over. The device never holds a page without the app file that page needs.
const VERSION = "1f0b197ecf8f";
const PAGE_SHA256 = "8e0727ca3b847d74b0841249c20856aff8656a78ba587159c8e2973536c19f39";
const APP = "app.c5cb3d942886.bin";
const MANUAL = "manual.5180a2f36d0d.bin";
const SMALL = ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-512.png'];

const SCOPE = new URL(self.registration.scope).pathname;
const MINE = 'eadis-web:' + SCOPE + ':';
const CACHE = MINE + VERSION;

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

const download = async (cache, url) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status !== 200) throw new Error(url + ' answered ' + res.status);
  await cache.put(url, res);
};

// The app and manual files are named after their content, so a copy already
// on the device (kept by the previous version) is the same file: reuse it.
const keep = async (cache, url) => {
  const had = await caches.match(url);
  if (had) await cache.put(url, had);
  else await download(cache, url);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // The password page must be exactly the one this version was built
      // with (a server still handing out the previous page fails here, and
      // the browser tries the whole install again later).
      const page = await fetch('./', { cache: 'no-store' });
      if (page.status !== 200) throw new Error('page answered ' + page.status);
      const body = await page.clone().arrayBuffer();
      if (hex(await crypto.subtle.digest('SHA-256', body)) !== PAGE_SHA256) throw new Error('page is not this version');
      await cache.put('./', page);
      await keep(cache, APP);
      for (const url of SMALL) await download(cache, url);
      // The manual is large and the app opens without it; if this fails it
      // is fetched when the manual is first opened.
      await keep(cache, MANUAL).catch(() => undefined);
    })()
  );
});

// Older versions' caches go once this one is in use. "Older" = made before
// this version's cache (caches are listed in the order they were made), so a
// newer version still downloading or waiting is never touched. Also run when
// the page is served, because a version can come into use without its
// "activate" event (after the app has been closed and reopened).
const dropOlder = async () => {
  const names = (await caches.keys()).filter((n) => n.startsWith(MINE));
  await Promise.all(names.slice(0, Math.max(names.indexOf(CACHE), 0)).map((n) => caches.delete(n)));
};

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await dropOlder();
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  // Sent by the password page at start, when this version has been waiting.
  if (event.data === 'activate') self.skipWaiting();
  // Asked by the app (Settings): is everything here for offline use?
  if (event.data === 'status' && event.ports[0]) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const has = async (url) => !!(await cache.match(url));
        const core = (await Promise.all(['./', APP, ...SMALL].map(has))).every(Boolean);
        event.ports[0].postMessage({ version: VERSION, ready: core, manual: await has(MANUAL) });
      })()
    );
  }
});

// The password page: the copy kept with this version, which matches the kept
// app file. Only when nothing is kept (the cache was cleared) the network.
const page = async (request) => (await (await caches.open(CACHE)).match('./')) || fetch(request);

// Everything else: the kept copy; otherwise the network. Of what comes from
// the network only the manual is kept (when its first download had failed).
const asset = async (request, name) => {
  const kept = await caches.match(request, { ignoreSearch: true });
  if (kept) return kept;
  const fresh = await fetch(request);
  if (name === MANUAL && fresh.status === 200) await (await caches.open(CACHE)).put(MANUAL, fresh.clone());
  return fresh;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return;
  const name = url.pathname.slice(SCOPE.length);
  if (request.mode === 'navigate') {
    if (name === '' || name === 'index.html') {
      event.respondWith(page(request));
      event.waitUntil(dropOlder().catch(() => undefined));
    }
    return; // any other page in this folder is not this app's
  }
  event.respondWith(asset(request, name));
});
