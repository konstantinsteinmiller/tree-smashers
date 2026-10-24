// Team modal: deselect smasher 2 / 3 (owner request, #UX1c) — pure rules.
import { describe, expect, it } from 'vitest'
import { benchTeamSlot, fieldTeamSlot } from '@/data/teamSize'

describe('benchTeamSlot', () => {
  it('removing the last fielded slot lowers the team size and keeps the picks', () => {
    expect(benchTeamSlot(['a', 'b', 'c'], 3, 2)).toEqual({ team: ['a', 'b', 'c'], size: 2 })
    expect(benchTeamSlot(['a', 'b', 'c'], 2, 1)).toEqual({ team: ['a', 'b', 'c'], size: 1 })
  })

  it('removing slot 2 while slot 3 fights moves slot 3 forward (no gap)', () => {
    expect(benchTeamSlot(['a', 'b', 'c'], 3, 1)).toEqual({ team: ['a', 'c', 'b'], size: 2 })
  })

  it('slot 1 can never be emptied, and a resting slot is left alone', () => {
    expect(benchTeamSlot(['a', 'b', 'c'], 3, 0)).toEqual({ team: ['a', 'b', 'c'], size: 3 })
    expect(benchTeamSlot(['a', 'b', 'c'], 2, 2)).toEqual({ team: ['a', 'b', 'c'], size: 2 })
    expect(benchTeamSlot(['a'], 1, 0)).toEqual({ team: ['a'], size: 1 })
  })

  it('never mutates the input team', () => {
    const team = ['a', 'b', 'c']
    benchTeamSlot(team, 3, 1)
    expect(team).toEqual(['a', 'b', 'c'])
  })
})

describe('fieldTeamSlot', () => {
  it('grows the team size to cover the re-fielded slot', () => {
    expect(fieldTeamSlot(1, 1, 3)).toBe(2)
    expect(fieldTeamSlot(1, 2, 3)).toBe(3)
    expect(fieldTeamSlot(2, 2, 3)).toBe(3)
  })
  it('never shrinks, and never passes the open slots', () => {
    expect(fieldTeamSlot(3, 1, 3)).toBe(3)
    expect(fieldTeamSlot(1, 2, 2)).toBe(2)
  })
})
