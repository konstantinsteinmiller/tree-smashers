// i18n parity — the translators' gate.
//
// For every SHIPPED locale (a `src/i18n/locales/<code>.ts` file that the
// language registry knows), against the English source:
//
//   • the same key set — global keys AND every component's `sfc.<Component>`
//     section (en.ts is the source; see src/i18n/sfc.ts);
//   • the same `{placeholders}` and `@:linked` references;
//   • no empty strings, no non-string values;
//   • no stray vue-i18n syntax: an unescaped `|` is a PLURAL SEPARATOR and a
//     bare `@` starts a LINKED MESSAGE — both silently break the string;
//   • plural branch counts the language can actually select;
//   • nothing left in English (identical to the source) unless allowlisted in
//     `tests/i18nParity.allowlist.ts`;
//   • non-Latin locales actually contain their script (catches English that
//     was lightly edited rather than translated);
//   • RTL: an Arabic sentence that starts with a Latin word must lead with
//     U+200F (RIGHT-TO-LEFT MARK), or it renders in LTR order under the
//     `unicode-bidi: plaintext` rule in `fonts.sass`.
//
// Run one or a few locales (cross-shell):   npx vitest run tests/i18nParity.test.ts -t "\[ar\]"
// or with an env var (bash):                I18N_LOCALES=ar,pt-BR npx vitest run tests/i18nParity.test.ts
//                     (PowerShell):         $env:I18N_LOCALES='ar,pt-BR'; npx vitest run tests/i18nParity.test.ts

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGUAGE_BY_CODE, LANGUAGE_REGISTRY, pluralCategoriesFor } from '@/i18n/languages'
import { SHIPPED_LOCALES } from '@/i18n'
import { BRAND_KEYS, KEEP_ENGLISH } from './i18nParity.allowlist'

type Tree = Record<string, unknown>

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const LOCALE_DIR = path.join(SRC, 'i18n', 'locales')

// ─── Loading ──────────────────────────────────────────────────────────────────

const localeModules = import.meta.glob<Tree>('../src/i18n/locales/*.ts', { eager: true, import: 'default' })
const LOCALES: Record<string, Tree> = Object.fromEntries(
  Object.entries(localeModules).map(([p, mod]) => [path.basename(p, '.ts'), mod])
)

/** Component copy source: en.ts `sfc.<Component>` (read by `useSfcI18n`). */
const EN_SFC = (LOCALES.en?.sfc ?? {}) as Record<string, Tree>

// ─── Message analysis ─────────────────────────────────────────────────────────

const flatten = (tree: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> => {
  if (tree && typeof tree === 'object' && !Array.isArray(tree)) {
    for (const [k, v] of Object.entries(tree as Tree)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  } else {
    out[prefix] = tree
  }
  return out
}

/** Literal escapes like {'@'} / {'|'} / {'{'} — text, not syntax. */
const LITERAL = /\{\s*'(?:[^'\\]|\\.)*'\s*\}/g
const stripLiterals = (s: string) => s.replace(LITERAL, '')

const placeholders = (s: string): string[] =>
  [...stripLiterals(s).matchAll(/\{\s*([A-Za-z0-9_]+)\s*\}/g)].map((m) => m[1]!).sort()

const LINK = /@(?:\.[a-z]+)?:(?:\(([^)]+)\)|([A-Za-z0-9_.-]+))/g
const links = (s: string): string[] => [...stripLiterals(s).matchAll(LINK)].map((m) => (m[1] ?? m[2])!).sort()
const strayAts = (s: string): number => (stripLiterals(s).replace(LINK, '').match(/@/g) ?? []).length
const branches = (s: string): number => stripLiterals(s).split('|').length

/** True when the string carries no translatable letters (numbers, symbols, placeholders only). */
const isNeutral = (s: string): boolean => !/\p{L}/u.test(stripLiterals(s).replace(/\{\s*[A-Za-z0-9_]+\s*\}/g, ''))

const SCRIPT_RE: Record<string, RegExp> = {
  greek: /\p{Script=Greek}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  arabic: /\p{Script=Arabic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  thai: /\p{Script=Thai}/u,
  'cjk-sc': /\p{Script=Han}/u,
  'cjk-tc': /\p{Script=Han}/u,
  'cjk-jp': /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  'cjk-kr': /[\p{Script=Hangul}\p{Script=Han}]/u
}

const RTL_MARKS = /^[‏؜⁧‫]/
/** First strong-direction character: 'L', 'R' or null. */
const firstStrong = (s: string): 'L' | 'R' | null => {
  for (const ch of stripLiterals(s).replace(/\{\s*[A-Za-z0-9_]+\s*\}/g, '')) {
    if (/[‏؜⁧‫]/.test(ch)) return 'R'
    if (/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(ch)) return 'R'
    if (/\p{L}/u.test(ch)) return 'L'
  }
  return null
}

interface Problem {
  key: string
  issue: string
}

/**
 * Compare one locale's flat message map against the English flat map.
 * `keyPrefix` only decorates the reported key (so the allowlist can name it).
 */
const compare = (code: string, en: Record<string, unknown>, loc: Record<string, unknown>, keyPrefix = ''): Problem[] => {
  const info = LANGUAGE_BY_CODE[code]!
  const problems: Problem[] = []
  const keepEnglish = new Set(KEEP_ENGLISH[code] ?? [])
  const scriptRe = SCRIPT_RE[info.script]
  const allowedBranches = (enBranches: number): Set<number> => {
    if (enBranches === 1) return new Set([1])
    const cats = pluralCategoriesFor(info.bcp47).length
    return new Set([enBranches, cats, cats + 1])
  }

  for (const [k, enVal] of Object.entries(en)) {
    const key = keyPrefix + k
    if (!(k in loc)) {
      problems.push({ key, issue: 'missing' })
      continue
    }
    const val = loc[k]
    if (typeof val !== 'string') {
      problems.push({ key, issue: `not a string (${typeof val})` })
      continue
    }
    if (val.trim() === '') {
      problems.push({ key, issue: 'empty' })
      continue
    }
    if (typeof enVal !== 'string') continue
    const pe = placeholders(enVal).join(',')
    const pl = placeholders(val).join(',')
    if (pe !== pl) problems.push({ key, issue: `placeholders {${pl}} ≠ en {${pe}}` })
    const le = links(enVal).join(',')
    const ll = links(val).join(',')
    if (le !== ll) problems.push({ key, issue: `linked refs [${ll}] ≠ en [${le}]` })
    if (strayAts(val) > 0) problems.push({ key, issue: 'bare \'@\' (starts a linked message) — write {\'@\'}' })
    const bEn = branches(enVal)
    const bLoc = branches(val)
    if (!allowedBranches(bEn).has(bLoc)) {
      problems.push({
        key,
        issue: bEn === 1
          ? 'unescaped \'|\' (plural separator) — write {\'|\'}'
          : `${bLoc} plural branches; en has ${bEn}, ${info.english} needs ${[...allowedBranches(bEn)].join(' or ')}`
      })
    }
    const exempt = BRAND_KEYS.includes(key) || keepEnglish.has(key)
    if (code !== 'en' && !exempt && val === enVal && !isNeutral(val)) {
      problems.push({ key, issue: `identical to English ("${val}") — translate, or allowlist a true cognate` })
    }
    if (scriptRe && !exempt && !isNeutral(val) && !scriptRe.test(val)) {
      problems.push({ key, issue: `no ${info.script} characters ("${val}")` })
    }
    if (info.dir === 'rtl' && /\p{Script=Arabic}/u.test(val) && firstStrong(val) === 'L' && !RTL_MARKS.test(val)) {
      problems.push({ key, issue: 'Arabic sentence starts with a Latin word — prefix U+200F (RLM)' })
    }
  }
  for (const k of Object.keys(loc)) {
    if (!(k in en)) problems.push({ key: keyPrefix + k, issue: 'extra key (not in en)' })
  }
  return problems
}

const report = (problems: Problem[]): string =>
  problems.map((p) => `  ${p.key}: ${p.issue}`).join('\n')

// ─── Which locales run ────────────────────────────────────────────────────────

const only = (process.env.I18N_LOCALES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const TARGETS = SHIPPED_LOCALES.filter((c) => c !== 'en' && (only.length === 0 || only.includes(c)))

const enGlobal = (() => {
  const { sfc: _ignored, ...rest } = LOCALES.en ?? {}
  return flatten(rest)
})()

// ─── Registry ↔ files ─────────────────────────────────────────────────────────

describe('i18n registry ↔ locale files', () => {
  it('every locale file is a registry language', () => {
    const unknown = Object.keys(LOCALES).filter((c) => !LANGUAGE_BY_CODE[c])
    expect(unknown, 'locale files with no registry entry (typo in the file name?)').toEqual([])
  })

  it('registry codes are unique and English is shipped', () => {
    const codes = LANGUAGE_REGISTRY.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(SHIPPED_LOCALES).toContain('en')
  })

  it('every locale file exists on disk exactly as the glob sees it', () => {
    const onDisk = readdirSync(LOCALE_DIR).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3)).sort()
    expect(Object.keys(LOCALES).sort()).toEqual(onDisk)
  })

  it('English has no empty or non-string values', () => {
    const bad = Object.entries({ ...enGlobal, ...flatten(EN_SFC, 'sfc') }).filter(([, v]) => typeof v !== 'string' || !v.trim())
    expect(bad.map(([k]) => k)).toEqual([])
  })

  for (const l of LANGUAGE_REGISTRY) {
    if (!SHIPPED_LOCALES.includes(l.code)) it.todo(`[${l.code}] ${l.english} — src/i18n/locales/${l.code}.ts not written yet`)
  }
})

// ─── Per locale ───────────────────────────────────────────────────────────────

for (const code of TARGETS) {
  const info = LANGUAGE_BY_CODE[code]!
  const loc = LOCALES[code] ?? {}

  describe(`[${code}] ${info.english}`, () => {
    it('global keys match en.ts', () => {
      const { sfc: _ignored, ...rest } = loc
      const problems = compare(code, enGlobal, flatten(rest))
      expect(problems, `\n[${code}] global:\n${report(problems)}\n`).toEqual([])
    })

    it('component (sfc.<Component>) keys match en.ts', () => {
      const sfcTree = (loc.sfc ?? {}) as Tree
      const problems: Problem[] = []
      for (const [ns, en] of Object.entries(EN_SFC)) {
        const source = sfcTree[ns] as Tree | undefined
        if (!source) {
          problems.push({
            key: `sfc.${ns}`,
            issue: `missing — add \`sfc: { ${ns}: { … } }\` to ${code}.ts (mirror en.ts)`
          })
          continue
        }
        problems.push(...compare(code, flatten(en), flatten(source), `sfc.${ns}.`))
      }
      for (const ns of Object.keys(sfcTree)) {
        if (!EN_SFC[ns]) problems.push({ key: `sfc.${ns}`, issue: 'not in en.ts sfc (extra component section)' })
      }
      expect(problems, `\n[${code}] components:\n${report(problems)}\n`).toEqual([])
    })
  })
}
