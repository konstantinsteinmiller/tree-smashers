<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isGamePaused } from '@/use/useGamePause'
import { isLowQuality } from '@/use/useQuality'
import FlatRays from '@/components/atoms/FlatRays.vue'
import {
  BOSS_DEFEATED_SKIP_AFTER_MS,
  BOSS_DEFEATED_TOTAL_MS,
  bossTitleBasePx,
  chooseTitleLayout,
  createPausableTimer,
  splitTitleLines
} from '@/use/bossDefeated'

/**
 * ─── "BOSS DEFEATED" title card ─────────────────────────────────────────────
 *
 * The cinematic beat after a boss kill ("ENEMY FELLED" / "WASTED"): a dark
 * band slides open across the middle of the screen, the title lands in big
 * red letters — fading in, settling from a slight over-scale and spreading its
 * letter-spacing — holds, and fades out. Then `done` fires and the parent
 * carries on with the post-battle flow (the boss roulette).
 *
 * Mounted with `v-if`; the parent owns WHEN it shows (`shouldShowBossDefeated`
 * in `@/use/bossDefeated`, unit-tested). This component only owns HOW LONG:
 * a pause-aware timer, so a platform pause (system overlay, ad, tab hidden)
 * freezes both the countdown and the CSS animation, and a tap skips it once
 * the title has landed.
 *
 * Sizing is measured, not tabled — see `bossTitleBasePx` / `bossTitleFontPx`.
 * `.boss-defeated__measure` is an invisible copy laid out at the base size
 * with the FINAL letter-spacing (the visible title animates it, so its own
 * width is a moving target); the visible title and its afterimage then get
 * the fitted size. Refit on resize / orientation, font-subset swaps and
 * locale changes.
 *
 * Cost: transform / opacity / letter-spacing on one text node, plus CSS
 * text-shadow — no canvas shadowBlur, no backdrop-filter. Low render quality
 * (`FX.low`) drops the afterimage, the glow, the vignette and the tracking
 * animation; prefers-reduced-motion keeps only the fades.
 */

const emit = defineEmits<{ done: [] }>()

const { t, locale } = useI18n()
const label = computed(() => t('bossDefeated'))

/** The two balanced halves, or null for a phrase without a space. */
const halves = computed(() => splitTitleLines(label.value))
const lines = ref<1 | 2>(1)

const rowRef = ref<HTMLElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)
const measureARef = ref<HTMLElement | null>(null)
const measureBRef = ref<HTMLElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)

const widthOf = (el: HTMLElement | null) => el?.getBoundingClientRect().width ?? 0

const fit = () => {
  const root = rootRef.value
  const row = rowRef.value
  if (!root || !row || !measureRef.value) return
  const base = bossTitleBasePx(window.innerWidth, window.innerHeight)
  root.style.setProperty('--bd-base', `${base}px`)
  // Style writes above + reads below = one synchronous layout, before paint.
  const layout = chooseTitleLayout(
    base,
    row.clientWidth,
    widthOf(measureRef.value),
    halves.value ? Math.max(widthOf(measureARef.value), widthOf(measureBRef.value)) : null
  )
  root.style.setProperty('--bd-size', `${layout.px}px`)
  root.style.setProperty('--bd-lines', String(layout.lines))
  lines.value = layout.lines
}

const timer = createPausableTimer(BOSS_DEFEATED_TOTAL_MS, () => emit('done'))

const onTap = () => {
  if (timer.elapsed() >= BOSS_DEFEATED_SKIP_AFTER_MS) timer.finish()
}

watch(isGamePaused, (paused) => {
  if (paused) timer.pause()
  else timer.resume()
})
watch([label, locale], fit, { flush: 'post' })

onMounted(() => {
  fit()
  window.addEventListener('resize', fit)
  document.fonts?.addEventListener?.('loadingdone', fit)
  if (!isGamePaused.value) timer.resume()
})
onUnmounted(() => {
  timer.cancel()
  window.removeEventListener('resize', fit)
  document.fonts?.removeEventListener?.('loadingdone', fit)
})
</script>

<template lang="pug">
  div.boss-defeated.fixed.inset-0.flex.items-center.justify-center.touch-none.select-none(
    ref="rootRef"
    class="z-[100]"
    role="status"
    aria-live="assertive"
    :class="{ 'is-low': isLowQuality, 'is-paused': isGamePaused }"
    :style="{\
      paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
      paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
    }"
    @pointerdown="onTap"
  )
    div.boss-defeated__vignette.absolute.inset-0.pointer-events-none(aria-hidden="true")
    //- Flat sun wedges burst out behind the slash as the title lands (#UX1c:
    //- replaces the striped band texture). Static on low quality.
    div.boss-defeated__rays.absolute(aria-hidden="true")
      FlatRays.w-full.h-full(:delay="420" :still="isLowQuality" :count="18" :spin="false")
    div.boss-defeated__band.absolute.inset-x-0.pointer-events-none(aria-hidden="true")
    //- Twinkles around the title once it has landed (delays in the style).
    div.boss-defeated__sparkles.absolute.inset-0.pointer-events-none(v-if="!isLowQuality" aria-hidden="true")
      span.ui-sparkle(v-for="n in 6" :key="n" :class="['bd-sp-' + n, { 'ui-sparkle--sun': n % 2 === 0 }]")
    div.boss-defeated__row.relative.w-full.flex.items-center.justify-center(ref="rowRef")
      //- Invisible measuring copies at the BASE size: the whole phrase and,
      //- for the two-line fallback, each balanced half.
      span.boss-defeated__measure.absolute.font-black.uppercase.whitespace-nowrap(
        ref="measureRef"
        aria-hidden="true"
      ) {{ label }}
      template(v-if="halves")
        span.boss-defeated__measure.absolute.font-black.uppercase.whitespace-nowrap(
          ref="measureARef"
          aria-hidden="true"
        ) {{ halves[0] }}
        span.boss-defeated__measure.absolute.font-black.uppercase.whitespace-nowrap(
          ref="measureBRef"
          aria-hidden="true"
        ) {{ halves[1] }}
      span.boss-defeated__ghost.absolute.flex.flex-col.items-center.font-black.uppercase.whitespace-nowrap(
        v-if="!isLowQuality"
        aria-hidden="true"
      )
        template(v-if="lines === 2 && halves")
          span {{ halves[0] }}
          span {{ halves[1] }}
        template(v-else) {{ label }}
      span.boss-defeated__title.relative.flex.flex-col.items-center.font-black.uppercase.whitespace-nowrap
        template(v-if="lines === 2 && halves")
          span {{ halves[0] }}
          span {{ halves[1] }}
        template(v-else) {{ label }}
</template>

<style scoped lang="sass">
// Timeline — must add up to BOSS_DEFEATED_TOTAL_MS (600 in + 2000 hold + 500
// out = 3100ms); percentages below are of that length.
//   0%   → 19%   in   (600ms)
//   19%  → 84%   hold (2000ms)
//   84%  → 100%  out  (500ms)
$total: 3.1s
// Final tracking. `em`, so the measured width scales with the font size.
$track: 0.04em

.boss-defeated
  --bd-base: 64px
  --bd-size: var(--bd-base)
  --bd-lines: 1

.boss-defeated.is-paused, .boss-defeated.is-paused *
  animation-play-state: paused !important

// Navy dim over the arena — the "the world went quiet" frame.
.boss-defeated__vignette
  background: color-mix(in srgb, var(--color-wood-900) 40%, transparent)
  animation: bd-fade $total ease-out both

// The berry fabric ribbon behind the title, opening from a line to its full height.
.boss-defeated__band
  top: 50%
  // One line: 2.1em tall; each extra line adds its 1.05em line box.
  height: calc(var(--bd-size) * (1.05 + 1.05 * var(--bd-lines)))
  margin-top: calc(var(--bd-size) * (1.05 + 1.05 * var(--bd-lines)) / -2)
  // A tilted berry slash across the screen — a finisher stamp, not a ribbon.
  // #UX1c finish (no stripes): a flat TWO-TONE split (berry over a deeper
  // berry lower half, one hard edge), bold hard bevel lines inside both
  // edges, a sun edge and a navy drop underneath. The tilt is the individual
  // 'rotate' property so the keyframes' scale stays separate.
  left: -6%
  right: -6%
  rotate: -3deg
  background-color: var(--color-berry-500)
  background-image: linear-gradient(180deg, transparent 0 56%, var(--color-berry-600) 56%)
  border-top: 4px solid var(--color-ink)
  border-bottom: 4px solid var(--color-ink)
  box-shadow: inset 0 4px 0 var(--color-berry-300), inset 0 -6px 0 var(--color-berry-700), 0 6px 0 var(--color-sun-400), 0 10px 0 var(--color-ink)
  transform-origin: 50% 50%
  animation: bd-band $total cubic-bezier(0.2, 0.8, 0.2, 1) both

  // Hard inner bevel lines along both edges (solid, not stitched).
  &::before, &::after
    content: ''
    position: absolute
    left: 0
    right: 0
    height: 3px

  &::before
    top: 9%
    background-color: rgba(255, 255, 255, 0.4)

  &::after
    bottom: 11%
    background-color: var(--color-berry-700)

// Rays: a square centred on the slash, wider than the screen.
.boss-defeated__rays
  left: 50%
  top: 50%
  width: 150vmax
  height: 150vmax
  margin-left: -75vmax
  margin-top: -75vmax
  animation: bd-fade $total ease-out both

// Twinkles around the title: they wait for the landing (≈0.6 s), then loop.
.boss-defeated__sparkles
  animation: bd-fade $total ease-out both

.boss-defeated__sparkles .ui-sparkle
  --sp-size: clamp(1rem, 4.5vmin, 2.2rem)
  animation-duration: 1.8s

.bd-sp-1
  left: 14%
  top: 30%
  --sp-delay: 0.55s
.bd-sp-2
  left: 26%
  top: 64%
  --sp-delay: 0.85s
.bd-sp-3
  left: 47%
  top: 24%
  --sp-delay: 1.15s
.bd-sp-4
  left: 63%
  top: 68%
  --sp-delay: 0.7s
.bd-sp-5
  left: 80%
  top: 30%
  --sp-delay: 1s
.bd-sp-6
  left: 88%
  top: 60%
  --sp-delay: 1.3s

// Invisible twin at the BASE size with the FINAL tracking — the measurement.
.boss-defeated__measure
  visibility: hidden
  pointer-events: none
  font-size: var(--bd-base)
  letter-spacing: $track
  padding-left: $track
  line-height: 1

.boss-defeated__title, .boss-defeated__ghost
  rotate: -3deg
  font-size: var(--bd-size)
  line-height: 1.05
  letter-spacing: $track
  // Letter-spacing trails the last glyph too; mirror it on the left so the
  // word stays optically centred.
  padding-left: $track

.boss-defeated__title
  color: var(--color-sun-300)
  text-shadow: 0.04em 0em 0 var(--color-ink), -0.04em 0em 0 var(--color-ink), 0em 0.04em 0 var(--color-ink), 0em -0.04em 0 var(--color-ink), 0.04em 0.04em 0 var(--color-ink), -0.04em 0.04em 0 var(--color-ink), 0.04em -0.04em 0 var(--color-ink), -0.04em -0.04em 0 var(--color-ink), 0 0.09em 0 var(--color-ink)
  animation: bd-title $total cubic-bezier(0.16, 1, 0.3, 1) both

// Afterimage: a faint copy that keeps growing and dissolves.
.boss-defeated__ghost
  color: var(--color-sun-200)
  opacity: 0
  animation: bd-ghost $total ease-out both

// ── Cheap path (FX.low): no afterimage, no vignette, fixed tracking ──
.boss-defeated.is-low
  .boss-defeated__vignette
    display: none

  .boss-defeated__band::before, .boss-defeated__band::after
    display: none

  .boss-defeated__title
    text-shadow: 0.04em 0em 0 var(--color-ink), -0.04em 0em 0 var(--color-ink), 0em 0.04em 0 var(--color-ink), 0em -0.04em 0 var(--color-ink), 0.04em 0.04em 0 var(--color-ink), -0.04em 0.04em 0 var(--color-ink), 0.04em -0.04em 0 var(--color-ink), -0.04em -0.04em 0 var(--color-ink)
    animation-name: bd-title-low

// Scripts whose glyphs tracking would break (Arabic joins, Indic / Thai
// clusters): fonts.sass zeroes their letter-spacing globally — drop the
// centring pad with it.
:global(html[data-script='arabic']) .boss-defeated__title,
:global(html[data-script='arabic']) .boss-defeated__ghost,
:global(html[data-script='arabic']) .boss-defeated__measure,
:global(html[data-script='devanagari']) .boss-defeated__title,
:global(html[data-script='devanagari']) .boss-defeated__ghost,
:global(html[data-script='devanagari']) .boss-defeated__measure,
:global(html[data-script='thai']) .boss-defeated__title,
:global(html[data-script='thai']) .boss-defeated__ghost,
:global(html[data-script='thai']) .boss-defeated__measure
  // !important: the title's keyframes animate padding-left too.
  padding-left: 0 !important

@media (prefers-reduced-motion: reduce)
  .boss-defeated__title, .boss-defeated.is-low .boss-defeated__title
    animation-name: bd-fade
  .boss-defeated__band
    animation-name: bd-fade
  .boss-defeated__ghost
    display: none

@keyframes bd-fade
  0%
    opacity: 0
  19%, 84%
    opacity: 1
  100%
    opacity: 0

@keyframes bd-band
  0%
    opacity: 0
    transform: scaleY(0.04)
  14%
    opacity: 1
    transform: scaleY(1)
  84%
    opacity: 1
    transform: scaleY(1)
  100%
    opacity: 0
    transform: scaleY(1)

@keyframes bd-title
  0%
    opacity: 0
    transform: scale(1.6)
    letter-spacing: 0
    padding-left: 0
  12%
    opacity: 1
    transform: scale(0.94)
  19%
    opacity: 1
    transform: scale(1)
    letter-spacing: $track
    padding-left: $track
  84%
    opacity: 1
    transform: scale(1.03)
  100%
    opacity: 0
    transform: scale(1.04)

@keyframes bd-title-low
  0%
    opacity: 0
    transform: scale(1.2)
  19%, 84%
    opacity: 1
    transform: scale(1)
  100%
    opacity: 0

@keyframes bd-ghost
  0%, 15%
    opacity: 0
    transform: scale(1)
  22%
    opacity: 0.45
    transform: scale(1.02)
  60%
    opacity: 0
    transform: scale(1.22)
  100%
    opacity: 0
    transform: scale(1.22)
</style>
