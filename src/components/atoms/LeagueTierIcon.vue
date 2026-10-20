<script lang="ts">
/** Page-wide instance counter (module scope, shared by every instance). */
let instanceSeq = 0
</script>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { isLowQuality } from '@/use/useQuality'
import {
  LEAGUE_TIER_META, championPosition, divisionNumeral, plaqueLabel, type LeagueDivision, type LeagueTier
} from '@/use/leagueTiers'

/**
 * ─── PvP league tier icon ───────────────────────────────────────────────────
 *
 * One drawn emblem per league tier (see `@/use/leagueTiers`), escalating in
 * material AND silhouette so a rank reads at a glance even at HUD size:
 *
 *   wood      round plank buckler, grain + knots, iron nails
 *   bronze    heater shield, hammered dents, rivets, one chevron
 *   silver    narrower shield + small 2-feather wings, polished band, 2 chevrons
 *   gold      arched shield + 3-feather wings, star crest, filigree, shimmer
 *   platinum  spiked tiara crest + blade wings, sapphire + side gems, sparkle
 *   diamond   the emblem IS a faceted brilliant, crystal shards, glints
 *   champion  flame behind, laurel wreath, crowned crimson medallion, star
 *
 * ── Technique ──
 * Inline SVG, the same way the other drawn UI emblems in the game are built
 * (RankBadge): vector, so it is crisp at 24px and at 256px on
 * any DPR with nothing to cache, and it costs no request. No SVG filters and no
 * blur anywhere (Firefox): depth is an offset "thickness" copy of the
 * silhouette and a hard ink contour, the game's own hard-shadow look.
 *
 * ── Level of detail ──
 * Below 40px the fine work (grain, dents, rivets, filigree, small gems) would
 * only turn into noise, so the icon switches to a COMPACT drawing: the same
 * silhouettes and materials, a heavier contour, the detail dropped.
 *
 * ── Motion ──
 * Gold and up carry a subtle idle animation (a light sweep; sparkles; the
 * champion flame). Transform/opacity only. It is off at compact size, on the
 * low render-quality tier (`FX.low`), with `animated: false`, and under
 * prefers-reduced-motion — the icon then stands still, never disappears.
 */

const props = withDefaults(defineProps<{
  tier: LeagueTier
  /** Rendered size in CSS px (the icon is square). */
  size?: number
  /** Optional division I–III (1 = top). Ignored for Champion. */
  division?: LeagueDivision | null
  /** Champion only: leaderboard position (`12` or `'#12'`), shown as `#12` on
   *  the plaque. Every other tier ignores it. */
  position?: number | string | null
  /** Allow the idle animation (still subject to quality + reduced motion). */
  animated?: boolean
}>(), { size: 48, division: null, position: null, animated: true })

const { t } = useI18n()

// SVG ids are document-global: every instance needs its own, or removing one
// icon would break the gradients of every other icon on the page.
// `useId` is unique per app only, so a page-wide counter rides along (a second
// app — a portal overlay, a test mount — would otherwise reuse `v-0`).
const uid = `lti${++instanceSeq}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const id = (k: string) => `${uid}-${k}`
const url = (k: string) => `url(#${uid}-${k})`

const meta = computed(() => LEAGUE_TIER_META[props.tier])
const compact = computed(() => props.size < 40)
const isStatic = computed(() => !props.animated || !meta.value.animated || compact.value || isLowQuality.value)
/** Contour weight in viewBox units (the box is 100 wide). */
const sw = computed(() => (compact.value ? 4.2 : 2.4))
const numeral = computed(() => divisionNumeral(props.tier, props.division))
const pos = computed(() => championPosition(props.tier, props.position))
const pips = computed(() => (props.division && numeral.value ? 4 - props.division : 0))

const tierName = computed(() => t(meta.value.nameKey))
const ariaLabel = computed(() => {
  const tier = tierName.value
  if (pos.value) return t('league.tierPosition', { tier, position: pos.value })
  if (numeral.value) return t('league.tierDivision', { tier, division: numeral.value })
  return tier
})

// ─── Plaque (division numeral / champion position) ──────────────────────────
// Deliberately small and low: it sits on the very tip of the emblem, so it
// only nicks the point instead of hiding it. Width follows the label, so
// `III` stays a tight chip and `#1234` still fits; anything longer is squeezed
// into the widest plaque with textLength rather than spilling out.
const PLAQUE = { y: 87.5, h: 11.5, font: 8.6, pad: 3.6, minW: 17, maxW: 54 }
/** Bold system-ui advance widths in em — close enough to size a chip. */
const advance = (ch: string) => (ch === 'I' ? 0.34 : ch === '#' ? 0.66 : 0.62)
const plaque = computed(() => {
  const label = plaqueLabel(props.tier, props.division, props.position)
  if (!label) return null
  const natural = [...label].reduce((w, ch) => w + advance(ch) * PLAQUE.font, 0)
  const room = PLAQUE.maxW - PLAQUE.pad * 2
  const w = Math.min(PLAQUE.maxW, Math.max(PLAQUE.minW, natural + PLAQUE.pad * 2))
  return { label, x: 50 - w / 2, w, fit: natural > room ? room : null }
})

// ─── Geometry ────────────────────────────────────────────────────────────────

const star = (cx: number, cy: number, R: number, r: number, n = 5): string => {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const rad = i % 2 ? r : R
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`)
  }
  return pts.join(' ')
}

const SPARKLE = 'M0 -5 L1.1 -1.1 L5 0 L1.1 1.1 L0 5 L-1.1 1.1 L-5 0 L-1.1 -1.1 Z'

const WOOD_NAILS = [45, 135, 225, 315].map((deg) => {
  const a = (deg * Math.PI) / 180
  return { x: 50 + Math.cos(a) * 34.5, y: 51 + Math.sin(a) * 34.5 }
})

/** Hammer dents: a light crescent up-left and a dark one down-right each. */
const BRONZE_DENTS = [
  [30, 28, 3.2], [44, 25, 2.6], [58, 27, 3.4], [71, 31, 2.8], [27, 42, 2.8], [73, 46, 3],
  [36, 38, 2.2], [64, 40, 2.4], [30, 60, 3], [70, 60, 2.6], [42, 74, 2.8], [58, 76, 2.4], [50, 84, 2]
].map(([x, y, r]) => ({ x: x as number, y: y as number, r: r as number }))

const BRONZE_RIVETS = [
  [24, 21], [37, 21], [50, 21], [63, 21], [76, 21], [23, 34], [77, 34], [24, 50], [76, 50], [30, 67], [70, 67], [40, 80], [60, 80]
].map(([x, y]) => ({ x: x as number, y: y as number }))

const GOLD_CREST = star(50, 11, 10, 4.4)
const GOLD_STAR = star(50, 53, 14, 6.2)
const CHAMP_STAR = star(50, 59, 11, 4.8)

/** Laurel: a leaf with its base at the origin, pointing along +x. */
const LEAF = 'M0 0C3 -3.4 8 -4 12 -0.6C8 2.6 3 2.8 0 0Z'

/** Leaf pairs along the left branch (the right one is its mirror), from the
 *  bottom of the wreath up round the medallion: one leaf tilted outward, one
 *  inward, each pointing up the branch. Shrinking toward the tip. */
const LAUREL = (() => {
  const leaves: { x: number; y: number; rot: number }[] = []
  for (let i = 0; i < 6; i++) {
    const deg = 110 + i * 21
    const a = (deg * Math.PI) / 180
    const x = 50 + Math.cos(a) * 34
    const y = 58 + Math.sin(a) * 34
    const up = deg + 90 // tangent, pointing up the branch
    leaves.push({ x, y, rot: up - 30 }, { x, y, rot: up + 26 })
  }
  return leaves
})()
</script>

<template lang="pug">
  svg.lti(
    :class="[`lti--${tier}`, { 'lti--static': isStatic, 'lti--compact': compact }]"
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
    role="img"
    :aria-label="ariaLabel"
    xmlns="http://www.w3.org/2000/svg"
  )
    //- ═══ WOOD ═══════════════════════════════════════════════════════════════
    g(v-if="tier === 'wood'")
      defs
        linearGradient(:id="id('body')")
          stop(offset="0" stop-color="#9c6331")
        linearGradient(:id="id('boss')")
          stop(offset="0" stop-color="#d6a16a")
        clipPath(:id="id('clip')")
          circle(cx="50" cy="51" r="37")
      circle(cx="50" cy="54.5" r="38" fill="#3a1f0b")
      circle(cx="50" cy="51" r="38" :fill="url('body')")
      g(:clip-path="url('clip')")
        //- planks
        path(d="M31 8V96M50 8V96M69 8V96" stroke="#161a40" :stroke-width="compact ? 2.4 : 1.6" fill="none")
        template(v-if="!compact")
          //- grain
          path(
            d="M22 20C20 34 25 44 22 56C19 68 24 78 22 90M40 14C38 28 44 38 41 50C38 62 43 74 40 90M59 14C57 26 62 36 60 48C58 62 63 74 60 90M78 20C76 32 80 44 78 56C76 68 80 78 78 86"
            stroke="#6a3c17" stroke-width="1" fill="none" opacity="0.75"
          )
          path(
            d="M25 28C24 38 27 46 26 54M45 22C44 32 47 40 46 48M55 60C54 68 57 76 56 84M73 30C72 40 75 48 74 58"
            stroke="#c48a52" stroke-width="0.8" fill="none" opacity="0.6"
          )
          //- knots
          ellipse(cx="40" cy="71" rx="3" ry="4.2" fill="#5a3212" stroke="#161a40" stroke-width="0.8")
          ellipse(cx="61" cy="30" rx="2.4" ry="3.4" fill="#5a3212" stroke="#161a40" stroke-width="0.8")
          //- a split in the plank
          path(d="M66 70L63 76L65 80L62 86" stroke="#161a40" stroke-width="1.1" fill="none" stroke-linecap="round")
      //- dark band round the rim
      circle(cx="50" cy="51" r="34" fill="none" stroke="#4a2a10" :stroke-width="compact ? 6 : 5")
      circle(v-if="!compact" cx="50" cy="51" r="31.2" fill="none" stroke="#c48a52" stroke-width="0.8" opacity="0.5")
      template(v-if="!compact")
        g(v-for="(n, i) in WOOD_NAILS" :key="i")
          circle(:cx="n.x" :cy="n.y" r="2.3" fill="#3b3a40" stroke="#161a40" stroke-width="0.8")
          circle(:cx="n.x - 0.7" :cy="n.y - 0.7" r="0.8" fill="#c9c6cf")
      circle(cx="50" cy="51" r="38" fill="none" stroke="#161a40" :stroke-width="sw")
      //- centre boss
      circle(cx="50" cy="51" :r="compact ? 11 : 10" :fill="url('boss')" stroke="#161a40" :stroke-width="sw * 0.8")
      path(v-if="!compact" d="M44 47A7 7 0 0 1 51 44" stroke="#f0c48e" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.8")
      path(d="M24 30A32 32 0 0 1 44 17" stroke="#f3cf9e" :stroke-width="compact ? 3 : 2" fill="none" stroke-linecap="round" opacity="0.45")

    //- ═══ BRONZE ═════════════════════════════════════════════════════════════
    g(v-else-if="tier === 'bronze'")
      defs
        linearGradient(:id="id('body')" x1="0" y1="0" x2="0.35" y2="1")
          stop(offset="0" stop-color="#cf7f3b")
        linearGradient(:id="id('emb')" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#ffd2a1")
        clipPath(:id="id('clip')")
          path(d="M18 16H82V44C82 67 68 83 50 94C32 83 18 67 18 44Z")
      path(d="M18 19H82V47C82 70 68 86 50 97C32 86 18 70 18 47Z" fill="#43200a")
      path(d="M18 16H82V44C82 67 68 83 50 94C32 83 18 67 18 44Z" :fill="url('body')")
      g(v-if="!compact" :clip-path="url('clip')")
        g(v-for="(d, i) in BRONZE_DENTS" :key="i")
          circle(:cx="d.x - d.r * 0.3" :cy="d.y - d.r * 0.3" :r="d.r" fill="#ffe0bd" opacity="0.28")
          circle(:cx="d.x + d.r * 0.3" :cy="d.y + d.r * 0.3" :r="d.r * 0.8" fill="#5e2c0c" opacity="0.28")
      //- bevel
      path(
        d="M18 16H82V44C82 67 68 83 50 94C32 83 18 67 18 44Z"
        transform="translate(50 52) scale(0.84) translate(-50 -52)"
        fill="none" stroke="#6e3610" :stroke-width="compact ? 3 : 2"
      )
      path(
        v-if="!compact"
        d="M18 16H82V44C82 67 68 83 50 94C32 83 18 67 18 44Z"
        transform="translate(50 52) scale(0.8) translate(-50 -52)"
        fill="none" stroke="#ffc996" stroke-width="0.9" opacity="0.7"
      )
      template(v-if="!compact")
        g(v-for="(r, i) in BRONZE_RIVETS" :key="i")
          circle(:cx="r.x" :cy="r.y" r="1.7" fill="#8a4818" stroke="#161a40" stroke-width="0.6")
          circle(:cx="r.x - 0.5" :cy="r.y - 0.5" r="0.6" fill="#ffe2c2")
      path(d="M18 16H82V44C82 67 68 83 50 94C32 83 18 67 18 44Z" fill="none" stroke="#161a40" :stroke-width="sw" stroke-linejoin="round")
      //- one chevron
      path(d="M31 42L50 58L69 42V53L50 69L31 53Z" :fill="url('emb')" stroke="#161a40" :stroke-width="sw * 0.75" stroke-linejoin="round")
      path(v-if="!compact" d="M33 44L50 58.5L67 44" stroke="#fff0dc" stroke-width="1" fill="none" opacity="0.7")
      path(d="M22 20H48" stroke="#ffe4c4" :stroke-width="compact ? 3 : 1.8" stroke-linecap="round" opacity="0.6")

    //- ═══ SILVER ═════════════════════════════════════════════════════════════
    g(v-else-if="tier === 'silver'")
      defs
        linearGradient(:id="id('body')" x1="0" y1="0" x2="0.3" y2="1")
          stop(offset="0" stop-color="#c3ccd8")
        linearGradient(:id="id('wing')" x1="1" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#e2e7ee")
        clipPath(:id="id('clip')")
          path(d="M26 18H74V46C74 66 63 80 50 91C37 80 26 66 26 46Z")
      //- wings (left, then mirrored right)
      g(v-for="m in ['', 'matrix(-1 0 0 1 100 0)']" :key="m" :transform="m || undefined")
        path(d="M29 26C19 20 10 21 2 27C9 32 18 35 29 38Z" :fill="url('wing')" stroke="#161a40" :stroke-width="sw * 0.8" stroke-linejoin="round")
        path(d="M29 38C19 37 10 41 5 49C13 50 21 50 29 50Z" :fill="url('wing')" stroke="#161a40" :stroke-width="sw * 0.8" stroke-linejoin="round")
        path(v-if="!compact" d="M26 29C18 26 12 26 7 28M26 42C19 42 14 44 10 47" stroke="#ffffff" stroke-width="0.9" fill="none" opacity="0.8")
      path(d="M26 21H74V49C74 69 63 83 50 94C37 83 26 69 26 49Z" fill="#2c3440")
      path(d="M26 18H74V46C74 66 63 80 50 91C37 80 26 66 26 46Z" :fill="url('body')")
      //- polished: a hard diagonal reflection band
      g(:clip-path="url('clip')")
        path(d="M26 70L74 58V91H26Z" fill="#48525f" opacity="0.18")
      path(
        v-if="!compact"
        d="M26 18H74V46C74 66 63 80 50 91C37 80 26 66 26 46Z"
        transform="translate(50 52) scale(0.84) translate(-50 -52)"
        fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.85"
      )
      path(d="M26 18H74V46C74 66 63 80 50 91C37 80 26 66 26 46Z" fill="none" stroke="#161a40" :stroke-width="sw" stroke-linejoin="round")
      //- two chevrons
      g(fill="#f5f8fc" stroke="#161a40" :stroke-width="sw * 0.7" stroke-linejoin="round")
        path(d="M35 38L50 50L65 38V46L50 58L35 46Z")
        path(d="M35 52L50 64L65 52V60L50 72L35 60Z")

    //- ═══ GOLD ═══════════════════════════════════════════════════════════════
    g(v-else-if="tier === 'gold'")
      defs
        linearGradient(:id="id('body')" x1="0" y1="0" x2="0.3" y2="1")
          stop(offset="0" stop-color="#ffd24a")
        linearGradient(:id="id('wing')" x1="1" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#fff2a6")
        linearGradient(:id="id('star')" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#fffbe0")
        linearGradient(:id="id('shine')" x1="0" y1="0" x2="1" y2="0")
          stop(offset="0" stop-color="#ffffff" stop-opacity="0.35")
        clipPath(:id="id('clip')")
          path(d="M24 22C36 22 44 19 50 15C56 19 64 22 76 22V48C76 68 64 82 50 92C36 82 24 68 24 48Z")
      g(v-for="m in ['', 'matrix(-1 0 0 1 100 0)']" :key="m" :transform="m || undefined")
        path(d="M27 27C17 18 8 16 0 18C5 27 14 32 27 37Z" :fill="url('wing')" stroke="#161a40" :stroke-width="sw * 0.8" stroke-linejoin="round")
        path(d="M27 37C17 33 8 35 2 42C10 46 18 47 27 48Z" :fill="url('wing')" stroke="#161a40" :stroke-width="sw * 0.8" stroke-linejoin="round")
        path(d="M27 48C19 48 12 52 7 59C15 59 21 58 28 57Z" :fill="url('wing')" stroke="#161a40" :stroke-width="sw * 0.8" stroke-linejoin="round")
        path(v-if="!compact" d="M24 29C17 24 11 22 6 22M24 41C18 40 12 40 8 42M25 52C20 52 16 54 12 56" stroke="#fffbe0" stroke-width="0.9" fill="none" opacity="0.85")
      path(d="M24 25C36 25 44 22 50 18C56 22 64 25 76 25V51C76 71 64 85 50 95C36 85 24 71 24 51Z" fill="#4a2900")
      path(d="M24 22C36 22 44 19 50 15C56 19 64 22 76 22V48C76 68 64 82 50 92C36 82 24 68 24 48Z" :fill="url('body')")
      g(:clip-path="url('clip')")
        //- filigree scrollwork
        g(v-if="!compact" fill="none" stroke-linecap="round")
          g(v-for="m in ['', 'matrix(-1 0 0 1 100 0)']" :key="m" :transform="m || undefined" stroke="#9a5a00" stroke-width="1.1")
            path(d="M30 30C34 26 40 28 39 33C38 36 34 36 34 33")
            path(d="M29 44C27 52 29 60 34 66C36 69 40 69 40 66C40 63 37 63 36 65")
            path(d="M36 76C40 80 45 82 50 83")
            path(d="M42 27C44 24 47 23 50 24")
          g(v-for="m in ['', 'matrix(-1 0 0 1 100 0)']" :key="'l' + m" :transform="m || undefined" stroke="#fff4c0" stroke-width="0.6" opacity="0.9")
            path(d="M30 29.3C34 25.3 40 27.3 39 32.3")
            path(d="M28.4 44C26.4 52 28.4 60 33.4 66")
        g.lti__shimmer(v-if="!isStatic")
          rect(x="-30" y="0" width="22" height="100" :fill="url('shine')" transform="skewX(-18)")
      path(
        v-if="!compact"
        d="M24 22C36 22 44 19 50 15C56 19 64 22 76 22V48C76 68 64 82 50 92C36 82 24 68 24 48Z"
        transform="translate(50 52) scale(0.86) translate(-50 -52)"
        fill="none" stroke="#fff3b0" stroke-width="1" opacity="0.8"
      )
      path(d="M24 22C36 22 44 19 50 15C56 19 64 22 76 22V48C76 68 64 82 50 92C36 82 24 68 24 48Z" fill="none" stroke="#161a40" :stroke-width="sw" stroke-linejoin="round")
      //- crest star + central star
      polygon(:points="GOLD_CREST" :fill="url('star')" stroke="#161a40" :stroke-width="sw * 0.75" stroke-linejoin="round")
      polygon(:points="GOLD_STAR" fill="#fff8d6" stroke="#161a40" :stroke-width="sw * 0.8" stroke-linejoin="round")
      polygon(:points="GOLD_STAR" :fill="url('star')" transform="translate(50 53) scale(0.62) translate(-50 -53)")
      g.lti__sparkle(v-if="!compact" transform="translate(66 30)")
        path(:d="SPARKLE" fill="#ffffff")

    //- ═══ PLATINUM ═══════════════════════════════════════════════════════════
    g(v-else-if="tier === 'platinum'")
      defs
        linearGradient(:id="id('body')" x1="0" y1="0" x2="0.35" y2="1")
          stop(offset="0" stop-color="#cbd6f0")
        linearGradient(:id="id('wing')" x1="1" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#e6ecfa")
        linearGradient(:id="id('gem')" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#13a3f2")
        linearGradient(:id="id('shine')" x1="0" y1="0" x2="1" y2="0")
          stop(offset="0" stop-color="#ffffff" stop-opacity="0.35")
        clipPath(:id="id('clip')")
          path(d="M22 28L32 22L36 10L43 20L50 4L57 20L64 10L68 22L78 28V50C78 70 65 83 50 94C35 83 22 70 22 50Z")
      //- blade wings
      g(v-for="m in ['', 'matrix(-1 0 0 1 100 0)']" :key="m" :transform="m || undefined")
        path(d="M25 34L1 22L9 35L0 41L11 46L4 55L25 57Z" :fill="url('wing')" stroke="#161a40" :stroke-width="sw * 0.8" stroke-linejoin="round")
        path(v-if="!compact" d="M24 36L6 26M24 45L6 42M24 53L10 51" stroke="#ffffff" stroke-width="0.9" fill="none" opacity="0.9")
      path(d="M22 31L32 25L36 13L43 23L50 7L57 23L64 13L68 25L78 31V53C78 73 65 86 50 97C35 86 22 73 22 53Z" fill="#262c47")
      path(d="M22 28L32 22L36 10L43 20L50 4L57 20L64 10L68 22L78 28V50C78 70 65 83 50 94C35 83 22 70 22 50Z" :fill="url('body')")
      g(:clip-path="url('clip')")
        path(d="M22 72L78 60V96H22Z" fill="#4b5578" opacity="0.18")
        //- engraved inner border
        path(
          v-if="!compact"
          d="M22 28L32 22L36 10L43 20L50 4L57 20L64 10L68 22L78 28V50C78 70 65 83 50 94C35 83 22 70 22 50Z"
          transform="translate(50 54) scale(0.84) translate(-50 -54)"
          fill="none" stroke="#7680a6" stroke-width="1.2"
        )
        path(
          v-if="!compact"
          d="M22 28L32 22L36 10L43 20L50 4L57 20L64 10L68 22L78 28V50C78 70 65 83 50 94C35 83 22 70 22 50Z"
          transform="translate(50 54.8) scale(0.84) translate(-50 -54.8)"
          fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.9"
        )
        g.lti__shimmer(v-if="!isStatic")
          rect(x="-30" y="0" width="22" height="100" :fill="url('shine')" transform="skewX(-18)")
      path(d="M22 28L32 22L36 10L43 20L50 4L57 20L64 10L68 22L78 28V50C78 70 65 83 50 94C35 83 22 70 22 50Z" fill="none" stroke="#161a40" :stroke-width="sw" stroke-linejoin="round")
      //- sapphire: a faceted hexagon
      g(stroke-linejoin="round")
        polygon(points="50,40 62,47 62,61 50,68 38,61 38,47" :fill="url('gem')" stroke="#161a40" :stroke-width="sw * 0.8")
        template(v-if="!compact")
          polygon(points="50,47 56,50.5 56,57.5 50,61 44,57.5 44,50.5" fill="#5aa8ff")
          polygon(points="50,40 62,47 56,50.5 50,47" fill="#b8e2ff")
          polygon(points="38,47 50,40 50,47 44,50.5" fill="#d9f0ff")
          polygon(points="38,61 44,57.5 50,61 50,68" fill="#1a3fb8")
          polygon(points="62,61 50,68 50,61 56,57.5" fill="#0f2a86")
          polygon(points="46,49 50,47 51,48.5 47,50.5" fill="#ffffff" opacity="0.9")
        //- side gems + crown gem
        template(v-if="!compact")
          circle(cx="32" cy="42" r="3.6" fill="#36e0ff" stroke="#161a40" stroke-width="1.2")
          circle(cx="68" cy="42" r="3.6" fill="#36e0ff" stroke="#161a40" stroke-width="1.2")
          circle(cx="31" cy="41" r="1.2" fill="#ffffff")
          circle(cx="67" cy="41" r="1.2" fill="#ffffff")
          circle(cx="50" cy="15" r="2.6" fill="#8fd3ff" stroke="#161a40" stroke-width="1")
          circle(cx="50" cy="78" r="3" fill="#36e0ff" stroke="#161a40" stroke-width="1.2")
      g.lti__sparkle(v-if="!compact" transform="translate(57 44)")
        path(:d="SPARKLE" fill="#ffffff")
      g.lti__sparkle.lti__sparkle--b(v-if="!compact" transform="translate(30 30) scale(0.7)")
        path(:d="SPARKLE" fill="#ffffff")

    //- ═══ DIAMOND ════════════════════════════════════════════════════════════
    g(v-else-if="tier === 'diamond'")
      defs
        linearGradient(:id="id('shine')" x1="0" y1="0" x2="1" y2="0")
          stop(offset="0" stop-color="#ffffff" stop-opacity="0.35")
        clipPath(:id="id('clip')")
          path(d="M14 38L30 16H70L86 38L50 95Z")
      //- crystal shards behind
      g(stroke="#161a40" :stroke-width="sw * 0.7" stroke-linejoin="round")
        polygon(points="3,46 13,30 23,48 12,72" fill="#7fe3ff")
        polygon(points="13,30 23,48 12,72" fill="#3aa8e8")
        polygon(points="97,46 87,30 77,48 88,72" fill="#7fe3ff")
        polygon(points="87,30 77,48 88,72" fill="#3aa8e8")
        polygon(points="50,1 57,12 50,20 43,12" fill="#c8f6ff")
        polygon(points="50,1 57,12 50,20" fill="#7fd6f6")
      path(d="M14 41L30 19H70L86 41L50 98Z" fill="#0c2a6e")
      //- facets
      g(stroke-linejoin="round")
        polygon(points="14,38 30,16 38,38" fill="#5ad2f4")
        polygon(points="30,16 50,16 38,38" fill="#b4f3ff")
        polygon(points="50,16 62,38 38,38" fill="#eafcff")
        polygon(points="50,16 70,16 62,38" fill="#9ae6fb")
        polygon(points="70,16 86,38 62,38" fill="#2e9be0")
        polygon(points="14,38 38,38 50,95" fill="#3fb6ee")
        polygon(points="38,38 62,38 50,95" fill="#8fe2fb")
        polygon(points="62,38 86,38 50,95" fill="#1d5fcf")
        template(v-if="!compact")
          polygon(points="38,38 50,95 44,38" fill="#6fd0f6")
          polygon(points="56,38 50,95 62,38" fill="#4aa8ec")
          polygon(points="14,38 26,38 50,95" fill="#2a8fd8" opacity="0.7")
          polygon(points="74,38 86,38 50,95" fill="#153f9e" opacity="0.8")
        g(v-if="!compact" stroke="#ffffff" stroke-width="0.7" opacity="0.75" fill="none")
          path(d="M30 16L38 38L50 16L62 38L70 16M14 38H86M38 38L50 95L62 38")
      g(:clip-path="url('clip')")
        g.lti__shimmer(v-if="!isStatic")
          rect(x="-30" y="0" width="22" height="100" :fill="url('shine')" transform="skewX(-18)")
      path(d="M14 38L30 16H70L86 38L50 95Z" fill="none" stroke="#161a40" :stroke-width="sw" stroke-linejoin="round")
      g.lti__sparkle(v-if="!compact" transform="translate(52 27)")
        path(:d="SPARKLE" fill="#ffffff")
      g.lti__sparkle.lti__sparkle--b(v-if="!compact" transform="translate(28 30) scale(0.75)")
        path(:d="SPARKLE" fill="#ffffff")
      g.lti__sparkle.lti__sparkle--c(v-if="!compact" transform="translate(66 58) scale(0.6)")
        path(:d="SPARKLE" fill="#ffffff")

    //- ═══ CHAMPION ═══════════════════════════════════════════════════════════
    g(v-else)
      defs
        linearGradient(:id="id('flame')" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#ff8a18")
        linearGradient(:id="id('flameIn')" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#fffbe0")
        linearGradient(:id="id('disc')")
          stop(offset="0" stop-color="#c3154d")
        linearGradient(:id="id('gold')" x1="0" y1="0" x2="0.3" y2="1")
          stop(offset="0" stop-color="#ffd24a")
        linearGradient(:id="id('shine')" x1="0" y1="0" x2="1" y2="0")
          stop(offset="0" stop-color="#ffffff" stop-opacity="0.35")
        clipPath(:id="id('clip')")
          circle(cx="50" cy="59" r="22")
          path(d="M30 38L27 17L39 27L50 9L61 27L73 17L70 38Z")
      //- flame behind everything
      g.lti__flame
        path(
          d="M16 64C5 52 3 32 9 14C13 23 17 27 22 29C20 18 25 10 32 2C33 13 38 19 42 21C42 12 46 6 50 0C54 6 58 12 58 21C62 19 67 13 68 2C75 10 80 18 78 29C83 27 87 23 91 14C97 32 95 52 84 64Z"
          :fill="url('flame')" stroke="#161a40" :stroke-width="sw * 0.7" stroke-linejoin="round"
        )
        path(
          v-if="!compact"
          d="M16 64C5 52 3 32 9 14C13 23 17 27 22 29C20 18 25 10 32 2C33 13 38 19 42 21C42 12 46 6 50 0C54 6 58 12 58 21C62 19 67 13 68 2C75 10 80 18 78 29C83 27 87 23 91 14C97 32 95 52 84 64Z"
          transform="translate(50 64) scale(0.66 0.72) translate(-50 -64)"
          :fill="url('flameIn')" opacity="0.9"
        )
      //- laurel wreath: two branches round the medallion
      g(v-for="m in ['', 'matrix(-1 0 0 1 100 0)']" :key="m" :transform="m || undefined")
        path(d="M46 93A34 34 0 0 1 22 38" fill="none" stroke="#6b3d00" :stroke-width="compact ? 3.2 : 2" stroke-linecap="round")
        path(
          v-for="(l, i) in LAUREL" :key="i"
          :d="LEAF"
          :transform="`translate(${l.x} ${l.y}) rotate(${l.rot})`"
          :fill="url('gold')" stroke="#161a40" :stroke-width="sw * 0.5" stroke-linejoin="round"
        )
      //- medallion
      circle(cx="50" cy="62" r="25" fill="#161a40")
      circle(cx="50" cy="59" r="25" :fill="url('gold')" stroke="#161a40" :stroke-width="sw")
      circle(cx="50" cy="59" r="19.5" :fill="url('disc')" stroke="#161a40" :stroke-width="sw * 0.7")
      circle(v-if="!compact" cx="50" cy="59" r="22.2" fill="none" stroke="#fff4c0" stroke-width="0.8" opacity="0.8")
      polygon(:points="CHAMP_STAR" :fill="url('gold')" stroke="#161a40" :stroke-width="sw * 0.7" stroke-linejoin="round")
      path(v-if="!compact" d="M36 52A15 15 0 0 1 46 44" stroke="#ffc0d2" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7")
      //- crown
      path(d="M30 38L27 17L39 27L50 9L61 27L73 17L70 38Z" :fill="url('gold')" stroke="#161a40" :stroke-width="sw" stroke-linejoin="round")
      rect(x="29" y="33" width="42" height="6" rx="1.5" fill="#c77d06" stroke="#161a40" :stroke-width="sw * 0.7")
      template(v-if="!compact")
        circle(cx="40" cy="36" r="1.7" fill="#36e0ff")
        circle(cx="50" cy="36" r="2" fill="#ff3b6b")
        circle(cx="60" cy="36" r="1.7" fill="#36e0ff")
        path(d="M31 19L33 32M50 13V30" stroke="#fffbe0" stroke-width="1" opacity="0.8")
      circle(cx="27" cy="17" :r="compact ? 3.6 : 3" fill="#ff3b6b" stroke="#161a40" :stroke-width="sw * 0.55")
      circle(cx="50" cy="9" :r="compact ? 4 : 3.4" fill="#36e0ff" stroke="#161a40" :stroke-width="sw * 0.55")
      circle(cx="73" cy="17" :r="compact ? 3.6 : 3" fill="#ff3b6b" stroke="#161a40" :stroke-width="sw * 0.55")
      g(:clip-path="url('clip')")
        g.lti__shimmer(v-if="!isStatic")
          rect(x="-30" y="0" width="22" height="100" :fill="url('shine')" transform="skewX(-18)")
      g.lti__sparkle(v-if="!compact" transform="translate(64 47)")
        path(:d="SPARKLE" fill="#ffffff")
      g.lti__sparkle.lti__sparkle--b(v-if="!compact" transform="translate(38 20) scale(0.7)")
        path(:d="SPARKLE" fill="#ffffff")

    //- ═══ Division / Champion position ═════════════════════════════════════
    //- A small plaque on the emblem's tip at full size: the numeral, or `#12`
    //- for Champion. Pips at compact size, where a numeral would be three
    //- unreadable strokes (a position has no compact form — the aria-label
    //- still carries it).
    g.lti__division(v-if="plaque && !compact" :class="{ 'lti__division--position': pos }")
      rect(:x="plaque.x" :y="PLAQUE.y" :width="plaque.w" :height="PLAQUE.h" rx="3.2" fill="#10164f" stroke="#161a40" stroke-width="1.3")
      rect(:x="plaque.x + 1.2" :y="PLAQUE.y + 1.2" :width="plaque.w - 2.4" :height="PLAQUE.h - 2.4" rx="2.3" fill="none" :stroke="meta.accent" stroke-width="0.9")
      text(
        x="50" :y="PLAQUE.y + PLAQUE.h / 2 + PLAQUE.font * 0.36" text-anchor="middle"
        :font-size="PLAQUE.font" font-weight="900" fill="#ffffff"
        font-family="Nunito, system-ui, sans-serif"
        :textLength="plaque.fit ?? undefined"
        :lengthAdjust="plaque.fit ? 'spacingAndGlyphs' : undefined"
      ) {{ plaque.label }}
    g.lti__division(v-else-if="pips")
      rect(:x="50 - pips * 6 - 2" y="86" :width="pips * 12 + 4" height="13" rx="6.5" fill="#10164f" stroke="#161a40" stroke-width="1.5")
      circle(
        v-for="p in pips" :key="p"
        :cx="50 - pips * 6 + (p - 0.5) * 12" cy="92.5" r="4"
        :fill="meta.accent"
      )
</template>

<style scoped lang="sass">
.lti
  display: inline-block
  flex: 0 0 auto
  overflow: visible
  vertical-align: middle

// Every animated part scales/moves about its own box, never the SVG origin.
.lti__shimmer,
.lti__sparkle path,
.lti__flame
  transform-box: fill-box

// A soft flat light band sweeping across: transform only, once every few seconds.
.lti__shimmer
  animation: lti-shimmer 3.6s ease-in-out 0.6s infinite

.lti--platinum .lti__shimmer
  animation-duration: 3.2s

.lti--diamond .lti__shimmer
  animation-duration: 2.8s

.lti--champion .lti__shimmer
  animation-duration: 2.4s

// Sparkles twinkle; each one sits in its own translated group, the path scales.
.lti__sparkle path
  transform-origin: 50% 50%
  animation: lti-twinkle 2.2s ease-in-out infinite

.lti__sparkle--b path
  animation-delay: 0.8s

.lti__sparkle--c path
  animation-delay: 1.5s

.lti__flame
  transform-origin: 50% 100%
  animation: lti-flicker 1.1s ease-in-out infinite alternate

@keyframes lti-shimmer
  0%
    transform: translateX(0)
  55%, 100%
    transform: translateX(150px)

@keyframes lti-twinkle
  0%, 100%
    opacity: 0
    transform: scale(0.2) rotate(0deg)
  45%
    opacity: 1
    transform: scale(1) rotate(45deg)
  70%
    opacity: 0.2
    transform: scale(0.5) rotate(60deg)

@keyframes lti-flicker
  0%
    transform: scale(1, 1)
  40%
    transform: scale(1.03, 0.95)
  100%
    transform: scale(0.97, 1.05)

// Still: the idle motion stops, the icon stays whole. Sparkles rest as a
// small glint rather than vanishing, so the still icon keeps its shine.
.lti--static .lti__shimmer,
.lti--static .lti__flame
  animation: none

.lti--static .lti__sparkle path
  animation: none
  opacity: 0.9
  transform: scale(0.6) rotate(45deg)

@media (prefers-reduced-motion: reduce)
  .lti__shimmer
    display: none

  .lti__flame
    animation: none

  .lti__sparkle path
    animation: none
    opacity: 0.9
    transform: scale(0.6) rotate(45deg)
</style>
