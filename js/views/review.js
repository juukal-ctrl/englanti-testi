import { h } from '../util.js';
import { runTasks, reviewTasks } from '../runner.js';
import { renderSummary } from './session.js';
import { summarize } from '../stats.js';
import { fmtDay } from '../util.js';

export async function mount(root, ctx) {
  const ac = new AbortController();
  const today = ctx.srs.today();
  const due = ctx.srs.due(today).length;
  const reviews = await ctx.db.getAllReviews();
  const sum = summarize([...ctx.srs.cards.values()], reviews, today);

  root.append(h('h1', {}, 'Kertaus'));
  if (due === 0) {
    const next = sum.forecast.slice(1).find((d) => d.n > 0);
    root.append(
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Ei erääntyneitä ilmauksia'),
        h('p', {}, next ? `Seuraava kertaus: ${fmtDay(next.day, today)} (${next.n} ilmausta).` : 'Opi ensin uusia ilmauksia, niin ne tulevat tänne kertaukseen.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/lessons' }, 'Opi uutta')),
      ),
    );
    return {};
  }
  const start = async () => {
    const tasks = reviewTasks(ctx, 40);
    const t0 = performance.now();
    const st = await runTasks(ctx, root, tasks, { title: 'Kertaus', signal: ac.signal });
    if (ac.signal.aborted) return;
    if (st.ended === 'quit') return ctx.nav('today');
    await renderSummary(root, ctx, { reviewed: st.graded, again: st.again, learned: 0, speak: [] }, performance.now() - t0, { title: 'Kertaus tehty' });
  };
  root.append(
    h(
      'section',
      { class: 'card hero' },
      h('h2', {}, `${due} erääntynyttä ilmausta`),
      h('p', {}, 'Heikoimmin muistetut tulevat ensin. Kerralla enintään 40.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary big', type: 'button', on: { click: start } }, 'Aloita kertaus')),
    ),
  );
  return { destroy: () => ac.abort() };
}
