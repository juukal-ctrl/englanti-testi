// Puheen ja kirjoitetun vastauksen täsmäys tavoitelauseeseen (sanatasolla).

const NUM_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];

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

export function normalizeWords(text) {
  const base = String(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
  const out = [];
  for (const w of base) {
    const expanded = EXPAND.get(w);
    const parts = expanded ? expanded.split(' ') : [w];
    for (const p of parts) out.push(/^\d{1,2}$/.test(p) && Number(p) <= 20 ? NUM_WORDS[Number(p)] : p);
  }
  return out;
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
