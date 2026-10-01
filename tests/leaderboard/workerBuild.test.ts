// @vitest-environment node
// POST /score carries the player's BUILD (league plan LG-SNAP). Driven through
// the Worker's real `fetch` against the shared in-memory D1 double.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import worker from '../../worker/src/index'
import { BUILD_REFRESH_MS, buildDigest, buildPower, type PlayerBuildV1 } from '@/utils/playerBuild'
import { fakeD1, type ScoreRow } from './fakeD1'

const HOUR = 60 * 60_000
const T0 = 1_800_000_000_000
let clock = T0

beforeEach(() => {
  clock = T0
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})
afterEach(() => {
  vi.restoreAllMocks()
})

const BUILD_A: PlayerBuildV1 = {
  v: 1,
  team: [
    { t: 'star', b: 'balanced', tl: 12, bl: 9, m: 'reddragon' },
    { t: 'round', b: 'tanky', tl: 7, bl: 4, m: 'yeti' }
  ],
  sk: [{ id: 'guard_shell', lv: 3 }]
}
const BUILD_B: PlayerBuildV1 = {
  ...BUILD_A,
  team: [BUILD_A.team[0]!, { ...BUILD_A.team[1]!, tl: 8 }],
  sk: [{ id: 'guard_shell', lv: 3 }, { id: 'momentum', lv: 1 }]
}

const post = (body: Record<string, unknown>) =>
  new Request('https://lb.test/score', { method: 'POST', body: JSON.stringify(body) })

const send = async (db: D1Database, body: Record<string, unknown>, secret?: string) => {
  const res = await worker.fetch(post(body), secret ? { DB: db, SCORE_SECRET: secret } : { DB: db })
  const json = await res.json() as Record<string, unknown>
  return { status: res.status, json }
}

const seedRow = (over: Partial<ScoreRow> = {}): ScoreRow => ({
  id: 'player-0001', name: 'Rusty', score: 20, power: 40, updated_at: T0 - 10 * HOUR, ...over
})

describe('worker /score — build stored alongside the score', () => {
  it('new row: stores build, build_at and the server-computed lpower', async () => {
    const { db, scores } = fakeD1()
    const { status, json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 5, power: 32, build: BUILD_A })
    expect(status).toBe(200)
    expect(json.build).toBe('stored')
    const row = scores.get('player-0001')!
    expect(JSON.parse(row.build!)).toEqual(BUILD_A)
    expect(row.build_at).toBe(T0)
    // 12+9+7+4 = 32, + skill L3 = 9 ‰ of (32 + 124) = 1.4 → 1 (LG-PWR)
    expect(row.lpower).toBe(33)
    expect(row.lpower).toBe(buildPower(BUILD_A))
  })

  it('lpower is skill-less when the build has no skills', async () => {
    const { db, scores } = fakeD1()
    await send(db, { id: 'player-0001', name: 'Rusty', score: 5, power: 32, build: { ...BUILD_A, sk: [] } })
    expect(scores.get('player-0001')!.lpower).toBe(32)
  })

  it('record: score and build move together', async () => {
    const { db, scores } = fakeD1([seedRow({ build: JSON.stringify(BUILD_A), build_at: T0 - HOUR, lpower: 33 })])
    const { json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 21, power: 41, build: BUILD_B })
    expect(json.build).toBe('stored')
    const row = scores.get('player-0001')!
    expect(row.score).toBe(21)
    expect(row.updated_at).toBe(T0)
    expect(JSON.parse(row.build!)).toEqual(BUILD_B)
    expect(row.build_at).toBe(T0)
    expect(row.lpower).toBe(buildPower(BUILD_B))
  })

  it('rename: name and build refresh, score and updated_at do not', async () => {
    const { db, scores } = fakeD1([seedRow({ build: JSON.stringify(BUILD_A), build_at: T0 - HOUR, lpower: 33 })])
    const { json } = await send(db, { id: 'player-0001', name: 'Rex', score: 20, power: 41, build: BUILD_B })
    expect(json.build).toBe('stored')
    const row = scores.get('player-0001')!
    expect(row.name).toBe('Rex')
    expect(row.score).toBe(20)
    expect(row.power).toBe(40)
    expect(row.updated_at).toBe(T0 - 10 * HOUR)
    expect(JSON.parse(row.build!)).toEqual(BUILD_B)
  })
})

describe('worker /score — build-only refresh (F6)', () => {
  it('same score + name, new digest, stored build older than 6 h → build columns ONLY', async () => {
    const seeded = seedRow({ build: JSON.stringify(BUILD_A), build_at: T0 - BUILD_REFRESH_MS, lpower: 33 })
    const { db, scores, writes } = fakeD1([seeded])
    const { status, json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 20, power: 99, build: BUILD_B })
    expect(status).toBe(200)
    expect(json.build).toBe('stored')
    expect(json.best).toBe(20)
    const row = scores.get('player-0001')!
    expect(row.score).toBe(20)
    expect(row.power).toBe(40)
    expect(row.name).toBe('Rusty')
    expect(row.updated_at).toBe(seeded.updated_at)
    expect(JSON.parse(row.build!)).toEqual(BUILD_B)
    expect(row.build_at).toBe(T0)
    expect(row.lpower).toBe(buildPower(BUILD_B))
    // Exactly one write to scores, and it names no score / updated_at column.
    const scoreWrites = writes.filter((w) => w.sql.includes('scores'))
    expect(scoreWrites).toHaveLength(1)
    expect(scoreWrites[0]!.sql).toMatch(/^UPDATE scores SET build = \?, build_at = \?, lpower = \? WHERE id = \?$/)
  })

  it('a lagging device (lower score) refreshes the build without lowering the score', async () => {
    const { db, scores } = fakeD1([seedRow({ build: JSON.stringify(BUILD_A), build_at: T0 - 7 * HOUR })])
    await send(db, { id: 'player-0001', name: 'Rusty', score: 18, power: 40, build: BUILD_B })
    expect(scores.get('player-0001')!.score).toBe(20)
    expect(JSON.parse(scores.get('player-0001')!.build!)).toEqual(BUILD_B)
  })

  it('is throttled: a stored build younger than 6 h is kept', async () => {
    const { db, scores, writes } = fakeD1([seedRow({ build: JSON.stringify(BUILD_A), build_at: T0 - BUILD_REFRESH_MS + 1 })])
    const { status, json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 20, power: 40, build: BUILD_B })
    expect(status).toBe(200)
    expect(json.build).toBe('throttled')
    expect(JSON.parse(scores.get('player-0001')!.build!)).toEqual(BUILD_A)
    expect(writes.filter((w) => w.sql.includes('scores'))).toHaveLength(0)
  })

  it('same digest → nothing written, whatever the age', async () => {
    const { db, writes } = fakeD1([seedRow({ build: JSON.stringify(BUILD_A), build_at: T0 - 100 * HOUR })])
    const { json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 20, power: 40, build: BUILD_A })
    expect(json.build).toBe('unchanged')
    expect(writes.filter((w) => w.sql.includes('scores'))).toHaveLength(0)
  })

  it('a legacy row with no build gets its first one immediately', async () => {
    const { db, scores } = fakeD1([seedRow()])
    const { json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 20, power: 40, build: BUILD_A })
    expect(json.build).toBe('stored')
    expect(JSON.parse(scores.get('player-0001')!.build!)).toEqual(BUILD_A)
    expect(scores.get('player-0001')!.updated_at).toBe(T0 - 10 * HOUR)
  })

  it('a second refresh inside 6 h of the first is throttled', async () => {
    const { db, scores } = fakeD1([seedRow()])
    await send(db, { id: 'player-0001', name: 'Rusty', score: 20, power: 40, build: BUILD_A })
    clock += HOUR
    const { json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 20, power: 40, build: BUILD_B })
    expect(json.build).toBe('throttled')
    expect(JSON.parse(scores.get('player-0001')!.build!)).toEqual(BUILD_A)
    clock += BUILD_REFRESH_MS
    const again = await send(db, { id: 'player-0001', name: 'Rusty', score: 20, power: 40, build: BUILD_B })
    expect(again.json.build).toBe('stored')
    expect(JSON.parse(scores.get('player-0001')!.build!)).toEqual(BUILD_B)
    expect(scores.get('player-0001')!.score).toBe(20)
    expect(scores.get('player-0001')!.updated_at).toBe(T0 - 10 * HOUR)
  })
})

describe('worker /score — malformed builds and old clients', () => {
  it.each([
    ['wrong version', { ...BUILD_A, v: 2 }],
    ['three skills', { ...BUILD_A, sk: [{ id: 'a', lv: 1 }, { id: 'b', lv: 1 }, { id: 'c', lv: 1 }] }],
    ['level out of range', { ...BUILD_A, team: [{ ...BUILD_A.team[0]!, tl: 9999 }, BUILD_A.team[1]] }],
    ['a string', 'not-a-build'],
    ['an injection attempt', { ...BUILD_A, team: [{ ...BUILD_A.team[0]!, m: "x'); DROP TABLE scores;--" }, BUILD_A.team[1]] }]
  ])('%s → 200, score stored, build ignored', async (_l, build) => {
    const { db, scores } = fakeD1()
    const { status, json } = await send(db, { id: 'player-0001', name: 'Rusty', score: 5, power: 3, build })
    expect(status).toBe(200)
    expect(json.build).toBe('none')
    const row = scores.get('player-0001')!
    expect(row.score).toBe(5)
    expect(row.build).toBeNull()
    expect(row.lpower).toBeNull()
  })

  it('an old client (no build) still inserts, records and renames', async () => {
    const { db, scores, writes } = fakeD1()
    expect((await send(db, { id: 'player-0001', name: 'Rusty', score: 5, power: 3 })).status).toBe(200)
    clock += 10_000
    expect((await send(db, { id: 'player-0001', name: 'Rusty', score: 6, power: 4 })).status).toBe(200)
    clock += 10_000
    expect((await send(db, { id: 'player-0001', name: 'Rex', score: 6, power: 4 })).status).toBe(200)
    const row = scores.get('player-0001')!
    expect(row).toMatchObject({ name: 'Rex', score: 6, power: 4, build: null })
    // The legacy statements, unchanged.
    expect(writes.map((w) => w.sql).filter((s) => s.startsWith('UPDATE scores'))).toEqual([
      'UPDATE scores SET name = ?, score = ?, power = ?, updated_at = ? WHERE id = ?',
      'UPDATE scores SET name = ? WHERE id = ?'
    ])
  })

  it('an old client posting a record never clears a stored build', async () => {
    const { db, scores } = fakeD1([seedRow({ build: JSON.stringify(BUILD_A), build_at: T0 - HOUR, lpower: 33 })])
    await send(db, { id: 'player-0001', name: 'Rusty', score: 25, power: 50 })
    const row = scores.get('player-0001')!
    expect(row.score).toBe(25)
    expect(JSON.parse(row.build!)).toEqual(BUILD_A)
    expect(row.lpower).toBe(33)
  })
})

describe('worker /score — signature v1 / v2', () => {
  const SECRET = 'test-secret'
  const mac = (msg: string) => createHmac('sha256', SECRET).update(msg).digest('hex')
  const base = { id: 'player-0001', name: 'Rusty', score: 5, power: 3 }

  it('v2 (id:score:power:digest) with a build → accepted, build stored', async () => {
    const { db, scores } = fakeD1()
    const sig = mac(`player-0001:5:3:${buildDigest(BUILD_A)}`)
    const { status, json } = await send(db, { ...base, build: BUILD_A, sig }, SECRET)
    expect(status).toBe(200)
    expect(json.build).toBe('stored')
    expect(JSON.parse(scores.get('player-0001')!.build!)).toEqual(BUILD_A)
  })

  it('v1 without a build → still accepted (old clients)', async () => {
    const { db, scores } = fakeD1()
    const { status } = await send(db, { ...base, sig: mac('player-0001:5:3') }, SECRET)
    expect(status).toBe(200)
    expect(scores.get('player-0001')!.score).toBe(5)
  })

  it('v1 signature on a post WITH a build → score kept, unsigned build dropped', async () => {
    const { db, scores } = fakeD1()
    const { status, json } = await send(db, { ...base, build: BUILD_A, sig: mac('player-0001:5:3') }, SECRET)
    expect(status).toBe(200)
    expect(json.build).toBe('none')
    expect(scores.get('player-0001')!.build).toBeNull()
  })

  it('a build swapped after signing → 401', async () => {
    const { db, scores } = fakeD1()
    const sig = mac(`player-0001:5:3:${buildDigest(BUILD_A)}`)
    const { status } = await send(db, { ...base, build: BUILD_B, sig }, SECRET)
    expect(status).toBe(401)
    expect(scores.size).toBe(0)
  })

  it('a wrong or missing signature → 401', async () => {
    const { db } = fakeD1()
    expect((await send(db, { ...base, build: BUILD_A, sig: 'deadbeef' }, SECRET)).status).toBe(401)
    expect((await send(db, { ...base, build: BUILD_A }, SECRET)).status).toBe(401)
    expect((await send(db, { ...base, sig: mac('player-0001:5:4') }, SECRET)).status).toBe(401)
  })
})
