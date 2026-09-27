// Component copy: one lazy mechanism for every locale (`src/i18n/sfc.ts`).
//
// Every component's copy lives in the per-locale files under
// `sfc.<Component>`, and components read it through `useSfcI18n(<Component>)`
// against the GLOBAL composer. No SFC `<i18n>` block may come back: a block is
// compiled into the component chunk and ships every language in the first-load
// bundle. This pins:
//   • no `.vue` file carries an `<i18n>` block;
//   • every component that used to have one reads through `useSfcI18n` with its
//     own file name as the namespace, and that namespace exists in en.ts;
//   • `t(key)` prefers `sfc.<ns>.<key>`, falls back to a plain global key, and
//     to `en` when the active locale lacks it — for an original locale (de,
//     jp) and a newer one (it) alike, through the real loader;
//   • a runtime locale switch re-renders the copy.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { useSfcI18n } from '@/i18n/sfc'
import { loadLocaleMessages } from '@/i18n'

const SRC = path.resolve(__dirname, '../src')

const vueFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return vueFiles(full)
    return e.name.endsWith('.vue') ? [full] : []
  })

const flat = (o: any, p = ''): Record<string, string> =>
  Object.entries(o).reduce((acc, [k, v]) => {
    const key = p ? `${p}.${k}` : k
    return v && typeof v === 'object' ? { ...acc, ...flat(v, key) } : { ...acc, [key]: v as string }
  }, {} as Record<string, string>)

const probe = (ns: string, key: string, args?: Record<string, unknown>) =>
  defineComponent({
    setup() {
      const { t } = useSfcI18n(ns)
      return () => h('span', args ? t(key, args) : t(key))
    }
  })

const makeI18n = (locale: string, messages: Record<string, any>) =>
  createI18n({ legacy: false, locale, fallbackLocale: 'en', missingWarn: false, fallbackWarn: false, messages })

const textOf = (component: any, i18n: ReturnType<typeof makeI18n>) => {
  const w = mount(component, { global: { plugins: [i18n] } })
  const text = w.text()
  w.unmount()
  return text
}

describe('component copy (src/i18n/sfc.ts)', () => {
  it('no .vue file carries an SFC <i18n> block', () => {
    const offenders = vueFiles(SRC).filter((f) => /<i18n\b/.test(readFileSync(f, 'utf-8')))
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })

  it('every useSfcI18n namespace is its own file name and exists in en.ts', async () => {
    const en = (await loadLocaleMessages('en')) as any
    const used: string[] = []
    const bad: string[] = []
    for (const f of vueFiles(SRC)) {
      for (const m of readFileSync(f, 'utf-8').matchAll(/useSfcI18n\('([^']+)'\)/g)) {
        used.push(m[1]!)
        if (m[1] !== path.basename(f, '.vue')) bad.push(`${path.relative(SRC, f)} uses '${m[1]}'`)
        if (!en.sfc?.[m[1]!]) bad.push(`sfc.${m[1]} missing from en.ts`)
      }
    }
    expect(bad).toEqual([])
    // …and every en.ts namespace has a reader (no orphaned copy).
    expect(Object.keys(en.sfc ?? {}).sort()).toEqual([...new Set(used)].sort())
  })

  it('prefers sfc.<ns>, falls back to the global key, then to en', () => {
    const i18n = makeI18n('de', {
      en: { stage: 'Stage', sfc: { Probe: { hello: 'Hello', only: 'English only', n: '{n} coins' } } },
      de: { stage: 'Etappe', sfc: { Probe: { hello: 'Hallo', n: '{n} Münzen' } } }
    })
    expect(textOf(probe('Probe', 'hello'), i18n)).toBe('Hallo')
    expect(textOf(probe('Probe', 'stage'), i18n)).toBe('Etappe')
    expect(textOf(probe('Probe', 'only'), i18n)).toBe('English only')
    expect(textOf(probe('Probe', 'n', { n: 3 }), i18n)).toBe('3 Münzen')
  })

  it('re-renders on a runtime locale switch', async () => {
    const i18n = makeI18n('en', {
      en: { sfc: { Probe: { hello: 'Hello' } } },
      it: { sfc: { Probe: { hello: 'Ciao' } } }
    })
    const w = mount(probe('Probe', 'hello'), { global: { plugins: [i18n] } })
    expect(w.text()).toBe('Hello')
    ;(i18n.global.locale as any).value = 'it'
    await nextTick()
    expect(w.text()).toBe('Ciao')
    w.unmount()
  })

  for (const locale of ['en', 'de', 'jp', 'it']) {
    it(`[${locale}] every component key resolves through the real loader — no keypath, no English leak`, async () => {
      const en = (await loadLocaleMessages('en')) as any
      const loc = (await loadLocaleMessages(locale)) as any
      const i18n = makeI18n(locale, { en, [locale]: loc })
      const problems: string[] = []
      for (const [ns, tree] of Object.entries(en.sfc as Record<string, unknown>)) {
        for (const key of Object.keys(flat(tree))) {
          const want = loc.sfc?.[ns] ? flat(loc.sfc[ns])[key] : undefined
          if (want === undefined) {
            problems.push(`sfc.${ns}.${key} missing in ${locale}`)
            continue
          }
          if (/[{}|@]/.test(want)) continue // interpolation / plural — covered by the parity test
          const got = textOf(probe(ns, key), i18n)
          if (got !== want) problems.push(`sfc.${ns}.${key}: got "${got}", want "${want}"`)
        }
      }
      expect(problems).toEqual([])
    })
  }
})
