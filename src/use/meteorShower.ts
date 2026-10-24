// ─── Meteor shower: the pre-battle intro beat (presentation only) ──────────
//
// Owner (2026-10-22): "The meteor shower is basically not visible anymore due
// to the changed colour palette of the arena and background." The old shower
// was 80 tiny 2-unit streaks bursting out of the arena centre in pale sky /
// peach — invisible on snow, lost on volcanic ash and ruins sand.
//
// The redesign (ui-catalog.md §7.2) is a real meteor STRIKE that reads on
// every arena theme, in the toy-box language: chunky silhouettes with the
// navy (#161a40) outline, warm flat-shaded cores, trails as SOLID layered
// flame shapes, flat impact pieces — no blur, no glow, no gradients, no
// shadowBlur, no filters.
//
//   0 ms        flat navy vignette bands slide in at the screen edges;
//   40–970      nine meteors fall from the upper right in staggered pairs,
//               each telegraphed by a shrinking target ring + a growing
//               ground shadow; on landing: a white-hot starburst, a navy +
//               sun shock ring, chunky spark shards arcing out, a navy-rimmed
//               dust cloud, a molten crater that cools; a 2 px kick;
//   1000–1380   the HERO meteor (2× size) lands on the arena centre: a screen
//               flash (flat fill), a double shock ring, 14 sparks, a 6 px
//               camera shake in WHOLE device pixels;
//   1600        hand-off: the engine leaves `meteor_intro` exactly as before
//               (timer unchanged — the 3-2-1 / VS / PvP timings are not
//               touched); the vignette lifts, craters cool and shrink away.
//
// Everything is a pure function of the shower clock (advanced by the
// physics tick, 16 ms per tick like `meteorIntroTimer`) — no integration, no
// per-frame allocation: a fixed pool of MAX_METEORS meteor records and
// Float32Array spark / puff tables, built once. Every draw layer is batched
// into one path per colour across all meteors (≈ 25 draw calls at the peak,
// independent of the meteor count). Math.random is only rolled at spawn
// (`// vfx-rng`); nothing here reads or advances the match RNG, so PvP /
// league determinism is untouched.
//
// Quality: FX.low → 5 meteors + the hero, sparks only on the hero, no dust,
// no crater rim pass, no vignette. Reduced motion → no shake, no screen flash.
// Painted art (optional): tools/meteor-art packs one atlas into
// PAINTED_METEOR_ART; when it is loaded the meteor bodies (and craters) are
// drawn from it — never stretched past their painted resolution — and the
// procedural shapes stay the fallback (and `?art=procedural`).

import { PAINTED_METEOR_ART, type PaintedMeteorSprite } from '@/use/paintedMeteors'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D

// ── Pool / caps ────────────────────────────────────────────────────────────
export const MAX_METEORS = 12
export const MAX_SPARKS = 14
export const MAX_PUFFS = 6
const SPARK_STRIDE = 4 // angle, speed, vz, size
const PUFF_STRIDE = 3 // angle, dist, size

/** The intro's length in the engine (`meteorIntroTimer` hand-off), ms. */
export const METEOR_INTRO_MS = 1600
/** Ground ellipse squash (rings / craters / shadows lie on the floor). */
const GROUND = 0.78
/** Fixed tick of the shower clock (matches the engine's meteorIntroTimer). */
export const METEOR_TICK_MS = 16

// ── Palette (constant strings: no per-frame colour building) ───────────────
const INK = '#161a40'
const FLAME_OUT = '#ff4f1f'
const FLAME_MID = '#ffa412'
const FLAME_IN = '#ffe14a'
const HOT = '#fff6d0'
const ROCK = '#4a3560'
const ROCK_HI = '#6d5190'
const SUN = '#ffd21a'
const SPARK_B = '#ff8a12'
const DUST = '#f1e4cc'
const LIP = '#b8733f'
const CRATER = '#2b2236'
const MOLTEN = '#ff6a1a'
const FLASH = '#fff4d6'

export type MeteorShowerKind = 'intro' | 'celebrate'

interface Meteor {
  /** impact point (arena units) */
  x: number
  y: number
  /** unit travel direction (falling down-left on screen) */
  dx: number
  dy: number
  /** launch / flight time on the shower clock, ms */
  launch: number
  flight: number
  /** head radius, arena units */
  r: number
  hero: boolean
  sparks: number
  puffs: number
  /** shake phase seed */
  seed: number
}

export interface MeteorShowerState {
  active: boolean
  kind: MeteorShowerKind
  /** shower clock (ms), advanced by tickMeteorShower */
  clock: number
  /** performance.now() of the last tick (render interpolation) */
  tickWall: number
  /** time scale of the authored timeline (span / 1600) */
  k: number
  span: number
  end: number
  count: number
  low: boolean
  still: boolean
  readonly meteors: Meteor[]
  readonly sparks: Float32Array
  readonly puffs: Float32Array
  /** whole-device-pixel camera shake, written by meteorShake() */
  readonly shake: { x: number, y: number }
}

export const createMeteorShower = (): MeteorShowerState => {
  const meteors: Meteor[] = []
  for (let i = 0; i < MAX_METEORS; i++) {
    meteors.push({ x: 0, y: 0, dx: 0, dy: 1, launch: 0, flight: 1, r: 1, hero: false, sparks: 0, puffs: 0, seed: 0 })
  }
  return {
    active: false,
    kind: 'intro',
    clock: 0,
    tickWall: 0,
    k: 1,
    span: METEOR_INTRO_MS,
    end: 0,
    count: 0,
    low: false,
    still: false,
    meteors,
    sparks: new Float32Array(MAX_METEORS * MAX_SPARKS * SPARK_STRIDE),
    puffs: new Float32Array(MAX_METEORS * MAX_PUFFS * PUFF_STRIDE),
    shake: { x: 0, y: 0 }
  }
}

/** Authored launch times of the regular meteors (ms, at span 1600). */
const LAUNCHES = [40, 150, 260, 380, 480, 600, 700, 820, 930] as const
const LAUNCHES_LOW = [40, 260, 480, 700, 930] as const
const LAUNCHES_CELEBRATE = [0, 110, 230, 340, 460, 580, 690] as const
const LAUNCHES_CELEBRATE_LOW = [0, 230, 460, 690] as const
const HERO_LAUNCH = 1000
const HERO_FLIGHT = 380
/** Impacts stay within ±this × arena radius vertically: clear of the tree
 *  towers and their HP gauges (a crater reaches ~23 units past its centre). */
export const IMPACT_Y_MAX = 0.4
/** How far up-screen a meteor starts (arena units along its path). */
const FALL_DIST = 560

export const prefersStill = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * (Re)start the shower. `span` is when the shower must have landed (the
 * intro's 1600 ms; PvP's 1200 ms turn banner) — the authored timeline is
 * scaled to it. `arenaR` keeps impacts on the floor.
 */
export const spawnMeteorShowerFx = (
  s: MeteorShowerState, kind: MeteorShowerKind, span: number, arenaR: number,
  low: boolean, still: boolean, now: number
): void => {
  s.kind = kind
  s.low = low
  s.still = still
  s.span = span
  s.k = Math.max(0.6, span / METEOR_INTRO_MS)
  s.clock = 0
  s.tickWall = now
  const launches = kind === 'celebrate'
    ? (low ? LAUNCHES_CELEBRATE_LOW : LAUNCHES_CELEBRATE)
    : low ? LAUNCHES_LOW : LAUNCHES
  const hero = kind === 'intro'
  const n = Math.min(MAX_METEORS, launches.length + (hero ? 1 : 0))
  const spin = Math.random() * Math.PI * 2 // vfx-rng
  let last = 0
  for (let i = 0; i < n; i++) {
    const m = s.meteors[i]!
    const isHero = hero && i === n - 1
    m.hero = isHero
    if (isHero) {
      m.x = 0
      m.y = 0
      m.r = 20
      m.launch = HERO_LAUNCH * s.k
      m.flight = HERO_FLIGHT * Math.min(1, s.k)
    } else {
      // Golden-angle spread round the floor, 70–165 units out.
      const a = spin + i * 2.39996 + (Math.random() - 0.5) * 0.5 // vfx-rng
      const d = arenaR * (0.32 + 0.42 * Math.random()) // vfx-rng
      m.x = Math.cos(a) * d
      // Keep clear of the trees (baked into the static layer at the top and
      // bottom of the arena): the craters must never paint over a tree.
      m.y = Math.max(-arenaR * IMPACT_Y_MAX, Math.min(arenaR * IMPACT_Y_MAX, Math.sin(a) * d * 0.92))
      m.r = 9 + Math.random() * 3.5 // vfx-rng
      m.launch = (launches[i]! + Math.random() * 40) * s.k // vfx-rng
      m.flight = (270 + Math.random() * 60) * Math.min(1, s.k) // vfx-rng
    }
    const jx = -0.38 + (Math.random() - 0.5) * 0.14 // vfx-rng
    const len = Math.sqrt(jx * jx + 1)
    m.dx = jx / len
    m.dy = 1 / len
    m.seed = Math.random() * 6.283 // vfx-rng
    m.sparks = isHero ? MAX_SPARKS : low || kind === 'celebrate' ? (low ? 0 : 5) : 6
    if (low && isHero) m.sparks = 8
    m.puffs = isHero ? MAX_PUFFS : low ? 0 : 4
    const sb = i * MAX_SPARKS * SPARK_STRIDE
    for (let j = 0; j < m.sparks; j++) {
      const o = sb + j * SPARK_STRIDE
      s.sparks[o] = (j / m.sparks) * Math.PI * 2 + (Math.random() - 0.5) * 0.7 // vfx-rng
      s.sparks[o + 1] = (isHero ? 0.42 : 0.3) * (0.6 + 0.6 * Math.random()) // vfx-rng
      s.sparks[o + 2] = (isHero ? 0.36 : 0.26) * (0.5 + 0.7 * Math.random()) // vfx-rng
      s.sparks[o + 3] = (isHero ? 5.2 : 3.8) * (0.75 + 0.5 * Math.random()) // vfx-rng
    }
    const pb = i * MAX_PUFFS * PUFF_STRIDE
    for (let j = 0; j < m.puffs; j++) {
      const o = pb + j * PUFF_STRIDE
      s.puffs[o] = (j / m.puffs) * Math.PI * 2 + (Math.random() - 0.5) * 0.9 // vfx-rng
      s.puffs[o + 1] = m.r * (0.9 + 0.6 * Math.random()) // vfx-rng
      s.puffs[o + 2] = m.r * (0.75 + 0.35 * Math.random()) // vfx-rng
    }
    last = Math.max(last, m.launch + m.flight)
  }
  s.count = n
  // Craters cool on the floor a little past the hand-off, then shrink away.
  s.end = Math.max(last, span) + 1100
  s.active = n > 0
}

/** One physics tick (16 ms of shower time). */
export const tickMeteorShower = (s: MeteorShowerState, now: number): void => {
  if (!s.active) return
  s.clock += METEOR_TICK_MS
  s.tickWall = now
  if (s.clock >= s.end) s.active = false
}

/** The render-time clock: the last tick + the wall time since (≤ one tick),
 *  so a 120 Hz display draws smooth motion and a frozen game holds still. */
export const meteorClock = (s: MeteorShowerState, now: number): number =>
  s.clock + Math.min(METEOR_TICK_MS, Math.max(0, now - s.tickWall))

const easeOut = (u: number): number => 1 - (1 - u) * (1 - u) * (1 - u)
const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u)

// ── Painted art (optional) ─────────────────────────────────────────────────
let artImg: HTMLImageElement | null = null
let artRequested = false
const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}
/** Start loading the painted meteor atlas (no-op when not painted yet). */
export const preloadMeteorArt = (): void => {
  if (artRequested || !PAINTED_METEOR_ART || !artAllowed()) return
  artRequested = true
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => { artImg = img }
  img.src = prependBaseUrl(`images/vfx/${PAINTED_METEOR_ART.file}?v=${PAINTED_METEOR_ART.v}`)
}
/** Above this many device px per atlas px a sprite is drawn procedurally. */
const ART_MAX_UPSCALE = 1.02

/** Trail length (arena units) of a meteor of head radius r. */
const trailLen = (m: Meteor): number => m.r * (m.hero ? 8 : 7)

// ── Flame silhouette template (head at the origin, travel along +x) ────────
// Tail points: [fraction of the trail length back, fraction of r across].
const TAIL_POS: readonly number[] = [0.18, 1.22, 0.42, 0.98, 0.52, 1.12, 0.7, 0.62, 0.78, 0.78]
const TAIL_NEG: readonly number[] = [0.84, -0.5, 0.64, -0.86, 0.56, -0.62, 0.36, -1.05, 0.16, -1.24]

/** Add one flame layer of meteor m at head (hx, hy) to the current path. */
const flamePath = (ctx: Ctx, m: Meteor, hx: number, hy: number, front: number, lenK: number, widK: number): void => {
  const r = m.r
  const L = trailLen(m) * lenK
  const ux = m.dx
  const uy = m.dy
  // perpendicular (left of travel)
  const px = -uy
  const py = ux
  const ang = Math.atan2(uy, ux)
  ctx.moveTo(hx - px * front * r, hy - py * front * r)
  ctx.arc(hx, hy, front * r, ang - Math.PI / 2, ang + Math.PI / 2)
  for (let i = 0; i < TAIL_POS.length; i += 2) {
    const b = TAIL_POS[i]! * L
    const w = TAIL_POS[i + 1]! * r * widK
    ctx.lineTo(hx - ux * b + px * w, hy - uy * b + py * w)
  }
  ctx.lineTo(hx - ux * L, hy - uy * L)
  for (let i = 0; i < TAIL_NEG.length; i += 2) {
    const b = TAIL_NEG[i]! * L
    const w = TAIL_NEG[i + 1]! * r * widK
    ctx.lineTo(hx - ux * b + px * w, hy - uy * b + py * w)
  }
  ctx.closePath()
}

/** Head position of meteor m at time t, or false while not in flight. */
const headAt = (m: Meteor, t: number, out: { x: number, y: number }): boolean => {
  const u = (t - m.launch) / m.flight
  if (u < 0 || u >= 1) return false
  const rest = FALL_DIST * (1 - Math.pow(u, 1.25))
  out.x = m.x - m.dx * rest
  out.y = m.y - m.dy * rest
  return true
}
const HEAD = { x: 0, y: 0 }

// ── Ground layer (under the models) ────────────────────────────────────────
/**
 * Telegraph rings + ground shadows, craters, dust clouds and shock rings — all
 * on the floor, drawn under the smashers. Arena-unit transform expected.
 */
export const drawMeteorGround = (ctx: Ctx, s: MeteorShowerState, t: number): void => {
  if (!s.active && s.count === 0) return
  if (t >= s.end) return
  const ms = s.meteors
  const n = s.count
  ctx.save()

  // 1 · Incoming: a ground shadow that grows + a target ring that closes in.
  let incoming = 0
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const m = ms[i]!
    const u = (t - m.launch) / m.flight
    if (u < 0 || u >= 1) continue
    incoming++
    const rx = m.r * (0.5 + 0.9 * u)
    ctx.moveTo(m.x + rx, m.y)
    ctx.ellipse(m.x, m.y, rx, rx * GROUND, 0, 0, Math.PI * 2)
  }
  if (incoming > 0) {
    ctx.globalAlpha = 0.3
    ctx.fillStyle = INK
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const m = ms[i]!
      const u = (t - m.launch) / m.flight
      if (u < 0 || u >= 1) continue
      const rx = m.r * (3.2 - 1.9 * u)
      ctx.moveTo(m.x + rx, m.y)
      ctx.ellipse(m.x, m.y, rx, rx * GROUND, 0, 0, Math.PI * 2)
    }
    // solid navy + sun double ring (a dash path effect costs ~3× the raster)
    ctx.lineWidth = 4.2
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = SUN
    ctx.stroke()
  }

  // 2 · Craters: navy rim, sand lip, dark pit, molten core that cools.
  let craters = 0
  for (let pass = s.low ? 1 : 0; pass < 4; pass++) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const m = ms[i]!
      const a = t - (m.launch + m.flight)
      if (a < 0) continue
      const grow = clamp01(a / 70)
      const fadeAt = s.end - 380 + i * 12
      const shrink = 1 - clamp01((t - fadeAt) / 300)
      const k = m.r * grow * shrink * (m.hero ? 1 : 0.92)
      if (k <= 0.05) continue
      craters++
      let rx: number
      if (pass === 0) rx = k * 1.75 + 1.4
      else if (pass === 1) rx = k * 1.75
      else if (pass === 2) rx = k * 1.4
      else {
        const cool = 1 - clamp01(a / (m.hero ? 1300 : 900))
        rx = k * 0.95 * cool
        if (rx <= 0.2) continue
      }
      const cy = m.y + (pass >= 2 ? k * 0.12 : 0)
      ctx.moveTo(m.x + rx, cy)
      ctx.ellipse(m.x, cy, rx, rx * GROUND, 0, 0, Math.PI * 2)
    }
    if (craters === 0) break
    ctx.fillStyle = pass === 0 ? INK : pass === 1 ? LIP : pass === 2 ? CRATER : MOLTEN
    ctx.fill()
  }

  // 3 · Dust clouds: navy-rimmed flat puffs that billow out and shrink away.
  let puffs = 0
  for (let pass = 0; pass < (s.low ? 0 : 2); pass++) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const m = ms[i]!
      const a = t - (m.launch + m.flight)
      const life = m.hero ? 900 : 700
      if (a < 0 || a >= life) continue
      const u = a / life
      const g = u < 0.22 ? u / 0.22 : 1 - ((u - 0.22) / 0.78) * ((u - 0.22) / 0.78)
      const out = easeOut(u)
      const pb = i * MAX_PUFFS * PUFF_STRIDE
      for (let j = 0; j < m.puffs; j++) {
        const o = pb + j * PUFF_STRIDE
        const ang = s.puffs[o]!
        const d = s.puffs[o + 1]! * (0.5 + 0.8 * out)
        let r = s.puffs[o + 2]! * g
        if (r <= 0.3) continue
        let x = m.x + Math.cos(ang) * d
        let y = m.y + Math.sin(ang) * d * GROUND - r * 0.35
        if (pass === 0) { r += 1.5; puffs++ }
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, Math.PI * 2)
      }
    }
    if (pass === 0 && puffs === 0) break
    ctx.fillStyle = pass === 0 ? INK : DUST
    ctx.fill()
  }

  // 4 · Shock rings: navy + sun double stroke racing out over the floor.
  for (let i = 0; i < n; i++) {
    const m = ms[i]!
    const land = m.launch + m.flight
    for (let ring = 0; ring < (m.hero ? 2 : 1); ring++) {
      const life = m.hero ? 480 : 340
      const a = t - land - ring * 110
      if (a < 0 || a >= life) continue
      const u = a / life
      const rx = m.r * (1.3 + (m.hero ? 4.6 - ring * 1.6 : 2.9) * easeOut(u))
      ctx.beginPath()
      ctx.ellipse(m.x, m.y, rx, rx * GROUND, 0, 0, Math.PI * 2)
      ctx.lineWidth = 6.5 * (1 - u) + 2.6
      ctx.strokeStyle = INK
      ctx.stroke()
      ctx.lineWidth = 3.4 * (1 - u) + 1.3
      ctx.strokeStyle = ring === 0 ? SUN : HOT
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ── Sky layer (over the models) ────────────────────────────────────────────
/** Starburst path (8 points) centred on (x, y). */
const starPath = (ctx: Ctx, x: number, y: number, ro: number, ri: number, rot: number): void => {
  for (let i = 0; i < 16; i++) {
    const a = rot + (i * Math.PI) / 8
    const r = i % 2 === 0 ? ro : ri
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r * GROUND
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/**
 * Falling meteors (layered flame + rock head), landing starbursts and spark
 * shards — over the smashers. `dev` = device px per arena unit (sprite
 * upscale guard). Arena-unit transform expected.
 */
export const drawMeteorSky = (ctx: Ctx, s: MeteorShowerState, t: number, dev: number): void => {
  if (s.count === 0 || t >= s.end) return
  const ms = s.meteors
  const n = s.count
  ctx.save()
  ctx.lineJoin = 'round'

  // 1 · Meteors in flight.
  const art = artImg !== null && PAINTED_METEOR_ART !== null ? PAINTED_METEOR_ART.meteor : null
  if (artImg === null && PAINTED_METEOR_ART !== null) preloadMeteorArt()
  let procedural = 0
  for (let i = 0; i < n; i++) {
    const m = ms[i]!
    if (!headAt(m, t, HEAD)) continue
    if (art !== null && drawSprite(ctx, art, m, HEAD.x, HEAD.y, dev)) continue
    procedural++
  }
  if (procedural > 0) {
    // outline + four flame / head fills, each one path for every meteor
    for (let pass = 0; pass < 7; pass++) {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const m = ms[i]!
        if (!headAt(m, t, HEAD)) continue
        if (art !== null && spriteFits(art, m, dev)) continue
        const hx = HEAD.x
        const hy = HEAD.y
        if (pass <= 1) flamePath(ctx, m, hx, hy, 1.28, 1, 1)
        else if (pass === 2) flamePath(ctx, m, hx, hy, 1.02, 0.7, 0.72)
        else if (pass === 3) flamePath(ctx, m, hx, hy, 0.82, 0.44, 0.5)
        else if (pass === 4) {
          // white-hot leading crescent (the rock is drawn over its back)
          const cx = hx + m.dx * m.r * 0.1
          const cy = hy + m.dy * m.r * 0.1
          ctx.moveTo(cx + m.r * 0.86, cy)
          ctx.arc(cx, cy, m.r * 0.86, 0, Math.PI * 2)
        } else if (pass === 5) {
          const cx = hx - m.dx * m.r * 0.22
          const cy = hy - m.dy * m.r * 0.22
          ctx.moveTo(cx + m.r * 0.54, cy)
          ctx.arc(cx, cy, m.r * 0.54, 0, Math.PI * 2)
        } else {
          // light facet, upper-left (screen light)
          const cx = hx - m.dx * m.r * 0.22 - m.r * 0.16
          const cy = hy - m.dy * m.r * 0.22 - m.r * 0.18
          ctx.moveTo(cx + m.r * 0.24, cy)
          ctx.arc(cx, cy, m.r * 0.24, 0, Math.PI * 2)
        }
      }
      if (pass === 0) {
        ctx.lineWidth = 5.2
        ctx.strokeStyle = INK
        ctx.stroke()
        continue
      }
      ctx.fillStyle = pass === 1 ? FLAME_OUT : pass === 2 ? FLAME_MID : pass === 3 ? FLAME_IN : pass === 4 ? HOT : pass === 5 ? ROCK : ROCK_HI
      ctx.fill()
    }
  }

  // 2 · Landing starbursts (110 ms; the hero's 170 ms).
  let bursts = 0
  for (let pass = 0; pass < 3; pass++) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const m = ms[i]!
      const life = m.hero ? 170 : 110
      const a = t - (m.launch + m.flight)
      if (a < 0 || a >= life) continue
      if (pass === 0) bursts++
      const ro = m.r * (1.2 + (m.hero ? 2.7 : 2.2) * Math.sin((Math.PI * a) / life))
      const k = pass === 2 ? 0.55 : 1
      starPath(ctx, m.x, m.y - m.r * 0.3, ro * k, ro * k * 0.5, m.seed)
    }
    if (pass === 0) {
      if (bursts === 0) break
      ctx.lineWidth = 5.2
      ctx.strokeStyle = INK
      ctx.stroke()
      continue
    }
    ctx.fillStyle = pass === 1 ? SUN : HOT
    ctx.fill()
  }

  // 3 · Spark shards: chunky diamonds arcing out, shrinking (no alpha fade,
  //     so all of them batch into one outline + two fills).
  let sparks = 0
  for (let pass = 0; pass < 3; pass++) {
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const m = ms[i]!
      const a = t - (m.launch + m.flight)
      const life = m.hero ? 620 : 480
      if (a < 0 || a >= life || m.sparks === 0) continue
      const u = a / life
      const sb = i * MAX_SPARKS * SPARK_STRIDE
      for (let j = 0; j < m.sparks; j++) {
        if (pass === 1 && (j & 1) === 1) continue
        if (pass === 2 && (j & 1) === 0) continue
        const o = sb + j * SPARK_STRIDE
        const ang = s.sparks[o]!
        const v = s.sparks[o + 1]!
        const vz = s.sparks[o + 2]!
        const sz = s.sparks[o + 3]! * (1 - u * u)
        if (sz <= 0.4) continue
        if (pass === 0) sparks++
        // ground travel with drag + a height arc (gravity) lifted up-screen
        const d = (v * (1 - Math.exp(-a * 0.004))) / 0.004
        const z = Math.max(0, vz * a - 0.00045 * a * a)
        const ca = Math.cos(ang)
        const sa = Math.sin(ang)
        const x = m.x + ca * d
        const y = m.y + sa * d * GROUND - z
        const bump = pass === 0 ? 1.3 : 0
        const L = sz * 1.7 + bump
        const W = sz * 0.62 + bump
        const B = sz + bump
        ctx.moveTo(x + ca * L, y + sa * L)
        ctx.lineTo(x - sa * W, y + ca * W)
        ctx.lineTo(x - ca * B, y - sa * B)
        ctx.lineTo(x + sa * W, y - ca * W)
        ctx.closePath()
      }
    }
    if (pass === 0 && sparks === 0) break
    ctx.fillStyle = pass === 0 ? INK : pass === 1 ? SUN : SPARK_B
    ctx.fill()
  }
  ctx.restore()
}

const spriteFits = (sp: PaintedMeteorSprite, m: Meteor, dev: number): boolean =>
  (trailLen(m) + m.r * 1.3) * dev <= sp.w * ART_MAX_UPSCALE

/** Painted meteor along its travel, head anchored on (hx, hy). */
const drawSprite = (ctx: Ctx, sp: PaintedMeteorSprite, m: Meteor, hx: number, hy: number, dev: number): boolean => {
  if (artImg === null || !spriteFits(sp, m, dev)) return false
  const len = trailLen(m) + m.r * 1.3
  const k = len / sp.w
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(Math.atan2(m.dy, m.dx))
  ctx.drawImage(artImg, sp.x, sp.y, sp.w, sp.h, -sp.ax * k, -sp.ay * k, sp.w * k, sp.h * k)
  ctx.restore()
  return true
}

// ── Screen layer (css-px transform: after the arena transform is popped) ───
/**
 * Flat navy vignette bands (two nested frames of fillRect strips — no radial
 * gradient) that frame the strike, and the hero's flat screen flash.
 */
export const drawMeteorScreen = (ctx: Ctx, s: MeteorShowerState, t: number, w: number, h: number): void => {
  if (s.kind !== 'intro' || s.count === 0 || t >= s.end) return
  const inU = clamp01(t / (200 * s.k))
  const outU = clamp01((t - (s.span - 100)) / 350)
  const env = inU * (1 - outU)
  if (env > 0.01 && !s.low) {
    // Stepped frame: nested bands of flat navy, each four non-overlapping
    // fillRect strips (the rect fast path; only the edge area is touched).
    ctx.save()
    ctx.fillStyle = INK
    ctx.globalAlpha = 0.16 * env
    const m = Math.min(w, h)
    for (let b = 0; b < 2; b++) {
      const d = m * (0.03 + 0.03 * b)
      ctx.fillRect(0, 0, w, d)
      ctx.fillRect(0, h - d, w, d)
      ctx.fillRect(0, d, d, h - 2 * d)
      ctx.fillRect(w - d, d, d, h - 2 * d)
    }
    ctx.restore()
  }
  if (s.still) return
  // hero screen flash (flat fill, 170 ms)
  const n = s.count
  for (let i = 0; i < n; i++) {
    const m = s.meteors[i]!
    if (!m.hero) continue
    const a = t - (m.launch + m.flight)
    if (a < 0 || a >= 170) continue
    ctx.save()
    ctx.globalAlpha = 0.45 * (1 - a / 170)
    ctx.fillStyle = FLASH
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
}

/**
 * Camera shake in WHOLE device pixels (a sub-pixel offset would resample the
 * static layer blit and soften the frame). Written into `s.shake`.
 */
export const meteorShake = (s: MeteorShowerState, t: number): { x: number, y: number } => {
  const out = s.shake
  out.x = 0
  out.y = 0
  if (s.still || s.kind !== 'intro' || s.count === 0 || t >= s.end) return out
  let fx = 0
  let fy = 0
  for (let i = 0; i < s.count; i++) {
    const m = s.meteors[i]!
    const a = t - (m.launch + m.flight)
    const life = m.hero ? 320 : s.low ? 0 : 90
    if (a < 0 || a >= life) continue
    const amp = (m.hero ? 6 : 2) * (1 - a / life) * (1 - a / life)
    fx += amp * Math.sin(a * 0.11 + m.seed)
    fy += amp * Math.cos(a * 0.093 + m.seed * 1.7)
  }
  out.x = Math.max(-7, Math.min(7, Math.round(fx)))
  out.y = Math.max(-7, Math.min(7, Math.round(fy)))
  return out
}

/** Dev / test hook: the shower's clock (window.__meteorShower in dev). */
export const installMeteorDevHook = (s: MeteorShowerState): void => {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __meteorShower?: { clock: () => number, state: MeteorShowerState } }).__meteorShower = {
    clock: () => s.clock,
    state: s
  }
}
