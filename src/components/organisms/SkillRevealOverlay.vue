<script lang="ts">
// Build-only UI picked at module scope (see SkillPickerModal.vue): the ad
// top-up is never referenced — so never bundled — on a no-ad build.
import { HAS_REWARDED_ADS as ADS_BUILD_FLAG } from '@/platforms/rewardedAdsBuild'
import SkillTopUpButton from '@/components/organisms/SkillTopUpButton.vue'

const TopUpButton = ADS_BUILD_FLAG ? SkillTopUpButton : null
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FReward from '@/components/atoms/FReward.vue'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import type { SkillId } from '@/types/skills'
import useSkills from '@/use/useSkills'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSounds from '@/use/useSound'
import { skillDescParams } from '@/use/skillText'
import { useFitText } from '@/use/useFitText'

/**
 * ─── Light reveal for LATER unlocks (skills-feature.md §7.4) ────────────────
 *
 * The first unlock gets the full SkillsIntroScreen; every later boss drop
 * gets this: an FReward ribbon ("New skill!" / "New skill slot!" / "Skills
 * unlocked!"), the medallion in the roulette glow, name, the L1 effect, and
 * one CTA —
 *   not learned → "Learn 🪙150" (disabled when short; the rewarded top-up
 *                 beside it on ad builds only),
 *   learned     → "Equip & upgrade" (the parent opens the Team modal).
 * Tap anywhere else = continue. Queueing / gating (only on tap_to_start,
 * never over an ad or another modal) is the arena's job (WP7).
 */

const props = withDefaults(defineProps<{
  modelValue: boolean
  variant?: 'skill' | 'slot' | 'combined'
  skillIds: SkillId[]
  /** Slot the skill was auto-equipped into (chip "Slot N"). */
  autoEquippedSlot?: number | null
}>(), {
  variant: 'skill',
  autoEquippedSlot: null
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'continue'): void
  (e: 'open-team'): void
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { t, locale } = useI18n()
const skills = useSkills()
const { coins } = useSpinnerConfig()

const mainId = computed<SkillId | null>(() => props.skillIds[0] ?? null)

const ribbon = computed(() =>
  props.variant === 'slot' ? t('skills.newSlotTitle')
    : props.variant === 'combined' ? t('skills.unlockedTitle')
      : t('skills.newSkillTitle')
)

// The parchment's text box is ~176 px (portrait) / ~207 px (short landscape)
// wide; "Nowy slot umiejętności!", "Neuer Fähigkeitsplatz!" etc. wrapped onto
// two or three lines and spilled off the ribbon. One line, shrunk to fit.
const ribbonRef = ref<HTMLElement | null>(null)
useFitText(ribbonRef, [ribbon], 10)

const learned = computed(() => (mainId.value ? skills.isLearned(mainId.value) : false))
const learnCost = computed(() => (mainId.value ? skills.nextCost(mainId.value) : null))
const canLearn = computed(() => learnCost.value != null && coins.value >= learnCost.value)

const onLearn = () => {
  if (!mainId.value || !canLearn.value) return
  if (skills.learn(mainId.value) === 'ok') useSounds().playSound('level-up')
}

watch(() => props.modelValue, (open) => {
  if (open) useSounds().playSound('happy')
})
</script>

<template lang="pug">
  FReward(
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :show-continue="true"
    @continue="emit('continue')"
  )
    template(#ribbon)
      span.skill-reveal__ribbon.text-white.font-black.uppercase.italic.game-text(ref="ribbonRef" class="sm:text-2xl") {{ ribbon }}
    div.skill-reveal.flex.flex-col.items-center.skill-reveal--enter(data-testid="skill-reveal")
      //- Combined (migration): every unlocked icon, no per-skill text.
      div.skill-reveal__grid.grid(v-if="variant === 'combined'")
        SkillIcon(v-for="id in skillIds" :key="id" :id="id" :size="56")
      template(v-else-if="mainId")
        div.skill-reveal__glow.flex.items-center.justify-center
          SkillIcon(:id="mainId" :size="96" decorative)
        div.skill-reveal__name.font-black.uppercase.game-text.text-white {{ t(`skills.names.${mainId}`) }}
        span.skill-reveal__chip.font-black.uppercase.rounded-full(v-if="autoEquippedSlot != null")
          | {{ t('skills.slotChip', { n: autoEquippedSlot + 1 }) }}
        p.skill-reveal__desc.text-slate-100.text-center.m-0 {{ t(`skills.desc.${mainId}`, skillDescParams(mainId, 1, locale)) }}
      //- One CTA. `.stop` so the tap never doubles as tap-to-continue.
      div.skill-reveal__actions.flex.flex-wrap.items-center.justify-center.gap-2.mt-3
        button.skill-reveal__cta.inline-flex.items-center.justify-center.rounded-xl.font-black.uppercase(
          v-if="variant !== 'combined' && mainId && !learned"
          type="button"
          data-action="learn"
          :disabled="!canLearn"
          :class="canLearn ? 'is-go' : 'is-short'"
          :aria-label="t('skills.learnAria', { name: t(`skills.names.${mainId}`), cost: learnCost ?? 0 }, learnCost ?? 0)"
          @click.stop="onLearn"
        )
          span.game-text {{ t('skills.learn') }}
          IconCoin(class="w-5 h-5 text-yellow-300")
          span.game-text {{ learnCost }}
        button.skill-reveal__cta.is-go.inline-flex.items-center.justify-center.rounded-xl.font-black.uppercase(
          v-else
          type="button"
          data-action="open-team"
          @click.stop="emit('open-team')"
        )
          span.game-text {{ t('skills.manage') }}
        component(
          :is="TopUpButton"
          v-if="TopUpButton && mainId && !learned && learnCost != null && !canLearn"
          :cost="learnCost"
          @coins-awarded="emit('coins-awarded', $event)"
        )
</template>

<style scoped lang="sass">
.skill-reveal
  gap: 0.5rem
  max-width: min(92vw, 26rem)

.skill-reveal__ribbon
  // One line, width-capped by the ribbon's text box, so useFitText can read
  // the overflow (scrollWidth vs clientWidth) and shrink the font into it.
  display: block
  width: 100%
  min-width: 0
  white-space: nowrap
  overflow: hidden
  text-align: center
  // Room for the italic overhang, which would otherwise be clipped.
  padding: 0 0.15em

.skill-reveal--enter
  animation: skill-reveal-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)

.skill-reveal__glow
  animation: roulette-glow 2s ease-in-out infinite
  filter: drop-shadow(0 0 16px rgba(255, 200, 50, 0.6))

.skill-reveal__grid
  grid-template-columns: repeat(5, auto)
  gap: 0.6rem

.skill-reveal__name
  font-size: 1.6rem
  line-height: 1.1

.skill-reveal__chip
  font-size: 0.7rem
  padding: 2px 8px
  color: #0f172a
  background: #facc15

.skill-reveal__desc
  font-size: 0.95rem
  line-height: 1.3

.skill-reveal__cta
  min-height: 48px
  padding: 0 1.2rem
  gap: 0.4rem
  font-size: 1.05rem
  border: 3px solid #0f1a30
  cursor: pointer

  &.is-go
    color: #fff
    background: linear-gradient(to bottom, #ffcd00, #f7a000)
    box-shadow: 0 4px 0 #1a2b4b

  &.is-short
    color: #94a3b8
    background: #475569
    cursor: not-allowed

@keyframes skill-reveal-pop
  0%
    opacity: 0
    transform: scale(0.6)
  100%
    opacity: 1
    transform: scale(1)

@keyframes roulette-glow
  0%, 100%
    filter: drop-shadow(0 0 12px rgba(255, 200, 50, 0.5))
  50%
    filter: drop-shadow(0 0 24px rgba(255, 200, 50, 0.85))

@media (orientation: landscape) and (max-height: 500px)
  // FReward's body is only ~170 px tall here (ribbon above, "tap to continue"
  // below) and scrolls with a hidden scrollbar — at 740x360 / 844x390 the
  // Learn CTA sat below the fold where nobody would find it. Tighter stack,
  // smaller medallion (scaled, with the layout box pulled in to match).
  .skill-reveal
    gap: 0.25rem

  .skill-reveal__glow
    transform: scale(0.5)
    margin: -24px 0

  .skill-reveal__actions
    margin-top: 0

  .skill-reveal__name
    font-size: 1.2rem

  .skill-reveal__desc
    font-size: 0.8rem

  .skill-reveal__cta
    min-height: 44px

@media (prefers-reduced-motion: reduce)
  .skill-reveal--enter,
  .skill-reveal__glow
    animation: none
</style>
