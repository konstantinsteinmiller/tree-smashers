// ─── One real skin per smasher ───────────────────────────────────────────────
//
// Owner rule 2026-10-23: the old per-top-part colourway list is gone from the
// skin picker (painting every smasher in 40 colours is too costly). Instead
// every smasher gets ONE locked skin of its own: a COCKY, a FUNNY or an
// ELEMENTAL variant of its design, painted later (roadmap: lowest priority),
// later perhaps 2-3 per smasher. Until then a skin wears the colourway named in
// `theme` (a THEMES key of src/smashers/smasherSkins.ts) as a placeholder.
//
// The skin is a normal skin id (`<smasherId>-skin`) owned under its smasher's
// top part (`<top>:<id>-skin` in the owned-skins save key), so cloud save,
// merge and selection need no new plumbing. Unlock: ONE rewarded ad (MovieIcon
// "Unlock") on a session with rewarded ads, else SMASHER_SKIN_COIN_COST coins.
// Pure data, no DOM, no imports (the skin catalog imports this file).

export type SmasherSkinKind = 'cocky' | 'funny' | 'elemental'

export interface SmasherSkinDef {
  kind: SmasherSkinKind
  /** Placeholder colourway until the painting exists (smasherSkins THEMES key). */
  theme: string
  /** The paint brief: what the painted skin shows. */
  concept: string
}

/** Coin price of a smasher skin on a session WITHOUT rewarded ads. */
export const SMASHER_SKIN_COIN_COST = 1000

/** Every smasher's skin id, in catalog order (APPENDED to SPINNER_MODEL_IDS). */
export const SMASHER_SKIN_IDS = [
  'bramble-skin',
  'thumper-skin',
  'grizzle-skin',
  'chomper-skin',
  'ramsey-skin',
  'vixie-skin',
  'shellby-skin',
  'pecks-skin',
  'mossy-skin',
  'zippy-skin',
  'hootsie-skin',
  'tuskar-skin',
  'waddles-skin',
  'flamenca-skin',
  'gulpy-skin',
  'paddles-skin',
  'inky-skin',
  'pinchy-skin',
  'puffton-skin',
  'nardo-skin',
  'fangsy-skin',
  'camo-skin',
  'curly-skin',
  'blubbo-skin',
  'humphrey-skin',
  'boxa-skin',
  'howler-skin',
  'snapjaw-skin',
  'leon-skin',
  'antlo-skin',
  'gronk-skin',
  'bambam-skin',
  'buford-skin',
  'horace-skin',
  'wallow-skin',
  'rumble-skin',
  'brock-skin',
  'bandit-skin',
  'croaky-skin',
  'slinky-skin',
  'digger-skin',
  'snooze-skin',
  'pongo-skin',
  'pincer-skin',
  'rolly-skin',
  'prickles-skin',
  'newtie-skin',
  'gastro-skin'
] as const

export type SmasherSkinId = (typeof SMASHER_SKIN_IDS)[number]

export const SMASHER_SKINS: Readonly<Record<string, SmasherSkinDef>> = Object.freeze({
  "bramble": { kind: 'elemental', theme: 'fire', concept: "ember-spined fire hedgehog, glowing orange quills" },
  "thumper": { kind: 'cocky', theme: 'golden-eagle', concept: "champion rabbit: sunglasses, gold chain, smug grin" },
  "grizzle": { kind: 'funny', theme: 'rainbow', concept: "bear cub wearing a honey-pot hat, dripping honey" },
  "chomper": { kind: 'cocky', theme: 'golden-eagle', concept: "gold-toothed lumberjack beaver, axe on the shoulder, smirk" },
  "ramsey": { kind: 'elemental', theme: 'thunder', concept: "lightning ram: crackling spiral horns" },
  "vixie": { kind: 'cocky', theme: 'reddragon', concept: "trickster fox with a flowing cape and a tiny crown" },
  "shellby": { kind: 'funny', theme: 'prisma', concept: "turtle with a disco-ball shell and party shades" },
  "pecks": { kind: 'elemental', theme: 'ice', concept: "ice-beaked woodpecker, frosty crest" },
  "mossy": { kind: 'funny', theme: 'nature', concept: "sleepy sloth in a nightcap hugging a pillow" },
  "zippy": { kind: 'elemental', theme: 'thunderstorm', concept: "thunder squirrel with a spark-lit tail" },
  "hootsie": { kind: 'cocky', theme: 'dark', concept: "professor owl: graduation cap, monocle, raised beak" },
  "tuskar": { kind: 'elemental', theme: 'cinder', concept: "lava boar with glowing magma tusks" },
  "waddles": { kind: 'funny', theme: 'rainbow', concept: "penguin in a rubber-duck swim ring on a banana peel" },
  "flamenca": { kind: 'cocky', theme: 'phoenix', concept: "diva flamingo: feather boa, heart sunglasses" },
  "gulpy": { kind: 'funny', theme: 'prisma', concept: "pelican with a fish-bucket beak, one fish tail sticking out" },
  "paddles": { kind: 'elemental', theme: 'tsunami', concept: "water-spout otter riding a small wave" },
  "inky": { kind: 'elemental', theme: 'galaxy', concept: "galaxy-ink octopus with star-speckled tentacles" },
  "pinchy": { kind: 'cocky', theme: 'golden-eagle', concept: "crab king: golden claws, jewelled crown" },
  "puffton": { kind: 'funny', theme: 'rainbow', concept: "puffer fish inflated like a party balloon, string and all" },
  "nardo": { kind: 'elemental', theme: 'frost-vault', concept: "frost narwhal with a crystal ice horn" },
  "fangsy": { kind: 'cocky', theme: 'dark', concept: "count bat in a high-collar cape, one fang gleaming" },
  "camo": { kind: 'funny', theme: 'prisma', concept: "disco chameleon cycling rainbow stripes" },
  "curly": { kind: 'elemental', theme: 'tsunami', concept: "storm seahorse wrapped in a tiny cloud" },
  "blubbo": { kind: 'cocky', theme: 'golden-eagle', concept: "walrus admiral: gold-braid hat, medals, tusks polished" },
  "humphrey": { kind: 'elemental', theme: 'sandstorm', concept: "sandstorm camel with swirling dust wraps" },
  "boxa": { kind: 'cocky', theme: 'reddragon', concept: "pro boxer kangaroo with a champion belt and gloves" },
  "howler": { kind: 'elemental', theme: 'full-moon', concept: "moonlit wolf with a silver glowing mane" },
  "snapjaw": { kind: 'funny', theme: 'nature', concept: "crocodile with a rubber-duck on its snout and flippers" },
  "leon": { kind: 'cocky', theme: 'golden-eagle', concept: "golden king lion: huge flowing mane, crown" },
  "antlo": { kind: 'elemental', theme: 'frost-vault', concept: "aurora moose with shimmering green-violet antlers" },
  "gronk": { kind: 'funny', theme: 'rainbow', concept: "gorilla wearing a banana crown and a banana cape" },
  "bambam": { kind: 'elemental', theme: 'forest-dragon', concept: "jade bamboo panda with leaf-armoured paws" },
  "buford": { kind: 'cocky', theme: 'sandstorm', concept: "rodeo bison in a cowboy hat with a bandana" },
  "horace": { kind: 'elemental', theme: 'boulder', concept: "stone rhino with a rocky crystal horn" },
  "wallow": { kind: 'funny', theme: 'nature', concept: "spa hippo with cucumber slices on its eyes and a towel" },
  "rumble": { kind: 'elemental', theme: 'thunderstorm', concept: "thunder elephant calf, storm-cloud ears" },
  "brock": { kind: 'cocky', theme: 'mountain', concept: "knight badger: dented helmet, plume, shield" },
  "bandit": { kind: 'funny', theme: 'dark', concept: "raccoon in trash-can-lid armour with a spoon sword" },
  "croaky": { kind: 'elemental', theme: 'toadstool', concept: "poison-dart toad, glowing neon-green warts" },
  "slinky": { kind: 'funny', theme: 'nature', concept: "koala with eucalyptus-leaf sunglasses, half asleep" },
  "digger": { kind: 'elemental', theme: 'diamond', concept: "crystal-geode mole with gem claws" },
  "snooze": { kind: 'funny', theme: 'prisma', concept: "dormouse sleeping in a teacup" },
  "pongo": { kind: 'funny', theme: 'toadstool', concept: "skunk with a perfume bottle and a clothes-peg on its nose" },
  "pincer": { kind: 'cocky', theme: 'golden-eagle', concept: "gladiator stag beetle: plumed helm, gilded jaws" },
  "rolly": { kind: 'funny', theme: 'rainbow', concept: "pill bug dressed as a bowling ball" },
  "prickles": { kind: 'elemental', theme: 'diamond', concept: "crystal-quill porcupine, gem spines" },
  "newtie": { kind: 'elemental', theme: 'fire', concept: "fire salamander newt with ember spots" },
  "gastro": { kind: 'funny', theme: 'prisma', concept: "snail with a rocket-powered shell" }
})

const SKIN_SET: ReadonlySet<string> = new Set<string>(SMASHER_SKIN_IDS)

export const isSmasherSkin = (modelId: string): modelId is SmasherSkinId => SKIN_SET.has(modelId)

/** The skin id of a smasher. */
export const smasherSkinIdOf = (smasherId: string): SmasherSkinId => `${smasherId}-skin` as SmasherSkinId

/** The smasher a skin id belongs to (null for any other id). */
export const smasherOfSkinId = (modelId: string): string | null =>
  isSmasherSkin(modelId) ? modelId.slice(0, -'-skin'.length) : null
