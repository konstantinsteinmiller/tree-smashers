// The smasher release gate for Node tools (paint queue, PAINT-STATUS): the
// catalog order + DEFAULT_RELEASED_SMASHER_COUNT read from the TypeScript
// sources (src/data/smasherCatalog.ts + src/data/smashers/batch*.ts), so
// there is ONE source of truth. VITE_APP_SMASHERS_RELEASED=all|N widens it
// like the game build does.
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const idsOf = (src, name) => {
  const at = src.indexOf(`export const ${name} = [`)
  const m = at < 0 ? null : [null, src.slice(at, src.indexOf(']', at))]
  if (!m) throw new Error(`released.mjs: ${name} not found`)
  return [...m[1].matchAll(/'([a-z0-9]+)'/g)].map(x => x[1])
}
const cat = read('src/data/smasherCatalog.ts')
export const SMASHER_IDS = Object.freeze([
  ...idsOf(cat, 'BASE_SMASHER_IDS'),
  ...['A', 'B', 'C'].flatMap(b => idsOf(read(`src/data/smashers/batch${b}.ts`), `BATCH_${b}_IDS`))
])
const def = Number((cat.match(/export const DEFAULT_RELEASED_SMASHER_COUNT = (\d+)/) || [])[1])
if (!Number.isInteger(def)) throw new Error('released.mjs: DEFAULT_RELEASED_SMASHER_COUNT not found')
const flag = process.env.VITE_APP_SMASHERS_RELEASED
export const RELEASED_SMASHER_COUNT = flag === 'all'
  ? SMASHER_IDS.length
  : /^[1-9]\d*$/.test(flag ?? '') ? Math.min(SMASHER_IDS.length, Number(flag)) : def
export const RELEASED_SMASHER_IDS = Object.freeze(SMASHER_IDS.slice(0, RELEASED_SMASHER_COUNT))
