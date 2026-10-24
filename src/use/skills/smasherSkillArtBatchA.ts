// ─── Smasher skill art, batch A (forest-floor critters) ─────────────────────
//
// Icon / flavour particles / sound of every skill of src/data/smashers/batchA.ts,
// merged into SMASHER_SKILL_ART (smasherSkillArt.ts). Same conventions as the
// registry there: 24×24 icon layers (filled shapes get the ink outline, stroke
// layers are detail lines), a flavour particle burst from FLAVOUR_SHAPES, and a
// synthesised skill sound pitched to the critter's size.

import type { FlavourShapeId, SkillFlavour, SmasherSkillArt } from '@/use/skills/smasherSkillArt'

const INK = '#161a40'
const CREAM = '#ffffff'
const CREAM2 = '#dbe8ff'
const SUN3 = '#ffeb3b'
const SUN4 = '#ffd21a'
const SUN5 = '#ffae00'
const LEAF3 = '#c8f76a'
const LEAF4 = '#8be33a'
const LEAF5 = '#55c81e'
const LEAF6 = '#3ea814'
const LEAF7 = '#2a830d'
const BERRY3 = '#ffa3c4'
const BERRY4 = '#ff5c8f'
const SKY3 = '#7fdcff'
const SKY4 = '#38c4ff'
const PLUM3 = '#e2b6ff'
const PLUM5 = '#9c46f0'
const ORANGE = '#f08a24'
const PINK = '#f7b6c2'
// critter colours
const GREY = '#9a9cab'
const COAL = '#2a2830'
const DIRT = '#8a5a32'
const DIRT2 = '#b98250'
const MAHOG = '#8c3b2b'
const SLATE = '#6c7c9a'
const SLATE2 = '#a7b4cc'
const RED = '#d8342a'

// ─── Path helpers (24×24 icon space) — same as smasherSkillArt.ts ──────────

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
const leaf = (cx: number, cy: number, len: number, w: number, deg: number): string => {
  const a = (deg * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  const h = len / 2
  return `M${pt(cx - ux * h, cy - uy * h)}Q${pt(cx - uy * w * 2, cy + ux * w * 2)} ${pt(cx + ux * h, cy + uy * h)}` +
    `Q${pt(cx + uy * w * 2, cy - ux * w * 2)} ${pt(cx - ux * h, cy - uy * h)}Z`
}
const spike = (x: number, y: number, len: number, w: number, deg: number): string => {
  const a = (deg * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  return poly(x - uy * w, y + ux * w, x + ux * len, y + uy * len, x + uy * w, y - ux * w)
}
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
const shield = 'M12 3L19.5 6V12C19.5 16.5 16 19.6 12 21.2C8 19.6 4.5 16.5 4.5 12V6Z'

const fl = (shape: FlavourShapeId, colors: readonly string[], o: Partial<SkillFlavour> = {}): SkillFlavour => ({
  shape, colors, count: 6, speed: 0.13, gravity: 0.00018, size: 4.5, ...o
})

/** Badger face: white head, two black stripes, little eyes. */
const badgerFace = (cx: number, cy: number, r: number) => [
  { d: circ(cx, cy, r), fill: CREAM },
  { d: ell(cx - r * 0.38, cy - r * 0.15, r * 0.2, r * 0.62, 12) + ell(cx + r * 0.38, cy - r * 0.15, r * 0.2, r * 0.62, -12), fill: COAL, noInk: true },
  { d: circ(cx - r * 0.38, cy + r * 0.05, r * 0.11) + circ(cx + r * 0.38, cy + r * 0.05, r * 0.11), fill: CREAM, noInk: true },
  { d: circ(cx, cy + r * 0.6, r * 0.16), fill: INK, noInk: true }
]

export const BATCH_A_SKILL_ART: Readonly<Record<string, SmasherSkillArt>> = {
  // ── Brock (badger)
  burrow_guard: {
    icon: [
      { d: 'M2 21Q3 9 12 8.5Q21 9 22 21Z', fill: DIRT },
      ...badgerFace(12, 13.5, 4.6),
      { d: circ(5, 18, 1) + circ(18.5, 17, 1.2) + circ(9, 20, 0.8), fill: DIRT2, noInk: true },
      { d: arc(12, 13, 9.5, 200, 340), stroke: SKY3, w: 1.5 }
    ],
    flavour: fl('chip', [DIRT, DIRT2], { count: 7, speed: 0.13, gravity: 0.0003, size: 3.6 }),
    sfx: { name: 'skill-shield', rate: 0.85 }
  },
  badger_bite: {
    icon: [
      { d: 'M3 11Q12 2 21 11L18 12L12 9L6 12Z', fill: GREY },
      { d: 'M3 13Q12 22 21 13L18 12.5L12 15L6 12.5Z', fill: GREY },
      { d: poly(6.5, 11.5, 8, 15, 9.5, 11) + poly(14.5, 11, 16, 15, 17.5, 11.5), fill: CREAM },
      { d: star(20, 4, 3, 1.3, 5), fill: SUN4 }
    ],
    flavour: fl('star', [SUN4, CREAM], { count: 5, speed: 0.16, gravity: 0.0001, size: 5 }),
    sfx: { name: 'skill-crit', rate: 0.85 }
  },
  stripe_charge: {
    icon: [
      ...badgerFace(14, 12, 7),
      { d: line(1.5, 8, 5, 8) + line(1, 12, 4.5, 12) + line(1.5, 16, 5, 16), stroke: CREAM, w: 1.6 },
      { d: star(4.5, 20, 2.6, 1.1, 5), fill: SUN4 }
    ],
    flavour: fl('chip', [DIRT2, GREY], { count: 8, speed: 0.17, gravity: 0.0003, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.82 }
  },
  // ── Bandit (raccoon)
  pickpocket: {
    icon: [
      { d: circ(13, 14, 7.5), fill: SUN4 },
      { d: circ(13, 14, 5), stroke: SUN5, w: 1.3 },
      { d: 'M2 6Q7 3.5 12 6Q17 3.5 22 6L21 9.5Q17 8 12 10Q7 8 3 9.5Z', fill: COAL },
      { d: circ(7.5, 7, 1.2) + circ(16.5, 7, 1.2), fill: CREAM, noInk: true }
    ],
    flavour: fl('star', [SUN4, SUN3], { count: 5, speed: 0.14, gravity: 0.00014, size: 4.5 }),
    sfx: { name: 'skill-crit', rate: 1.05 }
  },
  trash_toss: {
    icon: [
      { d: poly(4, 10, 14, 10, 13, 21, 5, 21), fill: GREY },
      { d: rrect(3, 7.5, 12, 2.6, 1.3), fill: SLATE },
      { d: line(7, 12.5, 7, 19) + line(9, 12.5, 9, 19) + line(11, 12.5, 11, 19), stroke: SLATE, w: 1 },
      { d: ell(19, 6, 2.6, 3.4, 20), fill: BERRY4 },
      { d: arc(12, 12, 9, -80, -40), stroke: CREAM, w: 1.4 }
    ],
    flavour: fl('chip', [GREY, BERRY4], { count: 5, speed: 0.15, gravity: 0.00025, size: 4 }),
    sfx: { name: 'skill-rocket', rate: 1.05 }
  },
  masked_slip: {
    icon: [
      { d: 'M2 10Q7 5 12 9Q17 5 22 10Q20 16 15 15Q12 13 9 15Q4 16 2 10Z', fill: COAL },
      { d: ell(7.5, 11, 2.2, 1.6) + ell(16.5, 11, 2.2, 1.6), fill: CREAM, noInk: true },
      { d: arc(12, 20, 4, 200, 340), stroke: PLUM3, w: 1.5 },
      { d: arc(12, 20, 6.5, 215, 325), stroke: PLUM3, w: 1.2 }
    ],
    flavour: fl('puff', [GREY, CREAM2], { count: 5, speed: 0.08, gravity: -0.00004, size: 5 }),
    sfx: { name: 'skill-whoosh', rate: 1.05 }
  },
  // ── Croaky (toad)
  frog_leap: {
    icon: [
      { d: ell(13, 14, 7, 5, -20), fill: LEAF5 },
      { d: circ(15, 8.5, 2.4) + circ(19.5, 10.5, 2.4), fill: LEAF5 },
      { d: circ(15.3, 8.3, 1) + circ(19.8, 10.3, 1), fill: INK, noInk: true },
      { d: ell(7, 19, 3.5, 1.5, -20), fill: ORANGE },
      { d: line(1, 7, 4, 9) + line(1, 11.5, 4, 12.5), stroke: CREAM, w: 1.5 }
    ],
    flavour: fl('drop', [SKY4, SKY3], { count: 5, speed: 0.1, gravity: 0.00022, size: 3.6 }),
    sfx: { name: 'skill-boost', rate: 0.95 }
  },
  tongue_snap: {
    icon: [
      { d: 'M2 15Q2 7 9 7Q14 7 14 13Q14 18 9 18L2 18Z', fill: LEAF5 },
      { d: 'M11 14Q16 16 19 9', stroke: INK, w: 3.4 },
      { d: 'M11 14Q16 16 19 9', stroke: BERRY4, w: 1.8 },
      { d: circ(20, 7, 2), fill: COAL },
      { d: ell(18.5, 4.5, 1.6, 1, -30) + ell(21.5, 4.5, 1.6, 1, 30), fill: SKY3 },
      { d: circ(7, 10.5, 1.2), fill: INK, noInk: true }
    ],
    flavour: fl('drop', [BERRY4, BERRY3], { count: 4, speed: 0.12, gravity: 0.0002, size: 3.5 }),
    sfx: { name: 'skill-rocket', rate: 0.95 }
  },
  lily_hop: {
    icon: [
      { d: 'M12 20.5A8 4.5 0 1 1 13.5 20.4L12 16Z', fill: LEAF6 },
      { d: line(12, 16, 8, 18) + line(12, 16, 16.5, 18), stroke: LEAF7, w: 1 },
      { d: circ(12, 7, 3.6), fill: LEAF4 },
      { d: circ(10.6, 6.2, 0.8) + circ(13.4, 6.2, 0.8), fill: INK, noInk: true },
      { d: arc(12, 8, 7, 200, 250) + arc(12, 8, 7, 290, 340), stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('leaf', [LEAF5, LEAF4], { detail: LEAF7, count: 4, speed: 0.08, gravity: 0.00004, size: 4.5 }),
    sfx: { name: 'skill-whoosh', rate: 0.95 }
  },
  // ── Kip (koala, id slinky)
  war_dance: {
    icon: [
      { d: 'M5 18C3 12 7 5 13 5C18 5 21 9 19 13C17.5 16 13 15.5 13.5 12.5', stroke: INK, w: 4.4 },
      { d: 'M5 18C3 12 7 5 13 5C18 5 21 9 19 13C17.5 16 13 15.5 13.5 12.5', stroke: ORANGE, w: 2.6 },
      { d: circ(5, 19, 2), fill: COAL },
      { d: poly(16, 14, 13.5, 19, 15.5, 19, 14, 23, 19.5, 17, 17, 17, 18.5, 14), fill: SUN4 }
    ],
    flavour: fl('spark', [SUN4, ORANGE], { count: 6, speed: 0.15, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-zap', rate: 1.25 }
  },
  neck_bite: {
    icon: [
      { d: 'M3 5Q12 0.5 21 5L19 8L12 6.5L5 8Z', fill: ORANGE },
      { d: poly(6, 7.5, 8, 15, 10, 7) + poly(14, 7, 16, 15, 18, 7.5), fill: CREAM },
      { d: drop(8, 20, 1.6) + drop(16, 20.5, 1.4), fill: RED }
    ],
    flavour: fl('drop', [RED, BERRY4], { count: 5, speed: 0.13, gravity: 0.00024, size: 3.5 }),
    sfx: { name: 'skill-crit', rate: 1.25 }
  },
  weasel_dash: {
    icon: [
      { d: rrect(6, 9, 13, 5.5, 2.75), fill: ORANGE },
      { d: circ(18.5, 10, 3.4), fill: ORANGE },
      { d: ell(4.5, 13, 3, 1.6, 15), fill: COAL },
      { d: circ(19.5, 9.5, 0.9), fill: INK, noInk: true },
      { d: line(1, 6, 6, 6) + line(1, 18, 7, 18) + line(9, 21, 15, 21), stroke: CREAM, w: 1.5 }
    ],
    flavour: fl('puff', [ORANGE, CREAM2], { count: 5, speed: 0.09, gravity: -0.00002, size: 4.5, dir: 180, spread: 80 }),
    sfx: { name: 'skill-boost', rate: 1.25 }
  },
  // ── Digger (mole)
  claw_drill: {
    icon: [
      { d: ell(10, 13, 6.5, 5.5), fill: PINK },
      { d: spike(13, 8.5, 9, 1.6, -40) + spike(15.5, 11.5, 8.5, 1.6, -15) + spike(16, 15, 8, 1.6, 10), fill: CREAM },
      { d: line(6, 11, 9, 14) + line(6, 15, 9, 15), stroke: BERRY4, w: 1 },
      { d: circ(4, 5, 1.2) + circ(7, 3, 0.9), fill: DIRT2 }
    ],
    flavour: fl('chip', [DIRT, DIRT2], { count: 5, speed: 0.14, gravity: 0.00026, size: 3.5 }),
    sfx: { name: 'skill-boost', rate: 0.9 }
  },
  tunnel_ambush: {
    icon: [
      { d: 'M1.5 21Q5 13 12 13Q19 13 22.5 21Z', fill: DIRT },
      { d: circ(12, 12.5, 4.2), fill: '#5d5070' },
      { d: ell(12, 15, 1.8, 1.4), fill: PINK, noInk: true },
      { d: star(4.5, 6, 2.6, 1.1, 5) + star(19.5, 5, 2.8, 1.2, 5), fill: SUN4 },
      { d: circ(7, 11, 1) + circ(17.5, 10.5, 1.1), fill: DIRT2 }
    ],
    flavour: fl('chip', [DIRT, DIRT2], { count: 9, speed: 0.18, gravity: 0.0003, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.9 }
  },
  dirt_shelter: {
    icon: [
      { d: 'M3 15Q3 4 12 4Q21 4 21 15Z', fill: SUN4 },
      { d: rrect(1.5, 14, 21, 3.2, 1.6), fill: SUN5 },
      { d: circ(12, 9.5, 2.6), fill: '#fff6a8' },
      { d: line(12, 4, 12, 6.8), stroke: SUN5, w: 1.2 },
      { d: `M2 22Q5 20 8 22T14 22T20 22`, stroke: DIRT2, w: 1.6 }
    ],
    flavour: fl('chip', [DIRT2, SUN4], { count: 6, speed: 0.12, gravity: 0.00024, size: 3.6 }),
    sfx: { name: 'skill-shield', rate: 0.9 }
  },
  // ── Snooze (dormouse)
  hibernate: {
    icon: [
      { d: circ(10, 14, 7.5), fill: SUN5 },
      { d: arc(10, 14, 4, 30, 300), stroke: '#c7843a', w: 1.6 },
      { d: circ(4.5, 8.5, 2.6), fill: SUN5 },
      { d: 'M14 2.5H19V4L16 7H19V8.5H14V7L17 4H14Z', fill: PLUM5 },
      { d: heart(19, 17.5, 0.45), fill: LEAF5 }
    ],
    flavour: fl('zed', [PLUM3, PLUM5], { count: 3, speed: 0.04, gravity: -0.00006, size: 4.5, dir: -60, spread: 50 }),
    sfx: { name: 'level-up', rate: 1.2 }
  },
  curl_snug: {
    icon: [
      { d: shield, fill: SKY3 },
      { d: circ(12, 12.5, 5.6), fill: SUN5 },
      { d: 'M6.5 15Q8 20 13 19.5Q18 19 18 14', stroke: INK, w: 3.4 },
      { d: 'M6.5 15Q8 20 13 19.5Q18 19 18 14', stroke: '#c7843a', w: 1.8 },
      { d: circ(9, 8.5, 2.2) + circ(15, 8.5, 2.2), fill: SUN5 }
    ],
    flavour: fl('puff', [SUN5, CREAM], { count: 5, speed: 0.07, gravity: -0.00003, size: 4.5 }),
    sfx: { name: 'skill-shield', rate: 1.2 }
  },
  hazel_hoard: {
    icon: [
      { d: circ(8, 15, 5), fill: DIRT2 },
      { d: circ(16, 13, 5), fill: DIRT2 },
      { d: 'M11 9Q16 5 21 9Q19 6 16 6Q13 6 11 9Z', fill: LEAF5 },
      { d: 'M3 13Q8 9 13 13Q11 10 8 10Q5 10 3 13Z', fill: LEAF5 },
      { d: arc(16, 13, 3, 200, 260) + arc(8, 15, 3, 200, 260), stroke: CREAM, w: 1.2 }
    ],
    flavour: fl('acorn', [DIRT2], { detail: LEAF6, count: 4, speed: 0.13, gravity: 0.0003, size: 4.2 }),
    sfx: { name: 'skill-rocket', rate: 1.2 }
  },
  // ── Pongo (skunk)
  stink_cloud: {
    icon: [
      { d: circ(7, 14, 4.2) + circ(12, 10.5, 5) + circ(17, 14, 4.2) + circ(12, 16, 4), fill: LEAF4 },
      { d: 'M7 8Q8.5 6 7 4M12 4Q13.5 2 12 0.8M17 8Q18.5 6 17 4', stroke: LEAF6, w: 1.3 },
      { d: poly(13, 11, 10, 16, 12, 16, 11, 20, 15, 14.5, 13, 14.5, 14.5, 11), fill: SUN4 }
    ],
    flavour: fl('puff', [LEAF4, LEAF3], { count: 7, speed: 0.07, gravity: -0.00004, size: 5.5 }),
    sfx: { name: 'skill-zap', rate: 0.95 }
  },
  tail_shield: {
    icon: [
      { d: 'M6 21C1 15 3 3 13 2.5C20 2.5 22.5 9 19 13C16 16 11 14 12 10', fill: COAL },
      { d: 'M9 18C6 13 8 6 14 5.5C17.5 5.5 19 8 18 10.5', stroke: CREAM, w: 1.8 },
      { d: arc(11, 14, 10, 120, 200), stroke: SKY3, w: 1.6 },
      { d: poly(2, 9, 5, 10.5, 2, 12), fill: SKY3 }
    ],
    flavour: fl('wool', [COAL, CREAM], { count: 5, speed: 0.09, gravity: -0.00002, size: 5 }),
    sfx: { name: 'skill-shield', rate: 0.95 }
  },
  musk_ward: {
    icon: [
      { d: 'M12 2.2L20.49 7.1L20.49 16.9L12 21.8L3.51 16.9L3.51 7.1Z', fill: COAL },
      { d: line(12, 4, 12, 20), stroke: CREAM, w: 2.2 },
      { d: 'M7 15Q5.5 12 8 10Q10 8.5 9 6.5M15 15Q13.5 12 16 10Q18 8.5 17 6.5', stroke: LEAF3, w: 1.4 }
    ],
    flavour: fl('puff', [LEAF3, PLUM3], { count: 5, speed: 0.06, gravity: -0.00004, size: 5 }),
    sfx: { name: 'skill-shield', rate: 0.9 }
  },
  // ── Pincer (stag beetle)
  mandible_clamp: {
    icon: [
      { d: 'M4 21Q2 11 8 5Q7.5 9 10 10Q6 13 7.5 20Z', fill: MAHOG },
      { d: 'M20 21Q22 11 16 5Q16.5 9 14 10Q18 13 16.5 20Z', fill: MAHOG },
      { d: poly(9.2, 10.8, 11.5, 12, 9.5, 13) + poly(14.8, 10.8, 12.5, 12, 14.5, 13), fill: SUN4 },
      { d: star(12, 4, 2.8, 1.2, 5), fill: SUN4 }
    ],
    flavour: fl('spark', [SUN4, CREAM], { count: 5, speed: 0.16, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-crit', rate: 0.9 }
  },
  chitin_plate: {
    icon: [
      { d: ell(12, 13, 8, 9), fill: MAHOG },
      { d: line(12, 4, 12, 22), stroke: INK, w: 1.3 },
      { d: ell(8.5, 9.5, 1.8, 3, 20) + ell(15.5, 9.5, 1.8, 3, -20), fill: '#c97a62', noInk: true },
      { d: poly(19, 2, 23, 4, 20, 6) + poly(1, 18, 4, 17, 3, 21), fill: SKY3 }
    ],
    flavour: fl('hex', [MAHOG, '#c97a62'], { count: 6, speed: 0.14, gravity: 0.00022, size: 3.5 }),
    sfx: { name: 'skill-shield', rate: 0.9 }
  },
  stag_charge: {
    icon: [
      { d: ell(14, 15, 6, 5.5), fill: MAHOG },
      { d: 'M11 11Q8 6 11 2Q11 6 13.5 9Z', fill: '#4a2318' },
      { d: 'M17 11Q20 6 17 2Q17 6 14.5 9Z', fill: '#4a2318' },
      { d: line(1.5, 11, 5, 11) + line(1, 15, 4.5, 15) + line(1.5, 19, 5, 19), stroke: CREAM, w: 1.5 }
    ],
    flavour: fl('chip', ['#4a2318', MAHOG], { count: 5, speed: 0.13, gravity: 0.00024, size: 3.5 }),
    sfx: { name: 'skill-boost', rate: 0.9 }
  },
  // ── Rolly (pill bug)
  roll_up: {
    icon: [
      { d: circ(12, 12.5, 9), fill: SLATE },
      { d: arc(12, 12.5, 6.5, 200, 340) + arc(12, 12.5, 4, 200, 340) + arc(12, 12.5, 6.5, 20, 160), stroke: SLATE2, w: 1.3 },
      { d: line(3, 12.5, 21, 12.5), stroke: '#4f5d7a', w: 1.2 }
    ],
    flavour: fl('hex', [SLATE, SLATE2], { count: 5, speed: 0.12, gravity: 0.0002, size: 3.5 }),
    sfx: { name: 'skill-shield', rate: 1.1 }
  },
  plate_bounce: {
    icon: [
      { d: circ(16, 9, 5.5), fill: SLATE },
      { d: arc(16, 9, 3.5, 200, 340), stroke: SLATE2, w: 1.2 },
      { d: 'M2 8Q5 20 9 20Q11 20 12 15', stroke: CREAM, w: 1.5 },
      { d: rrect(1.5, 21, 21, 1.8, 0.9), fill: DIRT2 }
    ],
    flavour: fl('spark', [SLATE2, CREAM], { count: 4, speed: 0.12, gravity: 0, size: 4 }),
    sfx: { name: 'skill-boost', rate: 1.1 }
  },
  segment_shrug: {
    icon: [
      { d: 'M2.5 18A9.5 9.5 0 0 1 21.5 18Z', fill: SLATE },
      { d: line(7, 18, 8, 10) + line(12, 18, 12, 8.6) + line(17, 18, 16, 10), stroke: SLATE2, w: 1.2 },
      { d: poly(4, 3, 9, 3, 9, 1, 13, 4.5, 9, 8, 9, 6, 4, 6), fill: SKY3 }
    ],
    flavour: fl('hex', [SLATE2, CREAM2], { count: 5, speed: 0.13, gravity: 0.0002, size: 3.5 }),
    sfx: { name: 'skill-shield', rate: 1.1 }
  },
  // ── Prickles (porcupine)
  quill_storm: {
    icon: [
      { d: spike(3, 21, 13, 1.8, -45) + spike(2, 14, 12, 1.6, -30) + spike(9, 22, 12, 1.6, -60), fill: DIRT2 },
      { d: spike(11.5, 11.5, 5, 1, -45) + spike(12.4, 8, 4.5, 0.9, -30) + spike(15, 12.5, 4.5, 0.9, -60), fill: CREAM },
      { d: line(18, 4, 21, 2) + line(21, 9, 23, 8), stroke: CREAM, w: 1.3 }
    ],
    flavour: fl('quill', [CREAM, DIRT2], { count: 8, speed: 0.2, gravity: 0.00008, size: 5, align: true }),
    sfx: { name: 'skill-rocket', rate: 0.85 }
  },
  spine_wall: {
    icon: [
      { d: spike(12, 17, 14, 1.6, -90) + spike(12, 17, 13, 1.6, -125) + spike(12, 17, 13, 1.6, -55) + spike(12, 17, 11, 1.6, -155) + spike(12, 17, 11, 1.6, -25), fill: CREAM },
      { d: ell(12, 18, 8, 4.5), fill: '#5a463a' },
      { d: poly(20, 9, 23, 11, 20, 13), fill: SKY3 },
      { d: arc(12, 12, 10, 170, 190), stroke: SKY3, w: 1.5 }
    ],
    flavour: fl('quill', [CREAM, '#b39a82'], { count: 6, speed: 0.12, gravity: 0.0001, align: true }),
    sfx: { name: 'skill-shield', rate: 0.85 }
  },
  bark_munch: {
    icon: [
      { d: 'M3 6H17V9.5Q15.5 11 17 12.5V18H3Z', fill: DIRT },
      { d: line(5, 9, 13, 9) + line(5, 12.5, 11, 12.5) + line(5, 15.5, 13, 15.5), stroke: DIRT2, w: 1 },
      { d: heart(18.5, 17.5, 0.55), fill: LEAF5 },
      { d: circ(19, 6, 1) + circ(21, 9, 0.8), fill: DIRT2 }
    ],
    flavour: fl('chip', [DIRT, DIRT2], { count: 6, speed: 0.1, gravity: 0.00024, size: 3.6 }),
    sfx: { name: 'level-up', rate: 0.85 }
  },
  // ── Newtie (red eft)
  tail_regrow: {
    icon: [
      { d: 'M3 18C3 11 8 9 12 11C15 12.5 15 16 12.5 16', stroke: INK, w: 5 },
      { d: 'M3 18C3 11 8 9 12 11C15 12.5 15 16 12.5 16', stroke: ORANGE, w: 3.2 },
      { d: circ(8, 11.5, 1) + circ(4.5, 15, 0.9), fill: RED, noInk: true },
      { d: circ(18, 7, 4.2), fill: CREAM },
      { d: rrect(17.2, 4.4, 1.6, 5.2, 0.8) + rrect(15.4, 6.2, 5.2, 1.6, 0.8), fill: LEAF6, noInk: true }
    ],
    flavour: fl('heart', [ORANGE, SUN4], { count: 4, speed: 0.05, gravity: -0.00007, size: 4.5 }),
    sfx: { name: 'level-up', rate: 1.15 }
  },
  fire_skin: {
    icon: [
      { d: 'M12 2.5C15.5 7 19.5 10 18.5 15.5A6.5 6.5 0 0 1 5.5 15.5C5 11.5 8.5 10.5 8.5 6C10 8 11 9 12 2.5Z', fill: ORANGE },
      { d: circ(10, 15, 1.6) + circ(14.5, 13, 1.3), fill: RED },
      { d: 'M2 21L5.5 18M22 21L18.5 18', stroke: SUN4, w: 1.4 }
    ],
    flavour: fl('flame', [ORANGE, SUN5], { count: 6, speed: 0.08, gravity: -0.00012, size: 5 }),
    sfx: { name: 'skill-shield', rate: 1.15 }
  },
  slick_slip: {
    icon: [
      { d: drop(14, 15, 5), fill: SKY4 },
      { d: ell(12.5, 14, 1.4, 2.2, 20), fill: CREAM, noInk: true },
      { d: arc(5, 14, 3.5, 120, 240), stroke: PLUM3, w: 1.6 },
      { d: arc(5, 14, 6, 140, 220), stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('drop', [SKY4, SKY3], { count: 5, speed: 0.1, gravity: 0.0002, size: 3.6 }),
    sfx: { name: 'skill-whoosh', rate: 1.15 }
  },
  // ── Gastro (snail)
  shell_retreat: {
    icon: [
      { d: 'M2 20Q2 16 6 16H20Q22 16 22 20Z', fill: LEAF4 },
      { d: circ(12, 11, 7.5), fill: ORANGE },
      { d: 'M12 11m0 0a1.5 1.5 0 1 1 1.5 1.5a3 3 0 1 1 -3 -3a4.5 4.5 0 1 1 4.5 4.5', stroke: '#f4d6a0', w: 1.4 }
    ],
    flavour: fl('hex', [ORANGE, SUN5], { count: 6, speed: 0.12, gravity: 0.00022, size: 3.5 }),
    sfx: { name: 'skill-shield', rate: 0.7 }
  },
  slime_trail: {
    icon: [
      { d: 'M2 19Q6 15 10 18T18 17Q20 16.5 22 18L22 21L2 21Z', fill: LEAF3 },
      { d: drop(7, 10, 2) + drop(14, 8, 2.4) + drop(19.5, 11, 1.6), fill: LEAF4 },
      { d: arc(14, 8, 1.2, 200, 300), stroke: CREAM, w: 0.9 }
    ],
    flavour: fl('drop', [LEAF4, LEAF3], { count: 6, speed: 0.08, gravity: 0.00022, size: 3.6 }),
    sfx: { name: 'skill-shield', rate: 0.7 }
  },
  slow_regrow: {
    icon: [
      { d: heart(11, 13, 1.1), fill: LEAF5 },
      { d: leaf(16, 6, 8, 1.8, -40), fill: LEAF4 },
      { d: line(13, 9, 19, 3), stroke: LEAF7, w: 0.9 },
      { d: circ(19, 19, 3.2), fill: CREAM2 },
      { d: line(19, 17.4, 19, 19, 20.4, 19.8), stroke: INK, w: 1 }
    ],
    flavour: fl('leaf', [LEAF4, LEAF3], { detail: LEAF6, count: 5, speed: 0.06, gravity: -0.00005, size: 4.5 }),
    sfx: { name: 'level-up', rate: 0.7 }
  }
}

