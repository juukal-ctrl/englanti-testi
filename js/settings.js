// Asetukset: oletukset ja siivous. Sama siivous suojaa varmuuskopion tuonnissa.

export const DEFAULT_SETTINGS = Object.freeze({
  retention: 0.9, // FSRS:n tavoitesäilyvyys
  newPerDay: 6, // uusia ilmauksia päivässä
  sessionMinutes: 15, // ydinsession pituus
  voiceURI: '', // tyhjä = automaattinen valinta
  rate: 0.95, // puhenopeus
  theme: 'auto', // auto | light | dark
  textScale: 1, // tekstin koko
  clearText: false, // selkeä tekstitila (väljempi rivi- ja kirjainväli)
  reduceMotion: false,
  speakMode: 'mic', // mic | type
  autoplay: true, // ääni toistuu itsestään uuden ilmauksen yhteydessä
  aiProvider: 'gemini', // gemini | anthropic
  aiModel: 'gemini-3.5-flash-lite',
  rememberKey: false,
});

const RULES = {
  retention: { type: 'number', min: 0.7, max: 0.97 },
  newPerDay: { type: 'int', min: 0, max: 30 },
  sessionMinutes: { type: 'int', min: 5, max: 60 },
  voiceURI: { type: 'string', max: 200 },
  rate: { type: 'number', min: 0.6, max: 1.3 },
  theme: { type: 'enum', values: ['auto', 'light', 'dark'] },
  textScale: { type: 'number', min: 0.85, max: 1.6 },
  clearText: { type: 'bool' },
  reduceMotion: { type: 'bool' },
  speakMode: { type: 'enum', values: ['mic', 'type'] },
  autoplay: { type: 'bool' },
  aiProvider: { type: 'enum', values: ['gemini', 'anthropic'] },
  aiModel: { type: 'string', max: 80, pattern: /^[A-Za-z0-9._:/-]*$/ },
  rememberKey: { type: 'bool' },
};

/** Palauttaa täydellisen, tarkistetun asetusolion: tuntemattomat avaimet pudotetaan ja virheelliset arvot korvataan oletuksella. */
export function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, rule] of Object.entries(RULES)) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (rule.type) {
      case 'number':
        if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(rule.max, Math.max(rule.min, v));
        break;
      case 'int':
        if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(rule.max, Math.max(rule.min, Math.round(v)));
        break;
      case 'bool':
        if (typeof v === 'boolean') out[key] = v;
        break;
      case 'enum':
        if (rule.values.includes(v)) out[key] = v;
        break;
      case 'string':
        if (typeof v === 'string' && v.length <= rule.max && (!rule.pattern || rule.pattern.test(v))) out[key] = v;
        break;
    }
  }
  return out;
}
