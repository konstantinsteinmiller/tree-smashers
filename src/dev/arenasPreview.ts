/**
 * DEV-ONLY entry for `dev/arenas.html`: a contact sheet of all terrain
 * layouts drawn with the same pieces the engine's static arena buffer uses
 * (traceArenaPath, the layout theme floor + decor, renderTerrainFeatures) plus
 * towers (createTower) and — dashed — every spawn disc at the largest disc
 * size, so overlaps are visible at a glance. Never imported by the game.
 *
 *   /dev/arenas.html            all layouts, 5 per row
 *   /dev/arenas.html?id=12      one layout, large
 *   &spawns=0                   hide the spawn overlay
 *   &theme=snowy                dress every layout in one theme (else its own)
 *   &border=lava                force a painted border (lava / heal wall or a theme's)
 *   &ids=3,9,40                 only these layouts
 *   &cell=390                   cell size in css px (390 ≈ a phone's width)
 */
import { CLEARING_SPECS, TERRAIN_SHAPES, isInside, traceArenaPath } from '@/use/arenaShapes'
import { TERRAIN_LAYOUT_COUNT, TERRAIN_LAYOUT_KEYS, buildTerrainLayout, createTower, terrainCircles } from '@/use/arenaTerrain'
import { DECOR_DRAW, renderTerrainFeatures } from '@/use/arenaTerrainDraw'
import { ARENA_THEME_IDS, THEME_LOOK, floorKeyFor, themeFor, type ArenaTheme } from '@/use/arenaThemes'
import { terrainArtRevision } from '@/use/arenaTerrainArt'
import { drawPaintedFloor, floorArtRevision } from '@/use/arenaFloorArt'
import { borderArtRevision, drawPaintedBorder } from '@/use/arenaBorderArt'
import type { BorderKey } from '@/use/paintedBorders'
import { backdropArtRevision, paintArenaBackdrop } from '@/use/arenaBackdrop'
import en from '@/i18n/locales/en'

const R = 200
const BLADE = 28
const params = new URLSearchParams(location.search)
const only = params.get('id')
const showSpawns = params.get('spawns') !== '0'
const idList = params.get('ids')
const ids = only !== null ? [Number(only)] : idList ? idList.split(',').map(Number) : [...Array(TERRAIN_LAYOUT_COUNT).keys()]
const cols = only !== null ? 1 : Math.min(5, ids.length)
const themeParam = params.get('theme') as ArenaTheme | null
const borderParam = params.get('border') as BorderKey | null
/** `floors=0`: skip the painted floors, so the procedural floor + its decor scatter show (decor A/B). */
const paintedFloors = params.get('floors') !== '0'
const themeOf = (id: number): ArenaTheme => themeParam && ARENA_THEME_IDS.includes(themeParam) ? themeParam : themeFor('default', id)
const cell = Number(params.get('cell')) || (only !== null ? 720 : 300)
const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
const labelH = 34

const canvas = document.createElement('canvas')
const rows = Math.ceil(ids.length / cols)
canvas.width = cols * cell * dpr
canvas.height = rows * (cell + labelH) * dpr
canvas.style.width = `${cols * cell}px`
canvas.style.height = `${rows * (cell + labelH)}px`
document.getElementById('root')!.appendChild(canvas)
const ctx = canvas.getContext('2d')!

const names = (en as unknown as { terrain: { layout: Record<string, string> } }).terrain.layout
const DECOR_PAL = { tuft: '#4f9a3c', flower: '#fff27a' }

const render = () => {
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
ctx.clearRect(0, 0, canvas.width, canvas.height)
ids.forEach((id, n) => {
  const cx = (n % cols) * cell + cell / 2
  const cy = Math.floor(n / cols) * (cell + labelH) + labelH + cell / 2
  const s = (cell * 0.92) / (2 * R)
  const shape = TERRAIN_SHAPES[id]!
  const t = buildTerrainLayout(id)
  const theme = themeOf(id)
  // The theme's backdrop (ground tile + props) inside this cell only.
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.beginPath()
  ctx.rect((cx - cell / 2) * dpr, (cy - cell / 2) * dpr, cell * dpr, cell * dpr)
  ctx.clip()
  paintArenaBackdrop(ctx, canvas.width, canvas.height, cx * dpr, cy * dpr, s * dpr, theme, id, shape)
  ctx.restore()
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  // Floor + lighter patches (as renderArenaStatic on the 'default' arena type).
  ctx.fillStyle = theme === 'meadow' ? (t.theme.floor?.[0] ?? '#7cc05c') : THEME_LOOK[theme].floor.base
  traceArenaPath(ctx, shape, R)
  ctx.fill()
  const paintedFloor = paintedFloors && drawPaintedFloor(ctx, floorKeyFor(theme, id), shape, R, `${THEME_LOOK[theme].floor.rim}29`)
  // Decor scatter (same golden-angle law as the engine).
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996
    const r = R * (0.2 + 0.78 * ((i * 0.6180339) % 1))
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (paintedFloor) break
    if (!isInside(shape, x, y, R, 12)) continue
    if (terrainCircles(t).some(c => Math.hypot(c.x - x, c.y - y) < c.radius + 6)) continue
    DECOR_DRAW[THEME_LOOK[theme].decor === 'layout' ? t.theme.decor : (THEME_LOOK[theme].decor ?? t.theme.decor)](ctx, x, y, i, theme === 'meadow' ? DECOR_PAL : THEME_LOOK[theme].floor)
  }
  const towers = (['player', 'npc'] as const).map(side => createTower(side, R, BLADE, 100, shape))
  // The theme's painted border (as renderArenaStatic), else the log rim.
  const painted = drawPaintedBorder(ctx, borderParam ?? theme, shape, R, towers, `${theme}:${id}`)
  if (!painted) {
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#2c1d12'
  ctx.lineWidth = 11
  traceArenaPath(ctx, shape, R)
  ctx.stroke()
  ctx.strokeStyle = '#7a5130'
  ctx.lineWidth = 7
  traceArenaPath(ctx, shape, R)
  ctx.stroke()
  }
  renderTerrainFeatures(ctx, t, theme)
  // Towers (team colour discs) — set into the wall.
  for (const tw of towers) {
    const side = tw.side
    ctx.fillStyle = side === 'player' ? '#3f8fe0' : '#e0533f'
    ctx.strokeStyle = '#2c2116'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(tw.x, tw.y, tw.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  if (showSpawns) {
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
    const disc = BLADE * 1.35
    for (const x of [-70, -23.3, 0, 23.3, 70]) {
      ctx.beginPath()
      ctx.arc(x, 80, disc, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255, 210, 200, 0.75)'
    for (const [x, y] of [[0, -80], [-80, -80], [80, -80], [-80, -110], [80, -110], [0, -60], [-80, -130], [80, -130], [-80, -60], [80, -60]]) {
      ctx.beginPath()
      ctx.arc(x!, y!, disc, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
  ctx.restore()
  const key = TERRAIN_LAYOUT_KEYS[id]!
  ctx.fillStyle = '#f3ead8'
  ctx.font = `bold ${only !== null ? 18 : 13}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(`${id + 1}. ${names[key] ?? key}`, cx, cy - cell / 2 - 16)
  ctx.font = `${only !== null ? 14 : 11}px system-ui, sans-serif`
  ctx.fillStyle = '#c9bca6'
  const label = id < 3 ? ['clover', 'rounded diamond', 'rounded hex'][id] : CLEARING_SPECS[id]!.label
  ctx.fillText(`${label} · ${t.theme.decor} · ${theme}`, cx, cy - cell / 2 - 2)
})
}
render()
// Painted terrain (?art=procedural keeps the vector art) lands async: re-render
// once per art revision, ready when nothing new arrived for 1.5 s.
const artKey = () => `${terrainArtRevision()}:${floorArtRevision()}:${borderArtRevision()}:${backdropArtRevision()}`
let seen = artKey()
let quiet = 0
const tick = () => {
  if (artKey() !== seen) { seen = artKey(); quiet = 0; render() }
  // keeps watching after ready: late art still re-renders
  if (++quiet > 90) (window as unknown as { __arenasReady: boolean }).__arenasReady = true
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
