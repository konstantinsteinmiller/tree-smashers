<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { playUiSfx } from '@/use/uiSfx'

/**
 * ─── League LP delta chip (LG5a) ────────────────────────────────────────────
 *
 * "+24 LP" in green, "−12 LP" in red, "±0 LP" in steel, on an angled plate.
 * With `animate` the number counts up from 0 (a pitched tick per step) and
 * the chip slams in; low render quality and
 * prefers-reduced-motion show the final value at once. Screen readers get
 * the final value only (the ticking text is aria-hidden).
 */

const props = withDefaults(defineProps<{
  delta: number
  animate?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), { animate: true, size: 'md' })

const { t } = useI18n()

const value = computed(() => (Number.isFinite(props.delta) ? Math.round(props.delta) : 0))
const tone = computed(() => (value.value > 0 ? 'up' : value.value < 0 ? 'down' : 'flat'))

const reduced = (): boolean =>
  isLowQuality.value
  || (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

const shown = ref(props.animate && !reduced() ? 0 : value.value)
let raf = 0

const run = () => {
  cancelAnimationFrame(raf)
  if (!props.animate || reduced() || typeof requestAnimationFrame !== 'function') {
    shown.value = value.value
    return
  }
  const from = shown.value
  const to = value.value
  const start = performance.now()
  const dur = 650
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    const v = Math.round(from + (to - from) * e)
    if (v !== shown.value) {
      shown.value = v
      // A pitched tick per visible step (the uiSfx throttle caps the rate).
      playUiSfx('tick', { pitch: 1 + e * 0.5 })
    }
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}

onMounted(run)
watch(value, run)
onBeforeUnmount(() => cancelAnimationFrame(raf))

/** U+2212 MINUS SIGN, not a hyphen: same width as "+", reads as a number. */
const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '±0')
const text = computed(() => t('league.lp', { n: signed(shown.value) }))
const aria = computed(() => t('league.lp', { n: signed(value.value) }))
</script>

<template lang="pug">
  span.ldc(
    data-league="delta-chip"
    :class="[`ldc--${tone}`, `ldc--${size}`, { 'ldc--pop': animate && !isLowQuality }]"
    role="img"
    :aria-label="aria"
  )
    span.ldc__arrow(v-if="tone !== 'flat'" aria-hidden="true")
      svg(viewBox="0 0 12 12" width="100%" height="100%")
        path(v-if="tone === 'up'" d="M6 1.5 11 8H7.6v2.5H4.4V8H1z" fill="currentColor")
        path(v-else d="M6 10.5 1 4h3.4V1.5h3.2V4H11z" fill="currentColor")
    span.ldc__text(aria-hidden="true") {{ text }}
</template>

<style scoped lang="sass">
// Angled tag (a parallelogram, not a pill): the plate is skewed, the number
// stays upright. It SLAMS in (big → overshoot → settle) while the number
// counts, each step a tiny pitched tick. Hard ink edge + drop, flat stripes.
.ldc
  --ldc-bg: var(--color-royal-500)
  --ldc-lip: var(--color-royal-300)
  --ldc-band: var(--color-royal-700)
  position: relative
  display: inline-flex
  align-items: center
  gap: 0.25rem
  padding: 0.22rem 0.7rem 0.26rem 0.55rem
  font-weight: 900
  line-height: 1
  white-space: nowrap
  font-variant-numeric: tabular-nums
  color: var(--color-ice-50)
  isolation: isolate

  // The skewed plate.
  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 2px solid var(--color-ink)
    border-radius: 0.35rem
    background-color: var(--ldc-bg)
    background-image: var(--ui-stripes)
    box-shadow: inset 0 2px 0 var(--ldc-lip), inset 0 -3px 0 var(--ldc-band), 0 3px 0 var(--color-ink)
    transform: skewX(-12deg)

.ldc__text
  text-shadow: var(--ui-stroke-sm)

.ldc--up
  --ldc-bg: var(--color-leaf-500)
  --ldc-lip: var(--color-leaf-300)
  --ldc-band: var(--color-leaf-700)
.ldc--down
  --ldc-bg: var(--color-berry-500)
  --ldc-lip: var(--color-berry-300)
  --ldc-band: var(--color-berry-700)
// No change: cold steel, not a colour that means anything.
.ldc--flat
  --ldc-bg: var(--color-steel-500)
  --ldc-lip: var(--color-steel-300)
  --ldc-band: var(--color-steel-600)

.ldc--sm
  font-size: 0.75rem
.ldc--md
  font-size: 0.95rem
.ldc--lg
  font-size: 1.35rem
  padding: 0.3rem 0.95rem 0.34rem 0.7rem
  .ldc__text
    text-shadow: var(--ui-stroke)

.ldc__arrow
  display: inline-block
  width: 0.8em
  height: 0.8em
  filter: drop-shadow(0 1.5px 0 var(--color-ink))

.ldc--pop
  animation: ldc-slam 0.46s cubic-bezier(0.2, 1.5, 0.4, 1) both
  animation-delay: var(--ldc-delay, 0ms)

@keyframes ldc-slam
  0%
    transform: scale(2) rotate(-8deg)
    opacity: 0
  55%
    transform: scale(0.9) rotate(2deg)
    opacity: 1
  100%
    transform: none
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .ldc--pop
    animation: none
</style>
