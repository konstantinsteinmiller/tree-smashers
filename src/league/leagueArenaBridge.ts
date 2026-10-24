// ─── League arena bridge (LG6) ──────────────────────────────────────────────
//
// SpinnerArena's league glue. The arena reaches it ONLY through
// `loadLeagueBridge()` (src/league/leagueGate.ts) and calls every member in
// BRACKET form (`bridge?.['createLeagueBattle'](…)`), each name reserved in
// the obfuscator options (vite.config.ts) — so on a league-off build the
// loader resolves null, the calls fold away with `LEAGUE_BUILD`, and not even
// the member names survive in the shipped bytes (league flag boundary, rule 5).
//
// What lives here, so the arena stays a thin consumer:
//
//   loadLeagueDeck(input)      the hub's `loadDeck`: /league/me first on an
//                              online build (reconcile + own pool id), then
//                              LG1's ladder with the skills-gate sanitiser
//   fetchLeagueTop()           the hub's `fetchTop` (LG3; null offline)
//   createLeagueBattle(input)  start a ranked fight (LG3 /league/start on an
//                              online build, useLeague.beginLocalBattle
//                              offline) → everything `initGame` needs
//   finishLeagueBattle(result) apply the result (local first, then the post)
//                              → what the arena credits and shows
//   previewSeasonReward()      the season modal's reward view (claim: useLeague)
//   measureLeague(what, act)   Poki measure funnel (no-op off Poki)
//
// Server-authoritative opponent: on an online build the fight uses the build
// /league/start returns (re-sanitised), not the card's copy.
//
// O3: an ONLINE build never starts a ranked fight against a card the live
// pool did not answer for (`liveOk` false) or against a baked (`bake:`)
// opponent — the server could not rank it; the hub shows its quiet state.
//
// O10: a started battle that is never finished (page closed, tab killed) is
// a loss — settled by useLeague on the next start / TTL and by the Worker on
// token expiry. A surrender is finished here as a loss right away.

import useLeague, { type LeagueFightTarget, type LeagueResultOutcome, type LeagueSession } from '@/league/useLeague'
import { LEAGUE_KIDS, LEAGUE_ONLINE } from '@/league/leagueGate'
import {
  beginOnlineFight,
  fetchMe,
  fetchTop,
  finishOnlineFight,
  leagueApiEnabled,
  leaguePoolFetcher,
  type LeagueApiError
} from '@/league/leagueApi'
import { getOpponentDeck, sanitizeOpponentBuild, type OpponentCard, type OpponentDeck } from '@/league/leagueOpponents'
import { gatekeeperEnemyConfigs, gatekeeperNameKey, gatekeeperStageFor, isGateTier, type GateTier } from '@/league/leagueGatekeepers'
import { seasonReward, tierOf, type BattleResult } from '@/league/leagueMath'
import type { LeagueSeasonRewardView } from '@/league/ui/leagueUi'
import { generatedOpponentName } from '@/league/leagueNpc'
import { LEAGUE_TIERS, type LeagueTier } from '@/use/leagueTiers'
import { SKILLS_BUILD, loadSkillLoadoutSanitizer } from '@/skills/skillsGate'
import { buildPower, encodePlayerBuild } from '@/utils/playerBuild'
import { calcHonorPoints } from '@/use/usePvpStats'
import { skillLevelSum } from '@/use/loadoutSanitizer'
import { pokiMeasure } from '@/utils/pokiPlugin'
import useSpinnerCampaign, { type ArenaType } from '@/use/useSpinnerCampaign'
import type { SpinnerConfig } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'

// ─── Constants ──────────────────────────────────────────────────────────────

/** League wins pay half the honour a PvP win would (LD6). */
export const LEAGUE_HONOR_FACTOR = 0.5
/** Battle-pass XP of a league WIN (O4 — the leaderboard-win amount). */
export const LEAGUE_WIN_BP_XP = 25

// ─── Types ──────────────────────────────────────────────────────────────────

/** The player's side as the arena fights with it. */
export interface LeaguePlayerSide {
  /** `playerTeamWithUpgrades()` — levels and skins applied. */
  team: SpinnerConfig[]
  /** The loadout the arena passes to initGame for this battle ([] skills off). */
  skills: SkillLoadout
}

export interface LeagueBattleInput extends LeaguePlayerSide {
  target: LeagueFightTarget
  /** The card that was picked (null for the gatekeeper). */
  card: OpponentCard | null
}

/** Why a fight could not start. `LeagueApiError` from the server / LG3, plus
 *  the bridge's own refusals. */
export type LeagueBattleError = LeagueApiError | 'unrankable' | 'no_build'

export interface LeagueBattleInit {
  seed: number
  enemyTeam: SpinnerConfig[]
  enemySkillLoadout: SkillLoadout
  arenaType: ArenaType
  /** DT1 — overrides the engine's last-result first-turn bias. */
  firstTurn: 'player' | 'opponent'
}

export interface LeagueBattleVs {
  teams: { player: SpinnerConfig[]; opponent: SpinnerConfig[] }
  skills: { player: SkillLoadout; opponent: SkillLoadout }
  tiers: { player: LeagueTier; opponent: LeagueTier }
  /** Display name of a card opponent (kids builds: a generated one) — '' for the gatekeeper. */
  opponentName: string
  /** i18n key of the gatekeeper's name (`stages.…`), else null. */
  opponentNameKey: string | null
}

export type LeagueBattleStart =
  | {
    ok: true
    sessionId: string
    isGate: boolean
    /** The tier a gate fight leads into (null for a card fight). */
    gateTier: GateTier | null
    initOptions: LeagueBattleInit
    vs: LeagueBattleVs
  }
  | { ok: false; error: LeagueBattleError }

export interface LeagueBattleFinish {
  lpBefore: number
  lpAfter: number
  promoted: boolean
  demoted: boolean
  /** Coins the arena credits now (local result, even online — decision LG3). */
  coins: number
  /** Diamonds of this battle (0: only season rewards pay diamonds). */
  diamonds: number
  /** Honour the arena credits (LEAGUE_HONOR_FACTOR × PvP honour, wins only). */
  honor: number
  /** Battle-pass XP the arena credits (O4: wins only). */
  bpXp: number
  outcome: LeagueResultOutcome
}

// ─── State ──────────────────────────────────────────────────────────────────

interface ActiveBattle {
  session: LeagueSession
  myTeam: SpinnerConfig[]
  mySkills: SkillLoadout
  enemyTeam: SpinnerConfig[]
  enemySkills: SkillLoadout
}

/** The battle started last and not finished yet (one at a time). */
let active: ActiveBattle | null = null
/** The last deck the hub was shown (O3 check on the picked card). */
let lastDeck: OpponentDeck | null = null
/** This player's pool id from /league/me (never offered as an opponent). */
let ownPoolId: string | null = null

const league = () => useLeague()
const tierIdx = (t: LeagueTier): number => LEAGUE_TIERS.indexOf(t)
const nextTierOf = (t: LeagueTier): LeagueTier | null => LEAGUE_TIERS[tierIdx(t) + 1] ?? null

/** The build + power the server and the ladder see (skills stripped when off). */
const ownBuildOf = (side: LeaguePlayerSide) => {
  const skills = SKILLS_BUILD ? side.skills : []
  const build = encodePlayerBuild(side.team, skills)
  let parts = 0
  for (const c of side.team) parts += (c.topLevel ?? 0) + (c.bottomLevel ?? 0)
  return { build, skills, power: build ? buildPower(build) : parts }
}

const copyTeam = (team: readonly SpinnerConfig[]): SpinnerConfig[] => team.map(c => ({ ...c }))
const sumLevels = (team: readonly SpinnerConfig[]): number =>
  team.reduce((s, c) => s + (c.topLevel ?? 1) + (c.bottomLevel ?? 1), 0)

// ─── Hub data ───────────────────────────────────────────────────────────────

/**
 * Today's opponent deck for the hub. Online: /league/me first (it posts an
 * unsent result, reconciles the standing and names this player's own pool
 * row), then the live pool → cache → baked → generator ladder. Offline
 * builds (Poki, YouTube, kids) never call a server.
 */
export const loadLeagueDeck = async (side: LeaguePlayerSide): Promise<OpponentDeck | null> => {
  const L = league()
  if (leagueApiEnabled()) {
    const me = await fetchMe()
    if (me?.poolId) ownPoolId = me.poolId
  }
  L.refresh()
  const { build, power } = ownBuildOf(side)
  const sanitizeSkills = SKILLS_BUILD ? await loadSkillLoadoutSanitizer() : null
  const s = L.state.value
  const deck = await getOpponentDeck({
    ownBuild: build,
    ownPower: power,
    tier: L.standing.value.tier,
    day: s.day,
    fightIndex: s.fights,
    online: LEAGUE_ONLINE,
    kids: LEAGUE_KIDS,
    skillsOn: SKILLS_BUILD,
    ownId: ownPoolId,
    sanitizeSkills
  }, { fetcher: LEAGUE_ONLINE ? leaguePoolFetcher : null })
  lastDeck = deck
  return deck
}

/** The season top list (online, non-kids builds; null elsewhere / unreachable). */
export const fetchLeagueTop = (): Promise<unknown> =>
  (LEAGUE_ONLINE && !LEAGUE_KIDS ? fetchTop() : Promise.resolve(null))

// ─── Battles ────────────────────────────────────────────────────────────────

/** O3: may this card start a RANKED fight on this build? */
const rankable = (card: OpponentCard): boolean => {
  if (!LEAGUE_ONLINE) return true
  if (card.source === 'baked' || card.oppId.startsWith('bake:')) return false
  return lastDeck !== null && lastDeck.liveOk && lastDeck.cards.some(c => c.oppId === card.oppId)
}

/**
 * Start a ranked fight against a card or the gatekeeper. Online builds open a
 * server token first (LG3 `beginOnlineFight`: /league/start, then the local
 * session with the server's seed); offline builds start locally. Returns what
 * the arena needs to build the board, or a typed refusal for the hub.
 */
export const createLeagueBattle = async (input: LeagueBattleInput): Promise<LeagueBattleStart> => {
  const L = league()
  L.refresh()
  const standing = L.standing.value
  const { build, skills, power } = ownBuildOf(input)

  let enemyTeam: SpinnerConfig[]
  let enemySkills: SkillLoadout = []
  let arenaType: ArenaType = 'default'
  let gateTier: GateTier | null = null
  let opponentName = ''
  let opponentNameKey: string | null = null

  if (input.target.kind === 'gate') {
    const next = nextTierOf(standing.tier)
    if (!standing.atGate || !next || !isGateTier(next)) return { ok: false, error: 'not_at_gate' }
    gateTier = next
    const stage = gatekeeperStageFor(next)
    enemyTeam = gatekeeperEnemyConfigs(stage)
    arenaType = stage.arenaType ?? 'default'
    opponentNameKey = gatekeeperNameKey(next)
  } else {
    const card = input.card
    if (!card || card.oppId !== input.target.id) return { ok: false, error: 'bad_opponent' }
    if (!rankable(card)) return { ok: false, error: 'unrankable' }
    enemyTeam = copyTeam(card.team)
    enemySkills = SKILLS_BUILD ? card.skills.map(k => ({ ...k })) : []
    opponentName = LEAGUE_KIDS ? generatedOpponentName(card.oppId) : card.name
  }

  let session: LeagueSession | null
  if (LEAGUE_ONLINE) {
    if (!build) return { ok: false, error: 'no_build' }
    const out = await beginOnlineFight(input.target, power, input.target.kind === 'gate'
      ? { gateTier: gateTier ?? undefined, build, skills: SKILLS_BUILD }
      : { opp: input.target.id, build, skills: SKILLS_BUILD })
    if (!out) return { ok: false, error: 'offline' }
    if (!out.ok) {
      if (out.error === 'offline') L.setServerReachable(false)
      return { ok: false, error: out.error }
    }
    session = out.session
    // The server is authoritative for WHO is fought: its /league/start answer
    // carries the opponent build it ranks the battle against (the pool row
    // may have been refreshed since the hub drew the card). Re-sanitised for
    // this client like any pool entry; the card's team stays only as the
    // fallback when the answer has no usable build.
    const opp = input.target.kind === 'card' ? out.battle?.opp : null
    if (opp?.build) {
      const sanitizeSkills = SKILLS_BUILD ? await loadSkillLoadoutSanitizer() : null
      const s = sanitizeOpponentBuild(opp.build, SKILLS_BUILD, sanitizeSkills)
      if (s) {
        enemyTeam = s.team
        enemySkills = SKILLS_BUILD ? s.skills : []
      }
    }
  } else {
    session = L.beginLocalBattle(input.target, power)
    if (!session) return { ok: false, error: 'no_fights' }
  }

  active = { session, myTeam: copyTeam(input.team), mySkills: skills, enemyTeam, enemySkills }
  pokiMeasure('league', 'fight', gateTier ? 'gate' : 'start')
  return {
    ok: true,
    sessionId: session.id,
    isGate: gateTier !== null,
    gateTier,
    initOptions: {
      seed: session.seed,
      enemyTeam,
      enemySkillLoadout: enemySkills,
      arenaType,
      firstTurn: session.firstTurn
    },
    vs: {
      teams: { player: copyTeam(input.team), opponent: copyTeam(enemyTeam) },
      skills: { player: skills, opponent: enemySkills },
      tiers: { player: standing.tier, opponent: gateTier ?? standing.tier },
      opponentName,
      opponentNameKey
    }
  }
}

/**
 * Finish the running fight: applied locally at once (the LP delta and the
 * coins for the result panel), posted to the server afterwards on an online
 * build (it reconciles the standing when it answers). Null when no fight is
 * running (a replayed game-over, or a battle already finished).
 */
export const finishLeagueBattle = (result: 'win' | 'lose' | 'loss' | null): LeagueBattleFinish | null => {
  const battle = active
  if (!battle) return null
  active = null
  const r: BattleResult = result === 'win' ? 'win' : 'loss'
  const durationMs = Math.max(0, Date.now() - battle.session.startedAt)
  const { local, server } = finishOnlineFight(battle.session, r, durationMs)
  void server.catch(() => null)
  const counts = !local.stale
  const win = counts && r === 'win'
  const honor = win
    ? Math.round(LEAGUE_HONOR_FACTOR * calcHonorPoints(
      sumLevels(battle.myTeam),
      sumLevels(battle.enemyTeam),
      skillLevelSum(battle.mySkills),
      skillLevelSum(battle.enemySkills)
    ))
    : 0
  const before = tierOf(local.lpBefore).tier
  const after = tierOf(local.lpAfter).tier
  pokiMeasure('league', 'fight', r)
  if (local.promotedTo) pokiMeasure('league', 'promotion', local.promotedTo)
  return {
    lpBefore: local.lpBefore,
    lpAfter: local.lpAfter,
    promoted: counts && local.promotedTo !== null,
    demoted: counts && tierIdx(after) < tierIdx(before),
    coins: counts ? local.coins : 0,
    diamonds: 0,
    honor,
    bpXp: win ? LEAGUE_WIN_BP_XP : 0,
    outcome: local
  }
}

/** The finished season's reward as the arena's season modal shows it (the
 *  claim itself is `claimSeasonReward()`); null when nothing is waiting. */
export const previewSeasonReward = (): LeagueSeasonRewardView | null => {
  const u = league().unclaimedSeason.value
  if (!u) return null
  return {
    ...seasonReward(u.peakTier, useSpinnerCampaign().currentStage.value.rewardWin),
    season: u.season,
    peakTier: u.peakTier
  }
}

/** Poki measure funnel for the league surfaces (hub / unlock / season). */
export const measureLeague = (what: string, action: string): void => {
  pokiMeasure('league', what, action)
}

/** Tests only: forget the running battle and the caches. */
export const __resetLeagueBridgeForTests = (): void => {
  active = null
  lastDeck = null
  ownPoolId = null
}
