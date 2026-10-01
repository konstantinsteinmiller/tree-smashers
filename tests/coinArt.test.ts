// The ONE currency coin (`public/images/icons/coin_128x128.webp`): IconCoin
// renders the painting, falls back to the drawing on a load error without
// throwing, and no other coin drawing exists in the source.
import { describe, it, expect, beforeEach } from 'vitest'
// useUser first: breaks the useMatch ↔ useModels ↔ useUser import cycle.
import '@/use/useUser'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import fs from 'node:fs'
import path from 'node:path'
import IconCoin from '@/components/icons/IconCoin.vue'
import { coinArtFailed, COIN_ART_PATH } from '@/use/coinArt'

const ROOT = path.resolve(__dirname, '..')

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(vue|ts)$/.test(e.name) ? [p] : []
  })

describe('currency coin art', () => {
  beforeEach(() => {
    coinArtFailed.value = false
  })

  it('the painting ships', () => {
    expect(fs.existsSync(path.join(ROOT, 'public', COIN_ART_PATH))).toBe(true)
  })

  it('IconCoin renders the painting and passes sizing classes through', () => {
    const w = mount(IconCoin, { attrs: { class: 'w-5 h-5' } })
    const img = w.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toContain(COIN_ART_PATH)
    expect(img.classes()).toContain('w-5')
    w.unmount()
  })

  it('a load error swaps every coin to the drawn fallback, silently', async () => {
    const a = mount(IconCoin, { attrs: { class: 'w-5 h-5' } })
    const b = mount(IconCoin)
    await a.find('img').trigger('error')
    await nextTick()
    expect(a.find('img').exists()).toBe(false)
    expect(a.find('svg').exists()).toBe(true)
    expect(a.find('svg').classes()).toContain('w-5')
    expect(b.find('svg').exists()).toBe(true)
    a.unmount()
    b.unmount()
  })

  it('no other coin is drawn anywhere in src (only the fallbacks next to the painting)', () => {
    const allowed = new Set([
      'src/components/icons/IconCoin.vue',
      'src/use/useCoinExplosion.ts',
      'src/components/organisms/RouletteWheel.vue'
    ])
    const offenders = walk(path.join(ROOT, 'src'))
      .map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
      .filter(f => !allowed.has(f))
      .filter(f => {
        const s = fs.readFileSync(path.join(ROOT, f), 'utf8')
        // The old coin face: a green `$` glyph, in SVG or canvas.
        return /#2f920e/i.test(s) || /fillText\(\s*'\$'/.test(s) || />\s*\$\s*</.test(s) || /🪙/.test(s.replace(/\/\/.*$|^\s*\*.*$/gm, ''))
      })
    expect(offenders).toEqual([])
    // And the allowed fallbacks sit beside the painting.
    for (const f of allowed) expect(fs.readFileSync(path.join(ROOT, f), 'utf8')).toMatch(/coinArt/)
  })
})
