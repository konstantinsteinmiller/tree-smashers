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
  retryInFlight
}
