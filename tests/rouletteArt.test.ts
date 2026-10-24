// Toy-box roulette repaint (tools/roulette-art) — the generated registry, the
// rim-opening re-registration, the pointer box, the prompt contract and the
// CSS / SVG fallback when a part is not painted.

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAINTED_ROULETTE } from '@/use/paintedRoulette'
import { paintedPointer, paintedRimOpen, rouletteArtSrc, rouletteGeo } from '@/use/useRouletteArt'
// @ts-expect-error — plain .mjs tool module, no types
import { JOBS } from '../tools/roulette-art/prompts.mjs'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

describe('roulette repaint registry (tools/roulette-art/pack.mjs output)', () => {
  it('points every painted part at a webp that exists, ≤ the 3× size of the 300 px wheel, with a hash', () => {
    const max: Record<string, number> = { rim: 900, pointer: 216, hub: 189, bulbOff: 48, bulbOn: 48 }
    for (const [k, p] of Object.entries(PAINTED_ROULETTE)) {
      expect(p.file, k).toMatch(new RegExp(`^painted-[a-z-]+_${p.w}x${p.h}\\.webp$`))
      expect(p.v, k).toMatch(/^[0-9a-f]{8}$/)
      expect(Math.max(p.w, p.h), k).toBeLessThanOrEqual(max[k]!)
      const abs = path.join(ROOT, 'public/images/roulette', p.file)
      expect(existsSync(abs), p.file).toBe(true)
      expect(statSync(abs).size, p.file).toBeGreaterThan(200)
    }
  })

  it('a painted rim carries a measured opening inside the accepted band', () => {
    const rim = PAINTED_ROULETTE.rim
    if (!rim) return
    expect(rim.open).toBeGreaterThanOrEqual(0.3)
    expect(rim.open).toBeLessThanOrEqual(0.42)
    expect(Math.abs(rim.w / rim.h - 1)).toBeLessThanOrEqual(0.04)
  })

  it('lists exactly the painted parts (none of the old gold set), cache-keyed', () => {
    expect(Object.keys(rouletteArtSrc).sort()).toEqual(Object.keys(PAINTED_ROULETTE).sort())
    for (const [k, src] of Object.entries(rouletteArtSrc)) {
      const p = PAINTED_ROULETTE[k as keyof typeof PAINTED_ROULETTE]!
      expect(src).toContain(`images/roulette/${p.file}?v=${p.v}`)
    }
    for (const src of Object.values(rouletteArtSrc)) expect(src).not.toMatch(/rim_560x560|pointer_78x120|hub_128x128|bulb-o(n|ff)_40x40/)
  })
})

describe('rim geometry', () => {
  it('the CSS rim keeps the original registration', () => {
    expect(rouletteGeo(null)).toEqual({ disk: 0.372, bulbRing: 0.436 })
  })

  it('a painted rim tucks the face 0.012 under its lip and centres the bolts on its band', () => {
    expect(rouletteGeo(0.36)).toEqual({ disk: 0.372, bulbRing: 0.43 })
    const g = rouletteGeo(0.34)
    expect(g.disk).toBeCloseTo(0.352, 6)
    expect(g.bulbRing).toBeCloseTo(0.42, 6)
  })

  it('reads the painted opening only when the rim is painted', () => {
    expect(paintedRimOpen()).toBe(PAINTED_ROULETTE.rim ? PAINTED_ROULETTE.rim.open : null)
    const p = PAINTED_ROULETTE.pointer
    expect(paintedPointer()).toEqual(p ? { aspect: p.h / p.w, pivotY: p.pivotY } : null)
  })

  it('RouletteWheel registers GEO through rouletteGeo and keeps the CSS fallbacks', () => {
    const src = read('src/components/organisms/RouletteWheel.vue')
    expect(src).toContain('rouletteGeo(paintedRimOpen())')
    expect(src).toContain('div.wheel-rim-fallback(v-else')
    expect(src).toContain('span.bulb-fallback(v-else)')
    expect(src).toContain('svg.pointer-img(v-else')
  })
})

describe('roulette prompts', () => {
  it('are text-only, flat magenta, toy-box: navy outline, no metal / brown / stitches', () => {
    for (const [name, p] of Object.entries(JOBS as Record<string, string>)) {
      expect(p, name).toMatch(/#FF00FF/)
      expect(p, name).toMatch(/navy \(#161a40\)/)
      expect(p, name).toMatch(/NO brown/)
      expect(p, name).toMatch(/NO stitches/)
      expect(p, name).toMatch(/NO metal|NO gold metal/)
    }
    expect(JOBS['roulette-rim']).toMatch(/72% of the ring's outer diameter/)
  })
})
