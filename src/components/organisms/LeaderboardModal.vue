<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
// The project's own modal shell — swap this for whatever it already uses. The
// board below is just a grid; it does not care what frames it.
import FModal from '@/components/molecules/FModal.vue'
import { playerDisplayName } from '@/use/usePlayerIdentity'
import { sanitizeDisplayName } from '@/utils/nameDenylist'
import {
  ensureBoard, leaderboard, leaderboardFailed,
  leaderboardPending, playerTotal, rankFor
} from '@/use/useLiveLeaderboard'

/**
 * ─── The global board ───────────────────────────────────────────────────────
 *
 * The top 100 by `score`, with `power` as the second column — two players on
 * the same score are not the same player, and the power is what they compare.
 *
 * Four states, and three of them are not the happy one: still loading, nothing
 * to show, and the endpoint is unreachable. All three have to say something
 * plain, because a leaderboard that opens onto a blank rectangle reads as a
 * broken game rather than a quiet network.
 *
 * The player is told where they stand even when they are not on the board —
 * that footer is the whole reason a player who is #4 000 opens this screen at
 * all.
 */

const model = defineModel<boolean>({ required: true })

/** The player's LIFETIME BEST, same as `RankBadge` — a prop, so this component
 *  does not need to know where the game keeps it. */
const props = defineProps<{ score: number }>()

const { t } = useI18n()

const entries = computed(() => leaderboard.value?.entries ?? [])

/**
 * The name the player's row would carry.
 *
 * Resolved lazily rather than at import time: `resolveIdentity` mints and
 * persists an id on its first call, and doing that before the player has ever
 * opened the board would put an identity in the save of someone who never used
 * the feature.
 */
const ownName = ref('')

/**
 * Highlight the player's own row.
 *
 * A NAME MATCH, not an id match, and it can false-positive: the board endpoint
 * publishes no ids (deliberately — a public id is a public write key), so two
 * players who both called themselves "Ace" both get the highlight. That is the
 * right trade here. The alternative is highlighting nothing, and the row a
 * player came to find is the only row on the screen they care about.
 */
const isYou = (name: string): boolean => ownName.value.length > 0 && name === ownName.value

const onBoard = computed(() => entries.value.some((e) => isYou(e.name)))

/** The player's own rank, for the footer. `0` means "nothing to say yet". */
const ownRank = computed(() => rankFor(props.score))

/** Always a number. Below the published cut `rankFor` ranks against the
 *  histogram, or estimates — it never hands back a "past the last row we can
 *  see" sentinel for this to render, because that is not a placing. */
const ownRankLabel = computed(() => String(ownRank.value))

const showOwnRank = computed(() => !onBoard.value && ownRank.value !== 0)

const showLoading = computed(() => leaderboardPending.value && entries.value.length === 0)
const showFailed = computed(() =>
  !leaderboardPending.value && leaderboardFailed.value && entries.value.length === 0)
const showEmpty = computed(() =>
  !leaderboardPending.value && !leaderboardFailed.value && leaderboard.value !== null
  && entries.value.length === 0)

// Fetched on OPEN, not on mount: the modal is mounted for the whole session and
// most sessions never open it. `ensureBoard` is idempotent and cached, so a
// player who opens the board six times still costs one request — and a previous
// failure is retried, which makes reopening the screen the retry button.
watch(model, (open) => {
  if (!open) return
  void ensureBoard()
  void playerDisplayName().then((name) => {
    // Masked the same way the board's rows are (deterministically), so a player
    // whose own name was masked still finds their row.
    ownName.value = sanitizeDisplayName(name)
  })
}, { immediate: true })
</script>

<template lang="pug">
  FModal(v-model="model" :title="t('leaderboard.title')")
    div.board
      div.board__head
        span.board__col.is-rank {{ t('leaderboard.rank') }}
        span.board__col.is-name {{ t('leaderboard.player') }}
        span.board__col.is-score {{ t('leaderboard.score') }}
        span.board__col.is-power {{ t('leaderboard.power') }}

      div.board__state(v-if="showLoading") {{ t('leaderboard.loading') }}
      div.board__state.is-failed(v-else-if="showFailed") {{ t('leaderboard.failed') }}
      div.board__state(v-else-if="showEmpty") {{ t('leaderboard.empty') }}

      div.board__list(v-else)
        div.board-row.ui-pop-in(
          v-for="(entry, i) in entries"
          :key="`${entry.rank}-${entry.name}-${i}`"
          :class="{ 'is-you': isYou(entry.name), [`is-top${entry.rank}`]: entry.rank <= 3 }"
          :style="{ '--i': Math.min(i, 12) }"
        )
          span.board-row__rank
            span {{ entry.rank }}
          span.board-row__name
            span.board-row__name-text {{ entry.name }}
            span.board-row__you(v-if="isYou(entry.name)") {{ t('leaderboard.you') }}
          span.board-row__score {{ entry.score }}
          span.board-row__power {{ entry.power }}

      //- Where the player stands when they are not up there. The reason a
      //- player outside the top 100 opens this screen at all.
      div.board__footer(v-if="showOwnRank")
        span.board__footer-rank {{ t('leaderboard.yourRank', { n: ownRankLabel }) }}
        span.board__footer-total(v-if="playerTotal > 0") {{ t('leaderboard.of', { n: playerTotal }) }}
</template>

<style scoped lang="sass">
// One grid template, shared by the header and every row, so the columns line up
// without a table and without a fixed width anywhere. The name column is the
// only flexible one — the three numbers are as wide as their content and no
// wider, which is what keeps four columns on a 320 px screen.
$cols: clamp(1.6rem, 8vw, 2.4rem) minmax(0, 1fr) clamp(2rem, 9vw, 3rem) clamp(2.2rem, 10vw, 3.4rem)

.board
  display: flex
  flex-direction: column
  gap: clamp(0.15rem, 0.8vw, 0.3rem)
  width: 100%

.board__head
  display: grid
  grid-template-columns: $cols
  gap: clamp(0.3rem, 2vw, 0.6rem)
  padding: 0 clamp(0.3rem, 1.6vw, 0.6rem) clamp(0.15rem, 0.8vw, 0.3rem)
  border-bottom: 3px solid var(--color-ink)

.board__col
  color: var(--ui-text-muted)
  font-weight: 900
  letter-spacing: 0.02em
  font-size: clamp(0.6rem, 2.4vw, 0.75rem)
  text-align: right

  &.is-rank, &.is-name
    text-align: left

.board__list
  display: flex
  flex-direction: column
  gap: clamp(0.15rem, 0.8vw, 0.3rem)

.board-row
  display: grid
  grid-template-columns: $cols
  align-items: center
  gap: clamp(0.3rem, 2vw, 0.6rem)
  padding: clamp(0.22rem, 1.2vw, 0.42rem) clamp(0.3rem, 1.6vw, 0.6rem)
  border: 2px solid var(--color-ice-400)
  border-radius: clamp(0.35rem, 1.8vw, 0.6rem)
  background-color: var(--color-ice-200)
  // Rows pop in staggered; the fill must not pin a transform afterwards.
  animation-fill-mode: backwards

  // Zebra striping rather than a border per row: 100 rows of border is a wall.
  &:nth-child(even)
    background-color: var(--color-ice-50)

  // Podium rows: an ink edge and a coloured left band (gold / silver / bronze
  // read as sun / ice / berry in this palette) plus their rank plate.
  &.is-top1, &.is-top2, &.is-top3
    border-color: var(--color-ink)
    box-shadow: 0 2px 0 var(--color-ink)
  &.is-top1
    background-color: var(--color-sun-200)
    background-image: var(--ui-stripes)

  // The row the player came here to find: sky edge + lip, lifted.
  &.is-you
    border: 3px solid var(--color-ink)
    background-color: var(--color-sky-200)
    background-image: var(--ui-stripes)
    box-shadow: inset 0 0 0 2px var(--color-sky-500), inset 0 -4px 0 var(--color-sky-500), 0 3px 0 var(--color-ink)
    transform: scale(1.015)

.board-row__rank
  justify-self: start
  color: var(--color-royal-700)
  font-weight: 900
  font-size: clamp(0.62rem, 2.8vw, 0.85rem)
  text-align: left

// Top-3: the rank becomes an angled plate (sun / ice / berry).
.is-top1 .board-row__rank, .is-top2 .board-row__rank, .is-top3 .board-row__rank
  display: inline-flex
  justify-content: center
  min-width: 1.6em
  padding: 0.05em 0.35em 0.1em
  border: 2px solid var(--color-ink)
  border-radius: 0.3rem
  box-shadow: 0 2px 0 var(--color-ink)
  transform: skewX(-10deg)
  color: var(--color-ink)
  > span
    display: inline-block
    transform: skewX(10deg)

.is-top1 .board-row__rank
  background-color: var(--color-sun-400)
.is-top2 .board-row__rank
  background-color: var(--color-ice-300)
.is-top3 .board-row__rank
  background-color: var(--color-berry-300)

.board-row__name
  display: flex
  align-items: baseline
  gap: 0.35em
  min-width: 0

.board-row__name-text
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
  color: var(--ui-text)
  font-weight: 900
  font-size: clamp(0.62rem, 2.8vw, 0.85rem)
  text-align: left

.board-row__you
  flex: 0 0 auto
  padding: 0.05em 0.45em 0.1em
  border: 2px solid var(--color-ink)
  border-radius: 999px
  background-color: var(--color-sky-500)
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  font-weight: 900
  letter-spacing: 0.03em
  font-size: clamp(0.5rem, 2.1vw, 0.65rem)

.board-row__score
  color: var(--color-sky-700)
  font-weight: 900
  font-size: clamp(0.62rem, 2.8vw, 0.85rem)
  text-align: right

.board-row__power
  color: var(--ui-text-muted)
  font-weight: 900
  font-size: clamp(0.6rem, 2.6vw, 0.8rem)
  text-align: right

.board__state
  padding: clamp(1rem, 8vw, 2.5rem) clamp(0.5rem, 3vw, 1rem)
  color: var(--ui-text-muted)
  font-weight: 800
  text-align: center
  font-size: clamp(0.65rem, 3vw, 0.9rem)
  line-height: 1.35

  &.is-failed
    color: var(--color-berry-600)

.board__footer
  display: flex
  flex-wrap: wrap
  align-items: baseline
  justify-content: center
  gap: 0.15rem 0.4rem
  margin-top: clamp(0.2rem, 1.2vw, 0.45rem)
  padding: clamp(0.3rem, 1.6vw, 0.55rem) clamp(0.4rem, 2vw, 0.8rem)
  border: 3px solid var(--color-ink)
  border-radius: clamp(0.35rem, 1.8vw, 0.6rem)
  background-color: var(--color-royal-600)
  background-image: var(--ui-stripes)
  box-shadow: inset 0 3px 0 var(--color-royal-400), inset 0 -3px 0 var(--color-royal-800), 0 3px 0 var(--color-ink)

.board__footer-rank
  color: var(--color-sun-300)
  font-weight: 900
  font-size: clamp(0.68rem, 3.2vw, 0.95rem)
  text-shadow: 0 2px 0 var(--color-ink), 1px 0 0 var(--color-ink), -1px 0 0 var(--color-ink), 0 -1px 0 var(--color-ink)

.board__footer-total
  color: var(--color-ice-200)
  font-weight: 800
  font-size: clamp(0.6rem, 2.4vw, 0.8rem)

@media (prefers-reduced-motion: reduce)
  .board-row.is-you
    transform: none
</style>
