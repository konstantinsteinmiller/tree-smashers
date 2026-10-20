<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LeagueRankBadge from '@/components/atoms/LeagueRankBadge.vue'
import type { LeagueTopData } from '@/league/ui/leagueUi'

/**
 * ─── League season top list (LG5b, inside the hub) ──────────────────────────
 *
 * This season's best players from GET /league/top. The hub mounts it ONLY on
 * an online league build (never on kids builds: those never fetch it, so no
 * real player name can reach a child-directed build). While the request is
 * out it says "Loading…"; an unreachable server simply keeps that quiet state
 * (O3: no error copy).
 */

defineProps<{
  top: LeagueTopData | null
  loading: boolean
}>()

const { t, n } = useI18n()
</script>

<template lang="pug">
  div.ltl(data-league="top-list")
    div.ltl__state(v-if="!top") {{ t('leaderboard.loading') }}
    div.ltl__state(v-else-if="top.entries.length === 0") {{ t('league.top.empty') }}
    ol.ltl__list(v-else :aria-label="t('league.top.title')")
      li.ltl__row.ui-pop-in(
        v-for="(e, i) in top.entries.slice(0, 50)"
        :key="`${e.rank}:${e.name}:${e.lp}`"
        :class="[{ 'ltl__row--podium': e.rank <= 3 }, e.rank <= 3 ? `ltl__row--p${e.rank}` : '']"
        :style="{ '--i': Math.min(i, 10) }"
      )
        span.ltl__rank(:class="`ltl__rank--${Math.min(e.rank, 4)}`") {{ e.rank }}
        LeagueRankBadge.ltl__badge(
          :tier="e.tier"
          :division="e.division"
          :size="26"
          :animated="false"
        )
        span.ltl__name {{ e.name }}
        span.ltl__lp {{ t('league.lp', { n: n(e.lp) }) }}
</template>

<style scoped lang="sass">
.ltl
  width: 100%
  text-align: left

.ltl__state
  padding: 1.5rem 0.5rem
  text-align: center
  font-weight: 800
  color: var(--ui-text-muted)

.ltl__list
  display: flex
  flex-direction: column
  gap: 0.35rem
  margin: 0
  padding: 0
  list-style: none

// Recessed ice rows; the podium rows stand up as sun / ice / berry cards with
// an ink outline and a hard drop. Rows pop in staggered (first ten).
.ltl__row
  display: grid
  grid-template-columns: 2.1rem auto 1fr auto
  align-items: center
  gap: 0.5rem
  min-height: 2.5rem
  padding: 0.2rem 0.6rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ice-400)
  background-color: var(--color-ice-200)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.14)
  color: var(--ui-text)

.ltl__row--podium
  border: 3px solid var(--color-ink)
  background-image: var(--ui-stripes)
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.5), inset 0 -4px 0 rgba(22, 26, 64, 0.18), 0 3px 0 var(--color-ink)

.ltl__row--p1
  background-color: var(--color-sun-300)
.ltl__row--p2
  background-color: var(--color-ice-300)
.ltl__row--p3
  background-color: var(--color-berry-300)

// Rank: an angled number tag.
.ltl__rank
  position: relative
  display: inline-flex
  align-items: center
  justify-content: center
  width: 1.95rem
  height: 1.7rem
  isolation: isolate
  font-weight: 900
  font-size: 0.88rem
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  font-variant-numeric: tabular-nums

  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 2px solid var(--color-ink)
    border-radius: 0.35rem
    background-color: var(--color-royal-600)
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 2px 0 var(--color-ink)
    transform: skewX(-10deg)

.ltl__rank--1::before
  background-color: var(--color-sun-500)
.ltl__rank--2::before
  background-color: var(--color-steel-500)
.ltl__rank--3::before
  background-color: var(--color-berry-500)

.ltl__name
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  font-weight: 900
  color: var(--ui-text)

.ltl__lp
  font-weight: 900
  font-size: 0.85rem
  color: var(--color-royal-700)
  white-space: nowrap
  font-variant-numeric: tabular-nums

.ltl__row--podium .ltl__lp
  color: var(--color-ink)
</style>
