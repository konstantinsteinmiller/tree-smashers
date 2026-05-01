import { computed, ref, watch } from 'vue'
import {
  SKINS_PER_TOP,
  SPECIAL_SKINS,
  isModelFullyOwned,
  buySkin,
  type SpinnerModelId
} from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import { saveDataVersion } from '@/use/useSaveStatus'

const SKIN_CHEST_COOLDOWN_MS = 20 * 60 * 60 * 1000 // 20h
const READY_AT_KEY = 'spinner_skin_chest_ready_at'
const FIRST_COLLECTED_KEY = 'spinner_skin_chest_first_collected'
const SPECIAL_CHANCE = 0.03

// D1 retention — the four low-quality teasers handed out on the very first
// chest open. Kept small and hand-picked so the tease is consistent.
const D1_STARTER_POOL = ['snake', 'ice', 'mysticaleye', 'shield'] as const

export interface GrantedSkin {
  topPartId: TopPartId
  modelId: SpinnerModelId
  isSpecial: boolean
}

const readyAt = ref<number>(parseInt(localStorage.getItem(READY_AT_KEY) || '0', 10))
const remaining = ref<number>(0)
const wasEverCollected = ref<boolean>(localStorage.getItem(FIRST_COLLECTED_KEY) === '1')
const iconSkin = ref<SpinnerModelId>('ice')

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  readyAt.value = parseInt(localStorage.getItem(READY_AT_KEY) || '0', 10)
  wasEverCollected.value = localStorage.getItem(FIRST_COLLECTED_KEY) === '1'
})

const updateTimer = () => {
  readyAt.value = parseInt(localStorage.getItem(READY_AT_KEY) || '0', 10)
  remaining.value = Math.max(0, readyAt.value - Date.now())
}

const getUnownedPool = (filterFn?: (id: SpinnerModelId) => boolean): GrantedSkin[] => {
  const result: GrantedSkin[] = []
  const seen = new Set<SpinnerModelId>()
  for (const [topPartId, skins] of Object.entries(SKINS_PER_TOP) as [TopPartId, SpinnerModelId[]][]) {
    for (const modelId of skins) {
      if (seen.has(modelId)) continue
      seen.add(modelId)
      if (isModelFullyOwned(modelId)) continue
      if (filterFn && !filterFn(modelId)) continue
      result.push({ topPartId, modelId, isSpecial: SPECIAL_SKINS.has(modelId) })
    }
  }
  return result
}

const pickRandom = <T>(arr: readonly T[]): T | null => {
  if (arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)] as T
}

const refreshIconSkin = () => {
  const pool = getUnownedPool(id => !SPECIAL_SKINS.has(id))
  const picked = pickRandom(pool)
  iconSkin.value = picked ? picked.modelId : 'ice'
}

updateTimer()
refreshIconSkin()
// Singleton interval — ticks globally; any mounted consumer stays in sync.
setInterval(updateTimer, 1000)

// ─── Public API ────────────────────────────────────────────────────────────

export const skinChestReady = computed(() => remaining.value <= 0)
export const skinChestRemaining = computed(() => remaining.value)

/** Compact display: HH:MM:SS when >= 1 hour, MM:SS otherwise. */
export const skinChestTimeDisplay = computed(() => {
  const totalSec = Math.ceil(remaining.value / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
})

export const skinChestCooldownPct = computed(() =>
  Math.min(1, remaining.value / SKIN_CHEST_COOLDOWN_MS)
)

export const skinChestIconSkin = computed(() => iconSkin.value)

/** False when every skin is owned — caller should hide the UI entirely. */
export const skinChestHasRewards = computed(() => {
  for (const skins of Object.values(SKINS_PER_TOP)) {
    for (const modelId of skins) {
      if (!isModelFullyOwned(modelId)) return true
    }
  }
  return false
})

/**
 * Grant a skin, advance the 20h cooldown, return the granted skin.
 * Returns null if the chest isn't ready or nothing is left to give.
 *
 * First-ever call: picks from the D1 starter pool (snake / ice / mysticaleye
 * / shield) to seed retention. Later calls roll 3% special / 97% normal from
 * whatever is still unowned.
 */
export const collectSkinChest = (): GrantedSkin | null => {
  if (!skinChestReady.value) return null

  let granted: GrantedSkin | null = null

  if (!wasEverCollected.value) {
    const starterUnowned = getUnownedPool(id => (D1_STARTER_POOL as readonly string[]).includes(id))
    granted = pickRandom(starterUnowned)
    if (!granted) granted = pickRandom(getUnownedPool(id => !SPECIAL_SKINS.has(id)))
  } else {
    if (Math.random() < SPECIAL_CHANCE) {
      granted = pickRandom(getUnownedPool(id => SPECIAL_SKINS.has(id)))
    }
    if (!granted) granted = pickRandom(getUnownedPool(id => !SPECIAL_SKINS.has(id)))
    if (!granted) granted = pickRandom(getUnownedPool())
  }

  if (!granted) return null

  buySkin(granted.topPartId, granted.modelId)

  readyAt.value = Date.now() + SKIN_CHEST_COOLDOWN_MS
  localStorage.setItem(READY_AT_KEY, readyAt.value.toString())

  if (!wasEverCollected.value) {
    wasEverCollected.value = true
    localStorage.setItem(FIRST_COLLECTED_KEY, '1')
  }

  updateTimer()
  refreshIconSkin()

  return granted
}
