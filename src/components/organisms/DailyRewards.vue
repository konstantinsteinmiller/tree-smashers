<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import {
  SKINS_PER_TOP,
  isSkinOwned,
  buySkin,
  getOfferableSkinPool,
  modelImgPath,
  type SpinnerModelId
} from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import useSounds from '@/use/useSound.ts'
import { stopGameplay } from '@/use/useCrazyGames'
import { saveDataVersion } from '@/use/useSaveStatus'

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { addCoins } = useSpinnerConfig()
const { t } = useI18n()
const dailyBtnRef = ref<HTMLElement | null>(null)

// ─── Daily Rewards Config ────────────────────────────────────────────────────

const DAILY_REWARDS = [100, 200, 300, 400, 500, 750, 1000]
// Day indices (0-based) on which the reward is a skin unlock instead of coins.
// Covers day 3, 5, and 7.
const SKIN_REWARD_DAYS = new Set<number>([2, 4, 6])
const STORAGE_KEY = 'spinner_daily_rewards'

const isSkinDay = (dayIndex: number) => SKIN_REWARD_DAYS.has(dayIndex)

interface DailyState {
  /** Index of the next reward to collect (0-6) */
  currentDay: number
  /** ISO date string of the last collection */
  lastCollected: string | null
  /** Maps day index → skin model id that was awarded on that day. */
  claimedSkins: Record<number, SpinnerModelId>
  /** Maps day index → skin model id previewed (persisted so it doesn't randomize). */
  offeredSkins?: Record<number, SpinnerModelId>
}

// ─── Skin Pool Helpers ──────────────────────────────────────────────────────

// `unownedSkinModelIds` was lifted to the shared `getOfferableSkinPool`
// in `@/use/useModels` (backed by the pure helper in
// `@/data/skinCatalog`). The Battle Pass modal had its own divergent
// copy of this function that forgot to filter SPECIAL_SKINS — single
// source of truth prevents the two from drifting again.
const unownedSkinModelIds = (): SpinnerModelId[] => getOfferableSkinPool()

const pickRandom = <T, >(arr: T[]): T | null =>
  arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)]! : null

/** Unlock a skin for every top part whose catalog contains it. */
const unlockSkinEverywhere = (modelId: SpinnerModelId) => {
  for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    if (SKINS_PER_TOP[topPartId].includes(modelId)) {
      buySkin(topPartId, modelId)
    }
  }
}

const loadState = (): DailyState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.currentDay === 'number') {
        return { ...parsed, claimedSkins: parsed.claimedSkins ?? {} }
      }
    }
  } catch { /* fall through */
  }
  return { currentDay: 0, lastCollected: null, claimedSkins: {} }
}

const saveState = (state: DailyState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const todayStr = () => new Date().toISOString().slice(0, 10)

const yesterdayStr = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ─── Reactive State ──────────────────────────────────────────────────────────

const state = ref<DailyState>(loadState())
const isModalOpen = ref(false)

// Explicit CrazyGames `gameplayStop` on every Daily Rewards open.
// Mirrors the arena's reactive watcher but makes the call-site visible
// per the CG QA request. `stopGameplay()` is idempotent (no-op when
// SDK inactive or already stopped).
watch(isModalOpen, (open) => {
  if (open) stopGameplay()
})

// Per-day skin previews. Each skin day (3/5/7) is assigned a *distinct*
// model id drawn without replacement from the unowned pool, so no two cards
// ever advertise the same skin. Ephemeral — refreshed each time the modal
// opens so the preview always reflects the latest ownership state.
const offeredSkins = ref<Record<number, SpinnerModelId | null>>({})

// Re-read on a save-data bump — a recovered cloud hydrate, or the
// full-progress reset wiping the key (see useResetProgress). Without
// this the component keeps the streak it read at mount and the player
// still sees "day 5 collected" after resetting.
watch(saveDataVersion, () => {
  state.value = loadState()
  offeredSkins.value = {}
})

const shuffled = <T, >(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Sample `count` distinct items from `pool` without replacement. */
const sampleDistinct = <T, >(pool: T[], count: number): T[] =>
  shuffled(pool).slice(0, count)

const refreshOfferedSkins = () => {
  const days = Array.from(SKIN_REWARD_DAYS).sort((a, b) => a - b)
  const persisted = state.value.offeredSkins ?? {}
  const result: Record<number, SpinnerModelId> = {}

  // Single source of truth for what counts as offerable. The previous
  // version called `isModelFullyOwned(...)` directly, which was dropped
  // from the imports during the BP-claim refactor on 2026-05-05 — the
  // resulting ReferenceError silently aborted refreshOfferedSkins, so
  // every skin day rendered just the coin fallback. CG QA caught it
  // 2026-05-05.
  const offerable = new Set(getOfferableSkinPool())

  // Collect skin ids already locked in (claimed or still-valid offers)
  const taken = new Set<SpinnerModelId>()
  for (const d of days) {
    // Claimed days never change
    if (state.value.claimedSkins[d]) continue
    // Keep existing offer if the skin is still offerable (unowned AND
    // non-special — same gate as fresh fills below).
    const prev = persisted[d]
    if (prev && offerable.has(prev)) {
      result[d] = prev
      taken.add(prev)
    }
  }

  // Fill remaining unclaimed days that need a new skin
  const pool = shuffled([...offerable].filter(m => !taken.has(m)))
  let poolIdx = 0
  for (const d of days) {
    if (state.value.claimedSkins[d]) continue
    if (result[d]) continue
    if (poolIdx < pool.length) {
      result[d] = pool[poolIdx]!
      poolIdx++
    }
  }

  offeredSkins.value = result
  // Persist so offers survive modal close/reopen
  state.value.offeredSkins = result
  saveState(state.value)
}

// Re-evaluate streak break whenever the modal opens
watch(isModalOpen, (open) => {
  if (!open) return
  const s = loadState()
  const today = todayStr()
  const yesterday = yesterdayStr()

  if (s.lastCollected && s.lastCollected !== today && s.lastCollected !== yesterday) {
    // Missed a day — reset streak (clear offers too so new cycle gets fresh skins)
    s.currentDay = 0
    s.lastCollected = null
    s.claimedSkins = {}
    s.offeredSkins = {}
    saveState(s)
  }
  state.value = s
  refreshOfferedSkins()
})

const collectedToday = computed(() => state.value.lastCollected === todayStr())

/** Resolve which skin to show for a daily reward day. */
const dailySkinForDay = (dayIndex: number): SpinnerModelId | null =>
  state.value.claimedSkins[dayIndex] ?? offeredSkins.value[dayIndex] ?? null

// True whenever there is a reward ready to collect (drives the bouncing hint
// on the open-modal button).
const hasDailyRewardReady = computed(() => !collectedToday.value)

const collect = (dayIndex: number) => {
  if (dayIndex !== state.value.currentDay) return
  if (collectedToday.value) return

  // Coin reward is always granted, on every day (skin days are additive).
  addCoins(DAILY_REWARDS[dayIndex]!)
  if (dailyBtnRef.value) emit('coins-awarded', dailyBtnRef.value)

  const { playSound } = useSounds()
  playSound('happy')

  if (isSkinDay(dayIndex)) {
    // Re-resolve the pool at collect time to avoid handing out an already-owned
    // skin if something else unlocked it while the modal was open. Exclude
    // skins already promised to other skin days so the assignments stay
    // mutually distinct.
    const reservedByOtherDays = new Set(
      Object.entries(offeredSkins.value)
        .filter(([d, v]) => Number(d) !== dayIndex && v)
        .map(([, v]) => v as SpinnerModelId)
    )
    const pool = unownedSkinModelIds().filter(m => !reservedByOtherDays.has(m))
    // Prefer the previewed skin if it's still unowned, otherwise roll again.
    const preview = offeredSkins.value[dayIndex]
    const toUnlock: SpinnerModelId | null =
      preview && pool.includes(preview) ? preview : pickRandom(pool)
    if (toUnlock) {
      unlockSkinEverywhere(toUnlock)
      state.value.claimedSkins = { ...state.value.claimedSkins, [dayIndex]: toUnlock }
    }
    // If the pool was empty, the coin reward above already covered the slot.
  }

  const nextDay = dayIndex + 1 >= DAILY_REWARDS.length ? 0 : dayIndex + 1
  state.value = {
    ...state.value,
    currentDay: nextDay,
    lastCollected: todayStr()
  }
  saveState(state.value)
  // Repopulate previews for whichever day is now current.
  refreshOfferedSkins()
}
</script>

<template lang="pug">
  //- Open-modal button (positioned by parent flex row in SpinnerArena)
  div.daily-rewards
    button.group.cursor-pointer.z-10.transition-transform(
      ref="dailyBtnRef"
      class="hover:scale-[103%] active:scale-90 scale-80 sm:scale-110"
      :class="{ 'hint-bounce': hasDailyRewardReady }"
      @click="isModalOpen = true"
    )
      div.relative
        div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
        div.relative.rounded-lg.border-2.text-white.font-bold.flex.flex-col.items-center.px-3.py-1(
          class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] pt-2 sm:pt-1"
        )
          span.font-black.game-text.leading-tight(class="text-[10px] sm:text-xs") +{{ DAILY_REWARDS[state.currentDay] }}
          IconCoin(class="w-5 h-5 text-yellow-300")

  //- Daily Rewards Modal
  FModal(
    v-model="isModalOpen"
    :is-closable="true"
    :title="t('dailyRewards')"
  )
    //- The title ribbon is absolutely positioned over the modal frame
    //- and extends below the frame top edge by ~half its height. The
    //- modal-frame's own pt only clears the X button and is too small
    //- on sm/md when the modal's CONTENT is short — the single 7-column
    //- card row would otherwise sit directly under the title. Add top
    //- padding here so the cards always render below the ribbon
    //- regardless of viewport. (CG QA 2026-05-05.)
    div(class="space-y-3 px-1 sm:px-3 pt-6 sm:pt-8 pb-2")
      //- Seven cards WRAPPED, not crammed into one row.
      //-
      //- `grid-cols-7` gave each card ~44px of a 360px phone, which squeezed
      //- the day label, the reward icon, the skin name and the amount into a
      //- column barely wider than the coin icon — the skin names in
      //- particular ("CASTLE", "DEMON") ended up wider than their card. Four
      //- per row roughly doubles the width; the remaining three centre on the
      //- second row thanks to `justify-center`. Flex-wrap rather than a grid
      //- because a grid cannot centre a partial final row.
      //-
      //- `basis` is `25% - gap` so four cards plus their three gaps fit a row
      //- exactly. From `sm` up the original single row of seven is restored.
      div.flex.flex-wrap.justify-center(class="gap-1.5 sm:gap-2")
        div(
          v-for="(reward, i) in DAILY_REWARDS"
          :key="i"
          class="basis-[calc(25%-0.375rem)] sm:basis-[calc(14.2857%-0.5rem)] flex flex-col items-center rounded-xl p-1 sm:p-2 border-2 transition-all"
          :class="[\
            i < state.currentDay \
              ? 'bg-green-900/40 border-green-500/50' \
              : i === state.currentDay \
                ? (isSkinDay(i) ? 'bg-purple-900/40 border-purple-400' : 'bg-yellow-900/40 border-yellow-400') \
                : (isSkinDay(i) ? 'bg-purple-900/20 border-purple-700/60' : 'bg-slate-700/50 border-slate-600')\
          ]"
        )
          //- Day label. The "D" prefix was hardcoded, so every locale showed
          //- "D1…D7". It goes through i18n now — each language picks its own
          //- abbreviation, kept short because the card is only ~80px wide.
          div.text-gray-300.font-bold.uppercase(class="text-[0.6rem] sm:text-[0.75rem]") {{ t('dayShort', { n: i + 1 }) }}

          //- Reward icon — skin image on skin days, coin on all others
          template(v-if="isSkinDay(i) && dailySkinForDay(i)")
            //- Whiteish radial halo behind the skin so dark models (snake,
            //- scorpion, shell, etc.) stay readable on the dark modal bg.
            div.skin-thumb-wrap.relative.flex.items-center.justify-center(
              class="w-6 h-6 sm:w-8 sm:h-8 my-0.5"
            )
              div.absolute.inset-0.rounded-full.pointer-events-none.skin-thumb-halo
              img(
                :src="modelImgPath(dailySkinForDay(i))"
                class="relative w-full h-full object-contain"
                :class="{ 'opacity-80': i !== state.currentDay }"
              )
          template(v-else)
            IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 my-0.5")

          //- Skin label (only when a skin is actually offered for this day)
          div.font-black.game-text.text-purple-300.uppercase.tracking-wider.leading-tight(
            v-if="isSkinDay(i) && dailySkinForDay(i)"
            class="text-[0.6rem] sm:text-[0.75rem]"
          ) {{ t('skins.' + dailySkinForDay(i)) }}

          //- Coin reward amount — shown on every day (additive on skin days)
          div.text-yellow-400.font-black.game-text.leading-tight(class="text-[0.7rem] sm:text-xs") +{{ reward }}

          //- Status.
          //-
          //- The "ready" state used to be a real FIconButton here, which was
          //- the only way to claim. Seven cells across a 360px phone leaves
          //- ~44px for the whole cell, so that button could never be more
          //- than 29x29 — under the tap-target floor and one of the controls
          //- Playgama QA flagged. Claiming moved to the full-width footer
          //- CTA; this is now a purely decorative "you are here" marker, so
          //- its size no longer has to carry a hit box.
          div(class="mt-0.5 text-[0.6rem] sm:text-[0.75rem] font-bold")
            span.text-green-400(v-if="i < state.currentDay") ✓
            template(v-else-if="i === state.currentDay")
              span.text-yellow-300.attention-bounce.inline-block.pointer-events-none(
                v-if="!collectedToday"
                class="text-base sm:text-lg leading-none"
              ) ▾
              span.text-yellow-300(v-else) ✓
            span.text-slate-500(v-else) —

      //- Footer info
      div.text-center(class="text-[0.75rem] sm:text-xs text-slate-400")
        template(v-if="collectedToday")
          | {{ t('comeBackTomorrow') }}
        template(v-else)
          | {{ t('collectTodaysReward') }}

    //- Primary collect CTA.
    //-
    //- The chevron inside the current day's cell stays as the visual
    //- "this is the one" marker, but it can never be a comfortable tap
    //- target: seven cells across a 360px phone leaves ~44px per cell for
    //- the WHOLE cell, so the button inside it measured 29x29. Playgama QA
    //- flagged controls at that size. The real action now lives in the
    //- modal footer, which is full-width, sits outside the scroll region,
    //- and reads as the obvious next step.
    template(#footer)
      FButton(
        v-if="!collectedToday"
        @click="collect(state.currentDay)"
      ) {{ t('collectCta') }}
</template>

<style scoped lang="sass">
// Soft whiteish halo that sits behind skin thumbnails so dark models
// (snake, scorpion, shell, etc.) stay readable on the dark modal background.
.skin-thumb-halo
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.28) 35%, rgba(255, 255, 255, 0) 75%)
  filter: blur(4px)
  transform: scale(1.15)
</style>

<i18n>
en:
  dailyRewards: "Daily Rewards"
  comeBackTomorrow: "Come back tomorrow for your next reward!"
  collectTodaysReward: "Collect today's reward! Don't miss a day or progress resets."
  collectCta: "Collect"
  dayShort: "D{n}"
de:
  dailyRewards: "Tägliche Belohnungen"
  comeBackTomorrow: "Komm morgen für deine nächste Belohnung wieder!"
  collectTodaysReward: "Hol dir deine heutige Belohnung! Verpasse keinen Tag, sonst beginnt der Fortschritt von vorn."
  collectCta: "Abholen"
  dayShort: "T{n}"
fr:
  dailyRewards: "Récompenses quotidiennes"
  comeBackTomorrow: "Reviens demain pour ta prochaine récompense !"
  collectTodaysReward: "Récupère ta récompense du jour ! Ne manque pas un jour ou la progression repart à zéro."
  collectCta: "Récupérer"
  dayShort: "J{n}"
es:
  dailyRewards: "Recompensas diarias"
  comeBackTomorrow: "¡Vuelve mañana por tu próxima recompensa!"
  collectTodaysReward: "¡Reclama la recompensa de hoy! No te pierdas un día o el progreso se reinicia."
  collectCta: "Reclamar"
  dayShort: "D{n}"
jp:
  dailyRewards: "デイリー報酬"
  comeBackTomorrow: "明日また来て次の報酬を受け取ろう！"
  collectTodaysReward: "今日の報酬を受け取ろう！1日でも逃すと進行がリセットされます。"
  collectCta: "受け取る"
  dayShort: "{n}日目"
kr:
  dailyRewards: "일일 보상"
  comeBackTomorrow: "내일 다시 와서 다음 보상을 받으세요!"
  collectTodaysReward: "오늘의 보상을 받으세요! 하루라도 놓치면 진행이 초기화됩니다."
  collectCta: "받기"
  dayShort: "{n}일차"
zh:
  dailyRewards: "每日奖励"
  comeBackTomorrow: "明天回来领取下一个奖励！"
  collectTodaysReward: "领取今日奖励！错过一天进度将重置。"
  collectCta: "领取"
  dayShort: "第{n}天"
ru:
  dailyRewards: "Ежедневные награды"
  comeBackTomorrow: "Возвращайтесь завтра за следующей наградой!"
  collectTodaysReward: "Заберите сегодняшнюю награду! Пропустите день — прогресс сбросится."
  collectCta: "Забрать"
  dayShort: "Д{n}"
</i18n>
