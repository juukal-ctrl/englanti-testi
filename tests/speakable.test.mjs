import test from 'node:test';
import assert from 'node:assert/strict';
import { speakable, ordinalWord } from '../js/speakable.js';
import { CATALOG } from '../js/content.js';

test('ordinalWord: päivät 1–31', () => {
  assert.equal(ordinalWord(1), 'first');
  assert.equal(ordinalWord(3), 'third');
  assert.equal(ordinalWord(22), 'twenty-second');
  assert.equal(ordinalWord(31), 'thirty-first');
  assert.equal(ordinalWord(0), null);
  assert.equal(ordinalWord(32), null);
});

test('speakable: päivämäärä luetaan järjestyslukuna', () => {
  assert.equal(speakable("I'm writing to follow up on the invoice we sent on October 3."), "I'm writing to follow up on the invoice we sent on October third.");
  assert.equal(speakable('The meeting is on March 21 at noon.'), 'The meeting is on March twenty-first at noon.');
  assert.equal(speakable('Due on Oct. 15th.'), 'Due on Oct. fifteenth.');
  assert.equal(speakable('We could deliver on the 15th.'), 'We could deliver on the fifteenth.');
});

test('speakable: muita lukuja ei muuteta', () => {
  assert.equal(speakable('The workshop is on Tuesday at 10 a.m., and the report is due in March.'), 'The workshop is on Tuesday at 10 a.m., and the report is due in March.');
  assert.equal(speakable('Our payment terms are net 30.'), 'Our payment terms are net 30.');
  assert.equal(speakable('We have worked with this customer since 2021.'), 'We have worked with this customer since 2021.');
  assert.equal(speakable('Tuesday at 10 works for me.'), 'Tuesday at 10 works for me.');
  assert.equal(speakable('March 3:30 pm'), 'March 3:30 pm');
});

test('speakable: aukon merkki poistetaan ja välilyönnit siistitään', () => {
  assert.equal(speakable("I'm writing to follow up on …"), "I'm writing to follow up on");
  assert.equal(speakable('Could you possibly …?'), 'Could you possibly?');
  assert.equal(speakable('I am …-ing now'), 'I am now');
  assert.equal(speakable(null), '');
});

test('sisältö: kaikki luettavat tekstit ovat puhtaita (ei aukon merkkiä eikä kaksoisvälilyöntiä)', () => {
  for (const item of CATALOG.items) {
    for (const key of ['en', 'ex', 'say']) {
      const out = speakable(item[key]);
      assert.ok(out.length > 0, `${item.id}.${key} on tyhjä`);
      assert.ok(!/…|\s{2,}/.test(out), `${item.id}.${key}: ${out}`);
    }
  }
});
