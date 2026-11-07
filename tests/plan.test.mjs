import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, UNIT_ORDER } from '../data/units.js';
import { WRITING_TASKS } from '../data/writing.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../js/settings.js';
import { dayIndex } from '../js/util.js';
import {
  summarizeLog,
  estimateWriteMs,
  lastWriteDay,
  writingDue,
  practiceIds,
  isEligible,
  pickWritingTask,
  planWriting,
  planBudgets,
  SPEAK_RESERVE_MS,
  SPEAK_MIN_MS,
  CHUNK_RESERVE_MS,
  REVIEW_SHARE,
  REVIEW_SHARE_WITH_WRITING,
} from '../js/plan.js';

const MIN = 60000;
const TASK = (id) => WRITING_TASKS.find((t) => t.id === id);
const idsOfUnit = (unitId) => UNITS.find((u) => u.id === unitId).items.map((i) => i.id);
/** Paikallinen keskipäivä n. päivänä marraskuun alusta: päiväindeksi on sama aikavyöhykkeestä riippumatta. */
const noon = (n) => new Date(2026, 10, 1 + n, 12, 0, 0).getTime();

/* ---------- Asetus ---------- */

test('asetus writeEvery: oletus 2, sallitut arvot 0–3, muut hylätään', () => {
  assert.equal(DEFAULT_SETTINGS.writeEvery, 2);
  assert.equal(sanitizeSettings(null).writeEvery, 2);
  for (const v of [0, 1, 2, 3]) assert.equal(sanitizeSettings({ writeEvery: v }).writeEvery, v);
  for (const bad of [4, -1, 1.5, '1', null, true, NaN]) assert.equal(sanitizeSettings({ writeEvery: bad }).writeEvery, 2, String(bad));
});

/* ---------- Kirjoituksen vuoro ---------- */

test('writingDue: pois päältä, ensimmäinen kerta, väli ja sama päivä', () => {
  assert.equal(writingDue({ every: 0, today: 10, lastDay: null }), false, 'asetus pois');
  assert.equal(writingDue({ every: 2, today: 10, lastDay: null }), true, 'ei ole vielä kirjoitettu');
  assert.equal(writingDue({ every: 2, today: 10, lastDay: 10 }), false, 'jo tänään');
  assert.equal(writingDue({ every: 2, today: 10, lastDay: 9 }), false, 'eilen, väli 2');
  assert.equal(writingDue({ every: 2, today: 10, lastDay: 8 }), true, 'toissapäivänä');
  assert.equal(writingDue({ every: 1, today: 10, lastDay: 9 }), true, 'joka päivä: eilen kirjoitettu');
  assert.equal(writingDue({ every: 1, today: 10, lastDay: 10 }), false, 'joka päivä: jo tänään');
  assert.equal(writingDue({ every: 3, today: 10, lastDay: 8 }), false);
  assert.equal(writingDue({ every: 3, today: 10, lastDay: 7 }), true);
  assert.equal(writingDue({ every: 2, today: 10, lastDay: 1 }), true, 'pitkä tauko: vuoro on heti');
});

test('lastWriteDay: viimeisin kirjattu yritys, roskarivit ohitetaan', () => {
  assert.equal(lastWriteDay([]), null);
  assert.equal(lastWriteDay(null), null);
  assert.equal(lastWriteDay([{ ts: noon(0) }, { ts: noon(3) }, { ts: noon(1) }]), dayIndex(noon(3)));
  assert.equal(lastWriteDay([{ ts: 'x' }, null, {}, { ts: NaN }, { ts: noon(2) }]), dayIndex(noon(2)));
  assert.equal(lastWriteDay([{ ts: 5 }], (ts) => ts * 10), 50, 'päiväfunktio on vaihdettavissa');
});

test('klo 4 vaihtuva päivä: yö ennen neljää kuuluu edelliseen päivään', () => {
  const lateNight = new Date(2026, 10, 3, 1, 30).getTime(); // 3.11. klo 1.30 = vielä 2.11.
  const evening = new Date(2026, 10, 2, 20, 0).getTime();
  assert.equal(lastWriteDay([{ ts: lateNight }]), lastWriteDay([{ ts: evening }]));
});

/* ---------- Tehtävän valinta ---------- */

test('summarizeLog: yritykset, valmis ja virheetön yritys', () => {
  const m = summarizeLog([
    { id: 'a', ts: 1 },
    { id: 'a', ts: 2, clean: true },
    { id: 'b', ts: 3 },
    { id: 'b', ts: 4, done: true },
    { id: 'c', ts: 5 },
  ]);
  assert.deepEqual([m.get('a').attempts, m.get('a').done], [2, true]);
  assert.deepEqual([m.get('b').attempts, m.get('b').done], [1, true]);
  assert.deepEqual([m.get('c').attempts, m.get('c').done], [1, false]);
  assert.equal(summarizeLog(null).size, 0);
});

test('practiceIds ja isEligible: vähintään puolet harjoiteltavista ilmauksista on opittu', () => {
  const t = TASK('w-followup'); // mail-01, ask-10, mail-12
  assert.deepEqual(practiceIds(t), ['mail-01', 'ask-10', 'mail-12']);
  assert.equal(isEligible(t, () => false), false);
  assert.equal(isEligible(t, (id) => id === 'mail-01'), false, '1 / 3 ei riitä');
  assert.equal(isEligible(t, (id) => id === 'mail-01' || id === 'mail-12'), true, '2 / 3 riittää');
  const call = TASK('w-call'); // ilmauksia annettu olioina { id, re }
  assert.ok(practiceIds(call).every((id) => typeof id === 'string' && id.startsWith('call-')), practiceIds(call).join(','));
  assert.equal(isEligible({ use: [] }, () => false), true, 'ei ilmauksia: sopii aina');
});

test('pickWritingTask: luonnos ensin, sitten ensimmäinen tekemätön sopiva tehtävä', () => {
  const learned = new Set([...idsOfUnit('mail'), ...idsOfUnit('ask')]);
  const isLearned = (id) => learned.has(id);
  const state = new Map();
  assert.equal(pickWritingTask({ state, isLearned }).id, 'w-followup', 'ensimmäinen sopiva');
  state.set('w-followup', { done: true, attempts: 1, last: { ts: 1 } });
  assert.equal(pickWritingTask({ state, isLearned }).id, 'w-request', 'tehty ohitetaan');
  const drafts = { 'w-request': { text: '  ', ts: 1 }, 'w-deadline': { text: 'Hi Sam, I', ts: 2 } };
  assert.equal(pickWritingTask({ state, isLearned, drafts }).id, 'w-deadline', 'luonnos voittaa, vaikka ilmauksia ei ole opittu');
  const emptyDraft = { 'w-deadline': { text: '   ', ts: 2 } };
  assert.equal(pickWritingTask({ state, isLearned, drafts: emptyDraft }).id, 'w-request', 'tyhjä luonnos ei lasketa');
  const doneDraft = { 'w-followup': { text: 'vanha luonnos', ts: 2 } };
  assert.equal(pickWritingTask({ state, isLearned, drafts: doneDraft }).id, 'w-request', 'tehdyn tehtävän luonnos ei lasketa');
});

test('pickWritingTask: ei sopivaa tehtävää → null; kun kaikki on tehty, vanhin uudelleen', () => {
  const state = new Map();
  assert.equal(pickWritingTask({ state, isLearned: () => false }), null, 'mitään ei ole opittu');
  const all = new Map(WRITING_TASKS.map((t, i) => [t.id, { done: true, attempts: 1, last: { ts: 1000 - i } }]));
  assert.equal(pickWritingTask({ state: all, isLearned: () => false }).id, WRITING_TASKS.at(-1).id, 'vanhin kirjoitettu (pienin ts)');
  const one = new Map(WRITING_TASKS.slice(0, 11).map((t) => [t.id, { done: true, attempts: 1, last: { ts: 1 } }]));
  assert.equal(pickWritingTask({ state: one, isLearned: () => false }), null, 'yksi tekemättä mutta ei sopiva: ei kierrätetä');
});

/* ---------- Päivän kirjoitusosio ---------- */

test('planWriting: heti alussa ei kirjoitusta, kun mitään ei ole opittu', () => {
  const p = planWriting({ every: 2, today: 100, log: [], drafts: {}, isLearned: () => false, totalMs: 15 * MIN });
  assert.equal(p, null);
});

test('planWriting: ensimmäisen aiheen jälkeen tarjotaan seurantaviestiä, ja arvio on viiden–kuuden minuutin luokkaa', () => {
  const learned = new Set(idsOfUnit('mail'));
  const p = planWriting({ every: 2, today: 100, log: [], drafts: {}, isLearned: (id) => learned.has(id), totalMs: 15 * MIN });
  assert.equal(p.task.id, 'w-followup');
  assert.ok(p.ms >= 4.5 * MIN && p.ms <= 7 * MIN, `${p.ms / MIN} min`);
});

test('planWriting: asetus pois, vuoro ei ole, tai sessio on liian lyhyt', () => {
  const learned = new Set(idsOfUnit('mail'));
  const base = { today: dayIndex(noon(5)), drafts: {}, isLearned: (id) => learned.has(id), totalMs: 15 * MIN };
  assert.equal(planWriting({ ...base, every: 0, log: [] }), null, 'asetus pois');
  assert.equal(planWriting({ ...base, every: 2, log: [{ id: 'w-x', ts: noon(4) }] }), null, 'eilen kirjoitettu');
  assert.equal(planWriting({ ...base, every: 2, log: [{ id: 'w-x', ts: noon(3) }] })?.task.id, 'w-followup', 'toissapäivänä kirjoitettu');
  assert.equal(planWriting({ ...base, every: 2, log: [], totalMs: 10 * MIN }), null, 'kuuden minuutin viesti ei mahdu 10 minuutin sessioon');
  assert.ok(planWriting({ ...base, every: 2, log: [], totalMs: 20 * MIN }), 'mahtuu 20 minuuttiin');
});

test('planWriting: päivän luonnos jatkuu, vaikka ilmauksia ei olisi opittu', () => {
  const p = planWriting({ every: 2, today: 100, log: [], drafts: { 'w-meeting': { text: 'Hi team,', ts: 1 } }, isLearned: () => false, totalMs: 15 * MIN });
  assert.equal(p.task.id, 'w-meeting');
});

test('simulointi: kirjoitus joka toinen päivä seuraa oppimista, kierto alkaa alusta vasta kun kaikki on tehty', () => {
  // Päivänä n on opittu n−1 ensimmäistä aihetta (yksi aihe päivässä, järjestyksessä).
  const log = [];
  const picks = [];
  for (let n = 1; n <= 40; n++) {
    const learned = new Set(UNIT_ORDER.slice(0, n - 1).flatMap(idsOfUnit));
    const ts = noon(n);
    const p = planWriting({ every: 2, today: dayIndex(ts), log, drafts: {}, isLearned: (id) => learned.has(id), totalMs: 15 * MIN });
    if (!p) continue;
    const state = summarizeLog(log);
    if (!state.get(p.task.id)?.done) assert.ok(isEligible(p.task, (id) => learned.has(id)), `${p.task.id} päivänä ${n} ei ollut sopiva`);
    picks.push({ n, id: p.task.id });
    log.push({ ts, id: p.task.id, done: true });
  }
  assert.equal(picks[0].n, 2, 'ensimmäinen kirjoituspäivä on toinen päivä');
  assert.ok(picks.every((p, i) => i === 0 || p.n - picks[i - 1].n >= 2), 'väli on vähintään kaksi päivää');
  assert.ok(picks.slice(1).every((p, i) => p.n - picks[i].n === 2), 'ja tasan kaksi, kun tehtäviä riittää');
  const firstCycle = picks.slice(0, WRITING_TASKS.length).map((p) => p.id);
  assert.equal(new Set(firstCycle).size, WRITING_TASKS.length, 'jokainen tehtävä kerran ennen toistoa');
  assert.equal(picks[WRITING_TASKS.length].id, firstCycle[0], 'sitten vanhin uudelleen');
});

/* ---------- Aikabudjetit ---------- */

test('planBudgets: ilman kirjoitusta entiset varaukset', () => {
  const b = planBudgets(15 * MIN, 0);
  assert.equal(b.reviewMs, 15 * MIN * REVIEW_SHARE);
  assert.equal(b.speakReserveMs, SPEAK_RESERVE_MS);
  assert.equal(b.chunkReserveMs, CHUNK_RESERVE_MS);
  assert.equal(b.writeReserveMs, 0);
});

test('planBudgets: kirjoituspäivänä kertaukselle ja puheelle jää vähemmän, ja varaukset mahtuvat sessioon', () => {
  for (const minutes of [15, 20, 30]) {
    const total = minutes * MIN;
    const write = estimateWriteMs(TASK('w-followup'));
    const b = planBudgets(total, write);
    assert.equal(b.reviewMs, total * REVIEW_SHARE_WITH_WRITING);
    assert.equal(b.speakReserveMs, SPEAK_MIN_MS);
    assert.equal(b.writeReserveMs, write);
    assert.ok(b.speakReserveMs + b.writeReserveMs < total, `${minutes} min`);
    assert.ok(total - b.speakReserveMs - b.writeReserveMs >= 0);
  }
  // 15 minuutin kirjoituspäivä: täydenkin kertauksen jälkeen mahtuu yksi uusi ryhmä, lyhyen kertauksen jälkeen kaksi.
  const b15 = planBudgets(15 * MIN, 6 * MIN);
  const leftAfterReview = (reviewMs) => 15 * MIN - b15.speakReserveMs - b15.writeReserveMs - reviewMs;
  assert.ok(leftAfterReview(b15.reviewMs) >= b15.chunkReserveMs, 'täyden kertauksen jälkeen mahtuu yksi ryhmä');
  assert.ok(leftAfterReview(b15.reviewMs) < 2 * b15.chunkReserveMs, 'mutta vain yksi');
  assert.ok(leftAfterReview(2 * MIN) >= 2 * b15.chunkReserveMs, 'lyhyen kertauksen jälkeen ehtii enemmän');
});

test('planBudgets: lyhyessä sessiossa varaukset skaalautuvat sessioon', () => {
  const b = planBudgets(5 * MIN, 0);
  assert.equal(b.speakReserveMs, 5 * MIN * 0.2);
  assert.equal(b.chunkReserveMs, 5 * MIN * 0.25);
});
