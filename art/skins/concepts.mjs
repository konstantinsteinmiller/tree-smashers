/**
 * The 24 new regular skins — ONE source for the reference sheets
 * (build-refs.mjs) and the master prompts (build-prompts.mjs). Design notes and
 * the reasoning per skin live in /skins-new-designs.md.
 *
 * Every template is EVEN-fold symmetric (2, 4, 6 … arms/points). The slicer
 * centres each skin on its bounding box, and for an even-fold shape the
 * bounding-box centre IS the spin axis — an odd count (3 tusks, 5 blades)
 * would wobble in game.
 *
 * `tpl` drives the grey silhouette drawn in the reference (notation only).
 * `subject` is the WHAT IT IS sentence, `colour` the palette identity,
 * `medallion` the icon in the hex badge. Every noun is a thing the painter
 * will draw — no metaphors.
 */

export const CLASSES = {
  star: {
    label: 'Star Blade',
    styleRefs: ['blades', 'wasp'],
    silhouette:
      'STAR BLADE: a round core disc with long SWEPT BLADE ARMS curving out to the edge like a pinwheel or a shuriken. ' +
      'The arms are the outline; magenta shows between them. The arms all sweep the same way round.',
    skins: [
      {
        id: 'cheetah', name: 'Cheetah',
        tpl: { kind: 'pinwheel', arms: 6, sweep: 0.5, core: 0.66 },
        subject: 'a cheetah-themed spinning top: SIX swept sprint-claw blades, each blade spotted with dark-brown rosettes and carrying one black stripe along its inner edge',
        colour: 'warm amber-orange blades with cream-white undersides and dark-brown rosette spots; inner rings in deep chocolate brown and amber',
        medallion: 'a cheetah face with the two black tear-line marks running from its eyes'
      },
      {
        id: 'jester', name: 'Jester',
        tpl: { kind: 'pinwheel', arms: 4, sweep: 0.85, core: 0.64, curl: true },
        subject: 'a jester-themed spinning top: FOUR long floppy jester-hat points curling out as blades, each point tipped with a small round silver bell, the points patterned in harlequin diamonds',
        colour: 'royal purple and warm gold harlequin diamonds, silver bells, a dark plum inner ring with gold trim',
        medallion: 'a small three-pointed jester cap with bells'
      },
      {
        id: 'ninja', name: 'Ninja',
        tpl: { kind: 'pinwheel', arms: 4, sweep: 0.35, core: 0.62, sharp: true },
        subject: 'a ninja-themed spinning top: a FOUR-point steel shuriken whose blades are partly bound in cloth wraps with white stitching, and a knotted cloth band running round the inner ring',
        colour: 'polished blue-steel blades, midnight-indigo cloth wraps, white stitching, charcoal inner ring',
        medallion: 'a masked ninja face: an indigo hood with one narrow eye slit'
      },
      {
        id: 'pirate', name: 'Pirate',
        tpl: { kind: 'pinwheel', arms: 4, sweep: 0.65, core: 0.66 },
        subject: 'a pirate-themed spinning top: FOUR curved cutlass blades sweeping out in a pinwheel, each with a brass hand-guard where it meets the ring, over a body of weathered wooden planks with brass nail-heads and a coiled rope ring',
        colour: 'bright steel cutlass blades, weathered sea-teal planks, polished brass, tan rope',
        medallion: 'a black tricorn hat over two crossed cutlasses (no skull)'
      }
    ]
  },

  triangle: {
    label: 'Spiky',
    styleRefs: ['thunder', 'salamaner'],
    silhouette:
      'SPIKY: a round body ringed ALL the way round by many barbs, spines or spikes that point straight outwards, like a burr or a saw. ' +
      'The barbs are the outline; there is no smooth stretch of rim anywhere.',
    skins: [
      {
        id: 'porcupine', name: 'Porcupine',
        tpl: { kind: 'barbs', n: 32, inner: 0.76, width: 0.6, style: 'needle' },
        subject: 'a porcupine-themed spinning top: a dense ring of long, thin quills bristling outwards all round a body of short fur, every quill banded and tipped with black',
        colour: 'cream-white quills with black bands and black tips, warm chocolate-brown fur body, a darker brown inner ring',
        medallion: 'a porcupine face under a small crest of quills'
      },
      {
        id: 'lionfish', name: 'Lionfish',
        tpl: { kind: 'barbs', n: 16, inner: 0.74, width: 0.5, style: 'fin' },
        subject: 'a lionfish-themed spinning top: sixteen long venomous fin spines radiating evenly ALL the way round the round disc, every spine the same length on every side (bottom as well as top), with thin fin membranes stretched between neighbouring spines — a full ring of spines, NOT a fish seen from the side',
        colour: 'fin spines striped rust-maroon and cream-white, membranes a paler salmon-cream, a deep sea-teal inner ring',
        medallion: 'a lionfish head with its striped spines'
      },
      {
        id: 'morningstar', name: 'Morning Star',
        tpl: { kind: 'barbs', n: 12, inner: 0.8, width: 0.8, style: 'cone' },
        subject: 'a morning-star-themed spinning top: a ring of heavy conical iron spikes all round a riveted iron body, brass bands between the spikes, and a leather-wrapped inner ring',
        colour: 'dark gunmetal iron with bright steel spike tips, polished brass bands and rivets, dark brown leather',
        medallion: 'a spiked iron flail head'
      },
      {
        id: 'cactus', name: 'Cactus',
        tpl: { kind: 'barbs', n: 12, inner: 0.8, width: 0.95, style: 'lobe' },
        subject: 'a cactus-themed spinning top: ribbed rounded cactus lobes all round the rim, each lobe crowned with a cluster of sharp spines pointing outwards, and a few small blossoms tucked between the lobes',
        colour: 'dusty sage-green lobes, cream-white spines, small orange-yellow blossoms, a terracotta clay inner ring',
        medallion: 'a saguaro cactus'
      }
    ]
  },

  round: {
    label: 'Round Guard',
    styleRefs: ['nature', 'golden-eagle'],
    silhouette:
      'ROUND GUARD: a perfectly smooth, closed CIRCLE. Nothing sticks out of it anywhere — no spikes, horns, ears, blades, tentacle tips or points break the round edge.',
    skins: [
      {
        id: 'kraken', name: 'Kraken',
        tpl: { kind: 'disc', rings: [0.58] },
        subject: 'a kraken-themed spinning top: thick tentacles coiled flat round the disc to form a closed ring, their rows of suckers facing outwards, every tentacle tip tucked inside the circle',
        colour: 'deep teal and sea-green tentacles, cream suckers, an abyssal navy-blue inner ring',
        medallion: 'a small octopus head with curled arms'
      },
      {
        id: 'taiko', name: 'Taiko',
        tpl: { kind: 'disc', rings: [0.5, 0.78] },
        subject: 'a taiko-drum-themed spinning top: a stretched rawhide drumhead in the middle, laced to a lacquered drum body with rows of round brass tacks, and a braided rope ring round the rim',
        colour: 'warm cream rawhide, glossy black lacquer, bright brass tacks, white braided rope',
        medallion: 'a gold three-comma tomoe swirl on black'
      },
      {
        id: 'toadstool', name: 'Toadstool',
        tpl: { kind: 'disc', rings: [0.5] },
        subject: 'a toadstool-themed spinning top: a glossy domed mushroom cap covered in raised round spots, its rim rolled under so a thin band of pale gills shows at the very edge',
        colour: 'glossy crimson-red cap, cream-white spots, pale beige gills, a warm tan inner ring',
        medallion: 'a little red mushroom with white spots'
      },
      {
        id: 'full-moon', name: 'Full Moon',
        tpl: { kind: 'disc', rings: [0.62] },
        subject: 'a full-moon-themed spinning top: a cratered moon surface filling the middle, ringed by a band on which the eight phases of the moon (crescent to full to crescent) march round in a circle',
        colour: 'pale silver-grey moon rock with darker grey craters, a deep midnight-blue phase ring, pale-gold moon phases',
        medallion: 'a pale-gold crescent moon'
      }
    ]
  },

  quadratic: {
    label: 'Quad Core',
    styleRefs: ['bluedragon', 'chip'],
    silhouette:
      'QUAD CORE: FOUR-FOLD — a rounded square, or four equal lobes or corners, so it looks exactly the same after a quarter turn. ' +
      'Four matching corners, not a plain circle.',
    skins: [
      {
        id: 'monarch', name: 'Monarch',
        tpl: { kind: 'xlobes' },
        subject: 'a monarch-butterfly-themed spinning top: FOUR large butterfly wings spread in an X around a round core — the four wings THEMSELVES make the whole outline, reaching out to the four diagonal corners, with nothing behind them — their black veins and white-dotted black borders clearly painted',
        colour: 'bright orange wings, black veins, black wing borders with white dots, a black-and-orange inner ring',
        medallion: 'a small monarch butterfly'
      },
      {
        id: 'pyramid', name: 'Pyramid',
        tpl: { kind: 'squircle', a: 0.72, p: 7, diag: true },
        subject: 'a pyramid-themed spinning top: a sandstone pyramid seen from straight above — four IDENTICAL triangular faces of stacked stone blocks meeting at a small gold capstone in the middle (no door, no entrance, no stairs: all four faces exactly alike) — its own square base, trimmed with lapis-blue and gold bands, is the outline',
        colour: 'warm sandstone with shaded steps, a polished gold capstone, lapis-blue and gold trim bands',
        medallion: 'a small pyramid under a gold sun disc'
      },
      {
        id: 'compass', name: 'Compass',
        tpl: { kind: 'squircle', a: 0.99, p: 1.2, points: true },
        subject: 'a compass-themed spinning top: a round brass compass dial with engraved degree ticks, and a big four-pointed compass rose laid over it whose long north, east, south and west points reach right out to the four tips of the diamond outline — the brass points ARE the outline, with only magenta between them',
        colour: 'polished brass, deep navy-blue enamel, cream inset panels, dark bronze engraving',
        medallion: 'a compass needle, one half navy and one half cream (no letters)'
      },
      {
        id: 'checkmate', name: 'Checkmate',
        tpl: { kind: 'squircle', a: 0.8, p: 4, checker: true },
        subject: 'a chess-themed spinning top: a rounded-square frame of alternating ivory and ebony checker tiles, with a gold cap on each of the four rounded corners',
        colour: 'polished ivory and glossy ebony tiles, gold corner caps, a deep wine-red velvet inner ring',
        medallion: 'a chess knight\'s head in ivory on ebony'
      }
    ]
  },

  cushioned: {
    label: 'Soft Shell',
    styleRefs: ['castle', 'mountain'],
    silhouette:
      'SOFT SHELL: a circle with a THICK, HEAVY rim — about 40% of the radius — built from big rounded, padded or plated segments. ' +
      'The edge may be chunky and lumpy, but it is closed and blunt: no spikes, no points, nothing thin.',
    skins: [
      {
        id: 'armadillo', name: 'Armadillo',
        tpl: { kind: 'pads', n: 14, style: 'plates' },
        subject: 'an armadillo-themed spinning top: a curled-up armadillo shell seen from above — a thick rim of CONCENTRIC armour bands running round the disc like the growth rings of a tree, each band tiled with small rounded scale plates (never big square blocks or bricks), the bands complete all the way round with no gap',
        colour: 'warm ochre and sandy-tan bands with dark umber seams between the small scales, a crisp cream highlight on each scale, a leathery dark-brown inner ring',
        medallion: 'an armadillo curled into a ball'
      },
      {
        id: 'anvil', name: 'Anvil',
        tpl: { kind: 'pads', n: 8, style: 'blocks' },
        subject: 'an anvil-themed spinning top: a massive hammered-iron rim girded by heavy copper bands with big round rivets, around a polished steel face with hammer-worn marks',
        colour: 'hammered black iron, warm copper bands and rivets, a bright polished steel face',
        medallion: 'an anvil with a smith\'s hammer resting on it'
      },
      {
        id: 'mammoth', name: 'Mammoth',
        tpl: { kind: 'pads', n: 18, style: 'fur' },
        subject: 'a mammoth-themed spinning top: a thick shaggy rim of long woolly fur, with two ivory tusks curving round INSIDE the rim (they never stick out past the edge), over a ring of heavy leathery hide',
        colour: 'auburn and rust-brown wool, ivory tusks, dark grey-brown hide',
        medallion: 'a mammoth head with curled tusks'
      },
      {
        id: 'deep-diver', name: 'Deep Diver',
        tpl: { kind: 'pads', n: 6, style: 'ports' },
        subject: 'a deep-sea-diving-helmet-themed spinning top: a heavy riveted metal rim with six round glass portholes and big hex bolts between them, and a thick rubber gasket ring inside',
        colour: 'burnished brass and copper, teal-green porthole glass with a white glint, black rubber gasket',
        medallion: 'an old brass diving helmet with a round window'
      }
    ]
  },

  piercer: {
    label: 'Tank Piercer',
    styleRefs: ['rhino', 'wulf'],
    silhouette:
      'TANK PIERCER: a round core disc (about three quarters of the full width) with a few LONG, SHARP piercing points reaching out past it to the edge; magenta shows between the points. ' +
      'The points are the whole idea — long, narrow and needle-sharp.',
    skins: [
      {
        id: 'narwhal', name: 'Narwhal',
        tpl: { kind: 'spikes', n: 4, core: 0.72, base: 0.08, style: 'tusk' },
        subject: 'a narwhal-themed spinning top: FOUR long spiral tusks radiating from a sleek whale-skin disc, each tusk twisted in a clear spiral groove',
        colour: 'ivory tusks, slate-blue whale skin with pale arctic-blue speckles, a darker navy inner ring',
        medallion: 'a small narwhal with its tusk'
      },
      {
        id: 'stag-beetle', name: 'Stag Beetle',
        tpl: { kind: 'spikes', n: 2, core: 0.7, style: 'mandibles' },
        subject: 'a stag-beetle-themed spinning top: TWO pairs of huge antler-like mandibles jutting out on opposite sides as the piercing points, each mandible with a small inner tooth, from a smaller polished carapace disc',
        colour: 'glossy mahogany-brown with a bronze-green sheen, black joints, amber highlights',
        medallion: 'a stag beetle seen from above'
      },
      {
        id: 'drill', name: 'Drill',
        tpl: { kind: 'spikes', n: 4, core: 0.72, base: 0.2, style: 'drill' },
        subject: 'a drill-themed spinning top: FOUR spiral drill bits radiating from a heavy machine housing, each bit with deep spiral flutes to a sharp tip, and bolted steel plates with black grip bands on the housing',
        colour: 'bright tungsten-steel bits, construction-orange housing, black grip bands, dark steel bolts',
        medallion: 'a single drill bit'
      },
      {
        id: 'lancer', name: 'Lancer',
        tpl: { kind: 'spikes', n: 4, core: 0.72, base: 0.065, style: 'lance' },
        subject: 'a jousting-knight-themed spinning top: FOUR long jousting lances radiating out, each with a sharp steel tip, a spiral-striped shaft and a round steel hand-guard where it leaves the core, with a small pennant on each lance',
        colour: 'steel tips, royal-blue and white spiral stripes, silver ring, small royal-blue pennants',
        medallion: 'two crossed lances'
      }
    ]
  }
}

export const CLASS_ORDER = ['star', 'triangle', 'round', 'quadratic', 'cushioned', 'piercer']

/** Flat list, class order then panel order (panel 1..4 = TL, TR, BL, BR). */
export const ALL_SKINS = CLASS_ORDER.flatMap(cls => CLASSES[cls].skins.map((s, i) => ({ ...s, cls, panel: i + 1 })))

/**
 * Boss TROPHY skins (bosses-100-feature.md §3.5 / §7.1) — worn by the three
 * new stage-101+ bosses and EARN-ONLY in game (`TROPHY_SKINS` in
 * src/data/skinCatalog.ts). Same fields as a class skin plus `cls` and the
 * boss that wears it. They are not part of the 2x2 class sheets (those hold
 * exactly four panels): build-refs.mjs writes only `<cls>/single-<id>.png`
 * for them and build-prompts.mjs the single + no-layout prompts.
 * The procedural fallback drawing of each (what ships until one is painted)
 * lives in art/bosses/painters.mjs.
 */
export const TROPHY_SKINS = [
  {
    id: 'cinder', name: 'Cinder', cls: 'round', boss: 'The Cinder Tyrant',
    tpl: { kind: 'disc', rings: [0.46, 0.8], grate: true },
    subject: 'a round iron brazier spinning top: a smooth closed rim of black cast iron with FOUR riveted grate bars crossing a bed of glowing coals, thin molten cracks between the coals (nothing sticks out of the circle)',
    colour: 'black cast iron #221e27 to #3b3640 with ash-grey rim highlights, coal glow #ff6a1a with #ffd27a hot cores',
    medallion: 'a single flame inside a ring'
  },
  {
    id: 'frost-vault', name: 'Frost Vault', cls: 'quadratic', boss: 'The Glacier Warden',
    tpl: { kind: 'squircle', a: 0.8, p: 5, cornerLobes: 0.27 },
    subject: 'a four-lobed vault door frozen over: a square steel vault face with FOUR rounded frost-crusted lobes at its corners, heavy bolts iced into the four lobes, and a spoked vault wheel as the inner ring',
    colour: 'steel blue-grey #4a5a6e, frost white #f2fbff, glacier cyan #7fd4ff, deep ice #2a7fc9',
    medallion: 'a padlock with a snowflake keyhole'
  },
  {
    id: 'yeti', name: 'Yeti', cls: 'triangle', boss: 'The Frostbite Yeti',
    tpl: { kind: 'barbs', n: 16, inner: 0.74, width: 0.75, style: 'cone' },
    subject: 'a yeti-fur spinning top: a round body ringed ALL the way round by shaggy white fur tufts tipped with sixteen icicle spikes pointing straight out, and a band of blue-grey hide as the inner ring',
    colour: 'snow-white #ffffff and #dfe9f2 fur, icicles #9fe7e0 fading to #4aa3d8, blue-grey hide #3b4b63',
    medallion: 'a yeti face with two short tusks'
  }
]
