// Pins the literal string values of SAVE_KEYS. These keys are a contract
// with every player's localStorage — renaming them strands existing
// players' progress on the old key. The refactor that introduces
// `src/keys.ts` as the single source of truth must keep these values
// byte-identical.

import { describe, expect, it } from 'vitest'
import { SAVE_KEYS } from '@/utils/save/SaveMergePolicy'

describe('SAVE_KEYS values are stable', () => {
  it('STAGE key is the literal "spinner_campaign_stage"', () => {
    expect(SAVE_KEYS.STAGE).toBe('spinner_campaign_stage')
  })
  it('COINS key is the literal "spinner_coins"', () => {
    expect(SAVE_KEYS.COINS).toBe('spinner_coins')
  })
  it('UPGRADES key is the literal "spinner_upgrades"', () => {
    expect(SAVE_KEYS.UPGRADES).toBe('spinner_upgrades')
  })
  it('SKINS key is the literal "spinner_owned_skins"', () => {
    expect(SAVE_KEYS.SKINS).toBe('spinner_owned_skins')
  })
})
