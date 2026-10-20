import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Stage } from '@/use/useSpinnerCampaign'
import { saveDataVersion } from '@/use/useSaveStatus'

// Player tips shown on the lose/win reward screens to nudge struggling
// players toward stronger builds. Tip selection is purely client-side and
// depends on three lightweight counters persisted to localStorage:
//
//   smashers_tip_last_lost_stage — the stage_id of the last campaign loss
//   smashers_tip_losses_on_stage — consecutive losses on that same stage
//   smashers_tip_tank_loss_streak — consecutive losses against a tanky/boss setup
//   smashers_tip_last_shown      — id of the tip the player saw last time, so
//                                  successive lose screens rotate the
//                                  reminder instead of nagging with the same
//                                  one (only kicks in when multiple tips
//                                  qualify for the same screen).
//
// All keys use the `smashers_` prefix so the SaveManager mirrors them to the
// cloud strategy — the nudge follows the player across devices, same
// pattern as the boss rubber-band streak in useSpinnerCampaign.

const LAST_LOST_STAGE_KEY = 'smashers_tip_last_lost_stage'
const LOSSES_ON_STAGE_KEY = 'smashers_tip_losses_on_stage'
const TANK_LOSS_STREAK_KEY = 'smashers_tip_tank_loss_streak'
const LAST_SHOWN_TIP_KEY = 'smashers_tip_last_shown'

const loadInt = (key: string): number => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

const persistInt = (key: string, n: number) => {
  try {
    if (n > 0) localStorage.setItem(key, String(n))
    else localStorage.removeItem(key)
  } catch { /* ignore */
  }
}

const loadStr = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const persistStr = (key: string, val: string | null) => {
  try {
    if (val) localStorage.setItem(key, val)
    else localStorage.removeItem(key)
  } catch { /* ignore */
  }
}

const lastLostStage: Ref<number> = ref(loadInt(LAST_LOST_STAGE_KEY))
const lossesOnStage: Ref<number> = ref(loadInt(LOSSES_ON_STAGE_KEY))
const tankLossStreak: Ref<number> = ref(loadInt(TANK_LOSS_STREAK_KEY))

watch(saveDataVersion, () => {
  lastLostStage.value = loadInt(LAST_LOST_STAGE_KEY)
  lossesOnStage.value = loadInt(LOSSES_ON_STAGE_KEY)
  tankLossStreak.value = loadInt(TANK_LOSS_STREAK_KEY)
})

/** A stage counts as "tanky" if it's a boss or if any enemy has a tanky bottom. */
const isTankyStage = (stage: Stage): boolean => {
  if (stage.isBoss) return true
  return stage.enemyTeam.some(e => e.bottomPartId === 'tanky')
}

/** Call once per campaign battle resolution (excluding PvP/ghost/cheat). */
export const noteCampaignResult = (stage: Stage, result: 'win' | 'lose') => {
  if (result === 'win') {
    if (lossesOnStage.value !== 0) {
      lossesOnStage.value = 0
      persistInt(LOSSES_ON_STAGE_KEY, 0)
    }
    if (lastLostStage.value !== 0) {
      lastLostStage.value = 0
      persistInt(LAST_LOST_STAGE_KEY, 0)
    }
    if (tankLossStreak.value !== 0) {
      tankLossStreak.value = 0
      persistInt(TANK_LOSS_STREAK_KEY, 0)
    }
    return
  }
  if (lastLostStage.value === stage.id) {
    lossesOnStage.value++
  } else {
    lastLostStage.value = stage.id
    lossesOnStage.value = 1
  }
  persistInt(LAST_LOST_STAGE_KEY, lastLostStage.value)
  persistInt(LOSSES_ON_STAGE_KEY, lossesOnStage.value)

  if (isTankyStage(stage)) {
    tankLossStreak.value++
  } else {
    tankLossStreak.value = 0
  }
  persistInt(TANK_LOSS_STREAK_KEY, tankLossStreak.value)
}

export type TipId =
  | 'levelUp'
  | 'tankBreaker'
  | 'teamMix'
  | 'arenaWall'

export interface TipPickResult {
  /** The tip to render now, or null if no tip qualifies. */
  tip: TipId | null
  /** All tips that qualified — used by the caller for on-screen rotation. */
  pool: TipId[]
}

/** Chance the general arena-wall tip enters the lose-screen pool. */
const GENERAL_TIP_CHANCE = 0.40

/**
 * Build the pool of qualifying lose-screen tips for the current campaign
 * stage and pick the first one to show.
 *
 * Priority order inside the pool:
 *   1. Shock arena → teleporter skin tip
 *   2. ≥2 consecutive losses against tanky setups → hard-hitting smashers tip
 *   3. ≥2 losses on the same stage → level-up-your-smashers tip
 *   4. General arena-wall tip — enters the pool on a 40% roll regardless
 *      of conditions, giving every lose screen a chance at a build hint.
 *
 * Rotation: if the highest-priority pick matches the previously shown tip
 * AND the pool has alternatives, fall to the next one so consecutive lose
 * screens never repeat the same nudge. Single-element pools always show
 * that tip (there's nothing else to rotate to).
 *
 * Returns the chosen tip and the full pool — callers use the pool to cycle
 * through tips on-screen while the lose overlay stays open.
 */
export const pickLoseScreenTip = (stage: Stage): TipPickResult => {
  const pool: TipId[] = []
  if (tankLossStreak.value >= 2) pool.push('tankBreaker')
  if (lossesOnStage.value >= 2) pool.push('levelUp')
  if (Math.random() < GENERAL_TIP_CHANCE) pool.push('arenaWall')

  const first = pool[0]
  if (!first) return { tip: null, pool: [] }

  const last = loadStr(LAST_SHOWN_TIP_KEY) as TipId | null
  let chosen: TipId = first
  if (pool.length > 1 && last && first === last) {
    chosen = pool[1] as TipId
  }
  return { tip: chosen, pool }
}

/** Win-screen tip: mix a fragile striker with a tank, shown 25% of the time. */
export const pickWinScreenTip = (): TipId | null => {
  return Math.random() < 0.25 ? 'teamMix' : null
}

/** Persist the last tip the player saw so the next screen can rotate away from it. */
export const markTipShown = (tip: TipId) => {
  persistStr(LAST_SHOWN_TIP_KEY, tip)
}

export const tipI18nKey = (id: TipId): string => `tips.${id}`

const useTips = () => ({
  lossesOnStage,
  tankLossStreak,
  lastLostStage,
  noteCampaignResult,
  pickLoseScreenTip,
  pickWinScreenTip,
  markTipShown,
  tipI18nKey
})

export default useTips
