// Päivän sessio: kertaus → uutta → puhe → yhteenveto. Aikaraja jaetaan vaiheiden kesken.

import { h, clear, fmtMinutes } from '../util.js';
import { nextNewItems } from '../content.js';
import { runTasks, reviewTasks, newContentTasks, shadowTasks } from '../runner.js';
import { summarize } from '../stats.js';
import { fmtDay } from '../util.js';

export async function mount(root, ctx, params = []) {
  const extra = params[0] === 'extra';
  const ac = new AbortController();
  const s = ctx.settings();
  const total = s.sessionMinutes * 60000;
  const t0 = performance.now();
  const elapsed = () => performance.now() - t0;
  const result = { reviewed: 0, again: 0, learned: 0, speak: [], quit: false };

  (async () => {
    // 1. Kertaus
    const rt = reviewTasks(ctx, 60);
    if (rt.length) {
      const st = await runTasks(ctx, root, rt, { title: 'Kertaus', budgetMs: total * 0.35, signal: ac.signal });
      result.reviewed += st.graded;
      result.again += st.again;
      if (st.ended === 'quit') return finish(true);
    }
    // 2. Uudet ilmaukset
    const today = ctx.srs.today();
    const allowed = extra ? s.newPerDay : Math.max(0, s.newPerDay - ctx.srs.introducedToday(today));
    const items = nextNewItems((id) => ctx.srs.isLearned(id), allowed);
    if (items.length) {
      const before = ctx.srs.introducedToday(today);
      const st = await runTasks(ctx, root, newContentTasks(items), {
        title: 'Uutta',
        budgetMs: Math.max(total * 0.3, (total - elapsed()) * 0.5),
        signal: ac.signal,
      });
      result.learned += Math.max(0, ctx.srs.introducedToday(today) - before);
      result.again += st.again;
      if (st.ended === 'quit') return finish(true);
    }
    // 3. Puhe
    const st = await runTasks(ctx, root, shadowTasks(ctx, 4), {
      title: 'Puhe',
      budgetMs: Math.max(total * 0.2, total - elapsed() - 45000),
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
      await ctx.db.setKv('lastSession', { day: ctx.srs.today(), ts: Date.now(), ms, reviewed: result.reviewed, learned: result.learned });
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
        stat('Puheharjoituksen täsmäys', avgSpeak == null ? '–' : `${avgSpeak} %`),
        stat('Seuraava kertaus', next ? `${fmtDay(next.day, today)} (${next.n})` : '–'),
      ),
      result.again ? h('p', { class: 'muted' }, `${result.again} ilmausta palaa pian kertaukseen. Se on normaalia: juuri ne jäävät mieleen.`) : null,
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
