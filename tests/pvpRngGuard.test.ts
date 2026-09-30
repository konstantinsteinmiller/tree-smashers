// ─── Source guard: no un-reviewed Math.random in the PvP damage/collision path ─
//
// PvP peers simulate every collision themselves; a gameplay roll on
// Math.random desyncs them (the star-top crit did exactly that). Rolls in
// these functions must use `matchRng()`. Presentation-only rolls (damage-
// number drift, SFX variant) may stay on Math.random but must carry a
// `// vfx-rng` marker on the same line — so every new roll is a conscious
// decision, reviewed against this rule.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SRC = readFileSync(resolve(__dirname, '../src/use/useSpinnerGame.ts'), 'utf8')

/** Body of `const <name> = (...) => { ... }`, brace-matched. */
const functionBody = (name: string): { body: string; line: number } => {
  const start = SRC.indexOf(`const ${name} = (`)
  expect(start, `${name} not found — guard must follow a rename`).toBeGreaterThanOrEqual(0)
  const open = SRC.indexOf('=> {', start) + 3
  let depth = 0
  let i = open
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++
    else if (SRC[i] === '}' && --depth === 0) break
  }
  return { body: SRC.slice(start, i + 1), line: SRC.slice(0, start).split('\n').length }
}

const GUARDED = ['resolveCollision', 'bounceOffWalls', 'bounceOffBouncers', 'applyBladeDamage']

describe('PvP RNG guard — useSpinnerGame damage/collision paths', () => {
  for (const name of GUARDED) {
    it(`${name}: every Math.random() is marked // vfx-rng`, () => {
      const { body, line } = functionBody(name)
      const offenders = body.split('\n')
        .map((text, k) => ({ text: text.trim(), at: line + k }))
        .filter(l => /Math\.random\s*\(/.test(l.text) && !l.text.includes('// vfx-rng'))
        .map(l => `useSpinnerGame.ts:${l.at}  ${l.text}`)
      expect(offenders).toEqual([])
    })
  }

  it('the star-top lucky crit rolls on the match RNG, for both attackers', () => {
    const { body } = functionBody('resolveCollision')
    expect(body.match(/topPartId === 'star'[^\n]*matchRng\(\) < 0\.08/g)?.length).toBe(2)
  })

  it('shock cooldowns run on the game clock, not the wall clock', () => {
    for (const name of ['bounceOffWalls', 'bounceOffBouncers']) {
      const { body } = functionBody(name)
      expect(body).toContain('lastShockMs')
      expect(body).not.toMatch(/performance\.now\(\)/)
    }
  })
})
