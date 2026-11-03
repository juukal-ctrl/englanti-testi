import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseManifest, findClip, playbackRateFor, pruneAudioCache, AUDIO_CACHE, DEFAULT_RATE, SLOW_FALLBACK } from '../js/clips.js';
import { collectTexts } from '../tools/tts/texts.mjs';
import { speakable, VOICE_TEST_TEXT } from '../js/speakable.js';
import { CATALOG, BLANK } from '../js/content.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const ID_A = 'a1b2c3d4e5f6';
const ID_B = '0123456789ab';
const ID_C = 'fedcba987654';

test('parseManifest: hyväksyy oikean muodon ja pudottaa virheelliset tunnisteet', () => {
  const m = parseManifest({ version: 1, voice: 'af_heart', engine: 'kokoro-82m', bytes: 1234, normal: { 'Hello.': ID_A, 'Bad id.': 'not hex!', '': ID_B }, slow: { 'Hello.': ID_C } });
  assert.equal(m.voice, 'af_heart');
  assert.equal(m.bytes, 1234);
  assert.deepEqual([...m.normal], [['Hello.', ID_A]]);
  assert.deepEqual([...m.slow], [['Hello.', ID_C]]);
});

test('parseManifest: tyhjä paikkamanifesti on kelvollinen, väärä muoto ei', () => {
  const empty = parseManifest(JSON.parse(readFileSync(join(root, 'audio/manifest.json'), 'utf8')));
  assert.ok(empty, 'audio/manifest.json pitää olla kelvollinen manifesti');
  for (const bad of [null, undefined, 'x', 42, [], {}, { version: 2, normal: {} }, { version: '1' }]) assert.equal(parseManifest(bad), null, JSON.stringify(bad));
  const odd = parseManifest({ version: 1, normal: [ID_A], slow: 'x', bytes: 'iso' });
  assert.equal(odd.normal.size, 0);
  assert.equal(odd.slow.size, 0);
  assert.equal(odd.bytes, 0);
});

test('findClip: normaali, hidas ja hitaan varavaihtoehto', () => {
  const m = parseManifest({ version: 1, normal: { 'A.': ID_A, 'B.': ID_B }, slow: { 'A.': ID_C } });
  assert.deepEqual(findClip(m, 'A.'), { id: ID_A, rate: 1 });
  assert.deepEqual(findClip(m, 'A.', true), { id: ID_C, rate: 1 });
  assert.deepEqual(findClip(m, 'B.', true), { id: ID_B, rate: SLOW_FALLBACK }, 'ilman hidasta leikettä normaali leike hidastetaan');
  assert.equal(findClip(m, 'C.'), null);
  assert.equal(findClip(m, 'C.', true), null);
  assert.equal(findClip(null, 'A.'), null);
  assert.equal(findClip(m, ''), null);
});

test('playbackRateFor: oletusnopeus toistaa leikkeen sellaisenaan, muut suhteessa siihen', () => {
  assert.equal(playbackRateFor(DEFAULT_RATE), 1);
  assert.ok(Math.abs(playbackRateFor(1.0) - 1 / 0.85) < 1e-9);
  assert.ok(playbackRateFor(0.6) < 0.75 && playbackRateFor(0.6) >= 0.6);
  assert.equal(playbackRateFor(Number.NaN), 1);
  assert.equal(playbackRateFor(undefined), 1);
  assert.ok(playbackRateFor(100) <= 1.5);
});

test('pruneAudioCache: poistaa vain manifestista poistuneet leikkeet, ei koske manifestiin eikä tyhjällä manifestilla mihinkään', async () => {
  const urlOf = (name) => `https://example.test/englanti-testi/audio/${name}`;
  const store = new Map([[urlOf(`${ID_A}.ogg`), 1], [urlOf(`${ID_B}.ogg`), 1], [urlOf(`${ID_C}.ogg`), 1], [urlOf('manifest.json'), 1]]);
  const opened = [];
  const fake = {
    open: async (name) => {
      opened.push(name);
      return { keys: async () => [...store.keys()].map((url) => ({ url })), delete: async (req) => store.delete(req.url) };
    },
  };
  const m = parseManifest({ version: 1, normal: { 'A.': ID_A }, slow: { 'A.': ID_C } });
  assert.equal(await pruneAudioCache(m, fake), 1);
  assert.deepEqual([...store.keys()].sort(), [urlOf(`${ID_A}.ogg`), urlOf(`${ID_C}.ogg`), urlOf('manifest.json')].sort());
  assert.deepEqual(opened, [AUDIO_CACHE]);
  assert.equal(await pruneAudioCache(parseManifest({ version: 1 }), fake), 0, 'tyhjä manifesti ei tyhjennä välimuistia');
  assert.equal(store.size, 3);
  assert.equal(await pruneAudioCache(null, fake), 0);
  assert.equal(await pruneAudioCache(m, null), 0, 'ilman Cache API:a ei tehdä mitään');
});

test('service workerin äänivälimuisti on sama kuin clips.js:ssä eikä sitä siivota päivityksessä', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.equal(/const AUDIO_CACHE = '([^']+)'/.exec(sw)?.[1], AUDIO_CACHE);
  assert.match(sw, /k !== CACHE && k !== AUDIO_CACHE/, 'vanhojen välimuistien siivous ei saa poistaa äänivälimuistia');
  assert.ok(sw.includes('audioResponse(req, url)') && sw.includes('\\/audio\\/'), 'sw.js käsittelee audio-polun');
});

test('collectTexts: kaikki luettavat tekstit ovat mukana, vakaassa muodossa', () => {
  const { normal, slow } = collectTexts();
  const set = new Set(normal);
  assert.equal(set.size, normal.length, 'ei kaksoiskappaleita');
  assert.ok(set.has(speakable(VOICE_TEST_TEXT)), 'asetusten testilause');
  for (const t of normal) {
    assert.equal(speakable(t), t, `teksti ei ole speakable-muodossa: ${t}`);
    assert.ok(t.length >= 3 && t.length <= 200, `teksti on tyhjä tai liian pitkä: ${t}`);
    assert.doesNotMatch(t, /…|___|\n/, `tekstissä on lukukelvoton merkki: ${t}`);
  }
  for (const it of CATALOG.items) {
    for (const field of ['en', 'ex', 'say']) assert.ok(set.has(speakable(it[field])), `${it.id}.${field} puuttuu luettelosta`);
    if (it.cloze) assert.ok(set.has(speakable(it.cloze.text.replace(BLANK, () => it.cloze.answer))), `${it.id}: täytetty aukkolause puuttuu`);
    assert.ok(slow.includes(speakable(it.ex)), `${it.id}: hidas esimerkkilause puuttuu`);
    assert.ok(slow.includes(speakable(it.say)), `${it.id}: hidas malli puuttuu`);
  }
  for (const t of slow) assert.ok(set.has(t), `hidas teksti ei ole normaalissa luettelossa: ${t}`);
});

/* ---------- Generointiputki (testiäänellä, ilman Kokoroa) ---------- */

const has = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }).status === 0;
const toolsOk = has('python3', ['-c', 'import numpy']) && has('ffmpeg', ['-version']);

test('generate.py --fake: tuottaa Opus-leikkeet ja manifestin, ohittaa valmiit ja siivoaa vanhat', { skip: toolsOk ? false : 'python3+numpy tai ffmpeg puuttuu' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tts-'));
  try {
    const run = (args) => spawnSync('python3', [join(root, 'tools/tts/generate.py'), ...args], { encoding: 'utf8' });
    const textsFile = join(dir, 'texts.json');
    const out = join(dir, 'audio');
    writeFileSync(textsFile, JSON.stringify({ normal: ['Hello there.', 'Could you send it?', 'Fine.'], slow: ['Hello there.'] }));
    const base = ['--texts', textsFile, '--out', out, '--fake'];

    assert.equal(run([...base, '--plan']).stdout.trim(), '4');
    const first = run(base);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.voice, 'af_heart');
    assert.deepEqual(Object.keys(manifest.normal).sort(), ['Could you send it?', 'Fine.', 'Hello there.']);
    assert.deepEqual(Object.keys(manifest.slow), ['Hello there.']);
    assert.notEqual(manifest.normal['Hello there.'], manifest.slow['Hello there.'], 'hidas ja normaali leike ovat eri tiedostoja');
    const parsed = parseManifest(manifest);
    assert.ok(parsed && parsed.normal.size === 3 && parsed.slow.size === 1, 'sovelluksen parseManifest hyväksyy generoidun manifestin');
    const files = readdirSync(out).filter((f) => f.endsWith('.ogg'));
    assert.equal(files.length, 4);
    assert.ok(manifest.bytes > 0);
    for (const id of [...Object.values(manifest.normal), ...Object.values(manifest.slow)]) assert.ok(existsSync(join(out, `${id}.ogg`)), id);
    const head = readFileSync(join(out, files[0])).subarray(0, 4).toString('latin1');
    assert.equal(head, 'OggS', 'tiedosto on Ogg-säiliö');
    if (has('ffprobe', ['-version'])) {
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,channels', '-of', 'csv=p=0', join(out, files[0])], { encoding: 'utf8' });
      assert.equal(probe.stdout.trim(), 'opus,1');
    }

    // Ääntämiskorjaus muuttaa vain korjatun tekstin leikkeen tunnisteen, joten vain se tehdään uudelleen.
    const respellFile = join(dir, 'respell.json');
    writeFileSync(respellFile, JSON.stringify({ '\\bFine\\b': 'Fyne' }));
    assert.equal(run([...base, '--plan', '--respell', respellFile]).stdout.trim(), '1');
    assert.equal(run([...base, '--plan']).stdout.trim(), '0', 'ilman korjausta mitään ei puutu');

    // Toinen ajo ei generoi mitään uudelleen.
    assert.equal(run([...base, '--plan']).stdout.trim(), '0');
    const second = run(base);
    assert.equal(second.status, 0);
    assert.match(second.stdout, /generoitavia 0/);

    // Oppijalle sopiva vauhti: hidas selvästi hitaampi kuin normaali, eikä normaali ole mallin kiireisin vauhti.
    assert.ok(manifest.speeds.slow < manifest.speeds.normal && manifest.speeds.normal <= 0.85 && manifest.speeds.slow >= 0.5, JSON.stringify(manifest.speeds));

    // Foneemiraportti vaatii oikean mallin: testiäänillä se ohitetaan, eikä se kaada ajoa.
    const phFile = join(dir, 'ph.tsv');
    const ph = run([...base, '--phonemes-out', phFile]);
    assert.equal(ph.status, 0, ph.stdout + ph.stderr);
    assert.match(ph.stdout, /Foneemiraporttia ei tehdä/);
    assert.equal(existsSync(phFile), false);

    // Poistunut teksti siivotaan, uusi generoidaan.
    writeFileSync(textsFile, JSON.stringify({ normal: ['Hello there.', 'Brand new.'], slow: [] }));
    assert.equal(run([...base, '--plan']).stdout.trim(), '1');
    assert.equal(run(base).status, 0);
    const after = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    assert.deepEqual(Object.keys(after.normal).sort(), ['Brand new.', 'Hello there.']);
    assert.deepEqual(Object.keys(after.slow), []);
    assert.equal(readdirSync(out).filter((f) => f.endsWith('.ogg')).length, 2, 'vanhat leikkeet on poistettu');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
