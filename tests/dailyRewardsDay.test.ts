import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { previousUtcDayKey, utcDayKey } from '@/utils/dayKey'

// DailyRewards.vue used its own copy of the day math:
//   today     = new Date().toISOString().slice(0, 10)
//   yesterday = d.setDate(d.getDate() - 1) → toISOString().slice(0, 10)
// It now uses the shared helpers. `today` is the identical expression;
// `yesterday` is identical except inside a local DST-change hour (the old
// local-calendar step spans 23 h / 25 h there and could land on the wrong
// UTC day). These tests pin both facts in whatever TZ the suite runs in.

const oldToday = (now: number): string => new Date(now).toISOString().slice(0, 10)
const oldYesterday = (now: number): string => {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
const oldStepMs = (now: number): number => {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return now - d.getTime()
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('daily rewards day keys (shared UTC helper)', () => {
  it('today is exactly the old expression', () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 7 * HOUR + 13 * 60 * 1000) {
      expect(utcDayKey(t)).toBe(oldToday(t))
    }
  })

  it('yesterday is always the previous UTC calendar day', () => {
    expect(previousUtcDayKey(Date.UTC(2026, 9, 1, 0, 0, 0))).toBe('2026-09-30')
    expect(previousUtcDayKey(Date.UTC(2026, 8, 30, 23, 59, 59))).toBe('2026-09-29')
    expect(previousUtcDayKey(Date.UTC(2027, 0, 1, 12))).toBe('2026-12-31')
    expect(previousUtcDayKey(Date.UTC(2028, 2, 1, 5))).toBe('2028-02-29')
  })

  it('yesterday matches the old local-calendar step whenever that step is 24 h', () => {
    let compared = 0
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += HOUR + 17 * 60 * 1000) {
      if (oldStepMs(t) !== DAY) continue // local DST change: the old code was off here
      expect(previousUtcDayKey(t)).toBe(oldYesterday(t))
      compared++
    }
    expect(compared).toBeGreaterThan(6000)
  })

  it('DailyRewards.vue uses the shared helpers, no private day math', () => {
    const src = readFileSync(resolve(__dirname, '../src/components/organisms/DailyRewards.vue'), 'utf8')
    expect(src).toMatch(/from '@\/utils\/dayKey'/)
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/)
    expect(src).not.toMatch(/setDate\(/)
  })
})
