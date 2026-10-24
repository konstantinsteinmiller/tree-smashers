// ─── Arena backdrop: the theme's ground + props around the clearing ──────────
//
// Paints, into the engine's ONE static layer (useSpinnerGame drawStaticLayer —
// background, props, floor, rim, terrain features and tower bases baked
// together at css × dpr, one blit per frame):
//  1. the arena theme's flat ground colour (THEME_LOOK[theme].backdrop), then
//     its painted, seamless tile (PAINTED_BACKDROPS, made by
//     tools/bg-tile/make-tile.mjs), anchored at the arena centre and scaled
//     with the arena — but NEVER above its own resolution (the tile shrinks
//     in arena units on a dense screen instead of being upscaled);
//  2. the theme's deterministic prop layout (arenaProps.ts) from that theme's
//     painted atlas (paintedProps.ts) — a match loads only its own theme.
// Art loads lazily per theme; backdropArtRevision() bumps on every arrival
// so the layer re-bakes. Purely decorative: reads nothing from and writes
// nothing to the match. Disabled with `?art=procedural` and in jsdom / node
// (the flat colour still paints).
import { arenaPropLayout, PROP_KIND_BY_ID } from '@/use/arenaProps'

/**
 * How a backdrop prop may vary per instance (owner 2026-10-23). The old rule was a
 * regex (`/rift|crack|flow/`) that also matched "flowers" / "sunflowers", so flower
 * patches were spun to random angles. Now explicit, per prop id:
 *   free  — flat ground cracks / flows: any angle (a field of rifts never runs one way)
 *   flip  — rocks, boulders, stones, gravestones, honeycombs, logs, stumps, columns:
 *           mirrored left-right on the vertical axis only (they have no 'up' to lose)
 *   fixed — everything else: trees, flowers, bushes, ferns, toys, ponds, drifts, slabs
 *           — painted upright / in the 3/4 view, so never rotated and never mirrored.
 */
export type PropTurn = 'free' | 'flip' | 'fixed'
const FREE_TURN: ReadonlySet<string> = new Set(['rift', 'ruinsRift', 'riftSmall', 'ashCrack', 'cooledFlow'])
const FLIP_TURN: ReadonlySet<string> = new Set([
  'stones', 'boulder', 'boulderPair', 'mossBoulder', 'greyBoulder', 'snowBoulder', 'boulderCluster',
  'snowStones', 'lavaStones', 'lavaRock', 'obsidian', 'pebbles', 'rubble', 'rockSpire', 'basaltColumns',
  'standingStone', 'brokenColumn', 'fallenColumn', 'ruinWall', 'runeStone', 'iceCrystals',
  'graveHeart', 'gravePaw', 'beehive', 'honeyPot', 'log', 'logPile', 'hollowLog', 'mossyStump', 'charredStump'
])
export const propTurn = (kind: string): PropTurn => FREE_TURN.has(kind) ? 'free' : FLIP_TURN.has(kind) ? 'flip' : 'fixed'
import type { ArenaShape } from '@/use/arenaShapes'
import { whenDecoded } from '@/use/imageDecode'
import { THEME_LOOK, type ArenaTheme } from '@/use/arenaThemes'
import { PAINTED_BACKDROPS } from '@/use/paintedBackdrops'
import { PAINTED_PROPS } from '@/use/paintedProps'
import { prependBaseUrl } from '@/utils/function'

type BufCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const tiles = new Map<ArenaTheme, HTMLImageElement | null>()
const atlases = new Map<ArenaTheme, HTMLImageElement | null>()
let revision = 0
/** Bumps whenever a backdrop tile or prop atlas finished loading. */
export const backdropArtRevision = (): number => revision

const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}

// One settle-promise per requested file, so the splash can wait on the current
// stage's art (useAssets) — resolves on load AND on error, never rejects.
const settled = new Map<string, Promise<void>>()

const load = (map: Map<ArenaTheme, HTMLImageElement | null>, theme: ArenaTheme, src: string): Promise<void> => {
  const url = prependBaseUrl(src)
  const known = settled.get(url)
  if (known) return known
  map.set(theme, null)
  const p = new Promise<void>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => whenDecoded(img, () => {
      map.set(theme, img)
      revision++
      resolve()
    })
    img.onerror = () => resolve()
    img.src = url
  })
  settled.set(url, p)
  return p
}

/** Start loading a theme's tile + prop atlas (idempotent); settles once both
 *  are in (or failed). */
export const preloadBackdropArt = (theme: ArenaTheme): Promise<void> => {
  if (!artAllowed()) return Promise.resolve()
  const jobs: Promise<void>[] = []
  const t = PAINTED_BACKDROPS[theme]
  if (t) jobs.push(load(tiles, theme, `images/bg/${t.file}?v=${t.v}`))
  const a = PAINTED_PROPS[theme]
  if (a) jobs.push(load(atlases, theme, `images/props/${a.file}?v=${a.v}`))
  return Promise.all(jobs).then(() => undefined)
}

/**
 * Paint the backdrop of `theme` over a whole device-pixel buffer `bw` × `bh`
 * (identity transform). (cx, cy) = the arena centre in device px, `unit` =
 * device px per arena unit.
 */
/** The arena's own radius in units (useSpinnerGame ARENA_RADIUS; duplicated to keep this module leaf). */
const HAZE_ARENA_R = 200

/**
 * #Consistency-8: smashers + balloons are ~1.5x the height of the pines behind the wall, so the
 * backdrop read as a flat tile next to a diorama. A static, baked atmospheric haze (the theme's
 * own backdrop colour, clear at the wall and deepening toward the screen corners) pushes the
 * props back so they read as far-away scenery. One gradient in the bake — never per frame.
 */
const paintDepthHaze = (b: BufCtx, bw: number, bh: number, cx: number, cy: number, unit: number, theme: ArenaTheme): void => {
  const inner = unit * HAZE_ARENA_R * 1.25
  const outer = Math.hypot(Math.max(cx, bw - cx), Math.max(cy, bh - cy))
  if (outer <= inner) return
  const g = b.createRadialGradient(cx, cy, inner, cx, cy, outer)
  const base = THEME_LOOK[theme].backdrop
  g.addColorStop(0, `${base}00`)
  g.addColorStop(1, `${base}8c`)
  b.save()
  b.fillStyle = g
  b.fillRect(0, 0, bw, bh)
  b.restore()
}

export const paintArenaBackdrop = (
  b: BufCtx, bw: number, bh: number, cx: number, cy: number, unit: number,
  theme: ArenaTheme, layoutId: number | null, shape: ArenaShape
): void => {
  b.fillStyle = THEME_LOOK[theme].backdrop
  b.fillRect(0, 0, bw, bh)
  preloadBackdropArt(theme)
  // 1. ground tile — device size ≤ its own pixels (never upscaled)
  const meta = PAINTED_BACKDROPS[theme]
  const tile = tiles.get(theme)
  if (meta && tile) {
    const s = Math.min(1, (meta.units * unit) / tile.naturalWidth)
    const pat = b.createPattern(tile, 'repeat')
    if (pat) {
      b.save()
      b.translate(cx, cy)
      b.scale(s, s)
      b.fillStyle = pat
      b.fillRect(-cx / s, -cy / s, bw / s, bh / s)
      b.restore()
    }
  }
  // 2. props
  const atlas = PAINTED_PROPS[theme]
  const atlasImg = atlases.get(theme)
  if (!atlas || !atlasImg) { paintDepthHaze(b, bw, bh, cx, cy, unit, theme); return }
  const sprites = atlas.sprites
  b.imageSmoothingQuality = 'high'
  for (const p of arenaPropLayout(theme, layoutId, shape)) {
    const sp = sprites[p.kind]
    if (!sp) continue
    const px = cx + p.x * unit
    const py = cy + p.y * unit
    const rr = p.r * unit
    if (px + rr < 0 || px - rr > bw || py + rr < 0 || py - rr > bh) continue
    if (PROP_KIND_BY_ID[p.kind]?.shadow) {
      // flat contact shadow, inside the footprint (reach ≤ 0.84 r)
      b.fillStyle = 'rgba(0, 0, 0, 0.16)'
      b.beginPath()
      b.ellipse(px + rr * 0.06, py + rr * 0.1, rr * 0.78, rr * 0.62, 0, 0, Math.PI * 2)
      b.fill()
    }
    const k = rr / sp.footR
    // Per-instance variety (deterministic from the position): every prop may
    // be mirrored; flat ground decals (rifts, cracks, ponds …) also turn to a
    // free angle so a field of rifts never runs all one way. Both turn about
    // the footprint centre, so the sprite stays inside its footprint circle.
    const h = Math.sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453
    const u = h - Math.floor(h)
    const turn = propTurn(p.kind)
    const flip = turn !== 'fixed' && u < 0.5 ? -1 : 1
    // Only flat cracks turn freely (see PropTurn): ponds, slabs and drifts are painted in the
    // 3/4 view (thick rim at the bottom) and look upside-down when rotated.
    const ang = turn === 'free' ? u * Math.PI * 2 : 0
    b.save()
    b.translate(px, py)
    if (ang) b.rotate(ang)
    b.scale(flip, 1)
    b.drawImage(atlasImg, sp.x, sp.y, sp.w, sp.h, -(sp.cx - sp.x) * k, -(sp.cy - sp.y) * k, sp.w * k, sp.h * k)
    b.restore()
  }
  paintDepthHaze(b, bw, bh, cx, cy, unit, theme)
}
