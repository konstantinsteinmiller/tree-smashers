// Skill VFX — canvas layer for the skill system (skills-feature.md §8.2/§8.3).
//
// The engine (useSpinnerGame.ts) calls every function below at a fixed call
// site; this module owns the pooled drawing code and the skill SFX triggers.
//
// Contract:
//   • Pure canvas + plain objects. Never imports the engine, never writes
//     gameplay state (hp, velocity, skills.*), never draws from matchRng or a
//     blade's skill stream — VFX randomness is Math.random or none.
//   • Zero per-frame allocation: fixed pools created once in createSkillVfx(),
//     reused; indexed loops only; no closures / arrays / strings built inside
//     the render or tick calls. Colours are module constants.
//   • No shadowBlur, no ctx.filter, no gradients or patterns — flat strokes
//     and fills; fades are globalAlpha.
//   • Batched: one path per colour per effect family, so the WHOLE skill
//     layer is ≤ 12 draw primitives in the worst case (+ 1 shield arc per
//     shielded blade from call site 1) — see SKILL_LAYER_MAX_PRIMITIVES.
//   • FX.low (§8.3 fallback column): shield arc kept (no break shards), phase
//     alpha kept (no ghost outline), no Second Wind / Mirror / Momentum
//     rings, rocket heads only (no tails, no impact bursts), stun glyph fill
//     only (no outline). Audio is identical on both tiers.
//   • Every render call leaves the context state as it found it.
//
// Call sites in useSpinnerGame.ts:
//   1. renderBladeSkillFx — inside renderBlade, after the health ring, once
//      per living blade that carries skills (Guard Shell arc).
//      skillBladeAlpha   — renderBlade's alpha factor (Phase Step flicker).
//   2. renderSkillLayer   — in render(), after the blade loop and the border
//      FX: rings, shards, rockets + impact bursts, stun glyphs.
//   3. drawSkillGlyph     — in renderDamageNumbers, for a popup with `glyph`.
//   plus skillVfxEvent (every skill event, as it happens), tickSkillVfx (once
//   per physics tick, dt = 16) and resetSkillVfx (initGame / clearBattleVfx).

import type { SkillId } from '@/types/skills'
import { SKILLS } from '@/data/skillCatalog'
import { playSkillSfx } from '@/use/skills/skillSfx'

/** Kinds of skill events the engine emits (HUD ring buffer + VFX feed). */
export type SkillEventKind =
  | 'salvo' // Opening Salvo hit one enemy (value = HP taken)
  | 'shield_absorb' // Guard Shell absorbed damage (value = absorbed)
  | 'shield_break' // the shield just emptied
  | 'phase' // Phase Step dodged a hit (value 0)
  | 'mirror' // Mirror Plate reflected (value = reflected damage)
  | 'lucky' // Lucky Edge multiplied a hit (value = the hit)
  | 'momentum' // Momentum multiplied a hit (value = stacks used)
  | 'heal' // Second Wind healed (value = HP healed)
  | 'rocket_volley' // Homing Rockets fired (value = rockets launched)
  | 'rocket_hit' // one rocket landed (value = HP taken)
  | 'static' // Static Charge shocked the enemy (value 0 / 1 = also stunned)
  | 'stun_skip' // a team turn was skipped: every living blade stunned
  | 'ward' // Hazard Ward reduced a hazard hit (value = amount removed)

/** One event. Preallocated ring entries — read, never keep a reference. */
export interface SkillEvent {
  /** Monotonic sequence number (1-based); 0 = never written. */
  seq: number
  /** gameTime() of the event (PvP: virtual tick clock). */
  t: number
  kind: SkillEventKind
  skill: SkillId
  /** Blade the event is ABOUT (bearer for procs, target for hits / stuns). */
  bladeId: number
  syncKey: number
  owner: 'player' | 'npc'
  x: number
  y: number
  value: number
}

/** The blade fields the VFX layer reads. `SpinnerState` satisfies it. */
export interface SkillVfxBlade {
  id: number
  x: number
  y: number
  radius: number
  hp: number
  owner: 'player' | 'npc'
  skills?: {
    has: number
    shield: number
    shieldMax: number
    phasedUntil: number
  }
}

/** A rocket in flight (engine-owned 6-slot pool; read-only here). */
export interface SkillRocketView {
  active: boolean
  owner: 'player' | 'npc'
  /** Launch point (the bearer at volley time) and the live target. */
  x0: number
  y0: number
  target: { x: number; y: number } | null
  /** gameTime() at launch / impact — progress = (now − startAt) / (arriveAt − startAt). */
  startAt: number
  arriveAt: number
}

// ─── Pools ─────────────────────────────────────────────────────────────────

/** Ring kinds (numbers, not strings: switch without string compares). */
export const RING_HEAL = 0 // Second Wind burst
export const RING_MIRROR = 1 // Mirror Plate reflect flash (hexagon)
export const RING_MOMENTUM = 2 // Momentum stack glow (arc ticks)
export const RING_PHASE = 3 // Phase Step ghost outline (left behind)

export const RING_POOL_SIZE = 2
export const SHARD_POOL_SIZE = 12
export const SHARDS_PER_BREAK = 6
export const BURST_POOL_SIZE = 6
/** Rocket pool size the engine allocates (§8.3); drawn in ≤ 4 primitives. */
export const ROCKET_POOL_SIZE = 6

export const RING_LIFE_MS: readonly number[] = [350, 260, 320, 300]
export const SHARD_LIFE_MS = 380
export const BURST_LIFE_ROCKET_MS = 260
export const BURST_LIFE_SALVO_MS = 420

/** Worst case of renderSkillLayer: rings 2 + shards 2 + bursts 2 + rocket
 *  tails 2 + heads 2 + stun fill 1 + outline 1. */
export const SKILL_LAYER_MAX_PRIMITIVES = 12
/** Phase Step: the bearer's alpha while phased (FX.low: steady). */
export const PHASE_ALPHA = 0.45
const PHASE_ALPHA_DIM = 0.28

export interface VfxRing {
  active: boolean
  kind: number
  bladeId: number
  enemy: boolean
  /** Event position (the phase ghost stays here; others follow the blade). */
  x: number
  y: number
  t: number
  life: number
  value: number
}

export interface VfxShard {
  active: boolean
  enemy: boolean
  bladeId: number
  cx: number
  cy: number
  /** Start distance from the centre (blade radius + 3), resolved on first draw. */
  r0: number
  dx: number
  dy: number
  speed: number
  t: number
  life: number
}

export interface VfxBurst {
  active: boolean
  enemy: boolean
  salvo: boolean
  x: number
  y: number
  spin: number
  t: number
  life: number
}

/** Fixed VFX pools — created once per engine, reused forever. */
export interface SkillVfx {
  readonly rings: readonly VfxRing[]
  readonly shards: readonly VfxShard[]
  readonly bursts: readonly VfxBurst[]
}

export function createSkillVfx(): SkillVfx {
  const rings: VfxRing[] = []
  for (let i = 0; i < RING_POOL_SIZE; i++) {
    rings.push({ active: false, kind: 0, bladeId: -1, enemy: false, x: 0, y: 0, t: 0, life: 1, value: 0 })
  }
  const shards: VfxShard[] = []
  for (let i = 0; i < SHARD_POOL_SIZE; i++) {
    shards.push({
      active: false, enemy: false, bladeId: -1, cx: 0, cy: 0, r0: -1,
      dx: 0, dy: 0, speed: 0, t: 0, life: 1
    })
  }
  const bursts: VfxBurst[] = []
  for (let i = 0; i < BURST_POOL_SIZE; i++) {
    bursts.push({ active: false, enemy: false, salvo: false, x: 0, y: 0, spin: 0, t: 0, life: 1 })
  }
  return { rings, shards, bursts }
}

/** Drop every live skill effect (initGame, surrender, game over). */
export function resetSkillVfx(fx: SkillVfx): void {
  for (let i = 0; i < fx.rings.length; i++) fx.rings[i]!.active = false
  for (let i = 0; i < fx.shards.length; i++) fx.shards[i]!.active = false
  for (let i = 0; i < fx.bursts.length; i++) fx.bursts[i]!.active = false
}

/** Advance pooled effects by `dt` ms (called once per physics tick). */
export function tickSkillVfx(fx: SkillVfx, dt: number): void {
  for (let i = 0; i < fx.rings.length; i++) {
    const r = fx.rings[i]!
    if (!r.active) continue
    r.t += dt
    if (r.t >= r.life) r.active = false
  }
  for (let i = 0; i < fx.shards.length; i++) {
    const s = fx.shards[i]!
    if (!s.active) continue
    s.t += dt
    if (s.t >= s.life) s.active = false
  }
  for (let i = 0; i < fx.bursts.length; i++) {
    const b = fx.bursts[i]!
    if (!b.active) continue
    b.t += dt
    if (b.t >= b.life) b.active = false
  }
}

/** Free slot, else the one closest to its end (never allocates). */
const takeRing = (fx: SkillVfx): VfxRing => {
  let best = fx.rings[0]!
  let bestU = -1
  for (let i = 0; i < fx.rings.length; i++) {
    const r = fx.rings[i]!
    if (!r.active) return r
    const u = r.t / r.life
    if (u > bestU) {
      bestU = u
      best = r
    }
  }
  return best
}

const spawnRing = (fx: SkillVfx, kind: number, ev: Readonly<SkillEvent>): void => {
  // One ring per blade per kind: a re-proc restarts it instead of stacking.
  let r: VfxRing | null = null
  for (let i = 0; i < fx.rings.length; i++) {
    const c = fx.rings[i]!
    if (c.active && c.kind === kind && c.bladeId === ev.bladeId) {
      r = c
      break
    }
  }
  if (r === null) r = takeRing(fx)
  r.active = true
  r.kind = kind
  r.bladeId = ev.bladeId
  r.enemy = ev.owner !== 'player'
  r.x = ev.x
  r.y = ev.y
  r.t = 0
  r.life = RING_LIFE_MS[kind]!
  r.value = ev.value
}

const spawnShards = (fx: SkillVfx, ev: Readonly<SkillEvent>): void => {
  let n = 0
  const a0 = Math.random() * Math.PI * 2 // vfx-rng
  for (let i = 0; i < fx.shards.length && n < SHARDS_PER_BREAK; i++) {
    const s = fx.shards[i]!
    if (s.active) continue
    const a = a0 + (n / SHARDS_PER_BREAK) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
    s.active = true
    s.enemy = ev.owner !== 'player'
    s.bladeId = ev.bladeId
    s.cx = ev.x
    s.cy = ev.y
    s.r0 = -1
    s.dx = Math.cos(a)
    s.dy = Math.sin(a)
    s.speed = 0.07 + Math.random() * 0.06 // px per ms
    s.t = 0
    s.life = SHARD_LIFE_MS
    n++
  }
}

const spawnBurst = (fx: SkillVfx, ev: Readonly<SkillEvent>, salvo: boolean): void => {
  let b: VfxBurst | null = null
  let bestU = -1
  for (let i = 0; i < fx.bursts.length; i++) {
    const c = fx.bursts[i]!
    if (!c.active) {
      b = c
      break
    }
    const u = c.t / c.life
    if (u > bestU) {
      bestU = u
      b = c
    }
  }
  if (b === null) return
  b.active = true
  // A rocket hit / salvo is ABOUT the target; colour by the attacker's side.
  b.enemy = ev.owner === 'player'
  b.salvo = salvo
  b.x = ev.x
  b.y = ev.y
  b.spin = Math.random() * Math.PI // vfx-rng
  b.t = 0
  b.life = salvo ? BURST_LIFE_SALVO_MS : BURST_LIFE_ROCKET_MS
}

/** A skill event just happened: spawn pooled effects and play the SFX. */
export function skillVfxEvent(fx: SkillVfx, ev: Readonly<SkillEvent>, low: boolean): void {
  switch (ev.kind) {
    case 'shield_absorb':
      playSkillSfx('skill-shield', 0.014)
      break
    case 'shield_break':
      if (!low) spawnShards(fx, ev)
      playSkillSfx('skill-shield', 0.022)
      break
    case 'phase':
      if (!low) spawnRing(fx, RING_PHASE, ev)
      playSkillSfx('skill-shield', 0.012)
      break
    case 'mirror':
      if (!low) spawnRing(fx, RING_MIRROR, ev)
      playSkillSfx('skill-shield', 0.018)
      break
    case 'momentum':
      if (!low && ev.value > 0) spawnRing(fx, RING_MOMENTUM, ev)
      break
    case 'heal':
      if (!low) spawnRing(fx, RING_HEAL, ev)
      playSkillSfx('level-up', 0.025)
      break
    case 'rocket_volley':
      if (ev.value > 0) playSkillSfx('skill-rocket', 0.02)
      break
    case 'rocket_hit':
      if (!low) spawnBurst(fx, ev, false)
      break
    case 'salvo':
      if (!low) spawnBurst(fx, ev, true)
      break
    case 'static':
    case 'stun_skip':
      playSkillSfx('skill-zap', 0.018)
      break
    default:
      break
  }
}

// ─── Colours (module constants — never built per frame) ────────────────────

const C_SHIELD = '#67e8f9'
const C_ENEMY = '#ff6666'
const C_HEAL = '#4ade80'
const C_MIRROR = '#e0f2fe'
const C_MOMENTUM = '#38bdf8'
const C_PHASE = '#c4b5fd'
const C_SHARD = '#a5f3fc'
const C_SHARD_ENEMY = '#fca5a5'
const C_ROCKET = '#fb923c'
const C_ROCKET_TAIL = '#fde68a'
const C_ROCKET_TAIL_ENEMY = '#fecaca'
const C_BURST = '#fdba74'
const C_STUN = '#facc15'
const C_INK = '#1f2937'
const C_GLYPH_INK = '#000000'

const TAU = Math.PI * 2

// Static Charge bolt polygon, parsed ONCE from the catalog icon (24×24, M/L/Z
// only) so the stun glyph and the HUD icon can never drift apart.
const STUN_POLY: Float64Array = (() => {
  const nums = SKILLS.static_charge.icon.match(/-?\d+(?:\.\d+)?/g) ?? []
  const out = new Float64Array(nums.length)
  for (let i = 0; i < nums.length; i++) out[i] = Number(nums[i]) - 12 // centre on 0
  return out
})()
export const STUN_GLYPH_SIZE = 20
const easeOut = (u: number): number => 1 - (1 - u) * (1 - u)

// ─── Call site 1 — per skilled blade ───────────────────────────────────────

/**
 * Phase Step: alpha factor for the whole blade render (renderBlade multiplies
 * it into its own alpha). 1 outside a phase window; a 10 Hz flicker between
 * 45 % and 28 % inside it (FX.low: steady 45 %).
 */
export function skillBladeAlpha(blade: Readonly<SkillVfxBlade>, now: number, low: boolean): number {
  const s = blade.skills
  if (s === undefined || !(now < s.phasedUntil)) return 1
  if (low) return PHASE_ALPHA
  return ((now / 50) | 0) % 2 === 0 ? PHASE_ALPHA : PHASE_ALPHA_DIM
}

/** Call site 1 — per skilled blade, inside renderBlade after the HP ring:
 *  the Guard Shell arc (radius + 3, 2 px, sweep = shield %). Both tiers. */
export function renderBladeSkillFx(
  ctx: CanvasRenderingContext2D,
  _fx: SkillVfx,
  blade: Readonly<SkillVfxBlade>,
  _now: number,
  _low: boolean
): void {
  const s = blade.skills
  if (s === undefined || blade.hp <= 0 || !(s.shield > 0) || !(s.shieldMax > 0)) return
  const frac = s.shield >= s.shieldMax ? 1 : s.shield / s.shieldMax
  ctx.save()
  ctx.beginPath()
  ctx.arc(blade.x, blade.y, blade.radius + 3, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.strokeStyle = blade.owner === 'player' ? C_SHIELD : C_ENEMY
  ctx.stroke()
  ctx.restore()
}

// ─── Call site 2 — the skill layer ─────────────────────────────────────────

const findBlade = (blades: readonly SkillVfxBlade[], id: number): SkillVfxBlade | null => {
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i]!
    if (b.id === id) return b
  }
  return null
}

/** One ring = one stroke. */
const drawRing = (ctx: CanvasRenderingContext2D, r: VfxRing, blades: readonly SkillVfxBlade[]): void => {
  const b = findBlade(blades, r.bladeId)
  const follow = r.kind !== RING_PHASE && b !== null && b.hp > 0
  const x = follow ? b!.x : r.x
  const y = follow ? b!.y : r.y
  const R = b !== null ? b.radius : 26
  const u = r.t >= r.life ? 1 : r.t / r.life
  const e = easeOut(u)
  const fade = 1 - u
  ctx.beginPath()
  switch (r.kind) {
    case RING_HEAL: {
      ctx.arc(x, y, R * (1.05 + 0.95 * e), 0, TAU)
      ctx.globalAlpha = 0.85 * fade
      ctx.lineWidth = 1.5 + 3 * fade
      ctx.strokeStyle = C_HEAL
      break
    }
    case RING_MIRROR: {
      const rr = R + 5 + 9 * e
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * TAU + Math.PI / 6
        const px = x + Math.cos(a) * rr
        const py = y + Math.sin(a) * rr
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.globalAlpha = 0.95 * fade
      ctx.lineWidth = 2.5
      ctx.strokeStyle = r.enemy ? C_ENEMY : C_MIRROR
      break
    }
    case RING_MOMENTUM: {
      const n = r.value < 1 ? 1 : r.value > 5 ? 5 : r.value | 0
      const rr = R + 7 + 2 * e
      const rot = r.t * 0.006
      const seg = Math.min(0.7, (TAU / n) * 0.45)
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * TAU
        ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        ctx.arc(x, y, rr, a, a + seg)
      }
      ctx.globalAlpha = 0.9 * fade
      ctx.lineWidth = 3
      ctx.strokeStyle = r.enemy ? C_ENEMY : C_MOMENTUM
      break
    }
    default: { // RING_PHASE — double ghost outline left at the dodge point
      const off = 3 + 4 * e
      ctx.moveTo(x - off + R, y)
      ctx.arc(x - off, y, R, 0, TAU)
      ctx.moveTo(x + off + R, y)
      ctx.arc(x + off, y, R, 0, TAU)
      ctx.globalAlpha = 0.55 * fade
      ctx.lineWidth = 2
      ctx.strokeStyle = r.enemy ? C_ENEMY : C_PHASE
      break
    }
  }
  ctx.stroke()
}

/** Shards of one colour family → one stroke. Returns whether it drew. */
const drawShards = (
  ctx: CanvasRenderingContext2D, fx: SkillVfx, blades: readonly SkillVfxBlade[], enemy: boolean
): boolean => {
  let any = false
  for (let i = 0; i < fx.shards.length; i++) {
    const s = fx.shards[i]!
    if (!s.active || s.enemy !== enemy) continue
    if (s.r0 < 0) {
      const b = findBlade(blades, s.bladeId)
      s.r0 = (b !== null ? b.radius : 26) + 3
    }
    if (!any) {
      ctx.beginPath()
      any = true
    }
    const d = s.r0 + s.speed * s.t
    const len = 6 * (1 - s.t / s.life) + 2
    ctx.moveTo(s.cx + s.dx * d, s.cy + s.dy * d)
    ctx.lineTo(s.cx + s.dx * (d + len), s.cy + s.dy * (d + len))
  }
  if (!any) return false
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 2
  ctx.strokeStyle = enemy ? C_SHARD_ENEMY : C_SHARD
  ctx.stroke()
  return true
}

/** Impact bursts of one colour family → one stroke (8 spokes each). */
const drawBursts = (ctx: CanvasRenderingContext2D, fx: SkillVfx, enemy: boolean): boolean => {
  let any = false
  let alpha = 0
  for (let i = 0; i < fx.bursts.length; i++) {
    const b = fx.bursts[i]!
    if (!b.active || b.enemy !== enemy) continue
    if (!any) {
      ctx.beginPath()
      any = true
    }
    const u = b.t / b.life
    const e = easeOut(u)
    const reach = b.salvo ? 12 + 34 * e : 6 + 18 * e
    const inner = reach * (0.35 + 0.45 * u)
    for (let k = 0; k < 8; k++) {
      const a = b.spin + (k / 8) * TAU
      const c = Math.cos(a)
      const s = Math.sin(a)
      ctx.moveTo(b.x + c * inner, b.y + s * inner)
      ctx.lineTo(b.x + c * reach, b.y + s * reach)
    }
    const f = 1 - u
    if (f > alpha) alpha = f
  }
  if (!any) return false
  ctx.globalAlpha = alpha
  ctx.lineWidth = 2
  ctx.strokeStyle = enemy ? C_ENEMY : C_BURST
  ctx.stroke()
  return true
}

// Scratch for rocket geometry (module-level, reused — no per-frame objects).
let qx = 0
let qy = 0
let tx = 0
let ty = 0
/** Quadratic Bézier point + tangent into (qx, qy) / (tx, ty). */
const bez = (
  x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, p: number
): void => {
  const m = 1 - p
  qx = m * m * x0 + 2 * m * p * cx + p * p * x1
  qy = m * m * y0 + 2 * m * p * cy + p * p * y1
  tx = 2 * m * (cx - x0) + 2 * p * (x1 - cx)
  ty = 2 * m * (cy - y0) + 2 * p * (y1 - cy)
}
let ctrlX = 0
let ctrlY = 0
/** Control point: midpoint pushed sideways (alternating per slot). */
const rocketCtrl = (r: SkillRocketView, i: number): void => {
  const t = r.target!
  const mx = (r.x0 + t.x) / 2
  const my = (r.y0 + t.y) / 2
  const side = i % 2 === 0 ? 1 : -1
  ctrlX = mx - (t.y - r.y0) * 0.3 * side
  ctrlY = my + (t.x - r.x0) * 0.3 * side
}
const rocketP = (r: SkillRocketView, now: number): number => {
  const span = r.arriveAt - r.startAt
  if (!(span > 0)) return 1
  const p = (now - r.startAt) / span
  return p < 0 ? 0 : p > 1 ? 1 : p
}

/** Rockets of one side: tails → 1 stroke (high only), heads → 1 fill. */
const drawRockets = (
  ctx: CanvasRenderingContext2D,
  rockets: readonly SkillRocketView[],
  owner: 'player' | 'npc',
  now: number,
  low: boolean
): void => {
  let any = false
  if (!low) {
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i]!
      if (!r.active || r.target === null || r.owner !== owner) continue
      if (!any) {
        ctx.beginPath()
        any = true
      }
      const p = rocketP(r, now)
      rocketCtrl(r, i)
      const t = r.target
      bez(r.x0, r.y0, ctrlX, ctrlY, t.x, t.y, p < 0.2 ? 0 : p - 0.2)
      ctx.moveTo(qx, qy)
      bez(r.x0, r.y0, ctrlX, ctrlY, t.x, t.y, p < 0.1 ? 0 : p - 0.1)
      ctx.lineTo(qx, qy)
      bez(r.x0, r.y0, ctrlX, ctrlY, t.x, t.y, p)
      ctx.lineTo(qx, qy)
    }
    if (any) {
      ctx.globalAlpha = 0.7
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = owner === 'player' ? C_ROCKET_TAIL : C_ROCKET_TAIL_ENEMY
      ctx.stroke()
    }
  }
  any = false
  for (let i = 0; i < rockets.length; i++) {
    const r = rockets[i]!
    if (!r.active || r.target === null || r.owner !== owner) continue
    if (!any) {
      ctx.beginPath()
      any = true
    }
    const p = rocketP(r, now)
    rocketCtrl(r, i)
    const t = r.target
    bez(r.x0, r.y0, ctrlX, ctrlY, t.x, t.y, p)
    const len = Math.hypot(tx, ty)
    const dx = len > 1e-6 ? tx / len : 1
    const dy = len > 1e-6 ? ty / len : 0
    // Triangle head: tip 8 px ahead, base 5 px behind, 9 px wide.
    ctx.moveTo(qx + dx * 8, qy + dy * 8)
    ctx.lineTo(qx - dx * 5 - dy * 4.5, qy - dy * 5 + dx * 4.5)
    ctx.lineTo(qx - dx * 5 + dy * 4.5, qy - dy * 5 - dx * 4.5)
    ctx.closePath()
  }
  if (any) {
    ctx.globalAlpha = 1
    ctx.fillStyle = owner === 'player' ? C_ROCKET : C_ENEMY
    ctx.fill()
  }
}


/** Stun glyphs over every stunned blade → 1 fill (+ 1 outline on high). */
const drawStunGlyphs = (
  ctx: CanvasRenderingContext2D,
  blades: readonly SkillVfxBlade[],
  isStunned: (b: SkillVfxBlade) => boolean,
  now: number,
  low: boolean
): boolean => {
  let any = false
  const k = STUN_GLYPH_SIZE / 24
  const bob = Math.sin(now * 0.008) * 2
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i]!
    if (b.hp <= 0 || !isStunned(b)) continue
    if (!any) {
      ctx.beginPath()
      any = true
    }
    const cx = b.x
    const cy = b.y - b.radius - 14 + bob
    for (let j = 0; j + 1 < STUN_POLY.length; j += 2) {
      const px = cx + STUN_POLY[j]! * k
      const py = cy + STUN_POLY[j + 1]! * k
      if (j === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }
  if (!any) return false
  ctx.globalAlpha = 1
  // Ink outline UNDER the fill (only its outer half shows), high tier only.
  if (!low) {
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C_INK
    ctx.stroke()
  }
  ctx.fillStyle = C_STUN
  ctx.fill()
  return true
}

const anyActive = (fx: SkillVfx, rockets: readonly SkillRocketView[]): boolean => {
  for (let i = 0; i < fx.rings.length; i++) if (fx.rings[i]!.active) return true
  for (let i = 0; i < fx.shards.length; i++) if (fx.shards[i]!.active) return true
  for (let i = 0; i < fx.bursts.length; i++) if (fx.bursts[i]!.active) return true
  for (let i = 0; i < rockets.length; i++) if (rockets[i]!.active) return true
  return false
}

/**
 * Call site 2 — world layer after the blades: rings, shards, impact bursts,
 * rockets, stun glyphs. `isStunned(b)` = b may not move on its team's next turn.
 * ≤ SKILL_LAYER_MAX_PRIMITIVES draw calls; one save/restore around all of it.
 */
export function renderSkillLayer(
  ctx: CanvasRenderingContext2D,
  fx: SkillVfx,
  rockets: readonly SkillRocketView[],
  blades: readonly SkillVfxBlade[],
  isStunned: (b: SkillVfxBlade) => boolean,
  now: number,
  low: boolean
): void {
  // Cheap early-out: nothing pooled alive and nobody stunned → no save/restore.
  let stunned = false
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i]!
    if (b.hp > 0 && isStunned(b)) {
      stunned = true
      break
    }
  }
  if (!stunned && !anyActive(fx, rockets)) return

  ctx.save()
  if (!low) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 0; i < fx.rings.length; i++) {
      const r = fx.rings[i]!
      if (r.active) drawRing(ctx, r, blades)
    }
    drawShards(ctx, fx, blades, false)
    drawShards(ctx, fx, blades, true)
    drawBursts(ctx, fx, false)
    drawBursts(ctx, fx, true)
  }
  drawRockets(ctx, rockets, 'player', now, low)
  drawRockets(ctx, rockets, 'npc', now, low)
  if (stunned) drawStunGlyphs(ctx, blades, isStunned, now, low)
  ctx.restore()
}

// ─── Call site 3 — popup glyphs ────────────────────────────────────────────

// Path2D per skill, built on first use from the catalog icon (24×24 viewBox)
// and kept for the page's lifetime. null = no Path2D in this environment.
const glyphPaths: Partial<Record<SkillId, Path2D | null>> = {}
const glyphPath = (id: SkillId): Path2D | null => {
  let p = glyphPaths[id]
  if (p === undefined) {
    p = typeof Path2D === 'undefined' ? null : new Path2D(SKILLS[id].icon)
    glyphPaths[id] = p
  }
  return p
}

/**
 * Call site 3 — a popup glyph (12 px at scale 1) centred on (x, y), drawn by
 * renderDamageNumbers left of the number (or alone for glyph-only popups).
 * The context already carries the popup's globalAlpha. Dark ink outline under
 * the colour fill so it reads on every floor (2 primitives).
 */
export function drawSkillGlyph(
  ctx: CanvasRenderingContext2D,
  id: SkillId,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const p = glyphPath(id)
  ctx.save()
  if (p === null) {
    // No Path2D (very old engine / test DOM): a plain dot in the skill colour.
    ctx.beginPath()
    ctx.arc(x, y, size * 0.4, 0, TAU)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
    return
  }
  const k = size / 24
  ctx.translate(x - size / 2, y - size / 2)
  ctx.scale(k, k)
  ctx.lineWidth = 3.5
  ctx.lineJoin = 'round'
  ctx.strokeStyle = C_GLYPH_INK
  ctx.stroke(p)
  ctx.fillStyle = color
  ctx.fill(p)
  ctx.restore()
}

/** Tests / QA: the cached Path2D for a skill (builds it on first call). */
export const __glyphPathFor = glyphPath
