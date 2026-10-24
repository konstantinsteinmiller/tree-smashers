/**
 * ─── League opponents (LG1) ─────────────────────────────────────────────────
 *
 * Three opponent cards per fight — easier / even / harder — drawn down a
 * ladder of sources, per card:
 *
 *   1. live pool     `LeaguePoolFetcher.fetchPool` (LG3's leagueApi; only when
 *                    `ctx.online` and a fetcher is injected). A non-empty
 *                    answer is also written to …
 *   2. device cache  `treesmashers_league_pool` — DEVICE-ONLY (not `smashers_`-
 *                    prefixed, so it never reaches a cloud payload).
 *   3. baked pool    `virtual:league-pool` (vite.config.ts; null on a build
 *                    that baked nothing, and on every league-off build).
 *   4. generator     `leagueNpc.generateNpcBuild` — always hits its target.
 *
 * Every opponent — whatever the source — is re-sanitised against THIS
 * client's catalog (`sanitizePvpTeam`, team size 2; unknown parts drop the
 * spinner, unknown skins drop the skin) and, when skills are on, through the
 * injected skill sanitiser (unknown skills dropped). Skills off → no skills,
 * and every power (own included) is the skill-less one.
 *
 * Cards are stable per (day, fightIndex): picks come from a seeded stream of
 * (day, fightIndex, ownId, tier), so reopening the hub with the same pool
 * shows the same three opponents — and the chosen three are PERSISTED
 * (device-only, `treesmashers_league_pool_picks`, today only), so a live pool
 * that changes during the day cannot reroll them either (LG3). Online builds
 * only persist a deck the live pool answered for (a cache / baked fallback
 * may hold unrankable ids). Kids builds never show a pool name.
 *
 * Reached only through the gate (src/league/leagueGate.ts) — never import it
 * from shared code.
 */
import leaguePoolBaked from 'virtual:league-pool'
import { expectedScore, opponentTargets } from '@/league/leagueMath'
import { LEAGUE_PICKS_KEY, LEAGUE_POOL_KEY } from '@/league/leagueKeys'
import { generateNpcBuild, generatedOpponentName, npcId } from '@/league/leagueNpc'
import { sanitizePvpTeam, type SkillSanitizer } from '@/use/loadoutSanitizer'
import { createRng } from '@/use/useDeterministicRng'
import type { LeagueTier } from '@/use/leagueTiers'
import { sanitizeDisplayName } from '@/utils/nameDenylist'
import {
  buildDigest,
  buildSkillPower,
  validatePlayerBuildShape,
  type PlayerBuildV1
} from '@/utils/playerBuild'
import type { SpinnerConfig } from '@/types/spinner'
import type { SkillLoadout } from '@/types/skills'

// ─── Types ──────────────────────────────────────────────────────────────────

export type OpponentSource = 'live' | 'cache' | 'baked' | 'generated'
export type OpponentDifficulty = 'easier' | 'even' | 'harder'
export const OPPONENT_DIFFICULTIES: readonly OpponentDifficulty[] = Object.freeze(['easier', 'even', 'harder'])

/** One opponent of the live pool / device cache (validated). */
export interface LeaguePoolEntry {
  id: string
  name: string
  build: PlayerBuildV1
}

/** What the ladder asks the live pool for. */
export interface LeaguePoolRequest {
  tier: LeagueTier
  /** The challenger's (effective) team power. */
  ownPower: number
  /** easier / even / harder target powers (leagueMath.opponentTargets). */
  targets: [number, number, number]
  day: number
}

/**
 * The live pool (LG3's `leagueApi` implements it). Resolves to an array of
 * `{ id, name, build }` (or `{ entries: [...] }`), or null when unreachable.
 * Should never throw; the ladder guards it anyway.
 */
export interface LeaguePoolFetcher {
  fetchPool(req: LeaguePoolRequest): Promise<unknown>
}

export interface OpponentContext {
  /** The challenger's build (powers are recomputed from it); null → `ownPower`. */
  ownBuild: PlayerBuildV1 | null
  ownPower: number
  tier: LeagueTier
  /** UTC day (leagueMath.utcDay). */
  day: number
  /** Index of today's fight (0-based). */
  fightIndex: number
  /** Ranked, server-backed league (gate `LEAGUE_ONLINE`). */
  online: boolean
  /** Child-directed build (gate `LEAGUE_KIDS`): generated names only. */
  kids: boolean
  /** Skills build (and skills in play). */
  skillsOn: boolean
  /** The player's leaderboard id — never offered as an opponent. */
  ownId: string | null
  /** The skill-loadout sanitiser (skills gate `loadSkillLoadoutSanitizer`).
   *  Without one, skills are dropped even when `skillsOn`. */
  sanitizeSkills?: SkillSanitizer | null
  /** Clock for the cache (default Date.now()). */
  nowMs?: number
}

export interface OpponentCard {
  /** Leaderboard id (live / cache), `bake:<hash>` (baked) or `npc:<band>:<seed>`. */
  oppId: string
  name: string
  /** Sanitised team (team size 2). */
  team: SpinnerConfig[]
  /** Sanitised skills; [] when skills are off. */
  skills: SkillLoadout
  /** Build as fought (sanitised), for /league/start and the ghost. */
  build: PlayerBuildV1
  /** Team power as fought (skill-less when skills are off). */
  power: number
  /** Challenger's expected score against it. */
  E: number
  /** Label only — the UI never shows E as a percentage. */
  difficulty: OpponentDifficulty
  source: OpponentSource
}

export interface OpponentDeck {
  cards: OpponentCard[]
  /** The live pool answered (online builds: false → O3 "no ranked fight"). */
  liveOk: boolean
}

/** Injection seams (tests; LG3 passes its fetcher). */
export interface OpponentDeps {
  fetcher?: LeaguePoolFetcher | null
  /** Default: `localStorage` when available. null → no cache. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  /** Default: the baked `virtual:league-pool`. */
  baked?: unknown
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Entries kept in the device cache. */
export const POOL_CACHE_MAX = 60
/** A cache older than this is ignored. */
export const POOL_CACHE_TTL_MS = 3 * 86_400_000
/** A pool opponent matches a target within ±10 % (at least ±2). */
const MATCH_TOLERANCE = 0.1
const MATCH_MIN_ABS = 2

const ID_RE = /^[A-Za-z0-9:_.-]{1,64}$/

// ─── Helpers ────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit. */
const fnv = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const defaultStorage = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Validate one live / cached pool entry. */
export const validatePoolEntry = (raw: unknown): LeaguePoolEntry | null => {
  if (!isRecord(raw)) return null
  const { id, name } = raw
  if (typeof id !== 'string' || !ID_RE.test(id)) return null
  if (typeof name !== 'string' || name.length === 0 || name.length > 40) return null
  const build = validatePlayerBuildShape(raw.build)
  return build === null ? null : { id, name, build }
}

const entriesOf = (raw: unknown): LeaguePoolEntry[] => {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.entries) ? raw.entries : []
  const out: LeaguePoolEntry[] = []
  const seen = new Set<string>()
  for (const r of list) {
    const e = validatePoolEntry(r)
    if (e && !seen.has(e.id)) {
      seen.add(e.id)
      out.push(e)
    }
  }
  return out
}

/** The baked pool (`{ v: 1, builds: PlayerBuildV1[] }`) as entries: ids are
 *  `bake:<hash of the build>`, names generated from them. */
export const bakedEntries = (raw: unknown): LeaguePoolEntry[] => {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.builds)) return []
  const out: LeaguePoolEntry[] = []
  const seen = new Set<string>()
  for (const b of raw.builds) {
    const build = validatePlayerBuildShape(b)
    if (!build) continue
    const id = `bake:${fnv(buildDigest(build)).toString(36)}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, name: generatedOpponentName(id), build })
  }
  return out
}

/** Read the device cache; [] when absent, stale or malformed. */
export const readPoolCache = (
  storage: Pick<Storage, 'getItem'> | null,
  nowMs: number
): LeaguePoolEntry[] => {
  if (!storage) return []
  try {
    const raw = storage.getItem(LEAGUE_POOL_KEY)
    if (raw === null) return []
    const blob = JSON.parse(raw) as unknown
    if (!isRecord(blob) || blob.v !== 1 || typeof blob.at !== 'number') return []
    if (nowMs - blob.at > POOL_CACHE_TTL_MS || blob.at - nowMs > 86_400_000) return []
    return entriesOf(blob.entries)
  } catch {
    return []
  }
}

const writePoolCache = (storage: Pick<Storage, 'setItem'> | null, entries: LeaguePoolEntry[], nowMs: number): void => {
  if (!storage || entries.length === 0) return
  try {
    storage.setItem(LEAGUE_POOL_KEY, JSON.stringify({ v: 1, at: nowMs, entries: entries.slice(0, POOL_CACHE_MAX) }))
  } catch {
    // Quota / private mode: the ladder just falls through next time.
  }
}

interface Candidate {
  entry: LeaguePoolEntry
  source: OpponentSource
  team: SpinnerConfig[]
  skills: SkillLoadout
  power: number
}

const teamPower = (team: SpinnerConfig[], skills: SkillLoadout): number => {
  let parts = 0
  for (const s of team) parts += (s.topLevel ?? 0) + (s.bottomLevel ?? 0)
  return parts + buildSkillPower(parts, skills.map((k) => k.level))
}

/** Sanitise a build for THIS client; null when fewer than 2 spinners survive. */
const sanitizeBuild = (
  build: PlayerBuildV1,
  skillsOn: boolean,
  sanitizeSkills: SkillSanitizer | null | undefined
): { team: SpinnerConfig[]; skills: SkillLoadout; power: number } | null => {
  const team = sanitizePvpTeam(
    build.team.map((s) => ({ topPartId: s.t, bottomPartId: s.b, topLevel: s.tl, bottomLevel: s.bl, modelId: s.m, smasherId: s.s, level: s.lv })),
    // Release gate: old ghosts may carry a held-back smasher → released stand-in.
    { teamSize: 2, releasedOnly: true }
  )
  if (team.length < 2) return null
  const skills = skillsOn && sanitizeSkills ? sanitizeSkills(build.sk.map((k) => ({ id: k.id, level: k.lv }))) : []
  return { team, skills, power: teamPower(team, skills) }
}

/** Re-sanitise a build some other party handed over (the server's /league/start
 *  opponent) exactly like a pool entry; null when fewer than 2 spinners survive. */
export const sanitizeOpponentBuild = (
  build: PlayerBuildV1,
  skillsOn: boolean,
  sanitizeSkills: SkillSanitizer | null | undefined
): { team: SpinnerConfig[]; skills: SkillLoadout; power: number } | null => sanitizeBuild(build, skillsOn, sanitizeSkills)

const toBuild = (team: SpinnerConfig[], skills: SkillLoadout): PlayerBuildV1 => ({
  v: 1,
  team: team.map((s) => ({
    t: s.topPartId,
    b: s.bottomPartId,
    tl: s.topLevel ?? 0,
    bl: s.bottomLevel ?? 0,
    m: s.modelId ?? '',
    ...(s.smasherId ? { s: s.smasherId, lv: s.level ?? 1 } : {})
  })),
  sk: skills.map((k) => ({ id: k.id, lv: k.level }))
})

/** The challenger's effective power: from its build (skills stripped when
 *  off), else `ownPower`. */
export const effectiveOwnPower = (ctx: Pick<OpponentContext, 'ownBuild' | 'ownPower' | 'skillsOn'>): number => {
  const b = ctx.ownBuild ? validatePlayerBuildShape(ctx.ownBuild) : null
  if (!b) return Number.isFinite(ctx.ownPower) ? Math.max(0, ctx.ownPower) : 0
  let parts = 0
  for (const s of b.team) parts += s.tl + s.bl
  return parts + (ctx.skillsOn ? buildSkillPower(parts, b.sk.map((k) => k.lv)) : 0)
}

/** Non-overlapping power windows around the three targets, so the three
 *  picks are strictly ascending (easier < even < harder) whatever the pool. */
const windows = (targets: [number, number, number]): [number, number][] => {
  const out: [number, number][] = []
  for (let i = 0; i < 3; i++) {
    const t = targets[i] as number
    const tol = Math.max(MATCH_MIN_ABS, Math.round(t * MATCH_TOLERANCE))
    let lo = t - tol
    let hi = t + tol
    if (i > 0) lo = Math.max(lo, (out[i - 1] as [number, number])[1] + 1, Math.floor(((targets[i - 1] as number) + t) / 2) + 1)
    if (i < 2) hi = Math.min(hi, Math.floor((t + (targets[i + 1] as number)) / 2))
    out.push([lo, Math.max(lo, hi)])
  }
  return out
}

// ─── Persisted picks (LG3) ──────────────────────────────────────────────────

/** One persisted card: what was chosen, not how it scored (power / E are
 *  recomputed on every read against THIS client's catalog and own power). */
interface StoredPick {
  oppId: string
  name: string
  build: PlayerBuildV1
  source: OpponentSource
}

interface StoredDeck {
  /** Context the deck was drawn for (own id, tier, flavour) — a mismatch rerolls. */
  ctx: string
  cards: StoredPick[]
}

/** Fight indices kept per day (the server caps a day at 16 starts). */
const PICKS_MAX_FIGHTS = 32
const SOURCES: readonly OpponentSource[] = ['live', 'cache', 'baked', 'generated']

const picksCtx = (ctx: OpponentContext): string =>
  `${ctx.ownId ?? ''}|${ctx.tier}|${ctx.skillsOn ? 1 : 0}|${ctx.kids ? 1 : 0}|${ctx.online ? 1 : 0}`

const readPicksBlob = (storage: Pick<Storage, 'getItem'> | null, day: number): Record<string, StoredDeck> => {
  if (!storage) return {}
  try {
    const raw = storage.getItem(LEAGUE_PICKS_KEY)
    if (raw === null) return {}
    const blob = JSON.parse(raw) as unknown
    if (!isRecord(blob) || blob.v !== 1 || blob.day !== day || !isRecord(blob.fights)) return {}
    return blob.fights as Record<string, StoredDeck>
  } catch {
    return {}
  }
}

const validStoredPick = (raw: unknown): StoredPick | null => {
  if (!isRecord(raw)) return null
  const { oppId, name, source } = raw
  if (typeof oppId !== 'string' || !ID_RE.test(oppId)) return null
  if (typeof name !== 'string' || name.length === 0 || name.length > 40) return null
  if (typeof source !== 'string' || !(SOURCES as readonly string[]).includes(source)) return null
  const build = validatePlayerBuildShape(raw.build)
  return build === null ? null : { oppId, name, build, source: source as OpponentSource }
}

/** Today's stored deck for this fight, or null (absent, other context, malformed). */
export const readStoredPicks = (
  storage: Pick<Storage, 'getItem'> | null,
  ctx: OpponentContext
): StoredPick[] | null => {
  const deck = readPicksBlob(storage, ctx.day)[String(ctx.fightIndex)]
  if (!isRecord(deck) || deck.ctx !== picksCtx(ctx) || !Array.isArray(deck.cards) || deck.cards.length !== 3) return null
  const out: StoredPick[] = []
  for (const c of deck.cards) {
    const p = validStoredPick(c)
    if (!p) return null
    out.push(p)
  }
  return out
}

const writeStoredPicks = (
  storage: (Pick<Storage, 'getItem' | 'setItem'>) | null,
  ctx: OpponentContext,
  cards: OpponentCard[]
): void => {
  if (!storage) return
  try {
    const fights = readPicksBlob(storage, ctx.day)
    fights[String(ctx.fightIndex)] = {
      ctx: picksCtx(ctx),
      cards: cards.map((c) => ({ oppId: c.oppId, name: c.name, build: c.build, source: c.source }))
    }
    const keys = Object.keys(fights).sort((a, b) => Number(a) - Number(b))
    for (const k of keys.slice(0, Math.max(0, keys.length - PICKS_MAX_FIGHTS))) delete fights[k]
    storage.setItem(LEAGUE_PICKS_KEY, JSON.stringify({ v: 1, day: ctx.day, fights }))
  } catch {
    // Quota / private mode: the seeded draw still keeps the cards stable
    // while the pool does not change.
  }
}

/** Rebuild persisted picks into cards (re-sanitised, powers / E recomputed);
 *  null when any of them no longer survives this client's catalog. */
const cardsFromPicks = (
  picks: StoredPick[],
  ctx: OpponentContext,
  ownPower: number
): OpponentCard[] | null => {
  const cards: OpponentCard[] = []
  for (let slot = 0; slot < picks.length; slot++) {
    const p = picks[slot] as StoredPick
    const s = sanitizeBuild(p.build, ctx.skillsOn, ctx.sanitizeSkills)
    if (!s) return null
    cards.push({
      oppId: p.oppId,
      name: ctx.kids ? generatedOpponentName(p.oppId) : p.source === 'baked' || p.source === 'generated' ? p.name : sanitizeDisplayName(p.name),
      team: s.team,
      skills: s.skills,
      build: toBuild(s.team, s.skills),
      power: s.power,
      source: p.source,
      E: expectedScore(ownPower, s.power),
      difficulty: OPPONENT_DIFFICULTIES[slot] as OpponentDifficulty
    })
  }
  return cards
}

// ─── The ladder ─────────────────────────────────────────────────────────────

/** Cards plus whether the live pool answered. */
export const getOpponentDeck = async (ctx: OpponentContext, deps: OpponentDeps = {}): Promise<OpponentDeck> => {
  const nowMs = ctx.nowMs ?? Date.now()
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const ownPower = effectiveOwnPower(ctx)
  const targets = opponentTargets(ownPower, ctx.tier)

  // Rung 1: live.
  let live: LeaguePoolEntry[] = []
  let liveOk = false
  if (ctx.online && deps.fetcher) {
    try {
      const raw = await deps.fetcher.fetchPool({ tier: ctx.tier, ownPower, targets, day: ctx.day })
      if (raw !== null && raw !== undefined) {
        live = entriesOf(raw)
        liveOk = true
        writePoolCache(storage, live, nowMs)
      }
    } catch {
      liveOk = false
    }
  }
  // Already drawn today for this fight: the same three, whatever the pool
  // says now (the live fetch above still ran — it answers `liveOk` and
  // refreshes the device cache).
  const stored = readStoredPicks(storage, ctx)
  const restored = stored ? cardsFromPicks(stored, ctx, ownPower) : null
  if (restored) return { cards: restored, liveOk }

  // Rungs 2 + 3.
  const cache = liveOk ? [] : readPoolCache(storage, nowMs)
  const baked = bakedEntries(deps.baked === undefined ? leaguePoolBaked : deps.baked)

  const rungs: [OpponentSource, LeaguePoolEntry[]][] = [['live', live], ['cache', cache], ['baked', baked]]
  const excluded = new Set<string>(ctx.ownId ? [ctx.ownId] : [])
  const candidates: Candidate[][] = rungs.map(([source, entries]) => {
    const out: Candidate[] = []
    for (const entry of entries) {
      if (excluded.has(entry.id)) continue
      const s = sanitizeBuild(entry.build, ctx.skillsOn, ctx.sanitizeSkills)
      if (s) out.push({ entry, source, ...s })
    }
    // Deterministic order regardless of the pool's own order.
    out.sort((a, b) => a.power - b.power || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0))
    return out
  })

  const rng = createRng(fnv(`${ctx.day}:${ctx.fightIndex}:${ctx.ownId ?? ''}:${ctx.tier}`))
  const wins = windows(targets)
  const used = new Set<string>()
  const cards: OpponentCard[] = []
  for (let slot = 0; slot < 3; slot++) {
    const [lo, hi] = wins[slot] as [number, number]
    const roll = rng()
    const npcSeed = Math.floor(rng() * 0x100000000) >>> 0
    let chosen: Candidate | null = null
    for (const list of candidates) {
      const fits = list.filter((c) => c.power >= lo && c.power <= hi && !used.has(c.entry.id))
      if (fits.length > 0) {
        chosen = fits[Math.min(fits.length - 1, Math.floor(roll * fits.length))] as Candidate
        break
      }
    }
    let card: Omit<OpponentCard, 'E' | 'difficulty'>
    if (chosen) {
      used.add(chosen.entry.id)
      const kidsName = ctx.kids || chosen.source === 'baked'
      card = {
        oppId: chosen.entry.id,
        name: kidsName ? generatedOpponentName(chosen.entry.id) : sanitizeDisplayName(chosen.entry.name),
        team: chosen.team,
        skills: chosen.skills,
        build: toBuild(chosen.team, chosen.skills),
        power: chosen.power,
        source: chosen.source
      }
    } else {
      const target = targets[slot] as number
      const id = npcId(target, npcSeed)
      const gen = generateNpcBuild(npcSeed, target, { skills: ctx.skillsOn && !!ctx.sanitizeSkills })
      const s = sanitizeBuild(gen, ctx.skillsOn, ctx.sanitizeSkills)
      // The embedded ids are cross-checked against the catalogs in tests, so
      // this never drops; the fallback keeps the card count at 3 regardless.
      const team = s?.team ?? []
      const skills = s?.skills ?? []
      card = {
        oppId: id,
        name: generatedOpponentName(id),
        team,
        skills,
        build: toBuild(team, skills),
        power: s?.power ?? target,
        source: 'generated'
      }
    }
    cards.push({ ...card, E: expectedScore(ownPower, card.power), difficulty: OPPONENT_DIFFICULTIES[slot] as OpponentDifficulty })
  }
  // Online: only a deck the live pool answered for is locked in — a cache /
  // baked fallback drawn while the server was away must not stick all day.
  if (!ctx.online || liveOk) writeStoredPicks(storage, ctx, cards)
  return { cards, liveOk }
}

/** The three opponent cards (easier, even, harder) for this fight. */
export const getOpponentCards = async (ctx: OpponentContext, deps: OpponentDeps = {}): Promise<OpponentCard[]> =>
  (await getOpponentDeck(ctx, deps)).cards
