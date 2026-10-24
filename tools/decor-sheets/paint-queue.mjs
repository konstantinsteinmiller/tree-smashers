#!/usr/bin/env node
/**
 * Paint queue for the floor decor sheet — one text-only Gemini job through
 * tools/art-desk/paint.mjs (cross-process lock + throttle), then pack.mjs.
 *
 *   node tools/decor-sheets/paint-queue.mjs [--force] [--dry] [--no-pack]
 *
 * Prompt → art-sheets/decor-sheets/decor-sheet.prompt.txt; painting →
 * art-sheets/painted/decor-sheet.png (skipped when it exists: re-runs resume).
 * Stops on SIGNED_OUT (10) / QUOTA (11). Log: art-sheets/decor-sheets-queue.log
 */
import { join } from 'node:path'
import { ART, PAINTED, runQueue } from '../sprite-pack/lib.mjs'
import { prompt } from './prompts.mjs'

runQueue({
  tool: 'decor-sheets',
  jobs: [{ name: 'decor-sheet', prompt: prompt(), promptFile: join(ART, 'decor-sheets', 'decor-sheet.prompt.txt'), out: join(PAINTED, 'decor-sheet.png') }]
})
