/**
 * Floor decor (DECOR_DRAW in src/use/arenaTerrainDraw.ts) — ONE text-only 4 × 4
 * sheet. The ten DecorKinds plus the theme accents the scatter mixes in (the
 * vector code tints its tuft / small flower per theme palette; the painting
 * has one cell per theme look instead).
 *
 * Decor only shows on the PROCEDURAL floor (the painted floors carry their own
 * tufts), so it must sit in the same flat cartoon language as the painted
 * floors and terrain sprites: soft flat fills with ONE darker same-hue shade
 * and a thin dark outline in a darker shade of the object's own colour —
 * NOT the heavy navy UI ink, which would pop off the ground like a sticker.
 */
import { MAGENTA, NO_FX } from '../sprite-pack/lib.mjs'

/** Sheet order, row by row (pack.mjs + the generated registry use it). */
export const CELLS = [
  ['tuft', 'a small tuft of fresh green meadow grass: five short pointed blades fanning up from one spot (#4f9a3c-ish green, lighter tips).'],
  ['ferns', 'a small curled green FERN sprig: one gently curved stem with five pairs of short leaflets, leaning to the right.'],
  ['flowers', 'a tiny cluster of three small daisy-like flowers (white, soft pink and pale lilac petals, sunny-orange centres) on two short green leaves.'],
  ['pebbles', 'two small rounded tan SANDSTONE pebbles side by side (warm beige #c2a87a, lighter top), one bigger than the other.'],
  ['leaves', 'one fallen autumn LEAF lying flat, seen from above: a plump oval leaf in warm orange with a lighter centre vein, pointing to the right.'],
  ['snow', 'a small soft SNOW clump: two or three round white snow lumps merged together, pale ice-blue shade on their lower side.'],
  ['reeds', 'a small clump of two REEDS / cattails: two thin upright green stems, one carrying a plump brown-orange cattail head, plus one short leaf.'],
  ['acorns', 'one ACORN lying on the ground: a plump golden-tan nut with a darker textured cap and a tiny stem.'],
  ['cones', 'one small PINE CONE lying on the ground, tilted: a plump oval cone with overlapping rounded scales, warm chestnut colour with lighter scale edges.'],
  ['toadstools', 'one tiny TOADSTOOL: a short cream stem with a round red cap dotted with three white spots.'],
  ['flowerAccent', 'ONE tiny single sunny-yellow flower seen from above: five round petals around an orange centre.'],
  ['dryTuft', 'a small tuft of DRY straw grass: five short pointed blades fanning up, pale sandy tan with lighter tips.'],
  ['frostTuft', 'a small tuft of FROSTED grass: five short pointed blades fanning up, pale icy blue-white with white frosted tips.'],
  ['basalt', 'two small rounded dark BASALT pebbles side by side (warm grey-brown #6e5e54, lighter top), one bigger than the other.'],
  ['rubble', 'three small broken RUIN STONE chips side by side: angular little brick pieces in dusty rose-red (#9a5a4e), lighter top faces.'],
  ['darkTuft', 'a small tuft of deep FOREST grass: five short pointed blades fanning up, deep forest green with lighter green tips.']
]

export const prompt = () => [
  'Paint a 4 × 4 SPRITE SHEET of sixteen tiny GROUND DECORATIONS for "Tree Smashers", a bright cartoon toy game whose arenas are top-down painted clearings (meadow, forest, sandy rocks, snow, volcanic ash, old ruins).',
  'The sixteen sprites are seen from straight ABOVE / slightly from the front, the way small details look on a top-down game floor. Each sprite sits alone in the middle of its own cell of an even invisible 4 × 4 grid, about 55% of the cell\'s size, with wide empty magenta space around it — sprites NEVER touch each other or the image edges. No grid lines, no labels.',
  'Cells, row by row, left to right:',
  ...CELLS.map(([, what], i) => `${i + 1}. ${what}`),
  'Style: flat cartoon game art matching soft painted cartoon floors — flat fills with ONE darker same-hue shade tone and one small lighter highlight, a THIN dark outline in a darker shade of each object\'s own colour (not black, not navy), crisp clean edges, bright clean colours, no muddy tones. Simple chunky shapes that still read when shown only 20–30 pixels wide.',
  'NO stitches, NO dashed lines, NO fabric texture. ' + NO_FX + ' NO shadow under the sprites.',
  'Composition: a SQUARE image (1:1), four equal rows of four equal cells.',
  MAGENTA,
  'Generate the image now.'
].join('\n')
