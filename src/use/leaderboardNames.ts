import { isDenylistedName } from '@/utils/nameDenylist'

/**
 * ─── Fake-board NPC names ───────────────────────────────────────────────────
 *
 * The name pools for the offline (NPC) leaderboard in `useLeaderboard`, kept
 * in their own dependency-free module so the full prefix × name × suffix space
 * can be checked against the shared denylist without booting the game's state.
 */

// Names lean ~60% silly/childish to match the 6–15 target audience.
// Sensitive themes (sexual, political, religious, slurs, drugs/alcohol,
// real-world violence, body-shaming) are intentionally excluded.
export const FAKE_NAMES = [
  // ── "Cool" edgy names (~40%) ───────────────────────────────────────────
  'BladeKing', 'StormFury', 'NightHowl', 'IronVortex', 'CrimsonAce',
  'ShadowRipper', 'NovaStrike', 'PhoenixWrath', 'TitanForge', 'VenomEdge',
  'FrostFang', 'EmberSoul', 'ThunderJax', 'OmegaSpin', 'RiftBreaker',
  'KaiserBolt', 'OnyxClaw', 'BlazeMonk', 'HavocReign', 'EchoStrike',
  'PulseRogue', 'AstroDuke', 'DriftKing', 'FuryMax', 'NebulaJin',
  'SableHex', 'TempestVox', 'NeonFang', 'VoltaireX', 'StarflareQ',
  // ── Silly / childish names (~60%) ──────────────────────────────────────
  'AllStar', 'Farter', 'BurpKing', 'FartZilla', 'ToeJam',
  'BoogerBoy', 'SnotRocket', 'PicklePants', 'WafflePants', 'NuggetKing',
  'TacoTornado', 'BananaBruh', 'PizzaPirate', 'NoodleArm', 'MuffinMan',
  'CheeseWhiz', 'SpaghettiKid', 'JellyBean', 'DonutDude', 'PancakePirate',
  'MeatballHead', 'BurritoBomber', 'NachoBoss', 'SodaSlurper', 'JuiceBoxHero',
  'WiggleWorm', 'GiggleGoblin', 'WackyJack', 'ZanyZeke', 'SillyBilly',
  'GoofyGus', 'DerpyDuck', 'KooKooKid', 'BonkBoy', 'BoingBoing',
  'SquishyKing', 'JellyJiggler', 'ThumpyBunny', 'NoobSlayer', 'LagBeast',
  'SkibidiKing', 'YeetMaster', 'SusBro', 'DabKing', 'BigChungus',
  'SneezyPete', 'HiccupHero', 'CrumbCrusher', 'BellyFlopper', 'GrumpyGus'
]

// Textual suffix pool. Empty strings are intentionally included so a
// chunk of names stay bare. The rest mixes generic "cool" tags with
// gamer / streamer culture references appropriate for ages 6–15.
// We deliberately avoid numeric suffixes and any taunting tags
// (e.g. "EZ", "Noob") since names should read like real kid handles.
// Every combination prefix × name × suffix is checked against the shared
// denylist (`@/utils/nameDenylist`) in tests/nameDenylist.test.ts — keep
// profanity, insults, ethnic taunts and innuendo out of these pools.
export const NAME_SUFFIXES = [
  // ~30% bare
  '', '', '', '', '', '', '', '', '', '', '', '',
  // generic / cool
  'Jr', 'Pro', 'X', 'MVP', 'Max', 'Z', 'Boss', 'Mega', 'Ace', 'Prime',
  // gamer / streamer / meme culture
  'Kong', 'Lol', 'Rofl', 'Lel', 'JustChat', 'GG', 'YT', 'TV', 'OP', 'AFK',
  'Goat', 'Tuber', 'Mate', 'Bro', 'Brah', 'Dude', 'Fam', 'Hype', 'Wow', 'Sus', 'Yeet', 'Type'
]
export const NAME_PREFIXES = [
  // ~30% bare
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
  // generic / cool
  'The', 'Hyper', 'Mega', 'Super', 'Jim', 'Jane',
  // gamer / streamer / meme culture
  'Tum', 'Luck', 'Kar', 'Fly', 'Hammer', 'Giga', 'GG',
  'Goat', 'Tuber', 'Bro', 'Brahhh', 'Hype', 'Sus'
]

export const makeName = (i: number): string => {
  const base = FAKE_NAMES[i % FAKE_NAMES.length] ?? 'Rival'
  // Pick a random suffix (often empty) so names feel naturally varied
  // instead of every "round" sharing the same suffix.
  const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]!
  const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)]!
  return suffix || prefix ? `${prefix}${base}${suffix}` : base
}

/**
 * Pool words retired from `NAME_PREFIXES` / `NAME_SUFFIXES` / `FAKE_NAMES`
 * because they were offensive, crude or taunting. Boards persisted before the
 * clean-up still carry names built from them, so a load re-rolls those rows.
 */
const RETIRED_NAME_PARTS = /^(Dipshit|Focker|Lick|Pipi|Chang|Ching|Lame)|(WTF|Pig|Kack|Fock|Lame)$|AllKiller/

/** Re-roll persisted NPC names that a retired pool word or the denylist hits. */
export const scrubNpcNames = <T extends { name: string; isPlayer?: boolean }>(entries: T[]): T[] =>
  entries.map((e, i) =>
    !e.isPlayer && typeof e.name === 'string' && (RETIRED_NAME_PARTS.test(e.name) || isDenylistedName(e.name))
      ? { ...e, name: makeName(i) }
      : e)
