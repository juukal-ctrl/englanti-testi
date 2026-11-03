// Paikallinen tallennus: IndexedDB, ja muistissa toimiva varmistus, jos IndexedDB ei ole käytettävissä.
// Mitään ei lähetetä verkkoon. Varmuuskopio on tavallinen JSON-tiedosto.

import { sanitizeSettings } from './settings.js';

const DB_NAME = 'englanti-app';
const DB_VERSION = 1;
export const BACKUP_APP = 'englanti-testi';
export const BACKUP_SCHEMA = 1;
const MAX_CARDS = 20000;
const MAX_REVIEWS = 500000;

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('Tallennus keskeytyi'));
});

/* ---------- Varmuuskopion tarkistus (puhdas funktio) ---------- */

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const intOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;

export function cleanCard(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !ID_RE.test(c.id)) return null;
  const state = Math.round(num(c.state, 0));
  if (state < 0 || state > 3) return null;
  return {
    id: c.id,
    state,
    stability: Math.max(0, num(c.stability)),
    difficulty: Math.min(10, Math.max(0, num(c.difficulty))),
    dueDay: intOrNull(c.dueDay),
    lastDay: intOrNull(c.lastDay),
    lastReview: intOrNull(c.lastReview),
    reps: Math.max(0, Math.round(num(c.reps))),
    lapses: Math.max(0, Math.round(num(c.lapses))),
    scheduledDays: Math.max(0, Math.round(num(c.scheduledDays))),
    introducedDay: intOrNull(c.introducedDay),
  };
}

export function cleanReview(r) {
  if (!r || typeof r !== 'object' || typeof r.cardId !== 'string' || !ID_RE.test(r.cardId)) return null;
  const rating = Math.round(num(r.rating, 0));
  const ts = intOrNull(r.ts);
  if (rating < 1 || rating > 4 || ts === null) return null;
  return {
    cardId: r.cardId,
    ts,
    day: intOrNull(r.day),
    rating,
    mode: typeof r.mode === 'string' ? r.mode.slice(0, 20) : '',
    stateBefore: Math.round(num(r.stateBefore)),
    elapsedDays: Math.max(0, Math.round(num(r.elapsedDays))),
    intervalAfter: Math.max(0, Math.round(num(r.intervalAfter))),
    ms: Math.max(0, Math.round(num(r.ms))),
  };
}

/** Tarkistaa ja siivoaa varmuuskopion. Palauttaa { ok, errors, cards, reviews, settings }. */
export function validateBackup(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['Tiedosto ei ole varmuuskopio'] };
  if (data.app !== BACKUP_APP) errors.push('Tiedosto ei ole tämän sovelluksen varmuuskopio');
  if (typeof data.schema !== 'number' || data.schema > BACKUP_SCHEMA) errors.push('Varmuuskopio on uudemmasta versiosta kuin tämä sovellus');
  if (!Array.isArray(data.cards)) errors.push('Korttitiedot puuttuvat');
  if (data.reviews !== undefined && !Array.isArray(data.reviews)) errors.push('Kertaushistoria on virheellinen');
  if (Array.isArray(data.cards) && data.cards.length > MAX_CARDS) errors.push('Liian monta korttia');
  if (Array.isArray(data.reviews) && data.reviews.length > MAX_REVIEWS) errors.push('Liian monta kertaustapahtumaa');
  if (errors.length) return { ok: false, errors };

  const cards = [];
  const seen = new Set();
  let skippedCards = 0;
  for (const raw of data.cards) {
    const c = cleanCard(raw);
    if (!c || seen.has(c.id)) {
      skippedCards++;
      continue;
    }
    seen.add(c.id);
    cards.push(c);
  }
  const reviews = [];
  let skippedReviews = 0;
  for (const raw of data.reviews ?? []) {
    const r = cleanReview(raw);
    if (r) reviews.push(r);
    else skippedReviews++;
  }
  return {
    ok: true,
    errors: [],
    cards,
    reviews,
    settings: sanitizeSettings(data.settings),
    skippedCards,
    skippedReviews,
  };
}

/** Yhdistää kaksi korttia: voittaa se, jota on kerrattu uudemmin (tai useammin). */
export function mergeCard(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = a.lastReview ?? -1;
  const tb = b.lastReview ?? -1;
  if (ta !== tb) return ta > tb ? a : b;
  return a.reps >= b.reps ? a : b;
}

/* ---------- Muistissa toimiva toteutus ---------- */

function memoryBackend(reason = null) {
  const cards = new Map();
  let reviews = [];
  const kv = new Map();
  return {
    kind: 'memory',
    reason,
    async getAllCards() {
      return [...cards.values()].map((c) => ({ ...c }));
    },
    async putCard(card) {
      cards.set(card.id, { ...card });
    },
    async putCards(list) {
      for (const c of list) cards.set(c.id, { ...c });
    },
    async addReview(rec) {
      reviews.push({ ...rec });
    },
    async getAllReviews() {
      return reviews.map((r) => ({ ...r }));
    },
    async getKv(key, fallback = null) {
      return kv.has(key) ? structuredClone(kv.get(key)) : fallback;
    },
    async setKv(key, value) {
      kv.set(key, structuredClone(value));
    },
    async replaceAll({ cards: newCards, reviews: newReviews, kv: newKv }) {
      cards.clear();
      for (const c of newCards) cards.set(c.id, { ...c });
      reviews = newReviews.map((r) => ({ ...r }));
      kv.clear();
      for (const [k, v] of Object.entries(newKv ?? {})) kv.set(k, structuredClone(v));
    },
    async clearAll() {
      cards.clear();
      reviews = [];
      kv.clear();
    },
    async estimate() {
      return { cards: cards.size, reviews: reviews.length };
    },
  };
}

/* ---------- IndexedDB-toteutus ---------- */

function openIdb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reviews')) {
        const s = db.createObjectStore('reviews', { keyPath: 'seq', autoIncrement: true });
        s.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Tietokanta on lukittu toisessa välilehdessä'));
  });
}

function idbBackend(db) {
  const stripSeq = ({ seq: _seq, ...rest }) => rest;
  return {
    kind: 'idb',
    reason: null,
    async getAllCards() {
      return req(db.transaction('cards').objectStore('cards').getAll());
    },
    async putCard(card) {
      const tx = db.transaction('cards', 'readwrite');
      tx.objectStore('cards').put(card);
      return done(tx);
    },
    async putCards(list) {
      const tx = db.transaction('cards', 'readwrite');
      for (const c of list) tx.objectStore('cards').put(c);
      return done(tx);
    },
    async addReview(rec) {
      const tx = db.transaction('reviews', 'readwrite');
      tx.objectStore('reviews').add(rec);
      return done(tx);
    },
    async getAllReviews() {
      return (await req(db.transaction('reviews').objectStore('reviews').getAll())).map(stripSeq);
    },
    async getKv(key, fallback = null) {
      const v = await req(db.transaction('kv').objectStore('kv').get(key));
      return v === undefined ? fallback : v;
    },
    async setKv(key, value) {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      return done(tx);
    },
    async replaceAll({ cards, reviews, kv }) {
      const tx = db.transaction(['cards', 'reviews', 'kv'], 'readwrite');
      tx.objectStore('cards').clear();
      tx.objectStore('reviews').clear();
      tx.objectStore('kv').clear();
      for (const c of cards) tx.objectStore('cards').put(c);
      for (const r of reviews) tx.objectStore('reviews').add(r);
      for (const [k, v] of Object.entries(kv ?? {})) tx.objectStore('kv').put(v, k);
      return done(tx);
    },
    async clearAll() {
      const tx = db.transaction(['cards', 'reviews', 'kv'], 'readwrite');
      for (const name of ['cards', 'reviews', 'kv']) tx.objectStore(name).clear();
      return done(tx);
    },
    async estimate() {
      const cards = await req(db.transaction('cards').objectStore('cards').count());
      const reviews = await req(db.transaction('reviews').objectStore('reviews').count());
      return { cards, reviews };
    },
  };
}

export async function openDb({ memory = false } = {}) {
  if (memory || typeof indexedDB === 'undefined') return memoryBackend(memory ? 'pyydetty' : 'ei IndexedDB:tä');
  try {
    return idbBackend(await openIdb());
  } catch (e) {
    return memoryBackend(e?.message || String(e));
  }
}

/* ---------- Vienti ja tuonti ---------- */

export async function exportBackup(db, now = Date.now()) {
  const [cards, reviews, settings] = await Promise.all([db.getAllCards(), db.getAllReviews(), db.getKv('settings', null)]);
  return {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt: new Date(now).toISOString(),
    note: 'Tämä tiedosto sisältää vain oppimisdatasi ja asetukset. API-avaimia ei viedä.',
    settings: sanitizeSettings(settings),
    cards,
    reviews,
  };
}

/**
 * Tuo varmuuskopion. mode 'replace' korvaa kaiken; 'merge' yhdistää (kortista voittaa uudempi, kertaushistoriasta
 * lisätään vain puuttuvat). Palauttaa yhteenvedon.
 */
export async function importBackup(db, data, { mode = 'replace' } = {}) {
  const v = validateBackup(data);
  if (!v.ok) throw new Error(v.errors.join('. '));
  if (mode === 'replace') {
    await db.replaceAll({ cards: v.cards, reviews: v.reviews, kv: { settings: v.settings } });
    return { cards: v.cards.length, reviews: v.reviews.length, skipped: v.skippedCards + v.skippedReviews };
  }
  const [curCards, curReviews, curSettings] = await Promise.all([db.getAllCards(), db.getAllReviews(), db.getKv('settings', null)]);
  const byId = new Map(curCards.map((c) => [c.id, c]));
  for (const c of v.cards) byId.set(c.id, mergeCard(byId.get(c.id), c));
  const key = (r) => `${r.cardId}|${r.ts}`;
  const have = new Set(curReviews.map(key));
  const added = v.reviews.filter((r) => !have.has(key(r)));
  await db.replaceAll({
    cards: [...byId.values()],
    reviews: [...curReviews, ...added],
    kv: { settings: curSettings ? sanitizeSettings(curSettings) : v.settings },
  });
  return { cards: byId.size, reviews: curReviews.length + added.length, skipped: v.skippedCards + v.skippedReviews };
}
