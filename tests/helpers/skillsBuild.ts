// ─── Skills-build test harness ──────────────────────────────────────────────
//
// The skill system is a BUILD-time feature (src/skills/skillsGate.ts reads
// VITE_APP_FEATURE_SKILLS once, when the gate module is evaluated) and the
// engine only rolls skills once the skill port is installed — in the game the
// arena installs it after loading it through the gate.
//
// Import this module FIRST in a test that needs skills on (before anything
// that pulls in the gate), then call `installSkillPort()` after the engine
// module the test drives has been imported (again after every
// `vi.resetModules()`).

import { vi } from 'vitest'

vi.stubEnv('VITE_APP_FEATURE_SKILLS', 'true')

/** Install the real skill port into the CURRENT `useSpinnerGame` module. */
export const installSkillPort = async (): Promise<void> => {
  const [game, port] = await Promise.all([
    import('@/use/useSpinnerGame'),
    import('@/use/skills/skillEngine')
  ])
  game.installSkillEngine(port)
}
