// ─── Shared 30 s cooldown for the "+N coins" rewarded placements ───────────
//
// One inventory, no new farm loop (skills-feature.md §6.5): the HUD coin ad
// button (AdRewardButton) and the skill picker's coin top-up share the same
// cooldown key, so watching one hides the other for the same 30 s. Armed only
// on a COMPLETED ad; persisted so a reload does not reset it.
//
// Reactive: `adButtonReadyAt` is a module-level ref, so arming it from one
// placement hides the other immediately. `adButtonNow` ticks once a second
// while at least one placement is mounted (see `useAdButtonCooldown`).

import { computed, onMounted, onUnmounted, ref } from 'vue'

export const AD_BUTTON_COOLDOWN_MS = 30_000
export const AD_BUTTON_COOLDOWN_KEY = 'spinner_ad_button_ready_at'

const readReadyAt = (): number => {
  try {
    const v = parseInt(localStorage.getItem(AD_BUTTON_COOLDOWN_KEY) || '0', 10)
    return Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

export const adButtonReadyAt = ref(readReadyAt())
export const adButtonNow = ref(Date.now())

/** Arm the cooldown after a completed rewarded ad. */
export const armAdButtonCooldown = (now = Date.now()): void => {
  adButtonReadyAt.value = now + AD_BUTTON_COOLDOWN_MS
  try {
    localStorage.setItem(AD_BUTTON_COOLDOWN_KEY, adButtonReadyAt.value.toString())
  } catch {
    /* storage blocked: the in-memory cooldown still applies */
  }
}

let tickers = 0
let intervalId: ReturnType<typeof setInterval> | null = null

/** Component hook: re-reads the key, ticks the clock while mounted. */
export const useAdButtonCooldown = () => {
  onMounted(() => {
    adButtonReadyAt.value = Math.max(adButtonReadyAt.value, readReadyAt())
    adButtonNow.value = Date.now()
    if (tickers++ === 0) {
      intervalId = setInterval(() => {
        adButtonNow.value = Date.now()
      }, 1000)
    }
  })
  onUnmounted(() => {
    if (--tickers === 0 && intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  })
  const cooldownActive = computed(() => adButtonNow.value < adButtonReadyAt.value)
  return { cooldownActive, arm: armAdButtonCooldown }
}
