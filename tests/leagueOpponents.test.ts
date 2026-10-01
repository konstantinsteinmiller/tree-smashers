// @vitest-environment node
// ─── League opponents (LG1): NPC generator + opponent ladder ───────────────
//
// leagueNpc (worker-shared generator, ids, names) and leagueOpponents (live →
// device cache → baked → generator ladder, three cards per fight), plus the
// baked-pool plumbing (scripts/league-pool-snapshot.mjs and vite.config's
// leaguePoolPlugin on a league-off build).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import {
  NPC_BOTTOM_IDS,
  NPC_MAX_POWER,
  NPC_SKILL_IDS,
  NPC_SKINS_BY_TOP,
  NPC_TOP_IDS,
  generateNpcBuild,
  generatedOpponentName,
  npcBuildFromId,
  npcId,
  npcPowerFromId,
  parseNpcId
} from '@/league/leagueNpc'
import {
  getOpponentCards,
  getOpponentDeck,
  type LeaguePoolFetcher,
  type OpponentContext
} from '@/league/leagueOpponents'
import { LEAGUE_POOL_KEY } from '@/league/leagueKeys'
import { expectedScore, opponentTargets } from '@/league/leagueMath'
import { buildPower, buildSkillPower, validatePlayerBuildShape, type PlayerBuildV1 } from '@/utils/playerBuild'
import { isDenylistedName } from '@/utils/nameDenylist'
import { BOTTOM_PART_IDS, TOP_PART_IDS } from '@/types/spinner'
import { SKINS_PER_TOP, SPECIAL_SKINS, isEarnOnlySkin, type SpinnerModelId } from '@/data/skinCatalog'
import { SKILL_IDS } from '@/skills/skillIds'
import { sanitizeSkillLoadout } from '@/use/skills/skillLoadoutSanitizer'
// @ts-expect-error — plain .mjs script, no types
import { selectBuilds, bakedModuleValue, buildsFromExport, GZIP_BUDGET } from '../scripts/league-pool-snapshot.mjs'
import { gzipSync } from 'node:zlib'

const ROOT = path.resolve(__dirname, '..')

// ─── Fixtures ───────────────────────────────────────────────────────────────

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
  sk: [{ id: 'momentum', lv: 5 }]
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
  ownId: 'me-123',
  sanitizeSkills: null,
  nowMs: 1_790_000_000_000,
  ...over
})

/** Skill-less own power (skillsOn false). */
const OWN_POWER_NOSK = 40

/** A pool entry with a build at exactly `power` (no skills). */
const entryAt = (id: string, name: string, power: number, seed = 7) => ({
  id,
  name,
  build: generateNpcBuild(seed, power, { skills: false })
})

/** Entries hitting each of the three targets (skills off, own power 40). */
const poolAtTargets = (prefix: string, name = 'RealPlayer') => {
  const t = opponentTargets(OWN_POWER_NOSK, 'wood')
  return t.map((p, i) => entryAt(`${prefix}${i}`, `${name}${i}`, p, i + 1))
}

const fetcherOf = (value: unknown): LeaguePoolFetcher & { calls: number } => {
  const f = {
    calls: 0,
    fetchPool: async () => {
      f.calls++
      return value
    }
  }
  return f
}

// ─── Generator ──────────────────────────────────────────────────────────────

describe('leagueNpc — generator', () => {
  it('is deterministic per (seed, target) and hits the target within ±5 %', () => {
    for (const target of [1, 2, 5, 13, 26, 40, 52, 76, 101, 124, 160, 250, 600]) {
      for (let seed = 0; seed < 25; seed++) {
        const a = generateNpcBuild(seed * 7919, target)
        const b = generateNpcBuild(seed * 7919, target)
        expect(a).toEqual(b)
        expect(validatePlayerBuildShape(a)).toEqual(a)
        const p = buildPower(a)
        expect(Math.abs(p - target)).toBeLessThanOrEqual(Math.max(0, target * 0.05))
        const noSk = generateNpcBuild(seed * 7919, target, { skills: false })
        expect(noSk.sk).toEqual([])
        expect(Math.abs(buildPower(noSk) - target)).toBeLessThanOrEqual(target * 0.05)
      }
    }
  })

  it('different seeds give different teams; skills appear with power', () => {
    const builds = Array.from({ length: 20 }, (_, i) => JSON.stringify(generateNpcBuild(i, 60)))
    expect(new Set(builds).size).toBeGreaterThan(15)
    expect(generateNpcBuild(1, 10).sk.length).toBe(0)
    expect(generateNpcBuild(1, 30).sk.length).toBe(1)
    expect(generateNpcBuild(1, 80).sk.length).toBe(2)
  })

  it('clamps absurd targets into 1…NPC_MAX_POWER', () => {
    expect(buildPower(generateNpcBuild(3, -5))).toBe(1)
    expect(buildPower(generateNpcBuild(3, Number.NaN))).toBe(1)
    expect(buildPower(generateNpcBuild(3, 1e9))).toBe(NPC_MAX_POWER)
  })

  it('ids round-trip and the worker can recompute the build from the id', () => {
    const id = npcId(57, 0xdeadbeef)
    expect(id).toBe('npc:57:3735928559')
    expect(parseNpcId(id)).toEqual({ band: 57, seed: 0xdeadbeef })
    expect(npcBuildFromId(id)).toEqual(generateNpcBuild(0xdeadbeef, 57))
    expect(npcPowerFromId(id)).toBe(57)
    for (const bad of ['npc:0:1', 'npc:57', 'npc:57:-1', 'npc:x:1', 'me-123', 'npc:57:99999999999', 42]) {
      expect(parseNpcId(bad)).toBeNull()
    }
  })

  it('generated names are clean and stable', () => {
    for (let i = 0; i < 300; i++) {
      const n = generatedOpponentName(npcId(10 + (i % 90), i * 104729))
      expect(isDenylistedName(n)).toBe(false)
      expect(n).toMatch(/^[A-Z][a-z]+\d{6}$/)
    }
    expect(generatedOpponentName('npc:5:1')).toBe(generatedOpponentName('npc:5:1'))
  })
})

describe('leagueNpc — embedded catalog matches the real catalogs', () => {
  it('every top / bottom id exists', () => {
    const tops = new Set<string>(Object.values(TOP_PART_IDS))
    const bottoms = new Set<string>(Object.values(BOTTOM_PART_IDS))
    for (const t of NPC_TOP_IDS) expect(tops.has(t), t).toBe(true)
    for (const b of NPC_BOTTOM_IDS) expect(bottoms.has(b), b).toBe(true)
  })

  it('every skin exists under its top, is regular (not special, not earn-only)', () => {
    for (const [top, skins] of Object.entries(NPC_SKINS_BY_TOP)) {
      const real = SKINS_PER_TOP[top as keyof typeof SKINS_PER_TOP]
      expect(real, top).toBeDefined()
      for (const m of skins) {
        expect(real.includes(m as SpinnerModelId), `${top}/${m}`).toBe(true)
        expect(SPECIAL_SKINS.has(m as SpinnerModelId), m).toBe(false)
        expect(isEarnOnlySkin(m), m).toBe(false)
      }
    }
  })

  it('every skill id exists', () => {
    for (const s of NPC_SKILL_IDS) expect((SKILL_IDS as readonly string[]).includes(s), s).toBe(true)
  })
})

describe('leagueNpc — worker-shared purity guard (F5)', () => {
  const text = readFileSync(path.join(ROOT, 'src/league/leagueNpc.ts'), 'utf8')
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

  it('relative imports only, no env, no clock, no Math.random, no DOM / Vue', () => {
    const specs = [...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) expect(s.startsWith('.'), s).toBe(true)
    expect(code).not.toMatch(/import\.meta/)
    expect(code).not.toMatch(/\bimport\(/)
    expect(code).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now/)
    expect(code).not.toMatch(/\b(window|document|localStorage|navigator)\b/)
    expect(code).not.toMatch(/['"]vue['"]/)
  })
})

// ─── Opponent ladder ────────────────────────────────────────────────────────

describe('leagueOpponents — ladder', () => {
  it('online: live first, and the live pool is written to the device cache', async () => {
    const storage = memStorage()
    const fetcher = fetcherOf(poolAtTargets('live'))
    const deck = await getOpponentDeck(ctx(), { fetcher, storage, baked: null })
    expect(fetcher.calls).toBe(1)
    expect(deck.liveOk).toBe(true)
    expect(deck.cards.map((c) => c.source)).toEqual(['live', 'live', 'live'])
    expect(deck.cards.map((c) => c.oppId)).toEqual(['live0', 'live1', 'live2'])
    const cached = JSON.parse(storage.map.get(LEAGUE_POOL_KEY)!)
    expect(cached.v).toBe(1)
    expect(cached.entries.map((e: { id: string }) => e.id)).toEqual(['live0', 'live1', 'live2'])
    expect(LEAGUE_POOL_KEY.startsWith('spinner_')).toBe(false) // device-only
  })

  it('live unreachable → device cache', async () => {
    const storage = memStorage()
    await getOpponentDeck(ctx(), { fetcher: fetcherOf(poolAtTargets('c')), storage, baked: null })
    // Next fight (the same fight would reuse its persisted picks — LG3).
    const deck = await getOpponentDeck(ctx({ fightIndex: 1 }), { fetcher: fetcherOf(null), storage, baked: null })
    expect(deck.liveOk).toBe(false)
    expect(deck.cards.map((c) => c.source)).toEqual(['cache', 'cache', 'cache'])
  })

  it('a throwing fetcher is treated as unreachable', async () => {
    const fetcher: LeaguePoolFetcher = { fetchPool: () => Promise.reject(new Error('boom')) }
    const deck = await getOpponentDeck(ctx(), { fetcher, storage: memStorage(), baked: null })
    expect(deck.liveOk).toBe(false)
    expect(deck.cards.map((c) => c.source)).toEqual(['generated', 'generated', 'generated'])
  })

  it('a stale cache is ignored', async () => {
    const storage = memStorage()
    await getOpponentDeck(ctx(), { fetcher: fetcherOf(poolAtTargets('c')), storage, baked: null })
    const later = ctx({ nowMs: ctx().nowMs! + 4 * 86_400_000, fightIndex: 1 })
    const cards = await getOpponentCards(later, { fetcher: fetcherOf(null), storage, baked: null })
    expect(cards.every((c) => c.source === 'generated')).toBe(true)
  })

  it('no cache → baked pool, with generated names and bake: ids', async () => {
    const baked = { v: 1, builds: poolAtTargets('x').map((e) => e.build) }
    const cards = await getOpponentCards(ctx({ online: false }), { fetcher: fetcherOf(null), storage: memStorage(), baked })
    expect(cards.map((c) => c.source)).toEqual(['baked', 'baked', 'baked'])
    for (const c of cards) {
      expect(c.oppId).toMatch(/^bake:[0-9a-z]+$/)
      expect(c.name).toBe(generatedOpponentName(c.oppId))
    }
  })

  it('offline never calls the fetcher', async () => {
    const fetcher = fetcherOf(poolAtTargets('live'))
    const cards = await getOpponentCards(ctx({ online: false }), { fetcher, storage: memStorage(), baked: null })
    expect(fetcher.calls).toBe(0)
    expect(cards.every((c) => c.source === 'generated')).toBe(true)
  })

  it('empty pool everywhere → generator, npc ids recomputable, powers on target', async () => {
    const cards = await getOpponentCards(ctx(), { fetcher: fetcherOf([]), storage: memStorage(), baked: null })
    const targets = opponentTargets(OWN_POWER_NOSK, 'wood')
    expect(cards.map((c) => c.source)).toEqual(['generated', 'generated', 'generated'])
    cards.forEach((c, i) => {
      expect(parseNpcId(c.oppId)?.band).toBe(targets[i])
      expect(c.power).toBe(targets[i])
      expect(npcPowerFromId(c.oppId, { skills: false })).toBe(c.power)
      expect(c.team).toHaveLength(2)
    })
  })

  it('falls through per card: a pool that only fits one target fills that slot', async () => {
    const t = opponentTargets(OWN_POWER_NOSK, 'wood')
    const fetcher = fetcherOf([entryAt('only', 'Solo', t[1])])
    const cards = await getOpponentCards(ctx(), { fetcher, storage: memStorage(), baked: null })
    expect(cards.map((c) => c.source)).toEqual(['generated', 'live', 'generated'])
  })

  it('uses the tier floor when the challenger is below it', async () => {
    const cards = await getOpponentCards(ctx({ tier: 'gold' }), { storage: memStorage(), baked: null })
    expect(cards.map((c) => c.power)).toEqual(opponentTargets(OWN_POWER_NOSK, 'gold'))
  })
})

describe('leagueOpponents — cards', () => {
  it('difficulty labels easier / even / harder with strictly falling E and rising power', async () => {
    // A noisy pool: many players around the targets.
    const t = opponentTargets(OWN_POWER_NOSK, 'wood')
    const pool = Array.from({ length: 60 }, (_, i) => entryAt(`p${i}`, `Player${i}`, t[0] - 6 + (i % 30), i + 100))
    for (let fight = 0; fight < 10; fight++) {
      const cards = await getOpponentCards(ctx({ fightIndex: fight }), { fetcher: fetcherOf(pool), storage: memStorage(), baked: null })
      expect(cards.map((c) => c.difficulty)).toEqual(['easier', 'even', 'harder'])
      expect(cards[0]!.E).toBeGreaterThan(cards[1]!.E)
      expect(cards[1]!.E).toBeGreaterThan(cards[2]!.E)
      expect(cards[0]!.power).toBeLessThan(cards[1]!.power)
      expect(cards[1]!.power).toBeLessThan(cards[2]!.power)
      for (const c of cards) expect(c.E).toBeCloseTo(expectedScore(OWN_POWER_NOSK, c.power), 12)
      expect(new Set(cards.map((c) => c.oppId)).size).toBe(3)
    }
  })

  it('unknown skins, skills and parts are dropped (re-sanitised against this catalog)', async () => {
    const t = opponentTargets(buildPower(OWN_BUILD), 'wood')
    const base = generateNpcBuild(5, t[1], { skills: false })
    const skillPts = buildSkillPower(t[1], [4])
    const withJunk: PlayerBuildV1 = {
      v: 1,
      team: [
        { ...base.team[0]!, m: 'not-a-skin' },
        { ...base.team[1]!, tl: base.team[1]!.tl - skillPts }
      ],
      sk: [{ id: 'momentum', lv: 4 }, { id: 'future_skill', lv: 9 }]
    }
    const badPart: PlayerBuildV1 = { ...base, team: [{ ...base.team[0]!, t: 'hexagon' }, base.team[1]!] }
    const fetcher = fetcherOf([
      { id: 'junk', name: 'Junk', build: withJunk },
      { id: 'badpart', name: 'Bad', build: badPart }
    ])
    const cards = await getOpponentCards(
      ctx({ skillsOn: true, sanitizeSkills: sanitizeSkillLoadout }),
      { fetcher, storage: memStorage(), baked: null }
    )
    const junk = cards.find((c) => c.oppId === 'junk')!
    expect(junk).toBeDefined()
    expect(junk.team[0]!.modelId).toBeUndefined()
    expect(junk.team[1]!.modelId).toBe(base.team[1]!.m)
    expect(junk.skills).toEqual([{ id: 'momentum', level: 4 }])
    expect(junk.build.sk).toEqual([{ id: 'momentum', lv: 4 }])
    expect(cards.some((c) => c.oppId === 'badpart')).toBe(false)
  })

  it('skills off strips every skill and E uses the skill-less powers', async () => {
    const t = opponentTargets(OWN_POWER_NOSK, 'wood')
    const withSkills: PlayerBuildV1 = { ...generateNpcBuild(9, t[1], { skills: false }), sk: [{ id: 'guard_shell', lv: 10 }] }
    const fetcher = fetcherOf([{ id: 'sk', name: 'Skilled', build: withSkills }])
    const cards = await getOpponentCards(ctx({ skillsOn: false, sanitizeSkills: sanitizeSkillLoadout }), {
      fetcher,
      storage: memStorage(),
      baked: null
    })
    const c = cards.find((x) => x.oppId === 'sk')!
    expect(c.skills).toEqual([])
    expect(c.build.sk).toEqual([])
    expect(c.power).toBe(t[1])
    // Own build carries momentum L5 (= 4 power) — ignored with skills off.
    expect(c.E).toBeCloseTo(expectedScore(OWN_POWER_NOSK, t[1]), 12)
    for (const card of cards) expect(card.skills).toEqual([])
  })

  it('skills on counts skills on both sides', async () => {
    const cards = await getOpponentCards(ctx({ skillsOn: true, sanitizeSkills: sanitizeSkillLoadout, tier: 'silver' }), {
      storage: memStorage(),
      baked: null
    })
    const own = buildPower(OWN_BUILD)
    expect(cards.map((c) => c.power)).toEqual(opponentTargets(own, 'silver'))
    expect(cards.some((c) => c.skills.length > 0)).toBe(true)
    for (const c of cards) expect(buildPower(c.build)).toBe(c.power)
  })

  it('kids builds never show a pool name', async () => {
    const storage = memStorage()
    const pool = poolAtTargets('k', 'RealKidName')
    const kids = ctx({ kids: true })
    const live = await getOpponentCards(kids, { fetcher: fetcherOf(pool), storage, baked: null })
    const cached = await getOpponentCards(kids, { fetcher: fetcherOf(null), storage, baked: null })
    for (const c of [...live, ...cached]) {
      expect(c.name).not.toMatch(/RealKidName/)
      expect(c.name).toBe(generatedOpponentName(c.oppId))
    }
    // Non-kids see the (sanitised) real name.
    const adult = await getOpponentCards(ctx(), { fetcher: fetcherOf(pool), storage: memStorage(), baked: null })
    expect(adult.map((c) => c.name)).toEqual(['RealKidName0', 'RealKidName1', 'RealKidName2'])
  })

  it('denylisted pool names are masked', async () => {
    const t = opponentTargets(OWN_POWER_NOSK, 'wood')
    const cards = await getOpponentCards(ctx(), { fetcher: fetcherOf([entryAt('bad', 'Fuckface', t[1])]), storage: memStorage(), baked: null })
    const c = cards.find((x) => x.oppId === 'bad')!
    expect(isDenylistedName(c.name)).toBe(false)
  })

  it('stable per (day, fightIndex); another fight or day reshuffles', async () => {
    const t = opponentTargets(OWN_POWER_NOSK, 'wood')
    const pool = Array.from({ length: 90 }, (_, i) => entryAt(`s${i}`, `S${i}`, t[i % 3]!, i + 1))
    const run = (o: Partial<OpponentContext>) =>
      getOpponentCards(ctx(o), { fetcher: fetcherOf([...pool].reverse()), storage: memStorage(), baked: null }).then((cs) =>
        cs.map((c) => c.oppId)
      )
    const a = await run({ fightIndex: 3 })
    const b = await run({ fightIndex: 3 })
    expect(a).toEqual(b)
    const others = await Promise.all([run({ fightIndex: 4 }), run({ fightIndex: 5 }), run({ day: 20_001, fightIndex: 3 })])
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(a))).toBe(true)
    // Generator path is stable too.
    const g1 = await getOpponentCards(ctx({ fightIndex: 2 }), { storage: memStorage(), baked: null })
    const g2 = await getOpponentCards(ctx({ fightIndex: 2 }), { storage: memStorage(), baked: null })
    expect(g1).toEqual(g2)
  })

  it('never offers the player their own row', async () => {
    const t = opponentTargets(OWN_POWER_NOSK, 'wood')
    const pool = [entryAt('me-123', 'Me', t[0]), entryAt('me-123', 'Me', t[1]), entryAt('me-123', 'Me', t[2])]
    const storage = memStorage()
    const cards = await getOpponentCards(ctx(), { fetcher: fetcherOf(pool), storage, baked: null })
    expect(cards.some((c) => c.oppId === 'me-123')).toBe(false)
    const cached = await getOpponentCards(ctx(), { fetcher: fetcherOf(null), storage, baked: null })
    expect(cached.some((c) => c.oppId === 'me-123')).toBe(false)
  })

  it('ignores malformed pool entries', async () => {
    const t = opponentTargets(OWN_POWER_NOSK, 'wood')
    const fetcher = fetcherOf({ entries: [null, 5, { id: 'x' }, { id: 'bad id!', name: 'A', build: generateNpcBuild(1, t[1]) }, entryAt('ok', 'Fine', t[1])] })
    const cards = await getOpponentCards(ctx(), { fetcher, storage: memStorage(), baked: null })
    expect(cards.map((c) => c.oppId)[1]).toBe('ok')
  })
})

// ─── Baked pool ─────────────────────────────────────────────────────────────

describe('baked pool (scripts/league-pool-snapshot.mjs)', () => {
  it('keeps builds only, spread over power, within the gzip budget', () => {
    const exportBody = {
      entries: Array.from({ length: 1500 }, (_, i) => ({
        id: `user-${i}`,
        name: `Name${i}`,
        build: generateNpcBuild(i * 31, 5 + (i % 300))
      }))
    }
    const builds = selectBuilds(buildsFromExport(exportBody)) as PlayerBuildV1[]
    expect(builds.length).toBeGreaterThan(100)
    const value = bakedModuleValue({ v: 1, builds })
    const gz = gzipSync(Buffer.from(`export default ${JSON.stringify(value)}`)).length
    expect(gz).toBeLessThanOrEqual(GZIP_BUDGET)
    const text = JSON.stringify(value)
    expect(text).not.toMatch(/user-|Name\d/)
    const powers = builds.map(buildPower)
    expect(Math.min(...powers)).toBeLessThan(20)
    expect(Math.max(...powers)).toBeGreaterThan(250)
    expect(bakedModuleValue({ v: 1, builds: [] })).toBeNull()
  })

  it('vite.config: a league-off build logs "skipped", bakes null and runs no refresh', async () => {
    const { loadConfigFromFile } = await import('vite')
    const poolFile = path.join(ROOT, 'data/league-pool.json')
    const before = existsSync(poolFile) ? statSync(poolFile).mtimeMs : null
    vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'false')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const loaded = await loadConfigFromFile({ command: 'build', mode: 'crazy-web' }, path.join(ROOT, 'vite.config.ts'), ROOT, 'silent')
      const plugins = (loaded!.config.plugins ?? []).flat(5) as { name?: string; buildStart?: () => void; resolveId?: (id: string) => unknown; load?: (id: string) => unknown }[]
      const plugin = plugins.find((p) => p?.name === 'chaos-arena-league-pool')!
      expect(plugin).toBeDefined()
      plugin.buildStart!.call({})
      const resolved = plugin.resolveId!.call({}, 'virtual:league-pool') as string
      expect(plugin.load!.call({}, resolved)).toBe('export default null')
      expect(log.mock.calls.flat().join('\n')).toMatch(/\[league-pool\] skipped/)
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(existsSync(poolFile) ? statSync(poolFile).mtimeMs : null).toBe(before)
    } finally {
      log.mockRestore()
      fetchSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  }, 60_000)
})

afterEach(() => {
  vi.restoreAllMocks()
})
