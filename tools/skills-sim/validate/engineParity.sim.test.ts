// ─── skills-sim ↔ real engine parity worker (opt-in: SKILLS_SIM_PARITY=<jobs.json>) ──
//
// The game side of tools/skills-sim/validate.mjs (run that, not this file:
// it writes the job list, shards it over ≤ 10 vitest processes and compares the
// merged results with the sim). Every battle runs on the real headless engine
// (src/use/useSpinnerGame.ts, skills + boss traits on, seeded) with the same
// scripted player as tests/balance.sim.test.ts, on the sim's battlefield: the
// stage's own arena and power-ups, NO terrain and NO team towers
// (the sim has neither). Output per battle: result + both teams' HP left.
//
// Env: SKILLS_SIM_PARITY (jobs JSON: [{ key, player: SpinnerConfig[], stage, seed }]),
// PARITY_SHARD "i/n", PARITY_OUT (JSON path).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { installSkillPort } from '../../../tests/helpers/skillsBuild'
import { installBossPort } from '../../../tests/helpers/bosses100Build'
import type { SpinnerConfig } from '@/types/spinner'

const JOBS = process.env.SKILLS_SIM_PARITY

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

let game: GameModule | null = null
const load = async (): Promise<GameModule> => {
  if (game) return game
  vi.resetModules()
  await import('@/use/useUser')
  game = await import('@/use/useSpinnerGame')
  await installSkillPort()
  await installBossPort()
  return game
}

interface Job { key: string; player: SpinnerConfig[]; stage: number; seed: number }
interface Row { key: string; seed: number; r: number; pHp: number; nHp: number }

const hpFrac = (blades: { hp: number; maxHp: number }[]): number => {
  let hp = 0
  let max = 0
  for (const b of blades) {
    hp += Math.max(0, b.hp)
    max += b.maxHp
  }
  return max > 0 ? hp / max : 0
}

const battle = async (job: Job): Promise<Row> => {
  localStorage.clear()
  const g = await load()
  const { getStageById } = await import('@/use/useSpinnerCampaign')
  const { stageEnemyConfigs } = await import('@/use/stageBladeConfig')
  const st = getStageById(job.stage)
  const { seed } = job
  rs = seed * 7919 + 1
  const e = g.useSpinnerGame()
  e.initGame(job.player.map(c => ({ ...c })), stageEnemyConfigs(st), false, (st.arenaType ?? 'default') as never, job.stage >= 2, undefined, null, 'circle', {
    seed,
    skillLoadout: [],
    enemySkillLoadout: [],
    firstTurn: seed % 2 === 0 ? 'player' : 'opponent'
  })
  e.startMatch()
  // Scripted player = tests/balance.sim.test.ts battle() (engine.mjs policy 'scripted')
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
    if (mine.length && theirs.length) {
      const me = mine[Math.floor(plan() * mine.length)]!
      const t = theirs[Math.floor(plan() * theirs.length)]!
      const ang = Math.atan2(t.y - me.y, t.x - me.x) + (plan() - 0.5) * 0.5
      const pull = (0.55 + plan() * 0.45) * maxPull
      e.beginDrag(me.x, me.y)
      e.updateDrag(me.x - Math.cos(ang) * pull, me.y - Math.sin(ang) * pull)
      e.releaseDrag()
    }
    launchAt = null
  }
  const res = e.gameResult.value
  const row: Row = {
    key: job.key,
    seed,
    r: res === 'win' ? 1 : res === 'lose' ? 0 : 0.5,
    pHp: hpFrac(e.playerBlades.value),
    nHp: hpFrac(e.npcBlades.value)
  }
  e.disposePhysics()
  return row
}

describe.skipIf(!JOBS)('skills-sim engine parity', () => {
  it('runs the job shard', async () => {
    const [si, sn] = (process.env.PARITY_SHARD ?? '0/1').split('/').map(Number) as [number, number]
    const all = JSON.parse(readFileSync(JOBS!, 'utf8')) as Job[]
    const mine = all.filter((_, i) => i % sn === si)
    const rows: Row[] = []
    for (const j of mine) rows.push(await battle(j))
    if (process.env.PARITY_OUT) writeFileSync(process.env.PARITY_OUT, JSON.stringify(rows))
    expect(rows.length).toBe(mine.length)
  }, 24 * 3_600_000)
})
