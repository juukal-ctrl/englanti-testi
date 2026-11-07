// Shadowing-oppitunnin suunnittelu (puhdas moduuli, ei selainriippuvuuksia): vaiheet, kertausväli ja oppitunnin kokoaminen.
//
// Perusta (Hamada; Kadota ja Tamai; Foote ja McDonough; ks. README): lyhyt kappale, joka on helppo tai tuttu sisällöltään;
// kuuntele → ymmärrä → lue mukana → toista äänen perässä tekstin kanssa → ilman tekstiä; sama kappale palaa usean päivän
// välein, koska pelkkä toisto samassa istunnossa tasaantuu neljän tai viiden kierroksen jälkeen. Sovellus ei arvioi
// puhettasi (puhetta ei voi tunnistaa luotettavasti samalla, kun malli soi), joten oppija arvioi itse, miten sujui.

import { SHADOW_PASSAGES } from '../data/shadow.js';

/** Kertausvälit päivinä: kuinka pian kappale palaa, kun se on onnistunut 0, 1, 2 … kertaa. */
export const SHADOW_INTERVALS = [1, 3, 7, 14, 30];
/** Vaihe, josta alkaen kappale lasketaan opituksi. */
export const MASTERED_STAGE = 5;
export const MAX_REVIEWS_PER_LESSON = 3;
/** Oppitunti saa ylittää tavoiteajan tämän verran, jotta kappale ei jää kesken. */
export const LESSON_SLACK_MS = 90000;

const WORDS_PER_SECOND = 2.5; // arvio luonnollisesta puhenopeudesta
const LINE_GAP_MS = 350; // tauko lauseiden välillä (sama kuin soitossa)
const PASS_OVERHEAD_MS = 3500; // napin painallus ja hengähdys kierrosten välillä
const READ_STAGE_MS = 75000; // tekstin, suomennoksen ja avainsanojen lukeminen
const RATE_STAGE_MS = 10000; // itsearvio

export const RATINGS = ['good', 'ok', 'hard'];

export const STAGE_LABELS = {
  listen: 'Kuuntele',
  read: 'Lue ja ymmärrä',
  along: 'Lue mukana',
  text: 'Toista tekstin kanssa',
  blind: 'Toista ilman tekstiä',
  record: 'Nauhoita ja vertaa',
  rate: 'Miten sujui?',
};

/** Soittonopeudet: factor kertoo asetusten puhenopeuteen (sekä leikkeille että laitteen äänelle). */
export const SPEEDS = {
  slow: { label: 'Hidas', factor: 0.8 },
  normal: { label: 'Normaali', factor: 1 },
  fast: { label: 'Nopea', factor: 1.15 },
};
export const SPEED_IDS = Object.keys(SPEEDS);

/* ---------- Kappaleen mitat ---------- */

export const wordCount = (passage) => passage.lines.join(' ').split(/\s+/).filter(Boolean).length;

/** Arvio yhden kierroksen äänen kestosta (ms). */
export function audioMs(passage, speed = 'normal') {
  const base = (wordCount(passage) / WORDS_PER_SECOND) * 1000 + Math.max(0, passage.lines.length - 1) * LINE_GAP_MS;
  return Math.round(base / (SPEEDS[speed]?.factor ?? 1));
}

/* ---------- Vaiheet ---------- */

/** Uuden kappaleen vaiheet. record: tarjotaanko nauhoitusta (valinnainen vaihe). */
export function newStages({ record = true } = {}) {
  return [
    { id: 'listen', passes: 1, text: false, speed: 'normal' },
    { id: 'read', passes: 0, text: true },
    { id: 'along', passes: 1, text: true, speed: 'normal' },
    { id: 'text', passes: 3, text: true, speed: 'normal' },
    { id: 'blind', passes: 2, text: false, speed: 'normal' },
    ...(record ? [{ id: 'record', passes: 1, text: false, speed: 'normal', optional: true }] : []),
    { id: 'rate' },
  ];
}

/** Kertauskappaleen vaiheet kappaleen tilan mukaan: vahva kappale kerrataan ilman tekstiä ja nopeammin. */
export function reviewStages(state, { record = true } = {}) {
  const stage = state?.stage ?? 0;
  const strong = stage >= 3 && state?.rating === 'good';
  const core = strong
    ? [{ id: 'blind', passes: 2, text: false, speed: 'fast' }]
    : [
        { id: 'text', passes: 1, text: true, speed: 'normal' },
        { id: 'blind', passes: 2, text: false, speed: 'normal' },
      ];
  return [...core, ...(record && stage >= 2 ? [{ id: 'record', passes: 1, text: false, speed: 'normal', optional: true }] : []), { id: 'rate' }];
}

export const stagePasses = (stages) => stages.reduce((n, s) => n + (s.passes ?? 0), 0);

/** Arvio kappaleen läpikäynnin kestosta (ms). */
export function estimateMs(passage, stages) {
  const perPass = audioMs(passage) + PASS_OVERHEAD_MS;
  return stagePasses(stages) * perPass + (stages.some((s) => s.id === 'read') ? READ_STAGE_MS : 0) + RATE_STAGE_MS;
}

/* ---------- Kertausaikataulu ---------- */

/**
 * Tila arvosanan jälkeen. prev = edellinen tila tai undefined (uusi kappale), rating = 'good' | 'ok' | 'hard', today = päivänumero.
 *  good: vaihe kasvaa ja seuraava kertaus on vaihetta vastaavan välin päässä.
 *  ok:   vaihe säilyy (vähintään 1) ja väli toistuu yhtä askelta lyhyempänä.
 *  hard: vaihe laskee yhdellä ja kappale palaa huomenna.
 */
export function nextState(prev, rating, today, passes = 0) {
  const stage = prev?.stage ?? 0;
  let next;
  let days;
  if (rating === 'good') {
    next = stage + 1;
    days = SHADOW_INTERVALS[Math.min(stage, SHADOW_INTERVALS.length - 1)];
  } else if (rating === 'ok') {
    next = Math.max(1, stage);
    days = stage <= 1 ? 1 : SHADOW_INTERVALS[Math.min(stage - 1, SHADOW_INTERVALS.length - 1)];
  } else {
    next = Math.max(0, stage - 1);
    days = 1;
  }
  return {
    stage: next,
    due: today + days,
    last: today,
    first: prev?.first ?? today,
    rating,
    plays: (prev?.plays ?? 0) + Math.max(0, Math.round(passes)),
    sessions: (prev?.sessions ?? 0) + 1,
  };
}

/** Tarkistaa tallennetun lokin (esim. varmuuskopiosta tai vanhasta versiosta). Tuntemattomat kappaleet ja virheelliset kentät pudotetaan. */
export function cleanShadowLog(raw, passages = SHADOW_PASSAGES) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const known = new Set(passages.map((p) => p.id));
  const int = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
  for (const [id, s] of Object.entries(raw)) {
    if (!known.has(id) || !s || typeof s !== 'object') continue;
    const stage = int(s.stage, 0, 50);
    const due = int(s.due, 0, 1e6);
    const last = int(s.last, 0, 1e6);
    if (stage == null || due == null || last == null) continue;
    out[id] = {
      stage,
      due,
      last,
      first: int(s.first, 0, 1e6) ?? last,
      rating: RATINGS.includes(s.rating) ? s.rating : 'ok',
      plays: int(s.plays, 0, 1e6) ?? 0,
      sessions: int(s.sessions, 0, 1e6) ?? 1,
    };
  }
  return out;
}

/** Yhdistää kaksi lokia (varmuuskopion tuonti): kappaleesta voittaa viimeksi harjoiteltu tila, tasatilanteessa useammin harjoiteltu. */
export function mergeShadowLogs(a, b) {
  const out = { ...a };
  for (const [id, s] of Object.entries(b ?? {})) {
    const cur = out[id];
    out[id] = !cur || s.last > cur.last || (s.last === cur.last && s.sessions > cur.sessions) ? s : cur;
  }
  return out;
}

/** Erääntyneet kappaleet: vanhimmat ensin, samalla päivällä heikommat (matalampi vaihe) ensin. */
export function dueList({ passages = SHADOW_PASSAGES, log, today }) {
  return passages
    .filter((p) => log[p.id] && log[p.id].due <= today)
    .sort((a, b) => log[a.id].due - log[b.id].due || log[a.id].stage - log[b.id].stage || passages.indexOf(a) - passages.indexOf(b));
}

/**
 * Kokoaa oppitunnin: ensin erääntyneet kertaukset (enintään MAX_REVIEWS_PER_LESSON), sitten uusia kappaleita, kunnes tavoiteaika
 * (totalMs) tulee vastaan. Palauttaa [{ kind: 'review' | 'new', passage, stages, state, estMs }]. Ei koskaan tyhjää, jos kappaleita on:
 * jos mitään ei ole erääntynyt eikä uutta ole, harjoitellaan vähiten äskettäin harjoiteltua kappaletta.
 */
export function planLesson({ passages = SHADOW_PASSAGES, log, today, totalMs, record = true }) {
  const items = [];
  let used = 0;
  const fits = (ms) => items.length === 0 || used + ms <= totalMs + LESSON_SLACK_MS;
  const add = (kind, passage) => {
    const state = log[passage.id];
    const stages = kind === 'new' ? newStages({ record }) : reviewStages(state, { record });
    const estMs = estimateMs(passage, stages);
    if (!fits(estMs)) return false;
    items.push({ kind, passage, stages, state, estMs });
    used += estMs;
    return true;
  };
  for (const p of dueList({ passages, log, today }).slice(0, MAX_REVIEWS_PER_LESSON)) if (!add('review', p)) break;
  for (const p of passages) {
    if (log[p.id]) continue;
    if (!add('new', p)) break;
  }
  if (!items.length) {
    const oldest = [...passages].filter((p) => log[p.id]).sort((a, b) => log[a.id].last - log[b.id].last || log[a.id].due - log[b.id].due);
    for (const p of oldest.slice(0, 2)) if (!add('review', p)) break;
  }
  return items;
}

/** Luvut Tänään-näkymään ja yhteenvetoon. */
export function summarizeShadow(log, passages = SHADOW_PASSAGES, today = 0) {
  const seen = passages.filter((p) => log[p.id]);
  return {
    total: passages.length,
    seen: seen.length,
    due: seen.filter((p) => log[p.id].due <= today).length,
    mastered: seen.filter((p) => log[p.id].stage >= MASTERED_STAGE).length,
    unseen: passages.length - seen.length,
  };
}

/** Seuraavan kertauksen päivä kaikista kappaleista (vähintään huomenna) tai null. */
export function nextDueDay(log, today) {
  const days = Object.values(log).map((s) => s.due).filter((d) => d > today);
  return days.length ? Math.min(...days) : null;
}

/* ---------- Oppitunnin esitys (puhtaita apufunktioita näkymälle) ---------- */

/** Päivien määrä suomeksi: "huomenna" tai "3 pv päästä". */
export function dueText(days) {
  return days <= 1 ? 'huomenna' : `${days} pv päästä`;
}

/** Oppitunnin kappalevaiheiden nimet: "Uusi", "Kertaus" tai numeroituna, jos samanlaisia on useita. */
export function phaseLabels(plan) {
  const total = { review: 0, new: 0 };
  for (const it of plan) total[it.kind]++;
  const seen = { review: 0, new: 0 };
  return plan.map((it, i) => {
    seen[it.kind]++;
    const base = it.kind === 'new' ? 'Uusi' : 'Kertaus';
    return { id: String(i), label: total[it.kind] > 1 ? `${base} ${seen[it.kind]}` : base };
  });
}

/** Kappaleen vaiheet yksittäisiksi siirtymiksi: yksi per kierros sekä lukeminen, nauhoitus ja arvio. */
export function buildMoves(stages) {
  const moves = [];
  for (const stage of stages) {
    if (stage.id === 'read' || stage.id === 'record' || stage.id === 'rate') moves.push({ kind: stage.id, stage });
    else for (let n = 1; n <= stage.passes; n++) moves.push({ kind: 'pass', stage, n, of: stage.passes });
  }
  return moves;
}

export function nextLabelFor(move, next) {
  if (!next) return 'Valmis';
  if (next.kind === 'pass' && next.stage === move.stage) return `Kierros ${next.n} / ${next.of}`;
  return `Jatka: ${STAGE_LABELS[next.stage.id]}`;
}
