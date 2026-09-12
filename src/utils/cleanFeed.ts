// ─── Clean feed — "pure gameplay, no interface" ─────────────────────────────
//
// Portal preview-video specs increasingly read "pure gameplay — no hardcoded
// text, score counters, watermarks, UI or logos". The recording pipeline
// (`tools/preview-video/`) can reach two of the three places our interface
// lives, but not the third:
//
//   DOM (HUD rows, buttons, modals, badges)  → the recorder hides every
//       <body> node except the arena canvas. Nothing needed here.
//   canvas TEXT (damage numbers, HP digits,  → the recorder no-ops
//       the ⚔ATK/🛡DEF label, powerup names)    fillText/strokeText at
//                                               document start.
//   canvas NON-TEXT interface (the HP ring   → ONLY the game can skip these.
//       arc, the selection glow, the hint       That is what this flag is for.
//       pulse, the tutorial arrows)
//
// Switched on with `?clean=1`, and DEV-ONLY: `import.meta.env.DEV` is a
// literal Vite replaces with `false` in every production build, so the whole
// expression folds to `false`, `readFlag` goes unreferenced, and a player's
// bundle carries no way to hide its own interface.
//
// Resolved ONCE at module load. The render loop reads `CLEAN_FEED` a few
// times per frame per blade; re-parsing the query string there would cost a
// URL parse per blade per frame for a value that cannot change.

const readFlag = (name: string): boolean => {
  try {
    return new URLSearchParams(window.location.search).get(name) === '1'
  } catch {
    // Some embedded webviews throw on URLSearchParams with an exotic href.
    // A recording is always a plain localhost URL, so "off" is the safe read.
    return false
  }
}

/** True when the renderer should draw the arena and nothing else. */
export const CLEAN_FEED: boolean = import.meta.env.DEV && readFlag('clean')

/**
 * Escape hatch: keep the per-blade HP rings in an otherwise clean feed
 * (`?clean=1&rings=1`).
 *
 * The ring is a genuinely ambiguous call. It is a health BAR — which is what
 * a strict "no UI, no counters" spec means to exclude — but in a spinner
 * battler it is also a large part of how a viewer reads who is winning.
 * Without it the story still reads (blades flash on impact, die, and leave
 * the arena; fewer blades of your colour = losing), just more slowly.
 *
 * Defaulting to OFF keeps `?clean=1` literally compliant; this flag turns
 * them back on for a portal whose spec is looser, with no code edit and no
 * re-cut of the scenarios.
 */
export const CLEAN_HP_RINGS: boolean = import.meta.env.DEV && readFlag('rings')
