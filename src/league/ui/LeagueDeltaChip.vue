<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'

/**
 * ─── League LP delta chip (LG5a) ────────────────────────────────────────────
 *
 * "+24 LP" in green, "−12 LP" in red, "±0 LP" in slate. With `animate` the
 * number counts up from 0 and the chip pops in; low render quality and
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
    shown.value = Math.round(from + (to - from) * e)
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
.ldc
  display: inline-flex
  align-items: center
  gap: 0.25rem
  padding: 0.2rem 0.6rem 0.2rem 0.45rem
  border-radius: 999px
  border: 2px solid #0f1a30
  box-shadow: 0 3px 0 #0f1a30
  font-weight: 900
  line-height: 1
  white-space: nowrap
  font-variant-numeric: tabular-nums
  color: #fff

.ldc__text
  text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

.ldc--up
  background: linear-gradient(to bottom, #5fe08a, #1f9c55)
.ldc--down
  background: linear-gradient(to bottom, #ff7a6b, #c9283a)
.ldc--flat
  background: linear-gradient(to bottom, #8193ad, #4d5d78)

.ldc--sm
  font-size: 0.75rem
.ldc--md
  font-size: 0.95rem
.ldc--lg
  font-size: 1.35rem
  padding: 0.3rem 0.85rem 0.3rem 0.6rem

.ldc__arrow
  display: inline-block
  width: 0.8em
  height: 0.8em
  filter: drop-shadow(0 1px 0 #000)

.ldc--pop
  animation: ldc-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both

@keyframes ldc-pop
  from
    transform: scale(0.4)
    opacity: 0

@media (prefers-reduced-motion: reduce)
  .ldc--pop
    animation: none
</style>
