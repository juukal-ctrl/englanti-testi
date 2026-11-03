#!/usr/bin/env node
// Luettelee kaikki tekstit, jotka sovellus voi lukea ääneen ja jotka esiäänitetään (Kokoro).
//   node tools/tts/texts.mjs     tulostaa JSON-luettelon { normal: [...], slow: [...] }
// "normal" = kaikki luettavat tekstit. "slow" = tekstit, joilla on "Hitaasti"-painike (esimerkkilause ja malli).
// Tekstit ovat samassa muodossa kuin speakable() palauttaa ne, koska sovellus hakee leikkeet sillä avaimella.

import { fileURLToPath } from 'node:url';
import { CATALOG, BLANK } from '../../js/content.js';
import { speakable, VOICE_TEST_TEXT } from '../../js/speakable.js';

export function collectTexts(catalog = CATALOG) {
  const normal = new Set();
  const slow = new Set();
  const add = (set, text) => {
    const t = speakable(text);
    if (t) set.add(t);
  };
  add(normal, VOICE_TEST_TEXT);
  for (const it of catalog.items) {
    add(normal, it.en); // ilmaus (kaiutin ilmauksen vieressä)
    add(normal, it.ex); // esimerkkilause
    add(normal, it.say); // malli puheharjoituksessa ja sanastossa
    if (it.cloze) add(normal, it.cloze.text.replace(BLANK, () => it.cloze.answer)); // täytetty aukkolause
    add(slow, it.ex);
    add(slow, it.say);
  }
  const sorted = (set) => [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { normal: sorted(normal), slow: sorted(slow) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(collectTexts())}\n`);
}
