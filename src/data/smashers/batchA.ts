// ─── Smasher catalog, batch A — forest-floor critters ────────────────────────
//
// Data of twelve smashers (see src/data/smasherCatalog.ts for the rules and
// src/data/smashers/kit.ts for the shapes). Their rig models live in
// src/smashers/models/batchA.ts, their skill art in
// src/use/skills/smasherSkillArtBatchA.ts.
//
// Every one has a playstyle that disc size + directional armour make real:
// `armor.front` / `armor.back` are damage-TAKEN multipliers vs the heading.

import { p, sk, type SmasherDefOf } from '@/data/smashers/kit'

export const BATCH_A_IDS = [
  'brock', 'bandit', 'croaky', 'slinky', 'digger', 'snooze',
  'pongo', 'pincer', 'rolly', 'prickles', 'newtie', 'gastro'
] as const

export type BatchAId = (typeof BATCH_A_IDS)[number]

export const BATCH_A: Readonly<Record<BatchAId, SmasherDefOf<BatchAId>>> = Object.freeze({
  // Badger — head-first digger: big heavy disc, armoured snout, soft rump.
  brock: {
    id: 'brock', archetype: { top: 'quadratic', bottom: 'tanky' },
    profile: p(1.12, 0.99, 1.1, 0.85, 1.2), unlockStage: 56,
    disc: 1.2, armor: { front: 0.7, back: 0.7, look: 'bulwark' },
    skills: [
      sk('burrow_guard', 'guard_shell', { shield: 1.3 }),
      sk('badger_bite', 'lucky_edge', { mult: 1.2, chance: 0.85 }),
      sk('stripe_charge', 'opening_salvo', { pct: 1.15 })
    ]
  },
  // Raccoon — masked thief: frequent small crits, slips hits, guarded back.
  bandit: {
    id: 'bandit', archetype: { top: 'star', bottom: 'balanced' },
    profile: p(1, 1.16, 0.95, 1.05), unlockStage: 60,
    disc: 0.95, armor: { front: 1.1, back: 0.85 },
    skills: [
      sk('pickpocket', 'lucky_edge', { chance: 1.25, mult: 0.9 }),
      sk('trash_toss', 'homing_rockets', { everyN: 1.15, frac: 1.2 }),
      sk('masked_slip', 'phase_step', { chance: 1.2, cooldownMs: 1.2 })
    ]
  },
  // Toad — bouncy pinball: stacks on every bounce, soft wide mouth in front.
  croaky: {
    id: 'croaky', archetype: { top: 'round', bottom: 'speedy' },
    profile: p(1.09, 1.09, 0.9, 1.15, 0.9), unlockStage: 64,
    disc: 1.0, armor: { front: 1.15, back: 0.9 },
    skills: [
      sk('frog_leap', 'momentum', { maxStacks: 1.34, perStack: 0.9 }),
      sk('tongue_snap', 'homing_rockets', { everyN: 0.7, frac: 0.7 }),
      sk('lily_hop', 'phase_step', { cooldownMs: 0.8, chance: 0.85 })
    ]
  },
  // Koala — tiny glass-front striker: smallest disc, hits hard, bruises in front.
  slinky: {
    id: 'slinky', archetype: { top: 'star', bottom: 'speedy' },
    profile: p(0.92, 1.3, 0.9, 1.2, 0.8), unlockStage: 68,
    disc: 0.78, armor: { front: 1.3, back: 1.0 },
    skills: [
      sk('war_dance', 'static_charge', { chance: 1.15 }),
      sk('neck_bite', 'lucky_edge', { mult: 1.35, chance: 0.7 }),
      sk('weasel_dash', 'momentum', { perStack: 1.25, maxStacks: 0.67 })
    ]
  },
  // Mole — small armoured drill: claws in front, blind and soft behind.
  digger: {
    id: 'digger', archetype: { top: 'piercer', bottom: 'tanky' },
    profile: p(1.02, 1.12, 1.0, 0.85, 1.15), unlockStage: 72,
    disc: 0.85, armor: { front: 0.65, back: 1.35 },
    skills: [
      sk('claw_drill', 'tower_breaker', { pct: 1.1 }),
      sk('tunnel_ambush', 'opening_salvo', { pct: 1.3 }),
      sk('dirt_shelter', 'hazard_ward', { lava: 1.3, thunder: 1.3, chip: 0.8, shockKeep: 1.2 })
    ]
  },
  // Dormouse — small sleepy ball that curls its back up and wakes up healed.
  snooze: {
    id: 'snooze', archetype: { top: 'round', bottom: 'balanced' },
    profile: p(1.01, 1.01, 1.0, 1.1, 0.9), unlockStage: 77,
    disc: 0.85, armor: { front: 1.0, back: 0.75 },
    skills: [
      sk('hibernate', 'second_wind', { heal: 1.5, threshold: 0.7 }),
      sk('curl_snug', 'guard_shell', { shield: 1.1 }),
      sk('hazel_hoard', 'homing_rockets', { everyN: 0.85, frac: 0.9 })
    ]
  },
  // Skunk — fights rump-first: back armoured, face soft, rammers get stunned.
  pongo: {
    id: 'pongo', archetype: { top: 'cushioned', bottom: 'balanced' },
    profile: p(1.11, 0.97, 1.05, 0.95, 1.0), unlockStage: 82,
    disc: 1.1, armor: { front: 1.2, back: 0.65 },
    skills: [
      sk('stink_cloud', 'static_charge', { chance: 1.25 }),
      sk('tail_shield', 'mirror_plate', { share: 1.3, chance: 0.85 }),
      sk('musk_ward', 'hazard_ward', { lava: 1.2, thunder: 1.2, chip: 1.2, shockKeep: 1.2 })
    ]
  },
  // Stag beetle — jousting mandibles: hard plated front, big rare crits.
  pincer: {
    id: 'pincer', archetype: { top: 'piercer', bottom: 'balanced' },
    profile: p(0.93, 1.07, 1.15, 0.9, 1.05), unlockStage: 87,
    disc: 1.05, armor: { front: 0.6, back: 1.15 },
    skills: [
      sk('mandible_clamp', 'lucky_edge', { mult: 1.3, chance: 0.75 }),
      sk('chitin_plate', 'thorns', { share: 1.0 }),
      sk('stag_charge', 'momentum', { perStack: 1.15 })
    ]
  },
  // Pill bug — rolling ball: armoured all round, light punch, many bounces.
  rolly: {
    id: 'rolly', archetype: { top: 'quadratic', bottom: 'speedy' },
    profile: p(0.98, 0.88, 1.2, 1.1, 0.95), unlockStage: 92,
    disc: 0.95, armor: { front: 0.8, back: 0.8 },
    skills: [
      sk('roll_up', 'guard_shell', { shield: 1.2 }),
      sk('plate_bounce', 'bank_shot', { pct: 1.1 }),
      sk('segment_shrug', 'mirror_plate', { chance: 1.3, share: 0.7 })
    ]
  },
  // Porcupine — turns its back: quill-armoured rear, soft face, big volleys.
  prickles: {
    id: 'prickles', archetype: { top: 'triangle', bottom: 'tanky' },
    profile: p(1.02, 0.85, 1.1, 0.85, 1.1), unlockStage: 98,
    disc: 1.15, armor: { front: 1.2, back: 0.55 },
    skills: [
      sk('quill_storm', 'homing_rockets', { everyN: 1.15, frac: 1.3 }),
      sk('spine_wall', 'thorns', { share: 1.3 }),
      sk('bark_munch', 'second_wind', { threshold: 1.2, heal: 0.85 })
    ]
  },
  // Red eft newt — slippery regrower: dodges and heals, fragile tail behind.
  newtie: {
    id: 'newtie', archetype: { top: 'triangle', bottom: 'speedy' },
    profile: p(0.95, 1.12, 0.9, 1.15, 0.85), unlockStage: 105,
    disc: 0.9, armor: { front: 1.0, back: 1.25 },
    skills: [
      sk('tail_regrow', 'second_wind', { heal: 1.35, threshold: 0.75 }),
      sk('fire_skin', 'hazard_ward', { lava: 1.8, thunder: 0.7, chip: 1.0, shockKeep: 1.0 }),
      sk('slick_slip', 'phase_step', { chance: 1.3, cooldownMs: 1.3 })
    ]
  },
  // Snail — huge slow fortress: biggest disc, shell-armoured back, soft head.
  gastro: {
    id: 'gastro', archetype: { top: 'cushioned', bottom: 'tanky' },
    profile: p(1.35, 0.85, 1.2, 0.75, 1.2), unlockStage: 112,
    disc: 1.3, armor: { front: 1.3, back: 0.6 },
    skills: [
      sk('shell_retreat', 'guard_shell', { shield: 1.6 }),
      sk('slime_trail', 'hazard_ward', { lava: 1.5, thunder: 1.5, chip: 1.5, shockKeep: 0.6 }),
      sk('slow_regrow', 'second_wind', { heal: 1.2, threshold: 0.8 })
    ]
  }
})
