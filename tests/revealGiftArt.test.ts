import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { layoutRevealGift } from '@/use/revealGiftArt'
import { PAINTED_REVEAL_GIFT } from '@/use/paintedRevealGift'

const pct = (v: string) => parseFloat(v)

describe('painted reveal gift', () => {
  it('fits lid + body inside the square gift button, lid resting on the body', () => {
    const v = layoutRevealGift({ lid: { file: 'l', w: 500, h: 300 }, box: { file: 'b', w: 460, h: 400 }, v: 'x' })
    const top = pct(v['--gift-lid-bottom']) + pct(v['--gift-lid-h'])
    expect(top).toBeLessThanOrEqual(100.01)
    expect(pct(v['--gift-lid-bottom'])).toBeLessThan(pct(v['--gift-box-h']))
    expect(pct(v['--gift-lid-w'])).toBeGreaterThan(pct(v['--gift-box-w']))
  })

  it('registry files exist and are never upscaled past 3x of a 176 px gift', () => {
    const g = PAINTED_REVEAL_GIFT
    if (!g) return
    for (const p of [g.lid, g.box]) {
      expect(existsSync(join(process.cwd(), 'public', 'images', 'reveal-gift', p.file))).toBe(true)
      expect(p.w).toBeLessThanOrEqual(528)
    }
  })
})
