// ─── The engine side of a random-search bot (`InitGameOptions.npcPlay`) ─────
//
// A real `useSpinnerGame` on a fake RAF + clock (the pvpDeterminism harness,
// single client). Pinned:
//   • a bot "thinks" a human-like, per-turn time before its launch (its
//     style's own stream), the campaign NPC still its 500 ms;
//   • one seed reproduces a bot match exactly (same first bot launch);
//   • the campaign NPC's first launch is unchanged by the hook existing (no
//     extra draws on the gameplay stream when no style is passed);
//   • a bot match ignores the 2× speed switch, like PvP;
//   • PvP drops any style (source pin — lockstep never runs the AI).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { installSkillPort } from './helpers/skillsBuild'
import { smasherConfig, SMASHER_IDS, type SmasherId } from '@/data/smasherCatalog'
import { botPlayStyle } from '@/use/pvpBots'
import type { SpinnerConfig } from '@/types/spinner'

type GameModule = typeof import('@/use/useSpinnerGame')
type Engine = ReturnType<GameModule['useSpinnerGame']>

const FRAME_MS = 17
let clock = 1000
const rafQueue = new Map<number, FrameRequestCallback>()
let rafId = 1

const loadEngine = async (): Promise<{ game: GameModule; engine: Engine }> => {
  vi.resetModules()
  await import('@/use/useUser')
  const game = await import('@/use/useSpinnerGame')
  await installSkillPort()
  return { game, engine: game.useSpinnerGame() }
}

const team = (a: number, b: number): SpinnerConfig[] => [
  smasherConfig(SMASHER_IDS[a] as SmasherId, 6),
  smasherConfig(SMASHER_IDS[b] as SmasherId, 6)
]

const frame = () => {
  clock += FRAME_MS
  vi.advanceTimersByTime(FRAME_MS)
  const batch = [...rafQueue.values()]
  rafQueue.clear()
  for (const cb of batch) cb(clock)
}

/** Run to the NPC's first launch; returns the think time (clock ms spent in
 *  npc_turn — the fixed 16 ms steps follow the clock) and the launcher's
 *  acceleration. */
const firstNpcLaunch = (engine: Engine) => {
  let turnStart = -1
  for (let i = 0; i < 60 * 40; i++) {
    frame()
    const p = engine.phase.value
    if (p === 'npc_turn' && turnStart < 0) turnStart = clock
    if (p === 'npc_launched') {
      // The launcher is the one NPC blade with a launch ramp on it.
      const b = engine.npcBlades.value.find(x => x.ax !== 0 || x.ay !== 0)!
      return { thinkMs: clock - turnStart, ax: b.ax, ay: b.ay, id: b.id }
    }
  }
  throw new Error(`NPC never launched (phase ${engine.phase.value})`)
}

const startSeeded = (engine: Engine, seed: number, npcPlay?: ReturnType<typeof botPlayStyle>) => {
  engine.initGame(team(0, 1), team(2, 3), false, 'default', false, undefined, null, 'circle', {
    seed,
    firstTurn: 'opponent',
    terrain: { layout: null, towers: false },
    ...(npcPlay ? { npcPlay } : {})
  })
  engine.startMatch()
}

beforeEach(() => {
  clock = 1000
  rafQueue.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('engine: random-search bot style', () => {
  it('the bot thinks its human-like time before the launch; the campaign NPC 500 ms', async () => {
    const seed = 0x5eed
    const { engine } = await loadEngine()
    const expected = botPlayStyle(0.5, seed).thinkMs() // the same stream's first draw
    startSeeded(engine, seed, botPlayStyle(0.5, seed))
    const bot = firstNpcLaunch(engine)
    expect(expected).toBeGreaterThanOrEqual(1200)
    // The think counter steps 16 per 60 Hz tick (16.67 ms), so the clock runs
    // ~4 % longer than the drawn value.
    expect(Math.abs(bot.thinkMs - expected * (1000 / 60) / 16)).toBeLessThanOrEqual(3 * FRAME_MS)
    engine.disposePhysics()

    const { engine: campaign } = await loadEngine()
    startSeeded(campaign, seed)
    const npc = firstNpcLaunch(campaign)
    expect(Math.abs(npc.thinkMs - 500 * (1000 / 60) / 16)).toBeLessThanOrEqual(3 * FRAME_MS)
    campaign.disposePhysics()
  })

  it('one seed reproduces the bot\'s launch exactly', async () => {
    const run = async () => {
      const { engine } = await loadEngine()
      startSeeded(engine, 777, botPlayStyle(0.3, 777))
      const r = firstNpcLaunch(engine)
      engine.disposePhysics()
      return r
    }
    const a = await run()
    const b = await run()
    expect(b).toEqual(a)
  })

  it('the campaign NPC launch is the same with the hook in place (no extra draws)', async () => {
    // Two campaign runs and a bot run on one seed: the campaign runs match
    // each other, and the bot's (looser aim) differs — the hook only acts
    // when a style is passed.
    const launch = async (style?: ReturnType<typeof botPlayStyle>) => {
      const { engine } = await loadEngine()
      startSeeded(engine, 4242, style)
      const r = firstNpcLaunch(engine)
      engine.disposePhysics()
      return { ax: r.ax, ay: r.ay }
    }
    const c1 = await launch()
    const c2 = await launch()
    expect(c2).toEqual(c1)
    const bot = await launch(botPlayStyle(0.1, 4242))
    expect(bot).not.toEqual(c1)
  })

  it('a bot match ignores the 2× speed switch, like PvP', () => {
    const src = readFileSync(path.resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
    expect(src).toMatch(/const subSteps = !simActive \? 0 : pvpMode\.value \|\| npcPlay \? 1 : simSpeed\.value/)
  })

  it('PvP drops any bot style (lockstep never runs the AI)', () => {
    const src = readFileSync(path.resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
    expect(src).toContain('npcPlay = !pvpMode.value ? (opts.npcPlay ?? null) : null')
    // The bot's extra draws come from its own stream, never the gameplay one.
    expect(src).toMatch(/npcPlay\.rand\(\) < npcPlay\.whiffChance/)
  })
})
