<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { SKILLS } from '@/data/skillCatalog'
import type { SkillId } from '@/types/skills'

/**
 * ─── Skill medallion ────────────────────────────────────────────────────────
 *
 * One inline SVG, no image request: a dark bezel, a disc tinted with the
 * skill's accent colour and the catalog glyph (24×24 solid path, the
 * game-ui-icon-set style) on top. The same path feeds `new Path2D()` on the
 * canvas, so DOM and canvas show the identical shape.
 *
 *   plate=false   → glyph only (HUD chips, inline text)
 *   locked        → slate silhouette with a "?" — the skill is not unlocked
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
const uid = useId()

const def = computed(() => SKILLS[props.id])
const color = computed(() => (props.locked ? '#64748b' : def.value.color))
const label = computed(() => (props.locked ? '?' : t(`skills.names.${props.id}`)))

const discId = `sk-disc-${uid}`
const rimId = `sk-rim-${uid}`
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
    defs(v-if="plate")
      radialGradient(:id="discId" cx="0.5" cy="0.35" r="0.75")
        stop(offset="0" :stop-color="color" stop-opacity="0.55")
        stop(offset="0.55" stop-color="#1e293b" stop-opacity="0.95")
        stop(offset="1" stop-color="#0b1120")
      linearGradient(:id="rimId" x1="0" y1="0" x2="0" y2="1")
        stop(offset="0" stop-color="#fde68a")
        stop(offset="0.5" stop-color="#b45309")
        stop(offset="1" stop-color="#78350f")
    template(v-if="plate")
      circle(cx="24" cy="24" r="23.2" fill="#0b1120")
      circle(cx="24" cy="24" r="22" :fill="`url(#${rimId})`")
      circle(cx="24" cy="24" r="19.4" :fill="`url(#${discId})`")
      //- top sheen
      ellipse(cx="24" cy="13" rx="13" ry="5.5" fill="#ffffff" opacity="0.1")
    //- Locked: a "?" in place of the glyph (the skill stays a secret).
    text(
      v-if="locked"
      x="24" y="32" text-anchor="middle"
      font-size="24" font-weight="900" fill="#94a3b8"
      stroke="#0b1120" stroke-width="1.5" paint-order="stroke"
    ) ?
    g(
      v-else
      :transform="plate ? 'translate(10.4 10.4) scale(1.133)' : 'scale(2)'"
    )
      //- Dark outline under the glyph keeps it legible on any tint.
      path(
        v-if="plate"
        :d="def.icon"
        fill="#0b1120"
        stroke="#0b1120"
        stroke-width="2.2"
        stroke-linejoin="round"
      )
      path(:d="def.icon" :fill="color")
</template>

<style scoped lang="sass">
.skill-icon
  display: block
  overflow: visible
</style>
