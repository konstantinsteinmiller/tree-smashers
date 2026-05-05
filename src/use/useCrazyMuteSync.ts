import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import useUser from '@/use/useUser'
import {
  isSdkActive,
  onCrazyMuteChange,
  setCrazyMuted
} from '@/use/useCrazyGames'
import { isDbInitialized } from '@/use/useMatch'

const { userSoundVolume, userMusicVolume, setSettingValue } = useUser()

const isMuted = computed(() => userMusicVolume.value === 0 && userSoundVolume.value === 0)

// Snapshot of the volumes at the moment WE muted in response to a
// platform-mute event. `null` means "no platform-mute in this session"
// — `applyMute(false)` must NOT restore from snapshot in that case.
//
// Previous version started with literal defaults (0.5 / 0.7). On a
// cold load where the SDK reported `muted=false` but the cloud-hydrated
// in-game volumes were 0/0 (user deliberately muted on a different
// device), the `else if` branch fired and overwrote the cloud's
// intentional 0/0 with the stale defaults. CG QA caught it 2026-05-05.
let muteSnapshot: { music: number; sound: number } | null = null

export const applyMute = (muted: boolean) => {
  if (muted && !isMuted.value) {
    // Platform muted, in-game wasn't — snapshot current volumes so we
    // can restore them when the platform unmutes.
    muteSnapshot = {
      music: userMusicVolume.value,
      sound: userSoundVolume.value
    }
    setSettingValue('music', 0)
    setSettingValue('sound', 0)
  } else if (!muted && isMuted.value && muteSnapshot) {
    // Platform unmuted AND we have a snapshot from an earlier platform
    // mute → restore. Without the snapshot guard this branch would also
    // fire on cold load when the user's cloud value happens to be 0/0
    // (deliberate manual mute) and the SDK reports "not muted" — we'd
    // overwrite the cloud with the snapshot's stale defaults.
    setSettingValue('music', muteSnapshot.music)
    setSettingValue('sound', muteSnapshot.sound)
    muteSnapshot = null
  }
}

export const toggleMute = () => {
  const next = !isMuted.value
  applyMute(next)
  setCrazyMuted(next)
}

export { isMuted }

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
