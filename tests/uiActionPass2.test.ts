// #UX1b — second action-UI pass: rarity names / colours, the claim-all reveal
// fit, the coin-landing pitch, and the hold-to-confirm button's contract
// (hold confirms, a short tap never does, keyboard / AT confirm at once).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { RARITY_HEX, RARITY_ORDER, bestRarity, skinRarity, smasherRarity } from '@/data/smasherRarity'
import { AD_UNLOCK_SKINS, SKINS_PER_TOP, SPECIAL_SKINS, TROPHY_SKINS } from '@/data/skinCatalog'
import { MAX_PLATE, MIN_PLATE, fitPrizeGrid, gridHeight } from '@/use/revealFit'
import { landingPitch } from '@/use/useCoinExplosion'
import FHoldButton from '@/components/atoms/FHoldButton.vue'

const ROOT = join(__dirname, '..')

describe('rarity (presentation only)', () => {
  it('skins: default common, regular rare, ad-unlock super, special epic, trophy legendary', () => {
    for (const list of Object.values(SKINS_PER_TOP)) expect(skinRarity(list[0]!)).toBe('common')
    for (const s of SPECIAL_SKINS) expect(skinRarity(s)).toBe('epic')
    for (const s of AD_UNLOCK_SKINS) expect(skinRarity(s)).toBe('super')
    for (const s of TROPHY_SKINS) expect(skinRarity(s)).toBe('legendary')
    expect(skinRarity('ice')).toBe('rare')
  })

  it('smashers keep their unlock-stage tiers', () => {
    expect([1, 6, 12, 21, 31].map(smasherRarity)).toEqual(['common', 'rare', 'super', 'epic', 'legendary'])
  })

  it('bestRarity picks the highest tier', () => {
    expect(bestRarity(['rare', 'legendary', 'epic'])).toBe('legendary')
    expect(bestRarity([])).toBeNull()
  })

  it('RARITY_HEX mirrors the design tokens behind --rarity-*', () => {
    const tokens = readFileSync(join(ROOT, 'src/assets/css/tailwind.css'), 'utf8')
    const design = readFileSync(join(ROOT, 'src/assets/css/design.sass'), 'utf8')
    for (const tier of RARITY_ORDER) {
      const token = design.match(new RegExp(`--rarity-${tier}: var\\(--color-([a-z]+-\\d+)\\)`))?.[1]
      expect(token, tier).toBeTruthy()
      const hex = tokens.match(new RegExp(`--color-${token}: (#[0-9a-f]{6})`))?.[1]
      expect(RARITY_HEX[tier], tier).toBe(hex)
    }
  })

  it('every rarity tier has a name in en.ts', async () => {
    const en = (await import('@/i18n/locales/en')).default as { rarity: Record<string, string> }
    for (const tier of RARITY_ORDER) expect(en.rarity[tier], tier).toBeTruthy()
  })
})

describe('claim-all reveal fit (fitPrizeGrid)', () => {
  const VIEWPORTS = [[390, 844], [844, 390], [1280, 720], [360, 640], [1920, 1080]] as const

  it('fits any count inside the viewport, never below the minimum plate', () => {
    for (const [w, h] of VIEWPORTS) {
      for (let n = 1; n <= 16; n++) {
        const g = fitPrizeGrid(n, w, h, true)
        expect(g.cols * g.rows).toBeGreaterThanOrEqual(n)
        expect(g.plate).toBeGreaterThanOrEqual(MIN_PLATE)
        expect(g.plate).toBeLessThanOrEqual(MAX_PLATE)
        expect(g.cols * g.plate + (g.cols - 1) * 10, `${n} @ ${w}x${h}`).toBeLessThanOrEqual(w - 32 + 0.5)
        if (g.plate > MIN_PLATE) expect(gridHeight(g), `${n} @ ${w}x${h}`).toBeLessThanOrEqual(h)
      }
    }
  })

  it('a handful of skins is one row; many wrap into balanced rows', () => {
    expect(fitPrizeGrid(3, 390, 844, true).rows).toBe(1)
    expect(fitPrizeGrid(10, 844, 390, true).rows).toBe(1)
    const g = fitPrizeGrid(7, 390, 844, true)
    // Balanced: the last row is never a lone straggler under a full one.
    expect(g.cols * g.rows - 7).toBeLessThan(g.cols)
    expect(7 - (g.rows - 1) * g.cols).toBeGreaterThanOrEqual(Math.floor(g.cols / 2))
  })
})

describe('coin landing ticks', () => {
  it('pitch rises from 1 to 1.5 across the shower', () => {
    expect(landingPitch(1, 20)).toBe(1)
    expect(landingPitch(20, 20)).toBeCloseTo(1.5)
    expect(landingPitch(10, 20)).toBeGreaterThan(landingPitch(9, 20))
  })
})

describe('FHoldButton (hold to confirm)', () => {
  const mk = () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: { holdToConfirm: 'Hold to confirm' } } })
    return mount(FHoldButton, { props: { holdMs: 600 }, slots: { default: 'Reset' }, global: { plugins: [i18n] }, attachTo: document.body })
  }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const down = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', button: 0 }))
  const click = async (el: Element, detail: number) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))
    await Promise.resolve()
  }
  const up = (el: Element) => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch' }))

  it('confirms once the hold completes', async () => {
    const w = mk()
    const btn = w.find('button').element
    down(btn)
    vi.advanceTimersByTime(599)
    expect(w.emitted('confirm')).toBeUndefined()
    vi.advanceTimersByTime(2)
    expect(w.emitted('confirm')).toHaveLength(1)
    w.unmount()
  })

  it('a short tap never confirms and shows the hint', async () => {
    const w = mk()
    const btn = w.find('button')
    down(btn.element)
    vi.advanceTimersByTime(200)
    up(btn.element)
    await click(btn.element, 1)
    vi.advanceTimersByTime(1000)
    expect(w.emitted('confirm')).toBeUndefined()
    await w.vm.$nextTick()
    expect(w.find('.f-hold-hint').classes()).toContain('is-nudged')
    w.unmount()
  })

  it('keyboard / assistive activation (click detail 0) confirms at once', async () => {
    const w = mk()
    await click(w.find('button').element, 0)
    expect(w.emitted('confirm')).toHaveLength(1)
    w.unmount()
  })

  it('the hint is the button description', () => {
    const w = mk()
    const id = w.find('.f-hold-hint').attributes('id')
    expect(id).toBeTruthy()
    expect(w.find('button').attributes('aria-describedby')).toBe(id)
    w.unmount()
  })
})

describe('UI kit screenshot-diff harness', () => {
  it('every kit shot has a committed baseline, and the kit page never ships', () => {
    const page = readFileSync(join(ROOT, 'src/dev/UiKitPage.vue'), 'utf8')
    const shots = [...page.matchAll(/data-kit-shot="([a-z-]+)"/g)].map(m => m[1]!)
    expect(shots.length).toBeGreaterThanOrEqual(6)
    for (const s of shots) {
      expect(() => readFileSync(join(ROOT, 'tools/ui-kit-diff/baseline', `${s}.png`)), s).not.toThrow()
    }
    expect(readFileSync(join(ROOT, 'index.html'), 'utf8')).not.toMatch(/ui-kit|src\/dev/)
  })
})
