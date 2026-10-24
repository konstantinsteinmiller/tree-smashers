// ─── #UX3 balloon HP — build switch ─────────────────────────────────────────
//
// VITE_APP_BALOON_HP_BAR (the owner's spelling, kept on purpose):
//   'true'  (base .env)  smashers show party BALLOONS tethered to the far rim
//                        of their disc instead of the HP bar (@/use/balloonHp);
//   'false'              smashers keep today's HP gauge (@/use/hpGauge),
//                        exactly as before — the revert switch.
// Unset counts as ON, like the #UX100 interstitial switches: the .env files
// are git-ignored and CI builds run without them. A SET value must be exactly
// 'true' or 'false' (vite.config.ts asserts it). Tree towers keep the gauge in
// both modes. Purely visual / audio: never physics, gameplayRand or the PvP
// state hash.

/** Parse the raw env value (unset / '' / 'true' → on, 'false' → off). */
export const balloonHpEnabled = (raw: string | undefined): boolean => raw !== 'false'

/** Frozen at boot: smashers show balloons (true) or the HP gauge (false). */
export const BALLOON_HP_BUILD: boolean = balloonHpEnabled(import.meta.env.VITE_APP_BALOON_HP_BAR)
