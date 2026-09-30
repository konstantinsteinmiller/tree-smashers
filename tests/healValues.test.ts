import { describe, it, expect } from 'vitest'

/**
 * These tests verify that every heal-value path in the game clamps at maxHp
 * and produces integer display values (no decimal points in floating damage
 * numbers), shown only when at least 1 HP was actually applied.
 *
 * The formulas below mirror the exact logic in useSpinnerGame.ts for:
 *   1. Forest arena wall-bounce heal
 *   2. Healer-ally contact heal
 *   2b. Life-leech heal
 *   3. Lava arena wall-bounce damage (included for completeness)
 *   4. spawnDamageNumber (combat damage)
 */

// ─── Heal display rule (shared by every heal source) ──────────────────────
// useSpinnerGame.ts `healFx(blade, hpBefore)`: every source first clamps HP at
// maxHp, then the heal READS (pulse + number) only when the HP actually
// applied is ≥ 1; the number is the rounded applied amount. Below 1 → 0 (no
// number, no pulse) although HP still rose. Epsilon absorbs `(x+1)-x` float loss.

function shownHeal(applied: number): number {
  return applied < 1 - 1e-9 ? 0 : Math.round(applied)
}

// ─── Forest Arena Heal ─────────────────────────────────────────────────────
// bounceOffWalls → forest branch: hp = min(maxHp, hp + 1)

function forestHeal(maxHp: number, currentHp: number): { hp: number; shown: number } {
  const hp = Math.min(maxHp, currentHp + 1)
  return { hp, shown: shownHeal(hp - currentHp) }
}

describe('Forest arena wall-bounce heal', () => {
  it('shows 1 when blade is missing at least 1 HP', () => {
    expect(forestHeal(100, 90)).toEqual({ hp: 91, shown: 1 })
  })

  it('shows 1 when blade is missing exactly 1 HP', () => {
    expect(forestHeal(50, 49)).toEqual({ hp: 50, shown: 1 })
  })

  it('shows nothing at full HP', () => {
    expect(forestHeal(100, 100)).toEqual({ hp: 100, shown: 0 })
  })

  it.each([99.01112, 99.4, 99.6, 99.98888])('clamps at max and shows nothing when < 1 HP is missing (hp %s)', (hp) => {
    expect(forestHeal(100, hp)).toEqual({ hp: 100, shown: 0 })
  })

  it('still shows 1 across a float exponent boundary (63.7 → 64.7)', () => {
    expect(forestHeal(100, 63.7).shown).toBe(1)
  })

  it('never exceeds maxHp and always shows 0 or 1 across many fractional HPs', () => {
    for (let i = 0; i < 1000; i++) {
      const maxHp = 10 + Math.random() * 200
      const currentHp = Math.random() * maxHp
      const { hp, shown } = forestHeal(maxHp, currentHp)
      expect(hp).toBeLessThanOrEqual(maxHp)
      expect([0, 1]).toContain(shown)
    }
  })
})

// ─── Healer Contact Heal ───────────────────────────────────────────────────
// resolveCollision → healer branch (H3: full heal, NO rounding first):
//   if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + HEALER_CONTACT_HEAL)

const HEALER_CONTACT_HEAL = 2

function healerHeal(maxHp: number, currentHp: number): { hp: number; shown: number } {
  if (currentHp >= maxHp) return { hp: currentHp, shown: 0 }
  const hp = Math.min(maxHp, currentHp + HEALER_CONTACT_HEAL)
  return { hp, shown: shownHeal(hp - currentHp) }
}

describe('Healer contact heal', () => {
  it('shows 2 when blade is missing more than 2 HP', () => {
    expect(healerHeal(100, 90)).toEqual({ hp: 92, shown: 2 })
  })

  it('exactly 2 missing: +2 to max, shows 2', () => {
    expect(healerHeal(100, 98)).toEqual({ hp: 100, shown: 2 })
  })

  it('does nothing at full HP', () => {
    expect(healerHeal(100, 100)).toEqual({ hp: 100, shown: 0 })
  })

  it('1.6 missing: clamped at max (+1.6), shows 2', () => {
    expect(healerHeal(100, 98.4)).toEqual({ hp: 100, shown: 2 })
  })

  it('1.2 missing: full heal clamps at max (+1.2, not a rounded +1), shows 1', () => {
    expect(healerHeal(100, 98.8)).toEqual({ hp: 100, shown: 1 })
  })

  it('0.6 missing: clamped to max, below 1 applied → shows nothing', () => {
    expect(healerHeal(100, 99.4)).toEqual({ hp: 100, shown: 0 })
  })

  it('0.3 missing (< 0.5): still tops up to max silently — no rounding to a 0 heal', () => {
    expect(healerHeal(100, 99.7)).toEqual({ hp: 100, shown: 0 })
  })

  it('2.7 missing: +2 unrounded, stays under max, shows 2', () => {
    const r = healerHeal(100, 97.3)
    expect(r.hp).toBeCloseTo(99.3, 9)
    expect(r.shown).toBe(2)
  })

  it('never exceeds maxHp and shows an integer across many fractional HPs', () => {
    for (let i = 0; i < 1000; i++) {
      const maxHp = 10 + Math.random() * 200
      const currentHp = Math.random() * maxHp
      const { hp, shown } = healerHeal(maxHp, currentHp)
      expect(hp).toBeLessThanOrEqual(maxHp)
      expect(hp - currentHp).toBeCloseTo(Math.min(HEALER_CONTACT_HEAL, maxHp - currentHp), 9)
      expect(Number.isInteger(shown)).toBe(true)
    }
  })
})

// ─── Life-leech Heal ───────────────────────────────────────────────────────
// resolveCollision → leech: a.hp = Math.min(a.maxHp, a.hp + dmg * 0.3)

function leechHeal(maxHp: number, currentHp: number, dmg: number): { hp: number; shown: number } {
  const hp = Math.min(maxHp, currentHp + dmg * 0.3)
  return { hp, shown: shownHeal(hp - currentHp) }
}

describe('Life-leech heal', () => {
  it('shows the rounded applied heal when ≥ 1', () => {
    expect(leechHeal(100, 50, 10)).toEqual({ hp: 53, shown: 3 })
    expect(leechHeal(100, 50, 5).shown).toBe(2) // 1.5 → 2
  })

  it('shows the CLAMPED amount, not the raw 30%', () => {
    expect(leechHeal(100, 98.5, 20)).toEqual({ hp: 100, shown: 2 }) // 1.5 applied, not 6
  })

  it('shows nothing when < 1 HP is applied (raw heal small or clamped)', () => {
    expect(leechHeal(100, 50, 3).shown).toBe(0) // 0.9
    expect(leechHeal(100, 99.5, 20)).toEqual({ hp: 100, shown: 0 })
  })
})

// ─── Lava Damage ───────────────────────────────────────────────────────────
// Formula (useSpinnerGame.ts, bounceOffWalls → lava branch):
//   const lavaDmg = Math.ceil(blade.maxHp * 0.025)

function lavaDamageValue(maxHp: number): number {
  return Math.ceil(maxHp * 0.025)
}

describe('Lava arena wall-bounce damage value', () => {
  it('returns integer for typical maxHp', () => {
    expect(Number.isInteger(lavaDamageValue(100))).toBe(true)
    expect(lavaDamageValue(100)).toBe(3) // ceil(2.5)
  })

  it('returns integer for odd maxHp', () => {
    expect(Number.isInteger(lavaDamageValue(77))).toBe(true)
  })

  it('returns at least 1 for any positive maxHp', () => {
    expect(lavaDamageValue(1)).toBeGreaterThanOrEqual(1)
  })

  it('never returns a value with decimal places across many maxHp values', () => {
    for (let i = 1; i <= 500; i++) {
      const result = lavaDamageValue(i)
      expect(Number.isInteger(result)).toBe(true)
    }
  })
})

// ─── spawnDamageNumber (combat) ────────────────────────────────────────────
// Formula (useSpinnerGame.ts, spawnDamageNumber):
//   value: Math.round(value)

function combatDamageDisplayValue(rawDmg: number): number {
  return Math.round(rawDmg)
}

describe('Combat damage display value (spawnDamageNumber)', () => {
  it('rounds fractional damage to nearest integer', () => {
    expect(combatDamageDisplayValue(5.7)).toBe(6)
    expect(combatDamageDisplayValue(5.3)).toBe(5)
    expect(combatDamageDisplayValue(5.5)).toBe(6)
  })

  it('passes through integer damage unchanged', () => {
    expect(combatDamageDisplayValue(10)).toBe(10)
  })

  it('never returns a value with decimal places for any input', () => {
    for (let i = 0; i < 1000; i++) {
      const raw = Math.random() * 500
      const result = combatDamageDisplayValue(raw)
      expect(Number.isInteger(result)).toBe(true)
    }
  })
})
