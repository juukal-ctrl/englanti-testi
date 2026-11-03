import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_W,
  Rating,
  State,
  newCard,
  retrievability,
  intervalFor,
  schedule,
  review,
  factorOf,
  decayOf,
  initDifficulty,
  nextDifficulty,
  shortTermStability,
  formatInterval,
  currentRetrievability,
} from '../js/fsrs.js';

const golden = JSON.parse(readFileSync(new URL('./fsrs.golden.json', import.meta.url), 'utf8'));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b} (±${eps})`);

test('oletuspainoja on 21 ja ne ovat lukuja', () => {
  assert.equal(DEFAULT_W.length, 21);
  assert.ok(DEFAULT_W.every(Number.isFinite));
  assert.deepEqual([...DEFAULT_W], golden.w);
});

test('muistamisen todennäköisyys on 90 %, kun aikaa on kulunut yhtä paljon kuin vakaus', () => {
  for (const s of [0.5, 1, 2.3065, 8.2956, 100, 3650]) near(retrievability(s, s), 0.9, 1e-12);
  near(retrievability(0, 5), 1, 1e-12);
  assert.ok(retrievability(10, 5) < retrievability(5, 5));
  assert.equal(retrievability(3, 0), 0);
});

test('kerroin ja vaimenemisluku täsmäävät FSRS-6:n määritelmään', () => {
  near(decayOf(), -0.1542, 1e-12);
  near(factorOf(), Math.pow(0.9, 1 / -0.1542) - 1, 1e-12);
  near(factorOf(), 0.98035, 1e-4);
});

test('90 %:n tavoitteella väli on likimain vakaus', () => {
  assert.equal(intervalFor(2.3065), 2);
  assert.equal(intervalFor(8.2956), 8);
  assert.equal(intervalFor(100.4), 100);
  assert.equal(intervalFor(0.212), 1, 'väli on aina vähintään 1 pv');
  assert.equal(intervalFor(1e9, 0.9, DEFAULT_W, 365), 365, 'enimmäisväli rajaa');
});

test('korkeampi tavoitesäilyvyys lyhentää välejä ja matalampi pidentää', () => {
  const s = 30;
  assert.ok(intervalFor(s, 0.95) < intervalFor(s, 0.9));
  assert.ok(intervalFor(s, 0.8) > intervalFor(s, 0.9));
  assert.equal(intervalFor(s, 0.9), 30);
});

test('ensimmäinen kertaus: vakaus = w[arvosana-1] ja painikkeiden välit', () => {
  const out = schedule(newCard(), 100);
  near(out[1].stability, 0.212, 1e-12);
  near(out[2].stability, 1.2931, 1e-12);
  near(out[3].stability, 2.3065, 1e-12);
  near(out[4].stability, 8.2956, 1e-12);
  assert.deepEqual([1, 2, 3, 4].map((g) => out[g].interval), [1, 1, 2, 8]);
  assert.deepEqual([1, 2, 3, 4].map((g) => out[g].dueDay), [101, 101, 102, 108]);
  assert.equal(out[1].state, State.Learning);
  assert.equal(out[3].state, State.Review);
  near(out[3].difficulty, 2.1182, 5e-4); // D0(3) = w4 - e^(2·w5) + 1
  near(initDifficulty(1), 6.4133 - 1 + 1, 1e-12);
});

test('painikkeiden välit ovat aina nousevia (Again ≤ Hard < Good < Easy)', () => {
  let card = newCard();
  let day = 0;
  const pattern = [3, 3, 2, 3, 4, 1, 3, 3, 4, 2, 3, 3, 3];
  for (const g of pattern) {
    const out = schedule(card, day);
    assert.ok(out[1].interval <= out[2].interval, `Again ≤ Hard (päivä ${day})`);
    assert.ok(out[2].interval < out[3].interval, `Hard < Good (päivä ${day})`);
    assert.ok(out[3].interval < out[4].interval, `Good < Easy (päivä ${day})`);
    card = review(card, g, day, day * 86400000);
    day += Math.max(1, card.scheduledDays);
  }
});

for (const [name, c] of Object.entries(golden.cases)) {
  test(`vertailu riippumattomaan Python-toteutukseen: ${name}`, () => {
    let card = newCard();
    for (const step of c.steps) {
      const out = schedule(card, step.day, { retention: c.retention });
      for (const g of [1, 2, 3, 4]) assert.equal(out[g].interval, step.buttons[String(g)], `painike ${g}, päivä ${step.day}`);
      card = review(card, step.rating, step.day, step.day * 86400000, { retention: c.retention });
      near(card.stability, step.stability, 1e-9);
      near(card.difficulty, step.difficulty, 1e-9);
      assert.equal(card.state, step.state);
      assert.equal(card.lapses, step.lapses);
      assert.equal(card.scheduledDays, step.interval);
      assert.equal(card.dueDay, step.dueDay);
    }
  });
}

test('vakaus kasvaa onnistuneessa kertauksessa ja pienenee unohtaessa', () => {
  let card = review(newCard(), Rating.Good, 0, 0);
  card = review(card, Rating.Good, 2, 1);
  const before = card;
  const day = before.dueDay;
  const out = schedule(before, day);
  assert.ok(out[3].stability > before.stability, 'Good kasvattaa');
  assert.ok(out[1].stability < before.stability, 'Again pienentää');
  assert.ok(out[2].stability < out[3].stability, 'Hard < Good');
  assert.ok(out[3].stability < out[4].stability, 'Good < Easy');
  assert.equal(out[1].lapses, before.lapses + 1);
  assert.equal(out[1].state, State.Relearning);
});

test('myöhässä tehty kertaus kasvattaa vakautta enemmän kuin ajoissa tehty', () => {
  const base = review(review(newCard(), 3, 0, 0), 3, 2, 0);
  const early = schedule(base, base.dueDay)[3].stability;
  const late = schedule(base, base.dueDay + 10)[3].stability;
  assert.ok(late > early);
});

test('vaikeus pysyy välillä 1–10 ja Again nostaa, Easy laskee sitä', () => {
  let d = 5;
  for (let i = 0; i < 100; i++) d = nextDifficulty(d, Rating.Again);
  assert.ok(d <= 10 && d > 8);
  for (let i = 0; i < 100; i++) d = nextDifficulty(d, Rating.Easy);
  assert.ok(d >= 1 && d < 3);
  assert.ok(nextDifficulty(5, 1) > 5);
  assert.ok(nextDifficulty(5, 4) < 5);
});

test('saman päivän kertaus ei pienennä vakautta Good/Easy-arvosanoilla', () => {
  for (const s of [0.3, 1, 2.3, 10, 80]) {
    assert.ok(shortTermStability(s, Rating.Good) >= s);
    assert.ok(shortTermStability(s, Rating.Easy) >= s);
    assert.ok(shortTermStability(s, Rating.Again) < s);
  }
  const first = review(newCard(), Rating.Again, 5, 0);
  const again = review(first, Rating.Good, 5, 1);
  assert.ok(again.stability >= first.stability);
  assert.equal(again.state, State.Review);
  assert.equal(again.dueDay, 5 + again.scheduledDays);
});

test('kertaus ei muuta alkuperäistä korttia', () => {
  const card = review(newCard(), Rating.Good, 0, 0);
  const copy = JSON.stringify(card);
  schedule(card, 4);
  review(card, Rating.Hard, 4, 1);
  assert.equal(JSON.stringify(card), copy);
});

test('reps kasvaa yhdellä ja lastReview tallentuu', () => {
  const a = review(newCard(), Rating.Good, 3, 12345);
  assert.equal(a.reps, 1);
  assert.equal(a.lastReview, 12345);
  assert.equal(a.lastDay, 3);
  assert.equal(review(a, Rating.Good, 5, 99999).reps, 2);
});

test('currentRetrievability: uusi kortti 0, muuten laskee ajan myötä', () => {
  assert.equal(currentRetrievability(newCard(), 10), 0);
  const c = review(newCard(), Rating.Good, 0, 0);
  near(currentRetrievability(c, 0), 1, 1e-12);
  assert.ok(currentRetrievability(c, 2) < 1);
  near(currentRetrievability(c, 2), 0.9, 0.01);
});

test('formatInterval', () => {
  assert.equal(formatInterval(0), '<1 pv');
  assert.equal(formatInterval(1), '1 pv');
  assert.equal(formatInterval(13), '13 pv');
  assert.equal(formatInterval(14), '2 vk');
  assert.equal(formatInterval(59), '8 vk');
  assert.equal(formatInterval(60), '2 kk');
  assert.equal(formatInterval(400), '1,1 v');
});
