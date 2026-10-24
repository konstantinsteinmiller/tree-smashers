<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import { LEAGUE_TIER_META, divisionNumeral } from '@/use/leagueTiers'
import { tierOf } from '@/league/leagueMath'
import type { LeagueResultOutcome } from '@/league/useLeague'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import LeagueDeltaChip from '@/league/ui/LeagueDeltaChip.vue'
import LeagueLpBar from '@/league/ui/LeagueLpBar.vue'
import FCountUp from '@/components/atoms/FCountUp.vue'
import { playUiSfx } from '@/use/uiSfx'
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

// A rank gained (new tier or a division up) lands with the reward ting, timed
// to the status tag's slam.
let tingTimer = 0
onMounted(() => {
  const tone = status.value?.tone
  if (props.outcome.stale || (tone !== 'gold' && tone !== 'up')) return
  tingTimer = window.setTimeout(() => playUiSfx('reward'), isLowQuality.value ? 0 : 460)
})
onBeforeUnmount(() => clearTimeout(tingTimer))
</script>

<template lang="pug">
  section.lrp(
    v-if="!outcome.stale"
    data-league="result-panel"
    :class="{ 'lrp--static': isLowQuality, 'lrp--promoted': status && status.tone === 'gold', 'lrp--loss': outcome.result === 'loss' }"
    :style="{ '--lrp-accent': accent }"
    :aria-label="t('league.title')"
  )
    //- Promotion (#UX1c): twinkles on the sun card's corners.
    template(v-if="status && status.tone === 'gold' && !isLowQuality")
      span.ui-sparkle.lrp__sp.is-a(aria-hidden="true")
      span.ui-sparkle.ui-sparkle--sun.lrp__sp.is-b(aria-hidden="true")
    //- Beat sheet: the rank SLAMS in, the delta chip slams a beat later and
    //- counts, the bar charges, the status tag slams last, the coins count up
    //- and land with a ting. A promotion or division-up also plays `reward`.
    div.lrp__head
      //- The rank name beside it carries the division, so the icon goes bare.
      span.lrp__icon(:class="{ 'ui-slam': !isLowQuality }")
        LeagueTierIcon(aria-hidden="true" :tier="after.tier" :size="44" :animated="false")
      span.lrp__rank(:class="{ 'ui-slam': !isLowQuality }" style="--slam-delay: 60ms") {{ rankName }}
      LeagueDeltaChip.lrp__delta(:delta="outcome.delta" size="lg" style="--ldc-delay: 180ms")
    LeagueLpBar(:lp="outcome.lpAfter" :from="outcome.lpBefore" :champion-position="championPosition" compact)
    div.lrp__statusRow(v-if="status")
      div.lrp__status(
        :class="[`lrp__status--${status.tone}`, { 'ui-slam': !isLowQuality }]"
        style="--slam-delay: 420ms"
        role="status"
      )
        span.lrp__statusText {{ t(status.key, { rank: rankName }) }}
    div.lrp__coins(v-if="outcome.coins > 0")
      IconCoin.lrp__coin(class="text-sun-500" aria-hidden="true")
      //- Screen readers get the final line once; the counting copy is hidden.
      span.sr-only {{ t('league.result.coins', { n: n(outcome.coins) }) }}
      i18n-t.lrp__coinsText(keypath="league.result.coins" tag="span" scope="global" aria-hidden="true")
        template(#n)
          FCountUp(:value="outcome.coins" :delay="isLowQuality ? 0 : 520" ting)
</template>

<style scoped lang="sass">
// Ice card with an ink outline and the TIER accent as its edge (inner ring +
// base band) — the same collectible-card language as the opponent cards.
.lrp
  --lrp-accent: var(--color-sun-400)
  position: relative
  display: flex
  flex-direction: column
  gap: 0.5rem
  width: 100%
  max-width: 24rem
  margin: 0 auto
  padding: 0.65rem 0.85rem 0.85rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-ink)
  background-color: var(--color-ice-50)
  box-shadow: inset 0 0 0 3px var(--lrp-accent), inset 0 -7px 0 color-mix(in srgb, var(--lrp-accent) 70%, var(--color-ink)), 0 5px 0 var(--color-ink)
  color: var(--ui-text)
  text-align: left

// Promotion: a sun card with a two-tone facet (#UX1c, was stripes) and
// twinkles on its corners; it lands with a double bump.
.lrp--promoted
  background-color: var(--color-sun-200)
  background-image: linear-gradient(160deg, rgba(255, 255, 255, 0.5) 0 44%, transparent 44%)
  animation: lrp-bump 0.42s 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 2

.lrp__sp
  z-index: 2
  &.is-a
    top: -0.55rem
    left: -0.45rem
    --sp-size: 1.3rem
    --sp-delay: 0.9s
  &.is-b
    bottom: -0.4rem
    right: -0.4rem
    --sp-size: 1rem
    --sp-delay: 1.6s

@keyframes lrp-bump
  40%
    transform: scale(1.04) rotate(-0.6deg)

.lrp__head
  display: flex
  align-items: center
  gap: 0.5rem
  min-width: 0

.lrp__icon
  display: inline-flex
  flex-shrink: 0
  filter: drop-shadow(0 3px 0 var(--color-ink))

.lrp__rank
  flex: 1 1 auto
  min-width: 0
  font-size: 1.1rem
  font-weight: 900
  text-transform: uppercase
  letter-spacing: 0.02em
  color: var(--ui-text)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.lrp__delta
  flex-shrink: 0

.lrp__statusRow
  display: flex
  justify-content: center

// Status: an angled tag (skewed plate, upright text).
.lrp__status
  position: relative
  padding: 0.28rem 1rem 0.34rem
  isolation: isolate
  font-size: 0.88rem
  font-weight: 900
  text-align: center
  color: var(--color-ice-50)

  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 2px solid var(--color-ink)
    border-radius: 0.4rem
    background-color: var(--lrp-tag, var(--color-royal-500))
    background-image: var(--ui-facet)
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), inset 0 -3px 0 rgba(22, 26, 64, 0.35), 0 3px 0 var(--color-ink)
    transform: skewX(-10deg)

.lrp__statusText
  text-shadow: var(--ui-stroke-sm)

.lrp__status--gold
  --lrp-tag: var(--color-sun-400)
  .lrp__statusText
    color: var(--color-ink)
    text-shadow: none
.lrp__status--up
  --lrp-tag: var(--color-leaf-500)
.lrp__status--down
  --lrp-tag: var(--color-berry-500)
.lrp__status--calm
  --lrp-tag: var(--color-royal-500)

.lrp__coins
  display: flex
  align-items: center
  justify-content: center
  gap: 0.35rem
  font-size: 1.2rem
  font-weight: 900
  color: var(--ui-text)

.lrp__coinsText
  font-variant-numeric: tabular-nums

.lrp__coin
  width: 1.5rem
  height: 1.5rem
  filter: drop-shadow(0 2px 0 var(--color-ink))

.lrp--static.lrp--promoted
  animation: none

@media (prefers-reduced-motion: reduce)
  .lrp--promoted
    animation: none
</style>
