// Shadowing-oppitunti: Tänään-kortti, aloitusnäkymä, koko oppitunti uudella kappaleella (valemikrofonilla), kertauskappale ja
// keskeytys (360 px), nauhoituksen esto, asetukset sekä poistuminen kesken toiston. Laitteen äänen valeet toistavat tekstit
// nopeasti, joten koko oppitunti kestää vain joitakin sekunteja.
//
// Ajo erikseen: NODE_PATH=/usr/local/lib/node_modules_global node tests/e2e/shadow.cjs
// app.cjs ajaa saman osion osana kokonaisajoa. Esiäänitettyjen leikkeiden soitto testataan app.cjs:n Kokoro-osiossa.

const path = require('path');
const fs = require('fs');
const { serve, launch } = require('./harness.cjs');

const GARBAGE = /\bnull\b|\bundefined\b|\bNaN\b|Infinity|\[object|\{\{|\$\{/;
const FINISHED = () => /^(Jatka|Kierros|Valmis)/.test(document.querySelector('#shadow-primary')?.textContent ?? '');

async function runShadowTests({ base, check, out = '/tmp/e2e-out' }) {
  fs.mkdirSync(out, { recursive: true });
  const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      check(`shadowing: ${name} keskeytyi poikkeukseen: ${String(e.message ?? e).split('\n')[0]}`, false, e.stack || String(e));
    }
  };

  const today = (page) => page.evaluate(() => window.__englanti.srs.today());
  const kv = (page, key, fallback) => page.evaluate(([k, d]) => window.__englanti.db.getKv(k, d), [key, fallback]);
  const spokenCount = (page) => page.evaluate(() => window.__spoken.length);
  const spokenAll = (page) => page.evaluate(() => [...window.__spoken]);
  const rates = (page) => page.evaluate(() => [...window.__rates]);
  const primary = (page) => page.textContent('#shadow-primary');
  const waitFinished = (page) => page.waitForFunction(FINISHED, null, { timeout: 20000 });
  const waitIdle = (page) => page.waitForFunction(() => document.querySelector('#shadow-primary')?.textContent === 'Aloita kierros', null, { timeout: 10000 });
  const doPass = async (page) => {
    await page.click('#shadow-primary');
    await waitFinished(page);
  };
  const goNext = (page) => page.click('#shadow-primary');
  const stageTitle = (page) => page.evaluate(() => document.querySelector('.stage-title')?.textContent.replace(/\s+/g, ' ').trim());
  const waitStage = (page, text) => page.waitForFunction((t) => (document.querySelector('.stage-title')?.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(t), text, { timeout: 10000 });
  const overflow = async (page, label) => {
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(`ei vaakavieritystä: shadowing ${label}`, ov.sw <= ov.iw, JSON.stringify(ov));
  };
  const noGarbage = async (page, label) => {
    const text = await page.evaluate(() => document.getElementById('view').innerText);
    check(`ei roskatekstiä: shadowing ${label}`, !GARBAGE.test(text), (text.match(GARBAGE) ?? [''])[0]);
  };
  const stepper = (page) =>
    page.evaluate(() => ({
      line: document.querySelector('.steps-line')?.textContent ?? null,
      steps: [...document.querySelectorAll('.stepper .step')].map((li) => ({ label: li.querySelector('.step-label')?.textContent.replace(/\s+/g, ' ').trim(), cls: li.className.replace('step ', '') })),
    }));
  const visible = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return Boolean(el) && !el.hidden && el.offsetParent !== null; }, sel);
  const lineData = (page, id) =>
    page.evaluate(async (pid) => {
      const { SHADOW_BY_ID } = await import(new URL('data/shadow.js', document.baseURI).href);
      const { speakable } = await import(new URL('js/speakable.js', document.baseURI).href);
      const p = SHADOW_BY_ID.get(pid);
      return { lines: p.lines, spoken: p.lines.map(speakable), fi: p.fi, words: p.words, title: p.title };
    }, id);

  /* ===== 1. Tänään-kortti ja aloitusnäkymä ===== */
  await step('Tänään-kortti ja aloitusnäkymä', async () => {
    const { browser, page, problems } = await launch({ serviceWorkers: 'block' });
    try {
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#shadow-card');
      const heading = await page.textContent('#shadow-h');
      check('Tänään-näkymässä on shadowing-kortti: toinen oppitunti ja kesto', heading === 'Shadowing · 15 min', heading);
      const status = await page.textContent('#shadow-status');
      check('kortti kertoo, että aloitetaan ensimmäisestä kappaleesta ja montako kappaletta on harjoiteltu', /Aloitat ensimmäisestä kappaleesta\. Harjoiteltu 0 \/ 24 kappaletta\./.test(status), status);
      check('kortin painike vie shadowing-näkymään', (await page.getAttribute('#shadow-open', 'href')) === '#/shadow' && (await page.textContent('#shadow-open')) === 'Aloita shadowing');
      const order = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const hero = q('#plan-h').closest('section');
        const sh = q('#shadow-card');
        const extras = q('#extras');
        return Boolean(hero.compareDocumentPosition(sh) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(sh.compareDocumentPosition(extras) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      check('shadowing-kortti on päivän session jälkeen ja lisäharjoitusten edellä', order);
      check('selitys on oletuksena suljettu', (await page.evaluate(() => document.querySelector('#shadow-info').open)) === false);
      await page.click('#shadow-info summary');
      const info = await page.textContent('#shadow-info');
      check('selitys kertoo, mitä shadowing on, ettei se korvaa sessiota ja ettei sovellus arvioi puhetta', /samaan aikaan, korkeintaan sekunnin jäljessä/.test(info) && /eikä korvaa päivän sessiota/.test(info) && /Sovellus ei arvioi puhettasi/.test(info), info);
      await overflow(page, 'Tänään-kortti');
      await noGarbage(page, 'Tänään-kortti');
      await shot(page, '90-shadow-tanaan', { fullPage: true });

      await page.click('#shadow-open');
      await page.waitForSelector('#shadow-start');
      check('aloitusnäkymän otsikko', (await page.textContent('#view h1')) === 'Shadowing');
      const intro = await page.evaluate(() => document.getElementById('view').innerText);
      check('aloitusnäkymä kertoo kestosta, kappaleista ja kuulokkeista', /Toinen oppitunti päivän session lisäksi · noin \d+ min/.test(intro) && /Uusi: Following up on an invoice \(noin \d+ min\)/.test(intro) && /kuulokkeita/.test(intro), intro);
      check('15 minuutin oppitunnilla on 3 uutta kappaletta', (await page.locator('ol.plan li').count()) === 3);
      check('alavalikko on piilossa oppitunnin ajan', (await page.evaluate(() => document.body.dataset.focus)) === '1');
      await overflow(page, 'aloitus');
      await noGarbage(page, 'aloitus');
      await shot(page, '91-shadow-aloitus', { fullPage: true });
      await page.click('a.btn.link.back');
      await page.waitForSelector('#shadow-card');
      check('Takaisin vie Tänään-näkymään', (await page.textContent('#view h1')) === 'Tänään');
      check('ei konsolivirheitä: shadowing-aloitus', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });

  /* ===== 2. Koko oppitunti: uusi kappale, nauhoitus valemikrofonilla ===== */
  await step('koko oppitunti uudella kappaleella', async () => {
    const { browser, page, problems } = await launch({ serviceWorkers: 'block', fakeMic: true, audioSpy: true });
    try {
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#shadow-card');
      await page.evaluate(() => window.__englanti.saveSettings({ shadowMinutes: 5 }));
      const day = await today(page);
      const sh = await lineData(page, 'sh-01');
      await page.evaluate(() => (location.hash = '#/shadow'));
      await page.waitForSelector('#shadow-start');
      const li = await page.locator('ol.plan li').allTextContents();
      check('5 minuutin oppitunnilla on yksi uusi kappale', li.length === 1 && /^Uusi: Following up on an invoice/.test(li[0]), JSON.stringify(li));
      await page.click('#shadow-start');
      await page.waitForSelector('#shadow-primary');

      // --- Kuuntele ---
      check('kappalemittari kertoo kappaleen 1 / 1 ja vaihemittari vaiheen 1 / 7', (await stepper(page)).line === 'Kappale 1 / 1' && (await page.textContent('.runner-count')) === 'Vaihe 1 / 7', JSON.stringify(await stepper(page)));
      const st0 = await stepper(page);
      check('kappalemittarissa on yksi vaihe "Uusi" käynnissä', st0.steps.length === 1 && st0.steps[0].label === 'Uusi' && st0.steps[0].cls === 'current', JSON.stringify(st0));
      check('ensimmäinen vaihe on Kuuntele, teksti piilossa ja nopeus Normaali', (await stageTitle(page)) === 'Kuuntele' && !(await visible(page, '#shadow-lines')) && (await visible(page, '#shadow-hidden')) && (await page.getAttribute('[data-speed=normal]', 'aria-pressed')) === 'true');
      check('yhden kierroksen vaiheessa ei ole kierrospisteitä', !(await visible(page, '.pass-dots')));
      check('painike on "Aloita kierros"', (await primary(page)) === 'Aloita kierros');
      await shot(page, '92-shadow-kuuntele');
      await page.click('#shadow-primary');
      await page.waitForFunction(() => document.querySelector('#shadow-primary').textContent === 'Pysäytä');
      check('toiston aikana nopeuden valinta on lukittu', await page.locator('[data-speed=fast]').isDisabled());
      await waitFinished(page);
      check('ääni luki kappaleen kaikki lauseet järjestyksessä', JSON.stringify(await spokenAll(page)) === JSON.stringify(sh.spoken), JSON.stringify(await spokenAll(page)));
      check('puhenopeus on asetusten oletus 0,85', Math.abs((await rates(page))[0] - 0.85) < 0.001, JSON.stringify(await rates(page)));
      check('kierroksen jälkeen painike kertoo seuraavan vaiheen ja "Kuuntele uudelleen" ilmestyy', (await primary(page)) === 'Jatka: Lue ja ymmärrä' && (await visible(page, '#shadow-again')) && (await page.textContent('#shadow-again')) === 'Kuuntele uudelleen');
      await goNext(page);

      // --- Lue ja ymmärrä ---
      await page.waitForSelector('#shadow-read');
      check('lukuvaihe: Lue ja ymmärrä, vaihe 2 / 7', (await stageTitle(page)) === 'Lue ja ymmärrä' && (await page.textContent('.runner-count')) === 'Vaihe 2 / 7');
      const read = await page.evaluate(() => ({
        en: [...document.querySelectorAll('#shadow-read .line-btn span')].map((e) => e.textContent),
        fi: [...document.querySelectorAll('#shadow-read .fi')].map((e) => e.textContent),
        kw: [...document.querySelectorAll('.kw dt')].map((e) => e.textContent),
        kwFi: [...document.querySelectorAll('.kw dd')].map((e) => e.textContent),
        note: document.querySelector('aside.note')?.textContent ?? '',
        lang: document.querySelector('#shadow-read .line-btn')?.getAttribute('lang'),
      }));
      check('lukuvaiheessa on jokainen lause ja sen suomennos', JSON.stringify(read.en) === JSON.stringify(sh.lines) && JSON.stringify(read.fi) === JSON.stringify(sh.fi), JSON.stringify(read));
      check('lukuvaiheessa on kolme avainsanaa suomennoksineen ja vinkki', JSON.stringify(read.kw) === JSON.stringify(sh.words.map((w) => w[0])) && JSON.stringify(read.kwFi) === JSON.stringify(sh.words.map((w) => w[1])) && /^Vinkki/.test(read.note));
      check('englanninkieliset lauseet on kielimerkitty', read.lang === 'en-US');
      await overflow(page, 'lukuvaihe');
      await noGarbage(page, 'lukuvaihe');
      await shot(page, '93-shadow-lue', { fullPage: true });
      const before = await spokenCount(page);
      await page.click('#shadow-read li:nth-child(2) .line-btn');
      await page.waitForFunction(() => document.querySelector('#shadow-read li:nth-child(2)').classList.contains('now'));
      await page.waitForFunction((n) => window.__spoken.length === n + 1, before);
      check('lauseen napautus lukee vain sen lauseen', (await spokenAll(page))[before] === sh.spoken[1]);
      await page.click('#shadow-listen-all');
      await page.waitForFunction(() => document.querySelector('#shadow-listen-all').textContent === 'Pysäytä');
      await page.waitForFunction(() => document.querySelector('#shadow-listen-all').textContent === 'Kuuntele koko kappale', null, { timeout: 15000 });
      check('"Kuuntele koko kappale" lukee kaikki lauseet ja palaa lepotilaan', JSON.stringify((await spokenAll(page)).slice(before + 1)) === JSON.stringify(sh.spoken));
      await goNext(page);

      // --- Lue mukana (kierros kahdesti: uudelleentoisto) ---
      await waitStage(page, 'Lue mukana');
      check('Lue mukana -vaiheessa teksti näkyy', (await visible(page, '#shadow-lines')) && !(await visible(page, '#shadow-hidden')) && !(await visible(page, '#shadow-peek')));
      check('lauseet on kielimerkitty ja näkyvissä', (await page.locator('#shadow-lines .line[lang="en-US"]').count()) === sh.lines.length);
      await doPass(page);
      const n1 = await spokenCount(page);
      await page.click('#shadow-again');
      await page.waitForFunction(() => document.querySelector('#shadow-primary').textContent === 'Pysäytä');
      await waitFinished(page);
      check('"Toista kierros uudelleen" soittaa kierroksen uudestaan', (await spokenCount(page)) === n1 + sh.lines.length && (await primary(page)) === 'Jatka: Toista tekstin kanssa');
      await goNext(page);

      // --- Toista tekstin kanssa ×3, pysäytys ja lauseen korostus ---
      await waitStage(page, 'Toista tekstin kanssa');
      check('kierrosnumero ja pisteet: 1 / 3', /kierros 1 \/ 3/.test(await stageTitle(page)) && (await page.locator('.pass-dots .dot').count()) === 3 && (await page.locator('.pass-dots .dot.now').count()) === 1 && (await page.locator('.pass-dots .dot.done').count()) === 0);
      check('vaihemittari kertoo vaiheen 4 / 7', (await page.textContent('.runner-count')) === 'Vaihe 4 / 7');
      await page.click('#shadow-primary');
      await page.waitForFunction(() => document.querySelector('#shadow-lines .line.now'), null, { timeout: 5000 });
      const marked = await page.evaluate(() => [...document.querySelectorAll('#shadow-lines .line')].findIndex((e) => e.classList.contains('now')));
      check('äänessä oleva lause korostetaan', marked >= 0 && marked < sh.lines.length, String(marked));
      await shot(page, '94-shadow-toisto');
      const n2 = await spokenCount(page);
      await page.click('#shadow-primary'); // Pysäytä
      await waitIdle(page);
      await page.waitForTimeout(600);
      check('pysäytys keskeyttää kierroksen: kaikkia lauseita ei luettu, "uudelleen" ei näy, korostus poistuu', (await spokenCount(page)) - n2 < sh.lines.length && !(await visible(page, '#shadow-again')) && (await page.locator('#shadow-lines .line.now').count()) === 0);
      await doPass(page);
      check('kierroksen 1 jälkeen seuraava on "Kierros 2 / 3"', (await primary(page)) === 'Kierros 2 / 3');
      await goNext(page);
      await page.waitForFunction(() => /kierros 2 \/ 3/.test(document.querySelector('.stage-title').textContent));
      check('kierrospisteet: 1 valmis, 1 käynnissä', (await page.locator('.pass-dots .dot.done').count()) === 1 && (await page.locator('.pass-dots .dot.now').count()) === 1);
      await doPass(page);
      await goNext(page);
      await page.waitForFunction(() => /kierros 3 \/ 3/.test(document.querySelector('.stage-title').textContent));
      await doPass(page);
      check('viimeisen tekstikierroksen jälkeen painike vie seuraavaan vaiheeseen', (await primary(page)) === 'Jatka: Toista ilman tekstiä');
      await goNext(page);

      // --- Toista ilman tekstiä ×2, nopeus ja tekstin kurkistus ---
      await waitStage(page, 'Toista ilman tekstiä');
      check('ilman tekstiä -vaiheessa teksti on piilossa ja "Näytä teksti" on tarjolla', !(await visible(page, '#shadow-lines')) && (await page.textContent('#shadow-peek')) === 'Näytä teksti');
      await shot(page, '95-shadow-piilotettu');
      await page.click('#shadow-peek');
      check('"Näytä teksti" paljastaa tekstin ja vaihtuu "Piilota teksti" -painikkeeksi', (await visible(page, '#shadow-lines')) && (await page.textContent('#shadow-peek')) === 'Piilota teksti' && (await page.getAttribute('#shadow-peek', 'aria-pressed')) === 'true');
      await page.click('#shadow-peek');
      check('"Piilota teksti" piilottaa sen taas', !(await visible(page, '#shadow-lines')));
      await page.click('[data-speed=fast]');
      check('Nopea on valittu', (await page.getAttribute('[data-speed=fast]', 'aria-pressed')) === 'true' && (await page.getAttribute('[data-speed=normal]', 'aria-pressed')) === 'false');
      await doPass(page);
      const r = await rates(page);
      check('Nopea soittaa asetusnopeutta 1,15 kertaa nopeammin (0,85 → 0,9775)', Math.abs(r.at(-1) - 0.85 * 1.15) < 0.002, JSON.stringify(r.slice(-3)));
      await goNext(page);
      await page.waitForFunction(() => /kierros 2 \/ 2/.test(document.querySelector('.stage-title').textContent));
      check('nopeuden valinta säilyy kappaleen seuraavilla kierroksilla', (await page.getAttribute('[data-speed=fast]', 'aria-pressed')) === 'true');
      await page.click('[data-speed=slow]');
      await doPass(page);
      check('Hidas soittaa asetusnopeutta 0,8 kertaa (0,85 → 0,68)', Math.abs((await rates(page)).at(-1) - 0.85 * 0.8) < 0.002, JSON.stringify((await rates(page)).slice(-2)));
      check('viimeisen kierroksen jälkeen painike vie nauhoitukseen', (await primary(page)) === 'Jatka: Nauhoita ja vertaa');
      await goNext(page);

      // --- Nauhoita ja vertaa (valemikrofoni) ---
      await page.waitForSelector('#shadow-rec-start');
      check('nauhoitusvaihe: selitys, että nauhoitus pysyy vain muistissa, ja ohitus', /vain muistissa eikä lähde laitteelta/.test(await page.textContent('.rec-body')) && (await visible(page, '#shadow-rec-skip')));
      await overflow(page, 'nauhoitus');
      await shot(page, '96-shadow-nauhoitus');
      await page.click('#shadow-rec-start');
      await page.waitForSelector('#shadow-rec-stop');
      await page.waitForFunction(() => /Nauhoitus käynnissä/.test(document.querySelector('#shadow-rec-status')?.textContent ?? ''), null, { timeout: 5000 });
      check('nauhoituksen aikana tila kertoo nauhoituksen olevan käynnissä ja nauhoituksen voi lopettaa', await visible(page, '#shadow-rec-stop'));
      await page.waitForSelector('#shadow-cmp-take', { timeout: 20000 });
      check('nauhoituksen jälkeen voi kuunnella mallin ja oman toiston, nauhoittaa uudelleen tai jatkaa', (await visible(page, '#shadow-cmp-model')) && (await visible(page, '#shadow-rec-again')) && (await page.textContent('#shadow-rec-next')) === 'Jatka: Miten sujui?');
      await page.click('#shadow-cmp-take');
      const audio = await page.evaluate(() => {
        const a = window.__audios.at(-1);
        return a ? { blob: a.src.startsWith('blob:'), paused: a.paused } : null;
      });
      check('"Kuuntele omasi" soittaa nauhoituksen muistista (blob-osoite)', Boolean(audio) && audio.blob === true, JSON.stringify(audio));
      check('vertailun aikana painike vaihtuu "Pysäytä"-tilaan', (await page.textContent('#shadow-cmp-take')) === 'Pysäytä');
      await page.click('#shadow-cmp-take');
      check('toinen painallus pysäyttää oman toiston', (await page.textContent('#shadow-cmp-take')) === 'Kuuntele omasi' && (await page.evaluate(() => window.__audios.at(-1).paused)));
      const nm = await spokenCount(page);
      await page.click('#shadow-cmp-model');
      await page.waitForFunction((n) => window.__spoken.length > n, nm);
      check('"Kuuntele malli" soittaa mallin', (await spokenCount(page)) > nm);
      await page.click('#shadow-cmp-model'); // pysäytä
      await shot(page, '96b-shadow-vertailu');
      await page.click('#shadow-rec-next');

      // --- Miten sujui? ---
      await page.waitForSelector('#shadow-rate');
      check('arviointivaihe: kolme vaihtoehtoa ja uuden kappaleen selitys', (await page.locator('#shadow-rate .btn.grade').count()) === 3 && /Uusi kappale palaa joka tapauksessa huomenna/.test(await page.textContent('.stage-help')));
      const grades = await page.locator('#shadow-rate .btn.grade').allTextContents();
      check('vaihtoehdot ja paluuaika: Hankalaa / Kohtalaisesti / Sujui hyvin, kaikki huomenna', JSON.stringify(grades) === JSON.stringify(['Hankalaahuomenna', 'Kohtalaisestihuomenna', 'Sujui hyvinhuomenna']), JSON.stringify(grades));
      check('vaihemittari kertoo viimeisen vaiheen 7 / 7', (await page.textContent('.runner-count')) === 'Vaihe 7 / 7');
      await overflow(page, 'arvio');
      await noGarbage(page, 'arvio');
      await shot(page, '97-shadow-arvio');
      await page.click('[data-rating=good]');

      // --- Yhteenveto ---
      await page.waitForSelector('.summary');
      const sum = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.summary dl > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent])));
      check('yhteenveto: kappaleita 1, uusia 1, kierroksia 9, harjoiteltuja 1 / 24, seuraava kertaus huomenna', sum['Kappaleita'] === '1' && sum['Uusia'] === '1' && sum['Kierroksia yhteensä'] === '9' && sum['Harjoiteltuja kappaleita'] === '1 / 24' && sum['Seuraava kertaus'] === 'huomenna', JSON.stringify(sum));
      check('yhteenvedossa on Valmis ja lisäpainike, alavalikko palaa', (await page.textContent('.summary a.btn.primary')) === 'Valmis' && (await page.textContent('.summary a.btn:not(.primary)')) === '5 min lisää' && (await page.evaluate(() => document.body.dataset.focus)) === '');
      await noGarbage(page, 'yhteenveto');
      await shot(page, '98-shadow-yhteenveto');
      const logSaved = await kv(page, 'shadowLog', {});
      const e = logSaved['sh-01'];
      check('kappaleen tila tallentui: vaihe 1, huomiseksi, arvio good, 9 kierrosta, 1 kerta', Boolean(e) && e.stage === 1 && e.due === day + 1 && e.last === day && e.first === day && e.rating === 'good' && e.plays === 9 && e.sessions === 1, JSON.stringify(logSaved));
      const last = await kv(page, 'lastShadow', null);
      check('lastShadow tallentui', last && last.day === day && last.passages === 1 && last.plays === 9, JSON.stringify(last));
      const act = await kv(page, 'activity', {});
      check('harjoitusaika kirjattiin päivän aktiivisuuteen', act[day] > 0, JSON.stringify(act));

      // --- Tänään jälkeenpäin, lisäoppitunti ---
      await page.click('.summary a.btn.primary');
      await page.waitForSelector('#shadow-card');
      const status = await page.textContent('#shadow-status');
      check('Tänään-kortti kertoo harjoitellun kappaleen ja tarjoaa lisää', /Tänään harjoiteltu: 1 kappale\. Harjoiteltu 1 \/ 24 kappaletta\./.test(status) && (await page.textContent('#shadow-open')) === 'Harjoittele lisää', status);
      await shot(page, '98b-shadow-tanaan-jalkeen', { fullPage: true });
      await page.click('#shadow-open');
      await page.waitForSelector('#shadow-start');
      const li2 = await page.locator('ol.plan li').allTextContents();
      check('lisäoppitunnilla tulee seuraava uusi kappale (huominen kertaus ei ole vielä vuorossa)', li2.length === 1 && /^Uusi: Small talk about the weekend/.test(li2[0]), JSON.stringify(li2));
      check('ei konsolivirheitä: koko oppitunti', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });

  /* ===== 3. Kertauskappale, arvion vaikutus ja keskeytys (360 px) ===== */
  await step('kertauskappale ja keskeytys', async () => {
    const { browser, page, problems } = await launch({ serviceWorkers: 'block', viewport: { width: 360, height: 740 } });
    try {
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#shadow-card');
      const day = await today(page);
      await page.evaluate(async (d) => {
        const ctx = window.__englanti;
        await ctx.saveSettings({ shadowMinutes: 10, shadowRecord: false });
        await ctx.db.setKv('shadowLog', { 'sh-01': { stage: 1, due: d - 1, last: d - 2, first: d - 2, rating: 'good', plays: 8, sessions: 1 } });
      }, day);
      await page.reload();
      await page.waitForSelector('#shadow-status');
      check('Tänään-kortti kertoo kertausvuorossa olevan kappaleen', /Kertausvuorossa: 1 kappale\. Harjoiteltu 1 \/ 24 kappaletta\./.test(await page.textContent('#shadow-status')), await page.textContent('#shadow-status'));
      await overflow(page, 'Tänään 360 px');
      await page.evaluate(() => (location.hash = '#/shadow'));
      await page.waitForSelector('#shadow-start');
      const items = await page.locator('ol.plan li').allTextContents();
      check('10 minuutin oppitunnilla on ensin kertaus, sitten kaksi uutta kappaletta', items.length === 3 && /^Kertaus: Following up on an invoice/.test(items[0]) && /^Uusi: Small talk about the weekend/.test(items[1]) && /^Uusi: A quick status update/.test(items[2]), JSON.stringify(items));
      await overflow(page, 'aloitus 360 px');
      await page.click('#shadow-start');
      await page.waitForSelector('#shadow-primary');
      const s0 = await stepper(page);
      check('kappalemittari: Kappale 1 / 3, Kertaus käynnissä ja kaksi numeroitua Uusi-kappaletta odottaa', s0.line === 'Kappale 1 / 3' && s0.steps.map((x) => x.cls).join(',') === 'current,todo,todo' && s0.steps[0].label === 'Kertaus' && s0.steps[1].label === 'Uusi 1' && s0.steps[2].label === 'Uusi 2', JSON.stringify(s0));
      check('kertaus alkaa tekstin kanssa (vaihe 1 / 3, ei nauhoitusta) ja eyebrow kertoo kertauksen', (await stageTitle(page)).startsWith('Toista tekstin kanssa') && (await page.textContent('.runner-count')) === 'Vaihe 1 / 3' && /^KERTAUS · Työ$|^Kertaus · Työ$/i.test(await page.textContent('.eyebrow')) && (await visible(page, '#shadow-lines')));
      await overflow(page, 'kertauksen kierros 360 px');
      await shot(page, '99-shadow-kertaus-360');
      await doPass(page);
      check('kertauksen tekstikierroksen jälkeen jatketaan ilman tekstiä', (await primary(page)) === 'Jatka: Toista ilman tekstiä');
      await goNext(page);
      await waitStage(page, 'Toista ilman tekstiä');
      await doPass(page);
      await goNext(page);
      await page.waitForFunction(() => /kierros 2 \/ 2/.test(document.querySelector('.stage-title').textContent));
      await doPass(page);
      await goNext(page);
      await page.waitForSelector('#shadow-rate');
      check('kertauksen arviointi: vanhan kappaleen selitys', /arvio ratkaisee, milloin kappale palaa/.test(await page.textContent('.stage-help')));
      const grades = await page.locator('#shadow-rate .btn.grade').allTextContents();
      check('paluuajat: hankala huomenna, kohtalainen huomenna, sujuva 3 päivän päästä', JSON.stringify(grades) === JSON.stringify(['Hankalaahuomenna', 'Kohtalaisestihuomenna', 'Sujui hyvin3 pv päästä']), JSON.stringify(grades));
      await overflow(page, 'arvio 360 px');
      await shot(page, '99b-shadow-arvio-360');
      await page.click('[data-rating=ok]');
      await page.waitForFunction(() => document.querySelector('.steps-line')?.textContent === 'Kappale 2 / 3');
      const s1 = await stepper(page);
      check('toinen kappale alkaa: ensimmäinen valmis, toinen käynnissä, kolmas odottaa', s1.steps.map((x) => x.cls).join(',') === 'done,current,todo' && /^✓ Kertaus/.test(s1.steps[0].label), JSON.stringify(s1));
      check('uusi kappale alkaa Kuuntele-vaiheella (vaihe 1 / 6, ei nauhoitusta)', (await stageTitle(page)) === 'Kuuntele' && (await page.textContent('.runner-count')) === 'Vaihe 1 / 6');
      await overflow(page, 'uusi kappale 360 px');
      const e1 = (await kv(page, 'shadowLog', {}))['sh-01'];
      check('kertauksen tulos tallentui heti: kohtalainen pitää vaiheen 1 ja tuo kappaleen huomiseksi, kierroksia +3', e1.stage === 1 && e1.due === day + 1 && e1.rating === 'ok' && e1.plays === 11 && e1.sessions === 2 && e1.first === day - 2 && e1.last === day, JSON.stringify(e1));

      // Keskeytys: ✕ → vahvistus → Lopeta. Valmis kappale säilyy, keskeneräinen ei tallennu.
      await page.click('.runner-head .icon-btn');
      await page.waitForSelector('dialog[open]');
      await page.click('dialog[open] .btn.primary');
      await page.waitForSelector('#shadow-card');
      const log2 = await kv(page, 'shadowLog', {});
      check('keskeytyksen jälkeen vain valmis kappale on lokissa', Object.keys(log2).join(',') === 'sh-01', JSON.stringify(Object.keys(log2)));
      const last = await kv(page, 'lastShadow', null);
      check('keskeytetystä oppitunnista tallentuu valmiiden kappaleiden määrä ja kierrokset', last && last.passages === 1 && last.plays === 3 && last.day === day, JSON.stringify(last));
      check('Tänään-kortti näyttää keskeytetyn oppitunnin harjoitelluksi', /Tänään harjoiteltu: 1 kappale\./.test(await page.textContent('#shadow-status')));
      check('keskeytys vie Tänään-näkymään ja alavalikko palaa', (await page.textContent('#view h1')) === 'Tänään' && (await page.evaluate(() => document.body.dataset.focus)) === '');
      check('ei konsolivirheitä: kertaus ja keskeytys', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });

  /* ===== 4. Nauhoituksen esto: mikrofoni kielletty ===== */
  await step('mikrofonin esto', async () => {
    const { browser, context, page, problems } = await launch({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
        };
      });
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#shadow-card');
      const day = await today(page);
      await page.evaluate(async (d) => {
        const ctx = window.__englanti;
        await ctx.saveSettings({ shadowMinutes: 5 });
        await ctx.db.setKv('shadowLog', { 'sh-01': { stage: 2, due: d - 1, last: d - 4, first: d - 5, rating: 'good', plays: 16, sessions: 2 } });
      }, day);
      await page.evaluate(() => (location.hash = '#/shadow'));
      await page.waitForSelector('#shadow-start');
      await page.click('#shadow-start');
      await page.waitForSelector('#shadow-primary');
      check('tuttu kappale (vaihe 2) tarjoaa nauhoituksen: vaiheita on 4', (await page.textContent('.runner-count')) === 'Vaihe 1 / 4');
      await doPass(page);
      await goNext(page);
      await waitStage(page, 'Toista ilman tekstiä');
      await doPass(page);
      await goNext(page);
      await doPass(page);
      await goNext(page);
      await page.waitForSelector('#shadow-rec-start');
      await page.click('#shadow-rec-start');
      await page.waitForFunction(() => /Mikrofonin käyttö on estetty/.test(document.querySelector('#shadow-rec-status')?.textContent ?? ''), null, { timeout: 5000 });
      check('estetty mikrofoni: selkeä virheilmoitus, nauhoitusta voi yrittää uudelleen tai ohittaa', (await visible(page, '#shadow-rec-start')) && (await visible(page, '#shadow-rec-skip')));
      await shot(page, '99c-shadow-mikrofoni-estetty');
      await page.click('#shadow-rec-skip');
      await page.waitForSelector('#shadow-rate');
      check('ohituksen jälkeen jatketaan arvioon', (await page.textContent('.runner-count')) === 'Vaihe 4 / 4');
      await page.click('[data-rating=good]');
      await page.waitForSelector('.summary');
      const e = (await kv(page, 'shadowLog', {}))['sh-01'];
      check('ohitettu nauhoitus ei estä tuloksen tallennusta: vaihe 3, 7 päivän päästä', e.stage === 3 && e.due === day + 7 && e.plays === 16 + 3, JSON.stringify(e));
      check('ei konsolivirheitä: mikrofonin esto', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });

  /* ===== 5. Asetukset ===== */
  await step('asetukset', async () => {
    const { browser, page, problems } = await launch({ serviceWorkers: 'block' });
    try {
      await page.goto(`${base}#/settings`, { waitUntil: 'load' });
      await page.waitForSelector('#s-shadow-min');
      check('asetuksissa on Shadowing-kortti: pituus 15 min ja nauhoitusvaihe päällä', (await page.inputValue('#s-shadow-min')) === '15' && (await page.isChecked('#s-shadow-rec')));
      const opts = await page.locator('#s-shadow-min option').allTextContents();
      check('pituusvaihtoehdot 10, 15 ja 20 min', JSON.stringify(opts) === JSON.stringify(['10 min', '15 min', '20 min']), JSON.stringify(opts));
      await page.selectOption('#s-shadow-min', '10');
      await page.uncheck('#s-shadow-rec');
      await page.waitForFunction(() => window.__englanti.settings().shadowMinutes === 10 && window.__englanti.settings().shadowRecord === false);
      const saved = await page.evaluate(async () => (await window.__englanti.db.getKv('settings', {})));
      check('asetukset tallentuvat', saved.shadowMinutes === 10 && saved.shadowRecord === false, JSON.stringify(saved));
      await overflow(page, 'asetukset');
      await page.evaluate(() => (location.hash = '#/today'));
      await page.waitForSelector('#shadow-h');
      check('Tänään-kortin kesto seuraa asetusta', (await page.textContent('#shadow-h')) === 'Shadowing · 10 min');
      await page.reload();
      await page.waitForSelector('#shadow-h');
      check('asetus säilyy uudelleenlatauksen jälkeen', (await page.textContent('#shadow-h')) === 'Shadowing · 10 min');
      check('ei konsolivirheitä: asetukset', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });

  /* ===== 6. Poistuminen kesken toiston ===== */
  await step('poistuminen kesken toiston', async () => {
    const { browser, page, problems } = await launch({ serviceWorkers: 'block' });
    try {
      await page.goto(`${base}#/shadow`, { waitUntil: 'load' });
      await page.waitForSelector('#shadow-start');
      await page.click('#shadow-start');
      await page.waitForSelector('#shadow-primary');
      await page.click('#shadow-primary');
      await page.waitForFunction(() => window.__spoken.length >= 1);
      await page.evaluate(() => (location.hash = '#/today')); // poistutaan kesken kierroksen
      await page.waitForSelector('#shadow-card');
      await page.waitForTimeout(400);
      const n = await spokenCount(page);
      await page.waitForTimeout(1500);
      check('poistuttaessa toisto loppuu eikä jatku taustalla', (await spokenCount(page)) === n, `${n} → ${await spokenCount(page)}`);
      check('poistuminen ei tallenna keskeneräistä kappaletta', JSON.stringify(await kv(page, 'shadowLog', {})) === '{}' && (await kv(page, 'lastShadow', null)) === null);
      check('alavalikko on takaisin', (await page.evaluate(() => document.body.dataset.focus)) === '');
      check('ei konsolivirheitä: poistuminen kesken toiston', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });

  /* ===== 7. Tumma teema ===== */
  await step('tumma teema', async () => {
    const { browser, page, problems } = await launch({ serviceWorkers: 'block', colorScheme: 'dark' });
    try {
      await page.goto(`${base}#/shadow`, { waitUntil: 'load' });
      await page.waitForSelector('#shadow-start');
      await shot(page, '99d-shadow-tumma-aloitus');
      await page.click('#shadow-start');
      await page.waitForSelector('#shadow-primary');
      await doPass(page);
      await goNext(page);
      await page.waitForSelector('#shadow-read');
      await shot(page, '99e-shadow-tumma-lue', { fullPage: true });
      await goNext(page);
      await waitStage(page, 'Lue mukana');
      await page.click('#shadow-primary');
      await page.waitForFunction(() => document.querySelector('#shadow-lines .line.now'), null, { timeout: 5000 });
      await shot(page, '99f-shadow-tumma-toisto');
      const contrast = await page.evaluate(() => {
        const lum = (rgb) => {
          const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => {
            const c = Number(v) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (fg, bg) => {
          const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          return (a + 0.05) / (b + 0.05);
        };
        const line = document.querySelector('#shadow-lines .line.now');
        const cs = getComputedStyle(line);
        const seg = document.querySelector('.seg-btn.on');
        const sc = getComputedStyle(seg);
        return { line: ratio(cs.color, cs.backgroundColor), seg: ratio(sc.color, sc.backgroundColor) };
      });
      check('tumma teema: korostetun lauseen ja valitun nopeuden kontrasti vähintään 4,5', contrast.line >= 4.5 && contrast.seg >= 4.5, JSON.stringify(contrast));
      check('ei konsolivirheitä: tumma teema', problems.length === 0, problems.join(' | '));
    } finally {
      await browser.close();
    }
  });
}

module.exports = { runShadowTests };

if (require.main === module) {
  (async () => {
    let failures = 0;
    const check = (name, ok, detail = '') => {
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
    };
    const srv = await serve(path.join(__dirname, '..', '..'), { withoutAudio: true });
    try {
      await runShadowTests({ base: srv.base, check, out: process.env.E2E_OUT || '/tmp/e2e-out' });
    } finally {
      await srv.close();
    }
    console.log(failures ? `\n${failures} epäonnistui` : '\nShadowing-osio läpi');
    process.exit(failures ? 1 : 0);
  })().catch((e) => {
    console.error('KAATUI', e);
    process.exit(2);
  });
}
