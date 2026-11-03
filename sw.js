// sw.js – vaihe 0: verkko ensin, välimuisti varalla.
// Koskee vain saman osoitteen GET-pyyntöjä. API-kutsut (toinen osoite) kulkevat suoraan eteenpäin.

const CACHE = 'laitetesti-v1';
const SHELL = ['./', './index.html', './app.js', './lib.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('laitetesti-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([fetch(request), timeout(4000)]);
    if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch {
    const hit =
      (await cache.match(request, { ignoreSearch: true })) ||
      (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (hit) return hit;
    return new Response('Ei verkkoa eikä välimuistia.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
