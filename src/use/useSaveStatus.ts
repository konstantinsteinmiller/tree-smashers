// Reactive view of the SaveManager's hydrate state, plus a one-shot
// notice queue for the on-screen banner. Module-level singleton so any
// component can read/write without prop-drilling.
//
// Wired from main.ts after the SaveManager has been constructed. The
// banner component (`SaveStatusBanner.vue`) reads from here.

import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { SaveManager } from '@/utils/save/SaveManager'
import type { HydrateNotice, HydrateState } from '@/utils/save/types'

const hydrateState: Ref<HydrateState> = ref('pending')
const lastNotice: Ref<HydrateNotice | null> = ref(null)
const bonusCoinsAwarded: Ref<number> = ref(0)
const retryInFlight: Ref<boolean> = ref(false)
/**
 * Increments every time a hydrate transitions to `success-with-data`.
 * Composables that hold module-level refs initialised from localStorage
 * (`currentStageId`, `coins`, `ownedSkins`, …) watch this and re-read
 * their keys when it bumps. Without this, a successful background retry
 * after a partial-cloud-failure cold launch writes new values into
 * localStorage that the already-loaded refs never see — the player
 * stays at stage 1 / 0 coins despite the strategy having restored
 * the cloud save.
 */
const saveDataVersion: Ref<number> = ref(0)
let manager: SaveManager | null = null

export const installSaveStatus = (m: SaveManager): void => {
  manager = m
  hydrateState.value = m.hydrateState
  m.onHydrateNotice((notice) => {
    lastNotice.value = notice
    hydrateState.value = notice.state
    if (notice.bonusCoinsAwarded && notice.bonusCoinsAwarded > 0) {
      bonusCoinsAwarded.value = notice.bonusCoinsAwarded
    }
    // Bump only AFTER initial boot completes. Notices arriving during
    // `init()` fire from inside the strategy's `hydrate()` — patches
    // aren't installed yet, so any composable watcher that re-reads
    // localStorage in response would hit raw storage instead of the
    // BlobStorage proxy and miss the cloud-hydrated values. Background
    // retries (offline → online recovery) are post-boot and bump
    // normally so refs refresh after a recovered cloud read.
    if (notice.state === 'success-with-data' && m.isHydrated()) {
      saveDataVersion.value++
    }
  })
  // Initial boot bump: fires once when SaveManager finishes patching
  // localStorage at the end of init(). After this, every composable's
  // saveDataVersion watcher sees the patched accessor and reads
  // hydrated cloud state.
  m.onBootComplete(() => {
    saveDataVersion.value++
  })
}

export const retrySync = async (): Promise<void> => {
  if (!manager || retryInFlight.value) return
  retryInFlight.value = true
  try {
    await manager.retryHydrate()
  } finally {
    retryInFlight.value = false
  }
}

export const acknowledgeBonus = (): void => {
  bonusCoinsAwarded.value = 0
}

/** True while we don't yet know the state of the cloud save — UI may
 *  want to render a small "syncing" spinner. */
export const isSyncPending = computed(() => hydrateState.value === 'pending')

/** True when remote is unreachable and the strategy is in retry mode.
 *  Drives the offline banner. */
export const isOfflineMode = computed(() =>
  hydrateState.value === 'failed-retrying' || hydrateState.value === 'failed-final'
)

/** True after a successful merge that surpassed local — used to show
 *  the "+N coins for your old account" thank-you. */
export const hasBonusToShow = computed(() => bonusCoinsAwarded.value > 0)

export {
  hydrateState,
  lastNotice,
  bonusCoinsAwarded,
  retryInFlight,
  saveDataVersion
}
