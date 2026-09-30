// ─── Bosses100-build test harness ───────────────────────────────────────────
//
// Bosses 100+ is a BUILD-time feature (src/bosses/bosses100Gate.ts reads
// VITE_APP_FEATURE_BOSSES100 once, when the gate module is evaluated; the base
// .env ships it off) and the engine only runs a trait once the trait port is
// installed — in the game the arena installs it after loading it through the
// gate.
//
// Import this module FIRST in a test that needs the feature on (before
// anything that pulls in the gate), then call `installBossPort()` after the
// engine module the test drives has been imported (again after every
// `vi.resetModules()`).

import { vi } from 'vitest'

vi.stubEnv('VITE_APP_FEATURE_BOSSES100', 'true')

/** Install the real boss-trait port into the CURRENT `useSpinnerGame` module. */
export const installBossPort = async (): Promise<void> => {
  const [game, port] = await Promise.all([
    import('@/use/useSpinnerGame'),
    import('@/use/bosses/bossTraitEngine')
  ])
  game.installBossTraitEngine(port)
}
