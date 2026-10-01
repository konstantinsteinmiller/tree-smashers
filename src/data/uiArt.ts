/**
 * Painted UI art (art/ui/manifest.mjs): the stat icon set and the power-up
 * boxes. Each painted file overrides a drawing the game still owns — the SVG
 * stat icons (`StatIcon`'s fallback) and `renderPowerup`'s crate — and the
 * drawing comes back silently whenever the file is missing or fails.
 *
 * Only files listed in PAINTED are ever requested, so an unpainted drawable
 * costs no request and no 404 on a portal's console. A load error marks that
 * one file failed (reactive) and its callers switch to the drawing; nothing
 * throws and nothing is logged.
 */
import { reactive } from 'vue'
import { prependBaseUrl } from '@/utils/function'
import type { PowerupStat } from '@/types/spinner'

export type StatArtId = 'attack' | 'defense' | 'speed' | 'hp' | 'weight' | 'level-up'

/** Painted files that ship (paths under public/). Add a file here only once
 *  art/ui/slice-return.mjs has written it (tests/uiArt.test.ts checks). */
export const PAINTED_UI_ART: readonly string[] = [
  'images/stats/attack_256x256.webp',
  'images/stats/defense_256x256.webp',
  'images/stats/speed_256x256.webp',
  'images/stats/hp_256x256.webp',
  'images/stats/weight_256x256.webp',
  'images/stats/level-up_256x256.webp',
  'images/powerups/attack-box_256x256.webp',
  'images/powerups/defense-box_256x256.webp',
  'images/powerups/speed-box_256x256.webp'
]

const painted = new Set(PAINTED_UI_ART)
/** Files that failed to load this session — their drawing is used instead. */
const failed = reactive(new Set<string>())

export const statIconPath = (id: StatArtId): string => `images/stats/${id}_256x256.webp`
export const powerupBoxPath = (stat: PowerupStat): string => `images/powerups/${stat}-box_256x256.webp`

/** Is this painted file usable (listed and not failed)? Reactive. */
export const uiArtAvailable = (path: string): boolean => painted.has(path) && !failed.has(path)

export const markUiArtFailed = (path: string): void => {
  failed.add(path)
}

/** URL of a stat icon painting, or null → draw the fallback. Reactive. */
export const statIconSrc = (id: StatArtId): string | null =>
  uiArtAvailable(statIconPath(id)) ? prependBaseUrl(statIconPath(id)) : null

const images = new Map<string, HTMLImageElement>()

/** The shared decoded bitmap for a canvas caller, or null (not painted,
 *  failed, no DOM). Draw it only when `uiArtReady` says so. */
export const uiArtImage = (path: string): HTMLImageElement | null => {
  if (!uiArtAvailable(path) || typeof Image === 'undefined') return null
  let img = images.get(path)
  if (img) return img
  try {
    img = new Image()
    img.addEventListener('error', () => markUiArtFailed(path), { once: true })
    img.src = prependBaseUrl(path)
    images.set(path, img)
    return img
  } catch {
    markUiArtFailed(path)
    return null
  }
}

export const uiArtReady = (img: HTMLImageElement | null): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0

/** Start fetching the in-battle power-up art (boxes + the icons stamped on
 *  them) before the first box drops. Idempotent. */
export const preloadPowerupArt = (): void => {
  for (const s of ['attack', 'defense', 'speed'] as const) {
    uiArtImage(powerupBoxPath(s))
    uiArtImage(statIconPath(s))
  }
}

/**
 * Where the painted box's round face plate sits, as fractions of the box
 * image (measured on the sliced 256x256 files: the plate's centre and
 * radius). The game stamps the painted stat icon there.
 */
export const POWERUP_PLATE = { cx: 0.5, cy: 0.56, r: 0.24 } as const
