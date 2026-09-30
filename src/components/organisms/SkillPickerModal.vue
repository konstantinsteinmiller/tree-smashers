<script lang="ts">
// ─── Build-only UI, picked at module scope ─────────────────────────────────
// Same rule as SpinnerArena.vue: a template `v-if` on the build flag does not
// drop the dead branch (it compiles to `unref(FLAG)` inside the render
// function), a module-scope ternary on the `import.meta.env`-derived flag
// does. On a no-ad build `SkillTopUpButton` is never referenced, so neither it
// nor its rewarded-ad wiring is bundled, and no top-up is ever rendered.
import { HAS_REWARDED_ADS as ADS_BUILD_FLAG } from '@/platforms/rewardedAdsBuild'
import SkillTopUpButton from '@/components/organisms/SkillTopUpButton.vue'

/** "[movie] +N coins" on an unaffordable learn / upgrade — ad builds only. */
const TopUpButton = ADS_BUILD_FLAG ? SkillTopUpButton : null
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { UI_GLYPHS } from '@/data/uiGlyphs'
import { SKILLS, SKILL_MAX_LEVEL } from '@/data/skillCatalog'
import type { SkillId } from '@/types/skills'
import useSkills from '@/use/useSkills'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSounds from '@/use/useSound'
import { pickerCards, skillDescParams, skillValuesText, type PickerCard } from '@/use/skillText'

/**
 * ─── Skill picker (skills-feature.md §7.3) ──────────────────────────────────
 *
 * Opened from a Team-modal slot (`slotIndex` = 0 / 1) or without one (=
 * null → learn / upgrade only, no equip). One card per skill, in the order
 * `pickerCards` pins: this slot's skill, learned & free, the other slot's,
 * unlocked-not-learned, locked.
 *
 *   • tap a learned card body = equip into `slotIndex` (swaps when it sits in the
 *     other slot); the equipped card shows "Equipped ✓" + Remove;
 *   • learn / upgrade bar: `⬆ 🪙 cost`, disabled (grey) when unaffordable,
 *     `MAX` at L10; the optional rewarded top-up sits beside a disabled bar
 *     on ad builds only (module-scope pick above);
 *   • locked: silhouette, name hidden, "Unlocks after the Stage N boss".
 *
 * All state lives in `useSkills` (coins go through `useSpinnerConfig`).
 */

const props = withDefaults(defineProps<{
  modelValue: boolean
  slotIndex?: number | null
}>(), {
  slotIndex: null
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { t, locale } = useI18n()
const skills = useSkills()
const { coins } = useSpinnerConfig()

// Opening the picker shows every unlocked skill → they count as viewed
// (clears the Team button NEW dot, persisted in the skills ui key).
watch(() => props.modelValue, (open) => {
  if (open) skills.markViewed(skills.unlockedIds.value)
}, { immediate: true })

const cards = computed<PickerCard[]>(() =>
  pickerCards(props.slotIndex, skills.slots.value, skills.isUnlocked, skills.isLearned)
)

const title = computed(() =>
  props.slotIndex == null ? t('skills.title') : t('skills.pickerTitle', { n: props.slotIndex + 1 })
)

const canEquipHere = computed(() => props.slotIndex != null && props.slotIndex < skills.slotCount.value)

const desc = (id: SkillId) =>
  t(`skills.desc.${id}`, skillDescParams(id, Math.max(1, skills.levelOf(id)), locale.value))

const nextLine = (id: SkillId) =>
  t('skills.nextLine', {
    values: skillValuesText(id, skills.levelOf(id) + 1, n => t('skills.seconds', { n }), {
      locale: locale.value,
      percent: n => t('skills.percent', { n })
    })
  })

const costOf = (id: SkillId): number | null => skills.nextCost(id)
const affordable = (id: SkillId) => {
  const c = costOf(id)
  return c != null && coins.value >= c
}

const buy = (id: SkillId) => {
  if (!affordable(id)) return
  const res = skills.levelOf(id) === 0 ? skills.learn(id) : skills.upgrade(id)
  if (res === 'ok') useSounds().playSound('level-up')
}

const onCardTap = (card: PickerCard) => {
  if (!canEquipHere.value || props.slotIndex == null) return
  if (card.kind === 'free' || card.kind === 'other') skills.equip(props.slotIndex, card.id)
}

const remove = () => {
  if (props.slotIndex != null) skills.unequip(props.slotIndex)
}

const buyAria = (id: SkillId) => {
  const cost = costOf(id) ?? 0
  const name = t(`skills.names.${id}`)
  return skills.levelOf(id) === 0
    ? t('skills.learnAria', { name, cost }, cost)
    : t('skills.upgradeAria', { name, cost }, cost)
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :is-closable="true"
    :title="title"
  )
    div.skill-picker(class="px-2 sm:px-4 py-2" data-testid="skill-picker")
      div.flex.items-center.justify-between.mb-2
        div.flex.items-center.gap-1.rounded.font-bold(
          class="px-2 py-0.5 bg-yellow-600/60 text-yellow-300 text-[0.85rem] sm:text-sm"
        )
          IconCoin(class="w-3.5 h-3.5 text-yellow-300")
          span.skill-picker__coins {{ coins }}
      div.skill-picker-grid.grid
        div.skill-card.relative.flex.flex-col.rounded-xl.border-2(
          v-for="card in cards"
          :key="card.id"
          :data-skill="card.id"
          :data-kind="card.kind"
          :class="[`is-${card.kind}`, { 'is-tappable': canEquipHere && (card.kind === 'free' || card.kind === 'other') }]"
          @click="onCardTap(card)"
        )
          //- ── Locked: the skill stays a secret ──
          template(v-if="card.kind === 'locked'")
            div.flex.items-center.gap-2
              SkillIcon(:id="card.id" :size="40" locked decorative)
              div.skill-card__locked.font-bold.text-slate-400 {{ t('skills.lockedSkill', { n: SKILLS[card.id].unlockStage }) }}
          template(v-else)
            div.flex.items-center.gap-2
              SkillIcon(:id="card.id" :size="44" decorative)
              div.flex.flex-col.min-w-0.flex-1
                div.flex.flex-wrap.items-center.min-w-0(class="gap-x-2 gap-y-0.5")
                  span.skill-card__name.font-black.text-white.game-text {{ t(`skills.names.${card.id}`) }}
                  span.skill-card__new.font-black.uppercase.rounded-full(v-if="card.kind === 'unlearned'") {{ t('skills.new') }}
                span.skill-card__lv.font-black.game-text.text-yellow-300(v-if="skills.levelOf(card.id) > 0")
                  | {{ t('lv') }}{{ skills.levelOf(card.id) }}
            p.skill-card__desc.text-slate-200.m-0 {{ desc(card.id) }}
            p.skill-card__next.text-cyan-300.font-bold.m-0(
              v-if="skills.levelOf(card.id) > 0 && skills.levelOf(card.id) < SKILL_MAX_LEVEL"
            ) {{ nextLine(card.id) }}
            //- ── Actions ──
            div.skill-card__actions.flex.flex-wrap.items-center.justify-between.mt-auto
              //- Left: equip state (slot context only)
              div.flex.items-center(class="gap-1.5")
                template(v-if="card.kind === 'here' && canEquipHere")
                  span.skill-card__equipped.inline-flex.items-center.gap-1.font-black.uppercase.text-green-300
                    svg(viewBox="0 0 24 24" width="14" height="14" aria-hidden="true")
                      path(:d="UI_GLYPHS.check" fill="currentColor")
                    | {{ t('skills.equipped') }}
                  button.skill-card__btn.is-remove.rounded-lg.font-bold(
                    type="button"
                    data-action="remove"
                    @click.stop="remove"
                  ) {{ t('skills.remove') }}
                button.skill-card__btn.is-equip.rounded-lg.font-black.uppercase(
                  v-else-if="canEquipHere && (card.kind === 'free' || card.kind === 'other')"
                  type="button"
                  data-action="equip"
                  @click.stop="onCardTap(card)"
                ) {{ t('skills.equip') }}
              //- Right: learn / upgrade bar (or MAX), optional ad top-up
              div.flex.items-center.ml-auto(class="gap-1.5")
                component(
                  :is="TopUpButton"
                  v-if="TopUpButton && costOf(card.id) != null && !affordable(card.id)"
                  :cost="costOf(card.id)"
                  @coins-awarded="emit('coins-awarded', $event)"
                )
                span.skill-card__max.font-black.rounded-lg(
                  v-if="skills.levelOf(card.id) >= SKILL_MAX_LEVEL"
                  data-action="max"
                ) {{ t('skills.max') }}
                button.skill-card__btn.is-buy.rounded-lg.font-black.uppercase.inline-flex.items-center.justify-center(
                  v-else
                  type="button"
                  :data-action="skills.levelOf(card.id) === 0 ? 'learn' : 'upgrade'"
                  :disabled="!affordable(card.id)"
                  :aria-label="buyAria(card.id)"
                  :class="affordable(card.id) ? 'is-affordable' : 'is-short'"
                  @click.stop="buy(card.id)"
                )
                  span.game-text(v-if="skills.levelOf(card.id) === 0") {{ t('skills.learn') }}
                  svg(v-else viewBox="0 0 24 24" width="14" height="14" aria-hidden="true")
                    path(:d="UI_GLYPHS.up" fill="currentColor")
                  IconCoin(class="w-4 h-4 text-yellow-300")
                  span.game-text {{ costOf(card.id) }}
      p.skill-picker__hint.text-slate-300.text-center.m-0 {{ t('skills.hint') }}
</template>

<style scoped lang="sass">
.skill-picker-grid
  grid-template-columns: minmax(0, 1fr)
  gap: 0.5rem

@media (min-width: 640px)
  .skill-picker-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))

@media (orientation: landscape) and (max-height: 500px)
  .skill-picker-grid
    grid-template-columns: repeat(2, minmax(0, 1fr))
    gap: 0.35rem

.skill-card
  gap: 0.35rem
  text-align: left
  padding: 0.5rem 0.6rem
  background: linear-gradient(to bottom, #334155, #1e293b)
  border-color: #475569
  box-shadow: 0 3px 0 #0f172a

  &.is-here
    border-color: #facc15
    background: linear-gradient(to bottom, rgba(234, 179, 8, 0.28), #1e293b 70%)

  &.is-unlearned
    border-color: #38bdf8

  &.is-locked
    background: #1e293b
    border-color: #334155
    box-shadow: none

  &.is-tappable
    cursor: pointer

    &:active
      transform: scale(0.98)

.skill-card__name
  font-size: 1rem
  line-height: 1.15

.skill-card__lv
  font-size: 0.8rem
  line-height: 1

.skill-card__new
  font-size: 0.6rem
  line-height: 1
  padding: 2px 5px
  color: #fff
  background: linear-gradient(to bottom, #ef4444, #b91c1c)
  border: 1px solid #fecaca

.skill-card__desc
  font-size: 0.8rem
  line-height: 1.25

.skill-card__next
  font-size: 0.75rem
  line-height: 1.2

.skill-card__locked
  font-size: 0.8rem
  line-height: 1.2

.skill-card__actions
  gap: 0.4rem

.skill-card__equipped
  font-size: 0.75rem

.skill-card__btn
  min-height: 36px
  padding: 0 0.7rem
  font-size: 0.85rem
  gap: 0.25rem
  cursor: pointer
  border: 2px solid #0f1a30

  &.is-equip
    color: #fff
    background: linear-gradient(to bottom, #22c55e, #15803d)
    box-shadow: 0 3px 0 #14532d

  &.is-remove
    color: #e2e8f0
    background: #475569
    box-shadow: 0 3px 0 #1e293b

  &.is-buy.is-affordable
    color: #fff
    background: linear-gradient(to bottom, #facc15, #eab308)
    box-shadow: 0 3px 0 #854d0e

  &.is-buy.is-short
    color: #94a3b8
    background: #475569
    cursor: not-allowed

  &:active:not(:disabled)
    transform: translateY(2px)
    box-shadow: none

.skill-card__max
  font-size: 0.85rem
  padding: 0.35rem 0.7rem
  color: #fef08a
  background: linear-gradient(to bottom, #7c3aed, #4c1d95)
  border: 1px solid #fde047

.skill-picker__hint
  margin-top: 0.6rem
  font-size: 0.75rem
  line-height: 1.25
</style>
