/**
 * Arena-border contact effects.
 *
 *   · LAVA border   → a painted 12-frame flame-burn strip that follows the
 *                     spinner for ~1 s (public/images/vfx/flame-burn_*.webp).
 *   · FOREST border → a small procedural heal pulse: an expanding green ring
 *                     plus a few rising "+" glyphs.
 *
 * Pure state + draw helpers with no side-effecting imports, so the trigger /
 * throttle / cap rules are unit-testable (tests/borderFx.test.ts) without
 * pulling in the whole arena composable.
 *
 * Performance contract (see PERF-LEDGER.md — this game is raster-bound):
 *   · Fixed pools allocated once; a trigger reuses a slot, never allocates.
 *   · No gradients, no shadowBlur, no per-frame string building: every style
 *     below is a module constant, and the heal pulse is one stroked arc and
 *     a handful of fillRects.
 *   · Callers pass a live cap so the low quality tier (FX.low) gets fewer
 *     concurrent instances, and pass `rekindle=false` on low so a burn is one
 *     pass per contact instead of being held alight.
 *   · Time is the pool's own clock, advanced by the physics tick, so a paused
 *     game freezes the effects with everything else.
 */

/** The slice of a blade these effects read. `SpinnerState` satisfies it. */
export interface BorderFxBlade {
  id: number
  x: number
  y: number
  radius: number
  hp: number
}

// ─── Flame burn ────────────────────────────────────────────────────────────

export const FLAME_BURN_SRC = 'images/vfx/flame-burn_1536x128.webp'
export const FLAME_FRAMES = 12
/** 12 x 80 ms = 0.96 s for one full pass. */
export const FLAME_FRAME_MS = 80
/**
 * First frame of the lick/flicker stretch (frames 5-7). A new lava contact
 * while a burn is already playing jumps back here instead of restarting from
 * the ignite frames, so repeated bounces hold the fire alight (the minimum
 * visible time is always one full pass) and never stutter back to a spark.
 */
export const FLAME_REKINDLE_FRAME = 5
/**
 * Registration of the painted cell, shared with art/flame-burn/flame-frames.js:
 * the spinner's centre sits at (ANCHOR_X, ANCHOR_Y) of the cell and its
 * radius is DISK_R of the cell side. The art keeps that disk empty, so the
 * flames ring the rim and the HP digit in the middle stays readable.
 */
export const FLAME_ANCHOR_X = 0.5
export const FLAME_ANCHOR_Y = 0.6
export const FLAME_DISK_R = 0.28

export interface BurnSlot {
  active: boolean
  blade: BorderFxBlade | null
  frame: number
  timer: number
}

// ─── Heal pulse ────────────────────────────────────────────────────────────

export const HEAL_LIFE_MS = 720
/** Per-spinner throttle: a heal inside this window of the last one is ignored. */
export const HEAL_RETRIGGER_MS = 400

export interface HealSlot {
  active: boolean
  blade: BorderFxBlade | null
  t: number
}

// ─── Pool ──────────────────────────────────────────────────────────────────

/** Hard upper bound of each pool. Live caps passed to the triggers are <= this. */
export const BORDER_FX_POOL_SIZE = 6

export interface BorderFxState {
  burns: BurnSlot[]
  heals: HealSlot[]
}

export const createBorderFx = (size = BORDER_FX_POOL_SIZE): BorderFxState => {
  const burns: BurnSlot[] = []
  const heals: HealSlot[] = []
  for (let i = 0; i < size; i++) {
    burns.push({ active: false, blade: null, frame: 0, timer: 0 })
    heals.push({ active: false, blade: null, t: 0 })
  }
  return { burns, heals }
}

export const resetBorderFx = (s: BorderFxState): void => {
  for (const b of s.burns) {
    b.active = false
    b.blade = null
  }
  for (const h of s.heals) {
    h.active = false
    h.blade = null
  }
}

/**
 * A spinner touched a lava border. Returns the slot now burning on it, or
 * null when the cap is reached.
 *  - Already burning: never restarts. With `rekindle` a burn that has passed
 *    its peak jumps back to the flicker frames (held alight); without it the
 *    contact is ignored until the pass ends.
 *  - Not burning: takes a free slot (frame 0) unless `cap` burns are live.
 */
export const triggerBurn = (
  s: BorderFxState,
  blade: BorderFxBlade,
  cap: number,
  rekindle: boolean
): BurnSlot | null => {
  let live = 0
  let free: BurnSlot | null = null
  for (const slot of s.burns) {
    if (slot.active) {
      if (slot.blade!.id === blade.id) {
        if (rekindle && slot.frame > FLAME_REKINDLE_FRAME) {
          slot.frame = FLAME_REKINDLE_FRAME
          slot.timer = 0
        }
        slot.blade = blade
        return slot
      }
      live++
    } else if (!free) {
      free = slot
    }
  }
  if (!free || live >= cap) return null
  free.active = true
  free.blade = blade
  free.frame = 0
  free.timer = 0
  return free
}

/**
 * A spinner was healed by a forest border. Per-spinner throttle: a pulse
 * already playing on this spinner restarts only once it is older than
 * HEAL_RETRIGGER_MS. Capped like the burns.
 */
export const triggerHeal = (
  s: BorderFxState,
  blade: BorderFxBlade,
  cap: number
): HealSlot | null => {
  let live = 0
  let free: HealSlot | null = null
  for (const slot of s.heals) {
    if (slot.active) {
      if (slot.blade!.id === blade.id) {
        if (slot.t < HEAL_RETRIGGER_MS) return null
        slot.t = 0
        slot.blade = blade
        return slot
      }
      live++
    } else if (!free) {
      free = slot
    }
  }
  if (!free || live >= cap) return null
  free.active = true
  free.blade = blade
  free.t = 0
  return free
}

/** Advance every live effect by `dt` ms; retire finished ones and any whose
 *  spinner died (the death explosion takes over there). */
export const tickBorderFx = (s: BorderFxState, dt: number): void => {
  for (const slot of s.burns) {
    if (!slot.active) continue
    if (slot.blade!.hp <= 0) {
      slot.active = false
      slot.blade = null
      continue
    }
    slot.timer += dt
    while (slot.timer >= FLAME_FRAME_MS) {
      slot.timer -= FLAME_FRAME_MS
      slot.frame++
    }
    if (slot.frame >= FLAME_FRAMES) {
      slot.active = false
      slot.blade = null
    }
  }
  for (const slot of s.heals) {
    if (!slot.active) continue
    slot.t += dt
    if (slot.t >= HEAL_LIFE_MS || slot.blade!.hp <= 0) {
      slot.active = false
      slot.blade = null
    }
  }
}

export const countActiveBurns = (s: BorderFxState): number => {
  let n = 0
  for (const b of s.burns) if (b.active) n++
  return n
}

export const countActiveHeals = (s: BorderFxState): number => {
  let n = 0
  for (const h of s.heals) if (h.active) n++
  return n
}

// ─── Drawing ───────────────────────────────────────────────────────────────

/**
 * One drawImage per live burn, centred on the spinner's CURRENT position so
 * the fire follows it. Frame size is read off the image (strip width / 12),
 * so a re-painted strip at another cell size needs no code change beyond
 * FLAME_BURN_SRC.
 */
export const renderBurns = (
  ctx: CanvasRenderingContext2D,
  s: BorderFxState,
  img: HTMLImageElement | null
): void => {
  if (!img || !img.complete || img.naturalWidth === 0) return
  const fw = img.naturalWidth / FLAME_FRAMES
  const fh = img.naturalHeight
  for (const slot of s.burns) {
    if (!slot.active) continue
    const b = slot.blade!
    const side = b.radius / FLAME_DISK_R
    const h = side * (fh / fw)
    ctx.drawImage(
      img,
      slot.frame * fw, 0, fw, fh,
      b.x - side * FLAME_ANCHOR_X, b.y - h * FLAME_ANCHOR_Y, side, h
    )
  }
}

const HEAL_RING = '#6dff8f'
const HEAL_RING_SOFT = '#2fd35c'
const HEAL_PLUS = '#c9ffd4'
const HEAL_PLUS_INK = '#0b5a22'

/** Rising "+" glyphs: x offset, start y (fractions of the blade radius, y up
 *  is negative), delay (ms), arm length (fraction of radius). The first two
 *  are the ones kept on the low tier. */
const HEAL_GLYPHS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.5, 0.1, 0, 0.3],
  [0.45, -0.05, 110, 0.27],
  [-0.05, -0.3, 200, 0.34],
  [0.2, 0.3, 290, 0.22]
]
const HEAL_GLYPH_LIFE_MS = 430
const HEAL_GLYPH_RISE = 1.15

const easeOut = (u: number): number => 1 - (1 - u) * (1 - u)

const drawPlus = (ctx: CanvasRenderingContext2D, x: number, y: number, arm: number, pad: number) => {
  const th = arm * 0.42 + pad * 2
  const len = arm * 2 + pad * 2
  ctx.fillRect(x - len / 2, y - th / 2, len, th)
  ctx.fillRect(x - th / 2, y - len / 2, th, len)
}

/**
 * Heal pulse: an expanding ring out from the rim (a wide soft stroke under a
 * thin bright one on high, the thin one alone on low) and 4 rising plus
 * glyphs (2 on low, without the dark outline pass). Flat colours only; the
 * fade is globalAlpha.
 */
export const renderHeals = (
  ctx: CanvasRenderingContext2D,
  s: BorderFxState,
  low: boolean
): void => {
  let any = false
  for (const slot of s.heals) {
    if (!slot.active) continue
    any = true
    const b = slot.blade!
    const u = Math.min(1, slot.t / HEAL_LIFE_MS)
    const e = easeOut(u)
    const r = b.radius * (1.0 + 0.6 * e)
    const fade = (1 - u) * (1 - u)
    ctx.beginPath()
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2)
    if (!low) {
      ctx.globalAlpha = 0.35 * fade
      ctx.strokeStyle = HEAL_RING_SOFT
      ctx.lineWidth = b.radius * 0.34 * (1 - 0.6 * u)
      ctx.stroke()
    }
    ctx.globalAlpha = 0.9 * fade
    ctx.strokeStyle = HEAL_RING
    ctx.lineWidth = Math.max(1, b.radius * 0.1 * (1 - 0.7 * u))
    ctx.stroke()
  }
  if (!any) return

  // Glyphs in two passes (ink, then fill) so the fillStyle changes twice per
  // frame, not twice per glyph.
  const glyphs = low ? 2 : HEAL_GLYPHS.length
  const passes = low ? 1 : 2
  for (let pass = 0; pass < passes; pass++) {
    const ink = passes === 2 && pass === 0
    ctx.fillStyle = ink ? HEAL_PLUS_INK : HEAL_PLUS
    for (const slot of s.heals) {
      if (!slot.active) continue
      const b = slot.blade!
      const R = b.radius
      for (let g = 0; g < glyphs; g++) {
        const spec = HEAL_GLYPHS[g]!
        const v = (slot.t - spec[2]) / HEAL_GLYPH_LIFE_MS
        if (v <= 0 || v >= 1) continue
        // Pop in (overshoot to 1.25x), settle, then fade over the last 40%.
        const pop = v < 0.18 ? (v / 0.18) * 1.25 : v < 0.3 ? 1.25 - ((v - 0.18) / 0.12) * 0.25 : 1
        ctx.globalAlpha = v > 0.6 ? (1 - v) / 0.4 : 1
        const x = b.x + R * spec[0] * (1 + 0.25 * v)
        const y = b.y + R * (spec[1] - HEAL_GLYPH_RISE * easeOut(v))
        drawPlus(ctx, x, y, R * spec[3] * pop, ink ? Math.max(1, R * 0.06) : 0)
      }
    }
  }
  ctx.globalAlpha = 1
}
