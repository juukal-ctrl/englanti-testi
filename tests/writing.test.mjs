import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, UNIT_ORDER } from '../data/units.js';
import { WRITING_TASKS } from '../data/writing.js';
import { RULES, CATEGORY_LABELS } from '../js/writing-rules.js';
import { checkWriting, countWords, phraseUsed, phraseKey, speechParts, probeText, isClean, validateTasks } from '../js/writing.js';

const idsOf = (text, task = {}) => checkWriting(task, text).issues.map((i) => i.id);
const polite = { tone: 'polite' };

/* ---------- Sisältö ---------- */

test('kirjoitustehtävät läpäisevät rakenne- ja mallivastaustarkistukset', () => {
  assert.deepEqual(validateTasks(WRITING_TASKS, { unitIds: UNIT_ORDER }), []);
});

test('jokaiselle aiheelle on tasan yksi tehtävä', () => {
  assert.equal(WRITING_TASKS.length, UNITS.length);
  assert.deepEqual(new Set(WRITING_TASKS.map((t) => t.unit)), new Set(UNIT_ORDER));
  assert.equal(new Set(WRITING_TASKS.map((t) => t.id)).size, WRITING_TASKS.length);
});

test('tehtävissä on vaihtelua: viestityypit, saatu viesti ja kohteliaisuustila', () => {
  const formats = new Set(WRITING_TASKS.map((t) => t.format));
  assert.deepEqual([...formats].sort(), ['chat', 'email', 'message']);
  assert.ok(WRITING_TASKS.filter((t) => t.incoming).length >= 3);
  assert.ok(WRITING_TASKS.filter((t) => t.tone === 'polite').length >= 4);
});

test('mallivastaukset kirjoitetaan kokonaisina: jokaisella tehtävällä on lauseita ääntä varten', () => {
  for (const t of WRITING_TASKS) {
    const parts = speechParts(t.model);
    assert.ok(parts.length >= 3, `${t.id}: lauseita ${parts.length}`);
    assert.ok(parts.every((p) => /[.!?,]$/.test(p)), `${t.id}: lause ilman loppumerkkiä: ${parts.find((p) => !/[.!?,]$/.test(p))}`);
  }
});

test('validateTasks löytää rikkinäisen sisällön', () => {
  const base = WRITING_TASKS[0];
  const broken = [
    { ...base, id: 'bad' },
    { ...base, id: 'w-a', unit: 'olematon' },
    { ...base, id: 'w-b', model: ['Hi David,', 'Short.', 'Best,\nAlex'] },
    { ...base, id: 'w-c', model: base.model.map((p) => p.replace('follow up on', 'follow up about')) },
    { ...base, id: 'w-d', use: ['mail-01', 'olematon-99'] },
    { ...base, id: 'w-e', points: [{ fi: 'x', any: ['(avoin'] }, { fi: 'y', any: ['z'] }] },
    { ...base, id: 'w-f', model: base.model.map((p) => p.replace('Hi David,', 'hi David,')) },
    { ...base, id: 'w-g', scenario: 'Tilanne — ajatusviivalla.' },
    { ...base, id: 'w-h', format: 'sms' },
  ];
  const errors = validateTasks(broken, { unitIds: UNIT_ORDER }).join('\n');
  assert.match(errors, /bad: tunnisteen muoto/);
  assert.match(errors, /w-a: aihetta olematon ei ole/);
  assert.match(errors, /w-b: mallivastauksen pituus/);
  assert.match(errors, /w-c: mallivastaus ei käytä ilmausta mail-01/);
  assert.match(errors, /w-d: ilmausta olematon-99 ei ole/);
  assert.match(errors, /w-e: virheellinen lauseke/);
  assert.match(errors, /w-f: mallivastaus rikkoo säännön sentence-case/);
  assert.match(errors, /w-g: .*sisältää ajatusviivan/);
  assert.match(errors, /w-h: format on virheellinen/);
});

/* ---------- Sääntötaulukko ---------- */

// [sääntö, väärät esimerkit, oikeat esimerkit, odotettu ehdotus ensimmäiselle väärälle (valinnainen), tehtävä (valinnainen)]
const CASES = [
  ['discuss-about', ['We need to discuss about the plan.'], ['We need to discuss the plan.', "Let's talk about it."], 'discuss'],
  ['explain-me', ['Could you explain me the process?'], ['Could you explain the process to me?', 'Please explain it to him.'], 'explain to me'],
  ['say-me', ['He said me that it was late.'], ['He told me that it was late.', 'Say hello to them.'], 'told me that'],
  ['inform-that', ['We inform that the system is down.', 'I wanted to remind that the deadline is Friday.'], ['We inform you that the system is down.'], 'inform you that'],
  ['depend', ['It depends of the weather.', 'That depend from the plan.'], ['It depends on the weather.'], 'depends on'],
  ['interested', ["I'm interested of this.", 'She is interested about it.'], ["I'm interested in this.", "I'd be interested to hear more."], 'interested in'],
  ['responsible', ["I'm responsible of the project."], ["I'm responsible for the project.", 'He is responsible to the board.'], 'responsible for'],
  ['participate', ['We participate to the call.'], ['We participate in the call.'], 'participate in'],
  ['reply-for', ['I replied for your email.'], ['I replied to your email.', 'Reply on the ticket.']],
  ['wait-obj', ["I'm waiting your reply."], ["I'm waiting for your reply.", 'We wait for the payment.'], "waiting for your reply"],
  ['attachment-on', ['The details are on the attachment.'], ['The details are in the attachment.'], 'in the attachment'],
  ['end-beginning-of', ['In the end of the month we pay.', 'It starts in the beginning of June.'], ['In the end, we agreed.', 'At the end of the month we pay.'], 'At the end of'],
  ['this-moment', ["I'm busy in this moment."], ["I'm busy at the moment."], 'at the moment'],
  ['my-opinion', ['On my opinion it is fine.'], ['In my opinion it is fine.'], 'in my opinion'],
  ['according-to-me', ['According to me, it is fine.'], ['According to the contract, it is fine.'], 'in my opinion'],
  ['since-duration', ['We have worked together since two years.', 'Waiting since 3 days.'], ['We have worked together for two years.', 'We have worked together since 2022.', 'Since a week ago we have waited.'], 'for two years'],
  ['weekday-in', ['See you in Monday.', 'The call is in Friday morning.'], ['See you on Monday.', "We discussed it in Monday's meeting."], 'on Monday'],
  ['month-on', ['We start on March.'], ['We start in March.', 'We start on March 5.', 'We start on May 5.'], 'in March'],
  ['clock-in', ['The call is in 3 p.m.', 'See you in 10:30 am.'], ['The call is at 3 p.m.', 'It will be ready in 5 minutes.'], 'at 3 p.m.'],
  ['looking-forward', ['Looking forward to hear from you.', 'I look forward to see you.', 'We look forward to work with you.'], ['Looking forward to hearing from you.', 'I look forward to our call.'], 'Looking forward to hearing'],
  ['regarding-to', ["I'm writing regarding to the invoice."], ["I'm writing regarding the invoice."], 'regarding'],
  ['according-the', ['According the contract, we pay.'], ['According to the contract, we pay.'], 'According to the'],
  ['suggest-to', ['I suggest to send it today.', 'We recommend to use the portal.'], ['I suggest sending it today.', "I'd suggest we send it today.", 'I suggested to the team that we wait.'] ],
  ['make-obj-to', ['Let me to know.', 'This made us to wait.'], ['Let me know.', 'This made us wait.'], 'Let me know'],
  ['enjoy-avoid-to', ['I enjoy to work here.', 'Please avoid to send it twice.'], ['I enjoy working here.', 'Please avoid sending it twice.']],
  ['same-like', ['It is the same like last year.'], ['It is the same as last year.'], 'the same as'],
  ['then-than', ['It is better then before.', 'It is later then we agreed.'], ['It is better than before.', 'First call, and then we wait.'], 'better than'],
  ['agree-am', ['I am agree with you.', "I'm agree.", 'We are agree.', 'She is agree.'], ['I agree with you.', "I'm not sure I agree."], 'I agree'],
  ['will-can', ['I will can help next week.'], ['I will be able to help.', 'I can help.'], 'will be able to'],
  ['modal-to', ['We can to send it.'], ['We want to send it.', "I'd like to send it."], 'can send'],
  ['since-present', ['I work here since 2019.', "I'm working here since Monday."], ['I have worked here since 2019.', 'Since 2019, we work with them.', 'We are writing since you asked.']],
  ['perfect-past-time', ['I have sent it yesterday.', 'We have received your message two days ago.', 'She has called last week.'], ['I sent it yesterday.', 'I have sent the file we discussed last week.', 'We have worked together for two years.']],
  ['hope-fine', ['I hope you are fine.'], ["I hope you're doing well."], 'hope you’re doing well'],
  ['make-question', ['I want to make a question.'], ['I want to ask a question.']],
  ['do-decision', ['We did a mistake.', 'They do decisions fast.'], ['We made a mistake.', 'They did offer a discount.', 'Decision-making is slow.']],
  ['uncountable-a', ['I need a feedback.', 'Thanks for an information about it.'], ['I need some feedback.', 'We have an information session.', 'Please fill in a feedback form.']],
  ['uncountable-plural', ['Send me the informations.', 'Thanks for the advices.'], ['Send me the information.', 'Thanks for the advice.'], 'information'],
  ['actual-current', ['The actual situation is unclear.'], ['The current situation is unclear.', 'The actual cost was higher.'], 'current situation'],
  ['treat-invoice', ['We treat the invoice today.'], ['We handle the invoice today.', 'They treat customers well.']],
  ['reclamation', ['We received a reclamation.'], ['We received a complaint.'], 'complaint'],
  ['absent', ['I will be absent next week.'], ['I will be out of the office next week.']],
  ['next-days', ['We will call in the next days.'], ['We will call in the next few days.']],
  ['latest-by', ['Please reply latest by Friday.'], ['Please reply by Friday at the latest.']],
  ['until-deadline', ['Please send it until Friday.'], ['Please send it by Friday.', 'We will work until Friday.']],
  ['i-want', ['I want you to send it.'], ['I want to thank you.', "I'd like you to send it."], undefined, polite],
  ['you-must', ['You must send it today.', 'You need to send it today.'], ['You should receive it soon.', 'Could you send it today?'], undefined, polite],
  ['kindly', ['Kindly send the file.'], ['Could you send the file?']],
  ['dear-sir', ['Dear Sir or Madam,'], ['Dear Ms. Lee,']],
  ['yours-sincerely', ['Yours sincerely,'], ['Sincerely,']],
  ['inform-you', ['I would like to inform you that the system is up.'], ['I wanted to let you know that the system is up.']],
  ['date-dots', ['Due 3.11.2026.', 'On 15.1.26 we agreed.'], ['Version 1.2.3 is out.', 'IP 192.168.1.1 is blocked.', 'We have 3.5 million users.'], 'November 3, 2026'],
  ['date-dots-short', ['See you on 3.11. at the office.'], ['Version 1.2.3 is out.', 'Pi is 3.14 and e is 2.72.'], 'November 3'],
  ['date-of', ['We meet on the 3rd of November.'], ['We meet on November 3.']],
  ['date-day-month', ['Please pay by 15 October.'], ['Please pay by October 15.', 'Only 5 may attend.'], 'October 15'],
  ['time-24h', ['The call is at 15:00.', 'The call is at 13:30.'], ['The call is at 3 p.m.', 'The call is at 10:30.', 'The call is at 3:30 p.m.'], '3 p.m.'],
  ['klo', ['Tomorrow klo 15 we meet.'], ['Tomorrow at 3 p.m. we meet.']],
  ['decimal-comma', ['It takes about 1,5 hours.'], ['It takes about 1.5 hours.', 'We sent 1,250 invoices.', 'Items 1,2,3 are done.'], '1.5'],
  ['thousands-space', ['We sent 10 000 invoices.'], ['We sent 10,000 invoices.', 'On 5 May 2026 we met.'], '10,000'],
  ['euro-after', ['It costs 100 €.', 'It costs 2 400 €.'], ['It costs €100.', 'It costs 100 euros.'], '€100'],
  ['percent-space', ['We offer 50 % off.'], ['We offer 50% off.'], '50%'],
  ['fi-abbr', ['Tools, esim. Excel, are fine.', 'See vk 45.'], ['Tools, e.g. Excel, are fine.', 'See week 45.']],
  ['alv', ['The ALV is 24%.'], ['The VAT is 24%.'], 'VAT'],
  ['lowercase-i', ['so i think it is fine.', "i'm sure it is fine."], ['I think it is fine.', 'That is, i.e. fine.', 'Use Wi-Fi at (i) the office.'], 'I'],
  ['lowercase-day-month', ['See you on monday.', 'It starts in november.'], ['See you on Monday.', 'We march on.', 'It may start in May.'], 'Monday'],
  ['a-an', ['We need a hour.', 'We need an user.', 'It is a apple.', 'It is a 8-hour day.'], ['We need an hour.', 'We need a user.', 'It is a European rule.', 'It is an 8-hour day.', 'It is a one-time fee.', 'It is a 15-minute call.', 'It is a unique case.', 'It is an MBA.', 'It is a SQL query.', 'Option a and b.'], 'an hour'],
  ['repeat-word', ['We need the the plan.'], ['I think that that is fine.', 'She had had enough.']],
  ['sentence-case', ['We met. thanks for coming.', 'Hello,\nthanks for the update.'], ['Meet at 3 p.m. on Friday.', 'Use e.g. the portal.', 'Write to alex@example.com\nwww.example.com is down.']],
  ['imperative', ['Send me the report.', 'Thanks. Pay the invoice today.'], ['Please send me the report.', 'Could you send me the report?', 'Do not hesitate to call.'], undefined, polite],
  ['us-colour', ['The colour is blue.'], ['The color is blue.'], 'color'],
  ['us-organis', ['We organised a meeting.', 'The organisation grew.'], ['We organized a meeting.', 'The organization grew.']],
  ['us-analys', ['We analysed the data.'], ['The analysis is ready.', 'Both analyses are ready.']],
  ['us-emphasis', ['We emphasise quality.'], ['The emphasis is on quality.']],
  ['us-centre', ['Visit our centre.'], ['Visit our center.']],
  ['us-enquir', ['Thanks for your enquiry.', 'Please enquire at the desk.'], ['Thanks for your inquiry.']],
  ['us-licenc', ['Buy a licence.'], ['Buy a license.']],
  ['us-practis', ['We practised the call.'], ['We practiced the call.', 'Practice makes perfect.']],
  ['us-travell', ['She travelled to Boston.'], ['She traveled to Boston.']],
  ['us-whilst', ['Whilst we wait, call me.'], ['While we wait, call me.']],
  ['us-learnt', ['We learnt a lot.'], ['We learned a lot.']],
  ['us-enrol', ['Please enrol today.', 'The enrolment is open.'], ['Please enroll today.', 'She was enrolled in May.']],
  ['us-fulfil', ['We fulfil the order.', 'The fulfilment team'], ['We fulfill the order.', 'We fulfilled the order.']],
  ['apostrophe', ['We dont know.', 'It isnt ready.', 'Ive sent it.'], ["We don't know.", "It isn't ready."], "don't"],
  ['compound', ['Thanks alot.', 'We check everytime.'], ['Thanks a lot.', 'We check every time.'], 'a lot'],
  ['typo-recieve', ['We recieve it.'], ['We receive it.'], 'receive'],
  ['typo-payed', ['It was payed.'], ['It was paid.'], 'paid'],
  ['us-apologis', ['I apologise for it.'], ['I apologize for it.']],
  ['relative-what', ['This is the guide what I sent you.', 'We read the report what was attached.'], ['This is the guide that I sent you.', 'Tell me what I should do.', 'I know what you mean.']],
  ['a-help', ['Do you need a help with it?'], ['Do you need help with it?', 'He was a great help.'], 'need help'],
  ['follow-up-on', ['I wanted to follow up the guide.'], ['I wanted to follow up on the guide.', 'Please follow up with the vendor.']],
  ['looking-forward-for', ['I am looking forward your reply.', 'Looking forward for your answer.'], ['Looking forward to your reply.', 'We look forward to it.']],
  ['do-modal', ['Do you can help me?'], ['Can you help me?', 'Do you want to help?']],
  ['much-many', ['We have much customers.'], ['We have many customers.', 'We have much work.']],
  ['less-fewer', ['We have less errors now.'], ['We have fewer errors now.', 'We have less time.']],
  ['this-morning', ['I called you today morning.'], ['I called you this morning.', 'I called you yesterday morning.']],
  ['come-back-to', ['I will come back to you on Friday.'], ['I will get back to you on Friday.']],
  ['quick-reply', ['Thanks for your fast reply.'], ['Thanks for your quick reply.', 'We need a fast solution.']],
  ['open-for', ['We are open for feedback.'], ['We are open to feedback.', 'We are open for business.']],
  ['title-dot', ['Dear Ms Bennett,', 'Hello Mr Lee,'], ['Dear Ms. Bennett,', 'Hello Mr. Lee,']],
  ['finnish-word', ['Please check the lasku.', 'Kiitos for your help.'], ['The invoice is attached.', 'Thanks for your help.']],
];

for (const [id, bad, good, fix, task] of CASES) {
  test(`sääntö ${id}: huomauttaa väärästä, ei oikeasta`, () => {
    bad.forEach((text, n) => {
      const res = checkWriting(task ?? {}, text);
      const hit = res.issues.find((i) => i.id === id);
      assert.ok(hit, `pitäisi huomauttaa: "${text}" (löytyi: ${res.issues.map((i) => i.id).join(', ') || 'ei mitään'})`);
      assert.ok(hit.fi && hit.fi.length > 10, `${id}: selitys puuttuu`);
      assert.ok(CATEGORY_LABELS[hit.cat], `${id}: tuntematon luokka ${hit.cat}`);
      assert.equal(hit.quote, hit.quote.trim(), `${id}: lainauksen reunoilla on välilyöntejä`);
      assert.equal(text.slice(hit.start, hit.end), hit.quote, `${id}: kohta ei vastaa lainausta`);
      if (typeof hit.fix === 'string') assert.equal(hit.fix, hit.fix.trim(), `${id}: ehdotuksen reunoilla on välilyöntejä`);
      if (n === 0 && fix !== undefined) assert.equal(hit.fix, fix, `${id}: ehdotus`);
    });
    good.forEach((text) => {
      const found = idsOf(text, task ?? {});
      assert.ok(!found.includes(id), `ei saisi huomauttaa: "${text}" (sääntö ${id})`);
    });
  });
}

test('kaikilla käsin kirjoitetuilla säännöillä on testitapaus', () => {
  const tested = new Set(CASES.map((c) => c[0]));
  const generated = (id) => /^(?:us-|typo-)/.test(id);
  const missing = RULES.filter((r) => !tested.has(r.id) && !generated(r.id)).map((r) => r.id);
  assert.deepEqual(missing, []);
});

test('säännöillä on yksilölliset tunnisteet, kelvolliset luokat ja selitykset', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of RULES) {
    assert.ok(CATEGORY_LABELS[r.cat], `${r.id}: luokka`);
    assert.ok(['error', 'tip'].includes(r.sev), `${r.id}: vakavuus`);
    assert.ok(r.re instanceof RegExp, `${r.id}: lauseke`);
    assert.ok(typeof r.fi === 'string' || typeof r.fi === 'function', `${r.id}: selitys`);
  }
});

test('oikeinkirjoitustaulukko: jokainen kirjoitusvirhe korjataan oikeaan muotoon', () => {
  const typos = RULES.filter((r) => r.id.startsWith('typo-'));
  assert.ok(typos.length >= 60);
  for (const r of typos) {
    const wrong = r.id.slice('typo-'.length);
    const res = checkWriting({}, `Please check ${wrong} today.`);
    const hit = res.issues.find((i) => i.id === r.id);
    assert.ok(hit, `${wrong} ei tunnistettu`);
    assert.ok(hit.fix && hit.fix !== wrong, `${wrong}: ehdotus puuttuu`);
    assert.ok(!checkWriting({}, `Please check ${hit.fix.toLowerCase()} today.`).issues.some((i) => i.id === r.id), `${hit.fix} ei saa laukaista omaa sääntöään`);
  }
});

/* ---------- Moottorin toiminta ---------- */

test('countWords laskee sanat, heittomerkilliset muodot ja luvut', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n '), 0);
  assert.equal(countWords("I'm writing to follow up on the e-invoice."), 8);
  assert.equal(countWords('Hi John,\n\nThe call is at 3 p.m.'), 8);
  assert.equal(countWords("It’s 15 minutes"), 3);
});

test('probeText yhtenäistää lainausmerkit ja välilyönnit merkkien paikat säilyttäen', () => {
  const raw = 'It’s “fine” today\r\nok';
  const out = probeText(raw);
  assert.equal(out, 'It\'s "fine" today\nok');
  assert.equal(probeText(raw).length, raw.length - 1); // vain \r\n → \n lyhentää
});

test('kaareva heittomerkki ei estä sääntöjen toimintaa', () => {
  assert.ok(idsOf('I’m agree with that.').includes('agree-am'));
  assert.ok(idsOf('We dont know').includes('apostrophe'));
});

test('huomautukset ovat tekstijärjestyksessä, eivätkä ne mene päällekkäin', () => {
  const text = 'hi John,\nWe discuss about the colour. I am agree. It depends of the plan on friday.';
  const res = checkWriting({}, text);
  const starts = res.issues.map((i) => i.start);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  for (let i = 1; i < res.issues.length; i++) assert.ok(res.issues[i].start >= res.issues[i - 1].end, 'päällekkäiset huomautukset');
  for (const it of res.issues) assert.equal(text.slice(it.start, it.end), it.quote);
});

test('virhe voittaa vinkin, kun ne osuvat samaan kohtaan', () => {
  // "since two years" (virhe) ja mahdollinen lyhyempi vinkki eivät saa jäädä päällekkäin
  const res = checkWriting({}, 'We have worked together since two years.');
  assert.equal(res.issues.length, 1);
  assert.equal(res.issues[0].sev, 'error');
});

test('sama sääntö huomauttaa enintään kahdesti', () => {
  const res = checkWriting({}, 'The colour is blue. The colour is red. The colour is green. The colour is pink.');
  assert.equal(res.issues.filter((i) => i.id === 'us-colour').length, 2);
});

test('lauseen alku: lyhenteet, osoitteet ja pienet apusanat eivät laukaise', () => {
  assert.deepEqual(idsOf('We meet at 3 p.m. on Friday, e.g. in Boston, etc. and so on.'), []);
  assert.deepEqual(idsOf('Pay by 1.11. because the deadline moved.', {}).filter((id) => id === 'sentence-case'), []);
  assert.deepEqual(idsOf('Mail alex@example.com\nwww.example.com is the site.'), []);
  assert.ok(idsOf('Hello.\nthanks a lot').includes('sentence-case'));
});

test('artikkeli a/an: äänne ratkaisee, lyhenteet ohitetaan', () => {
  const issues = (t) => checkWriting({}, t).issues.filter((i) => i.id === 'a-an');
  assert.equal(issues('an apple, a user, an hour, a unit, an MBA, a URL, an 11-day trip, a 10-day trip').length, 0);
  assert.equal(issues('a apple and an banana').length, 2);
  assert.equal(issues('A hour from now')[0].fix, 'An hour');
});

test('rakenne: sähköposti vaatii tervehdyksen ja päätöksen, chat ei', () => {
  const email = { format: 'email' };
  const chat = { format: 'chat' };
  const message = { format: 'message' };
  assert.deepEqual(checkWriting(email, 'Hi Anna,\n\nThe file is attached.\n\nBest regards,\nAlex').structure, { greeting: true, closing: true });
  assert.deepEqual(checkWriting(email, 'The file is attached.').structure, { greeting: false, closing: false });
  assert.deepEqual(checkWriting(email, 'Dear Ms. Lee,\n\nThe file is attached.\n\nThanks!').structure, { greeting: true, closing: true });
  assert.deepEqual(checkWriting(chat, 'The file is attached.').structure, { greeting: null, closing: null });
  assert.deepEqual(checkWriting(message, 'Hi Anna, nice to meet you.').structure, { greeting: true, closing: null });
  // "best" keskellä pitkää riviä ei ole päätös
  assert.equal(checkWriting(email, 'Hi,\nThe best option is to wait and see what happens next week.').structure.closing, false);
});

test('pituus: liian lyhyt, sopiva ja liian pitkä', () => {
  const task = { words: [5, 10] };
  assert.equal(checkWriting(task, 'Too short').length, 'short');
  assert.equal(checkWriting(task, 'This one has exactly seven words here.').length, 'ok');
  assert.equal(checkWriting(task, 'one two three four five six seven eight nine ten eleven').length, 'long');
  assert.equal(checkWriting({}, 'anything').length, 'ok');
});

test('sisältökohdat tunnistetaan ja puuttuvat näytetään', () => {
  const task = { points: [{ fi: 'a', any: ['friday'] }, { fi: 'b', any: ['sorry', 'apolog'] }] };
  const res = checkWriting(task, 'We apologize. See you Friday.');
  assert.deepEqual(res.points.map((p) => p.hit), [true, true]);
  assert.equal(res.points[1].evidence, 'apolog');
  const miss = checkWriting(task, 'See you soon.');
  assert.deepEqual(miss.points.map((p) => p.hit), [false, false]);
  assert.equal(miss.counts.pointsHit, 0);
  assert.equal(miss.counts.pointsTotal, 2);
});

test('ilmausten tunnistus: lyhennemuodot, vaihtuva loppu ja tehtäväkohtainen lauseke', () => {
  assert.ok(phraseUsed("I'd appreciate it if you could help.", "I'd appreciate it if you could …"));
  assert.ok(phraseUsed('I would appreciate it if you could help.', "I'd appreciate it if you could …"));
  assert.ok(phraseUsed("We are on track to finish.", "We're on track to …"));
  assert.ok(phraseUsed('Thank you for getting back to me quickly', 'Thank you for getting back to me.'));
  assert.ok(!phraseUsed('Thank you for your reply', 'Thank you for getting back to me.'));
  assert.ok(phraseUsed('Could you possibly send it?', 'Could you possibly …?'));
  assert.ok(!phraseUsed('Could you send it?', 'Could you possibly …?'));
  assert.ok(phraseUsed("You were breaking up", "You're breaking up.", 'breaking up'));
  assert.equal(phraseKey('…'), null);
  assert.equal(phraseKey('Hello'), null);
  assert.deepEqual(phraseKey('… is different from …'), ['is', 'different', 'from']);
});

test('kohteliaisuussäännöt toimivat vain kohteliaissa tehtävissä', () => {
  assert.deepEqual(idsOf('Send me the report.', {}), []);
  assert.ok(idsOf('Send me the report.', polite).includes('imperative'));
  assert.deepEqual(idsOf('I want you to send it.', {}), []);
  assert.ok(idsOf('I want you to send it.', polite).includes('i-want'));
});

test('isClean: puhdas teksti, jossa kaikki kohdat täyttyvät', () => {
  const task = { format: 'email', words: [5, 50], points: [{ fi: 'a', any: ['report'] }] };
  assert.equal(isClean(checkWriting(task, 'Hi Anna,\n\nPlease send the report today.\n\nBest regards,\nAlex')), true);
  assert.equal(isClean(checkWriting(task, 'Hi Anna,\n\nPlease send the raport today.\n\nBest regards,\nAlex')), false); // kohta puuttuu
  assert.equal(isClean(checkWriting(task, 'Hi Anna,\n\nPlease send the report today and recieve it.\n\nBest regards,\nAlex')), false); // kirjoitusvirhe
  assert.equal(isClean(checkWriting(task, 'Please send the report today, thanks a lot for it.')), false); // tervehdys puuttuu
});

test('mallivastaus on aina puhdas, mutta tyypillinen suomalaisvirhe ei ole', () => {
  for (const t of WRITING_TASKS) {
    const res = checkWriting(t, t.model.join('\n\n'));
    assert.equal(isClean(res), true, t.id);
    assert.equal(res.counts.phrasesUsed, res.counts.phrasesTotal, t.id);
  }
  const t = WRITING_TASKS.find((x) => x.id === 'w-vendor');
  const bad = 'hi Priya,\n\nI work as application specialist and I am responsible of the integrations. I am interested of how your process works. Could you explain me the process? It depends of the timeline.\n\nBest regards,\nAlex';
  const ids = idsOf(bad, t);
  for (const expected of ['sentence-case', 'responsible', 'interested', 'explain-me', 'depend']) assert.ok(ids.includes(expected), `${expected} puuttuu: ${ids.join(', ')}`);
});

test('tehtävät toimivat myös tyhjällä ja outoa tekstiä sisältävällä syötteellä', () => {
  const t = WRITING_TASKS[0];
  assert.doesNotThrow(() => checkWriting(t, ''));
  assert.doesNotThrow(() => checkWriting(t, null));
  assert.doesNotThrow(() => checkWriting(t, '😀 😀 \u0000 <script>alert(1)</script> ' + 'x'.repeat(5000)));
  const res = checkWriting(t, '');
  assert.equal(res.words, 0);
  assert.equal(res.length, 'short');
  assert.equal(res.counts.pointsHit, 0);
});

test('tarkistus on nopea myös pitkällä tekstillä (ei katastrofaalista takaisinpurkua)', () => {
  const para = "We have worked together and I'm writing to follow up on the invoice that was sent on 3.11.2026 for 2 400 € in the beginning of the month, and we will see. ";
  const text = para.repeat(200);
  const t0 = Date.now();
  checkWriting(polite, text);
  assert.ok(Date.now() - t0 < 1500, `kesti ${Date.now() - t0} ms`);
  const t1 = Date.now();
  checkWriting(polite, 'a '.repeat(20000) + 'since ' + 'work '.repeat(5000));
  assert.ok(Date.now() - t1 < 1500, `kesti ${Date.now() - t1} ms`);
});

test('oikea englanti: kaikki esimerkkilauseet ja saadut viestit ovat ilman virhehuomautuksia', () => {
  const task = { tone: 'polite', format: 'chat' };
  const problems = [];
  const check = (label, text) => {
    for (const i of checkWriting(task, text).issues) problems.push(`${label}: ${i.id} "${i.quote}"`);
  };
  for (const u of UNITS) {
    for (const it of u.items) {
      check(`${it.id} ex`, it.ex);
      if (it.cz) check(`${it.id} cz`, it.cz[0].replace('___', it.cz[1]));
    }
  }
  for (const t of WRITING_TASKS) if (t.incoming) check(`${t.id} incoming`, t.incoming.text);
  assert.deepEqual(problems, []);
});

/* ---------- Ääntä varten ---------- */

test('speechParts jakaa lauseet, suojaa lyhenteet ja jättää allekirjoituksen pois', () => {
  assert.deepEqual(speechParts(['Hi Mark,', 'Call me at 2 p.m. on Thursday. Ms. Lee will join, e.g. by phone.', 'Best regards,\nAlex']), [
    'Hi Mark,',
    'Call me at 2 p.m. on Thursday.',
    'Ms. Lee will join, e.g. by phone.',
    'Best regards,',
  ]);
  assert.deepEqual(speechParts('One. Two!\n\nThree?'), ['One.', 'Two!', 'Three?']);
  assert.deepEqual(speechParts(['Thanks,\nAlex Smith']), ['Thanks,', 'Alex Smith']); // kaksiosainen nimi luetaan
  assert.deepEqual(speechParts([]), []);
});
