// ─── League flag OFF: nothing at runtime ────────────────────────────────────
//
// VITE_APP_FEATURE_LEAGUE=false removes the league, it does not hide it. A
// returning player far past the unlock stage (51 ≥ 13) boots the real arena,
// plays one real battle, closes the win screen (no unlock popup ever comes),
// plays a leaderboard ghost fight exactly as before the league (ghost path,
// leaderboard-win BP XP, no honour) and resets their progress — and the
// league never shows up: no league storage key is written, no /league/
// request is made, no [data-league] node is rendered, no league honour or BP
// XP is paid and no league module (state or arena bridge) is even loaded.
// (The shipped-bytes twin is tests/platforms/leagueFlagPurity.test.ts.)

import { describe, it, expect, vi } from 'vitest'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { mountArena } from './helpers/arenaHarness'

const SEED: Record<string, string> = vi.hoisted(() => {
  vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'false')
  vi.stubEnv('VITE_APP_LEAGUE_UNLOCK_STAGE', '13')
  vi.stubEnv('VITE_LEADERBOARD_URL', 'https://leaderboard.example.test')
  const seed: Record<string, string> = {
    // 51, not 50: a boss stage's win detours through the roulette.
    smashers_campaign_stage: '51',
    smashers_player_max_stage: '51',
    smashers_coins: '5000',
    smashers_first_win: '1',
    smashers_intro_seen: '1',
    smashers_config_opened: '1',
    smashers_skills_intro_seen: '1'
  }
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  return seed
})

// Every lazy league module records its own load.
const loaded = vi.hoisted(() => [] as string[])
vi.mock('@/league/useLeague', () => {
  loaded.push('useLeague')
  return {}
})
vi.mock('@/league/leagueArenaBridge', () => {
  loaded.push('leagueArenaBridge')
  return {}
})

vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))
vi.mock('/images/logo/logo_256x256.webp', () => ({ default: '/images/logo/logo_256x256.webp' }))
vi.mock('/images/icons/chest_128x128.webp', () => ({ default: '/images/icons/chest_128x128.webp' }))
vi.mock('/images/icons/trophy_128x128.webp', () => ({ default: '/images/icons/trophy_128x128.webp' }))

const LEAGUE_KEY = /league/i

interface Seam {
  snapshot: () => { phase: string; result: string | null; stage: number; alive: { player: number; npc: number } }
  begin: () => unknown
  setSideHp: (side: 'player' | 'npc', f: number) => number
  aimAtBlade: (i: number, side: 'player' | 'npc', j: number, power?: number) => boolean
  fire: () => void
}

describe('league OFF at runtime', () => {
  it('stage 51 + a battle + win-close + a ghost fight + a progress reset: no league key, request, DOM, reward or module', async () => {
    const gate = await import('@/league/leagueGate')
    expect(gate.LEAGUE_BUILD).toBe(false)
    expect(await gate.loadLeague()).toBeNull()
    expect(await gate.loadLeagueBridge()).toBeNull()
    expect(gate.leagueMountAllowed(51)).toBe(false)
    const pvp = (await import('@/use/usePvpStats')).default()
    const { default: useBattlePass } = await import('@/use/useBattlePass')
    const bpTotal = () => {
      const st = useBattlePass().state.value
      return st.unlockedStages * 100 + st.xp
    }
    const honor0 = pvp.honor.value
    const bp0 = bpTotal()
    // The reveal gate treats a boot loader still up like the cutscene; jsdom
    // never loads the art — mark it done so a popup COULD open if one existed.
    const { default: useAssets } = await import('@/use/useAssets')
    useAssets().areAllAssetsLoaded.value = true

    const arena = await mountArena(SEED)
    try {
      expect(await arena.waitFor('.stage-badge', 15_000)).toBe(true)
      expect(document.querySelector('.stage-badge')?.textContent).toContain('51')
      expect(document.querySelector('[data-league]')).toBeNull()

      // One real battle through the dev scripting seam: begin, wait for the
      // player's turn, leave the enemy a sliver of HP and take the shot.
      const seam = await (async () => {
        for (let i = 0; i < 200; i++) {
          const s = (window as unknown as { __smashers?: Seam }).__smashers
          if (s) return s
          await arena.settle(25)
        }
        throw new Error('no preview seam')
      })()
      await seam.begin()
      const until = async (pred: () => boolean, ms: number) => {
        const t0 = Date.now()
        while (Date.now() - t0 < ms) {
          if (pred()) return true
          await arena.settle(25)
        }
        return false
      }
      let finished = false
      for (let turn = 0; turn < 12 && !finished; turn++) {
        await until(() => ['player_turn', 'game_over'].includes(seam.snapshot().phase) || seam.snapshot().result !== null, 15_000)
        if (seam.snapshot().result !== null) break
        seam.setSideHp('npc', 0.001)
        seam.aimAtBlade(0, 'npc', 0, 1)
        seam.fire()
        finished = await until(() => seam.snapshot().result !== null, 10_000)
      }
      expect(seam.snapshot().result, JSON.stringify(seam.snapshot())).not.toBeNull()
      await arena.settle(500)
      expect(document.querySelector('[data-league]')).toBeNull()

      // Close the result screen: back on tap_to_start, well past the league
      // popup's gate timing — nothing league-shaped appears.
      const vm = arena.wrapper.vm as unknown as Record<string, any>
      const won = seam.snapshot().result === 'win'
      vm.onRewardContinue()
      await arena.settle(2500)
      expect(seam.snapshot().phase).toBe('tap_to_start')
      expect(document.querySelector('[data-league]')).toBeNull()
      expect(vm.leagueUnlockOpen).toBe(false)
      expect(vm.leagueHubOpen).toBe(false)
      expect(vm.league).toBeNull()
      expect(vm.leagueBridge).toBeNull()
      // Campaign pays campaign BP XP only (50 on a win, 12.5 on a loss), no honour.
      expect(bpTotal() - bp0).toBe(won ? 50 : 12.5)
      expect(pvp.honor.value).toBe(honor0)

      // A leaderboard ghost fight, unchanged: ghost path, +25 BP XP on a win,
      // no honour, no league session, no stage advance.
      const stageBefore = seam.snapshot().stage
      const bp1 = bpTotal()
      vm.onGhostFight({
        id: 'ghost-1', name: 'Ghost', maxStage: 40,
        blade: { topPartId: 'round', bottomPartId: 'balanced', topLevel: 2, bottomLevel: 2, modelId: 'blades' },
        blade2: { topPartId: 'quadratic', bottomPartId: 'balanced', topLevel: 2, bottomLevel: 2, modelId: 'chip' }
      })
      await arena.settle(100)
      expect(vm.ghostMode).toBe(true)
      expect(vm.leagueSession).toBeNull()
      await seam.begin()
      let ghostDone = false
      for (let turn = 0; turn < 12 && !ghostDone; turn++) {
        await until(() => ['player_turn', 'game_over'].includes(seam.snapshot().phase) || seam.snapshot().result !== null, 15_000)
        if (seam.snapshot().result !== null) break
        seam.setSideHp('npc', 0.001)
        seam.aimAtBlade(0, 'npc', 0, 1)
        seam.fire()
        ghostDone = await until(() => seam.snapshot().result !== null, 10_000)
      }
      expect(seam.snapshot().result).toBe('win')
      expect(await until(() => vm.showReward === true, 30_000), JSON.stringify({ snap: seam.snapshot(), coinsAwarded: vm.coinsAwarded, ghost: vm.ghostMode, phase: vm.phase })).toBe(true)
      expect(seam.snapshot().stage).toBe(stageBefore)
      expect(bpTotal() - bp1).toBe(25)
      expect(pvp.honor.value).toBe(honor0)
      vm.onRewardContinue()
      await arena.settle(300)
      expect(vm.ghostMode).toBe(false)
      expect(document.querySelector('[data-league]')).toBeNull()

      // A progress reset on a league-off build: no league write either.
      const { resetAllProgress } = await import('@/use/useResetProgress')
      await resetAllProgress()
      await arena.settle(200)
      expect(document.querySelector('[data-league]')).toBeNull()
    } finally {
      arena.unmount()
    }
    expect(arena.written.filter(k => LEAGUE_KEY.test(k))).toEqual([])
    expect(Object.keys(localStorage).filter(k => LEAGUE_KEY.test(k))).toEqual([])
    expect(arena.requested.filter(u => /\/league\//.test(u))).toEqual([])
    expect(loaded).toEqual([])
  }, 120_000)
})
