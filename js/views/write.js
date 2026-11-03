// Kirjoita: lyhyet työviestit englanniksi. Palaute tulee heti laitteella (sääntötarkistus), ilman verkkoa.
// Reitit: #/write (tehtävälista) ja #/write/<tehtävän id> (yksi tehtävä).

import { h, en, nodes } from '../util.js';
import { WRITING_TASKS } from '../../data/writing.js';
import { checkWriting, countWords, isClean, speechParts } from '../writing.js';
import { speakButton, toast, announce, confirmDialog } from '../ui.js';
import { renderFeedback, renderModelCard, verdictOf } from './write-feedback.js';

export const TASKS = WRITING_TASKS;
const BY_ID = new Map(TASKS.map((t) => [t.id, t]));

const FORMAT_LABELS = { email: 'Sähköposti', message: 'Lyhyt viesti', chat: 'Pikaviesti' };
const MAX_CHARS = 2500;
const IDLE_CAP_MS = 45000; // ajanmittauksessa yksittäinen tauko lasketaan enintään tämän verran
const DRAFT_DELAY_MS = 500;
const LOG_LIMIT = 400;

/** Tallennukset kulkevat jonossa, jotta päällekkäiset luku-muokkaus-kirjoitus-kierrokset eivät hukkaa toisiaan. */
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn).catch((e) => console.warn('Kirjoita: tallennus epäonnistui', e)));

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Lokista tehtäväkohtainen tila: yritykset ja onko tehtävä tehty (merkitty valmiiksi tai virheetön yritys). */
export function summarizeLog(log) {
  const map = new Map();
  for (const e of Array.isArray(log) ? log : []) {
    const s = map.get(e.id) ?? { attempts: 0, done: false, last: null };
    if (!e.done) s.attempts++;
    if (e.done || e.clean) s.done = true;
    s.last = e;
    map.set(e.id, s);
  }
  return map;
}

/** Seuraava tehtävä listassa: ensisijaisesti sellainen, jota ei ole vielä tehty. */
export function nextTask(current, state) {
  const i = current ? TASKS.indexOf(current) : -1;
  const order = [...TASKS.slice(i + 1), ...TASKS.slice(0, Math.max(i, 0))].filter((t) => t !== current);
  return order.find((t) => !state.get(t.id)?.done) ?? order[0] ?? null;
}

export async function mount(root, ctx, params = []) {
  await queue; // edellisen näkymän tallennukset valmiiksi ennen lukemista
  const task = params[0] ? BY_ID.get(params[0]) : null;
  return task ? mountTask(root, ctx, task) : mountList(root, ctx);
}

/* ---------- Tehtävälista ---------- */

async function mountList(root, ctx) {
  const log = await ctx.db.getKv('writeLog', []);
  const drafts = await ctx.db.getKv('writeDrafts', {});
  const state = summarizeLog(log);
  const doneCount = TASKS.filter((t) => state.get(t.id)?.done).length;
  const next = TASKS.find((t) => !state.get(t.id)?.done) ?? null;

  root.append(
    ...nodes(
      h('h1', {}, 'Kirjoita'),
      h(
        'p',
        { class: 'muted' },
        'Kirjoita lyhyt työviesti englanniksi. Saat palautteen heti: tarkistus löytää tyypillisiä virheitä, näyttää puuttuvat asiat ja antaa mallivastauksen, jonka voit kuunnella.',
      ),
      h(
        'section',
        { class: 'card hero', 'aria-labelledby': 'wl-next' },
        h('h2', { id: 'wl-next' }, next ? 'Seuraava tehtävä' : 'Kaikki tehtävät on tehty'),
        next
          ? [h('p', {}, h('strong', {}, next.title)), h('p', { class: 'muted' }, shorten(next.scenario)), h('div', { class: 'actions' }, h('a', { class: 'btn primary big', href: `#/write/${next.id}` }, 'Aloita'))]
          : h('p', {}, 'Voit palata mihin tahansa tehtävään ja yrittää kirjoittaa viestin uudelleen toisin sanoin.'),
      ),
      h('p', { class: 'muted' }, `Tehty ${doneCount} / ${TASKS.length}`),
      h(
        'nav',
        { class: 'tiles col', 'aria-label': 'Kirjoitustehtävät' },
        TASKS.map((t) => taskTile(t, state.get(t.id), Boolean(drafts[t.id]?.text), ctx)),
      ),
      h(
        'p',
        { class: 'help' },
        'Sääntötarkistus ei ole kielenopettaja: se ei löydä kaikkia virheitä (esimerkiksi puuttuvia artikkeleita) eikä arvioi tekstin sujuvuutta. Kun epäilet jotain, kysy asiaa tai tarkista lähteestä.',
      ),
    ),
  );
  return {};
}

function shorten(text, max = 130) {
  return text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')} …`;
}

function taskTile(task, st, hasDraft, ctx) {
  const unit = ctx.catalog.unitById(task.unit);
  const chips = [];
  if (st?.done) chips.push(h('span', { class: 'chip ok' }, 'Tehty'));
  else if (st?.attempts) chips.push(h('span', { class: 'chip' }, `Kesken · ${plural(st.attempts, 'yritys', 'yritystä')}`));
  if (hasDraft && !st?.done) chips.push(h('span', { class: 'chip' }, 'Luonnos tallessa'));
  return h(
    'a',
    { class: 'tile', href: `#/write/${task.id}` },
    h('strong', {}, task.title),
    h('span', { class: 'muted' }, [unit?.title, FORMAT_LABELS[task.format], `${task.words[0]}–${task.words[1]} sanaa`].filter(Boolean).join(' · ')),
    chips.length ? h('span', { class: 'chips' }, chips) : null,
  );
}

/* ---------- Yksi tehtävä ---------- */

function incomingBox(task, ctx) {
  const say = speakButton(() => speechParts([task.incoming.text]), ctx, { label: 'Kuuntele saamasi viesti' });
  return h(
    'div',
    { class: 'incoming' },
    h('div', { class: 'row-between' }, h('p', { class: 'eyebrow' }, `Saamasi viesti · ${task.incoming.from}`), say.el),
    h('div', { class: 'quote', lang: 'en-US' }, task.incoming.text),
  );
}

async function mountTask(root, ctx, task) {
  const drafts = await ctx.db.getKv('writeDrafts', {});
  const log = await ctx.db.getKv('writeLog', []);
  const state = summarizeLog(log);
  const unit = ctx.catalog.unitById(task.unit);
  const following = nextTask(task, state);

  /* --- ajanmittaus: vain aktiivinen aika, tauot katkaistaan --- */
  let last = ctx.now();
  let active = 0;
  const touch = () => {
    const t = ctx.now();
    active += Math.max(0, Math.min(t - last, IDLE_CAP_MS));
    last = t;
  };
  const flushActivity = () => {
    touch();
    const ms = active;
    active = 0;
    if (ms > 0) enqueue(() => ctx.logActivity(ms));
  };

  /* --- luonnos --- */
  let timer = null;
  let dirty = false;
  let finished = false;
  const saveDraft = () => {
    clearTimeout(timer);
    timer = null;
    if (!dirty || finished) return;
    dirty = false;
    const text = ta.value;
    enqueue(async () => {
      const all = await ctx.db.getKv('writeDrafts', {});
      if (text.trim()) all[task.id] = { text, ts: Date.now() };
      else delete all[task.id];
      await ctx.db.setKv('writeDrafts', all);
    });
  };
  const scheduleDraft = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(saveDraft, DRAFT_DELAY_MS);
  };

  /* --- rakenne --- */
  const ta = h('textarea', {
    id: 'w-text',
    class: 'text-input area',
    rows: 9,
    lang: 'en-US',
    autocapitalize: 'sentences',
    autocomplete: 'off',
    maxlength: MAX_CHARS,
    'aria-describedby': 'w-count',
  });
  ta.value = drafts[task.id]?.text ?? '';
  const counter = h('p', { id: 'w-count', class: 'counter' });
  const out = h('div', { id: 'w-result' });
  let checked = null; // viimeksi tarkistettu teksti

  const updateCount = () => {
    const n = countWords(ta.value);
    const [min, max] = task.words;
    const fit = n >= min && n <= max;
    counter.className = `counter ${fit ? 'ok' : 'muted'}`;
    counter.textContent = `${plural(n, 'sana', 'sanaa')} · sopiva pituus ${min}–${max}`;
  };
  updateCount();

  const focusText = () => {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.scrollIntoView({ block: 'center' });
  };

  const logAttempt = (result, extra = {}) =>
    enqueue(async () => {
      const entries = await ctx.db.getKv('writeLog', []);
      entries.push({
        ts: Date.now(),
        id: task.id,
        words: result.words,
        errors: result.counts.errors,
        tips: result.counts.tips,
        pointsHit: result.counts.pointsHit,
        pointsTotal: result.counts.pointsTotal,
        phrasesUsed: result.counts.phrasesUsed,
        phrasesTotal: result.counts.phrasesTotal,
        clean: isClean(result),
        ai: false,
        ...extra,
      });
      await ctx.db.setKv('writeLog', entries.slice(-LOG_LIMIT));
    });

  const finish = async (result) => {
    finished = true;
    clearTimeout(timer);
    flushActivity();
    logAttempt(result, { done: true });
    enqueue(async () => {
      const all = await ctx.db.getKv('writeDrafts', {});
      delete all[task.id];
      await ctx.db.setKv('writeDrafts', all);
    });
    toast('Tehtävä on merkitty tehdyksi.');
    ctx.nav('write');
  };

  const showFeedback = (card) => {
    out.replaceChildren(card);
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'start' });
  };

  const runCheck = () => {
    const text = ta.value;
    if (countWords(text) < 3) {
      toast('Kirjoita ensin vastaus.');
      announce('Kirjoita ensin vastaus.');
      ta.focus();
      return;
    }
    touch();
    saveDraft();
    const result = checkWriting(task, text);
    checked = text;
    showFeedback(
      renderFeedback(task, text, result, {
        ctx,
        onRevise: focusText,
        onDone: () => finish(result),
        nextHref: following ? `#/write/${following.id}` : null,
      }),
    );
    announce(verdictOf(result).text);
    logAttempt(result);
  };

  const showModel = () => {
    touch();
    showFeedback(renderModelCard(task, ctx, { onWrite: focusText }));
  };

  const markStale = () => {
    const card = out.firstElementChild;
    if (!card || checked == null || !card.classList.contains('feedback')) return;
    const banner = card.querySelector(':scope > .stale');
    if (ta.value === checked) {
      banner?.remove();
    } else if (!banner) {
      card.prepend(h('p', { class: 'banner warn stale', role: 'status' }, 'Teksti on muuttunut palautteen jälkeen. Paina ”Tarkista” uudelleen.'));
    }
  };

  ta.addEventListener('input', () => {
    touch();
    updateCount();
    scheduleDraft();
    markStale();
  });
  ta.addEventListener('blur', saveDraft); // kentästä poistuminen tallentaa heti (esim. sovelluksen vaihto puhelimessa)

  const clearText = async () => {
    if (!ta.value.trim()) return;
    const ok = await confirmDialog({ title: 'Tyhjennetäänkö teksti?', body: 'Kirjoittamasi teksti poistetaan tästä tehtävästä.', confirmText: 'Tyhjennä', danger: true });
    if (!ok) return;
    ta.value = '';
    updateCount();
    scheduleDraft();
    markStale();
    focusText();
  };

  const activeTouch = () => touch();
  const onHide = () => {
    if (document.visibilityState === 'hidden') {
      saveDraft();
      flushActivity();
    } else {
      last = ctx.now(); // piilossa oloaikaa ei lasketa
    }
  };
  root.addEventListener('pointerdown', activeTouch);
  root.addEventListener('keydown', activeTouch);
  window.addEventListener('scroll', activeTouch, { passive: true });
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  root.append(
    ...nodes(
      h('a', { class: 'btn link back', href: '#/write' }, '‹ Kaikki tehtävät'),
      h('h1', {}, task.title),
      h('p', { class: 'muted' }, [unit?.title, FORMAT_LABELS[task.format]].filter(Boolean).join(' · ')),
      h('section', { class: 'card', 'aria-labelledby': 'w-scn' }, h('h2', { id: 'w-scn' }, 'Tilanne'), h('p', {}, task.scenario), task.incoming ? incomingBox(task, ctx) : null),
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'w-todo' },
        h('h2', { id: 'w-todo' }, 'Mitä viestissä pitää olla'),
        h('ul', { class: 'plain todo' }, task.points.map((p) => h('li', {}, p.fi))),
        h('h3', {}, 'Kokeile käyttää näitä ilmauksia'),
        h(
          'ul',
          { class: 'plain todo' },
          task.use.map((u) => {
            const item = ctx.catalog.byId.get(typeof u === 'string' ? u : u.id);
            return item ? h('li', {}, en(item.en), h('span', { class: 'muted block' }, item.fi)) : null;
          }),
        ),
      ),
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'w-ans' },
        h('h2', { id: 'w-ans' }, 'Vastauksesi'),
        h('div', { class: 'field' }, h('label', { for: 'w-text' }, `Kirjoita viesti englanniksi (${FORMAT_LABELS[task.format].toLowerCase()})`), ta, counter),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn primary big', type: 'button', id: 'w-check', on: { click: runCheck } }, 'Tarkista'),
          h('button', { class: 'btn link', type: 'button', id: 'w-model', on: { click: showModel } }, 'Näytä mallivastaus ilman tarkistusta'),
          h('button', { class: 'btn link', type: 'button', id: 'w-clear', on: { click: clearText } }, 'Tyhjennä teksti'),
        ),
      ),
      out,
    ),
  );

  return {
    destroy() {
      saveDraft();
      flushActivity();
      root.removeEventListener('pointerdown', activeTouch);
      root.removeEventListener('keydown', activeTouch);
      window.removeEventListener('scroll', activeTouch);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    },
  };
}
