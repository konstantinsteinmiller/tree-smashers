// Skill level tables (L1..L10) — read from the SHIPPED catalog,
// src/data/skillCatalog.ts, so the sim can never balance numbers the game
// does not use (single source of truth, WP10). Percentages are fractions.
//
// Parsing: every `<id>: def({ id: '<id>', tag: '<TAG>', … zipLevels<…>({ … }) })`
// block of `export const SKILLS` is sliced out and its column literal
// evaluated as JS (plain numbers/arrays, no TS syntax). A scalar column
// repeats on every level, exactly like the catalog's zipLevels(). The loader
// aborts on anything unexpected (missing skill, wrong level count,
// non-finite value) rather than simulating a half-read table.
//
// SKILL_DEFS  = the raw catalog rows (what tests/skillCatalog.test.ts
//               compares against, and what fill.mjs prints in §4).
// SKILL_PARAMS = the rows the ENGINE uses: SKILL_DEFS with the catalog's
//               SKILL_POWER_SCALE applied (identity at 1). Env
//               SKILL_POWER_SCALE=<x> overrides it to test a hot-fix value.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Repo root = three dirname()s above this file. String form on purpose:
// under Vitest's jsdom environment (tests/skillCatalog.test.ts imports this
// file) the global URL class is jsdom's, and Node's fileURLToPath rejects its
// instances. If import.meta.url is not a file: URL at all, walk up from the
// cwd to the folder holding the catalog.
const findRepo = () => {
  if (import.meta.url?.startsWith('file:')) return dirname(dirname(dirname(fileURLToPath(import.meta.url))))
  for (let d = process.cwd(); ; d = dirname(d)) {
    if (existsSync(join(d, 'src/data/skillCatalog.ts'))) return d
    if (dirname(d) === d) throw new Error('skills.mjs: cannot locate the repo root (src/data/skillCatalog.ts)')
  }
}
const REPO = findRepo()
const CATALOG = `${REPO}/src/data/skillCatalog.ts`
const src = readFileSync(CATALOG, 'utf8')

// Sim iteration order. Kept as it always was (NOT the catalog's SKILL_IDS
// order): pair keys, the `--set pairs` task split and every result file in
// results/ are keyed by it. The id SET is asserted equal to the catalog's.
export const SKILL_IDS = [
  'guard_shell', 'phase_step', 'mirror_plate', 'second_wind', 'lucky_edge',
  'momentum', 'homing_rockets', 'opening_salvo', 'static_charge', 'hazard_ward'
]
const LEVELS = 10

const fail = (msg) => {
  throw new Error(`skills.mjs: ${msg} (reading ${CATALOG})`)
}

const skillsStart = src.indexOf('export const SKILLS')
if (skillsStart < 0) fail('`export const SKILLS` not found')
const body = src.slice(skillsStart)

const BLOCK = /(\w+): def\(\{\s*id: '(\w+)', tag: '(\w+)'[\s\S]*?zipLevels<[^>]*>\((\{[^{}]*\})\)/g
const parsed = {}
// Smasher-only effects (`smasherOnly: true`) are not team skills: the sim
// models the ten team skills only, so those blocks are skipped here.
const SMASHER_ONLY = new Set()
for (const m of body.matchAll(BLOCK)) {
  const [, key, id, tag, colsSrc] = m
  if (/smasherOnly: true/.test(m[0])) {
    SMASHER_ONLY.add(id)
    continue
  }
  if (key !== id) fail(`block key ${key} != id ${id}`)
  if (parsed[id]) fail(`duplicate skill ${id}`)
  let cols
  try {
    cols = new Function(`return (${colsSrc})`)()
  } catch (e) {
    fail(`cannot evaluate ${id} level columns: ${e.message}`)
  }
  const levels = Array.from({ length: LEVELS }, (_, i) => {
    const row = {}
    for (const [k, v] of Object.entries(cols)) {
      if (Array.isArray(v) && v.length !== LEVELS) fail(`${id}.${k} has ${v.length} levels, want ${LEVELS}`)
      const x = Array.isArray(v) ? v[i] : v
      if (typeof x !== 'number' || !Number.isFinite(x)) fail(`${id}.${k} L${i + 1} is not a finite number`)
      row[k] = x
    }
    return row
  })
  parsed[id] = { tag, levels }
}

const got = Object.keys(parsed).sort().join(',')
const want = [...SKILL_IDS].sort().join(',')
if (got !== want) fail(`skill ids differ — catalog [${got}] vs sim [${want}]`)

// Catalog SKILL_IDS must be the same set too. They live in the skills flag
// boundary module (src/skills/skillIds.ts; src/types/skills.ts re-exports it).
const typesSrc = readFileSync(`${REPO}/src/skills/skillIds.ts`, 'utf8')
const typeIds = /export const SKILL_IDS = \[([\s\S]*?)\]/.exec(typesSrc)?.[1]
if (!typeIds) fail('SKILL_IDS not found in src/skills/skillIds.ts')
const typeSet = [...typeIds.matchAll(/'(\w+)'/g)].map(x => x[1]).filter(id => !SMASHER_ONLY.has(id)).sort().join(',')
if (typeSet !== want) fail(`src/skills/skillIds.ts SKILL_IDS [${typeSet}] != sim [${want}]`)

export const SKILL_DEFS = Object.fromEntries(SKILL_IDS.map(id => [id, parsed[id]]))

// ── SKILL_POWER_SCALE (catalog §5): chances/percents only; `mult` as 1+(m−1)s
const scaleSrc = /export const SKILL_POWER_SCALE = ([\d.]+)/.exec(src)?.[1]
if (!scaleSrc) fail('SKILL_POWER_SCALE not found')
export const SKILL_POWER_SCALE = process.env.SKILL_POWER_SCALE != null
  ? Number(process.env.SKILL_POWER_SCALE)
  : Number(scaleSrc)
if (!Number.isFinite(SKILL_POWER_SCALE) || SKILL_POWER_SCALE <= 0) fail(`bad SKILL_POWER_SCALE ${SKILL_POWER_SCALE}`)
const SCALED = new Set(['chance', 'shield', 'heal', 'pct', 'frac', 'perStack', 'lava', 'thunder', 'chip', 'shockKeep'])
const scaleRow = (row) => SKILL_POWER_SCALE === 1 ? row : Object.fromEntries(Object.entries(row).map(([k, v]) =>
  [k, k === 'mult' ? 1 + (v - 1) * SKILL_POWER_SCALE : SCALED.has(k) ? v * SKILL_POWER_SCALE : v]))
export const SKILL_PARAMS = Object.fromEntries(SKILL_IDS.map(id => [id, {
  ...parsed[id],
  levels: parsed[id].levels.map(scaleRow)
}]))

// ── SKILL_COST (catalog §6.1): coins to reach level L+1, [learn L1, L1→2, …, L9→10].
// Read from the catalog like the level tables, so the economy projection
// (skillecon.mjs) and the doc (fill.mjs) price exactly what the game charges.
const costSrc = /export const SKILL_COST = \[([^\]]*)\]/.exec(src)?.[1]
if (!costSrc) fail('SKILL_COST not found')
export const CATALOG_SKILL_COST = Object.freeze(costSrc.split(',').map(s => Number(s.trim())))
if (CATALOG_SKILL_COST.length !== LEVELS || !CATALOG_SKILL_COST.every(c => Number.isFinite(c) && c > 0)) {
  fail(`SKILL_COST must be ${LEVELS} positive numbers, got [${costSrc}]`)
}
