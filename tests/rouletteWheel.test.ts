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
  modelImgPath: (id: string) => `images/models/${id}_256x256.webp`
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

const runCase = async (seed: number, ownedSet: string[], adReady: boolean): Promise<{
  outcome: Outcome;
  wrapper: any;
  rotationAtRest: number
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
  if (vm.showAdButton) {
    const btn = wrapper.findAll('button').find((b: any) => b.text().toLowerCase().includes('spinagain'))
    await btn!.trigger('click')
    await flushPromises()
    respinSegments = shape(vm.segments)
    for (let i = 0; i < 400 && !wrapper.emitted('result'); i++) {
      vi.advanceTimersByTime(20)
      await nextTick()
    }
  }
  vi.advanceTimersByTime(1000)
  await nextTick()

  const outcome: Outcome = {
    seed,
    ownedCount: ownedSet.length,
    adReady,
    segments,
    ...(respinSegments ? { respinSegments } : {}),
    emitted: (wrapper.emitted('result') ?? []).map(e => JSON.parse(JSON.stringify(e[0]))),
    bought: buySkin.mock.calls.map(c => [...c]),
    randomCalls
  }
  return { outcome, wrapper, rotationAtRest }
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
