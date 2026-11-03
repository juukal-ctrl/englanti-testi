import { h } from '../util.js';
import { confirmDialog, choiceDialog, toast, speakButton } from '../ui.js';
import { exportBackup, importBackup, validateBackup } from '../db.js';
import { loadVoices, rankVoices, asrSupported, ttsSupported } from '../speech.js';
import { DEFAULT_SETTINGS } from '../settings.js';

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

export async function mount(root, ctx) {
  const s = ctx.settings();
  root.append(h('h1', {}, 'Asetukset'));

  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Oppiminen'),
      field('Uusia ilmauksia päivässä', range(ctx, 'newPerDay', { id: 's-new', min: 0, max: 15, step: 1, format: (v) => String(v) }), 'Isompi määrä kasvattaa kertausten määrää parin viikon päästä.', 's-new'),
      field('Session pituus', select(ctx, 'sessionMinutes', 's-min', [[10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min']]), null, 's-min'),
      field(
        'Tavoitesäilyvyys',
        range(ctx, 'retention', { id: 's-ret', min: 0.8, max: 0.95, step: 0.01, format: (v) => `${Math.round(v * 100)} %` }),
        'Todennäköisyys, jolla muistat ilmauksen kertaushetkellä. 90 % on hyvä oletus. Korkeampi tavoite tarkoittaa enemmän kertauksia.',
        's-ret',
      ),
    ),
  );

  const voiceSel = h('select', { id: 's-voice', class: 'text-input' }, h('option', { value: '' }, 'Automaattinen'));
  const testBtn = speakButton(() => 'Could you possibly send me the updated report by noon?', ctx, { label: 'Testaa ääni' });
  voiceSel.addEventListener('change', async () => {
    await ctx.saveSettings({ voiceURI: voiceSel.value });
  });
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
      field('Ääni', h('div', { class: 'range-row' }, voiceSel, testBtn.el), 'Automaattinen valitsee parhaan englanninkielisen äänen. Laitteella toimiva ääni toimii myös ilman verkkoa.', 's-voice'),
      field('Puhenopeus', range(ctx, 'rate', { id: 's-rate', min: 0.7, max: 1.2, step: 0.05, format: (v) => `${v.toFixed(2).replace('.', ',')} ×` }), null, 's-rate'),
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

  // Tiedot
  const est = await ctx.db.estimate();
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
      h('h2', {}, 'Palauta oletukset'),
      h(
        'button',
        {
          class: 'btn',
          type: 'button',
          on: {
            click: async () => {
              await ctx.saveSettings({ ...DEFAULT_SETTINGS });
              location.reload();
            },
          },
        },
        'Palauta asetukset',
      ),
    ),
  );
  return {};
}
