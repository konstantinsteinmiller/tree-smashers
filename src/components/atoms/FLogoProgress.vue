<template lang="pug">
  //- Splash backdrop — blurred overlay behind the logo during loading
  Transition(name="splash-fade")
    div.splash-backdrop.no-os-ui(v-if="!backdropHidden")

  div.no-os-ui(
    ref="logoRef"
    class="fixed transition-all ease-in-out"
    :class="[settled ? 'duration-700' : 'duration-0', done ? 'z-[1]' : 'z-[200]']"
    :style="positionStyle"
  )
    div(class="relative flex flex-col items-center")

      //- Logo Progress Container
      div(
        class="relative transition-all duration-700 ease-in-out"
        :style="sizeStyle"
      )
        //- Background (Grayscale).
        //- `draggable=false` blocks the browser-native drag-to-save image
        //- behavior; the `.no-os-ui` class on the root suppresses the
        //- text caret + selection highlight + iOS long-press menu that
        //- would otherwise pop up next to the logo on touch devices.
        img(
          src="/images/logo/logo_256x256.webp" alt="logo loader"
          draggable="false"
          class="absolute inset-0 w-full h-full object-contain grayscale opacity-30"
        )

        //- Foreground (Color - revealed by progress)
        div(
          class="absolute inset-0 w-full h-full overflow-hidden transition-all duration-300 ease-out"
          :style="maskStyle"
        )
          img(
            src="/images/logo/logo_256x256.webp" alt="logo loader"
            draggable="false"
            class="w-full h-full object-contain"
          )

      //- Loading Text
      div.absolute.-bottom-8(v-if="!done" class="mt-0 flex flex-col items-center gap-1")
        span(class="percentage-text text-shadow font-mono text-amber-500") {{ Math.round(progress) }}%

      //- Soft hint if loading is stuck — appears after 10s
      Transition(name="hint-fade")
        div.stuck-hint.mt-4(v-if="showStuckHint && !done")
          | Loading taking too long? Try disabling your ad blocker and refresh.
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import useAssets from '@/use/useAssets'
import { startGameplay, stopGameplay, stopLoading } from '@/use/useCrazyGames'

const { loadingProgress, preloadAssets } = useAssets()
const progress = computed(() => loadingProgress.value)

preloadAssets()

const done = ref(false)
const settled = ref(false)
const backdropHidden = ref(false)
const showStuckHint = ref(false)
let stuckHintId: number | null = null

// Compute 40% of the smaller viewport dimension
const viewportSize = ref(Math.min(window.innerWidth, window.innerHeight))
const logoRef = ref<HTMLElement | null>(null)

const onResize = () => {
  viewportSize.value = Math.min(window.innerWidth, window.innerHeight)
}

// Safety timeout: if asset loading glitches and progress never reaches 100,
// force the logo to its final top-left position after at most 4 seconds so
// it never sits stuck in the center.
let settleFallbackId: number | null = null

onMounted(() => {
  window.addEventListener('resize', onResize)

  // Hide the static HTML splash from index.html now that Vue has taken over
  const staticSplash = document.getElementById('static-splash')
  if (staticSplash) {
    staticSplash.classList.add('hidden')
    setTimeout(() => staticSplash.remove(), 500)
  }

  // Let initial position render before enabling transitions
  requestAnimationFrame(() => {
    settled.value = true
  })
  settleFallbackId = window.setTimeout(() => {
    if (!done.value) done.value = true
  }, 4000)
  stuckHintId = window.setTimeout(() => {
    if (!done.value) showStuckHint.value = true
  }, 10000)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (settleFallbackId !== null) clearTimeout(settleFallbackId)
  if (stuckHintId !== null) clearTimeout(stuckHintId)
})

const centeredSize = computed(() => Math.floor(viewportSize.value * 0.4))
const finalSize = 64 // w-16 h-16

const sizeStyle = computed(() => {
  const s = done.value ? finalSize : centeredSize.value
  return { width: `${s}px`, height: `${s}px` }
})

const positionStyle = computed(() => {
  if (done.value) {
    // Top-left below stage badge (~52px down, 12px left). Add safe-area
    // insets so the logo clears the iPhone notch / Dynamic Island in
    // portrait and the side cutout in landscape PWA standalone mode.
    return {
      top: 'calc(52px + env(safe-area-inset-top, 0px))',
      left: 'calc(12px + env(safe-area-inset-left, 0px))',
      transform: 'none'
    }
  }
  // Centered
  return {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)'
  }
})

watch(progress, (val) => {
  if (val >= 100 && !done.value) {
    // Small delay so user sees 100% before transition
    setTimeout(() => {
      done.value = true
    }, 100)
  }
})

// Once-per-session "game ready to play" signal for the CrazyGames SDK.
// CG QA's tooling measures cold-launch download size and needs BOTH
// signals to mark the boundary correctly:
//
//   1. `stopLoading()` — pairs with the SDK's auto-fired `loadingStart`
//      and tells the SDK the loading phase ended.
//   2. `startGameplay()` immediately followed by `stopGameplay()` —
//      empirically this is what makes QA's tooling actually STOP the
//      load-size counter. `loadingStop` alone wasn't enough on the QA
//      stage; the counter kept ticking through subsequent lazy-chunk
//      fetches (vConsole on chord, language switches, ad SDK warm-up).
//      Firing the gameplay pair gives the tooling an unambiguous "the
//      game is now in a playable state" event.
//
// All three calls are idempotent and gated internally on `isSdkActive`,
// so this is a no-op on non-CrazyGames builds. The actual per-battle
// `gameplayStart` / `gameplayStop` transitions are still driven by the
// reactive `isGameplayActive` watcher in `SpinnerArena.vue` — that
// works fine because the gameplay flag is back to false after the
// stop call below.
let cgLoadSignaled = false
const signalGameReadyToCG = () => {
  if (cgLoadSignaled) return
  cgLoadSignaled = true
  try {
    stopLoading()
    // Back-to-back start+stop — see comment above for why both pieces
    // are needed alongside `stopLoading`.
    startGameplay()
    stopGameplay()
  } catch (e) {
    console.warn('[FLogoProgress] CG ready-to-play signal failed', e)
  }
}

// Hide backdrop shortly after logo starts moving to corner
watch(done, (isDone) => {
  if (isDone) {
    // Fade out backdrop after a brief delay (let the logo start moving first)
    setTimeout(() => {
      backdropHidden.value = true
      // Fire the CG "ready" signal alongside the backdrop fade — at
      // this point the menu is interactable and the load chain is
      // complete from the player's perspective.
      signalGameReadyToCG()
    }, 150)
  }
})

// Create the circular mask style
const maskStyle = computed(() => {
  return {
    '-webkit-mask-image': `conic-gradient(black ${progress.value}%, transparent ${progress.value}%)`,
    'mask-image': `conic-gradient(black ${progress.value}%, transparent ${progress.value}%)`,
    '-webkit-mask-origin': 'content-box',
    'mask-clip': 'content-box'
  }
})
</script>

<style scoped lang="sass">
// Splash is a presentation surface, not a form. Suppress every
// browser-native UI affordance that would normally surface on this
// kind of element:
//   • text caret (the blinking pipe seen near the percentage label
//     when the user accidentally taps the splash)
//   • text selection highlight
//   • iOS / Android long-press image menu ("Save image", "Copy")
//   • drag-to-save image behavior on desktop browsers
// `caret-color: transparent` covers the caret on contenteditable
// fallthroughs; `user-select: none` covers the highlight; the touch
// callout + tap-highlight kill the mobile context menus; and
// `-webkit-user-drag: none` on descendant images blocks the desktop
// drag (the inline `draggable="false"` attribute does the same job
// for older browsers). Scoped to a class so the rule never leaks.
.no-os-ui
  caret-color: transparent
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent

  &, & *
    -webkit-user-drag: none

.percentage-text
  font-size: 1.2rem
  font-weight: bold

div[style*="conic-gradient"]
  transform: rotate(0deg)
  mask-repeat: no-repeat
  -webkit-mask-repeat: no-repeat

// ─── Splash backdrop ────────────────────────────────────────────────────────
.splash-backdrop
  position: fixed
  inset: 0
  z-index: 150
  background-color: #0d1117
  background-image: url('/images/bg/bg-tile_400x400.webp')
  background-repeat: repeat
  background-size: 400px 400px
// No pointer events so nothing underneath is accidentally clickable anyway
// (there's nothing interactive rendered yet during initial load)

// Fade-out transition for the backdrop
.splash-fade-leave-active
  transition: opacity 0.4s ease-out
  pointer-events: none

.splash-fade-leave-to
  opacity: 0
</style>
