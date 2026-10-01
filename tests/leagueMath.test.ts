// LG0 — pure league math (src/league/leagueMath.ts).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  AD_BONUS, AD_MAX, CHAMPION_LP, DAILY_FIGHTS, DAILY_LP_CAP, DAY_MS, GATEKEEPER_LEVEL, LEAGUE_EPOCH_MS,
  MIN_BATTLE_MS, PROMOTION_SHIELDS, SEASON_MS, SERVER_DAILY_CAP, TIER_FLOOR_POWER, TOKEN_TTL_MS,
  applyBattle, atPromotionGate, championRank, dailyFightLimit, divisionFloorLp, expectedScore,
  initialLeagueState, lpDelta, opponentTargets, rewardCoins, rollover, sanitizeLp, sanitizeState,
  seasonBounds, seasonFloorLp, seasonIndex, seasonReset, seasonReward, streakBonus, tierFloorLp, tierOf,
  utcDay, type LeagueMathState
} from '../src/league/leagueMath'
import { LEAGUE_TIERS, type LeagueTier } from '../src/use/leagueTiers'

const SRC = readFileSync(path.resolve(__dirname, '../src/league/leagueMath.ts'), 'utf8')
// code only — the header may NAME what the file must not do
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// A fixed "now" inside season 0, on a known UTC day.
const T0 = LEAGUE_EPOCH_MS + 3 * DAY_MS + 5 * 3600_000
const st = (over: Partial<LeagueMathState> = {}): LeagueMathState =>
  ({ ...initialLeagueState(T0), ...over })
const win = (E = 0.5) => ({ result: 'win' as const, E })
const loss = (E = 0.5) => ({ result: 'loss' as const, E })

const deepFreeze = <T extends object>(o: T): T => {
  Object.freeze(o)
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v)
  return o
}

describe('worker-shared static guard (F5)', () => {
  it('has no alias import, no import.meta.env, no Vue, no clock', () => {
    expect(SRC).not.toMatch(/from\s+['"]@\//)
    expect(SRC).not.toMatch(/import\(\s*['"]@\//)
    expect(SRC).not.toMatch(/import\.meta\.env/)
    expect(SRC).not.toMatch(/from\s+['"]vue['"]/)
    expect(CODE).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(|globalThis|window\.|localStorage/)
  })
  it('only imports relative modules', () => {
    const specs = [...SRC.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1])
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) expect(s).toMatch(/^\.\.?\//)
  })
})

describe('constants', () => {
  it('match the contract', () => {
    expect([DAILY_FIGHTS, AD_BONUS, AD_MAX, SERVER_DAILY_CAP, MIN_BATTLE_MS, TOKEN_TTL_MS]).toEqual([10, 3, 2, 16, 12_000, 900_000])
    expect(DAILY_FIGHTS + AD_BONUS * AD_MAX).toBe(SERVER_DAILY_CAP)
    expect(new Date(LEAGUE_EPOCH_MS).toISOString()).toBe('2026-10-05T00:00:00.000Z')
    expect(new Date(LEAGUE_EPOCH_MS).getUTCDay()).toBe(1) // Monday
    expect(SEASON_MS).toBe(28 * DAY_MS)
  })
  it('floor powers ascend with the tiers; every gated tier has a gatekeeper level', () => {
    const p = LEAGUE_TIERS.map(t => TIER_FLOOR_POWER[t])
    for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThan(p[i - 1]!)
    expect(GATEKEEPER_LEVEL.wood).toBe(0)
    for (const t of LEAGUE_TIERS.slice(1)) expect(GATEKEEPER_LEVEL[t]).toBeGreaterThan(0)
  })
})

describe('tierOf / floors / gate', () => {
  it.each([
    [0, 'wood', 3, 0], [99, 'wood', 3, 99], [100, 'wood', 2, 0], [199, 'wood', 2, 99], [200, 'wood', 1, 0],
    [299, 'wood', 1, 99], [300, 'bronze', 3, 0], [599, 'bronze', 1, 99], [600, 'silver', 3, 0],
    [900, 'gold', 3, 0], [1200, 'platinum', 3, 0], [1500, 'diamond', 3, 0], [1799, 'diamond', 1, 99],
    [1800, 'champion', null, 0], [1801, 'champion', null, 1], [5000, 'champion', null, 3200]
  ] as const)('lp %i → %s %s +%i', (lp, tier, division, lpIn) => {
    expect(tierOf(lp)).toEqual({ tier, division, lpInDivision: lpIn })
  })
  it('sanitises bad LP to a whole number ≥ 0', () => {
    expect(tierOf(-5)).toEqual({ tier: 'wood', division: 3, lpInDivision: 0 })
    expect(tierOf(Number.NaN).lpInDivision).toBe(0)
    expect(tierOf(Infinity).tier).toBe('wood')
    expect(tierOf(299.9)).toEqual({ tier: 'wood', division: 1, lpInDivision: 99 })
    expect(sanitizeLp(12.7)).toBe(12)
  })
  it('atPromotionGate only at x99 of a Div I below Champion', () => {
    for (const lp of [299, 599, 899, 1199, 1499, 1799]) expect(atPromotionGate(lp)).toBe(true)
    for (const lp of [0, 99, 199, 298, 300, 399, 499, 1800, 1899, 2099, 2399]) expect(atPromotionGate(lp)).toBe(false)
  })
  it('tier / division floors', () => {
    expect(LEAGUE_TIERS.map(tierFloorLp)).toEqual([0, 300, 600, 900, 1200, 1500, 1800])
    expect([0, 99, 100, 299, 350, 1799, 1800, 2345].map(divisionFloorLp)).toEqual([0, 0, 100, 200, 300, 1700, 1800, 1800])
  })
  it('season floor: Bronze/Silver/Gold reached are safe, Platinum+ one tier below the peak', () => {
    expect([0, 299, 300, 650, 1199, 1200, 1499, 1500, 1800, 3000].map(seasonFloorLp))
      .toEqual([0, 0, 300, 600, 900, 900, 900, 1200, 1500, 1500])
  })
})

describe('expectedScore', () => {
  it('is 0.5 at parity and complementary', () => {
    expect(expectedScore(80, 80)).toBeCloseTo(0.5, 12)
    for (const [a, b] of [[20, 30], [100, 60], [1, 400]]) expect(expectedScore(a!, b!) + expectedScore(b!, a!)).toBeCloseTo(1, 12)
  })
  it('rises with own power and falls with the opponent\'s', () => {
    expect(expectedScore(90, 80)).toBeGreaterThan(expectedScore(85, 80))
    expect(expectedScore(80, 90)).toBeLessThan(expectedScore(80, 85))
    expect(expectedScore(120, 100)).toBeGreaterThan(0.6)
    expect(expectedScore(120, 100)).toBeLessThan(0.7)
  })
  it('stays finite for 0 / negative / NaN powers (treated as 1)', () => {
    expect(expectedScore(0, 0)).toBe(0.5)
    expect(expectedScore(-3, Number.NaN)).toBe(0.5)
    expect(expectedScore(0, 50)).toBeGreaterThan(0)
  })
})

describe('lpDelta', () => {
  const base = { tier: 'gold' as LeagueTier, streak: 0, isGate: false }
  it('win = +round(10 + 30(1 − E))', () => {
    expect(lpDelta({ ...base, result: 'win', E: 0 })).toBe(40)
    expect(lpDelta({ ...base, result: 'win', E: 1 })).toBe(10)
    expect(lpDelta({ ...base, result: 'win', E: 0.5 })).toBe(25)
    expect(lpDelta({ ...base, result: 'win', E: 0.33 })).toBe(30) // 30.1
  })
  it('loss = −round((10 + 30E) × f) with f Wood 0 / Bronze .5 / Silver .75 / Gold+ 1', () => {
    const l = (tier: LeagueTier, E: number) => lpDelta({ ...base, tier, result: 'loss', E })
    expect(Object.is(l('wood', 1), 0)).toBe(true) // never −0
    expect(l('bronze', 0.5)).toBe(-13) // 12.5
    expect(l('silver', 0.5)).toBe(-19) // 18.75
    expect(l('gold', 0.5)).toBe(-25)
    expect(l('platinum', 1)).toBe(-40)
    expect(l('diamond', 0)).toBe(-10)
    expect(l('champion', 0.2)).toBe(-16)
  })
  it('clamps E into [0, 1] and treats NaN as 0.5', () => {
    expect(lpDelta({ ...base, result: 'win', E: -1 })).toBe(40)
    expect(lpDelta({ ...base, result: 'win', E: 2 })).toBe(10)
    expect(lpDelta({ ...base, result: 'win', E: Number.NaN })).toBe(25)
  })
  it('gate: win +1, loss −20 whatever E and tier — except Wood, where a gate loss is free (LM3)', () => {
    expect(lpDelta({ ...base, isGate: true, result: 'win', E: 0.9, streak: 9 })).toBe(1)
    expect(lpDelta({ ...base, tier: 'bronze', isGate: true, result: 'loss', E: 0 })).toBe(-20)
    expect(lpDelta({ ...base, tier: 'diamond', isGate: true, result: 'loss', E: 1 })).toBe(-20)
    expect(Object.is(lpDelta({ ...base, tier: 'wood', isGate: true, result: 'loss', E: 0 }), 0)).toBe(true)
  })
  it('streak: +5 on the 3rd consecutive win, +10 on the 4th, max +15, below Diamond only', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(s => streakBonus('bronze', s))).toEqual([0, 0, 5, 10, 15, 15, 15])
    expect(streakBonus('platinum', 4)).toBe(15)
    expect(streakBonus('diamond', 4)).toBe(0)
    expect(streakBonus('champion', 4)).toBe(0)
    expect(streakBonus('wood', -3)).toBe(0)
    expect(streakBonus('wood', Number.NaN)).toBe(0)
    expect(lpDelta({ ...base, tier: 'silver', streak: 2, result: 'win', E: 0.5 })).toBe(30)
    expect(lpDelta({ ...base, tier: 'silver', streak: 2, result: 'loss', E: 0.5 })).toBe(-19)
  })
})

describe('applyBattle', () => {
  it('a normal win adds LP, counts the streak, the day gain and the battle', () => {
    const r = applyBattle(st({ lp: 50, peakLp: 50 }), win(0.5), T0)
    expect(r.delta).toBe(25)
    expect(r.state).toMatchObject({ lp: 75, peakLp: 75, streak: 1, dayGain: 25, battles: 1 })
    expect(r).toMatchObject({ isGate: false, promotedTo: null, firstReach: null, shielded: false, capped: false, seasonEnded: null })
  })
  it('does not mutate its input', () => {
    const s = deepFreeze(st({ lp: 250, peakLp: 250, streak: 2 }))
    expect(() => applyBattle(s, win(0), T0)).not.toThrow()
    expect(s.lp).toBe(250)
  })
  it('a win stops at x99 of Div I; the next fight is the gatekeeper', () => {
    const r = applyBattle(st({ lp: 280, peakLp: 280 }), win(0), T0)
    expect(r.state.lp).toBe(299)
    expect(r.delta).toBe(19)
    expect(atPromotionGate(r.state.lp)).toBe(true)
    // Diamond → gate at 1799 (not Champion)
    expect(applyBattle(st({ lp: 1790, peakLp: 1790 }), win(0), T0).state.lp).toBe(1799)
  })
  it('gatekeeper win → next tier Div III at 0 LP, shields armed, first reach', () => {
    const r = applyBattle(st({ lp: 299, peakLp: 299, streak: 4 }), win(0.9), T0)
    expect(r).toMatchObject({ isGate: true, promotedTo: 'bronze', firstReach: 'bronze', delta: 1 })
    expect(r.state).toMatchObject({ lp: 300, shields: PROMOTION_SHIELDS, streak: 5 })
    expect(tierOf(r.state.lp)).toEqual({ tier: 'bronze', division: 3, lpInDivision: 0 })
    const c = applyBattle(st({ lp: 1799, peakLp: 1799 }), win(), T0)
    expect(c.promotedTo).toBe('champion')
    expect(c.state.lp).toBe(CHAMPION_LP)
  })
  it('a re-promotion to an already-reached tier is not a first reach', () => {
    const r = applyBattle(st({ lp: 1499, peakLp: 1600 }), win(), T0)
    expect(r.promotedTo).toBe('diamond')
    expect(r.firstReach).toBeNull()
  })
  it('gatekeeper loss costs 20 and keeps the player in Div I', () => {
    const r = applyBattle(st({ lp: 599, peakLp: 599, streak: 3 }), loss(0.2), T0)
    expect(r).toMatchObject({ isGate: true, delta: -20, promotedTo: null })
    expect(r.state).toMatchObject({ lp: 579, streak: 0 })
    expect(tierOf(r.state.lp).division).toBe(1)
    // LM3: a Wood gate loss costs nothing (the Wood no-loss rule wins)
    expect(applyBattle(st({ lp: 299, peakLp: 299 }), loss(), T0)).toMatchObject({ isGate: true, delta: 0, shielded: false })
  })
  it('the gate win is never blocked by the daily cap', () => {
    const r = applyBattle(st({ lp: 899, peakLp: 899, dayGain: DAILY_LP_CAP }), win(), T0)
    expect(r.promotedTo).toBe('gold')
    expect(r.capped).toBe(false)
  })
  it('three shielded fights after a promotion, then losses count again', () => {
    let s = applyBattle(st({ lp: 599, peakLp: 599 }), win(), T0).state // → silver 600, 3 shields
    const a = applyBattle(s, loss(1), T0)
    expect(a).toMatchObject({ shielded: true, delta: 0 })
    expect(a.state.shields).toBe(2)
    s = applyBattle(a.state, win(0.5), T0).state // a win spends a shield too
    expect(s.shields).toBe(1)
    const c = applyBattle(s, loss(0.5), T0)
    expect(c.shielded).toBe(true)
    expect(c.state.shields).toBe(0)
    const d = applyBattle({ ...c.state, lp: 700 }, loss(0.5), T0)
    expect(d).toMatchObject({ shielded: false, delta: -19 })
    // a shield also covers a gate loss (only reachable from a hand-made state)
    expect(applyBattle(st({ lp: 599, peakLp: 599, shields: 1 }), loss(), T0).shielded).toBe(true)
    // a Wood loss is 0 anyway — nothing for a shield to absorb
    expect(applyBattle(st({ lp: 50, peakLp: 50, shields: 2 }), loss(), T0)).toMatchObject({ shielded: false, delta: 0 })
  })
  it('Wood losses cost nothing', () => {
    const r = applyBattle(st({ lp: 150, peakLp: 150, streak: 2 }), loss(1), T0)
    expect(r.delta).toBe(0)
    expect(r.state.streak).toBe(0)
  })
  it('floors: a reached Bronze/Silver/Gold holds; Platinum+ drops at most one tier below the peak', () => {
    expect(applyBattle(st({ lp: 305, peakLp: 420 }), loss(1), T0).state.lp).toBe(300) // bronze floor
    expect(applyBattle(st({ lp: 610, peakLp: 700 }), loss(1), T0).state.lp).toBe(600) // silver floor
    expect(applyBattle(st({ lp: 905, peakLp: 950 }), loss(1), T0).state.lp).toBe(900) // gold floor
    // peak Platinum: may fall into Gold, never below Gold's floor
    expect(applyBattle(st({ lp: 1210, peakLp: 1250 }), loss(1), T0).state.lp).toBe(1170)
    expect(applyBattle(st({ lp: 910, peakLp: 1250 }), loss(1), T0).state.lp).toBe(900)
    // peak Diamond: Platinum floor; peak Champion: Diamond floor
    expect(applyBattle(st({ lp: 1220, peakLp: 1600 }), loss(1), T0).state.lp).toBe(1200)
    expect(applyBattle(st({ lp: 1510, peakLp: 2000 }), loss(1), T0).state.lp).toBe(1500)
  })
  it('a loss never raises LP, even from a state below its floor', () => {
    const r = applyBattle(st({ lp: 100, peakLp: 700 }), loss(1), T0)
    expect(r.state.lp).toBe(100)
    expect(r.delta).toBe(0)
  })
  it('daily gain cap: +400 per UTC day, reset on the next UTC day', () => {
    const a = applyBattle(st({ lp: 600, peakLp: 600, dayGain: 390 }), win(0.5), T0)
    expect(a).toMatchObject({ delta: 10, capped: true })
    expect(a.state.dayGain).toBe(DAILY_LP_CAP)
    const b = applyBattle(a.state, win(0.5), T0 + 1000)
    expect(b).toMatchObject({ delta: 0, capped: true })
    expect(b.state.streak).toBe(2) // the win still counts for the streak
    const nextDay = (utcDay(T0) + 1) * DAY_MS
    const c = applyBattle(b.state, win(0.5), nextDay)
    expect(c).toMatchObject({ capped: false })
    expect(c.delta).toBe(30) // 25 + streak 3rd win
    expect(c.state).toMatchObject({ dayGain: 30, day: utcDay(nextDay) })
    // one ms before midnight UTC is still the same day
    expect(applyBattle(b.state, win(), nextDay - 1).capped).toBe(true)
  })
  it('Champion: no divisions, no gate, no streak bonus', () => {
    const r = applyBattle(st({ lp: 2000, peakLp: 2000, streak: 6 }), win(0.5), T0)
    expect(r.delta).toBe(25)
    expect(r.isGate).toBe(false)
    expect(applyBattle(st({ lp: 1810, peakLp: 1900 }), loss(0.5), T0).state.lp).toBe(1785)
  })
  it('rolls the season over before the fight and reports the ended season', () => {
    const s = st({ lp: 1000, peakLp: 1300, battles: 12, dayGain: 200 })
    const r = applyBattle(s, win(0.5), seasonBounds(1).startMs + 10)
    expect(r.seasonEnded).toEqual({ season: 0, peakTier: 'platinum' })
    expect(r.state).toMatchObject({ season: 1, lp: 625, peakLp: 625, battles: 1, dayGain: 25, streak: 1 })
  })
})

describe('seasons (UTC only)', () => {
  it('index boundaries', () => {
    expect(seasonIndex(LEAGUE_EPOCH_MS)).toBe(0)
    expect(seasonIndex(LEAGUE_EPOCH_MS - 1)).toBe(0) // pre-launch = season 0
    expect(seasonIndex(0)).toBe(0)
    expect(seasonIndex(Number.NaN)).toBe(0)
    expect(seasonIndex(LEAGUE_EPOCH_MS + SEASON_MS - 1)).toBe(0)
    expect(seasonIndex(LEAGUE_EPOCH_MS + SEASON_MS)).toBe(1)
  })
  it('ignores DST: EU (2026-10-25) and US (2026-11-01) switches change nothing', () => {
    expect(seasonIndex(Date.UTC(2026, 9, 25, 1, 30))).toBe(0)
    expect(seasonIndex(Date.UTC(2026, 10, 1, 23, 59, 59, 999))).toBe(0)
    expect(seasonIndex(Date.UTC(2026, 10, 2))).toBe(1)
    expect(seasonBounds(1).startMs).toBe(Date.UTC(2026, 10, 2))
    expect(seasonBounds(7).startMs).toBe(Date.UTC(2027, 3, 19)) // after the March 2027 switches
  })
  it('crosses the year and a leap day on 28-day Monday boundaries', () => {
    expect(seasonBounds(3)).toEqual({ startMs: Date.UTC(2026, 11, 28), endMs: Date.UTC(2027, 0, 25) })
    expect(seasonIndex(Date.UTC(2027, 0, 1))).toBe(3)
    expect(seasonIndex(Date.UTC(2026, 11, 31, 23, 59))).toBe(3)
    for (let i = 0; i < 40; i++) {
      const b = seasonBounds(i)
      const d = new Date(b.startMs)
      expect(d.getUTCDay()).toBe(1)
      expect(d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds()).toBe(0)
      expect(b.endMs).toBe(seasonBounds(i + 1).startMs)
      expect(seasonIndex(b.startMs)).toBe(i)
      expect(seasonIndex(b.endMs - 1)).toBe(i)
    }
    // 2028-02-29 lies inside season 18 (2028-02-21 … 2028-03-20)
    expect(seasonBounds(18).startMs).toBe(Date.UTC(2028, 1, 21))
    expect(seasonIndex(Date.UTC(2028, 1, 29, 12))).toBe(18)
  })
  it('bad season numbers clamp to 0', () => {
    expect(seasonBounds(-2)).toEqual(seasonBounds(0))
    expect(seasonBounds(Number.NaN)).toEqual(seasonBounds(0))
    expect(seasonBounds(2.7)).toEqual(seasonBounds(2))
  })
  it('utcDay', () => {
    expect(utcDay(0)).toBe(0)
    expect(utcDay(DAY_MS - 1)).toBe(0)
    expect(utcDay(DAY_MS)).toBe(1)
    expect(utcDay(Number.NaN)).toBe(0)
  })
  it('seasonReset keeps 60 % floored to its division', () => {
    const r = (lp: number) => seasonReset(st({ lp, peakLp: lp, streak: 4, shields: 2, battles: 30 }), 5)
    expect([0, 150, 299, 500, 999, 1000, 1799, 2500, 3100].map(lp => r(lp).lp))
      .toEqual([0, 0, 100, 300, 500, 600, 1000, 1500, 1800])
    expect(r(1000)).toMatchObject({ season: 5, peakLp: 600, streak: 0, shields: 0, battles: 0 })
  })
  it('rollover: once per missed season, an idle season pays nothing, a future state is left alone', () => {
    const s = st({ lp: 1500, peakLp: 1500, battles: 3 })
    const two = rollover(s, seasonBounds(2).startMs)
    expect(two.state).toMatchObject({ season: 2, lp: 500, peakLp: 500 }) // 1500 → 900 → 500 (540 floored)
    expect(two.ended).toEqual({ season: 0, peakTier: 'diamond' })
    expect(rollover(st({ lp: 900, battles: 0 }), seasonBounds(1).startMs).ended).toBeNull()
    const far = rollover(s, seasonBounds(500).startMs)
    expect(far.state).toMatchObject({ season: 500, lp: 0 })
    const future = st({ season: 9, lp: 700, peakLp: 700 })
    expect(rollover(future, T0).state).toMatchObject({ season: 9, lp: 700 })
  })
})

describe('rewards and limits', () => {
  it('rewardCoins: win .4×, loss .1×, first reach 1× of rewardWin', () => {
    expect(rewardCoins('win', 1000)).toBe(400)
    expect(rewardCoins('loss', 1000)).toBe(100)
    expect(rewardCoins('firstReach', 1000)).toBe(1000)
    expect(rewardCoins('win', 333)).toBe(133)
    expect(rewardCoins('win', -5)).toBe(0)
    expect(rewardCoins('win', Number.NaN)).toBe(0)
  })
  it('seasonReward by peak tier', () => {
    expect(LEAGUE_TIERS.map(t => seasonReward(t, 100))).toEqual([
      { coins: 200, diamonds: 0, championFrame: false },
      { coins: 300, diamonds: 0, championFrame: false },
      { coins: 400, diamonds: 0, championFrame: false },
      { coins: 600, diamonds: 1, championFrame: false },
      { coins: 800, diamonds: 2, championFrame: false },
      { coins: 1000, diamonds: 3, championFrame: false },
      { coins: 1200, diamonds: 5, championFrame: true }
    ])
    expect(seasonReward('gold', Number.NaN)).toEqual({ coins: 0, diamonds: 1, championFrame: false })
  })
  it('dailyFightLimit: 10 + 3 per ad, at most 2 ads', () => {
    expect([0, 1, 2, 3, -1, Number.NaN].map(dailyFightLimit)).toEqual([10, 13, 16, 16, 10, 10])
  })
})

describe('opponents and Champion rank', () => {
  it('three ascending targets around max(own, tier floor power), at E ≈ .65 / .5 / .35', () => {
    const [e, m, h] = opponentTargets(90, 'gold')
    expect(m).toBe(90)
    expect(e).toBeLessThan(m)
    expect(h).toBeGreaterThan(m)
    expect(expectedScore(90, e)).toBeCloseTo(0.65, 1)
    expect(expectedScore(90, h)).toBeCloseTo(0.35, 1)
    // a weak team in a high tier is measured from the tier's floor power
    expect(opponentTargets(10, 'diamond')[1]).toBe(TIER_FLOOR_POWER.diamond)
    // a level-0 team in Wood still gets 3 distinct targets ≥ 1
    const w = opponentTargets(0, 'wood')
    expect(w[0]).toBeGreaterThanOrEqual(1)
    expect(w[0] < w[1] && w[1] < w[2]).toBe(true)
  })
  it('championRank = players with more LP + 1', () => {
    expect(championRank([], 1900)).toBe(1)
    expect(championRank([2000, 1900, 1900, 1850], 1900)).toBe(2)
    expect(championRank([2000, 2100, 1800], 1800)).toBe(3)
  })
})

describe('sanitizeState', () => {
  it('whole, non-negative, peak ≥ lp, shields ≤ 3, dayGain ≤ cap', () => {
    const s = sanitizeState({ season: -1, lp: 55.5, peakLp: 10, streak: Number.NaN, shields: 9, day: 3.2, dayGain: 999, battles: -4 })
    expect(s).toEqual({ season: 0, lp: 55, peakLp: 55, streak: 0, shields: 3, day: 3, dayGain: DAILY_LP_CAP, battles: 0 })
  })
})

describe('property: random seasons of fights', () => {
  // mulberry32 — deterministic
  const rng = (seed: number) => () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  it('LP ≥ 0, whole, never below the season floor; tiers only rise through a gate win; day gain ≤ cap', () => {
    for (let run = 0; run < 24; run++) {
      const r = rng(1000 + run)
      const winP = 0.35 + 0.4 * r()
      let now = LEAGUE_EPOCH_MS - DAY_MS + Math.floor(r() * DAY_MS)
      let s = initialLeagueState(now)
      for (let i = 0; i < 1200; i++) {
        now += Math.floor(r() * 4 * 3600_000) // 0–4 h between fights: crosses days and seasons
        const before = rollover(s, now).state
        const out = applyBattle(s, { result: r() < winP ? 'win' : 'loss', E: r() }, now)
        s = out.state
        expect(Number.isInteger(s.lp) && s.lp >= 0).toBe(true)
        expect(s.lp).toBeGreaterThanOrEqual(Math.min(before.lp, seasonFloorLp(s.peakLp)))
        expect(s.peakLp).toBeGreaterThanOrEqual(s.lp)
        const up = LEAGUE_TIERS.indexOf(tierOf(s.lp).tier) - LEAGUE_TIERS.indexOf(tierOf(before.lp).tier)
        if (up > 0) {
          expect(out.isGate && up === 1).toBe(true)
          expect(out.promotedTo).toBe(tierOf(s.lp).tier)
        }
        if (!out.isGate) expect(s.dayGain).toBeLessThanOrEqual(DAILY_LP_CAP)
        if (out.shielded) expect(out.delta).toBe(0)
        expect(out.delta).toBeGreaterThanOrEqual(-40)
        expect(out.delta).toBeLessThanOrEqual(55)
        expect(s.season).toBe(seasonIndex(now))
      }
    }
  })
})
