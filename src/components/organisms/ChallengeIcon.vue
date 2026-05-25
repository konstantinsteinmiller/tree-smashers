<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconDiamond from '@/components/icons/IconDiamond.vue'

defineProps<{
  /** When true, today's diamond is still up for grabs — the icon pulses
   *  brighter and shows a reward spark. When false (already won today) the
   *  challenge is still playable but visibly calmer. */
  rewardAvailable?: boolean
}>()

const emit = defineEmits<{ (e: 'start'): void }>()

const { t } = useI18n()

// Position the icon just under the 64px logo (logo top = 52px + safe-area).
const rootStyle = {
  top: 'calc(52px + 64px + 14px + env(safe-area-inset-top, 0px))'
}
</script>

<template lang="pug">
  //- Fixed top-left, directly BELOW the FLogoProgress logo so it never overlaps
  //- the stage badge, coin badge, or the bottom HUD row. Menu-screen only
  //- (parent gates with v-if).
  button.challenge-icon.no-os-ui.fixed.z-30.flex.items-center.justify-center(
    class="left-3"
    :class="{ 'challenge-icon--ready': rewardAvailable }"
    :style="rootStyle"
    :aria-label="t('challenge.start')"
    :title="t('challenge.start')"
    @click="emit('start')"
  )
    //- Pulsing flame aura (behind everything)
    span.challenge-icon__aura(aria-hidden="true")

    //- Flaming hexagon arena ring + diamond core
    div.challenge-icon__ring.relative.flex.items-center.justify-center
      svg.challenge-icon__hex(viewBox="0 0 100 100" aria-hidden="true")
        defs
          linearGradient(id="challengeFlame" x1="0" y1="0" x2="0" y2="1")
            stop(offset="0%" stop-color="#ffe66a")
            stop(offset="45%" stop-color="#ff8a18")
            stop(offset="100%" stop-color="#ff3b3b")
        polygon.challenge-icon__hex-stroke(
          points="92,50 71,86.4 29,86.4 8,50 29,13.6 71,13.6"
          fill="none"
          stroke="url(#challengeFlame)"
        )
      //- Diamond core
      IconDiamond.challenge-icon__gem.relative(class="w-6 h-6 sm:w-7 sm:h-7")

    //- Reward spark — only while today's diamond is unclaimed
    span.challenge-icon__spark(v-if="rewardAvailable" aria-hidden="true")
      IconDiamond(class="w-3.5 h-3.5")
</template>

<style scoped lang="sass">
.no-os-ui
  user-select: none
  -webkit-user-select: none
  -webkit-touch-callout: none
  -webkit-tap-highlight-color: transparent

.challenge-icon
  width: 60px
  height: 60px
  cursor: pointer
  background: transparent
  border: none
  padding: 0
  // Lives under the pointer-events-none HUD layer — re-enable hits on itself.
  pointer-events: auto
  transition: transform 0.15s ease
  // Deliberately NO bounce animation — attention comes from the pulsating aura.
  &:hover
    transform: scale(1.06)

  &:active
    transform: scale(0.92)

// Soft radial flame aura that breathes outward to draw the eye.
.challenge-icon__aura
  position: absolute
  inset: -8px
  border-radius: 9999px
  background: radial-gradient(circle, rgba(255, 140, 40, 0.55) 0%, rgba(255, 80, 30, 0.28) 40%, rgba(255, 60, 30, 0) 72%)
  animation: challenge-aura 1.8s ease-in-out infinite
  pointer-events: none

.challenge-icon--ready .challenge-icon__aura
  background: radial-gradient(circle, rgba(255, 170, 50, 0.8) 0%, rgba(255, 90, 30, 0.4) 42%, rgba(255, 60, 30, 0) 74%)
  animation-duration: 1.3s

.challenge-icon__ring
  width: 100%
  height: 100%

.challenge-icon__hex
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  overflow: visible
  filter: drop-shadow(0 0 5px rgba(255, 120, 40, 0.9))
  animation: challenge-flicker 2.4s ease-in-out infinite

.challenge-icon__hex-stroke
  stroke-width: 7
  stroke-linejoin: round

.challenge-icon__gem
  filter: drop-shadow(0 0 4px rgba(140, 220, 255, 0.85))

// Small diamond spark badge in the upper-right when a reward is available.
.challenge-icon__spark
  position: absolute
  top: -2px
  right: -2px
  display: flex
  align-items: center
  justify-content: center
  border-radius: 9999px
  padding: 2px
  background: radial-gradient(circle at 30% 30%, #d9f6ff 0%, #66c8ff 55%, #1b6fb0 100%)
  box-shadow: 0 0 6px rgba(120, 220, 255, 0.9)
  animation: challenge-spark 1.1s ease-in-out infinite

@keyframes challenge-aura
  0%, 100%
    transform: scale(0.9)
    opacity: 0.65
  50%
    transform: scale(1.12)
    opacity: 1

@keyframes challenge-flicker
  0%, 100%
    filter: drop-shadow(0 0 4px rgba(255, 120, 40, 0.8))
  50%
    filter: drop-shadow(0 0 8px rgba(255, 160, 60, 1))

@keyframes challenge-spark
  0%, 100%
    transform: scale(0.85)
    opacity: 0.85
  50%
    transform: scale(1.1)
    opacity: 1
</style>

<i18n lang="yaml">
en:
  challenge:
    start: "Daily Challenge — win to earn a diamond!"
de:
  challenge:
    start: "Tägliche Herausforderung — gewinne einen Diamanten!"
fr:
  challenge:
    start: "Défi quotidien — gagne un diamant !"
es:
  challenge:
    start: "Desafío diario: ¡gana un diamante!"
jp:
  challenge:
    start: "デイリーチャレンジ — 勝ってダイヤを獲得！"
kr:
  challenge:
    start: "일일 도전 — 이기고 다이아몬드를 받으세요!"
zh:
  challenge:
    start: "每日挑战——获胜赢取钻石！"
ru:
  challenge:
    start: "Ежедневный вызов — победи и получи алмаз!"
</i18n>
