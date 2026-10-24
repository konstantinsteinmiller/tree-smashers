<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import FModal from '@/components/molecules/FModal.vue'
import FButton from '@/components/atoms/FButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import UiIcon from '@/components/icons/UiIcon.vue'
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
import { previousUtcDayKey, utcDayKey } from '@/utils/dayKey'
import { revealRewards, type RevealItem } from '@/use/useRewardReveal'

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { addCoins } = useSpinnerConfig()
const { t } = useSfcI18n('DailyRewards')
const dailyBtnRef = ref<HTMLElement | null>(null)

// ─── Daily Rewards Config ────────────────────────────────────────────────────

const DAILY_REWARDS = [100, 200, 300, 400, 500, 750, 1000]
// Day indices (0-based) on which the reward is a skin unlock instead of coins.
// Covers day 3, 5, and 7.
const SKIN_REWARD_DAYS = new Set<number>([2, 4, 6])
const STORAGE_KEY = 'smashers_daily_rewards'

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

// Shared game day (00:00 UTC), same as the daily
// free speed-up — see utils/dayKey.ts.
const todayStr = () => utcDayKey()

const yesterdayStr = () => previousUtcDayKey()

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
  const revealed: RevealItem[] = [{ kind: 'coins', amount: DAILY_REWARDS[dayIndex]! }]

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
      revealed.push({ kind: 'skin', modelId: toUnlock })
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
  // Granted and saved above; the gift screen only SHOWS it. The coins fly
  // to the badge once the player has seen them.
  void revealRewards(revealed).then(() => {
    if (dailyBtnRef.value) emit('coins-awarded', dailyBtnRef.value)
  })
}
</script>

<template lang="pug">
  //- Open-modal button (positioned by parent flex row in SpinnerArena)
  //-
  //- Free reward, no ad — so it must NOT look like the sky rewarded-ad
  //- "+N coins" button that sits right next to it (D21: players read it as
  //- an ad). Leaf body = the game's "free" colour (same as the FREE sticker
  //- on the 2x switch), a gift glyph where the ad button has its film reel,
  //- and never a movie icon. The translated title rides on aria-label.
  //- The bounce lives on the wrapper so it never fights the button's own
  //- press transform (the .ui-btn recipe sinks it into its lip).
  div.daily-rewards(:class="{ 'hint-bounce': hasDailyRewardReady }")
    button.daily-hud-btn.ui-btn.ui-btn--primary.ui-btn--icon.ui-hit-44.cursor-pointer.z-10(
      ref="dailyBtnRef"
      type="button"
      :aria-label="t('dailyRewards')"
      :title="t('dailyRewards')"
      class="scale-80 sm:scale-110"
      @click="isModalOpen = true"
    )
      //- Leaf HUD button (free = leaf), gift glyph, "+N" coins.
      span.relative.font-black.flex.flex-col.items-center
        span.block(class="w-6 h-6 -mt-0.5" aria-hidden="true")
          UiIcon(name="daily")
        span.flex.items-center(class="gap-0.5")
          span.font-black.ui-outline-sm.leading-tight(class="text-[10px] sm:text-xs") +{{ DAILY_REWARDS[state.currentDay] }}
          IconCoin(class="w-4 h-4 text-sun-300")
      span.ui-notify.daily-notify(v-if="hasDailyRewardReady" aria-hidden="true") !

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
          class="day-tile ui-pop-in basis-[calc(25%-0.375rem)] sm:basis-[calc(14.2857%-0.5rem)] flex flex-col items-center p-1 sm:p-2"
          :class="{ 'is-past': i < state.currentDay, 'is-today': i === state.currentDay, 'is-ready': i === state.currentDay && !collectedToday, 'ui-shine': i === state.currentDay && !collectedToday, 'is-skin': isSkinDay(i) }"
          :style="{ '--i': i }"
        )
          //- Today's claimable tile twinkles (#UX1c).
          span.ui-sparkle.ui-sparkle--sun.day-sp(v-if="i === state.currentDay && !collectedToday" aria-hidden="true")
          //- Day label. The "D" prefix was hardcoded, so every locale showed
          //- "D1…D7". It goes through i18n now — each language picks its own
          //- abbreviation, kept short because the card is only ~80px wide.
          div.day-label.font-black(class="text-[0.65rem] sm:text-[0.8rem]") {{ t('dayShort', { n: i + 1 }) }}

          //- Reward icon — skin image on skin days, coin on all others
          template(v-if="isSkinDay(i) && dailySkinForDay(i)")
            //- Cream disc behind the skin so dark models (snake,
            //- scorpion, shell, etc.) stay readable on any tile.
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
            IconCoin(class="w-5 h-5 sm:w-6 sm:h-6 text-sun-500 my-0.5")

          //- Skin label (only when a skin is actually offered for this day)
          //- Long names ("Monarchfalter") break with a hyphen instead of
          //- spilling over the card edge.
          div.skin-label.font-black.text-plum-700.leading-tight(
            v-if="isSkinDay(i) && dailySkinForDay(i)"
            class="text-[0.6rem] sm:text-[0.75rem]"
          ) {{ t('skins.' + dailySkinForDay(i)) }}

          //- Coin reward amount — shown on every day (additive on skin days)
          div.day-amount.font-black.leading-tight(class="text-[0.7rem] sm:text-xs") +{{ reward }}

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
            template(v-if="i === state.currentDay && !collectedToday")
              span.day-arrow.attention-bounce.inline-block.pointer-events-none(
                class="text-base sm:text-lg leading-none"
              ) ▾
            span.text-ink-soft(v-else-if="i > state.currentDay") —
          //- Claimed: a slanted lime "✓" stamp slapped over the tile.
          span.day-stamp(
            v-if="i < state.currentDay || (i === state.currentDay && collectedToday)"
            aria-hidden="true"
          ) ✓

      //- Footer info
      div.text-center.ui-body(class="text-[0.75rem] sm:text-xs")
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
        tone="premium"
        variant="brawl"
        @click="collect(state.currentDay)"
      ) {{ t('collectCta') }}
</template>

<style scoped lang="sass">
// Flat ice disc behind skin thumbnails so dark models (snake, scorpion,
// shell, etc.) stay readable on any tile tint.
.skin-thumb-halo
  background: var(--color-ice-50)
  border-radius: 9999px
  box-shadow: 0 0 0 2px var(--color-plum-300)
  transform: scale(0.95)

// HUD button: a leaf (free reward) .ui-btn — sinks into its lip on press;
// a berry "!" sticker while a reward is waiting (the wrapper bounces).
.daily-hud-btn
  // Same box as its neighbour (daily ↔ battle pass) so the bottom-left row
  // lines up: fixed height, same padding, content centred.
  flex-direction: column
  justify-content: center
  padding: 0.3rem 0.6rem 0.4rem
  min-width: 2.75rem
  height: 3.6rem

.daily-notify
  position: absolute
  top: -0.6rem
  right: -0.6rem
  z-index: 3
  min-width: 1.15rem
  height: 1.15rem
  font-size: 0.7rem

// ── Day tiles: little collectible cards ───────────────────────────────────
//   future  ice card, muted
//   ready   sun edge + facet, lifted and tilted, bouncing arrow, shine, twinkle
//   claimed lime face with a slanted "✓" stamp
//   skin    plum edge + plum corner notch (the big days)
.day-tile
  --edge: var(--color-ice-400)
  position: relative
  border: 2px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)
  color: var(--ui-text)
  box-shadow: inset 0 0 0 2px var(--edge), inset 0 -4px 0 var(--edge), 0 3px 0 var(--color-ink)
  transition: transform 0.26s var(--ui-spring)
  // The stagger must not pin `transform` (the ready tile is tilted).
  animation-fill-mode: backwards
  &::before
    content: ''
    position: absolute
    top: 0
    right: 0
    width: 1.3rem
    height: 1.3rem
    // Corner notch (#UX1c): a solid dog-ear in the edge colour, no stripes.
    background-color: var(--edge)
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.45)
    clip-path: polygon(0 0, 100% 0, 100% 100%)
    border-top-right-radius: calc(var(--radius-ui) - 2px)
    pointer-events: none
  &.is-skin
    --edge: var(--color-plum-500)
    background-color: var(--color-plum-300)
  &.is-past, &.is-today
    --edge: var(--color-leaf-600)
    background-color: var(--color-leaf-300)
  &.is-ready
    --edge: var(--color-sun-500)
    z-index: 1
    background-color: var(--color-sun-200)
    background-image: var(--ui-facet-ink)
    box-shadow: inset 0 0 0 2px var(--edge), inset 0 -5px 0 var(--edge), 0 0 0 3px var(--color-sun-400), 0 5px 0 var(--color-ink)
    transform: translateY(-4px) rotate(-2deg)

.day-label
  color: var(--ui-text-muted)

.day-sp
  left: 0.3rem
  top: 0.35rem
  --sp-size: 0.85rem
  --sp-delay: 0.6s

.is-ready .day-label, .is-ready .day-amount
  color: var(--ui-text)

.day-amount
  color: var(--color-sun-600)

.day-arrow
  color: var(--color-ink)

// The claimed stamp: a lime angled chip slapped on top, slightly rotated.
.day-stamp
  position: absolute
  z-index: 3
  top: 42%
  left: 50%
  display: flex
  align-items: center
  justify-content: center
  width: 1.7rem
  height: 1.7rem
  border: 2px solid var(--color-ink)
  border-radius: 0.35rem
  background-color: var(--color-leaf-500)
  box-shadow: inset 0 2px 0 var(--color-leaf-300), 0 2px 0 var(--color-ink)
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  font-size: 1rem
  font-weight: 900
  line-height: 1
  transform: translate(-50%, -50%) rotate(-12deg)
  animation: stamp-in 0.36s var(--ui-spring) both
  pointer-events: none

@keyframes stamp-in
  0%
    transform: translate(-50%, -50%) rotate(-30deg) scale(2.2)
    opacity: 0
  100%
    transform: translate(-50%, -50%) rotate(-12deg) scale(1)
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .day-stamp
    animation: none
  .day-tile
    transition: none

.skin-label
  width: 100%
  max-width: 100%
  text-align: center
  hyphens: auto
  overflow-wrap: anywhere
</style>
