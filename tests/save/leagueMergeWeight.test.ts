// ─── The league never decides a save merge ─────────────────────────────────
//
// `smashers_league` rides along with whichever blob wins (it is a payload key,
// cloud-synced), but it must carry NO weight in the merge score: a ranked
// streak must neither win nor lose a hydrate, and online builds re-sync the
// standing from /league/me anyway. Checked with the league flag ON so the
// test is not vacuous on a league build.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const champion = JSON.stringify({
  v: 1, season: 3, lp: 2400, peakLp: 2600, bestTierEver: 'champion', streak: 9, shields: 3, floor: 1500,
  day: 20_000, fights: 16, adBonusUsed: 2, gained: 400, battles: 400,
  unlocked: true, unlockSeen: true, claimedSeason: 2, unclaimed: null, firstReachMask: 127
})
const read = (snap: Record<string, string>) => ({ get: (k: string) => snap[k] ?? null })

afterEach(() => vi.unstubAllEnvs())

describe('SaveMergePolicy × league', () => {
  it('a league state adds nothing to the progress score (flag on)', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'true')
    const { computeMeta, decideMerge, isPayloadKey } = await import('@/utils/save/SaveMergePolicy')
    const { LEAGUE_STATE_KEY } = await import('@/league/leagueGate')
    const base = { smashers_campaign_stage: '21', smashers_upgrades: JSON.stringify({ tops: { star: 4 }, bottoms: {} }) }
    const at = '2026-10-10T00:00:00.000Z'
    const plain = computeMeta(read(base), at)
    const withLeague = computeMeta(read({ ...base, [LEAGUE_STATE_KEY]: champion }), at)
    expect(withLeague).toEqual(plain)
    // It is cloud payload (travels with the winning blob)…
    expect(isPayloadKey(LEAGUE_STATE_KEY)).toBe(true)
    // …but a Champion league on the lower-progress side does not flip the merge.
    const remote = computeMeta(read({ ...base, smashers_campaign_stage: '22' }), at)
    expect(decideMerge(withLeague, remote)).toEqual({ kind: 'remote-wins', bonusCoins: 22 * 50 })
    expect(decideMerge(remote, withLeague)).toEqual({ kind: 'local-wins' })
    expect(decideMerge(withLeague, plain)).toEqual({ kind: 'tie-keep-local' })
  })

  it('the merge policy never reads a league key', () => {
    const src = readFileSync(path.resolve(__dirname, '../../src/utils/save/SaveMergePolicy.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/league/i)
  })
})
