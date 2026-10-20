// ─── Smasher rig kit ────────────────────────────────────────────────────────
//
// The shared building blocks of every smasher model (see smasherRig.ts for the
// projection / drawing): palette type, colour helpers, the part + decal model,
// primitives (E = ellipsoid, C = cone), mirroring, and the face / belly / seam
// / crown / war-paint kits. Model files (smasherRig.ts for the first twelve,
// models/batch*.ts for the rest) import from here, so several model files can
// be written independently. No imports — no cycles.

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

// ─── Colour helpers (palette variants) ───────────────────────────────────────

export type RGB = [number, number, number]
export const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = ([r, g, b]: RGB): string =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

export const mixHex = (a: string, b: string, t: number): string => {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

export const rgbToHsl = ([r, g, b]: RGB): RGB => {
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
export const hslToRgb = ([h, s, l]: RGB): RGB => {
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

export type V3 = [number, number, number]
/** (azimuth, elevation) on an ellipsoid surface; az 0 = the part's front (+y), + = its right (+x). */
export type SP = [number, number]

export interface Decal {
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

export interface Part {
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

export const E = (c: V3, r: V3, col: string, o: Partial<Part> = {}): Part =>
  ({ k: 'e', c, r, col, kids: [], decals: [], ...o })
export const C = (c: V3, tip: V3, w: number, col: string, o: Partial<Part> = {}): Part =>
  ({ k: 'c', c, tip, w, col, kids: [], decals: [], ...o })
export const add = (p: Part, ...kids: Part[]): Part => { p.kids.push(...kids); return p }
export const mirrorV = ([x, y, z]: V3): V3 => [-x, y, z]
/** Mirror a part tree across x = 0. */
export const mirror = (p: Part): Part => ({
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
export const pair = (p: Part): Part[] => [p, mirror(p)]

export interface RigOptions {
  /** Crown + war paint for campaign bosses. */
  boss?: boolean
}

// Face kit ──────────────────────────────────────────────────────────────────

export interface FaceOpts {
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
export const face = (o: FaceOpts): Decal[] => {
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
export const bellyPatch = (fill: string, stitch: string, az: number, el: number, saz: number, sel: number): Decal => {
  const pts: SP[] = []
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    pts.push([az + Math.sin(a) * saz, el + Math.cos(a) * sel])
  }
  return { t: 'poly', pts, fill, stroke: stitch, w: 0.03, dash: true, closed: true }
}

/** Vertical stitched seam (meridian) over a part's surface. */
export const seam = (stitch: string, az: number, el0: number, el1: number): Decal => {
  const pts: SP[] = []
  for (let i = 0; i <= 10; i++) pts.push([az, el0 + ((el1 - el0) * i) / 10])
  return { t: 'poly', pts, stroke: stitch, w: 0.028, dash: true }
}

/** Gold crown + red war paint for bosses (added on top of a head part). */
export const crownOn = (head: Part, top: number, rad: number, outline: string): Part => {
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

export const warPaint = (pts: number): Decal[] => {
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

export type Builder = (p: SmasherPalette, o: RigOptions) => Part

/** Darker stitch colour for a fabric. */
export const stitchOf = (p: SmasherPalette, base: string) => mixHex(base, p.outline, 0.45)

