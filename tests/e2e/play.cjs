// Tehtäväjonon pelaaja selaintesteille: ajaa päivän session, oppitunnin tai kertauksen loppuun ja kirjaa jokaisen vaiheen.
// Jaettu app.cjs:n ja session.cjs:n kesken. Ei käytä testitulosten laskuria: `fail(viesti)` kirjaa virheen kutsujalle.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GARBAGE = /\bnull\b|\bundefined\b|\bNaN\b|Infinity|\[object|\{\{|\$\{/;

const itemByFi = (page, fi) =>
  page.evaluate((fi) => {
    const it = window.__englanti.catalog.items.find((i) => i.fi === fi);
    return it ? { id: it.id, en: it.en, say: it.say } : null;
  }, fi);

function createPlayer({ fail }) {
  /**
   * Pelaa tehtäväjonon loppuun. policy:
   *  - wrongChoose: joukko (järjestysnumeroita) valintatehtäviä, joihin vastataan väärin
   *  - known: joukko (järjestysnumeroita) opetustehtäviä, joissa painetaan "Osaan tämän jo"
   *  - grade: arvosana (1–4), jonka itsearvioitaviin tehtäviin antaa (oletus 3)
   *  - prod: 'mic' | 'type' | 'reveal' vastaustapa flip-prod-tehtävissä
   *  - maxSteps: pelattavien tehtävien enimmäismäärä (oletus: kunnes yhteenveto)
   *  - tick: valekellon edistys (ms) jokaista tehtävää kohti; vaatii window.__fakeT:n ja ctx.now:n korvauksen
   *  - write: 'done' (oletus: kirjoittaa mallivastauksen, tarkistaa ja jatkaa) | 'skip' ("Ohita kirjoitus tänään")
   *  - writeText: kirjoitusvaiheen oma teksti mallivastauksen sijaan
   *  - writeTick: valekellon edistys (ms) kirjoitusvaiheessa (kirjoittamiseen kuluva aika)
   *  - stopBefore: tehtävätyyppi, jonka kohdalla pelaaja pysähtyy ennen kuin tekee mitään (palauttaa end: 'before:<tyyppi>')
   */
  return async function playRunner(page, policy = {}) {
    const { wrongChoose = new Set(), known = new Set(), grade = 3, prod = 'mic', maxSteps = 250, tick = 0, write = 'done', writeText = null, writeTick = 0, stopBefore = null, onShown, onRevealed } = policy;
    const log = [];
    let chooseIndex = 0;
    let teachIndex = 0;
    const squareIcons = async (where) => {
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll('.runner-box .icon-btn')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0 && Math.abs(r.width - r.height) > 2).map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`),
      );
      if (bad.length) {
        fail(`kuvakepainike ei ole neliö tehtävässä (${where}): ${bad.join(', ')}`);
      }
    };
    const garbage = async (where) => {
      await squareIcons(where);
      const text = await page.evaluate(() => (document.querySelector('.runner-box')?.innerText ?? ''));
      const m = text.match(GARBAGE);
      if (m) {
        fail(`roskatekstiä tehtävässä (${where}): "${m[0]}" -> ${text.replace(/\n/g, ' | ').slice(0, 200)}`);
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
      if (stopBefore && kind === stopBefore) return { log, end: `before:${kind}` };
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
      } else if (kind === 'write') {
        // Kirjoitusvaihe: tehtävä tunnistetaan otsikosta, jotta mallivastaus löytyy datasta.
        const info = await page.evaluate(async () => {
          const { WRITING_TASKS } = await import(new URL('data/writing.js', document.baseURI).href);
          const title = document.querySelector('#w-title')?.textContent ?? '';
          const t = WRITING_TASKS.find((x) => x.title === title);
          return t ? { id: t.id, model: t.model.join('\n\n') } : null;
        });
        if (!info) throw new Error('write: ei löytynyt kirjoitustehtävää otsikolle ' + (await page.textContent('#w-title')));
        rec.id = info.id;
        rec.draft = await page.inputValue('#w-text');
        if (write === 'skip') {
          rec.outcome = 'skip';
          await advance(() => page.click('#w-skip'));
        } else {
          rec.outcome = 'done';
          await page.fill('#w-text', writeText ?? info.model);
          if (writeTick) await page.evaluate((ms) => { window.__fakeT += ms; }, writeTick);
          await page.click('#w-check');
          await page.waitForSelector('#w-feedback');
          rec.verdict = (await page.textContent('#w-feedback .verdict')).trim();
          rec.doneLabel = (await page.textContent('#w-done')).trim();
          await garbage('write-palaute');
          await onRevealed?.(kind, rec);
          await advance(() => page.click('#w-done'));
        }
      } else {
        throw new Error('tuntematon tehtävä: ' + kind);
      }
      log.push(rec);
    }
    if (policy.maxSteps !== undefined) return { log, end: null };
    throw new Error('tehtäväjono ei päättynyt');
  };
}

module.exports = { createPlayer, itemByFi, GARBAGE, escapeRe };
