// Asetusten "Tekoälypalaute"-kortti: palvelun valinta, API-avain ja malli.
//
// Avain kirjoitetaan vain avainsäilöön (ctx.aiKeys): oletuksena muistiin ja vain pyydettäessä laitteelle. Kenttä
// tyhjennetään tallennuksen jälkeen, joten koko avain ei jää näkyviin sivulle, vain sen neljä viimeistä merkkiä.

import { h } from '../util.js';
import { PROVIDERS, PROVIDER_LABEL, MODEL_DEFAULTS, MODEL_RE, normalizeModel, validateKey, listModels } from '../ai.js';

const NOTE = {
  gemini:
    'Googlen maksuttomalla Gemini API -tasolla Google voi käyttää lähetettyjä tekstejä tuotteidensa kehittämiseen, ja ihmiset voivat lukea osan niistä. Kirjoita siksi vain keksittyjä tekstejä, älä oikeita asiakas- tai henkilötietoja. Avaimen luot osoitteessa aistudio.google.com/apikey.',
  anthropic:
    'Käyttö laskutetaan erikseen Anthropic-tililtäsi API-hinnoin (se on eri asia kuin Claude.ai-tilaus). Avaimen luot osoitteessa console.anthropic.com kohdassa API keys.',
};

const SUGGESTED = { gemini: [MODEL_DEFAULTS.gemini], anthropic: [MODEL_DEFAULTS.anthropic, 'claude-sonnet-5-5'] };

const MAX_LISTED_MODELS = 60;

/**
 * Palauttaa { el, heading, destroy }. el on valmis kortti; destroy keskeyttää käynnissä olevan verkkopyynnön.
 */
export function aiCard(ctx) {
  const provider = () => ctx.settings().aiProvider;
  let ctl = null; // käynnissä oleva verkkopyyntö
  let destroyed = false;

  const providerSel = h('select', { id: 's-ai-provider', class: 'text-input' }, PROVIDERS.map((p) => h('option', { value: p }, PROVIDER_LABEL[p])));
  providerSel.value = provider();
  const note = h('p', { class: 'help', id: 's-ai-note' });

  const keyInput = h('input', { type: 'password', id: 's-ai-key', class: 'text-input', autocomplete: 'off', 'aria-describedby': 's-ai-status' });
  keyInput.setAttribute('autocapitalize', 'off');
  keyInput.setAttribute('autocorrect', 'off');
  keyInput.setAttribute('spellcheck', 'false');
  // Salasananhallinnat (1Password, LastPass, Bitwarden) eivät ehdota avaimen tallennusta tai täyttöä.
  for (const attr of ['data-1p-ignore', 'data-lpignore', 'data-bwignore']) keyInput.setAttribute(attr, 'true');
  const showBtn = h('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', 'aria-controls': 's-ai-key' }, 'Näytä');
  showBtn.addEventListener('click', () => {
    const show = keyInput.type === 'password';
    keyInput.type = show ? 'text' : 'password';
    showBtn.setAttribute('aria-pressed', String(show));
    showBtn.textContent = show ? 'Piilota' : 'Näytä';
  });
  const hideKey = () => {
    keyInput.value = '';
    keyInput.type = 'password';
    showBtn.setAttribute('aria-pressed', 'false');
    showBtn.textContent = 'Näytä';
  };

  const status = h('p', { class: 'help', id: 's-ai-status', role: 'status', 'aria-live': 'polite' });
  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = kind ? `help ${kind}` : 'help';
  };

  const saveBtn = h('button', { class: 'btn primary', type: 'button', id: 's-ai-save' }, 'Tallenna ja testaa avain');
  const removeBtn = h('button', { class: 'btn', type: 'button', id: 's-ai-remove' }, 'Poista avain');

  const remember = h('input', { type: 'checkbox', id: 's-ai-remember', checked: ctx.settings().rememberKey });

  const modelInput = h('input', { type: 'text', id: 's-ai-model', class: 'text-input', value: ctx.settings().aiModel, autocomplete: 'off', 'aria-describedby': 's-ai-model-msg' });
  modelInput.setAttribute('list', 's-ai-models');
  modelInput.setAttribute('maxlength', '80');
  modelInput.setAttribute('autocapitalize', 'off');
  modelInput.setAttribute('autocorrect', 'off');
  modelInput.setAttribute('spellcheck', 'false');
  const modelList = h('datalist', { id: 's-ai-models' });
  const modelMsg = h('p', { class: 'help', id: 's-ai-model-msg', role: 'status', 'aria-live': 'polite' });
  const listBtn = h('button', { class: 'btn small', type: 'button', id: 's-ai-list' }, 'Hae mallit');

  const setBusy = (busy) => {
    saveBtn.disabled = busy;
    listBtn.disabled = busy;
  };

  const fillModels = (ids = []) => {
    const all = [...new Set([...SUGGESTED[provider()], ...ids])].slice(0, MAX_LISTED_MODELS);
    modelList.replaceChildren(...all.map((id) => h('option', { value: id })));
  };

  const renderNote = () => {
    note.textContent = NOTE[provider()];
  };

  /** Missä avain säilyy: vain tämän istunnon muistissa vai laitteella. */
  const whereKept = () => (ctx.settings().rememberKey ? 'Avain on tallennettu tälle laitteelle.' : 'Avain on käytössä vain tässä istunnossa ja unohtuu, kun suljet sovelluksen.');

  /** Kertoo, onko avain asetettu ja missä se säilyy. */
  const describeKey = async (prefix = '') => {
    const key = await ctx.aiKeys.get(provider());
    removeBtn.disabled = !key;
    if (!key) return setStatus(`${prefix}Avainta ei ole asetettu, joten tekoälypalaute on pois käytöstä.`);
    return setStatus(`${prefix}${whereKept()} Avaimen loppu: …${key.slice(-4)}.`);
  };

  /** Hakee palvelulta mallilistan; toimii samalla avaimen testinä. */
  const fetchModels = async (key, { saved = false } = {}) => {
    ctl?.abort();
    const mine = (ctl = new AbortController());
    const p = provider();
    setBusy(true);
    setStatus(saved ? 'Avain tallennettu. Testataan avainta…' : 'Haetaan malleja…');
    const res = await listModels({ provider: p, apiKey: key, signal: mine.signal });
    if (destroyed || mine.signal.aborted || p !== provider()) return; // käyttäjä siirtyi muualle tai vaihtoi palvelua
    setBusy(false);
    if (!res.ok) {
      const base = saved ? 'Avain on tallennettu, mutta testi ei onnistunut. ' : '';
      return setStatus(`${base}${res.error.message}`, 'error');
    }
    fillModels(res.models);
    const cur = ctx.settings().aiModel;
    const known = res.models.length === 0 || res.models.includes(cur);
    setStatus(
      `Avain toimii. Malleja löytyi: ${res.models.length}. ${whereKept()}${known ? '' : ` Valittua mallia ${cur} ei löytynyt listalta. Valitse malli Malli-kentän listasta.`}`,
      known ? 'ok' : 'warn',
    );
  };

  saveBtn.addEventListener('click', async () => {
    const typed = keyInput.value.trim();
    const p = provider();
    if (!typed) {
      const stored = await ctx.aiKeys.get(p);
      if (!stored) {
        setStatus('Liitä ensin API-avain kenttään.', 'error');
        return keyInput.focus();
      }
      return fetchModels(stored);
    }
    const v = validateKey(p, typed);
    if (!v.ok) {
      setStatus(v.message, 'error');
      return keyInput.focus();
    }
    await ctx.aiKeys.set(p, v.key);
    hideKey();
    removeBtn.disabled = false;
    await fetchModels(v.key, { saved: true });
  });

  removeBtn.addEventListener('click', async () => {
    ctl?.abort();
    setBusy(false);
    await ctx.aiKeys.set(provider(), '');
    hideKey();
    await describeKey('Avain poistettu. ');
    keyInput.focus();
  });

  listBtn.addEventListener('click', async () => {
    const stored = await ctx.aiKeys.get(provider());
    if (!stored) {
      setStatus('Tallenna ensin avain, jotta mallit voidaan hakea.', 'error');
      return keyInput.focus();
    }
    return fetchModels(stored);
  });

  providerSel.addEventListener('change', async () => {
    ctl?.abort();
    setBusy(false);
    const p = providerSel.value;
    await ctx.saveSettings({ aiProvider: p, aiModel: MODEL_DEFAULTS[p] });
    hideKey();
    modelInput.value = MODEL_DEFAULTS[p];
    modelMsg.textContent = '';
    renderNote();
    fillModels();
    await describeKey();
  });

  modelInput.addEventListener('change', async () => {
    const v = normalizeModel(modelInput.value) || MODEL_DEFAULTS[provider()];
    if (!MODEL_RE.test(v)) {
      modelMsg.textContent = 'Mallin nimessä saa olla vain kirjaimia, numeroita ja merkit . _ -';
      modelMsg.className = 'help error';
      return;
    }
    modelInput.value = v;
    modelMsg.textContent = '';
    modelMsg.className = 'help';
    await ctx.saveSettings({ aiModel: v });
  });

  remember.addEventListener('change', async () => {
    await ctx.saveSettings({ rememberKey: remember.checked });
    await ctx.aiKeys.setRemember(remember.checked);
    await describeKey(remember.checked ? '' : 'Tallennetut avaimet poistettiin laitteelta. ');
  });

  renderNote();
  fillModels();
  describeKey();

  const heading = h('h2', { id: 's-ai-h', tabindex: -1 }, 'Tekoälypalaute (valinnainen)');
  const el = h(
    'section',
    { class: 'card', id: 's-ai', 'aria-labelledby': 's-ai-h' },
    heading,
    h(
      'p',
      { class: 'help' },
      'Kirjoita-tehtävien palautteeseen voi pyytää sääntöpohjaisen tarkistuksen lisäksi tekoälyn arvion. Se toimii vain omalla API-avaimellasi. Teksti lähetetään selaimestasi suoraan valitsemallesi palvelulle; sovelluksella ei ole omaa palvelinta, eikä mitään tallenneta tekoälyn palautteesta.',
    ),
    h('div', { class: 'field' }, h('label', { for: 's-ai-provider' }, 'Palvelu'), providerSel, note),
    h('div', { class: 'field' }, h('label', { for: 's-ai-key' }, 'API-avain'), h('div', { class: 'range-row' }, keyInput, showBtn), status),
    h('div', { class: 'actions row wrap' }, saveBtn, removeBtn),
    h(
      'div',
      { class: 'field check' },
      remember,
      h('label', { for: 's-ai-remember' }, 'Muista avain tällä laitteella'),
      h('p', { class: 'help' }, 'Oletuksena avain säilyy vain, kunnes suljet sovelluksen. Valinta tallentaa sen selaimen tietokantaan selkotekstinä, jolloin kuka tahansa, joka pääsee tähän selaimeen, voi lukea sen, ja samassa osoitteessa julkaistut muut sivut voisivat myös. Suositus: jätä valinta pois, äläkä käytä sitä jaetulla tai työlaitteella.'),
    ),
    h('div', { class: 'field' }, h('label', { for: 's-ai-model' }, 'Malli'), h('div', { class: 'range-row' }, modelInput, listBtn), modelList, modelMsg),
  );

  return {
    el,
    heading,
    destroy() {
      destroyed = true;
      ctl?.abort();
    },
  };
}
