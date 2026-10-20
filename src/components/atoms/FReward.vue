<template lang="pug">
  Transition(name="fade" appear)
    div.reward-root.fixed.inset-0.flex.flex-col.items-center.justify-center.touch-none.cursor-pointer(
      v-if="modelValue"
      class="z-[100]"
      :class="celebrate ? 'reward-bg--celebrate' : 'reward-bg'"
      role="dialog"
      aria-modal="true"
      @click="handleOverlayClick"
    )
      //- ── The stage: full-bleed layers BEHIND (rays) and IN FRONT (confetti)
      //- of the prize. Outside the frame on purpose: the frame is padded and
      //- its body may scroll, and a full-bleed layer must be neither.
      div.reward-layers(v-if="celebrate || $slots.stage" aria-hidden="true")
        slot(name="stage")
          RewardStage(:active="true" :burst="stageLit" :tone="tone" :still="isLowQuality")
          RewardConfetti(v-if="!isLowQuality" :burst="confettiFired" :tone="tone")

      //- ── The frame: everything the player reads ──
      div.reward-frame(:style="framePadding")
        //- Fabric banner header — flat CSS (design.sass `.ui-banner`), no
        //- painted image. ART-DESK SEAM: a painted cozy fabric/wood ribbon can
        //- replace `.reward-banner`'s background (keep the content box).
        div.ribbon-wrap.relative.mb-6.shrink-0(
          v-if="$slots.ribbon"
          :class="{ '!mb-2': isMobileLandscape, 'is-desktop': !isMobileLandscape && !isMobilePortrait, 'is-celebrate': celebrate }"
        )
          div.reward-banner.ui-banner(:class="`ui-banner--${ribbonTone}`")
            span.ribbon-content.ui-outline
              slot(name="ribbon")
                span {{ t('spinner.rewards') }}

        //- Defensive scroll — see `.reward-body`.
        div.reward-body.relative.w-full.flex.flex-col.items-center.justify-center(
          :aria-live="celebrate ? 'polite' : undefined"
        )
          slot

        //- Tap-to-continue: a neutral plate (legible over rays and confetti),
        //- a normal flex child so it can never overlap the content.
        Transition(name="fade")
          div.shrink-0.w-full.flex.justify-center.pointer-events-none(
            v-if="showContinue"
            class="mt-3 pb-1 sm:mt-5"
          )
            div.continue-hint.game-text
              | {{ isMobile ? t('tapToContinue') : t('clickToContinue') }}
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isMobileLandscape, isMobilePortrait } from '@/use/useUser'
import { isLowQuality } from '@/use/useQuality'
import RewardStage from '@/components/atoms/RewardStage.vue'
import RewardConfetti from '@/components/atoms/RewardConfetti.vue'

/**
 * ─── The reward overlay (after glyphyx's FReward) ───────────────────────────
 *
 * Ribbon + body + tap-to-continue; the content is the caller's. With
 * `celebrate` it becomes a STAGE: flat sunburst rays and a pool of light
 * behind the prize, confetti in front, lit on a schedule rather than all on
 * the first frame (rays flare at 90 ms, paper flies at 170 ms) — a reveal
 * that fires everything at once reads as a glitch. A caller that owns its
 * own beat (the gift reveal waits for the lid) passes `burst` explicitly.
 *
 * Leaving: the words fade in a tenth of the time and the dark keeps the rest,
 * so the text never hangs over the board behind it. Space / Enter continue on
 * desktop. Reduced motion: no confetti, no sway, near-instant fades.
 *
 * Perf rule: everything here is flat shapes + transform/opacity — no blur,
 * no backdrop-filter, no radial gradients.
 */

const props = withDefaults(defineProps<{
  modelValue: boolean
  showContinue: boolean
  /** Dress the backdrop as a celebration stage (rays + confetti). */
  celebrate?: boolean
  /** Accent for rays / confetti. */
  tone?: string
  /** Caller-driven flare; when undefined the flare is scheduled on open. */
  burst?: boolean
  /** Banner colour: leaf (win / neutral), berry (lose), sun (prize), wood, sky. */
  ribbonTone?: 'leaf' | 'berry' | 'sun' | 'wood' | 'sky'
}>(), { celebrate: false, tone: '#ffd23c', burst: undefined, ribbonTone: 'leaf' })

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'continue'): void
}>()

const { t } = useI18n()

/** When each plane lights, ms after the flare begins. */
const BEATS = { stage: 90, confetti: 170 } as const
const stageLit = ref(false)
const confettiFired = ref(false)
let beatTimers: number[] = []
const clearBeats = () => {
  for (const id of beatTimers) clearTimeout(id)
  beatTimers = []
}
const fireBeats = () => {
  clearBeats()
  stageLit.value = false
  confettiFired.value = false
  beatTimers.push(window.setTimeout(() => { stageLit.value = true }, BEATS.stage))
  beatTimers.push(window.setTimeout(() => { confettiFired.value = true }, BEATS.confetti))
}

watch(
  () => [props.modelValue, props.celebrate, props.burst] as const,
  ([open, celebrate, burst], prev) => {
    // Leaving: change nothing — the planes fade WITH the root.
    if (!open || !celebrate) { clearBeats(); return }
    const wasOpen = prev?.[0] ?? false
    if (burst === undefined) {
      if (!wasOpen || !prev?.[1]) fireBeats()
    } else if (burst && !(prev?.[2] && wasOpen)) {
      fireBeats()
    } else if (!burst) {
      clearBeats()
      stageLit.value = false
      confettiFired.value = false
    }
  },
  { immediate: true }
)

/** The safe-area padding, on the frame so the stage stays full-bleed. */
const framePadding = {
  paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',
  paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
  paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
  paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'
} as const

const isMobile = computed(() => {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
})

const handleOverlayClick = () => {
  if (props.showContinue) emit('continue')
}

// Desktop: Space / Enter continue, only while the hint is up.
const onContinueKey = (e: KeyboardEvent) => {
  if (!props.modelValue || !props.showContinue) return
  if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return
  const tg = e.target
  if (tg instanceof HTMLElement) {
    if (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.tagName === 'BUTTON') return
    if (tg.isContentEditable) return
  }
  e.preventDefault()
  emit('continue')
}

watch(() => props.modelValue, (open) => {
  if (typeof window === 'undefined') return
  if (open) window.addEventListener('keydown', onContinueKey)
  else window.removeEventListener('keydown', onContinueKey)
}, { immediate: true })

onBeforeUnmount(() => {
  clearBeats()
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onContinueKey)
})
</script>

<style scoped lang="sass">
.fade-enter-active, .fade-leave-active
  transition: opacity 0.4s ease

.fade-enter-from, .fade-leave-to
  opacity: 0

// Leaving: the words go first, the dark goes last.
.fade-leave-active .reward-frame,
.fade-leave-active .reward-layers
  transition: opacity 0.12s ease-out

.fade-leave-to .reward-frame,
.fade-leave-to .reward-layers
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .fade-enter-active, .fade-leave-active,
  .fade-leave-active .reward-frame,
  .fade-leave-active .reward-layers
    transition-duration: 0.01s

// Layers: stage rays z0 · frame z2 · confetti z3 (set by the children).
.reward-layers
  position: absolute
  inset: 0
  pointer-events: none

.reward-frame
  position: relative
  z-index: 2
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  width: 100%
  height: 100%
  min-height: 0

// The continue hint: a dark capsule, deliberately neutral so it reads as
// the way onward rather than as another thing that was won.
.continue-hint
  display: inline-flex
  align-items: center
  padding: 0.35em 1.15em
  border-radius: 999px
  background-color: var(--color-wood-700)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 3px 0 var(--color-wood-500), 0 3px 0 var(--color-ink)
  color: var(--color-cream-50)
  font-weight: 900
  letter-spacing: 0.04em
  line-height: 1.1
  white-space: nowrap
  font-size: clamp(0.8rem, 3.2vmin, 1.4rem)
  animation: continue-breathe 1.6s ease-in-out infinite

@keyframes continue-breathe
  0%, 100%
    opacity: 1
  50%
    opacity: 0.62

@media (prefers-reduced-motion: reduce)
  .continue-hint
    animation: none

// `flex: 1 1 auto` + `min-height: 0`, NOT `h-full`: the body takes what the
// ribbon and the continue prompt leave over and scrolls anything that still
// doesn't fit (a roulette wheel plus its buttons on short landscape, a
// locale whose text wraps more than English).
.reward-body
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  overflow-x: hidden
  overscroll-behavior: contain
  // `safe center`: degrades to flex-start exactly when overflow would push
  // content past the start edge where scrolling cannot reach it.
  justify-content: safe center
  scrollbar-width: none

  &::-webkit-scrollbar
    display: none

// Backdrops: a warm dark wash (cozy dusk), deeper behind a celebration so
// the sunburst reads. Flat fills only.
.reward-bg
  background-color: rgba(26, 18, 10, 0.78)

.reward-bg--celebrate
  background-color: rgba(30, 46, 24, 0.94)

// ─── Fabric banner ───────────────────────────────────────────────────────────

.ribbon-wrap
  position: relative
  display: flex
  justify-content: center
  max-width: 90vw
  padding: 0 1.5em

  // On a celebration the ribbon drops in with a little bounce.
  &.is-celebrate
    animation: ribbon-drop 0.55s cubic-bezier(0.2, 1.5, 0.4, 1) both

@keyframes ribbon-drop
  0%
    opacity: 0
    transform: translateY(-40%) scale(0.85)
  100%
    opacity: 1
    transform: none

@media (prefers-reduced-motion: reduce)
  .ribbon-wrap.is-celebrate
    animation: none

.reward-banner
  min-width: min(16rem, 70vw)
  max-width: 100%
  padding: 0.3em 1.6em 0.4em
  font-size: clamp(1.25rem, 5vmin, 2.25rem)

.ribbon-content
  display: block
  font-weight: 900
  text-align: center
  line-height: 1.1
  overflow-wrap: anywhere

@media (orientation: landscape) and (max-height: 500px)
  .reward-banner
    min-width: 12rem
    font-size: 1.15rem
</style>
