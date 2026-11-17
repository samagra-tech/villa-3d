// Luxeria Villa (shared copy): serves the site's files from this device's cache.
// The site is published as a few encrypted packs (pack/*.bin). After the password, index.html downloads them in
// parallel, decrypts + unpacks them once into Cache Storage ('luxeria-<build salt>'); every request of the app is
// then answered from there, with no network round trip — except one small check per page load (meta.json) for a
// newer build. Public files: this one, index.html, meta.json, pack/.
const PUBLIC = new Set(['', 'index.html', 'sw.js', 'meta.json', '.nojekyll']);
const PREFIX = 'luxeria-';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || e.request.method !== 'GET') return;
  const rel = decodeURIComponent(url.pathname.slice(scope.pathname.length));
  if (PUBLIC.has(rel) || rel.startsWith('pack/')) return;
  e.respondWith(serve(e.request, url, scope));
});

// The build on the server, as the cache name it unpacks into (meta.json's salt), or null if it can't be had quickly
// (offline, slow line): then the cached copy is used as it is.
async function liveBuild(scope) {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 2500);
  try {
    const meta = await (await fetch(new URL('meta.json', scope), { cache: 'no-store', signal: stop.signal })).json();
    return PREFIX + meta.salt.replace(/[^A-Za-z0-9]/g, '');
  } catch { return null; } finally { clearTimeout(timer); }
}

async function serve(req, url, scope) {
  const name = (await caches.keys()).find((k) => k.startsWith(PREFIX));
  // opening or refreshing a page: if a newer build has been deployed, go back to the password page, which drops this
  // device's old copy and unpacks the new one (a plain refresh used to show the cached build for ever)
  if (name && req.mode === 'navigate') {
    const live = await liveBuild(scope);
    if (live && live !== name) return Response.redirect(new URL('index.html', scope).href, 302);
  }
  const cache = name && await caches.open(name);
  const hit = cache && await cache.match(url.origin + url.pathname);
  if (hit) return hit;
  // not unpacked here (yet), or the browser cleared it: back to the password page
  if (req.mode === 'navigate') return Response.redirect(new URL('index.html', scope).href, 302);
  return new Response('Not found', { status: 404 });
}
