// Kirjoitustehtävän palaute: tarkistuslista, korostettu teksti, huomiot ja mallivastaus.

import { h, en } from '../util.js';
import { speakButton } from '../ui.js';
import { CATEGORY_LABELS, speechParts, isClean, probeText } from '../writing.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Yhteenvetorivi: mitä on tarkistettavana. */
export function verdictOf(result) {
  if (isClean(result)) return { kind: 'ok', text: 'Hyvä! Sääntötarkistus ei löytänyt korjattavaa.' };
  const missing = result.points.filter((p) => !p.hit).length;
  const parts = [];
  if (result.counts.errors) parts.push(plural(result.counts.errors, 'virhe', 'virhettä'));
  if (result.counts.tips) parts.push(plural(result.counts.tips, 'vinkki', 'vinkkiä'));
  if (missing) parts.push(`${plural(missing, 'sisältökohta', 'sisältökohtaa')} tunnistamatta`);
  if (result.length === 'short') parts.push('viesti on lyhyt');
  if (result.length === 'long') parts.push('viesti on pitkä');
  if (result.structure.greeting === false) parts.push('tervehdys puuttuu');
  if (result.structure.closing === false) parts.push('päätös puuttuu');
  const onlySoft = result.counts.errors === 0 && missing === 0 && result.length === 'ok';
  // Punainen vain tunnistetuista virheistä; puuttuvat asiat, pituus ja vinkit ovat keltaisia.
  return { kind: result.counts.errors > 0 ? 'bad' : 'warn', text: `${onlySoft ? 'Melkein valmis. Hiottavaa' : 'Tarkistettavaa'}: ${parts.join(', ')}.` };
}

/** Lyhyt lista siitä, mikä onnistui, jotta palaute ei ala pelkistä puutteista. */
export function strengthsOf(task, result) {
  const out = [];
  if (result.counts.pointsTotal && result.counts.pointsHit === result.counts.pointsTotal) out.push('kaikki sisältökohdat ovat mukana');
  else if (result.counts.pointsHit > 0) out.push(`${result.counts.pointsHit} / ${result.counts.pointsTotal} sisältökohtaa mukana`);
  if (result.counts.phrasesTotal && result.counts.phrasesUsed > 0) out.push(`käytit ${result.counts.phrasesUsed} / ${result.counts.phrasesTotal} harjoiteltavaa ilmausta`);
  if (result.length === 'ok' && result.words > 0) out.push('viestin pituus on sopiva');
  if (result.structure.greeting && result.structure.closing !== false) out.push(result.structure.closing ? 'tervehdys ja päätös ovat kunnossa' : 'tervehdys on kunnossa');
  if (result.counts.errors === 0 && result.words >= 10) out.push('ei tunnistettuja virheitä');
  return out;
}

const mark = (ok) => h('span', { class: 'mark', 'aria-hidden': 'true' }, ok ? '✓' : '○');

function check(ok, label, detail) {
  return h(
    'li',
    { class: ok ? 'yes' : 'no' },
    mark(ok),
    h('span', {}, label, h('span', { class: 'sr' }, ok ? ' (mukana)' : ' (ei tunnistettu)'), detail ? h('span', { class: 'muted block' }, detail) : null),
  );
}

/** Käyttäjän teksti, jossa huomautetut kohdat on korostettu ja numeroitu. */
export function highlighted(text, issues) {
  const plain = probeText(text);
  const out = h('p', { class: 'written', lang: 'en-US' });
  let pos = 0;
  issues.forEach((it, n) => {
    if (it.start < pos) return;
    if (it.start > pos) out.append(plain.slice(pos, it.start));
    out.append(
      h(
        'mark',
        { class: `hl ${it.sev}`, 'data-n': n + 1 },
        plain.slice(it.start, it.end),
        h('sup', { 'aria-hidden': 'true' }, String(n + 1)),
        h('span', { class: 'sr' }, ` (huomio ${n + 1})`),
      ),
    );
    pos = it.end;
  });
  if (pos < plain.length) out.append(plain.slice(pos));
  return out;
}

function issueItem(it, n) {
  return h(
    'li',
    { class: it.sev, id: `fb-issue-${n + 1}` },
    h(
      'p',
      { class: 'quote-line' },
      `${n + 1}. `,
      en(`”${it.quote}”`),
      it.fix ? [' → ', h('span', { class: 'fix', lang: 'en-US' }, `”${it.fix}”`)] : null,
    ),
    h('p', {}, it.fi),
    h('span', { class: `chip ${it.sev === 'error' ? 'bad' : ''}` }, `${it.sev === 'error' ? 'Korjaa' : 'Vinkki'} · ${CATEGORY_LABELS[it.cat] ?? it.cat}`),
  );
}

/** Mallivastaus kuunneltavana ja luettavana, vinkki mukana. */
export function renderModelBox(task, ctx, { open = false } = {}) {
  const say = speakButton(() => speechParts(task.model), ctx, { label: 'Kuuntele mallivastaus', slow: true });
  return h(
    'details',
    { class: 'model', open },
    h('summary', {}, 'Mallivastaus'),
    h('div', { class: 'row-between' }, h('span', { class: 'muted' }, 'Kuuntele ja sano perässä.'), h('span', { class: 'say-row' }, say.el, say.slowEl)),
    h('div', { class: 'quote', lang: 'en-US' }, task.model.join('\n\n')),
    h('aside', { class: 'note' }, h('strong', {}, 'Vinkki'), h('p', {}, task.tip)),
  );
}

/** Kortti, jossa on pelkkä mallivastaus (kun käyttäjä haluaa nähdä sen ennen omaa yritystä). */
export function renderModelCard(task, ctx, { onWrite }) {
  return h(
    'section',
    { class: 'card feedback', id: 'w-feedback', 'aria-labelledby': 'fb-h', tabindex: -1 },
    h('h2', { id: 'fb-h' }, 'Mallivastaus'),
    h('p', { class: 'muted' }, 'Lue malli, kuuntele se ja kirjoita sitten oma versiosi omin sanoin. Älä kopioi mallia sanasta sanaan.'),
    renderModelBox(task, ctx, { open: true }),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary big', type: 'button', id: 'w-write', on: { click: () => onWrite?.() } }, 'Kirjoita oma vastaukseni')),
  );
}

/**
 * Koko palautekortti. Palauttaa elementin; actions-kentät ovat kutsujan hoidettavia.
 * opts: { ctx, onRevise, onDone, nextHref }
 */
export function renderFeedback(task, text, result, { ctx, onRevise, onDone, nextHref }) {
  const verdict = verdictOf(result);
  const strengths = strengthsOf(task, result);
  const lengthLabel = result.length === 'short' ? 'liian lyhyt' : result.length === 'long' ? 'liian pitkä' : 'sopiva';

  const content = h(
    'ul',
    { class: 'checklist' },
    result.points.map((p) => check(p.hit, p.fi, p.hit ? null : 'Tätä ei tunnistettu tekstistä. Tarkista itse, onko asia mukana.')),
    result.structure.greeting != null ? check(result.structure.greeting, 'Tervehdys alussa (Hi …, Hello …, Dear …)') : null,
    result.structure.closing != null ? check(result.structure.closing, 'Päätös lopussa (Best regards, Thanks …)') : null,
  );

  const phrases = h(
    'ul',
    { class: 'checklist' },
    result.phrases.map((p) => check(p.used, en(p.en), p.used ? null : p.fi)),
  );

  const issueBlock = result.issues.length
    ? [
        h('h3', {}, 'Huomioita tekstistäsi'),
        highlighted(text, result.issues),
        h('ol', { class: 'issues' }, result.issues.map(issueItem)),
      ]
    : [
        h('h3', {}, 'Huomioita tekstistäsi'),
        result.words > 0 ? highlighted(text, []) : null,
        h('p', {}, 'Sääntötarkistus ei löytänyt yksittäisiä virheitä.'),
      ];

  const modelBox = renderModelBox(task, ctx, { open: false });

  const reviseBtn = h('button', { class: 'btn primary big', type: 'button', id: 'w-revise', on: { click: () => onRevise?.() } }, 'Muokkaa ja tarkista uudelleen');
  const doneBtn = h('button', { class: 'btn', type: 'button', id: 'w-done', on: { click: () => onDone?.() } }, 'Valmis');
  const nextLink = nextHref ? h('a', { class: 'btn link', href: nextHref }, 'Seuraava tehtävä') : null;

  const card = h(
    'section',
    { class: 'card feedback', id: 'w-feedback', 'aria-labelledby': 'fb-h', tabindex: -1 },
    h('h2', { id: 'fb-h' }, 'Palaute'),
    h('p', { class: `verdict ${verdict.kind}` }, verdict.text),
    strengths.length ? h('p', { class: 'muted' }, `Hyvää: ${strengths.join(', ')}.`) : null,
    h(
      'dl',
      { class: 'facts' },
      h('div', {}, h('dt', {}, 'Sanoja'), h('dd', {}, `${result.words} (${lengthLabel}, tavoite ${task.words[0]}–${task.words[1]})`)),
      h('div', {}, h('dt', {}, 'Sisältökohdat'), h('dd', {}, `${result.counts.pointsHit} / ${result.counts.pointsTotal}`)),
      h('div', {}, h('dt', {}, 'Harjoiteltavat ilmaukset'), h('dd', {}, `${result.counts.phrasesUsed} / ${result.counts.phrasesTotal}`)),
    ),
    h('h3', {}, 'Viestin sisältö'),
    content,
    h('h3', {}, 'Harjoiteltavat ilmaukset'),
    phrases,
    ...issueBlock,
    h(
      'p',
      { class: 'help' },
      'Tämä tarkistus löytää tyypillisiä virheitä (prepositiot, päivämäärä- ja lukumuodot, amerikkalainen oikeinkirjoitus, kohteliaisuus). Se ei arvioi tekstin sujuvuutta kokonaisuutena eikä löydä esimerkiksi puuttuvia artikkeleita.',
    ),
    modelBox,
    h('div', { class: 'ai-slot', id: 'w-ai' }),
    h('div', { class: 'actions' }, reviseBtn, doneBtn, nextLink),
  );
  return card;
}
