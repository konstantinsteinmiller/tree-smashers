// ─── Smasher catalog, batch C — SKY, WATER & ODDBALLS ───────────────────────
//
// Data of twelve smashers (see src/data/smasherCatalog.ts for the rules and
// src/data/smashers/kit.ts for the shapes). Their rig models live in
// src/smashers/models/batchC.ts.
//
// Every smasher states its PLAYSTYLE in one line; disc size and directional
// armour (front = where it is heading) are part of that playstyle, not trim.

import { p, sk, type SmasherDefOf } from '@/data/smashers/kit'

export const BATCH_C_IDS = [
  'waddles', 'flamenca', 'gulpy', 'paddles', 'inky', 'pinchy',
  'puffton', 'nardo', 'fangsy', 'camo', 'curly', 'blubbo'
] as const

export type BatchCId = (typeof BATCH_C_IDS)[number]

export const BATCH_C: Readonly<Record<BatchCId, SmasherDefOf<BatchCId>>> = Object.freeze({
  // Penguin — belly-slider: a slick, armoured belly leading the charge, power
  // that builds fast per launch; an exposed back.
  waddles: {
    id: 'waddles', archetype: { top: 'quadratic', bottom: 'speedy' },
    profile: p(0.96, 1.01, 1.0, 1.12, 0.95), unlockStage: 180,
    disc: 0.9, armor: { front: 0.85, back: 1.15 },
    skills: [
      sk('belly_slide', 'bank_shot', { pct: 1.15 }),
      sk('flipper_flap', 'phase_step', { chance: 1.2, cooldownMs: 1.2 }),
      sk('fish_snack', 'second_wind', { heal: 0.85, threshold: 1.2 })
    ]
  },
  // Flamingo — one-legged glass cannon: a tiny disc that slips past enemies
  // and lands giant but rare crits; folds if anyone catches it from behind.
  flamenca: {
    id: 'flamenca', archetype: { top: 'star', bottom: 'speedy' },
    profile: p(0.87, 1.25, 0.88, 1.12, 0.85), unlockStage: 184,
    disc: 0.8, armor: { front: 0.95, back: 1.2 },
    skills: [
      sk('pink_kick', 'lucky_edge', { chance: 0.85, mult: 1.3 }),
      sk('one_leg_pose', 'phase_step', { chance: 1.35, cooldownMs: 1.3 }),
      sk('feather_fan', 'homing_rockets', { frac: 1.1, everyN: 1.15 })
    ]
  },
  // Pelican — big-disc catcher: its stretchy pouch swallows hits from the
  // front and spits them back; slowish and soft around the tail.
  gulpy: {
    id: 'gulpy', archetype: { top: 'round', bottom: 'balanced' },
    profile: p(1.08, 0.93, 1.05, 0.95, 1.05), unlockStage: 188,
    disc: 1.15, armor: { front: 0.8, back: 1.1 },
    skills: [
      sk('pouch_gulp', 'mirror_plate', { share: 1.3, chance: 0.85 }),
      sk('beak_scoop', 'opening_salvo', { pct: 1.15 }),
      sk('fish_stash', 'second_wind', { heal: 1.2, threshold: 0.9 })
    ]
  },
  // Otter — floats on its back: a small, quick pebble-thrower whose rear is the
  // tough side and whose cheeky face is the soft one.
  paddles: {
    id: 'paddles', archetype: { top: 'triangle', bottom: 'speedy' },
    profile: p(0.97, 1.07, 1, 1.15, 0.9), unlockStage: 192,
    disc: 0.88, armor: { front: 1.15, back: 0.85 },
    skills: [
      sk('pebble_toss', 'homing_rockets', { everyN: 0.75, frac: 0.8 }),
      sk('river_roll', 'bank_shot', { pct: 1.0 }),
      sk('slick_fur', 'hazard_ward', { lava: 1.3, thunder: 1.3, chip: 1.3, shockKeep: 0.8 })
    ]
  },
  // Octopus — squishy all-rounder: a wide, evenly padded disc, slaps with many
  // small crits, vanishes in ink and grips attackers in place.
  inky: {
    id: 'inky', archetype: { top: 'cushioned', bottom: 'balanced' },
    profile: p(1.08, 0.98, 1.05, 0.95, 1.0), unlockStage: 196,
    disc: 1.1, armor: { front: 0.92, back: 0.92 },
    skills: [
      sk('ink_cloud', 'phase_step', { chance: 1.15, cooldownMs: 0.9 }),
      sk('tentacle_grip', 'static_charge', { chance: 1.15 }),
      sk('sucker_slap', 'lucky_edge', { chance: 1.3, mult: 0.8 })
    ]
  },
  // Crab — claw-armoured front, soft back: ram face-first and snap hard; never
  // turn your back on the enemy.
  pinchy: {
    id: 'pinchy', archetype: { top: 'piercer', bottom: 'tanky' },
    profile: p(1.06, 1.06, 1.1, 0.85, 1.15), unlockStage: 200,
    disc: 1.0, armor: { front: 0.7, back: 1.3 },
    skills: [
      sk('claw_snap', 'lucky_edge', { mult: 1.3, chance: 0.8 }),
      sk('carapace', 'guard_shell', { shield: 1.25 }),
      sk('sideways_scuttle', 'momentum', { perStack: 0.9, maxStacks: 1.34 })
    ]
  },
  // Puffer fish — a huge, spiky ball: easy to hit, painful to touch from any
  // side, but heavy, slow and a poor hitter itself.
  puffton: {
    id: 'puffton', archetype: { top: 'triangle', bottom: 'tanky' },
    profile: p(1.07, 0.81, 1.1, 0.8, 1.1), unlockStage: 204,
    disc: 1.3, armor: { front: 0.95, back: 0.95 },
    skills: [
      sk('spike_puff', 'thorns', { share: 1.2 }),
      sk('puff_up', 'guard_shell', { shield: 1.2 }),
      sk('toxic_prickle', 'static_charge', { chance: 0.85 })
    ]
  },
  // Narwhal — the needle dart: a tiny 0.78 disc behind an armoured horn that
  // opens with a lance strike; its back is paper-thin.
  nardo: {
    id: 'nardo', archetype: { top: 'piercer', bottom: 'speedy' },
    profile: p(0.84, 1.23, 0.9, 1.15, 0.9), unlockStage: 208,
    disc: 0.78, armor: { front: 0.75, back: 1.35 },
    skills: [
      sk('horn_lance', 'opening_salvo', { pct: 1.4 }),
      sk('ice_dive', 'momentum', { perStack: 1.35, maxStacks: 0.67 }),
      sk('arctic_chill', 'hazard_ward', { lava: 1.25, thunder: 1.25, chip: 1.25, shockKeep: 1.25 })
    ]
  },
  // Bat — night striker: wings wrapped round its back, screeches enemies into
  // a stun and pings echo bolts; a light, small body.
  fangsy: {
    id: 'fangsy', archetype: { top: 'star', bottom: 'balanced' },
    profile: p(1.04, 1.24, 1, 1.08, 0.85), unlockStage: 212,
    disc: 0.82, armor: { front: 1.05, back: 0.85 },
    skills: [
      sk('sonic_screech', 'static_charge', { chance: 1.25 }),
      sk('echo_strike', 'homing_rockets', { everyN: 1.15, frac: 1.3 }),
      sk('night_bite', 'lucky_edge', { chance: 1.2, mult: 0.95 })
    ]
  },
  // Chameleon — the tongue sniper: snaps a sticky opener from afar, blends out
  // of the next hit; armoured snout, weak tail.
  camo: {
    id: 'camo', archetype: { top: 'quadratic', bottom: 'balanced' },
    profile: p(1.08, 1.25, 1.0, 1.0, 0.95), unlockStage: 218,
    disc: 0.92, armor: { front: 0.9, back: 1.1 },
    skills: [
      sk('sticky_lash', 'opening_salvo', { pct: 1.25 }),
      sk('camo_blend', 'phase_step', { chance: 1.25, cooldownMs: 1.1 }),
      sk('eye_lock', 'lucky_edge', { chance: 1.1, mult: 1.1 })
    ]
  },
  // Seahorse — the anchored healer: curls its tail into a hard rear guard,
  // heals late and fires slow, strong bubble jets.
  curly: {
    id: 'curly', archetype: { top: 'round', bottom: 'tanky' },
    profile: p(1.31, 1.14, 1.1, 0.85, 1.15), unlockStage: 224,
    disc: 0.95, armor: { front: 1.0, back: 0.85 },
    skills: [
      sk('tail_anchor', 'anchor', { resist: 1.15 }),
      sk('coral_mend', 'second_wind', { heal: 1.25, threshold: 0.85 }),
      sk('bubble_jet', 'homing_rockets', { everyN: 1.3, frac: 1.45 })
    ]
  },
  // Walrus — the blubber wall: the biggest disc in the game, tusk-armoured
  // front, almost impossible to push, and painfully slow.
  blubbo: {
    id: 'blubbo', archetype: { top: 'cushioned', bottom: 'tanky' },
    profile: p(1.45, 0.97, 1.15, 0.75, 1.3), unlockStage: 235,
    disc: 1.35, armor: { front: 0.75, back: 0.75, look: 'bulwark' },
    skills: [
      sk('blubber_wall', 'anchor', { resist: 1.2 }),
      sk('ice_floe', 'hazard_ward', { lava: 1.5, thunder: 1.5, chip: 1.5, shockKeep: 1.2 }),
      sk('tusk_slam', 'static_charge', { chance: 1.1 })
    ]
  }
})
