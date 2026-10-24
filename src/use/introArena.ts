// ─── First-launch intro: the arena (static layer) ───────────────────────────
//
// The intro's stage is the REAL stage-1 clearing: the meadow theme's painted
// backdrop tile + props (arenaBackdrop), the painted floor (arenaFloorArt) or
// its procedural patches + decor, the wooden log rim and the terrain features
// (arenaTerrainDraw) — the same modules useSpinnerGame's static layer bakes,
// painted in the same order with the same colours (renderArenaStatic). The
// trees are NOT baked: they pop up, flash and fall during the film.
//
// A bake is a world-space buffer at one zoom: device px per world unit `u`,
// covering a world rect whose origin sits on the bake's own pixel grid, so a
// hold at that zoom draws it 1 : 1 on whole device pixels (render-sharpness
// rule: never resampled, never below css × dpr).

import { arenaPropLayout } from '@/use/arenaProps'
import { backdropArtRevision, paintArenaBackdrop, preloadBackdropArt } from '@/use/arenaBackdrop'
import { drawPaintedFloor, floorArtRevision, preloadFloorArt } from '@/use/arenaFloorArt'
import { borderArtRevision, drawPaintedBorder, preloadBorderArt } from '@/use/arenaBorderArt'
import { buildTerrainLayout, type TerrainLayout } from '@/use/arenaTerrain'
import { terrainArtRevision } from '@/use/arenaTerrainArt'
import { DECOR_DRAW, renderTerrainFeatures } from '@/use/arenaTerrainDraw'
import { isInside, traceArenaPath } from '@/use/arenaShapes'
import { floorKeyFor, THEME_LOOK, themeFor, type ArenaTheme } from '@/use/arenaThemes'
import { ARENA_R, LAYOUT_ID, SHAPE, TREES } from '@/use/introStory'

export const THEME: ArenaTheme = themeFor('default', LAYOUT_ID)
export const FLOOR_KEY = floorKeyFor(THEME, LAYOUT_ID)

let terrainLayout: TerrainLayout | null = null
export const introTerrain = (): TerrainLayout => (terrainLayout ??= buildTerrainLayout(LAYOUT_ID))

/** Start every request the static layer needs (idempotent). */
export const preloadIntroArena = (): void => {
  preloadBackdropArt(THEME)
  preloadFloorArt(FLOOR_KEY)
  preloadBorderArt(THEME)
  // The prop layout is pure; computing it early keeps it off the first bake.
  void arenaPropLayout(THEME, LAYOUT_ID, SHAPE)
}

/** Changes whenever a baked art file lands (re-bake key). */
export const arenaArtKey = (): string => `${backdropArtRevision()}:${floorArtRevision()}:${terrainArtRevision()}:${borderArtRevision()}`

type BufCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// The default arena's rim (useSpinnerGame ARENA_THEMES.default).
const RIM_DARK = '#2c1d12'
const RIM_BARK = '#7a5130'
const RIM_ACCENT = '#4fdfff'
const BORDER_W = 4

const treeBlocks = (x: number, y: number): boolean => {
  for (const t of [TREES.red, TREES.blue]) if (Math.hypot(t.x - x, t.y - y) < t.r + 8) return true
  return false
}

/** The clearing (floor, rim, terrain) in world units; caller set the
 *  world → buffer transform. Mirrors useSpinnerGame.renderArenaStatic. */
export const paintClearing = (ctx: BufCtx): void => {
  const R = ARENA_R
  const look = THEME_LOOK[THEME]
  const pal = look.floor
  const terrain = introTerrain()
  const themeFloor = THEME === 'meadow' ? terrain.theme.floor : undefined
  ctx.fillStyle = themeFloor?.[0] ?? pal.base
  traceArenaPath(ctx, SHAPE, R)
  ctx.fill()
  const painted = drawPaintedFloor(ctx, FLOOR_KEY, SHAPE, R, `${pal.rim}29`)
  if (!painted) {
    ctx.save()
    traceArenaPath(ctx, SHAPE, R)
    ctx.clip()
    ctx.fillStyle = themeFloor?.[1] ?? pal.light
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996 + 0.7
      const r = R * (0.15 + 0.6 * ((i * 0.6180339 + 0.31) % 1))
      const cx = Math.cos(a) * r
      const cy = Math.sin(a) * r
      const size = R * (0.12 + 0.07 * ((i * 0.381966) % 1))
      ctx.beginPath()
      for (let k = 0; k <= 10; k++) {
        const t = (k / 10) * Math.PI * 2
        const rr = size * (0.75 + 0.25 * Math.sin(t * 3 + i) + 0.12 * Math.cos(t * 5 + i * 2))
        const px = cx + Math.cos(t) * rr * 1.3
        const py = cy + Math.sin(t) * rr
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
    const decor = look.decor === 'layout' ? (terrain.theme.decor ?? 'tufts') : look.decor
    if (decor !== null) {
      for (let i = 0; i < 40; i++) {
        const a = i * 2.39996
        const r = R * (0.2 + 0.78 * ((i * 0.6180339) % 1))
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r
        if (!isInside(SHAPE, x, y, R, 12)) continue
        if (treeBlocks(x, y)) continue
        DECOR_DRAW[decor](ctx as CanvasRenderingContext2D, x, y, i, pal)
      }
    }
  }
  // The theme's painted border (arenaBorderArt, a gap at each tree — as
  // renderArenaStatic), else the wooden log rim: dark outline, bark band, a
  // thin accent top line.
  const trees = [TREES.red, TREES.blue].map(t => ({ x: t.x, y: t.y, radius: t.r }))
  if (!drawPaintedBorder(ctx, THEME, SHAPE, R, trees, `${THEME}:${LAYOUT_ID}`)) {
    ctx.lineJoin = 'round'
    ctx.strokeStyle = RIM_DARK
    ctx.lineWidth = BORDER_W + 7
    traceArenaPath(ctx, SHAPE, R)
    ctx.stroke()
    ctx.strokeStyle = RIM_BARK
    ctx.lineWidth = BORDER_W + 3
    traceArenaPath(ctx, SHAPE, R)
    ctx.stroke()
    ctx.strokeStyle = RIM_ACCENT
    ctx.lineWidth = 1.5
    traceArenaPath(ctx, SHAPE, R, (R - BORDER_W * 0.5 - 2) / R)
    ctx.stroke()
  }
  renderTerrainFeatures(ctx, terrain, THEME)
}

export interface ArenaBake {
  canvas: HTMLCanvasElement | OffscreenCanvas
  /** Device px per world unit. */
  u: number
  /** World rect origin, on the bake's pixel grid (x0 · u is a whole number). */
  x0: number
  y0: number
  /** Size in device px. */
  w: number
  h: number
  key: string
}

const mkCanvas = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null => {
  try {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      return c
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  } catch { /* no canvas */
  }
  return null
}

/**
 * Bake the arena for world rect [x0, x1] × [y0, y1] at `u` device px per
 * unit. Re-uses `prev`'s buffer when the size matches.
 */
export const bakeArena = (
  u: number, x0: number, y0: number, x1: number, y1: number, prev: ArenaBake | null
): ArenaBake | null => {
  // Snap the origin onto the pixel grid of this zoom.
  const px0 = Math.floor(x0 * u)
  const py0 = Math.floor(y0 * u)
  const w = Math.max(1, Math.ceil(x1 * u) - px0)
  const h = Math.max(1, Math.ceil(y1 * u) - py0)
  let canvas = prev && prev.w === w && prev.h === h ? prev.canvas : null
  if (!canvas) {
    if (prev) {
      prev.canvas.width = 1
      prev.canvas.height = 1
    }
    canvas = mkCanvas(w, h)
  }
  if (!canvas) return null
  const g = canvas.getContext('2d') as BufCtx | null
  if (!g) return null
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, w, h)
  // Backdrop: tile + props, in device px of this buffer.
  paintArenaBackdrop(g, w, h, -px0, -py0, u, THEME, LAYOUT_ID, SHAPE)
  g.setTransform(u, 0, 0, u, -px0, -py0)
  paintClearing(g)
  g.setTransform(1, 0, 0, 1, 0, 0)
  return { canvas, u, x0: px0 / u, y0: py0 / u, w, h, key: arenaArtKey() }
}
