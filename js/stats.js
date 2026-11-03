// Edistymisen laskenta (puhtaita funktioita; syötteenä kortit ja kertaushistoria).

import { State, currentRetrievability } from './fsrs.js';

export const MATURE_DAYS = 21;

export function summarize(cards, reviews, today) {
  const learned = cards.filter((c) => c.state !== State.New);
  const mature = learned.filter((c) => c.stability >= MATURE_DAYS);
  const rs = learned.map((c) => currentRetrievability(c, today));
  const avgRecall = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const dueNow = learned.filter((c) => c.dueDay != null && c.dueDay <= today).length;

  // Toteutunut säilyvyys: vain aiemmin opittujen korttien kertaukset, joissa on ehtinyt kulua yli päivä.
  const since = (n) => reviews.filter((r) => r.day != null && r.day > today - n);
  const mem = since(30).filter((r) => (r.stateBefore === State.Review || r.stateBefore === State.Relearning) && r.elapsedDays >= 1);
  const trueRetention = mem.length >= 10 ? mem.filter((r) => r.rating >= 2).length / mem.length : null;

  const perDay = new Map();
  for (const r of reviews) if (r.day != null) perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1);
  const last14 = [];
  for (let d = today - 13; d <= today; d++) last14.push({ day: d, n: perDay.get(d) ?? 0 });

  const forecast = [];
  for (let d = today; d < today + 7; d++) {
    forecast.push({ day: d, n: learned.filter((c) => (d === today ? c.dueDay != null && c.dueDay <= today : c.dueDay === d)).length });
  }

  return {
    learned: learned.length,
    mature: mature.length,
    young: learned.length - mature.length,
    lapses: learned.reduce((a, c) => a + c.lapses, 0),
    avgRecall,
    dueNow,
    trueRetention,
    trueRetentionSample: mem.length,
    reviews7: since(7).length,
    reviews30: since(30).length,
    activeDays30: new Set(since(30).map((r) => r.day)).size,
    last14,
    forecast,
  };
}

/** Päivän yhteenveto istunnon päätteeksi. */
export function dayTotals(reviews, today) {
  const todays = reviews.filter((r) => r.day === today);
  const ms = todays.reduce((a, r) => a + (r.ms || 0), 0);
  return {
    reviews: todays.length,
    correct: todays.filter((r) => r.rating >= 3).length,
    ms,
  };
}
