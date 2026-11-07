// Session kokonaisedistyminen: missä vaiheessa päivän sessio on ("Vaihe 2 / 4") ja paljonko aikaa on kulunut.
// createProgress on puhdas malli (testattavissa ilman selainta), progressView piirtää sen harjoituksen yläreunaan.

import { h, clear, clamp } from './util.js';
import { announce } from './ui.js';

/**
 * phases: [{ id, label }] siinä järjestyksessä kuin vaiheet ajetaan. unit / units: "Vaihe" / "Vaiheet" tai "Kappale" / "Kappaleet".
 * total (ms) ja elapsed() (ms alusta) ovat valinnaisia: ne kertovat kokonaisajan.
 * Vaiheen tila: 'todo' | 'current' | 'done' | 'skipped'.
 */
export function createProgress({ phases, unit = 'Vaihe', units = 'Vaiheet', total = 0, elapsed = () => 0 }) {
  const list = phases.map((p) => ({ id: p.id, label: p.label }));
  const status = new Map(list.map((p) => [p.id, 'todo']));
  let announced = null;

  const api = {
    unit,
    units,
    /** Aloittaa vaiheen. Sitä aiemmat keskeneräiset vaiheet suljetaan: käynnissä ollut on tehty, koskemattomat ohitettu. */
    start(id) {
      if (!status.has(id)) return api;
      for (const p of list) {
        if (p.id === id) break;
        const st = status.get(p.id);
        if (st === 'current') status.set(p.id, 'done');
        else if (st === 'todo') status.set(p.id, 'skipped');
      }
      if (status.get(id) === 'todo') status.set(id, 'current');
      return api;
    },
    /** Päättää käynnissä olevan vaiheen ('done' tai 'skipped'). */
    finish(id, as = 'done') {
      if (status.get(id) === 'current') status.set(id, as === 'skipped' ? 'skipped' : 'done');
      return api;
    },
    /** Merkitsee vaiheen ohitetuksi, jos sitä ei ole aloitettu. */
    skip(id) {
      if (status.get(id) === 'todo') status.set(id, 'skipped');
      return api;
    },
    steps() {
      return list.map((p, i) => ({ id: p.id, label: p.label, n: i + 1, status: status.get(p.id) }));
    },
    /** Käynnissä oleva vaihe, tai seuraava aloittamaton, tai viimeinen, kun kaikki on tehty. */
    position() {
      const steps = api.steps();
      const cur = steps.find((s) => s.status === 'current') ?? steps.find((s) => s.status === 'todo') ?? steps[steps.length - 1] ?? null;
      const doneCount = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
      return { n: cur ? cur.n : 0, of: steps.length, label: cur?.label ?? '', id: cur?.id ?? null, doneCount };
    },
    /** Kulunut aika; null, jos kokonaisaikaa ei tunneta. */
    time() {
      if (!(total > 0)) return null;
      const ms = Math.max(0, elapsed());
      return { ms, minutes: Math.floor(ms / 60000), totalMinutes: Math.max(1, Math.round(total / 60000)), fraction: clamp(ms / total, 0, 1) };
    },
    /** Teksti ruudunlukijalle, kun vaihe on vaihtunut edellisestä kutsusta; muuten null. */
    takeAnnouncement() {
      const pos = api.position();
      if (!pos.id || pos.id === announced) return null;
      announced = pos.id;
      return `${unit} ${pos.n} / ${pos.of}: ${pos.label}`;
    },
  };
  return api;
}

/**
 * Piirtää etenemisen: otsikkorivi ("Vaihe 2 / 4" ja kulunut aika) ja yksi palkki per vaihe.
 * update() päivittää näkymän. Kellonaika päivittyy itsestään kymmenen sekunnin välein, kunnes elementti poistuu sivulta.
 */
export function progressView(progress) {
  const line = h('span', { class: 'steps-line' });
  const time = h('span', { class: 'steps-time' });
  const ol = h('ol', { class: 'steps', 'aria-label': progress.units });
  const el = h('div', { class: 'steps-wrap' }, h('div', { class: 'steps-top' }, line, time), ol);

  const update = () => {
    const pos = progress.position();
    line.textContent = `${progress.unit} ${pos.n} / ${pos.of}`;
    const t = progress.time();
    time.textContent = t ? `${t.minutes} / ${t.totalMinutes} min` : '';
    if (t) time.setAttribute('aria-label', `Aikaa kulunut ${t.minutes} minuuttia, yhteensä noin ${t.totalMinutes}`);
    else time.removeAttribute('aria-label');
    clear(ol).append(
      ...progress.steps().map((s) =>
        h(
          'li',
          { class: `step ${s.status}`, 'aria-current': s.status === 'current' ? 'step' : null },
          h('span', { class: 'step-bar', 'aria-hidden': 'true' }),
          h(
            'span',
            { class: 'step-label' },
            s.status === 'done' ? h('span', { class: 'step-mark', 'aria-hidden': 'true' }, '✓ ') : null,
            s.label,
            s.status === 'done' ? h('span', { class: 'sr' }, ' (tehty)') : s.status === 'skipped' ? h('span', { class: 'sr' }, ' (ohitettu)') : null,
          ),
        ),
      ),
    );
    const msg = progress.takeAnnouncement();
    if (msg) announce(msg);
  };

  update();
  const timer = setInterval(() => {
    if (!el.isConnected) clearInterval(timer);
    else update();
  }, 10000);
  return { el, update };
}
