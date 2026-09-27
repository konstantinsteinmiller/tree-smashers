// ─── First-launch intro: the renderer ───────────────────────────────────────
//
// Draws one frame of the cutscene for director time T. EVERYTHING on screen is
// a pure function of T and of data fixed at construction (the precomputed
// fight track, the director's time map, the baked sprites):
//
//   • bodies come from the fight track at S = director.toS(T);
//   • particles (sparks, shards, embers, debris, number cards) are stateless —
//     each is derived from `hash01(event id, particle index)` and its age, so
//     there is no pool to fill, no per-frame allocation, and a 30 fps and a
//     144 fps render of the same T draw the same pixels;
//   • the camera (keyframes + impact kicks) and the screen shake are sums over
//     the same event list.
//
// Performance, for the low-end devices this game already struggles on:
//   • no `shadowBlur` anywhere (it is what kills Firefox) — every glow is a
//     radial-gradient sprite baked once and blitted with globalAlpha;
//   • no gradient is created per frame, no string is built per frame (fonts,
//     numbers and colours are constants; text is drawn at a fixed 100px font
//     through a context scale);
//   • arena, background, badge bodies, number cards and skins are all baked;
//   • FX.low (useQuality) halves particle counts, drops afterimages and the
//     colour-grade blend, and the component caps the backing-store DPR.

import { hash01 } from '@/use/useDeterministicRng'
import {
  BODY_R, BOSS, BOSS_HOME, BUMPER, F_ALIVE, F_HP, F_ROT, F_SPEED, F_X, F_Y,
  FIGHT_SCRIPT, INTRO_ARENA_R, P1, P2, sampleTrack,
  type FightEvent, type FightTrack
} from '@/use/introFight'
import {
  LEVEL_FROM, STAGE_FROM, UNKNOWN_T, clamp01, countAt, easeInCubic, easeInOutCubic, easeOutBack,
  easeOutCubic, envelope, fallU, ramp, stepTime,
  type Director
} from '@/use/introTimeline'

export interface IntroAssets {
  boss: HTMLImageElement
  p1: HTMLImageElement
  p2: HTMLImageElement
  bgTile: HTMLImageElement | null
  explosion: HTMLImageElement | null
}

export interface IntroLabels {
  /** "BOSS STAGE" — reuses the game's `bossStage` key. */
  bossStage: string
  /** "STAGE" — reuses `stage`. */
  stage: string
  /** "Lv." — reuses `lv`. */
  lv: string
  /** The one line of copy: "Win it all back!" (`intro.reclaim`). */
  tagline: string
}

export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface HudRect {
  x: number
  y: number
  w: number
  h: number
}

export interface DrawOptions {
  low: boolean
  /** 0..1 extra fade to the live game (skip). */
  fade: number
}

export interface IntroRenderer {
  resize: (w: number, h: number, dpr: number, safe: SafeInsets) => void
  setHudTarget: (r: HudRect | null) => void
  setLabels: (l: IntroLabels, fontFamily: string) => void
  draw: (T: number, o: DrawOptions) => void
}

type Cnv = HTMLCanvasElement
type C2D = CanvasRenderingContext2D

const TAU = Math.PI * 2
const NUM_STR: string[] = Array.from({ length: 61 }, (_, i) => String(i))

const mkCanvas = (w: number, h: number): Cnv => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}
const ctx2d = (c: Cnv): C2D => c.getContext('2d') as C2D

/** A radial-gradient disc, baked once. */
const radialSprite = (stops: [number, string][], size = 256): Cnv => {
  const c = mkCanvas(size, size)
  const g = ctx2d(c)
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  for (const [o, col] of stops) grad.addColorStop(o, col)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

/** Skin clipped to a clean disc (removes any edge fringe of the source art). */
const skinSprite = (img: HTMLImageElement, size = 256): Cnv => {
  const c = mkCanvas(size, size)
  const g = ctx2d(c)
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - 1, 0, TAU)
  g.clip()
  if (img.complete && img.naturalWidth > 0) g.drawImage(img, 0, 0, size, size)
  else {
    g.fillStyle = '#334'
    g.fillRect(0, 0, size, size)
  }
  return c
}

/** The boss as the GOAL: its own art, sunk into shadow, with a red rim light —
 *  recognisably the thing that just beat you, not a generic blob. */
const goalSprite = (img: HTMLImageElement, size = 256): Cnv => {
  const pad = Math.round(size * 0.12)
  const full = size + pad * 2
  const c = mkCanvas(full, full)
  const g = ctx2d(c)
  const rim = mkCanvas(full, full)
  const rg = ctx2d(rim)
  const grow = size * 1.08
  rg.drawImage(skinSprite(img, size), pad + (size - grow) / 2, pad + (size - grow) / 2, grow, grow)
  rg.globalCompositeOperation = 'source-in'
  rg.fillStyle = '#ff3b3b'
  rg.fillRect(0, 0, full, full)
  g.drawImage(rim, 0, 0)
  const body = mkCanvas(full, full)
  const bg = ctx2d(body)
  bg.drawImage(skinSprite(img, size), pad, pad, size, size)
  bg.globalCompositeOperation = 'source-atop'
  bg.fillStyle = 'rgba(40,0,8,0.62)'
  bg.fillRect(0, 0, full, full)
  g.drawImage(body, 0, 0)
  return c
}

/** A flat white (or any colour) cut-out of a sprite — for the two-tone
 *  impact frame. */
const tintSprite = (src: Cnv, colour: string): Cnv => {
  const c = mkCanvas(src.width, src.height)
  const g = ctx2d(c)
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = colour
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** A drained, darkened copy of a skin — the lost spinners in the fall. */
const drainedSprite = (src: Cnv): Cnv => {
  const c = mkCanvas(src.width, src.height)
  const g = ctx2d(c)
  g.drawImage(src, 0, 0)
  g.globalCompositeOperation = 'saturation'
  g.fillStyle = '#808080'
  g.fillRect(0, 0, c.width, c.height)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = 'rgba(10,8,14,0.45)'
  g.fillRect(0, 0, c.width, c.height)
  return c
}

/** The boss arena, in world units at 2 px/unit: floor, rings, neon border with
 *  a layered-stroke glow (no shadowBlur). */
const ARENA_PX_PER_UNIT = 2
const ARENA_PAD = 48
const arenaSprite = (): Cnv => {
  const half = INTRO_ARENA_R + ARENA_PAD
  const size = half * 2 * ARENA_PX_PER_UNIT
  const c = mkCanvas(size, size)
  const g = ctx2d(c)
  g.translate(size / 2, size / 2)
  g.scale(ARENA_PX_PER_UNIT, ARENA_PX_PER_UNIT)
  const R = INTRO_ARENA_R
  const floor = g.createRadialGradient(0, 0, 0, 0, 0, R)
  floor.addColorStop(0, '#2c1014')
  floor.addColorStop(0.7, '#1f0a0d')
  floor.addColorStop(1, '#150507')
  g.fillStyle = floor
  g.beginPath()
  g.arc(0, 0, R, 0, TAU)
  g.fill()
  // Floor texture: faint radial spokes + rings.
  g.strokeStyle = 'rgba(255,80,60,0.05)'
  g.lineWidth = 1
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU
    g.beginPath()
    g.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2)
    g.lineTo(Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97)
    g.stroke()
  }
  g.strokeStyle = '#3a1518'
  g.lineWidth = 1.2
  for (const f of [0.3, 0.6, 0.85]) {
    g.beginPath()
    g.arc(0, 0, R * f, 0, TAU)
    g.stroke()
  }
  // Outer halo — stacked strokes, widest and faintest first.
  for (let i = 11; i >= 0; i--) {
    const f = i / 11
    g.lineWidth = 5 + 40 * 2 * f
    g.strokeStyle = `rgba(255,60,40,${(0.035 * (1 - f) + 0.004).toFixed(3)})`
    g.beginPath()
    g.arc(0, 0, R, 0, TAU)
    g.stroke()
  }
  g.lineWidth = 5
  g.strokeStyle = '#ff4646'
  g.beginPath()
  g.arc(0, 0, R, 0, TAU)
  g.stroke()
  g.lineWidth = 1.5
  g.strokeStyle = '#ffb0a0'
  g.beginPath()
  g.arc(0, 0, R, 0, TAU)
  g.stroke()
  g.lineWidth = 2
  g.strokeStyle = 'rgba(255,90,70,0.28)'
  g.beginPath()
  g.arc(0, 0, R - 9, 0, TAU)
  g.stroke()
  return c
}

/** A spinning-vortex overlay for the tornado skin (baked, drawn rotated). */
const swirlSprite = (size = 256): Cnv => {
  const c = mkCanvas(size, size)
  const g = ctx2d(c)
  const r = size / 2
  g.translate(r, r)
  g.lineCap = 'round'
  for (let arm = 0; arm < 3; arm++) {
    g.strokeStyle = arm === 0 ? 'rgba(210,240,255,0.55)' : arm === 1 ? 'rgba(150,205,245,0.42)' : 'rgba(110,170,230,0.32)'
    g.lineWidth = 6 - arm
    g.beginPath()
    for (let s = 0; s <= 40; s++) {
      const t = s / 40
      const a = arm * (TAU / 3) + t * Math.PI * 2.4
      const d = r * (0.3 + t * 0.66)
      if (s === 0) g.moveTo(Math.cos(a) * d, Math.sin(a) * d)
      else g.lineTo(Math.cos(a) * d, Math.sin(a) * d)
    }
    g.stroke()
  }
  return c
}

/** Radial crack decal for the boss's landing. */
const crackSprite = (size = 256): Cnv => {
  const c = mkCanvas(size, size)
  const g = ctx2d(c)
  const r = size / 2
  g.translate(r, r)
  g.strokeStyle = 'rgba(10,2,4,0.85)'
  g.lineCap = 'round'
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * TAU + hash01(7, i) * 0.4
    let x = Math.cos(a) * r * 0.18
    let y = Math.sin(a) * r * 0.18
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(x, y)
    const len = r * (0.55 + hash01(8, i) * 0.4)
    for (let k = 1; k <= 5; k++) {
      a += (hash01(9, i * 10 + k) - 0.5) * 0.7
      x = Math.cos(a) * len * (k / 5)
      y = Math.sin(a) * len * (k / 5)
      g.lineWidth = 5 - k * 0.8
      g.lineTo(x, y)
    }
    g.stroke()
  }
  g.fillStyle = 'rgba(10,2,4,0.6)'
  g.beginPath()
  g.arc(0, 0, r * 0.22, 0, TAU)
  g.fill()
  return c
}

/** A vector skull on a red medallion — the boss marker (emoji glyphs render
 *  differently on every platform, so it is drawn). */
const skullSprite = (size = 128): Cnv => {
  const c = mkCanvas(size, size)
  const g = ctx2d(c)
  const r = size / 2
  g.translate(r, r)
  g.fillStyle = '#7a0d12'
  g.beginPath()
  g.arc(0, 0, r - 2, 0, TAU)
  g.fill()
  g.lineWidth = size * 0.06
  g.strokeStyle = '#ffb3a8'
  g.stroke()
  g.fillStyle = '#fff4ea'
  g.beginPath()
  g.arc(0, -r * 0.1, r * 0.46, 0, TAU)
  g.fill()
  g.fillRect(-r * 0.28, r * 0.18, r * 0.56, r * 0.3)
  g.fillStyle = '#7a0d12'
  g.beginPath()
  g.arc(-r * 0.19, -r * 0.1, r * 0.13, 0, TAU)
  g.arc(r * 0.19, -r * 0.1, r * 0.13, 0, TAU)
  g.fill()
  g.fillRect(-r * 0.03, r * 0.1, r * 0.06, r * 0.1)
  for (let i = -1; i <= 1; i++) g.fillRect(i * r * 0.14 - r * 0.02, r * 0.3, r * 0.04, r * 0.18)
  return c
}

// ─── Colour tables (constants — nothing is formatted per frame) ─────────────

const HP_COL: string[] = Array.from({ length: 11 }, (_, i) => `hsl(${i * 12}, 92%, 55%)`)

interface Theme {
  top: string
  bottom: string
  border: string
  base: string
  chip: string
  chipText: string
}

const BOSS_THEME: Theme = {
  top: '#e53030', bottom: '#7a1010', border: '#ffb3a8', base: '#3a0507', chip: '#420609', chipText: '#ffe8e3'
}
const SLATE_THEME: Theme = {
  top: '#6b7788', bottom: '#2b3340', border: '#d7dee8', base: '#0c1016', chip: '#141a22', chipText: '#f4f7fb'
}

interface Tier {
  top: string
  bottom: string
  border: string
  glow: string
}

const TIERS: Tier[] = [
  { top: '#ffe27a', bottom: '#d98200', border: '#fff6c9', glow: 'rgba(255,200,60,0.55)' }, // 21-30 legend
  { top: '#f1f5fb', bottom: '#7f8fa6', border: '#ffffff', glow: 'rgba(200,220,255,0.4)' }, // 11-20 silver
  { top: '#e9a867', bottom: '#8a4516', border: '#ffd2a8', glow: 'rgba(230,140,70,0.35)' }, // 4-10 bronze
  { top: '#6f747c', bottom: '#2e3238', border: '#8d9299', glow: 'rgba(0,0,0,0)' } // 1-3 rookie
]
const TARGETS: readonly number[] = [P1, P2]
/** [windS, strikeS, windS, strikeS, …] from the fight script. */
const WIND_PAIRS: readonly number[] = ((): number[] => {
  const out: number[] = []
  for (let i = 0; i < FIGHT_SCRIPT.length; i++) {
    const c = FIGHT_SCRIPT[i]!
    if (c.op !== 'thunderWind') continue
    const strike = FIGHT_SCRIPT.slice(i + 1).find(n => n.op === 'thunder')
    if (strike) out.push(c.s, strike.s)
  }
  return out
})()
/** First level of each lower tier (silver, bronze, rookie). */
const TIER_EDGES: readonly number[] = [20, 10, 3]
const TIER_GLOW_SIZE: readonly number[] = [2.0, 1.35, 1.1, 0]
const TIER_GLOW_ALPHA: readonly number[] = [0.85, 0.32, 0.22, 0]
const LOCK_DASH: number[] = [7, 6]
const NO_DASH: number[] = []

/** One heartbeat thump: 0 → 1 → 0 over 0.35 s from t0. */
const beatPulse = (T: number, t0: number): number => {
  const a = T - t0
  return a >= 0 && a < 0.35 ? Math.sin((a / 0.35) * Math.PI) : 0
}
const tierOf = (lv: number): number => (lv > 20 ? 0 : lv > 10 ? 1 : lv > 3 ? 2 : 3)

const roundRect = (g: C2D, x: number, y: number, w: number, h: number, r: number): void => {
  const rr = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + rr, y)
  g.lineTo(x + w - rr, y)
  g.arcTo(x + w, y, x + w, y + rr, rr)
  g.lineTo(x + w, y + h - rr)
  g.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  g.lineTo(x + rr, y + h)
  g.arcTo(x, y + h, x, y + h - rr, rr)
  g.lineTo(x, y + rr)
  g.arcTo(x, y, x + rr, y, rr)
  g.closePath()
}

export const createIntroRenderer = (
  ctx: C2D,
  track: FightTrack,
  director: Director,
  assets: IntroAssets,
  initialLabels: IntroLabels,
  initialFont: string
): IntroRenderer => {
  const events = track.events
  const B = director.beats
  const eventT = director.eventT
  const eventHold = director.eventHold

  // ── Static sprites (viewport-independent) ────────────────────────────────
  const skins: Cnv[] = [skinSprite(assets.boss), skinSprite(assets.p1), skinSprite(assets.p2)]
  const goal = goalSprite(assets.boss)
  const whiteSkins: Cnv[] = skins.map(sk => tintSprite(sk, '#ffffff'))
  const lostSkins: Cnv[] = [drainedSprite(skins[P1]!), drainedSprite(skins[P2]!)]
  const arena = arenaSprite()
  const swirl = swirlSprite()
  const cracks = crackSprite()
  const skull = skullSprite()
  const glowBlue = radialSprite([[0, 'rgba(110,190,255,0.62)'], [0.45, 'rgba(60,130,240,0.26)'], [1, 'rgba(40,90,220,0)']])
  const glowIce = radialSprite([[0, 'rgba(200,245,255,0.6)'], [0.5, 'rgba(120,210,255,0.22)'], [1, 'rgba(90,180,255,0)']])
  const glowBoss = radialSprite([
    [0, 'rgba(255,110,50,0.85)'], [0.3, 'rgba(220,60,160,0.5)'], [0.65, 'rgba(130,50,220,0.22)'], [1, 'rgba(90,30,200,0)']
  ])
  const glowWhite = radialSprite([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,250,230,0.7)'], [1, 'rgba(255,240,200,0)']])
  const glowGold = radialSprite([[0, 'rgba(255,220,90,0.9)'], [0.4, 'rgba(255,170,40,0.45)'], [1, 'rgba(255,140,0,0)']])
  const glowRed = radialSprite([[0, 'rgba(255,60,50,0.8)'], [0.5, 'rgba(200,20,20,0.35)'], [1, 'rgba(140,0,0,0)']])
  const glowCyan = radialSprite([[0, 'rgba(180,250,255,0.95)'], [0.4, 'rgba(90,210,255,0.5)'], [1, 'rgba(40,160,255,0)']])
  const scorch = radialSprite([[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(20,4,4,0.45)'], [1, 'rgba(0,0,0,0)']], 128)
  const vignette = radialSprite([[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.08)'], [1, 'rgba(0,0,0,0.85)']], 512)
  const vignetteRed = radialSprite([[0, 'rgba(120,0,0,0)'], [0.5, 'rgba(150,0,10,0.1)'], [1, 'rgba(170,0,10,0.75)']], 512)
  // A proper pinball bumper — gold rim, hot core, white star — so it can
  // never be mistaken for one of the (blue) spinners.
  const bumperBody = ((): Cnv => {
    const c = mkCanvas(160, 160)
    const g = ctx2d(c)
    g.translate(80, 80)
    g.fillStyle = 'rgba(0,0,0,0.55)'
    g.beginPath()
    g.arc(4, 7, 74, 0, TAU)
    g.fill()
    const rim = g.createRadialGradient(-20, -24, 10, 0, 0, 76)
    rim.addColorStop(0, '#fff3b8')
    rim.addColorStop(0.55, '#ffc21f')
    rim.addColorStop(1, '#a35a00')
    g.fillStyle = rim
    g.beginPath()
    g.arc(0, 0, 76, 0, TAU)
    g.fill()
    const core = g.createRadialGradient(-12, -14, 4, 0, 0, 52)
    core.addColorStop(0, '#ff9a6a')
    core.addColorStop(0.6, '#d3202c')
    core.addColorStop(1, '#6a0710')
    g.fillStyle = core
    g.beginPath()
    g.arc(0, 0, 52, 0, TAU)
    g.fill()
    g.lineWidth = 5
    g.strokeStyle = '#fff6d0'
    g.beginPath()
    g.arc(0, 0, 76, 0, TAU)
    g.stroke()
    g.fillStyle = '#fff8e8'
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * TAU
      const rr = i % 2 === 0 ? 34 : 14
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    g.closePath()
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.beginPath()
    g.ellipse(-30, -34, 18, 10, -0.6, 0, TAU)
    g.fill()
    return c
  })()

  // ── Viewport state ───────────────────────────────────────────────────────
  let W = 1
  let H = 1
  let DPR = 1
  let MIN = 1
  let portrait = false
  let safe: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  let baseScale = 1
  let unitPx = 1 // screen px per "design px" (720 short side = 1)
  let bgBuffer: Cnv | null = null
  /** Offscreen world layer, created lazily for the outro crossfade only. */
  let worldLayer: Cnv | null = null
  let hud: HudRect | null = null
  let labels = initialLabels
  let fontFamily = initialFont
  let font100 = `100px ${fontFamily}`

  // Badge art baked at the hero size for the current viewport + locale.
  let heroH = 100
  let chipPx = 80
  let badgeBoss: Cnv | null = null
  let badgeSlate: Cnv | null = null
  let cardAtlas: Cnv | null = null
  let levelAtlas: Cnv | null = null
  let tierSprites: Cnv[] = []
  let pillSprite: Cnv | null = null
  let taglineSprite: Cnv | null = null
  /** One floating damage number per event (null = none), baked per viewport. */
  let dmgSprites: (Cnv | null)[] = []
  const ATLAS_COLS = 10
  /** Design height of the Lv. 30 pill (scaled by the short side). */
  const PILL_H = 34

  // Layout anchors (screen px, CSS)
  const L = {
    hudX: 12, hudY: 12, hudH: 40,
    heroStageX: 0, heroStageY: 0,
    heroLevelX: 0, heroLevelY: 0,
    nameX: 0, nameY: 0, nameH: 100,
    /** 'band' = full-width boss subtitle band; 'side' = a panel in the free
     *  space beside the arena (wide landscape). */
    nameMode: 'band' as 'band' | 'side',
    goalX: 0, goalY: 0, goalSize: 100,
    /** Where the stage badge sits in the reclaim beat (the foot of the ladder). */
    reclaimStageY: 0,
    tagX: 0, tagY: 0,
    barFight: 40, barFall: 70,
    arenaPx: 400
  }

  const measure = (text: string): number => {
    ctx.save()
    ctx.font = font100
    const w = ctx.measureText(text).width
    ctx.restore()
    return w
  }

  /** Text drawn through a scale so the font string is a constant. */
  const text = (
    g: C2D, s: string, x: number, y: number, px: number,
    fill: string, stroke: string | null, strokePx: number, align: CanvasTextAlign = 'center'
  ): void => {
    const k = px / 100
    g.save()
    g.translate(x, y)
    g.scale(k, k)
    g.font = font100
    g.textAlign = align
    g.textBaseline = 'middle'
    if (stroke) {
      g.lineJoin = 'round'
      g.lineWidth = strokePx / k
      g.strokeStyle = stroke
      g.strokeText(s, 0, 0)
    }
    g.fillStyle = fill
    g.fillText(s, 0, 0)
    g.restore()
  }

  /** Stage badge BODY (no number): 3D base, gradient body, label. Baked. */
  const bakeBadge = (theme: Theme, label: string): Cnv => {
    const d = DPR
    const hh = heroH
    const labelPx = hh * 0.34
    const lw = measure(label) * (labelPx / 100)
    const w = hh * 0.12 + chipPx + hh * 0.16 + lw + hh * 0.28
    const c = mkCanvas((w + 8) * d, (hh + hh * 0.12 + 8) * d)
    const g = ctx2d(c)
    g.scale(d, d)
    g.translate(4, 4)
    g.fillStyle = theme.base
    roundRect(g, 0, hh * 0.1, w, hh, hh * 0.22)
    g.fill()
    const grad = g.createLinearGradient(0, 0, 0, hh)
    grad.addColorStop(0, theme.top)
    grad.addColorStop(1, theme.bottom)
    g.fillStyle = grad
    roundRect(g, 0, 0, w, hh, hh * 0.22)
    g.fill()
    g.lineWidth = Math.max(2, hh * 0.045)
    g.strokeStyle = theme.border
    g.stroke()
    // Gloss
    g.fillStyle = 'rgba(255,255,255,0.14)'
    roundRect(g, hh * 0.06, hh * 0.06, w - hh * 0.12, hh * 0.36, hh * 0.16)
    g.fill()
    text(g, label, hh * 0.12 + chipPx + hh * 0.16, hh * 0.52, labelPx, '#ffffff', 'rgba(0,0,0,0.65)', hh * 0.07, 'left')
    ;(c as Cnv & { __w?: number }).__w = w
    return c
  }

  /** One number-chip face (the "card"). */
  const drawChipFace = (g: C2D, x: number, y: number, size: number, n: number, theme: Theme): void => {
    g.fillStyle = theme.chip
    roundRect(g, x, y, size, size, size * 0.2)
    g.fill()
    g.lineWidth = Math.max(1.5, size * 0.045)
    g.strokeStyle = theme.border
    g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.08)'
    roundRect(g, x + size * 0.08, y + size * 0.07, size * 0.84, size * 0.38, size * 0.12)
    g.fill()
    const s = NUM_STR[n] ?? ''
    text(g, s, x + size / 2, y + size * 0.54, size * (n >= 10 ? 0.62 : 0.72), theme.chipText, 'rgba(0,0,0,0.7)', size * 0.06)
  }

  const bakeCards = (): void => {
    const d = DPR
    const cell = Math.ceil(chipPx + 4)
    const rows = Math.ceil(STAGE_FROM / ATLAS_COLS)
    const c = mkCanvas(cell * ATLAS_COLS * d, cell * rows * d)
    const g = ctx2d(c)
    g.scale(d, d)
    for (let n = 1; n <= STAGE_FROM; n++) {
      const i = n - 1
      drawChipFace(g, (i % ATLAS_COLS) * cell + 2, Math.floor(i / ATLAS_COLS) * cell + 2, chipPx,
        n, n === STAGE_FROM ? BOSS_THEME : SLATE_THEME)
    }
    cardAtlas = c
    // Level numbers — big white digits for the level medallion.
    const lcell = Math.ceil(heroH * 0.9)
    const lrows = Math.ceil(LEVEL_FROM / ATLAS_COLS)
    const lc = mkCanvas(lcell * ATLAS_COLS * d, lcell * lrows * d)
    const lg = ctx2d(lc)
    lg.scale(d, d)
    for (let n = 1; n <= LEVEL_FROM; n++) {
      const i = n - 1
      text(lg, NUM_STR[n] ?? '', (i % ATLAS_COLS) * lcell + lcell / 2, Math.floor(i / ATLAS_COLS) * lcell + lcell * 0.54,
        lcell * 0.74, '#ffffff', 'rgba(20,10,0,0.8)', lcell * 0.08)
    }
    levelAtlas = lc
  }

  /** Level medallion backgrounds, one per tier, with the "Lv." caption. */
  const bakeTiers = (): void => {
    const d = DPR
    const s = heroH * 1.25
    tierSprites = TIERS.map((tier) => {
      const c = mkCanvas((s + 16) * d, (s + 16) * d)
      const g = ctx2d(c)
      g.scale(d, d)
      g.translate(8 + s / 2, 8 + s / 2)
      // Hexagon medallion
      const hex = (r: number): void => {
        g.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i / 6) * TAU
          if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
          else g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        g.closePath()
      }
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.save()
      g.translate(0, s * 0.05)
      hex(s * 0.47)
      g.fill()
      g.restore()
      const grad = g.createLinearGradient(0, -s / 2, 0, s / 2)
      grad.addColorStop(0, tier.top)
      grad.addColorStop(1, tier.bottom)
      g.fillStyle = grad
      hex(s * 0.47)
      g.fill()
      g.lineWidth = Math.max(2, s * 0.035)
      g.strokeStyle = tier.border
      g.stroke()
      g.fillStyle = 'rgba(0,0,0,0.28)'
      hex(s * 0.36)
      g.fill()
      text(g, labels.lv, 0, -s * 0.22, s * 0.15, '#ffffff', 'rgba(0,0,0,0.7)', s * 0.03)
      return c
    })
    // The small "Lv. 30" pill that rides under each spinner in the fight.
    const ph = PILL_H
    const lvW = measure(labels.lv) * (ph * 0.5 / 100)
    const numW = measure('30') * (ph * 0.72 / 100)
    const pw = lvW + numW + ph * 0.75
    const pc = mkCanvas((pw + 6) * d, (ph + 6) * d)
    const pg = ctx2d(pc)
    pg.scale(d, d)
    pg.translate(3, 3)
    const pgrad = pg.createLinearGradient(0, 0, 0, ph)
    pgrad.addColorStop(0, '#ffe27a')
    pgrad.addColorStop(1, '#c46f00')
    pg.fillStyle = 'rgba(0,0,0,0.6)'
    roundRect(pg, 0, 2, pw, ph, ph / 2)
    pg.fill()
    pg.fillStyle = pgrad
    roundRect(pg, 0, 0, pw, ph, ph / 2)
    pg.fill()
    pg.lineWidth = 1.5
    pg.strokeStyle = '#fff6c9'
    pg.stroke()
    text(pg, labels.lv, ph * 0.35, ph * 0.54, ph * 0.5, '#3a1d00', null, 0, 'left')
    text(pg, '30', ph * 0.35 + lvW + ph * 0.12, ph * 0.54, ph * 0.72, '#ffffff', '#5a2a00', 2.2, 'left')
    ;(pc as Cnv & { __w?: number }).__w = pw
    pillSprite = pc
  }

  const bakeTagline = (): void => {
    const d = DPR
    const px = MIN * (portrait ? 0.1 : 0.088)
    const tw = measure(labels.tagline) * (px / 100)
    const maxW = W * 0.92
    const k = tw > maxW ? maxW / tw : 1
    const fpx = px * k
    const w = tw * k + fpx
    const c = mkCanvas((w + 20) * d, (fpx * 1.6 + 20) * d)
    const g = ctx2d(c)
    g.scale(d, d)
    g.translate(10 + w / 2, 10 + fpx * 0.8)
    text(g, labels.tagline, 0, 4, fpx, '#3a0d00', 'rgba(0,0,0,0.85)', fpx * 0.16)
    const k2 = fpx / 100
    g.save()
    g.scale(k2, k2)
    g.font = font100
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const grad = g.createLinearGradient(0, -50, 0, 50)
    grad.addColorStop(0, '#fff7c2')
    grad.addColorStop(0.5, '#ffd23f')
    grad.addColorStop(1, '#ff8a00')
    g.lineJoin = 'round'
    g.lineWidth = 9
    g.strokeStyle = '#4a1300'
    g.strokeText(labels.tagline, 0, 0)
    g.fillStyle = grad
    g.fillText(labels.tagline, 0, 0)
    g.restore()
    taglineSprite = c
  }

  /** "-12" style numbers: gold for damage the blues deal to the boss (hope),
   *  red for what the boss's thunder does to them. Baked the first time each
   *  event is seen (the fight is live), cached per viewport — nothing is
   *  formatted per frame. */
  let dmgCache = new Map<string, Cnv>()
  const bakeDamage = (): void => {
    // Viewport changed: start over.
    dmgCache = new Map<string, Cnv>()
    dmgSprites = []
  }
  const ensureDamageSprites = (): void => {
    if (dmgSprites.length >= events.length) return
    const d = DPR
    const px = Math.round(MIN * 0.052)
    for (let i = dmgSprites.length; i < events.length; i++) {
      const e = events[i]!
      let v = 0
      let gold = true
      if (e.kind === 'hit' && e.b === BOSS && e.dmg) v = e.dmg
      else if (e.kind === 'thunder') {
        v = e.power
        gold = false
      }
      if (!v) {
        dmgSprites.push(null)
        continue
      }
      const key = (gold ? 'g' : 'r') + v
      let c = dmgCache.get(key) ?? null
      if (!c) {
        const str = '-' + v
        const w = measure(str) * (px / 100) + px * 0.5
        c = mkCanvas(w * d, px * 1.5 * d)
        const g = ctx2d(c)
        g.scale(d, d)
        text(g, str, w / 2, px * 0.75, px, gold ? '#ffe066' : '#ff6b6b', gold ? '#5a2800' : '#3a0006', px * 0.16)
        dmgCache.set(key, c)
      }
      dmgSprites.push(c)
    }
  }

  const bakeViewport = (): void => {
    heroH = Math.round(MIN * 0.17)
    chipPx = Math.round(heroH * 0.78)
    badgeBoss = bakeBadge(BOSS_THEME, labels.bossStage)
    badgeSlate = bakeBadge(SLATE_THEME, labels.stage)
    bakeCards()
    bakeTiers()
    bakeTagline()
    bakeDamage()
    // Background: the game's own floor tile, sunk into darkness.
    const bg = mkCanvas(W * DPR, H * DPR)
    const g = ctx2d(bg)
    g.scale(DPR, DPR)
    g.fillStyle = '#07080c'
    g.fillRect(0, 0, W, H)
    if (assets.bgTile && assets.bgTile.complete && assets.bgTile.naturalWidth > 0) {
      const pat = g.createPattern(assets.bgTile, 'repeat')
      if (pat) {
        g.globalAlpha = 0.28
        g.fillStyle = pat
        g.fillRect(0, 0, W, H)
        g.globalAlpha = 1
      }
    }
    g.drawImage(vignette, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2)
    bgBuffer = bg
  }

  const layout = (): void => {
    MIN = Math.min(W, H)
    portrait = H > W
    unitPx = MIN / 720
    const minBar = Math.round(MIN * 0.075)
    baseScale = Math.min(W, H - minBar * 2) / (INTRO_ARENA_R * 2 + 26)
    L.arenaPx = INTRO_ARENA_R * 2 * baseScale
    // Portrait has a lot of dead space above and below the arena: frame it
    // with real cinema bars instead of leaving it empty.
    L.barFight = Math.round(Math.max(minBar, portrait ? ((H - L.arenaPx * 1.06) / 2) * 0.3 : 0))
    L.barFall = Math.round(Math.max(MIN * 0.11, L.barFight * 1.15))
    L.hudX = 8 + safe.left
    L.hudH = Math.max(34, Math.min(48, MIN * 0.062))
    // The HUD badge rides the top bar when the bar is tall enough for it.
    L.hudY = L.barFight > L.hudH + 16 ? Math.max(8 + safe.top, (L.barFight - L.hudH) / 2) : 8 + safe.top
    L.heroStageX = W / 2
    L.heroLevelX = W / 2
    L.goalX = W / 2
    L.tagX = W / 2
    L.nameH = portrait ? heroH : Math.round(heroH * 0.82)
    if (portrait) {
      L.heroLevelY = H * 0.33
      L.heroStageY = H * 0.6
      L.goalY = H * 0.23
      L.goalSize = MIN * 0.32
      L.reclaimStageY = H * 0.66
      L.tagY = H * 0.765
      L.nameMode = 'band'
      L.nameX = W / 2
      // The free strip above the arena, just under the bar.
      L.nameY = Math.max(L.barFight + heroH * 0.9, H / 2 - L.arenaPx * 0.5 - heroH * 0.2)
    } else {
      L.heroLevelY = H * 0.3
      L.heroStageY = H * 0.71
      L.goalY = H * 0.2
      L.goalSize = MIN * 0.25
      L.reclaimStageY = H * 0.755
      L.tagY = H * 0.915
      // Wide landscape has free space beside the arena: put the boss card
      // there, sized to fit, so it never covers the fight. Too narrow (4:3
      // tablets) → the band under the arena instead.
      const side = (W - L.arenaPx) / 2
      const perH = badgeWidth(badgeBoss) / heroH + 1.05 // card width per px of height (skull incl.)
      const fitH = Math.min(heroH * 0.85, (side * 0.9) / perH)
      if (fitH >= heroH * 0.48) {
        L.nameMode = 'side'
        L.nameH = Math.round(fitH)
        L.nameX = W - side / 2 + fitH * 0.3
        L.nameY = H * 0.46
      } else {
        L.nameMode = 'band'
        L.nameX = W / 2
        L.nameY = H * 0.8
      }
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  //
  // Reactive, never predictive: the physics runs live, so the camera may only
  // respond to what has already happened at T. A scripted base path for the
  // reveal, then one blend per event (a charge pushes in, a KO smash-zooms
  // during its hit-stop and lets go after it, the fall drifts in slowly).
  // Every blend weight is a function of T and of event times ≤ T, so a frame
  // looks the same at any frame rate.
  interface Key {
    T: number;
    x: number;
    y: number;
    z: number
  }

  const REVEAL: readonly Key[] = [
    { T: 0, x: 0, y: 105, z: 1.3 },
    { T: 0.28, x: 0, y: 70, z: 1.26 },
    { T: 0.55, x: 0, y: -20, z: 1.32 },
    { T: 1.2, x: 0, y: 0, z: 1.08 }
  ]
  const cam = { x: 0, y: 0, z: 1, sx: 0, sy: 0 }

  // Shake + kick sources, rebuilt from the KNOWN events whenever the director
  // learns something new (never per frame).
  let shakeT: number[] = []
  let shakeA: number[] = []
  let shakeD: number[] = []
  let shakeSeed: number[] = []
  let shakeVersion = -1
  const rebuildShake = (): void => {
    shakeVersion = director.version
    const t: number[] = []
    const a: number[] = []
    const d: number[] = []
    const sd: number[] = []
    const add = (T: number, amp: number, dur: number, seed: number): void => {
      t.push(T)
      a.push(amp)
      d.push(dur)
      sd.push(seed)
    }
    let koCount = 0
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      const T = eventT[i]!
      switch (e.kind) {
        case 'slam':
          add(T, 16, 0.5, e.id)
          break
        case 'hit':
          if (e.b === BOSS && e.power > 250) add(T, Math.min(10, 3 + e.power / 130), 0.24, e.id)
          break
        case 'thunder':
          add(T, 9, 0.32, e.id)
          break
        case 'ko': {
          const first = koCount++ === 0
          add(T + (eventHold[i] ?? 0), first ? 18 : 26, first ? 0.55 : 0.9, e.id)
          break
        }
        case 'wall':
          if (e.a === BOSS && e.power > 400) add(T, 12, 0.35, e.id)
          break
        case 'bumper':
          if (e.a !== BOSS) add(T, 4, 0.16, e.id)
          break
      }
    }
    add(B.landT, 15, 0.45, 901)
    add(B.badgeGoneT - 0.25, 6, 0.25, 902)
    shakeT = t
    shakeA = a
    shakeD = d
    shakeSeed = sd
  }

  /** Blend the camera toward a target by weight w. */
  const pull = (tx: number, ty: number, tz: number, w: number): void => {
    if (w <= 0) return
    cam.x += (tx - cam.x) * w
    cam.y += (ty - cam.y) * w
    cam.z += (tz - cam.z) * w
  }

  const computeCamera = (T: number, S: number): void => {
    if (shakeVersion !== director.version) rebuildShake()
    // 1. The scripted reveal path.
    let k = 0
    while (k + 1 < REVEAL.length && REVEAL[k + 1]!.T <= T) k++
    const a = REVEAL[k]!
    const b = REVEAL[Math.min(k + 1, REVEAL.length - 1)]!
    const u = b.T > a.T ? easeInOutCubic((T - a.T) / (b.T - a.T)) : 1
    cam.x = a.x + (b.x - a.x) * u
    cam.y = a.y + (b.y - a.y) * u
    cam.z = a.z + (b.z - a.z) * u

    // 2. A gentle follow of the action until the first charge.
    let firstChargeT = UNKNOWN_T
    for (let i = 0; i < events.length; i++) {
      if (events[i]!.kind === 'charge') {
        firstChargeT = eventT[i]!
        break
      }
    }
    const follow = envelope(T, 1.2, 0.5, firstChargeT + 0.3, 0.3) * 0.22
    if (follow > 0) {
      let cx = 0
      let cy = 0
      let n = 0
      for (let i = 0; i < 3; i++) {
        if (sampleTrack(track, S, i, F_ALIVE) < 0.5) continue
        cx += sampleTrack(track, S, i, F_X)
        cy += sampleTrack(track, S, i, F_Y)
        n++
      }
      if (n) pull(cx / n, cy / n, cam.z, follow)
    }

    // 3. Event blends, in the order they happened.
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      const te = eventT[i]!
      if (te > T) break
      if (e.kind === 'charge') {
        const koT = e.b === P1 ? B.koT[0] : B.koT[1]
        const koHold = e.b === P1 ? 0.22 : 0.3
        const mx = (e.x + sampleTrack(track, e.s, e.b, F_X)) * 0.5
        const my = (e.y + sampleTrack(track, e.s, e.b, F_Y)) * 0.5
        const push = easeInOutCubic(ramp(T, te, te + (e.b === P2 ? 0.35 : 0.2)))
        const release = e.b === P1 ? 1 - easeInOutCubic(ramp(T, koT + koHold + 0.05, koT + koHold + 0.7)) : 1
        pull(mx * 0.5, my * 0.5, e.b === P2 ? 1.3 : 1.14, push * release)
      } else if (e.kind === 'ko') {
        const hold = eventHold[i] ?? 0
        const first = e.a === P1
        const smash = easeOutCubic(ramp(T, te, te + (first ? 0.1 : 0.12)))
        if (first) {
          const release = 1 - easeInOutCubic(ramp(T, te + hold + 0.05, te + hold + 0.7))
          pull(e.x * 0.55, e.y * 0.55, 1.24, smash * release)
        } else {
          pull(e.x * 0.6, e.y * 0.6, 1.48, smash)
          // …and then the long, slow pull back to the boss as the world drains.
          pull(BOSS_HOME.x, BOSS_HOME.y * 0.5, 1.12, easeInOutCubic(ramp(T, te + hold, te + hold + 1.3)))
        }
      }
    }
    // 4. The fall: a slow push in on the boss.
    if (T >= B.battleEndT) pull(BOSS_HOME.x, BOSS_HOME.y * 0.6, 1.2, easeInOutCubic(ramp(T, B.battleEndT, B.landT)))

    // Impact kicks — a punch-in that decays in ~0.2 s — and the shake.
    let kick = 0
    let sx = 0
    let sy = 0
    for (let i = 0; i < shakeT.length; i++) {
      const age = T - shakeT[i]!
      if (age < 0 || age > shakeD[i]!) continue
      const fall = 1 - age / shakeD[i]!
      const amp = shakeA[i]! * fall * fall
      kick += amp * 0.0022 * Math.exp(-age * 14)
      const seed = shakeSeed[i]! * 1.618
      sx += amp * (Math.sin(T * 91 + seed * 7) * 0.6 + Math.sin(T * 147 + seed * 3) * 0.4)
      sy += amp * (Math.cos(T * 83 + seed * 5) * 0.6 + Math.sin(T * 131 + seed * 11) * 0.4)
    }
    // Portrait frames the arena edge-to-edge already; punch-ins there are
    // gentler so a blade near the wall is never cut off.
    if (portrait) {
      cam.z = 1 + (cam.z - 1) * 0.5
      // …and pans sideways less: the arena already fills the width.
      cam.x *= 0.4
    }
    cam.z *= 1 + kick
    cam.sx = sx * unitPx
    cam.sy = sy * unitPx
  }

  /** The KO event of a blue, once it has happened (null before). */
  const koEventOf = (id: number): FightEvent | null => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      if (e.kind === 'ko' && e.a === id) return e
    }
    return null
  }

  const worldScale = (): number => baseScale * cam.z
  const wsx = (x: number): number => W / 2 + cam.sx + (x - cam.x) * worldScale()
  const wsy = (y: number): number => H / 2 + cam.sy + (y - cam.y) * worldScale()

  // ── Lightning (deterministic, allocation-free) ───────────────────────────
  const boltPath = (g: C2D, x0: number, y0: number, x1: number, y1: number, seed: number, segs: number, jit: number): void => {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    g.moveTo(x0, y0)
    for (let i = 1; i < segs; i++) {
      const t = i / segs
      const off = (hash01(seed, i) - 0.5) * 2 * jit * (1 - Math.abs(2 * t - 1) * 0.5)
      g.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off)
    }
    g.lineTo(x1, y1)
    // One short branch
    const bt = 0.3 + hash01(seed, 97) * 0.4
    const off = (hash01(seed, Math.floor(bt * segs)) - 0.5) * 2 * jit
    const bx = x0 + dx * bt + nx * off
    const by = y0 + dy * bt + ny * off
    const ba = Math.atan2(dy, dx) + (hash01(seed, 98) - 0.5) * 1.6
    const bl = len * (0.2 + hash01(seed, 99) * 0.2)
    g.moveTo(bx, by)
    g.lineTo(bx + Math.cos(ba) * bl * 0.5 + nx * jit * 0.4, by + Math.sin(ba) * bl * 0.5 + ny * jit * 0.4)
    g.lineTo(bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl)
  }
  const bolt = (
    g: C2D, x0: number, y0: number, x1: number, y1: number, seed: number, segs: number, jit: number,
    wGlow: number, wCore: number, glow: string, alpha: number
  ): void => {
    g.beginPath()
    boltPath(g, x0, y0, x1, y1, seed, segs, jit)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.globalAlpha = alpha * 0.45
    g.strokeStyle = glow
    g.lineWidth = wGlow
    g.stroke()
    g.globalAlpha = alpha
    g.strokeStyle = '#ffffff'
    g.lineWidth = wCore
    g.stroke()
    g.globalAlpha = 1
  }

  // ── World layers ─────────────────────────────────────────────────────────

  const drawBody = (g: C2D, id: number, S: number, T: number, low: boolean, px: number): void => {
    if (sampleTrack(track, S, id, F_ALIVE) < 0.5) return
    let x = sampleTrack(track, S, id, F_X)
    let y = sampleTrack(track, S, id, F_Y)
    const rot = sampleTrack(track, S, id, F_ROT)
    const speed = sampleTrack(track, S, id, F_SPEED)
    let r = BODY_R[id]!
    let alpha = id === BOSS ? bossAlphaAt(T) : 1
    if (alpha <= 0.01) return

    if (id === BOSS) {
      // The drop: falls out of the sky and slams down at slamT.
      const dropA = B.slamT - 0.34
      if (T < dropA) return
      if (T < B.slamT) {
        const u = easeInCubic(ramp(T, dropA, B.slamT))
        // Shadow grows on the floor first.
        g.globalAlpha = 0.25 + 0.55 * u
        g.drawImage(scorch, x - r * 1.4 * (0.5 + u * 0.5), y - r * 0.9 * (0.5 + u * 0.5) + r * 0.3,
          r * 2.8 * (0.5 + u * 0.5), r * 1.8 * (0.5 + u * 0.5))
        g.globalAlpha = 1
        r *= 1 + (1 - u) * 1.6
        y -= (1 - u) * 90
        alpha = 0.2 + 0.8 * u
      }
    }

    // Afterimages from the precomputed track — the anime speed smear, free.
    if (!low && speed > 260) {
      const n = speed > 520 ? 5 : 3
      for (let k = n; k >= 1; k--) {
        const sp = S - k * 0.014
        if (sampleTrack(track, sp, id, F_ALIVE) < 0.5) continue
        g.globalAlpha = 0.13 * (1 - k / (n + 1)) * alpha
        const ax = sampleTrack(track, sp, id, F_X)
        const ay = sampleTrack(track, sp, id, F_Y)
        g.drawImage(skins[id]!, ax - r, ay - r, r * 2, r * 2)
      }
      g.globalAlpha = 1
    }
    if (speed > 200) {
      // A single smear stroke behind the body.
      const tail = S - 0.05
      const tx = sampleTrack(track, tail, id, F_X)
      const ty = sampleTrack(track, tail, id, F_Y)
      g.globalAlpha = Math.min(0.5, (speed - 200) / 900) * alpha
      g.strokeStyle = id === BOSS ? '#c070ff' : id === P1 ? '#9fd8ff' : '#dff7ff'
      g.lineWidth = r * 1.3
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(tx, ty)
      g.lineTo(x, y)
      g.stroke()
      g.globalAlpha = 1
    }

    // Aura
    if (id === BOSS) {
      const windup = windupAt(S)
      const pulse = 0.72 + 0.18 * Math.sin(T * 7) + windup * 0.5
      const ar = r * (2.3 + windup * 0.9)
      g.globalAlpha = Math.min(1, pulse) * alpha
      g.drawImage(glowBoss, x - ar, y - ar, ar * 2, ar * 2)
      g.globalAlpha = 1
    } else {
      const ar = r * 2
      g.globalAlpha = 0.85 * alpha
      g.drawImage(id === P1 ? glowBlue : glowIce, x - ar, y - ar, ar * 2, ar * 2)
      g.globalAlpha = 1
      if (id === P1) {
        // Tornado vortex, rotating against the spin.
        g.save()
        g.translate(x, y)
        g.rotate(-T * 5.5)
        g.globalAlpha = 0.9 * alpha
        g.drawImage(swirl, -r * 1.9, -r * 1.9, r * 3.8, r * 3.8)
        g.restore()
        g.globalAlpha = 1
      }
    }

    // The skin
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    g.globalAlpha = alpha
    g.drawImage(skins[id]!, -r, -r, r * 2, r * 2)
    g.restore()
    g.globalAlpha = 1

    // Diamond glints — four-point stars flaring around the rim.
    if (id === P2 && !low) {
      g.fillStyle = '#ffffff'
      for (let k = 0; k < 3; k++) {
        const ph = T * 2.2 + k * 2.1
        const fl = Math.max(0, Math.sin(ph * 2.3))
        if (fl < 0.2) continue
        const a = ph * 1.3 + k
        const gx = x + Math.cos(a) * r * 0.75
        const gy = y + Math.sin(a) * r * 0.75
        const gs = r * 0.42 * fl
        g.globalAlpha = fl * alpha
        g.beginPath()
        g.moveTo(gx, gy - gs)
        g.lineTo(gx + gs * 0.18, gy - gs * 0.18)
        g.lineTo(gx + gs, gy)
        g.lineTo(gx + gs * 0.18, gy + gs * 0.18)
        g.lineTo(gx, gy + gs)
        g.lineTo(gx - gs * 0.18, gy + gs * 0.18)
        g.lineTo(gx - gs, gy)
        g.lineTo(gx - gs * 0.18, gy - gs * 0.18)
        g.closePath()
        g.fill()
      }
      g.globalAlpha = 1
    }

    // Hit flash — white, from the most recent contact on this body.
    const flash = hitFlashAt(id, T)
    if (flash > 0) {
      g.globalAlpha = flash * 0.85 * alpha
      g.drawImage(glowWhite, x - r * 1.15, y - r * 1.15, r * 2.3, r * 2.3)
      g.globalAlpha = 1
    }

    // HP ring
    if (T > 0.4 && (id !== BOSS || T >= B.slamT) && alpha > 0.5) {
      const hp = sampleTrack(track, S, id, F_HP)
      const rr = r + 5 * px
      g.lineWidth = (id === BOSS ? 4.2 : 3.4) * px
      g.strokeStyle = 'rgba(0,0,0,0.55)'
      g.beginPath()
      g.arc(x, y, rr, 0, TAU)
      g.stroke()
      g.strokeStyle = id === BOSS ? '#c46bff' : HP_COL[Math.round(clamp01(hp) * 10)]!
      g.lineCap = 'round'
      g.beginPath()
      g.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(hp))
      g.stroke()
      g.lineCap = 'butt'
    }
  }

  /** The boss withdraws before the reclaim — it reappears up top as the goal. */
  const bossAlphaAt = (T: number): number => 1 - ramp(T, B.holdEndT - 0.2, B.reclaimT + 0.3)

  /** 0..1 boss thunder wind-up at T (rises from a wind event to its strike). */
  /** Thunder wind-up, 0..1, from the SCRIPT's wind → strike sim times — so
   *  the telegraph is known before the strike without peeking at physics. */
  const windupAt = (S: number): number => {
    let w = 0
    for (let i = 0; i < WIND_PAIRS.length; i += 2) {
      const s0 = WIND_PAIRS[i]!
      const s1 = WIND_PAIRS[i + 1]!
      if (S >= s0 && S < s1) w = Math.max(w, easeInCubic(ramp(S, s0, s1)))
    }
    return w
  }

  const hitFlashAt = (id: number, T: number): number => {
    let f = 0
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      const t0 = eventT[i]!
      if (t0 > T) break
      if (e.a !== id && !(e.kind === 'hit' && e.b === id)) continue
      if (e.kind !== 'hit' && e.kind !== 'thunder' && e.kind !== 'bumper') continue
      const age = T - t0
      if (age < 0.22) f = Math.max(f, 1 - age / 0.22)
    }
    return f
  }

  const drawBumper = (g: C2D, T: number, am: number): void => {
    if (am <= 0.01) return
    let pop = 0
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      if (e.kind !== 'bumper') continue
      const age = T - eventT[i]!
      if (age >= 0 && age < 0.35) pop = Math.max(pop, 1 - age / 0.35)
    }
    const idle = 0.5 + 0.5 * Math.sin(T * 5)
    const r = BUMPER.r * (1 + pop * 0.3)
    g.globalAlpha = am * (0.3 + idle * 0.15 + pop * 0.65)
    g.drawImage(glowGold, BUMPER.x - r * 2.4, BUMPER.y - r * 2.4, r * 4.8, r * 4.8)
    g.globalAlpha = am
    const rb = r * (160 / 152)
    g.drawImage(bumperBody, BUMPER.x - rb, BUMPER.y - rb, rb * 2, rb * 2)
    if (pop > 0) {
      g.globalAlpha = am * pop
      g.drawImage(glowWhite, BUMPER.x - r * 1.1, BUMPER.y - r * 1.1, r * 2.2, r * 2.2)
    }
    g.globalAlpha = 1
  }

  /** All event-driven world FX, as pure functions of age. */
  const drawEventFx = (g: C2D, T: number, S: number, low: boolean, px: number): void => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      const t0 = eventT[i]!
      if (t0 > T + 1e-6) break
      const hold = eventHold[i]!
      // Sim-age freezes inside a hit-stop; director age keeps running.
      const simAge = S - e.s
      const age = T - t0
      const id = e.id

      switch (e.kind) {
        case 'hit': {
          if (simAge > 0.5) break
          const strong = e.b === BOSS && e.power > 300
          const n = low ? 6 : strong ? 14 : 8
          const life = 0.38
          if (simAge <= life) {
            g.lineCap = 'round'
            g.strokeStyle = strong ? '#fff2b0' : '#ffffff'
            g.lineWidth = (strong ? 2.6 : 1.8) * px
            g.beginPath()
            for (let k = 0; k < n; k++) {
              const a = hash01(id, k) * TAU
              const sp = (220 + hash01(id, k + 50) * 520) * (strong ? 1 : 0.7)
              const tl = life * (0.55 + hash01(id, k + 90) * 0.45)
              if (simAge > tl) continue
              const u = simAge / tl
              const d = sp * simAge * (1 - u * 0.45)
              const len = (1 - u) * sp * 0.028
              const cx = e.x + Math.cos(a) * d
              const cy = e.y + Math.sin(a) * d
              g.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len)
              g.lineTo(cx, cy)
            }
            g.stroke()
          }
          // Impact flare + ring
          if (age < 0.16 + hold) {
            const u = clamp01(age / (0.16 + hold))
            const fr = (strong ? 34 : 20) * (0.6 + u * 0.8)
            g.globalAlpha = 1 - u
            g.drawImage(strong ? glowGold : glowWhite, e.x - fr, e.y - fr, fr * 2, fr * 2)
            g.globalAlpha = 1
          }
          if (strong && simAge < 0.35 && simAge >= 0) {
            const u = simAge / 0.35
            g.globalAlpha = (1 - u) * 0.8
            g.strokeStyle = '#ffe9a8'
            g.lineWidth = (5 * (1 - u) + 1) * px
            g.beginPath()
            g.arc(e.x, e.y, 10 + u * 70, 0, TAU)
            g.stroke()
            g.globalAlpha = 1
          }
          break
        }
        case 'bumper': {
          if (simAge > 0.4 || simAge < 0) break
          const u = simAge / 0.4
          g.globalAlpha = (1 - u) * 0.9
          g.strokeStyle = '#ffe07a'
          g.lineWidth = (4 * (1 - u) + 1) * px
          g.beginPath()
          g.arc(BUMPER.x, BUMPER.y, BUMPER.r + u * 46, 0, TAU)
          g.stroke()
          g.globalAlpha = 1
          if (!low) {
            g.strokeStyle = '#fff1b0'
            g.lineWidth = 1.8 * px
            g.beginPath()
            for (let k = 0; k < 7; k++) {
              const a = hash01(id, k) * TAU
              const d = BUMPER.r + simAge * (260 + hash01(id, k + 7) * 260)
              g.moveTo(BUMPER.x + Math.cos(a) * d, BUMPER.y + Math.sin(a) * d)
              g.lineTo(BUMPER.x + Math.cos(a) * (d + 9 * (1 - u)), BUMPER.y + Math.sin(a) * (d + 9 * (1 - u)))
            }
            g.stroke()
          }
          break
        }
        case 'wall': {
          if (simAge > 0.45 || simAge < 0) break
          const u = simAge / 0.45
          const a = Math.atan2(e.y, e.x)
          const bossHit = e.a === BOSS
          g.globalAlpha = (1 - u) * (bossHit ? 1 : 0.7)
          g.strokeStyle = bossHit ? '#ffd0c0' : '#ff8c80'
          g.lineWidth = ((bossHit ? 12 : 6) * (1 - u) + 2) * px
          g.beginPath()
          g.arc(0, 0, INTRO_ARENA_R - 1, a - 0.34 * (1 + u), a + 0.34 * (1 + u))
          g.stroke()
          g.globalAlpha = 1
          break
        }
        case 'slam': {
          // Crack decal (persists, fading late), dust ring, twin shockwaves,
          // outward lightning.
          if (age < 0.7) {
            for (let k = 0; k < 2; k++) {
              const u = clamp01((age - k * 0.08) / 0.6)
              if (u <= 0 || u >= 1) continue
              g.globalAlpha = (1 - u) * 0.85
              g.strokeStyle = k === 0 ? '#ffffff' : '#ff9a6a'
              g.lineWidth = (9 * (1 - u) + 1) * px
              g.beginPath()
              g.arc(e.x, e.y, 50 + u * 230, 0, TAU)
              g.stroke()
            }
            g.globalAlpha = 1
          }
          if (age < 0.28) {
            const u = age / 0.28
            for (let k = 0; k < (low ? 3 : 6); k++) {
              const a = (k / 6) * TAU + hash01(id, k) * 0.6
              const len = 80 + hash01(id, k + 20) * 80
              bolt(g, e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40,
                e.x + Math.cos(a) * (40 + len), e.y + Math.sin(a) * (40 + len),
                id * 31 + k + Math.floor(age * 30) * 7, 6, 12, 7 * px, 2 * px, '#b98cff', 1 - u)
            }
          }
          if (age < 0.9 && !low) {
            // Debris chips
            g.fillStyle = '#5b2a26'
            for (let k = 0; k < 14; k++) {
              const a = hash01(id, k + 40) * TAU
              const sp = 120 + hash01(id, k + 60) * 200
              const u = age / 0.9
              const d = 46 + sp * age * (1 - u * 0.5)
              const s = (3 + hash01(id, k + 80) * 4) * (1 - u)
              g.fillRect(e.x + Math.cos(a) * d - s / 2, e.y + Math.sin(a) * d - s / 2, s, s)
            }
          }
          break
        }
        case 'thunder': {
          // Chain lightning from the previous link (boss or the first victim)
          // to this blade, flickering for 0.42 s of DIRECTOR time.
          if (age > 0.55 + hold) break
          const from = e.b
          const fx = sampleTrack(track, e.s, from, F_X)
          const fy = sampleTrack(track, e.s, from, F_Y)
          const flick = Math.floor(age * 30)
          if (flick % 5 === 4 && age > 0.12) break
          const fade = 1 - clamp01((age - hold) / 0.55)
          bolt(g, fx, fy, e.x, e.y, id * 101 + flick * 13, low ? 7 : 12, 24, 30 * px, 6 * px, '#a98bff', fade)
          if (!low) bolt(g, fx, fy, e.x, e.y, id * 103 + flick * 17, 9, 34, 14 * px, 2.2 * px, '#7fd0ff', fade * 0.8)
          const fr = BODY_R[e.a]! * 2.4
          g.globalAlpha = fade
          g.drawImage(glowCyan, e.x - fr, e.y - fr, fr * 2, fr * 2)
          g.drawImage(glowWhite, fx - fr * 0.7, fy - fr * 0.7, fr * 1.4, fr * 1.4)
          g.globalAlpha = 1
          break
        }
        case 'ko': {
          drawKo(g, e, S, age, hold, low, px)
          break
        }
        default:
          break
      }
    }
  }

  /** Floor decals, drawn UNDER the bodies: the landing cracks and the KO
   *  scorch marks. */
  const drawGroundFx = (g: C2D, T: number, S: number): void => {
    const fade = 1 - ramp(T, B.battleEndT, B.fallStartT + 0.6)
    if (fade <= 0) return
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      const t0 = eventT[i]!
      if (t0 > T + 1e-6) break
      if (e.kind === 'slam') {
        const cs = 150 * easeOutCubic(ramp(T - t0, 0, 0.12))
        g.globalAlpha = 0.85 * fade
        g.drawImage(cracks, e.x - cs / 2, e.y - cs / 2, cs, cs)
      } else if (e.kind === 'ko') {
        const simAge = S - e.s
        if (simAge <= 0) continue
        const sr = BODY_R[e.a]! * 2.2 * easeOutCubic(clamp01(simAge / 0.2))
        g.globalAlpha = 0.9 * fade
        g.drawImage(scorch, e.x - sr, e.y - sr, sr * 2, sr * 2)
      }
    }
    g.globalAlpha = 1
  }

  const drawKo = (g: C2D, e: FightEvent, S: number, age: number, hold: number, low: boolean, px: number): void => {
    const id = e.id
    const r = BODY_R[e.a]!
    const simAge = S - e.s
    // During the hit-stop the blade is still there, white-hot.
    if (age <= hold) {
      const s = skins[e.a]!
      g.drawImage(s, e.x - r, e.y - r, r * 2, r * 2)
      g.globalAlpha = 0.9
      g.drawImage(glowWhite, e.x - r * 1.6, e.y - r * 1.6, r * 3.2, r * 3.2)
      g.globalAlpha = 1
      return
    }
    const t = simAge
    if (t > 1.6) return
    // Core flash
    if (t < 0.4) {
      const u = t / 0.4
      const fr = r * (1.4 + u * 3.2)
      g.globalAlpha = 1 - u
      g.drawImage(glowWhite, e.x - fr, e.y - fr, fr * 2, fr * 2)
      g.drawImage(e.a === P1 ? glowBlue : glowCyan, e.x - fr * 1.4, e.y - fr * 1.4, fr * 2.8, fr * 2.8)
      g.globalAlpha = 1
    }
    // Explosion spritesheet (if it has loaded), 13 × 50 ms.
    const ex = assets.explosion
    if (ex && ex.complete && ex.naturalWidth > 0 && t < 0.65) {
      const f = Math.min(12, Math.floor(t / 0.05))
      const es = Math.min(r * 3.2, 118 / worldScale())
      g.drawImage(ex, f * 160, 0, 160, 160, e.x - es, e.y - es, es * 2, es * 2)
    }
    // Shockwave
    if (t < 0.6) {
      const u = t / 0.6
      g.globalAlpha = (1 - u) * 0.9
      g.strokeStyle = '#e8f6ff'
      g.lineWidth = (10 * (1 - u) + 1) * px
      g.beginPath()
      g.arc(e.x, e.y, r + u * 150, 0, TAU)
      g.stroke()
      g.globalAlpha = 1
    }
    // The skin SHATTERS: 7 wedges fly apart, spinning.
    if (t < 1.1) {
      const n = low ? 5 : 7
      const u = t / 1.1
      const skin = skins[e.a]!
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * TAU
        const a1 = ((k + 1) / n) * TAU
        const mid = (a0 + a1) / 2
        const sp = 140 + hash01(id, k + 300) * 220
        const d = sp * t * (1 - u * 0.4)
        const rotK = (hash01(id, k + 330) - 0.5) * 14 * t
        g.save()
        g.globalAlpha = 1 - u * u
        g.translate(e.x + Math.cos(mid) * d, e.y + Math.sin(mid) * d)
        g.rotate(rotK)
        g.beginPath()
        g.moveTo(0, 0)
        g.arc(0, 0, r, a0, a1)
        g.closePath()
        g.clip()
        g.drawImage(skin, -r, -r, r * 2, r * 2)
        g.restore()
      }
      g.globalAlpha = 1
    }
    // Embers
    if (!low || t < 0.8) {
      const n = low ? 8 : 20
      for (let k = 0; k < n; k++) {
        const life = 0.7 + hash01(id, k + 500) * 0.8
        if (t > life) continue
        const a = hash01(id, k + 520) * TAU
        const sp = 80 + hash01(id, k + 540) * 300
        const u = t / life
        const d = r * 0.5 + sp * t * (1 - u * 0.6)
        const s = (1.5 + hash01(id, k + 560) * 2.5) * (1 - u) * px * 1.4
        g.globalAlpha = 1 - u
        g.fillStyle = k % 3 === 0 ? '#ffffff' : e.a === P1 ? '#7cc8ff' : '#b6f3ff'
        g.fillRect(e.x + Math.cos(a) * d - s, e.y + Math.sin(a) * d - s, s * 2, s * 2)
      }
      g.globalAlpha = 1
    }
  }

  /** Thunder crackle around the boss (always a little, a lot during wind-up). */
  const drawBossCrackle = (g: C2D, T: number, S: number, low: boolean, px: number): void => {
    if (T < B.slamT - 0.05 || sampleTrack(track, S, BOSS, F_ALIVE) < 0.5) return
    const x = sampleTrack(track, S, BOSS, F_X)
    const y = sampleTrack(track, S, BOSS, F_Y)
    const r = BODY_R[BOSS]!
    const w = windupAt(S)
    const am = bossAlphaAt(T)
    if (am <= 0.01) return
    const n = low ? 1 : 2 + Math.round(w * 4)
    const tick = Math.floor(T * 14)
    for (let k = 0; k < n; k++) {
      const a = hash01(tick, k) * TAU
      const len = r * (1.25 + hash01(tick, k + 9) * 0.8 + w * 0.9)
      bolt(g, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len,
        tick * 7 + k, 5, 7 + w * 6, 5 * px, 1.4 * px, '#9f86ff', (0.55 + w * 0.45) * am)
    }
    if (w > 0) {
      // Telegraph: a lock-on line and a closing reticle on every blue.
      for (const id of TARGETS) {
        if (sampleTrack(track, S, id, F_ALIVE) < 0.5) continue
        const tx = sampleTrack(track, S, id, F_X)
        const ty = sampleTrack(track, S, id, F_Y)
        const tr = BODY_R[id]!
        g.globalAlpha = w * 0.75
        g.strokeStyle = '#ff5a6e'
        g.lineWidth = 2 * px
        g.setLineDash(LOCK_DASH)
        g.lineDashOffset = -T * 60
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(tx, ty)
        g.stroke()
        g.setLineDash(NO_DASH)
        g.lineWidth = 3 * px
        g.beginPath()
        g.arc(tx, ty, tr * (2.6 - w * 1.3), 0, TAU)
        g.stroke()
      }
      g.globalAlpha = 1
      // Converging charge ring
      const u = (T * 2.2) % 1
      g.globalAlpha = w * (1 - u) * 0.8
      g.strokeStyle = '#d4c4ff'
      g.lineWidth = 3 * px
      g.beginPath()
      g.arc(x, y, r * (3.4 - u * 2.2), 0, TAU)
      g.stroke()
      g.globalAlpha = 1
    }
  }

  // ── Screen-space layers ──────────────────────────────────────────────────

  /** Radial speed lines around a focus point (manga focus lines). */
  const speedLines = (g: C2D, fx: number, fy: number, alpha: number, T: number, low: boolean): void => {
    if (alpha <= 0.01) return
    const n = low ? 22 : 40
    const tick = Math.floor(T * 24)
    const outer = Math.hypot(W, H)
    const inner = MIN * 0.3
    g.globalAlpha = alpha
    g.fillStyle = '#ffffff'
    g.beginPath()
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + (hash01(tick, k) - 0.5) * 0.12
      const r0 = inner * (1 + hash01(tick, k + 40) * 0.7)
      const wdt = (0.004 + hash01(tick, k + 80) * 0.01)
      g.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0)
      g.lineTo(fx + Math.cos(a - wdt) * outer, fy + Math.sin(a - wdt) * outer)
      g.lineTo(fx + Math.cos(a + wdt) * outer, fy + Math.sin(a + wdt) * outer)
      g.closePath()
    }
    g.fill()
    g.globalAlpha = 1
  }

  const badgeWidth = (c: Cnv | null): number => ((c as Cnv & { __w?: number } | null)?.__w ?? 100)

  /**
   * The stage badge at centre (cx, cy), height h. `n` is the number on top of
   * the deck; `theme` follows it (boss red at 50, slate below).
   */
  const drawStageBadge = (g: C2D, cx: number, cy: number, h: number, n: number, alpha: number, squash = 0): void => {
    if (alpha <= 0.01) return
    const boss = n >= STAGE_FROM
    const body = boss ? badgeBoss : badgeSlate
    if (!body || !cardAtlas) return
    const k = h / heroH
    const bw = badgeWidth(body)
    const w = bw * k
    const x = cx - w / 2
    const y = cy - h / 2
    g.save()
    g.globalAlpha = alpha
    g.translate(cx, cy + h / 2)
    g.scale(1 + squash * 0.12, 1 - squash * 0.16)
    g.translate(-cx, -cy - h / 2)
    g.drawImage(body, x - 4 * k, y - 4 * k, body.width / DPR * k, body.height / DPR * k)
    // Skull medallion for the boss badge
    if (boss) {
      const ss = h * 0.9
      g.drawImage(skull, x - ss * 0.62, cy - ss / 2, ss, ss)
    }
    // Number chip from the atlas
    const cs = chipPx * k
    const chipX = x + heroH * 0.12 * k
    const chipY = cy - cs / 2 - h * 0.02
    drawAtlasCard(g, n, chipX, chipY, cs)
    g.restore()
  }

  const drawAtlasCard = (g: C2D, n: number, x: number, y: number, size: number): void => {
    if (!cardAtlas || n < 1 || n > STAGE_FROM) return
    const cell = Math.ceil(chipPx + 4)
    const i = n - 1
    const sx = ((i % ATLAS_COLS) * cell + 2) * DPR
    const sy = (Math.floor(i / ATLAS_COLS) * cell + 2) * DPR
    g.drawImage(cardAtlas, sx - DPR, sy - DPR, (chipPx + 2) * DPR, (chipPx + 2) * DPR, x - size / chipPx, y - size / chipPx,
      size + (2 * size) / chipPx, size + (2 * size) / chipPx)
  }

  const drawLevelNumber = (g: C2D, n: number, cx: number, cy: number, size: number): void => {
    if (!levelAtlas || n < 1 || n > LEVEL_FROM) return
    const cell = Math.ceil(heroH * 0.9)
    const i = n - 1
    g.drawImage(levelAtlas, (i % ATLAS_COLS) * cell * DPR, Math.floor(i / ATLAS_COLS) * cell * DPR, cell * DPR, cell * DPR,
      cx - size / 2, cy - size / 2, size, size)
  }

  /** Where the stage badge is and how big, at T. */
  const stageBadgePose = (T: number, out: { x: number; y: number; h: number; a: number }): void => {
    // Home: the live HUD StageBadge underneath (left edges aligned).
    const hudH = hud ? hud.h : L.hudH
    const hudCx = (hud ? hud.x : L.hudX) + (badgeWidth(badgeSlate) * (hudH / heroH)) / 2
    const hudCy = hud ? hud.y + hud.h / 2 : L.hudY + L.hudH / 2
    // Fight pose: top-left, leaving room for the skull medallion on its left.
    const fightCx = L.hudX + L.hudH * 0.6 + (badgeWidth(badgeBoss) * (L.hudH / heroH)) / 2
    const fightCy = L.hudY + L.hudH / 2
    const nameH = L.nameH
    if (T < 0.62) {
      out.a = 0
      return
    }
    if (T < 1.5) {
      const u = easeOutBack(ramp(T, 0.62, 0.8), 2.2)
      out.x = L.nameX + (1 - easeOutCubic(ramp(T, 0.62, 0.76))) * W * 0.7
      out.y = L.nameY
      out.h = nameH * (0.82 + 0.18 * u)
      out.a = 1
      return
    }
    if (T < B.battleEndT) {
      const u = easeInOutCubic(ramp(T, 1.5, 1.85))
      out.x = L.nameX + (fightCx - L.nameX) * u
      out.y = L.nameY + (fightCy - L.nameY) * u
      out.h = nameH + (L.hudH - nameH) * u
      out.a = 1
      return
    }
    const rs = easeInOutCubic(ramp(T, B.reclaimT, B.reclaimT + 0.42))
    const heroY = L.heroStageY + (L.reclaimStageY - L.heroStageY) * rs
    if (T < B.outroT) {
      const u = easeInOutCubic(ramp(T, B.battleEndT, B.fallStartT))
      out.x = fightCx + (L.heroStageX - fightCx) * u
      out.y = fightCy + (heroY - fightCy) * u
      out.h = L.hudH + (heroH - L.hudH) * u
      out.a = 1
      return
    }
    // Outro: home into the live HUD badge, which is identical underneath.
    const u = easeInOutCubic(ramp(T, B.outroT, B.outroT + 0.42))
    out.x = L.heroStageX + (hudCx - L.heroStageX) * u
    out.y = heroY + (hudCy - heroY) * u
    out.h = heroH + (hudH - heroH) * u
    out.a = 1 - ramp(T, B.outroT + 0.34, B.endT)
  }
  const pose = { x: 0, y: 0, h: 0, a: 0 }

  /** Number cards peeling off the stage deck and tumbling away. A card is on
   *  TOP of the badge while it peels (the first PEEL_S), then falls BEHIND it
   *  so the tumbling deck never buries the label. */
  const PEEL_S = 0.14
  const drawCards = (g: C2D, T: number, low: boolean, over: boolean): void => {
    if (T < B.fallStartT || T > B.landT + 1.6) return
    const cs = chipPx
    const bw = badgeWidth(badgeSlate)
    const chipCx = L.heroStageX - bw / 2 + heroH * 0.12 + cs / 2
    const chipCy = L.heroStageY - heroH * 0.02
    const g0 = MIN * 3.4 // gravity, px/s²
    for (let k = 1; k < STAGE_FROM; k++) {
      if (low && k % 2 === 0 && k < STAGE_FROM - 3) continue
      const t0 = stepTime(k, STAGE_FROM, B.fallStartT)
      const age = T - t0
      if (age < 0) break
      if ((age < PEEL_S) !== over) continue
      const life = 1.5
      if (age > life) continue
      const n = STAGE_FROM - k + 1 // the number that peeled
      const side = hash01(n, 5) < 0.62 ? -1 : 1
      const vx = side * MIN * (0.18 + hash01(n, 1) * 0.55)
      const vy = -MIN * (0.35 + hash01(n, 2) * 0.45)
      const x = chipCx + vx * age
      const y = chipCy + vy * age + 0.5 * g0 * age * age
      if (y - cs > H) continue
      const rot = side * (0.5 + hash01(n, 3) * 8) * age
      // The peel: a card-flip squash, then tumbling.
      const flip = Math.cos(Math.min(1, age / 0.55) * Math.PI * (1 + hash01(n, 4)))
      g.save()
      g.translate(x, y)
      g.rotate(rot)
      g.scale(0.3 + 0.7 * Math.abs(flip), 1)
      g.globalAlpha = 1 - ramp(age, life * 0.6, life)
      drawAtlasCard(g, n, -cs / 2, -cs / 2, cs)
      g.restore()
    }
    g.globalAlpha = 1
  }

  /** The level medallion during the fall + its shatter. */
  const drawLevelHero = (g: C2D, T: number, lv: number, x: number, y: number, size: number, alpha: number, squash: number): void => {
    const tier = tierOf(lv)
    const spr = tierSprites[tier]
    if (!spr) return
    // Tier change flash
    let flash = 0
    for (let ei = 0; ei < TIER_EDGES.length; ei++) {
      const edge = TIER_EDGES[ei]!
      const k = LEVEL_FROM - edge
      const te = stepTime(k, LEVEL_FROM, B.fallStartT)
      const a = T - te
      if (a >= 0 && a < 0.25) flash = Math.max(flash, 1 - a / 0.25)
    }
    const s = size
    g.save()
    g.globalAlpha = alpha
    g.translate(x, y + s / 2)
    g.scale(1 + squash * 0.14, 1 - squash * 0.18)
    g.translate(-x, -y - s / 2)
    // The glow SHRINKS with every tier lost — gold blazes, rookie grey is matte.
    const gk = TIER_GLOW_SIZE[tier]! + flash * 0.5
    const ga = TIER_GLOW_ALPHA[tier]! + flash * 0.4
    if (gk > 0 && ga > 0) {
      const gs = s * gk
      g.globalAlpha = alpha * Math.min(1, ga)
      g.drawImage(tier === 0 ? glowGold : glowWhite, x - gs / 2, y - gs / 2, gs, gs)
    }
    g.globalAlpha = alpha
    const sw = spr.width / DPR * (s / (heroH * 1.25))
    g.drawImage(spr, x - sw / 2, y - sw / 2, sw, sw)
    drawLevelNumber(g, lv, x, y + s * 0.08, s * 0.62)
    g.restore()
  }

  const drawLevelShatter = (g: C2D, T: number, x: number, y: number, size: number): void => {
    const t = T - B.holdEndT
    if (t < 0 || t > 0.9) return
    const spr = tierSprites[3]
    if (!spr) return
    const n = 9
    const u = t / 0.9
    const sw = spr.width / DPR * (size / (heroH * 1.25))
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU
      const a1 = ((k + 1) / n) * TAU
      const mid = (a0 + a1) / 2
      const sp = MIN * (0.35 + hash01(777, k) * 0.45)
      const d = sp * t
      g.save()
      g.globalAlpha = 1 - u
      g.translate(x + Math.cos(mid) * d, y + Math.sin(mid) * d + MIN * 0.8 * t * t)
      g.rotate((hash01(778, k) - 0.5) * 10 * t)
      g.beginPath()
      g.moveTo(0, 0)
      g.arc(0, 0, sw / 2, a0, a1)
      g.closePath()
      g.clip()
      g.drawImage(spr, -sw / 2, -sw / 2, sw, sw)
      g.restore()
    }
    if (t < 0.25) {
      g.globalAlpha = 1 - t / 0.25
      const fs = size * (1 + t * 4)
      g.drawImage(glowWhite, x - fs / 2, y - fs / 2, fs, fs)
      g.globalAlpha = 1
    }
  }

  // ── The frame ────────────────────────────────────────────────────────────

  /** Floating damage numbers (screen space, over the world). */
  const drawDamageNumbers = (g: C2D, T: number): void => {
    ensureDamageSprites()
    for (let i = 0; i < events.length; i++) {
      const t0 = eventT[i]!
      if (t0 > T) break
      const spr = dmgSprites[i]
      if (!spr) continue
      const age = T - t0
      if (age > 0.8) continue
      const e = events[i]!
      const u = age / 0.8
      const pop = easeOutBack(clamp01(age / 0.14), 3)
      const k = 0.55 + 0.45 * pop
      const w = (spr.width / DPR) * k
      const h = (spr.height / DPR) * k
      // Gold numbers pop off the contact; red ones rise above the struck blade.
      const ox = e.kind === 'hit' ? (hash01(e.id, 3) - 0.5) * 30 * unitPx : 0
      const x = wsx(e.x) + ox
      const lift = e.kind === 'thunder' ? BODY_R[e.a]! * worldScale() + 10 * unitPx : 18 * unitPx
      const y = wsy(e.y) - lift - u * 46 * unitPx
      g.globalAlpha = 1 - ramp(u, 0.65, 1)
      g.drawImage(spr, x - w / 2, y - h / 2, w, h)
    }
    g.globalAlpha = 1
  }

  /** The two blues that fell, drained of colour, flanking the level medallion
   *  — the player's own team losing the levels, not an abstract number. */
  const drawLostPortraits = (g: C2D, T: number, size: number): void => {
    const a = ramp(T, B.fallStartT - 0.05, B.fallStartT + 0.3) * (1 - ramp(T, B.holdEndT, B.holdEndT + 0.25))
    if (a <= 0) return
    const ps = size * 0.46
    const drop = (1 - easeOutCubic(ramp(T, B.fallStartT - 0.05, B.fallStartT + 0.3))) * -20 * unitPx
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1
      const x = L.heroLevelX + side * size * 0.9
      const y = L.heroLevelY + size * 0.1 + drop
      g.save()
      g.globalAlpha = a
      g.translate(x, y)
      g.rotate(side * (0.18 + (T - B.fallStartT) * 0.05))
      g.drawImage(lostSkins[k]!, -ps / 2, -ps / 2, ps, ps)
      // A crack across each one.
      g.strokeStyle = 'rgba(10,6,8,0.85)'
      g.lineWidth = Math.max(2, ps * 0.05)
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(-ps * 0.42, -ps * 0.28)
      g.lineTo(-ps * 0.06, -ps * 0.02)
      g.lineTo(-ps * 0.14, ps * 0.14)
      g.lineTo(ps * 0.38, ps * 0.36)
      g.stroke()
      g.restore()
    }
    g.globalAlpha = 1
  }

  /** Cracks spreading over the rookie medallion with each heartbeat. */
  const drawMedallionCracks = (g: C2D, T: number, x: number, y: number, size: number): void => {
    const level = (T >= B.landT + 0.18 ? 1 : 0) + (T >= B.landT + 0.9 ? 1 : 0) + (T >= B.holdEndT - 0.12 ? 1 : 0)
    if (level === 0 || T >= B.holdEndT + 0.02) return
    const n = level === 1 ? 2 : level === 2 ? 4 : 7
    g.strokeStyle = '#0d0e11'
    g.lineWidth = Math.max(2, size * 0.022)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    for (let k = 0; k < n; k++) {
      let a = hash01(611, k) * TAU
      let cx = x + (hash01(612, k) - 0.5) * size * 0.08
      let cy = y + (hash01(613, k) - 0.5) * size * 0.08
      g.moveTo(cx, cy)
      const len = size * (0.2 + hash01(614, k) * 0.25) * (level === 3 ? 1.3 : 1)
      for (let j = 1; j <= 4; j++) {
        a += (hash01(615, k * 8 + j) - 0.5) * 0.9
        cx += (Math.cos(a) * len) / 4
        cy += (Math.sin(a) * len) / 4
        g.lineTo(cx, cy)
      }
    }
    g.stroke()
  }

  /** The ladder: two rails and rungs that light bottom → top. */
  const drawLadder = (g: C2D, T: number, alpha: number): void => {
    const top = L.goalY + L.goalSize * 0.5 + chipPx * 0.95 + 8 * unitPx
    const bottom = L.reclaimStageY - heroH / 2 - 8 * unitPx
    if (bottom - top < 24 * unitPx || alpha <= 0) return
    const grow = easeOutCubic(ramp(T, B.reclaimT + 0.3, B.reclaimT + 0.55))
    const yTop = bottom - (bottom - top) * grow
    const half = heroH * 0.36
    g.globalAlpha = alpha * 0.9
    g.strokeStyle = '#8a6a1c'
    g.lineWidth = 5 * unitPx
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(L.heroStageX - half, bottom)
    g.lineTo(L.heroStageX - half * 0.8, yTop)
    g.moveTo(L.heroStageX + half, bottom)
    g.lineTo(L.heroStageX + half * 0.8, yTop)
    g.stroke()
    const rungs = Math.max(4, Math.min(10, Math.floor((bottom - top) / (20 * unitPx))))
    for (let k = 0; k < rungs; k++) {
      const u = (k + 0.5) / rungs
      const ry = bottom - (bottom - top) * u
      if (ry < yTop) break
      const litT = B.reclaimT + 0.55 + k * (0.5 / rungs)
      const lit = ramp(T, litT, litT + 0.06)
      const hw = half * (1 - u * 0.2)
      g.globalAlpha = alpha
      g.fillStyle = lit > 0.5 ? (k === rungs - 1 ? '#ff7a5a' : '#ffd23f') : '#4a3d22'
      roundRect(g, L.heroStageX - hw, ry - 3.5 * unitPx, hw * 2, 7 * unitPx, 3.5 * unitPx)
      g.fill()
      const flash = T >= litT && T < litT + 0.25 ? 1 - (T - litT) / 0.25 : 0
      if (flash > 0) {
        g.globalAlpha = alpha * flash
        g.drawImage(glowGold, L.heroStageX - hw * 1.6, ry - hw * 0.5, hw * 3.2, hw)
      }
    }
    g.globalAlpha = 1
  }

  const draw = (T: number, o: DrawOptions): void => {
    const low = o.low
    const S = director.toS(T)
    // FX ages keep running after the fight track ends — nothing freezes.
    const Sfx = S + Math.max(0, T - B.battleEndT)
    computeCamera(T, S)
    const g = ctx
    g.setTransform(DPR, 0, 0, DPR, 0, 0)
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'

    // The world crossfades out in the outro, uncovering the live game.
    const worldA = 1 - ramp(T, B.outroT - 0.05, B.outroT + 0.4)
    g.clearRect(0, 0, W, H)
    if (worldA > 0 && bgBuffer) {
      g.globalAlpha = worldA
      g.drawImage(bgBuffer, 0, 0, W, H)
      g.globalAlpha = 1
    }
    const px = 1 / worldScale()

    // ── World ──
    // While the world is fading (the outro), draw it into a layer and blit the
    // layer with worldA — the world's own draws set absolute alphas.
    let wg: C2D = g
    if (worldA > 0 && worldA < 1) {
      if (!worldLayer || worldLayer.width !== Math.max(1, Math.ceil(W * DPR)) || worldLayer.height !== Math.max(1, Math.ceil(H * DPR))) {
        worldLayer = mkCanvas(W * DPR, H * DPR)
      }
      wg = ctx2d(worldLayer)
      wg.setTransform(DPR, 0, 0, DPR, 0, 0)
      wg.clearRect(0, 0, W, H)
    }
    if (worldA > 0) {
      const g = wg
      g.save()
      g.translate(W / 2 + cam.sx, H / 2 + cam.sy)
      g.scale(worldScale(), worldScale())
      g.translate(-cam.x, -cam.y)
      const half = INTRO_ARENA_R + ARENA_PAD
      g.drawImage(arena, -half, -half, half * 2, half * 2)
      g.globalAlpha = 0.18 + 0.08 * Math.sin(T * 3.2)
      g.drawImage(glowRed, -INTRO_ARENA_R * 0.8, -INTRO_ARENA_R * 0.8, INTRO_ARENA_R * 1.6, INTRO_ARENA_R * 1.6)
      g.globalAlpha = 1
      drawGroundFx(g, T, Sfx)
      drawBumper(g, T, 1 - ramp(T, B.battleEndT, B.fallStartT))
      // Players under the boss, so a charge reads as the boss running OVER them.
      drawBody(g, P1, S, T, low, px)
      drawBody(g, P2, S, T, low, px)
      drawBody(g, BOSS, S, T, low, px)
      drawBossCrackle(g, T, S, low, px)
      drawEventFx(g, T, Sfx, low, px)
      g.restore()
    }
    if (wg !== g && worldLayer) {
      g.globalAlpha = worldA
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.drawImage(worldLayer, 0, 0)
      g.setTransform(DPR, 0, 0, DPR, 0, 0)
      g.globalAlpha = 1
    }

    // ── Screen-space grade & FX ──
    let lines = 0
    let fx = W / 2
    let fy = H / 2
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      const t0 = eventT[i]!
      if (t0 > T) break
      if (e.kind === 'charge' || e.kind === 'slam') {
        const end = e.kind === 'slam' ? t0 + 0.45 : (e.b === P1 ? B.koT[0] : B.koT[1]) + 0.25
        const a = envelope(T, t0, 0.06, end, 0.2) * (e.kind === 'slam' ? 0.55 : 0.42)
        if (a > lines) {
          lines = a
          fx = wsx(sampleTrack(track, S, BOSS, F_X))
          fy = wsy(sampleTrack(track, S, BOSS, F_Y))
        }
      }
    }
    speedLines(g, fx, fy, lines * worldA, T, low)

    const wind = windupAt(S)
    if (wind > 0) {
      g.globalAlpha = wind * 0.34 * worldA
      g.fillStyle = '#0a0418'
      g.fillRect(0, 0, W, H)
      g.globalAlpha = 1
    }

    // The world drains of colour after the final KO.
    const grade = ramp(T, B.koT[1] + 0.2, B.koT[1] + 1.5) * worldA
    if (grade > 0) {
      if (!low) {
        g.globalCompositeOperation = 'saturation'
        g.globalAlpha = grade * 0.9
        g.fillStyle = '#808080'
        g.fillRect(0, 0, W, H)
        g.globalCompositeOperation = 'source-over'
      }
      // Deeper still once the reclaim needs the stage.
      g.globalAlpha = grade * (0.5 + 0.3 * ramp(T, B.holdEndT, B.reclaimT + 0.4))
      g.fillStyle = '#05020a'
      g.fillRect(0, 0, W, H)
      g.globalAlpha = 1
    }

    drawDamageNumbers(g, T)

    // ── Lv. 30 pills: under each blue → hanging where it died → merge ──
    if (T < B.fallStartT + 0.1 && pillSprite) {
      const pw = badgeWidth(pillSprite)
      const ph = PILL_H
      const k = Math.max(0.85, Math.min(1.6, MIN / 720))
      const merge = ramp(T, B.fallStartT - 0.12, B.fallStartT + 0.06)
      for (let t = 0; t < TARGETS.length; t++) {
        const id = TARGETS[t]!
        if (T < 0.35) continue
        const koT = id === P1 ? B.koT[0] : B.koT[1]
        const koE = T >= koT ? koEventOf(id) : null
        const ko = koE !== null
        const bx = koE ? koE.x : sampleTrack(track, S, id, F_X)
        const by = koE ? koE.y : sampleTrack(track, S, id, F_Y)
        let sx = wsx(bx)
        let sy = wsy(by) + BODY_R[id]! * worldScale() + 14 * k
        let a = ramp(T, 0.35, 0.55)
        let scale = k
        if (ko) {
          const kAge = T - koT
          sy += Math.sin(kAge * 40) * 3 * Math.exp(-kAge * 6)
          a *= 0.65 + 0.35 * Math.sin(kAge * 18) * Math.exp(-kAge * 3)
        }
        const gu = easeInOutCubic(ramp(T, B.battleEndT, B.fallStartT - 0.1))
        if (gu > 0) {
          sx += (L.heroLevelX - sx) * gu
          sy += (L.heroLevelY - sy) * gu
          scale *= 1 + gu * 1.5
          a = Math.max(a, gu)
        }
        a *= 1 - merge
        if (a <= 0.01) continue
        g.globalAlpha = a
        g.drawImage(pillSprite, sx - (pw * scale) / 2, sy - (ph * scale) / 2, (pillSprite.width / DPR) * scale,
          (pillSprite.height / DPR) * scale)
        g.globalAlpha = 1
      }
    }

    stageBadgePose(T, pose)
    const st = countAt(STAGE_FROM, fallU(T, B.fallStartT))
    drawCards(g, T, low, false)

    // Vignette, with a red heartbeat in the hold at "1".
    const hb = Math.max(
      beatPulse(T, B.landT + 0.18), 0.7 * beatPulse(T, B.landT + 0.42),
      beatPulse(T, B.landT + 0.9), 0.7 * beatPulse(T, B.landT + 1.14)
    )
    const landP = T >= B.landT && T < B.landT + 0.4 ? 1 - (T - B.landT) / 0.4 : 0
    const redV = Math.max(grade * 0.55, hb, landP) * (1 - ramp(T, B.reclaimT, B.reclaimT + 0.6))
    g.globalAlpha = worldA * 0.9
    g.drawImage(vignette, -W * 0.15, -H * 0.15, W * 1.3, H * 1.3)
    if (redV > 0) {
      g.globalAlpha = redV
      g.drawImage(vignetteRed, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2)
    }
    g.globalAlpha = 1

    // Letterbox bars — frame 0 on, deeper for the fall, gone for the reclaim.
    const barIn = 1 - ramp(T, B.reclaimT, B.reclaimT + 0.5)
    const bar = (L.barFight + (L.barFall - L.barFight) * easeInOutCubic(ramp(T, B.battleEndT, B.fallStartT))) * barIn
    if (bar > 0.5) {
      g.fillStyle = '#000000'
      g.fillRect(0, 0, W, bar)
      g.fillRect(0, H - bar, W, bar)
    }

    // Boss subtitle band (portrait / narrow) or side panel (wide landscape).
    const band = envelope(T, 0.6, 0.1, 1.55, 0.25)
    if (band > 0) {
      const bh = L.nameH * 1.55
      const skew = bh * 0.35
      const x0 = L.nameMode === 'side' ? W - (W - L.arenaPx) / 2 + 6 : 0
      const bw = W - x0
      const bx = x0 + (1 - easeOutCubic(ramp(T, 0.6, 0.72))) * bw
      g.globalAlpha = band * 0.92
      g.fillStyle = '#5c0a10'
      g.beginPath()
      g.moveTo(bx, L.nameY + bh / 2)
      g.lineTo(bx + bw + skew * 2, L.nameY + bh / 2)
      g.lineTo(bx + bw + skew * 2, L.nameY - bh / 2)
      g.lineTo(bx + skew, L.nameY - bh / 2)
      g.closePath()
      g.fill()
      g.fillStyle = '#ff5a4a'
      g.fillRect(bx + skew, L.nameY - bh / 2 - 3 * unitPx, bw + skew, 3 * unitPx)
      g.fillRect(bx, L.nameY + bh / 2, bw + skew * 2, 3 * unitPx)
      g.globalAlpha = 1
    }

    // ── Level medallion, flanked by the fallen blues ──
    const lv = countAt(LEVEL_FROM, fallU(T, B.fallStartT))
    const heroSize = heroH * 1.45
    drawLostPortraits(g, T, heroSize)
    if (T >= B.fallStartT - 0.12 && T < B.badgeGoneT) {
      const pop = easeOutBack(ramp(T, B.fallStartT - 0.12, B.fallStartT + 0.16), 2.4)
      const landSq = T >= B.landT ? Math.sin(ramp(T, B.landT, B.landT + 0.3) * Math.PI) * Math.exp(-(T - B.landT) * 3.5) : 0
      const lastK = LEVEL_FROM - lv
      const tk = lastK > 0 ? stepTime(lastK, LEVEL_FROM, B.fallStartT) : -9
      const jolt = T - tk < 0.12 ? 1 - (T - tk) / 0.12 : 0
      // Each heartbeat shakes it.
      const shiver = hb * Math.sin(T * 90) * 3 * unitPx
      const exitA = 1 - ramp(T, B.holdEndT, B.holdEndT + 0.04)
      const my = L.heroLevelY + jolt * heroH * 0.07
      drawLevelHero(g, T, lv, L.heroLevelX + shiver, my, heroSize * (0.5 + 0.5 * pop), exitA, landSq * 1.6)
      drawMedallionCracks(g, T, L.heroLevelX + shiver, my, heroSize * 0.9)
    }
    drawLevelShatter(g, T, L.heroLevelX, L.heroLevelY, heroSize)

    // ── Stage badge (name card → HUD → hero → foot of the ladder → HUD) ──
    if (pose.a > 0) {
      const landSq = T >= B.landT ? Math.sin(ramp(T, B.landT, B.landT + 0.3) * Math.PI) * Math.exp(-(T - B.landT) * 3.5) : 0
      const lastK = STAGE_FROM - st
      const tk = lastK > 0 ? stepTime(lastK, STAGE_FROM, B.fallStartT) : -9
      const jolt = T - tk < 0.1 ? 1 - (T - tk) / 0.1 : 0
      drawStageBadge(g, pose.x, pose.y + jolt * heroH * 0.04, pose.h, st, pose.a, landSq * 1.6)
    }
    drawCards(g, T, low, true)

    // Landing: a heavy thump — dust rings under both badges.
    if (T >= B.landT && T < B.landT + 0.55) {
      const u = (T - B.landT) / 0.55
      g.globalAlpha = (1 - u) * 0.85
      g.strokeStyle = '#ffffff'
      g.lineWidth = 7 * unitPx * (1 - u) + 1
      g.beginPath()
      g.ellipse(L.heroStageX, L.heroStageY + heroH * 0.55, heroH * 1.8 * (0.5 + u), heroH * 0.3 * (0.4 + u), 0, 0, TAU)
      g.stroke()
      g.beginPath()
      g.ellipse(L.heroLevelX, L.heroLevelY + heroSize * 0.5, heroSize * (0.55 + u), heroSize * 0.2 * (0.4 + u), 0, 0, TAU)
      g.stroke()
      g.globalAlpha = 1
    }

    // ── Impact frames ──
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      if (e.kind !== 'ko') continue
      const age = T - eventT[i]!
      if (age < 0 || age > 0.12) continue
      if (e.a === P2 && age < 0.1 && !low) {
        // KO 2: the manga two-tone frame — black world, white cut-outs.
        g.fillStyle = '#000000'
        g.fillRect(0, 0, W, H)
        g.save()
        g.translate(W / 2 + cam.sx, H / 2 + cam.sy)
        g.scale(worldScale(), worldScale())
        g.translate(-cam.x, -cam.y)
        const br = BODY_R[BOSS]!
        const pr = BODY_R[P2]!
        const bx = sampleTrack(track, e.s, BOSS, F_X)
        const by = sampleTrack(track, e.s, BOSS, F_Y)
        g.drawImage(whiteSkins[BOSS]!, bx - br, by - br, br * 2, br * 2)
        g.drawImage(whiteSkins[P2]!, e.x - pr, e.y - pr, pr * 2, pr * 2)
        g.restore()
        speedLines(g, wsx(e.x), wsy(e.y), 0.9, T, low)
      } else if (age < 0.07) {
        // KO 1 (and KO 2 on the low tier): a clean white frame.
        g.globalAlpha = 0.9 * (1 - age / 0.07)
        g.fillStyle = '#ffffff'
        g.fillRect(0, 0, W, H)
        g.globalAlpha = 1
      }
    }
    // Other flashes: thunder strike, the slam, the landing.
    let flash = 0
    let flashCol = '#ffffff'
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      const t0 = eventT[i]!
      if (t0 > T) break
      const age = T - t0
      if (e.kind === 'thunder' && e.b === BOSS && age < 0.14) {
        flash = Math.max(flash, 0.3 * (1 - age / 0.14))
        flashCol = '#c9d8ff'
      } else if (e.kind === 'slam' && age < 0.14) {
        flash = Math.max(flash, 0.42 * (1 - age / 0.14))
      }
    }
    if (T >= B.landT && T < B.landT + 0.1) flash = Math.max(flash, 0.28 * (1 - (T - B.landT) / 0.1))
    if (flash > 0) {
      g.globalAlpha = flash
      g.fillStyle = flashCol
      g.fillRect(0, 0, W, H)
      g.globalAlpha = 1
    }

    // ── Reclaim: the boss as the goal, the ladder, one line of copy ──
    if (T >= B.reclaimT) {
      const rA = 1 - ramp(T, B.outroT - 0.12, B.outroT + 0.12)
      if (rA > 0) {
        const up = easeOutBack(ramp(T, B.reclaimT, B.reclaimT + 0.5), 1.5)
        const gs = L.goalSize * (0.6 + 0.4 * up)
        const gy = L.heroLevelY + (L.goalY - L.heroLevelY) * easeOutCubic(ramp(T, B.reclaimT, B.reclaimT + 0.5))
        const ga = rA * ramp(T, B.reclaimT, B.reclaimT + 0.25)
        const pulse = 0.7 + 0.3 * Math.sin((T - B.reclaimT) * 6)
        g.globalAlpha = ga * pulse
        g.drawImage(glowRed, L.goalX - gs * 1.1, gy - gs * 1.1, gs * 2.2, gs * 2.2)
        g.globalAlpha = ga
        const sw = gs * (goal.width / 256)
        g.save()
        g.translate(L.goalX, gy)
        g.rotate((T - B.reclaimT) * 1.1)
        g.drawImage(goal, -sw / 2, -sw / 2, sw, sw)
        g.restore()
        // Skull · 50 — where the climb ends.
        const cs = chipPx * 0.9
        const cy = gy + gs * 0.52
        g.drawImage(skull, L.goalX - cs * 1.08, cy, cs, cs)
        drawAtlasCard(g, STAGE_FROM, L.goalX + cs * 0.08, cy, cs)
        g.globalAlpha = 1
        drawLadder(g, T, rA)
        if (taglineSprite) {
          const tu = easeOutBack(ramp(T, B.reclaimT + 1.0, B.reclaimT + 1.3), 2)
          const ta = rA * ramp(T, B.reclaimT + 1.0, B.reclaimT + 1.12)
          if (ta > 0) {
            const tw = taglineSprite.width / DPR
            const th = taglineSprite.height / DPR
            const s = 0.55 + 0.45 * tu
            g.globalAlpha = ta
            g.drawImage(taglineSprite, L.tagX - (tw * s) / 2, L.tagY - (th * s) / 2, tw * s, th * s)
            g.globalAlpha = 1
          }
        }
      }
    }

    // Fade in from black at the very start, and the skip fade.
    const fadeIn = 1 - ramp(T, 0, 0.3)
    if (fadeIn > 0) {
      g.globalAlpha = fadeIn
      g.fillStyle = '#000000'
      g.fillRect(0, 0, W, H)
      g.globalAlpha = 1
    }
    if (o.fade > 0) {
      g.globalCompositeOperation = 'destination-out'
      g.globalAlpha = o.fade
      g.fillStyle = '#000000'
      g.fillRect(0, 0, W, H)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
    }
  }

  const resize = (w: number, h: number, dpr: number, s: SafeInsets): void => {
    W = Math.max(1, w)
    H = Math.max(1, h)
    DPR = dpr
    safe = s
    MIN = Math.min(W, H)
    portrait = H > W
    bakeViewport()
    layout()
    // The outro's world layer, allocated here rather than on the frame that
    // first needs it (a full-screen canvas allocation is a long frame).
    worldLayer = mkCanvas(W * DPR, H * DPR)
  }

  return {
    resize,
    setHudTarget: (r) => {
      hud = r
    },
    setLabels: (l, family) => {
      labels = l
      fontFamily = family
      font100 = `100px ${fontFamily}`
      if (W > 1) {
        bakeViewport()
        layout()
      }
    },
    draw
  }
}
