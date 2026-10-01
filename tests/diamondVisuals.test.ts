// Phase 2 — diamond visuals: IconDiamond, CoinBadge (coin row + diamond pop),
// the burst VFX (variants, quality tier, live cap, pooling) and the diamond
// fly-to-badge target.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import {
  spawnCoinExplosion,
  flyDiamondsToBadge,
  MAX_LIVE_PARTICLES,
  type CurrencyBadgeTargets
} from '@/use/useCoinExplosion'
import { FX } from '@/use/useQuality'
import { coinArtFailed } from '@/use/coinArt'
import useSpinnerConfig from '@/use/useSpinnerConfig'

/** The burst's explode + fly phases; the first particle lands by +300ms stagger. */
const LANDS_AFTER_MS = 1100
const LANDED_BY_MS = 1400

const popEl = () => document.body.querySelector<HTMLElement>('.coin-badge-pop')

describe('IconDiamond', () => {
  it('renders the plain diamond webp', () => {
    const wrapper = mount(IconDiamond)
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toContain('diamond_256x256.webp')
  })
})

describe('CoinBadge', () => {
  const { addCoins, addDiamonds, coins, diamonds } = useSpinnerConfig()

  beforeEach(() => {
    addCoins(-coins.value) // zero coins
    addDiamonds(-diamonds.value) // zero diamonds
  })

  // The HUD diamond row was deliberately commented out of CoinBadge in 71d4197
  // (the diamond balance is shown in BGSkinModal instead). If the row is
  // brought back, restore the diamond-row assertions below.
  it('shows the coin balance and no HUD diamond row', () => {
    addCoins(42)
    addDiamonds(7)
    const wrapper = mount(CoinBadge)
    expect(wrapper.find('.coin-badge__value').text()).toBe('42')
    expect(wrapper.find('img[alt="diamonds"]').exists()).toBe(false)
    expect(wrapper.find('.coin-badge__value--diamond').exists()).toBe(false)
    wrapper.unmount()
  })

  it('exposes rootEl, diamondRowEl and celebrateDiamonds for fly-to VFX', () => {
    const wrapper = mount(CoinBadge)
    expect(wrapper.vm.rootEl).toBeTruthy()
    // Still exposed, but null while the row is hidden — diamond bursts then
    // fall back to rootEl (see flyDiamondsToBadge below).
    expect('diamondRowEl' in wrapper.vm).toBe(true)
    expect(wrapper.vm.diamondRowEl).toBeNull()
    expect(typeof wrapper.vm.celebrateDiamonds).toBe('function')
    wrapper.unmount()
  })

  it('celebrateDiamonds pops "+N" with the fancy diamond, summing landings while up', async () => {
    const wrapper = mount(CoinBadge)
    wrapper.vm.celebrateDiamonds(3)
    await nextTick()
    let pop = popEl()!
    expect(pop).toBeTruthy()
    expect(pop.getAttribute('aria-hidden')).toBe('true')
    expect(pop.textContent).toContain('+3')
    expect(pop.querySelector('img')!.getAttribute('src')).toContain('diamond-fancy_256x256.webp')
    expect(pop.querySelector('.coin-badge__value--diamond')).toBeTruthy()

    wrapper.vm.celebrateDiamonds(2) // a second burst lands before the pop ends
    await nextTick()
    pop = popEl()!
    expect(pop.textContent).toContain('+5')

    pop.dispatchEvent(new Event('animationend'))
    await nextTick()
    expect(popEl()).toBeNull()
    wrapper.unmount()
  })
})

describe('spawnCoinExplosion', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runAllTimers() // let every burst finish, so the live cap starts at 0
    vi.useRealTimers()
  })

  const pair = () => {
    const source = document.createElement('div')
    const target = document.createElement('div')
    document.body.append(source, target)
    return { source, target }
  }
  const app = () => document.getElementById('app')!

  it('diamond variant spawns diamond-image particles', () => {
    const { source, target } = pair()
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 5, variant: 'diamond' })
    const imgs = app().querySelectorAll('img')
    expect(imgs.length).toBe(5)
    expect(imgs[0]!.getAttribute('src')).toContain('diamond_256x256.webp')
  })

  it('coin variant (default) spawns the painted coin, and the drawn coin after a load error', () => {
    const { source, target } = pair()
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 4 })
    const imgs = [...app().querySelectorAll('img')]
    expect(imgs.length).toBe(4)
    for (const i of imgs) expect(i.getAttribute('src')).toContain('coin_128x128.webp')
    expect(app().querySelectorAll('svg').length).toBe(0)
    // A failing painting swaps that particle to the drawing in place.
    imgs[0]!.dispatchEvent(new Event('error'))
    expect(app().querySelectorAll('svg').length).toBe(1)
    coinArtFailed.value = false
  })

  it('the low quality tier halves the burst', () => {
    const { source, target } = pair()
    FX.low = true
    try {
      spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 14, variant: 'diamond' })
    } finally {
      FX.low = false
    }
    expect(app().querySelectorAll('img').length).toBe(7)
  })

  it('caps live particles across overlapping bursts, but still reports arrival', () => {
    const { source, target } = pair()
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: MAX_LIVE_PARTICLES + 10, variant: 'diamond' })
    expect(app().querySelectorAll('img').length).toBe(MAX_LIVE_PARTICLES)

    const onArrive = vi.fn()
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 14, variant: 'diamond', onArrive })
    expect(app().querySelectorAll('img').length).toBe(MAX_LIVE_PARTICLES)
    vi.advanceTimersByTime(LANDS_AFTER_MS)
    expect(onArrive).toHaveBeenCalledTimes(1)
  })

  it('reuses particle nodes from the pool once a burst finishes', () => {
    const { source, target } = pair()
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 3 })
    const first = new Set(app().children)
    vi.runAllTimers()
    expect(app().children.length).toBe(0)
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 3 })
    const second = [...app().children]
    expect(second.length).toBe(3)
    expect(second.every(el => first.has(el))).toBe(true) // same nodes, not look-alikes
  })

  it('calls onArrive once, when the first particle lands', () => {
    const { source, target } = pair()
    const onArrive = vi.fn()
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 6, onArrive })
    vi.advanceTimersByTime(LANDS_AFTER_MS - 1)
    expect(onArrive).not.toHaveBeenCalled()
    vi.advanceTimersByTime(LANDED_BY_MS - LANDS_AFTER_MS + 1)
    expect(onArrive).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(onArrive).toHaveBeenCalledTimes(1)
  })
})

describe('flyDiamondsToBadge', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('falls back to the badge itself while the diamond row is hidden, as diamonds', async () => {
    const wrapper = mount(CoinBadge)
    const source = document.createElement('div')
    document.body.append(source)

    const target = flyDiamondsToBadge(source, wrapper.vm as unknown as CurrencyBadgeTargets, 2)
    expect(target).toBe(wrapper.vm.rootEl)
    const app = document.getElementById('app')!
    expect(app.querySelectorAll('img').length).toBe(14)
    expect(app.querySelectorAll('svg').length).toBe(0) // never coins

    expect(popEl()).toBeNull()
    vi.advanceTimersByTime(LANDED_BY_MS)
    await nextTick()
    expect(popEl()!.textContent).toContain('+2')
    wrapper.unmount()
  })

  it('flies to the diamond row when the badge renders one', () => {
    const rootEl = document.createElement('div')
    const diamondRowEl = document.createElement('div')
    const celebrateDiamonds = vi.fn()
    const source = document.createElement('div')
    document.body.append(rootEl, diamondRowEl, source)

    expect(flyDiamondsToBadge(source, { rootEl, diamondRowEl, celebrateDiamonds }, 5)).toBe(diamondRowEl)
    vi.advanceTimersByTime(LANDED_BY_MS)
    expect(celebrateDiamonds).toHaveBeenCalledWith(5)
  })

  it('does nothing without a source or a badge', () => {
    const el = document.createElement('div')
    expect(flyDiamondsToBadge(null, { rootEl: el, diamondRowEl: null }, 1)).toBeNull()
    expect(flyDiamondsToBadge(el, null, 1)).toBeNull()
    expect(flyDiamondsToBadge(el, { rootEl: null, diamondRowEl: null }, 1)).toBeNull()
    expect(document.getElementById('app')!.children.length).toBe(0)
  })
})
