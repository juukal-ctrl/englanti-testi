import { h } from '../util.js';
import { nextNewItems } from '../content.js';
import { dayTotals, summarize } from '../stats.js';
import { fmtDay, fmtMinutes, dayToDate } from '../util.js';
import { WRITING_TASKS } from '../../data/writing.js';
import { summarizeLog } from '../plan.js';
import { writingFor } from './session.js';

const WEEKDAYS = ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai'];

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export async function mount(root, ctx) {
  const { srs } = ctx;
  const s = ctx.settings();
  const today = srs.today();
  const date = dayToDate(today);
  const reviews = await ctx.db.getAllReviews();
  const totals = dayTotals(reviews, today);
  const meta = await ctx.db.getKv('meta', {});
  const last = await ctx.db.getKv('lastSession', null);
  const activity = await ctx.db.getKv('activity', {});
  const writeState = summarizeLog(await ctx.db.getKv('writeLog', []));
  const doneToday = last?.day === today;

  const due = srs.due(today).length;
  const allowedNew = Math.max(0, s.newMax - srs.introducedToday(today));
  const newAvailable = nextNewItems((id) => srs.isLearned(id), allowedNew).length;
  const sum = summarize([...srs.cards.values()], reviews, today);
  const writing = doneToday ? null : await writingFor(ctx, s.sessionMinutes * 60000);

  root.append(h('h1', {}, 'Tänään'), h('p', { class: 'muted date' }, `${WEEKDAYS[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`));

  if (!meta.onboarded) {
    const card = h(
      'section',
      { class: 'card intro', 'aria-labelledby': 'intro-h' },
      h('h2', { id: 'intro-h' }, 'Näin tämä toimii'),
      h(
        'ul',
        { class: 'plain' },
        h('li', {}, 'Päivän sessio kestää noin 15 minuuttia ja sisältää kaiken: kertausta, uusia ilmauksia, välillä kirjoitusta ja puhetta.'),
        h('li', {}, 'Ilmaukset palaavat juuri ennen kuin ehdit unohtaa ne (FSRS-ajastus).'),
        h('li', {}, 'Kaikki tallentuu vain tähän laitteeseen. Ei tiliä, ei seurantaa.'),
      ),
      h(
        'p',
        { class: 'muted' },
        'Puheentunnistus käyttää selaimen omaa tunnistusta. Kun laite on verkossa, Chrome voi lähettää äänen tunnistuspalveluunsa. Voit käyttää kirjoittamista mikrofonin sijaan asetuksista.',
      ),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          on: {
            click: async () => {
              card.remove(); // heti pois näkyvistä, tallennus perässä
              await ctx.db.setKv('meta', { ...meta, onboarded: true });
            },
          },
        },
        'Selvä',
      ),
    );
    root.append(card);
  }

  // Suunnitelma kertoo vaiheet siinä järjestyksessä, jossa sessio ne tekee.
  const plan = [];
  if (due > 0) plan.push(`Kertausta: ${plural(Math.min(due, 60), 'ilmaus', 'ilmausta')}`);
  if (newAvailable > 0) plan.push(`Uutta: enintään ${plural(newAvailable, 'ilmaus', 'ilmausta')}, sen mukaan kuin aikaa riittää`);
  if (writing) plan.push(`Kirjoitus: ${writing.task.title} (noin ${Math.round(writing.ms / 60000)} min)`);
  plan.push('Puhetta: loppuajan, 3–8 lausetta');

  const hero = h('section', { class: 'card hero', 'aria-labelledby': 'plan-h' });
  hero.append(h('h2', { id: 'plan-h' }, doneToday ? 'Päivän sessio on tehty' : `Päivän sessio · ${s.sessionMinutes} min`));
  if (doneToday) {
    hero.append(
      h('p', {}, `Harjoittelit tänään ${fmtMinutes(activity[today] ?? 0)}. Kertauksia ja testejä: ${totals.reviews}.`),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary big', href: '#/session/extra' }, `${s.sessionMinutes} min lisää`)),
    );
  } else {
    hero.append(
      h('ol', { class: 'plain plan', 'aria-label': 'Päivän vaiheet' }, plan.map((p) => h('li', {}, p))),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary big', href: '#/session' }, 'Aloita')),
    );
  }
  root.append(hero);

  // Päivän sessio kattaa kaiken; erilliset harjoitukset ovat vain vapaaehtoista lisäharjoitusta.
  root.append(
    h(
      'details',
      { class: 'model extras', id: 'extras' },
      h('summary', {}, 'Lisäharjoitusta (vapaaehtoinen)'),
      h('p', { class: 'help' }, 'Päivän sessio sisältää jo kertauksen, uudet ilmaukset, kirjoituksen ja puheen. Nämä ovat lisiä, jos haluat harjoitella vielä.'),
      h(
        'div',
        { class: 'tiles' },
        tile('#/review', 'Pelkkä kertaus', due ? `${due} erääntynyttä` : 'ei erääntyneitä'),
        tile('#/speak', 'Puhu', 'kuuntele ja sano perässä'),
        tile('#/write', 'Kirjoita', 'valitse tehtävä itse'),
        tile('#/lessons', 'Valitse aihe', `${ctx.catalog.units.length} aihetta`),
      ),
    ),
  );

  const upcoming = sum.forecast.slice(1).find((d) => d.n > 0);
  const writtenCount = WRITING_TASKS.filter((t) => writeState.get(t.id)?.done).length;
  root.append(
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'now-h' },
      h('h2', { id: 'now-h' }, 'Tilanne'),
      h(
        'dl',
        { class: 'facts' },
        fact('Opittuja ilmauksia', `${sum.learned} / ${ctx.catalog.items.length}`),
        fact('Muistettavissa nyt (arvio)', sum.avgRecall == null ? '–' : `${Math.round(sum.avgRecall * 100)} %`),
        fact('Kirjoitustehtäviä tehty', `${writtenCount} / ${WRITING_TASKS.length}`),
        fact('Seuraava kertaus', upcoming ? `${fmtDay(upcoming.day, today)} (${upcoming.n})` : due ? 'nyt' : '–'),
      ),
    ),
  );
  return {};
}

function tile(href, title, sub) {
  return h('a', { class: 'tile', href }, h('strong', {}, title), h('span', { class: 'muted' }, sub));
}

function fact(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}
