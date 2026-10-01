// Deterministic RNG for gameplay. Uses mulberry32 — 32-bit seed, ~2^32
// period, a handful of ns per call. Non-crypto, which is exactly right
// for physics/spawn decisions where both PvP peers must compute the same
// sequence.
//
// Rules of thumb for callers:
//   - Use `matchRng()` everywhere inside the physics tick and any RNG-
//     driven state mutation that affects gameplay (powerup spawns, stat
//     picks, anything hashed for state-check).
//   - Plain `Math.random()` stays for presentation-only rolls (particle
//     angles, sound-variant pick, ghost-NPC generation outside a match).
//   - The host seeds the RNG when starting a PvP match and broadcasts
//     the seed so both peers reproduce the same sequence.

let _state = 1
// The seed the CURRENT match was started from (never advanced by draws).
// Per-blade skill streams (skills-feature.md §9.1) derive from it, so both
// PvP peers — which receive the same seed in `game-start` — agree on them.
let _seed = 1

/** Reseed with an explicit 32-bit value. Host→guest seed broadcast uses this. */
export const seedMatchRng = (seed: number): void => {
  // 0 is a fixed point for mulberry32; coerce to 1 so the sequence isn't stuck.
  _state = (seed >>> 0) || 1
  _seed = _state
}

/** Reseed with a fresh random seed and return it (so the host can broadcast). */
export const seedMatchRngRandom = (): number => {
  const seed = (Math.random() * 0x100000000) >>> 0 || 1
  _state = seed
  _seed = seed
  return seed
}

/** The seed the running match was (re)seeded with — stable for the whole
 *  match, unlike the stream state `matchRng()` advances. */
export const currentMatchSeed = (): number => _seed

/** [0, 1) — drop-in replacement for Math.random() in gameplay paths. */
export const matchRng = (): number => {
  let t = (_state = (_state + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * An INDEPENDENT mulberry32 stream with its own state.
 *
 * For systems that must replay identically without touching the shared match
 * stream above — the first-launch intro cutscene (`introFight.ts`) seeds one of
 * these, so running it can never shift the RNG sequence of the match that
 * follows it (or of a PvP peer).
 */
export const createRng = (seed: number): (() => number) => {
  let s = (seed >>> 0) || 1
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Salt for a seeded battle's AUX gameplay stream: `createRng(seed ^ salt)`.
 * `useSpinnerGame` draws NPC spawn jitter, bouncer placement, NPC AI picks and
 * split-child jitter from it when `initGame` got a seed (league battles), so
 * those rolls replay from the seed without shifting `matchRng()`'s draw order.
 */
export const GAMEPLAY_RNG_SALT = 0x5eed1ea9

/**
 * Stateless hash of two integers to [0, 1).
 *
 * The cutscene's particles are pure functions of (event, particle index, age),
 * so a frame can be drawn at any time T without a stateful pool — and two
 * renders of the same T (30 fps vs 144 fps) draw the same sparks.
 */
export const hash01 = (a: number, b = 0): number => {
  let t = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d)
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b)
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296
}
