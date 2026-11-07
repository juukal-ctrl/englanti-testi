// Asennus ja vianetsintä: kertoo, onko sovellus asennettuna ja mitä Chrome tarjoaa, ohjeet asennetun sovelluksen
// löytämiseen ja korjaukseen sekä välimuistin korjausnappi.

import { h, clear } from '../util.js';
import { confirmDialog, toast } from '../ui.js';
import { repairApp } from '../repair.js';
import { AUDIO_CACHE } from '../clips.js';

/** Käynnissä asennettuna sovelluksena (ei selainvälilehdessä)? */
export function isStandalone(win = globalThis) {
  try {
    return Boolean(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone === true);
  } catch {
    return false;
  }
}

/** true = Chrome löytää asennetun sovelluksen, false = ei löydä, null = selain ei kerro. */
export async function installedRelatedApp(nav = globalThis.navigator) {
  try {
    if (typeof nav?.getInstalledRelatedApps !== 'function') return null;
    const apps = await nav.getInstalledRelatedApps();
    return apps.some((a) => a.platform === 'webapp');
  } catch {
    return null;
  }
}

async function shellFileCount() {
  try {
    const key = (await caches.keys()).find((k) => k.startsWith('englanti-') && k !== AUDIO_CACHE);
    if (!key) return 0;
    return (await (await caches.open(key)).keys()).length;
  } catch {
    return null;
  }
}

export async function mount(root, ctx) {
  const standalone = isStandalone();
  const facts = h('dl', { class: 'facts', id: 'install-facts' });
  const actions = h('div', { class: 'actions row wrap', id: 'install-actions' });

  const fact = (label, value, id) => h('div', {}, h('dt', {}, label), h('dd', { id }, value));

  const paint = (related, files) => {
    const install = ctx.install ?? { event: null, installed: false };
    let installState;
    if (standalone) installState = 'Tämä on jo asennettu sovellus.';
    else if (install.event) installState = 'Asennus on mahdollinen: paina "Asenna sovellus".';
    else if (install.installed || related === true) installState = 'Chrome kertoo, että sovellus on asennettu tälle laitteelle.';
    else if (related === false) installState = 'Chrome ei löydä asennettua sovellusta. Asenna se Chromen valikosta: ⋮ → Asenna sovellus.';
    else installState = 'Chrome ei tarjoa asennusta juuri nyt. Kokeile valikosta: ⋮ → Asenna sovellus.';
    clear(facts).append(
      fact('Käynnissä nyt', standalone ? 'asennettuna sovelluksena' : 'selaimessa (Chromen välilehti)', 'f-mode'),
      fact('Asennus', installState, 'f-install'),
      fact('Toimii ilman verkkoa', navigator.serviceWorker?.controller ? `kyllä (${files ?? '?'} tiedostoa tallessa)` : 'ei vielä: avaa sovellus uudelleen', 'f-offline'),
      fact('Pysyvä tallennus', ctx.persisted ? 'kyllä' : 'ei merkitty pysyväksi', 'f-persist'),
      fact('Versio', ctx.version, 'f-version'),
    );
    clear(actions);
    if (!standalone && install.event) {
      actions.append(
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            id: 'install-btn',
            on: {
              click: async () => {
                const ev = ctx.install.event;
                ctx.install.event = null; // tapahtuman voi käyttää vain kerran
                try {
                  await ev.prompt();
                  const choice = await ev.userChoice;
                  toast(choice?.outcome === 'accepted' ? 'Asennus alkoi. Etsi sovellus sovellusluettelosta nimellä "Englanti".' : 'Asennus peruttiin.', { ms: 7000 });
                } catch {
                  toast('Asennus ei käynnistynyt. Kokeile Chromen valikkoa: ⋮ → Asenna sovellus.', { ms: 7000 });
                }
                paint(related, files);
              },
            },
          },
          'Asenna sovellus',
        ),
      );
    }
  };

  const repairBtn = h('button', { class: 'btn', type: 'button', id: 'repair-btn' }, 'Korjaa välimuisti ja käynnistä uudelleen');
  repairBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Korjataanko välimuisti?',
      body: 'Sovelluksen tiedostot haetaan uudelleen verkosta ja sovellus latautuu uudelleen. Oppimisdataasi ja asetuksiasi ei poisteta.',
      confirmText: 'Korjaa',
    });
    if (!ok) return;
    repairBtn.disabled = true;
    const res = await repairApp();
    toast(`Välimuisti tyhjennetty (${res.removedCaches}). Käynnistetään uudelleen.`, { ms: 3000 });
    setTimeout(() => location.reload(), ctx.repairDelayMs ?? 800);
  });

  root.append(
    h('h1', {}, 'Asennus ja vianetsintä'),
    h('p', { class: 'muted' }, 'Sovellus toimii sellaisenaan Chromen välilehdessä. Asentamalla sen saat oman kuvakkeen ja koko ruudun näkymän.'),
    h('section', { class: 'card', 'aria-labelledby': 'inst-h' }, h('h2', { id: 'inst-h' }, 'Tilanne'), facts, actions),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'find-h' },
      h('h2', { id: 'find-h' }, 'Näin löydät asennetun sovelluksen'),
      h(
        'ol',
        { class: 'steps-list' },
        h('li', {}, 'Pyyhkäise aloitusnäytöllä ylös ja kirjoita hakukenttään "Englanti". Kuvakkeen kulmassa on pieni Chrome-merkki.'),
        h('li', {}, 'Paina löytynyttä kuvaketta pitkään ja vedä se aloitusnäytölle.'),
        h('li', {}, 'Voit etsiä sen myös kohdasta Asetukset → Sovellukset → Näytä kaikki sovellukset.'),
      ),
    ),
    h(
      'section',
      { class: 'card', 'aria-labelledby': 'fix-h' },
      h('h2', { id: 'fix-h' }, 'Jos sovellus ei avaudu tai sitä ei löydy'),
      h(
        'ol',
        { class: 'steps-list' },
        h('li', {}, 'Lataa ensin varmuuskopio (', h('a', { href: '#/settings' }, 'Asetukset'), '). Seuraavat vaiheet voivat poistaa selaimen tallentamat tiedot.'),
        h('li', {}, 'Paina asennetun sovelluksen kuvaketta pitkään → Sovelluksen tiedot → Poista asennus.'),
        h('li', {}, 'Avaa tämä sivu Chromessa → ⋮ → Asenna sovellus.'),
        h('li', {}, 'Jos Chrome väittää yhä, että sovellus on asennettu, kirjoita Chromen osoiteriville ', h('code', {}, 'chrome://webapks'), ' ja katso, onko listalla "Englanti".'),
        h('li', {}, 'Pikakuvake toimii aina: ⋮ → Lisää aloitusnäyttöön → luo pikakuvake. Se avaa sovelluksen Chromen välilehdessä.'),
      ),
      h('p', { class: 'help' }, 'Jos sovellus käynnistyy mutta toimii oudosti, korjaus hakee sovelluksen tiedostot uudelleen. Se ei poista oppimisdataa.'),
      h('div', { class: 'actions' }, repairBtn),
    ),
  );

  paint(null, null); // heti näkyviin, tarkennus perässä
  const [related, files] = await Promise.all([standalone ? null : installedRelatedApp(), shellFileCount()]);
  if (facts.isConnected) paint(related, files);
  return {};
}
