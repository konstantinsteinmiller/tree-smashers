<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  leaderboardFailed, leaderboardVisible, playerTotal, rankFor
} from '@/use/useLiveLeaderboard'
import { fmtGrouped } from '@/utils/localeNumber'
import UiIcon from '@/components/icons/UiIcon.vue'

/**
 * ─── "#1130 of 2345" ────────────────────────────────────────────────────────
 *
 * The whole leaderboard, reduced to one pill on the result screen. It is the
 * only part of this feature most players ever see, and the population is the
 * half that makes the placing mean something: a bare "#1130" says nothing.
 *
 * THREE STATES, and only one of them is a number:
 *
 *   • a rank        → `#1130`, plus `of 2345` once the population has landed
 *   • still waiting → `…`, holding the cell's width so the row of chips does
 *                     not jump sideways when the rank arrives a beat later
 *   • nothing to say → the badge does not render AT ALL
 *
 * THERE IS NO "#100+" STATE, and adding one back is a regression. A placing
 * this component cannot state as a number is not shown as prose instead — the
 * ladder in `useLeaderboard` guarantees a real number from a histogram, or an
 * estimated one, or nothing. `rankFor` returns no sentinel for a template to
 * decorate, which is the point: the rule is enforced where the number is made,
 * not in every screen that shows one.
 *
 * The empty state is the one to respect. An empty plaque is a question the
 * screen cannot answer, and a permanent "Loading…" on a player with no
 * connection reads as a broken game. Once the fetch has actually failed the
 * badge is gone and stays gone — though it rarely comes to that, because the
 * offline ladder usually has a cached or baked board to rank against, and the
 * player never learns which one answered.
 *
 * `score` is a PROP rather than an import so this component is drop-in: it does
 * not know where the game keeps its lifetime best. Pass the same number
 * `reportRun` is called with.
 */

const props = withDefaults(defineProps<{
  /** The player's LIFETIME BEST — the same number passed to `reportRun`, not
   *  this run's result. Ranking a run total against a board of bests would show
   *  a player their rank falling after a bad run. */
  score: number
  /** Hide the "of N" tail (a cramped HUD corner, say). The placing alone is a
   *  weaker line, so only do this where the width genuinely is not there. */
  compact?: boolean
}>(), { compact: false })

const { t, locale } = useI18n()

/**
 * The rank as PROSE — `#42`, `…`, or empty.
 *
 * The `#` is built here rather than in the template because `#{}` is Pug
 * interpolation: a literal `#` in front of a mustache is a parse error, not a
 * hash sign. (Costs an hour the first time.)
 */
const label = computed<string>(() => {
  // `leaderboardVisible`, not `leaderboardEnabled`: on a platform with accounts
  // a signed-out player has no board and therefore no placing to be shown on
  // the result screen. Reactive, so signing in mid-session brings the pill back
  // without a reload.
  if (!leaderboardVisible.value) return ''
  const rank = rankFor(props.score)
  // #UX1c: grouped per locale ("#33,883" / "#33.883"), Latin digits.
  if (rank > 0) return `#${fmtGrouped(rank, locale.value)}`
  // `0` is the only non-answer `rankFor` has, and it means "nothing honest to
  // say yet" — not "unknowable". Until the endpoint has actually failed that is
  // a request still in flight, so hold the slot; after it, give the slot back.
  return leaderboardFailed.value ? '' : '…'
})

/** Only once the population has actually landed. Before that there is no "of N"
 *  to print, and a placeholder there would be a second unanswered question. */
const showTotal = computed(() => !props.compact && playerTotal.value > 0)
const totalText = computed(() => fmtGrouped(playerTotal.value, locale.value))

/** One accessible name for the whole pill. Without it a screen reader reads
 *  "number 1130 of 2345" with no idea what is being counted. */
const ariaLabel = computed(() =>
  showTotal.value
    ? `${t('leaderboard.title')}: ${label.value} ${t('leaderboard.of', { n: totalText.value })}`
    : `${t('leaderboard.title')}: ${label.value}`
)
</script>

<template lang="pug">
  //- No cell at all when there is nothing honest to say.
  div.rank-badge(v-if="label" role="img" :aria-label="ariaLabel")
    //- The painted leaderboard icon (the same sprite as the HUD button); the drawn trophy
    //- is its automatic fallback inside UiIcon.
    UiIcon.rank-badge__icon(name="leaderboard" aria-hidden="true")
    span.rank-badge__rank {{ label }}
    span.rank-badge__of(v-if="showTotal") {{ t('leaderboard.of', { n: totalText }) }}
</template>

<style scoped lang="sass">
// The placing as an ANGLED royal tag (skewed plate, upright text), a sun-gold
// trophy, a white stroked number — one of the game's own display numbers, not
// a widget bolted on. It slams in a beat after the result title. Hard 0-blur
// edges only.
.rank-badge
  position: relative
  display: inline-flex
  align-items: baseline
  gap: 0.3em
  padding: clamp(0.2rem, 1vmin, 0.35rem) clamp(0.55rem, 2.4vmin, 0.9rem)
  isolation: isolate
  color: var(--color-sun-300)
  animation: rank-badge-slam 0.44s 0.35s cubic-bezier(0.2, 1.5, 0.4, 1) both

  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 2px solid var(--color-ink)
    border-radius: 0.45rem
    background-color: var(--color-royal-600)
    background-image: var(--ui-facet)
    box-shadow: inset 0 2px 0 var(--color-royal-400), inset 0 -3px 0 var(--color-royal-800), 0 3px 0 var(--color-ink)
    transform: skewX(-10deg)

@keyframes rank-badge-slam
  0%
    transform: scale(1.8) rotate(-6deg)
    opacity: 0
  55%
    transform: scale(0.92)
    opacity: 1
  100%
    transform: none
    opacity: 1

.rank-badge__icon
  // `align-self` rather than `align-items: center` on the row: the numbers set
  // the baseline, and a glyph hung off it sits where a capital letter would.
  align-self: center
  flex: 0 0 auto
  width: clamp(1rem, 4.8vmin, 1.5rem)
  height: clamp(1rem, 4.8vmin, 1.5rem)
  filter: drop-shadow(0 1.5px 0 var(--color-ink))

.rank-badge__rank
  color: var(--color-ice-50)
  font-weight: 900
  font-size: clamp(0.85rem, 4.2vmin, 1.3rem)
  line-height: 1
  font-variant-numeric: tabular-nums
  // Every number in this game sits on a hard ink outline.
  text-shadow: var(--ui-stroke-sm)

.rank-badge__of
  color: var(--color-ice-200)
  font-weight: 800
  font-size: clamp(0.55rem, 2.4vmin, 0.75rem)
  text-shadow: var(--ui-stroke-sm)

@media (prefers-reduced-motion: reduce)
  .rank-badge
    animation: none
</style>
