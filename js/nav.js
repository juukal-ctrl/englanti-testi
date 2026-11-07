// Älykäs takaisin-toiminto: pitää selainhistorian matalana, jotta järjestelmän takaisin-painike (Androidin ele)
// palaa aina loogisesti ylempään näkymään eikä käy läpi kaikkia aiemmin avattuja näkymiä.
//
// Ajatus: jokainen näkymä kuuluu tiettyyn tasoon (Tänään = 0, välilehdet ja oppitunnit = 1, niiden alisivut = 2 ...).
// Historiassa on aina korkeintaan yksi merkintä kutakin tasoa kohti (reittipino). Siirtyminen
//   - syvemmälle lisää merkinnän (push),
//   - samalle tasolle korvaa nykyisen merkinnän (replace), eli välilehden vaihto ei kasvata historiaa,
//   - ylemmälle tasolle palaa jo olemassa olevaan merkintään (pop), eli "Valmis" ja "Takaisin" eivät lisää mitään.
// Tämä moduuli on puhdas: se vain laskee, mitä historialle pitää tehdä. Selainkutsut ovat app.js:ssä.

/** Näkymän taso: kuinka monta askelta Tänään-näkymästä. Tuntematon reitti näytetään Tänään-näkymänä. */
const ROUTE_DEPTH = {
  today: 0,
  review: 1,
  lessons: 1,
  speak: 1,
  more: 1,
  write: 1,
  session: 1,
  shadow: 1,
  lesson: 2,
  vocab: 2,
  progress: 2,
  settings: 2,
  install: 2,
};

/** Muuntaa osoitteen muotoon "#/reitti[/osa]". Tyhjä osoite on Tänään. */
export function normalizeHash(hash) {
  const raw = String(hash ?? '')
    .replace(/^#\/?/, '')
    .replace(/\/+$/, '');
  return `#/${raw || 'today'}`;
}

/** Osoitteen taso. Kirjoitustehtävä (write/<id>) on listan alla ja asetusten alisivu (settings/ai) asetusten alla. */
export function depthOf(hash) {
  const parts = normalizeHash(hash).slice(2).split('/');
  const base = ROUTE_DEPTH[parts[0]];
  if (base === undefined) return 0;
  if (parts[0] === 'write' && parts[1]) return 2;
  if (parts[0] === 'settings' && parts[1]) return 3;
  return base;
}

/**
 * Onko tallennettu pino käyttökelpoinen nykyiselle osoitteelle: taulukko osoitteita, jonka viimeinen on nykyinen
 * ja jonka tasot kasvavat aidosti.
 */
export function validStack(stack, hash) {
  if (!Array.isArray(stack) || stack.length === 0 || stack.length > 8) return false;
  if (!stack.every((s) => typeof s === 'string' && s === normalizeHash(s))) return false;
  if (stack[stack.length - 1] !== normalizeHash(hash)) return false;
  for (let i = 1; i < stack.length; i++) if (depthOf(stack[i]) <= depthOf(stack[i - 1])) return false;
  return true;
}

/**
 * Laskee, mitä historialle tehdään siirryttäessä osoitteeseen `hash`.
 * Palauttaa { kind, pops, next }:
 *   kind 'same'    nykyinen näkymä uudelleen: historiaan ei kosketa, näkymä piirretään alusta
 *   kind 'push'    uusi merkintä nykyisen päälle
 *   kind 'replace' nykyinen merkintä korvataan
 *   kind 'pop'     palataan `pops` merkintää taaksepäin (history.go(-pops)) ja saapunut merkintä korvataan tarvittaessa
 *   next           reittipino siirtymän jälkeen
 */
export function planNav(stack, hash) {
  const to = normalizeHash(hash);
  const cur = Array.isArray(stack) && stack.length ? stack : [to];
  if (to === cur[cur.length - 1]) return { kind: 'same', pops: 0, next: cur };
  const d = depthOf(to);
  let keep = 0; // pinon alkupää, jonka taso on pienempi kuin kohteen: se säilyy
  while (keep < cur.length && depthOf(cur[keep]) < d) keep++;
  const next = [...cur.slice(0, keep), to];
  if (keep === cur.length) return { kind: 'push', pops: 0, next };
  const pops = cur.length - 1 - keep;
  return { kind: pops === 0 ? 'replace' : 'pop', pops, next };
}

/** Pino sen jälkeen, kun selain on jo siirtynyt osoitteeseen itse (osoitteen kirjoitus, ulkoinen linkki). */
export function stackAfter(stack, hash) {
  const to = normalizeHash(hash);
  const cur = Array.isArray(stack) && stack.length ? stack : [];
  const d = depthOf(to);
  let keep = 0;
  while (keep < cur.length && depthOf(cur[keep]) < d) keep++;
  return [...cur.slice(0, keep), to];
}
