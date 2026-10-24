#!/usr/bin/env node
/**
 * Power-up pickup boxes (attack / defense / speed) -> TEXT-ONLY Gemini prompts.
 *
 *   node tools/powerup-art/prompts.mjs
 *
 * Writes art-sheets/powerup-art/<stat>.prompt.txt. Paint with paint-queue.mjs,
 * pack with pack.mjs (writes the files the game already loads:
 * public/images/powerups/<stat>-box_256x256.webp, see src/data/uiArt.ts).
 *
 * The game stamps the painted STAT ICON (public/images/stats/<stat>_256x256.webp)
 * on the box's round face plate (POWERUP_PLATE = cx .5, cy .56, r .24 of the
 * image), so the plate is painted EMPTY and the box colour carries the type.
 * Stat colours today: attack red (#ef4444), defense blue (#3b82f6), speed cyan (#06b6d4).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GAME = '"Tree Smashers", a cosy cartoon game where cute-but-angry stuffed-animal fighters battle on spinning wooden discs'

/** stat -> box colour + the small ornament that makes the silhouette type-specific. */
export const BOXES = {
  attack: {
    body: 'bright raspberry-red (#ef4444) with a lighter coral-red top face and a darker red shade on the lower-right',
    mark: 'the two top corners carry small chunky cream-white spike studs (a hint of punch), and a short cream-white chevron arrow points up from the top edge'
  },
  defense: {
    body: 'bright royal blue (#3b82f6) with a lighter sky-blue top face and a darker blue shade on the lower-right',
    mark: 'the four corners are rounded, chunky white caps, and a small white shield-shaped notch is cut into the top edge'
  },
  speed: {
    body: 'bright cyan-turquoise (#06b6d4) with a lighter aqua top face and a darker teal-blue shade on the lower-right',
    mark: 'two sun-yellow speed slashes sweep across the top-left corner, and the box leans very slightly forward (about 5 degrees) as if racing'
  }
}

export const promptFor = (stat) => [
  `Paint ONE game pickup icon for ${GAME}: a power-up BOX (${stat.toUpperCase()} boost).`,
  `The object: a chunky, rounded toy gift-block seen from the front with a hint of its top face, painted in ${BOXES[stat].body}. ${BOXES[stat].mark}.`,
  'IMPORTANT: in the middle of the front face, slightly below the centre (its centre about 56% of the way down the image), there is ONE perfectly round, EMPTY face plate: a flat off-white disc about 48% of the box width in diameter, with a bold dark navy ring. Leave the plate completely blank - no symbol, no picture, no letters on it (the game stamps the icon there later).',
  'Style: a bright, chunky, toy-like game icon - smooth painted surfaces like a well-made plastic toy block. NO stitches, NO seams, NO felt or fabric texture (stitches belong only to the plush characters). NO metal, NO bolts, NO rivets, NO treasure-chest or gold look. It must read instantly at 32-64 px: a bold, even, dark navy (#161a40) outline around the whole silhouette and the plate, flat cel shading with at most two tones per colour, simple big shapes, no tiny details.',
  'Colours: the box colour named above, white / off-white, dark navy outline, and sun yellow only where named. NO brown or muddy tones, NO gold, NO yellow-gold cast, NO orange.',
  'NO glow, NO blur, NO soft drop shadow, NO radial gradients, NO lens effects, NO text, NO letters, NO numbers.',
  'Composition: a SQUARE 1:1 image. The box is centred, upright, filling about 84% of the image with an even margin on every side.',
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the box - no gradient, no texture, no shadow on it, no magenta anywhere inside the box. It will be keyed to transparency.',
  'Generate the image now.'
].join('\n')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = join(ROOT, 'art-sheets', 'powerup-art')
  mkdirSync(dir, { recursive: true })
  for (const s of Object.keys(BOXES)) {
    const p = join(dir, `${s}.prompt.txt`)
    writeFileSync(p, promptFor(s) + '\n')
    console.log(p)
  }
}
