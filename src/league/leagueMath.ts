/**
 * ─── League math (LG0) ──────────────────────────────────────────────────────
 *
 * The rules of the simulated-PvP league as pure functions: tiers and divisions,
 * expected score, LP gain / loss, floors, promotion shields, the gatekeeper
 * gate, the daily LP cap, 28-day UTC seasons, the season reset, rewards and
 * opponent power targets.
 *
 * WORKER-SHARED (plan F5): the Cloudflare Worker (LG4) imports this file too.
 * So: relative imports only (no alias paths), no build-time env reads, no Vue, no DOM, no
 * Date.now() — every time-dependent function takes `nowMs`. Every function is
 * deterministic, never mutates its arguments and returns fresh objects.
 *
 * LP LAYOUT: divisions are 100 LP; tier t (0 = Wood … 5 = Diamond) covers
 * [300t, 300t + 299] as Div III [300t, +99], Div II [+100, +199], Div I
 * [+200, +299]. Champion is everything from 1800 up, without divisions.
 *
 * CALIBRATION (tools/skills-sim/league.mjs, 2026-09-30; README "League calibration"):
 *   expectedScore = 1 / (1 + ((opp + P0) / (own + P0))^K), K = 6.45, P0 = 62.
 *   Fitted by maximum likelihood on 161 280 simulated league battles
 *   (challenger policy vs ghost NPC AI, 4 × 4 team archetypes, own part levels
 *   4…48, power ratios 0.6…1.7). Brier 0.198 (coin flip 0.250); predicted vs
 *   real win rate within 3.3 pts in every power-ratio bin and 2.6 pts in every
 *   E decile (E slightly UNDER-predicts: the challenger wins 52 % at parity).
 *   Per-level K with the offset is flat (6.1…6.6); a plain ratio (P0 = 0)
 *   would need K from 1.3 (level 4) to 4.9 (level 48) — part upgrades add to
 *   base stats, so P0 stands for the base stats every team shares. What E
 *   cannot see is team composition: at equal power a tank team wins 83 %, a
 *   glass team 22 % — the Brier floor comes from that, not from K.
 *   TIER_FLOOR_POWER / GATEKEEPER_LEVEL — the DEFAULT team at a tier's floor
 *   power (power / 4 per part, remainder on the tops) wins 55–65 % of the
 *   promotion fight INTO the tier with every gatekeeper part at
 *   GATEKEEPER_LEVEL (1 000 battles per tier; numbers in the README).
 */
import { LEAGUE_TIERS, type LeagueDivision, type LeagueTier } from '../use/leagueTiers'

// ─── Constants ──────────────────────────────────────────────────────────────

export const LP_PER_DIVISION = 100
export const LP_PER_TIER = 300
/** First LP of Champion (tier index 6). */
export const CHAMPION_LP = 1800
/** Top LP of every division-tier's Div I (x99); fight #next is the gatekeeper. */
export const GATE_OFFSET = LP_PER_TIER - 1

/** Ranked fights per UTC day, rewarded-ad top-up size and how many per day. */
export const DAILY_FIGHTS = 10
export const AD_BONUS = 3
export const AD_MAX = 2
/** Server-side hard cap of /league/start per UTC day (10 + 2 × 3 = 16). */
export const SERVER_DAILY_CAP = 16
/** A result posted sooner than this after /league/start is rejected. */
export const MIN_BATTLE_MS = 12_000
/** A battle token lives this long; an expired pending token counts as a loss. */
export const TOKEN_TTL_MS = 900_000

/** Most LP a player can GAIN per UTC day (losses are not netted against it). */
export const DAILY_LP_CAP = 400
/** Battles after a tier promotion (gatekeeper win) that cannot lose LP. */
export const PROMOTION_SHIELDS = 3
/** LP lost on a gatekeeper loss (never below Div I's floor; 0 in Wood, LM3). */
export const GATE_LOSS_LP = 20

/** Season 0 starts Monday 2026-10-05 00:00 UTC; seasons are 28 UTC days. */
export const LEAGUE_EPOCH_MS = Date.UTC(2026, 9, 5)
export const DAY_MS = 86_400_000
export const SEASON_DAYS = 28
export const SEASON_MS = SEASON_DAYS * DAY_MS
/** A lazy rollover over many missed seasons applies at most this many resets
 *  (60 % per step floors any LP to 0 long before that). */
const MAX_RESET_STEPS = 16

/** expectedScore's logistic slope in the log power ratio — see the header. */
export const LEAGUE_K = 6.45
/** Power every team is credited on top of its own in expectedScore (base stats). */
export const LEAGUE_POWER_OFFSET = 62

/** Loss multiplier f per tier (Wood losses cost nothing). */
export const LOSS_FACTOR: Readonly<Record<LeagueTier, number>> = Object.freeze({
  wood: 0, bronze: 0.5, silver: 0.75, gold: 1, platinum: 1, diamond: 1, champion: 1
})

/** Win-streak bonus: +5 on the 3rd consecutive win, +10 on the 4th, +15 from the 5th. */
export const STREAK_START = 3
export const STREAK_STEP = 5
export const STREAK_MAX = 15

/**
 * Team power a tier's opponents are measured from (opponentTargets never goes
 * below it). Fitted with the gatekeeper at GATEKEEPER_LEVEL so the DEFAULT
 * team at this power wins 55–65 % of its promotion fight INTO the tier.
 * Anchored on the income model's part level (econ.mjs, default profile) at
 * stages 20 / 35 / 55 / 80 / 120 / 200 (power 32 / 52 / 76 / 100 / 124 / 160),
 * then moved to the nearest power whose gate fight lands in the band (Bronze
 * 32 → 26: at gatekeeper level 3 power 32 won only 55.6 %, at level 2 it won
 * 88 %). Power = playerBuild.buildPower (sum of the 4 part levels + the
 * LG-PWR skill power; the floor fits used skill-less teams).
 * Wood has no gate: 0 = "the challenger's own power".
 */
export const TIER_FLOOR_POWER: Readonly<Record<LeagueTier, number>> = /* sim-fit */ Object.freeze({ wood: 0, bronze: 26, silver: 52, gold: 76, platinum: 101, diamond: 124, champion: 160 })

/**
 * Part level (top and bottom, every blade) of the gatekeeper guarding the
 * promotion INTO the tier — LG7 builds the gate stage at this level.
 * Bronze split / Silver healers / Gold thunder use buildCheatBossStage's
 * rosters; Platinum cinder_tyrant, Diamond glacier_warden, Champion
 * elemental_court use their encounter rosters. Wood has no gate (0).
 */
export const GATEKEEPER_LEVEL: Readonly<Record<LeagueTier, number>> = /* sim-fit */ Object.freeze({ wood: 0, bronze: 3, silver: 6, gold: 11, platinum: 17, diamond: 35, champion: 20 })

/** Opponent cards aim at these expected scores (easier / even / harder). */
export const OPPONENT_TARGET_E: readonly [number, number, number] = Object.freeze([0.65, 0.5, 0.35]) as readonly [number, number, number]

// ─── Tiers and divisions ────────────────────────────────────────────────────

export interface TierPosition {
  tier: LeagueTier
  /** 3 (entry) … 1 (top); null for Champion. */
  division: LeagueDivision | null
  /** LP above the division's floor (0…99); for Champion, LP above 1800. */
  lpInDivision: number
}

/** A non-finite / negative / fractional LP becomes a whole LP ≥ 0. */
export const sanitizeLp = (lp: number): number => (Number.isFinite(lp) && lp > 0 ? Math.floor(lp) : 0)

const tierIndex = (lp: number): number => Math.min(6, Math.floor(lp / LP_PER_TIER))
const tierAt = (i: number): LeagueTier => LEAGUE_TIERS[Math.max(0, Math.min(6, i))] as LeagueTier
const rankOf = (tier: LeagueTier): number => LEAGUE_TIERS.indexOf(tier)

export const tierOf = (lpIn: number): TierPosition => {
  const lp = sanitizeLp(lpIn)
  if (lp >= CHAMPION_LP) return { tier: 'champion', division: null, lpInDivision: lp - CHAMPION_LP }
  const t = tierIndex(lp)
  const inTier = lp - t * LP_PER_TIER
  return {
    tier: tierAt(t),
    division: (3 - Math.floor(inTier / LP_PER_DIVISION)) as LeagueDivision,
    lpInDivision: inTier % LP_PER_DIVISION
  }
}

/** First LP of a tier (Wood 0 … Champion 1800). */
export const tierFloorLp = (tier: LeagueTier): number => rankOf(tier) * LP_PER_TIER

/** First LP of the division `lp` sits in (Champion: 1800). */
export const divisionFloorLp = (lpIn: number): number => {
  const lp = sanitizeLp(lpIn)
  return lp >= CHAMPION_LP ? CHAMPION_LP : lp - (lp % LP_PER_DIVISION)
}

/** True at x99 of a Div I below Champion — the next fight is the gatekeeper. */
export const atPromotionGate = (lpIn: number): boolean => {
  const lp = sanitizeLp(lpIn)
  return lp < CHAMPION_LP && lp % LP_PER_TIER === GATE_OFFSET
}

/**
 * The LP a player can no longer drop below this season, from the season's
 * peak LP: Bronze / Silver / Gold reached are safe; from Platinum up the
 * floor is one tier below the peak (so Platinum's is Gold's, the same thing).
 */
export const seasonFloorLp = (peakLp: number): number => {
  const r = tierIndex(sanitizeLp(peakLp))
  return (r <= 3 ? r : r - 1) * LP_PER_TIER
}

// ─── Expected score and LP deltas ───────────────────────────────────────────

const POWER_MIN = 1
const powerOf = (p: number): number => (Number.isFinite(p) && p > POWER_MIN ? p : POWER_MIN)

/**
 * The challenger's expected score E ∈ (0, 1) against an opponent, from team
 * powers: 1 / (1 + ((opp + P0) / (own + P0))^K). A power below 1 (a fresh
 * level-0 team, a bad value) counts as 1, so the result is always finite.
 */
export const expectedScore = (ownPower: number, oppPower: number): number =>
  1 / (1 + Math.pow((powerOf(oppPower) + LEAGUE_POWER_OFFSET) / (powerOf(ownPower) + LEAGUE_POWER_OFFSET), LEAGUE_K))

const clamp01 = (e: number): number => (Number.isFinite(e) ? Math.min(1, Math.max(0, e)) : 0.5)

export type BattleResult = 'win' | 'loss'

export interface LpDeltaInput {
  result: BattleResult
  /** Expected score of the challenger (expectedScore). Ignored for a gate fight. */
  E: number
  /** The challenger's tier before the fight. */
  tier: LeagueTier
  /** Consecutive wins BEFORE this fight. */
  streak: number
  /** Whether this is the gatekeeper fight at x99. */
  isGate: boolean
}

/** +5 per win from the 3rd consecutive (this one included), max +15, below Diamond. */
export const streakBonus = (tier: LeagueTier, streakBefore: number): number => {
  if (rankOf(tier) >= rankOf('diamond')) return 0
  const nth = (Number.isFinite(streakBefore) && streakBefore > 0 ? Math.floor(streakBefore) : 0) + 1
  return nth < STREAK_START ? 0 : Math.min(STREAK_MAX, (nth - STREAK_START + 1) * STREAK_STEP)
}

/**
 * The RAW LP change of one fight, before floors, shields, the gate clamp and
 * the daily cap (applyBattle applies those). A gate win is +1 (x99 → the next
 * tier's Div III at 0 LP); a gate loss is −20 (0 in Wood — LM3).
 */
export const lpDelta = (input: LpDeltaInput): number => {
  // A gate loss costs GATE_LOSS_LP — except in Wood, whose no-loss rule wins
  // (user decision LM3: a lost Wood → Bronze gatekeeper fight costs 0 LP).
  if (input.isGate) return input.result === 'win' ? 1 : LOSS_FACTOR[input.tier] === 0 ? 0 : -GATE_LOSS_LP
  const E = clamp01(input.E)
  if (input.result === 'win') return Math.round(10 + 30 * (1 - E)) + streakBonus(input.tier, input.streak)
  const loss = Math.round((10 + 30 * E) * LOSS_FACTOR[input.tier])
  return loss === 0 ? 0 : -loss
}

// ─── Seasons and days (UTC only) ────────────────────────────────────────────

/** Days since 1970-01-01 UTC — the key of the daily LP cap and fight counts. */
export const utcDay = (nowMs: number): number => (Number.isFinite(nowMs) ? Math.floor(nowMs / DAY_MS) : 0)

/** Season number at `nowMs`; any time before the epoch (or a bad value) is season 0. */
export const seasonIndex = (nowMs: number): number =>
  Number.isFinite(nowMs) && nowMs > LEAGUE_EPOCH_MS ? Math.floor((nowMs - LEAGUE_EPOCH_MS) / SEASON_MS) : 0

export interface SeasonBounds {
  /** First ms of the season (inclusive). */
  startMs: number
  /** First ms of the next season (exclusive). */
  endMs: number
}

export const seasonBounds = (index: number): SeasonBounds => {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
  const startMs = LEAGUE_EPOCH_MS + i * SEASON_MS
  return { startMs, endMs: startMs + SEASON_MS }
}

// ─── State ──────────────────────────────────────────────────────────────────

export interface LeagueMathState {
  /** Season the fields below belong to. */
  season: number
  lp: number
  /** Highest LP this season (drives the floor, first-reach and the season reward). */
  peakLp: number
  /** Consecutive wins (0 after a loss). */
  streak: number
  /** Loss-proof fights left after a tier promotion. */
  shields: number
  /** utcDay of `dayGain`. */
  day: number
  /** LP gained on `day` (for DAILY_LP_CAP). */
  dayGain: number
  /** Ranked fights played this season. */
  battles: number
}

export const initialLeagueState = (nowMs: number): LeagueMathState => ({
  season: seasonIndex(nowMs), lp: 0, peakLp: 0, streak: 0, shields: 0, day: utcDay(nowMs), dayGain: 0, battles: 0
})

const cleanCount = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

/** A copy with every field whole and ≥ 0 and peakLp ≥ lp (for untrusted input). */
export const sanitizeState = (s: LeagueMathState): LeagueMathState => {
  const lp = sanitizeLp(s.lp)
  return {
    season: cleanCount(s.season),
    lp,
    peakLp: Math.max(lp, sanitizeLp(s.peakLp)),
    streak: cleanCount(s.streak),
    shields: Math.min(PROMOTION_SHIELDS, cleanCount(s.shields)),
    day: cleanCount(s.day),
    dayGain: Math.min(DAILY_LP_CAP, cleanCount(s.dayGain)),
    battles: cleanCount(s.battles)
  }
}

/**
 * Start of `newSeason`: 60 % of the final LP, floored to its division's
 * floor. The new season's peak is that LP (the start tier counts as reached,
 * so its floor holds and it pays no first-reach reward); streak, shields and
 * the battle count restart.
 */
export const seasonReset = (state: LeagueMathState, newSeason: number): LeagueMathState => {
  const s = sanitizeState(state)
  const lp = divisionFloorLp(Math.floor(s.lp * 0.6))
  return { ...s, season: cleanCount(newSeason), lp, peakLp: lp, streak: 0, shields: 0, battles: 0 }
}

export interface SeasonRollover {
  state: LeagueMathState
  /** The finished season to pay (if the player fought in it), else null. */
  ended: { season: number; peakTier: LeagueTier } | null
}

/**
 * Bring a state to `nowMs`: a season boundary applies seasonReset once per
 * season passed (a player away for two seasons is reset twice), a new UTC day
 * clears the daily gain. A state from the future (clock skew) is left alone.
 */
export const rollover = (state: LeagueMathState, nowMs: number): SeasonRollover => {
  let s = sanitizeState(state)
  const now = seasonIndex(nowMs)
  let ended: SeasonRollover['ended'] = null
  if (now > s.season) {
    if (s.battles > 0) ended = { season: s.season, peakTier: tierOf(s.peakLp).tier }
    const steps = Math.min(MAX_RESET_STEPS, now - s.season)
    for (let i = 1; i <= steps; i++) s = seasonReset(s, s.season + 1)
    s = { ...s, season: now }
  }
  const day = utcDay(nowMs)
  if (day !== s.day) s = { ...s, day, dayGain: 0 }
  return { state: s, ended }
}

// ─── One battle ─────────────────────────────────────────────────────────────

export interface BattleInput {
  result: BattleResult
  /** Expected score of the challenger against the opponent fought. */
  E: number
}

export interface BattleOutcome {
  state: LeagueMathState
  /** LP actually gained (+) or lost (−). */
  delta: number
  /** The fight was the gatekeeper fight (the state was at x99 of a Div I). */
  isGate: boolean
  /** The tier entered by a gatekeeper win, else null. */
  promotedTo: LeagueTier | null
  /** A tier reached for the first time this season (pays rewardCoins 'firstReach'). */
  firstReach: LeagueTier | null
  /** A shield absorbed a loss. */
  shielded: boolean
  /** The daily LP cap cut the gain. */
  capped: boolean
  /** A season ended before this fight (from rollover). */
  seasonEnded: SeasonRollover['ended']
}

/**
 * Apply one ranked fight at `nowMs`. The gate is derived from the state:
 * at x99 of a Div I this fight IS the gatekeeper fight — a win moves to the
 * next tier's Div III (0 LP) and arms PROMOTION_SHIELDS, a loss costs 20 LP
 * but never goes below Div I's floor. Any other win stops at x99 (a tier
 * boundary is only crossed by a gatekeeper win) and is limited by the daily
 * gain cap; any other loss is shield-able and never goes below the season
 * floor. A gate win is never blocked by the daily cap.
 */
export const applyBattle = (stateIn: LeagueMathState, input: BattleInput, nowMs: number): BattleOutcome => {
  const { state: s, ended } = rollover(stateIn, nowMs)
  const before = tierOf(s.lp)
  const isGate = atPromotionGate(s.lp)
  const win = input.result === 'win'
  const raw = lpDelta({ result: input.result, E: input.E, tier: before.tier, streak: s.streak, isGate })
  const floor = seasonFloorLp(s.peakLp)
  let lp = s.lp
  let shields = s.shields > 0 ? s.shields - 1 : 0
  let shielded = false
  let capped = false
  let promotedTo: LeagueTier | null = null
  if (win && isGate) {
    lp = s.lp + 1
    promotedTo = tierOf(lp).tier
    shields = PROMOTION_SHIELDS
  } else if (win) {
    const room = DAILY_LP_CAP - s.dayGain
    let gain = raw
    if (gain > room) {
      gain = Math.max(0, room)
      capped = true
    }
    // a win never crosses into the next tier; it stops at the gate (x99)
    lp = before.tier === 'champion' ? s.lp + gain : Math.min(s.lp + gain, s.lp - (s.lp % LP_PER_TIER) + GATE_OFFSET)
  } else if (s.shields > 0 && raw < 0) {
    shielded = true
  } else {
    // never below the season floor (or Div I's floor on a gate loss) — and a
    // loss never RAISES LP, even for a state that already sits under its floor
    lp = Math.max(s.lp + raw, Math.min(s.lp, isGate ? Math.max(floor, divisionFloorLp(s.lp)) : floor))
  }
  const delta = lp - s.lp
  const peakLp = Math.max(s.peakLp, lp)
  const firstReach = tierIndex(peakLp) > tierIndex(s.peakLp) ? tierOf(peakLp).tier : null
  return {
    state: {
      ...s,
      lp,
      peakLp,
      streak: win ? s.streak + 1 : 0,
      shields,
      dayGain: s.dayGain + Math.max(0, delta),
      battles: s.battles + 1
    },
    delta,
    isGate,
    promotedTo,
    firstReach,
    shielded,
    capped,
    seasonEnded: ended
  }
}

// ─── Daily fights ───────────────────────────────────────────────────────────

/** Ranked fights allowed today after `adsWatched` rewarded top-ups. */
export const dailyFightLimit = (adsWatched: number): number =>
  DAILY_FIGHTS + AD_BONUS * Math.min(AD_MAX, cleanCount(adsWatched))

// ─── Rewards ────────────────────────────────────────────────────────────────

export type LeagueCoinKind = 'win' | 'loss' | 'firstReach'

export const COIN_MULTIPLIER: Readonly<Record<LeagueCoinKind, number>> = Object.freeze({ win: 0.4, loss: 0.1, firstReach: 1 })

/** Coins for a league event, as a multiple of the current stage's rewardWin. */
export const rewardCoins = (kind: LeagueCoinKind, stageRewardWin: number): number =>
  Number.isFinite(stageRewardWin) && stageRewardWin > 0 ? Math.round(COIN_MULTIPLIER[kind] * stageRewardWin) : 0

export interface SeasonRewardSpec {
  /** Multiple of the current stage's rewardWin. */
  coinsMul: number
  diamonds: number
  championFrame: boolean
}

export const SEASON_REWARDS: Readonly<Record<LeagueTier, SeasonRewardSpec>> = Object.freeze({
  wood: Object.freeze({ coinsMul: 2, diamonds: 0, championFrame: false }),
  bronze: Object.freeze({ coinsMul: 3, diamonds: 0, championFrame: false }),
  silver: Object.freeze({ coinsMul: 4, diamonds: 0, championFrame: false }),
  gold: Object.freeze({ coinsMul: 6, diamonds: 1, championFrame: false }),
  platinum: Object.freeze({ coinsMul: 8, diamonds: 2, championFrame: false }),
  diamond: Object.freeze({ coinsMul: 10, diamonds: 3, championFrame: false }),
  champion: Object.freeze({ coinsMul: 12, diamonds: 5, championFrame: true })
})

export interface SeasonReward {
  coins: number
  diamonds: number
  championFrame: boolean
}

/** End-of-season reward for the season's peak tier. */
export const seasonReward = (peakTier: LeagueTier, stageRewardWin: number): SeasonReward => {
  const spec = SEASON_REWARDS[peakTier]
  const rw = Number.isFinite(stageRewardWin) && stageRewardWin > 0 ? stageRewardWin : 0
  return { coins: Math.round(spec.coinsMul * rw), diamonds: spec.diamonds, championFrame: spec.championFrame }
}

// ─── Opponents and Champion rank ────────────────────────────────────────────

/**
 * Three opponent team powers — easier / even / harder — around
 * max(ownPower, TIER_FLOOR_POWER[tier]), each the power at which the
 * challenger's expectedScore is OPPONENT_TARGET_E (0.65 / 0.5 / 0.35).
 * Whole numbers ≥ 1, strictly ascending.
 */
export const opponentTargets = (ownPower: number, tier: LeagueTier): [number, number, number] => {
  const base = Math.max(powerOf(ownPower), TIER_FLOOR_POWER[tier])
  // invert expectedScore: opp + P0 = (base + P0) × ((1 − E) / E)^(1/K)
  const at = (E: number): number =>
    Math.max(1, Math.round((base + LEAGUE_POWER_OFFSET) * Math.pow((1 - E) / E, 1 / LEAGUE_K) - LEAGUE_POWER_OFFSET))
  const easier = at(OPPONENT_TARGET_E[0])
  const even = Math.max(easier + 1, at(OPPONENT_TARGET_E[1]))
  const harder = Math.max(even + 1, at(OPPONENT_TARGET_E[2]))
  return [easier, even, harder]
}

/** Champion position: players with MORE LP than `lp`, plus one (ties share). */
export const championRank = (lpDist: readonly number[], lp: number): number => {
  let higher = 0
  for (let i = 0; i < lpDist.length; i++) if ((lpDist[i] as number) > lp) higher++
  return higher + 1
}
