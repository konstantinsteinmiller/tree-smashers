// Boss-trait VFX + SFX — canvas layer for the stage-101+ boss mechanics
// (bosses-100-feature.md §7.3, work package BW4).
//
// Every signature called by the engine (useSpinnerGame.ts) is fixed by BW3;
// this module owns the pooled drawing code, the cached sprites and the
// boss-trait SFX triggers (bossTraitSfx.ts).
//
// Contract (same rules as skills/skillVfx.ts):
//   • Pure canvas + plain objects. Never imports the engine, never writes
//     gameplay state (hp, velocity, turn locks, chill stacks), never draws
//     from matchRng — VFX randomness is Math.random or none.
//   • Zero per-frame allocation: pools are created in createBossTraitVfx(),
//     sprites (aura ×3, one ice shell per victim radius) are baked in
//     prepareBossTraitVfx() (initGame, only when the roster carries a trait);
//     render/tick calls use indexed loops, module-constant colours, no
//     closures / arrays / strings.
//   • No shadowBlur, no ctx.filter, no per-frame gradients (the aura and ice
//     sprites are baked ONCE as flat concentric rings, then blitted); fades are
//     globalAlpha.
//   • FX.low (`low`) follows the §7.3 fallback column: no carrier auras, ice
//     shell = one stroked hexagon, nova = one stroke, no shards / embers /
//     chill-fade rings. Charge arc + reach ring and the frost rim are the
//     same on both tiers. Audio is identical on both tiers.
//   • Budget (worst frame of the Elemental Court, 3 carriers + 2 frozen /
//     chilled victims): ≤ BOSS_TRAIT_MAX_PRIMITIVES draw primitives.
//   • Time: every `now` is the engine's SIMULATION clock (ms, advances only
//     while physics ticks), and pooled effects age in tickBossTraitVfx (once
//     per physics tick), so a platform pause freezes every effect.
//   • Every render call leaves the context state as it found it.
//
// Call sites in useSpinnerGame.ts (all behind the engine's `traitsActive`
// fast path — a match without traits never calls into this module except
// createBossTraitVfx / resetBossTraitVfx):
//   1. prepareBossTraitVfx — initGame, after spawns, when the roster has a
//      trait (bake sprites, request the SFX set).
//   2. renderBossAura      — render(), aura pass UNDER the blades (circle
//      arena only), once per living carrier.
//   3. renderEmberCharge / renderIceShell / renderChillOverlay — after the
//      blade loop + border FX, per living carrier / frozen / chilled blade.
//   4. renderBossTraitLayer — right after 3: pooled transients.
//   plus bossTraitVfxEvent (every trait event as it is written into the
//   engine's event ring), tickBossTraitVfx (once per physics tick, dt = 16)
//   and resetBossTraitVfx (initGame / clearBattleVfx).

import type { BossTrait } from '@/types/spinner'
import { BOSS_TRAIT_TUNING } from '@/use/bosses/bossTraits'
import { fillConcentric } from '@/utils/concentricFill'
import { playBossSfx, requestBossTraitSfx } from '@/use/bosses/bossTraitSfx'

// ─── Events (the engine's fixed ring feeds this layer) ─────────────────────

/** Kinds of boss-trait events the engine emits (VFX/SFX feed + HUD + QA). */
export type BossTraitEventKind =
  | 'nova' // an Ember Nova released by one carrier (blade = carrier; value = victims hit this pulse)
  | 'burn' // one nova victim burned (blade = victim; value = HP lost)
  | 'frost_touch' // Warden cold touch drained a victim (blade = victim; value = speed kept 0…1)
  | 'freeze' // victim frozen for its team's next turn (blade = victim; value = that turn index)
  | 'freeze_crack' // freeze refused: last launchable blade — the ice cracks off (blade = victim)
  | 'thaw' // a frost lock ended (blade = the unfrozen blade; value 1 = forced thaw at turn start, 0 = its turn passed)
  | 'chill' // chill stack landed (blade = victim; value = live stacks; also a refresh at the cap)
  | 'chill_fade' // chill stacks expired at a turn end (blade = victim; value = live stacks left)

/** One event. Preallocated ring entries — read, never keep a reference. */
export interface BossTraitEvent {
  /** Monotonic sequence number (1-based); 0 = never written. */
  seq: number
  /** Engine simulation clock (ms) of the event. */
  t: number
  kind: BossTraitEventKind
  /** Trait that caused it. */
  trait: BossTrait
  /** Blade the event is ABOUT (see the kind comments). */
  bladeId: number
  syncKey: number
  owner: 'player' | 'npc'
  x: number
  y: number
  radius: number
  value: number
}

/** Size of the engine's boss-trait event ring (`forEachBossTraitEvent`). */
export const BOSS_TRAIT_EVENT_BUFFER = 16

// ─── Blades as the VFX layer sees them ─────────────────────────────────────

/** The blade fields the VFX layer reads. `SpinnerState` satisfies it. */
export interface BossTraitVfxBlade {
  id: number
  x: number
  y: number
  radius: number
  rotation: number
  hp: number
  owner: 'player' | 'npc'
  config: { bossTrait?: BossTrait }
}

// ─── Budget + pool sizes (§7.3) ────────────────────────────────────────────

export const NOVA_POOL_SIZE = 3
export const NOVA_LIFE_MS = 350
/** Ice shards: frost touch, refused-freeze crack, thaw shatter, chill puff. */
export const SHARD_POOL_SIZE = 12
export const SHARDS_PER_BURST = 6
export const SHARDS_PER_CHILL = 3
export const SHARD_LIFE_MS = 380
/** Embers rising off a burned victim. */
export const EMBER_POOL_SIZE = 8
export const EMBERS_PER_BURN = 4
export const EMBER_LIFE_MS = 520
/** Frost rim that lets go when chill stacks expire. */
export const FADE_POOL_SIZE = 2
export const FADE_LIFE_MS = 420
/** Ice shell "forms" over this long after a freeze (high tier). */
export const FREEZE_FORM_MS = 160
const FREEZE_SLOTS = 4
/** Distinct victim radii with their own baked ice shell (more → nearest, scaled). */
export const ICE_SHELL_CACHE_SIZE = 6
/** Last stretch of the nova charge drawn thicker (§7.3). */
export const EMBER_CHARGE_WARN_MS = 300

/** Per-call primitive budget, high tier (low tier ≤ the same). */
export const AURA_MAX_PRIMITIVES = 1
export const CHARGE_MAX_PRIMITIVES = 2
export const SHELL_MAX_PRIMITIVES = 1
export const CHILL_MAX_PRIMITIVES = 1
/** renderBossTraitLayer worst case: 3 novas × 2 + shards 1 + embers 1 + fades 2. */
export const BOSS_LAYER_MAX_PRIMITIVES = 10
/** FX.low layer worst case: 3 novas × 1. */
export const BOSS_LAYER_MAX_PRIMITIVES_LOW = 3
/** Whole trait layer, worst frame of the Elemental Court (§7.3): 3 auras +
 *  1 charge (2) + 2 shells + 2 frost rims + the layer (10) = 18. */
export const BOSS_TRAIT_MAX_PRIMITIVES = 20

// ─── State ─────────────────────────────────────────────────────────────────

export interface NovaFx {
  active: boolean
  x: number
  y: number
  /** Start (carrier radius) and end (the reach a victim centre sits in) radii. */
  r0: number
  r1: number
  t: number
  life: number
}

export interface ShardFx {
  active: boolean
  cx: number
  cy: number
  /** Start distance from the centre (blade rim). */
  r0: number
  dx: number
  dy: number
  speed: number
  len: number
  t: number
  life: number
}

export interface EmberFx {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
}

export interface FadeFx {
  active: boolean
  x: number
  y: number
  r: number
  t: number
  life: number
}

/** All pools of the layer (created once per engine, reused forever). */
export interface BossTraitVfx {
  /** True once prepareBossTraitVfx ran for the current match. */
  prepared: boolean
  readonly novas: readonly NovaFx[]
  readonly shards: readonly ShardFx[]
  readonly embers: readonly EmberFx[]
  readonly fades: readonly FadeFx[]
  /** Freeze formation: blade id (−1 = free) + sim time of the freeze. */
  readonly freezeId: Int32Array
  readonly freezeAt: Float64Array
}

export function createBossTraitVfx(): BossTraitVfx {
  const novas: NovaFx[] = []
  for (let i = 0; i < NOVA_POOL_SIZE; i++) novas.push({ active: false, x: 0, y: 0, r0: 0, r1: 0, t: 0, life: 1 })
  const shards: ShardFx[] = []
  for (let i = 0; i < SHARD_POOL_SIZE; i++) {
    shards.push({ active: false, cx: 0, cy: 0, r0: 0, dx: 0, dy: 0, speed: 0, len: 0, t: 0, life: 1 })
  }
  const embers: EmberFx[] = []
  for (let i = 0; i < EMBER_POOL_SIZE; i++) embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1 })
  const fades: FadeFx[] = []
  for (let i = 0; i < FADE_POOL_SIZE; i++) fades.push({ active: false, x: 0, y: 0, r: 0, t: 0, life: 1 })
  const freezeId = new Int32Array(FREEZE_SLOTS).fill(-1)
  return { prepared: false, novas, shards, embers, fades, freezeId, freezeAt: new Float64Array(FREEZE_SLOTS) }
}

/** initGame / clearBattleVfx: drop every live effect (keeps sprite caches). */
export function resetBossTraitVfx(fx: BossTraitVfx): void {
  fx.prepared = false
  for (let i = 0; i < fx.novas.length; i++) fx.novas[i]!.active = false
  for (let i = 0; i < fx.shards.length; i++) fx.shards[i]!.active = false
  for (let i = 0; i < fx.embers.length; i++) fx.embers[i]!.active = false
  for (let i = 0; i < fx.fades.length; i++) fx.fades[i]!.active = false
  fx.freezeId.fill(-1)
}

// ─── Sprites (module-scoped: a remounted arena reuses the bake) ────────────

type Sprite = HTMLCanvasElement | OffscreenCanvas
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** A drawable offscreen surface, or null where the environment has none. */
const makeSurface = (w: number, h: number): { c: Sprite; g: Ctx2D } | null => {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(w, h)
      const g = c.getContext('2d')
      return g ? { c, g } : null
    }
    if (typeof document === 'undefined') return null
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    return g ? { c, g } : null
  } catch {
    return null
  }
}

const AURA_R = 128
const TRAIT_INDEX: Record<BossTrait, number> = { ember: 0, frost: 1, chill: 2 }
/** Aura stops per trait (ember / frost / chill) — baked once, never per frame. */
const AURA_STOPS: readonly (readonly [number, string][])[] = [
  [[0, 'rgba(255,170,60,0)'], [0.36, 'rgba(255,150,40,0.42)'], [0.7, 'rgba(255,90,20,0.16)'], [1, 'rgba(255,60,10,0)']],
  [[0, 'rgba(127,212,255,0)'], [0.45, 'rgba(127,212,255,0.4)'], [0.75, 'rgba(42,127,201,0.15)'], [1, 'rgba(42,127,201,0)']],
  [[0, 'rgba(230,244,255,0)'], [0.45, 'rgba(225,242,255,0.42)'], [0.75, 'rgba(159,231,224,0.14)'], [1, 'rgba(159,231,224,0)']]
]
/** Aura radius as a multiple of the carrier radius: the ember aura spans the
 *  nova's reach, so its soft edge IS the danger zone. */
const AURA_MUL: readonly number[] = [0, 1.9, 1.9]
/** undefined = not baked yet; null = no canvas in this environment. */
const auraSprites: (Sprite | null | undefined)[] = [undefined, undefined, undefined]

const bakeAura = (i: number): Sprite | null => {
  const s = makeSurface(AURA_R * 2, AURA_R * 2)
  if (s === null) return null
  fillConcentric(s.g, AURA_R, AURA_R, AURA_R, AURA_STOPS[i]!, 14)
  return s.c
}

/** Ice shells are baked at this many device px per arena unit. */
const SHELL_BAKE = 3
/** Hexagon radius over the blade radius. */
const SHELL_PAD = 6
const shellRadius = new Float64Array(ICE_SHELL_CACHE_SIZE)
const shellSprites: (Sprite | null)[] = []
let shellCount = 0

/** Hexagon (pointy-top) path of radius `h` around (cx, cy). */
const hexPath = (g: Ctx2D | CanvasRenderingContext2D, cx: number, cy: number, h: number, rot: number): void => {
  for (let k = 0; k <= 6; k++) {
    const a = rot + (k / 6) * TAU
    const px = cx + Math.cos(a) * h
    const py = cy + Math.sin(a) * h
    if (k === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  }
}

const bakeShell = (radius: number): Sprite | null => {
  const H = radius + SHELL_PAD
  const half = H + 4
  const size = Math.ceil(half * 2 * SHELL_BAKE)
  const s = makeSurface(size, size)
  if (s === null) return null
  const g = s.g
  const c = size / 2
  g.scale(SHELL_BAKE, SHELL_BAKE)
  const o = c / SHELL_BAKE
  const rot = -Math.PI / 2
  // Body: translucent ice, lighter towards the top-left (gradient: bake only).
  const body = g.createLinearGradient(o - H, o - H, o + H, o + H)
  body.addColorStop(0, 'rgba(236,250,255,0.55)')
  body.addColorStop(0.5, 'rgba(160,220,255,0.32)')
  body.addColorStop(1, 'rgba(60,150,220,0.42)')
  g.beginPath()
  hexPath(g, o, o, H, rot)
  g.fillStyle = body
  g.fill()
  // Facets: three alternating lighter wedges.
  g.beginPath()
  for (let k = 0; k < 6; k += 2) {
    const a0 = rot + (k / 6) * TAU
    const a1 = rot + ((k + 1) / 6) * TAU
    g.moveTo(o, o)
    g.lineTo(o + Math.cos(a0) * H, o + Math.sin(a0) * H)
    g.lineTo(o + Math.cos(a1) * H, o + Math.sin(a1) * H)
    g.closePath()
  }
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.fill()
  // Cracks: a few thin lines from the rim inward.
  g.beginPath()
  const cracks = [0.3, 1.9, 3.4, 4.6]
  for (let k = 0; k < cracks.length; k++) {
    const a = cracks[k]!
    const r0 = H * 0.95
    const r1 = H * (0.42 + 0.1 * (k % 2))
    g.moveTo(o + Math.cos(a) * r0, o + Math.sin(a) * r0)
    g.lineTo(o + Math.cos(a + 0.18) * (r0 + r1) / 2, o + Math.sin(a + 0.18) * (r0 + r1) / 2)
    g.lineTo(o + Math.cos(a - 0.05) * r1, o + Math.sin(a - 0.05) * r1)
  }
  g.lineWidth = 1
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.stroke()
  // Rims: bright outer edge, deep-ice inner edge.
  g.beginPath()
  hexPath(g, o, o, H, rot)
  g.lineWidth = 2.5
  g.lineJoin = 'round'
  g.strokeStyle = '#e6f7ff'
  g.stroke()
  g.beginPath()
  hexPath(g, o, o, H - 3.5, rot)
  g.lineWidth = 1
  g.strokeStyle = 'rgba(42,127,201,0.7)'
  g.stroke()
  // Highlight streak on the top-left face.
  g.beginPath()
  g.moveTo(o - H * 0.62, o - H * 0.12)
  g.lineTo(o - H * 0.3, o - H * 0.62)
  g.lineWidth = 3
  g.lineCap = 'round'
  g.strokeStyle = 'rgba(255,255,255,0.7)'
  g.stroke()
  return s.c
}

/** Cached shell for `radius`: exact match, else the nearest (drawn scaled). */
const shellFor = (radius: number): { sprite: Sprite; r: number } | null => {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < shellCount; i++) {
    if (shellSprites[i] === null) continue
    const d = Math.abs(shellRadius[i]! - radius)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (best < 0) return null
  SHELL_HIT.sprite = shellSprites[best]!
  SHELL_HIT.r = shellRadius[best]!
  return SHELL_HIT
}
const SHELL_HIT: { sprite: Sprite; r: number } = { sprite: null as unknown as Sprite, r: 0 }

const bakeShellFor = (radius: number): void => {
  const r = Math.round(radius * 2) / 2
  for (let i = 0; i < shellCount; i++) if (shellRadius[i] === r) return
  if (shellCount >= ICE_SHELL_CACHE_SIZE) return
  shellRadius[shellCount] = r
  shellSprites[shellCount] = bakeShell(r)
  shellCount++
}

/**
 * initGame, only when the roster carries a trait: bake the carrier aura
 * sprites (once per page) and an ice shell per distinct victim radius, and
 * request the boss SFX set. Allocates (once per match); nothing after this may.
 */
export function prepareBossTraitVfx(fx: BossTraitVfx, blades: readonly BossTraitVfxBlade[], _low: boolean): void {
  fx.prepared = true
  requestBossTraitSfx()
  for (let i = 0; i < 3; i++) if (auraSprites[i] === undefined) auraSprites[i] = bakeAura(i)
  // Victims = blades of the other side than any carrier (NPC bosses → player).
  let carrierOwner: 'player' | 'npc' | null = null
  for (let i = 0; i < blades.length; i++) {
    if (blades[i]!.config.bossTrait !== undefined) carrierOwner = blades[i]!.owner
  }
  if (carrierOwner === null) return
  for (let i = 0; i < blades.length; i++) {
    const b = blades[i]!
    if (b.owner !== carrierOwner) bakeShellFor(b.radius)
  }
}

// ─── Tick + events ─────────────────────────────────────────────────────────

/** Once per physics tick (dt = 16): age pooled effects. */
export function tickBossTraitVfx(fx: BossTraitVfx, dt: number): void {
  for (let i = 0; i < fx.novas.length; i++) {
    const n = fx.novas[i]!
    if (n.active && (n.t += dt) >= n.life) n.active = false
  }
  for (let i = 0; i < fx.shards.length; i++) {
    const s = fx.shards[i]!
    if (s.active && (s.t += dt) >= s.life) s.active = false
  }
  for (let i = 0; i < fx.embers.length; i++) {
    const e = fx.embers[i]!
    if (e.active && (e.t += dt) >= e.life) e.active = false
  }
  for (let i = 0; i < fx.fades.length; i++) {
    const f = fx.fades[i]!
    if (f.active && (f.t += dt) >= f.life) f.active = false
  }
}

/** Free slot, else the one closest to its end (never allocates). */
const oldest = <T extends { active: boolean; t: number; life: number }>(pool: readonly T[]): T => {
  let best = pool[0]!
  let bestU = -1
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i]!
    if (!p.active) return p
    const u = p.t / p.life
    if (u > bestU) {
      bestU = u
      best = p
    }
  }
  return best
}

const spawnNova = (fx: BossTraitVfx, ev: Readonly<BossTraitEvent>): void => {
  const n = oldest(fx.novas)
  n.active = true
  n.x = ev.x
  n.y = ev.y
  n.r0 = ev.radius
  // A victim centre within EMBER_RADIUS_MUL × r + its own radius is hit; the
  // ring stops a typical victim radius past the carrier-relative reach.
  n.r1 = BOSS_TRAIT_TUNING.EMBER_RADIUS_MUL * ev.radius + 18
  n.t = 0
  n.life = NOVA_LIFE_MS
}

const spawnShards = (
  fx: BossTraitVfx, ev: Readonly<BossTraitEvent>, count: number, speed: number, len: number
): void => {
  const a0 = Math.random() * TAU // vfx-rng
  for (let k = 0; k < count; k++) {
    const s = oldest(fx.shards)
    const a = a0 + (k / count) * TAU + (Math.random() - 0.5) * 0.6
    s.active = true
    s.cx = ev.x
    s.cy = ev.y
    s.r0 = ev.radius + 2
    s.dx = Math.cos(a)
    s.dy = Math.sin(a)
    s.speed = speed * (0.75 + Math.random() * 0.5) // px per ms
    s.len = len
    s.t = 0
    s.life = SHARD_LIFE_MS
  }
}

const spawnEmbers = (fx: BossTraitVfx, ev: Readonly<BossTraitEvent>): void => {
  for (let k = 0; k < EMBERS_PER_BURN; k++) {
    const e = oldest(fx.embers)
    const a = (Math.random() - 0.5) * 1.8 - Math.PI / 2 // mostly upward
    e.active = true
    e.x = ev.x + (Math.random() - 0.5) * ev.radius * 1.2
    e.y = ev.y + (Math.random() - 0.3) * ev.radius * 0.8
    const sp = 0.035 + Math.random() * 0.03
    e.vx = Math.cos(a) * sp
    e.vy = Math.sin(a) * sp
    e.t = 0
    e.life = EMBER_LIFE_MS * (0.7 + Math.random() * 0.3)
  }
}

const spawnFade = (fx: BossTraitVfx, ev: Readonly<BossTraitEvent>): void => {
  const f = oldest(fx.fades)
  f.active = true
  f.x = ev.x
  f.y = ev.y
  f.r = ev.radius + 2
  f.t = 0
  f.life = FADE_LIFE_MS
}

const noteFreeze = (fx: BossTraitVfx, id: number, t: number): void => {
  let slot = -1
  let oldestT = Infinity
  for (let i = 0; i < FREEZE_SLOTS; i++) {
    if (fx.freezeId[i] === id) {
      slot = i
      break
    }
    const at = fx.freezeId[i] === -1 ? -Infinity : fx.freezeAt[i]!
    if (at < oldestT) {
      oldestT = at
      slot = i
    }
  }
  fx.freezeId[slot] = id
  fx.freezeAt[slot] = t
}

const clearFreeze = (fx: BossTraitVfx, id: number): void => {
  for (let i = 0; i < FREEZE_SLOTS; i++) if (fx.freezeId[i] === id) fx.freezeId[i] = -1
}

/** Every trait event as it happens: spawn pooled effects, play SFX
 *  (boss-ember-pulse / boss-freeze / boss-crack / boss-chill, ≤ 1 per 400 ms each). */
export function bossTraitVfxEvent(fx: BossTraitVfx, ev: Readonly<BossTraitEvent>, low: boolean): void {
  switch (ev.kind) {
    case 'nova':
      spawnNova(fx, ev)
      playBossSfx('boss-ember-pulse', 0.022)
      break
    case 'burn':
      // The engine lights the painted flame strip + the orange number.
      if (!low) spawnEmbers(fx, ev)
      break
    case 'frost_touch':
      // The clash sound covers the touch.
      if (!low) spawnShards(fx, ev, SHARDS_PER_BURST, 0.06, 5)
      break
    case 'freeze':
      noteFreeze(fx, ev.bladeId, ev.t)
      playBossSfx('boss-freeze', 0.022)
      break
    case 'freeze_crack':
      if (!low) spawnShards(fx, ev, SHARDS_PER_BURST, 0.1, 7)
      playBossSfx('boss-crack', 0.02)
      break
    case 'thaw':
      clearFreeze(fx, ev.bladeId)
      if (!low) spawnShards(fx, ev, SHARDS_PER_BURST, 0.085, 7)
      playBossSfx('boss-crack', ev.value === 1 ? 0.02 : 0.014)
      break
    case 'chill':
      if (!low) spawnShards(fx, ev, SHARDS_PER_CHILL, 0.045, 4)
      playBossSfx('boss-chill', 0.018)
      break
    case 'chill_fade':
      if (!low) spawnFade(fx, ev)
      break
    default:
      break
  }
}

// ─── Colours (module constants — never built per frame) ────────────────────

const C_EMBER_ARC = '#ffb347'
const C_EMBER_ARC_HOT = '#ffe08a'
const C_EMBER_REACH = '#ff7a2a'
const C_NOVA = '#ff8a2a'
const C_NOVA_INNER = '#ffd27a'
const C_EMBER = '#ffb04a'
const C_ICE = '#bfe9ff'
const C_ICE_SHARD = '#e0f6ff'
const C_CHILL = '#aee6ff'

const TAU = Math.PI * 2
const easeOut = (u: number): number => 1 - (1 - u) * (1 - u)

// ─── Call site 2 — carrier aura ────────────────────────────────────────────

/** Call site 2 — carrier aura under the blade (cached sprite; none on low). */
export function renderBossAura(
  ctx: CanvasRenderingContext2D, fx: BossTraitVfx, carrier: Readonly<BossTraitVfxBlade>, now: number, low: boolean
): void {
  const trait = carrier.config.bossTrait
  if (low || !fx.prepared || trait === undefined || carrier.hp <= 0) return
  const i = TRAIT_INDEX[trait]
  const sprite = auraSprites[i]
  if (sprite === undefined || sprite === null) return
  const R = i === 0 ? BOSS_TRAIT_TUNING.EMBER_RADIUS_MUL * carrier.radius + 10 : AURA_MUL[i]! * carrier.radius
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * (0.7 + 0.2 * Math.sin(now * 0.004 + i * 2.1))
  ctx.drawImage(sprite as CanvasImageSource, carrier.x - R, carrier.y - R, R * 2, R * 2)
  ctx.globalAlpha = prev
}

// ─── Call site 3 — per carrier / frozen / chilled blade ────────────────────

/**
 * Call site 3 — Ember telegraph on a living ember carrier: arc on the rim,
 * sweep = `charge` (0…1 of the combat clock toward the next nova), thicker
 * in the last 300 ms (`charge ≥ 1 − 300 / period`). `reach` = the nova's
 * reach from the carrier centre minus the victim radius (EMBER_RADIUS_MUL ×
 * carrier.radius), for drawing the danger ring while it charges.
 * Both tiers: 1 arc stroke + (from a third of the charge on) 1 reach stroke.
 */
export function renderEmberCharge(
  ctx: CanvasRenderingContext2D, _fx: BossTraitVfx, carrier: Readonly<BossTraitVfxBlade>,
  charge: number, periodMs: number, reach: number, now: number, _low: boolean
): void {
  if (carrier.hp <= 0 || !(charge > 0)) return
  const c = charge >= 1 ? 1 : charge
  const hot = c >= 1 - EMBER_CHARGE_WARN_MS / (periodMs > 0 ? periodMs : 2000)
  ctx.save()
  ctx.lineCap = 'round'
  if (c > 0.34) {
    ctx.beginPath()
    ctx.arc(carrier.x, carrier.y, reach, 0, TAU)
    const k = (c - 0.34) / 0.66
    ctx.globalAlpha = hot ? 0.45 + 0.25 * Math.sin(now * 0.05) : 0.08 + 0.3 * k * k
    ctx.lineWidth = hot ? 2.5 : 1.5
    ctx.strokeStyle = C_EMBER_REACH
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(carrier.x, carrier.y, carrier.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * c)
  ctx.globalAlpha = 0.95
  ctx.lineWidth = hot ? 5 : 3
  ctx.strokeStyle = hot ? C_EMBER_ARC_HOT : C_EMBER_ARC
  ctx.stroke()
  ctx.restore()
}

/** Call site 3 — ice shell over a blade frozen for its team's next turn
 *  (cached sprite at 0.85 α, forming over 160 ms; low: one stroked hexagon). */
export function renderIceShell(
  ctx: CanvasRenderingContext2D, fx: BossTraitVfx, blade: Readonly<BossTraitVfxBlade>, now: number, low: boolean
): void {
  if (blade.hp <= 0) return
  const hit = low ? null : shellFor(blade.radius)
  if (hit === null) {
    ctx.save()
    ctx.beginPath()
    hexPath(ctx, blade.x, blade.y, blade.radius + SHELL_PAD, -Math.PI / 2)
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C_ICE
    ctx.stroke()
    ctx.restore()
    return
  }
  // Formation: scale 1.15 → 1 and fade in over FREEZE_FORM_MS.
  let u = 1
  for (let i = 0; i < FREEZE_SLOTS; i++) {
    if (fx.freezeId[i] === blade.id) {
      const age = now - fx.freezeAt[i]!
      u = age >= FREEZE_FORM_MS ? 1 : age <= 0 ? 0 : age / FREEZE_FORM_MS
      break
    }
  }
  const k = (blade.radius / hit.r) * (1 + 0.15 * (1 - u))
  const half = (hit.r + SHELL_PAD + 4) * k
  const prev = ctx.globalAlpha
  ctx.globalAlpha = prev * 0.85 * (0.25 + 0.75 * u)
  ctx.drawImage(hit.sprite as CanvasImageSource, blade.x - half, blade.y - half, half * 2, half * 2)
  ctx.globalAlpha = prev
}

/** Call site 3 — frost rim on a chilled blade, width 1.5 + `stacks` px
 *  (`stacks` 1…CHILL_MAX live chill stacks). High tier adds 2 frost spikes
 *  per stack to the same path (still 1 stroke). */
export function renderChillOverlay(
  ctx: CanvasRenderingContext2D, _fx: BossTraitVfx, blade: Readonly<BossTraitVfxBlade>,
  stacks: number, now: number, low: boolean
): void {
  if (blade.hp <= 0 || !(stacks > 0)) return
  const s = stacks > 5 ? 5 : stacks
  const R = blade.radius + 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(blade.x, blade.y, R, 0, TAU)
  if (!low) {
    const n = s * 2
    const rot = now * 0.0006
    const L = 3 + s * 1.2
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * TAU
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      ctx.moveTo(blade.x + ca * R, blade.y + sa * R)
      ctx.lineTo(blade.x + ca * (R + L), blade.y + sa * (R + L))
    }
  }
  ctx.globalAlpha = 0.55 + 0.06 * s
  ctx.lineWidth = 1.5 + s
  ctx.lineCap = 'round'
  ctx.strokeStyle = C_CHILL
  ctx.stroke()
  ctx.restore()
}

// ─── Call site 4 — pooled transients ───────────────────────────────────────

const anyActive = (fx: BossTraitVfx): boolean => {
  for (let i = 0; i < fx.novas.length; i++) if (fx.novas[i]!.active) return true
  for (let i = 0; i < fx.shards.length; i++) if (fx.shards[i]!.active) return true
  for (let i = 0; i < fx.embers.length; i++) if (fx.embers[i]!.active) return true
  for (let i = 0; i < fx.fades.length; i++) if (fx.fades[i]!.active) return true
  return false
}

/** Call site 4 — transient pooled effects: nova burst rings (from the
 *  'nova' events), frost-touch / crack / thaw / chill shards, burn embers,
 *  chill-fade rims. ≤ BOSS_LAYER_MAX_PRIMITIVES (low: ≤ 3). */
export function renderBossTraitLayer(
  ctx: CanvasRenderingContext2D, fx: BossTraitVfx, _now: number, low: boolean
): void {
  if (!anyActive(fx)) return
  ctx.save()
  ctx.lineCap = 'round'
  // Novas: outer ring expanding from the carrier rim to the reach (+ a faint
  // inner ring on high).
  for (let i = 0; i < fx.novas.length; i++) {
    const n = fx.novas[i]!
    if (!n.active) continue
    const u = n.t >= n.life ? 1 : n.t / n.life
    const fade = 1 - u
    const rr = n.r0 + (n.r1 - n.r0) * easeOut(u)
    ctx.beginPath()
    ctx.arc(n.x, n.y, rr, 0, TAU)
    ctx.globalAlpha = 0.9 * fade
    ctx.lineWidth = 2 + 6 * fade
    ctx.strokeStyle = C_NOVA
    ctx.stroke()
    if (!low) {
      ctx.beginPath()
      ctx.arc(n.x, n.y, rr * 0.78, 0, TAU)
      ctx.globalAlpha = 0.45 * fade
      ctx.lineWidth = 1 + 3 * fade
      ctx.strokeStyle = C_NOVA_INNER
      ctx.stroke()
    }
  }
  if (!low) {
    // Ice shards → one stroke.
    let any = false
    for (let i = 0; i < fx.shards.length; i++) {
      const s = fx.shards[i]!
      if (!s.active) continue
      if (!any) {
        ctx.beginPath()
        any = true
      }
      const d = s.r0 + s.speed * s.t
      const len = s.len * (1 - s.t / s.life) + 2
      ctx.moveTo(s.cx + s.dx * d, s.cy + s.dy * d)
      ctx.lineTo(s.cx + s.dx * (d + len), s.cy + s.dy * (d + len))
    }
    if (any) {
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 2
      ctx.strokeStyle = C_ICE_SHARD
      ctx.stroke()
    }
    // Embers → one stroke (short streaks along their motion).
    any = false
    for (let i = 0; i < fx.embers.length; i++) {
      const e = fx.embers[i]!
      if (!e.active) continue
      if (!any) {
        ctx.beginPath()
        any = true
      }
      const x = e.x + e.vx * e.t
      const y = e.y + e.vy * e.t
      ctx.moveTo(x, y)
      ctx.lineTo(x - e.vx * 120, y - e.vy * 120)
    }
    if (any) {
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 3
      ctx.strokeStyle = C_EMBER
      ctx.stroke()
    }
    // Chill-fade rims: the frost lets go outward.
    for (let i = 0; i < fx.fades.length; i++) {
      const f = fx.fades[i]!
      if (!f.active) continue
      const u = f.t >= f.life ? 1 : f.t / f.life
      ctx.beginPath()
      ctx.arc(f.x, f.y, f.r + 9 * easeOut(u), 0, TAU)
      ctx.globalAlpha = 0.8 * (1 - u)
      ctx.lineWidth = 3 * (1 - u) + 1
      ctx.strokeStyle = C_CHILL
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ─── Popup glyphs (damage-number pool, §7.3 "chill popup") ─────────────────

/** Boss-trait glyphs a damage-number popup can carry (next to SkillId glyphs). */
export type BossTraitGlyph = 'snowflake'

export const isBossTraitGlyph = (g: unknown): g is BossTraitGlyph => g === 'snowflake'

let snowflake: Path2D | null | undefined

/** Six-armed snowflake in a 24×24 box, built once (stroked, not filled). */
const snowflakePath = (): Path2D | null => {
  if (snowflake !== undefined) return snowflake
  if (typeof Path2D === 'undefined') {
    snowflake = null
    return snowflake
  }
  const p = new Path2D()
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU - Math.PI / 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    p.moveTo(12, 12)
    p.lineTo(12 + ca * 10, 12 + sa * 10)
    // Two branches 6 units out, ±45°.
    const bx = 12 + ca * 6
    const by = 12 + sa * 6
    for (let s = -1; s <= 1; s += 2) {
      const b = a + s * 0.8
      p.moveTo(bx, by)
      p.lineTo(bx + Math.cos(b) * 3.6, by + Math.sin(b) * 3.6)
    }
  }
  snowflake = p
  return snowflake
}

/**
 * A boss-trait popup glyph centred on (x, y), drawn by the engine's
 * renderDamageNumbers (the context carries the popup's globalAlpha). Dark
 * ink stroke under the colour stroke so it reads on every floor
 * (2 primitives, like drawSkillGlyph).
 */
export function drawBossTraitGlyph(
  ctx: CanvasRenderingContext2D,
  _glyph: BossTraitGlyph,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const p = snowflakePath()
  ctx.save()
  if (p === null) {
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
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 5
  ctx.strokeStyle = C_GLYPH_INK
  ctx.stroke(p)
  ctx.lineWidth = 2.4
  ctx.strokeStyle = color
  ctx.stroke(p)
  ctx.restore()
}

const C_GLYPH_INK = '#000000'

// ─── Test hooks ────────────────────────────────────────────────────────────

/** Tests / QA: the cached snowflake Path2D (builds it on first call). */
export const __snowflakePath = snowflakePath

/** Tests: drop the module sprite caches (auras, ice shells, glyph path). */
export function __resetBossTraitSprites(): void {
  auraSprites[0] = auraSprites[1] = auraSprites[2] = undefined
  shellSprites.length = 0
  shellCount = 0
  snowflake = undefined
}

/** Tests / QA: number of baked ice shells (≤ ICE_SHELL_CACHE_SIZE). */
export const __iceShellCount = (): number => shellCount
