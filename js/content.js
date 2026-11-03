// Sisällön käyttö: luettelo, haku, seuraavat uudet ilmaukset ja tarkistukset.

import { UNITS, UNIT_ORDER } from '../data/units.js';
import { normalizeWords } from './match.js';
import { State } from './fsrs.js';

export const BLANK = '___';

export function buildCatalog(units = UNITS, order = UNIT_ORDER) {
  const byUnit = new Map(units.map((u) => [u.id, u]));
  const ordered = [...order.map((id) => byUnit.get(id)).filter(Boolean), ...units.filter((u) => !order.includes(u.id))];
  const items = [];
  const byId = new Map();
  ordered.forEach((u, unitIndex) => {
    u.items.forEach((it, index) => {
      const item = {
        ...it,
        unitId: u.id,
        unitIndex,
        index,
        seq: items.length,
        say: it.say ?? (it.en.includes('…') ? it.ex : it.en),
        cloze: it.cz ? { text: it.cz[0], answer: it.cz[1], distractors: it.cz[2] } : null,
      };
      items.push(item);
      byId.set(item.id, item);
    });
  });
  return { units: ordered, items, byId, unitById: (id) => byUnit.get(id) ?? null };
}

export const CATALOG = buildCatalog();

export function getItem(id) {
  return CATALOG.byId.get(id) ?? null;
}

/** Seuraavat `n` ilmausta opetusjärjestyksessä, joita ei ole vielä opittu. */
export function nextNewItems(isLearned, n, { unitId = null, catalog = CATALOG } = {}) {
  const out = [];
  for (const item of catalog.items) {
    if (out.length >= n) break;
    if (unitId && item.unitId !== unitId) continue;
    if (!isLearned(item.id)) out.push(item);
  }
  return out;
}

/** Yksikön edistyminen: kuinka moni ilmaus on opittu. */
export function unitProgress(unit, isLearned) {
  const total = unit.items.length;
  const learned = unit.items.filter((it) => isLearned(it.id)).length;
  return { total, learned };
}

/** Valitsee harjoitusmuodon ilmauksen ja kortin tilan mukaan. */
export function pickFormat(item, card) {
  const hasCloze = Boolean(item.cloze);
  const easy = hasCloze ? 'choose' : 'flip-rec';
  if (!card || card.state === State.New || card.state === State.Learning || card.state === State.Relearning) return easy;
  if (card.stability < 4) return easy;
  if (hasCloze && card.reps % 2 === 1) return 'choose';
  return 'flip-prod';
}

/* ---------- Sisällön tarkistus (ajetaan testeissä) ---------- */

const hasSubsequence = (hay, needle) => {
  if (!needle.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

export function validateUnits(units = UNITS, order = UNIT_ORDER) {
  const errors = [];
  const err = (id, msg) => errors.push(`${id}: ${msg}`);
  const unitIds = new Set();
  const itemIds = new Set();
  for (const u of units) {
    if (!/^[a-z]+$/.test(u.id)) err(u.id, 'yksikön tunnisteen tulee olla pieniä kirjaimia');
    if (unitIds.has(u.id)) err(u.id, 'yksikön tunniste on jo käytössä');
    unitIds.add(u.id);
    for (const key of ['title', 'situation', 'intro']) if (typeof u[key] !== 'string' || !u[key].trim()) err(u.id, `puuttuva kenttä ${key}`);
    if (!Array.isArray(u.items) || u.items.length < 5) err(u.id, 'yksikössä pitää olla vähintään 5 ilmausta');
    for (const [i, it] of (u.items ?? []).entries()) {
      const id = it.id ?? `${u.id}[${i}]`;
      if (!new RegExp(`^${u.id}-\\d{2}$`).test(it.id ?? '')) err(id, `tunnisteen muoto pitää olla ${u.id}-NN`);
      if (itemIds.has(it.id)) err(id, 'ilmauksen tunniste on jo käytössä');
      itemIds.add(it.id);
      for (const [key, max] of [['en', 120], ['fi', 160], ['ex', 200]]) {
        if (typeof it[key] !== 'string' || !it[key].trim()) err(id, `puuttuva kenttä ${key}`);
        else if (it[key].length > max) err(id, `${key} on liian pitkä (${it[key].length} > ${max})`);
      }
      if (it.note !== undefined && (typeof it.note !== 'string' || !it.note.trim() || it.note.length > 360)) err(id, 'note puuttuu tai on liian pitkä');
      for (const key of ['en', 'ex', 'say']) {
        const v = it[key];
        if (typeof v !== 'string') continue;
        if (/[—–’‘“”]/.test(v)) err(id, `${key} sisältää ajatusviivan tai kaarevan lainausmerkin (äänentoisto lukee ne huonosti)`);
        if (/\s{2,}|^\s|\s$/.test(v)) err(id, `${key}: ylimääräisiä välilyöntejä`);
      }
      if (typeof it.en === 'string' && it.en.includes('…') && typeof it.ex === 'string') {
        // Aukkoa sisältävän ilmauksen esimerkin tulee sisältää ilmauksen alku.
        const head = normalizeWords(it.en.split('…')[0]);
        if (head.length >= 2 && !hasSubsequence(normalizeWords(it.ex), head)) err(id, 'esimerkkilause ei sisällä ilmauksen alkua');
      }
      if (it.cz !== undefined) {
        const [text, answer, distractors] = it.cz;
        if (typeof text !== 'string' || text.split(BLANK).length !== 2) err(id, `aukkotehtävässä pitää olla täsmälleen yksi ${BLANK}`);
        if (typeof answer !== 'string' || !answer.trim()) err(id, 'aukkotehtävän vastaus puuttuu');
        if (!Array.isArray(distractors) || distractors.length < 2 || distractors.length > 3) err(id, 'väärien vaihtoehtojen määrä pitää olla 2–3');
        else {
          const all = [answer, ...distractors].map((s) => String(s).toLowerCase());
          if (new Set(all).size !== all.length) err(id, 'aukkotehtävän vaihtoehdot eivät ole yksilöllisiä');
        }
        if (typeof text === 'string' && typeof answer === 'string' && text.split(BLANK).length === 2) {
          const filled = normalizeWords(text.replace(BLANK, answer));
          const inEn = hasSubsequence(normalizeWords(it.en), filled);
          const inEx = hasSubsequence(normalizeWords(it.ex), filled);
          if (!inEn && !inEx) err(id, 'täytetty aukkolause ei esiinny ilmauksessa (en) eikä esimerkissä (ex)');
        }
      }
    }
  }
  for (const id of order) if (!unitIds.has(id)) err(id, 'UNIT_ORDER viittaa tuntemattomaan yksikköön');
  for (const u of units) if (!order.includes(u.id)) err(u.id, 'yksikkö puuttuu UNIT_ORDER-listasta');
  return errors;
}
