// Päästä päähän -testi: ajaa koko sovelluksen oikeassa Chromiumissa alipolussa /englanti-testi/.
// Ajo: NODE_PATH=/usr/local/lib/node_modules_global node tests/e2e/app.cjs
// Kuvat: E2E_OUT=<hakemisto> (oletus /tmp/e2e-out).

const { serve, launch } = require('./harness.cjs');
const path = require('path');
const fs = require('fs');

const OUT = process.env.E2E_OUT || '/tmp/e2e-out';
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Päivä 1: tiistai 3.11.2026 klo 10 Helsingin aikaa. */
const DAY1 = new Date('2026-11-03T10:00:00+02:00');
const atDay = (n, hour = 10) => new Date(DAY1.getTime() + n * 86400000 + (hour - 10) * 3600000);

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
}

const GARBAGE = /\bnull\b|\bundefined\b|\bNaN\b|Infinity|\[object|\{\{|\$\{/;
/** Sivulla ei saa näkyä ohjelmointivirheiden jättämää roskatekstiä. */
async function noGarbage(page, label) {
  const text = await page.evaluate(() => document.querySelector('#view')?.innerText ?? '');
  const m = text.match(GARBAGE);
  check(`ei roskatekstiä: ${label}`, !m, m ? `löytyi "${m[0]}" kohdassa: ...${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, ' ')}...` : '');
}

async function overflow(page, label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(`ei vaakavieritystä: ${label}`, r.sw <= r.iw, `${r.sw} > ${r.iw}`);
}

async function go(page, base, hash) {
  await page.goto('about:blank'); // pakottaa täyden latauksen myös silloin, kun vain hash muuttuu
  await page.goto(base + (hash ? `#/${hash}` : ''), { waitUntil: 'load' });
  await page.waitForSelector('#view h1, .runner, .summary', { timeout: 10000 });
}
async function navTo(page, hash) {
  await page.evaluate((h) => (location.hash = `#/${h}`), hash);
  await page.waitForSelector('#view h1, .runner, .summary', { timeout: 10000 });
}

const itemByFi = (page, fi) =>
  page.evaluate((fi) => {
    const it = window.__englanti.catalog.items.find((i) => i.fi === fi);
    return it ? { id: it.id, en: it.en, say: it.say } : null;
  }, fi);

/**
 * Pelaa tehtäväjonon loppuun. policy:
 *  - wrongChoose: joukko (järjestysnumeroita) valintatehtäviä, joihin vastataan väärin
 *  - known: joukko (järjestysnumeroita) opetustehtäviä, joissa painetaan "Osaan tämän jo"
 *  - grade: arvosana (1–4), jonka itsearvioitaviin tehtäviin antaa (oletus 3)
 *  - prod: 'mic' | 'type' | 'reveal' vastaustapa flip-prod-tehtävissä
 *  - maxSteps: pelattavien tehtävien enimmäismäärä (oletus: kunnes yhteenveto)
 *  - tick: valekellon edistys (ms) jokaista tehtävää kohti; vaatii window.__fakeT:n ja ctx.now:n korvauksen
 */
async function playRunner(page, policy = {}) {
  const { wrongChoose = new Set(), known = new Set(), grade = 3, prod = 'mic', maxSteps = 250, tick = 0, onShown, onRevealed } = policy;
  const log = [];
  let chooseIndex = 0;
  let teachIndex = 0;
  const squareIcons = async (where) => {
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('.runner-box .icon-btn')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0 && Math.abs(r.width - r.height) > 2).map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    if (bad.length) {
      failures++;
      console.log(`FAIL  kuvakepainike ei ole neliö tehtävässä (${where}): ${bad.join(', ')}`);
    }
  };
  const garbage = async (where) => {
    await squareIcons(where);
    const text = await page.evaluate(() => (document.querySelector('.runner-box')?.innerText ?? ''));
    const m = text.match(GARBAGE);
    if (m) {
      failures++;
      console.log(`FAIL  roskatekstiä tehtävässä (${where}): "${m[0]}" -> ${text.replace(/\n/g, ' | ').slice(0, 200)}`);
    }
  };
  // Napsauttaa tehtävän päättävää painiketta ja odottaa, että seuraava tehtävä (tai yhteenveto) on piirretty.
  const advance = async (click) => {
    const before = await page.evaluate(() => window.__sig());
    if (tick) await page.evaluate((ms) => { window.__fakeT += ms; }, tick);
    await click();
    await page.waitForFunction((b) => window.__sig() !== b, before, { timeout: 10000 });
  };
  for (let step = 0; step < maxSteps; step++) {
    let kind = await page.evaluate(() => window.__kind());
    for (let i = 0; kind === 'none' && i < 12; i++) {
      await page.waitForTimeout(100);
      kind = await page.evaluate(() => window.__kind());
    }
    if (kind === 'summary' || kind === 'none') return { log, end: kind };
    const rec = { kind };
    await garbage(kind);
    await onShown?.(kind);

    if (kind === 'intro') {
      await advance(() => page.click('.runner-box .actions .btn.primary'));
    } else if (kind === 'teach') {
      rec.known = known.has(teachIndex++);
      await advance(() => page.click(rec.known ? '.runner-box .actions .btn.link' : '.runner-box .actions .btn.primary'));
    } else if (kind === 'choose') {
      const info = await page.evaluate(() => {
        const s = document.querySelector('.runner-box .sentence').textContent;
        const it = window.__englanti.catalog.items.find((i) => i.cloze && i.cloze.text.replace('___', '＿＿＿') === s);
        return it ? { answer: it.cloze.answer, distractors: it.cloze.distractors, id: it.id } : null;
      });
      if (!info) throw new Error('choose: ei löytynyt aukkotehtävää lauseelle ' + (await page.textContent('.runner-box .sentence')));
      const wrong = wrongChoose.has(chooseIndex++);
      const target = wrong ? info.distractors[0] : info.answer;
      await page.locator('.runner-box .option span[lang="en-US"]', { hasText: new RegExp(`^${escapeRe(target)}$`) }).first().click();
      await page.waitForSelector('.runner-box .verdict');
      rec.correct = !wrong;
      rec.verdict = await page.textContent('.runner-box .verdict');
      await garbage('choose-vastaus');
      await onRevealed?.(kind, rec);
      await advance(() => page.click('.runner-box .actions .btn.primary.big'));
    } else if (kind === 'flip-rec') {
      await page.click('.runner-box .actions .btn.primary.big');
      await page.waitForSelector('.runner-box .grades');
      rec.gradeCount = await page.locator('.runner-box .grades .btn').count();
      await garbage('flip-rec-vastaus');
      await onRevealed?.(kind, rec);
      await advance(() => page.click(`.runner-box .grades [data-grade="${grade}"]`));
    } else if (kind === 'flip-prod') {
      const fi = await page.textContent('.runner-box .meaning.big');
      const it = await itemByFi(page, fi);
      if (!it) throw new Error('flip-prod: ei löytynyt ilmausta merkitykselle ' + fi);
      const spoken = it.en.replace(/…/g, ' ').replace(/\s+/g, ' ').trim();
      const hasMic = (await page.locator('.runner-box .btn.mic').count()) > 0;
      rec.mode = prod === 'mic' && hasMic ? 'mic' : prod === 'type' ? 'type' : 'reveal';
      if (rec.mode === 'mic') {
        await page.evaluate((t) => window.__asrQueue.push(t), spoken);
        await page.click('.runner-box .btn.mic');
        await page.waitForSelector('.runner-box .result-line', { timeout: 5000 });
        rec.result = await page.textContent('.runner-box .result-line');
      } else if (rec.mode === 'type') {
        if ((await page.locator('.runner-box input.text-input').count()) === 0) await page.click('.runner-box .btn.link');
        await page.fill('.runner-box input.text-input', spoken);
        await page.press('.runner-box input.text-input', 'Enter');
        await page.waitForSelector('.runner-box .result-line');
        rec.result = await page.textContent('.runner-box .result-line');
      } else {
        await page.click('.runner-box .actions .btn:not(.primary)');
        await page.waitForSelector('.runner-box .answer');
      }
      await garbage('flip-prod-vastaus');
      await onRevealed?.(kind, rec);
      if ((await page.locator('.runner-box .grades').count()) > 0) {
        rec.suggested = await page.locator('.runner-box .grades .suggested').count();
        rec.gradeCount = await page.locator('.runner-box .grades .btn').count();
        await advance(() => page.click(`.runner-box .grades [data-grade="${grade}"]`));
      } else {
        rec.practice = true;
        await advance(() => page.click('.runner-box .actions .btn.primary'));
      }
    } else if (kind === 'shadow') {
      const say = await page.textContent('.runner-box .phrase');
      if ((await page.locator('.runner-box .btn.mic').count()) > 0) {
        await page.evaluate((t) => window.__asrQueue.push(t), say);
        await page.click('.runner-box .btn.mic');
        await page.waitForSelector('.runner-box .result-line', { timeout: 5000 });
        rec.result = await page.textContent('.runner-box .result-line');
      }
      await garbage('shadow-tulos');
      await onRevealed?.(kind, rec);
      await advance(() => page.click('.runner-box .actions .btn.primary'));
    } else {
      throw new Error('tuntematon tehtävä: ' + kind);
    }
    log.push(rec);
  }
  if (policy.maxSteps !== undefined) return { log, end: null };
  throw new Error('tehtäväjono ei päättynyt');
}

const dbState = (page) =>
  page.evaluate(async () => {
    const e = window.__englanti;
    const reviews = await e.db.getAllReviews();
    const cards = [...e.srs.cards.values()];
    return { cards: cards.length, reviews: reviews.length, learned: cards.filter((c) => c.state !== 0).length, byDay: cards.map((c) => c.dueDay) };
  });

(async () => {
  const srv = await serve(path.join(__dirname, '..', '..'));
  const { browser, context, page, problems } = await launch();
  const base = srv.base;
  const run = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      failures++;
      console.log(`FAIL  ${name}: ${e.stack || e}`);
      await shot(page, `virhe-${name.replace(/\W+/g, '-')}`).catch(() => {});
    }
  };

  /* ===== 1. Ensikäynnistys ja päivän sessio ===== */
  await run('päivä 1', async () => {
    await context.clock.setFixedTime(DAY1);
    await go(page, base);
    check('Tänään-näkymä avautuu', (await page.textContent('#view h1')) === 'Tänään');
    check('ensikäyttökortti näkyy', (await page.locator('.card.intro').count()) === 1);
    check('päivämäärä on tiistai 3.11.', (await page.textContent('.date')).includes('tiistai 3.11.'), await page.textContent('.date'));
    await overflow(page, 'Tänään');
    await page.click('.card.intro .btn');
    check('ensikäyttökortti sulkeutuu', (await page.locator('.card.intro').count()) === 0);
    await page.waitForFunction(async () => (await window.__englanti.db.getKv('meta', {})).onboarded === true);
    await page.reload();
    await page.waitForSelector('#view h1');
    check('ensikäyttökortti pysyy suljettuna uudelleenlatauksen jälkeen', (await page.locator('.card.intro').count()) === 0);
    await noGarbage(page, 'Tänään');
    const plan = await page.textContent('.plan');
    check('suunnitelma kertoo uuden sisällön ja puheen', /Uutta: enintään 12 ilmausta/.test(plan) && /Puhetta/.test(plan), plan);
    await shot(page, '01-tanaan');

    await page.click('a.btn.primary.big[href="#/session"]');
    await page.waitForSelector('.runner');
    const first = await page.evaluate(() => window.__kind());
    check('sessio alkaa aiheen esittelyllä (ei erääntyneitä)', first === 'intro', first);
    const introText = await page.textContent('.runner-box');
    check('aiheen esittelyssä on aihe ja aloituspainike', /Sähköpostin avaus/.test(introText) && /Aloitetaan/.test(introText), introText);
    await shot(page, '02-aiheen-esittely');
    const taken = new Set();
    const res = await playRunner(page, {
      prod: 'mic',
      onShown: async (kind) => {
        if (kind === 'teach' && !taken.has('teach-checks')) {
          taken.add('teach-checks');
          // Automaattinen toisto: ensin ilmaus, sitten esimerkkilause (päivämäärä järjestyslukuna).
          await page.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
          const sp = await page.evaluate(() => window.__spoken.slice(0, 2));
          check('opetuksessa ääni lukee ensin ilmauksen ja sitten esimerkkilauseen', sp[0] === "I'm writing to follow up on" && sp[1] === "I'm writing to follow up on the invoice we sent on October third.", JSON.stringify(sp));
          const t = await page.textContent('.runner-box');
          check('opetusnäkymä ohjeistaa sanomaan ilmauksen ääneen', /Sano ilmaus ääneen/.test(t), t);
          check('opetusnäkymässä on "Osaan tämän jo" ja "Hitaasti"', /Osaan tämän jo/.test(t) && /Hitaasti/.test(t), t);
        }
        if (kind !== 'intro' && !taken.has('shown-' + kind)) {
          taken.add('shown-' + kind);
          await shot(page, `30-${kind}-alussa`);
        }
      },
      onRevealed: async (kind) => {
        if (!taken.has('rev-' + kind)) {
          taken.add('rev-' + kind);
          await shot(page, `31-${kind}-vastattu`);
        }
      },
    });
    const kinds = res.log.map((l) => l.kind);
    const count = (k) => kinds.filter((x) => x === k).length;
    const tests = res.log.filter((l) => l.kind === 'choose' || l.kind === 'flip-rec');
    const produce = res.log.filter((l) => l.kind === 'flip-prod');
    const shadows = res.log.filter((l) => l.kind === 'shadow');
    check('sessio päättyy yhteenvetoon', res.end === 'summary', res.end);
    check('12 opetusta, 12 testiä, 12 tuottamisharjoitusta ja 8 puhelausetta', count('teach') === 12 && tests.length === 12 && produce.length === 12 && shadows.length === 8, kinds.join(','));
    check('aiheen esittely näytetään kerran ennen aiheen ensimmäistä ilmausta', count('intro') === 1 && kinds[0] === 'intro' && kinds[1] === 'teach', kinds.slice(0, 3).join(','));
    const shape = kinds.slice(0, 10).map((k) => (k === 'choose' || k === 'flip-rec' ? 'test' : k)).join(',');
    check('ryhmän rakenne: esittely, 3 opetusta, 3 testiä, 3 tuottamista', shape === 'intro,teach,teach,teach,test,test,test,flip-prod,flip-prod,flip-prod', shape);
    check('puhe tulee vasta uuden sisällön jälkeen', kinds.slice(-8).every((k) => k === 'shadow'), kinds.slice(-9).join(','));
    check('tuottamisharjoituksissa ei kysytä arvosanaa', produce.every((l) => l.practice === true), JSON.stringify(produce.filter((l) => !l.practice)));
    const flipRecs = tests.filter((l) => l.kind === 'flip-rec');
    check('ensimmäisillä kerroilla "Helppo" on piilotettu (3 arvosanaa)', flipRecs.length > 0 && flipRecs.every((l) => l.gradeCount === 3), JSON.stringify(flipRecs.map((l) => l.gradeCount)));
    check('puheharjoituksissa täsmäys 100 %', shadows.every((l) => /100 %/.test(l.result ?? '')), JSON.stringify(shadows));
    const summary = await page.textContent('.summary');
    check('yhteenvedossa opittu 12', /Opit uutta\s*12/.test(summary), summary);
    check('yhteenvedossa puhetäsmäys 100 %', /100 %/.test(summary), summary);
    await noGarbage(page, 'yhteenveto');
    await shot(page, '03-yhteenveto');
    await overflow(page, 'yhteenveto');
    const spoken = await page.evaluate(() => window.__spoken);
    check('päivämäärä luetaan järjestyslukuna ("October third", ei "October three")', spoken.some((t) => /October third\./.test(t)) && !spoken.some((t) => /October (3|three)\b/.test(t)), JSON.stringify(spoken.slice(0, 4)));
    check('aukon merkkiä (…) ei lueta ääneen', spoken.every((t) => !t.includes('…')), JSON.stringify(spoken.filter((t) => t.includes('…'))));
    const rates = await page.evaluate(() => [...new Set(window.__rates)]);
    check('puhenopeus on oletuksena 0,85', rates.length === 1 && rates[0] === 0.85, JSON.stringify(rates));
    const st = await dbState(page);
    check('tietokannassa 12 korttia ja 12 kertaustapahtumaa', st.cards === 12 && st.reviews === 12 && st.learned === 12, JSON.stringify(st));
    const act = await page.evaluate(async () => await window.__englanti.db.getKv('activity', {}));
    check('harjoitteluaika kirjautuu päiväkohtaisesti', Object.values(act).reduce((a, b) => a + b, 0) > 0, JSON.stringify(act));
    await page.click('.summary a.btn.primary');
    await page.waitForSelector('#view h1');
    const heroTitle = await page.textContent('.hero h2');
    check('Tänään kertoo session olevan tehty', /tehty/.test(heroTitle), heroTitle);
    const heroText = await page.textContent('.hero');
    check('Tänään näyttää todellisen harjoitteluajan', /Harjoittelit tänään \d+/.test(heroText), heroText);
  });

  /* ===== 2. Vääriin vastauksiin palaaminen (uudelleenjono) ===== */
  await run('uudelleenjono', async () => {
    await context.clock.setFixedTime(atDay(0, 15));
    await go(page, base, 'session/extra');
    let wrongShot = false;
    const res = await playRunner(page, {
      wrongChoose: new Set([0]),
      prod: 'type',
      onRevealed: async (kind, rec) => {
        if (kind === 'choose' && rec.correct === false && !wrongShot) {
          wrongShot = true;
          await shot(page, '34-choose-vaarin');
        }
      },
    });
    const choose = res.log.filter((l) => l.kind === 'choose' || l.kind === 'flip-rec');
    check('väärä vastaus tuo tehtävän takaisin jonoon', choose.length >= 13, `testejä ${choose.length}`);
    check('väärän vastauksen palaute näkyy', res.log.some((l) => l.kind === 'choose' && l.correct === false && /Ei aivan/.test(l.verdict)), JSON.stringify(res.log.filter((l) => l.kind === 'choose')));
    const st = await dbState(page);
    check('toinen sessio lisäsi uusia ilmauksia (24 korttia)', st.cards === 24, JSON.stringify(st));
    await shot(page, '04-lisasessio-yhteenveto');
  });

  /* ===== 3. Kertaus kolmen päivän kuluttua ===== */
  await run('kertaus päivä 4', async () => {
    await context.clock.setFixedTime(atDay(3));
    await go(page, base);
    const plan = await page.textContent('.plan');
    check('Tänään ehdottaa kertausta', /Kertausta: \d+ ilmausta/.test(plan), plan);
    await shot(page, '05-tanaan-kertausta');
    await navTo(page, 'review');
    const title = await page.textContent('.hero h2');
    check('Kertaus-näkymä näyttää erääntyneet', /\d+ erääntynyttä/.test(title), title);
    await page.click('.hero .btn.primary');
    await page.waitForSelector('.runner');
    await shot(page, '06-kertaus-tehtava');
    const res = await playRunner(page, { grade: 3 });
    check('kertaus päättyy yhteenvetoon', res.end === 'summary', res.end);
    const kinds = new Set(res.log.map((l) => l.kind));
    check('nuorilla korteilla käytetään helppoja muotoja', [...kinds].every((k) => k === 'choose' || k === 'flip-rec'), [...kinds].join(','));
    const title2 = await page.textContent('.summary h1');
    check('yhteenvedon otsikko "Kertaus tehty"', title2 === 'Kertaus tehty', title2);
    const st = await dbState(page);
    check('kertaushistoria kasvoi', st.reviews > 24, JSON.stringify(st));
  });

  /* ===== 4. Vanhemmat kortit: tuottamistehtävät (puhe, kirjoitus, paljastus) ===== */
  await run('tuottamistehtävät', async () => {
    // Siirrytään niin pitkälle, että vakaus on ≥ 4 pv ja kaikki on taas erääntynyt.
    await context.clock.setFixedTime(atDay(30));
    await go(page, base, 'review');
    await page.click('.hero .btn.primary');
    await page.waitForSelector('.runner');
    // Kolme eri vastaustapaa peräkkäin: puhe, kirjoitus, paljastus.
    const modes = ['mic', 'type', 'reveal'];
    const seen = [];
    for (let guard = 0; guard < 60; guard++) {
      const idx = seen.length;
      const part = await playRunner(page, {
        prod: modes[idx % 3],
        grade: 3,
        maxSteps: 1,
        onShown: async (kind) => {
          if (kind === 'flip-prod' && idx < 3) await shot(page, `32-flip-prod-${modes[idx % 3]}-alussa`);
        },
        onRevealed: async (kind) => {
          if (kind === 'flip-prod' && idx < 3) await shot(page, `33-flip-prod-${modes[idx % 3]}-vastattu`);
        },
      });
      for (const l of part.log) if (l.kind === 'flip-prod') seen.push(l);
      if (part.end) break;
    }
    check('pitkän ajan kuluttua esiintyy tuottamistehtäviä', seen.length >= 3, `flip-prod ${seen.length}`);
    check('puhevastaus saa täsmäyksen ja ehdotuksen', seen.some((l) => l.mode === 'mic' && /Täsmäys 100 %/.test(l.result ?? '') && l.suggested === 1), JSON.stringify(seen));
    check('kirjoitettu vastaus saa täsmäyksen', seen.some((l) => l.mode === 'type' && /Täsmäys 100 %/.test(l.result ?? '')), JSON.stringify(seen));
    check('vastauksen voi vain paljastaa', seen.some((l) => l.mode === 'reveal'), JSON.stringify(seen));
  });

  await shot(page, '07-kertaus-jalkeen');

  /* ===== 5. Oppitunnit, lopetus ja sanasto ===== */
  await run('oppitunnit', async () => {
    await context.clock.setFixedTime(atDay(30, 11));
    await go(page, base, 'lessons');
    check('oppituntilistassa on aiheita', (await page.locator('details.unit').count()) >= 10, String(await page.locator('details.unit').count()));
    await page.locator('details.unit summary').nth(2).click();
    await noGarbage(page, 'Oppitunti');
    await shot(page, '08-oppitunnit');
    await overflow(page, 'Oppitunnit');
    await page.locator('details.unit[open] a.btn.primary').click();
    await page.waitForSelector('.runner');
    check('oppitunti alkaa opetuksella', (await page.evaluate(() => window.__kind())) === 'teach');
    await page.click('.runner-head .icon-btn');
    await page.waitForSelector('dialog[open]');
    await shot(page, '09-lopeta-vahvistus');
    await page.click('dialog[open] .btn:not(.primary)'); // Jatka
    await page.waitForTimeout(100);
    check('"Jatka" pysyttää oppitunnilla', (await page.locator('.runner').count()) === 1);
    await page.click('.runner-head .icon-btn');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog[open] .btn.primary'); // Lopeta
    await page.waitForSelector('#view h1');
    check('lopetus palaa oppituntilistaan', (await page.textContent('#view h1')) === 'Oppitunti', await page.textContent('#view h1'));
    check('osoite on #/lessons', (await page.evaluate(() => location.hash)) === '#/lessons');

    await navTo(page, 'vocab');
    const total = await page.textContent('[role=status]');
    check('sanastossa on kaikki ilmaukset', /^126 ilmausta/.test(total), total);
    await page.fill('#q', 'invoice');
    const found = await page.textContent('[role=status]');
    check('sanaston haku suodattaa', /^\d+ ilmausta/.test(found) && !/^126/.test(found), found);
    await page.fill('#q', '');
    await page.selectOption('#f', 'learned');
    const learned = await page.textContent('[role=status]');
    check('Opitut-suodatin näyttää 24 ilmausta', /^24 ilmausta/.test(learned), learned);
    await page.locator('details.vocab-item summary').first().click();
    await noGarbage(page, 'Sanasto');
    await shot(page, '10-sanasto');
    await overflow(page, 'Sanasto');
  });

  /* ===== 6. Puhu-näkymä ===== */
  await run('puhu', async () => {
    await navTo(page, 'speak');
    check('Puhu-näkymässä on kaksi harjoitusta', (await page.locator('.card .btn.primary').count()) === 2);
    await noGarbage(page, 'Puhu');
    await shot(page, '11-puhu');
    await page.locator('.card .btn.primary').first().click();
    await page.waitForSelector('.runner');
    // Ensimmäisessä tehtävässä tunnistus ei kuule mitään
    await page.click('.runner-box .btn.mic');
    await page.waitForSelector('.attempt-status:not(:empty)');
    const status = await page.textContent('.attempt-status');
    check('"ei puhetta" -virhe näytetään', /En kuullut puhetta/.test(status), status);
    const res = await playRunner(page);
    check('Kuuntele ja sano perässä päättyy yhteenvetoon', res.end === 'summary', res.end);
    check('yhteenvedon otsikko on "Puheharjoitus valmis"', (await page.textContent('.summary h1')) === 'Puheharjoitus valmis');

    await page.click('#nav a[data-nav="speak"]'); // sama osoite: näkymän on piirryttävä uudelleen
    await page.waitForSelector('#view h1');
    await page.locator('.card .btn.primary').nth(1).click();
    await page.waitForSelector('.runner');
    const res2 = await playRunner(page, { prod: 'mic' });
    check('Sano englanniksi -harjoitus ei kysy arvosanaa', res2.log.length === 5 && res2.log.every((l) => l.practice), JSON.stringify(res2.log));
    await shot(page, '12-puhe-yhteenveto');
  });

  /* ===== 7. Edistyminen ja Lisää ===== */
  await run('edistyminen', async () => {
    await navTo(page, 'more');
    check('Lisää-näkymässä on kolme linkkiä', (await page.locator('nav.tiles a').count()) === 3);
    await noGarbage(page, 'Lisää');
    await shot(page, '13-lisaa');
    await navTo(page, 'progress');
    const text = await page.textContent('#view');
    check('Edistyminen ei sisällä NaN/undefined-arvoja', !/NaN|undefined|Infinity/.test(text), text.slice(0, 400));
    check('Edistymisessä on oppimiskäyrä', (await page.locator('svg.chart polyline').count()) === 1);
    check('Edistymisessä on 14 pylvästä', (await page.locator('.bars .col').count()) === 14);
    await noGarbage(page, 'Edistyminen');
    await shot(page, '14-edistyminen', { fullPage: true });
    await overflow(page, 'Edistyminen');
    await navTo(page, 'today');
    const facts = await page.textContent('.facts');
    check('Tänään-näkymän tilanne näyttää opitut', /24 \/ 126/.test(facts), facts);
  });

  /* ===== 8. Asetukset ===== */
  await run('asetukset', async () => {
    await navTo(page, 'settings');
    await noGarbage(page, 'Asetukset');
    const swSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
    const swVersion = (swSrc.match(/const VERSION = '([0-9a-f]+)'/) ?? [])[1];
    const about = await page.textContent('#about');
    check('Asetuksissa näkyy sovelluksen versio ja käytössä oleva kuoritunniste', new RegExp(`Versio 0\\.3\\.0 \\(${swVersion}\\)\\. Sisältö: 126 ilmausta, 12 aihetta`).test(about), about);
    await shot(page, '15-asetukset', { fullPage: true });
    await overflow(page, 'Asetukset');
    await page.selectOption('#s-theme', 'dark');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', null, { timeout: 2000 }).catch(() => {});
    check('tumma teema asettuu', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await page.selectOption('#s-theme', 'auto');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === null, null, { timeout: 2000 }).catch(() => {});
    check('automaattinen teema poistaa attribuutin', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === null);
    await page.locator('#s-new').evaluate((el) => {
      el.value = '9';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#s-scale').evaluate((el) => {
      el.value = '1.2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.check('#s-clear');
    await page.check('#s-type');
    await page.waitForTimeout(150);
    await page.reload();
    await page.waitForSelector('#view h1');
    const saved = await page.evaluate(() => window.__englanti.settings());
    check('asetukset säilyvät uudelleenlatauksen jälkeen', saved.newMax === 9 && !('newPerDay' in saved) && saved.textScale === 1.2 && saved.clearText === true && saved.speakMode === 'type', JSON.stringify(saved));
    check('tekstin koko vaikuttaa juurielementtiin', (await page.evaluate(() => document.documentElement.style.fontSize)) === '120%');
    await shot(page, '16-asetukset-suuri-teksti');
    // Palautetaan puhetila ja koko muita testejä varten
    await page.check('#s-mic');
    await page.locator('#s-scale').evaluate((el) => {
      el.value = '1';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.uncheck('#s-clear');
    await page.waitForTimeout(150);
  });

  /* ===== 9. Varmuuskopio: vienti, poisto, tuonti ===== */
  await run('varmuuskopio', async () => {
    await navTo(page, 'settings');
    const before = await dbState(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Lataa varmuuskopio')]);
    const file = path.join(OUT, 'varmuuskopio.json');
    await download.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    check('varmuuskopion tiedostonimi', /^englanti-varmuuskopio-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    check('varmuuskopiossa kortit, tapahtumat ja asetukset', data.app === 'englanti-testi' && data.cards.length === before.cards && data.reviews.length === before.reviews && data.settings && data.settings.newMax === 9, JSON.stringify({ app: data.app, cards: data.cards.length, reviews: data.reviews.length }));
    check('varmuuskopio ei sisällä API-avaimia', !/api[_-]?key|AIza|sk-ant/i.test(JSON.stringify(data)));

    await page.click('text=Poista kaikki tiedot');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog[open] .btn.danger');
    await page.waitForSelector('#view .hero');
    const wiped = await dbState(page);
    check('poisto tyhjentää kortit ja historian', wiped.cards === 0 && wiped.reviews === 0, JSON.stringify(wiped));
    check('poiston jälkeen ensikäyttökortti näkyy taas', (await page.locator('.card.intro').count()) === 1);

    await navTo(page, 'settings');
    await page.setInputFiles('#s-file', file);
    await page.waitForSelector('dialog[open]');
    await shot(page, '17-tuonti-vahvistus');
    await page.click('dialog[open] .btn.primary'); // Yhdistä
    await page.waitForSelector('#view .hero');
    const restored = await dbState(page);
    check('tuonti palauttaa kortit ja kertaushistorian', restored.cards === before.cards && restored.reviews === before.reviews, JSON.stringify({ before, restored }));
    const settings = await page.evaluate(() => window.__englanti.settings());
    check('tuonti palauttaa asetukset', settings.newMax === 9, JSON.stringify(settings));

    // Rikkinäinen tiedosto hylätään
    await navTo(page, 'settings');
    const bad = path.join(OUT, 'rikki.json');
    fs.writeFileSync(bad, JSON.stringify({ app: 'muu', schema: 1 }));
    await page.setInputFiles('#s-file', bad);
    await page.waitForSelector('.toast');
    const toast = await page.textContent('.toast');
    check('virheellinen varmuuskopio hylätään ymmärrettävästi', toast.length > 5 && (await page.locator('dialog[open]').count()) === 0, toast);
  });

  /* ===== 10. Tumma teema ja koot ===== */
  await run('ulkoasu', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const [name, hash] of [['today', 'today'], ['lessons', 'lessons'], ['progress', 'progress'], ['settings', 'settings']]) {
      await navTo(page, hash);
      await shot(page, `20-tumma-${name}`, { fullPage: name !== 'today' });
    }
    await context.clock.setFixedTime(atDay(30, 12));
    await navTo(page, 'session/extra');
    await page.waitForSelector('.runner');
    await shot(page, '21-tumma-tehtava');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 360, height: 640 });
    await navTo(page, 'today');
    await overflow(page, 'Tänään 360 px');
    await page.setViewportSize({ width: 1280, height: 800 });
    await navTo(page, 'today');
    await shot(page, '22-tyopoyta');
    await page.setViewportSize({ width: 412, height: 915 });
  });

  /* ===== 10b. Näppäimistö ja saavutettavuus ===== */
  await run('näppäimistö', async () => {
    await context.clock.setFixedTime(atDay(30, 13));
    await go(page, base);
    await page.keyboard.press('Tab');
    const skipFocused = await page.evaluate(() => document.activeElement && document.activeElement.className === 'skip');
    check('ensimmäinen Tab-kohde on "Siirry sisältöön"', skipFocused);
    await page.keyboard.press('Enter');
    check('hyppylinkki ei muuta reittiä', (await page.evaluate(() => location.hash)) === '');
    check('hyppylinkki siirtää kohdistuksen pääalueelle', (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'main');
    check('Tänään-näkymän navigaatiossa on aria-current', (await page.getAttribute('#nav a[data-nav="today"]', 'aria-current')) === 'page');
    check('sivulla on yksi h1', (await page.locator('h1').count()) === 1);

    await navTo(page, 'session/extra');
    await page.waitForSelector('.runner');
    const shortcuts = { choose: false, flipRec: false };
    const pressAndWait = async (key) => {
      const before = await page.evaluate(() => window.__sig());
      await page.keyboard.press(key);
      await page.waitForFunction((b) => window.__sig() !== b, before, { timeout: 5000 });
    };
    for (let i = 0; i < 60 && !(shortcuts.choose && shortcuts.flipRec); i++) {
      const kind = await page.evaluate(() => window.__kind());
      if (kind === 'summary' || kind === 'none') break;
      if (kind === 'intro' || kind === 'teach') {
        await pressAndWait('Enter');
      } else if (kind === 'choose') {
        const idx = await page.evaluate(() => {
          const s = document.querySelector('.runner-box .sentence').textContent;
          const it = window.__englanti.catalog.items.find((x) => x.cloze && x.cloze.text.replace('___', '＿＿＿') === s);
          const opts = [...document.querySelectorAll('.runner-box .option span[lang]')].map((e) => e.textContent);
          return opts.indexOf(it.cloze.answer);
        });
        await page.keyboard.press(String(idx + 1));
        await page.waitForSelector('.runner-box .verdict.ok');
        shortcuts.choose = true;
        await pressAndWait('Enter');
      } else if (kind === 'flip-rec') {
        await page.keyboard.press('Space');
        await page.waitForSelector('.runner-box .grades');
        shortcuts.flipRec = true;
        await pressAndWait('3');
      } else if (kind === 'flip-prod') {
        // Tuottamisharjoitus: näytä vastaus ja jatka painikkeella.
        await page.click('.runner-box .actions .btn:not(.primary)');
        await page.waitForSelector('.runner-box .answer');
        const before = await page.evaluate(() => window.__sig());
        await page.click('.runner-box .actions .btn.primary');
        await page.waitForFunction((b) => window.__sig() !== b, before, { timeout: 5000 });
      } else {
        break;
      }
    }
    check('valintatehtävän voi vastata numeronäppäimellä ja jatkaa Enterillä', shortcuts.choose);
    check('muistitehtävän voi paljastaa välilyönnillä ja arvioida numerolla', shortcuts.flipRec);
  });

  /* ===== 10c. Laitetesti uudessa osoitteessa ===== */
  await run('laitetesti', async () => {
    await go(page, base); // juuren service worker on käytössä
    await page.evaluate(async () => (await navigator.serviceWorker.ready, true));
    const via = await page.evaluate(async () => {
      const r = await fetch('laitetesti/lib.js');
      return { status: r.status, cached: Boolean(await caches.match('laitetesti/lib.js')) };
    });
    check('juuren service worker ei välimuistita laitetestin tiedostoja', via.status === 200 && via.cached === false, JSON.stringify(via));
    await page.goto(base + 'laitetesti/');
    await page.waitForSelector('h1');
    check('laitetesti avautuu osoitteessa /laitetesti/', (await page.textContent('h1')) === 'Laitetesti');
    check('laitetestin tilariveillä on seitsemän testiä', (await page.locator('li[data-test]').count()) === 7);
    await page.goto(base);
    await page.waitForSelector('#view h1');
    check('paluu sovellukseen toimii', (await page.textContent('#view h1')) === 'Tänään');
  });

  /* ===== 11. Offline ===== */
  await run('offline', async () => {
    await context.clock.setFixedTime(atDay(31));
    await go(page, base);
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const cache = await caches.open(keys.find((k) => /^englanti-[0-9a-f]{10}$/.test(k)));
      const urls = (await cache.keys()).map((r) => new URL(r.url).pathname);
      return { active: reg.active && reg.active.state, scope: new URL(reg.scope).pathname, keys, urls, controlled: Boolean(navigator.serviceWorker.controller) };
    });
    check('service worker on aktiivinen alipolussa', info.active === 'activated' && info.scope === '/englanti-testi/', JSON.stringify(info).slice(0, 300));
    const swText = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
    const shell = [...swText.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
    const missing = shell.filter((f) => !info.urls.includes('/englanti-testi/' + f));
    check('kaikki sovelluskuoren tiedostot ovat välimuistissa', missing.length === 0 && shell.length > 25, `puuttuu: ${missing.join(', ')}`);
    check('vain yksi versiokohtainen englanti-välimuisti (äänivälimuisti on erillinen)', info.keys.filter((k) => /^englanti-[0-9a-f]{10}$/.test(k)).length === 1, info.keys.join(','));
    if (!info.controlled) {
      await page.reload();
      await page.waitForSelector('#view h1');
    }
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#view h1', { timeout: 10000 });
    check('sovellus latautuu ilman verkkoa', (await page.textContent('#view h1')) === 'Tänään');
    await navTo(page, 'vocab');
    check('sanasto toimii ilman verkkoa', /ilmausta/.test(await page.textContent('[role=status]')));
    await navTo(page, 'session/extra');
    await page.waitForSelector('.runner');
    const res = await playRunner(page, { prod: 'type' });
    check('päivän sessio toimii ilman verkkoa', res.end === 'summary', res.end);
    await context.setOffline(false);
    await shot(page, '23-offline-valmis');
  });

  /* ===== 12. Tuore asennus: aikaraja, "Osaan jo", puheen ohjeet, numerot ja äänen johdonmukaisuus ===== */
  const fresh = await launch();
  const fp = fresh.page;
  const runOn = async (pg, name, fn) => {
    try {
      await fn();
    } catch (e) {
      failures++;
      console.log(`FAIL  ${name}: ${e.stack || e}`);
      await shot(pg, `virhe-${name.replace(/\W+/g, '-')}`).catch(() => {});
    }
  };

  await runOn(fp, 'aikarajattu sessio', async () => {
    await fresh.context.clock.setFixedTime(DAY1);
    await go(fp, base);
    // Valekello: jokainen tehtävä "kestää" 30 s, joten 15 minuutin raja nähdään sekunneissa.
    await fp.evaluate(() => {
      window.__fakeT = 0;
      window.__englanti.now = () => window.__fakeT;
    });
    await fp.click('a.btn.primary.big[href="#/session"]');
    await fp.waitForSelector('.runner');
    const TICK = 30000;
    const res = await playRunner(fp, { tick: TICK, known: new Set([0]) });
    const kinds = res.log.map((l) => l.kind);
    const count = (k) => kinds.filter((x) => x === k).length;
    const totalMs = res.log.length * TICK;
    check('aikarajattu sessio päättyy yhteenvetoon', res.end === 'summary', res.end);
    check('tehtävät täyttävät noin 15 minuuttia', totalMs >= 13 * 60000 && totalMs <= 17 * 60000, `${(totalMs / 60000).toFixed(1)} min, ${res.log.length} tehtävää`);
    const summary = await fp.textContent('.summary');
    const learned = Number((summary.match(/Opit uutta\s*(\d+)/) ?? [])[1]);
    check('aikaraja rajaa uuden sisällön (vähintään kaksi ryhmää, alle päivärajan 12)', learned >= 6 && learned < 12, summary);
    check('"Osaan jo" näkyy yhteenvedossa', /Osasit jo\s*1/.test(summary), summary);
    check('yhteenvedon kesto vastaa valekelloa', /Kesto 1[3-7] min/.test(summary), summary);
    const tests = res.log.filter((l) => l.kind === 'choose' || l.kind === 'flip-rec');
    const produce = res.log.filter((l) => l.kind === 'flip-prod');
    check('osaamattomille ilmauksille tehdään testi ja tuottamisharjoitus, "Osaan jo" -ilmaukselle ei', tests.length === learned && produce.length === learned, `testejä ${tests.length}, tuottamisia ${produce.length}, opittu ${learned}`);
    const shadows = count('shadow');
    check('puhetta on loppuajan verran (3–8 lausetta)', shadows >= 3 && shadows <= 8 && kinds.slice(-shadows).every((k) => k === 'shadow'), kinds.slice(-10).join(','));
    const st = await dbState(fp);
    check('"Osaan jo" kirjaa kortin ja yhden tapahtuman', st.cards === learned + 1 && st.reviews === learned + 1, JSON.stringify({ st, learned }));
    const known = await fp.evaluate(async () => (await window.__englanti.db.getAllReviews()).filter((r) => r.mode === 'known').map((r) => ({ id: r.cardId, rating: r.rating })));
    check('"Osaan jo" kirjautuu helpoksi (4)', known.length === 1 && known[0].rating === 4 && known[0].id === 'mail-01', JSON.stringify(known));
    const act = await fp.evaluate(async () => await window.__englanti.db.getKv('activity', {}));
    check('harjoitteluaika kirjautuu valekellon mukaan', Object.values(act).reduce((a, b) => a + b, 0) === totalMs, JSON.stringify({ act, totalMs }));
    await shot(fp, '41-aikarajattu-yhteenveto');
    await fp.click('.summary a.btn.primary');
    await fp.waitForSelector('#view h1');
    const hero = await fp.textContent('.hero');
    check('Tänään kertoo harjoitteluajan', /Harjoittelit tänään 1[3-7] min/.test(hero), hero);
  });

  await runOn(fp, 'puheen ohjeet ja numerot', async () => {
    await fresh.context.clock.setFixedTime(atDay(0, 16));
    await go(fp, base);
    await fp.click('#view h1'); // käyttäjän ele, jotta selain sallii automaattisen äänen
    await fp.evaluate(async () => {
      const { runTasks } = await import(new URL('js/runner.js', document.baseURI).href);
      const ctx = window.__englanti;
      window.__runStats = null;
      runTasks(ctx, document.querySelector('#view'), [{ kind: 'shadow', item: ctx.catalog.byId.get('mail-01') }], { title: 'Puhe' }).then((st) => (window.__runStats = st));
    });
    await fp.waitForSelector('.runner-box .phrase');
    check('puhetehtävä näyttää lauseen numeroin', (await fp.textContent('.runner-box .phrase')) === "I'm writing to follow up on the invoice we sent on October 3.", await fp.textContent('.runner-box .phrase'));
    const text = await fp.textContent('.runner-box');
    check('ohjeissa on kolme vaihetta', (await fp.locator('.runner-box .steps li').count()) === 3);
    check('ohjeissa kerrotaan, että lause sanotaan heti perässä', /sano lause ääneen heti perässä/i.test(text), text);
    check('"Hitaasti"-painike on näkyvissä', (await fp.locator('.runner-box .slow-row .btn.slow').count()) === 1);
    check('mikrofonipainikkeen nimi on "Sano perässä"', /Sano perässä/.test(await fp.textContent('.runner-box .btn.mic')));
    await fp.waitForSelector('.runner-box .btn.mic.your-turn', { timeout: 5000 });
    check('mallin jälkeen kerrotaan oppijan vuoro', /Sinun vuorosi/.test(await fp.textContent('.attempt-status')), await fp.textContent('.attempt-status'));
    await shot(fp, '39-puhe-sinun-vuorosi');
    const sp = await fp.evaluate(() => window.__spoken);
    check('malli luetaan päivämäärä järjestyslukuna', sp.includes("I'm writing to follow up on the invoice we sent on October third."), JSON.stringify(sp));

    // Hitaasti: sama lause, hitaampi nopeus
    await fp.evaluate(() => {
      window.__spoken.length = 0;
      window.__rates.length = 0;
    });
    await fp.click('.runner-box .btn.slow');
    await fp.waitForFunction(() => window.__rates.length >= 1);
    const slow = await fp.evaluate(() => ({ rate: window.__rates[0], text: window.__spoken[0] }));
    check('"Hitaasti" lukee saman lauseen nopeudella 0,7 × asetus', Math.abs(slow.rate - 0.595) < 0.001 && slow.text === "I'm writing to follow up on the invoice we sent on October third.", JSON.stringify(slow));
    await fp.waitForTimeout(200);

    const attempt = async (t, delay = 10) => {
      await fp.evaluate(([x, d]) => {
        window.__asrDelay = d;
        window.__asrQueue.push(x);
      }, [t, delay]);
      await fp.click('.runner-box .btn.mic');
      await fp.waitForSelector('.runner-box .btn.mic.listening');
    };
    const settle = () => fp.waitForFunction(() => window.__asrQueue.length === 0 && !document.querySelector('.runner-box .btn.mic.listening'), null, { timeout: 5000 });
    const pctOf = async () => Number(((await fp.textContent('.runner-box .result-line')).match(/(\d+) %/) ?? [])[1]);

    await attempt("I'm writing to follow up on the invoice we sent on October third", 900);
    const preparing = (await fp.textContent('.runner-box .btn.mic')).trim();
    check('mikrofonin avautuessa kerrotaan odotuksesta (ei vielä "puhu nyt")', /Avataan mikrofonia/.test(preparing), preparing);
    await fp.waitForFunction(() => /Kuuntelen/.test(document.querySelector('.runner-box .btn.mic')?.textContent ?? ''), null, { timeout: 3000 });
    const look = await fp.evaluate(() => {
      const btn = document.querySelector('.runner-box .btn.mic');
      const cs = getComputedStyle(btn);
      const probe = (v) => {
        const e = document.createElement('i');
        e.style.color = v;
        document.body.append(e);
        const c = getComputedStyle(e).color;
        e.remove();
        return c;
      };
      return { label: btn.textContent.trim(), bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color, bad: probe('var(--bad)'), anim: cs.animationName };
    });
    check('kuuntelun tila ei ole punainen', look.bg !== look.bad && look.border !== look.bad && look.color !== look.bad, JSON.stringify(look));
    check('kuuntelun tila sanoo selvästi, että mikrofoni on auki', /Kuuntelen/.test(look.label), look.label);
    check('kuuntelun tilassa on rauhallinen pulssi', look.anim === 'listen-pulse', look.anim);
    await shot(fp, '40-kuuntelu');
    await settle();
    check('"October third" tunnistetaan oikeaksi (100 %)', (await pctOf()) === 100, await fp.textContent('.runner-box .result-line'));

    await attempt("I'm writing to follow up on the invoice we sent on October 3rd");
    await settle();
    check('"October 3rd" tunnistetaan oikeaksi (100 %)', (await pctOf()) === 100, await fp.textContent('.runner-box .result-line'));

    await attempt("I'm writing to follow up on the invoice we sent on October fourth");
    await settle();
    const wrongPct = await pctOf();
    check('väärä päivämäärä ("fourth") ei mene läpi', wrongPct < 100 && (await fp.locator('.runner-box .words .w.wrong').count()) >= 1, `täsmäys ${wrongPct} %`);
    await shot(fp, '42-puhe-numero-vaarin');

    await fp.click('.runner-box .actions .btn.primary');
    await fp.waitForFunction(() => window.__runStats !== null);
    const stats = await fp.evaluate(() => window.__runStats);
    check('paras yritys kirjautuu tulokseksi (100 %)', JSON.stringify(stats.speak) === '[100]' && stats.ended === 'complete', JSON.stringify(stats));
  });

  await runOn(fp, 'äänen johdonmukaisuus', async () => {
    await fp.evaluate(async () => {
      window.__spoken.length = 0;
      window.__rates.length = 0;
      const { runTasks } = await import(new URL('js/runner.js', document.baseURI).href);
      const ctx = window.__englanti;
      runTasks(ctx, document.querySelector('#view'), [{ kind: 'teach', item: ctx.catalog.byId.get('mail-01'), cta: 'Testaa itsesi' }], { title: 'Uutta' });
    });
    await fp.waitForSelector('.runner-box .phrase-row');
    await fp.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
    await fp.waitForTimeout(200);
    const phrase = "I'm writing to follow up on";
    const example = "I'm writing to follow up on the invoice we sent on October third.";
    const auto = await fp.evaluate(() => [...window.__spoken]);
    check('automaattinen toisto: ilmaus ja sen jälkeen esimerkkilause', auto.length === 2 && auto[0] === phrase && auto[1] === example, JSON.stringify(auto));
    check('opetus näyttää "Testaa itsesi" -painikkeen', /Testaa itsesi/.test(await fp.textContent('.runner-box .actions')));

    await fp.evaluate(() => (window.__spoken.length = 0));
    await fp.click('.runner-box .phrase-row .icon-btn.speak');
    await fp.waitForFunction(() => window.__spoken.length >= 1);
    check('ilmauksen kaiutin lukee vain ilmauksen', (await fp.evaluate(() => window.__spoken[0])) === phrase, await fp.evaluate(() => window.__spoken[0]));
    await fp.waitForTimeout(200);

    await fp.evaluate(() => (window.__spoken.length = 0));
    await fp.click('.runner-box .example .icon-btn.speak');
    await fp.waitForFunction(() => window.__spoken.length >= 1);
    check('esimerkin kaiutin lukee vain esimerkkilauseen', (await fp.evaluate(() => window.__spoken[0])) === example, await fp.evaluate(() => window.__spoken[0]));
    await fp.waitForTimeout(200);

    await fp.evaluate(() => {
      window.__spoken.length = 0;
      window.__rates.length = 0;
    });
    await fp.click('.runner-box .example .btn.slow');
    await fp.waitForFunction(() => window.__rates.length >= 1);
    const slow = await fp.evaluate(() => ({ rate: window.__rates[0], text: window.__spoken[0] }));
    check('esimerkin "Hitaasti" lukee saman lauseen hitaammin', slow.text === example && Math.abs(slow.rate - 0.595) < 0.001, JSON.stringify(slow));
  });

  /* ===== 13. Kokoro-äänet: esiäänitetyt leikkeet (testiäänillä, sama putki kuin tuotannossa) ===== */
  const { spawnSync } = require('child_process');
  const os = require('os');
  const repoRoot = path.join(__dirname, '..', '..');
  const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', cwd: repoRoot });
  const toolsOk = sh('python3', ['-c', 'import numpy']).status === 0 && sh('ffmpeg', ['-version']).status === 0;
  let kokoroProblems = [];
  if (!toolsOk) {
    console.log('OHITETTU  Kokoro-testit: python3, numpy tai ffmpeg puuttuu');
  } else {
    // Testiäänet tehdään generate.py:n --fake-tilalla ja säilytetään ajojen välillä (generointi on inkrementaalinen).
    const audioDir = process.env.E2E_AUDIO_DIR || path.join(os.tmpdir(), 'e2e-fake-audio');
    fs.mkdirSync(audioDir, { recursive: true });
    const textsFile = path.join(os.tmpdir(), 'e2e-texts.json');
    fs.writeFileSync(textsFile, sh('node', ['tools/tts/texts.mjs']).stdout);
    const gen = sh('python3', ['tools/tts/generate.py', '--texts', textsFile, '--out', audioDir, '--fake']);
    check('testiäänten generointi (generate.py --fake) onnistuu', gen.status === 0, (gen.stdout + gen.stderr).slice(-300));
    // Sivuston kopio, jossa audio/ on testiäänillä: manifesti ja tiedostot ovat samoissa poluissa kuin tuotannossa.
    const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
    fs.cpSync(repoRoot, siteDir, {
      recursive: true,
      filter: (src) => !/^(\.git|node_modules|tests|tools|audio)(\/|$)/.test(path.relative(repoRoot, src).split(path.sep).join('/')),
    });
    fs.cpSync(audioDir, path.join(siteDir, 'audio'), { recursive: true });
    const srv2 = await serve(siteDir);
    const base2 = srv2.base;
    const manifest = JSON.parse(fs.readFileSync(path.join(siteDir, 'audio', 'manifest.json'), 'utf8'));
    const clipCount = new Set([...Object.values(manifest.normal), ...Object.values(manifest.slow)]).size;
    const PHRASE = "I'm writing to follow up on";
    const EXAMPLE = "I'm writing to follow up on the invoice we sent on October third.";
    const TESTLINE = 'Could you possibly send me the updated report by noon?';

    const k = await launch({ audioSpy: true });
    const kp = k.page;
    const showTeach = (pg) =>
      pg.evaluate(async () => {
        const { runTasks } = await import(new URL('js/runner.js', document.baseURI).href);
        const ctx = window.__englanti;
        runTasks(ctx, document.querySelector('#view'), [{ kind: 'teach', item: ctx.catalog.byId.get('mail-01'), cta: 'Testaa itsesi' }], { title: 'Uutta' });
      });
    const stats = (pg) => pg.evaluate(() => window.__englanti.clipStats());
    const waitPlayed = (pg, n) => pg.waitForFunction((n) => window.__englanti.clipStats().played.length >= n, n, { timeout: 8000 });
    const idle = (pg) => pg.waitForFunction(() => window.__audios.every((a) => a.paused || a.ended), null, { timeout: 8000 });
    const nSpoken = (pg) => pg.evaluate(() => window.__spoken.length);

    await runOn(kp, 'kokoro: asetukset ja testiääni', async () => {
      await go(kp, base2, 'settings');
      await kp.waitForFunction(() => /äänitettä/.test(document.querySelector('#s-clip-info')?.textContent ?? ''), null, { timeout: 8000 });
      const info = await kp.textContent('#s-clip-info');
      check('asetuksissa näkyy Kokoro-äänten määrä, ääni ja lataustilanne', info.includes(`${clipCount} äänitettä`) && info.includes('af_heart') && info.includes(`ladattu 0 / ${clipCount}`) && /Käytössä\./.test(info), info);
      const opts = await kp.$$eval('#s-voice option', (os) => os.map((o) => o.value));
      check('äänivalinnassa on automaattinen ja laitteen oma ääni', opts[0] === '' && opts[1] === 'device', JSON.stringify(opts));
      check('lataa-painike on käytössä, kun leikkeitä on ladattavana', await kp.isEnabled('#s-clip-load'));
      await kp.click('.range-row .icon-btn.speak');
      await waitPlayed(kp, 1);
      const st = await stats(kp);
      check('"Testaa ääni" toistaa Kokoro-leikkeen eikä käytä laitteen ääntä', st.played[0] === manifest.normal[TESTLINE] && (await nSpoken(kp)) === 0, JSON.stringify(st.played));
      await idle(kp);
    });

    await runOn(kp, 'kokoro: opetus, hidas toisto, nopeus ja pysäytys', async () => {
      await go(kp, base2);
      await kp.click('#view h1');
      const before = (await stats(kp)).played.length;
      await showTeach(kp);
      await kp.waitForSelector('.runner-box .phrase-row');
      await waitPlayed(kp, before + 2);
      let st = await stats(kp);
      const ids = st.played.slice(before, before + 2);
      check('automaattinen toisto: ilmaus ja esimerkkilause leikkeinä tässä järjestyksessä', ids[0] === manifest.normal[PHRASE] && ids[1] === manifest.normal[EXAMPLE], JSON.stringify(ids));
      check('leikkeitä käytettäessä laitteen ääntä ei käytetä', (await nSpoken(kp)) === 0);
      const rates = await kp.evaluate(() => window.__audios.slice(-2).map((a) => a.playbackRate));
      check('oletusnopeudella leikkeet toistetaan omalla nopeudellaan', rates.length === 2 && rates.every((r) => Math.abs(r - 1) < 0.001), JSON.stringify(rates));
      await idle(kp);
      await kp.click('.runner-box .example .btn.slow');
      await waitPlayed(kp, before + 3);
      st = await stats(kp);
      check('"Hitaasti" toistaa erikseen generoidun hitaan leikkeen', st.played[before + 2] === manifest.slow[EXAMPLE] && manifest.slow[EXAMPLE] !== manifest.normal[EXAMPLE], st.played[before + 2]);
      const slowRate = await kp.evaluate(() => window.__audios.at(-1).playbackRate);
      check('hidas leike toistetaan sellaisenaan (se on jo hidas)', Math.abs(slowRate - 1) < 0.001, String(slowRate));
      await idle(kp);
      await kp.evaluate(() => window.__englanti.saveSettings({ rate: 1.0 }));
      await kp.click('.runner-box .phrase-row .icon-btn.speak');
      await waitPlayed(kp, before + 4);
      const fast = await kp.evaluate(() => window.__audios.at(-1).playbackRate);
      check('puhenopeus-asetus skaalaa toistoa (1,0 / 0,85)', Math.abs(fast - 1 / 0.85) < 0.01, String(fast));
      await kp.evaluate(() => window.__englanti.saveSettings({ rate: 0.85 }));
      await idle(kp);
      await kp.click('.runner-box .example .icon-btn.speak');
      await waitPlayed(kp, before + 5);
      check('leike soi, kun sitä pysäytetään', await kp.evaluate(() => window.__audios.at(-1).paused === false));
      await kp.click('.runner-box .actions .btn.primary');
      check('tehtävän päättäminen pysäyttää leikkeen', await kp.evaluate(() => window.__audios.every((a) => a.paused || a.ended)));
      check('mikään luettu teksti ei puuttunut leikkeistä', (await stats(kp)).missing.length === 0, (await stats(kp)).missing.join(' | '));
    });

    await runOn(kp, 'kokoro: laitteen oma ääni valittavissa', async () => {
      await go(kp, base2);
      await kp.click('#view h1');
      await kp.evaluate(async () => {
        await window.__englanti.saveSettings({ voiceURI: 'device' });
        window.__spoken.length = 0;
      });
      await showTeach(kp);
      await kp.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
      const spoken = await kp.evaluate(() => [...window.__spoken]);
      check('valittu laitteen ääni lukee ilmauksen ja esimerkin (ei leikkeitä)', spoken[0] === PHRASE && spoken[1] === EXAMPLE && (await stats(kp)).played.length === 0, JSON.stringify(spoken));
      await kp.evaluate(() => window.__englanti.saveSettings({ voiceURI: '' }));
    });

    await runOn(kp, 'kokoro: koko sessio', async () => {
      await go(kp, base2);
      await kp.evaluate(() => (window.__spoken.length = 0));
      await kp.click('a.btn.primary.big[href="#/session"]');
      await kp.waitForSelector('.runner');
      const res = await playRunner(kp, { prod: 'type' });
      const st = await stats(kp);
      const kinds = new Set(res.log.map((l) => l.kind));
      check('sessio pelataan loppuun Kokoro-äänillä', res.end === 'summary' && kinds.has('teach') && kinds.has('shadow'), `${res.end} ${[...kinds]}`);
      check('sessiossa soi leikkeitä', st.played.length >= 10, String(st.played.length));
      check('sessiossa ei puuttunut yhtään leikettä (kaikki luettavat tekstit on esiäänitetty)', st.missing.length === 0, st.missing.join(' | '));
      check('sessiossa ei tarvittu laitteen ääntä eikä leikkeiden haku epäonnistunut', (await nSpoken(kp)) === 0 && st.failed === 0, `spoken ${await nSpoken(kp)}, failed ${st.failed}`);
    });

    await runOn(kp, 'kokoro: lataus offline-käyttöön', async () => {
      await go(kp, base2, 'settings');
      await kp.evaluate(async () => (await navigator.serviceWorker.ready, true));
      await kp.waitForFunction(() => /äänitettä/.test(document.querySelector('#s-clip-info')?.textContent ?? ''), null, { timeout: 8000 });
      await kp.click('#s-clip-load');
      await kp.waitForFunction((n) => new RegExp(`ladattu ${n} / ${n}`).test(document.querySelector('#s-clip-info')?.textContent ?? ''), clipCount, { timeout: 60000 });
      check('lataus tallentaa kaikki leikkeet laitteelle', true);
      check('lataa-painike poistuu käytöstä, kun kaikki on ladattu', await kp.isDisabled('#s-clip-load'));
      const cached = await kp.evaluate(async () => {
        const c = await caches.open('englanti-audio-v1');
        const urls = (await c.keys()).map((r) => new URL(r.url).pathname);
        return { ogg: urls.filter((u) => u.endsWith('.ogg')).length, manifest: urls.some((u) => u.endsWith('/audio/manifest.json')), keys: await caches.keys() };
      });
      check('äänivälimuistissa on kaikki leikkeet ja manifesti', cached.ogg === clipCount && cached.manifest, JSON.stringify(cached));
      check('äänet ovat omassa välimuistissaan, erillään sovelluskuoresta', cached.keys.includes('englanti-audio-v1') && cached.keys.filter((x) => /^englanti-[0-9a-f]{10}$/.test(x)).length === 1, cached.keys.join(','));
      const controlled = await kp.evaluate(() => Boolean(navigator.serviceWorker.controller));
      if (!controlled) {
        await kp.reload();
        await kp.waitForSelector('#view h1');
      }
      await k.context.setOffline(true);
      await kp.reload();
      await kp.waitForSelector('#view h1', { timeout: 10000 });
      await kp.click('#view h1');
      await showTeach(kp);
      await kp.waitForSelector('.runner-box .phrase-row');
      await waitPlayed(kp, 2);
      const st = await stats(kp);
      check('ilman verkkoa ladatut Kokoro-äänet soivat', st.played[0] === manifest.normal[PHRASE] && st.played[1] === manifest.normal[EXAMPLE] && (await nSpoken(kp)) === 0, JSON.stringify(st));
      await idle(kp);
      await k.context.setOffline(false);
    });
    check('Kokoro-testeissä ei konsolivirheitä eikä epäonnistuneita pyyntöjä', k.problems.length === 0, k.problems.join(' | '));

    // Varakäyttäytyminen: ilman service workeria reitit voivat muuttaa manifestia ja pudottaa yksittäisiä leikkeitä.
    const k2 = await launch({ serviceWorkers: 'block', audioSpy: true });
    const kp2 = k2.page;
    await runOn(kp2, 'kokoro: puuttuva leike → laitteen ääni', async () => {
      await kp2.route('**/audio/manifest.json', (route) => {
        const m = JSON.parse(JSON.stringify(manifest));
        delete m.normal[EXAMPLE];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m) });
      });
      await go(kp2, base2);
      await kp2.click('#view h1');
      await showTeach(kp2);
      await kp2.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
      const spoken = await kp2.evaluate(() => [...window.__spoken]);
      const st = await stats(kp2);
      check('jos esimerkin leike puuttuu, koko jono luetaan laitteen äänellä', spoken[0] === PHRASE && spoken[1] === EXAMPLE && st.played.length === 0, JSON.stringify(spoken));
      check('puuttuva teksti kirjataan', st.missing.includes(EXAMPLE), JSON.stringify(st.missing));
      await kp2.unroute('**/audio/manifest.json');
    });
    await runOn(kp2, 'kokoro: leikkeen haku epäonnistuu → laitteen ääni', async () => {
      const bad = new RegExp(`/audio/${manifest.normal[PHRASE]}\\.ogg$`);
      await kp2.route(bad, (route) => route.abort());
      await go(kp2, base2);
      await kp2.click('#view h1');
      await showTeach(kp2);
      await kp2.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
      const spoken = await kp2.evaluate(() => [...window.__spoken]);
      const st = await stats(kp2);
      check('jos leikettä ei saada ladattua, teksti luetaan laitteen äänellä', spoken[0] === PHRASE && spoken[1] === EXAMPLE && st.failed >= 1, JSON.stringify({ spoken, failed: st.failed }));
      await kp2.unroute(bad);
    });
    await runOn(kp2, 'kokoro: manifestia ei saada → laitteen ääni', async () => {
      await kp2.route('**/audio/manifest.json', (route) => route.fulfill({ status: 404, body: 'ei löydy' }));
      await go(kp2, base2);
      await kp2.click('#view h1');
      await showTeach(kp2);
      await kp2.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
      check('ilman manifestia kaikki luetaan laitteen äänellä', (await nSpoken(kp2)) >= 2 && (await stats(kp2)).played.length === 0);
      await navTo(kp2, 'settings');
      await kp2.waitForFunction(() => /ei ole vielä saatavilla/.test(document.querySelector('#s-clip-info')?.textContent ?? ''), null, { timeout: 8000 });
      check('asetukset kertovat, ettei Kokoro-ääniä ole saatavilla', await kp2.isDisabled('#s-clip-load'));
      await kp2.unroute('**/audio/manifest.json');
    });
    kokoroProblems = [];
    await k2.browser.close();
    await k.browser.close();
    await srv2.close();
    fs.rmSync(siteDir, { recursive: true, force: true });
  }

  const allProblems = [...problems, ...fresh.problems];
  console.log('\nKonsoli- ja verkkovirheet:', allProblems.length ? '\n  ' + [...new Set(allProblems)].join('\n  ') : 'ei yhtään');
  check('ei konsolivirheitä, CSP-rikkomuksia tai epäonnistuneita pyyntöjä', allProblems.length === 0, allProblems.join(' | '));
  await fresh.browser.close();
  await browser.close();
  await srv.close();
  console.log(failures ? `\n${failures} epäonnistui` : '\nKaikki selaintestit läpi');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('KAATUI', e);
  process.exit(2);
});
