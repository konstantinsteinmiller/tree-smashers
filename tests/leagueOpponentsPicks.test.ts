// @vitest-environment node
// ─── League opponents: persisted picks (LG3) ────────────────────────────────
//
// The three cards chosen for a (day, fightIndex) are stored device-only next
// to the pool cache, so a live pool that changes during the day cannot reroll
// them; a new fight or a new day draws again, and an online build only locks
// in a deck the live pool answered for.

import { describe, it, expect } from 'vitest'
import { generateNpcBuild } from '@/league/leagueNpc'
import { getOpponentDeck, readStoredPicks, type LeaguePoolFetcher, type OpponentContext } from '@/league/leagueOpponents'
import { LEAGUE_PICKS_KEY, LEAGUE_POOL_KEY } from '@/league/leagueKeys'
import { opponentTargets } from '@/league/leagueMath'
import { buildPower, type PlayerBuildV1 } from '@/utils/playerBuild'

const memStorage = () => {
  const m = new Map<string, string>()
  return {
    map: m,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v)
  }
}

const OWN_BUILD: PlayerBuildV1 = {
  v: 1,
  team: [
    { t: 'star', b: 'tanky', tl: 10, bl: 10, m: 'blades' },
    { t: 'round', b: 'speedy', tl: 10, bl: 10, m: 'nature' }
  ],
  sk: []
}

const ctx = (over: Partial<OpponentContext> = {}): OpponentContext => ({
  ownBuild: OWN_BUILD,
  ownPower: buildPower(OWN_BUILD),
  tier: 'wood',
  day: 20_000,
  fightIndex: 0,
  online: true,
  kids: false,
  skillsOn: false,
  ownId: 'p:9',
  sanitizeSkills: null,
  nowMs: 1_728_000_000_000,
  ...over
})

const poolAt = (prefix: string, seed = 1) =>
  opponentTargets(40, 'wood').map((p, i) => ({
    id: `${prefix}${i}`,
    name: `Player${prefix}${i}`,
    build: generateNpcBuild(seed + i, p, { skills: false })
  }))

const fetcherOf = (value: unknown): LeaguePoolFetcher & { calls: number } => {
  const f = { calls: 0, fetchPool: async () => { f.calls++; return value } }
  return f
}

const ids = (d: { cards: { oppId: string }[] }) => d.cards.map((c) => c.oppId)

describe('persisted picks', () => {
  it('a changed live pool cannot reroll today\'s cards for the same fight', async () => {
    const storage = memStorage()
    const a = await getOpponentDeck(ctx(), { fetcher: fetcherOf(poolAt('a:')), storage, baked: null })
    expect(ids(a)).toEqual(['a:0', 'a:1', 'a:2'])
    const bFetcher = fetcherOf(poolAt('b:', 11))
    const b = await getOpponentDeck(ctx(), { fetcher: bFetcher, storage, baked: null })
    expect(ids(b)).toEqual(ids(a))
    expect(b.cards.map((c) => c.name)).toEqual(a.cards.map((c) => c.name))
    expect(b.cards.map((c) => c.source)).toEqual(['live', 'live', 'live'])
    expect(b.cards.map((c) => c.difficulty)).toEqual(['easier', 'even', 'harder'])
    // The live fetch still ran: it answers liveOk and refreshes the cache.
    expect(bFetcher.calls).toBe(1)
    expect(b.liveOk).toBe(true)
    expect(JSON.parse(storage.map.get(LEAGUE_POOL_KEY)!).entries[0].id).toBe('b:0')
    // …and the unreachable server is still reported (O3).
    const c = await getOpponentDeck(ctx(), { fetcher: fetcherOf(null), storage, baked: null })
    expect(ids(c)).toEqual(ids(a))
    expect(c.liveOk).toBe(false)
  })

  it('the next fight and the next day draw again; only today is kept', async () => {
    const storage = memStorage()
    await getOpponentDeck(ctx(), { fetcher: fetcherOf(poolAt('a:')), storage, baked: null })
    const next = await getOpponentDeck(ctx({ fightIndex: 1 }), { fetcher: fetcherOf(poolAt('b:', 11)), storage, baked: null })
    expect(ids(next)).toEqual(['b:0', 'b:1', 'b:2'])
    const blob = JSON.parse(storage.map.get(LEAGUE_PICKS_KEY)!)
    expect(Object.keys(blob.fights).sort()).toEqual(['0', '1'])
    const tomorrow = await getOpponentDeck(ctx({ day: 20_001 }), { fetcher: fetcherOf(poolAt('c:', 21)), storage, baked: null })
    expect(ids(tomorrow)).toEqual(['c:0', 'c:1', 'c:2'])
    const blob2 = JSON.parse(storage.map.get(LEAGUE_PICKS_KEY)!)
    expect(blob2.day).toBe(20_001)
    expect(Object.keys(blob2.fights)).toEqual(['0'])
  })

  it('online: a fallback deck drawn while the live pool was away is not locked in', async () => {
    const storage = memStorage()
    const away = await getOpponentDeck(ctx(), { fetcher: fetcherOf(null), storage, baked: null })
    expect(away.cards.every((c) => c.source === 'generated')).toBe(true)
    expect(storage.map.has(LEAGUE_PICKS_KEY)).toBe(false)
    const back = await getOpponentDeck(ctx(), { fetcher: fetcherOf(poolAt('a:')), storage, baked: null })
    expect(ids(back)).toEqual(['a:0', 'a:1', 'a:2'])
  })

  it('offline builds persist their (generated / baked) deck too', async () => {
    const storage = memStorage()
    const one = await getOpponentDeck(ctx({ online: false }), { storage, baked: null })
    expect(readStoredPicks(storage, ctx({ online: false }))).not.toBeNull()
    const two = await getOpponentDeck(ctx({ online: false }), { storage, baked: null })
    expect(ids(two)).toEqual(ids(one))
  })

  it('another context (tier, own id, skills) rerolls; a corrupted blob is ignored', async () => {
    const storage = memStorage()
    await getOpponentDeck(ctx(), { fetcher: fetcherOf(poolAt('a:')), storage, baked: null })
    expect(readStoredPicks(storage, ctx({ tier: 'bronze' }))).toBeNull()
    expect(readStoredPicks(storage, ctx({ ownId: 'p:10' }))).toBeNull()
    expect(readStoredPicks(storage, ctx({ skillsOn: true }))).toBeNull()
    expect(readStoredPicks(storage, ctx())).not.toBeNull()
    storage.map.set(LEAGUE_PICKS_KEY, '{"v":1,"day":20000,"fights":{"0":{"ctx":"x","cards":[1,2]}}}')
    expect(readStoredPicks(storage, ctx())).toBeNull()
    storage.map.set(LEAGUE_PICKS_KEY, 'not json')
    const d = await getOpponentDeck(ctx(), { fetcher: fetcherOf(poolAt('b:', 11)), storage, baked: null })
    expect(ids(d)).toEqual(['b:0', 'b:1', 'b:2'])
  })

  it('the picks key is device-only and named after the pool cache', () => {
    expect(LEAGUE_PICKS_KEY.startsWith('spinner_')).toBe(false)
    expect(LEAGUE_PICKS_KEY.startsWith(LEAGUE_POOL_KEY)).toBe(true)
  })
})
