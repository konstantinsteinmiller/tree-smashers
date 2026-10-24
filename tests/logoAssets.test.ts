// The Tree Smashers logo / favicon / loader hand-over contract:
//   • every icon index.html and the web manifest point to exists, at the size
//     it claims (the old apple-touch-icon pointed to a missing file);
//   • favicon.ico carries 16 / 32 / 48 frames;
//   • the static splash in index.html and FLogoProgress.vue render the SAME
//     class tree, and every ts-* class they use is styled by index.html's one
//     shared sheet — that is what makes the splash → app hand-over seamless;
//   • the registry (src/data/logoArt.ts, tools/logo/build.mjs) and the splash
//     block point at the same, existing logo files;
//   • the loader's idle loops never scale ABOVE 1 (an upscale stretches the
//     raster of the letters — render-sharpness rule);
//   • no "Chaos Arena" branding is left in user-facing files.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { LOGO_DISC_SVG, LOGO_EMBLEM_SVG, LOGO_PARTS } from '@/data/logoArt'

const ROOT = join(__dirname, '..')
const PUBLIC = join(ROOT, 'public')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
const splash = html.slice(html.indexOf('<div id="static-splash"'), html.indexOf('<!-- logo:end -->'))
const loaderVue = readFileSync(join(ROOT, 'src', 'components', 'atoms', 'FLogoProgress.vue'), 'utf8')
const template = loaderVue.slice(0, loaderVue.indexOf('</template>'))

const publicFile = (url: string): string => join(PUBLIC, url.replace(/^\.?\//, '').replace(/\?.*$/, ''))
const pngSize = (file: string): [number, number] => {
  const b = readFileSync(file)
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('favicon, touch icon, manifest', () => {
  it('every <link rel=icon|apple-touch-icon|manifest> in index.html exists', () => {
    const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)]
    expect(links.map(m => m[1]).sort()).toEqual(['apple-touch-icon', 'icon', 'icon', 'manifest'])
    for (const [, , href] of links) expect(existsSync(publicFile(href!)), href).toBe(true)
  })

  it('the apple touch icon is a 180 × 180 PNG', () => {
    const href = /rel="apple-touch-icon"[^>]*href="([^"]+)"/.exec(html)![1]!
    expect(pngSize(publicFile(href))).toEqual([180, 180])
  })

  it('favicon.ico holds 16, 32 and 48 px frames', () => {
    const b = readFileSync(join(PUBLIC, 'favicon.ico'))
    expect(b.readUInt16LE(2)).toBe(1)
    const n = b.readUInt16LE(4)
    const sizes = Array.from({ length: n }, (_, i) => b.readUInt8(6 + i * 16))
    expect(sizes).toEqual([16, 32, 48])
  })

  it('manifest icons exist at their declared sizes, with a maskable set', () => {
    const m = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8')) as { icons: { src: string, sizes: string, type: string, purpose: string }[] }
    for (const icon of m.icons) {
      const file = publicFile(icon.src)
      expect(existsSync(file), icon.src).toBe(true)
      if (icon.type === 'image/png') {
        const [w, h] = pngSize(file)
        expect(`${w}x${h}`, icon.src).toBe(icon.sizes)
      }
    }
    expect(m.icons.filter(i => i.purpose === 'maskable').map(i => i.sizes).sort()).toEqual(['192x192', '512x512'])
  })
})

describe('logo registry', () => {
  it('every part, the HUD emblem and the runner disc exist', () => {
    for (const p of Object.values(LOGO_PARTS)) {
      expect(existsSync(publicFile(p.svg)), p.svg).toBe(true)
      if (p.painted) expect(existsSync(publicFile(p.painted.file)), p.painted.file).toBe(true)
    }
    expect(existsSync(publicFile(LOGO_EMBLEM_SVG))).toBe(true)
    expect(existsSync(publicFile(LOGO_DISC_SVG))).toBe(true)
  })

  it('the splash block shows the same files as the registry (same version)', () => {
    for (const p of Object.values(LOGO_PARTS)) expect(splash).toContain(`src="/${p.svg}"`)
    expect(splash).toContain(`src="/${LOGO_DISC_SVG}"`)
    expect(style).toMatch(/\/\* logo-layout:start[\s\S]*\.ts-logo__emblem \{ left:[\s\S]*\/\* logo-layout:end \*\//)
  })
})

describe('splash → app hand-over', () => {
  const classes = (src: string): Set<string> => new Set([...src.matchAll(/(?:^|[\s."'])(ts-[a-z0-9_-]+)/g)].map(m => m[1]!))
  const splashClasses = classes(splash)
  const appClasses = classes(template)

  it('FLogoProgress renders every element class of the static splash', () => {
    const missing = [...splashClasses].filter(c => !appClasses.has(c) && c !== 'ts-handed-over')
    expect(missing).toEqual([])
  })

  it('every ts-* class the loader uses is styled by the shared sheet in index.html', () => {
    const app = [...appClasses].filter(c => c !== 'ts-tip__text')
    const unstyled = app.filter(c => !new RegExp(`\\.${c}(?![a-z0-9_-])`).test(style))
    expect(unstyled).toEqual([])
  })

  it('the splash fade class is not Tailwind\'s .hidden (display:none would cut the fade)', () => {
    expect(loaderVue).toContain("classList.add('ts-handed-over')")
    expect(style).toContain('#static-splash.ts-handed-over')
  })

  it('idle loops never scale above 1 (no upscaled raster in the resting loop)', () => {
    for (const name of ['ts-beat', 'ts-emblem-idle']) {
      const body = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n {6}\\}`).exec(style)?.[1] ?? ''
      expect(body, name).not.toBe('')
      const scales = [...body.matchAll(/scale\(([^)]+)\)/g)].flatMap(m => m[1]!.split(',').map(Number))
      expect(scales.every(s => s <= 1), `${name}: ${scales.join(', ')}`).toBe(true)
    }
  })

  it('reduced motion stops the loader\'s loops and entrances', () => {
    const rm = style.slice(style.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const sel of ['.ts-backdrop div', '.ts-logo__anim', '.ts-meter', '.ts-bar__disc img']) expect(rm).toContain(sel)
  })
})

describe('branding', () => {
  it('no "Chaos Arena" in index.html, the manifest or any locale', () => {
    const LOC = join(ROOT, 'src', 'i18n', 'locales')
    const files = [join(ROOT, 'index.html'), join(PUBLIC, 'manifest.json'), ...readdirSync(LOC).map(f => join(LOC, f))]
    const bad = files.filter(f => /chaos.?arena/i.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})
