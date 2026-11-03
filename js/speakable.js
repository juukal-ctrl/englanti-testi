// Tekstin muokkaus äänentoistoa varten (puhdas moduuli, ei selainriippuvuuksia).
// Puhesynteesi lukee "October 3" usein "October three", vaikka amerikanenglannissa päivämäärä sanotaan
// järjestyslukuna: "October third". Sama koskee muotoa "the 15th". Aukon merkki (…) poistetaan.

const ORDINALS = [
  '', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth',
  'nineteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth',
  'twenty-sixth', 'twenty-seventh', 'twenty-eighth', 'twenty-ninth', 'thirtieth', 'thirty-first',
];

/** Päivän järjestysluku sanana (1–31), muuten null. */
export function ordinalWord(n) {
  return Number.isInteger(n) && n >= 1 && n <= 31 ? ORDINALS[n] : null;
}

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';
const MONTH_DAY = new RegExp(`\\b(${MONTHS})(\\.?)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:\\d])`, 'g');
const ORDINAL_DIGITS = /\b(\d{1,2})(?:st|nd|rd|th)\b/g;

/** Asetusten "Testaa ääni" -painikkeen lause. Se on mukana myös esiäänitettävien tekstien luettelossa. */
export const VOICE_TEST_TEXT = 'Could you possibly send me the updated report by noon?';

/** Palauttaa tekstin siinä muodossa, jossa se kannattaa lukea ääneen. */
export function speakable(text) {
  return String(text ?? '')
    .replace(/…-ing/g, ' ')
    .replace(/…/g, ' ')
    .replace(MONTH_DAY, (m, month, dot, day) => {
      const word = ordinalWord(Number(day));
      return word ? `${month}${dot} ${word}` : m;
    })
    .replace(ORDINAL_DIGITS, (m, day) => ordinalWord(Number(day)) ?? m)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}
