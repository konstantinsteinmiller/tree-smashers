import { describe, it, expect, beforeEach } from 'vitest'
import {
  createBorderFx, resetBorderFx, tickBorderFx, triggerBurn, triggerHeal,
  countActiveBurns, countActiveHeals, renderBurns,
  FLAME_FRAMES, FLAME_FRAME_MS, FLAME_REKINDLE_FRAME, HEAL_LIFE_MS, HEAL_RETRIGGER_MS,
  BORDER_FX_POOL_SIZE, type BorderFxState, type BorderFxBlade
} from '@/use/borderFx'

const blade = (id: number, hp = 100): BorderFxBlade => ({ id, x: 0, y: 0, radius: 26, hp })

/** Advance in physics-tick steps, like the game loop does. */
const run = (s: BorderFxState, ms: number) => {
  for (let t = 0; t < ms; t += 16) tickBorderFx(s, 16)
}

describe('border fx — lava flame-burn', () => {
  let s: BorderFxState
  beforeEach(() => {
    s = createBorderFx()
  })

  it('starts at frame 0 and plays all 12 frames once (~0.96 s), then frees the slot', () => {
    const b = blade(1)
    const slot = triggerBurn(s, b, 6, true)!
    expect(slot.frame).toBe(0)
    run(s, FLAME_FRAME_MS * (FLAME_FRAMES - 1))
    expect(slot.active).toBe(true)
    expect(slot.frame).toBe(FLAME_FRAMES - 1)
    run(s, FLAME_FRAME_MS + 16)
    expect(slot.active).toBe(false)
    expect(slot.blade).toBeNull()
  })

  it('does not restart while contact continues — repeated triggers every tick keep ONE slot advancing', () => {
    const b = blade(1)
    triggerBurn(s, b, 6, true)
    for (let i = 0; i < 20; i++) {
      triggerBurn(s, b, 6, true)
      tickBorderFx(s, 16)
    }
    expect(countActiveBurns(s)).toBe(1)
    // 20 ticks = 320 ms = frame 4: still ramping, never snapped back to 0.
    expect(s.burns.find(x => x.active)!.frame).toBe(4)
  })

  it('re-contact after the peak holds the fire on the flicker frames (high tier)', () => {
    const b = blade(1)
    const slot = triggerBurn(s, b, 6, true)!
    run(s, FLAME_FRAME_MS * 9) // well into the die-down
    expect(slot.frame).toBeGreaterThan(FLAME_REKINDLE_FRAME)
    triggerBurn(s, b, 6, true)
    expect(slot.frame).toBe(FLAME_REKINDLE_FRAME)
    expect(slot.timer).toBe(0)
    expect(countActiveBurns(s)).toBe(1)
  })

  it('low tier (rekindle=false) ignores re-contact until the pass ends, then may retrigger', () => {
    const b = blade(1)
    const slot = triggerBurn(s, b, 2, false)!
    run(s, FLAME_FRAME_MS * 9)
    const before = slot.frame
    triggerBurn(s, b, 2, false)
    expect(slot.frame).toBe(before)
    run(s, FLAME_FRAME_MS * 4)
    expect(countActiveBurns(s)).toBe(0)
    expect(triggerBurn(s, b, 2, false)!.frame).toBe(0)
  })

  it('caps concurrent burns at the live cap, and never beyond the pool', () => {
    expect(triggerBurn(s, blade(1), 2, true)).not.toBeNull()
    expect(triggerBurn(s, blade(2), 2, true)).not.toBeNull()
    expect(triggerBurn(s, blade(3), 2, true)).toBeNull()
    expect(countActiveBurns(s)).toBe(2)
    for (let i = 10; i < 20; i++) triggerBurn(s, blade(i), 99, true)
    expect(countActiveBurns(s)).toBe(BORDER_FX_POOL_SIZE)
  })

  it('drops the burn when its spinner dies', () => {
    const b = blade(1)
    triggerBurn(s, b, 6, true)
    b.hp = 0
    tickBorderFx(s, 16)
    expect(countActiveBurns(s)).toBe(0)
  })

  it('reuses pooled slot objects — triggering allocates nothing new', () => {
    const slots = [...s.burns]
    for (let i = 0; i < 50; i++) {
      triggerBurn(s, blade(i % 8), 6, true)
      run(s, 200)
    }
    expect(s.burns).toHaveLength(slots.length)
    s.burns.forEach((slot, i) => expect(slot).toBe(slots[i]))
  })

  it('draws the current frame centred on the spinner\'s live position', () => {
    const calls: number[][] = []
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D
    const img = { complete: true, naturalWidth: 1536, naturalHeight: 128 } as HTMLImageElement
    const b = blade(1)
    triggerBurn(s, b, 6, true)
    run(s, FLAME_FRAME_MS * 3)
    b.x = 50
    b.y = -20
    renderBurns(ctx, s, img)
    expect(calls).toHaveLength(1)
    const [sx, sy, sw, sh, dx, dy, dw, dh] = calls[0]!
    expect([sx, sy, sw, sh]).toEqual([3 * 128, 0, 128, 128])
    // Cell side = radius / 0.28; spinner centre at (0.5, 0.6) of the cell.
    expect(dw).toBeCloseTo(26 / 0.28)
    expect(dh).toBeCloseTo(26 / 0.28)
    expect(dx + dw * 0.5).toBeCloseTo(50)
    expect(dy + dh * 0.6).toBeCloseTo(-20)
    // Not loaded yet → draws nothing.
    calls.length = 0
    renderBurns(ctx, s, { complete: false, naturalWidth: 0 } as HTMLImageElement)
    expect(calls).toHaveLength(0)
  })

  it('reset clears every slot', () => {
    triggerBurn(s, blade(1), 6, true)
    triggerHeal(s, blade(2), 6)
    resetBorderFx(s)
    expect(countActiveBurns(s)).toBe(0)
    expect(countActiveHeals(s)).toBe(0)
  })
})

describe('border fx — forest heal pulse', () => {
  let s: BorderFxState
  beforeEach(() => {
    s = createBorderFx()
  })

  it('plays for HEAL_LIFE_MS then frees the slot', () => {
    triggerHeal(s, blade(1), 6)
    run(s, HEAL_LIFE_MS - 32)
    expect(countActiveHeals(s)).toBe(1)
    run(s, 48)
    expect(countActiveHeals(s)).toBe(0)
  })

  it('throttles per spinner: ignored inside the retrigger window, restarted after it', () => {
    const b = blade(1)
    const slot = triggerHeal(s, b, 6)!
    run(s, HEAL_RETRIGGER_MS - 48)
    expect(triggerHeal(s, b, 6)).toBeNull()
    expect(slot.t).toBeGreaterThan(0)
    run(s, 64)
    expect(triggerHeal(s, b, 6)).toBe(slot)
    expect(slot.t).toBe(0)
    expect(countActiveHeals(s)).toBe(1)
  })

  it('different spinners heal independently, up to the cap', () => {
    expect(triggerHeal(s, blade(1), 2)).not.toBeNull()
    expect(triggerHeal(s, blade(2), 2)).not.toBeNull()
    expect(triggerHeal(s, blade(3), 2)).toBeNull()
    expect(countActiveHeals(s)).toBe(2)
  })
})
