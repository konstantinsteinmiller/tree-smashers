<template lang="pug">
  //- The forest backdrop: a flat cartoon tile (public/images/bg/forest-tile.svg)
  //- on one oversized layer that pans very slowly by `transform` only.
  //- Same rules as #static-splash in index.html, so the hand-over moves nothing.
  //- `.splash-backdrop` is polled by IntroCutscene.vue — keep the class name.
  Transition(name="splash-fade")
    div.splash-backdrop.no-os-ui(v-if="!backdropHidden" aria-hidden="true")
      div.backdrop-pan(ref="panEl")
  Transition(name="loader-fade")
    div.loader.no-os-ui(v-if="!done")
      div.card
        //- THE logo seam: set LOGO_SRC (below) to a painted logo and it
        //- replaces the text wordmark everywhere (index.html static splash too).
        h1.logo(:aria-label="t('gameName')")
          img.logo-img(v-if="LOGO_SRC" :src="LOGO_SRC" alt="" draggable="false")
          span.wordmark(v-else aria-hidden="true") {{ t('gameName') }}
        div.bar(role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100")
          div.lit(aria-hidden="true")
            div.fill(:style="fillStyle")
        Transition(name="hint-fade")
          div.stuck-hint(v-if="showStuckHint") {{ t('loading.stuckHint') }}
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import useAssets from '@/use/useAssets'
import { stopLoading } from '@/use/useCrazyGames'

/**
 * The boot loader (modelled on zora-arena's): a very slowly panning forest
 * backdrop, the game's wordmark and a flat loading bar, driven by
 * `useAssets.preloadAssets`. It continues the static splash in index.html
 * exactly (same pan phase, same bar position), then fades away.
 *
 * Painted logo: put its URL in LOGO_SRC (and the same <img> into
 * #static-splash .s-logo in index.html). Empty → the text wordmark.
 */
const LOGO_SRC = ''

const { t } = useSfcI18n('FLogoProgress')

const { loadingProgress, preloadAssets } = useAssets()
const progress = computed(() => loadingProgress.value)

preloadAssets()

// ── The bar ──
// One fill scaled by `transform` (compositor-driven, keeps moving through
// long main-thread tasks). It starts where the static splash's creeping bar
// has got to so the hand-over never jumps back; while nothing has reported
// progress yet it creeps toward CREEP_TO.
const readScaleX = (el: Element | null): number => {
  if (!el) return 0
  const m = /matrix\(([^,]+)/.exec(getComputedStyle(el).transform)
  const v = m ? parseFloat(m[1]!) : 0
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
}
const startAt = typeof document !== 'undefined' ? readScaleX(document.querySelector('#static-splash .s-fill')) : 0
const CREEP_TO = 0.14
const armed = ref(false)
const fillStyle = computed(() => {
  const real = Math.max(progress.value / 100, startAt)
  const creeping = progress.value < CREEP_TO * 100
  const target = armed.value ? (creeping ? Math.max(real, CREEP_TO) : real) : startAt
  return {
    transform: `scaleX(${target.toFixed(4)})`,
    transitionDuration: !armed.value ? '0ms' : creeping ? '3200ms' : '420ms'
  }
})

const done = ref(false)
const backdropHidden = ref(false)
const showStuckHint = ref(false)
let stuckHintId: number | null = null
let settleFallbackId: number | null = null

// Continue the static splash's pan at the same point of the same loop.
const panEl = ref<HTMLElement | null>(null)
const continuePan = (from: Element | null, to: Element | null): void => {
  if (!from || !to || typeof from.getAnimations !== 'function') return
  const [a] = from.getAnimations()
  const [b] = to.getAnimations()
  if (a && b && a.startTime !== null) b.startTime = a.startTime
}

onMounted(() => {
  requestAnimationFrame(() => { armed.value = true })
  const staticSplash = document.getElementById('static-splash')
  if (staticSplash) {
    continuePan(staticSplash.querySelector('.s-pan'), panEl.value)
    staticSplash.classList.add('hidden')
    setTimeout(() => staticSplash.remove(), 500)
  }
  // Safety: never sit on the loader if progress glitches short of 100.
  settleFallbackId = window.setTimeout(() => {
    if (!done.value) done.value = true
  }, 4000)
  stuckHintId = window.setTimeout(() => {
    if (!done.value) showStuckHint.value = true
  }, 10000)
})
onUnmounted(() => {
  if (settleFallbackId !== null) clearTimeout(settleFallbackId)
  if (stuckHintId !== null) clearTimeout(stuckHintId)
})

watch(progress, (val) => {
  if (val >= 100 && !done.value) {
    // Let the fill land before the loader fades.
    setTimeout(() => { done.value = true }, 320)
  }
}, { immediate: true })

// Once-per-session CrazyGames "loading finished" (pairs with the SDK's
// auto loadingStart). Per-battle gameplayStart/Stop live in SpinnerArena.vue;
// Playgama / Poki loading-finished fire from App.vue on areAllAssetsLoaded.
let cgLoadSignaled = false
const signalGameReadyToCG = () => {
  if (cgLoadSignaled) return
  cgLoadSignaled = true
  try {
    stopLoading()
  } catch (e) {
    console.warn('[FLogoProgress] CG ready-to-play signal failed', e)
  }
}

watch(done, (isDone) => {
  if (!isDone) return
  setTimeout(() => {
    backdropHidden.value = true
    signalGameReadyToCG()
  }, 150)
})
</script>

<style scoped lang="sass">
.no-os-ui
  caret-color: transparent
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent
  &, & *
    -webkit-user-drag: none

// Mirrors #static-splash in index.html rule for rule. Change one, change both.
// Flat fills only: no blur, no radial gradients, no backdrop-filter.
.splash-backdrop
  position: fixed
  inset: 0
  z-index: 150
  overflow: hidden
  background-color: #2f5f35

.backdrop-pan
  position: absolute
  inset: -240px 0 0 -240px
  background-image: url('/images/bg/forest-tile.svg')
  background-size: 240px 240px
  animation: forest-pan 90s linear infinite
  will-change: transform

@keyframes forest-pan
  to
    transform: translate3d(240px, 240px, 0)

.loader
  position: fixed
  inset: 0
  z-index: 200
  display: flex
  align-items: center
  justify-content: center
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)

.card
  display: flex
  flex-direction: column
  align-items: center
  gap: clamp(14px, 4vmin, 28px)
  width: min(86vw, 120vh, 560px)

.logo
  margin: 0
  width: 100%
  text-align: center
.logo-img
  display: block
  width: 100%
  height: auto
.wordmark
  display: block
  font-family: 'Nunito', system-ui, sans-serif
  font-weight: 700
  font-size: clamp(2.6rem, min(13vw, 17vh), 5.6rem)
  line-height: 0.95
  letter-spacing: 0.02em
  color: #ffd45e
  -webkit-text-stroke: 0.14em #1e3a21
  paint-order: stroke fill
  text-shadow: 0 0.09em 0 #1e3a21
  transform: rotate(-3deg)

.bar
  position: relative
  width: 72%
  height: clamp(14px, 3vmin, 20px)
  border: 3px solid #1e3a21
  border-radius: 999px
  background: #24472a
  box-shadow: 0 4px 0 #1e3a21
  box-sizing: content-box
.lit
  position: absolute
  inset: 0
  border-radius: 999px
  overflow: hidden
.fill
  width: 100%
  height: 100%
  background: linear-gradient(#fff2b8 0 28%, #ffc93e 28% 100%)
  transform-origin: left center
  transition-property: transform
  transition-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1)
  will-change: transform

.stuck-hint
  max-width: 90%
  font-size: clamp(0.8rem, 3.2vmin, 1rem)
  color: #f3f7e6
  text-align: center

.splash-fade-leave-active, .loader-fade-leave-active
  transition: opacity 0.35s ease-out
  pointer-events: none
.splash-fade-leave-to, .loader-fade-leave-to
  opacity: 0
.hint-fade-enter-active
  transition: opacity 0.4s
.hint-fade-enter-from
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .backdrop-pan
    animation: none
</style>
