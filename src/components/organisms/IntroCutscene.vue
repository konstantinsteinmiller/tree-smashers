<script setup lang="ts">
// ─── First-launch intro cutscene (#Intro1) ──────────────────────────────────
//
// ~16 s, fully deterministic, for a brand-new player, before the first fight.
// Storyboard: art-sheets/intro/STORYBOARD.md. The film: a cosy forest
// clearing → the two team TREES pop up and face off → five smashers drop onto
// their discs → three real skills, one at a time (Bear Hug, Thorn Volley, Log
// Slam) → Log Slam fells the red tree → iris → the title card (logo + the
// stage trail) → hand-off into the live stage-1 arena and its Tap to Start.
//
//   canvas  the world (introRender.ts — the game's own arena, tree, smasher
//           and VFX code; positions from introStory.ts)
//   DOM     captions (FRibbon), the skill card (SkillIcon), the title card
//           (the loader's key-art scene + the logo lockup + the trail), Skip
//
// Loaded lazily (defineAsyncComponent in SpinnerArena) and only for players
// the gate in `introGate.ts` says are strangers.
//
// Portal rules (see SpinnerArena's `isGameplayActive`):
//   • it is NOT gameplay — the arena sits in `tap_to_start` underneath, so no
//     gameplayStart fires while it plays, and Poki's trusted-gesture gate is
//     untouched (a tap here never starts the match);
//   • it makes no ad calls;
//   • a platform pause freezes its clock through the shared `isGamePaused`
//     gate — nothing reads the Page Visibility API;
//   • sound obeys the platform mute (introAudio.ts).
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FRibbon from '@/components/atoms/FRibbon.vue'
import { isGamePaused } from '@/use/useGamePause'
import { FX } from '@/use/useQuality'
import useSounds from '@/use/useSound'
import useUser, { isMobileLandscape, isMobilePortrait } from '@/use/useUser'
import { prependBaseUrl } from '@/utils/function'
import { fmtNum } from '@/utils/localeNumber'
import { LOGO_PARTS, type LogoPartName } from '@/data/logoArt'
import { SkillIconUi, loadIntroSkills } from '@/skills/skillsGate'
import { introRevealArena } from '@/use/useIntroCutscene'
import {
  BEAT, CAST, REVEAL_ARENA_T, SHOWCASE, SKIP_APPEARS_T, SKIP_FADE_S, TRAIL_STONES, SEED,
  overlayAt, type OverlayState
} from '@/use/introStory'
import { createIntroRenderer, preloadIntroCanvasArt, type IntroRenderer, type SafeInsets } from '@/use/introRender'
import { createIntroAudio } from '@/use/introAudio'
import { introArtUrl } from '@/use/introArt'
import { createRng } from '@/use/useDeterministicRng'
import { towerArtRevision } from '@/use/towerArt'
import { floorArtRevision } from '@/use/arenaFloorArt'
import { backdropArtRevision } from '@/use/arenaBackdrop'
import type { IntroSkillFx } from '@/use/skills/introSkills'

const emit = defineEmits<{ (e: 'done'): void }>()

const { t, locale } = useI18n()
const { playSound } = useSounds()
const { userSoundVolume, userMusicVolume } = useUser()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const safeProbeRef = ref<HTMLElement | null>(null)
const emblemFlyRef = ref<HTMLElement | null>(null)
const trailRef = ref<HTMLElement | null>(null)
const T = ref(0)
const painted = ref(false)
const skipping = ref(false)
const skipAt = ref(-1)
const skipVisible = computed(() => T.value >= SKIP_APPEARS_T && T.value < BEAT.handoff && !skipping.value)

const reduceMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── DOM overlay state (pure function of T) ──
const ov = ref<OverlayState>(overlayAt(0, {
  captionTree: 0, captionSkills: 0, card: -1, cardIn: 0, title: false, handoff: 0, stonesLit: 0, canopy: 0, iris: -1
}))

const card = computed(() => {
  const i = ov.value.card
  if (i < 0) return null
  const s = SHOWCASE[i]!
  return { key: s.key, effect: s.effect, smasherId: CAST[s.cast]!.smasherId, k: ov.value.cardIn }
})

const rootOpacity = computed(() => (skipping.value ? Math.max(0, 1 - (T.value - skipAt.value) / SKIP_FADE_S) : 1))

/** Matches the sass (min-aspect-ratio: 1/1) rules; updated on resize. */
const wideScreen = ref(typeof window !== 'undefined' && window.innerWidth >= window.innerHeight)
const popStyle = (k: number) => {
  // centred on phones in portrait, anchored top-left on wide screens
  const base = wideScreen.value ? '' : 'translate(-50%, 0) '
  return {
    opacity: Math.min(1, k * 1.4).toFixed(3),
    transform: reduceMotion ? base || 'none' : `${base}scale(${(0.7 + 0.3 * Math.min(1, k * 1.25)).toFixed(3)})`
  }
}
const cardStyle = computed(() => {
  const k = card.value?.k ?? 0
  return {
    opacity: Math.min(1, k * 1.5).toFixed(3),
    '--slide': reduceMotion ? '0px' : `${((1 - k) * 28).toFixed(1)}px`
  }
})

// ── Title card: logo parts, hero trees, trail, hand-off ──
const partSrc = (name: LogoPartName): string => prependBaseUrl(LOGO_PARTS[name].svg)
const logo = { emblem: partSrc('emblem'), tree: partSrc('tree'), smashers: partSrc('smashers') }
const heroBlue = introArtUrl('heroTrees', 'blue')
const heroRed = introArtUrl('heroTrees', 'red')
const plateUrl = introArtUrl('skillPlate', 'plate')
const plateStyle = plateUrl ? { borderImageSource: `url("${plateUrl}")` } : undefined
const stones = Array.from({ length: TRAIL_STONES }, (_, k) => ({
  k,
  crown: k === TRAIL_STONES - 1,
  src: introArtUrl('trail', k === TRAIL_STONES - 1 ? 'crown' : `stone${k}`),
  label: k === TRAIL_STONES - 1 ? '' : fmtNum(k + 1, String(locale.value))
}))

interface Flight { dx: number; dy: number; s: number }
const emblemFlight = shallowRef<Flight | null>(null)
const stoneFlight = shallowRef<Flight | null>(null)
let flightsMeasured = false

const flightTo = (from: Element | null, sel: string): Flight | null => {
  if (!from || typeof document === 'undefined') return null
  const to = document.querySelector(sel)
  if (!to) return null
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  if (a.width < 2 || b.width < 2) return null
  return {
    dx: b.left + b.width / 2 - (a.left + a.width / 2),
    dy: b.top + b.height / 2 - (a.top + a.height / 2),
    s: Math.min(b.width / a.width, b.height / a.height)
  }
}

const measureFlights = (): void => {
  if (flightsMeasured) return
  flightsMeasured = true
  if (reduceMotion) return
  emblemFlight.value = flightTo(emblemFlyRef.value, '[data-hud-logo]')
  stoneFlight.value = flightTo(trailRef.value?.querySelector('.intro-stone.is-first') ?? null, '.stage-badge')
}

const flyStyle = (f: Flight | null, p: number) => {
  if (!f || p <= 0) return p > 0 ? { opacity: (1 - p).toFixed(3) } : undefined
  const s = 1 + (f.s - 1) * p
  // arc a little upward on the way (a hop, not a slide)
  const lift = Math.sin(p * Math.PI) * -24
  return {
    transform: `translate(${(f.dx * p).toFixed(1)}px, ${(f.dy * p + lift).toFixed(1)}px) scale(${s.toFixed(3)})`,
    opacity: (p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15).toFixed(3)
  }
}
const emblemStyle = computed(() => flyStyle(emblemFlight.value, ov.value.handoff))
const stoneStyle = computed(() => flyStyle(stoneFlight.value, ov.value.handoff))
const fadeOnHandoff = computed(() => {
  const p = ov.value.handoff
  return p > 0 ? { opacity: Math.max(0, 1 - p * 1.6).toFixed(3) } : undefined
})
const backdropStyle = computed(() => {
  const p = ov.value.handoff
  if (p <= 0) return undefined
  // A curtain lift: the key art slides up and away, revealing the live arena
  // (no double exposure). Reduced motion: a plain fade.
  if (reduceMotion) return { opacity: (1 - p).toFixed(3) }
  return {
    opacity: p < 0.75 ? '1' : (1 - (p - 0.75) / 0.25).toFixed(3),
    // whole css px (a fractional translate resamples the key art — soft)
    transform: `translateY(${-Math.round(p * p * (cssH || window.innerHeight))}px)`
  }
})

// ── Renderer, audio, skill layer ──
const isMobileMuted = (): boolean =>
  (isMobilePortrait.value || isMobileLandscape.value) && userMusicVolume.value === 0 && userSoundVolume.value === 0
const audio = createIntroAudio(playSound, userSoundVolume, isMobileMuted)

let renderer: IntroRenderer | null = null
let skillFx: IntroSkillFx | null = null
let rafId: number | null = null
let lastNow = 0
let finished = false
let started = false
let holding = false
let disposed = false
let cssW = 0
let cssH = 0
let dpr = 1

const readSafe = (): SafeInsets => {
  const el = safeProbeRef.value
  if (!el) return { top: 0, right: 0, bottom: 0, left: 0 }
  const cs = getComputedStyle(el)
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0
  }
}

const resize = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return
  const vv = window.visualViewport
  cssW = Math.round(vv?.width ?? window.innerWidth)
  cssH = Math.round(vv?.height ?? window.innerHeight)
  wideScreen.value = window.innerWidth >= window.innerHeight
  // Backing store at css × dpr — never below the display's own pixel ratio
  // (render-sharpness rule), on every quality tier.
  dpr = Math.min(4, Math.max(1, window.devicePixelRatio || 1))
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  renderer?.resize(cssW, cssH, dpr, readSafe())
}

const finish = (): void => {
  if (finished) return
  finished = true
  emit('done')
}

const skip = (): void => {
  if (skipping.value || finished) return
  skipping.value = true
  skipAt.value = T.value
  introRevealArena.value = true
}

/** A tap on the title card goes straight to the hand-off. */
const onTap = (): void => {
  if (skipping.value || finished) return
  if (T.value >= BEAT.title + 0.4 && T.value < BEAT.handoff) T.value = BEAT.handoff
}

const frame = (now: number): void => {
  rafId = requestAnimationFrame(frame)
  // Clamp the step: a hidden tab or a long GC pause must not jump the story.
  const dt = lastNow ? Math.min(0.25, Math.max(0, (now - lastNow) / 1000)) : 0
  lastNow = now
  const prev = T.value
  // A skip fades out on the clock even if the story never started (art still loading).
  if ((started || skipping.value) && !holding && !isGamePaused.value) T.value = prev + dt
  const t = T.value
  ov.value = overlayAt(t, ov.value)
  if (!introRevealArena.value && t >= REVEAL_ARENA_T) introRevealArena.value = true
  if (t >= BEAT.handoff) measureFlights()
  if (renderer) {
    renderer.draw(t, !skipping.value && started && audio.canPlay())
    if (!painted.value) painted.value = true
  }
  // Sound after the draw.
  if (!skipping.value && started) audio.update(prev, t)
  if (skipping.value && t - skipAt.value >= SKIP_FADE_S) finish()
  else if (t >= BEAT.end) finish()
}

const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape' && T.value >= SKIP_APPEARS_T) skip()
}

const translate = (k: string, named?: Record<string, unknown>): string => (named ? t(k, named) : t(k))
watch(locale, () => {
  skillFx?.setLabels(translate, String(locale.value))
})

// ── DEV-only recorder seam (tools/preview-video `intro` scenario) ──────────
const installDevSeam = (): void => {
  if (!import.meta.env.DEV) return
  ;(window as unknown as { __intro?: unknown }).__intro = {
    get T() {
      return T.value
    },
    beats: BEAT,
    get closeZoom() {
      return renderer?.closeZoom ?? 1
    },
    hold: () => {
      holding = true
    },
    release: () => {
      holding = false
    },
    seek: (to: number) => {
      T.value = Math.max(0, to)
    }
  }
}

const artCanLoad = typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent) &&
  typeof location !== 'undefined' && !/[?&]art=procedural(?:&|$)/.test(location.search)

/** Wait (capped) for the splash to go and the painted arena art to land. */
const waitForStage = (): Promise<void> => new Promise((resolve) => {
  const t0 = Date.now()
  const poll = (): void => {
    if (disposed) return resolve()
    const splashGone = !document.querySelector('.splash-backdrop')
    // No painted art in this environment (jsdom, ?art=procedural): nothing to wait for.
    const artIn = !artCanLoad || (towerArtRevision() > 0 && floorArtRevision() > 0 && backdropArtRevision() > 1)
    const waited = Date.now() - t0
    if ((splashGone && (artIn || waited > 1200)) || waited > 2000) resolve()
    else setTimeout(poll, 50)
  }
  poll()
})

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) return
  resize()
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    finish()
    return
  }
  preloadIntroCanvasArt()
  renderer = createIntroRenderer(ctx, { low: FX.low, still: reduceMotion })
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)
  window.visualViewport?.addEventListener('resize', resize)
  window.addEventListener('keydown', onKey)
  installDevSeam()
  // Draw the held first frame at once (under the fading splash).
  rafId = requestAnimationFrame(frame)
  const skillsMod = await Promise.race([
    loadIntroSkills().catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), 1500))
  ])
  if (disposed) return
  if (skillsMod && renderer) {
    skillFx = skillsMod.createIntroSkillFx({
      t: translate,
      locale: String(locale.value),
      rand: createRng(SEED + 3),
      low: FX.low,
      soundOk: () => audio.canPlay(),
      playSound: (name, ratio, offsetSec, rate) => playSound(name, ratio, offsetSec, rate)
    })
    renderer.setSkillFx(skillFx)
  }
  await waitForStage()
  if (disposed) return
  started = true
})

onUnmounted(() => {
  disposed = true
  if (rafId !== null) cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('orientationchange', resize)
  window.visualViewport?.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKey)
  skillFx?.dispose()
  renderer?.dispose()
  if (import.meta.env.DEV) delete (window as unknown as { __intro?: unknown }).__intro
})
</script>

<template lang="pug">
  div.intro-cutscene.fixed.inset-0.select-none(
    class="z-[90] touch-none"
    :class="{ unpainted: !painted, 'is-still': reduceMotion }"
    :style="{ opacity: rootOpacity }"
    data-testid="intro-cutscene"
    @pointerdown="onTap"
  )
    canvas.absolute.inset-0.block(
      ref="canvasRef"
      class="w-full h-full"
      aria-hidden="true"
    )
    //- Invisible probe: its padding IS the safe-area inset, read by the renderer.
    div.safe-probe.absolute.pointer-events-none(ref="safeProbeRef")

    //- Beat 2 / 4 captions: the UI kit's ribbon, minimal copy.
    div.intro-caption(v-if="ov.captionTree > 0" :style="popStyle(ov.captionTree)" data-testid="intro-caption")
      FRibbon(tone="sun" class="text-xl sm:text-3xl") {{ t('intro.smashTree') }}
    div.intro-caption.is-small(v-if="ov.captionSkills > 0" :style="popStyle(ov.captionSkills)")
      FRibbon(tone="sky" class="text-base sm:text-2xl") {{ t('intro.skills') }}

    //- Beat 4: the lower-third skill card (medallion + skill + smasher).
    div.intro-card(v-if="card" :style="cardStyle" data-testid="intro-skill-card")
      div.intro-card__plate(:class="{ 'is-painted': !!plateUrl }" :style="plateStyle")
        component.intro-card__icon(
          v-if="SkillIconUi"
          :is="SkillIconUi"
          :id="card.effect"
          :skill-key="card.key"
          :size="44"
          decorative
        )
        div.intro-card__text
          div.intro-card__skill.font-black {{ t('smasher_skill_' + card.key) }}
          div.intro-card__who.font-extrabold {{ t('smasher_' + card.smasherId) }}

    //- Beat 6: the title card — the loader's key-art scene, the logo lockup,
    //- the stage trail; then the hand-off into the live arena.
    div.intro-title.absolute.inset-0(v-if="ov.title" data-testid="intro-title")
      div.ts-backdrop.intro-title__backdrop(aria-hidden="true" :style="backdropStyle")
        div.ts-rays
        div.ts-clouds.ts-clouds--far
        div.ts-sun
        div.ts-clouds.ts-clouds--near
        div.ts-hills.ts-hills--far
        div.ts-hills.ts-hills--mid
        div.ts-drift.ts-drift--far
        div.ts-trees(v-if="!heroBlue || !heroRed")
          div.ts-tree.ts-tree--l
          div.ts-tree.ts-tree--r
        div.intro-hero-trees(v-else)
          img.intro-hero.is-l(:src="heroBlue" alt="" draggable="false")
          img.intro-hero.is-r(:src="heroRed" alt="" draggable="false")
        div.ts-forest
        div.ts-ground
        div.ts-front
        div.ts-drift.ts-drift--near
      div.ts-stage.intro-title__stage
        div.ts-card
          h1.ts-logo(role="img" :aria-label="t('gameName')")
            div.ts-logo__part.ts-logo__emblem
              div.ts-logo__fly(ref="emblemFlyRef" :style="emblemStyle")
                div.ts-logo__anim.ts-logo__anim--emblem
                  img.ts-logo__img(:src="logo.emblem" alt="" draggable="false")
            div.ts-logo__part.ts-logo__tree(:style="fadeOnHandoff")
              div.ts-logo__anim.ts-logo__anim--tree
                img.ts-logo__img(:src="logo.tree" alt="" draggable="false")
            div.ts-logo__part.ts-logo__smashers(:style="fadeOnHandoff")
              div.ts-logo__anim.ts-logo__anim--smashers
                img.ts-logo__img(:src="logo.smashers" alt="" draggable="false")
                div.ts-logo__shine
          //- The climb: five stepping stones light up, stone 1 flies home
          //- into the HUD stage badge (replaces the old count-down ladder).
          div.intro-trail(ref="trailRef" data-testid="intro-trail")
            template(v-for="s in stones" :key="s.k")
              div.intro-trail__step(v-if="s.k > 0" :class="{ 'is-lit': ov.stonesLit > s.k }" :style="fadeOnHandoff")
              div.intro-stone(
                :class="{ 'is-lit': ov.stonesLit > s.k, 'is-first': s.k === 0, 'is-crown': s.crown }"
                :style="s.k === 0 ? stoneStyle : fadeOnHandoff"
              )
                img.intro-stone__art(v-if="s.src" :src="s.src" alt="" draggable="false")
                svg.intro-stone__art(v-else viewBox="0 0 64 48" aria-hidden="true")
                  ellipse.intro-stone__side(cx="32" cy="29" rx="29" ry="16")
                  ellipse.intro-stone__top(cx="32" cy="24" rx="29" ry="16")
                  path.intro-stone__facet(d="M9 21 Q20 11 34 11 Q22 15 15 25 Z")
                  path.intro-stone__crown(v-if="s.crown" d="M19 27 L17 15 L25 21 L32 11 L39 21 L47 15 L45 27 Z")
                span.intro-stone__num.font-black(v-if="s.label") {{ s.label }}
          div.intro-trail__tag.ui-tag(:class="{ 'is-on': ov.stonesLit > 0 }" :style="fadeOnHandoff")
            span.font-black {{ t('stageN', { n: fmtNum(1, String(locale)) }) }}

    Transition(name="intro-skip")
      //- An ice secondary 3D button: readable over any frame, never the hero.
      button.intro-skip.ui-btn.ui-btn--secondary.absolute.flex.items-center.gap-2.font-black.uppercase(
        v-if="skipVisible"
        type="button"
        data-testid="intro-skip"
        :aria-label="t('intro.skipAria')"
        class="px-4 py-2 text-sm sm:text-base tracking-wider cursor-pointer"
        :style="{\
          right: 'calc(0.9rem + env(safe-area-inset-right, 0px))',\
          bottom: 'calc(0.9rem + env(safe-area-inset-bottom, 0px))'\
        }"
        @click.stop="skip"
        @pointerdown.stop
      )
        span {{ t('spinner.skip') }}
        svg(viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor")
          path(d="M4 5l8 7-8 7V5zm8 0l8 7-8 7V5z")
</template>

<style scoped lang="sass">
.intro-cutscene
  // The meadow backdrop colour only until the renderer has painted its first
  // frame; then the canvas owns every pixel (and paints transparent ones from
  // the title card on, so the live arena shows at the hand-off).
  background: transparent

  &.unpainted
    background: #4f7d45

.safe-probe
  top: 0
  left: 0
  width: 0
  height: 0
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)
  visibility: hidden

// ── Captions ──
.intro-caption
  position: absolute
  left: 50%
  top: calc(env(safe-area-inset-top, 0px) + 9vh)
  transform-origin: 50% 50%
  pointer-events: none
  white-space: nowrap

  &.is-small
    top: calc(env(safe-area-inset-top, 0px) + 7vh)

  // Landscape / desktop: the clearing fills the height, so the caption
  // moves into the free top-left corner instead of over the red tree.
  @media (min-aspect-ratio: 1/1)
    left: calc(env(safe-area-inset-left, 0px) + 1.4rem)
    top: calc(env(safe-area-inset-top, 0px) + 0.9rem)
    transform-origin: 0 50%

    &.is-small
      top: calc(env(safe-area-inset-top, 0px) + 0.9rem)

  @media (min-aspect-ratio: 1/1) and (max-height: 500px)
    :deep(.f-ribbon)
      font-size: 1rem

// ── Skill card (lower third) ──
.intro-card
  position: absolute
  left: 50%
  bottom: calc(env(safe-area-inset-bottom, 0px) + 4.6rem)
  transform: translate(-50%, var(--slide, 0px))
  pointer-events: none

  @media (min-aspect-ratio: 1/1)
    left: calc(env(safe-area-inset-left, 0px) + 1rem)
    bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem)
    transform: translate(0, var(--slide, 0px))

.intro-card__plate
  display: flex
  align-items: center
  gap: 0.6rem
  padding: 0.45rem 1rem 0.45rem 0.5rem
  border-radius: var(--radius-ui, 14px)
  background: var(--color-ice-50)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 -5px 0 var(--color-royal-500), 0 4px 0 var(--color-ink)
  color: var(--color-ink)

  &.is-painted
    // The painted plate (tools/intro-art): nine-sliced, its own rim.
    background: none
    border: 18px solid transparent
    border-image-slice: 30% fill
    border-image-repeat: stretch
    box-shadow: none
    padding: 0 0.5rem 0 0

.intro-card__icon
  flex: none

.intro-card__text
  display: flex
  flex-direction: column
  line-height: 1.05

.intro-card__skill
  font-size: 1.15rem
  white-space: nowrap

.intro-card__who
  font-size: 0.8rem
  color: var(--color-ink-soft)
  white-space: nowrap

// ── Title card ──
.intro-title__backdrop
  // the key-art scene of the loader (index.html .ts-*), as a card here
  position: absolute
  will-change: opacity, transform

.intro-title__stage
  position: absolute
  pointer-events: none

.intro-hero-trees
  inset: 0

.intro-hero
  position: absolute
  bottom: 14vh
  height: min(max(54vmin, 30vh), 640px)
  width: auto

  &.is-l
    left: 2%

  &.is-r
    right: 2%

.ts-logo__fly
  will-change: transform

// The trail: stones with a dotted step between them.
.intro-trail
  display: flex
  align-items: center
  gap: clamp(2px, 0.8vmin, 8px)
  margin-top: clamp(-6px, -1vmin, 0px)

.intro-trail__step
  width: clamp(10px, 3vmin, 26px)
  height: 0
  border-top: 4px dotted var(--color-ink)
  opacity: 0.35
  transition: opacity 0.2s ease

  &.is-lit
    opacity: 0.9

.intro-stone
  position: relative
  width: clamp(48px, 11.5vmin, 86px)
  aspect-ratio: 64 / 48
  display: flex
  align-items: center
  justify-content: center
  opacity: 0.45
  transform: scale(0.82)
  transition: transform 0.28s cubic-bezier(0.3, 1.6, 0.5, 1), opacity 0.16s linear

  &.is-lit
    opacity: 1
    transform: scale(1)

  &.is-first.is-lit
    transform: scale(1.12)

.intro-stone__art
  position: absolute
  inset: 0
  width: 100%
  height: 100%
  object-fit: contain

.intro-stone__side
  fill: #6c7899
  stroke: var(--color-ink)
  stroke-width: 3

.intro-stone__top
  fill: var(--color-ice-200, #cfe0f5)
  stroke: var(--color-ink)
  stroke-width: 3

.intro-stone__facet
  fill: #ffffff
  opacity: 0.55

.intro-stone__crown
  fill: var(--color-sun-400, #ffd21a)
  stroke: var(--color-ink)
  stroke-width: 2.5
  stroke-linejoin: round

.intro-stone.is-first .intro-stone__top
  fill: var(--color-sun-400, #ffd21a)

.intro-stone.is-crown .intro-stone__top
  fill: var(--color-berry-400, #f2306b)

.intro-stone__num
  position: relative
  margin-top: -12%
  font-size: clamp(14px, 3.4vmin, 24px)
  color: var(--color-ink)
  line-height: 1

.intro-trail__tag
  opacity: 0
  transform: translateY(6px)
  transition: opacity 0.25s ease, transform 0.25s ease

  &.is-on
    opacity: 1
    transform: none

.intro-skip
  // .ui-btn is position: relative — the corner placement needs absolute
  position: absolute
  -webkit-tap-highlight-color: transparent
  touch-action: manipulation
  border-radius: 999px

.intro-skip-enter-active,
.intro-skip-leave-active
  transition: opacity 0.35s ease, transform 0.35s ease

.intro-skip-enter-from,
.intro-skip-leave-to
  opacity: 0
  transform: translateY(6px)

.is-still
  .intro-stone, .intro-trail__tag
    transition: opacity 0.2s linear
    transform: none
</style>
