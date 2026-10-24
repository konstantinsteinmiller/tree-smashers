<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FReward from '@/components/atoms/FReward.vue'
import FRibbon from '@/components/atoms/FRibbon.vue'
import FCountUp from '@/components/atoms/FCountUp.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import IconSpeed from '@/components/icons/IconSpeed.vue'
import { modelImgPath } from '@/use/useModels'
import { currentReveal, finishReveal, revealItemRarity, revealRarityHex, setLastRevealOrigin, type ShownRevealItem } from '@/use/useRewardReveal'
import { RARITY_HEX, type RarityTier } from '@/data/smasherRarity'
import type { SmasherId } from '@/data/smasherCatalog'
import { fitPrizeGrid } from '@/use/revealFit'
import useSound from '@/use/useSound'
import { revealGiftArt } from '@/use/revealGiftArt'
import { rewardMedalArt } from '@/use/rewardMedalArt'

/**
 * ─── The gift reveal (glyphyx's chest beat, cozy edition) ───────────────────
 *
 * One host, mounted once in App.vue, drives every non-battle reward screen
 * through `revealRewards()` (see useRewardReveal.ts). The beat, after
 * glyphyx's ChestReveal:
 *
 *     0 ms  a wrapped gift drops in and wobbles ("tap to open!")
 *   650 ms  it opens on its own if the player has not tapped it first:
 *           a squash, the lid flies, a solid shockwave ring + flash — and,
 *           when a skin is inside, a faceted star BURST in the colour of the
 *           rarest skin (#UX1b)
 *   +90 ms  the rays flare behind (FReward's stage)
 *  +140 ms  the prizes are born in the box's mouth and climb out with an
 *           overshoot, staggered 110 ms apart; the box shrinks away
 *  +170 ms  confetti from the mouth and both bottom corners
 *  +750 ms  "tap to continue" — a quick second tap cannot skip the prize
 *
 * Every skin wears its rarity: its plate ring, star and a skewed rarity tag
 * ("EPIC") in the tier colour. A CLAIM-ALL (several skins) lays the skins out
 * in one row under the summed coins, scaled to fit the viewport; many skins
 * wrap into balanced rows (`fitPrizeGrid`).
 *
 * The grant already happened before this opened; dismissing only resolves
 * the caller's promise. Flat shapes + transform/opacity only (perf rule).
 */
const { t, n } = useI18n()
const { playSound } = useSound()

const AUTO_OPEN_MS = 650
const SETTLE_MS = 750

const req = computed(() => currentReveal.value)
const open = computed(() => !!req.value)
const items = computed<ShownRevealItem[]>(() => req.value?.items ?? [])
const tone = computed(() => req.value?.tone ?? '#ffd21a')

const opened = ref(false)
const canContinue = ref(false)
let timers: number[] = []
const clear = () => { for (const id of timers) clearTimeout(id); timers = [] }

const doOpen = () => {
  if (opened.value || !open.value) return
  opened.value = true
  playSound('celebration-1', 0.06)
  timers.push(window.setTimeout(() => { canContinue.value = true }, SETTLE_MS))
}

watch(req, (r) => {
  clear()
  if (!r) return
  opened.value = false
  canContinue.value = false
  timers.push(window.setTimeout(doOpen, AUTO_OPEN_MS))
}, { immediate: true })

onBeforeUnmount(clear)

// ─── Painted gift (tools/gift-art) — the CSS gift until both sprites load ────
const giftArt = revealGiftArt()
const giftLoaded = ref(0)
const giftFailed = ref(false)
const giftPainted = computed(() => !!giftArt && !giftFailed.value && giftLoaded.value >= 2)
const onGiftImg = () => { giftLoaded.value++ }
const onGiftImgError = () => { giftFailed.value = true }

// ─── Painted medallion (tools/reward-medal-art) — the CSS star + ring until it
// loads. Currency / speed plates only: a skin keeps its rarity-coloured star.
const medal = computed(() => rewardMedalArt())
const medalFor = (it: ShownRevealItem) => !!medal.value && it.kind !== 'skin' && it.kind !== 'smasher'

const onGiftTap = (e: MouseEvent) => {
  if (opened.value) return
  // The first tap belongs to the gift, not to "continue".
  e.stopPropagation()
  doOpen()
}

const rootRef = ref<HTMLElement | null>(null)
const onContinue = () => {
  if (!canContinue.value) return
  canContinue.value = false
  // Remember where the coins stood, so a late caller can fly them from here.
  const plate = rootRef.value?.querySelector<HTMLElement>('[data-reveal-kind="coins"] .reveal__plate, [data-reveal-kind="diamonds"] .reveal__plate')
  setLastRevealOrigin(plate?.getBoundingClientRect() ?? rootRef.value?.getBoundingClientRect() ?? null)
  playSound('reward-continue', 0.05)
  finishReveal()
}

const skinName = (id: string) => t(`skins.${id}`)

// ─── Rarity ─────────────────────────────────────────────────────────────────
const rarityOf = (it: ShownRevealItem): RarityTier | null => revealItemRarity(it)
/** A smasher prize's portrait: the smasher in the colourway it was shown in. */
const smasherPortrait = (it: ShownRevealItem): string =>
  it.kind === 'smasher' ? modelImgPath(it.modelId, it.smasherId as SmasherId) : ''
/** Per-prize accent: a skin glows in its rarity colour, the rest in the tone. */
const prizeTone = (it: ShownRevealItem): string => {
  const r = rarityOf(it)
  return r ? RARITY_HEX[r] : tone.value
}
/** The burst colour: the rarest skin, else the reveal tone. */
const burstTone = computed(() => revealRarityHex(items.value) ?? tone.value)
// A premium smasher unlock (src/use/premiumSmashers.ts) bursts like a skin.
const hasSkin = computed(() => items.value.some(i => i.kind === 'skin' || i.kind === 'smasher'))

// ─── Layout ─────────────────────────────────────────────────────────────────
const skins = computed(() => items.value.filter(i => i.kind === 'skin'))
const others = computed(() => items.value.filter(i => i.kind !== 'skin'))
/** Claim-all: two or more skins get their own fitted row. */
const isMany = computed(() => skins.value.length >= 2)
const isBig = computed(() => items.value.length === 1)
const rowItems = computed(() => (isMany.value ? others.value : items.value))

const vw = ref(typeof window !== 'undefined' ? window.innerWidth : 390)
const vh = ref(typeof window !== 'undefined' ? window.innerHeight : 844)
const onResize = () => {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

const grid = computed(() => fitPrizeGrid(skins.value.length, vw.value, vh.value, others.value.length > 0))
const gridStyle = computed(() => ({
  '--plate': `${grid.value.plate}px`,
  gridTemplateColumns: `repeat(${grid.value.cols}, ${grid.value.plate}px)`
}))
/** Climb-out stagger by prize index (currency first, then skins), capped. */
const delayOf = (i: number) => `${140 + Math.min(i, 10) * 110}ms`
</script>

<template lang="pug">
  FReward(
    :model-value="open"
    :show-continue="canContinue"
    celebrate
    :burst="opened"
    :tone="tone"
    data-reward-reveal
    @continue="onContinue"
  )
    template(#ribbon)
      span.ui-outline.font-black.uppercase(class="sm:text-2xl") {{ t('spinner.rewards') }}

    div.reveal(
      v-if="req"
      ref="rootRef"
      :class="{ 'is-open': opened, 'is-many': isMany }"
      :style="{ '--tone': tone, '--burst': burstTone }"
    )
      //- ── The gift ──
      div.reveal__gift-slot
        button.reveal__gift(
          type="button"
          :class="{ 'is-painted': giftPainted }"
          :style="giftArt?.vars"
          :aria-disabled="opened"
          :aria-label="t('rewardReveal.tapToOpen')"
          @click="onGiftTap"
        )
          span.reveal__shock(v-if="opened" aria-hidden="true")
            span.reveal__burst(v-if="hasSkin")
            span.reveal__flash
            span.reveal__ring
            span.reveal__ring.is-late(v-if="hasSkin")
          span.reveal__box(aria-hidden="true")
            img.reveal__art(v-if="giftArt" :src="giftArt.boxSrc" alt="" draggable="false" decoding="async" @load="onGiftImg" @error="onGiftImgError")
            span.reveal__band-v
          span.reveal__lid(aria-hidden="true")
            img.reveal__art(v-if="giftArt" :src="giftArt.lidSrc" alt="" draggable="false" decoding="async" @load="onGiftImg" @error="onGiftImgError")
            span.reveal__band-v
            span.reveal__bow
              span.reveal__loop.is-l
              span.reveal__loop.is-r
              span.reveal__knot
        div.reveal__hint.game-text(v-if="!opened" aria-hidden="true") {{ t('rewardReveal.tapToOpen') }}

      //- ── The prizes ──
      template(v-if="opened")
        //- One flex row: the summed currency (+ the skin of a single-skin gift).
        ul.reveal__prizes(v-if="rowItems.length" :class="{ 'is-big': isBig, 'is-compact': isMany }")
          li.reveal__prize(
            v-for="(it, i) in rowItems"
            :key="'p' + i"
            :style="{ animationDelay: delayOf(i), '--tone': prizeTone(it) }"
            :data-reveal-kind="it.kind"
          )
            div.reveal__plate(
              :class="[`is-${it.kind}`, { 'is-medal': medalFor(it) }]"
              :style="medalFor(it) ? medal?.vars : undefined"
            )
              img.reveal__medal(v-if="medalFor(it)" :src="medal?.src" alt="" draggable="false" decoding="async")
              template(v-else)
                span.reveal__star(aria-hidden="true")
                span.reveal__plate-ring
              template(v-if="it.kind === 'skin'")
                img.reveal__portrait(:src="modelImgPath(it.modelId)" alt="" draggable="false")
              template(v-else-if="it.kind === 'smasher'")
                img.reveal__portrait(:src="smasherPortrait(it)" alt="" draggable="false")
              IconCoin.reveal__icon(v-else-if="it.kind === 'coins'")
              IconDiamond.reveal__icon(v-else-if="it.kind === 'diamonds'")
              IconSpeed.reveal__icon.text-cream-50(v-else)
            div.reveal__label.game-text(v-if="it.kind === 'skin'")
              FRibbon.reveal__kicker(tone="berry" tag="span") {{ t('rewardReveal.newSmasher') }}
              span.reveal__rarity.ui-rarity-name.ui-slam(
                :class="`ui-rarity-name--${rarityOf(it)}`"
                :style="{ '--slam-delay': delayOf(i + 4) }"
              ) {{ t('rarity.' + rarityOf(it)) }}
              span.reveal__name {{ skinName(it.modelId) }}
            div.reveal__label.game-text(v-else-if="it.kind === 'smasher'")
              FRibbon.reveal__kicker(tone="berry" tag="span") {{ t('rewardReveal.newSmasher') }}
              span.reveal__rarity.ui-rarity-name.ui-slam(
                :class="`ui-rarity-name--${rarityOf(it)}`"
                :style="{ '--slam-delay': delayOf(i + 4) }"
              ) {{ t('rarity.' + rarityOf(it)) }}
              span.reveal__name {{ t('smasher_' + it.smasherId) }}
            div.reveal__label.game-text(v-else-if="it.kind === 'speed'")
              FRibbon.reveal__kicker(tone="berry" tag="span") {{ t('rewardReveal.speedBoost') }}
              span.reveal__amount {{ t('rewardReveal.minutes', { n: it.minutes }) }}
            div.reveal__label.game-text(v-else)
              //- Counts up from 0 once the prize has climbed out, ticking, and
              //- lands with a bump + ting. A claim-all shows ONE summed total.
              //- (The ticking digits are hidden from screen readers; the final
              //- amount is in the sr-only span, so a live region is not spammed.)
              span.reveal__amount(:class="it.kind === 'diamonds' ? 'is-diamonds' : 'is-coins'" aria-hidden="true")
                FCountUp(:value="it.amount" prefix="+" :delay="420 + i * 110" ting)
              span.sr-only +{{ n(it.amount) }}
              span.sr-only {{ it.kind === 'diamonds' ? t('rewardReveal.diamonds') : t('rewardReveal.coins') }}

        //- Claim-all: every skin side by side, scaled to fit (fitPrizeGrid).
        template(v-if="isMany")
          FRibbon.reveal__kicker.reveal__many-kicker(tone="berry" tag="span") {{ t('rewardReveal.newSmashers') }}
          ul.reveal__skins(:style="gridStyle")
            li.reveal__prize.reveal__skin(
              v-for="(it, j) in skins"
              :key="'s' + j"
              :style="{ animationDelay: delayOf(rowItems.length + j), '--tone': prizeTone(it) }"
              data-reveal-kind="skin"
            )
              div.reveal__plate.is-skin
                span.reveal__star(aria-hidden="true")
                img.reveal__portrait(v-if="it.kind === 'skin'" :src="modelImgPath(it.modelId)" alt="" draggable="false")
              div.reveal__label.game-text(v-if="it.kind === 'skin'")
                span.reveal__rarity.ui-rarity-name(:class="`ui-rarity-name--${rarityOf(it)}`") {{ t('rarity.' + rarityOf(it)) }}
                span.reveal__name {{ skinName(it.modelId) }}
</template>

<style scoped lang="sass">
.reveal
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  width: 100%
  min-height: min(52vh, 24rem)

  @media (orientation: landscape) and (max-height: 500px)
    min-height: 0

// ─── The gift ───────────────────────────────────────────────────────────────

.reveal__gift-slot
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.9rem
  transition: transform 420ms cubic-bezier(0.3, 0, 0.2, 1), opacity 420ms ease-out, height 420ms ease-out
  height: clamp(9rem, 30vmin, 13rem)

.reveal.is-open .reveal__gift-slot
  transform: translateY(18%) scale(0.55)
  opacity: 0.35
  height: clamp(4rem, 13vmin, 6rem)
  transition-delay: 200ms

.reveal__gift
  position: relative
  width: clamp(7rem, 26vmin, 11rem)
  aspect-ratio: 1
  cursor: pointer
  animation: gift-drop 0.6s cubic-bezier(0.2, 1.5, 0.4, 1) both, gift-wobble 1.3s ease-in-out 0.6s infinite
  transform-origin: 50% 90%

.reveal.is-open .reveal__gift
  animation: gift-jolt 480ms cubic-bezier(0.2, 1.5, 0.4, 1) both

// Tap: the box squashes under the finger before it bursts (the press reads
// even though the opening follows on the same tap).
.reveal:not(.is-open) .reveal__gift:active .reveal__box,
.reveal:not(.is-open) .reveal__gift.is-pressed .reveal__box
  transform: scale(1.08, 0.86)
  transform-origin: 50% 100%
  transition: transform 70ms ease-out

.reveal__gift:focus-visible
  outline: 3px solid var(--ui-focus)
  outline-offset: 6px
  border-radius: var(--radius-ui)

.reveal__box
  position: absolute
  left: 10%
  right: 10%
  bottom: 0
  height: 62%
  border-radius: 0.6rem
  background-color: var(--tone)
  box-shadow: inset 0 -0.6rem 0 rgba(22, 26, 64, 0.2), inset 0 0.35rem 0 rgba(255, 255, 255, 0.3), 0 0.35rem 0 var(--color-ink)
  border: 3px solid var(--color-ink)

.reveal__lid
  position: absolute
  left: 3%
  right: 3%
  top: 24%
  height: 20%
  border-radius: 0.5rem
  background-color: var(--tone)
  border: 3px solid var(--color-ink)
  box-shadow: inset 0 -0.35rem 0 rgba(22, 26, 64, 0.18), inset 0 0.3rem 0 rgba(255, 255, 255, 0.35)
  transform-origin: 20% 100%

// Anticipation: the lid rattles on the box just before it pops.
.reveal:not(.is-open) .reveal__lid
  animation: lid-rattle 0.5s linear 0.42s both

.reveal.is-open .reveal__lid
  animation: lid-fly 620ms cubic-bezier(0.15, 1.2, 0.35, 1) forwards

.reveal__band-v
  position: absolute
  left: 50%
  top: -3px
  bottom: -3px
  width: 22%
  transform: translateX(-50%)
  background-color: var(--color-berry-500)
  border-left: 3px solid var(--color-ink)
  border-right: 3px solid var(--color-ink)

.reveal__bow
  position: absolute
  left: 50%
  bottom: 100%
  width: 0
  height: 0

.reveal__loop
  position: absolute
  bottom: -0.2rem
  width: clamp(1.6rem, 6vmin, 2.6rem)
  height: clamp(1.2rem, 4.6vmin, 2rem)
  border-radius: 50% 50% 40% 40%
  background-color: var(--color-berry-500)
  border: 3px solid var(--color-ink)

  &.is-l
    right: 0
    transform: rotate(-24deg)
    transform-origin: 100% 100%
  &.is-r
    left: 0
    transform: rotate(24deg)
    transform-origin: 0 100%

.reveal__knot
  position: absolute
  left: -0.55rem
  bottom: -0.5rem
  width: 1.1rem
  height: 1rem
  border-radius: 0.35rem
  background-color: var(--color-berry-400)
  border: 3px solid var(--color-ink)

// Painted gift: the sprites replace the CSS shapes inside the same .reveal__box /
// .reveal__lid boxes, so the drop, wobble, squash, rattle and lid-fly all apply.
.reveal__art
  display: none

.reveal__gift.is-painted
  .reveal__box, .reveal__lid
    background: none
    border: 0
    border-radius: 0
    box-shadow: none
  .reveal__box
    left: calc((100% - var(--gift-box-w)) / 2)
    right: auto
    width: var(--gift-box-w)
    height: var(--gift-box-h)
  .reveal__lid
    top: auto
    left: calc((100% - var(--gift-lid-w)) / 2)
    right: auto
    bottom: var(--gift-lid-bottom)
    width: var(--gift-lid-w)
    height: var(--gift-lid-h)
    transform-origin: 20% 100%
  .reveal__band-v, .reveal__bow
    display: none
  .reveal__art
    display: block
    width: 100%
    height: 100%
    pointer-events: none
    user-select: none

.reveal__hint
  font-weight: 900
  text-transform: uppercase
  font-size: clamp(0.9rem, 3.4vmin, 1.4rem)
  letter-spacing: 0.03em
  animation: hint-pulse 1.1s ease-in-out infinite

// Shockwave: a solid flash disc and a solid ring travelling out.
.reveal__shock
  position: absolute
  left: 50%
  top: 50%
  width: 0
  height: 0
  z-index: 2
  pointer-events: none

.reveal__flash, .reveal__ring
  position: absolute
  left: 0
  top: 0
  width: clamp(8rem, 30vmin, 13rem)
  aspect-ratio: 1
  border-radius: 50%
  transform: translate(-50%, -50%) scale(0.2)
  opacity: 0

.reveal__flash
  background-color: var(--color-cream-50)
  animation: shock-flash 340ms ease-out forwards

.reveal__ring
  border: 0.5rem solid var(--burst, var(--color-cream-50))
  animation: shock-ring 700ms ease-out 60ms forwards

  // A second, later ring for skin reveals: the rarity "double boom".
  &.is-late
    border-width: 0.3rem
    animation: shock-ring 760ms ease-out 220ms forwards

// Skin inside: a faceted 14-point star in the rarest skin's colour blasts out
// behind the flash and fades (flat shape, transform/opacity only).
.reveal__burst
  position: absolute
  left: 0
  top: 0
  width: clamp(12rem, 52vmin, 22rem)
  aspect-ratio: 1
  background-color: var(--burst)
  background-image: var(--ui-facet)
  clip-path: polygon(50% 0, 60% 30%, 93% 21%, 72% 46%, 100% 64%, 66% 66%, 71% 100%, 50% 77%, 29% 100%, 34% 66%, 0 64%, 28% 46%, 7% 21%, 40% 30%)
  transform: translate(-50%, -50%) scale(0.1)
  opacity: 0
  animation: burst-blast 900ms cubic-bezier(0.15, 1.1, 0.35, 1) forwards

// ─── The prizes ─────────────────────────────────────────────────────────────

.reveal__prizes
  display: flex
  flex-wrap: wrap
  justify-content: center
  align-items: flex-start
  gap: clamp(0.8rem, 4vmin, 2rem)
  margin-top: clamp(-6rem, -14vmin, -3rem)
  position: relative
  z-index: 1

  @media (orientation: landscape) and (max-height: 500px)
    margin-top: -2.5rem

.reveal__prize
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.55rem
  max-width: 11rem
  animation: prize-rise 620ms cubic-bezier(0.16, 1.5, 0.32, 1) both

.reveal__plate
  position: relative
  display: flex
  align-items: center
  justify-content: center
  width: clamp(5rem, 22vmin, 8rem)
  aspect-ratio: 1
  border-radius: 50%
  background-color: var(--color-cream-100)
  border: 4px solid var(--color-ink)
  box-shadow: 0 0 0 0.45rem var(--tone), 0 0.55rem 0 0.45rem rgba(22, 26, 64, 0.45)

  .is-big &
    width: clamp(7rem, 34vmin, 11.5rem)

  &.is-skin
    background-color: var(--color-plum-300)
  &.is-diamonds
    background-color: var(--color-sky-200)
  &.is-speed
    background-color: var(--color-leaf-600)

// The prize stands on a turning flat star burst in the reward tone, with
// a two-tone facet — the Brawl "you got it" sticker, no glow.
.reveal__star
  position: absolute
  inset: -46%
  z-index: -1
  background-color: var(--tone)
  background-image: var(--ui-facet)
  clip-path: polygon(50% 0, 60% 30%, 93% 21%, 72% 46%, 100% 64%, 66% 66%, 71% 100%, 50% 77%, 29% 100%, 34% 66%, 0 64%, 28% 46%, 7% 21%, 40% 30%)
  opacity: 0.9
  animation: star-pop 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) 0.3s both, star-turn 9s linear 0.8s infinite

// Painted medallion (rewardMedalArt): its hole is laid exactly over the
// plate, the painted ring replaces the ink border + tone ring, the plate's own
// disc colour shows through the hole. Turns about the hole centre.
.reveal__plate.is-medal
  border-color: transparent
  box-shadow: none !important

.reveal__medal
  position: absolute
  left: var(--medal-x)
  top: var(--medal-y)
  width: var(--medal-w)
  height: var(--medal-h)
  max-width: none
  z-index: -1
  transform-origin: var(--medal-ox) var(--medal-oy)
  user-select: none
  pointer-events: none
  animation: star-pop 0.5s cubic-bezier(0.2, 1.5, 0.4, 1) 0.3s both, star-turn 24s linear 0.8s infinite

// A slow solid halo ring — the flat stand-in for a glow.
.reveal__plate-ring
  position: absolute
  inset: -1.1rem
  border-radius: 50%
  border: 0.3rem solid var(--tone)
  opacity: 0.45
  animation: halo 2.4s ease-in-out infinite

.reveal__icon
  width: 58%
  height: 58%
  filter: none

.reveal__portrait
  width: 92%
  height: 92%
  object-fit: contain
  user-select: none
  pointer-events: none

.reveal__label
  display: flex
  flex-direction: column
  align-items: center
  text-align: center
  line-height: 1.05

// "NEW SMASHER!" / "SPEED BOOST": a berry FRibbon (#UX1c — the one banner).
.reveal__kicker
  text-transform: uppercase
  font-size: clamp(0.7rem, 2.6vmin, 1rem)
  letter-spacing: 0.04em
  // The ribbon's tails hang 0.6 em below its face; let what follows tuck
  // under them instead of spending that height (landscape phones).
  margin-bottom: -0.35em

// The rarity tag ("EPIC") slams in under the kicker.
.reveal__rarity
  font-size: clamp(0.7rem, 2.6vmin, 0.95rem)
  margin-bottom: 0.3rem

.reveal__name
  color: var(--color-cream-50)
  font-weight: 900
  font-size: clamp(1.15rem, 5vmin, 2rem)

.reveal__amount
  color: var(--color-cream-50)

  &.is-coins
    color: var(--color-sun-300)
  &.is-diamonds
    color: var(--color-plum-300)
  font-weight: 900
  font-size: clamp(1.6rem, 7vmin, 3rem)
  text-shadow: var(--ui-stroke-xl)

.is-big .reveal__amount
  font-size: clamp(2rem, 9vmin, 3.6rem)

// ─── The beats ──────────────────────────────────────────────────────────────

@keyframes gift-drop
  0%
    opacity: 0
    transform: translateY(-60%) scale(0.7)
  100%
    opacity: 1
    transform: none

@keyframes gift-wobble
  0%, 100%
    transform: rotate(0deg) scale(1)
  20%
    transform: rotate(-5deg) scale(1.03, 0.97)
  40%
    transform: rotate(4deg) scale(0.98, 1.03)
  60%
    transform: rotate(0deg) scale(1)

@keyframes gift-jolt
  0%
    transform: scale(1)
  25%
    transform: scale(1.18, 0.8)
  60%
    transform: scale(0.94, 1.08)
  100%
    transform: scale(1)

@keyframes lid-rattle
  0%, 100%
    transform: none
  15%
    transform: translateY(-6%) rotate(-4deg)
  30%
    transform: translateY(0) rotate(3deg)
  45%
    transform: translateY(-9%) rotate(-5deg)
  60%
    transform: translateY(0) rotate(4deg)
  80%
    transform: translateY(-12%) rotate(-2deg)

@keyframes star-pop
  0%
    transform: scale(0) rotate(-90deg)
  100%
    transform: scale(1) rotate(0)

@keyframes star-turn
  to
    transform: rotate(360deg)

@keyframes lid-fly
  0%
    transform: none
  100%
    transform: translate(-30%, -150%) rotate(-38deg)
    opacity: 0

@keyframes shock-flash
  0%
    opacity: 0.9
    transform: translate(-50%, -50%) scale(0.3)
  100%
    opacity: 0
    transform: translate(-50%, -50%) scale(1.3)

@keyframes shock-ring
  0%
    opacity: 0.85
    transform: translate(-50%, -50%) scale(0.3)
  100%
    opacity: 0
    transform: translate(-50%, -50%) scale(1.9)

@keyframes burst-blast
  0%
    opacity: 1
    transform: translate(-50%, -50%) scale(0.1) rotate(-30deg)
  55%
    opacity: 0.95
  100%
    opacity: 0
    transform: translate(-50%, -50%) scale(1.25) rotate(12deg)

@keyframes prize-rise
  0%
    opacity: 0
    transform: translateY(55%) scale(0.2)
  60%
    opacity: 1
    transform: translateY(-6%) scale(1.08)
  100%
    opacity: 1
    transform: none

@keyframes halo
  0%, 100%
    transform: scale(1)
    opacity: 0.45
  50%
    transform: scale(1.07)
    opacity: 0.2

@keyframes hint-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.07)

// ─── Claim-all: summed currency row + a fitted row of skins ──────────────────
// The gift steps aside entirely (every pixel goes to the prizes), the currency
// row turns compact, and the skins sit on a grid whose plate size comes from
// fitPrizeGrid (--plate). Stars shrink so neighbours don't drown each other.
.reveal.is-many
  min-height: 0
  gap: 0.35rem

.reveal.is-open.is-many .reveal__gift-slot
  height: 0
  opacity: 0
  overflow: hidden

.reveal.is-many .reveal__prizes
  margin-top: 0.2rem

.reveal__prizes.is-compact
  gap: clamp(0.8rem, 6vmin, 2.5rem)
  .reveal__plate
    width: clamp(3.4rem, 13vmin, 5rem)
  .reveal__amount
    font-size: clamp(1.4rem, 5.5vmin, 2.3rem)
  .reveal__prize
    gap: 0.3rem

.reveal__many-kicker
  margin: 0.35rem 0 -0.2em
  animation: prize-rise 520ms cubic-bezier(0.16, 1.5, 0.32, 1) 260ms both

.reveal__skins
  display: grid
  justify-content: center
  gap: 10px
  margin: 0
  padding: 0
  list-style: none

.reveal__skin
  max-width: none
  gap: 0.3rem
  min-width: 0

  .reveal__plate
    width: var(--plate)
    border-width: 3px
    box-shadow: 0 0 0 calc(var(--plate) * 0.05) var(--tone), 0 calc(var(--plate) * 0.06) 0 calc(var(--plate) * 0.05) rgba(22, 26, 64, 0.45)

  .reveal__star
    inset: -22%

  .reveal__label
    width: calc(var(--plate) + 10px)

  .reveal__rarity
    font-size: clamp(0.55rem, calc(var(--plate) * 0.11), 0.8rem)
    margin-bottom: 0.15rem

  .reveal__name
    font-size: clamp(0.65rem, calc(var(--plate) * 0.15), 1.15rem)
    overflow-wrap: anywhere
    line-height: 1.05

@media (prefers-reduced-motion: reduce)
  .reveal__burst, .reveal__many-kicker
    animation: none
  .reveal__burst
    opacity: 0
  .reveal__gift, .reveal.is-open .reveal__gift, .reveal__hint, .reveal__plate-ring, .reveal__star, .reveal__medal, .reveal:not(.is-open) .reveal__lid
    animation: none
  .reveal.is-open .reveal__lid
    animation: none
    opacity: 0
  .reveal__flash, .reveal__ring
    animation: none
  .reveal__prize
    animation: prize-fade 220ms ease-out both

@keyframes prize-fade
  from
    opacity: 0
  to
    opacity: 1
</style>
