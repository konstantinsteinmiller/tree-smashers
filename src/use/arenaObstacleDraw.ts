// ─── Themed obstacle looks (procedural) ──────────────────────────────────────
//
// One draw function per themed look of a SOLID terrain feature (arenaThemes.ts
// OBSTACLE_LOOK): an igloo instead of a mushroom cap on a snowfield, a broken
// column instead of a stump in the ruins, a toy drum in the bedroom … Visual
// only — physics reads the feature's own kind and radius. These are the
// fallback drawings AND the layout references the painted atlases are made
// from (tools/terrain-sheets/export.mjs --set obstacles-a|obstacles-b); the
// paint override wraps the disc entries (arenaTerrainArt.ts). Same art rules
// as arenaTerrainDraw: flat fills + outlines, no blur, drawn once into the
// static arena buffer.
import type { TerrainDisc, TerrainLog } from '@/use/arenaTerrain'
import type { DiscLook, LogLook } from '@/use/arenaThemes'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const OUTLINE = '#2c2116'

const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}
const shadow = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  circle(ctx, x + 3, y + 4, r)
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = OUTLINE
}
/** A bumpy blob (rocks, drifts): deterministic lobes. */
const blob = (ctx: Ctx, x: number, y: number, r: number, lobes: number, amp: number, phase = 0) => {
  ctx.beginPath()
  for (let k = 0; k <= 32; k++) {
    const t = (k / 32) * Math.PI * 2
    const rr = r * (1 - amp + amp * Math.cos(t * lobes + phase))
    const px = x + Math.cos(t) * rr
    const py = y + Math.sin(t) * rr
    if (k === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}
const disc = (ctx: Ctx, x: number, y: number, r: number, fill: string, stroke = true) => {
  ctx.fillStyle = fill
  circle(ctx, x, y, r)
  ctx.fill()
  if (stroke) ctx.stroke()
}
const rings = (ctx: Ctx, x: number, y: number, r: number, color: string, ks: readonly number[]) => {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  for (const k of ks) {
    circle(ctx, x, y, r * k)
    ctx.stroke()
  }
  ctx.strokeStyle = OUTLINE
}

// ── Snowy ──────────────────────────────────────────────────────────────────
const igloo = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#eef7fd')
  ctx.fillStyle = '#ffffff'
  circle(ctx, x - r * 0.15, y - r * 0.18, r * 0.62)
  ctx.fill()
  // ice-block courses (concentric) + staggered joints
  ctx.strokeStyle = '#9cc3dd'
  ctx.lineWidth = 1.3
  for (const k of [0.72, 0.46, 0.22]) {
    circle(ctx, x, y, r * k)
    ctx.stroke()
  }
  ctx.beginPath()
  for (const [k0, k1, n, off] of [[0.72, 1, 10, 0], [0.46, 0.72, 8, 0.4], [0.22, 0.46, 6, 0.1]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off
      ctx.moveTo(x + Math.cos(a) * r * k0, y + Math.sin(a) * r * k0)
      ctx.lineTo(x + Math.cos(a) * r * k1 * 0.98, y + Math.sin(a) * r * k1 * 0.98)
    }
  }
  ctx.stroke()
  // the entrance tunnel, facing down
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 2
  ctx.fillStyle = '#e2f0fa'
  ctx.beginPath()
  ctx.ellipse(x, y + r * 0.82, r * 0.34, r * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#29435a'
  ctx.beginPath()
  ctx.ellipse(x, y + r * 0.9, r * 0.2, r * 0.13, 0, 0, Math.PI * 2)
  ctx.fill()
}

const snowCap = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#8fb8d6'
  ctx.lineWidth = 1.3
  blob(ctx, x, y, r, 5, 0.12, 0.7)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
}

const snowStump = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#7a5232')
  ctx.fillStyle = '#d9bd8c'
  circle(ctx, x, y, r * 0.8)
  ctx.fill()
  rings(ctx, x, y, r, '#b08a5a', [0.6, 0.4])
  snowCap(ctx, x - r * 0.12, y - r * 0.14, r * 0.62)
  ctx.fillStyle = '#dff0fb'
  circle(ctx, x + r * 0.55, y + r * 0.58, r * 0.18)
  ctx.fill()
}

const iceBoulder = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  ctx.fillStyle = '#9fd3ee'
  blob(ctx, x, y, r, 6, 0.06)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#c8ebfa'
  ctx.beginPath()
  ctx.moveTo(x - r * 0.7, y - r * 0.1)
  ctx.lineTo(x - r * 0.2, y - r * 0.72)
  ctx.lineTo(x + r * 0.45, y - r * 0.55)
  ctx.lineTo(x + r * 0.1, y + r * 0.05)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#5f9fc4'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(x + r * 0.1, y + r * 0.05)
  ctx.lineTo(x + r * 0.55, y + r * 0.6)
  ctx.moveTo(x + r * 0.1, y + r * 0.05)
  ctx.lineTo(x - r * 0.45, y + r * 0.55)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  circle(ctx, x - r * 0.3, y - r * 0.42, r * 0.12)
  ctx.fill()
  ctx.strokeStyle = OUTLINE
}

const frozenPond = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#f4faff')
  ctx.fillStyle = '#8ccbe8'
  circle(ctx, x, y, r * 0.66)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.strokeStyle = '#e8f7ff'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x - r * 0.4, y - r * 0.2)
  ctx.lineTo(x - r * 0.05, y + r * 0.05)
  ctx.lineTo(x + r * 0.35, y - r * 0.15)
  ctx.moveTo(x - r * 0.05, y + r * 0.05)
  ctx.lineTo(x + r * 0.1, y + r * 0.45)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.25, y - r * 0.32, r * 0.2, r * 0.07, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = OUTLINE
}

// ── Volcanic (long-cooled: basalt, charcoal — no glow) ───────────────────
const charredStump = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#2f2622')
  ctx.fillStyle = '#4a3a30'
  circle(ctx, x, y, r * 0.8)
  ctx.fill()
  rings(ctx, x, y, r, '#211a17', [0.6, 0.4, 0.2])
  ctx.strokeStyle = '#15100e'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.3
    ctx.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25)
    ctx.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78)
  }
  ctx.stroke()
  ctx.fillStyle = '#8e8a86'
  circle(ctx, x - r * 0.42, y - r * 0.38, r * 0.14)
  ctx.fill()
  ctx.strokeStyle = OUTLINE
}

const basaltRock = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  ctx.fillStyle = '#3a3836'
  ctx.beginPath()
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6
    if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // column tops: a hexagon cluster
  ctx.lineWidth = 1.3
  for (const [cx, cy, s, c] of [[0, 0, 0.36, '#5a5653'], [-0.5, -0.3, 0.26, '#4d4a47'], [0.5, -0.3, 0.26, '#504c49'], [0, 0.56, 0.26, '#46433f']] as const) {
    ctx.fillStyle = c
    ctx.beginPath()
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6
      const px = x + cx * r + Math.cos(a) * s * r
      const py = y + cy * r + Math.sin(a) * s * r
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

const cooledLavaPool = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  ctx.fillStyle = '#4a403a'
  blob(ctx, x, y, r, 7, 0.05)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#1f1b19'
  circle(ctx, x, y, r * 0.64)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.stroke()
  // ropy pahoehoe swirls
  ctx.strokeStyle = '#3d3632'
  ctx.lineWidth = 1.3
  for (const k of [0.45, 0.28]) {
    ctx.beginPath()
    ctx.arc(x + r * 0.05, y + r * 0.04, r * k, 0.3, Math.PI * 1.6)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(200, 190, 180, 0.35)'
  circle(ctx, x - r * 0.25, y - r * 0.28, r * 0.1)
  ctx.fill()
  ctx.strokeStyle = OUTLINE
}

const lavaDome = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#5b4a42')
  ctx.fillStyle = '#76625a'
  circle(ctx, x - r * 0.14, y - r * 0.16, r * 0.66)
  ctx.fill()
  // pumice pores (a springy cooled lava dome)
  ctx.fillStyle = '#3b302b'
  for (const [sx, sy, sr] of [[0, 0, 0.12], [-0.45, -0.25, 0.09], [0.4, -0.35, 0.1], [-0.3, 0.45, 0.1], [0.45, 0.35, 0.12], [0.1, -0.6, 0.07], [-0.65, 0.1, 0.07]] as const) {
    circle(ctx, x + sx * r, y + sy * r, sr * r)
    ctx.fill()
  }
}

// ── Rocky ──────────────────────────────────────────────────────────────────
const boulder = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  ctx.fillStyle = '#a08f74'
  blob(ctx, x, y, r, 5, 0.07, 0.4)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#bba98a'
  blob(ctx, x - r * 0.16, y - r * 0.18, r * 0.62, 4, 0.08)
  ctx.fill()
  ctx.strokeStyle = '#6e5f4a'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(x + r * 0.15, y + r * 0.1)
  ctx.lineTo(x + r * 0.5, y + r * 0.5)
  ctx.lineTo(x + r * 0.42, y + r * 0.75)
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
}

const mossDome = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#8d8f96')
  ctx.fillStyle = '#5aa957'
  blob(ctx, x - r * 0.08, y - r * 0.1, r * 0.78, 6, 0.1, 1)
  ctx.fill()
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.fillStyle = '#7cc46a'
  circle(ctx, x - r * 0.25, y - r * 0.3, r * 0.3)
  ctx.fill()
  ctx.fillStyle = '#e8dcc0'
  for (const [sx, sy] of [[0.3, 0.2], [-0.35, 0.35], [0.1, -0.45]] as const) {
    circle(ctx, x + sx * r, y + sy * r, r * 0.07)
    ctx.fill()
  }
}

// ── Ruins ──────────────────────────────────────────────────────────────────
const brokenColumn = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#b7a58e')
  // fluting around the shaft
  ctx.strokeStyle = '#8c7a64'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    ctx.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82)
    ctx.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98)
  }
  ctx.stroke()
  // jagged broken top face
  ctx.fillStyle = '#d8c9b2'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.6
  blob(ctx, x, y, r * 0.72, 9, 0.1, 0.5)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#a8957c'
  circle(ctx, x + r * 0.2, y + r * 0.15, r * 0.18)
  ctx.fill()
}

const stoneBlock = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  const s = r * 0.86
  ctx.fillStyle = '#9a8670'
  ctx.beginPath()
  ctx.roundRect(x - s, y - s, s * 2, s * 2, r * 0.18)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#b5a28a'
  ctx.fillRect(x - s * 0.8, y - s * 0.8, s * 1.6, s * 1.1)
  ctx.strokeStyle = '#6e5c4a'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(x - s * 0.8, y + s * 0.3)
  ctx.lineTo(x + s * 0.8, y + s * 0.3)
  ctx.moveTo(x, y - s * 0.8)
  ctx.lineTo(x - s * 0.1, y + s * 0.3)
  ctx.stroke()
  // a carved rune
  ctx.strokeStyle = '#5a3a30'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(x + s * 0.35, y - s * 0.55)
  ctx.lineTo(x + s * 0.35, y - s * 0.05)
  ctx.moveTo(x + s * 0.2, y - s * 0.4)
  ctx.lineTo(x + s * 0.5, y - s * 0.25)
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
}

const ruinWell = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#a8957c')
  ctx.strokeStyle = '#7a6752'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2
    ctx.moveTo(x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68)
    ctx.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98)
  }
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
  ctx.fillStyle = '#2f5a68'
  circle(ctx, x, y, r * 0.66)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#4a8494'
  circle(ctx, x - r * 0.18, y - r * 0.18, r * 0.24)
  ctx.fill()
}

const runeDome = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#8a7864')
  ctx.fillStyle = '#a5917a'
  circle(ctx, x - r * 0.1, y - r * 0.12, r * 0.72)
  ctx.fill()
  ctx.strokeStyle = '#8a3a2e'
  ctx.lineWidth = 1.8
  circle(ctx, x, y, r * 0.45)
  ctx.stroke()
  // a carved triangle rune with a dot
  ctx.beginPath()
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    const px = x + Math.cos(a) * r * 0.3
    const py = y + Math.sin(a) * r * 0.3
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.fillStyle = '#8a3a2e'
  circle(ctx, x, y + r * 0.02, r * 0.07)
  ctx.fill()
  ctx.strokeStyle = OUTLINE
}

// ── Bedroom (toy box) ──────────────────────────────────────────────────────
const blockStack = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  ctx.lineWidth = 2
  const blocks: readonly [number, number, number, number, string][] = [
    [-0.5, 0.15, 0.5, 0.15, '#e2453c'], [0.25, 0.3, 0.48, -0.25, '#3f8fd8'], [-0.15, -0.45, 0.46, 0.35, '#ffcf3f']
  ]
  for (const [bx, by, s, rot, c] of blocks) {
    ctx.save()
    ctx.translate(x + bx * r, y + by * r)
    ctx.rotate(rot)
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.roundRect(-s * r, -s * r, s * r * 2, s * r * 2, r * 0.08)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.fillRect(-s * r * 0.35, -s * r * 0.08, s * r * 0.7, s * r * 0.16)
    ctx.restore()
  }
}

const cushion = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  const s = r * 0.9
  ctx.fillStyle = '#b06ac8'
  ctx.beginPath()
  ctx.moveTo(x - s, y - s)
  ctx.quadraticCurveTo(x, y - s * 0.75, x + s, y - s)
  ctx.quadraticCurveTo(x + s * 0.75, y, x + s, y + s)
  ctx.quadraticCurveTo(x, y + s * 0.75, x - s, y + s)
  ctx.quadraticCurveTo(x - s * 0.75, y, x - s, y - s)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#c98ad9'
  circle(ctx, x - r * 0.15, y - r * 0.15, r * 0.48)
  ctx.fill()
  ctx.fillStyle = '#7a3f8f'
  circle(ctx, x, y, r * 0.1)
  ctx.fill()
  ctx.fillStyle = '#ffd34a'
  for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    circle(ctx, x + cx * s, y + cy * s, r * 0.11)
    ctx.fill()
  }
}

const toyPool = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  // an inflatable paddling pool: striped ring around blue water
  disc(ctx, x, y, r, '#ffffff')
  ctx.fillStyle = '#e2453c'
  for (let i = 0; i < 8; i += 2) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.arc(x, y, r * 0.98, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#5fc0e8'
  circle(ctx, x, y, r * 0.62)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#ffd34a'
  circle(ctx, x + r * 0.2, y + r * 0.12, r * 0.15)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
  circle(ctx, x - r * 0.25, y - r * 0.25, r * 0.1)
  ctx.fill()
}

const toyDrum = (ctx: Ctx, d: TerrainDisc) => {
  const { x, y, radius: r } = d
  shadow(ctx, x, y, r)
  disc(ctx, x, y, r, '#e2453c')
  // zig-zag cord on the rim
  ctx.strokeStyle = '#ffd34a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const k = i % 2 ? 0.98 : 0.84
    const px = x + Math.cos(a) * r * k
    const py = y + Math.sin(a) * r * k
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.6
  ctx.fillStyle = '#fff4dc'
  circle(ctx, x, y, r * 0.78)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#f2e2c0'
  circle(ctx, x + r * 0.1, y + r * 0.1, r * 0.4)
  ctx.fill()
}

export const OBSTACLE_DRAW: Record<DiscLook, (ctx: Ctx, d: TerrainDisc) => void> = {
  igloo, snowStump, iceBoulder, frozenPond, charredStump, basaltRock, cooledLavaPool, lavaDome, boulder,
  brokenColumn, stoneBlock, ruinWell, runeDome, blockStack, cushion, toyPool, toyDrum, mossDome
}

// ── Themed logs (capsules) ─────────────────────────────────────────────────
interface LogPal { body: string, grain: string, end: string, ring: string, top?: string }
const LOG_PAL: Record<LogLook, LogPal> = {
  snowLog: { body: '#7a5232', grain: '#5a3a1e', end: '#d9bd8c', ring: '#b08a5a', top: '#ffffff' },
  charredLog: { body: '#2f2622', grain: '#15100e', end: '#4a3a30', ring: '#211a17' },
  fallenColumn: { body: '#b7a58e', grain: '#8c7a64', end: '#d8c9b2', ring: '#a8957c' },
  toyPlank: { body: '#3f8fd8', grain: '#2c6aa8', end: '#ffcf3f', ring: '#e2a51c' }
}

export const drawThemedLog = (ctx: Ctx, l: TerrainLog, look: LogLook): void => {
  const p = LOG_PAL[look]
  const r = l.radius
  const len = Math.hypot(l.bx - l.ax, l.by - l.ay)
  ctx.save()
  ctx.translate(l.ax, l.ay)
  ctx.rotate(Math.atan2(l.by - l.ay, l.bx - l.ax))
  const capsule = (dx: number, dy: number, rr: number) => {
    ctx.beginPath()
    ctx.arc(dx, dy, rr, Math.PI / 2, Math.PI * 1.5)
    ctx.arc(len + dx, dy, rr, -Math.PI / 2, Math.PI / 2)
    ctx.closePath()
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  capsule(3, 4, r)
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = OUTLINE
  ctx.fillStyle = p.body
  capsule(0, 0, r)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = p.grain
  ctx.lineWidth = 1.4
  ctx.beginPath()
  if (look === 'fallenColumn' || look === 'toyPlank') {
    for (const k of [-0.45, 0, 0.45]) {
      ctx.moveTo(0, r * k)
      ctx.lineTo(len, r * k)
    }
  } else {
    ctx.moveTo(r * 0.35, -r * 0.5)
    ctx.lineTo(len - r * 0.2, -r * 0.45)
    ctx.moveTo(r * 0.6, r * 0.42)
    ctx.lineTo(len - r * 0.2, r * 0.46)
  }
  ctx.stroke()
  if (p.top) {
    ctx.fillStyle = p.top
    ctx.strokeStyle = '#8fb8d6'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-r * 0.6, -r * 0.2)
    for (let i = 0; i <= 8; i++) ctx.lineTo(-r * 0.6 + (len + r * 1.2) * (i / 8), -r * (0.25 + (i % 2) * 0.12))
    ctx.lineTo(len + r * 0.6, -r * 0.55)
    ctx.quadraticCurveTo(len * 0.5, -r * 1.05, -r * 0.6, -r * 0.55)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 2
  ctx.fillStyle = p.end
  ctx.beginPath()
  ctx.ellipse(len, 0, r * 0.62, r * 0.92, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = p.ring
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.ellipse(len, 0, r * 0.32, r * 0.5, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
