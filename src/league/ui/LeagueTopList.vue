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
      li.ltl__row(
        v-for="e in top.entries.slice(0, 50)"
        :key="`${e.rank}:${e.name}:${e.lp}`"
        :class="{ 'ltl__row--podium': e.rank <= 3 }"
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
  gap: 0.3rem
  margin: 0
  padding: 0
  list-style: none

.ltl__row
  display: grid
  grid-template-columns: 2rem auto 1fr auto
  align-items: center
  gap: 0.5rem
  min-height: 2.4rem
  padding: 0.2rem 0.6rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-cream-400)
  background-color: var(--color-cream-200)
  box-shadow: inset 0 2px 0 rgba(110, 69, 39, 0.16)
  color: var(--ui-text)

.ltl__row--podium
  background-color: var(--color-sun-200)
  border-color: var(--color-sun-500)

.ltl__rank
  display: inline-flex
  align-items: center
  justify-content: center
  width: 1.8rem
  height: 1.8rem
  border-radius: 999px
  border: 2px solid var(--color-ink)
  font-weight: 900
  font-size: 0.85rem
  color: var(--color-cream-50)
  background-color: var(--color-wood-600)
  font-variant-numeric: tabular-nums

.ltl__rank--1
  background-color: var(--color-sun-400)
  color: var(--color-ink)
.ltl__rank--2
  background-color: var(--color-cream-300)
  color: var(--color-ink)
.ltl__rank--3
  background-color: var(--color-wood-400)
  color: var(--color-ink)

.ltl__name
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  font-weight: 800
  color: var(--ui-text)

.ltl__lp
  font-weight: 900
  font-size: 0.85rem
  color: var(--color-wood-700)
  white-space: nowrap
  font-variant-numeric: tabular-nums
</style>
