import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAINTED_REWARD_MEDAL } from '@/use/paintedRewardMedal'
import { layoutRewardMedal, rewardMedalArt, rewardMedalArtAllowed } from '@/use/rewardMedalArt'
import { prompt } from '../tools/reward-medal-art/prompts.mjs'

const sample = { file: 'medal_1200x1200.webp', w: 1200, h: 1200, aspect: 1, holeX: 0.5, holeY: 0.5, holeD: 0.4, v: 'x' }

describe('painted reward medallion', () => {
  it('lays the hole exactly over the plate', () => {
    const v = layoutRewardMedal(sample)
    expect(v['--medal-w']).toBe('250.000%')
    expect(v['--medal-h']).toBe('250.000%')
    expect(v['--medal-x']).toBe('-75.000%')
    expect(v['--medal-y']).toBe('-75.000%')
    expect(v['--medal-ox']).toBe('50.000%')
  })

  it('off-centre hole: hole centre still lands on the plate centre', () => {
    const p = { ...sample, holeX: 0.48, holeY: 0.52, aspect: 0.9 }
    const v = layoutRewardMedal(p)
    const w = parseFloat(v['--medal-w']), h = parseFloat(v['--medal-h'])
    expect(parseFloat(v['--medal-x']) + p.holeX * w).toBeCloseTo(50, 2)
    expect(parseFloat(v['--medal-y']) + p.holeY * h).toBeCloseTo(50, 2)
  })

  it('falls back to the CSS star + ring in node / jsdom and with no painting', () => {
    expect(rewardMedalArtAllowed()).toBe(false)
    expect(rewardMedalArt(null)).toBeNull()
    expect(rewardMedalArt(sample)).toBeNull()
  })

  it('registry file exists, round hole inside the box, never above 3x of the biggest plate', () => {
    const p = PAINTED_REWARD_MEDAL
    if (!p) return
    expect(existsSync(join(process.cwd(), 'public', 'images', 'reward-medal', p.file))).toBe(true)
    expect(p.file).toBe(`medal_${p.w}x${p.h}.webp`)
    expect(p.w).toBeLessThanOrEqual(Math.ceil(11.5 * 16 * 3 / p.holeD))
    expect(p.holeD).toBeGreaterThan(0.2)
    expect(p.holeX - p.holeD / 2).toBeGreaterThan(0)
    expect(p.holeX + p.holeD / 2).toBeLessThan(1)
  })

  it('prompt: magenta ground AND hole, navy outline, flat — no stitches / glow / gradients', () => {
    const t = prompt()
    expect(t).toMatch(/#FF00FF/)
    expect(t).toMatch(/HOLE/)
    expect(t).toMatch(/navy/)
    expect(t).toMatch(/NO stitches/)
    expect(t).toMatch(/NO glow, NO blur/)
    expect(t).toMatch(/NO radial gradients/)
  })

  it('RewardRevealHost keeps the CSS star + ring as the fallback; skins keep their rarity star', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'organisms', 'RewardRevealHost.vue'), 'utf-8')
    expect(src).toMatch(/img\.reveal__medal\(v-if="medalFor\(it\)"/)
    expect(src).toMatch(/template\(v-else\)\s*\n\s*span\.reveal__star/)
    expect(src).toContain("it.kind !== 'skin' && it.kind !== 'smasher'")
  })
})
