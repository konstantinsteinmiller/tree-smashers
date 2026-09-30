// ─── The game's calendar day ────────────────────────────────────────────────
//
// Every once-a-day mechanic (daily challenge, daily rewards, the daily free
// 2x speed-up) rolls over at 00:00 UTC — the same instant for every player,
// whatever their timezone, so two devices of one player always agree on
// "today". 'YYYY-MM-DD' strings compare correctly with plain `<` / `>`.

export const utcDayKey = (now: number = Date.now()): string =>
  new Date(now).toISOString().slice(0, 10)

/** The UTC day before `utcDayKey(now)`. UTC has no DST, so 24 h back is
 *  always exactly the previous calendar day. */
export const previousUtcDayKey = (now: number = Date.now()): string =>
  utcDayKey(now - 24 * 60 * 60 * 1000)

/** Milliseconds in one UTC day (UTC has no DST — every day is exactly this). */
export const UTC_DAY_MS = 24 * 60 * 60 * 1000

/** Whole UTC days elapsed from the start of `sinceKey` (a 'YYYY-MM-DD' key,
 *  which `Date.parse` reads as 00:00 UTC) to `now`: 0 on that day itself,
 *  1 from the next 00:00 UTC, and so on. Negative if `now` is before it;
 *  NaN if `sinceKey` does not parse. Multi-day windows (the battle-pass
 *  season) are counted in these units. */
export const utcDaysSince = (sinceKey: string, now: number = Date.now()): number =>
  Math.floor((now - Date.parse(sinceKey)) / UTC_DAY_MS)

/** Milliseconds from `now` until the next 00:00 UTC — when `utcDayKey`
 *  rolls over. Always in (0, UTC_DAY_MS]: exactly at midnight it is a full
 *  day, never 0, so a timer armed with it cannot fire in a tight loop. */
export const msUntilNextUtcMidnight = (now: number = Date.now()): number =>
  UTC_DAY_MS - (((now % UTC_DAY_MS) + UTC_DAY_MS) % UTC_DAY_MS)
