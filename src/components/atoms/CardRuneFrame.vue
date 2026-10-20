<script setup lang="ts">
import { computed } from 'vue'
import { RARITY_EDGE, type SmasherRarity } from '@/data/smasherRarity'

/**
 * The border of a team / roster card: a bold collectible-card frame. It
 * REPLACES the card's own border: the card keeps a 2px border for its layout,
 * and this frame paints over exactly that ring — a solid ink edge, an inner
 * EDGE band in the card's rarity colour (thicker along the base, like a
 * trading card), flat diagonal stripes in the top-right corner, and an ink
 * keyline. Everything stays inside the card's footprint, so it never touches
 * a neighbouring card.
 *
 * (The component name is kept for its API: `partId` + `selected`.) The edge
 * colour is the smasher's RARITY when given (presentation only, see
 * smasherRarity.ts), else the archetype part colour. Selected cards swap the
 * band to sun yellow so the pick reads at a glance.
 */

// Part colours (fallback when no rarity is passed), from the design tokens.
const PART_FRAME_COLORS: Record<string, string> = {
  star: 'var(--color-sun-500)',
  triangle: 'var(--color-berry-500)',
  round: 'var(--color-sky-500)',
  quadratic: 'var(--color-leaf-500)',
  cushioned: 'var(--color-plum-500)',
  piercer: 'var(--color-berry-400)',
  speedy: 'var(--color-sky-400)',
  tanky: 'var(--color-royal-500)',
  balanced: 'var(--color-leaf-400)'
}

const props = defineProps<{ partId: string, selected?: boolean, rarity?: SmasherRarity, locked?: boolean }>()

const color = computed(() => {
  if (props.selected) return 'var(--color-sun-400)'
  if (props.locked) return 'var(--color-steel-500)'
  if (props.rarity) return RARITY_EDGE[props.rarity]
  return PART_FRAME_COLORS[props.partId] ?? 'var(--color-royal-500)'
})
</script>

<template lang="pug">
  span.card-rune-frame(aria-hidden="true" :class="{ 'is-selected': selected }" :style="{ '--frame': color }")
</template>

<style scoped lang="sass">
// Sits on the card's 2px border ring (absolute boxes start inside the
// border, hence -2px), under the level badge (z-20) and the skin row (z-30).
.card-rune-frame
  position: absolute
  inset: -2px
  z-index: 15
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  // edge band + thicker base band (0-blur insets) + an ink keyline inside
  box-shadow: inset 0 0 0 3px var(--frame), inset 0 -6px 0 var(--frame), inset 0 0 0 4.5px rgba(22, 26, 64, 0.4)
  pointer-events: none

  // Corner stripes: a triangle of flat diagonal bars in the edge colour.
  &::after
    content: ''
    position: absolute
    top: 0
    right: 0
    width: 1.9rem
    height: 1.9rem
    background-image: repeating-linear-gradient(315deg, var(--frame) 0 3px, transparent 3px 7px)
    clip-path: polygon(30% 0, 100% 0, 100% 70%)
    border-top-right-radius: calc(var(--radius-ui) - 3px)

  &.is-selected
    box-shadow: inset 0 0 0 4px var(--frame), inset 0 -7px 0 var(--frame), inset 0 0 0 5.5px rgba(22, 26, 64, 0.4)
</style>
