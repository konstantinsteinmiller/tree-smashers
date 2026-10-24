/**
 * Smasher skill icons (all skills in src/use/skills/smasherSkillArt.ts) and the
 * 15 skill VFX flavour sprites (FLAVOUR_SHAPES) → TEXT-ONLY Gemini prompts.
 *
 *   node tools/skill-art/prompts.mjs
 *
 * Writes art-sheets/skill-art/<sheet>.prompt.txt for every SHEET (nine icons
 * per painting on a 3×3 grid, flat magenta, to save quota) and
 * art-sheets/skill-art/single-<id>.prompt.txt for every icon REJECTED from its
 * sheet (rejected.json) — it is repainted alone. Paint with paint-queue.mjs,
 * pack with pack.mjs. The vector drawings in the registry stay the fallback.
 *
 * Style: the HUD icon family (ui-catalog.md, tools/ui-icons): front
 * three-quarter view, light from the top-left, 2–3 flat tones, bold navy
 * outline, no stitches / felt / metal / text. Each icon sits on the skill
 * medallion's effect-coloured disc at only 22–30 css px, so ONE bold motif.
 *
 * Every motif shows the skill's CURRENT effect (the 12 switched skills —
 * quill_burst, log_slam, plate_bounce, claw_drill, chitin_plate, spine_wall,
 * horn_ram, belly_slide, river_roll, tail_anchor, blubber_wall, spike_puff —
 * read as thorns / tower breaker / bank shot / anchor, not their old effect).
 * tests/skillArt.test.ts checks SKILLS against the game's catalog, so an
 * effect switch without a new motif fails the suite.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const DIR = join(ROOT, 'art-sheets', 'skill-art')
const GAME = '"Tree Smashers", a cosy cartoon game where cute-but-angry stuffed-animal fighters battle on spinning wooden discs'

/** What each effect must SAY in the icon (the effect cue). */
export const EFFECT_CUE = {
  thorns: 'THORNS (whoever rams it gets hurt): sharp spikes with a small sun-yellow impact burst bouncing back off their tips',
  guard_shell: 'SHIELD (starts the battle shielded): a protective shell / shield shape',
  homing_rockets: 'VOLLEY (fires projectiles at enemies): three small projectiles flying up-right in a curved arc, each with a short white speed streak',
  lucky_edge: 'CRITICAL HIT: one big sun-yellow jagged impact star where the blow lands',
  phase_step: 'DODGE: the shape slipping sideways, leaving ONE pale sky-blue ghost copy of itself behind',
  momentum: 'BUILDING POWER: two stacked chunky sun-yellow forward chevrons (>>) beside it',
  second_wind: 'HEAL: a big white plus sign on a leaf-green round badge beside it',
  static_charge: 'STUN (rammers skip a turn): two or three small sun-yellow dizzy stars or a zap bolt',
  opening_salvo: 'OPENING BLOW (hits every enemy at the start): one big shock-wave starburst ring around it',
  mirror_plate: 'BLOCK AND SEND BACK: a round guard with one chunky curved arrow bouncing back off it',
  hazard_ward: 'HAZARD WARD (lava, thunder, spikes hurt less): a small orange flame and a small yellow lightning bolt glancing off it',
  bank_shot: 'TRICK SHOT / BANK SHOT: a ball and one bold bent arrow that bounces off a short upright wall bar (a V-shaped ricochet path)',
  anchor: 'HOLD YOUR GROUND (less knockback): a heavy chunky toy ship ANCHOR planted firmly, with two short ground lines under it',
  tower_breaker: 'TREE BREAKER (extra damage to the enemy tree): a chunky tree stump with a big jagged crack and flying wood chips'
}

/** [skillId, animal, effect, motif] in the game's catalog order (SMASHER_LIST). */
export const SKILLS = [
  ['quill_burst', 'hedgehog', 'thorns', 'a round royal-blue hedgehog back bristling with chunky white quills, a sun-yellow impact burst bouncing off the quill tips'],
  ['curl_up', 'hedgehog', 'guard_shell', 'a hedgehog curled into a tight spiky royal-blue ball with a sky-blue shield ring around it'],
  ['thorn_volley', 'hedgehog', 'homing_rockets', 'three fat leaf-green thorns flying up-right in an arc with white speed streaks'],
  ['double_kick', 'rabbit', 'lucky_edge', 'two white rabbit feet with cream soles kicking, a big sun-yellow impact star at the toes'],
  ['hop_dodge', 'rabbit', 'phase_step', 'a round white bunny head with tall ears hopping sideways, one pale sky-blue ghost copy behind it'],
  ['carrot_rush', 'rabbit', 'momentum', 'one chunky orange carrot with green leaves flying forward, two sun-yellow chevrons behind it'],
  ['honey_snack', 'bear cub', 'second_wind', 'a round sun-yellow honey pot with honey dripping over its rim, a white plus on a green badge beside it'],
  ['bear_hug', 'bear cub', 'guard_shell', 'two big royal-blue bear paws wrapped around a white heart, a sky-blue shield arc around them'],
  ['grumpy_roar', 'bear cub', 'static_charge', 'a grumpy royal-blue bear face roaring with an open mouth, two sun-yellow dizzy stars beside it'],
  ['timber_bite', 'beaver', 'lucky_edge', 'two big white beaver teeth biting, a sun-yellow jagged impact star and two wood chips'],
  ['log_slam', 'beaver', 'tower_breaker', 'a chunky log hammer smashing down onto a tree stump with a big jagged crack and flying wood chips'],
  ['dam_wall', 'beaver', 'hazard_ward', 'a stack of three chunky sky-blue logs as a little dam wall, a small orange flame and a yellow bolt glancing off it'],
  ['headbutt', 'ram', 'opening_salvo', 'a white woolly ram head with curly sky-blue horns butting forward, a big shock-wave starburst ring around the impact'],
  ['horn_charge', 'ram', 'momentum', 'two big curly ram horns charging forward, two sun-yellow chevrons behind them'],
  ['wool_guard', 'ram', 'mirror_plate', 'a fluffy white wool cloud shaped like a round guard, one chunky curved arrow bouncing back off it'],
  ['trick_step', 'fox', 'phase_step', 'a bushy orange fox tail with a white tip whisking sideways, one pale sky-blue ghost copy behind it'],
  ['sly_strike', 'fox', 'lucky_edge', 'three white claw slashes with a sun-yellow jagged impact star'],
  ['fox_fire', 'fox', 'homing_rockets', 'three small sky-blue fox-fire flames flying up-right in an arc'],
  ['shell_block', 'turtle', 'guard_shell', 'a domed leaf-green turtle shell with lighter green hexagon plates, seen as a shield'],
  ['slow_heal', 'turtle', 'second_wind', 'a leaf-green heart with a white plus on it'],
  ['mossy_ward', 'turtle', 'hazard_ward', 'a royal-blue shield with green moss on top, a small orange flame and a yellow bolt glancing off it'],
  ['peck_peck', 'woodpecker', 'momentum', 'a white woodpecker head with a red crest and a sun-yellow beak pecking forward, two sun-yellow chevrons behind it'],
  ['drill_beak', 'woodpecker', 'lucky_edge', 'a long orange-yellow drill beak with spiral grooves, a big sun-yellow impact star at its tip'],
  ['feather_flurry', 'woodpecker', 'homing_rockets', 'three white feathers with red tips flying up-right in an arc with white speed streaks'],
  ['lazy_shield', 'sloth', 'guard_shell', 'a big leaf-green leaf held like an umbrella shield'],
  ['nap_time', 'sloth', 'static_charge', 'a sun-yellow crescent moon with two chunky sky-blue Z shapes (sleep), no letters other than the Z shapes'],
  ['leaf_mend', 'sloth', 'second_wind', 'one big leaf-green leaf with a white plus on a round badge'],
  ['nut_toss', 'squirrel', 'homing_rockets', 'three chunky acorns flying up-right in an arc with white speed streaks'],
  ['acorn_armor', 'squirrel', 'mirror_plate', 'a big acorn cap held like a round guard, one chunky curved arrow bouncing back off it'],
  ['dash_dodge', 'squirrel', 'phase_step', 'a curled bushy squirrel tail dashing sideways, one pale sky-blue ghost copy behind it'],
  ['night_eye', 'owl', 'lucky_edge', 'one big round owl eye with a sun-yellow iris and a royal-blue brow, a small sun-yellow sparkle star'],
  ['wing_ward', 'owl', 'hazard_ward', 'a white owl wing curled like a shield, a small orange flame and a yellow bolt glancing off it'],
  ['static_feathers', 'owl', 'static_charge', 'a white feather with a big sun-yellow zap lightning bolt across it'],
  ['tusk_toss', 'boar', 'opening_salvo', 'two curved white boar tusks above a coral snout, a big shock-wave starburst ring around them'],
  ['mud_roll', 'boar', 'mirror_plate', 'a round splashy royal-blue mud ball as a guard, one chunky curved arrow bouncing back off it'],
  ['stampede', 'boar', 'momentum', 'two pairs of chunky dark hoof prints stepping forward with a white dust puff, two sun-yellow chevrons'],
  ['burrow_guard', 'badger', 'guard_shell', 'a dome-shaped wall of warm earth clods with a sky-blue shield ring around it'],
  ['badger_bite', 'badger', 'lucky_edge', 'a black-and-white striped badger snout biting, a big sun-yellow impact star'],
  ['stripe_charge', 'badger', 'opening_salvo', 'a black-and-white striped badger head charging, a big shock-wave starburst ring around it'],
  ['pickpocket', 'raccoon', 'lucky_edge', 'a small grey raccoon paw snatching a sun-yellow star'],
  ['trash_toss', 'raccoon', 'homing_rockets', 'three small pieces of junk (a tin can, an apple core, a crumpled paper ball) flying up-right in an arc'],
  ['masked_slip', 'raccoon', 'phase_step', 'a black raccoon eye mask slipping sideways, one pale sky-blue ghost copy behind it'],
  ['frog_leap', 'toad', 'momentum', 'a leaf-green frog leg mid-leap, two sun-yellow chevrons behind it'],
  ['tongue_snap', 'toad', 'homing_rockets', 'a long coral-red frog tongue snapping out in a curve with a round tip, white speed streaks'],
  ['lily_hop', 'toad', 'phase_step', 'a round green lily pad with a little hop arc, one pale sky-blue ghost copy beside it'],
  ['war_dance', 'koala', 'static_charge', 'a grey koala with raised paws dancing, two sun-yellow dizzy stars above'],
  ['neck_bite', 'koala', 'lucky_edge', 'a grey koala head biting with small white teeth, a big sun-yellow impact star'],
  ['weasel_dash', 'koala', 'momentum', 'a grey round koala ear-and-head dashing forward with a white dust puff, two sun-yellow chevrons'],
  ['claw_drill', 'mole', 'tower_breaker', 'a big digging mole claw drilling into a tree stump with a big jagged crack and flying wood chips'],
  ['tunnel_ambush', 'mole', 'opening_salvo', 'a mole nose popping out of a dirt mound, a big shock-wave starburst ring around it'],
  ['dirt_shelter', 'mole', 'hazard_ward', 'a little dirt mound dome, a small orange flame and a yellow bolt glancing off it'],
  ['hibernate', 'dormouse', 'second_wind', 'a sleeping curled-up dormouse ball with a white plus on a green badge'],
  ['curl_snug', 'dormouse', 'guard_shell', 'a dormouse curled into a ball under its fluffy tail, a sky-blue shield ring around it'],
  ['hazel_hoard', 'dormouse', 'homing_rockets', 'three round hazelnuts flying up-right in an arc with white speed streaks'],
  ['stink_cloud', 'skunk', 'static_charge', 'a puffy lime-green stink cloud with two sun-yellow dizzy stars'],
  ['tail_shield', 'skunk', 'mirror_plate', 'a big black-and-white striped skunk tail curled like a round guard, one chunky curved arrow bouncing back off it'],
  ['musk_ward', 'skunk', 'hazard_ward', 'a lime-green musk cloud bubble, a small orange flame and a yellow bolt glancing off it'],
  ['mandible_clamp', 'stag beetle', 'lucky_edge', 'two big curved brick-red beetle mandibles clamping shut, a sun-yellow impact star between them'],
  ['chitin_plate', 'stag beetle', 'thorns', 'a flat brick-red beetle shell plate ringed with short sharp spikes, a sun-yellow impact burst bouncing off the spikes'],
  ['stag_charge', 'stag beetle', 'momentum', 'a stag beetle head with big antler mandibles charging forward, two sun-yellow chevrons'],
  ['roll_up', 'pill bug', 'guard_shell', 'a slate-blue pill bug rolled into a banded ball, a sky-blue shield ring around it'],
  ['plate_bounce', 'pill bug', 'bank_shot', 'a slate-blue banded pill-bug ball and one bold bent arrow ricocheting off a short upright wall bar in a V'],
  ['segment_shrug', 'pill bug', 'mirror_plate', 'a curved banded pill-bug plate as a guard, one chunky curved arrow bouncing back off it'],
  ['quill_storm', 'porcupine', 'homing_rockets', 'three long white-and-tan porcupine quills flying up-right in an arc with white speed streaks'],
  ['spine_wall', 'porcupine', 'thorns', 'a porcupine rump with a wall of long white-and-tan quills, a sun-yellow impact burst bouncing off the quill tips'],
  ['bark_munch', 'porcupine', 'second_wind', 'a chunk of tree bark with a bite taken out, a white plus on a green badge'],
  ['tail_regrow', 'newt', 'second_wind', 'an orange newt tail curling, a white plus on a green badge'],
  ['fire_skin', 'newt', 'hazard_ward', 'an orange newt with small sun-yellow spots, a small orange flame and a yellow bolt glancing off it'],
  ['slick_slip', 'newt', 'phase_step', 'a sky-blue water drop slipping sideways, one pale sky-blue ghost copy behind it'],
  ['shell_retreat', 'snail', 'guard_shell', 'a big orange spiral snail shell as a shield'],
  ['slime_trail', 'snail', 'hazard_ward', 'a lime-green slime puddle trail, a small orange flame and a yellow bolt glancing off it'],
  ['slow_regrow', 'snail', 'second_wind', 'a small leaf-green sprout with two leaves, a white plus on a green badge'],
  ['sand_ward', 'camel', 'hazard_ward', 'a warm sand-coloured camel hump, a small orange flame and a yellow bolt glancing off it'],
  ['hump_reserve', 'camel', 'second_wind', 'a sky-blue water flask, a white plus on a green badge'],
  ['camel_spit', 'camel', 'homing_rockets', 'three sky-blue spit droplets flying up-right in an arc with white speed streaks'],
  ['one_two', 'kangaroo', 'lucky_edge', 'two red boxing gloves punching, a big sun-yellow impact star'],
  ['bounce_back', 'kangaroo', 'phase_step', 'a kangaroo foot springing sideways, one pale sky-blue ghost copy behind it'],
  ['tail_spring', 'kangaroo', 'momentum', 'a thick kangaroo tail coiled like a spring, two sun-yellow chevrons'],
  ['pack_hunt', 'wolf', 'momentum', 'three slate-grey wolf paw prints in a row stepping forward, two sun-yellow chevrons'],
  ['moon_howl', 'wolf', 'static_charge', 'a slate-grey wolf head howling up at a small sun-yellow crescent moon, two dizzy stars'],
  ['fang_flurry', 'wolf', 'homing_rockets', 'three white wolf fangs flying up-right in an arc with white speed streaks'],
  ['death_roll', 'crocodile', 'lucky_edge', 'a leaf-green crocodile spinning in a roll, a big sun-yellow impact star'],
  ['ambush_snap', 'crocodile', 'opening_salvo', 'open leaf-green crocodile jaws snapping up out of water, a big shock-wave starburst ring around them'],
  ['swamp_hide', 'crocodile', 'hazard_ward', 'a leaf-green scaly crocodile back with ridges, a small orange flame and a yellow bolt glancing off it'],
  ['pride_pounce', 'lion', 'momentum', 'a sun-yellow lion paw pouncing forward with claws out, two sun-yellow chevrons'],
  ['king_roar', 'lion', 'static_charge', 'a roaring lion head with an orange mane and a small sun-yellow crown, two dizzy stars'],
  ['mane_shake', 'lion', 'phase_step', 'a big shaggy orange lion mane shaking sideways, one pale sky-blue ghost copy behind it'],
  ['antler_parry', 'moose', 'mirror_plate', 'a broad cream moose antler held like a guard, one chunky curved arrow bouncing back off it'],
  ['bog_stomp', 'moose', 'hazard_ward', 'a big moose hoof stomping in a bog puddle, a small orange flame and a yellow bolt glancing off it'],
  ['rut_charge', 'moose', 'opening_salvo', 'a moose head with broad cream antlers charging, a big shock-wave starburst ring around it'],
  ['chest_thump', 'gorilla', 'opening_salvo', 'two grey gorilla fists thumping a chest, a big shock-wave starburst ring around them'],
  ['knuckle_smash', 'gorilla', 'lucky_edge', 'one big grey gorilla fist smashing down, a big sun-yellow impact star'],
  ['banana_break', 'gorilla', 'second_wind', 'a peeled sun-yellow banana, a white plus on a green badge'],
  ['roly_poly', 'panda', 'guard_shell', 'a round black-and-white panda curled into a ball, a sky-blue shield ring around it'],
  ['bamboo_block', 'panda', 'mirror_plate', 'three green bamboo stalks crossed as a guard, one chunky curved arrow bouncing back off them'],
  ['lazy_roll', 'panda', 'phase_step', 'a black-and-white panda rolling sideways, one pale sky-blue ghost copy behind it'],
  ['herd_rush', 'bison', 'momentum', 'a shaggy bison head with short horns rushing forward, two sun-yellow chevrons'],
  ['dust_storm', 'bison', 'homing_rockets', 'three sandy dust clouds flying up-right in an arc with white speed streaks'],
  ['shaggy_coat', 'bison', 'hazard_ward', 'a thick shaggy warm-tan fur cape, a small orange flame and a yellow bolt glancing off it'],
  ['horn_ram', 'rhino', 'tower_breaker', 'a slate-grey rhino horn ramming into a tree stump with a big jagged crack and flying wood chips'],
  ['armor_plate', 'rhino', 'guard_shell', 'a thick slate-grey rhino hide plate shaped like a shield'],
  ['thick_skull', 'rhino', 'static_charge', 'a slate-grey rhino head bonking forward, two sun-yellow dizzy stars'],
  ['mud_bath', 'hippo', 'second_wind', 'a round mud puddle with bubbles, a white plus on a green badge'],
  ['big_yawn', 'hippo', 'static_charge', 'a wide-open yawning grey hippo mouth with two chunky sky-blue Z shapes'],
  ['river_wave', 'hippo', 'homing_rockets', 'three curling sky-blue water waves flying up-right in an arc'],
  ['trunk_spray', 'elephant calf', 'homing_rockets', 'a grey elephant trunk spraying three sky-blue water blobs up-right in an arc'],
  ['never_forget', 'elephant calf', 'mirror_plate', 'a big round grey elephant ear held like a guard, one chunky curved arrow bouncing back off it'],
  ['peanut_power', 'elephant calf', 'second_wind', 'one chunky peanut in its shell, a white plus on a green badge'],
  ['belly_slide', 'penguin', 'bank_shot', 'a round penguin sliding on its white belly and one bold bent arrow ricocheting off a short upright ice wall bar in a V'],
  ['flipper_flap', 'penguin', 'phase_step', 'a dark navy-blue penguin flipper flapping sideways, one pale sky-blue ghost copy behind it'],
  ['fish_snack', 'penguin', 'second_wind', 'a small sky-blue fish, a white plus on a green badge'],
  ['pink_kick', 'flamingo', 'lucky_edge', 'a long coral flamingo leg kicking, a big sun-yellow impact star'],
  ['one_leg_pose', 'flamingo', 'phase_step', 'a coral flamingo standing on one leg leaning aside, one pale sky-blue ghost copy behind it'],
  ['feather_fan', 'flamingo', 'homing_rockets', 'three coral feathers flying up-right in an arc with white speed streaks'],
  ['pouch_gulp', 'pelican', 'mirror_plate', 'a big stretchy sun-yellow pelican beak pouch as a guard, one chunky curved arrow bouncing back off it'],
  ['beak_scoop', 'pelican', 'opening_salvo', 'a pelican beak scooping up a splash of water, a big shock-wave starburst ring around it'],
  ['fish_stash', 'pelican', 'second_wind', 'two small sky-blue fish in a pouch, a white plus on a green badge'],
  ['pebble_toss', 'otter', 'homing_rockets', 'three round grey-blue pebbles flying up-right in an arc with white speed streaks'],
  ['river_roll', 'otter', 'bank_shot', 'a round otter rolled into a ball and one bold bent arrow ricocheting off a short upright wall bar in a V'],
  ['slick_fur', 'otter', 'hazard_ward', 'a sleek sky-blue water-slick fur swoosh, a small orange flame and a yellow bolt glancing off it'],
  ['ink_cloud', 'octopus', 'phase_step', 'a dark slate-indigo ink cloud puffing sideways, one pale sky-blue ghost copy behind it'],
  ['tentacle_grip', 'octopus', 'static_charge', 'a periwinkle-blue octopus tentacle curled around in a grip, two sun-yellow dizzy stars'],
  ['sucker_slap', 'octopus', 'lucky_edge', 'a periwinkle-blue octopus tentacle with round suckers slapping, a big sun-yellow impact star'],
  ['claw_snap', 'crab', 'lucky_edge', 'one big coral-red crab claw snapping shut, a big sun-yellow impact star'],
  ['carapace', 'crab', 'guard_shell', 'a wide coral-red crab shell shaped like a shield'],
  ['sideways_scuttle', 'crab', 'momentum', 'a coral-red crab scuttling sideways on pointy legs, two sun-yellow chevrons'],
  ['spike_puff', 'puffer fish', 'thorns', 'a round orange puffer fish blown up with short sharp spikes all round, a sun-yellow impact burst bouncing off the spikes'],
  ['puff_up', 'puffer fish', 'guard_shell', 'a round pale-blue puffed-up puffer fish as a big bubble shield'],
  ['toxic_prickle', 'puffer fish', 'static_charge', 'one lime-green toxic prickle spine with two sun-yellow dizzy stars'],
  ['horn_lance', 'narwhal', 'opening_salvo', 'a long white spiral narwhal horn lancing forward, a big shock-wave starburst ring at its tip'],
  ['ice_dive', 'narwhal', 'momentum', 'a white-and-pale-blue narwhal diving forward through ice chunks, two sun-yellow chevrons'],
  ['arctic_chill', 'narwhal', 'hazard_ward', 'a pale-blue six-point snowflake, a small orange flame and a yellow bolt glancing off it'],
  ['sonic_screech', 'bat', 'static_charge', 'a slate-indigo bat head screeching with sun-yellow sound arcs and two dizzy stars'],
  ['echo_strike', 'bat', 'homing_rockets', 'three sky-blue sound-ring bolts flying up-right in an arc'],
  ['night_bite', 'bat', 'lucky_edge', 'two small white bat fangs biting, a big sun-yellow impact star'],
  ['sticky_lash', 'chameleon', 'opening_salvo', 'a long coral chameleon tongue lashing out straight with a round sticky tip, a big shock-wave starburst ring around the tip'],
  ['camo_blend', 'chameleon', 'phase_step', 'a lime-green chameleon curled tail fading sideways, one pale sky-blue ghost copy behind it'],
  ['eye_lock', 'chameleon', 'lucky_edge', 'one round turret-shaped lime-green chameleon eye with a target ring, a sun-yellow sparkle star'],
  ['tail_anchor', 'seahorse', 'anchor', 'a sun-yellow seahorse tail curled tight around a heavy chunky toy ship anchor planted on the ground, two short ground lines under it'],
  ['coral_mend', 'seahorse', 'second_wind', 'a small coral-red branch of coral, a white plus on a green badge'],
  ['bubble_jet', 'seahorse', 'homing_rockets', 'three round sky-blue bubbles flying up-right in an arc with white speed streaks'],
  ['blubber_wall', 'walrus', 'anchor', 'a fat pale-blue walrus body sitting heavy and planted with a chunky toy ship anchor in front of it, two short ground lines under it'],
  ['ice_floe', 'walrus', 'hazard_ward', 'a flat pale-blue ice floe slab, a small orange flame and a yellow bolt glancing off it'],
  ['tusk_slam', 'walrus', 'static_charge', 'two long white walrus tusks slamming down, two sun-yellow dizzy stars']
]

/** The 12 skills whose effect was switched — tests check their motifs carry the new cue. */
export const SWITCHED = {
  quill_burst: 'thorns', log_slam: 'tower_breaker', plate_bounce: 'bank_shot', claw_drill: 'tower_breaker',
  chitin_plate: 'thorns', spine_wall: 'thorns', horn_ram: 'tower_breaker', belly_slide: 'bank_shot',
  river_roll: 'bank_shot', tail_anchor: 'anchor', blubber_wall: 'anchor', spike_puff: 'thorns'
}

/** Flavour particle shapes → what to paint (pointing RIGHT where the game aligns them to flight). */
export const FLAVOURS = {
  quill: 'one long thin pointed hedgehog quill lying horizontally, its sharp tip pointing RIGHT, cream-white with a tan base',
  chip: 'one small chunky wood chip, a five-sided splinter of light honey-orange wood with a lighter top face',
  star: 'one chunky five-point star, sun yellow with a lighter upper-left face',
  puff: 'one small round dust puff cloud made of three round bumps, white with a pale sky-blue shade',
  carrot: 'one small carrot lying horizontally, its pointed tip pointing LEFT and two small green leaves on its RIGHT end, bright orange',
  drop: 'one round water/honey drop with its point at the top, sky blue with a lighter upper-left face and a small white highlight',
  heart: 'one plump rounded heart, raspberry red with a lighter upper-left face',
  wool: 'one fluffy round tuft of wool made of four round bumps, white with a pale sky-blue shade',
  leaf: 'one simple leaf lying horizontally, its tip pointing RIGHT, leaf green with a darker green centre vein',
  flame: 'one small chunky flame with its tip at the top, sky blue with a lighter cyan core',
  hex: 'one flat hexagon plate (like a turtle shell scute) with a thick rim, leaf green with a lighter green top face',
  feather: 'one small feather lying horizontally, its tip pointing RIGHT, white with a thin sky-blue shaft along its middle',
  zed: 'one chunky sleep "Z" shape (a single bold zig-zag glyph), sky blue with a lighter face — the only letter-like shape allowed',
  acorn: 'one acorn standing upright, a light honey-orange nut with a darker brown-orange textured cap on top',
  spark: 'one four-point sparkle star with long thin points, sun yellow with a white centre'
}
export const FLAVOUR_IDS = Object.keys(FLAVOURS)

// ─── Sheets ───────────────────────────────────────────────────────────────────
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const pad2 = (i) => String(i + 1).padStart(2, '0')

/** {name, kind: 'icon'|'fx', cols, rows, ids} — ids row by row, `null` = empty cell. */
export const SHEETS = [
  ...chunk(SKILLS.map(s => s[0]), 9).map((ids, i) => ({ name: `icons-${pad2(i)}`, kind: 'icon', cols: 3, rows: 3, ids: [...ids, ...Array(9 - ids.length).fill(null)] })),
  { name: 'fx-01', kind: 'fx', cols: 3, rows: 3, ids: FLAVOUR_IDS.slice(0, 9) },
  { name: 'fx-02', kind: 'fx', cols: 3, rows: 2, ids: FLAVOUR_IDS.slice(9) }
]

/** Reviewer verdicts: { "<id>": { sheet?: "why", single?: "why" } } — a sheet
 *  rejection repaints the icon alone; a single rejection leaves it procedural. */
export const REJECTED_FILE = join(DIR, 'rejected.json')
export const readRejected = () => existsSync(REJECTED_FILE) ? JSON.parse(readFileSync(REJECTED_FILE, 'utf-8')) : {}

const SKILL = Object.fromEntries(SKILLS.map(([id, animal, effect, motif]) => [id, { id, animal, effect, motif }]))
const POS = ['top-left', 'top-centre', 'top-right', 'middle-left', 'centre', 'middle-right', 'bottom-left', 'bottom-centre', 'bottom-right']

export const iconSpec = (id) => {
  const s = SKILL[id]
  return `${s.motif}. (The ${s.animal} fighter's skill — it must read as ${EFFECT_CUE[s.effect]}.)`
}

const STYLE = [
  'Style: the game\'s toy-box arena icon family — bright, chunky, toy-like icons with smooth painted surfaces like a well-made wooden/plastic toy, seen from the front three-quarter view with light from the top-left (upper-left faces lighter, lower-right faces one tone darker). Flat cel shading with 2–3 flat tones per colour. A bold, even, dark navy (#161a40) outline around the whole silhouette and its main parts.',
  'NO stitches, NO seams, NO felt or fabric texture, NO metal, NO chrome, NO metallic gold, NO shine or reflections. NO glow, NO blur, NO soft drop shadow, NO gradients, NO text, NO letters, NO numbers (except a "Z" shape where one is asked for), NO frame, NO circle badge or button behind an icon.',
  'Colours: clean bright royal blue, sky blue, white, leaf green, sun yellow, orange, coral and raspberry red, plus any animal colour named. NO pink, NO magenta, NO purple anywhere inside the icons (the background is magenta and gets keyed out). NO muddy or dark tones except the navy outline.',
  'Readability: each icon is shown on a small round coloured skill badge only 22–30 px wide, so it must be ONE bold, simple, chunky silhouette with a few big shapes and no tiny details.'
]

export const promptFor = (sheet) => {
  const icon = sheet.kind === 'icon'
  const n = sheet.ids.filter(Boolean).length
  const cells = sheet.ids.map((id, i) => {
    if (!id) return `${POS[i] ?? `cell ${i + 1}`}: EMPTY — leave this cell plain magenta.`
    return `${POS[i]}: ${icon ? iconSpec(id) : FLAVOURS[id] + '.'}`
  })
  const aspect = sheet.rows === sheet.cols ? 'a SQUARE 1:1 image' : `a LANDSCAPE ${sheet.cols}:${sheet.rows} image`
  return [
    `Paint a sheet of ${n} separate small game ${icon ? 'SKILL ICONS' : 'VFX PARTICLE SPRITES'} for ${GAME}.`,
    `Layout: ${aspect} divided into an invisible grid of ${sheet.cols} columns × ${sheet.rows} rows of equal cells. Exactly ONE ${icon ? 'icon' : 'sprite'} centred in each cell, filling about 70% of its cell, upright. Wide empty magenta gaps between neighbours — nothing may touch another ${icon ? 'icon' : 'sprite'} or cross into a neighbouring cell. NO grid lines, NO cell borders, NO labels.`,
    `The ${icon ? 'icons' : 'sprites'}, cell by cell (row by row, left to right):`,
    ...cells.map(c => `- ${c}`),
    ...STYLE.slice(0, 3),
    icon ? STYLE[3] : 'Readability: each sprite flies as a tiny particle 8–20 px wide, so it must be ONE bold, simple silhouette with no small details.',
    'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the icons — no gradient, no texture, no shadow on it, no magenta anywhere inside the art. It will be keyed to transparency.',
    'Generate the image now.'
  ].join('\n')
}

/** One icon alone (repaint of a cell the reviewer rejected). */
export const singlePromptFor = (id) => [
  `Paint ONE small game SKILL ICON for ${GAME}.`,
  `The icon: ${iconSpec(id)}`,
  ...STYLE,
  'Composition: a SQUARE 1:1 image. The icon is centred, upright, filling about 80% of the image with an even margin on every side.',
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) everywhere around the icon — no gradient, no texture, no shadow on it, no magenta anywhere inside the icon. It will be keyed to transparency.',
  'Generate the image now.'
].join('\n')

/** Icons rejected from their sheet that still get a solo repaint. */
export const singleIds = (rej = readRejected()) => Object.entries(rej).filter(([, r]) => r.sheet && !r.single).map(([id]) => id)
  .filter(id => SKILL[id])

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(DIR, { recursive: true })
  for (const s of SHEETS) {
    const p = join(DIR, `${s.name}.prompt.txt`)
    writeFileSync(p, promptFor(s) + '\n')
    console.log(p)
  }
  for (const id of singleIds()) {
    const p = join(DIR, `single-${id}.prompt.txt`)
    writeFileSync(p, singlePromptFor(id) + '\n')
    console.log(p)
  }
}
