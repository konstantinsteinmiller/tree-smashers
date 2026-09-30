<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import { UI_GLYPHS } from '@/data/uiGlyphs'
import { SKILL_MAX_LEVEL } from '@/data/skillCatalog'
import type { SkillId } from '@/types/skills'

/**
 * ─── Team-modal skill slot (skills-feature.md §7.2) ─────────────────────────
 *
 * Three looks, one button:
 *   filled   medallion, name, "Lv.N" and a 10-segment level bar
 *   empty    dashed frame, "+" glyph, "Empty"
 *   locked   padlock + "Stage N" badge (tap → the parent shows the teaser)
 *
 * On a short landscape phone the name and the bar drop out (icon + "Lv.N"
 * only; the picker carries the name); from 640 px an optional one-line
 * `effect` sits under the name. Always ≥ 44 px tall. Presentation only: the
 * parent decides what a tap does.
 */

const props = withDefaults(defineProps<{
  slotIndex: number
  skillId?: SkillId | null
  level?: number
  locked?: boolean
  /** Stage whose boss opens this slot (locked tiles). */
  unlockStage?: number
  isNew?: boolean
  breathe?: boolean
  /** Optional one-line effect (shown ≥ 640 px). */
  effect?: string
}>(), {
  skillId: null,
  level: 0,
  locked: false,
  unlockStage: 0,
  isNew: false,
  breathe: false,
  effect: ''
})

const emit = defineEmits<{ (e: 'select', slotIndex: number): void }>()
const { t } = useI18n()

const state = computed<'locked' | 'filled' | 'empty'>(() =>
  props.locked ? 'locked' : props.skillId ? 'filled' : 'empty'
)

/** Locked tiles carry no readable text of their own besides "Stage N". */
const aria = computed(() =>
  state.value === 'locked' ? t('skills.lockedSkill', { n: props.unlockStage }) : undefined
)

const segments = computed(() => Array.from({ length: SKILL_MAX_LEVEL }, (_, i) => i < props.level))
</script>

<template lang="pug">
  button.skill-slot.relative.flex.items-center.w-full.rounded-lg.border-2.text-left.cursor-pointer.transition-transform(
    type="button"
    :aria-label="aria"
    :data-state="state"
    :class="[\
      `is-${state}`,\
      { 'is-breathing': breathe }\
    ]"
    class="active:scale-95"
    @click="emit('select', slotIndex)"
  )
    //- ── Filled ──
    template(v-if="state === 'filled' && skillId")
      SkillIcon.skill-slot__icon(:id="skillId" :size="32" decorative)
      span.skill-slot__body.flex.flex-col.min-w-0
        span.skill-slot__name.font-black.text-white.game-text {{ t(`skills.names.${skillId}`) }}
        span.flex.items-center(class="gap-1.5")
          span.skill-slot__lv.font-black.game-text.text-yellow-300 {{ t('lv') }}{{ level }}
          span.skill-slot__bar.flex(aria-hidden="true")
            span.skill-slot__seg(v-for="(on, i) in segments" :key="i" :class="{ 'is-on': on }")
        span.skill-slot__effect.text-slate-300(v-if="effect") {{ effect }}
    //- ── Empty ──
    template(v-else-if="state === 'empty'")
      span.skill-slot__glyph.flex.items-center.justify-center.rounded-full(aria-hidden="true")
        svg(viewBox="0 0 24 24" width="18" height="18")
          path(:d="UI_GLYPHS.plus" fill="currentColor")
      span.skill-slot__body.flex.flex-col.min-w-0
        span.skill-slot__name.font-black.game-text.text-slate-200 {{ t('skills.slotEmpty') }}
    //- ── Locked ──
    template(v-else)
      span.skill-slot__glyph.is-lock.flex.items-center.justify-center.rounded-full(aria-hidden="true")
        svg(viewBox="0 0 24 24" width="16" height="16")
          path(:d="UI_GLYPHS.lock" fill="currentColor")
      span.skill-slot__stage.font-black.game-text.uppercase.text-slate-200.rounded-md {{ t('skills.unlockAt', { n: unlockStage }) }}
    span.skill-slot__new.absolute.font-black.uppercase.rounded-full(v-if="isNew && !locked") {{ t('skills.new') }}
</template>

<style scoped lang="sass">
.skill-slot
  min-height: 44px
  gap: 0.5rem
  padding: 0.3rem 0.5rem 0.3rem 0.35rem
  -webkit-tap-highlight-color: transparent

  &.is-filled
    background: linear-gradient(to bottom, #334155, #1e293b)
    border-color: #facc15
    box-shadow: 0 3px 0 #0f172a, inset 0 1px 0 rgba(255, 255, 255, 0.12)

  &.is-empty
    background: rgba(30, 41, 59, 0.55)
    border-style: dashed
    border-color: #94a3b8
    color: #e2e8f0

  &.is-locked
    background: #1e293b
    border-color: #475569
    color: #94a3b8

  &.is-breathing
    animation: skill-slot-breathe 1.2s ease-in-out infinite

.skill-slot__body
  flex: 1 1 auto
  gap: 1px

.skill-slot__name
  font-size: 0.82rem
  line-height: 1.05
  // Wraps to a second line rather than truncating ("Homing Rockets" in a
  // 130 px portrait tile); the tile simply grows a few px.
  overflow-wrap: break-word

.skill-slot__lv
  font-size: 0.75rem
  line-height: 1

.skill-slot__bar
  gap: 1px

.skill-slot__seg
  width: 5px
  height: 6px
  border-radius: 1px
  background: rgba(148, 163, 184, 0.35)

  &.is-on
    background: linear-gradient(to bottom, #fde047, #f59e0b)

.skill-slot__effect
  display: none
  font-size: 0.7rem
  line-height: 1.15

.skill-slot__glyph
  width: 32px
  height: 32px
  flex-shrink: 0
  background: rgba(15, 23, 42, 0.7)
  border: 2px solid currentColor

  &.is-lock
    border-color: #475569

.skill-slot__stage
  font-size: 0.72rem
  padding: 2px 6px
  background: #0f172a
  border: 1px solid #475569

.skill-slot__new
  top: -0.45rem
  right: -0.35rem
  font-size: 0.6rem
  line-height: 1
  padding: 2px 5px
  color: #fff
  background: linear-gradient(to bottom, #ef4444, #b91c1c)
  border: 1px solid #fecaca
  box-shadow: 0 1px 0 #450a0a

@media (min-width: 640px)
  .skill-slot__effect
    display: block

  .skill-slot__name
    font-size: 0.95rem

// Short landscape phone: icon + "Lv.N" only.
@media (orientation: landscape) and (max-height: 500px)
  .skill-slot
    gap: 0.3rem
    padding: 0.2rem 0.35rem 0.2rem 0.25rem

  .skill-slot__name, .skill-slot__bar, .skill-slot__effect
    display: none

  .skill-slot.is-empty .skill-slot__name
    display: block
    font-size: 0.72rem

@keyframes skill-slot-breathe
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.06)

@media (prefers-reduced-motion: reduce)
  .skill-slot.is-breathing
    animation: none
</style>
