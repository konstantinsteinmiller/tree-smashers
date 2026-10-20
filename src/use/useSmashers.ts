// ─── Smasher roster ─────────────────────────────────────────────────────────
//
// Singleton state of the player's smashers: their levels (persisted under
// ROSTER_KEY, rides the cloud save) and which ones are recruited. A smasher is
// recruited once the campaign has reached its `unlockStage` — no purchase, the
// roster simply grows with progress. Levels are bought with coins
// (`smasherLevelCost`); skill slots 2 and 3 open at levels 10 and 20.
//
// The team itself (which smashers fight) lives in useSpinnerConfig's
// `playerTeam`; `teamConfigs()` turns it into battle configs at the current
// levels, the one place the engine gets a player team from.

import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { ROSTER_KEY } from '@/keys'
import { saveDataVersion } from '@/use/useSaveStatus'
import {
  SMASHER_IDS,
  SMASHER_MAX_LEVEL,
  SMASHERS,
  clampSmasherLevel,
  isSmasherId,
  smasherConfig,
  smasherLevelCost,
  type SmasherId
} from '@/data/smasherCatalog'
import type { SpinnerConfig } from '@/types/spinner'

export type RosterLevels = Partial<Record<SmasherId, number>>

/** Parse the stored roster; unknown ids dropped, levels clamped. */
export const parseRoster = (raw: string | null): RosterLevels => {
  const out: RosterLevels = {}
  if (!raw) return out
  try {
    const parsed = JSON.parse(raw)
    const lv = parsed && typeof parsed === 'object' ? parsed.lv : null
    if (lv && typeof lv === 'object') {
      for (const [id, v] of Object.entries(lv)) {
        if (isSmasherId(id) && typeof v === 'number' && Number.isFinite(v)) out[id] = clampSmasherLevel(v)
      }
    }
  } catch { /* fall through */
  }
  return out
}

const loadRoster = (): RosterLevels => {
  try {
    return parseRoster(localStorage.getItem(ROSTER_KEY))
  } catch {
    return {}
  }
}

const levels: Ref<RosterLevels> = ref(loadRoster())

watch(saveDataVersion, () => {
  levels.value = loadRoster()
})

const persist = () => {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify({ lv: levels.value }))
  } catch { /* storage full / blocked — the in-memory roster still works */
  }
}

export const smasherLevel = (id: SmasherId): number => clampSmasherLevel(levels.value[id] ?? 1)

/** Recruited at this best-ever stage? */
export const isSmasherUnlocked = (id: SmasherId, bestStage: number): boolean =>
  bestStage >= SMASHERS[id].unlockStage

/** The smashers recruited at `bestStage`, in catalog order. */
export const unlockedSmashers = (bestStage: number): SmasherId[] =>
  SMASHER_IDS.filter(id => isSmasherUnlocked(id, bestStage))

/** Raise a smasher one level. The caller checks and spends the coins
 *  (`smasherLevelCost(level)`) — this only writes the roster. Returns the new
 *  level, or null at max. */
export const levelUpSmasher = (id: SmasherId): number | null => {
  const current = smasherLevel(id)
  if (current >= SMASHER_MAX_LEVEL || smasherLevelCost(current) === null) return null
  levels.value = { ...levels.value, [id]: current + 1 }
  persist()
  return current + 1
}

/** Battle configs of `team` at the roster's current levels. `skinFor` picks
 *  the colourway per team slot. */
export const teamConfigs = (
  team: readonly SpinnerConfig[],
  skinFor?: (cfg: SpinnerConfig, slot: number) => string | undefined
): SpinnerConfig[] =>
  team.map((c, i) => {
    const id: SmasherId = isSmasherId(c.smasherId) ? c.smasherId : 'bramble'
    return smasherConfig(id, smasherLevel(id), skinFor?.(c, i) ?? c.modelId)
  })

/** Summed smasher levels across the roster — the leaderboard's tie-break
 *  "team power" (monotonic: levels never go down). */
export const rosterPower = computed(() =>
  SMASHER_IDS.reduce((sum, id) => sum + (levels.value[id] ?? 1) - 1, 0)
)

/** Test / reset hook: wipe the roster in memory and storage. */
export const resetRoster = () => {
  levels.value = {}
  try {
    localStorage.removeItem(ROSTER_KEY)
  } catch { /* ignore */
  }
}

const useSmashers = () => ({
  levels,
  smasherLevel,
  levelUpSmasher,
  isSmasherUnlocked,
  unlockedSmashers,
  teamConfigs,
  rosterPower
})

export default useSmashers
