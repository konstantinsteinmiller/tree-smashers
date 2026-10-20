<script setup lang="ts">
import { computed } from 'vue'

/**
 * The border of a team / roster card: a cozy stitched-fabric patch. It
 * REPLACES the card's own border: the card keeps a 2px border for its layout,
 * and this frame paints over exactly that ring — a solid ink edge, a felt band
 * in the part's colour, a dashed "sewn" stitch line just inside it and a
 * little button stud at the top centre. Everything stays inside the card's
 * footprint, so it never touches a neighbouring card.
 *
 * (The component name is kept for its API: `partId` + `selected`.)
 * Selected cards swap the felt band to sun gold so the pick reads at a glance.
 */

// Felt colours per part, from the design tokens (no hard-coded hex).
const PART_FRAME_COLORS: Record<string, string> = {
  star: 'var(--color-sun-500)',
  triangle: 'var(--color-berry-500)',
  round: 'var(--color-sky-500)',
  quadratic: 'var(--color-leaf-500)',
  cushioned: 'var(--color-plum-500)',
  piercer: 'var(--color-berry-400)',
  speedy: 'var(--color-sky-400)',
  tanky: 'var(--color-wood-500)',
  balanced: 'var(--color-leaf-400)'
}

const props = defineProps<{ partId: string, selected?: boolean }>()

const color = computed(() =>
  props.selected ? 'var(--color-sun-400)' : (PART_FRAME_COLORS[props.partId] ?? 'var(--color-wood-500)')
)
</script>

<template lang="pug">
  span.card-rune-frame(aria-hidden="true" :class="{ 'is-selected': selected }" :style="{ '--frame': color }")
    span.card-rune-frame__stud
</template>

<style scoped lang="sass">
// Sits on the card's 2px border ring (absolute boxes start inside the
// border, hence -2px), under the level badge (z-20) and the skin row (z-30).
.card-rune-frame
  position: absolute
  inset: -2px
  z-index: 15
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui)
  // felt band (0-blur inset ring) + a thin ink keyline inside it
  box-shadow: inset 0 0 0 3px var(--frame), inset 0 0 0 4px rgba(58, 35, 20, 0.35)
  pointer-events: none

  // the sewn stitch, just inside the felt band
  &::after
    content: ''
    position: absolute
    inset: 5px
    border: 1.5px dashed rgba(58, 35, 20, 0.45)
    border-radius: calc(var(--radius-ui) - 4px)

.card-rune-frame__stud
  position: absolute
  top: 1px
  left: 50%
  width: 8px
  height: 8px
  margin-left: -4px
  border-radius: 999px
  background-color: var(--frame)
  border: 1.5px solid var(--color-ink)
  box-shadow: inset 0 1.5px 0 rgba(255, 250, 240, 0.6)
</style>
