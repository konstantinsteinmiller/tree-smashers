import { prependBaseUrl } from '@/utils/function'
import { type Element, ELEMENTS } from '@/utils/enums'
import { isCampaignTest, isDbInitialized, isDebug } from '@/use/useMatch'
import useUser from '@/use/useUser'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TopPartId } from '@/types/spinner'
import { SKINS_KEY } from '@/keys'
import { saveDataVersion } from '@/use/useSaveStatus'

export const modelImgPath = (id: string) => {
  return prependBaseUrl(`images/models/${id}_256x256.webp`)
}

// ─── Spinner Model Image Mapping ───────────────────────────────────────────

export const SPINNER_MODEL_IDS = [
  'fire', 'phoenix', 'thunder', 'bluedragon', 'turtle',
  'ice', 'chip', 'mysticaleye', 'nature', 'wulf',
  'castle', 'eagle', 'prisma', 'scorpion', 'shell',
  'snake', 'axe', 'demon', 'angelic', 'mountain',
  'tornado', 'reddragon', 'bear', 'hawk', 'blades',
  'gear', 'ape', 'shield', 'salamaner', 'galaxy',
  'piranha', 'thunderstorm',
  'rainbow', 'dark', 'boulder', 'teleporter', 'life-leech',
  'wasp', 'spiky-eagle', 'forest-dragon', 'chain', 'wolf-demon',
  'rhino', 'golden-eagle', 'diamond', 'tsunami', 'sandstorm'
] as const

export type SpinnerModelId = (typeof SPINNER_MODEL_IDS)[number]

/** Available skins per top part (default skin is always first and free) */
export const SKINS_PER_TOP: Record<TopPartId, SpinnerModelId[]> = {
  // "star" top keeps its bold elemental roster. Swapped thunderstorm out
  // to give the new spiky ("triangle") top a jagged-themed lineup.
  star: ['blades', 'ice', 'wasp', 'reddragon', 'chain', 'axe', 'tornado'],
  // Spiky top — jagged / barbed aesthetic (thunder bolts, thunderstorm,
  // razor-winged eagle).
  triangle: ['thunder', 'snake', 'phoenix', 'eagle', 'spiky-eagle', 'salamaner', 'thunderstorm'],
  round: ['nature', 'turtle', 'piranha', 'bear', 'galaxy', 'golden-eagle', 'wolf-demon', 'dark'],
  quadratic: ['chip', 'mysticaleye', 'bluedragon', 'angelic', 'tsunami', 'prisma', 'forest-dragon', 'rainbow'],
  cushioned: ['shell', 'shield', 'castle', 'mountain', 'gear', 'sandstorm', 'diamond', 'boulder'],
  piercer: ['scorpion', 'wulf', 'demon', 'hawk', 'rhino', 'ape', 'teleporter']
}

export const SKIN_COST = 300
export const SPECIAL_SKIN_COST = 1500

/** Special skins with unique VFX — cost 1500 coins and are excluded from
 *  daily rewards and battle pass skin draws. */
export const SPECIAL_SKINS: ReadonlySet<SpinnerModelId> = new Set([
  'rainbow', 'dark', 'tornado', 'diamond', 'thunderstorm', 'boulder', 'teleporter', 'sandstorm', 'forest-dragon'
])

/** Returns the coin cost for a given skin. */
export const skinCost = (modelId: SpinnerModelId): number =>
  SPECIAL_SKINS.has(modelId) ? SPECIAL_SKIN_COST : SKIN_COST

/** Pick a random skin from the available pool for a given top part */
export const getRandomSkinForTop = (topPartId: TopPartId): SpinnerModelId => {
  const skins = SKINS_PER_TOP[topPartId]
  return skins[Math.floor(Math.random() * skins.length)] as SpinnerModelId
}

// ─── Skin Persistence (singleton) ───────────────────────────────────────────

// SKINS_KEY imported from `@/keys` at the top of this file (single source of truth shared with SaveMergePolicy).
const SELECTED_SKINS_KEY = 'spinner_selected_skins'
const PICKER_OPENED_KEY = 'spinner_skin_picker_opened'

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

const ownedSkins: Ref<Set<string>> = ref(loadOwnedSkins())
const selectedSkins: Ref<Record<string, string>> = ref(loadSelectedSkins())
const pickerOpenedParts: Ref<Set<string>> = ref(loadPickerOpened())

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  ownedSkins.value = loadOwnedSkins()
  selectedSkins.value = loadSelectedSkins()
  pickerOpenedParts.value = loadPickerOpened()
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

/** True if at least one skin in this top part's catalog is not yet owned. */
export const hasUnownedSkinsForTop = (topPartId: TopPartId): boolean =>
  SKINS_PER_TOP[topPartId].some(id => !isSkinOwned(topPartId, id))

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