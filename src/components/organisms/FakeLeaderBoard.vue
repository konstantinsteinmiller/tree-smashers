<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t } = useI18n()

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
  if (rank === 1) return 'bg-gradient-to-b from-[#ffd700] to-[#c08a00]'
  if (rank === 2) return 'bg-gradient-to-b from-[#e0e0e0] to-[#9a9a9a]'
  if (rank === 3) return 'bg-gradient-to-b from-[#cd7f32] to-[#80451b]'
  return 'bg-[#0f1a30] text-white/80'
}

const indexToRank = (entry: LeaderboardEntry): number =>
  entries.value.findIndex(e => e.id === entry.id) + 1
</script>

<template lang="pug">
  //- ─── Trigger Button ────────────────────────────────────────────────────
  button(
    @click="openModal"
    class="group cursor-pointer hover:scale-[103%] transition-transform active:scale-90 scale-80 sm:scale-100 pointer-events-auto"
  )
    div.relative
      div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
      div.relative.rounded-lg.border-2.text-white.font-bold.p-2(
        class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
      )
        //- Trophy SVG
        img.w-7.h-7(src="/images/icons/trophy_128x128.webp" alt="trophy")

  //- ─── Modal ──────────────────────────────────────────────────────────────
  FModal(
    :class="{ 'is-mobile-landscape': isMobileLandscape }"
    :model-value="isOpen"
    :title="t('leaderboard')"
    @update:model-value="isOpen = $event"
  )
    div.flex.flex-col.gap-3.w-full

      //- Player summary card
      div.flex.items-center.justify-between.rounded-lg.border-2(
        v-if="playerEntry"
        class="bg-gradient-to-b from-[#ffcd00]/20 to-[#f7a000]/10 border-[#ffcd00]/60 px-3 py-2"
      )
        div.flex.flex-col.items-start
          span.text-white.uppercase.tracking-wider.game-text(class="text-[10px] sm:text-xs opacity-80") {{ t('yourRank') }}
          span.text-yellow-300.font-black.game-text(class="text-xl sm:text-2xl leading-none") {{ `#${playerRank}` }}
            span.font-bold(class="text-xs sm:text-sm text-white/60 ml-1") /{{ totalEntries }}
        div.flex.flex-col.items-center
          button(
            @click="jumpToMe"
            class="rounded-md border border-[#ffcd00]/60 bg-black/30 text-yellow-300 font-bold px-2 py-1 text-[10px] sm:text-xs hover:bg-black/50 cursor-pointer game-text"
          ) {{ t('jumpToMe') }}
        div.flex.flex-col.items-end
          span.text-white.uppercase.tracking-wider.game-text(class="text-[10px] sm:text-xs opacity-80") {{ t('maxStage') }}
          span.text-yellow-300.font-black.game-text(class="text-xl sm:text-2xl leading-none") {{ playerEntry.maxStage }}

      //- Scrollable list
      div.lb-scroll.flex.flex-col.gap-1.overflow-y-auto.pr-1(
        class="max-h-[50vh] sm:max-h-[55vh]"
      )
        div(
          v-for="entry in pagedEntries"
          :key="entry.id"
          :class="[\
            'flex items-center gap-2 sm:gap-3 rounded-lg border px-2 py-1.5 sm:px-3 sm:py-2',\
            entry.isPlayer\
              ? 'bg-gradient-to-r from-[#ffcd00]/30 to-[#f7a000]/10 border-[#ffcd00]/70'\
              : 'bg-[#0c1626] border-[#0f1a30]'\
          ]"
        )
          //- Rank chip
          div.flex.items-center.justify-center.rounded-md.font-black.game-text.text-white(
            :class="[rankBadgeClass(indexToRank(entry)), 'w-7 h-7 sm:w-8 sm:h-8 text-xs sm:text-sm shrink-0']"
          ) {{ indexToRank(entry) }}

          //- Name + parts
          div.flex.flex-col.items-start.min-w-0.flex-1
            span.font-bold.game-text.truncate.w-full.text-left(
              :class="[entry.isPlayer ? 'text-yellow-300' : 'text-white', 'text-xs sm:text-sm']"
            ) {{ entry.name }}
            div.flex.items-center.gap-1.flex-wrap
              span.rounded.border.font-mono(
                class="text-[9px] sm:text-[10px] px-1 py-0.5 border-white/15 bg-black/30 text-white/80"
              ) {{ entry.blade.topPartId }} +{{ entry.blade.topLevel ?? 0 }}
              span.rounded.border.font-mono(
                class="text-[9px] sm:text-[10px] px-1 py-0.5 border-white/15 bg-black/30 text-white/80"
              ) {{ entry.blade.bottomPartId }} +{{ entry.blade.bottomLevel ?? 0 }}

          //- Max stage
          div.flex.flex-col.items-center.shrink-0(class="w-10 sm:w-12")
            span.uppercase.game-text(class="text-[8px] sm:text-[9px] text-white/60 leading-none") {{ t('stage') }}
            span.text-yellow-300.font-black.game-text(class="text-sm sm:text-base leading-none") {{ entry.maxStage }}

          //- Fight button (crossed swords) — never shown for the player
          button(
            v-if="!entry.isPlayer"
            @click="onFightClick(entry)"
            :disabled="isFightLocked(entry)"
            :class="[\
              'shrink-0 group transition-transform',\
              isFightLocked(entry)\
                ? 'opacity-40 cursor-not-allowed grayscale'\
                : 'cursor-pointer hover:scale-[105%] active:scale-90'\
            ]"
            :title="isFightLocked(entry) ? t('alreadyFoughtToday') : t('fightAsGhost')"
          )
            div.relative
              div.absolute.inset-0.translate-y-1.rounded-md(class="bg-[#6b1212] inset-x-[1px]")
              div.relative.rounded-md.border-2.text-white(
                class="bg-gradient-to-b from-[#ff5e5e] to-[#c01818] border-[#0f1a30] p-1.5 sm:p-2"
              ) ⚔️

          //- "YOU" tag for the player row
          span.text-yellow-300.font-black.game-text.shrink-0(
            v-else
            class="text-[10px] sm:text-xs px-2"
          ) {{ t('you') }}

      //- Pagination controls
      div.flex.items-center.justify-center.gap-2.pt-1
        button(
          @click="goPrev"
          :disabled="currentPage === 1"
          class="rounded-md border border-[#ffcd00]/50 bg-black/40 text-yellow-300 font-bold px-3 py-1 text-xs hover:bg-black/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer game-text"
        ) ‹ {{ t('prev') }}
        span.text-white.font-bold.game-text(class="text-xs sm:text-sm")
          | {{ t('page') }} {{ currentPage }} / {{ totalPages }}
        button(
          @click="goNext"
          :disabled="currentPage === totalPages"
          class="rounded-md border border-[#ffcd00]/50 bg-black/40 text-yellow-300 font-bold px-3 py-1 text-xs hover:bg-black/60 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer game-text"
        ) {{ t('next') }} ›
</template>

<style scoped lang="sass">
.lb-scroll
  scrollbar-width: thin
  scrollbar-color: #ffcd00 transparent

  &::-webkit-scrollbar
    width: 6px

  &::-webkit-scrollbar-thumb
    background: #ffcd00
    border-radius: 3px

  &::-webkit-scrollbar-track
    background: transparent

.is-mobile-landscape
  :deep(.model-container)
    transform: scale(90%)
</style>

<i18n>
en:
  leaderboard: "Leaderboard"
  yourRank: "Your Rank"
  jumpToMe: "Jump to me"
  maxStage: "Max Stage"
  alreadyFoughtToday: "Already fought today — comes back tomorrow"
  fightAsGhost: "Fight as ghost battle"
de:
  leaderboard: "Bestenliste"
  yourRank: "Dein Rang"
  jumpToMe: "Zu mir"
  maxStage: "Max. Etappe"
  alreadyFoughtToday: "Heute schon gekämpft — kommt morgen wieder"
  fightAsGhost: "Als Geisterkampf antreten"
fr:
  leaderboard: "Classement"
  yourRank: "Ton rang"
  jumpToMe: "Aller à moi"
  maxStage: "Étape max"
  alreadyFoughtToday: "Déjà combattu aujourd'hui — revient demain"
  fightAsGhost: "Combattre en duel fantôme"
es:
  leaderboard: "Clasificación"
  yourRank: "Tu rango"
  jumpToMe: "Ir a mí"
  maxStage: "Etapa máx."
  alreadyFoughtToday: "Ya combatiste hoy — vuelve mañana"
  fightAsGhost: "Luchar como combate fantasma"
jp:
  leaderboard: "ランキング"
  yourRank: "あなたの順位"
  jumpToMe: "自分へジャンプ"
  maxStage: "最高ステージ"
  alreadyFoughtToday: "本日既に対戦済み — 明日また挑戦"
  fightAsGhost: "ゴーストバトルで戦う"
kr:
  leaderboard: "리더보드"
  yourRank: "내 순위"
  jumpToMe: "내 위치로"
  maxStage: "최고 스테이지"
  alreadyFoughtToday: "오늘은 이미 싸웠습니다 — 내일 다시"
  fightAsGhost: "고스트 배틀로 싸우기"
zh:
  leaderboard: "排行榜"
  yourRank: "你的排名"
  jumpToMe: "跳转到我"
  maxStage: "最高关卡"
  alreadyFoughtToday: "今天已经战斗过 — 明天再来"
  fightAsGhost: "进行幽灵战斗"
ru:
  leaderboard: "Таблица лидеров"
  yourRank: "Ваш ранг"
  jumpToMe: "К себе"
  maxStage: "Макс. этап"
  alreadyFoughtToday: "Сегодня уже сражались — приходите завтра"
  fightAsGhost: "Бой с призраком"
</i18n>
