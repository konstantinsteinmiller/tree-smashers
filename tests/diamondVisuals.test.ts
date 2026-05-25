// Phase 2 — diamond visuals: IconDiamond, CoinBadge two-row layout, and the
// diamond variant of the burst VFX.

import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import IconDiamond from '@/components/icons/IconDiamond.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import useSpinnerConfig from '@/use/useSpinnerConfig'

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

  it('shows both a coin row and a diamond row (fancy diamond)', () => {
    addCoins(42)
    addDiamonds(7)
    const wrapper = mount(CoinBadge)
    const text = wrapper.text()
    expect(text).toContain('42')
    expect(text).toContain('7')
    const diamondImg = wrapper.find('img[alt="diamonds"]')
    expect(diamondImg.exists()).toBe(true)
    expect(diamondImg.attributes('src')).toContain('diamond-fancy_256x256.webp')
  })

  it('exposes rootEl and diamondRowEl for fly-to VFX targeting', () => {
    const wrapper = mount(CoinBadge)
    expect(wrapper.vm.rootEl).toBeTruthy()
    expect(wrapper.vm.diamondRowEl).toBeTruthy()
  })
})

describe('spawnCoinExplosion variant', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
  })

  it('diamond variant spawns diamond-image particles', () => {
    const source = document.createElement('div')
    const target = document.createElement('div')
    document.body.append(source, target)
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 5, variant: 'diamond' })
    const app = document.getElementById('app')!
    const imgs = app.querySelectorAll('img')
    expect(imgs.length).toBe(5)
    expect(imgs[0]!.getAttribute('src')).toContain('diamond_256x256.webp')
  })

  it('coin variant (default) spawns coin SVG particles, not images', () => {
    const source = document.createElement('div')
    const target = document.createElement('div')
    document.body.append(source, target)
    spawnCoinExplosion({ sourceEl: source, targetEl: target, count: 4 })
    const app = document.getElementById('app')!
    expect(app.querySelectorAll('svg').length).toBe(4)
    expect(app.querySelectorAll('img').length).toBe(0)
  })
})
