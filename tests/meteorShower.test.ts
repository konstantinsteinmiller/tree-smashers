// ─── Meteor shower (ui-catalog.md §7.2) + idle aim hint (§7.1) ──────────────
//
// The pre-battle meteor strike is presentation only: a fixed pool (caps,
// no reallocation on respawn), allocation-free batched drawing (flat fills —
// no glow / gradient / blur / filter), whole-pixel camera shake, landings
// inside the engine's unchanged 1600 ms meteor_intro (1200 ms in PvP), and
// no contact with the match RNG (PvP / league determinism untouched).
// The idle hint must be drawn with the SAME kit as the active drag preview.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  createMeteorShower, spawnMeteorShowerFx, tickMeteorShower, meteorClock, meteorShake,
  drawMeteorGround, drawMeteorSky, drawMeteorScreen,
  MAX_METEORS, MAX_SPARKS, MAX_PUFFS, METEOR_INTRO_MS, METEOR_TICK_MS, IMPACT_Y_MAX
} from '@/use/meteorShower'
import { seedMatchRng, matchRng } from '@/use/useDeterministicRng'

const MOD = readFileSync(resolve(__dirname, '../src/use/meteorShower.ts'), 'utf8')
const ENGINE = readFileSync(resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')
const R = 200

/** Body of `const <name> = (...) => { ... }` in `src`, brace-matched. */
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

/** A 2D-context stand-in that counts every call (and every paint op). */
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

describe('meteor shower — pool and caps', () => {
  it('stays inside the fixed pool for every kind / tier, and never reallocates', () => {
    const s = createMeteorShower()
    const meteors = s.meteors
    const first = s.meteors[0]
    const sparks = s.sparks
    const puffs = s.puffs
    for (const kind of ['intro', 'celebrate'] as const) {
      for (const low of [false, true]) {
        spawnMeteorShowerFx(s, kind, METEOR_INTRO_MS, R, low, false, 0)
        expect(s.count).toBeGreaterThan(0)
        expect(s.count).toBeLessThanOrEqual(MAX_METEORS)
        for (let i = 0; i < s.count; i++) {
          expect(s.meteors[i]!.sparks).toBeLessThanOrEqual(MAX_SPARKS)
          expect(s.meteors[i]!.puffs).toBeLessThanOrEqual(MAX_PUFFS)
        }
        if (low) expect(s.count).toBeLessThanOrEqual(6)
      }
    }
    expect(s.meteors).toBe(meteors)
    expect(s.meteors[0]).toBe(first)
    expect(s.sparks).toBe(sparks)
    expect(s.puffs).toBe(puffs)
    expect(sparks.length).toBe(MAX_METEORS * MAX_SPARKS * 4)
    expect(puffs.length).toBe(MAX_METEORS * MAX_PUFFS * 3)
  })

  it('low tier: sparks only on the hero; celebrate has no hero', () => {
    const s = createMeteorShower()
    spawnMeteorShowerFx(s, 'intro', METEOR_INTRO_MS, R, true, false, 0)
    for (let i = 0; i < s.count; i++) {
      const m = s.meteors[i]!
      expect(m.sparks > 0).toBe(m.hero)
    }
    spawnMeteorShowerFx(s, 'celebrate', METEOR_INTRO_MS, R, false, false, 0)
    for (let i = 0; i < s.count; i++) expect(s.meteors[i]!.hero).toBe(false)
  })
})

describe('meteor shower — timeline (synced to the unchanged intro)', () => {
  it('every meteor lands inside the intro span; the hero lands on the centre', () => {
    for (const span of [METEOR_INTRO_MS, 1200]) {
      for (let rep = 0; rep < 20; rep++) {
        const s = createMeteorShower()
        spawnMeteorShowerFx(s, 'intro', span, R, rep % 2 === 1, false, 0)
        let hero = 0
        for (let i = 0; i < s.count; i++) {
          const m = s.meteors[i]!
          expect(m.launch + m.flight).toBeLessThanOrEqual(span - 150)
          if (m.hero) {
            hero++
            expect(m.x).toBe(0)
            expect(m.y).toBe(0)
          } else {
            expect(Math.hypot(m.x, m.y)).toBeLessThan(R * 0.8)
            expect(Math.abs(m.y)).toBeLessThanOrEqual(R * IMPACT_Y_MAX + 1e-9)
          }
        }
        expect(hero).toBe(1)
      }
    }
  })

  it('the clock ticks 16 ms per physics tick and the shower ends by itself', () => {
    const s = createMeteorShower()
    spawnMeteorShowerFx(s, 'intro', METEOR_INTRO_MS, R, false, false, 0)
    expect(METEOR_TICK_MS).toBe(16)
    let ticks = 0
    while (s.active && ticks < 1000) { tickMeteorShower(s, ticks * 16); ticks++ }
    expect(s.active).toBe(false)
    expect(ticks * 16).toBeGreaterThanOrEqual(METEOR_INTRO_MS)
    expect(ticks * 16).toBeLessThan(METEOR_INTRO_MS + 1600)
    // render clock never runs more than one tick ahead (a frozen game holds)
    expect(meteorClock(s, 1e9)).toBe(s.clock + METEOR_TICK_MS)
  })

  it('the engine hand-off is unchanged: 1600 ms meteor_intro, PvP on its 1200 ms banner', () => {
    expect(METEOR_INTRO_MS).toBe(1600)
    expect(ENGINE).toContain('meteorIntroTimer += 16')
    expect(ENGINE).toContain('if (meteorIntroTimer >= 1600) {')
    expect(body(ENGINE, 'startMatch')).toContain("spawnMeteorShower('intro', METEOR_INTRO_MS)")
    expect(ENGINE).toContain("spawnMeteorShower('intro', 1200)")
  })
})

describe('meteor shower — camera shake', () => {
  it('whole device pixels, bounded, and off for reduced motion / celebrate', () => {
    const s = createMeteorShower()
    spawnMeteorShowerFx(s, 'intro', METEOR_INTRO_MS, R, false, false, 0)
    let moved = 0
    for (let t = 0; t < 2600; t += 4) {
      const k = meteorShake(s, t)
      expect(Number.isInteger(k.x) && Number.isInteger(k.y)).toBe(true)
      expect(Math.abs(k.x)).toBeLessThanOrEqual(7)
      expect(Math.abs(k.y)).toBeLessThanOrEqual(7)
      if (k.x !== 0 || k.y !== 0) moved++
    }
    expect(moved).toBeGreaterThan(0)
    expect(meteorShake(s, 0)).toBe(s.shake) // the same object every frame
    spawnMeteorShowerFx(s, 'intro', METEOR_INTRO_MS, R, false, true, 0)
    for (let t = 0; t < 2600; t += 4) {
      const k = meteorShake(s, t)
      expect(k.x === 0 && k.y === 0).toBe(true)
    }
    spawnMeteorShowerFx(s, 'celebrate', METEOR_INTRO_MS, R, false, false, 0)
    for (let t = 0; t < 2600; t += 4) {
      const k = meteorShake(s, t)
      expect(k.x === 0 && k.y === 0).toBe(true)
    }
  })
})

describe('meteor shower — flat, batched, allocation-free drawing', () => {
  const DRAW_FNS = ['drawMeteorGround', 'drawMeteorSky', 'drawMeteorScreen', 'meteorShake', 'flamePath', 'starPath', 'headAt', 'drawSprite', 'tickMeteorShower', 'meteorClock']
  for (const name of DRAW_FNS) {
    it(`${name}: no glow / gradient / blur / filter, no per-frame allocation`, () => {
      const b = body(MOD, name)
      expect(b).not.toMatch(/createRadialGradient|createLinearGradient|shadowBlur|ctx\.filter/)
      expect(b, 'no per-frame template strings (colours are constants)').not.toContain('`')
      expect(b, 'no per-frame dash arrays').not.toMatch(/setLineDash\(\[/)
      expect(b, 'no per-frame objects').not.toMatch(/\bnew\s+[A-Z]|=\s*\[|=\s*\{/)
    })
  }

  it('draws every phase without throwing, with a bounded number of paint ops', () => {
    const s = createMeteorShower()
    spawnMeteorShowerFx(s, 'intro', METEOR_INTRO_MS, R, false, false, 0)
    let peak = 0
    for (let t = 0; t < 2800; t += 16) {
      const { ctx, calls } = mockCtx()
      drawMeteorGround(ctx, s, t)
      drawMeteorSky(ctx, s, t, 2.2)
      drawMeteorScreen(ctx, s, t, 390, 844)
      const paints = (calls.fill ?? 0) + (calls.stroke ?? 0) + (calls.fillRect ?? 0) + (calls.drawImage ?? 0)
      peak = Math.max(peak, paints)
    }
    // batched per colour layer across all meteors (≈ 25 at the peak), not per meteor
    expect(peak).toBeGreaterThan(5)
    expect(peak).toBeLessThan(45)
  })

  it('every Math.random in the module is a reviewed VFX roll at spawn', () => {
    const offenders = MOD.split('\n').filter(l => /Math\.random\s*\(/.test(l) && !l.includes('// vfx-rng'))
    expect(offenders).toEqual([])
    for (const name of DRAW_FNS) expect(body(MOD, name)).not.toMatch(/Math\.random/)
  })
})

describe('meteor shower — determinism untouched', () => {
  it('never imports or advances the match RNG', () => {
    expect(MOD).not.toMatch(/useDeterministicRng|matchRng|gameplayRand|createRng/)
    seedMatchRng(1234)
    const ref = [matchRng(), matchRng(), matchRng()]
    seedMatchRng(1234)
    const s = createMeteorShower()
    spawnMeteorShowerFx(s, 'intro', METEOR_INTRO_MS, R, false, false, 0)
    for (let i = 0; i < 200; i++) tickMeteorShower(s, i * 16)
    expect([matchRng(), matchRng(), matchRng()]).toEqual(ref)
  })

  it('the engine ticks the shower only from presentation hooks (no sim state)', () => {
    expect(body(ENGINE, 'spawnMeteorShower')).not.toMatch(/matchRng|gameplayRand|blade/)
    expect(body(ENGINE, 'updateMeteorParticles')).not.toMatch(/matchRng|gameplayRand|blade/)
  })
})

describe('idle aim hint — same visual language as the active drag preview', () => {
  const hint = body(ENGINE, 'renderHintAnimation')

  it('is drawn with the aim kit: pull band, notched power arrow, guide dots', () => {
    expect(hint).toContain('drawPullBand(')
    expect(hint).toContain('drawAimArrow(')
    expect(hint).toContain('drawAimDots(')
    // the old thin olive line + rgb() colour ramp + dashed line are gone
    expect(hint).not.toMatch(/rgb\(|rgba\(|setLineDash|strokeStyle = '#/)
  })

  it('flat and allocation-free per frame (the compose layer is grown outside it)', () => {
    expect(hint).not.toMatch(/createRadialGradient|createLinearGradient|shadowBlur|ctx\.filter/)
    expect(hint).not.toContain('`')
    expect(hint).not.toMatch(/\bnew\s+[A-Z]|=\s*\[|=\s*\{/)
  })

  it('has a reduced-motion still pose and a hint opacity', () => {
    expect(hint).toContain('hintStill')
    expect(ENGINE).toMatch(/const HINT_ALPHA = 0\.\d+/)
  })

  it('sits under the models, like the active preview', () => {
    const call = ENGINE.indexOf('renderHintAnimation(ctx, showHintAnim')
    const models = ENGINE.indexOf('// Render all models')
    expect(call).toBeGreaterThan(0)
    expect(call).toBeLessThan(models)
  })
})
