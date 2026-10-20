import { afterEach, describe, expect, it, vi } from 'vitest'

// useUser sweeps CardQuest / interim-build relics at module load. It must not
// take the live lowercase `treesmashers_*` device-local keys with them.
describe('useUser legacy key sweep', () => {
  afterEach(() => localStorage.clear())

  it('removes card* / treeSmashers* relics but keeps treesmashers_* device keys', async () => {
    localStorage.setItem('cardQuestUserLanguage', 'en')
    localStorage.setItem('CardHand', 'x')
    localStorage.setItem('treeSmashersLanguage', 'de')
    localStorage.setItem('treesmashers_uid', 'abcdefgh1234')
    localStorage.setItem('treesmashers_free_2x_used', '1')
    localStorage.setItem('treesmashers_free_2x_daily', '2026-09-30')
    vi.resetModules()
    await import('@/use/useUser')
    expect(localStorage.getItem('cardQuestUserLanguage')).toBeNull()
    expect(localStorage.getItem('CardHand')).toBeNull()
    expect(localStorage.getItem('treeSmashersLanguage')).toBeNull()
    expect(localStorage.getItem('treesmashers_uid')).toBe('abcdefgh1234')
    expect(localStorage.getItem('treesmashers_free_2x_used')).toBe('1')
    expect(localStorage.getItem('treesmashers_free_2x_daily')).toBe('2026-09-30')
  })
})
