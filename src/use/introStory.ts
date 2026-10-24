// ─── First-launch intro: the story (pure) ───────────────────────────────────
//
// The whole film as DATA and pure functions of director time T (seconds):
// the beats, the camera, where every smasher and both trees are, and the
// timed events the VFX pools and the sound play. No DOM, no Vue, no
// Math.random. Same T → same frame, at any frame rate (the renderer steps its
// particle pools on a fixed clock from these events — introRender.ts).
//
// Storyboard (art-sheets/intro/STORYBOARD.md, the #Intro1 design pass):
//   1  0.0  cosy forest      — the empty clearing; the canopy parts, leaves drift
//   2  2.6  trees face off   — the red tree, then the blue tree, pop up; thorns
//   3  5.4  smashers spin up — five smashers drop onto their discs
//   4  7.6  three skills     — Bear Hug, Thorn Volley, Log Slam (one at a time)
//   5 11.85 the smash        — Log Slam fells the red tree
//   6 13.0  title + climb    — iris → logo → the stage trail → hand-off
//
// World units = the game's arena units (radius 200, y down; the enemy tree at
// the top wall, the player's at the bottom), stage 1's clearing: meadow,
// terrain layout 0 (Mossy Glade, a clover clearing).

import type { SmasherId } from '@/data/smasherCatalog'
import type { SkillId } from '@/types/skills'
import { towerPosition } from '@/use/arenaTerrain'
import type { ArenaShape } from '@/use/arenaShapes'

// ─── Beats ──────────────────────────────────────────────────────────────────

export const BEAT = {
  /** 1 — the canopy parts, the camera sinks into the clearing. */
  establish: 0,
  /** 2 — the red tree pops up out of the ground. */
  redTree: 2.6,
  blueTree: 3.25,
  thorns: 3.9,
  /** Caption "Smash their tree!". */
  captionTree: 4.0,
  captionTreeEnd: 5.3,
  gauges: 4.2,
  /** 3 — drops. */
  spinUp: 5.4,
  /** 4 — skills. */
  skill1: 7.6,
  skill2: 9.0,
  skill3: 10.5,
  /** 5 — Chomper launches, slow-mo window, impact. */
  launch: 11.1,
  slowFrom: 11.45,
  impact: 11.85,
  /** 6 — the iris closes on the felled tree, the title card, the trail,
   *  the hand-off to the live arena, the end. */
  iris: 13.0,
  title: 13.45,
  trail: 14.5,
  handoff: 15.3,
  end: 16.1
} as const

/** When Skip appears (and Esc works). */
export const SKIP_APPEARS_T = 1.0
/** A skip fades the whole intro out over this long. */
export const SKIP_FADE_S = 0.35
/** The live arena starts drawing again under the (opaque) title card this
 *  early, so its first bake never lands on the hand-off frame. */
export const REVEAL_ARENA_T = BEAT.title + 1.15
/** Iris duration. */
export const IRIS_S = BEAT.title - BEAT.iris

export const SEED = 16_052

// ─── The arena ──────────────────────────────────────────────────────────────

export const ARENA_R = 200
export const ARENA_PADDING = 76
export const LAYOUT_ID = 0
export const SHAPE: ArenaShape = 'clover'
/** Team tree radius (the game's round(28 × TOWER_RADIUS_MUL)). */
export const TREE_R = 38
/** Smasher disc radius — a touch above a 3v3 match for readability. */
export const SMASHER_R = 23

const redPos = towerPosition('npc', ARENA_R, TREE_R, SHAPE)
const bluePos = towerPosition('player', ARENA_R, TREE_R, SHAPE)
export const TREES = {
  red: { side: 'npc' as const, x: redPos.x, y: redPos.y, r: TREE_R, popT: BEAT.redTree },
  blue: { side: 'player' as const, x: bluePos.x, y: bluePos.y, r: TREE_R, popT: BEAT.blueTree }
}

// ─── The cast ───────────────────────────────────────────────────────────────

export interface CastMember {
  id: number
  smasherId: SmasherId
  side: 'player' | 'npc'
  /** Drop-in time. */
  dropT: number
  /** Rest spot after the drop, then the formation spot (advance 7.0–7.6). */
  home: { x: number; y: number }
  formation: { x: number; y: number }
}

export const BRAMBLE = 0
export const GRIZZLE = 1
export const CHOMPER = 2
export const THUMPER = 3
export const VIXIE = 4

export const CAST: readonly CastMember[] = [
  { id: BRAMBLE, smasherId: 'bramble', side: 'player', dropT: 5.6, home: { x: 16, y: 82 }, formation: { x: 12, y: 60 } },
  { id: GRIZZLE, smasherId: 'grizzle', side: 'player', dropT: 5.85, home: { x: 82, y: 72 }, formation: { x: 76, y: 40 } },
  { id: CHOMPER, smasherId: 'chomper', side: 'player', dropT: 6.1, home: { x: -74, y: 80 }, formation: { x: -66, y: 88 } },
  { id: THUMPER, smasherId: 'thumper', side: 'npc', dropT: 6.3, home: { x: 54, y: -68 }, formation: { x: 44, y: -46 } },
  { id: VIXIE, smasherId: 'vixie', side: 'npc', dropT: 6.5, home: { x: -88, y: -72 }, formation: { x: -90, y: -86 } }
]

export const INTRO_SMASHER_IDS: readonly SmasherId[] = CAST.map(c => c.smasherId)

/** Team disc rims (the game's player / npc rims). */
export const RIM = { player: '#3f7fd8', npc: '#d8433f' } as const

// ─── The three skills (real smasher skills, src/data/smasherCatalog.ts) ─────

export interface SkillShowcase {
  /** Bearer. */
  cast: number
  /** Smasher skill id (i18n `smasher_skill_<key>`) + its engine effect. */
  key: string
  effect: SkillId
  /** Lower-third card on screen. */
  cardFrom: number
  cardTo: number
}

export const SHOWCASE: readonly SkillShowcase[] = [
  { cast: GRIZZLE, key: 'bear_hug', effect: 'guard_shell', cardFrom: 7.7, cardTo: 9.0 },
  { cast: BRAMBLE, key: 'thorn_volley', effect: 'homing_rockets', cardFrom: 9.05, cardTo: 10.45 },
  { cast: CHOMPER, key: 'log_slam', effect: 'tower_breaker', cardFrom: 10.5, cardTo: 12.7 }
]

/** Caption "Every smasher has skills!" — over the first card. */
export const CAPTION_SKILLS = { from: 7.6, to: 9.0 } as const

// ─── Easing kit ─────────────────────────────────────────────────────────────

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
export const ramp = (T: number, a: number, b: number): number => clamp01((T - a) / (b - a))
export const easeOutCubic = (u: number): number => 1 - Math.pow(1 - clamp01(u), 3)
export const easeInCubic = (u: number): number => Math.pow(clamp01(u), 3)
export const easeInOutCubic = (u: number): number => {
  const x = clamp01(u)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
export const easeOutBack = (u: number, k = 1.70158): number => {
  const x = clamp01(u) - 1
  return 1 + (k + 1) * x * x * x + k * x * x
}
/** 0 → 1 → 0: rises over [a, a+up], holds, falls over [b-down, b]. */
export const envelope = (T: number, a: number, up: number, b: number, down: number): number =>
  Math.min(ramp(T, a, a + up), 1 - ramp(T, b - down, b))
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u

// ─── Time warp: hit-stops + the slow-mo push into the tree ─────────────────
//
// FX time (what the particle pools and the action see) runs at `fxRate(T)`
// of director time: 0 inside a hit-stop, 0.35 in the slow-mo window.

export const HIT_STOPS: readonly { at: number; len: number }[] = [
  { at: 8.05, len: 0.08 },
  { at: BEAT.impact, len: 0.14 }
]
export const SLOW_RATE = 0.35

export const fxRate = (T: number): number => {
  for (const h of HIT_STOPS) if (T >= h.at && T < h.at + h.len) return 0
  if (T >= BEAT.slowFrom && T < BEAT.impact) return SLOW_RATE
  return 1
}

// ─── Camera ─────────────────────────────────────────────────────────────────
//
// Two zooms: WIDE (1 = the game's fit) and CLOSE (zc, chosen by the renderer
// from the art's resolution, ≤ 1.35). Every hold sits exactly on one of them,
// so the baked arena is drawn 1 : 1 there. `z` here is 0 = WIDE … 1 = CLOSE;
// the renderer maps it to the real zoom.

export interface CameraKey {
  T: number
  x: number
  y: number
  /** 0 = WIDE, 1 = CLOSE. */
  z: number
}

/** Hold-to-hold keys; between two keys the camera eases in-out. */
export const CAMERA_KEYS: readonly CameraKey[] = [
  { T: 0, x: 0, y: -120, z: 0 },
  { T: 2.6, x: 0, y: 0, z: 0 },
  // little nudges toward each tree as it pops (WIDE)
  { T: 2.95, x: 0, y: -16, z: 0 },
  { T: 3.25, x: 0, y: -16, z: 0 },
  { T: 3.6, x: 0, y: 14, z: 0 },
  { T: 4.1, x: 0, y: 0, z: 0 },
  { T: 5.4, x: 0, y: 0, z: 0 },
  // spin-up, close on the blue side
  { T: 6.1, x: 0, y: 70, z: 1 },
  { T: 7.0, x: 0, y: 70, z: 1 },
  // Bear Hug: Thumper → Grizzle
  { T: 7.6, x: 56, y: -6, z: 1 },
  { T: 9.0, x: 56, y: -6, z: 1 },
  // Thorn Volley: Bramble → Vixie + the red tree
  { T: 9.4, x: -36, y: -30, z: 1 },
  { T: 10.5, x: -36, y: -30, z: 1 },
  // Log Slam: Chomper's pull-back
  { T: 10.95, x: -48, y: 40, z: 1 }
]

/** The tracking shot of the launch and the final hold on the felled tree. */
const TRACK_FROM = BEAT.launch
const IMPACT_CAM = { x: -14, y: -112 }

export interface CameraState {
  x: number
  y: number
  /** 0 = WIDE … 1 = CLOSE. */
  z: number
  /** Extra zoom factor on top (the 0.96 → 1 push-in on the final hold). */
  push: number
  /** Screen shake in world units (renderer rounds to whole device px). */
  sx: number
  sy: number
}

const keyAt = (T: number, out: CameraState): void => {
  const k = CAMERA_KEYS
  if (T <= k[0]!.T) {
    out.x = k[0]!.x
    out.y = k[0]!.y
    out.z = k[0]!.z
    return
  }
  for (let i = 0; i + 1 < k.length; i++) {
    const a = k[i]!
    const b = k[i + 1]!
    if (T <= b.T) {
      const u = easeInOutCubic((T - a.T) / (b.T - a.T))
      out.x = lerp(a.x, b.x, u)
      out.y = lerp(a.y, b.y, u)
      out.z = lerp(a.z, b.z, u)
      return
    }
  }
  const l = k[k.length - 1]!
  out.x = l.x
  out.y = l.y
  out.z = l.z
}

/** Camera at T. `still` = reduced motion: WIDE at the centre, no shake. */
export const cameraAt = (T: number, out: CameraState, still = false): CameraState => {
  out.push = 1
  out.sx = 0
  out.sy = 0
  if (still) {
    out.x = 0
    out.y = 0
    out.z = 0
    return out
  }
  if (T < TRACK_FROM) {
    keyAt(T, out)
  } else {
    // Track Chomper's flight with a lag, land on the impact framing; then a
    // slow push-in (0.96 → 1 of CLOSE) on the hold.
    const last = CAMERA_KEYS[CAMERA_KEYS.length - 1]!
    const u = easeInOutCubic(ramp(T, TRACK_FROM, BEAT.impact + 0.05))
    out.x = lerp(last.x, IMPACT_CAM.x, u)
    out.y = lerp(last.y, IMPACT_CAM.y, u)
    out.z = 1
    out.push = T < BEAT.impact ? lerp(1, 0.96, easeOutCubic(ramp(T, TRACK_FROM, BEAT.impact))) : lerp(0.96, 1, easeInOutCubic(ramp(T, BEAT.impact + 0.3, BEAT.iris - 0.45)))
  }
  // One shake in the whole film: the impact (decaying, 2 cycles).
  const st = T - (BEAT.impact + 0.14)
  if (st >= 0 && st < 0.32) {
    const a = 7 * (1 - st / 0.32)
    out.sx = Math.sin(st * 70) * a
    out.sy = Math.cos(st * 55) * a * 0.6
  }
  return out
}

// ─── Trees ──────────────────────────────────────────────────────────────────

export const TREE_MAX_HP = 100
/** The third Thorn Volley rocket lands on the red tree. */
export const ROCKET_TREE_HIT_T = 9.63
export const ROCKET_TREE_DMG = 45
export const LOG_SLAM_BONUS = 38

export interface TreeState {
  /** Pop-up scale about the ground point (0 = not there yet). */
  grow: number
  /** Horizontal squash of the pop (sx, sy about the ground point). */
  sx: number
  sy: number
  alpha: number
  hp: number
  /** White hit flash 0..1. */
  flash: number
  /** Thorn garland grow-in 0..1 (red tree only). */
  thorns: number
  /** Gauge opacity. */
  gauge: number
  /** Whole-unit wobble on hits. */
  wob: number
}

const popScale = (T: number, t0: number): { s: number; sx: number; sy: number } => {
  const u = ramp(T, t0, t0 + 0.55)
  if (u <= 0) return { s: 0, sx: 1, sy: 1 }
  const s = easeOutBack(u, 2.2)
  // squash on the landing of the pop (wide + short), settle by the end
  const sq = Math.sin(Math.min(1, u * 1.6) * Math.PI) * 0.12 * (1 - u)
  return { s, sx: 1 + sq, sy: 1 - sq }
}

export const treeAt = (side: 'red' | 'blue', T: number, out: TreeState, still = false): TreeState => {
  const tr = TREES[side]
  if (still) {
    const a = ramp(T, tr.popT, tr.popT + 0.4)
    out.grow = a > 0 ? 1 : 0
    out.sx = 1
    out.sy = 1
    out.alpha = a
  } else {
    const p = popScale(T, tr.popT)
    out.grow = p.s
    out.sx = p.sx
    out.sy = p.sy
    out.alpha = p.s > 0 ? 1 : 0
  }
  out.gauge = ramp(T, BEAT.gauges, BEAT.gauges + 0.4) * (1 - ramp(T, BEAT.iris - 0.25, BEAT.iris))
  out.flash = 0
  out.wob = 0
  out.thorns = 0
  out.hp = TREE_MAX_HP
  if (side === 'red') {
    out.thorns = easeOutCubic(ramp(T, BEAT.thorns, BEAT.thorns + 0.35))
    let hp = TREE_MAX_HP
    if (T >= ROCKET_TREE_HIT_T) hp -= ROCKET_TREE_DMG
    if (T >= BEAT.impact) hp = 0
    out.hp = hp
    const f1 = T >= ROCKET_TREE_HIT_T ? Math.max(0, 1 - (T - ROCKET_TREE_HIT_T) / 0.22) : 0
    const f2 = T >= BEAT.impact ? Math.max(0, 1 - (T - BEAT.impact - 0.14) / 0.3) : 0
    out.flash = Math.min(1, Math.max(f1 * 0.8, T >= BEAT.impact && T < BEAT.impact + 0.14 ? 1 : f2))
    if (!still && f1 > 0) out.wob = Math.sin((T - ROCKET_TREE_HIT_T) * 60) * 1.6 * f1
  }
  return out
}

// ─── Smashers ───────────────────────────────────────────────────────────────

export interface SmasherState {
  x: number
  y: number
  /** Height above the ground (drop), world units. */
  h: number
  /** Squash on landing (sy; sx = 2 − sy). */
  sy: number
  alpha: number
  /** Disc spin angle (rad). */
  rot: number
  /** Character yaw (rad, 0 = facing the camera). */
  yaw: number
  /** White hit flash 0..1. */
  flash: number
  /** Guard Shell 0..1 (Grizzle). */
  shield: number
  /** Motion trail strength 0..1 (Chomper's dash). */
  trail: number
  /** Velocity direction for the trail (unit). */
  vx: number
  vy: number
}

const DROP_S = 0.42
const DROP_H = 70
const SPIN_RATE = 9 // rad / s cruising disc spin
const SPIN_RAMP_S = 0.7

/** Idle yaw: a 3/4 front view turned toward the other team — faces read. */
const idleYaw = (c: CastMember): number => (c.side === 'player' ? (c.home.x >= 0 ? -0.55 : 0.55) : (c.home.x >= 0 ? 0.35 : -0.35))

const formationAt = (c: CastMember, T: number): { x: number; y: number } => {
  const u = easeInOutCubic(ramp(T, 7.0, 7.6))
  return { x: lerp(c.home.x, c.formation.x, u), y: lerp(c.home.y, c.formation.y, u) }
}

/** Thumper's Bear Hug run: wind-up, dash, hit-stop, bounce off. */
const THUMPER_WIND = { from: 7.6, to: 7.85 }
const THUMPER_DASH_TO = 8.05
const THUMPER_BOUNCE = { from: 8.13, to: 8.7 }
/** Chomper: pull-back, launch, contact with the red tree's front. */
const CHOMPER_PULL = { from: 10.5, to: 11.05 }

const distTo = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay) || 1

/** Contact centre for a smasher of radius r ramming a circle (cx, cy, cr) from (fx, fy). */
const contactPoint = (fx: number, fy: number, cx: number, cy: number, cr: number, r: number) => {
  const d = distTo(cx, cy, fx, fy)
  return { x: cx + ((fx - cx) / d) * (cr + r), y: cy + ((fy - cy) / d) * (cr + r) }
}

const grizzleSpot = CAST[GRIZZLE]!.formation
const thumperSpot = CAST[THUMPER]!.formation
const THUMPER_WOUND = { x: thumperSpot.x - 4, y: thumperSpot.y - 16 }
export const BEAR_HUG_CONTACT = contactPoint(THUMPER_WOUND.x, THUMPER_WOUND.y, grizzleSpot.x, grizzleSpot.y, SMASHER_R, SMASHER_R)
const THUMPER_BACK = { x: thumperSpot.x + 6, y: thumperSpot.y - 22 }

const chomperSpot = CAST[CHOMPER]!.formation
export const CHOMPER_PULLED = { x: chomperSpot.x - 6, y: chomperSpot.y + 20 }
export const LOG_SLAM_CONTACT = contactPoint(CHOMPER_PULLED.x, CHOMPER_PULLED.y, TREES.red.x, TREES.red.y, TREE_R, SMASHER_R)
/** Where the Log Slam callout pill sits: beside the felled tree, clear of
 *  the stump and of Chomper's rebound. */
export const SLAM_CALLOUT_SPOT = { x: TREES.red.x + 96, y: TREES.red.y + 112 }
/** Where Chomper bounces back to after the slam. */
const CHOMPER_REBOUND = { x: LOG_SLAM_CONTACT.x - 26, y: LOG_SLAM_CONTACT.y + 58 }

/** Chomper's launch progress 0..1 at T: accelerates, then the slow-mo
 *  window (fxRate 0.35) stretches the last part. Contact exactly at impact. */
const chomperFlight = (T: number): number => {
  const a = BEAT.launch
  const b = BEAT.impact
  if (T <= a) return 0
  if (T >= b) return 1
  // Flight in FX time: the slow-mo window counts at SLOW_RATE.
  const fast = BEAT.slowFrom - a
  const slow = (b - BEAT.slowFrom) * SLOW_RATE
  const fxT = T < BEAT.slowFrom ? T - a : fast + (T - BEAT.slowFrom) * SLOW_RATE
  const u = fxT / (fast + slow)
  // ease-in launch: quick acceleration over the first quarter, then a steady
  // speed into the tree (C1-continuous, exactly 1 at contact)
  const acc = 0.25
  const k = 1 / (1 - acc / 2)
  return u < acc ? (k * u * u) / (2 * acc) : k * (u - acc / 2)
}

/** Bramble's rockets (Thorn Volley): launch time, flight, target. */
export interface RocketScript {
  at: number
  arrive: number
  /** Target: a cast member, or -1 = the red tree's front. */
  target: number
  dmg: number
}
export const ROCKETS: readonly RocketScript[] = [
  { at: 9.05, arrive: 9.47, target: VIXIE, dmg: 9 },
  { at: 9.13, arrive: 9.55, target: VIXIE, dmg: 9 },
  { at: 9.21, arrive: ROCKET_TREE_HIT_T, target: -1, dmg: ROCKET_TREE_DMG }
]
/** The point on the red tree's front the third rocket hits. */
export const TREE_ROCKET_POINT = (() => {
  const b = CAST[BRAMBLE]!.formation
  const d = distTo(TREES.red.x, TREES.red.y, b.x, b.y)
  return { x: TREES.red.x + ((b.x - TREES.red.x) / d) * TREE_R * 0.9, y: TREES.red.y + ((b.y - TREES.red.y) / d) * TREE_R * 0.9 }
})()

const spinAngle = (T: number, t0: number, rate = SPIN_RATE): number => {
  const t = T - t0
  if (t <= 0) return 0
  if (t < SPIN_RAMP_S) return (rate * t * t) / (2 * SPIN_RAMP_S)
  return (rate * SPIN_RAMP_S) / 2 + rate * (t - SPIN_RAMP_S)
}

const flashAfter = (T: number, at: number, len = 0.22): number => (T >= at && T < at + len ? 1 - (T - at) / len : 0)

/** State of cast member `i` at T. */
export const smasherAt = (i: number, T: number, out: SmasherState, still = false): SmasherState => {
  const c = CAST[i]!
  const f = formationAt(c, T)
  out.x = f.x
  out.y = f.y
  out.flash = 0
  out.shield = 0
  out.trail = 0
  out.vx = 0
  out.vy = 0
  // ── drop-in ──
  const du = ramp(T, c.dropT, c.dropT + DROP_S)
  if (still) {
    out.h = 0
    out.sy = 1
    out.alpha = ramp(T, c.dropT, c.dropT + 0.3)
  } else {
    out.h = T < c.dropT ? DROP_H : DROP_H * (1 - du * du)
    const land = T - (c.dropT + DROP_S)
    out.sy = land >= 0 && land < 0.3 ? 1 - Math.sin((land / 0.3) * Math.PI) * 0.16 * (1 - land / 0.3) : 1
    out.alpha = T < c.dropT ? 0 : Math.min(1, du * 3)
  }
  out.rot = spinAngle(T, c.dropT + DROP_S * 0.6) + i * 1.3
  // spin-up yaw: one full turn as the disc spins up, then the idle 3/4 view
  const yu = ramp(T, c.dropT + DROP_S, c.dropT + DROP_S + 0.7)
  out.yaw = idleYaw(c) + (still ? 0 : (1 - easeOutCubic(yu)) * Math.PI * 2)

  if (i === THUMPER) {
    if (T >= THUMPER_WIND.from && T < THUMPER_WIND.to) {
      const u = easeOutCubic(ramp(T, THUMPER_WIND.from, THUMPER_WIND.to))
      out.x = lerp(thumperSpot.x, THUMPER_WOUND.x, u)
      out.y = lerp(thumperSpot.y, THUMPER_WOUND.y, u)
      out.yaw = Math.atan2(-(grizzleSpot.x - out.x), grizzleSpot.y - out.y)
    } else if (T >= THUMPER_WIND.to && T < THUMPER_BOUNCE.from) {
      const u = easeInCubic(ramp(T, THUMPER_WIND.to, THUMPER_DASH_TO))
      out.x = lerp(THUMPER_WOUND.x, BEAR_HUG_CONTACT.x, u)
      out.y = lerp(THUMPER_WOUND.y, BEAR_HUG_CONTACT.y, u)
      out.yaw = Math.atan2(-(grizzleSpot.x - THUMPER_WOUND.x), grizzleSpot.y - THUMPER_WOUND.y)
      out.trail = u > 0.2 && u < 1 ? 0.6 : 0
      out.vx = BEAR_HUG_CONTACT.x - THUMPER_WOUND.x
      out.vy = BEAR_HUG_CONTACT.y - THUMPER_WOUND.y
    } else if (T >= THUMPER_BOUNCE.from && T < THUMPER_BOUNCE.to + 0.6) {
      const u = easeOutCubic(ramp(T, THUMPER_BOUNCE.from, THUMPER_BOUNCE.to))
      out.x = lerp(BEAR_HUG_CONTACT.x, THUMPER_BACK.x, u)
      out.y = lerp(BEAR_HUG_CONTACT.y, THUMPER_BACK.y, u)
      // dizzy spin-out after bouncing off the shield
      out.yaw += (1 - u) * 5
      if (T > THUMPER_BOUNCE.to) {
        const v = easeInOutCubic(ramp(T, THUMPER_BOUNCE.to, THUMPER_BOUNCE.to + 0.6))
        out.x = lerp(THUMPER_BACK.x, thumperSpot.x, v)
        out.y = lerp(THUMPER_BACK.y, thumperSpot.y, v)
      }
    } else if (T >= THUMPER_BOUNCE.to + 0.6) {
      out.x = thumperSpot.x
      out.y = thumperSpot.y
    }
  }

  if (i === GRIZZLE) {
    // Shield up as Thumper winds; absorbs most of it on contact.
    const up = ramp(T, 7.62, 7.82)
    const contact = HIT_STOPS[0]!.at
    out.shield = T < contact ? up : Math.max(0, 0.35 - ramp(T, contact + 0.9, contact + 1.3) * 0.35)
    const knock = T >= contact + 0.08 ? Math.sin(Math.min(1, (T - contact - 0.08) / 0.3) * Math.PI) * 7 : 0
    const nx = (grizzleSpot.x - BEAR_HUG_CONTACT.x) / SMASHER_R / 2
    const ny = (grizzleSpot.y - BEAR_HUG_CONTACT.y) / SMASHER_R / 2
    out.x += nx * knock
    out.y += ny * knock
    if (T >= 7.6 && T < 9.0) out.yaw = Math.atan2(-(BEAR_HUG_CONTACT.x - grizzleSpot.x), BEAR_HUG_CONTACT.y - grizzleSpot.y) * 0.6
    out.flash = flashAfter(T, contact, 0.18) * 0.5
  }

  if (i === VIXIE) {
    for (const r of ROCKETS) {
      if (r.target !== VIXIE) continue
      const k = T >= r.arrive ? Math.sin(Math.min(1, (T - r.arrive) / 0.28) * Math.PI) * 6 : 0
      out.x -= k * 0.5
      out.y -= k * 0.85
      out.flash = Math.max(out.flash, flashAfter(T, r.arrive, 0.2))
    }
  }

  if (i === BRAMBLE && T >= ROCKETS[0]!.at - 0.2 && T < 10.2) {
    // turns to the target, a little recoil hop per launch
    // turned toward the target, but kept a 3/4 view so the face reads
    const v = CAST[VIXIE]!.formation
    out.yaw = Math.atan2(-(v.x - out.x), v.y - out.y) * 0.45
    for (const r of ROCKETS) {
      const k = T >= r.at ? Math.max(0, 1 - (T - r.at) / 0.12) : 0
      out.y += k * 3
    }
  }

  if (i === CHOMPER) {
    if (T >= CHOMPER_PULL.from && T < BEAT.launch) {
      const u = easeOutCubic(ramp(T, CHOMPER_PULL.from, CHOMPER_PULL.to))
      out.x = lerp(chomperSpot.x, CHOMPER_PULLED.x, u)
      out.y = lerp(chomperSpot.y, CHOMPER_PULLED.y, u)
      out.yaw = Math.atan2(-(LOG_SLAM_CONTACT.x - CHOMPER_PULLED.x), LOG_SLAM_CONTACT.y - CHOMPER_PULLED.y)
      // tension shiver at full pull
      if (u > 0.95) out.x += Math.sin(T * 90) * 0.6
    } else if (T >= BEAT.launch && T < BEAT.impact + 0.14) {
      const u = clamp01(chomperFlight(T))
      out.x = lerp(CHOMPER_PULLED.x, LOG_SLAM_CONTACT.x, u)
      out.y = lerp(CHOMPER_PULLED.y, LOG_SLAM_CONTACT.y, u)
      out.yaw = Math.atan2(-(LOG_SLAM_CONTACT.x - CHOMPER_PULLED.x), LOG_SLAM_CONTACT.y - CHOMPER_PULLED.y)
      out.trail = u > 0.04 && T < BEAT.impact ? 1 : 0
      out.vx = LOG_SLAM_CONTACT.x - CHOMPER_PULLED.x
      out.vy = LOG_SLAM_CONTACT.y - CHOMPER_PULLED.y
    } else if (T >= BEAT.impact + 0.14) {
      const u = easeOutCubic(ramp(T, BEAT.impact + 0.14, BEAT.impact + 0.8))
      out.x = lerp(LOG_SLAM_CONTACT.x, CHOMPER_REBOUND.x, u)
      out.y = lerp(LOG_SLAM_CONTACT.y, CHOMPER_REBOUND.y, u)
      out.yaw = (1 - u) * 9 + 0.4
      out.flash = flashAfter(T, BEAT.impact + 0.14, 0.2) * 0.6
    }
  }

  // Victory hops of the blue team on the hold after the smash.
  if (!still && c.side === 'player' && T > BEAT.impact + 0.5 && T < BEAT.iris + 0.4) {
    const t = T - (BEAT.impact + 0.5) - i * 0.12
    if (t > 0) out.h = Math.abs(Math.sin(t * 7.5)) * 9 * Math.max(0, 1 - t / 1.4)
  }
  return out
}

// ─── Timed events (VFX + sound) ─────────────────────────────────────────────

export type StoryEventKind =
  | 'treePop' // a tree pops up out of the ground (leaf puff + thud)
  | 'thorns' // the garland snaps on
  | 'land' // a smasher lands on its disc (dust)
  | 'shieldAbsorb' // Bear Hug absorbs Thumper's hit
  | 'volley' // Thorn Volley fires
  | 'rocketHit' // a rocket hits Vixie
  | 'rocketTree' // the third rocket hits the red tree
  | 'pull' // Chomper's pull-back starts
  | 'launch' // Chomper launches
  | 'slam' // Log Slam fells the red tree
  | 'canopy' // the canopy parts
  | 'logo' // the logo slam on the title card
  | 'stone' // a trail stone lights up
  | 'handoff' // the title card lifts away

export interface StoryEvent {
  T: number
  kind: StoryEventKind
  /** Cast member / tree side / stone index, per kind. */
  who: number
  x: number
  y: number
  /** Damage / value shown, per kind. */
  value: number
}

/** Ambient leaves drifting down in beat 1 (and a few all through the fight). */
export interface AmbientLeaf {
  T: number
  x: number
  y: number
}

const ev = (T: number, kind: StoryEventKind, who = -1, x = 0, y = 0, value = 0): StoryEvent => ({ T, kind, who, x, y, value })

export const TRAIL_STONES = 5
export const TRAIL_STEP_S = 0.13

/** Every event of the film, in time order. */
export const STORY_EVENTS: readonly StoryEvent[] = (() => {
  const out: StoryEvent[] = [
    ev(0.6, 'canopy'),
    ev(BEAT.redTree, 'treePop', 0, TREES.red.x, TREES.red.y),
    ev(BEAT.blueTree, 'treePop', 1, TREES.blue.x, TREES.blue.y),
    ev(BEAT.thorns, 'thorns', 0, TREES.red.x, TREES.red.y)
  ]
  for (const c of CAST) {
    const f = c.home
    out.push(ev(c.dropT + DROP_S, 'land', c.id, f.x, f.y))
  }
  out.push(ev(HIT_STOPS[0]!.at, 'shieldAbsorb', GRIZZLE, BEAR_HUG_CONTACT.x, BEAR_HUG_CONTACT.y, 14))
  out.push(ev(ROCKETS[0]!.at, 'volley', BRAMBLE, CAST[BRAMBLE]!.formation.x, CAST[BRAMBLE]!.formation.y, ROCKETS.length))
  for (const r of ROCKETS) {
    if (r.target === VIXIE) {
      const v = CAST[VIXIE]!.formation
      out.push(ev(r.arrive, 'rocketHit', VIXIE, v.x, v.y, r.dmg))
    } else {
      out.push(ev(r.arrive, 'rocketTree', 0, TREE_ROCKET_POINT.x, TREE_ROCKET_POINT.y, r.dmg))
    }
  }
  out.push(ev(CHOMPER_PULL.from, 'pull', CHOMPER))
  out.push(ev(BEAT.launch, 'launch', CHOMPER, CHOMPER_PULLED.x, CHOMPER_PULLED.y))
  const tx = TREES.red.x + ((LOG_SLAM_CONTACT.x - TREES.red.x) / (TREE_R + SMASHER_R)) * TREE_R
  const ty = TREES.red.y + ((LOG_SLAM_CONTACT.y - TREES.red.y) / (TREE_R + SMASHER_R)) * TREE_R
  out.push(ev(BEAT.impact, 'slam', CHOMPER, tx, ty, LOG_SLAM_BONUS))
  out.push(ev(BEAT.title + 0.62, 'logo'))
  for (let k = 0; k < TRAIL_STONES; k++) out.push(ev(BEAT.trail + k * TRAIL_STEP_S, 'stone', k))
  out.push(ev(BEAT.handoff, 'handoff'))
  return out.sort((a, b) => a.T - b.T)
})()

/** Deterministic hash → [0, 1). */
export const hash01 = (a: number, b: number): number => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 13
  return ((h >>> 0) % 1_000_003) / 1_000_003
}

/** Ambient leaves: a calm drift, densest in the opening. */
export const AMBIENT_LEAVES: readonly AmbientLeaf[] = (() => {
  const out: AmbientLeaf[] = []
  let T = 0.05
  let i = 0
  while (T < BEAT.iris) {
    out.push({
      T,
      x: (hash01(SEED, i * 2) - 0.5) * 460,
      y: -230 + hash01(SEED, i * 2 + 1) * 420
    })
    // dense in the opening (one every ~0.16 s), sparse later (~0.7 s)
    T += T < 2.6 ? 0.16 + hash01(SEED + 1, i) * 0.08 : 0.6 + hash01(SEED + 1, i) * 0.3
    i++
  }
  return out
})()

// ─── DOM layer timing (captions, cards, title card) ────────────────────────

export interface OverlayState {
  /** Caption "Smash their tree!" 0..1 (pop). */
  captionTree: number
  /** Caption "Every smasher has skills!" 0..1. */
  captionSkills: number
  /** Index of the skill card on screen (-1 = none) and its 0..1 slide. */
  card: number
  cardIn: number
  /** Title card 0 (not yet) / 1 (up); hand-off progress 0..1. */
  title: boolean
  handoff: number
  /** Trail stones lit (0..TRAIL_STONES), and the lit fraction of the next. */
  stonesLit: number
  /** Canopy parting 0 (closed) → 1 (gone). */
  canopy: number
  /** Iris radius fraction 1 (open) → 0 (closed); -1 = no iris. */
  iris: number
}

export const overlayAt = (T: number, out: OverlayState): OverlayState => {
  out.captionTree = envelope(T, BEAT.captionTree, 0.25, BEAT.captionTreeEnd, 0.25)
  out.captionSkills = envelope(T, CAPTION_SKILLS.from, 0.25, CAPTION_SKILLS.to, 0.25)
  out.card = -1
  out.cardIn = 0
  for (let i = 0; i < SHOWCASE.length; i++) {
    const s = SHOWCASE[i]!
    if (T >= s.cardFrom && T < s.cardTo) {
      out.card = i
      out.cardIn = envelope(T, s.cardFrom, 0.22, s.cardTo, 0.2)
    }
  }
  out.title = T >= BEAT.title
  out.handoff = easeInOutCubic(ramp(T, BEAT.handoff, BEAT.end))
  let lit = 0
  for (let k = 0; k < TRAIL_STONES; k++) if (T >= BEAT.trail + k * TRAIL_STEP_S) lit = k + 1
  out.stonesLit = lit
  out.canopy = easeInOutCubic(ramp(T, 0.3, 2.4))
  out.iris = T < BEAT.iris ? -1 : 1 - easeInCubic(ramp(T, BEAT.iris, BEAT.title))
  return out
}
