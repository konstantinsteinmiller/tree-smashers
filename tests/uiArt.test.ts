// Painted UI art (art/ui): the stat icon set and the power-up boxes override
// drawings the game keeps — every listed painting ships, nothing unlisted is
// ever requested, and a failed load falls back to the drawing silently.
import { describe, it, expect } from 'vitest'
// useUser first: breaks the useMatch ↔ useModels ↔ useUser import cycle.
import '@/use/useUser'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import fs from 'node:fs'
import path from 'node:path'
import StatIcon from '@/components/icons/StatIcon.vue'
import { PAINTED_UI_ART, levelUpIconSrc, statIconSrc, uiArtAvailable, uiArtImage } from '@/data/uiArt'
import { SETS } from '../art/ui/manifest.mjs'

const ROOT = path.resolve(__dirname, '..')

describe('painted UI art', () => {
  it('every listed painting ships, and every manifest target is listed', () => {
    for (const f of PAINTED_UI_ART) expect(fs.existsSync(path.join(ROOT, 'public', f)), f).toBe(true)
    const targets = SETS.flatMap((s: { cells: ({ target: string } | null)[] }) => s.cells.filter(Boolean).map(c => c!.target))
    expect([...targets].sort()).toEqual([...PAINTED_UI_ART].sort())
  })

  it('an unlisted file is never requested', () => {
    expect(uiArtAvailable('images/stats/nope_256x256.webp')).toBe(false)
    expect(uiArtImage('images/stats/nope_256x256.webp')).toBeNull()
  })

  it('StatIcon shows the stat family (painted when packed, else its drawn toy SVG)', async () => {
    const w = mount(StatIcon, { props: { stat: 'weight' }, attrs: { class: 'stat-icon' } })
    const p = statIconSrc('weight')
    if (p) {
      expect(w.find('img').attributes('src')).toContain('images/ui-icons/stat-weight_')
      expect(w.find('img').classes()).toContain('stat-icon')
      await w.find('img').trigger('error')
      await nextTick()
      expect(w.find('img').exists()).toBe(false)
      expect(statIconSrc('weight')).toBeNull()
    }
    expect(w.find('svg').exists()).toBe(true)
    expect(w.find('svg').classes()).toContain('stat-icon')
    expect(w.find('svg').attributes('data-stat-icon')).toBe('weight')
    // The old art/ui stat file is never requested for a stat.
    expect(w.html()).not.toContain('images/stats/')
    w.unmount()
  })

  it('the level-up fallback is the up glyph', async () => {
    const w = mount(StatIcon, { props: { stat: 'level-up' } })
    expect(levelUpIconSrc()).not.toBeNull()
    await w.find('img').trigger('error')
    await nextTick()
    expect(w.find('svg path').exists()).toBe(true)
    w.unmount()
  })

  it('no ⬆ character or raw stat-icon component is left in the upgrade surfaces', () => {
    for (const f of ['src/components/organisms/SmasherTeamModal.vue', 'src/views/SpinnerArena.vue']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8')
      expect(s, f).not.toMatch(/⬆/)
      expect(s, f).not.toMatch(/\bIcon(Attack|Defense|Speed|Hp|Weight)\b/)
    }
  })

  it('every stat-icon use goes through the stat family (no old images/stats/ stat file, no old glyph)', () => {
    const files: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name)
        if (e.isDirectory()) walk(f)
        else if (/\.(vue|ts)$/.test(e.name)) files.push(f)
      }
    }
    walk(path.join(ROOT, 'src'))
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join('/')
      const s = fs.readFileSync(f, 'utf8')
      // The pre-family stat glyphs (IconSpeed stays: it is the reward reveal's speed-boost CLOCK).
      expect(s, rel).not.toMatch(/\bIcon(Attack|Defense|Hp|Weight)\b/)
      if (rel === 'src/data/uiArt.ts' || rel === 'src/components/icons/StatIcon.vue' || rel === 'src/use/paintedBadgeIcons.ts') continue
      expect(s, rel).not.toMatch(/statIconPath\(/)
      expect(s, rel).not.toMatch(/images\/stats\//)
    }
  })
})
