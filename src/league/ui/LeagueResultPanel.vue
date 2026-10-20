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
      IconCoin.lrp__coin(class="text-sun-500" aria-hidden="true")
      span {{ t('league.result.coins', { n: n(outcome.coins) }) }}
</template>

<style scoped lang="sass">
// Cream parchment card (works inside the result modal and on art).
.lrp
  --lrp-accent: var(--color-sun-400)
  position: relative
  display: flex
  flex-direction: column
  gap: 0.45rem
  width: 100%
  max-width: 24rem
  margin: 0 auto
  padding: 0.6rem 0.8rem 0.7rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-wood-700)
  background-color: var(--color-cream-100)
  box-shadow: inset 0 3px 0 var(--color-cream-50), 0 4px 0 var(--color-wood-800)
  color: var(--ui-text)
  text-align: left

// Promotion: sun-gold card with a stitched edge and a short bounce (no glow).
.lrp--promoted
  background-color: var(--color-sun-200)
  border-color: var(--color-ink)
  outline: 2px dashed rgba(110, 69, 39, 0.35)
  outline-offset: -7px
  animation: lrp-pop 0.8s ease-in-out 2

@keyframes lrp-pop
  50%
    transform: scale(1.03)

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
  color: var(--ui-text)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.lrp__delta
  flex-shrink: 0

.lrp__status
  align-self: center
  padding: 0.25rem 0.8rem
  border-radius: 999px
  border: 2px solid var(--color-ink)
  box-shadow: 0 2px 0 var(--color-ink)
  font-size: 0.85rem
  font-weight: 900
  text-align: center
  color: var(--color-cream-50)
  text-shadow: 0 1px 0 var(--color-ink), 1px 0 0 var(--color-ink), -1px 0 0 var(--color-ink), 0 -1px 0 var(--color-ink)

.lrp__status--gold
  color: var(--color-ink)
  text-shadow: none
  background-color: var(--color-sun-400)
.lrp__status--up
  background-color: var(--color-leaf-500)
.lrp__status--down
  background-color: var(--color-berry-500)
.lrp__status--calm
  background-color: var(--color-wood-600)

.lrp__coins
  display: flex
  align-items: center
  justify-content: center
  gap: 0.35rem
  font-size: 1.05rem
  font-weight: 900
  color: var(--ui-text)

.lrp__coin
  width: 1.35rem
  height: 1.35rem

.lrp--static.lrp--promoted
  animation: none

@media (prefers-reduced-motion: reduce)
  .lrp--promoted
    animation: none
</style>
