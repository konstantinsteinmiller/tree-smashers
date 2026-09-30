/**
 * Bosses 100+ art registry — every drawable the three new bosses add
 * (bosses-100-feature.md §7.1): their trophy skins and their boss badges.
 *
 * ONE list, read by:
 *   art/bosses/build.mjs         bakes the procedural fallback into each target,
 *                                exports the reference sheets and PROMPTS-bosses.md
 *   art/bosses/status.mjs        PAINT-STATUS.md (what still needs painting)
 *   art/bosses/slice-return.mjs  the Art Desk's slice step for these jobs
 *   tests/bossArt.test.ts        registry ↔ catalog ↔ files contract
 *
 * Plain Node ESM, no DOM: importable from build scripts and from Vitest.
 * The skins' prompt TEXT stays in art/skins/ (concepts.mjs → build-prompts.mjs,
 * the house skin route); the badges' prompt text is built here.
 */
import { TROPHY_SKINS } from '../skins/concepts.mjs'

/** Where the Art Desk looks (tools/art-desk/config.mjs `sheetsDir`). */
export const SHEETS_DIR = 'art-sheets'
/** This registry's references, one folder down (the desk finds them by name). */
export const REFS_SUBDIR = 'bosses'
export const PROMPT_DOC = 'PROMPTS-bosses.md'
export const STATUS_DOC = 'PAINT-STATUS.md'
/** Hash of each baked procedural fallback — how status tells "painted" from "still the drawing". */
export const PROCEDURAL_RECEIPT = 'art/bosses/procedural.json'

/** The three new bosses, keyed by their `BossEncounterId` (src/data/bossEncounters.ts). */
export const BOSSES = [
  {
    encounter: 'cinder_tyrant', name: 'The Cinder Tyrant', skin: 'cinder', badgeFile: 'cinder-tyrant',
    emblem: 'a single flame (three tongues, orange with a yellow heart) inside a thick golden ring',
    palette: 'cast-iron frame #221e27 to #3b3640 with ash-grey highlights, a coal-black field #2e2124 with thin molten cracks #ff6a1a, the flame #ff6a1a with a #ffd27a heart',
    frame: 'a heavy cast-iron hexagonal frame with six round rivets at its corners',
    finishRefs: ['public/images/models/salamaner_256x256.webp', 'public/images/models/boulder_256x256.webp']
  },
  {
    encounter: 'glacier_warden', name: 'The Glacier Warden', skin: 'frost-vault', badgeFile: 'glacier-warden',
    emblem: 'a steel padlock whose keyhole is a white snowflake, a crust of frost on the top of its body',
    palette: 'steel blue-grey frame #4a5a6e with a frost-white crust #f2fbff along its two upper edges, a deep-ice field #2a7fc9, glacier-cyan #7fd4ff highlights',
    frame: 'a steel hexagonal frame with six round bolts at its corners, frost crusted along its top',
    finishRefs: ['public/images/models/ice_256x256.webp', 'public/images/models/checkmate_256x256.webp']
  },
  {
    encounter: 'frostbite_yeti', name: 'The Frostbite Yeti', skin: 'yeti', badgeFile: 'frostbite-yeti',
    emblem: 'a yeti face: a shaggy white fur head, a blue-grey face under a heavy white brow, two icy eyes and two short ivory tusks',
    palette: 'blue-grey hide frame #3b4b63 with snow-white studs, an icy field #9fe7e0 shading to #4aa3d8, snow-white #ffffff fur, ivory tusks',
    frame: 'a blue-grey leather-hide hexagonal frame with six snow-white studs, short icicles hanging off its lower edges',
    finishRefs: ['public/images/models/mammoth_256x256.webp', 'public/images/models/porcupine_256x256.webp']
  }
]

const skinDef = (id) => {
  const s = TROPHY_SKINS.find((t) => t.id === id)
  if (!s) throw new Error(`art/bosses: trophy skin "${id}" is not in art/skins/concepts.mjs TROPHY_SKINS`)
  return s
}

/**
 * Every drawable. `key` is the painter key (art/bosses/painters.mjs),
 * `stem` the reference / painting name the Art Desk files a return under,
 * `target` the drop-in path under public/ that the game loads.
 */
export const DRAWABLES = [
  ...BOSSES.map((b) => {
    const s = skinDef(b.skin)
    return {
      key: `skin/${b.skin}`,
      kind: 'skin',
      id: b.skin,
      boss: b.name,
      encounter: b.encounter,
      title: `${s.name} — ${b.name} trophy skin`,
      stem: `single-${b.skin}`,
      target: `images/models/${b.skin}_256x256.webp`,
      size: 256,
      // the house layout reference and prompt (art/skins/, build-refs + build-prompts)
      refSource: `art/skins/${s.cls}/single-${b.skin}.png`,
      promptFile: `art/skins/${s.cls}/prompt-${b.skin}.txt`,
      freePromptFile: `art/skins/${s.cls}/prompt-${b.skin}-free.txt`,
      finishRefs: b.finishRefs
    }
  }),
  ...BOSSES.map((b) => ({
    key: `badge/${b.encounter}`,
    kind: 'badge',
    id: b.encounter,
    boss: b.name,
    encounter: b.encounter,
    title: `${b.name} — boss badge`,
    stem: `badge-${b.badgeFile}`,
    target: `images/boss-badges/${b.badgeFile}_256x256.webp`,
    size: 256,
    refSource: null,
    promptFile: null,
    freePromptFile: null,
    finishRefs: ['public/images/boss-frame/boss-frame_384x369.webp', ...b.finishRefs.slice(0, 1)]
  }))
]

/** The badge master prompt (PROMPT-ANATOMY order: shape first, OUTPUT last). */
export const badgePrompt = (b) => `WHAT COMES BACK IS ONE HEXAGONAL BOSS BADGE, CENTRED, ON FLAT MAGENTA.
One square image, 1024 x 1024 pixels, holding exactly ONE flat hexagonal badge in the middle, sitting exactly where the grey hexagon sits in the LAST attached image.
· 1 badge. Not 2, not a row of badges — and not a scene, a character portrait, a poster or a medal hanging on a ribbon.

WHAT THE ATTACHMENTS ARE — read this before anything else.
· The LAST attachment is the LAYOUT REFERENCE: one grey hexagonal badge on magenta. Its flat grey shapes are NOTATION: they fix the badge's OUTLINE, SIZE and CENTRE, the frame, the inner field and where the emblem sits. Take nothing else from it — not its grey, not its flat fills. A result that comes back as the same grey shapes neatly shaded is a trace of the placeholder, and it is unusable.
· Every other attachment is a FINISH REFERENCE from the same game. Copy its finish — the bold ink, the cel shading, the highlights, the level of detail — and NEVER its subject: no horned skull, no bat wings, no other skin's creature.

WHAT IT IS — the crest of "${b.name}", a boss in "Chaos Arena", a spinning-top battle game. It is shown on the boss's teaser, intro card and trophy screen, at 48 to 200 pixels across.
· The FRAME: ${b.frame}.
· The FIELD inside the frame, and on it the EMBLEM, big and centred: ${b.emblem}.

COLOURS: ${b.palette}.

THE VIEW — flat and frontal, like an enamel pin lying on a table seen from straight above. No perspective, no tilt, no three-quarter view, no cast shadow.

STYLE — polished mobile-game art, exactly like the finish references:
· A bold dark contour around every shape — at its heaviest about 2% of the badge's width. Hold it at thumbnail size: if the outline has thinned to a hairline, it is several times too thin.
· Rich, saturated colour with two or three cel-shading steps per shape and a soft light from the top-left; a crisp white highlight painted ON metal, ice and enamel (a shine band or dot — never a four-pointed sparkle star floating over it).
· Chunky, readable shapes: the emblem must still read at 48 pixels across.
· AVOID: flat vector clip-art; pale hairline outlines; photorealism or a plastic 3D render; text, letters, numbers or runes; a soft glow or bloom around the frame; anything see-through; drop shadows.

LAYOUT / SIZE — measured against the image, not judged by eye:
· Centred exactly in the middle of the image; the hexagon has a point at the top and a point at the bottom.
· About 760 px tall (74% of the image), exactly as big as the grey hexagon. At least 120 px of magenta between the badge and every edge.
· Nothing — no flame, icicle, fur or crust — pokes out more than 20 px past the grey hexagon.
· The bottom-right corner of the image stays empty magenta.

BACKGROUND — this matters more than the style.
Fill every pixel that is not the badge with solid, flat, pure magenta #FF00FF, edge to edge — treat it as a green screen.
· EXACTLY #FF00FF — red 255, green 0, blue 255. Not pink, not purple, not a tinted version of it.
· NOT transparent (never a grey-and-white checkerboard), NOT white, NOT a gradient, NOT a texture.
· No card, plate or circle behind the badge; no glow, halo or shadow on the magenta. Any glow stays INSIDE the badge.
· The badge contains no magenta and no hot pink anywhere.

BEFORE YOU CALL IT FINISHED, count and check:
· Exactly one hexagonal badge, point up, centred.
· The emblem is ${b.emblem.split(':')[0]}, big, in the middle of the field.
· Six studs or rivets on the frame's six corners.
· Every pixel that is not the badge is flat, vivid #FF00FF.
· No text, labels, numbers, sparkle stars or watermarks.

OUTPUT: one image, 1024 x 1024 pixels, 1:1 square, PNG. If your tool has an aspect-ratio control, set it to 1:1. No labels, captions, numbers or watermarks.
`

export const bossFor = (encounter) => BOSSES.find((b) => b.encounter === encounter)
export const drawableByStem = (stem) => DRAWABLES.find((d) => d.stem.toLowerCase() === String(stem).toLowerCase())
