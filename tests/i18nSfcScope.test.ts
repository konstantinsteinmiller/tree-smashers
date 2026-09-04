// Guards the failure mode that shipped `rewardedIntro.bodyReward` and
// `adsBlocked.allowHost` untranslated.
//
// `<i18n-t>` takes `scope="parent"` (the default) or `scope="global"`.
// `"local"` is NOT a valid value: vue-i18n resolves it against the I18nT
// component's OWN instance, finds no composer, and builds a fresh one whose
// only messages come from the root — i.e. `src/i18n/locales/*.ts`. Any key
// that lives solely in the parent's SFC `<i18n>` block is then unresolvable
// and the raw keypath renders. `createI18n` in `main.ts` sets
// `missingWarn: false` / `fallbackWarn: false`, so it fails in total silence.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AdsBlockedModal from '@/components/atoms/AdsBlockedModal.vue'
import RewardedAdIntroModal from '@/components/atoms/RewardedAdIntroModal.vue'
import { isAdsBlockedModalShown } from '@/use/useAds'
import { isRewardedIntroOpen, rewardedIntroReward } from '@/use/useRewardedIntro'

const SRC = path.resolve(__dirname, '../src')

const vueFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return vueFiles(full)
    return e.name.endsWith('.vue') ? [full] : []
  })

describe('<i18n-t> scope', () => {
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

// A global instance with NO messages, exactly mirroring the real
// `src/i18n/locales/*.ts` — none of them define `rewardedIntro` or
// `adsBlocked`. If interpolation resolves here instead of the SFC block,
// the keypath leaks into the DOM.
const emptyGlobal = (locale: string) =>
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en: {}, de: {}, es: {}, fr: {}, jp: {}, kr: {}, ru: {}, zh: {} }
  })

const bodyTextOf = (component: any, locale: string): string => {
  const wrapper = mount(component, { global: { plugins: [emptyGlobal(locale)] } })
  const text = document.body.textContent ?? ''
  wrapper.unmount()
  return text
}

describe('SFC <i18n> copy survives an empty global instance', () => {
  afterEach(() => {
    isRewardedIntroOpen.value = false
    rewardedIntroReward.value = null
    isAdsBlockedModalShown.value = false
    document.body.innerHTML = ''
  })

  it('RewardedAdIntroModal interpolates the reward, in English', () => {
    isRewardedIntroOpen.value = true
    rewardedIntroReward.value = { kind: 'coins', amount: 250 }
    const text = bodyTextOf(RewardedAdIntroModal, 'en')
    expect(text).not.toContain('rewardedIntro.')
    expect(text).toContain('Watch a short video ad to earn')
    expect(text).toContain('250 coins')
  })

  it('RewardedAdIntroModal follows the active locale', () => {
    isRewardedIntroOpen.value = true
    rewardedIntroReward.value = { kind: 'diamonds', amount: 3 }
    const text = bodyTextOf(RewardedAdIntroModal, 'de')
    expect(text).not.toContain('rewardedIntro.')
    expect(text).toContain('Sieh dir ein kurzes Werbevideo an und erhalte')
    expect(text).toContain('3 Diamanten')
  })

  it('AdsBlockedModal interpolates the host, in English', () => {
    isAdsBlockedModalShown.value = true
    const text = bodyTextOf(AdsBlockedModal, 'en')
    expect(text).not.toContain('adsBlocked.')
    expect(text).toContain('Please allow ads on')
  })

  it('AdsBlockedModal follows the active locale', () => {
    isAdsBlockedModalShown.value = true
    const text = bodyTextOf(AdsBlockedModal, 'zh')
    expect(text).not.toContain('adsBlocked.')
    expect(text).toContain('上允许广告')
  })
})
