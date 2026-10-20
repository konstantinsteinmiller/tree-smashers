<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BossTrait } from '@/types/spinner'

/**
 * ─── Boss-trait glyph (bosses-100-feature.md §7.2) ──────────────────────────
 *
 * One of the three stage-101+ boss mechanics as a solid 24×24 glyph in the
 * shared game-ui-icon-set style (ink outline, token hexes — SVG attributes cannot read CSS vars — under a coloured body):
 *
 *   ember → a flame inside a ring      (Ember Nova — Cinder Tyrant)
 *   frost → an ice block               (Frost Lock — Glacier Warden)
 *   chill → a six-armed snowflake      (Frostbite — Frostbite Yeti)
 *
 * Used by the next-boss teaser (BossPeekBadge), the boss intro card and the
 * Boss Lab. `decorative` hides it from assistive tech when a caption next to
 * it already names the trait; otherwise it is an image named by the trait.
 */

const props = withDefaults(defineProps<{
  trait: BossTrait
  /** Rendered size in px (square). */
  size?: number
  decorative?: boolean
}>(), {
  size: 20,
  decorative: false
})

const { t } = useI18n()

const label = computed(() => t(`bosses.traits.${props.trait}`))

// Six snowflake arms with two side branches each — the same figure as the
// canvas popup glyph (bossTraitVfx `snowflakePath`), precomputed once.
const SNOWFLAKE = (() => {
  let d = ''
  const f = (n: number) => n.toFixed(2)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 - Math.PI / 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    d += `M12 12L${f(12 + ca * 9.5)} ${f(12 + sa * 9.5)}`
    const bx = 12 + ca * 5.8
    const by = 12 + sa * 5.8
    for (const s of [-1, 1]) {
      const b = a + s * 0.8
      d += `M${f(bx)} ${f(by)}L${f(bx + Math.cos(b) * 3.4)} ${f(by + Math.sin(b) * 3.4)}`
    }
  }
  return d
})()

const FLAME = 'M12 5.2C13.6 7.7 16 9.3 16 12.6A4 4 0 0 1 8 12.6C8 11 8.8 9.9 9.7 9.1C9.8 10.4 10.4 11.3 11.2 11.5C11 9.4 11.3 7.3 12 5.2Z'
const FLAME_CORE = 'M12 10.6C12.8 11.8 13.7 12.6 13.7 13.9A1.7 1.7 0 0 1 10.3 13.9C10.3 12.8 11.3 11.9 12 10.6Z'
</script>

<template lang="pug">
  svg.boss-trait-glyph.shrink-0(
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label"
    :aria-hidden="decorative ? 'true' : undefined"
    focusable="false"
  )
    title(v-if="!decorative") {{ label }}
    //- Ember Nova: flame in a ring.
    g(v-if="trait === 'ember'")
      circle(cx="12" cy="12" r="9.2" fill="none" stroke="#161a40" stroke-width="4.2")
      circle(cx="12" cy="12" r="9.2" fill="none" stroke="#ffae00" stroke-width="2.2")
      path(:d="FLAME" fill="#ffd21a" stroke="#161a40" stroke-width="1.6" stroke-linejoin="round")
      path(:d="FLAME_CORE" fill="#fff7a3")
    //- Frost Lock: an ice block with two shine strokes.
    g(v-else-if="trait === 'frost'")
      rect(x="4" y="4" width="16" height="16" rx="3" fill="#7fdcff" stroke="#161a40" stroke-width="2")
      path(d="M4.8 9.2L20 9.2M9.2 4.8L9.2 20" stroke="#0b80d0" stroke-width="1.2" opacity="0.7")
      path(d="M7 15.5L10 12.5M11.5 17L16 12.5" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round")
    //- Frostbite: snowflake.
    g(v-else)
      path(:d="SNOWFLAKE" fill="none" stroke="#161a40" stroke-width="4.4" stroke-linecap="round")
      path(:d="SNOWFLAKE" fill="none" stroke="#c6f2ff" stroke-width="2.2" stroke-linecap="round")
</template>

<style scoped lang="sass">
.boss-trait-glyph
  display: inline-block
  vertical-align: middle
  overflow: visible
</style>
