import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAINTED_BOSS_FRAME } from '@/use/paintedBossFrame'
import { bossFrameArt, bossFrameArtAllowed, layoutBossFrame, PAINTED_FRAME_SCALE } from '@/use/bossFrameArt'

const sample = { file: 'frame_600x640.webp', w: 600, h: 640, aspect: 0.9375, holeX: 0.5, holeY: 0.55, holeD: 0.5, v: 'x' }

describe('painted boss frame', () => {
  it('passes the measured opening straight into the badge geometry', () => {
    const v = layoutBossFrame(sample)
    expect(v['--hole-x']).toBe('0.5')
    expect(v['--hole-y']).toBe('0.55')
    expect(v['--hole-d']).toBe('0.5')
    expect(v['--frame-aspect']).toBe('0.9375')
    expect(Number(v['--frame-scale'])).toBe(PAINTED_FRAME_SCALE)
  })

  it('falls back to the CSS ring in node / jsdom and with no painting', () => {
    expect(bossFrameArtAllowed()).toBe(false)
    expect(bossFrameArt(null)).toBeNull()
    expect(bossFrameArt(sample)).toBeNull()
  })

  it('registry file exists, the hole sits inside the box, never above 3x of the biggest frame', () => {
    const p = PAINTED_BOSS_FRAME
    if (!p) return
    expect(existsSync(join(process.cwd(), 'public', 'images', 'boss-frame', p.file))).toBe(true)
    expect(p.file).toBe(`frame_${p.w}x${p.h}.webp`)
    expect(p.w).toBeLessThanOrEqual(Math.ceil(12 * 16 * PAINTED_FRAME_SCALE * 3))
    expect(p.holeD).toBeGreaterThan(0.25)
    expect(p.holeX - p.holeD / 2).toBeGreaterThan(0)
    expect(p.holeX + p.holeD / 2).toBeLessThan(1)
    const r = p.holeD / 2 * p.aspect // radius as a fraction of the box height
    expect(p.holeY - r).toBeGreaterThan(0)
    expect(p.holeY + r).toBeLessThan(1)
  })

  it('BossPeekBadge keeps the CSS ring as the v-else fallback of the painted frame', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'atoms', 'BossPeekBadge.vue'), 'utf-8')
    expect(src).toMatch(/img\.boss-peek__frame-art\.pointer-events-none\(\s*v-if="frameArt"/)
    expect(src).toMatch(/div\.boss-peek__frame\.pointer-events-none\(v-else/)
    expect(src).toContain('bossFrameArt()')
  })
})
