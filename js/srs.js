// Kertausten hallinta: kortit muistissa, kirjaus tietokantaan, erääntyvien jono.

import { newCard, schedule, review, State, currentRetrievability } from './fsrs.js';
import { dayIndex } from './util.js';

export class Srs {
  /**
   * @param db       db.js:n palauttama tallennus
   * @param settings funktio, joka palauttaa nykyiset asetukset
   * @param now      funktio, joka palauttaa nykyhetken (testeissä korvattava)
   */
  constructor(db, settings, now = () => Date.now()) {
    this.db = db;
    this.settings = settings;
    this.now = now;
    this.cards = new Map();
  }

  async load() {
    this.cards = new Map((await this.db.getAllCards()).map((c) => [c.id, c]));
    return this;
  }

  today() {
    return dayIndex(this.now());
  }

  opts() {
    return { retention: this.settings().retention };
  }

  card(id) {
    return this.cards.get(id) ?? null;
  }

  /** Ilmaus on opittu, kun sille on tehty ensimmäinen kertaus. */
  isLearned(id) {
    const c = this.cards.get(id);
    return Boolean(c) && c.state !== State.New;
  }

  /** Neljän painikkeen tulokset (Again/Hard/Good/Easy) tälle kortille juuri nyt. */
  preview(id) {
    return schedule(this.card(id) ?? newCard(), this.today(), this.opts());
  }

  /** Kirjaa vastauksen: päivittää kortin, tallentaa sen ja lisää tapahtuman kertaushistoriaan. */
  async grade(id, rating, { mode = '', ms = 0 } = {}) {
    const now = this.now();
    const today = dayIndex(now);
    const existing = this.card(id);
    const prev = existing ?? { ...newCard(), id, introducedDay: today };
    const next = { ...review(prev, rating, today, now, this.opts()), id, introducedDay: prev.introducedDay ?? today };
    this.cards.set(id, next);
    await this.db.putCard(next);
    await this.db.addReview({
      cardId: id,
      ts: now,
      day: today,
      rating,
      mode,
      stateBefore: prev.state,
      elapsedDays: prev.lastDay == null ? 0 : Math.max(0, today - prev.lastDay),
      intervalAfter: next.scheduledDays,
      ms: Math.max(0, Math.round(ms)),
    });
    return next;
  }

  /** Erääntyneet kortit: ensin ne, joiden muistaminen on todennäköisimmin heikoin. */
  due(today = this.today()) {
    const w = undefined;
    return [...this.cards.values()]
      .filter((c) => c.state !== State.New && c.dueDay != null && c.dueDay <= today)
      .map((c) => ({ c, r: currentRetrievability(c, today, w) }))
      .sort((a, b) => a.r - b.r || a.c.dueDay - b.c.dueDay || a.c.id.localeCompare(b.c.id))
      .map((x) => x.c);
  }

  /** Tänään otettujen uusien ilmausten määrä (päivittäistä rajaa varten). */
  introducedToday(today = this.today()) {
    let n = 0;
    for (const c of this.cards.values()) if (c.introducedDay === today) n++;
    return n;
  }

  async reset() {
    this.cards.clear();
    await this.db.clearAll();
  }
}
