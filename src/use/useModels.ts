import { smasherPortraitUrl } from '@/smashers/smasherAtlas'
import type { SmasherId } from '@/data/smasherCatalog'
import { isSmasherSkin } from '@/data/smasherSkinCatalog'
import { type Element, ELEMENTS } from '@/utils/enums'
import { isCampaignTest, isDbInitialized, isDebug } from '@/use/useMatch'
import useUser from '@/use/useUser'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TopPartId } from '@/types/spinner'
import { SKINS_KEY, SKIN_AD_PROGRESS_KEY } from '@/keys'
import { saveDataVersion } from '@/use/useSaveStatus'
import {
  SKINS_PER_TOP,
  SPECIAL_SKINS,
  SKIN_COST,
  SPECIAL_SKIN_COST,
  SPINNER_MODEL_IDS,
  AD_UNLOCK_SKINS,
  SKIN_AD_UNLOCK_ADS,
  AD_SKIN_COIN_COST,
  isAdUnlockSkin,
  isCoinPurchasable,
  skinCost,
  TROPHY_SKINS,
  isEarnOnlySkin,
  offerableSkinsForTop,
  topPartOfSkin,
  getOfferableSkinPool as buildOfferableSkinPool,
  type SpinnerModelId
} from '@/data/skinCatalog'

/** Portrait (data URL) of a skin: the smasher wearing that colourway. The
 *  smasher defaults to one of the skin's top part (`smasherForSkin`); pass
 *  `smasherId` when the caller knows it. The spinner artwork files are gone —
 *  every portrait is drawn by the smasher rig (src/smashers). */
export const modelImgPath = (id: string, smasherId?: SmasherId, boss = false): string =>
  smasherPortraitUrl(smasherId, id, boss)

// Re-export the pure data + types from the catalog so existing imports
// (`@/use/useModels`) keep compiling. The catalog has zero composable
// dependencies, which makes it unit-testable in isolation — see
// `tests/useBattlePassSkinClaim.test.ts`.
export {
  SKINS_PER_TOP,
  SPECIAL_SKINS,
  SKIN_COST,
  SPECIAL_SKIN_COST,
  SPINNER_MODEL_IDS,
  AD_UNLOCK_SKINS,
  SKIN_AD_UNLOCK_ADS,
  AD_SKIN_COIN_COST,
  isAdUnlockSkin,
  isCoinPurchasable,
  skinCost,
  TROPHY_SKINS,
  isEarnOnlySkin
}
export type { SpinnerModelId }

/** Pick a random skin from the available pool for a given top part. Never an
 *  earn-only boss trophy: those are worn only by the bosses that grant them. */
export const getRandomSkinForTop = (topPartId: TopPartId): SpinnerModelId => {
  const skins = offerableSkinsForTop(topPartId)
  return skins[Math.floor(Math.random() * skins.length)] as SpinnerModelId
}

// ─── Skin Persistence (singleton) ───────────────────────────────────────────

// SKINS_KEY imported from `@/keys` at the top of this file (single source of truth shared with SaveMergePolicy).
const SELECTED_SKINS_KEY = 'smashers_selected_skins'
const PICKER_OPENED_KEY = 'smashers_skin_picker_opened'

const loadOwnedSkins = (): Set<string> => {
  try {
    const raw = localStorage.getItem(SKINS_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* fall through */
  }
  return new Set()
}

const loadSelectedSkins = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(SELECTED_SKINS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* fall through */
  }
  return {}
}

const loadPickerOpened = (): Set<string> => {
  try {
    const raw = localStorage.getItem(PICKER_OPENED_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* fall through */
  }
  return new Set()
}

const loadSkinAdProgress = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(SKIN_AD_PROGRESS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    }
  } catch { /* fall through */
  }
  return {}
}

const ownedSkins: Ref<Set<string>> = ref(loadOwnedSkins())
const selectedSkins: Ref<Record<string, string>> = ref(loadSelectedSkins())
const pickerOpenedParts: Ref<Set<string>> = ref(loadPickerOpened())
const skinAdProgress: Ref<Record<string, number>> = ref(loadSkinAdProgress())

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  ownedSkins.value = loadOwnedSkins()
  selectedSkins.value = loadSelectedSkins()
  pickerOpenedParts.value = loadPickerOpened()
  skinAdProgress.value = loadSkinAdProgress()
})

const saveOwnedSkins = () => {
  localStorage.setItem(SKINS_KEY, JSON.stringify([...ownedSkins.value]))
}

const saveSelectedSkins = () => {
  localStorage.setItem(SELECTED_SKINS_KEY, JSON.stringify(selectedSkins.value))
}

const savePickerOpened = () => {
  localStorage.setItem(PICKER_OPENED_KEY, JSON.stringify([...pickerOpenedParts.value]))
}

/** Mark that the player has opened the skin picker for the given top part. */
export const markSkinPickerOpened = (topPartId: TopPartId) => {
  if (pickerOpenedParts.value.has(topPartId)) return
  pickerOpenedParts.value = new Set([...pickerOpenedParts.value, topPartId])
  savePickerOpened()
}

export const wasSkinPickerOpened = (topPartId: TopPartId): boolean =>
  pickerOpenedParts.value.has(topPartId)

/** All currently-owned skins for a top part (in declared order). */
export const ownedSkinsForTop = (topPartId: TopPartId): SpinnerModelId[] =>
  SKINS_PER_TOP[topPartId].filter(id => isSkinOwned(topPartId, id))

/** True if at least one skin in this top part's catalog is not yet owned —
 *  counting only skins the player can get from the shop (an unowned boss
 *  trophy must not make the picker's "+" bounce). */
export const hasUnownedSkinsForTop = (topPartId: TopPartId): boolean =>
  offerableSkinsForTop(topPartId).some(id => !isSkinOwned(topPartId, id))

/** Default skins (first in each list) are always owned */
export const isSkinOwned = (topPartId: TopPartId, modelId: SpinnerModelId): boolean => {
  if (SKINS_PER_TOP[topPartId][0] === modelId) return true
  return ownedSkins.value.has(`${topPartId}:${modelId}`)
}

/** True if a model id is owned in every top part that lists it — meaning it
 *  cannot be meaningfully rewarded again. Use this to guard reward pools.
 *  Also catches stale localStorage entries (e.g. "round:ice" when ice is
 *  only cataloged under "star") so already-acquired skins are never re-offered. */
export const isModelFullyOwned = (modelId: SpinnerModelId): boolean => {
  // Fast path: check if any owned entry ends with this model id
  for (const key of ownedSkins.value) {
    if (key.endsWith(`:${modelId}`)) return true
  }
  // Check each catalog entry (covers default skins which aren't in ownedSkins)
  for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    if (SKINS_PER_TOP[topPartId].includes(modelId) && !isSkinOwned(topPartId, modelId)) {
      return false
    }
  }
  return true
}

export const buySkin = (topPartId: TopPartId, modelId: SpinnerModelId): boolean => {
  if (isSkinOwned(topPartId, modelId)) return false
  ownedSkins.value = new Set([...ownedSkins.value, `${topPartId}:${modelId}`])
  saveOwnedSkins()
  return true
}

/**
 * Grant an earn-only boss trophy skin (bosses-100-feature.md §3.5) — THE way
 * a trophy enters a save. Call it on the boss win (BW6's trophy card, after
 * the roulette Continue); the caller skips cheat / ghost / league battles.
 *
 * Idempotent: returns true only when this call unlocked the skin, false when
 * it was already owned or is not a trophy skin (nothing is written then).
 * Persists through `buySkin` → `smashers_owned_skins` (SKINS_KEY), the key the
 * save system syncs to the cloud and merges (SaveMergePolicy).
 */
export const grantTrophySkin = (modelId: SpinnerModelId): boolean => {
  if (!isEarnOnlySkin(modelId)) return false
  const topPartId = topPartOfSkin(modelId)
  if (!topPartId) return false
  return buySkin(topPartId, modelId)
}

/** Grant every trophy of an encounter (`BossEncounter.trophySkins`); returns
 *  only the ones this call newly unlocked, in order — what the trophy card shows. */
export const grantTrophySkins = (modelIds: readonly SpinnerModelId[]): SpinnerModelId[] =>
  modelIds.filter(id => grantTrophySkin(id))

/** Shop purchase with coins. On a session with rewarded ads every skin is an
 *  ad unlock (`isAdUnlockSkin`), so this refuses — no coin path can grant
 *  one there; without rewarded ads every non-trophy skin sells for `skinCost`.
 *  The caller deducts the coins only after this returns true. Reward systems
 *  (chest, wheel, BP, daily) grant through `buySkin` directly and are
 *  unaffected. `adsBuild`: the skin shop passes `rewardedUnlocksAvailable`
 *  (useAds); omitted it is the build constant. */
export const purchaseSkinWithCoins = (
  topPartId: TopPartId,
  modelId: SpinnerModelId,
  adsBuild?: boolean
): boolean => {
  if (!isCoinPurchasable(modelId, adsBuild)) return false
  return buySkin(topPartId, modelId)
}

/** Settle ad progress saved under the old 3-ad rule. With ONE ad per skin,
 *  any stored watch already pays for the skin, so every ad-unlock skin with
 *  progress is granted (under each top part that lists it) and its entry is
 *  cleared; entries for owned / unknown skins are dropped too. Called when
 *  the skin shop opens — an explicit player moment, never mid-hydrate — and
 *  `recordSkinAdWatch` unlocks on the next ad regardless. Returns the model
 *  ids it granted. */
export const settleSkinAdProgress = (): SpinnerModelId[] => {
  const entries = Object.keys(skinAdProgress.value)
  if (entries.length === 0) return []
  const granted: SpinnerModelId[] = []
  for (const id of entries) {
    const modelId = id as SpinnerModelId
    if (!AD_UNLOCK_SKINS.has(modelId) || skinAdProgressFor(modelId) < SKIN_AD_UNLOCK_ADS) continue
    for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
      if (SKINS_PER_TOP[topPartId].includes(modelId) && buySkin(topPartId, modelId)) {
        if (!granted.includes(modelId)) granted.push(modelId)
      }
    }
  }
  skinAdProgress.value = {}
  localStorage.setItem(SKIN_AD_PROGRESS_KEY, JSON.stringify({}))
  return granted
}

/** Rewarded ads already watched towards an ad-unlock skin (0 … SKIN_AD_UNLOCK_ADS). */
export const skinAdProgressFor = (modelId: SpinnerModelId): number =>
  Math.max(0, Math.min(SKIN_AD_UNLOCK_ADS, Math.floor(Number(skinAdProgress.value[modelId]) || 0)))

/** Credit ONE completed rewarded ad to a skin. Call it only after
 *  `showRewardedAd` resolved true. Unlocks the skin on the
 *  `SKIN_AD_UNLOCK_ADS`-th watch (today: the first; legacy partial progress
 *  never delays it) and returns true then. Any shop skin qualifies (owner rule
 *  2026-10-21: every purchasable skin is one ad); an earn-only boss trophy, a
 *  free default, a skin not listed under `topPartId` or an already-owned one
 *  is a no-op returning false. */
export const recordSkinAdWatch = (topPartId: TopPartId, modelId: SpinnerModelId): boolean => {
  if (!isAdUnlockSkin(modelId, true)) return false
  if (!SKINS_PER_TOP[topPartId]?.includes(modelId) && !isSmasherSkin(modelId)) return false
  if (isSkinOwned(topPartId, modelId)) return false
  const next = skinAdProgressFor(modelId) + 1
  if (next >= SKIN_AD_UNLOCK_ADS) {
    const rest = { ...skinAdProgress.value }
    delete rest[modelId]
    skinAdProgress.value = rest
    localStorage.setItem(SKIN_AD_PROGRESS_KEY, JSON.stringify(rest))
    return buySkin(topPartId, modelId)
  }
  skinAdProgress.value = { ...skinAdProgress.value, [modelId]: next }
  localStorage.setItem(SKIN_AD_PROGRESS_KEY, JSON.stringify(skinAdProgress.value))
  return false
}

/** Skins eligible to be OFFERED as a free reward (Daily Rewards, Battle
 *  Pass, Honor Track, Skin Chest). Wraps the pure helper from
 *  `@/data/skinCatalog` with the production `isModelFullyOwned`
 *  predicate. CG QA flagged the BP modal offering "rainbow" (a special
 *  skin) on 2026-05-05 — the modal had its own component-local pool
 *  that forgot to filter `SPECIAL_SKINS`. Both the BP modal,
 *  DailyRewards modal, and `useBattlePass.ts` route through THIS helper
 *  so the filter rule lives in one place. */
export const getOfferableSkinPool = (): SpinnerModelId[] =>
  buildOfferableSkinPool(isModelFullyOwned)

export const selectSkin = (topPartId: TopPartId, modelId: SpinnerModelId, slotIndex = 0) => {
  const key = `${topPartId}:${slotIndex}`
  selectedSkins.value = { ...selectedSkins.value, [key]: modelId }
  // Keep the legacy un-indexed key in sync for slot 0 so older
  // callers that don't pass a slotIndex still resolve correctly.
  if (slotIndex === 0) {
    selectedSkins.value = { ...selectedSkins.value, [topPartId]: modelId }
  }
  saveSelectedSkins()
}

export const getSelectedSkin = (topPartId: TopPartId, slotIndex = 0): SpinnerModelId => {
  // Try slot-specific key first, fall back to legacy un-indexed key
  const slotKey = `${topPartId}:${slotIndex}`
  const sel = (selectedSkins.value[slotKey] ?? selectedSkins.value[topPartId]) as SpinnerModelId | undefined
  if (sel && isSkinOwned(topPartId, sel)) return sel
  return SKINS_PER_TOP[topPartId][0] as SpinnerModelId
}

/** Get the resolved image path for a spinner given its top part, owner, and optional override */
export const spinnerModelImgPath = (topPartId: TopPartId, owner: 'player' | 'npc', modelOverride?: string): string => {
  if (modelOverride) return modelImgPath(modelOverride)
  if (owner === 'player') return modelImgPath(getSelectedSkin(topPartId))
  return modelImgPath(getRandomSkinForTop(topPartId))
}

/**
 * models
 */
export interface Card {
  id: string
  name: string
}

// export type InventoryCard = Card & { count: number }

export interface StoredCollectionCard {
  id: string
  count: number
}

const useModels = () => {
  const allModels: Card[] = [
    { id: 'postman-middle', name: 'Quicklin' },
    { id: 'gorilla-middle', name: 'Gondix' }
  ]

  // CardQuest-era `userCollection` + `storedCollection` were dead code
  // (the computed was never returned, the saveCollection helper was
  // already commented out). Removed alongside the useUserDb deletion.
  return {
    allModels,
    modelImgPath
  }
}

export default useModels