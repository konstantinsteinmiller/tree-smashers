/**
 * Painted meteors for the RING meteor shower (src/use/ringShower.ts) → TEXT-ONLY
 * Gemini prompts, one per palette family (fire = meadow / woodland / rocky /
 * volcanic / ruins, ice = snowy, candy = bedroom).
 *
 *   node tools/ring-meteor-art/prompts.mjs
 *
 * Writes art-sheets/ring-meteor-art/<name>.prompt.txt. Paint with
 * paint-queue.mjs, pack with pack.mjs. The procedural ring meteor (flat flame
 * teardrop in three nested tones + rock head with one light facet, ONE bold
 * navy outline) is the fallback and defines the look. New names on purpose:
 * the kept strike variant's prompt / painting (tools/meteor-art,
 * art-sheets/painted/meteor-meteor.png) are never touched.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GAME = '"Tree Smashers", a bright cartoon arena game with bold flat cel-shaded toy-box art'

const SHAPE = (rock, flames) => `ONE cartoon METEOR flying horizontally to the RIGHT. Its head is on the RIGHT: a chunky round rock in ${rock}. Behind it, streaming to the LEFT, a bold teardrop FLAME TRAIL about five times as long as the head is wide, built from three nested flat flame shapes: ${flames}, each a solid flat colour with crisp hard edges; the trail tapers to a sharp point on the far left and has two chunky flame tongues along its top edge and two along its bottom edge. The trail is perfectly horizontal (no tilt, no curve).`

/** name → { the object, the colours allowed, the colours forbidden }. */
export const SPRITES = {
  fire: {
    what: SHAPE('dark plum purple with one lighter purple facet on its upper-left', 'an outer red-orange flame, an orange middle flame and a sun-yellow inner core'),
    colours: 'red-orange, orange, sun yellow, cream white for the hottest core, dark plum purple for the rock, the navy outline',
    no: 'NO pink, NO magenta, NO blue, NO green, NO brown smoke'
  },
  ice: {
    what: SHAPE('deep royal blue with one pale icy-blue facet on its upper-left', 'an outer royal-blue flame, a bright sky-cyan middle flame and an icy near-white inner core'),
    colours: 'royal blue, sky cyan, icy near-white, deep navy-blue for the rock, the navy outline',
    no: 'NO orange, NO red, NO pink, NO magenta, NO purple, NO green, NO grey smoke'
  },
  candy: {
    what: SHAPE('periwinkle blue with one pale lilac-blue facet on its upper-left', 'an outer raspberry-pink flame, a bubblegum-pink middle flame and a cream-white inner core'),
    colours: 'raspberry pink, bubblegum pink, cream white, periwinkle blue for the rock, the navy outline',
    no: 'NO magenta (#FF00FF) anywhere in the sprite — keep the pinks clearly warmer/softer than pure magenta, NO orange, NO green, NO brown'
  }
}

export const promptFor = (name) => {
  const s = SPRITES[name]
  return [
    `Paint ONE game VFX sprite for ${GAME}.`,
    `The sprite: ${s.what}`,
    'Style: bold, chunky cartoon VFX that must read on ANY background (white snow, dark grey volcanic ash, brown ruins, green grass): ONE bold, even, dark navy (#161a40) outline around the whole silhouette, FLAT cel shading — every flame layer and the rock are solid flat colours with hard edges, at most two tones per colour, no tiny details. It is NOT plush and NOT fabric: NO stitches, NO seams, NO felt, NO fuzz, NO texture.',
    `Colours: ${s.colours}. ${s.no}. Clean, saturated, never muddy or greyed.`,
    'NO glow, NO blur, NO soft edges, NO gradients, NO lens flare, NO sparks or particles floating around it, NO smoke, NO motion-blur streaks, NO shadow, NO text, NO frame.',
    'Composition: a WIDE 3:1 landscape image. The meteor is centred vertically, perfectly horizontal, head on the right, trail to the left, filling about 92% of the image width with an even small margin on every side.',
    'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the sprite — no gradient, no texture, no shadow on it, no magenta anywhere inside the sprite. It will be keyed to transparency.',
    'Generate the image now.'
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = join(ROOT, 'art-sheets', 'ring-meteor-art')
  mkdirSync(dir, { recursive: true })
  for (const name of Object.keys(SPRITES)) {
    const p = join(dir, `${name}.prompt.txt`)
    writeFileSync(p, promptFor(name) + '\n')
    console.log(p)
  }
}
