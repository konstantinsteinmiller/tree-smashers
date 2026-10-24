// ─── Boss-trait VFX: engine wiring (BW4, bosses-100-feature.md §7.3) ───────
//
// Drives the REAL `useSpinnerGame` loop (fake RAF + a controlled wall clock):
//
//   · gate clock: Frostbite's 250 ms `lastChillAt` gate and Frost Lock's
//     shared `lastShockMs` gate run on the SIMULATION clock — a 5 s platform
//     pause (wall time passes, no physics ticks) must not open them; the next
//     stack still needs 250 ms of simulated time after the resume;
//   · chill popup: a new stack puts a snowflake glyph popup into the
//     damage-number pool (drawn through drawBossTraitGlyph);
//   · the trait layer renders through the engine's render() without errors,
//     and a trait-free match never touches it.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { installBossPort } from './helpers/bosses100Build'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
// import and pulling useSpinnerGame in cold resolves the cycle wrong.
import '@/use/useUser'
import { useSpinnerGame } from '@/use/useSpinnerGame'
import { setGamePaused } from '@/use/useGamePause'
import { BOSS_TRAIT_TUNING } from '@/use/bosses/bossTraits'
import { __snowflakePath, __resetBossTraitSprites } from '@/use/bosses/bossTraitVfx'
import { __setBossSfxLoader, __setBossSfxPlayer, __resetBossSfx } from '@/use/bosses/bossTraitSfx'
import type { SpinnerConfig, SpinnerState } from '@/types/spinner'

type Engine = ReturnType<typeof useSpinnerGame>

beforeAll(installBossPort)

const cfg = (extra: Partial<SpinnerConfig> = {}): SpinnerConfig =>
  ({ topPartId: 'round', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3, ...extra })
const boss = (trait: SpinnerConfig['bossTrait'], extra: Partial<SpinnerConfig> = {}): SpinnerConfig =>
  cfg({ isBoss: true, bossTrait: trait, topLevel: 5, bottomLevel: 5, ...extra })

const WALL0 = 100_000
let clock = 0
const rafQueue = new Map<number, FrameRequestCallback>()
const STEP = 1000 / 60

beforeEach(() => {
  clock = WALL0
  rafQueue.clear()
  let nextId = 1
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id)
  })
  // jsdom's play() returns undefined; the sound helper chains .catch() on it.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  __resetBossSfx()
  __setBossSfxLoader(() => {
  })
  __setBossSfxPlayer(() => null)
})

afterEach(() => {
  setGamePaused(false)
  __setBossSfxLoader(null)
  __setBossSfxPlayer(null)
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const frame = (wallMs = STEP) => {
  clock += wallMs + 1e-6
  vi.advanceTimersByTime(wallMs)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(clock)
}
const until = (cond: () => boolean, max = 60 * 30) => {
  for (let i = 0; i < max; i++) {
    if (cond()) return
    frame()
  }
  throw new Error('condition never met')
}

const sandbox = (p: SpinnerConfig[], n: SpinnerConfig[]): Engine => {
  const e = useSpinnerGame()
  e.initGame(p, n, false, 'boss', false, undefined, null, 'circle', { seed: 99 })
  e.startPhysics()
  return e
}

const place = (b: SpinnerState, x: number, y: number) => {
  b.x = x
  b.y = y
  b.vx = 0
  b.vy = 0
  b.ax = 0
  b.ay = 0
  b.accelFramesLeft = 0
}

/** `a` runs into `boss` from just below it (sandbox phase: contacts resolve). */
const ram = (a: SpinnerState, bossBlade: SpinnerState) => {
  place(bossBlade, 0, -60)
  place(a, 0, -60 + bossBlade.radius + a.radius + 1)
  a.vy = -6
}

/** A 2D context that accepts every call; records `stroke(path)` arguments. */
const permissiveCtx = () => {
  const stroked: unknown[] = []
  const store: Record<string | symbol, unknown> = {}
  const gradient = {
    addColorStop() {
    }
  }
  const ctx = new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop]
      if (prop === 'stroke') return (p?: unknown) => {
        if (p !== undefined) stroked.push(p)
      }
      if (prop === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient' || prop === 'createPattern') return () => gradient
      if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
      if (prop === 'getLineDash') return () => []
      if (prop === 'canvas') return { width: 800, height: 600 }
      return () => undefined
    },
    set(t, prop, v) {
      t[prop] = v
      return true
    }
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, stroked }
}

describe('boss-trait gates run on the simulation clock (platform pause)', () => {
  it('Frostbite: a 5 s pause does not open the 250 ms chill gate', () => {
    const e = sandbox([cfg(), cfg()], [boss('chill')])
    const a = e.playerBlades.value[0]!
    const y = e.npcBlades.value[0]!
    ram(a, y)
    until(() => (a.chillN ?? 0) > 0, 30)
    const first = a.lastChillAt!
    // Sim clock, not the wall clock (which started at 100 s and only grows; a seeded battle's sim clock starts at 60 s).
    expect(first).toBeLessThan(WALL0)
    expect(Math.abs(first / STEP - Math.round(first / STEP))).toBeLessThan(1e-6)

    // Platform pause: 5 s of wall time, RAF keeps firing, physics must not tick.
    setGamePaused(true)
    for (let i = 0; i < 50; i++) frame(100)
    setGamePaused(false)

    // Hammer the Yeti from the first resumed tick on.
    let ticks = 0
    while ((a.chillN ?? 0) < 2 && ticks < 120) {
      // Every 4th tick: 3 ticks is exactly the 50 ms contact re-arm on the
      // (tick-exact) sim clock a seeded battle runs its contact gates on.
      if (ticks % 4 === 0) ram(a, y)
      frame()
      ticks++
    }
    expect(a.chillN).toBe(2)
    expect(a.lastChillAt! - first).toBeGreaterThanOrEqual(BOSS_TRAIT_TUNING.CHILL_GATE_MS)
    // On the wall clock the gate would have been open on the first contact
    // after the resume; on the sim clock it takes ≥ 250 ms of ticks.
    expect(ticks * STEP).toBeGreaterThanOrEqual(BOSS_TRAIT_TUNING.CHILL_GATE_MS - 2 * STEP)
    e.disposePhysics()
  })

  it('Frost Lock: the cold touch stamps the shared lastShockMs gate on the sim clock', () => {
    const e = sandbox([cfg(), cfg()], [boss('frost')])
    const a = e.playerBlades.value[0]!
    const w = e.npcBlades.value[0]!
    let touches = 0
    const count = () => {
      touches = 0
      e.forEachBossTraitEvent(0, ev => {
        if (ev.kind === 'frost_touch') touches++
      })
      return touches
    }
    ram(a, w)
    until(() => count() > 0, 30)
    const first = a.lastShockMs!
    expect(first).toBeLessThan(WALL0)
    setGamePaused(true)
    for (let i = 0; i < 50; i++) frame(100)
    setGamePaused(false)
    let ticks = 0
    while (count() < 2 && ticks < 120) {
      if (ticks % 4 === 0) ram(a, w)
      frame()
      ticks++
    }
    expect(count()).toBe(2)
    expect(a.lastShockMs! - first).toBeGreaterThanOrEqual(250)
    expect(ticks * STEP).toBeGreaterThanOrEqual(250 - 2 * STEP)
    e.disposePhysics()
  })
})

describe('chill popup + render wiring', () => {
  it('a new chill stack spawns a snowflake glyph popup, drawn via drawBossTraitGlyph', () => {
    __resetBossTraitSprites()

    class FakePath2D {
      moveTo() {
      }

      lineTo() {
      }
    }

    vi.stubGlobal('Path2D', FakePath2D)
    const e = sandbox([cfg(), cfg()], [boss('chill')])
    const a = e.playerBlades.value[0]!
    const y = e.npcBlades.value[0]!
    const { ctx, stroked } = permissiveCtx()
    e.render(ctx, 800, 600)
    const snow = __snowflakePath()
    expect(stroked.filter(p => p === snow).length).toBe(0)
    ram(a, y)
    until(() => (a.chillN ?? 0) > 0, 30)
    e.render(ctx, 800, 600)
    // ink + colour stroke of the same cached path
    expect(stroked.filter(p => p === snow).length).toBe(2)
    e.disposePhysics()
  })

  it('an Elemental Court roster renders every trait call site without throwing', () => {
    const e = sandbox([cfg(), cfg()], [
      boss('ember', { bossAbility: 'partners' }), boss('frost', { bossAbility: 'partners' }),
      boss('chill', { bossAbility: 'partners' })
    ])
    expect(e.traitsActive()).toBe(true)
    const { ctx } = permissiveCtx()
    for (let i = 0; i < 30; i++) {
      frame()
      expect(() => e.render(ctx, 800, 600)).not.toThrow()
    }
    e.disposePhysics()
  })
})
