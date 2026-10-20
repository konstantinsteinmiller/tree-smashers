<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { LEAGUE_TIER_META, divisionNumeral } from '@/use/leagueTiers'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import type { LeagueUiSource } from '@/league/ui/leagueUi'

/**
 * ─── League HUD button (LG5b) ───────────────────────────────────────────────
 *
 * The entry to the league from the idle HUD: the player's tier icon with the
 * division (or Champion #N) as real text under it, and a bubble with the
 * fights left today. A finished season waiting to be claimed turns the bubble
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
  button.lhb(
    type="button"
    class="scale-80 sm:scale-100 hover:scale-[103%] active:scale-90 transition-transform"
    data-league="hud-button"
    :class="{ 'lhb--attention': hasReward && !isLowQuality, 'lhb--idle': !league.canFight.value && !hasReward }"
    :style="{ '--lhb-accent': accent }"
    :aria-label="aria"
    @click="emit('open')"
  )
    span.lhb__shadow(aria-hidden="true")
    span.lhb__body(aria-hidden="true")
      LeagueTierIcon(:tier="standing.tier" :size="tag ? 26 : 32" :animated="false")
      span.lhb__tag(v-if="tag") {{ tag }}
    span.lhb__bubble(v-if="hasReward" aria-hidden="true" class="lhb__bubble--gift")
      svg(viewBox="0 0 24 24" width="100%" height="100%")
        path(d="M4 10h16v3H4zm1 4h6v7H5zm8 0h6v7h-6zM11 10h2v11h-2zM12 9.5C10 6 6.5 5 6.5 7.5 6.5 9 9 9.5 12 9.5zm0 0c2-3.5 5.5-4.5 5.5-2 0 1.5-2.5 2-5.5 2z" fill="#fdf2d8" stroke="#3a2314" stroke-width="1.2" stroke-linejoin="round")
    span.lhb__bubble(v-else aria-hidden="true" :class="fights > 0 ? 'lhb__bubble--on' : 'lhb__bubble--off'") {{ fights }}
</template>

<style scoped lang="sass">
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
  transform: translateY(0.25rem)
  border-radius: var(--radius-ui)
  background: var(--color-ink)

// Wood plank (matches FIconButton type=wood), tier accent as a top stripe.
.lhb__body
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 0.05rem
  // FIconButton md: 1.75rem image + 2 × 0.5rem padding + 2 × 2px border.
  box-sizing: border-box
  width: calc(2.75rem + 4px)
  height: calc(2.75rem + 4px)
  padding: 0
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ink)
  background-color: var(--color-wood-500)
  box-shadow: inset 0 3px 0 var(--lhb-accent), inset 0 -3px 0 var(--color-wood-700)

.lhb__tag
  font-size: 0.6rem
  font-weight: 900
  line-height: 1
  color: var(--color-cream-50)
  font-variant-numeric: tabular-nums
  text-shadow: -1px -1px 0 var(--color-ink), 1px -1px 0 var(--color-ink), -1px 1px 0 var(--color-ink), 1px 1px 0 var(--color-ink)

.lhb__bubble
  position: absolute
  top: -0.45rem
  right: -0.45rem
  min-width: 1.3rem
  height: 1.3rem
  padding: 0 0.3rem
  border-radius: 999px
  border: 2px solid var(--color-ink)
  box-shadow: 0 2px 0 var(--color-ink)
  display: flex
  align-items: center
  justify-content: center
  font-size: 0.72rem
  font-weight: 900
  color: var(--color-cream-50)
  line-height: 1
  text-shadow: 0 1px 0 var(--color-ink), 1px 0 0 var(--color-ink), -1px 0 0 var(--color-ink), 0 -1px 0 var(--color-ink)

.lhb__bubble--on
  background-color: var(--color-leaf-500)
.lhb__bubble--off
  background-color: var(--color-wood-600)
.lhb__bubble--gift
  width: 1.5rem
  height: 1.5rem
  padding: 0.15rem
  background-color: var(--color-berry-500)

.lhb--idle .lhb__body
  filter: saturate(0.7)

.lhb--attention
  animation: lhb-bounce 1.4s ease-in-out infinite

@keyframes lhb-bounce
  0%, 60%, 100%
    transform: translateY(0)
  30%
    transform: translateY(-5px)

@media (prefers-reduced-motion: reduce)
  .lhb--attention
    animation: none
</style>
