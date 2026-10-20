<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import FIconButton from '@/components/atoms/FIconButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import IconBattlePass from '@/components/icons/IconBattlePass.vue'
import { displayDiamondReward } from '@/use/useCurrency'
import useBattlePass, {
  BP_TOTAL_STAGES,
  BP_XP_PER_STAGE,
  BP_DIAMOND_AMOUNT,
  startSeasonClock
} from '@/use/useBattlePass'
import {
  modelImgPath,
  SKINS_PER_TOP,
  buySkin,
  getOfferableSkinPool,
  type SpinnerModelId
} from '@/use/useModels'
import type { TopPartId } from '@/types/spinner'
import useSounds from '@/use/useSound.ts'
import usePvpStats, { HONOR_PER_STAGE, HONOR_TOTAL_STAGES } from '@/use/usePvpStats'
import usePVP from '@/use/usePVP'
import { stopGameplay } from '@/use/useCrazyGames'
import { revealRewards } from '@/use/useRewardReveal'

const {
  currentXp,
  unlockedStages,
  hasUnclaimedReward,
  pendingClaimCount,
  isStageClaimed,
  isStageUnlocked,
  bpCoinReward,
  bpIsSkinStage,
  bpIsDiamondStage,
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

// Keep "days left" current across 00:00 UTC and foreground resumes while
// this screen is mounted (see startSeasonClock).
let stopSeasonClock: (() => void) | null = null
onMounted(() => {
  stopSeasonClock = startSeasonClock()
})
onBeforeUnmount(() => {
  stopSeasonClock?.()
  stopSeasonClock = null
})

// What the battle-pass diamond tier pays and shows. On a single-currency
// build (Poki) that is coins at the diamond rate; `addDiamonds` already
// converts the grant, so this only keeps the card honest.
const diamondTier = computed(() => displayDiamondReward(BP_DIAMOND_AMOUNT))

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
  (e: 'diamonds-awarded', sourceEl: HTMLElement, amount: number): void
}>()

const { t } = useSfcI18n('BattlePass')

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
      isDiamond: bpIsDiamondStage(stage),
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

  // CG QA 2026-05-05: source the pool from the shared helper, NOT from
  // a component-local definition that forgot to filter SPECIAL_SKINS.
  // Cache the offerable set so the persisted-keep clause and the
  // pool-fill clause agree on what counts as offerable.
  const offerable = new Set(getOfferableSkinPool())

  // Keep existing offers that are still offerable. The `offerable.has`
  // check covers BOTH "still unowned" (was already handled by the prior
  // `!isModelFullyOwned` predicate) AND "not a special skin" (the new
  // gate — needed to scrub legacy persisted offers like rainbow that
  // shipped before the BP filter was correct).
  for (const stage of skinStages) {
    const prev = persisted[stage]
    if (prev && offerable.has(prev)) {
      result[stage] = prev
      taken.add(prev)
    }
  }

  // Fill stages that need a new skin
  const pool = shuffled([...offerable].filter(m => !taken.has(m)))
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

  // Same fix as `refreshOfferedSkins` above — single source of truth
  // for the offerable pool.
  const offerable = new Set(getOfferableSkinPool())

  // Keep existing offers that are still offerable (covers
  // "still unowned" AND "not a special skin").
  for (const stage of stages) {
    const prev = persisted[stage]
    if (prev && offerable.has(prev)) {
      result[stage] = prev
      taken.add(prev)
    }
  }

  // Fill stages that need a new skin
  const pool = shuffled([...offerable].filter(m => !taken.has(m)))
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
    refreshOfferedSkins()
    refreshHonorOfferedSkins()
    // Granted by claimStage; the gift screen shows it, then the VFX fly.
    void revealRewards([
      { kind: 'coins', amount: res.coins },
      { kind: 'diamonds', amount: res.diamonds },
      ...(res.skin ? [{ kind: 'skin' as const, modelId: res.skin }] : [])
    ]).then(() => {
      if (res.coins > 0 && bpBtnRef.value) emit('coins-awarded', bpBtnRef.value)
      if (res.diamonds > 0 && bpBtnRef.value) emit('diamonds-awarded', bpBtnRef.value, res.diamonds)
    })
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
  void revealRewards([{ kind: 'skin', modelId: skin }])
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
  //- The bounce lives on the wrapper so it never fights the button's own
  //- press transform (the .ui-btn recipe sinks it into its lip).
  div.battle-pass(:class="{ 'hint-bounce': hasUnclaimedReward || (canShowPvP && pendingHonorClaims > 0) }")
    button.bp-hud-btn.ui-btn.ui-btn--royal.ui-btn--icon.cursor-pointer.z-10(
      ref="bpBtnRef"
      type="button"
      :aria-label="t('battlePass')"
      :title="t('battlePass')"
      class="scale-80 sm:scale-110"
      @click="isModalOpen = true"
    )
      span.relative.block
        //- Royal HUD button (DESIGN.md: HUD buttons on the arena).
        span.relative.font-black.flex.flex-col.items-center(
          class="pt-1 sm:pt-0"
        )
          //- Glyph instead of the English-only "BP" caption; the button's
          //- aria-label / title carry the translated name.
          IconBattlePass.text-sun-300(class="w-[18px] h-[18px] sm:w-5 sm:h-5 -my-0.5 drop-shadow-[1px_1px_0_var(--color-ink)]")
          span.flex.items-center(class="gap-0.5")
            span.font-black.ui-outline-sm.leading-none(
              class="text-[11px] sm:text-sm !text-sun-300"
            ) {{ unlockedStages }}
            span.font-black.ui-outline-sm.leading-none(
              class="text-[9px] sm:text-[10px]"
            ) /{{ BP_TOTAL_STAGES }}
      //- Unclaimed-count sticker (bobs, berry = "act on me")
      span.ui-notify.bp-notify(
        v-if="pendingClaimCount + (canShowPvP ? pendingHonorClaims : 0) > 0"
      ) {{ pendingClaimCount + (canShowPvP ? pendingHonorClaims : 0) }}

  //- Battle Pass Modal
  FModal(
    v-model="isModalOpen"
    :is-closable="true"
    :title="t('battlePass')"
  )
    //- Scrolling is FModal's job (single scroll authority — see the
    //- `.modal-content-slot` rule there). The old `max-h-[70vh]` nested a
    //- second scroller inside the already-scrollable slot.
    div(class="space-y-3 px-1 sm:px-3 py-2")
      //- Summary row: current stage + xp progress bar
      div(class="flex items-center gap-2 px-1 sm:px-2")
        div.flex.flex-col.items-start.shrink-0
          span.text-ink-soft.font-black(class="text-[0.7rem] sm:text-[0.8rem]") {{ t('stage') }}
          span.text-ink.font-black.leading-none(class="text-lg sm:text-xl") {{ unlockedStages }}/{{ BP_TOTAL_STAGES }}
        div.flex-1.flex.flex-col.gap-1
          div.flex.justify-between.items-end
            span.text-ink-soft.font-black(class="text-[0.7rem] sm:text-[0.8rem]")
              template(v-if="isMaxed") {{ t('complete') }}
              template(v-else) {{ t('stageN', { n: inProgressStage }) }}
            span.text-sun-600.font-black(class="text-[0.7rem] sm:text-xs")
              template(v-if="isMaxed") {{ t('max') }}
              template(v-else) {{ Math.floor(currentXp) }}/{{ BP_XP_PER_STAGE }} xp
          div.ui-bar.w-full(
            class="!h-3 sm:!h-3.5"
          )
            div.ui-bar__fill.bp-fill.transition-all(
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
            class="bp-tier shrink-0 flex flex-col items-center p-1 sm:p-2 w-16 sm:w-20"
            :class="{ 'is-claimed': card.claimed, 'is-ready': card.unlocked && !card.claimed, 'ui-shine': card.unlocked && !card.claimed, 'is-progress': card.inProgress && !card.unlocked, 'is-locked': !card.unlocked && !card.claimed && !card.inProgress }"
          )
            //- Stage number
            div.bp-tier-label.font-black(class="text-[0.65rem] sm:text-[0.8rem]") S{{ card.stage }}

            //- Reward icon. On a single-currency build the diamond tier
            //- pays coins, so it has to LOOK like coins — see useCurrency.
            template(v-if="card.isDiamond && diamondTier.currency === 'diamonds'")
              IconDiamond(
                class="w-5 h-5 sm:w-6 sm:h-6 my-0.5"
                :class="{ 'opacity-60': !card.unlocked && !card.claimed }"
              )
            template(v-else-if="card.isDiamond")
              IconCoin(
                class="w-5 h-5 sm:w-6 sm:h-6 text-sun-500 my-0.5"
                :class="{ 'opacity-60': !card.unlocked && !card.claimed }"
              )
            template(v-else-if="card.isSkin && bpSkinForStage(card.stage)")
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
              IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-sun-500 my-0.5 opacity-70")
            template(v-else)
              IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-sun-500 my-0.5")

            //- Skin label
            div.font-black.text-plum-700.leading-tight(
              v-if="card.isSkin && bpSkinForStage(card.stage)"
              class="text-[0.55rem] sm:text-[0.7rem] truncate max-w-full"
            ) {{ t('skins.' + bpSkinForStage(card.stage)) }}

            //- Diamond amount (diamond stages). `diamondTier` carries both
            //- the currency and the already-converted amount.
            div.font-black.leading-tight(
              v-if="card.isDiamond"
              :class="[diamondTier.currency === 'diamonds' ? 'text-plum-700' : 'text-sun-600', 'text-[0.7rem] sm:text-xs']"
            ) +{{ diamondTier.amount }}
            //- Coin amount (coin stages + skin stages with an empty pool)
            div.text-sun-600.font-black.leading-tight(
              v-else-if="!card.isSkin || !bpSkinForStage(card.stage)"
              class="text-[0.7rem] sm:text-xs"
            ) +{{ card.coins }}

            //- Status row
            div(class="mt-0.5 text-[0.6rem] sm:text-[0.75rem] font-bold")
              span.bp-stamp(v-if="card.claimed") ✓
              template(v-else-if="card.unlocked")
                FIconButton.bp-claim(
                  type="premium"
                  size="sm"
                  icon="right"
                  @click="onClaim(card.stage)"
                )
              template(v-else-if="card.inProgress")
                span.text-sun-600 {{ Math.floor(progressFraction * 100) }}%
              span.text-ink-soft(v-else) —

      //- ── Honor Track (only visible when PvP is enabled) ──────────────
      div.honor-panel.p-3(
        v-if="canShowPvP"
        class="mt-2 space-y-2"
      )
        //- Header row with title + info icon
        div.flex.items-center.justify-between
          div.flex.items-center.gap-2
            span.honor-title.font-black(class="text-xs sm:text-sm")
              span {{ t('honorTrack') }}
            //- Info tooltip toggle
            button.honor-info-btn.cursor-pointer.flex.items-center.justify-center.rounded-full.border-2.border-ink.text-ink(
              type="button"
              :aria-label="t('honorTrack')"
              class="w-7 h-7"
              @click="showHonorInfo = !showHonorInfo"
            )
              span.font-bold(class="text-[0.7rem] sm:text-[0.75rem]") ?
          //- Progress
          span.text-plum-700.font-black(class="text-[0.75rem] sm:text-xs")
            template(v-if="isHonorMaxed") {{ t('complete') }}
            template(v-else) {{ honorPoints }}/{{ HONOR_PER_STAGE }} {{ t('honorAbbr') }}

        //- Info tooltip (toggled)
        div.ui-inset.text-ink.p-2(
          v-if="showHonorInfo"
          class="text-[0.7rem] sm:text-xs leading-snug"
        ) {{ t('honorInfo') }}

        //- Honor progress bar
        div.ui-bar.w-full(
          v-if="!isHonorMaxed"
          class="!h-2.5"
        )
          div.ui-bar__fill.honor-fill.transition-all(
            :style="{ width: `${honorProgressFraction * 100}%` }"
          )

        //- Honor stage cards (3 skins)
        div.flex.gap-2.justify-center
          div(
            v-for="card in honorStageCards"
            :key="card.stage"
            class="bp-tier is-honor flex flex-col items-center p-2 w-20 sm:w-24"
            :class="{ 'is-claimed': card.claimed, 'is-ready': card.unlocked && !card.claimed, 'ui-shine': card.unlocked && !card.claimed, 'is-progress': card.inProgress && !card.unlocked, 'is-locked': !card.unlocked && !card.claimed && !card.inProgress }"
          )
            //- Stage label
            div.text-plum-700.font-black(class="text-[0.65rem] sm:text-[0.8rem]") H{{ card.stage }}

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
              div.flex.items-center.justify-center.text-leaf-700(class="w-8 h-8 sm:w-10 sm:h-10 my-0.5 text-lg") ✓
            template(v-else)
              div.flex.items-center.justify-center.text-plum-500(class="w-8 h-8 sm:w-10 sm:h-10 my-0.5 text-[0.75rem]") ?

            //- Skin label
            div.font-black.text-plum-700.leading-tight(
              v-if="honorSkinForStage(card.stage)"
              class="text-[0.55rem] sm:text-[0.7rem] truncate max-w-full"
            ) {{ t('skins.' + honorSkinForStage(card.stage)) }}

            //- Status
            div(class="mt-0.5 text-[0.6rem] sm:text-[0.75rem] font-bold")
              span.bp-stamp(v-if="card.claimed") ✓
              template(v-else-if="card.unlocked")
                FIconButton.bp-claim(
                  type="premium"
                  size="sm"
                  icon="right"
                  @click="onClaimHonor(card.stage)"
                )
              template(v-else-if="card.inProgress")
                span.text-plum-700 {{ Math.floor(honorProgressFraction * 100) }}%
              span.text-ink-soft(v-else) —

      //- Season reset countdown
      div.text-center(
        v-if="daysUntilReset != null"
        class="text-[0.75rem] sm:text-xs text-sun-600 font-black"
      ) {{ t('seasonReset', { n: daysUntilReset }) }}
      //- Footer tip
      div.text-center.ui-body(class="text-[0.75rem] sm:text-xs")
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
  // Room for the ready tier's lift + ring so it is never clipped.
  padding-top: 0.6rem
  padding-bottom: 0.6rem

  &::-webkit-scrollbar
    display: none

// HUD button: royal .ui-btn (sinks into its lip), a berry count sticker.
.bp-hud-btn
  padding: 0.3rem 0.65rem 0.4rem
  min-width: 2.75rem
  min-height: 2.75rem

.bp-notify
  position: absolute
  top: -0.6rem
  right: -0.6rem
  z-index: 3
  min-width: 1.15rem
  height: 1.15rem
  font-size: 0.65rem

// Flat ice disc behind skin thumbnails so the model reads on any tier tint.
.skin-thumb-halo
  background: var(--color-ice-50)
  border-radius: 9999px
  box-shadow: 0 0 0 2px var(--color-ice-400)
  transform: scale(0.95)

// ── Tiers: collectible mini cards ─────────────────────────────────────────
//   locked    steel hatch, dimmed icon
//   progress  sun edge + "nn %"
//   ready     sun face + stripes, lifted + tilted, sun ring, shine sweep
//   claimed   lime face with a slanted "✓" stamp
//   honour    the same states on plum (the premium track)
.bp-tier
  --edge: var(--color-ice-400)
  position: relative
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  color: var(--ui-text)
  box-shadow: inset 0 0 0 2px var(--edge), inset 0 -4px 0 var(--edge), 0 3px 0 var(--color-ink)
  transition: transform 0.26s var(--ui-spring)
  &::before
    content: ''
    position: absolute
    top: 0
    right: 0
    width: 1.3rem
    height: 1.3rem
    background-image: repeating-linear-gradient(315deg, var(--edge) 0 3px, transparent 3px 6px)
    clip-path: polygon(30% 0, 100% 0, 100% 70%)
    border-top-right-radius: calc(var(--radius-ui) - 2px)
    pointer-events: none
  &.is-honor
    --edge: var(--color-plum-400)
    background-color: var(--color-plum-300)
  &.is-claimed
    --edge: var(--color-leaf-600)
    background-color: var(--color-leaf-300)
  &.is-progress
    --edge: var(--color-sun-500)
  &.is-ready
    --edge: var(--color-sun-500)
    z-index: 1
    background-color: var(--color-sun-200)
    background-image: var(--ui-stripes)
    box-shadow: inset 0 0 0 2px var(--edge), inset 0 -5px 0 var(--edge), 0 0 0 3px var(--color-sun-400), 0 5px 0 var(--color-ink)
    transform: translateY(-3px) rotate(-2deg)
  &.is-locked
    --edge: var(--color-steel-500)
    background-color: var(--color-steel-300)
    background-image: var(--ui-stripes-ink)

.bp-tier-label
  color: var(--ui-text-muted)

.is-ready .bp-tier-label
  color: var(--ui-text)

// Claimed stamp: a lime angled chip.
.bp-stamp
  display: inline-flex
  align-items: center
  justify-content: center
  width: 1.35rem
  height: 1.35rem
  border: 2px solid var(--color-ink)
  border-radius: 0.3rem
  background-color: var(--color-leaf-500)
  box-shadow: 0 2px 0 var(--color-ink)
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  font-weight: 900
  font-size: 0.8rem
  line-height: 1
  transform: rotate(-12deg)

// The claim arrow hops for attention (the button's own press stays intact:
// the hop is on the individual `translate` property).
.bp-claim
  animation: bp-claim-hop 1.3s ease-in-out infinite

@keyframes bp-claim-hop
  0%, 60%, 100%
    translate: 0 0
  20%
    translate: 0 -4px
  35%
    translate: 0 0
  45%
    translate: 0 -1px

// ── Honour track: the premium plum panel ──────────────────────────────────
.honor-panel
  background-color: var(--color-plum-500)
  background-image: var(--ui-stripes)
  color: var(--color-ice-50)
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui-lg)
  box-shadow: inset 0 3px 0 var(--color-plum-300), inset 0 -5px 0 var(--color-plum-700), 0 4px 0 var(--color-ink)
  .text-plum-700
    color: var(--color-ice-50)
    text-shadow: var(--ui-stroke-sm)
  .bp-tier .text-plum-700, .bp-tier .text-plum-500
    color: var(--color-plum-700)
    text-shadow: none

// Skewed ink title plate on the plum panel.
.honor-title
  position: relative
  display: inline-flex
  padding: 0.1em 0.7em 0.15em
  isolation: isolate
  text-transform: uppercase
  letter-spacing: 0.03em
  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    background-color: var(--color-royal-900)
    border: 2px solid var(--color-ink)
    border-radius: 0.3rem
    transform: skewX(-12deg)
  > span
    color: var(--color-sun-300)
    text-shadow: var(--ui-stroke-sm)

.honor-info-btn
  background-color: var(--color-ice-50)
  box-shadow: 0 2px 0 var(--color-ink)
  transition: translate 0.2s var(--ui-spring)
  &:active
    translate: 0 2px
    box-shadow: none
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px

.bp-fill
  background-color: var(--color-sun-400)
  box-shadow: inset 0 3px 0 var(--color-sun-200), inset 0 -3px 0 var(--color-sun-600)

.honor-fill
  background-color: var(--color-plum-400)
  box-shadow: inset 0 3px 0 var(--color-plum-300), inset 0 -3px 0 var(--color-plum-700)

@media (prefers-reduced-motion: reduce)
  .bp-claim
    animation: none
  .bp-tier
    transition: none
</style>
