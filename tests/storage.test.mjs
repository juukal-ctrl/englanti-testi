import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, exportBackup, importBackup, validateBackup, mergeCard, cleanCard, BACKUP_APP } from '../js/db.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../js/settings.js';
import { Srs } from '../js/srs.js';
import { summarize } from '../js/stats.js';
import { State, Rating } from '../js/fsrs.js';
import { dayIndex, shuffle, seededRng, fmtDay, fmtMinutes } from '../js/util.js';

const DAY = 86400000;
const at = (y, m, d, hh = 12) => new Date(y, m - 1, d, hh, 0, 0).getTime();

function makeSrs(startMs, overrides = {}) {
  let t = startMs;
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  return {
    clock: { set: (v) => (t = v), add: (v) => (t += v), get: () => t },
    build: async (db) => new Srs(db, () => settings, () => t).load(),
  };
}

test('asetusten siivous: oletukset, rajat ja tuntemattomat avaimet', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  const s = sanitizeSettings({ retention: 2, newMax: 3.6, theme: 'neon', rate: 'fast', evil: 1, aiModel: 'bad model!', clearText: true });
  assert.equal(s.retention, 0.97);
  assert.equal(s.newMax, 4);
  assert.equal(s.theme, 'auto');
  assert.equal(s.rate, DEFAULT_SETTINGS.rate);
  assert.equal(s.aiModel, DEFAULT_SETTINGS.aiModel);
  assert.equal(s.clearText, true);
  assert.ok(!('evil' in s));
});

test('päiväindeksi vaihtuu klo 4 ja pysyy kesäaikasiirtymän yli', () => {
  const d1 = dayIndex(at(2026, 11, 3, 3));
  const d2 = dayIndex(at(2026, 11, 3, 5));
  assert.equal(d2 - d1, 1, 'klo 3 kuuluu edelliseen päivään');
  assert.equal(dayIndex(at(2026, 3, 29, 12)) - dayIndex(at(2026, 3, 28, 12)), 1);
  assert.equal(dayIndex(at(2026, 10, 26, 12)) - dayIndex(at(2026, 10, 25, 12)), 1);
  assert.equal(fmtDay(d2, d2), 'tänään');
  assert.equal(fmtDay(d2 + 1, d2), 'huomenna');
  assert.equal(fmtMinutes(125000), '2 min 05 s');
});

test('shuffle ei hävitä alkioita ja seededRng on toistettava', () => {
  const a = shuffle([1, 2, 3, 4, 5, 6, 7], seededRng(1));
  const b = shuffle([1, 2, 3, 4, 5, 6, 7], seededRng(1));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test('kortin kirjaus tallentuu ja erääntyminen toimii päivän tarkkuudella', async () => {
  const db = await openDb({ memory: true });
  const { clock, build } = makeSrs(at(2026, 11, 3, 20));
  const srs = await build(db);
  assert.equal(srs.isLearned('a'), false);
  const c1 = await srs.grade('a', Rating.Good, { mode: 'choose', ms: 2500 });
  assert.equal(c1.state, State.Review);
  assert.equal(c1.scheduledDays, 2);
  assert.equal(srs.isLearned('a'), true);
  assert.equal(srs.introducedToday(), 1);
  assert.equal(srs.due().length, 0, 'ei erääntynyt vielä tänään');

  clock.set(at(2026, 11, 4, 8)); // seuraava aamu: ei vielä erääntynyt (väli 2 pv)
  assert.equal(srs.due().length, 0);
  clock.set(at(2026, 11, 5, 7)); // kahden päivän päästä aamulla: erääntynyt, vaikka kellonaika on aiempi kuin kertauksessa
  assert.deepEqual(srs.due().map((c) => c.id), ['a']);

  const logs = await db.getAllReviews();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].rating, 3);
  assert.equal(logs[0].mode, 'choose');
  assert.equal(logs[0].ms, 2500);
});

test('erääntyneet järjestetään heikoimmin muistetusta alkaen', async () => {
  const db = await openDb({ memory: true });
  const { clock, build } = makeSrs(at(2026, 11, 1));
  const srs = await build(db);
  await srs.grade('lyhyt', Rating.Good); // vakaus 2,3
  await srs.grade('pitkä', Rating.Easy); // vakaus 8,3
  clock.set(at(2026, 11, 20));
  assert.deepEqual(srs.due().map((c) => c.id), ['lyhyt', 'pitkä']);
});

test('uudelleen avattu sovellus lukee kortit tietokannasta', async () => {
  const db = await openDb({ memory: true });
  const { build } = makeSrs(at(2026, 11, 3));
  const a = await build(db);
  await a.grade('x', Rating.Hard);
  const b = await build(db);
  assert.equal(b.card('x').reps, 1);
  assert.equal(b.card('x').introducedDay, a.today());
});

test('varmuuskopio: vienti → tyhjennys → tuonti palauttaa tilan', async () => {
  const db = await openDb({ memory: true });
  const { build } = makeSrs(at(2026, 11, 3));
  const srs = await build(db);
  for (const id of ['a', 'b', 'c']) await srs.grade(id, Rating.Good);
  await db.setKv('settings', { ...DEFAULT_SETTINGS, newMax: 9 });
  const backup = await exportBackup(db, at(2026, 11, 3));
  assert.equal(backup.app, BACKUP_APP);
  assert.equal(backup.cards.length, 3);
  assert.equal(backup.reviews.length, 3);
  assert.equal(JSON.stringify(backup).includes('apiKey'), false, 'avainta ei viedä');

  const wire = JSON.parse(JSON.stringify(backup));
  const fresh = await openDb({ memory: true });
  const res = await importBackup(fresh, wire);
  assert.deepEqual([res.cards, res.reviews], [3, 3]);
  assert.equal((await fresh.getKv('settings')).newMax, 9);
  assert.deepEqual((await fresh.getAllCards()).map((c) => c.id).sort(), ['a', 'b', 'c']);
});

test('tuonti yhdistäen: uudempi kortti voittaa eikä historia kahdennu', async () => {
  const dbA = await openDb({ memory: true });
  const { clock, build } = makeSrs(at(2026, 11, 3));
  const a = await build(dbA);
  await a.grade('k', Rating.Good);
  const oldBackup = JSON.parse(JSON.stringify(await exportBackup(dbA)));
  clock.set(at(2026, 11, 10));
  await a.grade('k', Rating.Good);
  await a.grade('uusi', Rating.Good);
  const res = await importBackup(dbA, oldBackup, { mode: 'merge' });
  assert.equal(res.cards, 2);
  const k = (await dbA.getAllCards()).find((c) => c.id === 'k');
  assert.equal(k.reps, 2, 'uudempi tila säilyi');
  assert.equal((await dbA.getAllReviews()).length, 3, 'vanha tapahtuma ei kahdentunut');
});

test('virheellinen tai vieras varmuuskopio hylätään, roskarivit pudotetaan', async () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ app: 'muu', schema: 1, cards: [] }).ok, false);
  assert.equal(validateBackup({ app: BACKUP_APP, schema: 99, cards: [] }).ok, false);
  assert.equal(validateBackup({ app: BACKUP_APP, schema: 1 }).ok, false);
  const v = validateBackup({
    app: BACKUP_APP,
    schema: 1,
    settings: { retention: 5, haitari: '<script>' },
    cards: [{ id: 'ok', state: 2, stability: 3, difficulty: 4, dueDay: 10, lastDay: 8, reps: 2 }, { id: '../x' }, { state: 1 }, { id: 'ok' }, null],
    reviews: [{ cardId: 'ok', ts: 5, rating: 3 }, { cardId: 'ok', ts: 6, rating: 9 }, 'roska'],
  });
  assert.equal(v.ok, true);
  assert.equal(v.cards.length, 1);
  assert.equal(v.reviews.length, 1);
  assert.equal(v.skippedCards, 4);
  assert.equal(v.skippedReviews, 2);
  assert.equal(v.settings.retention, 0.97);
  assert.ok(!('haitari' in v.settings));
  assert.equal(cleanCard({ id: 'q', state: 7 }), null);
  await assert.rejects(() => importBackup(null, { app: 'x' }), /varmuuskopio/);
});

test('mergeCard valitsee uudemmin kerratun', () => {
  const a = { id: 'x', lastReview: 5, reps: 9 };
  const b = { id: 'x', lastReview: 7, reps: 1 };
  assert.equal(mergeCard(a, b), b);
  assert.equal(mergeCard(undefined, b), b);
  assert.equal(mergeCard({ id: 'x', lastReview: 5, reps: 1 }, { id: 'x', lastReview: 5, reps: 3 }).reps, 3);
});

test('tilastot: opitut, kypsät, ennuste ja toteutunut säilyvyys', async () => {
  const db = await openDb({ memory: true });
  const { clock, build } = makeSrs(at(2026, 11, 1));
  const srs = await build(db);
  for (let i = 0; i < 12; i++) await srs.grade(`c${i}`, Rating.Good);
  clock.set(at(2026, 11, 3));
  for (let i = 0; i < 12; i++) await srs.grade(`c${i}`, i === 0 ? Rating.Again : Rating.Good);
  const today = srs.today();
  const sum = summarize([...srs.cards.values()], await db.getAllReviews(), today);
  assert.equal(sum.learned, 12);
  assert.equal(sum.reviews7, 24);
  assert.equal(sum.activeDays30, 2);
  assert.equal(sum.lapses, 1);
  assert.equal(sum.trueRetentionSample, 12);
  assert.ok(Math.abs(sum.trueRetention - 11 / 12) < 1e-9);
  assert.equal(sum.last14.length, 14);
  assert.equal(sum.last14[13].n, 12);
  assert.equal(sum.forecast.length, 7);
  assert.ok(sum.avgRecall > 0.5 && sum.avgRecall <= 1);
});
