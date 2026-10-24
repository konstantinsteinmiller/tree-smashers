import { reactive } from 'vue'
import { getCachedImage } from '@/use/useAssets'
import { prependBaseUrl } from '@/utils/function'
import { PAINTED_ROULETTE, type PaintedRoulettePart } from '@/use/paintedRoulette'

// ─── Painted parts of the boss-reward roulette wheel ────────────────────────
//
// The wheel is drawn in layers (see RouletteWheel.vue): the segment face is a
// canvas the code paints from the reward data (it carries amounts, icons and
// skins, so it can never be a painting), and everything static around it — the
// gold rim, the pointer, the jewelled hub, the marquee bulbs — is a painted
// bitmap from `art/roulette/` (reference sheets + master prompts live there, so
// every part can be re-painted).
//
// Every painted part has a CSS/SVG fallback in the component. A part that is
// not listed here is simply drawn by its fallback, and NO request is made for
// it — a 404 is reported as a broken build by the portal QA consoles, so a
// painting must be listed here only once its file actually ships in
// `public/images/roulette/`.
//
// Loading: the wheel only ever opens after a BOSS win, so the art is fetched
// when the player reaches a boss stage (SpinnerArena) — not at game boot — and
// once more, idempotently, by the wheel itself as a safety net.

export type RouletteArtKey = 'rim' | 'pointer' | 'hub' | 'bulbOff' | 'bulbOn'

/** Shipped paintings, by part. Leave a part out until its file exists.
 *  Sizes are ~2x the largest display size (the wheel caps at 300 CSS px). */
//
// TOY-BOX RESTYLE: the old Chaos Arena gold-filigree set (rim_560x560,
// pointer_78x120, hub_128x128, bulb-off/on_40x40) stays delisted. The listed
// parts are the toy-box repaint (tools/roulette-art → PAINTED_ROULETTE, a
// generated registry: a part that is not painted is simply absent). The rim's
// measured opening re-registers GEO in RouletteWheel.vue (rouletteGeo below).
// `?art=procedural` lists nothing, so the CSS / SVG drawing shows (A/B).
const artAllowed = (): boolean =>
  typeof location === 'undefined' || !/[?&]art=procedural(?:&|$)/.test(location.search)

const PAINTED: Partial<Record<RouletteArtKey, string>> = artAllowed()
  ? Object.fromEntries(
    (Object.entries(PAINTED_ROULETTE) as [RouletteArtKey, PaintedRoulettePart][])
      .map(([k, p]) => [k, `images/roulette/${p.file}?v=${p.v}`])
  )
  : {}

/** Wheel geometry (fractions of the wheel size). The CSS rim's opening is
 *  r 0.36; a listed painted rim brings its own measured opening `open`: the
 *  face tucks 0.012 under its lip and the bolts sit mid-band. */
export const rouletteGeo = (rimOpen: number | null): { disk: number, bulbRing: number } =>
  rimOpen === null
    ? { disk: 0.372, bulbRing: 0.436 }
    : { disk: +(rimOpen + 0.012).toFixed(4), bulbRing: +((rimOpen + 0.5) / 2).toFixed(4) }

/** The listed painted rim's opening, or null (CSS rim). */
export const paintedRimOpen = (): number | null =>
  PAINTED.rim && PAINTED_ROULETTE.rim ? PAINTED_ROULETTE.rim.open : null

/** The listed painted pointer's aspect (h / w) and cap pivot, or null (SVG pointer). */
export const paintedPointer = (): { aspect: number, pivotY: number } | null => {
  const p = PAINTED_ROULETTE.pointer
  return PAINTED.pointer && p ? { aspect: p.h / p.w, pivotY: p.pivotY } : null
}

export const rouletteArtSrc: Partial<Record<RouletteArtKey, string>> = Object.fromEntries(
  Object.entries(PAINTED).map(([k, path]) => [k, prependBaseUrl(path as string)])
)

/** True once a part's painting has decoded; false (fallback) until then, and
 *  forever if it failed to load. */
export const rouletteArtReady = reactive<Record<RouletteArtKey, boolean>>({
  rim: false,
  pointer: false,
  hub: false,
  bulbOff: false,
  bulbOn: false
})

let started = false

export const preloadRouletteArt = (): void => {
  if (started) return
  started = true
  for (const [key, src] of Object.entries(rouletteArtSrc) as [RouletteArtKey, string][]) {
    const img = getCachedImage(src)
    const settle = () => {
      rouletteArtReady[key] = img.naturalWidth > 0
    }
    if (img.complete && img.naturalWidth > 0) settle()
    else {
      img.addEventListener('load', settle, { once: true })
      img.addEventListener('error', settle, { once: true })
    }
  }
}
