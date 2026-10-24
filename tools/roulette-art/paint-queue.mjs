#!/usr/bin/env node
/**
 * Paint queue for the roulette wheel parts — text-only Gemini jobs through
 * tools/art-desk/paint.mjs (cross-process lock + throttle), then pack.mjs.
 *
 *   node tools/roulette-art/paint-queue.mjs [--only roulette-rim] [--force] [--dry] [--no-pack]
 *
 * Prompts → art-sheets/roulette-art/<job>.prompt.txt; paintings →
 * art-sheets/painted/<job>.png (an existing painting is skipped: re-runs resume).
 * Stops on SIGNED_OUT (10) / QUOTA (11). Log: art-sheets/roulette-art-queue.log
 */
import { join } from 'node:path'
import { ART, PAINTED, runQueue } from '../sprite-pack/lib.mjs'
import { JOBS } from './prompts.mjs'

runQueue({
  tool: 'roulette-art',
  jobs: Object.entries(JOBS).map(([name, prompt]) => ({ name, prompt, promptFile: join(ART, 'roulette-art', `${name}.prompt.txt`), out: join(PAINTED, `${name}.png`) }))
})
