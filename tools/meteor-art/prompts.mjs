/**
 * Painted meteor for the pre-battle meteor shower (src/use/meteorShower.ts)
 * → TEXT-ONLY Gemini prompt.
 *
 *   node tools/meteor-art/prompts.mjs
 *
 * Writes art-sheets/meteor-art/<name>.prompt.txt for every sprite in SPRITES.
 * Paint with tools/meteor-art/paint-queue.mjs, pack with tools/meteor-art/pack.mjs.
 * The procedural meteor (layered flat flame + plum rock + white-hot crescent,
 * navy outline) stays the fallback and defines the look the painting follows:
 * it must read over light snow, dark volcanic ash, brown ruins and green
 * meadow floors alike — so a bold navy outline and warm, saturated flat fills.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GAME = '"Tree Smashers", a cosy cartoon game where cute-but-angry stuffed-animal fighters battle on spinning wooden discs in a forest arena'

/** name → the object to paint. */
export const SPRITES = {
  meteor: 'ONE cartoon METEOR flying horizontally to the RIGHT. Its head is on the RIGHT: a chunky round rock in dark plum purple (one lighter purple facet on its upper-left), whose whole front (right) half is wrapped in a thick WHITE-HOT cream-yellow glowing cap — the hottest, brightest part. Behind it, streaming to the LEFT, a big bold FLAME TRAIL about four times as long as the head is wide, built from three nested flat flame shapes: an outer red-orange flame, an orange middle flame and a sun-yellow inner core, each a solid flat colour with crisp edges; the trail tapers to a point on the far left and has three or four chunky flame tongues along its top and bottom edges. The trail is perfectly horizontal (no tilt, no curve).'
}

export const promptFor = (name) => [
  `Paint ONE game VFX sprite for ${GAME}.`,
  `The sprite: ${SPRITES[name]}`,
  'Style: bold, chunky, toy-like cartoon VFX that must read on ANY background (white snow, dark grey volcanic ash, brown dirt, green grass): a bold, even, dark navy (#161a40) outline around the whole silhouette, FLAT cel shading — every flame layer and the rock are solid flat colours with hard edges, at most two tones per colour, no tiny details.',
  'Colours: red-orange, orange, sun yellow, cream white-hot, dark plum purple for the rock, the navy outline. NO pink, NO magenta, NO purple glow, NO blue, NO green, NO brown smoke.',
  'NO glow, NO blur, NO soft edges, NO gradients, NO radial gradients, NO lens flare, NO sparks or particles floating around it, NO smoke, NO motion-blur streaks, NO shadow, NO text, NO frame.',
  'Composition: a WIDE 3:1 landscape image. The meteor is centred vertically, perfectly horizontal, head on the right, trail to the left, filling about 92% of the image width with an even small margin on every side.',
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the sprite — no gradient, no texture, no shadow on it, no magenta anywhere inside the sprite. It will be keyed to transparency.',
  'Generate the image now.'
].join('\n')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = join(ROOT, 'art-sheets', 'meteor-art')
  mkdirSync(dir, { recursive: true })
  for (const name of Object.keys(SPRITES)) {
    const p = join(dir, `${name}.prompt.txt`)
    writeFileSync(p, promptFor(name) + '\n')
    console.log(p)
  }
}
