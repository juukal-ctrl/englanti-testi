// API-avainten säilytys.
//
// Oletuksena avain pysyy vain tämän välilehden muistissa ja katoaa, kun sovellus suljetaan. Laitteelle (selaimen
// tietokantaan, selkotekstinä) se tallennetaan vain, jos käyttäjä valitsee asetuksista "Muista avain tällä laitteella".
// Avainta ei koskaan kirjoiteta asetuksiin eikä varmuuskopioon: se on omassa kv-avaimessaan (aiKeys), jota
// varmuuskopio ei sisällä.

import { PROVIDERS } from './ai.js';

export const KEYS_KV = 'aiKeys';

/**
 * db: tallennus (getKv/setKv); getSettings: palauttaa nykyiset asetukset (rememberKey ratkaisee, tallennetaanko).
 */
export function createKeyStore(db, getSettings) {
  const memory = new Map(); // palvelu → avain

  const readStored = async () => {
    const saved = await db.getKv(KEYS_KV, {});
    const out = {};
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const p of PROVIDERS) if (typeof saved[p] === 'string' && saved[p]) out[p] = saved[p];
    }
    return out;
  };
  const writeStored = (obj) => db.setKv(KEYS_KV, obj);

  return {
    /** Avain palvelulle: muistista, tai laitteelta, jos "muista" on päällä. Tyhjä merkkijono, jos avainta ei ole. */
    async get(provider) {
      if (memory.has(provider)) return memory.get(provider);
      if (!getSettings().rememberKey) return '';
      const stored = (await readStored())[provider] ?? '';
      if (stored) memory.set(provider, stored);
      return stored;
    },

    /** Asettaa avaimen muistiin ja, jos "muista" on päällä, laitteelle. Tyhjä avain poistaa sen. */
    async set(provider, key) {
      const k = String(key ?? '').trim();
      if (k) memory.set(provider, k);
      else memory.delete(provider);
      if (getSettings().rememberKey) {
        const stored = await readStored();
        if (k) stored[provider] = k;
        else delete stored[provider];
        await writeStored(stored);
      }
    },

    /** "Muista" kytketään päälle (muistissa olevat avaimet tallennetaan) tai pois (laitteelta poistetaan kaikki). */
    async setRemember(on) {
      if (on) {
        const stored = await readStored();
        for (const [p, k] of memory) stored[p] = k;
        await writeStored(stored);
      } else {
        await writeStored({});
      }
    },

    /** Poistaa kaikki avaimet muistista ja laitteelta. */
    async forget() {
      memory.clear();
      await writeStored({});
    },

    /** Palvelut, joiden avain on tallennettu laitteelle (asetusten tilatekstiä varten). */
    async storedOnDevice() {
      return Object.keys(await readStored());
    },
  };
}
