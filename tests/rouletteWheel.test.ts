// RouletteWheel — the reward logic is pinned, the look is free to change.
//
// The wheel was redrawn from a flat canvas pie into a painted prize wheel
// (rim, pointer, hub, chasing bulbs). None of that may move a single reward:
// which segments exist, their weights, which one the weighted roll picks, what
// is emitted, what `buySkin` grants, and the ad-respin path.
//
// `fixtures/roulette-outcomes.json` was recorded from the PRE-redesign
// component (the flat canvas wheel) by running this file with
// `ROULETTE_GOLDEN=write`. Every case seeds `Math.random`, so the recorded
// outcome is a function of the seed alone — if the redesign changes what a
// seed produces, it changed the reward logic (or the order it draws random
// numbers in, which for a seeded replay is the same thing).
//
// The catalog is mocked on purpose: the real skin catalog grows every few
// weeks, and a golden file keyed to it would fail for reasons that have
// nothing to do with the wheel.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const owned = new Set<string>()
const buySkin = vi.fn()
const isRewardedReady = ref(false)
const showRewardedAd = vi.fn(async () => true)

vi.mock('@/use/useModels', () => ({
  SKINS_PER_TOP: {
    alpha: ['n1', 'n2', 'n3', 'sp1'],
    beta: ['n3', 'n4', 'sp2', 'n5'],
    gamma: ['n6', 'sp3']
  },
  SPECIAL_SKINS: new Set(['sp1', 'sp2', 'sp3']),
  isModelFullyOwned: (id: string) => owned.has(id),
  buySkin: (...args: unknown[]) => buySkin(...args),
  modelImgPath: (id: string) => `data:image/png;portrait=${id}`
}))
vi.mock('@/use/useAds', () => ({
  isRewardedReady,
  showRewardedAd: (...args: unknown[]) => showRewardedAd(...(args as []))
}))
vi.mock('@/use/useUser', () => ({ isNative: false }))
vi.mock('@/use/useAssets', () => {
  const images = new Map<string, HTMLImageElement>()
  return {
    resourceCache: { images, audio: new Map(), audioBuffers: new Map() },
    getCachedImage: (src: string) => {
      let img = images.get(src)
      if (!img) {
        img = new Image()
        img.src = src
        images.set(src, img)
      }
      return img
    }
  }
})

const RouletteWheel = (await import('@/components/organisms/RouletteWheel.vue')).default

const GOLDEN = resolve(__dirname, 'fixtures/roulette-outcomes.json')

/** Park–Miller-style LCG — the same stream on every run, every machine. */
const seeded = (seed: number) => {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 48271) % 0x7fffffff + 0x7fffffff) % 0x7fffffff
    return (s - 1) / 0x7ffffffe
  }
}

const i18n = () =>
  createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })

interface SegmentShape {
  kind: string;
  label: string;
  weight: number;
  result: unknown
}

interface Outcome {
  seed: number
  ownedCount: number
  adReady: boolean
  segments: SegmentShape[]
  respinSegments?: SegmentShape[]
  emitted: unknown[]
  bought: unknown[][]
  randomCalls: number
}

const shape = (segs: any[]): SegmentShape[] =>
  segs.map(s => ({ kind: s.kind, label: s.label, weight: s.weight, result: JSON.parse(JSON.stringify(s.result)) }))

/** The segment index sitting under the top pointer at `rotation` (radians).
 *  Segment i spans [i·arc, (i+1)·arc] in wheel space and the pointer is at
 *  -π/2 in screen space, so the wheel-space angle under it is -π/2 - rotation. */
const indexUnderPointer = (rotation: number, count: number): number => {
  const arc = (Math.PI * 2) / count
  const TAU = Math.PI * 2
  const a = (((-Math.PI / 2 - rotation) % TAU) + TAU) % TAU
  return Math.floor(a / arc) % count
}

const OWNED_SETS: string[][] = [
  [],
  ['n1'],
  ['n1', 'n2', 'n3', 'n4'],
  ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'],
  ['sp1', 'sp2', 'sp3'],
  ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'sp1', 'sp2', 'sp3']
]

/** What the respin contract adds on top of the golden record. Since the
 *  respin became an ADDITIONAL reward, the wheel emits one `result` per spin
 *  (the first as soon as it lands, before the ad is offered) and then `done`.
 *  The golden file was recorded when only the final spin was emitted, so the
 *  golden comparison uses the spin it recorded — the LAST one — and the first
 *  spin's grant is pinned separately (see "Spin Again adds a second reward"). */
interface RespinTrace {
  emittedAll: unknown[]
  boughtAll: unknown[][]
  /** buySkin calls made before `showRewardedAd` was called. */
  boughtBeforeAd: unknown[][] | null
  /** `result` emissions before `showRewardedAd` was called. */
  emittedBeforeAd: number | null
  doneCount: number
}

const runCase = async (seed: number, ownedSet: string[], adReady: boolean): Promise<{
  outcome: Outcome;
  wrapper: any;
  rotationAtRest: number;
  trace: RespinTrace
}> => {
  owned.clear()
  ownedSet.forEach(id => owned.add(id))
  buySkin.mockClear()
  showRewardedAd.mockClear()
  isRewardedReady.value = adReady

  const rnd = seeded(seed)
  let randomCalls = 0
  vi.spyOn(Math, 'random').mockImplementation(() => {
    randomCalls++
    return rnd()
  })

  const wrapper = mount(RouletteWheel, { global: { plugins: [i18n()] }, attachTo: document.body })
  const vm = wrapper.vm as any
  const segments = shape(vm.segments)

  // mount → rAF → 500 ms → spin (≤ 4.5 s) → 600 ms → emit
  for (let i = 0; i < 400 && !wrapper.emitted('result') && !vm.showAdButton; i++) {
    vi.advanceTimersByTime(20)
    await nextTick()
  }
  const rotationAtRest = vm.currentRotation as number
  let respinSegments: SegmentShape[] | undefined
  let boughtBeforeAd: unknown[][] | null = null
  let emittedBeforeAd: number | null = null
  let firstSpinBuys = 0
  if (vm.showAdButton) {
    firstSpinBuys = buySkin.mock.calls.length
    showRewardedAd.mockImplementationOnce(async () => {
      boughtBeforeAd = buySkin.mock.calls.map(c => [...c])
      emittedBeforeAd = (wrapper.emitted('result') ?? []).length
      return true
    })
    const btn = wrapper.findAll('button').find((b: any) => b.text().toLowerCase().includes('spinagain'))
    await btn!.trigger('click')
    await flushPromises()
    respinSegments = shape(vm.segments)
    for (let i = 0; i < 400 && !wrapper.emitted('done'); i++) {
      vi.advanceTimersByTime(20)
      await nextTick()
    }
  }
  vi.advanceTimersByTime(1000)
  await nextTick()

  const emittedAll = (wrapper.emitted('result') ?? []).map(e => JSON.parse(JSON.stringify(e[0])))
  const boughtAll = buySkin.mock.calls.map(c => [...c])
  const outcome: Outcome = {
    seed,
    ownedCount: ownedSet.length,
    adReady,
    segments,
    ...(respinSegments ? { respinSegments } : {}),
    emitted: respinSegments ? emittedAll.slice(1) : emittedAll,
    bought: respinSegments ? boughtAll.slice(firstSpinBuys) : boughtAll,
    randomCalls
  }
  const trace: RespinTrace = {
    emittedAll,
    boughtAll,
    boughtBeforeAd,
    emittedBeforeAd,
    doneCount: (wrapper.emitted('done') ?? []).length
  }
  return { outcome, wrapper, rotationAtRest, trace }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
  // jsdom logs "Not implemented: HTMLCanvasElement.prototype.getContext" on
  // every call; the drawing is not what this file tests.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const CASES: { seed: number; ownedSet: string[]; adReady: boolean }[] = []
for (let seed = 1; seed <= 120; seed++) {
  CASES.push({ seed, ownedSet: OWNED_SETS[seed % OWNED_SETS.length]!, adReady: seed % 4 === 0 })
}

describe('RouletteWheel reward logic', () => {
  it('replays the recorded outcomes of the pre-redesign wheel, seed for seed', async () => {
    const outcomes: Outcome[] = []
    for (const c of CASES) {
      const { outcome, wrapper } = await runCase(c.seed, c.ownedSet, c.adReady)
      outcomes.push(outcome)
      wrapper.unmount()
    }
    if (process.env.ROULETTE_GOLDEN === 'write') {
      writeFileSync(GOLDEN, JSON.stringify(outcomes, null, 1) + '\n')
      return
    }
    expect(existsSync(GOLDEN)).toBe(true)
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Outcome[]
    expect(outcomes.length).toBe(golden.length)
    for (let i = 0; i < golden.length; i++) {
      expect(outcomes[i], `seed ${golden[i]!.seed}`).toEqual(golden[i])
    }
  })

  it('splits the multiplier outcomes 0.75x 1/8, 1x 27.5%, 2x 40%, 3x 20%', async () => {
    const { wrapper } = await runCase(1, OWNED_SETS[5]!, false)
    const share: Record<string, number> = {}
    for (const s of (wrapper.vm as any).segments) {
      if (s.kind !== 'multiplier') continue
      share[s.label] = (share[s.label] ?? 0) + s.weight
    }
    expect(Object.keys(share).sort()).toEqual(['0.75x', '1x', '2x', '3x'])
    expect(share['0.75x']).toBeCloseTo(12.5)
    expect(share['1x']).toBeCloseTo(27.5)
    expect(share['2x']).toBeCloseTo(40)
    expect(share['3x']).toBeCloseTo(20)
    wrapper.unmount()
  })

  it('always stops with the emitted segment under the pointer', async () => {
    for (const c of CASES.filter(x => !x.adReady).slice(0, 40)) {
      const { outcome, wrapper, rotationAtRest } = await runCase(c.seed, c.ownedSet, false)
      const vm = wrapper.vm as any
      const idx = indexUnderPointer(rotationAtRest, vm.segments.length)
      expect(outcome.emitted.length).toBe(1)
      expect(vm.segments[idx].result).toEqual(outcome.emitted[0])
      wrapper.unmount()
    }
  })
})

// ─── "Spin Again" is an ADDITIONAL reward ─────────────────────────────────
//
// The respin used to REPLACE the first spin: the first result was held back
// until the player chose, and a watched ad threw it away. Now every spin is
// granted the moment it lands — the first one before the ad is even offered —
// so the respin can only add a second reward on top.

const spinUntil = async (wrapper: any, stop: () => boolean) => {
  for (let i = 0; i < 400 && !stop(); i++) {
    vi.advanceTimersByTime(20)
    await nextTick()
  }
}

const mountWheel = async (seed: number, ownedSet: string[]) => {
  owned.clear()
  ownedSet.forEach(id => owned.add(id))
  buySkin.mockReset()
  showRewardedAd.mockReset()
  showRewardedAd.mockImplementation(async () => true)
  isRewardedReady.value = true
  const rnd = seeded(seed)
  vi.spyOn(Math, 'random').mockImplementation(() => rnd())
  const wrapper = mount(RouletteWheel, { global: { plugins: [i18n()] }, attachTo: document.body })
  const vm = wrapper.vm as any
  await spinUntil(wrapper, () => !!vm.showAdButton || !!wrapper.emitted('done'))
  return { wrapper, vm }
}

const respinButton = (wrapper: any) =>
  wrapper.findAll('button').find((b: any) => b.text().toLowerCase().includes('spinagain'))

describe('RouletteWheel "Spin Again" adds a second reward', () => {
  it('grants the first spin before the ad, then the respin on top; done once', async () => {
    const respinCases = CASES.filter(c => c.adReady)
    expect(respinCases.length).toBeGreaterThan(0)
    for (const c of respinCases) {
      const { outcome, wrapper, rotationAtRest, trace } = await runCase(c.seed, c.ownedSet, true)
      // Both spins emitted, in order, and the wheel finished exactly once.
      expect(trace.emittedAll.length, `seed ${c.seed}`).toBe(2)
      expect(trace.doneCount).toBe(1)
      // The first grant is the segment the first spin stopped on.
      const idx = indexUnderPointer(rotationAtRest, outcome.segments.length)
      expect(trace.emittedAll[0]).toEqual(outcome.segments[idx]!.result)
      // …and it was handed over BEFORE the ad was requested.
      expect(trace.emittedBeforeAd).toBe(1)
      const first = trace.emittedAll[0] as any
      if (first.type === 'skin') {
        expect(trace.boughtBeforeAd).toEqual([[first.skin.topPartId, first.skin.modelId]])
      } else {
        expect(trace.boughtBeforeAd).toEqual([])
      }
      // Every emitted skin was bought exactly once — nothing granted twice.
      const skins = trace.emittedAll.filter((r: any) => r.type === 'skin').map((r: any) => [r.skin.topPartId, r.skin.modelId])
      expect(trace.boughtAll).toEqual(skins)
      wrapper.unmount()
    }
  })

  it('flushes the save before the ad plays', async () => {
    const order: string[] = []
    const flush = vi.fn(async () => {
        order.push('flush')
      })
    ;(window as any).__saveManager = { flush }
    try {
      const { wrapper, vm } = await mountWheel(4, [])
      expect(vm.showAdButton).toBe(true)
      expect(wrapper.emitted('result')!.length).toBe(1)
      showRewardedAd.mockImplementation(async () => {
        order.push('ad')
        return true
      })
      await respinButton(wrapper)!.trigger('click')
      await flushPromises()
      expect(order).toEqual(['flush', 'ad'])
      wrapper.unmount()
    } finally {
      delete (window as any).__saveManager
    }
  })

  it('a skipped / unfilled ad keeps the first reward and adds nothing', async () => {
    const { wrapper } = await mountWheel(4, [])
    showRewardedAd.mockImplementation(async () => false)
    await respinButton(wrapper)!.trigger('click')
    await flushPromises()
    await spinUntil(wrapper, () => !!wrapper.emitted('done'))
    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(wrapper.emitted('result')!.length).toBe(1)
    expect(wrapper.emitted('done')!.length).toBe(1)
    wrapper.unmount()
  })

  it('"Skip" keeps the first reward, emits it once, and finishes', async () => {
    const { wrapper } = await mountWheel(4, [])
    const skip = wrapper.findAll('button').find((b: any) => b.text().toLowerCase().includes('skip'))
    await skip!.trigger('click')
    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(showRewardedAd).not.toHaveBeenCalled()
    expect(wrapper.emitted('result')!.length).toBe(1)
    expect(wrapper.emitted('done')!.length).toBe(1)
    wrapper.unmount()
  })

  it('a double tap on "Spin Again" plays one ad and pays one respin', async () => {
    const { wrapper } = await mountWheel(4, [])
    const btn = respinButton(wrapper)!
    await Promise.all([btn.trigger('click'), btn.trigger('click')])
    await flushPromises()
    await spinUntil(wrapper, () => !!wrapper.emitted('done'))
    vi.advanceTimersByTime(5000)
    await nextTick()
    expect(showRewardedAd).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('result')!.length).toBe(2)
    expect(wrapper.emitted('done')!.length).toBe(1)
    wrapper.unmount()
  })

  it('a skin won on the first spin is not on the respin wheel (duplicate rule)', async () => {
    // Real ownership: buySkin marks the skin owned, as the store does.
    let found = false
    for (let seed = 1; seed <= 600 && !found; seed++) {
      const { wrapper, vm } = await mountWheel(seed, [])
      buySkin.mockImplementation((_top: unknown, id: unknown) => {
        owned.add(id as string)
      })
      const first = wrapper.emitted('result')?.[0]?.[0] as any
      if (!first || first.type !== 'skin' || !vm.showAdButton) {
        wrapper.unmount()
        vi.restoreAllMocks()
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
        continue
      }
      // The first spin's grant ran before this mockImplementation was set, so
      // mark it owned the way the real buySkin would have.
      owned.add(first.skin.modelId)
      found = true
      await respinButton(wrapper)!.trigger('click')
      await flushPromises()
      const respinSkins = (vm.segments as any[]).filter(s => s.kind === 'skin').map(s => s.result.skin.modelId)
      expect(respinSkins).not.toContain(first.skin.modelId)
      await spinUntil(wrapper, () => !!wrapper.emitted('done'))
      const second = wrapper.emitted('result')![1]![0] as any
      if (second.type === 'skin') expect(second.skin.modelId).not.toBe(first.skin.modelId)
      wrapper.unmount()
    }
    expect(found).toBe(true)
  })
})

// ─── What each landed spin pays (the parent's grant) ──────────────────────
describe('roulette grants: a respin ADDS to the first spin', () => {
  it('pays each spin on its own; two spins sum, neither replaces the other', async () => {
    const { rouletteGrantFor } = await import('@/use/rouletteGrants')
    const base = 140
    const first = rouletteGrantFor({ type: 'multiplier', multiplier: 2 }, base)
    const second = rouletteGrantFor({ type: 'multiplier', multiplier: 0.75 }, base)
    expect(first.coins).toBe(280)
    expect(second.coins).toBe(105)
    expect(first.coins + second.coins).toBe(385)

    const skin = rouletteGrantFor({ type: 'skin', skin: { topPartId: 'alpha' as any, modelId: 'n1' as any } }, base)
    expect(skin.coins).toBe(base) // the skin comes with the 1x coins
    expect(skin.skin).toEqual({ topPartId: 'alpha', modelId: 'n1' })

    // The jackpot pays its fixed coins (it paid 5 diamonds until 2026-10-21).
    const jackpot = rouletteGrantFor({ type: 'jackpot', coins: 15000 }, base)
    expect(jackpot).toEqual({ type: 'jackpot', multiplier: 1, skin: null, coins: 15000 })
  })
})

// ─── Skin Chest roulette (`mode="skins"`) ───────────────────────────────────
// A ripe Skin Chest opens this wheel: unowned skins only, the chest's previewed
// skin at 3x the chance of every other skin, the boss wheel's ad respin.
describe('RouletteWheel mode="skins" (Skin Chest roulette)', () => {
  const FEATURED = { topPartId: 'alpha', modelId: 'n2' }

  const mountSkins = (ownedSet: string[], featured: unknown = FEATURED) => {
    owned.clear()
    ownedSet.forEach(id => owned.add(id))
    buySkin.mockClear()
    showRewardedAd.mockClear()
    return mount(RouletteWheel, {
      props: { mode: 'skins', featuredSkin: featured },
      global: { plugins: [i18n()] },
      attachTo: document.body
    })
  }

  const runToRest = async (wrapper: any) => {
    const vm = wrapper.vm as any
    for (let i = 0; i < 400 && !wrapper.emitted('result') && !vm.showAdButton; i++) {
      vi.advanceTimersByTime(20)
      await nextTick()
    }
  }

  it('carries only unowned skins — no coins, no jackpot — with the featured skin at 3x weight', () => {
    const wrapper = mountSkins(['n1'])
    const segs = (wrapper.vm as any).segments as any[]
    expect(segs.every(s => s.kind === 'skin')).toBe(true)
    const ids = segs.map(s => s.result.skin.modelId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('n1')
    const featured = segs.filter(s => s.result.skin.modelId === 'n2')
    expect(featured).toHaveLength(1)
    expect(featured[0].weight).toBe(3)
    for (const s of segs) if (s !== featured[0]) expect(s.weight).toBe(1)
    expect(segs.length).toBeLessThanOrEqual(8)
    wrapper.unmount()
  })

  it('lands the featured skin about 3x as often as any other skin', async () => {
    const wins: Record<string, number> = {}
    let total = 0
    for (let seed = 1; seed <= 160; seed++) {
      const rnd = seeded(seed)
      vi.spyOn(Math, 'random').mockImplementation(() => rnd())
      isRewardedReady.value = false
      const wrapper = mountSkins(['n1', 'n3', 'n4', 'n5', 'n6', 'sp1'])
      await runToRest(wrapper)
      const res = wrapper.emitted('result')![0]![0] as any
      wins[res.skin.modelId] = (wins[res.skin.modelId] ?? 0) + 1
      total++
      expect(buySkin).toHaveBeenCalledWith(res.skin.topPartId, res.skin.modelId)
      wrapper.unmount()
      vi.restoreAllMocks()
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
    }
    // n2 (3) vs n... others: sp2, sp3 (1 each) → expected 3/5 = 60 %.
    expect(wins['n2']! / total).toBeGreaterThan(0.45)
    expect(wins['n2']! / total).toBeLessThan(0.75)
  })

  it('a featured skin that is already owned is not on the wheel', () => {
    const wrapper = mountSkins(['n2'])
    const ids = ((wrapper.vm as any).segments as any[]).map(s => s.result.skin.modelId)
    expect(ids).not.toContain('n2')
    expect(ids.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('offers the ad respin and rebuilds the wheel without the skin just won', async () => {
    isRewardedReady.value = true
    const wrapper = mountSkins([])
    const vm = wrapper.vm as any
    await runToRest(wrapper)
    expect(vm.showAdButton).toBe(true)
    const first = (wrapper.emitted('result')![0]![0] as any).skin.modelId
    owned.add(first) // the wheel's buySkin is mocked; mirror the grant
    const btn = wrapper.findAll('button').find((b: any) => b.text().toLowerCase().includes('spinagain'))
    await btn!.trigger('click')
    await flushPromises()
    const ids = (vm.segments as any[]).map(s => s.result.skin.modelId)
    expect(ids).not.toContain(first)
    for (let i = 0; i < 400 && !wrapper.emitted('done'); i++) {
      vi.advanceTimersByTime(20)
      await nextTick()
    }
    expect(wrapper.emitted('result')).toHaveLength(2)
    expect(wrapper.emitted('done')).toHaveLength(1)
    wrapper.unmount()
  })

  it('no respin when the first spin won the last unowned skin', async () => {
    isRewardedReady.value = true
    const all = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'sp1', 'sp2', 'sp3']
    const wrapper = mountSkins(all.filter(id => id !== 'n2'))
    // The mocked buySkin doesn't touch `owned`; make the landing skin owned.
    buySkin.mockImplementation((_t: unknown, id: unknown) => { owned.add(id as string) })
    await runToRest(wrapper)
    expect((wrapper.vm as any).showAdButton).toBe(false)
    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(wrapper.emitted('done')).toHaveLength(1)
    buySkin.mockReset()
    wrapper.unmount()
  })
})
