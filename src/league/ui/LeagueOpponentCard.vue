<script setup lang="ts">
import { isSmasherId } from '@/data/smasherCatalog'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { modelImgPath } from '@/use/useModels'
import type { OpponentCard } from '@/league/leagueOpponents'
import { DIFFICULTY_STYLE } from '@/league/ui/leagueUi'

/**
 * ─── League opponent card (LG5b) ────────────────────────────────────────────
 *
 * One of the three opponents of a ranked fight: the difficulty LABEL (easier
 * / even / harder — LM2: never a win chance or a percentage), the two blades
 * of the team as portraits, the display name and a Fight button.
 *
 * Look: a collectible card — ice face, ink outline, the DIFFICULTY colour as
 * the card's edge (inner ring + base band + corner stripes), a skewed
 * difficulty tag, the team on a striped royal "spotlight" plate, and a 3D
 * lime Fight button that sinks into its lip when the card is pressed
 * (`data-press` → the global press handler adds `.is-pressed`).
 *
 * `name` is what the hub resolved (kids builds pass the generated name, never
 * the pool's). The whole card is the tap target; `disabled` greys it out (no
 * fights left, fight starting).
 */

const props = withDefaults(defineProps<{
  card: Pick<OpponentCard, 'oppId' | 'name' | 'team' | 'difficulty'>
  /** Display name override (the hub passes the kids-safe name). */
  name?: string | null
  disabled?: boolean
}>(), { name: null, disabled: false })

const emit = defineEmits<{ fight: [] }>()

const { t } = useI18n()

const style = computed(() => DIFFICULTY_STYLE[props.card.difficulty])
const displayName = computed(() => props.name ?? props.card.name)
const difficultyLabel = computed(() => t(`league.difficulty.${props.card.difficulty}`))
const portraits = computed(() =>
  props.card.team.slice(0, 2).map((s, i) => ({ key: `${i}:${s.modelId ?? s.topPartId}`, src: s.modelId ? modelImgPath(s.modelId, isSmasherId(s.smasherId) ? s.smasherId : undefined) : null })))

const onFight = () => {
  if (!props.disabled) emit('fight')
}
</script>

<template lang="pug">
  button.loc(
    type="button"
    data-league="opponent-card"
    :data-difficulty="card.difficulty"
    :class="[`loc--${card.difficulty}`, { 'loc--disabled': disabled }]"
    :style="{ '--loc-from': style.from, '--loc-to': style.to, '--loc-ink': style.ink }"
    :disabled="disabled"
    data-press
    :aria-label="t('league.fightAria', { name: displayName, difficulty: difficultyLabel })"
    @click="onFight"
  )
    span.loc__shadow(aria-hidden="true")
    span.loc__body
      span.loc__ribbon(aria-hidden="true")
        span.loc__ribbonText {{ difficultyLabel }}
      span.loc__team(aria-hidden="true")
        span.loc__portrait(v-for="p in portraits" :key="p.key")
          img(v-if="p.src" :src="p.src" alt="" draggable="false" loading="lazy")
      span.loc__name(aria-hidden="true") {{ displayName }}
      span.loc__cta(aria-hidden="true")
        svg.loc__swords(viewBox="0 0 24 24")
          path(d="M3 3l7.5 7.5-1.4 1.4L3 5.8zm18 0v2.8l-6.1 6.1-1.4-1.4L21 3zM6.2 14.4l3.4 3.4-1.4 1.4-1.1-1.1L4.6 20.6 3.4 19.4l2.5-2.5-1.1-1.1zm11.6 0 1.4 1.4-1.1 1.1 2.5 2.5-1.2 1.2-2.5-2.5-1.1 1.1-1.4-1.4 3.4-3.4zM12 13.4 8 9.4l1.4-1.4L12 10.6l2.6-2.6L16 9.4z" fill="currentColor")
        span {{ t('league.fight') }}
</template>

<style scoped lang="sass">
// ─── Collectible card ────────────────────────────────────────────────────────
// Edge colour = difficulty (--loc-from / --loc-to from DIFFICULTY_STYLE).
// Idle: flat. Hover: lifts 3px and tilts a degree. Pressed: the card sinks
// 3px and its Fight button sinks into its lip (70 ms down, springy release).
// Disabled: steel button with a hatch, portraits desaturated, no motion.
// Focus: 3px sun ring. All shadows hard (0 blur).
.loc
  --loc-drop: 5px
  position: relative
  display: block
  width: 100%
  min-width: 0
  padding: 0
  border: 0
  background: none
  cursor: pointer
  text-align: center
  color: var(--ui-text)
  -webkit-tap-highlight-color: transparent
  transition: transform 0.26s var(--ui-spring)

  &:not(:disabled):hover
    @media (hover: hover)
      transform: translateY(-3px) rotate(-1deg)
  &:not(:disabled):active, &:not(:disabled).is-pressed
    transform: translateY(3px) scale(0.97)
    transition-duration: var(--ui-press-down)
    transition-timing-function: ease-out
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 3px
    border-radius: var(--radius-ui-lg)

.loc__shadow
  position: absolute
  inset: 0
  transform: translateY(var(--loc-drop))
  border-radius: var(--radius-ui-lg)
  background: var(--color-ink)
  transition: transform 0.26s var(--ui-spring)

.loc:not(:disabled):active .loc__shadow, .loc:not(:disabled).is-pressed .loc__shadow
  transform: translateY(2px)
  transition-duration: var(--ui-press-down)

// Ice face, ink outline, difficulty edge (inner ring + base band).
.loc__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.35rem
  padding: 1.55rem 0.45rem 0.6rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-ink)
  background-color: var(--color-ice-50)
  box-shadow: inset 0 0 0 3px var(--loc-from), inset 0 -8px 0 var(--loc-to)
  overflow: hidden

  // Corner stripes in the difficulty colour (flat, hard stops).
  &::before
    content: ''
    position: absolute
    // Sits ABOVE the base band (8px) so the bars never cross it.
    right: 0
    bottom: 8px
    width: 2.2rem
    height: 2.2rem
    background-image: repeating-linear-gradient(315deg, var(--loc-from) 0 4px, transparent 4px 9px)
    clip-path: polygon(100% 25%, 100% 100%, 25% 100%)
    pointer-events: none

// Skewed difficulty tag across the top edge.
.loc__ribbon
  position: absolute
  top: -1px
  left: -0.6rem
  right: -0.6rem
  padding: 0.22rem 0.9rem 0.28rem
  background-color: var(--loc-from)
  background-image: var(--ui-stripes)
  box-shadow: inset 0 -3px 0 var(--loc-to)
  border-bottom: 3px solid var(--color-ink)
  transform: skewY(-3deg)
  transform-origin: 0 0

.loc__ribbonText
  display: block
  font-size: 0.74rem
  font-weight: 900
  letter-spacing: 0.04em
  text-transform: uppercase
  line-height: 1.1
  color: var(--loc-ink)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  transform: skewY(3deg)

// The team on a striped royal spotlight plate.
.loc__team
  position: relative
  display: flex
  justify-content: center
  margin-top: 0.35rem
  padding: 0.3rem 0.45rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ink)
  background-color: var(--color-royal-600)
  background-image: var(--ui-stripes)
  box-shadow: inset 0 3px 0 var(--color-royal-400), inset 0 -3px 0 var(--color-royal-800)

.loc__portrait
  width: 3.1rem
  height: 3.1rem
  border-radius: 999px
  border: 3px solid var(--color-ink)
  background-color: var(--color-ice-200)
  box-shadow: inset 0 0 0 2px var(--loc-from), 0 2px 0 var(--color-ink)
  overflow: hidden
  display: flex
  align-items: center
  justify-content: center
  transition: transform 0.26s var(--ui-spring)

  & + &
    margin-left: -0.7rem

  img
    width: 118%
    height: 118%
    object-fit: contain

// Hover: the two smashers square up (a small hop each).
@media (hover: hover)
  .loc:not(:disabled):hover .loc__portrait
    transform: translateY(-2px) rotate(-4deg)
  .loc:not(:disabled):hover .loc__portrait + .loc__portrait
    transform: translateY(-2px) rotate(4deg)

.loc__name
  max-width: 100%
  font-size: clamp(0.7rem, 3.1vw, 0.88rem)
  font-weight: 900
  line-height: 1.15
  color: var(--ui-text)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

// 3D lime Fight button (the .ui-btn--primary recipe at card scale).
.loc__cta
  position: relative
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.25rem
  width: 100%
  min-height: 2.3rem
  margin-bottom: 0.35rem
  padding: 0.2rem 0.4rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ink)
  background-color: var(--color-leaf-500)
  box-shadow: inset 0 2px 0 var(--color-leaf-300), inset 0 0.85em 0 rgba(255, 255, 255, 0.18), inset 0 -4px 0 var(--color-leaf-700), 0 4px 0 var(--color-ink)
  color: var(--color-ice-50)
  font-size: 0.9rem
  font-weight: 900
  letter-spacing: 0.03em
  text-transform: uppercase
  text-shadow: var(--ui-stroke-sm)
  white-space: nowrap
  overflow: hidden
  transition: transform 0.26s var(--ui-spring), box-shadow 0.26s var(--ui-spring), background-color 0.12s ease

@media (hover: hover)
  .loc:not(:disabled):hover .loc__cta
    background-color: var(--color-leaf-400)

.loc:not(:disabled):active .loc__cta, .loc:not(:disabled).is-pressed .loc__cta
  transform: translateY(3px) scale(1.02, 0.95)
  box-shadow: inset 0 2px 0 var(--color-leaf-300), inset 0 0.85em 0 rgba(255, 255, 255, 0.18), inset 0 -2px 0 var(--color-leaf-700), 0 1px 0 var(--color-ink)
  transition-duration: var(--ui-press-down)

.loc__swords
  width: 1rem
  height: 1rem
  flex-shrink: 0
  filter: drop-shadow(0 1px 0 var(--color-ink))

// Narrow cards (3 across on a 320px phone): smaller portraits, no glyph on
// the CTA, so neither the team nor the label is clipped.
.loc
  container-type: inline-size

@container (max-width: 110px)
  .loc__portrait
    width: 2.45rem
    height: 2.45rem
    & + .loc__portrait
      margin-left: -0.55rem
  .loc__swords
    display: none
  .loc__cta
    font-size: 0.78rem
    letter-spacing: 0

// Disabled (no fights left / fight starting): steel, hatched, still.
.loc--disabled
  cursor: default

  .loc__portrait img
    filter: grayscale(0.85)

  .loc__cta
    background-color: var(--color-steel-400)
    background-image: var(--ui-stripes-ink)
    box-shadow: inset 0 2px 0 var(--color-steel-300), inset 0 -3px 0 var(--color-steel-500), 0 2px 0 var(--color-ink)
    color: var(--color-ice-100)
    transform: translateY(2px)

  .loc__ribbon, .loc__team
    filter: saturate(0.35)

@media (prefers-reduced-motion: reduce)
  .loc, .loc__portrait, .loc__cta, .loc__shadow
    transition-duration: 0.08s !important
    transition-timing-function: ease-out !important
</style>
