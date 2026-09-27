import { describe, expect, it } from 'vitest'
import { simulateIntroFight } from '@/use/introFight'
import {
  buildDirector,
  countAt,
  fallU,
  levelAt,
  stageAt,
  stepTime,
  levelBadgeVisible,
  FALL_S,
  HOLD_S,
  LEVEL_FROM,
  STAGE_FROM
} from '@/use/introTimeline'

// ─── "Falling down the ladder" — the countdown timing ──────────────────────

const director = buildDirector(simulateIntroFight())
const b = director.beats

describe('countAt / stepTime', () => {
  it('starts at the top and lands on exactly 1', () => {
    expect(countAt(30, 0)).toBe(30)
    expect(countAt(50, 0)).toBe(50)
    expect(countAt(30, 1)).toBe(1)
    expect(countAt(50, 1)).toBe(1)
    // Not a frame early: anything short of the end is above 1.
    expect(countAt(30, 0.999)).toBeGreaterThan(1)
    expect(countAt(50, 0.999)).toBeGreaterThan(1)
  })

  it('is the inverse of stepTime — every number gets its own moment', () => {
    for (const from of [LEVEL_FROM, STAGE_FROM]) {
      for (let k = 1; k < from; k++) {
        const t = stepTime(k, from, 0)
        const u = fallU(t, 0)
        expect(countAt(from, u)).toBe(from - k)
        // A hair earlier it still shows the previous number.
        expect(countAt(from, fallU(t - 1e-4, 0))).toBe(from - k + 1)
      }
    }
  })

  it('accelerates — each step comes sooner than the one before it', () => {
    for (const from of [LEVEL_FROM, STAGE_FROM]) {
      let prevGap = Infinity
      for (let k = 2; k < from; k++) {
        const gap = stepTime(k, from, 0) - stepTime(k - 1, from, 0)
        expect(gap).toBeLessThan(prevGap)
        prevGap = gap
      }
      // The first number gets a readable beat; the tail is a blur.
      expect(stepTime(1, from, 0)).toBeGreaterThan(0.25)
      expect(stepTime(from - 1, from, 0) - stepTime(from - 2, from, 0)).toBeLessThan(0.05)
    }
  })
})

describe('levelAt / stageAt on the real beat sheet', () => {
  it('holds Lv 30 / stage 50 through the whole fight', () => {
    for (let T = 0; T <= b.fallStartT; T += 0.25) {
      expect(levelAt(T, b)).toBe(30)
      expect(stageAt(T, b)).toBe(50)
    }
  })

  it('both counters land on 1 on the SAME instant — the emotional beat', () => {
    expect(b.landT - b.fallStartT).toBeCloseTo(FALL_S, 9)
    expect(levelAt(b.landT, b)).toBe(1)
    expect(stageAt(b.landT, b)).toBe(1)
    expect(levelAt(b.landT - 1e-3, b)).toBe(2)
    expect(stageAt(b.landT - 1e-3, b)).toBe(2)
  })

  it('never counts back up', () => {
    let lv = 99
    let st = 99
    for (let T = 0; T <= b.endT; T += 1 / 144) {
      const l = levelAt(T, b)
      const s = stageAt(T, b)
      expect(l).toBeLessThanOrEqual(lv)
      expect(s).toBeLessThanOrEqual(st)
      lv = l
      st = s
    }
  })

  it('holds at 1 for 1.5 s, then the level badge goes', () => {
    expect(HOLD_S).toBe(1.5)
    expect(b.holdEndT - b.landT).toBeCloseTo(1.5, 9)
    expect(levelBadgeVisible(b.landT + 1.49, b)).toBe(true)
    expect(levelAt(b.landT + 1.49, b)).toBe(1)
    expect(levelBadgeVisible(b.badgeGoneT, b)).toBe(false)
  })

  it('the storyboard ends after the handover, in a sane total length', () => {
    expect(b.reclaimT).toBeGreaterThan(b.holdEndT)
    expect(b.endT).toBeGreaterThan(b.outroT)
    expect(b.endT).toBeLessThan(16)
  })
})

describe('director time map', () => {
  it('sim time never runs backwards and freezes only for hit-stops', () => {
    let prev = -1
    let frozenFrames = 0
    for (let T = 0; T <= b.battleEndT + 0.5; T += 0.004) {
      const s = director.toS(T)
      expect(s).toBeGreaterThanOrEqual(prev)
      if (s === prev) frozenFrames++
      prev = s
    }
    // Hit-stops exist, but they are short.
    expect(frozenFrames).toBeGreaterThan(0)
    expect(frozenFrames * 0.004).toBeLessThan(2)
  })

  it('toT is the inverse of toS', () => {
    for (let s = 0; s < 5; s += 0.137) {
      expect(director.toS(director.toT(s))).toBeCloseTo(s, 6)
    }
  })
})
