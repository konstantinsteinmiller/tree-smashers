/**
 * Boss badges (images/boss-badges/*), the level-up arrow (the one images/stats
 * file still used) and the rewarded-ad MOVIE icon — TEXT-ONLY prompts in the
 * toy-box arena language (ui-catalog.md §1): navy ink, flat cel shading,
 * painted toy plastic; no metal, no brown, no stitches on UI. The movie icon
 * marks every "watch an ad" CTA, whose tone is SKY — but it sits ON sky
 * buttons, so it is white + royal + sun, never green (Play Store rule: no
 * green rewarded-ad CTA).
 *
 * One icon per job (they ship at 256 px / 128 × 96, too detailed to share a
 * sheet). pack.mjs: tools/art-desk/slice.mjs trim → registry.
 */
import { MAGENTA, NAVY, NO_FX } from '../sprite-pack/lib.mjs'

const GAME = '"Tree Smashers", a bright cartoon toy game where cute-but-angry plush creatures battle on spinning discs'
const BADGE = 'a BOSS CREST BADGE: a chunky upright HEXAGON shield (pointy top and bottom), seen straight from the front, perfectly symmetric. A thick berry-red (#f2306b) outer frame with a lighter pink-red top-left bevel and a darker berry shade on its lower-right, six small round ice-white studs at the six corners, and inside it a hexagonal face plate'

/** name → { what, size: [w, h] } */
export const ICONS = {
  'boss-cinder-tyrant': {
    what: `${BADGE} in deep warm orange; on the face plate, the emblem: a big chunky cartoon FLAME (sun-yellow core, orange middle, red-orange outer tongues, three rounded tongues) standing inside a thick sun-yellow ring.`,
    size: [256, 256], file: 'boss-badges'
  },
  'boss-glacier-warden': {
    what: `${BADGE} in royal blue (#2f4fd6); on the face plate, the emblem: a chunky round toy PADLOCK in ice white with a sky-blue shade, its shackle on top, and a big sky-blue six-arm SNOWFLAKE on the padlock body. A row of short rounded ice-blue icicles hangs from the bottom edges of the frame.`,
    size: [256, 256], file: 'boss-badges'
  },
  'boss-frostbite-yeti': {
    what: `${BADGE} in light sky blue; on the face plate, the emblem: the front-facing head of a cute-but-angry cartoon YETI — round shaggy white fur head with a scalloped fur outline, a slate-blue face with two angry sky-blue eyes under heavy white brows, and two short white tusks poking up from its lower jaw.`,
    size: [256, 256], file: 'boss-badges'
  },
  'level-up': {
    what: 'a LEVEL-UP glyph: one big chunky fat UP ARROW (a wide triangle head on a short thick shaft), fresh leaf green (#55c81e) with a lighter lime top-left face and one darker green tone on its lower-right side, a small white highlight on the upper-left of the head. Seen from the front three-quarter view with light from the top-left.',
    size: [256, 256], file: 'stats'
  },
  movie: {
    what: 'a REWARDED-VIDEO glyph: a chunky toy FILM CLAPPERBOARD seen from the front, wider than tall (about 4 : 3). The board is white with a light sky-blue shade on its lower-right; its hinged clapper bar on top is striped in diagonal royal-blue (#2f4fd6) and white stripes, opened slightly; a big sun-yellow (#ffd21a) PLAY TRIANGLE (rounded corners, pointing right) sits in the middle of the white board. It sits on a SKY-BLUE button: so NO green anywhere, and keep it mostly white + royal + sun.',
    size: [128, 96], file: 'icons'
  }
}

export const promptFor = (name) => [
  `Paint ONE game UI icon for ${GAME}.`,
  `The icon: ${ICONS[name].what}`,
  `Style: a bright, chunky, toy-like premium mobile game icon — smooth painted toy plastic surfaces. It must read as a crisp UI ICON at 32–48 px: a bold, even, thick ${NAVY} outline around the whole silhouette and its main parts, flat cel shading with at most three tones per colour, a simple chunky readable silhouette, no tiny details.`,
  'NO stitches, NO stitching lines, NO dashed lines, NO seams, NO felt or fabric texture (stitches belong only to the plush characters, never to UI objects). NO metal, NO chrome, NO gold metal, NO metallic sheen or reflections, NO rivets that look like steel, NO brown or muddy tones, NO dark grey.',
  NO_FX + ' NO frame or button behind the icon.',
  'Composition: a SQUARE image (1:1). The icon is centred and fills about 80% of the image, with an even magenta margin on every side; nothing is cut off.',
  MAGENTA,
  'Generate the image now.'
].join('\n')
