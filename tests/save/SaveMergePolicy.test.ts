import { describe, expect, it } from 'vitest'
import {
  applyBonusCoins,
  computeMeta,
  decideMerge,
  parseMeta,
  SAVE_KEYS,
  SCHEMA_VERSION,
  serializeMeta,
  type SaveMeta
} from '@/utils/save/SaveMergePolicy'

// Tiny in-memory snapshot reader used by every test below. Lets each
// scenario describe its localStorage state as a plain object literal.
const reader = (snap: Record<string, string>): { get: (k: string) => string | null } => ({
  get: (k: string) => (k in snap ? snap[k]! : null)
})

const upgradesJson = (tops: Record<string, number> = {}, bottoms: Record<string, number> = {}): string =>
  JSON.stringify({ tops, bottoms })

describe('SaveMergePolicy.computeMeta', () => {
  it('returns score=500 for a fresh-defaults snapshot (stage 1, nothing else)', () => {
    const meta = computeMeta(reader({}), '2026-04-27T10:00:00Z')
    expect(meta).toEqual({
      savedAt: '2026-04-27T10:00:00Z',
      progressScore: 500,
      schemaVersion: SCHEMA_VERSION,
      maxStage: 1
    })
  })

  it('counts stage * 500', () => {
    const meta = computeMeta(reader({ [SAVE_KEYS.STAGE]: '7' }))
    expect(meta.progressScore).toBe(7 * 500)
    expect(meta.maxStage).toBe(7)
  })

  it('clamps stage at 1 when storage has 0 / negative / garbage', () => {
    expect(computeMeta(reader({ [SAVE_KEYS.STAGE]: '0' })).progressScore).toBe(500)
    expect(computeMeta(reader({ [SAVE_KEYS.STAGE]: '-3' })).progressScore).toBe(500)
    expect(computeMeta(reader({ [SAVE_KEYS.STAGE]: 'abc' })).progressScore).toBe(500)
  })

  it('counts every upgrade level at 150 each across tops + bottoms', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.STAGE]: '1',
      [SAVE_KEYS.UPGRADES]: upgradesJson(
        { star: 3, triangle: 2 },             // 5 levels
        { speedy: 4, tanky: 1, balanced: 0 }  // 5 levels
      )
    }))
    // stage 1*500 + 10 levels * 150 = 500 + 1500 = 2000
    expect(meta.progressScore).toBe(2000)
  })

  it('ignores negative / non-numeric upgrade values defensively', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.UPGRADES]: JSON.stringify({
        tops: { star: -2, triangle: 'broken', round: 4 },
        bottoms: { speedy: NaN, tanky: 3 }
      })
    }))
    // Only `round: 4` and `tanky: 3` count → 7 * 150 = 1050; +500 stage = 1550
    expect(meta.progressScore).toBe(1550)
  })

  it('counts normal skins at 250 and special skins at 1500 (parsed from "topPartId:modelId" entries)', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.SKINS]: JSON.stringify([
        'star:reddragon',         // normal
        'triangle:phoenix',       // normal
        'star:tornado',           // SPECIAL — note: tornado IS in the special set
        'round:dark',             // SPECIAL
        'cushioned:diamond'       // SPECIAL
      ])
    }))
    // stage 1*500 + 2*250 normal + 3*1500 special = 500 + 500 + 4500 = 5500
    expect(meta.progressScore).toBe(5500)
  })

  it('handles bare modelId entries (no "topPartId:" prefix) the same way', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.SKINS]: JSON.stringify(['rainbow', 'phoenix'])
    }))
    // 1 special (rainbow) + 1 normal (phoenix) = 1500 + 250 + 500 = 2250
    expect(meta.progressScore).toBe(2250)
  })

  it('combines stage + upgrades + skins per the formula', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.STAGE]: '12',
      [SAVE_KEYS.UPGRADES]: upgradesJson({ star: 5 }, { speedy: 5 }),
      [SAVE_KEYS.SKINS]: JSON.stringify(['star:reddragon', 'star:tornado'])
    }))
    // 12*500 + 10*150 + 1*250 + 1*1500
    expect(meta.progressScore).toBe(6000 + 1500 + 250 + 1500)
    expect(meta.maxStage).toBe(12)
  })

  it('survives malformed JSON in upgrades / skins keys', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.STAGE]: '3',
      [SAVE_KEYS.UPGRADES]: '{not json',
      [SAVE_KEYS.SKINS]: 'also nope'
    }))
    expect(meta.progressScore).toBe(3 * 500)
  })
})

describe('SaveMergePolicy.parseMeta / serializeMeta', () => {
  it('round-trips a valid meta blob', () => {
    const meta: SaveMeta = {
      savedAt: '2026-04-27T18:30:00Z',
      progressScore: 1234,
      schemaVersion: SCHEMA_VERSION,
      maxStage: 4
    }
    expect(parseMeta(serializeMeta(meta))).toEqual(meta)
  })

  it('returns null for null / empty / non-string inputs', () => {
    expect(parseMeta(null)).toBeNull()
    expect(parseMeta(undefined)).toBeNull()
    expect(parseMeta('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseMeta('{nope')).toBeNull()
  })

  it('returns null when required fields are missing or wrong-typed', () => {
    expect(parseMeta(JSON.stringify({}))).toBeNull()
    expect(parseMeta(JSON.stringify({ savedAt: 'x', progressScore: 'oops', schemaVersion: 1, maxStage: 1 }))).toBeNull()
    expect(parseMeta(JSON.stringify({ savedAt: 'x', progressScore: NaN, schemaVersion: 1, maxStage: 1 }))).toBeNull()
  })
})

describe('SaveMergePolicy.decideMerge', () => {
  const meta = (overrides: Partial<SaveMeta>): SaveMeta => ({
    savedAt: '2026-04-27T12:00:00Z',
    progressScore: 0,
    schemaVersion: SCHEMA_VERSION,
    maxStage: 1,
    ...overrides
  })

  it('returns \'local-only\' when remote is null (network unreachable etc.)', () => {
    expect(decideMerge(meta({ progressScore: 5000 }), null)).toEqual({ kind: 'local-only' })
  })

  it('returns \'remote-only\' when local is null (truly fresh device)', () => {
    expect(decideMerge(null, meta({ progressScore: 5000 }))).toEqual({ kind: 'remote-only' })
  })

  it('returns \'remote-wins\' with bonus when remote score > local score AND local had progress', () => {
    const local = meta({ progressScore: 2000, maxStage: 4 })
    const remote = meta({ progressScore: 8000, maxStage: 12 })
    // bonus = remote.maxStage * 50 = 12 * 50 = 600
    expect(decideMerge(local, remote)).toEqual({ kind: 'remote-wins', bonusCoins: 600 })
  })

  it('returns \'remote-wins\' with NO bonus when local was completely empty (score 0)', () => {
    const local = meta({ progressScore: 0, maxStage: 1 })
    const remote = meta({ progressScore: 8000, maxStage: 12 })
    expect(decideMerge(local, remote)).toEqual({ kind: 'remote-wins', bonusCoins: 0 })
  })

  it('returns \'local-wins\' when local score > remote (player advanced offline)', () => {
    const local = meta({ progressScore: 8000 })
    const remote = meta({ progressScore: 2000 })
    expect(decideMerge(local, remote)).toEqual({ kind: 'local-wins' })
  })

  it('returns \'remote-wins\' (bonus 0) when scores tie but remote savedAt is newer', () => {
    const local = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    const remote = meta({ progressScore: 5000, savedAt: '2026-04-27T11:00:00Z' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'remote-wins', bonusCoins: 0 })
  })

  it('returns \'tie-keep-local\' when scores AND timestamps match', () => {
    const local = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    const remote = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'tie-keep-local' })
  })

  it('returns \'tie-keep-local\' when scores match and local savedAt is newer', () => {
    const local = meta({ progressScore: 5000, savedAt: '2026-04-27T11:00:00Z' })
    const remote = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'tie-keep-local' })
  })

  it('falls back to \'tie-keep-local\' when timestamps are unparseable on a score tie', () => {
    const local = meta({ progressScore: 5000, savedAt: 'garbage' })
    const remote = meta({ progressScore: 5000, savedAt: 'also garbage' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'tie-keep-local' })
  })
})

describe('SaveMergePolicy.applyBonusCoins', () => {
  it('adds the bonus to whatever coin total is in storage', () => {
    expect(applyBonusCoins(reader({ [SAVE_KEYS.COINS]: '300' }), 100)).toBe('400')
  })

  it('treats missing / unparseable coin storage as zero', () => {
    expect(applyBonusCoins(reader({}), 250)).toBe('250')
    expect(applyBonusCoins(reader({ [SAVE_KEYS.COINS]: 'oops' }), 250)).toBe('250')
  })

  it('clamps negative bonuses to zero (defensive)', () => {
    expect(applyBonusCoins(reader({ [SAVE_KEYS.COINS]: '500' }), -100)).toBe('500')
  })
})
