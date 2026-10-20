// ─── Skills flag ON: the same arena shows the skill UI ──────────────────────
//
// The counterpart of tests/skillsFlagOff.test.ts: the identical mount, with
// skills ON, loads the skill glue through the gate and shows the surfaces the
// off-suite asserts are absent — the Team button's NEW dot and the Team
// modal's SKILLS row — so those selectors are proven live, not vacuous. The
// full intro → learn → HUD chip flow is exercised in a real browser by the
// dev e2e (see the batch-3 D report); the engine side by skillsEngine.test.

import { describe, it, expect, vi } from 'vitest'
import './helpers/skillsBuild'
// Import useUser FIRST (useMatch <-> useModels <-> useUser import cycle).
import '@/use/useUser'
import { mountArena } from './helpers/arenaHarness'

vi.mock('/images/icons/movie_128x96.webp', () => ({ default: '/images/icons/movie_128x96.webp' }))
vi.mock('/images/logo/logo_256x256.webp', () => ({ default: '/images/logo/logo_256x256.webp' }))
vi.mock('/images/icons/chest_128x128.webp', () => ({ default: '/images/icons/chest_128x128.webp' }))
vi.mock('/images/icons/trophy_128x128.webp', () => ({ default: '/images/icons/trophy_128x128.webp' }))

// Same returning player as the off-suite (stage 40).
const SEED: Record<string, string> = vi.hoisted(() => {
  const seed: Record<string, string> = {
    smashers_campaign_stage: '40',
    smashers_player_max_stage: '40',
    smashers_coins: '5000',
    smashers_first_win: '1',
    smashers_intro_seen: '1',
    smashers_config_opened: '1'
  }
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  return seed
})

describe('SpinnerArena, flag on', () => {
  it('loads the skill glue and the Team modal shows the selected smasher\'s three skills', async () => {
    const gate = await import('@/skills/skillsGate')
    expect(gate.SKILLS_BUILD).toBe(true)
    const arena = await mountArena(SEED)
    try {
      expect(document.querySelector('.stage-badge')?.textContent).toContain('40')
      await arena.openTeam()
      expect(await arena.waitFor('[data-testid="smasher-detail"]')).toBe(true)
      expect(await arena.waitFor('[data-testid="smasher-skills"]')).toBe(true)
      expect(document.querySelectorAll('[data-testid="smasher-skills"] .skill-row').length).toBe(3)
    } finally {
      arena.unmount()
    }
  }, 60_000)
})
