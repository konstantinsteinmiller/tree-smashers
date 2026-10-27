// ─── Smasher roster ─────────────────────────────────────────────────────────
//
// Singleton state of the player's smashers: their levels (persisted under
// ROSTER_KEY, rides the cloud save) and which ones are recruited. A smasher is
// recruited once the campaign has reached its `unlockStage` — no purchase, the
// roster simply grows with progress — except the premium smashers from Tuskar
// onwards, which then still need their rewarded-ad (or coin) unlock
// (`isSmasherRecruited`, src/use/premiumSmashers.ts). Levels are bought with coins
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
  RELEASED_SMASHER_IDS,
  SMASHER_IDS,
  isReleasedSmasher,
  SMASHERS,
  clampSmasherLevel,
  isSmasherId,
  smasherConfig,
  smasherLevelCost,
  type SmasherId
} from '@/data/smasherCatalog'
import type { SpinnerConfig } from '@/types/spinner'
import { isPremiumOwned } from '@/use/premiumSmashers'

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

/** Catch-up share (#playtest-1-15): a smasher the player has never levelled
 *  joins at this share of the mean of the roster's three highest levels, so a
 *  legendary recruited at stage 72+ is not a useless Lv 1 next to a Lv 30
 *  team. Levelling it once stores the level (it stops floating). */
export const SMASHER_CATCH_UP_SHARE = 0.75

/** Only smashers recruited past this stage catch up (the early cast is levelled
 *  from Lv 1 on purpose — the tutorial's level-up lessons use it). */
export const SMASHER_CATCH_UP_FROM_STAGE = 30

/** Level an unlevelled smasher starts at for a stored roster (pure). */
export const catchUpLevel = (roster: RosterLevels): number => {
  const top = Object.values(roster)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => b - a)
    .slice(0, 3)
  if (top.length === 0) return 1
  const mean = top.reduce((s, v) => s + v, 0) / top.length
  return clampSmasherLevel(Math.floor(mean * SMASHER_CATCH_UP_SHARE))
}

export const smasherLevel = (id: SmasherId): number =>
  clampSmasherLevel(levels.value[id] ?? (SMASHERS[id].unlockStage > SMASHER_CATCH_UP_FROM_STAGE ? catchUpLevel(levels.value) : 1))

/** Recruited at this best-ever stage? Released smashers only (release gate,
 *  src/data/smasherCatalog.ts): a held-back smasher's stage recruits nothing. */
export const isSmasherUnlocked = (id: SmasherId, bestStage: number): boolean =>
  isReleasedSmasher(id) && bestStage >= SMASHERS[id].unlockStage

/** The smashers recruited at `bestStage`, in catalog order. */
export const unlockedSmashers = (bestStage: number): SmasherId[] =>
  SMASHER_IDS.filter(id => isSmasherUnlocked(id, bestStage))

/** In the PLAYER's roster: stage reached AND — for a premium smasher (Tuskar
 *  onwards, src/data/premiumSmashers.ts) — unlocked with its rewarded ad or
 *  coins. `isSmasherUnlocked` stays the stage-only answer (bot pools, "could a
 *  player around this stage field it"). */
export const isSmasherRecruited = (id: SmasherId, bestStage: number): boolean =>
  isReleasedSmasher(id)
    ? isSmasherUnlocked(id, bestStage) && isPremiumOwned(id, bestStage)
    // Unreleased (release gate): only a save that already OWNS it keeps it —
    // grandfathered, nothing is taken away. Never newly recruited.
    : bestStage >= SMASHERS[id].unlockStage && isPremiumOwned(id, bestStage)

/** The smashers in the player's roster at `bestStage`, in catalog order. */
export const recruitedSmashers = (bestStage: number): SmasherId[] =>
  SMASHER_IDS.filter(id => isSmasherRecruited(id, bestStage))

/** Raise a smasher one level. The caller checks and spends the coins
 *  (`smasherLevelCost(level)`) — this only writes the roster. Returns the new
 *  level, or null at the technical sanity ceiling (SMASHER_LEVEL_SANITY_MAX). */
export const levelUpSmasher = (id: SmasherId): number | null => {
  const current = smasherLevel(id)
  // No gameplay cap: only the technical sanity ceiling (cost null) stops it.
  if (smasherLevelCost(current) === null) return null
  levels.value = { ...levels.value, [id]: current + 1 }
  persist()
  return current + 1
}

/** The first `size` smasher ids of a team, padded when the stored picks are
 *  fewer (an old two-smasher save that just opened slot 3, a PvP lobby with a
 *  bigger team size): recruited smashers first, in catalog order, then any —
 *  never a duplicate. Deterministic. */
export const fieldTeamIds = (picks: readonly SmasherId[], size: number, bestStage = Infinity): SmasherId[] => {
  const out: SmasherId[] = []
  for (const id of picks) if (out.length < size && !out.includes(id)) out.push(id)
  for (const pool of [recruitedSmashers(bestStage), RELEASED_SMASHER_IDS]) {
    for (const id of pool) if (out.length < size && !out.includes(id)) out.push(id)
  }
  return out
}

/** `fieldTeamIds` over stored team configs → smasher configs (level 1: the
 *  battle level is refilled by `teamConfigs`), each kept pick with its skin. */
export const fieldTeam = (team: readonly SpinnerConfig[], size: number, bestStage = Infinity): SpinnerConfig[] => {
  const picks = team.map(c => (isSmasherId(c.smasherId) ? c.smasherId : 'bramble'))
  return fieldTeamIds(picks, size, bestStage).map(id => {
    const kept = team.find(c => c.smasherId === id)
    return smasherConfig(id, 1, kept?.modelId)
  })
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
  isSmasherRecruited,
  recruitedSmashers,
  teamConfigs,
  fieldTeam,
  fieldTeamIds,
  rosterPower
})

export default useSmashers
