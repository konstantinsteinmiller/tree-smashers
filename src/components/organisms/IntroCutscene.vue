<script setup lang="ts">
// ─── First-launch intro cutscene ────────────────────────────────────────────
//
// A ~14 s, fully deterministic cinematic for a brand-new player: a Lv. 30
// team (tornado + diamond) loses a stage-50 boss fight, both badges fall down
// the ladder to 1, and the boss is left standing as the goal. Then it hands
// the screen back to the live stage-1 arena.
//
// Loaded lazily (defineAsyncComponent in SpinnerArena) and only for players
// the gate in `introGate.ts` says are strangers — returning players never
// download this chunk.
//
// Portal rules this component keeps (see SpinnerArena's `isGameplayActive`):
//   • it is NOT gameplay — the arena sits in `tap_to_start` underneath, so no
//     gameplayStart fires on any portal while it plays, and Poki's
//     trusted-gesture gate is untouched;
//   • it makes no ad calls;
//   • a platform pause (Playgama/YouTube overlay, Poki ad) freezes its clock
//     through the shared `isGamePaused` gate — nothing reads the Page
//     Visibility API;
//   • sound obeys the platform mute (see introAudio.ts).
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isGamePaused } from '@/use/useGamePause'
import { FX } from '@/use/useQuality'
import { getCachedImage } from '@/use/useAssets'
import { modelImgPath } from '@/use/useModels'
import useSounds from '@/use/useSound'
import useUser, { isMobileLandscape, isMobilePortrait } from '@/use/useUser'
import { prependBaseUrl } from '@/utils/function'
import { upperForLocale } from '@/utils/localeCase'
import { INTRO_SKIN_IDS } from '@/use/introGate'
import { createIntroFight } from '@/use/introFight'
import { createDirector, SKIP_APPEARS_T, SKIP_FADE_S } from '@/use/introTimeline'
import { createIntroRenderer, type IntroLabels, type IntroRenderer, type SafeInsets } from '@/use/introRender'
import { createIntroAudio } from '@/use/introAudio'
import { introRevealArena } from '@/use/useIntroCutscene'

const emit = defineEmits<{ (e: 'done'): void }>()

const { t, locale } = useI18n()
const { playSound } = useSounds()
const { userSoundVolume, userMusicVolume } = useUser()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const safeProbeRef = ref<HTMLElement | null>(null)
const T = ref(0)
const painted = ref(false)
const skipping = ref(false)
const skipVisible = computed(() => T.value >= SKIP_APPEARS_T && T.value < beats.outroT && !skipping.value)

// ── The fight + the director ────────────────────────────────────────────────
// LIVE: the seeded 240 Hz physics is stepped by the director as the frames
// arrive (a few steps per frame), and the canvas draws its state every frame.
// Nothing is pre-rendered and nothing is simulated ahead of what is on screen.
const fight = createIntroFight()
const track = fight.track
const director = createDirector(fight)
const beats = director.beats

// Canvas text cannot use CSS text-transform, so the upper-casing is done for
// the GAME's locale (Turkish İ, Greek without tonos) — see localeCase.ts.
const labels = (): IntroLabels => ({
  bossStage: upperForLocale(t('bossStage'), String(locale.value)),
  stage: upperForLocale(t('stage'), String(locale.value)),
  lv: t('lv'),
  tagline: t('intro.reclaim')
})

const fontFamily = (): string => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-game').trim()
    return v || '\'Nunito\', system-ui, sans-serif'
  } catch {
    return '\'Nunito\', system-ui, sans-serif'
  }
}

const [bossId, p1Id, p2Id] = INTRO_SKIN_IDS
const assets = {
  boss: getCachedImage(modelImgPath(bossId)),
  p1: getCachedImage(modelImgPath(p1Id)),
  p2: getCachedImage(modelImgPath(p2Id)),
  bgTile: getCachedImage(prependBaseUrl('images/bg/bg-tile_400x400.webp')),
  explosion: getCachedImage(prependBaseUrl('images/vfx/explosion_2080x160.webp'))
}

const isMobileMuted = (): boolean =>
  (isMobilePortrait.value || isMobileLandscape.value) && userMusicVolume.value === 0 && userSoundVolume.value === 0
const audio = createIntroAudio(track, director, playSound, userSoundVolume, isMobileMuted)

let renderer: IntroRenderer | null = null
let rafId: number | null = null
let lastNow = 0
let skipAt = -1
let finished = false
let started = false
let holding = false
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

/** The live HUD StageBadge underneath — the stage badge flies home into it. */
const readHudTarget = (): void => {
  if (!renderer) return
  const el = document.querySelector('.stage-badge') as HTMLElement | null
  if (!el) {
    renderer.setHudTarget(null)
    return
  }
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return
  renderer.setHudTarget({ x: r.left, y: r.top, w: r.width, h: r.height })
}

const resize = (): void => {
  const canvas = canvasRef.value
  if (!canvas || !renderer) return
  const vv = window.visualViewport
  cssW = Math.round(vv?.width ?? window.innerWidth)
  cssH = Math.round(vv?.height ?? window.innerHeight)
  // The game draws 1:1 CSS pixels; the cutscene allows a little more for
  // crisp text, and none at all on the low tier.
  dpr = FX.low ? 1 : Math.min(1.5, window.devicePixelRatio || 1)
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  renderer.resize(cssW, cssH, dpr, readSafe())
  readHudTarget()
}

const finish = (): void => {
  if (finished) return
  finished = true
  emit('done')
}

const skip = (): void => {
  if (skipping.value || finished) return
  skipping.value = true
  skipAt = T.value
  introRevealArena.value = true
}

const frame = (now: number): void => {
  rafId = requestAnimationFrame(frame)
  // Clamp the step: a hidden tab or a long GC pause must not jump the story,
  // while a 250 ms cap still keeps pace with the storyboard down to ~4 fps.
  // (The physics is fixed-step, so a long frame is just more steps.)
  const dt = lastNow ? Math.min(0.25, Math.max(0, (now - lastNow) / 1000)) : 0
  lastNow = now
  const prev = T.value
  if (started && !holding && !isGamePaused.value) T.value = prev + dt
  const t = T.value
  if (!introRevealArena.value && t >= beats.outroT - 0.1) {
    introRevealArena.value = true
    readHudTarget()
  }
  const fade = skipping.value ? Math.min(1, (t - skipAt) / SKIP_FADE_S) : 0
  if (renderer) {
    // draw() advances the live physics to this frame first (director.toS).
    renderer.draw(t, { low: FX.low, fade })
    if (!painted.value) painted.value = true
  }
  // Sound after the draw, so it hears about this frame's contacts.
  if (!skipping.value) audio.update(prev, t)
  if (skipping.value && fade >= 1) finish()
  else if (t >= beats.endT) finish()
}

const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape' && T.value >= SKIP_APPEARS_T) skip()
}

watch(locale, () => {
  renderer?.setLabels(labels(), fontFamily())
})

// ── DEV-only recorder seam (tools/preview-video `intro` scenario) ──────────
// Absent from every production build: Vite folds `import.meta.env.DEV` to
// `false` and the branch goes.
const installDevSeam = (): void => {
  if (!import.meta.env.DEV) return
    ;
  (window as unknown as { __intro?: unknown }).__intro = {
    get T() {
      return T.value
    },
    beats,
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

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    finish()
    return
  }
  // The three skins are in the loader's first tier for a probable first-timer
  // (useAssets); decode() only waits when they are somehow not ready yet, and
  // never for long.
  const decodes = [assets.boss, assets.p1, assets.p2].map(img =>
    (img.complete && img.naturalWidth > 0) || typeof img.decode !== 'function'
      ? Promise.resolve()
      : img.decode().catch(() => {
      }))
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  const fontReady = fonts ? fonts.load('900 100px Nunito').then(() => {
  }).catch(() => {
  }) : Promise.resolve()
  // The loader's splash backdrop (FLogoProgress, z-150) is still fading out
  // for ~0.5 s after the assets land; the story's clock waits for it, so the
  // boss's entrance is never played underneath the splash. Capped.
  const splashGone = new Promise<void>((resolve) => {
    const t0 = Date.now()
    const poll = (): void => {
      if (!document.querySelector('.splash-backdrop') || Date.now() - t0 > 1500) resolve()
      else setTimeout(poll, 50)
    }
    poll()
  })
  await Promise.race([
    Promise.all([...decodes, fontReady, splashGone]),
    new Promise<void>(r => setTimeout(r, 1600))
  ])
  // The KO explosion sheet is needed ~4 s in; decode it now, off the frame
  // that first draws it.
  if (typeof assets.explosion.decode === 'function') void assets.explosion.decode().catch(() => {
  })
  renderer = createIntroRenderer(ctx, track, director, assets, labels(), fontFamily())
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)
  window.visualViewport?.addEventListener('resize', resize)
  window.addEventListener('keydown', onKey)
  installDevSeam()
  started = true
  rafId = requestAnimationFrame(frame)
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('orientationchange', resize)
  window.visualViewport?.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKey)
  if (import.meta.env.DEV) delete (window as unknown as { __intro?: unknown }).__intro
})
</script>

<template lang="pug">
  div.intro-cutscene.fixed.inset-0.select-none(
    class="z-[90] touch-none"
    :class="{ unpainted: !painted }"
    data-testid="intro-cutscene"
  )
    canvas.absolute.inset-0.block(
      ref="canvasRef"
      class="w-full h-full"
      aria-hidden="true"
    )
    //- Invisible probe: its padding IS the safe-area inset, read by the renderer.
    div.safe-probe.absolute.pointer-events-none(ref="safeProbeRef")
    Transition(name="intro-skip")
      button.intro-skip.absolute.flex.items-center.gap-2.rounded-full.font-black.uppercase.game-text.text-white(
        v-if="skipVisible"
        type="button"
        data-testid="intro-skip"
        :aria-label="t('intro.skipAria')"
        class="px-4 py-2 text-sm sm:text-base tracking-wider bg-black/55 border-2 border-white/40 hover:bg-black/75 active:scale-95 cursor-pointer"
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
  // Solid black only until the renderer has painted its first frame (the
  // skins decode first). After that the canvas owns every pixel — and paints
  // transparent ones in the reclaim beat, so the live arena shows through.
  background: transparent

  &.unpainted
    background: #000

.safe-probe
  top: 0
  left: 0
  width: 0
  height: 0
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)
  visibility: hidden

.intro-skip
  -webkit-tap-highlight-color: transparent
  touch-action: manipulation

.intro-skip-enter-active,
.intro-skip-leave-active
  transition: opacity 0.35s ease, transform 0.35s ease

.intro-skip-enter-from,
.intro-skip-leave-to
  opacity: 0
  transform: translateY(6px)
</style>
