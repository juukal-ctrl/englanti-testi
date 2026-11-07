// Asennus ja vianetsintä: Asennus-sivu, asennuskehotteen käyttö, välimuistin korjaus (oikea service worker) ja käynnistysvahti.
//
// Ajo erikseen: NODE_PATH=/usr/local/lib/node_modules_global node tests/e2e/install.cjs
// app.cjs ajaa saman osion osana kokonaisajoa.

const path = require('path');
const fs = require('fs');
const { serve, launch } = require('./harness.cjs');

const GARBAGE = /\bnull\b|\bundefined\b|\bNaN\b|Infinity|\[object|\{\{|\$\{/;

async function runInstallTests({ base, check, out = '/tmp/e2e-out' }) {
  fs.mkdirSync(out, { recursive: true });
  const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      check(`asennus: ${name} keskeytyi poikkeukseen: ${String(e.message ?? e).split('\n')[0]}`, false, e.stack || String(e));
    }
  };

  /* ===== 1. Asennus-sivu selaimessa, asennuskehote ja korjaus (service worker päällä) ===== */
  await step('asennus-sivu', async () => {
    const { browser, context, page } = await launch({ serviceWorkers: 'allow' });
    try {
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#view h1');
      // Odotetaan, että service worker on asentunut ja ottanut sivun hallintaansa.
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration()) && (await caches.keys()).some((k) => /^englanti-[0-9a-f]{10}$/.test(k)), null, { timeout: 15000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 }); // aktivoituminen ja hallinnan ottaminen
      await page.evaluate(async () => {
        await window.__englanti.srs.grade('mail-01', 3, { mode: 'choose', ms: 3000 });
      });

      // Chromen asennuskehote (valetapahtuma) tallentuu heti, vaikka Asennus-sivu avataan vasta myöhemmin.
      await page.evaluate(() => {
        const e = new Event('beforeinstallprompt', { cancelable: true });
        e.prompt = async () => {
          window.__prompted = (window.__prompted ?? 0) + 1;
        };
        e.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(e);
      });

      await page.evaluate(() => (location.hash = '#/more'));
      await page.waitForSelector('nav.tiles a[href="#/install"]');
      check('Lisää-valikossa on Asennus ja vianetsintä -linkki', /Asennus ja vianetsintä/.test(await page.textContent('nav.tiles a[href="#/install"]')));
      await page.click('nav.tiles a[href="#/install"]');
      await page.waitForSelector('#install-facts');
      check('Asennus-sivun otsikko', (await page.textContent('#view h1')) === 'Asennus ja vianetsintä');
      const f = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#install-facts dd')].map((d) => [d.id, d.textContent])));
      check('sivu kertoo käynnissä olevan selaimessa', /selaimessa/.test(f['f-mode']), JSON.stringify(f));
      check('sivu näyttää version', f['f-version'] === '0.6.1', JSON.stringify(f));
      check('sivu kertoo offline-valmiuden ja tallessa olevat tiedostot', /^kyllä \(\d+ tiedostoa tallessa\)$/.test(f['f-offline']), JSON.stringify(f));
      check('asennuskehotteen ollessa saatavilla sivu tarjoaa asennuksen', /Asennus on mahdollinen/.test(f['f-install']) && (await page.locator('#install-btn').count()) === 1, JSON.stringify(f));
      const text = await page.evaluate(() => document.getElementById('view').innerText);
      check('sivu neuvoo etsimään sovelluksen nimellä "Englanti" ja mainitsee chrome://webapks', /kirjoita hakukenttään "Englanti"/.test(text) && /chrome:\/\/webapks/.test(text), text.slice(0, 200));
      check('ohjeissa kehotetaan ottamaan varmuuskopio ennen poistoa', /Lataa ensin varmuuskopio/.test(text) && (await page.locator('#view a[href="#/settings"]').count()) === 1);
      check('ei roskatekstiä: Asennus-sivu', !GARBAGE.test(text), (text.match(GARBAGE) ?? [''])[0]);
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      check('ei vaakavieritystä: Asennus-sivu', ov.sw <= ov.iw, JSON.stringify(ov));
      await shot(page, '80-asennus-sivu', { fullPage: true });
      await page.setViewportSize({ width: 360, height: 640 });
      const ov2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      check('ei vaakavieritystä: Asennus-sivu 360 px', ov2.sw <= ov2.iw, JSON.stringify(ov2));
      await page.setViewportSize({ width: 412, height: 915 });

      await page.click('#install-btn');
      await page.waitForFunction(() => window.__prompted === 1, null, { timeout: 3000 });
      await page.waitForFunction(() => /Asennus alkoi/.test(document.getElementById('toasts')?.textContent ?? ''), null, { timeout: 3000 });
      check('Asenna sovellus -painike käynnistää Chromen asennuskehotteen ja kertoo mistä sovelluksen löytää', true);
      check('kehote on kertakäyttöinen: painike poistuu käytön jälkeen', (await page.locator('#install-btn').count()) === 0);

      // Korjaus: poistaa service workerin ja sovelluskuoren välimuistin, säilyttää oppimisdatan, ja sovellus käynnistyy uudelleen.
      const before = await page.evaluate(async () => (await caches.keys()).filter((k) => /^englanti-[0-9a-f]{10}$/.test(k)));
      check('ennen korjausta sovelluskuoren välimuisti on olemassa', before.length === 1, JSON.stringify(before));
      await page.evaluate(() => {
        window.__beforeRepair = true;
      });
      await page.click('#repair-btn');
      await page.waitForSelector('dialog[open]');
      check('korjaus kysyy vahvistusta ja kertoo, ettei oppimisdata poistu', /ei poisteta/.test(await page.textContent('dialog[open]')));
      await page.click('dialog[open] .btn.primary');
      await page.waitForFunction(() => window.__beforeRepair !== true, null, { timeout: 8000 }); // sivu latautui uudelleen
      await page.waitForSelector('#view h1');
      await page.waitForFunction(async () => (await caches.keys()).some((k) => /^englanti-[0-9a-f]{10}$/.test(k)), null, { timeout: 15000 });
      const after = await page.evaluate(async () => ({ cards: window.__englanti.srs.cards.size, hasCard: window.__englanti.srs.cards.has('mail-01'), regs: (await navigator.serviceWorker.getRegistrations()).length }));
      check('korjauksen jälkeen sovellus käynnistyy ja service worker on rekisteröity uudelleen', after.regs === 1, JSON.stringify(after));
      check('korjaus säilyttää oppimisdatan', after.cards === 1 && after.hasCard, JSON.stringify(after));
      check('käynnistyksen jälkeen sovellus on merkitty valmiiksi', (await page.evaluate(() => document.documentElement.dataset.ready)) === '1');
    } finally {
      await browser.close();
    }
  });

  /* ===== 2. Asennettuna sovelluksena (näkymätila standalone) ===== */
  await step('standalone', async () => {
    const { browser, context, page } = await launch({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(() => {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : orig(q));
      });
      await page.goto(`${base}#/install`, { waitUntil: 'load' });
      await page.waitForSelector('#install-facts');
      const f = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#install-facts dd')].map((d) => [d.id, d.textContent])));
      check('asennettuna sovelluksena sivu kertoo sen olevan jo asennettu eikä tarjoa asennusta', /asennettuna sovelluksena/.test(f['f-mode']) && /jo asennettu sovellus/.test(f['f-install']) && (await page.locator('#install-btn').count()) === 0, JSON.stringify(f));
    } finally {
      await browser.close();
    }
  });

  /* ===== 3. Käynnistysvahti: rikkoutunut moduuli → korjausnappi → sovellus käynnistyy ===== */
  await step('käynnistysvahti', async () => {
    const { browser, context, page } = await launch({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(() => {
        window.__bootGuardMs = 800;
      });
      let broken = true;
      await page.route('**/js/plan.js*', (route) => (broken ? route.abort() : route.continue()));
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForSelector('#boot-guard', { timeout: 5000 });
      check('rikkoutunut moduuli: käynnistysvahti ilmestyy, eikä sovellusta ole merkitty valmiiksi', (await page.evaluate(() => document.documentElement.dataset.ready ?? '')) === '');
      const g = await page.evaluate(() => ({ role: document.getElementById('boot-guard').getAttribute('role'), text: document.getElementById('boot-guard').textContent, btn: document.getElementById('boot-guard-fix').textContent }));
      check('vahti on hälytys, kertaa mitä korjaus tekee ja lupaa säilyttää oppimisdatan', g.role === 'alert' && /Oppimisdataasi ei poisteta/.test(g.text) && g.btn === 'Korjaa ja yritä uudelleen', JSON.stringify(g));
      await shot(page, '81-kaynnistysvahti');
      broken = false; // "korjaus": tiedosto on taas saatavilla
      await page.click('#boot-guard-fix');
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 10000 });
      check('korjauksen jälkeen sovellus käynnistyy ja vahti on poissa', (await page.locator('#boot-guard').count()) === 0 && (await page.textContent('#view h1')) === 'Tänään');
    } finally {
      await browser.close();
    }
  });

  await step('käynnistysvahti ei häiritse', async () => {
    const { browser, context, page } = await launch({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(() => {
        window.__bootGuardMs = 2500;
      });
      await page.goto(base, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 10000 });
      await page.waitForTimeout(3000);
      check('terveessä käynnistyksessä vahti ei ilmesty', (await page.locator('#boot-guard').count()) === 0);
    } finally {
      await browser.close();
    }
  });
}

module.exports = { runInstallTests };

if (require.main === module) {
  (async () => {
    let failures = 0;
    const check = (name, ok, detail = '') => {
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
    };
    const srv = await serve(path.join(__dirname, '..', '..'), { withoutAudio: true });
    try {
      await runInstallTests({ base: srv.base, check, out: process.env.E2E_OUT || '/tmp/e2e-out' });
    } finally {
      await srv.close();
    }
    console.log(failures ? `\n${failures} epäonnistui` : '\nAsennus-osio läpi');
    process.exit(failures ? 1 : 0);
  })().catch((e) => {
    console.error('KAATUI', e);
    process.exit(2);
  });
}
