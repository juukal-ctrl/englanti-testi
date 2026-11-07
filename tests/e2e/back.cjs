// Älykäs takaisin-painike: oikea Chromium kulkee näkymiä ja painaa selaimen takaisin-painiketta (page.goBack on sama kuin
// Androidin takaisin-ele). Varmistaa, että historia pysyy matalana: välilehden vaihto ei lisää merkintää, "Takaisin" ja
// "Valmis" palaavat ylempään näkymään, ja takaisin ei kulje kaikkien aiempien näkymien läpi.
//
// Ajo erikseen: NODE_PATH=/usr/local/lib/node_modules_global node tests/e2e/back.cjs
// app.cjs ajaa saman osion osana kokonaisajoa.

const path = require('path');
const { serve, launch } = require('./harness.cjs');

async function runBackTests({ base, check }) {
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      check(`takaisin: ${name} keskeytyi poikeukseen: ${String(e.message ?? e).split('\n')[0]}`, false, e.stack || String(e));
    }
  };

  // Sovelluksen ensimmäinen merkintä on osoite ilman risuaitaa, ja se on Tänään-näkymä.
  const hash = (page) => page.evaluate(() => location.hash || '#/today');
  const stack = (page) => page.evaluate(() => history.state?.stack ?? null);
  const left = (page) => page.url().startsWith('about:');
  const settle = (page) => page.waitForTimeout(300);
  const waitHash = async (page, h) => {
    await page.waitForFunction((want) => location.hash === want, h, { timeout: 5000 });
    await page.waitForSelector('#view h1, #view .runner, #view .summary');
    await settle(page);
  };
  const open = async (page, hashPart = '') => {
    await page.goto('about:blank');
    await page.goto(base + hashPart, { waitUntil: 'load' });
    await page.waitForSelector('#view h1');
  };
  /** Painaa selaimen takaisin-painiketta. Palauttaa osoitteen tai 'ulos', jos sovelluksesta poistuttiin. */
  const back = async (page) => {
    await page.goBack();
    await settle(page);
    return left(page) ? 'ulos' : hash(page);
  };
  const click = async (page, sel) => {
    await page.click(sel);
    await settle(page);
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* ===== 1. Käyttäjän ilmoittama tapaus: välilehdet ja Takaisin-linkki ===== */
  await step('välilehdet ja Takaisin-linkki', async () => {
    const { browser, page, problems } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      const lens = [];
      for (const sel of ['#nav a[data-nav=review]', '#nav a[data-nav=lessons]', '#nav a[data-nav=speak]', '#nav a[data-nav=more]']) {
        await click(page, sel);
        lens.push(await page.evaluate(() => history.length));
      }
      check('välilehden vaihto ei kasvata historiaa (Kertaus, Oppitunti, Puhu, Lisää)', new Set(lens.slice(1)).size === 1 && lens[0] === lens[1], JSON.stringify(lens));
      check('pino on Tänään + nykyinen välilehti', same(await stack(page), ['#/today', '#/more']), JSON.stringify(await stack(page)));
      await click(page, '#nav a[data-nav=today]');
      check('Tänään-välilehti palaa olemassa olevaan merkintään: pino on vain Tänään', same(await stack(page), ['#/today']) && (await hash(page)) === '#/today', JSON.stringify(await stack(page)));
      await click(page, '#shadow-open');
      check('shadowing avautuu Tänään-näkymän päälle', (await hash(page)) === '#/shadow' && same(await stack(page), ['#/today', '#/shadow']), JSON.stringify(await stack(page)));
      await click(page, '#view a.back');
      check('"‹ Takaisin" palaa Tänään-näkymään', (await hash(page)) === '#/today', await hash(page));
      check('"‹ Takaisin" ei jätä shadowing-näkymää historiaan: pino on vain Tänään', same(await stack(page), ['#/today']), JSON.stringify(await stack(page)));
      check('järjestelmän takaisin poistuu sovelluksesta heti (ennen: yhdeksän painallusta)', (await back(page)) === 'ulos');
      check('ei konsolivirheitä: välilehdet ja Takaisin', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });

  /* ===== 2. Välilehdeltä takaisin palaa Tänään-näkymään, sitten poistutaan ===== */
  await step('välilehdeltä takaisin Tänään-näkymään', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await page.click('#extras > summary');
      await click(page, '#view a.tile[href="#/review"]');
      check('Tänään-näkymän ruutu avaa Kertauksen', (await hash(page)) === '#/review');
      await click(page, '#nav a[data-nav=lessons]');
      await click(page, '#nav a[data-nav=speak]');
      check('välilehdet vaihtuvat: Puhu', (await hash(page)) === '#/speak' && (await page.textContent('#view h1')) === 'Puhu');
      check('takaisin Puhu-välilehdeltä palaa Tänään-näkymään (ei Oppituntiin tai Kertaukseen)', (await back(page)) === '#/today');
      check('Tänään-näkymä piirtyy takaisin-painalluksen jälkeen', (await page.textContent('#view h1')) === 'Tänään');
      check('alavalikossa Tänään on valittuna', (await page.getAttribute('#nav a[data-nav=today]', 'aria-current')) === 'page');
      check('toinen takaisin poistuu sovelluksesta', (await back(page)) === 'ulos');
    } finally {
      await browser.close();
    }
  });

  /* ===== 3. Alisivut: Lisää > Asetukset > asetusten alisivu ===== */
  await step('alisivut palaavat ylempään näkymään', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await click(page, '#nav a[data-nav=more]');
      await click(page, '#view a[href="#/settings"]');
      check('Asetukset avautuu Lisää-näkymän päälle', same(await stack(page), ['#/today', '#/more', '#/settings']), JSON.stringify(await stack(page)));
      await page.evaluate(() => window.__englanti.nav('settings/ai'));
      await waitHash(page, '#/settings/ai');
      check('asetusten alisivu on neljäs taso', same(await stack(page), ['#/today', '#/more', '#/settings', '#/settings/ai']), JSON.stringify(await stack(page)));
      check('takaisin: alisivulta Asetuksiin', (await back(page)) === '#/settings');
      check('takaisin: Asetuksista Lisää-näkymään', (await back(page)) === '#/more');
      check('takaisin: Lisää-näkymästä Tänään-näkymään', (await back(page)) === '#/today');
      check('takaisin: Tänään-näkymästä ulos', (await back(page)) === 'ulos');
    } finally {
      await browser.close();
    }
  });

  /* ===== 4. Alavalikon välilehti alisivulta ===== */
  await step('alavalikon välilehti alisivulta', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await click(page, '#nav a[data-nav=more]');
      await click(page, '#view a[href="#/vocab"]');
      check('Sanasto avautuu', (await hash(page)) === '#/vocab');
      await click(page, '#nav a[data-nav=review]');
      check('Kertaus-välilehti avautuu sanastosta', (await hash(page)) === '#/review');
      check('pino on Tänään + Kertaus (sanasto ja Lisää eivät jää historiaan)', same(await stack(page), ['#/today', '#/review']), JSON.stringify(await stack(page)));
      check('takaisin Kertauksesta palaa Tänään-näkymään', (await back(page)) === '#/today');
      await click(page, '#nav a[data-nav=more]');
      await click(page, '#view a[href="#/install"]');
      await click(page, '#view a[href="#/settings"]');
      check('Asennus-sivun linkki Asetuksiin korvaa Asennus-sivun', same(await stack(page), ['#/today', '#/more', '#/settings']), JSON.stringify(await stack(page)));
      await click(page, '#nav a[data-nav=more]');
      check('Lisää-välilehti alisivulta palaa Lisää-näkymään', same(await stack(page), ['#/today', '#/more']) && (await hash(page)) === '#/more', JSON.stringify(await stack(page)));
    } finally {
      await browser.close();
    }
  });

  /* ===== 5. Päivän sessio: lopetus ei jätä sessiota historiaan ===== */
  await step('päivän sessio', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await click(page, '#view a.btn.primary.big[href="#/session"]');
      await page.waitForSelector('.runner');
      check('sessio avautuu Tänään-näkymän päälle', same(await stack(page), ['#/today', '#/session']), JSON.stringify(await stack(page)));
      // Järjestelmän takaisin kesken session palaa Tänään-näkymään.
      check('takaisin kesken session palaa Tänään-näkymään', (await back(page)) === '#/today');
      check('Tänään-näkymä piirtyy eikä sessio jää käyntiin', (await page.textContent('#view h1')) === 'Tänään' && !(await page.$('.runner')));
      await click(page, '#view a.btn.primary.big[href="#/session"]');
      await page.waitForSelector('.runner');
      await page.click('.runner-head .icon-btn');
      await page.waitForSelector('dialog[open]');
      await page.click('dialog[open] .btn.primary'); // Lopeta
      await waitHash(page, '#/today');
      check('✕ palaa Tänään-näkymään ja pino on vain Tänään', same(await stack(page), ['#/today']), JSON.stringify(await stack(page)));
      check('✕:n jälkeen takaisin poistuu sovelluksesta eikä palaa sessioon', (await back(page)) === 'ulos');
    } finally {
      await browser.close();
    }
  });

  /* ===== 6. Oppitunti ja sen lopetus ===== */
  await step('oppitunti', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await click(page, '#nav a[data-nav=lessons]');
      await page.click('#view details > summary');
      await page.waitForSelector('#view a[href^="#/lesson/"]');
      await click(page, '#view a[href^="#/lesson/"]');
      await page.waitForSelector('.runner');
      check('oppitunti avautuu Oppitunti-välilehden päälle', same((await stack(page)).map((s) => s.split('/')[1]), ['today', 'lessons', 'lesson']), JSON.stringify(await stack(page)));
      await page.click('.runner-head .icon-btn');
      await page.waitForSelector('dialog[open]');
      await page.click('dialog[open] .btn.primary');
      await waitHash(page, '#/lessons');
      check('✕ palaa aihelistaan ja oppitunti poistuu historiasta', same(await stack(page), ['#/today', '#/lessons']), JSON.stringify(await stack(page)));
      check('takaisin aihelistasta palaa Tänään-näkymään', (await back(page)) === '#/today');
    } finally {
      await browser.close();
    }
  });

  /* ===== 7. Kirjoitustehtävät ===== */
  await step('kirjoitustehtävät', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await page.click('#extras > summary');
      await click(page, '#view a.tile[href="#/write"]');
      await click(page, '#view a.tile[href^="#/write/"]');
      check('tehtävä avautuu listan päälle', same((await stack(page)).map((s) => s.split('/')[1]), ['today', 'write', 'write']) && (await hash(page)).startsWith('#/write/'), JSON.stringify(await stack(page)));
      await click(page, '#view a.back');
      check('"‹ Kaikki tehtävät" palaa listaan', (await hash(page)) === '#/write' && same(await stack(page), ['#/today', '#/write']), JSON.stringify(await stack(page)));
      check('takaisin listasta palaa Tänään-näkymään', (await back(page)) === '#/today');
      check('takaisin Tänään-näkymästä poistuu', (await back(page)) === 'ulos');
    } finally {
      await browser.close();
    }
  });

  /* ===== 8. Sivun uudelleenlataus ja suora osoite ===== */
  await step('uudelleenlataus ja suora osoite', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await click(page, '#nav a[data-nav=more]');
      await click(page, '#view a[href="#/settings"]');
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#view h1');
      check('uudelleenlataus säilyttää reittipinon', same(await stack(page), ['#/today', '#/more', '#/settings']), JSON.stringify(await stack(page)));
      check('takaisin uudelleenlatauksen jälkeen: Asetuksista Lisää-näkymään', (await back(page)) === '#/more');
      check('ja Tänään-näkymään', (await back(page)) === '#/today');

      await open(page, '#/settings'); // sovellus avattu suoraan alisivulle
      check('suoraan avatun sivun pinossa on vain se itse', same(await stack(page), ['#/settings']), JSON.stringify(await stack(page)));
      await click(page, '#nav a[data-nav=today]');
      check('Tänään-välilehti korvaa suoraan avatun sivun', (await hash(page)) === '#/today' && same(await stack(page), ['#/today']), JSON.stringify(await stack(page)));
      check('eikä takaisin palaa asetuksiin vaan poistuu', (await back(page)) === 'ulos');
    } finally {
      await browser.close();
    }
  });

  /* ===== 9. Tuplanapautus ja sama näkymä uudelleen ===== */
  await step('tuplanapautus ja sama näkymä', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await click(page, '#shadow-open');
      await page.dblclick('#view a.back');
      await settle(page);
      check('tuplanapautus "Takaisin"-linkkiin ei vie kahta askelta taaksepäin', !left(page) && (await hash(page)) === '#/today', page.url());
      const len = await page.evaluate(() => history.length);
      await click(page, '#nav a[data-nav=today]');
      await click(page, '#nav a[data-nav=today]');
      check('Tänään-välilehden painaminen Tänään-näkymässä ei lisää historiaa', (await page.evaluate(() => history.length)) === len);
      check('näkymä piirtyy silti', (await page.textContent('#view h1')) === 'Tänään');
    } finally {
      await browser.close();
    }
  });

  /* ===== 10. Eteenpäin ja käsin kirjoitettu osoite ===== */
  await step('eteenpäin ja käsin vaihdettu osoite', async () => {
    const { browser, page } = await launch({ serviceWorkers: 'block' });
    try {
      await open(page);
      await click(page, '#nav a[data-nav=more]');
      await back(page);
      await page.goForward();
      await settle(page);
      check('eteenpäin palauttaa Lisää-näkymän', (await hash(page)) === '#/more' && (await page.textContent('#view h1')) === 'Lisää', await hash(page));
      check('pino säilyy eteenpäin-siirtymässä', same(await stack(page), ['#/today', '#/more']), JSON.stringify(await stack(page)));

      await open(page);
      await page.evaluate(() => (location.hash = '#/review')); // osoite vaihdetaan käsin, ei sovelluksen linkillä
      await waitHash(page, '#/review');
      check('käsin vaihdettu osoite piirtää näkymän', (await page.textContent('#view h1')).length > 0 && (await page.getAttribute('#nav a[data-nav=review]', 'aria-current')) === 'page');
      check('käsin vaihdetun osoitteen pino päätellään', same(await stack(page), ['#/today', '#/review']), JSON.stringify(await stack(page)));
      check('takaisin käsin vaihdetusta osoitteesta palaa Tänään-näkymään', (await back(page)) === '#/today');
      check('Tänään-näkymä piirtyy vain kerran takaisin-painalluksen jälkeen', (await page.$$eval('#view h1', (els) => els.length)) === 1);
    } finally {
      await browser.close();
    }
  });
}

module.exports = { runBackTests };

if (require.main === module) {
  (async () => {
    let failures = 0;
    const check = (name, ok, detail = '') => {
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
    };
    const srv = await serve(path.join(__dirname, '..', '..'), { withoutAudio: true });
    try {
      await runBackTests({ base: srv.base, check });
    } finally {
      await srv.close();
    }
    console.log(failures ? `\n${failures} epäonnistui` : '\nTakaisin-osio läpi');
    process.exit(failures ? 1 : 0);
  })().catch((e) => {
    console.error('KAATUI', e);
    process.exit(2);
  });
}
