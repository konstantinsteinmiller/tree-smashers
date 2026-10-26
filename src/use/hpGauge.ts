// ─── In-battle HP gauge (smashers AND team towers) ──────────────────────────
//
// A chunky, notched arc that hugs the FRONT rim of a smasher's disc (or the
// arena side of a tower), so the plush on top stays fully visible:
//
//   · bold dark outline + dark track, the fill in the team colour
//     (player blue / enemy red) with a flat lighter top stripe;
//   · notches at every quarter of max HP (segmented read at a glance);
//   · a cream DAMAGE CHIP: after a hit the lost part stays visible for a
//     moment, then drains down to the new value;
//   · a hit FLASH (bar + badge go white for a beat) and a short SHAKE;
//   · LOW-HP PULSE (≤ 30 %): the fill blinks lighter and the badge throbs;
//   · the HP number on a team-coloured badge at the middle of the arc —
//     heavy white digits with a hard dark outline (no shadow, no blur).
//
// Flat fills and strokes only — no gradients, glow, shadowBlur or filters.
// No per-frame allocations: colours are module constants, digit strings and
// their widths are cached, state objects live per entity (created once).
// Purely visual: reads hp, never writes game state.
import { DISC_SQUASH, DISC_THICKNESS } from '@/smashers/smasherRig'

export const HP_GAUGE = {
  /** The lost HP stays visible this long before it drains. */
  CHIP_HOLD_MS: 420,
  /** Minimum chip drain speed, × maxHp per second. */
  CHIP_MIN_RATE: 0.35,
  /** Proportional chip drain (per second) on top of the minimum. */
  CHIP_EASE: 4,
  FLASH_MS: 130,
  SHAKE_MS: 260,
  /** Low-HP pulse at or below this fraction. */
  LOW: 0.3,
  /** Half the arc's angular span (rad). */
  HALF_SPAN: 1.18,
  /** Bar thickness (arena units) — track; the outline adds OUTLINE. */
  BAR: 5.2,
  OUTLINE: 1.6,
  /** Gap between the disc / tower body and the bar's inner edge. */
  GAP: 2.2,
  FONT_PX: 11.5,
  BADGE_H: 13
} as const

export interface HpGaugeState {
  /** HP the chip segment reaches down to (≥ current hp while draining). */
  chip: number
  /** Last hp seen — a drop starts the flash / shake / chip hold. */
  last: number
  hitAt: number
  lastT: number
}

export const newHpGaugeState = (hp: number): HpGaugeState => ({ chip: hp, last: hp, hitAt: -1e9, lastT: -1 })

/** Advance the chip / hit state to `now` (ms). Pure on the state object. */
export const stepHpGauge = (s: HpGaugeState, hp: number, maxHp: number, now: number): void => {
  const dt = s.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, (now - s.lastT) / 1000))
  s.lastT = now
  if (hp < s.last - 1e-6) s.hitAt = now
  s.last = hp
  if (hp >= s.chip) {
    s.chip = hp
    return
  }
  if (now - s.hitAt < HP_GAUGE.CHIP_HOLD_MS) return
  const rate = HP_GAUGE.CHIP_MIN_RATE * maxHp + (s.chip - hp) * HP_GAUGE.CHIP_EASE
  s.chip = Math.max(hp, s.chip - rate * dt)
}

// ── Palette (flat) ───────────────────────────────────────────────────────────
const INK = '#1b1530'
const TRACK = '#3a3150'
const CHIP = '#ffe7a3'
const WHITE = '#ffffff'
interface TeamPal { fill: string; lite: string; top: string; badge: string }
const TEAM: readonly [TeamPal, TeamPal] = [
  { fill: '#2f8cff', lite: '#7cc0ff', top: '#a6d6ff', badge: '#1d5fd0' }, // player
  { fill: '#f0413f', lite: '#ff8a7a', top: '#ffb3a6', badge: '#b8232f' } // enemy
]
const FONT = `900 ${HP_GAUGE.FONT_PX}px Nunito, Arial, sans-serif`

const HP_TEXT: string[] = []
const textOf = (n: number): string => HP_TEXT[n] ?? (HP_TEXT[n] = String(n))
const widthOf = new Map<string, number>()
let digitAscent = -1

/** Notch fractions along the bar (quarters of max HP). */
const NOTCHES = [0.25, 0.5, 0.75] as const

/**
 * Draw the gauge around an elliptic body edge centred at (cx, cy) with radii
 * (rx, ry) — `dir` +1 puts the arc on the bottom (front) side, −1 on the top.
 */
export const drawHpGauge = (
  ctx: CanvasRenderingContext2D,
  s: HpGaugeState,
  cx: number, cy: number, rx: number, ry: number,
  hp: number, maxHp: number,
  isPlayer: boolean, dir: 1 | -1, now: number,
  /** A tower's shorter, slimmer arc (wraps the tree's base, never reaches a neighbour). */
  look?: { halfSpan?: number, bar?: number }
): void => {
  stepHpGauge(s, hp, maxHp, now)
  const G = HP_GAUGE
  const HALF = look?.halfSpan ?? G.HALF_SPAN
  const BAR = look?.bar ?? G.BAR
  const pal = TEAM[isPlayer ? 0 : 1]
  const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
  const chipPct = maxHp > 0 ? Math.max(pct, Math.min(1, s.chip / maxHp)) : 0
  const since = now - s.hitAt
  const flashing = since >= 0 && since < G.FLASH_MS
  let x = cx
  if (since >= 0 && since < G.SHAKE_MS) x += Math.sin(since * 0.11) * 2.2 * (1 - since / G.SHAKE_MS)
  const low = pct > 0 && pct <= G.LOW
  const pulse = low ? 0.5 + 0.5 * Math.sin(now * 0.011) : 0

  const off = G.GAP + BAR / 2
  const ax = rx + off
  const ay = ry + off
  const mid = dir > 0 ? Math.PI / 2 : -Math.PI / 2
  // Fill runs left → right: start at the left end.
  const a0 = mid + dir * HALF
  const span = 2 * HALF
  const ccw = dir > 0
  const at = (f: number): number => a0 - dir * span * f

  ctx.lineCap = 'round'
  // Outline + track.
  ctx.strokeStyle = flashing ? WHITE : INK
  ctx.lineWidth = BAR + G.OUTLINE * 2
  ctx.beginPath()
  ctx.ellipse(x, cy, ax, ay, 0, a0, at(1), ccw)
  ctx.stroke()
  ctx.strokeStyle = TRACK
  ctx.lineWidth = BAR
  ctx.beginPath()
  ctx.ellipse(x, cy, ax, ay, 0, a0, at(1), ccw)
  ctx.stroke()
  // Damage chip (lost HP still draining).
  if (chipPct > pct + 0.002) {
    ctx.strokeStyle = CHIP
    ctx.beginPath()
    ctx.ellipse(x, cy, ax, ay, 0, at(pct), at(chipPct), ccw)
    ctx.stroke()
  }
  // Fill + its flat light stripe on the upper edge.
  if (pct > 0) {
    ctx.strokeStyle = flashing ? WHITE : (low && pulse > 0.5 ? pal.lite : pal.fill)
    ctx.beginPath()
    ctx.ellipse(x, cy, ax, ay, 0, a0, at(pct), ccw)
    ctx.stroke()
    if (!flashing) {
      const o = -dir * BAR * 0.24
      ctx.strokeStyle = pal.top
      ctx.lineWidth = BAR * 0.26
      ctx.beginPath()
      ctx.ellipse(x, cy, ax + o, ay + o, 0, a0, at(pct), ccw)
      ctx.stroke()
    }
  }
  ctx.lineCap = 'butt'
  // Quarter notches across the bar (one path).
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.3
  ctx.beginPath()
  const h = BAR / 2 + 0.4
  for (let i = 0; i < NOTCHES.length; i++) {
    const a = at(NOTCHES[i]!)
    const c = Math.cos(a)
    const sn = Math.sin(a)
    ctx.moveTo(x + c * (ax - h), cy + sn * (ay - h))
    ctx.lineTo(x + c * (ax + h), cy + sn * (ay + h))
  }
  ctx.stroke()

  // Badge with the HP number, centred on the middle of the arc.
  drawHpBadge(ctx, x, cy + Math.sin(mid) * (ay + 0.6), hp, isPlayer, flashing, low ? 1 + 0.09 * pulse : 1)
}

/**
 * The HP number on a team-coloured pill centred at (bx, by): heavy white
 * digits with a hard dark outline. `sc` scales the pill and digits (low-HP
 * throb). Shared by the gauge and the #UX3 balloon HP (@/use/balloonHp).
 */
export const drawHpBadge = (
  ctx: CanvasRenderingContext2D, bx: number, by: number, hp: number,
  isPlayer: boolean, flashing: boolean, sc = 1
): void => {
  if (!drawBadgeSprite(ctx, bx, by, hp, isPlayer, flashing, sc)) paintHpBadge(ctx, bx, by, hp, isPlayer, flashing, sc)
}

// ─── Baked badges (#Perf-1) ─────────────────────────────────────────────────
// A vector badge costs ~70 µs (pill fill + stroke, outlined text) and a battle
// draws 10-20 a frame. Each (number, team, flash, device scale) is painted once
// into a sprite at the canvas's own device scale and blitted 1:1 on whole
// device pixels — the same pixels as the vector badge, never resampled.
// Rotated / skewed transforms (none today) fall back to the vector path.

type BadgeSprite = { c: HTMLCanvasElement, w: number, h: number }
const badgeSprites = new Map<string, BadgeSprite | null>()
const BADGE_SPRITE_MAX = 600
/** Device-scale buckets: fine enough that a sprite never differs visibly from
 *  the badge at the exact scale. */
const scaleKey = (k: number): number => Math.round(k * 50) / 50

const bakeBadge = (k: number, hp: number, isPlayer: boolean, flashing: boolean): BadgeSprite | null => {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  const g = c.getContext?.('2d') as CanvasRenderingContext2D | null
  if (!g) return null
  // Generous box around the pill (outline + digit stroke), in badge units.
  const G = HP_GAUGE
  const text = textOf(Math.max(0, Math.ceil(hp)))
  g.font = FONT
  const tw = widthOf.get(text) ?? g.measureText(text).width
  const bw = Math.max(G.BADGE_H * 1.25, tw + 7) + G.OUTLINE * 1.4 + 4
  const bh = G.BADGE_H + G.OUTLINE * 1.4 + 4
  // Even device sizes keep the centre on a pixel corner.
  const w = Math.ceil((bw * k) / 2) * 2
  const h = Math.ceil((bh * k) / 2) * 2
  c.width = w
  c.height = h
  g.setTransform(k, 0, 0, k, w / 2, h / 2)
  paintHpBadge(g, 0, 0, hp, isPlayer, flashing, 1)
  return { c, w, h }
}

const drawBadgeSprite = (
  ctx: CanvasRenderingContext2D, bx: number, by: number, hp: number, isPlayer: boolean, flashing: boolean, sc: number
): boolean => {
  if (typeof ctx.getTransform !== 'function') return false
  const t = ctx.getTransform()
  if (!t || t.b !== 0 || t.c !== 0 || t.a <= 0 || Math.abs(t.a - t.d) > 1e-6) return false
  const k = scaleKey(t.a * sc)
  const key = `${Math.max(0, Math.ceil(hp))}|${isPlayer ? 1 : 0}|${flashing ? 1 : 0}|${k}`
  let s = badgeSprites.get(key)
  if (s === undefined) {
    if (badgeSprites.size >= BADGE_SPRITE_MAX) badgeSprites.clear()
    s = bakeBadge(k, hp, isPlayer, flashing)
    badgeSprites.set(key, s)
  }
  if (!s) return false
  const dx = Math.round(t.a * bx + t.e) - s.w / 2
  const dy = Math.round(t.d * by + t.f) - s.h / 2
  // Only the transform changes: put back the one just read (cheaper than save/restore).
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(s.c, dx, dy)
  ctx.setTransform(t)
  return true
}

/** The vector badge (the sprite's source; also the fallback; exported for the sprite-vs-vector check). */
export const paintHpBadge = (
  ctx: CanvasRenderingContext2D, bx: number, by: number, hp: number,
  isPlayer: boolean, flashing: boolean, sc: number
): void => {
  const G = HP_GAUGE
  const pal = TEAM[isPlayer ? 0 : 1]
  const text = textOf(Math.max(0, Math.ceil(hp)))
  ctx.font = FONT
  let tw = widthOf.get(text)
  if (tw === undefined) {
    const m = ctx.measureText(text)
    tw = m.width
    widthOf.set(text, tw)
    if (digitAscent < 0) {
      digitAscent = typeof m.actualBoundingBoxAscent === 'number' && m.actualBoundingBoxAscent > 0
        ? m.actualBoundingBoxAscent
        : G.FONT_PX * 0.72
    }
  }
  const bh = G.BADGE_H * sc
  const bw = Math.max(bh * 1.25, tw * sc + 7)
  const rr = bh / 2
  ctx.fillStyle = flashing ? WHITE : pal.badge
  ctx.strokeStyle = INK
  ctx.lineWidth = G.OUTLINE * 1.4
  ctx.beginPath()
  ctx.moveTo(bx - bw / 2 + rr, by - rr)
  ctx.lineTo(bx + bw / 2 - rr, by - rr)
  ctx.arc(bx + bw / 2 - rr, by, rr, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(bx - bw / 2 + rr, by + rr)
  ctx.arc(bx - bw / 2 + rr, by, rr, Math.PI / 2, Math.PI * 1.5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  if (sc !== 1) {
    ctx.save()
    ctx.translate(bx, by)
    ctx.scale(sc, sc)
    drawDigits(ctx, text, 0, digitAscent / 2, flashing)
    ctx.restore()
  } else {
    drawDigits(ctx, text, bx, by + digitAscent / 2, flashing)
  }
}

const drawDigits = (ctx: CanvasRenderingContext2D, text: string, x: number, baseline: number, flashing: boolean) => {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.strokeText(text, x, baseline)
  ctx.fillStyle = flashing ? INK : WHITE
  ctx.fillText(text, x, baseline)
  ctx.lineJoin = 'miter'
}

/** Gauge geometry for a smasher disc of `radius` at (x, y): the arc hugs the
 *  disc's front rim below its side band. Writes into `out` (no allocation). */
export const discGaugeFrame = (x: number, y: number, radius: number, out: { cx: number; cy: number; rx: number; ry: number }): void => {
  const sq = DISC_SQUASH
  out.cx = x
  out.cy = y + radius * DISC_THICKNESS * Math.sqrt(1 - sq * sq)
  out.rx = radius
  out.ry = radius * sq
}

// A web font landing after the first measure changes the digit widths.
if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.addEventListener === 'function') {
  document.fonts.addEventListener('loadingdone', () => {
    widthOf.clear()
    digitAscent = -1
    badgeSprites.clear()
  })
}
