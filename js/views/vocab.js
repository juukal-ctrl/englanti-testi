import { h, clear, fmtDay } from '../util.js';
import { en, speakButton, noteBox, reportLink } from '../ui.js';
import { State } from '../fsrs.js';

export function mount(root, ctx) {
  const today = ctx.srs.today();
  const search = h('input', { type: 'search', id: 'q', class: 'text-input', lang: 'fi', autocomplete: 'off', placeholder: 'Hae englanniksi tai suomeksi' });
  const filter = h(
    'select',
    { id: 'f', class: 'text-input' },
    h('option', { value: 'all' }, 'Kaikki'),
    h('option', { value: 'new' }, 'Ei vielä opitut'),
    h('option', { value: 'learned' }, 'Opitut'),
    h('option', { value: 'due' }, 'Erääntyneet'),
  );
  const count = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const list = h('ul', { class: 'plain vocab' });

  const status = (item) => {
    const c = ctx.srs.card(item.id);
    if (!c || c.state === State.New) return 'uusi';
    if (c.dueDay != null && c.dueDay <= today) return 'erääntynyt';
    return `kertaus ${fmtDay(c.dueDay, today)}`;
  };

  const render = () => {
    const q = search.value.trim().toLocaleLowerCase('fi');
    const f = filter.value;
    const items = ctx.catalog.items.filter((it) => {
      const learned = ctx.srs.isLearned(it.id);
      const c = ctx.srs.card(it.id);
      if (f === 'new' && learned) return false;
      if (f === 'learned' && !learned) return false;
      if (f === 'due' && !(learned && c.dueDay != null && c.dueDay <= today)) return false;
      if (!q) return true;
      return `${it.en} ${it.fi} ${it.ex}`.toLocaleLowerCase('fi').includes(q);
    });
    count.textContent = `${items.length} ilmausta`;
    clear(list);
    for (const it of items) {
      const say = speakButton(() => it.say, ctx, { label: `Kuuntele: ${it.en}` });
      list.append(
        h(
          'li',
          {},
          h(
            'details',
            { class: 'vocab-item' },
            h('summary', {}, en(it.en, 'span', 'phrase-s'), h('span', { class: `chip ${ctx.srs.isLearned(it.id) ? 'ok' : ''}` }, status(it))),
            h('p', { class: 'meaning' }, it.fi),
            h('div', { class: 'example' }, en(it.ex, 'p'), say.el),
            noteBox(it),
            h('p', { class: 'small-links' }, reportLink(it, ctx.version)),
          ),
        ),
      );
    }
  };
  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  root.append(
    h('h1', {}, 'Sanasto'),
    h('div', { class: 'field' }, h('label', { for: 'q' }, 'Haku'), search),
    h('div', { class: 'field' }, h('label', { for: 'f' }, 'Näytä'), filter),
    count,
    list,
  );
  render();
  return {};
}
