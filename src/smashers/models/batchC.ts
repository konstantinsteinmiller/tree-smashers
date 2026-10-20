// ─── Smasher models, batch C — SKY, WATER & ODDBALLS ────────────────────────
//
// Rig models (+ signature palettes) of the smashers declared in
// src/data/smashers/batchC.ts. Same conventions as the base twelve in
// smasherRig.ts — build with the kit in @/smashers/rigKit.
//
// Core masses (body + head ellipsoids, see smasherBounds) stay near-round in
// x/y so the silhouette keeps its size from every one of the 32 sides; long
// features (horn, beak, tail, tentacles) are thin kids outside the core.

import {
  C, E, bellyPatch, crownOn, face, mixHex, pair, seam, stitchOf, warPaint,
  type Builder, type Decal, type Part, type SmasherPalette, type SP, type V3
} from '@/smashers/rigKit'
import type { BatchCId } from '@/data/smashers/batchC'

export const BATCH_C_PALETTES: Readonly<Record<BatchCId, SmasherPalette>> = Object.freeze({
  waddles: { fur: '#2e3a5c', belly: '#f7f4ec', accent: '#e8403a', accent2: '#ff9a2e', nose: '#1b2033', iris: '#2a3b78', outline: '#141826' },
  flamenca: { fur: '#f58bb0', belly: '#ffd6e3', accent: '#de4a80', accent2: '#2b2230', nose: '#fff0dc', iris: '#3a1a2a', outline: '#3a1426' },
  gulpy: { fur: '#eeeae0', belly: '#fffaf0', accent: '#f7b23b', accent2: '#4a5560', nose: '#e08a1a', iris: '#2b3550', outline: '#2a2418' },
  paddles: { fur: '#8a5a3c', belly: '#ecd0a8', accent: '#6b4228', accent2: '#9fb0bc', nose: '#24160e', iris: '#2a1a0e', outline: '#22140c' },
  inky: { fur: '#9b5bd6', belly: '#f0d4ff', accent: '#6d36a8', accent2: '#2a1f3d', nose: '#4a2070', iris: '#2a1640', outline: '#1e1030' },
  pinchy: { fur: '#e5523a', belly: '#ffd8b0', accent: '#c4341f', accent2: '#fff6e6', nose: '#5a1a10', iris: '#2a1010', outline: '#2a0e0a' },
  puffton: { fur: '#f2d36b', belly: '#fff6d8', accent: '#b8862a', accent2: '#ff9a5a', nose: '#e86a6a', iris: '#2a2210', outline: '#2c220e' },
  nardo: { fur: '#7f9bb8', belly: '#e8f0f7', accent: '#56708e', accent2: '#f6eed6', nose: '#2a3a4c', iris: '#1e2a3a', outline: '#16202c' },
  fangsy: { fur: '#5e4c74', belly: '#cdb0dc', accent: '#3a2d4c', accent2: '#f49cbc', nose: '#e2789c', iris: '#d8203a', outline: '#1a1224' },
  camo: { fur: '#5cc46a', belly: '#dcf4a6', accent: '#2f8a4c', accent2: '#ff6fa2', nose: '#1e4a26', iris: '#3a2a10', outline: '#143018' },
  curly: { fur: '#ff9a3c', belly: '#ffe2ac', accent: '#ffd23a', accent2: '#cc4f22', nose: '#7a2e10', iris: '#2a1a0a', outline: '#2c160a' },
  blubbo: { fur: '#a8735a', belly: '#e4bc9a', accent: '#f2dcc2', accent2: '#fffaf0', nose: '#3a2218', iris: '#2a160c', outline: '#24140c' }
})

/** Ring of `n` points (az, el) around a surface spot — for patches. */
const ring = (az: number, el: number, saz: number, sel: number, n = 14): SP[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [az + Math.sin(a) * saz, el + Math.cos(a) * sel] as SP
  })

/** Just the mouth decals of a face (for a muzzle / snout part). */
const mouthOnly = (p: SmasherPalette, mouth: 'fangs' | 'teeth' | 'frown', mouthEl: number, mouthW: number): Decal[] =>
  face({ iris: p.iris, outline: p.outline, mouth: mouth === 'frown' ? 'none' : mouth, mouthEl, mouthW })
    .filter(d => !d.at && (d.pts?.length ?? 0) !== 2)
    .concat(mouth === 'frown'
      ? [{ t: 'poly', pts: [[-mouthW, mouthEl - 0.05], [-mouthW * 0.4, mouthEl], [0, mouthEl + 0.01], [mouthW * 0.4, mouthEl], [mouthW, mouthEl - 0.05]], stroke: p.outline, w: 0.045 } as Decal]
      : [])

export const BATCH_C_BUILDERS: Record<BatchCId, Builder> = {
  // Penguin — navy egg, white tummy + face mask, orange beak and feet, red scarf.
  waddles: (p, o) => {
    const body = E([0, 0, 0.7], [0.6, 0.56, 0.7], p.fur)
    body.decals.push(seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.8))
    const tummy = E([0, 0.2, 0.64], [0.46, 0.4, 0.56], p.belly, { sd: [0, 1, 0] })
    tummy.decals.push(seam(stitchOf(p, p.belly), 0, -0.5, 0.6))
    const head = E([0, 0.06, 1.42], [0.5, 0.46, 0.42], p.fur)
    const mask = E([0, 0.2, 1.38], [0.37, 0.33, 0.3], p.belly, { sd: [0, 1, 0] })
    mask.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.42, eyeEl: 0.12, eyeSize: 0.27, mouth: 'none', browW: 0.1 }))
    for (const side of [-1, 1]) mask.decals.push({ t: 'disc', at: [side * 0.7, -0.22], size: [0.14, 0.1], fill: '#ffb0b8' })
    const beak = C([0, 0.46, 1.32], [0, 0.76, 1.24], 0.13, p.accent2, { sd: [0, 1, 0], lw: 0.9 })
    beak.kids.push(C([0, 0.46, 1.27], [0, 0.66, 1.2], 0.08, mixHex(p.accent2, p.outline, 0.3), { sd: [0, 1, -0.4] }))
    const tuft = C([0, 0.05, 1.8], [0.06, -0.08, 2.02], 0.09, p.fur, { sd: [0, -0.2, 1] })
    head.kids.push(mask, beak, tuft)
    const scarf = E([0, 0.04, 1.08], [0.54, 0.5, 0.1], p.accent, { sd: [0, 0, 1], lw: 0.9 })
    for (let i = 0; i < 8; i++) scarf.decals.push(seam(mixHex(p.accent, '#ffffff', 0.45), (i / 8) * Math.PI * 2, -0.5, 0.5))
    const scarfTail = E([0.22, -0.48, 0.86], [0.12, 0.06, 0.24], p.accent, { rot: [0.3, 0.3, 0], sd: [0.2, -1, 0] })
    const flipper = E([0.6, -0.02, 0.78], [0.1, 0.24, 0.42], p.fur, { rot: [0.15, 0.45, 0], sd: [1, 0, 0] })
    body.kids.push(tummy, scarf, scarfTail, head, ...pair(flipper))
    body.kids.push(...pair(E([0.24, 0.46, 0.06], [0.17, 0.25, 0.07], p.accent2, { sd: [0, 1, 0] })))
    body.kids.push(C([0, -0.52, 0.22], [0, -0.78, 0.08], 0.14, p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.84, 0.26, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Flamingo — pink oval body up on one stilt leg, S-neck, small head, bent black-tip beak.
  flamenca: (p, o) => {
    const body = E([0, -0.12, 0.98], [0.48, 0.5, 0.38], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.5, 0.45))
    const leg = E([0.08, 0.02, 0.34], [0.055, 0.055, 0.36], mixHex(p.fur, p.accent, 0.5), { sd: [0, 0, -1] })
    leg.kids.push(E([0.08, 0.14, 0.04], [0.12, 0.18, 0.04], mixHex(p.fur, p.accent, 0.5), { sd: [0, 1, 0] }))
    const tuckLeg = E([-0.14, 0.12, 0.6], [0.05, 0.05, 0.18], mixHex(p.fur, p.accent, 0.5), { rot: [0.9, 0, 0], sd: [0, 0.3, -1] })
    const neck: Part[] = ([[0, 0.24, 1.18], [0, 0.32, 1.4], [0, 0.26, 1.6], [0, 0.22, 1.76]] as V3[])
      .map(c => E(c, [0.13, 0.13, 0.15], p.fur, { sd: [0, 1, 0.4], lw: 0.8 }))
    const head = E([0, 0.28, 1.96], [0.32, 0.3, 0.28], p.fur, { sd: [0, 0.5, 1] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.46, eyeEl: 0.12, eyeSize: 0.27, mouth: 'none', browW: 0.1 }))
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.7, -0.25], size: [0.14, 0.1], fill: p.accent })
    const beak = C([0, 0.52, 1.94], [0, 0.72, 1.8], 0.11, p.nose, { sd: [0, 1, 0] })
    beak.kids.push(C([0, 0.68, 1.84], [0, 0.78, 1.66], 0.07, p.accent2, { sd: [0, 1, -0.3] }))
    const plume = C([0, 0.2, 2.18], [0, 0.0, 2.4], 0.07, p.accent, { sd: [0, -0.3, 1] })
    head.kids.push(beak, plume)
    const wing = E([0.42, -0.18, 1.04], [0.12, 0.42, 0.26], p.accent, { rot: [0.25, 0.2, 0], sd: [1, 0, 0.2] })
    for (let i = 0; i < 3; i++) wing.decals.push({ t: 'poly', pts: [[1.3, -0.1 - i * 0.22], [1.95, -0.3 - i * 0.22]], stroke: p.belly, w: 0.04 })
    const tail: Part[] = [-1, 0, 1].map(i => C([i * 0.1, -0.5, 1.04], [i * 0.2, -0.86, 1.2], 0.1, i ? p.fur : p.accent, { sd: [0, -1, 0.2] }))
    body.kids.push(leg, tuckLeg, ...tail, ...pair(wing), ...neck, head)
    if (o.boss) { head.kids.push(crownOn(head, 2.22, 0.2, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Pelican — round white body, huge orange bill with a sagging pouch, grey wing tips.
  gulpy: (p, o) => {
    const body = E([0, -0.05, 0.62], [0.66, 0.62, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.5, 0.45))
    const head = E([0, 0.04, 1.36], [0.42, 0.4, 0.38], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.34, eyeSize: 0.22, mouth: 'none', browW: 0.09 }))
    const bill = E([0, 0.52, 1.1], [0.15, 0.4, 0.06], p.accent, { rot: [-0.7, 0, 0], sd: [0, 1, 0.5] })
    bill.kids.push(C([0, 0.8, 0.86], [0, 0.88, 0.72], 0.06, p.nose, { sd: [0, 1, 0] }))
    const pouch = E([0, 0.44, 0.94], [0.17, 0.3, 0.15], mixHex(p.accent, p.nose, 0.4), { rot: [-0.7, 0, 0], sd: [0, 1, -0.4] })
    pouch.decals.push({ t: 'poly', pts: [[-0.6, 0.3], [0, 0.42], [0.6, 0.3]], stroke: mixHex(p.nose, p.outline, 0.4), w: 0.03 })
    pouch.decals.push(...mouthOnly(p, 'fangs', 0.6, 0.55))
    const crest = C([0, -0.1, 1.68], [0, -0.38, 1.82], 0.1, p.fur, { sd: [0, -1, 0.4] })
    head.kids.push(pouch, bill, crest)
    const wing = E([0.6, -0.12, 0.72], [0.13, 0.4, 0.4], p.fur, { rot: [0.25, 0.25, 0], sd: [1, 0, 0] })
    wing.kids.push(E([0.62, -0.46, 0.62], [0.1, 0.18, 0.2], p.accent2, { sd: [0.4, -1, 0] }))
    body.kids.push(head, ...pair(wing))
    body.kids.push(...pair(E([0.3, 0.48, 0.07], [0.18, 0.26, 0.07], p.nose, { sd: [0, 1, 0] })))
    body.kids.push(C([0, -0.6, 0.48], [0, -0.86, 0.36], 0.16, p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.76, 0.24, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Otter — brown, cream muzzle with whiskers, tiny ears, pebble hugged to the chest, thick tail.
  paddles: (p, o) => {
    const body = E([0, 0, 0.58], [0.56, 0.52, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.5, 0.45))
    const head = E([0, 0.12, 1.26], [0.5, 0.44, 0.4], p.fur)
    head.decals.push({ t: 'poly', pts: ring(0, -0.06, 0.9, 0.3), fill: p.belly, closed: true })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.36, eyeEl: 0.18, eyeSize: 0.2, mouth: 'none', browW: 0.085 }))
    const muzzle = E([0, 0.48, 1.14], [0.24, 0.15, 0.14], p.belly)
    muzzle.kids.push(E([0, 0.6, 1.22], [0.1, 0.06, 0.06], p.nose, { flat: true }))
    muzzle.decals.push(...mouthOnly(p, 'fangs', -0.3, 0.42))
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      muzzle.decals.push({ t: 'poly', pts: [[side * 0.6, 0.05 - i * 0.12], [side * 1.15, 0.12 - i * 0.2]], stroke: p.outline, w: 0.018 })
    }
    const ear = E([0.4, 0.0, 1.56], [0.1, 0.07, 0.09], p.fur, { sd: [0.4, -0.2, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.5, 0.5], fill: p.accent })
    head.kids.push(muzzle, ...pair(ear))
    const pebble = E([0, 0.54, 0.72], [0.16, 0.1, 0.12], p.accent2, { sd: [0, 1, 0] })
    pebble.decals.push({ t: 'disc', at: [-0.3, 0.4], size: [0.25, 0.2], fill: mixHex(p.accent2, '#ffffff', 0.4) })
    const paw = E([0.2, 0.5, 0.74], [0.1, 0.1, 0.1], p.accent, { sd: [0.3, 1, 0] })
    const tail = E([0, -0.72, 0.16], [0.2, 0.42, 0.1], p.accent, { rot: [-0.2, 0, 0], sd: [0, -1, 0] })
    tail.kids.push(C([0, -0.98, 0.1], [0, -1.12, 0.08], 0.11, p.accent, { sd: [0, -1, 0] }))
    body.kids.push(tail, head, pebble, ...pair(paw))
    body.kids.push(...pair(E([0.3, 0.46, 0.1], [0.16, 0.22, 0.1], p.accent, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.66, 0.24, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Octopus — purple dome with spots, eight curling tentacles with suckers.
  inky: (p, o) => {
    const mantle = E([0, -0.05, 1.08], [0.56, 0.54, 0.66], p.fur)
    for (const [az, el, s] of [[2.6, 0.5, 0.14], [-2.4, 0.3, 0.11], [1.7, 0.7, 0.1], [-1.5, 0.6, 0.13], [3.1, 0.1, 0.12], [0.9, 0.9, 0.08], [-0.8, 0.95, 0.09]] as const) {
      mantle.decals.push({ t: 'disc', at: [az, el], size: [s, s], fill: p.accent })
    }
    mantle.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.08, eyeSize: 0.26, mouth: 'none', browW: 0.1 }))
    mantle.decals.push(...mouthOnly(p, 'fangs', -0.2, 0.16))
    for (const side of [-1, 1]) mantle.decals.push({ t: 'disc', at: [side * 0.7, -0.1], size: [0.12, 0.08], fill: '#ff8cc0' })
    const arms: Part[] = []
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2
      const sx = Math.sin(a)
      const sy = Math.cos(a)
      const curl = i % 2 ? 1 : -1
      const seg = (r: number, z: number, rad: number, twist: number): Part => {
        const ax = a + twist * curl
        const part = E([Math.sin(ax) * r, Math.cos(ax) * r - 0.05, z], [rad, rad, rad * 0.85], p.fur, { sd: [sx, sy, 0], lw: 0.85 })
        part.decals.push({ t: 'disc', at: [Math.PI, -0.2], size: [0.35, 0.3], fill: p.belly })
        return part
      }
      const root = seg(0.46, 0.26, 0.15, 0)
      root.kids.push(seg(0.66, 0.14, 0.12, 0.1), seg(0.84, 0.1, 0.1, 0.24), seg(0.96, 0.14, 0.08, 0.42), seg(1.02, 0.24, 0.065, 0.62))
      arms.push(root)
    }
    mantle.kids.push(...arms)
    if (o.boss) { mantle.kids.push(crownOn(mantle, 1.66, 0.28, p.outline)); mantle.decals.push(...warPaint(2).map(d => ({ ...d, pts: d.pts!.map(([az, el]) => [az, el - 0.3] as SP) }))) }
    return mantle
  },

  // Crab — wide red shell, eyes on stalks, two huge claws up front, little legs.
  pinchy: (p, o) => {
    const body = E([0, 0, 0.5], [0.72, 0.64, 0.42], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.5, 0.3))
    for (const [az, el] of [[0.6, 0.6], [-0.6, 0.6], [2.5, 0.5], [-2.5, 0.5], [Math.PI, 0.7]] as SP[]) {
      body.decals.push({ t: 'disc', at: [az, el], size: [0.12, 0.1], fill: mixHex(p.fur, '#ffffff', 0.35) })
    }
    body.decals.push(...mouthOnly(p, 'fangs', 0.05, 0.22))
    const eyes: Part[] = []
    for (const side of [-1, 1]) {
      const stalk = C([side * 0.2, 0.32, 0.84], [side * 0.24, 0.36, 1.2], 0.06, p.fur, { sd: [side * 0.3, 0.5, 1] })
      const ball = E([side * 0.25, 0.37, 1.28], [0.19, 0.17, 0.19], p.fur, { sd: [side * 0.3, 0.5, 1] })
      ball.decals.push({ t: 'eye', at: [side * 0.18, 0.12], size: [0.62, 0.72], iris: p.iris, look: [-side * 0.2, -0.15] })
      ball.decals.push({ t: 'poly', pts: [[side * 0.95, 1.05], [-side * 0.5, 0.8]], stroke: p.outline, w: 0.06 })
      stalk.kids.push(ball)
      eyes.push(stalk)
    }
    const claw = (side: number): Part => {
      const arm = E([side * 0.62, 0.36, 0.5], [0.12, 0.2, 0.12], p.fur, { rot: [0.5, 0, 0], sd: [side, 0.6, 0] })
      const palm = E([side * 0.66, 0.68, 0.72], [0.24, 0.26, 0.22], p.accent, { sd: [side * 0.4, 1, 0.2] })
      palm.decals.push({ t: 'disc', at: [side * -0.4, 0.4], size: [0.25, 0.2], fill: mixHex(p.accent, '#ffffff', 0.3) })
      palm.kids.push(C([side * 0.72, 0.84, 0.86], [side * 0.62, 1.08, 1.02], 0.09, p.accent, { sd: [0, 1, 0.3] }))
      palm.kids.push(C([side * 0.6, 0.86, 0.66], [side * 0.54, 1.06, 0.74], 0.07, mixHex(p.accent, p.outline, 0.2), { sd: [0, 1, -0.3] }))
      arm.kids.push(palm)
      return arm
    }
    const legs: Part[] = []
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = 0.05 - i * 0.24
      legs.push(C([side * 0.6, y, 0.32], [side * 1.0, y - 0.08, 0.04], 0.06, p.accent, { sd: [side, 0, -0.2] }))
    }
    body.kids.push(...legs, ...eyes, claw(1), claw(-1))
    if (o.boss) {
      const holder = E([0, 0.1, 0.9], [0.01, 0.01, 0.01], p.fur, { flat: true, lw: 0, sd: [0, 0, 1] })
      holder.kids.push(crownOn(holder, 0.96, 0.24, p.outline))
      body.kids.push(holder)
      body.decals.push(...warPaint(1).map(d => ({ ...d, pts: d.pts!.map(([az, el]) => [az, el + 0.3] as SP) })))
    }
    return body
  },

  // Puffer fish — round yellow ball covered in spikes, pouty lips, little fins.
  puffton: (p, o) => {
    const body = E([0, 0, 0.84], [0.8, 0.78, 0.78], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.5, 0.35))
    for (const [az, el] of [[2.0, 0.5], [-2.0, 0.5], [2.8, 0.1], [-2.8, 0.1], [Math.PI, 0.8], [1.3, 0.85], [-1.3, 0.85]] as SP[]) {
      body.decals.push({ t: 'disc', at: [az, el], size: [0.11, 0.1], fill: mixHex(p.accent, p.fur, 0.3) })
    }
    body.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.34, eyeEl: 0.12, eyeSize: 0.22, mouth: 'none', browW: 0.1 }))
    for (const side of [-1, 1]) body.decals.push({ t: 'disc', at: [side * 0.62, -0.08], size: [0.12, 0.08], fill: '#ff9a9a' })
    const lips = E([0, 0.76, 0.66], [0.13, 0.08, 0.09], p.nose, { sd: [0, 1, 0] })
    lips.decals.push({ t: 'poly', pts: [[-0.6, 0], [0, 0.12], [0.6, 0]], stroke: p.outline, w: 0.03 })
    const spikes: Part[] = []
    const N = 46
    for (let i = 0; i < N; i++) {
      const zf = 1 - (2 * (i + 0.5)) / N
      if (zf < -0.55) continue
      const rr = Math.sqrt(1 - zf * zf)
      const a = i * 2.39996
      const d: V3 = [Math.sin(a) * rr, Math.cos(a) * rr, zf]
      if (d[1] > 0.55 && Math.abs(d[2]) < 0.55 && Math.abs(d[0]) < 0.6) continue // keep the face clear
      const base: V3 = [d[0] * 0.74, d[1] * 0.72, 0.84 + d[2] * 0.72]
      spikes.push(C(base, [base[0] + d[0] * 0.24, base[1] + d[1] * 0.24, base[2] + d[2] * 0.24], 0.07, p.accent, { sd: d, lw: 0.75 }))
    }
    const fin = E([0.78, 0.1, 0.8], [0.06, 0.18, 0.14], p.accent2, { rot: [0, 0, 0.4], sd: [1, 0, 0] })
    const tail = E([0, -0.92, 0.84], [0.06, 0.16, 0.24], p.accent2, { sd: [0, -1, 0] })
    body.kids.push(...spikes, lips, ...pair(fin), tail)
    if (o.boss) { body.kids.push(crownOn(body, 1.66, 0.28, p.outline)); body.decals.push(...warPaint(2).map(d => ({ ...d, pts: d.pts!.map(([az, el]) => [az, el + 0.05] as SP) }))) }
    return body
  },

  // Narwhal — blue-grey plush whale sitting up, spotted back, long ivory horn, tail flukes.
  nardo: (p, o) => {
    const body = E([0, -0.05, 0.62], [0.58, 0.58, 0.62], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.5, 0.45))
    for (const [az, el] of [[2.4, 0.4], [-2.4, 0.4], [Math.PI, 0.7], [2.9, 0.0], [-2.9, 0.0], [1.8, 0.7], [-1.8, 0.7]] as SP[]) {
      body.decals.push({ t: 'disc', at: [az, el], size: [0.12, 0.1], fill: p.accent })
    }
    const head = E([0, 0.08, 1.26], [0.48, 0.44, 0.4], p.fur)
    head.decals.push({ t: 'poly', pts: ring(0, -0.25, 0.55, 0.28), fill: p.belly, closed: true })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.1, eyeSize: 0.22, mouth: 'fangs', mouthEl: -0.32, mouthW: 0.2, browW: 0.09 }))
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.62, -0.18], size: [0.12, 0.08], fill: '#ffaab8' })
    for (const [az, el] of [[2.5, 0.4], [-2.5, 0.4], [Math.PI, 0.6]] as SP[]) head.decals.push({ t: 'disc', at: [az, el], size: [0.12, 0.1], fill: p.accent })
    const horn = C([0, 0.2, 1.6], [0, 0.82, 2.06], 0.1, p.accent2, { sd: [0, 1, 0.5], lw: 0.85 })
    for (let i = 1; i <= 3; i++) {
      const t = i / 4
      horn.kids.push(E([0, 0.2 + 0.62 * t, 1.6 + 0.46 * t], [0.1 * (1 - t) + 0.02, 0.04, 0.03], mixHex(p.accent2, p.outline, 0.3), { flat: true, lw: 0.5, sd: [0, 1, 0.5] }))
    }
    head.kids.push(horn)
    const flipper = E([0.58, 0.12, 0.5], [0.08, 0.2, 0.26], p.fur, { rot: [0.4, 0.6, 0], sd: [1, 0.3, 0] })
    const fluke = E([0.26, -0.78, 0.24], [0.24, 0.16, 0.06], p.accent, { rot: [0.2, 0, 0.5], sd: [0.3, -1, 0] })
    const stem = E([0, -0.6, 0.26], [0.14, 0.2, 0.12], p.fur, { sd: [0, -1, 0] })
    body.kids.push(stem, ...pair(fluke), head, ...pair(flipper))
    if (o.boss) { head.kids.push(crownOn(head, 1.66, 0.24, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Bat — purple fuzzball, enormous pointed ears, folded wings, pug nose, fangs.
  fangsy: (p, o) => {
    const body = E([0, 0, 0.6], [0.5, 0.46, 0.56], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.45, 0.45))
    const head = E([0, 0.08, 1.24], [0.48, 0.42, 0.4], p.fur)
    head.decals.push({ t: 'poly', pts: ring(0, -0.02, 0.85, 0.36), fill: mixHex(p.fur, p.belly, 0.35), closed: true })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.36, eyeEl: 0.14, eyeSize: 0.22, mouth: 'fangs', mouthEl: -0.34, mouthW: 0.22, browW: 0.09 }))
    head.decals.push({ t: 'disc', at: [0, -0.14], size: [0.13, 0.08], fill: p.nose })
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.07, -0.13], size: [0.03, 0.03], fill: p.outline })
    const ear = C([0.28, 0.0, 1.5], [0.56, -0.02, 2.06], 0.2, p.fur, { sd: [0.3, -0.1, 1] })
    ear.kids.push(C([0.32, 0.04, 1.58], [0.52, 0.02, 1.94], 0.11, p.accent2, { sd: [0, 1, 0.3] }))
    head.kids.push(...pair(ear))
    const wing = E([0.5, -0.24, 0.84], [0.1, 0.36, 0.5], p.accent, { rot: [0.25, 0.3, 0], sd: [0.8, -0.6, 0] })
    for (let i = 0; i < 3; i++) wing.decals.push({ t: 'poly', pts: [[1.4, 0.6], [1.5 + i * 0.3, -0.7]], stroke: mixHex(p.accent, p.belly, 0.4), w: 0.035 })
    wing.kids.push(C([0.56, -0.02, 1.26], [0.6, 0.06, 1.44], 0.05, p.accent2, { sd: [0, 0, 1] }))
    body.kids.push(head, ...pair(wing))
    body.kids.push(...pair(E([0.24, 0.42, 0.08], [0.12, 0.18, 0.08], p.accent, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.64, 0.22, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Chameleon — green striped body, helmet crest, turret eyes, spiral tail, pink tongue.
  camo: (p, o) => {
    const body = E([0, -0.04, 0.56], [0.54, 0.54, 0.5], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.42, 0.42))
    for (let i = 0; i < 5; i++) body.decals.push(seam(p.accent, 1.2 + i * 0.95, -0.3, 0.75))
    const head = E([0, 0.12, 1.12], [0.42, 0.42, 0.38], p.fur)
    head.decals.push({ t: 'poly', pts: ring(0, -0.42, 0.42, 0.14), fill: p.belly, closed: true })
    head.decals.push(...mouthOnly(p, 'fangs', -0.28, 0.24))
    head.decals.push({ t: 'poly', pts: [[-0.5, 0.42], [0.06, 0.24]], stroke: p.outline, w: 0.09 })
    head.decals.push({ t: 'poly', pts: [[0.5, 0.42], [-0.06, 0.24]], stroke: p.outline, w: 0.09 })
    const casque = E([0, -0.16, 1.44], [0.09, 0.32, 0.18], p.accent, { rot: [-0.4, 0, 0], sd: [0, -0.6, 1] })
    casque.decals.push(seam(mixHex(p.accent, p.belly, 0.4), 0, -0.6, 0.6))
    head.kids.push(casque)
    for (const side of [-1, 1]) {
      const turret = E([side * 0.36, 0.28, 1.18], [0.21, 0.21, 0.21], p.fur, { sd: [side, 0.6, 0.2] })
      turret.decals.push({ t: 'eye', at: [side * 0.3, 0.2], size: [0.5, 0.56], iris: p.iris, look: [-side * 0.25, -0.1] })
      turret.decals.push({ t: 'poly', pts: [[side * 0.9, 0.95], [-side * 0.25, 0.7]], stroke: p.outline, w: 0.07 })
      head.kids.push(turret)
    }
    const tongue = E([0, 0.54, 0.96], [0.08, 0.12, 0.05], p.accent2, { sd: [0, 1, -0.3] })
    head.kids.push(tongue)
    const tail: Part[] = []
    const n = 8
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const a = t * Math.PI * 1.6
      const R = 0.3 - t * 0.14
      tail.push(E([0, -0.62 - Math.sin(a) * R * 0.6 - t * 0.14, 0.62 - (1 - Math.cos(a)) * R * 0.7 + t * 0.05], [0.11 - t * 0.04, 0.11 - t * 0.04, 0.11 - t * 0.04], i % 2 ? p.fur : p.accent, { sd: [0, -1, 0.1], lw: 0.8 }))
    }
    body.kids.push(...tail, head)
    body.kids.push(...pair(E([0.42, 0.32, 0.14], [0.14, 0.2, 0.14], p.fur, { sd: [0, 1, 0] })))
    body.kids.push(...pair(E([0.42, -0.36, 0.14], [0.13, 0.18, 0.13], p.fur, { sd: [0.3, -1, 0] })))
    if (o.boss) { casque.kids.push(crownOn(head, 1.66, 0.22, p.outline)); body.decals.push(...warPaint(1).map(d => ({ ...d, pts: d.pts!.map(([az, el]) => [az * 0.8, el + 0.4] as SP) }))) }
    return body
  },

  // Seahorse — upright orange body with belly ridges, tube snout, coronet, curled tail.
  curly: (p, o) => {
    const body = E([0, 0, 0.8], [0.44, 0.42, 0.62], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.42, 0.45))
    for (let i = 0; i < 5; i++) {
      const el = 0.4 - i * 0.2
      body.decals.push({ t: 'poly', pts: [[-0.32, el], [0, el - 0.05], [0.32, el]], stroke: stitchOf(p, p.belly), w: 0.025 })
    }
    const head = E([0, 0.1, 1.54], [0.38, 0.36, 0.34], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.42, eyeEl: 0.1, eyeSize: 0.25, mouth: 'none', browW: 0.1 }))
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.7, -0.25], size: [0.14, 0.1], fill: '#ff7a6a' })
    const snout = C([0, 0.36, 1.46], [0, 0.72, 1.38], 0.12, p.fur, { sd: [0, 1, 0] })
    snout.kids.push(E([0, 0.72, 1.38], [0.08, 0.05, 0.07], p.accent2, { sd: [0, 1, 0] }))
    const coronet: Part[] = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      coronet.push(C([Math.sin(a) * 0.12, 0.05 + Math.cos(a) * 0.12, 1.8], [Math.sin(a) * 0.2, 0.05 + Math.cos(a) * 0.2, 2.02], 0.06, p.accent2, { sd: [Math.sin(a), Math.cos(a), 1] }))
    }
    head.kids.push(snout, ...coronet)
    const fin = E([0, -0.42, 1.0], [0.05, 0.2, 0.3], p.accent, { sd: [0, -1, 0] })
    const ears = pair(E([0.33, -0.04, 1.58], [0.04, 0.08, 0.07], p.accent, { sd: [1, 0, 0] }))
    head.kids.push(...ears)
    const tail: Part[] = []
    const n = 9
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const a = t * Math.PI * 1.7
      const R = 0.34 - t * 0.12
      tail.push(E([0, -0.36 - Math.sin(a) * R * 0.8, 0.28 - (1 - Math.cos(a)) * R * 0.25 + Math.sin(a * 0.5) * 0.04], [0.13 - t * 0.06, 0.13 - t * 0.06, 0.13 - t * 0.06], i % 2 ? p.fur : p.accent2, { sd: [0, -1, -0.2], lw: 0.8 }))
    }
    body.kids.push(...tail, fin, head)
    body.kids.push(...pair(E([0.42, -0.1, 0.9], [0.04, 0.1, 0.12], p.accent, { rot: [0.3, 0, 0], sd: [1, 0, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.92, 0.2, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Walrus — huge brown blob, whisker pads, long ivory tusks, flippers, wrinkles.
  blubbo: (p, o) => {
    const body = E([0, 0, 0.6], [0.82, 0.78, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.02, 0.5, 0.45))
    for (let i = 0; i < 3; i++) body.decals.push({ t: 'poly', pts: [[2.6, 0.5 - i * 0.25], [Math.PI, 0.45 - i * 0.25], [-2.6, 0.5 - i * 0.25]], stroke: stitchOf(p, p.fur), w: 0.03 })
    const head = E([0, 0.2, 1.24], [0.5, 0.46, 0.42], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.28, eyeSize: 0.16, mouth: 'none', browW: 0.11 }))
    head.decals.push({ t: 'poly', pts: [[-0.25, 0.62], [0, 0.56], [0.25, 0.62]], stroke: stitchOf(p, p.fur), w: 0.025 })
    const pads: Part[] = []
    for (const side of [-1, 1]) {
      const pad = E([side * 0.15, 0.58, 1.08], [0.19, 0.14, 0.15], p.accent, { sd: [side * 0.3, 1, 0] })
      for (const [az, el] of [[0.3, 0.2], [0.6, 0.0], [0.3, -0.2], [0.8, 0.3]] as SP[]) pad.decals.push({ t: 'disc', at: [side * az, el], size: [0.06, 0.06], fill: stitchOf(p, p.accent) })
      pads.push(pad)
    }
    pads[0]!.decals.push(...mouthOnly(p, 'frown', -0.75, 0.3).map(d => ({ ...d, pts: d.pts!.map(([az, el]) => [az + 0.3, el] as SP) })))
    const nose = E([0, 0.66, 1.2], [0.1, 0.06, 0.06], p.nose, { flat: true, sd: [0, 1, 0.5] })
    const tusks = pair(C([0.12, 0.66, 1.0], [0.15, 0.8, 0.46], 0.065, p.accent2, { sd: [0.2, 1, 0], lw: 0.85 }))
    head.kids.push(...tusks, ...pads, nose)
    const flipper = E([0.72, 0.36, 0.2], [0.16, 0.26, 0.08], mixHex(p.fur, p.outline, 0.2), { rot: [0, 0, 0.5], sd: [1, 0.5, 0] })
    const rear = E([0.3, -0.76, 0.1], [0.2, 0.16, 0.06], mixHex(p.fur, p.outline, 0.2), { rot: [0, 0, -0.4], sd: [0.3, -1, 0] })
    body.kids.push(head, ...pair(flipper), ...pair(rear))
    if (o.boss) { head.kids.push(crownOn(head, 1.64, 0.26, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  }
}
