import { h, fmtDay, dayToDate } from '../util.js';
import { summarize, MATURE_DAYS } from '../stats.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

const dm = (idx) => {
  const d = dayToDate(idx);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
};

export async function mount(root, ctx) {
  const today = ctx.srs.today();
  const cards = [...ctx.srs.cards.values()];
  const reviews = await ctx.db.getAllReviews();
  const sum = summarize(cards, reviews, today);
  const log = await ctx.db.getKv('speakLog', []);

  root.append(h('h1', {}, 'Edistyminen'));

  // Oppimiskäyrä: opittujen ilmausten kumulatiivinen määrä päivittäin (viimeiset 30 päivää).
  const first = Math.min(today - 29, ...cards.filter((c) => c.introducedDay != null).map((c) => c.introducedDay));
  const from = Math.max(first, today - 29);
  const perDay = new Map();
  let before = 0;
  for (const c of cards) {
    if (c.introducedDay == null) continue;
    if (c.introducedDay < from) before++;
    else perDay.set(c.introducedDay, (perDay.get(c.introducedDay) ?? 0) + 1);
  }
  const series = [];
  let running = before;
  for (let d = from; d <= today; d++) {
    running += perDay.get(d) ?? 0;
    series.push({ day: d, n: running });
  }
  const max = Math.max(1, ...series.map((p) => p.n));
  const W = 300;
  const H = 110;
  const x = (i) => (series.length > 1 ? (i / (series.length - 1)) * (W - 20) + 10 : W / 2);
  const y = (n) => H - 20 - (n / max) * (H - 40);
  const chart = svg(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Opittujen ilmausten määrä ${dm(from)}–${dm(today)}: nyt ${running}` },
    svg('line', { x1: 10, y1: H - 20, x2: W - 10, y2: H - 20, class: 'axis' }),
    svg('polyline', { points: series.map((p, i) => `${x(i)},${y(p.n)}`).join(' '), class: 'line', fill: 'none' }),
    svg('circle', { cx: x(series.length - 1), cy: y(running), r: 4, class: 'dot' }),
    Object.assign(svg('text', { x: 10, y: H - 4, class: 'tick' }), { textContent: dm(from) }),
    Object.assign(svg('text', { x: W - 10, y: H - 4, class: 'tick', 'text-anchor': 'end' }), { textContent: dm(today) }),
  );
  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Oppimiskäyrä'),
      h('p', { class: 'muted' }, 'Käyttöön otettujen ilmausten määrä. Ei putkia eikä rangaistuksia: vain se, mitä olet oppinut.'),
      chart,
      h('p', {}, `Yhteensä ${sum.learned} ilmausta ${ctx.catalog.items.length}:sta.`),
    ),
  );

  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Muisti'),
      h(
        'dl',
        { class: 'facts' },
        fact('Vakaita (vakaus ≥ ' + MATURE_DAYS + ' pv)', `${sum.mature}`),
        fact('Vielä nuoria', `${sum.young}`),
        fact('Muistettavissa nyt (arvio)', sum.avgRecall == null ? '–' : `${Math.round(sum.avgRecall * 100)} %`),
        fact(
          'Toteutunut säilyvyys (30 pv)',
          sum.trueRetention == null ? `– (tarvitaan vähintään 10 kertausta, nyt ${sum.trueRetentionSample})` : `${Math.round(sum.trueRetention * 100)} %`,
        ),
        fact('Unohdettuja kertoja yhteensä', `${sum.lapses}`),
      ),
      h('p', { class: 'muted' }, `Tavoite on ${Math.round(ctx.settings().retention * 100)} %. Jos toteutunut luku jää selvästi alle, nosta tavoitetta asetuksista tai kertaa useammin.`),
    ),
  );

  const maxN = Math.max(1, ...sum.last14.map((d) => d.n));
  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Viimeiset 14 päivää'),
      h(
        'div',
        { class: 'bars', role: 'img', 'aria-label': `Kertauksia päivittäin: ${sum.last14.map((d) => `${dm(d.day)} ${d.n}`).join(', ')}` },
        sum.last14.map((d) => {
          const bar = h('div', { class: `col${d.day === today ? ' today' : ''}` });
          bar.append(h('div', { class: 'fill' }));
          bar.firstChild.style.height = `${Math.round((d.n / maxN) * 100)}%`;
          return bar;
        }),
      ),
      h('p', { class: 'muted' }, `Aktiivisia päiviä 30 päivässä: ${sum.activeDays30}. Kertauksia 7 päivässä: ${sum.reviews7}.`),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Tulevat kertaukset'),
      sum.forecast.some((d) => d.n > 0)
        ? h('ul', { class: 'plain' }, sum.forecast.map((d) => h('li', {}, `${fmtDay(d.day, today)}: ${d.n}`)))
        : h('p', { class: 'muted' }, 'Ei erääntyviä kertauksia seuraavan viikon aikana.'),
    ),
  );

  if (log.length) {
    const recent = log.slice(-30);
    const avg = Math.round(recent.reduce((a, r) => a + r.pct, 0) / recent.length);
    root.append(
      h('section', { class: 'card' }, h('h2', {}, 'Puhe'), h('p', {}, `Viimeisten ${recent.length} puheharjoituksen keskimääräinen täsmäys: ${avg} %.`), h('p', { class: 'muted' }, 'Täsmäys kertoo, kuinka suuri osa tavoitesanoista tunnistettiin. Se ei ole ääntämisen arvosana.')),
    );
  }
  return {};
}

function fact(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}
