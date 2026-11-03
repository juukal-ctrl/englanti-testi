// Esiäänitetyt äänileikkeet (Kokoro): manifestin lataus, haku, ennakkolataus ja toisto.
//
// Leikkeet generoidaan GitHub Actionsissa (tools/tts/generate.py) hakemistoon audio/. Manifesti kuvaa tekstin
// (sellaisena kuin speakable() sen palauttaa) leikkeen tunnisteeksi. Jos leike puuttuu tai sitä ei saada ladattua,
// speech.js lukee tekstin laitteen omalla äänellä, joten sovellus toimii myös ilman leikkeitä.

import { sleep, clamp } from './util.js';

/** Service workerin pysyvä äänivälimuisti. Nimi on sama kuin sw.js:ssä (testi varmistaa). */
export const AUDIO_CACHE = 'englanti-audio-v1';
/** Asetusten oletusnopeus: leikkeet toistetaan sillä alkuperäisellä nopeudellaan, muilla nopeuksilla suhteessa tähän. */
export const DEFAULT_RATE = 0.85;
/** Jos tekstille ei ole hidasta leiketta, normaali leike toistetaan näin hitaasti. */
export const SLOW_FALLBACK = 0.72;

const ROOT = new URL('../audio/', import.meta.url);
const MANIFEST_TIMEOUT_MS = 3000;
const HEX_ID = /^[0-9a-f]{8,40}$/;

/* ---------- Manifesti ---------- */

/** Tarkistaa manifestin muodon. Palauttaa { voice, engine, bytes, normal: Map, slow: Map } tai null. */
export function parseManifest(data) {
  if (!data || typeof data !== 'object' || data.version !== 1) return null;
  const clean = (obj) => {
    const out = new Map();
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [text, id] of Object.entries(obj)) if (typeof text === 'string' && text && typeof id === 'string' && HEX_ID.test(id)) out.set(text, id);
    }
    return out;
  };
  return {
    voice: typeof data.voice === 'string' ? data.voice : '',
    engine: typeof data.engine === 'string' ? data.engine : '',
    bytes: Number.isFinite(data.bytes) ? data.bytes : 0,
    normal: clean(data.normal),
    slow: clean(data.slow),
  };
}

/** Hakee tekstille leikkeen. Palauttaa { id, rate } (rate = lisähidastus) tai null. */
export function findClip(manifest, text, slow = false) {
  if (!manifest || !text) return null;
  if (slow) {
    const id = manifest.slow.get(text);
    if (id) return { id, rate: 1 };
    const fallback = manifest.normal.get(text);
    return fallback ? { id: fallback, rate: SLOW_FALLBACK } : null;
  }
  const id = manifest.normal.get(text);
  return id ? { id, rate: 1 } : null;
}

/** Asetusten puhenopeudesta leikkeen toistonopeus (1 = leikkeen oma nopeus). */
export function playbackRateFor(userRate) {
  const r = Number.isFinite(userRate) ? userRate : DEFAULT_RATE;
  return clamp(r / DEFAULT_RATE, 0.6, 1.5);
}

let manifest = null;
let manifestPromise = null;

/** Lataa manifestin kerran (uusi yritys 20 s kuluttua, jos lataus epäonnistui). */
export function loadManifest() {
  manifestPromise ??= (async () => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), MANIFEST_TIMEOUT_MS);
      try {
        const res = await fetch(new URL('manifest.json', ROOT), { cache: 'no-cache', signal: ctl.signal });
        if (res.ok) manifest = parseManifest(await res.json());
      } finally {
        clearTimeout(timer);
      }
    } catch {
      manifest = null;
    }
    if (!manifest) setTimeout(() => (manifestPromise = null), 20000);
    return manifest;
  })();
  return manifestPromise;
}

export const clipsAvailable = () => Boolean(manifest && manifest.normal.size + manifest.slow.size > 0);

/* ---------- Leikkeiden nouto ---------- */

const clipUrl = (id) => new URL(`${id}.ogg`, ROOT);
const blobUrls = new Map(); // tunniste → Promise<objectURL | null>

/** Hakee leikkeen ja palauttaa sille blob-osoitteen (muistiin, jotta toisto on heti valmis). null = ei saatu. */
function fetchClip(id) {
  let p = blobUrls.get(id);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(clipUrl(id));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'audio/ogg; codecs=opus' }));
      } catch {
        blobUrls.delete(id);
        return null;
      }
    })();
    blobUrls.set(id, p);
  }
  return p;
}

/** Hakee leikkeet valmiiksi, ennen kuin niitä tarvitaan (kutsutaan, kun harjoitus piirtyy). */
export async function warmClips(texts, { slow = false } = {}) {
  const m = await loadManifest();
  if (!m) return;
  for (const text of texts) {
    const found = findClip(m, text, slow);
    if (found) fetchClip(found.id);
  }
}

/** Lataa kaikki leikkeet laitteelle (service worker tallentaa ne). Palauttaa { done, total, failed }. */
export async function prefetchAll({ onProgress, signal } = {}) {
  const m = await loadManifest();
  if (!m) return { done: 0, total: 0, failed: 0 };
  const ids = [...new Set([...m.normal.values(), ...m.slow.values()])];
  let done = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < ids.length && !signal?.aborted) {
      const id = ids[next++];
      try {
        const res = await fetch(clipUrl(id), { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.arrayBuffer();
      } catch {
        failed++;
      }
      done++;
      onProgress?.({ done, total: ids.length, failed });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { done, total: ids.length, failed };
}

/** Yhteenveto asetussivulle: onko leikkeitä, kuinka monta, ja kuinka moni on jo tallennettu laitteelle. */
export async function clipSummary() {
  const m = await loadManifest();
  if (!m || m.normal.size + m.slow.size === 0) return { available: false, count: 0, cached: 0, bytes: 0, voice: '' };
  const ids = new Set([...m.normal.values(), ...m.slow.values()]);
  let cached = 0;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    for (const req of await cache.keys()) {
      const hit = /\/([0-9a-f]+)\.ogg$/.exec(req.url);
      if (hit && ids.has(hit[1])) cached++;
    }
  } catch {
    /* välimuisti ei ole käytettävissä */
  }
  return { available: true, count: ids.size, cached, bytes: m.bytes, voice: m.voice };
}

/* ---------- Toisto ---------- */

const stats = { played: [], missing: new Set(), failed: 0 };

/** Testejä ja virheenjäljitystä varten: toistetut leikkeet, puuttuvat tekstit ja epäonnistuneet haut. */
export function clipStats() {
  return { played: [...stats.played], missing: [...stats.missing], failed: stats.failed };
}

let current = null;

/** Pysäyttää käynnissä olevan leikkeen. */
export function stopClips() {
  const c = current;
  current = null;
  c?.stop();
}

function playUrl(url, { rate, onStart }) {
  return new Promise((resolve) => {
    const audio = new Audio();
    let started = false;
    let settled = false;
    let guard;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      if (current?.audio === audio) current = null;
      resolve({ started, ...value });
    };
    current = {
      audio,
      stop: () => {
        audio.pause();
        settle({ ok: true, kind: 'stopped' });
      },
    };
    audio.preload = 'auto';
    audio.defaultPlaybackRate = rate;
    audio.src = url;
    audio.playbackRate = rate;
    audio.preservesPitch = true;
    audio.addEventListener(
      'playing',
      () => {
        started = true;
        onStart?.();
      },
      { once: true },
    );
    audio.addEventListener('ended', () => settle({ ok: true, kind: 'end' }), { once: true });
    audio.addEventListener('error', () => settle({ ok: false, kind: 'error', error: `media-${audio.error?.code ?? '?'}` }), { once: true });
    guard = setTimeout(() => {
      audio.pause();
      settle({ ok: false, kind: 'timeout' });
    }, 45000);
    audio.play().catch((e) => settle({ ok: false, kind: 'error', error: e?.name ?? 'play-failed' }));
  });
}

/**
 * Toistaa tekstit peräkkäin leikkeinä. Palauttaa toiston tuloksen { ok, kind } tai null, jos leikkeitä ei voitu käyttää
 * (silloin kutsuja lukee tekstit laitteen äänellä). alive() kertoo, onko toisto yhä ajankohtainen.
 */
export async function playClips(parts, { slow = false, userRate = DEFAULT_RATE, pauseMs = 450, alive = () => true, onStart } = {}) {
  const m = await loadManifest();
  if (!alive()) return { ok: true, kind: 'stopped' };
  if (!m) return null;
  const found = parts.map((t) => findClip(m, t, slow));
  const absent = parts.filter((_, i) => !found[i]);
  if (absent.length) {
    for (const t of absent) if (stats.missing.size < 200) stats.missing.add(t);
    return null;
  }
  const urls = await Promise.all(found.map((f) => fetchClip(f.id)));
  if (!alive()) return { ok: true, kind: 'stopped' };
  if (urls.some((u) => !u)) {
    stats.failed++;
    return null;
  }
  const base = playbackRateFor(userRate);
  for (let i = 0; i < urls.length; i++) {
    if (!alive()) return { ok: true, kind: 'stopped' };
    const res = await playUrl(urls[i], {
      rate: clamp(base * found[i].rate, 0.5, 2),
      onStart: () => {
        if (stats.played.length < 500) stats.played.push(found[i].id);
        if (i === 0) onStart?.();
      },
    });
    if (!res.ok && i === 0 && !res.started) {
      stats.failed++;
      return null; // ensimmäinen leike ei käynnistynyt: kokeillaan laitteen ääntä
    }
    if (!res.ok || res.kind !== 'end') return { ok: res.ok, kind: res.kind, error: res.error };
    if (i < urls.length - 1) await sleep(pauseMs);
  }
  return { ok: true, kind: 'end' };
}
