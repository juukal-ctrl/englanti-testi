import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, exportBackup, importBackup } from '../js/db.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../js/settings.js';
import { createKeyStore, KEYS_KV } from '../js/ai-keys.js';

const GEMINI_KEY = 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE0123';
const CLAUDE_KEY = 'sk-ant-api03-FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE';

async function setup(rememberKey = false) {
  const db = await openDb({ memory: true });
  let settings = { ...DEFAULT_SETTINGS, rememberKey };
  const store = createKeyStore(db, () => settings);
  return {
    db,
    store,
    setRemember(on) {
      settings = { ...settings, rememberKey: on };
    },
    fresh: () => createKeyStore(db, () => settings), // uusi istunto: muisti tyhjä, tietokanta sama
  };
}

test('oletuksena avain pysyy vain muistissa eikä kirjoitu tietokantaan', async () => {
  const { db, store, fresh } = await setup(false);
  await store.set('gemini', ` ${GEMINI_KEY} `);
  assert.equal(await store.get('gemini'), GEMINI_KEY);
  assert.equal(await store.get('anthropic'), '');
  assert.equal(await db.getKv(KEYS_KV, null), null, 'ei kirjoitettu laitteelle');
  assert.equal(await fresh().get('gemini'), '', 'uusi istunto ei tiedä avainta');
  assert.deepEqual(await store.storedOnDevice(), []);
});

test('"muista laitteella": avain tallentuu ja löytyy uudessa istunnossa', async () => {
  const { db, store, fresh } = await setup(true);
  await store.set('gemini', GEMINI_KEY);
  await store.set('anthropic', CLAUDE_KEY);
  assert.deepEqual(await db.getKv(KEYS_KV, null), { gemini: GEMINI_KEY, anthropic: CLAUDE_KEY });
  const next = fresh();
  assert.equal(await next.get('gemini'), GEMINI_KEY);
  assert.equal(await next.get('anthropic'), CLAUDE_KEY);
  assert.deepEqual((await next.storedOnDevice()).sort(), ['anthropic', 'gemini']);
});

test('tyhjä avain poistaa avaimen muistista ja laitteelta', async () => {
  const { db, store } = await setup(true);
  await store.set('gemini', GEMINI_KEY);
  await store.set('anthropic', CLAUDE_KEY);
  await store.set('gemini', '  ');
  assert.equal(await store.get('gemini'), '');
  assert.deepEqual(await db.getKv(KEYS_KV, null), { anthropic: CLAUDE_KEY });
});

test('muistamisen päälle kytkeminen tallentaa muistissa olevat avaimet, pois kytkeminen poistaa ne laitteelta', async () => {
  const { db, store, setRemember, fresh } = await setup(false);
  await store.set('gemini', GEMINI_KEY);
  assert.equal(await db.getKv(KEYS_KV, null), null);

  setRemember(true);
  await store.setRemember(true);
  assert.deepEqual(await db.getKv(KEYS_KV, null), { gemini: GEMINI_KEY });
  assert.equal(await fresh().get('gemini'), GEMINI_KEY);

  setRemember(false);
  await store.setRemember(false);
  assert.deepEqual(await db.getKv(KEYS_KV, null), {});
  assert.equal(await store.get('gemini'), GEMINI_KEY, 'tämän välilehden muistissa avain säilyy');
  assert.equal(await fresh().get('gemini'), '', 'mutta uusi istunto ei löydä sitä');
});

test('unohtaminen tyhjentää muistin ja laitteen', async () => {
  const { db, store, fresh } = await setup(true);
  await store.set('gemini', GEMINI_KEY);
  await store.forget();
  assert.equal(await store.get('gemini'), '');
  assert.equal(await fresh().get('gemini'), '');
  assert.deepEqual(await db.getKv(KEYS_KV, null), {});
});

test('rikkinäinen tallennettu arvo ei kaada eikä päädy käyttöön', async () => {
  for (const junk of ['teksti', 42, [GEMINI_KEY], { gemini: 123, anthropic: null, other: GEMINI_KEY }]) {
    const { db, store } = await setup(true);
    await db.setKv(KEYS_KV, junk);
    assert.equal(await store.get('gemini'), '', JSON.stringify(junk));
    assert.equal(await store.get('anthropic'), '');
  }
});

test('avain ei päädy asetuksiin, vaikka sen säilytys olisi päällä', async () => {
  const { db, store } = await setup(true);
  await store.set('gemini', GEMINI_KEY);
  const saved = sanitizeSettings({ ...DEFAULT_SETTINGS, rememberKey: true, aiApiKey: GEMINI_KEY, apiKey: GEMINI_KEY });
  assert.ok(!JSON.stringify(saved).includes(GEMINI_KEY), 'tuntemattomat avaimet pudotetaan');
  assert.equal(await db.getKv('settings', null), null, 'asetuksia ei kosketa');
});

test('varmuuskopio ei sisällä API-avaimia, ja tuonti ei palauta niitä', async () => {
  const { db, store } = await setup(true);
  await store.set('gemini', GEMINI_KEY);
  await store.set('anthropic', CLAUDE_KEY);
  const backup = await exportBackup(db);
  const text = JSON.stringify(backup);
  assert.ok(!text.includes(GEMINI_KEY) && !text.includes(CLAUDE_KEY) && !text.includes('aiKeys'));
  assert.match(backup.note, /API-avaimia ei viedä/);
  await importBackup(db, backup, { mode: 'replace' });
  assert.equal(await db.getKv(KEYS_KV, null), null, 'korvaava tuonti tyhjentää myös avaimet laitteelta');
});

test('yhdistävä tuonti säilyttää nykyiset muut tiedot (kirjoitusloki, luonnokset, avaimet)', async () => {
  const { db, store } = await setup(true);
  await store.set('gemini', GEMINI_KEY);
  await db.setKv('writeLog', [{ ts: 1, id: 'w-followup', done: true }]);
  await db.setKv('writeDrafts', { 'w-request': { text: 'Hi Sarah, would it be possible', ts: 2 } });
  await db.setKv('activity', { 20400: 60000 });
  const backup = await exportBackup(db);
  await importBackup(db, backup, { mode: 'merge' });
  assert.deepEqual(await db.getKv('writeLog', null), [{ ts: 1, id: 'w-followup', done: true }]);
  assert.equal((await db.getKv('writeDrafts', {}))['w-request'].text, 'Hi Sarah, would it be possible');
  assert.deepEqual(await db.getKv('activity', null), { 20400: 60000 });
  assert.deepEqual(await db.getKv(KEYS_KV, null), { gemini: GEMINI_KEY });
});

test('"muista avain" on laitekohtainen valinta: sitä ei viedä varmuuskopioon eikä tuoda takaisin päälle', async () => {
  const { db } = await setup(true);
  await db.setKv('settings', sanitizeSettings({ ...DEFAULT_SETTINGS, rememberKey: true, aiProvider: 'anthropic', aiModel: 'claude-haiku-5-5' }));
  const backup = await exportBackup(db);
  assert.equal(backup.settings.rememberKey, false, 'vienti nollaa valinnan');
  assert.equal(backup.settings.aiProvider, 'anthropic', 'muut tekoälyasetukset säilyvät');

  // Käsin muokattu tiedosto, jossa valinta on päällä
  const edited = { ...backup, settings: { ...backup.settings, rememberKey: true } };
  const target = await openDb({ memory: true });
  await importBackup(target, edited, { mode: 'replace' });
  assert.equal((await target.getKv('settings', null)).rememberKey, false, 'korvaava tuonti ei kytke valintaa päälle');
  assert.equal((await target.getKv('settings', null)).aiProvider, 'anthropic');

  const fresh = await openDb({ memory: true });
  await importBackup(fresh, edited, { mode: 'merge' });
  assert.equal((await fresh.getKv('settings', null)).rememberKey, false, 'yhdistävä tuonti tyhjään laitteeseen ei kytke sitä päälle');
});
