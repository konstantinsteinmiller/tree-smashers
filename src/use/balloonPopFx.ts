// ─── #UX3 balloon POP VFX (purely visual) ───────────────────────────────────
//
// When a smasher loses a balloon (@/use/balloonHp) it bursts Mario-Kart style:
//   · a BANG — a flat cream star with a white core and the game's dark
//     outline, PUNCHING open (overshoot to 1.3×, settle) for ~230 ms;
//   · a thin white shock RING expanding behind it;
//   · shredded rubber SCRAPS in the balloon's colour flying out, then
//     fluttering down (drag + gravity + a side-to-side flip) and fading;
//   · the STRING dropping away, knot first, swaying as it falls.
// Painted sprites (@/use/balloonArt: burst stars, torn rubber scraps per team)
// when the atlas is in and sharp enough at this device scale; the flat
// procedural shapes below are the fallback.
// Flat fills + strokes only (no blur, glow, gradient or shadowBlur). One pool
// allocated once and capped: spawns past the cap are dropped, finished
// particles are swap-removed and reused, nothing allocates per frame. Low
// render tier: the bang star only (one particle per pop). Never physics,
// never gameplayRand, never the PvP state hash.

import { balloonAtlas, balloonSprites, drawCentredSprite, pickBalloonSprite } from '@/use/balloonArt'

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export const PopKind = { Bang: 0, Ring: 1, Scrap: 2, String: 3 } as const
export type PopKind = typeof PopKind[keyof typeof PopKind]

export interface PopParticle {
  kind: PopKind
  x: number; y: number
  vx: number; vy: number
  rot: number; vr: number
  size: number
  life: number; maxLife: number
  color: string
  /** Flutter / sway phase. */
  phase: number
  /** String: length; scrap: width ratio. */
  len: number
  /** Painted variant index and team (0 player blue, 1 enemy red). */
  variant: number
  team: number
}

export interface BalloonPopFx {
  readonly pool: PopParticle[]
  /** Active particles are pool[0 .. active-1]. */
  active: number
  cap: number
}

/** Pool size (a 5-balloon knockout is 5 × POP_PARTICLES = 50). */
export const BALLOON_FX_CAP = 96
/** Scraps per pop (full tier). */
export const POP_SCRAPS = 7
/** Particles one full-tier pop spawns: bang + ring + scraps + string. */
export const POP_PARTICLES = 2 + POP_SCRAPS + 1

const INK = '#1b1530'
const BANG = '#fff1b8'
const WHITE = '#ffffff'

export const createBalloonPopFx = (cap = BALLOON_FX_CAP): BalloonPopFx => {
  const pool: PopParticle[] = []
  for (let i = 0; i < BALLOON_FX_CAP; i++) {
    pool.push({ kind: PopKind.Bang, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, size: 0, life: 0, maxLife: 1, color: WHITE, phase: 0, len: 0, variant: 0, team: 0 })
  }
  return { pool, active: 0, cap: Math.max(0, Math.min(cap, BALLOON_FX_CAP)) }
}

export const resetBalloonPopFx = (fx: BalloonPopFx): void => {
  fx.active = 0
}

const take = (fx: BalloonPopFx): PopParticle | null => (fx.active < fx.cap ? fx.pool[fx.active++]! : null)

type Rand = () => number
const defaultRand: Rand = () => Math.random() // vfx-rng

/**
 * Burst a balloon of radius `b` centred at (x, y). `color` / `lite` are its
 * fill and highlight; (kx, ky) is the knot, (ax, ay) where the string was
 * tied (its length is the distance). `low` = low render tier (bang only).
 */
export const spawnBalloonPop = (
  fx: BalloonPopFx, x: number, y: number, b: number, color: string, lite: string,
  kx: number, ky: number, ax: number, ay: number, low: boolean, isPlayer = true, rand: Rand = defaultRand
): void => {
  const team = isPlayer ? 0 : 1
  const bang = take(fx)
  if (!bang) return
  bang.kind = PopKind.Bang
  bang.x = x; bang.y = y; bang.vx = 0; bang.vy = 0
  bang.rot = rand() * Math.PI; bang.vr = 0
  bang.size = b * 1.6
  bang.maxLife = bang.life = 230
  bang.color = BANG; bang.phase = 0; bang.len = 0
  bang.variant = Math.floor(rand() * 4); bang.team = team
  if (low) return
  const ring = take(fx)
  if (!ring) return
  ring.kind = PopKind.Ring
  ring.x = x; ring.y = y; ring.vx = 0; ring.vy = 0; ring.rot = 0; ring.vr = 0
  ring.size = b * 1.05
  ring.maxLife = ring.life = 300
  ring.color = WHITE; ring.phase = 0; ring.len = 0
  ring.variant = 0; ring.team = team
  const s = b / 7
  for (let i = 0; i < POP_SCRAPS; i++) {
    const p = take(fx)
    if (!p) return
    const a = (i / POP_SCRAPS) * Math.PI * 2 + (rand() - 0.5) * 0.9
    const sp = (0.07 + rand() * 0.08) * s
    p.kind = PopKind.Scrap
    p.x = x + Math.cos(a) * b * 0.5; p.y = y + Math.sin(a) * b * 0.5
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 0.03 * s
    p.rot = a; p.vr = (rand() - 0.5) * 0.03
    p.size = b * (0.7 + rand() * 0.35)
    p.maxLife = p.life = 650 + rand() * 300
    p.color = i % 3 === 2 ? lite : color
    p.phase = rand() * Math.PI * 2
    p.len = 0.5 + rand() * 0.25
    p.variant = i; p.team = team
  }
  const str = take(fx)
  if (!str) return
  str.kind = PopKind.String
  str.x = kx; str.y = ky
  str.vx = (rand() - 0.5) * 0.02 * s; str.vy = 0.01 * s
  // Hangs from the knot: rot 0 = straight down; starts along the old tether.
  const len = Math.hypot(ax - kx, ay - ky)
  str.rot = Math.atan2(-(ax - kx), ay - ky)
  str.vr = (rand() - 0.5) * 0.004
  str.size = b
  str.len = Math.min(len, b * 5)
  str.maxLife = str.life = 560
  str.color = color; str.phase = rand() * Math.PI * 2
  str.variant = 0; str.team = team
}

const DRAG_MS = 220
const GRAVITY = 0.00045 // arena units / ms² at b = 7 (scaled per particle)

/** Advance every particle by `dt` ms; finished ones are recycled. */
export const tickBalloonPopFx = (fx: BalloonPopFx, dt: number): void => {
  const pool = fx.pool
  const drag = Math.exp(-dt / DRAG_MS)
  for (let i = fx.active - 1; i >= 0; i--) {
    const p = pool[i]!
    p.life -= dt
    if (p.life <= 0) {
      const last = --fx.active
      if (i !== last) { pool[i] = pool[last]!; pool[last] = p }
      continue
    }
    if (p.kind === PopKind.Scrap) {
      const s = p.size / 3.4
      p.vx *= drag
      p.vy = p.vy * drag + GRAVITY * s * dt
      // Terminal flutter speed: rubber shreds sail, they do not drop.
      const vt = 0.035 * s
      if (p.vy > vt) p.vy = vt
      p.phase += dt * 0.011
      p.x += (p.vx + Math.cos(p.phase) * 0.012 * s) * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt + Math.cos(p.phase) * 0.015
    } else if (p.kind === PopKind.String) {
      const s = p.size / 7
      p.vy += GRAVITY * 1.6 * s * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.phase += dt * 0.008
      // Swings back toward hanging straight down.
      p.rot += (p.vr - p.rot * 0.004) * dt
    }
  }
}

const STAR_POINTS = 8

/** Bang scale over its life t ∈ [0, 1]: punch to 1.3× in the first 22 %,
 *  settle to 1 by 45 %, then hold while it fades. */
export const bangPunch = (t: number): number => {
  if (t < 0.22) { const u = t / 0.22; return 0.35 + 0.95 * (1 - (1 - u) * (1 - u)) }
  if (t < 0.45) return 1.3 - 0.3 * ((t - 0.22) / 0.23)
  return 1
}

/** Draw every particle (caller has the arena transform). `dev` = device px
 *  per arena unit (painted sprite vs procedural, never upscaled). */
export const drawBalloonPopFx = (ctx: Ctx, fx: BalloonPopFx, dev = 1): void => {
  if (fx.active === 0) return
  const img = balloonAtlas()
  const reg = img !== null ? balloonSprites() : null
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (let i = 0; i < fx.active; i++) {
    const p = fx.pool[i]!
    const k = p.life / p.maxLife // 1 → 0
    const t = 1 - k
    if (p.kind === PopKind.Bang) {
      // Punch open with an overshoot, settle, fade in the last half.
      const R = p.size * 0.95 * bangPunch(t)
      ctx.globalAlpha = Math.min(1, k * 2)
      if (reg !== null && img !== null) {
        const sp = pickBalloonSprite(reg.burst, p.variant)
        if (sp !== null) {
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot * 0.25 + t * 0.6)
          const ok = drawCentredSprite(ctx, img, sp, R * 2, dev)
          ctx.restore()
          if (ok) continue
        }
      }
      starPath(ctx, p.x, p.y, R, R * 0.5, p.rot)
      ctx.fillStyle = p.color
      ctx.fill()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.4
      ctx.stroke()
      starPath(ctx, p.x, p.y, R * 0.55, R * 0.3, p.rot + Math.PI / STAR_POINTS)
      ctx.fillStyle = WHITE
      ctx.fill()
      continue
    }
    if (p.kind === PopKind.Ring) {
      // Ink rim under a white band, so it reads on light floors too.
      const rr = p.size * (0.8 + 1.1 * t)
      const lw = 0.8 + 2.6 * k
      ctx.globalAlpha = k
      ctx.beginPath()
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2)
      ctx.strokeStyle = INK
      ctx.lineWidth = lw + 1.6
      ctx.stroke()
      ctx.strokeStyle = WHITE
      ctx.lineWidth = lw
      ctx.stroke()
      continue
    }
    if (p.kind === PopKind.String) {
      ctx.globalAlpha = Math.min(1, k * 2.5)
      const c = Math.cos(p.rot), sn = Math.sin(p.rot)
      const L = p.len * (0.75 + 0.25 * k) // goes slack as it falls
      const ex = p.x - sn * L
      const ey = p.y + c * L
      const w = Math.sin(p.phase) * p.size * 0.5
      ctx.strokeStyle = INK
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.quadraticCurveTo((p.x + ex) / 2 + c * w, (p.y + ey) / 2 + sn * w, ex, ey)
      ctx.stroke()
      // The knot, still in the balloon's colour.
      const kn = p.size * 0.2
      ctx.fillStyle = p.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x - kn, p.y - kn * 0.9)
      ctx.lineTo(p.x + kn, p.y - kn * 0.9)
      ctx.lineTo(p.x, p.y + kn * 0.4)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      continue
    }
    // Scrap: a torn rubber shred flipping as it flutters down.
    ctx.globalAlpha = Math.min(1, k * 3)
    const L = p.size * (0.55 + 0.45 * Math.min(1, k * 1.5))
    const W = L * p.len * (0.5 + 0.5 * Math.abs(Math.cos(p.phase)))
    const c = Math.cos(p.rot), sn = Math.sin(p.rot)
    ctx.save()
    ctx.transform(c, sn, -sn, c, p.x, p.y)
    if (reg !== null && img !== null) {
      const sp = pickBalloonSprite(p.team === 0 ? reg.scrapBlue : reg.scrapRed, p.variant)
      if (sp !== null && drawCentredSprite(ctx, img, sp, L, dev, 0.35 + 0.65 * Math.abs(Math.cos(p.phase)))) {
        ctx.restore()
        continue
      }
    }
    ctx.fillStyle = p.color
    ctx.strokeStyle = INK
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(-L * 0.5, -W * 0.45)
    ctx.lineTo(-L * 0.1, -W * 0.2)
    ctx.lineTo(L * 0.5, -W * 0.5)
    ctx.lineTo(L * 0.3, W * 0.1)
    ctx.lineTo(L * 0.45, W * 0.5)
    ctx.lineTo(-L * 0.4, W * 0.4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

const starPath = (ctx: Ctx, x: number, y: number, R: number, r: number, rot: number): void => {
  ctx.beginPath()
  for (let i = 0; i < STAR_POINTS * 2; i++) {
    const a = rot + (i * Math.PI) / STAR_POINTS
    const rr = i % 2 === 0 ? R : r
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}
