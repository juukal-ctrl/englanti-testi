// Yhteiset käyttöliittymän osat: kuvakkeet, ilmoitukset, vahvistusikkuna, äänipainike.

import { h, en } from './util.js';
import { speak, stopSpeaking, ttsSupported } from './speech.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Kuvakkeet: Material Design Icons (Apache-lisenssi 2.0).
const PATHS = {
  speaker: 'M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
  mic: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  repeat: 'M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z',
  school: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z',
  more: 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  stop: 'M6 6h12v12H6z',
};

export function icon(name, size = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[name]);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/* ---------- Ilmoitukset ---------- */

export function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  // Tyhjennys ja uusi teksti eri kierroksella, jotta ruudunlukija lukee saman viestin uudelleen.
  setTimeout(() => (live.textContent = message), 30);
}

export function toast(message, { ms = 4000, action } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  if (action) {
    el.append(
      h('button', { class: 'btn small', on: { click: () => { action.run(); el.remove(); } } }, action.label),
    );
  }
  host.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Vahvistusikkuna (<dialog>). Palauttaa Promise<boolean>. */
export function confirmDialog({ title, body, confirmText = 'Kyllä', cancelText = 'Peruuta', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
    const close = (value) => {
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    dlg.append(
      h('h2', { id: 'dlg-title' }, title),
      body ? h('p', {}, body) : null,
      h(
        'div',
        { class: 'actions row' },
        h('button', { class: 'btn', on: { click: () => close(false) } }, cancelText),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, on: { click: () => close(true) } }, confirmText),
      ),
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('.btn')?.focus();
  });
}

/** Valintaikkuna usealla vaihtoehdolla: choices = [{ label, value, kind? }]. Palauttaa valitun arvon tai null. */
export function choiceDialog({ title, body, choices }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
    const close = (value) => {
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    dlg.append(
      h('h2', { id: 'dlg-title' }, title),
      body ? h('p', {}, body) : null,
      h(
        'div',
        { class: 'actions stack' },
        choices.map((c) => h('button', { class: `btn ${c.kind ?? ''}`, type: 'button', on: { click: () => close(c.value) } }, c.label)),
        h('button', { class: 'btn link', type: 'button', on: { click: () => close(null) } }, 'Peruuta'),
      ),
    );
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('.btn')?.focus();
  });
}

/* ---------- Äänipainike ---------- */

/**
 * Painike, joka lukee tekstin ääneen. getText kutsutaan painalluksen hetkellä.
 * Palauttaa { el, play } – play() voi käynnistää toiston koodista (automaattinen toisto).
 */
export function speakButton(getText, ctx, { label = 'Kuuntele' } = {}) {
  let playing = false;
  const btn = h('button', { class: 'icon-btn speak', type: 'button', 'aria-label': label }, icon('speaker'));
  const set = (on) => {
    playing = on;
    btn.classList.toggle('playing', on);
  };
  /** auto = true: automaattinen toisto. Silloin epäonnistuminen on hiljaista, eikä toistoa yritetä ilman käyttäjän kosketusta. */
  const play = async ({ auto = false } = {}) => {
    if (!ttsSupported()) {
      if (!auto) toast('Tällä selaimella ei ole puhesynteesiä.');
      return;
    }
    if (auto && navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // selain estäisi puheen joka tapauksessa
    if (playing) {
      stopSpeaking();
      set(false);
      return;
    }
    set(true);
    const s = ctx.settings();
    const res = await speak(getText(), { rate: s.rate, voiceURI: s.voiceURI });
    set(false);
    if (!auto && !res.ok && res.kind !== 'unsupported') toast('Ääntä ei saatu toistettua. Kokeile asetuksista toista ääntä.');
  };
  btn.addEventListener('click', () => play());
  return { el: btn, play };
}

/* ---------- Pienet rakenneosat ---------- */

export function noteBox(item) {
  if (!item.note) return document.createDocumentFragment(); // tyhjä solmu: natiivi append(null) tulostaisi "null"

  return h('aside', { class: 'note' }, h('strong', {}, 'Huomio'), h('p', {}, item.note));
}

const REPO = 'https://github.com/juukal-ctrl/englanti-testi';

/** Linkki, joka avaa valmiiksi täytetyn GitHub-issuen sisältövirheen ilmoittamiseksi. */
export function reportLink(item, version) {
  const title = `Sisältövirhe: ${item.id}`;
  const body = [
    `Ilmaus: ${item.id}`,
    `en: ${item.en}`,
    `fi: ${item.fi}`,
    '',
    'Mikä on väärin tai epäluontevaa?',
    '',
    `Sovellusversio: ${version}`,
  ].join('\n');
  const href = `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return h('a', { class: 'report', href, target: '_blank', rel: 'noopener noreferrer' }, 'Ilmoita virheestä');
}

export function progressBar(value, max, label) {
  const pct = max > 0 ? Math.round((100 * value) / max) : 0;
  return h(
    'div',
    { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label },
    h('div', { class: 'bar-fill', style: { width: `${pct}%` } }),
  );
}

/** Pisteytetyt sanat värikoodattuina: oikein / väärin / puuttuu. Sanat näytetään alkuperäisessä asussaan. */
export function wordResult(cmp) {
  let groups;
  if (cmp.display) {
    let i = 0;
    groups = cmp.display.map((d) => {
      const ws = cmp.words.slice(i, i + d.n);
      i += d.n;
      return { text: d.raw, ws };
    });
  } else {
    groups = cmp.words.map((w) => ({ text: w.word, ws: [w] }));
  }
  const out = h('p', { class: 'words', lang: 'en-US' });
  groups.forEach((g, i) => {
    const wrong = g.ws.filter((w) => w.status === 'wrong');
    const missing = g.ws.some((w) => w.status === 'missing');
    let part;
    if (wrong.length) {
      const heard = wrong.map((w) => w.heard).join(' ');
      part = h('span', { class: 'w wrong', title: `kuulin: ${heard}` }, g.text, h('span', { class: 'sr' }, ` (kuulin: ${heard})`));
    } else if (missing) {
      part = h('span', { class: 'w missing' }, g.text, h('span', { class: 'sr' }, ' (puuttuu)'));
    } else {
      part = h('span', { class: 'w ok' }, g.text);
    }
    out.append(i ? ' ' : '', part);
  });
  return out;
}

export { en };
