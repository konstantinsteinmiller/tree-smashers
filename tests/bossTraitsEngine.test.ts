// ─── Boss traits: engine integration (bosses-100-feature.md §4, §12.2, BW3) ──
//
// Drives the REAL `useSpinnerGame` loop (fake RAF + a controlled clock) and
// checks that the pure trait runtime (`bosses/bossTraits.ts`, unit-tested on
// its own) is wired at the right hook points:
//
//   · Ember Nova: the combat clock runs only on launched-phase substeps; a
//     nova lands on exactly the 120th substep (2,000 ms); burn goes through
//     applyHpLoss 'burn' (Hazard Ward cuts it, Guard Shell absorbs it); one
//     hit per victim however many carriers; allies immune; a lethal burn
//     ends the match;
//   · Frost Lock: the Warden's ram freezes the victim for its next turn, the
//     other blade is auto-selected and a tap on the frozen one is refused;
//     never two turns in a row; never the last launchable blade; an
//     all-frozen team thaws at its turn start; Static Charge stuns the
//     ramming Warden (lockKind 'stun') and the Warden's turn is skipped;
//   · Frostbite: a stack slows statsFor and the HUD, lasts through the
//     victim team's next 2 turns; Shattering Glacier shards chill;
//   · trait rosters replay identically from a seed (1× and 2×), and a match
//     without traits stays on the fast path.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
// Skills build + the engine's skill port (skill-vs-trait interplay below).
import { installSkillPort } from './helpers/skillsBuild'
import { installBossPort } from './helpers/bosses100Build'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
// import and pulling useSpinnerGame in cold resolves the cycle wrong.
import '@/use/useUser'
import { useSpinnerGame, simSpeed } from '@/use/useSpinnerGame'
import { BOSS_TRAIT_TUNING } from '@/use/bosses/bossTraits'
import { skillParams } from '@/data/skillCatalog'
import type { SpinnerConfig, SpinnerState } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'
import type { ArenaType } from '@/use/useSpinnerCampaign'

type Engine = ReturnType<typeof useSpinnerGame>

const cfg = (extra: Partial<SpinnerConfig> = {}): SpinnerConfig =>
  ({ topPartId: 'round', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3, ...extra })
const boss = (trait: SpinnerConfig['bossTrait'], extra: Partial<SpinnerConfig> = {}): SpinnerConfig =>
  cfg({ isBoss: true, bossTrait: trait, topLevel: 5, bottomLevel: 5, ...extra })

let clock = 0
const rafQueue = new Map<number, FrameRequestCallback>()
const STEP = 1000 / 60

beforeAll(installSkillPort)
beforeAll(installBossPort)

beforeEach(() => {
  clock = 10_000
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
})

afterEach(() => {
  simSpeed.value = 1
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** One 60 Hz frame = exactly one physics tick. */
const frame = () => {
  clock += STEP + 1e-6
  vi.advanceTimersByTime(STEP)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(clock)
}
const frames = (n: number) => {
  for (let i = 0; i < n; i++) frame()
}
/** Frames until `cond` (or fail after `max`). */
const until = (cond: () => boolean, max = 60 * 30) => {
  for (let i = 0; i < max; i++) {
    if (cond()) return
    frame()
  }
  throw new Error('condition never met')
}

/** Physics running, phase 'tap_to_start' (no turn logic). */
const sandbox = (
  p: SpinnerConfig[], n: SpinnerConfig[], arena: ArenaType = 'boss', mine?: SkillLoadout
): Engine => {
  const e = useSpinnerGame()
  e.initGame(p, n, false, arena, 0, false, undefined, null, 'circle', false, { seed: 99, skillLoadout: mine })
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

/** Player launch of `b` that never ends: the blade "accelerates" by zero
 *  forever, so the phase stays player_launched and the combat clock runs. */
const launchAndHold = (e: Engine, b: SpinnerState) => {
  e.phase.value = 'player_turn'
  e.beginDrag(b.x, b.y)
  e.updateDrag(b.x, b.y + 40)
  e.releaseDrag()
  expect(e.phase.value).toBe('player_launched')
  b.accelFramesLeft = 1e9
  b.ax = 0
  b.ay = 0
  b.vx = 0
  b.vy = 0
}
/** Short player launch of `b` straight toward (+dx) that ends on its own. */
const playerLaunch = (e: Engine, b: SpinnerState, dirX = 1, dirY = 0, pull = 60) => {
  e.phase.value = 'player_turn'
  e.selectedBladeId.value = null
  e.beginDrag(b.x, b.y)
  e.updateDrag(b.x - dirX * pull, b.y - dirY * pull)
  e.releaseDrag()
  expect(e.phase.value).toBe('player_launched')
}

const events = (e: Engine, kind: string): number => {
  let n = 0
  e.forEachBossTraitEvent(0, ev => {
    if (ev.kind === kind) n++
  })
  return n
}

// ─── Ember Nova ────────────────────────────────────────────────────────────

describe('Ember Nova (Cinder Tyrant)', () => {
  const setup = (mine?: SkillLoadout, extraNpc: SpinnerConfig[] = []) => {
    const e = sandbox([cfg(), cfg()], [boss('ember'), ...extraNpc], 'boss', mine)
    const [a, b] = e.playerBlades.value as [SpinnerState, SpinnerState]
    const c = e.npcBlades.value[0]!
    place(c, 0, -60)
    // a sits inside the reach, b far outside it
    place(a, 0, -60 + c.radius + a.radius + 20)
    place(b, -150, 90)
    return { e, a, b, c }
  }

  it('the combat clock stands still outside launched phases', () => {
    const { e } = setup()
    expect(e.traitsActive()).toBe(true)
    frames(300) // tap_to_start: physics runs, nobody launched
    expect(e.bossClockMs()).toBe(0)
    e.phase.value = 'player_turn' // aiming
    frames(300)
    expect(e.bossClockMs()).toBe(0)
    e.disposePhysics()
  })

  it('a nova lands on exactly the 120th launched substep and burns 3 % max HP once', () => {
    const { e, a, b, c } = setup()
    launchAndHold(e, b)
    const hp0 = a.hp
    frames(119)
    expect(a.hp).toBe(hp0)
    expect(e.novaCharge()).toBeGreaterThan(0.99)
    frame()
    expect(e.bossClockMs()).toBeCloseTo(2000, 6)
    expect(a.hp).toBeCloseTo(hp0 - a.maxHp * BOSS_TRAIT_TUNING.EMBER_PCT, 9)
    expect(b.hp).toBe(b.maxHp) // out of reach
    expect(c.hp).toBe(c.maxHp) // carrier never burns
    expect(events(e, 'nova')).toBe(1)
    expect(events(e, 'burn')).toBe(1)
    // next one 2,000 ms later
    frames(119)
    expect(events(e, 'nova')).toBe(1)
    frame()
    expect(events(e, 'nova')).toBe(2)
    e.disposePhysics()
  })

  it('2× sim speed: two substeps per tick → the nova after 60 ticks', () => {
    simSpeed.value = 2
    const { e, a, b } = setup()
    launchAndHold(e, b)
    const hp0 = a.hp
    frames(59)
    expect(a.hp).toBe(hp0)
    frame()
    expect(a.hp).toBeLessThan(hp0)
    e.disposePhysics()
  })

  it('burn goes through applyHpLoss "burn": Hazard Ward cuts 40 %, Guard Shell absorbs first', () => {
    const lo: SkillLoadout = [{ id: 'hazard_ward', level: 10 }, { id: 'guard_shell', level: 10 }]
    const { e, a, b } = setup(lo)
    launchAndHold(e, b)
    const s = a.skills!
    const shield0 = s.shield
    frames(120)
    const burn = a.maxHp * BOSS_TRAIT_TUNING.EMBER_PCT * (1 - skillParams('hazard_ward', 10).lava)
    expect(a.hp).toBe(a.maxHp)
    expect(s.shield).toBeCloseTo(shield0 - burn, 9)
    e.disposePhysics()
  })

  it('Twin carriers: still one hit per victim per nova; allies are immune', () => {
    const { e, a, b, c } = setup(undefined, [boss('ember'), cfg()])
    const [, c2, ally] = e.npcBlades.value as SpinnerState[]
    place(a, 0, 0)
    place(c, -60, -60)
    place(c2!, 60, -60)
    place(ally!, 0, -110) // inside c's reach, same owner
    launchAndHold(e, b)
    const hp0 = a.hp
    frames(120)
    expect(events(e, 'nova')).toBe(2) // both carriers pulse
    expect(events(e, 'burn')).toBe(1)
    expect(a.hp).toBeCloseTo(hp0 - a.maxHp * BOSS_TRAIT_TUNING.EMBER_PCT, 9)
    expect(ally!.hp).toBe(ally!.maxHp)
    e.disposePhysics()
  })

  it('a lethal burn on the last player blade ends the match as a loss', () => {
    const e = sandbox([cfg()], [boss('ember')], 'boss')
    const a = e.playerBlades.value[0]!
    const c = e.npcBlades.value[0]!
    place(c, 0, -60)
    place(a, 0, -60 + c.radius + a.radius + 20)
    launchAndHold(e, a)
    a.hp = 1
    frames(121)
    expect(a.hp).toBe(0)
    expect(e.gameResult.value).toBe('lose')
    e.disposePhysics()
  })
})

// ─── Frost Lock ────────────────────────────────────────────────────────────

describe('Frost Lock (Glacier Warden)', () => {
  /** 1 Warden vs [a, b]; the NPC AI (Math.random 0.2) picks target index 0
   *  (= a) with a −9° spread: a glancing ram, so the Warden keeps moving. */
  const setup = (mine?: SkillLoadout) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    const e = sandbox([cfg(), cfg()], [boss('frost', { bottomPartId: 'speedy' })], 'boss', mine)
    const [a, b] = e.playerBlades.value as [SpinnerState, SpinnerState]
    return { e, a, b, w: e.npcBlades.value[0]! }
  }
  /** Park for a ram of `a`, then let the NPC take its turn until it rests. */
  const wardenRam = (e: Engine, a: SpinnerState, b: SpinnerState, w: SpinnerState, onFrame?: () => void) => {
    place(w, 0, -90)
    place(a, 0, 20)
    place(b, 160, 80)
    e.phase.value = 'npc_turn'
    until(() => e.phase.value === 'npc_launched')
    until(() => {
      onFrame?.()
      return e.phase.value === 'player_turn'
    })
  }

  it('the ram freezes the victim for its next turn; the other blade is auto-selected; a tap on it is refused', () => {
    const { e, a, b, w } = setup()
    wardenRam(e, a, b, w)
    const t = e.turnIndices().player
    expect(events(e, 'frost_touch')).toBeGreaterThan(0)
    expect(a.lockKind).toBe('frost')
    expect(a.stunnedForTurn).toBe(t + 1)
    expect(e.isBladePickable(a)).toBe(false)
    expect(e.selectedBladeId.value).toBe(b.id)
    expect(e.bossTraitHud.value[0]).toEqual({ frozen: true, chill: 0 })
    // tap on the frozen blade: nothing is picked up
    place(b, 160, 80)
    e.beginDrag(a.x, a.y)
    expect(e.isDragging.value).toBe(false)
    expect(e.selectedBladeId.value).toBe(b.id)
    // play the other one; when that turn ends the ice cracks off
    playerLaunch(e, b, -1, 0)
    until(() => e.phase.value === 'npc_turn')
    expect(a.lockKind).toBeUndefined()
    expect(e.isBladePickable(a)).toBe(true)
    expect(events(e, 'thaw')).toBe(1)
    expect(e.bossTraitHud.value[0]!.frozen).toBe(false)
    // never two turns in a row: the next ram only drains
    const freezes = events(e, 'freeze')
    const touches = events(e, 'frost_touch')
    wardenRam(e, a, b, w)
    expect(events(e, 'frost_touch')).toBeGreaterThan(touches)
    expect(events(e, 'freeze')).toBe(freezes)
    expect(e.isBladePickable(a)).toBe(true)
    e.disposePhysics()
  })

  it('never locks the last launchable blade (the ice cracks off)', () => {
    const { e, a, b, w } = setup()
    b.hp = 0
    wardenRam(e, a, b, w)
    expect(events(e, 'freeze_crack')).toBeGreaterThan(0)
    expect(events(e, 'freeze')).toBe(0)
    expect(a.lockKind).toBeUndefined()
    expect(e.isBladePickable(a)).toBe(true)
    expect(e.selectedBladeId.value).toBe(a.id)
    e.disposePhysics()
  })

  it('a team whose only living blades are frozen thaws at its turn start', () => {
    const { e, a, b, w } = setup()
    wardenRam(e, a, b, w, () => {
      // the other blade dies after the freeze, before the player's turn
      if (a.lockKind === 'frost' && b.hp > 0) b.hp = 0
    })
    expect(b.hp).toBe(0)
    expect(a.lockKind).toBeUndefined()
    expect(e.isBladePickable(a)).toBe(true)
    expect(e.selectedBladeId.value).toBe(a.id)
    let forced = 0
    e.forEachBossTraitEvent(0, ev => {
      if (ev.kind === 'thaw' && ev.value === 1) forced++
    })
    expect(forced).toBe(1)
    e.disposePhysics()
  })

  it('Static Charge vs Warden: the victim is frozen AND the Warden stunned; its turn is skipped', () => {
    const { e, a, b, w } = setup([{ id: 'static_charge', level: 10 }])
    for (const x of e.playerBlades.value) x.skills!.rng = () => 0 // always proc
    wardenRam(e, a, b, w)
    expect(a.lockKind).toBe('frost')
    expect(w.lockKind).toBe('stun')
    expect(w.stunnedForTurn).toBe(e.turnIndices().npc + 1)
    const npcTurn = e.turnIndices().npc
    playerLaunch(e, b, -1, 0)
    // player turn ends → Warden's (fully stunned) turn is skipped → player again
    until(() => e.phase.value === 'player_turn')
    let skips = 0
    e.forEachSkillEvent(0, ev => {
      if (ev.kind === 'stun_skip') skips++
    })
    expect(skips).toBe(1)
    expect(e.turnIndices().npc).toBe(npcTurn + 1)
    // the start-of-turn thaw left the stun alone; the skipped turn's end cleared it
    expect(w.lockKind).toBeUndefined()
    expect(a.lockKind).toBeUndefined()
    expect(e.isBladePickable(a)).toBe(true)
    e.disposePhysics()
  })
})

// ─── Frostbite ─────────────────────────────────────────────────────────────

describe('Frostbite (Frostbite Yeti) + Shattering Glacier shards', () => {
  it('a stack slows statsFor / HUD and lasts through the next 2 own turns', () => {
    const e = sandbox([cfg(), cfg()], [boss('chill')], 'boss')
    const [a, b] = e.playerBlades.value as [SpinnerState, SpinnerState]
    const y = e.npcBlades.value[0]!
    const base = e.statsFor(a).speedMultiplier
    place(y, 0, -60)
    place(a, 0, -60 + y.radius + a.radius + 1)
    a.vy = -6 // a runs into the Yeti (sandbox phase: contacts still resolve)
    until(() => (a.chillN ?? 0) > 0, 30)
    const t = e.turnIndices().player
    expect(a.chillN).toBe(1)
    expect(a.chillExp![0]).toBe(t + BOSS_TRAIT_TUNING.CHILL_TURNS)
    expect(e.statsFor(a).speedMultiplier).toBeCloseTo(base * (1 - BOSS_TRAIT_TUNING.CHILL_PER_STACK), 12)
    frame() // HUD publishes on the tick
    expect(e.bossTraitHud.value[0]).toEqual({ frozen: false, chill: 1 })
    // two own turns (b plays, away from the Yeti)
    for (let turn = 1; turn <= 2; turn++) {
      place(y, 0, -150)
      place(a, -150, 60)
      place(b, 120, 80)
      playerLaunch(e, b, 0, 1)
      place(b, 120, 80) // the launch counts; stop it at once (no stray contacts)
      until(() => e.phase.value === 'npc_turn')
      e.phase.value = 'tap_to_start' // no NPC launch: only our turns count
      if (turn === 1) expect(a.chillN).toBe(1)
    }
    expect(e.turnIndices().player).toBe(t + 2)
    expect(a.chillN).toBe(0)
    expect(events(e, 'chill_fade')).toBe(1)
    expect(e.statsFor(a).speedMultiplier).toBeCloseTo(base, 12)
    frame()
    expect(e.bossTraitHud.value[0]!.chill).toBe(0)
    e.disposePhysics()
  })

  it('split children drop the frost trait and carry shardTrait chill; their touch chills', () => {
    const e = sandbox([cfg({ topLevel: 20, bottomLevel: 20 }), cfg()],
      [boss('frost', { bossAbility: 'split', shardTrait: 'chill' })], 'boss')
    const [a] = e.playerBlades.value as [SpinnerState]
    const g = e.npcBlades.value[0]!
    // kill the Glacier with a collision
    place(g, 0, -40)
    place(a, 0, -40 + g.radius + a.radius + 1)
    g.hp = 0.01
    a.vy = -10
    until(() => e.npcBlades.value.length > 1, 30)
    const shards = e.npcBlades.value.filter(x => x.isSplitChild)
    expect(shards.length).toBeGreaterThan(0)
    for (const s of shards) {
      expect(s.config.bossTrait).toBe('chill')
      expect(s.config.shardTrait).toBeUndefined()
    }
    frames(80) // invulnerability over
    const s = shards[0]!
    const chill0 = a.chillN ?? 0
    const ev0 = events(e, 'chill')
    s.hp = s.maxHp = 1e6 // survives the contact (trait effects need both alive)
    place(s, 100, 100)
    place(a, 100, 100 - s.radius - a.radius - 1)
    a.vy = 6
    until(() => events(e, 'chill') > ev0, 30)
    expect(a.chillN).toBeGreaterThanOrEqual(chill0)
    expect(a.chillN).toBeGreaterThan(0)
    e.disposePhysics()
  })
})

// ─── Replay + fast path ────────────────────────────────────────────────────

describe('trait rosters are deterministic; trait-free matches stay on the fast path', () => {
  const run = async (team: SpinnerConfig[], seed: number, speed: 1 | 2): Promise<string[]> => {
    // Fresh module graph + storage: the previous match's result biases the
    // next start (module state), which is not what this test compares.
    vi.resetModules()
    localStorage.clear()
    // Same float magnitudes (tick alignment per frame), and no leftovers of
    // the previous run (e.g. a screen shake still pulling Math.random on RAF).
    clock = 10_000
    rafQueue.clear()
    vi.clearAllTimers()
    await import('@/use/useUser')
    const game = await import('@/use/useSpinnerGame')
    await installSkillPort()
    await installBossPort()
    game.simSpeed.value = speed
    let s = seed
    vi.spyOn(Math, 'random').mockImplementation(() => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 4294967296
    })
    const e = game.useSpinnerGame()
    e.initGame([cfg({ topPartId: 'star', topLevel: 30, bottomLevel: 30 }), cfg({
        topPartId: 'triangle',
        bottomPartId: 'tanky',
        topLevel: 30,
        bottomLevel: 30
      })],
      team, false, 'boss', 0, false, undefined, null, 'circle', false, { seed })
    e.startMatch()
    const hashes: string[] = []
    let last = e.phase.value
    let plan = seed ^ 0x55
    const r = () => {
      plan = (Math.imul(plan, 1664525) + 1013904223) >>> 0
      return plan / 4294967296
    }
    for (let f = 0; f < 60 * 120 && e.phase.value !== 'game_over'; f++) {
      frame()
      const p = e.phase.value
      if (p !== last && (p === 'player_turn' || p === 'npc_turn' || p === 'game_over')) hashes.push(e.computeStateHash())
      last = p
      if (p === 'player_turn' && f % 20 === 0) {
        const mine = e.playerBlades.value.filter(x => e.isBladePickable(x))
        const foes = e.npcBlades.value.filter(x => x.hp > 0)
        if (mine.length && foes.length) {
          const b = mine[Math.floor(r() * mine.length)]!
          const t = foes[Math.floor(r() * foes.length)]!
          const ang = Math.atan2(t.y - b.y, t.x - b.x)
          e.beginDrag(b.x, b.y)
          e.updateDrag(b.x - Math.cos(ang) * 60, b.y - Math.sin(ang) * 60)
          e.releaseDrag()
        }
      }
    }
    e.disposePhysics()
    game.simSpeed.value = 1
    vi.mocked(Math.random).mockRestore()
    return hashes
  }
  const court = [boss('ember', { bossAbility: 'partners' }), boss('frost', { bossAbility: 'partners' }), boss('chill', { bossAbility: 'partners' })]

  for (const speed of [1, 2] as const) {
    it(`Elemental Court replays bit-identically from one seed at ${speed}×`, async () => {
      const h1 = await run(court, 4242, speed)
      const h2 = await run(court, 4242, speed)
      expect(h1.length).toBeGreaterThan(4)
      expect(h2).toEqual(h1)
    })
  }

  it('no trait → fast path: traitsActive false, empty HUD, trait fields not hashed', () => {
    const e = sandbox([cfg(), cfg()], [cfg({ isBoss: true })])
    expect(e.traitsActive()).toBe(false)
    expect(e.bossTraitHud.value).toEqual([])
    const a = e.playerBlades.value[0]!
    const h0 = e.computeStateHash()
    a.lockKind = 'stun'
    a.chillN = 2
    expect(e.computeStateHash()).toBe(h0)
    frames(60)
    expect(e.bossTraitEventSeq()).toBe(0)
    e.disposePhysics()
    // with a carrier the same fields ARE part of the hash
    const t = sandbox([cfg(), cfg()], [boss('chill')])
    const b = t.playerBlades.value[0]!
    const h1 = t.computeStateHash()
    b.lockKind = 'stun'
    expect(t.computeStateHash()).not.toBe(h1)
    t.disposePhysics()
  })
})
