<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { playUiSfx } from '@/use/uiSfx'

/**
 * A number that COUNTS to its value instead of jumping: rewards, coin
 * balances, scores. Ease-out (fast start, a satisfying settle), length scaled
 * by the size of the change (0.35–1.1 s), tabular digits so nothing jitters,
 * a tiny pitched tick per visible step (`ticks`), and a bump + `reward` ting
 * on landing (`ting`). Formatted through vue-i18n's `n()` so every locale
 * gets its own digits and separators.
 *
 * Reduced motion: jumps straight to the value (still bumps once).
 */
const props = withDefaults(defineProps<{
  value: number
  /** Start value on first mount (rewards count up from 0). */
  from?: number
  /** Count on first mount (true) or show the value at once (false). */
  animateOnMount?: boolean
  /** Prefix such as '+' (not translated: a sign). */
  prefix?: string
  /** Delay before the count starts, ms (sync with an entrance). */
  delay?: number
  ticks?: boolean
  ting?: boolean
}>(), { from: 0, animateOnMount: true, prefix: '', delay: 0, ticks: true, ting: false })

const emit = defineEmits<{ (e: 'done'): void }>()
const { n } = useI18n()

const shown = ref(props.animateOnMount ? props.from : props.value)
const bump = ref(0)
let raf = 0
let startTimer = 0

const reduced = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const stop = () => {
  if (raf) cancelAnimationFrame(raf)
  if (startTimer) clearTimeout(startTimer)
  raf = 0
  startTimer = 0
}

const land = () => {
  bump.value++
  if (props.ting) playUiSfx('reward')
  emit('done')
}

const run = (from: number, to: number) => {
  stop()
  if (from === to) return
  if (reduced() || typeof requestAnimationFrame !== 'function') {
    shown.value = to
    land()
    return
  }
  const delta = Math.abs(to - from)
  const dur = Math.min(1100, 350 + Math.log10(delta + 1) * 220)
  const go = () => {
    const t0 = performance.now()
    let lastStep = Math.round(from)
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - k, 3)
      const v = Math.round(from + (to - from) * e)
      if (v !== lastStep) {
        lastStep = v
        shown.value = v
        if (props.ticks) playUiSfx('tick', { pitch: 1 + e * 0.5 })
      }
      if (k < 1) raf = requestAnimationFrame(frame)
      else {
        raf = 0
        shown.value = to
        land()
      }
    }
    raf = requestAnimationFrame(frame)
  }
  if (props.delay > 0) startTimer = window.setTimeout(go, props.delay)
  else go()
}

watch(() => props.value, (to, prev) => {
  if (prev === undefined) {
    if (props.animateOnMount) run(props.from, to)
    return
  }
  run(shown.value, to)
}, { immediate: true })

onBeforeUnmount(stop)
</script>

<template lang="pug">
  span.f-count-up.ui-num(:key="bump" :class="{ 'ui-bump': bump > 0 }") {{ prefix }}{{ n(shown) }}
</template>

<style scoped lang="sass">
.f-count-up
  display: inline-block
  font-variant-numeric: tabular-nums
</style>
