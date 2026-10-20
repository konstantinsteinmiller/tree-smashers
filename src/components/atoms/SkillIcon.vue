<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SKILLS } from '@/data/skillCatalog'
import type { SkillId } from '@/types/skills'
import { paintedSkillIconUrl, smasherSkillArt } from '@/use/skills/smasherSkillArt'

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
 * `skillKey` (a smasher skill id) swaps the generic effect glyph for that
 * skill's own drawn icon (smasherSkillArt.ts — the art-desk registry; a
 * painted bitmap wins when one is registered). The disc keeps the effect's
 * accent colour, so the effect family still reads at a glance.
 *
 * The aria-label is the skill name; pass `decorative` when a visible name
 * sits next to the icon, so screen readers don't read it twice.
 */

const props = withDefaults(defineProps<{
  id: SkillId
  /** Smasher skill id: draw its own icon + use its name. */
  skillKey?: string
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
const color = computed(() => (props.locked ? '#aab4cc' : def.value.color))
const art = computed(() => smasherSkillArt(props.skillKey))
const painted = computed(() => (props.skillKey && art.value ? paintedSkillIconUrl(props.skillKey) : null))
const label = computed(() => {
  if (props.locked) return '?'
  return art.value ? t(`smasher_skill_${props.skillKey}`) : t(`skills.names.${props.id}`)
})
// Art layers sit in a 24×24 box: on the plate scaled into the disc.
const artTransform = computed(() => (props.plate ? 'translate(9 9) scale(1.25)' : 'scale(2)'))

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
      //- Medallion: ink edge, royal rim with a dark lower band (depth) and a
      //- stitched ring, flat accent disc (no gradients) and a white top lip.
      circle.sk-ink(cx="24" cy="24" r="23.2")
      circle.sk-rim(cx="24" cy="24" r="21.6")
      //- 3D: a darker band along the rim's lower half (the medallion's depth).
      path.sk-band(d="M4.2 27.5A20.2 20.2 0 0 0 43.8 27.5" fill="none" stroke-width="2.6" stroke-linecap="round")
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
    //- The smasher skill's own drawing (or its painting).
    image(
      v-else-if="painted"
      :href="painted"
      :x="plate ? 9 : 0" :y="plate ? 9 : 0"
      :width="plate ? 30 : 48" :height="plate ? 30 : 48"
    )
    g(v-else-if="art" :transform="artTransform" stroke-linejoin="round" stroke-linecap="round")
      template(v-for="(L, i) in art.icon" :key="i")
        path(v-if="L.fill === undefined" :d="L.d" fill="none" :stroke="L.stroke ?? 'var(--color-ink)'" :stroke-width="L.w ?? 1.4")
        template(v-else)
          path(v-if="!L.noInk" :d="L.d" fill="none" stroke="var(--color-ink)" stroke-width="2.2")
          path(:d="L.d" :fill="L.fill")
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
  fill: var(--color-royal-500)

.sk-band
  stroke: var(--color-royal-800)

.sk-stitch
  stroke: var(--color-ice-200)

.sk-lip
  stroke: rgba(255, 255, 255, 0.55)

.sk-q
  fill: var(--color-ice-50)
  stroke: var(--color-ink)
</style>
