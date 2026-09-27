# New skins — 24 designs (4 per top-part class)

Regular skins: `SKIN_COST` (300 coins), **not** in `SPECIAL_SKINS`, no VFX. They get
appended to the END of each class list in `SKINS_PER_TOP` and to the end of
`SPINNER_MODEL_IDS`. That is append-only, so no existing offer or default changes.
Art: `public/images/models/<id>_256x256.webp`, painted from the reference sheets
and prompts in `art/skins/`.

## House style (what every existing skin shares)

Top-down (straight overhead, no perspective) Beyblade-style spinning top, painted
game art with a bold dark ink contour, cel shading and a crisp specular glint.
From the centre out:

1. **Hex medallion**: a small hexagonal badge holding one simple icon of the subject.
2. **Inner ring(s)**: one or two concentric bands in the skin's darker tones.
3. **Themed rim**: the subject's outline. This part tells the classes apart.

The in-game renderer clips each image to the inscribed circle and spins it. The
art fills that circle edge to edge, and nothing important sits in the square's
corners.

## Class roles (from `TOP_PARTS` in `src/use/useSpinnerConfig.ts` + combat code)

| class     | label        | dmg     | def     | hp      | mechanic                                                           | role                                   | silhouette                                  |
|-----------|--------------|---------|---------|---------|--------------------------------------------------------------------|----------------------------------------|---------------------------------------------|
| star      | Star Blade   | **1.8** | 0.8     | +0      | 8% crit when faster than the target; ignores 25% of excess defence | fastest glass cannon, crit striker     | 4–6 swept blade arms (pinwheel / shuriken)  |
| triangle  | Spiky        | 1.1     | 0.95    | +5      | flat chip damage on **every** collision (barbs)                    | attrition, "touch me and bleed"        | disc ringed by many short barbs/spines      |
| round     | Round Guard  | 0.8     | **1.5** | +15     | none                                                               | defensive bruiser that shrugs off hits | smooth, closed circle, nothing sticking out |
| quadratic | Quad Core    | 1.0     | 1.0     | +10     | none                                                               | perfectly balanced all-rounder         | four-fold: rounded square / four lobes      |
| cushioned | Soft Shell   | 0.6     | **1.8** | **+20** | none                                                               | the tank                               | circle with a thick, chunky, padded rim     |
| piercer   | Tank Piercer | **1.7** | 0.8     | +0      | ignores 75% of the target's excess defence                         | armour-breaking glass cannon           | disc with 3–4 long piercing points          |

## Themes ruled out (already taken by an existing skin)

fire, phoenix, thunder/lightning, dragons (blue/red/forest), turtle/shell, ice,
chip/circuit, mystic eye, nature/tree, wolf (wulf, wolf-demon), castle,
eagle/hawk/birds of prey, prisma/crystal/diamond, scorpion, snake/hydra, tornado,
angelic/wings, galaxy/space/teleporter, gear, mountain/boulder/rock, shield, ape,
axe, bear, blades, chain, demon, piranha, rainbow, rhino, salamander, sandstorm,
thunderstorm, tsunami/trident, wasp.

---

## Star: speed and slash (glass cannon, crits)

| id        | name    | concept                                                                                                                                                                                                              | why it fits                                                                                                                                                            |
|-----------|---------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `cheetah` | Cheetah | Six swept sprint-claw blades in warm amber-orange with cream undersides and dark-brown rosette spots, black "tear-line" stripes running along each blade. Medallion: a cheetah face with its black tear marks.       | Fastest land hunter. A sprint and one decisive strike is the Star's burst-and-crit identity. Amber and cream with rosettes stays clear of Wasp's yellow-black stripes. |
| `jester`  | Jester  | Four floppy jester-hat points curling out as blades, each tipped with a small silver bell, in a royal-purple and gold harlequin-diamond pattern. Medallion: a jester's cap.                                          | The trickster whose lucky hits land big: the Star's random 8% crit as a character. Star has no purple skin yet.                                                        |
| `ninja`   | Ninja   | A four-point steel shuriken with its blades bound in midnight-indigo cloth wraps and white stitching; a knotted cloth band runs round the inner ring. Medallion: a masked ninja's eye slit.                          | Strike first, strike fast, never get hit back: a glass cannon. Indigo and steel sit apart from Blades' red and silver.                                                 |
| `pirate`  | Pirate  | Four curved cutlasses sweeping out in a pinwheel, brass hand-guards at the ring, over weathered sea-teal planking with brass nail-heads and a rope ring. Medallion: a tricorn hat over crossed cutlasses (no skull). | A reckless swashbuckler: all attack, no armour. Sea-teal and brass is a new palette for Star.                                                                          |

## Triangle: barbs that chip on every touch

| id            | name         | concept                                                                                                                                                                                           | why it fits                                                                                                                   |
|---------------|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `porcupine`   | Porcupine    | A dense ring of long cream quills with black bands and tips bristling from a warm chocolate-brown fur body. Medallion: a porcupine face under a quill crest.                                      | Its quills stick into anything that touches it: the Spiky chip on every collision, told literally.                            |
| `lionfish`    | Lionfish     | Sixteen venomous fin spines radiating evenly all round, striped rust-maroon and cream, with salmon fin membranes between them, around a glossy deep sea-teal disc. Medallion: a lionfish head.    | Venom in every spine: brushing past it hurts. Cream stripes on teal read nothing like Salamander's flames.                    |
| `morningstar` | Morning Star | A ring of heavy conical iron spikes around a gunmetal body, riveted brass bands and a dark leather-wrapped inner ring. Medallion: a spiked flail head.                                            | A medieval spiked ball: every glancing blow draws blood. Gunmetal and brass are new to Triangle.                              |
| `cactus`      | Cactus       | Ribbed dusty sage-green lobes, each crowned with a cluster of cream-white spines, and a few small orange-yellow blossoms between them. The inner ring is terracotta. Medallion: a saguaro cactus. | You cannot hug a cactus without paying for it. That is the Spiky attrition game. Sage with terracotta is not Snake's emerald. |

## Round: the smooth, closed guard

| id          | name      | concept                                                                                                                                                                              | why it fits                                                                                                                |
|-------------|-----------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `kraken`    | Kraken    | Deep-teal tentacles coiled in a closed ring round the disc, their cream suckers facing out, over an abyssal-navy inner ring. Medallion: a small octopus head with curled arms.       | It wraps up and holds. The ring of coiled arms is a closed guard, and the silhouette stays a clean circle.                 |
| `taiko`     | Taiko     | A cream rawhide drumhead laced to a black-lacquer body, with rows of brass tacks and a braided white rope ring around the rim. Medallion: a gold three-comma tomoe on black.         | A drumhead is built to take blows and ring out. Round Guard's high defence as an object.                                   |
| `toadstool` | Toadstool | A glossy crimson domed mushroom cap with raised cream-white spots, its rim rolled under and pale gills peeking at the edge. Medallion: a little red spotted mushroom.                | A springy, rubbery dome that hits simply bounce off. Round Guard has no red skin yet.                                      |
| `full-moon` | Full Moon | A pale silver-grey moon surface covered in craters, ringed by deep midnight-blue with the moon's phases (pale-gold crescents to full) marching round it. Medallion: a crescent moon. | Every crater is a hit it survived. The toughest round thing in the sky. A single cratered moon, not a galaxy or starfield. |

## Quadratic: balanced, four-fold

| id          | name      | concept                                                                                                                                                                                                         | why it fits                                                                                                                |
|-------------|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `monarch`   | Monarch   | Four monarch-butterfly wing lobes in an X, bright orange with black veins and white-dotted black borders, around a black-and-orange striped core: a four-lobed square outline. Medallion: a butterfly.          | "Float like a butterfly, sting like a bee": equal parts attack and defence. Four wings give the four-fold Quad silhouette. |
| `pyramid`   | Pyramid   | A sandstone pyramid seen from straight above: four identical block-built faces meeting at a gold capstone, with lapis-blue and gold bands framing the square base. Medallion: a small pyramid under a sun disc. | The most stable shape ever built: a square base that is balanced on every side.                                            |
| `compass`   | Compass   | A brass diamond frame whose four points (N/E/S/W) make the four-fold outline, with cream insets and a navy degree-ticked dial. Medallion: a compass needle.                                                     | Four equal points in perfect balance: the Quad Core all-rounder.                                                           |
| `checkmate` | Checkmate | A square frame of alternating ivory and ebony checker tiles with rounded, gold-capped corners. Medallion: a chess knight's head.                                                                                | Chess is balance and strategy, each side the same strength. Ivory and ebony are new to Quadratic.                          |

## Cushioned: heavy, armoured, durable

| id           | name       | concept                                                                                                                                                                          | why it fits                                                                                                                                 |
|--------------|------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| `armadillo`  | Armadillo  | A curled armadillo shell: thick concentric armour bands of small rounded scale plates in warm ochre and sandy tan, complete all the way round. Medallion: a curled-up armadillo. | Nature's rolling tank: plates over plates. The thick banded rim reads as armour at a glance.                                                |
| `anvil`      | Anvil      | A hammered black-iron rim girded with heavy copper bands and big rivets, around a polished steel face with a hammer-worn sheen. Medallion: an anvil with a hammer.               | Built to take a hammer blow a thousand times: the most durable object in the forge. Copper bands and polished steel set it apart from Gear. |
| `mammoth`    | Mammoth    | A thick shaggy rim of auburn woolly fur, with two ivory tusks curving round inside it (they never stick out), over a heavy leathery hide ring. Medallion: a mammoth head.        | Padded with a metre of wool and built like a wall: the "Soft Shell" cushion made heavy.                                                     |
| `deep-diver` | Deep Diver | A heavy riveted brass-and-copper diving-helmet rim with round teal-glass portholes and big hex bolts, and a thick rubber gasket ring. Medallion: a diving helmet.                | Built to survive crushing depths: riveted, bolted, pressure-proof. Brass and teal are new to Cushioned.                                     |

## Piercer: soft body, one weapon that goes through armour

| id            | name        | concept                                                                                                                                                                                | why it fits                                                                                        |
|---------------|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `narwhal`     | Narwhal     | Four long spiral ivory tusks radiating from a sleek slate-blue whale-skin disc with pale arctic-blue speckles. Medallion: a narwhal.                                                   | A soft whale with a spear built to punch through ice. Exactly a glass cannon that pierces armour.  |
| `stag-beetle` | Stag Beetle | Two pairs of huge antler-like mandibles (glossy mahogany) jutting out on opposite sides as the piercing points, from a polished bronze-green carapace disc. Medallion: a stag beetle.  | Almost all weapon: the mandibles crack other beetles' armour.                                      |
| `drill`       | Drill       | Four spiral tungsten-steel drill bits radiating from a construction-orange housing with black grip bands and bolted steel plates. Medallion: a drill bit.                              | A drill is made to bore through hard plate: armour piercing as a machine.                          |
| `lancer`      | Lancer      | Four long jousting lances radiating, with steel tips and royal-blue and white spiral-striped shafts, small pennants at the vamplates and a silver ring. Medallion: two crossed lances. | A jousting lance exists to punch through plate armour, and a knight at full gallop is all offence. |

## Palette check against existing skins of the same class

- **star**: blades/axe (red + silver), reddragon (red + gold), chain (dark grey + red), ice (pale cyan), wasp (yellow +
  black), tornado (blue + gold). New: amber/cream, purple/gold, indigo/steel, sea-teal/brass.
- **triangle**: thunder/thunderstorm (purple), snake (emerald), phoenix (gold), eagle (silver-blue), spiky-eagle (red +
  black), salamaner (fire orange). New: brown/cream, maroon-cream/teal, gunmetal/brass, sage/terracotta.
- **round**: nature/turtle (green), piranha (orange), bear (brown), galaxy/dark (purple), golden-eagle (gold),
  wolf-demon (charcoal). New: teal/navy, cream/black, crimson/cream, silver/midnight blue.
- **quadratic**: chip (grey + lime), mysticaleye (purple), bluedragon/tsunami (blue), angelic (gold + white),
  prisma/rainbow (multicolour), forest-dragon (green). New: orange/black, sandstone/lapis, brass/navy, ivory/ebony.
- **cushioned**: shell (olive), shield (blue), castle/mountain/gear (grey), sandstorm (tan), diamond (ice blue),
  boulder (red-brown). New: ochre scale bands, black iron/copper, auburn fur/ivory, brass/teal.
- **piercer**: scorpion/wulf/demon/ape (red), hawk (gold + cyan), rhino (purple-grey), teleporter (cosmic). New:
  slate-blue/ivory, mahogany/bronze-green, orange/steel, royal blue/white.

## Art notes

- Every skin is even-fold symmetric (2, 4 or 6 arms/points), so the centre of its bounding box is the spin axis.
- `art/skins/fit-skins.mjs` fits each skin so its farthest solid pixel sits on the in-game clip circle (the renderer
  clips to the inscribed circle). Narwhal, Drill and Lancer use `--box`: their thin points run diagonally into the
  square's corners, and the game's clip trims the tips, the same way it does for the shipped Spiky Eagle. A circle fit
  would shrink their bodies to half size.
- Re-paints skip the grey layout sheet (`prompt-<id>-free.txt`). Where a subject doesn't fill the grey silhouette,
  Gemini keeps the grey as a backing plate.

## Gating

Ids enter `SPINNER_MODEL_IDS` / `SKINS_PER_TOP` only once their WebP exists. The
test `tests/skinCatalog.newSkins.test.ts` fails if any catalog id has no image
file, so a missing image cannot ship.
