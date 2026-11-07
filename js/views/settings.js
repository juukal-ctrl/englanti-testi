import { h } from '../util.js';
import { confirmDialog, choiceDialog, toast, speakButton } from '../ui.js';
import { exportBackup, importBackup, validateBackup } from '../db.js';
import { loadVoices, rankVoices, asrSupported, ttsSupported } from '../speech.js';
import { clipSummary, prefetchAll } from '../clips.js';
import { VOICE_TEST_TEXT } from '../speakable.js';
import { DEFAULT_SETTINGS } from '../settings.js';
import { WRITING_TASKS } from '../../data/writing.js';
import { aiCard } from './settings-ai.js';

const MAX_IMPORT_BYTES = 30 * 1024 * 1024;

function field(label, control, help, id) {
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, help ? h('p', { class: 'help' }, help) : null);
}

function range(ctx, key, { id, min, max, step, format }) {
  const s = ctx.settings();
  const out = h('output', { for: id, class: 'value' }, format(s[key]));
  const input = h('input', { type: 'range', id, min, max, step, value: s[key], class: 'range' });
  input.addEventListener('input', () => (out.textContent = format(Number(input.value))));
  input.addEventListener('change', () => ctx.saveSettings({ [key]: Number(input.value) }));
  return h('div', { class: 'range-row' }, input, out);
}

function toggle(ctx, key, id, label, help) {
  const input = h('input', { type: 'checkbox', id, checked: ctx.settings()[key] });
  input.addEventListener('change', () => ctx.saveSettings({ [key]: input.checked }));
  return h('div', { class: 'field check' }, input, h('label', { for: id }, label), help ? h('p', { class: 'help' }, help) : null);
}

function select(ctx, key, id, options) {
  const sel = h('select', { id, class: 'text-input' }, options.map(([value, label]) => h('option', { value }, label)));
  sel.value = String(ctx.settings()[key]);
  sel.addEventListener('change', () => ctx.saveSettings({ [key]: typeof ctx.settings()[key] === 'number' ? Number(sel.value) : sel.value }));
  return sel;
}

/** Käytössä olevan sovelluskuoren tunniste (service workerin välimuistin nimestä), jotta päivityksen näkee. */
async function buildId() {
  try {
    const key = (await caches.keys()).find((k) => /^englanti-[0-9a-f]{10}$/.test(k)); // ei äänivälimuistia (englanti-audio-…)
    return key ? key.slice('englanti-'.length) : '';
  } catch {
    return '';
  }
}

export async function mount(root, ctx, params = []) {
  const s = ctx.settings();
  root.append(h('h1', {}, 'Asetukset'));

  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Oppiminen'),
      field('Session pituus', select(ctx, 'sessionMinutes', 's-min', [[10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min']]), 'Tavoiteaika: ensin kertaus, sitten uusia ilmauksia, tarvittaessa kirjoitus ja lopuksi puheharjoitus. Jos etenet nopeasti, sessio päättyy aiemmin; "lisää"-painike jatkaa.', 's-min'),
      field(
        'Kirjoitus päivän sessiossa',
        select(ctx, 'writeEvery', 's-write', [[2, 'Joka toinen päivä'], [1, 'Joka päivä'], [3, 'Joka kolmas päivä'], [0, 'Ei sessiossa']]),
        'Yksi lyhyt työviesti vie noin 5–6 minuuttia, joten kirjoituspäivänä uusia ilmauksia ehtii vähemmän. Tehtävä valitaan opittujen ilmausten mukaan. Kirjoita-tehtäviä voi aina tehdä myös erikseen etusivun lisäharjoituksista.',
        's-write',
      ),
      field(
        'Uusia ilmauksia päivässä (enintään)',
        range(ctx, 'newMax', { id: 's-new', min: 0, max: 20, step: 1, format: (v) => String(v) }),
        'Sessio ottaa uusia ilmauksia niin paljon kuin aikaan mahtuu, tähän määrään asti. Isompi määrä kasvattaa kertausten määrää parin viikon päästä.',
        's-new',
      ),
      field(
        'Tavoitesäilyvyys',
        range(ctx, 'retention', { id: 's-ret', min: 0.8, max: 0.95, step: 0.01, format: (v) => `${Math.round(v * 100)} %` }),
        'Todennäköisyys, jolla muistat ilmauksen kertaushetkellä. 90 % on hyvä oletus. Korkeampi tavoite tarkoittaa enemmän kertauksia.',
        's-ret',
      ),
    ),
  );

  const voiceSel = h(
    'select',
    { id: 's-voice', class: 'text-input' },
    h('option', { value: '' }, 'Automaattinen (Kokoro, muuten laitteen ääni)'),
    h('option', { value: 'device' }, 'Laitteen oma ääni (paras englanninkielinen)'),
  );
  const testBtn = speakButton(() => VOICE_TEST_TEXT, ctx, { label: 'Testaa ääni' });
  voiceSel.addEventListener('change', async () => {
    await ctx.saveSettings({ voiceURI: voiceSel.value });
    refreshClips();
  });

  // Esiäänitetyt Kokoro-äänet: tila ja lataus laitteelle (toimii sen jälkeen ilman verkkoa).
  const clipInfo = h('p', { class: 'help', id: 's-clip-info', role: 'status', 'aria-live': 'polite' }, 'Tarkistetaan Kokoro-ääniä…');
  const clipBtn = h('button', { class: 'btn small', type: 'button', id: 's-clip-load', disabled: true }, 'Lataa äänet offline-käyttöön');
  let loadingClips = false;
  const refreshClips = async () => {
    if (loadingClips) return;
    const sum = await clipSummary();
    if (!sum.available) {
      clipInfo.textContent = 'Kokoro-ääniä ei ole vielä saatavilla, joten käytössä on laitteen oma ääni.';
      clipBtn.disabled = true;
      return;
    }
    const mb = (sum.bytes / 1024 / 1024).toFixed(1).replace('.', ',');
    const usedNow = ctx.settings().voiceURI === '' ? 'Käytössä.' : 'Ei käytössä, koska ääneksi on valittu laitteen ääni.';
    clipInfo.textContent = `Kokoro-äänet (${sum.voice}): ${sum.count} äänitettä, noin ${mb} Mt. Laitteelle ladattu ${sum.cached} / ${sum.count}. ${usedNow}`;
    clipBtn.disabled = sum.cached >= sum.count;
  };
  clipBtn.addEventListener('click', async () => {
    loadingClips = true;
    clipBtn.disabled = true;
    const res = await prefetchAll({ onProgress: ({ done, total }) => (clipInfo.textContent = `Ladataan ääniä… ${done} / ${total}`) });
    loadingClips = false;
    await refreshClips();
    toast(res.failed ? `${res.failed} äänitettä ei latautunut. Yritä uudelleen, kun verkko toimii.` : 'Äänet on ladattu laitteelle.');
  });
  refreshClips();
  loadVoices().then((voices) => {
    for (const v of rankVoices(voices)) {
      voiceSel.append(h('option', { value: v.voiceURI }, `${v.name} (${v.lang}, ${v.localService ? 'laitteella' : 'verkossa'})`));
    }
    voiceSel.value = ctx.settings().voiceURI;
    if (voiceSel.value !== ctx.settings().voiceURI) voiceSel.value = '';
  });
  const modeMic = h('input', { type: 'radio', name: 'mode', id: 's-mic', value: 'mic', checked: s.speakMode === 'mic' });
  const modeType = h('input', { type: 'radio', name: 'mode', id: 's-type', value: 'type', checked: s.speakMode === 'type' });
  for (const r of [modeMic, modeType]) r.addEventListener('change', () => r.checked && ctx.saveSettings({ speakMode: r.value }));
  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Ääni ja puhe'),
      ttsSupported() ? null : h('p', { class: 'banner warn' }, 'Tällä selaimella ei ole puhesynteesiä.'),
      field('Ääni', h('div', { class: 'range-row' }, voiceSel, testBtn.el), 'Automaattinen käyttää esiäänitettyä Kokoro-ääntä, kun se on saatavilla, ja muuten laitteen ääntä. Laitteen oma ääni toimii aina ilman verkkoa.', 's-voice'),
      h('div', { class: 'field' }, clipInfo, clipBtn),
      field('Puhenopeus', range(ctx, 'rate', { id: 's-rate', min: 0.6, max: 1.2, step: 0.05, format: (v) => `${v.toFixed(2).replace('.', ',')} ×` }), 'Harjoituksissa on lisäksi "Hitaasti"-painike, joka lukee lauseen vielä hitaammin.', 's-rate'),
      toggle(ctx, 'autoplay', 's-auto', 'Toista ääni automaattisesti', 'Uuden ilmauksen ja vastauksen yhteydessä.'),
      h(
        'fieldset',
        { class: 'field' },
        h('legend', {}, 'Vastaaminen englanniksi'),
        h('div', { class: 'check' }, modeMic, h('label', { for: 's-mic' }, 'Sanon ääneen (mikrofoni)')),
        h('div', { class: 'check' }, modeType, h('label', { for: 's-type' }, 'Kirjoitan vastaukset')),
        h(
          'p',
          { class: 'help' },
          asrSupported()
            ? 'Selain tunnistaa puheen. Kun laite on verkossa, Chrome voi lähettää äänen tunnistuspalveluunsa; lentokonetilassa tunnistus toimi testipuhelimella laitteella. Äänitallenteita ei tallenneta.'
            : 'Tämä selain ei tue puheentunnistusta, joten vastaukset kirjoitetaan.',
        ),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Ulkoasu'),
      field('Teema', select(ctx, 'theme', 's-theme', [['auto', 'Laitteen mukaan'], ['light', 'Vaalea'], ['dark', 'Tumma']]), null, 's-theme'),
      field('Tekstin koko', range(ctx, 'textScale', { id: 's-scale', min: 0.9, max: 1.4, step: 0.05, format: (v) => `${Math.round(v * 100)} %` }), null, 's-scale'),
      toggle(ctx, 'clearText', 's-clear', 'Selkeä tekstitila', 'Väljempi rivi- ja kirjainväli sekä selkeä järjestelmäfontti.'),
      toggle(ctx, 'reduceMotion', 's-motion', 'Vähennä animaatioita'),
    ),
  );

  // Tekoälypalaute (valinnainen, oma API-avain)
  const ai = aiCard(ctx);
  root.append(ai.el);

  // Tiedot
  const est = await ctx.db.estimate();
  const build = await buildId();
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', id: 's-file', class: 'sr', tabindex: -1 });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return toast('Tiedosto on liian suuri.');
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return toast('Tiedostoa ei voitu lukea JSON-muodossa.');
    }
    const v = validateBackup(data);
    if (!v.ok) return toast(`${v.errors.map((e) => String(e).replace(/[.\s]+$/, '')).join('. ')}.`, { ms: 7000 });
    const mode = await choiceDialog({
      title: 'Tuodaanko varmuuskopio?',
      body: `Tiedostossa on ${v.cards.length} korttia ja ${v.reviews.length} kertaustapahtumaa. Yhdistäminen säilyttää nykyiset tiedot ja lisää uudemmat. Korvaaminen poistaa nykyiset tiedot ensin.`,
      choices: [
        { label: 'Yhdistä nykyisiin', value: 'merge', kind: 'primary' },
        { label: 'Korvaa kaikki', value: 'replace', kind: 'danger' },
      ],
    });
    if (!mode) return;
    try {
      const res = await importBackup(ctx.db, data, { mode });
      await ctx.srs.load();
      await ctx.reloadSettings();
      toast(`Tuotu: ${res.cards} korttia, ${res.reviews} kertaustapahtumaa.`);
      ctx.nav('today');
    } catch (e) {
      toast(`Tuonti epäonnistui: ${e.message}`, { ms: 7000 });
    }
  });
  const exportBtn = h('button', { class: 'btn', type: 'button' }, 'Lataa varmuuskopio');
  exportBtn.addEventListener('click', async () => {
    const data = await exportBackup(ctx.db);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const day = new Date().toISOString().slice(0, 10);
    const a = h('a', { href: url, download: `englanti-varmuuskopio-${day}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    toast('Varmuuskopio ladattu.');
  });
  const wipeBtn = h('button', { class: 'btn danger', type: 'button' }, 'Poista kaikki tiedot');
  wipeBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Poistetaanko kaikki tiedot?',
      body: 'Kaikki kortit, kertaushistoria ja asetukset poistetaan tästä laitteesta. Tätä ei voi perua. Lataa ensin varmuuskopio, jos haluat säilyttää edistymisesi.',
      confirmText: 'Poista kaikki',
      danger: true,
    });
    if (!ok) return;
    await ctx.aiKeys.forget(); // ensin muisti ja laite; reset tyhjentää tietokannan kokonaan
    await ctx.srs.reset();
    await ctx.reloadSettings();
    toast('Kaikki tiedot on poistettu.');
    ctx.nav('today');
  });
  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Tiedot ja varmuuskopio'),
      h('p', {}, `Tallessa: ${est.cards} korttia, ${est.reviews} kertaustapahtumaa. Tallennus: ${ctx.db.kind === 'idb' ? 'selaimen tietokanta' : 'vain muisti (ei pysyvä)'}${ctx.persisted ? ', pysyväksi merkitty' : ''}.`),
      h('p', { class: 'help' }, 'Varmuuskopio sisältää oppimisdatan ja asetukset. Se ei sisällä API-avaimia. Ota varmuuskopio ennen kuin vaihdat puhelinta tai tyhjennät selaimen tietoja.'),
      h('div', { class: 'actions row wrap' }, exportBtn, h('button', { class: 'btn', type: 'button', on: { click: () => fileInput.click() } }, 'Tuo varmuuskopio'), fileInput),
      h('div', { class: 'actions' }, wipeBtn),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Tietoja'),
      h('p', { class: 'help', id: 'about' }, `Versio ${ctx.version}${build ? ` (${build})` : ''}. Sisältö: ${ctx.catalog.items.length} ilmausta, ${ctx.catalog.units.length} aihetta, ${WRITING_TASKS.length} kirjoitustehtävää.`),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Palauta oletukset'),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          on: {
            click: async () => {
              await ctx.saveSettings({ ...DEFAULT_SETTINGS });
              await ctx.aiKeys.setRemember(false); // oletuksena avaimia ei säilytetä laitteella
              location.reload();
            },
          },
        },
        'Palauta asetukset',
      ),
    ),
  );
  // Linkki #/settings/ai vie suoraan tekoälykorttiin. Reititin palauttaa vierityksen alkuun vasta tämän jälkeen.
  if (params[0] === 'ai') {
    setTimeout(() => {
      ai.el.scrollIntoView({ block: 'start' });
      ai.heading.focus({ preventScroll: true });
    }, 0);
  }
  return { destroy: () => ai.destroy() };
}
