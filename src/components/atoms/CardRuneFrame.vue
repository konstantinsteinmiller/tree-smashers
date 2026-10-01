<script setup lang="ts">
import { computed } from 'vue'

/**
 * The runic border of a team-upgrade part card. It REPLACES the card's own
 * border: the card keeps a transparent 2px border for its layout, and this
 * frame paints over exactly that ring — a solid line in the part's colour, a
 * dark inner keyline, four rune-carved corner brackets and a rune stud on the
 * middle of each side. Everything stays inside the card's footprint (the
 * brackets and studs reach inward, never out), so it never touches a
 * neighbouring card; only the corners and side midpoints reach into the
 * card, away from the name, the stats and the upgrade price.
 *
 * Colour per part: `light` on a normal (slate) card, `dark` on the selected
 * (yellow) card, so the frame reads on both.
 */

const PART_FRAME_COLORS: Record<string, { light: string, dark: string }> = {
  star: { light: '#fbbf24', dark: '#92400e' },
  triangle: { light: '#f87171', dark: '#991b1b' },
  round: { light: '#60a5fa', dark: '#1e40af' },
  quadratic: { light: '#34d399', dark: '#065f46' },
  cushioned: { light: '#c084fc', dark: '#6b21a8' },
  piercer: { light: '#f472b6', dark: '#9d174d' },
  speedy: { light: '#22d3ee', dark: '#155e75' },
  tanky: { light: '#cbd5e1', dark: '#334155' },
  balanced: { light: '#a3e635', dark: '#3f6212' }
}

const props = defineProps<{ partId: string, selected?: boolean }>()

const color = computed(() => {
  const c = PART_FRAME_COLORS[props.partId] ?? { light: '#94a3b8', dark: '#334155' }
  return props.selected ? c.dark : c.light
})

// One rune per corner, carved beside the bracket (16x16 box, bracket along
// the top and left edges; mirrored per corner): Gebo, Algiz, Ingwaz, Othala.
const CORNERS = [
  { pos: 'tl', rune: 'M6.5 6.5l3.5 3.5M10 6.5l-3.5 3.5' },
  { pos: 'tr', rune: 'M8.2 11.2V6.2M8.2 8.2L6.2 5.8M8.2 8.2L10.2 5.8' },
  { pos: 'br', rune: 'M8.2 5.6L10.6 8L8.2 10.4L5.8 8Z' },
  { pos: 'bl', rune: 'M8.2 5.2L10.4 7.4L8.2 9.6L6 7.4ZM6.6 9L5.6 11M9.8 9L10.8 11' }
] as const
</script>

<template lang="pug">
  span.card-rune-frame(aria-hidden="true" :style="{ '--frame': color }")
    svg.card-rune-frame__corner(
      v-for="c in CORNERS"
      :key="c.pos"
      :class="`card-rune-frame__corner--${c.pos}`"
      viewBox="0 0 16 16"
    )
      //- bracket: a heavier L hugging the corner, rounded like the card
      path.card-rune-frame__ink(d="M1.5 13V5.5Q1.5 1.5 5.5 1.5H13" stroke-width="3.6")
      path(d="M1.5 13V5.5Q1.5 1.5 5.5 1.5H13" stroke-width="2.2")
      path.card-rune-frame__ink(:d="c.rune" stroke-width="2.6")
      path(:d="c.rune" stroke-width="1.2")
    svg.card-rune-frame__stud(
      v-for="side in ['l', 'r']"
      :key="side"
      :class="`card-rune-frame__stud--${side}`"
      viewBox="0 0 8 14"
    )
      //- a rune-cut stud on the side line: a lozenge with an Isa stroke
      path.card-rune-frame__ink(d="M1 7L4.5 1.5L7.5 7L4.5 12.5Z" stroke-width="2.4")
      path(d="M1 7L4.5 1.5L7.5 7L4.5 12.5Z" stroke-width="1.2")
      path(d="M4.5 4.5V9.5" stroke-width="1")
</template>

<style scoped lang="sass">
// Sits on the card's 2px border ring (absolute boxes start inside the
// border, hence -2px), under the level badge (z-20) and the skin row (z-30).
.card-rune-frame
  position: absolute
  inset: -2px
  z-index: 15
  border: 2px solid var(--frame)
  border-radius: 0.5rem
  box-shadow: inset 0 0 0 1px rgba(15, 26, 48, 0.55)
  pointer-events: none

  svg
    position: absolute
    overflow: visible
    fill: none
    stroke: var(--frame)
    stroke-linecap: round
    stroke-linejoin: round

  .card-rune-frame__ink
    stroke: rgba(15, 26, 48, 0.75)

.card-rune-frame__corner
  width: 16px
  height: 16px

  &--tl
    top: 0
    left: 0
  &--tr
    top: 0
    right: 0
    transform: scaleX(-1)
  &--br
    bottom: 0
    right: 0
    transform: scale(-1, -1)
  &--bl
    bottom: 0
    left: 0
    transform: scaleY(-1)

// On the side line, reaching inward only (its outer tip sits on the 2px
// border itself, flush with the card's outer edge).
.card-rune-frame__stud
  top: 50%
  width: 8px
  height: 14px
  margin-top: -7px

  &--l
    left: 0
  &--r
    right: 0
    transform: scaleX(-1)
</style>
