// ─── Smasher catalog, batch B ────────────────────────────────────────────────
//
// Data of twelve smashers (see src/data/smasherCatalog.ts for the rules and
// src/data/smashers/kit.ts for the shapes). Their rig models live in
// src/smashers/models/batchB.ts.
//
// Theme: BIG BRAWLERS & HEAVYWEIGHTS from around the world. Each one plays a
// distinct way through its disc size and directional armour (front / back
// damage-taken multipliers vs its heading) on top of its stats and skills.

import { p, sk, type SmasherDefOf } from '@/data/smashers/kit'

export const BATCH_B_IDS = [
  'humphrey', 'boxa', 'howler', 'snapjaw', 'leon', 'antlo',
  'gronk', 'bambam', 'buford', 'horace', 'wallow', 'rumble'
] as const

export type BatchBId = (typeof BATCH_B_IDS)[number]

export const BATCH_B: Readonly<Record<BatchBId, SmasherDefOf<BatchBId>>> = Object.freeze({
  // Camel — desert marathoner: humps armour its back, shrugs off hazards,
  // heals late from its hump reserve, spits volleys; a soft, cheeky face.
  humphrey: {
    id: 'humphrey', archetype: { top: 'triangle', bottom: 'speedy' },
    profile: p(1, 0.87, 1.0, 1.05, 1.0), unlockStage: 120,
    disc: 1.0, armor: { front: 1.1, back: 0.8 },
    skills: [
      sk('sand_ward', 'hazard_ward', { lava: 1.6, thunder: 1.2, chip: 1.2, shockKeep: 1.2 }),
      sk('hump_reserve', 'second_wind', { heal: 1.35, threshold: 0.8 }),
      sk('camel_spit', 'homing_rockets', { everyN: 0.85, frac: 0.9 })
    ]
  },
  // Kangaroo — pocket boxer: a small disc, quick jabs and hops, gloves up in
  // front — but never let anyone get behind it.
  boxa: {
    id: 'boxa', archetype: { top: 'star', bottom: 'speedy' },
    profile: p(0.8, 1.12, 0.9, 1.15, 0.9), unlockStage: 125,
    disc: 0.85, armor: { front: 0.85, back: 1.25 },
    skills: [
      sk('one_two', 'lucky_edge', { chance: 1.4, mult: 0.8 }),
      sk('bounce_back', 'phase_step', { cooldownMs: 0.8, chance: 0.85 }),
      sk('tail_spring', 'momentum', { perStack: 1.25, maxStacks: 0.67 })
    ]
  },
  // Wolf — pack hunter: lean disc, power that builds over a long launch, a
  // moon howl that freezes rammers; a thin back.
  howler: {
    id: 'howler', archetype: { top: 'star', bottom: 'balanced' },
    profile: p(0.96, 1.11, 0.95, 1.1, 0.95), unlockStage: 130,
    disc: 0.95, armor: { front: 0.95, back: 1.1 },
    skills: [
      sk('pack_hunt', 'momentum', { maxStacks: 1.67, perStack: 0.8 }),
      sk('moon_howl', 'static_charge', { chance: 1.25 }),
      sk('fang_flurry', 'homing_rockets', { everyN: 0.7, frac: 0.75 })
    ]
  },
  // Crocodile — ambusher: a scute-armoured back, a soft jaw-first front, one
  // huge death-roll crit and a snap that opens the fight.
  snapjaw: {
    id: 'snapjaw', archetype: { top: 'piercer', bottom: 'speedy' },
    profile: p(0.97, 1.11, 1.05, 1.0, 1.05), unlockStage: 135,
    disc: 1.0, armor: { front: 1.15, back: 0.7 },
    skills: [
      sk('death_roll', 'lucky_edge', { mult: 1.4, chance: 0.7 }),
      sk('ambush_snap', 'opening_salvo', { pct: 1.25 }),
      sk('swamp_hide', 'hazard_ward', { lava: 1.5, thunder: 1.5, chip: 1.3, shockKeep: 1.3 })
    ]
  },
  // Lion — mane-first sprinter: the mane soaks hits head-on, it builds power
  // every launch and roars rammers still; its rear is exposed.
  leon: {
    id: 'leon', archetype: { top: 'round', bottom: 'speedy' },
    profile: p(0.92, 1.06, 1.0, 1.1, 1.0), unlockStage: 140,
    disc: 1.05, armor: { front: 0.75, back: 1.2 },
    skills: [
      sk('pride_pounce', 'momentum', { perStack: 1.15 }),
      sk('king_roar', 'static_charge', { chance: 1.15 }),
      sk('mane_shake', 'phase_step', { cooldownMs: 0.8, chance: 0.9 })
    ]
  },
  // Moose — antler wall: a wide disc, a broad rack that catches head-on hits
  // and throws them back; slow to turn, soft behind.
  antlo: {
    id: 'antlo', archetype: { top: 'triangle', bottom: 'balanced' },
    profile: p(0.89, 0.78, 1.05, 0.9, 1.1), unlockStage: 145,
    disc: 1.15, armor: { front: 0.7, back: 1.2 },
    skills: [
      sk('antler_parry', 'mirror_plate', { chance: 1.3, share: 1.1 }),
      sk('bog_stomp', 'hazard_ward', { lava: 1.2, thunder: 1.2, chip: 1.6, shockKeep: 1.2 }),
      sk('rut_charge', 'opening_salvo', { pct: 1.15 })
    ]
  },
  // Gorilla — chest-thumping slugger: armoured knuckles in front, the
  // hardest crits of the batch, a banana break when hurt; weak back.
  gronk: {
    id: 'gronk', archetype: { top: 'quadratic', bottom: 'balanced' },
    profile: p(1.02, 1.07, 1.0, 0.9, 1.15), unlockStage: 150,
    disc: 1.1, armor: { front: 0.8, back: 1.25 },
    skills: [
      sk('chest_thump', 'opening_salvo', { pct: 1.3 }),
      sk('knuckle_smash', 'lucky_edge', { mult: 1.3, chance: 0.85 }),
      sk('banana_break', 'second_wind', { heal: 1.2, threshold: 0.8 })
    ]
  },
  // Panda — roly-poly sponge: a big round disc padded evenly all round, it
  // blocks, bounces hits back and rolls away — but barely hits.
  bambam: {
    id: 'bambam', archetype: { top: 'cushioned', bottom: 'balanced' },
    profile: p(1.11, 0.77, 1.1, 0.85, 1.15), unlockStage: 155,
    disc: 1.2, armor: { front: 0.9, back: 0.9 },
    skills: [
      sk('roly_poly', 'guard_shell', { shield: 1.3 }),
      sk('bamboo_block', 'mirror_plate', { chance: 1.25, share: 0.85 }),
      sk('lazy_roll', 'phase_step', { chance: 1.1, cooldownMs: 1.2 })
    ]
  },
  // Bison — stampede bulldozer: a shaggy, horned head plows forward, power
  // stacks on a long rush; flank it from behind.
  buford: {
    id: 'buford', archetype: { top: 'quadratic', bottom: 'tanky' },
    profile: p(1.16, 0.97, 1.1, 0.85, 1.3), unlockStage: 160,
    disc: 1.2, armor: { front: 0.65, back: 0.7, look: 'bulwark' },
    skills: [
      sk('herd_rush', 'momentum', { perStack: 1.2 }),
      sk('dust_storm', 'homing_rockets', { frac: 1.25, everyN: 1.3 }),
      sk('shaggy_coat', 'hazard_ward', { lava: 1.3, thunder: 1.3, chip: 1.3, shockKeep: 1.5 })
    ]
  },
  // Rhino — horn battering ram: nearly immune head-on, the hardest opener,
  // a thick skull that stuns rammers; wide open from behind.
  horace: {
    id: 'horace', archetype: { top: 'piercer', bottom: 'tanky' },
    profile: p(1.01, 1.01, 1.1, 0.85, 1.25), unlockStage: 165,
    disc: 1.05, armor: { front: 0.55, back: 1.35 },
    skills: [
      sk('horn_ram', 'tower_breaker', { pct: 1.25 }),
      sk('armor_plate', 'guard_shell', { shield: 1.15 }),
      sk('thick_skull', 'static_charge', { chance: 1.05 })
    ]
  },
  // Hippo — river fortress: the biggest disc, impossible to shove, a sturdy
  // rump — but its huge open mouth is a soft target in front.
  wallow: {
    id: 'wallow', archetype: { top: 'cushioned', bottom: 'tanky' },
    profile: p(1.34, 0.86, 1.1, 0.75, 1.35), unlockStage: 170,
    disc: 1.35, armor: { front: 1.25, back: 0.8 },
    skills: [
      sk('mud_bath', 'second_wind', { heal: 1.4, threshold: 0.9 }),
      sk('big_yawn', 'static_charge', { chance: 1.3 }),
      sk('river_wave', 'homing_rockets', { everyN: 1.15, frac: 1.3 })
    ]
  },
  // Elephant calf — the heavyweight: a huge disc with a tough forehead, trunk
  // volleys, and it never forgets a hit; slowest of the batch.
  rumble: {
    id: 'rumble', archetype: { top: 'round', bottom: 'tanky' },
    profile: p(1.26, 0.93, 1.1, 0.75, 1.3), unlockStage: 175,
    disc: 1.3, armor: { front: 0.8, back: 1.0 },
    skills: [
      sk('trunk_spray', 'homing_rockets', { frac: 1.15, everyN: 1.15 }),
      sk('never_forget', 'mirror_plate', { share: 1.3, chance: 0.9 }),
      sk('peanut_power', 'second_wind', { heal: 1.1, threshold: 1.1 })
    ]
  }
})
