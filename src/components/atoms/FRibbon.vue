<script setup lang="ts">
/**
 * ─── FRibbon (#UX1c — owner: "the ribbon design looks weird") ───────────────
 *
 * THE title banner of the game: modal titles, result / reward ribbons, the
 * gift reveal's kicker, the turn banner. One straight plate with crisp FOLDED
 * TAILS — the same geometry at every size, because everything is in `em` of
 * the ribbon's own font size:
 *
 *        ┌───────────────────────────────┐
 *   ┌────┤   TITLE (centred, nowrap)     ├────┐
 *   │ <  └──◣──────────────────────────◢─┘  > │   ← tails 0.5 em lower, a
 *   └───────┘                          └──────┘     swallow notch outside,
 *                                                    a dark fold triangle
 *
 * Face: solid tone, 3 px navy outline, a light top bevel, a dark bottom band,
 * a thin light inner keyline, the two-tone facet (no outer drop: the tails
 * and folds are the depth).
 * Tails: the tone's dark band, 3 px navy outline (SVG stroke, crisp at any
 * DPR), the fold one step darker. No stripes, no blur, no glow; the text sits
 * on a fixed-height face with side padding wider than the tails' overlap, so
 * it never touches an edge. Decorative tails are aria-hidden; the slot is the
 * accessible text. Add `decor` slot content (sparkles) positioned absolutely.
 */
import { computed } from 'vue'
import { ribbonArt } from '@/use/ribbonArt'

const props = withDefaults(defineProps<{
  tone?: 'sun' | 'leaf' | 'berry' | 'royal' | 'sky' | 'plum' | 'ink'
  /** Root element. */
  tag?: string
  /** Folded tails left/right; false = a clean plate (modal titles). */
  tails?: boolean
}>(), { tone: 'sun', tag: 'div', tails: true })

// The PAINTED ribbon (tools/ribbon-art, owner: "the tails look artificially cut
// off"): a 3-slice — left end with its tail folding behind the face, one face
// column stretched under the text, right end. Only with tails; the plate
// (tails=false) stays the CSS plate. Until the slices load, and under
// ?art=procedural, the SVG tails below are drawn.
const art = computed(() => (props.tails ? ribbonArt(props.tone) : null))

</script>

<template lang="pug">
  component.f-ribbon(:is="tag" :class="['f-ribbon--' + tone, { 'f-ribbon--painted': art }]" :style="art ? art.vars : undefined")
    span.f-ribbon__art(v-if="art" aria-hidden="true" :style="art.filter ? { filter: art.filter } : undefined")
      span.f-ribbon__slice.is-l(:style="{ backgroundImage: `url(${art.l})` }")
      span.f-ribbon__slice.is-m(:style="{ backgroundImage: `url(${art.m})` }")
      span.f-ribbon__slice.is-r(:style="{ backgroundImage: `url(${art.r})` }")
    svg.f-ribbon__cap.is-l(v-else-if="tails" viewBox="0 0 18 26" aria-hidden="true" focusable="false")
      path.f-ribbon__tail(d="M19 6 H1.5 L6 15.5 L1.5 25 H19 Z")
      path.f-ribbon__fold(d="M11 19 H18 V25 Z")
    svg.f-ribbon__cap.is-r(v-if="tails && !art" viewBox="0 0 18 26" aria-hidden="true" focusable="false")
      path.f-ribbon__tail(d="M19 6 H1.5 L6 15.5 L1.5 25 H19 Z")
      path.f-ribbon__fold(d="M11 19 H18 V25 Z")
    span.f-ribbon__face
      span.f-ribbon__text
        slot
    slot(name="decor")
</template>

<style scoped lang="sass">
// Geometry (em of the ribbon): face 1.9 high; caps 1.8 wide × 2.6 high, their
// inner 0.7 tucked under the face; tails start 0.6 below the face top and end
// 0.6 below its bottom; the fold is the right triangle from the face's bottom
// corner (11, 19) to the tail's bottom edge (18, 25), so its top edge lies ON
// the face's bottom outline. Left and right caps are the same path (the right
// one mirrored). viewBox units = 0.1 em.
.f-ribbon
  --rb-bg: var(--color-sun-400)
  --rb-lip: var(--color-sun-200)
  --rb-band: var(--color-sun-600)
  --rb-tail: var(--color-sun-500)
  --rb-fg: var(--color-ice-50)
  position: relative
  display: inline-flex
  align-items: flex-start
  max-width: 100%
  // Room for the caps (1.1 em each) so the whole ribbon is the layout box.
  padding: 0 1.1em 0.7em
  isolation: isolate
  line-height: 1

.f-ribbon--leaf
  --rb-bg: var(--color-leaf-500)
  --rb-lip: var(--color-leaf-300)
  --rb-band: var(--color-leaf-700)
  --rb-tail: var(--color-leaf-600)
.f-ribbon--berry
  --rb-bg: var(--color-berry-500)
  --rb-lip: var(--color-berry-300)
  --rb-band: var(--color-berry-700)
  --rb-tail: var(--color-berry-600)
.f-ribbon--royal
  --rb-bg: var(--color-royal-500)
  --rb-lip: var(--color-royal-300)
  --rb-band: var(--color-royal-700)
  --rb-tail: var(--color-royal-600)
.f-ribbon--sky
  --rb-bg: var(--color-sky-500)
  --rb-lip: var(--color-sky-300)
  --rb-band: var(--color-sky-700)
  --rb-tail: var(--color-sky-600)
.f-ribbon--plum
  --rb-bg: var(--color-plum-500)
  --rb-lip: var(--color-plum-300)
  --rb-band: var(--color-plum-700)
  --rb-tail: var(--color-plum-600)
.f-ribbon--ink
  --rb-bg: var(--color-royal-900)
  --rb-lip: var(--color-royal-700)
  --rb-band: var(--color-ink)
  --rb-tail: var(--color-royal-800)

.f-ribbon__cap
  position: absolute
  top: 0
  width: 1.8em
  height: 2.6em
  z-index: -1
  overflow: visible
  &.is-l
    left: 0
  &.is-r
    right: 0
    transform: scaleX(-1)

.f-ribbon__tail
  fill: var(--rb-tail)
  stroke: var(--color-ink)
  stroke-width: 3px
  stroke-linejoin: round
  vector-effect: non-scaling-stroke

.f-ribbon__fold
  // The fold is the same fabric one shade down (not near-black: a dark fold
  // read as a separate navy stub under the corner), 0.7 × 0.6 em with a
  // lighter stroke so its fill — not its outline — is what reads.
  fill: var(--rb-band)
  stroke: var(--color-ink)
  stroke-width: 2px
  stroke-linejoin: round
  vector-effect: non-scaling-stroke

.f-ribbon__face
  position: relative
  display: flex
  align-items: center
  justify-content: center
  min-width: 0
  height: 1.9em
  // Wider than the tails' 0.5 em tuck, so text never reaches an edge.
  padding: 0 0.85em 0.08em
  border: 3px solid var(--color-ink)
  border-radius: 0.32em
  background-color: var(--rb-bg)
  background-image: var(--ui-facet)
  // No outer drop: the tails + folds ARE the depth, and a navy drop band
  // under the face would cut across the fold triangles (a stray navy shape).
  box-shadow: inset 0 3px 0 var(--rb-lip), inset 0 0 0 4px rgba(255, 255, 255, 0.1), inset 0 -0.2em 0 var(--rb-band)

// ── Painted 3-slice (geometry from the registry, as --rbp-* em vars) ──
// The root's padding puts the face box (1.9 em) exactly over the painted face
// band; the art fills the root. The middle is ONE uniform face column, so
// stretching it between the two ends is seamless at any width.
.f-ribbon--painted
  padding: var(--rbp-pt) var(--rbp-pr) var(--rbp-pb) var(--rbp-pl)
  .f-ribbon__face
    border-color: transparent
    background: none
    box-shadow: none
    // The painted face's rounded end + outline sit inside the face box.
    padding: 0 1em 0.1em

.f-ribbon__art
  position: absolute
  inset: 0
  z-index: -1
  pointer-events: none

.f-ribbon__slice
  position: absolute
  top: 0
  height: 100%
  background-repeat: no-repeat
  background-size: 100% 100%
  &.is-l
    left: 0
    width: var(--rbp-lw)
  &.is-r
    right: 0
    width: var(--rbp-rw)
  &.is-m
    // Tucked 1 px under each end: no sub-pixel gap opens at any zoom.
    left: calc(var(--rbp-lw) - 1px)
    right: calc(var(--rbp-rw) - 1px)
    z-index: -1

.f-ribbon__text
  display: block
  min-width: 0
  max-width: 100%
  color: var(--rb-fg)
  font-weight: 900
  text-align: center
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  text-shadow: var(--ui-stroke)
  line-height: 1.15
  // The stroke's 3 px reach must not be clipped by the overflow box.
  padding: 0.12em 0.15em 0.18em
</style>
