import { afterEach, describe, expect, it, vi } from 'vitest'

describe('useRewardReveal', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@/use/useCurrency')
    vi.useRealTimers()
  })

  it('merges coins, keeps diamonds on a two-currency build, puts skins first, drops zeros', async () => {
    vi.doMock('@/use/useCurrency', () => ({
      displayDiamondReward: (d: number) => ({ currency: 'diamonds', amount: d })
    }))
    const { resolveRevealItems } = await import('@/use/useRewardReveal')
    expect(resolveRevealItems([
      { kind: 'coins', amount: 100 },
      { kind: 'diamonds', amount: 0 },
      { kind: 'diamonds', amount: 3 },
      { kind: 'coins', amount: 50 },
      { kind: 'skin', modelId: 'bear' }
    ])).toEqual([
      { kind: 'skin', modelId: 'bear' },
      { kind: 'coins', amount: 150 },
      { kind: 'diamonds', amount: 3 }
    ])
  })

  it('shows diamonds as coins on a single-currency build', async () => {
    vi.doMock('@/use/useCurrency', () => ({
      displayDiamondReward: (d: number) => ({ currency: 'coins', amount: d * 100 })
    }))
    const { resolveRevealItems } = await import('@/use/useRewardReveal')
    expect(resolveRevealItems([{ kind: 'coins', amount: 20 }, { kind: 'diamonds', amount: 2 }]))
      .toEqual([{ kind: 'coins', amount: 220 }])
  })

  it('queues reveals one at a time and resolves each on dismissal', async () => {
    vi.useFakeTimers()
    const m = await import('@/use/useRewardReveal')
    m.__resetRevealQueue()
    let a = false
    let b = false
    void m.revealRewards([{ kind: 'coins', amount: 1 }]).then(() => { a = true })
    void m.revealRewards([{ kind: 'coins', amount: 2 }]).then(() => { b = true })
    expect(m.currentReveal.value?.items).toEqual([{ kind: 'coins', amount: 1 }])
    m.finishReveal()
    await Promise.resolve()
    expect(a).toBe(true)
    expect(b).toBe(false)
    vi.advanceTimersByTime(300)
    expect(m.currentReveal.value?.items).toEqual([{ kind: 'coins', amount: 2 }])
    m.finishReveal()
    await Promise.resolve()
    expect(b).toBe(true)
  })

  it('resolves immediately when nothing was granted', async () => {
    const m = await import('@/use/useRewardReveal')
    m.__resetRevealQueue()
    await m.revealRewards([{ kind: 'coins', amount: 0 }])
    expect(m.currentReveal.value).toBeNull()
  })
})
