<script setup lang="ts">
// ─── ForcedDarkModeModal ────────────────────────────────────────────────
//
// Blocking notice shown while a forced dark-mode / colour overrider (Dark
// Reader in Filter mode, Chromium's "Auto Dark Mode for Web Contents", a
// contrast theme, …) is repainting the game. Those tools recolour the DOM HUD
// and leave the canvas alone, so the game looks broken and the player blames
// it. `index.html` + `components.sass` opt out of everything that CAN be
// opted out of; this is for what is left.
//
// Mounted unconditionally in App.vue; visibility is purely reactive on
// `isBlocking`, so it disappears BY ITSELF the moment the player turns the
// overrider off (the watcher in `forcedDarkModeGuard.ts` re-checks on focus,
// the pause gate, DOM mutation and media-query change). There is no close
// button: the only exits are "fix it" or the quiet "Continue at own risk"
// link, which is remembered in memory for this page load only — never in
// storage (CrazyGames QA rejects extra keys, YouTube Playables has none).
//
// Styling is deliberately a solid dark card with light text: the overrider is
// still active while this is on screen, and that combination survives Dark
// Reader / auto-dark / forced colours readably. Colour carries no meaning.

import { computed, onBeforeUnmount, watch } from 'vue'
import { useSfcI18n } from '@/i18n/sfc'
import { useForcedDarkModeGuard } from '@/use/useForcedDarkModeGuard'
import { setPauseHold } from '@/use/useGamePause'

const { t } = useSfcI18n('ForcedDarkModeModal')
const { result, isBlocking, canContinueAnyway, continueAnyway } = useForcedDarkModeGuard()

const FLAG_URL: Record<string, string> = {
  chrome: 'chrome://flags/#enable-force-dark',
  edge: 'edge://flags/#enable-force-dark',
  opera: 'opera://flags/#enable-force-dark',
  brave: 'brave://flags/#enable-force-dark'
}

/** One "how to turn it off" line, picked from what was detected. */
const hint = computed(() => {
  const { kind, browser } = result.value
  switch (kind) {
    case 'dark-reader':
      return t('forcedDark.hint.darkReader')
    case 'chromium-auto-dark':
      if (browser === 'samsung') return t('forcedDark.hint.samsung')
      return t('forcedDark.hint.chromiumFlag', { flagUrl: FLAG_URL[browser] ?? FLAG_URL.chrome })
    case 'forced-colors':
      return browser === 'firefox' ? t('forcedDark.hint.firefoxColors') : t('forcedDark.hint.forcedColors')
    default: // night-eye, css-filter-invert, unknown-css-override
      return t('forcedDark.hint.extension')
  }
})

// Dark Reader Filter mode (and other invert-filter extensions) put
// `filter: invert(…) hue-rotate(180deg)` on <html>, so this card would be
// shown inverted. Counter-invert the notice so it keeps its real colours.
// Filter+ uses an SVG `url(#…)` filter instead: no invert signal, no counter,
// and the notice shows in whatever colours that filter paints (still legible).
const counterInvert = computed(() =>
  result.value.signals.some((s) => s.kind === 'css-filter-invert' && !s.prevented)
)

// Freeze the simulation while the notice is up. This is the pause gate's
// second, independent input — never `setGamePaused`, which belongs to the
// platform and would be released by the next portal resume. The portal
// gameplay bracket is not driven from here: SpinnerArena's `isGameplayActive`
// reads the same `isBlocking`, so no `gameplayStart` fires on the boot path
// and a mid-session notice closes the bracket like any blocking menu.
const HOLD = 'forced-dark'
watch(isBlocking, (on) => setPauseHold(HOLD, on), { immediate: true })
onBeforeUnmount(() => setPauseHold(HOLD, false))
</script>

<template lang="pug">
  Teleport(to="body")
    Transition(name="fdm-fade")
      div.fdm(
        v-if="isBlocking"
        :class="{ 'fdm--counter-invert': counterInvert }"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fdm-title"
        aria-describedby="fdm-body"
      )
        div.fdm__backdrop
        div.fdm__card
          div.fdm__icon(aria-hidden="true") 🌓
          h2#fdm-title.fdm__title {{ t('forcedDark.title') }}
          p#fdm-body.fdm__body {{ t('forcedDark.body') }}
          p.fdm__hint {{ hint }}
          p.fdm__waiting(aria-live="polite") {{ t('forcedDark.waiting') }}
          button.fdm__continue(
            v-if="canContinueAnyway"
            type="button"
            @click="continueAnyway"
          ) {{ t('forcedDark.continueAnyway') }}
</template>

<style scoped lang="sass">
// Above every in-game overlay (they top out at z 200), below the boot splash
// (9999) — the guard gates gameplay, not loading, so the game keeps loading
// behind the notice.
.fdm
  position: fixed
  inset: 0
  z-index: 9000
  display: flex
  align-items: center
  justify-content: center
  padding: calc(1rem + env(safe-area-inset-top, 0px)) calc(1rem + env(safe-area-inset-right, 0px)) calc(1rem + env(safe-area-inset-bottom, 0px)) calc(1rem + env(safe-area-inset-left, 0px))
  // The game already declares its own scheme; pin this subtree as well so a
  // partial overrider does not flip UA defaults (button text etc.) inside it.
  color-scheme: only light

// Undo an inverting page filter (Dark Reader Filter mode) on the notice only.
// Approximate: DR's brightness/contrast/sepia sliders are not undone.
.fdm--counter-invert
  filter: invert(1) hue-rotate(180deg)

.fdm__backdrop
  position: absolute
  inset: 0
  background: var(--ui-backdrop)

.fdm__card
  position: relative
  width: 100%
  max-width: 26rem
  max-height: 100%
  overflow-y: auto
  padding: 1.5rem 1.25rem 1rem
  border-radius: var(--radius-ui-lg)
  border: 4px solid var(--color-ink)
  background: var(--color-cream-100)
  color: var(--ui-text)
  text-align: center
  box-shadow: inset 0 3px 0 var(--color-cream-50), 0 6px 0 var(--color-ink)

.fdm__icon
  font-size: 2.75rem
  line-height: 1
  margin-bottom: 0.5rem

.fdm__title
  font-size: 1.35rem
  font-weight: 900
  margin: 0 0 0.5rem

.fdm__body
  font-size: 1rem
  margin: 0 0 0.75rem
  font-weight: 800
  color: var(--ui-text)

.fdm__hint
  font-size: 0.9rem
  margin: 0 0 0.75rem
  padding: 0.6rem 0.75rem
  border-radius: var(--radius-ui)
  border: 2px solid var(--color-cream-400)
  background: var(--color-cream-200)
  color: var(--color-wood-800)
  font-weight: 800
  // Flag URLs must wrap rather than force horizontal scroll.
  overflow-wrap: anywhere

.fdm__waiting
  font-size: 0.8rem
  margin: 0 0 0.75rem
  color: var(--ui-text-muted)

// Deliberately a quiet text link, not a button: the fix is the primary path.
.fdm__continue
  appearance: none
  border: 0
  background: none
  padding: 0.5rem 0.75rem
  min-height: 44px
  font: inherit
  font-size: 0.8rem
  color: var(--ui-text-muted)
  text-decoration: underline
  cursor: pointer
  &:hover, &:focus-visible
    color: var(--ui-text)
  &:focus-visible
    outline: 3px solid var(--ui-focus)
    outline-offset: 2px

.fdm-fade-enter-active, .fdm-fade-leave-active
  transition: opacity 0.2s ease
.fdm-fade-enter-from, .fdm-fade-leave-to
  opacity: 0
</style>
