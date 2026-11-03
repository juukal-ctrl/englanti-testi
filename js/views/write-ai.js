// Kirjoita: valinnainen tekoälypalaute. Paneeli on palautekortin sisällä ja pyytää palautteen vasta painikkeesta.
//
// Tekoälyn vastaus näytetään vain tässä näkymässä: sitä ei tallenneta eikä kirjata kirjoituslokiin.

import { h, en, nodes } from '../util.js';
import { announce } from '../ui.js';
import { requestFeedback, PROVIDER_LABEL, CATEGORY_FI } from '../ai.js';
import { probeText } from '../writing.js';
import { highlighted } from './write-feedback.js';

const normalize = (s) => probeText(String(s ?? '')).replace(/\s+/g, ' ').trim();

function issueItem(it, n) {
  return h(
    'li',
    { class: 'ai', id: `ai-issue-${n + 1}` },
    h('p', { class: 'quote-line' }, `${n + 1}. `, en(`”${it.quote}”`), it.fix ? [' → ', h('span', { class: 'fix', lang: 'en-US' }, `”${it.fix}”`)] : null),
    h('p', {}, it.fi),
    h('span', { class: 'chip' }, `Tekoäly · ${CATEGORY_FI[it.cat] ?? it.cat}`),
  );
}

/**
 * Luo paneelin. text on tarkistettu teksti (korostukset kohdistuvat siihen).
 * Palauttaa { el, destroy }; destroy keskeyttää käynnissä olevan pyynnön.
 */
export function createAiPanel({ ctx, task, text }) {
  let ctl = null;
  let destroyed = false;

  const heading = h('h3', { id: 'ai-h', tabindex: -1 }, 'Tekoälypalaute');
  const body = h('div', { class: 'ai-body' });
  const el = h('div', { class: 'ai-panel', id: 'w-ai-panel', role: 'group', 'aria-labelledby': 'ai-h' }, heading, body);
  const show = (...kids) => body.replaceChildren(...nodes(...kids));

  const showReady = async () => {
    const s = ctx.settings();
    const key = await ctx.aiKeys.get(s.aiProvider);
    if (destroyed) return;
    if (!key) {
      return show(
        h('p', { class: 'muted' }, 'Sääntötarkistuksen lisäksi voit pyytää tekoälyn arvion esimerkiksi artikkeleista, sananvalinnasta ja sävystä. Se toimii omalla API-avaimellasi, jonka lisäät asetuksissa.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn', id: 'w-ai-setup', href: '#/settings/ai' }, 'Ota käyttöön asetuksista')),
      );
    }
    const label = PROVIDER_LABEL[s.aiProvider] ?? s.aiProvider;
    show(
      h('p', { class: 'muted' }, `Tekoäly lukee viestisi ja selittää korjausehdotukset suomeksi. Teksti ja tehtävän kuvaus lähetetään selaimestasi palvelulle ${label}, malli ${s.aiModel}.`),
      h(
        'p',
        { class: 'help' },
        `Käytä vain keksittyä tekstiä: älä lähetä oikeita asiakas- tai henkilötietoja. ${
          s.aiProvider === 'gemini' ? 'Maksuton Gemini-taso voi käyttää tekstejä Googlen tuotekehitykseen.' : 'Käyttö laskutetaan Anthropic-tililtäsi.'
        }`,
      ),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'w-ai-ask', on: { click: ask } }, 'Pyydä tekoälypalaute')),
    );
  };

  const cancel = () => {
    ctl?.abort();
    ctl = null;
    announce('Pyyntö peruttiin.');
    showReady();
  };

  const showLoading = (label, model) => {
    const cancelBtn = h('button', { class: 'btn', type: 'button', id: 'w-ai-cancel', on: { click: cancel } }, 'Peruuta');
    show(
      h('p', { class: 'ai-wait', role: 'status' }, `Pyydetään palautetta palvelulta ${label} (${model}). Odota hetki.`),
      h('div', { class: 'actions' }, cancelBtn),
    );
    announce('Pyydetään tekoälypalautetta.');
    cancelBtn.focus({ preventScroll: true });
  };

  const showError = (error) => {
    const toSettings = ['key', 'auth', 'model', 'model-name'].includes(error.kind);
    show(
      h('p', { class: 'banner warn', role: 'alert' }, error.message),
      error.detail ? h('details', { class: 'tech' }, h('summary', {}, 'Tekniset tiedot'), h('p', { class: 'help' }, error.detail)) : null,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', id: 'w-ai-retry', on: { click: ask } }, 'Yritä uudelleen'),
        toSettings ? h('a', { class: 'btn link', id: 'w-ai-settings', href: '#/settings/ai' }, 'Avaa asetukset') : null,
      ),
    );
    heading.focus({ preventScroll: true });
  };

  const showDone = ({ feedback: fb, meta }) => {
    const n = fb.issues.length;
    const dropped = fb.dropped.notInText + fb.dropped.malformed;
    const secs = Number.isFinite(meta.ms) ? `, ${(meta.ms / 1000).toFixed(1).replace('.', ',')} s` : '';
    const showCorrected = fb.corrected && normalize(fb.corrected) !== normalize(text);
    show(
      h('p', { class: 'help' }, 'Tekoäly voi erehtyä ja ehdottaa myös turhia muutoksia. Käytä palautetta apuna ja arvioi ehdotukset itse. Palautetta ei tallenneta.'),
      n
        ? [highlighted(text, fb.issues), h('ol', { class: 'issues' }, fb.issues.map(issueItem))]
        : h('p', { class: 'verdict ok' }, 'Tekoäly ei löytänyt yksittäisiä korjattavia kohtia.'),
      showCorrected
        ? h('details', { class: 'model', id: 'w-ai-corrected' }, h('summary', {}, 'Korjattu versio'), h('div', { class: 'quote', lang: 'en-US' }, fb.corrected))
        : null,
      fb.tip ? h('aside', { class: 'note' }, h('strong', {}, 'Vinkki'), h('p', {}, fb.tip)) : null,
      dropped
        ? h('p', { class: 'help' }, dropped === 1 ? 'Yksi tekoälyn ehdottama huomio jätettiin pois, koska sitä ei voitu kohdistaa tekstiisi.' : `${dropped} tekoälyn ehdottamaa huomiota jätettiin pois, koska niitä ei voitu kohdistaa tekstiisi.`)
        : null,
      h('p', { class: 'help' }, `Palvelu: ${PROVIDER_LABEL[meta.provider] ?? meta.provider}, malli ${meta.model}${secs}.`),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'w-ai-again', on: { click: ask } }, 'Pyydä uudelleen')),
    );
    announce(n ? `Tekoälypalaute valmis: ${n} ${n === 1 ? 'huomio' : 'huomiota'}.` : 'Tekoälypalaute valmis: ei korjattavaa.');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start' });
  };

  async function ask() {
    const s = ctx.settings();
    const { aiProvider: provider, aiModel: model } = s;
    const apiKey = await ctx.aiKeys.get(provider);
    if (destroyed) return;
    if (!apiKey) return showReady();
    ctl?.abort();
    const mine = (ctl = new AbortController());
    showLoading(PROVIDER_LABEL[provider] ?? provider, model);
    const res = await requestFeedback({ provider, model, apiKey, task, text, signal: mine.signal, timeoutMs: ctx.aiTimeoutMs });
    if (destroyed || mine !== ctl) return; // peruttu tai korvattu uudella pyynnöllä
    ctl = null;
    if (res.ok) showDone(res);
    else showError(res.error);
  }

  showReady();

  return {
    el,
    destroy() {
      destroyed = true;
      ctl?.abort();
    },
  };
}
