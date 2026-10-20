// ─── League: seeded single-player battles replay from their seed (LG-DET) ───
//
// A league fight is a single-player match against an AI roster (a ghost
// build or a gatekeeper boss). `initGame(..., { seed })` must make it a pure
// function of (seed, rosters, loadouts, the player's launches):
//
//   · the match stream (`matchRng`) is seeded from `seed` — as before;
//   · every other gameplay roll the engine makes OUTSIDE PvP — NPC spawn
//     jitter, bouncer placement, the NPC AI's blade/target/angle/force picks,
//     split-child jitter — draws from an AUX stream derived from the seed,
//     never from `matchRng` (its draw order is untouched) and never from
//     Math.random;
//   · every gameplay timer runs on the simulation clock, not the wall clock.
//
// Each run below lives in its own module graph (`vi.resetModules()`), like a
// fresh page, with a DIFFERENT Math.random and a wall clock that drifts away
// from the frame clock — neither may leak into the result. Unseeded
// (campaign) matches keep Math.random for those rolls.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
// Skills + Bosses100 builds (both env stubs must precede the gate imports).
import { installSkillPort } from './helpers/skillsBuild'
import { installBossPort } from './helpers/bosses100Build'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { SpinnerConfig } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'
import type { ArenaType, StageBladeConfig } from '@/use/useSpinnerCampaign'
import type { BossEncounterId } from '@/data/bossEncounters'

type GameModule = typeof import('@/use/useSpinnerGame')
type RngModule = typeof import('@/use/useDeterministicRng')

// ── Fake RAF (frame clock) + an independent, skewable wall clock ───────────
const FRAME_MS = 17
let frameClock = 1000
let wallSkew = 0
let wallDriftPerFrame = 0
const rafQueue = new Map<number, FrameRequestCallback>()
let rafId = 1
let rs = 1
const lcg = () => {
  rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0
  return rs / 4294967296
}

beforeEach(() => {
  frameClock = 1000
  wallSkew = 0
  wallDriftPerFrame = 0
  rafQueue.clear()
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(performance, 'now').mockImplementation(() => frameClock + wallSkew)
  vi.spyOn(Math, 'random').mockImplementation(lcg)
  // jsdom's play() returns undefined; the sound helper chains .catch() on it.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
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

const frame = () => {
  frameClock += FRAME_MS
  wallSkew += wallDriftPerFrame
  vi.advanceTimersByTime(FRAME_MS)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(frameClock)
}

/** A fresh "page": own module graph, both feature ports installed. */
const loadPage = async (): Promise<{ game: GameModule; rng: RngModule }> => {
  vi.resetModules()
  // Import useUser FIRST — useMatch <-> useModels <-> useUser is a circular
  // import and pulling useSpinnerGame in cold resolves the cycle wrong.
  await import('@/use/useUser')
  const game = await import('@/use/useSpinnerGame')
  const rng = await import('@/use/useDeterministicRng')
  await installSkillPort()
  await installBossPort()
  return { game, rng }
}

const cfg = (topPartId: SpinnerConfig['topPartId'], bottomPartId: SpinnerConfig['bottomPartId'], lvl: number): SpinnerConfig =>
  ({ topPartId, bottomPartId, topLevel: lvl, bottomLevel: lvl })
const L = (a: string, b: string, lvl = 8): SkillLoadout =>
  [{ id: a, level: lvl }, { id: b, level: lvl }] as SkillLoadout
const toCfg = (e: StageBladeConfig): SpinnerConfig => {
  const c: SpinnerConfig = {
    topPartId: e.topPartId, bottomPartId: e.bottomPartId, topLevel: e.topLevel, bottomLevel: e.bottomLevel,
    modelId: e.modelId, isBoss: e.isBoss, bossAbility: e.bossAbility
  }
  if (e.bossTrait) c.bossTrait = e.bossTrait
  if (e.shardTrait) c.shardTrait = e.shardTrait
  return c
}

interface Battle {
  player: SpinnerConfig[]
  enemy: SpinnerConfig[] | BossEncounterId
  arena: ArenaType
  bouncers: number
  mine?: SkillLoadout
  theirs?: SkillLoadout
}

interface Env {
  /** Match seed; undefined = campaign (unseeded) path. */
  seed?: number
  /** Math.random stream for this page. */
  mathSeed: number
  /** Wall clock minus frame clock at match start, and its drift per frame. */
  wallOffset: number
  wallDrift: number
}

interface Run {
  spawn: string
  bouncers: string
  hashes: string[]
  events: string[]
  result: string | null
  hp: string
  skillEvents: number
  traitEvents: number
}

const PLAYER = [cfg('star', 'speedy', 26), cfg('round', 'tanky', 26)]

/** One league-shaped battle with scripted launches (plan keyed by frame). */
const runBattle = async (b: Battle, env: Env, maxFrames = 60 * 60 * 5): Promise<Run> => {
  // A fresh profile: the first-turn bias reads the previous match's result.
  localStorage.clear()
  const { game } = await loadPage()
  rs = env.mathSeed
  frameClock = 1000
  wallSkew = 0
  wallDriftPerFrame = 0
  const enc = await import('@/data/bossEncounters')
  const enemy = typeof b.enemy === 'string' ? enc.buildBossEncounterStage(b.enemy).enemyTeam.map(toCfg) : b.enemy
  const e = game.useSpinnerGame()
  e.initGame(b.player, enemy, false, b.arena, b.bouncers, false, undefined, null, 'circle',
    { ...(env.seed !== undefined ? { seed: env.seed } : {}), skillLoadout: b.mine, enemySkillLoadout: b.theirs })
  const spawn = e.allBlades.value.map(x => `${x.syncKey}:${x.x.toFixed(6)},${x.y.toFixed(6)}`).join('|')
  const bouncers = e.bouncers().map(x => `${x.x.toFixed(6)},${x.y.toFixed(6)}`).join('|')
  e.startMatch()
  // The accumulator baselined on the wall clock inside startMatch; from here
  // the wall clock jumps and drifts away from the frame clock.
  wallSkew = env.wallOffset
  wallDriftPerFrame = env.wallDrift

  let ps = 0x5ca1ab1e
  const plan = () => {
    ps = (Math.imul(ps, 1664525) + 1013904223) >>> 0
    return ps / 4294967296
  }
  const maxPull = game.MAX_PULL_DISTANCE
  const hashes: string[] = []
  const events: string[] = []
  let skillSeq = 0
  let traitSeq = 0
  let skillEvents = 0
  let traitEvents = 0
  let last = e.phase.value
  let launchAt: number | null = null
  for (let f = 0; f < maxFrames; f++) {
    frame()
    skillSeq = e.forEachSkillEvent(skillSeq, ev => {
      skillEvents++
      events.push(`s:${ev.kind}:${ev.syncKey}:${ev.t}`)
    })
    traitSeq = e.forEachBossTraitEvent(traitSeq, ev => {
      traitEvents++
      events.push(`t:${ev.kind}`)
    })
    const p = e.phase.value
    if (p !== last) {
      if (p === 'player_turn' || p === 'npc_turn' || p === 'game_over') hashes.push(`${p}:${e.computeStateHash()}`)
      last = p
    }
    if (p === 'game_over') break
    if (p !== 'player_turn') {
      launchAt = null
      continue
    }
    if (launchAt === null) launchAt = f + 3 + Math.floor(plan() * 30)
    if (f < launchAt) continue
    const mine = e.playerBlades.value.filter(x => e.isBladePickable(x))
    const theirs = e.npcBlades.value.filter(x => x.hp > 0)
    if (mine.length && theirs.length) {
      const me = mine[Math.floor(plan() * mine.length)]!
      const t = theirs[Math.floor(plan() * theirs.length)]!
      const ang = Math.atan2(t.y - me.y, t.x - me.x) + (plan() - 0.5) * 0.6
      const pull = (0.45 + plan() * 0.5) * maxPull
      e.beginDrag(me.x, me.y)
      e.updateDrag(me.x - Math.cos(ang) * pull, me.y - Math.sin(ang) * pull)
      e.releaseDrag()
    }
    launchAt = null
  }
  const hp = [...e.allBlades.value].sort((p, q) => p.syncKey - q.syncKey)
    .map(x => `${x.syncKey}:${x.hp.toFixed(6)}`).join('|')
  e.disposePhysics()
  return { spawn, bouncers, hashes, events, result: e.gameResult.value, hp, skillEvents, traitEvents }
}

// Page A and page B: different Math.random, different wall clock behaviour.
const PAGE_A = { mathSeed: 11, wallOffset: 0, wallDrift: 0 }
const PAGE_B = { mathSeed: 987_654_321, wallOffset: 4_000_000, wallDrift: 23 }

const BATTLES: Record<string, Battle> = {
  // Ember Nova + skills on both sides.
  cinder: {
    player: PLAYER, enemy: 'cinder_tyrant', arena: 'boss', bouncers: 0,
    mine: L('guard_shell', 'homing_rockets'), theirs: L('static_charge', 'phase_step')
  },
  // Three trait carriers (ember / frost / chill), partners, skills both sides, bouncers.
  court: {
    player: PLAYER, enemy: 'elemental_court', arena: 'boss', bouncers: 2,
    mine: L('hazard_ward', 'momentum'), theirs: L('mirror_plate', 'lucky_edge')
  },
  // Split boss: split-child jitter + shard chill.
  glacier: {
    player: PLAYER, enemy: 'shattering_glacier', arena: 'boss', bouncers: 1,
    mine: L('opening_salvo', 'second_wind'), theirs: L('guard_shell', 'static_charge')
  },
  // Ghost-build shape: 4 AI blades (grid jitter, AI picks), 3 bouncers, forest arena.
  ghost: {
    player: [cfg('star', 'tanky', 12), cfg('round', 'speedy', 12)],
    enemy: [cfg('triangle', 'tanky', 11), cfg('piercer', 'balanced', 11), cfg('star', 'speedy', 11), cfg('round', 'tanky', 11)],
    arena: 'forest', bouncers: 3,
    mine: L('guard_shell', 'static_charge'), theirs: L('homing_rockets', 'phase_step')
  }
}

describe('league determinism — a seeded battle is a function of its seed', () => {
  for (const [name, battle] of Object.entries(BATTLES)) {
    it(`${name}: same seed + same launches → identical run on two different pages`, async () => {
      const a = await runBattle(battle, { seed: 0x1ea9e, ...PAGE_A })
      const b = await runBattle(battle, { seed: 0x1ea9e, ...PAGE_B })
      expect(b.spawn).toBe(a.spawn)
      expect(b.bouncers).toBe(a.bouncers)
      expect(b.hashes).toEqual(a.hashes)
      expect(b.events).toEqual(a.events)
      expect(b.hp).toBe(a.hp)
      expect(b.result).toBe(a.result)
      // The battle actually happened, with skills (and traits) in play.
      expect(a.result).not.toBeNull()
      expect(a.hashes.length).toBeGreaterThanOrEqual(4)
      expect(a.skillEvents).toBeGreaterThan(0)
      if (typeof battle.enemy === 'string') expect(a.traitEvents).toBeGreaterThan(0)
    }, 60_000)
  }

  it('different seeds diverge (spawn, bouncers, hash sequence)', async () => {
    const a = await runBattle(BATTLES.ghost!, { seed: 101, ...PAGE_A })
    const b = await runBattle(BATTLES.ghost!, { seed: 202, ...PAGE_A })
    expect(b.spawn).not.toBe(a.spawn)
    expect(b.bouncers).not.toBe(a.bouncers)
    expect(b.hashes).not.toEqual(a.hashes)
  }, 60_000)

  it('aux rolls never touch matchRng: the match stream after initGame ignores roster size and bouncers', async () => {
    const nextAfterInit = async (enemy: SpinnerConfig[], bouncers: number, seed?: number): Promise<number> => {
      const { game, rng } = await loadPage()
      const e = game.useSpinnerGame()
      if (seed === undefined) rng.seedMatchRng(0xabc) // unseeded: pin the random reseed below
      vi.spyOn(Math, 'random').mockImplementation(() => 0.5)
      e.initGame(PLAYER, enemy, false, 'forest', bouncers, false, undefined, null, 'circle',
        seed !== undefined ? { seed } : {})
      const next = rng.matchRng()
      e.disposePhysics()
      return next
    }
    const four = BATTLES.ghost!.enemy as SpinnerConfig[]
    const one = [four[0]!]
    // Seeded: 4 AI blades + 3 bouncers make many aux draws, 1 blade + 0 none.
    expect(await nextAfterInit(four, 3, 7)).toBe(await nextAfterInit(one, 0, 7))
    // Unseeded: the same holds for the Math.random rolls.
    expect(await nextAfterInit(four, 3)).toBe(await nextAfterInit(one, 0))
  })

  it('unseeded (campaign) battles keep Math.random for spawn jitter, bouncers and AI', async () => {
    const a = await runBattle(BATTLES.ghost!, { ...PAGE_A })
    const b = await runBattle(BATTLES.ghost!, { ...PAGE_A })
    const c = await runBattle(BATTLES.ghost!, { ...PAGE_A, mathSeed: 4242 })
    // Spawn jitter + bouncers follow Math.random (the match itself is not
    // reproducible: VFX rolls interleave with the AI's on the same stream).
    expect(b.spawn).toBe(a.spawn)
    expect(b.bouncers).toBe(a.bouncers)
    expect(c.spawn).not.toBe(a.spawn)
    expect(c.bouncers).not.toBe(a.bouncers)
  }, 60_000)
})

// ─── Source guard: every Math.random in the engine is a reviewed VFX roll ───
describe('league determinism — no unreviewed Math.random in useSpinnerGame', () => {
  const SRC = readFileSync(resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
  const lines = SRC.split('\n')

  it('every Math.random() is marked // vfx-rng (except the unseeded gameplayRand fallback)', () => {
    const offenders = lines
      .map((text, i) => ({ text: text.trim(), at: i + 1 }))
      .filter(l => /Math\.random\s*\(/.test(l.text) && !l.text.includes('// vfx-rng'))
      .filter(l => !l.text.includes('// gameplay-rng fallback'))
      .map(l => `useSpinnerGame.ts:${l.at}  ${l.text}`)
    expect(offenders).toEqual([])
  })

  it('exactly one gameplay-rng fallback, inside gameplayRand', () => {
    const fallback = lines.filter(l => l.includes('// gameplay-rng fallback'))
    expect(fallback).toHaveLength(1)
    const at = SRC.indexOf('const gameplayRand = ')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(SRC.slice(at, SRC.indexOf('\n', SRC.indexOf('\n', at) + 1))).toContain('// gameplay-rng fallback')
  })

  it('spawn, bouncer, NPC AI and split-child rolls go through gameplayRand', () => {
    const body = (name: string): string => {
      const start = SRC.indexOf(`const ${name} = (`)
      expect(start, `${name} not found — guard must follow a rename`).toBeGreaterThanOrEqual(0)
      const open = SRC.indexOf('=> {', start) + 3
      let depth = 0
      let i = open
      for (; i < SRC.length; i++) {
        if (SRC[i] === '{') depth++
        else if (SRC[i] === '}' && --depth === 0) break
      }
      return SRC.slice(start, i + 1)
    }
    for (const name of ['initGame', 'launchNpc', 'spawnSplitChildren']) {
      const b = body(name)
      expect(b, name).not.toMatch(/Math\.random\s*\(/)
      expect(b, name).toContain('gameplayRand()')
    }
  })
})
