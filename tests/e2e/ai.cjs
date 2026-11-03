// Tekoälypalaute (valinnainen, oma API-avain): asetusten kortti ja Kirjoita-paneeli valepalveluilla.
// Oikeisiin palveluihin ei oteta yhteyttä: Gemini- ja Claude-osoitteet vastaa testin oma valepalvelu (page.route).
//
// Ajo erikseen: NODE_PATH=/usr/local/lib/node_modules_global node tests/e2e/ai.cjs
// app.cjs ajaa saman osion osana kokonaisajoa.

const path = require('path');
const fs = require('fs');
const { serve, launch } = require('./harness.cjs');

const API_RE = /^https:\/\/(generativelanguage\.googleapis\.com|api\.anthropic\.com)\//;
const GEMINI_KEY = 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE0123';
const CLAUDE_KEY = 'sk-ant-api03-FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

const BAD = 'Hi David,\nI write to follow up the e-mail I sent you last week. Please inform me if you have any questions. Can you answer until friday? Thank you!\nBest regards,\nAlex';
const FEEDBACK = {
  corrected: 'Hi David,\nI am writing to follow up on the email I sent you last week. Please let me know if you have any questions. Can you answer by Friday? Thank you!\nBest regards,\nAlex',
  issues: [
    { quote: 'until friday', fix: 'by Friday', category: 'preposition', explanation_fi: 'Määräaika ilmaistaan sanalla "by", ja viikonpäivä kirjoitetaan isolla.' },
    { quote: 'I write to follow up the e-mail', fix: 'I am writing to follow up on the email', category: 'grammar', explanation_fi: 'Tässä käytetään jatkuvaa muotoa ja prepositiota "on".' },
    { quote: 'this sentence is not in the message', fix: 'x', category: 'other', explanation_fi: 'Tätä ei ole tekstissä.' }, // keksitty: ei löydy tekstistä
    { quote: 'Please inform me', fix: 'Please let me know', category: 'register' }, // puutteellinen: selitys puuttuu
  ],
  tip_fi: 'Pyydä kohteliaasti: "Could you let me know…".',
};

const geminiOk = (obj = FEEDBACK) => ({
  status: 200,
  json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 250 } },
});
const claudeOk = (obj = FEEDBACK) => ({
  status: 200,
  json: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 250 } },
});
const geminiModels = {
  status: 200,
  json: {
    models: [
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
    ],
  },
};
const claudeModels = { status: 200, json: { data: [{ id: 'claude-haiku-5-5', type: 'model' }, { id: 'claude-sonnet-5-5', type: 'model' }], has_more: false } };

/** Odotetut virheet: valepalvelun tarkoituksella palauttamat virhetilat ja keskeytetyt pyynnöt. */
const expectedProblem = (p) =>
  /^HTTP [45]\d\d https:\/\/(generativelanguage\.googleapis\.com|api\.anthropic\.com)\//.test(p) ||
  /^requestfailed: https:\/\/(generativelanguage\.googleapis\.com|api\.anthropic\.com)\/\S* net::ERR_(FAILED|ABORTED)/.test(p) ||
  /^console\.error: Failed to load resource: (the server responded with a status of [45]\d\d|net::ERR_(FAILED|ABORTED))/.test(p);

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

async function runAiTests({ base, check, out = '/tmp/e2e-out' }) {
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, problems } = await launch({ serviceWorkers: 'block' });
  const consoleAll = [];
  page.on('console', (m) => consoleAll.push(m.text()));
  page.on('pageerror', (e) => consoleAll.push(String(e)));
  const calls = [];
  const hosts = new Set();
  page.on('request', (r) => {
    const host = new URL(r.url()).host;
    if (host) hosts.add(host);
  });
  const aborted = { n: 0 };
  page.on('requestfailed', (r) => {
    if (API_RE.test(r.url()) && /ERR_ABORTED/.test(r.failure()?.errorText ?? '')) aborted.n++;
  });

  let reply = async () => ({ status: 500, json: { error: { message: 'odottamaton kutsu' } } });
  const setReply = (fn) => (reply = typeof fn === 'function' ? fn : async () => fn);
  await page.route(API_RE, async (route) => {
    const r = route.request();
    const call = { url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() };
    calls.push(call);
    const spec = await reply(call);
    if (spec.abort) return route.abort('failed').catch(() => {});
    if (spec.delay) await new Promise((res) => setTimeout(res, spec.delay));
    await route
      .fulfill({
        status: spec.status ?? 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.json ?? {}),
      })
      .catch(() => {}); // sivu ehti keskeyttää pyynnön
  });
  const posts = () => calls.filter((c) => c.method === 'POST');
  const gets = () => calls.filter((c) => c.method === 'GET');

  const kv = (key, fallback = null) => page.evaluate(([k, f]) => window.__englanti.db.getKv(k, f), [key, fallback]);
  const settings = () => page.evaluate(() => window.__englanti.settings());
  const text = (sel) => page.textContent(sel);
  const exists = async (sel) => (await page.locator(sel).count()) > 0;
  const shot = (name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.png`), ...opts });
  const fillSave = async (value) => {
    await page.fill('#s-ai-key', value);
    await page.click('#s-ai-save');
  };
  const statusIs = (re) => page.waitForFunction((s) => new RegExp(s).test(document.getElementById('s-ai-status').textContent), re.source, { timeout: 6000 });
  const garbage = async (label) => {
    const t = await page.evaluate(() => document.querySelector('#view')?.innerText ?? '');
    const m = t.match(/\bnull\b|\bundefined\b|\bNaN\b|Infinity|\[object|\{\{|\$\{/);
    check(`ei roskatekstiä: ${label}`, !m, m ? `löytyi "${m[0]}"` : '');
  };
  const noOverflow = async (label) => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(`ei vaakavieritystä: ${label}`, r.sw <= r.iw, `${r.sw} > ${r.iw}`);
  };
  /** Missä kaikkialla avain näkyy: sivulla, kentissä, osoitteessa, selaimen tallennuksissa. */
  const leaks = (key) =>
    page.evaluate(async (k) => {
      const found = [];
      const has = (v) => typeof v === 'string' && v.includes(k);
      if (has(document.documentElement.outerHTML)) found.push('DOM');
      if (has(document.body.innerText)) found.push('näkyvä teksti');
      if ([...document.querySelectorAll('input,textarea')].some((i) => has(i.value))) found.push('lomakekenttä');
      if (has(location.href)) found.push('osoite');
      if (has(document.cookie)) found.push('cookie');
      for (const [name, store] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (has(key) || has(store.getItem(key))) found.push(name);
        }
      }
      for (const { name } of await indexedDB.databases()) {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        for (const store of [...db.objectStoreNames]) {
          const dump = await new Promise((res, rej) => {
            const tx = db.transaction(store);
            const all = tx.objectStore(store).getAll();
            const keys = tx.objectStore(store).getAllKeys();
            tx.oncomplete = () => res(JSON.stringify([keys.result, all.result]));
            tx.onerror = () => rej(tx.error);
          });
          if (has(dump)) found.push(`IndexedDB (${store})`);
        }
        db.close();
      }
      return found;
    }, key);
  const rawIdbHas = (needle) =>
    page.evaluate(async (n) => {
      for (const { name } of await indexedDB.databases()) {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        for (const store of [...db.objectStoreNames]) {
          const dump = await new Promise((res, rej) => {
            const tx = db.transaction(store);
            const all = tx.objectStore(store).getAll();
            tx.oncomplete = () => res(JSON.stringify(all.result));
            tx.onerror = () => rej(tx.error);
          });
          if (dump.includes(n)) {
            db.close();
            return true;
          }
        }
        db.close();
      }
      return false;
    }, needle);
  const taskScenario = (id) =>
    page.evaluate(async (taskId) => {
      const { WRITING_TASKS } = await import(new URL('data/writing.js', document.baseURI).href);
      return WRITING_TASKS.find((t) => t.id === taskId).scenario;
    }, id);
  const startCheck = async (task = 'w-followup', body = BAD) => {
    await navTo(page, `write/${task}`);
    await page.waitForSelector('#w-text');
    await page.fill('#w-text', body);
    await page.click('#w-check');
    await page.waitForSelector('#w-ai-panel');
  };
  const askAndWait = async (selector) => {
    await page.click('#w-ai-ask');
    await page.waitForSelector(selector, { timeout: 8000 });
  };

  try {
    /* ----- Ilman avainta ----- */
    await go(page, base, 'write/w-followup');
    await page.waitForSelector('#w-text');
    await page.fill('#w-text', BAD);
    await page.click('#w-check');
    await page.waitForSelector('#w-ai-setup');
    check('ilman avainta tekoälypaneeli ohjaa asetuksiin eikä tarjoa pyyntöä', (await page.getAttribute('#w-ai-setup', 'href')) === '#/settings/ai' && !(await exists('#w-ai-ask')) && /Tekoälypalaute/.test(await text('#w-ai-panel h3')));
    check('paneeli kertoo, että oma API-avain tarvitaan', /omalla API-avaimellasi/.test(await text('#w-ai-panel')));
    check('sääntötarkistuksen palaute näkyy tekoälypaneelin kanssa', (await page.locator('#w-feedback .verdict').count()) === 1 && (await page.locator('#w-feedback mark.hl:not(.ai)').count()) === 2);
    check('ilman avainta ei lähde yhtään pyyntöä', calls.length === 0, JSON.stringify(calls.map((c) => c.url)));
    await page.click('#w-ai-setup');
    await page.waitForSelector('#s-ai');
    await page.waitForFunction(() => document.activeElement?.id === 's-ai-h', null, { timeout: 3000 });
    check('linkki avaa asetusten tekoälykortin ja kohdistaa sen otsikkoon', (await page.evaluate(() => location.hash)) === '#/settings/ai');

    /* ----- Asetusten kortti ----- */
    const card = await page.evaluate(() => {
      const el = (id) => document.getElementById(id);
      return {
        h2: document.querySelector('#s-ai h2')?.textContent,
        provider: el('s-ai-provider').value,
        providers: [...el('s-ai-provider').options].map((o) => o.textContent),
        model: el('s-ai-model').value,
        remember: el('s-ai-remember').checked,
        keyType: el('s-ai-key').type,
        autocomplete: el('s-ai-key').getAttribute('autocomplete'),
        spellcheck: el('s-ai-key').getAttribute('spellcheck'),
        autocapitalize: el('s-ai-key').getAttribute('autocapitalize'),
        labels: ['s-ai-provider', 's-ai-key', 's-ai-model', 's-ai-remember'].map((id) => document.querySelector(`label[for="${id}"]`)?.textContent ?? null),
        status: el('s-ai-status').textContent,
        statusRole: el('s-ai-status').getAttribute('role'),
        section: document.getElementById('s-ai').getAttribute('aria-labelledby'),
        removeDisabled: el('s-ai-remove').disabled,
        note: el('s-ai-note').textContent,
      };
    });
    check('kortin otsikko ja oletukset (Gemini, oletusmalli, avainta ei muisteta)', card.h2 === 'Tekoälypalaute (valinnainen)' && card.provider === 'gemini' && card.model === 'gemini-3.5-flash-lite' && card.remember === false, JSON.stringify(card));
    check('palveluvaihtoehdot ovat Gemini ja Claude', JSON.stringify(card.providers) === JSON.stringify(['Gemini (Google)', 'Claude (Anthropic)']), JSON.stringify(card.providers));
    check('kentillä on nimikkeet ja kortti on nimetty otsikolla', card.labels.every(Boolean) && card.section === 's-ai-h', JSON.stringify(card.labels));
    check('avainkenttä on salasanakenttä, jossa ei ole automaattitäydennystä, isoja alkukirjaimia eikä oikolukua', card.keyType === 'password' && card.autocomplete === 'off' && card.spellcheck === 'false' && card.autocapitalize === 'off', JSON.stringify(card));
    check('tila kertoo, ettei avainta ole, ja ilmoitetaan ruudunlukijalle', /Avainta ei ole asetettu/.test(card.status) && card.statusRole === 'status' && card.removeDisabled === true, card.status);
    check('Geminin huomautus kieltää oikeat asiakas- ja henkilötiedot', /asiakas- tai henkilötietoja/.test(card.note) && /tuotteidensa kehittämiseen/.test(card.note), card.note);
    await garbage('Asetukset (tekoälykortti)');
    await noOverflow('Asetukset (tekoälykortti)');
    await shot('70-asetukset-tekoaly');

    // Virheelliset avaimet eivät lähde minnekään
    const tryKey = async (value) => {
      await fillSave(value);
      await page.waitForTimeout(80);
      return { status: await text('#s-ai-status'), cls: await page.getAttribute('#s-ai-status', 'class') };
    };
    let r = await tryKey('');
    check('tyhjä avain: kehotus liittää avain', /Liitä ensin API-avain/.test(r.status) && /error/.test(r.cls), JSON.stringify(r));
    r = await tryKey('abc123');
    check('liian lyhyt avain hylätään', /liian lyhyeltä/.test(r.status), r.status);
    r = await tryKey('AIzaSyFAKE FAKEFAKEFAKEFAKEFAKEFAKE0123');
    check('avain, jossa on välilyönti, hylätään', /välilyöntejä/.test(r.status), r.status);
    r = await tryKey(CLAUDE_KEY);
    check('Clauden avain Geminille hylätään', /Tämä on Clauden avain/.test(r.status), r.status);
    check('virheelliset avaimet eivät aiheuta pyyntöjä', calls.length === 0, JSON.stringify(calls.map((c) => c.url)));

    // Näytä/piilota
    await page.fill('#s-ai-key', GEMINI_KEY);
    await page.click('button[aria-controls="s-ai-key"]');
    let tog = await page.evaluate(() => ({ type: document.getElementById('s-ai-key').type, pressed: document.querySelector('button[aria-controls="s-ai-key"]').getAttribute('aria-pressed'), label: document.querySelector('button[aria-controls="s-ai-key"]').textContent }));
    check('"Näytä" paljastaa avaimen ja kertoo tilan', tog.type === 'text' && tog.pressed === 'true' && tog.label === 'Piilota', JSON.stringify(tog));
    await page.click('button[aria-controls="s-ai-key"]');
    tog = await page.evaluate(() => ({ type: document.getElementById('s-ai-key').type, pressed: document.querySelector('button[aria-controls="s-ai-key"]').getAttribute('aria-pressed') }));
    check('"Piilota" palauttaa salasanakentän', tog.type === 'password' && tog.pressed === 'false', JSON.stringify(tog));

    /* ----- Gemini-avaimen tallennus ja testi ----- */
    setReply(geminiModels);
    await page.click('#s-ai-save');
    await statusIs(/Avain toimii/);
    const st = await text('#s-ai-status');
    check('avaimen testi hakee mallilistan (GET), avain vain otsakkeessa eikä osoitteessa', gets().length === 1 && gets()[0].url === 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200' && gets()[0].headers['x-goog-api-key'] === GEMINI_KEY && !gets()[0].url.includes(GEMINI_KEY), JSON.stringify(gets().map((c) => c.url)));
    check('pyyntö ei lähetä evästeitä, valtuutusotsaketta eikä lähettäjäosoitetta', !('cookie' in gets()[0].headers) && !('authorization' in gets()[0].headers) && !('referer' in gets()[0].headers), JSON.stringify(Object.keys(gets()[0].headers)));
    check('onnistuminen kerrotaan vihreänä ja kertoo, että avain on vain istunnossa', /Avain toimii\. Malleja löytyi: 2\./.test(st) && /vain tässä istunnossa/.test(st) && /ok/.test(await page.getAttribute('#s-ai-status', 'class')), st);
    check('avainkenttä tyhjenee tallennuksen jälkeen ja on taas salasanakenttä', (await page.inputValue('#s-ai-key')) === '' && (await page.getAttribute('#s-ai-key', 'type')) === 'password');
    const options = await page.locator('#s-ai-models option').evaluateAll((os) => os.map((o) => o.value));
    check('mallilistassa on vain generateContent-mallit ilman duplikaatteja', JSON.stringify(options) === JSON.stringify(['gemini-3.5-flash-lite', 'gemini-3.5-flash']), JSON.stringify(options));
    check('avain ei näy sivulla, kentissä, osoitteessa eikä selaimen tallennuksissa', (await leaks(GEMINI_KEY)).length === 0, JSON.stringify(await leaks(GEMINI_KEY)));
    check('avainta ei tallenneta laitteelle ilman "Muista"-valintaa', (await kv('aiKeys')) === null && !JSON.stringify(await settings()).includes('AIza') && (await settings()).rememberKey === false);
    check('"Poista avain" on käytettävissä ja tallennus- ja hakupainikkeet vapautuvat', !(await page.locator('#s-ai-remove').isDisabled()) && !(await page.locator('#s-ai-save').isDisabled()) && !(await page.locator('#s-ai-list').isDisabled()));
    await shot('71-asetukset-avain-tallennettu');

    // Malli
    await page.fill('#s-ai-model', 'bad model!');
    await page.press('#s-ai-model', 'Tab');
    check('virheellinen mallin nimi hylätään eikä tallennu', /Mallin nimessä saa olla/.test(await text('#s-ai-model-msg')) && (await settings()).aiModel === 'gemini-3.5-flash-lite', await text('#s-ai-model-msg'));
    await page.fill('#s-ai-model', ' models/gemini-3.5-flash ');
    await page.press('#s-ai-model', 'Tab');
    await poll(page, () => window.__englanti.settings().aiModel === 'gemini-3.5-flash');
    check('mallin nimi siistitään (models/-etuliite ja välilyönnit) ja tallennetaan', (await page.inputValue('#s-ai-model')) === 'gemini-3.5-flash' && (await text('#s-ai-model-msg')) === '');
    await page.fill('#s-ai-model', '');
    await page.press('#s-ai-model', 'Tab');
    await poll(page, () => window.__englanti.settings().aiModel === 'gemini-3.5-flash-lite');
    check('tyhjä mallin nimi palauttaa palvelun oletusmallin', (await page.inputValue('#s-ai-model')) === 'gemini-3.5-flash-lite');

    // "Hae mallit" ja virhetilat avaimen testissä
    const gm = (...names) => ({ status: 200, json: { models: names.map((name) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'] })) } });
    setReply(gm('gemini-3.5-flash-lite', 'gemini-4-pro', 'gemini-4-flash'));
    await page.click('#s-ai-list');
    await statusIs(/Malleja löytyi: 3/);
    check('"Hae mallit" päivittää listan', JSON.stringify(await page.locator('#s-ai-models option').evaluateAll((os) => os.map((o) => o.value))) === JSON.stringify(['gemini-3.5-flash-lite', 'gemini-4-pro', 'gemini-4-flash']));
    setReply(gm('gemini-4-pro'));
    await page.click('#s-ai-list');
    await statusIs(/ei löytynyt listalta/);
    check('jos valittua mallia ei löydy listalta, siitä varoitetaan', /gemini-3\.5-flash-lite ei löytynyt/.test(await text('#s-ai-status')) && /warn/.test(await page.getAttribute('#s-ai-status', 'class')), await text('#s-ai-status'));
    setReply({ status: 403, json: { error: { code: 403, message: 'Permission denied: API key was reported as leaked.' } } });
    await page.click('#s-ai-list');
    await statusIs(/hylkäsi avaimen/);
    check('hylätty avain näytetään punaisena virheenä', /error/.test(await page.getAttribute('#s-ai-status', 'class')) && !(await text('#s-ai-status')).includes(GEMINI_KEY));
    setReply({ abort: true });
    await page.click('#s-ai-list');
    await statusIs(/Yhteys palveluun ei onnistunut/);
    check('verkkovirhe mallihaussa kerrotaan ymmärrettävästi', /error/.test(await page.getAttribute('#s-ai-status', 'class')));
    setReply(geminiModels);

    /* ----- Kirjoita: pyyntö vasta painikkeesta ----- */
    await startCheck();
    await page.waitForSelector('#w-ai-ask');
    const ready = await text('#w-ai-panel');
    check('valmiustila kertoo palvelun, mallin ja tietosuojan', /Gemini \(Google\)/.test(ready) && /gemini-3\.5-flash-lite/.test(ready) && /älä lähetä oikeita asiakas- tai henkilötietoja/.test(ready) && /Googlen tuotekehitykseen/.test(ready), ready);
    await page.waitForTimeout(250);
    check('"Tarkista" ei lähetä tekstiä tekoälylle (vain GET-mallihaut ovat tehty)', posts().length === 0, JSON.stringify(posts().map((c) => c.url)));
    const logBefore = (await kv('writeLog', [])).length;
    await garbage('Kirjoita: tekoälypaneeli valmiina');
    await noOverflow('Kirjoita: tekoälypaneeli valmiina');
    await shot('72-kirjoita-tekoaly-valmis', { fullPage: true });

    setReply(geminiOk());
    await askAndWait('#w-ai-again');
    check('painike lähettää yhden pyynnön osoitteeseen generateContent ja avain on vain otsakkeessa', posts().length === 1 && posts()[0].url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent' && posts()[0].headers['x-goog-api-key'] === GEMINI_KEY && !posts()[0].url.includes(GEMINI_KEY) && !(posts()[0].body ?? '').includes(GEMINI_KEY), JSON.stringify(posts().map((c) => c.url)));
    const body = JSON.parse(posts()[0].body);
    const scenario = await taskScenario('w-followup');
    const userMsg = body.contents?.[0]?.parts?.[0]?.text ?? '';
    check('pyynnön runko: järjestelmäohje, tehtävän kuvaus ja oppijan teksti merkittynä datana', typeof body.systemInstruction?.parts?.[0]?.text === 'string' && body.systemInstruction.parts[0].text.length > 500 && userMsg.includes(scenario) && /<learner_text>[\s\S]*I write to follow up the e-mail[\s\S]*<\/learner_text>/.test(userMsg), userMsg.slice(0, 200));
    check('pyyntö vaatii JSON-vastauksen eikä lähetä evästeitä tai lähettäjäosoitetta', body.generationConfig?.responseMimeType === 'application/json' && !('cookie' in posts()[0].headers) && !('referer' in posts()[0].headers) && /application\/json/.test(posts()[0].headers['content-type']));

    const done = await page.evaluate(() => {
      const panel = document.getElementById('w-ai-panel');
      return {
        marks: [...panel.querySelectorAll('mark.hl.ai')].map((m) => m.firstChild.textContent),
        items: [...panel.querySelectorAll('ol.issues li')].map((li) => li.textContent),
        chips: [...panel.querySelectorAll('ol.issues .chip')].map((c) => c.textContent),
        corrected: panel.querySelector('details#w-ai-corrected')?.open,
        correctedText: panel.querySelector('details#w-ai-corrected .quote')?.textContent,
        correctedLang: panel.querySelector('details#w-ai-corrected .quote')?.getAttribute('lang'),
        tip: panel.querySelector('aside.note')?.textContent,
        all: panel.textContent,
        focus: document.activeElement?.id,
        ruleMarks: document.querySelectorAll('#w-feedback mark.hl:not(.ai)').length,
      };
    });
    await page.waitForFunction(() => /Tekoälypalaute valmis: 2 huomiota/.test(document.getElementById('live').textContent), null, { timeout: 2000 }).catch(() => {});
    done.live = await page.evaluate(() => document.getElementById('live').textContent);
    check('tekoälyn huomiot korostetaan tekstistä ja järjestetään tekstin mukaan', JSON.stringify(done.marks) === JSON.stringify(['I write to follow up the e-mail', 'until friday']), JSON.stringify(done.marks));
    check('huomiolistassa on korjaus, suomenkielinen selitys ja luokka', done.items.length === 2 && /”I write to follow up the e-mail” → ”I am writing to follow up on the email”/.test(done.items[0]) && /jatkuvaa muotoa/.test(done.items[0]) && /Tekoäly · Kielioppi/.test(done.chips[0]) && /”until friday” → ”by Friday”/.test(done.items[1]) && /Tekoäly · Prepositiot/.test(done.chips[1]), JSON.stringify(done.items));
    check('keksitty ja puutteellinen huomio jätetään pois ja siitä kerrotaan', !/this sentence is not in the message/.test(done.all) && !/Please let me know/.test(done.items.join('')) && /2 tekoälyn ehdottamaa huomiota jätettiin pois/.test(done.all), done.all.slice(-400));
    check('korjattu versio on suljettuna, englanniksi kielimerkitty ja vinkki näkyy', done.corrected === false && done.correctedLang === 'en-US' && done.correctedText === FEEDBACK.corrected && /Could you let me know/.test(done.tip), JSON.stringify({ c: done.corrected, l: done.correctedLang }));
    check('paneeli varoittaa, että tekoäly voi erehtyä, eikä tallenna palautetta', /Tekoäly voi erehtyä/.test(done.all) && /Palautetta ei tallenneta/.test(done.all));
    check('palvelu, malli ja kesto näytetään', /Palvelu: Gemini \(Google\), malli gemini-3\.5-flash-lite, \d+,\d s\./.test(done.all), done.all.slice(-200));
    check('kohdistus siirtyy tekoälypalautteen otsikkoon ja tulos kuulutetaan', done.focus === 'ai-h' && /Tekoälypalaute valmis: 2 huomiota/.test(done.live), JSON.stringify({ f: done.focus, l: done.live }));
    check('sääntötarkistuksen korostukset säilyvät rinnalla', done.ruleMarks === 2);
    await garbage('Kirjoita: tekoälypalaute');
    await noOverflow('Kirjoita: tekoälypalaute');
    await shot('73-kirjoita-tekoaly-palaute', { fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot('74-kirjoita-tekoaly-palaute-tumma', { fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.click('#w-ai-corrected > summary');
    check('korjattu versio aukeaa', await page.evaluate(() => document.getElementById('w-ai-corrected').open));

    const log = await kv('writeLog', []);
    check('tekoälypyyntö ei kirjaudu kirjoituslokiin', log.length === logBefore && log.every((e) => e.ai === false), JSON.stringify({ before: logBefore, now: log.length }));
    check('tekoälyn vastausta ei tallenneta laitteelle', !(await rawIdbHas('I am writing to follow up on the email')) && !(await rawIdbHas('Could you let me know')));
    check('avain ei vuoda sivulle tekoälypyynnön jälkeenkään', (await leaks(GEMINI_KEY)).length === 0, JSON.stringify(await leaks(GEMINI_KEY)));

    // Uusi tarkistus nollaa paneelin; "Pyydä uudelleen" tekee uuden pyynnön
    await page.click('#w-check');
    await page.waitForSelector('#w-ai-ask');
    check('uusi "Tarkista" palauttaa paneelin valmiustilaan ilman uutta pyyntöä', !(await exists('#w-ai-again')) && posts().length === 1);
    await askAndWait('#w-ai-again');
    setReply(geminiOk({ ...FEEDBACK, tip_fi: 'Toinen vinkki uudelle pyynnölle.' }));
    await page.click('#w-ai-again');
    await page.waitForFunction(() => /Toinen vinkki uudelle pyynnölle/.test(document.getElementById('w-ai-panel')?.textContent ?? ''), null, { timeout: 8000 });
    check('"Pyydä uudelleen" tekee uuden pyynnön ja näyttää uuden vastauksen', posts().length === 3, String(posts().length));
    setReply(geminiOk());

    /* ----- Peruutus ----- */
    await page.click('#w-check');
    await page.waitForSelector('#w-ai-ask');
    const abortedBefore = aborted.n;
    setReply({ ...geminiOk(), delay: 5000 });
    await page.click('#w-ai-ask');
    await page.waitForSelector('#w-ai-cancel');
    const loading = await page.evaluate(() => ({ text: document.getElementById('w-ai-panel').textContent, role: document.querySelector('#w-ai-panel .ai-wait')?.getAttribute('role'), focus: document.activeElement?.id, ask: Boolean(document.getElementById('w-ai-ask')) }));
    check('odotustila kertoo palvelun ja mallin, on status-alue ja kohdistus on Peruuta-painikkeessa', /Pyydetään palautetta palvelulta Gemini \(Google\) \(gemini-3\.5-flash-lite\)/.test(loading.text) && loading.role === 'status' && loading.focus === 'w-ai-cancel' && !loading.ask, JSON.stringify(loading));
    await shot('75-kirjoita-tekoaly-odottaa');
    await page.click('#w-ai-cancel');
    await page.waitForSelector('#w-ai-ask');
    await page.waitForTimeout(300);
    check('peruutus keskeyttää pyynnön ja palauttaa valmiustilan ilman tulosta', aborted.n > abortedBefore && !(await exists('#w-ai-again')) && !(await exists('.banner.warn[role="alert"]')), `aborted ${aborted.n - abortedBefore}`);
    check('peruutus kuulutetaan', /Pyyntö peruttiin/.test(await page.evaluate(() => document.getElementById('live').textContent)));

    /* ----- Virhetilat ----- */
    const scenarios = [
      ['401', { status: 401, json: { error: { code: 401, message: 'API key not valid.', status: 'UNAUTHENTICATED' } } }, /Palvelu hylkäsi avaimen/, true, 'API key not valid.'],
      ['429', { status: 429, json: { error: { message: 'Quota exceeded for metric' } } }, /Kiintiö tai pyyntöraja on täynnä/, false, 'Quota exceeded'],
      ['503', { status: 503, json: { error: { message: 'The model is overloaded.' } } }, /Palvelun puolella on häiriö/, false, 'overloaded'],
      ['404', { status: 404, json: { error: { message: 'models/gemini-x is not found' } } }, /Mallia ei löytynyt/, true, 'not found'],
      ['verkkovirhe', { abort: true }, /Yhteys palveluun ei onnistunut/, false, null],
      ['rikkinäinen vastaus', { status: 200, body: '<html>Bad gateway</html>' }, /ei ollut JSONia/, false, null],
      ['väärän muotoinen JSON', geminiOk({ foo: 1 }), /ei ollut odotetussa muodossa/, false, 'corrected puuttuu'],
      ['katkennut vastaus', { status: 200, json: { candidates: [{ content: { parts: [{ text: '{"corrected":"Hi Dav' }] }, finishReason: 'MAX_TOKENS' }] } }, /Vastaus katkesi/, false, null],
      ['sisältösuodatin', { status: 200, json: { promptFeedback: { blockReason: 'SAFETY' } } }, /sisältösuodatin/, false, null],
      ['tyhjä vastaus', { status: 200, json: { candidates: [{ content: { parts: [{ text: '  ' }] }, finishReason: 'STOP' }] } }, /tyhjällä tekstillä/, false, null],
      ['avain kaiutetaan virheessä', { status: 400, json: { error: { message: `API key ${GEMINI_KEY} is not valid` } } }, /Palvelu hylkäsi avaimen/, true, 'is not valid'],
    ];
    await page.click('#w-check');
    await page.waitForSelector('#w-ai-ask');
    let first = true;
    for (const [name, spec, re, toSettings, detail] of scenarios) {
      setReply(spec);
      await page.click(first ? '#w-ai-ask' : '#w-ai-retry');
      first = false;
      await page.waitForSelector('#w-ai-panel .banner.warn[role="alert"]', { timeout: 8000 });
      const e = await page.evaluate(() => ({
        msg: document.querySelector('#w-ai-panel .banner.warn')?.textContent,
        link: document.getElementById('w-ai-settings')?.getAttribute('href') ?? null,
        tech: document.querySelector('#w-ai-panel details.tech')?.textContent ?? null,
        retry: Boolean(document.getElementById('w-ai-retry')),
        focus: document.activeElement?.id,
        marks: document.querySelectorAll('#w-ai-panel mark').length,
      }));
      check(`virhe (${name}): ymmärrettävä viesti, uusintapainike ja ei tulosta`, re.test(e.msg) && e.retry && e.marks === 0, JSON.stringify(e));
      check(`virhe (${name}): asetuslinkki ${toSettings ? 'näkyy' : 'ei näy'}`, toSettings ? e.link === '#/settings/ai' : e.link === null, JSON.stringify(e.link));
      if (detail) check(`virhe (${name}): tekniset tiedot näkyvät`, new RegExp(detail).test(e.tech ?? ''), String(e.tech));
      if (name === 'avain kaiutetaan virheessä') {
        check('palvelun virheviestissä kaiuttama avain peitetään', !(e.tech ?? '').includes(GEMINI_KEY) && !e.msg.includes(GEMINI_KEY) && (await leaks(GEMINI_KEY)).length === 0, String(e.tech));
      }
    }
    await shot('76-kirjoita-tekoaly-virhe');

    // Aikaraja
    await page.evaluate(() => (window.__englanti.aiTimeoutMs = 1000));
    setReply({ ...geminiOk(), delay: 4000 });
    await page.click('#w-ai-retry');
    await page.waitForFunction(() => /Palvelu ei vastannut 1 sekunnissa/.test(document.querySelector('#w-ai-panel .banner.warn')?.textContent ?? ''), null, { timeout: 6000 });
    check('aikaraja ylittyessä kerrotaan, ettei palvelu vastannut, ja uusinta on tarjolla', /Palvelu ei vastannut 1 sekunnissa/.test(await text('#w-ai-panel .banner.warn')) && (await exists('#w-ai-retry')));
    await page.evaluate(() => (window.__englanti.aiTimeoutMs = 40000));

    // Uusinta onnistuu virheiden jälkeen
    setReply(geminiOk());
    await page.click('#w-ai-retry');
    await page.waitForSelector('#w-ai-again', { timeout: 8000 });
    check('"Yritä uudelleen" onnistuu, kun palvelu toipuu', (await page.locator('#w-ai-panel mark.hl.ai').count()) === 2 && !(await exists('#w-ai-panel .banner.warn')));

    // Näkymästä poistuminen keskeyttää pyynnön
    await page.click('#w-check');
    await page.waitForSelector('#w-ai-ask');
    const abortedMid = aborted.n;
    setReply({ ...geminiOk(), delay: 5000 });
    await page.click('#w-ai-ask');
    await page.waitForSelector('#w-ai-cancel');
    await navTo(page, 'write');
    await page.waitForSelector('nav.tiles a.tile');
    await page.waitForTimeout(300);
    check('näkymästä poistuminen keskeyttää käynnissä olevan pyynnön', aborted.n > abortedMid, `aborted ${aborted.n - abortedMid}`);

    /* ----- Claude ----- */
    await navTo(page, 'settings/ai');
    await page.waitForSelector('#s-ai');
    await page.selectOption('#s-ai-provider', 'anthropic');
    await poll(page, () => window.__englanti.settings().aiProvider === 'anthropic' && document.getElementById('s-ai-model').value === 'claude-haiku-5-5');
    const cl = await page.evaluate(() => ({ note: document.getElementById('s-ai-note').textContent, status: document.getElementById('s-ai-status').textContent, models: [...document.querySelectorAll('#s-ai-models option')].map((o) => o.value), s: window.__englanti.settings() }));
    check('palvelun vaihto Claudeen vaihtaa oletusmallin, huomautuksen ja mallivalinnat', cl.s.aiModel === 'claude-haiku-5-5' && /laskutetaan erikseen/.test(cl.note) && !/tuotteidensa kehittämiseen/.test(cl.note) && JSON.stringify(cl.models) === JSON.stringify(['claude-haiku-5-5', 'claude-sonnet-5-5']), JSON.stringify(cl));
    check('Clauden avainta ei ole, vaikka Geminin avain on istunnossa', /Avainta ei ole asetettu/.test(cl.status), cl.status);
    const callsBeforeClaude = calls.length;
    r = await tryKey(GEMINI_KEY);
    check('Googlen avain Claudelle hylätään eikä lähetetä', /Tämä on Googlen avain/.test(r.status) && calls.length === callsBeforeClaude, r.status);
    setReply(claudeModels);
    await fillSave(CLAUDE_KEY);
    await statusIs(/Avain toimii/);
    const cg = gets().at(-1);
    check('Clauden avaimen testi: GET /v1/models, avain otsakkeessa, selaimen suora käyttö sallittu', cg.method === 'GET' && /^https:\/\/api\.anthropic\.com\/v1\/models(\?|$)/.test(cg.url) && cg.headers['x-api-key'] === CLAUDE_KEY && cg.headers['anthropic-version'] === '2023-06-01' && cg.headers['anthropic-dangerous-direct-browser-access'] === 'true' && !cg.url.includes(CLAUDE_KEY), JSON.stringify(cg.headers));
    check('Clauden avain ei vuoda sivulle eikä tallennuksiin', (await leaks(CLAUDE_KEY)).length === 0, JSON.stringify(await leaks(CLAUDE_KEY)));

    await startCheck();
    await page.waitForSelector('#w-ai-ask');
    const readyC = await text('#w-ai-panel');
    check('Clauden valmiustila nimeää palvelun ja mallin eikä mainitse Geminin ehtoja', /Claude \(Anthropic\)/.test(readyC) && /claude-haiku-5-5/.test(readyC) && /laskutetaan Anthropic-tililtäsi/.test(readyC) && !/Gemini/.test(readyC), readyC);
    setReply(claudeOk());
    await askAndWait('#w-ai-again');
    const cp = posts().at(-1);
    const cb = JSON.parse(cp.body);
    check('Clauden pyyntö: POST /v1/messages, otsakkeet ja runko oikein, avain vain otsakkeessa', cp.url === 'https://api.anthropic.com/v1/messages' && cp.headers['x-api-key'] === CLAUDE_KEY && cp.headers['anthropic-version'] === '2023-06-01' && cp.headers['anthropic-dangerous-direct-browser-access'] === 'true' && /application\/json/.test(cp.headers['content-type']) && !(cp.body ?? '').includes(CLAUDE_KEY), JSON.stringify(cp.headers));
    check('Clauden runko: malli, max_tokens, järjestelmäohje ja käyttäjän viesti', cb.model === 'claude-haiku-5-5' && Number.isInteger(cb.max_tokens) && typeof cb.system === 'string' && cb.system.length > 500 && cb.messages?.length === 1 && cb.messages[0].role === 'user' && /<learner_text>[\s\S]*until friday[\s\S]*<\/learner_text>/.test(cb.messages[0].content), JSON.stringify(Object.keys(cb)));
    const doneC = await text('#w-ai-panel');
    check('Clauden vastaus näytetään samoin kuin Geminin', (await page.locator('#w-ai-panel mark.hl.ai').count()) === 2 && /Palvelu: Claude \(Anthropic\), malli claude-haiku-5-5/.test(doneC), doneC.slice(-200));
    check('Clauden avain ei vuoda tekoälypyynnön jälkeenkään', (await leaks(CLAUDE_KEY)).length === 0);

    /* ----- Avaimen säilytys laitteella ----- */
    await navTo(page, 'settings/ai');
    await page.waitForSelector('#s-ai');
    check('Geminin avain on yhä istunnon muistissa palvelun vaihdon jälkeenkin', await page.evaluate(async () => (await window.__englanti.aiKeys.get('gemini')).length > 0));
    await page.check('#s-ai-remember');
    await poll(page, async () => Object.keys((await window.__englanti.db.getKv('aiKeys', {})) ?? {}).length === 2);
    const stored = await kv('aiKeys');
    check('"Muista avain" tallentaa muistissa olevat avaimet laitteelle ja kertoo siitä', stored.gemini === GEMINI_KEY && stored.anthropic === CLAUDE_KEY && (await settings()).rememberKey === true && /tallennettu tälle laitteelle/.test(await text('#s-ai-status')), await text('#s-ai-status'));
    check('avaimen loppu näkyy, mutta koko avain ei', /Avaimen loppu: …FAKE/.test(await text('#s-ai-status')) && !(await text('#s-ai-status')).includes(CLAUDE_KEY));
    await go(page, base, 'settings/ai');
    await page.waitForSelector('#s-ai');
    await poll(page, () => /tallennettu tälle laitteelle/.test(document.getElementById('s-ai-status').textContent));
    check('laitteelle tallennettu avain löytyy sovelluksen uudelleenavauksen jälkeen', (await page.inputValue('#s-ai-model')) === 'claude-haiku-5-5' && (await page.locator('#s-ai-remember').isChecked()) && /Avaimen loppu: …/.test(await text('#s-ai-status')));
    check('uudelleenavauksen jälkeen avain ei näy sivulla', (await leaks(CLAUDE_KEY).then((l) => l.filter((x) => !x.startsWith('IndexedDB')))).length === 0);
    await startCheck();
    await page.waitForSelector('#w-ai-ask');
    check('Kirjoita tarjoaa tekoälypalautteen heti, kun avain on tallennettu laitteelle', (await exists('#w-ai-ask')) && !(await exists('#w-ai-setup')));
    const exported = await page.evaluate(async () => {
      const { exportBackup } = await import(new URL('js/db.js', document.baseURI).href);
      return JSON.stringify(await exportBackup(window.__englanti.db));
    });
    check('varmuuskopio ei sisällä avaimia eikä "muista avain" -valintaa', !exported.includes(GEMINI_KEY) && !exported.includes(CLAUDE_KEY) && !/aiKeys/.test(exported) && JSON.parse(exported).settings.rememberKey === false && JSON.parse(exported).settings.aiProvider === 'anthropic');

    await navTo(page, 'settings/ai');
    await page.waitForSelector('#s-ai');
    await page.uncheck('#s-ai-remember');
    await poll(page, async () => Object.keys((await window.__englanti.db.getKv('aiKeys', null)) ?? { x: 1 }).length === 0);
    check('"Muista"-valinnan poisto tyhjentää avaimet laitteelta mutta jättää ne istunnon muistiin', (await settings()).rememberKey === false && /Tallennetut avaimet poistettiin laitteelta/.test(await text('#s-ai-status')) && !(await rawIdbHas(CLAUDE_KEY)) && !(await rawIdbHas(GEMINI_KEY)) && (await page.evaluate(async () => (await window.__englanti.aiKeys.get('anthropic')).length > 0)));
    await go(page, base, 'settings/ai');
    await page.waitForSelector('#s-ai');
    await poll(page, () => /Avainta ei ole asetettu/.test(document.getElementById('s-ai-status').textContent));
    check('ilman "Muista"-valintaa avain unohtuu sovelluksen uudelleenavauksessa', (await page.locator('#s-ai-remove').isDisabled()) && !(await page.locator('#s-ai-remember').isChecked()));

    // Poista avain
    setReply(claudeModels);
    await fillSave(CLAUDE_KEY);
    await statusIs(/Avain toimii/);
    await page.check('#s-ai-remember');
    await poll(page, async () => Boolean((await window.__englanti.db.getKv('aiKeys', {})).anthropic));
    await page.click('#s-ai-remove');
    await statusIs(/Avain poistettu/);
    check('"Poista avain" poistaa avaimen muistista ja laitteelta ja kohdistaa avainkenttään', (await page.evaluate(() => document.activeElement?.id)) === 's-ai-key' && !((await kv('aiKeys', {})).anthropic) && (await page.locator('#s-ai-remove').isDisabled()) && /Avainta ei ole asetettu/.test(await text('#s-ai-status')));

    // "Poista kaikki tiedot" ja "Palauta asetukset" poistavat myös avaimet
    await fillSave(CLAUDE_KEY);
    await statusIs(/Avain toimii/);
    check('avain on tallessa ennen kaiken poistoa', Boolean((await kv('aiKeys', {})).anthropic));
    await page.click('text=Poista kaikki tiedot');
    await page.waitForSelector('dialog[open]');
    await page.click('dialog[open] .btn.danger');
    await page.waitForSelector('#view .hero');
    check('"Poista kaikki tiedot" poistaa avaimet muistista ja laitteelta ja nollaa asetukset', (await kv('aiKeys')) === null && !(await rawIdbHas(CLAUDE_KEY)) && (await page.evaluate(async () => (await window.__englanti.aiKeys.get('anthropic')) === '')) && (await settings()).rememberKey === false && (await settings()).aiProvider === 'gemini');

    await navTo(page, 'settings/ai');
    await page.waitForSelector('#s-ai');
    await page.selectOption('#s-ai-provider', 'anthropic');
    await poll(page, () => window.__englanti.settings().aiProvider === 'anthropic');
    await fillSave(CLAUDE_KEY);
    await statusIs(/Avain toimii/);
    await page.check('#s-ai-remember');
    await poll(page, async () => Boolean((await window.__englanti.db.getKv('aiKeys', {})).anthropic));
    await Promise.all([page.waitForEvent('load'), page.click('text=Palauta asetukset')]);
    await page.waitForSelector('#view h1');
    await poll(page, () => window.__englanti.settings().aiProvider === 'gemini');
    check('"Palauta asetukset" palauttaa palvelun oletukseksi ja poistaa laitteelle tallennetut avaimet', (await settings()).rememberKey === false && !(await rawIdbHas(CLAUDE_KEY)));

    /* ----- Lopuksi ----- */
    const unexpected = problems.filter((p) => !expectedProblem(p));
    check('tekoälyosiossa ei konsolivirheitä, CSP-rikkomuksia eikä odottamattomia pyyntöjä', unexpected.length === 0, unexpected.join(' | '));
    const allText = consoleAll.join('\n');
    check('avaimet eivät päädy konsoliin', !allText.includes(GEMINI_KEY) && !allText.includes(CLAUDE_KEY));
    const own = new URL(base).host;
    const foreign = [...hosts].filter((h) => ![own, 'generativelanguage.googleapis.com', 'api.anthropic.com'].includes(h));
    check('sivu ottaa yhteyttä vain omaan osoitteeseensa sekä Gemini- ja Claude-palveluun', foreign.length === 0 && hosts.has('generativelanguage.googleapis.com') && hosts.has('api.anthropic.com'), JSON.stringify([...hosts]));
  } catch (e) {
    check(`tekoälyosio keskeytyi poikkeukseen: ${e.message.split('\n')[0]}`, false, e.stack || String(e));
    await shot('virhe-tekoaly').catch(() => {});
  } finally {
    await browser.close();
  }
}

module.exports = { runAiTests };

if (require.main === module) {
  (async () => {
    let failures = 0;
    const check = (name, ok, detail = '') => {
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + detail : ''}`);
    };
    const srv = await serve(path.join(__dirname, '..', '..'), { withoutAudio: true });
    try {
      await runAiTests({ base: srv.base, check, out: process.env.E2E_OUT || '/tmp/e2e-out' });
    } finally {
      await srv.close();
    }
    console.log(failures ? `\n${failures} epäonnistui` : '\nTekoälyosio läpi');
    process.exit(failures ? 1 : 0);
  })().catch((e) => {
    console.error('KAATUI', e);
    process.exit(2);
  });
}
