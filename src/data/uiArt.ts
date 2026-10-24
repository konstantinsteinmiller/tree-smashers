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
import type { UiIconName } from '@/use/paintedUiIcons'
import { paintedUiIconSrc, type PaintedUiIconSrc } from '@/use/uiIconArt'
import { badgeIconPath } from '@/use/badgeIconArt'

export type StatArtId = 'attack' | 'defense' | 'speed' | 'hp' | 'weight' | 'level-up'
export type StatId = Exclude<StatArtId, 'level-up'>

/**
 * The five stats' icons are the toy-style UI icon family (tools/ui-icons,
 * `stat-*`: painted sprites in public/images/ui-icons/, drawn SVG fallbacks
 * IconStat*.vue). The older art/ui sheet's stat files (images/stats/) are
 * superseded and never requested; only its level-up arrow is still used.
 */
export const STAT_UI_ICON: Readonly<Record<StatId, UiIconName>> = {
  hp: 'stat-hp',
  attack: 'stat-atk',
  defense: 'stat-def',
  speed: 'stat-spd',
  weight: 'stat-weight'
}

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

/** URL of the level-up arrow painting, or null → draw the fallback. Reactive. */
export const levelUpIconSrc = (): string | null =>
  uiArtAvailable(statIconPath('level-up')) ? prependBaseUrl(badgeIconPath('level-up', statIconPath('level-up'))) : null

/** The stat family's painted sprite (srcset), or null → the drawn SVG.
 *  Reactive: a failed load (markStatIconFailed) drops it for the session. */
export const statIconSrc = (id: StatId): PaintedUiIconSrc | null =>
  failed.has(STAT_UI_ICON[id]) ? null : paintedUiIconSrc(STAT_UI_ICON[id])

export const markStatIconFailed = (id: StatId): void => {
  failed.add(STAT_UI_ICON[id])
}

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

/** The stat family's largest painted sprite as a shared bitmap for canvas
 *  stamps (power-up box plate, pick-up label), or null → draw the glyph. */
export const statIconImage = (id: StatId): HTMLImageElement | null => {
  const p = statIconSrc(id)
  if (!p || typeof Image === 'undefined') return null
  const key = `stat:${id}`
  let img = images.get(key)
  if (img) return img
  try {
    img = new Image()
    img.addEventListener('error', () => markStatIconFailed(id), { once: true })
    img.src = p.srcMax
    images.set(key, img)
    return img
  } catch {
    markStatIconFailed(id)
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
    statIconImage(s)
  }
}

/**
 * Where the painted box's round face plate sits, as fractions of the box
 * image (measured on the sliced 256x256 files: the plate's centre and
 * radius). The game stamps the stat icon (statIconImage) there.
 */
export const POWERUP_PLATE = { cx: 0.5, cy: 0.575, r: 0.21 } as const
