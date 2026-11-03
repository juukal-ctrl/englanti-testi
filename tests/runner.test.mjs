import test from 'node:test';
import assert from 'node:assert/strict';
import { newContentTasks, shadowTasks } from '../js/runner.js';
import { CATALOG, nextNewItems } from '../js/content.js';

const fakeCtx = (learned = new Set()) => ({
  catalog: CATALOG,
  srs: { isLearned: (id) => learned.has(id), cards: new Map([...learned].map((id) => [id, { id, lastReview: 1 }])) },
});

test('newContentTasks: ryhmä = opetus, testi ja tuottaminen, ja aiheen esittely ensin', () => {
  const ctx = fakeCtx();
  const items = nextNewItems(() => false, 6);
  const tasks = newContentTasks(ctx, items);
  const kinds = tasks.map((t) => t.kind);
  assert.deepEqual(kinds.slice(0, 10), ['intro', 'teach', 'teach', 'teach', 'test', 'test', 'test', 'produce', 'produce', 'produce']);
  assert.equal(tasks.length, 1 + 9 + 9, kinds.join(','));
  assert.equal(tasks[0].unit.id, 'mail');
  // jokaisella ilmauksella tasan yksi opetus, yksi testi ja yksi tuottaminen
  for (const it of items) {
    for (const kind of ['teach', 'test', 'produce']) assert.equal(tasks.filter((t) => t.kind === kind && t.item.id === it.id).length, 1, `${it.id} ${kind}`);
  }
  // opetus ennen testiä ja testi ennen tuottamista
  for (const it of items) {
    const at = (kind) => tasks.findIndex((t) => t.kind === kind && t.item.id === it.id);
    assert.ok(at('teach') < at('test') && at('test') < at('produce'), it.id);
  }
});

test('newContentTasks: vain ryhmän ensimmäinen tehtävä on ei-atominen, ja viimeinen opetus kehottaa testaamaan', () => {
  const tasks = newContentTasks(fakeCtx(), nextNewItems(() => false, 6));
  const open = tasks.map((t, i) => (t.atomic ? null : i)).filter((i) => i !== null);
  assert.equal(open.length, 2, 'kaksi ryhmää');
  assert.equal(open[0], 0);
  assert.equal(tasks[open[1]].kind, 'teach');
  const teaches = tasks.filter((t) => t.kind === 'teach');
  assert.deepEqual(teaches.map((t) => t.cta), ['Seuraava ilmaus', 'Seuraava ilmaus', 'Testaa itsesi', 'Seuraava ilmaus', 'Seuraava ilmaus', 'Testaa itsesi']);
});

test('newContentTasks: esittely vain aiheelle, josta ei ole vielä opittu mitään', () => {
  const learned = new Set(['mail-01']);
  const items = nextNewItems((id) => learned.has(id), 3);
  const none = newContentTasks(fakeCtx(learned), items);
  assert.ok(!none.some((t) => t.kind === 'intro'), 'mail on jo aloitettu');
  // 12 ilmausta mail-aiheesta jäljellä 11, joten otetaan 13 ilmausta: ask alkaa kesken ryhmän
  const mixed = nextNewItems(() => false, 14);
  const tasks = newContentTasks(fakeCtx(), mixed);
  const intros = tasks.filter((t) => t.kind === 'intro').map((t) => t.unit.id);
  assert.deepEqual(intros, ['mail', 'ask']);
  const askIntro = tasks.findIndex((t) => t.kind === 'intro' && t.unit.id === 'ask');
  assert.equal(tasks[askIntro + 1].kind, 'teach');
  assert.equal(tasks[askIntro + 1].item.unitId, 'ask');
});

test('shadowTasks: n lausetta tuoreimmin opituista, tai alusta jos mitään ei ole opittu', () => {
  assert.equal(shadowTasks(fakeCtx(), 4).length, 4);
  const learned = new Set(CATALOG.items.slice(0, 10).map((i) => i.id));
  const tasks = shadowTasks(fakeCtx(learned), 6);
  assert.equal(tasks.length, 6);
  assert.ok(tasks.every((t) => t.kind === 'shadow' && learned.has(t.item.id)));
});
