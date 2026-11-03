import { h } from '../util.js';
import { nextNewItems, unitProgress } from '../content.js';
import { runTasks, newContentTasks } from '../runner.js';
import { renderSummary } from './session.js';
import { progressBar, en } from '../ui.js';

const LESSON_SIZE = 6;

export async function mount(root, ctx, params = []) {
  if (params[0] === 'lesson') return runLesson(root, ctx, params[1]);

  root.append(h('h1', {}, 'Oppitunti'), h('p', { class: 'muted' }, 'Valitse aihe. Jokainen oppitunti ottaa kerralla kuusi uutta ilmausta ja kestää noin 6 minuuttia.'));
  const isLearned = (id) => ctx.srs.isLearned(id);
  for (const unit of ctx.catalog.units) {
    const { total, learned } = unitProgress(unit, isLearned);
    const remaining = total - learned;
    const details = h(
      'details',
      { class: 'card unit' },
      h(
        'summary',
        {},
        h('span', { class: 'unit-title' }, unit.title),
        h('span', { class: 'muted' }, `${learned} / ${total}`),
      ),
      progressBar(learned, total, `${unit.title}: opittu`),
      h('p', {}, unit.situation),
      h('p', { class: 'muted' }, unit.intro),
      h(
        'ul',
        { class: 'plain phrases' },
        unit.items.map((it) => h('li', { class: isLearned(it.id) ? 'done' : '' }, en(it.en))),
      ),
      remaining > 0
        ? h('a', { class: 'btn primary', href: `#/lesson/${unit.id}` }, `Opi seuraavat ${Math.min(LESSON_SIZE, remaining)}`)
        : h('p', { class: 'muted' }, 'Kaikki tämän aiheen ilmaukset on otettu käyttöön.'),
    );
    root.append(details);
  }
  return {};
}

async function runLesson(root, ctx, unitId) {
  const ac = new AbortController();
  const items = nextNewItems((id) => ctx.srs.isLearned(id), LESSON_SIZE, { unitId });
  if (!ctx.catalog.unitById(unitId) || items.length === 0) {
    root.append(h('h1', {}, 'Oppitunti'), h('p', {}, 'Tässä aiheessa ei ole uusia ilmauksia.'), h('a', { class: 'btn', href: '#/lessons' }, 'Takaisin'));
    return {};
  }
  const t0 = performance.now();
  (async () => {
    const st = await runTasks(ctx, root, newContentTasks(ctx, items), { title: ctx.catalog.unitById(unitId).title, signal: ac.signal });
    if (ac.signal.aborted) return;
    if (st.ended === 'quit') return ctx.nav('lessons');
    await renderSummary(root, ctx, { reviewed: 0, again: st.again, learned: st.taught, known: st.known, speak: st.speak }, performance.now() - t0, {
      title: 'Oppitunti valmis',
    });
  })();
  return { destroy: () => ac.abort() };
}
