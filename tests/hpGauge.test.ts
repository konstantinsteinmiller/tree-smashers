import { describe, expect, it } from 'vitest'
import { HP_GAUGE, drawHpGauge, newHpGaugeState, stepHpGauge } from '@/use/hpGauge'
import { towerDamageStage } from '@/use/towerArt'
import { PAINTED_TOWERS } from '@/use/paintedTowers'

/** Records what the gauge does to a 2D context (no real canvas in node). */
const recCtx = () => {
  const calls: Record<string, number> = {}
  const hit = (n: string) => () => { calls[n] = (calls[n] ?? 0) + 1 }
  const bad: string[] = []
  const ctx = {
    calls, bad,
    lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    strokeStyle: '', fillStyle: '', globalAlpha: 1,
    set shadowBlur(_v: number) { bad.push('shadowBlur') },
    set filter(_v: string) { bad.push('filter') },
    createRadialGradient: () => { bad.push('radialGradient'); return {} },
    createLinearGradient: () => { bad.push('linearGradient'); return {} },
    beginPath: hit('beginPath'), closePath: hit('closePath'), moveTo: hit('moveTo'), lineTo: hit('lineTo'),
    arc: hit('arc'), ellipse: hit('ellipse'), stroke: hit('stroke'), fill: hit('fill'),
    save: hit('save'), restore: hit('restore'), translate: hit('translate'), scale: hit('scale'),
    strokeText: hit('strokeText'), fillText: hit('fillText'),
    measureText: (t: string) => ({ width: t.length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 0 })
  }
  return ctx
}

describe('HP gauge — damage chip, hit flash, low pulse', () => {
  it('a hit leaves the lost HP as a chip that holds, then drains to the new value', () => {
    const s = newHpGaugeState(100)
    stepHpGauge(s, 100, 100, 0)
    stepHpGauge(s, 60, 100, 16)
    expect(s.hitAt).toBe(16)
    expect(s.chip).toBe(100)
    for (let t = 32; t < 16 + HP_GAUGE.CHIP_HOLD_MS; t += 16) stepHpGauge(s, 60, 100, t)
    expect(s.chip).toBe(100) // still holding
    let t = 16 + HP_GAUGE.CHIP_HOLD_MS
    for (; t < 3000 && s.chip > 60; t += 16) stepHpGauge(s, 60, 100, t)
    expect(s.chip).toBe(60)
    expect(t).toBeLessThan(16 + HP_GAUGE.CHIP_HOLD_MS + 1500) // drains within ~1.5 s
  })

  it('healing snaps the chip up at once; a frame-time spike never overshoots', () => {
    const s = newHpGaugeState(50)
    stepHpGauge(s, 50, 100, 0)
    stepHpGauge(s, 80, 100, 16)
    expect(s.chip).toBe(80)
    stepHpGauge(s, 10, 100, 32)
    stepHpGauge(s, 10, 100, 5000) // long pause: dt is clamped, chip ≥ hp
    expect(s.chip).toBeGreaterThanOrEqual(10)
  })

  it('draws flat strokes only (no gradient, shadowBlur or filter) and keeps the context balanced', () => {
    for (const [hp, now] of [[100, 0], [20, 50], [20, 60], [0, 900]] as const) {
      const ctx = recCtx()
      const s = newHpGaugeState(100)
      drawHpGauge(ctx as unknown as CanvasRenderingContext2D, s, 0, 0, 28, 20, hp, 100, hp % 2 === 0, 1, now)
      expect(ctx.bad).toEqual([])
      expect(ctx.calls.save ?? 0).toBe(ctx.calls.restore ?? 0)
      expect(ctx.calls.fillText).toBe(1)
      expect(ctx.calls.strokeText).toBe(1)
      expect(ctx.calls.stroke).toBeGreaterThanOrEqual(3)
    }
  })

  it('the low-HP pulse scales the badge (save/translate/scale) only at or below LOW', () => {
    const low = recCtx()
    drawHpGauge(low as unknown as CanvasRenderingContext2D, newHpGaugeState(20), 0, 0, 28, 20, 20, 100, true, 1, 1000)
    expect(low.calls.scale).toBe(1)
    const ok = recCtx()
    drawHpGauge(ok as unknown as CanvasRenderingContext2D, newHpGaugeState(80), 0, 0, 28, 20, 80, 100, true, 1, 1000)
    expect(ok.calls.scale ?? 0).toBe(0)
  })
})

describe('Team tower art — damage states + atlas registry', () => {
  it('switches healthy → damaged → nearly destroyed → felled by HP %', () => {
    expect(towerDamageStage(100, 100)).toBe(0)
    expect(towerDamageStage(61, 100)).toBe(0)
    expect(towerDamageStage(60, 100)).toBe(1)
    expect(towerDamageStage(26, 100)).toBe(1)
    expect(towerDamageStage(25, 100)).toBe(2)
    expect(towerDamageStage(0.5, 100)).toBe(2)
    expect(towerDamageStage(0, 100)).toBe(3)
  })

  it('every painted tower sprite lies inside its atlas, with its ground point inside the sprite', () => {
    expect(PAINTED_TOWERS).not.toBeNull()
    const m = /_(\d+)x(\d+)\.webp$/.exec(PAINTED_TOWERS!.file)!
    const W = Number(m[1])
    const H = Number(m[2])
    const names = ['blue0', 'blue1', 'blue2', 'red0', 'red1', 'red2', 'blueFelled', 'redFelled', 'debris'] as const
    for (const n of names) {
      const s = PAINTED_TOWERS!.sprites[n]
      expect(s.x >= 0 && s.y >= 0 && s.x + s.w <= W && s.y + s.h <= H, n).toBe(true)
      expect(s.gx > 0 && s.gx < s.w && s.gy > 0 && s.gy <= s.h, n).toBe(true)
    }
    expect(PAINTED_TOWERS!.ref.halfW).toBeGreaterThan(50)
  })
})
