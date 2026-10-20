// Smasher rig contract (src/smashers/smasherRig.ts): every smasher renders all
// 32 yaw frames through a recording 2D context without a single NaN / ∞
// argument, every frame fits inside FRAME_BOX, and the silhouette's size is
// stable as the character turns (body + head bounds within ±10 % of the
// 32-frame mean) — one model seen from 32 sides.
import { describe, it, expect } from 'vitest'
import { SMASHER_IDS } from '@/data/smasherCatalog'
import {
  FRAME_BOX, SIGNATURE_PALETTES, YAW_FRAMES, drawSmasher, frameYaw, smasherBounds, type RigCtx
} from '@/smashers/smasherRig'
import { smasherForSkin, smasherPalette } from '@/smashers/smasherSkins'
import { SPINNER_MODEL_IDS } from '@/data/skinCatalog'

/** A 2D context that records every numeric argument and counts draws. */
const recordingCtx = () => {
  const bad: string[] = []
  let draws = 0
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (...args: unknown[]) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${prop}(${args.join(',')})`)
        if (prop === 'fill' || prop === 'stroke') draws++
      }
    },
    set(target, prop: string, value) {
      if (typeof value === 'number' && !Number.isFinite(value)) bad.push(`${prop}=${value}`)
      target[prop] = value
      return true
    }
  }) as unknown as RigCtx
  return { ctx, bad, draws: () => draws }
}

describe('smasher rig', () => {
  it.each(SMASHER_IDS)('%s draws 32 frames without NaN', (id) => {
    for (const boss of [false, true]) {
      for (let f = 0; f < YAW_FRAMES; f++) {
        const rec = recordingCtx()
        drawSmasher(rec.ctx, id, SIGNATURE_PALETTES[id], frameYaw(f), 100, 200, 64, { boss })
        expect(rec.bad, `${id} frame ${f}`).toEqual([])
        expect(rec.draws(), `${id} frame ${f} drew nothing`).toBeGreaterThan(20)
      }
    }
  })

  it.each(SMASHER_IDS)('%s fits the frame box and keeps its size across yaw (±10 %%)', (id) => {
    const boxes = Array.from({ length: YAW_FRAMES }, (_, f) => smasherBounds(id, frameYaw(f)))
    for (const [f, b] of boxes.entries()) {
      for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true)
      expect(b.left, `${id} frame ${f} left`).toBeGreaterThanOrEqual(FRAME_BOX.left)
      expect(b.right, `${id} frame ${f} right`).toBeLessThanOrEqual(FRAME_BOX.right)
      expect(b.top, `${id} frame ${f} top`).toBeGreaterThanOrEqual(FRAME_BOX.top)
      expect(b.bottom, `${id} frame ${f} bottom`).toBeLessThanOrEqual(FRAME_BOX.bottom)
    }
    // The character's main masses (body + head) keep their size from every
    // side: the core bounds' diagonal stays within ±10 % of the 32-frame mean
    // (the box's height alone legitimately breathes a little: a head set
    // forward on the body sits lower on screen from the front than the back).
    const core = Array.from({ length: YAW_FRAMES }, (_, f) => smasherBounds(id, frameYaw(f), { core: true }))
    const diag = core.map(b => Math.hypot(b.right - b.left, b.bottom - b.top))
    const mean = diag.reduce((a, b) => a + b, 0) / diag.length
    for (const [f, d] of diag.entries()) expect(Math.abs(d / mean - 1), `${id} frame ${f} size drift`).toBeLessThanOrEqual(0.1)
  })

  it('every skin id maps to a valid colourway, signature skin = signature palette', () => {
    for (const id of SPINNER_MODEL_IDS) {
      const s = smasherForSkin(id)
      const p = smasherPalette(s, id)
      for (const c of Object.values(p)) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(smasherPalette('bramble')).toBe(SIGNATURE_PALETTES.bramble)
    expect(smasherPalette('bramble', 'thunder')).toBe(SIGNATURE_PALETTES.bramble)
    expect(smasherPalette('bramble', 'phoenix')).not.toEqual(SIGNATURE_PALETTES.bramble)
  })
})
