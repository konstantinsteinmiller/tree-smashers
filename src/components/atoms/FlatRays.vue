<script setup lang="ts">
import { computed } from 'vue'

/**
 * ─── Flat rays (#UX1c) ──────────────────────────────────────────────────────
 *
 * A sunburst drawn as SOLID SVG wedges — wide light wedges (white at low
 * opacity: lightening never muddies) with thin near-opaque streaks in the
 * accent tone between them — the flat, no-blur stand-in for a
 * glow behind a title or a prize (the boss-defeated slash, a promotion card).
 * Anti-aliased by the SVG rasteriser, crisp at any DPR, one path per layer.
 * Every animation is a transform (turn, burst-in); `still` (low quality) and
 * `prefers-reduced-motion` keep the rays but stop them.
 *
 * Purely decorative: aria-hidden, pointer-events none. Size it from outside
 * (it fills its box; the box is usually absolutely positioned and square).
 */
const props = withDefaults(defineProps<{
  /** Wedge count (each layer). */
  count?: number
  /** Main wedge colour (any CSS colour / var). */
  tone?: string
  /** Main wedge opacity. */
  opacity?: number
  /** Thin SOLID accent streaks between the main wedges. */
  accent?: boolean
  /** Streak colour; drawn near-opaque (a thin translucent colour over a
   *  complementary ground mixes to mud — sun over navy / green goes olive). */
  accentTone?: string
  /** Slow idle turn. */
  spin?: boolean
  /** Burst in once on mount (scale 0.4 → 1.06 → 1). */
  burst?: boolean
  /** Delay before the burst, ms. */
  delay?: number
  /** No motion at all (low render quality). */
  still?: boolean
}>(), { count: 16, tone: '#ffffff', opacity: 0.14, accent: true, accentTone: 'var(--color-sun-300)', spin: true, burst: true, delay: 0, still: false })

const wedges = (n: number, offset: number, inner: number, outer: number, halfDeg: number): string => {
  const h = (halfDeg * Math.PI) / 180
  const p = (r: number, ang: number) => `${(Math.cos(ang) * r).toFixed(2)},${(Math.sin(ang) * r).toFixed(2)}`
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = ((i + offset) / n) * Math.PI * 2
    d += `M${p(inner, a - h * 0.3)} L${p(outer, a - h)} L${p(outer, a + h)} L${p(inner, a + h * 0.3)} Z `
  }
  return d.trim()
}

const main = computed(() => wedges(props.count, 0, 10, 100, (180 / props.count) * 0.62))
const thin = computed(() => wedges(props.count, 0.5, 26, 100, (180 / props.count) * 0.09))
</script>

<template lang="pug">
  div.flat-rays(
    aria-hidden="true"
    :class="{ 'is-spin': spin && !still, 'is-burst': burst && !still, 'is-still': still }"
    :style="{ '--fr-delay': `${delay}ms` }"
  )
    svg.flat-rays__svg(viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice")
      //- `style`, not the fill attribute: a presentation attribute does not
      //- resolve CSS variables (it fell back to black).
      path(:d="main" :style="{ fill: tone, fillOpacity: opacity }")
      path(v-if="accent" :d="thin" :style="{ fill: accentTone, fillOpacity: 0.85 }")
</template>

<style scoped lang="sass">
.flat-rays
  pointer-events: none

.flat-rays__svg
  display: block
  width: 100%
  height: 100%
  overflow: visible

.flat-rays.is-burst
  animation: fr-burst 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards
  animation-delay: var(--fr-delay, 0ms)

.flat-rays.is-spin .flat-rays__svg
  animation: fr-turn 40s linear infinite

@keyframes fr-burst
  0%
    scale: 0.4
    opacity: 0
  45%
    scale: 1.06
    opacity: 1
  100%
    scale: 1
    opacity: 1

@keyframes fr-turn
  to
    rotate: 360deg

@media (prefers-reduced-motion: reduce)
  .flat-rays, .flat-rays__svg
    animation: none !important
</style>
