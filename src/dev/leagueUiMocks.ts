/**
 * DEV / TEST mocks for the league UI: a LeagueUiSource over plain refs, an
 * opponent deck from the real offline ladder (generated NPC teams), and a
 * season top list. Used by `dev/league.html` and tests/leagueUi.test.ts —
 * never by the game.
 */
import { computed, ref } from 'vue'
import { atPromotionGate, seasonBounds, seasonFloorLp, tierOf, seasonReward, utcDay } from '@/league/leagueMath'
import { getOpponentDeck, type OpponentDeck } from '@/league/leagueOpponents'
import type { LeagueStanding } from '@/league/useLeague'
import type { LeagueTier } from '@/use/leagueTiers'
import type { LeagueTopData, LeagueUiSource } from '@/league/ui/leagueUi'

export interface MockLeagueOptions {
  lp?: number
  fightsLeft?: number
  fightsLimit?: number
  canAdTopUp?: boolean
  offlineBlocked?: boolean
  shields?: number
  streak?: number
  unclaimed?: { season: number; peakTier: LeagueTier } | null
  /** ms until the season ends (default 12 d 5 h). */
  seasonLeftMs?: number
  resetLeftMs?: number
  rewardWin?: number
}

export type MockLeague = LeagueUiSource & {
  lp: ReturnType<typeof ref<number>>
  grants: number
  claims: number
}

export const mockLeague = (o: MockLeagueOptions = {}): MockLeague => {
  const lp = ref(o.lp ?? 457)
  const fightsLeft = ref(o.fightsLeft ?? 7)
  const fightsLimit = ref(o.fightsLimit ?? 10)
  const canAdTopUp = ref(o.canAdTopUp ?? true)
  const offlineBlocked = ref(o.offlineBlocked ?? false)
  const unclaimed = ref(o.unclaimed ?? null)
  const endsAt = Date.now() + (o.seasonLeftMs ?? (12 * 86_400_000 + 5 * 3_600_000))
  const standing = computed<LeagueStanding>(() => {
    const pos = tierOf(lp.value ?? 0)
    return {
      season: 0,
      seasonEndsMs: endsAt,
      lp: lp.value ?? 0,
      tier: pos.tier,
      division: pos.division,
      lpInDivision: pos.lpInDivision,
      atGate: atPromotionGate(lp.value ?? 0),
      floorLp: seasonFloorLp(lp.value ?? 0),
      shields: o.shields ?? 0,
      streak: o.streak ?? 0,
      peakLp: lp.value ?? 0,
      bestTierEver: pos.tier
    }
  })
  const m: MockLeague = {
    lp,
    grants: 0,
    claims: 0,
    standing,
    fightsLeft: computed(() => fightsLeft.value),
    fightsLimit: computed(() => fightsLimit.value),
    canFight: computed(() => fightsLeft.value > 0 && !offlineBlocked.value),
    canAdTopUp: computed(() => canAdTopUp.value),
    offlineBlocked: computed(() => offlineBlocked.value),
    unclaimedSeason: computed(() => unclaimed.value),
    grantAdFights: () => {
      if (!canAdTopUp.value) return false
      m.grants++
      fightsLeft.value += 3
      fightsLimit.value += 3
      if (m.grants >= 2) canAdTopUp.value = false
      return true
    },
    claimSeasonReward: () => {
      const u = unclaimed.value
      if (!u) return null
      m.claims++
      unclaimed.value = null
      return { ...seasonReward(u.peakTier, o.rewardWin ?? 120), ...u }
    },
    msUntilDailyReset: () => o.resetLeftMs ?? (5 * 3_600_000 + 12 * 60_000),
    refresh: () => undefined
  }
  return m
}

/** A real offline deck (generated NPC teams + names) at the given power. */
export const mockDeck = (tier: LeagueTier = 'silver', ownPower = 60, opts: { online?: boolean; kids?: boolean } = {}): Promise<OpponentDeck> =>
  getOpponentDeck({
    ownBuild: null,
    ownPower,
    tier,
    day: utcDay(seasonBounds(0).startMs),
    fightIndex: 0,
    online: false,
    kids: opts.kids ?? false,
    skillsOn: false,
    ownId: null
  }, { storage: null, baked: [] }).then(d => ({ ...d, liveOk: opts.online ? true : d.liveOk }))

/** A season top list with real-looking names (the Worker's shape). */
export const REAL_NAMES = ['ShadowSpin', 'Mira_K', 'TopBladeTom', 'Kx9', 'LunaVortex', 'Rico', 'Hanna B', 'Zed', 'Orbital88', 'NinjaNoodle']

export const mockTop = (count = 10): LeagueTopData => {
  const entries = Array.from({ length: count }, (_, i) => {
    const lp = 2240 - i * 37 - (i > 5 ? 180 : 0)
    const pos = tierOf(lp)
    return { rank: i + 1, name: REAL_NAMES[i % REAL_NAMES.length] as string, lp, tier: pos.tier, division: pos.division }
  })
  const counts = new Map<number, number>()
  for (const e of entries) {
    const b = e.lp >= 1800 ? e.lp : e.lp - (e.lp % 100)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  return { entries, dist: [...counts.entries()].sort((a, b) => b[0] - a[0]), total: 4120 }
}
