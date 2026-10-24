<script setup lang="ts">
// DEV-ONLY UI kit sheet (dev/ui-kit.html). Every block with `data-kit-shot`
// is one screenshot the diff harness (tools/ui-kit-diff) compares against its
// baseline. Labels here are dev-only and not translated.
import { onMounted, ref } from 'vue'
import FButton from '@/components/atoms/FButton.vue'
import FIconButton from '@/components/atoms/FIconButton.vue'
import FButtonSwitch from '@/components/atoms/FButtonSwitch.vue'
import FTabs from '@/components/atoms/FTabs.vue'
import FSwitch from '@/components/atoms/FSwitch.vue'
import FSlider from '@/components/atoms/FSlider.vue'
import FHoldButton from '@/components/atoms/FHoldButton.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { RARITY_ORDER } from '@/data/smasherRarity'
import CardRuneFrame from '@/components/atoms/CardRuneFrame.vue'
import FRibbon from '@/components/atoms/FRibbon.vue'
import FlatRays from '@/components/atoms/FlatRays.vue'
import HudToast from '@/components/atoms/HudToast.vue'
import { showHudToast } from '@/use/useHudToast'
import { modelImgPath, SKINS_PER_TOP } from '@/use/useModels'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const TONES = ['primary', 'secondary', 'royal', 'danger', 'premium', 'plum', 'ad'] as const
const STATES = ['idle', 'hover', 'pressed', 'disabled', 'focus'] as const
type State = typeof STATES[number]

const stateAttrs = (s: State) => ({
  'data-kit-hover': s === 'hover' ? '' : undefined,
  'data-kit-focus': s === 'focus' ? '' : undefined,
  'aria-disabled': s === 'disabled' ? 'true' : undefined
})
const stateClass = (s: State) => ({ 'is-pressed': s === 'pressed', 'is-disabled': s === 'disabled' })

const anim = new URLSearchParams(location.search).has('anim')
const speed = ref<1 | 2>(1)
const speed2 = ref<1 | 2>(2)
const tab2 = ref('a')
const tab3 = ref('c')
const on = ref(true)
const off = ref(false)
const vol = ref(0.6)

onMounted(() => {
  // A toast that stays up for the whole capture (composites block).
  showHudToast(t('sfc.BattlePass.claimedRewards', { n: 7 }), 'leaf', 600_000)
  if (!anim) document.documentElement.classList.add('kit-still')
  void document.fonts.ready.then(() => document.documentElement.setAttribute('data-kit-ready', '1'))
})
</script>

<template lang="pug">
  main.kit
    h1.kit-h Tree Smashers — UI kit

    //- ── Buttons: tone × state ───────────────────────────────────────────
    section.kit-block(data-kit-shot="buttons")
      h2.kit-h2 .ui-btn — tone × state
      div.kit-grid(:style="{ gridTemplateColumns: `6rem repeat(${STATES.length}, 1fr)` }")
        span
        span.kit-col(v-for="s in STATES" :key="s") {{ s }}
        template(v-for="tone in TONES" :key="tone")
          span.kit-row {{ tone }}
          div.kit-cell(v-for="s in STATES" :key="tone + s")
            button.ui-btn(:class="['ui-btn--' + tone, stateClass(s)]" v-bind="stateAttrs(s)" type="button")
              template(v-if="tone === 'premium'")
                IconCoin(class="w-4 h-4")
                span 300
              span(v-else) Button

    //- ── Hero CTA ────────────────────────────────────────────────────────
    section.kit-block(data-kit-shot="hero")
      h2.kit-h2 Hero CTA (variant="brawl")
      div.kit-row-flex
        div.kit-hero(v-for="s in ['idle', 'pressed', 'disabled']" :key="s")
          FButton(tone="primary" variant="brawl" :is-disabled="s === 'disabled'" :class="{ 'kit-press': s === 'pressed' }") Fight
        div.kit-hero
          FButton(tone="premium" variant="brawl" size="sm" :is-disabled="true")
            span.kit-inline
              IconCoin(class="w-5 h-5")
              span 1200

    //- ── Icon buttons ────────────────────────────────────────────────────
    section.kit-block(data-kit-shot="icons")
      h2.kit-h2 FIconButton — type × idle / pressed
      div.kit-row-flex
        template(v-for="tone in ['danger', 'primary', 'secondary', 'royal', 'premium', 'plum', 'ad']" :key="tone")
          FIconButton(:type="tone" icon="right" size="lg" :aria-label="tone")
          FIconButton.is-pressed(:type="tone" icon="right" size="lg" :aria-label="tone")

    //- ── Switches, tabs, slider ──────────────────────────────────────────
    section.kit-block.kit-dark(data-kit-shot="controls")
      h2.kit-h2 Switch puck · tabs puck · FSwitch · FSlider
      div.kit-row-flex
        FButtonSwitch(v-model="speed" :options="[{ value: 1 }, { value: 2 }]")
          template(#default="{ option }") {{ option.value }}x
        FButtonSwitch(v-model="speed2" :options="[{ value: 1 }, { value: 2 }]")
          template(#default="{ option }") {{ option.value }}x
        FButtonSwitch(v-model="speed" :options="[{ value: 1 }, { value: 2 }]" :disabled-values="[2]")
          template(#default="{ option }") {{ option.value }}x
      div.kit-row-flex
        FTabs(v-model="tab2" :options="[{ label: 'General', value: 'a' }, { label: 'Audio', value: 'b' }]")
        FTabs(v-model="tab3" :options="[{ label: 'One', value: 'a' }, { label: 'Two', value: 'b' }, { label: 'Three', value: 'c' }]")
      div.kit-row-flex.kit-ice
        FSwitch(v-model="on")
        FSwitch(v-model="off")
        div(style="width: 16rem")
          FSlider(v-model="vol" :min="0" :max="1" :step="0.01" label="Volume")

    //- ── Cards + rarity ──────────────────────────────────────────────────
    section.kit-block(data-kit-shot="cards")
      h2.kit-h2 .ui-card rarity edges · .ui-rarity-name
      div.kit-row-flex
        div.kit-card.ui-card.ui-card--interactive(v-for="r in RARITY_ORDER" :key="r" :class="'ui-rarity--' + r")
          span.ui-rarity-name(:class="'ui-rarity-name--' + r") {{ t('rarity.' + r) }}
      div.kit-row-flex
        div.kit-card.ui-card.ui-card--interactive.ui-rarity--epic.is-pressed
          span.kit-small pressed
        div.kit-card.ui-card.ui-card--interactive.ui-rarity--rare(data-kit-focus tabindex="0")
          span.kit-small focus

    //- ── Tags, chips, banners, notify, bar ────────────────────────────────
    section.kit-block(data-kit-shot="plates")
      h2.kit-h2 .ui-tag · .ui-chip · FRibbon · .ui-notify · .ui-bar
      div.kit-row-flex
        span.ui-tag(v-for="tone in ['', 'leaf', 'berry', 'royal', 'sky', 'plum', 'ink']" :key="tone" :class="tone ? 'ui-tag--' + tone : ''")
          span.ui-outline Tag
      div.kit-row-flex
        span.ui-chip Chip
        span.ui-chip(v-for="tone in ['leaf', 'berry', 'sun', 'sky', 'plum', 'royal']" :key="tone" :class="'ui-chip--' + tone") {{ tone }}
        span.ui-chip.ui-chip--angled.ui-chip--berry
          span NEW!
        span.ui-notify(style="animation: none") 3
      div.kit-row-flex
        FRibbon(tone="leaf") Victory
        FRibbon(tone="berry") Defeat
        FRibbon(tone="sun" style="font-size: 1.35rem") TEAM
        div.ui-bar(style="width: 12rem")
          div.ui-bar__fill(style="width: 62%")

    //- ── Composites (#UX1c): team card, reward plate, HUD toast ─────────
    section.kit-block(data-kit-shot="composites")
      h2.kit-h2 Composites — team card · reward plate (flat rays + sparkles) · HUD toast
      div.kit-row-flex
        div.kit-team-card(v-for="(r, i) in ['rare', 'epic', 'legendary']" :key="r")
          CardRuneFrame(part-id="star" :rarity="r" :selected="i === 2")
          img.kit-team-portrait(:src="modelImgPath(SKINS_PER_TOP.star[0], 'bramble')" alt="")
          span.ui-tag.ui-tag--ink.kit-team-name
            span.ui-outline-sm Bramble
          span.ui-rarity-name.kit-team-rarity(:class="'ui-rarity-name--' + r") {{ t('rarity.' + r) }}
        div.kit-plate
          FlatRays.kit-plate-rays(:still="true" :burst="false" :spin="false")
          span.ui-sparkle.kit-plate-sp.is-a
          span.ui-sparkle.ui-sparkle--sun.kit-plate-sp.is-b
          IconCoin.kit-plate-coin
          span.ui-outline-sun.kit-plate-amount +250
      div.kit-toast-box
        HudToast

    //- ── Hold to confirm ─────────────────────────────────────────────────
    section.kit-block(data-kit-shot="hold")
      h2.kit-h2 FHoldButton — idle / holding (ring full) / disabled
      div.kit-row-flex
        FHoldButton Reset
        FHoldButton.kit-holding Quit
        FHoldButton(:disabled="true") Reset
</template>

<style lang="sass">
// Frozen sheet: no animation or transition anywhere, so a screenshot is the
// same every run (the harness also emulates reduced motion).
html.kit-still *, html.kit-still *::before, html.kit-still *::after
  animation: none !important
  transition: none !important

body
  margin: 0
  background-color: var(--color-ice-200)
  font-family: var(--font-game)
  color: var(--color-ink)
</style>

<style scoped lang="sass">
.kit
  padding: 16px
  max-width: 1000px

.kit-h
  font-weight: 900
  font-size: 1.4rem
  margin: 0 0 12px

.kit-h2
  font-weight: 900
  font-size: 0.95rem
  margin: 0 0 10px
  color: var(--color-ink-soft)

.kit-block
  margin-bottom: 18px
  padding: 14px 16px 20px
  background-color: var(--color-ice-50)
  border: 2px solid var(--color-ice-400)
  border-radius: 14px

.kit-dark
  background-color: var(--color-royal-600)
  .kit-h2
    color: var(--color-ice-50)

.kit-ice
  padding: 10px
  border-radius: 12px
  background-color: var(--color-ice-100)

.kit-grid
  display: grid
  gap: 14px 10px
  align-items: center

.kit-col, .kit-row
  font-weight: 900
  font-size: 0.8rem
  color: var(--color-ink-soft)

.kit-cell
  display: flex
  justify-content: center
  padding: 6px 0 4px

.kit-row-flex
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 14px
  margin-bottom: 14px

.kit-hero
  width: 13rem

.kit-inline
  display: inline-flex
  align-items: center
  gap: 0.35rem

.kit-card
  width: 6.5rem
  height: 7rem
  display: flex
  align-items: flex-end
  justify-content: center
  padding-bottom: 14px


.kit-small
  font-weight: 900
  font-size: 0.75rem

// A hero shown pressed: the real class the press handler sets.
.kit-press :deep(.ui-btn)
  transform: translateY(6px) scale(1.025, 0.95)
  box-shadow: inset 0 2px 0 var(--btn-lip), inset 0 1.05em 0 var(--btn-gloss), inset 0 -2px 0 var(--btn-band), 0 2px 0 var(--ui-outline)

// Composites
.kit-team-card
  position: relative
  width: 6.5rem
  height: 8.5rem
  display: flex
  flex-direction: column
  align-items: center
  justify-content: flex-end
  gap: 0.3rem
  padding-bottom: 0.9rem
  border: 2px solid transparent
  border-radius: var(--radius-ui)
  background-color: var(--color-ice-50)

.kit-team-portrait
  width: 4.2rem
  height: 4.2rem
  object-fit: contain

.kit-team-name
  font-size: 0.75rem
  padding: 0.15em 0.7em 0.25em

.kit-team-rarity
  position: absolute
  bottom: -0.55rem
  z-index: 3

.kit-plate
  position: relative
  width: 10rem
  height: 8.5rem
  display: flex
  align-items: center
  justify-content: center
  gap: 0.4rem
  overflow: hidden
  border-radius: var(--radius-ui)
  background-color: var(--color-royal-900)

.kit-plate-rays
  position: absolute
  inset: -50%

.kit-plate-coin
  position: relative
  width: 2.2rem
  height: 2.2rem

.kit-plate-amount
  position: relative
  font-weight: 900
  font-size: 1.6rem

// Sparkles at their still peak (the sheet freezes animation).
.kit-plate-sp
  scale: 0.85
  rotate: 45deg
  &.is-a
    left: 0.8rem
    top: 0.9rem
  &.is-b
    right: 1rem
    bottom: 1rem
    --sp-size: 0.7rem

// The toast is position: fixed — a transformed box makes it fixed to here.
.kit-toast-box
  position: relative
  height: 4.2rem
  transform: translateZ(0)
  overflow: hidden
  :deep(.hud-toast-host)
    top: 0.5rem

// The hold ring at 100 %.
.kit-holding :deep(.f-hold-ring)
  opacity: 1

.kit-holding :deep(.f-hold-ring rect)
  stroke-dashoffset: 0
</style>
