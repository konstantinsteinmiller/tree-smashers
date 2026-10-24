<template lang="pug">
  //- The boot loader. It renders the SAME class tree as #static-splash in
  //- index.html and is styled by the SAME sheet (index.html's <style>, the one
  //- source for both), then copies the splash's animation start times — so the
  //- hand-over from the static splash shows the same frame and nothing jumps.
  //-   backdrop: the key-art scene (tools/loader-art) — sky, turning flat
  //-             rays, clouds, sun plate, hills, two giant plush trees hit
  //-             in time with the logo's hop, forest, ground, smashers zooming
  //-             by on spinning discs, bushes, drifting leaves, impact star
  //-   logo:     emblem + TREE + SMASHERS (tools/logo/build.mjs, src/data/logoArt.ts)
  //-   bar:      outlined track, striped notched fill, a spinning mini disc
  //-             riding its head; the percentage in outlined numerals beside it
  //-   tip:      a rotating status line (i18n), the stuck hint after 10 s
  //- When loading is done the emblem flies into the battle HUD (HudLogo.vue).
  //- `.splash-backdrop` is polled by IntroCutscene.vue — keep the class name.
  Transition(name="splash-fade")
    div.splash-backdrop.ts-backdrop.no-os-ui(v-if="!backdropHidden" ref="backdropEl" aria-hidden="true")
      div.ts-rays
      div.ts-clouds.ts-clouds--far
      div.ts-sun
      div.ts-clouds.ts-clouds--near
      div.ts-zoom.ts-zoom--sky: div.ts-zoom__hop: div.ts-zoom__body: div.ts-zoom__disc
      div.ts-hills.ts-hills--far
      div.ts-hills.ts-hills--mid
      div.ts-drift.ts-drift--far
      div.ts-trees
        div.ts-tree.ts-tree--l
        div.ts-tree.ts-tree--r
      div.ts-forest
      div.ts-ground
      div.ts-zoom.ts-zoom--ground: div.ts-zoom__hop: div.ts-zoom__body: div.ts-zoom__disc
      div.ts-front
      div.ts-drift.ts-drift--near
      div.ts-burst
  Transition(name="loader-fade")
    div.loader.ts-stage.no-os-ui(v-if="!done" ref="stageEl" :class="{ 'is-leaving': leaving }")
      div.ts-card
        h1.ts-logo(role="img" :aria-label="t('gameName')")
          div.ts-logo__part.ts-logo__emblem
            div.ts-logo__fly(ref="flyEl")
              div.ts-logo__anim.ts-logo__anim--emblem
                img.ts-logo__img(v-bind="parts.emblem" alt="" draggable="false")
          div.ts-logo__part.ts-logo__tree
            div.ts-logo__anim.ts-logo__anim--tree
              img.ts-logo__img(v-bind="parts.tree" alt="" draggable="false")
          div.ts-logo__part.ts-logo__smashers
            div.ts-logo__anim.ts-logo__anim--smashers
              img.ts-logo__img(v-bind="parts.smashers" alt="" draggable="false")
              div.ts-logo__shine
        div.ts-meter
          div.ts-bar(
            role="progressbar"
            :aria-label="tGlobal('loading')"
            :aria-valuenow="pct"
            aria-valuemin="0"
            aria-valuemax="100"
          )
            div.ts-bar__track(aria-hidden="true")
              div.ts-bar__fill(:style="fillStyle")
              div.ts-bar__notches
            div.ts-bar__run(aria-hidden="true" :style="runStyle")
              div.ts-bar__disc
                img(:src="discSrc" alt="" draggable="false")
          div.ts-pct(aria-hidden="true" :class="{ 'is-on': showPct }") {{ t('loading.percent', { n: pct }) }}
        div.ts-tip(aria-live="polite")
          Transition(name="tip-swap" mode="out-in")
            span.ts-tip__text(v-if="tipText" :key="tipText") {{ tipText }}
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSfcI18n } from '@/i18n/sfc'
import useAssets from '@/use/useAssets'
import { stopLoading } from '@/use/useCrazyGames'
import { LOGO_DISC_SVG, LOGO_PARTS, type LogoPartName } from '@/data/logoArt'
import { logoDocked } from '@/use/useLogoDock'
import { prependBaseUrl } from '@/utils/function'

const { t } = useSfcI18n('FLogoProgress')
// `loading` is also the namespace of this component's own copy, so the
// global "Loading…" goes through the global composer.
const { t: tGlobal } = useI18n()

const { loadingProgress, preloadAssets } = useAssets()
// Dev only: `?loader=<0-100>` pins the bar there and keeps the loader up
// (design checks and screenshots of the 0 / 50 / 100 % states).
const HOLD: number | null = (() => {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('loader')
  return v === null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(100, Number(v)))
})()
const progress = computed(() => HOLD ?? loadingProgress.value)

preloadAssets()

const reduceMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Logo parts: the SVG, or the painted version where its pixels suffice ──
const partAttrs = (name: LogoPartName): Record<string, string> => {
  const p = LOGO_PARTS[name]
  if (!p.srcset) return { src: prependBaseUrl(p.svg) }
  return {
    src: prependBaseUrl(p.svg),
    srcset: p.srcset.split(', ').map(entry => entry.replace(/^\S+/, url => prependBaseUrl(url))).join(', '),
    sizes: p.sizes
  }
}
const parts = { emblem: partAttrs('emblem'), tree: partAttrs('tree'), smashers: partAttrs('smashers') }
const discSrc = prependBaseUrl(LOGO_DISC_SVG)

// ── The bar ──
// The fill slides in from the left and the runner rides its head, both by
// `transform` (compositor-driven, keeps moving through long main-thread
// tasks). They start where the static splash's creeping bar has got to, so
// the hand-over never jumps back; while nothing has reported progress yet
// they creep toward CREEP_TO (the splash's own creep target).
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)
const readSplashProgress = (): number => {
  if (typeof document === 'undefined') return 0
  const run = document.querySelector<HTMLElement>('#static-splash .ts-bar__run')
  if (!run || run.offsetWidth <= 0) return 0
  const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(run).transform)
  const tx = m ? parseFloat(m[1]!.split(',')[4] ?? '0') : 0
  return clamp01(tx / run.offsetWidth)
}
const startAt = readSplashProgress()
const CREEP_TO = 0.14
const armed = ref(false)
const barAt = computed(() => {
  const real = HOLD !== null ? HOLD / 100 : Math.max(progress.value / 100, startAt)
  if (!armed.value) return { p: startAt, ms: 0 }
  const creeping = HOLD === null && progress.value < CREEP_TO * 100
  return { p: creeping ? Math.max(real, CREEP_TO) : real, ms: creeping ? 3200 : 420 }
})
const motion = (ms: number): string => `transform ${ms}ms cubic-bezier(0.2, 0.7, 0.3, 1)`
const fillStyle = computed(() => ({
  transform: `translateX(${((barAt.value.p - 1) * 100).toFixed(2)}%)`,
  transition: motion(barAt.value.ms)
}))
const runStyle = computed(() => ({
  transform: `translateX(${(barAt.value.p * 100).toFixed(2)}%)`,
  transition: motion(barAt.value.ms)
}))
const pct = computed(() => Math.round(Math.max(0, Math.min(100, progress.value))))
// The splash has no numerals (no locale before the app boots): they appear
// right after the hand-over frame, never in it.
const showPct = ref(false)

// ── Status line: a rotating tip, then the stuck hint ──
const TIPS = ['loading.tip1', 'loading.tip2', 'loading.tip3', 'loading.tip4', 'loading.tip5'] as const
const tipIndex = ref(-1)
const showStuckHint = ref(false)
const tipText = computed(() => {
  if (showStuckHint.value) return t('loading.stuckHint')
  return tipIndex.value >= 0 ? t(TIPS[tipIndex.value % TIPS.length]!) : ''
})

const done = ref(false)
const leaving = ref(false)
const backdropHidden = ref(false)
const stageEl = ref<HTMLElement | null>(null)
const backdropEl = ref<HTMLElement | null>(null)
const flyEl = ref<HTMLElement | null>(null)
const timers: number[] = []
const later = (fn: () => void, ms: number): void => { timers.push(window.setTimeout(fn, ms)) }
let tipTimer: number | null = null

// ── Hand-over: continue every splash animation at the same point ──
// Every splash animation started on the splash's first style pass (their
// delays are part of the animations), so one start time describes them all —
// read it from any that is still running (the endless pan always is) and give
// it to every animation of the app's copy: the pan, the logo's entrance (even
// one the splash has already finished — it then stays finished instead of
// replaying) and idle loops, the shine, the bar's pop-in, the disc spin.
const continueSplashAnimations = (from: Element, to: (Element | null)[]): void => {
  if (typeof from.getAnimations !== 'function') return
  const start = from.getAnimations({ subtree: true }).find(a => a.startTime !== null)?.startTime ?? null
  if (start === null) return
  for (const root of to) {
    if (!root) continue
    for (const b of root.getAnimations({ subtree: true })) {
      if ((b as CSSAnimation).animationName) b.startTime = start
    }
  }
}

// ── Leaving: the emblem flies into the battle HUD, the rest fades ──
/** The logo's entrance (index.html keyframes) has landed by then. */
const ENTRANCE_MS = 1250
const FLIGHT_MS = 720
let cgLoadSignaled = false
// Once-per-session CrazyGames "loading finished" (pairs with the SDK's
// auto loadingStart). Per-battle gameplayStart/Stop live in SpinnerArena.vue;
// Playgama / Poki loading-finished fire from App.vue on areAllAssetsLoaded.
const signalGameReadyToCG = (): void => {
  if (cgLoadSignaled) return
  cgLoadSignaled = true
  try {
    stopLoading()
  } catch (e) {
    console.warn('[FLogoProgress] CG ready-to-play signal failed', e)
  }
}

const land = (): void => {
  logoDocked.value = true
  done.value = true
}

const leave = (): void => {
  if (leaving.value || done.value || HOLD !== null) return
  leaving.value = true
  if (tipTimer !== null) clearInterval(tipTimer)
  later(() => {
    backdropHidden.value = true
    signalGameReadyToCG()
  }, 150)
  const fly = flyEl.value
  const target = document.querySelector<HTMLElement>('[data-hud-logo]')
  if (reduceMotion || !fly || !target || target.offsetWidth <= 0) {
    land()
    return
  }
  // settle the idle flick first, so it lands at rest
  const anim = fly.firstElementChild as HTMLElement | null
  if (anim) {
    const now = getComputedStyle(anim).transform
    anim.style.animation = 'none'
    anim.style.transform = now === 'none' ? '' : now
    requestAnimationFrame(() => {
      anim.style.transition = 'transform 0.24s ease-out'
      anim.style.transform = 'none'
    })
  }
  const a = fly.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const s = b.width / Math.max(1, a.width)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  fly.style.transition = `transform ${FLIGHT_MS}ms cubic-bezier(0.55, -0.22, 0.3, 1.12)`
  fly.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)}) rotate(360deg)`
  later(land, FLIGHT_MS)
}

const finish = (): void => {
  if (leaving.value || done.value) return
  // let the fill land, and never cut the logo's entrance short
  const entranceLeft = reduceMotion ? 0 : ENTRANCE_MS - performance.now()
  later(leave, Math.max(320, entranceLeft))
}

onMounted(() => {
  const staticSplash = document.getElementById('static-splash')
  if (staticSplash) {
    continueSplashAnimations(staticSplash, [backdropEl.value, stageEl.value])
    // the splash fades out over the identical app frame (not `.hidden`:
    // Tailwind's .hidden is display:none and would cut the fade)
    staticSplash.classList.add('ts-handed-over')
    later(() => staticSplash.remove(), 500)
  }
  requestAnimationFrame(() => {
    armed.value = true
  })
  later(() => {
    showPct.value = true
    tipIndex.value = Math.floor(Math.random() * TIPS.length)
    tipTimer = window.setInterval(() => {
      tipIndex.value++
    }, 2200)
  }, 260)
  // Safety: never sit on the loader if progress glitches short of 100.
  later(() => {
    if (!done.value) leave()
  }, 4000)
  later(() => {
    if (!done.value) showStuckHint.value = true
  }, 10000)
})
onUnmounted(() => {
  for (const id of timers) clearTimeout(id)
  if (tipTimer !== null) clearInterval(tipTimer)
})

watch(progress, (val) => {
  if (val >= 100) finish()
}, { immediate: true })
</script>

<style scoped lang="sass">
// Layout, look and motion live in index.html's <style> (shared with the
// static splash). Only what the app adds after the hand-over is here.
.no-os-ui
  caret-color: transparent
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent
  &, & *
    -webkit-user-drag: none

.splash-backdrop
  z-index: 150

.loader
  z-index: 200

// The app drives the bar by real progress (inline transforms) instead of
// the splash's creep animation.
.ts-bar__fill, .ts-bar__run
  animation: none

.ts-pct
  opacity: 0
  transition: opacity 0.25s ease-out
  &.is-on
    opacity: 1

.ts-tip__text
  display: inline-block

.tip-swap-enter-active
  transition: opacity 0.22s ease-out, translate 0.22s cubic-bezier(0.3, 0.8, 0.4, 1.3)
.tip-swap-leave-active
  transition: opacity 0.14s ease-in
.tip-swap-enter-from
  opacity: 0
  translate: 0 0.4em
.tip-swap-leave-to
  opacity: 0

// Leaving: everything but the flying emblem fades.
.is-leaving
  .ts-logo__tree, .ts-logo__smashers, .ts-meter, .ts-tip
    opacity: 0
    transition: opacity 0.22s ease-out

.splash-fade-leave-active, .loader-fade-leave-active
  transition: opacity 0.35s ease-out
  pointer-events: none
.splash-fade-leave-to, .loader-fade-leave-to
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .tip-swap-enter-active, .tip-swap-leave-active
    transition: opacity 0.12s linear
  .tip-swap-enter-from
    translate: none
</style>
