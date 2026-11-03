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
 *  - grade: arvosana (1–4), jonka itsearvioitaviin tehtäviin antaa (oletus 3)
 *  - prod: 'mic' | 'type' | 'reveal' vastaustapa flip-prod-tehtävissä
 *  - maxSteps: pelattavien tehtävien enimmäismäärä (oletus: kunnes yhteenveto)
 */
async function playRunner(page, policy = {}) {
  const { wrongChoose = new Set(), grade = 3, prod = 'mic', maxSteps = 120, onShown, onRevealed } = policy;
  const log = [];
  let chooseIndex = 0;
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

    if (kind === 'teach') {
      await advance(() => page.click('.runner-box .actions .btn.primary'));
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
  if (maxSteps < 120) return { log, end: null };
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
    await shot(page, '01-tanaan');

    await page.click('a.btn.primary.big[href="#/session"]');
    await page.waitForSelector('.runner');
    const first = await page.evaluate(() => window.__kind());
    check('sessio alkaa uudella ilmauksella (ei erääntyneitä)', first === 'teach', first);
    await shot(page, '02-uusi-ilmaus');
    const taken = new Set();
    const res = await playRunner(page, {
      prod: 'mic',
      onShown: async (kind) => {
        if ((kind === 'choose' || kind === 'shadow') && !taken.has('shown-' + kind)) {
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
    check('sessio päättyy yhteenvetoon', res.end === 'summary', res.end);
    check('6 opetusta, 6 testiä ja 4 puheharjoitusta', kinds.filter((k) => k === 'teach').length === 6 && kinds.filter((k) => k === 'shadow').length === 4 && kinds.filter((k) => k === 'choose' || k === 'flip-rec').length === 6, kinds.join(','));
    check('puheharjoituksissa täsmäys 100 %', res.log.filter((l) => l.kind === 'shadow').every((l) => /100 %/.test(l.result ?? '')), JSON.stringify(res.log.filter((l) => l.kind === 'shadow')));
    const summary = await page.textContent('.summary');
    check('yhteenvedossa opittu 6', /Opit uutta\s*6/.test(summary), summary);
    check('yhteenvedossa puhetäsmäys 100 %', /100 %/.test(summary), summary);
    await noGarbage(page, 'yhteenveto');
    await shot(page, '03-yhteenveto');
    await overflow(page, 'yhteenveto');
    const spoken = await page.evaluate(() => window.__spoken);
    check('uuden ilmauksen ääni toistuu automaattisesti (ilmaukset ja esimerkit)', spoken.includes("I'm writing to follow up on the invoice we sent on October 3.") && spoken.length >= 6, JSON.stringify(spoken.slice(0, 4)));
    const st = await dbState(page);
    check('tietokannassa 6 korttia ja 6 kertaustapahtumaa', st.cards === 6 && st.reviews === 6 && st.learned === 6, JSON.stringify(st));
    await page.click('.summary a.btn.primary');
    await page.waitForSelector('#view h1');
    const heroTitle = await page.textContent('.hero h2');
    check('Tänään kertoo session olevan tehty', /tehty/.test(heroTitle), heroTitle);
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
    check('väärä vastaus tuo tehtävän takaisin jonoon', choose.length >= 7, `testejä ${choose.length}`);
    check('väärän vastauksen palaute näkyy', res.log.some((l) => l.kind === 'choose' && l.correct === false && /Ei aivan/.test(l.verdict)), JSON.stringify(res.log.filter((l) => l.kind === 'choose')));
    const st = await dbState(page);
    check('toinen sessio lisäsi uusia ilmauksia (12 korttia)', st.cards === 12, JSON.stringify(st));
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
    check('kertaushistoria kasvoi', st.reviews > 12, JSON.stringify(st));
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
    check('Opitut-suodatin näyttää 12 ilmausta', /^12 ilmausta/.test(learned), learned);
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
    check('Kuuntele ja toista päättyy yhteenvetoon', res.end === 'summary', res.end);
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
    check('Tänään-näkymän tilanne näyttää opitut', /12 \/ 126/.test(facts), facts);
  });

  /* ===== 8. Asetukset ===== */
  await run('asetukset', async () => {
    await navTo(page, 'settings');
    await noGarbage(page, 'Asetukset');
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
    check('asetukset säilyvät uudelleenlatauksen jälkeen', saved.newPerDay === 9 && saved.textScale === 1.2 && saved.clearText === true && saved.speakMode === 'type', JSON.stringify(saved));
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
    check('varmuuskopiossa kortit, tapahtumat ja asetukset', data.app === 'englanti-testi' && data.cards.length === before.cards && data.reviews.length === before.reviews && data.settings && data.settings.newPerDay === 9, JSON.stringify({ app: data.app, cards: data.cards.length, reviews: data.reviews.length }));
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
    check('tuonti palauttaa asetukset', settings.newPerDay === 9, JSON.stringify(settings));

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
    for (let i = 0; i < 40 && !(shortcuts.choose && shortcuts.flipRec); i++) {
      const kind = await page.evaluate(() => window.__kind());
      if (kind === 'summary' || kind === 'none') break;
      if (kind === 'teach') {
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
      const cache = await caches.open(keys.find((k) => k.startsWith('englanti-')));
      const urls = (await cache.keys()).map((r) => new URL(r.url).pathname);
      return { active: reg.active && reg.active.state, scope: new URL(reg.scope).pathname, keys, urls, controlled: Boolean(navigator.serviceWorker.controller) };
    });
    check('service worker on aktiivinen alipolussa', info.active === 'activated' && info.scope === '/englanti-testi/', JSON.stringify(info).slice(0, 300));
    const swText = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
    const shell = [...swText.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
    const missing = shell.filter((f) => !info.urls.includes('/englanti-testi/' + f));
    check('kaikki sovelluskuoren tiedostot ovat välimuistissa', missing.length === 0 && shell.length > 25, `puuttuu: ${missing.join(', ')}`);
    check('vain yksi englanti-välimuisti', info.keys.filter((k) => k.startsWith('englanti-')).length === 1, info.keys.join(','));
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

  console.log('\nKonsoli- ja verkkovirheet:', problems.length ? '\n  ' + [...new Set(problems)].join('\n  ') : 'ei yhtään');
  check('ei konsolivirheitä, CSP-rikkomuksia tai epäonnistuneita pyyntöjä', problems.length === 0, problems.join(' | '));
  await browser.close();
  await srv.close();
  console.log(failures ? `\n${failures} epäonnistui` : '\nKaikki selaintestit läpi');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('KAATUI', e);
  process.exit(2);
});
