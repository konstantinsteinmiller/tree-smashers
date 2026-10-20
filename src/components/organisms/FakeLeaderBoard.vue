<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import useLeaderboard, { type LeaderboardEntry } from '@/use/useLeaderboard'
import useSpinnerCampaign from '@/use/useSpinnerCampaign'
import { isMobileLandscape } from '@/use/useUser.ts'
import { stopGameplay } from '@/use/useCrazyGames'

const emit = defineEmits<{
  (e: 'fight', entry: LeaderboardEntry): void
}>()

const {
  entries,
  playerRank,
  totalEntries,
  refreshLeaderboardIfDue,
  ghostFights,
  canFightGhost
} = useLeaderboard()
const { currentStageId } = useSpinnerCampaign()
const { t } = useSfcI18n('FakeLeaderBoard')

// ─── Modal State ────────────────────────────────────────────────────────────

const isOpen = ref(false)

const PAGE_SIZE = 20
const currentPage = ref(1)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalEntries.value / PAGE_SIZE))
)

const playerPage = computed(() =>
  Math.max(1, Math.floor((playerRank.value - 1) / PAGE_SIZE) + 1)
)

const pagedEntries = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return entries.value.slice(start, start + PAGE_SIZE)
})

const playerEntry = computed(() => entries.value.find(e => e.isPlayer))

// Refresh on first mount and any time the modal opens; snap to player page.
const refresh = () => refreshLeaderboardIfDue(currentStageId.value)

onMounted(refresh)

watch(isOpen, (open) => {
  if (open) {
    refresh()
    currentPage.value = playerPage.value
    // Explicit CrazyGames `gameplayStop` on every Leaderboard open.
    // Mirrors the arena's reactive watcher but makes the call-site
    // visible per the CG QA request. `stopGameplay()` is idempotent
    // (no-op when SDK inactive or already stopped).
    stopGameplay()
  }
})

const openModal = () => {
  isOpen.value = true
}
const closeModal = () => {
  isOpen.value = false
}

const goPrev = () => {
  if (currentPage.value > 1) currentPage.value--
}
const goNext = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}
const jumpToMe = () => {
  currentPage.value = playerPage.value
}

const onFightClick = (entry: LeaderboardEntry) => {
  if (!canFightGhost(entry.id)) return
  emit('fight', entry)
  closeModal()
}

// Reactive helper — reads ghostFights so the template re-evaluates
// whenever a new opponent is marked as fought.
const isFightLocked = (entry: LeaderboardEntry): boolean => {
  // Touch the ref to register reactive dependency
  void ghostFights.value.ids.length
  return !canFightGhost(entry.id)
}

// ─── Visual helpers ─────────────────────────────────────────────────────────

const rankBadgeClass = (rank: number): string => {
  if (rank === 1) return 'rank-plate is-podium bg-sun-400 text-ink border-2 border-ink'
  if (rank === 2) return 'rank-plate is-podium bg-ice-300 text-ink border-2 border-ink'
  if (rank === 3) return 'rank-plate is-podium bg-berry-300 text-ink border-2 border-ink'
  return 'rank-plate bg-ice-50 text-ink-soft border-2 border-ice-400'
}

const indexToRank = (entry: LeaderboardEntry): number =>
  entries.value.findIndex(e => e.id === entry.id) + 1
</script>

<template lang="pug">
  //- ─── Trigger Button ────────────────────────────────────────────────────
  //- Royal 3D HUD button (sinks into its lip on press).
  button.ui-btn.ui-btn--royal.ui-btn--icon(
    type="button"
    @click="openModal"
    :aria-label="t('leaderboard')"
    class="cursor-pointer scale-80 sm:scale-100 pointer-events-auto p-2"
  )
    img.w-7.h-7(src="/images/icons/trophy_128x128.webp" alt="")

  //- ─── Modal ──────────────────────────────────────────────────────────────
  //- The whole panel scrolls in FModal's body (the single scroll authority),
  //- and the PAGINATION lives in the modal's footer slot — the footer sits
  //- outside the scroll area, so the page controls are always on screen
  //- without this component having to fight the modal for a definite height.
  FModal(
    :class="{ 'is-mobile-landscape': isMobileLandscape }"
    :model-value="isOpen"
    :title="t('leaderboard')"
    @update:model-value="isOpen = $event"
  )
    div.flex.flex-col.gap-3.w-full

      //- Player summary card. `shrink-0` keeps the rank number from being
      //- compressed against the card's bottom edge when the list is long.
      div.ui-panel.shrink-0.flex.items-center.justify-between(
        v-if="playerEntry"
        class="px-3 py-2 gap-2"
      )
        div.flex.flex-col.items-start
          span.text-ink-soft.font-black(class="text-[0.75rem] sm:text-xs") {{ t('yourRank') }}
          span.text-royal-700.font-black(class="text-xl sm:text-2xl leading-none") {{ `#${playerRank}` }}
            span.font-bold(class="text-xs sm:text-sm text-ink-soft ml-1") /{{ totalEntries }}
        div.flex.flex-col.items-center
          button.ui-btn.ui-btn--secondary(
            type="button"
            @click="jumpToMe"
            class="px-3 py-2 text-[0.9rem] sm:text-sm"
          ) {{ t('jumpToMe') }}
        div.flex.flex-col.items-end
          span.text-ink-soft.font-black(class="text-[0.75rem] sm:text-xs") {{ t('maxStage') }}
          span.text-royal-700.font-black(class="text-xl sm:text-2xl leading-none") {{ playerEntry.maxStage }}

      //- Entry list. No local scroll cap — FModal's body scrolls the panel.
      div.lb-scroll.flex.flex-col.gap-1.pr-1
        div.lb-row.ui-pop-in(
          v-for="(entry, i) in pagedEntries"
          :key="entry.id"
          :style="{ '--i': Math.min(i, 12) }"
          :class="[\
            'flex items-center gap-2 sm:gap-3 px-2 py-1.5 sm:px-3 sm:py-2',\
            { 'is-player': entry.isPlayer, 'is-top1': indexToRank(entry) === 1 }\
          ]"
        )
          //- Rank chip
          div.flex.items-center.justify-center.rounded-md.font-black(
            :class="[rankBadgeClass(indexToRank(entry)), 'w-7 h-7 sm:w-8 sm:h-8 text-xs sm:text-sm shrink-0']"
          ) {{ indexToRank(entry) }}

          //- Name + parts
          div.flex.flex-col.items-start.min-w-0.flex-1
            span.font-black.truncate.w-full.text-left(
              :class="[entry.isPlayer ? 'text-sky-700' : 'text-ink', 'text-xs sm:text-sm']"
            ) {{ entry.name || t('you') }}
            div.flex.items-center.gap-1.flex-wrap
              span.rounded.border(
                class="text-[0.7rem] sm:text-[0.75rem] px-1 py-0.5 border-ice-400 bg-ice-50 text-ink-soft"
              ) {{ t('parts.' + entry.blade.topPartId) }} +{{ entry.blade.topLevel ?? 0 }}
              span.rounded.border(
                class="text-[0.7rem] sm:text-[0.75rem] px-1 py-0.5 border-ice-400 bg-ice-50 text-ink-soft"
              ) {{ t('parts.' + entry.blade.bottomPartId) }} +{{ entry.blade.bottomLevel ?? 0 }}

          //- Max stage
          div.flex.flex-col.items-center.shrink-0(class="w-10 sm:w-12")
            span(class="text-[0.6rem] sm:text-[0.7rem] text-ink-soft leading-none") {{ t('stage') }}
            span.text-royal-700.font-black(class="text-sm sm:text-base leading-none") {{ entry.maxStage }}

          //- Fight button (crossed swords) — never shown for the player
          button.lb-fight.ui-btn.ui-btn--primary.shrink-0(
            v-if="!entry.isPlayer"
            type="button"
            @click="onFightClick(entry)"
            :disabled="isFightLocked(entry)"
            :aria-label="isFightLocked(entry) ? t('alreadyFoughtToday') : t('fightAsGhost')"
            :title="isFightLocked(entry) ? t('alreadyFoughtToday') : t('fightAsGhost')"
            class="px-2.5 py-2 sm:px-3 sm:py-2.5 text-lg"
          ) ⚔️

          //- "YOU" tag for the player row
          span.lb-you.font-black.shrink-0(
            v-else
            class="text-[0.75rem] sm:text-xs"
          ) {{ t('you') }}

    //- Pagination lives in the FOOTER slot, not in the scrolling body — with
    //- 20 entries per page the controls would otherwise sit ~700px below the
    //- fold, and paging is the one thing you always want to reach.
    template(#footer)
      div.flex.items-center.justify-center.gap-2
        button.ui-btn.ui-btn--secondary(
          type="button"
          @click="goPrev"
          :disabled="currentPage === 1"
          class="px-4 py-2.5 text-sm sm:text-base"
        ) ‹ {{ t('prev') }}
        span.ui-outline-sm.font-black(class="text-xs sm:text-sm")
          | {{ t('page') }} {{ currentPage }} / {{ totalPages }}
        button.ui-btn.ui-btn--secondary(
          type="button"
          @click="goNext"
          :disabled="currentPage === totalPages"
          class="px-4 py-2.5 text-sm sm:text-base"
        ) {{ t('next') }} ›
</template>

<style scoped lang="sass">
// (The `.lb-scroll` scrollbar styling that used to live here is gone with the
// element's own `overflow-y`. FModal's body is the scroller now and carries
// the shared `game-scroll` styling, so the list no longer paints a second,
// differently-coloured bar inside the first.)

.is-mobile-landscape
  :deep(.model-container)
    transform: scale(90%)

// Rows: ice wells that pop in staggered; #1 sun with stripes; the player's
// own row sky with an ink edge + lip (catalog: "own row must pop").
.lb-row
  border: 2px solid var(--color-ice-400)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-200)
  animation-fill-mode: backwards
  &:nth-child(even)
    background-color: var(--color-ice-50)
  &.is-top1
    border-color: var(--color-ink)
    background-color: var(--color-sun-200)
    background-image: var(--ui-stripes)
    box-shadow: 0 2px 0 var(--color-ink)
  &.is-player
    border: 3px solid var(--color-ink)
    background-color: var(--color-sky-200)
    background-image: var(--ui-stripes)
    box-shadow: inset 0 0 0 2px var(--color-sky-500), inset 0 -4px 0 var(--color-sky-500), 0 3px 0 var(--color-ink)

// Rank plate: a square chip; the podium three get colour + a drop.
:deep(.rank-plate)
  border-radius: 0.3rem
.rank-plate.is-podium
  box-shadow: 0 2px 0 var(--color-ink)

.lb-fight
  min-height: 2.75rem
  min-width: 2.75rem

.lb-you
  padding: 0.15em 0.55em 0.2em
  border: 2px solid var(--color-ink)
  border-radius: 0.3rem
  background-color: var(--color-sky-500)
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  box-shadow: 0 2px 0 var(--color-ink)
</style>
