// ─── Smasher rig ────────────────────────────────────────────────────────────
//
// Every smasher (src/data/smasherCatalog.ts) is defined ONCE as a small 3D
// parametric model — ellipsoids for body / head / ears / snout / limbs / tail,
// cones for spikes / horns / beaks / tusks, plus surface DECALS (eyes, angry
// brows, frowns, fangs, belly patches, stitched seams) that live on an
// ellipsoid's surface — and projected orthographically at a yaw angle. The
// 32 battle frames (yaw = i · 11.25°) are therefore the same character from
// every side: proportions, limbs and colours cannot drift between angles.
//
// Model space: disc radius = 1, x right, y towards the camera at yaw 0, z up.
// The character sits on the disc's top face (z = 0). The camera looks down at
// CAM_ELEVATION (3/4 top-down, to match the top-down arena).
//
// Draw order is a part tree (painter's algorithm): a child part is drawn in
// front of its parent when its sort direction (default: its offset from the
// parent) faces the camera, behind it otherwise.
//
// Shading is flat cartoon only — base fill, one darker crescent, one light
// patch as an offset ellipse, thick dark outlines. NO radial gradients, NO
// ctx.filter, NO shadowBlur (project performance rule). Pure: no DOM access,
// it draws into whatever 2D context it is handed.

import { SMASHER_IDS, type SmasherId } from '@/data/smasherCatalog'

export const YAW_FRAMES = 32
/** Sheet / atlas grid: 8 columns × 4 rows. */
export const YAW_COLS = 8
export const YAW_STEP = (Math.PI * 2) / YAW_FRAMES
/** Camera elevation above the arena plane. */
export const CAM_ELEVATION = (55 * Math.PI) / 180
export const CAM_COS = Math.cos(CAM_ELEVATION)
export const CAM_SIN = Math.sin(CAM_ELEVATION)
/** Disc top-face squash on screen (a circle of radius 1 → ellipse 1 × DISC_SQUASH). */
export const DISC_SQUASH = CAM_SIN
/** Disc thickness in model units (its side band drops this × CAM_COS on screen). */
export const DISC_THICKNESS = 0.2

/** Frame box in model units around the disc centre's screen position. Every
 *  frame of every smasher fits inside it (tests/smasherRig.test.ts). */
export const FRAME_BOX = { left: -1.5, top: -2.05, right: 1.5, bottom: 1.0 } as const
export const FRAME_W = FRAME_BOX.right - FRAME_BOX.left
export const FRAME_H = FRAME_BOX.bottom - FRAME_BOX.top

// ─── Palettes ────────────────────────────────────────────────────────────────

export interface SmasherPalette {
  /** Main plush fabric. */
  fur: string
  /** Belly / muzzle / inner-ear patches. */
  belly: string
  /** Signature feature: spikes, wool, shell, crest, tail … */
  accent: string
  /** Secondary feature: horns, teeth, beak, claws, tusks … */
  accent2: string
  nose: string
  iris: string
  outline: string
}

export const SIGNATURE_PALETTES: Readonly<Record<SmasherId, SmasherPalette>> = Object.freeze({
  bramble: { fur: '#e3a36b', belly: '#fbe2bf', accent: '#6e4630', accent2: '#f4ead8', nose: '#2b1b16', iris: '#3a2416', outline: '#2a1812' },
  thumper: { fur: '#b8c8ee', belly: '#f6f3fb', accent: '#f39bb5', accent2: '#ffffff', nose: '#ef6f95', iris: '#2a3b78', outline: '#1f2340' },
  grizzle: { fur: '#7a4a2e', belly: '#e0b07a', accent: '#5a3220', accent2: '#f4ead8', nose: '#24140e', iris: '#2a160c', outline: '#1e100a' },
  chomper: { fur: '#b0662f', belly: '#efc79a', accent: '#4b5368', accent2: '#ffb83d', nose: '#2b1a12', iris: '#2b1a12', outline: '#24140c' },
  ramsey: { fur: '#5c5866', belly: '#8a8596', accent: '#f4ecdc', accent2: '#d9a95c', nose: '#2a2630', iris: '#5a3a12', outline: '#1d1a22' },
  vixie: { fur: '#f07a2a', belly: '#fff3e6', accent: '#2a1d1d', accent2: '#ffffff', nose: '#231616', iris: '#2c6a3a', outline: '#2a140a' },
  shellby: { fur: '#8fd26e', belly: '#e9e3a6', accent: '#4e7d38', accent2: '#d8b45f', nose: '#24361a', iris: '#2b2410', outline: '#1a2810' },
  pecks: { fur: '#30374d', belly: '#f5f2ea', accent: '#e8352e', accent2: '#f6c33d', nose: '#1b1f2c', iris: '#1b1f2c', outline: '#141826' },
  mossy: { fur: '#b5a98a', belly: '#e9dfc4', accent: '#6dae46', accent2: '#3d3a33', nose: '#2c2620', iris: '#4a2e18', outline: '#28221a' },
  zippy: { fur: '#9c93b6', belly: '#fbf0dc', accent: '#c2b8dc', accent2: '#a8682d', nose: '#3c2a3a', iris: '#2c2240', outline: '#211b30' },
  hootsie: { fur: '#7259a8', belly: '#f0e2c0', accent: '#4a3878', accent2: '#ffa53a', nose: '#3a2410', iris: '#f5b400', outline: '#1d1430' },
  tuskar: { fur: '#7a5560', belly: '#f2a7a7', accent: '#3a2629', accent2: '#fff6e2', nose: '#7c3a40', iris: '#3a1010', outline: '#22141a' }
})

// ─── Colour helpers (palette variants) ───────────────────────────────────────

type RGB = [number, number, number]
const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHex = ([r, g, b]: RGB): string =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

export const mixHex = (a: string, b: string, t: number): string => {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

const rgbToHsl = ([r, g, b]: RGB): RGB => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}
const hslToRgb = ([h, s, l]: RGB): RGB => {
  h = ((h % 360) + 360) % 360 / 360
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

/** Hue-rotate (degrees) and scale saturation / lightness of one colour. */
export const shiftHex = (hex: string, hue: number, sat = 1, light = 1): string => {
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  return rgbToHex(hslToRgb([h + hue, Math.min(1, s * sat), Math.min(0.97, l * light)]))
}

// ─── Model description ───────────────────────────────────────────────────────

type V3 = [number, number, number]
/** (azimuth, elevation) on an ellipsoid surface; az 0 = the part's front (+y), + = its right (+x). */
type SP = [number, number]

interface Decal {
  /** 'eye' = white disc + pupil + highlight; 'disc' = filled patch; 'poly' = polyline/polygon. */
  t: 'eye' | 'disc' | 'poly'
  at?: SP
  /** Angular half-size (az, el) for eye/disc. */
  size?: [number, number]
  pts?: SP[]
  fill?: string
  stroke?: string
  /** Line width in model units. */
  w?: number
  dash?: boolean
  closed?: boolean
  /** Eye: pupil offset (az, el) relative to the eye size. */
  look?: [number, number]
  /** Eye iris colour. */
  iris?: string
}

interface Part {
  k: 'e' | 'c'
  /** Ellipsoid centre / cone base centre. */
  c: V3
  /** Ellipsoid radii. */
  r?: V3
  /** Ellipsoid local rotation (about x, then y, then z), radians. */
  rot?: V3
  /** Cone tip and base radius. */
  tip?: V3
  w?: number
  col: string
  kids: Part[]
  decals: Decal[]
  /** Sort direction against the parent; default = offset from the parent. */
  sd?: V3
  /** Skip the shading crescent / light patch. */
  flat?: boolean
  /** Outline width multiplier. */
  lw?: number
}

const E = (c: V3, r: V3, col: string, o: Partial<Part> = {}): Part =>
  ({ k: 'e', c, r, col, kids: [], decals: [], ...o })
const C = (c: V3, tip: V3, w: number, col: string, o: Partial<Part> = {}): Part =>
  ({ k: 'c', c, tip, w, col, kids: [], decals: [], ...o })
const add = (p: Part, ...kids: Part[]): Part => { p.kids.push(...kids); return p }
const mirrorV = ([x, y, z]: V3): V3 => [-x, y, z]
/** Mirror a part tree across x = 0. */
const mirror = (p: Part): Part => ({
  ...p,
  c: mirrorV(p.c),
  tip: p.tip ? mirrorV(p.tip) : undefined,
  rot: p.rot ? [p.rot[0], -p.rot[1], -p.rot[2]] : undefined,
  sd: p.sd ? mirrorV(p.sd) : undefined,
  decals: p.decals.map(d => ({
    ...d,
    at: d.at ? [-d.at[0], d.at[1]] : undefined,
    pts: d.pts?.map(([a, e]) => [-a, e] as SP),
    look: d.look ? [-d.look[0], d.look[1]] : undefined
  })),
  kids: p.kids.map(mirror)
})
/** A part and its mirror image. */
const pair = (p: Part): Part[] => [p, mirror(p)]

export interface RigOptions {
  /** Crown + war paint for campaign bosses. */
  boss?: boolean
}

// Face kit ──────────────────────────────────────────────────────────────────

interface FaceOpts {
  eyeAz?: number
  eyeEl?: number
  eyeSize?: number
  browW?: number
  mouth?: 'frown' | 'fangs' | 'teeth' | 'none'
  mouthEl?: number
  mouthW?: number
  iris: string
  outline: string
  /** Brow colour (default outline). */
  brow?: string
}

/** Two big cute eyes with angry slanted brows, + a frown with tiny fangs. */
const face = (o: FaceOpts): Decal[] => {
  const az = o.eyeAz ?? 0.36
  // +0.12: the camera looks down at 55°, eyes set a bit higher face it more
  const el = (o.eyeEl ?? 0.12) + 0.12
  const s = (o.eyeSize ?? 0.2) * 1.08
  const out: Decal[] = []
  for (const side of [-1, 1]) {
    out.push({ t: 'eye', at: [side * az, el], size: [s * 0.82, s], iris: o.iris, look: [-side * 0.18, -0.12] })
    out.push({
      t: 'poly',
      pts: [[side * (az + s * 1.0), el + s * 1.35], [side * (az - s * 0.95), el + s * 0.72]],
      stroke: o.brow ?? o.outline,
      w: o.browW ?? 0.075
    })
  }
  const me = o.mouthEl ?? -0.2
  const mw = o.mouthW ?? 0.16
  if (o.mouth !== 'none') {
    out.push({ t: 'poly', pts: [[-mw, me - 0.05], [-mw * 0.4, me], [0, me + 0.01], [mw * 0.4, me], [mw, me - 0.05]], stroke: o.outline, w: 0.045 })
    if (o.mouth === 'fangs' || o.mouth === undefined) {
      for (const side of [-1, 1]) {
        out.push({
          t: 'poly',
          pts: [[side * mw * 0.62, me - 0.012], [side * mw * 0.3, me + 0.002], [side * mw * 0.46, me - 0.1]],
          fill: '#ffffff', stroke: o.outline, w: 0.02, closed: true
        })
      }
    } else if (o.mouth === 'teeth') {
      out.push({
        t: 'poly',
        pts: [[-mw * 0.38, me + 0.004], [mw * 0.38, me + 0.004], [mw * 0.38, me - 0.17], [-mw * 0.38, me - 0.17]],
        fill: '#fff6e0', stroke: o.outline, w: 0.025, closed: true
      })
      out.push({ t: 'poly', pts: [[0, me + 0.004], [0, me - 0.17]], stroke: o.outline, w: 0.018 })
    }
  }
  return out
}

/** Oval belly patch with a stitched border. */
const bellyPatch = (fill: string, stitch: string, az: number, el: number, saz: number, sel: number): Decal => {
  const pts: SP[] = []
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    pts.push([az + Math.sin(a) * saz, el + Math.cos(a) * sel])
  }
  return { t: 'poly', pts, fill, stroke: stitch, w: 0.03, dash: true, closed: true }
}

/** Vertical stitched seam (meridian) over a part's surface. */
const seam = (stitch: string, az: number, el0: number, el1: number): Decal => {
  const pts: SP[] = []
  for (let i = 0; i <= 10; i++) pts.push([az, el0 + ((el1 - el0) * i) / 10])
  return { t: 'poly', pts, stroke: stitch, w: 0.028, dash: true }
}

/** Gold crown + red war paint for bosses (added on top of a head part). */
const crownOn = (head: Part, top: number, rad: number, outline: string): Part => {
  const [x, y] = head.c
  const band = E([x, y, top], [rad, rad, rad * 0.4], '#f2c230', { sd: [0, 0, 1], lw: 0.8 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const bx = x + Math.sin(a) * rad * 0.85
    const by = y + Math.cos(a) * rad * 0.85
    band.kids.push(C([bx, by, top + rad * 0.2], [bx + Math.sin(a) * rad * 0.12, by + Math.cos(a) * rad * 0.12, top + rad * 1.25], rad * 0.32, '#f7cf3c', { sd: [Math.sin(a), Math.cos(a), 0.4] }))
  }
  band.decals.push({ t: 'disc', at: [0, 0], size: [0.22, 0.5], fill: '#e8364a' })
  void outline
  return band
}

const warPaint = (pts: number): Decal[] => {
  const out: Decal[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i < pts; i++) {
      const el = -0.02 - i * 0.12
      out.push({ t: 'poly', pts: [[side * 0.55, el], [side * 0.82, el - 0.04]], stroke: '#d8202e', w: 0.05 })
    }
  }
  return out
}

// ─── The twelve smashers ─────────────────────────────────────────────────────

type Builder = (p: SmasherPalette, o: RigOptions) => Part

/** Darker stitch colour for a fabric. */
const stitchOf = (p: SmasherPalette, base: string) => mixHex(base, p.outline, 0.45)

const BUILDERS: Record<SmasherId, Builder> = {
  // Hedgehog — round tan face, a crown of dark quills down its back.
  bramble: (p, o) => {
    const body = E([0, 0, 0.62], [0.68, 0.62, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.05, 0.55, 0.62))
    const head = E([0, 0.12, 1.32], [0.56, 0.5, 0.48], p.fur)
    const snout = E([0, 0.56, 1.22], [0.2, 0.26, 0.17], p.belly, { rot: [-0.25, 0, 0] })
    snout.kids.push(E([0, 0.8, 1.29], [0.09, 0.07, 0.07], p.nose, { flat: true }))
    snout.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0, mouth: 'fangs', mouthEl: -0.35, mouthW: 0.5 }).filter(d => d.t === 'poly' && !d.at && (d.pts?.length ?? 0) !== 2))
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.42, eyeEl: 0.22, eyeSize: 0.22, mouth: 'none' }))
    head.kids.push(snout)
    head.kids.push(...pair(E([0.4, 0.06, 1.66], [0.12, 0.07, 0.12], p.belly, { sd: [0.3, 0.6, 0.2] })))
    // quills: rings over the back half of head + body
    const quills: Part[] = []
    for (let ring = 0; ring < 4; ring++) {
      const el = 1.05 - ring * 0.33
      const n = 7 + ring
      for (let i = 0; i < n; i++) {
        const az = Math.PI * (0.38 + (1.24 * i) / (n - 1)) // back arc
        const pz = 0.65 + Math.sin(el) * 0.82 + 0.1
        const rr = 0.55 + Math.cos(el) * 0.2
        const bx = Math.sin(az) * rr * Math.cos(el) * 1.05
        const by = Math.cos(az) * rr * Math.cos(el) * 1.05 - 0.05
        const dir: V3 = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el) - 0.15, Math.sin(el) + 0.25]
        const len = 0.45
        quills.push(C([bx, by, pz], [bx + dir[0] * len, by + dir[1] * len, pz + dir[2] * len], 0.13, ring % 2 ? mixHex(p.accent, p.belly, 0.25) : p.accent, { sd: [dir[0], dir[1], -0.3], lw: 0.8 }))
      }
    }
    body.kids.push(head, ...quills)
    body.kids.push(...pair(E([0.55, 0.32, 0.6], [0.14, 0.16, 0.24], p.fur, { rot: [0.3, 0.5, 0] })))
    body.kids.push(...pair(E([0.3, 0.52, 0.14], [0.2, 0.26, 0.13], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.78, 0.28, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Rabbit — slim, huge upright ears, big feet, buck teeth, pompom tail.
  thumper: (p, o) => {
    const body = E([0, 0, 0.58], [0.5, 0.46, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.05, 0.5, 0.6), seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.8))
    const head = E([0, 0.06, 1.3], [0.48, 0.42, 0.42], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.12, eyeSize: 0.22, mouth: 'teeth', mouthEl: -0.32, mouthW: 0.14 }))
    head.decals.push({ t: 'disc', at: [0, -0.14], size: [0.1, 0.07], fill: p.nose })
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.52, -0.16], size: [0.12, 0.08], fill: mixHex(p.accent, p.fur, 0.35) })
    const ear = E([0.2, -0.02, 1.95], [0.12, 0.07, 0.42], p.fur, { rot: [-0.18, 0.28, 0], sd: [0.2, -0.3, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0.05], size: [0.38, 0.75], fill: p.accent })
    head.kids.push(...pair(ear))
    body.kids.push(head)
    body.kids.push(...pair(E([0.42, 0.3, 0.6], [0.12, 0.13, 0.22], p.fur, { rot: [0.4, 0.4, 0] })))
    body.kids.push(...pair(E([0.28, 0.5, 0.1], [0.17, 0.36, 0.1], p.fur, { sd: [0, 1, 0] })))
    body.kids.push(E([0, -0.5, 0.42], [0.2, 0.2, 0.2], p.accent2, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.7, 0.24, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Bear cub — wide and chunky, round ears, honey muzzle.
  grizzle: (p, o) => {
    const body = E([0, 0, 0.62], [0.78, 0.66, 0.62], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.05, 0.5, 0.55), seam(stitchOf(p, p.fur), Math.PI, -0.7, 0.8))
    const head = E([0, 0.1, 1.38], [0.6, 0.52, 0.5], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.42, eyeEl: 0.2, eyeSize: 0.19, mouth: 'none', browW: 0.09 }))
    const muzzle = E([0, 0.52, 1.24], [0.26, 0.2, 0.18], p.belly)
    muzzle.kids.push(E([0, 0.68, 1.33], [0.11, 0.07, 0.07], p.nose, { flat: true }))
    muzzle.decals.push(...face({ iris: p.iris, outline: p.outline, mouth: 'fangs', mouthEl: -0.32, mouthW: 0.42 }).filter(d => !d.at && (d.pts?.length ?? 0) !== 2))
    const ear = E([0.44, 0.0, 1.82], [0.17, 0.1, 0.16], p.fur, { sd: [0.3, -0.2, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.6, 0.55], fill: p.belly })
    head.kids.push(muzzle, ...pair(ear))
    body.kids.push(head)
    body.kids.push(...pair(E([0.66, 0.28, 0.62], [0.2, 0.2, 0.3], p.fur, { rot: [0.35, 0.45, 0] })))
    body.kids.push(...pair(E([0.38, 0.55, 0.16], [0.24, 0.26, 0.16], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.86, 0.3, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Beaver — pear-shaped, huge orange buck teeth, flat paddle tail.
  chomper: (p, o) => {
    const body = E([0, 0, 0.6], [0.62, 0.58, 0.62], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.1, 0.5, 0.55))
    const head = E([0, 0.1, 1.34], [0.52, 0.47, 0.44], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.36, eyeEl: 0.22, eyeSize: 0.2, mouth: 'none' }))
    const muzzle = E([0, 0.48, 1.18], [0.28, 0.18, 0.17], p.belly)
    muzzle.kids.push(E([0, 0.63, 1.28], [0.1, 0.06, 0.06], p.nose, { flat: true }))
    muzzle.decals.push({ t: 'poly', pts: [[-0.36, -0.28], [-0.1, -0.18], [0, -0.22], [0.1, -0.18], [0.36, -0.28]], stroke: p.outline, w: 0.04 })
    muzzle.decals.push({ t: 'poly', pts: [[-0.17, -0.22], [0.17, -0.22], [0.17, -0.8], [-0.17, -0.8]], fill: p.accent2, stroke: p.outline, w: 0.025, closed: true })
    muzzle.decals.push({ t: 'poly', pts: [[0, -0.22], [0, -0.8]], stroke: p.outline, w: 0.02 })
    head.kids.push(muzzle, ...pair(E([0.42, 0.0, 1.66], [0.11, 0.07, 0.1], p.fur, { sd: [0.4, -0.2, 1] })))
    const tail = E([0, -0.78, 0.18], [0.36, 0.5, 0.08], p.accent, { rot: [-0.25, 0, 0], sd: [0, -1, 0] })
    for (let i = -2; i <= 2; i++) tail.decals.push({ t: 'poly', pts: [[i * 0.35 - 0.3, 1.3], [i * 0.35 + 0.3, 1.3]], stroke: mixHex(p.accent, p.outline, 0.4), w: 0.02 })
    tail.decals.push({ t: 'poly', pts: [[-0.6, 1.4], [-0.2, 1.4], [0.2, 1.4], [0.6, 1.4]], stroke: mixHex(p.accent, '#ffffff', 0.25), w: 0.02, dash: true })
    body.kids.push(head, tail)
    body.kids.push(...pair(E([0.5, 0.3, 0.62], [0.13, 0.15, 0.22], p.fur, { rot: [0.4, 0.4, 0] })))
    body.kids.push(...pair(E([0.3, 0.5, 0.12], [0.18, 0.25, 0.12], p.accent, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.74, 0.26, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Ram — puffy cloud of wool, dark face, big curled golden horns.
  ramsey: (p, o) => {
    const body = E([0, 0, 0.6], [0.66, 0.6, 0.58], p.accent)
    const puffs: Part[] = []
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      puffs.push(E([Math.sin(a) * 0.6, Math.cos(a) * 0.52, 0.72 + (i % 2) * 0.22], [0.25, 0.25, 0.24], p.accent, { lw: 0.8 }))
    }
    const head = E([0, 0.32, 1.3], [0.4, 0.4, 0.42], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.1, eyeSize: 0.22, mouth: 'fangs', mouthEl: -0.42, mouthW: 0.2, brow: '#111' }))
    head.decals.push({ t: 'disc', at: [0, -0.24], size: [0.14, 0.07], fill: p.nose })
    const tuft = E([0, 0.22, 1.7], [0.3, 0.26, 0.17], p.accent, { lw: 0.8 })
    const horn = (side: number): Part[] => {
      const out: Part[] = []
      const steps = 6
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1)
        const a = -0.6 + t * 4.2
        const R = 0.3 - t * 0.12
        out.push(E([side * (0.42 + 0.08 * t), 0.26 + Math.cos(a) * R * 0.5 - 0.05, 1.42 + Math.sin(a) * R], [0.11 - t * 0.04, 0.12 - t * 0.04, 0.11 - t * 0.04], i % 2 ? p.accent2 : mixHex(p.accent2, p.outline, 0.15), { sd: [side, 0, 0.1], lw: 0.75 }))
      }
      return out
    }
    head.kids.push(tuft, ...horn(1), ...horn(-1))
    head.kids.push(...pair(E([0.42, 0.18, 1.26], [0.1, 0.05, 0.18], p.fur, { rot: [0, 0.9, 0], sd: [1, 0, -0.2] })))
    body.kids.push(...puffs, head)
    body.kids.push(...pair(E([0.32, 0.5, 0.12], [0.13, 0.18, 0.12], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { tuft.kids.push(crownOn(head, 1.86, 0.26, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Fox — slim orange, tall black-tipped ears, pointy muzzle, giant white-tip tail.
  vixie: (p, o) => {
    const body = E([0, 0, 0.6], [0.5, 0.46, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.05, 0.42, 0.6))
    const head = E([0, 0.12, 1.32], [0.52, 0.44, 0.42], p.fur)
    for (const side of [-1, 1]) head.decals.push({ t: 'poly', pts: [[side * 0.12, -0.12], [side * 0.75, -0.02], [side * 0.85, -0.45], [side * 0.3, -0.55]], fill: p.belly, closed: true })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.2, eyeSize: 0.2, mouth: 'none' }))
    const snout = C([0, 0.36, 1.16], [0, 0.7, 1.1], 0.15, p.belly, { sd: [0, 1, 0] })
    snout.kids.push(E([0, 0.69, 1.11], [0.065, 0.055, 0.055], p.nose, { flat: true, sd: [0, 1, 0] }))
    const mouth = E([0, 0.46, 1.02], [0.15, 0.1, 0.06], p.belly, { flat: true, lw: 0.5 })
    mouth.decals.push(...face({ iris: p.iris, outline: p.outline, mouth: 'fangs', mouthEl: 0, mouthW: 0.55 }).filter(d => !d.at && (d.pts?.length ?? 0) !== 2))
    const ear = C([0.3, 0.02, 1.68], [0.46, -0.02, 2.1], 0.16, p.fur, { sd: [0.3, -0.1, 1] })
    ear.kids.push(C([0.43, -0.015, 1.99], [0.46, -0.02, 2.1], 0.075, p.accent, { sd: [0, 0, 1] }))
    head.kids.push(mouth, snout, ...pair(ear))
    const tail = E([0.2, -0.72, 0.72], [0.28, 0.32, 0.62], p.fur, { rot: [0.5, -0.3, 0], sd: [0, -1, 0] })
    tail.kids.push(E([0.28, -1.0, 1.25], [0.2, 0.2, 0.22], p.belly, { sd: [0, -0.5, 1] }))
    body.kids.push(head, tail)
    body.kids.push(...pair(E([0.42, 0.3, 0.6], [0.11, 0.13, 0.22], p.fur, { rot: [0.4, 0.4, 0] })))
    body.kids.push(...pair(E([0.26, 0.48, 0.1], [0.14, 0.24, 0.1], p.accent, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.7, 0.24, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Turtle — big hex-plated dome shell, little head poking forward.
  shellby: (p, o) => {
    const shell = E([0, -0.08, 0.68], [0.84, 0.8, 0.6], p.accent)
    const plates: SP[] = [[0, 1.1], [Math.PI, 0.3], [Math.PI * 0.62, 0.32], [-Math.PI * 0.62, 0.32], [Math.PI * 0.3, 0.42], [-Math.PI * 0.3, 0.42], [0, 0.45]]
    for (const [az, el] of plates) {
      const pts: SP[] = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        pts.push([az + Math.sin(a) * 0.36 / Math.max(0.35, Math.cos(el)), el + Math.cos(a) * 0.25])
      }
      shell.decals.push({ t: 'poly', pts, fill: mixHex(p.accent, p.accent2, 0.35), stroke: mixHex(p.accent, p.outline, 0.5), w: 0.03, closed: true })
    }
    const rim = E([0, -0.06, 0.32], [0.92, 0.88, 0.14], p.accent2, { sd: [0, 0, -1] })
    for (let i = 0; i < 12; i++) rim.decals.push(seam(mixHex(p.accent2, p.outline, 0.45), (i / 12) * Math.PI * 2, -0.6, 0.6))
    const head = E([0, 0.84, 0.74], [0.42, 0.38, 0.38], p.fur, { sd: [0, 1, 0] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.16, eyeSize: 0.26, mouth: 'fangs', mouthEl: -0.32, mouthW: 0.26, browW: 0.09 }))
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.62, -0.2], size: [0.14, 0.1], fill: mixHex(p.fur, '#ff7a7a', 0.35) })
    shell.kids.push(rim, head)
    shell.kids.push(...pair(E([0.66, 0.46, 0.18], [0.2, 0.24, 0.15], p.fur, { sd: [0.5, 1, 0] })))
    shell.kids.push(...pair(E([0.6, -0.56, 0.16], [0.18, 0.2, 0.13], p.fur, { sd: [0.5, -1, 0] })))
    shell.kids.push(C([0, -0.84, 0.26], [0, -1.12, 0.2], 0.1, p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.1, 0.22, p.outline)); head.decals.push(...warPaint(2)) }
    return shell
  },

  // Woodpecker — dark plumage, white bib, red crest, long yellow drill beak.
  pecks: (p, o) => {
    const body = E([0, 0, 0.62], [0.5, 0.48, 0.62], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0, 0.5, 0.65))
    const head = E([0, 0.08, 1.34], [0.46, 0.44, 0.42], p.fur)
    for (const side of [-1, 1]) head.decals.push({ t: 'poly', pts: [[side * 0.1, -0.1], [side * 0.95, 0.08], [side * 1.0, -0.3], [side * 0.2, -0.45]], fill: p.belly, closed: true })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.48, eyeEl: 0.18, eyeSize: 0.2, mouth: 'none', brow: '#000' }))
    const beak = C([0, 0.4, 1.26], [0, 1.0, 1.18], 0.13, p.accent2, { sd: [0, 1, 0], lw: 0.9 })
    beak.kids.push(C([0, 0.4, 1.2], [0, 0.86, 1.13], 0.08, mixHex(p.accent2, p.outline, 0.25), { sd: [0, 1, -0.3] }))
    const crest: Part[] = []
    for (let i = 0; i < 4; i++) {
      const y = 0.18 - i * 0.18
      crest.push(C([0, y, 1.62 - i * 0.03], [0, y - 0.28, 2.0 - i * 0.07], 0.14, p.accent, { sd: [0, -0.4, 1], lw: 0.85 }))
    }
    head.kids.push(beak, ...crest)
    const wing = E([0.48, -0.06, 0.72], [0.14, 0.38, 0.42], p.fur, { rot: [0.3, 0.25, 0], sd: [1, 0, 0] })
    for (let i = 0; i < 3; i++) wing.decals.push({ t: 'poly', pts: [[1.2, -0.3 + i * 0.25], [1.9, -0.5 + i * 0.25]], stroke: p.belly, w: 0.05 })
    body.kids.push(head, ...pair(wing))
    const tail = C([0, -0.42, 0.4], [0, -0.92, 0.1], 0.22, p.fur, { sd: [0, -1, 0] })
    body.kids.push(tail)
    body.kids.push(...pair(C([0.2, 0.4, 0.08], [0.26, 0.68, 0.04], 0.09, p.accent2, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.74, 0.22, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Sloth — droopy shaggy blob, dark eye masks, moss patches, long clawed arms.
  mossy: (p, o) => {
    const body = E([0, 0, 0.58], [0.66, 0.6, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.05, 0.5, 0.55))
    for (const [az, el] of [[2.4, 0.5], [-2.7, 0.2], [1.6, -0.2], [3.1, 0.8]] as SP[]) {
      body.decals.push({ t: 'disc', at: [az, el], size: [0.28, 0.2], fill: p.accent })
    }
    const head = E([0, 0.14, 1.28], [0.52, 0.46, 0.44], p.fur)
    head.decals.push({ t: 'disc', at: [0, -0.02], size: [0.62, 0.38], fill: p.belly })
    for (const side of [-1, 1]) head.decals.push({ t: 'poly', pts: [[side * 0.12, 0.25], [side * 0.62, 0.1], [side * 0.7, -0.15], [side * 0.28, -0.12]], fill: p.accent2, closed: true })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.06, eyeSize: 0.17, mouth: 'fangs', mouthEl: -0.3, mouthW: 0.2, browW: 0.08 }))
    head.decals.push({ t: 'disc', at: [0, -0.12], size: [0.1, 0.07], fill: p.nose })
    const moss = E([0.05, 0.05, 1.68], [0.26, 0.22, 0.1], p.accent, { lw: 0.8, sd: [0, 0, 1] })
    moss.kids.push(E([0.12, 0.08, 1.8], [0.08, 0.08, 0.12], mixHex(p.accent, '#ffffff', 0.2), { lw: 0.7 }))
    head.kids.push(moss)
    const arm = E([0.64, 0.26, 0.62], [0.13, 0.13, 0.42], p.fur, { rot: [0.9, 0.35, 0], sd: [1, 0.5, 0] })
    for (let i = -1; i <= 1; i++) arm.kids.push(C([0.66 + i * 0.07, 0.62, 0.36], [0.68 + i * 0.09, 0.78, 0.24], 0.04, p.accent2, { sd: [0, 1, 0], lw: 0.7 }))
    body.kids.push(head, ...pair(arm))
    body.kids.push(...pair(E([0.34, 0.48, 0.12], [0.17, 0.2, 0.12], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { moss.kids.push(crownOn(head, 1.78, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Squirrel — small lilac-grey body, enormous curled bushy tail, holds an acorn.
  zippy: (p, o) => {
    const body = E([0, 0.08, 0.52], [0.44, 0.4, 0.52], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0, 0.45, 0.6))
    const head = E([0, 0.18, 1.12], [0.44, 0.38, 0.38], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.14, eyeSize: 0.24, mouth: 'fangs', mouthEl: -0.3, mouthW: 0.16 }))
    head.decals.push({ t: 'disc', at: [0, -0.1], size: [0.09, 0.06], fill: p.nose })
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.55, -0.22], size: [0.16, 0.12], fill: p.belly })
    const ear = C([0.24, 0.12, 1.4], [0.32, 0.08, 1.72], 0.11, p.fur, { sd: [0.3, -0.2, 1] })
    ear.kids.push(C([0.3, 0.09, 1.62], [0.34, 0.06, 1.84], 0.05, p.accent, { sd: [0, 0, 1] }))
    head.kids.push(...pair(ear))
    // big S tail: chain of fluffy puffs rising behind and curling over
    const tail: Part[] = []
    const pts: V3[] = [[0.05, -0.58, 0.3], [0.08, -0.8, 0.58], [0.1, -0.9, 0.92], [0.1, -0.86, 1.26], [0.08, -0.72, 1.56], [0.06, -0.5, 1.76], [0.04, -0.26, 1.84], [0.02, -0.06, 1.78]]
    pts.forEach((c, i) => {
      const rr = 0.36 - i * 0.012
      tail.push(E(c, [rr * 0.9, rr, rr], i === pts.length - 1 ? p.belly : p.accent, { sd: [0, -1, 0.05 * i], lw: 0.6 }))
    })
    const tailRoot = tail[0]!
    tailRoot.kids.push(...tail.slice(1).map((t, i) => ({ ...t, sd: [0, -1, 0.2 + i * 0.1] as V3 })))
    const acorn = E([0, 0.56, 0.62], [0.15, 0.13, 0.17], p.accent2, { sd: [0, 1, 0] })
    acorn.kids.push(E([0, 0.56, 0.76], [0.17, 0.15, 0.08], mixHex(p.accent2, p.outline, 0.45), { sd: [0, 0, 1] }))
    body.kids.push(tailRoot, head, acorn)
    body.kids.push(...pair(E([0.2, 0.48, 0.66], [0.09, 0.14, 0.09], p.fur, { sd: [0.2, 1, 0] })))
    body.kids.push(...pair(E([0.26, 0.42, 0.1], [0.13, 0.22, 0.1], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.48, 0.22, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Owl — egg-shaped, giant facial disc, ear tufts, folded wings.
  hootsie: (p, o) => {
    const body = E([0, 0, 0.82], [0.62, 0.58, 0.8], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.25, 0.48, 0.45))
    for (let i = 0; i < 3; i++) for (let j = -1; j <= 1; j++) {
      const az = j * 0.25 + (i % 2) * 0.12
      const el = -0.12 - i * 0.18
      body.decals.push({ t: 'poly', pts: [[az - 0.07, el], [az, el - 0.06], [az + 0.07, el]], stroke: stitchOf(p, p.belly), w: 0.025 })
    }
    // facial disc on the upper body (owls have no neck)
    for (const side of [-1, 1]) {
      const pts: SP[] = []
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        pts.push([side * 0.3 + Math.sin(a) * 0.3, 0.55 + Math.cos(a) * 0.24])
      }
      body.decals.push({ t: 'poly', pts, fill: p.belly, stroke: stitchOf(p, p.belly), w: 0.025, dash: true, closed: true })
    }
    body.decals.push({ t: 'eye', at: [-0.3, 0.55], size: [0.17, 0.19], iris: p.iris, look: [0.2, -0.1] })
    body.decals.push({ t: 'eye', at: [0.3, 0.55], size: [0.17, 0.19], iris: p.iris, look: [-0.2, -0.1] })
    body.decals.push({ t: 'poly', pts: [[-0.62, 0.9], [-0.05, 0.7]], stroke: p.outline, w: 0.09 })
    body.decals.push({ t: 'poly', pts: [[0.62, 0.9], [0.05, 0.7]], stroke: p.outline, w: 0.09 })
    const beak = C([0, 0.56, 1.12], [0, 0.66, 0.92], 0.09, p.accent2, { sd: [0, 1, 0] })
    const tuft = C([0.32, 0.12, 1.45], [0.5, 0.06, 1.88], 0.13, p.accent, { sd: [0.2, -0.3, 1] })
    const wing = E([0.56, -0.08, 0.78], [0.14, 0.4, 0.5], p.accent, { rot: [0.2, 0.2, 0], sd: [1, 0, 0] })
    for (let i = 0; i < 3; i++) wing.decals.push({ t: 'poly', pts: [[1.3, -0.2 - i * 0.25], [1.9, -0.45 - i * 0.25]], stroke: p.fur, w: 0.04 })
    body.kids.push(beak, ...pair(tuft), ...pair(wing))
    body.kids.push(...pair(C([0.2, 0.42, 0.1], [0.24, 0.66, 0.05], 0.1, p.accent2, { sd: [0, 1, 0] })))
    if (o.boss) {
      const holder = E([0, 0.05, 1.48], [0.01, 0.01, 0.01], p.fur, { flat: true, lw: 0, sd: [0, 0, 1] })
      holder.kids.push(crownOn(holder, 1.58, 0.26, p.outline))
      body.kids.push(holder)
      body.decals.push(...warPaint(1).map(d => ({ ...d, pts: d.pts!.map(([a, e]) => [a, e + 0.25] as SP) })))
    }
    return body
  },

  // Boar — stocky, dark bristle mohawk, pink snout, white curved tusks.
  tuskar: (p, o) => {
    const body = E([0, -0.05, 0.6], [0.66, 0.68, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.15, 0.45, 0.5), seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.9))
    const head = E([0, 0.24, 1.22], [0.54, 0.5, 0.44], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.44, eyeEl: 0.28, eyeSize: 0.18, mouth: 'none', browW: 0.09 }))
    const snout = E([0, 0.72, 1.08], [0.24, 0.12, 0.18], p.belly, { rot: [0, 0, 0], sd: [0, 1, 0] })
    for (const side of [-1, 1]) snout.decals.push({ t: 'disc', at: [side * 0.3, 0.05], size: [0.15, 0.24], fill: p.nose })
    const mouth = E([0, 0.6, 0.9], [0.22, 0.12, 0.06], p.fur, { flat: true, lw: 0.4, sd: [0, 1, -0.2] })
    mouth.decals.push({ t: 'poly', pts: [[-0.6, -0.3], [-0.2, 0.2], [0.2, 0.2], [0.6, -0.3]], stroke: p.outline, w: 0.04 })
    const tusk = C([0.2, 0.66, 0.96], [0.36, 0.78, 1.3], 0.075, p.accent2, { sd: [0.3, 1, 0.3] })
    const ear = C([0.36, 0.1, 1.5], [0.6, -0.05, 1.82], 0.15, p.fur, { sd: [0.4, -0.3, 1] })
    const mohawk: Part[] = []
    for (let i = 0; i < 6; i++) {
      const y = 0.38 - i * 0.24
      const z = i < 2 ? 1.62 - i * 0.02 : 1.38 - (i - 2) * 0.1
      mohawk.push(C([0, y, z - 0.08], [0, y - 0.18, z + 0.3], 0.14, p.accent, { sd: [0, -0.5, 1], lw: 0.8 }))
    }
    head.kids.push(mouth, snout, ...pair(tusk), ...pair(ear))
    body.kids.push(head, ...mohawk)
    body.kids.push(...pair(E([0.42, 0.42, 0.14], [0.18, 0.22, 0.14], p.accent, { sd: [0, 1, 0] })))
    body.kids.push(C([0, -0.7, 0.62], [0.05, -0.92, 0.82], 0.06, p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.7, 0.26, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  }
}

// ─── Projection + drawing ────────────────────────────────────────────────────

interface View {
  cy: number
  sy: number
  /** Pixels per model unit. */
  s: number
  ox: number
  oy: number
}

/** Rotate a model vector by the yaw (about z). */
const yawV = (v: V3, w: View): V3 => [v[0] * w.cy - v[1] * w.sy, v[0] * w.sy + v[1] * w.cy, v[2]]
/** Model point → screen px. */
const proj = (p: V3, w: View): [number, number] => {
  const [x, y, z] = yawV(p, w)
  return [w.ox + x * w.s, w.oy + (y * CAM_SIN - z * CAM_COS) * w.s]
}
/** Facing (dot with the direction towards the camera) of a model vector. */
const facing = (v: V3, w: View): number => {
  const [, y, z] = yawV(v, w)
  return y * CAM_COS + z * CAM_SIN
}

/** Local rotation matrix (x, then y, then z), column-major rows. */
const rotM = (rot: V3 | undefined): number[] => {
  if (!rot) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const [a, b, c] = rot
  const ca = Math.cos(a); const sa = Math.sin(a)
  const cb = Math.cos(b); const sb = Math.sin(b)
  const cc = Math.cos(c); const sc = Math.sin(c)
  // Rz * Ry * Rx
  return [
    cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
    sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
    -sb, cb * sa, cb * ca
  ]
}
const mulMV = (m: number[], v: V3): V3 => [
  m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
  m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
  m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]
]

/** Screen ellipse (cx, cy, rx, ry, angle) of an ellipsoid. */
const ellipseOf = (p: Part, w: View): [number, number, number, number, number] => {
  const m = rotM(p.rot)
  const r = p.r!
  // columns of M = Ryaw * Rloc * diag(r), projected
  let a = 0; let b = 0; let c = 0
  for (let i = 0; i < 3; i++) {
    const col: V3 = [m[i]! * r[i]!, m[3 + i]! * r[i]!, m[6 + i]! * r[i]!]
    const [x, y, z] = yawV(col, w)
    const px = x * w.s
    const py = (y * CAM_SIN - z * CAM_COS) * w.s
    a += px * px; b += px * py; c += py * py
  }
  const tr = (a + c) / 2
  const det = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b))
  const l1 = tr + det
  const l2 = Math.max(0, tr - det)
  const ang = 0.5 * Math.atan2(2 * b, a - c)
  const [cx, cy] = proj(p.c, w)
  return [cx, cy, Math.sqrt(l1), Math.sqrt(l2), ang]
}

/** Point + outward normal on an ellipsoid surface at (az, el). */
const surf = (p: Part, [az, el]: SP): { pt: V3; n: V3 } => {
  const d: V3 = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)]
  const r = p.r!
  const m = rotM(p.rot)
  const off = mulMV(m, [d[0] * r[0], d[1] * r[1], d[2] * r[2]])
  const n = mulMV(m, [d[0] / r[0], d[1] / r[1], d[2] / r[2]])
  return { pt: [p.c[0] + off[0], p.c[1] + off[1], p.c[2] + off[2]], n }
}

const DARK = 0.32
const LIGHT = 0.4
const shadeOf = (col: string, outline: string) => mixHex(col, outline, DARK)
const lightOf = (col: string) => mixHex(col, '#ffffff', LIGHT)

/** Draw context interface the rig needs (a subset of CanvasRenderingContext2D). */
export type RigCtx = Pick<CanvasRenderingContext2D,
  'save' | 'restore' | 'beginPath' | 'closePath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'ellipse' | 'arc'
  | 'fill' | 'stroke' | 'clip' | 'setLineDash' | 'transform'
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'lineJoin' | 'lineCap' | 'globalAlpha'>

const drawEllipsoid = (ctx: RigCtx, p: Part, w: View, outline: string) => {
  const [cx, cy, rx, ry, ang] = ellipseOf(p, w)
  if (!(rx > 0.05) || !(ry > 0.05)) return
  const lw = Math.max(1, w.s * 0.045 * (p.lw ?? 1))
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, ang, 0, Math.PI * 2)
  if (p.lw !== 0) {
    ctx.strokeStyle = outline
    ctx.lineWidth = lw * 2
    ctx.stroke()
  }
  ctx.fillStyle = p.flat ? p.col : shadeOf(p.col, outline)
  ctx.fill()
  if (!p.flat) {
    // Base colour on an up-left offset copy (clipped) → dark crescent bottom-right.
    const m = Math.min(rx, ry)
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, ang, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = p.col
    ctx.beginPath()
    ctx.ellipse(cx - m * 0.14, cy - m * 0.2, rx * 0.98, ry * 0.95, ang, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = lightOf(p.col)
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.ellipse(cx - rx * 0.32 * Math.cos(ang) + ry * 0.0, cy - ry * 0.45, Math.max(1, rx * 0.34), Math.max(1, ry * 0.2), ang - 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.restore()
  }
}

const drawCone = (ctx: RigCtx, p: Part, w: View, outline: string) => {
  const [bx, by] = proj(p.c, w)
  const [tx, ty] = proj(p.tip!, w)
  let dx = tx - bx
  let dy = ty - by
  const len = Math.hypot(dx, dy)
  const bw = p.w! * w.s
  const lw = Math.max(1, w.s * 0.04 * (p.lw ?? 1))
  ctx.strokeStyle = outline
  ctx.lineWidth = lw * 2
  ctx.lineJoin = 'round'
  if (len < bw * 0.5) {
    ctx.beginPath()
    ctx.arc(bx, by, bw, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    dx /= len; dy /= len
    const nx = -dy * bw
    const ny = dx * bw
    // sides only: the base sits inside the parent, so it gets no outline
    ctx.beginPath()
    ctx.moveTo(bx + nx, by + ny)
    ctx.quadraticCurveTo(bx + nx * 0.6 + (tx - bx) * 0.55, by + ny * 0.6 + (ty - by) * 0.55, tx, ty)
    ctx.quadraticCurveTo(bx - nx * 0.6 + (tx - bx) * 0.55, by - ny * 0.6 + (ty - by) * 0.55, bx - nx, by - ny)
    ctx.stroke()
    ctx.quadraticCurveTo(bx - dx * bw * 0.6, by - dy * bw * 0.6, bx + nx, by + ny)
  }
  ctx.closePath()
  ctx.fillStyle = p.col
  ctx.fill()
  if (len >= bw * 0.5 && !p.flat) {
    // shaded half (right side in screen)
    const side = dx > 0 ? 1 : -1
    const nx = -dy * bw * side
    const ny = dx * bw * side
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(tx, ty)
    ctx.quadraticCurveTo(bx + nx * 0.6 + (tx - bx) * 0.55, by + ny * 0.6 + (ty - by) * 0.55, bx + nx, by + ny)
    ctx.closePath()
    ctx.fillStyle = shadeOf(p.col, outline)
    ctx.globalAlpha = 0.7
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

const FACE_MIN = 0.12

const drawDecal = (ctx: RigCtx, p: Part, d: Decal, w: View, outline: string) => {
  if (d.t === 'eye' || d.t === 'disc') {
    const at = d.at!
    const { pt, n } = surf(p, at)
    const f = facing(n, w) / Math.hypot(n[0], n[1], n[2])
    if (f < FACE_MIN) return
    const [sa, se] = d.size!
    const pa = surf(p, [at[0] + sa, at[1]]).pt
    const pe = surf(p, [at[0], at[1] + se]).pt
    const [cx, cy] = proj(pt, w)
    const [ax, ay] = proj(pa, w)
    const [ex, ey] = proj(pe, w)
    const u: [number, number] = [ax - cx, ay - cy]
    const v: [number, number] = [ex - cx, ey - cy]
    const disc = (k: number, ox: number, oy: number) => {
      const x = cx + u[0] * ox + v[0] * oy
      const y = cy + u[1] * ox + v[1] * oy
      ctx.save()
      ctx.transform(u[0] * k, u[1] * k, v[0] * k, v[1] * k, x, y)
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.restore()
    }
    const alpha = Math.min(1, (f - FACE_MIN) * 6)
    ctx.globalAlpha = alpha
    if (d.t === 'disc') {
      disc(1, 0, 0)
      ctx.fillStyle = d.fill!
      ctx.fill()
      ctx.globalAlpha = 1
      return
    }
    disc(1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, w.s * 0.035)
    ctx.stroke()
    const [lx, ly] = d.look ?? [0, 0]
    disc(0.62, lx, ly)
    ctx.fillStyle = d.iris ?? '#222'
    ctx.fill()
    disc(0.36, lx, ly)
    ctx.fillStyle = '#0d0a0a'
    ctx.fill()
    disc(0.2, lx - 0.22, ly + 0.26)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.globalAlpha = 1
    return
  }
  // poly
  const pts = d.pts!.map(sp => surf(p, sp))
  const vis = pts.map(({ n }) => facing(n, w) / Math.hypot(n[0], n[1], n[2]))
  const scr = pts.map(({ pt }) => proj(pt, w))
  const lw = Math.max(1, (d.w ?? 0.03) * w.s)
  if (d.fill) {
    if (vis.some(v => v < FACE_MIN)) return
    ctx.beginPath()
    scr.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = d.fill
    ctx.fill()
    if (d.stroke) {
      if (d.dash) ctx.setLineDash([lw * 2, lw * 1.6])
      ctx.strokeStyle = d.stroke
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.stroke()
      if (d.dash) ctx.setLineDash([])
    }
    return
  }
  // open polyline: draw visible runs only
  ctx.strokeStyle = d.stroke ?? outline
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (d.dash) ctx.setLineDash([lw * 2, lw * 1.6])
  ctx.beginPath()
  let pen = false
  for (let i = 0; i < scr.length; i++) {
    if (vis[i]! < FACE_MIN) { pen = false; continue }
    const [x, y] = scr[i]!
    if (pen) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
    pen = true
  }
  ctx.stroke()
  if (d.dash) ctx.setLineDash([])
}

const drawPart = (ctx: RigCtx, p: Part, w: View, outline: string) => {
  const sorted = p.kids
    .map(k => {
      const sd = k.sd ?? [k.c[0] - p.c[0], k.c[1] - p.c[1], k.c[2] - p.c[2]]
      const mid: V3 = k.k === 'c' ? [(k.c[0] + k.tip![0]) / 2, (k.c[1] + k.tip![1]) / 2, (k.c[2] + k.tip![2]) / 2] : k.c
      return { k, f: facing(sd, w), d: facing(mid, w) }
    })
    .sort((a, b) => a.d - b.d)
  for (const { k, f } of sorted) if (f < 0) drawPart(ctx, k, w, outline)
  if (p.k === 'e') drawEllipsoid(ctx, p, w, outline)
  else drawCone(ctx, p, w, outline)
  if (p.k === 'e') for (const d of p.decals) drawDecal(ctx, p, d, w, outline)
  for (const { k, f } of sorted) if (f >= 0) drawPart(ctx, k, w, outline)
}

// ─── Public API ──────────────────────────────────────────────────────────────

const modelCache = new Map<string, Part>()

/** The part tree of a smasher in a palette (cached by palette + options). */
const modelOf = (id: SmasherId, pal: SmasherPalette, o: RigOptions): Part => {
  const key = `${id}|${Object.values(pal).join(',')}|${o.boss ? 1 : 0}`
  let m = modelCache.get(key)
  if (!m) {
    if (modelCache.size > 256) modelCache.clear()
    m = BUILDERS[id](pal, o)
    modelCache.set(key, m)
  }
  return m
}

/** Yaw (radians) of frame i. Frame 0 faces the camera. */
export const frameYaw = (i: number): number => i * YAW_STEP

/**
 * Draw one smasher (character only, no disc) at `yaw` with the disc centre at
 * (ox, oy) and `scale` px per model unit (= the disc radius in px).
 */
export const drawSmasher = (
  ctx: RigCtx,
  id: SmasherId,
  palette: SmasherPalette,
  yaw: number,
  ox: number,
  oy: number,
  scale: number,
  opts: RigOptions = {}
): void => {
  const w: View = { cy: Math.cos(yaw), sy: Math.sin(yaw), s: scale, ox, oy }
  const model = modelOf(id, palette, opts)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  drawPart(ctx, model, w, palette.outline)
  ctx.restore()
}

/** Screen bounds (model units around the disc centre) of a smasher at `yaw`,
 *  from the projected primitives (outlines included). `core` measures only
 *  the main masses (body + head-sized ellipsoids, no ears/tails/spikes). */
export const smasherBounds = (id: SmasherId, yaw: number, opts: RigOptions & { core?: boolean } = {}): { left: number; top: number; right: number; bottom: number } => {
  const w: View = { cy: Math.cos(yaw), sy: Math.sin(yaw), s: 1, ox: 0, oy: 0 }
  const b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  const grow = (x: number, y: number, pad: number) => {
    b.left = Math.min(b.left, x - pad); b.right = Math.max(b.right, x + pad)
    b.top = Math.min(b.top, y - pad); b.bottom = Math.max(b.bottom, y + pad)
  }
  const walk = (p: Part, depth = 0) => {
    if (opts.core && depth > 0 && (p.k !== 'e' || Math.max(...p.r!) < 0.38 || Math.min(...p.r!) < 0.15)) return
    if (p.k === 'e') {
      const [cx, cy, rx, ry, ang] = ellipseOf(p, w)
      const ex = Math.sqrt((rx * Math.cos(ang)) ** 2 + (ry * Math.sin(ang)) ** 2)
      const ey = Math.sqrt((rx * Math.sin(ang)) ** 2 + (ry * Math.cos(ang)) ** 2)
      grow(cx - ex, cy - ey, 0.05); grow(cx + ex, cy + ey, 0.05)
    } else {
      const [bx, by] = proj(p.c, w)
      const [tx, ty] = proj(p.tip!, w)
      grow(bx, by, p.w! + 0.05); grow(tx, ty, 0.05)
    }
    p.kids.forEach(k => walk(k, depth + 1))
  }
  walk(modelOf(id, SIGNATURE_PALETTES[id], { boss: opts.boss }))
  return b
}

export { SMASHER_IDS }
