// ─── League gate: runtime answers per build flavour ─────────────────────────
//
// src/league/leagueGate.ts reads its env literals once, when it is evaluated,
// so every case stubs the env, resets the module registry and imports a fresh
// gate (plus the SAME fresh useLiveLeaderboard instance it reads the account
// gate from).

import { afterEach, describe, it, expect, vi } from 'vitest'

type Gate = typeof import('@/league/leagueGate')
type Board = typeof import('@/use/useLiveLeaderboard')

const load = async (env: Record<string, string>): Promise<{ gate: Gate; board: Board }> => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'false')
  vi.stubEnv('VITE_APP_LEAGUE_UNLOCK_STAGE', '13')
  vi.stubEnv('VITE_APP_KIDS', 'false')
  vi.stubEnv('VITE_LEADERBOARD_URL', 'https://leaderboard.example.test')
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const board = await import('@/use/useLiveLeaderboard')
  const gate = await import('@/league/leagueGate')
  return { gate, board }
}

const STORED_UNLOCKED = JSON.stringify({ v: 1, unlocked: true })

afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('league OFF', () => {
  it('every export is null / false, even at stage 999 with a stored unlock', async () => {
    localStorage.setItem('spinner_league', STORED_UNLOCKED)
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'false' })
    expect(gate.LEAGUE_BUILD).toBe(false)
    expect(gate.LEAGUE_ONLINE).toBe(false)
    expect(gate.LeagueHudButtonUi).toBeNull()
    expect(gate.LeagueHubUi).toBeNull()
    expect(gate.LeagueResultPanelUi).toBeNull()
    expect(gate.LeagueUnlockPopupUi).toBeNull()
    expect(gate.LeagueSeasonRewardModalUi).toBeNull()
    await expect(gate.loadLeague()).resolves.toBeNull()
    await expect(gate.loadLeagueBridge()).resolves.toBeNull()
    expect(gate.leagueMountAllowed(999)).toBe(false)
  })

  it('an UNSET flag is off (CI builds run without the .env files)', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_FEATURE_LEAGUE', undefined as unknown as string)
    const gate = await import('@/league/leagueGate')
    expect(gate.LEAGUE_BUILD).toBe(false)
    expect(gate.leagueMountAllowed(999)).toBe(false)
  })

  it('never touches storage', async () => {
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'false' })
    const get = vi.spyOn(Storage.prototype, 'getItem')
    const set = vi.spyOn(Storage.prototype, 'setItem')
    gate.leagueMountAllowed(999)
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    get.mockRestore()
    set.mockRestore()
  })
})

describe('league ON', () => {
  it('online when the build has a live endpoint and is not child-directed', async () => {
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'true' })
    expect(gate.LEAGUE_BUILD).toBe(true)
    expect(gate.LEAGUE_KIDS).toBe(false)
    expect(gate.LEAGUE_ONLINE).toBe(true)
  })

  it('fills every UI handle with a lazy component (LG5b)', async () => {
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'true' })
    for (const h of [gate.LeagueHudButtonUi, gate.LeagueHubUi, gate.LeagueResultPanelUi,
      gate.LeagueUnlockPopupUi, gate.LeagueSeasonRewardModalUi]) {
      expect(h).not.toBeNull()
      expect((h as { __asyncLoader?: unknown }).__asyncLoader).toBeTypeOf('function')
    }
  })

  it('kids build → offline', async () => {
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'true', VITE_APP_KIDS: 'true' })
    expect(gate.LEAGUE_KIDS).toBe(true)
    expect(gate.LEAGUE_ONLINE).toBe(false)
  })

  it('no leaderboard endpoint (Poki / YouTube) → offline', async () => {
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'true', VITE_LEADERBOARD_URL: '' })
    expect(gate.LEAGUE_ONLINE).toBe(false)
  })

  it('mounts from the unlock stage on, not before', async () => {
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'true' })
    expect(gate.LEAGUE_UNLOCK_STAGE).toBe(13)
    expect(gate.leagueMountAllowed(12)).toBe(false)
    expect(gate.leagueMountAllowed(13)).toBe(true)
    expect(gate.leagueMountAllowed(999)).toBe(true)
  })

  it('a stored unlock survives a stage below the unlock (progress reset, LD5) — read-only', async () => {
    localStorage.setItem('spinner_league', STORED_UNLOCKED)
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'true' })
    const set = vi.spyOn(Storage.prototype, 'setItem')
    expect(gate.leagueMountAllowed(1)).toBe(true)
    expect(set).not.toHaveBeenCalled()
    set.mockRestore()
  })

  it('a corrupt or locked stored state does not unlock', async () => {
    const { gate } = await load({ VITE_APP_FEATURE_LEAGUE: 'true' })
    for (const raw of ['{', 'null', '"x"', JSON.stringify({ unlocked: 'yes' }), JSON.stringify({ unlocked: false })]) {
      localStorage.setItem('spinner_league', raw)
      expect(gate.leagueMountAllowed(1), raw).toBe(false)
    }
  })

  it('dev unlock stage 1, and a bad value falls back to 13', async () => {
    expect((await load({ VITE_APP_FEATURE_LEAGUE: 'true', VITE_APP_LEAGUE_UNLOCK_STAGE: '1' })).gate.LEAGUE_UNLOCK_STAGE).toBe(1)
    expect((await load({ VITE_APP_FEATURE_LEAGUE: 'true', VITE_APP_LEAGUE_UNLOCK_STAGE: 'x' })).gate.LEAGUE_UNLOCK_STAGE).toBe(13)
    expect((await load({ VITE_APP_FEATURE_LEAGUE: 'true', VITE_APP_LEAGUE_UNLOCK_STAGE: '0' })).gate.LEAGUE_UNLOCK_STAGE).toBe(13)
  })

  it('CrazyGames guest (account gate false) → no league at all (LD4), sign-in brings it', async () => {
    localStorage.setItem('spinner_league', STORED_UNLOCKED)
    const { gate, board } = await load({ VITE_APP_FEATURE_LEAGUE: 'true' })
    let signedIn = false
    board.setLeaderboardAuthGate(() => signedIn)
    expect(gate.leagueMountAllowed(999)).toBe(false)
    signedIn = true
    board.setLeaderboardAuthGate(() => signedIn) // re-install → the computed re-evaluates
    expect(gate.leagueMountAllowed(999)).toBe(true)
    board.setLeaderboardAuthGate(() => { throw new Error('broken SDK') })
    expect(gate.leagueMountAllowed(999)).toBe(false)
    board.setLeaderboardAuthGate(null)
    expect(gate.leagueMountAllowed(999)).toBe(true)
  })
})
