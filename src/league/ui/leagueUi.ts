// ─── League UI helpers (LG5a / LG5b) ────────────────────────────────────────
//
// Pure helpers and the prop contracts shared by the league screens in this
// folder. Everything here is reached only through the league chunk (the gate
// handles in leagueGate.ts), so none of it exists on a league-off build.
//
// No copy lives here: the functions return i18n KEYS + params, the
// components translate them.

import type { Ref } from 'vue'
import { LEAGUE_TIERS, LEAGUE_TIER_META, type LeagueDivision, type LeagueTier } from '@/use/leagueTiers'
import { CHAMPION_LP, LP_PER_DIVISION, tierOf } from '@/league/leagueMath'
import type { LeagueStanding } from '@/league/useLeague'
import type { SeasonReward } from '@/league/leagueMath'
import type { OpponentDifficulty } from '@/league/leagueOpponents'

// ─── Contracts ──────────────────────────────────────────────────────────────

type R<T> = Readonly<Ref<T>>

/**
 * What the HUD button / hub read from the league. `loadLeague()`'s object
 * (LeagueApi, LG2) satisfies it as-is; tests and the dev preview pass a mock.
 */
export interface LeagueUiSource {
  standing: R<LeagueStanding>
  fightsLeft: R<number>
  fightsLimit: R<number>
  canFight: R<boolean>
  canAdTopUp: R<boolean>
  offlineBlocked: R<boolean>
  unclaimedSeason: R<{ season: number; peakTier: LeagueTier } | null>
  grantAdFights(): boolean
  claimSeasonReward(): (SeasonReward & { season: number; peakTier: LeagueTier }) | null
  msUntilDailyReset(): number
  refresh?(): unknown
}

/** One row of GET /league/top (LG4 `buildTop`, via LG3 `fetchTop`). */
export interface LeagueTopEntry {
  rank: number
  name: string
  lp: number
  tier: LeagueTier
  division: LeagueDivision | null
}

export interface LeagueTopData {
  entries: LeagueTopEntry[]
  /** LP histogram `[bucket, count]` (Champion buckets are exact LP). */
  dist: [number, number][]
  total: number
}

/** Season reward as the modal shows it (useLeague.claimSeasonReward's shape). */
export interface LeagueSeasonRewardView extends SeasonReward {
  season: number
  peakTier: LeagueTier
}

// ─── Parsing (the server's answer is data, never trusted) ───────────────────

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null)

/** Validate a /league/top body; null when it is not one. Rows that do not
 *  parse are dropped, names are clipped (the Worker already sanitised them). */
export const parseLeagueTop = (raw: unknown): LeagueTopData | null => {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as { entries?: unknown; dist?: unknown; total?: unknown }
  if (!Array.isArray(body.entries)) return null
  const entries: LeagueTopEntry[] = []
  for (const e of body.entries.slice(0, 100)) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const rank = int(r.rank)
    const lp = int(r.lp)
    if (rank === null || rank < 1 || lp === null || lp < 0 || typeof r.name !== 'string') continue
    const pos = tierOf(lp)
    entries.push({ rank, name: r.name.slice(0, 24), lp, tier: pos.tier, division: pos.division })
  }
  const dist: [number, number][] = Array.isArray(body.dist)
    ? body.dist.flatMap((d): [number, number][] => {
      if (!Array.isArray(d)) return []
      const b = int(d[0])
      const n = int(d[1])
      return b !== null && n !== null && n > 0 ? [[b, n]] : []
    })
    : []
  const total = Math.max(int(body.total) ?? 0, entries.length)
  return { entries, dist, total }
}

/**
 * Champion position (#N) for `lp` from the season histogram: players with
 * MORE LP, plus one (ties share — leagueMath.championRank's rule on buckets).
 * Null below Champion or without data.
 */
export const championPositionFromTop = (top: LeagueTopData | null, lp: number): number | null => {
  if (!top || lp < CHAMPION_LP) return null
  if (top.dist.length > 0) {
    let higher = 0
    for (const [bucket, n] of top.dist) if (bucket > lp) higher += n
    return higher + 1
  }
  const higher = top.entries.filter(e => e.lp > lp).length
  return top.entries.length > 0 ? higher + 1 : null
}

// ─── Standing helpers ───────────────────────────────────────────────────────

/** The tier a promotion gate leads to, or null at Champion. */
export const nextTier = (tier: LeagueTier): LeagueTier | null => {
  const i = LEAGUE_TIERS.indexOf(tier)
  return i >= 0 && i < LEAGUE_TIERS.length - 1 ? (LEAGUE_TIERS[i + 1] as LeagueTier) : null
}

/** Fill of the division bar, 0…1. Champion is always full. */
export const lpBarFill = (lp: number): number => {
  const pos = tierOf(lp)
  if (pos.tier === 'champion') return 1
  return Math.max(0, Math.min(1, pos.lpInDivision / LP_PER_DIVISION))
}

/** Ordinal of a (tier, division) step — bigger is better. Champion is one step. */
export const rankStep = (lp: number): number => {
  const pos = tierOf(lp)
  return LEAGUE_TIER_META[pos.tier].rank * 3 + (pos.division ? 3 - pos.division : 0)
}

export type RankMove = 'promoted' | 'up' | 'down' | 'none'

/** How a result moved the player: a new tier, a division up, a drop, or none. */
export const rankMove = (lpBefore: number, lpAfter: number): RankMove => {
  const a = rankStep(lpBefore)
  const b = rankStep(lpAfter)
  if (b > a) return tierOf(lpAfter).tier !== tierOf(lpBefore).tier ? 'promoted' : 'up'
  if (b < a) return 'down'
  return 'none'
}

// ─── Time (keys + params; the component translates) ─────────────────────────

export interface DurationCopy {
  key: 'league.time.dh' | 'league.time.hm' | 'league.time.m'
  params: Record<string, number>
}

/** A countdown in its two most significant units (12d 4h / 5h 12m / 9m). */
export const durationCopy = (ms: number): DurationCopy => {
  const totalMin = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 60_000))
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return { key: 'league.time.dh', params: { d, h } }
  if (h > 0) return { key: 'league.time.hm', params: { h, m } }
  return { key: 'league.time.m', params: { m: Math.max(1, m) } }
}

// ─── Opponent difficulty (LM2: a LABEL, never a percentage) ─────────────────

export const DIFFICULTY_STYLE: Readonly<Record<OpponentDifficulty, { from: string; to: string; ink: string }>> = Object.freeze({
  easier: { from: '#5fe08a', to: '#1f9c55', ink: '#08361c' },
  even: { from: '#ffd84d', to: '#f0a400', ink: '#3d2600' },
  harder: { from: '#ff7a6b', to: '#d9303c', ink: '#3d0710' }
})
