// ─── Smasher mechanics: disc size + directional armour (pure, no Vue) ───────
//
// Two per-smasher playstyle knobs from the catalog (src/data/smashers/kit.ts):
//
//   • DISC — `def.disc` scales the blade radius (collision, drawn disc and the
//     character on it). Clamped to DISC_MIN … DISC_MAX. Boss multipliers stack
//     on top in the engine. Weight / stats stay the profile's: a big disc is
//     only easier to hit and to land hits with, never heavier by itself.
//
//   • ARMOUR — `def.armor = { front, back }` multiplies the damage a blade
//     TAKES by where the hit lands relative to its gameplay HEADING (a unit
//     vector: set to the launch direction at launch, follows the velocity
//     while moving, kept when stopped). Front cone and back cone are ±60°
//     (cos ≥ ARMOR_CONE_COS), the two sides between them stay 1.
//
// Determinism: the heading is a unit vector built from velocity by one
// sqrt + two divides (IEEE-exact, identical on both PvP peers — no atan2),
// and the zone test is a dot product, which a PvP guest's y-mirror leaves
// unchanged. Nothing here draws RNG.

import { SMASHERS, isSmasherId } from '@/data/smasherCatalog'
import type { SmasherArmor } from '@/data/smashers/kit'
import type { SpinnerConfig } from '@/types/spinner'

export const DISC_MIN = 0.75
export const DISC_MAX = 1.35
/** Armour multiplier bounds (receive side is the catalog; this is a guard). */
export const ARMOR_MIN = 0.4
export const ARMOR_MAX = 1.8
/** cos(60°): half-angle of the front and back cones. */
export const ARMOR_CONE_COS = 0.5

/** Hit zone relative to the defender's heading. */
export const ZONE_SIDE = 0
export const ZONE_FRONT = 1
export const ZONE_BACK = 2
export type ArmorZone = typeof ZONE_SIDE | typeof ZONE_FRONT | typeof ZONE_BACK

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

/** Disc radius multiplier of a config's smasher (1 without a smasher). */
export function discOf(config: Pick<SpinnerConfig, 'smasherId'>): number {
  if (!isSmasherId(config.smasherId)) return 1
  const d = SMASHERS[config.smasherId].disc
  return typeof d === 'number' && Number.isFinite(d) ? clamp(d, DISC_MIN, DISC_MAX) : 1
}

/** Profile damage from which a smasher's reinforced zone is drawn as the sharp
 *  steel blade plate (a damage-scaling smasher); below it, the tank bulwark. */
export const BLADE_LOOK_DAMAGE = 1.1

/** Directional armour of a config's smasher; null when neutral / absent. */
export function armorOf(config: Pick<SpinnerConfig, 'smasherId'>): Required<SmasherArmor> | null {
  if (!isSmasherId(config.smasherId)) return null
  const a = SMASHERS[config.smasherId].armor
  if (!a) return null
  const front = Number.isFinite(a.front) ? clamp(a.front, ARMOR_MIN, ARMOR_MAX) : 1
  const back = Number.isFinite(a.back) ? clamp(a.back, ARMOR_MIN, ARMOR_MAX) : 1
  if (front === 1 && back === 1) return null
  const def = SMASHERS[config.smasherId]
  const look = a.look ?? (def.profile.damage >= BLADE_LOOK_DAMAGE ? 'blade' : 'bulwark')
  return { front, back, look }
}

/** Default heading of a fresh blade: towards the other side (player up, npc down). */
export const defaultHeadingY = (owner: 'player' | 'npc'): number => (owner === 'player' ? -1 : 1)

/**
 * Zone of a hit on a defender with heading (hx, hy): (ux, uy) is the UNIT
 * vector from the defender's centre to the contact point.
 */
export function armorZone(hx: number, hy: number, ux: number, uy: number): ArmorZone {
  const c = hx * ux + hy * uy
  if (c >= ARMOR_CONE_COS) return ZONE_FRONT
  if (c <= -ARMOR_CONE_COS) return ZONE_BACK
  return ZONE_SIDE
}

/** Damage-taken multiplier of `armor` for a hit in `zone`. */
export function armorMul(armor: SmasherArmor | null | undefined, zone: ArmorZone): number {
  if (!armor) return 1
  return zone === ZONE_FRONT ? armor.front : zone === ZONE_BACK ? armor.back : 1
}

/** Heading follow rule for one physics step: a moving blade (speed ≥
 *  `minSpeed`) points along its velocity; a stopped one keeps its heading.
 *  Writes into `out` = [hx, hy]; returns true when it changed. */
export function followHeading(vx: number, vy: number, minSpeed: number, out: { hx?: number; hy?: number }): boolean {
  const sp = Math.sqrt(vx * vx + vy * vy)
  if (!(sp >= minSpeed) || sp === 0) return false
  out.hx = vx / sp
  out.hy = vy / sp
  return true
}
