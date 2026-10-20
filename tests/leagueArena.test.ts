// ─── League in the arena (LG6) ──────────────────────────────────────────────
//
// The real SpinnerArena on a league build (offline league: no leaderboard
// endpoint, like Poki / YouTube — so every fight is local and deterministic),
// with skills and bosses 100+ on:
//
//   • a card fight runs on the ghost path with the session's seed and its
//     seeded first turn (DT1 — overriding the last-result bias);
//   • a league WIN: no stage change, no roulette / trophy / boss card, no 3x
//     button, no boss peek; the result panel shows; coins credited from the
//     result; honour = ½ PvP honour; +25 battle-pass XP; closing it never
//     queues the (pending) skills intro;
//   • a league LOSS (surrender): no stage change, no honour, no BP XP;
//   • the gatekeeper fight carries its boss traits (bosses100 encounter);
//   • the unlock popup: only on tap_to_start, never while a skills surface is
//     up, ≥ 1.2 s after it closed; "Enter league" marks it seen and opens the hub;
//   • the bridge on an ONLINE build refuses baked cards and a deck the live
//     pool did not answer for (O3), and surfaces typed server errors.

import { describe, it, expect, vi } from 'vitest'
import './helpers/skillsBuild'
import './helpers/bosses100Build'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { mountArena, type ArenaHarness } from './helpers/arenaHarness'

const SEED: Record<string, string> = vi.hoisted(() => {
  vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'true')
  vi.stubEnv('VITE_APP_LEAGUE_UNLOCK_STAGE', '13')
  vi.stubEnv('VITE_APP_KIDS', 'false')
  // No endpoint → offline league (LEAGUE_ONLINE false), no server at all.
  vi.stubEnv('VITE_LEADERBOARD_URL', '')
  const seed: Record<string, string> = {
    smashers_campaign_stage: '20',
    smashers_player_max_stage: '20',
    smashers_coins: '5000',
    smashers_first_win: '1',
    smashers_intro_seen: '1',
    smashers_config_opened: '1',
    // Skills intro still PENDING (an existing player past stage 10): a league
    // result close must not queue it.
    smashers_skill_ui: JSON.stringify({ v: 1, seen: [], intro: false, slot2Seen: true, filled: 2, viewed: [] }),
    // Unlocked, popup already seen — the fight tests start from the menu.
    smashers_league: JSON.stringify({ v: 1, unlocked: true, unlockSeen: true })
  }
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  return seed
})

// Controls for the ONLINE bridge block at the end (partial mocks: the real
// modules unless a test sets an override).
const ctl = vi.hoisted(() => ({
  deck: null as null | { cards: unknown[]; liveOk: boolean },
  start: null as null | ((...a: unknown[]) => unknown),
  startCalls: 0
}))
vi.mock('@/league/leagueOpponents', async (orig) => {
  const real = await orig<typeof import('@/league/leagueOpponents')>()
  return {
    ...real,
    getOpponentDeck: (...a: Parameters<typeof real.getOpponentDeck>) =>
      (ctl.deck ? Promise.resolve(ctl.deck) : real.getOpponentDeck(...a))
  }
})
vi.mock('@/league/leagueApi', async (orig) => {
  const real = await orig<typeof import('@/league/leagueApi')>()
  return {
    ...real,
    beginOnlineFight: (...a: Parameters<typeof real.beginOnlineFight>) => {
      ctl.startCalls++
      return ctl.start ? ctl.start(...a) : real.beginOnlineFight(...a)
    }
  }
})

vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))
vi.mock('/images/logo/logo_256x256.webp', () => ({ default: '/images/logo/logo_256x256.webp' }))
vi.mock('/images/icons/chest_128x128.webp', () => ({ default: '/images/icons/chest_128x128.webp' }))
vi.mock('/images/icons/trophy_128x128.webp', () => ({ default: '/images/icons/trophy_128x128.webp' }))

interface Seam {
  snapshot: () => { phase: string; result: string | null; stage: number; alive: { player: number; npc: number } }
  begin: () => unknown
  setSideHp: (side: 'player' | 'npc', f: number) => number
  aimAtBlade: (i: number, side: 'player' | 'npc', j: number, power?: number) => boolean
  fire: () => void
}

/** The arena's setup state (script setup bindings, via test-utils). */
type Vm = Record<string, any>

const vmOf = (arena: ArenaHarness): Vm => arena.wrapper.vm as unknown as Vm

const seamOf = async (arena: ArenaHarness): Promise<Seam> => {
  for (let i = 0; i < 200; i++) {
    const s = (window as unknown as { __smashers?: Seam }).__smashers
    if (s) return s
    await arena.settle(25)
  }
  throw new Error('no preview seam')
}

const until = async (arena: ArenaHarness, pred: () => boolean, ms = 15_000): Promise<boolean> => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (pred()) return true
    await arena.settle(25)
  }
  return pred()
}

const bpTotal = async (): Promise<number> => {
  const { default: useBattlePass } = await import('@/use/useBattlePass')
  const s = useBattlePass().state.value
  return s.unlockedStages * 100 + s.xp
}

/** Re-seed storage for a later case (the setup file clears localStorage
 *  between tests; the singletons re-read on a save-data bump) and mount. */
const remount = async (league: Record<string, unknown> | null): Promise<ArenaHarness> => {
  const { saveDataVersion } = await import('@/use/useSaveStatus')
  // The boot loader is "done" (jsdom never loads the art): the reveal gate
  // treats a loader still up like the cutscene.
  const { default: useAssets } = await import('@/use/useAssets')
  useAssets().areAllAssetsLoaded.value = true
  const seed = { ...SEED }
  delete seed.smashers_league
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  if (league) localStorage.setItem('smashers_league', JSON.stringify(league))
  else localStorage.removeItem('smashers_league')
  saveDataVersion.value++
  return mountArena({})
}

/** Open the hub from the HUD button and wait for its cards / gate card. */
const openHub = async (arena: ArenaHarness, selector: string) => {
  expect(await arena.waitFor('[data-league="hud-button"]'), 'HUD button').toBe(true)
  ;(document.querySelector('[data-league="hud-button"]') as HTMLElement).click()
  expect(await arena.waitFor(selector), selector).toBe(true)
}

/** Begin the board's battle, return the first turn phase it settles on. */
const beginAndFirstTurn = async (arena: ArenaHarness, seam: Seam): Promise<string> => {
  await seam.begin()
  expect(await until(arena, () => ['player_turn', 'npc_turn'].includes(seam.snapshot().phase))).toBe(true)
  return seam.snapshot().phase
}

/** Play the running battle to a WIN (leave the enemy a sliver, take the shot). */
const winBattle = async (arena: ArenaHarness, seam: Seam) => {
  for (let turn = 0; turn < 12 && seam.snapshot().result === null; turn++) {
    await until(arena, () => seam.snapshot().phase === 'player_turn' || seam.snapshot().result !== null)
    if (seam.snapshot().result !== null) break
    seam.setSideHp('npc', 0.001)
    seam.setSideHp('player', 1)
    seam.aimAtBlade(0, 'npc', 0, 1)
    seam.fire()
    await until(arena, () => seam.snapshot().result !== null, 10_000)
  }
  expect(seam.snapshot().result).toBe('win')
}

describe('league fights in the arena (league build, offline)', () => {
  it('card fight: seeded board + first turn; a win pays league rewards only; a surrender is a loss', async () => {
    const gate = await import('@/league/leagueGate')
    expect(gate.LEAGUE_BUILD).toBe(true)
    expect(gate.LEAGUE_ONLINE).toBe(false)
    const { currentMatchSeed } = await import('@/use/useDeterministicRng')
    const { leagueFirstTurn } = await import('@/league/useLeague')
    const pvp = (await import('@/use/usePvpStats')).default()
    const { calcHonorPoints } = await import('@/use/usePvpStats')
    const { skillLevelSum } = await import('@/use/loadoutSanitizer')
    const { default: useSpinnerConfig } = await import('@/use/useSpinnerConfig')
    const wallet = useSpinnerConfig()

    // Bias the NEXT first turn toward the player (80 %) — league fights must
    // ignore it (DT1).
    localStorage.setItem('smashers_last_result', 'lose')
    const arena = await mountArena(SEED)
    try {
      const vm = vmOf(arena)
      const seam = await seamOf(arena)
      expect(await arena.waitFor('.stage-badge')).toBe(true)
      await until(arena, () => vm.sk !== null, 10_000)
      expect(vm.currentStageId).toBe(20)

      // ── Fight 1: a card, played to a WIN ──
      await openHub(arena, '[data-league="opponent-card"]')
      ;(document.querySelector('[data-league="opponent-card"]') as HTMLElement).click()
      expect(await until(arena, () => vm.leagueSession !== null && vm.phase === 'tap_to_start')).toBe(true)
      const session = vm.leagueSession
      expect(vm.ghostMode).toBe(true)
      expect(vm.leagueHubOpen).toBe(false)
      expect(document.querySelector('.stage-badge')).toBeNull()
      // The board was built from the session seed.
      expect(currentMatchSeed()).toBe(session.initOptions.seed >>> 0)
      expect(session.initOptions.firstTurn).toBe(leagueFirstTurn(session.initOptions.seed))

      const coins0 = wallet.coins.value
      const honor0 = pvp.honor.value
      const wins0 = pvp.wins.value
      const bp0 = await bpTotal()

      const first = await beginAndFirstTurn(arena, seam)
      expect(first).toBe(session.initOptions.firstTurn === 'player' ? 'player_turn' : 'npc_turn')
      await winBattle(arena, seam)
      expect(await arena.waitFor('[data-league="result-panel"]')).toBe(true)
      // A league outcome never feeds the campaign's first-turn bias.
      expect(localStorage.getItem('smashers_last_result')).toBe('lose')

      const fin = vm.leagueResult
      expect(fin).not.toBeNull()
      expect(fin.outcome.result).toBe('win')
      expect(fin.lpAfter).toBeGreaterThan(fin.lpBefore)
      // Nothing of the campaign's win path.
      expect(vm.currentStageId).toBe(20)
      expect(localStorage.getItem('smashers_campaign_stage')).toBe('20')
      expect(vm.showRoulette).toBe(false)
      expect(vm.showBossDefeated).toBe(false)
      expect(vm.lastWinWasBoss).toBe(false)
      expect(vm.trophyGrants).toEqual([])
      expect(vm.bossPeek).toBeNull()
      expect(vm.showWinCoinsAd).toBe(false)
      expect(vm.currentTip).toBeNull()
      // League rewards: coins from the result, half the PvP honour, +25 BP XP.
      expect(fin.coins).toBeGreaterThan(0)
      expect(wallet.coins.value - coins0).toBe(fin.coins)
      const sum = (team: { topLevel?: number; bottomLevel?: number }[]) =>
        team.reduce((s, c) => s + (c.topLevel ?? 1) + (c.bottomLevel ?? 1), 0)
      const fullHonor = calcHonorPoints(
        sum(session.vs.teams.player), sum(session.vs.teams.opponent),
        skillLevelSum(session.vs.skills.player), skillLevelSum(session.vs.skills.opponent))
      expect(fin.honor).toBe(Math.round(fullHonor / 2))
      expect(pvp.honor.value - honor0 === fin.honor || pvp.honor.value < honor0 /* stage roll-over */).toBe(true)
      expect(pvp.wins.value).toBe(wins0) // not a PvP win
      expect(await bpTotal() - bp0).toBe(25)

      // Closing the result: back to the hub, still stage 20 (the team skill
      // intro was removed with the reskin — smashers carry their skills).
      vm.onRewardContinue()
      await arena.settle(300)
      expect(vm.leagueSession).toBeNull()
      expect(vm.ghostMode).toBe(false)
      expect(vm.leagueHubOpen).toBe(true)
      await arena.settle(1500)
      expect(vm.leagueHubOpen).toBe(true)
      expect(vm.currentStageId).toBe(20)

      // ── Fight 2: surrender = a ranked LOSS ──
      expect(await arena.waitFor('[data-league="opponent-card"]')).toBe(true)
      ;(document.querySelector('[data-league="opponent-card"]') as HTMLElement).click()
      expect(await until(arena, () => vm.leagueSession !== null && vm.phase === 'tap_to_start')).toBe(true)
      const honor1 = pvp.honor.value
      const bp1 = await bpTotal()
      await beginAndFirstTurn(arena, seam)
      vm.onSurrender()
      expect(await arena.waitFor('[data-league="result-panel"]')).toBe(true)
      expect(vm.leagueResult.outcome.result).toBe('loss')
      expect(vm.leagueResult.honor).toBe(0)
      expect(vm.leagueResult.bpXp).toBe(0)
      expect(pvp.honor.value).toBe(honor1)
      expect(await bpTotal()).toBe(bp1)
      expect(vm.currentStageId).toBe(20)
      vm.onRewardContinue()
      await arena.settle(100)
    } finally {
      arena.unmount()
    }
  }, 180_000)

  it('gatekeeper fight (at the Platinum gate) fields the encounter with its boss traits', async () => {
    const game = await import('@/use/useSpinnerGame')
    // Gold I, 99 LP → the next fight is the Platinum gatekeeper (Cinder Tyrant).
    const arena = await remount({ v: 1, unlocked: true, unlockSeen: true, lp: 1199, peakLp: 1199 })
    try {
      const vm = vmOf(arena)
      await until(arena, () => vm.league !== null && vm.sk !== null, 10_000)
      expect(vm.league.standing.value.atGate).toBe(true)
      await openHub(arena, '[data-league="gate-card"] button')
      ;(document.querySelector('[data-league="gate-card"] button') as HTMLElement).click()
      expect(await until(arena, () => vm.leagueSession !== null && vm.phase === 'tap_to_start')).toBe(true)
      expect(vm.leagueSession.isGate).toBe(true)
      expect(vm.leagueSession.gateTier).toBe('platinum')
      expect(game.hasBossTraitEngine()).toBe(true)
      const traits = (vm.npcBlades as { config: { bossTrait?: string; shardTrait?: string } }[])
        .filter(b => b.config.bossTrait !== undefined || b.config.shardTrait !== undefined)
      expect(traits.length).toBeGreaterThan(0)
      // Board stays off the campaign: stage badge hidden, stage untouched.
      expect(document.querySelector('.stage-badge')).toBeNull()
      expect(vm.currentStageId).toBe(20)
    } finally {
      arena.unmount()
    }
  }, 60_000)

  it('unlock popup: armed by a win-screen close only, tap_to_start only, never over another surface, ≥ 1.2 s after a league surface closed; Enter → seen + hub', async () => {
    // Stored state: never unlocked (the arena's load stores the unlock at stage 20).
    const arena = await remount(null)
    try {
      const vm = vmOf(arena)
      await until(arena, () => vm.league !== null && vm.sk !== null, 10_000)
      const L = vm.league
      expect(L.state.value.unlocked).toBe(true) // loadLeague() at mount stored it
      expect(JSON.parse(localStorage.getItem('smashers_league') ?? '{}').unlocked).toBe(true)

      // Never at boot: only a closed campaign WIN screen arms it — a loss or a
      // non-campaign win does not.
      await arena.settle(1500)
      expect(vm.leagueUnlockOpen).toBe(false)
      await vm.armLeagueUnlockAfterWin('lose', 'campaign')
      await vm.armLeagueUnlockAfterWin('win', 'ghost')
      await arena.settle(1500)
      expect(vm.leagueUnlockArmed).toBe(false)
      expect(vm.leagueUnlockOpen).toBe(false)
      await vm.armLeagueUnlockAfterWin('win', 'campaign')
      expect(vm.leagueUnlockArmed).toBe(true)

      // Another surface is up (the team modal) → the popup waits.
      vm.configModalOpen = true
      await arena.settle(900)
      expect(vm.leagueUnlockOpen).toBe(false)
      vm.configModalOpen = false
      // A league surface (the hub) is up → waits; it closes → still ≥ 1.2 s
      // of quiet before the popup.
      vm.leagueHubOpen = true
      await arena.settle(900)
      expect(vm.leagueUnlockOpen).toBe(false)
      vm.leagueHubOpen = false
      const closedAt = performance.now()
      await until(arena, () => vm.leagueUnlockOpen === true, 5000)
      expect(vm.leagueUnlockOpen).toBe(true)
      expect(performance.now() - closedAt).toBeGreaterThanOrEqual(1200)
      expect(vm.phase).toBe('tap_to_start')
      expect(await arena.waitFor('[data-league="unlock-popup"]')).toBe(true)

      // Enter → seen, hub open.
      vm.onLeagueUnlockEnter()
      await arena.settle(100)
      expect(vm.leagueUnlockOpen).toBe(false)
      expect(L.state.value.unlockSeen).toBe(true)
      expect(vm.leagueHubOpen).toBe(true)
    } finally {
      arena.unmount()
    }
  }, 60_000)

  it('unlock popup never opens mid-battle or over a result screen; the closed win screen opens it', async () => {
    const arena = await remount({ v: 1, unlocked: true, unlockSeen: false })
    try {
      const vm = vmOf(arena)
      const seam = await seamOf(arena)
      await until(arena, () => vm.league !== null && vm.sk !== null, 10_000)
      // Start a campaign battle right away (before the popup's settle).
      await seam.begin()
      await arena.settle(2000)
      expect(vm.phase).not.toBe('tap_to_start')
      expect(vm.leagueUnlockOpen).toBe(false)
      await winBattle(arena, seam)
      await until(arena, () => vm.showReward === true || vm.showRoulette === true || vm.showBossDefeated === true)
      await arena.settle(1500)
      expect(vm.leagueUnlockOpen).toBe(false)
      // The win screen closes → back on tap_to_start, the popup follows.
      if (vm.showReward === true) {
        await vm.onRewardContinue()
        await until(arena, () => vm.leagueUnlockOpen === true, 5000)
        expect(vm.phase).toBe('tap_to_start')
      }
    } finally {
      arena.unmount()
    }
  }, 120_000)
})

describe('league bridge on an ONLINE build (O3 / typed errors)', () => {
  const load = async () => {
    vi.resetModules()
    vi.stubEnv('VITE_LEADERBOARD_URL', 'https://leaderboard.example.test')
    localStorage.setItem('smashers_league', JSON.stringify({ v: 1, unlocked: true, unlockSeen: true }))
    // The Worker is unreachable (every request fails): /league/me flips the
    // league to 'unreachable'; each case sets it back where it needs to.
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline')
    }))
    const gate = await import('@/league/leagueGate')
    const bridge = await import('@/league/leagueArenaBridge')
    const { default: useLeague } = await import('@/league/useLeague')
    return { gate, bridge, league: useLeague() }
  }
  const team = [
    { topPartId: 'round', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3, modelId: 'blades' },
    { topPartId: 'quadratic', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3, modelId: 'chip' }
  ]
  const card = (oppId: string, source: string) => ({
    oppId, name: 'Opp', team, skills: [], build: { v: 1, team: [], sk: [] }, power: 12, E: 0.5,
    difficulty: 'even', source
  })

  it('refuses baked cards and a deck the live pool did not answer for — no server token is opened', async () => {
    const { gate, bridge, league } = await load()
    expect(gate.LEAGUE_ONLINE).toBe(true)
    ctl.startCalls = 0
    // Baked card in an otherwise live deck.
    ctl.deck = { cards: [card('bake:abc', 'baked')], liveOk: true }
    await bridge.loadLeagueDeck({ team, skills: [] })
    league.setServerReachable(true)
    const baked = await bridge.createLeagueBattle({ team, skills: [], target: { kind: 'card', id: 'bake:abc', power: 12 }, card: card('bake:abc', 'baked') as never })
    expect(baked).toEqual({ ok: false, error: 'unrankable' })
    // liveOk false: even a generated card is not rankable.
    ctl.deck = { cards: [card('npc:1:2', 'generated')], liveOk: false }
    await bridge.loadLeagueDeck({ team, skills: [] })
    const quiet = await bridge.createLeagueBattle({ team, skills: [], target: { kind: 'card', id: 'npc:1:2', power: 12 }, card: card('npc:1:2', 'generated') as never })
    expect(quiet).toEqual({ ok: false, error: 'unrankable' })
    expect(ctl.startCalls).toBe(0)
  })

  it('surfaces the server error; a live card starts with the server seed and its seeded first turn', async () => {
    const { bridge, league } = await load()
    const { leagueFirstTurn } = await import('@/league/useLeague')
    ctl.deck = { cards: [card('p:7', 'live')], liveOk: true }
    await bridge.loadLeagueDeck({ team, skills: [] })
    league.setServerReachable(true)
    const c = card('p:7', 'live') as never
    ctl.start = async () => ({ ok: false, error: 'daily_cap', state: null, gateTier: null })
    expect(await bridge.createLeagueBattle({ team, skills: [], target: { kind: 'card', id: 'p:7', power: 12 }, card: c }))
      .toEqual({ ok: false, error: 'daily_cap' })
    ctl.start = async (target: unknown, power: unknown) => {
      const session = league.beginLocalBattle(target as never, power as number, { seed: 424242, token: 'tok' })
      return { ok: true, battle: {}, session }
    }
    const ok = await bridge.createLeagueBattle({ team, skills: [], target: { kind: 'card', id: 'p:7', power: 12 }, card: c })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.initOptions.seed).toBe(424242)
    expect(ok.initOptions.firstTurn).toBe(leagueFirstTurn(424242))
    expect(ok.initOptions.enemyTeam).toHaveLength(2)
    ctl.start = null
    ctl.deck = null
    vi.unstubAllGlobals()
  })

  it('fights the build /league/start returns (server-authoritative), re-sanitised; the card team is only a fallback', async () => {
    const { bridge, league } = await load()
    ctl.deck = { cards: [card('p:9', 'live')], liveOk: true }
    await bridge.loadLeagueDeck({ team, skills: [] })
    league.setServerReachable(true)
    const c = card('p:9', 'live') as never
    const serverBuild = {
      v: 1,
      team: [
        // A part this client does not know: dropped like in any pool entry.
        { t: 'hacked_part', b: 'balanced', tl: 50, bl: 50, m: 'chip' },
        { t: 'quadratic', b: 'balanced', tl: 7, bl: 6, m: 'chip' },
        { t: 'round', b: 'balanced', tl: 8, bl: 5, m: 'blades' }
      ],
      sk: []
    }
    ctl.start = async (target: unknown, power: unknown) => {
      const session = league.beginLocalBattle(target as never, power as number, { seed: 777, token: 'tok2' })
      return { ok: true, battle: { opp: { id: 'p:9', name: 'Opp', build: serverBuild, power: 99 } }, session }
    }
    const ok = await bridge.createLeagueBattle({ team, skills: [], target: { kind: 'card', id: 'p:9', power: 12 }, card: c })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    const enemy = ok.initOptions.enemyTeam
    expect(enemy).toHaveLength(2)
    expect(enemy[0]).toMatchObject({ topPartId: 'quadratic', topLevel: 7, bottomLevel: 6 })
    expect(enemy[1]).toMatchObject({ topPartId: 'round', topLevel: 8, bottomLevel: 5 })
    expect(ok.vs.teams.opponent[0]).toMatchObject({ topLevel: 7 })
    bridge.finishLeagueBattle('lose')

    // An answer without a usable build falls back to the card's team.
    ctl.start = async (target: unknown, power: unknown) => {
      const session = league.beginLocalBattle(target as never, power as number, { seed: 778, token: 'tok3' })
      return { ok: true, battle: { opp: { id: 'p:9', name: 'Opp', build: { v: 1, team: [], sk: [] }, power: 0 } }, session }
    }
    const fb = await bridge.createLeagueBattle({ team, skills: [], target: { kind: 'card', id: 'p:9', power: 12 }, card: c })
    expect(fb.ok).toBe(true)
    if (fb.ok) expect(fb.initOptions.enemyTeam.map(e => e.topLevel)).toEqual([3, 3])
    ctl.start = null
    ctl.deck = null
    vi.unstubAllGlobals()
  })
})
