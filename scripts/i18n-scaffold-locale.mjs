#!/usr/bin/env node
// ─── Locale scaffold / sync ─────────────────────────────────────────────────
//
// Writes src/i18n/locales/<code>.ts with the COMPLETE key tree a translator has
// to fill: every key of en.ts — the global keys plus the component copy under
// `sfc.<Component>` (see src/i18n/sfc.ts).
//
//   node scripts/i18n-scaffold-locale.mjs it          # new file, English values to translate
//   node scripts/i18n-scaffold-locale.mjs it --sync   # existing file: add keys en.ts gained
//                                                     # since, drop keys it lost; keeps every
//                                                     # existing translation
//
// Values that still need translating are the ENGLISH text, so the parity test
// (`npx vitest run tests/i18nParity.test.ts -t "\[it\]"`) lists every one of
// them as "identical to English" until it is done. A scaffolded file makes the
// language selectable immediately — translate before you build.
//
// The code must be a registry language (src/i18n/languages.ts).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const LOCALES = path.join(SRC, 'i18n', 'locales')

const args = process.argv.slice(2)
const code = args.find((a) => !a.startsWith('--'))
const sync = args.includes('--sync')

/** Locale files are plain object literals — import them as data URLs. */
const importTs = async (file) =>
  (await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(readFileSync(file, 'utf8')).toString('base64'))).default

/** Deep "shape of `shape`, values from `from` where present, else from `shape`". */
const merge = (shape, from) => {
  if (typeof shape !== 'object' || shape === null) return typeof from === 'string' ? from : shape
  const out = {}
  for (const [k, v] of Object.entries(shape)) out[k] = merge(v, from && typeof from === 'object' ? from[k] : undefined)
  return out
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n')}'`
const emit = (obj, indent = 1) => {
  const pad = '  '.repeat(indent)
  const lines = Object.entries(obj).map(([k, v]) =>
    typeof v === 'object' && v !== null ? `${pad}${q(k)}: ${emit(v, indent + 1)}` : `${pad}${q(k)}: ${q(v)}`
  )
  return `{\n${lines.join(',\n')}\n${'  '.repeat(indent - 1)}}`
}

// ─── main ─────────────────────────────────────────────────────────────────────

const registry = readFileSync(path.join(SRC, 'i18n', 'languages.ts'), 'utf8')
const entry = [...registry.matchAll(/\{ code: '([^']+)', bcp47: '([^']+)', english: '([^']+)', native: '([^']+)'/g)]
  .map((m) => ({ code: m[1], bcp47: m[2], english: m[3], native: m[4] }))
  .find((l) => l.code === code)
if (!code || !entry) {
  console.error('usage: node scripts/i18n-scaffold-locale.mjs <registry code> [--sync]   (codes: see src/i18n/languages.ts)')
  process.exit(1)
}
const file = path.join(LOCALES, `${code}.ts`)
if (existsSync(file) && !sync) {
  console.error(`${path.relative(ROOT, file)} exists — use --sync to add/drop keys while keeping the translations.`)
  process.exit(1)
}

if (code === 'en') {
  console.error('en.ts is the source — edit it directly, then --sync every other locale.')
  process.exit(1)
}

const { sfc = {}, ...enGlobal } = await importTs(path.join(LOCALES, 'en.ts'))
const current = existsSync(file) ? await importTs(file) : {}
const { sfc: curSfc = {}, ...curGlobal } = current
const nextGlobal = merge(enGlobal, curGlobal)
const nextSfc = merge(sfc, curSfc)

const count = (o) => (typeof o === 'object' && o ? Object.values(o).reduce((n, v) => n + count(v), 0) : 1)
const flat = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) typeof v === 'object' && v ? flat(v, p + k + '.', out) : (out[p + k] = v)
  return out
}
const before = flat({ ...curGlobal, sfc: curSfc })
const after = flat({ ...nextGlobal, sfc: nextSfc })
const added = Object.keys(after).filter((k) => !(k in before))
const dropped = Object.keys(before).filter((k) => !(k in after))

const body = { ...nextGlobal, sfc: nextSfc }
const header = `// ${entry.english} (${entry.native}) — BCP-47 \`${entry.bcp47}\`.
// Translation rules: src/i18n/TRANSLATION-GUIDE.md. Gate: npx vitest run tests/i18nParity.test.ts -t "\\[${code}\\]"
// \`sfc.<Component>\` is component copy; en.ts is its source (see src/i18n/sfc.ts).
`
writeFileSync(file, `${header}export default ${emit(body)}\n`)
console.log(`${sync ? 'synced' : 'wrote'} ${path.relative(ROOT, file)} — ${count(body)} strings` +
  (sync ? `; +${added.length} new (English, to translate)${added.length ? ': ' + added.join(', ') : ''}; -${dropped.length} dropped${dropped.length ? ': ' + dropped.join(', ') : ''}` : ' (English — translate every value)'))
