// @vitest-environment node
// The league routes of the leaderboard Worker (league plan LG4), driven through
// the Worker's real `fetch` against a real-SQLite D1 double loaded with
// worker/schema.sql — so every join, range scan and conditional update the
// routes issue is executed by an actual SQL engine.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import worker from '../../worker/src/index'
import {
  divisionFloorLp,
  expectedScore,
  MIN_BATTLE_MS,
  seasonBounds,
  SERVER_DAILY_CAP,
  TOKEN_TTL_MS,
  DAY_MS
} from '@/league/leagueMath'
import { npcBuildFromId, npcId } from '@/league/leagueNpc'
import { buildPower, type PlayerBuildV1 } from '@/utils/playerBuild'
import { safeNameFor, sanitizeDisplayName } from '@/utils/nameDenylist'
import { sqliteD1, WORKER_DIR, type SqliteD1 } from './sqliteD1'

const HOUR = 3_600_000
const SEASON = 3
/** Mid-season, mid-day UTC. */
const T0 = seasonBounds(SEASON).startMs + 2 * DAY_MS + 10 * HOUR
let clock = T0
const SECRET = 'league-test-secret'
const ME = 'player-0001'

beforeEach(() => {
  clock = T0
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as { caches?: unknown }).caches
})

const BUILD: PlayerBuildV1 = {
  v: 1,
  team: [
    { t: 'star', b: 'balanced', tl: 12, bl: 9, m: 'reddragon' },
    { t: 'round', b: 'tanky', tl: 7, bl: 4, m: 'bear' }
  ],
  sk: [{ id: 'guard_shell', lv: 3 }, { id: 'momentum', lv: 2 }]
}
const OPP_BUILD: PlayerBuildV1 = {
  v: 1,
  team: [
    { t: 'triangle', b: 'speedy', tl: 10, bl: 10, m: 'thunder' },
    { t: 'piercer', b: 'balanced', tl: 9, bl: 8, m: 'wulf' }
  ],
  sk: [{ id: 'phase_step', lv: 4 }]
}
const NPC = npcId(36, 12345)

type Json = Record<string, any>

const setup = (secret: string | null = SECRET) => {
  const d1 = sqliteD1()
  const env = secret ? { DB: d1.db, LEAGUE_SECRET: secret } : { DB: d1.db }
  const call = async (method: 'GET' | 'POST', p: string, body?: Json) => {
    const res = await worker.fetch(
      new Request(`https://lb.test${p}`, {
        method,
        headers: { origin: 'https://game.test' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
      env
    )
    return { status: res.status, json: await res.json() as Json, headers: res.headers }
  }
  const start = (over: Json = {}) => call('POST', '/league/start', { id: ME, name: 'Rusty', build: BUILD, opp: NPC, ...over })
  const result = (token: string, res: 'win' | 'loss', over: Json = {}) =>
    call('POST', '/league/result', { id: ME, token, result: res, durationMs: 12_500, ...over })
  return { d1, env, call, start, result }
}

/** A scores row with a build; returns its rowid (the pool id is `p:<rowid>`). */
const seedScore = (d1: SqliteD1, id: string, name: string, build: PlayerBuildV1 | null, extra: Json = {}): number => {
  d1.sql.prepare(
    'INSERT INTO scores (id, name, score, power, updated_at, build, build_at, lpower) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, 30, 40, T0 - 5 * HOUR, build ? JSON.stringify(build) : null, build ? T0 - 5 * HOUR : null,
    build ? buildPower(build) : null)
  void extra
  return Number((d1.sql.prepare('SELECT rowid AS r FROM scores WHERE id = ?').get(id) as { r: number }).r)
}

const seedLeague = (d1: SqliteD1, over: Json = {}) => {
  const row: Json = {
    id: ME, season: SEASON, lp: 0, peak_lp: 0, best_tier: 0, wins: 0, losses: 0, streak: 0, shields: 0,
    floor: 0, day: Math.floor(T0 / DAY_MS), fights: 0, gained: 0, pend_tok: null, pend_at: null,
    pend_opp: null, pend_e: null, name: 'Rusty', updated_at: T0 - HOUR, last_season: null, last_tier: null,
    ...over
  }
  if (row.peak_lp < row.lp) row.peak_lp = row.lp
  const cols = Object.keys(row)
  d1.sql.prepare(`INSERT INTO league (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...(cols.map((c) => row[c]) as never[]))
}

const leagueRow = (d1: SqliteD1, id = ME): Json =>
  ({ ...(d1.sql.prepare('SELECT * FROM league WHERE id = ?').get(id) as object) })

describe('worker /league/start — server recomputes the fight', () => {
  it('npc opponent: regenerated from its id; E from the server powers, never the client', async () => {
    const { start } = setup()
    const r = await start({ E: 0.99, oppPower: 1, ownPower: 999 })
    expect(r.status).toBe(200)
    expect(r.json.token).toMatch(/^v1\.\d+\.\d+\.[0-9a-f]{32}\.[0-9a-f]{64}$/)
    expect(Number.isInteger(r.json.seed) && r.json.seed > 0).toBe(true)
    const npc = npcBuildFromId(NPC)!
    expect(r.json.opp.build).toEqual(npc)
    expect(r.json.opp.power).toBe(buildPower(npc))
    expect(r.json.ownPower).toBe(buildPower(BUILD))
    const E = Math.round(expectedScore(buildPower(BUILD), buildPower(npc)) * 1e4) / 1e4
    expect(r.json.E).toBe(E)
    expect(r.json.opp.name).not.toMatch(/npc/)
    expect(r.json.expiresAt).toBe(T0 + TOKEN_TTL_MS)
  })

  it('skills-off caps: both teams lose their skills before the powers are computed', async () => {
    const { d1, start } = setup()
    const rid = seedScore(d1, 'rival-0001', 'Rival', OPP_BUILD)
    const on = await start({ opp: `p:${rid}` })
    const s1 = on.json
    expect(s1.opp.build.sk.length).toBe(1)
    // a second, different fight (the first one counts as abandoned)
    const off = await start({ opp: NPC, caps: { skills: false } })
    expect(off.status).toBe(200)
    expect(off.json.ownPower).toBe(buildPower({ ...BUILD, sk: [] }))
    expect(off.json.opp.build).toEqual(npcBuildFromId(NPC, { skills: false }))
    expect(off.json.opp.build.sk).toEqual([])
    const offPlayer = await start({ opp: `p:${rid}`, caps: { skills: false } })
    expect(offPlayer.json.opp.build.sk).toEqual([])
    expect(offPlayer.json.opp.power).toBe(buildPower({ ...OPP_BUILD, sk: [] }))
    expect(offPlayer.json.E).toBe(Math.round(expectedScore(buildPower({ ...BUILD, sk: [] }), buildPower({ ...OPP_BUILD, sk: [] })) * 1e4) / 1e4)
  })

  it('NPC regeneration follows caps.skills from the REQUEST, not the posted build', async () => {
    const { start } = setup()
    const r = await start({ build: { ...BUILD, sk: [] } })
    expect(r.json.opp.build).toEqual(npcBuildFromId(NPC))
    expect(r.json.opp.build.sk.length).toBeGreaterThan(0)
  })

  it('rejects a bad build, a bad opponent id, a missing pool row and yourself', async () => {
    const { d1, start } = setup()
    expect((await start({ build: { v: 1, team: [], sk: [] } })).status).toBe(400)
    expect((await start({ opp: 'npc:99999:1' })).status).toBe(400)
    expect((await start({ opp: ME })).status).toBe(400) // raw player ids are never opponents
    expect((await start({ opp: 'bake:3f2a9c' })).status).toBe(400) // baked cards are not rankable
    expect((await start({ opp: 'p:4242' })).status).toBe(404)
    const self = seedScore(d1, ME, 'Rusty', BUILD)
    const r = await start({ opp: `p:${self}` })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe('self')
    // none of the refusals left a league row behind
    expect(d1.sql.prepare('SELECT COUNT(*) AS n FROM league').get()).toEqual(expect.objectContaining({ n: 0 }))
  })

  it('without LEAGUE_SECRET start/result are 503, the reads still answer', async () => {
    const { start, call } = setup(null)
    expect((await start()).status).toBe(503)
    expect((await call('POST', '/league/result', { id: ME, token: 'x', result: 'win' })).status).toBe(503)
    expect((await call('GET', '/league/pool?band=4')).status).toBe(200)
    expect((await call('GET', `/league/me?id=${ME}`)).status).toBe(200)
  })
})

describe('worker /league/result — tokens', () => {
  it('a win after MIN_BATTLE_MS is applied once; a replay is refused', async () => {
    const { d1, start, result } = setup()
    const s = await start()
    clock += MIN_BATTLE_MS + 500
    const r = await result(s.json.token, 'win')
    expect(r.status).toBe(200)
    expect(r.json.delta).toBeGreaterThan(0)
    expect(r.json.state.lp).toBe(r.json.delta)
    expect(r.json.state.wins).toBe(1)
    expect(r.json.state.pending).toBeNull()
    const row = leagueRow(d1)
    expect(row.lp).toBe(r.json.delta)
    expect(row.pend_tok).toBeNull()
    const again = await result(s.json.token, 'win')
    expect(again.status).toBe(409)
    expect(leagueRow(d1).lp).toBe(r.json.delta)
  })

  it('a forged or foreign token is refused and changes nothing', async () => {
    const { d1, start, result, call } = setup()
    const s = await start()
    clock += MIN_BATTLE_MS + 500
    const t: string = s.json.token
    const forged = t.slice(0, -1) + (t.endsWith('0') ? '1' : '0')
    expect((await result(forged, 'win')).status).toBe(401)
    // a well-formed token minted with another secret
    const other = t.replace(/[0-9a-f]{64}$/, 'a'.repeat(64))
    expect((await result(other, 'win')).status).toBe(401)
    // somebody else's valid token on my id
    const theirs = await call('POST', '/league/start', { id: 'player-0002', name: 'B', build: BUILD, opp: NPC })
    expect((await result(theirs.json.token, 'win')).status).toBe(401)
    expect(leagueRow(d1).lp).toBe(0)
    expect(leagueRow(d1).pend_tok).toBe(t)
    // the genuine one still works
    expect((await result(t, 'win')).status).toBe(200)
  })

  it('a win faster than MIN_BATTLE_MS is refused (pending kept); a loss may come at once', async () => {
    const { d1, start, result } = setup()
    const s = await start()
    clock += MIN_BATTLE_MS - 2_000
    const fast = await result(s.json.token, 'win', { durationMs: 1_000 })
    expect(fast.status).toBe(422)
    expect(leagueRow(d1).pend_tok).toBe(s.json.token)
    clock += 3_000
    expect((await result(s.json.token, 'win', { durationMs: 60_000 })).status).toBe(422) // longer than the fight could be
    expect((await result(s.json.token, 'win')).status).toBe(200)

    const s2 = await start({ opp: npcId(40, 7) })
    clock += 1_000
    const surrender = await result(s2.json.token, 'loss', { durationMs: 900 })
    expect(surrender.status).toBe(200)
    expect(surrender.json.state.losses).toBe(1)
  })

  it('an expired token is refused with 410 and settles the fight as a loss', async () => {
    const { d1, start, result } = setup()
    seedLeague(d1, { lp: 450, peak_lp: 450, streak: 2 }) // Bronze II, f = 0.5
    const s = await start()
    clock += TOKEN_TTL_MS + 1_000
    const r = await result(s.json.token, 'win')
    expect(r.status).toBe(410)
    expect(r.json.error).toBe('expired')
    expect(r.json.delta).toBeLessThan(0)
    const row = leagueRow(d1)
    expect(row.lp).toBe(450 + r.json.delta)
    expect(row.losses).toBe(1)
    expect(row.streak).toBe(0)
    expect(row.pend_tok).toBeNull()
    expect((await result(s.json.token, 'win')).status).toBe(409)
  })
})

describe('worker /league/start — abandoned fights, caps', () => {
  it('an abandoned (expired) fight is a loss on the next start', async () => {
    const { d1, start } = setup()
    seedLeague(d1, { lp: 450, peak_lp: 450 })
    await start()
    clock += TOKEN_TTL_MS + 60_000
    const next = await start({ opp: npcId(38, 9) })
    expect(next.status).toBe(200)
    expect(next.json.abandoned.reason).toBe('expired')
    expect(next.json.abandoned.delta).toBeLessThan(0)
    expect(next.json.state.losses).toBe(1)
    expect(next.json.state.lp).toBe(450 + next.json.abandoned.delta)
  })

  it('a different start while a fight is open abandons it; the same start resumes it', async () => {
    const { d1, start } = setup()
    seedLeague(d1, { lp: 450, peak_lp: 450 })
    const a = await start()
    const again = await start()
    expect(again.json.resumed).toBe(true)
    expect(again.json.token).toBe(a.json.token)
    expect(again.json.seed).toBe(a.json.seed)
    expect(leagueRow(d1).fights).toBe(1)
    const b = await start({ opp: npcId(38, 9) })
    expect(b.json.abandoned.reason).toBe('abandoned')
    expect(b.json.state.losses).toBe(1)
    expect(leagueRow(d1).fights).toBe(2)
  })

  it(`caps /league/start at ${SERVER_DAILY_CAP} per UTC day`, async () => {
    const { d1, start, result } = setup()
    for (let i = 0; i < SERVER_DAILY_CAP; i++) {
      const s = await start({ opp: npcId(30 + i, i + 1) })
      expect(s.status).toBe(200)
      clock += 1_000
      expect((await result(s.json.token, 'loss', { durationMs: 900 })).status).toBe(200)
    }
    const over = await start({ opp: npcId(30, 99) })
    expect(over.status).toBe(429)
    expect(over.json.error).toBe('daily cap')
    expect(leagueRow(d1).fights).toBe(SERVER_DAILY_CAP)
    clock = (Math.floor(clock / DAY_MS) + 1) * DAY_MS + HOUR
    const tomorrow = await start({ opp: npcId(30, 99) })
    expect(tomorrow.status).toBe(200)
    expect(tomorrow.json.state.fightsToday).toBe(1)
  })

  it('the +400 LP/day gain cap holds (leagueMath.applyBattle)', async () => {
    const { d1, start, result } = setup()
    seedLeague(d1, { lp: 350, peak_lp: 350, gained: 395 })
    const s = await start()
    clock += MIN_BATTLE_MS + 1
    const r = await result(s.json.token, 'win')
    expect(r.json.delta).toBe(5)
    expect(r.json.capped).toBe(true)
    expect(r.json.state.dayGain).toBe(400)
    clock = (Math.floor(clock / DAY_MS) + 1) * DAY_MS + HOUR
    const s2 = await start()
    clock += MIN_BATTLE_MS + 1
    const r2 = await result(s2.json.token, 'win')
    expect(r2.json.capped).toBe(false)
    expect(r2.json.delta).toBeGreaterThan(5)
  })

  it('LM3: a lost Wood gatekeeper fight costs no LP (leagueMath rule, not re-implemented)', async () => {
    const { d1, start, result } = setup()
    seedLeague(d1, { lp: 299, peak_lp: 299 })
    const g = await start({ gateTier: 'bronze' })
    clock += MIN_BATTLE_MS + 1
    const r = await result(g.json.token, 'loss')
    expect(r.json.isGate).toBe(true)
    expect(r.json.delta).toBe(0)
    expect(r.json.state.lp).toBe(299)
  })

  it('the promotion gate: only a gate start at x99, and its win promotes', async () => {
    const { d1, start, result } = setup()
    seedLeague(d1, { lp: 299, peak_lp: 299 })
    const plain = await start()
    expect(plain.status).toBe(409)
    expect(plain.json.error).toBe('gate')
    expect(plain.json.gateTier).toBe('bronze')
    expect((await start({ gateTier: 'silver' })).status).toBe(409)
    const g = await start({ gateTier: 'bronze' })
    expect(g.status).toBe(200)
    expect(g.json.opp).toBeNull()
    expect(g.json.gate).toBe('bronze')
    clock += MIN_BATTLE_MS + 1
    const r = await result(g.json.token, 'win')
    expect(r.json.isGate).toBe(true)
    expect(r.json.promotedTo).toBe('bronze')
    expect(r.json.state.lp).toBe(300)
    expect(r.json.state.shields).toBe(3)
    // not at a gate any more
    expect((await start({ gateTier: 'silver' })).json.error).toBe('not at gate')
  })
})

describe('worker /league/me — lazy season reset', () => {
  it('reports the reset without writing it; the next start persists it', async () => {
    const { d1, call, start } = setup()
    seedLeague(d1, { season: SEASON - 1, lp: 1000, peak_lp: 1100, wins: 7, losses: 3, day: Math.floor(T0 / DAY_MS) - 20 })
    const me = await call('GET', `/league/me?id=${ME}`)
    expect(me.status).toBe(200)
    expect(me.headers.get('cache-control')).toBe('no-store')
    expect(me.json.exists).toBe(true)
    expect(me.json.state.season).toBe(SEASON)
    expect(me.json.state.lp).toBe(divisionFloorLp(Math.floor(1000 * 0.6)))
    expect(me.json.state.wins).toBe(0)
    expect(me.json.state.lastSeason).toEqual({ season: SEASON - 1, peakTier: 'gold' })
    expect(leagueRow(d1).season).toBe(SEASON - 1) // read-only
    await start()
    const row = leagueRow(d1)
    expect(row.season).toBe(SEASON)
    expect(row.lp).toBe(600)
    expect(row.last_season).toBe(SEASON - 1)
    expect(row.best_tier).toBe(3) // Gold (1100) stays the best ever
    // still reported after the reset was written
    expect((await call('GET', `/league/me?id=${ME}`)).json.state.lastSeason.season).toBe(SEASON - 1)
  })

  it('an unknown player gets a fresh standing and their own pool id', async () => {
    const { d1, call } = setup()
    const rid = seedScore(d1, ME, 'Rusty', BUILD)
    const me = await call('GET', `/league/me?id=${ME}`)
    expect(me.json.exists).toBe(false)
    expect(me.json.state).toEqual(expect.objectContaining({ lp: 0, tier: 'wood', division: 3, season: SEASON, pending: null }))
    expect(me.json.poolId).toBe(`p:${rid}`)
    expect((await call('GET', '/league/me?id=bad')).status).toBe(400)
  })
})

describe('worker /league — opponents are read, never written', () => {
  it('a full fight against a pool player leaves their scores row untouched', async () => {
    const { d1, start, result } = setup()
    const rid = seedScore(d1, 'rival-0001', 'Rival', OPP_BUILD)
    const before = { ...(d1.sql.prepare('SELECT * FROM scores WHERE id = ?').get('rival-0001') as object) }
    const s = await start({ opp: `p:${rid}` })
    expect(s.status).toBe(200)
    expect(s.json.opp.build).toEqual(OPP_BUILD)
    expect(s.json.opp.id).toBe(`p:${rid}`)
    clock += MIN_BATTLE_MS + 1
    expect((await result(s.json.token, 'win')).status).toBe(200)
    expect({ ...(d1.sql.prepare('SELECT * FROM scores WHERE id = ?').get('rival-0001') as object) }).toEqual(before)
    expect(d1.log.filter((l) => l.kind === 'write' && /scores/i.test(l.sql))).toEqual([])
    expect(d1.sql.prepare('SELECT COUNT(*) AS n FROM league WHERE id = ?').get('rival-0001')).toEqual(expect.objectContaining({ n: 0 }))
  })

  it('quota: one fight costs ≤ 2 read and ≤ 2 write statements', async () => {
    const { d1, start, result } = setup()
    const rid = seedScore(d1, 'rival-0001', 'Rival', OPP_BUILD)
    seedLeague(d1, { lp: 120, peak_lp: 120 })
    const n0 = d1.log.length
    const s = await start({ opp: `p:${rid}` })
    clock += MIN_BATTLE_MS + 1
    await result(s.json.token, 'loss')
    const fight = d1.log.slice(n0)
    expect(fight.filter((l) => l.kind === 'read').length).toBeLessThanOrEqual(2)
    expect(fight.filter((l) => l.kind === 'write').length).toBeLessThanOrEqual(2)
  })
})

describe('worker /league/pool, /top, /pool-export', () => {
  it('pool: builds in the band window, p:<rowid> ids, denylisted names masked, cached', async () => {
    const { d1, call } = setup()
    seedScore(d1, 'rival-0001', 'MeinKampf123', OPP_BUILD) // power 41
    seedScore(d1, 'rival-0002', 'Clean_1', BUILD) // power 36
    seedScore(d1, 'rival-0003', 'NoBuild', null)
    seedScore(d1, 'rival-0004', 'Far', { ...BUILD, team: BUILD.team.map((s) => ({ ...s, tl: 150, bl: 150 })) })
    const r = await call('GET', '/league/pool?band=4')
    expect(r.status).toBe(200)
    expect(r.json.lo).toBeLessThanOrEqual(36)
    expect(r.json.hi).toBeGreaterThanOrEqual(41)
    const names = r.json.entries.map((e: Json) => e.name).sort()
    expect(names).toEqual([safeNameFor('MeinKampf123'), 'Clean_1'].sort())
    for (const e of r.json.entries) {
      expect(e.id).toMatch(/^p:\d+$/)
      expect(e.lpower).toBe(buildPower(e.build))
    }
    expect(JSON.stringify(r.json)).not.toContain('rival-000')
    expect(r.headers.get('access-control-allow-origin')).toBe('https://game.test')
    // second read inside the 10 min TTL: served from league_cache, no scan
    const n0 = d1.log.length
    await call('GET', '/league/pool?band=4')
    expect(d1.log.slice(n0).some((l) => /FROM scores/.test(l.sql))).toBe(false)
    // ?id= drops the caller's own row — from the cached pool, no new scan
    const own = await call('GET', '/league/pool?band=4&id=rival-0002')
    expect(own.json.entries.map((e: Json) => e.name)).toEqual([safeNameFor('MeinKampf123')])
    expect(JSON.stringify(own.json)).not.toContain('rival-000')
    expect(JSON.stringify(own.json)).not.toContain('sid')
    expect((await call('GET', '/league/pool?band=4&id=x')).status).toBe(400)
    expect((await call('GET', '/league/pool?band=-1')).status).toBe(400)
    expect((await call('GET', '/league/pool?band=x')).status).toBe(400)
  })

  it('top: this season only, ranks share ties, names masked, LP histogram, no ids', async () => {
    const { d1, call } = setup()
    seedLeague(d1, { id: 'a-player-01', name: 'Alpha', lp: 1850 })
    seedLeague(d1, { id: 'a-player-02', name: 'f.u.c.k_y0u', lp: 640 })
    seedLeague(d1, { id: 'a-player-03', name: 'Gamma', lp: 640 })
    seedLeague(d1, { id: 'a-player-04', name: 'Old', lp: 1700, season: SEASON - 1 })
    const r = await call('GET', '/league/top')
    expect(r.status).toBe(200)
    expect(r.json.season).toBe(SEASON)
    expect(r.json.entries.map((e: Json) => [e.rank, e.lp])).toEqual([[1, 1850], [2, 640], [2, 640]])
    expect(r.json.entries.map((e: Json) => e.name)).toContain(sanitizeDisplayName('f.u.c.k_y0u'))
    expect(r.json.entries.map((e: Json) => e.name)).not.toContain('f.u.c.k_y0u')
    expect(r.json.entries[0].tier).toBe('champion')
    expect(r.json.dist).toEqual([[1850, 1], [600, 2]])
    expect(r.json.total).toBe(3)
    expect(JSON.stringify(r.json)).not.toContain('a-player')
  })

  it('pool-export: every band, thinned, masked, no ids', async () => {
    const { d1, call } = setup()
    for (let i = 0; i < 12; i++) seedScore(d1, `rival-${1000 + i}`, i === 0 ? 'MeinKampf123' : `P${i}`, OPP_BUILD)
    seedScore(d1, 'rival-2000', 'Low', { ...BUILD, team: BUILD.team.map((s) => ({ ...s, tl: 1, bl: 1 })), sk: [] })
    const r = await call('GET', '/league/pool-export')
    expect(r.status).toBe(200)
    expect(r.json.entries.length).toBe(8 + 1)
    expect(JSON.stringify(r.json)).not.toContain('rival-')
    expect(JSON.stringify(r.json)).not.toContain('MeinKampf')
  })
})

describe('worker /league — D1 failure is a 503, never a throw', () => {
  const fakeEdge = () => {
    const store = new Map<string, Response>()
    ;(globalThis as { caches?: unknown }).caches = {
      default: {
        match: async (req: Request) => store.get(req.url)?.clone(),
        put: async (req: Request, res: Response) => { store.set(req.url, res.clone()) }
      }
    }
    return store
  }

  it('every route answers 503 JSON while D1 refuses', async () => {
    const { d1, call, start } = setup()
    seedLeague(d1)
    const s = await start()
    d1.fail.on = true
    for (const r of [
      await start({ opp: npcId(50, 1) }),
      await call('POST', '/league/result', { id: ME, token: s.json.token, result: 'loss' }),
      await call('GET', `/league/me?id=${ME}`),
      await call('GET', '/league/pool?band=4'),
      await call('GET', '/league/top'),
      await call('GET', '/league/pool-export')
    ]) {
      expect(r.status).toBe(503)
      expect(r.json.error).toBeTruthy()
    }
  })

  it('pool and top fall back to the edge emergency copy', async () => {
    const store = fakeEdge()
    const { d1, call } = setup()
    seedScore(d1, 'rival-0001', 'Rival', OPP_BUILD)
    const ok = await call('GET', '/league/pool?band=4')
    expect(ok.status).toBe(200)
    // the 60 s copy is gone; D1 is down; the day-long copy answers
    store.delete('https://lb.test/league/pool?band=4')
    d1.fail.on = true
    const stale = await call('GET', '/league/pool?band=4')
    expect(stale.status).toBe(200)
    expect(stale.headers.get('x-league-stale')).toBe('1')
    expect(stale.json.entries.length).toBe(1)
    expect(JSON.stringify(stale.json)).not.toContain('rival-0001')
    // an edge hit is re-shaped per caller too
    d1.fail.on = false
    await call('GET', '/league/pool?band=5')
    const hit = await call('GET', '/league/pool?band=5&id=rival-0001')
    expect(hit.json.entries).toEqual([])
  })
})

describe('migration 0003', () => {
  it('is idempotent and matches schema.sql', () => {
    const mig = path.join(WORKER_DIR, 'migrations/0003_league.sql')
    const migrated = sqliteD1([mig, mig])
    const fresh = sqliteD1()
    const cols = (d: SqliteD1, t: string) =>
      (d.sql.prepare(`PRAGMA table_info(${t})`).all() as { name: string; type: string }[]).map((c) => `${c.name}:${c.type}`)
    expect(cols(migrated, 'league')).toEqual(cols(fresh, 'league'))
    expect(cols(migrated, 'league_cache')).toEqual(cols(fresh, 'league_cache'))
    const idx = (d: SqliteD1) => (d.sql.prepare('PRAGMA index_list(league)').all() as { name: string }[]).map((i) => i.name)
    expect(idx(migrated)).toContain('idx_league_season_lp')
  })

  it('the pool scan and the top read use their indexes', () => {
    const { sql } = sqliteD1()
    const plan = (q: string) => JSON.stringify(sql.prepare(`EXPLAIN QUERY PLAN ${q}`).all())
    expect(plan('SELECT rowid, name, build, lpower FROM scores WHERE build IS NOT NULL AND lpower >= 1 AND lpower < 9 ORDER BY lpower, build_at DESC LIMIT 16'))
      .toContain('idx_scores_lpower')
    expect(plan('SELECT name, lp FROM league WHERE season = 3 ORDER BY lp DESC, updated_at ASC LIMIT 100'))
      .toContain('idx_league_season_lp')
  })
})
