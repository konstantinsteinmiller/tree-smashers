// ─── "Does this build serve rewarded ads at all?" ──────────────────────────
//
// Build-time constant, folded from `import.meta.env.VITE_APP_*` literals
// (never a runtime `flags` param — see resolveAdProvider.ts for why). Script
// code that branches on it (`if`, `&&`, a module-scope ternary) tree-shakes
// per build; a template `v-if` on it does NOT (the SFC compiler wraps it in
// `unref()`, and Rollup does not fold it inside a render function) — pick
// build-only components at module scope instead, as SpinnerArena.vue does. It mirrors the provider choice
// in `resolveAdProvider`: every arm that returns a real AdProvider is an ad
// build; the Noop fallback (itch, Glitch, GamePix, Y8, WaveDash, plain web,
// dev, native without ads) is not.
//
// CrazyGames additionally needs the full-release flag: the CrazyGames
// provider never reports ready on a basic-launch build, so rewarded-only
// content would be unreachable there.
//
// This answers "can a rewarded ad EVER be shown", not "is one loaded now" —
// UI still gates each tap on `isRewardedReady`.

export const HAS_REWARDED_ADS: boolean =
  (import.meta.env.VITE_APP_CRAZY_WEB === 'true' && import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE === 'true')
  || import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true'
  || import.meta.env.VITE_APP_PLAYGAMA === 'true'
  || import.meta.env.VITE_APP_POKI === 'true'
  || import.meta.env.VITE_APP_GAME_MONETIZE === 'true'
  || (import.meta.env.VITE_APP_NATIVE === 'true' && import.meta.env.VITE_APP_SHOW_MEDIATOR_ADS === 'true')
