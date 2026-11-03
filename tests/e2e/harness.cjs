// Yhteinen testiympäristö: palvelee repon GitHub Pages -alipolussa ja korvaa puheen rajapinnat ohjattavilla valeilla.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PREFIX = '/englanti-testi/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function serve(root) {
  const ROOT = path.resolve(root);
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(PREFIX)) {
      res.writeHead(404);
      return res.end('outside prefix');
    }
    let rel = decodeURIComponent(url.pathname.slice(PREFIX.length));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || rel.startsWith('.git') || rel.startsWith('tests') || rel.startsWith('tools')) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
      res.end(data);
    });
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}${PREFIX}`;
  return {
    base,
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}

const SPEECH_STUB = `
(() => {
  const spoken = [];
  window.__spoken = spoken;
  window.__rates = [];
  window.__asrQueue = [];
  window.__asrDelay = 10;
  class Utt { constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.rate = 1; } }
  const synth = {
    getVoices() { return [{ name: 'Stub US', lang: 'en-US', localService: true, voiceURI: 'stub-us', default: true }, { name: 'Stub UK', lang: 'en-GB', localService: false, voiceURI: 'stub-uk', default: false }]; },
    cancel() {},
    speak(u) { spoken.push(u.text); window.__rates.push(u.rate); setTimeout(() => { u.onstart && u.onstart({}); setTimeout(() => { u.onend && u.onend({}); }, 15); }, 5); },
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utt;
  class Rec {
    start() {
      setTimeout(() => {
        this.onaudiostart && this.onaudiostart();
        const t = window.__asrQueue.shift();
        if (t === undefined) { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); return; }
        if (typeof t === 'object' && t.error) { this.onerror && this.onerror({ error: t.error }); return; }
        const alt = [{ transcript: t, confidence: 0.9 }];
        alt.isFinal = true;
        this.onresult && this.onresult({ results: [alt] });
      }, window.__asrDelay);
    }
    abort() {} stop() {}
  }
  window.SpeechRecognition = Rec;
})();
`;

// Testien apufunktiot sivun sisällä: nykyisen tehtävän tyyppi ja allekirjoitus (muutoksen havaitsemiseen).
const HELPERS = `
window.__kind = () => {
  if (document.querySelector('.summary')) return 'summary';
  const box = document.querySelector('.runner-box');
  if (!box) return 'none';
  const eb = (box.querySelector('.eyebrow') || {}).textContent;
  const map = { 'Uusi aihe': 'intro', 'Uusi ilmaus': 'teach', 'Täydennä lause': 'choose', 'Muista merkitys': 'flip-rec', 'Sano englanniksi': 'flip-prod', 'Kirjoita englanniksi': 'flip-prod', 'Kuuntele ja sano perässä': 'shadow' };
  return map[eb] || ('unknown:' + eb);
};
window.__sig = () => {
  if (document.querySelector('.summary')) return 'summary';
  const box = document.querySelector('.runner-box');
  if (!box) return 'none:' + location.hash;
  const part = (sel) => { const e = box.querySelector(sel); return e ? e.textContent : ''; };
  return [(document.querySelector('.runner-count') || {}).textContent, part('.eyebrow'), part('.phrase'), part('.meaning.big'), part('.sentence')].join('|');
};
`;

// Tallentaa kaikki luodut Audio-elementit (window.__audios), jotta testit näkevät toistonopeuden ja tilan.
const AUDIO_SPY = `
(() => {
  window.__audios = [];
  const Orig = window.Audio;
  window.Audio = function (...args) { const el = new Orig(...args); window.__audios.push(el); return el; };
  window.Audio.prototype = Orig.prototype;
})();
`;

async function launch({ viewport = { width: 412, height: 915 }, scale = 2, stubSpeech = true, colorScheme = 'light', serviceWorkers = 'allow', audioSpy = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme, acceptDownloads: true, locale: 'fi-FI', timezoneId: 'Europe/Helsinki', serviceWorkers });
  await context.addInitScript(HELPERS);
  if (stubSpeech) await context.addInitScript(SPEECH_STUB);
  if (audioSpy) await context.addInitScript(AUDIO_SPY);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console.error: ' + m.text());
  });
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push('HTTP ' + r.status() + ' ' + r.url());
  });
  return { browser, context, page, problems };
}

module.exports = { serve, launch, PREFIX };
