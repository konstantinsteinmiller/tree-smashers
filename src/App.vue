<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mobileCheck } from '@/utils/function'
import { useMusic } from '@/use/useSound'
import { useExtensionGuard } from '@/use/useExtensionGuard'
import { windowWidth, windowHeight } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import useAssets from '@/use/useAssets'
import FLogoProgress from '@/components/atoms/FLogoProgress.vue'
import FPerfMeter from '@/components/atoms/FPerfMeter.vue'
import NativeAdsDebugOverlay from '@/components/atoms/NativeAdsDebugOverlay.vue'
import SaveStatusBanner from '@/components/atoms/SaveStatusBanner.vue'
import AdsBlockedModal from '@/components/atoms/AdsBlockedModal.vue'
import RewardedAdIntroModal from '@/components/atoms/RewardedAdIntroModal.vue'
import VConsoleHideButton from '@/components/atoms/VConsoleHideButton.vue'
import { useCrazyMuteSync } from '@/use/useCrazyMuteSync'
import { applyMute } from '@/use/usePlatformMute'
import { setGamePaused } from '@/use/useGamePause'
import {
  isCrazyWeb,
  isWaveDash,
  isItch,
  isGlitch,
  isGameDistribution,
  isY8,
  isGamePix,
  isPlaygama,
  isYouTube,
  isPoki,
  isNative,
  orientation
} from '@/use/useUser'
import { glitchLicenseStatus } from '@/use/useGlitchLicense'
import { resolveCapabilities } from '@/platforms/capabilities'
import { logFirstFrameState } from '@/utils/bootDiagnostics'

const { t } = useI18n()
const { initMusic, pauseMusic, continueMusic } = useMusic()
useExtensionGuard()
const { resourceCache, areAllAssetsLoaded } = useAssets()
useCrazyMuteSync()

// ─── First-playable-frame diagnostic ──────────────────────────────────────
//
// Fires on the same edge that tells the portal `game_ready`, and on EVERY
// build — the `[diag] boot` banner in `main.ts` is printed before the router
// has resolved anything, so on its own it cannot distinguish "the view
// rendered" from "the view rendered nothing".
//
// `route.matched: 0` in this line is the exact signature of the YouTube
// Playables black screen: splash finished, SDK checklist green, RouterView
// empty. See `bootDiagnostics.ts`.
const appRouter = useRouter()
watch(areAllAssetsLoaded, (ready) => {
  if (ready) logFirstFrameState(appRouter)
}, { immediate: true })

// Playgama wiring. The two registration points need synchronous
// access to plugin symbols, so we import them statically. On every
// non-Playgama build, `isPlaygama` is the env-literal `false` and
// Rollup DCE's the entire `if` block; the bundle-purity test
// confirms the plugin chain doesn't leak into the CG bundle.
//
// Why STATIC imports (not dynamic): the obfuscator's `stringArray`
// transform mangles `'@/...'` literals inside dynamic imports inside
// obfuscated files (App.vue is not on the exclude list and adding it
// would weaken the protection over the entire shell). Static imports
// of named exports route through Vite's resolver at build time and
// are not touched by the obfuscator's string array.
import {
  registerPlaygamaMusicControls,
  playgamaGameLoadingStop,
  isPlaygamaAudioEnabled,
  isPlaygamaPaused
} from '@/utils/playgamaPlugin'

if (isPlaygama) {
  // Hand the live music controls to the plugin so its
  // PAUSE_STATE_CHANGED / AUDIO_STATE_CHANGED subscribers can pause
  // and resume music without re-importing useSound (which would
  // re-introduce the useSound ↔ useUser ↔ useMatch circular-import
  // deadlock).
  registerPlaygamaMusicControls({ pauseMusic, continueMusic })

  // ─── Certification: platform mute ────────────────────────────────────
  // `bridge.platform.isAudioEnabled` + AUDIO_STATE_CHANGED. `applyMute`
  // zeroes both volume refs, which is a true global mute here — every SFX
  // gain and the bg-music element volume derive from them. `immediate`
  // covers the player who arrives at an already-muted portal.
  watch(isPlaygamaAudioEnabled, (enabled) => {
    applyMute(!enabled)
  }, { immediate: true })

  // ─── Certification: stop the game loop on platform pause ─────────────
  // PAUSE_STATE_CHANGED is the Bridge's aggregated overlay/visibility/ad
  // signal. Suspending is independent of gameplay's own start/stop calls,
  // so resuming never restarts a battle that had legitimately ended.
  //
  // On the YouTube channel this is the ONLY pause source we are allowed to
  // have: Playables certification says "Game MUST NOT use the web Page
  // Visibility API or similar web APIs and MUST only use Playables SDK
  // onPause and onResume", and the Bridge's `youtube` adapter is what
  // forwards those events here. That is why `handleVisibilityChange` below
  // is not registered on a YouTube build — it would be a second, forbidden
  // pause source. It also means the Bridge pause edge has to carry the save
  // flush that `visibilitychange` normally triggers; see `main.ts`.
  watch(isPlaygamaPaused, (paused) => {
    setGamePaused(paused)
  }, { immediate: true })

  // `game_ready` + `in_game_loading_stopped` are certification-
  // mandatory. Fire them the moment all assets are loaded so the
  // Playgama portal can dismiss its own loading splash. The plugin
  // guards both messages so repeat firings are no-ops.
  watch(areAllAssetsLoaded, (ready) => {
    if (!ready) return
    playgamaGameLoadingStop()
  }, { immediate: true })
}

// Poki wiring. Static import for the same reason as the Playgama block
// above; `isPoki` is an env literal so Rollup DCEs the whole `if` on other
// builds, and `resolve.alias` swaps the module for a no-op stub there so the
// PokiSDK URL never enters their bundles at all.
import { pokiGameLoadingFinished, isPokiAdShowing } from '@/utils/pokiPlugin'

if (isPoki) {
  // ─── The one strictly-required SDK call ──────────────────────────────
  // Same splash-resolved edge that drives Playgama's `game_ready`. The
  // plugin guards repeat firings.
  watch(areAllAssetsLoaded, (ready) => {
    if (!ready) return
    pokiGameLoadingFinished()
  }, { immediate: true })

  // ─── Ad pause + audio ────────────────────────────────────────────────
  //
  // Poki publishes NO pause signal and NO audio-mute signal — unlike the
  // Playgama Bridge, whose PAUSE_STATE_CHANGED already folds ad state in.
  // The only edge the platform gives us is `commercialBreak`'s /
  // `rewardedBreak`'s `onStart`, which fires ONLY when a video genuinely
  // opens — so an unfilled break leaves the music and the result-screen
  // stinger untouched, which is exactly what we want.
  //
  // This watcher is the SINGLE owner of that translation: the plugin only
  // publishes the fact. Driving `setGamePaused` from in there as well would
  // give the gate two release points and let a resume land while the ad is
  // still on screen.
  watch(isPokiAdShowing, (showing) => {
    setGamePaused(showing)
    if (showing) pauseMusic()
    else continueMusic()
  })
}

initMusic()

const portraitQuery = window.matchMedia('(orientation: portrait)')
const onTouchStart = (event: any) => {
  if (event.touches.length > 1) {
    event.preventDefault() // Block multitouch (pinch)
  }
}

const onGestureStart = (event: any) => {
  event.preventDefault() // Block specific Safari zoom gestures
}
const onOrientationChange = (event: any) => {
  if (event.matches) {
    orientation.value = 'portrait'
  } else {
    orientation.value = 'landscape'
  }
}

const onContextMenu = (event: any) => {
  event.preventDefault() // Block right-click context menu
}

const handleVisibilityChange = async () => {
  try {
    if (document.hidden) {
      pauseMusic()
      // console.log('App moved to background - Pausing Music')
    } else {
      continueMusic()
      // console.log('App back in focus - Resuming Music')
    }
  } catch (error) {
    // console.log('error: ', error)
  }
}

const updateGlobalDimensions = () => {
  windowWidth.value = window.innerWidth
  windowHeight.value = window.innerHeight
  orientation.value = mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait'
}

const dimensionsInterval = ref<any | null>(null)
// Ensure listeners are active
const delayedUpdateGlobalDimensions = () => setTimeout(updateGlobalDimensions, 300)
onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateGlobalDimensions)

    dimensionsInterval.value = setInterval(() => {
      windowWidth.value = window.innerWidth
      windowHeight.value = window.innerHeight
    }, 400)
    window.addEventListener('orientationchange', delayedUpdateGlobalDimensions)
    // Playables certification: "Game MUST NOT use the web Page Visibility API
    // or similar web APIs and MUST only use Playables SDK `onPause` and
    // `onResume`." On the YouTube channel the Bridge's PAUSE_STATE_CHANGED
    // handler above already pauses music and the game loop from those very
    // SDK events, so this listener would be a second, forbidden pause source
    // rather than an addition.
    if (!isYouTube) document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', updateGlobalDimensions)
  window.removeEventListener('orientationchange', delayedUpdateGlobalDimensions)
  if (!isYouTube) document.removeEventListener('visibilitychange', handleVisibilityChange)
  clearInterval(dimensionsInterval.value)
})

onMounted(() => {
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('touchstart', onTouchStart, { passive: false })
  document.addEventListener('gesturestart', onGestureStart)
  portraitQuery.addEventListener('change', onOrientationChange)
})
onUnmounted(() => {
  document.removeEventListener('contextmenu', onContextMenu)
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('gesturestart', onGestureStart)
  portraitQuery.removeEventListener('change', onOrientationChange)
})

// Capability gates for the per-platform render fork in the template
// below — single source of truth lives in `@/platforms/capabilities`.
// `parentOrigin` is the iframe parent's origin (only meaningful for Glitch
// where the game runs on a CDN iframe-embedded into glitch.fun).
const hostname = window.location.hostname
const parentOrigin = window.location.ancestorOrigins?.[0] ?? document.referrer ?? ''
const platformFlags = {
  isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isY8, isGamePix,
  isPlaygama, isPoki
}
const capabilities = computed(() => resolveCapabilities({
  flags: platformFlags,
  hostname,
  parentOrigin,
  glitchLicenseStatus: glitchLicenseStatus.value
}))

const isGameShowAllowed = computed(() =>
  capabilities.value.allowedToShowOnCrazyGames ||
  capabilities.value.allowedToShowOnWaveDash ||
  capabilities.value.allowedToShowOnItch ||
  capabilities.value.allowedToShowOnGlitch ||
  capabilities.value.allowedToShowOnGameDistribution ||
  capabilities.value.allowedToShowOnY8 ||
  capabilities.value.allowedToShowOnGamePix ||
  capabilities.value.allowedToShowOnPlaygama ||
  capabilities.value.allowedToShowOnPoki ||
  hostname.includes('localhost')
)
const isGlitchDenied = computed(() => capabilities.value.isGlitchDenied)
const showOnlyAvailableText = computed(() => capabilities.value.showOnlyAvailableText)
const plattformText = computed(() => capabilities.value.plattformText)
</script>

<template lang="pug">
  div(v-if="isGameShowAllowed" id="app-root" class="h-screen h-dvh w-screen app-container root-protection game-ui-immune")
    FLogoProgress
    FPerfMeter(v-if="isDebug" :offset-y="52")
    NativeAdsDebugOverlay(v-if="isNative && isDebug")
    SaveStatusBanner
    AdsBlockedModal
    //- Rewarded-ad intro screen. Required before every native rewarded ad
    //- (AdMob rewarded-interstitial contract + Play Families ad disclosure).
    RewardedAdIntroModal
    VConsoleHideButton
    RouterView

  div.relative.w-full.h-full(v-else-if="isGlitchDenied")
    h1.absolute.text-red-500(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") Access Denied: Please purchase a license.


  div.relative.w-full.h-full(v-else-if="showOnlyAvailableText")
    h1.absolute(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") {{ t('crazyGamesOnly') }}
      span.ml-2.text-amber-500 {{ plattformText }}
</template>

<style lang="sass">
*
  // `--font-game` is defined in `assets/css/fonts.sass`. It keeps `Angry`
  // first (so Latin + digits render in the display face) and then names a
  // real CJK system font for every platform we ship to, because `Angry`
  // has no Han/Kana/Hangul coverage at all. See that file for the full
  // rationale — the old `'Angry', cursive` stack is what Playgama QA saw
  // as broken Chinese.
  font-family: var(--font-game)
  user-select: none
  // Standard
  -webkit-user-select: none
  // Safari
  -moz-user-select: none
  // Firefox
  -ms-user-select: none
  // IE10+

  // Optional: prevent the "tap highlight" color on mobile
  -webkit-tap-highlight-color: transparent

img
  pointer-events: none
</style>