import { h } from '../util.js';

export function mount(root, ctx) {
  root.append(
    h('h1', {}, 'Lisää'),
    h(
      'nav',
      { class: 'tiles col', 'aria-label': 'Lisää' },
      link('#/vocab', 'Sanasto', 'Kaikki ilmaukset, haku ja äänet'),
      link('#/progress', 'Edistyminen', 'Mitä olet oppinut ja mitä on tulossa'),
      link('#/settings', 'Asetukset', 'Ääni, ulkoasu, varmuuskopio'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Tietoja'),
      h('p', {}, `Englanti ${ctx.version}. Henkilökohtainen, ei-kaupallinen amerikanenglannin harjoitussovellus. Sisältö ja koodi on tehty Clauden avulla.`),
      h(
        'p',
        { class: 'muted' },
        'Oppimisdata pysyy tällä laitteella. Tekoälypalaute (tulossa) lähettää vain kirjoittamasi tekstin valitsemallesi palveluntarjoajalle omalla avaimellasi.',
      ),
      h('p', {}, h('a', { href: 'laitetesti/' }, 'Laitetesti'), ' · ', h('a', { href: 'https://github.com/juukal-ctrl/englanti-testi', target: '_blank', rel: 'noopener noreferrer' }, 'Lähdekoodi (GitHub)')),
      h('p', { class: 'muted' }, 'Kuvakkeet: Material Design Icons, Apache-lisenssi 2.0.'),
      h('p', { class: 'muted' }, 'Englanninkieliset äänet: Kokoro-82M (ääni af_heart), Apache-lisenssi 2.0. Äänet on tehty etukäteen, eikä malli toimi laitteellasi.'),
    ),
  );
  return {};
}

function link(href, title, sub) {
  return h('a', { class: 'tile', href }, h('strong', {}, title), h('span', { class: 'muted' }, sub));
}
