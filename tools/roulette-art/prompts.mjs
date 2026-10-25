/**
 * Boss-reward roulette wheel parts (RouletteWheel.vue) — TEXT-ONLY prompts in
 * the toy-box arena language (ui-catalog.md §1: navy ink, royal frames, sun
 * accents; no metal, no brown on UI).
 *
 *  rim   — one square painting: the ring around the turning prize face. Its
 *          round opening is keyed (flat magenta) and MEASURED by pack.mjs; the
 *          face and the bolts are re-registered to it (src/use/paintedRoulette.ts).
 *  parts — one 2 × 2 sheet: pointer | hub / bolt off | bolt on.
 */
import { MAGENTA, NAVY, NO_FX, STYLE_FLAT } from '../sprite-pack/lib.mjs'

const GAME = '"Tree Smashers", a bright cartoon toy game where cute-but-angry plush creatures battle on spinning discs'
const UI = 'Colours: royal blue (#2f4fd6), sky blue, ice white (#eef5ff), sun yellow (#ffd21a) and a little berry red (#f2306b) only where named. NO brown, NO wood, NO gold metal, NO chrome, NO metallic sheen or reflections — every surface is smooth painted toy plastic.'
const NO_STITCH = 'NO stitches, NO stitching lines, NO dashed lines, NO seams, NO felt or fabric texture (stitches belong only to the plush characters, never to UI objects).'

export const JOBS = {
  'roulette-rim': [
    `Paint ONE game UI element for ${GAME}: the RIM of a prize ROULETTE WHEEL, seen straight from the FRONT, a perfect circle, no perspective, no tilt.`,
    'Shape: a chunky but NOT too thick, perfectly ROUND ring: the whole band (outline to outline) is only about 14% of the outer diameter of the ring wide on each side. From the outside in: a bold navy outline; a wide royal-blue toy-plastic band with a lighter sky-blue highlight along its upper-left and a darker royal shade along its lower-right; a thin sun-yellow inner lip ring; then a bold navy outline around the opening. The band is SMOOTH and PLAIN — no bolts, no studs, no lights, no gems, no ornaments on it (round studs are placed on it later by the game).',
    'The CENTRE is a perfectly round, EMPTY HOLE whose diameter is 72% of the ring\'s outer diameter (a BIG opening: most of the ring is hole), filled with the SAME flat pure magenta (#FF00FF) as the background — nothing inside the hole: no spokes, no face, no shadow, no gradient.',
    STYLE_FLAT, UI, NO_STITCH, NO_FX,
    'Composition: a SQUARE image (1:1). The ring is centred and fills about 92% of the image, with an even magenta margin on every side; nothing is cut off.',
    MAGENTA, 'Generate the image now.'
  ].join('\n'),
  'roulette-parts': [
    `Paint a 2 × 2 SPRITE SHEET of four separate game UI parts for ${GAME}'s prize ROULETTE WHEEL, seen straight from the FRONT, no perspective. Each part sits alone in the middle of its own quarter of the image, about 65% of the quarter's size, with wide empty magenta space around it — the parts never touch each other or the image edges. No grid lines.`,
    'TOP-LEFT — the POINTER: a chunky toy pointer pointing straight DOWN: a round sun-yellow cap disc at the TOP (with a small ice-white centre dot) and below it a fat, short, berry-red triangular arrow tip pointing down, the tip rounded off. Mirror-symmetric left/right. Taller than wide (about 2 : 3).',
    'TOP-RIGHT — the HUB: a round chunky toy button cap seen from the front: a royal-blue outer disc, a sky-blue inner ring, and a raised sun-yellow centre dome with a small white highlight on its upper-left.',
    'BOTTOM-LEFT — a STUD (off): one small round ice-white toy stud / button with a light steel-blue shade on its lower-right. Simple, round, centred.',
    'BOTTOM-RIGHT — the same STUD lit (on): the same round stud, exactly the same size and shape, but bright sun yellow with a white highlight dot on its upper-left. Flat colour, NOT glowing.',
    STYLE_FLAT, UI, NO_STITCH, NO_FX,
    'Composition: a SQUARE image (1:1), four equal quarters.',
    MAGENTA, 'Generate the image now.'
  ].join('\n')
}
