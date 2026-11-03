#!/usr/bin/env node
// Päivittää sw.js:n versiotunnisteen ja esivälimuistin tiedostolistan sovellustiedostojen sisällön mukaan.
//   node tools/stamp.mjs          kirjoittaa sw.js:ään
//   node tools/stamp.mjs --check  poistuu virhekoodilla 1, jos sw.js ei ole ajan tasalla

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const INCLUDE_DIRS = ['css', 'js', 'data', 'icons'];
const INCLUDE_FILES = ['index.html', 'manifest.webmanifest'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function collect() {
  const files = [...INCLUDE_FILES];
  for (const d of INCLUDE_DIRS) files.push(...walk(join(root, d)).map((p) => relative(root, p).split(sep).join('/')));
  return [...new Set(files)].sort();
}

export function stamp() {
  const files = collect();
  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update('\0');
    hash.update(readFileSync(join(root, f)));
    hash.update('\0');
  }
  const version = hash.digest('hex').slice(0, 10);
  const block = `// <generated>\nconst VERSION = '${version}';\nconst SHELL = [\n  './',\n${files.map((f) => `  '${f}',`).join('\n')}\n];\n// </generated>`;
  const swPath = join(root, 'sw.js');
  const current = readFileSync(swPath, 'utf8');
  const next = current.replace(/\/\/ <generated>[\s\S]*?\/\/ <\/generated>/, block);
  return { version, files, current, next, swPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, files, current, next, swPath } = stamp();
  if (process.argv.includes('--check')) {
    if (current !== next) {
      console.error('sw.js ei ole ajan tasalla. Aja: node tools/stamp.mjs');
      process.exit(1);
    }
    console.log(`sw.js ajan tasalla (${version}, ${files.length} tiedostoa)`);
  } else {
    writeFileSync(swPath, next);
    console.log(`sw.js päivitetty: versio ${version}, ${files.length} tiedostoa`);
  }
}
