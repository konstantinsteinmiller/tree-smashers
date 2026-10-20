<script setup lang="ts">
import { revealRewards } from '@/use/useRewardReveal'
import { chestSmallCoins, chestBigCoins } from '@/use/useStageRewards'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSounds from '@/use/useSound.ts'
import { playUiSfx } from '@/use/uiSfx'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import IconCoin from '@/components/icons/IconCoin.vue'

interface Props {
  /** Element where the coin explosion VFX should fly to (e.g. the coin badge). */
  targetEl?: HTMLElement | null
  /** Visual scale factor (1 = default size). */
  scale?: number
}

const props = withDefaults(defineProps<Props>(), {
  targetEl: null,
  scale: 1
})

const { addCoins } = useSpinnerConfig()

// ─── Reward / cooldown configuration ───────────────────────────────────────
//
// One chest, two collectable thresholds keyed off the time since the last
// collection:
//
//   T=0 .. T=3min     → cooldown      (not collectable; shows 3-min countdown)
//   T=3min .. T=10min → small ready   (collectable; shows 7-min countdown)
//   T=10min+          → big ready     ("READY")
//
// On any collect the chest goes back to T=0.
//
// Players can either snipe the small reward as soon as it lights up or wait
// the full 10 min for the 4× payout. Per minute that is 0.25x vs 0.30x of a
// stage-loss reward, so patience is slightly better: the chest doesn't punish
// skip-clicking but mildly rewards waiting.
//
// THE AMOUNTS SCALE WITH THE CAMPAIGN. They used to be flat 25 / 100, which
// were themselves ~0.7x / ~2.9x the stage-3 loss reward — i.e. already
// stage-anchored, just never scaled. By stage 50 a ten-minute wait paid less
// than half of what losing a single battle did, and the chest stopped being a
// reason to come back. `useStageRewards` re-derives both from the current
// stage at 0.75x / 3x, preserving the 4:1 ratio and flooring at the old
// values so the early game is unchanged.

const SMALL_READY_AT_MS = 3 * 60 * 1000   // 3 min
const BIG_READY_AT_MS = 10 * 60 * 1000    // 10 min

// `smashers_chest_last_collected_at` is a NEW key (the previous component
// stored a future-`chestReadyAt` timestamp under different names). Using
// a fresh key avoids a migration: any old data is harmlessly ignored,
// the chest just behaves as if last-collected = epoch (i.e. ready for
// the big reward right away on first ever load — a small one-time gift
// that's not worth a migration helper for).
const STORAGE_KEY = 'smashers_chest_last_collected_at'

// ─── Reactive timer state ──────────────────────────────────────────────────

const loadStoredAt = (): number => parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0

const lastCollectedAt = ref(loadStoredAt())
const tickNow = ref(Date.now())

// Re-read on a save-data bump — a recovered cloud hydrate, or the
// full-progress reset wiping the key (see useResetProgress).
watch(saveDataVersion, () => {
  lastCollectedAt.value = loadStoredAt()
})
let tickIntervalId: number | null = null

const elapsedMs = computed(() => Math.max(0, tickNow.value - lastCollectedAt.value))

type Phase = 'cooldown' | 'small' | 'big'
const phase = computed<Phase>(() => {
  if (elapsedMs.value < SMALL_READY_AT_MS) return 'cooldown'
  if (elapsedMs.value < BIG_READY_AT_MS) return 'small'
  return 'big'
})

const isReady = computed(() => phase.value !== 'cooldown')

// The moment the chest ripens (or upgrades to the big payout) while the game
// is open: one soft ting. Never on mount (a chest that was already ready when
// the page loaded is not news), and the uiSfx gates keep it silent under an
// ad, a platform pause or a muted slider.
watch(phase, (now, was) => {
  if (was && now !== 'cooldown' && now !== was) playUiSfx('reward')
})

/** Reward the player gets if they tap right now — the small amount during
 *  the 3-minute window, the big one once the chest reaches its 10-minute
 *  mark. Both scale with the current stage; see `useStageRewards`. */
const currentReward = computed(() =>
  phase.value === 'big' ? chestBigCoins.value : chestSmallCoins.value
)

/** ms remaining to display in the timer label.
 *  - cooldown phase: time until small reward unlocks (3-min countdown).
 *  - small phase:    time until big reward unlocks  (7-min countdown).
 *  - big phase:      0 (display switches to "READY"). */
const remainingMs = computed(() => {
  if (phase.value === 'cooldown') return SMALL_READY_AT_MS - elapsedMs.value
  if (phase.value === 'small') return BIG_READY_AT_MS - elapsedMs.value
  return 0
})

/** Pre-formatted MM:SS for the timer label. */
const timeDisplay = computed(() => {
  const totalSec = Math.ceil(remainingMs.value / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

/** 0..1 ring fill used for the circular overlay during the cooldown
 *  phase. Only rendered while the chest isn't collectable, so it
 *  always represents the 3-minute pre-collect window. */
const cooldownRingPct = computed(() => {
  if (phase.value !== 'cooldown') return 0
  return remainingMs.value / SMALL_READY_AT_MS
})

/** Aura color escalates with reward tier. Light blue/silver during the
 *  small window (calm — "you can collect now if you want") and warm
 *  amber during the big-reward window (urgent — "you waited, here's
 *  the payoff"). */
const auraColor = computed(() =>
  phase.value === 'big' ? 'rgba(255,160,0,0.95)' : 'rgba(192,210,225,0.8)'
)

// ─── Tick + lifecycle ──────────────────────────────────────────────────────

const refreshFromStorage = () => {
  // Re-read so external resets (cheats, save-system hydrate) take effect.
  lastCollectedAt.value = loadStoredAt()
  tickNow.value = Date.now()
}

onMounted(() => {
  refreshFromStorage()
  tickIntervalId = window.setInterval(() => {
    tickNow.value = Date.now()
    // Cheap re-read so the cheat menu's "reset chest" flips the icon
    // promptly without waiting for the next interval drift.
    const stored = loadStoredAt()
    if (stored !== lastCollectedAt.value) lastCollectedAt.value = stored
  }, 1000)
})

onUnmounted(() => {
  if (tickIntervalId !== null) clearInterval(tickIntervalId)
})

// ─── Collect ──────────────────────────────────────────────────────────────

const chestRef = ref<HTMLElement | null>(null)

const collectChest = () => {
  if (!isReady.value) return
  // Snapshot reward BEFORE flipping `lastCollectedAt` — otherwise the
  // computed flips to "cooldown" on the same tick and we'd grant 25 even
  // during the big window.
  const reward = currentReward.value
  // Flip the timer FIRST so a thrown error in addCoins / VFX can't leave
  // the chest infinitely re-collectable.
  lastCollectedAt.value = Date.now()
  localStorage.setItem(STORAGE_KEY, lastCollectedAt.value.toString())
  // Force the computeds to re-run this tick — `tickNow` only updates
  // every second, so without this nudge `phase` would lag.
  tickNow.value = lastCollectedAt.value
  addCoins(reward)
  const { playSound } = useSounds()
  playSound('happy')
  // Granted above; the gift screen shows it, then the coins fly home.
  void revealRewards([{ kind: 'coins', amount: reward }]).then(() => {
    if (chestRef.value && props.targetEl) {
      spawnCoinExplosion({ sourceEl: chestRef.value, targetEl: props.targetEl })
    }
  })
}
</script>

<template lang="pug">
  div.chest-root.flex.flex-col.items-center.pointer-events-auto(
    @click="collectChest"
    :data-sfx="isReady ? 'press' : 'off'"
    :class="isReady ? ['cursor-pointer', 'is-ready', phase === 'big' ? 'is-big' : 'is-small'] : 'is-cooldown'"
    :class-list="phase"
    :style="scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'center' } : undefined"
  )
    div.chest-icon.relative(ref="chestRef" class="w-10 h-10 sm:w-12 sm:h-12")
      img.object-contain.w-full.h-full(
        src="/images/icons/chest_128x128.webp"
        alt=""
        draggable="false"
      )
      //- Ready: the berry "!" notify dot on the lid corner.
      span.chest-notify.ui-notify(v-if="isReady" aria-hidden="true") !
      //- Circular cooldown overlay — only during the pre-small cooldown phase.
      //- During the small → big window we show the running
      //- 7-min countdown via the timer label below; the ring would
      //- otherwise be misleading (chest is already collectable).
      //-
      //- IMPORTANT: the chest-shaped CSS mask lives on the OUTER wrapper
      //- div, NOT on the SVG itself. The SVG carries the rotate / scaleX
      //- needed to make the conic stroke fill clockwise; if the mask
      //- were on the SVG that same transform would rotate the chest
      //- silhouette too, leaving the darkening visibly mis-aligned with
      //- the icon underneath. The wrapper has no transform, so the mask
      //- stays pixel-aligned with the chest image.
      div.absolute.inset-0.w-full.h-full.cooldown-mask-chest(
        v-if="phase === 'cooldown'"
      )
        svg.w-full.h-full(
          viewBox="0 0 40 40"
          style="transform: rotate(-90deg) scaleX(-1)"
        )
          circle(
            cx="20" cy="20" r="19"
            fill="none"
            stroke="rgba(22, 26, 64,0.4)"
            stroke-width="40"
            :stroke-dasharray="119.38"
            :stroke-dashoffset="119.38 * (1 - cooldownRingPct)"
          )
    //- Two-line label below the icon. The first line is the dominant
    //- signal (countdown when sleeping, reward+icon+READY when
    //- collectable), the second line is the secondary countdown to the
    //- upgrade window — only present during the small phase to make it
    //- obvious the chest IS collectable now AND something better is on
    //- the way.
    div.flex.flex-col.items-center.leading-tight(class="mt-0.5")
      template(v-if="phase === 'cooldown'")
        span.chest-timer.game-text.text-cream-50.font-black(class="text-[0.75rem] sm:text-xs") {{ timeDisplay }}
      template(v-else-if="phase === 'small'")
        //- Coin icon styled to match the DailyRewards button
        //- (`<IconCoin class="text-yellow-300">`) so reward labels read
        //- as the same visual currency across the HUD.
        span.chest-amount.font-black.text-sun-300.flex.items-center(class="text-[0.85rem] sm:text-sm gap-0.5")
          span.game-text +{{ chestSmallCoins }}
          IconCoin(class="w-4 h-4")
        span.game-text.text-cream-50.font-bold(class="text-[0.6rem] sm:text-[0.75rem] opacity-80") {{ timeDisplay }}
      template(v-else)
        //- Big-reward state — chest aura + the amber amount is signal
        //- enough; the older "READY" suffix duplicated the meaning of
        //- the pulsing icon and made the label feel cluttered.
        //-
        //- The amounts are BOUND, not literal. They used to be hardcoded
        //- `+25` / `+100` here while `currentReward` (the value actually
        //- granted) lived in the script — so scaling the payout silently
        //- left the label lying about it.
        span.chest-amount.is-big.font-black.flex.items-center(class="text-[0.85rem] sm:text-sm gap-0.5")
          span +{{ chestBigCoins }}
          IconCoin(class="w-4 h-4")
</template>

<style scoped lang="sass">
// Ready: the chest hops and rattles ("open me!"), then rests — the small
// window every 2.4 s, the big payout twice as eager. Transform only.
.chest-root.is-ready .chest-icon
  transform-origin: 50% 90%
  animation: chest-rattle 2.4s ease-in-out infinite

.chest-root.is-big .chest-icon
  animation-duration: 1.4s

@keyframes chest-rattle
  0%, 50%, 100%
    transform: translateY(0) rotate(0) scale(1)
  10%
    transform: translateY(-6px) rotate(-8deg) scale(1.08)
  20%
    transform: translateY(0) rotate(7deg) scale(1.02, 0.94)
  30%
    transform: translateY(-2px) rotate(-4deg)
  40%
    transform: translateY(0) rotate(2deg)

// Pressing a ready chest squashes it.
.chest-root.is-ready:active .chest-icon
  animation: none
  transform: translateY(2px) scale(1.08, 0.88)

.chest-notify
  position: absolute
  top: -0.3rem
  right: -0.45rem
  min-width: 1.1rem
  height: 1.1rem
  font-size: 0.7rem

// Cooldown timer on a navy chip (reads over any arena tile).
.chest-timer
  padding: 0.05rem 0.4rem 0.1rem
  border: 2px solid var(--color-ink)
  border-radius: 999px
  background-color: var(--color-royal-900)
  font-variant-numeric: tabular-nums
  box-shadow: 0 2px 0 var(--color-ink)

// Ready amounts on a sun chip; the big payout on an angled, striped one.
.chest-amount
  padding: 0.05rem 0.4rem 0.1rem
  border: 2px solid var(--color-ink)
  border-radius: 999px
  background-color: var(--color-royal-900)
  box-shadow: 0 2px 0 var(--color-ink)
  font-variant-numeric: tabular-nums
  &.is-big
    color: var(--color-ink)
    background-color: var(--color-sun-400)
    background-image: var(--ui-stripes)
    border-radius: 0.35rem
    box-shadow: inset 0 -2px 0 var(--color-sun-600), 0 2px 0 var(--color-ink)

@media (prefers-reduced-motion: reduce)
  .chest-root.is-ready .chest-icon
    animation: none

// Clip the cooldown SVG overlay to the chest icon's alpha channel so
// the darkening follows the chest silhouette instead of leaving a
// visible black square in the corner gaps. Both the WebKit prefix and
// the unprefixed property are set for Safari < 17 / older mobile WebViews.
.cooldown-mask-chest
  -webkit-mask-image: url('/images/icons/chest_128x128.webp')
  -webkit-mask-size: contain
  -webkit-mask-repeat: no-repeat
  -webkit-mask-position: center
  mask-image: url('/images/icons/chest_128x128.webp')
  mask-size: contain
  mask-repeat: no-repeat
  mask-position: center
</style>
