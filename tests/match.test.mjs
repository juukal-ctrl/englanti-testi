import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWords, compareToPhrase, compareSpeech, displayTokens, suggestRating, wordDistance } from '../js/match.js';

test('normalizeWords: pienet kirjaimet, supistukset auki ja luvut sanoiksi', () => {
  assert.deepEqual(normalizeWords("I'm writing at 3 p.m."), ['i', 'am', 'writing', 'at', 'three', 'p', 'm']);
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
