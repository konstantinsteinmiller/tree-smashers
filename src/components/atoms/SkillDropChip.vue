<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import { SKILL_TEASER_STAGE } from '@/data/skillCatalog'
import { bossDropChip } from '@/use/skillText'
import useSkills from '@/use/useSkills'

/**
 * ─── "This boss drops a skill" chip (skills-feature.md §7.5) ────────────────
 *
 * A small medallion for the boss of `bossStageId`, shown while its skill is
 * still locked: the skill glyph, or a "?" before the first skill exists.
 * Renders nothing on non-boss / already-unlocked stages, below the teaser
 * stage and on builds with skills off. Non-interactive: taps fall through
 * to whatever the host badge does.
 */

const props = withDefaults(defineProps<{
  bossStageId: number
  size?: number
}>(), {
  size: 20
})

const { t } = useI18n()
const { highestCleared, isSkillsEnabled } = useSkills()

const chip = computed(() =>
  bossDropChip(props.bossStageId, highestCleared.value, isSkillsEnabled, SKILL_TEASER_STAGE)
)

const label = computed(() =>
  !chip.value ? '' : chip.value.mystery
    ? t('skills.bossDropMystery')
    : t('skills.bossDrop', { name: t(`skills.names.${chip.value.id}`) })
)
</script>

<template lang="pug">
  span.skill-drop-chip.inline-flex.pointer-events-none(
    v-if="chip"
    role="img"
    :aria-label="label"
    :title="label"
    :data-skill="chip.id"
    :data-mystery="chip.mystery ? 'true' : undefined"
  )
    SkillIcon(:id="chip.id" :size="size" :locked="chip.mystery" decorative)
</template>

<style scoped lang="sass">
.skill-drop-chip
  border-radius: 9999px
  animation: skill-drop-bob 2.4s ease-in-out infinite

@keyframes skill-drop-bob
  0%, 100%
    transform: translateY(0)
  50%
    transform: translateY(-2px)

@media (prefers-reduced-motion: reduce)
  .skill-drop-chip
    animation: none
</style>
