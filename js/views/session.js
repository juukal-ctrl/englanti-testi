// Päivän sessio: kertaus → uutta → kirjoitus (joka toisena päivänä) → puhe → yhteenveto. Kaikki harjoitukset ovat tämän
// yhden session sisällä. Sessio on aikarajattu: uusia ilmauksia otetaan niin paljon kuin aikaan mahtuu (päivärajaan
// asti), kirjoitukselle ja puheelle varataan aikaa etukäteen, ja loppuaika käytetään puheharjoitukseen.

import { h, clear, fmtMinutes, fmtDay, clamp } from '../util.js';
import { nextNewItems } from '../content.js';
import { runTasks, reviewTasks, newContentTasks, shadowTasks } from '../runner.js';
import { summarize } from '../stats.js';
import { planBudgets, planWriting, SHADOW_TASK_MS } from '../plan.js';
import { runWriting } from './write.js';

/**
 * Päivän kirjoitusosio ({ task, ms }) tai null, jos tänään ei kirjoiteta (asetus, vuoro, ei sopivaa tehtävää tai ei tilaa).
 * Sama laskenta ohjaa sekä Tänään-näkymän suunnitelmaa että sessiota.
 */
export async function writingFor(ctx, totalMs) {
  const every = ctx.settings().writeEvery;
  if (!(every >= 1)) return null;
  const [log, drafts] = await Promise.all([ctx.db.getKv('writeLog', []), ctx.db.getKv('writeDrafts', {})]);
  return planWriting({ every, today: ctx.srs.today(), log, drafts, isLearned: (id) => ctx.srs.isLearned(id), totalMs });
}

export async function mount(root, ctx, params = []) {
  const extra = params[0] === 'extra';
  const ac = new AbortController();
  const s = ctx.settings();
  const now = () => (ctx.now ? ctx.now() : performance.now());
  const total = s.sessionMinutes * 60000;
  const writing = extra ? null : await writingFor(ctx, total); // lisäsessioon ei kuulu kirjoitusta
  const budget = planBudgets(total, writing?.ms ?? 0);
  const t0 = now();
  const elapsed = () => now() - t0;
  const result = { reviewed: 0, again: 0, learned: 0, known: 0, speak: [], wrote: null, skippedWrite: false, quit: false };

  (async () => {
    // 1. Kertaus
    const rt = reviewTasks(ctx, 60);
    if (rt.length) {
      const st = await runTasks(ctx, root, rt, { title: 'Kertaus', budgetMs: budget.reviewMs, signal: ac.signal });
      result.reviewed += st.graded;
      result.again += st.again;
      if (st.ended === 'quit') return finish(true);
    }

    // 2. Uudet ilmaukset: ryhmä kerrallaan, kunnes aika tai päiväraja tulee vastaan.
    // "Osaan jo" -ilmaukset eivät kuluta päivän rajaa, joten niiden jälkeen otetaan lisää.
    // Kirjoitukselle ja puheelle varattu aika jätetään pois.
    const today = ctx.srs.today();
    let allowed = extra ? s.newMax : Math.max(0, s.newMax - ctx.srs.introducedToday(today));
    let handled = 0;
    const handledMax = Math.max(allowed * 2, allowed + 6); // varmuus: ei loputonta ohittelua
    while (allowed > 0 && handled < handledMax && !ac.signal.aborted) {
      const left = total - budget.speakReserveMs - budget.writeReserveMs - elapsed();
      if (left < budget.chunkReserveMs) break;
      const items = nextNewItems((id) => ctx.srs.isLearned(id), allowed);
      if (!items.length) break;
      const st = await runTasks(ctx, root, newContentTasks(ctx, items), { title: 'Uutta', budgetMs: left, reserveMs: budget.chunkReserveMs, signal: ac.signal });
      result.learned += st.taught;
      result.known += st.known;
      result.again += st.again;
      result.speak.push(...st.speak);
      handled += st.taught + st.known;
      allowed -= st.taught;
      if (st.ended === 'quit') return finish(true);
      if (st.ended === 'time' || st.taught + st.known === 0) break;
    }

    // 3. Kirjoitus: yksi lyhyt työviesti, kun sen vuoro on. Valmis tehtävä tai ohitus jatkaa puheeseen.
    if (writing && !ac.signal.aborted) {
      const w = await runWriting(ctx, root, writing.task, { signal: ac.signal });
      if (w.ended === 'quit') return finish(true);
      if (w.ended === 'complete') result.wrote = { id: writing.task.id, title: writing.task.title, words: w.words };
      else result.skippedWrite = true;
    }

    // 4. Puhe: jäljellä oleva aika, 3–8 lausetta
    const remaining = Math.max(0, total - elapsed());
    const n = clamp(Math.round(remaining / SHADOW_TASK_MS), 3, 8);
    const st = await runTasks(ctx, root, shadowTasks(ctx, n), {
      title: 'Puhe',
      budgetMs: Math.max(budget.speakReserveMs, remaining),
      signal: ac.signal,
    });
    result.speak.push(...st.speak);
    if (st.ended === 'quit') return finish(true);
    finish(false);
  })();

  async function finish(quit) {
    if (ac.signal.aborted) return; // näkymä on jo vaihtunut, älä siirrä käyttäjää
    result.quit = quit;
    const ms = elapsed();
    if (!quit) {
      await ctx.db.setKv('lastSession', {
        day: ctx.srs.today(),
        ts: Date.now(),
        ms,
        reviewed: result.reviewed,
        learned: result.learned,
        wrote: result.wrote?.id ?? null,
      });
    }
    if (quit) {
      ctx.nav('today');
      return;
    }
    await renderSummary(root, ctx, result, ms);
  }

  return { destroy: () => ac.abort() };
}

export async function renderSummary(root, ctx, result, ms, { title = 'Valmis' } = {}) {
  const today = ctx.srs.today();
  const reviews = await ctx.db.getAllReviews();
  const sum = summarize([...ctx.srs.cards.values()], reviews, today);
  const next = sum.forecast.slice(1).find((d) => d.n > 0);
  const avgSpeak = result.speak?.length ? Math.round(result.speak.reduce((a, b) => a + b, 0) / result.speak.length) : null;
  document.body.dataset.focus = '';
  clear(root).append(
    h(
      'div',
      { class: 'summary' },
      h('h1', {}, title),
      h('p', { class: 'muted' }, `Kesto ${fmtMinutes(ms)}`),
      h(
        'dl',
        { class: 'facts big' },
        stat('Kertasit', `${result.reviewed ?? 0}`),
        stat('Opit uutta', `${result.learned ?? 0}`),
        result.known ? stat('Osasit jo', `${result.known}`) : null,
        result.wrote ? stat('Kirjoitit', `${result.wrote.title} (${result.wrote.words} sanaa)`) : null,
        stat('Puheharjoituksen täsmäys', avgSpeak == null ? '–' : `${avgSpeak} %`),
        stat('Seuraava kertaus', next ? `${fmtDay(next.day, today)} (${next.n})` : '–'),
      ),
      result.again ? h('p', { class: 'muted' }, `${result.again} ilmausta palaa pian kertaukseen. Se on normaalia: juuri ne jäävät mieleen.`) : null,
      result.skippedWrite ? h('p', { class: 'muted' }, 'Ohitit kirjoituksen. Se tarjotaan uudelleen seuraavassa päivän sessiossa.') : null,
      h(
        'div',
        { class: 'actions' },
        h('a', { class: 'btn primary big', href: '#/today' }, 'Valmis'),
        h('a', { class: 'btn', href: '#/session/extra' }, `${ctx.settings().sessionMinutes} min lisää`),
      ),
    ),
  );
}

function stat(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}
