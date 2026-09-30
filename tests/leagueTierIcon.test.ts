// PvP league tier icons — data contract, rendering, i18n coverage, and the
// guarantee that the dev-only preview page never reaches a production bundle.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import LeagueTierIcon from '@/components/atoms/LeagueTierIcon.vue'
import {
  LEAGUE_DIVISIONS, LEAGUE_TIERS, LEAGUE_TIER_META, championPosition, compareTiers, divisionNumeral, isLeagueTier,
  plaqueLabel, tierRank, type LeagueTier
} from '@/use/leagueTiers'

const ROOT = path.resolve(__dirname, '..')

describe('league tier metadata', () => {
  it('has the seven tiers, lowest first', () => {
    expect([...LEAGUE_TIERS]).toEqual(['wood', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion'])
    LEAGUE_TIERS.forEach((t, i) => expect(tierRank(t)).toBe(i))
  })

  it('orders tiers with compareTiers', () => {
    const shuffled: LeagueTier[] = ['diamond', 'wood', 'champion', 'gold', 'bronze', 'platinum', 'silver']
    expect(shuffled.sort(compareTiers)).toEqual([...LEAGUE_TIERS])
    expect(compareTiers('wood', 'champion')).toBeLessThan(0)
  })

  it('carries an i18n key, an accent and the division/animation flags per tier', () => {
    for (const t of LEAGUE_TIERS) {
      const m = LEAGUE_TIER_META[t]
      expect(m.id).toBe(t)
      expect(m.nameKey).toBe(`league.tiers.${t}`)
      expect(m.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(m.hasDivisions).toBe(t !== 'champion')
      expect(m.animated).toBe(tierRank(t) >= tierRank('gold'))
    }
    expect(Object.isFrozen(LEAGUE_TIER_META)).toBe(true)
  })

  it('guards and numbers divisions', () => {
    expect(isLeagueTier('gold')).toBe(true)
    expect(isLeagueTier('mythic')).toBe(false)
    expect(isLeagueTier(3)).toBe(false)
    expect([...LEAGUE_DIVISIONS]).toEqual([3, 2, 1])
    expect(divisionNumeral('gold', 1)).toBe('I')
    expect(divisionNumeral('gold', 3)).toBe('III')
    expect(divisionNumeral('gold', null)).toBe('')
    expect(divisionNumeral('champion', 1)).toBe('')
  })

  it('reads a Champion leaderboard position, and only for Champion', () => {
    expect(championPosition('champion', 12)).toBe(12)
    expect(championPosition('champion', '#12')).toBe(12)
    expect(championPosition('champion', ' #1234 ')).toBe(1234)
    for (const bad of [0, -3, 1.5, '', '#', 'abc', '#12a', null, undefined, Number.NaN]) {
      expect(championPosition('champion', bad as never), String(bad)).toBeNull()
    }
    for (const t of LEAGUE_TIERS.filter((x) => x !== 'champion')) expect(championPosition(t, 12)).toBeNull()
  })

  it('labels the plaque with the numeral, or #position for Champion', () => {
    expect(plaqueLabel('gold', 2)).toBe('II')
    expect(plaqueLabel('gold', 2, 12)).toBe('II')
    expect(plaqueLabel('gold', null, 12)).toBe('')
    expect(plaqueLabel('champion', 1, '#12')).toBe('#12')
    expect(plaqueLabel('champion', 1)).toBe('')
  })
})

describe('LeagueTierIcon', () => {
  const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: true })
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  afterEach(() => {
    warn.mockClear()
    error.mockClear()
  })

  const render = (props: Record<string, unknown>) =>
    mount(LeagueTierIcon, { props, global: { plugins: [i18n()] }, attachTo: document.body })

  for (const tier of LEAGUE_TIERS) {
    for (const size of [24, 48, 128]) {
      it(`renders ${tier} at ${size}px without warnings`, () => {
        const w = render({ tier, size, division: 2 })
        const svg = w.get('svg')
        expect(svg.attributes('width')).toBe(String(size))
        expect(svg.attributes('role')).toBe('img')
        const name = (en as any).league.tiers[tier] as string
        expect(svg.attributes('aria-label')).toBe(tier === 'champion' ? name : `${name} II`)
        expect(svg.findAll('path, polygon, circle, ellipse').length).toBeGreaterThan(4)
        // Every url(#id) reference resolves inside this icon.
        const html = w.html()
        for (const [, ref] of html.matchAll(/url\(#([^)]+)\)/g)) expect(html).toContain(`id="${ref}"`)
        expect(warn).not.toHaveBeenCalled()
        expect(error).not.toHaveBeenCalled()
        w.unmount()
      })
    }
  }

  it('gives two icons on one page distinct gradient ids', () => {
    const a = render({ tier: 'gold', size: 64 })
    const b = render({ tier: 'gold', size: 64 })
    const idsOf = (h: string) => [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    const shared = idsOf(a.html()).filter((id) => idsOf(b.html()).includes(id))
    expect(shared).toEqual([])
    a.unmount()
    b.unmount()
  })

  it('animates the upper tiers only at full size and only when allowed', () => {
    const moving = render({ tier: 'champion', size: 128 })
    expect(moving.find('.lti__shimmer').exists()).toBe(true)
    expect(moving.classes()).not.toContain('lti--static')
    for (const props of [
      { tier: 'champion', size: 24 },
      { tier: 'champion', size: 128, animated: false },
      { tier: 'bronze', size: 128 }
    ]) {
      const w = render(props)
      expect(w.classes()).toContain('lti--static')
      expect(w.find('.lti__shimmer').exists()).toBe(false)
      w.unmount()
    }
    moving.unmount()
  })

  it('shows a numeral plaque at full size and pips at compact size', () => {
    const big = render({ tier: 'silver', size: 96, division: 1 })
    expect(big.find('.lti__division text').text()).toBe('I')
    const small = render({ tier: 'silver', size: 24, division: 3 })
    expect(small.find('.lti__division text').exists()).toBe(false)
    expect(small.findAll('.lti__division circle').length).toBe(1)
    const champ = render({ tier: 'champion', size: 96, division: 1 })
    expect(champ.find('.lti__division').exists()).toBe(false)
    big.unmount()
    small.unmount()
    champ.unmount()
  })

  // ── Plaque size: small and low, so it only nicks the emblem's tip ──
  const plaqueBox = (w: ReturnType<typeof render>) => {
    const r = w.get('.lti__division rect')
    const n = (a: string) => Number(r.attributes(a))
    return { x: n('x'), y: n('y'), w: n('width'), h: n('height') }
  }

  for (const size of [40, 48, 128]) {
    it(`keeps the numeral plaque small and on the tip at ${size}px`, () => {
      for (const division of [1, 2, 3] as const) {
        const w = render({ tier: 'bronze', size, division })
        const b = plaqueBox(w)
        // The first version was 34 x 15 from y 83; the plaque is now a chip.
        expect(b.h).toBeLessThanOrEqual(12)
        expect(b.y).toBeGreaterThanOrEqual(87)
        expect(b.w).toBeLessThanOrEqual(24)
        expect(b.x + b.w / 2).toBeCloseTo(50)
        expect(Number(w.get('.lti__division text').attributes('font-size'))).toBeLessThan(11)
        w.unmount()
      }
    })

    it(`shows the Champion position in the same plaque at ${size}px`, () => {
      const w = render({ tier: 'champion', size, position: 12 })
      expect(w.get('.lti__division text').text()).toBe('#12')
      expect(w.find('.lti__division--position').exists()).toBe(true)
      expect(w.get('svg').attributes('aria-label')).toBe('Champion #12')
      const b = plaqueBox(w)
      const ref = render({ tier: 'bronze', size, division: 3 })
      const numeral = plaqueBox(ref)
      expect(b.y).toBe(numeral.y)
      expect(b.h).toBe(numeral.h)
      ref.unmount()
      w.unmount()
    })
  }

  it('grows the position plaque with the label and keeps #1234 inside it', () => {
    const widths = ['1', '12', '123', '1234'].map((p) => {
      const w = render({ tier: 'champion', size: 128, position: `#${p}` })
      const b = plaqueBox(w)
      const text = w.get('.lti__division text')
      expect(text.text()).toBe(`#${p}`)
      // Fits at its natural width: no squeeze, inside the icon box.
      expect(text.attributes('textLength')).toBeUndefined()
      expect(b.x).toBeGreaterThan(20)
      expect(b.x + b.w).toBeLessThan(80)
      w.unmount()
      return b.w
    })
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1]!)
  })

  it('squeezes an absurdly long position into the widest plaque instead of spilling', () => {
    const w = render({ tier: 'champion', size: 128, position: 123456789 })
    const b = plaqueBox(w)
    const text = w.get('.lti__division text')
    expect(b.w).toBeLessThanOrEqual(54)
    expect(Number(text.attributes('textLength'))).toBeLessThan(b.w)
    expect(text.attributes('lengthAdjust')).toBe('spacingAndGlyphs')
    w.unmount()
  })

  it('ignores a position on every tier but Champion', () => {
    for (const tier of LEAGUE_TIERS.filter((x) => x !== 'champion')) {
      const name = (en as any).league.tiers[tier] as string
      const bare = render({ tier, size: 128, position: 12 })
      expect(bare.find('.lti__division').exists()).toBe(false)
      expect(bare.get('svg').attributes('aria-label')).toBe(name)
      const withDiv = render({ tier, size: 128, division: 1, position: 12 })
      expect(withDiv.get('.lti__division text').text()).toBe('I')
      expect(withDiv.get('svg').attributes('aria-label')).toBe(`${name} I`)
      bare.unmount()
      withDiv.unmount()
    }
  })

  it('keeps the position in the name at compact size, where no plaque is drawn', () => {
    const w = render({ tier: 'champion', size: 24, position: 7 })
    expect(w.find('.lti__division').exists()).toBe(false)
    expect(w.get('svg').attributes('aria-label')).toBe('Champion #7')
    const none = render({ tier: 'champion', size: 128, position: 0 })
    expect(none.find('.lti__division').exists()).toBe(false)
    expect(none.get('svg').attributes('aria-label')).toBe('Champion')
    w.unmount()
    none.unmount()
  })
})

describe('league tier names are in every locale', () => {
  const modules = import.meta.glob<Record<string, any>>('../src/i18n/locales/*.ts', { eager: true, import: 'default' })
  const locales = Object.entries(modules).map(([p, m]) => [path.basename(p, '.ts'), m] as const)

  it('covers all 39 shipped locale files', () => {
    expect(locales.length).toBe(39)
  })

  for (const [code, msgs] of locales) {
    it(`${code} has every tier name and the division pattern`, () => {
      for (const t of LEAGUE_TIERS) {
        const v = msgs.league?.tiers?.[t]
        expect(typeof v, `${code}.league.tiers.${t}`).toBe('string')
        expect(v.trim().length).toBeGreaterThan(0)
      }
      expect(msgs.league.tierDivision).toContain('{tier}')
      expect(msgs.league.tierDivision).toContain('{division}')
      expect(msgs.league.tierPosition).toContain('{tier}')
      expect(msgs.league.tierPosition).toContain('{position}')
      // Seven distinct names — a copy-paste slip would repeat one.
      expect(new Set(LEAGUE_TIERS.map((t) => msgs.league.tiers[t])).size).toBe(7)
    })

    it(`${code} names a Champion with its position`, () => {
      const i18n = createI18n({ legacy: false, locale: code, fallbackLocale: 'en', messages: { [code]: msgs, en } })
      const w = mount(LeagueTierIcon, {
        props: { tier: 'champion', size: 64, position: '#12' },
        global: { plugins: [i18n] }
      })
      const label = w.get('svg').attributes('aria-label')!
      expect(label).toContain(msgs.league.tiers.champion)
      expect(label).toContain('12')
      expect(label).not.toMatch(/[{}]/)
      w.unmount()
    })
  }
})

describe('the dev preview never ships', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })

  it('is not a build input', () => {
    const viteConfig = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf-8')
    expect(viteConfig).not.toMatch(/league-tiers|src\/dev|dev\/.*\.html/)
    expect(readFileSync(path.join(ROOT, 'index.html'), 'utf-8')).not.toMatch(/league-tiers|src\/dev/)
  })

  it('is not imported by anything outside src/dev', () => {
    const devDir = path.join(ROOT, 'src', 'dev')
    const offenders = walk(path.join(ROOT, 'src'))
      .filter((p) => !p.startsWith(devDir) && /\.(ts|vue|js)$/.test(p))
      .filter((p) => /LeagueTiersPreview|leagueTiersPreview|@\/dev\/|\/dev\//.test(readFileSync(p, 'utf-8').replace(/\/\/.*$/gm, '')))
    expect(offenders).toEqual([])
  })
})
