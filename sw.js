// Englanti – service worker. Esivälimuistittaa koko sovelluskuoren, jotta sovellus toimii ilman verkkoa.
// Versio ja tiedostolista päivitetään komennolla `node tools/stamp.mjs` (testi varmistaa, että ne ovat ajan tasalla).

// <generated>
const VERSION = '995b7c3a1e';
const SHELL = [
  './',
  'css/app.css',
  'data/units.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'index.html',
  'js/app.js',
  'js/clips.js',
  'js/content.js',
  'js/db.js',
  'js/exercises.js',
  'js/fsrs.js',
  'js/match.js',
  'js/runner.js',
  'js/settings.js',
  'js/speakable.js',
  'js/speech.js',
  'js/srs.js',
  'js/stats.js',
  'js/ui.js',
  'js/util.js',
  'js/version.js',
  'js/views/lessons.js',
  'js/views/more.js',
  'js/views/progress.js',
  'js/views/review.js',
  'js/views/session.js',
  'js/views/settings.js',
  'js/views/speak.js',
  'js/views/today.js',
  'js/views/vocab.js',
  'manifest.webmanifest',
];
// </generated>

const CACHE = `englanti-${VERSION}`;
// Esiäänitetyt äänet (audio/) ovat omassa välimuistissaan, jotta ne säilyvät sovelluspäivityksissä. Nimi on sama kuin js/clips.js:ssä.
const AUDIO_CACHE = 'englanti-audio-v1';
// Vanhat välimuistit, jotka kuuluivat repon juuressa aiemmin olleelle laitetestille.
const LEGACY = ['laitetesti-v1'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Jokainen tiedosto haetaan versiokohtaisella kyselyparametrilla: GitHub Pagesin välimuisti voi muuten
      // tarjota vanhan kopion jopa kymmenen minuuttia julkaisun jälkeen. Tallennus tehdään puhtaalla osoitteella.
      await Promise.all(
        SHELL.map(async (url) => {
          const res = await fetch(new Request(`${url}${url.includes('?') ? '&' : '?'}v=${VERSION}`, { cache: 'reload' }));
          if (!res.ok) throw new Error(`${url}: ${res.status}`);
          await cache.put(url, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => (k.startsWith('englanti-') && k !== CACHE && k !== AUDIO_CACHE) || LEGACY.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Äänileikkeet: manifesti verkosta ensin (uudet leikkeet näkyvät heti, ilman verkkoa käytetään viimeksi haettua),
 * leikkeet itse välimuistista ensin, koska niiden nimi on tiiviste sisällöstä eikä muutu koskaan.
 */
async function audioResponse(req, url) {
  const cache = await caches.open(AUDIO_CACHE);
  if (url.pathname.endsWith('/manifest.json')) {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) await cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req)) ?? new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  }
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tekoälyrajapinnat ym. kulkevat suoraan verkkoon
  if (url.pathname.includes('/laitetesti/')) return; // laitetestillä on oma service workerinsa
  if (/\/audio\/[^/]+$/.test(url.pathname)) {
    event.respondWith(audioResponse(req, url));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = req.mode === 'navigate' ? './' : req;
      const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic' && /\/(js|css|data|icons)\//.test(url.pathname)) cache.put(req, res.clone());
        return res;
      } catch {
        if (req.mode === 'navigate') {
          const shell = await cache.match('./');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
    })(),
  );
});
