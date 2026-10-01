import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAYER_ID_KEY, POSTED_BUILD_KEY, POSTED_NAME_KEY, PLAYER_NAME_KEY, SUBMITTED_STAGE_KEY } from '@/keys'
import { buildDigest, encodePlayerBuild, type BuildSkillInput, type BuildSpinnerInput } from '@/utils/playerBuild'

// The client half of LG-SNAP: every build-carrying post also sends the
// player's team, and a changed team on an unchanged score + name costs at most
// one build-only refresh per 6 h. Same fresh-module loader as the other
// leaderboard specs (the endpoint is read from `import.meta.env` at module
// scope, so every case re-imports under `vi.resetModules()`).

const ENDPOINT = 'https://board.example.test'
const HOUR = 60 * 60_000

interface Sent { method: string; body: Record<string, unknown> | null; raw: string | null }
const sent: Sent[] = []

const BOARD = { updatedAt: 1, total: 2, entries: [{ rank: 1, name: 'Ace', score: 80, power: 1 }] }
const reply = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response

const load = async (
  url: string = ENDPOINT,
  opts: { secret?: string; ok?: boolean; buildOutcome?: string | null } = {}
) => {
  sent.length = 0
  vi.stubEnv('VITE_LEADERBOARD_URL', url)
  vi.stubEnv('VITE_LEADERBOARD_SECRET', opts.secret ?? '')
  vi.stubGlobal('fetch', vi.fn(async (_t: string, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : null
    sent.push({ method: (init?.method ?? 'GET').toUpperCase(), body: raw ? JSON.parse(raw) : null, raw })
    const outcome = opts.buildOutcome === undefined ? 'stored' : opts.buildOutcome
    const sentBuild = raw !== null && 'build' in JSON.parse(raw)
    return reply({
      rank: 3, best: 42, total: 2, board: BOARD,
      ...(outcome === null ? {} : { build: sentBuild ? outcome : 'none' })
    }, opts.ok ?? true)
  }))
  vi.resetModules()
  const state = await import('@/use/persistedState')
  const board = await import('@/use/useLiveLeaderboard')
  return { ...board, state }
}

const posts = (): Sent[] => sent.filter((c) => c.method === 'POST')

let team: BuildSpinnerInput[] = []
let skills: BuildSkillInput[] = []
const resetTeam = () => {
  team = [
    { topPartId: 'star', bottomPartId: 'balanced', topLevel: 12, bottomLevel: 9, modelId: 'reddragon' },
    { topPartId: 'round', bottomPartId: 'tanky', topLevel: 7, bottomLevel: 4, modelId: 'yeti' }
  ]
  skills = [{ id: 'guard_shell', level: 3 }]
}
const source = () => ({ team, skills })
const currentDigest = () => buildDigest(encodePlayerBuild(team, skills)!)

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

/** A player already on the board at 42 under 'Tester'. */
const seedPosted = (state: { setState: (k: string, v: unknown) => void }) => {
  state.setState(PLAYER_NAME_KEY, 'Tester')
  state.setState(SUBMITTED_STAGE_KEY, 42)
  state.setState(POSTED_NAME_KEY, 'Tester')
}

describe('record + rename posts carry the build', () => {
  it('a personal record sends the build and remembers its digest', async () => {
    resetTeam()
    const lb = await load()
    lb.state.setState(PLAYER_NAME_KEY, 'Tester')
    lb.setPlayerBuildSource(source)

    await lb.reportRun(42, 900)

    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body!.build).toEqual(encodePlayerBuild(team, skills))
    expect(lb.state.getState<{ d: string }>(POSTED_BUILD_KEY, { d: '' }).d).toBe(currentDigest())
  })

  it('no source installed → the body is exactly the legacy one', async () => {
    const lb = await load()
    lb.state.setState(PLAYER_NAME_KEY, 'Tester')
    await lb.reportRun(42, 900)
    expect(Object.keys(posts()[0]!.body!).sort()).toEqual(['id', 'name', 'power', 'score'])
    expect(lb.state.getState(POSTED_BUILD_KEY, null)).toBeNull()
  })

  it('a throwing source or an inexpressible team → posts without a build', async () => {
    const lb = await load()
    lb.state.setState(PLAYER_NAME_KEY, 'Tester')
    lb.setPlayerBuildSource(() => { throw new Error('boom') })
    await lb.reportRun(42, 900)
    expect(posts()[0]!.body).not.toHaveProperty('build')

    const lb2 = await load()
    lb2.state.setState(PLAYER_NAME_KEY, 'Tester')
    lb2.state.setState(SUBMITTED_STAGE_KEY, 0)
    lb2.setPlayerBuildSource(() => ({ team: [team[0]!], skills: [] }))
    await lb2.reportRun(43, 900)
    expect(posts()[0]!.body).not.toHaveProperty('build')
  })

  it.each([['throttled'], [null]])('server answers build=%s (another device / old Worker) → not remembered', async (outcome) => {
    resetTeam()
    const lb = await load(ENDPOINT, { buildOutcome: outcome })
    lb.state.setState(PLAYER_NAME_KEY, 'Tester')
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900)
    expect(posts()[0]!.body).toHaveProperty('build')
    expect(lb.state.getState(POSTED_BUILD_KEY, null)).toBeNull()
  })

  it('a failed post does not remember the build', async () => {
    resetTeam()
    const lb = await load(ENDPOINT, { ok: false })
    lb.state.setState(PLAYER_NAME_KEY, 'Tester')
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900)
    expect(lb.state.getState(POSTED_BUILD_KEY, null)).toBeNull()
  })
})

describe('build-only refresh', () => {
  it('same score + name, never-posted build → one refresh of the POSTED score', async () => {
    resetTeam()
    const lb = await load()
    seedPosted(lb.state)
    lb.setPlayerBuildSource(source)

    await lb.reportRun(42, 900)

    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body).toMatchObject({ name: 'Tester', score: 42, power: 900 })
    expect(posts()[0]!.body!.build).toEqual(encodePlayerBuild(team, skills))
  })

  it('posts at most once per 6 h, and only when the digest changed', async () => {
    resetTeam()
    let now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const lb = await load()
    seedPosted(lb.state)
    lb.setPlayerBuildSource(source)

    await lb.reportRun(42, 900, { force: true })
    expect(posts()).toHaveLength(1)

    // Team upgraded an hour later: throttled.
    now += HOUR
    team[0]!.topLevel = 13
    await lb.reportRun(42, 900, { force: true })
    expect(posts()).toHaveLength(1)

    // Six hours after the refresh: goes out, with the new team.
    now += 5 * HOUR
    await lb.reportRun(42, 900, { force: true })
    expect(posts()).toHaveLength(2)
    expect((posts()[1]!.body!.build as { team: { tl: number }[] }).team[0]!.tl).toBe(13)

    // Another 6 h, but nothing changed: no write.
    now += 7 * HOUR
    await lb.reportRun(42, 900, { force: true })
    expect(posts()).toHaveLength(2)
  })

  it('the 6 h clock survives a reload (persisted digest + time)', async () => {
    resetTeam()
    let now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const lb = await load()
    seedPosted(lb.state)
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900)
    expect(posts()).toHaveLength(1)

    // New session two hours later with a changed team: still throttled.
    now += 2 * HOUR
    skills = [{ id: 'guard_shell', level: 4 }]
    const lb2 = await load()
    lb2.setPlayerBuildSource(source)
    await lb2.reportRun(42, 900)
    expect(posts()).toHaveLength(0)
  })

  it('a refused refresh is not retried within the session for 6 h', async () => {
    resetTeam()
    let now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const lb = await load(ENDPOINT, { ok: false })
    seedPosted(lb.state)
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900, { force: true })
    now += HOUR
    await lb.reportRun(42, 900, { force: true })
    expect(posts()).toHaveLength(1)
  })

  it('respects the 3-minute write throttle like every other write', async () => {
    resetTeam()
    let now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const lb = await load()
    lb.state.setState(PLAYER_NAME_KEY, 'Tester')
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900) // record
    expect(posts()).toHaveLength(1)
    // Changed team, 10 s later, not forced: the throttle holds it.
    now += 10_000
    team[1]!.modelId = 'cinder'
    await lb.reportRun(42, 900)
    expect(posts()).toHaveLength(1)
  })
})

describe('gates', () => {
  it('CG guest: never posts a score, a rename or a build refresh', async () => {
    resetTeam()
    const lb = await load()
    seedPosted(lb.state)
    lb.setLeaderboardAuthGate(() => false)
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900, { force: true })
    await lb.reportRun(50, 900, { force: true })
    expect(await lb.submitScore(50, 900, encodePlayerBuild(team, skills))).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('!LIVE: never touches the network', async () => {
    resetTeam()
    const lb = await load('')
    seedPosted(lb.state)
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900, { force: true })
    await lb.reportRun(50, 900, { force: true })
    expect(await lb.submitScore(50, 900, encodePlayerBuild(team, skills))).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('N2: a denylisted name is still swapped on a build-carrying post', async () => {
    resetTeam()
    const { safeNameFor } = await import('@/utils/nameDenylist')
    const lb = await load()
    lb.state.setState(PLAYER_NAME_KEY, 'Dipshit')
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900)
    expect(posts()[0]!.body!.name).toBe(safeNameFor('Dipshit'))
    expect(posts()[0]!.body).toHaveProperty('build')
  })
})

describe('payload', () => {
  const byteLen = (s: string) => new TextEncoder().encode(s).length

  it('a realistic worst case (two skills, signed, 16-char name) stays ≤ 600 B', async () => {
    const lb = await load(ENDPOINT, { secret: 'shh' })
    lb.state.setState(PLAYER_NAME_KEY, 'Abcdefghijklmnop')
    lb.setPlayerBuildSource(() => ({
      team: [
        { topPartId: 'triangle', bottomPartId: 'balanced', topLevel: 200, bottomLevel: 200, modelId: 'frost-vault' },
        { topPartId: 'quadratic', bottomPartId: 'speedy', topLevel: 200, bottomLevel: 200, modelId: 'gorilla-middle' }
      ],
      skills: [{ id: 'homing_rockets', level: 10 }, { id: 'opening_salvo', level: 10 }]
    }))
    await lb.reportRun(10_000, 100_000)
    const p = posts()[0]!
    expect(p.body).toHaveProperty('build')
    expect(p.body).toHaveProperty('sig')
    expect(byteLen(p.raw!)).toBeLessThanOrEqual(lb.MAX_SCORE_PAYLOAD_BYTES)
    expect(lb.MAX_SCORE_PAYLOAD_BYTES).toBe(600)
  })

  it('a body that would exceed 600 B drops the build (and signs v1), never the score', async () => {
    const lb = await load(ENDPOINT, { secret: 'shh' })
    // The longest id the Worker accepts (a legacy / foreign-minted id) and 16
    // three-byte characters — the most BYTES the client allows in a name.
    lb.state.setState(PLAYER_ID_KEY, 'a'.repeat(64))
    lb.state.setState(PLAYER_NAME_KEY, 'あいうえおかきくけこさしすせそた')
    const id32 = (c: string) => c.repeat(32)
    lb.setPlayerBuildSource(() => ({
      team: [
        { topPartId: id32('a'), bottomPartId: id32('b'), topLevel: 200, bottomLevel: 200, modelId: id32('c') },
        { topPartId: id32('d'), bottomPartId: id32('e'), topLevel: 200, bottomLevel: 200, modelId: id32('f') }
      ],
      skills: [{ id: id32('g'), level: 10 }, { id: id32('h'), level: 10 }]
    }))
    await lb.reportRun(10_000, 100_000)
    const p = posts()[0]!
    expect(p.body).not.toHaveProperty('build')
    expect(p.body).toMatchObject({ score: 10_000, power: 100_000 })
    expect(byteLen(p.raw!)).toBeLessThanOrEqual(600)
    // Not remembered as posted — the next refresh window can try again.
    expect(lb.state.getState(POSTED_BUILD_KEY, null)).toBeNull()
  })

  it('signs v2 (id:score:power:digest) when a build is sent', async () => {
    resetTeam()
    const { createHmac } = await import('node:crypto')
    const lb = await load(ENDPOINT, { secret: 'shh' })
    lb.state.setState(PLAYER_NAME_KEY, 'Tester')
    lb.setPlayerBuildSource(source)
    await lb.reportRun(42, 900)
    const b = posts()[0]!.body!
    const expected = createHmac('sha256', 'shh').update(`${b.id}:42:900:${currentDigest()}`).digest('hex')
    expect(b.sig).toBe(expected)
  })
})
