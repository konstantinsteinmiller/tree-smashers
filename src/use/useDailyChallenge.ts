import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { SpinnerConfig, TopPartId, BottomPartId, BossAbility } from '@/types/spinner'
import { TOP_PARTS, BOTTOM_PARTS } from '@/use/useSpinnerConfig'
// Source the skin catalogue from the PURE data module (not useModels) so this
// composable's import graph stays free of the useMatch→useSound→useUser cycle.
import { offerableSkinsForTop, type SpinnerModelId } from '@/data/skinCatalog'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { NON_CIRCLE_SHAPES, type ArenaShape } from '@/use/arenaShapes'
import { saveDataVersion } from '@/use/useSaveStatus'
import { utcDayKey } from '@/utils/dayKey'

// ─── Daily Challenge ─────────────────────────────────────────────────────────
//
// A once-a-day bonus fight launched from the menu via the ChallengeIcon. It
// stages a freshly-randomised enemy constellation (1–3 blades) in a random
// non-circular arena, scaled to the player's own upgrade levels so it stays
// fair. Winning grants 1 diamond — but only the FIRST win each day pays out;
// the player may replay for fun afterwards with no further reward.
//
// The per-day counters are persisted (`spinner_daily_challenge`, cloud-synced
// via the `spinner_` prefix): how many attempts have been used today and
// whether the diamond has been won. The enemy roster is ephemeral — re-rolled
// on every launch so no two attempts feel identical.

const STORAGE_KEY = 'spinner_daily_challenge'

/** Max attempts (win, lose, or surrender all count) allowed per UTC day. After
 *  these are used the ChallengeIcon hides until the next day so it stops
 *  distracting from normal play. */
export const MAX_DAILY_ATTEMPTS = 3

interface DailyChallengeState {
  /** UTC date (YYYY-MM-DD) the counters below belong to, or null. */
  day: string | null
  /** Attempts started today. */
  attempts: number
  /** Whether the (first-win) diamond has been claimed today. */
  won: boolean
}

/** Enemy abilities that work standalone on a single blade (wired per-blade in
 *  useSpinnerGame.initGame). partners/healers are excluded here — they are
 *  team-wide coordination abilities handled separately for multi-enemy squads. */
const SOLO_ABILITIES: BossAbility[] = [
  'ghost', 'split', 'child-emitter', 'stat-switch', 'life-leech', 'thunder'
]

/** Per-enemy chance of rolling a special ability. */
const ABILITY_CHANCE = 0.66
/** Chance a 2–3 blade roster forms a coordinated partner/healer squad instead
 *  of independently-abilitied blades. */
const SQUAD_CHANCE = 0.25

const TOP_IDS = Object.keys(TOP_PARTS) as TopPartId[]
const BOTTOM_IDS = Object.keys(BOTTOM_PARTS) as BottomPartId[]

const rand = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!
const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))

/** Random skin valid for the given top part (mirrors useModels.getRandomSkinForTop
 *  but sourced from the pure catalogue to keep this module cycle-free). */
const randomSkinForTop = (topPartId: TopPartId): SpinnerModelId => rand(offerableSkinsForTop(topPartId))

const todayStr = (): string => utcDayKey()

const loadState = (): DailyChallengeState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        // Current format.
        if ('attempts' in parsed || 'day' in parsed) {
          return {
            day: typeof parsed.day === 'string' ? parsed.day : null,
            attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0,
            won: !!parsed.won
          }
        }
        // Legacy `{ lastWonDate }` format (pre-attempt-limit) — migrate.
        if ('lastWonDate' in parsed) {
          const lw = typeof parsed.lastWonDate === 'string' ? parsed.lastWonDate : null
          return { day: lw, attempts: 0, won: !!lw }
        }
      }
    }
  } catch { /* fall through */
  }
  return { day: null, attempts: 0, won: false }
}

const state: Ref<DailyChallengeState> = ref(loadState())

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  state.value = loadState()
})

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
}

/** True when the persisted counters belong to the current UTC day. */
const isToday = computed(() => state.value.day === todayStr())

/** Attempts already used today (0 once the day rolls over). */
const attemptsToday = computed(() => (isToday.value ? state.value.attempts : 0))

/** Attempts remaining today. */
const attemptsLeftToday = computed(() => Math.max(0, MAX_DAILY_ATTEMPTS - attemptsToday.value))

/** Whether the player may still start a daily challenge today. */
const canPlayToday = computed(() => attemptsToday.value < MAX_DAILY_ATTEMPTS)

/** True once today's challenge has already been won (diamond already paid). */
const hasWonToday = computed(() => isToday.value && state.value.won)

/** Count one attempt (call when a daily challenge actually starts). Resets the
 *  counters when the UTC day has rolled over. */
const recordAttempt = () => {
  const today = todayStr()
  if (state.value.day !== today) {
    state.value = { day: today, attempts: 1, won: false }
  } else {
    state.value = { ...state.value, attempts: state.value.attempts + 1 }
  }
  saveState()
}

/** Mark today's challenge as won so the diamond is only paid once per day.
 *  Returns true if this call is the FIRST win today (i.e. a diamond is owed). */
const markDailyChallengeWon = (): boolean => {
  if (hasWonToday.value) return false
  state.value = { day: todayStr(), attempts: state.value.attempts, won: true }
  saveState()
  return true
}

export interface DailyChallenge {
  enemies: SpinnerConfig[]
  shape: ArenaShape
}

/**
 * Build a fresh daily-challenge encounter:
 *   • 1–3 enemies, random top/bottom parts + a sensible skin per top part.
 *   • Enemy upgrade levels matched to the player's HIGHEST top/bottom levels.
 *   • ≈66% chance per enemy of a special ability. A 2–3 blade roster may form
 *     a partner/healer squad instead; a lone enemy fights at boss stats (2× HP)
 *     but normal size, and never in a boss arena.
 *   • A random non-circular arena shape.
 */
const generateChallenge = (): DailyChallenge => {
  const { playerUpgrades } = useSpinnerCampaign()
  const tops = playerUpgrades.value.tops
  const bottoms = playerUpgrades.value.bottoms
  const maxTop = Math.max(0, ...Object.values(tops))
  const maxBot = Math.max(0, ...Object.values(bottoms))

  const count = randInt(1, 3)

  const makeEnemy = (ability?: BossAbility): SpinnerConfig => {
    const topPartId = rand(TOP_IDS)
    const bottomPartId = rand(BOTTOM_IDS)
    return {
      topPartId,
      bottomPartId,
      topLevel: maxTop,
      bottomLevel: maxBot,
      modelId: randomSkinForTop(topPartId),
      ...(ability ? { bossAbility: ability } : {})
    }
  }

  let enemies: SpinnerConfig[]

  if (count >= 2 && Math.random() < SQUAD_CHANCE) {
    // Coordinated squad: every blade shares one team-wide ability.
    const squadAbility: BossAbility = Math.random() < 0.5 ? 'partners' : 'healers'
    enemies = Array.from({ length: count }, () => makeEnemy(squadAbility))
  } else {
    enemies = Array.from({ length: count }, () =>
      makeEnemy(Math.random() < ABILITY_CHANCE ? rand(SOLO_ABILITIES) : undefined)
    )
  }

  // A lone enemy fights at boss stats (2× HP) but keeps normal size and never
  // forces a boss arena (see createBladeState bossStats).
  if (enemies.length === 1) enemies[0]!.bossStats = true

  return {
    enemies,
    shape: rand(NON_CIRCLE_SHAPES)
  }
}

const useDailyChallenge = () => ({
  hasWonToday,
  canPlayToday,
  attemptsToday,
  attemptsLeftToday,
  generateChallenge,
  recordAttempt,
  markDailyChallengeWon
})

export default useDailyChallenge
