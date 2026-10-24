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
        //- The result RIBBON (FRibbon, #UX1c: straight face, folded tails —
        //- the same banner as every modal title).
        div.ribbon-wrap.relative.mb-6.shrink-0(
          v-if="$slots.ribbon"
          :class="{ '!mb-2': isMobileLandscape, 'is-desktop': !isMobileLandscape && !isMobilePortrait, 'is-celebrate': celebrate }"
        )
          FRibbon.reward-banner(:tone="ribbonTone === 'wood' ? 'royal' : ribbonTone")
            span.ribbon-content
              slot(name="ribbon")
                span {{ t('spinner.rewards') }}
            //- Celebration twinkles on the ribbon's ends (#UX1c).
            template(v-if="celebrate && !isLowQuality" #decor)
              span.ui-sparkle.ribbon-sp.is-a(aria-hidden="true")
              span.ui-sparkle.ui-sparkle--sun.ribbon-sp.is-b(aria-hidden="true")
              span.ui-sparkle.ribbon-sp.is-c(aria-hidden="true")

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
              span {{ isMobile ? t('tapToContinue') : t('clickToContinue') }}
              svg.continue-hint__go(viewBox="0 0 24 24" aria-hidden="true")
                path(d="M5 5l7 7-7 7M12 5l7 7-7 7" fill="none" stroke="var(--color-ink)" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round")
                path(d="M5 5l7 7-7 7M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round")
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isMobileLandscape, isMobilePortrait } from '@/use/useUser'
import { isLowQuality } from '@/use/useQuality'
import RewardStage from '@/components/atoms/RewardStage.vue'
import RewardConfetti from '@/components/atoms/RewardConfetti.vue'
import FRibbon from '@/components/atoms/FRibbon.vue'

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

// The continue hint: a royal plate with a two-tone facet and a double chevron,
// deliberately neutral (royal, not sun/leaf) so it reads as the way onward
// rather than as another thing that was won. It pops in, then nudges forward
// every 1.4 s — the chevrons kick right, the plate gives a small squash — a
// pulse you can feel without it fading in and out of legibility.
.continue-hint
  display: inline-flex
  align-items: center
  gap: 0.45em
  padding: 0.35em 0.9em 0.35em 1.15em
  border-radius: 999px
  background-color: var(--color-royal-500)
  background-image: var(--ui-facet)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 3px 0 var(--color-royal-300), inset 0 -4px 0 var(--color-royal-700), 0 5px 0 var(--color-ink)
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  font-weight: 900
  letter-spacing: 0.04em
  line-height: 1.1
  white-space: nowrap
  font-size: clamp(0.8rem, 3.2vmin, 1.4rem)
  animation: continue-in 0.36s var(--ui-back-out) both, continue-nudge 1.4s ease-in-out 0.5s infinite

.continue-hint__go
  width: 1em
  height: 1em
  flex: 0 0 auto
  color: var(--color-sun-300)
  overflow: visible
  animation: continue-go 1.4s ease-in-out 0.5s infinite

@keyframes continue-in
  0%
    opacity: 0
    transform: translateY(10px) scale(0.7)
  100%
    opacity: 1
    transform: none

@keyframes continue-nudge
  0%, 70%, 100%
    transform: none
  80%
    transform: scale(1.06, 0.95)
  90%
    transform: scale(0.98, 1.03)

@keyframes continue-go
  0%, 66%, 100%
    transform: translateX(0)
  78%
    transform: translateX(5px)
  88%
    transform: translateX(-1px)

@media (prefers-reduced-motion: reduce)
  .continue-hint, .continue-hint__go
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

// Backdrops: a navy wash, deeper behind a celebration so the sunburst reads.
// #UX1c: the celebration stage is deep ROYAL navy (was a dark olive green
// that read muddy under the sun rays). Flat fills only.
.reward-bg
  background-color: rgba(10, 14, 44, 0.78)

.reward-bg--celebrate
  background-color: rgba(14, 20, 70, 0.94)

// ─── Fabric banner ───────────────────────────────────────────────────────────

.ribbon-wrap
  position: relative
  display: flex
  justify-content: center
  max-width: 90vw
  padding: 0 1.5em

  // Every result ribbon drops in with a swing; a celebration SLAMS instead:
  // in from big and tilted, crushing a little past rest, then settling.
  animation: ribbon-drop 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) both

  &.is-celebrate
    animation: ribbon-slam 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) both

@keyframes ribbon-drop
  0%
    opacity: 0
    transform: translateY(-50%) rotate(-5deg) scale(0.85)
  100%
    opacity: 1
    transform: none

@keyframes ribbon-slam
  0%
    opacity: 0
    transform: scale(1.9) rotate(-7deg)
  55%
    opacity: 1
    transform: scale(0.93) rotate(1.5deg)
  78%
    transform: scale(1.03) rotate(-0.5deg)
  100%
    opacity: 1
    transform: none

@media (prefers-reduced-motion: reduce)
  .ribbon-wrap, .ribbon-wrap.is-celebrate
    animation: none

.reward-banner
  max-width: 100%
  font-size: clamp(1.2rem, 4.6vmin, 2.1rem)
  :deep(.f-ribbon__face)
    min-width: min(12em, 60vw)

.ribbon-content
  text-transform: uppercase
  letter-spacing: 0.03em

// Ribbon twinkles: they start after the slam has landed (~0.5 s).
.ribbon-sp
  z-index: 3
  &.is-a
    left: 0.7em
    top: -0.5em
    --sp-size: 0.8em
    --sp-delay: 0.45s
  &.is-b
    right: 1.6em
    top: -0.35em
    --sp-size: 0.55em
    --sp-delay: 1.1s
  &.is-c
    right: 0.6em
    top: 1.5em
    --sp-size: 0.75em
    --sp-delay: 1.7s

@media (orientation: landscape) and (max-height: 500px)
  .reward-banner
    font-size: 1.1rem
</style>
