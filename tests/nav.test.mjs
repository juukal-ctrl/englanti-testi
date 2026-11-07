// Älykäs takaisin: reittipinon laskenta (js/nav.js) sekä selainhistorian malli, jolla koko kulku testataan ilman selainta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { depthOf, normalizeHash, planNav, stackAfter, validStack } from '../js/nav.js';

/** Selainhistorian pieni malli: sama logiikka kuin app.js:n go() ja järjestelmän takaisin-painike. */
function makeHistory(start = '#/today') {
  const first = normalizeHash(start);
  const entries = [{ hash: first, stack: [first] }];
  let i = 0;
  const api = {
    entries,
    get index() {
      return i;
    },
    get hash() {
      return entries[i].hash;
    },
    get stack() {
      return entries[i].stack;
    },
    go(target) {
      const to = normalizeHash(target);
      const plan = planNav(entries[i].stack, to);
      if (plan.kind === 'push') {
        entries.length = i + 1; // eteenpäin-historia katkeaa
        entries.push({ hash: to, stack: plan.next });
        i++;
      } else if (plan.kind === 'replace') {
        entries[i] = { hash: to, stack: plan.next };
      } else if (plan.kind === 'pop') {
        assert.ok(plan.pops <= i, `paluu ${plan.pops} askelta ei saa ylittää historian alkua (indeksi ${i})`);
        i -= plan.pops;
        entries[i] = { hash: to, stack: plan.next };
      }
      return plan;
    },
    /** Järjestelmän takaisin-painike. Palauttaa false, jos sovelluksesta poistutaan. */
    back() {
      if (i === 0) return false;
      i--;
      return true;
    },
    /** Kuinka monta takaisin-painallusta tarvitaan sovelluksesta poistumiseen. */
    backsToExit() {
      return i + 1;
    },
  };
  return api;
}

const HASHES = [
  '#/today', '#/review', '#/lessons', '#/lesson/u1', '#/speak', '#/write', '#/write/t1', '#/write/t2',
  '#/more', '#/vocab', '#/progress', '#/settings', '#/settings/ai', '#/install', '#/session', '#/session/extra', '#/shadow',
];

test('normalizeHash: tyhjä osoite on Tänään ja muodot yhtenäistetään', () => {
  assert.equal(normalizeHash(''), '#/today');
  assert.equal(normalizeHash('#'), '#/today');
  assert.equal(normalizeHash('#/'), '#/today');
  assert.equal(normalizeHash('#/review'), '#/review');
  assert.equal(normalizeHash('#review'), '#/review');
  assert.equal(normalizeHash('#/settings/ai/'), '#/settings/ai');
  assert.equal(normalizeHash(undefined), '#/today');
});

test('depthOf: tasot', () => {
  const d = (h) => depthOf(h);
  assert.equal(d('#/today'), 0);
  for (const h of ['#/review', '#/lessons', '#/speak', '#/more', '#/write', '#/session', '#/session/extra', '#/shadow']) assert.equal(d(h), 1, h);
  for (const h of ['#/lesson/u1', '#/vocab', '#/progress', '#/settings', '#/install', '#/write/t1']) assert.equal(d(h), 2, h);
  assert.equal(d('#/settings/ai'), 3);
  assert.equal(d('#/jokin-tuntematon'), 0, 'tuntematon reitti näytetään Tänään-näkymänä');
  assert.equal(d(''), 0);
});

test('planNav: syvemmälle lisätään, samalle tasolle korvataan, ylemmälle palataan', () => {
  const plan = (stack, to) => {
    const p = planNav(stack, to);
    return `${p.kind}${p.pops ? p.pops : ''} -> ${p.next.map((s) => s.slice(2)).join(',')}`;
  };
  assert.equal(plan(['#/today'], '#/review'), 'push -> today,review');
  assert.equal(plan(['#/today', '#/review'], '#/lessons'), 'replace -> today,lessons');
  assert.equal(plan(['#/today', '#/lessons'], '#/today'), 'pop1 -> today');
  assert.equal(plan(['#/today', '#/more', '#/settings'], '#/today'), 'pop2 -> today');
  assert.equal(plan(['#/today', '#/more', '#/settings'], '#/review'), 'pop1 -> today,review', 'välilehti alisivulta: palataan välilehtitasolle ja korvataan');
  assert.equal(plan(['#/today', '#/more', '#/settings'], '#/more'), 'pop1 -> today,more');
  assert.equal(plan(['#/today', '#/more', '#/settings', '#/settings/ai'], '#/settings'), 'pop1 -> today,more,settings');
  assert.equal(plan(['#/today', '#/more', '#/settings'], '#/settings/ai'), 'push -> today,more,settings,settings/ai');
  assert.equal(plan(['#/today', '#/session'], '#/session/extra'), 'replace -> today,session/extra');
  assert.equal(plan(['#/today', '#/write', '#/write/t1'], '#/write/t2'), 'replace -> today,write,write/t2');
  assert.equal(plan(['#/today', '#/write', '#/write/t1'], '#/write'), 'pop1 -> today,write');
  assert.equal(plan(['#/today', '#/write', '#/write/t1'], '#/settings/ai'), 'push -> today,write,write/t1,settings/ai');
  assert.equal(plan(['#/today', '#/more', '#/install'], '#/settings'), 'replace -> today,more,settings');
});

test('planNav: sama näkymä piirretään uudelleen koskematta historiaan', () => {
  const p = planNav(['#/today', '#/review'], '#/review');
  assert.equal(p.kind, 'same');
  assert.equal(p.pops, 0);
  assert.equal(planNav(['#/today'], '').kind, 'same', 'tyhjä osoite on Tänään');
  assert.equal(planNav(['#/today'], '#/today').kind, 'same');
});

test('planNav: syvältä avattu sovellus ei yritä palata olemattomiin merkintöihin', () => {
  // Sovellus avattu suoraan asetuksiin: pinossa on vain yksi merkintä.
  const p = planNav(['#/settings'], '#/today');
  assert.equal(p.kind, 'replace');
  assert.deepEqual(p.next, ['#/today']);
  const q = planNav(['#/settings'], '#/review');
  assert.equal(q.kind, 'replace');
  assert.deepEqual(q.next, ['#/review']);
});

test('planNav: tyhjä tai puuttuva pino ei kaada laskentaa', () => {
  assert.equal(planNav([], '#/review').kind, 'same', 'puuttuva pino tulkitaan niin, että kohde on jo näkyvissä');
  assert.deepEqual(planNav(undefined, '#/review').next, ['#/review']);
  assert.deepEqual(stackAfter(undefined, '#/review'), ['#/review']);
});

test('stackAfter: selaimen itse tekemä siirtymä lasketaan samoin säännöin', () => {
  assert.deepEqual(stackAfter(['#/today'], '#/review'), ['#/today', '#/review']);
  assert.deepEqual(stackAfter(['#/today', '#/review'], '#/lessons'), ['#/today', '#/lessons']);
  assert.deepEqual(stackAfter(['#/today', '#/more', '#/settings'], '#/today'), ['#/today']);
  assert.deepEqual(stackAfter(['#/today', '#/review'], '#/review'), ['#/today', '#/review']);
});

test('validStack: vain eheä pino hyväksytään', () => {
  assert.equal(validStack(['#/today'], '#/today'), true);
  assert.equal(validStack(['#/today'], ''), true, 'tyhjä osoite on Tänään');
  assert.equal(validStack(['#/today', '#/more', '#/settings'], '#/settings'), true);
  assert.equal(validStack(['#/today', '#/more'], '#/settings'), false, 'viimeinen ei vastaa osoitetta');
  assert.equal(validStack([], '#/today'), false);
  assert.equal(validStack(null, '#/today'), false);
  assert.equal(validStack('#/today', '#/today'), false);
  assert.equal(validStack(['#/review', '#/today'], '#/today'), false, 'tasojen on kasvettava');
  assert.equal(validStack(['#/today', '#/review', '#/lessons'], '#/lessons'), false, 'kaksi samantasoista peräkkäin');
  assert.equal(validStack(['today'], '#/today'), false, 'osoitteet normalisoidussa muodossa');
  assert.equal(validStack(Array(9).fill('#/today'), '#/today'), false);
});

test('historian malli: ongelmatapaus: välilehdet ja Takaisin-linkki eivät kasvata historiaa', () => {
  const hist = makeHistory();
  for (const to of ['#/review', '#/lessons', '#/speak', '#/more', '#/settings', '#/today', '#/shadow']) hist.go(to);
  assert.equal(hist.hash, '#/shadow');
  hist.go('#/today'); // "‹ Takaisin" shadowing-näkymästä
  assert.equal(hist.hash, '#/today');
  assert.equal(hist.backsToExit(), 1, 'Takaisin-linkin jälkeen järjestelmän takaisin poistuu sovelluksesta heti');
});

test('historian malli: välilehdiltä takaisin palaa Tänään-näkymään ja vasta sitten poistutaan', () => {
  const hist = makeHistory();
  hist.go('#/review');
  hist.go('#/lessons');
  hist.go('#/speak');
  hist.go('#/more');
  assert.equal(hist.hash, '#/more');
  assert.equal(hist.backsToExit(), 2);
  assert.equal(hist.back(), true);
  assert.equal(hist.hash, '#/today');
  assert.equal(hist.back(), false, 'Tänään-näkymästä takaisin poistuu sovelluksesta');
});

test('historian malli: alisivulta takaisin palaa ylempään näkymään', () => {
  const hist = makeHistory();
  hist.go('#/more');
  hist.go('#/settings');
  hist.go('#/settings/ai');
  assert.deepEqual(hist.stack, ['#/today', '#/more', '#/settings', '#/settings/ai']);
  hist.back();
  assert.equal(hist.hash, '#/settings');
  hist.back();
  assert.equal(hist.hash, '#/more');
  hist.back();
  assert.equal(hist.hash, '#/today');
});

test('historian malli: päivän sessio: Valmis ja lopetus eivät jätä sessiota historiaan', () => {
  const hist = makeHistory();
  hist.go('#/session');
  hist.go('#/session/extra'); // "15 min lisää"
  assert.equal(hist.index, 1, 'lisäsessio korvaa session eikä lisää merkintää');
  hist.go('#/today'); // Valmis
  assert.equal(hist.hash, '#/today');
  assert.equal(hist.backsToExit(), 1);
});

test('historian malli: kirjoitustehtävät: seuraava tehtävä korvaa, lista on takaisin-kohde', () => {
  const hist = makeHistory();
  hist.go('#/write');
  hist.go('#/write/t1');
  hist.go('#/write/t2'); // "Seuraava tehtävä"
  assert.deepEqual(hist.stack, ['#/today', '#/write', '#/write/t2']);
  hist.back();
  assert.equal(hist.hash, '#/write');
  hist.back();
  assert.equal(hist.hash, '#/today');
});

test('historian malli: alavalikon välilehti alisivulta korvaa välilehtitason eikä jätä alisivua', () => {
  const hist = makeHistory();
  hist.go('#/more');
  hist.go('#/settings');
  hist.go('#/review'); // alavalikon Kertaus asetuksista
  assert.deepEqual(hist.stack, ['#/today', '#/review']);
  assert.equal(hist.backsToExit(), 2);
});

test('historian malli: suora linkki alisivulle: Tänään-välilehti korvaa merkinnän, takaisin poistuu', () => {
  const hist = makeHistory('#/settings');
  assert.equal(hist.backsToExit(), 1);
  hist.go('#/today');
  assert.equal(hist.hash, '#/today');
  assert.equal(hist.backsToExit(), 1, 'ei jää silmukkaan eikä palaa asetuksiin');
});

test('historian malli: eteenpäin-historia katkeaa uuden siirtymän jälkeen', () => {
  const hist = makeHistory();
  hist.go('#/more');
  hist.back();
  hist.go('#/review');
  assert.equal(hist.entries.length, 2);
  assert.deepEqual(hist.stack, ['#/today', '#/review']);
});

test('historian malli: satunnaiset siirtymät säilyttävät pinon eheyden eikä paluu ylitä historian alkua', () => {
  let seed = 12345;
  const rnd = (n) => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed % n;
  };
  for (const start of ['#/today', '#/settings', '#/write/t1']) {
    const hist = makeHistory(start);
    for (let step = 0; step < 4000; step++) {
      if (rnd(5) === 0) hist.back();
      else hist.go(HASHES[rnd(HASHES.length)]);
      const st = hist.stack;
      assert.ok(validStack(st, hist.hash), `pino ei ole eheä askeleella ${step}: ${st.join(' > ')} / ${hist.hash}`);
      assert.equal(st.length, hist.index + 1, 'pinon pituus vastaa merkintöjen määrää historian alussa');
      assert.ok(st.length <= 4);
    }
  }
});

test('historian malli: mikään siirtymäpolku ei vaadi yli neljää takaisin-painallusta', () => {
  let seed = 777;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const hist = makeHistory();
  let worst = 0;
  for (let step = 0; step < 3000; step++) {
    hist.go(HASHES[rnd(HASHES.length)]);
    worst = Math.max(worst, hist.backsToExit());
  }
  assert.ok(worst <= 4, `pahin tapaus ${worst} painallusta`);
});
