// ─── Aim preview (ui-catalog.md §7.1): source guards ────────────────────────
//
// The slingshot preview is drawn every frame while the player aims. It must
// follow the action-UI rules (flat fills — no glow, gradient, blur) and stay
// allocation-free (constant colour strings / dash arrays, no per-frame
// template strings or objects), and it must preview the shot releaseDrag
// actually fires (the drag vector, not the disc → finger line).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = readFileSync(resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')

/** Body of `const <name> = (...) => { ... }`, brace-matched. */
const body = (name: string): string => {
  const start = SRC.indexOf(`const ${name} = (`)
  expect(start, `${name} not found — guard must follow a rename`).toBeGreaterThanOrEqual(0)
  const open = SRC.indexOf('=> {', start) + 3
  let depth = 0
  let i = open
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++
    else if (SRC[i] === '}' && --depth === 0) break
  }
  return SRC.slice(start, i + 1)
}

const AIM_FNS = [
  'drawAimArrow', 'drawAimDots', 'drawPullBand', 'drawAimCancel',
  'renderAimPreview', 'renderJoystickAimPreview', 'renderDragIndicator', 'renderJoystick'
]

describe('aim preview — action-UI rules', () => {
  for (const name of AIM_FNS) {
    it(`${name}: flat, allocation-free drawing`, () => {
      const b = body(name)
      expect(b).not.toMatch(/createRadialGradient|createLinearGradient|shadowBlur|ctx\.filter/)
      expect(b, 'no per-frame template strings (colours are constants)').not.toContain('`')
      expect(b, 'no per-frame dash arrays').not.toMatch(/setLineDash\(\[/)
      expect(b).not.toMatch(/\bnew\s+[A-Z]/)
    })
  }

  it('the arrow follows the launch vector releaseDrag fires (press → finger)', () => {
    const b = body('renderAimPreview')
    expect(b).toContain('dragStart.value.x - fx')
    expect(b).toContain('dragForceRatio.value')
  })

  it('the cancel zone uses the same rule as releaseDrag (pointer back on the disc)', () => {
    expect(body('releaseDrag')).toContain('pointerDist < blade.radius')
    expect(body('inAimCancelZone')).toContain('< blade.radius * blade.radius')
  })

  it('the preview is drawn under the models, the cancel badge over them', () => {
    const under = SRC.indexOf('renderAimPreview(ctx, selectedBlade.value)')
    const models = SRC.indexOf('// Render all models')
    const over = SRC.indexOf('renderDragIndicator(ctx, selectedBlade.value)')
    expect(under).toBeGreaterThan(0)
    expect(under).toBeLessThan(models)
    expect(over).toBeGreaterThan(models)
  })
})
