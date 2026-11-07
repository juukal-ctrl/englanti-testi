// Shadowing-oppitunti: toinen, vapaaehtoinen oppitunti päivän session lisäksi. Lyhyt englanninkielinen kappale toistetaan
// vaiheittain: kuuntelu, ymmärtäminen, mukana lukeminen, perässä toistaminen tekstin kanssa ja ilman, valinnainen nauhoitus
// ja oma arvio. Arvio ajastaa kappaleen paluun (js/shadow.js). Sovellus ei arvioi puhettasi, koska samanaikaista puhetta
// ei voi tunnistaa luotettavasti.

import { h, clear, clamp, fmtMinutes, fmtDay, sleep, en } from '../util.js';
import { announce, toast, progressBar, icon } from '../ui.js';
import { speakSequence, stopSpeaking, canSpeak } from '../speech.js';
import { loadManifest, warmClips } from '../clips.js';
import { speakable } from '../speakable.js';
import { runnerShell, IDLE_CAP_MS } from '../runner.js';
import { createProgress } from '../steps.js';
import { startRecording, recordingSupported, recorderErrorText } from '../recorder.js';
import { SHADOW_PASSAGES } from '../../data/shadow.js';
import { planLesson, nextState, cleanShadowLog, summarizeShadow, nextDueDay, buildMoves, phaseLabels, nextLabelFor, dueText, SPEEDS, SPEED_IDS, STAGE_LABELS } from '../shadow.js';

const PAUSE_MS = 350; // tauko lauseiden välillä
const RECORD_TAIL_MS = 1200; // nauhoitus jatkuu hetken mallin jälkeen, jotta viimeinen sana ehtii mukaan

const STAGE_HELP = {
  listen: 'Kuuntele kappale ilman tekstiä. Yritä ymmärtää, mistä siinä on kyse.',
  along: 'Lue teksti ääneen samaan tahtiin äänen kanssa. Pienet virheet eivät haittaa: jatka mukana.',
  text: 'Toista äänen perässä tekstin kanssa: puhu samaan aikaan, korkeintaan sekunnin jäljessä. Jäljittele rytmiä ja painotuksia.',
  blind: 'Sama ilman tekstiä. Jos jäät jälkeen, tule mukaan seuraavasta sanasta äläkä pysähdy.',
};

const RATING_TEXT = { hard: 'Hankalaa', ok: 'Kohtalaisesti', good: 'Sujui hyvin' };

/** Soittaa tekstit asetusten äänellä valitulla nopeudella. Nopeus kertoo asetusten puhenopeuteen. */
function speakWith(ctx, texts, speedId, { onPart } = {}) {
  const s = ctx.settings();
  const rate = clamp(s.rate * (SPEEDS[speedId]?.factor ?? 1), 0.5, 1.6);
  return speakSequence(texts, { rate, userRate: rate, voiceURI: s.voiceURI, slow: false, pauseMs: PAUSE_MS, onPart });
}

function warm(ctx, passage) {
  try {
    if (passage && !ctx.settings().voiceURI) warmClips(passage.lines.map(speakable));
  } catch {
    /* ennakkohaku on vain nopeutus */
  }
}

function stat(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}

export async function mount(root, ctx) {
  const ac = new AbortController();
  let destroyed = false;
  const s = ctx.settings();
  const now = () => (ctx.now ? ctx.now() : performance.now());
  const today = ctx.srs.today();
  const totalMs = s.shadowMinutes * 60000;

  await loadManifest();
  if (!canSpeak(s.voiceURI)) {
    root.append(
      h('a', { class: 'btn link back', href: '#/today' }, '‹ Takaisin'),
      h('h1', {}, 'Shadowing'),
      h('p', {}, 'Tällä selaimella ei ole puhesynteesiä eikä valmiita äänileikkeitä, joten shadowing ei ole käytettävissä.'),
    );
    return {};
  }

  const log = cleanShadowLog(await ctx.db.getKv('shadowLog', {}));
  const recordOn = s.shadowRecord && recordingSupported();
  const plan = planLesson({ log, today, totalMs, record: recordOn });

  let t0 = 0;
  const elapsed = () => now() - t0;
  const result = { passages: 0, news: 0, reviews: 0, plays: 0, activeMs: 0, quit: false };
  let shell = null;
  let progress = null;
  const box = () => shell.box;

  /* ---------- Aloitusnäkymä ---------- */

  const minutes = (ms) => Math.max(1, Math.round(ms / 60000));
  const planMs = plan.reduce((sum, it) => sum + it.estMs, 0);
  root.append(
    h('a', { class: 'btn link back', href: '#/today' }, '‹ Takaisin'),
    h('h1', {}, 'Shadowing'),
    h('p', { class: 'muted' }, `Toinen oppitunti päivän session lisäksi · noin ${minutes(planMs)} min`),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'sh-plan-h' },
      h('h2', { id: 'sh-plan-h' }, 'Tänään'),
      h(
        'ol',
        { class: 'plain plan', 'aria-label': 'Oppitunnin kappaleet' },
        plan.map((it) => h('li', {}, `${it.kind === 'new' ? 'Uusi' : 'Kertaus'}: `, en(it.passage.title), ` (noin ${minutes(it.estMs)} min)`)),
      ),
    ),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'sh-tips-h' },
      h('h2', { id: 'sh-tips-h' }, 'Ennen kuin aloitat'),
      h(
        'ul',
        { class: 'plain plan' },
        h('li', {}, recordOn ? 'Käytä kuulokkeita, jos mahdollista: kuulet mallin selvästi, ja nauhoitus poimii vain äänesi.' : 'Käytä kuulokkeita, jos mahdollista: kuulet mallin selvästi ja voit puhua sen kanssa häiriöttä.'),
        h('li', {}, 'Puhu ääneen samaan aikaan mallin kanssa. Jos jäät jälkeen, tule mukaan seuraavasta sanasta.'),
        h('li', {}, 'Virheet kuuluvat asiaan. Tarkoitus on jäljitellä rytmiä, painotuksia ja sävelkulkua, ei olla täydellinen.'),
      ),
    ),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary big', id: 'shadow-start', type: 'button', on: { click: () => start() } }, 'Aloita')),
  );

  /* ---------- Oppitunti ---------- */

  async function start() {
    if (destroyed || shell) return;
    stopSpeaking();
    t0 = now();
    progress = createProgress({ phases: phaseLabels(plan), unit: 'Kappale', units: 'Kappaleet', total: totalMs, elapsed });
    shell = runnerShell(root, { title: 'Shadowing', onQuit: () => ac.abort(), progress });
    for (let i = 0; i < plan.length; i++) {
      if (ac.signal.aborted) break;
      if (i > 0 && elapsed() > totalMs) break; // aika on täynnä: loput kappaleet jäävät seuraavaan kertaan
      progress.start(String(i));
      shell.refresh();
      const res = await runPassage(plan[i], i);
      if (res.quit) {
        result.quit = true;
        break;
      }
      progress.finish(String(i));
    }
    if (!destroyed) stopSpeaking(); // jos näkymä jo vaihtui, seuraava näkymä voi ehtiä aloittaa oman äänensä
    await finish();
  }

  async function finish() {
    const ms = elapsed();
    if (result.passages > 0) {
      // Tallennetaan myös, jos näkymä ehti vaihtua: valmiit kappaleet ja harjoitusaika kuuluvat päivän tilastoihin.
      await ctx.db.setKv('lastShadow', { day: today, ts: Date.now(), ms, passages: result.passages, plays: result.plays });
      await ctx.logActivity(result.activeMs);
    }
    if (destroyed) return;
    if (result.quit) {
      ctx.nav('today');
      return;
    }
    renderSummary(ms);
  }

  async function runPassage(item, idx) {
    const moves = buildMoves(item.stages);
    const env = { signal: ac.signal, speed: null, passes: 0 };
    warm(ctx, item.passage);
    warm(ctx, plan[idx + 1]?.passage);
    let rating = null;
    for (let m = 0; m < moves.length; m++) {
      if (ac.signal.aborted) return { quit: true };
      const move = moves[m];
      const stageNo = item.stages.indexOf(move.stage) + 1;
      shell.countEl.textContent = `Vaihe ${stageNo} / ${item.stages.length}`;
      clear(shell.barHost).append(progressBar(m, moves.length, 'Kappaleen eteneminen'));
      shell.refresh();
      window.scrollTo(0, 0);
      const stageText = `${STAGE_LABELS[move.stage.id]}${move.kind === 'pass' && move.of > 1 ? `, kierros ${move.n} / ${move.of}` : ''}`;
      if (m === 0) {
        const pos = progress.position();
        announce(`Kappale ${pos.n} / ${pos.of}: ${pos.label}. ${stageText}`); // korvaa pelkän kappalevaihdon ilmoituksen
      } else {
        announce(stageText);
      }
      const view = { item, move, env, nextLabel: nextLabelFor(move, moves[m + 1]) };
      const t1 = now();
      let res;
      if (move.kind === 'read') res = await readScreen(view);
      else if (move.kind === 'record') res = await recordScreen(view);
      else if (move.kind === 'rate') res = await rateScreen(view);
      else res = await passScreen(view);
      result.activeMs += Math.min(now() - t1, IDLE_CAP_MS);
      if (res.quit) return { quit: true };
      if (move.kind === 'rate') rating = res.rating;
    }
    // Arvio tallennetaan heti, jotta kappaleen tulos säilyy, vaikka oppitunti keskeytyisi seuraavan kappaleen aikana.
    log[item.passage.id] = nextState(log[item.passage.id], rating, today, env.passes);
    await ctx.db.setKv('shadowLog', log);
    result.passages++;
    result.plays += env.passes;
    if (item.kind === 'new') result.news++;
    else result.reviews++;
    return { quit: false };
  }

  /* ---------- Yhteiset osat ---------- */

  const head = ({ item, move }, { round = true } = {}) => [
    h('p', { class: 'eyebrow' }, `${item.kind === 'new' ? 'Uusi kappale' : 'Kertaus'} · ${item.passage.topic}`),
    en(item.passage.title, 'p', 'shadow-title'),
    h('h2', { class: 'stage-title' }, STAGE_LABELS[move.stage.id], round && move.kind === 'pass' && move.of > 1 ? h('span', { class: 'round' }, ` kierros ${move.n} / ${move.of}`) : null),
  ];

  /** Nopeuden valinta: painikeryhmä, jossa yksi on valittuna. Valinta säilyy koko kappaleen ajan (env.speed). */
  function speedControl(env, stage, locked) {
    const current = () => env.speed ?? stage.speed ?? 'normal';
    const buttons = SPEED_IDS.map((id) =>
      h(
        'button',
        {
          type: 'button',
          class: 'seg-btn',
          'data-speed': id,
          on: {
            click: () => {
              if (locked()) return;
              env.speed = id;
              update();
            },
          },
        },
        SPEEDS[id].label,
      ),
    );
    const update = () => {
      for (const b of buttons) {
        const on = b.dataset.speed === current();
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('on', on);
        b.disabled = locked();
      }
    };
    update();
    return { el: h('div', { class: 'seg', role: 'group', 'aria-label': 'Soittonopeus' }, buttons), update, speed: current };
  }

  /** Odottaa, että ratkaisu kutsutaan (resolve), tai että oppitunti keskeytetään. */
  function waitFor(env, setup) {
    return new Promise((resolve) => {
      if (env.signal.aborted) return resolve({ quit: true });
      env.signal.addEventListener('abort', () => resolve({ quit: true }), { once: true });
      setup(resolve);
    });
  }

  /* ---------- Kierros: kuuntele tai toista perässä ---------- */

  function passScreen(view) {
    const { item, move, env, nextLabel } = view;
    const { passage } = item;
    const { stage } = move;
    return waitFor(env, (resolve) => {
      let state = 'idle'; // idle | playing | finished
      let token = 0;
      let showText = Boolean(stage.text);
      const lineEls = passage.lines.map((line) => h('p', { class: 'line', lang: 'en-US' }, line));
      const lines = h('div', { class: 'lines', id: 'shadow-lines' }, lineEls);
      const hiddenNote = h('p', { class: 'hidden-note muted', id: 'shadow-hidden' }, 'Teksti on piilossa. Kuuntele ja toista ilman sitä.');
      const dots = h(
        'div',
        { class: 'pass-dots', role: 'img', 'aria-label': `Kierros ${move.n} / ${move.of}`, hidden: move.of < 2 },
        Array.from({ length: move.of }, (_, i) => h('span', { class: `dot${i + 1 < move.n ? ' done' : i + 1 === move.n ? ' now' : ''}` })),
      );
      const speed = speedControl(env, stage, () => state === 'playing');
      const primary = h('button', { class: 'btn primary big', id: 'shadow-primary', type: 'button' });
      const again = h('button', { class: 'btn', id: 'shadow-again', type: 'button' }, stage.id === 'listen' ? 'Kuuntele uudelleen' : 'Toista kierros uudelleen');
      const peek = h('button', { class: 'btn', id: 'shadow-peek', type: 'button' });

      const paint = () => {
        primary.textContent = state === 'idle' ? 'Aloita kierros' : state === 'playing' ? 'Pysäytä' : nextLabel;
        primary.classList.toggle('playing', state === 'playing');
        again.hidden = state !== 'finished';
        lines.hidden = !showText;
        hiddenNote.hidden = showText;
        peek.hidden = Boolean(stage.text);
        peek.textContent = showText ? 'Piilota teksti' : 'Näytä teksti';
        peek.setAttribute('aria-pressed', String(showText));
        speed.update();
      };
      const mark = (i) => lineEls.forEach((el, k) => el.classList.toggle('now', k === i));

      const play = async () => {
        const before = state;
        state = 'playing';
        paint();
        const my = ++token;
        const res = await speakWith(ctx, passage.lines, speed.speed(), { onPart: (i) => my === token && mark(i) });
        if (my !== token) return; // uusi toisto tai poistuttu
        mark(-1);
        if (res.ok && res.kind === 'end') {
          env.passes++;
          state = 'finished';
          announce('Kierros valmis');
        } else {
          state = before === 'finished' ? 'finished' : 'idle';
          if (!res.ok && res.kind !== 'unsupported') toast('Ääntä ei saatu toistettua. Kokeile asetuksista toista ääntä.');
        }
        paint();
      };

      primary.addEventListener('click', () => {
        if (state === 'idle') play();
        else if (state === 'playing') stopSpeaking();
        else {
          token++;
          stopSpeaking();
          resolve({ next: true });
        }
      });
      again.addEventListener('click', () => state === 'finished' && play());
      peek.addEventListener('click', () => {
        showText = !showText;
        paint();
      });

      clear(box()).append(
        ...head(view),
        h('p', { class: 'stage-help' }, STAGE_HELP[stage.id]),
        dots,
        lines,
        hiddenNote,
        speed.el,
        h('div', { class: 'actions' }, primary, h('div', { class: 'btn-row' }, peek, again)),
      );
      paint();
      primary.focus({ preventScroll: true });
    });
  }

  /* ---------- Lue ja ymmärrä ---------- */

  function readScreen(view) {
    const { item, move, env, nextLabel } = view;
    const { passage } = item;
    return waitFor(env, (resolve) => {
      let token = 0;
      let playing = null; // 'all' | rivin numero | null
      const rows = passage.lines.map((line, i) => {
        const btn = h('button', { class: 'line-btn', type: 'button', lang: 'en-US', 'aria-label': `Kuuntele: ${line}` }, icon('speaker', 18), h('span', {}, line));
        btn.addEventListener('click', () => playLines([line], i));
        return { li: h('li', { class: 'read-line' }, btn, h('span', { class: 'fi' }, passage.fi[i] ?? '')) };
      });
      const mark = (i) => rows.forEach((r, k) => r.li.classList.toggle('now', k === i));
      const speed = speedControl(env, move.stage, () => false);
      const listenAll = h('button', { class: 'btn', id: 'shadow-listen-all', type: 'button' }, 'Kuuntele koko kappale');
      const primary = h('button', { class: 'btn primary big', id: 'shadow-primary', type: 'button' }, nextLabel);

      const stopAny = () => {
        token++;
        stopSpeaking();
        playing = null;
        mark(-1);
        listenAll.textContent = 'Kuuntele koko kappale';
      };
      async function playLines(texts, only) {
        const target = only === undefined ? 'all' : only;
        const toggleOff = playing === target;
        if (playing !== null) stopAny();
        if (toggleOff) return;
        const my = ++token;
        playing = target;
        if (target === 'all') listenAll.textContent = 'Pysäytä';
        const res = await speakWith(ctx, texts, speed.speed(), { onPart: (k) => my === token && mark(target === 'all' ? k : target) });
        if (my !== token) return;
        playing = null;
        mark(-1);
        listenAll.textContent = 'Kuuntele koko kappale';
        if (!res.ok && res.kind !== 'unsupported') toast('Ääntä ei saatu toistettua. Kokeile asetuksista toista ääntä.');
      }
      listenAll.addEventListener('click', () => playLines(passage.lines));
      primary.addEventListener('click', () => {
        stopAny();
        resolve({ next: true });
      });

      clear(box()).append(
        ...head(view),
        h('p', { class: 'stage-help' }, 'Lue teksti ja suomennos. Napauta lausetta, niin kuulet sen. Jatka, kun ymmärrät kappaleen.'),
        speed.el,
        h('ol', { class: 'read-lines', id: 'shadow-read' }, rows.map((r) => r.li)),
        h(
          'section',
          { class: 'kw', 'aria-labelledby': 'sh-kw-h' },
          h('h3', { id: 'sh-kw-h' }, 'Avainsanat'),
          h('dl', { class: 'facts' }, passage.words.map(([e, f]) => h('div', {}, h('dt', { lang: 'en-US' }, e), h('dd', {}, f)))),
        ),
        passage.tip ? h('aside', { class: 'note' }, h('strong', {}, 'Vinkki'), h('p', {}, passage.tip)) : null,
        h('div', { class: 'actions' }, primary, h('div', { class: 'btn-row' }, listenAll)),
      );
      primary.focus({ preventScroll: true });
    });
  }

  /* ---------- Nauhoitus ja vertailu ---------- */

  function recordScreen(view) {
    const { item, env, nextLabel } = view;
    const { passage } = item;
    return waitFor(env, (resolve) => {
      let phase = 'intro'; // intro | recording | review
      let rec = null; // käynnissä oleva nauhoitus
      let take = null; // { url, ms }: valmis nauhoitus (vain muistissa)
      let audio = null; // oman nauhoituksen toisto
      let which = null; // vertailussa soiva: 'model' | 'take' | null
      let session = 0; // kasvaa, kun nauhoitus tai toisto vaihtuu tai poistutaan: vanhat jatkot lopettavat
      const status = h('p', { class: 'attempt-status', role: 'status', id: 'shadow-rec-status' });
      const body = h('div', { class: 'rec-body' });
      const actions = h('div', { class: 'actions' });

      const stopCompare = () => {
        session++;
        which = null;
        stopSpeaking();
        if (audio) {
          audio.pause();
          audio = null;
        }
      };
      const cleanup = () => {
        session++;
        rec?.cancel();
        rec = null;
        stopCompare();
        if (take) {
          URL.revokeObjectURL(take.url);
          take = null;
        }
      };
      const leave = (value) => {
        cleanup();
        resolve(value);
      };
      env.signal.addEventListener('abort', cleanup, { once: true });

      const btn = (id, label, onClick, cls = 'btn') => h('button', { class: cls, id, type: 'button', on: { click: onClick } }, label);

      async function startTake() {
        stopCompare();
        const my = ++session;
        phase = 'recording';
        status.textContent = 'Käynnistetään mikrofonia…';
        paint();
        const r = await startRecording();
        if (my !== session) {
          r.cancel?.();
          return;
        }
        if (!r.ok) {
          phase = 'intro';
          status.textContent = recorderErrorText(r.error);
          paint();
          return;
        }
        rec = r;
        status.textContent = 'Nauhoitus käynnissä. Puhu mukana.';
        announce('Nauhoitus käynnissä');
        await speakWith(ctx, passage.lines, 'normal');
        if (my !== session) return;
        await sleep(RECORD_TAIL_MS);
        if (my !== session) return;
        await endTake();
      }

      async function endTake() {
        const r = rec;
        if (!r) return;
        rec = null;
        const my = ++session; // keskeyttää mallin ja tauon jatkon
        stopSpeaking();
        const out = await r.stop();
        if (my !== session) return;
        if (!out) {
          phase = 'intro';
          status.textContent = 'Nauhoitus ei onnistunut. Voit yrittää uudelleen tai jatkaa ohittamalla sen.';
        } else {
          env.passes++; // nauhoitettu kierros on myös shadowing-kierros
          if (take) URL.revokeObjectURL(take.url);
          take = { ms: out.ms, url: URL.createObjectURL(out.blob) };
          phase = 'review';
          status.textContent = 'Nauhoitus valmis. Kuuntele mallia ja omaa toistoasi vuorotellen.';
          announce('Nauhoitus valmis');
        }
        paint();
      }

      async function compare(target) {
        const same = which === target;
        stopCompare();
        if (same) return paint();
        which = target;
        const my = ++session;
        paint();
        if (target === 'take') {
          const a = new Audio(take.url);
          audio = a;
          const over = () => {
            if (my === session && audio === a) {
              which = null;
              audio = null;
              paint();
            }
          };
          a.addEventListener('ended', over, { once: true });
          a.play().catch(() => {
            toast('Nauhoitusta ei saatu toistettua.');
            over();
          });
        } else {
          await speakWith(ctx, passage.lines, 'normal');
          if (my === session && which === 'model') {
            which = null;
            paint();
          }
        }
      }

      function paint() {
        clear(body);
        clear(actions);
        if (phase === 'intro') {
          body.append(
            h(
              'p',
              { class: 'stage-help' },
              'Nauhoita yksi kierros: kuulet mallin ja puhut mukana. Sen jälkeen voit kuunnella itsesi ja mallin vuorotellen. Kuulokkeet auttavat. Nauhoitus pysyy vain muistissa eikä lähde laitteelta.',
            ),
          );
          actions.append(btn('shadow-rec-start', 'Nauhoita kierros', startTake, 'btn primary big'), btn('shadow-rec-skip', 'Ohita nauhoitus', () => leave({ next: true }), 'btn link'));
        } else if (phase === 'recording') {
          body.append(h('p', { class: 'stage-help' }, 'Puhu mallin kanssa. Nauhoitus päättyy itsestään, tai voit lopettaa sen itse.'));
          actions.append(btn('shadow-rec-stop', 'Lopeta nauhoitus', () => endTake(), 'btn primary big'));
        } else {
          body.append(h('p', { class: 'stage-help' }, 'Kuuntele vuorotellen. Vertaa rytmiä, painotuksia ja sitä, missä jäit jälkeen.'));
          actions.append(
            h(
              'div',
              { class: 'btn-row' },
              btn('shadow-cmp-model', which === 'model' ? 'Pysäytä' : 'Kuuntele malli', () => compare('model')),
              btn('shadow-cmp-take', which === 'take' ? 'Pysäytä' : 'Kuuntele omasi', () => compare('take')),
            ),
            btn('shadow-rec-again', 'Nauhoita uudelleen', startTake),
            btn('shadow-rec-next', nextLabel, () => leave({ next: true }), 'btn primary big'),
          );
        }
      }

      clear(box()).append(...head(view, { round: false }), body, status, actions);
      paint();
      actions.querySelector('button')?.focus({ preventScroll: true });
    });
  }

  /* ---------- Arvio ---------- */

  function rateScreen(view) {
    const { item, env } = view;
    return waitFor(env, (resolve) => {
      const buttons = ['hard', 'ok', 'good'].map((r, i) => {
        const days = nextState(log[item.passage.id], r, today).due - today;
        return h(
          'button',
          { class: `btn grade g${i + 1}`, type: 'button', 'data-rating': r, on: { click: () => resolve({ rating: r }) } },
          RATING_TEXT[r],
          h('span', { class: 'g-int' }, dueText(days)),
        );
      });
      clear(box()).append(
        ...head(view, { round: false }),
        h(
          'p',
          { class: 'stage-help' },
          log[item.passage.id]
            ? 'Arvioi rehellisesti: arvio ratkaisee, milloin kappale palaa. Hankala kappale tulee pian uudelleen, sujuva vasta myöhemmin.'
            : 'Arvioi rehellisesti. Uusi kappale palaa joka tapauksessa huomenna; arvio ratkaisee, kuinka pian se tulee sen jälkeen.',
        ),
        h('div', { class: 'grades three', id: 'shadow-rate' }, buttons),
      );
    });
  }

  /* ---------- Yhteenveto ---------- */

  function renderSummary(ms) {
    document.body.dataset.focus = '';
    const seen = summarizeShadow(log, SHADOW_PASSAGES, today);
    const next = nextDueDay(log, today);
    clear(root).append(
      h(
        'div',
        { class: 'summary' },
        h('h1', {}, 'Shadowing valmis'),
        h('p', { class: 'muted' }, `Kesto ${fmtMinutes(ms)}`),
        h(
          'dl',
          { class: 'facts big' },
          stat('Kappaleita', `${result.passages}`),
          result.news ? stat('Uusia', `${result.news}`) : null,
          result.reviews ? stat('Kertauksia', `${result.reviews}`) : null,
          stat('Kierroksia yhteensä', `${result.plays}`),
          stat('Harjoiteltuja kappaleita', `${seen.seen} / ${seen.total}`),
          stat('Seuraava kertaus', next == null ? '–' : fmtDay(next, today)),
        ),
        plan.length > result.passages ? h('p', { class: 'muted' }, 'Aika tuli täyteen, joten loput kappaleet jäivät seuraavaan kertaan.') : null,
        h('div', { class: 'actions' }, h('a', { class: 'btn primary big', href: '#/today' }, 'Valmis'), h('a', { class: 'btn', href: '#/shadow' }, `${s.shadowMinutes} min lisää`)),
      ),
    );
  }

  return {
    destroy() {
      destroyed = true;
      ac.abort();
      stopSpeaking();
    },
  };
}
