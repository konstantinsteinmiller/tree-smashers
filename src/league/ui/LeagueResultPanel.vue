<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { LEAGUE_TIER_META, divisionNumeral } from '@/use/leagueTiers'
import { tierOf } from '@/league/leagueMath'
import type { LeagueResultOutcome } from '@/league/useLeague'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import LeagueDeltaChip from '@/league/ui/LeagueDeltaChip.vue'
import LeagueLpBar from '@/league/ui/LeagueLpBar.vue'
import { rankMove } from '@/league/ui/leagueUi'

/**
 * ─── League result panel (LG5b; mounted by LG6 on the result screen) ───────
 *
 * What a ranked fight did: the LP delta, the bar sliding from the old LP to
 * the new one, and ONE status line — promoted to a new tier, up / down a
 * division, a shield that held, the daily LP cap, or the gatekeeper holding.
 * The coins line shows what the fight paid (the caller credits them — the
 * panel never touches the wallet). A `stale` outcome (a battle already
 * settled as abandoned, O10) renders nothing.
 */

const props = withDefaults(defineProps<{
  outcome: Pick<LeagueResultOutcome,
    'result' | 'lpBefore' | 'lpAfter' | 'delta' | 'isGate' | 'promotedTo' | 'shielded' | 'capped' | 'coins' | 'stale'>
  /** Champion's leaderboard position after the fight, when known. */
  championPosition?: number | null
}>(), { championPosition: null })

const { t, n } = useI18n()

const after = computed(() => tierOf(props.outcome.lpAfter))
const move = computed(() => rankMove(props.outcome.lpBefore, props.outcome.lpAfter))
const accent = computed(() => LEAGUE_TIER_META[after.value.tier].accent)

const rankName = computed(() => {
  const tier = t(LEAGUE_TIER_META[after.value.tier].nameKey)
  if (after.value.tier === 'champion') {
    return props.championPosition ? t('league.tierPosition', { tier, position: props.championPosition }) : tier
  }
  return t('league.tierDivision', { tier, division: divisionNumeral(after.value.tier, after.value.division) })
})

type Status = { key: string; tone: 'gold' | 'up' | 'down' | 'calm' }

const status = computed<Status | null>(() => {
  const o = props.outcome
  if (move.value === 'promoted' || o.promotedTo) return { key: 'league.result.promoted', tone: 'gold' }
  if (move.value === 'up') return { key: 'league.result.up', tone: 'up' }
  if (move.value === 'down') return { key: 'league.result.down', tone: 'down' }
  if (o.shielded) return { key: 'league.result.shielded', tone: 'calm' }
  if (o.isGate && o.result === 'loss') return { key: 'league.result.gateHeld', tone: 'down' }
  if (o.capped) return { key: 'league.result.capped', tone: 'calm' }
  return null
})
</script>

<template lang="pug">
  section.lrp(
    v-if="!outcome.stale"
    data-league="result-panel"
    :class="{ 'lrp--static': isLowQuality, 'lrp--promoted': status && status.tone === 'gold' }"
    :style="{ '--lrp-accent': accent }"
    :aria-label="t('league.title')"
  )
    div.lrp__head
      //- The rank name beside it carries the division, so the icon goes bare.
      LeagueTierIcon(aria-hidden="true" :tier="after.tier" :size="44" :animated="false")
      span.lrp__rank {{ rankName }}
      LeagueDeltaChip.lrp__delta(:delta="outcome.delta" size="lg")
    LeagueLpBar(:lp="outcome.lpAfter" :from="outcome.lpBefore" :champion-position="championPosition" compact)
    div.lrp__status(v-if="status" :class="`lrp__status--${status.tone}`" role="status")
      | {{ t(status.key, { rank: rankName }) }}
    div.lrp__coins(v-if="outcome.coins > 0")
      IconCoin.lrp__coin(class="text-yellow-300" aria-hidden="true")
      span {{ t('league.result.coins', { n: n(outcome.coins) }) }}
</template>

<style scoped lang="sass">
.lrp
  --lrp-accent: #ffc93c
  position: relative
  display: flex
  flex-direction: column
  gap: 0.45rem
  width: 100%
  max-width: 24rem
  margin: 0 auto
  padding: 0.6rem 0.8rem 0.7rem
  border-radius: 1rem
  border: 3px solid #0f1a30
  background: linear-gradient(to bottom, #213a66, #172846)
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.1), 0 4px 0 #0c1626
  color: #fff
  text-align: left

.lrp--promoted
  background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--lrp-accent) 45%, #213a66), #172846 75%)
  animation: lrp-glow 1.6s ease-in-out 2

@keyframes lrp-glow
  50%
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.1), 0 4px 0 #0c1626, 0 0 1.4rem color-mix(in srgb, var(--lrp-accent) 70%, transparent)

.lrp__head
  display: flex
  align-items: center
  gap: 0.5rem
  min-width: 0

.lrp__rank
  flex: 1 1 auto
  min-width: 0
  font-size: 1rem
  font-weight: 900
  color: var(--lrp-accent)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

.lrp__delta
  flex-shrink: 0

.lrp__status
  align-self: center
  padding: 0.25rem 0.8rem
  border-radius: 999px
  border: 2px solid #0f1a30
  font-size: 0.85rem
  font-weight: 900
  text-align: center
  text-shadow: 0 1px 0 #000

.lrp__status--gold
  color: #3d2600
  text-shadow: none
  background: linear-gradient(to bottom, #ffe27a, #f0a400)
.lrp__status--up
  background: linear-gradient(to bottom, #3fbf6e, #1f8a4a)
.lrp__status--down
  background: linear-gradient(to bottom, #d9533f, #9c2331)
.lrp__status--calm
  background: #2f4a7d

.lrp__coins
  display: flex
  align-items: center
  justify-content: center
  gap: 0.35rem
  font-size: 1.05rem
  font-weight: 900
  text-shadow: 0 2px 0 #000

.lrp__coin
  width: 1.35rem
  height: 1.35rem

.lrp--static.lrp--promoted
  animation: none

@media (prefers-reduced-motion: reduce)
  .lrp--promoted
    animation: none
</style>
