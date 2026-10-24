// ─── Smasher skill art registry (THE one place to repaint skill art) ────────
//
// Every one of the 36 smasher skills (src/data/smasherCatalog.ts) gets:
//   icon      flat cartoon glyph, 24×24 viewBox, a stack of filled layers with
//             a dark-brown ink outline under each (the cozy UI style) plus a
//             few stroke-only detail lines. The same path strings feed the
//             DOM (`SkillIcon.vue`, inline SVG) and the canvas (`Path2D`,
//             `drawSmasherSkillIcon`), so both always show the same shape.
//   flavour   the small thematic particle burst layered on the effect VFX
//             when the skill procs (quills, honey drops, acorns, leaves …).
//             Shapes live in FLAVOUR_SHAPES (unit box, flat fills, no blur).
//   sfx       which synthesised skill sound plays and at which playback rate
//             (the smasher's "voice": big animals lower, small ones higher).
//
// ART DESK (paint pass) — tools/skill-art (prompts → paint-queue → pack):
//   • icon:    `public/images/skills/<skillId>.webp` (128 px, transparent, art
//              only — the medallion rim + effect disc stay procedural), listed
//              in the GENERATED registry `paintedSkillArt.ts` (id → hash).
//              The DOM and the canvas pick the bitmap up; the vector stays the
//              fallback (unpainted id, image not loaded yet, `?art=procedural`).
//   • flavour: `public/images/skills/fx/<shape>.webp` (64 px), same registry.
//   Reference sheet for the painter: `pnpm dev` → /dev/skill-icons.html
//   (every icon + flavour shape, drawn by this module; ?key=1 = magenta
//   chroma background without labels).
//
// Pure data + tiny canvas helpers, no Vue. Reached only from skill modules
// (lazy, behind the skills gate), never from shared code.

import type { SkillId } from '@/types/skills'
import { SKILLS } from '@/data/skillCatalog'
import { SMASHER_LIST, type SmasherId } from '@/data/smasherCatalog'
import { prependBaseUrl } from '@/utils/function'
import { PAINTED_SKILL_FX, PAINTED_SKILL_ICONS } from '@/use/skills/paintedSkillArt'
import { BATCH_A_SKILL_ART } from '@/use/skills/smasherSkillArtBatchA'
import { BATCH_B_SKILL_ART } from '@/use/skills/smasherSkillArtBatchB'
import { BATCH_C_SKILL_ART } from '@/use/skills/smasherSkillArtBatchC'

// ─── Palette (DESIGN.md tokens, as hex because the canvas needs literals) ──

export const INK = '#161a40'
const CREAM = '#ffffff'
const CREAM2 = '#dbe8ff'
const CREAM3 = '#bcd2fb'

const WOOD7 = '#2338a8'
const WOOD6 = '#2f4fd6'
const WOOD5 = '#4570f0'
const WOOD4 = '#6f95ff'
const WOOD3 = '#a3bcff'
const LEAF3 = '#c8f76a'
const LEAF4 = '#8be33a'
const LEAF5 = '#55c81e'
const LEAF6 = '#3ea814'
const LEAF7 = '#2a830d'
const BERRY3 = '#ffa3c4'
const BERRY4 = '#ff5c8f'
const BERRY5 = '#f2306b'
const BERRY7 = '#8a0f3a'
const SUN2 = '#fff7a3'
const SUN3 = '#ffeb3b'
const SUN4 = '#ffd21a'
const SUN5 = '#ffae00'
const SKY2 = '#c6f2ff'
const SKY3 = '#7fdcff'
const SKY4 = '#38c4ff'

const PLUM3 = '#e2b6ff'
const PLUM5 = '#9c46f0'
const ORANGE = '#f08a24'
const PINK = '#f7b6c2'

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

// ─── Types ─────────────────────────────────────────────────────────────────

/** One icon layer: a filled shape (ink outline under it) or a detail line. */
export interface SkillIconLayer {
  d: string
  /** Fill colour; absent = stroke-only detail line. */
  fill?: string
  /** Detail-line colour (stroke-only layers). */
  stroke?: string
  /** Detail-line width (icon units); default 1.4. */
  w?: number
  /** Filled layer without the ink outline (inner details). */
  noInk?: boolean
}

export type FlavourShapeId =
  | 'quill' | 'chip' | 'star' | 'puff' | 'carrot' | 'drop' | 'heart' | 'wool'
  | 'leaf' | 'flame' | 'hex' | 'feather' | 'zed' | 'acorn' | 'spark'

export interface FlavourShape {
  /** Main body, unit box centred on 0 (±1), pointing +x when `align`. */
  d: string
  /** Optional second, unoutlined detail fill (e.g. the acorn cap). */
  d2?: string
}

export interface SkillFlavour {
  shape: FlavourShapeId
  /** Body colours, picked per particle (vfx-rng). */
  colors: readonly string[]
  /** Detail colour for `d2`. */
  detail?: string
  /** Particles per proc (FX.low: none). */
  count: number
  /** Launch speed, px per ms. */
  speed: number
  /** px per ms² (positive = falls, negative = floats up). */
  gravity: number
  /** Particle size (half extent), px. */
  size: number
  /** Rotate along the flight direction (quills, thorns) instead of spinning. */
  align?: boolean
  /** Fan direction in degrees (-90 = up) and spread; absent = full circle. */
  dir?: number
  spread?: number
}

export type SkillSfxBase = 'skill-shield' | 'skill-rocket' | 'skill-zap' | 'skill-crit' | 'skill-whoosh' | 'skill-boost' | 'level-up'

export interface SmasherSkillArt {
  icon: readonly SkillIconLayer[]
  flavour: SkillFlavour
  sfx: { name: SkillSfxBase; rate: number }
}

// ─── Flavour particle shapes (unit box) ────────────────────────────────────

export const FLAVOUR_SHAPES: Readonly<Record<FlavourShapeId, FlavourShape>> = {
  quill: { d: 'M-1 -0.28L1 0L-1 0.28Z' },
  chip: { d: 'M-0.9 -0.5L0.6 -0.8L1 0.4L-0.2 0.9L-1 0.3Z' },
  star: { d: star(0, 0, 1, 0.45, 5) },
  puff: { d: circ(-0.35, 0.15, 0.6) + circ(0.35, 0.1, 0.65) + circ(0, -0.35, 0.6) },
  carrot: { d: 'M-1 0L0.6 -0.5L0.8 0.5Z', d2: 'M0.6 -0.5L1 -0.9L1 0.1Z' },
  drop: { d: 'M0 -1C0.25 -0.55 0.62 -0.3 0.62 0.15A0.62 0.62 0 0 1 -0.62 0.15C-0.62 -0.3 -0.25 -0.55 0 -1Z' },
  heart: { d: heart(0, 0, 0.13) },
  wool: { d: circ(-0.4, 0.2, 0.55) + circ(0.4, 0.2, 0.55) + circ(0, -0.3, 0.6) + circ(0, 0.45, 0.5) },
  leaf: { d: 'M-1 0Q0 -0.9 1 0Q0 0.9 -1 0Z', d2: 'M-1 0L0.8 0L0.8 0.08L-1 0.08Z' },
  flame: { d: 'M0 -1C0.4 -0.4 0.7 -0.1 0.65 0.35A0.65 0.65 0 0 1 -0.65 0.35C-0.68 0 -0.3 -0.2 -0.25 -0.6C-0.1 -0.4 0 -0.4 0 -1Z' },
  hex: { d: poly(1, 0, 0.5, 0.87, -0.5, 0.87, -1, 0, -0.5, -0.87, 0.5, -0.87) },
  feather: { d: 'M-1 0Q-0.2 -0.75 1 -0.05Q-0.2 0.65 -1 0Z', d2: 'M-1 -0.04L1 -0.04L1 0.04L-1 0.04Z' },
  zed: { d: 'M-0.8 -0.9H0.8V-0.5L-0.25 0.5H0.8V0.9H-0.8V0.5L0.25 -0.5H-0.8Z' },
  acorn: { d: 'M-0.65 -0.1Q-0.65 0.75 0 1Q0.65 0.75 0.65 -0.1Z', d2: 'M-0.8 -0.05Q-0.8 -0.75 0 -0.75Q0.8 -0.75 0.8 -0.05Z' },
  spark: { d: star(0, 0, 1, 0.28, 4, 0) }
}

// ─── The 36 skills ─────────────────────────────────────────────────────────

const fl = (shape: FlavourShapeId, colors: readonly string[], o: Partial<SkillFlavour> = {}): SkillFlavour => ({
  shape, colors, count: 6, speed: 0.13, gravity: 0.00018, size: 4.5, ...o
})

// Hedgehog quills fanning up from a body.
const quillFan = (): SkillIconLayer[] => {
  const out: SkillIconLayer[] = []
  for (const a of [-160, -125, -90, -55, -20]) out.push({ d: spike(12, 15, 10.5, 1.5, a), fill: WOOD3 })
  out.push({ d: circ(12, 15.5, 5.2), fill: WOOD6 })
  out.push({ d: circ(13.6, 16.4, 1.1), fill: INK, noInk: true })
  return out
}

export const SMASHER_SKILL_ART: Readonly<Record<string, SmasherSkillArt>> = {
  // ── Bramble (hedgehog)
  quill_burst: {
    icon: [...quillFan(), { d: line(3, 20, 6, 18), stroke: CREAM }, { d: line(21, 20, 18, 18), stroke: CREAM }],
    flavour: fl('quill', [WOOD3, CREAM3], { count: 8, speed: 0.2, gravity: 0.00008, size: 5, align: true }),
    sfx: { name: 'skill-shield', rate: 1.05 }
  },
  curl_up: {
    icon: [
      { d: star(12, 12.5, 10, 7, 12), fill: WOOD7 },
      { d: circ(12, 12.5, 7), fill: WOOD5 },
      { d: circ(14.4, 14.6, 3), fill: CREAM2 },
      { d: circ(16, 15.4, 0.9), fill: INK, noInk: true },
      { d: arc(12, 12.5, 4.4, 180, 300), stroke: WOOD7, w: 1.3 }
    ],
    flavour: fl('quill', [WOOD5, WOOD3], { count: 6, speed: 0.12, gravity: 0.0001, align: true }),
    sfx: { name: 'skill-shield', rate: 1.05 }
  },
  thorn_volley: {
    icon: [
      { d: spike(4, 19, 11, 2.2, -42), fill: LEAF6 },
      { d: spike(9, 21, 10, 2, -38), fill: LEAF5 },
      { d: spike(3, 13, 10, 2, -46), fill: LEAF5 },
      { d: line(14, 8, 18, 5), stroke: CREAM },
      { d: line(18, 12, 21, 10), stroke: CREAM }
    ],
    flavour: fl('quill', [LEAF6, LEAF5], { count: 5, speed: 0.18, gravity: 0.00005, align: true }),
    sfx: { name: 'skill-rocket', rate: 1.05 }
  },
  // ── Thumper (rabbit)
  double_kick: {
    icon: [
      { d: ell(8.5, 14, 3.2, 6, -18), fill: CREAM },
      { d: ell(15.5, 12, 3.2, 6, 18), fill: CREAM },
      { d: circ(7.6, 17, 1.5) + circ(14.8, 15, 1.5), fill: PINK, noInk: true },
      { d: circ(7.5, 12.3, 0.9) + circ(9.6, 11.6, 0.9) + circ(14.3, 10.2, 0.9) + circ(16.6, 10.6, 0.9), fill: PINK, noInk: true },
      { d: star(19.5, 4.5, 3.2, 1.4, 5), fill: SUN4 }
    ],
    flavour: fl('star', [SUN4, SUN3], { count: 5, speed: 0.15, gravity: 0.00012, size: 5 }),
    sfx: { name: 'skill-crit', rate: 1.15 }
  },
  hop_dodge: {
    icon: [
      { d: ell(9.8, 7.5, 2.2, 5.5, -12), fill: CREAM },
      { d: ell(15.2, 7.5, 2.2, 5.5, 12), fill: CREAM },
      { d: ell(9.8, 7.8, 0.9, 3.6, -12) + ell(15.2, 7.8, 0.9, 3.6, 12), fill: PINK, noInk: true },
      { d: circ(12.5, 16, 5.2), fill: CREAM },
      { d: circ(10.8, 15.4, 0.8) + circ(14.2, 15.4, 0.8), fill: INK, noInk: true },
      { d: arc(4, 16, 3.5, 120, 240), stroke: PLUM3, w: 1.6 },
      { d: arc(4, 16, 6, 140, 220), stroke: PLUM3, w: 1.4 }
    ],
    flavour: fl('puff', [CREAM, CREAM2], { count: 5, speed: 0.07, gravity: -0.00004, size: 5 }),
    sfx: { name: 'skill-whoosh', rate: 1.15 }
  },
  carrot_rush: {
    icon: [
      { d: leaf(17.8, 4.8, 6, 1.2, -70) + leaf(20, 6.5, 6, 1.2, -20), fill: LEAF5 },
      { d: poly(5, 20, 14.5, 6.5, 18.5, 10.5), fill: ORANGE },
      { d: line(10, 13, 12, 14) + line(8, 16, 10, 17), stroke: BERRY7, w: 1 },
      { d: line(2, 9, 7, 9) + line(3, 13, 7, 13), stroke: CREAM, w: 1.5 }
    ],
    flavour: fl('carrot', [ORANGE], { detail: LEAF5, count: 4, speed: 0.12, gravity: 0.00014, size: 4.5 }),
    sfx: { name: 'skill-boost', rate: 1.15 }
  },
  // ── Grizzle (bear cub)
  honey_snack: {
    icon: [
      { d: ell(12, 15.5, 7.2, 6), fill: SUN5 },
      { d: rrect(6, 7.5, 12, 3.4, 1.7), fill: WOOD6 },
      { d: `M7.5 10.5Q9 14 10.5 11Q12 15.5 14 11Q15.5 13.5 16.5 10.5Z`, fill: SUN3, noInk: true },
      { d: drop(18.5, 19.5, 1.5), fill: SUN3 },
      { d: rrect(9, 15, 6, 3.4, 1.2), fill: CREAM2 }
    ],
    flavour: fl('drop', [SUN5, SUN4], { count: 6, speed: 0.1, gravity: 0.00022, size: 4 }),
    sfx: { name: 'level-up', rate: 0.85 }
  },
  bear_hug: {
    icon: [
      { d: circ(12, 13, 8.5), fill: WOOD6 },
      { d: ell(12, 15.6, 4.2, 3.3), fill: CREAM2 },
      { d: circ(7.8, 10.3, 1.7) + circ(12, 8.6, 1.7) + circ(16.2, 10.3, 1.7), fill: CREAM2 },
      { d: heart(12, 15.6, 0.32), fill: BERRY4, noInk: true }
    ],
    flavour: fl('heart', [BERRY4, PINK], { count: 4, speed: 0.07, gravity: -0.00006, size: 4.5 }),
    sfx: { name: 'skill-shield', rate: 0.85 }
  },
  grumpy_roar: {
    icon: [
      { d: circ(5.8, 6.8, 2.4) + circ(14.2, 6.8, 2.4), fill: WOOD6 },
      { d: circ(10, 12.5, 6.6), fill: WOOD6 },
      { d: ell(10, 15, 3.4, 2.6), fill: BERRY7 },
      { d: poly(7.4, 13.8, 8.4, 15.4, 9.2, 13.8) + poly(10.8, 13.8, 11.6, 15.4, 12.6, 13.8), fill: CREAM, noInk: true },
      { d: line(6.5, 9.5, 8.8, 10.6) + line(13.5, 9.5, 11.2, 10.6), stroke: INK, w: 1.3 },
      { d: arc(16, 12.5, 3.2, -45, 45) + arc(16, 12.5, 5.8, -45, 45), stroke: SUN4, w: 1.8 }
    ],
    flavour: fl('spark', [SUN4, SUN2], { count: 6, speed: 0.16, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-zap', rate: 0.85 }
  },
  // ── Chomper (beaver)
  timber_bite: {
    icon: [
      { d: ell(12, 7.5, 8.5, 4.6), fill: WOOD6 },
      { d: rrect(7.4, 8, 4.4, 10, 1.6) + rrect(12.2, 8, 4.4, 10, 1.6), fill: CREAM },
      { d: line(12, 9, 12, 17.5), stroke: CREAM3, w: 0.8 },
      { d: circ(12, 5.4, 1.3), fill: INK, noInk: true },
      { d: poly(18, 17, 21, 16, 20, 19.5) + poly(3, 18, 5.5, 17, 5, 20.5), fill: WOOD3 }
    ],
    flavour: fl('chip', [WOOD3, WOOD4], { count: 7, speed: 0.15, gravity: 0.00026, size: 3.5 }),
    sfx: { name: 'skill-crit', rate: 0.95 }
  },
  log_slam: {
    icon: [
      { d: rrect(2.5, 7.5, 16, 8.5, 4.25), fill: WOOD6 },
      { d: ell(18.2, 11.75, 3.4, 4.25), fill: WOOD3 },
      { d: ell(18.2, 11.75, 1.6, 2.1), stroke: WOOD5, w: 1 },
      { d: line(6, 10, 13, 10) + line(5, 13.5, 11, 13.5), stroke: WOOD7, w: 1 },
      { d: line(5, 19.5, 3, 22) + line(10.5, 19.5, 10.5, 22.5) + line(16, 19.5, 18, 22), stroke: SUN3, w: 1.6 }
    ],
    flavour: fl('chip', [WOOD5, WOOD6], { count: 8, speed: 0.17, gravity: 0.0003, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.8 }
  },
  dam_wall: {
    icon: [
      { d: rrect(3, 4.5, 15, 4.8, 2.4), fill: WOOD6 },
      { d: rrect(6, 9.6, 15, 4.8, 2.4), fill: WOOD5 },
      { d: rrect(3, 14.7, 15, 4.8, 2.4), fill: WOOD6 },
      { d: circ(17.6, 6.9, 2.1) + circ(20.6, 12, 2.1) + circ(17.6, 17.1, 2.1), fill: WOOD3 },
      { d: `M2 22Q5 20 8 22T14 22T20 22`, stroke: SKY4, w: 1.6 }
    ],
    flavour: fl('drop', [SKY4, SKY3], { count: 6, speed: 0.12, gravity: 0.00022, size: 3.6 }),
    sfx: { name: 'skill-shield', rate: 0.8 }
  },
  // ── Ramsey (ram)
  headbutt: {
    icon: [
      { d: circ(11, 13, 7.5), fill: CREAM3 },
      { d: arc(11, 13, 4.6, 0, 300) + arc(11, 13, 2, 60, 330), stroke: WOOD6, w: 1.5 },
      { d: star(19.5, 5, 3.6, 1.5, 5), fill: SUN4 },
      { d: line(18.5, 13, 22, 14) + line(17, 18, 20, 20.5), stroke: CREAM, w: 1.5 }
    ],
    flavour: fl('star', [SUN4, CREAM], { count: 5, speed: 0.16, gravity: 0.0001, size: 5 }),
    sfx: { name: 'skill-crit', rate: 0.9 }
  },
  horn_charge: {
    icon: [
      { d: line(1.5, 9, 5, 9) + line(1.5, 13, 4.5, 13) + line(1.5, 17, 5, 17), stroke: CREAM, w: 1.5 },
      { d: circ(13.5, 14.5, 5.4), fill: CREAM },
      { d: circ(8.6, 9.6, 3.6) + circ(18.4, 9.6, 3.6), fill: CREAM3 },
      { d: arc(8.6, 9.6, 1.7, 0, 270) + arc(18.4, 9.6, 1.7, 180, 450), stroke: WOOD6, w: 1.2 },
      { d: circ(12, 15, 0.8) + circ(15, 15, 0.8), fill: INK, noInk: true }
    ],
    flavour: fl('puff', [WOOD3, CREAM2], { count: 5, speed: 0.08, gravity: -0.00002, size: 4.5, dir: 180, spread: 80 }),
    sfx: { name: 'skill-boost', rate: 0.9 }
  },
  wool_guard: {
    icon: [
      { d: circ(7.5, 13, 4.2) + circ(12, 9.5, 4.8) + circ(16.5, 13, 4.2) + circ(9.8, 16.8, 3.8) + circ(14.2, 16.8, 3.8), fill: CREAM },
      { d: arc(12, 9.5, 2.4, 200, 320) + arc(7.5, 13, 2, 180, 280) + arc(16.5, 13, 2, 260, 360), stroke: CREAM3, w: 1.2 },
      { d: line(20, 4, 22, 2) + line(20.5, 7, 23, 6.5), stroke: SKY3, w: 1.4 }
    ],
    flavour: fl('wool', [CREAM, CREAM2], { count: 6, speed: 0.09, gravity: -0.00003, size: 5 }),
    sfx: { name: 'skill-shield', rate: 0.9 }
  },
  // ── Vixie (fox)
  trick_step: {
    icon: [
      { d: 'M3 19Q5 6 18.5 4.5Q15.5 8.5 16 12.5Q10 12.5 3 19Z', fill: ORANGE },
      { d: 'M18.5 4.5Q15.5 8.5 16 12.5Q20 10.5 21 6.5Z', fill: CREAM },
      { d: arc(14, 18, 4, 200, 340), stroke: PLUM3, w: 1.5 },
      { d: arc(14, 18, 6.5, 215, 325), stroke: PLUM3, w: 1.2 }
    ],
    flavour: fl('leaf', [ORANGE, SUN5], { detail: BERRY7, count: 5, speed: 0.09, gravity: 0.00005, size: 4.5 }),
    sfx: { name: 'skill-whoosh', rate: 1.1 }
  },
  sly_strike: {
    icon: [
      { d: 'M5 19Q10 12 13 4', stroke: INK, w: 4.2 },
      { d: 'M9.5 20.5Q14.5 13 17 5', stroke: INK, w: 4.2 },
      { d: 'M14 21Q18.5 14.5 20.5 8', stroke: INK, w: 4.2 },
      { d: 'M5 19Q10 12 13 4', stroke: CREAM, w: 2.2 },
      { d: 'M9.5 20.5Q14.5 13 17 5', stroke: CREAM, w: 2.2 },
      { d: 'M14 21Q18.5 14.5 20.5 8', stroke: CREAM, w: 2.2 },
      { d: star(5, 6, 2.6, 1, 4, 0), fill: SUN3 }
    ],
    flavour: fl('spark', [CREAM, ORANGE], { count: 5, speed: 0.17, gravity: 0, size: 4.5 }),
    sfx: { name: 'skill-crit', rate: 1.1 }
  },
  fox_fire: {
    icon: [
      { d: 'M12 2.5C15.5 7 19.5 10 18.5 15.5A6.5 6.5 0 0 1 5.5 15.5C5 11.5 8.5 10.5 8.5 6C10 8 11 9 12 2.5Z', fill: SKY4 },
      { d: 'M12 9C13.5 11 15.5 12.5 15 16A3 3 0 0 1 9 16C8.8 14 10.5 13 10.5 11C11.2 12 11.6 12 12 9Z', fill: SKY2, noInk: true },
      { d: circ(4, 5, 1.3) + circ(20, 4, 1) + circ(20.5, 20, 1.2), fill: SKY3 }
    ],
    flavour: fl('flame', [SKY4, SKY3], { count: 6, speed: 0.08, gravity: -0.00012, size: 5 }),
    sfx: { name: 'skill-rocket', rate: 1.1 }
  },
  // ── Shellby (turtle)
  shell_block: {
    icon: [
      { d: ell(12, 13, 9, 7.8), fill: LEAF6 },
      { d: poly(12, 8.5, 15.6, 10.6, 15.6, 14.8, 12, 16.9, 8.4, 14.8, 8.4, 10.6), fill: LEAF4 },
      { d: line(12, 8.5, 12, 5.3) + line(15.6, 10.6, 19.5, 9) + line(15.6, 14.8, 19.5, 16.5) + line(12, 16.9, 12, 20.7) + line(8.4, 14.8, 4.5, 16.5) + line(8.4, 10.6, 4.5, 9), stroke: LEAF7, w: 1.2 }
    ],
    flavour: fl('hex', [LEAF4, LEAF6], { count: 6, speed: 0.14, gravity: 0.00022, size: 3.5 }),
    sfx: { name: 'skill-shield', rate: 0.8 }
  },
  slow_heal: {
    icon: [
      { d: heart(12, 12.5, 1.15), fill: LEAF5 },
      { d: rrect(10.8, 7.5, 2.4, 9, 1.2) + rrect(7.5, 10.8, 9, 2.4, 1.2), fill: CREAM, noInk: true },
      { d: circ(19.5, 19.5, 3), fill: CREAM2 },
      { d: line(19.5, 17.6, 19.5, 19.5, 21, 20.5), stroke: INK, w: 1 }
    ],
    flavour: fl('heart', [LEAF4, LEAF3], { count: 4, speed: 0.05, gravity: -0.00007, size: 4.5 }),
    sfx: { name: 'level-up', rate: 0.8 }
  },
  mossy_ward: {
    icon: [
      { d: 'M12 3L19.5 6V12C19.5 16.5 16 19.6 12 21.2C8 19.6 4.5 16.5 4.5 12V6Z', fill: WOOD5 },
      { d: circ(7, 7, 2.6) + circ(10.5, 5.6, 2.8) + circ(14, 5.8, 2.7) + circ(17.2, 7.2, 2.4), fill: LEAF5 },
      { d: leaf(12, 14, 6, 1.4, -60), fill: LEAF4 },
      { d: line(10.5, 16.6, 13.5, 11.4), stroke: LEAF7, w: 0.9 }
    ],
    flavour: fl('leaf', [LEAF5, LEAF4], { detail: LEAF7, count: 5, speed: 0.08, gravity: 0.00004, size: 4.5 }),
    sfx: { name: 'skill-shield', rate: 0.75 }
  },
  // ── Pecks (woodpecker)
  peck_peck: {
    icon: [
      { d: poly(8, 4, 13, 2.5, 11.5, 7), fill: BERRY5 },
      { d: circ(10, 12, 6.2), fill: CREAM },
      { d: poly(15, 10, 22, 12.5, 15, 14.5), fill: SUN5 },
      { d: circ(11, 10.5, 1.2), fill: INK, noInk: true },
      { d: line(5, 19.5, 4, 22) + line(9, 20, 9, 22.5) + line(13, 19.5, 14, 22), stroke: SUN3, w: 1.5 }
    ],
    flavour: fl('chip', [WOOD3, WOOD4], { count: 4, speed: 0.12, gravity: 0.00026, size: 3 }),
    sfx: { name: 'skill-boost', rate: 1.2 }
  },
  drill_beak: {
    icon: [
      { d: poly(3, 6.5, 3, 17.5, 21, 12), fill: SUN5 },
      { d: line(7.5, 7.6, 6.5, 16.3) + line(12, 8.9, 11, 15) + line(16.3, 10.3, 15.6, 13.7), stroke: WOOD6, w: 1.3 },
      { d: poly(19, 4, 21.5, 3, 21, 6) + poly(19.5, 18.5, 22, 19, 20, 21), fill: WOOD3 }
    ],
    flavour: fl('chip', [WOOD4, WOOD3], { count: 6, speed: 0.17, gravity: 0.00025, size: 3.5 }),
    sfx: { name: 'skill-crit', rate: 1.2 }
  },
  feather_flurry: {
    icon: [
      { d: leaf(13, 11, 17, 3.2, -50), fill: CREAM },
      { d: leaf(17.5, 17.5, 8, 1.6, -20), fill: BERRY4 },
      { d: line(7.6, 17.5, 18.4, 4.5), stroke: WOOD5, w: 1.1 },
      { d: line(10, 11, 12, 12.5) + line(12.5, 8.5, 14.5, 10), stroke: CREAM3, w: 1 },
      { d: poly(16, 3, 19.5, 3.5, 17.5, 6), fill: BERRY5, noInk: true }
    ],
    flavour: fl('feather', [CREAM, BERRY3], { detail: WOOD5, count: 6, speed: 0.09, gravity: 0.00004, size: 5.5 }),
    sfx: { name: 'skill-rocket', rate: 1.2 }
  },
  // ── Mossy (sloth)
  lazy_shield: {
    icon: [
      { d: 'M12 13V20Q12 22 10 22Q8.5 22 8.5 20.5', stroke: INK, w: 3.2 },
      { d: 'M12 13V20Q12 22 10 22Q8.5 22 8.5 20.5', stroke: WOOD5, w: 1.6 },
      { d: 'M2.5 13A9.5 9.5 0 0 1 21.5 13Q19 11.4 16.75 13Q14.4 11.4 12 13Q9.6 11.4 7.25 13Q5 11.4 2.5 13Z', fill: LEAF5 },
      { d: line(12, 4, 12, 12) + line(12, 6, 7, 10.5) + line(12, 6, 17, 10.5), stroke: LEAF7, w: 1 }
    ],
    flavour: fl('leaf', [LEAF4, LEAF5], { detail: LEAF7, count: 5, speed: 0.07, gravity: 0.00004, size: 4.5 }),
    sfx: { name: 'skill-shield', rate: 0.85 }
  },
  nap_time: {
    icon: [
      { d: 'M14 3.5A8.5 8.5 0 1 0 20.5 17A7 7 0 1 1 14 3.5Z', fill: SUN3 },
      { d: 'M13.5 5H19V6.6L15.6 10.4H19V12H13.5V10.4L16.9 6.6H13.5Z', fill: PLUM5 },
      { d: 'M18.5 13H21.5V14L19.6 16H21.5V17H18.5V16L20.4 14H18.5Z', fill: PLUM5 },
      { d: circ(8, 14, 0.9), fill: INK, noInk: true }
    ],
    flavour: fl('zed', [PLUM3, PLUM5], { count: 3, speed: 0.04, gravity: -0.00006, size: 4.5, dir: -60, spread: 50 }),
    sfx: { name: 'skill-zap', rate: 0.7 }
  },
  leaf_mend: {
    icon: [
      { d: leaf(11, 12, 18, 4.4, -45), fill: LEAF5 },
      { d: line(5, 18, 16.5, 6.5) + line(9, 14, 8.5, 10) + line(9, 14, 13, 14.5) + line(12.5, 10.5, 12, 7.5) + line(12.5, 10.5, 15.5, 11), stroke: LEAF7, w: 1 },
      { d: circ(18.5, 18, 4), fill: CREAM },
      { d: rrect(17.7, 15.4, 1.6, 5.2, 0.8) + rrect(15.9, 17.2, 5.2, 1.6, 0.8), fill: LEAF6, noInk: true }
    ],
    flavour: fl('leaf', [LEAF4, LEAF3], { detail: LEAF6, count: 6, speed: 0.06, gravity: -0.00005, size: 4.5 }),
    sfx: { name: 'level-up', rate: 0.85 }
  },
  // ── Zippy (squirrel)
  nut_toss: {
    icon: [
      { d: 'M6 11Q6 19 11 21Q16 19 16 11Z', fill: WOOD4 },
      { d: 'M4.5 11.5Q4.5 6 11 6Q17.5 6 17.5 11.5Z', fill: WOOD7 },
      { d: rrect(10, 2.8, 2, 3.6, 1), fill: WOOD7 },
      { d: line(7, 9, 15, 9), stroke: WOOD5, w: 0.9 },
      { d: arc(11, 13, 10, -50, -10) + arc(11, 13, 7.5, -45, -15), stroke: CREAM, w: 1.4 }
    ],
    flavour: fl('acorn', [WOOD4], { detail: WOOD7, count: 4, speed: 0.13, gravity: 0.0003, size: 4.5 }),
    sfx: { name: 'skill-rocket', rate: 1.25 }
  },
  acorn_armor: {
    icon: [
      { d: 'M6 13Q12 15.5 18 13Q17 20.5 12 21.5Q7 20.5 6 13Z', fill: WOOD3 },
      { d: 'M2.5 12.5Q2.5 3.5 12 3.5Q21.5 3.5 21.5 12.5Q12 15.5 2.5 12.5Z', fill: WOOD6 },
      { d: line(6, 6, 12, 13.5) + line(11, 4, 17.5, 12.5) + line(18, 6, 12, 13.5) + line(13, 4, 6.5, 12.5), stroke: WOOD4, w: 0.9 },
      { d: star(17, 17.5, 2.6, 0.9, 4, 0), fill: CREAM }
    ],
    flavour: fl('acorn', [WOOD3, WOOD4], { detail: WOOD6, count: 4, speed: 0.12, gravity: 0.00028, size: 4 }),
    sfx: { name: 'skill-shield', rate: 1.25 }
  },
  dash_dodge: {
    icon: [
      { d: 'M7 21C2 15 3.5 5 12 3.8C18.5 3 21.5 8 19.5 12C18 15 13.5 15 13 12C12.5 10 14.5 8.8 15.5 10C13.5 6.5 7.5 8.5 8.5 14C9.2 17 11 19.5 7 21Z', fill: WOOD5 },
      { d: 'M12 3.8C18.5 3 21.5 8 19.5 12C20 8.5 17 5.5 12 6Z', fill: WOOD3, noInk: true },
      { d: line(1, 10, 3.5, 10) + line(1, 14, 3, 14), stroke: CREAM, w: 1.4 }
    ],
    flavour: fl('puff', [WOOD3, CREAM2], { count: 5, speed: 0.08, gravity: -0.00003, size: 4.5 }),
    sfx: { name: 'skill-whoosh', rate: 1.25 }
  },
  // ── Hootsie (owl)
  night_eye: {
    icon: [
      { d: circ(12, 13.5, 8.2), fill: WOOD6 },
      { d: circ(12, 13.5, 6.2), fill: SUN4 },
      { d: circ(12, 13.5, 3.2), fill: INK, noInk: true },
      { d: circ(13.4, 12, 1.2), fill: CREAM, noInk: true },
      { d: poly(2.5, 4, 12, 7.5, 21.5, 4, 20, 7.5, 12, 10, 4, 7.5), fill: WOOD7 }
    ],
    flavour: fl('spark', [SUN3, SUN2], { count: 6, speed: 0.15, gravity: 0, size: 4 }),
    sfx: { name: 'skill-crit', rate: 1 }
  },
  wing_ward: {
    icon: [
      { d: 'M3.5 5C10 4 18.5 6.5 20.5 12C17.5 12 18.5 14 16.5 15C14.5 15 15.5 17.5 12.5 18C10.5 18 11.5 20.5 8.5 20.5C5 17.5 3 12 3.5 5Z', fill: CREAM2 },
      { d: 'M5 8C10 8 14 10 16.5 12.5M5.5 11.5C9 12 11.5 13.5 13 15.5M6 15C8 15.5 9.5 16.5 10 18', stroke: WOOD4, w: 1.1 },
      { d: arc(12, 12, 10.5, 200, 250), stroke: LEAF3, w: 1.5 }
    ],
    flavour: fl('feather', [CREAM2, CREAM], { detail: WOOD4, count: 5, speed: 0.08, gravity: 0.00003, size: 5 }),
    sfx: { name: 'skill-shield', rate: 1 }
  },
  static_feathers: {
    icon: [
      { d: leaf(9.5, 13, 15, 3, -60), fill: CREAM2 },
      { d: line(5.8, 19.5, 13.2, 6.5), stroke: WOOD4, w: 1 },
      { d: poly(15, 2.5, 11, 12, 14.5, 12, 12.5, 21.5, 20, 9.5, 16.5, 9.5, 18.5, 2.5), fill: SUN4 }
    ],
    flavour: fl('spark', [SUN4, CREAM], { count: 6, speed: 0.15, gravity: 0, size: 4 }),
    sfx: { name: 'skill-zap', rate: 1 }
  },
  // ── Tuskar (boar)
  tusk_toss: {
    icon: [
      { d: 'M7.5 15Q2.5 11 4.5 3.5Q6.5 10 10 12.5Z', fill: CREAM },
      { d: 'M16.5 15Q21.5 11 19.5 3.5Q17.5 10 14 12.5Z', fill: CREAM },
      { d: ell(12, 15.5, 5.6, 4.4), fill: BERRY3 },
      { d: ell(10, 15.5, 1, 1.5) + ell(14, 15.5, 1, 1.5), fill: BERRY7, noInk: true }
    ],
    flavour: fl('puff', [WOOD7, WOOD6], { count: 6, speed: 0.13, gravity: 0.00018, size: 4 }),
    sfx: { name: 'skill-crit', rate: 0.85 }
  },
  mud_roll: {
    icon: [
      {
        d: circ(12, 12.5, 6.2) + circ(5.5, 9.5, 2.4) + circ(18.5, 9, 2.2) + circ(7, 18.5, 2.2) + circ(17.5, 18, 2.6) + circ(12, 5, 2),
        fill: WOOD7
      },
      { d: circ(3, 15, 1.2) + circ(21, 14, 1.1) + circ(12, 21.5, 1.2), fill: WOOD6 },
      { d: ell(10.3, 10.6, 2, 1.2, -30), fill: WOOD5, noInk: true }
    ],
    flavour: fl('puff', [WOOD7, WOOD6], { count: 8, speed: 0.15, gravity: 0.00026, size: 4 }),
    sfx: { name: 'skill-shield', rate: 0.75 }
  },
  stampede: {
    icon: [
      { d: ell(6, 16, 1.8, 3.4, -15) + ell(9.4, 15.2, 1.8, 3.4, -15), fill: WOOD7 },
      { d: ell(14, 8, 1.8, 3.4, -15) + ell(17.4, 7.2, 1.8, 3.4, -15), fill: WOOD7 },
      { d: circ(15, 18, 2.4) + circ(18.5, 17, 2.8) + circ(21, 19.5, 1.8), fill: CREAM2 }
    ],
    flavour: fl('puff', [WOOD3, CREAM2], { count: 6, speed: 0.09, gravity: -0.00002, size: 5 }),
    sfx: { name: 'skill-boost', rate: 0.85 }
  },
  // Batch A (forest-floor critters) — src/use/skills/smasherSkillArtBatchA.ts.
  ...BATCH_A_SKILL_ART,
  // Batch B (heavyweights) — art lives next to their models.
  ...BATCH_B_SKILL_ART,
  // Batch C (sky, water & oddballs) — src/use/skills/smasherSkillArtBatchC.ts.
  ...BATCH_C_SKILL_ART
}

// ─── Lookups ───────────────────────────────────────────────────────────────

/** smasherId → effect → smasher skill id (each smasher has 3 distinct effects). */
const KEY_BY_SMASHER: Partial<Record<string, Partial<Record<SkillId, string>>>> = (() => {
  const out: Partial<Record<string, Partial<Record<SkillId, string>>>> = {}
  for (const s of SMASHER_LIST) {
    const m: Partial<Record<SkillId, string>> = {}
    for (const sk of s.skills) m[sk.effect] = sk.id
    out[s.id] = m
  }
  return out
})()

/** The smasher skill a blade of `smasherId` runs on `effect`; '' if none. */
export const smasherSkillKey = (smasherId: SmasherId | string | undefined, effect: SkillId): string =>
  (smasherId !== undefined ? KEY_BY_SMASHER[smasherId]?.[effect] : undefined) ?? ''

export const smasherSkillArt = (key: string | undefined): SmasherSkillArt | null =>
  key ? SMASHER_SKILL_ART[key] ?? null : null

/** `?art=procedural` (A/B): every skill icon / flavour sprite stays drawn. */
const ART_PROCEDURAL = typeof location !== 'undefined' && /[?&]art=procedural(?:&|$)/.test(location.search)

/** Painted icon URL (art desk, with its cache key), or null while the drawing is in use. */
export const paintedSkillIconUrl = (key: string): string | null => {
  const v = SMASHER_SKILL_ART[key] && !ART_PROCEDURAL ? PAINTED_SKILL_ICONS[key] : undefined
  return v ? prependBaseUrl(`images/skills/${key}.webp?v=${v}`) : null
}

/** Painted flavour sprite URL, or null while the drawing is in use. */
export const paintedFlavourUrl = (shape: FlavourShapeId): string | null => {
  const v = ART_PROCEDURAL ? undefined : PAINTED_SKILL_FX[shape]
  return v ? prependBaseUrl(`images/skills/fx/${shape}.webp?v=${v}`) : null
}

// ─── Canvas drawing ────────────────────────────────────────────────────────

const pathCache = new Map<string, Path2D | null>()
const path2d = (d: string): Path2D | null => {
  let p = pathCache.get(d)
  if (p === undefined) {
    p = typeof Path2D === 'undefined' ? null : new Path2D(d)
    pathCache.set(d, p)
  }
  return p
}

const paintedCache = new Map<string, HTMLImageElement | null>()
const paintedImage = (key: string): HTMLImageElement | null => {
  const url = paintedSkillIconUrl(key)
  if (url === null || typeof Image === 'undefined') return null
  let img = paintedCache.get(key)
  if (img === undefined) {
    img = new Image()
    img.src = url
    paintedCache.set(key, img)
  }
  return img !== null && img.complete && img.naturalWidth > 0 ? img : null
}

/** Draw one icon's layers into the 24×24 box at (x, y) with size `size`. */
export function drawIconLayers(
  ctx: CanvasRenderingContext2D,
  layers: readonly SkillIconLayer[],
  x: number,
  y: number,
  size: number
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const L of layers) {
    const p = path2d(L.d)
    if (p === null) continue
    if (L.fill === undefined) {
      ctx.strokeStyle = L.stroke ?? INK
      ctx.lineWidth = L.w ?? 1.4
      ctx.stroke(p)
      continue
    }
    if (!L.noInk) {
      ctx.strokeStyle = INK
      ctx.lineWidth = 2.2
      ctx.stroke(p)
    }
    ctx.fillStyle = L.fill
    ctx.fill(p)
  }
  ctx.restore()
}

/**
 * The skill medallion on canvas, centred on (cx, cy), `size` = diameter:
 * ink edge, the effect's accent disc, then the smasher skill's drawing (or
 * its painting, or the generic effect glyph when `key` has no art).
 */
export function drawSmasherSkillIcon(
  ctx: CanvasRenderingContext2D,
  key: string,
  effect: SkillId,
  cx: number,
  cy: number,
  size: number
): void {
  const r = size / 2
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = INK
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2)
  ctx.fillStyle = SKILLS[effect].color
  ctx.fill()
  const inner = size * 0.78
  const img = key ? paintedImage(key) : null
  if (img !== null) {
    ctx.drawImage(img, cx - inner / 2, cy - inner / 2, inner, inner)
    return
  }
  const art = smasherSkillArt(key)
  if (art !== null) {
    drawIconLayers(ctx, art.icon, cx - inner / 2, cy - inner / 2, inner)
    return
  }
  // Fallback: the generic effect glyph in cream with an ink edge.
  const p = path2d(SKILLS[effect].icon)
  if (p === null) return
  ctx.save()
  ctx.translate(cx - inner * 0.4, cy - inner * 0.4)
  ctx.scale((inner * 0.8) / 24, (inner * 0.8) / 24)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.6
  ctx.stroke(p)
  ctx.fillStyle = CREAM
  ctx.fill(p)
  ctx.restore()
}

const paintedFxCache = new Map<string, HTMLImageElement>()
/** Painted flavour sprite (art desk), or null while the drawing is in use. */
export const paintedFlavourImage = (shape: FlavourShapeId): HTMLImageElement | null => {
  const url = paintedFlavourUrl(shape)
  if (url === null || typeof Image === 'undefined') return null
  let img = paintedFxCache.get(shape)
  if (img === undefined) {
    img = new Image()
    img.src = url
    paintedFxCache.set(shape, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

/** Tests / QA: a flavour shape's Path2D (null without Path2D). */
export const flavourPath = (shape: FlavourShapeId, detail = false): Path2D | null => {
  const s = FLAVOUR_SHAPES[shape]
  const d = detail ? s.d2 : s.d
  return d ? path2d(d) : null
}

