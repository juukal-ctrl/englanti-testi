// Kirjoitustehtävien tarkistus ja apufunktiot (puhdas moduuli, ei selainriippuvuuksia).
// Sääntöpohjainen tarkistus toimii heti ja ilman verkkoa. Se löytää tyypillisiä virheitä, mutta ei arvioi tekstin
// sujuvuutta kokonaisuutena: siihen on valinnainen tekoälypalaute.

import { normalizeWords } from './match.js';
import { getItem } from './content.js';
import { RULES, CATEGORY_LABELS, capLike } from './writing-rules.js';

export { CATEGORY_LABELS };

export const FORMATS = ['email', 'chat', 'message'];
export const MAX_SHOWN_PER_RULE = 2;

/** Sanojen määrä: kirjain- tai numerojonot, joissa saa olla heittomerkki, piste ja yhdysmerkki ("I'm", "e-mail"). */
export function countWords(text) {
  return (String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;
}

/** Selaimen ja näppäimistön erikoismerkit tavallisiksi niin, että merkkien paikat säilyvät (1 merkki → 1 merkki). */
export function probeText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[   ]/g, ' ');
}

/* ---------- Ilmausten tunnistus ---------- */

function indexOfSeq(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** Ilmauksen kiinteät osat (aukkomerkit … poistettu) sanalistoina. */
function phraseSegments(en) {
  return String(en)
    .split(/…-ing|…/)
    .map((part) => normalizeWords(part))
    .filter((seg) => seg.length > 0);
}

/** Pisin kiinteä osa, jonka perusteella ilmauksen käyttö tunnistetaan; null, jos se on liian lyhyt. */
export function phraseKey(en) {
  const segs = phraseSegments(en);
  if (!segs.length) return null;
  const key = segs.reduce((a, b) => (b.length > a.length ? b : a));
  return key.length >= 2 ? key : null;
}

/** Käyttikö teksti ilmauksen? override on valinnainen säännöllinen lauseke (tehtävässä), kun ilmaus vaihtelee. */
export function phraseUsed(text, en, override = null) {
  if (override) return /** @type {RegExp} */ (safeRegExp(override))?.test(probeText(text)) ?? false;
  const key = phraseKey(en);
  if (!key) return false;
  return indexOfSeq(normalizeWords(text), key) >= 0;
}

/* ---------- Lauseet (ääntä varten) ---------- */

const PROTECTED = /\b(?:Ms|Mr|Mrs|Dr|Inc|Ltd|vs|etc)\.|\b[ap]\.m\.|\be\.g\.|\bi\.e\./g;

/**
 * Mallivastauksen tai saapuneen viestin lauseet luettavassa järjestyksessä. Sama jako on äänileikkeiden luettelossa
 * (tools/tts/texts.mjs), joten jokaiselle lauseelle on oma leike. Pelkkä allekirjoitusnimi jätetään lukematta.
 */
export function speechParts(paragraphs) {
  const out = [];
  const list = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  list.forEach((para, pi) => {
    const lines = String(para).split('\n').map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, li) => {
      const last = pi === list.length - 1 && li === lines.length - 1;
      if (last && li > 0 && /^[A-Z][a-z]+$/.test(line)) return; // allekirjoitus
      const guarded = line.replace(PROTECTED, (m) => m.replace(/\./g, '\u0001'));
      for (const piece of guarded.split(/(?<=[.!?])\s+/)) {
        const text = piece.replace(/\u0001/g, '.').trim();
        if (text) out.push(text);
      }
    });
  });
  return out;
}

/* ---------- Tarkistus ---------- */

/** Säännöllinen lauseke tehtävän datasta; virheellinen lauseke ei kaada tarkistusta (testit löytävät sen erikseen). */
function safeRegExp(source, flags = 'i') {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

const ABBREVIATIONS = new Set(['e.g', 'i.e', 'a.m', 'p.m', 'etc', 'vs', 'mr', 'mrs', 'ms', 'dr', 'inc', 'ltd', 'no', 'approx', 'fig', 'tel', 'ext', 'st', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);
const REPEAT_OK = new Set(['that', 'had', 'bye', 'very', 'so', 'no', 'yes', 'ha', 'hi']);

function issue(rule, m, extra = {}) {
  let quote = m[0];
  let start = m.index;
  const fi = typeof rule.fi === 'function' ? rule.fi(m) : rule.fi;
  let fix = typeof rule.fix === 'function' ? rule.fix(m) : rule.fix;
  // Lainaus ja korostus eivät saa sisältää ylimääräisiä välilyöntejä reunoilla (ehdotuksen reunat siistitään samoin).
  const lead = quote.length - quote.trimStart().length;
  const trail = quote.length - quote.trimEnd().length;
  if (lead || trail) {
    quote = quote.trim();
    start += lead;
    if (typeof fix === 'string') {
      if (lead) fix = fix.trimStart();
      if (trail) fix = fix.trimEnd();
    }
  }
  return { id: rule.id, cat: rule.cat, sev: rule.sev, start, end: start + quote.length, quote, fi, fix: fix ?? null, ...extra };
}

function ruleIssues(task, probe) {
  const found = [];
  for (const rule of RULES) {
    if (rule.tone && task?.tone !== 'polite') continue;
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
    let count = 0;
    let m;
    while ((m = re.exec(probe))) {
      if (m[0] === '') {
        re.lastIndex++;
        continue;
      }
      if (rule.skip?.(m, probe)) continue;
      if (count++ < MAX_SHOWN_PER_RULE) found.push(issue(rule, m));
    }
  }
  return found;
}

const A_SKIP = new Set(['and', 'or', 'if', 'is', 'it', 'its', 'in', 'on', 'at', 'as', 'of', 'are', 'i', 'up', 'us', 'an', 'a', 'am', 'ago']);

/** a/an: valitaan äänteen mukaan. Lyhenteet (SQL, FAQ) ja epäselvät tapaukset ohitetaan. */
function articleIssues(probe) {
  const out = [];
  const re = /\b(a|an)\s+([A-Za-z0-9][A-Za-z0-9'-]*)/gi;
  let m;
  while ((m = re.exec(probe))) {
    const word = m[2];
    const lower = word.toLowerCase();
    if (A_SKIP.has(lower) || (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word))) continue;
    let vowelSound;
    if (/^\d/.test(word)) vowelSound = /^(?:8|11$|11[^0-9]|18)/.test(word);
    else if (/^(?:hour|honest|honor|honour|heir)/.test(lower)) vowelSound = true;
    else if (/^(?:uni|use|usu|uti|eu|ewe|one|once|ubiq)/.test(lower)) vowelSound = false;
    else vowelSound = /^[aeiou]/.test(lower);
    const used = m[1].toLowerCase();
    const expected = vowelSound ? 'an' : 'a';
    if (used === expected) continue;
    out.push({
      id: 'a-an', cat: 'article', sev: 'error', start: m.index, end: m.index + m[0].length,
      quote: m[0], fi: `Ennen sanaa ”${word}” tulee ”${expected}”, koska valinta riippuu seuraavan sanan ensimmäisestä äänteestä.`, fix: `${capLike(m[1], expected)} ${word}`,
    });
  }
  return out;
}

function repeatIssues(probe) {
  const out = [];
  const re = /\b([A-Za-z']+)\s+\1\b/gi;
  let m;
  while ((m = re.exec(probe))) {
    if (REPEAT_OK.has(m[1].toLowerCase())) continue;
    out.push({ id: 'repeat-word', cat: 'caps', sev: 'error', start: m.index, end: m.index + m[0].length, quote: m[0], fi: 'Sana on kirjoitettu kahdesti peräkkäin.', fix: m[1] });
  }
  return out;
}

/** Lause tai rivi alkaa pienellä kirjaimella. Lyhenteet, sähköpostiosoitteet ja linkit ohitetaan. */
function sentenceCaseIssues(probe) {
  const out = [];
  const add = (token, index) => {
    if (/[@/]/.test(token) || /\w\.\w/.test(token) || /^(?:www|http|i)\b/i.test(token) || /^i'/.test(token)) return;
    const word = token.replace(/[^A-Za-z'].*$/, '');
    if (!word) return;
    out.push({ id: 'sentence-case', cat: 'caps', sev: 'error', start: index, end: index + word.length, quote: word, fi: 'Lause alkaa isolla kirjaimella.', fix: capLike('A', word) });
  };
  for (const m of probe.matchAll(/(^|\n)[ \t]*([a-z]\S*)/g)) add(m[2], m.index + m[0].length - m[2].length);
  for (const m of probe.matchAll(/([A-Za-z0-9.]*)([.!?])[ \t]+([a-z]\S*)/g)) {
    const stem = m[1].toLowerCase().replace(/^\.+|\.+$/g, ''); // "p.m", "e.g", "ms"
    if (stem.length <= 1 || ABBREVIATIONS.has(stem) || /^\d+(?:\.\d+)*$/.test(stem)) continue; // lyhenne tai luku/päivämäärä (1.11.)
    add(m[3], m.index + m[0].length - m[3].length);
  }
  return out;
}

const IMPERATIVES = new Set(['send', 'give', 'tell', 'pay', 'provide', 'reply', 'answer', 'call', 'fix', 'confirm', 'update', 'forward', 'share', 'bring', 'finish', 'prepare', 'write', 'explain', 'submit', 'return']);

/** Kohteliaissa tehtävissä: pyyntö, joka alkaa suoraan käskyllä ilman "please"-sanaa. */
function imperativeIssues(probe) {
  const out = [];
  for (const m of probe.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const raw = m[0];
    const sentence = raw.trim();
    if (!sentence || /\?\s*$/.test(sentence)) continue;
    const words = sentence.split(/\s+/);
    if (words.length > 14 || /\bplease\b/i.test(sentence)) continue;
    if (!IMPERATIVES.has(words[0].toLowerCase().replace(/[^a-z]/g, ''))) continue;
    const start = m.index + raw.indexOf(sentence);
    const quote = words.slice(0, 4).join(' ');
    out.push({
      id: 'imperative', cat: 'register', sev: 'tip', start, end: start + quote.length, quote,
      fi: 'Käskylause kuulostaa vaativalta. Lisää ”please” tai muotoile pyyntö kysymykseksi: Could you …?', fix: null,
    });
  }
  return out;
}

/** Poistaa päällekkäiset huomautukset: virheet ennen vinkkejä, pidempi ennen lyhyempää. Tulos on tekstijärjestyksessä. */
function resolveOverlaps(list) {
  const ranked = [...list].sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'error' ? -1 : 1) || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept = [];
  for (const it of ranked) {
    if (!kept.some((k) => it.start < k.end && k.start < it.end)) kept.push(it);
  }
  return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}

const GREETING = /^\s*(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|greetings)\b/i;
const CLOSING = /\b(?:regards|sincerely|best|thanks|thank you|cheers|talk soon|speak soon|take care|warmly|all the best|respectfully|many thanks|looking forward)\b/i;

function structureOf(task, probe) {
  const format = task?.format ?? 'email';
  const greeting = format === 'chat' ? null : GREETING.test(probe);
  let closing = null;
  if (format === 'email') {
    const lines = probe.split('\n').map((l) => l.trim()).filter(Boolean).slice(-3);
    closing = lines.some((l) => l.split(/\s+/).length <= 8 && CLOSING.test(l));
  }
  return { greeting, closing };
}

/**
 * Tarkistaa kirjoitetun tekstin tehtävää vasten. Palauttaa:
 *   words, length ('short' | 'ok' | 'long'), issues (tekstijärjestyksessä), points, phrases, structure, counts.
 * getItemFn voidaan korvata testeissä.
 */
export function checkWriting(task, text, { getItemFn = getItem } = {}) {
  const probe = probeText(text);
  const words = countWords(probe);
  const [min, max] = task?.words ?? [0, Infinity];
  const length = words < min ? 'short' : words > max ? 'long' : 'ok';
  const issues = resolveOverlaps([
    ...ruleIssues(task, probe),
    ...articleIssues(probe),
    ...repeatIssues(probe),
    ...sentenceCaseIssues(probe),
    ...(task?.tone === 'polite' ? imperativeIssues(probe) : []),
  ]);
  const points = (task?.points ?? []).map((p) => {
    const m = safeRegExp(p.any.join('|'))?.exec(probe) ?? null;
    return { fi: p.fi, hit: Boolean(m), evidence: m ? m[0] : null };
  });
  const phrases = (task?.use ?? []).map((u) => {
    const { id, re } = typeof u === 'string' ? { id: u, re: null } : u;
    const item = getItemFn(id);
    return { id, en: item?.en ?? id, fi: item?.fi ?? '', used: item ? phraseUsed(probe, item.en, re) : false };
  });
  const structure = structureOf(task, probe);
  const errors = issues.filter((i) => i.sev === 'error').length;
  return {
    words,
    length,
    issues,
    points,
    phrases,
    structure,
    counts: { errors, tips: issues.length - errors, pointsHit: points.filter((p) => p.hit).length, pointsTotal: points.length, phrasesUsed: phrases.filter((p) => p.used).length, phrasesTotal: phrases.length },
  };
}

/** Onko tarkistuksessa mitään huomautettavaa? (sisältö, rakenne, pituus tai huomautukset) */
export function isClean(result) {
  return (
    result.issues.length === 0 &&
    result.length === 'ok' &&
    result.points.every((p) => p.hit) &&
    result.structure.greeting !== false &&
    result.structure.closing !== false
  );
}

/* ---------- Sisällön tarkistus (testit) ---------- */

const FIELD_ID = /^w-[a-z0-9-]{2,30}$/;

/** Tarkistaa tehtäväluettelon rakenteen ja sen, että jokainen mallivastaus läpäisee omat sääntönsä. Palauttaa virheilmoitukset. */
export function validateTasks(tasks, { unitIds, getItemFn = getItem } = {}) {
  const errors = [];
  const seen = new Set();
  for (const t of tasks) {
    const at = (msg) => errors.push(`${t?.id ?? '?'}: ${msg}`);
    if (!t || typeof t !== 'object') {
      errors.push('tehtävä ei ole olio');
      continue;
    }
    if (!FIELD_ID.test(t.id ?? '')) at('tunnisteen muoto on väärä (w-…)');
    if (seen.has(t.id)) at('tunniste on jo käytössä');
    seen.add(t.id);
    if (unitIds && !unitIds.includes(t.unit)) at(`aihetta ${t.unit} ei ole`);
    for (const key of ['title', 'scenario', 'tip']) if (typeof t[key] !== 'string' || t[key].trim().length < 5) at(`kenttä ${key} puuttuu`);
    if (!FORMATS.includes(t.format)) at(`format on virheellinen: ${t.format}`);
    if (!Array.isArray(t.words) || t.words.length !== 2 || !(Number.isInteger(t.words[0]) && Number.isInteger(t.words[1]) && t.words[0] >= 10 && t.words[0] < t.words[1] && t.words[1] <= 250)) at('words-vaihteluväli on virheellinen');
    if (t.incoming != null && !(typeof t.incoming.from === 'string' && typeof t.incoming.text === 'string' && t.incoming.text.length > 20)) at('incoming-viesti on puutteellinen');
    if (!Array.isArray(t.points) || t.points.length < 2 || t.points.length > 5) at('kohtia pitää olla 2–5');
    for (const p of t.points ?? []) {
      if (typeof p.fi !== 'string' || !Array.isArray(p.any) || !p.any.length) at('kohdalla pitää olla fi ja any');
      else
        for (const src of p.any) {
          try {
            new RegExp(src, 'i');
          } catch {
            at(`virheellinen lauseke: ${src}`);
          }
        }
    }
    if (!Array.isArray(t.use) || t.use.length < 2 || t.use.length > 4) at('käytettäviä ilmauksia pitää olla 2–4');
    for (const u of t.use ?? []) {
      const { id, re } = typeof u === 'string' ? { id: u, re: null } : u;
      const item = getItemFn(id);
      if (!item) at(`ilmausta ${id} ei ole`);
      else if (!re && !phraseKey(item.en)) at(`ilmausta ${id} ei voi tunnistaa tekstistä (lisää re)`);
      if (re) {
        try {
          new RegExp(re, 'i');
        } catch {
          at(`virheellinen re: ${re}`);
        }
      }
    }
    if (!Array.isArray(t.model) || !t.model.length || t.model.some((p) => typeof p !== 'string' || !p.trim())) {
      at('mallivastaus puuttuu');
      continue;
    }
    if (errors.some((e) => e.startsWith(`${t.id}: `) && /virheellinen (?:lauseke|re)/.test(e))) continue; // rikkinäisillä lausekkeilla ei voi tarkistaa mallia
    const all = [t.title, t.scenario, t.tip, t.incoming?.text, ...t.model].filter(Boolean).join('\n');
    if (/[—–]/.test(all)) at('sisältää ajatusviivan (käytä pilkkua, pistettä tai kaksoispistettä)');
    const model = t.model.join('\n\n');
    const res = checkWriting(t, model, { getItemFn });
    if (res.length !== 'ok') at(`mallivastauksen pituus (${res.words} sanaa) on vaihteluvälin ${t.words.join('–')} ulkopuolella`);
    for (const i of res.issues) at(`mallivastaus rikkoo säännön ${i.id}: ”${i.quote}”`);
    for (const p of res.points) if (!p.hit) at(`mallivastaus ei täytä kohtaa: ${p.fi}`);
    for (const p of res.phrases) if (!p.used) at(`mallivastaus ei käytä ilmausta ${p.id}: ${p.en}`);
    if (res.structure.greeting === false) at('mallivastauksesta puuttuu tervehdys');
    if (res.structure.closing === false) at('mallivastauksesta puuttuu päätös');
  }
  return errors;
}
