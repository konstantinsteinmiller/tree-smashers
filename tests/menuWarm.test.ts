import { describe, it, expect, vi } from 'vitest'

describe('menuWarm', () => {
  it('is idempotent and never throws without a network-quiet signal (jsdom)', async () => {
    const q = await import('@/use/nextStageArt')
    const spy = vi.spyOn(q, 'whenNetworkQuiet').mockResolvedValue(false)
    const { warmMenusWhenIdle } = await import('@/use/menuWarm')
    expect(() => { warmMenusWhenIdle(); warmMenusWhenIdle() }).not.toThrow()
    spy.mockRestore()
  })
})
