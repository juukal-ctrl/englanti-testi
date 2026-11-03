// Puhesynteesi (TTS) ja puheentunnistus (ASR) selaimen omilla rajapinnoilla.
// Pixel 10 Pro XL / Chrome 156 -mittauksista (3.11.2026): paikallinen en-US-ääni, käynnistyy ~15–70 ms;
// tunnistus toimii verkossa (varmuus ~0,97) ja lentokonetilassa (varmuus 0,00 eli vain täsmäys käytössä).

import { sleep } from './util.js';
import { speakable } from './speakable.js';

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;

export const ttsSupported = () => Boolean(synth) && typeof SpeechSynthesisUtterance !== 'undefined';
export const asrSupported = () => Boolean(SR);

/* ---------- Äänet ---------- */

let voicesPromise = null;

export function loadVoices() {
  if (!synth) return Promise.resolve([]);
  voicesPromise ??= new Promise((resolve) => {
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
  return voicesPromise;
}

/** Englanninkieliset äänet parhaimmasta alkaen: paikallinen en-US, verkko-en-US, muut englannit. */
export function rankVoices(voices) {
  const lang = (v) => String(v.lang || '').replace('_', '-').toLowerCase();
  const rank = (v) => {
    const l = lang(v);
    if (l === 'en-us') return v.localService ? 0 : 1;
    if (l.startsWith('en')) return 2;
    return 9;
  };
  return [...voices]
    .filter((v) => rank(v) < 9)
    .sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
}

async function pickVoice(voiceURI) {
  const list = rankVoices(await loadVoices());
  return list.find((v) => v.voiceURI === voiceURI) ?? list[0] ?? null;
}

// Jokainen uusi toisto tai pysäytys kasvattaa tätä. Jono (speakSequence) lopettaa, jos luku on vaihtunut,
// joten pysäytys tai toinen toisto katkaisee myös jonon seuraavat osat.
let epoch = 0;

export function stopSpeaking() {
  epoch++;
  if (synth) synth.cancel();
}

/**
 * Lukee tekstin ääneen. Palauttaa { ok, kind, error? } kun puhe on päättynyt tai epäonnistunut.
 * Kahdessa vartijassa: ei käynnistynyt 6 s:ssa, tai ei päättynyt 30 s:ssa.
 */
export async function speak(text, opts = {}) {
  const mine = ++epoch;
  return speakOne(text, opts, { fresh: true, alive: () => epoch === mine });
}

/**
 * Lukee useita tekstejä peräkkäin lyhyin tauoin (esim. ilmaus ja esimerkkilause).
 * Pysähtyy, jos käyttäjä pysäyttää toiston tai käynnistää toisen.
 */
export async function speakSequence(texts, { pauseMs = 450, ...opts } = {}) {
  const parts = texts.map((t) => speakable(t)).filter(Boolean);
  if (!ttsSupported() || !parts.length) return { ok: false, kind: 'unsupported' };
  const mine = ++epoch;
  let last = { ok: true, kind: 'end' };
  for (let i = 0; i < parts.length; i++) {
    if (epoch !== mine) return { ok: true, kind: 'stopped' };
    last = await speakOne(parts[i], opts, { fresh: i === 0, alive: () => epoch === mine });
    if (!last.ok || last.kind !== 'end') return last;
    if (i < parts.length - 1) await sleep(pauseMs);
  }
  return last;
}

async function speakOne(text, { rate = 1, voiceURI = '', onStart } = {}, { fresh = true, alive = () => true } = {}) {
  const spoken = speakable(text);
  if (!ttsSupported() || !spoken) return { ok: false, kind: 'unsupported' };
  if (fresh) {
    synth.cancel();
    await sleep(60); // Chrome pudottaa joskus puheen, jos speak() tulee heti cancel():in jälkeen
  }
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = 'en-US';
  const voice = await pickVoice(voiceURI);
  if (!alive()) return { ok: true, kind: 'stopped' }; // käyttäjä ehti pysäyttää tai käynnistää toisen toiston
  if (voice) u.voice = voice;
  u.rate = rate;
  return new Promise((resolve) => {
    let started = false;
    let settled = false;
    let watchdog;
    let hardStop;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      clearTimeout(hardStop);
      resolve(value);
    };
    watchdog = setTimeout(() => {
      if (!started) {
        synth.cancel();
        settle({ ok: false, kind: 'no-start' });
      }
    }, 6000);
    hardStop = setTimeout(() => {
      synth.cancel();
      settle({ ok: false, kind: 'timeout' });
    }, 30000);
    u.onstart = () => {
      started = true;
      onStart?.();
    };
    u.onend = () => settle({ ok: true, kind: 'end' });
    u.onerror = (e) => settle({ ok: e.error === 'interrupted' || e.error === 'canceled', kind: 'error', error: e.error });
    synth.speak(u);
  });
}

/* ---------- Puheentunnistus ---------- */

export function asrErrorText(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofonin käyttö on estetty. Salli mikrofoni selaimen osoitekentän kuvakkeesta tai käytä kirjoittamista.';
    case 'no-speech':
      return 'En kuullut puhetta. Yritä uudelleen lähempänä mikrofonia.';
    case 'audio-capture':
      return 'Mikrofonia ei löytynyt.';
    case 'network':
      return 'Puheentunnistus ei ollut käytettävissä (verkko). Kokeile uudelleen tai kirjoita vastaus.';
    case 'language-not-supported':
      return 'Englannin tunnistus ei ole tällä laitteella käytettävissä.';
    case 'timeout':
      return 'Kuuntelu aikakatkaistiin. Yritä uudelleen.';
    case 'start-failed':
      return 'Kuuntelun käynnistys epäonnistui. Yritä uudelleen.';
    case 'aborted':
      return '';
    default:
      return 'Puheentunnistus epäonnistui. Yritä uudelleen tai kirjoita vastaus.';
  }
}

/**
 * Kuuntelee yhden lauseen. Palauttaa { promise, abort }.
 * promise → { transcript, alternatives, confidence } tai { error }.
 * Luottamusarvo voi olla 0 (lentokonetilassa), jolloin vain täsmäys on käytettävissä.
 */
export function listen({ onInterim, onStart } = {}) {
  let rec = null;
  let abortNow = () => {};
  const promise = new Promise((resolve) => {
    if (!SR) return resolve({ error: 'unsupported' });
    try {
      rec = new SR();
    } catch (e) {
      return resolve({ error: 'start-failed', message: e?.message });
    }
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.continuous = false;

    let finished = false;
    let heard = null;
    let interim = '';
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
      resolve(info);
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
    abortNow = () => finish({ error: 'aborted' });

    rec.onaudiostart = () => {
      arm(15000, 'timeout');
      onStart?.();
    };
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      const last = e.results[e.results.length - 1];
      if (last.isFinal) {
        heard = {
          transcript: text.trim(),
          confidence: last[0].confidence,
          alternatives: Array.from(last).map((a) => a.transcript),
        };
        setTimeout(() => conclude('no-result'), 300);
      } else {
        interim = text.trim();
        onInterim?.(interim);
      }
    };
    rec.onerror = (e) => finish({ error: e.error || 'unknown', message: e.message });
    rec.onend = () => conclude('no-speech');

    arm(30000, 'timeout');
    try {
      rec.start();
    } catch (e) {
      finish({ error: 'start-failed', message: e?.message });
    }
  });
  return { promise, abort: () => abortNow() };
}
