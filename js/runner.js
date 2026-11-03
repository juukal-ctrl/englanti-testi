// Tehtäväjonon suoritus: yksi harjoitus kerrallaan, virheet palaavat jonoon, aikaraja ja lopetus.

import { h, clear, shuffle } from './util.js';
import { icon, progressBar, confirmDialog } from './ui.js';
import { teach, choose, flipRec, flipProd, shadow } from './exercises.js';
import { pickFormat } from './content.js';

/**
 * Suorittaa tehtävät järjestyksessä.
 * tehtävä = { kind: 'teach'|'review'|'test'|'shadow', item, atomic?, cta? }
 * Palauttaa { shown, graded, again, good, ms, speak:[pct], ended: 'complete'|'time'|'quit' }.
 */
export async function runTasks(ctx, root, tasks, { title, budgetMs = Infinity, signal } = {}) {
  const stats = { shown: 0, graded: 0, again: 0, good: 0, ms: 0, speak: [], ended: 'complete' };
  const queue = tasks.map((t) => ({ ...t }));
  let total = queue.length;
  let done = 0;
  const start = performance.now();

  const ac = new AbortController();
  signal?.addEventListener('abort', () => ac.abort(), { once: true });
  let quit;
  const quitPromise = new Promise((resolve) => (quit = resolve));
  ac.signal.addEventListener('abort', () => quit({ quit: true }), { once: true });

  const countEl = h('span', { class: 'runner-count', 'aria-live': 'off' });
  const barHost = h('div', { class: 'bar-host' });
  const box = h('section', { class: 'runner-box' });
  const quitBtn = h(
    'button',
    {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'Lopeta',
      on: {
        click: async () => {
          const ok = await confirmDialog({
            title: 'Lopetetaanko tähän?',
            body: 'Tähän mennessä tehty on jo tallennettu.',
            confirmText: 'Lopeta',
            cancelText: 'Jatka',
          });
          if (ok) ac.abort();
        },
      },
    },
    icon('close'),
  );
  clear(root).append(
    h('div', { class: 'runner' }, h('header', { class: 'runner-head' }, quitBtn, h('div', { class: 'runner-title' }, title ?? ''), countEl), barHost, box),
  );
  document.body.dataset.focus = '1'; // harjoituksen aikana alavalikko piilossa; ✕ lopettaa

  const paint = () => {
    countEl.textContent = `${Math.min(done + 1, total)} / ${total}`;
    clear(barHost).append(progressBar(done, total, 'Eteneminen'));
  };

  const runOne = async (task) => {
    const taskAc = new AbortController();
    ac.signal.addEventListener('abort', () => taskAc.abort(), { once: true });
    const env = { ctx, signal: taskAc.signal, cta: task.cta };
    const item = task.item;
    try {
      if (task.kind === 'teach') {
        await teach(box, item, env);
        return {};
      }
      if (task.kind === 'shadow') {
        const res = await shadow(box, item, env);
        return { ...res, practice: true };
      }
      if (task.kind === 'produce') {
        env.practice = true;
        env.preview = ctx.srs.preview(item.id);
        const res = await flipProd(box, item, env);
        return { ...res, practice: true };
      }
      const card = ctx.srs.card(item.id);
      const format = task.format ?? pickFormat(item, card);
      env.preview = ctx.srs.preview(item.id);
      const exercise = format === 'choose' ? choose : format === 'flip-rec' ? flipRec : flipProd;
      const res = await exercise(box, item, env);
      await ctx.srs.grade(item.id, res.rating, { mode: format, ms: res.ms });
      return { ...res, format, graded: true };
    } finally {
      taskAc.abort();
    }
  };

  while (queue.length) {
    if (ac.signal.aborted) {
      stats.ended = 'quit';
      break;
    }
    if (!queue[0].atomic && performance.now() - start > budgetMs) {
      stats.ended = 'time';
      break;
    }
    const task = queue.shift();
    paint();
    window.scrollTo(0, 0);
    const res = await Promise.race([runOne(task), quitPromise]);
    if (res?.quit) {
      stats.ended = 'quit';
      break;
    }
    done++;
    stats.shown++;
    if (res.graded) {
      stats.graded++;
      stats.ms += res.ms ?? 0;
      if (res.rating === 1) stats.again++;
      if (res.rating >= 3) stats.good++;
      if (res.rating === 1 && (task.retries ?? 0) < 2) {
        queue.splice(Math.min(queue.length, 3), 0, { ...task, format: undefined, atomic: true, retries: (task.retries ?? 0) + 1 });
        total++;
      }
    }
    if (res.practice && typeof res.pct === 'number') {
      stats.speak.push(res.pct);
      ctx.logSpeak?.(task.item.id, res.pct);
    }
  }
  ac.abort();
  return stats;
}

/* ---------- Tehtävälistojen rakentajat ---------- */

export function reviewTasks(ctx, limit = 40) {
  return ctx.srs
    .due()
    .slice(0, limit)
    .map((card) => ({ kind: 'review', item: ctx.catalog.byId.get(card.id) }))
    .filter((t) => t.item);
}

/** Uudet ilmaukset kolmen ryhmissä: ensin opetus, sitten testaus sekoitetussa järjestyksessä. */
export function newContentTasks(items, chunk = 3) {
  const tasks = [];
  for (let i = 0; i < items.length; i += chunk) {
    const group = items.slice(i, i + chunk);
    group.forEach((item, k) =>
      tasks.push({ kind: 'teach', item, atomic: i > 0 || k > 0, cta: k === group.length - 1 ? 'Testaa itsesi' : 'Seuraava ilmaus' }),
    );
    shuffle(group).forEach((item) => tasks.push({ kind: 'test', item, atomic: true }));
  }
  return tasks;
}

/** Äänenä toistettavia ilmauksia: tuoreimmin opitut ensin; jos mitään ei ole opittu, opetusjärjestyksen alusta. */
export function shadowTasks(ctx, n = 4, kind = 'shadow') {
  const learned = [...ctx.srs.cards.values()]
    .filter((c) => ctx.srs.isLearned(c.id) && ctx.catalog.byId.has(c.id))
    .sort((a, b) => (b.lastReview ?? 0) - (a.lastReview ?? 0))
    .slice(0, Math.max(n * 2, n))
    .map((c) => ctx.catalog.byId.get(c.id));
  const pool = learned.length ? shuffle(learned).slice(0, n) : ctx.catalog.items.slice(0, n);
  return pool.map((item) => ({ kind, item }));
}
