<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import FIconButton from '@/components/atoms/FIconButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useBattlePass, {
  BP_TOTAL_STAGES,
  BP_XP_PER_STAGE
} from '@/use/useBattlePass'
import {
  modelImgPath,
  SKINS_PER_TOP,
  isModelFullyOwned,
  buySkin,
  type SpinnerModelId
} from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import useSounds from '@/use/useSound.ts'
import usePvpStats, { HONOR_PER_STAGE, HONOR_TOTAL_STAGES } from '@/use/usePvpStats'
import usePVP from '@/use/usePVP'
import { stopGameplay } from '@/use/useCrazyGames'

const {
  currentXp,
  unlockedStages,
  hasUnclaimedReward,
  pendingClaimCount,
  isStageClaimed,
  isStageUnlocked,
  bpCoinReward,
  bpIsSkinStage,
  claimStage,
  claimedSkins,
  isMaxed,
  daysUntilReset,
  persistedOffers,
  saveOfferedSkins
} = useBattlePass()

const {
  honor: honorPoints,
  honorStages: honorUnlockedStages,
  isHonorMaxed,
  honorProgressFraction,
  pendingHonorClaims,
  isHonorStageClaimed,
  isHonorStageUnlocked,
  claimHonorStage,
  claimedHonorSkins,
  persistedHonorOffers,
  saveOfferedHonorSkins
} = usePvpStats()

const { canShowPvP } = usePVP()

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { t } = useI18n()

const isModalOpen = ref(false)
const bpBtnRef = ref<HTMLElement | null>(null)

// Explicit CrazyGames `gameplayStop` on every Battle Pass open. Mirrors
// the arena's reactive watcher but makes the call-site visible per the
// CG QA request. `stopGameplay()` is idempotent (no-op when SDK inactive
// or already stopped).
watch(isModalOpen, (open) => {
  if (open) stopGameplay()
})

// ─── Derived UI state ───────────────────────────────────────────────────────

/** The stage whose bar is currently being filled (1..TOTAL or 0 when maxed). */
const inProgressStage = computed(() =>
  isMaxed.value ? 0 : unlockedStages.value + 1
)

/** 0..1 fraction of xp into the in-progress stage. */
const progressFraction = computed(() =>
  Math.max(0, Math.min(1, currentXp.value / BP_XP_PER_STAGE))
)

/** List of all 50 stages as UI descriptors. */
const stageCards = computed(() =>
  Array.from({ length: BP_TOTAL_STAGES }, (_, i) => {
    const stage = i + 1
    return {
      stage,
      coins: bpCoinReward(stage),
      isSkin: bpIsSkinStage(stage),
      unlocked: isStageUnlocked(stage),
      claimed: isStageClaimed(stage),
      inProgress: stage === inProgressStage.value
    }
  })
)

// ─── Skin preview (for stages marked as skin rewards) ─────────────────────
// Dynamically pick an unowned skin to advertise on each unclaimed skin card,
// re-sampled whenever the modal opens so the preview reflects reality.

const offeredSkins = ref<Record<number, SpinnerModelId | null>>({})

const unownedSkinModelIds = (): SpinnerModelId[] => {
  const out: SpinnerModelId[] = []
  const seen = new Set<string>()
  for (const top of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    for (const m of SKINS_PER_TOP[top]) {
      if (seen.has(m)) continue
      seen.add(m)
      if (!isModelFullyOwned(m)) out.push(m)
    }
  }
  return out
}

const shuffled = <T, >(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const refreshOfferedSkins = () => {
  const skinStages = stageCards.value.filter(c => c.isSkin && !c.claimed).map(c => c.stage)
  const persisted = persistedOffers.value
  const result: Record<number, SpinnerModelId | null> = {}
  const taken = new Set<SpinnerModelId>()

  // Keep existing offers that are still unowned
  for (const stage of skinStages) {
    const prev = persisted[stage]
    if (prev && !isModelFullyOwned(prev)) {
      result[stage] = prev
      taken.add(prev)
    }
  }

  // Fill stages that need a new skin
  const pool = shuffled(unownedSkinModelIds().filter(m => !taken.has(m)))
  let poolIdx = 0
  for (const stage of skinStages) {
    if (result[stage]) continue
    if (poolIdx < pool.length) {
      result[stage] = pool[poolIdx]!
      poolIdx++
    }
  }

  offeredSkins.value = result
  // Persist valid offers (strip nulls)
  const toSave: Record<number, SpinnerModelId> = {}
  for (const [k, v] of Object.entries(result)) {
    if (v) toSave[Number(k)] = v
  }
  saveOfferedSkins(toSave)
}

// ─── Auto-scroll to the in-progress stage when the modal opens ─────────────

const stripRef = ref<HTMLElement | null>(null)

const scrollToCurrentStage = () => {
  if (!stripRef.value) return
  // Scroll to earliest unclaimed-but-unlocked stage so the player sees
  // pending rewards first; fall back to in-progress or final stage.
  const firstUnclaimed = stageCards.value.find(c => c.unlocked && !c.claimed)
  const target = firstUnclaimed
    ? firstUnclaimed.stage
    : inProgressStage.value > 0
      ? inProgressStage.value
      : BP_TOTAL_STAGES
  const el = stripRef.value.querySelector<HTMLElement>(`[data-bp-stage="${target}"]`)
  if (!el) return
  const strip = stripRef.value
  const offset = el.offsetLeft - (strip.clientWidth - el.clientWidth) / 2
  strip.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' })
}

watch(isModalOpen, (open) => {
  if (!open) return
  refreshOfferedSkins()
  refreshHonorOfferedSkins()
  nextTick(() => scrollToCurrentStage())
})

// ─── Honor Track ──────────────────────────────────────────────────────────

const showHonorInfo = ref(false)

/** Honor stage cards — each grants a skin. */
const honorStageCards = computed(() =>
  Array.from({ length: HONOR_TOTAL_STAGES }, (_, i) => {
    const stage = i + 1
    return {
      stage,
      unlocked: isHonorStageUnlocked(stage),
      claimed: isHonorStageClaimed(stage),
      inProgress: !isHonorMaxed.value && stage === honorUnlockedStages.value + 1
    }
  })
)

// Offered skins for honor track stages
const honorOfferedSkins = ref<Record<number, SpinnerModelId | null>>({})

const refreshHonorOfferedSkins = () => {
  const stages = honorStageCards.value.filter(c => !c.claimed).map(c => c.stage)
  const persisted = persistedHonorOffers.value
  const result: Record<number, SpinnerModelId | null> = {}
  const taken = new Set<SpinnerModelId>()

  // Keep existing offers that are still unowned
  for (const stage of stages) {
    const prev = persisted[stage]
    if (prev && !isModelFullyOwned(prev)) {
      result[stage] = prev
      taken.add(prev)
    }
  }

  // Fill stages that need a new skin
  const pool = shuffled(unownedSkinModelIds().filter(m => !taken.has(m)))
  let poolIdx = 0
  for (const stage of stages) {
    if (result[stage]) continue
    if (poolIdx < pool.length) {
      result[stage] = pool[poolIdx]!
      poolIdx++
    }
  }

  honorOfferedSkins.value = result
  // Persist valid offers
  const toSave: Record<number, SpinnerModelId> = {}
  for (const [k, v] of Object.entries(result)) {
    if (v) toSave[Number(k)] = v
  }
  saveOfferedHonorSkins(toSave)
}

// ─── Claim action ──────────────────────────────────────────────────────────

/** Resolve which skin image to show for a BP skin stage.
 *  Merged into a computed map so Vue tracks both sources reactively. */
const bpSkinMap = computed<Record<number, SpinnerModelId | null>>(() => {
  const result: Record<number, SpinnerModelId | null> = {}
  for (let i = 1; i <= BP_TOTAL_STAGES; i++) {
    result[i] = claimedSkins.value[i] ?? offeredSkins.value[i] ?? null
  }
  return result
})
const bpSkinForStage = (stage: number): SpinnerModelId | null =>
  bpSkinMap.value[stage] ?? null

/** Resolve which skin image to show for an honor track stage.
 *  Merged into a single computed map so Vue tracks both sources reactively. */
const honorSkinMap = computed<Record<number, SpinnerModelId | null>>(() => {
  const result: Record<number, SpinnerModelId | null> = {}
  for (let i = 1; i <= HONOR_TOTAL_STAGES; i++) {
    result[i] = claimedHonorSkins.value[i] ?? honorOfferedSkins.value[i] ?? null
  }
  return result
})
const honorSkinForStage = (stage: number): SpinnerModelId | null =>
  honorSkinMap.value[stage] ?? null

const onClaim = (stage: number) => {
  const { playSound } = useSounds()
  playSound('happy')
  const res = claimStage(stage, offeredSkins.value[stage])
  if (res) {
    if (res.coins > 0 && bpBtnRef.value) emit('coins-awarded', bpBtnRef.value)
    refreshOfferedSkins()
    refreshHonorOfferedSkins()
  }
}

const onClaimHonor = (stage: number) => {
  const skin = honorOfferedSkins.value[stage]
  if (!skin) return
  if (!claimHonorStage(stage, skin)) return
  const { playSound } = useSounds()
  playSound('happy')
  // Unlock the skin everywhere (same as BP skin claim)
  for (const topPartId of Object.keys(SKINS_PER_TOP) as TopPartId[]) {
    if (SKINS_PER_TOP[topPartId].includes(skin)) {
      buySkin(topPartId, skin)
    }
  }
  refreshHonorOfferedSkins()
}

// ─── Drag-to-scroll for the BP strip ────────────────────────────────────────

const isDragging = ref(false)
let dragStartX = 0
let dragScrollLeft = 0
let dragMoved = false

const onStripPointerDown = (e: PointerEvent) => {
  // Touch / pen gestures are handled by the browser's native horizontal
  // scroll — don't fight it from JS, or the drag dies the moment the
  // browser claims the gesture and fires pointercancel.
  if (e.pointerType !== 'mouse') return
  const strip = stripRef.value
  if (!strip) return
  isDragging.value = true
  dragMoved = false
  dragStartX = e.clientX
  dragScrollLeft = strip.scrollLeft
}

const onStripPointerMove = (e: PointerEvent) => {
  if (e.pointerType !== 'mouse') return
  if (!isDragging.value || !stripRef.value) return
  const dx = e.clientX - dragStartX
  if (Math.abs(dx) > 3) {
    if (!dragMoved) {
      // Start capture only once we know it's a real drag, not a tap
      stripRef.value.setPointerCapture(e.pointerId)
    }
    dragMoved = true
  }
  if (dragMoved) stripRef.value.scrollLeft = dragScrollLeft - dx
}

const onStripPointerUp = (e: PointerEvent) => {
  if (!isDragging.value) return
  isDragging.value = false
  if (dragMoved) stripRef.value?.releasePointerCapture(e.pointerId)
}
</script>

<template lang="pug">
  //- Open-modal button (positioned by parent flex row in SpinnerArena)
  div.battle-pass
    button.group.cursor-pointer.z-10.transition-transform(
      ref="bpBtnRef"
      class="hover:scale-[103%] active:scale-90 scale-80 sm:scale-110"
      :class="{ 'hint-bounce': hasUnclaimedReward || (canShowPvP && pendingHonorClaims > 0) }"
      @click="isModalOpen = true"
    )
      div.relative
        div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
        div.relative.rounded-lg.border-2.text-white.font-bold.flex.flex-col.items-center.px-3.py-2(
          class="bg-gradient-to-b from-[#5b3bff] to-[#2a1a88] border-[#0f1a30] pt-3 sm:pt-2"
        )
          span.font-black.game-text.leading-tight.text-white(class="text-[10px] sm:text-xs") BP
          div.flex.items-center(class="gap-0.5")
            span.font-black.game-text.leading-none(
              class="text-[11px] sm:text-sm text-amber-300"
            ) {{ unlockedStages }}
            span.font-black.game-text.leading-none.text-white(
              class="text-[9px] sm:text-[10px] opacity-70"
            ) /{{ BP_TOTAL_STAGES }}
          //- Tiny unclaimed-count badge
          div.absolute.flex.items-center.justify-center.rounded-full.font-black.game-text(
            v-if="pendingClaimCount + (canShowPvP ? pendingHonorClaims : 0) > 0"
            class="bg-red-500 text-white text-[9px] w-4 h-4 -top-1 -right-1 border border-[#0f1a30]"
          ) {{ pendingClaimCount + (canShowPvP ? pendingHonorClaims : 0) }}

  //- Battle Pass Modal
  FModal(
    v-model="isModalOpen"
    :is-closable="true"
    :title="t('battlePass')"
  )
    div(class="space-y-3 px-1 sm:px-3 py-2 max-h-[70vh] overflow-y-auto")
      //- Summary row: current stage + xp progress bar
      div(class="flex items-center gap-2 px-1 sm:px-2")
        div.flex.flex-col.items-start.shrink-0
          span.text-gray-300.font-bold.uppercase(class="text-[8px] sm:text-[10px]") {{ t('stage') }}
          span.text-white.font-black.game-text.leading-none(class="text-lg sm:text-xl") {{ unlockedStages }}/{{ BP_TOTAL_STAGES }}
        div.flex-1.flex.flex-col.gap-1
          div.flex.justify-between.items-end
            span.text-gray-300.font-bold.uppercase(class="text-[8px] sm:text-[10px]")
              template(v-if="isMaxed") {{ t('complete') }}
              template(v-else) {{ t('stage') }} {{ inProgressStage }}
            span.text-yellow-400.font-black.game-text(class="text-[9px] sm:text-xs")
              template(v-if="isMaxed") {{ t('max') }}
              template(v-else) {{ Math.floor(currentXp) }}/{{ BP_XP_PER_STAGE }} xp
          div.relative.w-full.overflow-hidden.rounded-full.border(
            class="h-2.5 sm:h-3 bg-slate-800/70 border-slate-700"
          )
            div.h-full.rounded-full.transition-all(
              class="bg-gradient-to-r from-[#8b5cf6] via-[#a78bfa] to-[#fbbf24]"
              :style="{ width: `${progressFraction * 100}%` }"
            )

      //- Horizontal scroll strip of all 50 stages
      div.relative
        div.flex.gap-1.overflow-x-auto.overflow-y-hidden.py-2.px-1.bp-strip(
          ref="stripRef"
          class="sm:gap-2"
          :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
          @pointerdown="onStripPointerDown"
          @pointermove="onStripPointerMove"
          @pointerup="onStripPointerUp"
          @pointercancel="onStripPointerUp"
        )
          div(
            v-for="card in stageCards"
            :key="card.stage"
            :data-bp-stage="card.stage"
            class="shrink-0 flex flex-col items-center rounded-xl p-1 sm:p-2 border-2 transition-all w-16 sm:w-20"
            :class="[\
              card.claimed \
                ? 'bg-green-900/40 border-green-500/50' \
                : card.unlocked \
                  ? (card.isSkin ? 'bg-purple-900/40 border-purple-400' : 'bg-yellow-900/40 border-yellow-400') \
                  : card.inProgress \
                    ? (card.isSkin ? 'bg-purple-900/25 border-purple-500/70' : 'bg-yellow-900/25 border-yellow-500/70') \
                    : (card.isSkin ? 'bg-purple-900/20 border-purple-700/60' : 'bg-slate-700/50 border-slate-600')\
            ]"
          )
            //- Stage number
            div.text-gray-300.font-bold.uppercase(class="text-[8px] sm:text-[10px]") S{{ card.stage }}

            //- Reward icon
            template(v-if="card.isSkin && bpSkinForStage(card.stage)")
              div.skin-thumb-wrap.relative.flex.items-center.justify-center(
                class="w-6 h-6 sm:w-8 sm:h-8 my-0.5"
              )
                div.absolute.inset-0.rounded-full.pointer-events-none.skin-thumb-halo
                img(
                  :src="modelImgPath(bpSkinForStage(card.stage))"
                  class="relative w-full h-full object-contain"
                  :class="{ 'opacity-60': !card.unlocked && !card.claimed }"
                )
            template(v-else-if="card.isSkin")
              //- Skin stage but no unowned skin previewable — show a
              //- generic coin icon (claim will fall back to coins).
              IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 my-0.5 opacity-70")
            template(v-else)
              IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 my-0.5")

            //- Skin label
            div.font-black.game-text.text-purple-300.uppercase.tracking-wider.leading-tight(
              v-if="card.isSkin && bpSkinForStage(card.stage)"
              class="text-[7px] sm:text-[9px] truncate max-w-full"
            ) {{ t('skins.' + bpSkinForStage(card.stage)) }}

            //- Coin amount (shown on coin stages, and as fallback hint on skin stages w/ empty pool)
            div.text-yellow-400.font-black.game-text.leading-tight(
              v-if="!card.isSkin || !bpSkinForStage(card.stage)"
              class="text-[9px] sm:text-xs"
            ) +{{ card.coins }}

            //- Status row
            div(class="mt-0.5 text-[8px] sm:text-[10px] font-bold")
              span.text-green-400(v-if="card.claimed") ✓
              template(v-else-if="card.unlocked")
                FIconButton(
                  type="primary"
                  size="sm"
                  icon="right"
                  @click="onClaim(card.stage)"
                )
              template(v-else-if="card.inProgress")
                span.text-amber-300 {{ Math.floor(progressFraction * 100) }}%
              span.text-slate-500(v-else) —

      //- ── Honor Track (only visible when PvP is enabled) ──────────────
      div.rounded-xl.border-2.border-purple-700.bg-purple-900.bg-opacity-20.p-3(
        v-if="canShowPvP"
        class="mt-2 space-y-2"
      )
        //- Header row with title + info icon
        div.flex.items-center.justify-between
          div.flex.items-center.gap-2
            span.text-purple-300.font-black.game-text.uppercase(class="text-xs sm:text-sm") {{ t('honorTrack') }}
            //- Info tooltip toggle
            button.cursor-pointer.flex.items-center.justify-center.rounded-full.border.border-purple-500.text-purple-300.transition-colors(
              class="w-4 h-4 sm:w-5 sm:h-5 hover:bg-purple-800"
              @click="showHonorInfo = !showHonorInfo"
            )
              span.font-bold(class="text-[9px] sm:text-[10px]") ?
          //- Progress
          span.text-purple-300.font-bold.game-text(class="text-[10px] sm:text-xs")
            template(v-if="isHonorMaxed") {{ t('complete') }}
            template(v-else) {{ honorPoints }}/{{ HONOR_PER_STAGE }} {{ t('honorAbbr') }}

        //- Info tooltip (toggled)
        div.text-purple-200.rounded-lg.bg-purple-900.bg-opacity-60.p-2(
          v-if="showHonorInfo"
          class="text-[9px] sm:text-xs leading-snug"
        ) {{ t('honorInfo') }}

        //- Honor progress bar
        div.relative.w-full.overflow-hidden.rounded-full.border(
          v-if="!isHonorMaxed"
          class="h-2 bg-slate-800/70 border-purple-700/50"
        )
          div.h-full.rounded-full.transition-all(
            class="bg-gradient-to-r from-purple-500 via-purple-400 to-yellow-400"
            :style="{ width: `${honorProgressFraction * 100}%` }"
          )

        //- Honor stage cards (3 skins)
        div.flex.gap-2.justify-center
          div(
            v-for="card in honorStageCards"
            :key="card.stage"
            class="flex flex-col items-center rounded-xl p-2 border-2 transition-all w-20 sm:w-24"
            :class="[\
              card.claimed \
                ? 'bg-green-900/40 border-green-500/50' \
                : card.unlocked \
                  ? 'bg-purple-900/40 border-purple-400' \
                  : card.inProgress \
                    ? 'bg-purple-900/25 border-purple-500/70' \
                    : 'bg-purple-900/20 border-purple-700/60'\
            ]"
          )
            //- Stage label
            div.text-purple-300.font-bold.uppercase(class="text-[8px] sm:text-[10px]") H{{ card.stage }}

            //- Skin preview
            template(v-if="honorSkinForStage(card.stage)")
              div.skin-thumb-wrap.relative.flex.items-center.justify-center(
                class="w-8 h-8 sm:w-10 sm:h-10 my-0.5"
              )
                div.absolute.inset-0.rounded-full.pointer-events-none.skin-thumb-halo
                img(
                  :src="modelImgPath(honorSkinForStage(card.stage))"
                  class="relative w-full h-full object-contain"
                  :class="{ 'opacity-60': !card.unlocked && !card.claimed }"
                )
            template(v-else-if="card.claimed")
              div.flex.items-center.justify-center.text-green-400(class="w-8 h-8 sm:w-10 sm:h-10 my-0.5 text-lg") ✓
            template(v-else)
              div.flex.items-center.justify-center.text-purple-500(class="w-8 h-8 sm:w-10 sm:h-10 my-0.5 text-[10px]") ?

            //- Skin label
            div.font-black.game-text.text-purple-300.uppercase.tracking-wider.leading-tight(
              v-if="honorSkinForStage(card.stage)"
              class="text-[7px] sm:text-[9px] truncate max-w-full"
            ) {{ t('skins.' + honorSkinForStage(card.stage)) }}

            //- Status
            div(class="mt-0.5 text-[8px] sm:text-[10px] font-bold")
              span.text-green-400(v-if="card.claimed") ✓
              template(v-else-if="card.unlocked")
                FIconButton(
                  type="primary"
                  size="sm"
                  icon="right"
                  @click="onClaimHonor(card.stage)"
                )
              template(v-else-if="card.inProgress")
                span.text-purple-300 {{ Math.floor(honorProgressFraction * 100) }}%
              span.text-slate-500(v-else) —

      //- Season reset countdown
      div.text-center(
        v-if="daysUntilReset != null"
        class="text-[10px] sm:text-xs text-amber-400/80 font-bold"
      ) {{ t('seasonReset', { n: daysUntilReset }) }}
      //- Footer tip
      div.text-center(class="text-[10px] sm:text-xs text-slate-400")
        template(v-if="isMaxed")
          | {{ t('battlePassComplete') }}
        template(v-else-if="hasUnclaimedReward")
          | {{ t('rewardsReady', { n: pendingClaimCount }) }}
        template(v-else)
          | {{ t('xpHint') }}
</template>

<style scoped lang="sass">
// Hide the horizontal scrollbar on the stage strip while keeping it
// scrollable. Matches the visual language of the rest of the HUD.
.bp-strip
  scrollbar-width: none
  // Let the browser handle touch scrolling natively on both axes — the
  // JS drag-to-scroll below is mouse-only. A `pan-y`-only value made the
  // browser cancel pointer events the moment a finger drifted vertically,
  // which killed the drag after a few pixels on mobile.
  touch-action: pan-x pan-y
  user-select: none

  &::-webkit-scrollbar
    display: none

// Soft whiteish halo that sits behind skin thumbnails so dark models
// stay readable on the dark modal background (mirrors DailyRewards).
.skin-thumb-halo
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.28) 35%, rgba(255, 255, 255, 0) 75%)
  filter: blur(4px)
  transform: scale(1.15)
</style>

<i18n>
en:
  battlePass: "Battle Pass"
  complete: "COMPLETE"
  max: "MAX"
  battlePassComplete: "Battle Pass complete — nice work!"
  rewardsReady: "You have {n} reward(s) ready to collect!"
  xpHint: "Win campaign fights for +50xp, leaderboard fights for +25xp. Losses give +12xp."
  honorTrack: "Honor Track"
  honorAbbr: "HP"
  honorInfo: "Win PvP battles to earn Honor Points (HP). Fair-game (Level 1) wins give 100 HP. 3 wins unlock 1 skin. Beat stronger opponents for bonus HP!"
  seasonReset: "Season resets in {n} day(s) — collect your rewards!"
de:
  battlePass: "Battle Pass"
  complete: "ABGESCHLOSSEN"
  max: "MAX"
  battlePassComplete: "Battle Pass abgeschlossen — gut gemacht!"
  rewardsReady: "Du hast {n} Belohnung(en) zum Abholen!"
  xpHint: "Kampagnenkämpfe gewinnen gibt +50xp, Bestenlisten-Kämpfe +25xp. Niederlagen geben +12xp."
  honorTrack: "Ehren-Track"
  honorAbbr: "EP"
  honorInfo: "Gewinne PvP-Kämpfe für Ehrenpunkte (EP). Fairer Kampf (Level 1) gibt 100 EP. 3 Siege schalten 1 Skin frei. Besiege stärkere Gegner für Bonus-EP!"
  seasonReset: "Saison endet in {n} Tag(en) — hol dir deine Belohnungen!"
fr:
  battlePass: "Battle Pass"
  complete: "TERMINÉ"
  max: "MAX"
  battlePassComplete: "Battle Pass terminé — bien joué !"
  rewardsReady: "Tu as {n} récompense(s) à récupérer !"
  xpHint: "Gagne des combats de campagne pour +50xp, classement +25xp. Défaites : +12xp."
  honorTrack: "Piste d'Honneur"
  honorAbbr: "PH"
  honorInfo: "Gagne des combats PvP pour obtenir des Points d'Honneur (PH). Combat équitable (Niveau 1) donne 100 PH. 3 victoires débloquent 1 skin. Bats des adversaires plus forts pour des PH bonus !"
  seasonReset: "La saison se réinitialise dans {n} jour(s) — récupère tes récompenses !"
es:
  battlePass: "Pase de Batalla"
  complete: "COMPLETO"
  max: "MÁX"
  battlePassComplete: "¡Pase de Batalla completado — buen trabajo!"
  rewardsReady: "¡Tienes {n} recompensa(s) para reclamar!"
  xpHint: "Gana combates de campaña para +50xp, de clasificación +25xp. Derrotas: +12xp."
  honorTrack: "Pista de Honor"
  honorAbbr: "PH"
  honorInfo: "Gana combates PvP para obtener Puntos de Honor (PH). Combate justo (Nivel 1) da 100 PH. 3 victorias desbloquean 1 skin. ¡Vence a rivales más fuertes para PH extra!"
  seasonReset: "¡La temporada se reinicia en {n} día(s) — reclama tus recompensas!"
jp:
  battlePass: "バトルパス"
  complete: "完了"
  max: "MAX"
  battlePassComplete: "バトルパス達成 — お見事！"
  rewardsReady: "{n} 個の報酬を受け取れます！"
  xpHint: "キャンペーン戦勝利で +50xp、ランキング戦で +25xp。敗北でも +12xp。"
  honorTrack: "名誉トラック"
  honorAbbr: "名誉P"
  honorInfo: "PvPバトルに勝利して名誉ポイント(名誉P)を獲得。フェアゲーム（レベル1）勝利で100名誉P。3勝で1スキン解放。強い相手に勝つとボーナス名誉P！"
  seasonReset: "シーズンリセットまであと{n}日 — 報酬を受け取ろう！"
kr:
  battlePass: "배틀 패스"
  complete: "완료"
  max: "MAX"
  battlePassComplete: "배틀 패스 완료 — 멋져요!"
  rewardsReady: "받을 수 있는 보상이 {n} 개 있습니다!"
  xpHint: "캠페인 전투 승리 +50xp, 리더보드 전투 +25xp. 패배 시 +12xp."
  honorTrack: "명예 트랙"
  honorAbbr: "명예P"
  honorInfo: "PvP 전투에서 승리하여 명예 포인트(명예P)를 획득하세요. 공정 게임(레벨 1) 승리 시 100 명예P. 3승으로 스킨 1개 해제. 강한 상대를 이기면 보너스 명예P!"
  seasonReset: "시즌 리셋까지 {n}일 — 보상을 받으세요!"
zh:
  battlePass: "战斗通行证"
  complete: "完成"
  max: "满级"
  battlePassComplete: "战斗通行证已完成 — 干得漂亮！"
  rewardsReady: "你有 {n} 个奖励可以领取！"
  xpHint: "赢得战役战斗 +50xp，排行榜战斗 +25xp，失败 +12xp。"
  honorTrack: "荣誉通道"
  honorAbbr: "荣誉点"
  honorInfo: "赢得PvP战斗获得荣誉点数(荣誉点)。公平对战（等级1）胜利获得100荣誉点。3胜解锁1个皮肤。击败更强对手获得额外荣誉点！"
  seasonReset: "赛季将在{n}天后重置 — 快领取奖励！"
ru:
  battlePass: "Боевой пропуск"
  complete: "ЗАВЕРШЕНО"
  max: "МАКС"
  battlePassComplete: "Боевой пропуск пройден — отличная работа!"
  rewardsReady: "У вас {n} награда(ы) к получению!"
  xpHint: "Побед в кампании +50xp, в таблице лидеров +25xp. Поражения дают +12xp."
  honorTrack: "Путь Чести"
  honorAbbr: "ОЧ"
  honorInfo: "Побеждайте в PvP-боях, чтобы получить Очки Чести (ОЧ). Честный бой (Уровень 1) даёт 100 ОЧ. 3 победы открывают 1 скин. Победа над сильными соперниками даёт бонусные ОЧ!"
  seasonReset: "Сезон сбросится через {n} дн. — заберите награды!"
</i18n>
