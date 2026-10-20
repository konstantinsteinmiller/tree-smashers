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
    div.roulette-grant-tag.trophy-tag.ui-tag.ui-tag--plum.font-black.uppercase.game-text(
      class="text-xs sm:text-sm tracking-[0.04em]"
    ) {{ t('trophySkin.label') }}
    div.trophy-glow.flex.flex-col.items-center.gap-2
      //- A turning flat sun star behind the trophy skin (no glow, no filter).
      span.trophy-star(aria-hidden="true")
      img.trophy-icon.object-contain(class="drop-shadow-[0_3px_0_var(--color-ink)]"
        :src="modelImgPath(skinId)"
        :alt="t(`skins.${skinId}`)"
      )
      span.trophy-name.text-plum-300.font-black.game-text.uppercase.text-center {{ t('bosses.trophyUnlocked', { name: t(`skins.${skinId}`) }) }}
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
  position: relative
  isolation: isolate

.trophy-tag
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  padding: 0.2em 0.9em 0.3em
  animation: trophy-tag-in 0.45s cubic-bezier(0.2, 1.5, 0.4, 1) 0.2s both

.trophy-star
  position: absolute
  left: 50%
  top: 0
  width: 7.5rem
  height: 7.5rem
  margin-left: -3.75rem
  margin-top: -1.25rem
  z-index: -1
  background-color: var(--color-sun-400)
  background-image: var(--ui-stripes)
  clip-path: polygon(50% 0, 60% 30%, 93% 21%, 72% 46%, 100% 64%, 66% 66%, 71% 100%, 50% 77%, 29% 100%, 34% 66%, 0 64%, 28% 46%, 7% 21%, 40% 30%)
  animation: trophy-star-turn 10s linear infinite
  @media (min-width: 640px)
    width: 10rem
    height: 10rem
    margin-left: -5rem
    margin-top: -1.5rem

.trophy-icon
  animation: trophy-bob 2s ease-in-out infinite

.trophy-icon
  position: relative
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

@keyframes trophy-star-turn
  to
    transform: rotate(360deg)

@keyframes trophy-bob
  0%, 100%
    transform: translateY(0)
  50%
    transform: translateY(-4px) rotate(-2deg)

@keyframes trophy-tag-in
  0%
    opacity: 0
    transform: scale(1.8) rotate(-6deg)
  60%
    opacity: 1
    transform: scale(0.92)
  100%
    opacity: 1
    transform: none

@media (prefers-reduced-motion: reduce)
  .trophy-star, .trophy-icon, .trophy-tag
    animation: none

:global(.is-double .trophy-star)
  width: 5.5rem
  height: 5.5rem
  margin-left: -2.75rem

@media (orientation: landscape) and (max-height: 500px)
  .trophy-star, :global(.is-double .trophy-star)
    width: 4.5rem
    height: 4.5rem
    margin-left: -2.25rem
    margin-top: -0.75rem
</style>
