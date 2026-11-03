import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWords, compareToPhrase, compareSpeech, displayTokens, suggestRating, wordDistance } from '../js/match.js';

test('normalizeWords: pienet kirjaimet, supistukset auki ja luvut numeroiksi', () => {
  assert.deepEqual(normalizeWords("I'm writing at 3 p.m."), ['i', 'am', 'writing', 'at', '3', 'pm']);
  assert.deepEqual(normalizeWords('Don’t worry!'), ['do', 'not', 'worry']);
  assert.deepEqual(normalizeWords(''), []);
  assert.deepEqual(normalizeWords(null), []);
});

test('compareToPhrase: täysi osuma ja supistuksen kirjoitusasu', () => {
  assert.equal(compareToPhrase("I'm writing to follow up on …", 'i am writing to follow up on').matchPct, 100);
  assert.equal(compareToPhrase("I'm writing to follow up on …", "I'm writing to follow up on the invoice").matchPct, 100);
});

test('compareToPhrase: väärä ja puuttuva sana alentavat täsmäystä', () => {
  const r = compareToPhrase('Could you send me the report?', 'could you send the report');
  assert.equal(r.matchPct, 83); // 5/6
  assert.deepEqual(r.words.map((w) => w.status), ['ok', 'ok', 'ok', 'missing', 'ok', 'ok']);
  const w = compareToPhrase('We are on track', 'we are on truck');
  assert.equal(w.words[3].status, 'wrong');
  assert.equal(w.words[3].heard, 'truck');
});

test('displayTokens: alkuperäinen kirjoitusasu ja sanamäärät täsmäävät vertailusanoihin', () => {
  const phrases = ["I'm writing to follow up on …", 'Could you possibly …?', "We're on track to …", 'on Monday, in March, at 3 p.m.', 'e-invoicing is great', 'Thank you for your patience.'];
  for (const p of phrases) {
    const r = compareToPhrase(p, 'x');
    assert.ok(r.display, `display puuttuu: ${p}`);
    assert.equal(
      r.display.reduce((n, d) => n + d.n, 0),
      r.ref.length,
      p,
    );
  }
  assert.deepEqual(
    displayTokens("I'm writing to …").map((d) => [d.raw, d.n]),
    [["I'm", 2], ['writing', 1], ['to', 1]],
  );
  assert.deepEqual(displayTokens('Could you possibly …?').map((d) => d.raw), ['Could', 'you', 'possibly']);
});

test('compareSpeech ja wordDistance', () => {
  assert.equal(wordDistance(['a', 'b'], ['a', 'c']), 1);
  assert.equal(compareSpeech('see you soon', 'see you soon').matchPct, 100);
  assert.equal(compareSpeech('see you soon', 'see you').matchPct, 67);
  assert.equal(compareSpeech('', '').matchPct, 100);
});

test('suggestRating: rajat', () => {
  assert.equal(suggestRating(100), 3);
  assert.equal(suggestRating(95), 3);
  assert.equal(suggestRating(94), 2);
  assert.equal(suggestRating(75), 2);
  assert.equal(suggestRating(74), 1);
  assert.equal(suggestRating(0), 1);
});

test('luvut: numero, järjestysluku ja lukusana tulkitaan samaksi (October 3 / third / 3rd / three)', () => {
  const target = "I'm writing to follow up on the invoice we sent on October 3.";
  for (const said of [
    "I'm writing to follow up on the invoice we sent on October third.",
    "I'm writing to follow up on the invoice we sent on October 3rd.",
    "I'm writing to follow up on the invoice we sent on October 3.",
    "I'm writing to follow up on the invoice we sent on October three.",
  ]) {
    const r = compareToPhrase(target, said);
    assert.equal(r.matchPct, 100, said);
    assert.ok(r.words.every((w) => w.status === 'ok'), said);
  }
  // väärä päivä on edelleen väärin
  const wrong = compareToPhrase(target, "I'm writing to follow up on the invoice we sent on October fourth.");
  assert.ok(wrong.matchPct < 100);
  assert.equal(wrong.words.at(-1).status, 'wrong');
});

test('normalizeWords: moninumeroiset luvut, järjestysluvut ja vuodet', () => {
  assert.deepEqual(normalizeWords('twenty five'), ['25']);
  assert.deepEqual(normalizeWords('twenty-fifth'), ['25']);
  assert.deepEqual(normalizeWords('the 15th'), ['the', '15']);
  assert.deepEqual(normalizeWords('fifteenth'), ['15']);
  assert.deepEqual(normalizeWords('one hundred and five'), ['105']);
  assert.deepEqual(normalizeWords('two thousand five hundred'), ['2500']);
  assert.deepEqual(normalizeWords('net thirty'), ['net', '30']);
  assert.deepEqual(normalizeWords('net 30'), ['net', '30']);
  assert.deepEqual(normalizeWords('since 2021'), ['since', '2021']);
  assert.deepEqual(normalizeWords('since twenty twenty one'), ['since', '2021']);
  assert.deepEqual(normalizeWords('nineteen ninety nine'), ['1999']);
  // peräkkäiset erilliset luvut eivät sulaudu
  assert.deepEqual(normalizeWords('one two three'), ['1', '2', '3']);
  assert.deepEqual(normalizeWords('ten thirty'), ['10', '30']);
  assert.deepEqual(normalizeWords('10:30'), ['10', '30']);
  assert.deepEqual(normalizeWords('hundred'), ['hundred']);
});

test('normalizeWords: aika, prosentti ja raha', () => {
  assert.deepEqual(normalizeWords('at 3 p.m. on Tuesday'), ['at', '3', 'pm', 'on', 'tuesday']);
  assert.deepEqual(normalizeWords('at 3 PM'), ['at', '3', 'pm']);
  assert.deepEqual(normalizeWords('10 a.m., and'), ['10', 'am', 'and']);
  assert.deepEqual(normalizeWords('a two percent discount'), ['a', '2', 'percent', 'discount']);
  assert.deepEqual(normalizeWords('a 2% discount'), ['a', '2', 'percent', 'discount']);
  assert.deepEqual(normalizeWords('a mile'), ['a', 'mile']);
  assert.deepEqual(normalizeWords('$1,250.50'), ['1250', 'point', '50', 'dollars']);
});

test('displayTokens: luvut ja kellonajat säilyvät alkuperäisessä asussa', () => {
  const phrases = ['on Monday, in March, at 3 p.m.', 'Net 45 and a two percent discount?', 'We could deliver on the 15th.', 'since 2021', "I'm writing to follow up on the invoice we sent on October 3."];
  for (const p of phrases) {
    const r = compareToPhrase(p, 'x');
    assert.ok(r.display, `display puuttuu: ${p}`);
    assert.equal(r.display.reduce((n, d) => n + d.n, 0), r.ref.length, p);
  }
  assert.deepEqual(displayTokens('at 3 p.m.').map((d) => d.raw), ['at', '3', 'p.m.']);
});
