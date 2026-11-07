// Tehtäväjonon suoritus: yksi harjoitus kerrallaan, virheet palaavat jonoon, aikaraja ja lopetus.

import { h, clear, shuffle } from './util.js';
import { icon, progressBar, confirmDialog } from './ui.js';
import { teach, unitIntro, choose, flipRec, flipProd, shadow } from './exercises.js';
import { pickFormat } from './content.js';
import { State } from './fsrs.js';

/** Yhden tehtävän enintään laskettava aika: pitkä tauko ei ole harjoittelua. */
export const IDLE_CAP_MS = 90000;

/**
 * Harjoituksen kehys: otsikkorivi (✕ lopettaa vahvistuksen jälkeen), etenemispalkin paikka ja sisältöalue.
 * Piilottaa alavalikon, kunnes näkymä vaihtuu. Käyttävät sekä tehtäväjono että session kirjoitusvaihe.
 */
export function runnerShell(root, { title = '', onQuit } = {}) {
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
          if (ok) onQuit?.();
        },
      },
    },
    icon('close'),
  );
  clear(root).append(
    h('div', { class: 'runner' }, h('header', { class: 'runner-head' }, quitBtn, h('div', { class: 'runner-title' }, title), countEl), barHost, box),
  );
  document.body.dataset.focus = '1'; // harjoituksen aikana alavalikko piilossa; ✕ lopettaa
  return { box, barHost, countEl, quitBtn };
}

/**
 * Suorittaa tehtävät järjestyksessä.
 * tehtävä = { kind: 'intro'|'teach'|'test'|'produce'|'review'|'shadow', item, unit?, atomic?, cta? }
 * Aikaraja (budgetMs) tarkistetaan vain ei-atomisten tehtävien alussa, joten ryhmä ei katkea kesken.
 * reserveMs: uutta ei-atomista tehtävää ei aloiteta, jos sen jälkeen ei jäisi vähintään tämän verran aikaa.
 * Palauttaa { shown, graded, again, good, ms, activeMs, taught, known, speak:[pct], ended: 'complete'|'time'|'quit' }.
 */
export async function runTasks(ctx, root, tasks, { title, budgetMs = Infinity, reserveMs = 0, signal } = {}) {
  const now = () => (ctx.now ? ctx.now() : performance.now());
  const stats = { shown: 0, graded: 0, again: 0, good: 0, ms: 0, activeMs: 0, taught: 0, known: 0, speak: [], ended: 'complete' };
  const queue = tasks.map((t) => ({ ...t }));
  let total = queue.length;
  let done = 0;
  const start = now();

  const ac = new AbortController();
  signal?.addEventListener('abort', () => ac.abort(), { once: true });
  let quit;
  const quitPromise = new Promise((resolve) => (quit = resolve));
  ac.signal.addEventListener('abort', () => quit({ quit: true }), { once: true });

  const { box, barHost, countEl } = runnerShell(root, { title: title ?? '', onQuit: () => ac.abort() });

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
      if (task.kind === 'intro') {
        await unitIntro(box, task.unit, env);
        return {};
      }
      if (task.kind === 'teach') {
        return (await teach(box, item, env)) ?? {};
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
      // Ensimmäisinä kertoina ei voi valita "Helppo": muistiin juuri painettu ei ole varmasti pitkäkestoista.
      const early = !card || card.state === State.New || card.state === State.Learning || card.state === State.Relearning;
      env.maxGrade = early ? 3 : 4;
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
    if (!queue[0].atomic && now() - start + reserveMs > budgetMs) {
      stats.ended = 'time';
      break;
    }
    const task = queue.shift();
    paint();
    window.scrollTo(0, 0);
    const t1 = now();
    const res = await Promise.race([runOne(task), quitPromise]);
    const spent = now() - t1;
    stats.activeMs += Math.min(spent, IDLE_CAP_MS);
    if (res?.quit) {
      stats.ended = 'quit';
      break;
    }
    done++;
    stats.shown++;
    if (task.kind === 'teach') {
      if (res.known) {
        // "Osaan jo": ilmaus kirjataan helpoksi, eikä sille tehdä testejä tässä sessiossa.
        await ctx.srs.grade(task.item.id, 4, { mode: 'known', ms: spent });
        stats.known++;
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i].item?.id === task.item.id) {
            queue.splice(i, 1);
            total--;
          }
        }
      } else {
        stats.taught++;
      }
    }
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
  await ctx.logActivity?.(stats.activeMs);
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

/**
 * Uudet ilmaukset kolmen ryhmissä. Jokaisesta ryhmästä:
 *  1. opetus (kuuntele, lue, sano ääneen),
 *  2. testi sekoitetussa järjestyksessä (ensimmäinen arvosana ajastukselle),
 *  3. tuottaminen: suomesta englanniksi sanoen tai kirjoittaen (harjoitus, ei arvosanaa).
 * Aiheen ensimmäistä ilmausta edeltää lyhyt aiheen esittely, jos aiheesta ei ole vielä opittu mitään.
 * Vain ryhmän ensimmäinen tehtävä on ei-atominen: aikaraja voi katkaista työn ryhmien välillä, ei kesken ryhmän.
 */
export function newContentTasks(ctx, items, chunk = 3) {
  const tasks = [];
  const introduced = new Set();
  for (let i = 0; i < items.length; i += chunk) {
    const group = items.slice(i, i + chunk);
    let open = true; // ryhmän ensimmäinen tehtävä jää ei-atomiseksi
    const push = (task) => {
      tasks.push({ ...task, atomic: !open });
      open = false;
    };
    group.forEach((item, k) => {
      const unit = ctx.catalog.unitById(item.unitId);
      const unitStarted = unit && unit.items.some((it) => ctx.srs.isLearned(it.id));
      if (unit && !unitStarted && !introduced.has(unit.id)) {
        introduced.add(unit.id);
        push({ kind: 'intro', unit, item });
      }
      push({ kind: 'teach', item, cta: k === group.length - 1 ? 'Testaa itsesi' : 'Seuraava ilmaus' });
    });
    for (const item of shuffle(group)) push({ kind: 'test', item });
    for (const item of shuffle(group)) push({ kind: 'produce', item });
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
