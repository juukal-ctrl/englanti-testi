// lib.js – puhtaat apufunktiot ilman DOMia. Testataan Nodella: tests/lib.test.mjs

export const VERSION = '1';
export const TEST_ORDER = ['env', 'tts', 'asr', 'mic', 'offline', 'storage', 'ai'];

export const MODEL_DEFAULTS = { anthropic: 'claude-haiku-5-5', gemini: 'gemini-3.5-flash-lite' };
export const PROVIDER_LABEL = { anthropic: 'Claude (Anthropic)', gemini: 'Gemini (Google)' };
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models?limit=100';
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/* ---------- Testisisällöt ---------- */

export const TTS_SENTENCE = 'Would you like to meet on Thursday, or is Friday better for you?';

export const ASR_SENTENCES = [
  { id: 'ptk', text: 'Please pick up the paper from the post office.', focus: 'p, t, k' },
  { id: 'th', text: 'Thank you for the three thick files.', focus: 'th' },
  { id: 'vw', text: 'We have a very good view of the vineyard.', focus: 'v ja w' },
  { id: 'sh', text: 'She should share the shift schedule with Sam.', focus: 'sh ja s' },
  { id: 'work', text: 'I would like to schedule a meeting for Thursday afternoon.', focus: 'työviesti' },
];

export const FEEDBACK_SYSTEM = [
  'You are an American English writing coach for an adult Finnish learner at B2+ level who wants fluent professional communication.',
  'Reply with one JSON object only: no prose before or after, no code fences.',
  'Schema: {"corrected": string, "issues": [{"quote": string, "category": "article"|"preposition"|"word-choice"|"grammar"|"register"|"spelling"|"other", "explanation_fi": string}], "tip_fi": string}.',
  'Use American spelling and idioms in "corrected". Write every explanation in Finnish, one or two short sentences each. If the text has no errors, return an empty issues array.',
].join(' ');

export const FEEDBACK_USER =
  'Check this sentence from a work email: "I am writing to inform that the meeting is moved to next thursday, because we have not enough time to prepare the documents."';

/* ---------- Muotoilu ---------- */

export function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '–';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return '–';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1).replace('.', ',')} kB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1073741824).toFixed(2).replace('.', ',')} GB`;
}

export function describeAvailability(value) {
  const map = {
    available: 'käytettävissä',
    downloadable: 'ladattavissa',
    downloading: 'latautuu',
    unavailable: 'ei saatavilla',
  };
  return map[value] ?? String(value);
}

/* ---------- Puheentunnistuksen täsmäys ---------- */

const NUM_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];

export function normalizeWords(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
    .map((w) => (/^\d{1,2}$/.test(w) && Number(w) <= 20 ? NUM_WORDS[Number(w)] : w));
}

export function wordDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

export function compareSpeech(expected, heard) {
  const ref = normalizeWords(expected);
  const hyp = normalizeWords(heard);
  const distance = wordDistance(ref, hyp);
  const wer = ref.length ? distance / ref.length : hyp.length ? 1 : 0;
  return { ref, hyp, distance, wer, matchPct: Math.max(0, Math.round((1 - wer) * 100)) };
}

/* ---------- Puhesynteesi ---------- */

export function summarizeVoices(voices) {
  const list = Array.from(voices ?? []);
  const lang = (v) => String(v.lang || '').replace('_', '-');
  const en = list.filter((v) => /^en(-|$)/i.test(lang(v)));
  const enUS = en.filter((v) => lang(v).toLowerCase() === 'en-us');
  return {
    total: list.length,
    en: en.length,
    enUS: enUS.length,
    enUSLocal: enUS.filter((v) => v.localService).length,
    enUSNetwork: enUS.filter((v) => !v.localService).length,
  };
}

export function ttsStatus(sum) {
  if (!sum || sum.total === 0) return { status: 'fail', summary: 'Laitteella ei ole yhtään puheääntä' };
  if (sum.enUSLocal > 0) return { status: 'ok', summary: `${sum.enUSLocal} paikallista en-US-ääntä` };
  if (sum.enUS > 0) return { status: 'warn', summary: `en-US-äänet vaativat verkon (${sum.enUSNetwork})` };
  if (sum.en > 0) return { status: 'warn', summary: `Vain muita englannin ääniä (${sum.en}), ei en-US` };
  return { status: 'fail', summary: 'Englannin ääniä ei löytynyt' };
}

/* ---------- Tekoälykutsut ---------- */

export function normalizeModel(value) {
  return String(value ?? '').trim().replace(/^models\//, '');
}

export function buildAnthropicRequest({ apiKey, model, system, user, maxTokens = 600 }) {
  if (!MODEL_RE.test(model)) throw new Error('Virheellinen mallin nimi');
  return {
    url: ANTHROPIC_URL,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    },
  };
}

export function buildGeminiRequest({ apiKey, model, system, user, maxTokens = 1024 }) {
  if (!MODEL_RE.test(model)) throw new Error('Virheellinen mallin nimi');
  return {
    url: `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      }),
    },
  };
}

export function parseAnthropicResponse(json) {
  const text = Array.isArray(json?.content)
    ? json.content.filter((b) => b?.type === 'text').map((b) => b.text).join('')
    : '';
  return {
    text,
    model: json?.model ?? null,
    stop: json?.stop_reason ?? null,
    usage: { input: json?.usage?.input_tokens ?? null, output: json?.usage?.output_tokens ?? null },
  };
}

export function parseGeminiResponse(json) {
  const cand = json?.candidates?.[0];
  const parts = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
  const text = parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('');
  return {
    text,
    model: json?.modelVersion ?? null,
    stop: cand?.finishReason ?? json?.promptFeedback?.blockReason ?? null,
    usage: {
      input: json?.usageMetadata?.promptTokenCount ?? null,
      output: json?.usageMetadata?.candidatesTokenCount ?? null,
    },
  };
}

export function parseJsonLoose(text) {
  const raw = String(text ?? '').trim();
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch (first) {
    const a = stripped.indexOf('{');
    const b = stripped.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return { ok: true, value: JSON.parse(stripped.slice(a, b + 1)) };
      } catch {
        /* putoaa alla virheeseen */
      }
    }
    return { ok: false, error: String(first?.message ?? first) };
  }
}

export function validateFeedback(value) {
  const problems = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, problems: ['vastaus ei ole objekti'] };
  }
  if (typeof value.corrected !== 'string' || !value.corrected.trim()) problems.push('corrected puuttuu');
  if (!Array.isArray(value.issues)) {
    problems.push('issues ei ole lista');
  } else {
    value.issues.forEach((it, i) => {
      if (!it || typeof it.quote !== 'string' || typeof it.explanation_fi !== 'string') {
        problems.push(`issues[${i}] on puutteellinen`);
      }
    });
  }
  if (typeof value.tip_fi !== 'string') problems.push('tip_fi puuttuu');
  return { ok: problems.length === 0, problems };
}

export function classifyApiError(provider, status, bodyText) {
  let apiMsg = '';
  try {
    const j = JSON.parse(bodyText);
    apiMsg = String(j?.error?.message ?? j?.message ?? '');
  } catch {
    /* ei JSONia */
  }
  const lower = apiMsg.toLowerCase();
  const note = apiMsg ? ` Palvelun viesti: ${apiMsg.slice(0, 200)}` : '';
  let kind = 'other';
  let hint = `Palvelu vastasi tilalla ${status}.`;
  if (status === 401 || status === 403 || (status === 400 && lower.includes('api key'))) {
    kind = 'auth';
    hint = 'Avain hylättiin tai sillä ei ole oikeutta. Tarkista, että liitit koko avaimen ilman välilyöntejä.';
  } else if (status === 429) {
    kind = 'rate';
    hint = 'Kiintiö tai pyyntöraja on täynnä. Odota hetki ja yritä uudelleen.';
  } else if (status === 404) {
    kind = 'model';
    hint = 'Mallia ei löytynyt. Paina "Hae mallit" ja valitse malli listasta.';
  } else if (provider === 'anthropic' && status === 400 && lower.includes('credit balance')) {
    kind = 'credit';
    hint = 'Tilin saldo ei riitä. Lisää saldoa Claude Platformin Billing-sivulla.';
  } else if (status >= 500) {
    kind = 'server';
    hint = 'Palvelun puolella on häiriö tai se on ruuhkautunut. Yritä hetken päästä.';
  } else if (status === 400) {
    kind = 'bad-request';
    hint = 'Palvelu hylkäsi pyynnön.';
  }
  return { kind, status, hint: hint + note };
}

export function interpretAiResponse(provider, httpStatus, bodyText) {
  if (httpStatus < 200 || httpStatus >= 300) {
    return { ok: false, httpStatus, error: classifyApiError(provider, httpStatus, bodyText) };
  }
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      httpStatus,
      error: { kind: 'bad-json', status: httpStatus, hint: 'Palvelun vastaus ei ollut JSONia.' },
    };
  }
  const parsed = provider === 'anthropic' ? parseAnthropicResponse(json) : parseGeminiResponse(json);
  const out = parseJsonLoose(parsed.text);
  const check = out.ok ? validateFeedback(out.value) : { ok: false, problems: [out.error] };
  return {
    ok: true,
    httpStatus,
    ...parsed,
    emptyText: !parsed.text,
    feedback: out.ok ? out.value : null,
    feedbackOk: check.ok,
    problems: check.problems,
  };
}

/* ---------- Salaisuuksien peittäminen ja raportti ---------- */

export function redact(text, secrets = []) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (typeof s === 'string' && s.length >= 6) out = out.split(s).join('••••');
  }
  return out
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, '••••')
    .replace(/AIza[0-9A-Za-z_-]{16,}/g, '••••');
}

const STATUS_TEXT = { ok: 'OK', warn: 'HUOMIO', fail: 'VIRHE', todo: 'EI TESTATTU' };

export function buildReport({ results, now = new Date(), errors = [] }) {
  const lines = [`LAITETESTI v${VERSION} ${now.toISOString()}`];
  for (const id of TEST_ORDER) {
    const r = results[id];
    if (!r) continue;
    lines.push(`[${STATUS_TEXT[r.status] ?? r.status}] ${r.label}: ${r.summary}`);
    for (const d of r.details ?? []) lines.push(`    ${d}`);
  }
  if (errors.length) {
    lines.push('[VIRHE] Sivun sisäiset virheet:');
    for (const e of errors.slice(0, 10)) lines.push(`    ${e}`);
  }
  return lines.join('\n');
}

/* ---------- Selain, avain ja mallilista ---------- */

export function parseBrowser(ua = '') {
  const u = String(ua);
  const base = { android: /Android/i.test(u), mobile: /Mobi/i.test(u) || /iPhone|iPad/i.test(u) };
  let m;
  if ((m = /SamsungBrowser\/([\d.]+)/.exec(u))) return { ...base, name: 'Samsung Internet', version: m[1], chrome: false };
  if ((m = /\bEdg(?:A|iOS)?\/([\d.]+)/.exec(u))) return { ...base, name: 'Edge', version: m[1], chrome: false };
  if ((m = /\b(?:Firefox|FxiOS)\/([\d.]+)/.exec(u))) return { ...base, name: 'Firefox', version: m[1], chrome: false };
  if ((m = /\bOPR\/([\d.]+)/.exec(u))) return { ...base, name: 'Opera', version: m[1], chrome: false };
  if ((m = /\bCriOS\/([\d.]+)/.exec(u))) return { ...base, name: 'Chrome (iOS)', version: m[1], chrome: false };
  if ((m = /Chrome\/([\d.]+)/.exec(u))) return { ...base, name: 'Chrome', version: m[1], chrome: true };
  if ((m = /\bVersion\/([\d.]+).*Safari/.exec(u))) return { ...base, name: 'Safari', version: m[1], chrome: false };
  return { ...base, name: 'Tuntematon selain', version: '', chrome: false };
}

const KEY_PATTERN = /^[\x21-\x7E]+$/;

/** Tarkistaa avaimen muodon ennen lähetystä. Estää myös avaimen lähettämisen väärälle palvelulle. */
export function validateKey(provider, rawKey) {
  const key = String(rawKey ?? '').trim();
  if (!key) return { ok: false, key, message: 'Liitä ensin API-avain.' };
  if (!KEY_PATTERN.test(key)) {
    return { ok: false, key, message: 'Avaimessa on välilyöntejä tai muita kuin ASCII-merkkejä. Liitä koko avain uudelleen.' };
  }
  if (provider === 'gemini' && key.startsWith('sk-ant-')) {
    return { ok: false, key, message: 'Tämä on Clauden avain, mutta valittuna on Gemini. Avainta ei lähetetty.' };
  }
  if (provider === 'anthropic' && key.startsWith('AIza')) {
    return { ok: false, key, message: 'Tämä on Googlen avain, mutta valittuna on Claude. Avainta ei lähetetty.' };
  }
  return { ok: true, key, message: '' };
}

export function buildModelsRequest(provider, apiKey) {
  if (provider === 'anthropic') {
    return {
      url: ANTHROPIC_MODELS_URL,
      init: {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      },
    };
  }
  return { url: `${GEMINI_BASE}/models?pageSize=200`, init: { method: 'GET', headers: { 'x-goog-api-key': apiKey } } };
}

export function parseModelsResponse(provider, json) {
  let ids;
  if (provider === 'anthropic') {
    ids = (Array.isArray(json?.data) ? json.data : []).map((m) => m?.id);
  } else {
    ids = (Array.isArray(json?.models) ? json.models : [])
      .filter(
        (m) =>
          typeof m?.name === 'string' &&
          m.name.startsWith('models/gemini') &&
          (!Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes('generateContent')),
      )
      .map((m) => normalizeModel(m.name));
  }
  return [...new Set(ids.filter((id) => typeof id === 'string' && MODEL_RE.test(id)))];
}

/** Nopea tarkistussumma tallennuskokeelle (FNV-1a, 32 bittiä). */
export function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* ---------- Virhetekstit ---------- */

export function permText(state) {
  return { granted: 'myönnetty', denied: 'estetty', prompt: 'kysytään käytettäessä' }[state] ?? 'tuntematon';
}

const ASR_HINTS = {
  'not-allowed': 'Mikrofonilupa evättiin tai selain esti käytön. Salli mikrofoni Chromen sivuasetuksista.',
  'service-not-allowed': 'Selain ei salli puheentunnistuspalvelua tälle sivulle.',
  'no-speech': 'Puhetta ei havaittu. Puhu heti painalluksen jälkeen ja lähellä mikrofonia.',
  'audio-capture': 'Mikrofonia ei löytynyt tai se on toisen sovelluksen käytössä.',
  network: 'Tunnistuspalveluun ei saatu yhteyttä. Normaalitila tarvitsee verkon.',
  'language-not-supported': 'Englannin (en-US) kielipaketti puuttuu laitteelta. Lataa se kielipaketin painikkeesta tai käytä normaalitilaa.',
  aborted: 'Tunnistus keskeytyi.',
  nomatch: 'Puhetta ei tunnistettu.',
  timeout: 'Tunnistus ei antanut tulosta ajoissa.',
  'no-result': 'Tunnistus päättyi ilman tulosta.',
  'start-failed': 'Tunnistuksen käynnistys epäonnistui.',
  'local-unsupported': 'Selain ei tue laitteella tapahtuvaa tunnistusta (processLocally).',
};

export function asrErrorHint(code) {
  return ASR_HINTS[code] ?? `Tunnistus päättyi virheeseen (${code}).`;
}

export function describeMediaError(e) {
  const name = e?.name ?? 'Error';
  const map = {
    NotAllowedError: 'Lupa evättiin tai selain esti mikrofonin. Salli mikrofoni Chromen sivuasetuksista.',
    SecurityError: 'Selain esti mikrofonin tästä sivusta (turvallisuussääntö).',
    NotFoundError: 'Laitteesta ei löytynyt mikrofonia.',
    NotReadableError: 'Mikrofoni on toisen sovelluksen käytössä tai laitteisto esti sen.',
    OverconstrainedError: 'Mikrofoni ei täytä pyydettyjä asetuksia.',
    AbortError: 'Mikrofonin avaus keskeytyi.',
    TypeError: 'Selain ei tue mikrofonin avaamista tässä yhteydessä (vaatii suojatun yhteyden).',
  };
  return `${name}: ${map[name] ?? e?.message ?? 'tuntematon virhe'}`;
}

/* ---------- Tilapäätökset (puhtaita, jotta ne voi testata Nodella) ---------- */

export function decideEnv({ secure, inFrame, browser, host }) {
  const major = String(browser.version).split('.')[0];
  const label = `${browser.name} ${major}`.trim();
  if (!secure) {
    return { status: 'fail', summary: `${label}: sivu ei ole suojatussa yhteydessä (HTTPS), mikrofoni ja service worker eivät toimi` };
  }
  if (inFrame) return { status: 'warn', summary: `${label}: sivu on kehyksessä, avaa se omassa välilehdessä` };
  if (!browser.chrome) {
    return { status: 'warn', summary: `${label}: testi on tehty Android-Chromelle, muut selaimet voivat poiketa` };
  }
  return { status: 'ok', summary: `${label}${browser.android ? ', Android' : ''}, ${host}` };
}

export function decideTts({ sum, outcome, confirmed }) {
  const base = ttsStatus(sum);
  if (base.status === 'fail') return base;
  if (outcome && ['no-start', 'error', 'timeout'].includes(outcome.kind)) {
    const why =
      outcome.kind === 'no-start'
        ? 'ääni ei käynnistynyt 6 sekunnissa'
        : outcome.kind === 'timeout'
          ? 'toisto ei päättynyt ajoissa'
          : `virhe ${outcome.error ?? 'tuntematon'}`;
    return { status: 'fail', summary: `Toisto epäonnistui: ${why}` };
  }
  if (confirmed === false) return { status: 'fail', summary: 'Toisto käynnistyi, mutta ääntä ei kuulunut' };
  if (confirmed === true) return { status: base.status, summary: `${base.summary}, ääni kuului` };
  return { status: 'todo', summary: `${base.summary}. Soita lause ja vahvista, kuuluuko ääni` };
}

function runText(r) {
  if (!r) return 'ei kokeiltu';
  if (r.error) return `ei toiminut (${r.error})`;
  return `täsmäys ${r.matchPct} %`;
}

export function decideAsr({ supported, availability = [], runs = {}, interrupted = [] }) {
  if (!supported) return { status: 'fail', summary: 'Selaimessa ei ole puheentunnistusta (SpeechRecognition)' };
  const note = interrupted.length ? `Keskeytynyt edellinen yritys: ${interrupted.join(', ')}.` : '';
  const withNote = (s) => (note ? `${s}. ${note}` : s);
  const list = [runs.normal, runs.local].filter(Boolean);
  if (list.length === 0) {
    const values = availability.flatMap((a) => [a.network, a.local]);
    const known = values.filter((v) => ['available', 'downloadable', 'downloading', 'unavailable'].includes(v));
    if (known.length > 0 && known.every((v) => v === 'unavailable')) {
      return { status: 'warn', summary: withNote('Selain ilmoittaa en-US-tunnistuksen puuttuvan. Kokeile silti puhumalla') };
    }
    return { status: 'todo', summary: withNote('Tunnistusta ei ole vielä kokeiltu puhumalla') };
  }
  const recognized = list.filter((r) => !r.error && r.transcript);
  const best = recognized.sort((a, b) => b.matchPct - a.matchPct)[0];
  const detail = `normaali: ${runText(runs.normal)}; laitteella: ${runText(runs.local)}`;
  if (best && best.matchPct >= 80) return { status: note ? 'warn' : 'ok', summary: withNote(`Toimii (${detail})`) };
  if (best) return { status: 'warn', summary: withNote(`Tunnistus vastasi, mutta täsmäys jäi alle 80 % (${detail})`) };
  return { status: 'fail', summary: withNote(`Tunnistus epäonnistui (${detail})`) };
}

export function decideMic({ perm, level, rec }) {
  if (level?.error) return { status: 'fail', summary: `Mikrofoni ei avautunut: ${level.error}` };
  if (rec?.error) return { status: 'fail', summary: `Äänitys epäonnistui: ${rec.error}` };
  if (rec && rec.bytes === 0) return { status: 'fail', summary: 'Äänitys tuotti tyhjän tiedoston' };
  if (rec?.confirmed === false) return { status: 'fail', summary: 'Äänitys onnistui, mutta toistossa ei kuulunut mitään' };
  if (level && !level.sound) {
    return { status: 'warn', summary: 'Mikrofoni avautui, mutta ääntä ei havaittu. Puhuitko mikrofoniin?' };
  }
  if (!level && !rec && perm === 'denied') {
    return { status: 'fail', summary: 'Mikrofoni on estetty selaimen asetuksissa' };
  }
  const missing = [];
  if (!level) missing.push('äänitasotesti');
  if (!rec) missing.push('äänitys');
  else if (rec.confirmed == null) missing.push('toiston vahvistus');
  if (missing.length === 0) return { status: 'ok', summary: 'Mikrofoni ja äänitys toimivat' };
  return { status: 'todo', summary: `Lupa: ${permText(perm)}. Vielä tekemättä: ${missing.join(', ')}` };
}

export function decideOffline({ supported, secure, error, ready, controlled, fileCount = 0, offlineOk }) {
  if (!supported) return { status: 'fail', summary: 'Service worker ei ole tuettu tässä selaimessa' };
  if (!secure) return { status: 'fail', summary: 'Service worker vaatii suojatun yhteyden (HTTPS)' };
  if (error) return { status: 'fail', summary: `Service workerin rekisteröinti epäonnistui: ${error}` };
  if (offlineOk && ready) {
    return { status: 'ok', summary: `Offline-lataus onnistui (${String(offlineOk).slice(0, 16).replace('T', ' ')} UTC)` };
  }
  if (ready && controlled) {
    return { status: 'todo', summary: `Välimuisti valmis (${fileCount} tiedostoa). Kokeile lentokonetilassa` };
  }
  if (ready) {
    return { status: 'todo', summary: 'Service worker on asennettu. Lataa sivu kerran uudelleen, niin se alkaa hallita sivua' };
  }
  return { status: 'todo', summary: 'Service worker ei ole vielä valmis' };
}

export function decideStorage({ idb, persisted, probe }) {
  if (!idb?.ok) return { status: 'fail', summary: `IndexedDB ei toimi: ${idb?.error ?? 'tuntematon virhe'}` };
  if (probe && !probe.ok) return { status: 'fail', summary: `1 Mt:n koe epäonnistui: ${probe.error}` };
  const probeText = probe ? ', 1 Mt:n koe läpi' : '';
  if (persisted === true) return { status: 'ok', summary: `IndexedDB toimii, tallennus on pysyvä${probeText}` };
  if (persisted === false) {
    return { status: 'warn', summary: `IndexedDB toimii, mutta tallennus ei ole pysyvä: selain voi poistaa sen tilanpuutteessa${probeText}` };
  }
  return { status: 'warn', summary: `IndexedDB toimii, pysyvyyttä ei voi tarkistaa${probeText}` };
}

function aiErrorSummary(err) {
  switch (err?.kind) {
    case 'auth':
      return `Avain hylättiin (HTTP ${err.status})`;
    case 'rate':
      return 'Kiintiö tai pyyntöraja täynnä (HTTP 429)';
    case 'model':
      return 'Mallia ei löytynyt (HTTP 404)';
    case 'credit':
      return 'Tilin saldo ei riitä';
    case 'server':
      return `Palvelun häiriö (HTTP ${err.status})`;
    case 'bad-request':
      return 'Palvelu hylkäsi pyynnön (HTTP 400)';
    case 'bad-json':
      return 'Palvelun vastaus ei ollut JSONia';
    default:
      return `Palvelu vastasi tilalla ${err?.status ?? '?'}`;
  }
}

export function decideAi(r) {
  if (!r) return { status: 'todo', summary: 'Ei vielä kutsuttu. Liitä avain ja lähetä testikutsu' };
  if (r.aborted) return { status: 'fail', summary: 'Aikakatkaisu: palvelu ei vastannut 40 sekunnissa' };
  if (r.networkError) {
    return {
      status: 'fail',
      summary: r.offline ? 'Laite ei ole verkossa' : 'Pyyntö ei mennyt läpi: verkkovirhe tai selain esti sen (CORS)',
    };
  }
  if (!r.ok) return { status: 'fail', summary: aiErrorSummary(r.error) };
  if (r.emptyText) {
    return { status: 'warn', summary: `Palvelu vastasi, mutta teksti oli tyhjä (lopetussyy: ${r.stop ?? 'ei tiedossa'})` };
  }
  if (!r.feedbackOk) {
    return { status: 'warn', summary: `Palvelu vastasi, mutta palautteen JSON ei ollut kelvollinen (lopetussyy: ${r.stop ?? 'ei tiedossa'})` };
  }
  return { status: 'ok', summary: `Kutsu onnistui ja vastaus oli kelvollista JSONia (${fmtMs(r.ms)})` };
}
