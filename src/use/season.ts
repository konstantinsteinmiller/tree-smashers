// ─── Holiday seasons (#Paint5) ──────────────────────────────────────────────
//
// The seasonal tree skins are worn during a short window around the holiday:
//   Halloween  Oct 28 – Nov 3   (one week around Oct 31)
//   Christmas  Dec 18 – Jan 1   (two weeks around Dec 25)
// Local calendar date, no persistence: the window decides, nothing is saved.
// `?season=halloween|christmas|none` forces a season for QA / screenshots.

export type Season = 'halloween' | 'christmas'

/** [month 1–12, day] inclusive bounds; a window may wrap the new year. */
const WINDOWS: Readonly<Record<Season, { from: [number, number], to: [number, number] }>> = {
  halloween: { from: [10, 28], to: [11, 3] },
  christmas: { from: [12, 18], to: [1, 1] }
}

const ordinal = (month: number, day: number): number => month * 100 + day

export const seasonOnDate = (date: Date): Season | null => {
  const o = ordinal(date.getMonth() + 1, date.getDate())
  for (const s of Object.keys(WINDOWS) as Season[]) {
    const { from, to } = WINDOWS[s]
    const a = ordinal(from[0], from[1])
    const b = ordinal(to[0], to[1])
    if (a <= b ? o >= a && o <= b : o >= a || o <= b) return s
  }
  return null
}

/** The season to dress the arena for now: the `?season=` override, else the calendar. */
export const activeSeason = (now: Date = new Date()): Season | null => {
  if (typeof location !== 'undefined') {
    const m = /[?&]season=(halloween|christmas|none)(?:&|$)/.exec(location.search)
    if (m) return m[1] === 'none' ? null : (m[1] as Season)
  }
  return seasonOnDate(now)
}
