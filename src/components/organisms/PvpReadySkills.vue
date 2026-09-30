<script setup lang="ts">
// ─── PvP lobby ready card: one side's skill loadout (skills-feature.md §9.1) ──
//
// Icon + level per equipped skill, or a dash. PvPLobbyModal renders it only
// through the lazy `PvpReadySkillsUi` handle of `src/skills/skillsGate.ts`
// (null on a skills-off build, where the lobby keeps its plain ready dots).
import { useI18n } from 'vue-i18n'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import type { SkillLoadout } from '@/types/skills'

defineProps<{
  loadout: SkillLoadout
  /** The local player's side (labels the group "Skills", else "Opponent's skills"). */
  mine: boolean
}>()

const { t } = useI18n()
</script>

<template lang="pug">
  div.flex.items-center.justify-center.gap-2(
    class="min-h-[2.25rem]"
    role="group"
    :aria-label="mine ? t('skills.title') : t('skills.opponentSkills')"
  )
    template(v-for="s in loadout" :key="s.id")
      div.flex.items-center.gap-1
        SkillIcon(:id="s.id" :size="28")
        span.text-white.game-text.font-black(class="text-xs") {{ t('lv') }}{{ s.level }}
    span.text-slate-500.font-bold(
      v-if="!loadout.length"
      aria-hidden="true"
    ) –
</template>
