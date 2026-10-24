// ─── Ring meteor shower (ui-catalog.md §7.2, default variant) ──────────────
//
// Chaos-arena-style burst out of a centre ring, in the toy-box language.
// Presentation only: fixed pool, flat allocation-free batched drawing, whole
// pixel shake, done inside the unchanged 1600 ms intro (1200 ms PvP), no
// Math.random and no match RNG, landings off the trees, themed palettes.
// The kept strike variant stays tested in tests/meteorShower.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  createRingShower, spawnRingShowerFx, tickRingShower, ringClock, ringShake,
  drawRingGround, drawRingSky, drawRingScreen, resolveMeteorVariant, ringMeteorCount,
  MAX_RING_METEORS, RING_IMPACT_Y_MAX, RING_PALETTES, RING_TICK_MS
} from '@/use/ringShower'
import { ARENA_THEME_IDS } from '@/use/arenaThemes'
import { seedMatchRng, matchRng } from '@/use/useDeterministicRng'

const MOD = readFileSync(resolve(__dirname, '../src/use/ringShower.ts'), 'utf8')
const ENGINE = readFileSync(resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
const R = 200

const body = (src: string, name: string): string => {
  const start = src.indexOf(`const ${name} = (`)
  expect(start, `${name} not found — guard must follow a rename`).toBeGreaterThanOrEqual(0)
  const open = src.indexOf('=> {', start) + 3
  let depth = 0
  let i = open
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) break
  }
  return src.slice(start, i + 1)
}

const mockCtx = () => {
  const calls: Record<string, number> = {}
  const target: Record<string, unknown> = { canvas: { width: 1170, height: 2532 } }
  const ctx = new Proxy(target, {
    get (t, k: string) {
      if (k in t) return t[k]
      return (..._a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1 }
    },
    set (t, k: string, v) { t[k] = v; return true }
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('ring shower — variant switch', () => {
  it('ring is the default; ?meteor=strike brings back the kept strike variant', () => {
    expect(resolveMeteorVariant('')).toBe('ring')
    expect(resolveMeteorVariant('?stage=3')).toBe('ring')
    expect(resolveMeteorVariant('?meteor=strike')).toBe('strike')
    expect(resolveMeteorVariant('?a=1&meteor=strike&b=2')).toBe('strike')
    const spawn = body(ENGINE, 'spawnMeteorShower')
    expect(spawn).toMatch(/METEOR_VARIANT === 'strike'/)
    expect(spawn).toContain('spawnRingShowerFx(')
    expect(spawn).toContain('spawnMeteorShowerFx(')
  })
})

describe('ring shower — pool, timeline, geometry', () => {
  it('fixed pool, never reallocated; low tier halves the meteors', () => {
    const s = createRingShower()
    const meteors = s.meteors
    const first = s.meteors[0]
    const sparks = s.sparks
    for (const kind of ['intro', 'celebrate'] as const) {
      for (const low of [false, true]) {
        spawnRingShowerFx(s, kind, 1600, R, 'meadow', low, false, 0)
        expect(s.count).toBe(ringMeteorCount(kind, low))
        expect(s.count).toBeLessThanOrEqual(MAX_RING_METEORS)
      }
    }
    expect(ringMeteorCount('intro', true)).toBeLessThanOrEqual(ringMeteorCount('intro', false) / 2)
    expect(s.meteors).toBe(meteors)
    expect(s.meteors[0]).toBe(first)
    expect(s.sparks).toBe(sparks)
  })

  it('bursts OUT of the centre ring and is done inside the intro span (1600 / PvP 1200)', () => {
    for (const span of [1600, 1200]) {
      for (let rep = 0; rep < 20; rep++) {
        const s = createRingShower()
        spawnRingShowerFx(s, 'intro', span, R, 'snowy', rep % 2 === 1, false, 0)
        let fliers = 0
        let landers = 0
        for (let i = 0; i < s.count; i++) {
          const m = s.meteors[i]!
          expect(m.launch).toBeGreaterThanOrEqual(0)
          expect(m.launch + m.flight).toBeLessThanOrEqual(span - 150 + 1e-9)
          expect(m.d0).toBeCloseTo(s.ringR)
          expect(m.d1).toBeGreaterThan(m.d0)
          expect(Math.hypot(m.ux, m.uy)).toBeCloseTo(1)
          if (m.lands) {
            landers++
            // impacts stay on the floor, clear of the trees and their gauges
            expect(Math.abs(m.uy * m.d1)).toBeLessThanOrEqual(R * RING_IMPACT_Y_MAX + 1e-9)
            expect(m.d1).toBeLessThan(R * 0.85)
          } else fliers++
        }
        expect(landers).toBeGreaterThan(0)
        expect(fliers).toBeGreaterThan(0)
      }
    }
  })

  it('directions cover the whole ring (even angles, chaos-arena style)', () => {
    const s = createRingShower()
    spawnRingShowerFx(s, 'intro', 1600, R, 'meadow', false, false, 0)
    const bins = new Set<number>()
    for (let i = 0; i < s.count; i++) {
      const a = Math.atan2(s.meteors[i]!.uy, s.meteors[i]!.ux)
      bins.add(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 8)
    }
    expect(bins.size).toBe(8)
  })

  it('16 ms ticks, ends by itself, render clock at most one tick ahead', () => {
    const s = createRingShower()
    spawnRingShowerFx(s, 'intro', 1600, R, 'ruins', false, false, 0)
    expect(RING_TICK_MS).toBe(16)
    let ticks = 0
    while (s.active && ticks < 1000) { tickRingShower(s, ticks * 16); ticks++ }
    expect(s.active).toBe(false)
    expect(ticks * 16).toBeGreaterThanOrEqual(1600)
    expect(ticks * 16).toBeLessThan(1600 + 800)
    expect(ringClock(s, 1e9)).toBe(s.clock + RING_TICK_MS)
  })

  it('engine hand-off unchanged', () => {
    expect(ENGINE).toContain('meteorIntroTimer += 16')
    expect(ENGINE).toContain('if (meteorIntroTimer >= 1600) {')
    expect(body(ENGINE, 'startMatch')).toContain("spawnMeteorShower('intro', METEOR_INTRO_MS)")
    expect(ENGINE).toContain("spawnMeteorShower('intro', 1200)")
  })
})

describe('ring shower — theme palettes', () => {
  it('every arena theme has a palette of constant hex colours (no magenta key colour)', () => {
    for (const th of ARENA_THEME_IDS) {
      const p = RING_PALETTES[th]
      expect(p, th).toBeTruthy()
      for (const c of [p.out, p.mid, p.core, p.rock, p.rockHi, p.accent]) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/)
        expect(c.toLowerCase()).not.toBe('#ff00ff')
      }
    }
    expect(RING_PALETTES.snowy.family).toBe('ice')
    expect(RING_PALETTES.bedroom.family).toBe('candy')
    expect(RING_PALETTES.volcanic.family).toBe('fire')
  })
  it('the spawn picks the current theme palette', () => {
    const s = createRingShower()
    spawnRingShowerFx(s, 'intro', 1600, R, 'snowy', false, false, 0)
    expect(s.pal).toBe(RING_PALETTES.snowy)
  })
})

describe('ring shower — shake', () => {
  it('whole device pixels, bounded, off for reduced motion / celebrate', () => {
    const s = createRingShower()
    spawnRingShowerFx(s, 'intro', 1600, R, 'meadow', false, false, 0)
    let moved = 0
    for (let t = 0; t < 2600; t += 4) {
      const k = ringShake(s, t)
      expect(Number.isInteger(k.x) && Number.isInteger(k.y)).toBe(true)
      expect(Math.abs(k.x)).toBeLessThanOrEqual(5)
      expect(Math.abs(k.y)).toBeLessThanOrEqual(5)
      if (k.x !== 0 || k.y !== 0) moved++
    }
    expect(moved).toBeGreaterThan(0)
    expect(ringShake(s, 0)).toBe(s.shake)
    const cases: Array<['intro' | 'celebrate', boolean]> = [['intro', true], ['celebrate', false]]
    for (const [kind, still] of cases) {
      spawnRingShowerFx(s, kind, 1600, R, 'meadow', false, still, 0)
      for (let t = 0; t < 2600; t += 4) {
        const k = ringShake(s, t)
        expect(k.x === 0 && k.y === 0).toBe(true)
      }
    }
  })
})

describe('ring shower — flat, batched, allocation-free drawing', () => {
  const DRAW_FNS = ['drawRingGround', 'drawRingSky', 'drawRingScreen', 'ringShake', 'flamePath', 'starPath', 'headAt', 'drawSprite', 'spriteFits', 'ringScale', 'tickRingShower']
  for (const name of DRAW_FNS) {
    it(`${name}: no glow / gradient / blur / filter, no per-frame allocation`, () => {
      const b = body(MOD, name)
      expect(b).not.toMatch(/createRadialGradient|createLinearGradient|shadowBlur|ctx\.filter|getTransform/)
      expect(b).not.toContain('`')
      expect(b).not.toMatch(/setLineDash\(\[/)
      expect(b).not.toMatch(/\bnew\s+[A-Z]|=\s*\[|=\s*\{/)
    })
  }

  it('draws every phase on every theme / tier with a bounded number of paint ops', () => {
    for (const th of ARENA_THEME_IDS) {
      for (const low of [false, true]) {
        const s = createRingShower()
        spawnRingShowerFx(s, 'intro', 1600, R, th, low, false, 0)
        let peak = 0
        for (let t = 0; t < 2600; t += 16) {
          const { ctx, calls } = mockCtx()
          drawRingGround(ctx, s, t)
          drawRingSky(ctx, s, t, 2.2)
          drawRingScreen(ctx, s, t, 390, 844)
          const paints = (calls.fill ?? 0) + (calls.stroke ?? 0) + (calls.fillRect ?? 0) + (calls.drawImage ?? 0)
          peak = Math.max(peak, paints)
        }
        expect(peak).toBeGreaterThan(5)
        // one path per colour layer across all meteors (the strike peaked at ~25)
        expect(peak).toBeLessThanOrEqual(25)
      }
    }
  })
})

describe('ring shower — determinism untouched', () => {
  it('no Math.random, no match RNG', () => {
    expect(MOD).not.toMatch(/Math\.random/)
    expect(MOD).not.toMatch(/useDeterministicRng|matchRng|gameplayRand|createRng/)
    seedMatchRng(99)
    const ref = [matchRng(), matchRng(), matchRng()]
    seedMatchRng(99)
    const s = createRingShower()
    spawnRingShowerFx(s, 'intro', 1600, R, 'meadow', false, false, 0)
    for (let i = 0; i < 200; i++) tickRingShower(s, i * 16)
    expect([matchRng(), matchRng(), matchRng()]).toEqual(ref)
  })
})
