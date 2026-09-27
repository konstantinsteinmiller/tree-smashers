// ─── First-launch intro: the fight, simulated live ──────────────────────────
//
// The boss fight runs LIVE while the cutscene plays: the director
// (introTimeline.ts) calls `stepTo(s)` every frame and this advances a fixed
// 240 Hz simulation a few steps at a time, recording each step into a track
// the renderer samples (so a motion trail can look back a few steps). Nothing
// in here ever reads a frame delta, so the outcome and every contact time are
// identical at 30, 60 and 144 fps and on a throttled CPU — the frame rate only
// decides how many steps a frame advances. (tests/introFight.test.ts pins it.)
//
// It is real physics — circle-circle impulses with mass, wall and bumper
// reflection — steered by a script: at fixed sim times a blade is launched at
// the boss (optionally VIA the bumper, solved so the ricochet comes off the
// bumper pointing at the boss), the boss fires its thunder, the boss charges a
// target. HP is authored per contact kind, and a charge's first contact with its
// target is the KO, so the verdict is structural rather than a lucky bounce:
// the boss wins every time. A safety net forces a KO if a charge ever misses
// (the test asserts it never has to).
//
// Pure: no DOM, no Vue, no Math.random (the seeded stream from
// `useDeterministicRng.createRng` supplies the only jitter).

import { createRng } from '@/use/useDeterministicRng'

export const INTRO_SEED = 50_050
export const FIGHT_HZ = 240
const DT = 1 / FIGHT_HZ

/** Same units as the game: the arena is a radius-200 circle. */
export const INTRO_ARENA_R = 200

export const BOSS = 0
export const P1 = 1
export const P2 = 2
export const BODY_COUNT = 3
/** The boss is the game's 1.6× boss scale over a 28-unit blade. */
export const BODY_R: readonly number[] = [46, 27, 27]
const MASS: readonly number[] = [9, 1, 1]
export const MAX_HP: readonly number[] = [100, 100, 100]

/** The one bumper this arena adds — same pinball-post idea as the campaign's
 *  bouncers (`useSpinnerGame.bounceOffBouncers`), sized up so it reads. */
export const BUMPER = { x: -120, y: 58, r: 20 } as const
/** Where the boss lands and drifts back to between charges. */
export const BOSS_HOME = { x: 0, y: -46 } as const

/** Floats stored per body per step. */
export const STRIDE = 6
export const F_X = 0
export const F_Y = 1
export const F_ROT = 2
export const F_HP = 3
export const F_ALIVE = 4
export const F_SPEED = 5

export type FightEventKind =
  | 'hit' | 'wall' | 'bumper' | 'slam' | 'thunderWind' | 'thunder' | 'charge' | 'ko' | 'launch'

export interface FightEvent {
  /** Sim time, seconds. */
  s: number
  kind: FightEventKind
  /** Primary body (the one hit / launched / killed). */
  a: number
  /** Other body, or -1. */
  b: number
  x: number
  y: number
  /** Closing speed for contacts, damage for thunder, 0 otherwise. */
  power: number
  /** Stable index — seeds every particle this event throws. */
  id: number
  /** KO only: false when the safety net had to force it. */
  byContact?: boolean
  /** Boss contacts only: damage the blue dealt to the boss (for the floating
   *  number). */
  dmg?: number
}

export interface FightTrack {
  /** Steps simulated SO FAR — the track grows while the cutscene plays. */
  steps: number
  /** Preallocated for the longest possible run: maxSteps × BODY_COUNT × STRIDE. */
  data: Float32Array
  /** Events discovered so far, in sim-time order. */
  events: FightEvent[]
  /** Sim time of each player's KO: [P1, P2]; -1 until it happens. */
  koS: [number, number]
  /** Sim time the track ends (the boss has settled); -1 until known. */
  endS: number
  /** The fight has run to its end. */
  done: boolean
}

/** The live fight: a fixed-step simulation advanced on demand. */
export interface IntroFight {
  track: FightTrack
  /** Advance the 240 Hz simulation until it has covered sim time `s`. */
  stepTo: (s: number) => void
}

// ─── The script ─────────────────────────────────────────────────────────────

type Cmd =
  | { s: number; op: 'slam' }
  | { s: number; op: 'launch'; id: number; to: 'boss' | 'bumper' | { x: number; y: number }; speed: number }
  | { s: number; op: 'thunderWind' }
  | { s: number; op: 'thunder'; dmg: number; knock: number }
  | { s: number; op: 'charge'; target: number; speed: number }

/** The choreography, in SIM seconds. The director (introTimeline.ts) adds the
 *  hit-stops and the final slow-motion on top, in director time. */
export const FIGHT_SCRIPT: readonly Cmd[] = [
  { s: 0.55, op: 'slam' },
  // Opening clash — both blues straight at the boss.
  { s: 0.92, op: 'launch', id: P1, to: 'boss', speed: 600 },
  { s: 1.0, op: 'launch', id: P2, to: 'boss', speed: 580 },
  // Ricochet play: tornado banks off the bumper into the boss's flank.
  { s: 1.42, op: 'launch', id: P1, to: 'bumper', speed: 640 },
  { s: 1.55, op: 'launch', id: P2, to: 'boss', speed: 600 },
  // They back off to their corners, circling…
  { s: 1.98, op: 'launch', id: P1, to: { x: -118, y: 120 }, speed: 300 },
  { s: 1.98, op: 'launch', id: P2, to: { x: 120, y: 118 }, speed: 300 },
  // …and the boss answers: ability #1, chain thunder through both blues.
  { s: 2.02, op: 'thunderWind' },
  { s: 2.38, op: 'thunder', dmg: 28, knock: 300 },
  { s: 2.72, op: 'launch', id: P1, to: { x: -92, y: 150 }, speed: 240 },
  { s: 2.72, op: 'launch', id: P2, to: { x: 112, y: 128 }, speed: 240 },
  // The desperate counter: diamond goes direct, tornado banks off the bumper.
  { s: 2.95, op: 'launch', id: P2, to: 'boss', speed: 660 },
  { s: 3.0, op: 'launch', id: P1, to: 'bumper', speed: 720 },
  // Dazed, the tornado reels away to the lower left — isolated.
  { s: 3.32, op: 'launch', id: P1, to: { x: -112, y: 122 }, speed: 280 },
  { s: 3.32, op: 'launch', id: P2, to: { x: 128, y: 70 }, speed: 280 },
  // KO 1 — the boss charges the tornado.
  { s: 3.46, op: 'charge', target: P1, speed: 760 },
  // Boss ability #2 on the last blue standing.
  { s: 3.96, op: 'thunderWind' },
  { s: 4.2, op: 'thunder', dmg: 30, knock: 300 },
  // Scorched, the diamond scrambles for the open floor…
  { s: 4.32, op: 'launch', id: P2, to: { x: 150, y: 96 }, speed: 460 },
  // KO 2 — …and the boss runs it down.
  { s: 4.72, op: 'charge', target: P2, speed: 820 }
]

/** How long the track runs after the second KO (boss settles, debris lands). */
const TAIL_S = 0.62
/** A charge that has not connected by then is forced (never happens with the
 *  shipped script — `byContact` in the test pins it). */
const CHARGE_TIMEOUT_S = 0.8
/** Hard stop, whatever the script does. */
const MAX_S = 7

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/**
 * The fight, LIVE: nothing is simulated up front. The cutscene's director calls
 * `stepTo(s)` every frame and the physics advances a few 240 Hz steps at a time
 * while the player watches — seeded (`createRng`), scripted (FIGHT_SCRIPT), and
 * identical at any frame rate because the step size never depends on one.
 */
export const createIntroFight = (seed: number = INTRO_SEED): IntroFight => {
  const rng = createRng(seed)
  const x = [BOSS_HOME.x, -58, 78]
  const y = [BOSS_HOME.y, 140, 132]
  const vx = [0, 28, -30]
  const vy = [0, -46, -40]
  const rot = [0, rng() * 6.28, rng() * 6.28]
  const spin = [7, 22, -24]
  const baseSpin = [7, 22, -24]
  const hp = [MAX_HP[0]!, MAX_HP[1]!, MAX_HP[2]!]
  const alive = [1, 1, 1]
  // The boss is airborne (not collidable) until it slams down.
  let bossLanded = false
  let chargeTarget = -1
  let chargeUntil = -1
  let chargeStart = -1
  let chargeSpeed = 0
  const koS: [number, number] = [-1, -1]

  // Contact latches — an event fires on the first step of a contact, not on
  // every step two bodies overlap.
  const pairLatch = [false, false, false] // (0,1) (0,2) (1,2)
  const wallLatch = [false, false, false]
  const bumperLatch = [false, false, false]

  const events: FightEvent[] = []
  const emit = (e: Omit<FightEvent, 'id'>): void => {
    events.push({ ...e, id: events.length + 1 })
  }

  const maxSteps = Math.ceil(MAX_S * FIGHT_HZ)
  const data = new Float32Array((maxSteps + 1) * BODY_COUNT * STRIDE)
  let cmdIdx = 0
  let endS = -1

  const aimAt = (id: number, tx: number, ty: number, speed: number): void => {
    const dx = tx - x[id]!
    const dy = ty - y[id]!
    const d = Math.hypot(dx, dy) || 1
    vx[id] = (dx / d) * speed
    vy[id] = (dy / d) * speed
  }

  /** Solve the bumper contact normal so the reflection points at the boss. */
  const bumperShot = (id: number, speed: number): void => {
    const rr = BUMPER.r + BODY_R[id]!
    const px = x[id]!
    const py = y[id]!
    let nx = 0
    let ny = 1
    {
      const ax = px - BUMPER.x
      const ay = py - BUMPER.y
      const al = Math.hypot(ax, ay) || 1
      const bx = x[BOSS]! - BUMPER.x
      const by = y[BOSS]! - BUMPER.y
      const bl = Math.hypot(bx, by) || 1
      nx = ax / al + bx / bl
      ny = ay / al + by / bl
      const nl = Math.hypot(nx, ny) || 1
      nx /= nl
      ny /= nl
    }
    for (let k = 0; k < 16; k++) {
      const cx = BUMPER.x + nx * rr
      const cy = BUMPER.y + ny * rr
      const ax = px - cx
      const ay = py - cy
      const al = Math.hypot(ax, ay) || 1
      const bx = x[BOSS]! - cx
      const by = y[BOSS]! - cy
      const bl = Math.hypot(bx, by) || 1
      nx = ax / al + bx / bl
      ny = ay / al + by / bl
      const nl = Math.hypot(nx, ny) || 1
      nx /= nl
      ny /= nl
    }
    aimAt(id, BUMPER.x + nx * rr, BUMPER.y + ny * rr, speed)
  }

  const kill = (id: number, s: number, byContact: boolean): void => {
    if (!alive[id]) return
    hp[id] = 0
    alive[id] = 0
    vx[id] = 0
    vy[id] = 0
    koS[id === P1 ? 0 : 1] = s
    emit({ s, kind: 'ko', a: id, b: BOSS, x: x[id]!, y: y[id]!, power: 0, byContact })
    if (chargeTarget === id) {
      chargeTarget = -1
      // Let the boss plough on for a beat, then brake.
      chargeUntil = s + 0.16
    }
    if (!alive[P1] && !alive[P2] && endS < 0) endS = s + TAIL_S
  }

  const runCmd = (c: Cmd, s: number): void => {
    switch (c.op) {
      case 'slam': {
        bossLanded = true
        emit({ s, kind: 'slam', a: BOSS, b: -1, x: x[BOSS]!, y: y[BOSS]!, power: 1 })
        // The landing shockwave shoves both blues back toward the wall.
        for (const id of [P1, P2]) {
          const dx = x[id]! - x[BOSS]!
          const dy = y[id]! - y[BOSS]!
          const d = Math.hypot(dx, dy) || 1
          vx[id] = vx[id]! + (dx / d) * 150
          vy[id] = vy[id]! + (dy / d) * 150
          spin[id] = spin[id]! * 1.6
        }
        break
      }
      case 'launch': {
        if (!alive[c.id]) break
        if (c.to === 'bumper') bumperShot(c.id, c.speed)
        else if (typeof c.to === 'object') aimAt(c.id, c.to.x, c.to.y, c.speed)
        else {
          // Lead the target by its own drift over the flight time.
          const d = Math.hypot(x[BOSS]! - x[c.id]!, y[BOSS]! - y[c.id]!)
          const tf = d / c.speed
          aimAt(c.id, x[BOSS]! + vx[BOSS]! * tf, y[BOSS]! + vy[BOSS]! * tf, c.speed)
        }
        spin[c.id] = baseSpin[c.id]! * 2.2
        emit({ s, kind: 'launch', a: c.id, b: -1, x: x[c.id]!, y: y[c.id]!, power: c.speed })
        break
      }
      case 'thunderWind':
        emit({ s, kind: 'thunderWind', a: BOSS, b: -1, x: x[BOSS]!, y: y[BOSS]!, power: 0 })
        spin[BOSS] = baseSpin[BOSS]! * 3
        break
      case 'thunder': {
        // Chain lightning: boss → nearest blue → the other. One event per
        // struck blade so the renderer can draw the chain in order.
        const order = [P1, P2].filter(id => alive[id])
        order.sort((a, b) =>
          Math.hypot(x[a]! - x[BOSS]!, y[a]! - y[BOSS]!) - Math.hypot(x[b]! - x[BOSS]!, y[b]! - y[BOSS]!))
        let from = BOSS
        for (const id of order) {
          hp[id] = Math.max(1, hp[id]! - c.dmg)
          const dx = x[id]! - x[BOSS]!
          const dy = y[id]! - y[BOSS]!
          const d = Math.hypot(dx, dy) || 1
          vx[id] = (dx / d) * c.knock + (rng() - 0.5) * 60
          vy[id] = (dy / d) * c.knock + (rng() - 0.5) * 60
          spin[id] = -spin[id]! * 1.4
          emit({ s, kind: 'thunder', a: id, b: from, x: x[id]!, y: y[id]!, power: c.dmg })
          from = id
        }
        break
      }
      case 'charge': {
        if (!alive[c.target]) break
        chargeTarget = c.target
        chargeStart = s
        chargeSpeed = c.speed
        chargeUntil = s + CHARGE_TIMEOUT_S
        const d = Math.hypot(x[c.target]! - x[BOSS]!, y[c.target]! - y[BOSS]!)
        const tf = d / c.speed
        aimAt(BOSS, x[c.target]! + vx[c.target]! * tf * 0.5, y[c.target]! + vy[c.target]! * tf * 0.5, c.speed)
        spin[BOSS] = baseSpin[BOSS]! * 3.4
        emit({ s, kind: 'charge', a: BOSS, b: c.target, x: x[BOSS]!, y: y[BOSS]!, power: c.speed })
        break
      }
    }
  }

  const pairIndex = (a: number, b: number): number => (a === 0 ? b - 1 : 2)

  const track: FightTrack = { steps: 0, data, events, koS, endS: -1, done: false }
  let step = 0

  const stepOnce = (): void => {
    const s = step * DT

    while (cmdIdx < FIGHT_SCRIPT.length && FIGHT_SCRIPT[cmdIdx]!.s <= s + 1e-9) {
      runCmd(FIGHT_SCRIPT[cmdIdx]!, s)
      cmdIdx++
    }

    // Charge safety net.
    if (chargeTarget >= 0 && s > chargeStart + CHARGE_TIMEOUT_S) kill(chargeTarget, s, false)

    // ── Integrate ──
    for (let i = 0; i < BODY_COUNT; i++) {
      if (!alive[i]) continue
      if (i === BOSS) {
        if (chargeTarget >= 0) {
          // A HOMING charge: the boss steers onto its target every step, so
          // the KO contact is guaranteed by construction instead of hoping a
          // straight dash still meets a blade that is bouncing around.
          const dx = x[chargeTarget]! - x[i]!
          const dy = y[chargeTarget]! - y[i]!
          const d = Math.hypot(dx, dy) || 1
          const steer = Math.min(1, 10 * DT)
          vx[i] = vx[i]! + ((dx / d) * chargeSpeed - vx[i]!) * steer
          vy[i] = vy[i]! + ((dy / d) * chargeSpeed - vy[i]!) * steer
        } else if (s < chargeUntil) {
          const k = Math.exp(-0.35 * DT)
          vx[i] = vx[i]! * k
          vy[i] = vy[i]! * k
        } else {
          // Critically-damped return home: the boss is the immovable centre.
          const ax = (BOSS_HOME.x - x[i]!) * 14 - vx[i]! * 7.5
          const ay = (BOSS_HOME.y - y[i]!) * 14 - vy[i]! * 7.5
          vx[i] = vx[i]! + ax * DT
          vy[i] = vy[i]! + ay * DT
        }
      } else {
        const k = Math.exp(-0.85 * DT)
        vx[i] = vx[i]! * k
        vy[i] = vy[i]! * k
      }
      x[i] = x[i]! + vx[i]! * DT
      y[i] = y[i]! + vy[i]! * DT
      // Spin relaxes back toward its base rate.
      spin[i] = baseSpin[i]! + (spin[i]! - baseSpin[i]!) * Math.exp(-1.6 * DT)
      rot[i] = rot[i]! + spin[i]! * DT
    }

    // ── Body contacts ──
    for (let a = 0; a < BODY_COUNT; a++) {
      for (let b = a + 1; b < BODY_COUNT; b++) {
        const pi = pairIndex(a, b)
        if (!alive[a] || !alive[b] || (a === BOSS && !bossLanded)) {
          pairLatch[pi] = false
          continue
        }
        const dx = x[b]! - x[a]!
        const dy = y[b]! - y[a]!
        const d = Math.hypot(dx, dy) || 0.0001
        const min = BODY_R[a]! + BODY_R[b]!
        if (d >= min) {
          if (d > min + 2) pairLatch[pi] = false
          continue
        }
        const nx = dx / d
        const ny = dy / d
        const ima = 1 / MASS[a]!
        const imb = 1 / MASS[b]!
        const over = min - d
        x[a] = x[a]! - nx * over * (ima / (ima + imb))
        y[a] = y[a]! - ny * over * (ima / (ima + imb))
        x[b] = x[b]! + nx * over * (imb / (ima + imb))
        y[b] = y[b]! + ny * over * (imb / (ima + imb))
        const rel = (vx[b]! - vx[a]!) * nx + (vy[b]! - vy[a]!) * ny
        const closing = -rel
        if (rel < 0) {
          const e = 0.92
          const j = (-(1 + e) * rel) / (ima + imb)
          vx[a] = vx[a]! - j * ima * nx
          vy[a] = vy[a]! - j * ima * ny
          vx[b] = vx[b]! + j * imb * nx
          vy[b] = vy[b]! + j * imb * ny
        }
        if (pairLatch[pi]) continue
        pairLatch[pi] = true
        const cx = x[a]! + nx * BODY_R[a]!
        const cy = y[a]! + ny * BODY_R[a]!
        if (a === BOSS) {
          const player = b
          spin[player] = -spin[player]! * 1.3
          if (player === chargeTarget) {
            emit({ s, kind: 'hit', a: player, b: BOSS, x: cx, y: cy, power: Math.max(closing, 700) })
            kill(player, s, true)
          } else {
            const toPlayer = clamp(closing / 52, 6, 13)
            const toBoss = clamp(closing / 52, 6, 13)
            hp[player] = Math.max(1, hp[player]! - toPlayer)
            // Hope: the blues really do hurt it — the boss ring falls to about
            // a quarter before the thunder turns the fight. Then the crush.
            hp[BOSS] = Math.max(22, hp[BOSS]! - toBoss)
            emit({ s, kind: 'hit', a: player, b: BOSS, x: cx, y: cy, power: closing, dmg: Math.round(toBoss) })
          }
        } else if (closing > 60) {
          // Blue-on-blue: a glancing clack, no damage.
          emit({ s, kind: 'hit', a: a, b: b, x: cx, y: cy, power: closing * 0.5 })
        }
      }
    }

    // ── Walls ──
    for (let i = 0; i < BODY_COUNT; i++) {
      if (!alive[i]) continue
      const lim = INTRO_ARENA_R - 3 - BODY_R[i]!
      const d = Math.hypot(x[i]!, y[i]!)
      if (d <= lim) {
        if (d < lim - 2) wallLatch[i] = false
        continue
      }
      const nx = x[i]! / d
      const ny = y[i]! / d
      x[i] = nx * lim
      y[i] = ny * lim
      const vn = vx[i]! * nx + vy[i]! * ny
      if (vn > 0) {
        vx[i] = vx[i]! - 2 * vn * nx
        vy[i] = vy[i]! - 2 * vn * ny
      }
      if (!wallLatch[i] && vn > 110) {
        emit({ s, kind: 'wall', a: i, b: -1, x: nx * (INTRO_ARENA_R - 3), y: ny * (INTRO_ARENA_R - 3), power: vn })
      }
      wallLatch[i] = true
    }

    // ── Bumper ──
    for (let i = 0; i < BODY_COUNT; i++) {
      if (!alive[i] || (i === BOSS && !bossLanded)) continue
      const dx = x[i]! - BUMPER.x
      const dy = y[i]! - BUMPER.y
      const d = Math.hypot(dx, dy) || 0.0001
      const min = BUMPER.r + BODY_R[i]!
      if (d >= min) {
        if (d > min + 2) bumperLatch[i] = false
        continue
      }
      const nx = dx / d
      const ny = dy / d
      x[i] = BUMPER.x + nx * min
      y[i] = BUMPER.y + ny * min
      const vn = vx[i]! * nx + vy[i]! * ny
      if (vn < 0) {
        // The pinball kick: reflect and boost, like the campaign's bouncers.
        const boost = i === BOSS ? 1 : 1.16
        vx[i] = (vx[i]! - 2 * vn * nx) * boost
        vy[i] = (vy[i]! - 2 * vn * ny) * boost
      }
      if (!bumperLatch[i]) {
        emit({
          s, kind: 'bumper', a: i, b: -1,
          x: BUMPER.x + nx * BUMPER.r, y: BUMPER.y + ny * BUMPER.r, power: Math.abs(vn)
        })
      }
      bumperLatch[i] = true
    }

    // ── Record ──
    const base = step * BODY_COUNT * STRIDE
    for (let i = 0; i < BODY_COUNT; i++) {
      const o = base + i * STRIDE
      data[o + F_X] = x[i]!
      data[o + F_Y] = y[i]!
      data[o + F_ROT] = rot[i]!
      data[o + F_HP] = hp[i]! / MAX_HP[i]!
      data[o + F_ALIVE] = alive[i]!
      data[o + F_SPEED] = Math.hypot(vx[i]!, vy[i]!)
    }
    step++
    track.steps = step
    if ((endS >= 0 && s >= endS) || step > maxSteps) {
      track.done = true
      track.endS = endS >= 0 ? Math.min(endS, (step - 1) * DT) : (step - 1) * DT
    }
  }

  const stepTo = (sTarget: number): void => {
    while (!track.done && step * DT <= sTarget + 1e-9) stepOnce()
  }

  return { track, stepTo }
}

/** The whole fight, run to its end at once — for tests and tools. The game
 *  itself never calls this: the cutscene steps the fight live. */
export const simulateIntroFight = (seed: number = INTRO_SEED): FightTrack => {
  const f = createIntroFight(seed)
  f.stepTo(MAX_S)
  return f.track
}

/**
 * Sample one float of one body at sim time `s`, linearly interpolated between
 * the two bracketing 240 Hz steps. Allocation-free.
 */
export const sampleTrack = (t: FightTrack, s: number, body: number, field: number): number => {
  const f = clamp(s * FIGHT_HZ, 0, t.steps - 1)
  const i0 = Math.floor(f)
  const i1 = Math.min(i0 + 1, t.steps - 1)
  const a = t.data[(i0 * BODY_COUNT + body) * STRIDE + field]!
  if (field === F_ALIVE) return a
  const b = t.data[(i1 * BODY_COUNT + body) * STRIDE + field]!
  return a + (b - a) * (f - i0)
}
