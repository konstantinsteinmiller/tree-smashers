// ─── Smasher models, batch B ─────────────────────────────────────────────────
//
// Rig models (+ signature palettes) of the smashers declared in
// src/data/smashers/batchB.ts. Same conventions as the base twelve in
// smasherRig.ts — build with the kit in @/smashers/rigKit.
//
// Theme: big brawlers & heavyweights. Every silhouette carries one feature
// readable from all 32 angles: camel humps, kangaroo ears + gloves + tail,
// wolf ruff + bushy tail, crocodile snout + scute ridge, lion mane, moose
// antler paddles, gorilla knuckle-walk arms, panda patches + bamboo, bison
// hump + low head, rhino double horn, hippo barrel muzzle, elephant ears +
// trunk.

import {
  C,
  E,
  bellyPatch,
  crownOn,
  face,
  mixHex,
  pair,
  seam,
  stitchOf,
  warPaint,
  type Builder,
  type Decal,
  type Part,
  type SP,
  type SmasherPalette,
  type V3
} from '@/smashers/rigKit'
import type { BatchBId } from '@/data/smashers/batchB'

export const BATCH_B_PALETTES: Readonly<Record<BatchBId, SmasherPalette>> = Object.freeze({
  humphrey: { fur: '#d9a865', belly: '#f3dcb0', accent: '#b9803e', accent2: '#e94f6a', nose: '#4a2e18', iris: '#3a2412', outline: '#2a1a0c' },
  boxa: { fur: '#d0884a', belly: '#f6dcb4', accent: '#e0323c', accent2: '#ffffff', nose: '#3a2214', iris: '#3a2214', outline: '#2a160c' },
  howler: { fur: '#7d8a9c', belly: '#eef0f4', accent: '#4a5468', accent2: '#ffffff', nose: '#1a1d26', iris: '#f2b72a', outline: '#161a24' },
  snapjaw: { fur: '#5aa04a', belly: '#e6e2a0', accent: '#3d7a34', accent2: '#ffffff', nose: '#1e3418', iris: '#e8c020', outline: '#16280f' },
  leon: { fur: '#e8b44c', belly: '#fbe8c0', accent: '#b0541c', accent2: '#6b2c10', nose: '#6a2e24', iris: '#7a4a10', outline: '#2a160a' },
  antlo: { fur: '#6b4630', belly: '#c79a6b', accent: '#ecd6a8', accent2: '#3a2418', nose: '#2a1a12', iris: '#2a1a10', outline: '#1c110a' },
  gronk: { fur: '#575263', belly: '#b9aab4', accent: '#3a3642', accent2: '#d6c6b0', nose: '#1a171c', iris: '#8a4a12', outline: '#141216' },
  bambam: { fur: '#f6f4ee', belly: '#ffffff', accent: '#2a2930', accent2: '#7ec850', nose: '#1a1a1e', iris: '#3a2a20', outline: '#141418' },
  buford: { fur: '#7a5236', belly: '#b08860', accent: '#3e2a1e', accent2: '#ece0c4', nose: '#1e140e', iris: '#2a160c', outline: '#180e08' },
  horace: { fur: '#a59a92', belly: '#ddd0c2', accent: '#7d7068', accent2: '#f2e8d2', nose: '#3b302b', iris: '#2a1e1a', outline: '#211915' },
  wallow: { fur: '#b28aaa', belly: '#f5c3c9', accent: '#8f6688', accent2: '#fff8ea', nose: '#5a3550', iris: '#3a1a30', outline: '#24121e' },
  rumble: { fur: '#9aa8c4', belly: '#f4c9d6', accent: '#7c89a8', accent2: '#fff6e2', nose: '#3a4258', iris: '#2a2f48', outline: '#1c2032' }
})

/** Just the frown + fangs of the face kit (no eyes / brows), for muzzles. */
const mouthOnly = (p: SmasherPalette, mouthEl: number, mouthW: number, mouth: 'fangs' | 'teeth' | 'frown' = 'fangs'): Decal[] =>
  face({ iris: p.iris, outline: p.outline, mouth, mouthEl, mouthW }).filter(d => !d.at && (d.pts?.length ?? 0) !== 2)

/** Two dark nostril dots on a snout surface. */
const nostrils = (col: string, dx: number, el: number, s = 0.12): Decal[] =>
  [-1, 1].map(side => ({ t: 'disc', at: [side * dx, el], size: [s, s * 1.2], fill: col } as Decal))

/** Pink cheek blush, for the cute half of cute-but-angry. */
const blush = (p: SmasherPalette, az: number, el: number, s = 0.12): Decal[] =>
  [-1, 1].map(side => ({ t: 'disc', at: [side * az, el], size: [s, s * 0.7], fill: mixHex(p.fur, '#ff6f8a', 0.4) } as Decal))

/** Four stubby plush legs (front + back pair) with a toe seam. */
const stubLegs = (p: SmasherPalette, col: string, x: number, yF: number, yB: number, r: V3): Part[] => {
  const leg = (y: number, sd: V3) => {
    const l = E([x, y, r[2]], r, col, { sd })
    l.decals.push({ t: 'poly', pts: [[-0.25, -0.2], [0.25, -0.2]], stroke: stitchOf(p, col), w: 0.025, dash: true })
    return l
  }
  return [...pair(leg(yF, [0.2, 1, 0])), ...pair(leg(yB, [0.2, -1, 0]))]
}

const BUILD: Record<BatchBId, Builder> = {
  // Camel — two tall humps under a pink saddle blanket, long neck curve,
  // droopy lidded muzzle, tufty forelock, knobbly legs.
  humphrey: (p, o) => {
    const body = E([0, -0.08, 0.6], [0.6, 0.64, 0.52], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.25, 0.42, 0.4))
    const humpF = E([0, 0.12, 1.08], [0.32, 0.3, 0.36], p.accent, { sd: [0, 0.4, 1] })
    const humpB = E([0, -0.42, 1.04], [0.32, 0.3, 0.34], p.accent, { sd: [0, -0.4, 1] })
    for (const h of [humpF, humpB]) h.decals.push(seam(stitchOf(p, p.accent), 0, -0.4, 0.9), seam(stitchOf(p, p.accent), Math.PI, -0.4, 0.9))
    const blanket = E([0, -0.15, 0.94], [0.5, 0.42, 0.14], p.accent2, { sd: [0, 0, 1], lw: 0.8 })
    for (let i = 0; i < 10; i++) blanket.decals.push({ t: 'disc', at: [(i / 10) * Math.PI * 2, -0.35], size: [0.12, 0.2], fill: '#ffd34d' })
    const neck = E([0, 0.36, 1.0], [0.2, 0.2, 0.36], p.fur, { rot: [-0.5, 0, 0], sd: [0, 1, 0.2] })
    const head = E([0, 0.5, 1.42], [0.37, 0.37, 0.34], p.fur, { sd: [0, 1, 0.4] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.2, eyeSize: 0.24, mouth: 'none', browW: 0.09 }))
    head.decals.push(...blush(p, 0.62, -0.1))
    const muzzle = E([0, 0.82, 1.26], [0.22, 0.16, 0.15], p.belly, { sd: [0, 1, 0] })
    muzzle.decals.push(...nostrils(p.nose, 0.32, 0.3, 0.1))
    muzzle.decals.push({ t: 'poly', pts: [[-0.5, -0.3], [-0.2, -0.22], [0, -0.32], [0.2, -0.22], [0.5, -0.3]], stroke: p.outline, w: 0.04 })
    muzzle.decals.push({ t: 'poly', pts: [[0, -0.32], [0, -0.05]], stroke: p.outline, w: 0.03 })
    const forelock = E([0, 0.36, 1.76], [0.16, 0.14, 0.1], p.accent, { lw: 0.8, sd: [0, 0, 1] })
    const ear = E([0.34, 0.36, 1.68], [0.08, 0.05, 0.11], p.fur, { rot: [0, 0.6, 0], sd: [0.6, -0.2, 1] })
    head.kids.push(muzzle, forelock, ...pair(ear))
    body.kids.push(neck, head, blanket, humpF, humpB)
    body.kids.push(...stubLegs(p, p.fur, 0.34, 0.36, -0.46, [0.14, 0.14, 0.2]))
    body.kids.push(C([0, -0.66, 0.66], [0, -0.82, 0.36], 0.06, p.accent, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 2.02, 0.19, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Kangaroo — upright, tall ears, red boxing gloves up, pouch, huge feet
  // and a thick tail propping it from behind.
  boxa: (p, o) => {
    const body = E([0, 0, 0.66], [0.44, 0.4, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.05, 0.48, 0.62))
    body.decals.push({ t: 'poly', pts: [[-0.32, -0.25], [-0.15, -0.32], [0.15, -0.32], [0.32, -0.25]], stroke: stitchOf(p, p.belly), w: 0.04 })
    const head = E([0, 0.06, 1.38], [0.38, 0.34, 0.34], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.2, eyeSize: 0.22, mouth: 'none' }))
    const muzzle = E([0, 0.36, 1.28], [0.18, 0.22, 0.15], p.belly, { sd: [0, 1, 0] })
    muzzle.kids.push(E([0, 0.56, 1.34], [0.08, 0.05, 0.05], p.nose, { flat: true, sd: [0, 1, 0.2] }))
    muzzle.decals.push(...mouthOnly(p, -0.3, 0.44))
    const ear = E([0.2, -0.1, 1.8], [0.1, 0.06, 0.3], p.fur, { rot: [-0.45, 0.35, 0], sd: [0.2, -0.3, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0.05], size: [0.4, 0.72], fill: mixHex(p.belly, '#ff9aa8', 0.35) })
    head.kids.push(muzzle, ...pair(ear))
    const glove = E([0.36, 0.46, 0.92], [0.18, 0.18, 0.17], p.accent, { sd: [0.3, 1, 0.1] })
    glove.decals.push({ t: 'disc', at: [0.6, 0.2], size: [0.32, 0.26], fill: mixHex(p.accent, '#ffffff', 0.35) })
    glove.kids.push(E([0.3, 0.32, 0.86], [0.11, 0.1, 0.1], p.accent2, { sd: [0, -1, 0] }))
    const arm = E([0.36, 0.22, 0.88], [0.09, 0.2, 0.09], p.fur, { sd: [1, 0, 0] })
    body.kids.push(head, ...pair(arm), ...pair(glove))
    body.kids.push(...pair(E([0.24, 0.42, 0.08], [0.13, 0.38, 0.08], p.fur, { sd: [0, 1, 0] })))
    const tail = C([0, -0.32, 0.4], [0, -1.02, 0.06], 0.22, p.fur, { sd: [0, -1, 0] })
    body.kids.push(tail)
    if (o.boss) { head.kids.push(crownOn(head, 1.92, 0.19, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Wolf — grey with a dark saddle, white cheek ruff, tall pointed ears,
  // amber eyes, broad muzzle, big bushy dark-tipped tail.
  howler: (p, o) => {
    const body = E([0, 0, 0.6], [0.52, 0.5, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.05, 0.42, 0.55))
    body.decals.push({ t: 'disc', at: [Math.PI, 0.45], size: [0.7, 0.4], fill: p.accent })
    const ruff: Part[] = []
    for (let i = 0; i < 9; i++) {
      const a = -1.5 + (i / 8) * 3.0
      const x = Math.sin(a) * 0.44
      const y = 0.18 + Math.cos(a) * 0.3
      ruff.push(C([x * 0.7, y - 0.05, 1.1], [x * 1.25, y + 0.05, 0.92], 0.13, p.belly, { sd: [Math.sin(a), Math.cos(a), -0.2], lw: 0.75 }))
    }
    const head = E([0, 0.14, 1.36], [0.46, 0.42, 0.4], p.fur)
    head.decals.push({ t: 'disc', at: [0, -0.18], size: [0.5, 0.3], fill: p.belly })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.22, eyeSize: 0.2, mouth: 'none', browW: 0.09 }))
    const muzzle = E([0, 0.5, 1.22], [0.17, 0.23, 0.13], p.belly, { sd: [0, 1, 0] })
    muzzle.kids.push(E([0, 0.75, 1.3], [0.08, 0.06, 0.06], p.nose, { flat: true, sd: [0, 1, 0.2] }))
    muzzle.decals.push(...mouthOnly(p, -0.32, 0.5))
    const ear = C([0.26, 0.04, 1.66], [0.36, -0.02, 2.06], 0.14, p.fur, { sd: [0.3, -0.2, 1] })
    ear.kids.push(C([0.3, 0.02, 1.76], [0.35, -0.01, 1.98], 0.07, p.accent, { sd: [0, 0.4, 1] }))
    head.kids.push(muzzle, ...pair(ear))
    const tail = E([-0.18, -0.68, 0.7], [0.24, 0.3, 0.52], p.fur, { rot: [0.6, 0.3, 0], sd: [0, -1, 0] })
    tail.kids.push(E([-0.24, -0.96, 1.12], [0.17, 0.17, 0.18], p.belly, { sd: [0, -0.5, 1] }))
    body.kids.push(head, ...ruff, tail)
    body.kids.push(...pair(E([0.3, 0.42, 0.12], [0.15, 0.24, 0.12], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.96, 0.2, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Crocodile — low long body, a long toothy snout, bulging eye bumps, a
  // double ridge of scutes down the back into a thick tail.
  snapjaw: (p, o) => {
    const body = E([0, -0.1, 0.5], [0.6, 0.66, 0.48], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.3, 0.45, 0.32))
    const head = E([0, 0.34, 1.0], [0.37, 0.37, 0.34], p.fur)
    for (const side of [-1, 1]) {
      const bump = E([side * 0.2, 0.4, 1.26], [0.16, 0.15, 0.13], p.fur, { sd: [side * 0.3, 0.4, 1] })
      bump.decals.push({ t: 'eye', at: [0, 0.3], size: [0.55, 0.62], iris: p.iris, look: [-side * 0.2, -0.15] })
      bump.decals.push({ t: 'poly', pts: [[side * 0.75, 1.15], [-side * 0.55, 0.85]], stroke: p.outline, w: 0.08 })
      head.kids.push(bump)
    }
    const snout = E([0, 0.82, 0.9], [0.26, 0.44, 0.13], p.fur, { sd: [0, 1, 0] })
    snout.decals.push(...nostrils(p.nose, 0.15, 0.55, 0.06))
    const jaw = E([0, 0.76, 0.76], [0.25, 0.4, 0.08], p.belly, { sd: [0, 1, -0.4], lw: 0.8 })
    const teeth: Part[] = []
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const y = 0.5 + i * 0.16
      teeth.push(C([side * 0.22, y, 0.84], [side * 0.24, y + 0.02, 0.72], 0.04, p.accent2, { sd: [side, 0.2, -0.3], lw: 0.6 }))
    }
    snout.decals.push({ t: 'poly', pts: [[-1.2, -0.6], [-0.6, -0.9], [0.6, -0.9], [1.2, -0.6]], stroke: p.outline, w: 0.03 })
    head.kids.push(jaw, snout, ...teeth)
    const scutes: Part[] = []
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const y = 0.08 - i * 0.24
      const z = 0.92 - i * 0.07
      scutes.push(C([side * 0.18, y, z], [side * 0.2, y - 0.04, z + 0.2], 0.09, p.accent, { sd: [side * 0.3, -0.3, 1], lw: 0.75 }))
    }
    const tail = E([0, -0.82, 0.3], [0.24, 0.32, 0.2], p.fur, { sd: [0, -1, 0] })
    tail.kids.push(C([0, -1.0, 0.3], [0.32, -1.24, 0.2], 0.16, p.fur, { sd: [0.4, -1, 0] }))
    tail.kids.push(C([0, -0.86, 0.46], [0, -1.02, 0.6], 0.07, p.accent, { sd: [0, -0.4, 1] }))
    body.kids.push(head, tail, ...scutes)
    body.kids.push(...pair(E([0.56, 0.3, 0.12], [0.2, 0.2, 0.12], p.fur, { sd: [1, 0.5, 0] })))
    body.kids.push(...pair(E([0.56, -0.44, 0.12], [0.18, 0.2, 0.12], p.fur, { sd: [1, -0.5, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.58, 0.2, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Lion — golden cub with a huge rust mane of puffs ringing the face, a
  // round muzzle, round ears and a thin tail with a dark tuft.
  leon: (p, o) => {
    const body = E([0, -0.04, 0.6], [0.56, 0.54, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.1, 0.44, 0.5))
    const head = E([0, 0.2, 1.34], [0.42, 0.38, 0.38], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.24, eyeSize: 0.2, mouth: 'none', browW: 0.09 }))
    const muzzle = E([0, 0.52, 1.22], [0.22, 0.14, 0.15], p.belly, { sd: [0, 1, 0] })
    muzzle.kids.push(E([0, 0.64, 1.32], [0.08, 0.05, 0.05], p.nose, { flat: true, sd: [0, 1, 0.2] }))
    muzzle.decals.push(...mouthOnly(p, -0.35, 0.5))
    const mane: Part[] = []
    const n = 12
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const x = Math.sin(a) * 0.44
      const z = 1.34 + Math.cos(a) * 0.42
      mane.push(E([x, 0.04, z], [0.2, 0.18, 0.2], i % 2 ? p.accent : mixHex(p.accent, p.accent2, 0.3), { sd: [Math.sin(a) * 0.3, -1, 0], lw: 0.75 }))
    }
    mane.push(E([0, -0.12, 1.36], [0.36, 0.14, 0.36], p.accent, { sd: [0, -1, 0], lw: 0.8 }))
    const ear = E([0.32, 0.12, 1.7], [0.1, 0.06, 0.1], p.fur, { sd: [0.3, 0.3, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.5, 0.5], fill: p.accent2 })
    head.kids.push(...mane, muzzle, ...pair(ear))
    const tail = C([0, -0.56, 0.5], [0.24, -0.92, 0.84], 0.05, p.fur, { sd: [0, -1, 0] })
    tail.kids.push(E([0.26, -0.95, 0.88], [0.1, 0.1, 0.12], p.accent2, { sd: [0, -1, 0.2] }))
    body.kids.push(head, tail)
    body.kids.push(...pair(E([0.42, 0.3, 0.6], [0.12, 0.14, 0.22], p.fur, { rot: [0.4, 0.4, 0] })))
    body.kids.push(...pair(E([0.3, 0.46, 0.12], [0.16, 0.24, 0.12], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 2.04, 0.2, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Moose — dark brown, long droopy muzzle, a chin bell, and two wide cream
  // antler paddles with tines spreading sideways.
  antlo: (p, o) => {
    const body = E([0, -0.04, 0.62], [0.58, 0.62, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.12, 0.42, 0.48), seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.8))
    const head = E([0, 0.22, 1.32], [0.42, 0.42, 0.4], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.42, eyeEl: 0.26, eyeSize: 0.19, mouth: 'none', browW: 0.09 }))
    const muzzle = E([0, 0.6, 1.16], [0.25, 0.3, 0.22], mixHex(p.fur, p.belly, 0.45), { sd: [0, 1, 0] })
    muzzle.decals.push(...nostrils(p.nose, 0.3, 0.2, 0.09))
    muzzle.decals.push(...mouthOnly(p, -0.3, 0.42))
    const bell = E([0, 0.4, 0.88], [0.09, 0.08, 0.14], p.fur, { sd: [0, 1, -0.5] })
    const ear = E([0.4, 0.06, 1.56], [0.13, 0.06, 0.07], p.fur, { rot: [0, -0.4, 0], sd: [1, -0.2, 0.4] })
    const antler = (side: number): Part => {
      const paddle = E([side * 0.6, 0.1, 1.76], [0.34, 0.09, 0.2], p.accent, { rot: [0, side * -0.35, 0], sd: [side, -0.1, 0.6], lw: 0.85 })
      paddle.decals.push(seam(mixHex(p.accent, p.outline, 0.4), 0, -0.6, 0.6))
      for (let i = 0; i < 3; i++) {
        const x = side * (0.42 + i * 0.16)
        paddle.kids.push(C([x, 0.1, 1.88 - i * 0.02], [x + side * 0.06, 0.12, 2.06 - i * 0.04], 0.06, p.accent, { sd: [side * 0.3, 0, 1], lw: 0.75 }))
      }
      paddle.kids.push(C([side * 0.88, 0.1, 1.7], [side * 1.06, 0.12, 1.78], 0.06, p.accent, { sd: [side, 0, 0.3], lw: 0.75 }))
      return paddle
    }
    const stem = (side: number): Part => C([side * 0.2, 0.12, 1.64], [side * 0.44, 0.1, 1.78], 0.07, p.accent, { sd: [side, 0, 1] })
    head.kids.push(muzzle, bell, ...pair(ear), stem(1), stem(-1), antler(1), antler(-1))
    body.kids.push(head)
    body.kids.push(...stubLegs(p, p.fur, 0.32, 0.36, -0.42, [0.14, 0.15, 0.16]))
    body.kids.push(C([0, -0.62, 0.7], [0, -0.78, 0.66], 0.07, p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.96, 0.19, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Gorilla — massive shoulders, small head with a heavy brow ridge, a grey
  // face + chest, long arms planted on big knuckles in front.
  gronk: (p, o) => {
    const body = E([0, -0.04, 0.68], [0.7, 0.58, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.05, 0.42, 0.42))
    body.decals.push(seam(stitchOf(p, p.fur), Math.PI, -0.5, 0.8))
    const head = E([0, 0.24, 1.32], [0.4, 0.38, 0.38], p.fur)
    head.decals.push({ t: 'disc', at: [0, -0.04], size: [0.52, 0.42], fill: p.belly })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.3, eyeEl: 0.14, eyeSize: 0.2, mouth: 'none', browW: 0.13, brow: p.accent }))
        const muzzle = E([0, 0.54, 1.18], [0.24, 0.14, 0.14], p.belly, { sd: [0, 1, 0] })
    muzzle.decals.push(...nostrils(p.nose, 0.18, 0.35, 0.09))
    muzzle.decals.push(...mouthOnly(p, -0.32, 0.5, 'teeth'))
    const crest = E([0, 0.06, 1.68], [0.12, 0.2, 0.08], p.accent, { sd: [0, -0.2, 1], lw: 0.8 })
    const ear = E([0.4, 0.12, 1.36], [0.06, 0.07, 0.09], p.belly, { sd: [1, 0, 0] })
    head.kids.push(crest, muzzle, ...pair(ear))
    const arm = E([0.68, 0.26, 0.58], [0.18, 0.2, 0.4], p.fur, { rot: [0.35, 0.2, 0], sd: [1, 0.3, 0] })
    const fist = E([0.72, 0.5, 0.16], [0.2, 0.2, 0.15], p.accent, { sd: [0.4, 1, 0] })
    fist.decals.push({ t: 'poly', pts: [[-0.3, 0.3], [-0.3, -0.2]], stroke: p.belly, w: 0.03 }, { t: 'poly', pts: [[0.1, 0.3], [0.1, -0.2]], stroke: p.belly, w: 0.03 })
    body.kids.push(head, ...pair(arm), ...pair(fist))
    body.kids.push(...pair(E([0.34, 0.3, 0.12], [0.18, 0.2, 0.12], p.accent, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.96, 0.19, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Panda — round white plush, black eye patches + ears + limbs + shoulder
  // band, hugging a green bamboo stalk.
  bambam: (p, o) => {
    const body = E([0, 0, 0.62], [0.7, 0.64, 0.62], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.fur), 0, -0.1, 0.45, 0.45))
    for (const side of [-1, 1]) body.decals.push({ t: 'disc', at: [side * 1.25, 0.5], size: [0.6, 0.45], fill: p.accent })
    body.decals.push({ t: 'disc', at: [Math.PI, 0.55], size: [0.9, 0.3], fill: p.accent })
    const head = E([0, 0.12, 1.38], [0.56, 0.5, 0.48], p.fur)
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.38, 0.28], size: [0.22, 0.27], fill: p.accent })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.18, eyeSize: 0.18, mouth: 'none', browW: 0.09, brow: '#000000' }))
    head.decals.push(...blush(p, 0.62, -0.12, 0.13))
    const muzzle = E([0, 0.52, 1.24], [0.22, 0.15, 0.15], p.belly, { sd: [0, 1, 0] })
    muzzle.kids.push(E([0, 0.65, 1.33], [0.09, 0.05, 0.05], p.nose, { flat: true, sd: [0, 1, 0.2] }))
    muzzle.decals.push(...mouthOnly(p, -0.32, 0.46))
    const ear = E([0.4, 0.02, 1.8], [0.16, 0.1, 0.15], p.accent, { sd: [0.3, -0.2, 1] })
    head.kids.push(muzzle, ...pair(ear))
    const bamboo = C([0.36, 0.56, 0.1], [0.5, 0.64, 1.36], 0.08, p.accent2, { sd: [0.3, 1, 0], lw: 0.85 })
    for (let i = 1; i < 4; i++) {
      const t = i / 4
      bamboo.kids.push(E([0.36 + 0.14 * t, 0.56 + 0.08 * t, 0.1 + 1.26 * t], [0.08, 0.08, 0.03], mixHex(p.accent2, p.outline, 0.3), { sd: [0.3, 1, 0], lw: 0.6 }))
    }
    bamboo.kids.push(C([0.47, 0.62, 1.12], [0.7, 0.72, 1.24], 0.05, mixHex(p.accent2, '#ffffff', 0.15), { sd: [1, 1, 0.3], lw: 0.6 }))
    const arm = E([0.56, 0.3, 0.72], [0.18, 0.2, 0.28], p.accent, { rot: [0.5, 0.4, 0], sd: [1, 0.6, 0] })
    body.kids.push(head, bamboo, ...pair(arm))
    body.kids.push(...pair(E([0.38, 0.5, 0.14], [0.22, 0.24, 0.14], p.accent, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 2.06, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Bison — tiny rear, enormous dark shaggy hump, head low in front with a
  // beard and short curved horns.
  buford: (p, o) => {
    const body = E([0, -0.16, 0.54], [0.56, 0.5, 0.5], p.fur)
    body.decals.push(seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.8))
    const hump = E([0, 0.06, 0.98], [0.6, 0.5, 0.5], p.accent)
    const tufts: Part[] = []
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.45 + (1.1 * i) / 6)
      tufts.push(E([Math.sin(a) * 0.5, 0.1 + Math.cos(a) * 0.4, 1.2 + (i % 2) * 0.12], [0.18, 0.18, 0.16], mixHex(p.accent, p.fur, i % 2 ? 0.25 : 0), { lw: 0.7 }))
    }
    const head = E([0, 0.58, 0.88], [0.37, 0.34, 0.36], p.fur, { sd: [0, 1, 0] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.42, eyeEl: 0.3, eyeSize: 0.28, mouth: 'none', browW: 0.11, brow: '#000000' }))
    const muzzle = E([0, 0.86, 0.76], [0.24, 0.12, 0.16], p.belly, { sd: [0, 1, 0] })
    muzzle.decals.push(...nostrils(p.nose, 0.32, 0.25, 0.1))
    muzzle.decals.push(...mouthOnly(p, -0.35, 0.46))
    const beard = E([0, 0.72, 0.52], [0.16, 0.1, 0.18], p.accent, { sd: [0, 1, -0.6], lw: 0.8 })
    const horn = (side: number): Part => {
      const h = C([side * 0.3, 0.56, 1.06], [side * 0.52, 0.62, 1.12], 0.1, p.accent2, { sd: [side, 0.3, 0.4] })
      h.kids.push(C([side * 0.5, 0.62, 1.1], [side * 0.56, 0.68, 1.32], 0.06, p.accent2, { sd: [side, 0, 1] }))
      return h
    }
    const forelock = E([0, 0.5, 1.16], [0.22, 0.16, 0.1], p.accent, { lw: 0.8, sd: [0, 0.5, 1] })
    head.kids.push(beard, muzzle, forelock, horn(1), horn(-1))
    body.kids.push(hump, ...tufts, head)
    body.kids.push(...stubLegs(p, p.accent, 0.3, 0.32, -0.5, [0.15, 0.16, 0.16]))
    body.kids.push(C([0, -0.74, 0.62], [0.05, -0.92, 0.38], 0.05, p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { forelock.kids.push(crownOn(forelock, 1.48, 0.2, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Rhino — grey armoured barrel with fold seams, head forward and low, a
  // big cream horn plus a small one behind it, tufted ears.
  horace: (p, o) => {
    const body = E([0, -0.08, 0.6], [0.66, 0.68, 0.56], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.3, 0.42, 0.32))
    for (const az of [1.2, -1.2, 2.1, -2.1]) body.decals.push(seam(stitchOf(p, p.fur), az, -0.5, 0.75))
    const saddle = E([0, -0.2, 1.02], [0.44, 0.44, 0.16], p.accent, { sd: [0, 0, 1], lw: 0.85 })
    saddle.decals.push(seam(mixHex(p.accent, p.outline, 0.4), Math.PI / 2, -0.4, 0.9), seam(mixHex(p.accent, p.outline, 0.4), -Math.PI / 2, -0.4, 0.9))
    const head = E([0, 0.42, 1.06], [0.44, 0.46, 0.38], p.fur, { sd: [0, 1, 0] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.72, eyeEl: 0.3, eyeSize: 0.26, mouth: 'none', browW: 0.11 }))
    const snout = E([0, 0.78, 0.96], [0.26, 0.16, 0.2], p.belly, { sd: [0, 1, 0] })
    snout.decals.push(...nostrils(p.nose, 0.36, 0.05, 0.08))
    snout.decals.push(...mouthOnly(p, -0.4, 0.5))
    const horn = C([0, 0.84, 1.12], [0, 1.0, 1.66], 0.17, p.accent2, { sd: [0, 1, 0.4] })
    const horn2 = C([0, 0.66, 1.34], [0, 0.66, 1.6], 0.1, p.accent2, { sd: [0, 0.6, 1] })
    const ear = C([0.28, 0.24, 1.36], [0.38, 0.14, 1.6], 0.09, p.fur, { sd: [0.4, -0.3, 1] })
    ear.kids.push(E([0.38, 0.14, 1.62], [0.05, 0.05, 0.05], p.accent, { sd: [0, 0, 1] }))
    head.kids.push(snout, horn2, horn, ...pair(ear))
    body.kids.push(saddle, head)
    body.kids.push(...stubLegs(p, p.fur, 0.38, 0.36, -0.46, [0.17, 0.17, 0.17]))
    body.kids.push(C([0, -0.74, 0.62], [0, -0.92, 0.4], 0.05, p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.66, 0.2, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Hippo — enormous barrel, a wide boxy muzzle with the mouth open on two
  // tusk-teeth, eye bumps on top, tiny ears, nostril bumps.
  wallow: (p, o) => {
    const body = E([0, -0.08, 0.56], [0.8, 0.72, 0.54], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.25, 0.48, 0.38), seam(stitchOf(p, p.fur), Math.PI, -0.5, 0.8))
    const head = E([0, 0.3, 1.18], [0.54, 0.46, 0.4], p.fur)
    for (const side of [-1, 1]) {
      const bump = E([side * 0.24, 0.36, 1.46], [0.16, 0.15, 0.13], p.fur, { sd: [side * 0.3, 0.4, 1] })
      bump.decals.push({ t: 'eye', at: [0, 0.3], size: [0.55, 0.62], iris: p.iris, look: [-side * 0.2, -0.15] })
      bump.decals.push({ t: 'poly', pts: [[side * 0.75, 1.15], [-side * 0.55, 0.85]], stroke: p.outline, w: 0.08 })
      head.kids.push(bump)
    }
    const muzzle = E([0, 0.66, 1.0], [0.48, 0.28, 0.28], mixHex(p.fur, p.belly, 0.35), { sd: [0, 1, 0] })
    muzzle.decals.push({ t: 'poly', pts: [[-0.55, 0.05], [-0.25, -0.38], [0.25, -0.38], [0.55, 0.05], [0.25, -0.05], [-0.25, -0.05]], fill: '#7a2a40', stroke: p.outline, w: 0.03, closed: true })
    muzzle.decals.push({ t: 'disc', at: [0, -0.3], size: [0.2, 0.06], fill: '#f07a8a' })
    for (const side of [-1, 1]) {
      muzzle.decals.push({ t: 'poly', pts: [[side * 0.46, -0.02], [side * 0.34, -0.06], [side * 0.38, -0.3]], fill: p.accent2, stroke: p.outline, w: 0.02, closed: true })
    }
    muzzle.decals.push(...blush(p, 0.75, 0.25, 0.14))
    const nose = (side: number) => E([side * 0.2, 0.74, 1.24], [0.1, 0.08, 0.07], p.fur, { sd: [side * 0.2, 0.6, 1] })
    const ear = E([0.36, 0.12, 1.54], [0.08, 0.06, 0.08], p.fur, { sd: [0.4, -0.2, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.5, 0.5], fill: p.belly })
    head.kids.push(muzzle, nose(1), nose(-1), ...pair(ear))
    body.kids.push(head)
    body.kids.push(...stubLegs(p, p.fur, 0.44, 0.36, -0.44, [0.2, 0.2, 0.16]))
    body.kids.push(C([0, -0.78, 0.6], [0, -0.92, 0.44], 0.05, p.accent, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.8, 0.22, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Elephant calf — chunky blue-grey, two huge flappy pink-lined ears, a
  // curled-up trunk, tusk nubs, toenail feet.
  rumble: (p, o) => {
    const body = E([0, -0.04, 0.62], [0.7, 0.64, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.2, 0.44, 0.4), seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.8))
    const head = E([0, 0.16, 1.36], [0.52, 0.48, 0.46], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.22, eyeSize: 0.19, mouth: 'none', browW: 0.1 }))
    head.decals.push(...blush(p, 0.6, -0.1, 0.12))
    const ear = E([0.6, 0.0, 1.34], [0.08, 0.34, 0.38], p.fur, { rot: [0, 0, 0.5], sd: [1, -0.3, 0] })
    ear.decals.push({ t: 'disc', at: [0.9, 0], size: [0.55, 0.6], fill: p.belly })
    const trunk: Part[] = []
    const seg: [V3, number][] = [[[0, 0.6, 1.22], 0.14], [[0, 0.74, 1.06], 0.12], [[0, 0.84, 0.9], 0.105], [[0, 0.95, 0.84], 0.095], [[0, 1.02, 0.94], 0.09]]
    seg.forEach(([c, r], i) => {
      const s = E(c, [r, r, r], p.fur, { sd: [0, 1, i === seg.length - 1 ? 0.2 : -0.1], lw: 0.85 })
      s.decals.push({ t: 'poly', pts: [[-0.5, 0.2], [0.5, 0.2]], stroke: stitchOf(p, p.fur), w: 0.02 })
      trunk.push(s)
    })
    trunk[trunk.length - 1]!.decals.push({ t: 'disc', at: [0, 0.5], size: [0.4, 0.4], fill: p.nose })
    const tusk = C([0.18, 0.56, 1.1], [0.22, 0.68, 1.0], 0.05, p.accent2, { sd: [0.4, 1, -0.2] })
    const mouth = E([0, 0.5, 1.08], [0.14, 0.08, 0.05], p.belly, { flat: true, lw: 0.5, sd: [0, 1, -0.3] })
    mouth.decals.push(...mouthOnly(p, 0, 0.55))
    const tuft = E([0, 0.12, 1.82], [0.1, 0.08, 0.06], p.accent, { sd: [0, 0, 1], lw: 0.7 })
    head.kids.push(...pair(ear), mouth, ...pair(tusk), ...trunk, tuft)
    body.kids.push(head)
    const leg = (x: number, y: number, sd: V3): Part => {
      const l = E([x, y, 0.18], [0.2, 0.2, 0.18], p.fur, { sd })
      const nails: SP[] = [[-0.3, -0.35], [0, -0.35], [0.3, -0.35]]
      for (const at of nails) l.decals.push({ t: 'disc', at, size: [0.12, 0.1], fill: p.accent2 })
      return l
    }
    body.kids.push(...pair(leg(0.38, 0.4, [0.2, 1, 0])), ...pair(leg(0.4, -0.4, [0.2, -1, 0])))
    body.kids.push(C([0, -0.66, 0.66], [0, -0.82, 0.4], 0.05, p.accent, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 2.04, 0.24, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  }
}

export const BATCH_B_BUILDERS: Record<BatchBId, Builder> = BUILD
