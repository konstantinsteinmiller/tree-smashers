// ─── PvP bot fill (random search) ───────────────────────────────────────────
//
// When a random PvP search ("Find opponent") finds no human within a random
// 15–25 s, the player gets a match against a BOT that presents like a normal
// opponent: a plausible generated handle, a level and bracket badge next to
// their own, a team of roster smashers at the player's own power, and the
// campaign NPC AI driven with human-like timing (a reaction delay per turn,
// looser aim, the occasional bad shot).
//
// Pure: no Vue, no DOM, no storage, no timers of its own except through the
// injected `setTimeout` of `createBotFillTimer`. Every random draw goes
// through an injected `rand` so tests can pin it.
//
// ── Rules (owner request 2026-10-21) ──
//   • WAIT   uniform 15 000–25 000 ms per search (`rollBotWaitMs`). A human
//            whose handshake is in flight when the timer fires gets one grace
//            (`BOT_HUMAN_GRACE_MS`) — the human is always preferred.
//   • NAME   curated, family-friendly, multi-language word pool (no first
//            names, no real people, no brands), optional number suffix, the
//            CrazyGames username shape (6–20 of [A-Za-z0-9._]), never one of
//            the last BOT_RECENT_NAMES names again, every combination checked
//            against the shared denylist in tests.
//   • TEAM   distinct roster smashers, the player's own team size, summed
//            levels within ±1 of the player's PvP team.
//   • AI     the engine's NPC AI with `npcPlay` (InitGameOptions): reaction
//            1.2–3.4 s (sometimes longer), aim spread and whiff chance from a
//            skill value that a staircase moves toward a 50 % win rate for
//            THIS player (`nextBotSkill`).
//   • RATING a bot match is a casual, LOCAL PvP result: it counts toward the
//            PvP wins / losses, honour and the 20-coin PvP reward exactly like
//            a human match (honour from the same power formula, so a
//            power-matched bot pays the fair-game 100). Nothing from a bot
//            match ever leaves the device: PvP has no server-side rating, the
//            global leaderboard scores campaign stages only, league LP comes
//            only from league fights, and `CG_LEADERBOARD_SUBMIT_ENABLED` is
//            off. Bot results are ALSO tallied separately (`botWins` /
//            `botLosses` in usePvpStats) so a future server-side PvP rating can
//            exclude them without a migration.
//   • DEBUG  `revealBots` (debug builds only) tags bots in the lobby.

import { createRng } from '@/use/useDeterministicRng'
import { isDenylistedName } from '@/utils/nameDenylist'
import { RELEASED_SMASHER_IDS, SMASHER_LEVEL_SANITY_MAX, isReleasedSmasher, isSmasherId, smasherConfig, type SmasherId } from '@/data/smasherCatalog'
import { LEAGUE_TIERS, type LeagueTier } from '@/use/leagueTiers'
import type { SpinnerConfig } from '@/types/spinner'

// ─── Wait window ─────────────────────────────────────────────────────────────

export const BOT_WAIT_MIN_MS = 15_000
export const BOT_WAIT_MAX_MS = 25_000
/** One extra wait when a human's handshake is in flight at the deadline. */
export const BOT_HUMAN_GRACE_MS = 4_000
/** How long the "opponent found" card stays before a bot match starts. */
export const BOT_FOUND_CARD_MS = 1_800

/** Uniform in [BOT_WAIT_MIN_MS, BOT_WAIT_MAX_MS], fresh per search. */
export const rollBotWaitMs = (rand: () => number): number => {
  const r = Math.min(1, Math.max(0, rand()))
  return Math.round(BOT_WAIT_MIN_MS + r * (BOT_WAIT_MAX_MS - BOT_WAIT_MIN_MS))
}

export interface BotFillTimerOptions {
  waitMs: number
  /** A human match is being negotiated right now (prefer it). */
  isHumanPending: () => boolean
  /** No human arrived: start the bot match. */
  onFire: () => void
  graceMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
}

export interface BotFillTimer {
  /** Stop for good (a human matched, the player cancelled). */
  cancel: () => void
  /** Whether the timer has already fired or been cancelled. */
  readonly done: boolean
}

/**
 * Fire `onFire` after `waitMs` — unless cancelled first. A human handshake in
 * flight at the deadline buys ONE grace period; a second deadline fires
 * regardless (a handshake that hangs must not strand the player).
 */
export const createBotFillTimer = (o: BotFillTimerOptions): BotFillTimer => {
  const set = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clear = o.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>))
  let done = false
  let graced = false
  let id: unknown = null
  const tick = () => {
    if (done) return
    if (!graced && o.isHumanPending()) {
      graced = true
      id = set(tick, o.graceMs ?? BOT_HUMAN_GRACE_MS)
      return
    }
    done = true
    o.onFire()
  }
  id = set(tick, Math.max(0, o.waitMs))
  return {
    cancel: () => {
      if (done) return
      done = true
      if (id !== null) clear(id)
    },
    get done () {
      return done
    }
  }
}

// ─── Names ───────────────────────────────────────────────────────────────────
//
// Word handles, not people: animals, weather, food, space and speed words
// from a dozen languages (written in ASCII so the CrazyGames username shape
// holds). No given names, no celebrities, no brands or franchise characters,
// no taunts. tests/pvpBots.test.ts runs every combination through the shared
// denylist and the username shape.

export const BOT_NAME_FIRST: readonly string[] = Object.freeze([
  // English
  'Turbo', 'Swift', 'Lucky', 'Brave', 'Mighty', 'Sunny', 'Cosmic', 'Pixel',
  'Rapid', 'Silver', 'Golden', 'Fuzzy', 'Jolly', 'Clever', 'Speedy', 'Stormy',
  'Frosty', 'Mossy', 'Tiny', 'Zippy',
  // Spanish / Portuguese
  'Valiente', 'Feliz', 'Veloz', 'Dorado', 'Ligeiro', 'Esperto',
  // French
  'Rapide', 'Petit', 'Brillant',
  // German / Dutch / Swedish
  'Blitz', 'Flink', 'Mutig', 'Snel', 'Vrolijk', 'Snabb', 'Modig',
  // Italian
  'Veloce', 'Allegro', 'Furbo', 'Forte',
  // Japanese
  'Yuki', 'Sora', 'Kumo', 'Kaze',
  // Turkish / Polish / Indonesian / Finnish
  'Hizli', 'Cesur', 'Szybki', 'Cepat', 'Berani', 'Nopea'
])

export const BOT_NAME_SECOND: readonly string[] = Object.freeze([
  // English
  'Fox', 'Panda', 'Otter', 'Falcon', 'Comet', 'Rocket', 'Acorn', 'Badger',
  'Beetle', 'Koala', 'Lynx', 'Maple', 'Pebble', 'Waffle', 'Noodle', 'Muffin',
  'Tiger', 'Wolf', 'Spinner', 'Smasher', 'Storm', 'Thunder', 'Hedgehog', 'Pine',
  // Spanish / Portuguese
  'Tigre', 'Lobo', 'Gato', 'Oso', 'Rayo', 'Cometa', 'Raposa', 'Coruja',
  // French
  'Renard', 'Loup', 'Hibou', 'Ecureuil',
  // German / Dutch / Swedish
  'Fuchs', 'Igel', 'Dachs', 'Adler', 'Wolke', 'Vos', 'Uil', 'Ekorre',
  // Italian
  'Lupo', 'Gufo', 'Riccio', 'Fulmine',
  // Japanese / Korean
  'Kitsune', 'Tanuki', 'Neko', 'Tora', 'Horangi',
  // Turkish / Finnish / Polish / Hindi / Swahili
  'Kaplan', 'Tilki', 'Kettu', 'Karhu', 'Wilk', 'Sher', 'Tembo'
])

/** The CrazyGames username shape (docs: 6–20 letters, digits, `.` and `_`). */
export const BOT_NAME_RE = /^[A-Za-z0-9._]{6,20}$/
/** Never show one of the last N bot names again. */
export const BOT_RECENT_NAMES = 12

const pickFrom = <T>(list: readonly T[], r: number): T =>
  list[Math.min(list.length - 1, Math.floor(Math.max(0, r) * list.length))] as T

/**
 * One handle: two words in one of four looks people really type
 * (`TurboOtter`, `turbo_otter`, `turbootter`, `Turbo.Otter`), then a number
 * suffix on a bit over half of them. Padded with digits to the 6-char minimum.
 */
export const composeBotName = (rand: () => number): string => {
  const a = pickFrom(BOT_NAME_FIRST, rand())
  const b = pickFrom(BOT_NAME_SECOND, rand())
  const style = rand()
  let name: string
  if (style < 0.45) name = `${a}${b}`
  else if (style < 0.7) name = `${a.toLowerCase()}_${b.toLowerCase()}`
  else if (style < 0.9) name = `${a}${b}`.toLowerCase()
  else name = `${a}.${b}`
  const suffix = rand()
  if (suffix >= 0.45) {
    const n = suffix < 0.8 ? 1 + Math.floor(rand() * 99) : 100 + Math.floor(rand() * 900)
    name += String(n)
  }
  while (name.length < 6) name += String(Math.floor(rand() * 10))
  return name.slice(0, 20)
}

/**
 * A fresh, clean handle that is not among `recent` (the last names shown,
 * newest last). Falls back to a numbered variant after a few collisions, so it
 * always terminates.
 */
export const makeBotName = (rand: () => number, recent: readonly string[] = []): string => {
  const seen = new Set(recent.slice(-BOT_RECENT_NAMES).map((n) => n.toLowerCase()))
  for (let i = 0; i < 24; i++) {
    const name = composeBotName(rand)
    if (!seen.has(name.toLowerCase()) && !isDenylistedName(name) && BOT_NAME_RE.test(name)) return name
  }
  const base = `${pickFrom(BOT_NAME_FIRST, rand())}${pickFrom(BOT_NAME_SECOND, rand())}`.slice(0, 16)
  for (let n = 100; ; n++) {
    const name = `${base}${n}`
    if (!seen.has(name.toLowerCase())) return name
  }
}

/** Remember a shown name (newest last, capped). */
export const rememberBotName = (recent: readonly string[], name: string): string[] =>
  [...recent, name].slice(-BOT_RECENT_NAMES)

// ─── Bracket: level + badge ─────────────────────────────────────────────────

/** Summed smasher levels of a PvP team (the honour formula's own measure). */
export const teamLevelSum = (team: readonly SpinnerConfig[]): number =>
  team.reduce((s, c) => s + Math.max(1, Math.round(c.level ?? (c.topLevel ?? 0) + 1)), 0)

/** The level shown next to a player in the lobby: the team's average. */
export const teamDisplayLevel = (team: readonly SpinnerConfig[]): number =>
  team.length === 0 ? 1 : Math.max(1, Math.round(teamLevelSum(team) / team.length))

/** Average-level ceilings of the PvP brackets (wood … diamond). Champion is
 *  a league position, never a PvP bracket. */
export const BRACKET_LEVEL_CEILINGS: readonly number[] = Object.freeze([3, 7, 11, 16, 22])

/** The bracket badge for a display level — the same mapping for the local
 *  player, a human opponent (from their hello) and a bot. */
export const bracketTier = (displayLevel: number): LeagueTier => {
  const lv = Math.max(1, Math.round(displayLevel))
  const idx = BRACKET_LEVEL_CEILINGS.findIndex((ceil) => lv <= ceil)
  return LEAGUE_TIERS[idx === -1 ? BRACKET_LEVEL_CEILINGS.length : idx] as LeagueTier
}

// ─── Team at matching power ─────────────────────────────────────────────────

export interface BotTeamInput {
  rand: () => number
  /** The player's PvP team (its size and levels set the target). */
  playerTeam: readonly SpinnerConfig[]
  /** Smashers a bot may field (e.g. those recruited near the player's stage).
   *  Fewer than the team size → padded from the whole roster. */
  pool?: readonly SmasherId[]
  /** "All smashers level 1" lobbies. */
  levelOne?: boolean
}

/**
 * Distinct roster smashers, the player's team size, summed levels within ±1
 * of the player's team (exactly equal on a "level 1" lobby and while the
 * player's smashers average below level 4).
 */
export const buildBotTeam = (i: BotTeamInput): SpinnerConfig[] => {
  const size = Math.max(1, Math.min(3, i.playerTeam.length || 1))
  const pool = [...new Set((i.pool ?? []).filter(isSmasherId).filter(isReleasedSmasher))]
  const ids: SmasherId[] = []
  const draw = (from: SmasherId[]) => {
    const left = from.filter((id) => !ids.includes(id))
    while (ids.length < size && left.length > 0) {
      const k = Math.min(left.length - 1, Math.floor(i.rand() * left.length))
      ids.push(left.splice(k, 1)[0] as SmasherId)
    }
  }
  draw(pool)
  draw([...RELEASED_SMASHER_IDS])

  const playerLevels = i.playerTeam.slice(0, size).map((c) => (i.levelOne ? 1 : Math.max(1, Math.round(c.level ?? (c.topLevel ?? 0) + 1))))
  while (playerLevels.length < size) playerLevels.push(playerLevels[0] ?? 1)
  // Shuffle the player's level spread onto the bot's smashers, then nudge one
  // by −1 / 0 / 0 / +1 so the totals are close, not identical.
  const levels = [...playerLevels]
  for (let k = levels.length - 1; k > 0; k--) {
    const j = Math.min(k, Math.floor(i.rand() * (k + 1)))
    ;[levels[k], levels[j]] = [levels[j] as number, levels[k] as number]
  }
  // Low levels: one level is a big share of the team's power, so the bot
  // matches exactly until the player's smashers average level 4.
  const nudge = !i.levelOne && playerLevels.reduce((a, b) => a + b, 0) >= 4 * size
  if (nudge) {
    const r = i.rand()
    const delta = r < 0.25 ? -1 : r < 0.75 ? 0 : 1
    const k = Math.min(size - 1, Math.floor(i.rand() * size))
    levels[k] = Math.min(SMASHER_LEVEL_SANITY_MAX, Math.max(1, (levels[k] as number) + delta))
  }
  return ids.map((id, k) => smasherConfig(id, levels[k] ?? 1))
}

// ─── Skill: human-like play tuned toward 50 % ───────────────────────────────

/** Bot skill in [BOT_SKILL_MIN, BOT_SKILL_MAX]; new players start at the default. */
export const BOT_SKILL_DEFAULT = 0.45
export const BOT_SKILL_MIN = 0.1
export const BOT_SKILL_MAX = 0.95
/** Staircase step: a won bot match makes the next bot sharper, a lost one
 *  looser — the up-down rule settles where the player wins half the time. */
export const BOT_SKILL_STEP = 0.07

export const clampBotSkill = (s: unknown): number => {
  const n = Number(s)
  return Number.isFinite(n) ? Math.min(BOT_SKILL_MAX, Math.max(BOT_SKILL_MIN, n)) : BOT_SKILL_DEFAULT
}

/** The next bot's skill after the player won / lost against a bot. */
export const nextBotSkill = (skill: number, playerResult: 'win' | 'lose'): number =>
  clampBotSkill(clampBotSkill(skill) + (playerResult === 'win' ? BOT_SKILL_STEP : -BOT_SKILL_STEP))

/**
 * How the engine's NPC AI plays one bot match (`InitGameOptions.npcPlay`).
 * `rand` is the bot's own stream — the engine's gameplay stream draws exactly
 * what it draws for any other NPC, so seeded replays elsewhere are untouched.
 */
export interface NpcPlayStyle {
  /** Milliseconds of "thinking" before this turn's launch. */
  thinkMs: () => number
  /** Full width (radians) of the aim spread around the chosen line. */
  aimSpread: number
  /** Chance of a clearly bad shot, and how far off (radians) it goes. */
  whiffChance: number
  whiffRad: number
  /** Launch force as a share of max. */
  forceMin: number
  forceMax: number
  /** Turn banners say "Opponent's turn", as in a human match. */
  opponentLabel: boolean
  rand: () => number
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Reaction time: 1.2–3.4 s, one turn in eight a longer think (+0.8–2 s). */
export const botThinkMs = (rand: () => number): number => {
  const base = 1200 + rand() * 2200
  return Math.round(rand() < 0.125 ? base + 800 + rand() * 1200 : base)
}

export const botPlayStyle = (skill: number, seed: number): NpcPlayStyle => {
  const s = (clampBotSkill(skill) - BOT_SKILL_MIN) / (BOT_SKILL_MAX - BOT_SKILL_MIN)
  const rand = createRng(((seed >>> 0) ^ 0x5b07a11) >>> 0)
  return {
    thinkMs: () => botThinkMs(rand),
    aimSpread: lerp(1.25, 0.3, s),
    whiffChance: lerp(0.26, 0.04, s),
    whiffRad: lerp(0.75, 0.4, s),
    forceMin: lerp(0.5, 0.72, s),
    forceMax: 1,
    opponentLabel: true,
    rand
  }
}

// ─── The whole opponent ──────────────────────────────────────────────────────

/** What the lobby shows for any opponent — human (from its hello) or bot. */
export interface OpponentProfile {
  name: string
  level: number
  tier: LeagueTier
  /** Only ever true for a bot; shown only where `revealBots` allows. */
  bot?: boolean
}

export interface BotOpponent {
  profile: OpponentProfile
  team: SpinnerConfig[]
  /** Battle seed (arena layout, gameplay streams, the bot's own rand). */
  seed: number
  firstTurn: 'player' | 'opponent'
  skill: number
}

export interface CreateBotInput extends Omit<BotTeamInput, 'rand'> {
  /** One seed drives the whole bot: name, team, first turn, play stream. */
  seed: number
  skill: number
  recentNames?: readonly string[]
}

export const createBotOpponent = (i: CreateBotInput): BotOpponent => {
  const rand = createRng(((i.seed >>> 0) ^ 0x0b07f111) >>> 0)
  const name = makeBotName(rand, i.recentNames ?? [])
  const team = buildBotTeam({ rand, playerTeam: i.playerTeam, pool: i.pool, levelOne: i.levelOne })
  const level = teamDisplayLevel(team)
  return {
    profile: { name, level, tier: bracketTier(level), bot: true },
    team,
    seed: i.seed >>> 0,
    // A coin flip, as in a human match (no loss-streak bias).
    firstTurn: rand() < 0.5 ? 'player' : 'opponent',
    skill: clampBotSkill(i.skill)
  }
}
