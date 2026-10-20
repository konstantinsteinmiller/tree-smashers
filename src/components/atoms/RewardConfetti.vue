<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * ─── Confetti, in front of the prize ────────────────────────────────────────
 *
 * glyphyx throws its paper on a pooled canvas with gradient sprites. Here the
 * burst is a few dozen flat DOM pieces animated by `transform` + `opacity`
 * only — no canvas, no gradients — so it is crisp at any DPR and costs the
 * compositor, not the main thread. Two sources like the original: a pop from
 * the gift's mouth and two corner cannons angled inward, so the prize is
 * framed rather than buried. Reduced motion / low quality: nothing.
 */
const props = withDefaults(defineProps<{
  burst?: boolean
  tone?: string
  count?: number
}>(), { burst: false, tone: '#ffc933', count: 42 })

interface Piece { key: number; style: Record<string, string>; cls: string }
const pieces = ref<Piece[]>([])
let gen = 0

const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

const build = (): Piece[] => {
  // Cozy token colours: sky, berry, leaf, plum, cream + the prize tone.
  const palette = ['#55bdf2', '#f26a5e', '#82cf4a', '#b67df2', '#fffaf0', props.tone, props.tone]
  const out: Piece[] = []
  gen++
  for (let i = 0; i < props.count; i++) {
    const r = Math.random
    const src = i % 3 // 0 = mouth, 1 = left cannon, 2 = right cannon
    let x0: number, y0: number, dx: number, peak: number
    if (src === 0) {
      x0 = 50; y0 = 46
      dx = (r() - 0.5) * 70
      peak = -(18 + r() * 22)
    } else {
      x0 = src === 1 ? -2 : 102; y0 = 96
      dx = (src === 1 ? 1 : -1) * (25 + r() * 35)
      peak = -(45 + r() * 35)
    }
    const fall = 70 + r() * 40
    out.push({
      key: gen * 1000 + i,
      cls: i % 4 === 0 ? 'is-ribbon' : (i % 5 === 0 ? 'is-dot' : ''),
      style: {
        left: `${x0}%`,
        top: `${y0}%`,
        backgroundColor: palette[i % palette.length]!,
        '--dx': `${dx.toFixed(1)}vw`,
        '--peak': `${peak.toFixed(1)}vh`,
        '--fall': `${fall.toFixed(1)}vh`,
        '--rot': `${Math.round((r() - 0.5) * 1080)}deg`,
        animationDelay: `${Math.round((src === 0 ? 0 : 90) + r() * 160)}ms`,
        animationDuration: `${Math.round(1700 + r() * 900)}ms`
      }
    })
  }
  return out
}

watch(() => props.burst, (b) => {
  if (!b) { pieces.value = []; return }
  if (reducedMotion()) return
  pieces.value = build()
}, { immediate: true })
</script>

<template lang="pug">
  div.reward-confetti(aria-hidden="true")
    span.reward-confetti__piece(
      v-for="p in pieces"
      :key="p.key"
      :class="p.cls"
      :style="p.style"
    )
</template>

<style scoped lang="sass">
.reward-confetti
  position: fixed
  inset: 0
  z-index: 3
  pointer-events: none
  overflow: hidden

.reward-confetti__piece
  position: absolute
  width: 0.7rem
  height: 0.45rem
  margin: -0.22rem 0 0 -0.35rem
  border-radius: 2px
  opacity: 0
  will-change: transform, opacity
  animation-name: confetti-fly
  animation-timing-function: linear
  animation-fill-mode: both
  box-shadow: inset 0 -0.12rem 0 rgba(58, 35, 20, 0.22)

  &.is-ribbon
    width: 0.35rem
    height: 1rem
  &.is-dot
    width: 0.55rem
    height: 0.55rem
    border-radius: 50%

// Up to the peak, then a long fall with drift — two segments of one
// keyframe track, eased per segment.
@keyframes confetti-fly
  0%
    opacity: 1
    transform: translate(0, 0) rotate(0deg) scale(0.4)
    animation-timing-function: cubic-bezier(0.15, 0.8, 0.3, 1)
  28%
    opacity: 1
    transform: translate(calc(var(--dx) * 0.6), var(--peak)) rotate(calc(var(--rot) * 0.3)) scale(1)
    animation-timing-function: cubic-bezier(0.45, 0, 0.8, 0.6)
  85%
    opacity: 1
  100%
    opacity: 0
    transform: translate(var(--dx), calc(var(--peak) + var(--fall))) rotate(var(--rot)) scale(0.9)

@media (prefers-reduced-motion: reduce)
  .reward-confetti
    display: none
</style>
