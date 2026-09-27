// Allowlist for `tests/i18nParity.test.ts` — values that may legitimately stay
// as in English (identical to the source, or Latin letters in a non-Latin
// locale), and so are not "untranslated".
//
// Keys are dotted paths exactly as the parity test prints them:
//   global keys        → `spinner.coins`, `stages.stage_1`
//   component (SFC)    → `sfc.OptionsModal.audio`, `sfc.BattlePass.max`
//
// Add an entry only when the English form really IS what a native speaker
// writes in that language (a loanword, cognate, genre name or gaming
// abbreviation) — never to silence the test for a string you have not
// translated yet.

/**
 * Brand, proper nouns and universal tokens: may stay as in English in EVERY
 * locale, including non-Latin ones.
 */
export const BRAND_KEYS: readonly string[] = [
  'gameName', // "Chaos Arena" — the product name is never translated
  'pvp.shareTitle', // "Chaos Arena PvP"
  'vs', // "VS" — universal fight-card token
  'leaderboard.rank', // "#"
  'sfc.BGSkinModal.bg.skins.prism' // "K-Pop" — a genre name
]

/**
 * Per locale: keys whose value may equal English and/or stay in Latin letters.
 * Exempts the key from the "identical to English" AND the script check.
 */
export const KEEP_ENGLISH: Readonly<Record<string, readonly string[]>> = {
  // ── The original eight — reviewed legacy values (cognates, loanwords,
  //    gaming abbreviations) when the parity test was introduced ──
  de: [
    'ok', 'pvp.okay', 'pvp.arena', 'pvp.host', 'lv', 'stages.stage_43', 'spinner.spinnerLabel',
    'arenas.lava', 'elements.psi', 'elements.neutral',
    'skins.chip', 'skins.wulf', 'skins.prisma', 'skins.tornado', 'skins.salamaner', 'skins.piranha',
    'skins.teleporter', 'skins.dark', 'skins.tsunami', 'skins.sandstorm', 'skins.ninja', 'skins.taiko',
    'sfc.BattlePass.battlePass', 'sfc.BattlePass.max', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.CombatLog.short',
    'sfc.CombatLog.spinner', 'sfc.CombatLog.whoSpinner', 'sfc.OptionsModal.audio',
    'sfc.SpinnerConfigModal.bladeLabel'
  ],
  es: [
    'ok', 'pvp.arena', 'pvp.honor', 'stages.stage_43', 'arenas.lava', 'elements.metal', 'elements.psi',
    'elements.neutral', 'skins.chip', 'skins.wulf', 'skins.prisma', 'skins.tornado', 'skins.tsunami',
    'skins.sandstorm', 'skins.ninja', 'skins.taiko', 'skins.cactus', 'skins.kraken', 'skins.armadillo',
    'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos',
    'sfc.DailyRewards.dayShort', 'sfc.InAppPurchaseShop.shop.popular', 'sfc.OptionsModal.general',
    'sfc.OptionsModal.audio'
  ],
  fr: [
    'options', 'page', 'elements.nature', 'elements.air', 'skins.nature', 'skins.scorpion', 'skins.pirate',
    'skins.piranha', 'skins.cactus', 'skins.kraken', 'ok', 'stages.stage_43', 'elements.psi', 'skins.chip',
    'skins.wulf', 'skins.prisma', 'skins.tsunami', 'skins.sandstorm', 'skins.ninja', 'skins.taiko',
    'sfc.BattlePass.battlePass', 'sfc.BattlePass.max', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.OptionsModal.audio',
    'sfc.OptionsModal.options', 'sfc.OptionsModal.easy', 'sfc.SpinnerConfigModal.statsLabel'
  ],
  jp: ['ok', 'pvp.okay', 'lv', 'sfc.AdsBlockedModal.adsBlocked.gotIt', 'sfc.BattlePass.max'],
  kr: ['lv', 'sfc.BattlePass.max'],
  ru: [],
  zh: ['lv'],
  // ── New locales: add entries in the translator's batch ──
  // pl: loanwords / proper nouns Polish players use as-is (Arena, Honor, Demon, Tornado, Tsunami,
  //     Ninja, Kraken, Taiko, Hydra, Teleporter), genre names, "Log", "D{n}" (Dzień)
  pl: [
    'pvp.arena', 'pvp.honor', 'skins.wulf', 'skins.demon', 'skins.tornado', 'skins.teleporter', 'skins.dark',
    'skins.tsunami', 'skins.ninja', 'skins.kraken', 'skins.taiko', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.CombatLog.short',
    'sfc.DailyRewards.dayShort'
  ],
  // cs / hr / ro / hu / lt: loanwords that are the native word (Arena, Lava, Demon, Tornado, Tsunami,
  //     Ninja, Kraken, Taiko, Hydra, Teleporter, Scorpion, Cactus, Piranha, Popular), the proper
  //     noun Wulf, genre names (Fidget, Brainrot, Steampunk), "Log", "MAX", "Lv." (hu),
  //     "D{n}" (den / dan / diena)
  cs: [
    'skins.wulf', 'skins.dark', 'skins.tsunami', 'skins.ninja', 'skins.kraken', 'skins.taiko',
    'sfc.BattlePass.max', 'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula',
    'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.CombatLog.short', 'sfc.DailyRewards.dayShort'
  ],
  hr: [
    'pvp.arena', 'arenas.lava', 'skins.wulf', 'skins.demon', 'skins.tornado', 'skins.teleporter',
    'skins.tsunami', 'skins.kraken', 'skins.taiko', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.CombatLog.short',
    'sfc.DailyRewards.dayShort'
  ],
  ro: [
    'skins.wulf', 'skins.scorpion', 'skins.demon', 'skins.piranha', 'skins.tsunami', 'skins.ninja',
    'skins.cactus', 'skins.kraken', 'skins.taiko', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.CombatLog.short',
    'sfc.InAppPurchaseShop.shop.popular'
  ],
  hu: [
    'lv', 'skins.wulf', 'skins.kraken', 'skins.taiko', 'sfc.BattlePass.max', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos'
  ],
  lt: [
    'pvp.arena', 'arenas.lava', 'skins.wulf', 'skins.taiko', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.DailyRewards.dayShort'
  ],
  // it / pt-BR / pt-PT / ca / gl / nl: cognates and loanwords that are the native word (Arena,
  //     Lava, Psi, Tornado, Tsunami, Ninja, Kraken, Taiko, Prisma, Chip…), proper nouns (Wulf),
  //     genre names (Fidget, Brainrot, Steampunk), "D{n}" (dia / día / dag), "Popular", "MAX"
  it: [
    'pvp.arena', 'pvp.host', 'arenas.lava', 'elements.psi', 'skins.chip', 'skins.wulf', 'skins.prisma',
    'skins.tornado', 'skins.piranha', 'skins.tsunami', 'skins.ninja', 'skins.cactus', 'skins.kraken',
    'skins.taiko', 'skins.armadillo', 'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula',
    'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.BattlePass.max', 'sfc.OptionsModal.audio', 'sfc.CombatLog.short'
  ],
  'pt-BR': [
    'pvp.arena', 'arenas.lava', 'elements.psi', 'elements.metal', 'skins.chip', 'skins.wulf', 'skins.prisma',
    'skins.tornado', 'skins.piranha', 'skins.tsunami', 'skins.ninja', 'skins.kraken', 'skins.taiko',
    'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos',
    'sfc.DailyRewards.dayShort', 'sfc.InAppPurchaseShop.shop.popular', 'sfc.CombatLog.short'
  ],
  'pt-PT': [
    'pvp.arena', 'arenas.lava', 'elements.psi', 'elements.metal', 'skins.chip', 'skins.wulf', 'skins.prisma',
    'skins.tornado', 'skins.piranha', 'skins.tsunami', 'skins.ninja', 'skins.kraken', 'skins.taiko',
    'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos',
    'sfc.DailyRewards.dayShort', 'sfc.InAppPurchaseShop.shop.popular', 'sfc.CombatLog.short'
  ],
  ca: [
    'pvp.arena', 'pvp.honor', 'arenas.lava', 'elements.psi', 'skins.wulf', 'skins.prisma', 'skins.tornado',
    'skins.tsunami', 'skins.ninja', 'skins.cactus', 'skins.kraken', 'skins.taiko',
    'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos',
    'sfc.DailyRewards.dayShort', 'sfc.InAppPurchaseShop.shop.popular', 'sfc.OptionsModal.general'
  ],
  gl: [
    'pvp.arena', 'arenas.lava', 'elements.psi', 'elements.metal', 'skins.chip', 'skins.wulf', 'skins.prisma',
    'skins.tornado', 'skins.tsunami', 'skins.ninja', 'skins.kraken', 'skins.taiko',
    'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos',
    'sfc.DailyRewards.dayShort', 'sfc.InAppPurchaseShop.shop.popular'
  ],
  nl: [
    'pvp.arena', 'pvp.host', 'arenas.lava', 'elements.water', 'elements.psi', 'skins.chip', 'skins.wulf',
    'skins.prisma', 'skins.tornado', 'skins.salamaner', 'skins.piranha', 'skins.teleporter', 'skins.dark',
    'skins.tsunami', 'skins.ninja', 'skins.cactus', 'skins.kraken', 'skins.taiko',
    'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos',
    'sfc.BattlePass.battlePass', 'sfc.BattlePass.max', 'sfc.DailyRewards.dayShort', 'sfc.CombatLog.short'
  ],
  // tr / az / uz / lv / vi / el: loanwords that are the native word (Arena, Lava, Metal, Tsunami),
  //     proper nouns (Wulf, Hydra, Kraken), Ninja, genre names (Brainrot, Steampunk), "Lv." (vi)
  tr: [
    'pvp.arena', 'elements.metal', 'skins.wulf', 'skins.tsunami', 'skins.ninja', 'skins.kraken',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos'
  ],
  az: [
    'pvp.arena', 'arenas.lava', 'elements.metal', 'skins.wulf', 'skins.ninja', 'skins.kraken',
    'sfc.BGSkinModal.bg.skins.nebula'
  ],
  uz: [
    'pvp.arena', 'arenas.lava', 'skins.wulf', 'skins.ninja', 'skins.kraken', 'sfc.BGSkinModal.bg.skins.nebula'
  ],
  lv: ['arenas.lava', 'skins.wulf', 'sfc.BGSkinModal.bg.skins.nebula'],
  vi: [
    'lv', 'skins.wulf', 'skins.dark', 'skins.ninja', 'sfc.BGSkinModal.bg.skins.nebula',
    'sfc.BGSkinModal.bg.skins.cosmos'
  ],
  el: ['sfc.BGSkinModal.bg.skins.nebula'], // "Brainrot" — the meme is written in Latin letters
  // sv / nb / da / fi / id / eo: loanwords that are the native word (Arena, Lava, Psi, Neutral, Metal,
  //     Demon, Tornado, Salamander, Tsunami, Sandstorm, Ninja, Kraken, Taiko, Prisma, Pyramid, Ape,
  //     Piranha, Teleporter), proper nouns (Hydra), genre names (Fidget, Brainrot, Steampunk), "MAX",
  //     "HP" (hederspoäng / honorpoentoj), "Log" (da/id), "Lv." and "Battle Pass" (id — the terms
  //     Indonesian players use)
  sv: [
    'pvp.arena', 'arenas.lava', 'elements.psi', 'elements.neutral', 'skins.prisma', 'skins.demon',
    'skins.tornado', 'skins.salamaner', 'skins.dark', 'skins.tsunami', 'skins.sandstorm', 'skins.ninja',
    'skins.kraken', 'skins.taiko', 'skins.pyramid', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.BattlePass.max',
    'sfc.BattlePass.honorAbbr'
  ],
  nb: [
    'pvp.arena', 'arenas.lava', 'elements.psi', 'skins.demon', 'skins.tornado', 'skins.ape', 'skins.salamaner',
    'skins.dark', 'skins.tsunami', 'skins.sandstorm', 'skins.ninja', 'skins.kraken', 'skins.taiko',
    'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos'
  ],
  da: [
    'pvp.arena', 'arenas.lava', 'elements.psi', 'elements.metal', 'elements.neutral', 'skins.tornado',
    'skins.salamaner', 'skins.dark', 'skins.tsunami', 'skins.sandstorm', 'skins.ninja', 'skins.kraken',
    'skins.taiko', 'sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula',
    'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.CombatLog.short'
  ],
  fi: [
    'elements.psi', 'skins.prisma', 'skins.dark', 'skins.ninja', 'skins.taiko', 'sfc.BGSkinModal.bg.skins.nebula',
    'sfc.BGSkinModal.bg.skins.cosmos'
  ],
  id: [
    'lv', 'pvp.arena', 'elements.psi', 'skins.prisma', 'skins.salamaner', 'skins.piranha', 'skins.teleporter',
    'skins.tsunami', 'skins.ninja', 'skins.kraken', 'skins.taiko', 'sfc.BGSkinModal.bg.skins.fidget',
    'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BGSkinModal.bg.skins.cosmos', 'sfc.BattlePass.battlePass',
    'sfc.CombatLog.short'
  ],
  eo: ['sfc.BGSkinModal.bg.skins.fidget', 'sfc.BGSkinModal.bg.skins.nebula', 'sfc.BattlePass.honorAbbr'],
  ar: ['lv'] // "Lv." — the gaming abbreviation, glued to a number in the UI
}
