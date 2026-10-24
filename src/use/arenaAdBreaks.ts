// ─── Arena ad breaks: the arena's side of #UX100 ────────────────────────────
//
// SpinnerArena calls `useArenaAdBreaks(...)` once. It
//   • runs the active-playtime clock while the arena is mounted,
//   • listens for the coin-badge chord,
//   • answers the pre-battle question "interstitial now?" (`preBattleAd`), and
//   • runs an ad break (`runAdBreak`) the same way for every trigger.
// The rules themselves are pure functions in interstitialPacing.ts.
//
// Audio + pause during the ad: an interstitial is only ever requested at the
// pre-battle break, where battle music has not started yet (it starts after
// the ad, in `beginBattle`) and the gameplay bracket is closed (no
// gameplayStart/Stop pair around it is needed — `ad_break` is not a gameplay
// phase). Each provider then freezes the loop and silences audio on its own
// ad-open edge (CrazyGames adStarted, the Playgama Bridge pause, Poki's
// onStart, GameMonetize's SDK_GAME_PAUSE → `setGamePaused`), UI sounds are
// suppressed while `adsInFlight > 0` (App.vue), and a no-fill or a failing
// SDK just resolves `showMidgameAd` — the arena returns to "tap to start".

import { watch, type Ref } from 'vue'
import type { GamePhase } from '@/types/spinner'
import { adsInFlight, isInterstitialReady, showMidgameAd } from '@/use/useAds'
import { isGamePaused } from '@/use/useGamePause'
import { firstMidgameAdShown, isMidgameAdDue, markFirstMidgameAdShown, resetAdCounter } from '@/use/midgameCadence'
import {
  coinChordAction,
  isPlaytimeInterstitialDue,
  noteAdBreak,
  preBattleAdReason,
  type PreBattleAdReason
} from '@/use/interstitialPacing'
import { flushPlaytime, startPlaytimeClock, stopPlaytimeClock } from '@/use/playtimeClock'
import { installCoinBadgeChord } from '@/use/coinBadgeChord'
import { COIN_CHORD_INTERSTITIAL_BUILD, PLAYTIME_INTERSTITIALS_BUILD } from '@/use/ads/interstitialConfig'

// YouTube Playables forbids the Page Visibility API (App.vue): there the
// Bridge's pause event — `isGamePaused` — is the only "hidden" signal, and
// `document.hidden` is never read. Build-time literal, folds per build.
const READS_VISIBILITY = import.meta.env.VITE_APP_YOUTUBE !== 'true'

export interface ArenaAdBreakDeps {
  phase: Ref<GamePhase>
  /** A PvP (lock-step, networked) match, lobby or handshake is in progress. */
  pvpActive: () => boolean
  /** The player is still in the tutorial (no campaign win yet). */
  tutorial: () => boolean
  /** Nothing is on top of the arena (no modal, cutscene, notice, ad). */
  arenaClear: () => boolean
  /** The coin badge's root element. */
  getBadge: () => Element | null
}

export const useArenaAdBreaks = (deps: ArenaAdBreakDeps) => {
  const { phase } = deps
  /** A chord finished mid-battle; it plays at the next pre-battle break. */
  let chordPending = false
  let breakRunning = false

  const adInFlight = (): boolean =>
    breakRunning || adsInFlight.value > 0 || phase.value === 'ad_break' || isGamePaused.value

  /** Should the coming pre-battle break play an interstitial? */
  const preBattleAd = (): PreBattleAdReason | null =>
    preBattleAdReason({
      ready: isInterstitialReady.value,
      pvpActive: deps.pvpActive(),
      adInFlight: adInFlight(),
      tutorial: deps.tutorial(),
      chordPending,
      playtimeBuild: PLAYTIME_INTERSTITIALS_BUILD,
      playtimeDue: PLAYTIME_INTERSTITIALS_BUILD && isPlaytimeInterstitialDue(),
      cadenceDue: isMidgameAdDue()
    })

  /**
   * One ad break, whatever triggered it. The bookkeeping is done BEFORE the
   * request, so a no-fill is not retried at the very next break and two
   * triggers can never stack two ads.
   */
  const runAdBreak = async (reason: PreBattleAdReason): Promise<void> => {
    if (breakRunning) return
    breakRunning = true
    chordPending = false
    resetAdCounter()
    if (!firstMidgameAdShown()) markFirstMidgameAdShown()
    noteAdBreak()
    if (import.meta.env.DEV) console.info(`[ads] interstitial break (${reason})`)
    try {
      await showMidgameAd()
    } catch (e) {
      console.warn('[ads] interstitial failed', e)
    } finally {
      breakRunning = false
    }
  }

  const onChord = (): void => {
    const action = coinChordAction({
      buildEnabled: COIN_CHORD_INTERSTITIAL_BUILD,
      pvpActive: deps.pvpActive(),
      adInFlight: adInFlight(),
      ready: isInterstitialReady.value,
      atBreak: phase.value === 'tap_to_start' && deps.arenaClear()
    })
    if (import.meta.env.DEV) console.info(`[ads] coin chord → ${action}`)
    if (action === 'defer') {
      chordPending = true
      return
    }
    if (action !== 'show') return
    // Park the board like the pre-battle break does, so a tap on "tap to
    // start" cannot launch a battle underneath the ad.
    phase.value = 'ad_break'
    void runAdBreak('chord').finally(() => {
      if (phase.value === 'ad_break') phase.value = 'tap_to_start'
    })
  }

  let uninstallChord: (() => void) | null = null
  let stopPauseWatch: (() => void) | null = null
  const onVisibility = (): void => {
    if (document.hidden) flushPlaytime()
  }

  const mount = (): void => {
    startPlaytimeClock(() =>
      !isGamePaused.value
      && adsInFlight.value === 0
      && phase.value !== 'ad_break'
      && !(READS_VISIBILITY && typeof document !== 'undefined' && document.hidden)
    )
    // The platform pausing the game (overlay, tab away on the Bridge, ad) is
    // the moment a reload or a closed tab may follow: save the playtime.
    stopPauseWatch = watch(isGamePaused, (paused) => {
      if (paused) flushPlaytime()
    })
    // Off YouTube, hiding the tab is that moment too.
    if (READS_VISIBILITY) document.addEventListener('visibilitychange', onVisibility)
    if (COIN_CHORD_INTERSTITIAL_BUILD) {
      uninstallChord = installCoinBadgeChord({ getBadge: deps.getBadge, onChord })
    }
  }

  const unmount = (): void => {
    uninstallChord?.()
    uninstallChord = null
    stopPauseWatch?.()
    stopPauseWatch = null
    if (READS_VISIBILITY) document.removeEventListener('visibilitychange', onVisibility)
    stopPlaytimeClock()
  }

  return {
    preBattleAd,
    runAdBreak,
    mount,
    unmount,
    /** Test / debug view. */
    isChordPending: (): boolean => chordPending
  }
}
