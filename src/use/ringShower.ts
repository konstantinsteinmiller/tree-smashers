// ─── Ring meteor shower: the pre-battle intro beat (presentation only) ─────
//
// Owner (2026-10-22): "What I had in mind was a redesign of the chaos arena
// meteor shower that emits from a ring in the center of the screen and flies
// outwards like the chaos arena meteor shower effect, but in the painted
// themed art of tree-smashers." This is the DEFAULT variant (ui-catalog.md
// §7.2); the earlier "strike from the upper right" (src/use/meteorShower.ts)
// is kept for reuse behind `?meteor=strike`.
//
// Chaos Arena reference (useSpinnerGame.ts `spawnMeteorShower(80, 50, 65)`):
// 80 tiny streaks spawned on a ring of radius 50 at even angles (± 0.15 rad),
// a random start delay over 60 % of their 65-frame life, launched radially at
// 1.5–4 px/frame and accelerating outward (+0.02 px/frame² along the radius),
// a streak tail of 4 × speed, warm / cool hue buckets, one path per bucket.
//
// Here the same choreography in the toy-box language — fewer, CHUNKY meteors
// (a flat cel-shaded flame teardrop + rock head with ONE bold navy outline),
// coloured by the arena THEME (warm fire on meadow / woodland / rocky /
// volcanic / ruins, ice comets on snow, candy on the bedroom), no stitches:
//
//   0–150 ms    the emitter ring ignites at the arena centre (navy + accent
//               double ring with outward flame teeth), a flat centre
//               starburst, a 3 px camera kick, a flat 120 ms screen flash;
//   40–~880     meteors burst out of the ring at even angles in staggered
//               waves, growing from the ring, accelerating outward, their
//               flame trails stretching with speed; side-bound meteors land
//               on the floor (flat starburst + navy / accent shock ring +
//               spark shards), top / bottom-bound ones fly on over the trees
//               and shrink away — no impact ever lands on a tree or its gauge;
//   ≤ span-150  the last meteor is done; the ring flares out and lifts;
//   1600        hand-off: the engine leaves `meteor_intro` exactly as before.
//
// Pure function of the shower clock (16 ms physics ticks), fixed pool, no
// per-frame allocation, one path per colour layer across all meteors. No
// global random source and no match RNG: spawn rolls come from a local hash PRNG.
// FX.low: half the meteors, no sparks, no teeth. Reduced motion: no shake,
// no flash. Painted art (optional): tools/ring-meteor-art packs one sprite per
// palette family into PAINTED_RING_METEOR_ART; never drawn above its painted
// resolution; `?art=procedural` keeps the shapes.

import type { ArenaTheme } from '@/use/arenaThemes'
import { PAINTED_RING_METEOR_ART, type PaintedRingMeteorSprite, type RingMeteorFamily } from '@/use/paintedRingMeteors'
import { prependBaseUrl } from '@/utils/function'

type Ctx = CanvasRenderingContext2D

/** Which shower plays: the ring burst (default) or the kept strike variant. */
export type MeteorVariant = 'ring' | 'strike'
export const resolveMeteorVariant = (search: string): MeteorVariant =>
  /[?&]meteor=strike(?:&|$)/.test(search) ? 'strike' : 'ring'
/** Frozen at boot (`?meteor=strike` brings back the kept strike variant). */
export const METEOR_VARIANT: MeteorVariant =
  typeof location !== 'undefined' ? resolveMeteorVariant(location.search) : 'ring'

export const MAX_RING_METEORS = 24
export const RING_SPARKS = 4
const SPARK_STRIDE = 3 // angle, speed, size
export const RING_TICK_MS = 16
/** Emitter ring radius as a fraction of the arena radius. */
export const RING_R_FRAC = 0.2
/** Landings stay within ±this × arena radius vertically (off the trees). */
export const RING_IMPACT_Y_MAX = 0.4
const GROUND = 0.78
const TEETH = 16

export type RingShowerKind = 'intro' | 'celebrate'

// ── Palettes (constant strings) ────────────────────────────────────────────
const INK = '#161a40'
const HOT = '#fff6d0'
const FLASH = '#fff4d6'
export interface RingPalette {
  family: RingMeteorFamily
  out: string
  mid: string
  core: string
  rock: string
  rockHi: string
  accent: string
}
const FIRE = (rock: string, rockHi: string, accent: string, out = '#ff5a1f', mid = '#ffa412', core = '#ffe14a'): RingPalette =>
  ({ family: 'fire', out, mid, core, rock, rockHi, accent })
export const RING_PALETTES: Readonly<Record<ArenaTheme, RingPalette>> = {
  meadow: FIRE('#4a3560', '#6d5190', '#fff27a', '#ff6a2a', '#ffb21a', '#fff27a'),
  woodland: FIRE('#4a3560', '#6d5190', '#ffd36b', '#ff7a2a', '#ffc23a', '#ffe9a0'),
  rocky: FIRE('#5a4c34', '#a08a5e', '#ffe14a'),
  volcanic: FIRE('#2b2236', '#5e4c40', '#ffd21a', '#ff3a1a', '#ff8a12', '#ffd21a'),
  ruins: FIRE('#4a2523', '#875047', '#ff8a6b', '#ff4a2a', '#ff9a4a', '#ffe0a0'),
  snowy: { family: 'ice', out: '#2f7fe0', mid: '#6cc4ff', core: '#e8f8ff', rock: '#2c4a86', rockHi: '#8fb8d6', accent: '#6cc4ff' },
  bedroom: { family: 'candy', out: '#e8508a', mid: '#ff9ac4', core: '#fff0f7', rock: '#4a5ab0', rockHi: '#9fb8ea', accent: '#ff9ac4' }
}

interface RingMeteor {
  /** unit direction out of the centre */
  ux: number
  uy: number
  launch: number
  flight: number
  /** start / end distance from the centre, arena units */
  d0: number
  d1: number
  /** head radius */
  r: number
  /** lands on the floor (side-bound) vs flies on and shrinks away */
  lands: boolean
  seed: number
}

export interface RingShowerState {
  active: boolean
  kind: RingShowerKind
  clock: number
  tickWall: number
  span: number
  end: number
  count: number
  ringR: number
  low: boolean
  still: boolean
  pal: RingPalette
  readonly meteors: RingMeteor[]
  readonly sparks: Float32Array
  readonly shake: { x: number, y: number }
}

export const createRingShower = (): RingShowerState => {
  const meteors: RingMeteor[] = []
  for (let i = 0; i < MAX_RING_METEORS; i++) {
    meteors.push({ ux: 1, uy: 0, launch: 0, flight: 1, d0: 0, d1: 1, r: 1, lands: false, seed: 0 })
  }
  return {
    active: false,
    kind: 'intro',
    clock: 0,
    tickWall: 0,
    span: 1600,
    end: 0,
    count: 0,
    ringR: 40,
    low: false,
    still: false,
    pal: RING_PALETTES.meadow,
    meteors,
    sparks: new Float32Array(MAX_RING_METEORS * RING_SPARKS * SPARK_STRIDE),
    shake: { x: 0, y: 0 }
  }
}

// Local presentation PRNG (mulberry32) — never the global random source, never match RNG.
let prngState = 0x9e3779b9
let showerSerial = 0
const rnd = (): number => {
  prngState = (prngState + 0x6d2b79f5) | 0
  let z = prngState
  z = Math.imul(z ^ (z >>> 15), z | 1)
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
  return ((z ^ (z >>> 14)) >>> 0) / 4294967296
}

export const ringMeteorCount = (kind: RingShowerKind, low: boolean): number =>
  kind === 'intro' ? (low ? 12 : 24) : (low ? 8 : 16)

/**
 * (Re)start the shower. `span` is when it must be done (intro 1600 ms, PvP's
 * 1200 ms banner); `arenaR` sizes the ring and keeps landings on the floor.
 */
export const spawnRingShowerFx = (
  s: RingShowerState, kind: RingShowerKind, span: number, arenaR: number, theme: ArenaTheme,
  low: boolean, still: boolean, now: number
): void => {
  prngState = (0x2545f491 + Math.imul(++showerSerial, 0x9e3779b1)) | 0
  s.kind = kind
  s.low = low
  s.still = still
  s.span = span
  s.clock = 0
  s.tickWall = now
  s.pal = RING_PALETTES[theme] ?? RING_PALETTES.meadow
  s.ringR = arenaR * RING_R_FRAC
  const n = ringMeteorCount(kind, low)
  const k = Math.max(0.6, span / 1600)
  // Two interleaved waves round the ring (chaos: even angles ± 0.15 rad).
  const spin = rnd() * Math.PI * 2
  const latest = span - 150
  let last = 0
  for (let i = 0; i < n; i++) {
    const m = s.meteors[i]!
    const a = spin + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.3
    m.ux = Math.cos(a)
    m.uy = Math.sin(a)
    m.r = (kind === 'intro' ? 6.2 : 5.2) + rnd() * 2.2
    m.d0 = s.ringR
    const dLand = arenaR * (0.5 + 0.32 * rnd())
    m.lands = Math.abs(m.uy * dLand) <= arenaR * RING_IMPACT_Y_MAX
    m.d1 = m.lands ? dLand : arenaR * 1.15
    m.flight = (430 + rnd() * 170) * Math.min(1, k)
    const wave = (i & 1) === 0 ? 40 : 300
    const launch = (wave + rnd() * 380) * k
    m.launch = Math.min(launch, latest - m.flight)
    m.seed = rnd() * 6.283
    const sb = i * RING_SPARKS * SPARK_STRIDE
    for (let j = 0; j < RING_SPARKS; j++) {
      const o = sb + j * SPARK_STRIDE
      s.sparks[o] = a + Math.PI + (j - 1.5) * 0.9 + (rnd() - 0.5) * 0.5
      s.sparks[o + 1] = 0.05 + 0.05 * rnd()
      s.sparks[o + 2] = 2.6 + 1.4 * rnd()
    }
    last = Math.max(last, m.launch + m.flight)
  }
  s.count = n
  s.end = Math.max(last + 400, span + 200)
  s.active = n > 0
}

export const tickRingShower = (s: RingShowerState, now: number): void => {
  if (!s.active) return
  s.clock += RING_TICK_MS
  s.tickWall = now
  if (s.clock >= s.end) s.active = false
}

export const ringClock = (s: RingShowerState, now: number): number =>
  s.clock + Math.min(RING_TICK_MS, Math.max(0, now - s.tickWall))

const clamp01 = (u: number): number => (u < 0 ? 0 : u > 1 ? 1 : u)
const easeOut = (u: number): number => 1 - (1 - u) * (1 - u) * (1 - u)

// Head / trail of a meteor at time t (written into HEAD), false when not out.
const HEAD = { x: 0, y: 0, len: 0, sc: 0 }
const headAt = (m: RingMeteor, t: number): boolean => {
  const u = (t - m.launch) / m.flight
  if (u < 0 || u >= 1) return false
  // accelerating outward (chaos: +0.02 px/frame² along the radius)
  const e = 0.35 * u + 0.65 * u * u
  const d = m.d0 + (m.d1 - m.d0) * e
  HEAD.x = m.ux * d
  HEAD.y = m.uy * d
  // speed-stretched trail; grows out of the ring, fliers shrink away at the end
  const speed = 0.35 + 1.3 * u
  const grow = clamp01(u / 0.14)
  const fade = m.lands ? 1 : 1 - clamp01((u - 0.62) / 0.38)
  HEAD.sc = (0.45 + 0.55 * easeOut(grow)) * fade
  HEAD.len = m.r * (1.6 + 4.6 * speed) * HEAD.sc
  return HEAD.sc > 0.05
}

const TAIL_POS: readonly number[] = [0.22, 1.12, 0.46, 0.84, 0.6, 0.9, 0.82, 0.42]
const TAIL_NEG: readonly number[] = [0.86, -0.4, 0.66, -0.78, 0.44, -0.86, 0.2, -1.12]

/** One flame layer of meteor m (head at HEAD) into the current path. */
const flamePath = (ctx: Ctx, m: RingMeteor, front: number, lenK: number, widK: number): void => {
  const r = m.r * HEAD.sc
  const L = HEAD.len * lenK
  const ux = m.ux
  const uy = m.uy
  const px = -uy
  const py = ux
  const hx = HEAD.x
  const hy = HEAD.y
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

/** 8-point starburst path. */
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

/** Emitter ring envelope: ignition pop, hold, flare-out. 0 = hidden. */
const ringScale = (s: RingShowerState, t: number): number => {
  if (t < 0) return 0
  const inU = clamp01(t / 150)
  const outStart = s.span * 0.62
  const outU = clamp01((t - outStart) / (s.span * 0.2))
  if (outU >= 1) return 0
  return (0.35 + 0.65 * easeOut(inU)) * (1 + 0.6 * outU)
}

// ── Painted art (optional) ─────────────────────────────────────────────────
const artImgs: Partial<Record<RingMeteorFamily, HTMLImageElement>> = {}
let artRequested = false
const artAllowed = (): boolean => {
  if (typeof Image === 'undefined' || typeof location === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  return !/[?&]art=procedural(?:&|$)/.test(location.search)
}
export const preloadRingMeteorArt = (): void => {
  if (artRequested || PAINTED_RING_METEOR_ART === null || !artAllowed()) return
  artRequested = true
  for (const fam of Object.keys(PAINTED_RING_METEOR_ART.sprites) as RingMeteorFamily[]) {
    const sp = PAINTED_RING_METEOR_ART.sprites[fam]
    if (!sp) continue
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => { artImgs[fam] = img }
    img.src = prependBaseUrl(`images/vfx/${sp.file}?v=${sp.v}`)
  }
}
const ART_MAX_UPSCALE = 1.02

// Sized by the HEAD (sprite height = 2.6 head radii, like the procedural
// outline), so the painted rock matches the drawn one; the trail follows the
// painting's own proportions.
const spriteFits = (sp: PaintedRingMeteorSprite, m: RingMeteor, dev: number): boolean =>
  m.r * HEAD.sc * 2.6 * dev <= sp.h * ART_MAX_UPSCALE

const drawSprite = (ctx: Ctx, img: HTMLImageElement, sp: PaintedRingMeteorSprite, m: RingMeteor): void => {
  const k = (m.r * HEAD.sc * 2.6) / sp.h
  ctx.save()
  ctx.translate(HEAD.x, HEAD.y)
  ctx.rotate(Math.atan2(m.uy, m.ux))
  ctx.drawImage(img, sp.x, sp.y, sp.w, sp.h, -sp.ax * k, -sp.ay * k, sp.w * k, sp.h * k)
  ctx.restore()
}

// ── Ground layer (under the models) ────────────────────────────────────────
/** The emitter ring + landing shock rings, on the floor. Arena-unit transform. */
export const drawRingGround = (ctx: Ctx, s: RingShowerState, t: number): void => {
  if (s.count === 0 || t >= s.end) return
  ctx.save()
  ctx.lineJoin = 'round'
  const pal = s.pal
  const rs = ringScale(s, t)
  if (rs > 0) {
    const rr = s.ringR * rs
    const thin = rs > 1 ? 1 / rs : 1
    // flame teeth pointing outward (high tier), flickering with the clock
    if (!s.low) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath()
        for (let i = 0; i < TEETH; i++) {
          const a = (i / TEETH) * Math.PI * 2 + t * 0.0012
          const flick = 0.75 + 0.25 * Math.sin(t * 0.03 + i * 2.1)
          const h = rr * 0.34 * flick * thin + (pass === 0 ? 2 : 0)
          const w = 0.13 + (pass === 0 ? 0.03 : 0)
          const ca = Math.cos(a)
          const sa = Math.sin(a)
          const c1 = Math.cos(a - w)
          const s1 = Math.sin(a - w)
          const c2 = Math.cos(a + w)
          const s2 = Math.sin(a + w)
          ctx.moveTo(c1 * rr, s1 * rr * GROUND)
          ctx.lineTo(ca * (rr + h), sa * (rr + h) * GROUND)
          ctx.lineTo(c2 * rr, s2 * rr * GROUND)
          ctx.closePath()
        }
        ctx.fillStyle = pass === 0 ? INK : pal.mid
        ctx.fill()
      }
    }
    ctx.beginPath()
    ctx.ellipse(0, 0, rr, rr * GROUND, 0, 0, Math.PI * 2)
    ctx.lineWidth = 8 * thin
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.lineWidth = 3.8 * thin
    ctx.strokeStyle = pal.accent
    ctx.stroke()
  }
  // landing shock rings (one constant-width double stroke for all)
  let rings = 0
  ctx.beginPath()
  for (let i = 0; i < s.count; i++) {
    const m = s.meteors[i]!
    if (!m.lands) continue
    const a = t - (m.launch + m.flight)
    if (a < 0 || a >= 300) continue
    rings++
    const x = m.ux * m.d1
    const y = m.uy * m.d1
    const rx = m.r * (1.2 + 2.6 * easeOut(a / 300))
    ctx.moveTo(x + rx, y)
    ctx.ellipse(x, y, rx, rx * GROUND, 0, 0, Math.PI * 2)
  }
  if (rings > 0) {
    ctx.lineWidth = 5
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.lineWidth = 2.4
    ctx.strokeStyle = pal.accent
    ctx.stroke()
  }
  ctx.restore()
}

// ── Sky layer (over the models) ────────────────────────────────────────────
/** Meteors in flight, the centre ignition burst, landing bursts and sparks. */
export const drawRingSky = (ctx: Ctx, s: RingShowerState, t: number, dev: number): void => {
  if (s.count === 0 || t >= s.end) return
  const pal = s.pal
  const ms = s.meteors
  const n = s.count
  ctx.save()
  ctx.lineJoin = 'round'

  // 1 · Meteors (painted sprite when loaded and sharp enough, else shapes).
  const atlas = PAINTED_RING_METEOR_ART
  const sp = atlas !== null ? atlas.sprites[pal.family] ?? null : null
  const img = sp !== null ? artImgs[pal.family] ?? null : null
  if (atlas !== null && !artRequested) preloadRingMeteorArt()
  let procedural = 0
  if (img !== null && sp !== null) {
    for (let i = 0; i < n; i++) {
      const m = ms[i]!
      if (!headAt(m, t)) continue
      if (spriteFits(sp, m, dev)) drawSprite(ctx, img, sp, m)
      else procedural++
    }
  } else {
    procedural = 1
  }
  if (procedural > 0) {
    for (let pass = 0; pass < 6; pass++) {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const m = ms[i]!
        if (!headAt(m, t)) continue
        if (img !== null && sp !== null && spriteFits(sp, m, dev)) continue
        const r = m.r * HEAD.sc
        if (pass <= 1) flamePath(ctx, m, 1.3, 1, 1)
        else if (pass === 2) flamePath(ctx, m, 1.05, 0.68, 0.72)
        else if (pass === 3) flamePath(ctx, m, 0.84, 0.42, 0.5)
        else if (pass === 4) {
          const cx = HEAD.x - m.ux * r * 0.2
          const cy = HEAD.y - m.uy * r * 0.2
          ctx.moveTo(cx + r * 0.6, cy)
          ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2)
        } else {
          const cx = HEAD.x - m.ux * r * 0.2 - r * 0.18
          const cy = HEAD.y - m.uy * r * 0.2 - r * 0.2
          ctx.moveTo(cx + r * 0.26, cy)
          ctx.arc(cx, cy, r * 0.26, 0, Math.PI * 2)
        }
      }
      if (pass === 0) {
        ctx.lineWidth = 4.4
        ctx.strokeStyle = INK
        ctx.stroke()
        continue
      }
      ctx.fillStyle = pass === 1 ? pal.out : pass === 2 ? pal.mid : pass === 3 ? pal.core : pass === 4 ? pal.rock : pal.rockHi
      ctx.fill()
    }
  }

  // 2 · Bursts: the centre ignition (0–180 ms) + each landing (110 ms).
  let bursts = 0
  for (let pass = 0; pass < 3; pass++) {
    ctx.beginPath()
    if (t < 180) {
      if (pass === 0) bursts++
      const ro = s.ringR * (0.5 + 0.7 * Math.sin((Math.PI * t) / 180))
      const k = pass === 2 ? 0.55 : 1
      starPath(ctx, 0, 0, ro * k, ro * k * 0.5, 0.2)
    }
    for (let i = 0; i < n; i++) {
      const m = ms[i]!
      if (!m.lands) continue
      const a = t - (m.launch + m.flight)
      if (a < 0 || a >= 110) continue
      if (pass === 0) bursts++
      const ro = m.r * (1.1 + 1.8 * Math.sin((Math.PI * a) / 110))
      const k = pass === 2 ? 0.55 : 1
      starPath(ctx, m.ux * m.d1, m.uy * m.d1 - m.r * 0.3, ro * k, ro * k * 0.5, m.seed)
    }
    if (pass === 0) {
      if (bursts === 0) break
      ctx.lineWidth = 4.4
      ctx.strokeStyle = INK
      ctx.stroke()
      continue
    }
    ctx.fillStyle = pass === 1 ? pal.core : HOT
    ctx.fill()
  }

  // 3 · Spark shards kicked back toward the ring from each landing.
  if (!s.low) {
    let sparks = 0
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const m = ms[i]!
        if (!m.lands) continue
        const a = t - (m.launch + m.flight)
        if (a < 0 || a >= 420) continue
        const u = a / 420
        const sb = i * RING_SPARKS * SPARK_STRIDE
        for (let j = 0; j < RING_SPARKS; j++) {
          const o = sb + j * SPARK_STRIDE
          const ang = s.sparks[o]!
          const sz = s.sparks[o + 2]! * (1 - u * u)
          if (sz <= 0.4) continue
          if (pass === 0) sparks++
          const d = (s.sparks[o + 1]! * (1 - Math.exp(-a * 0.005))) / 0.005
          const z = Math.max(0, 0.22 * a - 0.0005 * a * a)
          const ca = Math.cos(ang)
          const sa = Math.sin(ang)
          const x = m.ux * m.d1 + ca * d
          const y = m.uy * m.d1 + sa * d * GROUND - z
          const bump = pass === 0 ? 1.2 : 0
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
      ctx.fillStyle = pass === 0 ? INK : pal.mid
      ctx.fill()
    }
  }
  ctx.restore()
}

// ── Screen layer (css px) ──────────────────────────────────────────────────
/** The ignition's flat screen flash (intro, not reduced motion). */
export const drawRingScreen = (ctx: Ctx, s: RingShowerState, t: number, w: number, h: number): void => {
  if (s.kind !== 'intro' || s.still || s.count === 0 || t < 30 || t >= 150) return
  ctx.save()
  ctx.globalAlpha = 0.32 * (1 - (t - 30) / 120)
  ctx.fillStyle = FLASH
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** Camera shake in WHOLE device pixels: the ignition kick + landing taps. */
export const ringShake = (s: RingShowerState, t: number): { x: number, y: number } => {
  const out = s.shake
  out.x = 0
  out.y = 0
  if (s.still || s.kind !== 'intro' || s.count === 0 || t >= s.end) return out
  let fx = 0
  let fy = 0
  const a0 = t - 40
  if (a0 >= 0 && a0 < 260) {
    const amp = 3.4 * (1 - a0 / 260) * (1 - a0 / 260)
    fx += amp * Math.sin(a0 * 0.12)
    fy += amp * Math.cos(a0 * 0.097)
  }
  if (!s.low) {
    for (let i = 0; i < s.count; i++) {
      const m = s.meteors[i]!
      if (!m.lands) continue
      const a = t - (m.launch + m.flight)
      if (a < 0 || a >= 80) continue
      const amp = 1.2 * (1 - a / 80)
      fx += amp * Math.sin(a * 0.11 + m.seed)
      fy += amp * Math.cos(a * 0.093 + m.seed)
    }
  }
  out.x = Math.max(-5, Math.min(5, Math.round(fx)))
  out.y = Math.max(-5, Math.min(5, Math.round(fy)))
  return out
}

/** Dev / test hook (window.__ringShower in dev). */
export const installRingDevHook = (s: RingShowerState): void => {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __ringShower?: { clock: () => number, state: RingShowerState } }).__ringShower = {
    clock: () => s.clock,
    state: s
  }
}
