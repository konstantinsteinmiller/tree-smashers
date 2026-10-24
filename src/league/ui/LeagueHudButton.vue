<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { LEAGUE_TIER_META, divisionNumeral } from '@/use/leagueTiers'
import UiIcon from '@/components/icons/UiIcon.vue'
import type { LeagueUiSource } from '@/league/ui/leagueUi'

/**
 * ─── League HUD button (LG5b) ───────────────────────────────────────────────
 *
 * The entry to the league from the idle HUD: the league emblem (UiIcon
 * `league` — painted sprite, drawn shield fallback; the same HUD icon family as
 * the trophy / upgrade buttons beside it) with the player's tier on the
 * button itself — the tier colour as the top lip and as the chip carrying the
 * division (or Champion #N) as real text — and a bubble with the fights left
 * today. The full tier emblems (LeagueTierIcon) live in the hub and cards. A finished season waiting to be claimed turns the bubble
 * into a gift marker and the button bounces (static on low quality / reduced
 * motion).
 *
 * Sized as an `FIconButton size="md"` twin — same box, corner radius, drop
 * shadow and `scale-80 sm:scale-100` HUD scaling — so it lines up with the
 * trophy / team buttons in the bottom-right row; only the bubble sticks out.
 *
 * Mounted by the arena (LG6) through the gate handle `LeagueHudButtonUi`
 * behind `leagueMountAllowed(stage)`. Emits `open`.
 */

const props = withDefaults(defineProps<{
  league: Pick<LeagueUiSource, 'standing' | 'fightsLeft' | 'canFight' | 'unclaimedSeason'>
  /** Champion's leaderboard position, when known. */
  championPosition?: number | null
}>(), { championPosition: null })

const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()

const standing = computed(() => props.league.standing.value)
const fights = computed(() => props.league.fightsLeft.value)
const hasReward = computed(() => props.league.unclaimedSeason.value !== null)
const accent = computed(() => LEAGUE_TIER_META[standing.value.tier].accent)

const tag = computed(() => {
  if (standing.value.tier === 'champion') return props.championPosition ? `#${props.championPosition}` : ''
  return divisionNumeral(standing.value.tier, standing.value.division)
})

const rankName = computed(() => {
  const tier = t(LEAGUE_TIER_META[standing.value.tier].nameKey)
  if (standing.value.tier === 'champion') {
    return props.championPosition ? t('league.tierPosition', { tier, position: props.championPosition }) : tier
  }
  return t('league.tierDivision', { tier, division: tag.value })
})

const aria = computed(() =>
  t('league.hudAria', { rank: rankName.value, fights: t('league.fightsLeft', { n: fights.value }, fights.value) }))
</script>

<template lang="pug">
  button.lhb.ui-hit-44(
    type="button"
    class="scale-80 sm:scale-100"
    data-league="hud-button"
    data-press
    :class="{ 'lhb--attention': hasReward && !isLowQuality, 'lhb--idle': !league.canFight.value && !hasReward }"
    :style="{ '--lhb-accent': accent }"
    :aria-label="aria"
    @click="emit('open')"
  )
    span.lhb__shadow(aria-hidden="true")
    span.lhb__body(aria-hidden="true")
      span.lhb__icon(:class="{ 'lhb__icon--tagged': tag }")
        UiIcon(name="league")
      span.lhb__tag(v-if="tag") {{ tag }}
    span.lhb__bubble(v-if="hasReward" aria-hidden="true" class="lhb__bubble--gift")
      svg(viewBox="0 0 24 24" width="100%" height="100%")
        path(d="M4 10h16v3H4zm1 4h6v7H5zm8 0h6v7h-6zM11 10h2v11h-2zM12 9.5C10 6 6.5 5 6.5 7.5 6.5 9 9 9.5 12 9.5zm0 0c2-3.5 5.5-4.5 5.5-2 0 1.5-2.5 2-5.5 2z" fill="#eef5ff" stroke="#161a40" stroke-width="1.2" stroke-linejoin="round")
    span.lhb__bubble(v-else aria-hidden="true" :class="fights > 0 ? 'lhb__bubble--on' : 'lhb__bubble--off'") {{ fights }}
</template>

<style scoped lang="sass">
// Press feel = the .ui-btn recipe: the body sinks into its ink drop on press
// (70 ms, `.is-pressed` from the global press handler), springs back with an
// overshoot, lifts 2px on hover. The tier accent is a thick top lip.
.lhb
  --lhb-accent: var(--color-sun-400)
  position: relative
  display: inline-block
  padding: 0
  border: 0
  background: none
  cursor: pointer
  -webkit-tap-highlight-color: transparent

  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 3px
    border-radius: var(--radius-ui)

.lhb__shadow
  position: absolute
  inset: 0
  transform: translateY(5px)
  border-radius: var(--radius-ui)
  background: var(--color-ink)

// Royal token (matches FIconButton type=secondary), tier accent as a top lip.
.lhb__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 0.05rem
  // FIconButton md: 1.75rem image + 2 × 0.5rem padding + 2 × 3px border.
  box-sizing: border-box
  width: calc(2.75rem + 6px)
  height: calc(2.75rem + 6px)
  padding: 0
  border-radius: var(--radius-ui)
  border: 3px solid var(--color-ink)
  background-color: var(--color-royal-500)
  background-image: var(--ui-facet)
  box-shadow: inset 0 4px 0 var(--lhb-accent), inset 0 -4px 0 var(--color-royal-700)
  transition: transform 0.26s var(--ui-spring), background-color 0.12s ease

@media (hover: hover)
  .lhb:hover .lhb__body
    transform: translateY(-2px)
    background-color: var(--color-royal-400)

.lhb:active .lhb__body, .lhb.is-pressed .lhb__body
  transform: translateY(4px) scale(1.03, 0.94)
  transition-duration: var(--ui-press-down)
  transition-timing-function: ease-out

.lhb__icon
  display: block
  width: 2rem
  height: 2rem
  &--tagged
    width: 1.75rem
    height: 1.75rem
    margin-top: -0.35rem

// The division / position on a chip in the tier colour, overlapping the
// emblem's foot so the icon keeps its size.
.lhb__tag
  position: absolute
  bottom: 0.1rem
  left: 50%
  transform: translateX(-50%)
  padding: 0.05rem 0.3rem 0.08rem
  border: 2px solid var(--color-ink)
  border-radius: 0.3rem
  background-color: var(--lhb-accent)
  font-size: 0.6rem
  font-weight: 900
  line-height: 1
  color: var(--color-ink)
  font-variant-numeric: tabular-nums
  white-space: nowrap

.lhb__bubble
  position: absolute
  top: -0.5rem
  right: -0.5rem
  min-width: 1.35rem
  height: 1.35rem
  padding: 0 0.3rem
  border-radius: 999px
  border: 2px solid var(--color-ink)
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.4), 0 2px 0 var(--color-ink)
  display: flex
  align-items: center
  justify-content: center
  font-size: 0.74rem
  font-weight: 900
  color: var(--color-ice-50)
  line-height: 1
  text-shadow: var(--ui-stroke-sm)

.lhb__bubble--on
  background-color: var(--color-leaf-500)
.lhb__bubble--off
  background-color: var(--color-steel-500)
// A season reward waiting: the berry gift bubble hops like a notify dot.
.lhb__bubble--gift
  width: 1.55rem
  height: 1.55rem
  padding: 0.15rem
  background-color: var(--color-berry-500)
  animation: ui-notify-bob 1.6s ease-in-out infinite

// No fights left: the token goes cold (steel accent, desaturated).
.lhb--idle
  --lhb-accent: var(--color-steel-400)
  .lhb__body
    filter: saturate(0.6)

// Claim me: a hop with a squash on landing, then rest.
.lhb--attention
  animation: lhb-hop 1.5s ease-in-out infinite

@keyframes lhb-hop
  0%, 55%, 100%
    transform: translateY(0) scale(1)
  18%
    transform: translateY(-7px) scale(1.04, 0.98)
  32%
    transform: translateY(0) scale(1.06, 0.92)
  42%
    transform: translateY(-2px) scale(0.99, 1.02)

@media (prefers-reduced-motion: reduce)
  .lhb--attention, .lhb__bubble--gift
    animation: none
  .lhb__body
    transition-duration: 0.08s
    transition-timing-function: ease-out
</style>
