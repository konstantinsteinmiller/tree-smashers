#!/usr/bin/env node
/**
 * Arena THEMES (biomes) → every text-only Gemini prompt they need.
 *
 *   node tools/arena-themes/prompts.mjs
 *
 * Writes, from the one spec below (TEXT-ONLY prompts — this Gemini account
 * refuses reference edits):
 *   art-sheets/props/<sheet>.prompt.txt         3 × 3 prop sheet on magenta
 *   art-sheets/bg/<theme>.prompt.txt            seamless backdrop tile
 *   art-sheets/arena-floors/<theme>-<n>.prompt.txt   clearing floor variant
 *
 * The sprite ids of every sheet live in tools/arena-props/pack.mjs (SHEETS) and
 * their theme / size class in src/use/arenaProps.ts (PROP_KINDS); the paint
 * order + outputs in tools/arena-themes/paint-queue.mjs.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GAME = '"Tree Smashers", a cosy cartoon game where cute-but-angry stuffed-animal fighters battle on spinning wooden discs'

// ─── Prop sheets ────────────────────────────────────────────────────────────
/** sheet → [setting sentence, 9 object lines (row by row)] */
export const PROP_SHEETS = {
  'rocky-a': ['scenery that lies on the dry, rocky mountain steppe AROUND the arena of ' + GAME + '. Grey granite and warm ochre sandstone, dry golden grass.', [
    'one big rounded grey granite BOULDER with two small cracks, a lighter grey top and a darker grey lower side.',
    'a cluster of THREE grey BOULDERS of different sizes huddled together, touching.',
    'a tall, pointed ROCK SPIRE: a slim needle of layered grey-ochre rock, seen from high above so its top and one side show.',
    'a low, flat SANDSTONE SLAB in warm ochre and tan layers, lying almost flush with the ground, a few chipped edges.',
    'a long jagged RIFT: a crack in the dry ground seen from straight above, about four times as long as it is wide, a dark warm-brown inside, broken light-tan earth along both lips, a few crumbs of rock beside it. Completely flat, a ground decal.',
    'a short forked CRACK in the dry ground seen from straight above, three thin branches, dark warm-brown inside, light-tan lips. Completely flat, a ground decal.',
    'a round TUFT of dry, golden-straw steppe GRASS, short stiff blades fanning out.',
    'a tall clump of FEATHER GRASS: long thin pale-golden stems bending to one side, fluffy pale tips.',
    'a small scatter of six grey and tan PEBBLES of different sizes.'
  ]],
  'snowy-a': ['scenery that stands in deep snow AROUND the arena of ' + GAME + '. Clean white snow with pale-blue shadows, dark-green firs, pale ice.', [
    'a tall FIR tree laden with SNOW: dark-green layered branch tiers, thick white snow caps resting on every tier, a bit of trunk at the bottom.',
    'a PAIR of small snowy FIR trees side by side, dark green under white snow caps.',
    'one big rounded BOULDER under a thick white snow cap, the rock blue-grey with a pale icy glaze on its side.',
    'a cluster of pale-blue ICE CRYSTALS: five chunky, angular ice shards of different heights sticking up out of a little snow mound.',
    'a soft rounded SNOW DRIFT seen from high above: a low, wind-shaped white mound with pale-blue shading on one side. Low and flat, a ground decal.',
    'a cute little SNOWMAN of two snowballs with a carrot nose, coal-dot eyes and smile, two twig arms and a red knitted scarf.',
    'a small group of three STONES wearing little white SNOW caps.',
    'a small round FROZEN POND seen from straight above: smooth pale-blue ice with a few thin white crack lines and a soft white snow rim. Completely flat, a ground decal.',
    'a round winter HOLLY BUSH: dark-green spiky leaves dusted with snow and a few bright red berries.'
  ]],
  'volcanic-a': ['scenery that lies on the cooled, long-dead volcanic plain AROUND the arena of ' + GAME + '. Dark basalt, black-brown cooled lava rock, grey ash, charred wood. Everything is COLD: no fire, no embers, no glowing cracks, no orange or red light anywhere.', [
    'a cluster of dark HEXAGONAL BASALT COLUMNS of different heights, their flat six-sided tops in charcoal grey, darker sides.',
    'one big rough COOLED LAVA ROCK: a lumpy, pitted boulder in black-brown and charcoal, a few lighter grey ridges, cold and dull.',
    'a small heap of four or five COOLED LAVA STONES, pitted, black-brown and charcoal.',
    'a CHARRED TREE STUMP: black, cracked bark, a dark grey cut top with growth rings, cold.',
    'a bare, DEAD CHARRED TREE: a dark brown-black trunk with a few twisted, leafless branches, seen from high above.',
    'a TUFT of dry, grey-olive ASH GRASS growing out of a little patch of grey ash.',
    'a flat, COOLED LAVA FLOW seen from straight above: an irregular puddle of dark grey rock with ropey, swirling ridge lines, dull and cold. Completely flat, a ground decal.',
    'a jagged ground CRACK seen from straight above, about four times as long as wide, a dark charcoal inside and lighter ash-grey lips — dark and cold, NO glow, NO orange. Completely flat, a ground decal.',
    'a small cluster of shiny black OBSIDIAN shards with cool steel-blue highlights.'
  ]],
  'ruins-a': ['crumbling ancient stone RUINS that stand on a dry dusk heath AROUND the boss arena of ' + GAME + '. Weathered warm-grey and beige stone, olive moss, dry dark-red heath. Dramatic but friendly, never scary: no skulls, no bones, no weapons.', [
    'a BROKEN STONE COLUMN standing upright, its top snapped off in a jagged break, fluted sides, weathered warm grey.',
    'a TOPPLED COLUMN lying on the ground in three round drum segments, weathered warm grey with a little moss.',
    'a tall STANDING STONE (a menhir) of rough grey stone with a simple carved spiral on its face.',
    'a crumbled low STONE WALL fragment: a short run of fitted beige-grey blocks, its top broken and uneven, olive moss in the joints.',
    'a small RUINED ARCH: two short stone pillars joined by a half-broken arch of wedge stones, seen from high above.',
    'a heap of STONE RUBBLE: broken square blocks and chips of beige-grey stone.',
    'a wide jagged RIFT in the ground seen from straight above, about four times as long as wide, a deep dark-brown inside, crumbled stone and earth along its lips. Completely flat, a ground decal.',
    'a dry, thorny HEATH BUSH with small dark wine-red and rust-brown leaves.',
    'a low, flat RUNE STONE slab lying on the ground, grey, with a simple carved circle-and-swirl shape (no letters, no symbols that read as writing).'
  ]],
  'woodland-a': ['scenery that stands on the mossy floor of a deep, old forest AROUND the arena of ' + GAME + '. Deep greens, mossy bark, warm browns, a few red toadstools.', [
    'a tall dark-green SPRUCE tree: narrow and pointed, dense drooping branch tiers, a bit of trunk at the bottom.',
    'a slender BIRCH tree: white bark with black marks, a light, airy crown of small yellow-green leaves.',
    'a MOSSY TREE STUMP: brown bark, a thick cushion of bright moss on its cut top, a few roots spreading out.',
    'a cluster of three RED TOADSTOOLS with white spots and white stems, a little moss at their feet.',
    'a FAIRY RING of eight small brown MUSHROOMS standing in a circle on a patch of moss, seen from high above. Low, a ground decal.',
    'a FALLEN HOLLOW TRUNK lying on the ground: brown bark with moss on top, one open end showing the dark hollow inside.',
    'one big rounded BOULDER completely covered by a thick, soft cushion of green moss.',
    'a round BLUEBERRY BUSH: small dark-green leaves and clusters of round dark-blue berries.',
    'a small PILE OF FALLEN LEAVES in warm orange, brown and yellow, with two acorns.'
  ]],
  'bedroom-b': ['toys from a child\'s bedroom, left lying around the arena of ' + GAME + '. Plain, generic toys, no brand look, no logos.', [
    'a wooden ROCKING HORSE: a painted wooden horse in cream with a red saddle and a yarn mane, on two curved wooden rockers.',
    'a wooden PULL-ALONG DUCK toy on four little wheels, painted yellow with an orange beak, a pull string with a round wooden bead.',
    'a chunky red wooden TOY CAR with four big black wheels and a little blue window.',
    'an open wooden TOY CHEST with a domed lid, painted soft blue with a cream band, toys peeking out over its rim (a ball, a block, a plush ear).',
    'a small stack of three PICTURE BOOKS with bright plain covers (red, blue, yellow) — no text, no letters, no pictures on the covers.',
    'a little wooden TOY XYLOPHONE with rainbow-coloured bars on a wooden frame and two small mallets.',
    'a wooden SPINNING TOP in red and yellow stripes, standing on its point.',
    'a little TOY DRUM with a red side, white top and two wooden drumsticks crossed on it.',
    'a plush ELEPHANT lying on its side, soft light-grey fabric with big floppy ears and a stitched smile.'
  ]]
}

const propPrompt = (setting, items) => `WHAT COMES BACK IS ONE SQUARE SHEET OF 9 SEPARATE GAME DECORATION SPRITES, 3 ACROSS AND 3 DOWN, ON FLAT MAGENTA.
One square image, 1:1, nine equal square cells: 3 per row, 3 rows, one object per cell.
· Exactly 9 objects. Not 8, not 12, not 16. A wide canvas is wrong.

WHAT THEY ARE — ${setting} Row by row:
${items.map((t, i) => `${i + 1}. ${t}`).join('\n')}

VIEW — every object seen from HIGH ABOVE at a steep three-quarter angle (mostly top-down, with just a little of its front side visible), like the decoration around a board in a cosy mobile game; the objects described as ground decals are seen from straight above and lie flat. All nine share that one view and one light from the top-left.

STYLE — the same polished, cute cartoon look in all nine, painted in one hand: bold, dark brown outline around every object's silhouette (about 2% of a cell thick, clearly visible when the object is shown 40 pixels wide), flat cel shading with two or three hard-edged tones per colour, simple rounded shapes, friendly and toy-like. NO blur, NO soft airbrush, NO radial gradients, NO glow, NO bloom, NO photorealism. No text, no letters, no numbers.

SIZE — each object fills about 85% of its own cell, centred in it, with a clear gap to the next cell. Do NOT draw the cells: no boxes, borders, gutters, grid lines, labels or numbers.

WHAT IT IS NOT — no ground around the objects (no grass patch, no soil disc, no plate) unless it is part of the object as described, no cast shadows on the background (the game draws its own), no scenery, no characters.

BACKGROUND — this matters more than the style.
Fill every pixel that is not one of the 9 objects with solid, flat, pure magenta #FF00FF, edge to edge — a green-screen.
· EXACTLY #FF00FF — red 255, green 0, blue 255. Not pink, not rose, not mauve, not a tinted version of it.
· NOT transparent, NOT a checkerboard, NOT white, NOT a gradient. No glow, halo, vignette or shadow on the magenta.
· No object contains magenta, purple or hot pink (anything pink is a soft salmon-peach pink, never magenta).
· The palette above is for the objects; the ground stays a vivid, eye-hurting #FF00FF.
· Keep the bottom-right corner of the canvas plain magenta.

BEFORE YOU CALL IT FINISHED, count and check:
· Exactly 9 separate objects, 3 per row, 3 rows, in the order listed. Not 8, not 12, not 16.
· Each one stands alone with magenta all around it; nothing touches the next cell or the canvas edge.
· Every pixel that is not an object is flat, vivid #FF00FF.

OUTPUT: one square 1:1 image, 3 × 3 cells, magenta ground, 9 separate decoration sprites.
`

// ─── Backdrop tiles ─────────────────────────────────────────────────────────
/** theme → [what it is, colour line] */
export const BACKDROPS = {
  rocky: ['the wide, dry ROCKY MOUNTAIN STEPPE around the arena: packed, dusty earth with thin, dry steppe grass in drifts, small flat grey stones set into the ground and tiny gravel specks, each detail no bigger than 1% of the canvas. Base dusty olive-tan (#8a8358), lighter dry-grass drifts (#9a9264), darker earth drifts (#76704b), tiny grey stone specks (#8f8d86).',
    'muted, dusty and a little greyer than the arena, low contrast overall — it sits BEHIND a bright arena and must never compete with it. No bright highlights, no white.'],
  snowy: ['a wide, quiet SNOWFIELD around the arena: smooth wind-packed snow with broad, soft drift shapes and a few tiny blue-grey specks of ice, each detail no bigger than 1% of the canvas. Base cool pale grey-blue (#b9cbd8), lighter drift tops (#c9d8e3), darker drift shadows (#a6bccb).',
    'muted and noticeably GREYER and darker than fresh white snow, low contrast overall — it sits BEHIND a bright snowy arena and must never compete with it. No pure white, no bright highlights.'],
  volcanic: ['a wide, cold, long-dead VOLCANIC PLAIN around the arena: grey-brown ash ground with broad drifts of darker cooled lava rock, a few fine dark cracks and tiny charcoal pebble specks, each detail no bigger than 1% of the canvas. Base warm ash grey-brown (#5e5149), lighter ash drifts (#6b5d53), darker basalt drifts (#4c423c). Everything is cold: no glow, no embers, no orange or red light.',
    'muted, darkish and low in contrast — it sits BEHIND a bright arena and must never compete with it. No bright highlights, no white, no orange.'],
  ruins: ['a wide, dry DUSK HEATH around the ruined boss arena: short, dry heather and grass in deep rust and wine-brown drifts, with a few small, worn flat paving stones half sunk into the ground and tiny pale stone chips, each detail no bigger than 1% of the canvas. Base muted rust-brown (#6b4a40), lighter drifts (#7a564a), darker drifts (#5a3d35), worn stone flecks (#8a7a6c).',
    'muted, dusky and low in contrast — it sits BEHIND a bright arena and must never compete with it. No bright highlights, no white, no purple, no magenta.'],
  woodland: ['the wide, shady FOREST FLOOR of a deep old forest around the arena: soft moss and short shade grass in broad drifts, a few tiny fallen fir needles, tiny brown leaf specks and tiny moss tufts, each detail no bigger than 1% of the canvas. Base deep shady moss green (#3f6a3c), lighter moss drifts (#4a7746), darker shade drifts (#355b33), tiny brown needle specks (#6a5a3a).',
    'muted, shady and a little darker than a sunny lawn, low contrast overall — it sits BEHIND a bright arena and must never compete with it. No bright highlights, no white, no yellow-green.'],
  bedroom: ['the WOODEN FLOOR of a cosy child\'s bedroom around a play rug: warm honey-oak FLOORBOARDS seen from straight above, long planks running left to right in EXACTLY SIX perfectly straight, perfectly parallel rows of IDENTICAL height (every plank the same width, no wide / narrow planks, no rows that drift or bend), every plank about the same length with the end joints staggered row to row in a regular brick-like pattern, plank seams as thin darker lines of one constant thickness; planks vary only by a SLIGHT warm tone shift (no dark rows next to light rows, no bold stripes, no two-tone banding, no mismatched tiling), a few soft wood-grain streaks and tiny knots, each detail small. Base warm honey oak (#a8774c), lighter planks (#b4835a), darker planks and seams (#93663f).',
    'muted, warm and a little darker than the play rug in the middle, low contrast overall — it sits BEHIND a bright arena and must never compete with it. No bright highlights, no white, no shine, no reflections.']
}

const backdropPrompt = (what, colour) => `WHAT COMES BACK: ONE square, seamlessly tileable ground texture, 1:1, filling the whole canvas edge to edge. Not a scene, not a framed picture, no border, no vignette.

WHAT IT IS: ${what} Seen STRAIGHT FROM ABOVE like a map — no horizon, no sky, no perspective. It is the ground of "Tree Smashers", a cosy cartoon game.

WHAT IT IS NOT: no objects — no trees, no bushes, no boulders, no logs, no toys, no furniture, no paths, no water, no fences, no buildings, no characters, no animals, no text, no letters, no logo, no UI. Bigger things are placed ON TOP of this ground later by the game; the ground must stay EMPTY, quiet and low in detail so they read.

COLOUR: ${colour}

SEAMLESS: the texture is repeated in a grid. Anything that touches the left edge continues on the right edge, top continues on bottom. Keep the drifts broad and evenly spread so no visible grid repeat stands out.

STYLE: stylised cartoon with flat cel-shaded colour areas and clean rounded shapes, hard edges between tones. NO blur, NO airbrush, NO radial gradient, NO glow, NO photorealism, NO noise grain.

BEFORE YOU CALL IT FINISHED: one square texture, edge to edge, seen from straight above, calm muted colour, no objects, no text, tileable.

OUTPUT: one square image, 1:1, the whole canvas is the texture.
`

// ─── Clearing floors (variants per theme) ───────────────────────────────────
/** `<theme>-<n>` → [what it is, what it is not (theme-specific extras)] */
export const FLOORS = {
  'rocky-0': ['the floor of a rocky mountain-steppe clearing: dry, packed, light ochre-tan earth (#c2a87a as the base, lighter sandy patches #cdb68a, darker earth strokes #a88f63) with broad, flat, irregular patches of pale grey-tan gravel ground (#b8ab92, barely different from the earth, NO outline), thin dry-grass strokes in pale straw and tiny grey gravel dots, each no bigger than a fingernail on the canvas.',
    'no stones bigger than a fingernail, no slabs, no outlined stones of any size (stones would read as obstacles), no boulders, no standing rocks, no cracks, no rifts, no holes'],
  'rocky-1': ['the floor of a stony upland clearing: short, dry, sun-bleached olive grass (#a9a66e as the base, lighter patches #b6b37c, darker strokes #8f8c5a) worn through to pale sandy earth in a few broad patches (#c8b48a), with tiny gravel dots, each no bigger than a fingernail on the canvas.',
    'no stones bigger than a fingernail, no slabs, no outlined stones of any size (stones would read as obstacles), no boulders, no standing rocks, no cracks, no rifts, no holes'],
  'rocky-2': ['the floor of a high, dry gravel plateau: fine, light warm-grey gravel and sand (#b9ad96 as the base, lighter patches #c6bba5, darker gravel strokes #a0947d) with faint broad bands of ochre sand and a few thin tufts of dry straw grass, each no bigger than a fingernail on the canvas.',
    'no stones bigger than a fingernail, no slabs, no outlined stones of any size (stones would read as obstacles), no boulders, no standing rocks, no cracks, no rifts, no holes'],
  'ruins-0': ['the floor of an ancient ruined courtyard at dusk: big, worn, irregular FLAGSTONES fitted together like old paving, in muted warm rose-grey and beige (#9b7f74 as the base, lighter stones #a88c80, thin joint lines #8a6e64 only a little darker — no dark outlines), thin olive moss in a few of the joints, a few hairline chips, each detail small.',
    'no columns, no walls, no rubble heaps, no rifts, no holes, no carved symbols, no runes, no writing'],
  'ruins-1': ['the floor of a dusky old arena ground: dry, packed rust-brown earth (#8f6655 as the base, lighter patches #9c7262, darker strokes #7a5546) with a few broad, half-buried pale stone paving slabs (#a08a7c) and short dry wine-red heather strokes, each detail no bigger than a fingernail on the canvas.',
    'no columns, no walls, no rubble heaps, no rifts, no holes, no carved symbols, no writing'],
  'ruins-2': ['the floor of a ruined stone circle: short, dry dusk grass in muted rust and olive-brown (#8c6a52 as the base, lighter patches #997760, darker strokes #765843) with a broad, worn ring pattern of pale old paving stones only barely visible, and tiny pale stone chips, each detail no bigger than a fingernail on the canvas.',
    'no columns, no walls, no rubble heaps, no rifts, no holes, no carved symbols, no writing'],
  'woodland-0': ['the floor of a clearing deep in an old forest: soft, short moss and shade grass in deep calm green (#4e9a4e as the base, lighter moss patches #5aa957, darker strokes #3f8240) with a sprinkle of tiny fallen fir needles and small brown leaves (#7a6a3c), each no bigger than a fingernail on the canvas.',
    'no ferns, no mushrooms, no toadstools, no stumps, no logs, no roots, no rocks, no puddles, no holes'],
  'woodland-1': ['the floor of a forest glade: short, fresh shade grass in a slightly cool deep green (#4f9452 as the base, lighter patches #5ca35d, darker strokes #3d7c42) with small clusters of clover leaves and a few tiny white wood-anemone flowers, each no bigger than a fingernail on the canvas.',
    'no ferns, no mushrooms, no toadstools, no stumps, no logs, no roots, no rocks, no puddles, no holes'],
  'woodland-2': ['the floor of a pine forest clearing: soft moss mixed with a warm carpet of fallen pine needles (#6a8c4a as the base, lighter moss patches #78994f, warm needle drifts #8a7a4a), tiny pine-needle strokes evenly spread, each no bigger than a fingernail on the canvas.',
    'no ferns, no mushrooms, no toadstools, no stumps, no logs, no pine cones, no roots, no rocks, no holes'],
  'bedroom-0': ['a big soft PLAY RUG on a cosy playroom floor, seen straight from above and filling the canvas: a low, fluffy rug in soft cream and pastel colours (#e8d9bf as the base) with a few broad, simple, irregular pastel patches in mint (#bfe0c8), sky blue (#bcd6ea) and butter yellow (#f0e2a6), hard-edged like cut felt, and a few tiny stitched dashes along the patch edges.',
    'no toys, no furniture, no letters, no numbers, no roads, no houses, no pictures, no animals, no border, no fringe, no frame'],
  'bedroom-1': ['a soft, round-woven RAG RUG on a cosy playroom floor, seen straight from above and filling the canvas: broad woven bands in muted pastel cream (#e6d6ba), faded rose-peach (#e8c2ac), mint (#c2dcc4) and powder blue (#c2d4e4), each band made of small, flat woven stitch shapes, low contrast.',
    'no toys, no furniture, no letters, no numbers, no pictures, no animals, no fringe, no frame, no magenta, no purple'],
  'bedroom-2': ['a soft PLAY MAT made of big interlocking foam puzzle tiles on a cosy playroom floor, seen straight from above and filling the canvas: large square tiles in soft pastel mint (#c4e2cc), butter yellow (#f0e3aa), sky blue (#c0d8ec) and peach (#efcdb4) with gently wavy puzzle-edge seams between them, slightly darker seam lines.',
    'no toys, no furniture, no letters, no numbers, no pictures, no animals, no border, no frame'],
  'volcanic-0': ['the floor of a long-cooled volcanic clearing: smooth, dull, packed ash ground in warm grey-brown (#8a7466 as the base, lighter ash patches #977f70, darker strokes #74604f) with a few broad, flush patches of darker cooled basalt (#6c5c52), a sprinkle of tiny charcoal pebble dots and a few thin dry grey-olive grass strokes, each no bigger than a fingernail on the canvas. Everything is cold.',
    'no glow, no embers, no lava, no orange or red light, no fire, no smoke, no cracks, no holes, no boulders'],
  'volcanic-1': ['the floor of a cold basalt flat: dull, smooth cooled lava rock in warm dark grey-brown (#7c6a5e as the base, lighter patches #897569, darker strokes #66574d) with faint, broad, ropey swirl ridges barely darker than the base and a dusting of pale grey ash in a few patches (#9a8a7e), each detail small. Everything is cold.',
    'no glow, no embers, no lava, no orange or red light, no fire, no smoke, no cracks, no holes, no boulders'],
  'volcanic-2': ['the floor of an ash-covered clearing below a sleeping volcano: soft, dull, light grey-brown ash (#93806f as the base, lighter drifts #a08c7b, darker strokes #7b6959) with a few broad patches of first green-olive sprouts (#7f8a5a) and tiny dark pumice dots, each no bigger than a fingernail on the canvas. Everything is cold.',
    'no glow, no embers, no lava, no orange or red light, no fire, no smoke, no cracks, no holes, no boulders'],
  'snowy-0': ['the floor of a snowy forest clearing: smooth, packed snow (#dceaf3 as the base, lighter soft patches #e8f1f7, pale-blue shade strokes #c4d8e6) with a few broad, gentle, wind-carved drift shapes and a sprinkle of tiny blue-grey ice glints, each no bigger than a fingernail on the canvas.',
    'no footprints, no trees, no fir needles, no stones, no ice blocks, no puddles, no holes, no snowballs'],
  'snowy-1': ['the floor of a frosty meadow: a thin, patchy layer of snow over short frozen grass — mostly snow (#d8e7f0 as the base, lighter patches #e5eff5) with small irregular patches where pale frosted sage-green grass shows through (#a9c4b4), tiny frost-crystal dots, each no bigger than a fingernail on the canvas.',
    'no footprints, no trees, no stones, no ice blocks, no puddles, no holes'],
  'snowy-2': ['the floor of a frozen lake shore clearing: flat, packed snow (#d4e4ee as the base) with a few broad patches of smooth, matt, pale-blue ice (#bcd4e4) showing through, fine white frost scratches on the ice and tiny snow specks, each detail small.',
    'no cracks wider than a hair, no holes, no water, no reflections, no shine, no trees, no stones'],
  'meadow-3': ['the floor of a sunny flower meadow: short lush grass in fresh mid green (#80c460 as the base, lighter mown patches #90cf6e, grass-blade clumps #55a043) with a scattering of very small white daisies, yellow buttercups and pale-blue speedwell flowers, each no bigger than a fingernail on the canvas.',
    'no rocks, no stones bigger than a pea, no bushes, no mushrooms, no moss cushions, no dark blobs']
}

const floorPrompt = (what, not) => `WHAT COMES BACK: ONE square, full-bleed ground texture, 1:1, filling the whole canvas edge to edge — the floor that a game arena of "Tree Smashers" (cute stuffed-animal fighters on spinning wooden discs) sits on. Not a scene, not a framed picture, no border.

WHAT IT IS — ${what}

WHAT IT IS NOT — ${not}; no objects of any kind: no paths, no fences, no walls, no border, no frame, no vignette, no cast shadows, no light rays, no characters, no animals, no text, no letters, no logo, no UI. Game pieces are drawn ON TOP of this ground later; the ground itself must stay empty and calm so they read at a glance.

VIEW — seen STRAIGHT FROM ABOVE, like a map. No horizon, no sky, no perspective, no tilt.

STYLE — a cosy, polished mobile-game ground in a stylised cartoon hand: flat cel-shaded colour areas with clean, rounded shapes, two or three tones per area, hard edges between the tones. NO blur, NO soft airbrush, NO radial gradient, NO glow, NO bloom, NO photorealism, NO noise grain. Light from the top-left.

CONTRAST — low. The whole ground stays within a narrow band of mid tones; nothing is very bright, nothing is very dark. Small details are tiny (each about 2–3% of the canvas wide), evenly spread over the whole canvas, so no single spot draws the eye. The middle of the canvas is as calm as the rest.

BEFORE YOU CALL IT FINISHED: one square image, the ground fills it edge to edge, seen from straight above, flat cartoon colour areas, low contrast, no objects, no border, no text.

OUTPUT: one square 1:1 image, the whole canvas is the ground texture.
`

const write = (rel, text) => {
  const p = join(ROOT, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, text)
  return rel
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = []
  for (const [s, [setting, items]] of Object.entries(PROP_SHEETS)) {
    if (items.length !== 9) throw new Error(`${s}: ${items.length} items`)
    out.push(write(`art-sheets/props/${s}.prompt.txt`, propPrompt(setting, items)))
  }
  for (const [t, [what, colour]] of Object.entries(BACKDROPS)) out.push(write(`art-sheets/bg/${t}.prompt.txt`, backdropPrompt(what, colour)))
  for (const [f, [what, not]] of Object.entries(FLOORS)) out.push(write(`art-sheets/arena-floors/${f}.prompt.txt`, floorPrompt(what, not)))
  console.log(`${out.length} prompts written`)
}
