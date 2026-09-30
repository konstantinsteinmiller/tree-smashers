import { describe, it, expect } from 'vitest'
// Plain ESM tooling module (tools/preview-video is Node .mjs, no TypeScript).
import { planReel, reelFilterGraph, selectReels, TRANSITIONS } from '../tools/preview-video/lib/reel.mjs'
import previewConfig from '../tools/preview-video/preview.config.mjs'

const SCENES = [
  { id: 'lava', frames: 80, transition: 'flash' },
  { id: 'forest', frames: 80, transition: 'whipLeft' },
  { id: 'ice', frames: 80, transition: 'sweep' },
  { id: 'bear', frames: 80, transition: 'whipUp' },
  { id: 'piranha' }
]
const OPTS = { fps: 30, totalFrames: 360, transitionFrames: 8, sourceFrames: 84 }

describe('showreel timeline (tools/preview-video/lib/reel.mjs)', () => {
  it('lands on exactly 12 s — 360 frames — by fitting the last scene', () => {
    const plan = planReel(SCENES, OPTS)
    expect(plan.durationSec).toBe(12)
    expect(plan.scenes.at(-1)!.end).toBe(360)
    // 4 x 80 + last - 4 x 8 = 360  →  last = 72
    expect(plan.scenes.at(-1)!.frames).toBe(72)
  })

  it('overlaps each transition with the outgoing tail and the incoming head', () => {
    const plan = planReel(SCENES, OPTS)
    for (let i = 1; i < plan.scenes.length; i++) {
      const prev = plan.scenes[i - 1]!
      const cur = plan.scenes[i]!
      expect(cur.start).toBe(prev.end - 8)
      expect(prev.offsetSec).toBeCloseTo(cur.start / 30, 9)
    }
    expect(plan.scenes.at(-1)!.offsetSec).toBeNull()
    expect(plan.scenes.at(-1)!.transition).toBeNull()
  })

  it('puts every scene\'s mid frame inside its transition-free window', () => {
    const plan = planReel(SCENES, OPTS)
    for (const s of plan.scenes) {
      expect(s.midFrame).toBeGreaterThanOrEqual(s.clearFrom)
      expect(s.midFrame).toBeLessThan(s.clearTo)
      // ~2.1 s of every scene is on screen with nothing over it
      expect(s.clearTo - s.clearFrom).toBeGreaterThanOrEqual(56)
    }
  })

  it('refuses a plan that needs more source frames than a scene clip has', () => {
    expect(() => planReel([{ id: 'a', frames: 90, transition: 'flash' }, { id: 'b' }], OPTS)).toThrow(/source frames/)
  })

  it('builds one xfade per cut and blurs only the whip windows', () => {
    const plan = planReel(SCENES, OPTS)
    const { graph, out } = reelFilterGraph(plan, { width: 1080, height: 1920 })
    expect(graph.match(/xfade=/g)).toHaveLength(4)
    expect(graph).toContain(`transition=${TRANSITIONS.flash.xfade}`)
    expect(graph).toContain(`transition=${TRANSITIONS.sweep.xfade}`)
    expect(graph.match(/avgblur=/g)).toHaveLength(2)
    // horizontal smear for the left whip, vertical for the up whip
    expect(graph).toMatch(/avgblur=sizeX=\d+:sizeY=1/)
    expect(graph).toMatch(/avgblur=sizeX=1:sizeY=\d+/)
    expect(out).toBe('b1')
  })

  it('rejects an unknown transition name', () => {
    const plan = planReel([{ id: 'a', frames: 80, transition: 'spin' }, { id: 'b' }], { ...OPTS, totalFrames: 150 })
    expect(() => reelFilterGraph(plan, { width: 720, height: 1280 })).toThrow(/unknown transition/)
  })
})

// D16 — the Phantom Twin ending is the canonical showreel; the Piranha ending
// is an opt-in alternative (`pnpm preview:reel --piranha`).
describe('showreel config (preview.config.mjs formats.reel.reels)', () => {
  const reels = (previewConfig as any).formats.reel.reels

  it('the canonical `showreel` ends on the Phantom Twin and is always cut', () => {
    const { reels: picked, sceneIds } = selectReels(reels, [])
    expect(picked.map(([id]) => id)).toEqual(['showreel'])
    const scenes = picked[0]![1]
    expect(scenes.map((s: { id: string }) => s.id)).toEqual(['lava', 'forest', 'ice', 'bear', 'phantom'])
    // The Piranha scene is not even recorded on a default run.
    expect(sceneIds).not.toContain('piranha')
    expect(sceneIds).toEqual(['lava', 'forest', 'ice', 'bear', 'phantom'])
  })

  it('--piranha additionally cuts `showreel-piranha`, ending on the Piranha', () => {
    const { reels: picked, sceneIds } = selectReels(reels, ['--no-record', '--piranha'])
    expect(picked.map(([id]) => id)).toEqual(['showreel', 'showreel-piranha'])
    expect(picked[1]![1].at(-1).id).toBe('piranha')
    expect(sceneIds).toContain('piranha')
    expect(sceneIds).toContain('phantom')
  })

  it('every reel still lands on exactly 12 s and every scene has a recorder scenario', () => {
    const format = (previewConfig as any).formats.reel
    for (const [, r] of Object.entries<any>(reels)) {
      const plan = planReel(r.scenes, OPTS)
      expect(plan.durationSec).toBe(12)
      for (const s of r.scenes) {
        expect(format.scenarios[s.id]).toBeTruthy()
        expect(format.scenarioIds).toContain(s.id)
      }
    }
  })
})
