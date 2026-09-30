<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SkillIcon from '@/components/atoms/SkillIcon.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import SkillIntroDemo from '@/components/molecules/SkillIntroDemo.vue'
import { UI_GLYPHS } from '@/data/uiGlyphs'
import type { SkillId } from '@/types/skills'
import { isLowQuality } from '@/use/useQuality'

/**
 * ─── Skills introduction screen (first skill unlock) ────────────────────────
 *
 * Shown once, when skills first exist for the player: right after the
 * stage-10 boss win, or — for players who were already past stage 10 when
 * skills shipped — after their next win screen closes. WHEN it opens and the
 * "seen" flag are the arena's job (WP7: `useSkills.shouldShowSkillsIntro` /
 * `markSkillsIntroSeen`); this component only presents it.
 *
 * Flow:
 *   1. BUILD-UP (`buildUpMs`, 1200–1500 ms, default 1300): a dark vignette,
 *      light rays gathering, a shaking "?" medallion and a pulse that speeds
 *      up. `drumroll` is emitted the moment it starts (with the duration) so
 *      the caller plays the drum-roll SFX (WP8) in sync.
 *   2. REVEAL: a white flash (`revealed` is emitted — the cymbal / `happy`
 *      moment), then the panel: kicker + "Skills unlocked!", four short lines
 *      (bosses drop skills · coins learn/upgrade · 2 team slots · they fire on
 *      their own) and an animated example (SkillIntroDemo: the medallion
 *      drops into a slot, then a mini battle shows the skill firing).
 *   3. CTA "Pick your skill" → `open-picker`; ✕ / Escape → `close`. Both also
 *      emit `update:modelValue(false)`.
 *
 * Static variant (FX.low or prefers-reduced-motion, or `staticMode`): no
 * rays / shake / pulse / flash, and the example is the three-frame
 * storyboard. The build-up still lasts `buildUpMs` so the drum roll lines up.
 *
 * Fits 360×640 portrait up to desktop without horizontal scroll: portrait
 * stacks example over text, a short landscape phone puts them side by side,
 * and the panel scrolls vertically if a long locale needs it.
 */

const props = withDefaults(defineProps<{
  modelValue: boolean
  /** Skills the intro presents; [0] drives the example (Mirror Plate for a new player). */
  skillIds?: SkillId[]
  /** Drum-roll build-up before the panel opens (clamped to 1200–1500 ms). */
  buildUpMs?: number
  /** Force the static variant (null = auto: FX.low or reduced motion). */
  staticMode?: boolean | null
}>(), {
  skillIds: () => ['mirror_plate'],
  buildUpMs: 1300,
  staticMode: null
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** Build-up started: play the drum roll now, for `ms`. */
  (e: 'drumroll', ms: number): void
  /** Build-up done, panel revealed. */
  (e: 'revealed'): void
  (e: 'open-picker'): void
  (e: 'close'): void
}>()

const { t } = useI18n()

type IntroPhase = 'buildup' | 'reveal'
const phase = ref<IntroPhase>('buildup')

const reducedMotion = ref(false)
let mql: MediaQueryList | null = null
const onMql = (e: MediaQueryListEvent) => {
  reducedMotion.value = e.matches
}

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = mql.matches
    mql.addEventListener?.('change', onMql)
  }
})

const isStatic = computed(() =>
  props.staticMode ?? (isLowQuality.value || reducedMotion.value)
)

const buildUp = computed(() => Math.min(1500, Math.max(1200, Math.round(props.buildUpMs || 1300))))
const mainId = computed<SkillId>(() => props.skillIds[0] ?? 'mirror_plate')

let timer: ReturnType<typeof setTimeout> | null = null
const clearTimer = () => {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

const start = () => {
  clearTimer()
  phase.value = 'buildup'
  emit('drumroll', buildUp.value)
  timer = setTimeout(() => {
    timer = null
    phase.value = 'reveal'
    emit('revealed')
  }, buildUp.value)
}

watch(() => props.modelValue, (open) => {
  if (open) start()
  else clearTimer()
}, { immediate: true })

const onKey = (e: KeyboardEvent) => {
  if (props.modelValue && phase.value === 'reveal' && e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  clearTimer()
  window.removeEventListener('keydown', onKey)
  mql?.removeEventListener?.('change', onMql)
})

const close = () => {
  emit('close')
  emit('update:modelValue', false)
}

const openPicker = () => {
  emit('open-picker')
  emit('update:modelValue', false)
}

// Four-point sparkle for "they fire on their own".
const SPARK = 'M12 2.5L14.2 9.8L21.5 12L14.2 14.2L12 21.5L9.8 14.2L2.5 12L9.8 9.8Z'
</script>

<template lang="pug">
  Transition(name="si-fade")
    div.skills-intro.fixed.inset-0.flex.items-center.justify-center(
      v-if="modelValue"
      class="z-[120]"
      :class="{ 'is-static': isStatic }"
      :data-phase="phase"
      data-testid="skills-intro"
      :style="{\
        paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))',\
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',\
        paddingLeft: 'calc(0.75rem + env(safe-area-inset-left, 0px))',\
        paddingRight: 'calc(0.75rem + env(safe-area-inset-right, 0px))'\
      }"
    )
      div.si-backdrop(aria-hidden="true")
      div.si-rays(aria-hidden="true")

      //- ── 1 · Build-up ──────────────────────────────────────────────────
      div.si-buildup.relative.flex.items-center.justify-center(
        v-if="phase === 'buildup'"
        aria-hidden="true"
        data-testid="skills-intro-buildup"
        :style="{ '--si-build': `${buildUp}ms` }"
      )
        div.si-orb
        div.si-ring
        div.si-ring.is-late
        div.si-mystery
          SkillIcon(:id="mainId" :size="112" locked decorative)

      //- ── 2 · Reveal ────────────────────────────────────────────────────
      template(v-else)
        div.si-flash(aria-hidden="true")
        div.si-panel.relative.flex.flex-col(
          role="dialog"
          aria-modal="true"
          aria-labelledby="skills-intro-title"
          data-testid="skills-intro-panel"
        )
          button.si-close.absolute.flex.items-center.justify-center.rounded-full.cursor-pointer(
            type="button"
            :aria-label="t('close')"
            data-action="close"
            @click="close"
          )
            svg(viewBox="0 0 24 24" width="18" height="18" aria-hidden="true")
              path(:d="UI_GLYPHS.close" fill="currentColor")

          div.si-head.flex.flex-col.items-center.text-center
            span.si-kicker.font-black.uppercase.rounded-full {{ t('skills.intro.kicker') }}
            h2#skills-intro-title.si-title.font-black.uppercase.italic.game-text.m-0 {{ t('skills.unlockedTitle') }}

          div.si-body
            div.si-demo-col.flex.flex-col.items-center
              div.si-demo-frame.w-full
                SkillIntroDemo(:skill-id="mainId" :storyboard="isStatic")
              div.si-owned.flex.flex-wrap.justify-center(v-if="skillIds.length > 1")
                SkillIcon(v-for="id in skillIds" :key="id" :id="id" :size="28")

            div.si-text-col.flex.flex-col
              ul.si-lines.m-0.p-0.list-none
                li.si-line.flex.items-center
                  span.si-bullet.flex.items-center.justify-center(aria-hidden="true")
                    SkillIcon(:id="mainId" :size="26" decorative)
                  span {{ t('skills.intro.line1') }}
                li.si-line.flex.items-center
                  span.si-bullet.flex.items-center.justify-center(aria-hidden="true")
                    IconCoin(class="w-5 h-5 text-yellow-300")
                  span {{ t('skills.intro.line2') }}
                li.si-line.flex.items-center
                  span.si-bullet.si-slots.flex.items-center.justify-center(aria-hidden="true")
                    i
                    i
                  span {{ t('skills.intro.line3') }}
                li.si-line.flex.items-center
                  span.si-bullet.flex.items-center.justify-center(aria-hidden="true")
                    svg(viewBox="0 0 24 24" width="20" height="20")
                      path(:d="SPARK" fill="#fde047" stroke="#b45309" stroke-width="1.2" stroke-linejoin="round")
                  span {{ t('skills.intro.line4') }}
              button.si-cta.relative.self-center.cursor-pointer(
                type="button"
                data-action="open-picker"
                @click="openPicker"
              )
                span.si-cta__base.absolute.inset-0.rounded-xl(aria-hidden="true")
                span.si-cta__body.relative.flex.items-center.justify-center.rounded-xl.font-black.uppercase.game-text
                  | {{ t('skills.intro.cta') }}
</template>

<style scoped lang="sass">
// ── Overlay ─────────────────────────────────────────────────────────────────
.skills-intro
  overflow: hidden

.si-backdrop
  position: absolute
  inset: 0
  background: radial-gradient(ellipse at 50% 45%, rgba(30, 58, 110, 0.92) 0%, rgba(8, 12, 24, 0.97) 60%, #03050b 100%)

// Slow light rays behind everything: one conic gradient, rotated (transform
// only). Static on FX.low / reduced motion.
.si-rays
  position: absolute
  left: 50%
  top: 50%
  width: 180vmax
  height: 180vmax
  margin: -90vmax 0 0 -90vmax
  background: repeating-conic-gradient(from 0deg, rgba(251, 191, 36, 0.13) 0deg 7deg, rgba(251, 191, 36, 0) 7deg 20deg)
  mask-image: radial-gradient(circle, #000 0%, rgba(0, 0, 0, 0.6) 25%, transparent 55%)
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0, 0, 0, 0.6) 25%, transparent 55%)
  animation: si-rays 22s linear infinite
  pointer-events: none

.skills-intro[data-phase='buildup'] .si-rays
  animation-duration: 3s
  opacity: 0.8

// ── Build-up ────────────────────────────────────────────────────────────────
.si-buildup
  width: 14rem
  height: 14rem

.si-orb
  position: absolute
  inset: 18%
  border-radius: 9999px
  background: radial-gradient(circle, rgba(253, 230, 138, 0.9) 0%, rgba(245, 158, 11, 0.45) 35%, rgba(245, 158, 11, 0) 70%)
  animation: si-drum var(--si-build, 1300ms) linear both

.si-ring
  position: absolute
  inset: 0
  border-radius: 9999px
  border: 3px solid rgba(253, 224, 71, 0.7)
  animation: si-ring var(--si-build, 1300ms) ease-in both

  &.is-late
    animation-delay: calc(var(--si-build, 1300ms) * 0.35)

.si-mystery
  position: relative
  animation: si-shake var(--si-build, 1300ms) linear both

// ── Reveal ──────────────────────────────────────────────────────────────────
.si-flash
  position: absolute
  inset: 0
  background: radial-gradient(circle at 50% 50%, #fff 0%, rgba(255, 250, 220, 0.85) 30%, rgba(255, 255, 255, 0) 75%)
  opacity: 0
  pointer-events: none
  animation: si-flash 0.55s ease-out
  z-index: 2

.si-panel
  width: min(100%, 30rem)
  max-height: 100%
  overflow-y: auto
  overflow-x: hidden
  overscroll-behavior: contain
  scrollbar-width: none
  gap: 0.6rem
  padding: 1rem 0.9rem 1rem
  border-radius: 1.25rem
  border: 3px solid #facc15
  background: linear-gradient(to bottom, #22386a 0%, #14254a 45%, #0c1730 100%)
  box-shadow: 0 6px 0 #0a1224, 0 0 0 3px #0f1a30, inset 0 1px 0 rgba(255, 255, 255, 0.18)
  animation: si-panel-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both
  z-index: 1

  &::-webkit-scrollbar
    display: none

.si-close
  top: 0.5rem
  right: 0.5rem
  width: 2.5rem
  height: 2.5rem
  color: #e2e8f0
  background: rgba(15, 23, 42, 0.75)
  border: 2px solid #475569
  z-index: 3

  &:active
    transform: scale(0.92)

.si-head
  gap: 0.25rem
  padding: 0 2.2rem

.si-kicker
  font-size: 0.7rem
  letter-spacing: 0.12em
  padding: 3px 10px
  color: #fff
  background: linear-gradient(to bottom, #f97316, #c2410c)
  border: 1px solid #fed7aa

.si-title
  font-size: 1.9rem
  line-height: 1.05
  color: #fde047

.si-body
  display: flex
  flex-direction: column
  gap: 0.7rem

.si-demo-col
  gap: 0.4rem

.si-demo-frame
  border-radius: 1rem
  overflow: hidden
  box-shadow: inset 0 0 0 2px rgba(148, 163, 184, 0.25)

.si-owned
  gap: 0.3rem

.si-text-col
  gap: 0.8rem

.si-lines
  display: flex
  flex-direction: column
  gap: 0.4rem

.si-line
  gap: 0.55rem
  color: #f1f5f9
  font-weight: 700
  font-size: 0.95rem
  line-height: 1.2

.si-bullet
  width: 1.9rem
  height: 1.9rem
  flex-shrink: 0
  border-radius: 0.55rem
  background: rgba(15, 23, 42, 0.8)
  border: 1px solid rgba(148, 163, 184, 0.35)

.si-slots
  gap: 2px

  i
    display: block
    width: 0.55rem
    height: 0.8rem
    border-radius: 2px
    border: 2px solid #facc15
    background: rgba(250, 204, 21, 0.25)

// 3D CTA (project button vocabulary: dark base + yellow gradient body).
.si-cta
  min-width: 12rem
  min-height: 3.2rem
  padding: 0
  border: none
  background: none

.si-cta__base
  transform: translateY(5px)
  background: #1a2b4b

.si-cta__body
  min-height: 3.2rem
  padding: 0 1.4rem
  font-size: 1.1rem
  color: #fff
  border: 3px solid #0f1a30
  background: linear-gradient(to bottom, #ffcd00, #f7a000)
  animation: si-cta-pulse 1.6s ease-in-out 0.8s infinite

.si-cta:active .si-cta__body
  transform: translateY(3px)

@media (min-width: 640px)
  .si-panel
    padding: 1.3rem 1.3rem 1.2rem

  .si-title
    font-size: 2.4rem

  .si-line
    font-size: 1.05rem

// Short landscape phone: example left, text right.
@media (orientation: landscape) and (max-height: 500px)
  .si-panel
    width: min(100%, 50rem)
    gap: 0.35rem
    padding: 0.6rem 0.8rem 0.7rem

  .si-title
    font-size: 1.45rem

  .si-kicker
    font-size: 0.6rem

  .si-body
    flex-direction: row
    align-items: center
    gap: 0.9rem

  .si-demo-col
    flex: 1.15 1 0
    min-width: 0

  .si-text-col
    flex: 1 1 0
    min-width: 0
    gap: 0.55rem

  .si-line
    font-size: 0.85rem

  .si-bullet
    width: 1.6rem
    height: 1.6rem

  .si-cta, .si-cta__body
    min-height: 2.85rem

// Desktop landscape: same side-by-side, roomier.
@media (orientation: landscape) and (min-height: 501px) and (min-width: 900px)
  .si-panel
    width: min(100%, 52rem)

  .si-body
    flex-direction: row
    align-items: center
    gap: 1.4rem

  .si-demo-col
    flex: 1.2 1 0
    min-width: 0

  .si-text-col
    flex: 1 1 0
    min-width: 0

// ── Motion ──────────────────────────────────────────────────────────────────
@keyframes si-rays
  to
    transform: rotate(360deg)

// Drum pulse that speeds up: beats at 0, 30, 52, 68, 80, 89, 95 % (shrinking
// gaps), swelling as it goes, then holds bright for the flash.
@keyframes si-drum
  0%
    transform: scale(0.5)
    opacity: 0.3
  6%
    transform: scale(0.75)
    opacity: 0.7
  30%
    transform: scale(0.6)
    opacity: 0.4
  35%
    transform: scale(0.85)
    opacity: 0.8
  52%
    transform: scale(0.7)
    opacity: 0.5
  56%
    transform: scale(0.95)
    opacity: 0.85
  68%
    transform: scale(0.82)
    opacity: 0.6
  71%
    transform: scale(1.05)
    opacity: 0.9
  80%
    transform: scale(0.95)
    opacity: 0.7
  83%
    transform: scale(1.15)
  89%
    transform: scale(1.05)
  91%
    transform: scale(1.25)
    opacity: 1
  95%
    transform: scale(1.2)
  100%
    transform: scale(1.5)
    opacity: 1

@keyframes si-ring
  0%
    transform: scale(1.6)
    opacity: 0
  30%
    opacity: 0.8
  100%
    transform: scale(0.35)
    opacity: 0

@keyframes si-shake
  0%, 20%
    transform: scale(0.9) rotate(0)
  30%
    transform: scale(0.92) rotate(-3deg)
  40%
    transform: scale(0.94) rotate(3deg)
  50%
    transform: scale(0.96) rotate(-4deg)
  58%
    transform: scale(0.98) rotate(5deg)
  66%
    transform: scale(1) rotate(-6deg)
  72%
    transform: scale(1.02) rotate(6deg) translateX(-2px)
  78%
    transform: scale(1.04) rotate(-7deg) translateX(2px)
  84%
    transform: scale(1.06) rotate(7deg) translateX(-3px)
  89%
    transform: scale(1.08) rotate(-8deg) translateX(3px)
  94%
    transform: scale(1.1) rotate(8deg)
  100%
    transform: scale(1.25) rotate(0)

@keyframes si-flash
  0%
    opacity: 1
  100%
    opacity: 0

@keyframes si-panel-in
  0%
    opacity: 0
    transform: scale(0.7) translateY(20px)
  100%
    opacity: 1
    transform: none

@keyframes si-cta-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.05)

.si-fade-enter-active, .si-fade-leave-active
  transition: opacity 0.3s ease

.si-fade-enter-from, .si-fade-leave-to
  opacity: 0

// ── Static variant (FX.low / reduced motion) ────────────────────────────────
.skills-intro.is-static
  .si-rays, .si-orb, .si-ring, .si-mystery, .si-panel, .si-cta__body
    animation: none

  .si-ring, .si-flash
    display: none

  .si-orb
    transform: scale(1.1)
    opacity: 0.8

@media (prefers-reduced-motion: reduce)
  .si-rays, .si-orb, .si-ring, .si-mystery, .si-panel, .si-cta__body
    animation: none !important

  .si-ring, .si-flash
    display: none
</style>
