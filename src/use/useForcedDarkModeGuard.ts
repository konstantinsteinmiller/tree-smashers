// ─── useForcedDarkModeGuard (Vue 3) ─────────────────────────────────────
//
// Module-singleton wrapper around forcedDarkModeGuard.ts. One watcher per
// page, however many components call the composable.
//
//   main.ts            startForcedDarkModeGuard({ … })
//   App.vue            ForcedDarkModeModal   (mounted unconditionally)
//   SpinnerArena       `isForcedDarkBlocking` closes the portal gameplay
//                      bracket and holds the intro cutscene
//   useAds             every ad waits on it; the GameMonetize first-load
//                      interstitial stays armed rather than being consumed
//
// State model:
//   result          latest DetectionResult from the watcher
//   isBlocking      override live AND the player has not chosen
//                   "Continue at own risk" for that override kind
//   continueAnyway  records the choice for the CURRENT kind only — a
//                   different overrider appearing later re-shows the modal.
//                   Kept in MEMORY for this page load only, never in
//                   localStorage: CrazyGames QA rejects extra storage keys
//                   and YouTube Playables has no storage. A reload asks again.
//
// Re-check triggers: focus + MutationObserver + matchMedia by default (no
// Page Visibility; YouTube Playables bans it). Pass `subscribeRecheck` to
// add the game's own pause/resume signal, e.g.
//   startForcedDarkModeGuard({ subscribeRecheck: fn => registerPauseSyncer(fn) })
//
// Capture seam: `disabled: true` skips the watcher and releases every gate
// at once. `main.ts` drives it from the dev-only `?darkguard=off` flag, which
// the preview-video recorder sets on every take.

import { computed, readonly, shallowRef, type ComputedRef, type Ref } from 'vue'
import {
  applyPreventionOptOuts,
  watchForcedDarkMode,
  type DetectionResult,
  type OverrideKind,
  type WatchOptions,
} from '@/utils/forcedDarkModeGuard'

export interface StartOptions extends WatchOptions {
  /**
   * Fired once per override kind per page session, when it is first seen as
   * live. Wire to the project's analytics/logger — see SKILL.md "Analytics".
   */
  onDetected?: (r: DetectionResult) => void
  /** Fired when the player picks "Continue at own risk". */
  onContinueAnyway?: (r: DetectionResult) => void
  /**
   * Hard block: never offer "Continue at own risk". Default false (the
   * link is the default UX — see SKILL.md "UX contract").
   */
  hardBlock?: boolean
  /**
   * Skip detection entirely and release every gate immediately (applies no
   * watcher). For capture/test seams only, e.g. a dev-only `?darkguard=off`.
   */
  disabled?: boolean
}

const EMPTY: DetectionResult = { detected: false, kind: null, confidence: null, browser: 'other', signals: [] }

const result = shallowRef<DetectionResult>(EMPTY)
const continuedKinds = shallowRef<ReadonlySet<OverrideKind>>(new Set())
const hardBlock = shallowRef(false)
const hasFirstVerdict = shallowRef(false)

let stopWatcher: (() => void) | null = null
let opts: StartOptions = {}
const reported = new Set<OverrideKind>()
const clearWaiters: (() => void)[] = []

/** True while the notice is up. Read by the gameplay bracket and the ad gates. */
export const isForcedDarkBlocking = computed(() => {
  const r = result.value
  if (!r.detected || !r.kind) return false
  return hardBlock.value || !continuedKinds.value.has(r.kind)
})

function flushWaiters(): void {
  if (!hasFirstVerdict.value || isForcedDarkBlocking.value) return
  clearWaiters.splice(0).forEach(fn => fn())
}

/** Idempotent. Call once, early in main.ts (before mounting is fine). */
export function startForcedDarkModeGuard(options: StartOptions = {}): void {
  if (stopWatcher || typeof window === 'undefined') return
  opts = options
  hardBlock.value = !!options.hardBlock
  applyPreventionOptOuts()
  if (options.disabled) {
    stopWatcher = () => {}
    hasFirstVerdict.value = true
    flushWaiters()
    return
  }
  stopWatcher = watchForcedDarkMode(r => {
    result.value = r
    hasFirstVerdict.value = true
    if (r.detected && r.kind && !reported.has(r.kind)) {
      reported.add(r.kind)
      try { opts.onDetected?.(r) } catch (e) { console.warn('[forced-dark-guard] onDetected threw', e) }
    }
    flushWaiters()
  }, options)
}

export function stopForcedDarkModeGuard(): void {
  stopWatcher?.()
  stopWatcher = null
}

/**
 * Resolves once the guard has a verdict and nothing is blocking. Use it as
 * the gate in front of the first gameplayStart / first-play ad / FTUE.
 * `maxWaitMs` caps only the wait for the FIRST verdict (a detector that
 * never answers must not hold the game hostage); a live block always waits.
 */
export function whenForcedDarkGuardClear(maxWaitMs = 1500): Promise<void> {
  return new Promise(resolve => {
    clearWaiters.push(resolve)
    flushWaiters()
    setTimeout(() => {
      if (!hasFirstVerdict.value) { hasFirstVerdict.value = true; flushWaiters() }
    }, maxWaitMs)
  })
}

export interface ForcedDarkModeGuard {
  result: Readonly<Ref<DetectionResult>>
  isBlocking: ComputedRef<boolean>
  canContinueAnyway: ComputedRef<boolean>
  continueAnyway: () => void
}

export function useForcedDarkModeGuard(): ForcedDarkModeGuard {
  return {
    result: readonly(result) as Readonly<Ref<DetectionResult>>,
    isBlocking: isForcedDarkBlocking,
    canContinueAnyway: computed(() => !hardBlock.value),
    continueAnyway: () => {
      const r = result.value
      if (hardBlock.value || !r.kind) return
      // In memory only (this page load): see the header on why not storage.
      continuedKinds.value = new Set([...continuedKinds.value, r.kind])
      try { opts.onContinueAnyway?.(r) } catch { /* noop */ }
      flushWaiters()
    },
  }
}
