// ─── Platform mute ─────────────────────────────────────────────────────────
//
// Portal chrome (CrazyGames' settings panel, the Playgama Bridge's audio
// toggle, …) owns a mute switch that the game MUST obey — Playgama grades it:
// "The game does not respond to the platform mute request. This is required
// for correct ad display and overlay behavior."
//
// This module is deliberately platform-NEUTRAL. It used to live inside
// `useCrazyMuteSync.ts`, which imports `@/use/useCrazyGames` at module scope;
// importing the mute helpers from the Playgama path would have pulled the
// entire CrazyGames SDK module into the Playgama bundle and tripped the
// bundle-purity test. Platform-specific sync layers now sit on top of this:
//
//   • `useCrazyMuteSync()`      — CrazyGames settings-change listener
//   • `usePlaygamaMuteSync()`   — Bridge `AUDIO_STATE_CHANGED` (in App.vue)
//
// Mechanism: chaos-arena has no separate master-gain node — every SFX gain and
// the bg-music element volume are derived from `userSoundVolume` /
// `userMusicVolume`. Driving both to 0 is therefore a true global mute (and on
// mobile it additionally short-circuits `playSound` / music playback via
// `isMobileMutedNow()`, which matters because iOS ignores `audio.volume`).

import { computed } from 'vue'
import useUser from '@/use/useUser'

const { userSoundVolume, userMusicVolume, setSettingValue } = useUser()

export const isMuted = computed(
  () => userMusicVolume.value === 0 && userSoundVolume.value === 0
)

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

/**
 * Report a user-initiated mute back to the platform, when the platform has a
 * setter for it. CrazyGames does (`sdk.game.mute`); the Playgama Bridge does
 * NOT — `isAudioEnabled` is read-only there, the portal chrome owns it — so on
 * Playgama builds no reporter is ever registered and this stays a no-op.
 */
type MuteReporter = (muted: boolean) => void
let reportToPlatform: MuteReporter | null = null

export const registerPlatformMuteReporter = (fn: MuteReporter | null): void => {
  reportToPlatform = fn
}

/**
 * SDK-driven mute. The platform is the source of truth here — this is the
 * path every portal's mute event lands on.
 *
 * Writes the volume REFS directly and deliberately does NOT persist. A
 * platform mute is transient session state, not a preference the player
 * expressed, and persisting it is a trap with teeth: a player who arrives at
 * an already-muted portal would have 0/0 written to their cloud save, and a
 * later session on an unmuted portal would find no in-session snapshot to
 * restore from and leave them silent for good. (Same lesson as the portal
 * language — never let platform state masquerade as a player choice.)
 *
 * Ref-only writes also make the no-snapshot case correct by construction:
 * nothing was ever clobbered persistently, so there is nothing to restore.
 */
export const applyMute = (muted: boolean) => {
  if (muted && !isMuted.value) {
    // Platform muted, in-game wasn't — snapshot current volumes so we
    // can restore them when the platform unmutes.
    muteSnapshot = {
      music: userMusicVolume.value,
      sound: userSoundVolume.value
    }
    userMusicVolume.value = 0
    userSoundVolume.value = 0
  } else if (!muted && isMuted.value && muteSnapshot) {
    // Platform unmuted AND we have a snapshot from an earlier platform
    // mute → restore. Without the snapshot guard this branch would also
    // fire on cold load when the user's stored value happens to be 0/0
    // (deliberate manual mute) and the SDK reports "not muted" — we'd
    // overwrite a deliberate choice with stale defaults.
    userMusicVolume.value = muteSnapshot.music
    userSoundVolume.value = muteSnapshot.sound
    muteSnapshot = null
  }
}

// User-initiated toggle from the FMuteButton. Distinct from applyMute,
// which is reserved for the SDK-driven platform-mute path (and has a
// cold-load-safe "do nothing if no snapshot" guard so an iOS player who
// previously muted on a different device doesn't get clobbered with
// stale defaults the moment the portal chrome reports "not muted").
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
  reportToPlatform?.(next)
}
