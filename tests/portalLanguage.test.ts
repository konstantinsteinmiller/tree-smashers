// Regression guard for the Playgama "language parameter was ignored on
// initialization" report (filed twice: 2026-08 and again after the first fix).
//
// Two independent defects produced it, and both are locked down here:
//
//   1. `bridge.platform.language` hands back tags wider than the ISO 639-1
//      the docs promise (`zh-CN`, `zh-Hant`, `ja`, 3-letter ISO 639-2),
//      and the old normaliser passed the base subtag straight through. `ja`
//      is not one of our internal codes (`jp` is), so Japanese and Chinese
//      variants silently fell through to the English fallback.
//
//   2. The portal locale was PERSISTED into `spinner_user_language` — the
//      same key that holds the player's explicit OptionsModal choice. Once
//      anything landed there, `resolveInitialLocale` short-circuited on it
//      forever, so a load that missed the portal answer poisoned every
//      later load (and, via the cloud strategy, every later device).
//      `spinner_user_language` is now player-choice-only.
//
// Docs: https://wiki.playgama.com/playgama/bridge-sdk/api/platform#language

import { describe, it, expect, beforeEach } from 'vitest'
import { LANGUAGES } from '@/utils/enums'
import {
  clearExplicitLanguageChoice,
  hasExplicitLanguageChoice,
  isSupportedLocale,
  LANGUAGE_KEY,
  notePortalLanguageChange,
  resolveInitialLocale
} from '@/i18n'
import { normalizePlaygamaLanguage } from '@/utils/playgamaPlugin'

describe('normalizePlaygamaLanguage — Bridge tag → internal locale code', () => {
  it('maps every Chinese variant the portals emit onto our zh bundle', () => {
    // We only ship Simplified. Traditional readers get Simplified rather
    // than English — strictly better, and what QA is checking.
    for (const tag of ['zh', 'ZH', 'zh-CN', 'zh_CN', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-HK', 'cmn', 'zho', 'chi']) {
      expect(normalizePlaygamaLanguage(tag), `tag "${tag}"`).toBe('zh')
    }
  })

  it('maps the BCP-47 CJK tags onto our non-standard internal codes', () => {
    // The project uses `jp`/`kr`; the correct tags are `ja`/`ko`. This gap
    // is what silently broke Japanese and Korean alongside Chinese.
    for (const tag of ['ja', 'ja-JP', 'jpn']) {
      expect(normalizePlaygamaLanguage(tag), `tag "${tag}"`).toBe('jp')
    }
    for (const tag of ['ko', 'ko-KR', 'kor']) {
      expect(normalizePlaygamaLanguage(tag), `tag "${tag}"`).toBe('kr')
    }
  })

  it('passes through the languages whose tag already matches our code', () => {
    for (const tag of ['en', 'de', 'es', 'fr', 'ru']) {
      expect(normalizePlaygamaLanguage(tag)).toBe(tag)
    }
    expect(normalizePlaygamaLanguage('pt-BR')).toBeNull()
  })

  it('returns null — never a bare code — for languages we do not ship', () => {
    // Load-bearing: every consumer treats non-null as "safe to apply", so an
    // unshipped language must not knock the player out of their own choice.
    for (const tag of ['pt', 'it', 'tr', 'pl', 'ar', 'hi', '', '   ', '-', 'xx-YY']) {
      expect(normalizePlaygamaLanguage(tag), `tag "${tag}"`).toBeNull()
    }
  })

  it('only ever returns codes that have a shipped locale bundle', () => {
    for (const tag of ['zh-Hant', 'ja', 'ko', 'de-AT', 'es-419', 'ru', 'eng']) {
      const code = normalizePlaygamaLanguage(tag)
      if (code !== null) expect(LANGUAGES).toContain(code)
    }
  })
})

describe('resolveInitialLocale — player choice outranks the portal', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('uses the portal language when the player has never chosen one', () => {
    // The QA case: fresh player, Chinese portal. Must boot Chinese.
    expect(resolveInitialLocale('zh')).toBe('zh')
    expect(hasExplicitLanguageChoice()).toBe(false)
  })

  it('keeps an explicit in-game choice on a differently-languaged portal', () => {
    localStorage.setItem(LANGUAGE_KEY, 'es')
    expect(resolveInitialLocale('zh')).toBe('es')
    expect(hasExplicitLanguageChoice()).toBe(true)
  })

  it('ignores a stored value that is not a locale we ship', () => {
    localStorage.setItem(LANGUAGE_KEY, 'pt')
    expect(resolveInitialLocale('zh')).toBe('zh')
    // A garbage value must not count as a choice, or it would strand the
    // player on the English fallback with no way for the portal to correct it.
    expect(hasExplicitLanguageChoice()).toBe(false)
  })

  it('falls back to English when there is no portal and no choice', () => {
    expect(isSupportedLocale(resolveInitialLocale(null))).toBe(true)
  })

  it('treats a portal language we do not ship as no answer at all', () => {
    localStorage.setItem(LANGUAGE_KEY, 'de')
    expect(resolveInitialLocale('pt')).toBe('de')
  })
})

describe('notePortalLanguageChange — a platform SWITCH outranks a stale choice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reports no change on the first observation', () => {
    // Nothing was being tracked yet, so we must NOT treat this as a switch —
    // that would drop the choice of every returning player on the first load
    // after shipping this.
    expect(notePortalLanguageChange('en')).toBe(false)
  })

  it('reports no change while the portal keeps reporting the same language', () => {
    notePortalLanguageChange('en')
    expect(notePortalLanguageChange('en')).toBe(false)
    expect(notePortalLanguageChange('en')).toBe(false)
  })

  it('reports a change when the portal switches language', () => {
    notePortalLanguageChange('en')
    expect(notePortalLanguageChange('zh')).toBe(true)
  })

  it('is idempotent — the switch is reported once, not on every re-check', () => {
    // `main.ts` calls this at boot AND again from the late-arrival watcher for
    // the same value; the second call must not re-clear the player's choice.
    notePortalLanguageChange('en')
    expect(notePortalLanguageChange('zh')).toBe(true)
    expect(notePortalLanguageChange('zh')).toBe(false)
  })

  it('reproduces the reported QA flow: pick English, portal flips to Chinese', () => {
    // 1. Player loads on an English portal and explicitly picks English.
    notePortalLanguageChange('en')
    localStorage.setItem(LANGUAGE_KEY, 'en')
    expect(resolveInitialLocale('en')).toBe('en')

    // 2. Guided testing tools switch the platform language to Chinese.
    const switched = notePortalLanguageChange('zh')
    expect(switched).toBe(true)
    if (switched) clearExplicitLanguageChoice()

    // 3. The UI must now be Chinese — this is what QA saw stay English.
    expect(hasExplicitLanguageChoice()).toBe(false)
    expect(resolveInitialLocale('zh')).toBe('zh')
  })

  it('does not drop the choice when the portal never moves', () => {
    // The counterpart guarantee: a deliberate Spanish pick on a permanently
    // English portal survives every reload.
    notePortalLanguageChange('en')
    localStorage.setItem(LANGUAGE_KEY, 'es')
    expect(notePortalLanguageChange('en')).toBe(false)
    expect(hasExplicitLanguageChoice()).toBe(true)
    expect(resolveInitialLocale('en')).toBe('es')
  })
})
