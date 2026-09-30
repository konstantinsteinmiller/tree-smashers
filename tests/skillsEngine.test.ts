// ─── Skill system: engine integration (skills-feature.md §5, §10.3, WP4) ────
//
// Drives the REAL `useSpinnerGame` loop (fake RAF + a controlled clock) and
// checks that the pure runtime (`skills/skillRuntime.ts`, unit-tested on its
// own) is wired at the right hook points:
//
//   · empty / omitted loadouts leave `blade.skills` unset (fast path);
//   · every HP decrement of a skilled blade runs through applyHpLoss — a
//     Guard Shell soaks lava, Hazard Ward thins it;
//   · Homing Rockets fly on game time, block the turn change while in flight,
//     and a rocket kill still runs the split-boss shatter;
//   · Static Charge stuns: a stunned blade is neither pickable nor chosen by
//     the NPC AI, and a fully stunned team has its turn skipped;
//   · Opening Salvo fires once, after the meteor intro;
//   · Second Wind heals obey the heal-number rule; the HUD publishes chips.
//
// The PvP side (both peers, skills on both teams) lives in
// tests/pvpDeterminism.test.ts.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
// Skills build + the engine's skill port (the flag must be on before the gate loads).
import { installSkillPort } from './helpers/skillsBuild'
// Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
// import and pulling useSpinnerGame in cold resolves the cycle wrong.
import '@/use/useUser'
import { useSpinnerGame, ARENA_RADIUS } from '@/use/useSpinnerGame'
import { setGamePaused } from '@/use/useGamePause'
import type { SpinnerConfig, SpinnerState } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'

type Engine = ReturnType<typeof useSpinnerGame>

const cfg = (extra: Partial<SpinnerConfig> = {}): SpinnerConfig =>
  ({ topPartId: 'round', bottomPartId: 'balanced', topLevel: 3, bottomLevel: 3, ...extra })

let clock = 0
const rafQueue = new Map<number, FrameRequestCallback>()
const STEP = 1000 / 60

beforeAll(installSkillPort)

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
  // jsdom's HTMLMediaElement.play() returns undefined; the sound helper
  // chains .catch() on it. Give it a promise so a kill's explosion SFX does
  // not abort the physics tick it happens in.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Advance ~`ms` in 60 Hz frames (one physics step each). */
const frames = (ms: number) => {
  for (let t = 0; t < ms; t += STEP) {
    clock += STEP + 1e-6
    vi.advanceTimersByTime(STEP)
    const batch = [...rafQueue.values()]
    rafQueue.clear()
    for (const cb of batch) cb(clock)
  }
}

/** Physics running outside any turn phase: blades move, nobody launches. */
const sandbox = (
  p: SpinnerConfig[], n: SpinnerConfig[], arena: Parameters<Engine['initGame']>[3], mine?: SkillLoadout, theirs?: SkillLoadout
): Engine => {
  const e = useSpinnerGame()
  e.initGame(p, n, false, arena, 0, false, undefined, null, 'circle', false,
    { seed: 1234, skillLoadout: mine, enemySkillLoadout: theirs })
  e.startPhysics() // phase stays 'tap_to_start'
  return e
}

/** Park every blade far apart and at rest. */
const park = (blades: SpinnerState[]) => {
  blades.forEach((b, i) => {
    const a = (i / blades.length) * Math.PI * 2
    b.x = Math.cos(a) * ARENA_RADIUS * 0.45
    b.y = Math.sin(a) * ARENA_RADIUS * 0.45
    b.vx = 0
    b.vy = 0
  })
}

const events = (e: Engine, kind: string): number => {
  let n = 0
  e.forEachSkillEvent(0, ev => {
    if (ev.kind === kind) n++
  })
  return n
}

describe('skills — loadout wiring', () => {
  it('omitted, empty and invalid loadouts leave blade.skills unset', () => {
    for (const mine of [undefined, [], [{ id: 'nope', level: 3 }]] as unknown as (SkillLoadout | undefined)[]) {
      const e = sandbox([cfg(), cfg()], [cfg()], 'default', mine, mine)
      expect(e.allBlades.value.every(b => b.skills === undefined)).toBe(true)
      expect(e.skillHud.value).toEqual([])
      e.disposePhysics()
    }
  })

  it('both sides get their own loadout; the HUD publishes the local chips', () => {
    const e = sandbox([cfg(), cfg()], [cfg(), cfg()], 'default',
      [{ id: 'guard_shell', level: 5 }, { id: 'momentum', level: 2 }],
      [{ id: 'mirror_plate', level: 7 }])
    for (const b of e.playerBlades.value) expect(b.skills?.ids).toEqual(['guard_shell', 'momentum'])
    for (const b of e.npcBlades.value) expect(b.skills?.ids).toEqual(['mirror_plate'])
    // Distinct per-blade streams (seeded by syncKey).
    const states = new Set(e.allBlades.value.map(b => b.skills!.rngState))
    expect(states.size).toBe(4)
    const hud = e.skillHud.value
    expect(hud).toHaveLength(2)
    expect(hud[0]!.map(s => s.id)).toEqual(['guard_shell', 'momentum'])
    expect(hud[0]![0]!.state.ring).toBe(1)
    expect(hud[0]![1]!.state).toMatchObject({ pips: 0, pipsMax: 3 })
    e.disposePhysics()
  })
})

describe('skills — HP loss path', () => {
  it('Guard Shell absorbs a lava burn (HP untouched, shield drops by the burn)', () => {
    const e = sandbox([cfg()], [cfg()], 'lava', [{ id: 'guard_shell', level: 10 }])
    park(e.allBlades.value)
    const b = e.playerBlades.value[0]!
    const s = b.skills!
    const burn = Math.ceil(b.maxHp * 0.025)
    expect(s.shield).toBeGreaterThan(burn)
    b.x = ARENA_RADIUS - b.radius - 4
    b.y = 0
    b.vx = 6
    frames(120)
    expect(b.hp).toBe(b.maxHp)
    expect(s.shield).toBeLessThan(s.shieldMax)
    expect((s.shieldMax - s.shield) % burn).toBe(0)
    expect(events(e, 'shield_absorb')).toBeGreaterThan(0)
    e.disposePhysics()
  })

  it('Hazard Ward thins lava; a blade without skills takes the full burn', () => {
    const e = sandbox([cfg(), cfg()], [cfg()], 'lava', [{ id: 'hazard_ward', level: 10 }])
    park(e.allBlades.value)
    const warded = e.playerBlades.value[0]!
    const burn = Math.ceil(warded.maxHp * 0.025)
    warded.x = ARENA_RADIUS - warded.radius - 4
    warded.y = 0
    warded.vx = 6
    frames(60)
    const lost = warded.maxHp - warded.hp
    expect(lost).toBeGreaterThan(0)
    // 40 % off at L10 → each touch costs 60 % of the burn.
    const touches = lost / (burn * 0.6)
    expect(Math.abs(touches - Math.round(touches))).toBeLessThan(1e-9)
    expect(events(e, 'ward')).toBeGreaterThan(0)
    e.disposePhysics()
  })

  it('Second Wind heals once below 35 % and shows a heal number (heal rule intact)', () => {
    const e = sandbox([cfg()], [cfg()], 'lava', [{ id: 'second_wind', level: 10 }])
    park(e.allBlades.value)
    const b = e.playerBlades.value[0]!
    b.hp = b.maxHp * 0.37
    b.x = ARENA_RADIUS - b.radius - 4
    b.y = 0
    b.vx = 6
    frames(60)
    expect(b.skills!.secondWindUsed).toBe(true)
    expect(events(e, 'heal')).toBe(1)
    expect(b.hp).toBeGreaterThan(b.maxHp * 0.35)
    expect(b.hp).toBeLessThanOrEqual(b.maxHp)
    e.disposePhysics()
  })
})

describe('skills — Homing Rockets', () => {
  it('a rocket kill runs the split-boss shatter; rockets hold the turn open', () => {
    // Player (rockets, one contact from a volley) nudges a plain enemy; the
    // split boss elsewhere has 1 HP left and is the lowest-HP target.
    const e = useSpinnerGame()
    e.initGame([cfg()], [cfg(), cfg({ isBoss: true, bossAbility: 'split' })], false, 'default', 0, false,
      undefined, null, 'circle', false, { seed: 99, skillLoadout: [{ id: 'homing_rockets', level: 10 }] })
    e.startPhysics()
    const [me] = e.playerBlades.value
    const [grunt, boss] = e.npcBlades.value
    park([me!, grunt!, boss!])
    boss!.x = -ARENA_RADIUS * 0.5
    boss!.y = -ARENA_RADIUS * 0.3
    boss!.hp = 1
    me!.skills!.rocketCount = me!.skills!.rocketEveryN - 1
    me!.x = 0
    me!.y = 0
    grunt!.x = me!.radius + grunt!.radius + 2
    grunt!.y = 0
    me!.vx = 3
    frames(34) // contact happens, volley launched
    expect(events(e, 'rocket_volley')).toBe(1)
    expect(e.rocketsInFlight()).toBeGreaterThan(0)
    // Pretend it is the player's launch resolving, everything at rest: the
    // turn must not pass while a rocket is still in the air.
    me!.vx = me!.vy = grunt!.vx = grunt!.vy = 0
    e.phase.value = 'player_launched'
    frames(34)
    expect(e.phase.value).toBe('player_launched')
    frames(500)
    expect(e.rocketsInFlight()).toBe(0)
    expect(boss!.hp).toBe(0)
    expect(events(e, 'rocket_hit')).toBeGreaterThan(0)
    const children = e.npcBlades.value.filter(b => b.isSplitChild)
    expect(children.length).toBe(5)
    expect(e.phase.value).not.toBe('player_launched')
    e.disposePhysics()
  })
})

describe('skills — Homing Rockets across a platform pause', () => {
  it('a rocket in flight freezes with the physics loop and does not land on resume', () => {
    const e = useSpinnerGame()
    e.initGame([cfg()], [cfg(), cfg()], false, 'default', 0, false,
      undefined, null, 'circle', false, { seed: 99, skillLoadout: [{ id: 'homing_rockets', level: 10 }] })
    e.startPhysics()
    const [me] = e.playerBlades.value
    const [grunt, other] = e.npcBlades.value
    park([me!, grunt!, other!])
    me!.skills!.rocketCount = me!.skills!.rocketEveryN - 1
    me!.x = 0
    me!.y = 0
    grunt!.x = me!.radius + grunt!.radius + 2
    grunt!.y = 0
    me!.vx = 3
    frames(34)
    expect(events(e, 'rocket_volley')).toBe(1)
    const inFlight = e.rocketsInFlight()
    expect(inFlight).toBeGreaterThan(0)
    me!.vx = me!.vy = grunt!.vx = grunt!.vy = 0

    // Platform pause for 5 s of wall clock: nothing may land meanwhile…
    setGamePaused(true)
    frames(5000)
    expect(e.rocketsInFlight()).toBe(inFlight)
    // …nor on the first ticks after resume: the flight still has most of
    // its 400 ms to go on the simulation clock.
    setGamePaused(false)
    frames(100)
    expect(e.rocketsInFlight()).toBe(inFlight)
    expect(events(e, 'rocket_hit')).toBe(0)
    frames(500)
    expect(e.rocketsInFlight()).toBe(0)
    e.disposePhysics()
  })
})

describe('skills — Static Charge stun (campaign)', () => {
  it('the NPC AI never launches a blade stunned for its turn', () => {
    const e = sandbox([cfg()], [cfg(), cfg()], 'default', [{ id: 'static_charge', level: 1 }])
    park(e.allBlades.value)
    const [n0, n1] = e.npcBlades.value
    n0!.stunnedForTurn = 1 // the NPC side's first turn
    expect(e.isBladePickable(n0!)).toBe(false)
    expect(e.isBladePickable(n1!)).toBe(true)
    // Math.random() = 0 would pick living[0] = the stunned blade.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    e.phase.value = 'npc_turn'
    for (let i = 0; i < 60 && e.phase.value !== 'npc_launched'; i++) frames(STEP)
    expect(e.phase.value).toBe('npc_launched')
    frames(STEP * 2) // the ramp has started on the launched blade only
    expect(n0!.vx === 0 && n0!.vy === 0).toBe(true)
    expect(Math.hypot(n1!.vx, n1!.vy)).toBeGreaterThan(0)
    expect(e.turnIndices().npc).toBe(1)
    e.disposePhysics()
  })

  it('a fully stunned NPC team has its turn skipped; the player moves again', () => {
    const e = sandbox([cfg()], [cfg(), cfg()], 'default', [{ id: 'static_charge', level: 1 }])
    park(e.allBlades.value)
    for (const b of e.npcBlades.value) b.stunnedForTurn = 1
    e.phase.value = 'player_launched' // nothing moving → resolves next tick
    frames(40)
    expect(e.phase.value).toBe('player_turn')
    expect(e.turnIndices()).toEqual({ player: 0, npc: 1 })
    expect(events(e, 'stun_skip')).toBe(2)
    e.disposePhysics()
  })

  it('a fully stunned player team is skipped and its blades cannot be dragged', () => {
    const e = sandbox([cfg()], [cfg()], 'default', undefined, [{ id: 'static_charge', level: 1 }])
    park(e.allBlades.value)
    const me = e.playerBlades.value[0]!
    me.stunnedForTurn = 1
    expect(e.isBladePickable(me)).toBe(false)
    e.phase.value = 'player_turn'
    e.beginDrag(me.x, me.y)
    expect(e.isDragging.value).toBe(false)
    e.phase.value = 'npc_launched'
    frames(40)
    expect(e.turnIndices().player).toBe(1)
    expect(['npc_turn', 'npc_launched']).toContain(e.phase.value)
    e.disposePhysics()
  })
})

describe('skills — Opening Salvo (campaign)', () => {
  it('fires once when the meteor intro ends, before the first turn', () => {
    const e = useSpinnerGame()
    e.initGame([cfg(), cfg()], [cfg(), cfg()], false, 'default', 0, false, undefined, null, 'circle', false,
      { seed: 5, skillLoadout: [{ id: 'opening_salvo', level: 10 }] })
    e.startMatch()
    expect(e.npcBlades.value.every(b => b.hp === b.maxHp)).toBe(true)
    frames(1800)
    for (const b of e.npcBlades.value) expect(b.hp).toBeCloseTo(b.maxHp * 0.86, 6)
    expect(events(e, 'salvo')).toBe(2)
    frames(1000)
    expect(events(e, 'salvo')).toBe(2)
    e.disposePhysics()
  })
})
