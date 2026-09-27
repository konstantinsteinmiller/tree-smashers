import { reactive } from 'vue'
import { getCachedImage } from '@/use/useAssets'
import { prependBaseUrl } from '@/utils/function'

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
const PAINTED: Partial<Record<RouletteArtKey, string>> = {
  rim: 'images/roulette/rim_560x560.webp',
  pointer: 'images/roulette/pointer_78x120.webp',
  hub: 'images/roulette/hub_128x128.webp',
  bulbOff: 'images/roulette/bulb-off_40x40.webp',
  bulbOn: 'images/roulette/bulb-on_40x40.webp'
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
