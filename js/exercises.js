// Harjoitustyypit. Jokainen funktio piirtää itsensä `box`-elementtiin ja palauttaa Promisen,
// joka ratkeaa, kun oppija on valmis. env = { ctx, signal, preview, cta }.

import { h, en, clear, shuffle } from './util.js';
import { icon, speakButton, noteBox, reportLink, wordResult, announce, toast } from './ui.js';
import { BLANK } from './content.js';
import { compareToPhrase, suggestRating } from './match.js';
import { formatInterval } from './fsrs.js';
import { listen, asrSupported, asrErrorText, stopSpeaking } from './speech.js';

const GRADES = [
  [1, 'Uudelleen'],
  [2, 'Vaikea'],
  [3, 'Hyvä'],
  [4, 'Helppo'],
];

const eyebrow = (text) => h('p', { class: 'eyebrow' }, text);

function gradeButtons(preview, pick, suggested = null) {
  const wrap = h('div', { class: 'grades', role: 'group', 'aria-label': 'Miten sujui?' });
  for (const [g, label] of GRADES) {
    const b = h(
      'button',
      { class: `btn grade g${g}${suggested === g ? ' suggested' : ''}`, type: 'button', 'data-grade': g, on: { click: () => pick(g) } },
      h('span', { class: 'g-label' }, label),
      h('span', { class: 'g-int' }, formatInterval(preview[g].interval)),
    );
    if (suggested === g) b.append(h('span', { class: 'sr' }, ' (ehdotus)'));
    wrap.append(b);
  }
  return wrap;
}

/** Uusi ilmaus: näytetään merkitys, esimerkki ja huomautus. Ei arvosanaa. */
export function teach(box, item, env) {
  const { ctx } = env;
  return new Promise((resolve) => {
    const say = speakButton(() => item.say, ctx, { label: 'Kuuntele ilmaus' });
    const exBtn = speakButton(() => item.ex, ctx, { label: 'Kuuntele esimerkkilause' });
    const go = h(
      'button',
      {
        class: 'btn primary big',
        type: 'button',
        on: {
          click: () => {
            stopSpeaking();
            resolve({});
          },
        },
      },
      env.cta ?? 'Selvä',
    );
    clear(box).append(
      eyebrow('Uusi ilmaus'),
      h('div', { class: 'phrase-row' }, en(item.en, 'h2', 'phrase'), say.el),
      h('p', { class: 'meaning' }, item.fi),
      h('div', { class: 'example' }, en(item.ex, 'p'), exBtn.el),
      noteBox(item),
      h('div', { class: 'actions' }, go),
      h('p', { class: 'small-links' }, reportLink(item, ctx.version)),
    );
    go.focus({ preventScroll: true });
    if (ctx.settings().autoplay) say.play({ auto: true });
  });
}

/** Aukkotehtävä valintapainikkeilla. Oikein = Hyvä, väärin = Uudelleen. */
export function choose(box, item, env) {
  const { ctx, signal } = env;
  const t0 = performance.now();
  const { text, answer, distractors } = item.cloze;
  const options = shuffle([answer, ...distractors]);
  return new Promise((resolve) => {
    const [before, after] = text.split(BLANK);
    const blank = h('span', { class: 'blank' }, '＿＿＿');
    const sentence = h('p', { class: 'sentence', lang: 'en-US' }, before, blank, after);
    const sentenceRow = h('div', { class: 'sentence-row' }, sentence);
    const feedback = h('div', { class: 'feedback' });
    const afterBox = h('div', { class: 'actions' });
    let locked = false;

    const pick = (choice, index) => {
      if (locked) return;
      locked = true;
      const ms = performance.now() - t0;
      const correct = choice === answer;
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (options[j] === answer) b.classList.add('correct');
        else if (j === index) b.classList.add('wrong');
      });
      blank.textContent = answer;
      blank.className = `blank filled ${correct ? 'ok' : 'bad'}`;
      const filled = text.replace(BLANK, () => answer);
      const say = speakButton(() => filled, ctx, { label: 'Kuuntele lause' });
      feedback.append(
        h('p', { class: `verdict ${correct ? 'ok' : 'bad'}`, role: 'status' }, correct ? 'Oikein.' : ['Ei aivan. Oikea vastaus: ', en(answer, 'strong')]),
        h('p', { class: 'meaning' }, item.fi),
        noteBox(item),
      );
      const cont = h(
        'button',
        {
          class: 'btn primary big',
          type: 'button',
          on: {
            click: () => {
              stopSpeaking();
              resolve({ rating: correct ? 3 : 1, correct, ms });
            },
          },
        },
        'Jatka',
      );
      sentenceRow.append(say.el);
      afterBox.append(cont);
      cont.focus({ preventScroll: true });
      announce(correct ? 'Oikein' : `Väärin. Oikea vastaus: ${answer}`);
      if (ctx.settings().autoplay) say.play({ auto: true });
    };

    const buttons = options.map((o, i) =>
      h(
        'button',
        { class: 'btn option', type: 'button', on: { click: () => pick(o, i) } },
        h('span', { class: 'key', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { lang: 'en-US' }, o),
      ),
    );
    document.addEventListener(
      'keydown',
      (e) => {
        if (locked || e.ctrlKey || e.metaKey || e.altKey) return;
        const i = Number(e.key) - 1;
        if (Number.isInteger(i) && options[i] !== undefined) pick(options[i], i);
      },
      { signal },
    );
    clear(box).append(
      eyebrow('Täydennä lause'),
      h('p', { class: 'hint' }, item.fi),
      sentenceRow,
      h('div', { class: 'options', role: 'group', 'aria-label': 'Vaihtoehdot' }, buttons),
      feedback,
      afterBox,
    );
  });
}

function answerBlock(item, ctx) {
  const say = speakButton(() => item.say, ctx, { label: 'Kuuntele ilmaus' });
  const exBtn = speakButton(() => item.ex, ctx, { label: 'Kuuntele esimerkkilause' });
  return {
    say,
    el: h(
      'div',
      { class: 'answer' },
      h('div', { class: 'phrase-row' }, en(item.en, 'h2', 'phrase'), say.el),
      h('div', { class: 'example' }, en(item.ex, 'p'), exBtn.el),
      noteBox(item),
      h('p', { class: 'small-links' }, reportLink(item, ctx.version)),
    ),
  };
}

/** Englanti → merkitys. Oppija arvioi itse. */
export function flipRec(box, item, env) {
  const { ctx, signal, preview } = env;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const say = speakButton(() => item.say, ctx, { label: 'Kuuntele ilmaus' });
    const actions = h('div', { class: 'actions' });
    const stage = h('div', { class: 'stage' });
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      const ms = performance.now() - t0;
      const exBtn = speakButton(() => item.ex, ctx, { label: 'Kuuntele esimerkkilause' });
      stage.append(
        h('p', { class: 'meaning big' }, item.fi),
        h('div', { class: 'example' }, en(item.ex, 'p'), exBtn.el),
        noteBox(item),
        h('p', { class: 'small-links' }, reportLink(item, ctx.version)),
      );
      clear(actions).append(
        gradeButtons(preview, (g) => {
          stopSpeaking();
          resolve({ rating: g, ms });
        }),
      );
      announce(item.fi);
    };
    const show = h('button', { class: 'btn primary big', type: 'button', on: { click: reveal } }, 'Näytä vastaus');
    actions.append(show);
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          reveal();
        } else if (revealed && /^[1-4]$/.test(e.key)) {
          document.querySelector(`.grades [data-grade="${e.key}"]`)?.click();
        }
      },
      { signal },
    );
    clear(box).append(eyebrow('Muista merkitys'), h('div', { class: 'phrase-row' }, en(item.en, 'h2', 'phrase'), say.el), stage, actions);
    show.focus({ preventScroll: true });
    if (ctx.settings().autoplay) say.play({ auto: true });
  });
}

/** Suomi → englanti. Oppija sanoo tai kirjoittaa vastauksen, jonka jälkeen arvioi itse. */
export function flipProd(box, item, env) {
  const { ctx, signal, preview } = env;
  const t0 = performance.now();
  const unit = ctx.catalog.unitById(item.unitId);
  const wantsMic = ctx.settings().speakMode === 'mic';
  const micOk = wantsMic && asrSupported();
  return new Promise((resolve) => {
    let mode = micOk ? 'mic' : 'type';
    let attempt = null;
    let revealed = false;
    let session = null;

    const status = h('p', { class: 'attempt-status', role: 'status', 'aria-live': 'polite' });
    const attemptBox = h('div', { class: 'attempt' });
    const stage = h('div', { class: 'stage' });
    const actions = h('div', { class: 'actions' });

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      session?.abort();
      const ms = performance.now() - t0;
      const block = answerBlock(item, ctx);
      clear(attemptBox);
      clear(status);
      stage.append(block.el);
      if (attempt) {
        stage.prepend(
          h('div', { class: 'result' }, h('p', { class: 'result-line' }, `Täsmäys ${attempt.matchPct} %`), wordResult(attempt)),
        );
      }
      if (env.practice) {
        // Harjoittelutila: ei arvosanaa, vain tulos ja jatko.
        clear(actions).append(
          h(
            'button',
            {
              class: 'btn primary big',
              type: 'button',
              on: {
                click: () => {
                  stopSpeaking();
                  resolve({ pct: attempt ? attempt.matchPct : null });
                },
              },
            },
            'Seuraava',
          ),
        );
      } else {
        clear(actions).append(
          gradeButtons(
            preview,
            (g) => {
              stopSpeaking();
              resolve({ rating: g, ms, attempt: attempt ? { pct: attempt.matchPct, mode } : null });
            },
            attempt ? suggestRating(attempt.matchPct) : null,
          ),
        );
      }
      announce(`Vastaus: ${item.en}`);
      if (ctx.settings().autoplay) block.say.play({ auto: true });
    };

    const handleText = (text) => {
      const cleaned = String(text ?? '').trim();
      if (!cleaned) {
        status.textContent = 'Et sanonut mitään. Yritä uudelleen tai näytä vastaus.';
        return;
      }
      attempt = compareToPhrase(item.en, cleaned);
      reveal();
    };

    const renderMic = () => {
      clear(attemptBox);
      let listening = false;
      const micBtn = h('button', { class: 'btn mic big', type: 'button' }, icon('mic'), h('span', {}, 'Sano ääneen'));
      micBtn.addEventListener('click', async () => {
        if (listening) {
          session?.abort();
          return;
        }
        stopSpeaking();
        listening = true;
        micBtn.classList.add('listening');
        micBtn.lastChild.textContent = 'Kuuntelen… (napauta lopettaaksesi)';
        status.textContent = '';
        session = listen({ onInterim: (t) => (status.textContent = `Kuulin: ${t}`) });
        const res = await session.promise;
        listening = false;
        micBtn.classList.remove('listening');
        micBtn.lastChild.textContent = 'Sano ääneen';
        if (revealed) return;
        if (res.error) {
          status.textContent = asrErrorText(res.error);
          if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported', 'unsupported'].includes(res.error)) {
            mode = 'type';
            renderType();
          }
          return;
        }
        handleText(res.transcript);
      });
      const switchBtn = h('button', { class: 'btn link', type: 'button', on: { click: () => { session?.abort(); mode = 'type'; renderType(); } } }, 'Kirjoita sen sijaan');
      attemptBox.append(micBtn, switchBtn);
    };

    const renderType = () => {
      clear(attemptBox);
      const input = h('input', {
        type: 'text',
        id: `type-${item.id}`,
        lang: 'en',
        autocomplete: 'off',
        autocapitalize: 'none',
        spellcheck: false,
        enterkeyhint: 'done',
        class: 'text-input',
      });
      const check = h('button', { class: 'btn primary big', type: 'button', on: { click: () => handleText(input.value) } }, 'Tarkista');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleText(input.value);
        }
      });
      attemptBox.append(h('label', { for: input.id, class: 'label' }, 'Kirjoita englanniksi'), input, check);
      if (wantsMic && !asrSupported()) status.textContent = 'Tällä selaimella ei ole puheentunnistusta, joten vastaus kirjoitetaan.';
      if (asrSupported() && wantsMic) {
        attemptBox.append(h('button', { class: 'btn link', type: 'button', on: { click: () => { mode = 'mic'; renderMic(); } } }, 'Sano ääneen sen sijaan'));
      }
    };

    const showBtn = h('button', { class: 'btn', type: 'button', on: { click: reveal } }, 'Näytä vastaus');
    actions.append(showBtn);
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (revealed && /^[1-4]$/.test(e.key)) document.querySelector(`.grades [data-grade="${e.key}"]`)?.click();
      },
      { signal },
    );

    clear(box).append(
      eyebrow(mode === 'mic' ? 'Sano englanniksi' : 'Kirjoita englanniksi'),
      h('p', { class: 'meaning big' }, item.fi),
      h('p', { class: 'chip' }, unit ? unit.title : ''),
      attemptBox,
      status,
      stage,
      actions,
    );
    if (mode === 'mic') renderMic();
    else renderType();
  });
}

/** Puheharjoitus ilman arvosanaa: kuuntele malli ja toista. Palauttaa { pct } tai { skipped }. */
export function shadow(box, item, env) {
  const { ctx } = env;
  return new Promise((resolve) => {
    const say = speakButton(() => item.say, ctx, { label: 'Kuuntele malli' });
    const status = h('p', { class: 'attempt-status', role: 'status', 'aria-live': 'polite' });
    const resultBox = h('div', { class: 'result' });
    const actions = h('div', { class: 'actions' });
    let session = null;
    let listening = false;
    let best = null;

    const finish = (skipped) => {
      session?.abort();
      stopSpeaking();
      resolve(skipped ? { skipped: true } : { pct: best });
    };

    const micOk = asrSupported() && ctx.settings().speakMode === 'mic';
    const micBtn = h('button', { class: 'btn mic big', type: 'button' }, icon('mic'), h('span', {}, 'Toista perässä'));
    micBtn.addEventListener('click', async () => {
      if (listening) {
        session?.abort();
        return;
      }
      stopSpeaking();
      listening = true;
      micBtn.classList.add('listening');
      micBtn.lastChild.textContent = 'Kuuntelen… (napauta lopettaaksesi)';
      session = listen({ onInterim: (t) => (status.textContent = `Kuulin: ${t}`) });
      const res = await session.promise;
      listening = false;
      micBtn.classList.remove('listening');
      micBtn.lastChild.textContent = 'Toista perässä';
      if (res.error) {
        status.textContent = asrErrorText(res.error);
        return;
      }
      const cmp = compareToPhrase(item.say, res.transcript);
      best = Math.max(best ?? 0, cmp.matchPct);
      status.textContent = '';
      clear(resultBox).append(h('p', { class: 'result-line' }, `Täsmäys ${cmp.matchPct} %`), wordResult(cmp));
      announce(`Täsmäys ${cmp.matchPct} prosenttia`);
    });

    const next = h('button', { class: 'btn primary big', type: 'button', on: { click: () => finish(false) } }, 'Seuraava');
    const skip = h('button', { class: 'btn link', type: 'button', on: { click: () => finish(true) } }, 'Ohita');
    actions.append(next, skip);

    clear(box).append(
      eyebrow('Kuuntele ja toista'),
      h('div', { class: 'phrase-row' }, en(item.say, 'h2', 'phrase'), say.el),
      h('p', { class: 'meaning' }, item.fi),
      micOk ? micBtn : h('p', { class: 'muted' }, 'Mikrofoni ei ole käytössä: kuuntele malli ja sano lause ääneen itse.'),
      status,
      resultBox,
      actions,
    );
    if (ctx.settings().autoplay) say.play({ auto: true });
  });
}

export { toast };
