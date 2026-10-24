// Team-tower hit VFX (purely visual — never physics, never gameplayRand,
// never in the PvP state hash):
//   • a wood-splinter burst at the impact point on every damaging hit —
//     light wood chips + dark bark flecks arcing with gravity in the 3/4 view
//     (a fake height z drawn as y − z), a couple of flat sawdust discs and a
//     thin "thunk" ring;
//   • a leaf cascade from the crown's top whenever a tower's damage state
//     drops (healthy → damaged → nearly down → felled; the felled one is the
//     biggest), plus a few leaves on hard hits now and then;
//   • thorn shards when a SPIKED tree pricks its attacker (towerThorns /
//     TOWER_SPIKE_RECOIL): a few cream thorn tips snapping off the garland
//     towards the smasher that hit it.
// Flat fills + the game's dark outline, no blur / gradient / glow. One fixed
// pool, allocated once: spawning past the cap is dropped, finished particles
// are swap-removed and reused, nothing allocates per frame.
// Painted: chips, bark flecks, sawdust puffs and leaves draw one Art Desk
// sprite each (@/use/towerHitFxArt — variant picked from the particle's spawn
// pool slot) once the atlas has loaded; the procedural shapes below are the
// fallback (before the load, `?art=procedural`, past the atlas resolution).
// The impact ring and thorn shards stay procedural.
import { HIT_FX_MAX_UPSCALE, HIT_FX_PUFF_W, drawHitFxSprite, hitFxAtlas, hitFxSprites, pickHitFxSprite, preloadHitFxArt } from '@/use/towerHitFxArt'

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export const FxKind = { Chip: 0, Bark: 1, Dust: 2, Ring: 3, Leaf: 4, Thorn: 5 } as const
export type FxKind = typeof FxKind[keyof typeof FxKind]

export interface FxParticle {
  kind: FxKind
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  rot: number; vr: number
  size: number
  life: number; maxLife: number
  color: string
  /** Painted sprite variant: the pool slot it spawned in (leaves: slot × 2 +
   *  1 when yellowing). Purely visual, deterministic, no RNG. */
  v: number
  /** Leaf: sway phase; ground y it lands on. */
  phase: number; groundY: number
}

export interface TowerFx {
  readonly pool: FxParticle[]
  /** Active particles are pool[0 .. active-1]. */
  active: number
  cap: number
  /** Last seen damage stage per tower index (-1 = not seen yet). */
  readonly stages: number[]
}

const OUTLINE = '#2b1a10'
const WOOD = ['#e8c48a', '#d9a866', '#f2dcae'] as const
const BARK = ['#6b4226', '#4f2f1a'] as const
const DUST = '#f1e2c0'
const RING = '#fff4dc'
// Painted crowns are greens; later states add yellowing leaves.
const LEAF_GREEN = ['#5fae4e', '#3f8a3c', '#7cc35e'] as const
const LEAF_YELLOW = ['#d9c24a', '#c99a3a'] as const
// Thorn shards: the garland's cream tips + a dark vine fleck.
const THORN = ['#f2e6c8', '#c9ae84', '#5e3b22'] as const

export const TOWER_FX_CAP = 120
const GRAVITY = 0.0016 // arena units / ms², scaled by the tower radius / 40

export const createTowerFx = (cap = TOWER_FX_CAP): TowerFx => {
  const pool: FxParticle[] = []
  for (let i = 0; i < TOWER_FX_CAP; i++) {
    pool.push({ kind: FxKind.Chip, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vr: 0, size: 0, life: 0, maxLife: 1, color: WOOD[0], v: 0, phase: 0, groundY: 0 })
  }
  preloadHitFxArt()
  return { pool, active: 0, cap: Math.min(cap, TOWER_FX_CAP), stages: [] }
}

export const resetTowerFx = (fx: TowerFx) => {
  fx.active = 0
  fx.stages.length = 0
}

/** Next free particle, or null at the cap (the spawn is dropped). */
const take = (fx: TowerFx): FxParticle | null => (fx.active < fx.cap ? fx.pool[fx.active++]! : null)

type Rand = () => number
const defaultRand: Rand = () => Math.random() // vfx-rng

/** Splinter count for a hit of `dmg` (capped). */
export const splinterCount = (dmg: number): number => Math.max(5, Math.min(16, Math.round(5 + dmg * 0.5)))

/**
 * Wood-splinter burst at impact point (x, y) on the tower's edge; (nx, ny) is
 * the unit normal pointing at the attacker. `r` = tower radius (scale).
 */
export const spawnSplinters = (fx: TowerFx, x: number, y: number, nx: number, ny: number, r: number, dmg: number, rand: Rand = defaultRand) => {
  const s = r / 20
  const z0 = r * 0.35
  const n = splinterCount(dmg)
  const base = Math.atan2(ny, nx)
  for (let i = 0; i < n; i++) {
    const p = take(fx)
    if (!p) return
    const bark = i % 3 === 2
    const a = base + (rand() - 0.5) * 2.0
    const sp = (0.09 + rand() * 0.14) * s
    p.kind = bark ? FxKind.Bark : FxKind.Chip
    p.x = x; p.y = y; p.z = z0
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp
    p.vz = (0.12 + rand() * 0.16) * s
    p.rot = rand() * Math.PI * 2
    p.vr = (rand() - 0.5) * 0.05
    p.size = (bark ? 3 + rand() * 2.5 : 4 + rand() * 4) * s
    p.maxLife = p.life = 400 + rand() * 300
    p.color = bark ? BARK[i % BARK.length]! : WOOD[i % WOOD.length]!
    p.v = fx.active - 1
    p.phase = 0; p.groundY = y
  }
  for (let i = 0; i < 2; i++) {
    const p = take(fx)
    if (!p) return
    const a = base + (rand() - 0.5) * 1.2
    p.kind = FxKind.Dust
    p.x = x + Math.cos(a) * r * 0.15; p.y = y + Math.sin(a) * r * 0.15; p.z = z0 * 0.6
    p.vx = Math.cos(a) * 0.03 * s; p.vy = Math.sin(a) * 0.03 * s; p.vz = 0.01 * s
    p.rot = 0; p.vr = 0
    p.size = (5 + rand() * 3) * s
    p.maxLife = p.life = 380 + rand() * 120
    p.color = DUST; p.v = fx.active - 1; p.phase = 0; p.groundY = y
  }
  const ring = take(fx)
  if (!ring) return
  ring.kind = FxKind.Ring
  ring.x = x; ring.y = y; ring.z = z0 * 0.5
  ring.vx = ring.vy = ring.vz = 0; ring.rot = 0; ring.vr = 0
  ring.size = r * 0.45
  ring.maxLife = ring.life = 220
  ring.color = RING; ring.phase = 0; ring.groundY = y
}

/** Thorn shards for a spike recoil of `recoil` HP (capped). */
export const thornShardCount = (recoil: number): number => Math.max(3, Math.min(7, Math.round(3 + recoil * 0.4)))

/**
 * A few thorn tips snapping off a spiked tree's garland at (x, y) on its edge,
 * flying out along (nx, ny) — the unit normal pointing at the attacker.
 * `r` = tower radius (scale).
 */
export const spawnThornShards = (fx: TowerFx, x: number, y: number, nx: number, ny: number, r: number, recoil: number, rand: Rand = defaultRand) => {
  const s = r / 20
  const z0 = r * 0.3
  const n = thornShardCount(recoil)
  const base = Math.atan2(ny, nx)
  for (let i = 0; i < n; i++) {
    const p = take(fx)
    if (!p) return
    const a = base + (rand() - 0.5) * 1.3
    const sp = (0.12 + rand() * 0.12) * s
    p.kind = FxKind.Thorn
    p.x = x; p.y = y; p.z = z0
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp
    p.vz = (0.1 + rand() * 0.12) * s
    // Spin starts pointing along the flight (a tip flying off point-first).
    p.rot = a + (rand() - 0.5) * 0.6
    p.vr = (rand() - 0.5) * 0.03
    p.size = (4.5 + rand() * 2.5) * s
    p.maxLife = p.life = 380 + rand() * 220
    p.color = THORN[i % THORN.length]!
    p.phase = 0; p.groundY = y
  }
}

/** Leaves in a damage-state cascade: bigger the further down, biggest felled. */
export const leafCascadeCount = (stage: number): number => (stage >= 3 ? 26 : stage === 2 ? 14 : 9)

/**
 * `count` leaves detaching from the crown top of the tower centred at (x, y)
 * and fluttering down to the ground plane around its base. `yellow` = share
 * of yellowing leaves.
 */
export const spawnLeaves = (fx: TowerFx, x: number, y: number, r: number, count: number, yellow: number, rand: Rand = defaultRand) => {
  const s = r / 20
  const topY = y - r * 1.25
  const groundY = y + r * 1.15
  for (let i = 0; i < count; i++) {
    const p = take(fx)
    if (!p) return
    p.kind = FxKind.Leaf
    p.x = x + (rand() - 0.5) * r * 1.8
    // Fake height: start at the crown, z runs down to 0 at the ground line.
    p.groundY = groundY + (rand() - 0.5) * r * 0.5
    p.y = p.groundY
    p.z = (p.groundY - topY) - rand() * r * 0.5
    p.vx = (rand() - 0.5) * 0.04 * s
    p.vy = 0
    p.vz = -(0.05 + rand() * 0.04) * s // steady flutter fall
    p.rot = rand() * Math.PI * 2
    p.vr = (rand() - 0.5) * 0.006
    p.size = (2.5 + rand() * 1.5) * s // owner: leaves at half the first size
    p.phase = rand() * Math.PI * 2
    p.maxLife = p.life = 1500 + rand() * 700 // fall + rest on the ground + fade
    const yel = rand() < yellow
    p.color = yel ? LEAF_YELLOW[i % LEAF_YELLOW.length]! : LEAF_GREEN[i % LEAF_GREEN.length]!
    p.v = (fx.active - 1) * 2 + (yel ? 1 : 0)
  }
}

/**
 * Damage-stage watch for tower `i`: returns the cascade size when the stage
 * DROPS since the last call (0 otherwise). The first call only records the
 * baseline, so a match that starts damaged / a reset does not fire.
 */
export const noteTowerStage = (fx: TowerFx, i: number, stage: number): number => {
  while (fx.stages.length <= i) fx.stages.push(-1)
  const prev = fx.stages[i]!
  fx.stages[i] = stage
  if (prev < 0 || stage <= prev) return 0
  return leafCascadeCount(stage)
}

/** Advance every particle by `dt` ms; finished ones are recycled. */
export const tickTowerFx = (fx: TowerFx, dt: number) => {
  const pool = fx.pool
  for (let i = fx.active - 1; i >= 0; i--) {
    const p = pool[i]!
    p.life -= dt
    if (p.life <= 0) {
      // Swap-remove: the last active particle takes this slot.
      const last = --fx.active
      if (i !== last) { pool[i] = pool[last]!; pool[last] = p }
      continue
    }
    if (p.kind === FxKind.Leaf) {
      if (p.z > 0) {
        p.phase += dt * 0.006
        p.x += (p.vx + Math.cos(p.phase) * 0.035) * dt
        p.z = Math.max(0, p.z + p.vz * dt)
        p.rot += p.vr * dt + Math.cos(p.phase) * 0.02
      }
      continue
    }
    if (p.kind === FxKind.Ring) continue
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.kind === FxKind.Dust) { p.z += p.vz * dt; continue }
    p.vz -= GRAVITY * dt
    p.z += p.vz * dt
    if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5 }
    p.rot += p.vr * dt
  }
}

/** Draw every particle (caller has the arena transform). */
export const drawTowerFx = (ctx: Ctx, fx: TowerFx) => {
  if (fx.active === 0) return
  // Painted sprites when the atlas is in (device scale read once per frame).
  const img = hitFxAtlas()
  const art = img ? hitFxSprites : null
  let dev = 1
  if (art) {
    const t = ctx.getTransform()
    dev = Math.hypot(t.a, t.b) || 1
  }
  ctx.save()
  ctx.strokeStyle = OUTLINE
  ctx.lineJoin = 'round'
  for (let i = 0; i < fx.active; i++) {
    const p = fx.pool[i]!
    const k = p.life / p.maxLife // 1 → 0
    const sy = p.y - p.z
    if (p.kind === FxKind.Ring) {
      const rr = p.size * (1.6 - k * 0.9)
      ctx.globalAlpha = k
      ctx.lineWidth = 2.2 * k + 0.6
      ctx.strokeStyle = RING
      ctx.beginPath(); ctx.arc(p.x, sy, rr, 0, Math.PI * 2); ctx.stroke()
      ctx.strokeStyle = OUTLINE
      continue
    }
    if (p.kind === FxKind.Dust) {
      ctx.globalAlpha = 0.85 * k
      const sp = art ? pickHitFxSprite(art.dust, p.v) : null
      if (sp && drawHitFxSprite(ctx, img!, sp, p.x, sy, HIT_FX_PUFF_W * 2 * p.size * (1.5 - k * 0.6), dev)) continue
      ctx.fillStyle = p.color
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(p.x, sy, p.size * (1.5 - k * 0.6), p.size * (1.5 - k * 0.6) * 0.6, 0, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
      continue
    }
    if (p.kind === FxKind.Leaf) {
      // Fade only in the last third (after it has settled on the ground).
      ctx.globalAlpha = Math.min(1, k * 3)
      const L = p.size
      const c = Math.cos(p.rot), sn = Math.sin(p.rot)
      // Flip-flutter: squash the width with the sway for a turning leaf.
      const w = L * 0.45 * (0.35 + 0.65 * Math.abs(Math.cos(p.phase)))
      ctx.save()
      ctx.transform(c, sn, -sn, c, p.x, sy)
      const sp = art ? pickHitFxSprite((p.v & 1) === 1 ? art.leafYellow : art.leaf, p.v >> 1) : null
      if (sp && 2 * L * dev <= sp.w * HIT_FX_MAX_UPSCALE) {
        // Painted leaf: the flutter squashes (and turns over) its width.
        const f = Math.cos(p.phase)
        ctx.scale(1, (f < 0 ? -1 : 1) * (0.35 + 0.65 * Math.abs(f)))
        drawHitFxSprite(ctx, img!, sp, 0, 0, 2 * L, dev)
        ctx.restore()
        continue
      }
      ctx.fillStyle = p.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-L, 0)
      ctx.quadraticCurveTo(0, -w * 2, L, 0)
      ctx.quadraticCurveTo(0, w * 2, -L, 0)
      ctx.closePath()
      ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-L * 0.8, 0); ctx.lineTo(L * 0.8, 0); ctx.stroke()
      ctx.restore()
      continue
    }
    if (p.kind === FxKind.Thorn) {
      // Thorn tip: a slim flat triangle, point first, shrinking out.
      const sc = 0.45 + 0.55 * k
      ctx.globalAlpha = Math.min(1, k * 2)
      const L = p.size * sc
      const W = p.size * sc * 0.26
      const c = Math.cos(p.rot), sn = Math.sin(p.rot)
      ctx.save()
      ctx.transform(c, sn, -sn, c, p.x, sy)
      ctx.fillStyle = p.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(L * 0.6, 0)
      ctx.lineTo(-L * 0.4, -W)
      ctx.lineTo(-L * 0.4, W)
      ctx.closePath()
      ctx.fill(); ctx.stroke()
      ctx.restore()
      continue
    }
    // Chip / bark fleck: a spinning splinter that shrinks out.
    const sc = 0.4 + 0.6 * k
    ctx.globalAlpha = Math.min(1, k * 2)
    const L = p.size * sc
    const W = (p.kind === FxKind.Bark ? 0.55 : 0.3) * p.size * sc
    const c = Math.cos(p.rot), sn = Math.sin(p.rot)
    ctx.save()
    ctx.transform(c, sn, -sn, c, p.x, sy)
    const sp = art ? pickHitFxSprite(p.kind === FxKind.Bark ? art.bark : art.chip, p.v) : null
    if (sp && drawHitFxSprite(ctx, img!, sp, 0, 0, L, dev)) { ctx.restore(); continue }
    ctx.fillStyle = p.color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-L * 0.5, -W * 0.3)
    ctx.lineTo(L * 0.5, -W * 0.5)
    ctx.lineTo(L * 0.35, W * 0.5)
    ctx.lineTo(-L * 0.5, W * 0.35)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}
