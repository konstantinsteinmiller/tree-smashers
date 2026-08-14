import { onMounted, onUnmounted, ref, watch } from 'vue'
import {
  isSdkActive,
  onCrazyMuteChange,
  setCrazyMuted
} from '@/use/useCrazyGames'
import { isDbInitialized } from '@/use/useMatch'
import { applyMute, isMuted, registerPlatformMuteReporter, toggleMute } from '@/use/usePlatformMute'

// The mute STATE + the apply/toggle helpers are platform-neutral and now live
// in `usePlatformMute.ts` — importing them from here would drag the whole
// CrazyGames SDK module into every other platform's bundle. Re-exported so
// existing importers (FMuteButton, …) keep working unchanged.
export { isMuted, applyMute, toggleMute }

// Registered at MODULE scope, not in `onMounted`. `toggleMute` must report a
// user-initiated mute back to the CG chrome from the moment this module is
// imported — FMuteButton can be pressed before (or without) `useCrazyMuteSync`
// ever mounting. `setCrazyMuted` is a plain ref write and no-ops harmlessly
// when the SDK isn't active, so eager registration costs nothing.
registerPlatformMuteReporter(setCrazyMuted)

/**
 * Call once at the App level to keep the CrazyGames platform mute toggle
 * in sync with the in-game volume for the entire session, regardless of
 * which components are mounted.
 *
 * Direction of truth: the CG SDK is the source of truth for the mute
 * state — there's no public setter, the platform chrome owns it. We
 * listen for `sdk.game.addSettingsChangeListener` events (the v3
 * canonical API — the legacy `addMuteListener` never fires on the real
 * SDK) via `onCrazyMuteChange`, which also replays the current state to
 * the subscriber on attach, so one hook covers both the initial sync
 * and every subsequent toggle.
 *
 * We gate the *initial* apply on `isDbInitialized`: if IndexedDB hasn't
 * hydrated saved volume settings yet, we stash the pending mute and
 * apply it once hydration finishes so we don't fight the loader. Later
 * toggles flow through immediately.
 */
export const useCrazyMuteSync = () => {
  let unsubscribe: (() => void) | null = null
  const pendingInitialMute = ref<boolean | null>(null)

  const handleSdkMute = (muted: boolean) => {
    if (!isDbInitialized.value) {
      pendingInitialMute.value = muted
      return
    }
    applyMute(muted)
  }

  const stopDbWatch = watch(isDbInitialized, (ready) => {
    if (!ready || pendingInitialMute.value === null) return
    applyMute(pendingInitialMute.value)
    pendingInitialMute.value = null
  })

  onMounted(() => {
    if (!isSdkActive.value) return
    unsubscribe = onCrazyMuteChange(handleSdkMute)
  })

  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
    stopDbWatch()
  })
}
