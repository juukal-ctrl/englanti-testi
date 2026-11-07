import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../js/steps.js';

const PHASES = [
  { id: 'review', label: 'Kertaus' },
  { id: 'new', label: 'Uutta' },
  { id: 'write', label: 'Kirjoitus' },
  { id: 'speak', label: 'Puhe' },
];
const statuses = (p) => p.steps().map((s) => s.status).join(',');

test('alussa kaikki vaiheet ovat tekemättä ja ensimmäinen on seuraava', () => {
  const p = createProgress({ phases: PHASES });
  assert.equal(statuses(p), 'todo,todo,todo,todo');
  assert.deepEqual(p.position(), { n: 1, of: 4, label: 'Kertaus', id: 'review', doneCount: 0 });
});

test('vaiheen aloitus tekee edellisestä tehdyn ja uudesta käynnissä olevan', () => {
  const p = createProgress({ phases: PHASES });
  p.start('review');
  assert.equal(statuses(p), 'current,todo,todo,todo');
  p.start('new');
  assert.equal(statuses(p), 'done,current,todo,todo');
  assert.deepEqual(p.position(), { n: 2, of: 4, label: 'Uutta', id: 'new', doneCount: 1 });
  p.start('new'); // sama vaihe uudelleen (useampi tehtäväjono samassa vaiheessa) ei muuta mitään
  assert.equal(statuses(p), 'done,current,todo,todo');
});

test('vaiheen ohittaminen: koskematon vaihe ohitetaan, kun myöhempi alkaa', () => {
  const p = createProgress({ phases: PHASES });
  p.start('review');
  p.start('write'); // uutta jäi väliin
  assert.equal(statuses(p), 'done,skipped,current,todo');
  assert.equal(p.position().n, 3);
  assert.equal(p.position().doneCount, 2);
});

test('skip() ohittaa vain aloittamattoman vaiheen', () => {
  const p = createProgress({ phases: PHASES });
  p.start('review');
  p.skip('review'); // käynnissä oleva ei ohitu
  p.skip('new');
  assert.equal(statuses(p), 'current,skipped,todo,todo');
});

test('finish() päättää käynnissä olevan vaiheen tehtynä tai ohitettuna', () => {
  const p = createProgress({ phases: PHASES });
  p.start('write');
  assert.equal(statuses(p), 'skipped,skipped,current,todo');
  p.finish('write', 'skipped');
  assert.equal(statuses(p), 'skipped,skipped,skipped,todo');
  p.start('speak');
  p.finish('speak');
  assert.equal(statuses(p), 'skipped,skipped,skipped,done');
  p.finish('speak', 'skipped'); // jo päätetty vaihe ei muutu
  assert.equal(p.steps()[3].status, 'done');
});

test('kun kaikki on tehty, sijainti on viimeinen vaihe ja kaikki lasketaan tehdyiksi', () => {
  const p = createProgress({ phases: PHASES });
  for (const ph of PHASES) {
    p.start(ph.id);
    p.finish(ph.id);
  }
  assert.deepEqual(p.position(), { n: 4, of: 4, label: 'Puhe', id: 'speak', doneCount: 4 });
});

test('tuntematon vaihe ja tyhjä vaihelista eivät kaada mitään', () => {
  const p = createProgress({ phases: PHASES });
  p.start('ei-ole');
  p.finish('ei-ole');
  p.skip('ei-ole');
  assert.equal(statuses(p), 'todo,todo,todo,todo');
  const empty = createProgress({ phases: [] });
  assert.deepEqual(empty.position(), { n: 0, of: 0, label: '', id: null, doneCount: 0 });
  assert.equal(empty.takeAnnouncement(), null);
});

test('vaiheiden numerointi pysyy samana, vaikka vaihe ohitetaan', () => {
  const p = createProgress({ phases: PHASES });
  p.start('speak');
  assert.deepEqual(p.steps().map((s) => s.n), [1, 2, 3, 4]);
  assert.equal(p.position().of, 4);
});

test('kulunut aika: minuutit, kokonaisminuutit ja osuus (enintään 1)', () => {
  let ms = 0;
  const p = createProgress({ phases: PHASES, total: 15 * 60000, elapsed: () => ms });
  assert.deepEqual(p.time(), { ms: 0, minutes: 0, totalMinutes: 15, fraction: 0 });
  ms = 5.5 * 60000;
  const t = p.time();
  assert.equal(t.minutes, 5);
  assert.equal(t.totalMinutes, 15);
  assert.ok(Math.abs(t.fraction - 5.5 / 15) < 1e-9);
  ms = 17 * 60000;
  assert.equal(p.time().fraction, 1, 'osuus ei ylitä yhtä');
  assert.equal(p.time().minutes, 17, 'kulunut aika näytetään todellisena');
  ms = -5;
  assert.equal(p.time().ms, 0, 'negatiivinen aika ei näy');
});

test('ilman kokonaisaikaa kulunutta aikaa ei näytetä', () => {
  assert.equal(createProgress({ phases: PHASES }).time(), null);
});

test('ruudunlukijan ilmoitus tulee vain vaiheen vaihtuessa', () => {
  const p = createProgress({ phases: PHASES.slice(0, 3) });
  assert.equal(p.takeAnnouncement(), 'Vaihe 1 / 3: Kertaus');
  assert.equal(p.takeAnnouncement(), null);
  p.start('review');
  assert.equal(p.takeAnnouncement(), null, 'sama vaihe, ei uutta ilmoitusta');
  p.start('new');
  assert.equal(p.takeAnnouncement(), 'Vaihe 2 / 3: Uutta');
  assert.equal(p.takeAnnouncement(), null);
});

test('yksikkö on vaihdettavissa (kappale)', () => {
  const p = createProgress({ phases: [{ id: 'a', label: 'Uusi' }, { id: 'b', label: 'Kertaus' }], unit: 'Kappale', units: 'Kappaleet' });
  assert.equal(p.takeAnnouncement(), 'Kappale 1 / 2: Uusi');
  assert.equal(p.units, 'Kappaleet');
});
