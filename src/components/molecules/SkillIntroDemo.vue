<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SKILLS } from '@/data/skillCatalog'
import type { SkillId } from '@/types/skills'

/**
 * ─── Animated skill example for the skills intro screen ─────────────────────
 *
 * A wordless, looping 6.4 s vignette in one inline SVG (viewBox 320×180, so it
 * scales to any width with no layout work):
 *
 *   0.0 – 1.6 s  the skill medallion drops into a skill slot (slot lights up)
 *   1.6 – 2.9 s  an enemy spinner rams the player's spinner
 *   2.9 – 4.5 s  the skill fires on its own: its glyph pops over the player,
 *                the hit is halved ("-6" instead of "-12") and — for Mirror
 *                Plate — a bolt flies back and knocks the enemy away ("-6")
 *   5.8 – 6.4 s  fade, loop
 *
 * Everything is CSS keyframes on transform / opacity (no JS timer, no canvas,
 * no filter / box-shadow animation). `storyboard` renders the static
 * fallback instead — the same art frozen at the three key poses side by side —
 * for FX.low and prefers-reduced-motion. The numbers are locale-free, the
 * only text is the aria-label.
 */

const props = withDefaults(defineProps<{
  skillId?: SkillId
  storyboard?: boolean
}>(), {
  skillId: 'mirror_plate',
  storyboard: false
})

const { t } = useI18n()

const def = computed(() => SKILLS[props.skillId])
const reflects = computed(() => props.skillId === 'mirror_plate')
/** Effect accent: player skill effects read blue / cyan on the canvas (§8.4);
 *  a near-white catalog colour (Mirror Plate) would vanish on the floor. */
const fx = computed(() => (luma(def.value.color) > 0.8 ? '#7dd3fc' : def.value.color))

function luma(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

const aria = computed(() => t('skills.intro.demoAria', { name: t(`skills.names.${props.skillId}`) }))

// Spinner art: a hub and four blades, drawn around (0,0).
const BLADES = 'M0 -17 L5 -6 L-5 -6 Z M17 0 L6 5 L6 -5 Z M0 17 L-5 6 L5 6 Z M-17 0 L-6 -5 L-6 5 Z'
// The medallion glyph is the 24×24 catalog path, centred by translate(-12 -12).
</script>

<template lang="pug">
  div.skill-demo(:class="{ 'is-storyboard': storyboard }" role="img" :aria-label="aria" data-testid="skill-demo")
    //- ═══════════════ Animated ═══════════════
    svg.skill-demo__stage(v-if="!storyboard" viewBox="0 0 320 180" aria-hidden="true" data-mode="animated")
      defs
        radialGradient#sdFloor(cx="0.5" cy="0.5" r="0.6")
          stop(offset="0" stop-color="#1e3a5f")
          stop(offset="1" stop-color="#0b1424")
        radialGradient#sdBurst(cx="0.5" cy="0.5" r="0.5")
          stop(offset="0" stop-color="#ffffff" stop-opacity="1")
          stop(offset="0.4" :stop-color="fx" stop-opacity="0.8")
          stop(offset="1" :stop-color="fx" stop-opacity="0")
      //- Arena floor (right two thirds)
      rect(x="112" y="14" width="200" height="152" rx="22" fill="url(#sdFloor)" stroke="#334155" stroke-width="3")
      circle(cx="212" cy="90" r="56" fill="none" stroke="#475569" stroke-width="1.5" stroke-dasharray="4 6" opacity="0.6")
      //- Equip bay (left third)
      rect(x="8" y="14" width="96" height="152" rx="16" fill="#0f172a" stroke="#334155" stroke-width="3")
      //- Slot frame + light-up
      rect.sd-slot(x="26" y="104" width="60" height="50" rx="10" fill="#1e293b" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="6 4")
      rect.sd-slot-lit(x="26" y="104" width="60" height="50" rx="10" fill="none" stroke="#facc15" stroke-width="3.5")
      //- Medallion: drops from the top into the slot
      g.sd-medal
        g(transform="translate(56 129)")
          circle(r="21" fill="#0b1120")
          circle(r="19" fill="#b45309")
          circle(r="16.5" fill="#1e293b")
          circle(r="16.5" :fill="def.color" opacity="0.25")
          g(transform="scale(1.05) translate(-12 -12)")
            path(:d="def.icon" fill="#0b1120" stroke="#0b1120" stroke-width="2.2" stroke-linejoin="round")
            path(:d="def.icon" :fill="def.color")
      //- Slot flash when it clicks in
      circle.sd-snap(cx="56" cy="129" r="30" fill="url(#sdBurst)")
      //- Arrow: slot → arena
      path.sd-arrow(d="M92 60 L104 70 L92 80 Z" fill="#facc15")

      //- Player spinner (blue), sits at (178, 96); recoils a little on impact
      g.sd-player
        g(transform="translate(178 96)")
          g.sd-spin
            circle(r="19" fill="#1d4ed8" stroke="#0b1120" stroke-width="2.5")
            path(:d="BLADES" fill="#93c5fd" stroke="#0b1120" stroke-width="1.5")
            circle(r="6" fill="#dbeafe" stroke="#0b1120" stroke-width="1.5")
      //- Shield flash around the player
      circle.sd-guard(cx="178" cy="96" r="27" fill="none" :stroke="fx" stroke-width="5")
      //- Enemy spinner (red): rams in from the right, knocked back after
      g.sd-enemy
        g(transform="translate(290 96)")
          g.sd-spin.is-rev
            circle(r="19" fill="#b91c1c" stroke="#0b1120" stroke-width="2.5")
            path(:d="BLADES" fill="#fca5a5" stroke="#0b1120" stroke-width="1.5")
            circle(r="6" fill="#fee2e2" stroke="#0b1120" stroke-width="1.5")
          circle.sd-enemy-hit(r="21" fill="#ffffff")
      //- Impact spark between them
      //- (Position on an inner group: a CSS-animated transform replaces the
      //- element's own `transform` attribute.)
      g.sd-spark
        g(transform="translate(200 96)")
          path(d="M0 -16 L3.5 -3.5 L16 0 L3.5 3.5 L0 16 L-3.5 3.5 L-16 0 L-3.5 -3.5 Z" fill="#fef08a" stroke="#f59e0b" stroke-width="1.5")
      //- Reflected bolt: player → enemy (Mirror Plate)
      g.sd-bolt(v-if="reflects")
        g(transform="translate(196 96)")
          circle(r="8" :fill="fx" stroke="#0b1120" stroke-width="2")
          path(d="M-8 0 L-26 -5 L-26 5 Z" :fill="fx" opacity="0.75")
      //- Skill glyph pops over the player
      g.sd-pop
        g(transform="translate(178 46)")
          circle(r="19" fill="#0b1120" :stroke="fx" stroke-width="3")
          g(transform="scale(1.25) translate(-12 -12)")
            path(:d="def.icon" :fill="fx")
      //- Damage numbers: the halved hit on the player, the reflected one on the enemy
      text.sd-num.is-player(x="150" y="84" text-anchor="middle") -6
      text.sd-num.is-enemy(v-if="reflects" x="276" y="66" text-anchor="middle") -6

    //- ═══════════════ Static storyboard ═══════════════
    div.skill-demo__board.flex.items-center.justify-center(v-else data-mode="storyboard")
      //- 1 · equip
      svg.skill-demo__frame(viewBox="0 0 100 100" aria-hidden="true")
        rect(x="3" y="3" width="94" height="94" rx="14" fill="#0f172a" stroke="#334155" stroke-width="3")
        rect(x="22" y="52" width="56" height="38" rx="9" fill="#1e293b" stroke="#facc15" stroke-width="3")
        g(transform="translate(50 71)")
          circle(r="16" fill="#b45309")
          circle(r="13.5" fill="#1e293b")
          g(transform="scale(0.9) translate(-12 -12)")
            path(:d="def.icon" :fill="def.color")
        path(d="M50 14 L50 36 M43 29 L50 37 L57 29" stroke="#facc15" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round")
      svg.skill-demo__chev(viewBox="0 0 24 24" aria-hidden="true")
        path(d="M9 5 L17 12 L9 19" stroke="#facc15" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round")
      //- 2 · the enemy rams you
      svg.skill-demo__frame(viewBox="0 0 100 100" aria-hidden="true")
        rect(x="3" y="3" width="94" height="94" rx="14" fill="#13243d" stroke="#334155" stroke-width="3")
        g(transform="translate(34 56) scale(0.8)")
          circle(r="19" fill="#1d4ed8" stroke="#0b1120" stroke-width="2.5")
          path(:d="BLADES" fill="#93c5fd" stroke="#0b1120" stroke-width="1.5")
        g(transform="translate(70 56) scale(0.8)")
          circle(r="19" fill="#b91c1c" stroke="#0b1120" stroke-width="2.5")
          path(:d="BLADES" fill="#fca5a5" stroke="#0b1120" stroke-width="1.5")
        path(d="M76 32 L90 32 M80 26 L90 32 L80 38" stroke="#fca5a5" stroke-width="3" fill="none" stroke-linecap="round" transform="rotate(180 83 32)")
        g(transform="translate(52 56)")
          path(d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z" fill="#fef08a" stroke="#f59e0b" stroke-width="1.2")
      svg.skill-demo__chev(viewBox="0 0 24 24" aria-hidden="true")
        path(d="M9 5 L17 12 L9 19" stroke="#facc15" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round")
      //- 3 · the skill fires by itself
      svg.skill-demo__frame(viewBox="0 0 100 100" aria-hidden="true")
        rect(x="3" y="3" width="94" height="94" rx="14" fill="#13243d" stroke="#334155" stroke-width="3")
        g(transform="translate(34 62) scale(0.8)")
          circle(r="26" fill="none" :stroke="fx" stroke-width="4")
          circle(r="19" fill="#1d4ed8" stroke="#0b1120" stroke-width="2.5")
          path(:d="BLADES" fill="#93c5fd" stroke="#0b1120" stroke-width="1.5")
        g(transform="translate(80 62) scale(0.7)")
          circle(r="19" fill="#b91c1c" stroke="#0b1120" stroke-width="2.5")
          path(:d="BLADES" fill="#fca5a5" stroke="#0b1120" stroke-width="1.5")
        g(v-if="reflects" transform="translate(58 62)")
          circle(r="5" :fill="fx" stroke="#0b1120" stroke-width="1.5")
          path(d="M-5 0 L-14 -3 L-14 3 Z" :fill="fx" opacity="0.7")
        g(transform="translate(34 24)")
          circle(r="14" fill="#0b1120" :stroke="fx" stroke-width="2.5")
          g(transform="scale(0.95) translate(-12 -12)")
            path(:d="def.icon" :fill="fx")
        text.sd-num.is-enemy(v-if="reflects" x="80" y="36" text-anchor="middle") -6
</template>

<style scoped lang="sass">
.skill-demo
  width: 100%

.skill-demo__stage
  display: block
  width: 100%
  height: auto

.skill-demo__board
  gap: 2%

.skill-demo__frame
  width: 30%
  height: auto
  max-width: 7.5rem

.skill-demo__chev
  width: 5%
  min-width: 12px
  height: auto

// ── Number text ──
.sd-num
  font-weight: 900
  font-size: 20px
  paint-order: stroke
  stroke: #0b1120
  stroke-width: 4px
  stroke-linejoin: round

  &.is-player
    fill: #fca5a5

  &.is-enemy
    fill: #7dd3fc

// ── Animated timeline (6.4 s loop) ──
// Every animated node shares the duration; the keyframes place each beat.
$loop: 6.4s

.sd-spin, .sd-medal, .sd-snap, .sd-arrow, .sd-player, .sd-enemy, .sd-spark, .sd-guard, .sd-bolt, .sd-pop, .sd-num
  transform-box: fill-box
  transform-origin: center

.sd-spin
  animation: sd-spin 0.5s linear infinite

  &.is-rev
    animation-direction: reverse

.sd-medal
  animation: sd-medal $loop ease-in-out infinite

.sd-slot-lit
  opacity: 0
  animation: sd-slot-lit $loop ease-out infinite

.sd-snap
  opacity: 0
  animation: sd-snap $loop ease-out infinite

.sd-arrow
  opacity: 0
  animation: sd-arrow $loop ease-in-out infinite

.sd-player
  animation: sd-player $loop ease-out infinite

.sd-enemy
  animation: sd-enemy $loop cubic-bezier(0.4, 0, 0.6, 1) infinite

.sd-enemy-hit
  opacity: 0
  animation: sd-enemy-hit $loop ease-out infinite

.sd-spark
  opacity: 0
  animation: sd-spark $loop ease-out infinite

.sd-guard
  opacity: 0
  animation: sd-guard $loop ease-out infinite

.sd-bolt
  opacity: 0
  animation: sd-bolt $loop linear infinite

.sd-pop
  opacity: 0
  animation: sd-pop $loop ease-out infinite

.skill-demo__stage .sd-num
  opacity: 0

  &.is-player
    animation: sd-num $loop ease-out infinite

  &.is-enemy
    animation: sd-num-late $loop ease-out infinite

@keyframes sd-spin
  to
    transform: rotate(360deg)

// Medallion: appears high (-95), hovers, drops into the slot at ~21 %.
@keyframes sd-medal
  0%
    opacity: 0
    transform: translateY(-95px) scale(0.3)
  7%
    opacity: 1
    transform: translateY(-95px) scale(1.1)
  11%
    transform: translateY(-92px) scale(1)
  15%
    transform: translateY(-95px) scale(1)
  21%
    transform: translateY(4px) scale(1)
  24%
    transform: translateY(0) scale(0.92)
  27%, 88%
    opacity: 1
    transform: translateY(0) scale(1)
  95%, 100%
    opacity: 0
    transform: translateY(0) scale(1)

@keyframes sd-slot-lit
  0%, 20%
    opacity: 0
  22%, 88%
    opacity: 1
  95%, 100%
    opacity: 0

@keyframes sd-snap
  0%, 20%
    opacity: 0
    transform: scale(0.4)
  22%
    opacity: 1
    transform: scale(0.8)
  32%, 100%
    opacity: 0
    transform: scale(1.8)

@keyframes sd-arrow
  0%, 26%
    opacity: 0
    transform: translateX(-6px)
  30%, 38%
    opacity: 1
    transform: translateX(4px)
  34%
    transform: translateX(-2px)
  44%, 100%
    opacity: 0
    transform: translateX(8px)

// Enemy: waits at the edge, charges (impact at 45 %), is knocked back.
@keyframes sd-enemy
  0%, 30%
    opacity: 1
    transform: translateX(0)
  45%
    transform: translateX(-72px)
  47%
    transform: translateX(-66px)
  58%
    transform: translateX(-4px) rotate(8deg)
  62%
    transform: translateX(-10px) rotate(-6deg)
  66%, 90%
    opacity: 1
    transform: translateX(-8px)
  96%, 100%
    opacity: 0
    transform: translateX(0)

@keyframes sd-enemy-hit
  0%, 53%
    opacity: 0
  55%
    opacity: 0.85
  63%, 100%
    opacity: 0

@keyframes sd-player
  0%, 45%
    transform: translateX(0)
  48%
    transform: translateX(-7px)
  55%, 100%
    transform: translateX(0)

@keyframes sd-spark
  0%, 44%
    opacity: 0
    transform: scale(0.2)
  46%
    opacity: 1
    transform: scale(1.3)
  54%, 100%
    opacity: 0
    transform: scale(0.6)

@keyframes sd-guard
  0%, 45%
    opacity: 0
    transform: scale(0.7)
  48%
    opacity: 1
    transform: scale(1.05)
  62%
    opacity: 0.8
    transform: scale(1)
  72%, 100%
    opacity: 0
    transform: scale(1.25)

// Reflected bolt: leaves the player at 47 %, hits the enemy (x ≈ +80) at 55 %.
@keyframes sd-bolt
  0%, 46%
    opacity: 0
    transform: translateX(0)
  47%
    opacity: 1
    transform: translateX(0)
  55%
    opacity: 1
    transform: translateX(78px)
  57%, 100%
    opacity: 0
    transform: translateX(82px)

@keyframes sd-pop
  0%, 45%
    opacity: 0
    transform: translateY(10px) scale(0.2)
  49%
    opacity: 1
    transform: translateY(0) scale(1.25)
  53%, 76%
    opacity: 1
    transform: translateY(0) scale(1)
  84%, 100%
    opacity: 0
    transform: translateY(-6px) scale(1)

@keyframes sd-num
  0%, 47%
    opacity: 0
    transform: translateY(6px) scale(0.6)
  50%
    opacity: 1
    transform: translateY(0) scale(1.2)
  70%
    opacity: 1
    transform: translateY(-12px) scale(1)
  80%, 100%
    opacity: 0
    transform: translateY(-18px)

@keyframes sd-num-late
  0%, 55%
    opacity: 0
    transform: translateY(6px) scale(0.6)
  58%
    opacity: 1
    transform: translateY(0) scale(1.25)
  76%
    opacity: 1
    transform: translateY(-12px) scale(1)
  86%, 100%
    opacity: 0
    transform: translateY(-18px)

// Belt and braces: the parent already swaps to the storyboard on reduced
// motion, but if this is mounted animated anyway, freeze on a readable pose.
@media (prefers-reduced-motion: reduce)
  .skill-demo__stage *
    animation: none !important
</style>
