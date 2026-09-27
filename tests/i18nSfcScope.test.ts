// Guards the failure mode that shipped `rewardedIntro.bodyReward` and
// `adsBlocked.allowHost` untranslated.
//
// `<i18n-t>` takes `scope="parent"` (the default) or `scope="global"`.
// `"local"` is NOT a valid value: vue-i18n resolves it against the I18nT
// component's OWN instance, finds no composer, and builds a fresh one whose
// only messages come from the root. `createI18n` in `main.ts` sets
// `missingWarn: false` / `fallbackWarn: false`, so a keypath that does not
// resolve renders raw, in total silence.
//
// Component copy lives in the locale files under `sfc.<Component>` (see
// `src/i18n/sfc.ts`), so an `<i18n-t>` must name the FULL path
// (`sfc.AdsBlockedModal.adsBlocked.allowHost`) with `scope="global"`.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AdsBlockedModal from '@/components/atoms/AdsBlockedModal.vue'
import RewardedAdIntroModal from '@/components/atoms/RewardedAdIntroModal.vue'
import { isAdsBlockedModalShown } from '@/use/useAds'
import { loadLocaleMessages } from '@/i18n'
import { isRewardedIntroOpen, rewardedIntroReward } from '@/use/useRewardedIntro'

const SRC = path.resolve(__dirname, '../src')

const vueFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return vueFiles(full)
    return e.name.endsWith('.vue') ? [full] : []
  })

describe('<i18n-t> scope', () => {
  it('every <i18n-t> on component copy names the full sfc path with scope="global"', () => {
    const bad: string[] = []
    for (const file of vueFiles(SRC)) {
      for (const m of readFileSync(file, 'utf-8').matchAll(/i18n-t\(([^)]*)\)/g)) {
        const attrs = m[1]!
        if (/keypath="sfc\./.test(attrs) && !/scope="global"/.test(attrs)) bad.push(`${path.relative(SRC, file)}: ${attrs}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('no component uses the invalid scope="local"', () => {
    const offenders = vueFiles(SRC).filter((file) => {
      const src = readFileSync(file, 'utf-8')
      if (!/i18n-t|<I18nT/i.test(src)) return false
      // Only flag a scope="local" that sits on an i18n-t/I18nT tag.
      return /(?:i18n-t|<I18nT)\b[^)>]*scope\s*=\s*["']local["']/i.test(src)
    })
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })
})

// A global instance carrying the REAL locale files — exactly what `main.ts`
// builds (active locale + the `en` fallback).
const realGlobal = async (locale: string) => {
  const en = await loadLocaleMessages('en')
  const msgs = await loadLocaleMessages(locale)
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en, [locale]: msgs } as any
  })
}

const bodyTextOf = async (component: any, locale: string): Promise<string> => {
  const wrapper = mount(component, { global: { plugins: [await realGlobal(locale)] } })
  const text = document.body.textContent ?? ''
  wrapper.unmount()
  return text
}

describe('component copy resolves from the locale files', () => {
  afterEach(() => {
    isRewardedIntroOpen.value = false
    rewardedIntroReward.value = null
    isAdsBlockedModalShown.value = false
    document.body.innerHTML = ''
  })

  it('RewardedAdIntroModal interpolates the reward, in English', async () => {
    isRewardedIntroOpen.value = true
    rewardedIntroReward.value = { kind: 'coins', amount: 250 }
    const text = await bodyTextOf(RewardedAdIntroModal, 'en')
    expect(text).not.toContain('rewardedIntro.')
    expect(text).toContain('Watch a short video ad to earn')
    expect(text).toContain('250 coins')
  })

  it('RewardedAdIntroModal follows the active locale', async () => {
    isRewardedIntroOpen.value = true
    rewardedIntroReward.value = { kind: 'diamonds', amount: 3 }
    const text = await bodyTextOf(RewardedAdIntroModal, 'de')
    expect(text).not.toContain('rewardedIntro.')
    expect(text).toContain('Sieh dir ein kurzes Werbevideo an und erhalte')
    expect(text).toContain('3 Diamanten')
  })

  it('AdsBlockedModal interpolates the host, in English', async () => {
    isAdsBlockedModalShown.value = true
    const text = await bodyTextOf(AdsBlockedModal, 'en')
    expect(text).not.toContain('adsBlocked.')
    expect(text).toContain('Please allow ads on')
  })

  it('AdsBlockedModal follows the active locale', async () => {
    isAdsBlockedModalShown.value = true
    const text = await bodyTextOf(AdsBlockedModal, 'zh')
    expect(text).not.toContain('adsBlocked.')
    expect(text).toContain('上允许广告')
  })

  it('AdsBlockedModal in a newer locale (it) — no English, no keypath', async () => {
    isAdsBlockedModalShown.value = true
    const text = await bodyTextOf(AdsBlockedModal, 'it')
    expect(text).not.toContain('adsBlocked.')
    expect(text).toContain('Consenti gli annunci su')
  })
})
