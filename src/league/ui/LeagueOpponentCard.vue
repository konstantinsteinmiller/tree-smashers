<script setup lang="ts">
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
  props.card.team.slice(0, 2).map((s, i) => ({ key: `${i}:${s.modelId ?? s.topPartId}`, src: s.modelId ? modelImgPath(s.modelId) : null })))

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
    :aria-label="t('league.fightAria', { name: displayName, difficulty: difficultyLabel })"
    @click="onFight"
  )
    span.loc__shadow(aria-hidden="true")
    span.loc__body
      span.loc__ribbon(aria-hidden="true") {{ difficultyLabel }}
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
.loc
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
  transition: transform 0.08s ease

  &:not(:disabled):hover
    transform: translateY(-2px)
  &:not(:disabled):active
    transform: translateY(2px) scale(0.97)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 3px
    border-radius: var(--radius-ui-lg)

.loc__shadow
  position: absolute
  inset: 0
  transform: translateY(4px)
  border-radius: var(--radius-ui-lg)
  background: var(--color-ink)

// Cream fabric card; the difficulty colour is the ribbon on top.
.loc__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.35rem
  padding: 1.35rem 0.4rem 0.5rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-ink)
  background-color: var(--color-cream-100)
  box-shadow: inset 0 -4px 0 var(--color-cream-300)
  overflow: hidden

.loc__ribbon
  position: absolute
  top: 0
  left: 0
  right: 0
  padding: 0.2rem 0.3rem
  font-size: 0.7rem
  font-weight: 900
  letter-spacing: 0.03em
  line-height: 1.1
  color: var(--loc-ink)
  background-color: var(--loc-from)
  box-shadow: inset 0 -3px 0 var(--loc-to)
  border-bottom: 2px solid var(--color-ink)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.loc__team
  display: flex
  justify-content: center
  margin-top: 0.25rem

.loc__portrait
  width: 3.1rem
  height: 3.1rem
  border-radius: 999px
  border: 2px solid var(--color-ink)
  background-color: var(--color-cream-300)
  box-shadow: 0 2px 0 var(--color-ink)
  overflow: hidden
  display: flex
  align-items: center
  justify-content: center

  & + &
    margin-left: -0.7rem

  img
    width: 118%
    height: 118%
    object-fit: contain

.loc__name
  max-width: 100%
  font-size: clamp(0.68rem, 3.1vw, 0.85rem)
  font-weight: 900
  line-height: 1.15
  color: var(--ui-text)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

// Primary (leaf) fight CTA, same look as .ui-btn--primary.
.loc__cta
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.25rem
  width: 100%
  min-height: 2.1rem
  padding: 0.2rem 0.4rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ink)
  background-color: var(--color-leaf-500)
  box-shadow: inset 0 2px 0 var(--color-leaf-300), inset 0 -3px 0 var(--color-leaf-700), 0 2px 0 var(--color-ink)
  color: var(--color-cream-50)
  font-size: 0.85rem
  font-weight: 900
  letter-spacing: 0.02em
  text-shadow: -1px -1px 0 var(--color-ink), 1px -1px 0 var(--color-ink), -1px 1px 0 var(--color-ink), 1px 1px 0 var(--color-ink), 0 2px 0 var(--color-ink)
  white-space: nowrap
  overflow: hidden

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

.loc--disabled
  cursor: default
  filter: grayscale(0.85) brightness(0.9)
</style>
