// ─── Arena terrain art: one draw function per feature kind ──────────────────
//
// Flat cartoon vector art for every terrain feature and floor-decor kind.
// Each kind has exactly ONE function here, so the paint pipeline can swap a
// kind for a painted sprite by replacing (or wrapping) its entry in
// TERRAIN_FEATURE_DRAW / DECOR_DRAW — one seam per kind. Perf/art rules: flat
// fills, outlines and alpha shapes only — no blur, no radial gradients, no
// shadowBlur, no ctx.filter. Everything is drawn once into the cached static
// arena buffer, never per frame.
import type {
  DecorKind, TerrainArrow, TerrainBooster, TerrainDisc, TerrainHole, TerrainIsland, TerrainLayout, TerrainLog
} from '@/use/arenaTerrain'
import { OBSTACLE_LOOK, type ArenaTheme, type DiscLook, type LogLook } from '@/use/arenaThemes'
import { OBSTACLE_DRAW, drawThemedLog } from '@/use/arenaObstacleDraw'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export const TERRAIN_OUTLINE = '#2c2116'

const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

// ── Holes ────────────────────────────────────────────────────────────────
const drawMud = (ctx: Ctx, h: TerrainHole) => {
  ctx.lineWidth = 2
  ctx.strokeStyle = TERRAIN_OUTLINE
  ctx.fillStyle = '#7a5532'
  circle(ctx, h.x, h.y, h.radius)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#5f3f22'
  circle(ctx, h.x + h.radius * 0.12, h.y + h.radius * 0.1, h.radius * 0.68)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 240, 210, 0.35)'
  circle(ctx, h.x - h.radius * 0.35, h.y - h.radius * 0.3, h.radius * 0.16)
  ctx.fill()
  circle(ctx, h.x + h.radius * 0.3, h.y + h.radius * 0.25, h.radius * 0.1)
  ctx.fill()
}

const drawDeepHole = (ctx: Ctx, h: TerrainHole) => {
  ctx.lineWidth = 2
  ctx.strokeStyle = TERRAIN_OUTLINE
  ctx.fillStyle = '#6b4a2e'
  circle(ctx, h.x, h.y, h.radius)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#2a1a10'
  circle(ctx, h.x, h.y + 1.5, h.radius * 0.72)
  ctx.fill()
  ctx.fillStyle = '#120a05'
  circle(ctx, h.x, h.y + 2.5, h.radius * 0.45)
  ctx.fill()
}

// ── Honey: a golden puddle with drips and a shine ─────────────────────────
const drawHoney = (ctx: Ctx, d: TerrainDisc) => {
  const r = d.radius
  ctx.lineWidth = 2
  ctx.strokeStyle = '#7a4a10'
  ctx.fillStyle = '#f2a516'
  ctx.beginPath()
  for (let k = 0; k <= 16; k++) {
    const t = (k / 16) * Math.PI * 2
    const rr = r * (0.92 + 0.08 * Math.cos(t * 5 + 0.6))
    const px = d.x + Math.cos(t) * rr
    const py = d.y + Math.sin(t) * rr
    if (k === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffc93c'
  circle(ctx, d.x - r * 0.1, d.y - r * 0.08, r * 0.66)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 252, 230, 0.75)'
  ctx.beginPath()
  ctx.ellipse(d.x - r * 0.32, d.y - r * 0.34, r * 0.22, r * 0.1, -0.6, 0, Math.PI * 2)
  ctx.fill()
  circle(ctx, d.x + r * 0.3, d.y + r * 0.22, r * 0.08)
  ctx.fill()
}

// ── Speed booster: a sunny pad with two chevrons ──────────────────────────
const drawBooster = (ctx: Ctx, b: TerrainBooster) => {
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.rotate(b.angle)
  ctx.lineWidth = 2
  ctx.strokeStyle = TERRAIN_OUTLINE
  ctx.fillStyle = '#ffd23f'
  circle(ctx, 0, 0, b.radius)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ff9f1c'
  circle(ctx, 0, 0, b.radius * 0.78)
  ctx.fill()
  ctx.fillStyle = '#fffbe6'
  ctx.lineWidth = 1.2
  for (const off of [-0.32, 0.18]) {
    const s = b.radius
    ctx.beginPath()
    ctx.moveTo(s * (off + 0.36), 0)
    ctx.lineTo(s * (off - 0.06), -s * 0.42)
    ctx.lineTo(s * (off - 0.24), -s * 0.42)
    ctx.lineTo(s * (off + 0.12), 0)
    ctx.lineTo(s * (off - 0.24), s * 0.42)
    ctx.lineTo(s * (off - 0.06), s * 0.42)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

// ── Leaf arrow: a big green leaf pointing along `angle`, white arrow vein ──
const drawLeafArrow = (ctx: Ctx, a: TerrainArrow) => {
  const r = a.radius
  ctx.save()
  ctx.translate(a.x, a.y)
  ctx.rotate(a.angle)
  ctx.lineWidth = 2
  ctx.strokeStyle = TERRAIN_OUTLINE
  ctx.fillStyle = '#3f9a3a'
  ctx.beginPath()
  ctx.moveTo(r * 1.05, 0)
  ctx.quadraticCurveTo(r * 0.2, -r * 0.95, -r * 0.95, -r * 0.2)
  ctx.lineTo(-r * 0.95, r * 0.2)
  ctx.quadraticCurveTo(r * 0.2, r * 0.95, r * 1.05, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#5cbf4f'
  ctx.beginPath()
  ctx.moveTo(r * 0.8, 0)
  ctx.quadraticCurveTo(r * 0.15, -r * 0.7, -r * 0.7, -r * 0.12)
  ctx.lineTo(-r * 0.7, 0)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#f4ffe8'
  ctx.lineWidth = Math.max(1.6, r * 0.14)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(-r * 0.6, 0)
  ctx.lineTo(r * 0.55, 0)
  ctx.moveTo(r * 0.12, -r * 0.36)
  ctx.lineTo(r * 0.58, 0)
  ctx.lineTo(r * 0.12, r * 0.36)
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.restore()
}

// ── Islands ──────────────────────────────────────────────────────────────
const islandShadow = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  circle(ctx, x + 3, y + 4, r)
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = TERRAIN_OUTLINE
}

const drawStump = (ctx: Ctx, isl: TerrainIsland) => {
  const r = isl.radius
  islandShadow(ctx, isl.x, isl.y, r)
  ctx.fillStyle = '#8a5a35'
  circle(ctx, isl.x, isl.y, r)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#e8c48a'
  circle(ctx, isl.x, isl.y, r * 0.8)
  ctx.fill()
  ctx.strokeStyle = '#b98a55'
  ctx.lineWidth = 1.5
  for (const k of [0.6, 0.4, 0.2]) {
    circle(ctx, isl.x, isl.y, r * k)
    ctx.stroke()
  }
  // moss tuft + mushroom
  ctx.fillStyle = '#5aa957'
  ctx.strokeStyle = TERRAIN_OUTLINE
  circle(ctx, isl.x - r * 0.75, isl.y - r * 0.5, r * 0.28)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#e4574a'
  ctx.beginPath()
  ctx.arc(isl.x + r * 0.78, isl.y + r * 0.5, r * 0.22, Math.PI, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

const drawRock = (ctx: Ctx, isl: TerrainIsland) => {
  const r = isl.radius
  islandShadow(ctx, isl.x, isl.y, r)
  ctx.fillStyle = '#8d8f96'
  circle(ctx, isl.x, isl.y, r)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#a7a9b0'
  circle(ctx, isl.x - r * 0.18, isl.y - r * 0.2, r * 0.66)
  ctx.fill()
  ctx.fillStyle = '#5aa957'
  circle(ctx, isl.x + r * 0.35, isl.y + r * 0.45, r * 0.4)
  ctx.fill()
  // a little tree: trunk + round crown
  ctx.lineWidth = 1.5
  ctx.fillStyle = '#7a4f2c'
  ctx.fillRect(isl.x - 2.5, isl.y - r * 0.15, 5, r * 0.45)
  ctx.strokeRect(isl.x - 2.5, isl.y - r * 0.15, 5, r * 0.45)
  ctx.fillStyle = '#4e9a4e'
  circle(ctx, isl.x, isl.y - r * 0.32, r * 0.42)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
  circle(ctx, isl.x - r * 0.12, isl.y - r * 0.45, r * 0.13)
  ctx.fill()
}

const drawPondIsland = (ctx: Ctx, isl: TerrainIsland) => {
  const r = isl.radius
  islandShadow(ctx, isl.x, isl.y, r)
  // grassy ring around a little pond with a lily pad
  ctx.fillStyle = '#5aa957'
  circle(ctx, isl.x, isl.y, r)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#4fb4d8'
  circle(ctx, isl.x, isl.y, r * 0.66)
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#86d0ea'
  circle(ctx, isl.x - r * 0.2, isl.y - r * 0.2, r * 0.22)
  ctx.fill()
  ctx.fillStyle = '#3f8f3f'
  ctx.beginPath()
  ctx.moveTo(isl.x + r * 0.2, isl.y + r * 0.15)
  ctx.arc(isl.x + r * 0.2, isl.y + r * 0.15, r * 0.2, 0.4, Math.PI * 2 - 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

// ── Mushroom cap: a big red toadstool top with white spots (bouncy) ───────
const drawMushroom = (ctx: Ctx, m: TerrainDisc) => {
  const r = m.radius
  islandShadow(ctx, m.x, m.y, r)
  ctx.fillStyle = '#e2453c'
  circle(ctx, m.x, m.y, r)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#f2685c'
  circle(ctx, m.x - r * 0.12, m.y - r * 0.14, r * 0.7)
  ctx.fill()
  ctx.fillStyle = '#fff6ea'
  ctx.strokeStyle = TERRAIN_OUTLINE
  ctx.lineWidth = 1.2
  const spots: readonly [number, number, number][] = [[0, 0, 0.26], [-0.5, -0.34, 0.16], [0.5, -0.3, 0.15], [-0.4, 0.46, 0.14], [0.46, 0.44, 0.17]]
  for (const [sx, sy, sr] of spots) {
    circle(ctx, m.x + sx * r, m.y + sy * r, sr * r)
    ctx.fill()
    ctx.stroke()
  }
}

// ── Log: a capsule with bark, cut ends and growth rings ───────────────────
const drawLog = (ctx: Ctx, l: TerrainLog) => {
  const r = l.radius
  const len = Math.hypot(l.bx - l.ax, l.by - l.ay)
  const ang = Math.atan2(l.by - l.ay, l.bx - l.ax)
  ctx.save()
  ctx.translate(l.ax, l.ay)
  ctx.rotate(ang)
  // shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.beginPath()
  ctx.arc(3, 4, r, Math.PI / 2, Math.PI * 1.5)
  ctx.arc(len + 3, 4, r, -Math.PI / 2, Math.PI / 2)
  ctx.closePath()
  ctx.fill()
  // bark body
  ctx.lineWidth = 2.5
  ctx.strokeStyle = TERRAIN_OUTLINE
  ctx.fillStyle = '#80522e'
  ctx.beginPath()
  ctx.arc(0, 0, r, Math.PI / 2, Math.PI * 1.5)
  ctx.arc(len, 0, r, -Math.PI / 2, Math.PI / 2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // wood grain: two long solid lines along the body (never dashes) + a knot
  ctx.strokeStyle = '#5e3a1e'
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  const g0 = r * 0.35
  const g1 = len - r * 0.2
  if (g1 > g0) {
    ctx.beginPath()
    ctx.moveTo(g0, -r * 0.5)
    ctx.quadraticCurveTo((g0 + g1) / 2, -r * 0.62, g1, -r * 0.48)
    ctx.moveTo(g0 + r * 0.3, r * 0.42)
    ctx.quadraticCurveTo((g0 + g1) / 2, r * 0.3, g1, r * 0.46)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  if (len > r * 1.6) {
    ctx.fillStyle = '#5e3a1e'
    ctx.beginPath()
    ctx.ellipse(len * 0.62, r * 0.05, r * 0.24, r * 0.15, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#80522e'
    ctx.beginPath()
    ctx.ellipse(len * 0.62, r * 0.05, r * 0.1, r * 0.06, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // light top edge
  ctx.fillStyle = 'rgba(255, 230, 190, 0.22)'
  ctx.fillRect(0, -r * 0.85, len, r * 0.28)
  // cut end with rings
  ctx.fillStyle = '#e8c48a'
  ctx.strokeStyle = TERRAIN_OUTLINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(len, 0, r * 0.62, r * 0.92, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#b98a55'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.ellipse(len, 0, r * 0.32, r * 0.5, 0, 0, Math.PI * 2)
  ctx.stroke()
  // a moss patch
  ctx.fillStyle = '#5aa957'
  ctx.beginPath()
  ctx.ellipse(len * 0.35, -r * 0.35, r * 0.5, r * 0.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export type TerrainFeatureKind = 'mud' | 'deepHole' | 'honey' | 'booster' | 'leafArrow' | 'stump' | 'rock' | 'pond' | 'mushroom' | 'log'

/** One draw function per feature kind — the sprite seam for painted art. */
export const TERRAIN_FEATURE_DRAW = {
  mud: drawMud,
  deepHole: drawDeepHole,
  honey: drawHoney,
  booster: drawBooster,
  leafArrow: drawLeafArrow,
  stump: drawStump,
  rock: drawRock,
  pond: drawPondIsland,
  mushroom: drawMushroom,
  log: drawLog
}

// #Consistency-4/-5: the painted green leaf arrows and golden honey are woodland art. On other
// themes they are hue-graded (once, in the static bake) so they belong to the ground: ember
// arrows + tar on volcanic, icy arrows + blue-white "frost gel" on snowy, muted on ruins/rocky.
const ARROW_GRADE: Readonly<Partial<Record<ArenaTheme, string>>> = {
  volcanic: 'hue-rotate(-92deg) saturate(1.15) brightness(1.05)',
  snowy: 'hue-rotate(78deg) saturate(0.8) brightness(1.15)',
  ruins: 'hue-rotate(-28deg) saturate(0.7)',
  rocky: 'saturate(0.7) brightness(0.95)',
  bedroom: 'hue-rotate(-60deg) saturate(1.1)'
}
const HONEY_GRADE: Readonly<Partial<Record<ArenaTheme, string>>> = {
  volcanic: 'hue-rotate(-12deg) saturate(0.7) brightness(0.45)',
  snowy: 'hue-rotate(165deg) saturate(0.55) brightness(1.2)',
  ruins: 'saturate(0.55) brightness(0.85)',
  rocky: 'saturate(0.6) brightness(0.8)'
}
const withGrade = (ctx: Ctx, grade: string | undefined, draw: () => void): void => {
  if (!grade || !('filter' in ctx)) return draw()
  const prev = ctx.filter
  ctx.filter = grade
  draw()
  ctx.filter = prev
}

/** Draws every feature of a layout, flat ground first, solids on top. Solids
 *  wear the arena theme's look (arenaThemes OBSTACLE_LOOK — visual only). */
export const renderTerrainFeatures = (ctx: Ctx, t: TerrainLayout, theme: ArenaTheme = 'meadow'): void => {
  const D = TERRAIN_FEATURE_DRAW
  const look = OBSTACLE_LOOK[theme]
  for (const h of t.holes) (h.deep ? D.deepHole : D.mud)(ctx, h)
  withGrade(ctx, HONEY_GRADE[theme], () => { for (const h of t.honey) D.honey(ctx, h) })
  for (const b of t.boosters) D.booster(ctx, b)
  withGrade(ctx, ARROW_GRADE[theme], () => { for (const a of t.arrows) D.leafArrow(ctx, a) })
  for (const isl of t.islands) {
    const k = look[isl.kind]
    if (k === 'plain') D[isl.kind](ctx, isl)
    else OBSTACLE_DRAW[k as DiscLook](ctx, isl)
  }
  for (const l of t.logs) {
    if (look.log === 'plain') D.log(ctx, l)
    else drawThemedLog(ctx, l, look.log as LogLook)
  }
  for (const m of t.mushrooms) {
    if (look.mushroom === 'plain') D.mushroom(ctx, m)
    else OBSTACLE_DRAW[look.mushroom as DiscLook](ctx, m)
  }
}

// ── Floor decor (tiny, scattered by the arena renderer) ─────────────────────

/** `base`: the floor's base colour (the painted decor picks its pebble look by it). */
export interface DecorPalette { tuft: string; flower: string; base?: string }

const tuft = (ctx: Ctx, x: number, y: number, c: string) => {
  ctx.strokeStyle = c
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - 3, y + 2)
  ctx.lineTo(x - 1.5, y - 3)
  ctx.moveTo(x, y + 2)
  ctx.lineTo(x, y - 4.5)
  ctx.moveTo(x + 3, y + 2)
  ctx.lineTo(x + 1.5, y - 3)
  ctx.stroke()
  ctx.lineCap = 'butt'
}

const flower = (ctx: Ctx, x: number, y: number, c: string) => {
  ctx.fillStyle = c
  circle(ctx, x, y, 2.2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  circle(ctx, x - 0.6, y - 0.6, 0.8)
  ctx.fill()
}

/** `i` = scatter index (deterministic variety). Every 3rd spot is the accent. */
export const DECOR_DRAW: Record<DecorKind, (ctx: Ctx, x: number, y: number, i: number, p: DecorPalette) => void> = {
  tufts: (ctx, x, y, i, p) => (i % 3 === 0 ? flower(ctx, x, y, p.flower) : tuft(ctx, x, y, p.tuft)),
  flowers: (ctx, x, y, i, p) => {
    if (i % 2 === 1) return tuft(ctx, x, y, p.tuft)
    const cols = ['#fff27a', '#ffffff', '#ff9ec7', '#b7a3ff']
    ctx.fillStyle = cols[i % 4]!
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2
      circle(ctx, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.5)
      ctx.fill()
    }
    ctx.fillStyle = '#f5a623'
    circle(ctx, x, y, 1.2)
    ctx.fill()
  },
  ferns: (ctx, x, y, i, p) => {
    if (i % 3 === 0) return flower(ctx, x, y, p.flower)
    ctx.strokeStyle = p.tuft
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    const s = i % 2 ? 1 : -1
    ctx.beginPath()
    ctx.moveTo(x, y + 4)
    ctx.quadraticCurveTo(x + s * 1.5, y - 1, x + s * 4, y - 5)
    for (let k = 0; k < 3; k++) {
      const t = 0.25 + k * 0.25
      const px = x + s * 4 * t * t
      const py = y + 4 - 9 * t
      ctx.moveTo(px, py)
      ctx.lineTo(px - 2.6, py - 1.4)
      ctx.moveTo(px, py)
      ctx.lineTo(px + 2.6, py - 1.4)
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
  },
  pebbles: (ctx, x, y, i, p) => {
    if (i % 3 === 0) return tuft(ctx, x, y, p.tuft)
    ctx.fillStyle = i % 2 ? '#a7a39a' : '#8f8b84'
    ctx.beginPath()
    ctx.ellipse(x, y, 2.8, 2, (i % 5) * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    circle(ctx, x - 0.8, y - 0.6, 0.8)
    ctx.fill()
  },
  leaves: (ctx, x, y, i, p) => {
    if (i % 3 === 0) return tuft(ctx, x, y, p.tuft)
    const cols = ['#d9822b', '#c4532d', '#e8b03a']
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(i * 1.3)
    ctx.fillStyle = cols[i % 3]!
    ctx.beginPath()
    ctx.moveTo(3.5, 0)
    ctx.quadraticCurveTo(0, -2.6, -3.5, 0)
    ctx.quadraticCurveTo(0, 2.6, 3.5, 0)
    ctx.fill()
    ctx.restore()
  },
  snow: (ctx, x, y, i, p) => {
    if (i % 4 === 0) return tuft(ctx, x, y, p.tuft)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    circle(ctx, x, y, 2 + (i % 3) * 0.7)
    ctx.fill()
    circle(ctx, x + 2.5, y + 0.8, 1.4)
    ctx.fill()
  },
  reeds: (ctx, x, y, i, p) => {
    if (i % 3 === 0) return flower(ctx, x, y, p.flower)
    ctx.strokeStyle = p.tuft
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x - 1.5, y + 3)
    ctx.lineTo(x - 2, y - 5)
    ctx.moveTo(x + 1.5, y + 3)
    ctx.lineTo(x + 2.2, y - 4)
    ctx.stroke()
    ctx.fillStyle = '#7a4f2c'
    ctx.beginPath()
    ctx.ellipse(x - 2, y - 6, 1.1, 2.2, 0, 0, Math.PI * 2)
    ctx.fill()
  },
  acorns: (ctx, x, y, i, p) => {
    if (i % 2 === 1) return tuft(ctx, x, y, p.tuft)
    ctx.fillStyle = '#b07a3c'
    ctx.beginPath()
    ctx.ellipse(x, y + 0.8, 2, 2.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6b4424'
    ctx.beginPath()
    ctx.arc(x, y - 0.6, 2.3, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
  },
  cones: (ctx, x, y, i, p) => {
    if (i % 2 === 1) return tuft(ctx, x, y, p.tuft)
    ctx.fillStyle = '#8a5a2e'
    ctx.beginPath()
    ctx.ellipse(x, y, 2.2, 3.4, 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#5e3a1e'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x - 1.8, y - 1)
    ctx.lineTo(x + 1.8, y - 0.2)
    ctx.moveTo(x - 1.8, y + 1)
    ctx.lineTo(x + 1.8, y + 1.8)
    ctx.stroke()
  },
  toadstools: (ctx, x, y, i, p) => {
    if (i % 2 === 1) return tuft(ctx, x, y, p.tuft)
    ctx.fillStyle = '#f3ead8'
    ctx.fillRect(x - 0.9, y - 1, 1.8, 3.6)
    ctx.fillStyle = i % 4 === 0 ? '#e2453c' : '#c98a3c'
    ctx.beginPath()
    ctx.arc(x, y - 0.8, 3, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    circle(ctx, x - 1, y - 2, 0.6)
    ctx.fill()
  }
}
