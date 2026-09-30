<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isGamePaused } from '@/use/useGamePause'
import { isLowQuality } from '@/use/useQuality'
import { useFitText } from '@/use/useFitText'
import { createPausableTimer } from '@/use/bossDefeated'
import { BOSS_INTRO_TOTAL_MS } from '@/use/bosses/bossArenaUi'
import { bossBadgeImgPathForSkin } from '@/data/bossArt'
import type { BossTrait } from '@/types/spinner'
import BossTraitGlyph from '@/components/atoms/BossTraitGlyph.vue'

/**
 * ─── Boss intro card (bosses-100-feature.md §7.2) ───────────────────────────
 *
 * On a stage-101+ encounter the boss introduces itself INSIDE the existing
 * 1,600 ms meteor intro (no added time): its crest, its name in reddish
 * display letters and its mechanics as glyphs — 250 ms in, 900 ms hold,
 * 350 ms out. No input, no timer beyond the meteor intro; the pause-aware
 * timer freezes with the game (platform pause, ad, hidden tab) and so does the
 * CSS animation. Transform / opacity only; low render quality and
 * prefers-reduced-motion get a plain fade.
 *
 * Mounted with `v-if` by the arena, which owns WHEN (meteor_intro of an
 * encounter stage); `done` fires once the card has faded out.
 */

const props = defineProps<{
  /** Translation key under `stages.` (the stage name). */
  nameKey: string
  cycleSuffix?: string
  /** Skin of the lead boss — picks the crest (null → none). */
  modelId?: string | null
  traits: readonly BossTrait[]
}>()

const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()

const bossName = computed(() => {
  const translated = t(`stages.${props.nameKey}`, props.nameKey)
  return props.cycleSuffix ? `${translated} ${props.cycleSuffix}` : translated
})
const crestSrc = computed(() => bossBadgeImgPathForSkin(props.modelId ?? null))

const nameRef = ref<HTMLElement | null>(null)
useFitText(nameRef, [bossName], 14)

const timer = createPausableTimer(BOSS_INTRO_TOTAL_MS, () => emit('done'))
watch(isGamePaused, (paused) => (paused ? timer.pause() : timer.resume()))
onMounted(() => {
  if (!isGamePaused.value) timer.resume()
})
onUnmounted(() => timer.cancel())
</script>

<template lang="pug">
  div.boss-intro.pointer-events-none(
    :class="{ 'is-static': isLowQuality, 'is-paused': isGamePaused }"
    role="status"
    aria-live="polite"
    data-boss-intro
  )
    div.boss-intro__row.flex.items-center.justify-center
      img.boss-intro__crest(
        v-if="crestSrc"
        :src="crestSrc"
        alt=""
        aria-hidden="true"
        draggable="false"
        decoding="async"
      )
      div.boss-intro__text.flex.flex-col.items-center.min-w-0
        span.boss-intro__name.font-black.uppercase.italic.whitespace-nowrap(ref="nameRef") {{ bossName }}
        div.boss-intro__traits.flex.items-center.justify-center
          BossTraitGlyph(v-for="tr in traits" :key="tr" :trait="tr" :size="28")
</template>

<style scoped lang="sass">
// 250 in / 900 hold / 350 out = 1500 ms (BOSS_INTRO_TOTAL_MS).
.boss-intro
  position: absolute
  left: 50%
  top: 22%
  width: min(92vw, 36rem)
  transform: translateX(-50%)
  animation: boss-intro 1.5s linear both

.boss-intro.is-paused,
.boss-intro.is-paused .boss-intro__row
  animation-play-state: paused

.boss-intro__row
  gap: 0.6rem
  padding: 0.4rem 1rem
  border-radius: 1rem
  background: linear-gradient(to bottom, rgba(40, 4, 8, 0.88), rgba(14, 1, 3, 0.88))
  border: 2px solid #b91c1c
  box-shadow: 0 4px 0 #0c0102
  animation: boss-intro-slam 1.5s ease-out both

.boss-intro__crest
  width: clamp(3.2rem, 11vh, 5rem)
  height: auto
  flex-shrink: 0

.boss-intro__text
  gap: 0.25rem
  max-width: 100%

.boss-intro__name
  max-width: 100%
  font-size: clamp(1.3rem, 5.5vw, 2.4rem)
  line-height: 1.1
  letter-spacing: 0.03em
  color: #ff5a4a
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 0 0 10px rgba(255, 60, 20, 0.55)

.boss-intro__traits
  gap: 0.4rem

@keyframes boss-intro
  0%
    opacity: 0
  16.7%
    opacity: 1
  76.7%
    opacity: 1
  100%
    opacity: 0

@keyframes boss-intro-slam
  0%
    transform: scale(1.35)
  16.7%
    transform: scale(0.97)
  24%
    transform: scale(1)
  100%
    transform: scale(1)

// Low render quality / reduced motion: the fade only.
.boss-intro.is-static .boss-intro__row
  animation: none

@media (prefers-reduced-motion: reduce)
  .boss-intro__row
    animation: none
</style>
