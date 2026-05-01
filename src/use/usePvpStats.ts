// ─── PvP Stats & Honor Points ──────────────────────────────────────────────
//
// Tracks a unique player identity, PvP win/loss record, and honor points.
// Honor points are earned by winning PvP matches and can be spent on skins
// via the honor track in the Battle Pass.
//
// Persisted in localStorage (automatically mirrored to CrazyGames SDK data
// module when the SDK is active).

import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { crazyPlayerName } from '@/use/useCrazyGames'
import type { SpinnerModelId } from '@/use/useModels'
import { saveDataVersion } from '@/use/useSaveStatus'

// ─── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'spinner_pvp_stats'

/** Base honor points for a PvP win (fair game / level-1 match). */
export const HONOR_BASE_WIN = 100

/**
 * Honor points required per honor-track stage.
 * 3 fair-game wins (3 × 100 = 300) unlocks stage 1 → first skin.
 */
export const HONOR_PER_STAGE = 300

/** Total number of stages on the honor track (each grants a skin). */
export const HONOR_TOTAL_STAGES = 3

// ─── State ─────────────────────────────────────────────────────────────────

interface PvpStatsState {
  /** Unique player identifier (UUID or CrazyGames username). */
  playerId: string
  /** Total PvP wins. */
  wins: number
  /** Total PvP losses. */
  losses: number
  /** Accumulated honor points. */
  honor: number
  /** Number of honor-track stages fully unlocked (0..HONOR_TOTAL_STAGES). */
  honorStages: number
  /** 1-based stage indices the player has already claimed on the honor track. */
  claimedHonorStages: number[]
  /** Maps honor stage number → skin model id that was awarded. */
  claimedHonorSkins: Record<number, SpinnerModelId>
  /** Maps honor stage number → skin model id previewed (persisted). */
  offeredHonorSkins: Record<number, SpinnerModelId>
}

const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

const defaultState = (): PvpStatsState => ({
  playerId: crazyPlayerName.value || generateUUID(),
  wins: 0,
  losses: 0,
  honor: 0,
  honorStages: 0,
  claimedHonorStages: [],
  claimedHonorSkins: {},
  offeredHonorSkins: {}
})

const loadState = (): PvpStatsState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p?.playerId === 'string' && typeof p?.wins === 'number') {
        return {
          playerId: p.playerId,
          wins: Math.max(0, p.wins),
          losses: Math.max(0, p.losses ?? 0),
          honor: Math.max(0, p.honor ?? 0),
          honorStages: Math.max(0, Math.min(HONOR_TOTAL_STAGES, p.honorStages ?? 0)),
          claimedHonorStages: Array.isArray(p.claimedHonorStages)
            ? p.claimedHonorStages.filter(
              (n: unknown) => typeof n === 'number' && n >= 1 && n <= HONOR_TOTAL_STAGES
            )
            : [],
          claimedHonorSkins: p.claimedHonorSkins ?? {},
          offeredHonorSkins: p.offeredHonorSkins ?? {}
        }
      }
    }
  } catch { /* fall through */
  }
  return defaultState()
}

const state: Ref<PvpStatsState> = ref(loadState())

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  state.value = loadState()
})

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
}

// ─── Honor Calculation ─────────────────────────────────────────────────────

/**
 * Calculate honor points earned from a PvP win.
 *
 * - Fair game (level 1 or equal levels): HONOR_BASE_WIN (100)
 * - Under-leveled winner (opponent stronger): bonus up to +100
 * - Over-leveled winner (opponent weaker):  penalty down to 25 minimum
 *
 * @param myTotalLevel  Sum of all part levels on winner's team
 * @param enemyTotalLevel Sum of all part levels on loser's team
 */
export const calcHonorPoints = (myTotalLevel: number, enemyTotalLevel: number): number => {
  if (myTotalLevel <= 0 && enemyTotalLevel <= 0) return HONOR_BASE_WIN // both level 1

  const diff = enemyTotalLevel - myTotalLevel // positive = opponent was stronger
  // Scale: each level of difference adds/removes ~10 honor
  const bonus = Math.round(diff * 10)
  return Math.max(25, Math.min(200, HONOR_BASE_WIN + bonus))
}

// ─── Honor XP Accrual ──────────────────────────────────────────────────────

const addHonor = (amount: number) => {
  if (amount <= 0) return
  state.value.honor += amount
  // Check if we unlocked new stages
  while (
    state.value.honor >= HONOR_PER_STAGE &&
    state.value.honorStages < HONOR_TOTAL_STAGES
    ) {
    state.value.honor -= HONOR_PER_STAGE
    state.value.honorStages++
  }
  // Cap overflow once maxed
  if (state.value.honorStages >= HONOR_TOTAL_STAGES) {
    state.value.honor = Math.min(state.value.honor, HONOR_PER_STAGE)
  }
  saveState()
}

// ─── Public API ────────────────────────────────────────────────────────────

const recordPvpWin = (honorPoints: number) => {
  state.value.wins++
  addHonor(honorPoints)
  saveState()
}

const recordPvpLoss = () => {
  state.value.losses++
  saveState()
}

// ─── Honor Track Claims ────────────────────────────────────────────────────

const isHonorStageClaimed = (stage: number): boolean =>
  state.value.claimedHonorStages.includes(stage)

const isHonorStageUnlocked = (stage: number): boolean =>
  stage <= state.value.honorStages

const claimHonorStage = (stage: number, skin?: SpinnerModelId): boolean => {
  if (stage < 1 || stage > HONOR_TOTAL_STAGES) return false
  if (stage > state.value.honorStages) return false
  if (state.value.claimedHonorStages.includes(stage)) return false
  state.value.claimedHonorStages = [...state.value.claimedHonorStages, stage]
  if (skin) {
    state.value.claimedHonorSkins = { ...state.value.claimedHonorSkins, [stage]: skin }
  }
  saveState()
  return true
}

/** Reset honor track progress (called when battle pass season resets).
 *  Preserves win/loss record and player identity. */
export const resetHonorTrack = () => {
  state.value.honor = 0
  state.value.honorStages = 0
  state.value.claimedHonorStages = []
  state.value.claimedHonorSkins = {}
  state.value.offeredHonorSkins = {}
  saveState()
}

const pendingHonorClaims = computed(() => {
  let n = 0
  for (let i = 1; i <= state.value.honorStages; i++) {
    if (!state.value.claimedHonorStages.includes(i)) n++
  }
  return n
})

// ─── Derived ───────────────────────────────────────────────────────────────

const playerId = computed(() => state.value.playerId)
const wins = computed(() => state.value.wins)
const losses = computed(() => state.value.losses)
const honor = computed(() => state.value.honor)
const honorStages = computed(() => state.value.honorStages)
const isHonorMaxed = computed(() => state.value.honorStages >= HONOR_TOTAL_STAGES)
const honorProgressFraction = computed(() =>
  isHonorMaxed.value ? 1 : Math.min(1, state.value.honor / HONOR_PER_STAGE)
)

// ─── Export ────────────────────────────────────────────────────────────────

export default function usePvpStats() {
  return {
    // state
    playerId,
    wins,
    losses,
    honor,
    honorStages,
    isHonorMaxed,
    honorProgressFraction,
    pendingHonorClaims,
    // actions
    recordPvpWin,
    recordPvpLoss,
    calcHonorPoints,
    // honor track
    isHonorStageClaimed,
    isHonorStageUnlocked,
    claimHonorStage,
    claimedHonorSkins: computed(() => state.value.claimedHonorSkins),
    persistedHonorOffers: computed(() => state.value.offeredHonorSkins),
    saveOfferedHonorSkins: (offers: Record<number, SpinnerModelId>) => {
      state.value.offeredHonorSkins = offers
      saveState()
    }
  }
}
