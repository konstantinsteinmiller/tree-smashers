<script setup lang="ts">
import { revealRewards } from '@/use/useRewardReveal'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { HAS_REWARDED_ADS } from '@/platforms/rewardedAdsBuild'
import { isLowQuality } from '@/use/useQuality'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import { LEAGUE_TIER_META, divisionNumeral } from '@/use/leagueTiers'
import FModal from '@/components/molecules/FModal.vue'
import LeagueRankBadge from '@/components/atoms/LeagueRankBadge.vue'
import { LEAGUE_KIDS, LEAGUE_ONLINE } from '@/league/leagueGate'
import { seasonReward } from '@/league/leagueMath'
import { generatedOpponentName } from '@/league/leagueNpc'
import { isGateTier } from '@/league/leagueGatekeepers'
import type { OpponentCard, OpponentDeck } from '@/league/leagueOpponents'
import type { LeagueFightTarget } from '@/league/useLeague'
import LeagueLpBar from '@/league/ui/LeagueLpBar.vue'
import LeagueOpponentCard from '@/league/ui/LeagueOpponentCard.vue'
import LeagueGateCard from '@/league/ui/LeagueGateCard.vue'
import LeagueTopList from '@/league/ui/LeagueTopList.vue'
import LeagueFightsTopUp from '@/league/ui/LeagueFightsTopUp.vue'
import LeagueSeasonRewardModal from '@/league/ui/LeagueSeasonRewardModal.vue'
import {
  championPositionFromTop, durationCopy, nextTier, parseLeagueTop,
  type LeagueSeasonRewardView, type LeagueTopData, type LeagueUiSource
} from '@/league/ui/leagueUi'

/**
 * ─── League hub (LG5b) ──────────────────────────────────────────────────────
 *
 * The league screen: the player's standing (rank badge, LP bar, season
 * countdown, shields / streak), today's fights (+ the rewarded top-up on ad
 * builds), the three opponent cards — or the gatekeeper card at x99 — and,
 * on an ONLINE build, a second tab with this season's top list.
 *
 * Data comes in, fights go out:
 *   • `league`    — loadLeague()'s object (or a mock: LeagueUiSource);
 *   • `loadDeck`  — resolves today's OpponentDeck (LG6 wires
 *                   getOpponentDeck + LG3's fetcher); skipped at the gate;
 *   • `fetchTop`  — LG3's fetchTop (online builds only; never called on a
 *                   kids build, so no real player name reaches one);
 *   • emits `fight` with the LeagueFightTarget for `beginLocalBattle` plus
 *     the card (null for the gatekeeper). The hub never starts a battle.
 *
 * O3: an online build whose server is unreachable shows a QUIET state — no
 * cards, no error copy — and retries the deck in the background.
 *
 * The end-of-season reward opens on top when one is waiting; Claim calls
 * `claimSeasonReward()`, credits coins / diamonds to the wallet and emits
 * `season-claimed` (the Champion frame is the caller's to apply).
 *
 * The rewarded top-up is picked at MODULE scope — `HAS_REWARDED_ADS ?
 * LeagueFightsTopUp : null` — never with a template v-if on the build flag,
 * so a no-ad build does not even bundle it.
 */

const TopUpButton = HAS_REWARDED_ADS ? LeagueFightsTopUp : null

/** Background retry of the deck while the server is unreachable (O3). */
const QUIET_RETRY_MS = 20_000
const TICK_MS = 30_000

const props = withDefaults(defineProps<{
  modelValue: boolean
  league: LeagueUiSource
  loadDeck: () => Promise<OpponentDeck | null>
  fetchTop?: (() => Promise<unknown>) | null
  /** Ranked, server-backed build (default: the gate's LEAGUE_ONLINE). */
  online?: boolean
  /** Child-directed build (default: the gate's LEAGUE_KIDS). */
  kids?: boolean
  /** Champion's leaderboard position, if the caller knows it. */
  championPosition?: number | null
  /** A fight is being started (disables the cards). */
  busy?: boolean
  /** Why the last fight could not start — an i18n key (`league.notice.*`,
   *  LG6), shown above the cards; null = nothing to say. */
  notice?: string | null
}>(), {
  fetchTop: null,
  notice: null,
  online: () => LEAGUE_ONLINE,
  kids: () => LEAGUE_KIDS,
  championPosition: null,
  busy: false
})

const emit = defineEmits<{
  'update:modelValue': [boolean]
  fight: [payload: { target: LeagueFightTarget; card: OpponentCard | null }]
  'fights-granted': []
  'season-claimed': [reward: LeagueSeasonRewardView]
}>()

const { t } = useI18n()
const campaign = useSpinnerCampaign()
const { addCoins, addDiamonds } = useSpinnerConfig()

// ─── Standing ───────────────────────────────────────────────────────────────

const standing = computed(() => props.league.standing.value)
const accent = computed(() => LEAGUE_TIER_META[standing.value.tier].accent)
/** Real names only on an online, non-kids build (the top list). */
const showTop = computed(() => props.online && !props.kids)

const top = shallowRef<LeagueTopData | null>(null)
const topLoading = ref(false)

const champPos = computed(() =>
  props.championPosition ?? championPositionFromTop(top.value, standing.value.lp))

const rankName = computed(() => {
  const s = standing.value
  const tier = t(LEAGUE_TIER_META[s.tier].nameKey)
  if (s.tier === 'champion') return champPos.value ? t('league.tierPosition', { tier, position: champPos.value }) : tier
  return t('league.tierDivision', { tier, division: divisionNumeral(s.tier, s.division) })
})

const gateTier = computed(() => {
  if (!standing.value.atGate) return null
  const next = nextTier(standing.value.tier)
  return next && isGateTier(next) ? next : null
})

// ─── Clock ──────────────────────────────────────────────────────────────────

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null

const seasonLeft = computed(() => durationCopy(standing.value.seasonEndsMs - now.value))
const resetLeft = computed(() => {
  void now.value
  return durationCopy(props.league.msUntilDailyReset())
})

// ─── Fights ─────────────────────────────────────────────────────────────────

const fightsLeft = computed(() => props.league.fightsLeft.value)
const fightsLimit = computed(() => props.league.fightsLimit.value)

// ─── Deck ───────────────────────────────────────────────────────────────────

const deck = shallowRef<OpponentDeck | null>(null)
const deckLoading = ref(false)
let retry: ReturnType<typeof setTimeout> | null = null
let alive = true

/** O3: online, and the server did not answer (the league says so, or the
 *  live pool failed). */
const quiet = computed(() =>
  props.league.offlineBlocked.value || (props.online && deck.value !== null && !deck.value.liveOk && !gateTier.value))

const clearRetry = () => {
  if (retry !== null) clearTimeout(retry)
  retry = null
}

const loadDeck = async () => {
  if (deckLoading.value || gateTier.value) return
  deckLoading.value = true
  try {
    const d = await props.loadDeck().catch(() => null)
    if (!alive) return
    deck.value = d ?? (props.online ? { cards: [], liveOk: false } : deck.value)
  } finally {
    deckLoading.value = false
  }
  clearRetry()
  if (alive && props.modelValue && quiet.value) retry = setTimeout(() => void loadDeck(), QUIET_RETRY_MS)
}

const loadTop = async () => {
  if (!showTop.value || !props.fetchTop || topLoading.value) return
  topLoading.value = true
  try {
    const raw = await props.fetchTop().catch(() => null)
    if (alive && raw !== null) top.value = parseLeagueTop(raw) ?? top.value
  } finally {
    topLoading.value = false
  }
}

const cards = computed(() => (quiet.value ? [] : (deck.value?.cards ?? []).slice(0, 3)))
const nameFor = (card: OpponentCard): string => (props.kids ? generatedOpponentName(card.oppId) : card.name)
const cardsDisabled = computed(() => props.busy || !props.league.canFight.value)

const onCardFight = (card: OpponentCard) => {
  if (cardsDisabled.value) return
  emit('fight', { target: { kind: 'card', id: card.oppId, power: card.power }, card })
}
const onGateFight = () => {
  if (cardsDisabled.value) return
  emit('fight', { target: { kind: 'gate' }, card: null })
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

const tab = ref<'fight' | 'top'>('fight')
const tabs = computed(() => (showTop.value
  ? [{ label: t('league.tabs.fight'), value: 'fight' }, { label: t('league.tabs.top'), value: 'top' }]
  : []))
const onTab = (v: string | number) => {
  tab.value = v === 'top' ? 'top' : 'fight'
  if (tab.value === 'top' && !top.value) void loadTop()
}

// ─── Season reward ──────────────────────────────────────────────────────────

const seasonOpen = ref(false)
const seasonPreview = computed<LeagueSeasonRewardView | null>(() => {
  const u = props.league.unclaimedSeason.value
  if (!u) return null
  return { ...seasonReward(u.peakTier, campaign.currentStage.value.rewardWin), season: u.season, peakTier: u.peakTier }
})

const claimSeason = () => {
  const r = props.league.claimSeasonReward()
  seasonOpen.value = false
  if (!r) return
  if (r.coins > 0) addCoins(r.coins)
  if (r.diamonds > 0) addDiamonds(r.diamonds)
  emit('season-claimed', r)
  void revealRewards([{ kind: 'coins', amount: r.coins }, { kind: 'diamonds', amount: r.diamonds }], { tone: '#ffd21a' })
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

const open = () => {
  props.league.refresh?.()
  now.value = Date.now()
  tab.value = 'fight'
  void loadDeck()
  void loadTop()
  seasonOpen.value = props.league.unclaimedSeason.value !== null
}

watch(() => props.modelValue, v => {
  if (v) open()
  else clearRetry()
})
// Reaching the gate (or leaving it) swaps the cards for the gatekeeper.
watch(gateTier, g => {
  if (!g && props.modelValue && !deck.value) void loadDeck()
})

onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)
  if (props.modelValue) open()
})
onBeforeUnmount(() => {
  alive = false
  clearRetry()
  if (tick !== null) clearInterval(tick)
})

const onGranted = () => emit('fights-granted')
</script>

<template lang="pug">
  FModal(
    data-league="hub"
    :model-value="modelValue"
    :title="tabs.length ? undefined : t('league.title')"
    :tabs="tabs"
    :active-tab="tab"
    @update:model-value="emit('update:modelValue', $event)"
    @update:active-tab="onTab"
  )
    div.lh(:class="{ 'lh--static': isLowQuality }" :style="{ '--lh-accent': accent }")
      //- ── Season top (online only) ──
      LeagueTopList(v-if="showTop && tab === 'top'" :top="top" :loading="topLoading")

      div.lh__grid(v-else)
        //- ── Standing + fights ──
        div.lh__side
          section.lh__standing(:aria-label="t('league.standing')")
            div.lh__badge
              LeagueRankBadge(
                :tier="standing.tier"
                :division="standing.division"
                :position="champPos"
                :size="76"
              )
            div.lh__rankcol
              div.lh__rank.ui-outline-lg {{ rankName }}
              //- #N is already in the rank name and on the plaque — the bar keeps the LP.
              LeagueLpBar(:lp="standing.lp")
              div.lh__season
                span {{ t('league.season.label', { n: standing.season + 1 }) }}
                span.lh__sep(aria-hidden="true")
                span {{ t('league.season.endsIn', { time: t(seasonLeft.key, seasonLeft.params) }) }}
          div.lh__chips(v-if="standing.shields > 0 || standing.streak >= 2 || standing.atGate")
            span.lh__chip.lh__chip--gate(v-if="standing.atGate") {{ t('league.atGate') }}
            span.lh__chip.lh__chip--shield(v-if="standing.shields > 0")
              svg(viewBox="0 0 24 24" aria-hidden="true")
                path(d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z" fill="currentColor")
              span {{ t('league.shields', { n: standing.shields }, standing.shields) }}
            span.lh__chip.lh__chip--streak(v-if="standing.streak >= 2")
              svg(viewBox="0 0 24 24" aria-hidden="true")
                path(d="M13 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.4-2-1-3 3 1.5 4 4.3 4 6.5A7 7 0 0 1 5 14.5C5 9 11 7 13 2z" fill="currentColor")
              span {{ t('league.streak', { n: standing.streak }) }}

          section.lh__fights(:aria-label="t('league.fightsToday')")
            div.lh__fightsInfo
              span.lh__fightsLabel {{ t('league.fightsToday') }}
              span.lh__fightsCount(:key="fightsLeft" :class="{ 'is-empty': fightsLeft === 0, 'ui-bump': !isLowQuality }" :aria-label="t('league.fightsLeft', { n: fightsLeft }, fightsLeft)")
                span(aria-hidden="true") {{ fightsLeft }}
                span.lh__fightsMax(aria-hidden="true") /{{ fightsLimit }}
            div.lh__fightsReset(v-if="fightsLeft === 0")
              | {{ t('league.fightsReset', { time: t(resetLeft.key, resetLeft.params) }) }}
            component(
              v-if="TopUpButton && fightsLeft === 0"
              :is="TopUpButton"
              :league="league"
              @granted="onGranted"
            )

        //- ── Opponents / gate / quiet ──
        section.lh__opponents(:aria-label="t('league.opponents')")
          div.lh__notice(v-if="notice && !quiet" role="status" data-league="notice") {{ t(notice) }}
          //- O3 quiet state: no cards, no error copy.
          div.lh__quiet(v-if="quiet" data-league="quiet")
            div.lh__quietIcon(aria-hidden="true")
              svg(viewBox="0 0 24 24")
                path(d="M6 2h12v2h-1v3.2a5 5 0 0 1-2.4 4.3L13.8 12l.8.5A5 5 0 0 1 17 16.8V20h1v2H6v-2h1v-3.2a5 5 0 0 1 2.4-4.3l.8-.5-.8-.5A5 5 0 0 1 7 7.2V4H6zm3 2v3.2c0 1 .5 1.9 1.4 2.5L12 10.7l1.6-1c.9-.6 1.4-1.5 1.4-2.5V4z" fill="currentColor")
            div.lh__quietTitle {{ t('league.quiet.title') }}
            div.lh__quietBody {{ t('league.quiet.body') }}

          LeagueGateCard(
            v-else-if="gateTier"
            :tier="gateTier"
            :disabled="cardsDisabled"
            @fight="onGateFight"
          )

          template(v-else)
            h3.lh__heading
              span.lh__headingText {{ t('league.opponents') }}
            div.lh__cards
              template(v-if="cards.length")
                //- The entrance lives on a slot wrapper: a finished `both`
                //- animation on the card itself would pin its transform and
                //- kill the hover lift / press sink.
                div.lh__cardSlot.ui-pop-in(
                  v-for="(card, ci) in cards"
                  :key="card.oppId"
                  :style="{ '--i': ci + 1 }"
                )
                  LeagueOpponentCard(
                    :card="card"
                    :name="nameFor(card)"
                    :disabled="cardsDisabled"
                    @fight="onCardFight(card)"
                  )
              template(v-else)
                div.lh__skeleton(v-for="i in 3" :key="i" aria-hidden="true")

    LeagueSeasonRewardModal(
      v-model="seasonOpen"
      :reward="seasonPreview"
      @claim="claimSeason"
    )
</template>

<style scoped lang="sass">
.lh
  --lh-accent: var(--color-sun-400)
  padding: 0.1rem 0.15rem 0.5rem
  text-align: left
  color: var(--ui-text)

.lh__grid
  display: flex
  flex-direction: column
  gap: 0.75rem

.lh__side
  display: flex
  flex-direction: column
  gap: 0.6rem
  min-width: 0

// ── Standing: royal plate with flat stripes, the tier accent as a thick top
// edge, and the badge breaking out of the plate's left edge ──
.lh__standing
  position: relative
  display: flex
  align-items: center
  gap: 0.7rem
  padding: 0.6rem 0.75rem 0.7rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-ink)
  background-color: var(--color-royal-600)
  background-image: var(--ui-stripes)
  box-shadow: inset 0 6px 0 var(--lh-accent), inset 0 9px 0 var(--color-ink), inset 0 -5px 0 var(--color-royal-800), 0 5px 0 var(--color-ink)
  color: var(--color-ice-50)

.lh__badge
  flex-shrink: 0
  filter: drop-shadow(0 3px 0 var(--color-ink))
  animation: lh-badge 0.5s 0.1s cubic-bezier(0.2, 1.6, 0.4, 1) both

// The badge lands on the plate (crash in + settle).
@keyframes lh-badge
  0%
    transform: scale(1.7) rotate(-12deg)
    opacity: 0
  60%
    transform: scale(0.94) rotate(2deg)
    opacity: 1
  100%
    transform: none
    opacity: 1

.lh__rankcol
  display: flex
  flex-direction: column
  gap: 0.3rem
  flex: 1 1 auto
  min-width: 0

.lh__rank
  font-size: 1.45rem
  font-weight: 900
  line-height: 1.1
  padding-bottom: 0.1rem
  text-transform: uppercase
  letter-spacing: 0.02em
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.lh__season
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 0.2rem 0.4rem
  font-size: 0.75rem
  font-weight: 900
  color: var(--color-ice-100)
  text-shadow: var(--ui-stroke-sm)

.lh__sep
  width: 0.3rem
  height: 0.3rem
  border-radius: 999px
  background: var(--color-sun-300)
  box-shadow: 0 0 0 1.5px var(--color-ink)

// ── Chips: angled tags (skewed plate, upright text), they slam in ──
.lh__chips
  display: flex
  flex-wrap: wrap
  gap: 0.5rem
  padding-left: 0.2rem

.lh__chip
  --chip-bg: var(--color-royal-500)
  --chip-band: var(--color-royal-700)
  position: relative
  display: inline-flex
  align-items: center
  gap: 0.3rem
  padding: 0.24rem 0.7rem 0.3rem
  isolation: isolate
  font-size: 0.8rem
  font-weight: 900
  line-height: 1.1
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  animation: lh-chip 0.42s cubic-bezier(0.2, 1.5, 0.4, 1) both

  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 2px solid var(--color-ink)
    border-radius: 0.35rem
    background-color: var(--chip-bg)
    background-image: var(--ui-stripes)
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), inset 0 -3px 0 var(--chip-band), 0 3px 0 var(--color-ink)
    transform: skewX(-12deg)

  &:nth-child(2)
    animation-delay: 80ms
  &:nth-child(3)
    animation-delay: 160ms

  svg
    width: 0.95rem
    height: 0.95rem
    filter: drop-shadow(0 1.5px 0 var(--color-ink))

@keyframes lh-chip
  0%
    transform: scale(1.8) rotate(-6deg)
    opacity: 0
  55%
    transform: scale(0.92)
    opacity: 1
  100%
    transform: none
    opacity: 1

.lh__chip--gate
  --chip-bg: var(--color-sun-400)
  --chip-band: var(--color-sun-600)
  color: var(--color-ink)
  text-shadow: none
  svg
    filter: none
.lh__chip--shield
  --chip-bg: var(--color-sky-500)
  --chip-band: var(--color-sky-700)
.lh__chip--streak
  --chip-bg: var(--color-berry-500)
  --chip-band: var(--color-berry-700)

// ── Fights ──
.lh__fights
  display: flex
  flex-wrap: wrap
  align-items: center
  justify-content: space-between
  gap: 0.4rem 0.6rem
  padding: 0.45rem 0.7rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-ice-400)
  background-color: var(--color-ice-200)
  box-shadow: inset 0 3px 0 rgba(35, 56, 168, 0.14)

.lh__fightsInfo
  display: flex
  align-items: baseline
  gap: 0.5rem

.lh__fightsLabel
  font-size: 0.85rem
  font-weight: 900
  color: var(--ui-text-muted)

// The count is a stroked display number: lime while fights are left, berry
// at zero. It bumps whenever it changes (keyed in the template).
.lh__fightsCount
  display: inline-block
  font-size: 1.6rem
  font-weight: 900
  line-height: 1
  color: var(--color-leaf-400)
  text-shadow: var(--ui-stroke)
  font-variant-numeric: tabular-nums

  &.is-empty
    color: var(--color-berry-400)

.lh__fightsMax
  font-size: 0.9rem
  color: var(--ui-text-muted)
  text-shadow: none

.lh__fightsReset
  font-size: 0.8rem
  font-weight: 800
  color: var(--ui-text-muted)

// ── Opponents ──
.lh__opponents
  min-width: 0

// Section heading: a skewed ink tag with white display text.
.lh__heading
  position: relative
  display: inline-flex
  margin: 0 0 0.6rem 0.3rem
  padding: 0.22rem 0.9rem 0.3rem
  isolation: isolate

  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 2px solid var(--color-ink)
    border-radius: 0.35rem
    background-color: var(--color-royal-900)
    background-image: var(--ui-stripes)
    box-shadow: inset 0 -3px 0 var(--color-ink), 0 3px 0 var(--color-ink)
    transform: skewX(-12deg)

.lh__headingText
  font-size: 0.88rem
  font-weight: 900
  letter-spacing: 0.04em
  text-transform: uppercase
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)

.lh__cards
  display: grid
  grid-template-columns: repeat(3, minmax(0, 1fr))
  gap: 0.55rem
  padding-bottom: 0.45rem

.lh__cardSlot
  min-width: 0

// Loading placeholder: a flat ice card that gently fades (no shimmer gradient).
.lh__skeleton
  height: 10.2rem
  border-radius: var(--radius-ui-lg)
  border: 3px solid var(--color-ice-400)
  background-color: var(--color-ice-200)
  outline: 2px dashed rgba(35, 56, 168, 0.25)
  outline-offset: -7px
  animation: lh-pulse 1.4s ease-in-out infinite

@keyframes lh-pulse
  50%
    opacity: 0.55

.lh__notice
  margin-bottom: 0.5rem
  padding: 0.35rem 0.7rem
  border-radius: var(--radius-ui)
  background-color: var(--color-berry-300)
  border: 2px solid var(--color-berry-600)
  color: var(--color-ink)
  font-weight: 800
  font-size: 0.85rem
  text-align: center

.lh__quiet
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.35rem
  padding: 1.4rem 0.8rem
  border-radius: var(--radius-ui-lg)
  border: 2px dashed var(--color-wood-500)
  background-color: var(--color-cream-200)
  text-align: center

.lh__quietIcon
  width: 2.6rem
  height: 2.6rem
  color: var(--color-wood-600)
  animation: lh-turn 2.4s ease-in-out infinite

  svg
    width: 100%
    height: 100%

@keyframes lh-turn
  0%, 40%
    transform: rotate(0deg)
  60%, 100%
    transform: rotate(180deg)

.lh__quietTitle
  font-size: 1rem
  font-weight: 900
  color: var(--ui-text)

.lh__quietBody
  font-size: 0.85rem
  font-weight: 800
  color: var(--ui-text-muted)

.lh--static
  .lh__skeleton, .lh__quietIcon, .lh__badge, .lh__chip
    animation: none

@media (prefers-reduced-motion: reduce)
  .lh__skeleton, .lh__quietIcon, .lh__badge, .lh__chip
    animation: none

// ── Short landscape (phones): standing on the left, opponents on the right.
// Desktop keeps the stacked layout — it has the height, and the cards get
// the full modal width for long names.
@media (orientation: landscape) and (min-width: 640px) and (max-height: 500px)
  .lh__grid
    display: grid
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr)
    align-items: start
    gap: 0.75rem

@media (orientation: landscape) and (max-height: 500px)
  .lh__standing
    padding: 0.4rem 0.55rem
  .lh__rank
    font-size: 1.1rem
  .lh__skeleton
    height: 9rem
</style>
