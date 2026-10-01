// ─── League client API (LG3) ────────────────────────────────────────────────
//
// The client half of the league Worker routes (worker/src/league.ts, LG4):
//
//   fetchMe()                GET  /league/me      → reconcileServer
//   fetchPool(req)           GET  /league/pool    (LG1's LeaguePoolFetcher)
//   fetchTop()               GET  /league/top
//   startBattle(req)         POST /league/start   → reconcileServer
//   submitResult(req)        POST /league/result  → reconcileServer
//
// plus the two helpers the arena bridge (LG6) should use instead of the raw
// calls, because the ORDER against useLeague matters:
//
//   beginOnlineFight(target, ownPower, req)  /start, then beginLocalBattle
//   finishOnlineFight(session, result, ms)   applyLocalResult, then /result
//
// THE SAME RULES AS useLiveLeaderboard: nothing here ever throws, blocks a
// run or retries loudly. Every call resolves — `null` means "no answer"
// (never called, unreachable, timed out, a captive portal's HTML, a malformed
// body) — and every call is a no-op (null, no fetch at all) unless the build
// is an ONLINE league build (`LEAGUE_ONLINE`: a league build with a live
// endpoint that is not child-directed — so Poki, YouTube and kids builds never
// call) AND the leaderboard account gate lets this player in (a CrazyGames
// guest never calls).
//
// Server truth: after /me, /start and /result the server's standing is handed
// to useLeague (`reconcileServer`), and a failed /me or a 503 "league offline"
// flips it to unreachable (`setServerReachable(false)` → O3: no ranked fight).
//
// A result that could not be posted (network, timeout, 5xx) is kept in the
// league state (`unsent`) and re-posted before the next /me or /start while
// its token is still valid — the result was already applied locally, so the
// player sees it at once; the server's answer then corrects the standing.
//
// Identity and name: the leaderboard's own `resolveIdentity` (the SAME id the
// board row uses, and the name after the N2 denylist swap — the offending
// string never leaves the device). Names coming back are cleaned + swapped
// again (defence in depth, like the board).
//
// Reached only from inside src/league (hub UI, arena bridge); never imported
// from shared code (league flag boundary, rule 3).

import useLeague, {
  type LeagueFightTarget,
  type LeagueResultOutcome,
  type LeagueServerMe,
  type LeagueSession
} from '@/league/useLeague'
import { LEAGUE_ONLINE } from '@/league/leagueGate'
import { MIN_BATTLE_MS, TIER_FLOOR_POWER, TOKEN_TTL_MS, utcDay, type BattleResult } from '@/league/leagueMath'
import { NPC_MAX_POWER } from '@/league/leagueNpc'
import type { LeaguePoolFetcher, LeaguePoolRequest } from '@/league/leagueOpponents'
import { leaderboardAuthorized, leaderboardEndpoint } from '@/use/useLiveLeaderboard'
import { cleanName, resolveIdentity, type PlayerIdentity } from '@/use/usePlayerIdentity'
import { LEAGUE_TIERS, type LeagueDivision, type LeagueTier } from '@/use/leagueTiers'
import { sanitizeDisplayName } from '@/utils/nameDenylist'
import { validatePlayerBuildShape, type PlayerBuildV1 } from '@/utils/playerBuild'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Hard deadline per request (the board's budget too). */
export const LEAGUE_TIMEOUT_MS = 6000
/** Pool band width — the Worker's POOL_BAND_WIDTH. */
export const POOL_BAND_WIDTH = 10
const POOL_MAX_BAND = Math.ceil(NPC_MAX_POWER / POOL_BAND_WIDTH)
/** Margin added to MIN_BATTLE_MS before a win is posted (latency / clock grain). */
const MIN_RESULT_MARGIN_MS = 500
const TOP_MAX = 100

// ─── Types ──────────────────────────────────────────────────────────────────

/** Error outcomes a caller may need to act on. */
export type LeagueApiError =
  | 'daily_cap'       // 429 — the server's daily start cap (16)
  | 'gate_required'   // 409 — at a promotion gate: only the gatekeeper may be fought (`gateTier`)
  | 'not_at_gate'     // 409 — asked for a gatekeeper while not at the gate
  | 'bad_opponent'    // 400 / 409 — unrankable (baked) card, bad id, own row
  | 'opponent_gone'   // 404 — that pool row no longer has a build
  | 'busy'            // 409 — lost an optimistic-write race (retried once already)
  | 'expired'         // 410 — result after the token's TTL: recorded as a loss
  | 'too_fast'        // 422 — a win posted before MIN_BATTLE_MS (kept for retry)
  | 'bad_duration'    // 422 — durationMs longer than the server-measured battle
  | 'bad_token'       // 401
  | 'no_pending'      // 409 — token already used / nothing pending
  | 'offline'         // 503 — league offline (no LEAGUE_SECRET) or D1 unavailable
  | 'bad_request'     // any other 4xx
  | 'no_fights'       // local: no fight left / league locked (beginOnlineFight)
  | 'local_refused'   // local: useLeague refused the session after /start

/** GET /league/me `state` (and the `state` of every /start, /result answer). */
export interface LeagueServerState {
  season: number
  seasonEndsAt: number
  lp: number
  peakLp: number
  tier: LeagueTier
  division: LeagueDivision | null
  lpInDivision: number
  floor: number
  streak: number
  shields: number
  wins: number
  losses: number
  bestTier: LeagueTier
  fightsToday: number
  serverDailyCap: number
  dayGain: number
  dailyLpCap: number
  atGate: boolean
  gateTier: LeagueTier | null
  pending: { opp: string | null; expiresAt: number } | null
  lastSeason: { season: number; peakTier: LeagueTier } | null
}

export interface LeagueMeResult {
  /** The server has a league row for this id. */
  exists: boolean
  state: LeagueServerState
  /** This player's own pool id (`p:<rowid>`) — pass as `ownId` to the opponent ladder. */
  poolId: string | null
  season: number
}

export interface LeaguePoolResult {
  band: number
  updatedAt: number
  /** Names cleaned + denylist-swapped; builds shape-validated. */
  entries: { id: string; name: string; build: PlayerBuildV1; lpower: number }[]
}

export interface LeagueTopEntry {
  rank: number
  name: string
  lp: number
  tier: LeagueTier
  division: LeagueDivision | null
}

export interface LeagueTopResult {
  season: number
  updatedAt: number
  total: number
  entries: LeagueTopEntry[]
  /** LP histogram, [bucket LP, players], highest first. */
  dist: [number, number][]
}

export interface LeagueStartRequest {
  /** Opponent card id (`p:<rowid>` or `npc:…`) — or `gateTier` for the gatekeeper. */
  opp?: string
  gateTier?: LeagueTier
  /** The challenger's build (playerBuild.encodePlayerBuild). */
  build: PlayerBuildV1
  /** Skills in play on this build (server strips skills otherwise). */
  skills: boolean
}

export interface LeagueServerBattle {
  token: string
  seed: number
  E: number
  ownPower: number
  opp: { id: string; name: string; build: PlayerBuildV1; power: number } | null
  gate: LeagueTier | null
  expiresAt: number
  minResultAt: number
  state: LeagueServerState
  /** The server settled an earlier open battle as a loss on the way (O10). */
  abandoned: boolean
  /** Same fight asked again (a lost answer): the same token came back. */
  resumed: boolean
}

export type LeagueStartOutcome =
  | { ok: true; battle: LeagueServerBattle }
  | { ok: false; error: LeagueApiError; state: LeagueServerState | null; gateTier: LeagueTier | null }

export interface LeagueSubmitRequest {
  token: string
  result: BattleResult
  durationMs: number
  /** Local time the battle started (`LeagueSession.startedAt`); defaults to
   *  when this page saw the token's /start answer, else now. */
  startedAt?: number
}

export interface LeagueServerResult {
  state: LeagueServerState
  delta: number
  isGate: boolean
  promotedTo: LeagueTier | null
  firstReach: LeagueTier | null
  shielded: boolean
  capped: boolean
  seasonEnded: boolean
}

export type LeagueSubmitOutcome =
  | { ok: true; result: LeagueServerResult }
  | { ok: false; error: LeagueApiError; state: LeagueServerState | null }

export type OnlineFightStart =
  | { ok: true; battle: LeagueServerBattle; session: LeagueSession }
  | { ok: false; error: LeagueApiError; state: LeagueServerState | null; gateTier: LeagueTier | null }

// ─── Gate + identity ────────────────────────────────────────────────────────

/** May this session talk to the league server at all right now? */
export const leagueApiEnabled = (): boolean =>
  LEAGUE_ONLINE && leaderboardEndpoint.length > 0 && leaderboardAuthorized.value

let identityPromise: Promise<PlayerIdentity> | null = null
/** Resolved once per page load (resolveIdentity writes + flushes the save). */
const identity = (): Promise<PlayerIdentity> =>
  (identityPromise ??= resolveIdentity().catch((e: unknown) => {
    identityPromise = null
    throw e
  }))

// ─── Transport ──────────────────────────────────────────────────────────────

type Reply = { status: number; body: Record<string, unknown> } | null

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * One request with a hard deadline. Null on every transport failure: network
 * error, abort, a body that is not a JSON object (captive-portal HTML answering
 * 200). A JSON error body (4xx / 5xx) is a reply — the caller maps it.
 */
const request = async (path: string, init: RequestInit = {}): Promise<Reply> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LEAGUE_TIMEOUT_MS)
  try {
    const res = await fetch(`${leaderboardEndpoint}${path}`, { ...init, signal: controller.signal })
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return null
    }
    return isRecord(body) ? { status: res.status, body } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const post = (path: string, body: Record<string, unknown>): Promise<Reply> =>
  request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// ─── Validation ─────────────────────────────────────────────────────────────

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const int = (v: unknown): number => (num(v) ? Math.trunc(v) : 0)
const isTier = (t: unknown): t is LeagueTier => typeof t === 'string' && (LEAGUE_TIERS as readonly string[]).includes(t)
const division = (d: unknown): LeagueDivision | null => (d === 1 || d === 2 || d === 3 ? d : null)

/** A name that came from the server: controls stripped, denylist swapped. */
export const safeServerName = (raw: unknown): string => {
  const clean = cleanName(raw)
  return clean.length > 0 ? sanitizeDisplayName(clean) : 'Anon'
}

/** The Worker's `view(row)`; null when any load-bearing field is off. */
export const parseServerState = (raw: unknown): LeagueServerState | null => {
  if (!isRecord(raw)) return null
  const need = ['season', 'lp', 'peakLp', 'streak', 'shields', 'wins', 'losses', 'fightsToday', 'dayGain'] as const
  for (const k of need) if (!num(raw[k]) || (raw[k] as number) < 0) return null
  if (!isTier(raw.tier)) return null
  const p = raw.pending
  const pending = isRecord(p) && num(p.expiresAt)
    ? { opp: typeof p.opp === 'string' ? p.opp : null, expiresAt: p.expiresAt }
    : null
  const ls = raw.lastSeason
  const lastSeason = isRecord(ls) && num(ls.season) && isTier(ls.peakTier)
    ? { season: int(ls.season), peakTier: ls.peakTier }
    : null
  return {
    season: int(raw.season),
    seasonEndsAt: int(raw.seasonEndsAt),
    lp: int(raw.lp),
    peakLp: int(raw.peakLp),
    tier: raw.tier,
    division: division(raw.division),
    lpInDivision: int(raw.lpInDivision),
    floor: int(raw.floor),
    streak: int(raw.streak),
    shields: int(raw.shields),
    wins: int(raw.wins),
    losses: int(raw.losses),
    bestTier: isTier(raw.bestTier) ? raw.bestTier : raw.tier,
    fightsToday: int(raw.fightsToday),
    serverDailyCap: int(raw.serverDailyCap),
    dayGain: int(raw.dayGain),
    dailyLpCap: int(raw.dailyLpCap),
    atGate: raw.atGate === true,
    gateTier: isTier(raw.gateTier) ? raw.gateTier : null,
    pending,
    lastSeason
  }
}

/**
 * Server view → what useLeague reconciles. The view is already rolled to the
 * server's today (lazy reset), so `day` is today's UTC day. `fightsAdjust`
 * subtracts fights the caller is about to count locally (see startBattle).
 */
export const toServerMe = (
  s: LeagueServerState,
  opts: { pending?: boolean; fightsAdjust?: number } = {}
): LeagueServerMe => ({
  season: s.season,
  lp: s.lp,
  peakLp: s.peakLp,
  streak: s.streak,
  shields: s.shields,
  day: utcDay(Date.now()),
  dayGain: s.dayGain,
  battles: s.wins + s.losses,
  fights: Math.max(0, s.fightsToday - (opts.fightsAdjust ?? 0)),
  pending: opts.pending ?? s.pending !== null,
  ended: s.lastSeason
})

const parseBuild = (raw: unknown): PlayerBuildV1 | null => validatePlayerBuildShape(raw)

const errorOf = (status: number, body: Record<string, unknown>): LeagueApiError => {
  const e = typeof body.error === 'string' ? body.error : ''
  if (status === 429) return 'daily_cap'
  if (status === 503) return 'offline'
  if (status === 410) return 'expired'
  if (status === 401) return 'bad_token'
  if (status === 404) return 'opponent_gone'
  if (status === 422) return e === 'too fast' ? 'too_fast' : 'bad_duration'
  if (status === 409) {
    if (e === 'gate') return 'gate_required'
    if (e === 'not at gate') return 'not_at_gate'
    if (e === 'self') return 'bad_opponent'
    if (e === 'busy') return 'busy'
    return 'no_pending'
  }
  if (e === 'bad opp') return 'bad_opponent'
  return 'bad_request'
}

const league = () => useLeague()

/** A 5xx other than the known 503 "offline" is a transient failure, like no answer. */
const transient = (reply: Reply): boolean => reply === null || (reply.status >= 500 && reply.status !== 503)

// ─── GET /league/me ─────────────────────────────────────────────────────────

/**
 * The player's server standing. Posts a still-unsent result first (so the
 * standing it reconciles already contains it), then reconciles useLeague with
 * the answer. Null (and `setServerReachable(false)`) when unreachable.
 */
export const fetchMe = async (): Promise<LeagueMeResult | null> => {
  if (!leagueApiEnabled()) return null
  await flushPendingResult()
  try {
    const { id } = await identity()
    const reply = await request(`/league/me?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    const state = reply && reply.status === 200 ? parseServerState(reply.body.state) : null
    if (!reply || !state) {
      league().setServerReachable(false)
      return null
    }
    const poolId = typeof reply.body.poolId === 'string' ? reply.body.poolId : null
    league().reconcileServer(toServerMe(state))
    return { exists: reply.body.exists === true, state, poolId, season: num(reply.body.season) ? int(reply.body.season) : state.season }
  } catch {
    league().setServerReachable(false)
    return null
  }
}

// ─── GET /league/pool ───────────────────────────────────────────────────────

/** The pool band for a request: round(max(ownPower, tier floor) / 10), clamped. */
export const poolBand = (tier: LeagueTier, ownPower: number): number => {
  const p = Math.max(num(ownPower) ? ownPower : 0, TIER_FLOOR_POWER[tier] ?? 0)
  return Math.max(0, Math.min(POOL_MAX_BAND, Math.round(p / POOL_BAND_WIDTH)))
}

/** LG1's LeaguePoolFetcher: the live pool near the player's power, own row
 *  excluded server-side. Null when unreachable / malformed. */
export const fetchPool = async (req: LeaguePoolRequest): Promise<LeaguePoolResult | null> => {
  if (!leagueApiEnabled()) return null
  try {
    const { id } = await identity()
    const band = poolBand(req.tier, req.ownPower)
    const reply = await request(`/league/pool?band=${band}&id=${encodeURIComponent(id)}`)
    if (!reply || reply.status !== 200 || !Array.isArray(reply.body.entries)) return null
    const entries: LeaguePoolResult['entries'] = []
    for (const e of reply.body.entries as unknown[]) {
      if (!isRecord(e) || typeof e.id !== 'string') continue
      const build = parseBuild(e.build)
      if (!build) continue
      entries.push({ id: e.id, name: safeServerName(e.name), build, lpower: int(e.lpower) })
    }
    return { band: num(reply.body.band) ? int(reply.body.band) : band, updatedAt: int(reply.body.updatedAt), entries }
  } catch {
    return null
  }
}

/** The fetcher object LG1's ladder takes (`getOpponentDeck(ctx, { fetcher })`). */
export const leaguePoolFetcher: LeaguePoolFetcher = { fetchPool }

// ─── GET /league/top ────────────────────────────────────────────────────────

/** This season's top 100 + LP histogram. Null when unreachable / malformed. */
export const fetchTop = async (): Promise<LeagueTopResult | null> => {
  if (!leagueApiEnabled()) return null
  try {
    const reply = await request('/league/top')
    if (!reply || reply.status !== 200 || !Array.isArray(reply.body.entries)) return null
    const entries: LeagueTopEntry[] = []
    for (const e of (reply.body.entries as unknown[]).slice(0, TOP_MAX)) {
      if (!isRecord(e) || !num(e.rank) || !num(e.lp) || !isTier(e.tier)) continue
      entries.push({ rank: int(e.rank), name: safeServerName(e.name), lp: int(e.lp), tier: e.tier, division: division(e.division) })
    }
    const dist: [number, number][] = Array.isArray(reply.body.dist)
      ? (reply.body.dist as unknown[])
        .filter((d): d is [number, number] => Array.isArray(d) && num(d[0]) && num(d[1]))
        .map(([b, n]) => [int(b), int(n)] as [number, number])
      : []
    return {
      season: int(reply.body.season),
      updatedAt: int(reply.body.updatedAt),
      total: Math.max(int(reply.body.total), entries.length),
      entries,
      dist
    }
  } catch {
    return null
  }
}

// ─── POST /league/start ─────────────────────────────────────────────────────

/** Local time each token's /start answer arrived (this page load). */
const startedAtByToken = new Map<string, number>()

const parseBattle = (body: Record<string, unknown>): LeagueServerBattle | null => {
  const state = parseServerState(body.state)
  if (!state || typeof body.token !== 'string' || body.token.length === 0 || body.token.length > 200) return null
  if (!num(body.seed) || !num(body.E) || !num(body.expiresAt)) return null
  let opp: LeagueServerBattle['opp'] = null
  if (body.opp !== null && body.opp !== undefined) {
    const o = body.opp
    const build = isRecord(o) ? parseBuild(o.build) : null
    if (!isRecord(o) || typeof o.id !== 'string' || !build) return null
    opp = { id: o.id, name: safeServerName(o.name), build, power: int(o.power) }
  }
  return {
    token: body.token,
    seed: int(body.seed) >>> 0,
    E: Math.min(1, Math.max(0, body.E)),
    ownPower: int(body.ownPower),
    opp,
    gate: isTier(body.gate) ? body.gate : null,
    expiresAt: body.expiresAt,
    minResultAt: num(body.minResultAt) ? body.minResultAt : 0,
    state,
    abandoned: body.abandoned !== null && body.abandoned !== undefined && body.abandoned !== false,
    resumed: body.resumed === true
  }
}

/**
 * Open one ranked battle server-side. Posts a still-unsent result first (a
 * /start while a token is open settles it as a loss). On success the server
 * standing is reconciled AS OF BEFORE this fight — its `fightsToday` minus
 * this one, no pending — because the caller counts the fight and records the
 * pending itself in `beginLocalBattle` (use `beginOnlineFight`, which does
 * exactly that). Null when unreachable / disabled.
 */
export const startBattle = async (req: LeagueStartRequest): Promise<LeagueStartOutcome | null> => {
  if (!leagueApiEnabled()) return null
  await flushPendingResult()
  try {
    const { id, name } = await identity()
    const body: Record<string, unknown> = { id, name, build: req.build, caps: { skills: req.skills } }
    if (req.gateTier) body.gateTier = req.gateTier
    else body.opp = req.opp
    let reply = await post('/league/start', body)
    // Lost an optimistic-write race: one immediate retry.
    if (reply && reply.status === 409 && reply.body.error === 'busy') reply = await post('/league/start', body)
    if (transient(reply)) {
      league().setServerReachable(false)
      return null
    }
    if (reply!.status === 200) {
      const battle = parseBattle(reply!.body)
      if (!battle) {
        league().setServerReachable(false)
        return null
      }
      startedAtByToken.set(battle.token, Date.now())
      league().reconcileServer(toServerMe(battle.state, { pending: false, fightsAdjust: 1 }))
      return { ok: true, battle }
    }
    const { status, body: err } = reply!
    const error = errorOf(status, err)
    const state = parseServerState(err.state)
    if (error === 'offline') league().setServerReachable(false)
    else if (state) league().reconcileServer(toServerMe(state))
    else league().setServerReachable(true)
    return { ok: false, error, state, gateTier: isTier(err.gateTier) ? err.gateTier : state?.gateTier ?? null }
  } catch {
    league().setServerReachable(false)
    return null
  }
}

// ─── POST /league/result ────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Errors after which the result is never re-posted. */
const FINAL_ERRORS: ReadonlySet<LeagueApiError> = new Set(['expired', 'bad_token', 'no_pending', 'bad_duration', 'bad_request', 'bad_opponent', 'opponent_gone'])

const parseResult = (body: Record<string, unknown>): LeagueServerResult | null => {
  const state = parseServerState(body.state)
  if (!state || !num(body.delta)) return null
  return {
    state,
    delta: int(body.delta),
    isGate: body.isGate === true,
    promotedTo: isTier(body.promotedTo) ? body.promotedTo : null,
    firstReach: isTier(body.firstReach) ? body.firstReach : null,
    shielded: body.shielded === true,
    capped: body.capped === true,
    seasonEnded: body.seasonEnded === true
  }
}

/**
 * Post one finished battle. The result is queued in the league state FIRST
 * (a closed tab mid-request retries it too) and forgotten once the server
 * answered for it. A win waits until MIN_BATTLE_MS after /start (the server
 * refuses faster wins) — so do not `await` this before showing the result.
 *
 * Null: disabled, or a transient failure (network, timeout, 5xx) — the result
 * stays queued and is re-posted on the next fetchMe / startBattle while its
 * token is valid. `{ ok: false }`: the server refused it ('too_fast' stays
 * queued; every other error is final — 'expired' was recorded as a loss).
 */
export const submitResult = async (req: LeagueSubmitRequest): Promise<LeagueSubmitOutcome | null> => {
  if (!leagueApiEnabled()) return null
  if (typeof req.token !== 'string' || req.token.length === 0) return null
  const startedAt = num(req.startedAt) ? req.startedAt : startedAtByToken.get(req.token) ?? Date.now()
  league().queueUnsentResult({
    token: req.token,
    result: req.result === 'win' ? 'win' : 'loss',
    durationMs: Math.max(0, Math.round(num(req.durationMs) ? req.durationMs : 0)),
    expiresAt: startedAt + TOKEN_TTL_MS,
    notBefore: startedAt + MIN_BATTLE_MS + MIN_RESULT_MARGIN_MS
  })
  return postUnsent()
}

let inflight: Promise<LeagueSubmitOutcome | null> | null = null

/** Post the queued result (one at a time). */
const postUnsent = (): Promise<LeagueSubmitOutcome | null> => {
  inflight ??= (async () => {
    try {
      return await postUnsentOnce()
    } finally {
      inflight = null
    }
  })()
  return inflight
}

const postUnsentOnce = async (): Promise<LeagueSubmitOutcome | null> => {
  const L = league()
  L.refresh() // drops an expired unsent
  const u = L.state.value.unsent
  if (!u) return null
  try {
    if (u.result === 'win') {
      const wait = u.notBefore - Date.now()
      if (wait > 0) await sleep(Math.min(wait, MIN_BATTLE_MS + MIN_RESULT_MARGIN_MS))
    }
    const { id } = await identity()
    const reply = await post('/league/result', { id, token: u.token, result: u.result, durationMs: u.durationMs })
    if (transient(reply)) return null // stays queued
    const { status, body } = reply!
    if (status === 200) {
      const res = parseResult(body)
      if (!res) return null
      L.clearUnsentResult(u.token)
      startedAtByToken.delete(u.token)
      L.reconcileServer(toServerMe(res.state, { pending: false }))
      return { ok: true, result: res }
    }
    const error = errorOf(status, body)
    const state = parseServerState(body.state)
    if (error === 'offline') {
      L.setServerReachable(false)
      return { ok: false, error, state }
    }
    if (FINAL_ERRORS.has(error)) {
      L.clearUnsentResult(u.token)
      startedAtByToken.delete(u.token)
    }
    if (state) L.reconcileServer(toServerMe(state))
    return { ok: false, error, state }
  } catch {
    return null
  }
}

/**
 * Re-post a result that a previous attempt could not deliver (hub open, next
 * fight). Resolves the outcome, or null when there was nothing to post / it
 * failed transiently again. Never throws.
 */
export const flushPendingResult = async (): Promise<LeagueSubmitOutcome | null> => {
  if (!leagueApiEnabled()) return null
  if (!league().state.value.unsent) return null
  return postUnsent()
}

// ─── Arena helpers (LG6) ────────────────────────────────────────────────────

/**
 * /league/start, then useLeague.beginLocalBattle with the server's seed and
 * token — the only order in which the day's fight is counted once and an
 * older open battle is not settled twice. Checks the local fight budget
 * first, so a start the client would refuse never opens a server token.
 */
export const beginOnlineFight = async (
  target: LeagueFightTarget,
  ownPower: number,
  req: LeagueStartRequest
): Promise<OnlineFightStart | null> => {
  if (!leagueApiEnabled()) return null
  const L = league()
  L.refresh()
  if (!L.state.value.unlocked || L.fightsLeft.value <= 0) {
    return { ok: false, error: 'no_fights', state: null, gateTier: null }
  }
  const out = await startBattle(req)
  if (!out || !out.ok) return out
  const session = L.beginLocalBattle(target, ownPower, { seed: out.battle.seed, token: out.battle.token })
  if (!session) return { ok: false, error: 'local_refused', state: out.battle.state, gateTier: out.battle.state.gateTier }
  return { ok: true, battle: out.battle, session }
}

/**
 * Apply the result locally FIRST (coins, LP delta for the result panel — the
 * caller credits the coins), then post it. `local` is ready at once; `server`
 * settles later (a win waits for MIN_BATTLE_MS) and has already reconciled
 * the standing when it resolves. An offline session (no token) never posts.
 */
export const finishOnlineFight = (
  session: LeagueSession,
  result: BattleResult,
  durationMs: number
): { local: LeagueResultOutcome; server: Promise<LeagueSubmitOutcome | null> } => {
  const local = league().applyLocalResult(session, result, durationMs)
  const server = !local.stale && session.token && leagueApiEnabled()
    ? submitResult({ token: session.token, result, durationMs, startedAt: session.startedAt })
    : Promise.resolve(null)
  return { local, server }
}

/** Tests only: forget the per-page caches. */
export const __resetLeagueApiForTests = (): void => {
  identityPromise = null
  startedAtByToken.clear()
  inflight = null
}
