/**
 * Directional armour on the disc rim (drawArmorArcs in useSpinnerGame.ts) —
 * ONE text-only sheet, two rows: a reinforced PLATE tile (top) and a weak-spot
 * PATCH tile (bottom). At runtime each tile is laid tangentially along the
 * ±60° rim arc, repeated (3–5 tiles per arc, slightly overlapping), so a tile
 * must read as one SEGMENT of a band: long, low, its long edges straight and
 * parallel, ends rounded.
 *
 * In-game object, toy-box language: navy ink, flat cel shading. The plate is a
 * painted toy armour plate (cool slate blue, NOT shiny steel); the patch is
 * cloth, so stitches belong on it (stitches are for fabric — never the plate).
 */
import { MAGENTA, NAVY, NO_FX } from '../sprite-pack/lib.mjs'

export const prompt = () => [
  'Paint a SPRITE SHEET of two game parts for "Tree Smashers", a bright cartoon toy game where cute-but-angry plush creatures ride spinning toy discs. Both parts are seen straight from the FRONT, flat, no perspective. The image is split into a TOP half and a BOTTOM half; each part sits alone in the middle of its half, about 70% of the half\'s width, with wide empty magenta space around it — the two parts never touch each other or the image edges. No lines, no labels.',
  'TOP — a REINFORCED ARMOUR PLATE tile: one long, low, chunky horizontal plate (about 3 times as wide as tall), its top and bottom edges straight and parallel, its two short ends rounded. Cool slate-blue painted toy plastic (#6f86b8-ish base, a lighter ice-blue band along its top edge, one darker slate-blue tone along its bottom edge) with THREE big round ice-white bolt heads evenly spaced along its middle. Chunky and sturdy. NOT shiny steel, NO reflections, NO scratches, NO stitches.',
  'BOTTOM — a WEAK-SPOT CLOTH PATCH tile: one long, low horizontal patch of warm orange fabric (about 3 times as wide as tall), its top and bottom edges roughly straight and parallel with a few small frayed notches, its ends rounded; a row of short berry-red running stitches along its top and bottom edges and two small berry-red cross-stitch X marks in its middle. A lighter orange highlight along its top, one darker orange tone along its bottom.',
  `Style: chunky toy-like cartoon game art. A bold, even ${NAVY} outline around each part; flat cel shading with at most three tones per colour; crisp hard edges; bright clean colours, NO brown, NO muddy tones.`,
  NO_FX,
  'Composition: a SQUARE image (1:1), two equal halves stacked top and bottom.',
  MAGENTA,
  'Generate the image now.'
].join('\n')

/**
 * The tank BULWARK tile (drawArmorArcs, armor.look === 'bulwark'): ONE long,
 * low, very CHUNKY shield-wall segment — the opposite of the sharp steel plate
 * (a defender's fortification, not an attacker's edge). One tile, one cell.
 */
export const bulwarkPrompt = () => [
  'Paint ONE game part for "Tree Smashers", a bright cartoon toy game where cute-but-angry plush creatures ride spinning toy discs: a TANK BULWARK tile — one segment of a thick defensive shield wall. Seen straight from the FRONT, flat, no perspective.',
  'ONE long, low, VERY CHUNKY horizontal wall segment, about 2.4 times as wide as tall, its top and bottom edges straight and parallel, its two short ends rounded and fat. A sturdy rounded SHIELD-WALL of stacked warm oak planks (honey-wood #c9954f-ish base, lighter wheat top edge, one darker amber tone along the bottom) bound by TWO thick pale-stone bands running its full length, with FOUR big round domed ice-white studs set in a row along the middle and a fat rounded stone cap at each end. It must read as heavy, blunt, protective armour — soft rounded shapes, NO points, NO spikes, NO blades, NO sharp corners, NO jagged edges anywhere.',
  'Style: chunky toy-like cartoon game art. A bold, even dark navy (#161a40) outline around the whole part and around each stud; flat cel shading with at most three tones per colour; crisp hard edges; bright clean colours, NO muddy brown, NO steel, NO shiny metal.',
  'NO stitches, NO stitching lines, NO dashed lines, NO seams, NO felt, NO fabric. NO glow, NO blur, NO soft drop shadow, NO shadow on the ground, NO radial gradients, NO light rays, NO lens effects, NO text, NO letters, NO numbers, NO watermark.',
  'Composition: a SQUARE image (1:1); the part sits alone in the middle, about 70% of the image width, with wide empty magenta space around it.',
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the art — no gradient, no texture, no floor, no shadow on it. It will be keyed to transparency, so never use magenta, pink-purple or hot pink inside the art itself.',
  'Generate the image now.'
].join('\n')
