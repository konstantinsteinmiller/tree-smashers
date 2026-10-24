/**
 * Painted UI icons (Options tabs, HUD settings button and the HUD core buttons —
 * smasher upgrade, leaderboard, league, daily login, battle pass, treasure chest)
 * → TEXT-ONLY Gemini prompts.
 *
 *   node tools/ui-icons/prompts.mjs
 *
 * Writes art-sheets/ui-icons/<name>.prompt.txt for every icon in ICONS. Paint
 * them with tools/ui-icons/paint-queue.mjs, pack with tools/ui-icons/pack.mjs.
 * The drawn SVGs they replace stay the fallback: src/components/icons/Icon*.vue,
 * mapped per name in UiIcon.vue.
 *
 * HUD family (upgrade … chest): one set — front three-quarter view, light from
 * the top-left, 2–3 flat tones per colour, bold navy outline; each must read at
 * 32–48 px on its button plate (royal for upgrade / leaderboard / league / pass,
 * leaf for daily, no plate for the chest).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GAME = '"Tree Smashers", a cosy cartoon game where cute-but-angry stuffed-animal fighters battle on spinning wooden discs'

/** name → the object to paint (one sentence or two). */
export const ICONS = {
  settings: 'a chunky SETTINGS COG: one round gear wheel with eight short, blunt, rounded teeth and a round hole in the middle, in smooth sky-blue painted toy plastic with a darker blue shade on its lower-right side and a white ring around the hole.',
  difficulty: 'a DIFFICULTY GAUGE: a half-round dial standing on a small light-blue wooden base plate, the dial split into three equal smooth painted wedges — fresh green on the left, sunny yellow at the top, raspberry red on the right — with a dark navy pointer needle leaning into the red wedge and a white button hub at its pivot.',
  sound: 'a SOUND SPEAKER: a small chunky loudspeaker seen from the side, a white cone with a royal-blue box at its back, and two curved light sky-blue sound-wave arcs coming out of the cone, each arc outlined in dark navy.',
  // ─── HUD core buttons (front 3/4, light top-left) ───────────────────────────
  upgrade: 'a SMASHER UPGRADE badge, seen from the front three-quarter view with light from the top-left: a thick round spinning top-disc (like a chunky toy spinning plate) lying slightly tilted toward the viewer, its top face sky blue with a big white PAW PRINT (one round pad and four round toe beans) in the middle, its thick side rim royal blue; rising out of the upper-right of the disc, a big chunky leaf-green UP ARROW with a lighter green top face, overlapping the disc rim. The paw and the arrow are the two things that must read.',
  leaderboard: 'a LEADERBOARD TROPHY CUP, seen from the front three-quarter view with light from the top-left: a chunky round-bellied toy trophy cup with two big loop handles, painted in flat sunny yellow toy plastic (a lighter yellow on its upper-left, a warm orange-yellow shade on its lower-right — painted plastic, NOT shiny metal, NO reflections), a big white five-point star on the front of the cup, standing on a short stem and a chunky royal-blue block base with a lighter blue top face.',
  league: 'a LEAGUE SHIELD emblem, seen from the front three-quarter view with light from the top-left: a chunky heater-shaped shield with a thick sky-blue rim and a royal-blue face, a big sun-yellow five-point star in the middle of the face, a small white wing sprouting from each side of the shield (three rounded feathers each), and a small sun-yellow three-point crown sitting on top of the shield. Painted toy look, NOT metal.',
  daily: 'a DAILY GIFT BOX, seen from the front three-quarter view with light from the top-left: a chunky cube gift box in raspberry red (lighter red top face, darker red right side), a wide sun-yellow ribbon crossing the box and the lid both ways, the lid slightly wider than the box, and a big sun-yellow bow on top made of two round loops with holes in them. It will sit on a GREEN button, so keep green out of it.',
  battlepass: 'a BATTLE PASS TICKET, seen from the front three-quarter view with light from the top-left: one chunky rectangular admission ticket tilted about 15 degrees, sun yellow (lighter yellow face, orange-yellow thick edge showing its thickness), a half-round notch cut into the middle of each short side, one SOLID unbroken navy line across the right end marking off a slightly darker-yellow stub (NO dashes, NO dotted or perforated line, NO stitches), and a big white five-point star with a raspberry-red centre dot on the left part of the ticket.',
  chest: 'a TREASURE CHEST toy, seen from the front three-quarter view with light from the top-left: a chunky closed toy chest with a rounded domed lid; the body and lid planks are bright light honey-orange painted wood (clean warm orange, NOT dark brown, NOT muddy), with two sky-blue painted bands running over the lid and down the front and sky-blue corner caps (painted toy plastic, NOT metal, NO rivets), and a round sun-yellow lock plate with a navy keyhole in the middle of the front. A slightly lighter top face on the lid. NO coins or jewels spilling out.',
  pvp: 'a PLAYER-VS-PLAYER CLASH, seen from the front three-quarter view with light from the top-left: two chunky toy spinning top-discs (like thick spinning plates) tilted toward each other and colliding in the middle — the LEFT disc royal/sky blue (sky-blue top face, royal-blue thick rim), the RIGHT disc raspberry red (lighter red top face, darker red thick rim) — with a big chunky sun-yellow eight-point SPARK BURST (blunt rounded star rays, a white centre) bursting out where their rims meet, slightly in front of both discs. Blue-vs-red and the clash spark are the two things that must read. NO swords, NO weapons, NO characters. It will sit on a PURPLE button, so keep purple out of it.',
  fight: 'a tiny FIGHT glyph for a small green button (it shows at only 14–20 px, so it must be VERY bold and simple, few big shapes): seen from the front three-quarter view with light from the top-left, two short chunky white toy baseball bats crossed in an X (smooth painted toy wood, white with a light sky-blue shade on their lower-right sides, thick rounded ends), with one big chunky sun-yellow five-point IMPACT STAR (blunt rounded points) on top of the crossing point. Thick navy outlines everywhere. It will sit on a GREEN button, so keep green out of it. NO swords, NO blades, NO metal.',
  // ─── Stat icons (battle stat cards, team modal, power-up box plates) ─────────
  'stat-hp': 'a tiny HEALTH glyph. It shows at only 14–24 px beside a number in the battle stat cards, so it must be VERY bold and simple: ONE big chunky silhouette, few big shapes, extra-thick navy outline, no thin parts, no small details. Seen from the front three-quarter view with light from the top-left: one plump rounded toy HEART, fresh leaf green (a lighter green upper-left face, one darker green tone on its lower-right side, a small white highlight spot on the upper-left lobe). Painted toy plastic. NOT red, NOT pink.',
  'stat-atk': 'a tiny ATTACK glyph. It shows at only 14–24 px beside a number in the battle stat cards, so it must be VERY bold and simple: ONE big chunky silhouette, few big shapes, extra-thick navy outline, no thin parts, no small details. Seen from the front three-quarter view with light from the top-left: one short, very chunky cartoon toy SWORD pointing up-right at 45 degrees — a wide blunt-tipped raspberry-red blade (lighter red upper-left half, darker red lower-right half), a thick sun-yellow crossguard and a short round raspberry pommel. Painted toy plastic/wood, NOT metal, NO steel, NO shine.',
  'stat-def': 'a tiny DEFENSE glyph. It shows at only 14–24 px beside a number in the battle stat cards, so it must be VERY bold and simple: ONE big chunky silhouette, few big shapes, extra-thick navy outline, no thin parts, no small details. Seen from the front three-quarter view with light from the top-left: one chunky rounded heater-shaped toy SHIELD, royal blue face with a thick sky-blue rim (lighter on the upper-left, one darker tone on the lower-right) and a single big white plus/cross shape in the middle. Painted toy plastic, NOT metal, NO rivets, NO star, NO wings.',
  'stat-spd': 'a tiny SPEED glyph. It shows at only 14–24 px beside a number in the battle stat cards, so it must be VERY bold and simple: ONE big chunky silhouette, few big shapes, extra-thick navy outline, no thin parts, no small details. Seen from the front three-quarter view with light from the top-left: one fat chunky zig-zag LIGHTNING BOLT leaning right, bright cyan / sky blue (a lighter cyan upper-left face, one darker cyan tone on its lower-right edge). NO speed lines, NO extra marks around it — just the one fat bolt.',
  'stat-weight': 'a tiny WEIGHT glyph. It shows at only 14–24 px beside a number in the battle stat cards, so it must be VERY bold and simple: ONE big chunky silhouette, few big shapes, extra-thick navy outline, no thin parts, no small details. Seen from the front three-quarter view with light from the top-left: one short chunky toy DUMBBELL lying horizontally — a thick short bar with one big round fat plate on each end, the plates medium slate grey-blue painted toy plastic (a lighter grey-blue face, one darker slate rim), the bar a lighter grey. Painted toy plastic, NOT metal, NO chrome, NO grey steel.'
}

/** The stat icon family (StatIcon.vue, the power-up box stamp). */
export const STAT_ICONS = ['stat-hp', 'stat-atk', 'stat-def', 'stat-spd', 'stat-weight']

/** The HUD core buttons (painted first — the PRIORITY batch, `--only` these). */
export const HUD_ICONS = ['upgrade', 'leaderboard', 'league', 'daily', 'battlepass', 'chest', 'pvp', 'fight']

export const promptFor = (name) => [
  `Paint ONE game UI icon for ${GAME}.`,
  `The icon: ${ICONS[name]}`,
  'Style: a bright, chunky, toy-like game icon — smooth painted surfaces like a well-made wooden/plastic toy. NO stitches, NO seams, NO felt or fabric texture (stitches belong only to the plush characters, not to UI objects). It must still read as a crisp UI ICON at 32 px: a bold, even, dark navy (#161a40) outline around the whole silhouette and its main parts, flat cel shading with at most two tones per colour, a simple chunky readable silhouette, no tiny details.',
  (HUD_ICONS.includes(name) || STAT_ICONS.includes(name))
    ? 'Colours: clean bright royal blue, sky blue, white, leaf green, sun yellow, orange and raspberry red only where named. NO brown or muddy tones, NO dark colours except the navy outline, NO metallic gold, NO chrome, NO metal sheen or reflections — every surface is flat painted toy plastic or painted wood.'
    : 'Colours: clean bright royal blue, sky blue, white, leaf green, sun yellow and raspberry red only where named. NO brown or muddy tones, NO gold, NO metal, NO yellow-gold cast.',
  'NO glow, NO blur, NO soft drop shadow, NO radial gradients, NO lens effects, NO text, NO letters, NO numbers, NO frame or button behind the icon.',
  `Composition: a SQUARE 1:1 image. The icon is centred, upright, ${(HUD_ICONS.includes(name) || STAT_ICONS.includes(name)) ? 'in the front three-quarter view described above, lit from the top-left (its upper-left faces lighter, its lower-right faces one tone darker)' : 'seen straight-on'}, filling about 80% of the image with an even margin on every side.`,
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the icon — no gradient, no texture, no shadow on it, no magenta anywhere inside the icon. It will be keyed to transparency.',
  'Generate the image now.'
].join('\n')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = join(ROOT, 'art-sheets', 'ui-icons')
  mkdirSync(dir, { recursive: true })
  for (const name of Object.keys(ICONS)) {
    const p = join(dir, `${name}.prompt.txt`)
    writeFileSync(p, promptFor(name) + '\n')
    console.log(p)
  }
}
