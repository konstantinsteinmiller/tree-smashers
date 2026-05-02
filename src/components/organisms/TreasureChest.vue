<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import useSpinnerConfig from '@/use/useSpinnerConfig'
import useSounds from '@/use/useSound.ts'
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
//   T=0 .. T=3min   → cooldown        (not collectable; shows 3-min countdown)
//   T=3min .. T=10min → small ready   (collectable for 25 coins; shows 7-min countdown)
//   T=10min+        → big ready       (collectable for 100 coins; "READY")
//
// On any collect the chest goes back to T=0.
//
// Players can either snipe the small reward as soon as it lights up
// (~25 coins / 3 min ≈ 8.3 coins/min) or wait the full 10 min for the
// 4× payout (100 / 10 = 10 coins/min). Patience is slightly better, so
// the chest doesn't punish skip-clicking but mildly rewards waiting.

const SMALL_READY_AT_MS = 3 * 60 * 1000   // 3 min
const BIG_READY_AT_MS = 10 * 60 * 1000    // 10 min
const SMALL_REWARD = 25
const BIG_REWARD = 100

// `spinner_chest_last_collected_at` is a NEW key (the previous component
// stored a future-`chestReadyAt` timestamp under different names). Using
// a fresh key avoids a migration: any old data is harmlessly ignored,
// the chest just behaves as if last-collected = epoch (i.e. ready for
// the big reward right away on first ever load — a small one-time gift
// that's not worth a migration helper for).
const STORAGE_KEY = 'spinner_chest_last_collected_at'

// ─── Reactive timer state ──────────────────────────────────────────────────

const loadStoredAt = (): number => parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10) || 0

const lastCollectedAt = ref(loadStoredAt())
const tickNow = ref(Date.now())
let tickIntervalId: number | null = null

const elapsedMs = computed(() => Math.max(0, tickNow.value - lastCollectedAt.value))

type Phase = 'cooldown' | 'small' | 'big'
const phase = computed<Phase>(() => {
  if (elapsedMs.value < SMALL_READY_AT_MS) return 'cooldown'
  if (elapsedMs.value < BIG_READY_AT_MS) return 'small'
  return 'big'
})

const isReady = computed(() => phase.value !== 'cooldown')

/** Reward the player gets if they tap right now. 25 during the small
 *  window, 100 after the chest reaches its 10-min mark. */
const currentReward = computed(() => (phase.value === 'big' ? BIG_REWARD : SMALL_REWARD))

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
  if (chestRef.value && props.targetEl) {
    spawnCoinExplosion({ sourceEl: chestRef.value, targetEl: props.targetEl })
  }
}
</script>

<template lang="pug">
  div.flex.flex-col.items-center.pointer-events-auto(
    @click="collectChest"
    :class="isReady ? 'cursor-pointer chest-pulse' : ''"
    :class-list="phase"
    :style="scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'center' } : undefined"
  )
    div.relative(ref="chestRef" class="w-10 h-10 sm:w-12 sm:h-12")
      img.object-contain.w-full.h-full(
        src="/images/icons/chest_128x128.webp"
        :style="isReady ? { filter: `drop-shadow(0 0 8px ${auraColor})` } : undefined"
      )
      //- Circular cooldown overlay — only during the pre-25 cooldown phase.
      //- During the small (25c) → big (100c) window we show the running
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
            stroke="rgba(0,0,0,0.35)"
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
        span.game-text.text-white.font-bold(class="text-[10px] sm:text-xs") {{ timeDisplay }}
      template(v-else-if="phase === 'small'")
        //- Coin icon styled to match the DailyRewards button
        //- (`<IconCoin class="text-yellow-300">`) so reward labels read
        //- as the same visual currency across the HUD.
        span.font-black.text-yellow-300.flex.items-center(class="text-[11px] sm:text-sm gap-0.5")
          span.game-text +25
          IconCoin(class="w-4 h-4")
        span.game-text.text-white.font-bold(class="text-[8px] sm:text-[10px] opacity-80") {{ timeDisplay }}
      template(v-else)
        //- Big-reward state — chest aura + amber `+100` is signal
        //- enough; the older "READY" suffix duplicated the meaning of
        //- the pulsing icon and made the label feel cluttered.
        span.font-black.text-amber-400.flex.items-center(class="text-[11px] sm:text-sm gap-0.5")
          span.game-text +100
          IconCoin(class="w-4 h-4")
</template>

<style scoped lang="sass">
.chest-pulse
  animation: chest-pulse 2s ease-in-out infinite

@keyframes chest-pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.8

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
