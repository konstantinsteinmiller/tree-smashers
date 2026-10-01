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
import { PAINTED_UI_ART, statIconPath, statIconSrc, uiArtAvailable, uiArtImage } from '@/data/uiArt'
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

  it('StatIcon shows the painting, and its drawing after a load error', async () => {
    const w = mount(StatIcon, { props: { stat: 'weight' }, attrs: { class: 'stat-icon' } })
    expect(w.find('img').attributes('src')).toContain(statIconPath('weight'))
    expect(w.find('img').classes()).toContain('stat-icon')
    await w.find('img').trigger('error')
    await nextTick()
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('svg').exists()).toBe(true)
    expect(w.find('svg').classes()).toContain('stat-icon')
    expect(statIconSrc('weight')).toBeNull()
    // Other icons are unaffected.
    expect(statIconSrc('attack')).not.toBeNull()
    w.unmount()
  })

  it('the level-up fallback is the up glyph', async () => {
    const w = mount(StatIcon, { props: { stat: 'level-up' } })
    await w.find('img').trigger('error')
    await nextTick()
    expect(w.find('svg path').exists()).toBe(true)
    w.unmount()
  })

  it('no ⬆ character or raw stat-icon component is left in the upgrade surfaces', () => {
    for (const f of ['src/components/organisms/SpinnerConfigModal.vue', 'src/views/SpinnerArena.vue', 'src/components/organisms/SkillPickerModal.vue']) {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8')
      expect(s, f).not.toMatch(/⬆/)
      expect(s, f).not.toMatch(/\bIcon(Attack|Defense|Speed|Hp|Weight)\b/)
    }
  })
})
