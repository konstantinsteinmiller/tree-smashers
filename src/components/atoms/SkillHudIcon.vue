<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import type { SkillId } from '@/types/skills'

/**
 * ─── In-battle skill chip (skills-feature.md §8.1) ──────────────────────────
 *
 * 18 px (20 px from 640 px) medallion under a blade stat card, with the one
 * piece of live state its skill has. CSS only — the arena publishes state at
 * ≤ ~10 Hz via a shallowRef, never per frame:
 *
 *   ring       0…1  shield left (Guard Shell)            → arc around the chip
 *   cooldownMs + cooldownKey  (Phase Step)               → sweep that refills
 *                    over the cooldown; a new key restarts it
 *   pips / pipsMax   (Momentum, Homing Rockets)          → dots under the chip
 *   spent            (Second Wind, Opening Salvo)        → 40 % opacity
 *   flashKey         any proc                            → one white flash
 *   breathe          first 3 s of the first battle with the skill (§7.6)
 */

export interface SkillHudState {
  ring?: number
  cooldownMs?: number
  cooldownKey?: number
  pips?: number
  pipsMax?: number
  spent?: boolean
  flashKey?: number
}

const props = withDefaults(defineProps<{
  id: SkillId
  level: number
  state?: SkillHudState
  breathe?: boolean
}>(), {
  state: () => ({}),
  breathe: false
})

const { t } = useI18n()

const label = computed(() => t('skills.hudAria', { name: t(`skills.names.${props.id}`), n: props.level }))

// Ring geometry in a 24×24 box: r = 11 → circumference ≈ 69.1.
const CIRC = 2 * Math.PI * 11
const ringOffset = computed(() => {
  const f = Math.max(0, Math.min(1, props.state.ring ?? 0))
  return CIRC * (1 - f)
})
const pipList = computed(() => {
  const max = Math.max(0, Math.min(6, props.state.pipsMax ?? 0))
  const on = Math.max(0, Math.min(max, props.state.pips ?? 0))
  return Array.from({ length: max }, (_, i) => i < on)
})
</script>

<template lang="pug">
  span.skill-hud.relative.inline-flex.flex-col.items-center(
    role="img"
    :aria-label="label"
    :data-skill="id"
    :class="{ 'is-spent': state.spent, 'is-breathing': breathe }"
  )
    span.skill-hud__chip.relative.block
      SkillIcon.skill-hud__icon(:id="id" :size="24" decorative)
      //- Shield ring (Guard Shell)
      svg.skill-hud__overlay(v-if="state.ring != null" viewBox="0 0 24 24" aria-hidden="true")
        circle(
          cx="12" cy="12" r="11" fill="none" stroke="#67e8f9" stroke-width="2.2" stroke-linecap="round"
          :stroke-dasharray="CIRC" :stroke-dashoffset="ringOffset"
          transform="rotate(-90 12 12)"
        )
      //- Cooldown sweep (Phase Step): restarted by a new key.
      svg.skill-hud__overlay(
        v-if="state.cooldownMs"
        :key="state.cooldownKey ?? 0"
        viewBox="0 0 24 24"
        aria-hidden="true"
      )
        circle.skill-hud__cd(
          cx="12" cy="12" r="6" fill="none" stroke="rgba(2,6,23,0.72)" stroke-width="12"
          :style="{ animationDuration: `${state.cooldownMs}ms`, strokeDasharray: 37.7, strokeDashoffset: 0 }"
          transform="rotate(-90 12 12)"
        )
      //- Proc flash
      span.skill-hud__flash(v-if="state.flashKey" :key="`f${state.flashKey}`" aria-hidden="true")
    span.skill-hud__pips.flex(v-if="pipList.length" aria-hidden="true")
      span.skill-hud__pip(v-for="(on, i) in pipList" :key="i" :class="{ 'is-on': on }")
</template>

<style scoped lang="sass">
.skill-hud
  --hud-size: 18px
  line-height: 0

@media (min-width: 640px)
  .skill-hud
    --hud-size: 20px

.skill-hud__chip
  width: var(--hud-size)
  height: var(--hud-size)

.skill-hud__icon, .skill-hud__overlay
  position: absolute
  inset: 0
  width: 100% !important
  height: 100% !important

.skill-hud.is-spent .skill-hud__chip
  opacity: 0.4

.skill-hud.is-breathing .skill-hud__chip
  animation: skill-hud-breathe 1s ease-in-out 3

// Sweep: a fat-stroke circle whose dash shrinks from full to empty — the dark
// wedge recedes clockwise as the cooldown refills.
.skill-hud__cd
  animation-name: skill-hud-cd
  animation-timing-function: linear
  animation-fill-mode: forwards

.skill-hud__flash
  position: absolute
  inset: -3px
  border-radius: 9999px
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 70%)
  opacity: 0
  pointer-events: none
  animation: skill-hud-flash 0.45s ease-out

.skill-hud__pips
  gap: 1px
  margin-top: 1px

.skill-hud__pip
  width: 3px
  height: 3px
  border-radius: 9999px
  background: rgba(148, 163, 184, 0.45)

  &.is-on
    background: #facc15

@keyframes skill-hud-cd
  from
    stroke-dashoffset: 0
  to
    stroke-dashoffset: 37.7

@keyframes skill-hud-flash
  0%
    opacity: 1
    transform: scale(0.6)
  100%
    opacity: 0
    transform: scale(1.5)

@keyframes skill-hud-breathe
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.18)

@media (prefers-reduced-motion: reduce)
  .skill-hud.is-breathing .skill-hud__chip
    animation: none
</style>
