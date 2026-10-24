// ─── PvP lockstep determinism: host and guest must simulate the same match ───
//
// PvP sends only launches (+ a per-turn state hash); each client simulates the
// whole match itself. The two clients hold the teams in SWAPPED arrays
// (own team = playerBlades), see the arena y-MIRRORED, and receive every
// remote launch a network round-trip after it happened on the sender. Any
// difference in pair order, RNG draw order, clock, or sim speed desyncs them.
//
// Two REAL `useSpinnerGame` engines are run side by side, each from its own
// module graph (`vi.resetModules()` + dynamic import), so every module
// singleton — the match RNG, `simSpeed`, the PvP role — is private to its
// "client", exactly like two browsers. Launches cross over a fake wire with
// latency; each client aims its launches from ITS OWN view of the arena using
// a scripted plan (which blade, which target, angle offset, pull, think time).
//
// Asserted per turn: the engine's state hash, and an independent host-frame
// snapshot (position, velocity, HP of every blade by syncKey) — then the
// winner and the final HP.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// Skills build + the engine's skill port, installed into every fresh client.
import { installSkillPort } from './helpers/skillsBuild'
import type { SpinnerConfig, SpinnerState, TopPartId } from '@/types/spinner'
import type { ArenaType } from '@/use/useSpinnerCampaign'
import type { SkillId, SkillLoadout } from '@/types/skills'
import { SMASHER_LIST, smasherConfig } from '@/data/smasherCatalog'
import { TEAM_SKILL_IDS } from '@/data/skillCatalog'

type GameModule = typeof import('@/use/useSpinnerGame')
type RngModule = typeof import('@/use/useDeterministicRng')
type Engine = ReturnType<GameModule['useSpinnerGame']>

const FRAME_MS = 17
const LATENCY_FRAMES = 9 // one-way wire delay
const GUEST_START_DELAY_FRAMES = 6 // `game-start` reaches the guest later
const MAX_FRAMES = 60 * 60 * 6
const MAX_LAUNCHES = 70

// ── Fake RAF + clock shared by both "browsers" ─────────────────────────────
let clock = 1000
const rafQueue = new Map<number, FrameRequestCallback>()
let rafId = 1

const loadClient = async (): Promise<{ game: GameModule; rng: RngModule }> => {
  vi.resetModules()
  // Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
  // import and pulling useSpinnerGame in cold resolves the cycle wrong.
  await import('@/use/useUser')
  const game = await import('@/use/useSpinnerGame')
  const rng = await import('@/use/useDeterministicRng')
  await installSkillPort()
  return { game, rng }
}

interface PlanStep {
  blade: number // index into the launcher's living blades
  target: number // index into the launcher's living enemies
  offset: number // radians off the straight line to the target
  pull: number // 0..1 of MAX_PULL_DISTANCE
  think: number // frames the player "thinks" before releasing
}

// Deterministic plan generator (independent of the engine RNG).
const makePlan = (seed: number, n: number): PlanStep[] => {
  let s = seed >>> 0 || 1
  const r = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  return Array.from({ length: n }, () => ({
    blade: Math.floor(r() * 4),
    target: Math.floor(r() * 4),
    offset: (r() - 0.5) * 0.9,
    pull: 0.3 + r() * 0.35,
    think: 3 + Math.floor(r() * 40)
  }))
}

interface Client {
  role: 'host' | 'guest'
  game: GameModule
  rng: RngModule
  engine: Engine
  plan: PlanStep[]
  launches: number
  launchAt: number | null
  hashes: string[]
  snaps: string[]
  /** Skill events seen, by kind (polled every frame from the ring buffer). */
  events: Map<string, number>
  eventSeq: number
}

/** Host-frame snapshot keyed by syncKey (host i → i, guest i → 100+i). */
const snapshot = (c: Client): string => {
  const isGuest = c.role === 'guest'
  const host = isGuest ? c.engine.npcBlades.value : c.engine.playerBlades.value
  const guest = isGuest ? c.engine.playerBlades.value : c.engine.npcBlades.value
  const f = isGuest ? -1 : 1
  const row = (b: SpinnerState) =>
    [b.x, b.y * f, b.vx, b.vy * f, b.hp].map(v => v.toFixed(6)).join(',')
  return [
    ...host.map((b, i) => `${i}:${row(b)}`),
    ...guest.map((b, i) => `${100 + i}:${row(b)}`)
  ].join('|')
}

interface MatchSpec {
  arena: ArenaType
  host: SpinnerConfig[]
  guest: SpinnerConfig[]
  seed: number
  firstTurn: 'host' | 'guest'
  hostSimSpeed?: 1 | 2
  /** Skill loadouts per lobby role (both clients build both sides). */
  hostSkills?: SkillLoadout
  guestSkills?: SkillLoadout
  /** Tree Smashers terrain layout + towers (both clients build it; the guest y-flipped). */
  terrain?: { layout: number; towers: boolean }
  /** Runs on each client right after its initGame (e.g. force proc streams). */
  afterInit?: (engine: Engine, role: 'host' | 'guest') => void
  /** Every n-th launch of each client aims at the enemy tree (while it stands). */
  towerEvery?: number
}

interface MatchResult {
  host: Client
  guest: Client
  frames: number
}

const cfg = (topPartId: TopPartId, bottomPartId: SpinnerConfig['bottomPartId'] = 'balanced', lvl = 3): SpinnerConfig => ({
  topPartId, bottomPartId, topLevel: lvl, bottomLevel: lvl
})

const runMatch = async (spec: MatchSpec): Promise<MatchResult> => {
  const wire: { at: number; fn: () => void }[] = []
  let frame = 0
  const sendLater = (fn: () => void, delay = LATENCY_FRAMES) => wire.push({ at: frame + delay, fn })

  // Each client lives in its own module graph — load them one after the
  // other so the second resetModules cannot tear the first one's imports.
  const mk = async (role: 'host' | 'guest', planSeed: number): Promise<Client> => {
    const { game, rng } = await loadClient()
    return {
      role, game, rng,
      engine: game.useSpinnerGame(),
      plan: makePlan(planSeed, MAX_LAUNCHES),
      launches: 0,
      launchAt: null,
      hashes: [],
      snaps: [],
      events: new Map(),
      eventSeq: 0
    }
  }
  const host = await mk('host', spec.seed ^ 0x51ed)
  const guest = await mk('guest', spec.seed ^ 0xbeef)
  const other = (c: Client) => (c === host ? guest : host)

  for (const c of [host, guest]) {
    c.engine.setOnLocalLaunch((idx, ax, ay) => {
      const to = other(c)
      sendLater(() => to.engine.launchRemoteBlade(idx, ax, ay))
    })
    c.engine.setOnStateHash((hash) => {
      c.hashes.push(hash)
      c.snaps.push(snapshot(c))
    })
  }
  if (spec.hostSimSpeed) host.game.simSpeed.value = spec.hostSimSpeed

  const start = (c: Client) => {
    // usePVP: host seeds + broadcasts in `game-start`, guest seeds on receipt.
    c.rng.seedMatchRng(spec.seed)
    const myTeam = c.role === 'host' ? spec.host : spec.guest
    const enemyTeam = c.role === 'host' ? spec.guest : spec.host
    const mySkills = c.role === 'host' ? spec.hostSkills : spec.guestSkills
    const theirSkills = c.role === 'host' ? spec.guestSkills : spec.hostSkills
    c.engine.initGame(myTeam, enemyTeam, false, spec.arena, false, undefined, {
      enabled: true,
      myTurnFirst: spec.firstTurn === c.role,
      role: c.role
    }, 'circle', { skillLoadout: mySkills, enemySkillLoadout: theirSkills, ...(spec.terrain ? { terrain: spec.terrain } : {}) })
    spec.afterInit?.(c.engine, c.role)
  }
  start(host)
  sendLater(() => start(guest), GUEST_START_DELAY_FRAMES)

  const maxPull = host.game.MAX_PULL_DISTANCE
  const tryLaunch = (c: Client) => {
    const e = c.engine
    if (e.phase.value !== 'player_turn' || c.launches >= MAX_LAUNCHES) {
      c.launchAt = null
      return
    }
    const step = c.plan[c.launches]!
    if (c.launchAt === null) c.launchAt = frame + step.think
    if (frame < c.launchAt) return
    // Only blades that may move this turn (Static Charge stuns sit one out).
    const mine = e.playerBlades.value.filter(b => e.isBladePickable(b))
    const theirs = e.npcBlades.value.filter(b => b.hp > 0)
    if (!mine.length || !theirs.length) return
    const b = mine[step.blade % mine.length]!
    const tree = spec.towerEvery ? e.towers().find(w => w.side === 'npc' && w.hp > 0) : undefined
    const t: { x: number; y: number } = tree && c.launches % spec.towerEvery! === 0 ? tree : theirs[step.target % theirs.length]!
    const ang = Math.atan2(t.y - b.y, t.x - b.x) + step.offset
    const pull = step.pull * maxPull
    // Slingshot: drag AWAY from the direction of travel.
    e.beginDrag(b.x, b.y)
    e.updateDrag(b.x - Math.cos(ang) * pull, b.y - Math.sin(ang) * pull)
    e.releaseDrag()
    if (e.phase.value === 'player_launched') {
      c.launches++
      c.launchAt = null
    }
  }

  const over = (c: Client) => c.engine.phase.value === 'game_over'
  for (frame = 0; frame < MAX_FRAMES; frame++) {
    clock += FRAME_MS
    vi.advanceTimersByTime(FRAME_MS)
    for (let i = wire.length - 1; i >= 0; i--) {
      if (wire[i]!.at <= frame) wire.splice(i, 1)[0]!.fn()
    }
    const batch = [...rafQueue.values()]
    rafQueue.clear()
    for (const cb of batch) cb(clock)
    for (const c of [host, guest]) {
      c.eventSeq = c.engine.forEachSkillEvent(c.eventSeq, ev => {
        c.events.set(ev.kind, (c.events.get(ev.kind) ?? 0) + 1)
      })
    }
    tryLaunch(host)
    tryLaunch(guest)
    if (over(host) && over(guest)) break
    if (host.launches + guest.launches >= MAX_LAUNCHES
      && host.engine.phase.value.endsWith('_turn')
      && guest.engine.phase.value.endsWith('_turn')) break
  }
  host.engine.disposePhysics()
  guest.engine.disposePhysics()
  return { host, guest, frames: frame }
}

/** Asserts one match stayed in sync; returns how many turns it compared. */
const expectInSync = ({ host, guest }: MatchResult): number => {
  const n = Math.min(host.snaps.length, guest.snaps.length)
  for (let i = 0; i < n; i++) {
    // Independent host-frame snapshot first — it names the diverging turn.
    expect(guest.snaps[i], `turn ${i + 1} snapshot`).toBe(host.snaps[i])
  }
  expect(guest.snaps.length).toBe(host.snaps.length)
  expect(guest.hashes).toEqual(host.hashes)
  // Winner: host's win is the guest's loss and vice versa.
  const hr = host.engine.gameResult.value
  const gr = guest.engine.gameResult.value
  expect(gr).toBe(hr === 'win' ? 'lose' : hr === 'lose' ? 'win' : null)
  // Final HP by syncKey.
  const hp = (c: Client) => Object.fromEntries(
    c.engine.allBlades.value.map(b => [b.syncKey, b.hp.toFixed(6)])
  )
  expect(hp(guest)).toEqual(hp(host))
  // Something actually happened.
  const lost = host.engine.allBlades.value.some(b => b.hp < b.maxHp)
  expect(lost).toBe(true)
  return n
}

/** Several seeded matches of one setup; together they must cover enough
 *  resolved turns that a desync had a real chance to show. */
const expectSeedsInSync = async (spec: Omit<MatchSpec, 'seed'>, seeds: number[]) => {
  let turns = 0
  for (const seed of seeds) turns += expectInSync(await runMatch({ ...spec, seed }))
  expect(turns).toBeGreaterThanOrEqual(seeds.length * 4)
}

const SEEDS = [0x1234, 0xc0ffee, 77, 4242]

beforeEach(() => {
  clock = 1000
  rafQueue.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  // WORKING audio: jsdom's HTMLMediaElement.play() returns undefined, so the
  // engine's `audio.play().catch(...)` threw and aborted whatever game code
  // called playSound — hiding (and causing) desyncs. A real browser resolves.
  // Audio must never affect the simulation, so the test plays sound for real.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = rafId++
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const ONE_V_ONE: [SpinnerConfig[], SpinnerConfig[]] = [
  [cfg('star', 'tanky', 8)],
  [cfg('piercer', 'tanky', 8)]
]
const TWO_V_TWO: [SpinnerConfig[], SpinnerConfig[]] = [
  [cfg('star', 'speedy', 6), cfg('triangle', 'tanky', 6)],
  [cfg('piercer', 'tanky', 6), cfg('star', 'balanced', 7)]
]

describe('PvP determinism — host and guest simulate the same match', () => {
  const arenas: ArenaType[] = ['default', 'forest', 'lava']
  for (const arena of arenas) {
    it(`1v1 on ${arena}`, async () => {
      await expectSeedsInSync({ arena, host: ONE_V_ONE[0], guest: ONE_V_ONE[1], firstTurn: 'host' }, SEEDS)
    })
    it(`2v2 on ${arena}`, async () => {
      await expectSeedsInSync({ arena, host: TWO_V_TWO[0], guest: TWO_V_TWO[1], firstTurn: 'guest' }, SEEDS)
    })
  }

  // Terrain arenas: every feature kind (boosters, leaf arrows, mud, honey,
  // deep holes, islands, mushroom caps, logs) + towers, host and guest in sync.
  for (const layout of [0, 1, 2, 5, 4, 11, 9, 48, 31, 46, 49]) {
    it(`2v2 on terrain layout ${layout} with towers`, async () => {
      await expectSeedsInSync({ arena: 'default', host: TWO_V_TWO[0], guest: TWO_V_TWO[1], firstTurn: 'host', terrain: { layout, towers: true } }, SEEDS.slice(0, 2))
    })
  }

  it('2v2 star mirror (crit rolls both sides) with the guest moving first', async () => {
    const team = [cfg('star', 'speedy', 6), cfg('star', 'tanky', 6)]
    await expectSeedsInSync({
      arena: 'default',
      host: team,
      guest: team.map(c => ({ ...c })),
      firstTurn: 'guest'
    }, SEEDS)
  })

  it('the host\'s 2x speed switch does not touch PvP physics', async () => {
    await expectSeedsInSync({
      arena: 'default',
      host: TWO_V_TWO[0],
      guest: TWO_V_TWO[1],
      firstTurn: 'host',
      hostSimSpeed: 2
    }, SEEDS)
  })

  // Regression: these matches end in a SIMULTANEOUS loss (mutual wipe-out /
  // both towers down). Each client calls its own team 'player', and the old
  // "player wins ties" rule made BOTH clients report a win. Exactly one wins.
  it('a simultaneous loss gives complementary results (never a double win)', async () => {
    const specs: MatchSpec[] = [
      ...SEEDS.map(seed => ({ arena: 'default' as ArenaType, host: TWO_V_TWO[0], guest: TWO_V_TWO[1], firstTurn: 'host' as const, hostSimSpeed: 2 as const, seed })),
      ...SEEDS.slice(0, 2).map(seed => ({ arena: 'default' as ArenaType, host: TWO_V_TWO[0], guest: TWO_V_TWO[1], firstTurn: 'host' as const, terrain: { layout: 9, towers: true }, seed }))
    ]
    for (const spec of specs) {
      const { host, guest } = await runMatch(spec)
      const hr = host.engine.gameResult.value
      const gr = guest.engine.gameResult.value
      if (hr === null && gr === null) continue // unfinished = both "draw"
      expect([hr, gr].sort(), `seed ${spec.seed}`).toEqual(['lose', 'win'])
    }
  })

  it('assigns identical syncKeys on both clients (host 0..n-1, guest 100+i)', async () => {
    const r = await runMatch({ arena: 'default', host: TWO_V_TWO[0], guest: TWO_V_TWO[1], seed: 9, firstTurn: 'host' })
    expect(r.host.engine.playerBlades.value.map(b => b.syncKey)).toEqual([0, 1])
    expect(r.host.engine.npcBlades.value.map(b => b.syncKey)).toEqual([100, 101])
    expect(r.guest.engine.playerBlades.value.map(b => b.syncKey)).toEqual([100, 101])
    expect(r.guest.engine.npcBlades.value.map(b => b.syncKey)).toEqual([0, 1])
  })

  it('the engine sees the shared PvP seed; initGame({ seed }) reproduces a campaign match', async () => {
    const { game, rng } = await loadClient()
    const e = game.useSpinnerGame()
    rng.seedMatchRng(0xabc)
    e.initGame(TWO_V_TWO[0], TWO_V_TWO[1], false, 'default', false, undefined, {
      enabled: true,
      myTurnFirst: true,
      role: 'host'
    })
    expect(e.getMatchSeed()).toBe(0xabc)
    expect(rng.currentMatchSeed()).toBe(0xabc)
    e.initGame(TWO_V_TWO[0], TWO_V_TWO[1], false, 'default', false, undefined, null, 'circle', { seed: 555 })
    expect(e.getMatchSeed()).toBe(555)
    const first = rng.matchRng()
    e.initGame(TWO_V_TWO[0], TWO_V_TWO[1], false, 'default', false, undefined, null, 'circle', { seed: 555 })
    expect(rng.matchRng()).toBe(first)
    e.disposePhysics()
  })
})

// ─── Skills on both sides (skills-feature.md §9.1, WP4) ────────────────────
// Every blade rolls its own stream seeded by (match seed, syncKey), the
// Opening Salvo fires host team then guest team, and Static Charge stuns are
// counted per side — the two clients must stay bit-identical.

const L = (a: SkillId, b: SkillId, lvl = 10): SkillLoadout => [{ id: a, level: lvl }, { id: b, level: lvl }]
const SHELL_STATIC = L('guard_shell', 'static_charge')
const ROCKETS_SALVO = L('homing_rockets', 'opening_salvo')
const PHASE_MIRROR = L('phase_step', 'mirror_plate')

/** Proc streams forced HOT (still peer-identical: seeded by syncKey), so a
 *  handful of turns exercises every branch (dodges, reflections, volleys,
 *  stuns) even on lava, where 2v2 matches last only a few launches. */
const forceHotProcs = (engine: Engine) => {
  for (const b of engine.allBlades.value) {
    if (!b.skills) continue
    // Rockets primed one contact short of a volley.
    b.skills.rocketCount = Math.max(0, b.skills.rocketEveryN - 1)
    let s = (b.syncKey * 2654435761) >>> 0 || 7
    b.skills.rng = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return (s / 4294967296) * 0.35
    }
  }
}

const countEvents = (c: Client, kind: string): number => c.events.get(kind) ?? 0

describe('PvP determinism — skills on both sides', () => {
  // [name, host, guest, event kinds the hot run must have produced]
  const pairs: [string, SkillLoadout, SkillLoadout, string[]][] = [
    ['Guard Shell + Static Charge vs Rockets + Salvo', SHELL_STATIC, ROCKETS_SALVO,
      ['salvo', 'shield_absorb', 'static', 'rocket_volley', 'rocket_hit']],
    ['Phase + Mirror vs Guard Shell + Static Charge', PHASE_MIRROR, SHELL_STATIC,
      ['phase', 'mirror', 'shield_absorb', 'static']],
    ['Rockets + Salvo vs Phase + Mirror', ROCKETS_SALVO, PHASE_MIRROR,
      ['salvo', 'rocket_volley', 'phase', 'mirror']]
  ]
  for (const arena of ['forest', 'lava'] as ArenaType[]) {
    for (const [name, hostSkills, guestSkills, kinds] of pairs) {
      it(`${name} on ${arena} (real per-blade streams)`, async () => {
        await expectSeedsInSync({
          arena, host: TWO_V_TWO[0], guest: TWO_V_TWO[1], firstTurn: 'host', hostSkills, guestSkills
        }, SEEDS)
      })
      it(`${name} on ${arena} (hot proc streams)`, async () => {
        const seen = new Map<string, number>()
        let turns = 0
        for (const seed of SEEDS.slice(0, 2)) {
          const r = await runMatch({
            arena, host: TWO_V_TWO[0], guest: TWO_V_TWO[1], seed, firstTurn: 'guest', hostSkills, guestSkills,
            afterInit: forceHotProcs
          })
          turns += expectInSync(r)
          for (const k of kinds) {
            const n = countEvents(r.host, k)
            expect(countEvents(r.guest, k), `${k} events`).toBe(n)
            seen.set(k, (seen.get(k) ?? 0) + n)
          }
        }
        expect(turns).toBeGreaterThanOrEqual(8)
        // The branches this pair exists to test actually ran.
        for (const k of kinds) expect(seen.get(k), `${k} never happened`).toBeGreaterThan(0)
      })
    }
  }

  it('skill state is part of the state hash and both clients built identical runtimes', async () => {
    const r = await runMatch({
      arena: 'lava', host: TWO_V_TWO[0], guest: TWO_V_TWO[1], seed: 0x5eed, firstTurn: 'host',
      hostSkills: SHELL_STATIC, guestSkills: ROCKETS_SALVO
    })
    const bySync = (c: Client) => Object.fromEntries(c.engine.allBlades.value.map(b => [
      b.syncKey,
      b.skills ? `${b.skills.has}|${b.skills.shieldMax}|${b.skills.shield.toFixed(6)}|${b.skills.rngState}` : '-'
    ]))
    expect(bySync(r.guest)).toEqual(bySync(r.host))
    // Every original blade of both teams carries its side's loadout.
    for (const key of [0, 1, 100, 101]) expect(bySync(r.host)[key]).not.toBe('-')
    // The shield / stun segment is appended to the hash payload.
    const e = r.host.engine
    const before = e.computeStateHash()
    const b0 = e.playerBlades.value[0]!
    const keep = b0.skills!.shield
    b0.skills!.shield = keep + 1
    expect(e.computeStateHash()).not.toBe(before)
    b0.skills!.shield = keep
    b0.stunnedForTurn = 99
    expect(e.computeStateHash()).not.toBe(before)
  })

  it('Opening Salvo applies in PvP on both clients, host team first, before the first turn', async () => {
    const { game: gh, rng: rh } = await loadClient()
    const host = gh.useSpinnerGame()
    rh.seedMatchRng(0x77)
    host.initGame(TWO_V_TWO[0], TWO_V_TWO[1], false, 'default', false, undefined,
      { enabled: true, myTurnFirst: true, role: 'host' }, 'circle',
      { skillLoadout: L('opening_salvo', 'guard_shell'), enemySkillLoadout: L('opening_salvo', 'mirror_plate', 4) })
    const { game: gg, rng: rg } = await loadClient()
    const guest = gg.useSpinnerGame()
    rg.seedMatchRng(0x77)
    guest.initGame(TWO_V_TWO[1], TWO_V_TWO[0], false, 'default', false, undefined,
      { enabled: true, myTurnFirst: false, role: 'guest' }, 'circle',
      { skillLoadout: L('opening_salvo', 'mirror_plate', 4), enemySkillLoadout: L('opening_salvo', 'guard_shell') })
    expect(host.phase.value).toBe('deciding_turn')
    const hp = (e: Engine) => Object.fromEntries(e.allBlades.value.map(b => [b.syncKey, b.hp.toFixed(6)]))
    expect(hp(guest)).toEqual(hp(host))
    expect(guest.computeStateHash()).toBe(host.computeStateHash())
    // Guest team (100+) lost 14 % of max HP (L10); the host team's shields
    // soaked the guest's L4 salvo (8 %) instead of HP.
    for (const b of host.npcBlades.value) expect(b.hp).toBeCloseTo(b.maxHp * 0.86, 6)
    for (const b of host.playerBlades.value) {
      expect(b.hp).toBe(b.maxHp)
      expect(b.skills!.shield).toBeCloseTo(b.skills!.shieldMax - b.maxHp * 0.08, 6)
    }
    let salvos = 0
    host.forEachSkillEvent(0, ev => {
      if (ev.kind === 'salvo') salvos++
    })
    expect(salvos).toBe(4) // 2 host-team hits on the guest team, then 2 back
    host.disposePhysics()
    guest.disposePhysics()
  })

  it('a fully stunned team skips its turn on BOTH clients at the same transition', async () => {
    // 1v1, the host carries Static Charge with a stream that always procs:
    // every armed contact while the guest's blade is the launched one stuns
    // it for the guest's next turn (then it is immune for one turn).
    const alwaysProc = (engine: Engine) => {
      for (const b of engine.allBlades.value) if (b.skills) b.skills.rng = () => 0
    }
    let skips = 0
    let turns = 0
    for (const seed of SEEDS) {
      const r = await runMatch({
        arena: 'default', host: ONE_V_ONE[0], guest: ONE_V_ONE[1], seed, firstTurn: 'guest',
        hostSkills: [{ id: 'static_charge', level: 10 }], afterInit: alwaysProc
      })
      turns += expectInSync(r)
      const hs = countEvents(r.host, 'stun_skip')
      expect(countEvents(r.guest, 'stun_skip')).toBe(hs)
      const hi = r.host.engine.turnIndices()
      expect(r.guest.engine.turnIndices()).toEqual({ player: hi.npc, npc: hi.player })
      skips += hs
    }
    expect(turns).toBeGreaterThanOrEqual(SEEDS.length * 4)
    expect(skips).toBeGreaterThan(0)
  })
})

// ─── Smasher mechanics: disc sizes, gameplay heading + directional armour,
// the smasher-only effects (bank_shot / anchor / tower_breaker / thorns) ──────
describe('PvP determinism — smasher discs, armour and the smasher-only effects', () => {
  const NEW = SMASHER_LIST.filter(s => s.skills.some(k => !TEAM_SKILL_IDS.includes(k.effect)))
  const byDisc = [...SMASHER_LIST].sort((a, b) => (b.disc ?? 1) - (a.disc ?? 1))
  const armoured = SMASHER_LIST.filter(s => s.armor)
  const pick = (i: number) => (NEW.length ? NEW[i % NEW.length]! : armoured[i % armoured.length]!).id

  it('2v2 armoured smashers (big + small discs) stay in sync, with towers', async () => {
    await expectSeedsInSync({
      arena: 'default',
      host: [smasherConfig(byDisc[0]!.id, 30), smasherConfig(armoured[0]!.id, 30)],
      guest: [smasherConfig(byDisc[byDisc.length - 1]!.id, 30), smasherConfig(armoured[armoured.length - 1]!.id, 30)],
      firstTurn: 'host',
      terrain: { layout: 2, towers: true }
    }, SEEDS)
  })

  it('2v2 carriers of the smasher-only effects stay in sync (both sides, towers on)', async () => {
    await expectSeedsInSync({
      arena: 'default',
      host: [smasherConfig(pick(0), 30), smasherConfig(pick(1), 30)],
      guest: [smasherConfig(pick(2), 30), smasherConfig(pick(3), 30)],
      firstTurn: 'guest',
      terrain: { layout: 5, towers: true }
    }, [...SEEDS, 99, 31337])
  })

  it('deep levels past the old cap (75 vs 50, tapered stats, both sides) stay in sync', async () => {
    await expectSeedsInSync({
      arena: 'default',
      host: [smasherConfig(byDisc[0]!.id, 75), smasherConfig(pick(1), 50)],
      guest: [smasherConfig(pick(2), 50), smasherConfig(armoured[0]!.id, 75)],
      firstTurn: 'host',
      terrain: { layout: 2, towers: true }
    }, SEEDS)
  })
})

describe('PvP determinism — team sizes (src/data/teamSize.ts)', () => {
  const ids = SMASHER_LIST.map(s => s.id)
  const team = (from: number, n: number) => ids.slice(from, from + n).map(id => smasherConfig(id, 12))

  it('spiked trees (thorn recoil on every tree hit) stay in sync, both sides', async () => {
    // PvP trees are bare by rule (only a boss's tree is spiked); force the
    // cover on both trees so the recoil path — gameplay HP loss on the
    // attacker — runs under lock-step on both peers.
    const treeHp: number[] = []
    let spiked = 0
    for (const seed of SEEDS.slice(0, 3)) {
      const r = await runMatch({
        arena: 'default', host: team(0, 2), guest: team(2, 2), firstTurn: 'host', seed,
        terrain: { layout: 4, towers: true }, towerEvery: 2,
        afterInit: (e) => { for (const t of e.towers()) { (t as { spiked: boolean }).spiked = true; spiked++ } }
      })
      expectInSync(r)
      for (const t of r.host.engine.towers()) treeHp.push(t.hp / t.maxHp)
    }
    expect(spiked).toBe(12)
    // The trees were actually hit (so the thorns pricked someone).
    expect(treeHp.some(f => f < 1)).toBe(true)
  })

  it('3v3 smashers on terrain with towers stay in sync (size ×0.75 both sides)', async () => {
    await expectSeedsInSync({
      arena: 'default', host: team(0, 3), guest: team(3, 3), firstTurn: 'host', terrain: { layout: 7, towers: true }
    }, SEEDS)
  })

  it('1v1 smashers (solo boost both sides) stay in sync', async () => {
    await expectSeedsInSync({
      arena: 'default', host: team(6, 1), guest: team(9, 1), firstTurn: 'guest', terrain: { layout: 3, towers: true }
    }, SEEDS)
  })

  it('uneven sides (1 vs 3) still agree: each side sized and boosted by its own count', async () => {
    await expectSeedsInSync({
      arena: 'forest', host: team(12, 1), guest: team(15, 3), firstTurn: 'host'
    }, SEEDS.slice(0, 2))
  })
})
