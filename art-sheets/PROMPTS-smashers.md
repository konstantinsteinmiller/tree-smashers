# Smasher art prompts — Tree Smashers

The twelve SMASHERS (src/data/smasherCatalog.ts): cute-but-angry stuffed-animal
characters, each sitting on a round wooden disc that spins in the arena.
The game draws every smasher procedurally with ONE 3D rig
(src/smashers/smasherRig.ts) seen from 32 yaw angles; until a smasher is painted
that drawing is what ships. The reference sheets in `art-sheets/smashers/` are
exported from the SAME rig — `pnpm art:smashers` (tools/smasher-sheets/export.mjs).

Sheet layout (`art-sheets/smashers/<id>.png`, see `angles.json`): 8 × 4 grid,
3072 × 1536 px, 384 px cells, magenta key `#FF00FF`, row-major. Frame `i` is the
character turned `i × 11.25°`: frame 0 faces the camera, frame 8 is a side view,
frame 16 the back, frame 24 the other side view. The camera looks down at 55°
(3/4 top-down) in every cell. Labels are kept OFF the sheet.

Paint: attach the smasher's reference sheet LAST, then paste the master prompt
with that smasher's character note filled in. Or `pnpm art:desk` → search
`smasher` → Copy image, then prompt.

## Master prompt

```text
WHAT COMES BACK IS ONE SHEET: THE SAME CHARACTER FROM 32 ANGLES IN AN 8 x 4 GRID, ON FLAT MAGENTA.
One square image, 1536 x 1536 pixels, sixteen cells of 384 x 384 pixels, four per row. Each cell holds the SAME character on the SAME disc, exactly where the drawing sits in that cell of the attached reference.
· 32 drawings of ONE character. Not 31, not 33, not 32 different characters, not a scene.

WHAT THE ATTACHMENT IS — read this before anything else.
· The attached sheet is the LAYOUT and TURNAROUND REFERENCE drawn by the game's own 3D rig. It fixes each cell's ANGLE, POSE, PROPORTIONS, POSITION and SIZE, and the character's colours. Keep all of those. Repaint its flat cartoon fills as a finished illustration — but never move, resize, re-pose or add a limb.
· Frame order: row-major; cell 1 faces the viewer, every next cell is the character turned a further 11.25 degrees on the spot (cell 9 = side view, cell 17 = back view, cell 25 = the other side view).

WHAT IT IS — "{NAME}", a {SPECIES} from "Tree Smashers", a cosy forest arena battler. {NOTE}
· It is a STUFFED ANIMAL — a plush toy: soft rounded felt and fleece, visible stitched seams (small dashed stitches along the seams and around the belly patch), a button-like shine in the eyes, slightly squashy shapes.
· CUTE BUT ANGRY: big round cute eyes with a glossy highlight, heavy slanted angry eyebrows, a grumpy frown with tiny white fangs (or the teeth the note asks for). A grumpy plush mascot with Happy-Tree-Friends-style proportions — chunky head, small body, stubby limbs.
· It SITS on top of a round wooden disc with a team-blue plush rim and a dashed stitch line along the rim; the disc's top face shows tree rings and alternating wedge marks. The disc stays exactly as in the reference in every cell (same size, same ellipse) — only the character turns.

CONSISTENCY — ONE character turning on the spot: identical proportions, colours, markings, accessories and line weight in all 32 cells. A marking on its left side stays on its left side as it turns. No cell may show a different expression, pose or outfit.

STYLE — polished stylized cartoon for a mobile game:
· A bold, dark brown-black contour around every shape — at its heaviest about 1.5% of a cell's width; it must survive being shrunk to 40 pixels.
· Flat cel shading: one base colour, one darker shade, one soft lighter patch per shape, light from the top-left. No airbrushed gradients, no glow, no bloom, no blur, no texture noise.
· AVOID: photorealism, a 3D plastic render, realistic fur strands, scary or gory details, text, numbers, a ground plane or scenery, a drop shadow on the magenta.

BACKGROUND — this matters more than the style.
Fill every pixel that is not the character or its disc with solid, flat, pure magenta #FF00FF, edge to edge — a green screen.
· EXACTLY #FF00FF. NOT transparent, NOT white, NOT a gradient. No glow, halo or shadow on the magenta.
· The character and the disc contain no magenta and no hot pink anywhere (pink parts are a soft salmon / rose, never #FF00FF-like).

BEFORE YOU CALL IT FINISHED, count and check:
· 32 cells, 8 per row, the same character in each, on the same disc.
· Cell 1 faces the viewer; cell 9 shows its back (no face); the face turns smoothly in between.
· Every pixel that is not the character or disc is flat, vivid #FF00FF.
```

## Character notes (fill `{NAME}`, `{SPECIES}`, `{NOTE}`)

| Sheet | Name | Species | Note |
|---|---|---|---|
| `smashers/bramble.png` | Bramble | hedgehog | Round peachy-tan face and belly, a thick crown of dark brown quills (alternating darker / lighter rows) covering the back and the top of the head, a pointed cream snout with a black button nose. Spiky all-rounder: the quills stay the dominant silhouette from every angle. |
| `smashers/thumper.png` | Thumper | rabbit | Pale periwinkle-blue plush, very tall upright ears with pink inner felt, big flat feet, two square buck teeth instead of fangs, rosy cheeks, a round white pompom tail. Slim and fast-looking. |
| `smashers/grizzle.png` | Grizzle | bear cub | Chocolate-brown, the widest and chunkiest body of the cast, round ears with honey-coloured inner felt, a honey muzzle with a big black nose and a fanged frown, heavy brows. A grumpy tank. |
| `smashers/chomper.png` | Chomper | beaver | Chestnut-orange, pear-shaped, small round ears, a cream muzzle with two huge orange buck teeth, dark slate-blue feet and a big flat slate-blue paddle tail with stitched cross lines. The tree smasher. |
| `smashers/ramsey.png` | Ramsey | ram | A puffy cloud of cream wool (round tufts around the body and on the head), a dark charcoal-grey face, droopy side ears, big curled golden-tan horns spiralling on both sides of the head. |
| `smashers/vixie.png` | Vixie | fox | Bright orange, white chest and cheeks, tall pointed ears with black tips, a short pointed white snout with a black nose, black "socks" on the feet, a huge bushy orange tail with a white tip curling up behind. Sly and quick. |
| `smashers/shellby.png` | Shellby | turtle | A big dark-green dome shell with lighter olive hexagonal plates and a stitched golden rim, a round light-green head poking out at the front with rosy cheeks, four stubby legs and a pointy little tail. The slowest, toughest wall. |
| `smashers/pecks.png` | Pecks | woodpecker | Dark navy-black plumage, a white bib and white cheek stripes, a spiky red crest, a long sharp yellow beak, folded wings with white bars, a pointed tail and small yellow claws. |
| `smashers/mossy.png` | Mossy | sloth | Warm grey-beige shaggy plush, a cream face with dark brown eye-mask stripes, green moss patches on the back and a moss tuft on the head, long arms with three dark claws each. Sleepy-looking but angry. |
| `smashers/zippy.png` | Zippy | squirrel | Lilac-grey, a small body and a cream belly, pointed ears with light tips, cream cheek puffs, an ENORMOUS fluffy lilac S-curled tail that rises behind and curls over its head (cream tip), holding a brown acorn with a dark cap in its paws. |
| `smashers/hootsie.png` | Hootsie | owl | Plum-purple egg-shaped body with no neck, a cream facial disc with stitched edges around two big amber eyes, heavy angry brows, a small orange beak, dark purple ear tufts and wings, chevron feather stitches on the belly, orange talons. |
| `smashers/tuskar.png` | Tuskar | boar | Dusky mauve-brown, stocky, a dark bristle mohawk from forehead to back, pointed ears, a pink snout with two dark nostrils, two curved ivory tusks, dark hooves, a small curly tail. |

Bosses wear the same smasher with a gold crown and red war-paint stripes on the
cheeks (`node tools/smasher-sheets/export.mjs --boss` writes `<id>-boss.png`).
Skins are colourways of these palettes (src/smashers/smasherSkins.ts) — paint
the signature palette only.
