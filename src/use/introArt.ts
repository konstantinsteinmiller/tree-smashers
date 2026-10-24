// ─── First-launch intro: painted intro art (registry + loader) ─────────────
//
// The four intro-only paintings (art-sheets/intro/*.prompt.txt, painted by
// tools/intro-art/paint-queue.mjs, packed by tools/intro-art/pack.mjs into
// public/images/intro/ + src/use/paintedIntro.ts):
//
//   trail       stone0 … stone3 + crown — the stage trail on the title card
//   heroTrees   blue, red              — the title card's team trees
//   canopy      corner                 — the leafy canopy of beat 1
//   skillPlate  plate                  — the lower-third skill card plate
//
// Every sprite has a drawn / vector fallback: until its file has LOADED (and
// with `?art=procedural`, in jsdom / node) the intro draws its own version.
// Leaf module: no Vue, nothing but the registry and Image.

import { PAINTED_INTRO, type IntroArtName, type PaintedIntroSprite } from '@/use/paintedIntro'
import { prependBaseUrl } from '@/utils/function'

export type { IntroArtName }

const images = new Map<string, HTMLImageElement | null>()
let revision = 0
/** Bumps whenever an intro painting finished loading. */
export const introArtRevision = (): number => revision

const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

/** Public URL of a painted intro sprite, or null when it is not painted. */
export const introArtUrl = (name: IntroArtName, sprite: string): string | null => {
  const art = PAINTED_INTRO[name]
  const s = art?.sprites[sprite]
  if (!art || !s || !artAllowed()) return null
  return prependBaseUrl(`images/intro/${s.file}?v=${art.v}`)
}

/** Size of a painted sprite (px), or null. */
export const introArtSize = (name: IntroArtName, sprite: string): PaintedIntroSprite | null =>
  PAINTED_INTRO[name]?.sprites[sprite] ?? null

/** Start loading every painted intro sprite (idempotent). */
export const preloadIntroArt = (): void => {
  if (!artAllowed()) return
  for (const name of Object.keys(PAINTED_INTRO) as IntroArtName[]) {
    for (const sprite of Object.keys(PAINTED_INTRO[name]?.sprites ?? {})) {
      const url = introArtUrl(name, sprite)
      if (!url || images.has(url)) continue
      images.set(url, null)
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        images.set(url, img)
        revision++
      }
      img.src = url
    }
  }
}

/** The loaded image of a painted sprite, or null (draw the fallback). */
export const introArtImage = (name: IntroArtName, sprite: string): HTMLImageElement | null => {
  const url = introArtUrl(name, sprite)
  return url ? images.get(url) ?? null : null
}
