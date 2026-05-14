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

// Fallback volumes for the *user-initiated* unmute path when no
// in-session snapshot exists. Match the useUser.ts defaults so a fresh
// player and a "tap to unmute from a cold-loaded 0/0" both land on the
// same baseline. Intentionally NOT used by the SDK-driven applyMute —
// see the toggleMute / applyMute split below.
const DEFAULT_MUSIC_VOL = 0.6
const DEFAULT_SOUND_VOL = 0.7

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

// User-initiated toggle from the FMuteButton. Distinct from applyMute,
// which is reserved for the SDK-driven platform-mute path (and has a
// cold-load-safe "do nothing if no snapshot" guard so an iOS player who
// previously muted on a different device doesn't get clobbered with
// stale defaults the moment the CG chrome reports "not muted").
//
// That guard turned a deliberate UX feature into a stuck-button bug:
// an iOS QA player whose session started with cloud-saved 0/0 volumes
// could see the 🔇 icon but never restore audio, because applyMute(false)
// silently no-op'd (no in-session snapshot existed). The button press is
// an explicit user intent — always honour it: snapshot on mute, restore
// from snapshot on unmute OR fall back to DEFAULT_* if none exists.
export const toggleMute = () => {
  const next = !isMuted.value
  if (next) {
    // Mute: snapshot whatever the player had so a later unmute restores
    // them. Skip the snapshot if both volumes are already 0 (would just
    // store 0/0 and stomp the next genuine snapshot opportunity).
    if (userMusicVolume.value > 0 || userSoundVolume.value > 0) {
      muteSnapshot = {
        music: userMusicVolume.value,
        sound: userSoundVolume.value
      }
    }
    setSettingValue('music', 0)
    setSettingValue('sound', 0)
  } else {
    // Unmute: prefer the in-session snapshot; fall back to defaults so
    // the toggle is never a no-op. This is the path an iOS player needs
    // when their cold-loaded state was 0/0.
    const restore = muteSnapshot ?? { music: DEFAULT_MUSIC_VOL, sound: DEFAULT_SOUND_VOL }
    setSettingValue('music', restore.music)
    setSettingValue('sound', restore.sound)
    muteSnapshot = null
  }
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
