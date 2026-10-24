// Painted UI icons — the generated registry, the drawn fallback for every name,
// the prompt contract, and the HUD wiring (the core buttons show UiIcon, not
// the old images/icons webps).

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import UiIcon from '@/components/icons/UiIcon.vue'
import { PAINTED_UI_ICONS, type UiIconName } from '@/use/paintedUiIcons'
import { HUD_UI_ICONS, hudUiIconPreloads, paintedUiIconSrc } from '@/use/uiIconArt'
// @ts-expect-error — plain .mjs tool module, no types
import { HUD_ICONS, ICONS, STAT_ICONS, promptFor } from '../tools/ui-icons/prompts.mjs'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')
const NAMES = Object.keys(ICONS) as UiIconName[]

describe('UI icon registry (tools/ui-icons/pack.mjs output)', () => {
  it('names exactly the icons the prompts define', () => {
    const union = read('src/use/paintedUiIcons.ts').match(/export type UiIconName = (.*)/)?.[1] ?? ''
    expect(union.split('|').map(s => s.trim().replace(/'/g, ''))).toEqual(NAMES)
  })

  it('points every painted entry at webps that exist (128 + 256 px; stat icons 64 + 128 + 256), with a content hash', () => {
    for (const [name, p] of Object.entries(PAINTED_UI_ICONS)) {
      const stat = STAT_ICONS.includes(name)
      expect(p!.file, name).toBe(stat ? `${name}_64x64.webp` : `${name}_128x128.webp`)
      expect(p!.file2x, name).toBe(stat ? `${name}_128x128.webp` : `${name}_256x256.webp`)
      expect(p!.file4x, name).toBe(stat ? `${name}_256x256.webp` : undefined)
      expect(p!.v, name).toMatch(/^[0-9a-f]{8}$/)
      for (const f of [p!.file, p!.file2x, ...(p!.file4x ? [p!.file4x] : [])]) {
        const abs = path.join(ROOT, 'public/images/ui-icons', f)
        expect(existsSync(abs), f).toBe(true)
        expect(statSync(abs).size, f).toBeGreaterThan(500)
      }
    }
  })

  it('builds 1× / 2× urls with the cache key, and null for an unpainted icon', () => {
    for (const name of NAMES) {
      const p = PAINTED_UI_ICONS[name]
      const s = paintedUiIconSrc(name)
      if (!p) { expect(s, name).toBeNull(); continue }
      expect(s!.src).toContain(`images/ui-icons/${p.file}?v=${p.v}`)
      expect(s!.src2x).toContain(`images/ui-icons/${p.file2x}?v=${p.v}`)
      if (p.file4x) {
        expect(s!.srcset).toBe(`${s!.src2x} 2x, ${s!.srcMax} 4x`)
        expect(s!.srcMax).toContain(`images/ui-icons/${p.file4x}?v=${p.v}`)
      } else {
        expect(s!.srcset).toBe(`${s!.src2x} 2x`)
        expect(s!.srcMax).toBe(s!.src2x)
      }
    }
  })

  it('preloads the painted HUD sprites at the size the display fetches', () => {
    const painted = HUD_UI_ICONS.filter(n => PAINTED_UI_ICONS[n])
    expect(hudUiIconPreloads(1)).toEqual(painted.map(n => `images/ui-icons/${PAINTED_UI_ICONS[n]!.file}?v=${PAINTED_UI_ICONS[n]!.v}`))
    expect(hudUiIconPreloads(3)).toEqual(painted.map(n => `images/ui-icons/${PAINTED_UI_ICONS[n]!.file2x}?v=${PAINTED_UI_ICONS[n]!.v}`))
  })
})

describe('UiIcon', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it.each(NAMES)('%s: shows the painted sprite when there is one, else the drawn SVG', (name) => {
    const w = mount(UiIcon, { props: { name } })
    const p = PAINTED_UI_ICONS[name]
    if (p) {
      const img = w.get('img')
      expect(img.attributes('src')).toContain(`ui-icons/${p.file}`)
      expect(img.attributes('srcset')).toContain(`ui-icons/${p.file2x}`)
      expect(img.attributes('alt')).toBe('')
    } else {
      expect(w.find('img').exists()).toBe(false)
    }
    expect(w.get(`[data-ui-icon="${name}"]`).exists()).toBe(true)
  })

  it.each(NAMES)('%s: falls back to a decorative drawn SVG when the sprite fails to load', async (name) => {
    const w = mount(UiIcon, { props: { name } })
    if (w.find('img').exists()) {
      await w.get('img').trigger('error')
      await nextTick()
    }
    const svg = w.get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('data-ui-icon')).toBe(name)
    // Drawn in the palette tokens with the ink outline — no hard-coded hex.
    expect(svg.html()).toContain('var(--color-ink)')
    expect(svg.html()).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('retries the painted sprite when the name changes after a failure', async () => {
    const painted = NAMES.filter(n => PAINTED_UI_ICONS[n])
    if (painted.length < 2) return
    const w = mount(UiIcon, { props: { name: painted[0] } })
    await w.get('img').trigger('error')
    await nextTick()
    expect(w.find('img').exists()).toBe(false)
    await w.setProps({ name: painted[1] })
    expect(w.get('img').attributes('src')).toContain(painted[1])
  })
})

describe('UI icon prompts (text-only Gemini jobs)', () => {
  it.each(NAMES)('%s: magenta ground, no stitches / felt / glow, one square icon', (name) => {
    const p = promptFor(name) as string
    expect(p).toContain('#FF00FF')
    expect(p).toContain('NO stitches')
    expect(p).toContain('NO felt')
    expect(p).toContain('NO glow')
    expect(p).toContain('#161a40')
    expect(p).toContain('SQUARE 1:1')
  })

  it('paints the HUD family in one view and light, never as metal', () => {
    expect(HUD_ICONS).toEqual(['upgrade', 'leaderboard', 'league', 'daily', 'battlepass', 'chest', 'pvp', 'fight'])
    for (const name of HUD_ICONS) {
      const p = promptFor(name) as string
      expect(p, name).toContain('front three-quarter view')
      expect(p, name).toContain('top-left')
      expect(p, name).toContain('NO metallic gold')
    }
  })

  it('paints the stat family in the HUD view and light, very bold for 14–24 px, never as metal', () => {
    expect(STAT_ICONS).toEqual(['stat-hp', 'stat-atk', 'stat-def', 'stat-spd', 'stat-weight'])
    for (const name of STAT_ICONS) {
      const p = promptFor(name) as string
      expect(p, name).toContain('front three-quarter view')
      expect(p, name).toContain('top-left')
      expect(p, name).toContain('14–24 px')
      expect(p, name).toContain('NO metallic gold')
    }
  })
})

describe('HUD core buttons use the icon family', () => {
  const OLD = /images\/icons\/(team|trophy|chest|gears)_128x128/
  it.each([
    ['src/views/SpinnerArena.vue', ['name="upgrade"', 'name="leaderboard"']],
    ['src/components/organisms/FakeLeaderBoard.vue', ['name="leaderboard"']],
    ['src/components/organisms/DailyRewards.vue', ['name="daily"']],
    ['src/components/organisms/BattlePass.vue', ['name="battlepass"']],
    ['src/components/organisms/TreasureChest.vue', ['name="chest"']],
    ['src/league/ui/LeagueHudButton.vue', ['name="league"']],
    ['src/components/organisms/PvPButton.vue', ['name="pvp"']],
  ])('%s', (file, icons) => {
    const src = read(file)
    for (const i of icons) expect(src, i).toContain(`UiIcon(${i})`)
    expect(src).not.toMatch(OLD)
  })

  it('PvP button: painted family icon (no emoji swords), keeps its label, i18n name and target', () => {
    const src = read('src/components/organisms/PvPButton.vue')
    expect(src).not.toContain('⚔')
    expect(src).toContain("t('pvp.short')")
    expect(src).toContain(":aria-label=\"t('pvp.title')\"")
    expect(HUD_UI_ICONS).toContain('pvp')
    // ≥ 44 px touch target on phones via the shared invisible hit extension.
    expect(src).toMatch(/button[.\w-]*\.relative\.ui-hit-44\(/)
  })

  it.each([
    ['src/league/ui/LeagueOpponentCard.vue', 'UiIcon.loc__swords(name="fight")', "t('league.fight')"],
    ['src/components/organisms/FakeLeaderBoard.vue', 'UiIcon.lb-fight__icon(name="fight")', "t('fightAsGhost')"]
  ])('fight CTA %s: painted fight glyph, label / aria kept, no old swords', (file, icon, label) => {
    const src = read(file)
    expect(src).toContain(icon)
    expect(src).toContain(label)
    expect(src).not.toContain('⚔')
    expect(src).not.toContain('M3 3l7.5 7.5')
  })

  it('no longer preloads the replaced webps', () => {
    expect(read('src/use/useAssets.ts')).not.toMatch(OLD)
  })

  it('keeps an accessible name on the upgrade and leaderboard buttons', () => {
    const src = read('src/views/SpinnerArena.vue')
    expect(src).toMatch(/aria-label="t\('sfc\.SmasherTeamModal\.team'\)"[\s\S]{0,80}data-testid="hud-team"/)
    expect(src).toMatch(/aria-label="t\('leaderboard\.title'\)"[\s\S]{0,80}data-testid="hud-leaderboard"/)
  })
})

