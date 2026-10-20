import { computed, ref, watch } from 'vue'
import {
  SKINS_PER_TOP,
  SPECIAL_SKINS,
  isModelFullyOwned,
  type SpinnerModelId
} from '@/use/useModels'
import { isEarnOnlySkin } from '@/data/skinCatalog'
import type { TopPartId } from '@/types/spinner'
import { saveDataVersion } from '@/use/useSaveStatus'

const SKIN_CHEST_COOLDOWN_MS = 20 * 60 * 60 * 1000 // 20h
const READY_AT_KEY = 'smashers_skin_chest_ready_at'
const FIRST_COLLECTED_KEY = 'smashers_skin_chest_first_collected'
// The skin the chest will grant — rolled ONCE, shown in the pill and granted
// verbatim on collect. Persisted so a reload (or another device after a
// cloud sync) keeps the same promise instead of re-rolling a new preview.
const REWARD_KEY = 'smashers_skin_chest_reward'
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
const loadStoredReward = (): SpinnerModelId | null => {
  const raw = localStorage.getItem(REWARD_KEY)
  return raw ? (raw as SpinnerModelId) : null
}
/** The skin the chest promises. null only when nothing is left to give. */
const reward = ref<GrantedSkin | null>(null)

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
      // Boss trophies are earn-only: the chest never grants them.
      if (isEarnOnlySkin(modelId)) continue
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

/** Roll the next reward: the D1 starter pool on the very first chest, later
 *  3% special / 97% normal from whatever is still unowned. */
const rollReward = (): GrantedSkin | null => {
  let picked: GrantedSkin | null = null
  if (!wasEverCollected.value) {
    picked = pickRandom(getUnownedPool(id => (D1_STARTER_POOL as readonly string[]).includes(id)))
    if (!picked) picked = pickRandom(getUnownedPool(id => !SPECIAL_SKINS.has(id)))
  } else if (Math.random() < SPECIAL_CHANCE) {
    picked = pickRandom(getUnownedPool(id => SPECIAL_SKINS.has(id)))
  }
  if (!picked) picked = pickRandom(getUnownedPool(id => !SPECIAL_SKINS.has(id)))
  if (!picked) picked = pickRandom(getUnownedPool())
  return picked
}

/**
 * Keep the promised reward valid: re-use the stored skin while it is still
 * unowned and offerable, otherwise roll a new one (it was bought, won from
 * the battle pass / roulette, synced in from the cloud, …). Clears the key
 * when every skin is owned — the pill then disappears.
 */
const ensureReward = () => {
  const stored = loadStoredReward()
  const still = stored ? getUnownedPool(id => id === stored)[0] ?? null : null
  const next = still ?? rollReward()
  reward.value = next
  if (next) localStorage.setItem(REWARD_KEY, next.modelId)
  else localStorage.removeItem(REWARD_KEY)
}

updateTimer()
ensureReward()

// Every acquired skin re-checks the promise: isModelFullyOwned reads the
// owned-skins ref, so acquiring the previewed skin anywhere re-runs this.
watch(() => reward.value !== null && isModelFullyOwned(reward.value.modelId), owned => {
  if (owned) ensureReward()
})

// Re-read on hydrate-success bump (see useSpinnerCampaign for rationale).
watch(saveDataVersion, () => {
  readyAt.value = parseInt(localStorage.getItem(READY_AT_KEY) || '0', 10)
  wasEverCollected.value = localStorage.getItem(FIRST_COLLECTED_KEY) === '1'
  ensureReward()
})
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

/** The skin shown left of the timer — always exactly what collect grants. */
export const skinChestIconSkin = computed<SpinnerModelId>(() => reward.value?.modelId ?? 'ice')

/** The promised reward itself (null when nothing is left to give). */
export const skinChestReward = computed(() => reward.value)

/** False when every skin is owned — caller should hide the UI entirely. */
export const skinChestHasRewards = computed(() => reward.value !== null)

/**
 * Open a ripe chest: start the next 20h cooldown and return the previewed
 * skin, which the caller puts on the Skin Chest roulette (`RouletteWheel`
 * `mode="skins"`) with 3x the chance of every other skin. Nothing is granted
 * here — the wheel grants what it lands on. The promise stays the preview
 * until it is owned (won on the wheel or anywhere else), then a new one is
 * rolled. Returns null if the chest isn't ready or nothing is left to give.
 */
export const openSkinChest = (): GrantedSkin | null => {
  if (!skinChestReady.value) return null

  ensureReward()
  const featured = reward.value
  if (!featured) return null

  readyAt.value = Date.now() + SKIN_CHEST_COOLDOWN_MS
  localStorage.setItem(READY_AT_KEY, readyAt.value.toString())

  if (!wasEverCollected.value) {
    wasEverCollected.value = true
    localStorage.setItem(FIRST_COLLECTED_KEY, '1')
  }

  updateTimer()
  return featured
}
