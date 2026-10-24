<script setup lang="ts">
import UiIcon from '@/components/icons/UiIcon.vue'
import { isSmasherId } from '@/data/smasherCatalog'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { modelImgPath } from '@/use/useModels'
import type { OpponentCard } from '@/league/leagueOpponents'
import { DIFFICULTY_STYLE } from '@/league/ui/leagueUi'
import { computeStats } from '@/use/useSpinnerConfig'
import { useLongPressPeek } from '@/use/useLongPressPeek'
import StatIcon from '@/components/icons/StatIcon.vue'
import { fmtFixed } from '@/utils/localeNumber'

/**
 * ─── League opponent card (LG5b) ────────────────────────────────────────────
 *
 * One of the three opponents of a ranked fight: the difficulty LABEL (easier
 * / even / harder — LM2: never a win chance or a percentage), the two blades
 * of the team as portraits, the display name and a Fight button.
 *
 * Look: a collectible card — ice face, ink outline, the DIFFICULTY colour as
 * the card's edge (inner ring + base band + corner notch), a skewed
 * difficulty tag, the team on a faceted royal "spotlight" plate, and a 3D
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

const { t, locale } = useI18n()

const style = computed(() => DIFFICULTY_STYLE[props.card.difficulty])
const displayName = computed(() => props.name ?? props.card.name)
const difficultyLabel = computed(() => t(`league.difficulty.${props.card.difficulty}`))
const portraits = computed(() =>
  props.card.team.slice(0, 2).map((s, i) => ({ key: `${i}:${s.modelId ?? s.topPartId}`, src: s.modelId ? modelImgPath(s.modelId, isSmasherId(s.smasherId) ? s.smasherId : undefined) : null })))

// ─── Long-press peek (#UX1c): the opponent team's stats ──────────────────────
// Hold the card and a small card pops up with each blade: portrait, name,
// level and its HP / ATK / DEF / SPD — the release does NOT start the fight.
// Keyboard: ContextMenu / Shift+F10 toggles it, Escape closes.
const peekCtl = useLongPressPeek<string>({ cardWidth: 208, minRoomAbove: 230 })
const peek = peekCtl.peek
const peekId = computed(() => `loc-peek-${props.card.oppId.replace(/[^a-z0-9_-]/gi, '')}`)
const peekRows = computed(() => props.card.team.map((cfg, i) => {
  const st = computeStats(cfg, cfg.topLevel ?? 0, cfg.bottomLevel ?? 0)
  const id = isSmasherId(cfg.smasherId) ? cfg.smasherId : null
  return {
    key: `${i}:${cfg.modelId ?? cfg.topPartId}`,
    src: cfg.modelId ? modelImgPath(cfg.modelId, id ?? undefined) : null,
    name: id ? t(`smasher_${id}`) : '',
    level: cfg.level ?? null,
    stats: [
      { icon: 'hp' as const, label: t('sfc.SmasherTeamModal.statHp'), value: String(Math.round(st.maxHp)), tone: 'text-leaf-600' },
      { icon: 'attack' as const, label: t('sfc.SmasherTeamModal.statAtk'), value: `${fmtFixed(st.damageMultiplier, 2, locale.value)}x`, tone: 'text-berry-600' },
      { icon: 'defense' as const, label: t('sfc.SmasherTeamModal.statDef'), value: `${fmtFixed(st.defenseMultiplier, 2, locale.value)}x`, tone: 'text-sky-600' },
      { icon: 'speed' as const, label: t('sfc.SmasherTeamModal.statSpd'), value: `${fmtFixed(st.speedMultiplier, 2, locale.value)}x`, tone: 'text-sun-600' }
    ]
  }
}))

const onFight = peekCtl.guardClick(() => {
  if (!props.disabled) emit('fight')
})
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
    :aria-describedby="peek ? peekId : undefined"
    v-on="disabled ? {} : peekCtl.bind(card.oppId)"
    @click="onFight"
    @blur="peek && peekCtl.close()"
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
        UiIcon.loc__swords(name="fight")
        span {{ t('league.fight') }}
    //- The team peek (teleported above the hub modal).
    Teleport(to="body")
      span.loc-peek(
        v-if="peek"
        :id="peekId"
        role="tooltip"
        :class="{ 'is-below': peek.below }"
        :style="{ left: peek.left + 'px', top: peek.top + 'px', '--loc-from': style.from, '--loc-to': style.to }"
        data-league="opponent-peek"
      )
        span.loc-peek__name {{ displayName }}
        span.loc-peek__blade(v-for="b in peekRows" :key="b.key")
          span.loc-peek__portrait
            img(v-if="b.src" :src="b.src" alt="" draggable="false")
          span.loc-peek__info
            span.loc-peek__bladeName
              span {{ b.name }}
              span.loc-peek__lv(v-if="b.level") {{ t('sfc.SmasherTeamModal.levelShort', { n: b.level }) }}
            span.loc-peek__stats
              span.loc-peek__stat(v-for="st in b.stats" :key="st.icon" :class="st.tone" :title="st.label")
                StatIcon.loc-peek__icon(:stat="st.icon" aria-hidden="true")
                span.sr-only {{ st.label }}
                span.loc-peek__val {{ st.value }}
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
  -webkit-touch-callout: none
  user-select: none
  -webkit-user-select: none
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
  container-type: inline-size
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

  // Corner notch in the difficulty colour (#UX1c: solid dog-ear, no stripes).
  &::before
    content: ''
    position: absolute
    // Sits ABOVE the base band (8px) so the bars never cross it.
    right: 0
    bottom: 8px
    width: 1.5rem
    height: 1.5rem
    background-color: var(--loc-from)
    clip-path: polygon(100% 0, 100% 100%, 0 100%)
    pointer-events: none

// Difficulty band across the top edge — straight: the old skew lifted its
// right end out of the card and the clipped body cut the label off.
.loc__ribbon
  position: absolute
  top: 0
  left: 0
  right: 0
  padding: 0.14rem 0.6rem 0.16rem
  background-color: var(--loc-from)
  background-image: var(--ui-facet)
  box-shadow: inset 0 -3px 0 var(--loc-to)
  border-bottom: 3px solid var(--color-ink)
  container-type: inline-size

.loc__ribbonText
  display: block
  font-size: 0.74rem
  font-weight: 900
  letter-spacing: 0.04em
  text-transform: uppercase
  // room for umlaut dots (Ä Ö Ü): the text clips its overflow
  line-height: 1.35
  color: var(--loc-ink)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  text-align: center
  // shrink with the card so "SCHWÄCHER" / "EBENBÜRTIG" fit a phone card
  font-size: min(0.74rem, 9cqi)
  letter-spacing: 0.01em

// The team on a faceted royal spotlight plate.
.loc__team
  position: relative
  display: flex
  justify-content: center
  margin-top: 0.35rem
  padding: 0.3rem 0.45rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ink)
  background-color: var(--color-royal-600)
  background-image: var(--ui-facet)
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
  // shrinks with the card so "KÄMPFEN" / "COMBATTRE" never clip
  font-size: clamp(0.6rem, 10cqi, 0.9rem)
  font-weight: 900
  letter-spacing: 0.01em
  white-space: nowrap
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
    background-image: var(--ui-hatch)
    box-shadow: inset 0 2px 0 var(--color-steel-300), inset 0 -3px 0 var(--color-steel-500), 0 2px 0 var(--color-ink)
    color: var(--color-ice-100)
    transform: translateY(2px)

  .loc__ribbon, .loc__team
    filter: saturate(0.35)

@media (prefers-reduced-motion: reduce)
  .loc, .loc__portrait, .loc__cta, .loc__shadow
    transition-duration: 0.08s !important
    transition-timing-function: ease-out !important
  .loc-peek
    animation: none !important

// ─── Team peek (#UX1c) ───────────────────────────────────────────────────────
// Ice card with the difficulty edge (top lip + base band), the name on a
// skewed ink plate, one row per blade: portrait, name + level, four stats
// (icon + tabular value in the stat's colour).
.loc-peek
  position: fixed
  z-index: 120
  width: 13rem
  display: flex
  flex-direction: column
  gap: 0.35rem
  padding: 0.45rem 0.5rem 0.6rem
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  background-image: var(--ui-facet-ink)
  box-shadow: inset 0 5px 0 var(--loc-from), inset 0 -6px 0 var(--loc-to), 0 5px 0 var(--color-ink)
  color: var(--ui-text)
  pointer-events: none
  translate: -50% -100%
  transform-origin: 50% 100%
  animation: loc-peek-pop 0.22s var(--ui-back-out)
  &.is-below
    translate: -50% 0
    transform-origin: 50% 0

@keyframes loc-peek-pop
  0%
    scale: 0.6
    opacity: 0
  100%
    scale: 1
    opacity: 1

.loc-peek__name
  align-self: center
  max-width: 100%
  margin-top: 0.2rem
  padding: 0.1rem 0.6rem 0.16rem
  border-radius: 0.35rem
  background-color: var(--color-royal-900)
  color: var(--color-ice-50)
  font-weight: 900
  font-size: 0.82rem
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  transform: skewX(-8deg)

.loc-peek__blade
  display: flex
  align-items: center
  gap: 0.4rem

.loc-peek__portrait
  flex: 0 0 auto
  width: 2.4rem
  height: 2.4rem
  border-radius: 999px
  border: 2px solid var(--color-ink)
  background-color: var(--color-ice-200)
  overflow: hidden
  display: grid
  place-items: center
  img
    width: 118%
    height: 118%
    object-fit: contain

.loc-peek__info
  min-width: 0
  display: flex
  flex-direction: column
  gap: 0.15rem

.loc-peek__bladeName
  display: flex
  align-items: center
  gap: 0.3rem
  font-weight: 900
  font-size: 0.78rem
  line-height: 1.1
  white-space: nowrap

.loc-peek__lv
  padding: 0.04rem 0.3rem 0.08rem
  border-radius: 0.3rem
  background-color: var(--color-royal-600)
  color: var(--color-ice-50)
  font-size: 0.62rem

.loc-peek__stats
  display: grid
  grid-template-columns: repeat(4, auto)
  gap: 0.25rem

.loc-peek__stat
  display: inline-flex
  align-items: center
  gap: 0.1rem
  font-weight: 900
  font-size: 0.66rem
  font-variant-numeric: tabular-nums

.loc-peek__icon
  width: 0.8rem
  height: 0.8rem

.loc-peek__val
  color: var(--ui-text)
</style>
