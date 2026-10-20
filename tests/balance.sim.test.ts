// ─── Part-level balance sim (opt-in: BALANCE_SIM=1) ─────────────────────────
//
// The worker of scripts/balance-sim.mjs (run that, not this file directly —
// it shards the jobs over ≤ 10 vitest processes, merges the shards and writes
// balance-report.md). Every battle runs on the real headless engine with
// skills and boss traits on, seeded, so a rerun reproduces every number.
//
// Modes (BALANCE_MODE):
//   ref   every smasher (two copies) vs the reference team (two Hootsies, the
//         neutral 1/1/1/1 Quad Core + Balanced owl) at each level, both ways
//         round (scripted player and NPC AI), plain + tower arenas
//   rr1   1v1 round robin: every ordered smasher pair at each level
//   rr2   2v2 mixes: seeded random teams of four distinct smashers, both ways
//   camp  campaign: a representative player roster at the level the coin
//         economy gives it (see `campLevels`) vs each stage's enemy team
//
// Env: BALANCE_SHARD "i/n", BALANCE_OUT (JSON path), BALANCE_LEVELS
// ("5,15,30"), BALANCE_SEEDS (ref / camp seeds), BALANCE_RR2 (2v2 matches per
// level), BALANCE_STAGES ("1-100,110,120"), BALANCE_TUNING (JSON file applied
// over the smasher part tables before any battle — the tuning loop; the
// shipped values need none), BALANCE_LEGACY=1 (smashers read the legacy part
// tables, profile weight exponent 1, no NPC compensation: the "before" run
// for the part level — profile edits live in the catalog, so a true "before"
// of those needs the pre-pass catalog checked out).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { installSkillPort } from './helpers/skillsBuild'
import { installBossPort } from './helpers/bosses100Build'
import { SMASHER_LIST, smasherConfig, smasherLevelCost, type SmasherId } from '@/data/smasherCatalog'
import type { SpinnerConfig } from '@/types/spinner'

const ON = process.env.BALANCE_SIM === '1'
const MODE = process.env.BALANCE_MODE ?? 'ref'
const LEVELS = (process.env.BALANCE_LEVELS ?? '5,15,30').split(',').map(Number)
const SEEDS = Number(process.env.BALANCE_SEEDS ?? 6)
const RR2 = Number(process.env.BALANCE_RR2 ?? 120)
const RR1_SAMPLE = Number(process.env.BALANCE_RR1_SAMPLE ?? 0)
const IDS = SMASHER_LIST.map(s => s.id)
const REF: SmasherId = 'hootsie'

type GameModule = typeof import('@/use/useSpinnerGame')
const FRAME_MS = 17
let clock = 1000
const rafQueue = new Map<number, FrameRequestCallback>()
let rafId = 1
let rs = 1
const lcg = () => {
  rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0
  return rs / 4294967296
}

beforeEach(() => {
  clock = 1000
  rafQueue.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(Math, 'random').mockImplementation(lcg)
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
  clock += FRAME_MS
  vi.advanceTimersByTime(FRAME_MS)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(clock)
}

/** Overwrite the smasher part tables in place (same module instance the engine reads). */
const applyTuning = async () => {
  const cfg = await import('@/use/useSpinnerConfig')
  const camp = await import('@/use/useSpinnerCampaign')
  const tables: Record<string, Record<string, unknown>> = {
    top: cfg.SMASHER_TOP_PARTS,
    bottom: cfg.SMASHER_BOTTOM_PARTS,
    topUp: cfg.SMASHER_TOP_UPGRADE,
    bottomUp: cfg.SMASHER_BOTTOM_UPGRADE
  }
  if (process.env.BALANCE_LEGACY === '1') {
    for (const [k, v] of Object.entries(cfg.TOP_PARTS)) Object.assign(tables.top![k] as object, { damageMultiplier: v.damageMultiplier, defenseMultiplier: v.defenseMultiplier, healthBonus: v.healthBonus })
    for (const [k, v] of Object.entries(cfg.BOTTOM_PARTS)) Object.assign(tables.bottom![k] as object, { speedMultiplier: v.speedMultiplier, forceDecay: v.forceDecay, healthBonus: v.healthBonus, weight: v.weight })
    for (const [k, v] of Object.entries(camp.TOP_UPGRADE_BONUS)) Object.assign(tables.topUp![k] as object, v)
    for (const [k, v] of Object.entries(camp.BOTTOM_UPGRADE_BONUS)) Object.assign(tables.bottomUp![k] as object, v)
    cfg.SMASHER_TUNING.profileWeightExp = 1
    camp.CAMPAIGN_NPC_TUNING.hpCurve = []
    camp.CAMPAIGN_NPC_TUNING.dmgMul = 1
  }
  const path = process.env.BALANCE_TUNING
  if (!path) return
  const t = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, object> | number>
  for (const key of Object.keys(tables)) {
    const over = t[key]
    if (over && typeof over === 'object') for (const [id, v] of Object.entries(over)) Object.assign(tables[key]![id] as object, v)
  }
  if (typeof t.profileWeightExp === 'number') cfg.SMASHER_TUNING.profileWeightExp = t.profileWeightExp
  if (typeof t.npcHp === 'number') camp.CAMPAIGN_NPC_TUNING.hpCurve = [[0, t.npcHp]]
  if (Array.isArray(t.npcHpCurve)) camp.CAMPAIGN_NPC_TUNING.hpCurve = t.npcHpCurve
  if (typeof t.npcDmg === 'number') camp.CAMPAIGN_NPC_TUNING.dmgMul = t.npcDmg
}

let game: GameModule | null = null
const load = async (): Promise<GameModule> => {
  if (game) return game
  vi.resetModules()
  await import('@/use/useUser')
  game = await import('@/use/useSpinnerGame')
  await installSkillPort()
  await installBossPort()
  await applyTuning()
  return game
}

interface Fight {
  player: SpinnerConfig[]
  npc: SpinnerConfig[]
  seed: number
  terrain: boolean
  arena?: string
  bouncers?: number
  powerups?: boolean
  layout?: number
  towers?: boolean
}

/** 1 = the scripted player side won, 0 = lost, 0.5 = timeout. */
const battle = async (f: Fight): Promise<number> => {
  localStorage.clear()
  const g = await load()
  const { seed } = f
  rs = seed * 7919 + 1
  const e = g.useSpinnerGame()
  e.initGame(f.player.map(c => ({ ...c })), f.npc.map(c => ({ ...c })), false, (f.arena ?? 'default') as never, f.bouncers ?? 0, !!f.powerups, undefined, null, 'circle', {
    seed,
    skillLoadout: [],
    enemySkillLoadout: [],
    firstTurn: seed % 2 === 0 ? 'player' : 'opponent',
    ...(f.terrain ? { terrain: { layout: f.layout ?? seed % 12, towers: f.towers ?? true } } : {})
  })
  e.startMatch()
  let ps = (seed ^ 0x5ca1ab1e) >>> 0
  const plan = () => {
    ps = (Math.imul(ps, 1664525) + 1013904223) >>> 0
    return ps / 4294967296
  }
  const maxPull = g.MAX_PULL_DISTANCE
  let launchAt: number | null = null
  for (let fr = 0; fr < 60 * 60 * 4; fr++) {
    frame()
    const p = e.phase.value
    if (p === 'game_over') break
    if (p !== 'player_turn') {
      launchAt = null
      continue
    }
    if (launchAt === null) launchAt = fr + 3 + Math.floor(plan() * 20)
    if (fr < launchAt) continue
    const mine = e.playerBlades.value.filter(x => e.isBladePickable(x))
    const theirs = e.npcBlades.value.filter(x => x.hp > 0)
    const tower = e.towers().find(t => t.side === 'npc' && t.hp > 0)
    if (mine.length && (theirs.length || tower)) {
      const me = mine[Math.floor(plan() * mine.length)]!
      const t: { x: number; y: number } = tower && (plan() < 0.2 || !theirs.length) ? tower : theirs[Math.floor(plan() * theirs.length)]!
      const ang = Math.atan2(t.y - me.y, t.x - me.x) + (plan() - 0.5) * 0.5
      const pull = (0.55 + plan() * 0.45) * maxPull
      e.beginDrag(me.x, me.y)
      e.updateDrag(me.x - Math.cos(ang) * pull, me.y - Math.sin(ang) * pull)
      e.releaseDrag()
    }
    launchAt = null
  }
  const r = e.gameResult.value
  e.disposePhysics()
  return r === 'win' ? 1 : r === 'lose' ? 0 : 0.5
}

// ─── Campaign player model ──────────────────────────────────────────────────
// Coins a "typical" player has banked when reaching stage s (the income model
// of tools/skills-sim/econ.mjs: every win, 0.2 losses per early stage / 0.6
// later, 0.8 / 1.5 per boss, boss roulette EV ×1.141, one rewarded ad and one
// big chest per three stages, daily rewards at 6 stages a day), spent evenly
// on the two fielded smashers (cheapest level first).
const campLevels = async (stage: number): Promise<[number, number]> => {
  const { getStageById } = await import('@/use/useSpinnerCampaign')
  let coins = 0
  for (let i = 1; i < stage; i++) {
    const st = getStageById(i)
    const early = i < 15
    const losses = st.isBoss ? (early ? 0.8 : 1.5) : (early ? 0.2 : 0.6)
    coins += st.rewardWin * (st.isBoss ? 1.141 : 1) + losses * st.rewardLose
    if (i >= 3) coins += (Math.max(125, Math.round((3 * st.rewardLose) / 5) * 5) + Math.max(100, Math.round((3 * st.rewardLose) / 5) * 5)) / 3 + 1450 / 7 / 6
  }
  const lv: [number, number] = [1, 1]
  for (;;) {
    const k = lv[0] <= lv[1] ? 0 : 1
    const c = smasherLevelCost(lv[k])
    if (c === null || c > coins) break
    coins -= c
    lv[k]++
  }
  return lv
}

/** Campaign rosters: the default team, and a "collector" team that fields
 *  the two newest unlocked smashers. */
const ROSTERS: Record<string, (stage: number) => [SmasherId, SmasherId]> = {
  default: () => ['bramble', 'thumper'],
  newest: (stage) => {
    const un = SMASHER_LIST.filter(s => s.unlockStage <= Math.min(stage, 100)).map(s => s.id)
    return [un[un.length - 1]!, un[un.length - 2]!]
  }
}

const parseStages = (spec: string): number[] =>
  spec.split(',').flatMap(part => {
    const [a, b] = part.split('-').map(Number) as [number, number | undefined]
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i)
  })

// ─── Jobs ──────────────────────────────────────────────────────────────────

interface Job { key: Record<string, unknown>; fight: () => Promise<Fight> }

const team = (ids: SmasherId[], level: number) => ids.map(id => smasherConfig(id, level))

const jobs = (): Job[] => {
  const out: Job[] = []
  if (MODE === 'ref') {
    for (const L of LEVELS) for (const id of IDS) for (let s = 0; s < SEEDS; s++) {
      const terrain = s % 2 === 1
      const seed = 1000 + s + L * 100
      out.push({ key: { id, L, terrain, side: 'player' }, fight: async () => ({ player: team([id, id], L), npc: team([REF, REF], L), seed, terrain }) })
      out.push({ key: { id, L, terrain, side: 'npc' }, fight: async () => ({ player: team([REF, REF], L), npc: team([id, id], L), seed: seed + 5000, terrain }) })
    }
  } else if (MODE === 'rr1') {
    for (const L of LEVELS) IDS.forEach((a, i) => IDS.forEach((b, j) => {
      if (i === j) return
      // BALANCE_RR1_SAMPLE=k: only k opponents per smasher (a seeded subset, quick tuning loop).
      if (RR1_SAMPLE > 0 && ((i * 31 + j * 17 + L) % IDS.length) >= RR1_SAMPLE) return
      const seed = 20000 + i * 97 + j * 13 + L
      const terrain = (i + j + L) % 2 === 1
      out.push({ key: { a, b, L, terrain }, fight: async () => ({ player: team([a], L), npc: team([b], L), seed, terrain }) })
    }))
  } else if (MODE === 'rr2') {
    for (const L of LEVELS) {
      let h = 0x9e3779b9 ^ L
      const rnd = () => {
        h = (Math.imul(h, 1664525) + 1013904223) >>> 0
        return h / 4294967296
      }
      for (let m = 0; m < RR2; m++) {
        const pick: SmasherId[] = []
        while (pick.length < 4) {
          const id = IDS[Math.floor(rnd() * IDS.length)]!
          if (!pick.includes(id)) pick.push(id)
        }
        const A = pick.slice(0, 2)
        const B = pick.slice(2)
        const terrain = m % 2 === 1
        const seed = 40000 + m * 31 + L
        out.push({ key: { A, B, L, terrain }, fight: async () => ({ player: team(A, L), npc: team(B, L), seed, terrain }) })
        out.push({ key: { A: B, B: A, L, terrain }, fight: async () => ({ player: team(B, L), npc: team(A, L), seed: seed + 7, terrain }) })
      }
    }
  } else if (MODE === 'camp') {
    const stages = parseStages(process.env.BALANCE_STAGES ?? '1-100,110,120,130,140,150,160,170,180,190,200')
    const rosters = (process.env.BALANCE_ROSTERS ?? Object.keys(ROSTERS).join(',')).split(',')
    for (const roster of rosters) for (const stage of stages) for (let s = 0; s < SEEDS; s++) {
      out.push({
        key: { roster, stage },
        fight: async () => {
          const { getStageById, BASE_CAMPAIGN_LENGTH } = await import('@/use/useSpinnerCampaign')
          const { stageEnemyConfigs } = await import('@/use/stageBladeConfig')
          const { layoutForStage, TOWERS_FROM_STAGE } = await import('@/use/arenaTerrain')
          const st = getStageById(stage)
          const lv = await campLevels(stage)
          // Past the base campaign the roster keeps its stage-100 picks.
          const ids = ROSTERS[roster]!(Math.min(stage, BASE_CAMPAIGN_LENGTH))
          return {
            player: [smasherConfig(ids[0], lv[0]), smasherConfig(ids[1], lv[1])],
            npc: stageEnemyConfigs(st),
            seed: 60000 + stage * 17 + s,
            terrain: true,
            layout: layoutForStage(stage),
            arena: st.arenaType ?? 'default',
            bouncers: st.bouncers ?? 0,
            powerups: stage >= 2,
            towers: stage >= TOWERS_FROM_STAGE
          }
        }
      })
    }
  }
  return out
}

describe.skipIf(!ON)('balance sim', () => {
  it(`mode ${MODE}`, async () => {
    const [si, sn] = (process.env.BALANCE_SHARD ?? '0/1').split('/').map(Number) as [number, number]
    const all = jobs()
    const mine = all.filter((_, i) => i % sn === si)
    const rows: { key: Record<string, unknown>; r: number }[] = []
    const extra: Record<string, unknown> = {
      arche: Object.fromEntries(SMASHER_LIST.map(d => [d.id, `${d.archetype.top}/${d.archetype.bottom}`]))
    }
    if (MODE === 'camp' && si === 0) {
      const lv: Record<number, [number, number]> = {}
      for (const s of parseStages(process.env.BALANCE_STAGES ?? '1-100,110,120,130,140,150,160,170,180,190,200')) {
        lv[s] = await campLevels(s)
      }
      extra.levels = lv
    }
    for (const j of mine) rows.push({ key: j.key, r: await battle(await j.fight()) })
    if (process.env.BALANCE_OUT) writeFileSync(process.env.BALANCE_OUT, JSON.stringify({ mode: MODE, rows, ...extra }))
    expect(rows.length).toBe(mine.length)
  }, 24 * 3_600_000)
})
