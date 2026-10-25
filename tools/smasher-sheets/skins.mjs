#!/usr/bin/env node
/**
 * Smasher SKIN painting — prepare the references + prompts for every smasher's own skin.
 *
 *   node tools/smasher-sheets/skins.mjs [--only bramble,thumper]   (pnpm art:skins)
 *
 * A skin is the base smasher in a cocky / funny / elemental costume (the brief per smasher is
 * `SMASHER_SKINS[id]` in src/data/smasherSkinCatalog.ts). It is painted through the SAME machinery
 * as the base sheets, under the id `<smasher>-skin`:
 *   (no reference copies: the queue and the slicer use the BASE smasher's rig reference <id>{,-a,-b}.png as the layout guide —
 *    same silhouette, poses and cell positions)
 *   art-sheets/smashers-bare/<id>-skin-{a,b}.prompt.txt   skinPrompt() — base prompt + the skin brief
 *   → node tools/smasher-sheets/paint-queue.mjs --skins   paints a/b, slices (colour check relaxed: a skin
 *                                                         recolours the smasher), keeps public/images/smashers/<id>-skin_*.webp
 *   → src/smashers/paintedSmashers.ts gets a "<id>-skin" row; smasherAtlas draws it whenever the smasher
 *     wears its own skin (all other looks and bosses keep the signature sheet / rig).
 * Only the skin the player equips is fetched, so 48 skins cost no loading time until one is worn.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rows, skinPrompt } from './prompts.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const BARE = join(ROOT, 'art-sheets', 'smashers-bare')

/** `{ id: { kind, theme, concept } }` parsed from the TS catalog (one source of truth, like released.mjs). */
export const readSkinDefs = () => {
  const src = readFileSync(join(ROOT, 'src', 'data', 'smasherSkinCatalog.ts'), 'utf8')
  const out = {}
  for (const m of src.matchAll(/^\s*"([a-z0-9]+)": \{ kind: '(\w+)', theme: '([\w-]+)', concept: "([^"]+)" \},?\s*$/gm)) {
    out[m[1]] = { kind: m[2], theme: m[3], concept: m[4] }
  }
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2)
  const oi = a.indexOf('--only')
  const only = oi >= 0 ? a[oi + 1].split(',') : null
  const defs = readSkinDefs()
  let n = 0
  for (const row of rows) {
    if (only && !only.includes(row.id)) continue
    const skin = defs[row.id]
    if (!skin) { console.warn(`skip ${row.id}: no entry in smasherSkinCatalog.ts`); continue }
    if (!['', 'a', 'b'].every(k => existsSync(join(BARE, `${row.id}${k && '-' + k}.png`)))) {
      console.warn(`skip ${row.id}: no bare reference parts (run export.mjs --bare, then parts.mjs)`); continue
    }
    for (const part of ['a', 'b']) writeFileSync(join(BARE, `${row.id}-skin-${part}.prompt.txt`), skinPrompt(row, skin, part))
    n++
  }
  console.log(`prepared ${n} skins in ${BARE}`)
}
