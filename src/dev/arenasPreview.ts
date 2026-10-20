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
 */
import { CLEARING_SPECS, TERRAIN_SHAPES, isInside, traceArenaPath } from '@/use/arenaShapes'
import { TERRAIN_LAYOUT_COUNT, TERRAIN_LAYOUT_KEYS, buildTerrainLayout, createTower, terrainCircles } from '@/use/arenaTerrain'
import { DECOR_DRAW, renderTerrainFeatures } from '@/use/arenaTerrainDraw'
import en from '@/i18n/locales/en'

const R = 200
const BLADE = 28
const params = new URLSearchParams(location.search)
const only = params.get('id')
const showSpawns = params.get('spawns') !== '0'
const ids = only !== null ? [Number(only)] : [...Array(TERRAIN_LAYOUT_COUNT).keys()]
const cols = only !== null ? 1 : 5
const cell = only !== null ? 720 : 300
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
ctx.scale(dpr, dpr)

const names = (en as unknown as { terrain: { layout: Record<string, string> } }).terrain.layout
const DECOR_PAL = { tuft: '#4f9a3c', flower: '#fff27a' }

ids.forEach((id, n) => {
  const cx = (n % cols) * cell + cell / 2
  const cy = Math.floor(n / cols) * (cell + labelH) + labelH + cell / 2
  const s = (cell * 0.92) / (2 * R)
  const shape = TERRAIN_SHAPES[id]!
  const t = buildTerrainLayout(id)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  // Floor + lighter patches (as renderArenaStatic on the 'default' arena type).
  ctx.fillStyle = t.theme.floor?.[0] ?? '#7cc05c'
  traceArenaPath(ctx, shape, R)
  ctx.fill()
  // Decor scatter (same golden-angle law as the engine).
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996
    const r = R * (0.2 + 0.78 * ((i * 0.6180339) % 1))
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (!isInside(shape, x, y, R, 12)) continue
    if (terrainCircles(t).some(c => Math.hypot(c.x - x, c.y - y) < c.radius + 6)) continue
    DECOR_DRAW[t.theme.decor](ctx, x, y, i, DECOR_PAL)
  }
  // Log rim.
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#2c1d12'
  ctx.lineWidth = 11
  traceArenaPath(ctx, shape, R)
  ctx.stroke()
  ctx.strokeStyle = '#7a5130'
  ctx.lineWidth = 7
  traceArenaPath(ctx, shape, R)
  ctx.stroke()
  renderTerrainFeatures(ctx, t)
  // Towers (team colour discs) — set into the wall.
  for (const side of ['player', 'npc'] as const) {
    const tw = createTower(side, R, BLADE, 100, shape)
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
  ctx.fillText(`${label} · ${t.theme.decor}`, cx, cy - cell / 2 - 2)
})

;(window as unknown as { __arenasReady: boolean }).__arenasReady = true
