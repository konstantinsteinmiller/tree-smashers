// ─── League client API (LG3) ────────────────────────────────────────────────
//
// src/league/leagueApi.ts against a scripted fetch: which builds / players
// may call at all, what counts as "no answer" (HTML, malformed, timeout), the
// error-code mapping, the unsent-result retry, the name the server sees, and
// the useLeague reconcile after /me, /start and /result.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY_MS, LEAGUE_EPOCH_MS, MIN_BATTLE_MS, TIER_FLOOR_POWER, TOKEN_TTL_MS } from '@/league/leagueMath'
import { sanitizeDisplayName } from '@/utils/nameDenylist'
import type { PlayerBuildV1 } from '@/utils/playerBuild'

type Api = typeof import('@/league/leagueApi')
type League = NonNullable<Awaited<ReturnType<typeof import('@/league/leagueGate')['loadLeague']>>>

const T0 = LEAGUE_EPOCH_MS + 2 * DAY_MS + 12 * 3_600_000
const URL_LB = 'https://lb.example.test'
const AD_BUILD_FLAGS = ['VITE_APP_CRAZY_WEB', 'VITE_APP_GAME_DISTRIBUTION', 'VITE_APP_PLAYGAMA', 'VITE_APP_POKI', 'VITE_APP_NATIVE']

const BUILD: PlayerBuildV1 = {
  v: 1,
  team: [
    { t: 'star', b: 'tanky', tl: 10, bl: 10, m: 'blades' },
    { t: 'round', b: 'speedy', tl: 10, bl: 10, m: 'nature' }
  ],
  sk: []
}

const srv = (over: Record<string, unknown> = {}) => ({
  season: 0, seasonEndsAt: LEAGUE_EPOCH_MS + 28 * DAY_MS, lp: 40, peakLp: 40, tier: 'wood', division: 2,
  lpInDivision: 7, floor: 0, streak: 1, shields: 0, wins: 1, losses: 0, bestTier: 'wood', fightsToday: 1,
  serverDailyCap: 16, dayGain: 10, dailyLpCap: 400, atGate: false, gateTier: null, pending: null, lastSeason: null,
  ...over
})

interface Call { url: string; method: string; body: Record<string, unknown> | null }
const calls: Call[] = []
type Handler = (url: string, body: Record<string, unknown> | null, signal: AbortSignal | undefined) => Response | Promise<Response>
let handler: Handler = () => { throw new Error('no handler') }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = (): Response => new Response('<html><body>Sign in to the wifi</body></html>', { status: 200, headers: { 'content-type': 'text/html' } })

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null
  calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), body })
  return handler(url, body, init?.signal ?? undefined)
})

const pathOf = (url: string) => new URL(url).pathname

/** Route table → handler. */
const routes = (table: Record<string, (body: Record<string, unknown> | null, url: string) => Response>): Handler =>
  (url, body) => {
    const r = table[pathOf(url)]
    if (!r) throw new TypeError('network down')
    return r(body, url)
  }

interface Loaded { api: Api; league: League; lb: typeof import('@/use/useLiveLeaderboard') }

const load = async (env: Record<string, string> = {}, stage = 13): Promise<Loaded> => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_FEATURE_LEAGUE', 'true')
  vi.stubEnv('VITE_APP_LEAGUE_UNLOCK_STAGE', '13')
  vi.stubEnv('VITE_APP_KIDS', 'false')
  vi.stubEnv('VITE_LEADERBOARD_URL', URL_LB)
  vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
  for (const f of AD_BUILD_FLAGS) vi.stubEnv(f, 'false')
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  localStorage.setItem('smashers_campaign_stage', String(stage))
  vi.stubGlobal('fetch', fetchMock)
  // useUser FIRST (useMatch ↔ useModels ↔ useUser import cycle).
  await import('@/use/useUser')
  const gate = await import('@/league/leagueGate')
  const league = await gate.loadLeague()
  const api = await import('@/league/leagueApi')
  const lb = await import('@/use/useLiveLeaderboard')
  expect(league).not.toBeNull()
  return { api, league: league!, lb }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(T0)
  calls.length = 0
  fetchMock.mockClear()
  handler = () => { throw new TypeError('network down') }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.clear()
})

/** Every public call, once. */
const callAll = async (api: Api) => [
  await api.fetchMe(),
  await api.fetchPool({ tier: 'wood', ownPower: 40, targets: [36, 40, 44], day: 1 }),
  await api.fetchTop(),
  await api.startBattle({ opp: 'npc:4:1', build: BUILD, skills: false }),
  await api.submitResult({ token: 'v1.x', result: 'loss', durationMs: 20_000 }),
  await api.flushPendingResult()
]

describe('who may call', () => {
  it.each([
    ['offline build (no endpoint: Poki / YouTube)', { VITE_LEADERBOARD_URL: '' }],
    ['kids build (Tauri / GameDistribution)', { VITE_APP_KIDS: 'true' }]
  ])('%s: every call is null and fetch is never touched', async (_n, env) => {
    const { api } = await load(env)
    handler = () => json({})
    expect(api.leagueApiEnabled()).toBe(false)
    expect(await callAll(api)).toEqual([null, null, null, null, null, null])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('CrazyGames guest (account gate says no): no call; signing in enables it', async () => {
    const { api, lb } = await load()
    const { ref } = await import('vue')
    const signedIn = ref(false)
    lb.setLeaderboardAuthGate(() => signedIn.value)
    handler = routes({ '/league/me': () => json({ exists: false, state: srv(), poolId: null, season: 0 }) })
    expect(await callAll(api)).toEqual([null, null, null, null, null, null])
    expect(fetchMock).not.toHaveBeenCalled()
    signedIn.value = true
    expect(await api.fetchMe()).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('no answer → null, never a throw', () => {
  it('captive-portal HTML (200) → null, league marked unreachable', async () => {
    const { api, league } = await load()
    handler = () => html()
    expect(await api.fetchMe()).toBeNull()
    expect(league.serverStatus.value).toBe('unreachable')
    expect(league.offlineBlocked.value).toBe(true)
    expect(await api.fetchTop()).toBeNull()
    expect(await api.fetchPool({ tier: 'wood', ownPower: 40, targets: [36, 40, 44], day: 1 })).toBeNull()
    expect(await api.startBattle({ opp: 'npc:4:1', build: BUILD, skills: false })).toBeNull()
  })

  it('malformed JSON bodies → null', async () => {
    const { api } = await load()
    handler = routes({
      '/league/me': () => json({ exists: true, state: { lp: 'lots' } }),
      '/league/top': () => json({ entries: 'nope' }),
      '/league/pool': () => json([1, 2, 3]),
      '/league/start': () => json({ token: 42, state: srv() })
    })
    expect(await api.fetchMe()).toBeNull()
    expect(await api.fetchTop()).toBeNull()
    expect(await api.fetchPool({ tier: 'wood', ownPower: 40, targets: [36, 40, 44], day: 1 })).toBeNull()
    expect(await api.startBattle({ opp: 'npc:4:1', build: BUILD, skills: false })).toBeNull()
  })

  it('network error → null', async () => {
    const { api } = await load()
    handler = () => { throw new TypeError('Failed to fetch') }
    expect(await callAll(api)).toEqual([null, null, null, null, null, null])
  })

  it('a hung request is aborted after 6 s → null', async () => {
    const { api, league } = await load()
    let aborted = false
    handler = (_u, _b, signal) => new Promise<Response>((_res, rej) => {
      signal?.addEventListener('abort', () => {
        aborted = true
        rej(new DOMException('aborted', 'AbortError'))
      })
    })
    const p = api.fetchMe()
    await vi.advanceTimersByTimeAsync(api.LEAGUE_TIMEOUT_MS - 1)
    expect(aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(await p).toBeNull()
    expect(aborted).toBe(true)
    expect(league.serverStatus.value).toBe('unreachable')
  })
})

describe('GET routes', () => {
  it('fetchMe reconciles useLeague with the server standing (and marks it reachable)', async () => {
    const { api, league } = await load()
    const spy = vi.spyOn(league, 'reconcileServer')
    handler = routes({ '/league/me': () => json({ exists: true, state: srv({ lp: 57, fightsToday: 3, wins: 2, losses: 1 }), poolId: 'p:12', season: 0 }) })
    const me = await api.fetchMe()
    expect(me).toMatchObject({ exists: true, poolId: 'p:12', season: 0 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toMatchObject({ lp: 57, fights: 3, battles: 3, pending: false })
    expect(league.state.value.lp).toBe(57)
    expect(league.state.value.fights).toBe(3)
    expect(league.serverStatus.value).toBe('ok')
    const q = new URL(calls[0]!.url)
    expect(q.searchParams.get('id')).toMatch(/^[a-zA-Z0-9_-]{8,64}$/)
  })

  it('fetchPool asks for band round(max(ownPower, tier floor) / 10) with the own id, and sanitises names', async () => {
    const { api } = await load()
    handler = routes({
      '/league/pool': () => json({
        band: 10, lo: 80, hi: 130, updatedAt: 5,
        entries: [
          { id: 'p:1', name: 'shithead', build: BUILD, lpower: 40 },
          { id: 'p:2', name: 'Ok', build: { v: 9 }, lpower: 1 }
        ]
      })
    })
    const r = await api.fetchPool({ tier: 'gold', ownPower: 40, targets: [70, 76, 82], day: 1 })
    const q = new URL(calls[0]!.url)
    expect(q.searchParams.get('band')).toBe(String(Math.round(TIER_FLOOR_POWER.gold / 10)))
    expect(q.searchParams.get('id')).toMatch(/^[a-zA-Z0-9_-]{8,64}$/)
    expect(r!.entries).toHaveLength(1) // the malformed build dropped
    expect(r!.entries[0]!.name).toBe(sanitizeDisplayName('shithead'))
    expect(r!.entries[0]!.name).not.toBe('shithead')
    expect(api.poolBand('wood', 94)).toBe(9)
    expect(api.poolBand('wood', -5)).toBe(0)
  })

  it('fetchTop validates rows and sanitises names', async () => {
    const { api } = await load()
    handler = routes({
      '/league/top': () => json({
        season: 0, updatedAt: 1, total: 3,
        entries: [
          { rank: 1, name: 'hitler99', lp: 900, tier: 'champion', division: null },
          { rank: 2, name: 'Bex', lp: 300, tier: 'nonsense', division: 1 },
          { rank: 2, name: 'Cy‮', lp: 250, tier: 'silver', division: 1 }
        ],
        dist: [[900, 1], ['x', 2], [240, 2]]
      })
    })
    const top = await api.fetchTop()
    expect(top!.entries.map((e) => e.name)).toEqual([sanitizeDisplayName('hitler99'), 'Cy'])
    expect(top!.entries[0]!.name).not.toBe('hitler99')
    expect(top!.dist).toEqual([[900, 1], [240, 2]])
  })
})

describe('POST /league/start', () => {
  const started = (over: Record<string, unknown> = {}) => json({
    token: 'v1.tok', seed: 1234, E: 0.5, ownPower: 40,
    opp: { id: 'npc:4:1', name: 'fuckface', build: BUILD, power: 40 },
    gate: null, expiresAt: T0 + TOKEN_TTL_MS, minResultAt: T0 + MIN_BATTLE_MS,
    state: srv({ fightsToday: 1, pending: { opp: 'npc:4:1', expiresAt: T0 + TOKEN_TTL_MS } }),
    abandoned: null, resumed: false, ...over
  })

  it('sends the denylist-swapped name, never the typed one', async () => {
    const { api } = await load()
    const { setPlayerName } = await import('@/use/usePlayerIdentity')
    setPlayerName('shitlord')
    handler = routes({ '/league/start': () => started() })
    const out = await api.startBattle({ opp: 'npc:4:1', build: BUILD, skills: false })
    expect(out).toMatchObject({ ok: true })
    const body = calls.find((c) => pathOf(c.url) === '/league/start')!.body!
    expect(body.name).toBe(sanitizeDisplayName('shitlord'))
    expect(body.name).not.toBe('shitlord')
    expect(body).toMatchObject({ opp: 'npc:4:1', caps: { skills: false } })
    expect(body.gateTier).toBeUndefined()
    // …and the opponent's name that came back is swapped too.
    expect(out!.ok && out!.battle.opp!.name).toBe(sanitizeDisplayName('fuckface'))
  })

  it.each([
    [429, { error: 'daily cap' }, 'daily_cap'],
    [409, { error: 'gate', gateTier: 'bronze' }, 'gate_required'],
    [409, { error: 'not at gate' }, 'not_at_gate'],
    [400, { error: 'bad opp' }, 'bad_opponent'],
    [404, { error: 'opp gone' }, 'opponent_gone'],
    [409, { error: 'self' }, 'bad_opponent'],
    [503, { error: 'league offline' }, 'offline']
  ])('%i %j → %s', async (status, body, code) => {
    const { api, league } = await load()
    handler = routes({ '/league/start': () => json({ ...body, state: status === 503 ? undefined : srv({ lp: 99, atGate: true, gateTier: 'bronze' }), abandoned: null }, status) })
    const out = await api.startBattle({ opp: 'npc:4:1', build: BUILD, skills: false })
    expect(out).toMatchObject({ ok: false, error: code })
    if (code === 'gate_required') expect(out!.ok === false && out!.gateTier).toBe('bronze')
    if (code === 'offline') {
      expect(league.serverStatus.value).toBe('unreachable')
    } else {
      expect(league.serverStatus.value).toBe('ok')
      expect(league.state.value.lp).toBe(99) // reconciled with the refusal's state
    }
  })

  it('a lost write race (409 busy) is retried once', async () => {
    const { api } = await load()
    let n = 0
    handler = routes({ '/league/start': () => (++n === 1 ? json({ error: 'busy' }, 409) : started()) })
    expect(await api.startBattle({ opp: 'npc:4:1', build: BUILD, skills: false })).toMatchObject({ ok: true })
    expect(n).toBe(2)
  })

  it('beginOnlineFight counts the fight once and hands the server seed + token to the session', async () => {
    const { api, league } = await load()
    handler = routes({
      '/league/me': () => json({ exists: true, state: srv({ fightsToday: 0 }), poolId: null, season: 0 }),
      '/league/start': () => started()
    })
    await api.fetchMe()
    const out = await api.beginOnlineFight({ kind: 'card', id: 'npc:4:1', power: 40 }, 40, { opp: 'npc:4:1', build: BUILD, skills: false })
    expect(out).toMatchObject({ ok: true, session: { seed: 1234, token: 'v1.tok' } })
    expect(league.state.value.fights).toBe(1) // server's fightsToday, not 2
    expect(league.state.value.pending?.token).toBe('v1.tok')
  })

  it('beginOnlineFight never opens a server token when no fight is left locally', async () => {
    const { api } = await load({}, 1) // below the unlock stage
    handler = routes({ '/league/start': () => started() })
    expect(await api.beginOnlineFight({ kind: 'card', id: 'npc:4:1', power: 40 }, 40, { opp: 'npc:4:1', build: BUILD, skills: false }))
      .toMatchObject({ ok: false, error: 'no_fights' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /league/result + the unsent retry', () => {
  const resultOk = () => json({
    state: srv({ lp: 58, wins: 2, fightsToday: 1 }), delta: 18, isGate: false, promotedTo: null,
    firstReach: null, shielded: false, capped: false, seasonEnded: false
  })

  const openFight = async (api: Api) => {
    handler = routes({
      '/league/me': () => json({ exists: true, state: srv({ fightsToday: 0 }), poolId: null, season: 0 }),
      '/league/start': () => json({
        token: 'v1.tok', seed: 7, E: 0.5, ownPower: 40, opp: null, gate: null,
        expiresAt: T0 + TOKEN_TTL_MS, minResultAt: T0 + MIN_BATTLE_MS,
        state: srv({ fightsToday: 1, pending: { opp: 'npc:4:1', expiresAt: T0 + TOKEN_TTL_MS } }), abandoned: null, resumed: false
      })
    })
    await api.fetchMe()
    const out = await api.beginOnlineFight({ kind: 'card', id: 'npc:4:1', power: 40 }, 40, { opp: 'npc:4:1', build: BUILD, skills: false })
    expect(out?.ok).toBe(true)
    return out!.ok ? out!.session : null!
  }

  it('finishOnlineFight: local outcome at once; a win is posted only after MIN_BATTLE_MS, then reconciled', async () => {
    const { api, league } = await load()
    const session = await openFight(api)
    handler = routes({ '/league/result': () => resultOk() })
    vi.advanceTimersByTime(3000)
    const { local, server } = api.finishOnlineFight(session, 'win', 3000)
    expect(local.stale).toBe(false)
    expect(local.delta).toBeGreaterThan(0)
    expect(league.state.value.unsent?.token).toBe('v1.tok')
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls.some((c) => pathOf(c.url) === '/league/result')).toBe(false)
    await vi.advanceTimersByTimeAsync(MIN_BATTLE_MS)
    const res = await server
    expect(res).toMatchObject({ ok: true, result: { delta: 18 } })
    expect(calls.find((c) => pathOf(c.url) === '/league/result')!.body).toMatchObject({ token: 'v1.tok', result: 'win', durationMs: 3000 })
    expect(league.state.value.lp).toBe(58)
    expect(league.state.value.unsent).toBeUndefined()
  })

  it('a transient failure keeps {token, result, durationMs}; the next hub open posts it BEFORE /me', async () => {
    const { api, league } = await load()
    const session = await openFight(api)
    vi.advanceTimersByTime(MIN_BATTLE_MS + 1000)
    handler = () => { throw new TypeError('offline') }
    const { server } = api.finishOnlineFight(session, 'loss', 20_000)
    expect(await server).toBeNull()
    expect(league.state.value.unsent).toMatchObject({ token: 'v1.tok', result: 'loss', durationMs: 20_000 })
    // 5xx is transient too.
    handler = routes({ '/league/result': () => json({ error: 'unavailable' }, 500) })
    expect(await api.flushPendingResult()).toBeNull()
    expect(league.state.value.unsent?.token).toBe('v1.tok')

    calls.length = 0
    handler = routes({
      '/league/result': () => resultOk(),
      '/league/me': () => json({ exists: true, state: srv({ lp: 58, wins: 2 }), poolId: null, season: 0 })
    })
    expect(await api.fetchMe()).not.toBeNull()
    expect(calls.map((c) => pathOf(c.url))).toEqual(['/league/result', '/league/me'])
    expect(league.state.value.unsent).toBeUndefined()
  })

  it('the retry survives a reload (it lives in the league state) and stops once the token expired', async () => {
    const { api } = await load()
    const session = await openFight(api)
    vi.advanceTimersByTime(MIN_BATTLE_MS + 1000)
    handler = () => { throw new TypeError('offline') }
    await api.finishOnlineFight(session, 'win', 20_000).server
    expect(JSON.parse(localStorage.getItem('smashers_league')!).unsent.token).toBe('v1.tok')

    const again = await load()
    expect(again.league.state.value.unsent?.token).toBe('v1.tok')
    vi.advanceTimersByTime(TOKEN_TTL_MS)
    calls.length = 0
    handler = routes({ '/league/me': () => json({ exists: true, state: srv(), poolId: null, season: 0 }) })
    await again.api.fetchMe()
    expect(calls.map((c) => pathOf(c.url))).toEqual(['/league/me'])
    expect(again.league.state.value.unsent).toBeUndefined()
  })

  it.each([
    [410, { error: 'expired', delta: -10 }, 'expired', false],
    [409, { error: 'no pending' }, 'no_pending', false],
    [401, { error: 'bad token' }, 'bad_token', false],
    [422, { error: 'bad duration' }, 'bad_duration', false],
    [422, { error: 'too fast' }, 'too_fast', true],
    [503, { error: 'league offline' }, 'offline', true]
  ])('%i %j → %s (kept for retry: %s)', async (status, body, code, kept) => {
    const { api, league } = await load()
    const session = await openFight(api)
    vi.advanceTimersByTime(MIN_BATTLE_MS + 1000)
    handler = routes({ '/league/result': () => json({ ...body, state: status === 410 ? srv({ lp: 30, losses: 1 }) : undefined }, status) })
    const out = await api.finishOnlineFight(session, 'win', 13_000).server
    expect(out).toMatchObject({ ok: false, error: code })
    expect(league.state.value.unsent !== undefined).toBe(kept)
    if (code === 'expired') expect(league.state.value.lp).toBe(30) // reconciled: the loss the server recorded
  })
})
