<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatRays from '@/components/atoms/FlatRays.vue'
import VsPortrait from '@/components/atoms/VsPortrait.vue'
import { SkillIconUi } from '@/skills/skillsGate'
import { BossTraitGlyphUi } from '@/bosses/bosses100Gate'
import useSounds from '@/use/useSound'
import { isGamePaused } from '@/use/useGamePause'
import { adsInFlight } from '@/use/useAds'
import { newSlotOn } from '@/audio/audioVersions'
import { isLowQuality } from '@/use/useQuality'
import { fmtGrouped } from '@/utils/localeNumber'
import { preloadPaintedSmashers, warmSmasherSheets } from '@/smashers/smasherAtlas'
import {
  VS_BEATS, VS_EXIT_MS, VS_PORTRAIT_FRAME, VS_RIM, VS_SKIP_FROM_MS,
  computeVsLayout, newVsClock, skipVsClock, stepVsClock, vsSkippable,
  type VsInsets, type VsIntroData, type VsSide, type VsSideLayout, type VsSoundCue
} from '@/use/vsIntro'

/**
 * ─── VS intro ───────────────────────────────────────────────────────────────
 *
 * The 5-second Brawl-Stars-style face-off in front of every new matchup
 * (rules, timeline and layout: `src/use/vsIntro.ts`). Beat by beat:
 *
 *     0 ms   the two team halves SLAM in from opposite sides on the diagonal
 *            split (player sky, enemy berry), flat speed lines streak across,
 *            whoosh
 *   160 ms   cards slide in, staggered 70 ms (player first, enemy 80 ms later),
 *            each landing with a squash; a thump per side
 *   560 ms   the VS emblem punches in from 3.4× and LANDS at 720 ms: shockwave
 *            rings, sparks, flat rays, a white flash, a screen shake, the slam
 *   880 ms   skill chips pop one by one (player first), then the power plates
 *  1400 ms   hold (~3.1 s, the full lineup with every skill readable):
 *            portraits bob, the emblem pulses, the rays turn, speed lines
 *            drift; the battle's sheets are pre-drawn in the quiet frames
 *  4550 ms   the wipe: halves, cards and headers fly apart along the seam,
 *            the emblem spins away (exit whoosh); the battle is handed over at
 *            4800 ms under the wipe and the screen is gone at 5000 ms
 *
 * Flat fills, ink outlines, hard 0-blur drops; every animation is transform /
 * opacity. Low render quality drops the lines, sparks, rings, rays and shake;
 * prefers-reduced-motion shows the same content with a plain fade in / out.
 *
 * The CSS keyframes run on the document clock from mount; the JS clock
 * (`stepVsClock`) owns the sound cues, the hand-off and the end, and keeps the
 * CSS in step on a pause (all animations paused) and a skip (all seeked).
 */

const props = withDefaults(defineProps<{
  data: VsIntroData
  /** The game is paused (ad, hidden tab, portal) — freezes the clock. Ignored
   *  for PvP, whose arena owns a wall-clock timer. */
  paused?: boolean
  /** Force the cheap variant (defaults to the render-quality tier). */
  low?: boolean
}>(), { paused: false, low: undefined })

const emit = defineEmits<{ start: []; handoff: []; done: []; skip: [atMs: number] }>()

const { t, locale } = useI18n()
const { playSound } = useSounds()

const cheap = computed(() => props.low ?? isLowQuality.value)
const skippable = computed(() => vsSkippable(props.data.mode))

// ─── Layout (one read of the viewport + safe areas; again on resize) ──────────

const root = ref<HTMLElement | null>(null)
const probe = ref<HTMLElement | null>(null)
const vw = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const vh = ref(typeof window !== 'undefined' ? window.innerHeight : 720)
const insets = ref<VsInsets>({ top: 0, right: 0, bottom: 0, left: 0 })

const readViewport = () => {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
  const p = probe.value
  if (p) {
    const cs = getComputedStyle(p)
    insets.value = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0
    }
  }
}

const hasRow = (s: VsSide) => s.units.some(u => u.skills.length > 0 || u.traits.length > 0)
const lay = computed(() => computeVsLayout(vw.value, vh.value, insets.value, props.data.me.units.length, props.data.them.units.length, {
  me: hasRow(props.data.me),
  them: hasRow(props.data.them)
}))

// The seam (the diagonal split) — a bar along the halves' shared edge.
const seamStyle = computed(() => {
  const { w, h, portrait } = lay.value
  if (portrait) {
    const deg = -Math.atan2(0.1 * h, w) * 180 / Math.PI
    return { width: `${Math.hypot(w, 0.1 * h) + 80}px`, left: '50%', top: '50%', transform: `translate(-50%, -50%) rotate(${deg}deg)` }
  }
  const deg = Math.atan2(0.1 * w, h) * 180 / Math.PI
  return { height: `${Math.hypot(0.1 * w, h) + 80}px`, left: '50%', top: '50%', transform: `translate(-50%, -50%) rotate(${deg}deg)` }
})

const px = (n: number) => `${Math.round(n * 100) / 100}px`

const sideOf = (key: 'me' | 'them'): { side: VsSide; sl: VsSideLayout } =>
  key === 'me' ? { side: props.data.me, sl: lay.value.me } : { side: props.data.them, sl: lay.value.them }

const cardDelay = (key: 'me' | 'them', i: number) =>
  (key === 'me' ? VS_BEATS.cardsMe : VS_BEATS.cardsThem) + i * VS_BEATS.cardStagger

const cardStyle = (key: 'me' | 'them', i: number) => {
  const { sl } = sideOf(key)
  const b = sl.cards[i]!
  // Off-screen start: past the side's outer edge.
  const from = key === 'me' ? -(b.x + b.w + 40) : (lay.value.w - b.x + 40)
  return {
    left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h),
    fontSize: px(sl.cardW / 10),
    '--from': px(from),
    '--d': `${cardDelay(key, i)}ms`,
    '--bd': `${(i * 170 + (key === 'me' ? 0 : 90)) % 600}ms`
  }
}

/** All chips on screen (player first) pop within ~480 ms, whatever their count. */
const chipStagger = computed(() => {
  const n = [props.data.me, props.data.them].reduce((s, side) =>
    s + side.units.reduce((a, u) => a + Math.min(3, u.skills.length + u.traits.length), 0), 0)
  return Math.min(VS_BEATS.skillStagger, 480 / Math.max(1, n))
})

/** Global chip index (player chips first) → its pop delay. */
const chipDelay = (key: 'me' | 'them', unit: number, chip: number): string => {
  let n = 0
  const order: ('me' | 'them')[] = ['me', 'them']
  for (const k of order) {
    const units = sideOf(k).side.units
    for (let u = 0; u < units.length; u++) {
      const count = units[u]!.skills.length + units[u]!.traits.length
      if (k === key && u === unit) return `${Math.round(VS_BEATS.skills + (n + chip) * chipStagger.value)}ms`
      n += Math.min(count, 3)
    }
  }
  return `${VS_BEATS.skills}ms`
}

const headStyle = (key: 'me' | 'them') => {
  const b = sideOf(key).sl.header
  return { left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h), fontSize: px(b.h * 0.42) }
}

const emblemStyle = computed(() => {
  const e = lay.value.emblem
  return { left: px(e.x - e.size / 2), top: px(e.y - e.size / 2), width: px(e.size), height: px(e.size) }
})
const raysStyle = computed(() => {
  const e = lay.value.emblem
  const s = e.size * 3.2
  return { left: px(e.x - s / 2), top: px(e.y - s / 2), width: px(s), height: px(s) }
})
const skipStyle = computed(() => {
  const b = lay.value.skip
  // Long translations ("ÜBERSPRINGEN") shrink to fit the pill instead of spilling.
  const chars = Math.max(4, t('spinner.skip').length + 2)
  const fit = (b.w - b.h * 0.6) / (chars * 0.7)
  return { left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h), fontSize: px(Math.max(8, Math.min(b.h * 0.42, fit))) }
})

/** Skill chip icon size, px (2.8 em of the card). */
const chipPx = (key: 'me' | 'them') => Math.max(16, Math.round(sideOf(key).sl.cardW * 0.28))
/** Portrait canvas css size (10 em × 8.6 em). */
const portraitW = (key: 'me' | 'them') => sideOf(key).sl.cardW
const portraitH = (key: 'me' | 'them') => Math.round(sideOf(key).sl.cardW * 0.86)

const SIDES = ['me', 'them'] as const

const powerText = (n: number) => fmtGrouped(n, String(locale.value))

// Flat speed lines: deterministic spots (no Math.random — stable screenshots).
const LINES = Array.from({ length: 6 }, (_, i) => ({
  top: `${8 + ((i * 37) % 84)}%`,
  w: `${28 + ((i * 23) % 30)}%`,
  h: `${3 + ((i * 5) % 6)}px`,
  d: `${(i * 53) % 260}ms`
}))
const IDLE_LINES = Array.from({ length: 4 }, (_, i) => ({
  top: `${18 + ((i * 29) % 70)}%`,
  w: `${18 + ((i * 17) % 20)}%`,
  d: `${VS_BEATS.hold + i * 230}ms`
}))
const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.26
  const r = 1.05 + (i % 3) * 0.32
  return { sx: `${(Math.cos(a) * r * 100).toFixed(1)}%`, sy: `${(Math.sin(a) * r * 100).toFixed(1)}%`, rot: `${(i * 67) % 360}deg`, sun: i % 2 === 0 }
})

const cssVars = computed(() => ({
  '--t-halves': `${VS_BEATS.halves}ms`,
  '--t-land': `${VS_BEATS.vsLand}ms`,
  '--t-halves-land': `${VS_BEATS.halvesLand}ms`,
  '--t-vs': `${VS_BEATS.vsStart}ms`,
  '--t-power': `${VS_BEATS.power}ms`,
  '--t-hold': `${VS_BEATS.hold}ms`,
  '--t-exit': `${VS_EXIT_MS}ms`,
  '--t-skip': `${VS_SKIP_FROM_MS}ms`,
  '--t-card': `${VS_BEATS.cardSlide}ms`
}))

// ─── Clock ────────────────────────────────────────────────────────────────────

const clock = newVsClock()
const nowMs = ref(0)
let raf = 0
let last = 0
let held: number | null = null
let animPaused = false

const anims = (): Animation[] => {
  const el = root.value
  if (!el || typeof el.getAnimations !== 'function') return []
  return el.getAnimations({ subtree: true })
}
const seek = (ms: number) => {
  for (const a of anims()) {
    try {
      a.currentTime = ms
    } catch { /* ignore */
    }
  }
}
const setAnimsPaused = (p: boolean) => {
  if (p === animPaused) return
  animPaused = p
  for (const a of anims()) {
    try {
      if (p) a.pause()
      else a.play()
    } catch { /* ignore */
    }
  }
  // A resume re-syncs the CSS to the clock (it never runs ahead of it).
  if (!p) seek(Math.max(0, clock.ms))
}

const play = (cues: VsSoundCue[]) => {
  // Never under an ad / a pause; 'v1' on the switchboard silences the slot.
  if (cues.length === 0 || isGamePaused.value || adsInFlight.value > 0 || !newSlotOn('vs-intro')) return
  for (const c of cues) playSound(c.name, c.ratio, 0, c.rate)
}

const frozen = () => held !== null || (props.paused && props.data.mode !== 'pvp')

const tick = (now: number) => {
  const dt = last === 0 ? 0 : now - last
  last = now
  const step = stepVsClock(clock, dt, frozen())
  nowMs.value = clock.ms
  setAnimsPaused(frozen())
  play(step.cues)
  if (step.handoff) emit('handoff')
  // The quiet hold: pre-draw the battle's sheet frames, a few ms per frame.
  if (!frozen() && clock.ms >= VS_BEATS.hold && clock.ms < VS_EXIT_MS) warmSmasherSheets(3)
  if (step.done) {
    emit('done')
    return
  }
  raf = requestAnimationFrame(tick)
}

const trySkip = (): boolean => {
  if (held !== null || frozen()) return false
  const step = skipVsClock(clock, props.data.mode)
  if (!step) return false
  seek(clock.ms)
  nowMs.value = clock.ms
  play(step.cues)
  emit('skip', clock.ms)
  return true
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
    if (trySkip()) e.preventDefault()
  }
}

watch(() => props.paused, () => setAnimsPaused(frozen()))

// QA seam (dev, or `?vsqa`): freeze at a moment for screenshots.
const QA = import.meta.env.DEV || (typeof location !== 'undefined' && /[?&]vsqa(?:=|&|$)/.test(location.search))

onMounted(() => {
  readViewport()
  window.addEventListener('resize', readViewport)
  window.addEventListener('keydown', onKey)
  preloadPaintedSmashers([...props.data.me.units, ...props.data.them.units].map(u => u.smasherId))
  raf = requestAnimationFrame(tick)
  emit('start')
  if (QA) {
    ;(window as unknown as { __vsIntro?: unknown }).__vsIntro = {
      hold: (ms: number) => {
        held = ms
        clock.ms = ms
        nowMs.value = ms
        setAnimsPaused(true)
        seek(ms)
      },
      release: () => {
        held = null
        setAnimsPaused(false)
      },
      skip: () => trySkip(),
      state: () => ({ ms: clock.ms, mode: props.data.mode, layout: lay.value, cheap: cheap.value })
    }
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', readViewport)
  window.removeEventListener('keydown', onKey)
  if (QA) delete (window as unknown as { __vsIntro?: unknown }).__vsIntro
})

const showSkip = computed(() => skippable.value && nowMs.value < VS_EXIT_MS)
</script>

<template lang="pug">
  div.vs-intro(
    ref="root"
    :class="{ 'is-cheap': cheap, 'is-portrait': lay.portrait, 'is-boss': data.them.boss }"
    :style="cssVars"
    data-testid="vs-intro"
    :data-mode="data.mode"
    @pointerdown.stop.prevent="trySkip"
  )
    //- Safe-area probe (read once on mount / resize).
    div.vs-probe(ref="probe" aria-hidden="true")

    div.vs-shake
      //- ── Team halves on the diagonal split ──────────────────────────────
      div.vs-half.is-me(aria-hidden="true")
        div.vs-half-in
          div.vs-half-out
            div.vs-half-fill
            template(v-if="!cheap")
              div.vs-line(v-for="(l, i) in LINES" :key="'l' + i" :style="{ top: l.top, width: l.w, height: l.h, animationDelay: l.d }")
              div.vs-line.is-idle(v-for="(l, i) in IDLE_LINES" :key="'i' + i" :style="{ top: l.top, width: l.w, animationDelay: l.d }")
      div.vs-half.is-them(aria-hidden="true")
        div.vs-half-in
          div.vs-half-out
            div.vs-half-fill
            template(v-if="!cheap")
              div.vs-line(v-for="(l, i) in LINES" :key="'l' + i" :style="{ top: l.top, width: l.w, height: l.h, animationDelay: l.d }")
              div.vs-line.is-idle(v-for="(l, i) in IDLE_LINES" :key="'i' + i" :style="{ top: l.top, width: l.w, animationDelay: l.d }")

      div.vs-seam(:class="{ 'is-portrait': lay.portrait }" :style="seamStyle" aria-hidden="true")
        div.vs-seam-in

      //- Flat rays behind the emblem (no glow: solid wedges).
      div.vs-rays(v-if="!cheap" :style="raysStyle" aria-hidden="true")
        div.vs-rays-out
          FlatRays.vs-rays-svg(:count="18" :opacity="0.16" :delay="VS_BEATS.vsLand" accent-tone="var(--color-sun-300)")

      //- ── Headers: team label + power ───────────────────────────────────
      div.vs-head(
        v-for="key in SIDES"
        :key="'h' + key"
        :class="'is-' + key"
        :style="headStyle(key)"
      )
        div.vs-head-in
          div.vs-head-out
            div.vs-label-plate
              span.vs-kicker(v-if="key === 'them' && data.kicker") {{ data.kicker }}
              svg.vs-head-crown(v-if="key === 'them' && data.them.boss" viewBox="0 0 24 16" aria-hidden="true")
                path(d="M2 14 L1 3 L7 8 L12 1 L17 8 L23 3 L22 14 Z")
              span.vs-label {{ sideOf(key).side.label }}
            div.vs-power
              svg.vs-bolt(viewBox="0 0 16 22" aria-hidden="true")
                path(d="M10 1 L2 12 H7 L5 21 L14 9 H9 Z")
              span.vs-power-num {{ powerText(sideOf(key).side.power) }}
              span.vs-power-label {{ t('leaderboard.power') }}

      //- ── Cards ─────────────────────────────────────────────────────────
      template(v-for="key in SIDES" :key="'c' + key")
        div.vs-card(
          v-for="(u, i) in sideOf(key).side.units"
          :key="key + i"
          :class="['is-' + key, 'kind-' + sideOf(key).sl.kind, { 'is-boss': u.boss }]"
          :style="cardStyle(key, i)"
          :data-smasher="u.smasherId"
        )
          div.vs-card-in
            div.vs-card-out
              div.vs-card-plate
              div.vs-card-portrait
                div.vs-bob
                  VsPortrait(
                    :smasher-id="u.smasherId"
                    :model-id="u.modelId"
                    :boss="u.boss"
                    :frame="key === 'me' ? VS_PORTRAIT_FRAME.me : VS_PORTRAIT_FRAME.them"
                    :width="portraitW(key)"
                    :height="portraitH(key)"
                    :rim="key === 'me' ? VS_RIM.player : VS_RIM.npc"
                    :delay="(key === 'me' ? 0 : data.me.units.length) + i"
                  )
                svg.vs-crown(v-if="u.boss" viewBox="0 0 24 16" aria-hidden="true")
                  path(d="M2 14 L1 3 L7 8 L12 1 L17 8 L23 3 L22 14 Z")
                span.vs-lv {{ t('pvp.level', { n: u.level }) }}
              div.vs-card-body
                div.vs-name {{ t(`smasher_${u.smasherId}`) }}
                div.vs-skills(
                  v-if="u.skills.length || u.traits.length"
                  role="group"
                  :aria-label="key === 'me' ? t('skills.title') : t('skills.opponentSkills')"
                )
                  div.vs-chip(
                    v-for="(s, k) in u.skills"
                    :key="s.key || s.effect"
                    :class="{ 'is-locked': s.locked }"
                    :style="{ animationDelay: chipDelay(key, i, k) }"
                    :data-skill="s.key || s.effect"
                    :data-locked="s.locked ? '1' : undefined"
                  )
                    div.vs-chip-icon(:aria-label="s.locked ? t('vsIntro.unlocksAt', { n: s.unlockLevel }) : undefined" :role="s.locked ? 'img' : undefined")
                      component(
                        v-if="SkillIconUi"
                        :is="SkillIconUi"
                        :id="s.effect"
                        :skill-key="s.key || undefined"
                        :size="chipPx(key)"
                        :locked="s.locked"
                        :decorative="s.locked || sideOf(key).sl.kind === 'names'"
                      )
                      span.vs-chip-lock(v-if="s.locked" aria-hidden="true") {{ t('pvp.level', { n: s.unlockLevel }) }}
                    span.vs-chip-name(v-if="sideOf(key).sl.kind === 'names'") {{ s.locked ? '' : t(s.nameKey) }}
                  div.vs-chip.is-trait(
                    v-for="(tr, k) in u.traits"
                    :key="'t' + tr"
                    :style="{ animationDelay: chipDelay(key, i, u.skills.length + k) }"
                    :data-trait="tr"
                  )
                    div.vs-chip-icon
                      component(v-if="BossTraitGlyphUi" :is="BossTraitGlyphUi" :trait="tr" :size="chipPx(key)" :decorative="sideOf(key).sl.kind === 'names'")
                    span.vs-chip-name(v-if="sideOf(key).sl.kind === 'names'") {{ t(`bosses.traits.${tr}`) }}

      //- ── The VS emblem ─────────────────────────────────────────────────
      div.vs-emblem(:style="emblemStyle" aria-hidden="true")
        template(v-if="!cheap")
          div.vs-ring.is-ink
          div.vs-ring.is-sun
        div.vs-emblem-out
          div.vs-emblem-punch
            div.vs-emblem-pulse
              span.vs-star.is-ink
              span.vs-star.is-berry
              span.vs-star.is-sun
              svg.vs-letters(viewBox="0 0 100 64")
                text.vs-letters-drop(x="50" y="49" text-anchor="middle") {{ t('vs') }}
                text.vs-letters-face(x="50" y="45" text-anchor="middle") {{ t('vs') }}
        template(v-if="!cheap")
          span.vs-spark(
            v-for="(s, i) in SPARKS"
            :key="'s' + i"
            :class="{ 'is-sun': s.sun }"
            :style="{ '--sx': s.sx, '--sy': s.sy, '--rot': s.rot }"
          )

      div.vs-flash(v-if="!cheap" aria-hidden="true")

    //- Skip pill (single-player; from 0.8 s). A tap anywhere skips too.
    button.vs-skip(
      v-if="showSkip"
      type="button"
      :style="skipStyle"
      data-sfx="off"
      @pointerdown.stop.prevent="trySkip"
      @click.stop.prevent
    )
      span {{ t('spinner.skip') }}
      svg.vs-skip-chev(viewBox="0 0 16 12" aria-hidden="true")
        path(d="M1 1 L6 6 L1 11 M8 1 L13 6 L8 11")
</template>

<style scoped lang="sass">
// Every beat comes from src/use/vsIntro.ts VS_BEATS through the --t-* vars.
$ease-slam: cubic-bezier(0.16, 0.9, 0.3, 1.12)
$ease-out-fast: cubic-bezier(0.55, 0, 0.85, 0.35)

.vs-intro
  position: fixed
  inset: 0
  z-index: 70
  overflow: hidden
  pointer-events: auto
  touch-action: none
  user-select: none
  -webkit-user-select: none
  -webkit-tap-highlight-color: transparent
  contain: strict
  --me-fill: var(--color-sky-600)
  --me-lite: var(--color-sky-400)
  --me-deep: var(--color-sky-700)
  --me-line: var(--color-sky-300)
  --them-fill: var(--color-berry-600)
  --them-lite: var(--color-berry-400)
  --them-deep: var(--color-berry-700)
  --them-line: var(--color-berry-300)

  &.is-boss
    --them-fill: var(--color-berry-700)
    --them-lite: var(--color-berry-500)
    --them-deep: var(--color-ink)
    --them-line: var(--color-sun-400)

.vs-probe
  position: absolute
  inset: 0
  visibility: hidden
  pointer-events: none
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)

.vs-shake
  position: absolute
  inset: 0
  animation: vs-shake 300ms linear var(--t-land) both

// ── Halves ───────────────────────────────────────────────────────────────────
.vs-half
  position: absolute
  inset: -2px

  &.is-me
    clip-path: polygon(0 0, 55% 0, 45% 100%, 0 100%)
  &.is-them
    clip-path: polygon(55% 0, 100% 0, 100% 100%, 45% 100%)

.is-portrait
  .vs-half.is-me
    clip-path: polygon(0 55%, 100% 45%, 100% 100%, 0 100%)
  .vs-half.is-them
    clip-path: polygon(0 0, 100% 0, 100% 45%, 0 55%)

.vs-half-in, .vs-half-out, .vs-half-fill
  position: absolute
  inset: 0

.vs-half.is-me
  .vs-half-in
    animation: vs-in-l 260ms $ease-slam var(--t-halves) both
  .vs-half-out
    animation: vs-out-l 420ms $ease-out-fast var(--t-exit) forwards
  .vs-half-fill
    background-color: var(--me-fill)
    // Flat two-tone facets (hard stops): a lighter wedge high, a deep band low.
    background-image: linear-gradient(118deg, var(--me-lite) 0 22%, transparent 22%), linear-gradient(118deg, transparent 0 74%, var(--me-deep) 74%)

.vs-half.is-them
  .vs-half-in
    animation: vs-in-r 260ms $ease-slam var(--t-halves) both
  .vs-half-out
    animation: vs-out-r 420ms $ease-out-fast var(--t-exit) forwards
  .vs-half-fill
    background-color: var(--them-fill)
    background-image: linear-gradient(118deg, var(--them-deep) 0 26%, transparent 26%), linear-gradient(118deg, transparent 0 78%, var(--them-lite) 78%)

// Flat speed lines streaking toward the centre (burst), then a slow idle drift.
.vs-line
  position: absolute
  border-radius: 999px
  opacity: 0
  animation-duration: 560ms
  animation-timing-function: cubic-bezier(0.2, 0.6, 0.4, 1)
  animation-fill-mode: both

  &.is-idle
    height: 3px
    animation-duration: 1100ms
    animation-timing-function: linear
    animation-iteration-count: infinite
    animation-fill-mode: none

.vs-half.is-me .vs-line
  left: 0
  background-color: var(--me-line)
  animation-name: vs-line-l
  &.is-idle
    animation-name: vs-line-idle-l
.vs-half.is-them .vs-line
  right: 0
  background-color: var(--them-line)
  animation-name: vs-line-r
  &.is-idle
    animation-name: vs-line-idle-r

// ── Seam: ink bar with a sun core along the split ─────────────────────────────
.vs-seam
  position: absolute
  z-index: 2
  width: 18px
  pointer-events: none

  &.is-portrait
    width: auto
    height: 18px

.vs-seam-in
  width: 100%
  height: 100%
  background-color: var(--color-ink)
  background-image: linear-gradient(90deg, transparent 0 28%, var(--color-sun-300) 28% 72%, transparent 72%)
  animation: vs-seam 520ms ease-out var(--t-halves-land) both, vs-fade-out 260ms ease-in var(--t-exit) forwards

.vs-seam.is-portrait .vs-seam-in
  background-image: linear-gradient(180deg, transparent 0 28%, var(--color-sun-300) 28% 72%, transparent 72%)

.vs-rays
  position: absolute
  z-index: 2
  pointer-events: none

.vs-rays-out
  width: 100%
  height: 100%
  animation: vs-fade-out 240ms ease-in var(--t-exit) forwards

.vs-rays-svg
  width: 100%
  height: 100%

// ── Headers ──────────────────────────────────────────────────────────────────
.vs-head
  position: absolute
  z-index: 4
  display: flex

.vs-head-in, .vs-head-out
  display: flex
  align-items: center
  gap: 0.5em
  width: 100%
  height: 100%

.vs-head.is-me
  .vs-head-in
    animation: vs-in-l 320ms $ease-slam 120ms both
  .vs-head-out
    animation: vs-out-l 420ms $ease-out-fast var(--t-exit) forwards
.vs-head.is-them
  .vs-head-in
    flex-direction: row-reverse
    animation: vs-in-r 320ms $ease-slam 180ms both
  .vs-head-out
    flex-direction: row-reverse
    animation: vs-out-r 420ms $ease-out-fast var(--t-exit) forwards

.vs-label-plate
  position: relative
  display: flex
  flex-direction: column
  justify-content: center
  min-width: 0
  height: 100%
  padding: 0 0.9em
  isolation: isolate

  &::before
    content: ''
    position: absolute
    inset: 0
    z-index: -1
    border: 3px solid var(--color-ink)
    border-radius: var(--radius-ui)
    box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.28), 0 4px 0 var(--color-ink)
    background-image: var(--ui-facet)

.vs-head.is-me .vs-label-plate::before
  background-color: var(--color-sky-500)
  transform: skewX(-10deg)
.vs-head.is-them .vs-label-plate::before
  background-color: var(--color-berry-500)
  transform: skewX(10deg)
.vs-intro.is-boss .vs-head.is-them .vs-label-plate::before
  background-color: var(--color-berry-600)
  box-shadow: inset 0 0 0 3px var(--color-sun-400), 0 4px 0 var(--color-ink)

.vs-label
  font-weight: 900
  text-transform: uppercase
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke)
  letter-spacing: 0.03em
  line-height: 1.05
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  max-width: 100%

.vs-kicker
  font-size: 0.62em
  font-weight: 900
  text-transform: uppercase
  color: var(--color-sun-300)
  text-shadow: var(--ui-stroke-sm)
  line-height: 1
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.vs-head-crown
  position: absolute
  top: -0.55em
  right: 0.6em
  width: 1.3em
  height: 0.9em
  fill: var(--color-sun-400)
  stroke: var(--color-ink)
  stroke-width: 2
  stroke-linejoin: round

.vs-power
  position: relative
  display: flex
  align-items: center
  gap: 0.25em
  flex-shrink: 0
  height: 78%
  padding: 0 0.6em 0 0.45em
  border: 3px solid var(--color-ink)
  border-radius: var(--radius-ui)
  background-color: var(--color-ink)
  box-shadow: inset 0 2px 0 var(--color-royal-700), 0 4px 0 rgba(22, 26, 64, 0.55)
  animation: vs-pop 300ms cubic-bezier(0.3, 1.6, 0.5, 1) var(--t-power) both

.vs-bolt
  width: 0.8em
  height: 1.1em
  fill: var(--color-sun-400)
  stroke: var(--color-ink)
  stroke-width: 1.5
  stroke-linejoin: round

.vs-power-num
  font-weight: 900
  color: var(--color-sun-300)
  font-variant-numeric: tabular-nums
  line-height: 1

.vs-power-label
  font-size: 0.6em
  font-weight: 900
  text-transform: uppercase
  color: var(--color-ice-300)
  line-height: 1

// ── Cards (10 em wide: see VS_CARD_ASPECT in vsIntro.ts) ───────────────────────
.vs-card
  position: absolute
  z-index: 4

.vs-card-in, .vs-card-out
  position: absolute
  inset: 0

.vs-card.is-me
  .vs-card-in
    animation: vs-card-in var(--t-card) cubic-bezier(0.2, 0.9, 0.25, 1.15) var(--d) both
  .vs-card-out
    animation: vs-out-l 420ms $ease-out-fast var(--t-exit) forwards
.vs-card.is-them
  .vs-card-in
    animation: vs-card-in var(--t-card) cubic-bezier(0.2, 0.9, 0.25, 1.15) var(--d) both
  .vs-card-out
    animation: vs-out-r 420ms $ease-out-fast var(--t-exit) forwards

.vs-card-plate
  position: absolute
  left: 0
  right: 0
  top: 2em
  bottom: 0

  &::before
    content: ''
    position: absolute
    inset: 0
    border: max(2px, 0.28em) solid var(--color-ink)
    border-radius: var(--radius-ui-lg, 14px)
    box-shadow: inset 0 0.3em 0 rgba(255, 255, 255, 0.3), inset 0 -0.45em 0 rgba(22, 26, 64, 0.22), 0 0.4em 0 var(--color-ink)
    background-image: var(--ui-facet)

  // The portrait well: a lighter flat panel the character stands in.
  &::after
    content: ''
    position: absolute
    left: 0.55em
    right: 0.55em
    top: 0.55em
    height: 5.4em
    border-radius: 0.6em
    background-color: rgba(255, 255, 255, 0.2)
    box-shadow: inset 0 -0.25em 0 rgba(22, 26, 64, 0.16)

.vs-card.is-me .vs-card-plate::before
  background-color: var(--color-sky-500)
  transform: skewX(-4deg)
.vs-card.is-them .vs-card-plate::before
  background-color: var(--color-berry-500)
  transform: skewX(4deg)
.vs-card.is-boss .vs-card-plate::before
  background-color: var(--color-berry-600)
  box-shadow: inset 0 0 0 0.3em var(--color-sun-400), inset 0 -0.6em 0 rgba(22, 26, 64, 0.25), 0 0.4em 0 var(--color-ink)

.vs-card-portrait
  position: absolute
  left: 0
  top: 0
  width: 10em
  height: 8.6em

.vs-bob
  animation: vs-bob 1300ms ease-in-out calc(var(--t-hold) + var(--bd)) infinite

.vs-crown
  position: absolute
  left: 50%
  top: -0.3em
  width: 3em
  height: 2em
  margin-left: -1.5em
  fill: var(--color-sun-400)
  stroke: var(--color-ink)
  stroke-width: 1.6
  stroke-linejoin: round
  transform: rotate(-8deg)
  animation: vs-pop 300ms cubic-bezier(0.3, 1.6, 0.5, 1) var(--t-land) both

.vs-lv
  position: absolute
  left: 0.3em
  top: 6.9em
  padding: 0.12em 0.45em
  font-size: 0.95em
  font-weight: 900
  line-height: 1.1
  color: var(--color-ink)
  white-space: nowrap
  background-color: var(--color-sun-400)
  background-image: var(--ui-facet)
  border: max(2px, 0.18em) solid var(--color-ink)
  border-radius: 0.45em
  box-shadow: 0 0.2em 0 var(--color-ink)
  transform: rotate(-4deg)

.vs-card.is-them .vs-lv
  left: auto
  right: 0.3em
  transform: rotate(4deg)

.vs-card-body
  position: absolute
  left: 0.45em
  right: 0.45em
  top: 8.7em
  bottom: 0.55em
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.25em
  min-width: 0

.vs-name
  max-width: 100%
  font-size: 1.25em
  font-weight: 900
  line-height: 1.15
  text-transform: uppercase
  letter-spacing: 0.02em
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.vs-skills
  display: flex
  justify-content: center
  align-items: flex-start
  gap: 0.25em
  width: 100%

.vs-chip
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.15em
  flex: 0 1 3.1em
  min-width: 0
  animation: vs-pop 260ms cubic-bezier(0.3, 1.6, 0.5, 1) both

.vs-chip-icon
  position: relative
  display: flex
  width: 2.8em
  height: 2.8em
  align-items: center
  justify-content: center

  :deep(svg)
    width: 100%
    height: 100%

.vs-chip-lock
  position: absolute
  left: 50%
  bottom: -0.35em
  padding: 0 0.3em
  font-size: 0.62em
  font-weight: 900
  line-height: 1.3
  white-space: nowrap
  color: var(--color-ice-50)
  background-color: var(--color-steel-600)
  border: 2px solid var(--color-ink)
  border-radius: 0.5em
  transform: translateX(-50%)

.vs-chip-name
  width: 5.1em
  margin: 0 -0.05em
  font-size: 0.62em
  font-weight: 900
  line-height: 1.12
  text-align: center
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  overflow: hidden
  display: -webkit-box
  -webkit-line-clamp: 2
  -webkit-box-orient: vertical
  overflow-wrap: break-word
  hyphens: auto

.vs-chip.is-locked .vs-chip-name
  color: var(--color-steel-300)

// ── The VS emblem ─────────────────────────────────────────────────────────────
.vs-emblem
  position: absolute
  z-index: 5
  pointer-events: none

.vs-emblem-out, .vs-emblem-punch, .vs-emblem-pulse
  position: absolute
  inset: 0

.vs-emblem-out
  animation: vs-emblem-out 260ms ease-in var(--t-exit) forwards
.vs-emblem-punch
  animation: vs-punch 380ms cubic-bezier(0.5, 0, 0.6, 1.35) var(--t-vs) both
.vs-emblem-pulse
  animation: vs-pulse 900ms ease-in-out var(--t-hold) infinite

$star: polygon(50% 0%, 59% 27%, 85% 12%, 74% 39%, 100% 46%, 76% 59%, 90% 86%, 62% 76%, 50% 100%, 38% 76%, 10% 86%, 24% 59%, 0% 46%, 26% 39%, 15% 12%, 41% 27%)

.vs-star
  position: absolute
  clip-path: $star

  &.is-ink
    inset: -6%
    background-color: var(--color-ink)
  &.is-berry
    inset: 2%
    background-color: var(--color-berry-500)
    transform: rotate(11deg)
  &.is-sun
    inset: 6%
    background-color: var(--color-sun-400)
    background-image: linear-gradient(160deg, var(--color-sun-300) 0 48%, var(--color-sun-500) 48%)

.vs-letters
  position: absolute
  left: 4%
  top: 16%
  width: 92%
  height: 68%
  overflow: visible

  text
    font-size: 52px
    font-weight: 900
    font-family: inherit
    paint-order: stroke fill
    stroke-linejoin: round

.vs-letters-drop
  fill: var(--color-berry-600)
  stroke: var(--color-ink)
  stroke-width: 9px

.vs-letters-face
  fill: var(--color-ice-50)
  stroke: var(--color-ink)
  stroke-width: 7px

// Shockwave rings: flat, hard-edged circles bursting outward.
.vs-ring
  position: absolute
  inset: 0
  border-radius: 999px
  opacity: 0
  animation: vs-ring 560ms cubic-bezier(0.1, 0.7, 0.3, 1) var(--t-land) forwards

  &.is-ink
    border: 10px solid var(--color-ink)
  &.is-sun
    inset: 6px
    border: 5px solid var(--color-sun-300)
    animation-delay: calc(var(--t-land) + 40ms)

// Sparks: flat four-point twinkles flying out from the centre.
.vs-spark
  position: absolute
  left: 44%
  top: 44%
  width: 12%
  height: 12%
  background-color: var(--color-ice-50)
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)
  opacity: 0
  animation: vs-spark 600ms cubic-bezier(0.1, 0.7, 0.3, 1) var(--t-land) forwards

  &.is-sun
    background-color: var(--color-sun-300)

.vs-flash
  position: absolute
  inset: 0
  z-index: 7
  background-color: var(--color-ice-50)
  opacity: 0
  pointer-events: none
  animation: vs-flash 160ms ease-out var(--t-land) forwards

// ── Skip ─────────────────────────────────────────────────────────────────────
.vs-skip
  position: absolute
  z-index: 8
  overflow: hidden
  white-space: nowrap
  padding: 0 0.6em
  display: flex
  align-items: center
  justify-content: center
  gap: 0.35em
  font-weight: 900
  text-transform: uppercase
  color: var(--color-ice-50)
  text-shadow: var(--ui-stroke-sm)
  background-color: rgba(22, 26, 64, 0.72)
  border: 2px solid var(--color-ink)
  border-radius: 999px
  box-shadow: 0 3px 0 rgba(22, 26, 64, 0.6)
  animation: vs-fade-in 200ms ease-out var(--t-skip) both
  cursor: pointer

.vs-skip-chev
  width: 1em
  height: 0.75em
  fill: none
  stroke: currentColor
  stroke-width: 2.4
  stroke-linecap: round
  stroke-linejoin: round

// ── Keyframes ────────────────────────────────────────────────────────────────
@keyframes vs-in-l
  0%
    transform: translateX(-105%)
  78%
    transform: translateX(1.5%)
  100%
    transform: translateX(0)

@keyframes vs-in-r
  0%
    transform: translateX(105%)
  78%
    transform: translateX(-1.5%)
  100%
    transform: translateX(0)

// The wipe: each side flies out along the seam, away from the other.
@keyframes vs-out-l
  0%
    transform: translate(0, 0)
  100%
    transform: translate(-120%, 8%)

@keyframes vs-out-r
  0%
    transform: translate(0, 0)
  100%
    transform: translate(120%, -8%)

@keyframes vs-card-in
  0%
    transform: translateX(var(--from)) rotate(0deg)
  70%
    transform: translateX(0) scale(1.06, 0.94)
  85%
    transform: translateX(0) scale(0.98, 1.03)
  100%
    transform: translateX(0) scale(1)

@keyframes vs-line-l
  0%
    opacity: 0.9
    transform: translateX(-110%)
  100%
    opacity: 0
    transform: translateX(160%)

@keyframes vs-line-r
  0%
    opacity: 0.9
    transform: translateX(110%)
  100%
    opacity: 0
    transform: translateX(-160%)

@keyframes vs-line-idle-l
  0%
    opacity: 0
    transform: translateX(-110%)
  20%
    opacity: 0.45
  100%
    opacity: 0
    transform: translateX(240%)

@keyframes vs-line-idle-r
  0%
    opacity: 0
    transform: translateX(110%)
  20%
    opacity: 0.45
  100%
    opacity: 0
    transform: translateX(-240%)

@keyframes vs-seam
  0%
    opacity: 0
    transform: scale(0.2, 1)
  20%
    opacity: 1
    transform: scale(2.2, 1)
  100%
    opacity: 1
    transform: scale(1, 1)

@keyframes vs-punch
  0%
    opacity: 0
    transform: scale(3.4) rotate(-16deg)
  30%
    opacity: 1
  42%
    transform: scale(0.8) rotate(5deg)
  70%
    transform: scale(1.1) rotate(-2deg)
  100%
    opacity: 1
    transform: scale(1) rotate(0deg)

@keyframes vs-pulse
  0%, 100%
    transform: scale(1) rotate(0deg)
  50%
    transform: scale(1.05) rotate(-1.5deg)

@keyframes vs-emblem-out
  0%
    transform: scale(1) rotate(0deg)
    opacity: 1
  100%
    transform: scale(0.1) rotate(40deg)
    opacity: 0

@keyframes vs-ring
  0%
    opacity: 1
    transform: scale(0.35)
  100%
    opacity: 0
    transform: scale(2.6)

@keyframes vs-spark
  0%
    opacity: 1
    transform: translate(0, 0) rotate(0deg) scale(1)
  70%
    opacity: 1
  100%
    opacity: 0
    transform: translate(var(--sx), var(--sy)) rotate(var(--rot)) scale(0.2)

@keyframes vs-flash
  0%
    opacity: 0.35
  100%
    opacity: 0

@keyframes vs-shake
  0%
    transform: translate(0, 0)
  10%
    transform: translate(-9px, 5px)
  22%
    transform: translate(8px, -6px)
  36%
    transform: translate(-6px, -3px)
  52%
    transform: translate(5px, 4px)
  70%
    transform: translate(-2px, 2px)
  100%
    transform: translate(0, 0)

@keyframes vs-bob
  0%, 100%
    transform: translateY(0)
  50%
    transform: translateY(-0.22em)

@keyframes vs-pop
  0%
    opacity: 0
    transform: scale(0.2)
  100%
    opacity: 1
    transform: scale(1)

@keyframes vs-fade-in
  0%
    opacity: 0
  100%
    opacity: 1

@keyframes vs-fade-out
  0%
    opacity: 1
  100%
    opacity: 0

// ── Low render quality: no lines / sparks / rings / rays / flash / shake ───────
.vs-intro.is-cheap .vs-shake
  animation: none

// ── Reduced motion: the same content, a plain fade in / hold / fade out ───────
@keyframes vs-rm-fade
  0%
    opacity: 0
  6%, 91%
    opacity: 1
  100%
    opacity: 0

@media (prefers-reduced-motion: reduce)
  .vs-intro
    // VS_TOTAL_MS: fade in 0.3 s, hold, fade out over the wipe (4.55–5 s).
    animation: vs-rm-fade 5000ms linear both

    *, *::before, *::after
      animation: none !important

    .vs-line, .vs-spark, .vs-ring, .vs-flash, .vs-rays
      display: none
</style>
