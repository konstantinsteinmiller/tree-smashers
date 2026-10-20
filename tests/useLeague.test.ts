// ─── useLeague (LG2): state, unlock, limits ─────────────────────────────────
//
// The league composable on a league build, per build flavour (env stubs +
// fresh module registry per case: the gate reads its literals once). Time is
// pinned with a Date-only fake clock so day / season boundaries are exact.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  DAILY_FIGHTS, TOKEN_TTL_MS, DAY_MS, LEAGUE_EPOCH_MS, SEASON_MS, expectedScore, utcDay
} from '@/league/leagueMath'

type Mod = typeof import('@/league/useLeague')
type Gate = typeof import('@/league/leagueGate')

/** Wednesday of season 0, 12:00 UTC. */
const T0 = LEAGUE_EPOCH_MS + 2 * DAY_MS + 12 * 3_600_000
const STAGE = 'smashers_campaign_stage'
const KEY = 'smashers_league'

const AD_BUILD_FLAGS = ['VITE_APP_CRAZY_WEB', 'VITE_APP_GAME_DISTRIBUTION', 'VITE_APP_PLAYGAMA', 'VITE_APP_POKI', 'VITE_APP_NATIVE']

interface Loaded {
  gate: Gate
  mod: Mod
  api: NonNullable<Awaited<ReturnType<Gate['loadLeague']>>>
  campaign: ReturnType<typeof import('@/use/useSpinnerCampaign').default>
}

const load = async (env: Record<string, string> = {}, stage?: number): Promise<Loaded> => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'true')
  vi.stubEnv('VITE_APP_LEAGUE_UNLOCK_STAGE', '13')
  vi.stubEnv('VITE_APP_KIDS', 'false')
  vi.stubEnv('VITE_LEADERBOARD_URL', '') // offline league unless a case sets one
  for (const f of AD_BUILD_FLAGS) vi.stubEnv(f, 'false')
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  if (stage !== undefined) localStorage.setItem(STAGE, String(stage))
  // useUser FIRST (useMatch ↔ useModels ↔ useUser import cycle).
  await import('@/use/useUser')
  const campaign = (await import('@/use/useSpinnerCampaign')).default()
  const gate = await import('@/league/leagueGate')
  const api = await gate.loadLeague()
  const mod = await import('@/league/useLeague')
  expect(api).not.toBeNull()
  return { gate, mod, api: api!, campaign }
}

const stored = () => {
  const raw = localStorage.getItem(KEY)
  return raw === null ? null : JSON.parse(raw)
}

const card = (power = 20) => ({ kind: 'card' as const, id: `c${power}`, power })

/** Start + finish one card fight. */
const fight = (api: Loaded['api'], result: 'win' | 'loss', power = 20) => {
  const s = api.beginLocalBattle(card(power), 20)
  expect(s).not.toBeNull()
  return api.applyLocalResult(s!, result, 30_000)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('unlock', () => {
  it('unlocks at stage 13 on a platform build — and writes nothing before', async () => {
    const { api, campaign } = await load({}, 12)
    expect(api.state.value.unlocked).toBe(false)
    expect(api.canFight.value).toBe(false)
    expect(localStorage.getItem(KEY)).toBeNull()
    campaign.currentStageId.value = 13
    await nextTick()
    expect(api.state.value.unlocked).toBe(true)
    expect(stored()).toMatchObject({ v: 1, unlocked: true, unlockSeen: false, lp: 0 })
    expect(api.canFight.value).toBe(true)
  })

  it('unlocks at stage 1 when the build says 1 (dev)', async () => {
    const { api } = await load({ VITE_APP_LEAGUE_UNLOCK_STAGE: '1' }, 1)
    expect(api.state.value.unlocked).toBe(true)
    expect(stored()?.unlocked).toBe(true)
  })

  it('markUnlockSeen persists once', async () => {
    const { api } = await load({}, 13)
    api.markUnlockSeen()
    expect(stored()?.unlockSeen).toBe(true)
  })
})

describe('progress reset (LD5 / F7)', () => {
  it('the league survives resetAllProgress: unlock, LP and today\'s counters stay', async () => {
    const { api, gate } = await load({}, 20)
    fight(api, 'win')
    const before = stored()
    expect(before.lp).toBeGreaterThan(0)
    const { resetAllProgress } = await import('@/use/useResetProgress')
    await resetAllProgress()
    expect(localStorage.getItem(STAGE)).toBeNull()
    expect(stored()).toEqual(before)
    expect(api.state.value.unlocked).toBe(true)
    expect(api.fightsLeft.value).toBe(DAILY_FIGHTS - 1)
    expect(gate.leagueMountAllowed(1)).toBe(true)
  })

  it('a player at the unlock stage who never opened the league keeps the unlock too', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'true')
    vi.stubEnv('VITE_APP_LEAGUE_UNLOCK_STAGE', '13')
    localStorage.setItem(STAGE, '15')
    await import('@/use/useUser')
    const { resetAllProgress } = await import('@/use/useResetProgress')
    expect(localStorage.getItem(KEY)).toBeNull()
    await resetAllProgress()
    expect(localStorage.getItem(STAGE)).toBeNull()
    expect(stored()?.unlocked).toBe(true)
  })
})

describe('account gate (LD4): a player not allowed into the league writes no league state', () => {
  /** Load a league build with a CrazyGames-style account gate installed
   *  BEFORE the league module runs (its immediate stage watch is the first
   *  write path). `signedIn` is a ref, so flipping it propagates. */
  const loadWithAccount = async (stage: number, signedIn: boolean) => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'true')
    vi.stubEnv('VITE_APP_LEAGUE_UNLOCK_STAGE', '13')
    vi.stubEnv('VITE_APP_KIDS', 'false')
    vi.stubEnv('VITE_LEADERBOARD_URL', '')
    for (const f of AD_BUILD_FLAGS) vi.stubEnv(f, 'false')
    localStorage.setItem(STAGE, String(stage))
    await import('@/use/useUser')
    const { ref } = await import('vue')
    const account = ref(signedIn)
    const board = await import('@/use/useLiveLeaderboard')
    board.setLeaderboardAuthGate(() => account.value)
    const campaign = (await import('@/use/useSpinnerCampaign')).default()
    const gate = await import('@/league/leagueGate')
    const api = (await gate.loadLeague())!
    const save = await import('@/use/useSaveStatus')
    return { account, campaign, gate, api, save }
  }

  it('guest at stage 20: no key after mount, refresh, stage change, re-hydrate or reset', async () => {
    const { api, campaign, gate, save } = await loadWithAccount(20, false)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(api.state.value.unlocked).toBe(false)
    expect(gate.leagueAccountAllowed()).toBe(false)
    expect(gate.leagueMountAllowed(20)).toBe(false)
    api.refresh()
    campaign.currentStageId.value = 21
    await nextTick()
    save.refreshSaveBackedState()
    await nextTick()
    // A day / season later: the rollover must not write either.
    vi.setSystemTime(T0 + SEASON_MS + DAY_MS)
    api.refresh()
    api.markUnlockSeen()
    expect(localStorage.getItem(KEY)).toBeNull()
    const { resetAllProgress } = await import('@/use/useResetProgress')
    await resetAllProgress()
    await nextTick()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('signed-in at stage 20: the unlock is written', async () => {
    const { api, gate } = await loadWithAccount(20, true)
    expect(gate.leagueAccountAllowed()).toBe(true)
    expect(api.state.value.unlocked).toBe(true)
    expect(stored()).toMatchObject({ v: 1, unlocked: true })
  })

  it('a guest who signs in later gets the unlock computed from the stage', async () => {
    const { account, api, gate } = await loadWithAccount(20, false)
    expect(localStorage.getItem(KEY)).toBeNull()
    account.value = true
    await nextTick()
    expect(gate.leagueMountAllowed(20)).toBe(true)
    expect(api.state.value.unlocked).toBe(true)
    expect(stored()).toMatchObject({ v: 1, unlocked: true, unlockSeen: false, lp: 0 })
  })

  it('a guest below the unlock stage who signs in stays locked (and unwritten)', async () => {
    const { account, api } = await loadWithAccount(5, false)
    account.value = true
    await nextTick()
    expect(api.state.value.unlocked).toBe(false)
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('daily fights and ad top-ups', () => {
  it('10 a day; +3 per rewarded ad, 2 ads max; a new UTC day resets both', async () => {
    const { api } = await load({ VITE_APP_POKI: 'true' }, 13)
    expect(api.fightsLeft.value).toBe(DAILY_FIGHTS)
    for (let i = 0; i < DAILY_FIGHTS; i++) fight(api, 'loss')
    expect(api.fightsLeft.value).toBe(0)
    expect(api.canFight.value).toBe(false)
    expect(api.beginLocalBattle(card(), 20)).toBeNull()
    expect(api.canAdTopUp.value).toBe(true)
    expect(api.grantAdFights()).toBe(true)
    expect(api.fightsLeft.value).toBe(3)
    expect(api.grantAdFights()).toBe(true)
    expect(api.fightsLeft.value).toBe(6)
    expect(api.canAdTopUp.value).toBe(false)
    expect(api.grantAdFights()).toBe(false)
    expect(api.fightsLeft.value).toBe(6)
    expect(stored()).toMatchObject({ fights: 10, adBonusUsed: 2 })
    // next 00:00 UTC
    vi.setSystemTime((utcDay(T0) + 1) * DAY_MS + 1)
    api.refresh()
    expect(api.fightsLeft.value).toBe(DAILY_FIGHTS)
    expect(stored()).toMatchObject({ fights: 0, adBonusUsed: 0, day: utcDay(T0) + 1 })
    expect(api.canAdTopUp.value).toBe(true)
    expect(api.msUntilDailyReset()).toBe(DAY_MS - 1)
  })

  it('no top-up at all on a build without rewarded ads', async () => {
    const { api } = await load({}, 13)
    for (let i = 0; i < DAILY_FIGHTS; i++) fight(api, 'loss')
    expect(api.canAdTopUp.value).toBe(false)
    expect(api.grantAdFights()).toBe(false)
    expect(api.fightsLeft.value).toBe(0)
  })
})

describe('seasons', () => {
  const seasonState = (over: Record<string, unknown> = {}) => JSON.stringify({
    v: 1, season: 0, lp: 700, peakLp: 720, bestTierEver: 'silver', streak: 2, shields: 0, floor: 600,
    day: utcDay(T0), fights: 4, adBonusUsed: 1, gained: 40, battles: 9,
    unlocked: true, unlockSeen: true, claimedSeason: -1, unclaimed: null, firstReachMask: 7, ...over
  })

  it('rolls the season over on READ (60 % floored) and pays the finished season once', async () => {
    localStorage.setItem(KEY, seasonState())
    vi.setSystemTime(LEAGUE_EPOCH_MS + SEASON_MS + 3_600_000) // season 1, first hour
    const { api } = await load({}, 30)
    expect(api.state.value).toMatchObject({ season: 1, lp: 400, peakLp: 400, streak: 0, fights: 0, adBonusUsed: 0 })
    expect(api.state.value.bestTierEver).toBe('silver')
    expect(api.unclaimedSeason.value).toEqual({ season: 0, peakTier: 'silver' })
    expect(stored()).toMatchObject({ season: 1, lp: 400 })
    const reward = api.claimSeasonReward()
    expect(reward).toMatchObject({ season: 0, peakTier: 'silver', diamonds: 0, championFrame: false })
    expect(reward!.coins).toBeGreaterThan(0)
    expect(api.claimSeasonReward()).toBeNull()
    expect(stored()).toMatchObject({ claimedSeason: 0, unclaimed: null })
  })

  it('a season without a fight pays nothing', async () => {
    localStorage.setItem(KEY, seasonState({ battles: 0 }))
    vi.setSystemTime(LEAGUE_EPOCH_MS + SEASON_MS + 1)
    const { api } = await load({}, 30)
    expect(api.claimSeasonReward()).toBeNull()
  })
})

describe('server reconcile (online build)', () => {
  const ONLINE = { VITE_LEADERBOARD_URL: 'https://leaderboard.example.test' }

  it('no ranked fight until the server answered; unreachable → blocked (O3)', async () => {
    const { api } = await load(ONLINE, 13)
    expect(api.serverStatus.value).toBe('unknown')
    expect(api.canFight.value).toBe(false)
    api.setServerReachable(false)
    expect(api.offlineBlocked.value).toBe(true)
    expect(api.beginLocalBattle(card(), 20)).toBeNull()
    api.setServerReachable(true)
    expect(api.offlineBlocked.value).toBe(false)
    expect(api.canFight.value).toBe(true)
  })

  it('the server wins every ranked field; device-only fields stay', async () => {
    const { api } = await load(ONLINE, 13)
    api.setServerReachable(true)
    fight(api, 'win')
    api.markUnlockSeen()
    expect(api.state.value.pending).toBeUndefined()
    const s = api.beginLocalBattle(card(), 20)!
    expect(api.state.value.pending?.id).toBe(s.id)
    api.reconcileServer({
      season: 0, lp: 450, peakLp: 480, streak: 0, shields: 1, day: utcDay(T0), dayGain: 30, battles: 12, fights: 7, pending: false
    })
    expect(api.state.value).toMatchObject({
      lp: 450, peakLp: 480, shields: 1, gained: 30, battles: 12, fights: 7,
      unlocked: true, unlockSeen: true, bestTierEver: 'bronze'
    })
    expect(api.state.value.pending).toBeUndefined()
    expect(api.standing.value).toMatchObject({ tier: 'bronze', division: 2, lpInDivision: 50, floorLp: 300 })
    expect(stored()?.lp).toBe(450)
    // the session the server dropped is stale now
    expect(api.applyLocalResult(s, 'win', 30_000)).toMatchObject({ stale: true, delta: 0 })
    expect(api.state.value.lp).toBe(450)
  })
})

describe('abandon = loss (O10)', () => {
  const bronze = JSON.stringify({
    v: 1, season: 0, lp: 350, peakLp: 350, bestTierEver: 'bronze', streak: 0, shields: 0, floor: 300,
    day: utcDay(T0), fights: 0, adBonusUsed: 0, gained: 0, battles: 3,
    unlocked: true, unlockSeen: true, claimedSeason: -1, unclaimed: null, firstReachMask: 3
  })
  const lossLp = (E: number) => Math.round((10 + 30 * E) * 0.5)

  it('a battle pending longer than the token TTL is settled as a loss', async () => {
    localStorage.setItem(KEY, bronze)
    const { api } = await load({}, 30)
    const s = api.beginLocalBattle(card(25), 20)!
    expect(s.E).toBeCloseTo(expectedScore(20, 25))
    vi.setSystemTime(T0 + TOKEN_TTL_MS + 1)
    api.refresh()
    expect(api.state.value.pending).toBeUndefined()
    expect(api.state.value.lp).toBe(350 - lossLp(s.E))
    expect(api.state.value.fights).toBe(1)
    // the late result cannot overwrite it
    expect(api.applyLocalResult(s, 'win', 30_000).stale).toBe(true)
    expect(api.state.value.lp).toBe(350 - lossLp(s.E))
  })

  it('starting the next battle settles a still-pending one as a loss', async () => {
    localStorage.setItem(KEY, bronze)
    const { api } = await load({}, 30)
    const a = api.beginLocalBattle(card(25), 20)!
    const b = api.beginLocalBattle(card(25), 20)!
    expect(b.id).not.toBe(a.id)
    expect(api.state.value.lp).toBe(350 - lossLp(a.E))
    expect(api.state.value.fights).toBe(2)
  })

  it('a reload keeps the pending battle (persisted), and it still counts as a loss', async () => {
    localStorage.setItem(KEY, bronze)
    const first = await load({}, 30)
    const s = first.api.beginLocalBattle(card(25), 20)!
    expect(JSON.parse(localStorage.getItem(KEY)!).pending.id).toBe(s.id)
    vi.setSystemTime(T0 + TOKEN_TTL_MS + 5)
    const { api } = await load({}, 30)
    expect(api.state.value.pending).toBeUndefined()
    expect(api.state.value.lp).toBe(350 - lossLp(s.E))
  })
})

describe('results', () => {
  it('coins for a win / loss come back to the caller; first reach pays once ever', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      v: 1, season: 0, lp: 299, peakLp: 299, bestTierEver: 'wood', streak: 0, shields: 0, floor: 0,
      day: utcDay(T0), fights: 0, adBonusUsed: 0, gained: 0, battles: 3,
      unlocked: true, unlockSeen: true, claimedSeason: -1, unclaimed: null, firstReachMask: 1
    }))
    const { api, campaign } = await load({}, 30)
    const rw = campaign.currentStage.value.rewardWin
    const g = api.beginLocalBattle({ kind: 'gate' }, 20)!
    const r = api.applyLocalResult(g, 'win', 30_000)
    expect(r).toMatchObject({ isGate: true, promotedTo: 'bronze', firstReach: 'bronze', lpAfter: 300 })
    expect(r.coins).toBe(Math.round(0.4 * rw) + rw)
    expect(api.state.value.firstReachMask & 2).toBe(2)
    expect(api.standing.value).toMatchObject({ tier: 'bronze', shields: 3 })
    const l = fight(api, 'loss')
    expect(l).toMatchObject({ shielded: true, delta: 0, coins: Math.round(0.1 * rw) })
  })
})

describe('LM3 — Wood gatekeeper loss costs nothing', () => {
  it('at 299 the next fight is the gate; losing it keeps 299', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, lp: 299, peakLp: 299, unlocked: true, season: 0, day: utcDay(T0) }))
    const { api } = await load({}, 30)
    expect(api.standing.value.atGate).toBe(true)
    // a card is not a legal target at the gate, the gatekeeper is
    expect(api.beginLocalBattle(card(), 20)).toBeNull()
    const g = api.beginLocalBattle({ kind: 'gate' }, 20)!
    expect(g.isGate).toBe(true)
    const r = api.applyLocalResult(g, 'loss', 30_000)
    expect(r).toMatchObject({ isGate: true, delta: 0, lpAfter: 299 })
    expect(api.standing.value.atGate).toBe(true)
  })

  it('away from the gate a gatekeeper target is refused', async () => {
    const { api } = await load({}, 30)
    expect(api.beginLocalBattle({ kind: 'gate' }, 20)).toBeNull()
  })
})

describe('DT1 — neutral, seed-derived first turn', () => {
  it('deterministic per seed and ~50/50 across seeds', async () => {
    const { mod } = await load({}, 13)
    for (const seed of [1, 2, 0xdeadbeef, 123456]) expect(mod.leagueFirstTurn(seed)).toBe(mod.leagueFirstTurn(seed))
    let player = 0
    const N = 20_000
    for (let i = 1; i <= N; i++) if (mod.leagueFirstTurn(Math.imul(i, 0x9e3779b1) >>> 0) === 'player') player++
    expect(player / N).toBeGreaterThan(0.48)
    expect(player / N).toBeLessThan(0.52)
  })

  it('the session carries it, from the server seed when there is one, whatever the last campaign result', async () => {
    localStorage.setItem('smashers_last_result', 'lose')
    const { api, mod } = await load({}, 13)
    const a = api.beginLocalBattle(card(), 20, { seed: 777, token: 't' })!
    expect(a).toMatchObject({ seed: 777, token: 't', firstTurn: mod.leagueFirstTurn(777) })
    api.applyLocalResult(a, 'win', 30_000)
    localStorage.setItem('smashers_last_result', 'win')
    const b = api.beginLocalBattle(card(), 20, { seed: 777 })!
    expect(b.firstTurn).toBe(a.firstTurn)
    const c = api.beginLocalBattle(card(), 20)!
    expect(c.firstTurn).toBe(mod.leagueFirstTurn(c.seed))
  })
})
