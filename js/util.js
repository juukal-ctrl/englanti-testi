// Pienet apufunktiot. Ei sivuvaikutuksia tuonnissa, joten tiedosto toimii myös Node-testeissä.

export const ROLLOVER_HOUR = 4; // uusi opiskelupäivä alkaa klo 4

/** Päiväindeksi: paikallinen kalenteripäivä, jonka vaihtuminen siirretty klo 4:ään. */
export function dayIndex(ts = Date.now(), rolloverHour = ROLLOVER_HOUR) {
  const d = new Date(ts - rolloverHour * 3600000);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** Päiväindeksistä paikallinen Date (keskipäivä, jotta kesäaikasiirtymät eivät haittaa). */
export function dayToDate(idx) {
  const d = new Date(idx * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}

const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

export function fmtDay(idx, todayIdx = dayIndex()) {
  const diff = idx - todayIdx;
  if (diff === 0) return 'tänään';
  if (diff === 1) return 'huomenna';
  if (diff === -1) return 'eilen';
  const d = dayToDate(idx);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

export function fmtMinutes(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return min > 0 ? `${min} min ${String(sec).padStart(2, '0')} s` : `${sec} s`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministinen satunnaislukugeneraattori testeihin (mulberry32). */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

export function pct(x) {
  return `${Math.round(x * 100)} %`;
}

const DIRECT_ATTRS = /^(aria-|data-)|^(role|for|lang|inputmode|autocomplete|enterkeyhint|translate)$/;

/**
 * Luo DOM-elementin. Teksti lisätään aina tekstisolmuna (ei innerHTML:ää), joten sisältö ei voi
 * sisältää suoritettavaa koodia.
 *   h('button', { class: 'btn', on: { click: fn }, 'aria-label': 'x' }, 'Teksti')
 */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (DIRECT_ATTRS.test(k)) el.setAttribute(k, v === true ? '' : String(v));
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

/** Englanninkielinen tekstinpätkä kielimerkittynä (ruudunlukijat lukevat sen oikealla kielellä). */
export function en(text, tag = 'span', cls = '') {
  return h(tag, { lang: 'en-US', class: cls }, text);
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/**
 * Suodattaa tyhjät lapset pois ennen natiivia append()-kutsua. Natiivi append(null) kirjoittaisi sivulle
 * tekstin "null", toisin kuin h(), joka ohittaa tyhjät lapset itse.
 */
export const nodes = (...kids) => kids.flat(Infinity).filter((k) => k != null && k !== false);
