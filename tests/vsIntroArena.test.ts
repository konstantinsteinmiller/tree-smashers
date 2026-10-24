// ─── VS intro in the real arena: VS → meteor shower → 3-2-1 ──────────────────
//
// Mounts SpinnerArena (jsdom, skills + bosses builds) and starts a battle the
// way a tap does (`beginBattle` through the dev seam), then watches the phase
// machine: the VS screen parks the board at 'vs_intro' for ~4.8 s, THEN the
// meteor intro starts (and the every-3rd-game 3-2-1 inside it). A tap skips
// from 0.8 s; an earlier tap does nothing; campaign stage 1 (the tutorial) has
// no VS; a retry of the same stage and a replay of a won stage go straight to
// the meteors (once per matchup, `smashers_vs_seen`). Pure rules / layout /
// mapping: tests/vsIntro.test.ts.

import { describe, it, expect, vi } from 'vitest'
import './helpers/skillsBuild'
import './helpers/bosses100Build'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { mountArena, type ArenaHarness } from './helpers/arenaHarness'

vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))
vi.mock('/images/logo/logo_256x256.webp', () => ({ default: '/images/logo/logo_256x256.webp' }))
vi.mock('/images/icons/chest_128x128.webp', () => ({ default: '/images/icons/chest_128x128.webp' }))
vi.mock('/images/icons/trophy_128x128.webp', () => ({ default: '/images/icons/trophy_128x128.webp' }))

const seedFor = (stage: number): Record<string, string> => ({
  smashers_campaign_stage: String(stage),
  smashers_player_max_stage: String(stage),
  smashers_coins: '5000',
  smashers_first_win: '1',
  smashers_intro_seen: '1',
  smashers_config_opened: '1'
})

vi.hoisted(() => {
  // Returning player on stage 12 (two smashers, skills open).
  for (const [k, v] of Object.entries({
    smashers_campaign_stage: '12', smashers_player_max_stage: '12', smashers_coins: '5000',
    smashers_first_win: '1', smashers_intro_seen: '1', smashers_config_opened: '1'
  })) localStorage.setItem(k, v)
})

type Vm = Record<string, any>
interface Seam { begin: () => unknown; snapshot: () => { phase: string } }

const seamOf = async (arena: ArenaHarness): Promise<Seam> => {
  for (let i = 0; i < 400; i++) {
    const s = (window as unknown as { __smashers?: Seam }).__smashers
    if (s) return s
    await arena.settle(25)
  }
  throw new Error('no preview seam')
}

/** Poll in small steps and record every phase change with its time. */
const watchPhases = async (arena: ArenaHarness, until: (p: string) => boolean, ms = 12_000) => {
  const vm = arena.wrapper.vm as unknown as Vm
  const t0 = performance.now()
  const seen: { phase: string; t: number; vs: boolean; countdown: string | null }[] = []
  const countdown = (await import('@/use/useSpinnerGame')).countdownText
  let last = ''
  while (performance.now() - t0 < ms) {
    const p = String(vm.phase)
    const vs = document.querySelector('[data-testid="vs-intro"]') !== null
    if (p !== last || (seen.length && seen.at(-1)!.vs !== vs) || (countdown.value && seen.at(-1)?.countdown !== countdown.value)) {
      seen.push({ phase: p, t: performance.now() - t0, vs, countdown: countdown.value })
      last = p
    }
    if (until(p) && (countdown.value || p !== 'meteor_intro')) break
    await new Promise(r => setTimeout(r, 10))
  }
  return seen
}

const ready = async (arena: ArenaHarness) => {
  const vm = arena.wrapper.vm as unknown as Vm
  for (let i = 0; i < 600 && vm.phase !== 'tap_to_start'; i++) await arena.settle(25)
  expect(vm.phase).toBe('tap_to_start')
  // Let the skill / boss glue land (beginBattle waits for it anyway).
  await arena.settle(200)
}

describe('SpinnerArena — VS intro before the meteor shower and the 3-2-1', () => {
  it('plays ~4.8 s of VS (vs_intro), then the meteor intro with the 3-2-1; a retry skips it', async () => {
    const arena = await mountArena(seedFor(12))
    try {
      await ready(arena)
      // Arm the every-Nth-game countdown for this start.
      const game = await import('@/use/useSpinnerGame')
      game.resetGameStartCount()
      const seam = await seamOf(arena)
      void seam.begin()
      const seen = await watchPhases(arena, p => p === 'meteor_intro')
      const vsAt = seen.find(s => s.phase === 'vs_intro')
      const meteorAt = seen.find(s => s.phase === 'meteor_intro')
      expect(vsAt, JSON.stringify(seen)).toBeTruthy()
      expect(meteorAt, JSON.stringify(seen)).toBeTruthy()
      // Order: VS first, then the meteors, then the "3".
      expect(vsAt!.t).toBeLessThan(meteorAt!.t)
      const dt = meteorAt!.t - vsAt!.t
      expect(dt, JSON.stringify(seen)).toBeGreaterThan(4500)
      expect(dt, JSON.stringify(seen)).toBeLessThan(6500)
      // The screen was really up during vs_intro.
      expect(seen.some(s => s.phase === 'vs_intro' && s.vs), JSON.stringify(seen)).toBe(true)
      const three = seen.find(s => s.countdown === '3')
      expect(three, JSON.stringify(seen)).toBeTruthy()
      expect(three!.t).toBeGreaterThanOrEqual(meteorAt!.t)
      // The VS card went away by itself.
      for (let i = 0; i < 40 && document.querySelector('[data-testid="vs-intro"]'); i++) await arena.settle(25)
      expect(document.querySelector('[data-testid="vs-intro"]')).toBeNull()
      // The save remembers stage 12's VS ...
      expect(JSON.parse(localStorage.getItem('smashers_vs_seen') ?? '{}').stage).toBe(12)
      // ... so a restart of the same stage goes straight to the meteor shower.
      const vm = arena.wrapper.vm as unknown as Vm
      ;(window as unknown as { __smashers: { reinit: () => void } }).__smashers.reinit()
      for (let i = 0; i < 200 && vm.phase !== 'tap_to_start'; i++) await arena.settle(25)
      void seam.begin()
      const again = await watchPhases(arena, p => p === 'meteor_intro', 4000)
      expect(again.some(s => s.phase === 'vs_intro'), JSON.stringify(again)).toBe(false)
      expect(again.some(s => s.phase === 'meteor_intro'), JSON.stringify(again)).toBe(true)
    } finally {
      arena.unmount()
    }
  }, 60_000)

  it('ignores a tap before 0.8 s, skips on a tap after it (the wipe still plays)', async () => {
    const arena = await mountArena(seedFor(12))
    try {
      await ready(arena)
      const vm = arena.wrapper.vm as unknown as Vm
      const seam = await seamOf(arena)
      void seam.begin()
      for (let i = 0; i < 200 && !document.querySelector('[data-testid="vs-intro"]'); i++) await new Promise(r => setTimeout(r, 10))
      const t0 = performance.now()
      const screen = document.querySelector('[data-testid="vs-intro"]') as HTMLElement
      expect(screen).toBeTruthy()
      screen.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await new Promise(r => setTimeout(r, 200))
      expect(vm.phase).toBe('vs_intro')
      // Past 0.8 s on the screen's clock: skip.
      while (performance.now() - t0 < 1000) await new Promise(r => setTimeout(r, 20))
      screen.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      const tSkip = performance.now()
      while (vm.phase === 'vs_intro' && performance.now() - tSkip < 3000) await new Promise(r => setTimeout(r, 10))
      expect(vm.phase).toBe('meteor_intro')
      // Skip → exit wipe (0.25 s) → hand-off: far sooner than the full 2.8 s.
      expect(performance.now() - t0).toBeLessThan(2200)
    } finally {
      arena.unmount()
    }
  }, 60_000)

  it('replaying an already-won stage (below the VS mark) has no VS', async () => {
    const arena = await mountArena({ ...seedFor(12), smashers_player_max_stage: '20', smashers_vs_seen: JSON.stringify({ stage: 20, opp: [] }) })
    try {
      await ready(arena)
      const seam = await seamOf(arena)
      void seam.begin()
      const seen = await watchPhases(arena, p => p === 'meteor_intro', 4000)
      expect(seen.some(s => s.phase === 'vs_intro'), JSON.stringify(seen)).toBe(false)
      expect(seen.some(s => s.phase === 'meteor_intro'), JSON.stringify(seen)).toBe(true)
    } finally {
      arena.unmount()
    }
  }, 60_000)

  it('campaign stage 1 (the tutorial) starts straight into the meteor intro', async () => {
    const arena = await mountArena({ ...seedFor(1), smashers_first_win: '0' })
    try {
      const { default: useSpinnerCampaign } = await import('@/use/useSpinnerCampaign')
      const vm = arena.wrapper.vm as unknown as Vm
      await ready(arena)
      expect(useSpinnerCampaign().currentStageId.value).toBe(1)
      const seam = await seamOf(arena)
      void seam.begin()
      const seen = await watchPhases(arena, p => p === 'meteor_intro', 4000)
      expect(seen.some(s => s.phase === 'vs_intro'), JSON.stringify(seen)).toBe(false)
      expect(vm.phase === 'meteor_intro' || seen.some(s => s.phase === 'meteor_intro')).toBe(true)
    } finally {
      arena.unmount()
    }
  }, 60_000)
})

describe('SpinnerArena — the PvP VS keeps the match start identical on both peers', () => {
  it('builds the PvP board only at the VS hand-off, on a fixed wall-clock timeout (source contract)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, '..', 'src', 'views', 'SpinnerArena.vue'), 'utf8')
    // The human match: the board (initGame with pvp enabled) is built inside
    // the VS promise, nowhere else.
    const cb = src.slice(src.indexOf('pvpRegisterCallbacks('), src.indexOf('(bladeIndex, ax, ay)'))
    // initGame lives only in buildBoard, which runs on the VS hand-off (or at
    // once on a rematch in the same pairing, where BOTH peers skip the VS).
    const build = cb.slice(cb.indexOf('const buildBoard = () => {'), cb.indexOf("const matchup = vsMatchupFor('pvp')"))
    expect(build).toContain('initGame(mine, theirs')
    expect(cb.split('initGame(').length - 1).toBe(1)
    expect(cb).toMatch(/playVsIntro\(pvpVsData\(mine, theirs\)\)\.then\(\(ok\) => \{[^}]*buildBoard\(\)/)
    expect(cb).toMatch(/if \(!shouldShowVsIntro\(matchup, readVsSeen\(\), vsBotSeen\)\) \{\s*buildBoard\(\)/)
    // The PvP timer is the constant hand-off, never the (pausable) screen clock.
    const run = src.slice(src.indexOf('const playVsIntro ='), src.indexOf('const onVsStart'))
    expect(run).toMatch(/vsUsesWallClock\(data\.mode\)[\s\S]*setTimeout\(\(\) => vsResolve\?\.\(true\), VS_HANDOFF_MS\)/)
    const handoff = src.slice(src.indexOf('const onVsHandoff'), src.indexOf('const onVsDone'))
    expect(handoff).toContain('!vsUsesWallClock(vsIntro.value.mode)')
    // The single-player start: the VS is awaited BEFORE startMatch (meteors + 3-2-1).
    const begin = src.slice(src.indexOf('const beginBattle = async'), src.indexOf('const { setSettingValue }'))
    expect(begin.indexOf('await playVsIntro(')).toBeGreaterThan(0)
    expect(begin.lastIndexOf('startMatch()')).toBeGreaterThan(begin.indexOf('await playVsIntro('))
  })
})
