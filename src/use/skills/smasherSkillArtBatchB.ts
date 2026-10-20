// ─── Smasher skill art, batch B (big brawlers & heavyweights) ───────────────
//
// Icon / flavour particles / sound of every skill of src/data/smashers/batchB.ts,
// merged into SMASHER_SKILL_ART (smasherSkillArt.ts). Lives under
// src/use/skills/ (not next to the rig models) so it ships in the lazy skill
// chunks: the models are on the hot path, the skill SFX names must not be.
// Same rules: 24×24 icon space, filled layers get the ink outline, stroke
// layers are details; colours are the DESIGN.md tokens as literals.
// Type-only import, so no cycle with the registry.

import type { SmasherSkillArt, SkillIconLayer } from '@/use/skills/smasherSkillArt'

const INK = '#161a40'
const CREAM = '#ffffff'
const CREAM2 = '#dbe8ff'
const SAND = '#f2c46a'
const SAND7 = '#b9803e'
const BROWN = '#7a5236'
const BROWN7 = '#3e2a1e'
const RED = '#e0323c'
const LEAF4 = '#8be33a'
const LEAF5 = '#55c81e'
const LEAF7 = '#2a830d'
const SUN3 = '#ffeb3b'
const SUN4 = '#ffd21a'
const SUN5 = '#ffae00'
const SKY3 = '#7fdcff'
const SKY4 = '#38c4ff'
const WOOD6 = '#2f4fd6'
const GREY = '#9aa8c4'
const GREY7 = '#4a5468'
const PINK = '#f7b6c2'
const BERRY5 = '#f2306b'
const PLUM3 = '#e2b6ff'
const MUD = '#8a5a3a'
const ORANGE = '#f08a24'

const nn = (v: number): string => String(Math.round(v * 100) / 100)
const pt = (x: number, y: number): string => `${nn(x)} ${nn(y)}`
const circ = (cx: number, cy: number, r: number): string =>
  `M${pt(cx - r, cy)}a${nn(r)} ${nn(r)} 0 1 0 ${nn(2 * r)} 0a${nn(r)} ${nn(r)} 0 1 0 ${nn(-2 * r)} 0Z`
const ell = (cx: number, cy: number, rx: number, ry: number, deg = 0): string => {
  const a = (deg * Math.PI) / 180
  const dx = rx * Math.cos(a)
  const dy = rx * Math.sin(a)
  return `M${pt(cx - dx, cy - dy)}A${nn(rx)} ${nn(ry)} ${nn(deg)} 1 0 ${pt(cx + dx, cy + dy)}` +
    `A${nn(rx)} ${nn(ry)} ${nn(deg)} 1 0 ${pt(cx - dx, cy - dy)}Z`
}
const poly = (...q: number[]): string => {
  let d = `M${pt(q[0]!, q[1]!)}`
  for (let i = 2; i < q.length; i += 2) d += `L${pt(q[i]!, q[i + 1]!)}`
  return d + 'Z'
}
const line = (...q: number[]): string => {
  let d = `M${pt(q[0]!, q[1]!)}`
  for (let i = 2; i < q.length; i += 2) d += `L${pt(q[i]!, q[i + 1]!)}`
  return d
}
const rrect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${pt(x + r, y)}H${nn(x + w - r)}A${nn(r)} ${nn(r)} 0 0 1 ${pt(x + w, y + r)}V${nn(y + h - r)}` +
  `A${nn(r)} ${nn(r)} 0 0 1 ${pt(x + w - r, y + h)}H${nn(x + r)}A${nn(r)} ${nn(r)} 0 0 1 ${pt(x, y + h - r)}` +
  `V${nn(y + r)}A${nn(r)} ${nn(r)} 0 0 1 ${pt(x + r, y)}Z`
const star = (cx: number, cy: number, ro: number, ri: number, k: number, deg = -90): string => {
  const q: number[] = []
  for (let i = 0; i < k * 2; i++) {
    const r = i % 2 === 0 ? ro : ri
    const a = ((deg + (i * 180) / k) * Math.PI) / 180
    q.push(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  return poly(...q)
}
const spike = (x: number, y: number, len: number, w: number, deg: number): string => {
  const a = (deg * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  return poly(x - uy * w, y + ux * w, x + ux * len, y + uy * len, x + uy * w, y - ux * w)
}
const drop = (cx: number, cy: number, r: number): string =>
  `M${pt(cx, cy - r * 2)}C${pt(cx + r * 0.4, cy - r * 1.2)} ${pt(cx + r, cy - r * 0.7)} ${pt(cx + r, cy)}` +
  `A${nn(r)} ${nn(r)} 0 0 1 ${pt(cx - r, cy)}C${pt(cx - r, cy - r * 0.7)} ${pt(cx - r * 0.4, cy - r * 1.2)} ${pt(cx, cy - r * 2)}Z`
const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const s = (a0 * Math.PI) / 180
  const e = (a1 * Math.PI) / 180
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M${pt(cx + r * Math.cos(s), cy + r * Math.sin(s))}A${nn(r)} ${nn(r)} 0 ${large} 1 ${pt(cx + r * Math.cos(e), cy + r * Math.sin(e))}`
}
const shield = (cx: number, cy: number, s: number): string =>
  poly(cx, cy - 9 * s, cx + 7.5 * s, cy - 6 * s, cx + 7 * s, cy + 1 * s, cx, cy + 9 * s, cx - 7 * s, cy + 1 * s, cx - 7.5 * s, cy - 6 * s)
const heart = (cx: number, cy: number, s: number): string => {
  const P = (x: number, y: number) => pt(cx + x * s, cy + y * s)
  return `M${P(0, 7)}C${P(-8, 1)} ${P(-9, -4)} ${P(-5.5, -6.2)}C${P(-3, -7.7)} ${P(-1, -6.5)} ${P(0, -4.7)}` +
    `C${P(1, -6.5)} ${P(3, -7.7)} ${P(5.5, -6.2)}C${P(9, -4)} ${P(8, 1)} ${P(0, 7)}Z`
}
const bolt = (x: number, y: number, s: number): string =>
  poly(x + 2 * s, y - 6 * s, x - 2.5 * s, y + 0.5 * s, x + 0.2 * s, y + 0.5 * s, x - 1.6 * s, y + 6 * s, x + 3 * s, y - 1 * s, x + 0.3 * s, y - 1 * s)
const speed = (x: number, y: number): SkillIconLayer => ({ d: line(x, y, x + 4, y) + line(x + 1, y + 3.5, x + 4.5, y + 3.5), stroke: CREAM, w: 1.5 })

type Fl = SmasherSkillArt['flavour']
const fl = (shape: Fl['shape'], colors: readonly string[], o: Partial<Fl> = {}): Fl => ({
  shape, colors, count: 6, speed: 0.13, gravity: 0.00018, size: 4.5, ...o
})

export const BATCH_B_SKILL_ART: Readonly<Record<string, SmasherSkillArt>> = {
  // ── Humphrey (camel)
  sand_ward: {
    icon: [
      { d: ell(12, 17, 9, 3.6), fill: SAND },
      { d: poly(5, 15, 9.5, 8, 14, 15), fill: SAND7 },
      { d: poly(11, 15, 15.5, 9.5, 20, 15), fill: SAND },
      { d: circ(18, 5.5, 2.6), fill: SUN4 },
      { d: arc(12, 17, 6, 200, 340), stroke: SAND7, w: 1.2 }
    ],
    flavour: fl('chip', [SAND, SAND7], { count: 7, speed: 0.1, gravity: 0.0002, size: 3.5 }),
    sfx: { name: 'skill-shield', rate: 0.9 }
  },
  hump_reserve: {
    icon: [
      { d: ell(8, 14, 5, 6) + ell(16, 14, 5, 6), fill: SAND7 },
      { d: rrect(3, 16, 18, 4, 2), fill: SAND },
      { d: drop(12, 9, 2.4), fill: SKY3 },
      { d: line(12, 3.5, 12, 1.5), stroke: CREAM, w: 1.2 }
    ],
    flavour: fl('drop', [SKY3, SKY4], { count: 6, speed: 0.1, gravity: 0.0002, size: 4 }),
    sfx: { name: 'level-up', rate: 0.85 }
  },
  camel_spit: {
    icon: [
      { d: ell(7, 14, 4.6, 3.6, -15), fill: SAND },
      { d: ell(4.6, 15.6, 1.8, 1.2), fill: SAND7, noInk: true },
      { d: drop(15, 11, 1.8), fill: SKY3 },
      { d: drop(20, 8, 1.4), fill: SKY3 },
      { d: drop(18.5, 15, 1.3), fill: CREAM2 }
    ],
    flavour: fl('drop', [SKY3, CREAM2], { count: 5, speed: 0.17, gravity: 0.0001, size: 4 }),
    sfx: { name: 'skill-rocket', rate: 0.95 }
  },
  // ── Boxa (kangaroo)
  one_two: {
    icon: [
      { d: ell(8, 13, 5, 4.6, -20), fill: RED },
      { d: ell(16, 9.5, 5, 4.6, -20), fill: RED },
      { d: rrect(3, 15, 5, 3.2, 1.4), fill: CREAM },
      { d: star(19, 18, 3.2, 1.4, 5), fill: SUN4 }
    ],
    flavour: fl('star', [SUN4, RED], { count: 5, speed: 0.16, gravity: 0.00012, size: 4.5 }),
    sfx: { name: 'skill-crit', rate: 1.1 }
  },
  bounce_back: {
    icon: [
      { d: ell(12, 9, 4.4, 5.4), fill: ORANGE },
      { d: ell(10.2, 3.8, 1.2, 3, -15) + ell(13.8, 3.8, 1.2, 3, 15), fill: ORANGE },
      { d: arc(12, 18, 6, 200, 340), stroke: PLUM3, w: 1.8 },
      { d: arc(12, 18, 9, 210, 330), stroke: PLUM3, w: 1.4 },
      { d: circ(10.6, 8.6, 0.8) + circ(13.4, 8.6, 0.8), fill: INK, noInk: true }
    ],
    flavour: fl('puff', [CREAM, PLUM3], { count: 5, speed: 0.08, gravity: -0.00004, size: 5 }),
    sfx: { name: 'skill-whoosh', rate: 1.15 }
  },
  tail_spring: {
    icon: [
      { d: spike(3, 19, 15, 3, -35), fill: ORANGE },
      { d: line(13, 20, 15, 16, 17, 20, 19, 16, 21, 20), stroke: SUN4, w: 1.6 },
      speed(3, 5)
    ],
    flavour: fl('spark', [SUN4, ORANGE], { count: 5, speed: 0.12, gravity: 0.00008, size: 4 }),
    sfx: { name: 'skill-boost', rate: 1.1 }
  },
  // ── Howler (wolf)
  pack_hunt: {
    icon: [
      { d: poly(3, 9, 6, 3, 8, 9) + poly(9, 9, 12, 3, 14, 9), fill: GREY7 },
      { d: poly(13, 15, 16, 9, 18, 15) + poly(19, 15, 21, 9, 22.5, 15), fill: GREY },
      { d: ell(8.5, 12, 5, 3.6), fill: GREY7 },
      { d: ell(17.5, 18, 4.6, 3.4), fill: GREY },
      { d: circ(7, 11.5, 0.8) + circ(10, 11.5, 0.8) + circ(16.2, 17.6, 0.7) + circ(18.8, 17.6, 0.7), fill: SUN4, noInk: true }
    ],
    flavour: fl('spark', [GREY, CREAM2], { count: 6, speed: 0.12, gravity: 0.00006, size: 4 }),
    sfx: { name: 'skill-boost', rate: 0.95 }
  },
  moon_howl: {
    icon: [
      { d: `M14 3A9 9 0 1 0 21 15A7 7 0 1 1 14 3Z`, fill: SUN3 },
      { d: poly(4, 21, 6, 13, 9, 11, 10, 7, 12, 10, 12, 21), fill: GREY7 },
      { d: arc(13, 9, 3, -60, 30) + arc(13, 9, 5.5, -50, 20), stroke: CREAM, w: 1.2 }
    ],
    flavour: fl('spark', [SUN3, CREAM], { count: 6, speed: 0.11, gravity: 0, size: 4 }),
    sfx: { name: 'skill-zap', rate: 0.9 }
  },
  fang_flurry: {
    icon: [
      { d: spike(5, 6, 8, 2, 50) + spike(11, 5, 8, 2, 60), fill: CREAM },
      { d: spike(14, 10, 8, 2, 70) + spike(4, 13, 8, 2, 40), fill: CREAM2 },
      { d: line(15, 19, 21, 19), stroke: CREAM, w: 1.5 }
    ],
    flavour: fl('quill', [CREAM, CREAM2], { count: 6, speed: 0.2, gravity: 0.00005, size: 4, align: true }),
    sfx: { name: 'skill-rocket', rate: 1.0 }
  },
  // ── Snapjaw (crocodile)
  death_roll: {
    icon: [
      { d: `M3 12A9 9 0 0 1 20 8L22 6L22 12L16 12L18 10A6 6 0 0 0 6 12Z`, fill: LEAF5 },
      { d: `M21 12A9 9 0 0 1 4 16L2 18L2 12L8 12L6 14A6 6 0 0 0 18 12Z`, fill: LEAF7 },
      { d: star(12, 12, 3, 1.3, 5), fill: SUN4 }
    ],
    flavour: fl('spark', [LEAF4, SUN4], { count: 6, speed: 0.15, gravity: 0.0001, size: 4.5 }),
    sfx: { name: 'skill-crit', rate: 0.85 }
  },
  ambush_snap: {
    icon: [
      { d: poly(2, 10, 20, 6, 22, 9, 6, 12), fill: LEAF5 },
      { d: poly(2, 14, 20, 18, 22, 15, 6, 12), fill: LEAF7 },
      { d: poly(8, 9.6, 9, 12, 10, 9.3) + poly(13, 8.6, 14, 11.6, 15, 8.2) + poly(9, 14.4, 10, 12.4, 11, 14.8), fill: CREAM, noInk: true },
      { d: circ(17, 6, 1.6), fill: SUN4 }
    ],
    flavour: fl('chip', [LEAF5, LEAF7], { count: 6, speed: 0.14, gravity: 0.0002, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.9 }
  },
  swamp_hide: {
    icon: [
      { d: shield(12, 12, 1.05), fill: LEAF7 },
      { d: poly(8, 7, 10, 5, 12, 7, 10, 9) + poly(12, 7, 14, 5, 16, 7, 14, 9) + poly(10, 11, 12, 9, 14, 11, 12, 13), fill: LEAF5, noInk: true },
      { d: arc(12, 20, 5, 200, 340), stroke: SKY3, w: 1.4 }
    ],
    flavour: fl('hex', [LEAF5, LEAF7], { count: 5, speed: 0.09, gravity: 0.00012, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.85 }
  },
  // ── Leon (lion)
  pride_pounce: {
    icon: [
      { d: ell(13, 13, 6, 5.4), fill: SUN5 },
      { d: circ(9.5, 6.5, 2) + circ(13, 5.2, 2) + circ(16.5, 6.5, 2), fill: SUN5 },
      { d: ell(13, 14, 3, 2.4), fill: SUN3, noInk: true },
      speed(1.5, 11)
    ],
    flavour: fl('star', [SUN5, SUN3], { count: 5, speed: 0.12, gravity: 0.0001, size: 4 }),
    sfx: { name: 'skill-boost', rate: 0.9 }
  },
  king_roar: {
    icon: [
      { d: star(10, 13, 8, 6, 10), fill: '#b0541c' },
      { d: circ(10, 13, 5.4), fill: SUN5 },
      { d: ell(10, 15, 2.6, 2), fill: BERRY5 },
      { d: arc(14, 13, 6, -40, 40) + arc(14, 13, 9, -35, 35), stroke: SUN3, w: 1.5 }
    ],
    flavour: fl('spark', [SUN3, SUN5], { count: 6, speed: 0.13, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-zap', rate: 0.8 }
  },
  mane_shake: {
    icon: [
      { d: star(12, 12, 9, 6.5, 12), fill: '#b0541c' },
      { d: circ(12, 12, 5.4), fill: SUN5 },
      { d: circ(10.2, 11, 0.8) + circ(13.8, 11, 0.8), fill: INK, noInk: true },
      { d: arc(12, 12, 10.5, 150, 210) + arc(12, 12, 10.5, -30, 30), stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('puff', ['#b0541c', SUN5], { count: 5, speed: 0.08, gravity: -0.00003, size: 5 }),
    sfx: { name: 'skill-whoosh', rate: 0.85 }
  },
  // ── Antlo (moose)
  antler_parry: {
    icon: [
      { d: `M3 13Q3 5 9 4L9 7L11 4L11 9Q8 9 7 13Z`, fill: '#ecd6a8' },
      { d: `M21 13Q21 5 15 4L15 7L13 4L13 9Q16 9 17 13Z`, fill: '#ecd6a8' },
      { d: ell(12, 16, 4, 5), fill: BROWN },
      { d: line(5, 20, 9, 17) + line(19, 20, 15, 17), stroke: CREAM, w: 1.4 }
    ],
    flavour: fl('chip', ['#ecd6a8', BROWN], { count: 6, speed: 0.15, gravity: 0.00015, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.8 }
  },
  bog_stomp: {
    icon: [
      { d: ell(12, 19, 9, 3.2), fill: MUD },
      { d: rrect(8, 4, 8, 11, 3), fill: BROWN },
      { d: rrect(8, 12, 8, 4, 1.5), fill: BROWN7 },
      { d: circ(4, 14, 1.3) + circ(20, 13.5, 1.5), fill: MUD }
    ],
    flavour: fl('drop', [MUD, BROWN], { count: 7, speed: 0.12, gravity: 0.00026, size: 3.5 }),
    sfx: { name: 'skill-shield', rate: 0.75 }
  },
  rut_charge: {
    icon: [
      { d: ell(15, 14, 6, 5), fill: BROWN },
      { d: `M10 9Q6 4 9 2L10 5L11 2Q13 5 12 9Z`, fill: '#ecd6a8' },
      { d: circ(17, 13, 1), fill: INK, noInk: true },
      speed(1, 12)
    ],
    flavour: fl('chip', [BROWN, '#ecd6a8'], { count: 6, speed: 0.16, gravity: 0.0002, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.8 }
  },
  // ── Gronk (gorilla)
  chest_thump: {
    icon: [
      { d: ell(12, 14, 8, 7), fill: '#3e3944' },
      { d: ell(12, 15, 5, 4.4), fill: '#9a8b9a' },
      { d: circ(6.5, 10, 2.8) + circ(17.5, 10, 2.8), fill: '#2a262e' },
      { d: arc(12, 14, 10, 240, 300) + arc(12, 14, 11.5, 250, 290), stroke: SUN3, w: 1.4 }
    ],
    flavour: fl('puff', ['#9a8b9a', CREAM2], { count: 6, speed: 0.14, gravity: 0.00004, size: 4.5 }),
    sfx: { name: 'skill-crit', rate: 0.7 }
  },
  knuckle_smash: {
    icon: [
      { d: rrect(5, 8, 13, 10, 4), fill: '#3e3944' },
      { d: circ(7.5, 9, 2) + circ(11, 8.5, 2) + circ(14.5, 9, 2), fill: '#2a262e' },
      { d: star(19.5, 18.5, 3.4, 1.4, 5), fill: SUN4 },
      { d: line(3, 21, 7, 19), stroke: CREAM, w: 1.4 }
    ],
    flavour: fl('chip', ['#3e3944', SUN4], { count: 6, speed: 0.17, gravity: 0.00022, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.75 }
  },
  banana_break: {
    icon: [
      { d: `M4 8Q6 20 20 17Q12 16 8 6Z`, fill: SUN3 },
      { d: `M8 6L7 3L9 3L9 6Z`, fill: BROWN7 },
      { d: heart(17, 7, 0.4), fill: BERRY5 }
    ],
    flavour: fl('heart', [BERRY5, SUN3], { count: 5, speed: 0.08, gravity: -0.00005, size: 4 }),
    sfx: { name: 'level-up', rate: 0.75 }
  },
  // ── Bambam (panda)
  roly_poly: {
    icon: [
      { d: circ(12, 12.5, 9), fill: SKY3 },
      { d: circ(12, 12.5, 6.2), fill: CREAM },
      { d: circ(7.5, 7.5, 2.2) + circ(16.5, 7.5, 2.2), fill: INK },
      { d: ell(10, 12, 1.4, 1.8, -20) + ell(14, 12, 1.4, 1.8, 20), fill: INK, noInk: true }
    ],
    flavour: fl('puff', [CREAM, SKY3], { count: 6, speed: 0.09, gravity: -0.00002, size: 5 }),
    sfx: { name: 'skill-shield', rate: 0.9 }
  },
  bamboo_block: {
    icon: [
      { d: rrect(5, 3, 4, 18, 1.5) + rrect(10, 3, 4, 18, 1.5) + rrect(15, 3, 4, 18, 1.5), fill: LEAF5 },
      { d: line(5, 9, 9, 9) + line(10, 12, 14, 12) + line(15, 8, 19, 8) + line(5, 15, 9, 15) + line(15, 15, 19, 15), stroke: LEAF7, w: 1.2 },
      { d: `M19 5Q23 3 23 7Q21 7 19 5Z`, fill: LEAF4 }
    ],
    flavour: fl('leaf', [LEAF5, LEAF4], { detail: LEAF7, count: 6, speed: 0.11, gravity: 0.00008, size: 4.5 }),
    sfx: { name: 'skill-shield', rate: 0.95 }
  },
  lazy_roll: {
    icon: [
      { d: circ(13, 13, 7), fill: CREAM },
      { d: circ(9.5, 9.5, 2) + circ(16.5, 16.5, 2), fill: INK },
      { d: arc(13, 13, 4, 0, 120), stroke: GREY, w: 1.2 },
      { d: line(1, 10, 4, 10) + line(1.5, 14, 4.5, 14) + line(2, 18, 5, 18), stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('zed', [PLUM3, CREAM], { count: 4, speed: 0.06, gravity: -0.00005, size: 4 }),
    sfx: { name: 'skill-whoosh', rate: 0.9 }
  },
  // ── Buford (bison)
  herd_rush: {
    icon: [
      { d: ell(15, 12, 7, 6), fill: BROWN7 },
      { d: ell(18, 16, 3.4, 2.6), fill: BROWN },
      { d: `M13 7Q11 3 14 2Q14 5 15 6Z` + `M20 7Q22 3 19 2Q19 5 18 6Z`, fill: CREAM },
      speed(1.5, 10),
      { d: circ(3, 18, 1.4) + circ(6, 20, 1.8), fill: SAND, noInk: true }
    ],
    flavour: fl('puff', [SAND, BROWN], { count: 6, speed: 0.1, gravity: -0.00002, size: 5 }),
    sfx: { name: 'skill-boost', rate: 0.7 }
  },
  dust_storm: {
    icon: [
      { d: circ(7, 15, 4) + circ(13, 12, 5) + circ(18, 15, 4), fill: SAND },
      { d: circ(10, 17, 3) + circ(16, 17.5, 3), fill: SAND7 },
      { d: line(3, 6, 9, 6) + line(12, 4, 20, 4), stroke: CREAM, w: 1.4 }
    ],
    flavour: fl('puff', [SAND, SAND7], { count: 7, speed: 0.15, gravity: 0.00002, size: 4.5 }),
    sfx: { name: 'skill-rocket', rate: 0.75 }
  },
  shaggy_coat: {
    icon: [
      { d: shield(12, 12, 1.05), fill: BROWN7 },
      { d: `M6 8Q8 12 7 15M10 6Q12 11 11 16M14 6Q16 11 15 16M18 8Q17 12 18 15`, stroke: BROWN, w: 1.6 },
      { d: bolt(19, 18, 0.6), fill: SUN3 }
    ],
    flavour: fl('wool', [BROWN, BROWN7], { count: 5, speed: 0.08, gravity: 0.0001, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.7 }
  },
  // ── Horace (rhino)
  horn_ram: {
    icon: [
      { d: ell(10, 15, 7, 5), fill: GREY },
      { d: spike(13, 13, 9, 2.6, -50), fill: CREAM },
      { d: spike(9, 11, 5, 1.8, -70), fill: CREAM2 },
      { d: star(20, 19, 2.8, 1.2, 5), fill: SUN4 }
    ],
    flavour: fl('chip', [GREY, CREAM2], { count: 6, speed: 0.17, gravity: 0.0002, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.72 }
  },
  armor_plate: {
    icon: [
      { d: rrect(3, 6, 18, 13, 4), fill: GREY },
      { d: line(9, 6, 9, 19) + line(15, 6, 15, 19), stroke: GREY7, w: 1.4 },
      { d: circ(6, 9, 0.9) + circ(18, 9, 0.9) + circ(6, 16, 0.9) + circ(18, 16, 0.9), fill: CREAM, noInk: true }
    ],
    flavour: fl('hex', [GREY, GREY7], { count: 5, speed: 0.09, gravity: 0.00014, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.72 }
  },
  thick_skull: {
    icon: [
      { d: ell(12, 13, 8, 7), fill: GREY },
      { d: ell(12, 9, 6, 3), fill: GREY7, noInk: true },
      { d: star(5, 5, 2.4, 1, 5) + star(19, 5, 2.4, 1, 5), fill: SUN3 },
      { d: bolt(12, 15, 0.6), fill: SUN4 }
    ],
    flavour: fl('star', [SUN3, GREY], { count: 6, speed: 0.12, gravity: 0, size: 4 }),
    sfx: { name: 'skill-zap', rate: 0.72 }
  },
  // ── Wallow (hippo)
  mud_bath: {
    icon: [
      { d: ell(12, 17, 9.5, 4.4), fill: MUD },
      { d: ell(12, 12, 6, 4.6), fill: '#b28aaa' },
      { d: circ(9, 8, 1.6) + circ(15, 8, 1.6), fill: '#b28aaa' },
      { d: heart(19, 5, 0.32), fill: BERRY5 },
      { d: circ(5, 14, 1) + circ(19, 14.5, 0.9), fill: CREAM2, noInk: true }
    ],
    flavour: fl('drop', [MUD, '#b28aaa'], { count: 6, speed: 0.1, gravity: 0.00024, size: 4 }),
    sfx: { name: 'level-up', rate: 0.68 }
  },
  big_yawn: {
    icon: [
      { d: ell(12, 13, 9, 8), fill: '#b28aaa' },
      { d: ell(12, 15, 6, 4.6), fill: '#7a2a40' },
      { d: poly(7.5, 11.5, 9, 15, 10.4, 11.5) + poly(13.6, 11.5, 15, 15, 16.5, 11.5), fill: CREAM, noInk: true },
      { d: `M18 3H22L18 7H22`, stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('zed', [PLUM3, CREAM2], { count: 4, speed: 0.07, gravity: -0.00006, size: 4.5 }),
    sfx: { name: 'skill-zap', rate: 0.65 }
  },
  river_wave: {
    icon: [
      { d: `M2 16Q6 6 12 10Q9 12 11 14Q16 8 22 14L22 20L2 20Z`, fill: SKY4 },
      { d: `M2 20Q7 16 12 19Q17 16 22 19L22 21L2 21Z`, fill: WOOD6 },
      { d: circ(17, 6, 1.4) + circ(20, 9, 1), fill: SKY3 }
    ],
    flavour: fl('drop', [SKY4, SKY3], { count: 7, speed: 0.15, gravity: 0.00016, size: 4 }),
    sfx: { name: 'skill-rocket', rate: 0.65 }
  },
  // ── Rumble (elephant calf)
  trunk_spray: {
    icon: [
      { d: ell(9, 11, 6, 5.4), fill: GREY },
      { d: `M7 15Q6 20 10 21Q13 21 13 18L11 18Q10 19 9.5 17.5L10 15Z`, fill: GREY },
      { d: drop(16, 8, 1.4) + drop(19.5, 12, 1.4) + drop(20, 5, 1.1), fill: SKY3 },
      { d: circ(7.5, 9.5, 0.9), fill: INK, noInk: true }
    ],
    flavour: fl('drop', [SKY3, CREAM2], { count: 7, speed: 0.17, gravity: 0.00012, size: 4 }),
    sfx: { name: 'skill-rocket', rate: 0.68 }
  },
  never_forget: {
    icon: [
      { d: ell(5.5, 12, 4, 6) + ell(18.5, 12, 4, 6), fill: GREY },
      { d: ell(5.5, 12, 2.4, 4, 0) + ell(18.5, 12, 2.4, 4, 0), fill: PINK, noInk: true },
      { d: circ(12, 11, 5.4), fill: GREY },
      { d: `M10.5 7.5L13.5 7.5L12 4Z`, fill: SUN4 },
      { d: arc(12, 11, 3, 200, 340), stroke: GREY7, w: 1.2 }
    ],
    flavour: fl('spark', [SUN4, GREY], { count: 6, speed: 0.12, gravity: 0, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.7 }
  },
  peanut_power: {
    icon: [
      { d: `M8 4A4 4 0 0 1 14 6.5A4 4 0 0 1 16 14A4 4 0 0 1 10 17.5A4 4 0 0 1 8 10A4 4 0 0 1 8 4Z`, fill: SAND },
      { d: line(9, 7, 11, 8) + line(12, 12, 14, 13), stroke: SAND7, w: 1.1 },
      { d: heart(18, 18, 0.34), fill: BERRY5 }
    ],
    flavour: fl('acorn', [SAND, SAND7], { detail: SAND7, count: 5, speed: 0.1, gravity: 0.0002, size: 4 }),
    sfx: { name: 'level-up', rate: 0.7 }
  }
}
