// ─── Smasher models, batch A — forest-floor critters ─────────────────────────
//
// Rig models (+ signature palettes) of the smashers declared in
// src/data/smashers/batchA.ts. Same conventions as the base twelve in
// smasherRig.ts — build with the kit in @/smashers/rigKit.

import {
  C, E, bellyPatch, crownOn, face, mixHex, pair, seam, stitchOf, warPaint,
  type Builder, type Part, type SP, type SmasherPalette, type V3
} from '@/smashers/rigKit'
import type { BatchAId } from '@/data/smashers/batchA'

export const BATCH_A_PALETTES: Readonly<Record<BatchAId, SmasherPalette>> = Object.freeze({
  brock: { fur: '#8e909c', belly: '#f4f1e8', accent: '#25242b', accent2: '#f4ead8', nose: '#1b1a20', iris: '#5a3216', outline: '#18171d' },
  bandit: { fur: '#8f8e9a', belly: '#f1ede4', accent: '#2a2830', accent2: '#c9c3b6', nose: '#1a1a1f', iris: '#7a4412', outline: '#1b1a20' },
  croaky: { fur: '#86b64c', belly: '#f2e9a8', accent: '#5b8a2e', accent2: '#ef7b3a', nose: '#2d4a1a', iris: '#d08a0c', outline: '#1e3010' },
  slinky: { fur: '#c97d3c', belly: '#fff4e0', accent: '#2a1a12', accent2: '#ffffff', nose: '#3a1e12', iris: '#2a1a10', outline: '#22140a' },
  digger: { fur: '#5d5070', belly: '#9d8fae', accent: '#f4c430', accent2: '#f6a3b8', nose: '#e2708e', iris: '#2a1f33', outline: '#1c1624' },
  snooze: { fur: '#e2a24a', belly: '#fff0d2', accent: '#c7843a', accent2: '#9a5a2a', nose: '#e78a8a', iris: '#2a1608', outline: '#2a1606' },
  pongo: { fur: '#2e2c3a', belly: '#f4f1ea', accent: '#f4f1ea', accent2: '#ff9fb8', nose: '#ff8fa8', iris: '#7a3ab0', outline: '#121118' },
  pincer: { fur: '#8c3b2b', belly: '#e0ad7e', accent: '#3e1f16', accent2: '#f0c47c', nose: '#1a0d08', iris: '#2a1a10', outline: '#1a0d08' },
  rolly: { fur: '#6c7c9a', belly: '#c8d2e6', accent: '#4f5d7a', accent2: '#e8eef8', nose: '#2a3248', iris: '#1a2236', outline: '#141a2a' },
  prickles: { fur: '#5a463a', belly: '#b39a82', accent: '#f2e6cf', accent2: '#f0a23a', nose: '#1a1210', iris: '#3a1a0a', outline: '#140e0a' },
  newtie: { fur: '#f2772e', belly: '#ffd08a', accent: '#d8342a', accent2: '#ffe36a', nose: '#5a1a08', iris: '#2a1208', outline: '#2a1008' },
  gastro: { fur: '#a9c97c', belly: '#e8f0c2', accent: '#c9773a', accent2: '#f4d6a0', nose: '#3a4a20', iris: '#3a2a5a', outline: '#2a2214' }
})

/** Mouth-only decals of the face kit (no eyes, no brows), for muzzles. */
const mouthOnly = (p: SmasherPalette, mouthEl: number, mouthW: number, mouth: 'fangs' | 'teeth' = 'fangs') =>
  face({ iris: p.iris, outline: p.outline, mouth, mouthEl, mouthW }).filter(d => !d.at && (d.pts?.length ?? 0) !== 2)

/** Angry brow line on a small ball (eye stalk / eye dome): (az, el) pts. */
const browOn = (side: number, col: string, w = 0.16): { t: 'poly'; pts: SP[]; stroke: string; w: number } =>
  ({ t: 'poly', pts: [[side * 0.75, 0.95], [-side * 0.35, 0.55]], stroke: col, w })

/** A chain of ellipsoids along points (tails), each a kid of the first. */
const chain = (pts: V3[], r0: number, r1: number, col: (i: number) => string, sd: (i: number) => V3, lw = 0.7): Part => {
  const parts = pts.map((c, i) => {
    const rr = r0 + ((r1 - r0) * i) / Math.max(1, pts.length - 1)
    return E(c, [rr, rr, rr], col(i), { sd: sd(i), lw })
  })
  parts[0]!.kids.push(...parts.slice(1))
  return parts[0]!
}

export const BATCH_A_BUILDERS: Record<BatchAId, Builder> = {
  // Badger — wide low grey body, white face with two black stripes over the
  // eyes, long snout, black clawed paws.
  brock: (p, o) => {
    const body = E([0, -0.05, 0.56], [0.76, 0.7, 0.54], p.fur)
    body.decals.push(bellyPatch(p.accent, stitchOf(p, p.fur), 0, -0.12, 0.5, 0.5), seam(stitchOf(p, p.fur), Math.PI, -0.6, 1.0))
    const head = E([0, 0.26, 1.2], [0.52, 0.5, 0.42], p.belly)
    for (const side of [-1, 1]) {
      head.decals.push({ t: 'poly', pts: [[side * 0.16, 0.02], [side * 0.3, 0.2], [side * 0.4, 0.5], [side * 0.42, 0.85], [side * 0.4, 1.12]], stroke: p.accent, w: 0.17 })
      head.decals.push({ t: 'disc', at: [side * 1.25, -0.05], size: [0.4, 0.45], fill: p.fur })
    }
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.24, eyeSize: 0.2, mouth: 'none', brow: p.belly, browW: 0.09 }))
    const snout = C([0, 0.54, 1.04], [0, 0.94, 0.96], 0.16, p.belly, { sd: [0, 1, 0] })
    snout.kids.push(E([0, 0.93, 0.97], [0.09, 0.07, 0.07], p.nose, { flat: true, sd: [0, 1, 0] }))
    const mouth = E([0, 0.6, 0.9], [0.17, 0.1, 0.06], p.belly, { flat: true, lw: 0.5 })
    mouth.decals.push(...mouthOnly(p, 0, 0.55))
    const ear = E([0.4, 0.06, 1.56], [0.13, 0.07, 0.1], p.fur, { sd: [0.3, -0.2, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.5, 0.45], fill: p.belly })
    head.kids.push(mouth, snout, ...pair(ear))
    const paw = E([0.42, 0.54, 0.14], [0.2, 0.24, 0.13], p.accent, { sd: [0, 1, 0] })
    for (let i = -1; i <= 1; i++) paw.kids.push(C([0.42 + i * 0.08, 0.72, 0.12], [0.44 + i * 0.1, 0.86, 0.04], 0.04, p.accent2, { sd: [0, 1, 0], lw: 0.7 }))
    body.kids.push(head, ...pair(paw))
    body.kids.push(...pair(E([0.68, 0.2, 0.52], [0.14, 0.15, 0.22], p.fur, { rot: [0.35, 0.45, 0] })))
    body.kids.push(E([0, -0.74, 0.44], [0.13, 0.14, 0.12], p.fur, { sd: [0, -1, 0] }))
    if (o.boss) { head.kids.push(crownOn(head, 1.62, 0.26, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Raccoon — grey, black bandit mask, white muzzle, black hands, a big
  // ringed tail standing up behind.
  bandit: (p, o) => {
    const body = E([0, 0, 0.58], [0.56, 0.52, 0.58], p.fur)
    body.decals.push(bellyPatch(p.accent2, stitchOf(p, p.accent2), 0, -0.05, 0.45, 0.55))
    const head = E([0, 0.12, 1.3], [0.56, 0.46, 0.42], p.fur)
    head.decals.push({ t: 'disc', at: [0, 0.2], size: [0.66, 0.52], fill: p.belly })
    head.decals.push({ t: 'poly', pts: [[-0.95, 0.42], [-0.45, 0.56], [-0.12, 0.46], [0, 0.34], [0.12, 0.46], [0.45, 0.56], [0.95, 0.42], [0.85, 0.12], [0.4, 0.14], [0.1, 0.22], [0, 0.16], [-0.1, 0.22], [-0.4, 0.14], [-0.85, 0.12]], fill: p.accent, closed: true })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.24, eyeSize: 0.19, mouth: 'none' }))
    const muzzle = E([0, 0.5, 1.1], [0.19, 0.14, 0.12], p.belly)
    muzzle.kids.push(E([0, 0.62, 1.16], [0.09, 0.06, 0.06], p.nose, { flat: true }))
    muzzle.decals.push(...mouthOnly(p, -0.3, 0.42))
    const ear = C([0.34, 0.04, 1.6], [0.44, 0.0, 1.86], 0.15, p.fur, { sd: [0.3, -0.2, 1] })
    ear.kids.push(C([0.42, 0.0, 1.78], [0.44, 0.0, 1.86], 0.07, p.belly, { sd: [0, 0, 1] }))
    head.kids.push(muzzle, ...pair(ear))
    const tail = chain(
      [[0.04, -0.52, 0.4], [0.1, -0.76, 0.6], [0.14, -0.88, 0.86], [0.14, -0.88, 1.12], [0.12, -0.8, 1.36]],
      0.22, 0.2, i => (i % 2 ? p.accent : p.fur), i => [0, -1, 0.1 + i * 0.1]
    )
    // black rings bulge a little so they read from every side
    tail.kids.forEach((k, i) => { if (i % 2 === 0) k.r = [k.r![0] * 1.15, k.r![1] * 1.15, k.r![2] * 0.9] })
    body.kids.push(tail, head)
    body.kids.push(...pair(E([0.44, 0.3, 0.64], [0.09, 0.1, 0.15], p.accent, { rot: [0.5, 0.4, 0], sd: [0.4, 1, 0] })))
    body.kids.push(...pair(E([0.28, 0.46, 0.1], [0.15, 0.22, 0.1], p.accent, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.7, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Toad — squat and wide, bulging eye domes on top, huge grumpy mouth,
  // warts, folded back legs, orange toes.
  croaky: (p, o) => {
    const body = E([0, -0.02, 0.48], [0.74, 0.66, 0.46], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.2, 0.55, 0.45))
    for (const [az, el] of [[2.5, 0.6], [-2.6, 0.5], [3.1, 0.9], [1.9, 0.3], [-1.9, 0.35], [2.9, 0.2], [-2.9, 0.15]] as SP[]) {
      body.decals.push({ t: 'disc', at: [az, el], size: [0.16, 0.13], fill: p.accent })
    }
    const head = E([0, 0.24, 0.98], [0.6, 0.5, 0.38], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0, eyeEl: 0, mouth: 'fangs', mouthEl: -0.32, mouthW: 0.62 }).filter(d => !d.at && (d.pts?.length ?? 0) !== 2))
    for (const side of [-1, 1]) {
      head.decals.push({ t: 'disc', at: [side * 0.12, 0.02], size: [0.03, 0.025], fill: p.nose })
      head.decals.push({ t: 'disc', at: [side * 0.82, -0.18], size: [0.13, 0.09], fill: mixHex(p.fur, '#ff7a7a', 0.4) })
    }
    const dome = E([0.3, 0.3, 1.24], [0.19, 0.17, 0.17], p.fur, { sd: [0.3, 0.5, 1] })
    dome.decals.push({ t: 'eye', at: [0, 0.28], size: [0.62, 0.72], iris: p.iris, look: [-0.15, -0.1] }, browOn(1, p.outline, 0.07))
    head.kids.push(...pair(dome))
    const leg = E([0.62, -0.22, 0.3], [0.22, 0.38, 0.2], p.fur, { rot: [0, 0, 0.35], sd: [1, -0.3, 0] })
    leg.kids.push(E([0.66, 0.24, 0.06], [0.17, 0.24, 0.06], p.accent2, { sd: [0.3, 1, 0] }))
    body.kids.push(head, ...pair(leg))
    body.kids.push(...pair(E([0.34, 0.6, 0.1], [0.14, 0.17, 0.08], p.accent2, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.42, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Stoat — slim, standing tall with boxing paws up, long neck, white
  // bib, long tail with a black tip.
  slinky: (p, o) => {
    const body = E([0, 0, 0.6], [0.36, 0.34, 0.6], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, 0.1, 0.5, 0.75), seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.9))
    const neck = E([0, 0.08, 1.18], [0.24, 0.22, 0.3], p.fur, { sd: [0, 0, 1] })
    neck.decals.push({ t: 'disc', at: [0, 0], size: [0.55, 0.9], fill: p.belly })
    const head = E([0, 0.14, 1.56], [0.38, 0.34, 0.3], p.fur, { sd: [0, 0, 1] })
    head.decals.push({ t: 'disc', at: [0, -0.42], size: [0.5, 0.32], fill: p.belly })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.1, eyeSize: 0.22, mouth: 'fangs', mouthEl: -0.36, mouthW: 0.2 }))
    head.decals.push({ t: 'disc', at: [0, -0.16], size: [0.1, 0.07], fill: p.nose })
    const ear = E([0.28, 0.02, 1.8], [0.11, 0.05, 0.1], p.fur, { sd: [0.3, -0.2, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.5, 0.45], fill: p.belly })
    head.kids.push(...pair(ear))
    neck.kids.push(head)
    const tail = chain(
      [[0.04, -0.34, 0.28], [0.2, -0.62, 0.24], [0.42, -0.8, 0.34], [0.56, -0.82, 0.56], [0.6, -0.7, 0.78]],
      0.12, 0.13, i => (i >= 3 ? p.accent : p.fur), i => [0.3, -1, 0.1 * i]
    )
    body.kids.push(tail, neck)
    // boxing paws, raised in front of the chest
    body.kids.push(...pair(E([0.22, 0.4, 1.0], [0.1, 0.11, 0.11], p.fur, { sd: [0.2, 1, 0.2] })))
    body.kids.push(...pair(E([0.3, 0.2, 0.86], [0.08, 0.16, 0.08], p.fur, { rot: [0.9, 0, 0], sd: [0.6, 0.6, 0] })))
    body.kids.push(...pair(E([0.22, 0.36, 0.08], [0.12, 0.2, 0.08], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.86, 0.22, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Mole — velvet plum ball, pink star nose, huge pink digging hands,
  // a yellow miner's hard hat with a lamp.
  digger: (p, o) => {
    const body = E([0, 0, 0.56], [0.64, 0.6, 0.56], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.1, 0.5, 0.5), seam(stitchOf(p, p.fur), Math.PI, -0.6, 0.9))
    const head = E([0, 0.18, 1.2], [0.5, 0.46, 0.4], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.34, eyeSize: 0.21, mouth: 'none', brow: p.belly, browW: 0.09 }))
    const snout = E([0, 0.58, 1.0], [0.15, 0.22, 0.13], p.accent2, { sd: [0, 1, 0] })
    snout.decals.push(...mouthOnly(p, -0.45, 0.5))
    const nose = E([0, 0.8, 1.04], [0.07, 0.05, 0.07], p.nose, { flat: true, sd: [0, 1, 0] })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      nose.kids.push(C([Math.sin(a) * 0.04, 0.8, 1.04 + Math.cos(a) * 0.04], [Math.sin(a) * 0.17, 0.84, 1.04 + Math.cos(a) * 0.15], 0.035, p.accent2, { sd: [Math.sin(a), 0.3, Math.cos(a)], lw: 0.6 }))
    }
    snout.kids.push(nose)
    const hat = E([0, 0.02, 1.6], [0.32, 0.3, 0.14], p.accent, { sd: [0, 0, 1] })
    hat.kids.push(E([0, 0.04, 1.54], [0.4, 0.38, 0.045], mixHex(p.accent, p.outline, 0.15), { sd: [0, 0, -1] }))
    hat.kids.push(E([0, 0.32, 1.64], [0.09, 0.05, 0.08], '#fff6a8', { flat: true, sd: [0, 1, 0.2] }))
    head.kids.push(snout, hat)
    const hand = E([0.5, 0.5, 0.56], [0.22, 0.1, 0.24], p.accent2, { rot: [0, 0, 0.35], sd: [0.5, 1, 0] })
    for (let i = -1; i <= 2; i++) hand.kids.push(C([0.42 + i * 0.07, 0.56, 0.36 - Math.abs(i - 0.5) * 0.02], [0.4 + i * 0.09, 0.68, 0.22], 0.035, '#f6efe4', { sd: [0, 1, -0.3], lw: 0.6 }))
    body.kids.push(head, ...pair(hand))
    body.kids.push(...pair(E([0.3, 0.46, 0.1], [0.15, 0.2, 0.1], p.accent2, { sd: [0, 1, 0] })))
    body.kids.push(C([0, -0.56, 0.36], [0, -0.78, 0.3], 0.06, p.accent2, { sd: [0, -1, 0] }))
    if (o.boss) { hat.kids.push(crownOn(head, 1.7, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Dormouse — round golden fluffball, huge round ears, sleepy heavy lids
  // over angry eyes, a fluffy tail curled round on the disc, hazelnut.
  snooze: (p, o) => {
    const body = E([0, 0, 0.5], [0.56, 0.52, 0.5], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.05, 0.5, 0.55))
    const head = E([0, 0.12, 1.08], [0.5, 0.44, 0.4], p.fur)
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.1, eyeSize: 0.24, mouth: 'fangs', mouthEl: -0.34, mouthW: 0.16 }))
    for (const side of [-1, 1]) {
      // heavy sleepy lid over the top of each eye
      head.decals.push({ t: 'poly', pts: [[side * 0.6, 0.3], [side * 0.5, 0.42], [side * 0.38, 0.47], [side * 0.26, 0.42], [side * 0.16, 0.3], [side * 0.38, 0.26]], fill: mixHex(p.fur, p.outline, 0.15), stroke: p.outline, w: 0.03, closed: true })
      head.decals.push({ t: 'disc', at: [side * 0.62, -0.18], size: [0.13, 0.09], fill: mixHex(p.fur, '#ff7a7a', 0.4) })
    }
    head.decals.push({ t: 'disc', at: [0, -0.12], size: [0.08, 0.06], fill: p.nose })
    const ear = E([0.36, 0.0, 1.48], [0.22, 0.06, 0.22], p.fur, { rot: [0, 0, -0.25], sd: [0.4, -0.2, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.65, 0.65], fill: mixHex(p.belly, '#ff9a9a', 0.35) })
    head.kids.push(...pair(ear))
    const tail: Part[] = []
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.0 - i * 0.12)
      const rr = 0.2 - i * 0.012
      tail.push(E([Math.sin(a) * 0.66 + 0.02, Math.cos(a) * 0.6, 0.16 + i * 0.012], [rr, rr, rr * 0.85], i === 6 ? p.belly : p.accent, { sd: [Math.sin(a), Math.cos(a), 0], lw: 0.6 }))
    }
    const nut = E([0, 0.54, 0.62], [0.14, 0.12, 0.14], p.accent2, { sd: [0, 1, 0] })
    nut.kids.push(E([0, 0.54, 0.75], [0.15, 0.13, 0.06], mixHex(p.accent, '#7a9a3a', 0.6), { sd: [0, 0, 1] }))
    body.kids.push(...tail, head, nut)
    body.kids.push(...pair(E([0.2, 0.46, 0.64], [0.09, 0.13, 0.09], p.fur, { sd: [0.2, 1, 0] })))
    body.kids.push(...pair(E([0.26, 0.42, 0.1], [0.13, 0.18, 0.1], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.44, 0.22, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Skunk — black plush, white stripe from the forehead down the back,
  // a giant black-and-white plume tail arching over its head.
  pongo: (p, o) => {
    const body = E([0, 0, 0.56], [0.58, 0.54, 0.56], p.fur)
    body.decals.push(bellyPatch(mixHex(p.fur, p.belly, 0.25), stitchOf(p, p.belly), 0, -0.05, 0.45, 0.5))
    body.decals.push({ t: 'poly', pts: [[Math.PI - 0.32, 1.2], [Math.PI + 0.32, 1.2], [Math.PI + 0.22, -0.3], [Math.PI - 0.22, -0.3]], fill: p.accent, closed: true })
    const head = E([0, 0.14, 1.26], [0.52, 0.44, 0.42], p.fur)
    head.decals.push({ t: 'poly', pts: [[0, 0.1], [0, 0.6], [0, 1.1], [0, 1.5], [Math.PI, 1.2], [Math.PI, 0.6]], stroke: p.accent, w: 0.13 })
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.4, 0.22], size: [0.24, 0.22], fill: mixHex(p.fur, p.belly, 0.22) })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.4, eyeEl: 0.1, eyeSize: 0.21, mouth: 'none', brow: p.belly, browW: 0.07 }))
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.6, -0.2], size: [0.13, 0.09], fill: p.accent2 })
    const muzzle = E([0, 0.5, 1.06], [0.16, 0.12, 0.11], mixHex(p.fur, p.belly, 0.3))
    muzzle.kids.push(E([0, 0.61, 1.11], [0.08, 0.055, 0.055], p.nose, { flat: true }))
    muzzle.decals.push(...mouthOnly(p, -0.32, 0.45).map(d => (d.fill ? d : { ...d, stroke: p.outline })))
    const ear = E([0.36, 0.04, 1.6], [0.12, 0.06, 0.11], p.fur, { sd: [0.3, -0.2, 1] })
    ear.decals.push({ t: 'disc', at: [0, 0], size: [0.5, 0.45], fill: p.accent2 })
    head.kids.push(muzzle, ...pair(ear))
    const plume = chain(
      [[0, -0.58, 0.52], [0, -0.84, 0.86], [0, -0.84, 1.24], [0, -0.62, 1.56], [0, -0.34, 1.72]],
      0.28, 0.24, () => p.fur, i => [0, -1, 0.15 + i * 0.12], 0.7
    )
    const tip = E([0, -0.12, 1.66], [0.2, 0.2, 0.2], p.accent, { sd: [0, -0.3, 1], lw: 0.7 })
    plume.kids.push(tip)
    for (const k of [plume, ...plume.kids]) if (k !== tip) for (const az of [Math.PI, Math.PI / 2, -Math.PI / 2]) k.decals.push({ t: 'disc', at: [az, 0.3], size: [0.34, 0.6], fill: p.accent })
    body.kids.push(plume, head)
    body.kids.push(...pair(E([0.44, 0.3, 0.6], [0.12, 0.13, 0.2], p.fur, { rot: [0.4, 0.4, 0] })))
    body.kids.push(...pair(E([0.3, 0.46, 0.1], [0.15, 0.22, 0.1], p.fur, { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.68, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Stag beetle — glossy mahogany wing case with a centre seam, dark head,
  // giant antler mandibles reaching forward, antennae, six little legs.
  pincer: (p, o) => {
    const body = E([0, -0.2, 0.46], [0.62, 0.62, 0.44], p.fur)
    body.decals.push({ t: 'poly', pts: [[Math.PI, -0.3], [Math.PI, 0.3], [Math.PI, 0.8], [Math.PI, 1.3], [Math.PI, 1.55], [0, 1.4], [0, 1.1]], stroke: p.outline, w: 0.035 })
    for (const side of [-1, 1]) {
      body.decals.push({ t: 'disc', at: [side * 2.5, 0.75], size: [0.18, 0.12], fill: mixHex(p.fur, '#ffffff', 0.35) })
      body.decals.push(seam(stitchOf(p, p.fur), side * 1.9, -0.3, 0.9))
    }
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.25, 0.4, 0.3))
    const head = E([0, 0.54, 0.9], [0.37, 0.33, 0.37], p.accent, { sd: [0, 1, 0.3] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.42, eyeEl: 0.3, eyeSize: 0.3, mouth: 'fangs', mouthEl: -0.24, mouthW: 0.2, brow: p.accent2, browW: 0.08 }))
    const mand = (side: number): Part => {
      const col = mixHex(p.accent, p.fur, 0.45)
      const parts: Part[] = []
      for (let i = 0; i < 7; i++) {
        const t = i / 6
        const a = t * 2.2
        const c: V3 = [side * (0.3 + Math.sin(a) * 0.2), 0.72 + t * 0.48, 0.7 + t * 0.5]
        const rr = 0.1 - t * 0.04
        parts.push(E(c, [rr, rr, rr], col, { sd: [side * 0.3, 1, 0.3 * t], lw: 0.75 }))
      }
      parts[0]!.kids.push(...parts.slice(1))
      parts[0]!.kids.push(C([side * 0.48, 0.96, 0.9], [side * 0.32, 1.02, 0.88], 0.04, p.accent2, { sd: [-side, 0.5, 0], lw: 0.6 }))
      parts[0]!.kids.push(C([side * 0.34, 1.18, 1.18], [side * 0.2, 1.18, 1.24], 0.04, p.accent2, { sd: [-side, 0.5, 0.3], lw: 0.6 }))
      return parts[0]!
    }
    const antenna = C([0.14, 0.54, 1.12], [0.36, 0.48, 1.44], 0.035, p.accent, { sd: [0.3, -0.2, 1], lw: 0.6 })
    antenna.kids.push(E([0.37, 0.48, 1.46], [0.05, 0.05, 0.05], p.accent, { sd: [0, 0, 1] }))
    head.kids.push(mand(1), mand(-1), ...pair(antenna))
    body.kids.push(head)
    for (const [y, a] of [[0.3, 0.5], [-0.1, 0], [-0.5, -0.5]] as [number, number][]) {
      body.kids.push(...pair(C([0.5, y, 0.3], [0.78, y + a * 0.25, 0.06], 0.05, p.accent, { sd: [1, a, -0.5], lw: 0.7 })))
    }
    if (o.boss) { head.kids.push(crownOn(head, 1.3, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Pill bug — slate dome of overlapping armour bands, small pale face
  // peeking out in front, antennae, rows of tiny legs.
  rolly: (p, o) => {
    const body = E([0, -0.04, 0.5], [0.58, 0.62, 0.48], p.fur)
    const n = 7
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const y = 0.46 - t * 1.0
      const h = Math.sqrt(Math.max(0.05, 1 - ((y + 0.04) / 0.72) ** 2))
      const band = E([0, y, 0.48], [0.62 * h + 0.02, 0.14, 0.5 * h + 0.06], i % 2 ? p.accent : p.fur, { sd: [0, y >= 0 ? 0.2 : -0.2, 1], lw: 0.75 })
      band.decals.push({ t: 'disc', at: [0, 1.0], size: [0.3, 0.12], fill: mixHex(i % 2 ? p.accent : p.fur, '#ffffff', 0.25) })
      body.kids.push(band)
    }
    const head = E([0, 0.58, 0.46], [0.4, 0.26, 0.32], p.belly, { sd: [0, 1, 0] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.48, eyeEl: 0.0, eyeSize: 0.26, mouth: 'fangs', mouthEl: -0.4, mouthW: 0.24, browW: 0.08 }))
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.86, -0.24], size: [0.14, 0.1], fill: mixHex(p.belly, '#ff8a9a', 0.4) })
    const antenna = C([0.18, 0.7, 0.66], [0.46, 0.96, 0.9], 0.04, p.accent, { sd: [0.4, 1, 0.5], lw: 0.65 })
    antenna.kids.push(E([0.47, 0.97, 0.91], [0.05, 0.05, 0.05], p.accent, { sd: [0.4, 1, 0.3] }))
    head.kids.push(...pair(antenna))
    body.kids.push(head)
    for (let i = 0; i < 4; i++) {
      const y = 0.3 - i * 0.24
      body.kids.push(...pair(C([0.5, y, 0.14], [0.66, y + 0.04, 0.03], 0.04, p.belly, { sd: [1, 0, -1], lw: 0.6 })))
    }
    body.kids.push(...pair(C([0.12, -0.62, 0.22], [0.2, -0.86, 0.12], 0.05, p.accent, { sd: [0.3, -1, 0] })))
    if (o.boss) { body.kids.push(crownOn(E([0, 0, 1.0], [0.3, 0.3, 0.1], p.fur), 1.06, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Porcupine — dark brown, a huge fan of long white-tipped quills raised
  // over its back, pale face, orange buck teeth.
  prickles: (p, o) => {
    const body = E([0, -0.04, 0.6], [0.68, 0.64, 0.58], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.1, 0.5, 0.5))
    const head = E([0, 0.24, 1.18], [0.5, 0.44, 0.4], p.fur)
    head.decals.push({ t: 'disc', at: [0, 0.0], size: [0.6, 0.42], fill: p.belly })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.38, eyeEl: 0.12, eyeSize: 0.2, mouth: 'none', browW: 0.09 }))
    const muzzle = E([0, 0.6, 1.06], [0.22, 0.14, 0.15], p.belly)
    muzzle.kids.push(E([0, 0.72, 1.14], [0.1, 0.06, 0.07], p.nose, { flat: true }))
    muzzle.decals.push({ t: 'poly', pts: [[-0.4, -0.25], [-0.12, -0.15], [0, -0.2], [0.12, -0.15], [0.4, -0.25]], stroke: p.outline, w: 0.04 })
    muzzle.decals.push({ t: 'poly', pts: [[-0.15, -0.2], [0.15, -0.2], [0.15, -0.7], [-0.15, -0.7]], fill: p.accent2, stroke: p.outline, w: 0.025, closed: true })
    muzzle.decals.push({ t: 'poly', pts: [[0, -0.2], [0, -0.7]], stroke: p.outline, w: 0.02 })
    head.kids.push(muzzle, ...pair(E([0.4, 0.1, 1.46], [0.1, 0.06, 0.08], p.fur, { sd: [0.4, -0.2, 1] })))
    const quills: Part[] = []
    for (let ring = 0; ring < 3; ring++) {
      const el = 0.95 - ring * 0.38
      const k = 6 + ring * 2
      for (let i = 0; i < k; i++) {
        const az = Math.PI * (0.45 + (1.1 * i) / (k - 1))
        const rr = 0.62 * Math.cos(el)
        const bx = Math.sin(az) * rr
        const by = Math.cos(az) * rr - 0.04
        const bz = 0.6 + Math.sin(el) * 0.56
        const dir: V3 = [Math.sin(az) * 0.55, Math.cos(az) * 0.55 - 0.15, 0.75 - ring * 0.18]
        const len = 0.66 - ring * 0.08
        const tip: V3 = [bx + dir[0] * len, by + dir[1] * len, bz + dir[2] * len]
        const mid: V3 = [bx + dir[0] * len * 0.62, by + dir[1] * len * 0.62, bz + dir[2] * len * 0.62]
        const q = C([bx, by, bz], tip, 0.1, mixHex(p.fur, p.belly, 0.35), { sd: [dir[0], dir[1], -0.3], lw: 0.75 })
        q.kids.push(C(mid, tip, 0.05, p.accent, { sd: [dir[0], dir[1], 0.5], lw: 0.6 }))
        quills.push(q)
      }
    }
    body.kids.push(head, ...quills)
    body.kids.push(...pair(E([0.56, 0.32, 0.6], [0.14, 0.16, 0.24], p.fur, { rot: [0.3, 0.5, 0] })))
    body.kids.push(...pair(E([0.32, 0.52, 0.12], [0.2, 0.24, 0.12], mixHex(p.fur, p.outline, 0.25), { sd: [0, 1, 0] })))
    if (o.boss) { head.kids.push(crownOn(head, 1.58, 0.24, p.outline)); head.decals.push(...warPaint(2)) }
    return body
  },

  // Red eft newt — bright orange, red dark-ringed spots, wide smiley head
  // held up, splayed toes, a long curling tail with a little crest.
  newtie: (p, o) => {
    const body = E([0, -0.06, 0.44], [0.54, 0.56, 0.42], p.fur)
    body.decals.push(bellyPatch(p.belly, stitchOf(p, p.belly), 0, -0.25, 0.45, 0.35))
    for (const [az, el] of [[2.6, 0.7], [-2.6, 0.7], [2.0, 0.35], [-2.0, 0.35], [3.14, 0.35], [1.4, 0.5], [-1.4, 0.5]] as SP[]) {
      body.decals.push({ t: 'disc', at: [az, el], size: [0.17, 0.14], fill: p.outline })
      body.decals.push({ t: 'disc', at: [az, el], size: [0.12, 0.1], fill: p.accent })
    }
    const head = E([0, 0.38, 0.92], [0.37, 0.34, 0.33], p.fur, { sd: [0, 0.6, 1] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0.46, eyeEl: 0.12, eyeSize: 0.25, mouth: 'fangs', mouthEl: -0.3, mouthW: 0.4 }))
    for (const side of [-1, 1]) {
      head.decals.push({ t: 'disc', at: [side * 0.1, -0.06], size: [0.03, 0.025], fill: p.nose })
      head.decals.push({ t: 'disc', at: [side * 1.0, 0.45], size: [0.12, 0.1], fill: p.accent })
    }
    const crest: Part[] = []
    for (let i = 0; i < 3; i++) crest.push(C([0, -0.18 - i * 0.22, 0.82 - i * 0.07], [0, -0.3 - i * 0.22, 0.98 - i * 0.08], 0.09, p.accent2, { sd: [0, -0.5, 1], lw: 0.65 }))
    const tail = chain(
      [[0, -0.6, 0.3], [0.16, -0.84, 0.24], [0.4, -0.96, 0.2], [0.64, -0.9, 0.18], [0.8, -0.72, 0.18]],
      0.17, 0.08, i => (i === 2 ? p.accent : p.fur), i => [0.3, -1, 0.05 * i]
    )
    const leg = (x: number, y: number, fy: number): Part => {
      const l = E([x, y, 0.2], [0.13, 0.13, 0.18], p.fur, { sd: [Math.sign(x), fy, 0] })
      for (let i = -1; i <= 1; i++) l.kids.push(E([x * 1.3 + i * 0.06 * Math.sign(x), y + fy * 0.14 + i * 0.05, 0.04], [0.05, 0.05, 0.035], p.accent2, { sd: [Math.sign(x), fy, 0], lw: 0.6 }))
      return l
    }
    body.kids.push(tail, head, ...crest, ...pair(leg(0.46, 0.28, 1)), ...pair(leg(0.44, -0.38, -1)))
    if (o.boss) { head.kids.push(crownOn(head, 1.28, 0.24, p.outline)); head.decals.push(...warPaint(1)) }
    return body
  },

  // Snail — long soft green foot, a big caramel spiral shell on its back,
  // a little upright head with eyes on long stalks.
  gastro: (p, o) => {
    const foot = E([0, 0.06, 0.22], [0.62, 0.7, 0.22], p.fur)
    foot.decals.push(seam(stitchOf(p, p.fur), Math.PI / 2, -0.2, 0.6), seam(stitchOf(p, p.fur), -Math.PI / 2, -0.2, 0.6))
    const shell = E([0, -0.16, 0.86], [0.5, 0.56, 0.62], p.accent, { sd: [0, -0.4, 0.6] })
    for (const side of [-1, 1]) {
      const pts: SP[] = []
      for (let i = 0; i <= 28; i++) {
        const t = i / 28
        const a = t * Math.PI * 4.2
        const r = 0.95 * (1 - t * 0.92)
        pts.push([side * Math.PI / 2 + Math.cos(a) * r * side, Math.sin(a) * r * 0.9])
      }
      shell.decals.push({ t: 'poly', pts, stroke: p.accent2, w: 0.06 })
      shell.decals.push({ t: 'poly', pts, stroke: mixHex(p.accent, p.outline, 0.5), w: 0.02, dash: true })
    }
    const head = E([0, 0.66, 0.66], [0.3, 0.26, 0.36], p.fur, { sd: [0, 1, 0.2] })
    head.decals.push(...face({ iris: p.iris, outline: p.outline, eyeAz: 0, eyeEl: 0, mouth: 'fangs', mouthEl: -0.1, mouthW: 0.36 }).filter(d => !d.at && (d.pts?.length ?? 0) !== 2))
    for (const side of [-1, 1]) head.decals.push({ t: 'disc', at: [side * 0.6, -0.05], size: [0.16, 0.12], fill: mixHex(p.fur, '#ff8a8a', 0.4) })
    const stalk = C([0.1, 0.7, 0.92], [0.24, 0.78, 1.34], 0.06, p.fur, { sd: [0.3, 0.5, 1], lw: 0.7 })
    const ball = E([0.25, 0.79, 1.4], [0.15, 0.14, 0.15], '#ffffff', { sd: [0.3, 0.6, 1] })
    ball.decals.push({ t: 'eye', at: [0, 0], size: [0.62, 0.68], iris: p.iris, look: [-0.12, -0.08] }, browOn(1, p.outline, 0.06))
    stalk.kids.push(ball)
    head.kids.push(...pair(stalk))
    foot.kids.push(shell, head)
    foot.kids.push(C([0, -0.62, 0.16], [0, -0.96, 0.08], 0.14, p.fur, { sd: [0, -1, -0.5] }))
    if (o.boss) { shell.kids.push(crownOn(shell, 1.48, 0.26, p.outline)); head.decals.push(...warPaint(1).map(d => ({ ...d, pts: d.pts!.map(([a, e]) => [a * 0.9, e + 0.1] as SP) }))) }
    return foot
  }
}
