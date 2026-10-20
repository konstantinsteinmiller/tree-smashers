<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { LEAGUE_TIERS } from '@/use/leagueTiers'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'

/**
 * ─── League unlock popup (LG5b; shown by LG6 through the reveal gate) ──────
 *
 * The first time the league unlocks: the seven tiers as a rising staircase,
 * one short line on what it is, and one CTA. `enter` opens the hub; closing
 * (X / backdrop / Later) just dismisses. LG6 decides WHEN (tap-to-start idle,
 * ≥ 1.2 s after the skills intro) and calls `markUnlockSeen()` either way.
 */

defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{ 'update:modelValue': [boolean]; enter: [] }>()

const { t } = useI18n()

/** Icon size per tier: a staircase from Wood (small) to Champion (big). */
const sizeOf = (i: number): number => 24 + i * 6
</script>

<template lang="pug">
  FModal(
    data-league="unlock-popup"
    :model-value="modelValue"
    :title="t('league.unlock.title')"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.lup(:class="{ 'lup--static': isLowQuality }")
      div.lup__stairs(aria-hidden="true")
        div.lup__step(
          v-for="(tier, i) in LEAGUE_TIERS"
          :key="tier"
          :style="{ animationDelay: `${120 + i * 90}ms` }"
        )
          LeagueTierIcon(:tier="tier" :size="sizeOf(i)" :animated="tier === 'champion'")
      p.lup__body {{ t('league.unlock.body') }}
      ul.lup__points
        li
          span.lup__dot(aria-hidden="true")
          span {{ t('league.unlock.point1') }}
        li
          span.lup__dot(aria-hidden="true")
          span {{ t('league.unlock.point2') }}
        li
          span.lup__dot(aria-hidden="true")
          span {{ t('league.unlock.point3') }}
    template(#footer)
      div.lup__actions
        FButton(size="md" @click="emit('enter')") {{ t('league.unlock.enter') }}
        button.lup__later(type="button" @click="emit('update:modelValue', false)") {{ t('league.unlock.later') }}
</template>

<style scoped lang="sass">
.lup
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.6rem
  padding: 0.25rem 0.5rem 0.25rem
  color: var(--ui-text)

// Recessed cream well the tier steps stand in.
.lup__stairs
  display: flex
  align-items: flex-end
  justify-content: center
  gap: 0.15rem
  max-width: 100%
  padding: 0.4rem 0.25rem 0.2rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-cream-400)
  background-color: var(--color-cream-200)
  box-shadow: inset 0 2px 0 rgba(110, 69, 39, 0.16)

.lup__step
  flex-shrink: 1
  min-width: 0
  animation: lup-rise 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both
  filter: drop-shadow(0 3px 0 var(--color-ink))

@keyframes lup-rise
  from
    transform: translateY(1.2rem) scale(0.6)
    opacity: 0

.lup__body
  max-width: 26rem
  margin: 0
  font-size: 1rem
  font-weight: 800
  line-height: 1.3
  color: var(--ui-text)

.lup__points
  display: flex
  flex-direction: column
  gap: 0.3rem
  margin: 0
  padding: 0
  list-style: none
  text-align: left
  font-size: 0.9rem
  font-weight: 800
  color: var(--ui-text-muted)

  li
    display: flex
    align-items: center
    gap: 0.5rem

.lup__dot
  width: 0.6rem
  height: 0.6rem
  flex-shrink: 0
  border-radius: 999px
  background: var(--color-leaf-500)
  box-shadow: 0 0 0 2px var(--color-ink)

.lup__actions
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.2rem

.lup__later
  min-height: 2.75rem
  padding: 0 1rem
  border: 0
  background: none
  color: var(--ui-text-muted)
  font-weight: 800
  text-decoration: underline
  text-underline-offset: 3px
  cursor: pointer

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px
    border-radius: var(--radius-ui)

.lup--static .lup__step
  animation: none

@media (prefers-reduced-motion: reduce)
  .lup__step
    animation: none

@media (orientation: landscape) and (max-height: 500px)
  .lup
    gap: 0.35rem
  .lup__points
    display: none
  .lup__actions
    flex-direction: row
    gap: 0.75rem
</style>
