import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import {
  SKINS_PER_TOP, SPECIAL_SKINS,
  isModelFullyOwned,
  buySkin,
  type SpinnerModelId
} from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import { resetHonorTrack } from '@/use/usePvpStats'
import { saveDataVersion } from '@/use/useSaveStatus'

/**
 * Battle Pass progression. 50 stages, 100 xp per stage. Win/loss events
 * feed xp:
 *   - campaign win      → 50 xp (half a stage)
 *   - leaderboard (ghost) win → 25 xp (quarter of a stage)
 *   - any loss          → 12.5 xp (eighth of a stage)
 *
 * Rewards are mostly coins on a linear ramp (30 at stage 1 → 300 at
 * stage 50, rounded to nearest 5), with a handful of "skin" slots that
 * grant an unowned skin at claim time — falling back to coins if no
 * unowned skin remains in the catalog.
 *
 * Persisted in localStorage so progression survives reloads. Implemented
 * as a module-singleton composable so multiple components can read and
 * mutate the same reactive state without prop-drilling.
 */

// ─── Tunables ───────────────────────────────────────────────────────────────

export const BP_TOTAL_STAGES = 100
export const BP_XP_PER_STAGE = 100
/** Battle pass season length in days. After this, all progress resets. */
export const BP_SEASON_DAYS = 30

export const BP_XP_CAMPAIGN_WIN = 50        // 1/2 of a stage
export const BP_XP_LEADERBOARD_WIN = 25     // 1/4 of a stage
export const BP_XP_LOSS = 12.5              // 1/8 of a stage

/** 1-based stage indices that grant a skin instead of coins. Spaced every
 *  10 levels across the extended 100-stage track so the season still has
 *  the same "skin every ten levels" cadence players learned in the 50-
 *  stage version. */
export const BP_SKIN_STAGES = new Set<number>([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])

const STORAGE_KEY = 'spinner_battle_pass'

// ─── State ──────────────────────────────────────────────────────────────────

interface BattlePassState {
  /** XP banked into the currently-filling stage (0 .. BP_XP_PER_STAGE). */
  xp: number
  /** Number of stages that have fully completed — i.e. are unlocked
   *  and eligible to be claimed. 0 means nothing unlocked yet. */
  unlockedStages: number
  /** 1-based stage indices the player has already collected. */
  claimedStages: number[]
  /** Maps stage number → skin model id for skin stages that were claimed. */
  claimedSkins: Record<number, SpinnerModelId>
  /** Maps stage number → skin model id previewed (persisted across sessions). */
  offeredSkins: Record<number, SpinnerModelId>
  /** ISO date string when the current season started (first XP gain). */
  seasonStartedAt: string | null
}

const defaultState = (): BattlePassState => ({
  xp: 0,
  unlockedStages: 0,
  claimedStages: [],
  claimedSkins: {},
  offeredSkins: {},
  seasonStartedAt: null
})

/** Days remaining until the current season resets (null if no season active). */
const daysUntilSeasonReset = (startedAt: string | null): number | null => {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const elapsed = Math.floor((now - start) / (1000 * 60 * 60 * 24))
  const remaining = BP_SEASON_DAYS - elapsed
  return remaining > 0 ? remaining : 0
}

const isSeasonExpired = (startedAt: string | null): boolean => {
  if (!startedAt) return false
  return daysUntilSeasonReset(startedAt) === 0
}

const loadState = (): BattlePassState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (
        typeof parsed?.xp === 'number' &&
        typeof parsed?.unlockedStages === 'number' &&
        Array.isArray(parsed?.claimedStages)
      ) {
        const loaded: BattlePassState = {
          xp: parsed.xp,
          unlockedStages: Math.max(0, Math.min(BP_TOTAL_STAGES, parsed.unlockedStages)),
          claimedStages: parsed.claimedStages.filter(
            (n: unknown) => typeof n === 'number' && n >= 1 && n <= BP_TOTAL_STAGES
          ),
          claimedSkins: parsed.claimedSkins ?? {},
          offeredSkins: parsed.offeredSkins ?? {},
          seasonStartedAt: parsed.seasonStartedAt ?? null
        }
        // Season expired — reset everything
        if (isSeasonExpired(loaded.seasonStartedAt)) {
          seasonResetPending = true
          return defaultState()
        }
        return loaded
      }
    }
  } catch { /* fall through */
  }
  return defaultState()
}

/** Deferred flag — honor track reset runs on first composable access
 *  to avoid circular import issues at module load time. */
let seasonResetPending = false

const state: Ref<BattlePassState> = ref(loadState())

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  state.value = loadState()
})

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
}

// ─── Reward Table ───────────────────────────────────────────────────────────

/**
 * Coin value for a given stage — piecewise linear: 30 → 300 across
 * stages 1..50, then 300 → 500 across stages 50..100. Rounded to the
 * nearest 5 for tidy UI numbers. Skin stages return the same coin value
 * as a *fallback* if no unowned skin remains.
 */
export const bpCoinReward = (stage: number): number => {
  const clamped = Math.max(1, Math.min(BP_TOTAL_STAGES, stage))
  const raw = clamped <= 50
    ? 30 + ((clamped - 1) * 270) / 49
    : 300 + ((clamped - 50) * 200) / 50
  return Math.round(raw / 5) * 5
}

export const bpIsSkinStage = (stage: number): boolean => BP_SKIN_STAGES.has(stage)

// ─── Skin helpers (mirrors DailyRewards) ───────────────────────────────────

const unownedSkinModelIds = (): SpinnerModelId[] => {
  const result: SpinnerModelId[] = []
  const seen = new Set<string>()
  for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    for (const modelId of SKINS_PER_TOP[topPartId]) {
      if (seen.has(modelId)) continue
      seen.add(modelId)
      if (SPECIAL_SKINS.has(modelId)) continue
      if (!isModelFullyOwned(modelId)) result.push(modelId)
    }
  }
  return result
}

const unlockSkinEverywhere = (modelId: SpinnerModelId) => {
  for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    if (SKINS_PER_TOP[topPartId].includes(modelId)) {
      buySkin(topPartId, modelId)
    }
  }
}

// ─── XP accrual ─────────────────────────────────────────────────────────────

const { addCoins } = useSpinnerConfig()

const addXp = (amount: number) => {
  if (amount <= 0) return
  // Check for season expiry before adding XP
  if (isSeasonExpired(state.value.seasonStartedAt)) {
    state.value = defaultState()
    resetHonorTrack()
    saveState()
  }
  if (state.value.unlockedStages >= BP_TOTAL_STAGES) return
  // Start season clock on first XP gain
  if (!state.value.seasonStartedAt) {
    state.value.seasonStartedAt = new Date().toISOString().slice(0, 10)
  }
  state.value.xp += amount
  while (
    state.value.xp >= BP_XP_PER_STAGE &&
    state.value.unlockedStages < BP_TOTAL_STAGES
    ) {
    state.value.xp -= BP_XP_PER_STAGE
    state.value.unlockedStages++
  }
  if (state.value.unlockedStages >= BP_TOTAL_STAGES) state.value.xp = 0
  saveState()
}

const awardCampaignWin = () => addXp(BP_XP_CAMPAIGN_WIN)
const awardLeaderboardWin = () => addXp(BP_XP_LEADERBOARD_WIN)
const awardLoss = () => addXp(BP_XP_LOSS)

// ─── Claim ──────────────────────────────────────────────────────────────────

export interface ClaimResult {
  stage: number
  coins: number
  skin: SpinnerModelId | null
}

const claimStage = (stage: number, offeredSkin?: SpinnerModelId | null): ClaimResult | null => {
  if (stage < 1 || stage > BP_TOTAL_STAGES) return null
  if (stage > state.value.unlockedStages) return null
  if (state.value.claimedStages.includes(stage)) return null

  let coins = 0
  let skin: SpinnerModelId | null = null

  if (bpIsSkinStage(stage)) {
    const pool = unownedSkinModelIds()
    // Prefer the skin that was previewed to the player, fall back to random
    if (offeredSkin && pool.includes(offeredSkin)) {
      skin = offeredSkin
    } else if (pool.length > 0) {
      skin = pool[Math.floor(Math.random() * pool.length)]!
    }
    if (skin) {
      unlockSkinEverywhere(skin)
      state.value.claimedSkins = { ...state.value.claimedSkins, [stage]: skin }
    } else {
      // Fallback: no unowned skins left — pay out the linear coin value
      // so the stage slot never feels empty.
      coins = bpCoinReward(stage)
      addCoins(coins)
    }
  } else {
    coins = bpCoinReward(stage)
    addCoins(coins)
  }

  state.value.claimedStages = [...state.value.claimedStages, stage]
  saveState()
  return { stage, coins, skin }
}

// ─── Derived ────────────────────────────────────────────────────────────────

const currentXp = computed(() => state.value.xp)
const unlockedStages = computed(() => state.value.unlockedStages)
const claimedStages = computed(() => state.value.claimedStages)
const isMaxed = computed(() => state.value.unlockedStages >= BP_TOTAL_STAGES)

/** Number of stages that are unlocked but not yet claimed — drives the
 *  "collect me" bounce hint on the open-modal button. */
const pendingClaimCount = computed(() => {
  let n = 0
  for (let i = 1; i <= state.value.unlockedStages; i++) {
    if (!state.value.claimedStages.includes(i)) n++
  }
  return n
})

const hasUnclaimedReward = computed(() => pendingClaimCount.value > 0)

/** Days remaining until the season resets (null if season not started yet). */
const daysUntilReset = computed(() => daysUntilSeasonReset(state.value.seasonStartedAt))

const isStageClaimed = (stage: number): boolean =>
  state.value.claimedStages.includes(stage)

const isStageUnlocked = (stage: number): boolean =>
  stage <= state.value.unlockedStages

// ─── Public API ─────────────────────────────────────────────────────────────

export default function useBattlePass() {
  // Flush deferred honor-track reset (avoids circular import at module load)
  if (seasonResetPending) {
    seasonResetPending = false
    resetHonorTrack()
    saveState()
  }
  return {
    // state
    state,
    currentXp,
    unlockedStages,
    claimedStages,
    isMaxed,
    hasUnclaimedReward,
    pendingClaimCount,
    daysUntilReset,
    claimedSkins: computed(() => state.value.claimedSkins),
    persistedOffers: computed(() => state.value.offeredSkins),
    saveOfferedSkins: (offers: Record<number, SpinnerModelId>) => {
      state.value.offeredSkins = offers
      saveState()
    },
    // queries
    isStageClaimed,
    isStageUnlocked,
    bpCoinReward,
    bpIsSkinStage,
    // xp events (called by game-over handlers)
    awardCampaignWin,
    awardLeaderboardWin,
    awardLoss,
    // claiming
    claimStage
  }
}
