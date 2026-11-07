// Sovelluksen käynnistys: tallennus, asetukset, reititys ja offline-välimuisti.

import { h, clear } from './util.js';
import { openDb } from './db.js';
import { Srs } from './srs.js';
import { CATALOG } from './content.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings.js';
import { stopSpeaking } from './speech.js';
import { loadManifest, clipStats } from './clips.js';
import { createKeyStore } from './ai-keys.js';
import { TIMEOUT_MS as AI_TIMEOUT_MS } from './ai.js';
import { toast, icon } from './ui.js';
import { APP_VERSION } from './version.js';
import * as today from './views/today.js';
import * as session from './views/session.js';
import * as review from './views/review.js';
import * as lessons from './views/lessons.js';
import * as speakView from './views/speak.js';
import * as more from './views/more.js';
import * as vocab from './views/vocab.js';
import * as progress from './views/progress.js';
import * as settingsView from './views/settings.js';
import * as writeView from './views/write.js';
import * as installView from './views/install.js';
import { repairApp } from './repair.js';

const ROUTES = {
  today: { view: today, nav: 'today' },
  session: { view: session, nav: 'today', focus: true },
  review: { view: review, nav: 'review' },
  lessons: { view: lessons, nav: 'lessons' },
  lesson: { view: lessons, nav: 'lessons', focus: true },
  speak: { view: speakView, nav: 'speak' },
  write: { view: writeView, nav: 'today' },
  more: { view: more, nav: 'more' },
  vocab: { view: vocab, nav: 'more' },
  progress: { view: progress, nav: 'more' },
  settings: { view: settingsView, nav: 'more' },
  install: { view: installView, nav: 'more' },
};

const $ = (sel) => document.querySelector(sel);

// Chromen asennuskehote ja asennustapahtuma: tallennetaan heti, koska ne tulevat ennen kuin näkymät ovat valmiita.
const install = { event: null, installed: false };
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  install.event = e;
});
window.addEventListener('appinstalled', () => {
  install.event = null;
  install.installed = true;
  toast('Sovellus on asennettu. Etsi se sovellusluettelosta nimellä "Englanti".', { ms: 8000 });
});

async function main() {
  const db = await openDb();
  let settings = sanitizeSettings(await db.getKv('settings', null));
  const srs = await new Srs(db, () => settings).load();

  const ctx = {
    version: APP_VERSION,
    db,
    srs,
    catalog: CATALOG,
    settings: () => settings,
    async saveSettings(patch) {
      settings = sanitizeSettings({ ...settings, ...patch });
      applySettings(settings); // ensin näkyviin, sitten talteen
      await db.setKv('settings', settings);
      return settings;
    },
    async reloadSettings() {
      settings = sanitizeSettings(await db.getKv('settings', null));
      applySettings(settings);
    },
    async logSpeak(itemId, pct) {
      const log = await db.getKv('speakLog', []);
      log.push({ ts: Date.now(), id: itemId, pct });
      await db.setKv('speakLog', log.slice(-300));
    },
    /** Kello harjoitusten ajanmittaukseen. Testit voivat korvata tämän valekellolla. */
    now: () => performance.now(),
    /** Lisää päivän harjoitteluaikaan `ms` (millisekuntia). Säilytetään 120 päivältä. */
    async logActivity(ms) {
      if (!(ms > 0)) return;
      const day = srs.today();
      const log = await db.getKv('activity', {});
      log[day] = (log[day] ?? 0) + Math.round(ms);
      for (const key of Object.keys(log)) if (Number(key) < day - 120) delete log[key];
      await db.setKv('activity', log);
    },
    nav: (route) => {
      location.hash = `#/${route}`;
    },
    persisted: null,
    /** Tekoälypalautteen aikaraja (ms). Testit voivat pienentää sitä. */
    aiTimeoutMs: AI_TIMEOUT_MS,
  };
  ctx.aiKeys = createKeyStore(db, () => settings); // API-avaimet: muistissa, laitteelle vain pyydettäessä
  ctx.clipStats = clipStats; // toistetut ja puuttuvat äänileikkeet (testit, virheenjäljitys)
  ctx.install = install; // Chromen asennuskehote (Asennus-sivu)
  window.__englanti = ctx; // testejä ja virheenjäljitystä varten
  loadManifest(); // esiäänitettyjen äänien luettelo valmiiksi ennen ensimmäistä toistoa

  applySettings(settings);
  for (const el of document.querySelectorAll('.ico[data-icon]')) el.append(icon(el.dataset.icon));
  if (db.kind === 'memory') {
    $('#banner').append(
      h('p', { class: 'banner warn', role: 'alert' }, 'Tallennus ei ole käytössä tässä selaimessa: edistyminen häviää, kun suljet sivun.'),
    );
  }
  try {
    ctx.persisted = (await navigator.storage?.persisted?.()) ?? null;
    if (ctx.persisted === false) ctx.persisted = (await navigator.storage?.persist?.()) ?? false;
  } catch {
    ctx.persisted = null;
  }

  let token = 0;
  let current = null;
  let firstRender = true;
  const render = async () => {
    const my = ++token;
    const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/').map(decodeURIComponent);
    const def = ROUTES[parts[0]] ?? ROUTES.today;
    current?.destroy?.();
    current = null;
    stopSpeaking();
    const root = clear($('#view'));
    document.body.dataset.focus = def.focus ? '1' : '';
    const mounted = await def.view.mount(root, ctx, parts[0] === 'lesson' ? ['lesson', ...parts.slice(1)] : parts.slice(1));
    if (my !== token) {
      mounted?.destroy?.();
      return;
    }
    current = mounted;
    for (const a of document.querySelectorAll('#nav a')) {
      if (a.dataset.nav === def.nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    // Kohdistus otsikkoon vasta reitin vaihtuessa; sivun avautuessa ensimmäinen Tab osuu "Siirry sisältöön" -linkkiin.
    if (!def.focus && !firstRender) {
      const heading = $('#view h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    window.scrollTo(0, 0);
    firstRender = false;
    document.documentElement.dataset.ready = '1'; // käynnistysvahti (boot-guard.js) tietää, että sovellus on käynnissä
  };
  window.addEventListener('hashchange', render);
  window.addEventListener('pagehide', stopSpeaking);
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute('href');
    if (href === '#main') {
      // "Siirry sisältöön" -linkki ei saa muuttaa reittiä (hash-reititin).
      e.preventDefault();
      $('#main')?.focus();
    } else if (href === location.hash) {
      // Sama osoite uudelleen (esim. Puhu-välilehti yhteenvedon aikana): piirretään näkymä alusta.
      e.preventDefault();
      render();
    }
  });
  await render();
  registerServiceWorker();
}

function applySettings(s) {
  const root = document.documentElement;
  if (s.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = s.theme;
  root.style.fontSize = `${Math.round(s.textScale * 100)}%`;
  root.dataset.clear = s.clearText ? '1' : '';
  root.dataset.motion = s.reduceMotion ? 'reduce' : '';
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Uusi versio on asennettu. Se tulee käyttöön, kun avaat sovelluksen uudelleen.', { ms: 9000 });
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}

main().catch((e) => {
  console.error(e);
  const view = document.getElementById('view');
  if (view) {
    view.replaceChildren(
      h('h1', {}, 'Sovellus ei käynnistynyt'),
      h('p', {}, 'Päivitä sivu. Jos virhe toistuu, korjaa välimuisti alla olevalla napilla. Se ei poista oppimisdataa.'),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            id: 'error-repair',
            on: {
              click: async (ev) => {
                ev.currentTarget.disabled = true;
                await repairApp();
                location.reload();
              },
            },
          },
          'Korjaa ja yritä uudelleen',
        ),
      ),
      h('pre', { class: 'error-pre' }, String(e?.stack || e)),
    );
  }
});

export { DEFAULT_SETTINGS };
