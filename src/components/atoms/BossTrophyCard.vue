<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { modelImgPath } from '@/use/useModels'

/**
 * Boss trophy card on the roulette reward screen (bosses-100-feature.md §3.5):
 * the earn-only skin an encounter win just unlocked — already owned, the card
 * only celebrates it. Reached only through the bosses gate (`BossTrophyCardUi`),
 * so a bosses100-off build bundles none of it. The arena lays it out as one
 * more grant beside the roulette's (its "+" separator travels with it); the
 * parent's `.is-double` class shrinks it like a second grant.
 */
defineProps<{
  skinId: string
}>()

const { t } = useI18n()
</script>

<template lang="pug">
  div.roulette-grant.boss-trophy-card.flex.flex-col.items-center(
    class="gap-2 sm:gap-3"
    :data-boss-trophy="skinId"
  )
    div.roulette-grant-tag.font-black.uppercase.game-text.text-amber-300(
      class="text-xs sm:text-sm tracking-[0.15em]"
    ) {{ t('trophySkin.label') }}
    div.trophy-glow.flex.flex-col.items-center.gap-2
      img.trophy-icon.object-contain.drop-shadow-lg(
        :src="modelImgPath(skinId)"
        :alt="t(`skins.${skinId}`)"
      )
      span.trophy-name.text-amber-200.font-black.game-text.uppercase.text-center {{ t('bosses.trophyUnlocked', { name: t(`skins.${skinId}`) }) }}
</template>

<style scoped lang="sass">
// Same sizes as the arena's roulette grants (`.roulette-grant-icon` /
// `.roulette-grant-skin`, SpinnerArena.vue), which scoped styles cannot reach.
// The parent-state rules are whole-selector `:global(.is-double .x)`: Vue
// compiles `:global(.is-double) .x` to a bare `.is-double` rule, which would
// resize the arena's reward ROW instead of the card.
.boss-trophy-card
  max-width: 15rem

.trophy-glow
  animation: trophy-glow 2s ease-in-out infinite
  filter: drop-shadow(0 0 16px rgba(255, 200, 50, 0.6))

.trophy-icon
  width: 5rem
  height: 5rem
  @media (min-width: 640px)
    width: 7rem
    height: 7rem

.trophy-name
  font-size: 1.25rem
  @media (min-width: 640px)
    font-size: 1.875rem

:global(.is-double .trophy-icon)
  width: 3.5rem
  height: 3.5rem
  @media (min-width: 640px)
    width: 5rem
    height: 5rem

:global(.is-double .trophy-name)
  font-size: 1rem
  @media (min-width: 640px)
    font-size: 1.5rem

// Short landscape phones: a smaller skin and a narrow, two-line name so the
// whole row (roulette grant + up to three trophies) fits ONE line — at
// 740x360 the third card used to wrap onto a second row below the fold.
@media (orientation: landscape) and (max-height: 500px)
  .boss-trophy-card
    gap: 0.25rem
    max-width: 7.5rem

  .trophy-glow
    gap: 0.25rem

  .trophy-icon
    width: 3.25rem
    height: 3.25rem

  :global(.is-double .trophy-icon)
    width: 2.75rem
    height: 2.75rem

  .trophy-name
    font-size: 1.05rem
    white-space: nowrap

  :global(.is-double .trophy-name)
    font-size: 0.8rem
    line-height: 1.1
    white-space: normal

@keyframes trophy-glow
  0%, 100%
    filter: drop-shadow(0 0 16px rgba(255, 200, 50, 0.6))
  50%
    filter: drop-shadow(0 0 32px rgba(255, 180, 50, 0.9))
</style>
