import test from 'node:test';
import assert from 'node:assert/strict';
import { SHADOW_PASSAGES, SHADOW_BY_ID } from '../data/shadow.js';
import {
  SHADOW_INTERVALS,
  MASTERED_STAGE,
  MAX_REVIEWS_PER_LESSON,
  LESSON_SLACK_MS,
  SPEEDS,
  SPEED_IDS,
  STAGE_LABELS,
  RATINGS,
  wordCount,
  audioMs,
  newStages,
  reviewStages,
  stagePasses,
  estimateMs,
  nextState,
  cleanShadowLog,
  mergeShadowLogs,
  dueList,
  planLesson,
  summarizeShadow,
  nextDueDay,
  dueText,
  phaseLabels,
  buildMoves,
  nextLabelFor,
} from '../js/shadow.js';
import { collectTexts } from '../tools/tts/texts.mjs';
import { speakable } from '../js/speakable.js';
import { checkWriting } from '../js/writing.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../js/settings.js';
import { pickMimeType, recordingSupported, recorderErrorCode, recorderErrorText, startRecording } from '../js/recorder.js';
import { openDb, exportBackup, importBackup, validateBackup, BACKUP_APP } from '../js/db.js';

const TODAY = 20000;
const P = SHADOW_PASSAGES;

/* ---------- Sisältö ---------- */

test('kappaleet: tunnisteet ovat sh-01…, yksilöllisiä ja haettavissa', () => {
  assert.ok(P.length >= 24);
  P.forEach((p, i) => assert.equal(p.id, `sh-${String(i + 1).padStart(2, '0')}`));
  assert.equal(new Set(P.map((p) => p.id)).size, P.length);
  for (const p of P) assert.equal(SHADOW_BY_ID.get(p.id), p);
});

test('kappaleet: rakenne on täydellinen (lauseet, suomennokset, avainsanat, vinkki)', () => {
  const topics = new Set(['Työ', 'Arki', 'Kokoukset', 'Mielipiteet']);
  for (const p of P) {
    assert.ok(p.title && typeof p.title === 'string', `${p.id}: otsikko`);
    assert.ok(topics.has(p.topic), `${p.id}: aihe ${p.topic}`);
    assert.ok(Array.isArray(p.lines) && p.lines.length >= 4 && p.lines.length <= 8, `${p.id}: lauseita ${p.lines?.length}`);
    assert.equal(p.fi.length, p.lines.length, `${p.id}: suomennos jokaiselle lauseelle`);
    assert.equal(p.words.length, 3, `${p.id}: kolme avainsanaa`);
    for (const [e, f] of p.words) assert.ok(e && f, `${p.id}: avainsana ${e}/${f}`);
    assert.ok(p.tip && p.tip.length > 10, `${p.id}: vinkki`);
    for (const l of [...p.lines, ...p.fi]) assert.ok(l.trim() === l && l.length > 3, `${p.id}: lause "${l}"`);
  }
});

test('kappaleet: pituus sopii shadowingiin (45–70 sanaa, lauseet enintään 18 sanaa) ja lauseet päättyvät välimerkkiin', () => {
  for (const p of P) {
    const n = wordCount(p);
    assert.ok(n >= 45 && n <= 70, `${p.id}: ${n} sanaa`);
    for (const l of p.lines) {
      assert.ok(l.split(/\s+/).length <= 18, `${p.id}: liian pitkä lause "${l}"`);
      assert.match(l, /[.?!]$/, `${p.id}: lause ilman päätemerkkiä "${l}"`);
    }
  }
});

test('kappaleet: jokaisesta lauseesta syntyy luettava teksti, eikä lauseita ole kahteen kertaan', () => {
  const seen = new Map();
  for (const p of P) {
    for (const l of p.lines) {
      assert.ok(speakable(l), `${p.id}: ${l}`);
      assert.equal(seen.get(speakable(l)), undefined, `${p.id}: sama lause myös kappaleessa ${seen.get(speakable(l))}`);
      seen.set(speakable(l), p.id);
    }
  }
});

test('kappaleet: englanti on virheetöntä kirjoitustarkistimen mukaan (ei suomalaisvirheiden merkkejä)', () => {
  const task = { tone: 'polite', format: 'chat' };
  const problems = [];
  for (const p of P) {
    for (const l of p.lines) for (const i of checkWriting(task, l).issues) problems.push(`${p.id}: ${i.id} "${i.quote}"`);
  }
  assert.deepEqual(problems, []);
});

test('kappaleet: aiheet vaihtelevat (neljä ensimmäistä kappaletta ovat eri aiheista)', () => {
  assert.equal(new Set(P.slice(0, 4).map((p) => p.topic)).size, 4);
});

test('äänet: kaikki kappaleiden lauseet ovat esiäänitettävien tekstien luettelossa (normaali nopeus)', () => {
  const { normal } = collectTexts();
  const set = new Set(normal);
  const missing = P.flatMap((p) => p.lines.map(speakable)).filter((t) => !set.has(t));
  assert.deepEqual(missing, []);
});

test('äänet: collectTexts ottaa kappaleet mukaan myös annettuna parametrina', () => {
  const only = [{ id: 'sh-x', lines: ['This is a test line.', 'And another one.'] }];
  const { normal } = collectTexts({ items: [] }, [], only);
  assert.ok(normal.includes('This is a test line.') && normal.includes('And another one.'));
});

/* ---------- Vaiheet ja kesto ---------- */

test('newStages: uusi kappale kulkee kuuntelu → luku → mukana → teksti ×3 → ilman tekstiä ×2 → (nauhoitus) → arvio', () => {
  const stages = newStages();
  assert.deepEqual(stages.map((s) => s.id), ['listen', 'read', 'along', 'text', 'blind', 'record', 'rate']);
  assert.equal(stages.find((s) => s.id === 'text').passes, 3);
  assert.equal(stages.find((s) => s.id === 'blind').passes, 2);
  assert.equal(stages.find((s) => s.id === 'listen').text, false);
  assert.equal(stages.find((s) => s.id === 'text').text, true);
  assert.equal(stages.find((s) => s.id === 'record').optional, true);
  assert.deepEqual(newStages({ record: false }).map((s) => s.id), ['listen', 'read', 'along', 'text', 'blind', 'rate']);
  for (const s of stages) assert.ok(STAGE_LABELS[s.id], `nimi vaiheelle ${s.id}`);
});

test('reviewStages: vahva kappale kerrataan ilman tekstiä nopeammin, heikko tekstin kanssa', () => {
  const weak = reviewStages({ stage: 1, rating: 'good' });
  assert.deepEqual(weak.map((s) => s.id), ['text', 'blind', 'rate']);
  const strong = reviewStages({ stage: 3, rating: 'good' });
  assert.deepEqual(strong.map((s) => s.id), ['blind', 'record', 'rate']);
  assert.equal(strong[0].speed, 'fast');
  assert.equal(strong[0].text, false);
  assert.deepEqual(reviewStages({ stage: 3, rating: 'hard' }).map((s) => s.id), ['text', 'blind', 'record', 'rate']);
  assert.ok(!reviewStages({ stage: 4, rating: 'good' }, { record: false }).some((s) => s.id === 'record'));
  assert.ok(!reviewStages({ stage: 1, rating: 'ok' }).some((s) => s.id === 'record'), 'nauhoitus vasta, kun kappale on tuttu');
});

test('kestoarviot: kierroksen kesto skaalautuu nopeuteen ja uuden kappaleen oppitunti on 4–7 minuuttia', () => {
  const p = P[0];
  assert.ok(audioMs(p, 'slow') > audioMs(p, 'normal') && audioMs(p, 'normal') > audioMs(p, 'fast'));
  assert.ok(audioMs(p) > 15000 && audioMs(p) < 40000);
  const ms = estimateMs(p, newStages());
  assert.ok(ms > 4 * 60000 && ms < 7 * 60000, `uusi kappale ${Math.round(ms / 1000)} s`);
  assert.equal(stagePasses(newStages()), 8);
  assert.ok(estimateMs(p, reviewStages({ stage: 1, rating: 'good' })) < ms / 1.5);
});

test('nopeudet: hidas < normaali < nopea ja valinnat löytyvät', () => {
  assert.deepEqual(SPEED_IDS, ['slow', 'normal', 'fast']);
  assert.ok(SPEEDS.slow.factor < SPEEDS.normal.factor && SPEEDS.normal.factor < SPEEDS.fast.factor);
  assert.equal(SPEEDS.normal.factor, 1);
});

/* ---------- Kertausajastus ---------- */

test('nextState: sujuva kappale etenee 1 → 3 → 7 → 14 → 30 päivän välein ja tulee opituksi', () => {
  let st;
  const days = [];
  let today = TODAY;
  for (let i = 0; i < 5; i++) {
    st = nextState(st, 'good', today, 8);
    days.push(st.due - today);
    today = st.due;
  }
  assert.deepEqual(days, SHADOW_INTERVALS);
  assert.equal(st.stage, 5);
  assert.ok(st.stage >= MASTERED_STAGE);
  assert.equal(st.sessions, 5);
  assert.equal(st.plays, 40);
  assert.equal(st.first, TODAY);
});

test('nextState: kohtalainen arvio pitää vaiheen, hankala laskee sitä ja tuo kappaleen huomiseksi', () => {
  const first = nextState(undefined, 'good', TODAY, 8); // vaihe 1
  const second = nextState(first, 'good', TODAY + 1, 4); // vaihe 2
  assert.equal(second.stage, 2);
  const ok = nextState(second, 'ok', TODAY + 4, 3);
  assert.equal(ok.stage, 2);
  assert.equal(ok.due - (TODAY + 4), SHADOW_INTERVALS[1], 'kohtalainen: edellisen vaiheen väli');
  const hard = nextState(second, 'hard', TODAY + 4, 3);
  assert.equal(hard.stage, 1);
  assert.equal(hard.due, TODAY + 5);
  assert.equal(nextState(undefined, 'hard', TODAY, 8).stage, 0, 'uusi ja hankala: vaihe pysyy nollassa');
  assert.equal(nextState(undefined, 'ok', TODAY, 8).stage, 1, 'uusi ja kohtalainen: vaihe 1');
  assert.equal(nextState(undefined, 'ok', TODAY, 8).due, TODAY + 1);
});

test('nextState: ei muuta annettua tilaa ja kestää outoja arvoja', () => {
  const prev = Object.freeze({ stage: 2, due: TODAY, last: TODAY - 3, first: TODAY - 10, rating: 'good', plays: 20, sessions: 3 });
  const next = nextState(prev, 'good', TODAY, 8);
  assert.equal(prev.stage, 2);
  assert.equal(next.first, TODAY - 10);
  assert.equal(nextState(undefined, 'good', TODAY, -5).plays, 0);
  assert.equal(nextState(undefined, 'good', TODAY, 2.6).plays, 3);
  assert.deepEqual(RATINGS, ['good', 'ok', 'hard']);
});

test('cleanShadowLog: pudottaa tuntemattomat kappaleet ja virheelliset kentät, säilyttää kelvolliset', () => {
  const ok = { stage: 2, due: TODAY + 3, last: TODAY, first: TODAY - 5, rating: 'good', plays: 12, sessions: 2 };
  const log = cleanShadowLog({
    'sh-01': ok,
    'sh-02': { stage: 'x', due: 1, last: 1 },
    'sh-03': null,
    'sh-99': ok,
    'sh-04': { stage: 3.4, due: TODAY, last: TODAY, rating: 'weird' },
    __proto__: { 'sh-05': ok },
  });
  assert.deepEqual(Object.keys(log).sort(), ['sh-01', 'sh-04']);
  assert.deepEqual(log['sh-01'], ok);
  assert.equal(log['sh-04'].stage, 3);
  assert.equal(log['sh-04'].rating, 'ok');
  assert.equal(log['sh-04'].plays, 0);
  assert.deepEqual(cleanShadowLog(null), {});
  assert.deepEqual(cleanShadowLog([1, 2]), {});
  assert.deepEqual(cleanShadowLog('x'), {});
});

const entry = (stage, due, extra = {}) => ({ stage, due, last: due - 3, first: due - 20, rating: 'good', plays: 10, sessions: 2, ...extra });

test('dueList: erääntyneet vanhin ensin, samana päivänä heikoin ensin', () => {
  const log = {
    'sh-01': entry(3, TODAY - 1),
    'sh-02': entry(1, TODAY),
    'sh-03': entry(2, TODAY + 2),
    'sh-04': entry(0, TODAY - 1),
    'sh-05': entry(4, TODAY - 5),
  };
  assert.deepEqual(dueList({ log, today: TODAY }).map((p) => p.id), ['sh-05', 'sh-04', 'sh-01', 'sh-02']);
});

/* ---------- Oppitunnin kokoaminen ---------- */

test('planLesson: tyhjä historia antaa uusia kappaleita 15 minuuttiin, ensimmäinen ensin', () => {
  const plan = planLesson({ log: {}, today: TODAY, totalMs: 15 * 60000 });
  assert.ok(plan.length >= 2 && plan.length <= 3, `kappaleita ${plan.length}`);
  assert.deepEqual(plan.map((i) => i.passage.id), P.slice(0, plan.length).map((p) => p.id));
  assert.ok(plan.every((i) => i.kind === 'new' && i.stages.length === 7));
  const total = plan.reduce((s, i) => s + i.estMs, 0);
  assert.ok(total <= 15 * 60000 + LESSON_SLACK_MS, `kokonaisarvio ${Math.round(total / 1000)} s`);
  assert.ok(total > 8 * 60000, 'oppitunti täyttää aikaa kunnolla');
});

test('planLesson: erääntyneet kertaukset ensin (enintään kolme), sitten uusia, aikaraja pitää', () => {
  const log = {};
  for (let i = 1; i <= 6; i++) log[`sh-0${i}`] = entry(1, TODAY - i);
  const plan = planLesson({ log, today: TODAY, totalMs: 15 * 60000 });
  const reviews = plan.filter((i) => i.kind === 'review');
  assert.ok(reviews.length >= 1 && reviews.length <= MAX_REVIEWS_PER_LESSON);
  assert.deepEqual(reviews.map((i) => i.passage.id), ['sh-06', 'sh-05', 'sh-04'].slice(0, reviews.length));
  assert.ok(plan.slice(0, reviews.length).every((i) => i.kind === 'review'), 'kertaukset ovat oppitunnin alussa');
  const total = plan.reduce((s, i) => s + i.estMs, 0);
  assert.ok(total <= 15 * 60000 + LESSON_SLACK_MS);
  for (const i of plan.filter((x) => x.kind === 'new')) assert.ok(!log[i.passage.id], 'uusi kappale ei ole jo harjoiteltu');
});

test('planLesson: lyhyt oppitunti mahtuu aina vähintään yhteen kappaleeseen', () => {
  const plan = planLesson({ log: {}, today: TODAY, totalMs: 60000 });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, 'new');
});

test('planLesson: kun kaikki on käyty läpi eikä mikään ole erääntynyt, harjoitellaan vähiten äskettäin harjoiteltuja', () => {
  const log = {};
  P.forEach((p, i) => (log[p.id] = entry(2, TODAY + 5 + i, { last: TODAY - 24 + i })));
  const plan = planLesson({ log, today: TODAY, totalMs: 15 * 60000 });
  assert.ok(plan.length >= 1 && plan.length <= 2);
  assert.ok(plan.every((i) => i.kind === 'review'));
  assert.equal(plan[0].passage.id, P[0].id, 'vanhin harjoitus ensin');
});

test('planLesson: nauhoitusvaihe jää pois, kun sitä ei tarjota', () => {
  const plan = planLesson({ log: {}, today: TODAY, totalMs: 15 * 60000, record: false });
  assert.ok(plan.every((i) => !i.stages.some((s) => s.id === 'record')));
});

test('planLesson: ei koskaan yhtä kappaletta kahdesti ja kappaleita on vähintään yksi, vaikka lokissa olisi kaikki', () => {
  const log = {};
  for (const p of P) log[p.id] = entry(5, TODAY - 1);
  const plan = planLesson({ log, today: TODAY, totalMs: 20 * 60000 });
  assert.ok(plan.length >= 1);
  assert.equal(new Set(plan.map((i) => i.passage.id)).size, plan.length);
});

test('summarizeShadow ja nextDueDay: luvut Tänään-näkymään', () => {
  const log = { 'sh-01': entry(5, TODAY + 30), 'sh-02': entry(1, TODAY - 1), 'sh-03': entry(2, TODAY + 3) };
  const sum = summarizeShadow(log, P, TODAY);
  assert.deepEqual(sum, { total: P.length, seen: 3, due: 1, mastered: 1, unseen: P.length - 3 });
  assert.equal(nextDueDay(log, TODAY), TODAY + 3);
  assert.equal(nextDueDay({}, TODAY), null);
  assert.deepEqual(summarizeShadow({}, P, TODAY), { total: P.length, seen: 0, due: 0, mastered: 0, unseen: P.length });
});

/* ---------- Näkymän apufunktiot ---------- */

test('dueText: huomenna tai päivien määrä', () => {
  assert.equal(dueText(1), 'huomenna');
  assert.equal(dueText(0), 'huomenna');
  assert.equal(dueText(3), '3 pv päästä');
  assert.equal(dueText(30), '30 pv päästä');
});

test('phaseLabels: numeroi vain, jos samanlaisia on useita', () => {
  const plan = [{ kind: 'review' }, { kind: 'review' }, { kind: 'new' }];
  assert.deepEqual(phaseLabels(plan), [
    { id: '0', label: 'Kertaus 1' },
    { id: '1', label: 'Kertaus 2' },
    { id: '2', label: 'Uusi' },
  ]);
  assert.deepEqual(phaseLabels([{ kind: 'new' }]), [{ id: '0', label: 'Uusi' }]);
  assert.deepEqual(phaseLabels([{ kind: 'new' }, { kind: 'new' }]).map((p) => p.label), ['Uusi 1', 'Uusi 2']);
});

test('buildMoves: yksi siirtymä per kierros sekä lukeminen, nauhoitus ja arvio', () => {
  const moves = buildMoves(newStages());
  assert.equal(moves.length, 1 + 1 + 1 + 3 + 2 + 1 + 1);
  assert.deepEqual(moves.map((m) => m.kind), ['pass', 'read', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'record', 'rate']);
  const text = moves.filter((m) => m.kind === 'pass' && m.stage.id === 'text');
  assert.deepEqual(text.map((m) => [m.n, m.of]), [[1, 3], [2, 3], [3, 3]]);
  assert.equal(moves.filter((m) => m.kind === 'pass').length, 7, 'kuuntelu 1 + mukana 1 + teksti 3 + ilman tekstiä 2');
});

test('nextLabelFor: kertoo seuraavan kierroksen tai vaiheen', () => {
  const moves = buildMoves(newStages());
  const idx = moves.findIndex((m) => m.kind === 'pass' && m.stage.id === 'text' && m.n === 1);
  assert.equal(nextLabelFor(moves[idx], moves[idx + 1]), 'Kierros 2 / 3');
  assert.equal(nextLabelFor(moves[idx + 2], moves[idx + 3]), `Jatka: ${STAGE_LABELS.blind}`);
  assert.equal(nextLabelFor(moves[0], moves[1]), `Jatka: ${STAGE_LABELS.read}`);
  assert.equal(nextLabelFor(moves.at(-1), undefined), 'Valmis');
});

/* ---------- Asetukset ---------- */

test('asetukset: shadowing-oletukset ja siivous', () => {
  assert.equal(DEFAULT_SETTINGS.shadowMinutes, 15);
  assert.equal(DEFAULT_SETTINGS.shadowRecord, true);
  const s = sanitizeSettings({ v: 2, shadowMinutes: 20, shadowRecord: false });
  assert.equal(s.shadowMinutes, 20);
  assert.equal(s.shadowRecord, false);
  assert.equal(sanitizeSettings({ v: 2, shadowMinutes: 'x', shadowRecord: 'no' }).shadowMinutes, 15);
  assert.equal(sanitizeSettings({ v: 2, shadowMinutes: 999 }).shadowMinutes, 30);
  assert.equal(sanitizeSettings({ v: 2, shadowMinutes: 1 }).shadowMinutes, 5);
  assert.equal(sanitizeSettings({}).shadowRecord, true, 'vanhoissa asetuksissa uudet kentät saavat oletuksen');
});

/* ---------- Nauhoitus ---------- */

test('recorder: tuen tunnistus ja muodon valinta', () => {
  assert.equal(recordingSupported({ mediaDevices: { getUserMedia() {} } }, function MR() {}), true);
  assert.equal(recordingSupported({ mediaDevices: {} }, function MR() {}), false);
  assert.equal(recordingSupported({ mediaDevices: { getUserMedia() {} } }, undefined), false);
  assert.equal(recordingSupported(undefined, function MR() {}), false);
  const MR = { isTypeSupported: (t) => t === 'audio/ogg;codecs=opus' };
  assert.equal(pickMimeType(MR), 'audio/ogg;codecs=opus');
  assert.equal(pickMimeType({ isTypeSupported: () => false }), '');
  assert.equal(pickMimeType({ isTypeSupported: () => { throw new Error('x'); } }), '');
  assert.equal(pickMimeType({}), '');
  assert.equal(pickMimeType(undefined), '');
});

test('recorder: virhekoodit ja tekstit', () => {
  assert.equal(recorderErrorCode({ name: 'NotAllowedError' }), 'denied');
  assert.equal(recorderErrorCode({ name: 'SecurityError' }), 'denied');
  assert.equal(recorderErrorCode({ name: 'NotFoundError' }), 'no-mic');
  assert.equal(recorderErrorCode({ name: 'AbortError' }), 'failed');
  assert.equal(recorderErrorCode(null), 'failed');
  for (const code of ['denied', 'no-mic', 'unsupported', 'failed']) assert.ok(recorderErrorText(code).length > 10);
  assert.notEqual(recorderErrorText('denied'), recorderErrorText('failed'));
});

class FakeRecorder {
  static types = new Set(['audio/webm;codecs=opus']);
  static isTypeSupported(t) {
    return FakeRecorder.types.has(t);
  }
  constructor(stream, opts = {}) {
    this.stream = stream;
    this.mimeType = opts.mimeType ?? '';
    this.state = 'inactive';
    this.l = new Map();
  }
  addEventListener(name, fn) {
    this.l.set(name, [...(this.l.get(name) ?? []), fn]);
  }
  emit(name, ev = {}) {
    for (const fn of this.l.get(name) ?? []) fn(ev);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.emit('dataavailable', { data: new Blob(['abc'], { type: this.mimeType }) });
    this.emit('stop');
  }
}

const fakeNav = (opts = {}) => {
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  return {
    tracks,
    nav: {
      mediaDevices: {
        async getUserMedia(c) {
          fakeNav.lastConstraints = c;
          if (opts.error) throw Object.assign(new Error('x'), { name: opts.error });
          return { getTracks: () => tracks };
        },
      },
    },
  };
};

test('startRecording: nauhoittaa, palauttaa Blobin ja vapauttaa mikrofonin', async () => {
  const { nav, tracks } = fakeNav();
  const r = await startRecording({ nav, MR: FakeRecorder });
  assert.equal(r.ok, true);
  assert.equal(fakeNav.lastConstraints.audio.echoCancellation, true);
  const out = await r.stop();
  assert.ok(out.blob instanceof Blob && out.blob.size === 3);
  assert.equal(out.type, 'audio/webm;codecs=opus');
  assert.equal(tracks[0].stopped, true);
});

test('startRecording: peruutus hylkää nauhoituksen ja vapauttaa mikrofonin', async () => {
  const { nav, tracks } = fakeNav();
  const r = await startRecording({ nav, MR: FakeRecorder });
  r.cancel();
  assert.equal(tracks[0].stopped, true);
});

test('startRecording: estetty ja puuttuva mikrofoni sekä puuttuva tuki palautuvat virhekoodina', async () => {
  const denied = fakeNav({ error: 'NotAllowedError' });
  assert.deepEqual(await startRecording({ nav: denied.nav, MR: FakeRecorder }), { ok: false, error: 'denied' });
  const none = fakeNav({ error: 'NotFoundError' });
  assert.deepEqual(await startRecording({ nav: none.nav, MR: FakeRecorder }), { ok: false, error: 'no-mic' });
  assert.deepEqual(await startRecording({ nav: {}, MR: FakeRecorder }), { ok: false, error: 'unsupported' });
});

test('startRecording: jos MediaRecorderin luonti epäonnistuu, mikrofoni vapautetaan', async () => {
  const { nav, tracks } = fakeNav();
  class Broken {
    static isTypeSupported() {
      return false;
    }
    constructor() {
      throw new Error('boom');
    }
  }
  assert.deepEqual(await startRecording({ nav, MR: Broken }), { ok: false, error: 'failed' });
  assert.equal(tracks[0].stopped, true);
});

/* ---------- Varmuuskopio ---------- */

const bk = (over = {}) => ({ stage: 2, due: TODAY + 3, last: TODAY, first: TODAY - 6, rating: 'good', plays: 16, sessions: 2, ...over });

test('mergeShadowLogs: kappaleesta voittaa viimeksi harjoiteltu, tasatilanteessa useammin harjoiteltu, muut säilyvät', () => {
  const a = { 'sh-01': bk({ last: 10, sessions: 5 }), 'sh-02': bk({ last: 20, sessions: 1 }), 'sh-03': bk({ last: 7 }) };
  const b = { 'sh-01': bk({ last: 12, sessions: 2 }), 'sh-02': bk({ last: 20, sessions: 3 }), 'sh-04': bk({ last: 1 }) };
  const m = mergeShadowLogs(a, b);
  assert.equal(m['sh-01'].last, 12, 'uudempi voittaa vaikka sessioita on vähemmän');
  assert.equal(m['sh-02'].sessions, 3, 'tasatilanteessa useammin harjoiteltu');
  assert.deepEqual(Object.keys(m).sort(), ['sh-01', 'sh-02', 'sh-03', 'sh-04']);
  assert.deepEqual(mergeShadowLogs({}, undefined), {});
  assert.equal(a['sh-01'].last, 10, 'parametreja ei muuteta');
});

test('varmuuskopio: shadowing-edistyminen lähtee mukaan, siivoutuu ja palautuu tuonnissa', async () => {
  const db = await openDb({ memory: true });
  await db.setKv('shadowLog', { 'sh-01': bk(), 'sh-99': bk(), 'sh-02': 'roska' });
  const backup = await exportBackup(db);
  assert.deepEqual(Object.keys(backup.shadowLog), ['sh-01'], 'tuntemattomat ja virheelliset pudotetaan viennissä');
  const wire = JSON.parse(JSON.stringify(backup));
  const fresh = await openDb({ memory: true });
  const res = await importBackup(fresh, wire);
  assert.equal(res.shadow, 1);
  assert.deepEqual(await fresh.getKv('shadowLog'), { 'sh-01': bk() });
});

test('varmuuskopio: ilman shadowing-edistymistä viety kopio on tyhjä kenttä, ja kenttä on valinnainen tuonnissa', async () => {
  const db = await openDb({ memory: true });
  assert.deepEqual((await exportBackup(db)).shadowLog, {});
  const old = { app: BACKUP_APP, schema: 1, cards: [], reviews: [] }; // 0.6-versiolla tehty kopio
  const v = validateBackup(old);
  assert.equal(v.ok, true);
  assert.equal(v.shadowLog, undefined);
});

test('tuonti korvaten: vanha kopio ei hävitä nykyistä shadowing-edistymistä, mutta uuden kopion edistyminen korvaa sen', async () => {
  const db = await openDb({ memory: true });
  await db.setKv('shadowLog', { 'sh-01': bk({ stage: 4 }) });
  const old = { app: BACKUP_APP, schema: 1, cards: [], reviews: [] };
  const r1 = await importBackup(db, old, { mode: 'replace' });
  assert.equal(r1.shadow, 0);
  assert.equal((await db.getKv('shadowLog'))['sh-01'].stage, 4, 'vanhassa kopiossa ei ole kenttää: nykyinen säilyy');
  const withLog = { ...old, shadowLog: { 'sh-02': bk({ stage: 1 }) } };
  const r2 = await importBackup(db, JSON.parse(JSON.stringify(withLog)), { mode: 'replace' });
  assert.equal(r2.shadow, 1);
  assert.deepEqual(Object.keys(await db.getKv('shadowLog')), ['sh-02'], 'kopion edistyminen korvaa nykyisen');
  const empty = { ...old, shadowLog: {} };
  await importBackup(db, empty, { mode: 'replace' });
  assert.deepEqual(await db.getKv('shadowLog'), {}, 'tyhjä kenttä on tosi: aiempaa edistymistä ei ollut');
});

test('tuonti yhdistäen: shadowing-edistyminen yhdistyy kappale kerrallaan eikä muu paikallinen data katoa', async () => {
  const db = await openDb({ memory: true });
  await db.setKv('shadowLog', { 'sh-01': bk({ last: 30, stage: 3 }), 'sh-02': bk({ last: 5, stage: 1 }) });
  await db.setKv('lastShadow', { day: 30, passages: 1 });
  const backup = { app: BACKUP_APP, schema: 1, cards: [], reviews: [], shadowLog: { 'sh-01': bk({ last: 10, stage: 1 }), 'sh-02': bk({ last: 9, stage: 2 }), 'sh-03': bk({ last: 2 }) } };
  const res = await importBackup(db, backup, { mode: 'merge' });
  assert.equal(res.shadow, 3);
  const log = await db.getKv('shadowLog');
  assert.equal(log['sh-01'].stage, 3, 'nykyinen uudempi säilyy');
  assert.equal(log['sh-02'].stage, 2, 'kopion uudempi voittaa');
  assert.ok(log['sh-03']);
  assert.deepEqual(await db.getKv('lastShadow'), { day: 30, passages: 1 }, 'muu paikallinen tieto säilyy yhdistettäessä');
});

test('validateBackup: virheellinen shadowing-edistyminen hylätään, roskarivit pudotetaan', () => {
  for (const bad of [null, [], 'roska', 5]) {
    const v = validateBackup({ app: BACKUP_APP, schema: 1, cards: [], shadowLog: bad });
    assert.equal(v.ok, false, `arvo ${JSON.stringify(bad)}`);
    assert.match(v.errors.join(' '), /Shadowing/);
  }
  const v = validateBackup({ app: BACKUP_APP, schema: 1, cards: [], shadowLog: { 'sh-01': bk({ stage: 999, plays: -3 }), 'sh-77': bk(), '../x': bk(), 'sh-02': { stage: 'x' } } });
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.shadowLog), ['sh-01']);
  assert.equal(v.shadowLog['sh-01'].stage, 50, 'vaihe rajataan');
  assert.equal(v.shadowLog['sh-01'].plays, 0);
});
