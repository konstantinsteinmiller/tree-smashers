<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PeekAnchor } from '@/use/useLongPressPeek'
import type { SmasherRarity } from '@/data/smasherRarity'

/**
 * ─── Skin peek card (#UX1c) ─────────────────────────────────────────────────
 *
 * What a long press on a skin shows (skin picker, battle-pass skin tiers):
 * the skin BIG on a turning flat sun star in its rarity colour, its name on a
 * skewed ink plate and its rarity name. Teleported above every modal; the
 * held element's description for assistive tech (`role="tooltip"`, give it an
 * `id` and point the element's aria-describedby at it). Reduced motion: no
 * pop, no turn.
 */
defineProps<{
  anchor: PeekAnchor<unknown>
  src: string
  name: string
  rarity: SmasherRarity
  /** Optional third line (e.g. "Battle pass · tier 12"). */
  note?: string
  id?: string
}>()

const { t } = useI18n()
</script>

<template lang="pug">
  Teleport(to="body")
    div.skin-peek(
      :id="id"
      role="tooltip"
      :class="['rarity-' + rarity, { 'is-below': anchor.below }]"
      :style="{ left: anchor.left + 'px', top: anchor.top + 'px' }"
      data-testid="skin-peek"
    )
      div.skin-peek__stage(aria-hidden="true")
        span.skin-peek__star
        img.skin-peek__img(:src="src" alt="" draggable="false")
        span.ui-sparkle.skin-peek__sp
      span.skin-peek__name.game-text {{ name }}
      span.ui-rarity-name(:class="'ui-rarity-name--' + rarity") {{ t('rarity.' + rarity) }}
      span.skin-peek__note(v-if="note") {{ note }}
</template>

<style scoped lang="sass">
.skin-peek
  --edge: var(--rarity-common)
  position: fixed
  z-index: 120
  width: 11rem
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.3rem
  padding: 0.5rem 0.55rem 0.6rem
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  background-image: var(--ui-facet-ink)
  box-shadow: inset 0 5px 0 var(--edge), inset 0 -6px 0 var(--edge), 0 5px 0 var(--color-ink)
  color: var(--ui-text)
  pointer-events: none
  translate: -50% -100%
  transform-origin: 50% 100%
  animation: skin-peek-pop 0.22s var(--ui-back-out)
  &.is-below
    translate: -50% 0
    transform-origin: 50% 0

.rarity-common
  --edge: var(--rarity-common)
.rarity-rare
  --edge: var(--rarity-rare)
.rarity-super
  --edge: var(--rarity-super)
.rarity-epic
  --edge: var(--rarity-epic)
.rarity-mythic
  --edge: var(--rarity-mythic)
.rarity-legendary
  --edge: var(--rarity-legendary)

@keyframes skin-peek-pop
  0%
    scale: 0.6
    opacity: 0
  100%
    scale: 1
    opacity: 1

.skin-peek__stage
  position: relative
  width: 7rem
  height: 7rem
  display: grid
  place-items: center

// A flat 8-point star in the rarity colour, turning slowly behind the skin.
.skin-peek__star
  position: absolute
  inset: 0.2rem
  background-color: var(--edge)
  clip-path: polygon(50% 0%, 61% 27%, 85% 15%, 73% 39%, 100% 50%, 73% 61%, 85% 85%, 61% 73%, 50% 100%, 39% 73%, 15% 85%, 27% 61%, 0% 50%, 27% 39%, 15% 15%, 39% 27%)
  opacity: 0.45
  animation: skin-peek-turn 9s linear infinite

.skin-peek__img
  position: relative
  width: 6rem
  height: 6rem
  object-fit: contain
  filter: drop-shadow(0 3px 0 var(--color-ink))

.skin-peek__sp
  right: 0.2rem
  top: 0.4rem
  --sp-size: 1.1rem
  --sp-delay: 0.2s

@keyframes skin-peek-turn
  to
    rotate: 360deg

.skin-peek__name
  max-width: 100%
  padding: 0.12rem 0.6rem 0.18rem
  border-radius: 0.35rem
  background-color: var(--color-royal-900)
  color: var(--color-ice-50)
  font-weight: 900
  font-size: 0.9rem
  line-height: 1.1
  text-align: center
  overflow-wrap: anywhere
  box-shadow: 0 2px 0 var(--color-ink)

.skin-peek__note
  font-weight: 800
  font-size: 0.7rem
  color: var(--ui-text-muted)
  text-align: center

@media (prefers-reduced-motion: reduce)
  .skin-peek, .skin-peek__star
    animation: none
</style>
