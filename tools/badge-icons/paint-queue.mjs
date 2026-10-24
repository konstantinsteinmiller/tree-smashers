#!/usr/bin/env node
/**
 * Paint queue for the boss badges, level-up arrow and movie icon — one
 * text-only Gemini job at a time through tools/art-desk/paint.mjs, then pack.mjs.
 *
 *   node tools/badge-icons/paint-queue.mjs [--only movie,level-up] [--force] [--dry] [--no-pack]
 *
 * Prompts → art-sheets/badge-icons/<name>.prompt.txt; paintings →
 * art-sheets/painted/badge-<name>.png (existing ones are skipped: re-runs resume;
 * delete a PNG to re-paint it). Stops on SIGNED_OUT (10) / QUOTA (11).
 * Log: art-sheets/badge-icons-queue.log
 */
import { join } from 'node:path'
import { ART, PAINTED, runQueue } from '../sprite-pack/lib.mjs'
import { ICONS, promptFor } from './prompts.mjs'

runQueue({
  tool: 'badge-icons',
  jobs: Object.keys(ICONS).map(name => ({ name, prompt: promptFor(name), promptFile: join(ART, 'badge-icons', `${name}.prompt.txt`), out: join(PAINTED, `badge-${name}.png`) }))
})
