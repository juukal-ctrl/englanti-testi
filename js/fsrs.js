// FSRS-6 -ajastin (puhdas moduuli, ei I/O:ta).
//
// Kaavat: Free Spaced Repetition Scheduler, versio 6 (21 parametria).
//  - Unohtamiskäyrä R(t,S) = (1 + FACTOR·t/S)^DECAY, DECAY = -w20, FACTOR = 0.9^(1/DECAY) - 1
//  - Väli I(r,S) = S/FACTOR · (r^(1/DECAY) - 1)
//  - Alkuarvot S0(G) = w[G-1], D0(G) = w4 - e^(w5·(G-1)) + 1
//  - Vaikeus: lineaarinen vaimennus + paluu kohti D0(4):ää (w7)
//  - Vakaus muistaessa / unohtaessa sekä saman päivän kertaukset (w17–w19)
// Oletuspainot: FSRS-6:n oletusparametrit, joita Anki käyttää (fsrs-rs).
//
// Päivät lasketaan kokonaisina kalenteripäivinä (päiväindeksi), ei kellonaikoina.

export const DEFAULT_W = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

export const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });
export const State = Object.freeze({ New: 0, Learning: 1, Review: 2, Relearning: 3 });

export const DEFAULTS = Object.freeze({ retention: 0.9, maxInterval: 36500 });

const S_MIN = 0.001;
const S_MAX = 36500;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function decayOf(w = DEFAULT_W) {
  return -w[20];
}

export function factorOf(w = DEFAULT_W) {
  return Math.pow(0.9, 1 / decayOf(w)) - 1;
}

/** Muistamisen todennäköisyys, kun edellisestä kertauksesta on kulunut `elapsedDays` päivää. */
export function retrievability(elapsedDays, stability, w = DEFAULT_W) {
  if (!(stability > 0)) return 0;
  return Math.pow(1 + (factorOf(w) * Math.max(0, elapsedDays)) / stability, decayOf(w));
}

/** Kertausväli kokonaisina päivinä (vähintään 1) tavoitesäilyvyydelle. */
export function intervalFor(stability, retention = DEFAULTS.retention, w = DEFAULT_W, maxInterval = DEFAULTS.maxInterval) {
  const raw = (stability / factorOf(w)) * (Math.pow(retention, 1 / decayOf(w)) - 1);
  return clamp(Math.round(raw), 1, maxInterval);
}

export function initStability(g, w = DEFAULT_W) {
  return clamp(w[g - 1], S_MIN, S_MAX);
}

export function initDifficulty(g, w = DEFAULT_W, doClamp = true) {
  const d = w[4] - Math.exp(w[5] * (g - 1)) + 1;
  return doClamp ? clamp(d, 1, 10) : d;
}

export function nextDifficulty(d, g, w = DEFAULT_W) {
  const delta = -w[6] * (g - 3);
  const damped = d + ((10 - d) * delta) / 9;
  const reverted = w[7] * initDifficulty(4, w, false) + (1 - w[7]) * damped;
  return clamp(reverted, 1, 10);
}

export function nextRecallStability(d, s, r, g, w = DEFAULT_W) {
  const hardPenalty = g === Rating.Hard ? w[15] : 1;
  const easyBonus = g === Rating.Easy ? w[16] : 1;
  const growth =
    1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus;
  return clamp(s * growth, S_MIN, S_MAX);
}

export function nextForgetStability(d, s, r, w = DEFAULT_W) {
  const longTerm = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
  const shortTerm = s / Math.exp(w[17] * w[18]);
  return clamp(Math.min(longTerm, shortTerm), S_MIN, S_MAX);
}

/** Saman päivän uusinta: vakaus muuttuu vain vähän, eikä Good/Easy koskaan pienennä sitä. */
export function shortTermStability(s, g, w = DEFAULT_W) {
  let increase = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(s, -w[19]);
  if (g >= Rating.Good) increase = Math.max(increase, 1);
  return clamp(s * increase, S_MIN, S_MAX);
}

export function newCard() {
  return {
    state: State.New,
    stability: 0,
    difficulty: 0,
    dueDay: null,
    lastDay: null,
    lastReview: null,
    reps: 0,
    lapses: 0,
    scheduledDays: 0,
  };
}

function nextMemory(card, g, today, w) {
  if (card.state === State.New || !(card.stability > 0)) {
    return {
      stability: initStability(g, w),
      difficulty: initDifficulty(g, w),
      state: g === Rating.Again ? State.Learning : State.Review,
      lapses: card.lapses,
    };
  }
  const elapsed = Math.max(0, today - (card.lastDay ?? today));
  const difficulty = nextDifficulty(card.difficulty, g, w);
  let stability;
  if (elapsed < 1) {
    stability = shortTermStability(card.stability, g, w);
  } else {
    const r = retrievability(elapsed, card.stability, w);
    stability =
      g === Rating.Again
        ? nextForgetStability(card.difficulty, card.stability, r, w)
        : nextRecallStability(card.difficulty, card.stability, r, g, w);
  }
  let state = State.Review;
  let lapses = card.lapses;
  if (g === Rating.Again) {
    state = card.state === State.Learning ? State.Learning : State.Relearning;
    lapses += 1;
  }
  return { stability, difficulty, state, lapses };
}

/**
 * Laskee kaikki neljä mahdollista tulosta. Palauttaa { 1: {...kortti, interval}, 2: ..., 3: ..., 4: ... }.
 * Välit pidetään nousevina (Again ≤ Hard < Good < Easy), jotta painikkeiden ajat eivät mene ristiin.
 */
export function schedule(card, today, opts = {}) {
  const w = opts.w ?? DEFAULT_W;
  const retention = opts.retention ?? DEFAULTS.retention;
  const maxInterval = opts.maxInterval ?? DEFAULTS.maxInterval;
  const raw = {};
  for (const g of [1, 2, 3, 4]) {
    const m = nextMemory(card, g, today, w);
    raw[g] = { ...m, interval: intervalFor(m.stability, retention, w, maxInterval) };
  }
  let hard = Math.min(raw[2].interval, raw[3].interval);
  const again = Math.min(raw[1].interval, hard);
  const good = Math.max(raw[3].interval, hard + 1);
  const easy = Math.max(raw[4].interval, good + 1);
  hard = Math.min(hard, good);
  const intervals = { 1: again, 2: hard, 3: good, 4: easy };
  const out = {};
  for (const g of [1, 2, 3, 4]) {
    const interval = Math.min(intervals[g], maxInterval);
    out[g] = {
      ...card,
      state: raw[g].state,
      stability: raw[g].stability,
      difficulty: raw[g].difficulty,
      lapses: raw[g].lapses,
      reps: card.reps + 1,
      scheduledDays: interval,
      lastDay: today,
      dueDay: today + interval,
      interval,
    };
  }
  return out;
}

/** Kirjaa yhden kertauksen: palauttaa uuden kortin (alkuperäistä ei muuteta). */
export function review(card, g, today, now, opts = {}) {
  const { interval: _interval, ...next } = schedule(card, today, opts)[g];
  return { ...next, lastReview: now };
}

/** Yksi sanallinen arvio kortin muistin tilasta (0–1), kun päivä on `today`. */
export function currentRetrievability(card, today, w = DEFAULT_W) {
  if (card.state === State.New || !(card.stability > 0)) return 0;
  return retrievability(Math.max(0, today - (card.lastDay ?? today)), card.stability, w);
}

/** Lyhyt, ihmiselle luettava väli: "1 pv", "3 pv", "2 vk", "5 kk", "1,2 v". */
export function formatInterval(days) {
  if (days < 1) return '<1 pv';
  if (days < 14) return `${days} pv`;
  if (days < 60) return `${Math.round(days / 7)} vk`;
  if (days < 365) return `${Math.round(days / 30)} kk`;
  return `${(days / 365).toFixed(1).replace('.', ',')} v`;
}
