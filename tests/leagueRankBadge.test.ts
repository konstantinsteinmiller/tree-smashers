// LeagueRankBadge — label on the plaque from 65px, as text beside the icon up to 64px.

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import LeagueRankBadge from '@/components/atoms/LeagueRankBadge.vue'
import { LEAGUE_BADGE_DEFAULT_SIZE, LEAGUE_BADGE_PLAQUE_MIN, LEAGUE_TIERS, leagueBadgeLayout } from '@/use/leagueTiers'

const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: true })
const render = (props: Record<string, unknown>) =>
  mount(LeagueRankBadge, { props, global: { plugins: [i18n()] }, attachTo: document.body })
const tierName = (tier: string) => (en as any).league.tiers[tier] as string

describe('leagueBadgeLayout', () => {
  it('switches from inline text to the plaque at 64/65px', () => {
    expect(LEAGUE_BADGE_PLAQUE_MIN).toBe(65)
    expect(leagueBadgeLayout(47).mode).toBe('inline')
    expect(leagueBadgeLayout(48).mode).toBe('inline')
    expect(leagueBadgeLayout(64).mode).toBe('inline')
    expect(leagueBadgeLayout(64.5).mode).toBe('inline')
    expect(leagueBadgeLayout(65).mode).toBe('plaque')
    expect(leagueBadgeLayout(24).mode).toBe('inline')
    expect(leagueBadgeLayout(128).mode).toBe('plaque')
  })

  it('keeps the icon at the requested size and sizes the inline text legibly', () => {
    for (const s of [16, 24, 32, 47, 48, 64]) {
      const l = leagueBadgeLayout(s)
      expect(l.iconSize).toBe(s)
      expect(l.fontSize).toBeGreaterThanOrEqual(10)
      expect(l.gap).toBeGreaterThan(0)
    }
    expect(leagueBadgeLayout(64)).toEqual({ mode: 'inline', iconSize: 64, fontSize: 27, gap: 8 })
    expect(leagueBadgeLayout(65)).toEqual({ mode: 'plaque', iconSize: 65, fontSize: 0, gap: 0 })
  })

  it('treats a nonsense size as the default (48px → inline)', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(leagueBadgeLayout(bad)).toEqual(leagueBadgeLayout(LEAGUE_BADGE_DEFAULT_SIZE))
      expect(leagueBadgeLayout(bad).mode).toBe('inline')
    }
  })
})

describe('LeagueRankBadge', () => {
  it('at 64px shows the numeral as text and draws no plaque or pips', () => {
    const w = render({ tier: 'gold', size: 64, division: 2 })
    expect(w.get('.lrb__label').text()).toBe('II')
    expect(w.find('.lti__division').exists()).toBe(false)
    expect(w.get('svg').attributes('width')).toBe('64')
    w.unmount()
  })

  it('at 65px draws the plaque and no text', () => {
    const w = render({ tier: 'gold', size: 65, division: 2 })
    expect(w.find('.lrb__label').exists()).toBe(false)
    expect(w.get('.lti__division').text()).toBe('II')
    w.unmount()
  })

  it('shows the Champion position as #N text up to 64px and on the plaque from 65px', () => {
    const small = render({ tier: 'champion', size: 64, position: 12 })
    expect(small.get('.lrb__label').text()).toBe('#12')
    const big = render({ tier: 'champion', size: 65, position: 12 })
    expect(big.find('.lrb__label').exists()).toBe(false)
    expect(big.get('.lti__division').text()).toBe('#12')
    small.unmount()
    big.unmount()
  })

  it('shows no text when there is nothing to label', () => {
    const w = render({ tier: 'wood', size: 24 })
    expect(w.find('.lrb__label').exists()).toBe(false)
    w.unmount()
  })

  it('is one labelled image: the wrapper speaks, the icon and text are hidden', () => {
    for (const size of [24, 48, 64, 65, 96]) {
      for (const tier of LEAGUE_TIERS) {
        const w = render({ tier, size, division: 2, position: 7 })
        const root = w.get('.lrb')
        expect(root.attributes('role')).toBe('img')
        expect(root.attributes('aria-label'))
          .toBe(tier === 'champion' ? `${tierName(tier)} #7` : `${tierName(tier)} II`)
        expect(w.get('svg').attributes('aria-hidden')).toBe('true')
        const label = w.find('.lrb__label')
        if (label.exists()) expect(label.attributes('aria-hidden')).toBe('true')
        w.unmount()
      }
    }
  })
})
