import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FRibbon from '@/components/atoms/FRibbon.vue'
import { PAINTED_RIBBONS } from '@/use/paintedRibbons'
import { layoutRibbon, REJECTED_PAINTINGS, resolveRibbonPainting, RIBBON_FACE_EM, RIBBON_FAMILY, ribbonArt } from '@/use/ribbonArt'

const em = (v: string) => parseFloat(v)
const sample = {
  l: { file: 'l.webp', w: 300 }, m: { file: 'm.webp', w: 8 }, r: { file: 'r.webp', w: 300 },
  h: 330, faceTop: 0.05, faceBot: 0.7, faceL: 0.4, faceR: 0.4, v: 'x'
}

describe('painted ribbon (3-slice)', () => {
  it('lays the 1.9 em face exactly over the painted face band', () => {
    const v = layoutRibbon(sample)
    const h = em(v['--rbp-h'])
    expect(h - em(v['--rbp-pt']) - em(v['--rbp-pb'])).toBeCloseTo(RIBBON_FACE_EM, 2)
    expect(em(v['--rbp-lw'])).toBeCloseTo(h * 300 / 330, 2)
    // The face starts inside the left end, never past it.
    expect(em(v['--rbp-pl'])).toBeLessThan(em(v['--rbp-lw']))
    expect(em(v['--rbp-pr'])).toBeLessThan(em(v['--rbp-rw']))
  })

  it('maps every tone to one of the four paintings', () => {
    for (const t of ['sun', 'leaf', 'berry', 'royal', 'sky', 'plum', 'ink'] as const) {
      expect(['sun', 'leaf', 'berry', 'royal']).toContain(RIBBON_FAMILY[t].family)
    }
  })

  it('registry slices exist, share a height, never exceed 3x of a 36 px banner', () => {
    for (const p of Object.values(PAINTED_RIBBONS)) {
      if (!p) continue
      for (const s of [p.l, p.m, p.r]) {
        expect(existsSync(join(process.cwd(), 'public', 'images', 'ribbon', s.file))).toBe(true)
        expect(s.file).toContain(`x${p.h}.webp`)
      }
      const hEm = RIBBON_FACE_EM / (p.faceBot - p.faceTop)
      expect(p.h).toBeLessThanOrEqual(Math.ceil(hEm * 36 * 3))
      expect(p.faceTop).toBeLessThan(p.faceBot)
      expect(p.faceL).toBeLessThan(p.l.w / p.h)
    }
  })

  it('falls back to the SVG ribbon in node/jsdom (no painted art)', () => {
    expect(ribbonArt('leaf')).toBeNull()
    const w = mount(FRibbon, { props: { tone: 'leaf' }, slots: { default: 'Victory' } })
    expect(w.find('.f-ribbon__art').exists()).toBe(false)
    expect(w.findAll('svg.f-ribbon__cap')).toHaveLength(2)
    expect(w.text()).toContain('Victory')
  })

  it('tails=false stays the CSS plate', () => {
    const w = mount(FRibbon, { props: { tone: 'sun', tails: false }, slots: { default: 'T' } })
    expect(w.find('svg').exists()).toBe(false)
    expect(w.find('.f-ribbon__art').exists()).toBe(false)
  })

  it('every tone wears an accepted painting whose tails hang BELOW the face', () => {
    for (const t of ['sun', 'leaf', 'berry', 'royal', 'sky', 'plum', 'ink'] as const) {
      const r = resolveRibbonPainting(t)
      expect(r, t).not.toBeNull()
      expect(REJECTED_PAINTINGS[r!.family]).not.toBe(r!.painting.v)
      // The face is the top of a correct painting (folded tails come out
      // lower); art above the face = tails centred on it (the rejected leaf).
      expect(r!.painting.faceTop, t).toBeLessThan(0.05)
      expect(r!.painting.faceBot, t).toBeLessThan(0.85)
    }
  })

  it('the rejected leaf painting is replaced by the sun one recoloured green', () => {
    const r = resolveRibbonPainting('leaf')!
    if (REJECTED_PAINTINGS.leaf === PAINTED_RIBBONS.leaf?.v) {
      expect(r.family).toBe('sun')
      expect(r.filter).toMatch(/hue-rotate/)
    } else {
      expect(r.family).toBe('leaf')
    }
  })
})
