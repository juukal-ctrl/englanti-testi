import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stamp, collect } from '../tools/stamp.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('sw.js on ajan tasalla (aja: node tools/stamp.mjs)', () => {
  const { current, next } = stamp();
  assert.equal(current, next, 'sw.js:n versio tai tiedostolista ei vastaa sovellustiedostoja. Aja: node tools/stamp.mjs');
});

test('esivälimuistin tiedostot ovat olemassa ja kuoreen kuuluvat kaikki moduulit', () => {
  const files = collect();
  for (const f of files) assert.ok(existsSync(root + f), `puuttuu: ${f}`);
  const html = readFileSync(root + 'index.html', 'utf8');
  for (const needed of ['index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'data/units.js']) assert.ok(files.includes(needed), needed);
  // Jokainen index.html:n viittaama paikallinen tiedosto on kuoressa.
  for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) assert.ok(files.includes(m[1]), `index.html viittaa tiedostoon, jota ei esivälimuistita: ${m[1]}`);
});

test('kaikki JS-moduulien suhteelliset tuonnit löytyvät kuoresta', () => {
  const files = new Set(collect());
  for (const f of files) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(root + f, 'utf8');
    for (const m of src.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
      const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '';
      const parts = (dir + m[1]).split('/');
      const out = [];
      for (const p of parts) {
        if (p === '.' || p === '') continue;
        if (p === '..') out.pop();
        else out.push(p);
      }
      assert.ok(files.has(out.join('/')), `${f} tuo tiedoston, jota ei ole kuoressa: ${m[1]}`);
    }
  }
});
