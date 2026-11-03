// app.js – Laitetesti (vaihe 0).
// Kaikki dynaaminen teksti asetetaan textContent-ominaisuudella, ei innerHTML:llä.
// API-avainta ei kirjoiteta koodiin, lokiin, raporttiin eikä osoitteeseen.

import {
  TEST_ORDER,
  MODEL_DEFAULTS,
  PROVIDER_LABEL,
  MODEL_RE,
  TTS_SENTENCE,
  ASR_SENTENCES,
  FEEDBACK_SYSTEM,
  FEEDBACK_USER,
  fmtMs,
  fmtBytes,
  describeAvailability,
  compareSpeech,
  summarizeVoices,
  normalizeModel,
  buildAnthropicRequest,
  buildGeminiRequest,
  buildModelsRequest,
  parseModelsResponse,
  classifyApiError,
  interpretAiResponse,
  validateKey,
  parseBrowser,
  fnv1a,
  permText,
  asrErrorHint,
  describeMediaError,
  decideEnv,
  decideTts,
  decideAsr,
  decideMic,
  decideOffline,
  decideStorage,
  decideAi,
  redact,
  buildReport,
} from './lib.js';

/* ---------- Apufunktiot ---------- */

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errText = (e) => `${e?.name ?? 'Error'}: ${e?.message ?? e}`;

function withTimeout(promise, ms, message) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = performance.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ei väliä */
    }
  },
};

const PROVIDERS = ['anthropic', 'gemini'];

/* ---------- Kaatumisvartija ---------- */
// Merkintä tehdään ennen riskialtista kutsua ja poistetaan sen päätyttyä. Jos merkintä on vielä olemassa,
// kun sivu latautuu, edellinen yritys keskeytyi (välilehti kaatui tai se suljettiin kesken), eikä sitä
// toisteta itsestään. Näin yksittäinen selainrajapinta ei voi jumittaa sivua kaatumiskierteeseen.

const CRASH_STEPS = {
  'asr-local-check': 'paikallisen tuen tarkistus',
  'asr-local-listen': 'laitteella tapahtuva tunnistus',
  'asr-install': 'kielipaketin lataus',
};
const crashKey = (step) => `lt.crash.${step}`;
async function armCrash(step) {
  store.set(crashKey(step), new Date().toISOString());
  await sleep(60); // annetaan tallennukselle hetki ennen riskialtista kutsua
}
function clearCrash(step) {
  store.del(crashKey(step));
}
function interruptedSteps() {
  return Object.keys(CRASH_STEPS)
    .filter((s) => store.get(crashKey(s)))
    .map((s) => CRASH_STEPS[s]);
}

/* ---------- Salaisuuksien peittäminen ---------- */

function currentSecrets() {
  const list = [$('api-key')?.value ?? ''];
  for (const p of PROVIDERS) list.push(store.get(`lt.key.${p}`) ?? '');
  return list.map((s) => s.trim()).filter(Boolean);
}
const clean = (text) => redact(text, currentSecrets());
function say(id, text) {
  $(id).textContent = clean(text);
}

/* ---------- Tulokset ja piirto ---------- */

const LABELS = {
  env: 'Ympäristö',
  tts: 'Puhe ulos',
  asr: 'Puhe sisään',
  mic: 'Mikrofoni ja äänitys',
  offline: 'Offline',
  storage: 'Tallennus',
  ai: 'Tekoäly',
};
const STATE_TEXT = { ok: 'Toimii', warn: 'Huomioi', fail: 'Ei toimi', todo: 'Ei testattu' };
const GLYPH = { ok: '✓', warn: '!', fail: '✗', todo: '–' };
const FACT_LIST = {
  env: 'env-list',
  tts: 'tts-list',
  asr: 'asr-list',
  mic: 'mic-list',
  offline: 'offline-list',
  storage: 'store-list',
  ai: 'ai-list',
};

const results = {};
const pageErrors = [];

function renderBoard(id) {
  const r = results[id];
  const li = document.querySelector(`#board li[data-test="${id}"]`);
  if (!li || !r) return;
  li.dataset.status = r.status;
  li.querySelector('.glyph').textContent = GLYPH[r.status];
  li.querySelector('.state').textContent = STATE_TEXT[r.status];
  li.querySelector('.sum').textContent = clean(r.summary);
}

function renderFacts(dlId, lines) {
  const dl = $(dlId);
  dl.replaceChildren();
  for (const line of lines) {
    const i = line.indexOf(': ');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    if (i > 0) {
      dt.textContent = line.slice(0, i);
      dd.textContent = clean(line.slice(i + 2));
    } else {
      dt.textContent = 'Huomio';
      dd.textContent = clean(line);
    }
    dl.append(dt, dd);
  }
}

function renderReport() {
  const merged = {};
  for (const id of TEST_ORDER) {
    merged[id] = results[id] ?? { id, label: LABELS[id], status: 'todo', summary: 'ei ajettu', details: [] };
  }
  $('report').value = clean(buildReport({ results: merged, now: new Date(), errors: pageErrors }));
}

function setResult(id, status, summary, details = []) {
  results[id] = { id, label: LABELS[id], status, summary: clean(summary), details: details.map(clean) };
  renderBoard(id);
  renderFacts(FACT_LIST[id], results[id].details);
  renderReport();
}

function recordError(message) {
  const text = clean(String(message)).slice(0, 300);
  if (pageErrors.length < 20) pageErrors.push(text);
  const ul = $('js-errors');
  ul.hidden = false;
  const li = document.createElement('li');
  li.textContent = text;
  ul.append(li);
  renderReport();
}

window.addEventListener('error', (e) => {
  recordError(`${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  recordError(`Käsittelemätön lupaus: ${e.reason?.message ?? e.reason}`);
});

/* ---------- Kerralla yksi toiminto ---------- */

let busy = null;
function setBusy(name) {
  busy = name;
  document.querySelectorAll('button.act').forEach((b) => {
    b.disabled = Boolean(name);
  });
}
async function guarded(name, fn) {
  if (busy) return;
  setBusy(name);
  try {
    await fn();
  } catch (e) {
    recordError(`${name}: ${e?.message ?? e}`);
  } finally {
    setBusy(null);
  }
}

/* ---------- Ympäristö ---------- */

async function testEnv() {
  const ua = navigator.userAgent;
  const browser = parseBrowser(ua);
  let hi = null;
  try {
    hi = await withTimeout(
      navigator.userAgentData?.getHighEntropyValues?.(['model', 'platform', 'platformVersion']) ?? Promise.resolve(null),
      1500,
      'ua-data',
    );
  } catch {
    hi = null;
  }
  const hostname = location.hostname;
  const host = hostname.endsWith('.github.io')
    ? 'github.io'
    : ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
      ? 'localhost'
      : 'muu';
  let inFrame = false;
  try {
    inFrame = window.top !== window.self;
  } catch {
    inFrame = true;
  }
  const secure = window.isSecureContext === true;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const decision = decideEnv({ secure, inFrame, browser, host });
  const device = [hi?.model, hi?.platform ? `${hi.platform} ${hi.platformVersion ?? ''}`.trim() : ''].filter(Boolean).join(', ');
  setResult('env', decision.status, decision.summary, [
    `Selain: ${browser.name} ${browser.version}`,
    `Laite: ${device || 'ei saatavilla'}`,
    `Näyttö: ${screen.width} × ${screen.height} px, näkymä ${innerWidth} × ${innerHeight} px, tiheys ${devicePixelRatio}`,
    `Osoitetyyppi: ${host}`,
    `Suojattu yhteys (HTTPS): ${secure ? 'kyllä' : 'ei'}`,
    `Kehys: ${inFrame ? 'kyllä' : 'ei'}`,
    `Asennettu sovelluksena: ${standalone ? 'kyllä' : 'ei'}`,
    `Verkko: ${navigator.onLine ? 'online' : 'offline'}`,
    `Kielet: ${(navigator.languages ?? [navigator.language]).join(', ')}`,
    `Muisti ja ytimet: ${navigator.deviceMemory ?? '?'} Gt, ${navigator.hardwareConcurrency ?? '?'} ydintä`,
    `Käyttäjäagentti: ${ua}`,
  ]);
}

/* ---------- Puhe ulos ---------- */

const tts = { all: [], list: [], outcome: null, confirmed: null, startMs: null };

function loadVoices() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve([]);
    const first = synth.getVoices();
    if (first.length) return resolve(first);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', onChange);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const onChange = () => {
      if (synth.getVoices().length) finish();
    };
    synth.addEventListener('voiceschanged', onChange);
    const timer = setTimeout(finish, 3000);
  });
}

function rankVoices(voices) {
  const lang = (v) => String(v.lang || '').replace('_', '-').toLowerCase();
  const rank = (v) => {
    const l = lang(v);
    if (l === 'en-us') return v.localService ? 0 : 1;
    if (l.startsWith('en')) return 2;
    return 9;
  };
  return voices
    .filter((v) => rank(v) < 9)
    .sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
}

function fillVoiceSelect() {
  const sel = $('voice');
  sel.replaceChildren();
  if (tts.list.length === 0) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = 'Englannin ääniä ei löytynyt (käytetään oletusta)';
    sel.append(o);
    return;
  }
  tts.list.forEach((v, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${v.name} (${v.lang}, ${v.localService ? 'paikallinen' : 'verkko'})`;
    sel.append(o);
  });
}

function describeOutcome(o, startMs) {
  if (!o) return 'ei vielä soitettu';
  if (o.kind === 'end') return `soitettu loppuun, alkoi ${fmtMs(startMs)} kuluttua`;
  if (o.kind === 'no-start') return 'ei käynnistynyt 6 sekunnissa';
  if (o.kind === 'timeout') return 'ei päättynyt 25 sekunnissa';
  if (o.kind === 'error') return `virhe ${o.error}`;
  return o.kind;
}

function refreshTts() {
  if (!('speechSynthesis' in window)) {
    setResult('tts', 'fail', 'Selaimessa ei ole puhesynteesiä (speechSynthesis)', ['Rajapinta: ei tuettu']);
    return;
  }
  const sum = summarizeVoices(tts.all);
  const decision = decideTts({ sum, outcome: tts.outcome, confirmed: tts.confirmed });
  const voice = tts.list[Number($('voice').value)];
  setResult('tts', decision.status, decision.summary, [
    `Ääniä yhteensä: ${sum.total}`,
    `Englannin ääniä: ${sum.en}, joista en-US ${sum.enUS} (paikallisia ${sum.enUSLocal}, verkkoa vaativia ${sum.enUSNetwork})`,
    `Valittu ääni: ${voice ? `${voice.name}, ${voice.lang}, ${voice.localService ? 'paikallinen' : 'verkko'}` : 'oletus'}`,
    `Toisto: ${describeOutcome(tts.outcome, tts.startMs)}`,
    `Kuuluiko ääni: ${tts.confirmed === true ? 'kyllä' : tts.confirmed === false ? 'ei' : 'ei vahvistettu'}`,
  ]);
}

async function passiveTts() {
  tts.all = 'speechSynthesis' in window ? await loadVoices() : [];
  tts.list = rankVoices(tts.all);
  fillVoiceSelect();
  refreshTts();
}

async function onSpeak() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  $('tts-confirm').hidden = true;
  tts.confirmed = null;
  tts.outcome = null;
  refreshTts(); // uusi yritys mitätöi edellisen tuloksen
  say('tts-out', 'Soitetaan…');
  synth.cancel();
  await sleep(60);
  const u = new SpeechSynthesisUtterance(TTS_SENTENCE);
  u.lang = 'en-US';
  const voice = tts.list[Number($('voice').value)];
  if (voice) u.voice = voice;
  u.rate = Number($('rate').value) || 1;
  const t0 = performance.now();
  const outcome = await new Promise((resolve) => {
    let started = false;
    let watchdog;
    let hardStop;
    const settle = (value) => {
      clearTimeout(watchdog);
      clearTimeout(hardStop);
      resolve(value);
    };
    watchdog = setTimeout(() => {
      if (!started) {
        synth.cancel();
        settle({ kind: 'no-start' });
      }
    }, 6000);
    hardStop = setTimeout(() => {
      synth.cancel();
      settle({ kind: 'timeout' });
    }, 25000);
    u.onstart = () => {
      started = true;
      clearTimeout(watchdog);
      tts.startMs = performance.now() - t0;
    };
    u.onend = () => settle({ kind: 'end' });
    u.onerror = (e) =>
      settle(e.error === 'interrupted' || e.error === 'canceled' ? { kind: 'interrupted' } : { kind: 'error', error: e.error });
    synth.speak(u);
  });
  if (outcome.kind === 'interrupted') {
    say('tts-out', 'Toisto keskeytyi.');
    return;
  }
  tts.outcome = outcome;
  if (outcome.kind === 'end') {
    say('tts-out', 'Toisto päättyi. Tarkista, että median äänenvoimakkuus on päällä.');
    $('tts-confirm').hidden = false;
  } else {
    say('tts-out', `Toisto epäonnistui: ${describeOutcome(outcome, null)}.`);
  }
  refreshTts();
}

/* ---------- Puhe sisään ---------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const QUALITIES = ['command', 'dictation', 'conversation'];
const QUALITY_FI = { command: 'command (komento)', dictation: 'dictation (sanelu)', conversation: 'conversation (keskustelu)' };

const asr = {
  supported: Boolean(SR),
  api: window.SpeechRecognition ? 'SpeechRecognition' : window.webkitSpeechRecognition ? 'webkitSpeechRecognition' : 'ei mitään',
  hasAvailable: false,
  hasInstall: false,
  hasLocalProp: false,
  availability: [],
  local: {},
  runs: {},
};

function availText(value) {
  return (
    { unsupported: 'ei tuettu', timeout: 'ei vastausta', error: 'virhe', unchecked: 'ei tarkistettu' }[value] ??
    describeAvailability(value)
  );
}

async function availabilityOf(quality, processLocally) {
  if (typeof SR.available !== 'function') return 'unsupported';
  try {
    return await withTimeout(SR.available({ langs: ['en-US'], quality, processLocally }), 4000, 'timeout');
  } catch (e) {
    return e?.message === 'timeout' ? 'timeout' : 'error';
  }
}

function renderAsrMatrix() {
  const body = $('asr-matrix');
  body.replaceChildren();
  if (asr.availability.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = SR ? 'Tilatietoa ei saatu.' : 'Selaimessa ei ole puheentunnistusta.';
    tr.append(td);
    body.append(tr);
  }
  for (const r of asr.availability) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = QUALITY_FI[r.quality] ?? r.quality;
    const a = document.createElement('td');
    a.textContent = availText(r.network);
    const b = document.createElement('td');
    b.textContent = availText(r.local);
    tr.append(th, a, b);
    body.append(tr);
  }
  const downloadable = asr.availability.some((r) => r.local === 'downloadable' || r.local === 'downloading');
  $('btn-install').hidden = !(asr.hasInstall && downloadable);
}

function runLine(label, run) {
  if (!run) return `${label}: ei kokeiltu`;
  if (run.error) return `${label}: virhe ${run.error}`;
  const conf = run.confidence == null ? '–' : run.confidence.toFixed(2).replace('.', ',');
  return (
    `${label}: täsmäys ${run.matchPct} %, varmuus ${conf}, mikrofoni avautui ${fmtMs(run.audioMs)}, ` +
    `tulos ${fmtMs(run.resultMs)}${run.interimOnly ? ' (vain välitulos)' : ''}`
  );
}

function refreshAsr() {
  const interrupted = interruptedSteps();
  const note = $('asr-interrupted');
  note.hidden = interrupted.length === 0;
  note.textContent = interrupted.length
    ? `Edellinen yritys keskeytyi: ${interrupted.join(', ')}. Välilehti kaatui tai se suljettiin kesken. Painikkeen painaminen yrittää uudelleen ja poistaa merkinnän, kun yritys päättyy.`
    : '';
  const decision = decideAsr({ supported: asr.supported, availability: asr.availability, runs: asr.runs, interrupted });
  const details = [
    `Rajapinta: ${asr.supported ? asr.api : 'ei tuettu'}`,
    `available, install, processLocally: ${asr.hasAvailable ? 'kyllä' : 'ei'}, ${asr.hasInstall ? 'kyllä' : 'ei'}, ${asr.hasLocalProp ? 'kyllä' : 'ei'}`,
  ];
  for (const r of asr.availability) {
    details.push(`Tuki ${r.quality}: verkko ${availText(r.network)}, laitteella ${availText(r.local)}`);
  }
  details.push(runLine('Normaali', asr.runs.normal), runLine('Vain laitteella', asr.runs.local));
  if (interrupted.length) details.push(`Keskeytynyt edellinen yritys: ${interrupted.join(', ')}`);
  setResult('asr', decision.status, decision.summary, details);
}

async function passiveAsr() {
  asr.availability = [];
  if (SR) {
    asr.hasAvailable = typeof SR.available === 'function';
    asr.hasInstall = typeof SR.install === 'function';
    asr.hasLocalProp = 'processLocally' in SR.prototype;
    // Vain verkkotilan tuki tarkistetaan itsestään. Laitteella-tuen kutsu on kokeellinen (ks. onLocalCheck).
    asr.availability = await Promise.all(
      QUALITIES.map(async (quality) => ({
        quality,
        network: await availabilityOf(quality, false),
        local: asr.local[quality] ?? 'unchecked',
      })),
    );
  }
  renderAsrMatrix();
  refreshAsr();
}

async function onLocalCheck() {
  if (!SR) {
    say('asr-live', 'Selaimessa ei ole puheentunnistusta.');
    return;
  }
  say('asr-live', 'Tarkistetaan laitteella-tukea…');
  await armCrash('asr-local-check');
  for (const quality of QUALITIES) asr.local[quality] = await availabilityOf(quality, true);
  clearCrash('asr-local-check');
  say('asr-live', 'Laitteella-tuki tarkistettu.');
  await passiveAsr();
}

async function onInstall() {
  const wants = ['dictation', 'conversation', 'command'];
  const pick = wants.find((q) => asr.availability.some((r) => r.quality === q && (r.local === 'downloadable' || r.local === 'downloading')));
  if (!pick) return;
  say('asr-live', 'Ladataan kielipakettia. Se voi kestää hetken…');
  await armCrash('asr-install');
  try {
    const ok = await withTimeout(
      SR.install({ langs: ['en-US'], quality: pick, processLocally: true }),
      120000,
      'Lataus ei valmistunut 2 minuutissa',
    );
    say('asr-live', ok ? 'Kielipaketti on asennettu.' : 'Selain ei asentanut kielipakettia.');
  } catch (e) {
    say('asr-live', `Lataus epäonnistui: ${e?.message ?? e}`);
  }
  clearCrash('asr-install');
  // Laitteella-tuki luetaan uudelleen vain, jos se on jo kerran tarkistettu.
  if (Object.keys(asr.local).length) await onLocalCheck();
  else await passiveAsr();
}

function listenOnce({ local, onStart, onInterim }) {
  return new Promise((resolve) => {
    if (local && !asr.hasLocalProp) {
      resolve({ error: 'local-unsupported' });
      return;
    }
    let rec;
    try {
      rec = new SR();
    } catch (e) {
      resolve({ error: 'start-failed', message: e?.message });
      return;
    }
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.continuous = false;
    if (local) rec.processLocally = true;

    const t0 = performance.now();
    let audioMs = null;
    let resultMs = null;
    let heard = null;
    let interim = '';
    let finished = false;
    let watchdog = null;

    const finish = (info) => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      try {
        rec.abort();
      } catch {
        /* ei väliä */
      }
      resolve({ audioMs, resultMs, ...info });
    };
    const conclude = (fallbackError) => {
      if (heard) return finish(heard);
      if (interim) return finish({ transcript: interim, confidence: null, alternatives: [], interimOnly: true });
      return finish({ error: fallbackError });
    };
    const arm = (ms, code) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => conclude(code), ms);
    };

    rec.onaudiostart = () => {
      audioMs = performance.now() - t0;
      arm(15000, 'timeout');
      onStart?.();
    };
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      const last = e.results[e.results.length - 1];
      if (last.isFinal) {
        resultMs = performance.now() - t0;
        heard = {
          transcript: text.trim(),
          confidence: last[0].confidence,
          alternatives: Array.from(last).map((a) => a.transcript),
        };
        setTimeout(() => conclude('no-result'), 400);
      } else {
        interim = text.trim();
        onInterim?.(interim);
      }
    };
    rec.onerror = (e) => finish({ error: e.error || 'unknown', message: e.message });
    rec.onend = () => conclude('no-result');

    arm(30000, 'timeout');
    try {
      rec.start();
    } catch (e) {
      finish({ error: 'start-failed', message: e?.message });
    }
  });
}

function currentAsrSentence() {
  return ASR_SENTENCES.find((s) => s.id === $('asr-sentence').value) ?? ASR_SENTENCES[0];
}

async function onListen() {
  if (!SR) {
    say('asr-live', 'Selaimessa ei ole puheentunnistusta.');
    return;
  }
  const local = document.querySelector('input[name="asr-mode"]:checked')?.value === 'local';
  const sentence = currentAsrSentence();
  if (local && Object.keys(asr.local).length === 0) {
    say('asr-live', 'Tarkista laitteella-tuki ensin yllä olevasta painikkeesta.');
    return;
  }
  // Uusi yritys mitätöi tämän tilan edellisen tuloksen, ettei vanha tulos jää näkyviin.
  delete asr.runs[local ? 'local' : 'normal'];
  refreshAsr();
  say('asr-live', 'Odotetaan mikrofonia…');
  if (local) await armCrash('asr-local-listen');
  const r = await listenOnce({
    local,
    onStart: () => say('asr-live', 'Puhu nyt. Lue lause ääneen.'),
    onInterim: throttle((t) => say('asr-live', `Kuulen: ${t}`), 700),
  });
  if (local) clearCrash('asr-local-listen');
  let run;
  if (r.error) {
    run = { error: r.error, audioMs: r.audioMs, local };
    say('asr-live', asrErrorHint(r.error));
  } else {
    const cmp = compareSpeech(sentence.text, r.transcript);
    run = {
      transcript: r.transcript,
      matchPct: cmp.matchPct,
      confidence: r.confidence,
      audioMs: r.audioMs,
      resultMs: r.resultMs,
      interimOnly: Boolean(r.interimOnly),
      local,
    };
    say('asr-live', `Tunnistettu: "${r.transcript}". Täsmäys ${cmp.matchPct} %.`);
  }
  // Tunnistettua tekstiä ei viedä raporttiin, vain täsmäys ja ajat.
  asr.runs[local ? 'local' : 'normal'] = run;
  refreshAsr();
}

/* ---------- Mikrofoni ja äänitys ---------- */

const mic = { perm: 'unknown', level: null, rec: null, url: null };

function refreshMic() {
  $('mic-perm').textContent = permText(mic.perm);
  if (!navigator.mediaDevices?.getUserMedia) {
    setResult('mic', 'fail', 'getUserMedia ei ole käytettävissä (vaatii suojatun yhteyden)', ['Rajapinta: ei tuettu']);
    return;
  }
  const decision = decideMic({ perm: mic.perm, level: mic.level, rec: mic.rec });
  const details = [`Lupa: ${permText(mic.perm)}`];
  if (mic.level) {
    const l = mic.level;
    if (l.error) details.push(`Äänitasotesti: virhe ${l.error}`);
    else {
      details.push(
        `Äänitasotesti: ${l.sound ? 'ääni havaittu' : 'ääntä ei havaittu'}, huippu ${l.maxRms.toFixed(3).replace('.', ',')}, avautui ${fmtMs(l.openMs)}`,
        `Mikrofonin asetukset: ${l.settings}`,
        `Äänituloja: ${l.devices}`,
      );
    }
  } else details.push('Äänitasotesti: ei ajettu');
  if (mic.rec) {
    const r = mic.rec;
    if (r.error) details.push(`Äänitys: virhe ${r.error}`);
    else {
      details.push(
        `Äänitys: ${fmtBytes(r.bytes)}, ${r.mime || 'tuntematon muoto'}`,
        `Toisto kuului: ${r.confirmed === true ? 'kyllä' : r.confirmed === false ? 'ei' : 'ei vahvistettu'}`,
      );
    }
  } else details.push('Äänitys: ei ajettu');
  setResult('mic', decision.status, decision.summary, details);
}

async function passiveMic() {
  if (navigator.permissions?.query) {
    try {
      const p = await navigator.permissions.query({ name: 'microphone' });
      mic.perm = p.state;
      p.onchange = () => {
        mic.perm = p.state;
        refreshMic();
      };
    } catch {
      mic.perm = 'unknown';
    }
  }
  refreshMic();
}

async function openMic() {
  return withTimeout(
    navigator.mediaDevices.getUserMedia({ audio: true }),
    30000,
    'Mikrofonilupaan ei vastattu 30 sekunnissa',
  );
}

async function onLevel() {
  say('mic-out', 'Puhu nyt mikrofoniin 4 sekunnin ajan…');
  mic.level = null;
  refreshMic(); // uusi yritys mitätöi edellisen tuloksen
  const t0 = performance.now();
  let stream;
  let ctx;
  try {
    stream = await openMic();
    const openMs = performance.now() - t0;
    const track = stream.getAudioTracks()[0];
    const s = track?.getSettings?.() ?? {};
    const settings = [
      s.sampleRate ? `${s.sampleRate} Hz` : null,
      s.channelCount ? `${s.channelCount} kanava` : null,
      `kaiunpoisto ${s.echoCancellation}`,
      `kohinanvaimennus ${s.noiseSuppression}`,
    ]
      .filter(Boolean)
      .join(', ');
    let devices = '?';
    try {
      devices = String((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').length);
    } catch {
      /* ei väliä */
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
    await ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let maxRms = 0;
    const end = performance.now() + 4000;
    while (performance.now() < end) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const x of buf) sum += x * x;
      const rms = Math.sqrt(sum / buf.length);
      if (rms > maxRms) maxRms = rms;
      $('meter').value = Math.min(1, rms * 4);
      await sleep(60);
    }
    mic.level = { sound: maxRms > 0.012, maxRms, openMs, settings, devices };
    say('mic-out', mic.level.sound ? 'Ääni havaittiin.' : 'Ääntä ei havaittu. Puhu lähempänä mikrofonia ja yritä uudelleen.');
  } catch (e) {
    mic.level = { error: describeMediaError(e) };
    say('mic-out', mic.level.error);
  } finally {
    $('meter').value = 0;
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
  }
  if (mic.perm !== 'granted' && navigator.permissions?.query) await passiveMic();
  refreshMic();
}

async function onRecord() {
  mic.rec = null;
  $('rec-confirm').hidden = true;
  $('rec-audio').hidden = true;
  refreshMic(); // uusi yritys mitätöi edellisen tuloksen
  if (typeof MediaRecorder === 'undefined') {
    mic.rec = { error: 'MediaRecorder ei ole tuettu' };
    say('mic-out', 'Selain ei tue äänitystä (MediaRecorder).');
    refreshMic();
    return;
  }
  say('mic-out', 'Äänitetään 3 sekuntia. Sano jokin lause.');
  let stream;
  try {
    stream = await openMic();
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) =>
      MediaRecorder.isTypeSupported?.(m),
    );
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    recorder.start();
    await sleep(3000);
    recorder.stop();
    await withTimeout(stopped, 5000, 'Äänitys ei päättynyt');
    const type = recorder.mimeType || mime || 'audio/webm';
    const blob = new Blob(chunks, { type });
    if (mic.url) URL.revokeObjectURL(mic.url);
    mic.url = URL.createObjectURL(blob);
    $('rec-audio').src = mic.url;
    $('rec-audio').hidden = false;
    mic.rec = { bytes: blob.size, mime: type, confirmed: null };
    if (blob.size > 0) {
      $('rec-confirm').hidden = false;
      say('mic-out', 'Äänitys valmis. Toista se alta ja vahvista, kuuluiko oma äänesi.');
    } else {
      say('mic-out', 'Äänitys tuotti tyhjän tiedoston.');
    }
  } catch (e) {
    mic.rec = { error: describeMediaError(e) };
    say('mic-out', mic.rec.error);
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
  refreshMic();
}

/* ---------- Offline ---------- */

const offline = {
  supported: 'serviceWorker' in navigator,
  secure: window.isSecureContext === true,
  error: null,
  ready: false,
  controlled: false,
  files: [],
  offlineOk: null,
};

function updateNetBadge() {
  $('net-badge').textContent = navigator.onLine ? 'verkossa' : 'ei verkkoa (offline)';
}

function refreshOffline() {
  const decision = decideOffline({
    supported: offline.supported,
    secure: offline.secure,
    error: offline.error,
    ready: offline.ready,
    controlled: offline.controlled,
    fileCount: offline.files.length,
    offlineOk: offline.offlineOk,
  });
  setResult('offline', decision.status, decision.summary, [
    `Service worker tuettu: ${offline.supported ? 'kyllä' : 'ei'}`,
    `Valmis: ${offline.ready ? 'kyllä' : 'ei'}, hallitsee sivua: ${offline.controlled ? 'kyllä' : 'ei'}`,
    `Välimuistissa: ${offline.files.join(', ') || 'ei mitään'}`,
    `Viimeisin offline-lataus: ${offline.offlineOk ?? 'ei vielä'}`,
    `Verkko nyt: ${navigator.onLine ? 'online' : 'offline'}`,
    ...(offline.error ? [`Virhe: ${offline.error}`] : []),
  ]);
}

async function passiveOffline() {
  offline.error = null;
  offline.ready = false;
  offline.controlled = false;
  offline.files = [];
  if (offline.supported && offline.secure) {
    try {
      let reg;
      try {
        reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      } catch (e) {
        reg = await navigator.serviceWorker.getRegistration('./');
        if (!reg) throw e;
      }
      await withTimeout(navigator.serviceWorker.ready, 8000, 'Service worker ei valmistunut 8 sekunnissa');
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          const done = () => {
            navigator.serviceWorker.removeEventListener('controllerchange', done);
            resolve();
          };
          navigator.serviceWorker.addEventListener('controllerchange', done);
          setTimeout(done, 2500);
        });
      }
      offline.ready = true;
      offline.controlled = Boolean(navigator.serviceWorker.controller);
      const names = (await caches.keys()).filter((n) => n.startsWith('laitetesti-'));
      for (const name of names) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) offline.files.push(new URL(req.url).pathname.split('/').pop() || '(juuri)');
      }
    } catch (e) {
      offline.error = e?.message ?? String(e);
    }
  }
  if (!navigator.onLine && offline.controlled) {
    offline.offlineOk = new Date().toISOString();
    store.set('lt.offlineOk', offline.offlineOk);
  } else {
    offline.offlineOk = store.get('lt.offlineOk');
  }
  refreshOffline();
}

/* ---------- Tallennus ---------- */

const storage = { idb: null, persisted: undefined, estimate: null, opens: null, probe: null };

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('laitetesti', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB-avaus esti'));
  });
}

function idbTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    let result;
    const req = fn(tx.objectStore('kv'));
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Tallennus keskeytyi'));
  });
}

async function readStorageManager() {
  try {
    storage.persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : undefined;
  } catch {
    storage.persisted = undefined;
  }
  try {
    storage.estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  } catch {
    storage.estimate = null;
  }
}

function refreshStorage() {
  const decision = decideStorage({ idb: storage.idb, persisted: storage.persisted, probe: storage.probe });
  const p = storage.probe;
  setResult('storage', decision.status, decision.summary, [
    `IndexedDB: ${storage.idb?.ok ? `toimii, sivu avattu ${storage.opens} kertaa` : `virhe ${storage.idb?.error ?? '?'}`}`,
    `Koe 1 Mt: ${
      p
        ? p.ok
          ? `läpi, kirjoitus ${fmtMs(p.writeMs)}, luku ${fmtMs(p.readMs)}`
          : `epäonnistui, ${p.error}`
        : 'ei ajettu'
    }`,
    `Pysyvä tallennus: ${storage.persisted === true ? 'kyllä' : storage.persisted === false ? 'ei' : 'ei tietoa'}`,
    `Käytetty ja kiintiö: ${storage.estimate ? `${fmtBytes(storage.estimate.usage)} / ${fmtBytes(storage.estimate.quota)}` : 'ei tietoa'}`,
  ]);
}

async function passiveStorage() {
  try {
    const db = await withTimeout(idbOpen(), 5000, 'IndexedDB ei avautunut 5 sekunnissa');
    try {
      const prev = (await idbTx(db, 'readonly', (st) => st.get('opens'))) ?? 0;
      await idbTx(db, 'readwrite', (st) => st.put(prev + 1, 'opens'));
      const now = await idbTx(db, 'readonly', (st) => st.get('opens'));
      storage.opens = now;
      storage.idb = now === prev + 1 ? { ok: true } : { ok: false, error: 'luettu arvo ei vastannut kirjoitettua' };
    } finally {
      db.close();
    }
  } catch (e) {
    storage.idb = { ok: false, error: errText(e) };
  }
  await readStorageManager();
  refreshStorage();
}

async function onIdbProbe() {
  say('store-out', 'Kirjoitetaan ja luetaan 1 Mt…');
  const probe = { ok: false };
  try {
    const data = new Uint8Array(1048576);
    for (let i = 0; i < data.length; i += 65536) crypto.getRandomValues(data.subarray(i, i + 65536));
    const sum = fnv1a(data);
    const db = await withTimeout(idbOpen(), 5000, 'IndexedDB ei avautunut 5 sekunnissa');
    try {
      const t0 = performance.now();
      await idbTx(db, 'readwrite', (st) => st.put(data.buffer.slice(0), 'probe'));
      const t1 = performance.now();
      const back = await idbTx(db, 'readonly', (st) => st.get('probe'));
      const t2 = performance.now();
      const same = back instanceof ArrayBuffer && back.byteLength === data.length && fnv1a(new Uint8Array(back)) === sum;
      await idbTx(db, 'readwrite', (st) => st.delete('probe'));
      Object.assign(probe, {
        ok: same,
        writeMs: t1 - t0,
        readMs: t2 - t1,
        error: same ? undefined : 'luettu data ei vastannut kirjoitettua',
      });
    } finally {
      db.close();
    }
  } catch (e) {
    probe.error = errText(e);
  }
  storage.probe = probe;
  await readStorageManager();
  say('store-out', probe.ok ? `Koe läpi: kirjoitus ${fmtMs(probe.writeMs)}, luku ${fmtMs(probe.readMs)}.` : `Koe epäonnistui: ${probe.error}`);
  refreshStorage();
}

async function onPersist() {
  if (!navigator.storage?.persist) {
    say('store-out', 'Selain ei tue pysyvän tallennuksen pyyntöä.');
    return;
  }
  const granted = await navigator.storage.persist();
  await readStorageManager();
  say(
    'store-out',
    granted
      ? 'Pysyvä tallennus myönnettiin.'
      : 'Selain ei myöntänyt pysyvää tallennusta. Chrome päättää sen itse; esimerkiksi sivun lisääminen kotinäytölle ja säännöllinen käyttö voivat auttaa.',
  );
  refreshStorage();
}

/* ---------- Tekoäly ---------- */

const ai = { last: null, meta: null };

function currentProvider() {
  return document.querySelector('input[name="provider"]:checked')?.value === 'gemini' ? 'gemini' : 'anthropic';
}

function updateForgetButton() {
  $('btn-forget').hidden = !PROVIDERS.some((p) => store.get(`lt.key.${p}`));
}

function applyProviderUi({ announce = false } = {}) {
  const p = currentProvider();
  const hadKey = Boolean($('api-key').value);
  $('note-anthropic').hidden = p !== 'anthropic';
  $('note-gemini').hidden = p !== 'gemini';
  $('api-model').value = store.get(`lt.model.${p}`) || MODEL_DEFAULTS[p];
  const saved = store.get(`lt.key.${p}`);
  // Avain on palvelukohtainen: kenttä tyhjennetään vaihdettaessa, ettei avain lähde väärälle palvelulle.
  $('api-key').value = saved ?? '';
  $('chk-remember').checked = Boolean(saved);
  $('model-list').replaceChildren();
  updateForgetButton();
  if (announce && hadKey && !saved) say('ai-out', 'Avainkenttä tyhjennettiin, koska avain kuuluu vain yhdelle palvelulle.');
}

function onKeyChanged() {
  const p = currentProvider();
  if ($('chk-remember').checked) {
    const v = $('api-key').value.trim();
    if (v) store.set(`lt.key.${p}`, v);
    else store.del(`lt.key.${p}`);
  }
  updateForgetButton();
}

function onRememberChanged() {
  const p = currentProvider();
  if ($('chk-remember').checked) {
    const v = $('api-key').value.trim();
    if (v) store.set(`lt.key.${p}`, v);
  } else {
    store.del(`lt.key.${p}`);
  }
  updateForgetButton();
}

function onForget() {
  for (const p of PROVIDERS) store.del(`lt.key.${p}`);
  $('api-key').value = '';
  $('chk-remember').checked = false;
  updateForgetButton();
  say('ai-out', 'Tallennetut avaimet poistettiin tältä laitteelta.');
}

function onShowKey() {
  const input = $('api-key');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('btn-showkey').setAttribute('aria-pressed', String(show));
}

function refreshAi() {
  const decision = decideAi(ai.last);
  const details = [];
  const m = ai.meta;
  const r = ai.last;
  if (m && r) {
    details.push(`Palvelu: ${PROVIDER_LABEL[m.provider]}`);
    const echoed = r.model && r.model !== m.model ? ` (vastauksen malli: ${r.model})` : '';
    details.push(`Malli: ${m.model}${echoed}`);
    if (r.aborted) details.push('Virhe: aikakatkaisu 40 s');
    else if (r.networkError) {
      details.push(
        `Verkko: ${r.offline ? 'ei verkkoa' : 'online'}`,
        `Selaimen virheilmoitus: ${r.message ?? 'ei tietoa'}`,
        'Huomio: selain ei kerro, oliko syy CORS vai verkko',
      );
    } else if (!r.ok) {
      details.push(`HTTP: ${r.httpStatus}`, `Virhetyyppi: ${r.error?.kind}`, `Selite: ${r.error?.hint ?? ''}`);
    } else {
      details.push(
        `HTTP: ${r.httpStatus}, viive ${fmtMs(r.ms)}`,
        `Tokenit: syöte ${r.usage?.input ?? '?'}, tulos ${r.usage?.output ?? '?'}`,
        `Lopetussyy: ${r.stop ?? 'ei tietoa'}`,
        `Palautteen JSON: ${
          r.feedbackOk
            ? `kelvollinen, ${r.feedback.issues.length} huomautusta`
            : `virheellinen (${(r.problems ?? []).join('; ') || 'tyhjä vastaus'})`
        }`,
      );
    }
  } else {
    details.push('Avainta ei ole vielä käytetty');
  }
  setResult('ai', decision.status, decision.summary, details);
}

async function aiFetch(req, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(req.url, {
      ...req.init,
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'error',
    });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { aborted: ctrl.signal.aborted, networkError: !ctrl.signal.aborted, message: e?.message };
  } finally {
    clearTimeout(timer);
  }
}

async function onAiCall() {
  const provider = currentProvider();
  const check = validateKey(provider, $('api-key').value);
  if (!check.ok) {
    say('ai-out', check.message);
    return;
  }
  const model = normalizeModel($('api-model').value);
  if (!MODEL_RE.test(model)) {
    say('ai-out', 'Mallin nimi on virheellinen. Käytä vain kirjaimia, numeroita, pisteitä, viivoja ja alaviivoja.');
    return;
  }
  $('api-model').value = model;
  store.set(`lt.model.${provider}`, model);
  ai.last = null; // uusi yritys mitätöi edellisen tuloksen
  ai.meta = null;
  refreshAi();
  say('ai-out', `Lähetetään testikutsu: ${PROVIDER_LABEL[provider]}, ${model}…`);
  const args = { apiKey: check.key, model, system: FEEDBACK_SYSTEM, user: FEEDBACK_USER };
  const req = provider === 'anthropic' ? buildAnthropicRequest(args) : buildGeminiRequest(args);
  const t0 = performance.now();
  const net = await aiFetch(req, 40000);
  const ms = performance.now() - t0;
  let r;
  if (net.aborted) r = { aborted: true };
  else if (net.networkError) r = { networkError: true, offline: !navigator.onLine, message: net.message };
  else r = { ...interpretAiResponse(provider, net.status, net.body), ms };
  ai.last = r;
  ai.meta = { provider, model };
  const raw = $('ai-raw');
  if (r.ok) {
    raw.textContent = clean(r.feedback ? JSON.stringify(r.feedback, null, 2) : String(r.text ?? '')).slice(0, 4000);
  } else {
    raw.textContent = clean(r.error?.hint ?? r.message ?? '');
  }
  const decision = decideAi(r);
  say('ai-out', decision.summary);
  refreshAi();
}

async function onModels() {
  const provider = currentProvider();
  const check = validateKey(provider, $('api-key').value);
  if (!check.ok) {
    say('ai-out', check.message);
    return;
  }
  say('ai-out', 'Haetaan mallilistaa…');
  const net = await aiFetch(buildModelsRequest(provider, check.key), 20000);
  if (net.aborted) return say('ai-out', 'Aikakatkaisu mallilistaa haettaessa.');
  if (net.networkError) {
    return say(
      'ai-out',
      navigator.onLine
        ? 'Pyyntö ei mennyt läpi: verkkovirhe tai selain esti sen (CORS).'
        : 'Laite ei ole verkossa.',
    );
  }
  if (net.status < 200 || net.status >= 300) return say('ai-out', classifyApiError(provider, net.status, net.body).hint);
  let ids;
  try {
    ids = parseModelsResponse(provider, JSON.parse(net.body));
  } catch {
    return say('ai-out', 'Mallilistan vastaus ei ollut JSONia.');
  }
  const list = $('model-list');
  list.replaceChildren();
  for (const id of ids) {
    const o = document.createElement('option');
    o.value = id;
    list.append(o);
  }
  say('ai-out', ids.length ? `Löytyi ${ids.length} mallia. Napauta mallikenttää ja valitse listasta.` : 'Mallilista oli tyhjä.');
}

/* ---------- Raportin kopiointi ---------- */

async function copyReport() {
  const ta = $('report');
  try {
    await navigator.clipboard.writeText(ta.value);
    say('copy-status', 'Raportti kopioitu leikepöydälle.');
    return;
  } catch {
    /* kokeillaan varatietä */
  }
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  say('copy-status', ok ? 'Raportti kopioitu.' : 'Kopiointi ei onnistunut. Valitse raportin teksti ja kopioi se käsin.');
}

/* ---------- Käynnistys ---------- */

// Jokainen automaattinen vaihe merkitään vartijalla. Jos vaihe kaatoi välilehden edellisellä kerralla,
// se ohitetaan seuraavassa latauksessa, kunnes käyttäjä painaa "Aja automaattiset tarkistukset uudelleen".
async function safe(id, fn, { force = false } = {}) {
  const step = `passive-${id}`;
  const earlier = store.get(crashKey(step));
  if (earlier && !force) {
    setResult(id, 'fail', 'Edellinen automaattinen tarkistus keskeytyi, joten sitä ei ajettu itsestään. Paina "Aja automaattiset tarkistukset uudelleen" yrittääksesi.', [
      `Keskeytynyt yritys: ${earlier}`,
      'Syy: välilehti kaatui tai se suljettiin kesken tarkistuksen',
    ]);
    return;
  }
  await armCrash(step);
  try {
    await fn();
  } catch (e) {
    recordError(`${id}: ${e?.message ?? e}`);
    setResult(id, 'fail', `Testi kaatui: ${e?.message ?? e}`, []);
  }
  clearCrash(step);
}

async function runPassive({ force = false } = {}) {
  await safe('env', testEnv, { force });
  await safe('tts', passiveTts, { force });
  await safe('asr', passiveAsr, { force });
  await safe('mic', passiveMic, { force });
  await safe('offline', passiveOffline, { force });
  await safe('storage', passiveStorage, { force });
  if (!results.ai) refreshAi();
  document.body.dataset.passive = 'done';
}

function init() {
  $('tts-sentence').textContent = TTS_SENTENCE;

  const sel = $('asr-sentence');
  for (const s of ASR_SENTENCES) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.text} (${s.focus})`;
    sel.append(o);
  }
  $('asr-target').textContent = ASR_SENTENCES[0].text;
  sel.addEventListener('change', () => {
    $('asr-target').textContent = currentAsrSentence().text;
  });

  if (window.top !== window.self) $('frame-warning').hidden = false;
  updateNetBadge();
  window.addEventListener('online', () => {
    updateNetBadge();
    refreshOffline();
  });
  window.addEventListener('offline', () => {
    updateNetBadge();
    refreshOffline();
  });

  applyProviderUi();
  document.querySelectorAll('input[name="provider"]').forEach((r) =>
    r.addEventListener('change', () => applyProviderUi({ announce: true })),
  );
  $('api-key').addEventListener('input', onKeyChanged);
  $('chk-remember').addEventListener('change', onRememberChanged);
  $('btn-showkey').addEventListener('click', onShowKey);
  $('btn-forget').addEventListener('click', onForget);
  $('api-model').addEventListener('input', () => store.set(`lt.model.${currentProvider()}`, $('api-model').value.trim()));

  $('btn-passive').addEventListener('click', () => guarded('passive', () => runPassive({ force: true })));
  document.querySelectorAll('.js-copy').forEach((b) => b.addEventListener('click', copyReport));
  $('btn-speak').addEventListener('click', () => guarded('tts', onSpeak));
  $('voice').addEventListener('change', refreshTts);
  $('btn-heard-yes').addEventListener('click', () => {
    tts.confirmed = true;
    $('tts-confirm').hidden = true;
    refreshTts();
  });
  $('btn-heard-no').addEventListener('click', () => {
    tts.confirmed = false;
    $('tts-confirm').hidden = true;
    refreshTts();
  });
  $('btn-local-check').addEventListener('click', () => guarded('local-check', onLocalCheck));
  $('btn-install').addEventListener('click', () => guarded('install', onInstall));
  $('btn-listen').addEventListener('click', () => guarded('asr', onListen));
  $('btn-level').addEventListener('click', () => guarded('mic-level', onLevel));
  $('btn-record').addEventListener('click', () => guarded('mic-rec', onRecord));
  $('btn-rec-yes').addEventListener('click', () => {
    if (mic.rec) mic.rec.confirmed = true;
    $('rec-confirm').hidden = true;
    refreshMic();
  });
  $('btn-rec-no').addEventListener('click', () => {
    if (mic.rec) mic.rec.confirmed = false;
    $('rec-confirm').hidden = true;
    refreshMic();
  });
  $('btn-idb').addEventListener('click', () => guarded('idb', onIdbProbe));
  $('btn-persist').addEventListener('click', () => guarded('persist', onPersist));
  $('btn-models').addEventListener('click', () => guarded('models', onModels));
  $('btn-ai').addEventListener('click', () => guarded('ai', onAiCall));

  renderReport();
  guarded('passive', runPassive);
}

init();
