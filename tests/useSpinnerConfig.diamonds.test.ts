// Diamond premium currency — persistence + clamp behavior.
// useSpinnerConfig is a module singleton, so we assert relative deltas and
// the localStorage write, not an absolute starting balance.

import { describe, expect, it, beforeEach } from 'vitest'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { DIAMONDS_KEY } from '@/keys'

describe('diamonds currency', () => {
  const { diamonds, addDiamonds } = useSpinnerConfig()

  beforeEach(() => {
    // Reset to a known balance via spend-to-zero, then a clean grant.
    addDiamonds(-9999)
  })

  it('DIAMONDS_KEY is the stable literal "spinner_diamonds"', () => {
    expect(DIAMONDS_KEY).toBe('spinner_diamonds')
  })

  it('addDiamonds increments the balance and mirrors it to localStorage', () => {
    addDiamonds(3)
    expect(diamonds.value).toBe(3)
    expect(localStorage.getItem(DIAMONDS_KEY)).toBe('3')
    addDiamonds(2)
    expect(diamonds.value).toBe(5)
    expect(localStorage.getItem(DIAMONDS_KEY)).toBe('5')
  })

  it('never goes negative when spending more than the balance', () => {
    addDiamonds(1)
    addDiamonds(-10)
    expect(diamonds.value).toBe(0)
    expect(localStorage.getItem(DIAMONDS_KEY)).toBe('0')
  })
})
