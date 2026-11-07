// Päivän sessio kokonaisuutena: kirjoitus on yksi session vaiheista (kertaus → uutta → kirjoitus → puhe), ei erillinen osio.
// Tarina viikon yli samalla laitteella: ✕ säilyttää luonnoksen, ohitus, kirjoitus valmiiksi, joka toinen päivä -rytmi,
// lisäsessio ilman kirjoitusta, asetukset sekä aikabudjetti valekellolla.
//
// Ajo erikseen: NODE_PATH=/usr/local/lib/node_modules_global node tests/e2e/session.cjs
// app.cjs ajaa saman osion osana kokonaisajoa.

const path = require('path');
const fs = require('fs');
const { serve, launch } = require('./harness.cjs');
const { createPlayer, escapeRe } = require('./play.cjs');

/** Päivä 0: tiistai 3.11.2026 klo 10 Helsingin aikaa. */
const DAY0 = new Date('2026-11-03T10:00:00+02:00');
const atDay = (n, hour = 10) => new Date(DAY0.getTime() + n * 86400000 + (hour - 10) * 3600000);

const GARBAGE = /\bnull\b|\bundefined\b|\bNaN\b|Infinity|\[object|\{\{|\$\{/;
const PARTIAL = "Hi David, I'm writing to follow up on";

async function go(page, base, hash) {
  await page.goto('about:blank'); // täysi lataus: muisti tyhjenee kuten sovelluksen sulkemisessa
  await page.goto(base + (hash ? `#/${hash}` : ''), { waitUntil: 'load' });
  await page.waitForSelector('#view h1, .runner, .summary', { timeout: 10000 });
}
async function navTo(page, hash) {
  await page.evaluate((h) => (location.hash = `#/${h}`), hash);
}
async function poll(page, fn, arg, { timeout = 5000, interval = 50 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`poll: aikaraja ${timeout} ms ylittyi: ${String(fn).replace(/\s+/g, ' ').slice(0, 140)}`);
    await page.waitForTimeout(interval);
  }
}

async function runSessionTests({ base, check, out = '/tmp/e2e-out' }) {
  fs.mkdirSync(out, { recursive: true });
  const { browser, context, page, problems } = await launch({ serviceWorkers: 'block' });
  const playRunner = createPlayer({ fail: (msg) => check(msg, false) });

  const kv = (key, fallback = null) => page.evaluate(([k, f]) => window.__englanti.db.getKv(k, f), [key, fallback]);
  const settings = () => page.evaluate(() => window.__englanti.settings());
  const shot = (name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
  const setClock = (n, hour = 10) => context.clock.setFixedTime(atDay(n, hour));
  const planLines = () => page.locator('.hero .plan li').allTextContents();
  /** Session kokonaisedistyminen sellaisena kuin se juuri nyt näkyy. */
  const stepsNow = () =>
    page.evaluate(() => ({
      line: document.querySelector('.steps-line')?.textContent ?? null,
      time: document.querySelector('.steps-time')?.textContent ?? null,
      steps: [...document.querySelectorAll('.steps .step')].map((li) => ({ label: li.querySelector('.step-label')?.textContent.replace(/\s+/g, ' ').trim(), cls: li.className.replace('step ', ''), current: li.getAttribute('aria-current') })),
      title: document.querySelector('.runner-title')?.textContent,
    }));
  const taskInfo = (id) =>
    page.evaluate(async (taskId) => {
      const { WRITING_TASKS } = await import(new URL('data/writing.js', document.baseURI).href);
      const t = WRITING_TASKS.find((x) => x.id === taskId);
      return { title: t.title, model: t.model.join('\n\n'), words: t.words };
    }, id);
  const startSession = async () => {
    await page.click('a.btn.primary.big[href="#/session"]');
    await page.waitForSelector('.runner');
  };
  const today = () => page.evaluate(() => window.__englanti.srs.today());
  const overflow = async (label) => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(`ei vaakavieritystä: ${label}`, r.sw <= r.iw, `${r.sw} > ${r.iw}`);
  };
  /** Muuttaa asetuksen käyttöliittymän kautta ja odottaa, että se on tallentunut. */
  const setSelect = async (id, value, key, expected) => {
    await go(page, base, 'settings');
    await page.selectOption(id, value);
    await poll(page, ([k, v]) => window.__englanti.settings()[k] === v, [key, expected]);
  };
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      check(`sessio: ${name} keskeytyi poikkeukseen: ${String(e.message ?? e).split('\n')[0]}`, false, e.stack || String(e));
      await shot(`virhe-sessio-${name.replace(/\W+/g, '-')}`).catch(() => {});
    }
  };

  let followup;
  let request;
  let deadline;

  try {
    /* ===== 0. Tuore asennus: ei kirjoitusta, lisäharjoitukset kokoon taitettuina ===== */
    await step('tuore asennus', async () => {
      await setClock(0);
      await go(page, base);
      followup = await taskInfo('w-followup');
      request = await taskInfo('w-request');
      deadline = await taskInfo('w-deadline');
      const intro = await page.textContent('.card.intro');
      check('ensikäyttökortti kertoo yhden päivän session sisältävän kaiken', /Päivän sessio kestää noin 15 minuuttia ja sisältää kaiken: kertausta, uusia ilmauksia, välillä kirjoitusta ja puhetta/.test(intro), intro);
      const plan = await planLines();
      check('tuoreessa asennuksessa kirjoitusta ei ehdoteta (mitään ei ole vielä opittu)', plan.length >= 2 && !plan.some((l) => /^Kirjoitus/.test(l)), JSON.stringify(plan));
      check('lisäharjoitukset ovat aluksi kokoon taitettuna', (await page.evaluate(() => document.getElementById('extras')?.open)) === false);
      check('lisäharjoitusten otsikko kertoo, että ne ovat vapaaehtoisia', /Lisäharjoitusta \(vapaaehtoinen\)/.test(await page.textContent('#extras > summary')));
      check('lisäharjoituksissa on neljä erillistä harjoitusta', (await page.locator('#extras a.tile').count()) === 4);
      check('päivän sessiolle on yksi aloituspainike', (await page.locator('.hero a.btn.primary[href="#/session"]').count()) === 1);
      await page.click('#extras > summary');
      check('lisäharjoitukset aukeavat napautuksella', (await page.evaluate(() => document.getElementById('extras').open)) === true);
      await shot('70-tanaan-lisaharjoitukset-auki', { fullPage: true });
      await overflow('Tänään, lisäharjoitukset auki');

      await go(page, base, 'settings');
      const sel = await page.evaluate(() => ({ value: document.getElementById('s-write')?.value, options: [...document.querySelectorAll('#s-write option')].map((o) => [o.value, o.textContent]) }));
      check(
        'Asetuksissa kirjoituksen tiheys: oletuksena joka toinen päivä',
        sel.value === '2' && JSON.stringify(sel.options) === JSON.stringify([['2', 'Joka toinen päivä'], ['1', 'Joka päivä'], ['3', 'Joka kolmas päivä'], ['0', 'Ei sessiossa']]),
        JSON.stringify(sel),
      );
      check('oletusasetus writeEvery on 2', (await settings()).writeEvery === 2);
    });

    /* ===== 1. Pohja: 12 ilmausta opittu (aihe "Sähköpostin avaus"), uusia enintään 6 päivässä ===== */
    await step('pohja', async () => {
      await go(page, base);
      await page.evaluate(async () => {
        const e = window.__englanti;
        for (let i = 1; i <= 12; i++) await e.srs.grade(`mail-${String(i).padStart(2, '0')}`, 3, { mode: 'choose', ms: 4000 });
        await e.saveSettings({ newMax: 6 });
      });
      check('pohjana 12 opittua ilmausta', (await page.evaluate(() => window.__englanti.srs.cards.size)) === 12);
    });

    /* ===== 2. Päivä 5: suunnitelma ja kirjoitusvaihe sessiossa; ✕ säilyttää luonnoksen ===== */
    await step('✕ kirjoitusvaiheessa', async () => {
      await setClock(4);
      await go(page, base);
      const plan = await planLines();
      const idx = (re) => plan.findIndex((l) => re.test(l));
      const order = [idx(/^Kertausta: \d+ ilmausta/), idx(/^Uutta: enintään 6 ilmausta/), idx(/^Kirjoitus: /), idx(/^Puhetta/)];
      check('suunnitelma kertoo vaiheet session järjestyksessä: kertaus, uutta, kirjoitus, puhe', order.every((v) => v >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(plan));
      check('kirjoitusvaihe nimeää tehtävän ja arvioidun keston', plan[order[2]] === `Kirjoitus: ${followup.title} (noin 6 min)`, plan[order[2]]);
      await shot('71-tanaan-kirjoitus-mukana');

      await startSession();
      const first = await stepsNow();
      check('session alussa kokonaisedistyminen näkyy: "Vaihe 1 / 4"', first.line === 'Vaihe 1 / 4' && first.title === 'Kertaus', JSON.stringify(first));
      check(
        'vaihepalkit ovat Kertaus, Uutta, Kirjoitus, Puhe ja ensimmäinen on käynnissä',
        JSON.stringify(first.steps.map((x) => x.label.replace(/^✓ /, '').replace(/ \(.*\)$/, ''))) === JSON.stringify(['Kertaus', 'Uutta', 'Kirjoitus', 'Puhe']) && first.steps[0].cls === 'current' && first.steps[0].current === 'step' && first.steps.slice(1).every((x) => x.cls === 'todo' && x.current === null),
        JSON.stringify(first.steps),
      );
      check('kulunut kokonaisaika näkyy muodossa "0 / 15 min"', first.time === '0 / 15 min', first.time);
      await shot('77-sessio-vaihemittari');
      await overflow('vaihemittari 412 px');
      await page.setViewportSize({ width: 360, height: 640 });
      await overflow('vaihemittari 360 px');
      await shot('78-sessio-vaihemittari-360');
      await page.setViewportSize({ width: 412, height: 915 });
      const pre = await playRunner(page, { stopBefore: 'write' });
      check('sessio etenee kirjoitusvaiheeseen kertauksen ja uuden sisällön jälkeen', pre.end === 'before:write', pre.end);
      const kinds = pre.log.map((l) => l.kind);
      check('ennen kirjoitusta on kertausta ja uutta sisältöä, ei vielä puhetta', kinds.length > 6 && kinds.includes('teach') && !kinds.includes('shadow'), kinds.join(','));

      await page.waitForFunction(() => document.activeElement?.id === 'w-title', null, { timeout: 3000 });
      await page.waitForFunction(() => /Kirjoitus: /.test(document.getElementById('live')?.textContent ?? ''), null, { timeout: 3000 }); // ilmoitus tulee hetken viiveellä
      const ws = await page.evaluate(() => ({
        eyebrow: document.querySelector('.runner-box .eyebrow')?.textContent,
        title: document.getElementById('w-title')?.textContent,
        head: document.querySelector('.runner-title')?.textContent,
        text: document.getElementById('w-text')?.value,
        skip: document.getElementById('w-skip')?.textContent,
        back: document.querySelectorAll('.runner-box a.back').length,
        focus: document.body.dataset.focus,
        live: document.getElementById('live')?.textContent ?? '',
      }));
      check('kirjoitusvaihe näkyy session kehyksessä: otsikko, tehtävä ja tyhjä kirjoitusruutu', ws.eyebrow === 'Kirjoitus' && ws.head === 'Kirjoitus' && ws.title === followup.title && ws.text === '' && ws.back === 0, JSON.stringify(ws));
      check('kirjoitusvaiheessa on "Ohita kirjoitus tänään" ja alavalikko on piilossa', ws.skip === 'Ohita kirjoitus tänään' && ws.focus === '1' && !(await page.isVisible('#nav')), JSON.stringify(ws));
      check('kirjoitusvaihe kuulutetaan ruudunlukijalle ja otsikko saa kohdistuksen', /Kirjoitus: /.test(ws.live));
      const atWrite = await stepsNow();
      check(
        'kirjoitusvaiheessa mittari näyttää "Vaihe 3 / 4", kaksi ensimmäistä tehty',
        atWrite.line === 'Vaihe 3 / 4' && atWrite.steps.map((x) => x.cls).join(',') === 'done,done,current,todo' && atWrite.steps[2].current === 'step' && /^\d+ \/ 15 min$/.test(atWrite.time ?? ''),
        JSON.stringify(atWrite),
      );
      const t = await page.evaluate(() => document.querySelector('.runner-box').innerText);
      check('ei roskatekstiä: kirjoitusvaihe', !GARBAGE.test(t), (t.match(GARBAGE) ?? [''])[0]);
      await overflow('kirjoitusvaihe 412 px');
      await shot('72-sessio-kirjoitusvaihe', { fullPage: true });
      await page.setViewportSize({ width: 360, height: 640 });
      await overflow('kirjoitusvaihe 360 px');
      await shot('73-sessio-kirjoitusvaihe-360');
      await page.setViewportSize({ width: 412, height: 915 });

      await page.fill('#w-text', PARTIAL);
      await page.click('.runner-head .icon-btn');
      await page.waitForSelector('dialog[open]');
      check('✕ kysyy vahvistusta', /Lopetetaanko tähän\?/.test(await page.textContent('dialog[open]')));
      await page.click('dialog[open] .btn.primary'); // Lopeta
      await page.waitForSelector('#view h1');
      check('✕ palaa Tänään-näkymään', (await page.evaluate(() => location.hash)) === '#/today' && (await page.textContent('#view h1')) === 'Tänään', await page.evaluate(() => location.hash));
      await poll(page, async (want) => ((await window.__englanti.db.getKv('writeDrafts', {}))['w-followup'] ?? {}).text === want, PARTIAL);
      check('luonnos tallentuu, kun sessio lopetetaan kesken kirjoituksen', true);
      check('kesken jäänyt sessio ei kirjaudu tehdyksi', (await kv('lastSession')) === null);
      check('kirjoitusyritystä ei kirjata ennen tarkistusta', (await kv('writeLog', [])).length === 0);
      await page.waitForSelector('.hero .plan');
      const plan2 = await planLines();
      check('Tänään tarjoaa luonnoksen jatkamista', plan2.some((l) => l.startsWith(`Kirjoitus: ${followup.title}`)) && /^Päivän sessio/.test(await page.textContent('.hero h2')), JSON.stringify(plan2));
    });

    /* ===== 3. Sama päivä: luonnos palautuu, kirjoituksen voi ohittaa ===== */
    await step('ohitus', async () => {
      await startSession();
      const res = await playRunner(page, { write: 'skip' });
      check('sessio päättyy yhteenvetoon ohituksen jälkeen', res.end === 'summary', res.end);
      const kinds = res.log.map((l) => l.kind);
      const wi = kinds.indexOf('write');
      check('kirjoitusvaihe on kerran ja puhe tulee vasta sen jälkeen', kinds.filter((k) => k === 'write').length === 1 && wi >= 0 && kinds.length - wi - 1 >= 3 && kinds.slice(wi + 1).every((k) => k === 'shadow'), kinds.join(','));
      check('keskeytetty luonnos palautuu kirjoitusvaiheeseen', res.log[wi]?.draft === PARTIAL, JSON.stringify(res.log[wi]));
      const sum = await page.textContent('.summary');
      check('yhteenveto kertoo kirjoituksen ohituksesta eikä väitä kirjoitetun', /Ohitit kirjoituksen\. Se tarjotaan uudelleen seuraavassa päivän sessiossa\./.test(sum) && !/Kirjoitit/.test(sum), sum);
      await shot('74-yhteenveto-ohitus');
      check('ohitus ei kirjaudu kirjoitusyritykseksi', (await kv('writeLog', [])).length === 0);
      check('ohitus säilyttää luonnoksen', ((await kv('writeDrafts', {}))['w-followup'] ?? {}).text === PARTIAL);
      const ls = await kv('lastSession');
      check('sessio on tehty, mutta kirjoitusta ei ole merkitty tehdyksi', ls && ls.day === (await today()) && ls.wrote === null, JSON.stringify(ls));
      await go(page, base);
      const hero = await page.textContent('.hero');
      check('Tänään kertoo session olevan tehty ja tarjoaa lisää', /Päivän sessio on tehty/.test(hero) && (await page.locator('.hero a[href="#/session/extra"]').count()) === 1, hero);
      check('lisäharjoitukset ovat taas kokoon taitettuina', (await page.evaluate(() => document.getElementById('extras').open)) === false);
    });

    /* ===== 4. Lisäsessio ei sisällä kirjoitusta, vaikka sen vuoro olisi ===== */
    await step('lisäsessio', async () => {
      await navTo(page, 'session/extra');
      await page.waitForSelector('.runner');
      const res = await playRunner(page, { write: 'skip' });
      const kinds = res.log.map((l) => l.kind);
      check('lisäsessio päättyy yhteenvetoon', res.end === 'summary', res.end);
      check('lisäsessiossa ei ole kirjoitusvaihetta (vain kertausta, uutta ja puhetta)', !kinds.includes('write') && kinds.includes('teach') && kinds.includes('shadow'), kinds.join(','));
      const sum = await page.textContent('.summary');
      check('lisäsession yhteenvedossa ei kirjoitusta eikä ohitusilmoitusta', !/Kirjoitit|Ohitit/.test(sum), sum);
      check('lisäsessio ei kirjaa kirjoitusyrityksiä', (await kv('writeLog', [])).length === 0);
    });

    /* ===== 5. Päivä 6: kirjoitus tarjotaan uudelleen ja tehdään valmiiksi ===== */
    await step('kirjoitus valmiiksi', async () => {
      await setClock(5);
      await go(page, base);
      const plan = await planLines();
      check('ohitettu kirjoitus tarjotaan seuraavana päivänä uudelleen (ohitusta ei kirjata)', plan.some((l) => l.startsWith(`Kirjoitus: ${followup.title}`)), JSON.stringify(plan));
      await startSession();
      let atSpeak = null;
      const res = await playRunner(page, {
        write: 'done',
        onShown: async (kind) => {
          if (kind === 'shadow' && !atSpeak) atSpeak = await stepsNow();
        },
        onRevealed: async (kind) => {
          if (kind === 'write') await shot('75-sessio-kirjoitus-palaute', { fullPage: true });
        },
      });
      check('sessio päättyy yhteenvetoon kirjoituksen jälkeen', res.end === 'summary', res.end);
      check(
        'puhevaiheessa mittari näyttää viimeisen vaiheen käynnissä ja kaikki aiemmat tehtyinä',
        atSpeak && atSpeak.title === 'Puhe' && atSpeak.steps.length >= 2 && atSpeak.line === `Vaihe ${atSpeak.steps.length} / ${atSpeak.steps.length}` && atSpeak.steps.at(-1).cls === 'current' && atSpeak.steps.slice(0, -1).every((x) => x.cls === 'done'),
        JSON.stringify(atSpeak),
      );
      const kinds = res.log.map((l) => l.kind);
      const wi = kinds.indexOf('write');
      const w = res.log[wi];
      check('luonnos palautuu myös seuraavana päivänä', w?.draft === PARTIAL, JSON.stringify(w));
      check('mallivastaus saa "Hyvä!"-palautteen ja jatkopainike on "Valmis, jatka"', /Hyvä!/.test(w?.verdict ?? '') && w?.doneLabel === 'Valmis, jatka', JSON.stringify(w));
      check('kirjoituksen jälkeen on vielä puhetta (3–8 lausetta)', kinds.length - wi - 1 >= 3 && kinds.length - wi - 1 <= 8 && kinds.slice(wi + 1).every((k) => k === 'shadow'), kinds.join(','));
      const sum = await page.textContent('.summary');
      check('yhteenvedossa on kirjoitettu tehtävä ja sanamäärä', new RegExp(`Kirjoitit\\s*${escapeRe(followup.title)} \\(\\d+ sanaa\\)`).test(sum) && !/Ohitit/.test(sum), sum);
      await shot('76-yhteenveto-kirjoitus');
      const log = await kv('writeLog', []);
      check('kirjoitus kirjautuu: virheetön yritys ja valmis-merkintä', log.length === 2 && log.every((e) => e.id === 'w-followup') && log[0].clean === true && log[0].done === undefined && log[1].done === true, JSON.stringify(log));
      await poll(page, async () => !(await window.__englanti.db.getKv('writeDrafts', {}))['w-followup']);
      check('valmis tehtävä poistaa luonnoksen', true);
      const ls = await kv('lastSession');
      check('sessio muistaa kirjoitetun tehtävän', ls && ls.wrote === 'w-followup' && ls.day === (await today()), JSON.stringify(ls));
      const act = await kv('activity', {});
      check('kirjoitukseen käytetty aika kirjautuu harjoitteluaikaan', (act[await today()] ?? 0) > 0, JSON.stringify(act));
      await go(page, base);
      check('Tänään näyttää tehdyt kirjoitustehtävät', /Kirjoitustehtäviä tehty\s*1 \/ 12/.test(await page.textContent('.facts')));
    });

    /* ===== 6. Päivä 7: ei kirjoitusta (joka toinen päivä); "Joka päivä" tuo sen takaisin ===== */
    await step('rytmi', async () => {
      await setClock(6);
      await go(page, base);
      let plan = await planLines();
      check('kirjoituksen jälkeisenä päivänä kirjoitusta ei ehdoteta, muut vaiheet säilyvät', plan.length >= 2 && !plan.some((l) => /^Kirjoitus/.test(l)) && plan.some((l) => /^Puhetta/.test(l)), JSON.stringify(plan));
      await setSelect('#s-write', '1', 'writeEvery', 1);
      await go(page, base);
      plan = await planLines();
      check('"Joka päivä" tuo kirjoituksen takaisin ja valitsee seuraavan tehtävän', plan.some((l) => new RegExp(`^Kirjoitus: ${escapeRe(request.title)} \\(noin \\d+ min\\)$`).test(l)), JSON.stringify(plan));
      await setSelect('#s-write', '2', 'writeEvery', 2);
      await go(page, base);
      check('"Joka toinen päivä" piilottaa sen taas', !(await planLines()).some((l) => /^Kirjoitus/.test(l)));
    });

    /* ===== 7. Päivä 8: kirjoituksen vuoro; luonnos ohittaa jonon; asetukset ===== */
    await step('asetukset ja valinta', async () => {
      await setClock(7);
      await go(page, base);
      let plan = await planLines();
      check('kahden päivän jälkeen kirjoitus on taas vuorossa: seuraava tekemätön tehtävä', plan.some((l) => l.startsWith(`Kirjoitus: ${request.title}`)), JSON.stringify(plan));
      await page.evaluate(() => window.__englanti.db.setKv('writeDrafts', { 'w-deadline': { text: 'Hi Tom, about the deadline', ts: Date.now() } }));
      await go(page, base);
      plan = await planLines();
      check('aloitettu luonnos menee jonon edelle', plan.some((l) => l.startsWith(`Kirjoitus: ${deadline.title}`)) && !plan.some((l) => l.startsWith(`Kirjoitus: ${request.title}`)), JSON.stringify(plan));
      await page.evaluate(() => window.__englanti.db.setKv('writeDrafts', {}));

      await setSelect('#s-write', '0', 'writeEvery', 0);
      await go(page, base);
      check('"Ei sessiossa" poistaa kirjoituksen suunnitelmasta', !(await planLines()).some((l) => /^Kirjoitus/.test(l)));
      await setSelect('#s-write', '3', 'writeEvery', 3);
      await go(page, base);
      check('"Joka kolmas päivä": kaksi päivää ei vielä riitä', !(await planLines()).some((l) => /^Kirjoitus/.test(l)));
      await setSelect('#s-write', '2', 'writeEvery', 2);

      await setSelect('#s-min', '10', 'sessionMinutes', 10);
      await go(page, base);
      plan = await planLines();
      check('10 minuutin sessioon kirjoitusta ei oteta (viesti veisi yli puolet ajasta)', !plan.some((l) => /^Kirjoitus/.test(l)) && /Päivän sessio · 10 min/.test(await page.textContent('.hero h2')), JSON.stringify(plan));
      await setSelect('#s-min', '15', 'sessionMinutes', 15);
      await go(page, base);
      check('15 minuutin sessioon kirjoitus mahtuu', (await planLines()).some((l) => l.startsWith('Kirjoitus: ')));
    });

    /* ===== 8. Aikabudjetti valekellolla: kirjoituspäivän sessio mahtuu 15 minuuttiin ===== */
    await step('aikabudjetti', async () => {
      await page.evaluate(() => window.__englanti.saveSettings({ newMax: 12 }));
      await go(page, base);
      await page.evaluate(() => {
        window.__fakeT = 0;
        window.__englanti.now = () => window.__fakeT;
      });
      await startSession();
      const TICK = 30000; // jokainen tehtävä "kestää" 30 s
      const WRITE = 4 * 60000; // kirjoittaminen vie 4 min
      const res = await playRunner(page, { tick: TICK, write: 'done', writeTick: WRITE });
      const kinds = res.log.map((l) => l.kind);
      const wi = kinds.indexOf('write');
      const total = await page.evaluate(() => window.__fakeT);
      check('aikabudjetoitu kirjoituspäivän sessio päättyy yhteenvetoon', res.end === 'summary', res.end);
      check('kirjoitus ehtii mukaan ja sen jälkeen jää tilaa puheelle (3–8 lausetta)', wi >= 0 && kinds.length - wi - 1 >= 3 && kinds.length - wi - 1 <= 8 && kinds.slice(wi + 1).every((k) => k === 'shadow'), kinds.join(','));
      check('kirjoituspäivän sessio kestää noin 15 minuuttia', total >= 13 * 60000 && total <= 17.5 * 60000, `${(total / 60000).toFixed(1)} min, ${res.log.length} tehtävää`);
      const sum = await page.textContent('.summary');
      check('yhteenveto kertoo keston valekellon mukaan', /Kesto 1[3-7] min/.test(sum), sum);
      check('kirjoituspäivänä ehtii silti myös uutta (vähintään yksi ryhmä)', /Opit uutta\s*[3-9]/.test(sum) || /Opit uutta\s*1\d/.test(sum), sum);
      check('kirjoitettu tehtävä näkyy yhteenvedossa', new RegExp(`Kirjoitit\\s*${escapeRe(request.title)}`).test(sum), sum);
    });

    check('sessio-osiossa ei konsolivirheitä, CSP-rikkomuksia eikä epäonnistuneita pyyntöjä', problems.length === 0, problems.join(' | '));
  } finally {
    await browser.close();
  }
}

module.exports = { runSessionTests };

if (require.main === module) {
  (async () => {
    let failures = 0;
    const check = (name, ok, detail = '') => {
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
    };
    const srv = await serve(path.join(__dirname, '..', '..'), { withoutAudio: true });
    try {
      await runSessionTests({ base: srv.base, check, out: process.env.E2E_OUT || '/tmp/e2e-out' });
    } finally {
      await srv.close();
    }
    console.log(failures ? `\n${failures} epäonnistui` : '\nSessio-osio läpi');
    process.exit(failures ? 1 : 0);
  })().catch((e) => {
    console.error('KAATUI', e);
    process.exit(2);
  });
}
