#!/usr/bin/env node
/**
 * Painted arena BORDERS → one text-only Gemini prompt per arena theme.
 *
 *   node tools/arena-borders/prompts.mjs
 *
 * Writes art-sheets/arena-borders/<theme>.prompt.txt: ONE square sheet with
 * THREE horizontal border strips stacked on flat magenta — three variations
 * of the same edge (same thickness, same colours, same height of the lower
 * edge, different arrangement). Each strip runs off both side edges of the
 * canvas (a section of an endless border, no end caps), so
 * tools/arena-borders/pack.mjs can make every strip seamlessly tileable and
 * the engine (src/use/arenaBorderArt.ts) can lay the strips along ANY clearing
 * outline. The LOWER edge of a strip is the side that faces the arena (it is
 * aligned to the collision wall), the upper edge the outside.
 *
 * TEXT-ONLY: this Gemini account refuses reference edits.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GAME = '"Tree Smashers", a cosy cartoon game where cute-but-angry stuffed-animal fighters battle on spinning discs in a clearing'

/** border key (an arena theme, or a special wall: 'lava' = the lava arena
 *  type, whose wall HURTS on contact; 'heal' = the forest arena type, whose
 *  wall HEALS on contact) → [what the border is, its colours, what it must
 *  NOT have]. The special walls replace the theme border of their arena type
 *  (arenaBorderArt.ts borderKeyFor). */
export const BORDERS = {
  lava: [
    'a LAVA WALL that HURTS: a continuous low ridge of dark, crusted MOLTEN ROCK chunks (black-brown and charcoal crust) split by bright ORANGE and YELLOW CRACKS of molten lava running between and through the chunks, little cartoon FLAME TONGUES licking up along the top edge, a few tiny ORANGE EMBER dots. Hot and dangerous at a glance — a player must see "do not touch" instantly.',
    'dark rock crust (like #2e2420, #4a3a32, #5e4a3e), molten cracks in FLAT bright orange (like #ff7a1a) with a flat yellow core line (like #ffd23a), flames in flat orange and yellow (like #ff9a2a, #ffe14a) with a few red-orange accents (like #e8452a).',
    'NO glow, NO light halo, NO bloom, NO soft gradients, NO light spilling onto the background — the heat is shown ONLY by flat, bright colours inside bold outlines; no smoke clouds, no skulls, no bones'
  ],
  heal: [
    'a HEALING WALL that HEALS: a continuous low hedge of soft, leafy green VINES and round leaf cushions, dotted with big friendly FLOWERS (mint-green and soft peach petals with bright yellow centres). The HEALING must be OBVIOUS at a glance: along the whole strip, EVENLY spaced about one every sixth of the width (6 to 8 per strip), alternate BIG chunky soft-red HEARTS and BIG chunky white PLUS SIGNS with a bold green outline, each as tall as the hedge itself, set into the leaves like glossy toy badges, with a few smaller plus signs and hearts rising just above the hedge. The hedge itself is a bright, fresh, minty, springlike green so it looks clearly different from a dark forest border. Restoring, friendly and safe — a player must see "this heals me" instantly.',
    'fresh leaf greens (like #3f9a4a, #5cc26a, #8fe08a), mint (like #bff0c8), soft peach petals (like #ffc2a8) — never magenta, purple or hot pink —, flower centres sunny yellow (like #ffd84a), hearts soft red (like #f2545b), plus signs white with a green outline.',
    'NO glow, NO halo, NO bloom, NO blurred sparkles — every sparkle, plus sign and heart is a small FLAT shape with a bold outline; NO stitches, NO felt; no red medical crosses (the plus signs are WHITE with a green outline), no bottles, no text'
  ],
  meadow: [
    'a low, natural MEADOW EDGE: a continuous row of small, rounded, leafy green BUSHES and thick clumps of long GRASS growing close together, little white DAISIES and yellow BUTTERCUPS dotted all along it, a few small rounded grey FIELDSTONES and short pieces of old weathered LOG half hidden in the greenery along its lower edge.',
    'fresh, sunny greens (like #4f9a3c, #6aad4f, #8fcd6b), warm light-grey stones, light honey-brown wood, white and yellow flower dots.',
    'no fence posts, no planks, no hedges cut into hard boxes, no animals'
  ],
  woodland: [
    'an old FOREST EDGE of FALLEN MOSSY LOGS and ROOTS: thick round brown LOGS lying end to end along the strip, thick soft cushions of bright green MOSS on their tops, gnarled brown ROOTS curling over and between them, a few small FERN fronds and tiny brown MUSHROOMS tucked in the moss.',
    'deep forest greens (like #2f7334, #4e9a4e, #6cbf5a), warm bark browns (like #6b4a2b, #8a6038), a few cream mushroom caps.',
    'no standing trees, no stumps sticking up high, no red toadstools, no animals'
  ],
  rocky: [
    'a STACKED BOULDER WALL: a continuous low wall of rounded BOULDERS of mixed sizes, grey granite and warm ochre sandstone, piled snugly together two or three deep, a few small tufts of dry golden steppe GRASS in the gaps between them.',
    'cool greys (like #8f8d86, #b4b1a8) and warm ochre-tans (like #c2a87a, #a88f63), dry straw-gold grass.',
    'no bricks, no mortar, no cut blocks, no tall spires'
  ],
  snowy: [
    'a SNOW BANK: a continuous, soft, rounded BANK of packed white SNOW, wind-shaped into gentle humps, chunky pale-blue ICE CHUNKS and a few dark blue-grey STONES with little snow caps half sunk into it, a few tiny dark-green fir twigs poking out.',
    'clean white snow with pale-blue shading (like #e8f1f7, #c4d8e6, #9fbfd8), pale glassy-blue ice (like #bfe3f5), blue-grey stone.',
    'no snowmen, no trees, no icicles hanging, no footprints'
  ],
  volcanic: [
    'a COOLED BASALT RIDGE: a continuous low ridge of dark hexagonal BASALT COLUMNS of different heights packed side by side (their flat six-sided tops in charcoal grey) mixed with lumpy, pitted COOLED LAVA ROCKS in black-brown, a little pale grey ASH in the gaps.',
    'charcoal greys (like #4c423c, #5e5149, #6b5d53), black-brown rock, pale ash grey (like #9a8a7e). Everything is COLD.',
    'no glow, no embers, no fire, no lava, no orange, no red light, no smoke'
  ],
  ruins: [
    'a BROKEN ANCIENT STONE WALL: a continuous low wall of weathered, fitted warm-grey and beige carved STONE BLOCKS, some blocks broken off or chipped, a few toppled blocks and rubble chunks along it, a simple carved band of swirls on some blocks, olive MOSS and a few small dark wine-red heath sprigs in the joints.',
    'weathered warm greys and beiges (like #9b8f84, #b5a898, #8a7a6c), olive moss (like #7a8a4a), a few wine-red sprigs (like #7a3a34).',
    'no letters, no runes that read as writing, no skulls, no bones, no weapons, no columns standing tall'
  ],
  bedroom: [
    'a TOY FENCE in a child\'s playroom: a continuous, perfectly REGULAR single row of chunky wooden TOY BUILDING BLOCKS: every block is the SAME size (a square-topped cube, all the same width and height), set side by side with the SAME small gap between neighbours, ONE block high, colours cycling in a fixed order red, sky blue, butter yellow, mint, red, sky blue, … so the pattern repeats exactly every four blocks. No arches, no cylinders, no pillows, no stacking, no odd pieces: the strip is a seamless repeating pattern so that it can be cut anywhere between two blocks and joined to any other cut without a visible break.',
    'soft toy colours (like #e0574f red, #7fb6e6 sky blue, #f2d36b butter yellow, #9fd8b4 mint), honey-wood blocks (like #d9a86a), cream and pale-blue pillows.',
    'the pillows are smooth, plain soft fabric — NO stitches, NO dashed seams, NO buttons; no letters or numbers on the blocks, no toys with faces, no furniture'
  ]
}

const SPECIAL = { lava: 'lava wall', heal: 'healing wall' }

export const borderPrompt = (theme, [what, colour, not]) => `WHAT COMES BACK IS ONE SQUARE IMAGE WITH THREE SEPARATE HORIZONTAL BORDER STRIPS STACKED ABOVE EACH OTHER, ON FLAT MAGENTA.
One square image, 1:1. Three long horizontal strips, one above the other, with flat magenta between them.
· Exactly 3 strips. Not 2, not 4.

WHAT THEY ARE — the BORDER around the clearing (the arena edge) of ${GAME}: ${what}
The strip is a straight section cut out of an ENDLESS border that runs all the way around the arena; the game lays it along the arena's curvy edge.

THE THREE STRIPS — three variations of the SAME border: the same kind of pieces, the same thickness, the same colours, the same scale, but a different arrangement of the pieces in each strip.

SHAPE OF EACH STRIP — this matters:
· It runs the FULL WIDTH of the canvas, from the very left edge to the very right edge, and is CUT OFF by both side edges, like a piece of an endless border. NO rounded ends, NO end caps, nothing that stops, tapers or curls up before the side edges.
· It is about one fifth of the canvas tall. Leave a clear band of magenta (about one tenth of the canvas) above the top strip, between the strips and below the bottom strip.
· Its LOWER edge is the side that faces the arena floor: a fairly even, continuous edge running straight across from left to right at the same height all along, with only small bumps. Its upper edge (the outside) may be bumpier.
· The pieces are evenly spread along the whole length: the same density everywhere, NO single big or eye-catching piece, NO gap in the middle — the strip is repeated many times around the arena.

COLOUR — ${colour}

VIEW — seen from HIGH ABOVE, almost straight down onto the tops of the pieces, with just a little of their lower (arena-facing) side visible. Lit evenly from straight above: the tops lighter, the lower front side a little darker. No cast shadows.

STYLE — polished, cute cartoon, like the decoration around the board of a cosy mobile game, all three strips painted in one hand: bold, dark brown outline around every piece's silhouette (clearly visible when a strip is shown 60 pixels tall), flat cel shading with two or three hard-edged tones per colour, simple rounded chunky shapes, friendly and toy-like. NO stitches, NO seams, NO felt or fabric texture on stones, wood, plants, snow or blocks. NO blur, NO soft airbrush, NO radial gradients, NO glow, NO bloom, NO photorealism, NO noise grain. No text, no letters, no numbers.

WHAT IT IS NOT — ${not}; no ground patch, no floor, no grass carpet under the strip, no characters, no scenery above or below the strips.

BACKGROUND — this matters more than the style.
Fill every pixel that is not part of a strip with solid, flat, pure magenta #FF00FF — a green-screen.
· EXACTLY #FF00FF — red 255, green 0, blue 255. Not pink, not rose, not mauve, not a tinted version of it.
· NOT transparent, NOT a checkerboard, NOT white, NOT a gradient. No glow, halo, vignette or shadow on the magenta.
· No piece contains magenta, purple or hot pink (anything pink is a soft salmon-peach pink, never magenta).

BEFORE YOU CALL IT FINISHED, count and check:
· Exactly 3 horizontal strips, each running edge to edge across the whole width, each cut off by the left and right edges (no ends).
· Magenta above, between and below the strips; the lower edge of each strip is even and straight.
· Same thickness, colours and scale in all three.

OUTPUT: one square 1:1 image, three stacked horizontal border strips (${theme}) on flat #FF00FF magenta.
`

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = join(ROOT, 'art-sheets', 'arena-borders')
  mkdirSync(dir, { recursive: true })
  for (const [t, spec] of Object.entries(BORDERS)) writeFileSync(join(dir, `${t}.prompt.txt`), borderPrompt(SPECIAL[t] ?? t, spec))
  console.log(`${Object.keys(BORDERS).length} border prompts written to art-sheets/arena-borders/`)
}
