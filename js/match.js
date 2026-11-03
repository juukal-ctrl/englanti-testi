// Puheen ja kirjoitetun vastauksen täsmäys tavoitelauseeseen (sanatasolla).

// Tunnistin kirjoittaa usein lyhennetyn muodon eri tavalla kuin tavoite; molemmat hyväksytään samaksi.
const EXPAND = new Map([
  ["i'm", 'i am'], ["you're", 'you are'], ["we're", 'we are'], ["they're", 'they are'],
  ["i've", 'i have'], ["we've", 'we have'], ["you've", 'you have'], ["they've", 'they have'],
  ["i'll", 'i will'], ["we'll", 'we will'], ["you'll", 'you will'], ["they'll", 'they will'],
  ["i'd", 'i would'], ["we'd", 'we would'], ["you'd", 'you would'],
  ["it's", 'it is'], ["that's", 'that is'], ["there's", 'there is'], ["let's", 'let us'],
  ["don't", 'do not'], ["doesn't", 'does not'], ["didn't", 'did not'], ["haven't", 'have not'],
  ["hasn't", 'has not'], ["can't", 'cannot'], ["won't", 'will not'], ["wouldn't", 'would not'],
  ["couldn't", 'could not'], ["isn't", 'is not'], ["aren't", 'are not'], ["wasn't", 'was not'],
]);

/* ---------- Luvut ----------
 * Puheentunnistin kirjoittaa saman luvun eri tavoin ("3", "3rd", "third", "three"), ja tavoitelauseessa voi olla
 * numero ("October 3"), jonka oppija sanoo järjestyslukuna ("October third"). Siksi molemmat puolet muunnetaan
 * samaan muotoon: kaikki luvut, järjestysluvut ja numeroina kirjoitetut luvut ovat numerojonoja ("3", "25", "2021").
 * Täsmäys ei siis erota perus- ja järjestyslukua; se mittaa sanoja, ei päivämäärien kielioppia. */

const UNIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const ORD_UNIT_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const TENS_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD_TENS_WORDS = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];

// sana → { kind, v, ord }. kind: zero | unit (1–9) | teen (10–19) | tens (20–90) | hundred | scale
const NUMBER_WORDS = new Map();
UNIT_WORDS.forEach((w, v) => NUMBER_WORDS.set(w, { kind: v === 0 ? 'zero' : v < 10 ? 'unit' : 'teen', v, ord: false }));
ORD_UNIT_WORDS.forEach((w, v) => w && NUMBER_WORDS.set(w, { kind: v < 10 ? 'unit' : 'teen', v, ord: true }));
TENS_WORDS.forEach((w, i) => w && NUMBER_WORDS.set(w, { kind: 'tens', v: i * 10, ord: false }));
ORD_TENS_WORDS.forEach((w, i) => w && NUMBER_WORDS.set(w, { kind: 'tens', v: i * 10, ord: true }));
NUMBER_WORDS.set('hundred', { kind: 'hundred', v: 100, ord: false });
NUMBER_WORDS.set('hundredth', { kind: 'hundred', v: 100, ord: true });
NUMBER_WORDS.set('thousand', { kind: 'scale', v: 1000, ord: false });
NUMBER_WORDS.set('thousandth', { kind: 'scale', v: 1000, ord: true });
NUMBER_WORDS.set('million', { kind: 'scale', v: 1e6, ord: false });
NUMBER_WORDS.set('millionth', { kind: 'scale', v: 1e6, ord: true });

// Mikä sanatyyppi saa seurata mitäkin, jotta peräkkäiset luvut ("three twenty") eivät sulaudu yhdeksi.
const MAY_FOLLOW = {
  start: new Set(['unit', 'teen', 'tens']),
  unit: new Set(['hundred', 'scale']),
  teen: new Set(['hundred', 'scale']),
  tens: new Set(['unit', 'scale']),
  hundred: new Set(['unit', 'teen', 'tens', 'scale']),
  scale: new Set(['unit', 'teen', 'tens']),
};

/** Pisin kelvollinen lukusanojen jono kohdasta `from`: { value, len } tai null. */
function parseNumberRun(tokens, from) {
  const first = NUMBER_WORDS.get(tokens[from]);
  if (!first) return null;
  if (first.kind === 'zero') return { value: 0, len: 1 };
  let total = 0;
  let current = 0;
  let last = 'start';
  let i = from;
  let len = 0;
  while (i < tokens.length) {
    let w = tokens[i];
    let info = NUMBER_WORDS.get(w);
    let skipped = 0;
    if (!info && w === 'and' && (last === 'hundred' || last === 'scale')) {
      // "one hundred and five": 'and' kuuluu lukuun vain, jos perässä on lukusana
      const after = NUMBER_WORDS.get(tokens[i + 1] ?? '');
      if (after && ['unit', 'teen', 'tens'].includes(after.kind)) {
        info = after;
        w = tokens[i + 1];
        skipped = 1;
      }
    }
    if (!info || info.kind === 'zero' || !MAY_FOLLOW[last].has(info.kind)) break;
    if (info.kind === 'hundred') current = (current || 1) * 100;
    else if (info.kind === 'scale') {
      total += (current || 1) * info.v;
      current = 0;
    } else current += info.v;
    last = info.kind;
    i += 1 + skipped;
    len = i - from;
    if (info.ord) break; // järjestysluku päättää luvun
  }
  return len ? { value: total + current, len } : null;
}

/** Muuntaa lukusanat, järjestysluvut ja numerot (3rd) numerojonoiksi sekä yhdistää puhutut vuosiluvut. */
function canonicalNumbers(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; ) {
    const ordinal = /^(\d+)(?:st|nd|rd|th)$/.exec(tokens[i]);
    if (ordinal) {
      out.push(String(Number(ordinal[1])));
      i++;
      continue;
    }
    const run = parseNumberRun(tokens, i);
    if (run) {
      out.push(String(run.value));
      i += run.len;
      continue;
    }
    out.push(/^\d+$/.test(tokens[i]) ? String(Number(tokens[i])) : tokens[i]);
    i++;
  }
  // "twenty twenty one" → 20 21 → 2021; "nineteen ninety nine" → 19 99 → 1999
  const merged = [];
  for (let i = 0; i < out.length; i++) {
    if ((out[i] === '19' || out[i] === '20') && /^\d{2}$/.test(out[i + 1] ?? '') && Number(out[i + 1]) >= 10) {
      merged.push(out[i] + out[i + 1]);
      i++;
    } else merged.push(out[i]);
  }
  return merged;
}

const CURRENCY = { $: 'dollars', '€': 'euros', '£': 'pounds' };

export function normalizeWords(text) {
  const prepared = String(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\b([ap])\.\s?m\b\.?/g, '$1m') // a.m. ja p.m.
    .replace(/([$€£])\s?(\d[\d,]*(?:\.\d+)?)/g, (_, cur, n) => ` ${n} ${CURRENCY[cur]} `)
    .replace(/\d{1,3}(?:,\d{3})+(?!\d)/g, (m) => m.replace(/,/g, '')) // 1,250 → 1250
    .replace(/%/g, ' percent ')
    .replace(/(\d):(\d{2})\b/g, '$1 $2') // 10:30 → 10 30
    .replace(/(\d)\.(\d)/g, '$1 point $2');
  const base = prepared
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
  const out = [];
  for (const w of base) {
    const expanded = EXPAND.get(w);
    if (expanded) out.push(...expanded.split(' '));
    else out.push(w);
  }
  return canonicalNumbers(out);
}

/** Levenshtein-etäisyys sanalistojen välillä. */
export function wordDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Kohdistaa kuullun tekstin tavoitteeseen. Palauttaa tavoitesanat tilatietoineen
 * ({ word, status: 'ok' | 'wrong' | 'missing', heard? }) sekä ylimääräiset sanat.
 */
export function alignWords(ref, hyp) {
  const m = ref.length;
  const n = hyp.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const words = [];
  const extra = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      const same = ref[i - 1] === hyp[j - 1];
      words.push({ word: ref[i - 1], status: same ? 'ok' : 'wrong', heard: same ? undefined : hyp[j - 1] });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      words.push({ word: ref[i - 1], status: 'missing' });
      i--;
    } else {
      extra.push(hyp[j - 1]);
      j--;
    }
  }
  return { words: words.reverse(), extra: extra.reverse() };
}

export function compareSpeech(expected, heard) {
  const ref = normalizeWords(expected);
  const hyp = normalizeWords(heard);
  const distance = wordDistance(ref, hyp);
  const wer = ref.length ? distance / ref.length : hyp.length ? 1 : 0;
  const matchPct = Math.max(0, Math.round((1 - wer) * 100));
  return { ref, hyp, distance, wer, matchPct, ...alignWords(ref, hyp) };
}

/**
 * Tavoitelauseen sanat alkuperäisessä kirjoitusasussa (isot kirjaimet, supistukset, välimerkit) sekä se,
 * montako vertailusanaa kukin tuottaa. Näytetään tuloksessa, jotta lause näkyy tutussa muodossa
 * ("I'm writing", ei "i am writing").
 */
export function displayTokens(phrase) {
  const cleaned = String(phrase ?? '').replace(/…-ing/g, '…');
  const out = [];
  for (const raw of cleaned.split(/\s+/).filter(Boolean)) {
    const norm = normalizeWords(raw.replace(/…/g, ' '));
    if (norm.length) out.push({ raw: raw.replace(/…/g, ''), n: norm.length });
  }
  return out;
}

/**
 * Vertaa sanottua tai kirjoitettua ilmaukseen, jossa voi olla aukkoja (…). Ylimääräisiä sanoja ei rangaista,
 * koska oppija täyttää aukon omalla sisällöllään. Pisteet = oikeiden tavoitesanojen osuus.
 */
export function compareToPhrase(phrase, heard) {
  const cleaned = String(phrase ?? '').replace(/…-ing/g, '…').replace(/…/g, ' ');
  const ref = normalizeWords(cleaned);
  const hyp = normalizeWords(heard);
  const { words, extra } = alignWords(ref, hyp);
  const ok = words.filter((w) => w.status === 'ok').length;
  const display = displayTokens(phrase);
  return {
    ref,
    hyp,
    words,
    extra,
    display: display.reduce((n, d) => n + d.n, 0) === ref.length ? display : null,
    matchPct: ref.length ? Math.round((100 * ok) / ref.length) : 0,
  };
}

/** Ehdotettu arvosana (1–4) täsmäysprosentista. Oppija voi aina muuttaa sitä. */
export function suggestRating(matchPct) {
  if (matchPct >= 95) return 3;
  if (matchPct >= 75) return 2;
  return 1;
}
