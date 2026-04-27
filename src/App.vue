<script setup lang="ts">
import { RouterView } from 'vue-router'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { mobileCheck } from '@/utils/function'
import { useMusic } from '@/use/useSound'
import { useExtensionGuard } from '@/use/useExtensionGuard'
import { windowWidth, windowHeight } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import useAssets from '@/use/useAssets'
import FLogoProgress from '@/components/atoms/FLogoProgress.vue'
import FPerfMeter from '@/components/atoms/FPerfMeter.vue'
import LevelPlayDebugOverlay from '@/components/atoms/LevelPlayDebugOverlay.vue'
import SaveStatusBanner from '@/components/atoms/SaveStatusBanner.vue'
import AdsBlockedModal from '@/components/atoms/AdsBlockedModal.vue'
import { useCrazyMuteSync } from '@/use/useCrazyMuteSync'
import { isCrazyWeb, isWaveDash, isItch, isGlitch, isGameDistribution, isNative, orientation } from '@/use/useUser'
import { glitchLicenseStatus } from '@/use/useGlitchLicense'

const { t } = useI18n()
const { initMusic, pauseMusic, continueMusic } = useMusic()
useExtensionGuard()
const { resourceCache } = useAssets()
useCrazyMuteSync()

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
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', updateGlobalDimensions)
  window.removeEventListener('orientationchange', delayedUpdateGlobalDimensions)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
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

const hostname = window.location.hostname

const isCrazyGamesUrl = () => hostname.includes('crazygames')
const isWaveDashUrl = () => hostname.includes('wavedash')
const isItchUrl = () => hostname.includes('itch') || hostname.includes('itch.io') || hostname.includes('itch.zone')
const isGlitchUrl = () => {
  if (hostname.includes('glitch.fun')) return true
  // Glitch hosts the game bundle on a CDN and embeds it in an iframe whose
  // parent is glitch.fun, so the iframe's own hostname won't match. Accept
  // the parent frame's origin as proof of embed.
  const parent = window.location.ancestorOrigins?.[0] ?? document.referrer
  return /(^|\/\/)([^/]+\.)?glitch\.fun(\/|$)/.test(parent || '')
}
const isGameDistUrl = () => hostname.includes('gamedistribution.com')


const isNotPlatformBuild = (!isCrazyWeb && !isWaveDash && !isItch && !isGlitch && !isGameDistribution)
const allowedToShowOnCrazyGames = computed(() => (isCrazyWeb && isCrazyGamesUrl()) || isNotPlatformBuild)
const allowedToShowOnWaveDash = computed(() => (isWaveDash && isWaveDashUrl()) || isNotPlatformBuild)
const allowedToShowOnItch = computed(() => (isItch && isItchUrl()) || isNotPlatformBuild)
const allowedToShowOnGlitch = computed(() =>
  (isGlitch && isGlitchUrl() && glitchLicenseStatus.value === 'ok') || isNotPlatformBuild
)
const isGlitchDenied = computed(() => isGlitch && glitchLicenseStatus.value === 'denied')
const allowedToShowOnGameDistribution = computed(() => (isGameDistribution && isGameDistUrl()) || isNotPlatformBuild)

const isGameShowAllowed = allowedToShowOnCrazyGames.value || allowedToShowOnWaveDash.value ||
  allowedToShowOnItch.value || allowedToShowOnGlitch.value || allowedToShowOnGameDistribution.value

const showOnlyAvailableText = computed(() => (isCrazyWeb || isWaveDash || isItch || isGlitch || isGameDistribution) && glitchLicenseStatus !== 'pending')
const plattformText = isWaveDash
  ? 'wavedash.com' : isCrazyWeb
    ? 'crazygames.com' : isItch
      ? 'itch.io' : isGlitch
        ? 'glitch.fun' : isGameDistribution
          ? 'gamedistribution.com'
          : ''
</script>

<template lang="pug">
  div(v-if="isGameShowAllowed" id="app-root" class="h-screen h-dvh w-screen app-container root-protection game-ui-immune")
    FLogoProgress
    FPerfMeter(:offset-y="52")
    LevelPlayDebugOverlay(v-if="isNative && isDebug")
    SaveStatusBanner
    AdsBlockedModal
    RouterView

  div.relative.w-full.h-full(v-else-if="isGlitchDenied")
    h1.absolute.text-red-500(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") Access Denied: Please purchase a license.

  div.relative.w-full.h-full(v-else-if="showOnlyAvailableText")
    h1.absolute(class="left-1/2 -translate-x-[50%] top-1/2 -translate-y-[50%] text-3xl") {{ t('crazyGamesOnly') }}
      span.ml-2.text-amber-500 {{ plattformText }}
</template>

<style lang="sass">
*
  font-family: 'Angry', cursive
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