import { afterEach, describe, expect, it, vi } from 'vitest'

// useUser sweeps CardQuest / interim-build relics at module load. It must not
// take the live lowercase `chaosarena_*` device-local keys with them.
describe('useUser legacy key sweep', () => {
  afterEach(() => localStorage.clear())

  it('removes card* / chaosArena* relics but keeps chaosarena_* device keys', async () => {
    localStorage.setItem('cardQuestUserLanguage', 'en')
    localStorage.setItem('CardHand', 'x')
    localStorage.setItem('chaosArenaLanguage', 'de')
    localStorage.setItem('chaosarena_uid', 'abcdefgh1234')
    localStorage.setItem('chaosarena_free_2x_used', '1')
    localStorage.setItem('chaosarena_free_2x_daily', '2026-09-30')
    vi.resetModules()
    await import('@/use/useUser')
    expect(localStorage.getItem('cardQuestUserLanguage')).toBeNull()
    expect(localStorage.getItem('CardHand')).toBeNull()
    expect(localStorage.getItem('chaosArenaLanguage')).toBeNull()
    expect(localStorage.getItem('chaosarena_uid')).toBe('abcdefgh1234')
    expect(localStorage.getItem('chaosarena_free_2x_used')).toBe('1')
    expect(localStorage.getItem('chaosarena_free_2x_daily')).toBe('2026-09-30')
  })
})
