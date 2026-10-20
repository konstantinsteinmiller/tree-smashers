// ─── Smasher skill art, batch C (sky, water & oddballs) ─────────────────────
//
// Icon / flavour particles / sound of every skill of src/data/smashers/batchC.ts,
// merged into SMASHER_SKILL_ART (smasherSkillArt.ts). Same conventions as the
// registry there: 24×24 icon layers (filled shapes get the ink outline, stroke
// layers are detail lines), a flavour particle burst from FLAVOUR_SHAPES, and a
// synthesised skill sound pitched to the critter's size (tiny flamingo / bat
// high, the walrus low).

import type { FlavourShapeId, SkillFlavour, SmasherSkillArt } from '@/use/skills/smasherSkillArt'

const INK = '#161a40'
const CREAM = '#ffffff'
const CREAM2 = '#dbe8ff'
const SUN2 = '#fff7a3'
const SUN3 = '#ffeb3b'
const SUN4 = '#ffd21a'
const SUN5 = '#ffae00'
const LEAF3 = '#c8f76a'
const LEAF4 = '#8be33a'
const LEAF5 = '#55c81e'
const LEAF7 = '#2a830d'
const BERRY3 = '#ffa3c4'
const BERRY4 = '#ff5c8f'
const BERRY5 = '#f2306b'
const BERRY7 = '#8a0f3a'
const SKY2 = '#c6f2ff'
const SKY3 = '#7fdcff'
const SKY4 = '#38c4ff'
const PLUM3 = '#e2b6ff'
const PLUM5 = '#9c46f0'
const ORANGE = '#f08a24'
// critter colours
const NAVY = '#2e3a5c'
const STONE = '#9fb0bc'
const OTTER = '#8a5a3c'
const INKY = '#3a2d5c'
const CRAB = '#e5523a'
const CRAB2 = '#ff8a6a'
const IVORY = '#f6eed6'
const NARWHAL = '#56708e'
const BAT = '#4a3a62'
const WALRUS = '#a8735a'
const WALRUS2 = '#c99a7e'

// ─── Path helpers (24×24 icon space) ───────────────────────────────────────

const n = (v: number): string => String(Math.round(v * 100) / 100)
const pt = (x: number, y: number): string => `${n(x)} ${n(y)}`

const circ = (cx: number, cy: number, r: number): string =>
  `M${pt(cx - r, cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`

const ell = (cx: number, cy: number, rx: number, ry: number, deg = 0): string => {
  const a = (deg * Math.PI) / 180
  const dx = rx * Math.cos(a)
  const dy = rx * Math.sin(a)
  return `M${pt(cx - dx, cy - dy)}A${n(rx)} ${n(ry)} ${n(deg)} 1 0 ${pt(cx + dx, cy + dy)}` +
    `A${n(rx)} ${n(ry)} ${n(deg)} 1 0 ${pt(cx - dx, cy - dy)}Z`
}

const poly = (...p: number[]): string => {
  let d = `M${pt(p[0]!, p[1]!)}`
  for (let i = 2; i < p.length; i += 2) d += `L${pt(p[i]!, p[i + 1]!)}`
  return d + 'Z'
}

const line = (...p: number[]): string => {
  let d = `M${pt(p[0]!, p[1]!)}`
  for (let i = 2; i < p.length; i += 2) d += `L${pt(p[i]!, p[i + 1]!)}`
  return d
}

const rrect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${pt(x + r, y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${pt(x + w, y + r)}V${n(y + h - r)}` +
  `A${n(r)} ${n(r)} 0 0 1 ${pt(x + w - r, y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${pt(x, y + h - r)}` +
  `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${pt(x + r, y)}Z`

const star = (cx: number, cy: number, ro: number, ri: number, k: number, deg = -90): string => {
  const p: number[] = []
  for (let i = 0; i < k * 2; i++) {
    const r = i % 2 === 0 ? ro : ri
    const a = ((deg + (i * 180) / k) * Math.PI) / 180
    p.push(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return poly(...p)
}

/** Lens-shaped leaf / feather body from tip to tip, `w` = half width. */
const leaf = (cx: number, cy: number, len: number, w: number, deg: number): string => {
  const a = (deg * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const h = len / 2
  const x0 = cx - ux * h
  const y0 = cy - uy * h
  const x1 = cx + ux * h
  const y1 = cy + uy * h
  return `M${pt(x0, y0)}Q${pt(cx - uy * w * 2, cy + ux * w * 2)} ${pt(x1, y1)}` +
    `Q${pt(cx + uy * w * 2, cy - ux * w * 2)} ${pt(x0, y0)}Z`
}

/** Thin triangle from a base centred at (x, y) to a tip `len` away at `deg`. */
const spike = (x: number, y: number, len: number, w: number, deg: number): string => {
  const a = (deg * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  return poly(x - uy * w, y + ux * w, x + ux * len, y + uy * len, x + uy * w, y - ux * w)
}

/** Teardrop pointing up, round end centred at (cx, cy). */
const drop = (cx: number, cy: number, r: number): string =>
  `M${pt(cx, cy - r * 2)}C${pt(cx + r * 0.4, cy - r * 1.2)} ${pt(cx + r, cy - r * 0.7)} ${pt(cx + r, cy)}` +
  `A${n(r)} ${n(r)} 0 0 1 ${pt(cx - r, cy)}C${pt(cx - r, cy - r * 0.7)} ${pt(cx - r * 0.4, cy - r * 1.2)} ${pt(cx, cy - r * 2)}Z`

const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const s = (a0 * Math.PI) / 180
  const e = (a1 * Math.PI) / 180
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M${pt(cx + r * Math.cos(s), cy + r * Math.sin(s))}A${n(r)} ${n(r)} 0 ${large} 1 ${pt(cx + r * Math.cos(e), cy + r * Math.sin(e))}`
}

const heart = (cx: number, cy: number, s: number): string => {
  const P = (x: number, y: number) => pt(cx + x * s, cy + y * s)
  return `M${P(0, 7)}C${P(-8, 1)} ${P(-9, -4)} ${P(-5.5, -6.2)}C${P(-3, -7.7)} ${P(-1, -6.5)} ${P(0, -4.7)}` +
    `C${P(1, -6.5)} ${P(3, -7.7)} ${P(5.5, -6.2)}C${P(9, -4)} ${P(8, 1)} ${P(0, 7)}Z`
}

const fl = (shape: FlavourShapeId, colors: readonly string[], o: Partial<SkillFlavour> = {}): SkillFlavour => ({
  shape, colors, count: 6, speed: 0.13, gravity: 0.00018, size: 4.5, ...o
})

const HEX = poly(12, 2.2, 20.49, 7.1, 20.49, 16.9, 12, 21.8, 3.51, 16.9, 3.51, 7.1)

export const BATCH_C_SKILL_ART: Readonly<Record<string, SmasherSkillArt>> = {
  // ── Waddles (penguin)
  belly_slide: {
    icon: [
      { d: ell(12, 15, 7.5, 4.2, -12), fill: NAVY },
      { d: ell(12.6, 15.6, 5, 2.6, -12), fill: CREAM },
      { d: spike(18.6, 12.6, 3.6, 1.3, -12), fill: ORANGE },
      { d: line(2, 19, 6, 19) + line(3, 22, 9, 21.4), stroke: SKY3 }
    ],
    flavour: fl('spark', [SKY2, CREAM], { count: 6, speed: 0.12, gravity: 0.00008, size: 4 }),
    sfx: { name: 'skill-boost', rate: 1.1 }
  },
  flipper_flap: {
    icon: [
      { d: leaf(7.5, 12, 11, 2.4, -60), fill: NAVY },
      { d: leaf(16.5, 12, 11, 2.4, -120), fill: NAVY },
      { d: circ(12, 14, 3.4), fill: CREAM },
      { d: arc(12, 14, 9, 200, 340), stroke: SKY3, w: 1.4 }
    ],
    flavour: fl('feather', [NAVY, CREAM2], { count: 5, speed: 0.08, gravity: -0.00003, size: 5 }),
    sfx: { name: 'skill-whoosh', rate: 1.2 }
  },
  fish_snack: {
    icon: [
      { d: ell(11, 11, 6.5, 3.6) + poly(16.5, 11, 21.5, 7, 21.5, 15), fill: SKY4 },
      { d: circ(7.6, 10.2, 1), fill: INK, noInk: true },
      { d: heart(8, 18.5, 0.45), fill: BERRY4 }
    ],
    flavour: fl('heart', [BERRY4, BERRY3], { count: 4, speed: 0.06, gravity: -0.00005, size: 4.5 }),
    sfx: { name: 'level-up', rate: 1.1 }
  },
  // ── Flamenca (flamingo)
  pink_kick: {
    icon: [
      { d: ell(12, 6.5, 5, 3.4), fill: BERRY3 },
      { d: line(12, 10, 12, 15) + line(12, 15, 17, 18.5), stroke: BERRY5, w: 2.2 },
      { d: ell(18.4, 19.4, 2.6, 1.4, 30), fill: BERRY4 },
      { d: star(6, 17.5, 4, 1.8, 5), fill: SUN4 }
    ],
    flavour: fl('feather', [BERRY4, BERRY3], { count: 5, speed: 0.14, gravity: 0.0001, size: 5 }),
    sfx: { name: 'skill-crit', rate: 1.25 }
  },
  one_leg_pose: {
    icon: [
      { d: ell(12, 8.5, 6, 4), fill: BERRY3 },
      { d: line(12, 12.5, 12, 21) + line(9, 21, 15, 21), stroke: BERRY5, w: 1.8 },
      { d: line(12, 15, 15.5, 17) + line(15.5, 17, 12.5, 18.5), stroke: BERRY5, w: 1.5 },
      { d: arc(12, 12, 10, 200, 260), stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('puff', [BERRY3, CREAM], { count: 5, speed: 0.07, gravity: -0.00004, size: 4.5 }),
    sfx: { name: 'skill-whoosh', rate: 1.3 }
  },
  feather_fan: {
    icon: [
      { d: leaf(7, 11, 11, 2, -70), fill: BERRY3 },
      { d: leaf(12, 9.5, 12, 2.2, -90), fill: BERRY4 },
      { d: leaf(17, 11, 11, 2, -110), fill: BERRY3 },
      { d: circ(12, 18.5, 2.6), fill: BERRY5 }
    ],
    flavour: fl('feather', [BERRY4, BERRY3], { count: 6, speed: 0.17, gravity: 0.00004, size: 5, align: true }),
    sfx: { name: 'skill-rocket', rate: 1.2 }
  },
  // ── Gulpy (pelican)
  pouch_gulp: {
    icon: [
      { d: rrect(3, 6, 18, 3.4, 1.6), fill: SUN5 },
      { d: 'M4 9.4L20 9.4Q18 20 11 20Q5 18 4 9.4Z', fill: SUN4 },
      { d: spike(8, 14.5, 7, 1.6, 0), fill: CREAM }
    ],
    flavour: fl('drop', [SKY3, SKY2], { count: 6, speed: 0.12, gravity: 0.0002, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.85 }
  },
  beak_scoop: {
    icon: [
      { d: 'M2 9L22 6L21 9.5L4 12Z', fill: SUN5 },
      { d: 'M4 12L21 9.5Q19 19 11 18.5Q6 17 4 12Z', fill: SUN4 },
      { d: drop(18, 21, 1.6) + drop(21.4, 17, 1.2), fill: SKY3 }
    ],
    flavour: fl('drop', [SKY4, SKY3], { count: 7, speed: 0.16, gravity: 0.00024, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.85 }
  },
  fish_stash: {
    icon: [
      { d: 'M4 8L20 8Q19 20 12 20Q5 20 4 8Z', fill: SUN4 },
      { d: ell(10, 13, 3.4, 2) + poly(13, 13, 16, 11, 16, 15), fill: SKY4 },
      { d: heart(17, 5, 0.38), fill: BERRY4 }
    ],
    flavour: fl('heart', [BERRY4, SUN3], { count: 5, speed: 0.07, gravity: -0.00005, size: 4.5 }),
    sfx: { name: 'level-up', rate: 0.9 }
  },
  // ── Paddles (otter)
  pebble_toss: {
    icon: [
      { d: ell(6, 18, 3.4, 2.6), fill: STONE },
      { d: ell(12, 11, 2.6, 2) + ell(18.5, 5.5, 2.1, 1.6), fill: CREAM2 },
      { d: line(8.5, 15.5, 10, 13.5) + line(14.4, 9, 16.5, 7), stroke: SKY4 }
    ],
    flavour: fl('chip', [STONE, CREAM2], { count: 5, speed: 0.17, gravity: 0.00012, size: 4 }),
    sfx: { name: 'skill-rocket', rate: 1.25 }
  },
  river_roll: {
    icon: [
      { d: circ(12, 10.5, 6.2), fill: OTTER },
      { d: arc(12, 10.5, 3.6, 200, 500), stroke: CREAM, w: 1.5 },
      { d: 'M2 19Q5 16.5 8 19T14 19T20 19L22 19L22 22L2 22Z', fill: SKY4 }
    ],
    flavour: fl('drop', [SKY3, SKY4], { count: 6, speed: 0.12, gravity: 0.00018, size: 4 }),
    sfx: { name: 'skill-boost', rate: 1.15 }
  },
  slick_fur: {
    icon: [
      { d: HEX, fill: OTTER },
      { d: drop(12, 14.5, 3.4), fill: SKY2 },
      { d: line(6, 18, 9, 16) + line(15, 16, 18, 18), stroke: CREAM, w: 1.2 }
    ],
    flavour: fl('drop', [SKY2, SKY3], { count: 6, speed: 0.1, gravity: 0.00016, size: 4 }),
    sfx: { name: 'skill-shield', rate: 1.15 }
  },
  // ── Inky (octopus)
  ink_cloud: {
    icon: [
      { d: circ(8, 13, 4.5) + circ(15, 11, 5.4) + circ(12, 17, 4), fill: INKY },
      { d: circ(14, 10, 1.4) + circ(9, 15, 1), fill: PLUM3, noInk: true },
      { d: arc(19, 18, 3, 270, 450), stroke: PLUM5, w: 1.4 }
    ],
    flavour: fl('puff', [INKY, '#5a4a80'], { count: 7, speed: 0.08, gravity: -0.00003, size: 5.5 }),
    sfx: { name: 'skill-whoosh', rate: 0.85 }
  },
  tentacle_grip: {
    icon: [
      { d: 'M5 21Q3 12 9 8Q15 4 18 9Q20 13 16 14Q13 14 14 11L12 10Q9 13 13 16.5Q19 18 21 12L22 16Q20 21 13 20.5Q8 20 8 21Z', fill: PLUM5 },
      { d: circ(9, 17, 1) + circ(7.4, 13, 1) + circ(10, 9.6, 0.9), fill: PLUM3, noInk: true },
      { d: poly(19, 1.5, 16.5, 6, 18.5, 6, 17, 10, 21, 4.6, 19, 4.6), fill: SUN4 }
    ],
    flavour: fl('spark', [PLUM3, SUN3], { count: 5, speed: 0.12, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-zap', rate: 0.9 }
  },
  sucker_slap: {
    icon: [
      { d: rrect(5, 3, 8, 18, 4), fill: PLUM5 },
      { d: circ(9, 7, 1.6) + circ(9, 12, 1.6) + circ(9, 17, 1.6), fill: PLUM3 },
      { d: star(18.5, 7, 3.4, 1.4, 4), fill: SUN4 }
    ],
    flavour: fl('star', [PLUM3, SUN3], { count: 6, speed: 0.13, gravity: 0.0001, size: 4 }),
    sfx: { name: 'skill-crit', rate: 1.05 }
  },
  // ── Pinchy (crab)
  claw_snap: {
    icon: [
      { d: 'M5 20L9 12Q6 7 9 3Q12 5 12 9L13.5 10Q16 4 21 5Q20 11 14 13L11 20Z', fill: CRAB },
      { d: circ(10.5, 13.5, 1.1), fill: CREAM, noInk: true },
      { d: star(19.5, 17, 3.2, 1.3, 5), fill: SUN4 }
    ],
    flavour: fl('chip', [CRAB, BERRY4], { count: 6, speed: 0.15, gravity: 0.00018, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.9 }
  },
  carapace: {
    icon: [
      { d: ell(12, 13, 9, 7), fill: CRAB },
      { d: ell(12, 11.5, 5.5, 3.6), fill: CRAB2 },
      { d: circ(9, 10.6, 1) + circ(14.6, 12, 0.8) + circ(12, 9.5, 0.7), fill: CREAM, noInk: true },
      { d: line(5, 17, 19, 17), stroke: BERRY7, w: 1.2 }
    ],
    flavour: fl('hex', [CRAB, CRAB2], { count: 6, speed: 0.11, gravity: 0.00012, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.95 }
  },
  sideways_scuttle: {
    icon: [
      { d: ell(12, 14, 5, 3.6), fill: CRAB2 },
      { d: line(7, 13, 3, 10) + line(7, 16, 3, 18) + line(17, 13, 21, 10) + line(17, 16, 21, 18), stroke: CRAB, w: 1.6 },
      { d: spike(15, 5, 6, 1.6, 0) + spike(9, 5, 6, 1.6, 180), fill: SKY3 }
    ],
    flavour: fl('puff', [CREAM2, SUN2], { count: 6, speed: 0.1, gravity: 0.00012, size: 4 }),
    sfx: { name: 'skill-boost', rate: 1.05 }
  },
  // ── Puffton (puffer fish)
  spike_puff: {
    icon: [
      { d: star(12, 12, 10.5, 6.6, 14), fill: SUN5 },
      { d: circ(12, 12, 6.4), fill: SUN3 },
      { d: line(3, 21, 6, 18) + line(21, 3, 18, 6), stroke: CREAM, w: 1.4 }
    ],
    flavour: fl('quill', [SUN5, SUN4], { count: 9, speed: 0.2, gravity: 0.00006, size: 4.5, align: true }),
    sfx: { name: 'skill-shield', rate: 1.1 }
  },
  puff_up: {
    icon: [
      { d: circ(12, 12, 9), fill: SUN4 },
      { d: ell(12, 15.5, 6, 3), fill: SUN2, noInk: true },
      { d: circ(9, 10, 1.2) + circ(15, 10, 1.2), fill: INK, noInk: true },
      { d: circ(12, 14, 1.4), fill: BERRY4 }
    ],
    flavour: fl('drop', [SKY2, CREAM], { count: 6, speed: 0.08, gravity: -0.00006, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.8 }
  },
  toxic_prickle: {
    icon: [
      { d: spike(4, 20, 14, 2.4, -45), fill: SUN5 },
      { d: drop(18, 19, 3), fill: LEAF4 },
      { d: circ(17, 18.6, 0.9), fill: LEAF7, noInk: true }
    ],
    flavour: fl('spark', [LEAF4, LEAF3], { count: 5, speed: 0.12, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-zap', rate: 0.8 }
  },
  // ── Nardo (narwhal)
  horn_lance: {
    icon: [
      { d: poly(3, 21, 6, 17, 21, 3, 8, 19), fill: IVORY },
      { d: line(7, 18, 9, 18.5) + line(10, 15, 12, 15.5) + line(13, 12, 15, 12.5), stroke: NARWHAL, w: 1.1 },
      { d: star(19, 16, 3.2, 1.4, 6), fill: SUN4 }
    ],
    flavour: fl('spark', [CREAM, SKY2], { count: 6, speed: 0.16, gravity: 0.00006, size: 4.5 }),
    sfx: { name: 'skill-crit', rate: 0.95 }
  },
  ice_dive: {
    icon: [
      { d: ell(11, 13, 6.6, 4, 35), fill: NARWHAL },
      { d: spike(15.5, 16.5, 7, 1.2, 35), fill: IVORY },
      { d: spike(4, 7, 4, 1.4, -100) + spike(9, 5, 4, 1.4, -80), fill: SKY2 }
    ],
    flavour: fl('hex', [SKY2, CREAM], { count: 6, speed: 0.12, gravity: 0.00014, size: 4 }),
    sfx: { name: 'skill-boost', rate: 0.95 }
  },
  arctic_chill: {
    icon: [
      { d: HEX, fill: NARWHAL },
      { d: line(12, 6, 12, 18) + line(6.8, 9, 17.2, 15) + line(6.8, 15, 17.2, 9), stroke: CREAM, w: 1.6 }
    ],
    flavour: fl('spark', [SKY2, CREAM2], { count: 6, speed: 0.09, gravity: 0.00005, size: 4 }),
    sfx: { name: 'skill-shield', rate: 1.2 }
  },
  // ── Fangsy (bat)
  sonic_screech: {
    icon: [
      { d: 'M4 8L8 12L12 9L16 12L20 8L19 16L12 20L5 16Z', fill: BAT },
      { d: circ(9.5, 13, 1.1) + circ(14.5, 13, 1.1), fill: BERRY4, noInk: true },
      { d: arc(12, 12, 10.5, 200, 340), stroke: SUN4, w: 1.4 }
    ],
    flavour: fl('zed', [SUN3, PLUM3], { count: 5, speed: 0.12, gravity: -0.00002, size: 4 }),
    sfx: { name: 'skill-zap', rate: 1.2 }
  },
  echo_strike: {
    icon: [
      { d: circ(4.5, 12, 2.4), fill: BAT },
      { d: circ(19.5, 12, 2.6), fill: PLUM3 },
      { d: arc(5, 12, 4, -60, 60) + arc(5, 12, 7.5, -45, 45) + arc(5, 12, 11, -35, 35), stroke: PLUM5, w: 1.8 }
    ],
    flavour: fl('spark', [PLUM3, CREAM], { count: 5, speed: 0.17, gravity: 0, size: 4 }),
    sfx: { name: 'skill-rocket', rate: 1.3 }
  },
  night_bite: {
    icon: [
      { d: 'M14 3A9 9 0 1 0 21 15A7 7 0 1 1 14 3Z', fill: SUN3 },
      { d: poly(6, 11, 8.4, 11, 7.2, 15.4) + poly(10, 11, 12.4, 11, 11.2, 15.4), fill: CREAM },
      { d: star(18.5, 6, 2.4, 1, 4), fill: CREAM }
    ],
    flavour: fl('star', [SUN3, PLUM3], { count: 5, speed: 0.13, gravity: 0.0001, size: 4 }),
    sfx: { name: 'skill-crit', rate: 1.3 }
  },
  // ── Camo (chameleon)
  sticky_lash: {
    icon: [
      { d: ell(6, 12, 4.5, 4), fill: LEAF5 },
      { d: line(9.5, 12, 18, 12), stroke: BERRY4, w: 2 },
      { d: circ(19.5, 12, 2.6), fill: BERRY4 },
      { d: circ(5.4, 10.6, 1), fill: INK, noInk: true }
    ],
    flavour: fl('drop', [BERRY4, BERRY3], { count: 6, speed: 0.15, gravity: 0.0002, size: 4 }),
    sfx: { name: 'skill-crit', rate: 1.0 }
  },
  camo_blend: {
    icon: [
      { d: ell(12, 13, 8, 6), fill: LEAF4 },
      { d: ell(9, 11, 2.6, 2) + ell(15, 15, 2.8, 2), fill: SUN3, noInk: true },
      { d: ell(15, 10, 2, 1.6) + ell(8.6, 16, 2, 1.4), fill: SKY3, noInk: true },
      { d: arc(12, 13, 10.5, 150, 210), stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('leaf', [LEAF4, SUN3, SKY3], { count: 6, speed: 0.08, gravity: -0.00003, size: 4.5 }),
    sfx: { name: 'skill-whoosh', rate: 1.0 }
  },
  eye_lock: {
    icon: [
      { d: circ(12, 12, 8), fill: LEAF5 },
      { d: circ(12, 12, 4.6), fill: CREAM },
      { d: circ(13, 12, 2.2), fill: INK, noInk: true },
      { d: line(2, 12, 4, 12) + line(20, 12, 22, 12) + line(12, 2, 12, 4) + line(12, 20, 12, 22), stroke: BERRY5, w: 1.4 }
    ],
    flavour: fl('star', [LEAF3, SUN3], { count: 5, speed: 0.13, gravity: 0.0001, size: 4 }),
    sfx: { name: 'skill-crit', rate: 1.1 }
  },
  // ── Curly (seahorse)
  tail_anchor: {
    icon: [
      { d: 'M12 2.6L19.6 5.5L19.6 11C19.6 16.1 16.3 19.5 12 21.4C7.7 19.5 4.4 16.1 4.4 11L4.4 5.5Z', fill: ORANGE },
      { d: arc(12, 12.5, 3.6, 270, 600), stroke: SUN3, w: 2 },
      { d: line(12, 5.5, 12, 8.9), stroke: SUN3, w: 2 }
    ],
    flavour: fl('drop', [SUN3, CREAM], { count: 5, speed: 0.09, gravity: -0.00005, size: 4 }),
    sfx: { name: 'skill-shield', rate: 1.0 }
  },
  coral_mend: {
    icon: [
      { d: 'M11 21L11 13L7 9L7 4L9 4L9 8L11 10L11 6L13 6L13 11L16 8L16 3L18 3L18 9L13 14L13 21Z', fill: BERRY4 },
      { d: heart(18, 17.5, 0.42), fill: LEAF5 }
    ],
    flavour: fl('heart', [BERRY4, LEAF4], { count: 5, speed: 0.07, gravity: -0.00005, size: 4.5 }),
    sfx: { name: 'level-up', rate: 1.05 }
  },
  bubble_jet: {
    icon: [
      { d: circ(7, 16, 4.2), fill: SKY3 },
      { d: circ(14.5, 10, 3) + circ(20, 5, 2), fill: SKY2 },
      { d: circ(5.6, 14.6, 1.2) + circ(13.6, 9, 0.8), fill: CREAM, noInk: true }
    ],
    flavour: fl('drop', [SKY2, SKY3], { count: 6, speed: 0.15, gravity: -0.00008, size: 4 }),
    sfx: { name: 'skill-rocket', rate: 1.15 }
  },
  // ── Blubbo (walrus)
  blubber_wall: {
    icon: [
      { d: ell(12, 12, 10, 8), fill: WALRUS },
      { d: ell(12, 10, 6, 4), fill: WALRUS2, noInk: true },
      { d: spike(9, 14, 7, 1.3, 95) + spike(15, 14, 7, 1.3, 85), fill: IVORY }
    ],
    flavour: fl('wool', [CREAM2, IVORY], { count: 6, speed: 0.08, gravity: 0.0001, size: 5 }),
    sfx: { name: 'skill-shield', rate: 0.7 }
  },
  ice_floe: {
    icon: [
      { d: poly(2, 16, 6, 10, 18, 9, 22, 15, 17, 19, 6, 19), fill: SKY2 },
      { d: line(8, 13, 15, 12.5), stroke: SKY4, w: 1.2 },
      { d: 'M2 21.5Q5 19.5 8 21.5T14 21.5T20 21.5', stroke: SKY4, w: 1.4 }
    ],
    flavour: fl('hex', [SKY2, CREAM], { count: 6, speed: 0.1, gravity: 0.00014, size: 4.5 }),
    sfx: { name: 'skill-shield', rate: 0.75 }
  },
  tusk_slam: {
    icon: [
      { d: spike(8, 3, 16, 2, 95) + spike(16, 3, 16, 2, 85), fill: IVORY },
      { d: poly(13, 5, 9.5, 11, 12, 11, 10, 17, 15, 9.5, 12.5, 9.5), fill: SUN4 }
    ],
    flavour: fl('spark', [SUN3, CREAM], { count: 6, speed: 0.13, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-zap', rate: 0.65 }
  }
}
