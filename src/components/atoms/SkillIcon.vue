<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SKILLS } from '@/data/skillCatalog'
import type { SkillId } from '@/types/skills'

/**
 * ─── Skill medallion ────────────────────────────────────────────────────────
 *
 * One inline SVG, no image request: an ink-edged wood rim with a stitched
 * ring, a flat disc in the skill's accent colour and the cream catalog glyph (24×24 solid path, the
 * game-ui-icon-set style) on top. The same path feeds `new Path2D()` on the
 * canvas, so DOM and canvas show the identical shape.
 *
 *   plate=false   → glyph only (HUD chips, inline text)
 *   locked        → taupe silhouette with a "?" — the skill is not unlocked
 *                   yet, so its name and look stay a secret (§7.3)
 *
 * The aria-label is the skill name; pass `decorative` when a visible name
 * sits next to the icon, so screen readers don't read it twice.
 */

const props = withDefaults(defineProps<{
  id: SkillId
  /** Rendered size in px (square). */
  size?: number
  plate?: boolean
  locked?: boolean
  decorative?: boolean
}>(), {
  size: 32,
  plate: true,
  locked: false,
  decorative: false
})

const { t } = useI18n()

const def = computed(() => SKILLS[props.id])
const color = computed(() => (props.locked ? '#b9ab95' : def.value.color))
const label = computed(() => (props.locked ? '?' : t(`skills.names.${props.id}`)))

</script>

<template lang="pug">
  svg.skill-icon.shrink-0(
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label"
    :aria-hidden="decorative ? 'true' : undefined"
    :data-skill="id"
    :class="{ 'is-locked': locked }"
  )
    template(v-if="plate")
      //- Cozy medallion: ink edge, wood rim with a stitched ring, flat
      //- accent disc (no gradients) and a cream top lip.
      circle.sk-ink(cx="24" cy="24" r="23.2")
      circle.sk-rim(cx="24" cy="24" r="21.6")
      circle.sk-stitch(cx="24" cy="24" r="19.6" fill="none" stroke-width="1.1" stroke-dasharray="2.4 2")
      circle.sk-ink(cx="24" cy="24" r="17.6")
      circle(cx="24" cy="24" r="16.4" :style="{ fill: color }")
      path.sk-lip(d="M12.2 20.5A12.4 12.4 0 0 1 35.8 20.5" fill="none" stroke-width="2.2" stroke-linecap="round")
    //- Locked: a "?" in place of the glyph (the skill stays a secret).
    text.sk-q(
      v-if="locked"
      x="24" y="32" text-anchor="middle"
      font-size="24" font-weight="900"
      stroke-width="3" paint-order="stroke"
    ) ?
    g(
      v-else
      :transform="plate ? 'translate(10.4 10.4) scale(1.133)' : 'scale(2)'"
    )
      //- Ink outline under the glyph keeps it legible on any tint.
      path.sk-ink(
        v-if="plate"
        :d="def.icon"
        stroke-width="2.2"
        stroke-linejoin="round"
      )
      path(:d="def.icon" :style="{ fill: plate ? 'var(--color-cream-50)' : color }")
</template>

<style scoped lang="sass">
.skill-icon
  display: block
  overflow: visible

.sk-ink
  fill: var(--color-ink)
  stroke: var(--color-ink)

circle.sk-ink
  stroke: none

.sk-rim
  fill: var(--color-wood-500)

.sk-stitch
  stroke: var(--color-cream-200)

.sk-lip
  stroke: rgba(255, 250, 240, 0.45)

.sk-q
  fill: var(--color-cream-50)
  stroke: var(--color-ink)
</style>
