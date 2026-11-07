// Päivän session suunnittelu: aikabudjetit ja kirjoitustehtävän valinta.
// Puhtaita funktioita, joten ne voi testata ilman selainta (tests/plan.test.mjs).
//
// Periaate: kaikki harjoitukset ovat saman päivän session sisällä (kertaus, uudet ilmaukset, kirjoitus, puhe), ja
// sessio on aikarajattu. Kirjoitus on mukana vain joka N:ntenä päivänä, koska yksi viesti vie noin viisi–kuusi minuuttia.

import { dayIndex } from './util.js';
import { WRITING_TASKS } from '../data/writing.js';

export const REVIEW_SHARE = 0.45; // kertaus saa enintään tämän osuuden ajasta, jotta uutta ehtii aina
export const REVIEW_SHARE_WITH_WRITING = 0.3; // kirjoituspäivänä kertaukselle jää vähemmän, jotta kirjoitus ehtii
export const SPEAK_RESERVE_MS = 3 * 60000; // puheharjoitukselle varattu loppuaika
export const SPEAK_MIN_MS = 90000; // kirjoituspäivänä puheelle varataan vähintään kolme lausetta
export const CHUNK_RESERVE_MS = 2.5 * 60000; // uutta ryhmää ei aloiteta, ellei sille jää tämän verran aikaa
export const SHADOW_TASK_MS = 30000; // arvio yhden puhetehtävän kestosta
export const WRITE_BASE_MS = 90000; // tilanteen ja saadun viestin lukeminen sekä palautteen katsominen
export const WRITE_WPM = 18; // kirjoitusnopeus puhelimella vieraalla kielellä (sanaa minuutissa, ajattelu mukaan lukien)
export const WRITE_MAX_SHARE = 0.5; // kirjoitus on mukana vain, jos se vie enintään tämän osuuden sessiosta

/** Lokista tehtäväkohtainen tila: yritykset ja onko tehtävä tehty (merkitty valmiiksi tai virheetön yritys). */
export function summarizeLog(log) {
  const map = new Map();
  for (const e of Array.isArray(log) ? log : []) {
    const s = map.get(e.id) ?? { attempts: 0, done: false, last: null };
    if (!e.done) s.attempts++;
    if (e.done || e.clean) s.done = true;
    s.last = e;
    map.set(e.id, s);
  }
  return map;
}

/** Tehtävän arvioitu kesto millisekunteina (30 sekunnin tarkkuudella). */
export function estimateWriteMs(task) {
  const [min, max] = task.words;
  const ms = WRITE_BASE_MS + (((min + max) / 2) / WRITE_WPM) * 60000;
  return Math.round(ms / 30000) * 30000;
}

/** Viimeisin päivä, jona kirjoitusta on harjoiteltu (mikä tahansa kirjattu yritys), tai null. */
export function lastWriteDay(log, dayOf = (ts) => dayIndex(ts)) {
  let last = null;
  for (const e of Array.isArray(log) ? log : []) {
    if (typeof e?.ts !== 'number' || !Number.isFinite(e.ts)) continue;
    const d = dayOf(e.ts);
    if (last == null || d > last) last = d;
  }
  return last;
}

/** Onko kirjoituksen vuoro: ei, jos asetus on pois päältä tai jos on jo kirjoitettu tänään tai liian äskettäin. */
export function writingDue({ every, today, lastDay }) {
  if (!(every >= 1)) return false;
  if (lastDay == null) return true;
  return today - lastDay >= every;
}

/** Tehtävän harjoiteltavien ilmausten tunnisteet. */
export function practiceIds(task) {
  return (task.use ?? []).map((u) => (typeof u === 'string' ? u : u.id));
}

/** Tehtävä sopii vasta, kun vähintään puolet sen harjoiteltavista ilmauksista on opittu: kirjoitus vahvistaa opittua. */
export function isEligible(task, isLearned) {
  const ids = practiceIds(task);
  if (!ids.length) return true;
  return ids.filter((id) => isLearned(id)).length >= Math.ceil(ids.length / 2);
}

/**
 * Valitsee sessioon kirjoitustehtävän:
 *  1. aloitettu luonnos (tekemätön tehtävä, jossa on tekstiä),
 *  2. ensimmäinen tekemätön tehtävä, jonka ilmaukset on opittu,
 *  3. kun kaikki on tehty, vanhimmin kirjoitettu tehtävä uudelleen.
 * Muuten null, esimerkiksi heti alussa, kun mitään ei vielä ole opittu.
 */
export function pickWritingTask({ tasks = WRITING_TASKS, state, drafts = {}, isLearned }) {
  const done = (t) => Boolean(state.get(t.id)?.done);
  const draft = tasks.find((t) => !done(t) && String(drafts?.[t.id]?.text ?? '').trim());
  if (draft) return draft;
  const fresh = tasks.find((t) => !done(t) && isEligible(t, isLearned));
  if (fresh) return fresh;
  if (tasks.length && tasks.every(done)) {
    return [...tasks].sort((a, b) => (state.get(a.id)?.last?.ts ?? 0) - (state.get(b.id)?.last?.ts ?? 0))[0];
  }
  return null;
}

/** Päivän kirjoitusosio: { task, ms } tai null, jos tänään ei kirjoiteta. */
export function planWriting({ every, today, log, drafts, isLearned, totalMs, tasks = WRITING_TASKS }) {
  if (!writingDue({ every, today, lastDay: lastWriteDay(log) })) return null;
  const task = pickWritingTask({ tasks, state: summarizeLog(log), drafts, isLearned });
  if (!task) return null;
  const ms = estimateWriteMs(task);
  if (ms > totalMs * WRITE_MAX_SHARE) return null;
  return { task, ms };
}

/** Aikabudjetit: kertaukselle, uuden sisällön lopetusrajat, puheelle ja kirjoitukselle varattu aika. */
export function planBudgets(totalMs, writeMs = 0) {
  const writing = writeMs > 0;
  return {
    reviewMs: totalMs * (writing ? REVIEW_SHARE_WITH_WRITING : REVIEW_SHARE),
    speakReserveMs: Math.min(writing ? SPEAK_MIN_MS : SPEAK_RESERVE_MS, totalMs * 0.2),
    chunkReserveMs: Math.min(CHUNK_RESERVE_MS, totalMs * 0.25),
    writeReserveMs: writing ? writeMs : 0,
  };
}
