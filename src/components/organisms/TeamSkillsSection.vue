<script setup lang="ts">
// ─── Team modal: SKILLS section (skills-feature.md §7.2) ─────────────────────
//
// The skills row of SpinnerConfigModal, split out so a skills-off build never
// bundles it: SpinnerConfigModal renders it only through the lazy
// `TeamSkillsSectionUi` handle of `src/skills/skillsGate.ts` (null when the
// flag is off). Everything skill-side the Team modal needs lives here — the
// slot tiles, the "i" skill list, the picker, the NEW badge and the slot-open
// auto-fill — so the modal itself imports nothing from the skill system.
//
// The loadout belongs to the TEAM, so the row is identical on both blade tabs.
// Hidden below the teaser stage. A locked slot is explained in the modal's own
// speech bubble (`locked` event), which sits outside the modal's scroll box.
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SkillSlotTile from '@/components/molecules/SkillSlotTile.vue'
import SkillPickerModal from '@/components/organisms/SkillPickerModal.vue'
import useSkills from '@/use/useSkills'
import { SKILL_TEAM_SLOTS, SKILL_UNLOCK_CLEARED, SKILL_SLOT2_CLEARED } from '@/data/skillCatalog'
import type { SkillId } from '@/types/skills'
import { skillValuesText } from '@/use/skillText'

const props = defineProps<{
  /** The Team modal is open (runs the slot-open auto-fill on every open). */
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'locked', text: string): void
}>()

const { t, locale } = useI18n()
const skills = useSkills()

const SLOT_INDICES = Array.from({ length: SKILL_TEAM_SLOTS }, (_, i) => i)
const SLOT_UNLOCK = [SKILL_UNLOCK_CLEARED, SKILL_SLOT2_CLEARED]

const showSkillsSection = computed(() =>
  skills.isSkillsEnabled && (skills.slotCount.value > 0 || skills.showTeaser.value)
)
/** Unlocked skills the player has not learned yet → NEW. */
const hasNewSkill = computed(() => skills.unlockedIds.value.some(id => !skills.isLearned(id)))
/** Learned skills sitting in no slot. */
const hasFreeLearned = computed(() =>
  skills.unlockedIds.value.some(id => skills.isLearned(id) && !skills.slots.value.includes(id))
)
const slotLocked = (i: number) => i >= skills.slotCount.value
const slotSkill = (i: number): SkillId | null => (slotLocked(i) ? null : skills.slots.value[i] ?? null)
const slotLevel = (i: number): number => {
  const id = slotSkill(i)
  return id ? skills.levelOf(id) : 0
}
const slotEffect = (id: SkillId | null) =>
  id
    ? skillValuesText(id, skills.levelOf(id), n => t('skills.seconds', { n }), {
      locale: locale.value,
      percent: n => t('skills.percent', { n })
    })
    : ''

const skillPickerOpen = ref(false)
const skillPickerSlot = ref<number | null>(null)

const onSkillSlot = (i: number) => {
  if (slotLocked(i)) {
    emit('locked', skills.slotCount.value === 0
      ? t('skills.teaser', { n: SLOT_UNLOCK[0] })
      : t('skills.lockedSkill', { n: SLOT_UNLOCK[i] }))
    return
  }
  skillPickerSlot.value = i
  skillPickerOpen.value = true
}

const openSkillList = () => {
  if (skills.slotCount.value === 0) return onSkillSlot(0)
  skillPickerSlot.value = null
  skillPickerOpen.value = true
}

// Slot-open auto-fill (§6.2) runs when the Team modal opens, so a slot that
// opened since the last visit shows its skill right away.
watch(() => props.open, (open) => {
  if (open) skills.syncAutofill()
}, { immediate: true })
</script>

<template lang="pug">
  div.skills-section(v-if="showSkillsSection" data-testid="config-skills")
    div.flex.items-center.mb-1(class="gap-1.5")
      h3.text-yellow-300.font-black.uppercase.italic.label-section.m-0(
        class="tracking-wider"
      ) {{ t('skills.title') }}
      //- "Both spinners" glyph: two overlapping spinner outlines.
      svg.skills-both.shrink-0(viewBox="0 0 24 24" width="18" height="18" role="img" :aria-label="t('skills.hint')")
        circle(cx="9" cy="12" r="6" fill="none" stroke="#93c5fd" stroke-width="2.2")
        circle(cx="15" cy="12" r="6" fill="none" stroke="#93c5fd" stroke-width="2.2")
      span.skills-new.font-black.uppercase.rounded-full(v-if="hasNewSkill") {{ t('skills.new') }}
      button.skills-info.ml-auto.flex.items-center.justify-center.rounded-full.font-black.cursor-pointer(
        type="button"
        :aria-label="t('skills.title')"
        data-action="skill-list"
        @click="openSkillList"
      ) i
    div.skills-grid.grid
      SkillSlotTile(
        v-for="i in SLOT_INDICES"
        :key="i"
        :slot-index="i"
        :skill-id="slotSkill(i)"
        :level="slotLevel(i)"
        :locked="slotLocked(i)"
        :unlock-stage="SLOT_UNLOCK[i]"
        :breathe="!slotLocked(i) && !slotSkill(i) && (hasFreeLearned || hasNewSkill)"
        :effect="slotEffect(slotSkill(i))"
        @select="onSkillSlot"
      )
    //- The picker is an FModal (teleported to <body>), so it can live here.
    SkillPickerModal(
      v-model="skillPickerOpen"
      :slot-index="skillPickerSlot"
    )
</template>

<style scoped lang="sass">
.skills-section
  padding-top: 0.375rem
  margin-top: 0.25rem
  border-top: 1px solid rgba(100, 116, 139, 0.5)

.skills-grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 0.5rem

.skills-new
  font-size: 0.6rem
  line-height: 1
  padding: 2px 5px
  color: #fff
  background: linear-gradient(to bottom, #ef4444, #b91c1c)
  border: 1px solid #fecaca

.skills-info
  width: 1.6rem
  height: 1.6rem
  font-size: 0.85rem
  font-style: italic
  color: #fde047
  background: #1e293b
  border: 2px solid #facc15

@media (orientation: landscape) and (max-height: 500px)
  .skills-section
    padding-top: 0.15rem
    margin-top: 0.1rem

  .skills-grid
    gap: 0.25rem
</style>
