// Sovelluksen korjaus: poistaa service workerin ja sovelluskuoren välimuistin, jotta seuraava käynnistys hakee tiedostot
// uudelleen verkosta. Oppimisdataa (IndexedDB) ja äänivälimuistia ei kosketa.

import { AUDIO_CACHE } from './clips.js';

/** Palauttaa { unregistered, removedCaches }. Ei heitä virhettä: puuttuva rajapinta tai epäonnistunut poisto ohitetaan. */
export async function repairApp({ cacheStorage = globalThis.caches, nav = globalThis.navigator } = {}) {
  let unregistered = 0;
  let removedCaches = 0;
  try {
    const regs = (await nav?.serviceWorker?.getRegistrations?.()) ?? [];
    for (const reg of regs) if (await reg.unregister()) unregistered++;
  } catch {
    /* service worker -rajapinta ei ole käytettävissä */
  }
  try {
    for (const key of (await cacheStorage?.keys?.()) ?? []) {
      if (key.startsWith('englanti-') && key !== AUDIO_CACHE && (await cacheStorage.delete(key))) removedCaches++;
    }
  } catch {
    /* välimuisti ei ole käytettävissä */
  }
  return { unregistered, removedCaches };
}
