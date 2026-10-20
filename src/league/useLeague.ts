// ─── League state (LG2) ─────────────────────────────────────────────────────
//
// The player's league standing, daily fights, unlock and season bookkeeping —
// one singleton, persisted as `LeagueStateV1` JSON under LEAGUE_STATE_KEY
// (`smashers_league`: part of the cloud payload, kept across a progress reset
// through useResetProgress' KEEP_KEYS, re-read on every `saveDataVersion`).
//
// Reached ONLY through `loadLeague()` in leagueGate.ts, so on a league-off
// build this module does not exist and nothing here can run or write.
//
// The rules themselves live in leagueMath.ts (worker-shared); this module
// only adds what is client-side: the fight counter and ad top-ups, the
// unlock, the pending-battle record, reward bookkeeping and the server
// reconcile. It never grants coins itself — every result / claim RETURNS the
// coins for the caller (LG6 / LG5b) to credit through the normal wallet.
//
// Time: every day / season boundary is UTC (leagueMath.utcDay / seasonIndex,
// the same 00:00 UTC as src/utils/dayKey.ts). A read rolls the state over
// first, so a player returning after midnight or after a season end sees the
// new day / season without having to fight.
//
// O3: on an ONLINE league build the server decides; when it is unreachable
// there is no ranked fight at all (`serverStatus === 'unreachable'` →
// `canFight` false, `offlineBlocked` true for the UI). Offline league builds
// (Poki, YouTube, kids) never ask a server.
//
// O10: a battle that was started and never reported — a closed tab, a
// surrender that never came back — is a LOSS. It is settled when it has been
// pending longer than TOKEN_TTL_MS, or immediately when the next battle
// starts.
//
// DT1: a league fight's first turn is NEUTRAL — derived from the battle seed
// (50/50), never from the stored last campaign result — and handed out in the
// session as `firstTurn` for the arena (LG6).

import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'
import { saveDataVersion } from '@/use/useSaveStatus'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { hash01 } from '@/use/useDeterministicRng'
import { msUntilNextUtcMidnight } from '@/utils/dayKey'
import { LEAGUE_TIERS, type LeagueDivision, type LeagueTier } from '@/use/leagueTiers'
import { LEAGUE_STATE_KEY } from '@/league/leagueKeys'
import { LEAGUE_ONLINE, LEAGUE_UNLOCK_STAGE, leagueAccountAllowed } from '@/league/leagueGate'
import {
  AD_MAX,
  PROMOTION_SHIELDS,
  TOKEN_TTL_MS,
  applyBattle,
  atPromotionGate,
  dailyFightLimit,
  expectedScore,
  rewardCoins,
  rollover,
  sanitizeLp,
  seasonBounds,
  seasonFloorLp,
  seasonReward,
  tierOf,
  type BattleResult,
  type LeagueMathState,
  type SeasonReward
} from '@/league/leagueMath'

// ─── Persisted shape ────────────────────────────────────────────────────────

/** A started, not yet reported ranked battle. */
export interface LeaguePendingBattle {
  /** Session id (matches `LeagueSession.id`). */
  id: string
  seed: number
  /** Expected score at start (for the O10 loss). */
  E: number
  isGate: boolean
  startedAt: number
  /** Opponent card id, if any (null for the gatekeeper). */
  opponentId: string | null
  /** Server battle token (online builds, LG3). */
  token: string | null
}

/**
 * A finished ranked battle whose result the server has not acknowledged yet
 * (LG3: the POST failed transiently, or the tab closed mid-request). The
 * result was already applied locally; leagueApi re-posts it on the next hub
 * open / fight start while the token is valid, then the server's answer
 * reconciles the standing.
 */
export interface LeagueUnsentResult {
  token: string
  result: BattleResult
  durationMs: number
  /** Token expiry (ms, server clock ≈ ours) — past it the server has settled it (O10). */
  expiresAt: number
  /** Earliest post for a win (MIN_BATTLE_MS after /league/start, local clock). */
  notBefore: number
}

export interface LeagueStateV1 {
  v: 1
  /** Season index (leagueMath.seasonIndex) the fields below belong to. */
  season: number
  lp: number
  peakLp: number
  /** Highest tier ever reached, any season. */
  bestTierEver: LeagueTier
  streak: number
  shields: number
  /** This season's floor (seasonFloorLp(peakLp)) — derived, stored for the UI / server. */
  floor: number
  /** utcDay the daily counters below belong to. */
  day: number
  /** Ranked fights started today. */
  fights: number
  /** Rewarded top-ups used today (≤ AD_MAX). */
  adBonusUsed: number
  /** LP gained today (leagueMath's daily cap). */
  gained: number
  /** Ranked fights this season (a season with none pays no reward). */
  battles: number
  /** Reached LEAGUE_UNLOCK_STAGE once — survives a progress reset. */
  unlocked: boolean
  /** The unlock popup was shown. */
  unlockSeen: boolean
  /** Last season whose end-of-season reward was claimed (−1: none). */
  claimedSeason: number
  /** A finished season waiting to be claimed (its peak tier), else null. */
  unclaimed: { season: number; peakTier: LeagueTier } | null
  /** Bit per tier (LEAGUE_TIERS index) whose first-reach coins were paid — ever, not per season. */
  firstReachMask: number
  /** Champion frame (LG6): a cosmetic granted by a Champion season reward —
   *  a frame around the rank badge / HUD button. Absent until granted. */
  championFrame?: true
  pending?: LeaguePendingBattle
  /** A result still to be posted (online builds, LG3). */
  unsent?: LeagueUnsentResult
}

// ─── Public types ───────────────────────────────────────────────────────────

/** What a fight is against: one of the three opponent cards, or the gatekeeper at x99. */
export type LeagueFightTarget =
  | { kind: 'card'; id: string; power: number }
  | { kind: 'gate' }

export interface LeagueSession {
  id: string
  /** Battle seed → `initGame({ seed })` (league determinism, LG-DET). */
  seed: number
  /** Challenger's expected score (0.5 for the gatekeeper — its E is ignored). */
  E: number
  isGate: boolean
  /** DT1: who moves first, from the seed alone (neutral 50/50). */
  firstTurn: 'player' | 'opponent'
  target: LeagueFightTarget
  startedAt: number
  token: string | null
}

export interface LeagueResultOutcome {
  result: BattleResult
  lpBefore: number
  lpAfter: number
  delta: number
  isGate: boolean
  promotedTo: LeagueTier | null
  /** Tier reached for the first time this season. */
  firstReach: LeagueTier | null
  shielded: boolean
  capped: boolean
  /** Coins earned (win / loss + first-ever tier reach) — the CALLER credits them. */
  coins: number
  /** The result closed out a battle that had already been settled (O10) — no-op. */
  stale: boolean
}

export interface LeagueStanding {
  season: number
  seasonEndsMs: number
  lp: number
  tier: LeagueTier
  division: LeagueDivision | null
  lpInDivision: number
  /** Next fight is the gatekeeper. */
  atGate: boolean
  floorLp: number
  shields: number
  streak: number
  peakLp: number
  bestTierEver: LeagueTier
}

/**
 * GET /league/me as the client consumes it (LG3 → reconcileServer; LG4
 * returns it). The server is the source of truth for every field here.
 */
export interface LeagueServerMe {
  season: number
  lp: number
  peakLp: number
  streak: number
  shields: number
  /** utcDay of the counters below. */
  day: number
  dayGain: number
  battles: number
  /** /league/start calls today. */
  fights: number
  /** Ad top-ups the server has credited today (optional: kept local if absent). */
  adBonusUsed?: number
  /** Server holds an unfinished token (false → any local pending is resolved). */
  pending?: boolean
  /** A season that ended server-side and is not yet claimed. */
  ended?: { season: number; peakTier: LeagueTier } | null
}

export type LeagueServerStatus = 'unknown' | 'ok' | 'unreachable'

// ─── Helpers ────────────────────────────────────────────────────────────────

const now = (): number => Date.now()
const whole = (n: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0
const tierIdx = (t: LeagueTier): number => LEAGUE_TIERS.indexOf(t)
const isTier = (t: unknown): t is LeagueTier => typeof t === 'string' && (LEAGUE_TIERS as readonly string[]).includes(t)
const maxTier = (a: LeagueTier, b: LeagueTier): LeagueTier => (tierIdx(a) >= tierIdx(b) ? a : b)

/** Salt of the DT1 first-turn roll (independent of every gameplay stream). */
const FIRST_TURN_SALT = 0x1f57
/** DT1: neutral first turn from the seed alone. */
export const leagueFirstTurn = (seed: number): 'player' | 'opponent' =>
  hash01(seed | 0, FIRST_TURN_SALT) < 0.5 ? 'player' : 'opponent'

const randomSeed = (): number => (Math.floor(Math.random() * 0x100000000) >>> 0) || 1
const randomId = (): string => `${now().toString(36)}-${Math.floor(Math.random() * 0x7fffffff).toString(36)}`

export const freshLeagueState = (t: number = now()): LeagueStateV1 => {
  const r = rollover({ season: 0, lp: 0, peakLp: 0, streak: 0, shields: 0, day: 0, dayGain: 0, battles: 0 }, t).state
  return {
    v: 1,
    season: r.season,
    lp: 0,
    peakLp: 0,
    bestTierEver: 'wood',
    streak: 0,
    shields: 0,
    floor: 0,
    day: r.day,
    fights: 0,
    adBonusUsed: 0,
    gained: 0,
    battles: 0,
    unlocked: false,
    unlockSeen: false,
    claimedSeason: -1,
    unclaimed: null,
    firstReachMask: 0
  }
}

const parsePending = (p: unknown): LeaguePendingBattle | undefined => {
  if (!p || typeof p !== 'object') return undefined
  const o = p as Partial<LeaguePendingBattle>
  if (typeof o.id !== 'string' || typeof o.startedAt !== 'number' || !Number.isFinite(o.startedAt)) return undefined
  return {
    id: o.id,
    seed: whole(o.seed, 0xffffffff),
    E: typeof o.E === 'number' && Number.isFinite(o.E) ? Math.min(1, Math.max(0, o.E)) : 0.5,
    isGate: o.isGate === true,
    startedAt: o.startedAt,
    opponentId: typeof o.opponentId === 'string' ? o.opponentId : null,
    token: typeof o.token === 'string' ? o.token : null
  }
}

const parseUnsent = (u: unknown): LeagueUnsentResult | undefined => {
  if (!u || typeof u !== 'object') return undefined
  const o = u as Partial<LeagueUnsentResult>
  if (typeof o.token !== 'string' || o.token.length === 0 || o.token.length > 200) return undefined
  if (o.result !== 'win' && o.result !== 'loss') return undefined
  if (typeof o.expiresAt !== 'number' || !Number.isFinite(o.expiresAt)) return undefined
  return {
    token: o.token,
    result: o.result,
    durationMs: whole(o.durationMs),
    expiresAt: o.expiresAt,
    notBefore: typeof o.notBefore === 'number' && Number.isFinite(o.notBefore) ? o.notBefore : 0
  }
}

/** Untrusted JSON → a whole, valid LeagueStateV1 (null: unreadable). */
export const parseLeagueState = (raw: string | null): LeagueStateV1 | null => {
  if (raw === null) return null
  let o: Partial<LeagueStateV1> | null
  try {
    o = JSON.parse(raw) as Partial<LeagueStateV1> | null
  } catch {
    return null
  }
  if (!o || typeof o !== 'object') return null
  const lp = sanitizeLp(o.lp as number)
  const peakLp = Math.max(lp, sanitizeLp(o.peakLp as number))
  const unclaimed = o.unclaimed && typeof o.unclaimed === 'object' && isTier(o.unclaimed.peakTier)
    ? { season: whole(o.unclaimed.season), peakTier: o.unclaimed.peakTier }
    : null
  const s: LeagueStateV1 = {
    v: 1,
    season: whole(o.season),
    lp,
    peakLp,
    bestTierEver: maxTier(isTier(o.bestTierEver) ? o.bestTierEver : 'wood', tierOf(peakLp).tier),
    streak: whole(o.streak),
    shields: whole(o.shields, PROMOTION_SHIELDS),
    floor: seasonFloorLp(peakLp),
    day: whole(o.day),
    fights: whole(o.fights),
    adBonusUsed: whole(o.adBonusUsed, AD_MAX),
    gained: whole(o.gained),
    battles: whole(o.battles),
    unlocked: o.unlocked === true,
    unlockSeen: o.unlockSeen === true,
    claimedSeason: typeof o.claimedSeason === 'number' && Number.isInteger(o.claimedSeason) && o.claimedSeason >= 0 ? o.claimedSeason : -1,
    unclaimed,
    firstReachMask: whole(o.firstReachMask, 0x7f)
  }
  if (o.championFrame === true) s.championFrame = true
  const pending = parsePending(o.pending)
  if (pending) s.pending = pending
  const unsent = parseUnsent(o.unsent)
  if (unsent) s.unsent = unsent
  return s
}

const toMath = (s: LeagueStateV1): LeagueMathState => ({
  season: s.season, lp: s.lp, peakLp: s.peakLp, streak: s.streak, shields: s.shields,
  day: s.day, dayGain: s.gained, battles: s.battles
})

const fromMath = (s: LeagueStateV1, m: LeagueMathState): LeagueStateV1 => ({
  ...s,
  season: m.season,
  lp: m.lp,
  peakLp: m.peakLp,
  bestTierEver: maxTier(s.bestTierEver, tierOf(m.peakLp).tier),
  streak: m.streak,
  shields: m.shields,
  floor: seasonFloorLp(m.peakLp),
  day: m.day,
  gained: m.dayGain,
  battles: m.battles
})

/** Bring a state to `t`: season rollover (remembering the finished season
 *  for its reward), a new UTC day's counters. Pure. */
export const rollLeagueState = (s: LeagueStateV1, t: number): LeagueStateV1 => {
  const { state: m, ended } = rollover(toMath(s), t)
  let out = fromMath(s, m)
  if (m.day !== s.day) out = { ...out, fights: 0, adBonusUsed: 0 }
  if (ended && ended.season > s.claimedSeason) out = { ...out, unclaimed: { season: ended.season, peakTier: ended.peakTier } }
  return out
}

// ─── Singleton state ────────────────────────────────────────────────────────

const campaign = useSpinnerCampaign()

/** Whether the key existed (or a mutation created it): a never-unlocked,
 *  never-played player gets no league key written at all. */
let stored = false

const readState = (): LeagueStateV1 => {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEAGUE_STATE_KEY)
  } catch { /* private mode */
  }
  const parsed = parseLeagueState(raw)
  stored = parsed !== null
  return parsed ?? freshLeagueState()
}

const state: Ref<LeagueStateV1> = shallowRef(readState())
const serverStatus: Ref<LeagueServerStatus> = ref('unknown')

/** Every write goes through here. A player whose account may not enter the
 *  league (a CrazyGames guest — leagueAccountAllowed) never gets the key
 *  written: the in-memory state moves, the storage does not. */
const persist = (next: LeagueStateV1): void => {
  state.value = next
  if (!leagueAccountAllowed()) return
  stored = true
  try {
    localStorage.setItem(LEAGUE_STATE_KEY, JSON.stringify(next))
  } catch { /* quota / private mode — the in-memory state still holds */
  }
}

/** Settle an abandoned battle (O10) as a loss. Returns the new state. */
const settleAbandoned = (s: LeagueStateV1, t: number): LeagueStateV1 => {
  if (!s.pending) return s
  const { pending, ...rest } = s
  const out = applyBattle(toMath(rest), { result: 'loss', E: pending.E }, t)
  return rollLeagueState(fromMath(rest, out.state), t)
}

/**
 * The state as of now: day / season rollover, an expired pending battle
 * settled as a loss (O10), the unlock caught up with the campaign stage.
 * Writes only when something changed AND the key exists (or the change is
 * the unlock itself).
 */
const refresh = (): LeagueStateV1 => {
  const t = now()
  const cur = state.value
  let next = rollLeagueState(cur, t)
  if (next.pending && t - next.pending.startedAt > TOKEN_TTL_MS) next = settleAbandoned(next, t)
  if (next.unsent && t > next.unsent.expiresAt) {
    // Too late to post: the server has settled that token itself (O10).
    const { unsent: _u, ...rest } = next
    void _u
    next = rest
  }
  // The unlock is only caught up for a player allowed into the league; a
  // guest who signs in later gets it computed from the stage then.
  if (!next.unlocked && leagueAccountAllowed() && campaign.currentStageId.value >= LEAGUE_UNLOCK_STAGE) {
    next = { ...next, unlocked: true }
  }
  if (JSON.stringify(next) !== JSON.stringify(cur)) {
    if (stored || next.unlocked) persist(next)
    else state.value = next
  }
  return state.value
}

// Cloud (re)hydrate / progress reset: re-read the stored copy, then roll it.
watch(saveDataVersion, () => {
  state.value = readState()
  refresh()
})
// Unlock the moment the campaign reaches the unlock stage (and on load).
watch(campaign.currentStageId, () => {
  refresh()
}, { immediate: true })

// Account gate changed (CrazyGames sign-in / sign-out): start from the stored
// copy again, so a guest's in-memory state never leaks into the key and a
// fresh sign-in catches the unlock up from the stage.
watch(leagueAccountAllowed, () => {
  state.value = readState()
  refresh()
})

// ─── Derived ────────────────────────────────────────────────────────────────

const fightsLimit = computed(() => dailyFightLimit(state.value.adBonusUsed))
const fightsLeft = computed(() => Math.max(0, fightsLimit.value - state.value.fights))

/** O3: an online build whose server did not answer — no ranked fight. */
const offlineBlocked = computed(() => LEAGUE_ONLINE && serverStatus.value === 'unreachable')

const canFight = computed(() =>
  state.value.unlocked
  && fightsLeft.value > 0
  && (!LEAGUE_ONLINE || serverStatus.value === 'ok'))

/** Rewarded top-up offer: ad builds only (build-time), max AD_MAX a day. */
const canAdTopUp = computed(() => HAS_REWARDED_ADS && state.value.unlocked && state.value.adBonusUsed < AD_MAX)

const standing: ComputedRef<LeagueStanding> = computed(() => {
  const s = state.value
  const pos = tierOf(s.lp)
  return {
    season: s.season,
    seasonEndsMs: seasonBounds(s.season).endMs,
    lp: s.lp,
    tier: pos.tier,
    division: pos.division,
    lpInDivision: pos.lpInDivision,
    atGate: atPromotionGate(s.lp),
    floorLp: s.floor,
    shields: s.shields,
    streak: s.streak,
    peakLp: s.peakLp,
    bestTierEver: s.bestTierEver
  }
})

/** The Champion frame was granted (a Champion season reward, kept forever). */
const championFrame = computed(() => state.value.championFrame === true)

const unclaimedSeason = computed(() => {
  const u = state.value.unclaimed
  return u && u.season > state.value.claimedSeason ? u : null
})

// ─── Actions ────────────────────────────────────────────────────────────────

/** Credit a finished rewarded ad: +AD_BONUS fights today. False when not offered. */
const grantAdFights = (): boolean => {
  refresh()
  if (!canAdTopUp.value) return false
  persist({ ...state.value, adBonusUsed: state.value.adBonusUsed + 1 })
  return true
}

/**
 * Start a ranked battle. Counts the fight, records it as pending, returns the
 * session (seed, E, first turn) — or null when no fight is allowed or the
 * target does not match the standing (the gatekeeper at x99, a card
 * otherwise). A still-pending earlier battle is settled as a loss first (O10).
 *
 * `ownPower`: the challenger's team power (playerBuild.buildPower). `server`:
 * the seed / token /league/start handed out (online builds, LG3).
 */
const beginLocalBattle = (
  target: LeagueFightTarget,
  ownPower: number,
  server?: { seed?: number; token?: string | null }
): LeagueSession | null => {
  let s = refresh()
  const t = now()
  if (s.pending) {
    s = settleAbandoned(s, t)
    persist(s)
  }
  if (!canFight.value) return null
  const isGate = atPromotionGate(s.lp)
  if ((target.kind === 'gate') !== isGate) return null
  const seed = server?.seed !== undefined ? ((server.seed >>> 0) || 1) : randomSeed()
  const E = target.kind === 'card' ? expectedScore(ownPower, target.power) : 0.5
  const session: LeagueSession = {
    id: randomId(),
    seed,
    E,
    isGate,
    firstTurn: leagueFirstTurn(seed),
    target,
    startedAt: t,
    token: server?.token ?? null
  }
  persist({
    ...s,
    fights: s.fights + 1,
    pending: {
      id: session.id, seed, E, isGate, startedAt: t,
      opponentId: target.kind === 'card' ? target.id : null,
      token: session.token
    }
  })
  return session
}

/**
 * Apply a finished battle locally (leagueMath.applyBattle). A session that is
 * no longer the pending one (already settled as an abandon, or a replay) is a
 * no-op with `stale: true`. `durationMs` is advisory offline; the server
 * enforces MIN_BATTLE_MS on online builds.
 */
const applyLocalResult = (session: LeagueSession, result: BattleResult, durationMs: number): LeagueResultOutcome => {
  void durationMs
  const s = refresh()
  const lpBefore = s.lp
  if (!s.pending || s.pending.id !== session.id) {
    return {
      result, lpBefore, lpAfter: lpBefore, delta: 0, isGate: session.isGate, promotedTo: null,
      firstReach: null, shielded: false, capped: false, coins: 0, stale: true
    }
  }
  const { pending: _p, ...rest } = s
  void _p
  const out = applyBattle(toMath(rest), { result, E: session.E }, now())
  let next = fromMath(rest, out.state)
  const rewardWin = campaign.currentStage.value.rewardWin
  let coins = rewardCoins(result === 'win' ? 'win' : 'loss', rewardWin)
  if (out.firstReach) {
    const bit = 1 << tierIdx(out.firstReach)
    if (!(next.firstReachMask & bit)) {
      coins += rewardCoins('firstReach', rewardWin)
      next = { ...next, firstReachMask: next.firstReachMask | bit }
    }
  }
  persist(next)
  return {
    result, lpBefore, lpAfter: next.lp, delta: out.delta, isGate: out.isGate, promotedTo: out.promotedTo,
    firstReach: out.firstReach, shielded: out.shielded, capped: out.capped, coins, stale: false
  }
}

/** Take the server's word (LG3 /league/me). The server wins every ranked
 *  field; device-only fields (unlock, popup seen, claimed season, first-reach
 *  mask) stay local. A server without a pending token clears ours. */
const reconcileServer = (me: LeagueServerMe): void => {
  serverStatus.value = 'ok'
  const s = refresh()
  const lp = sanitizeLp(me.lp)
  const peakLp = Math.max(lp, sanitizeLp(me.peakLp))
  let next: LeagueStateV1 = {
    ...s,
    season: whole(me.season),
    lp,
    peakLp,
    bestTierEver: maxTier(s.bestTierEver, tierOf(peakLp).tier),
    streak: whole(me.streak),
    shields: whole(me.shields, PROMOTION_SHIELDS),
    floor: seasonFloorLp(peakLp),
    day: whole(me.day),
    gained: whole(me.dayGain),
    battles: whole(me.battles),
    fights: whole(me.fights),
    adBonusUsed: me.adBonusUsed === undefined ? (whole(me.day) === s.day ? s.adBonusUsed : 0) : whole(me.adBonusUsed, AD_MAX)
  }
  if (me.pending === false && next.pending) {
    const { pending: _p, ...rest } = next
    void _p
    next = rest
  }
  if (me.ended && isTier(me.ended.peakTier) && me.ended.season > next.claimedSeason) {
    next = { ...next, unclaimed: { season: whole(me.ended.season), peakTier: me.ended.peakTier } }
  }
  persist(next)
}

/** LG3: the server could not be reached (O3) / came back. */
const setServerReachable = (ok: boolean): void => {
  serverStatus.value = ok ? 'ok' : 'unreachable'
}

/** LG3: remember a result the server has not acknowledged (replaces any older one). */
const queueUnsentResult = (u: LeagueUnsentResult): void => {
  const clean = parseUnsent(u)
  if (!clean) return
  refresh()
  persist({ ...state.value, unsent: clean })
}

/** LG3: the server answered for `token` (or it can never be posted) — forget it. */
const clearUnsentResult = (token: string): void => {
  const s = state.value
  if (!s.unsent || s.unsent.token !== token) return
  const { unsent: _u, ...rest } = s
  void _u
  persist(rest)
}

/**
 * Claim the finished season's reward — once per season. Returns the reward
 * (coins as a multiple of the current stage's rewardWin, diamonds, the
 * Champion frame) for the CALLER to credit, or null when nothing is due.
 */
const claimSeasonReward = (): (SeasonReward & { season: number; peakTier: LeagueTier }) | null => {
  refresh()
  const u = unclaimedSeason.value
  if (!u) return null
  const reward = seasonReward(u.peakTier, campaign.currentStage.value.rewardWin)
  persist({
    ...state.value,
    claimedSeason: u.season,
    unclaimed: null,
    ...(reward.championFrame ? { championFrame: true as const } : {})
  })
  return { ...reward, season: u.season, peakTier: u.peakTier }
}

/** The unlock popup was shown (LG6). */
const markUnlockSeen = (): void => {
  refresh()
  if (state.value.unlockSeen) return
  persist({ ...state.value, unlockSeen: true })
}

/** Milliseconds until the daily fights reset (00:00 UTC). */
const msUntilDailyReset = (): number => msUntilNextUtcMidnight(now())

// ─── Public API ─────────────────────────────────────────────────────────────

const api = {
  state: computed(() => state.value),
  standing,
  fightsLeft,
  fightsLimit,
  canFight,
  canAdTopUp,
  serverStatus: computed(() => serverStatus.value),
  offlineBlocked,
  unclaimedSeason,
  championFrame,
  refresh,
  grantAdFights,
  beginLocalBattle,
  applyLocalResult,
  reconcileServer,
  setServerReachable,
  queueUnsentResult,
  clearUnsentResult,
  claimSeasonReward,
  markUnlockSeen,
  msUntilDailyReset
}

export type LeagueApi = typeof api

const useLeague = (): LeagueApi => api

export default useLeague
