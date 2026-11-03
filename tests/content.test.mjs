import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, UNIT_ORDER } from '../data/units.js';
import { CATALOG, buildCatalog, validateUnits, nextNewItems, unitProgress, pickFormat, getItem } from '../js/content.js';
import { normalizeWords, compareSpeech, alignWords, suggestRating, wordDistance } from '../js/match.js';
import { State } from '../js/fsrs.js';

test('sisältöpaketti läpäisee kaikki rakenne- ja johdonmukaisuustarkistukset', () => {
  const errors = validateUnits();
  assert.deepEqual(errors, []);
});

test('sisältöpaketissa on riittävästi ilmauksia ja aukkotehtäviä', () => {
  assert.ok(CATALOG.items.length >= 100, `ilmauksia ${CATALOG.items.length}`);
  assert.ok(CATALOG.items.filter((i) => i.cloze).length >= 30);
  assert.equal(CATALOG.units.length, UNITS.length);
  assert.deepEqual(CATALOG.units.map((u) => u.id), UNIT_ORDER);
});

test('tunnisteet ovat yksilöllisiä ja järjestys on pysyvä', () => {
  const ids = CATALOG.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  CATALOG.items.forEach((it, n) => assert.equal(it.seq, n));
  assert.equal(getItem('mail-01').en, "I'm writing to follow up on …");
  assert.equal(getItem('olematon'), null);
});

test('virheellinen sisältö löytyy: kaksoistunniste, aukko ja ajatusviiva', () => {
  const bad = [
    {
      id: 'bad', title: 'x', situation: 'x', intro: 'x',
      items: [
        { id: 'bad-01', en: 'One', fi: 'Yksi', ex: 'One — two.' },
        { id: 'bad-01', en: 'Two', fi: 'Kaksi', ex: 'Two.', cz: ['No blank here', 'x', ['a']] },
        { id: 'bad-03', en: 'Three', fi: 'Kolme', ex: 'Three is here.', cz: ['Three ___ here.', 'is', ['are', 'is']] },
        { id: 'bad-04', en: 'Four', fi: 'Neljä', ex: 'Four.' },
        { id: 'bad-05', en: 'Five', fi: 'Viisi', ex: 'Five.', cz: ['Five ___ here.', 'is', ['are', 'was']] },
      ],
    },
  ];
  const errors = validateUnits(bad, ['bad']).join('\n');
  assert.match(errors, /bad-01: ilmauksen tunniste on jo käytössä/);
  assert.match(errors, /bad-01: ex sisältää ajatusviivan/);
  assert.match(errors, /yksi ___/);
  assert.match(errors, /väärien vaihtoehtojen määrä/);
  assert.match(errors, /eivät ole yksilöllisiä/);
  assert.match(errors, /bad-05: täytetty aukkolause ei esiinny/);
});

test('nextNewItems palauttaa seuraavat opitut-puuttuvat opetusjärjestyksessä', () => {
  const learned = new Set(['mail-01', 'mail-02', 'mail-04']);
  const next = nextNewItems((id) => learned.has(id), 4);
  assert.deepEqual(next.map((i) => i.id), ['mail-03', 'mail-05', 'mail-06', 'mail-07']);
  const trap = nextNewItems((id) => learned.has(id), 2, { unitId: 'trap' });
  assert.deepEqual(trap.map((i) => i.id), ['trap-01', 'trap-02']);
  assert.deepEqual(nextNewItems(() => true, 5), []);
});

test('unitProgress laskee opitut', () => {
  const mail = CATALOG.unitById('mail');
  assert.deepEqual(unitProgress(mail, (id) => id === 'mail-01'), { total: mail.items.length, learned: 1 });
});

test('pickFormat: aukkotehtävä aluksi, tuottaminen kun muisti vahvistuu', () => {
  const withCloze = getItem('mail-01');
  const noCloze = getItem('mail-04');
  assert.equal(pickFormat(withCloze, null), 'choose');
  assert.equal(pickFormat(noCloze, null), 'flip-rec');
  const young = { state: State.Review, stability: 2, reps: 1 };
  assert.equal(pickFormat(withCloze, young), 'choose');
  const mature = { state: State.Review, stability: 12, reps: 4 };
  assert.equal(pickFormat(withCloze, mature), 'flip-prod');
  assert.equal(pickFormat(withCloze, { ...mature, reps: 5 }), 'choose', 'vuorottelu parittomilla toistoilla');
  assert.equal(pickFormat(noCloze, { ...mature, reps: 5 }), 'flip-prod');
  assert.equal(pickFormat(withCloze, { state: State.Relearning, stability: 30, reps: 9 }), 'choose', 'unohdettu palaa helpompaan muotoon');
});

test('normalizeWords: pienet kirjaimet, lyhenteet ja luvut', () => {
  assert.deepEqual(normalizeWords("Thank you, I'm FINE!"), ['thank', 'you', 'i', 'am', 'fine']);
  assert.deepEqual(normalizeWords("We’ve got 3 invoices"), ['we', 'have', 'got', 'three', 'invoices']);
  assert.deepEqual(normalizeWords("Can't, won't, let's"), ['cannot', 'will', 'not', 'let', 'us']);
  assert.deepEqual(normalizeWords(null), []);
});

test('compareSpeech: täsmäys, puuttuvat ja väärät sanat', () => {
  const perfect = compareSpeech("I'm writing to follow up on the invoice.", 'i am writing to follow up on the invoice');
  assert.equal(perfect.matchPct, 100);
  assert.ok(perfect.words.every((w) => w.status === 'ok'));
  const partial = compareSpeech('Could you send me the report', 'could you sent me report');
  assert.deepEqual(partial.words.map((w) => w.status), ['ok', 'ok', 'wrong', 'ok', 'missing', 'ok']);
  assert.equal(partial.words[2].heard, 'sent');
  assert.equal(partial.matchPct, 67);
  const extra = compareSpeech('thank you', 'thank you very much');
  assert.deepEqual(extra.extra, ['very', 'much']);
  assert.equal(compareSpeech('hello', '').matchPct, 0);
  assert.equal(wordDistance(['a'], ['a']), 0);
});

test('alignWords toimii tyhjillä syötteillä', () => {
  assert.deepEqual(alignWords([], []), { words: [], extra: [] });
  assert.deepEqual(alignWords(['a'], []).words, [{ word: 'a', status: 'missing' }]);
  assert.deepEqual(alignWords([], ['x']).extra, ['x']);
});

test('suggestRating', () => {
  assert.equal(suggestRating(100), 3);
  assert.equal(suggestRating(80), 2);
  assert.equal(suggestRating(40), 1);
});

test('buildCatalog lisää järjestyksestä puuttuvat yksiköt loppuun', () => {
  const units = [
    { id: 'a', title: '', situation: '', intro: '', items: [{ id: 'a-01', en: 'x', fi: 'x', ex: 'x' }] },
    { id: 'b', title: '', situation: '', intro: '', items: [{ id: 'b-01', en: 'y …', fi: 'y', ex: 'y z', cz: ['y ___', 'z', ['a', 'b']] }] },
  ];
  const cat = buildCatalog(units, ['b']);
  assert.deepEqual(cat.items.map((i) => i.id), ['b-01', 'a-01']);
  assert.equal(cat.byId.get('b-01').say, 'y z', 'aukkoa sisältävästä ilmauksesta puhutaan esimerkki');
  assert.deepEqual(cat.byId.get('b-01').cloze, { text: 'y ___', answer: 'z', distractors: ['a', 'b'] });
});
