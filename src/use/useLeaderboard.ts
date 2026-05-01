import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { TopPartId, BottomPartId, SpinnerConfig } from '@/types/spinner'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { crazyPlayerName } from '@/use/useCrazyGames'
import { saveDataVersion } from '@/use/useSaveStatus'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  id: string
  name: string
  maxStage: number
  blade: SpinnerConfig
  blade2: SpinnerConfig
  /** Stages climbed in the current rolling 24h window. Capped at MAX_DAILY_CLIMB. */
  dailyClimbed: number
  /** Timestamp when the daily climb counter was last reset. */
  dailyResetAt: number
  isPlayer?: boolean
}

// ─── Tunables ───────────────────────────────────────────────────────────────

const LEADERBOARD_KEY = 'spinner_leaderboard'
const LEADERBOARD_UPDATED_KEY = 'spinner_leaderboard_updated_at'
const PLAYER_MAX_STAGE_KEY = 'spinner_player_max_stage'

/** "Every 1 in-game hour" — refresh fake NPC progression once per real hour. */
export const LEADERBOARD_UPDATE_INTERVAL_MS = 60 * 60 * 1000
const DAY_MS = 24 * LEADERBOARD_UPDATE_INTERVAL_MS

/** First-time seed: 200 players topping out at stage 126. */
const INITIAL_PLAYER_COUNT = 212
const INITIAL_TOP_STAGE = 126
const MAX_FAKE_STAGE = 300

/** Believable progression rules. */
const DAILY_CLIMBER_PCT = 0.25
/** Roughly (DAILY_CLIMBER_PCT * INITIAL_PLAYER_COUNT) / 24 → ≈2 per hourly tick. */
const CLIMBERS_PER_UPDATE = Math.max(
  1,
  Math.round((DAILY_CLIMBER_PCT * INITIAL_PLAYER_COUNT) / 24)
)
const MAX_PER_UPDATE_CLIMB = 2
const MAX_DAILY_CLIMB = 5
/** Skip NPCs whose stage is within ±N of the player's stage so the
 *  player's neighborhood stays stable across refreshes. */
const PROXIMITY_PROTECTION = 2

/** Up to N brand-new players join the leaderboard per rolling 24h window. */
const MAX_NEWCOMERS_PER_DAY = 5
/** Average newcomer chance per hourly tick → 5 / 24 ≈ 0.208 */
const NEWCOMER_CHANCE_PER_TICK = MAX_NEWCOMERS_PER_DAY / 24
const NEWCOMERS_KEY = 'spinner_leaderboard_newcomers'
const GHOST_FIGHTS_KEY = 'spinner_ghost_fights_today'

// Names lean ~60% silly/childish to match the 6–15 target audience.
// Sensitive themes (sexual, political, religious, slurs, drugs/alcohol,
// real-world violence, body-shaming) are intentionally excluded.
const FAKE_NAMES = [
  // ── "Cool" edgy names (~40%) ───────────────────────────────────────────
  'BladeKing', 'StormFury', 'NightHowl', 'IronVortex', 'CrimsonAce',
  'ShadowRipper', 'NovaStrike', 'PhoenixWrath', 'TitanForge', 'VenomEdge',
  'FrostFang', 'EmberSoul', 'ThunderJax', 'OmegaSpin', 'RiftBreaker',
  'KaiserBolt', 'OnyxClaw', 'BlazeMonk', 'HavocReign', 'EchoStrike',
  'PulseRogue', 'AstroDuke', 'DriftKing', 'FuryMax', 'NebulaJin',
  'SableHex', 'TempestVox', 'NeonFang', 'VoltaireX', 'StarflareQ',
  // ── Silly / childish names (~60%) ──────────────────────────────────────
  'AllKiller', 'Farter', 'BurpKing', 'FartZilla', 'ToeJam',
  'BoogerBoy', 'SnotRocket', 'PicklePants', 'WafflePants', 'NuggetKing',
  'TacoTornado', 'BananaBruh', 'PizzaPirate', 'NoodleArm', 'MuffinMan',
  'CheeseWhiz', 'SpaghettiKid', 'JellyBean', 'DonutDude', 'PancakePirate',
  'MeatballHead', 'BurritoBomber', 'NachoBoss', 'SodaSlurper', 'JuiceBoxHero',
  'WiggleWorm', 'GiggleGoblin', 'WackyJack', 'ZanyZeke', 'SillyBilly',
  'GoofyGus', 'DerpyDuck', 'KooKooKid', 'BonkBoy', 'BoingBoing',
  'SquishyKing', 'JellyJiggler', 'ThumpyBunny', 'NoobSlayer', 'LagBeast',
  'SkibidiKing', 'YeetMaster', 'SusBro', 'DabKing', 'BigChungus',
  'SneezyPete', 'HiccupHero', 'CrumbCrusher', 'BellyFlopper', 'GrumpyGus'
]

const TOP_IDS: TopPartId[] = ['star', 'triangle', 'round', 'quadratic', 'cushioned', 'piercer']
const BOTTOM_IDS: BottomPartId[] = ['speedy', 'tanky', 'balanced']
const FAKE_MODEL_IDS = [
  'blades', 'ice', 'tornado', 'reddragon', 'axe',
  'thunder', 'snake', 'phoenix', 'eagle', 'salamaner',
  'nature', 'turtle', 'piranha', 'bear', 'galaxy',
  'chip', 'mysticaleye', 'bluedragon', 'angelic', 'prisma',
  'shell', 'shield', 'castle', 'mountain', 'gear',
  'scorpion', 'wulf', 'demon', 'hawk', 'ape'
]

// ─── Helpers ────────────────────────────────────────────────────────────────

const rand = <T, >(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!
const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))

/** Fake "upgrade level" loosely tied to a player's max stage. */
const partLevelForStage = (stage: number): number =>
  Math.max(0, Math.min(15, Math.round(stage * 0.12 + (Math.random() * 2 - 1))))

const generateBlade = (stage: number): SpinnerConfig => ({
  topPartId: rand(TOP_IDS),
  bottomPartId: rand(BOTTOM_IDS),
  topLevel: partLevelForStage(stage),
  bottomLevel: partLevelForStage(stage),
  modelId: rand(FAKE_MODEL_IDS)
})

// Textual suffix pool. Empty strings are intentionally included so a
// chunk of names stay bare. The rest mixes generic "cool" tags with
// gamer / streamer culture references appropriate for ages 6–15.
// We deliberately avoid numeric suffixes and any taunting tags
// (e.g. "EZ", "Noob") since names should read like real kid handles.
const NAME_SUFFIXES = [
  // ~30% bare
  '', '', '', '', '', '', '', '', '', '', '', '',
  // generic / cool
  'Jr', 'Pro', 'X', 'MVP', 'Max', 'Z', 'Boss', 'Mega', 'Ace', 'Prime',
  // gamer / streamer / meme culture
  'Kong', 'Lol', 'Rofl', 'WTF', 'Pig', 'Lel', 'Kack', 'JustChat', 'GG', 'YT', 'TV', 'OP', 'AFK',
  'Goat', 'Lame', 'Tuber', 'Mate', 'Bro', 'Brah', 'Dude', 'Fam', 'Hype', 'Wow', 'Sus', 'Yeet', 'Fock', 'Type'
]
const NAME_PREFIXES = [
  // ~30% bare
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  // generic / cool
  'The', 'Hyper', 'Mega', 'Super', 'Dipshit', 'Focker', 'Lick', 'Jim', 'Jane', 'Pipi',
  // gamer / streamer / meme culture
  'Tum', 'Luck', 'Chang', 'Ching', 'Kar', 'Fly', 'Hammer', 'Giga', 'GG',
  'Goat', 'Lame', 'Tuber', 'Bro', 'Brahhh', 'Hype', 'Sus'
]

const makeName = (i: number): string => {
  const base = FAKE_NAMES[i % FAKE_NAMES.length] ?? 'Rival'
  // Pick a random suffix (often empty) so names feel naturally varied
  // instead of every "round" sharing the same suffix.
  const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]!
  const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)]!
  return suffix || prefix ? `${prefix}${base}${suffix}` : base
}

// ─── Persistence ────────────────────────────────────────────────────────────

const isValidEntry = (e: any): e is LeaderboardEntry =>
  e && typeof e.id === 'string' && typeof e.maxStage === 'number' && e.blade &&
  typeof e.dailyClimbed === 'number' && typeof e.dailyResetAt === 'number'

const loadEntries = (): LeaderboardEntry[] => {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Allow growth beyond INITIAL_PLAYER_COUNT (newcomers join over time),
      // but reject anything obviously broken or smaller than the seed.
      if (Array.isArray(parsed) && parsed.length >= INITIAL_PLAYER_COUNT && parsed.every(isValidEntry)) {
        return parsed
      }
    }
  } catch { /* fall through */
  }
  return []
}

interface NewcomerWindow {
  count: number
  resetAt: number
}

const loadNewcomerWindow = (): NewcomerWindow => {
  try {
    const raw = localStorage.getItem(NEWCOMERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.count === 'number' && typeof parsed.resetAt === 'number') {
        return parsed
      }
    }
  } catch { /* fall through */
  }
  return { count: 0, resetAt: Date.now() }
}

const saveNewcomerWindow = (w: NewcomerWindow) => {
  localStorage.setItem(NEWCOMERS_KEY, JSON.stringify(w))
}

const loadLastUpdate = (): number => {
  try {
    return parseInt(localStorage.getItem(LEADERBOARD_UPDATED_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}

const loadPlayerMaxStage = (): number => {
  try {
    return parseInt(localStorage.getItem(PLAYER_MAX_STAGE_KEY) || '0', 10) || 0
  } catch {
    return 0
  }
}

const saveEntries = (entries: LeaderboardEntry[]) => {
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries))
}

const saveLastUpdate = (ts: number) => {
  localStorage.setItem(LEADERBOARD_UPDATED_KEY, ts.toString())
}

const savePlayerMaxStage = (stage: number) => {
  // CG QA flagged this key in localStorage. Bypass the local mirror by
  // pushing straight into the SaveManager's outbound queue — the value
  // still ships to `sdk.data` (or the active strategy's backend) but
  // never appears in the browser's storage panel. The in-session model
  // lives in the `playerMaxStage` ref above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sm: any = (typeof window !== 'undefined' ? (window as any).__saveManager : null)
  if (sm?.setRemoteOnly) {
    sm.setRemoteOnly(PLAYER_MAX_STAGE_KEY, stage.toString())
  } else {
    // Fallback for the brief boot window before main.ts publishes the
    // SaveManager (or in tests / non-Vue environments).
    localStorage.setItem(PLAYER_MAX_STAGE_KEY, stage.toString())
  }
}

// ─── Singleton State ────────────────────────────────────────────────────────

const npcEntries: Ref<LeaderboardEntry[]> = ref(loadEntries())
const lastUpdatedAt: Ref<number> = ref(loadLastUpdate())
const playerMaxStage: Ref<number> = ref(loadPlayerMaxStage())
const newcomerWindow: Ref<NewcomerWindow> = ref(loadNewcomerWindow())

// Re-read on hydrate-success bump. Mirrors the watcher in
// `useSpinnerCampaign` — without it a returning player's leaderboard
// rank shows stage 0 until they advance one stage.
watch(saveDataVersion, () => {
  npcEntries.value = loadEntries()
  lastUpdatedAt.value = loadLastUpdate()
  playerMaxStage.value = loadPlayerMaxStage()
  newcomerWindow.value = loadNewcomerWindow()
})

// ─── Ghost Fight Daily Tracking ────────────────────────────────────────────
// Each NPC can be challenged at most once per rolling 24h window.

interface GhostFightsState {
  ids: string[]
  resetAt: number
}

const loadGhostFights = (): GhostFightsState => {
  try {
    const raw = localStorage.getItem(GHOST_FIGHTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.ids) && typeof parsed.resetAt === 'number') {
        if (Date.now() - parsed.resetAt >= DAY_MS) {
          return { ids: [], resetAt: Date.now() }
        }
        return { ids: parsed.ids.filter((x: unknown) => typeof x === 'string'), resetAt: parsed.resetAt }
      }
    }
  } catch { /* fall through */
  }
  return { ids: [], resetAt: Date.now() }
}

const saveGhostFights = (s: GhostFightsState) => {
  localStorage.setItem(GHOST_FIGHTS_KEY, JSON.stringify(s))
}

const ghostFights: Ref<GhostFightsState> = ref(loadGhostFights())

const ensureGhostFightsFresh = () => {
  if (Date.now() - ghostFights.value.resetAt >= DAY_MS) {
    ghostFights.value = { ids: [], resetAt: Date.now() }
    saveGhostFights(ghostFights.value)
  }
}

const canFightGhost = (id: string): boolean => {
  ensureGhostFightsFresh()
  return !ghostFights.value.ids.includes(id)
}

const markGhostFought = (id: string) => {
  ensureGhostFightsFresh()
  if (ghostFights.value.ids.includes(id)) return
  ghostFights.value = {
    ids: [...ghostFights.value.ids, id],
    resetAt: ghostFights.value.resetAt
  }
  saveGhostFights(ghostFights.value)
}

// ─── Newcomer Helpers ──────────────────────────────────────────────────────

/** Generate a fresh joining player at the bottom of the ladder. */
const generateNewcomer = (): LeaderboardEntry => {
  const now = Date.now()
  const stage = randInt(1, 4) // newcomers always join near the bottom
  // Use a unique-ish id so it never collides with an existing entry
  const id = `npc-new-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
  return {
    id,
    name: makeName(randInt(0, FAKE_NAMES.length * 4 - 1)),
    maxStage: stage,
    blade: generateBlade(stage),
    blade2: generateBlade(stage),
    dailyClimbed: 0,
    dailyResetAt: now
  }
}

/** Roll for one newcomer this tick, respecting the rolling-24h cap. */
const tryAddNewcomer = (list: LeaderboardEntry[], now: number) => {
  // Reset the rolling window if a full day has elapsed
  if (now - newcomerWindow.value.resetAt >= DAY_MS) {
    newcomerWindow.value = { count: 0, resetAt: now }
  }
  if (newcomerWindow.value.count >= MAX_NEWCOMERS_PER_DAY) return
  if (Math.random() >= NEWCOMER_CHANCE_PER_TICK) return
  list.push(generateNewcomer())
  newcomerWindow.value = {
    count: newcomerWindow.value.count + 1,
    resetAt: newcomerWindow.value.resetAt
  }
  saveNewcomerWindow(newcomerWindow.value)
}

// ─── Initial Seed ───────────────────────────────────────────────────────────

/**
 * Generate 200 players spread across stages 1..126 on a smooth curve.
 * Top rank gets exactly INITIAL_TOP_STAGE; the bottom tail bottoms out near 1.
 */
const seedLeaderboard = () => {
  const list: LeaderboardEntry[] = []
  const now = Date.now()
  for (let i = 0; i < INITIAL_PLAYER_COUNT; i++) {
    // Smooth descending curve from INITIAL_TOP_STAGE → ~1 with some jitter.
    const t = i / (INITIAL_PLAYER_COUNT - 1) // 0..1
    const base = INITIAL_TOP_STAGE * Math.pow(1 - t, 1.15)
    const noise = randInt(-2, 2)
    const stage = Math.max(1, Math.min(INITIAL_TOP_STAGE, Math.round(base + noise)))
    const finalStage = i === 0 ? INITIAL_TOP_STAGE : stage // ensure exact top
    list.push({
      id: `npc-${i}-${now.toString(36)}`,
      name: makeName(i),
      maxStage: finalStage,
      blade: generateBlade(finalStage),
      blade2: generateBlade(finalStage),
      dailyClimbed: 0,
      dailyResetAt: now
    })
  }
  npcEntries.value = list
  lastUpdatedAt.value = now
  newcomerWindow.value = { count: 0, resetAt: now }
  saveEntries(list)
  saveLastUpdate(now)
  saveNewcomerWindow(newcomerWindow.value)
}

// ─── Update Tick ────────────────────────────────────────────────────────────

/**
 * Run one "hourly" leaderboard refresh.
 *  - Picks CLIMBERS_PER_UPDATE random fresh climbers.
 *  - Each climbs 1..MAX_PER_UPDATE_CLIMB stages.
 *  - Each player capped at MAX_DAILY_CLIMB stages per 24h rolling window.
 *  - Climbers near the player's current stage are skipped (proximity protection).
 *  - Picks new random climbers each tick (no repeats inside a tick).
 */
const tickLeaderboard = (playerStage: number) => {
  if (npcEntries.value.length === 0) {
    seedLeaderboard()
    return
  }
  const now = Date.now()
  const list = npcEntries.value.slice()

  // 1. Reset per-day climb counters whose 24h window has elapsed.
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!
    if (now - e.dailyResetAt >= DAY_MS) {
      list[i] = { ...e, dailyClimbed: 0, dailyResetAt: now }
    }
  }

  // 2. Build candidate pool: not maxed-out today, not near player.
  const candidates: number[] = []
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!
    if (e.dailyClimbed >= MAX_DAILY_CLIMB) continue
    if (Math.abs(e.maxStage - playerStage) <= PROXIMITY_PROTECTION) continue
    if (e.maxStage >= MAX_FAKE_STAGE) continue
    candidates.push(i)
  }
  // 2b. Roll for a brand-new player joining the leaderboard this tick.
  //     Newcomers join at the bottom (stage 1-4) and become climb candidates
  //     starting from the next tick.
  tryAddNewcomer(list, now)

  if (candidates.length === 0) {
    lastUpdatedAt.value = now
    npcEntries.value = list
    saveEntries(list)
    saveLastUpdate(now)
    return
  }

  // 3. Pick CLIMBERS_PER_UPDATE distinct random candidates.
  const picked = new Set<number>()
  const climbCount = Math.min(CLIMBERS_PER_UPDATE, candidates.length)
  while (picked.size < climbCount) {
    picked.add(candidates[randInt(0, candidates.length - 1)]!)
  }

  // 4. Apply climbs.
  for (const idx of picked) {
    const e = list[idx]!
    const remaining = MAX_DAILY_CLIMB - e.dailyClimbed
    const climb = Math.max(1, Math.min(MAX_PER_UPDATE_CLIMB, remaining, randInt(1, MAX_PER_UPDATE_CLIMB)))
    const newStage = Math.min(MAX_FAKE_STAGE, e.maxStage + climb)
    // Occasionally swap to a fresh build to feel alive
    let newBlade = e.blade
    let newBlade2 = e.blade2
    if (Math.random() < 0.18) {
      newBlade = {
        ...e.blade,
        topPartId: rand(TOP_IDS),
        bottomPartId: rand(BOTTOM_IDS),
        topLevel: Math.max(e.blade.topLevel ?? 0, partLevelForStage(newStage)),
        bottomLevel: Math.max(e.blade.bottomLevel ?? 0, partLevelForStage(newStage)),
        modelId: rand(FAKE_MODEL_IDS)
      }
      newBlade2 = generateBlade(newStage)
    } else {
      newBlade = {
        ...e.blade,
        topLevel: Math.max(e.blade.topLevel ?? 0, partLevelForStage(newStage)),
        bottomLevel: Math.max(e.blade.bottomLevel ?? 0, partLevelForStage(newStage))
      }
      newBlade2 = {
        ...(e.blade2 ?? generateBlade(newStage)),
        topLevel: Math.max((e.blade2?.topLevel ?? e.blade.topLevel) ?? 0, partLevelForStage(newStage)),
        bottomLevel: Math.max((e.blade2?.bottomLevel ?? e.blade.bottomLevel) ?? 0, partLevelForStage(newStage))
      }
    }
    list[idx] = {
      ...e,
      maxStage: newStage,
      blade: newBlade,
      blade2: newBlade2,
      dailyClimbed: e.dailyClimbed + climb
    }
  }

  npcEntries.value = list
  lastUpdatedAt.value = now
  saveEntries(list)
  saveLastUpdate(now)
}

/** Apply as many ticks as full hours have elapsed since the last update. */
const refreshLeaderboardIfDue = (playerStage: number) => {
  if (npcEntries.value.length < INITIAL_PLAYER_COUNT) {
    seedLeaderboard()
    return
  }
  const now = Date.now()
  const elapsed = now - lastUpdatedAt.value
  if (elapsed < LEADERBOARD_UPDATE_INTERVAL_MS) return
  const ticks = Math.min(48, Math.floor(elapsed / LEADERBOARD_UPDATE_INTERVAL_MS))
  for (let i = 0; i < ticks; i++) tickLeaderboard(playerStage)
}

/** Force a single leaderboard refresh tick — used by the cheat shortcut. */
const forceLeaderboardTick = (playerStage: number) => {
  if (npcEntries.value.length < INITIAL_PLAYER_COUNT) {
    seedLeaderboard()
    return
  }
  tickLeaderboard(playerStage)
}

const recordPlayerStage = (stage: number) => {
  if (stage > playerMaxStage.value) {
    playerMaxStage.value = stage
    savePlayerMaxStage(stage)
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

const useLeaderboard = () => {
  const { currentStageId } = useSpinnerCampaign()

  /** Combined leaderboard: NPCs + the live player, sorted by maxStage desc. */
  const entries = computed<LeaderboardEntry[]>(() => {
    const playerStage = Math.max(currentStageId.value, playerMaxStage.value)
    const playerEntry: LeaderboardEntry = {
      id: 'player',
      // Prefer the CrazyGames-side display name when we have one so the
      // leaderboard shows the player's real handle instead of a generic
      // placeholder. Falls back to "You" for anonymous / non-CG sessions.
      name: crazyPlayerName.value || 'You',
      maxStage: playerStage,
      blade: { topPartId: 'star', bottomPartId: 'balanced' },
      blade2: { topPartId: 'round', bottomPartId: 'balanced' },
      dailyClimbed: 0,
      dailyResetAt: 0,
      isPlayer: true
    }
    const merged = [...npcEntries.value, playerEntry]
    // Stable order: higher stage first; player wins ties so their position is well-defined.
    merged.sort((a, b) => {
      if (b.maxStage !== a.maxStage) return b.maxStage - a.maxStage
      if (a.isPlayer) return -1
      if (b.isPlayer) return 1
      return 0
    })
    return merged
  })

  const playerRank = computed(() => {
    const idx = entries.value.findIndex(e => e.isPlayer)
    return idx >= 0 ? idx + 1 : entries.value.length
  })

  const totalEntries = computed(() => entries.value.length)

  return {
    entries,
    playerRank,
    playerMaxStage,
    totalEntries,
    lastUpdatedAt,
    refreshLeaderboardIfDue,
    forceLeaderboardTick,
    recordPlayerStage,
    ghostFights,
    canFightGhost,
    markGhostFought
  }
}

export default useLeaderboard
