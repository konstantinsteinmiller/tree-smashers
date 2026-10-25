#!/usr/bin/env node
/**
 * Seasonal tree prompts (#Paint5) — the HD per-state tree prompts
 * (art-sheets/towers/single/) re-dressed for Halloween and Christmas:
 *
 *   node tools/tower-sheets/season-prompts.mjs
 *
 * Writes art-sheets/towers/season/<season>/<state>.prompt.txt for the eight
 * team states (the debris scatter is shared with the everyday trees).
 * Painted by `season-paint-queue.mjs`, packed by `pack-single.mjs --season`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const SEASON_STATES = ['blue-healthy', 'red-healthy', 'blue-damaged', 'red-damaged', 'blue-nearly', 'red-nearly', 'blue-felled', 'red-felled']
const GREEN = 'in fresh leaf green (two or three flat green tones, a few small leaf-shaped highlight marks)'

export const SEASONS = {
  halloween: {
    crown: 'in warm autumn pumpkin orange, burnt amber and golden yellow (two or three flat tones, a few small leaf-shaped highlight marks), a few leaf clumps still olive green',
    dress: 'SEASON — HALLOWEEN: the tree wears a spooky-cute Halloween dress-up. Two or three small round orange pumpkins with tiny green stems sit among the root bumps, a few carved-grin pumpkin faces with a warm yellow glow; a fluffy off-white cotton cobweb hangs across one side of the crown; two or three tiny black bats (flat cartoon silhouettes) flutter near the crown; the face keeps its angry button eyes. Colours: orange, amber, black, bone white, olive — NO purple, NO magenta, NO pink anywhere.',
    felled: 'The fallen crown is orange and amber autumn leaves with two small pumpkins and a cotton cobweb draped over the stump.'
  },
  christmas: {
    crown: 'in deep pine green (two or three flat tones, a few small leaf-shaped highlight marks) topped with thick fluffy white snow caps on the clumps',
    dress: 'SEASON — CHRISTMAS: the tree wears a cosy winter-holiday dress-up. Chunky white snow caps sit on the crown clumps and a small snow drift hugs the root bumps; a string of warm yellow fairy lights loops round the crown; a handful of round gold and silver baubles hang on the crown (NO red or blue baubles, so the team colour stays only on the bow and pennant); the face keeps its angry button eyes, with a little snowflake on one cheek. Colours: pine green, snow white, gold, silver, warm yellow — NO purple, NO magenta, NO pink anywhere.',
    felled: 'The fallen crown is pine green with white snow caps, a few gold baubles and a loop of yellow fairy lights lying beside the snow-capped stump.'
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [season, s] of Object.entries(SEASONS)) {
    const dir = join(ROOT, 'art-sheets', 'towers', 'season', season)
    mkdirSync(dir, { recursive: true })
    for (const st of SEASON_STATES) {
      let t = readFileSync(join(ROOT, 'art-sheets', 'towers', 'single', `${st}.prompt.txt`), 'utf8').replace(/\r\n/g, '\n')
      t = t.replace(GREEN, s.crown)
      const dress = st.endsWith('felled') ? `${s.dress}\n${s.felled}` : s.dress
      t = t.replace(/\nVIEW —/, `\n${dress}\n\nVIEW —`)
      t = t.replace(/the (BLUE|RED) team's tree/, `the $1 team's ${season.toUpperCase()} tree`)
      writeFileSync(join(dir, `${st}.prompt.txt`), t)
    }
    console.log(`${season}: ${SEASON_STATES.length} prompts → ${dir}`)
  }
}
