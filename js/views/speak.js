import { h, nodes } from '../util.js';
import { runTasks, shadowTasks } from '../runner.js';
import { renderSummary } from './session.js';
import { asrSupported, ttsSupported } from '../speech.js';

export async function mount(root, ctx) {
  const ac = new AbortController();
  const log = await ctx.db.getKv('speakLog', []);
  const recent = log.slice(-30);
  const avg = recent.length ? Math.round(recent.reduce((a, r) => a + r.pct, 0) / recent.length) : null;
  const s = ctx.settings();
  const micOn = asrSupported() && s.speakMode === 'mic';

  const start = async (kind, title) => {
    const t0 = performance.now();
    const tasks = shadowTasks(ctx, 5, kind);
    const st = await runTasks(ctx, root, tasks, { title, signal: ac.signal });
    if (ac.signal.aborted) return;
    if (st.ended === 'quit') return ctx.nav('speak');
    await renderSummary(root, ctx, { reviewed: 0, again: 0, learned: 0, speak: st.speak }, performance.now() - t0, { title: 'Puheharjoitus valmis' });
  };

  root.append(
    ...nodes(
    h('h1', {}, 'Puhu'),
    h(
      'p',
      { class: 'muted' },
      micOn
        ? 'Mikrofoni on käytössä. Pisteet kertovat, kuinka suuri osa sanoistasi tunnistettiin. Tunnistus on apuväline, ei tuomari: jos se kuulee väärin, arvioi itse.'
        : asrSupported()
          ? 'Mikrofoni on pois käytöstä. Voit kirjoittaa vastaukset tai ottaa mikrofonin käyttöön asetuksista.'
          : 'Tällä selaimella ei ole puheentunnistusta. Voit kuunnella mallit ja kirjoittaa vastaukset.',
    ),
    ttsSupported() ? null : h('p', { class: 'banner warn' }, 'Tällä selaimella ei ole puhesynteesiä, joten mallilauseita ei voi kuunnella.'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Kuuntele ja toista'),
      h('p', {}, 'Kuuntele malli ja toista se. Hyvä tapa harjoitella rytmiä ja painotusta.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', on: { click: () => start('shadow', 'Kuuntele ja toista') } }, 'Aloita (5 lausetta)')),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Sano englanniksi'),
      h('p', {}, 'Näet suomenkielisen merkityksen ja sanot ilmauksen englanniksi muistista.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', on: { click: () => start('produce', 'Sano englanniksi') } }, 'Aloita (5 ilmausta)')),
    ),
    avg == null ? null : h('p', { class: 'muted' }, `Viimeisten ${recent.length} yrityksen keskimääräinen täsmäys: ${avg} %`),
    ),
  );
  return { destroy: () => ac.abort() };
}
