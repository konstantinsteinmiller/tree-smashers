// ─── #UX3 balloon HP (smashers only; VITE_APP_BALOON_HP_BAR) ────────────────
//
// Instead of the HP bar, a smasher carries a small row of party balloons —
// Mario Kart battle-mode style — tethered by short strings to the FAR (top)
// side of its disc's outer rim, fanned out above and beside the plush:
//
//   · COUNT — one balloon per share of max HP, by how many smashers the side
//     fields (bigger discs carry more): solo 5, duo 4, trio 3; a boss 5; a
//     spawned mini (split shard, emitted minion) 2. Fixed per blade for the
//     whole match, so a share never changes size mid-fight.
//   · FILL — hp / maxHp × count "balloon units". Whole units are full
//     balloons; the fractional one is the partly-lost balloon, visibly
//     DEFLATED (shrunk, squashed, a crease, drooping on its string), so HP
//     between two balloons still reads. Any hp > 0 keeps at least a small
//     last balloon; hp ≤ 0 is the knockout.
//   · POP — a balloon is lost the moment the fill drops below its unit: it
//     bursts (@/use/balloonPopFx: bang star, ring, rubber scraps, the string
//     dropping) and the caller plays the `balloon-pop` SFX. Every lost
//     balloon pops exactly once; the last one IS the knockout moment.
//     Balloons go from the OUTSIDE in (right end first, then left), so the
//     survivors stay centred over the plush.
//   · HEAL — a heal that crosses back over a unit regrows that balloon with a
//     small overshoot pop-in.
//   · Life — every balloon bobs on its own phase, the fan leans away from the
//     disc's travel, and any hit gives the bunch a short jiggle.
//   · The HP number stays as a small team pill on the disc's FRONT rim
//     (@/use/hpGauge drawHpBadge), drawn after the plush: the balloons are the
//     at-a-glance read, the number the exact one.
//
// Art: painted balloons (blue / red, full + partly deflated; @/use/balloonArt,
// tools/balloon-sheets/pack.mjs) once the atlas is in and sharp enough at the
// device scale; the flat procedural balloon below is the fallback (before
// load, ?art=procedural, never upscaled). Strings are always drawn here.
// After a pop the neighbours recoil (shoved away + a quick squash).
//
// The balloons are drawn BEFORE the plush (they hang behind it, like the far
// rim they are tied to), so they can never cover the face; the number sits
// on the front rim below it. Flat fills + the game's dark outline only — no
// blur, glow or gradient. No per-frame allocation (state per blade, created
// once; constant colours). Purely visual: reads hp, never writes game state.

import { DISC_SQUASH, DISC_THICKNESS } from '@/smashers/smasherRig'
import { drawHpBadge } from '@/use/hpGauge'
import { spawnBalloonPop, type BalloonPopFx } from '@/use/balloonPopFx'
import { balloonAtlas, balloonSprites, drawUprightSprite, pickBalloonSprite } from '@/use/balloonArt'

export const BALLOON_HP = {
  /** Balloons per side size (index = team size − 1): solo, duo, trio. */
  COUNT_BY_TEAM: [5, 4, 3] as readonly number[],
  BOSS_COUNT: 5,
  /** Spawned minis (split shards, emitted minions). */
  MINOR_COUNT: 2,
  MAX_COUNT: 5,
  /** Balloon half-width × disc radius (floor BALLOON_MIN in arena units). */
  SIZE: 0.34,
  MIN: 5.5,
  /** Height over width. */
  ASPECT: 1.18,
  /** Fan pivot above the disc centre, and pivot → balloon centre (× radius). */
  PIVOT: 0.6,
  REACH: 1.72,
  /** Smallest scale of the partly-lost balloon (near-empty share). */
  MIN_FILL_SCALE: 0.42,
  /** Hit jiggle and heal pop-in durations. */
  JIGGLE_MS: 320,
  GROW_MS: 260,
  /** Max lean of the fan away from the travel direction (rad). */
  LEAN_MAX: 0.32,
  OUTLINE: 1.5,
  /** Gap between the disc's front rim and the HP pill's centre (arena units). */
  BADGE_DROP: 3.5,
  /** Neighbour recoil after a pop: duration, push (× radius), squash. */
  RECOIL_MS: 220,
  RECOIL_PUSH: 0.16,
  RECOIL_SQUASH: 0.22,
  /** Minimum gap between two balloon-pop sounds (multi-pops play once). */
  POP_SFX_COOLDOWN_MS: 90,
  /** In-game gain of the pop (the file is levelled to -17.8 LUFS-M; this
   *  lifts it to sit with a clash at 0.025). */
  POP_SFX_GAIN: 0.032
} as const

/** Fan half-angle by balloon count (rad): wider bunches fan further out. */
const FAN_HALF = [0, 0, 0.36, 0.72, 0.9, 1.04] as const

// ── Palette (flat) ───────────────────────────────────────────────────────────
const INK = '#1b1530'
interface BalloonPal { fill: readonly [string, string]; lite: string; crease: string }
const TEAM: readonly [BalloonPal, BalloonPal] = [
  { fill: ['#2f8cff', '#4aa0ff'], lite: '#bfe2ff', crease: '#1d5fd0' }, // player
  { fill: ['#f0413f', '#ff5a4e'], lite: '#ffc2b8', crease: '#b8232f' } // enemy
]

/** Balloon count for a blade. `teamSize` = how many the side fields (1 … 3). */
export const balloonCount = (teamSize: number, boss = false, minor = false): number => {
  if (boss) return BALLOON_HP.BOSS_COUNT
  if (minor) return BALLOON_HP.MINOR_COUNT
  const i = Math.max(1, Math.min(3, Math.floor(teamSize) || 1)) - 1
  return BALLOON_HP.COUNT_BY_TEAM[i]!
}

/** Balloons still up for `hp` of `maxHp` over `n`: any hp > 0 keeps one. */
export const balloonsAlive = (hp: number, maxHp: number, n: number): number => {
  if (!(hp > 0) || !(maxHp > 0)) return 0
  const f = Math.min(1, hp / maxHp) * n
  return Math.max(1, Math.min(n, Math.ceil(f - 1e-6)))
}

/** Fill (0 … 1] of the outermost living balloon — 1 when it is whole. */
export const partialFill = (hp: number, maxHp: number, n: number): number => {
  const a = balloonsAlive(hp, maxHp, n)
  if (a === 0) return 0
  const f = Math.min(1, hp / maxHp) * n
  return Math.max(0, Math.min(1, f - (a - 1)))
}

/**
 * Fan slot (0 = leftmost … n − 1 = rightmost) of the balloon with pop RANK
 * `rank` (0 = the last to go). Outside in: the right end pops first, then the
 * left end, so the survivors stay centred. Pure; no allocation.
 */
export const slotOfRank = (n: number, rank: number): number => {
  // Ranks ascending by distance from the centre; on a tie the LEFT one lives longer.
  const c = (n - 1) / 2
  // rank → (distance step d, side): centre (odd n) first, then pairs.
  if (n % 2 === 1) {
    if (rank === 0) return c
    const d = Math.ceil(rank / 2)
    return rank % 2 === 1 ? c - d : c + d
  }
  const d = Math.floor(rank / 2)
  return rank % 2 === 0 ? c - 0.5 - d : c + 0.5 + d
}

export interface BalloonState {
  /** Balloon count (fixed for the blade's life). */
  readonly n: number
  /** Balloons up after the last step. */
  alive: number
  /** Displayed fill of the partial balloon (eases toward the real one). */
  shown: number
  hitAt: number
  lastHp: number
  lastT: number
  lean: number
  /** Heal pop-in start per rank (−1e9 = none). */
  readonly growAt: number[]
  /** Render frame this state was last stepped in (sweep of removed blades). */
  seen: number
  isPlayer: boolean
  /** Last pop (time, fan slot) — the neighbours recoil from it. */
  popAt: number
  popSlot: number
  /** Last drawn disc centre / radius (knockout bursts after the blade is gone). */
  x: number; y: number; r: number
}

export const newBalloonState = (n: number, hp: number, maxHp: number, isPlayer: boolean): BalloonState => {
  const growAt: number[] = []
  for (let i = 0; i < BALLOON_HP.MAX_COUNT; i++) growAt.push(-1e9)
  const alive = balloonsAlive(hp, maxHp, n)
  return {
    n, alive, shown: partialFill(hp, maxHp, n), hitAt: -1e9, lastHp: hp, lastT: -1, lean: 0,
    growAt, seen: -1, isPlayer, popAt: -1e9, popSlot: 0, x: 0, y: 0, r: 0
  }
}

/** Result of one step (module scratch — read it before the next step). */
export interface BalloonStep { popped: number; grown: number; from: number; to: number }
const STEP: BalloonStep = { popped: 0, grown: 0, from: 0, to: 0 }

/**
 * Advance the state to `hp` at `now` (ms): count the balloons lost (each
 * exactly once) or regrown since the last step. `from`/`to` are the alive
 * counts before / after — popped ranks are to … from − 1. Returns module
 * scratch (no allocation).
 */
export const stepBalloons = (s: BalloonState, hp: number, maxHp: number, now: number): BalloonStep => {
  const alive = balloonsAlive(hp, maxHp, s.n)
  STEP.from = s.alive
  STEP.to = alive
  STEP.popped = alive < s.alive ? s.alive - alive : 0
  STEP.grown = alive > s.alive ? alive - s.alive : 0
  for (let k = s.alive; k < alive; k++) s.growAt[k] = now
  if (hp < s.lastHp - 1e-6) s.hitAt = now
  s.lastHp = hp
  s.alive = alive
  const dt = s.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, (now - s.lastT) / 1000))
  s.lastT = now
  const target = partialFill(hp, maxHp, s.n)
  // A pop or regrow re-bases the partial balloon; otherwise ease quickly.
  if (STEP.popped > 0 || STEP.grown > 0 || dt === 0) s.shown = target
  else s.shown += (target - s.shown) * Math.min(1, dt * 14)
  return STEP
}

/** Balloon geometry scratch (module-level, no allocation). */
const G = { bx: 0, by: 0, w: 0, h: 0, ax: 0, ay: 0, kx: 0, ky: 0, cx: 0, cy: 0, squash: 0 }

/** Half-width of a full balloon on a disc of `radius`. */
export const balloonSize = (radius: number): number => Math.max(BALLOON_HP.MIN, radius * BALLOON_HP.SIZE)

/**
 * Geometry of the balloon in fan `slot` (scale `sc`) into G: centre (bx, by),
 * half-size (w, h), rim anchor (ax, ay), knot (kx, ky), string control (cx, cy).
 */
const place = (s: BalloonState, slot: number, rank: number, x: number, y: number, r: number, sc: number, now: number): void => {
  const n = s.n
  const half = FAN_HALF[Math.min(n, FAN_HALF.length - 1)]!
  const u = n > 1 ? (slot / (n - 1)) * 2 - 1 : 0 // −1 … 1
  const phi = u * half + s.lean
  const sq = DISC_SQUASH
  // Tied on the far rim, on the side of the disc's top face.
  const th = -Math.PI / 2 + u * half * 0.8
  G.ax = x + Math.cos(th) * r * 0.9
  G.ay = y + Math.sin(th) * r * sq * 0.9
  const b = balloonSize(r)
  G.w = b * sc * (0.9 + 0.1 * sc)
  G.h = b * BALLOON_HP.ASPECT * sc
  // Bob on its own phase; deflated ones droop on a slack string.
  const bob = Math.sin(now * 0.0031 + rank * 1.9) * r * 0.05
  const sway = Math.sin(now * 0.0019 + rank * 2.7) * r * 0.035
  let jig = 0
  const since = now - s.hitAt
  if (since >= 0 && since < BALLOON_HP.JIGGLE_MS) jig = Math.sin(since * 0.055 + rank * 1.3) * r * 0.1 * (1 - since / BALLOON_HP.JIGGLE_MS)
  // Recoil: the survivors next to a pop get shoved away from it and squash
  // for a beat (nearest most), then spring back.
  G.squash = 0
  const ps = now - s.popAt
  if (ps >= 0 && ps < BALLOON_HP.RECOIL_MS && slot !== s.popSlot) {
    const d = slot - s.popSlot
    const k = 1 - ps / BALLOON_HP.RECOIL_MS
    const q = (k * k) / Math.abs(d)
    jig += Math.sign(d) * r * BALLOON_HP.RECOIL_PUSH * q
    G.squash = q
  }
  const reach = r * BALLOON_HP.REACH
  G.bx = x + Math.sin(phi) * reach + sway + jig
  G.by = y - r * BALLOON_HP.PIVOT - Math.cos(phi) * reach + bob + (1 - sc) * b * 1.1
  G.kx = G.bx
  G.ky = G.by + G.h
  const wig = Math.sin(now * 0.004 + rank * 2.1) * r * 0.08
  G.cx = (G.ax + G.kx) / 2 + wig
  G.cy = (G.ay + G.ky) / 2
}

/** easeOutBack 0 → 1 with a small overshoot (heal pop-in). */
const popIn = (t: number): number => {
  const c1 = 1.9
  const u = t - 1
  return 1 + (c1 + 1) * u * u * u + c1 * u * u
}

/** Per-balloon scale for rank `rank`: pop-in, partial deflate, 1. */
const scaleOf = (s: BalloonState, rank: number, now: number): number => {
  let sc = 1
  if (rank === s.alive - 1 && s.shown < 1) sc = BALLOON_HP.MIN_FILL_SCALE + (1 - BALLOON_HP.MIN_FILL_SCALE) * Math.max(0, s.shown)
  const g = now - s.growAt[rank]!
  if (g >= 0 && g < BALLOON_HP.GROW_MS) sc *= Math.max(0.05, popIn(g / BALLOON_HP.GROW_MS))
  return sc
}

/**
 * Step the balloons to `hp` and burst every one lost since the last call into
 * `fx` (at its last position). Draws nothing — call it for a knocked-out
 * blade too (hp ≤ 0 → the rest pop). Returns how many balloons popped.
 */
export const updateBalloonHp = (
  fx: BalloonPopFx | null, s: BalloonState, x: number, y: number, r: number,
  hp: number, maxHp: number, now: number, low: boolean
): number => {
  // The outermost balloon may have been partly deflated: burst it at the size
  // it was drawn at.
  const prevShown = s.shown
  const st = stepBalloons(s, hp, maxHp, now)
  const popped = st.popped
  if (popped > 0 && fx !== null) {
    const pal = TEAM[s.isPlayer ? 0 : 1]
    for (let rank = st.to; rank < st.from; rank++) {
      const slot = slotOfRank(s.n, rank)
      const sc = rank === st.from - 1 && prevShown < 1
        ? BALLOON_HP.MIN_FILL_SCALE + (1 - BALLOON_HP.MIN_FILL_SCALE) * Math.max(0, prevShown)
        : 1
      place(s, slot, rank, x, y, r, sc, now)
      spawnBalloonPop(fx, G.bx, G.by, G.w, pal.fill[slot % 2]!, pal.lite, G.kx, G.ky, G.ax, G.ay, low, s.isPlayer)
    }
  }
  if (popped > 0) {
    // The innermost one popped last: its neighbours recoil from it.
    s.popAt = now
    s.popSlot = slotOfRank(s.n, st.to)
  }
  s.x = x; s.y = y; s.r = r
  return popped
}

/**
 * Draw the living balloons of a smasher whose disc is centred at (x, y) with
 * `radius` — BEFORE the plush (they hang behind it). `vx` (arena units per
 * frame) leans the fan away from the travel; `dev` is device px per arena
 * unit (picks painted sprite vs procedural). Steps the state and bursts lost
 * balloons into `fx`; returns how many popped this call.
 */
export const drawBalloonHp = (
  ctx: CanvasRenderingContext2D, fx: BalloonPopFx | null, s: BalloonState,
  x: number, y: number, radius: number, hp: number, maxHp: number,
  vx: number, now: number, low: boolean, dev = 1
): number => {
  const dt = s.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, (now - s.lastT) / 1000))
  const target = Math.max(-BALLOON_HP.LEAN_MAX, Math.min(BALLOON_HP.LEAN_MAX, -vx * 0.035))
  s.lean += (target - s.lean) * Math.min(1, dt * 5)
  const popped = updateBalloonHp(fx, s, x, y, radius, hp, maxHp, now, low)
  if (s.alive === 0) return popped
  const pal = TEAM[s.isPlayer ? 0 : 1]
  const img = balloonAtlas()
  const reg = img !== null ? balloonSprites() : null
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // Strings first, one path (all ink), so the bodies sit on top of them.
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.05
  ctx.beginPath()
  for (let rank = 0; rank < s.alive; rank++) {
    place(s, slotOfRank(s.n, rank), rank, x, y, radius, scaleOf(s, rank, now), now)
    ctx.moveTo(G.ax, G.ay)
    ctx.quadraticCurveTo(G.cx, G.cy, G.kx, G.ky)
  }
  ctx.stroke()
  for (let rank = 0; rank < s.alive; rank++) {
    const slot = slotOfRank(s.n, rank)
    const sc = scaleOf(s, rank, now)
    place(s, slot, rank, x, y, radius, sc, now)
    const sqz = G.squash * BALLOON_HP.RECOIL_SQUASH
    const w = G.w * (1 + sqz)
    const h = G.h * (1 - sqz * 0.7)
    const bx = G.bx
    const by = G.by + (G.h - h)
    const deflated = sc < 0.8 && rank === s.alive - 1
    // Painted sprite (knot included) when the atlas is in and sharp enough.
    if (reg !== null && img !== null) {
      const list = deflated
        ? (s.isPlayer ? reg.blueLow : reg.redLow)
        : (s.isPlayer ? reg.blue : reg.red)
      const sp = pickBalloonSprite(list, slot)
      // Body + knot: 2h tall plus the knot (~12 % more), bottom at the knot tip.
      if (sp !== null && drawUprightSprite(ctx, img, sp, bx, by + h * 1.24, h * 2.24, dev, (1 + sqz) / (1 - sqz * 0.7))) continue
    }
    // Knot (a small tucked triangle), then the body over it.
    ctx.fillStyle = pal.fill[slot % 2]!
    ctx.strokeStyle = INK
    ctx.lineWidth = BALLOON_HP.OUTLINE * 0.8
    ctx.beginPath()
    ctx.moveTo(bx - w * 0.2, by + h + w * 0.22)
    ctx.lineTo(bx + w * 0.2, by + h + w * 0.22)
    ctx.lineTo(bx, by + h - w * 0.12)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // Body: a balloon teardrop — round top, narrower bottom.
    ctx.lineWidth = BALLOON_HP.OUTLINE
    ctx.beginPath()
    ctx.moveTo(bx, by - h)
    ctx.bezierCurveTo(bx + w * 1.32, by - h, bx + w * 1.12, by + h * 0.55, bx, by + h)
    ctx.bezierCurveTo(bx - w * 1.12, by + h * 0.55, bx - w * 1.32, by - h, bx, by - h)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // Flat highlight: a tilted lozenge on the upper left + a small dot.
    ctx.fillStyle = pal.lite
    ctx.beginPath()
    ctx.ellipse(bx - w * 0.42, by - h * 0.32, w * 0.2, h * 0.34, 0.45, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(bx - w * 0.12, by - h * 0.72, w * 0.1, 0, Math.PI * 2)
    ctx.fill()
    // Deflated: a crease across the lower half.
    if (deflated) {
      ctx.strokeStyle = pal.crease
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(bx - w * 0.5, by + h * 0.25)
      ctx.quadraticCurveTo(bx, by + h * 0.05, bx + w * 0.45, by + h * 0.38)
      ctx.stroke()
    }
  }
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  return popped
}

/** The exact HP as a small team pill on the disc's FRONT rim (after the plush). */
export const drawBalloonHpNumber = (
  ctx: CanvasRenderingContext2D, s: BalloonState, x: number, y: number, radius: number, hp: number, now: number
): void => {
  if (hp <= 0) return
  const side = radius * DISC_THICKNESS * Math.sqrt(1 - DISC_SQUASH * DISC_SQUASH)
  const since = now - s.hitAt
  const flashing = since >= 0 && since < 130
  drawHpBadge(ctx, x, y + side + radius * DISC_SQUASH + BALLOON_HP.BADGE_DROP, hp, s.isPlayer, flashing, 0.9)
}
