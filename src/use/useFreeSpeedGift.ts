// ─── First-time gift: live state ────────────────────────────────────────────
//
// Leaf module (vue + the save-status bridge + the pure gate). `SpinnerArena`
// reads `hasAnyFreeSpeedGift` to swap the speed switch's movie hint / coin
// price for a FREE badge and calls `claimFreeSpeedBoost()` before it shows a
// rewarded ad (ad builds) or charges coins (every other build). Active on
// every build (D17/D19). Rules live in `speedGiftGate.ts`.

import { computed, ref, watch, type Ref } from 'vue'
import { hydrateState, saveDataVersion } from '@/use/useSaveStatus'
import { hasSavedProgress } from '@/use/introGate'
import { utcDayKey } from '@/utils/dayKey'
import {
  DAILY_SPEED_GIFT_KEY,
  DAILY_SPEED_GIFT_LOCAL_KEY,
  isDailySpeedGiftAvailable,
  isSpeedGiftAvailable,
  shouldGrantSpeedGift,
  SPEED_GIFT_GRANTED,
  SPEED_GIFT_KEY,
  SPEED_GIFT_USED,
  SPEED_GIFT_USED_LOCAL_KEY
} from '@/use/speedGiftGate'

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch { /* storage blocked — the gift just lasts for this session */
  }
}

/** null = storage threw (unknown) — fails closed in the gate. */
const readProgress = (): boolean | null => {
  try {
    return hasSavedProgress((k) => window.localStorage.getItem(k))
  } catch {
    return null
  }
}

const stored: Ref<string | null> = ref(read(SPEED_GIFT_KEY))
const usedLocally: Ref<boolean> = ref(read(SPEED_GIFT_USED_LOCAL_KEY) === '1')
let pristineAtBoot = readProgress() === false
const dailyCloudDay: Ref<string | null> = ref(read(DAILY_SPEED_GIFT_KEY))
const dailyLocalDay: Ref<string | null> = ref(read(DAILY_SPEED_GIFT_LOCAL_KEY))
const today: Ref<string> = ref(utcDayKey())

export const hasFreeSpeedGift = computed(() => isSpeedGiftAvailable({
  stored: stored.value,
  usedLocally: usedLocally.value
}))

/** The once-a-day free 1-minute boost (see the daily section of
 *  speedGiftGate.ts). Never true while the first-time gift is available. */
export const hasDailySpeedGift = computed(() => isDailySpeedGiftAvailable({
  hydrate: hydrateState.value,
  firstGiftAvailable: hasFreeSpeedGift.value,
  today: today.value,
  cloudDay: dailyCloudDay.value,
  localDay: dailyLocalDay.value
}))

/** Either free boost is on offer — drives the FREE badge. */
export const hasAnyFreeSpeedGift = computed(() => hasFreeSpeedGift.value || hasDailySpeedGift.value)

/** Re-sample the calendar day (cheap; the arena calls it from its 1 s boost
 *  tick so the daily gift appears at UTC midnight without a reload). */
export const refreshFreeSpeedGiftDay = (): void => {
  const now = utcDayKey()
  if (now !== today.value) today.value = now
}

/** Stamp today as "a free boost was spent" — cloud key + device mirror. */
const stampDailyDay = (): void => {
  refreshFreeSpeedGiftDay()
  write(DAILY_SPEED_GIFT_LOCAL_KEY, today.value)
  write(DAILY_SPEED_GIFT_KEY, today.value)
  dailyLocalDay.value = today.value
  dailyCloudDay.value = today.value
}

/** Re-read the keys (a hydrate / reset may have changed them) and grant the
 *  gift if this is a first-timer's save. Safe to call any time. */
export const evaluateFreeSpeedGift = (): void => {
  stored.value = read(SPEED_GIFT_KEY)
  usedLocally.value = read(SPEED_GIFT_USED_LOCAL_KEY) === '1'
  dailyCloudDay.value = read(DAILY_SPEED_GIFT_KEY)
  dailyLocalDay.value = read(DAILY_SPEED_GIFT_LOCAL_KEY)
  refreshFreeSpeedGiftDay()
  if (shouldGrantSpeedGift({
    stored: stored.value,
    usedLocally: usedLocally.value,
    hasProgress: readProgress(),
    pristineAtBoot,
    hydrate: hydrateState.value
  })) {
    write(SPEED_GIFT_KEY, SPEED_GIFT_GRANTED)
    stored.value = SPEED_GIFT_GRANTED
  }
}

/**
 * Spend the gift. Returns true when the caller may grant the boost without
 * an ad. Persists 'used' BEFORE the caller grants, so a crash in between
 * loses the gift rather than duplicating it.
 */
export const consumeFreeSpeedGift = (): boolean => {
  if (!hasFreeSpeedGift.value) return false
  write(SPEED_GIFT_USED_LOCAL_KEY, '1')
  write(SPEED_GIFT_KEY, SPEED_GIFT_USED)
  usedLocally.value = true
  stored.value = SPEED_GIFT_USED
  // The first-time gift's day is that day's free boost too.
  stampDailyDay()
  return true
}

/** Spend today's daily gift. Same write-before-grant order as above. */
export const consumeDailySpeedGift = (): boolean => {
  refreshFreeSpeedGiftDay()
  if (!hasDailySpeedGift.value) return false
  stampDailyDay()
  return true
}

/**
 * Spend whichever free boost is on offer: 'first' (full-length boost),
 * 'daily' (DAILY_SPEED_GIFT_DURATION_MS) or null (none — show the ad / charge
 * coins).
 */
export const claimFreeSpeedBoost = (): 'first' | 'daily' | null => {
  if (consumeFreeSpeedGift()) return 'first'
  if (consumeDailySpeedGift()) return 'daily'
  return null
}

// A settled / recovered hydrate, the boot-complete bump and the full-progress
// reset all re-read here.
watch([hydrateState, saveDataVersion], evaluateFreeSpeedGift)
evaluateFreeSpeedGift()

/** Test seam: re-sample the boot snapshot from current storage. */
export const __resetFreeSpeedGift = (): void => {
  pristineAtBoot = readProgress() === false
  evaluateFreeSpeedGift()
}
